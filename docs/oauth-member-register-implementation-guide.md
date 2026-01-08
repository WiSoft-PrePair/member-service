# OAuth 회원가입 CQRS 구현 가이드 (2단계 플로우)

## 개요

OAuth 회원가입을 2단계로 분리하여 일반 회원가입과 동일한 사용자 경험을 제공합니다.

### 플로우

```
[1단계: OAuth 인증]
카카오 로그인 버튼 클릭
  → 카카오 인증 완료
  → 이메일/닉네임 획득
  → 등록 토큰(Registration Token) 발급
  → 프론트엔드로 반환

[2단계: 추가 정보 입력]
추가 정보 입력 화면 (job, notification, frequency)
  → 회원가입 완료 버튼 클릭
  → 등록 토큰 + 추가 정보로 API 호출
  → Member 생성 (CQRS 플로우)
  → Access Token 발급
  → 로그인 완료
```

### OAuth로 이미 확보된 정보
- `email`: 카카오 계정 이메일
- `nickname`: 카카오 프로필 닉네임
- `provider`: "kakao"
- `providerId`: 카카오 사용자 ID

### 사용자가 추가로 입력할 정보
- `job`: 직업
- `notification`: 알림 수신 방법
- `frequency`: 알림 빈도

---

## 구현 단계

### Step 1: 등록 토큰 타입 정의

**파일:** `src/adapter/oauth/kakao/types/kakao-oauth.types.ts`

기존 파일에 등록 토큰 관련 타입을 추가합니다.

```typescript
// 기존 타입들...

/**
 * OAuth 등록 토큰 Payload
 * - 회원가입 완료 전까지 카카오 정보를 안전하게 전달
 * - 짧은 만료 시간 (10분)
 */
export interface OAuthRegistrationPayload {
  email: string;
  nickname: string;
  provider: "kakao" | "google" | "naver";
  providerId: string;
  type: "oauth_registration"; // 토큰 타입 구분용
}
```

---

### Step 2: 등록 토큰 서비스 생성

**파일:** `src/application/oauth/oauth-registration-token.service.ts`

```typescript
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService as NestJwtService } from "@nestjs/jwt";
import type { OAuthRegistrationPayload } from "@/adapter/oauth/kakao/types/kakao-oauth.types";
import type { OAuthProvider } from "@/domain/oauth";

export interface RegistrationTokenData {
  email: string;
  nickname: string;
  provider: OAuthProvider;
  providerId: string;
}

@Injectable()
export class OAuthRegistrationTokenService {
  private readonly secret: string;
  private readonly expiresIn: string = "10m"; // 10분

  constructor(
    private readonly jwtService: NestJwtService,
    private readonly configService: ConfigService,
  ) {
    this.secret = this.configService.getOrThrow<string>("JWT_SECRET");
  }

  /**
   * OAuth 인증 완료 후 등록 토큰 생성
   */
  generateRegistrationToken(data: RegistrationTokenData): string {
    const payload: OAuthRegistrationPayload = {
      ...data,
      type: "oauth_registration",
    };

    return this.jwtService.sign(payload, {
      secret: this.secret,
      expiresIn: this.expiresIn,
    });
  }

  /**
   * 등록 토큰 검증 및 데이터 추출
   */
  verifyRegistrationToken(token: string): RegistrationTokenData {
    try {
      const payload = this.jwtService.verify<OAuthRegistrationPayload>(token, {
        secret: this.secret,
      });

      if (payload.type !== "oauth_registration") {
        throw new UnauthorizedException("유효하지 않은 등록 토큰입니다.");
      }

      return {
        email: payload.email,
        nickname: payload.nickname,
        provider: payload.provider,
        providerId: payload.providerId,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException(
        "등록 토큰이 만료되었거나 유효하지 않습니다. 다시 카카오 로그인을 진행해주세요.",
      );
    }
  }
}
```

---

### Step 3: OAuth 회원가입 완료 Command 생성

**파일:** `src/application/oauth/command/oauth-member-register.command.ts`

