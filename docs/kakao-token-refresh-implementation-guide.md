# 카카오 토큰 갱신 + 이메일 폴백 구현 가이드

## Context

카카오 OAuth로 가입한 사용자에게 면접 질문 알림을 카카오톡으로 발송할 때, access token이 만료(~6시간)되면 알림 발송이 실패한다. 현재는 `-401` 에러를 로그만 남기고 무시하여 **사용자가 알림을 못 받는 문제**가 있다.

DB에 `refreshToken`(~2개월 유효)이 이미 저장되어 있지만 사용되지 않고 있다. 이를 활용하여:
1. 토큰 갱신 시도 → 성공 시 재발송
2. 갱신 실패 시 이메일로 폴백

**아키텍처 결정:** 토큰 갱신은 인프라 관심사이므로 **도메인 모델 변경 없이 adapter 계층에서만 처리**한다.

---

## 구현 순서

### Step 1. `OAuthProvider` 포트에 `refreshAccessToken()` 추가

**파일:** `src/application/oauth/ports/oauth-provider.port.ts`

```typescript
export interface OAuthProvider {
  exchangeCodeForAccessToken(code: string): Promise<OAuthTokenResponse>;
  getUserInfo(accessToken: string): Promise<OAuthUserInfo>;
  unlink(accessToken: string): Promise<void>;
  refreshAccessToken(refreshToken: string): Promise<OAuthTokenResponse>;  // 추가
}
```

---

### Step 2. 카카오 토큰 갱신 응답 타입 추가

**파일:** `src/adapter/oauth/kakao/types/kakao-oauth.types.ts`

카카오 토큰 갱신 API는 refresh token 잔여 기간이 1개월 미만일 때만 새 `refresh_token`을 반환한다.

```typescript
export interface KakaoTokenRefreshResponse {
  token_type: "bearer";
  access_token: string;
  expires_in: number;
  refresh_token?: string;            // 1개월 미만일 때만 반환
  refresh_token_expires_in?: number;  // 1개월 미만일 때만 반환
}
```

---

### Step 3. `KakaoOAuthProvider`에 `refreshAccessToken()` 구현

**파일:** `src/adapter/oauth/kakao/kakao-oauth-provider.service.ts`

```typescript
async refreshAccessToken(refreshToken: string): Promise<OAuthTokenResponse> {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: this.clientId,
    client_secret: this.clientSecret,
    refresh_token: refreshToken,
  });

  const response = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
    body: params,
  });

  if (!response.ok) {
    const error = (await response.json()) as {
      error: string;
      error_description: string;
    };
    throw new UnauthorizedException(
      `카카오 토큰 갱신 실패: ${error.error_description}`,
    );
  }

  const kakaoTokens = (await response.json()) as KakaoTokenRefreshResponse;

  return {
    accessToken: kakaoTokens.access_token,
    refreshToken: kakaoTokens.refresh_token,  // undefined일 수 있음
    expiresIn: kakaoTokens.expires_in,
  };
}
```

---

### Step 4. `NotificationRecipient`에 refresh token 정보 추가

**파일:** `src/application/interview/ports/notification-recipient-finder.port.ts`

```typescript
export interface NotificationRecipient {
  memberId: string;
  email: string;
  nickname: string;
  job: string;
  notification: NotificationEnum;
  frequency: FrequencyEnum;
  kakaoAccessToken?: string;
  kakaoRefreshToken?: string;    // 추가
  kakaoConnectionId?: string;    // 추가 - updateTokens() 호출에 필요
}
```

---

### Step 5. `NotificationSender` 포트의 recipient 타입 확장

**파일:** `src/application/interview/ports/notification-sender.port.ts`

```typescript
export interface NotificationSender {
  readonly channel: NotificationChannel;

  send(
    recipient: {
      email?: string;
      kakaoAccessToken?: string;
      kakaoRefreshToken?: string;    // 추가
      kakaoConnectionId?: string;    // 추가
    },
    content: InterviewQuestionNotification,
  ): Promise<void>;

  supports(channel: NotificationChannel): boolean;
}
```

