# Authentication (Login) 구현 가이드

> CQRS 패턴 미적용 - 전통적인 Service 패턴 기반 JWT 인증 (Access Token + Refresh Token)

## 목차

1. [개요](#개요)
2. [설계 결정](#설계-결정)
3. [아키텍처 구조](#아키텍처-구조)
4. [폴더 구조](#폴더-구조)
5. [상세 구현](#상세-구현)
6. [API 명세](#api-명세)
7. [사용법](#사용법)
8. [확장 가이드](#확장-가이드)

---

## 개요

### 목표

Member 도메인과 달리, Authentication(로그인)은 **CQRS 패턴을 적용하지 않고** 전통적인 Service 패턴으로 구현합니다.

**이유**:
- 상태 변경 없음 (Command 불필요)
- 단순 조회 + 검증 로직 (Query만 필요)
- Event Sourcing 불필요 (감사 추적 불필요)
- 복잡한 비즈니스 로직 없음

### 토큰 전략

| 토큰 | 용도 | 만료 시간 | 저장 위치 |
|-----|------|----------|----------|
| **Access Token** | API 인증 | 15분 | 클라이언트 메모리 |
| **Refresh Token** | Access Token 재발급 | 7일 | DB + HttpOnly Cookie |

### 사용 기술

| 기술 | 용도 | 버전 |
|-----|-----|-----|
| `@nestjs/jwt` | JWT 토큰 발급/검증 | ^10.x |
| `@nestjs/passport` | 인증 전략 관리 | ^10.x |
| `passport-jwt` | JWT Strategy | ^4.x |
| `bcrypt` | 비밀번호 검증 (기존 활용) | ^5.x |

---

## 설계 결정

### 1. CQRS vs Service 패턴 비교

| 측면 | Member (CQRS) | Auth (Service) |
|------|--------------|---------------|
| **패턴** | CommandHandler + QueryHandler | Service |
| **상태 변경** | ✅ 회원가입, 탈퇴 | ❌ 상태 변경 없음 |
| **이벤트** | ✅ MemberRegisterEvent | ❌ 이벤트 불필요 |
| **저장소** | Write + Read 분리 | Read만 사용 |
| **복잡도** | 높음 (Event Sourcing) | 낮음 (단순 검증) |
| **확장성** | 매우 높음 | 중간 |

### 2. 기존 인프라 재사용

Authentication은 Member 도메인의 인프라를 재사용합니다:

```typescript
✅ MemberReadRepository    // 회원 조회
✅ PasswordEncoder          // 비밀번호 검증 (bcrypt)
✅ Password Value Object    // 도메인 로직 (matches 메서드)
```

### 3. Member 도메인 수정 불필요 (DDD 관점)

로그인 기능 구현 시 **Member 애그리게이트를 수정하지 않습니다**.

#### 이유

| 관점 | 설명 |
|-----|------|
| **상태 변경 없음** | 로그인은 회원 데이터를 읽고 검증만 함. 회원의 상태(email, password, point 등)가 변경되지 않음 |
| **Command가 아님** | CQRS 관점에서 로그인은 Query에 가까움 (자격 증명 검증 후 토큰 발급) |
| **도메인 로직 재사용** | `Password` Value Object의 `fromHashed()`, `matches()` 메서드만 재사용 |
| **관심사 분리** | Authentication은 Member 도메인의 핵심 비즈니스 로직이 아닌 인프라/어플리케이션 레벨 관심사 |

#### 재사용하는 도메인 로직

```typescript
// Password Value Object (src/domain/member/value-objects/password.ts)
Password.fromHashed(hashedPassword)  // DB에서 조회한 해시값으로 복원
password.matches(plainPassword, encoder)  // 비밀번호 일치 여부 검증
```

#### Member 수정이 필요한 경우 (현재 요구사항 아님)

다음 요구사항이 추가될 경우 Member 수정 고려:
- 로그인 시 `lastLoginAt` 필드 업데이트
- 로그인 실패 횟수 추적 (`loginFailCount`)
- 계정 잠금 상태 관리 (`isLocked`)

이 경우에도 `Member.recordLogin()`이나 `Member.incrementFailedAttempts()` 같은 **별도 Command로 분리**하는 것이 적절합니다.

### 4. domain/auth 불필요 (예외 처리)

Authentication은 도메인 레이어가 아니므로 **NestJS 내장 예외**를 사용합니다:

```typescript
// ❌ domain/auth/exceptions/ 생성하지 않음
// ✅ NestJS 내장 예외 사용
import { UnauthorizedException, NotFoundException } from '@nestjs/common';

throw new NotFoundException('존재하지 않는 회원입니다.');
throw new UnauthorizedException('이메일 또는 비밀번호가 일치하지 않습니다.');
```

**이유**:
- 인증은 "비즈니스 도메인"이 아닌 인프라/어플리케이션 관심사
- `DomainException` 상속이 의미상 맞지 않음
- Service 패턴과 일관성 유지

### 5. 읽기 모델에 Password 추가

로그인 시 비밀번호 검증을 위해 `MemberReadEntity`에 `password` 필드를 추가했습니다.

**파일**: `src/adapter/member/persistence/read/entity/member-read.entity.ts:12`

```typescript
@Entity({ tableName: "member_read" })
export class MemberReadEntity {
  @PrimaryKey()
  id!: string;

  @Property()
  email!: string;

  @Property()
  password!: string;  // 추가됨 (해시된 비밀번호)

  // ... 다른 필드들
}
```

**EventHandler 수정**: `src/application/member/event/member-register-event-handler.service.ts:29-38`

```typescript
// 쓰기 모델에서 password 조회 후 읽기 모델에 복사
const writeEntity = await this.em.findOne(MemberEntity, { id: event.memberId });
readEntity.password = writeEntity.password;
```

---

## 아키텍처 구조

### 계층별 역할

```
┌─────────────────────────────────────────────────────────┐
│              Adapter Layer (API)                        │
│  AuthController (login, refresh, logout, me)            │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│           Application Layer (Service)                   │
│  AuthService.login() / RefreshTokenService              │
│           (CQRS 미적용 - 일반 서비스)                   │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│            Domain Layer (재사용)                        │
│  Password.matches() - 비밀번호 검증                     │
│  PasswordEncoder - bcrypt 검증                          │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│         Infrastructure (Persistence)                    │
│  MemberReadRepository / RefreshTokenRepository          │
└─────────────────────────────────────────────────────────┘
```

### 인증 흐름

#### 로그인 (Login)

```
1. POST /auth/login { email, password }
   ↓
2. AuthController → AuthService.login()
   ↓
3. MemberReadRepository.findByEmail(email)
   ↓
4. Password.fromHashed(hashedPassword)
   ↓
5. password.matches(plainPassword, encoder)
   ↓
6. JwtService.generateAccessToken(memberId, email)
   ↓
7. RefreshTokenService.create(memberId)
   ↓
8. { accessToken, refreshToken, expiresIn, memberId }
```

#### 토큰 갱신 (Refresh)

```
1. POST /auth/refresh { refreshToken }
   ↓
2. RefreshTokenService.verify(refreshToken)
   ↓
3. MemberReadRepository.findById(memberId)
   ↓
4. RefreshTokenService.rotate(oldToken, memberId)  // 기존 토큰 삭제 + 새 토큰 발급
   ↓
5. JwtService.generateAccessToken(memberId, email)
   ↓
6. { accessToken, refreshToken, expiresIn }
```

#### 로그아웃 (Logout)

```
1. POST /auth/logout { refreshToken }
   ↓
2. RefreshTokenService.revoke(refreshToken)
   ↓
3. { success: true }
```

---

## 폴더 구조

```
src/
├── application/auth/
│   ├── auth.service.ts                         # 로그인 서비스 (CQRS 미적용)
│   ├── refresh-token.service.ts                # Refresh Token 관리
│   ├── types/
│   │   └── login-result.ts                     # { memberId, email }
│   └── index.ts
│
└── adapter/auth/
    ├── auth.module.ts                          # 모듈 와이어링
    ├── api/
    │   ├── auth.controller.ts                  # REST API
    │   ├── dto/
    │   │   ├── login-request.dto.ts            # 로그인 입력
    │   │   ├── login-response.dto.ts           # 로그인 응답
    │   │   ├── refresh-request.dto.ts          # 토큰 갱신 입력
    │   │   ├── refresh-response.dto.ts         # 토큰 갱신 응답
    │   │   └── logout-request.dto.ts           # 로그아웃 입력
    │   └── decorators/
    │       └── current-user.decorator.ts       # @CurrentUser() 데코레이터
    ├── persistence/
    │   ├── entity/
    │   │   └── refresh-token.entity.ts         # Refresh Token 엔티티
    │   ├── refresh-token.repository.ts         # Repository 인터페이스
    │   └── refresh-token.repository-impl.ts    # Repository 구현체
    └── security/
        ├── jwt.service.ts                      # JWT 발급/검증
        ├── jwt.strategy.ts                     # Passport JWT Strategy
        ├── jwt-auth.guard.ts                   # 인증 가드
        └── index.ts
```

---

## 상세 구현

### 1. Application Layer

#### AuthService (로그인 서비스)

**파일**: `src/application/auth/auth.service.ts`

```typescript
import { Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import {
  Password,
  PASSWORD_ENCODER,
  type PasswordEncoder,
} from '@/domain/member';
import {
  MEMBER_READ_REPOSITORY,
  type MemberReadRepository,
} from '@/adapter/member/persistence/read/member-read.repository';
import type { LoginResult } from './types/login-result';

export interface LoginRequest {
  email: string;
  password: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(MEMBER_READ_REPOSITORY)
    private readonly memberReadRepository: MemberReadRepository,
    @Inject(PASSWORD_ENCODER)
    private readonly passwordEncoder: PasswordEncoder,
  ) {}

  /**
   * 로그인 처리 (CQRS 미적용)
   * - MemberReadRepository에서 회원 조회
   * - Password value object로 비밀번호 검증
   */
  async login(request: LoginRequest): Promise<LoginResult> {
    // 1. 이메일로 회원 조회
    const member = await this.memberReadRepository.findByEmail(request.email);
    if (!member) {
      throw new NotFoundException('존재하지 않는 회원입니다.');
    }

    // 2. 비밀번호 검증 (도메인 로직 재사용)
    const password = Password.fromHashed(member.password);
    const isValid = password.matches(request.password, this.passwordEncoder);

    if (!isValid) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 일치하지 않습니다.');
    }

    // 3. 로그인 성공 - memberId와 email 반환
    return {
      memberId: member.id,
      email: member.email,
    };
  }
}
```

#### RefreshTokenService

**파일**: `src/application/auth/refresh-token.service.ts`

```typescript
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
} from '@/adapter/auth/persistence/refresh-token.repository';

@Injectable()
export class RefreshTokenService {
  // Refresh Token 만료 시간: 7일
  private readonly REFRESH_TOKEN_EXPIRES_IN_MS = 7 * 24 * 60 * 60 * 1000;

  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokenRepository: RefreshTokenRepository,
  ) {}

  /**
   * 새 Refresh Token 생성
   */
  async create(memberId: string): Promise<string> {
    const token = randomBytes(64).toString('hex');
    const expiresAt = new Date(Date.now() + this.REFRESH_TOKEN_EXPIRES_IN_MS);

    await this.refreshTokenRepository.save({
      id: randomUUID(),
      memberId,
      token,
      expiresAt,
      createdAt: new Date(),
    });

    return token;
  }

  /**
   * Refresh Token 검증
   * @returns memberId
   */
  async verify(token: string): Promise<string> {
    const refreshToken = await this.refreshTokenRepository.findByToken(token);

    if (!refreshToken) {
      throw new UnauthorizedException('유효하지 않은 Refresh Token입니다.');
    }

    if (refreshToken.expiresAt < new Date()) {
      // 만료된 토큰 삭제
      await this.refreshTokenRepository.delete(refreshToken.id);
      throw new UnauthorizedException('만료된 Refresh Token입니다.');
    }

    return refreshToken.memberId;
  }

  /**
   * Refresh Token 갱신 (Rotation)
   * - 기존 토큰 삭제 후 새 토큰 발급
   * - Refresh Token Rotation으로 보안 강화
   */
  async rotate(oldToken: string, memberId: string): Promise<string> {
    // 기존 토큰 삭제
    await this.refreshTokenRepository.deleteByToken(oldToken);

    // 새 토큰 발급
    return this.create(memberId);
  }

  /**
   * Refresh Token 폐기 (로그아웃)
   */
  async revoke(token: string): Promise<void> {
    await this.refreshTokenRepository.deleteByToken(token);
  }

  /**
   * 특정 회원의 모든 Refresh Token 폐기 (전체 로그아웃)
   */
  async revokeAll(memberId: string): Promise<void> {
    await this.refreshTokenRepository.deleteByMemberId(memberId);
  }
}
```

---

### 2. Adapter Layer - Persistence

#### RefreshToken Entity

**파일**: `src/adapter/auth/persistence/entity/refresh-token.entity.ts`

```typescript
import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

@Entity({ tableName: 'refresh_tokens' })
export class RefreshTokenEntity {
  @PrimaryKey()
  id!: string;

  @Property()
  memberId!: string;

  @Property({ unique: true })
  token!: string;

  @Property()
  expiresAt!: Date;

  @Property()
  createdAt!: Date;
}
```

#### RefreshToken Repository Interface

**파일**: `src/adapter/auth/persistence/refresh-token.repository.ts`

```typescript
import type { RefreshTokenEntity } from './entity/refresh-token.entity';

export const REFRESH_TOKEN_REPOSITORY = Symbol('REFRESH_TOKEN_REPOSITORY');

export interface RefreshTokenRepository {
  save(entity: RefreshTokenEntity): Promise<void>;
  findByToken(token: string): Promise<RefreshTokenEntity | null>;
  delete(id: string): Promise<void>;
  deleteByToken(token: string): Promise<void>;
  deleteByMemberId(memberId: string): Promise<void>;
}
```

#### RefreshToken Repository Implementation

**파일**: `src/adapter/auth/persistence/refresh-token.repository-impl.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { RefreshTokenEntity } from './entity/refresh-token.entity';
import type { RefreshTokenRepository } from './refresh-token.repository';

@Injectable()
export class RefreshTokenRepositoryImpl implements RefreshTokenRepository {
  constructor(private readonly em: EntityManager) {}

  async save(entity: RefreshTokenEntity): Promise<void> {
    const refreshToken = this.em.create(RefreshTokenEntity, entity);
    await this.em.persistAndFlush(refreshToken);
  }

  async findByToken(token: string): Promise<RefreshTokenEntity | null> {
    return this.em.findOne(RefreshTokenEntity, { token });
  }

  async delete(id: string): Promise<void> {
    const entity = await this.em.findOne(RefreshTokenEntity, { id });
    if (entity) {
      await this.em.removeAndFlush(entity);
    }
  }

  async deleteByToken(token: string): Promise<void> {
    const entity = await this.em.findOne(RefreshTokenEntity, { token });
    if (entity) {
      await this.em.removeAndFlush(entity);
    }
  }

  async deleteByMemberId(memberId: string): Promise<void> {
    await this.em.nativeDelete(RefreshTokenEntity, { memberId });
  }
}
```

---

### 3. Adapter Layer - Security

#### JWT Service

**파일**: `src/adapter/auth/security/jwt.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService as NestJwtService } from '@nestjs/auth';

export interface JwtPayload {
  sub: string; // memberId
  email: string;
}

export interface TokenResponse {
  accessToken: string;
  expiresIn: number;
}

@Injectable()
export class JwtService {
  private readonly accessTokenExpiresIn: number;

  constructor(
    private readonly jwtService: NestJwtService,
    private readonly configService: ConfigService,
  ) {
    // JWT_ACCESS_TOKEN_EXPIRES_IN 환경 변수에서 초 단위로 파싱 (기본값: 900초 = 15분)
    const expiresIn = this.configService.get<string>('JWT_ACCESS_TOKEN_EXPIRES_IN', '15m');
    this.accessTokenExpiresIn = this.parseExpiresIn(expiresIn);
  }

  /**
   * Access Token 발급
   */
  generateAccessToken(memberId: string, email: string): TokenResponse {
    const payload: JwtPayload = {
      sub: memberId,
      email,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      expiresIn: this.accessTokenExpiresIn,
    };
  }

  /**
   * Token 검증 및 payload 추출
   */
  verify(token: string): JwtPayload {
    return this.jwtService.verify<JwtPayload>(token);
  }

  /**
   * 만료 시간 문자열을 초 단위로 변환
   * @example '15m' → 900, '1h' → 3600, '7d' → 604800
   */
  private parseExpiresIn(expiresIn: string): number {
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 900; // 기본값 15분
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 60 * 60;
      case 'd': return value * 60 * 60 * 24;
      default: return 900;
    }
  }
}
```

#### JWT Strategy

**파일**: `src/adapter/auth/security/jwt.strategy.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-auth';
import type { JwtPayload } from './auth.service';

/**
 * JWT 인증 전략
 * - Authorization: Bearer <token> 헤더에서 토큰 추출
 * - 토큰 검증 후 req.user에 payload 주입
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  /**
   * Passport가 토큰 검증 후 자동 호출
   * 반환값이 req.user에 할당됨
   */
  async validate(payload: JwtPayload) {
    return {
      memberId: payload.sub,
      email: payload.email,
    };
  }
}
```

#### JWT Auth Guard

**파일**: `src/adapter/auth/security/jwt-auth.guard.ts`

```typescript
import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * JWT 인증 가드
 * - 컨트롤러/핸들러에 @UseGuards(JwtAuthGuard) 데코레이터로 적용
 * - Authorization 헤더 검증 후 req.user 주입
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('auth') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }
}
```

---

### 4. Adapter Layer - API

#### DTOs

**파일**: `src/adapter/auth/api/dto/login-request.dto.ts`

```typescript
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginRequestDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
```

**파일**: `src/adapter/auth/api/dto/login-response.dto.ts`

```typescript
export class LoginResponseDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  memberId: string;

  constructor(
    accessToken: string,
    refreshToken: string,
    expiresIn: number,
    memberId: string,
  ) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.expiresIn = expiresIn;
    this.memberId = memberId;
  }
}
```

**파일**: `src/adapter/auth/api/dto/refresh-request.dto.ts`

```typescript
import { IsString } from 'class-validator';

export class RefreshRequestDto {
  @IsString()
  refreshToken!: string;
}
```

**파일**: `src/adapter/auth/api/dto/refresh-response.dto.ts`

```typescript
export class RefreshResponseDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;

  constructor(accessToken: string, refreshToken: string, expiresIn: number) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.expiresIn = expiresIn;
  }
}
```

**파일**: `src/adapter/auth/api/dto/logout-request.dto.ts`

```typescript
import { IsString } from 'class-validator';

export class LogoutRequestDto {
  @IsString()
  refreshToken!: string;
}
```

#### Controller

**파일**: `src/adapter/auth/api/auth.controller.ts`

```typescript
import { Body, Controller, Get, Inject, Post, UseGuards } from '@nestjs/common';
import { AuthService } from '@/application/auth';
import { RefreshTokenService } from '@/application/auth/refresh-token.service';
import {
  MEMBER_READ_REPOSITORY,
  type MemberReadRepository,
} from '@/adapter/member/persistence/read/member-read.repository';
import { JwtService, JwtAuthGuard } from '../security';
import {
  LoginRequestDto,
  LoginResponseDto,
  RefreshRequestDto,
  RefreshResponseDto,
  LogoutRequestDto,
} from './dto';
import { CurrentUser } from './decorators/current-user.decorator';

/**
 * 인증 API 컨트롤러
 * - CQRS 패턴 미적용 (전통적인 Service 패턴)
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly jwtService: JwtService,
    @Inject(MEMBER_READ_REPOSITORY)
    private readonly memberReadRepository: MemberReadRepository,
  ) {}

  /**
   * 로그인
   * POST /auth/login
   */
  @Post('login')
  async login(@Body() dto: LoginRequestDto): Promise<LoginResponseDto> {
    // 1. 인증 처리 (이메일/비밀번호 검증)
    const loginResult = await this.authService.login({
      email: dto.email,
      password: dto.password,
    });

    // 2. Access Token 발급
    const accessToken = this.jwtService.generateAccessToken(
      loginResult.memberId,
      loginResult.email,
    );

    // 3. Refresh Token 발급
    const refreshToken = await this.refreshTokenService.create(loginResult.memberId);

    // 4. 응답 DTO 반환
    return new LoginResponseDto(
      accessToken.accessToken,
      refreshToken,
      accessToken.expiresIn,
      loginResult.memberId,
    );
  }

  /**
   * 토큰 갱신
   * POST /auth/refresh
   */
  @Post('refresh')
  async refresh(@Body() dto: RefreshRequestDto): Promise<RefreshResponseDto> {
    // 1. Refresh Token 검증
    const memberId = await this.refreshTokenService.verify(dto.refreshToken);

    // 2. 회원 정보 조회
    const member = await this.memberReadRepository.findById(memberId);
    if (!member) {
      throw new Error('회원 정보를 찾을 수 없습니다.');
    }

    // 3. Refresh Token Rotation (기존 토큰 삭제 + 새 토큰 발급)
    const newRefreshToken = await this.refreshTokenService.rotate(
      dto.refreshToken,
      memberId,
    );

    // 4. 새 Access Token 발급
    const accessToken = this.jwtService.generateAccessToken(member.id, member.email);

    // 5. 응답 반환
    return new RefreshResponseDto(
      accessToken.accessToken,
      newRefreshToken,
      accessToken.expiresIn,
    );
  }

  /**
   * 로그아웃
   * POST /auth/logout
   */
  @Post('logout')
  async logout(@Body() dto: LogoutRequestDto): Promise<{ success: boolean }> {
    await this.refreshTokenService.revoke(dto.refreshToken);
    return { success: true };
  }

  /**
   * 현재 로그인한 사용자 정보 조회
   * GET /auth/me
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getProfile(@CurrentUser() user: { memberId: string; email: string }) {
    return {
      memberId: user.memberId,
      email: user.email,
    };
  }
}
```

#### @CurrentUser Decorator

**파일**: `src/adapter/auth/api/decorators/current-user.decorator.ts`

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * 현재 로그인한 사용자 정보 추출 데코레이터
 * - JwtAuthGuard 사용 시 req.user에서 정보 추출
 *
 * @example
 * @Get('profile')
 * @UseGuards(JwtAuthGuard)
 * async getProfile(@CurrentUser() user: { memberId: string; email: string }) {
 *   return user;
 * }
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
```

---

### 5. Module 구성

#### AuthModule

**파일**: `src/adapter/auth/auth.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/auth';
import { PassportModule } from '@nestjs/passport';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { AuthService, RefreshTokenService } from '@/application/auth';
import { MemberModule } from '../member/member.module';
import { AuthController } from './api/auth.controller';
import { RefreshTokenEntity } from './persistence/entity/refresh-token.entity';
import {
  REFRESH_TOKEN_REPOSITORY,
} from './persistence/refresh-token.repository';
import { RefreshTokenRepositoryImpl } from './persistence/refresh-token.repository.impl';
import { JwtService, JwtStrategy } from './security';

@Module({
  imports: [
    // Passport 기본 설정
    PassportModule.register({ defaultStrategy: 'auth' }),

    // JWT 모듈 설정 (ConfigService 주입)
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_ACCESS_TOKEN_EXPIRES_IN', '15m'),
        },
      }),
    }),

    // MikroORM - RefreshToken 엔티티 등록
    MikroOrmModule.forFeature([RefreshTokenEntity]),

    // MemberReadRepository, PasswordEncoder 사용을 위해 import
    MemberModule,
  ],
  controllers: [AuthController],
  providers: [
    // Application Service (CQRS 미적용)
    AuthService,
    RefreshTokenService,

    // Repository
    {
      provide: REFRESH_TOKEN_REPOSITORY,
      useClass: RefreshTokenRepositoryImpl,
    },

    // Security
    JwtService,
    JwtStrategy,
  ],
  exports: [JwtService, JwtAuthGuard], // 다른 모듈에서 JWT 검증이 필요한 경우
})
export class AuthModule {}
```

**의존성 그래프**:
```
AuthModule
  ├─ imports
  │   ├─ PassportModule (전략: jwt)
  │   ├─ JwtModule (secret, expiresIn from ConfigService)
  │   ├─ MikroOrmModule.forFeature([RefreshTokenEntity])
  │   └─ MemberModule
  │       └─ exports: [PASSWORD_ENCODER, MEMBER_READ_REPOSITORY]
  └─ providers
      ├─ AuthService (← PASSWORD_ENCODER, MEMBER_READ_REPOSITORY)
      ├─ RefreshTokenService (← REFRESH_TOKEN_REPOSITORY)
      ├─ RefreshTokenRepositoryImpl
      ├─ JwtService
      └─ JwtStrategy (← ConfigService)
```

#### MemberModule 수정

**파일**: `src/adapter/member/member.module.ts:53`

```typescript
// PASSWORD_ENCODER를 exports에 추가
exports: [MEMBER_REPOSITORY, MEMBER_READ_REPOSITORY, PASSWORD_ENCODER],
```

---

### 6. 환경 변수 설정

#### env.config.ts

**파일**: `src/config/env.config.ts`

```typescript
export const envSchema = z.object({
  NODE_ENV: z.enum(["dev", "prod", "test"]),
  POSTGRES_HOST: z.string().default("localhost"),
  POSTGRES_PORT: z.coerce.number().default(5432),
  POSTGRES_USER: z.string(),
  POSTGRES_PASSWORD: z.string(),
  POSTGRES_DB: z.string(),

  // JWT 설정
  JWT_SECRET: z.string().min(32, "JWT_SECRET은 최소 32자 이상이어야 합니다."),
  JWT_ACCESS_TOKEN_EXPIRES_IN: z.string().default("15m"),  // Access Token 만료 시간
  JWT_REFRESH_TOKEN_EXPIRES_IN: z.string().default("7d"),  // Refresh Token 만료 시간
});
```

#### .env

**파일**: `.env`

```env
NODE_ENV=dev

# Docker
POSTGRES_USER=prepair
POSTGRES_PASSWORD=prepair
POSTGRES_DB=prepair
POSTGRES_PORT=65432

# JWT Authentication
JWT_SECRET=your-super-secret-key-change-this-in-production-minimum-32-characters
JWT_ACCESS_TOKEN_EXPIRES_IN=15m
JWT_REFRESH_TOKEN_EXPIRES_IN=7d
```

---

## API 명세

### 1. 로그인

#### Request

```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

#### Response (Success)

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "a1b2c3d4e5f6...",
  "expiresIn": 900,
  "memberId": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### Response (Error)

```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "statusCode": 401,
  "message": "이메일 또는 비밀번호가 일치하지 않습니다.",
  "error": "Unauthorized"
}
```

---

### 2. 토큰 갱신

#### Request

```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "a1b2c3d4e5f6..."
}
```

#### Response (Success)

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "x7y8z9...",
  "expiresIn": 900
}
```

#### Response (Error)

```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "statusCode": 401,
  "message": "만료된 Refresh Token입니다.",
  "error": "Unauthorized"
}
```

---

### 3. 로그아웃

#### Request

```http
POST /auth/logout
Content-Type: application/json

{
  "refreshToken": "a1b2c3d4e5f6..."
}
```

#### Response (Success)

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true
}
```

---

### 4. 현재 사용자 조회

#### Request

```http
GET /auth/me
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Response

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "memberId": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com"
}
```

---

## 사용법

### 1. 의존성 설치

```bash
npm install @nestjs/auth @nestjs/passport passport passport-auth
npm install -D @types/passport-auth
```

### 2. 환경 변수 설정

`.env` 파일에 JWT 설정 추가:

```env
JWT_SECRET=your-super-secret-key-change-this-in-production-minimum-32-characters
JWT_ACCESS_TOKEN_EXPIRES_IN=15m
JWT_REFRESH_TOKEN_EXPIRES_IN=7d
```

### 3. 서버 실행

```bash
npm run start:dev
```

### 4. 테스트

#### (1) 회원가입

```bash
curl -X POST http://localhost:3000/members/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "job": "developer",
    "nickname": "testuser",
    "notification": "EMAIL",
    "frequency": "WEEKLY"
  }'
```

#### (2) 로그인

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

응답:
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "a1b2c3d4e5f6...",
  "expiresIn": 900,
  "memberId": "..."
}
```

#### (3) 인증된 요청

```bash
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