```typescript
import {
  CommandHandler,
  EventBus,
  ICommand,
  ICommandHandler,
} from "@nestjs/cqrs";
import { Inject, Injectable } from "@nestjs/common";
import { EntityManager, Transactional } from "@mikro-orm/core";
import {
  FrequencyEnum,
  Member,
  MEMBER_REPOSITORY,
  type MemberRepository,
  NotificationEnum,
  PASSWORD_ENCODER,
  type PasswordEncoder,
} from "@/domain/member";
import {
  OAUTH_REPOSITORY,
  OAuthConnection,
  type OauthRepository,
  type OAuthProvider,
} from "@/domain/oauth";
import {
  createDomainEvent,
  EVENT_STORE,
  type EventStore,
} from "@/domain/shared";
import { MemberRegisterEvent } from "@/domain/member/events";

/**
 * OAuth 회원가입 완료 Command
 * - 등록 토큰에서 추출한 OAuth 정보 + 사용자 입력 정보
 */
export class OAuthMemberRegisterCommand implements ICommand {
  constructor(
    // OAuth 인증으로 획득한 정보
    public readonly email: string,
    public readonly nickname: string,
    public readonly provider: OAuthProvider,
    public readonly providerId: string,
    // 사용자가 추가로 입력한 정보
    public readonly job: string,
    public readonly notification: NotificationEnum,
    public readonly frequency: FrequencyEnum,
  ) {}
}

export interface OAuthMemberRegisterResult {
  memberId: string;
  member: Member;
}

@Injectable()
@CommandHandler(OAuthMemberRegisterCommand)
export class OAuthMemberRegisterCommandHandler
  implements ICommandHandler<OAuthMemberRegisterCommand, OAuthMemberRegisterResult>
{
  constructor(
    @Inject(MEMBER_REPOSITORY)
    private readonly memberRepository: MemberRepository,
    @Inject(PASSWORD_ENCODER)
    private readonly passwordEncoder: PasswordEncoder,
    @Inject(OAUTH_REPOSITORY)
    private readonly oauthRepository: OauthRepository,
    @Inject(EVENT_STORE)
    private readonly eventStore: EventStore,
    private readonly eventBus: EventBus,
    private readonly em: EntityManager,
  ) {}

  @Transactional()
  async execute(command: OAuthMemberRegisterCommand): Promise<OAuthMemberRegisterResult> {
    // 1. OAuth 회원용 임시 비밀번호 생성 (사용자가 나중에 설정 가능)
    const tempPassword = crypto.randomUUID();

    // 2. Member 도메인 생성
    const member = Member.register(
      {
        email: command.email,
        password: tempPassword,
        nickname: command.nickname,
        job: command.job,
        notification: command.notification,
        frequency: command.frequency,
      },
      this.passwordEncoder,
    );

    // 3. Write Model 저장
    this.memberRepository.register(member);

    // 4. OAuthConnection 생성 및 저장
    const connection = OAuthConnection.connect({
      memberId: member.id,
      provider: command.provider,
      providerId: command.providerId,
      email: command.email,
    });
    this.oauthRepository.save(connection);

    // 5. EventStore에 이벤트 기록
    this.eventStore.append(
      createDomainEvent(member.id, "MemberRegistered", {
        id: member.id,
        email: member.email.value,
        password: member.password.value,
        job: member.job,
        nickname: member.nickname,
        notification: member.notification,
        frequency: member.frequency,
        point: member.point,
        isPro: member.isPro,
        oauthProvider: command.provider,
        oauthProviderId: command.providerId,
      }),
    );

    // 6. 트랜잭션 커밋
    await this.em.flush();

    // 7. EventBus로 통합 이벤트 발행 → Read Model 생성
    this.eventBus.publish(
      new MemberRegisterEvent(
        member.id,
        member.email.value,
        member.password.value,
        member.job,
        member.nickname,
        member.notification,
        member.frequency,
      ),
    );

    return {
      memberId: member.id,
      member,
    };
  }
}
```

---

### Step 4: Command index 파일 생성

**파일:** `src/application/oauth/command/index.ts`

```typescript
export * from "./oauth-member-register.command";
```

---

### Step 5: 회원가입 완료 DTO 생성

**파일:** `src/adapter/oauth/api/dto/oauth-complete-register.dto.ts`

