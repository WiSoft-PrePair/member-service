# 07. OAuth Domain — Kakao OAuth

> **사전 조건**: Phase 06 완료 (Auth E2E 그린)

## Goal

Kakao OAuth 로그인/가입/연동 흐름을 Event Sourcing으로 통합한다. OAuthConnection을 Aggregate로 모델링하고, 회원 탈퇴 시 자동 정리(Cleanup) 흐름을 Projector 패턴으로 구현한다.

---

## 산출물 체크리스트

### Domain (`src/contexts/identity/domain/oauth/`)
- [ ] `oauth-connection.aggregate.ts`
- [ ] `value-objects/oauth-provider.vo.ts` (enum: KAKAO, GOOGLE, NAVER)
- [ ] `events/oauth-connected.event.ts`
- [ ] `events/oauth-disconnected.event.ts`
- [ ] `events/oauth-token-refreshed.event.ts`
- [ ] `exceptions/oauth-already-connected.exception.ts`

### Application (`src/contexts/identity/application/oauth/`)
- [ ] `ports/oauth-connection.repository.port.ts` — `load`, `save`, `findByProviderId`, `findByMemberId`
- [ ] `ports/oauth-connection-read.repository.port.ts`
- [ ] `ports/kakao-oauth-client.port.ts`
- [ ] `ports/registration-token.service.port.ts`
- [ ] `use-cases/kakao-handle-callback.use-case.ts`
- [ ] `use-cases/complete-oauth-registration.use-case.ts`
- [ ] `use-cases/link-kakao-account.use-case.ts`
- [ ] `services/registration-token.service.ts`
- [ ] `projections/oauth-connection.projector.ts`
- [ ] `projections/oauth-cleanup.handler.ts` — MemberWithdrawn 구독

### Infrastructure (`src/contexts/identity/infrastructure/`)
- [ ] `persistence/oauth/oauth-connection-read.entity.ts`
- [ ] `persistence/oauth/mikro-oauth-connection-read.repository.impl.ts`
- [ ] `persistence/oauth/event-sourced-oauth-connection.repository.ts`
- [ ] `oauth/kakao-oauth.client.ts`

### Presentation (`src/contexts/identity/presentation/oauth/`)
- [ ] `kakao-oauth.controller.ts`
- [ ] `dto/oauth-callback.request.dto.ts`
- [ ] `dto/oauth-complete-register.request.dto.ts`

### 테스트
- [ ] `test/unit/identity/oauth/oauth-connection.aggregate.spec.ts`
- [ ] `test/unit/identity/oauth/use-cases/kakao-handle-callback.use-case.spec.ts`
- [ ] `test/e2e/oauth.e2e-spec.ts` (Kakao API mock)

---

## Step 1. OAuthProvider VO + Exception

```typescript
// src/contexts/identity/domain/oauth/value-objects/oauth-provider.vo.ts
export enum OAuthProvider {
  KAKAO = "KAKAO",
  GOOGLE = "GOOGLE",
  NAVER = "NAVER",
}
```

```typescript
// exceptions/oauth-already-connected.exception.ts
export class OAuthAlreadyConnectedException extends Error {
  public readonly code = "OAUTH_ALREADY_CONNECTED";
  constructor() { super("This OAuth account is already connected"); }
}
```

---

## Step 2. OAuth Domain Events

```typescript
// events/oauth-connected.event.ts
import { DomainEvent } from "../../shared/domain-event.base";
import type { OAuthProvider } from "../value-objects/oauth-provider.vo";

export interface OAuthConnectedPayload {
  memberId: string;
  provider: OAuthProvider;
  providerId: string;
  email: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: string;
}

export class OAuthConnectedEvent extends DomainEvent<OAuthConnectedPayload> {
  public static readonly TYPE = "OAuthConnected";
  constructor(args: { aggregateId: string; eventVersion: number; payload: OAuthConnectedPayload }) {
    super({
      aggregateId: args.aggregateId,
      aggregateType: "OAuthConnection",
      eventType: OAuthConnectedEvent.TYPE,
      eventVersion: args.eventVersion,
      payload: args.payload,
    });
  }
}

// oauth-disconnected.event.ts (TYPE = "OAuthDisconnected", payload empty)
// oauth-token-refreshed.event.ts (TYPE = "OAuthTokenRefreshed", payload: {accessToken, refreshToken?, tokenExpiresAt})
```

