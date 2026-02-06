# 면접 질문 알림 발송 시스템 구현 가이드

## 개요

사용자의 `notification` 설정(EMAIL/KAKAO/BOTH)에 따라 AI 생성 면접 질문을 이메일 또는 카카오톡으로 발송하는 스케줄링 시스템.

**발송 스케줄:**
- `EVERY`: 월~금 평일 오전 8시 30분
- `WEEKLY`: 월요일 오전 8시 30분

---

## 목차

1. [의존성 설치](#1-의존성-설치)
2. [Application Layer - Port 인터페이스 및 타입](#2-application-layer---port-인터페이스-및-타입)
3. [Application Layer - 서비스 및 스케줄러](#3-application-layer---서비스-및-스케줄러)
4. [Adapter Layer - 이메일 발송](#4-adapter-layer---이메일-발송)
5. [Adapter Layer - 카카오톡 발송](#5-adapter-layer---카카오톡-발송)
6. [Adapter Layer - 수신자 조회](#6-adapter-layer---수신자-조회)
7. [OAuth 토큰 저장 확장](#7-oauth-토큰-저장-확장)
8. [모듈 통합](#8-모듈-통합)
9. [검증 방법](#9-검증-방법)

---

## 아키텍처 결정 사항

### 별도 `notification/` 모듈을 만들지 않는 이유

"면접 질문을 정기적으로 발송한다"는 **Interview Bounded Context의 유스케이스**이다. 현재 알림의 유일한 사용처가 면접 질문 발송이므로, 별도 `application/notification/`이나 `adapter/notification/`을 만드는 것은 조기 추상화이다.

프로젝트 원칙: **패턴이 3회 이상 반복될 때만 유틸리티 생성**

따라서 Port, Service, Scheduler, Adapter 구현체 모두 Interview Bounded Context 안에 둔다. 나중에 다른 Bounded Context(Member, OAuth 등)에서도 알림이 필요해지면 그때 공통 모듈로 추출한다. Port 인터페이스가 이미 분리되어 있으므로 추출 비용이 낮다.

### 최종 디렉토리 구조

```
src/
├── application/interview/
│   ├── interview.service.ts                       # 기존
│   ├── ports/
│   │   ├── ai-question-genrator.port.ts           # 기존
│   │   ├── notification-sender.port.ts            # 신규
│   │   ├── notification-recipient-finder.port.ts  # 신규
│   │   └── index.ts                               # 수정 (re-export 추가)
│   ├── service/
│   │   └── interview-notification.service.ts      # 신규
│   └── scheduler/
│       └── interview-question.scheduler.ts        # 신규
│
└── adapter/interview/
    ├── interview.module.ts                        # 수정 (알림 provider 추가)
    ├── api/
    ├── ai/
    ├── persistence/
    └── notification/                              # 신규 하위 디렉토리
        ├── email-notification.sender.ts
        ├── kakao-notification.sender.ts
        └── notification-recipient-finder.impl.ts
```

---

## 1. 의존성 설치

```bash
npm install @nestjs/schedule
```

---

## 2. Application Layer - Port 인터페이스 및 타입

### 2.1 알림 발송 Port

**파일:** `src/application/interview/ports/notification-sender.port.ts`

```typescript
/**
 * 알림 채널 타입
 */
export type NotificationChannel = "email" | "kakao";

/**
 * 면접 질문 알림 콘텐츠
 */
export interface InterviewQuestionNotification {
  question: string;
  questionTag: string;
  recipientName: string;
}

/**
 * 알림 발송 인터페이스 (Strategy 패턴)
 */
export interface NotificationSender {
  readonly channel: NotificationChannel;

  send(
    recipient: { email?: string; kakaoAccessToken?: string },
    content: InterviewQuestionNotification,
  ): Promise<void>;

  supports(channel: NotificationChannel): boolean;
}

export const NOTIFICATION_SENDER = Symbol("NOTIFICATION_SENDER");
```

### 2.2 수신자 조회 Port

**파일:** `src/application/interview/ports/notification-recipient-finder.port.ts`

```typescript
import { FrequencyEnum, NotificationEnum } from "@/domain/member";

/**
 * 알림 수신자 정보
 * - 여러 Bounded Context(Member, OAuth)를 조합한 Application Layer DTO
 * - domain 레이어가 아닌 이유: 비즈니스 불변식이 없고, 인프라 데이터(kakaoAccessToken)를 포함
 */
export interface NotificationRecipient {
  memberId: string;
  email: string;
  nickname: string;
  job: string;
  notification: NotificationEnum;
  frequency: FrequencyEnum;
  kakaoAccessToken?: string;
}

/**
 * 알림 수신자 조회 인터페이스
 */
export interface NotificationRecipientFinder {
  findEligibleRecipients(
    frequency: FrequencyEnum,
  ): Promise<NotificationRecipient[]>;
}

export const NOTIFICATION_RECIPIENT_FINDER = Symbol(
  "NOTIFICATION_RECIPIENT_FINDER",
);
```

### 2.3 Barrel Export 수정

**파일:** `src/application/interview/ports/index.ts` (수정)

```typescript
export * from "./ai-question-genrator.port";
export * from "./notification-sender.port";
export * from "./notification-recipient-finder.port";
```

---

## 3. Application Layer - 서비스 및 스케줄러

### 3.1 면접 질문 알림 서비스

**파일:** `src/application/interview/service/interview-notification.service.ts`

```typescript
import { Inject, Injectable } from "@nestjs/common";
import { FrequencyEnum, NotificationEnum } from "@/domain/member";
import {
  type InterviewQuestionNotification,
  type NotificationChannel,
  type NotificationRecipient,
  NOTIFICATION_RECIPIENT_FINDER,
  NOTIFICATION_SENDER,
  type NotificationRecipientFinder,
  type NotificationSender,
} from "@/application/interview/ports";
import { InterviewService } from "@/application/interview/interview.service";
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";

@Injectable()
export class InterviewNotificationService {
  constructor(
    @Inject(NOTIFICATION_SENDER)
    private readonly notificationSenders: NotificationSender[],
    @Inject(NOTIFICATION_RECIPIENT_FINDER)
    private readonly recipientFinder: NotificationRecipientFinder,
    private readonly interviewService: InterviewService,
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  /**
   * 일일 면접 질문 발송 (EVERY frequency 대상)
   */
  async sendDailyInterviewQuestions(): Promise<void> {
    const recipients = await this.recipientFinder.findEligibleRecipients(
      FrequencyEnum.EVERY,
    );

    this.logger.log("Starting daily interview notification", {
      module: "InterviewNotificationService",
      recipientCount: recipients.length,
    });

    for (const recipient of recipients) {
      await this.sendToRecipient(recipient);
    }

    this.logger.log("Daily interview notification completed", {
      module: "InterviewNotificationService",
    });
  }

  /**
   * 주간 면접 질문 발송 (WEEKLY frequency 대상)
   */
  async sendWeeklyInterviewQuestions(): Promise<void> {
    const recipients = await this.recipientFinder.findEligibleRecipients(
      FrequencyEnum.WEEKLY,
    );

    this.logger.log("Starting weekly interview notification", {
      module: "InterviewNotificationService",
      recipientCount: recipients.length,
    });

    for (const recipient of recipients) {
      await this.sendToRecipient(recipient);
    }

    this.logger.log("Weekly interview notification completed", {
      module: "InterviewNotificationService",
    });
  }

  /**
   * 개별 수신자에게 알림 발송
   */
  private async sendToRecipient(recipient: NotificationRecipient): Promise<void> {
    try {
      // 1. AI로 면접 질문 생성
      const [question] = await this.interviewService.generateQuestion(
        recipient.memberId,
        recipient.job,
        1,
      );

      // 2. 알림 콘텐츠 구성
      const content: InterviewQuestionNotification = {
        question: question.question,
        questionTag: question.questionTag,
        recipientName: recipient.nickname,
      };

      // 3. notification 설정에 따라 발송
      await this.sendByNotificationPreference(recipient, content);

      this.logger.log("Notification sent successfully", {
        module: "InterviewNotificationService",
        memberId: recipient.memberId,
        notification: recipient.notification,
      });
    } catch (error) {
      // 개별 실패는 전체 프로세스를 중단하지 않음
      this.logger.error("Failed to send notification", error as Error, {
        module: "InterviewNotificationService",
        memberId: recipient.memberId,
      });
    }
  }

  /**
   * NotificationEnum에 따라 적절한 채널로 발송
   */
  private async sendByNotificationPreference(
    recipient: NotificationRecipient,
    content: InterviewQuestionNotification,
  ): Promise<void> {
    const channelsToSend = this.getChannelsToSend(recipient.notification);

    const sendPromises = channelsToSend.map((channel) => {
      const sender = this.notificationSenders.find((s) => s.supports(channel));

      if (!sender) {
        this.logger.warn(`No sender found for channel: ${channel}`, {
          module: "InterviewNotificationService",
        });
        return Promise.resolve();
      }

      return sender.send(
        {
          email: recipient.email,
          kakaoAccessToken: recipient.kakaoAccessToken,
        },
        content,
      );
    });

    // 병렬 발송, 개별 실패 허용
    await Promise.allSettled(sendPromises);
  }

  /**
   * NotificationEnum을 채널 목록으로 변환
   */
  private getChannelsToSend(
    notification: NotificationEnum,
  ): NotificationChannel[] {
    switch (notification) {
      case NotificationEnum.EMAIL:
        return ["email"];
      case NotificationEnum.KAKAO:
        return ["kakao"];
      case NotificationEnum.BOTH:
        return ["email", "kakao"];
      default:
        return [];
    }
  }
}
```

### 3.2 스케줄러

**파일:** `src/application/interview/scheduler/interview-question.scheduler.ts`

```typescript
import { Inject, Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InterviewNotificationService } from "../service/interview-notification.service";
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";

@Injectable()
export class InterviewQuestionScheduler {
  constructor(
    private readonly notificationService: InterviewNotificationService,
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  /**
   * EVERY frequency 대상: 월~금 오전 8시 30분
   * Cron: 초 분 시 일 월 요일
   * 1-5 = 월~금 (0=일요일, 6=토요일)
   */
  @Cron("0 30 8 * * 1-5", {
    name: "daily-interview-questions",
    timeZone: "Asia/Seoul",
  })
  async handleDailyNotification(): Promise<void> {
    this.logger.log("Daily interview question scheduler triggered", {
      module: "InterviewQuestionScheduler",
      timestamp: new Date().toISOString(),
    });

    try {
      await this.notificationService.sendDailyInterviewQuestions();
    } catch (error) {
      this.logger.error("Daily notification scheduler failed", error as Error, {
        module: "InterviewQuestionScheduler",
      });
    }
  }

  /**
   * WEEKLY frequency 대상: 월요일 오전 8시 30분
   * 1 = 월요일
   */
  @Cron("0 30 8 * * 1", {
    name: "weekly-interview-questions",
    timeZone: "Asia/Seoul",
  })
  async handleWeeklyNotification(): Promise<void> {
    this.logger.log("Weekly interview question scheduler triggered", {
      module: "InterviewQuestionScheduler",
      timestamp: new Date().toISOString(),
    });

    try {
      await this.notificationService.sendWeeklyInterviewQuestions();
    } catch (error) {
      this.logger.error("Weekly notification scheduler failed", error as Error, {
        module: "InterviewQuestionScheduler",
      });
    }
  }
}
```

---

## 4. Adapter Layer - 이메일 발송

**파일:** `src/adapter/interview/notification/email-notification.sender.ts`

```typescript
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createTransport, Transporter } from "nodemailer";
import {
  type NotificationSender,
  type InterviewQuestionNotification,
  type NotificationChannel,
} from "@/application/interview/ports";
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";

@Injectable()
export class EmailNotificationSender implements NotificationSender {
  readonly channel: NotificationChannel = "email";
  private transporter: Transporter;

  constructor(
    private readonly configService: ConfigService,
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {
    this.transporter = createTransport({
      host: this.configService.get("SMTP_HOST", "smtp.gmail.com"),
      port: this.configService.get("SMTP_PORT", 587),
      secure: false,
      auth: {
        user: this.configService.get("SMTP_USER"),
        pass: this.configService.get("SMTP_PASS"),
      },
    });
  }

  supports(channel: NotificationChannel): boolean {
    return channel === "email";
  }

  async send(
    recipient: { email?: string },
    content: InterviewQuestionNotification,
  ): Promise<void> {
    if (!recipient.email) {
      throw new Error("Email is required for email notification");
    }

    await this.transporter.sendMail({
      from: this.configService.get("SMTP_FROM", "noreply@prepair.com"),
      to: recipient.email,
      subject: "[PrePair] 오늘의 면접 질문이 도착했어요!",
      html: this.buildEmailTemplate(content),
    });

    this.logger.log("Email notification sent", {
      module: "EmailNotificationSender",
      email: recipient.email,
    });
  }

  /**
   * 면접 질문 이메일 HTML 템플릿
   */
  private buildEmailTemplate(content: InterviewQuestionNotification): string {
    return `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background-color:#f6f8fa;">
  <table width="100%" cellpadding="0" cellspacing="0" style="font-family: 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif; background-color:#f6f8fa; padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:12px; padding:40px; box-shadow:0 4px 12px rgba(0,0,0,0.05);">
          <!-- 로고 -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <img src="https://prepair.wisoft.dev/assets/logo-EOf_Dr2C.png" alt="PrePair" width="120" />
            </td>
          </tr>

          <!-- 인사말 -->
          <tr>
            <td align="center" style="font-size:24px; font-weight:700; color:#1a1a1a; padding-bottom:8px;">
              ${content.recipientName}님, 오늘의 면접 질문이에요!
            </td>
          </tr>

          <tr>
            <td align="center" style="font-size:14px; color:#666666; padding-bottom:32px;">
              매일 꾸준히 면접 준비하는 당신을 응원합니다 :)
            </td>
          </tr>

          <!-- 질문 카드 -->
          <tr>
            <td style="padding:24px; background:linear-gradient(135deg, #f0f4ff 0%, #e8f0fe 100%); border-radius:12px;">
              <!-- 태그 -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom:16px;">
                    <span style="display:inline-block; background:#405173; color:white; padding:6px 16px; border-radius:20px; font-size:13px; font-weight:600;">
                      #${content.questionTag}
                    </span>
                  </td>
                </tr>
              </table>

              <!-- 질문 -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="font-size:18px; color:#1a1a1a; line-height:1.7; padding:0 16px;">
                    "${content.question}"
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA 버튼 -->
          <tr>
            <td align="center" style="padding-top:32px;">
              <a href="https://prepair.wisoft.dev"
                 style="display:inline-block; background:#405173; color:white; padding:14px 32px; border-radius:8px; text-decoration:none; font-weight:600; font-size:16px;">
                답변하러 가기
              </a>
            </td>
          </tr>

          <!-- 푸터 -->
          <tr>
            <td align="center" style="padding-top:40px; font-size:12px; color:#999999;">
              이 메일은 PrePair 알림 설정에 따라 발송되었습니다.<br/>
              알림 설정은 마이페이지에서 변경할 수 있습니다.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
  }
}
```

---

## 5. Adapter Layer - 카카오톡 발송

**파일:** `src/adapter/interview/notification/kakao-notification.sender.ts`

```typescript
import { Inject, Injectable } from "@nestjs/common";
import {
  type NotificationSender,
  type InterviewQuestionNotification,
  type NotificationChannel,
} from "@/application/interview/ports";
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";

@Injectable()
export class KakaoNotificationSender implements NotificationSender {
  readonly channel: NotificationChannel = "kakao";

  constructor(
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  supports(channel: NotificationChannel): boolean {
    return channel === "kakao";
  }

  async send(
    recipient: { kakaoAccessToken?: string },
    content: InterviewQuestionNotification,
  ): Promise<void> {
    if (!recipient.kakaoAccessToken) {
      this.logger.warn("Kakao access token not available, skipping", {
        module: "KakaoNotificationSender",
      });
      return;
    }

    // 카카오톡 나에게 보내기 API
    // https://developers.kakao.com/docs/latest/ko/message/rest-api#default-template-msg-me
    const response = await fetch(
      "https://kapi.kakao.com/v2/api/talk/memo/default/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${recipient.kakaoAccessToken}`,
          "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
        },
        body: new URLSearchParams({
          template_object: JSON.stringify(this.buildFeedTemplate(content)),
        }),
      },
    );

    if (!response.ok) {
      const error = await response.json();

      // 토큰 만료 등의 에러 처리
      if (error.code === -401) {
        this.logger.warn("Kakao token expired", {
          module: "KakaoNotificationSender",
          errorCode: error.code,
        });
        // TODO: 토큰 갱신 로직 또는 사용자에게 재연동 안내
        return;
      }

      this.logger.error(
        "Kakao notification failed",
        new Error(JSON.stringify(error)),
        {
          module: "KakaoNotificationSender",
          errorCode: error.code,
        },
      );
      throw new Error(`Kakao notification failed: ${error.msg}`);
    }

    this.logger.log("Kakao notification sent", {
      module: "KakaoNotificationSender",
    });
  }

  /**
   * 카카오톡 Feed 템플릿 구성
   * @see https://developers.kakao.com/docs/latest/ko/message/message-template#feed
   */
  private buildFeedTemplate(content: InterviewQuestionNotification) {
    return {
      object_type: "feed",
      content: {
        title: `${content.recipientName}님, 오늘의 면접 질문`,
        description: content.question,
        image_url: "https://prepair.wisoft.dev/assets/logo-EOf_Dr2C.png",
        image_width: 200,
        image_height: 200,
        link: {
          web_url: "https://prepair.wisoft.dev",
          mobile_web_url: "https://prepair.wisoft.dev",
        },
      },
      buttons: [
        {
          title: "답변하러 가기",
          link: {
            web_url: "https://prepair.wisoft.dev",
            mobile_web_url: "https://prepair.wisoft.dev",
          },
        },
      ],
    };
  }
}
```

**카카오 개발자 콘솔 설정 필요:**
1. 내 애플리케이션 > 카카오 로그인 > 동의항목
2. `talk_message` (카카오톡 메시지 전송) 추가

---

## 6. Adapter Layer - 수신자 조회

**파일:** `src/adapter/interview/notification/notification-recipient-finder.impl.ts`

```typescript
import { Injectable } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/core";
import {
  type NotificationRecipientFinder,
  type NotificationRecipient,
} from "@/application/interview/ports";
import { FrequencyEnum } from "@/domain/member";
import { MemberReadEntity } from "@/adapter/member/persistence/read/entity/member-read.entity";
import { OAuthConnectionEntity } from "@/adapter/oauth/persistence/entity/oauth.entity";

@Injectable()
export class NotificationRecipientFinderImpl
  implements NotificationRecipientFinder
{
  constructor(private readonly em: EntityManager) {}

  async findEligibleRecipients(
    frequency: FrequencyEnum,
  ): Promise<NotificationRecipient[]> {
    // 1. 해당 frequency의 알림 설정이 활성화된 사용자 조회
    const members = await this.em.find(MemberReadEntity, {
      frequency,
    });

    if (members.length === 0) {
      return [];
    }

    // 2. 카카오 연결 정보 조회 (카카오 알림 대상자용)
    const memberIds = members.map((m) => m.id);
    const kakaoConnections = await this.em.find(OAuthConnectionEntity, {
      memberId: { $in: memberIds },
      provider: "kakao",
    });

    // memberId -> OAuthConnection 매핑
    const kakaoConnectionMap = new Map(
      kakaoConnections.map((c) => [c.memberId, c]),
    );

    // 3. NotificationRecipient 객체로 변환
    return members.map((member) => {
      const kakaoConnection = kakaoConnectionMap.get(member.id);

      return {
        memberId: member.id,
        email: member.email,
        nickname: member.nickname,
        job: member.job,
        notification: member.notification,
        frequency: member.frequency,
        // 카카오 연결이 있고 토큰이 저장되어 있으면 포함
        kakaoAccessToken: kakaoConnection?.accessToken,
      };
    });
  }
}
```

---

## 7. OAuth 토큰 저장 확장

카카오톡 메시지 발송을 위해 OAuth 토큰을 저장해야 합니다.

**설계 원칙:** OAuth 토큰은 인프라 관심사(외부 API 호출용)이므로 `OAuthConnection` 도메인 모델에는 추가하지 않는다. 토큰 필드는 Persistence Entity(`OAuthConnectionEntity`)에만 추가하고, Repository 인터페이스에 `updateTokens` 메서드를 추가하여 처리한다.

### 7.1 OAuthConnectionEntity 확장

**파일:** `src/adapter/oauth/persistence/entity/oauth.entity.ts` (수정)

```typescript
import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

@Entity({ tableName: "oauth_connections" })
export class OAuthConnectionEntity {
  @PrimaryKey({ type: "uuid" })
  id!: string;

  @Property({ type: "uuid" })
  memberId!: string;

  @Property()
  provider!: string;

  @Property()
  providerId!: string;

  @Property()
  email!: string;

  @Property()
  connectedAt!: Date;

  // ===== 추가할 필드들 (인프라 관심사 - 도메인 모델에는 추가하지 않음) =====

  @Property({ nullable: true })
  accessToken?: string;

  @Property({ nullable: true })
  refreshToken?: string;

  @Property({ nullable: true })
  tokenExpiresAt?: Date;
}
```

### 7.2 OauthRepository 인터페이스 확장

**파일:** `src/domain/oauth/oauth.repository.ts` (수정)

```typescript
import { OAuthConnection } from "@/domain/oauth/oauth";
import { OAuthProvider } from "@/domain/oauth/types";

export interface OauthRepository {
  save(connection: OAuthConnection): OAuthConnection;

  findByProviderAndProviderId(
    provider: OAuthProvider,
    providerId: string,
  ): Promise<OAuthConnection | null>;

  findByMemberIdAndProvider(
    memberId: string,
    provider: OAuthProvider,
  ): Promise<OAuthConnection | null>;

  findByMemberId(memberId: string): Promise<OAuthConnection[]>;

  disconnect(id: string): Promise<void>;

  disconnectAllByMemberId(memberId: string): Promise<void>;

  // 추가: OAuth 토큰 업데이트 (카카오톡 알림 발송용)
  updateTokens(
    connectionId: string,
    tokens: {
      accessToken: string;
      refreshToken?: string;
      tokenExpiresAt: Date;
    },
  ): Promise<void>;
}

export const OAUTH_REPOSITORY = Symbol("OauthRepository");
```

> **참고:** `updateTokens`는 도메인 Repository 인터페이스에 정의하지만, 토큰 데이터 자체는 `OAuthConnectionType`이나 `OAuthConnection` 도메인 모델에 추가하지 않는다. Repository는 도메인이 외부 인프라에 요구하는 계약(Port)이며, 토큰 저장은 그 계약의 일부일 뿐이다.

### 7.3 OAuthRepositoryImpl에 updateTokens 구현 추가

**파일:** `src/adapter/oauth/persistence/oauth.repository-impl.ts` (수정)

```typescript
// 기존 메서드들 아래에 추가
async updateTokens(
  connectionId: string,
  tokens: {
    accessToken: string;
    refreshToken?: string;
    tokenExpiresAt: Date;
  },
): Promise<void> {
  const entity = await this.em.findOneOrFail(OAuthConnectionEntity, {
    id: connectionId,
  });

  entity.accessToken = tokens.accessToken;
  entity.refreshToken = tokens.refreshToken;
  entity.tokenExpiresAt = tokens.tokenExpiresAt;
}
```

### 7.4 MikroORM 마이그레이션

```bash
# 마이그레이션 생성
npx mikro-orm migration:create

# 마이그레이션 실행
npx mikro-orm migration:up
```

생성된 마이그레이션 파일 예시:

```typescript
import { Migration } from '@mikro-orm/migrations';

export class Migration20240101000000 extends Migration {
  async up(): Promise<void> {
    this.addSql('ALTER TABLE "oauth_connections" ADD COLUMN "access_token" VARCHAR(255);');
    this.addSql('ALTER TABLE "oauth_connections" ADD COLUMN "refresh_token" VARCHAR(255);');
    this.addSql('ALTER TABLE "oauth_connections" ADD COLUMN "token_expires_at" TIMESTAMPTZ;');
  }

  async down(): Promise<void> {
    this.addSql('ALTER TABLE "oauth_connections" DROP COLUMN "access_token";');
    this.addSql('ALTER TABLE "oauth_connections" DROP COLUMN "refresh_token";');
    this.addSql('ALTER TABLE "oauth_connections" DROP COLUMN "token_expires_at";');
  }
}
```

### 7.5 KakaOauthService 토큰 저장 로직 추가

**파일:** `src/application/oauth/kaka-oauth.service.ts` (수정)

`handleCallback()`, `connectOAuthToExistingMember()`, `linkToExistingMember()` 메서드에서 토큰 저장:

```typescript
async handleCallback(code: string) {
  const tokens: OAuthTokenResponse =
    await this.oauthProvider.exchangeCodeForAccessToken(code);

  const userInfo: OAuthUserInfo = await this.oauthProvider.getUserInfo(
    tokens.accessToken,
  );

  const { providerId, email, nickname } = userInfo;

  // Case 1: 기존 OAuth 연결이 있는 경우 → 토큰 업데이트 후 로그인
  const existingConnection: OAuthConnection | null =
    await this.oauthConnectionRepository.findByProviderAndProviderId(
      "kakao",
      providerId,
    );

  if (existingConnection) {
    // ===== 토큰 업데이트 추가 =====
    await this.oauthConnectionRepository.updateTokens(existingConnection.id, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
    });
    return this.loginExistingMember(existingConnection.memberId);
  }

  // Case 2: 동일 이메일로 가입된 일반 회원이 있는 경우
  const existingMember: Member | null =
    await this.memberRepository.findByEmail(email);

  if (existingMember) {
    // ===== 토큰과 함께 연결 =====
    await this.connectOAuthToExistingMember(
      existingMember,
      providerId,
      email,
      tokens,
    );
    return this.loginExistingMember(existingMember.id);
  }

  // Case 3: 신규 회원 (기존 로직 유지)
  // ...
}

/**
 * 기존 회원에 OAuth 연결 (토큰 포함)
 * - 도메인 모델(OAuthConnection)은 토큰 없이 생성
 * - 토큰은 별도로 Repository에 저장 (인프라 관심사 분리)
 */
private async connectOAuthToExistingMember(
  member: Member,
  providerId: string,
  email: string,
  tokens: OAuthTokenResponse,
): Promise<void> {
  // 1. 도메인 모델 생성 (토큰 없이 - 도메인은 토큰을 알 필요 없음)
  const connection: OAuthConnection = OAuthConnection.connect({
    memberId: member.id,
    provider: "kakao",
    providerId,
    email,
  });

  // 2. 연결 저장
  this.oauthConnectionRepository.save(connection);

  // 3. 토큰 별도 저장 (인프라 관심사)
  await this.oauthConnectionRepository.updateTokens(connection.id, {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
  });
}
```

`linkToExistingMember()` 메서드에도 동일하게 토큰 저장 추가:

```typescript
async linkToExistingMember(memberId: string, code: string) {
  const tokens: OAuthTokenResponse =
    await this.oauthProvider.exchangeCodeForAccessToken(code);

  // ... 기존 검증 로직 ...

  const connection: OAuthConnection = OAuthConnection.connect({
    memberId,
    provider: "kakao",
    providerId: userInfo.providerId,
    email: userInfo.email,
  });

  this.oauthConnectionRepository.save(connection);

  // ===== 토큰 저장 추가 =====
  await this.oauthConnectionRepository.updateTokens(connection.id, {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
  });

  await this.em.flush();

  // ... 이하 기존 로직 ...
}
```

---

## 8. 모듈 통합

### 8.1 InterviewModule 수정 (알림 기능 통합)

**파일:** `src/adapter/interview/interview.module.ts` (수정)

별도 `NotificationModule` 없이, `InterviewModule`에 알림 관련 provider를 모두 통합:

```typescript
import { Module } from "@nestjs/common";
import { InterviewController } from "@/adapter/interview/api/interview.controller";
import { InterviewService } from "@/application/interview/interview.service";
import { INTERVIEW_QUESTION_REPOSITORY } from "@/domain/interview/question";
import { InterviewQuestionPrismaRepository } from "@/adapter/interview/persistence/interview-question-prisma.repository";
import {
  AI_QUESTION_GENERATOR,
  NOTIFICATION_SENDER,
  NOTIFICATION_RECIPIENT_FINDER,
} from "@/application/interview/ports";
import { OpenaiQuestionGeneratorService } from "@/adapter/interview/ai/openai-question-generator.service";
import { InterviewNotificationService } from "@/application/interview/service/interview-notification.service";
import { InterviewQuestionScheduler } from "@/application/interview/scheduler/interview-question.scheduler";
import { EmailNotificationSender } from "@/adapter/interview/notification/email-notification.sender";
import { KakaoNotificationSender } from "@/adapter/interview/notification/kakao-notification.sender";
import { NotificationRecipientFinderImpl } from "@/adapter/interview/notification/notification-recipient-finder.impl";

@Module({
  controllers: [InterviewController],
  providers: [
    // 기존
    InterviewService,
    {
      provide: INTERVIEW_QUESTION_REPOSITORY,
      useClass: InterviewQuestionPrismaRepository,
    },
    {
      provide: AI_QUESTION_GENERATOR,
      useClass: OpenaiQuestionGeneratorService,
    },

    // 알림 서비스 및 스케줄러
    InterviewNotificationService,
    InterviewQuestionScheduler,

    // 발송 채널 구현체
    EmailNotificationSender,
    KakaoNotificationSender,

    // NOTIFICATION_SENDER: 배열로 주입
    {
      provide: NOTIFICATION_SENDER,
      useFactory: (
        emailSender: EmailNotificationSender,
        kakaoSender: KakaoNotificationSender,
      ) => [emailSender, kakaoSender],
      inject: [EmailNotificationSender, KakaoNotificationSender],
    },

    // 수신자 조회
    {
      provide: NOTIFICATION_RECIPIENT_FINDER,
      useClass: NotificationRecipientFinderImpl,
    },
  ],
})
export class InterviewModule {}
```

### 8.2 AppModule 수정

**파일:** `src/app.module.ts` (수정)

```typescript
import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { MemberModule } from "@/adapter/member/member.module";
import { PersistenceModule } from "@/adapter/member/persistence/persistence.module";
import { ConfigModule } from "@nestjs/config";
import { envSchema } from "@/config/env.config";
import { CqrsModule } from "@nestjs/cqrs";
import { AuthModule } from "@/adapter/auth/auth.module";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { TransformResponseInterceptor } from "@/adapter/shared/api/interceptors/transform-response.interceptor";
import { JwtAuthGuard } from "@/adapter/auth/security";
import { OAuthModule } from "@/adapter/oauth/oauth.module";
import { LoggerModule } from "@/adapter/shared/logger/logger.module";
import { CorrelationIdMiddleware } from "@/adapter/shared/middleware/correlation-id.middleware";
import { HealthController } from "@/adapter/shared/api/health.controller";
import { InterviewModule } from "@/adapter/interview/interview.module";
import { PrismaModule } from "@/adapter/shared/prisma";
import { ScheduleModule } from "@nestjs/schedule"; // 추가

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config: Record<string, any>) => envSchema.parse(config),
    }),
    CqrsModule.forRoot(),
    ScheduleModule.forRoot(), // 추가: forRoot()는 AppModule에서 한 번만 호출
    PersistenceModule,
    MemberModule,
    AuthModule,
    OAuthModule,
    LoggerModule,
    InterviewModule,
    PrismaModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformResponseInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes("*");
  }
}
```

---

## 9. 검증 방법

### 9.1 수동 트리거 테스트

개발 환경에서 스케줄러를 수동으로 트리거하여 테스트:

```typescript
// 테스트용 컨트롤러 (개발 환경에서만 사용)
@Controller("api/test/notification")
export class NotificationTestController {
  constructor(
    private readonly scheduler: InterviewQuestionScheduler,
  ) {}