```typescript
import { IsEnum, IsNotEmpty, IsString } from "class-validator";
import { FrequencyEnum, NotificationEnum } from "@/domain/member";

export class OAuthCompleteRegisterDto {
  @IsString()
  @IsNotEmpty()
  registrationToken!: string;

  @IsString()
  @IsNotEmpty()
  job!: string;

  @IsEnum(NotificationEnum)
  notification!: NotificationEnum;

  @IsEnum(FrequencyEnum)
  frequency!: FrequencyEnum;
}
```

---

### Step 6: DTO index 업데이트

**파일:** `src/adapter/oauth/api/dto/index.ts`

```typescript
export * from "./oauth-callback.dto";
export * from "./oauth-login-response.dto";
export * from "./oauth-complete-register.dto";
```

---

### Step 7: KakaoAuthService 수정

**파일:** `src/application/oauth/kakao-auth.service.ts`

```typescript
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { KakaoOauthService } from "@/adapter/oauth/kakao/kakao-oauth.service";
import { JwtService } from "@/adapter/auth/security";
import { RefreshTokenService } from "@/application/auth";
import {
  FrequencyEnum,
  Member,
  MEMBER_REPOSITORY,
  type MemberRepository,
  NotificationEnum,
} from "@/domain/member";
import {
  OAUTH_REPOSITORY,
  OAuthConnection,
  type OauthRepository,
} from "@/domain/oauth";
import {
  MEMBER_READ_REPOSITORY,
  type MemberReadRepository,
} from "@/adapter/member/persistence/read";
import { EntityManager } from "@mikro-orm/postgresql";
import {
  KakaoUserInfo,
  KakaoUserProfile,
} from "@/adapter/oauth/kakao/types/kakao-oauth.types";
import { OAuthRegistrationTokenService } from "@/application/oauth/oauth-registration-token.service";
import {
  OAuthMemberRegisterCommand,
  type OAuthMemberRegisterResult,
} from "@/application/oauth/command";

@Injectable()
export class KakaoAuthService {
  constructor(
    private readonly kakaoOAuthService: KakaoOauthService,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly registrationTokenService: OAuthRegistrationTokenService,
    private readonly commandBus: CommandBus,
    @Inject(MEMBER_REPOSITORY)
    private readonly memberRepository: MemberRepository,
    @Inject(OAUTH_REPOSITORY)
    private readonly oauthConnectionRepository: OauthRepository,
    @Inject(MEMBER_READ_REPOSITORY)
    private readonly memberReadRepository: MemberReadRepository,
    private readonly em: EntityManager,
  ) {}

  /**
   * [1단계] 카카오 OAuth 콜백 처리
   * - 기존 회원: 로그인 처리 → Access Token 발급
   * - 신규 회원: 등록 토큰 발급 → 추가 정보 입력 필요
   */
  async handleCallback(code: string) {
    const kakaoTokens =
      await this.kakaoOAuthService.exchangeCodeForAccessToken(code);

    const kakaoUser = await this.kakaoOAuthService.getUserInfo(
      kakaoTokens.access_token,
    );

    const { kakaoId, email, nickname } =
      this.extractKakaoUserProfile(kakaoUser);

    // Case 1: 기존 OAuth 연결이 있는 경우 → 로그인
    const existingConnection =
      await this.oauthConnectionRepository.findByProviderAndProviderId(
        "kakao",
        kakaoId,
      );

    if (existingConnection) {
      return this.loginExistingMember(existingConnection.memberId);
    }

    // Case 2: 동일 이메일로 가입된 일반 회원이 있는 경우 → OAuth 연결 후 로그인
    const existingMember = await this.memberRepository.findByEmail(email);

    if (existingMember) {
      await this.connectOAuthToExistingMember(existingMember, kakaoId, email);
      return this.loginExistingMember(existingMember.id);
    }

    // Case 3: 신규 회원 → 등록 토큰 발급 (회원가입 미완료 상태)
    const registrationToken =
      this.registrationTokenService.generateRegistrationToken({
        email,
        nickname,
        provider: "kakao",
        providerId: kakaoId,
      });

    return {
      isNewMember: true,
      registrationToken,
      // 프론트엔드에서 추가 정보 입력 화면에 표시할 정보
      prefilledData: {
        email,
        nickname,
      },
    };
  }

  /**
   * [2단계] 회원가입 완료
   * - 등록 토큰 검증 후 실제 회원 생성
   */
  async completeRegistration(
    registrationToken: string,
    job: string,
    notification: NotificationEnum,
    frequency: FrequencyEnum,
  ) {
    // 1. 등록 토큰 검증 및 OAuth 정보 추출
    const oauthData =
      this.registrationTokenService.verifyRegistrationToken(registrationToken);

    // 2. 중복 가입 체크 (등록 토큰 발급 후 다른 경로로 가입한 경우)
    const existingMember = await this.memberRepository.findByEmail(
      oauthData.email,
    );
    if (existingMember) {
      throw new ConflictException("이미 가입된 이메일입니다.");
    }

    const existingConnection =
      await this.oauthConnectionRepository.findByProviderAndProviderId(
        oauthData.provider,
        oauthData.providerId,
      );
    if (existingConnection) {
      throw new ConflictException("이미 연결된 카카오 계정입니다.");
    }

    // 3. CommandBus를 통해 회원가입 완료 (CQRS 플로우)
    const result = await this.commandBus.execute<
      OAuthMemberRegisterCommand,
      OAuthMemberRegisterResult
    >(
      new OAuthMemberRegisterCommand(
        oauthData.email,
        oauthData.nickname,
        oauthData.provider,
        oauthData.providerId,
        job,
        notification,
        frequency,
      ),
    );

    // 4. Access Token 발급
    const accessToken = this.jwtService.generateAccessToken(
      result.memberId,
      result.member.email.value,
    );

    const refreshToken = await this.refreshTokenService.create(result.memberId);

    await this.em.flush();

    return {
      accessToken: accessToken.accessToken,
      refreshToken,
      accessTokenExpiresIn: accessToken.expiresIn,
      memberId: result.memberId,
      isNewMember: true,
      nickname: result.member.nickname,
    };
  }

  /**
   * 기존 회원 로그인 처리
   */
  private async loginExistingMember(memberId: string) {
    const member = await this.memberRepository.findById(memberId);

    if (!member) {
      throw new BadRequestException(
        "회원 정보를 찾을 수 없습니다. 다시 로그인해주세요.",
      );
    }

    await this.updateActivityLog(memberId);

    const accessToken = this.jwtService.generateAccessToken(
      member.id,
      member.email.value,
    );

    const refreshToken = await this.refreshTokenService.create(member.id);

    await this.em.flush();

    return {
      isNewMember: false,
      accessToken: accessToken.accessToken,
      refreshToken,
      accessTokenExpiresIn: accessToken.expiresIn,
      memberId: member.id,
    };
  }

  /**
   * 기존 회원에 OAuth 연결
   */
  private async connectOAuthToExistingMember(
    member: Member,
    providerId: string,
    email: string,
  ) {
    const connection = OAuthConnection.connect({
      memberId: member.id,
      provider: "kakao",
      providerId,
      email,
    });

    this.oauthConnectionRepository.save(connection);
  }

  /**
   * 카카오 사용자 정보 추출
   */
  private extractKakaoUserProfile(kakaoUser: KakaoUserInfo): KakaoUserProfile {
    const kakaoId = String(kakaoUser.id);
    const email = kakaoUser.kakao_account?.email;
    const nickname = kakaoUser.kakao_account?.profile?.nickname;

    if (!email) {
      throw new BadRequestException(
        '이메일 정보가 필요합니다. 카카오 동의항목에서 "카카오계정(이메일)"을 필수 동의로 설정해주세요.',
      );
    }

    if (!nickname) {
      throw new BadRequestException(
        '닉네임 정보가 필요합니다. 카카오 동의항목에서 "닉네임"을 필수 동의로 설정해주세요.',
      );
    }

    return { kakaoId, email, nickname };
  }

  /**
   * 활동 기록 업데이트
   */
  private async updateActivityLog(memberId: string): Promise<void> {
    const readEntity = await this.memberReadRepository.findById(memberId);

    if (readEntity) {
      const today = new Date().toISOString().slice(0, 10);
      readEntity.activity = readEntity.activity ?? [];

      if (!readEntity.activity.includes(today)) {
        readEntity.activity.push(today);
      }
    }
  }
}
```