---

## Step 3. OAuthConnection Aggregate

```typescript
// src/contexts/identity/domain/oauth/oauth-connection.aggregate.ts
import { randomUUID } from "node:crypto";
import { AggregateRoot } from "../shared/aggregate-root.base";
import { DomainEvent } from "../shared/domain-event.base";
import { OAuthProvider } from "./value-objects/oauth-provider.vo";
import { OAuthConnectedEvent } from "./events/oauth-connected.event";
import { OAuthDisconnectedEvent } from "./events/oauth-disconnected.event";
import { OAuthTokenRefreshedEvent } from "./events/oauth-token-refreshed.event";

export class OAuthConnection extends AggregateRoot {
  private _id!: string;
  private _memberId!: string;
  private _provider!: OAuthProvider;
  private _providerId!: string;
  private _email!: string;
  private _accessToken?: string;
  private _refreshToken?: string;
  private _tokenExpiresAt?: Date;
  private _isDisconnected = false;

  public get id(): string { return this._id; }
  public get aggregateType(): string { return "OAuthConnection"; }
  public get memberId(): string { return this._memberId; }
  public get provider(): OAuthProvider { return this._provider; }
  public get providerId(): string { return this._providerId; }
  public get email(): string { return this._email; }
  public get isDisconnected(): boolean { return this._isDisconnected; }

  public static connect(args: {
    memberId: string;
    provider: OAuthProvider;
    providerId: string;
    email: string;
    accessToken?: string;
    refreshToken?: string;
    tokenExpiresInSec?: number;
  }): OAuthConnection {
    const conn = new OAuthConnection();
    const id = randomUUID();
    conn.raise(new OAuthConnectedEvent({
      aggregateId: id,
      eventVersion: 1,
      payload: {
        memberId: args.memberId,
        provider: args.provider,
        providerId: args.providerId,
        email: args.email,
        accessToken: args.accessToken,
        refreshToken: args.refreshToken,
        tokenExpiresAt: args.tokenExpiresInSec
          ? new Date(Date.now() + args.tokenExpiresInSec * 1000).toISOString()
          : undefined,
      },
    }));
    return conn;
  }

  public refreshToken(args: { accessToken: string; refreshToken?: string; tokenExpiresInSec: number }): void {
    if (this._isDisconnected) throw new Error("Disconnected");
    this.raise(new OAuthTokenRefreshedEvent({
      aggregateId: this._id,
      eventVersion: this.version + 1,
      payload: {
        accessToken: args.accessToken,
        refreshToken: args.refreshToken,
        tokenExpiresAt: new Date(Date.now() + args.tokenExpiresInSec * 1000).toISOString(),
      },
    }));
  }

  public disconnect(): void {
    if (this._isDisconnected) return;
    this.raise(new OAuthDisconnectedEvent({
      aggregateId: this._id,
      eventVersion: this.version + 1,
      payload: {},
    }));
  }

  protected applyEvent(event: DomainEvent): void {
    switch (event.eventType) {
      case OAuthConnectedEvent.TYPE: {
        const p = event.payload as import("./events/oauth-connected.event").OAuthConnectedPayload;
        this._id = event.aggregateId;
        this._memberId = p.memberId;
        this._provider = p.provider;
        this._providerId = p.providerId;
        this._email = p.email;
        this._accessToken = p.accessToken;
        this._refreshToken = p.refreshToken;
        this._tokenExpiresAt = p.tokenExpiresAt ? new Date(p.tokenExpiresAt) : undefined;
        return;
      }
      case OAuthTokenRefreshedEvent.TYPE: {
        const p = event.payload as { accessToken: string; refreshToken?: string; tokenExpiresAt: string };
        this._accessToken = p.accessToken;
        if (p.refreshToken) this._refreshToken = p.refreshToken;
        this._tokenExpiresAt = new Date(p.tokenExpiresAt);
        return;
      }
      case OAuthDisconnectedEvent.TYPE: {
        this._isDisconnected = true;
        return;
      }
    }
  }

  public toSnapshot() {
    return {
      id: this._id,
      memberId: this._memberId,
      provider: this._provider,
      providerId: this._providerId,
      email: this._email,
      accessToken: this._accessToken,
      refreshToken: this._refreshToken,
      tokenExpiresAt: this._tokenExpiresAt?.toISOString(),
      isDisconnected: this._isDisconnected,
    };
  }

  public loadFromSnapshot(s: any, version: number): void {
    this._id = s.id;
    this._memberId = s.memberId;
    this._provider = s.provider;
    this._providerId = s.providerId;
    this._email = s.email;
    this._accessToken = s.accessToken;
    this._refreshToken = s.refreshToken;
    this._tokenExpiresAt = s.tokenExpiresAt ? new Date(s.tokenExpiresAt) : undefined;
    this._isDisconnected = s.isDisconnected;
    this._version = version;
  }
}
```

