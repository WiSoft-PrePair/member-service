# 06. Auth Domain — JWT + Refresh Token

> **사전 조건**: Phase 05 완료 (Member E2E 그린)

## Goal

Member 도메인 위에 인증 계층을 올린다. JWT Access Token + DB 저장형 Refresh Token, Passport JWT Strategy + Guard, `@CurrentUser()` 데코레이터, 로그인/로그아웃/토큰갱신 시나리오 E2E.

> **결정**: RefreshToken을 Aggregate로 둘지 단순 엔티티로 둘지 결정. 본 가이드는 **Aggregate로 두지 않는다** — 비즈니스 로직이 거의 없고 사실상 데이터 저장체이며, 이벤트 소싱이 과한 복잡도가 된다. Event Store에 `MemberLoggedIn`/`MemberLoggedOut` 이벤트는 발행하되, RefreshToken 자체는 별도 정규 테이블 `refresh_token`으로 관리한다.

---

## 산출물 체크리스트

### Domain (`src/contexts/identity/domain/member/events/`)
- [ ] `member-logged-in.event.ts`
- [ ] `member-logged-out.event.ts`

### Application (`src/contexts/identity/application/auth/`)
- [ ] `ports/refresh-token.repository.port.ts`
- [ ] `ports/jwt.service.port.ts`
- [ ] `use-cases/login.use-case.ts`
- [ ] `use-cases/refresh-token.use-case.ts`
- [ ] `use-cases/logout.use-case.ts`
- [ ] `dto/auth-token.dto.ts`

### Member Aggregate 보강
- [ ] `Member.recordLogin()` / `Member.recordLogout()` 메서드 추가 (이벤트 발행)
- [ ] `MemberProjector`에 `MemberLoggedIn` 핸들러 — `activity` 배열에 날짜 append

### Infrastructure (`src/contexts/identity/infrastructure/`)
- [ ] `persistence/auth/refresh-token.entity.ts`
- [ ] `persistence/auth/mikro-refresh-token.repository.impl.ts`
- [ ] `security/jwt.service.impl.ts`
- [ ] `security/jwt.strategy.ts` (Passport)
- [ ] `security/jwt-auth.guard.ts`

### Shared Kernel
- [ ] `decorators/current-user.decorator.ts`
- [ ] `decorators/public.decorator.ts` (Phase 05에서 만든 것 유지)

### Presentation (`src/contexts/identity/presentation/auth/`)
- [ ] `auth.controller.ts`
- [ ] `dto/login.request.dto.ts`
- [ ] `dto/refresh-token.request.dto.ts`
- [ ] `dto/logout.request.dto.ts`

### 모듈
- [ ] `auth.module.ts` 또는 `IdentityModule`에 통합

### 테스트
- [ ] `test/unit/identity/auth/use-cases/login.use-case.spec.ts`
- [ ] `test/e2e/auth.e2e-spec.ts` — 로그인 → /me → 토큰갱신 → 로그아웃

---

## Step 1. 의존성

```bash
pnpm add @nestjs/jwt @nestjs/passport passport passport-jwt
pnpm add -D @types/passport-jwt
```

---

## Step 2. Member에 로그인/로그아웃 이벤트 + 메서드 추가

### 2-1. 새 이벤트

```typescript
// src/contexts/identity/domain/member/events/member-logged-in.event.ts
import { DomainEvent } from "../../shared/domain-event.base";
export interface MemberLoggedInPayload { loggedInAt: string; }
export class MemberLoggedInEvent extends DomainEvent<MemberLoggedInPayload> {
  public static readonly TYPE = "MemberLoggedIn";
  constructor(args: { aggregateId: string; eventVersion: number; payload: MemberLoggedInPayload }) {
    super({
      aggregateId: args.aggregateId,
      aggregateType: "Member",
      eventType: MemberLoggedInEvent.TYPE,
      eventVersion: args.eventVersion,
      payload: args.payload,
    });
  }
}

// member-logged-out.event.ts (동일 패턴, TYPE = "MemberLoggedOut")
```

### 2-2. Member Aggregate에 메서드 추가