curl http://localhost:3000/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

#### (4) 토큰 갱신

```bash
REFRESH_TOKEN="a1b2c3d4e5f6..."

curl -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\": \"$REFRESH_TOKEN\"}"
```

#### (5) 로그아웃

```bash
curl -X POST http://localhost:3000/auth/logout \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\": \"$REFRESH_TOKEN\"}"
```

---

### 다른 컨트롤러에서 인증 가드 사용

**예제**: `src/adapter/article/api/article.controller.ts`

```typescript
import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/adapter/auth/security';
import { CurrentUser } from '@/adapter/auth/api/decorators';

@Controller('articles')
export class ArticleController {
  /**
   * 인증 필요 - 게시글 작성
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() dto: CreateArticleDto,
    @CurrentUser() user: { memberId: string; email: string },
  ) {
    return this.articleService.create({
      ...dto,
      authorId: user.memberId, // JWT에서 추출한 memberId 사용
    });
  }

  /**
   * 인증 불필요 - 게시글 목록 조회
   */
  @Get()
  async findAll() {
    return this.articleService.findAll();
  }
}
```

---

## 확장 가이드

### 1. 로그아웃 시 Access Token Blacklist (Redis)

**목적**: Access Token 즉시 무효화 (선택적)

현재 구현은 Refresh Token만 폐기합니다. Access Token은 만료될 때까지 유효합니다.
더 강력한 보안이 필요한 경우 Redis 기반 Blacklist를 추가할 수 있습니다.