---

### Step 8: Controller 수정

**파일:** `src/adapter/oauth/api/kakao-oauth.controller.ts`

```typescript
import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Public } from "@/adapter/shared/api/decorators/public.decorator";
import {
  OauthCallbackDto,
  OAuthCompleteRegisterDto,
} from "@/adapter/oauth/api/dto";
import { KakaoAuthService } from "@/application/oauth/kakao-auth.service";

@Controller("api/oauth/kakao")
export class KakaoOauthController {
  constructor(
    private readonly kakaoAuthService: KakaoAuthService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 카카오 인가 URL 반환
   */
  @Public()
  @Get("url")
  getAuthorizationUrl(@Query("state") state?: string) {
    const clientId: string = this.configService.getOrThrow("KAKAO_CLIENT_ID");
    const redirectUri: string =
      this.configService.getOrThrow("KAKAO_REDIRECT_URI");

    const url = new URL("https://kauth.kakao.com/oauth/authorize");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    if (state) {
      url.searchParams.set("state", state);
    }

    return { url: url.toString() };
  }

  /**
   * [1단계] 카카오 OAuth 콜백
   * - 기존 회원: { isNewMember: false, accessToken, ... }
   * - 신규 회원: { isNewMember: true, registrationToken, prefilledData }
   */
  @Public()
  @Post("callback")
  async callback(@Body() dto: OauthCallbackDto) {
    return this.kakaoAuthService.handleCallback(dto.code);
  }

  /**
   * [2단계] 회원가입 완료
   * - 등록 토큰 + 추가 정보(job, notification, frequency)로 회원가입 완료
   */
  @Public()
  @Post("complete-registration")
  async completeRegistration(@Body() dto: OAuthCompleteRegisterDto) {
    return this.kakaoAuthService.completeRegistration(
      dto.registrationToken,
      dto.job,
      dto.notification,
      dto.frequency,
    );
  }
}
```