  @Post("trigger-daily")
  async triggerDaily() {
    await this.scheduler.handleDailyNotification();
    return { success: true };
  }

  @Post("trigger-weekly")
  async triggerWeekly() {
    await this.scheduler.handleWeeklyNotification();
    return { success: true };
  }
}
```

### 9.2 단위 테스트

**파일:** `src/application/interview/service/interview-notification.service.spec.ts`

```typescript
import { Test, TestingModule } from "@nestjs/testing";
import { InterviewNotificationService } from "./interview-notification.service";
import {
  NOTIFICATION_SENDER,
  NOTIFICATION_RECIPIENT_FINDER,
  type NotificationSender,
  type NotificationRecipientFinder,
} from "../ports";
import { InterviewService } from "@/application/interview/interview.service";
import { LOGGER } from "@/adapter/shared/logger/logger.inferface";
import { NotificationEnum, FrequencyEnum } from "@/domain/member";

describe("InterviewNotificationService", () => {
  let service: InterviewNotificationService;
  let mockEmailSender: jest.Mocked<NotificationSender>;
  let mockKakaoSender: jest.Mocked<NotificationSender>;
  let mockRecipientFinder: jest.Mocked<NotificationRecipientFinder>;
  let mockInterviewService: jest.Mocked<Pick<InterviewService, "generateQuestion">>;

  beforeEach(async () => {
    mockEmailSender = {
      channel: "email",
      supports: jest.fn((c) => c === "email"),
      send: jest.fn(),
    };

    mockKakaoSender = {
      channel: "kakao",
      supports: jest.fn((c) => c === "kakao"),
      send: jest.fn(),
    };

    mockRecipientFinder = {
      findEligibleRecipients: jest.fn(),
    };

    mockInterviewService = {
      generateQuestion: jest.fn().mockResolvedValue([
        { question: "테스트 질문", questionTag: "기술" },
      ]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InterviewNotificationService,
        {
          provide: NOTIFICATION_SENDER,
          useValue: [mockEmailSender, mockKakaoSender],
        },
        {
          provide: NOTIFICATION_RECIPIENT_FINDER,
          useValue: mockRecipientFinder,
        },
        {
          provide: InterviewService,
          useValue: mockInterviewService,
        },
        {
          provide: LOGGER,
          useValue: { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<InterviewNotificationService>(
      InterviewNotificationService,
    );
  });

  it("EMAIL 설정 시 이메일만 발송", async () => {
    mockRecipientFinder.findEligibleRecipients.mockResolvedValue([
      {
        memberId: "1",
        email: "test@test.com",
        nickname: "테스트",
        job: "개발자",
        notification: NotificationEnum.EMAIL,
        frequency: FrequencyEnum.EVERY,
      },
    ]);

    await service.sendDailyInterviewQuestions();

    expect(mockEmailSender.send).toHaveBeenCalled();
    expect(mockKakaoSender.send).not.toHaveBeenCalled();
  });

  it("BOTH 설정 시 이메일과 카카오톡 모두 발송", async () => {
    mockRecipientFinder.findEligibleRecipients.mockResolvedValue([
      {
        memberId: "1",
        email: "test@test.com",
        nickname: "테스트",
        job: "개발자",
        notification: NotificationEnum.BOTH,
        frequency: FrequencyEnum.EVERY,
        kakaoAccessToken: "valid-token",
      },
    ]);

    await service.sendDailyInterviewQuestions();

    expect(mockEmailSender.send).toHaveBeenCalled();
    expect(mockKakaoSender.send).toHaveBeenCalled();
  });
});
```

---

## 파일 체크리스트

### 신규 생성 파일

- [ ] `src/application/interview/ports/notification-sender.port.ts`
- [ ] `src/application/interview/ports/notification-recipient-finder.port.ts`
- [ ] `src/application/interview/service/interview-notification.service.ts`
- [ ] `src/application/interview/scheduler/interview-question.scheduler.ts`
- [ ] `src/adapter/interview/notification/email-notification.sender.ts`
- [ ] `src/adapter/interview/notification/kakao-notification.sender.ts`
- [ ] `src/adapter/interview/notification/notification-recipient-finder.impl.ts`

### 수정 파일

- [ ] `src/application/interview/ports/index.ts` - 신규 port re-export 추가
- [ ] `src/adapter/interview/interview.module.ts` - 알림 관련 provider 통합
- [ ] `src/app.module.ts` - `ScheduleModule.forRoot()` 추가
- [ ] `src/adapter/oauth/persistence/entity/oauth.entity.ts` - 토큰 필드 추가
- [ ] `src/domain/oauth/oauth.repository.ts` - `updateTokens` 메서드 추가
- [ ] `src/adapter/oauth/persistence/oauth.repository-impl.ts` - `updateTokens` 구현
- [ ] `src/application/oauth/kaka-oauth.service.ts` - 토큰 저장 로직

### 변경하지 않는 파일 (의도적)

- `src/domain/oauth/oauth.ts` - 도메인 모델에 토큰 필드 추가하지 않음
- `src/domain/oauth/types/oauth.types.ts` - `OAuthConnectionType`, `ConnectOAuthRequest` 변경 없음

### 추출 시점 가이드

다음 조건이 생기면 `notification/`을 공통 모듈로 추출:
- 2개 이상의 Bounded Context가 동일한 발송 인프라를 공유할 때
- 예: Member 비밀번호 변경 알림, OAuth 재연동 안내 등

추출 대상: `NotificationSender` Port + Email/Kakao Sender 구현체 → `adapter/shared/notification/` 또는 별도 `adapter/notification/`

### 명령어

```bash
# 1. 의존성 설치
npm install @nestjs/schedule

# 2. 마이그레이션 생성 및 실행
npx mikro-orm migration:create
npx mikro-orm migration:up

# 3. 테스트 실행
npm test -- interview-notification

# 4. 개발 서버 실행
npm run start:dev
```

---

## 참고 자료

- [NestJS Task Scheduling](https://docs.nestjs.com/techniques/task-scheduling)
- [카카오톡 나에게 보내기 API](https://developers.kakao.com/docs/latest/ko/message/rest-api#default-template-msg-me)
- [Cron Expression](https://crontab.guru/)