---

## Step 4. Read Model

```typescript
// src/contexts/identity/infrastructure/persistence/oauth/oauth-connection-read.entity.ts
import { Entity, Enum, Index, PrimaryKey, Property, Unique } from "@mikro-orm/core";
import { OAuthProvider } from "@/contexts/identity/domain/oauth/value-objects/oauth-provider.vo";

@Entity({ tableName: "oauth_connection_read" })
@Unique({ properties: ["provider", "providerId"] })
export class OAuthConnectionReadEntity {
  @PrimaryKey({ type: "uuid" })
  id!: string;

  @Property({ type: "uuid" })
  @Index()
  memberId!: string;

  @Enum(() => OAuthProvider)
  provider!: OAuthProvider;

  @Property()
  providerId!: string;

  @Property()
  email!: string;

  @Property({ type: "timestamptz" })
  connectedAt!: Date;
}
```

---

## Step 5. Kakao OAuth Client

```typescript
// src/contexts/identity/application/oauth/ports/kakao-oauth-client.port.ts
export const KAKAO_OAUTH_CLIENT = Symbol("KAKAO_OAUTH_CLIENT");

export interface KakaoTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface KakaoUserInfo {
  providerId: string;
  email: string;
  nickname?: string;
}

export interface KakaoOAuthClient {
  exchangeCodeForToken(code: string, redirectUri: string): Promise<KakaoTokenResponse>;
  getUserInfo(accessToken: string): Promise<KakaoUserInfo>;
  unlink(accessToken: string): Promise<void>;
  refreshAccessToken(refreshToken: string): Promise<KakaoTokenResponse>;
}
```