---

### Step 6. `NotificationRecipientFinderImpl`에서 추가 필드 매핑

**파일:** `src/adapter/interview/notification/notification-recipient-finder.impl.ts`

`findEligibleRecipients()` 반환값에 2개 필드 추가:

```typescript
return {
  memberId: member.id,
  email: member.email,
  nickname: member.nickname,
  job: member.job,
  notification: member.notification,
  frequency: member.frequency,
  kakaoAccessToken: kakaoConnection?.accessToken,
  kakaoRefreshToken: kakaoConnection?.refreshToken,  // 추가
  kakaoConnectionId: kakaoConnection?.id,            // 추가
};
```

---

### Step 7. `KakaoTokenRefresher` 포트 생성

**새 파일:** `src/application/interview/ports/kakao-token-refresher.port.ts`

Interview 바운디드 컨텍스트에서 OAuth 바운디드 컨텍스트의 토큰 갱신 기능에 접근하기 위한 포트.

```typescript
export interface KakaoTokenRefreshResult {
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt: Date;
}

export interface KakaoTokenRefresher {
  refreshToken(
    connectionId: string,
    refreshToken: string,
  ): Promise<KakaoTokenRefreshResult>;
}

export const KAKAO_TOKEN_REFRESHER = Symbol("KAKAO_TOKEN_REFRESHER");
```

**`src/application/interview/ports/index.ts`에 export 추가:**
```typescript
export * from "./kakao-token-refresher.port";
```

---

### Step 8. `KakaoTokenRefresherImpl` 어댑터 구현

**새 파일:** `src/adapter/interview/notification/kakao-token-refresher.impl.ts`

OAuth 모듈의 `KakaoOAuthProvider`와 `OauthRepository`를 조합하여 토큰 갱신 + DB 저장을 수행.

```typescript
@Injectable()
export class KakaoTokenRefresherImpl implements KakaoTokenRefresher {
  constructor(
    @Inject(KAKAO_OAUTH_PROVIDER)
    private readonly kakaoProvider: OAuthProvider,
    @Inject(OAUTH_REPOSITORY)
    private readonly oauthRepository: OauthRepository,
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  async refreshToken(
    connectionId: string,
    refreshToken: string,
  ): Promise<KakaoTokenRefreshResult> {
    const tokenResponse = await this.kakaoProvider.refreshAccessToken(refreshToken);
    const tokenExpiresAt = new Date(Date.now() + tokenResponse.expiresIn * 1000);

    await this.oauthRepository.updateTokens(connectionId, {
      accessToken: tokenResponse.accessToken,
      refreshToken: tokenResponse.refreshToken ?? refreshToken,  // 새 RT 없으면 기존 유지
      tokenExpiresAt,
    });

    return {
      accessToken: tokenResponse.accessToken,
      refreshToken: tokenResponse.refreshToken,
      tokenExpiresAt,
    };
  }
}
```

> **주의:** `tokenResponse.refreshToken ?? refreshToken` — 카카오는 refresh token 잔여 1개월 미만일 때만 새 RT를 반환. 그 외에는 기존 값 유지.

---

### Step 9. `KakaoNotificationSender` 리팩토링 (토큰 갱신 + 재시도)

**파일:** `src/adapter/interview/notification/kakao-notification.sender.ts`

핵심 변경:
- `sendKakaoMessage()`를 분리하여 결과를 `"success" | "token_expired" | "error"`로 반환
- `-401` 시 토큰 갱신 후 재시도
- 갱신 실패 시 `KakaoTokenExpiredError` throw → 상위에서 이메일 폴백 트리거