---

### Step 9: Application index 업데이트

**파일:** `src/application/oauth/index.ts`

```typescript
export * from "./kakao-auth.service";
export * from "./oauth-registration-token.service";
export * from "./command";
```

---

### Step 10: OAuthModule 수정

**파일:** `src/adapter/oauth/oauth.module.ts`

```typescript
import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { JwtModule } from "@nestjs/jwt";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { OAuthConnectionEntity } from "@/adapter/oauth/persistence/entity/oauth.entity";
import { MemberModule } from "@/adapter/member/member.module";
import { AuthModule } from "@/adapter/auth/auth.module";
import { EventStoreModule } from "@/adapter/shared/event-store/event-store.module";
import { KakaoOauthController } from "@/adapter/oauth/api/kakao-oauth.controller";
import { KakaoOauthService } from "@/adapter/oauth/kakao/kakao-oauth.service";
import { KakaoAuthService } from "@/application/oauth/kakao-auth.service";
import { OAuthRegistrationTokenService } from "@/application/oauth/oauth-registration-token.service";
import { OAuthConnectionMapper } from "@/adapter/oauth/persistence/mapper/oauth.mapper";
import { OAUTH_REPOSITORY } from "@/domain/oauth";
import { OAuthConnectionRepositoryImpl } from "@/adapter/oauth/persistence/oauth.repository-impl";
import { OAuthMemberRegisterCommandHandler } from "@/application/oauth/command";

const CommandHandlers = [OAuthMemberRegisterCommandHandler];

@Module({
  imports: [
    MikroOrmModule.forFeature([OAuthConnectionEntity]),
    JwtModule.register({}), // 등록 토큰용 (secret은 서비스에서 직접 지정)
    MemberModule,
    AuthModule,
    EventStoreModule,
    CqrsModule,
  ],
  controllers: [KakaoOauthController],
  providers: [
    ...CommandHandlers,
    KakaoOauthService,
    KakaoAuthService,
    OAuthRegistrationTokenService,
    OAuthConnectionMapper,
    {
      provide: OAUTH_REPOSITORY,
      useClass: OAuthConnectionRepositoryImpl,
    },
  ],
  exports: [OAUTH_REPOSITORY],
})
export class OAuthModule {}
```

---

## API 스펙