```typescript
// src/contexts/identity/infrastructure/oauth/kakao-oauth.client.ts
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { KakaoOAuthClient, KakaoTokenResponse, KakaoUserInfo } from "@/contexts/identity/application/oauth/ports/kakao-oauth-client.port";
import type { Env } from "@/config/env.config";

@Injectable()
export class KakaoOAuthClientImpl implements KakaoOAuthClient {
  constructor(private readonly config: ConfigService<Env, true>) {}

  async exchangeCodeForToken(code: string, redirectUri: string): Promise<KakaoTokenResponse> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: this.config.get("KAKAO_CLIENT_ID", { infer: true }),
      client_secret: this.config.get("KAKAO_CLIENT_SECRET", { infer: true }),
      redirect_uri: redirectUri,
      code,
    });
    const res = await fetch("https://kauth.kakao.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new Error(`Kakao token exchange failed: ${res.status}`);
    const json = await res.json() as { access_token: string; refresh_token: string; expires_in: number };
    return { accessToken: json.access_token, refreshToken: json.refresh_token, expiresIn: json.expires_in };
  }

  async getUserInfo(accessToken: string): Promise<KakaoUserInfo> {
    const res = await fetch("https://kapi.kakao.com/v2/user/me", {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Kakao user info failed: ${res.status}`);
    const json = await res.json() as { id: number; kakao_account?: { email?: string; profile?: { nickname?: string } } };
    return {
      providerId: String(json.id),
      email: json.kakao_account?.email ?? "",
      nickname: json.kakao_account?.profile?.nickname,
    };
  }

  async unlink(accessToken: string): Promise<void> {
    await fetch("https://kapi.kakao.com/v1/user/unlink", {
      method: "POST", headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  async refreshAccessToken(refreshToken: string): Promise<KakaoTokenResponse> {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: this.config.get("KAKAO_CLIENT_ID", { infer: true }),
      client_secret: this.config.get("KAKAO_CLIENT_SECRET", { infer: true }),
      refresh_token: refreshToken,
    });
    const res = await fetch("https://kauth.kakao.com/oauth/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
    });
    const json = await res.json() as { access_token: string; refresh_token?: string; expires_in: number };
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? refreshToken,
      expiresIn: json.expires_in,
    };
  }
}
```

---

## Step 6. Registration Token Service

```typescript
// src/contexts/identity/application/oauth/services/registration-token.service.ts
import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

export interface RegistrationTokenData {
  email: string;
  nickname?: string;
  provider: string;
  providerId: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresIn: number;
}

@Injectable()
export class RegistrationTokenService {
  constructor(private readonly jwt: JwtService) {}

  generate(data: RegistrationTokenData): string {
    return this.jwt.sign(data, { expiresIn: "10m" });
  }

  verify(token: string): RegistrationTokenData {
    return this.jwt.verify<RegistrationTokenData>(token);
  }
}
```

---

## Step 7. UseCases

### 7-1. KakaoHandleCallback

Kakao 콜백 처리 — 신규 회원이면 RegistrationToken 발급, 기존 회원이면 즉시 로그인.

```typescript
// src/contexts/identity/application/oauth/use-cases/kakao-handle-callback.use-case.ts
import { Inject, Injectable } from "@nestjs/common";

import { MEMBER_READ_REPOSITORY, type MemberReadRepository } from "@/contexts/identity/application/member/ports/member-read.repository.port";
import { KAKAO_OAUTH_CLIENT, type KakaoOAuthClient } from "../ports/kakao-oauth-client.port";
import { RegistrationTokenService } from "../services/registration-token.service";
import { OAUTH_CONNECTION_READ_REPOSITORY, type OAuthConnectionReadRepository } from "../ports/oauth-connection-read.repository.port";
import { LoginUseCase } from "@/contexts/identity/application/auth/use-cases/login.use-case";
import { OAuthProvider } from "@/contexts/identity/domain/oauth/value-objects/oauth-provider.vo";

export type KakaoCallbackResult =
  | { status: "REGISTRATION_REQUIRED"; registrationToken: string }
  | { status: "LOGGED_IN"; accessToken: string; refreshToken: string; expiresInSec: number; memberId: string };

@Injectable()
export class KakaoHandleCallbackUseCase {
  constructor(
    @Inject(KAKAO_OAUTH_CLIENT) private readonly kakao: KakaoOAuthClient,
    @Inject(MEMBER_READ_REPOSITORY) private readonly memberRead: MemberReadRepository,
    @Inject(OAUTH_CONNECTION_READ_REPOSITORY) private readonly oauthRead: OAuthConnectionReadRepository,
    private readonly registrationToken: RegistrationTokenService,
    private readonly login: LoginUseCase,  // 또는 별도 OAuthLoginUseCase
  ) {}