```typescript
// 카카오 토큰 만료 에러 (이메일 폴백 트리거용)
export class KakaoTokenExpiredError extends Error {
  constructor() {
    super("Kakao refresh token expired");
    this.name = "KakaoTokenExpiredError";
  }
}

@Injectable()
export class KakaoNotificationSender implements NotificationSender {
  readonly channel: NotificationChannel = "kakao";

  constructor(
    @Inject(LOGGER) private readonly logger: ILogger,
    @Inject(KAKAO_TOKEN_REFRESHER) private readonly tokenRefresher: KakaoTokenRefresher,
  ) {}

  async send(recipient, content): Promise<void> {
    if (!recipient.kakaoAccessToken) {
      this.logger.warn("Kakao access token not available, skipping", {...});
      return;
    }

    // 1차 시도
    const result = await this.sendKakaoMessage(recipient.kakaoAccessToken, content);
    if (result === "success") return;

    if (result === "token_expired") {
      if (!recipient.kakaoRefreshToken || !recipient.kakaoConnectionId) {
        throw new KakaoTokenExpiredError();
      }

      try {
        // 토큰 갱신
        const refreshResult = await this.tokenRefresher.refreshToken(
          recipient.kakaoConnectionId,
          recipient.kakaoRefreshToken,
        );

        // 2차 시도 (갱신된 토큰으로)
        const retryResult = await this.sendKakaoMessage(refreshResult.accessToken, content);
        if (retryResult === "success") return;

        throw new KakaoTokenExpiredError();
      } catch (error) {
        if (error instanceof KakaoTokenExpiredError) throw error;
        this.logger.warn("Kakao token refresh failed", { error: (error as Error).message });
        throw new KakaoTokenExpiredError();
      }
    }
  }

  private async sendKakaoMessage(
    accessToken: string,
    content: InterviewQuestionNotification,
  ): Promise<"success" | "token_expired" | "error"> {
    const response = await fetch("https://kapi.kakao.com/v2/api/talk/memo/default/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
      },
      body: new URLSearchParams({
        template_object: JSON.stringify(this.buildTextTemplate(content)),
      }),
    });

    if (response.ok) return "success";

    const error: any = await response.json();
    if (error.code === -401) return "token_expired";

    this.logger.error("Kakao notification failed", new Error(JSON.stringify(error)), {...});
    return "error";
  }

  private buildTextTemplate(content) { /* 기존 그대로 */ }
}
```

---

### Step 10. `InterviewNotificationService`에 이메일 폴백 추가

**파일:** `src/application/interview/service/interview-notification.service.ts`

`sendByNotificationPreference()`에서 `Promise.allSettled` 결과 확인 후 폴백:

```typescript
private async sendByNotificationPreference(
  recipient: NotificationRecipient,
  content: InterviewQuestionNotification,
): Promise<void> {
  const channelsToSend = this.getChannelsToSend(recipient.notification);

  const sendPromises = channelsToSend.map((channel) => {
    const sender = this.notificationSenders.find((s) => s.supports(channel));
    if (!sender) return Promise.resolve();

    return sender.send(
      {
        email: recipient.email,
        kakaoAccessToken: recipient.kakaoAccessToken,
        kakaoRefreshToken: recipient.kakaoRefreshToken,    // 추가
        kakaoConnectionId: recipient.kakaoConnectionId,    // 추가
      },
      content,
    );
  });

  const results = await Promise.allSettled(sendPromises);

  // 이메일 폴백: 카카오 전용 사용자의 토큰 만료 시
  const kakaoIndex = channelsToSend.indexOf("kakao");
  const emailAlreadySent = channelsToSend.includes("email");

  if (
    kakaoIndex !== -1 &&
    !emailAlreadySent &&
    results[kakaoIndex].status === "rejected" &&
    results[kakaoIndex].reason?.name === "KakaoTokenExpiredError"
  ) {
    this.logger.log("Kakao token expired, falling back to email", {
      module: "InterviewNotificationService",
      memberId: recipient.memberId,
    });

    const emailSender = this.notificationSenders.find((s) => s.supports("email"));
    if (emailSender) {
      await emailSender.send({ email: recipient.email }, content);
    }
  }
}
```

> **폴백 조건:** 알림 설정이 `KAKAO`만인 경우에만 발동. `BOTH`는 이미 이메일이 발송되므로 중복 방지.