```typescript
// member.aggregate.ts (추가)
public recordLogin(now: Date = new Date()): void {
  this.guardNotWithdrawn();
  this.raise(new MemberLoggedInEvent({
    aggregateId: this.id,
    eventVersion: this.version + 1,
    payload: { loggedInAt: now.toISOString() },
  }));
}

public recordLogout(now: Date = new Date()): void {
  this.guardNotWithdrawn();
  this.raise(new MemberLoggedOutEvent({
    aggregateId: this.id,
    eventVersion: this.version + 1,
    payload: { loggedOutAt: now.toISOString() },
  }));
}
```

`applyEvent` 추가:
```typescript
case MemberLoggedInEvent.TYPE:
case MemberLoggedOutEvent.TYPE:
  // 상태 변경 없음 (이벤트만 기록)
  return;
```

### 2-3. MemberProjector 보강

```typescript
@OnEvent(MemberLoggedInEvent.TYPE)
async onLoggedIn(event: DomainEvent): Promise<void> {
  const date = event.occurredAt.toISOString().slice(0, 10); // YYYY-MM-DD
  await this.read.appendActivity(event.aggregateId, date);
}
```

### 2-4. 테스트 추가

```typescript
// test/unit/identity/member/member.aggregate.spec.ts 추가
it("recordLogin은 MemberLoggedIn 이벤트 발행", () => {
  const m = Member.register(buildReq());
  m.recordLogin();
  const last = m.uncommittedEvents[m.uncommittedEvents.length - 1];
  expect(last.eventType).toBe("MemberLoggedIn");
});
```

---

## Step 3. Refresh Token Entity + Repository

### 3-1. Entity

```typescript
// src/contexts/identity/infrastructure/persistence/auth/refresh-token.entity.ts
import { Entity, Index, PrimaryKey, Property } from "@mikro-orm/core";

@Entity({ tableName: "refresh_token" })
export class RefreshTokenEntity {
  @PrimaryKey({ type: "uuid" })
  id!: string;

  @Property({ type: "uuid" })
  @Index()
  memberId!: string;

  @Property({ unique: true })
  @Index()
  token!: string;

  @Property({ type: "timestamptz" })
  expiresAt!: Date;

  @Property({ type: "timestamptz" })
  createdAt!: Date;
}
```

### 3-2. Port

```typescript
// src/contexts/identity/application/auth/ports/refresh-token.repository.port.ts
export const REFRESH_TOKEN_REPOSITORY = Symbol("REFRESH_TOKEN_REPOSITORY");

export interface RefreshTokenRecord {
  id: string;
  memberId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface RefreshTokenRepository {
  save(record: Omit<RefreshTokenRecord, "id" | "createdAt">): Promise<RefreshTokenRecord>;
  findByToken(token: string): Promise<RefreshTokenRecord | null>;
  deleteByToken(token: string): Promise<void>;
  deleteAllByMemberId(memberId: string): Promise<void>;
}
```

### 3-3. Repository 구현

```typescript
// src/contexts/identity/infrastructure/persistence/auth/mikro-refresh-token.repository.impl.ts
import { Injectable } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { randomUUID } from "node:crypto";

import type {
  RefreshTokenRecord,
  RefreshTokenRepository,
} from "@/contexts/identity/application/auth/ports/refresh-token.repository.port";

import { RefreshTokenEntity } from "./refresh-token.entity";

@Injectable()
export class MikroRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly em: EntityManager) {}

  async save(record: Omit<RefreshTokenRecord, "id" | "createdAt">): Promise<RefreshTokenRecord> {
    const fork = this.em.fork();
    const entity = fork.create(RefreshTokenEntity, {
      id: randomUUID(),
      ...record,
      createdAt: new Date(),
    });
    await fork.persistAndFlush(entity);
    return entity;
  }

  async findByToken(token: string): Promise<RefreshTokenRecord | null> {
    const fork = this.em.fork();
    return fork.findOne(RefreshTokenEntity, { token });
  }

  async deleteByToken(token: string): Promise<void> {
    const fork = this.em.fork();
    await fork.nativeDelete(RefreshTokenEntity, { token });
  }

  async deleteAllByMemberId(memberId: string): Promise<void> {
    const fork = this.em.fork();
    await fork.nativeDelete(RefreshTokenEntity, { memberId });
  }
}
```