  async execute(req: { code: string; redirectUri: string }): Promise<KakaoCallbackResult> {
    const tokens = await this.kakao.exchangeCodeForToken(req.code, req.redirectUri);
    const userInfo = await this.kakao.getUserInfo(tokens.accessToken);

    // 이미 연동된 회원?
    const connection = await this.oauthRead.findByProviderId(OAuthProvider.KAKAO, userInfo.providerId);
    if (connection) {
      // → JWT 발급 (LoginUseCase 와 유사 로직 또는 별도 메서드)
      // 본 가이드에서는 별도 OAuthLoginAfterConnect 메서드 호출 형태로 작성
      const member = await this.memberRead.findById(connection.memberId);
      if (member) return this.issueLoginTokens(member.id, member.email);
    }

    // 신규 회원 → 등록 토큰 발급
    const token = this.registrationToken.generate({
      email: userInfo.email,
      nickname: userInfo.nickname,
      provider: OAuthProvider.KAKAO,
      providerId: userInfo.providerId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresIn: tokens.expiresIn,
    });
    return { status: "REGISTRATION_REQUIRED", registrationToken: token };
  }

  private async issueLoginTokens(/* ... */) { /* JWT + refresh 발급 (LoginUseCase 일부 추출) */ }
}
```

> **리팩터링 권고**: `LoginUseCase` 내부에서 "JWT + refresh 발급" 로직을 `IssueAuthTokensService`로 분리하면 OAuth/일반 로그인이 공유 가능하다. 본 가이드에서는 명시적으로 그렇게 하라.

### 7-2. CompleteOAuthRegistration

```typescript
// src/contexts/identity/application/oauth/use-cases/complete-oauth-registration.use-case.ts
import { Inject, Injectable, ConflictException } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import { SignUpMemberUseCase } from "@/contexts/identity/application/member/use-cases/sign-up-member.use-case";
import { EmailVerificationService } from "@/contexts/identity/application/member/services/email-verification.service";
import { RegistrationTokenService } from "../services/registration-token.service";
import { OAuthConnection } from "@/contexts/identity/domain/oauth/oauth-connection.aggregate";
import { OAuthProvider } from "@/contexts/identity/domain/oauth/value-objects/oauth-provider.vo";
import { OAUTH_CONNECTION_REPOSITORY, type OAuthConnectionRepository } from "../ports/oauth-connection.repository.port";

import type { NotificationChannel } from "@/contexts/identity/domain/member/enums/notification.enum";
import type { NotificationFrequency } from "@/contexts/identity/domain/member/enums/frequency.enum";

@Injectable()
export class CompleteOAuthRegistrationUseCase {
  constructor(
    private readonly signUp: SignUpMemberUseCase,
    private readonly verification: EmailVerificationService,
    private readonly registrationToken: RegistrationTokenService,
    @Inject(OAUTH_CONNECTION_REPOSITORY) private readonly oauthRepo: OAuthConnectionRepository,
  ) {}