#### (1) Redis 연동

```bash
npm install @nestjs/cache-manager cache-manager
npm install cache-manager-redis-store
```

#### (2) Token Blacklist Service

```typescript
// src/application/auth/token-blacklist.service.ts
@Injectable()
export class TokenBlacklistService {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  async add(token: string, expiresIn: number): Promise<void> {
    await this.cacheManager.set(
      `blacklist:${token}`,
      'true',
      expiresIn * 1000, // TTL in milliseconds
    );
  }

  async isBlacklisted(token: string): Promise<boolean> {
    const result = await this.cacheManager.get(`blacklist:${token}`);
    return result === 'true';
  }
}
```

#### (3) Guard 수정

```typescript
// src/adapter/auth/security/auth-auth.guard.ts
@Injectable()
export class JwtAuthGuard extends AuthGuard('auth') {
  constructor(private readonly blacklistService: TokenBlacklistService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = request.headers.authorization?.split(' ')[1];

    if (await this.blacklistService.isBlacklisted(token)) {
      throw new UnauthorizedException('Token has been revoked');
    }

    return super.canActivate(context) as Promise<boolean>;
  }
}
```

---

### 2. Rate Limiting

**목적**: Brute Force 공격 방지

#### (1) 설치

```bash
npm install @nestjs/throttler
```