---

## Step 4. JWT Service

### 4-1. Port

```typescript
// src/contexts/identity/application/auth/ports/jwt.service.port.ts
export const JWT_SERVICE = Symbol("JWT_SERVICE");

export interface JwtPayload {
  sub: string;
  email: string;
}

export interface AccessToken {
  accessToken: string;
  expiresInSec: number;
}

export interface IJwtService {
  issueAccessToken(payload: JwtPayload): AccessToken;
  verifyAccessToken(token: string): JwtPayload;
}
```

### 4-2. 구현

```typescript
// src/contexts/identity/infrastructure/security/jwt.service.impl.ts
import { Injectable } from "@nestjs/common";
import { JwtService as NestJwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";

import type { AccessToken, IJwtService, JwtPayload } from "@/contexts/identity/application/auth/ports/jwt.service.port";
import type { Env } from "@/config/env.config";

function parseExpires(spec: string): number {
  const m = spec.match(/^(\d+)([smhd])$/);
  if (!m) return 15 * 60;
  const v = Number(m[1]);
  return { s: v, m: v * 60, h: v * 3600, d: v * 86400 }[m[2] as "s" | "m" | "h" | "d"];
}

@Injectable()
export class JwtServiceImpl implements IJwtService {
  constructor(
    private readonly nestJwt: NestJwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  issueAccessToken(payload: JwtPayload): AccessToken {
    const expiresIn = this.config.get("JWT_ACCESS_TOKEN_EXPIRES_IN", { infer: true });
    return {
      accessToken: this.nestJwt.sign(payload, { expiresIn }),
      expiresInSec: parseExpires(expiresIn),
    };
  }

  verifyAccessToken(token: string): JwtPayload {
    return this.nestJwt.verify<JwtPayload>(token);
  }
}
```

### 4-3. Passport Strategy

```typescript
// src/contexts/identity/infrastructure/security/jwt.strategy.ts
import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";

import type { Env } from "@/config/env.config";
import type { JwtPayload } from "@/contexts/identity/application/auth/ports/jwt.service.port";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(config: ConfigService<Env, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get("JWT_SECRET", { infer: true }),
      ignoreExpiration: false,
    });
  }

  validate(payload: JwtPayload): { memberId: string; email: string } {
    return { memberId: payload.sub, email: payload.email };
  }
}
```

### 4-4. Guard + Decorator

```typescript
// src/contexts/identity/infrastructure/security/jwt-auth.guard.ts
import { ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import { IS_PUBLIC_KEY } from "@/shared-kernel/decorators/public.decorator";

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  constructor(private readonly reflector: Reflector) { super(); }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}
```

```typescript
// src/shared-kernel/decorators/public.decorator.ts
import { SetMetadata } from "@nestjs/common";
export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// src/shared-kernel/decorators/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from "@nestjs/common";
export interface CurrentUserPayload { memberId: string; email: string; }
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): CurrentUserPayload => ctx.switchToHttp().getRequest().user,
);
```

---

## Step 5. UseCases

### 5-1. LoginUseCase