  async execute(req: {
    registrationToken: string;
    job: string;
    notification: NotificationChannel;
    frequency: NotificationFrequency;
  }): Promise<{ memberId: string }> {
    const data = this.registrationToken.verify(req.registrationToken);

    // OAuth 가입은 비밀번호 검증 우회 — 임시 비밀번호 생성 + 이메일 인증 가짜로 통과
    const tempPassword = randomUUID();
    const code = this.verification.startVerification(data.email, "REGISTER");
    this.verification.verify(data.email, code, "REGISTER");

    const result = await this.signUp.execute({
      email: data.email,
      password: tempPassword,  // 사용자에게 노출하지 않음 (OAuth로만 로그인)
      nickname: data.nickname ?? "User",
      job: req.job,
      notification: req.notification,
      frequency: req.frequency,
    });

    const connection = OAuthConnection.connect({
      memberId: result.memberId,
      provider: data.provider as OAuthProvider,
      providerId: data.providerId,
      email: data.email,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      tokenExpiresInSec: data.tokenExpiresIn,
    });
    await this.oauthRepo.save(connection);

    return { memberId: result.memberId };
  }
}
```

### 7-3. LinkKakaoAccount (기존 회원에 연동)

```typescript
@Injectable()
export class LinkKakaoAccountUseCase {
  constructor(
    @Inject(KAKAO_OAUTH_CLIENT) private readonly kakao: KakaoOAuthClient,
    @Inject(OAUTH_CONNECTION_REPOSITORY) private readonly oauthRepo: OAuthConnectionRepository,
    @Inject(OAUTH_CONNECTION_READ_REPOSITORY) private readonly oauthRead: OAuthConnectionReadRepository,
  ) {}