#### (2) Module 설정

```typescript
// src/app.module.ts
import { ThrottlerModule } from '@nestjs/throttler';

@Module({
  imports: [
    ThrottlerModule.forRoot([{
      ttl: 60000, // 1분
      limit: 5,   // 최대 5회 시도
    }]),
    // ...
  ],
})
export class AppModule {}
```

#### (3) Controller에 적용

```typescript
// src/adapter/auth/api/auth.controller.ts
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 1분에 5회
  async login(@Body() dto: LoginRequestDto) {
    // ...
  }
}
```

---

### 3. OAuth 2.0 통합 (Google, Kakao)

**목적**: 소셜 로그인

#### (1) Google Strategy

```bash
npm install passport-google-oauth20
npm install -D @types/passport-google-oauth20
```

```typescript
// src/adapter/auth/security/google.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: 'http://localhost:3000/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    const { emails, displayName } = profile;
    const user = {
      email: emails[0].value,
      name: displayName,
      provider: 'google',
    };
    done(null, user);
  }
}
```

#### (2) Controller

```typescript
@Get('google')
@UseGuards(AuthGuard('google'))
async googleAuth() {
  // Redirects to Google
}

@Get('google/callback')
@UseGuards(AuthGuard('google'))
async googleAuthCallback(@Req() req) {
  // Handle Google callback
  const user = req.user;
  const token = this.jwtService.generateAccessToken(user.id, user.email);
  return token;
}
```