```typescript
// src/contexts/identity/application/auth/use-cases/login.use-case.ts
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { randomBytes } from "node:crypto";

import { ConfigService } from "@nestjs/config";

import { MEMBER_REPOSITORY, type MemberRepository } from "@/contexts/identity/application/member/ports/member-event-sourced.repository.port";
import { MEMBER_READ_REPOSITORY, type MemberReadDto, type MemberReadRepository } from "@/contexts/identity/application/member/ports/member-read.repository.port";
import { PASSWORD_ENCODER, type PasswordEncoder } from "@/contexts/identity/application/member/ports/password-encoder.port";

import { JWT_SERVICE, type IJwtService } from "../ports/jwt.service.port";
import { REFRESH_TOKEN_REPOSITORY, type RefreshTokenRepository } from "../ports/refresh-token.repository.port";

import type { Env } from "@/config/env.config";

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
  member: MemberReadDto;
}

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(MEMBER_REPOSITORY) private readonly memberRepo: MemberRepository,
    @Inject(MEMBER_READ_REPOSITORY) private readonly memberRead: MemberReadRepository,
    @Inject(PASSWORD_ENCODER) private readonly encoder: PasswordEncoder,
    @Inject(JWT_SERVICE) private readonly jwt: IJwtService,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshRepo: RefreshTokenRepository,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async execute(req: { email: string; password: string }): Promise<LoginResult> {
    const readDto = await this.memberRead.findByEmail(req.email.toLowerCase());
    if (!readDto) throw new UnauthorizedException("Invalid credentials");

    const member = await this.memberRepo.load(readDto.id);
    if (!member) throw new UnauthorizedException("Invalid credentials");

    if (!member.password.matches(req.password, this.encoder)) {
      throw new UnauthorizedException("Invalid credentials");
    }

    member.recordLogin();
    await this.memberRepo.save(member);

    const access = this.jwt.issueAccessToken({ sub: member.id, email: member.email.value });
    const refreshToken = randomBytes(48).toString("hex");
    const refreshExpires = this.parseRefreshExpiry();
    await this.refreshRepo.save({
      memberId: member.id,
      token: refreshToken,
      expiresAt: new Date(Date.now() + refreshExpires * 1000),
    });

    return {
      accessToken: access.accessToken,
      refreshToken,
      expiresInSec: access.expiresInSec,
      member: readDto,
    };
  }

  private parseRefreshExpiry(): number {
    const spec = this.config.get("JWT_REFRESH_TOKEN_EXPIRES_IN", { infer: true });
    const m = spec.match(/^(\d+)([smhd])$/);
    if (!m) return 7 * 86400;
    const v = Number(m[1]);
    return { s: v, m: v * 60, h: v * 3600, d: v * 86400 }[m[2] as "s" | "m" | "h" | "d"];
  }
}
```

### 5-2. RefreshTokenUseCase

```typescript
// src/contexts/identity/application/auth/use-cases/refresh-token.use-case.ts
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { randomBytes } from "node:crypto";

import { MEMBER_READ_REPOSITORY, type MemberReadRepository } from "@/contexts/identity/application/member/ports/member-read.repository.port";

import { JWT_SERVICE, type IJwtService } from "../ports/jwt.service.port";
import { REFRESH_TOKEN_REPOSITORY, type RefreshTokenRepository } from "../ports/refresh-token.repository.port";

@Injectable()
export class RefreshTokenUseCase {
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshRepo: RefreshTokenRepository,
    @Inject(MEMBER_READ_REPOSITORY) private readonly memberRead: MemberReadRepository,
    @Inject(JWT_SERVICE) private readonly jwt: IJwtService,
  ) {}

  async execute(req: { refreshToken: string }): Promise<{ accessToken: string; refreshToken: string; expiresInSec: number }> {
    const record = await this.refreshRepo.findByToken(req.refreshToken);
    if (!record || record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const member = await this.memberRead.findById(record.memberId);
    if (!member) throw new UnauthorizedException();

    // Rotation: 기존 토큰 삭제 후 새 토큰 발급
    await this.refreshRepo.deleteByToken(req.refreshToken);
    const newRefresh = randomBytes(48).toString("hex");
    await this.refreshRepo.save({
      memberId: record.memberId,
      token: newRefresh,
      expiresAt: new Date(Date.now() + (record.expiresAt.getTime() - record.createdAt.getTime())),
    });

    const access = this.jwt.issueAccessToken({ sub: member.id, email: member.email });
    return { accessToken: access.accessToken, refreshToken: newRefresh, expiresInSec: access.expiresInSec };
  }
}
```

### 5-3. LogoutUseCase