  async execute(req: { memberId: string; code: string; redirectUri: string }): Promise<void> {
    const tokens = await this.kakao.exchangeCodeForToken(req.code, req.redirectUri);
    const info = await this.kakao.getUserInfo(tokens.accessToken);

    const existing = await this.oauthRead.findByProviderId(OAuthProvider.KAKAO, info.providerId);
    if (existing) throw new OAuthAlreadyConnectedException();

    const connection = OAuthConnection.connect({
      memberId: req.memberId,
      provider: OAuthProvider.KAKAO,
      providerId: info.providerId,
      email: info.email,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresInSec: tokens.expiresIn,
    });
    await this.oauthRepo.save(connection);
  }
}
```

---

## Step 8. OAuth Cleanup Handler (MemberWithdrawn 구독)

```typescript
// src/contexts/identity/application/oauth/projections/oauth-cleanup.handler.ts
import { Inject, Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";

import { MemberWithdrawnEvent } from "@/contexts/identity/domain/member/events/member-withdrawn.event";
import type { DomainEvent } from "@/shared-kernel/domain/domain-event.base";

import { OAUTH_CONNECTION_REPOSITORY, type OAuthConnectionRepository } from "../ports/oauth-connection.repository.port";
import { OAUTH_CONNECTION_READ_REPOSITORY, type OAuthConnectionReadRepository } from "../ports/oauth-connection-read.repository.port";
import { KAKAO_OAUTH_CLIENT, type KakaoOAuthClient } from "../ports/kakao-oauth-client.port";
import { OAuthProvider } from "@/contexts/identity/domain/oauth/value-objects/oauth-provider.vo";

@Injectable()
export class OAuthCleanupHandler {
  private readonly logger = new Logger(OAuthCleanupHandler.name);

  constructor(
    @Inject(OAUTH_CONNECTION_REPOSITORY) private readonly oauthRepo: OAuthConnectionRepository,
    @Inject(OAUTH_CONNECTION_READ_REPOSITORY) private readonly oauthRead: OAuthConnectionReadRepository,
    @Inject(KAKAO_OAUTH_CLIENT) private readonly kakao: KakaoOAuthClient,
  ) {}

  @OnEvent(MemberWithdrawnEvent.TYPE)
  async onWithdrawn(event: DomainEvent): Promise<void> {
    const connections = await this.oauthRead.findAllByMemberId(event.aggregateId);
    for (const conn of connections) {
      try {
        const aggregate = await this.oauthRepo.load(conn.id);
        if (!aggregate) continue;
        if (conn.provider === OAuthProvider.KAKAO && aggregate["_accessToken"]) {
          await this.kakao.unlink(aggregate["_accessToken"]).catch((e) =>
            this.logger.warn(`Kakao unlink failed: ${e}`),
          );
        }
        aggregate.disconnect();
        await this.oauthRepo.save(aggregate);
      } catch (e) {
        this.logger.error(`OAuth cleanup failed for connection ${conn.id}: ${e}`);
      }
    }
  }
}
```

---

## Step 9. Projector

```typescript
// src/contexts/identity/application/oauth/projections/oauth-connection.projector.ts
@Injectable()
export class OAuthConnectionProjector {
  constructor(
    @Inject(OAUTH_CONNECTION_READ_REPOSITORY) private readonly read: OAuthConnectionReadRepository,
  ) {}

  @OnEvent(OAuthConnectedEvent.TYPE)
  async onConnected(event: DomainEvent): Promise<void> {
    const p = event.payload as OAuthConnectedPayload;
    await this.read.insert({
      id: event.aggregateId,
      memberId: p.memberId,
      provider: p.provider,
      providerId: p.providerId,
      email: p.email,
      connectedAt: event.occurredAt,
    });
  }

  @OnEvent(OAuthDisconnectedEvent.TYPE)
  async onDisconnected(event: DomainEvent): Promise<void> {
    await this.read.delete(event.aggregateId);
  }
}
```

---

## Step 10. Controller

```typescript
// src/contexts/identity/presentation/oauth/kakao-oauth.controller.ts
import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { Public } from "@/shared-kernel/decorators/public.decorator";
import { CurrentUser, CurrentUserPayload } from "@/shared-kernel/decorators/current-user.decorator";

import { KakaoHandleCallbackUseCase } from "@/contexts/identity/application/oauth/use-cases/kakao-handle-callback.use-case";
import { CompleteOAuthRegistrationUseCase } from "@/contexts/identity/application/oauth/use-cases/complete-oauth-registration.use-case";
import { LinkKakaoAccountUseCase } from "@/contexts/identity/application/oauth/use-cases/link-kakao-account.use-case";

import { OAuthCallbackRequestDto, OAuthCompleteRegisterRequestDto } from "./dto";
import type { Env } from "@/config/env.config";

@Controller("api/auth/kakao")
export class KakaoOAuthController {
  constructor(
    private readonly callback: KakaoHandleCallbackUseCase,
    private readonly complete: CompleteOAuthRegistrationUseCase,
    private readonly link: LinkKakaoAccountUseCase,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @Get("url")
  buildUrl(@Query("state") state?: string, @Query("redirectUri") redirectUri?: string) {
    const id = this.config.get("KAKAO_CLIENT_ID", { infer: true });
    const uri = redirectUri ?? this.config.get("KAKAO_REDIRECT_URI", { infer: true });
    const url = `https://kauth.kakao.com/oauth/authorize?client_id=${id}&redirect_uri=${encodeURIComponent(uri)}&response_type=code${state ? `&state=${state}` : ""}`;
    return { url };
  }

  @Public()
  @Post("callback")
  async handleCallback(@Body() dto: OAuthCallbackRequestDto) {
    return this.callback.execute({
      code: dto.code,
      redirectUri: dto.redirectUri ?? this.config.get("KAKAO_REDIRECT_URI", { infer: true }),
    });
  }

  @Public()
  @Post("register")
  async completeRegister(@Body() dto: OAuthCompleteRegisterRequestDto) {
    return this.complete.execute(dto);
  }

  @Post("link")
  async linkEndpoint(@CurrentUser() user: CurrentUserPayload, @Body() dto: OAuthCallbackRequestDto) {
    await this.link.execute({
      memberId: user.memberId,
      code: dto.code,
      redirectUri: dto.redirectUri ?? this.config.get("KAKAO_REDIRECT_URI", { infer: true }),
    });
    return { linked: true };
  }
}
```

### DTO

```typescript
// dto/oauth-callback.request.dto.ts
export class OAuthCallbackRequestDto {
  @IsString() code!: string;
  @IsOptional() @IsString() redirectUri?: string;
}

// dto/oauth-complete-register.request.dto.ts
export class OAuthCompleteRegisterRequestDto {
  @IsString() registrationToken!: string;
  @IsString() job!: string;
  @IsEnum(NotificationChannel) notification!: NotificationChannel;
  @IsEnum(NotificationFrequency) frequency!: NotificationFrequency;
}
```

---

## Step 11. 모듈 통합

`IdentityModule`에 OAuth 관련 모든 Provider/Controller 추가. (RegistrationTokenService 용 JwtModule은 이미 등록됨)

---

## Step 12. 테스트

### 12-1. Aggregate 단위 테스트

```typescript
describe("OAuthConnection", () => {
  it("connect → OAuthConnected 이벤트 1개 발행", () => {
    const conn = OAuthConnection.connect({ memberId: "m1", provider: OAuthProvider.KAKAO, providerId: "p1", email: "a@b.com" });
    expect(conn.uncommittedEvents[0].eventType).toBe("OAuthConnected");
  });

  it("disconnect 후 refreshToken 호출은 에러", () => {
    const conn = OAuthConnection.connect({ /* ... */ });
    conn.disconnect();
    expect(() => conn.refreshToken({ accessToken: "new", tokenExpiresInSec: 3600 })).toThrow();
  });

  it("replay로 복원", () => {
    const events = [/* OAuthConnected, OAuthTokenRefreshed */];
    const restored = new (OAuthConnection as any)() as OAuthConnection;
    restored.replay(events);
    expect(restored.isDisconnected).toBe(false);
  });
});
```

### 12-2. E2E (Kakao API mock)

```typescript
// test/e2e/oauth.e2e-spec.ts
class KakaoMockClient implements KakaoOAuthClient {
  exchangeCodeForToken = jest.fn().mockResolvedValue({ accessToken: "ak", refreshToken: "rk", expiresIn: 21600 });
  getUserInfo = jest.fn().mockResolvedValue({ providerId: "12345", email: "kakao@test.com", nickname: "k-user" });
  unlink = jest.fn().mockResolvedValue(undefined);
  refreshAccessToken = jest.fn();
}

describe("Kakao OAuth E2E", () => {
  let app: INestApplication;
  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(KAKAO_OAUTH_CLIENT).useClass(KakaoMockClient)
      .compile();
    app = mod.createNestApplication();
    await app.init();
  });

  it("최초 콜백 → REGISTRATION_REQUIRED 응답", async () => {
    const res = await request(app.getHttpServer()).post("/api/auth/kakao/callback")
      .send({ code: "code", redirectUri: "http://localhost:4173" }).expect(201);
    expect(res.body.status).toBe("REGISTRATION_REQUIRED");
    expect(res.body.registrationToken).toBeDefined();
  });

  it("complete-register 후 → DB에 member + oauth_connection 생성", async () => {
    const callback = await request(app.getHttpServer()).post("/api/auth/kakao/callback").send({ code: "code" });
    const res = await request(app.getHttpServer()).post("/api/auth/kakao/register").send({
      registrationToken: callback.body.registrationToken,
      job: "dev", notification: "EMAIL", frequency: "WEEKLY",
    }).expect(201);
    expect(res.body.memberId).toBeDefined();
    // DB 확인
  });

  it("회원 탈퇴 → OAuth Cleanup 발생", async () => {
    /* sign up + connect kakao → withdraw → oauth_connection_read 빈 상태 */
  });
});
```

---

## 검증 (Definition of Done)

```bash
pnpm exec mikro-orm migration:create
pnpm exec mikro-orm migration:up

pnpm test test/unit/identity/oauth
pnpm test:e2e
```

- [ ] OAuth E2E 통과
- [ ] 신규 → REGISTRATION_REQUIRED, 기존 → 즉시 로그인
- [ ] 회원 탈퇴 시 `OAuthDisconnected` 이벤트 발생 + `oauth_connection_read` 삭제 + Kakao unlink 호출
- [ ] `event_store`에 OAuth 관련 이벤트 시간순 기록

---

다음: [`08-operational-finalization.md`](./08-operational-finalization.md) — 마무리