### 1단계: 카카오 OAuth 콜백

**Request:**
```http
POST /api/oauth/kakao/callback
Content-Type: application/json

{
  "code": "카카오_인가_코드"
}
```

**Response (기존 회원):**
```json
{
  "isNewMember": false,
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "uuid-refresh-token",
  "accessTokenExpiresIn": 900,
  "memberId": "uuid"
}
```

**Response (신규 회원):**
```json
{
  "isNewMember": true,
  "registrationToken": "eyJhbGciOiJIUzI1NiIs...",
  "prefilledData": {
    "email": "user@kakao.com",
    "nickname": "홍길동"
  }
}
```

---

### 2단계: 회원가입 완료

**Request:**
```http
POST /api/oauth/kakao/complete-registration
Content-Type: application/json

{
  "registrationToken": "eyJhbGciOiJIUzI1NiIs...",
  "job": "개발자",
  "notification": "EMAIL",
  "frequency": "EVERY"
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "uuid-refresh-token",
  "accessTokenExpiresIn": 900,
  "memberId": "uuid",
  "isNewMember": true,
  "nickname": "홍길동"
}
```

---

## 프론트엔드 플로우

```typescript
// 1. 카카오 로그인 버튼 클릭 → 카카오 인증 → 콜백
const response = await fetch('/api/oauth/kakao/callback', {
  method: 'POST',
  body: JSON.stringify({ code: kakaoAuthCode }),
});
const data = await response.json();

if (data.isNewMember) {
  // 2. 신규 회원 → 추가 정보 입력 화면으로 이동
  // registrationToken과 prefilledData를 state로 전달
  navigate('/register/complete', {
    state: {
      registrationToken: data.registrationToken,
      email: data.prefilledData.email,
      nickname: data.prefilledData.nickname,
    },
  });
} else {
  // 기존 회원 → 로그인 완료
  saveTokens(data.accessToken, data.refreshToken);
  navigate('/dashboard');
}

// 3. 추가 정보 입력 후 회원가입 완료
const completeResponse = await fetch('/api/oauth/kakao/complete-registration', {
  method: 'POST',
  body: JSON.stringify({
    registrationToken,
    job: '개발자',
    notification: 'EMAIL',
    frequency: 'EVERY',
  }),
});
const result = await completeResponse.json();
saveTokens(result.accessToken, result.refreshToken);
navigate('/dashboard');
```

---

## 파일 변경 요약

| 작업 | 파일 경로 |
|------|----------|
| 수정 | `src/adapter/oauth/kakao/types/kakao-oauth.types.ts` |
| 생성 | `src/application/oauth/oauth-registration-token.service.ts` |
| 생성 | `src/application/oauth/command/oauth-member-register.command.ts` |
| 생성 | `src/application/oauth/command/index.ts` |
| 생성 | `src/adapter/oauth/api/dto/oauth-complete-register.dto.ts` |
| 수정 | `src/adapter/oauth/api/dto/index.ts` |
| 수정 | `src/application/oauth/kakao-auth.service.ts` |
| 수정 | `src/adapter/oauth/api/kakao-oauth.controller.ts` |
| 수정 | `src/application/oauth/index.ts` |
| 수정 | `src/adapter/oauth/oauth.module.ts` |

---

## 이벤트 플로우 (최종)

```
[1단계: OAuth 인증]
POST /api/oauth/kakao/callback
  → KakaoAuthService.handleCallback()
  → 카카오 API로 사용자 정보 조회
  → (신규 회원) 등록 토큰 발급
  → { isNewMember: true, registrationToken, prefilledData }

[2단계: 회원가입 완료]
POST /api/oauth/kakao/complete-registration
  → KakaoAuthService.completeRegistration()
  → 등록 토큰 검증
  → CommandBus.execute(OAuthMemberRegisterCommand)
      → Member.register()           → Write Model
      → OAuthConnection.connect()   → Write Model
      → EventStore.append()         → 이벤트 기록
      → em.flush()                  → 트랜잭션 커밋
      → EventBus.publish(MemberRegisterEvent)
          → MemberRegisterEventHandler
          → MemberReadEntity 생성   → Read Model ✅
  → Access Token 발급
  → 로그인 완료
```