```typescript
// src/contexts/identity/application/auth/use-cases/logout.use-case.ts
import { Inject, Injectable } from "@nestjs/common";

import { MEMBER_REPOSITORY, type MemberRepository } from "@/contexts/identity/application/member/ports/member-event-sourced.repository.port";
import { REFRESH_TOKEN_REPOSITORY, type RefreshTokenRepository } from "../ports/refresh-token.repository.port";

@Injectable()
export class LogoutUseCase {
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshRepo: RefreshTokenRepository,
    @Inject(MEMBER_REPOSITORY) private readonly memberRepo: MemberRepository,
  ) {}

  async execute(req: { refreshToken: string; memberId: string }): Promise<void> {
    await this.refreshRepo.deleteByToken(req.refreshToken);
    const member = await this.memberRepo.load(req.memberId);
    if (member) {
      member.recordLogout();
      await this.memberRepo.save(member);
    }
  }
}
```

---

## Step 6. Controller

```typescript
// src/contexts/identity/presentation/auth/auth.controller.ts
import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";

import { Public } from "@/shared-kernel/decorators/public.decorator";
import { CurrentUser, CurrentUserPayload } from "@/shared-kernel/decorators/current-user.decorator";
import { JwtAuthGuard } from "@/contexts/identity/infrastructure/security/jwt-auth.guard";

import { LoginUseCase } from "@/contexts/identity/application/auth/use-cases/login.use-case";
import { RefreshTokenUseCase } from "@/contexts/identity/application/auth/use-cases/refresh-token.use-case";
import { LogoutUseCase } from "@/contexts/identity/application/auth/use-cases/logout.use-case";

import { LoginRequestDto, RefreshTokenRequestDto, LogoutRequestDto } from "./dto";

@Controller("api/auth")
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(
    private readonly login: LoginUseCase,
    private readonly refresh: RefreshTokenUseCase,
    private readonly logout: LogoutUseCase,
  ) {}

  @Public()
  @Post("login")
  async loginEndpoint(@Body() dto: LoginRequestDto) {
    return this.login.execute(dto);
  }

  @Public()
  @Post("refresh")
  async refreshEndpoint(@Body() dto: RefreshTokenRequestDto) {
    return this.refresh.execute(dto);
  }

  @Post("logout")
  async logoutEndpoint(@CurrentUser() user: CurrentUserPayload, @Body() dto: LogoutRequestDto) {
    await this.logout.execute({ refreshToken: dto.refreshToken, memberId: user.memberId });
    return { logout: true };
  }

  @Get("me")
  async me(@CurrentUser() user: CurrentUserPayload) {
    return user;
  }
}
```

### DTO

```typescript
// dto/login.request.dto.ts
import { IsEmail, IsString, MinLength } from "class-validator";
export class LoginRequestDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(8) password!: string;
}

// dto/refresh-token.request.dto.ts
export class RefreshTokenRequestDto { @IsString() refreshToken!: string; }

// dto/logout.request.dto.ts
export class LogoutRequestDto { @IsString() refreshToken!: string; }
```

---

## Step 7. 모듈 통합

`IdentityModule`에 추가:

```typescript
imports: [
  /* ... */
  MikroOrmModule.forFeature([MemberReadEntity, RefreshTokenEntity]),
  PassportModule.register({ defaultStrategy: "jwt" }),
  JwtModule.registerAsync({
    inject: [ConfigService],
    useFactory: (c: ConfigService<Env, true>) => ({
      secret: c.get("JWT_SECRET", { infer: true }),
      signOptions: { expiresIn: c.get("JWT_ACCESS_TOKEN_EXPIRES_IN", { infer: true }) },
    }),
  }),
],
providers: [
  /* ... existing */
  MikroRefreshTokenRepository,
  { provide: REFRESH_TOKEN_REPOSITORY, useExisting: MikroRefreshTokenRepository },

  JwtServiceImpl,
  { provide: JWT_SERVICE, useExisting: JwtServiceImpl },

  JwtStrategy,
  JwtAuthGuard,

  LoginUseCase,
  RefreshTokenUseCase,
  LogoutUseCase,
],
controllers: [MemberController, AuthController],
```

`main.ts`에 global guard:
```typescript
import { Reflector } from "@nestjs/core";
import { JwtAuthGuard } from "@/contexts/identity/infrastructure/security/jwt-auth.guard";

app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector)));
```