---

### 4. 비밀번호 재설정

**목적**: 이메일 기반 비밀번호 재설정

#### (1) 토큰 생성

```typescript
// src/application/auth/password-reset.service.ts
@Injectable()
export class PasswordResetService {
  async requestReset(email: string): Promise<void> {
    const member = await this.memberReadRepository.findByEmail(email);
    if (!member) {
      return; // 보안: 이메일 존재 여부 노출 방지
    }

    const resetToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1시간

    await this.resetTokenRepository.save({
      memberId: member.id,
      token: resetToken,
      expiresAt,
    });

    await this.emailService.sendPasswordResetEmail(email, resetToken);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const resetToken = await this.resetTokenRepository.findByToken(token);

    if (!resetToken || resetToken.expiresAt < new Date()) {
      throw new UnauthorizedException('유효하지 않은 토큰입니다.');
    }

    const member = await this.memberRepository.findById(resetToken.memberId);
    const hashedPassword = this.passwordEncoder.encode(newPassword);

    member.password = hashedPassword;
    await this.memberRepository.update(member);

    await this.resetTokenRepository.delete(resetToken.id);
  }
}
```

---

## 보안 고려사항

### 1. JWT Secret 관리

❌ **잘못된 예**:
```typescript
secret: 'my-secret' // 너무 짧고 예측 가능
```