---

### Step 11. `InterviewModule`에 프로바이더 등록

**파일:** `src/adapter/interview/interview.module.ts`

```typescript
import { OAuthModule } from "@/adapter/oauth/oauth.module";
import { KAKAO_TOKEN_REFRESHER } from "@/application/interview/ports";
import { KakaoTokenRefresherImpl } from "@/adapter/interview/notification/kakao-token-refresher.impl";

@Module({
  imports: [OAuthModule],  // 추가 - KAKAO_OAUTH_PROVIDER, OAUTH_REPOSITORY 사용
  controllers: [InterviewController],
  providers: [
    // ... 기존 프로바이더들
    {
      provide: KAKAO_TOKEN_REFRESHER,
      useClass: KakaoTokenRefresherImpl,
    },
    // ... 나머지 동일
  ],
})
export class InterviewModule {}
```

`OAuthModule`은 이미 `OAUTH_REPOSITORY`와 `KAKAO_OAUTH_PROVIDER`를 export하고 있다 (oauth.module.ts:54).

---

## 전체 플로우

```
KakaoNotificationSender.send(accessToken)
  │
  ├─ 성공 → 완료
  │
  └─ -401 (토큰 만료)
      │
      ├─ KakaoTokenRefresher.refreshToken(connectionId, refreshToken)
      │   ├─ 카카오 API로 토큰 갱신
      │   ├─ DB에 새 토큰 저장
      │   └─ 새 accessToken 반환
      │
      ├─ 재시도 성공 → 완료
      │
      └─ 갱신 실패 → throw KakaoTokenExpiredError
          │
          └─ InterviewNotificationService에서 catch
              │
              └─ 알림 설정이 KAKAO만? → 이메일로 폴백 발송
```

---

## 수정 파일 요약

| 액션 | 파일 |
|------|------|
| **수정** | `src/application/oauth/ports/oauth-provider.port.ts` |
| **수정** | `src/adapter/oauth/kakao/types/kakao-oauth.types.ts` |
| **수정** | `src/adapter/oauth/kakao/kakao-oauth-provider.service.ts` |
| **수정** | `src/application/interview/ports/notification-recipient-finder.port.ts` |
| **수정** | `src/application/interview/ports/notification-sender.port.ts` |
| **수정** | `src/application/interview/ports/index.ts` |
| **수정** | `src/adapter/interview/notification/notification-recipient-finder.impl.ts` |
| **수정** | `src/adapter/interview/notification/kakao-notification.sender.ts` |
| **수정** | `src/application/interview/service/interview-notification.service.ts` |
| **수정** | `src/adapter/interview/interview.module.ts` |
| **생성** | `src/application/interview/ports/kakao-token-refresher.port.ts` |
| **생성** | `src/adapter/interview/notification/kakao-token-refresher.impl.ts` |

---

## 주의사항

1. **카카오 refresh token 갱신 정책:** refresh token 잔여 1개월 미만일 때만 새 RT 반환. `tokenResponse.refreshToken ?? refreshToken`으로 기존 값 유지 필수.
2. **MikroORM EntityManager 스코프:** 스케줄러 컨텍스트에서 실행되므로 HTTP 요청 스코프가 아님. 기존 `NotificationRecipientFinderImpl`이 같은 컨텍스트에서 동작하므로 문제 없음.
3. **도메인 모델 변경 없음:** `OAuthConnection` 도메인 모델은 수정 불필요. 토큰 갱신은 인프라 관심사.

---

## 검증 방법

1. 카카오 OAuth 로그인 후 시간이 지나 access token 만료 상태에서 알림 발송 테스트
2. 로그에서 "Kakao token expired, attempting refresh" → "Kakao token refreshed and persisted" → "Kakao notification sent" 순서 확인
3. refresh token도 만료된 경우 "falling back to email" 로그와 이메일 수신 확인
4. 알림 설정이 `BOTH`인 사용자는 폴백 없이 이메일이 정상 발송되는지 확인