> 이로써 모든 엔드포인트가 기본 보호되고, `@Public()`만 공개된다.
> Phase 05에서 만든 Member endpoint들에 `@Public()` 또는 인증 필요 여부를 명시해야 함:
> - `POST /api/members/register`, `POST /api/members/email`, `POST /api/members/email-verify`, `POST /api/members/password-reset`, `GET /api/members?email=...` → `@Public()`
> - 나머지 → 인증 필요 (`@CurrentUser()`로 본인 검증)

---

## Step 8. 테스트

### 8-1. LoginUseCase 단위 테스트

```typescript
// test/unit/identity/auth/use-cases/login.use-case.spec.ts
describe("LoginUseCase", () => {
  it("정상 로그인 시 access/refresh 발급 + recordLogin 이벤트 발행", async () => {
    // setup: in-memory event store, member 가입
    // act: login.execute({email, password})
    // assert: accessToken 발급, refresh 저장, MemberLoggedIn 발행
  });

  it("비밀번호 불일치 시 UnauthorizedException", async () => {
    /* ... */
  });

  it("존재하지 않는 이메일 시 UnauthorizedException", async () => {
    /* ... */
  });
});
```

### 8-2. E2E

```typescript
// test/e2e/auth.e2e-spec.ts
describe("Auth E2E", () => {
  let app: INestApplication;
  let memberId: string;
  let accessToken: string;
  let refreshToken: string;
  const password = "password123";
  const email = `auth-${Date.now()}@test.com`;

  beforeAll(async () => {
    /* app setup, sign up member with email/password */
  });

  it("POST /api/auth/login → access/refresh 발급", async () => {
    const res = await request(app.getHttpServer()).post("/api/auth/login").send({ email, password }).expect(201);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    accessToken = res.body.accessToken;
    refreshToken = res.body.refreshToken;
  });

  it("GET /api/auth/me with Bearer → 본인 정보", async () => {
    const res = await request(app.getHttpServer()).get("/api/auth/me")
      .set("Authorization", `Bearer ${accessToken}`).expect(200);
    expect(res.body.email).toBe(email);
  });

  it("GET /api/auth/me without token → 401", async () => {
    await request(app.getHttpServer()).get("/api/auth/me").expect(401);
  });

  it("POST /api/auth/refresh → 새 토큰", async () => {
    const res = await request(app.getHttpServer()).post("/api/auth/refresh").send({ refreshToken }).expect(201);
    expect(res.body.accessToken).not.toBe(accessToken);
    expect(res.body.refreshToken).not.toBe(refreshToken);
    refreshToken = res.body.refreshToken;
  });

  it("POST /api/auth/logout → refresh 무효화 + MemberLoggedOut 발행", async () => {
    const login = await request(app.getHttpServer()).post("/api/auth/login").send({ email, password });
    await request(app.getHttpServer()).post("/api/auth/logout")
      .set("Authorization", `Bearer ${login.body.accessToken}`)
      .send({ refreshToken: login.body.refreshToken }).expect(201);
    // 같은 refresh로 다시 갱신 시도 → 401
    await request(app.getHttpServer()).post("/api/auth/refresh").send({ refreshToken: login.body.refreshToken }).expect(401);
  });
});
```

---

## 검증 (Definition of Done)

```bash
pnpm exec mikro-orm migration:create  # refresh_token 테이블 마이그레이션
pnpm exec mikro-orm migration:up

pnpm test test/unit/identity/auth
pnpm test:e2e

# event_store에 로그인 이벤트 기록 확인
docker exec -it prepair-db psql -U prepair -d prepair -c "SELECT event_type, occurred_at FROM event_store WHERE event_type IN ('MemberLoggedIn','MemberLoggedOut') ORDER BY sequence DESC LIMIT 5;"
```

체크리스트:
- [ ] Login E2E 통과
- [ ] /me 인증 동작
- [ ] Refresh 토큰 회전(rotation) 동작
- [ ] Logout 후 같은 refresh로 갱신 실패
- [ ] `MemberLoggedIn` 이벤트가 `event_store`에 기록되고 `member_read.activity`에 날짜 append

---

다음: [`07-oauth-domain.md`](./07-oauth-domain.md) — Kakao OAuth