✅ **올바른 예**:
```env
# .env (절대 커밋하지 않음)
JWT_SECRET=a8f5f167f44f4964e6c998dee827110c03d76f8ef2c5e8f4c9b3d0e2e9a4f8d1
```

생성 방법:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Refresh Token 보안

- ✅ Refresh Token Rotation 적용 (토큰 갱신 시 기존 토큰 폐기)
- ✅ DB에 저장하여 서버 측에서 관리
- ✅ 만료 시간 설정 (7일)
- ❌ 클라이언트 LocalStorage 저장 금지 (XSS 취약)
- 💡 권장: HttpOnly Cookie로 전송

### 3. Password 저장

- ✅ bcrypt (현재 사용 중)
- ✅ salt rounds: 10 (적절)
- ❌ 평문 저장 금지
- ❌ MD5/SHA1 사용 금지

### 4. HTTPS 사용

운영 환경에서는 반드시 HTTPS 사용:
```typescript
// main.ts
if (process.env.NODE_ENV === 'prod') {
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS.split(','),
    credentials: true,
  });
}
```

### 5. CORS 설정

```typescript
// main.ts
app.enableCors({
  origin: ['https://prepair.com'],
  methods: ['GET', 'POST'],
  credentials: true,
});
```

---

## 문제 해결

### Q1. "Unauthorized" 에러 발생

**원인**: JWT 토큰이 유효하지 않거나 만료됨

**해결**:
1. 토큰 만료 시간 확인 (`JWT_ACCESS_TOKEN_EXPIRES_IN`)
2. 토큰 형식 확인 (`Authorization: Bearer <token>`)
3. JWT_SECRET 일치 여부 확인
4. Access Token 만료 시 `/auth/refresh`로 갱신

### Q2. 로그인 시 비밀번호 불일치

**원인**: bcrypt 검증 실패

**해결**:
1. 회원가입 시 비밀번호가 해시되었는지 확인
2. `Password.matches()` 메서드에 `PasswordEncoder` 전달 확인
3. 읽기 모델에 `password` 필드가 있는지 확인

### Q3. MemberReadEntity에 password 없음

**원인**: 기존 회원은 읽기 모델에 password가 없을 수 있음

**해결**:
```sql
-- 쓰기 모델에서 읽기 모델로 password 복사
UPDATE member_read mr
SET password = m.password
FROM member m
WHERE mr.id = m.id;
```

### Q4. Refresh Token 만료 에러

**원인**: Refresh Token이 7일 지나서 만료됨

**해결**:
1. 사용자에게 다시 로그인 요청
2. 만료 시간 조정 필요 시 `JWT_REFRESH_TOKEN_EXPIRES_IN` 환경 변수 수정

---

## 참고 자료

- [NestJS Authentication](https://docs.nestjs.com/security/authentication)
- [Passport JWT Strategy](http://www.passportjs.org/packages/passport-jwt/)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [Refresh Token Rotation](https://auth0.com/blog/refresh-tokens-what-are-they-and-when-to-use-them/)
