# Authentication (Login) 구현 가이드

> CQRS 패턴 미적용 - 전통적인 Service 패턴 기반 JWT 인증

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

### 3. 읽기 모델에 Password 추가

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
┌─────────────────────────────────────────────┐
│         Adapter Layer (API)                 │
│    AuthController (POST /auth/login)        │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│      Application Layer (Service)            │
│         AuthService.login()                 │
│      (CQRS 미적용 - 일반 서비스)            │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│       Domain Layer (재사용)                 │
│  Password.matches() - 비밀번호 검증         │
│  PasswordEncoder - bcrypt 검증              │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│    Infrastructure (Persistence)             │
│    MemberReadRepository.findByEmail()       │
└─────────────────────────────────────────────┘
```

### 인증 흐름

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
7. { accessToken, expiresIn, memberId }
```

---

## 폴더 구조

```
src/
├── domain/auth/
│   ├── exceptions/
│   │   ├── invalid-credentials.exception.ts    # 인증 실패 예외
│   │   └── member-not-found.exception.ts       # 회원 미존재 예외
│   └── index.ts
│
├── application/auth/
│   ├── auth.service.ts                         # 일반 Service (CQRS 미적용)
│   ├── types/
│   │   └── login-result.ts                     # { memberId, email }
│   └── index.ts
│
└── adapter/auth/
    ├── auth.module.ts                          # 모듈 와이어링
    ├── api/
    │   ├── auth.controller.ts                  # REST API
    │   ├── dto/
    │   │   ├── login-request.dto.ts            # 입력 DTO
    │   │   └── login-response.dto.ts           # 응답 DTO
    │   └── decorators/
    │       └── current-user.decorator.ts       # @CurrentUser() 데코레이터
    └── security/
        ├── jwt.service.ts                      # JWT 발급/검증
        ├── jwt.strategy.ts                     # Passport JWT Strategy
        ├── jwt-auth.guard.ts                   # 인증 가드
        └── index.ts
```

---

## 상세 구현

### 1. Domain Layer

#### 예외 정의

**파일**: `src/domain/auth/exceptions/invalid-credentials.exception.ts`

```typescript
import { DomainException } from '@/adapter/shared/exception/domain.exception';

export class InvalidCredentialsException extends DomainException {
  constructor() {
    super('이메일 또는 비밀번호가 일치하지 않습니다.');
  }
}
```

**파일**: `src/domain/auth/exceptions/member-not-found.exception.ts`

```typescript
import { DomainException } from '@/adapter/shared/exception/domain.exception';

export class MemberNotFoundException extends DomainException {
  constructor() {
    super('존재하지 않는 회원입니다.');
  }
}
```

---

### 2. Application Layer

#### AuthService (일반 서비스)

**파일**: `src/application/auth/auth.service.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common';
import {
  InvalidCredentialsException,
  MemberNotFoundException,
} from '@/domain/auth';
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
      throw new MemberNotFoundException();
    }

    // 2. 비밀번호 검증 (도메인 로직 재사용)
    const password = Password.fromHashed(member.password);
    const isValid = password.matches(request.password, this.passwordEncoder);

    if (!isValid) {
      throw new InvalidCredentialsException();
    }

    // 3. 로그인 성공 - memberId와 email 반환
    return {
      memberId: member.id,
      email: member.email,
    };
  }
}
```

**핵심 포인트**:
- `@Inject(MEMBER_READ_REPOSITORY)`: 읽기 저장소 주입
- `@Inject(PASSWORD_ENCODER)`: 비밀번호 인코더 주입 (MemberModule에서 제공)
- `Password.fromHashed()`: 도메인 로직 재사용
- `password.matches()`: bcrypt 검증 위임

---

### 3. Adapter Layer - Security

#### JWT Service

**파일**: `src/adapter/auth/security/jwt.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { JwtService as NestJwtService } from '@nestjs/jwt';

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
  constructor(private readonly jwtService: NestJwtService) {}

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
      expiresIn: 3600, // 1시간 (초 단위)
    };
  }

  /**
   * Token 검증 및 payload 추출
   */
  verify(token: string): JwtPayload {
    return this.jwtService.verify<JwtPayload>(token);
  }
}
```

#### JWT Strategy

**파일**: `src/adapter/auth/security/jwt.strategy.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { JwtPayload } from './jwt.service';

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
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }
}
```

---

### 4. Adapter Layer - API

#### Controller

**파일**: `src/adapter/auth/api/auth.controller.ts`

```typescript
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthService } from '@/application/auth';
import { JwtService, JwtAuthGuard } from '../security';
import { LoginRequestDto, LoginResponseDto } from './dto';
import { CurrentUser } from './decorators/current-user.decorator';

/**
 * 인증 API 컨트롤러
 * - CQRS 패턴 미적용 (전통적인 Service 패턴)
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
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

    // 2. JWT 토큰 발급
    const token = this.jwtService.generateAccessToken(
      loginResult.memberId,
      loginResult.email,
    );

    // 3. 응답 DTO 반환
    return new LoginResponseDto(
      token.accessToken,
      token.expiresIn,
      loginResult.memberId,
    );
  }

  /**
   * 현재 로그인한 사용자 정보 조회 (예제)
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
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from '@/application/auth';
import { MemberModule } from '../member/member.module';
import { AuthController } from './api/auth.controller';
import { JwtService, JwtStrategy } from './security';

@Module({
  imports: [
    // Passport 기본 설정
    PassportModule.register({ defaultStrategy: 'jwt' }),

    // JWT 모듈 설정 (ConfigService 주입)
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN'),
        },
      }),
    }),

    // MemberReadRepository, PasswordEncoder 사용을 위해 import
    MemberModule,
  ],
  controllers: [AuthController],
  providers: [
    // Application Service (CQRS 미적용)
    AuthService,

    // Security
    JwtService,
    JwtStrategy,
  ],
  exports: [JwtService], // 다른 모듈에서 JWT 검증이 필요한 경우
})
export class AuthModule {}
```

**의존성 그래프**:
```
AuthModule
  ├─ imports
  │   ├─ PassportModule (전략: jwt)
  │   ├─ JwtModule (secret, expiresIn from ConfigService)
  │   └─ MemberModule
  │       └─ exports: [PASSWORD_ENCODER, MEMBER_READ_REPOSITORY]
  └─ providers
      ├─ AuthService (← PASSWORD_ENCODER, MEMBER_READ_REPOSITORY)
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
  JWT_SECRET: z.string().min(32, "JWT_SECRET은 최소 32자 이상이어야 합니다."),
  JWT_EXPIRES_IN: z.string().default("1h"),
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
JWT_EXPIRES_IN=1h
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
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDAiLCJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20iLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MTcwMDAwMzYwMH0.signature",
  "expiresIn": 3600,
  "memberId": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### Response (Error)

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "statusCode": 400,
  "message": "이메일 또는 비밀번호가 일치하지 않습니다.",
  "error": "Bad Request"
}
```

---

### 2. 현재 사용자 조회

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
npm install @nestjs/jwt @nestjs/passport passport passport-jwt
npm install -D @types/passport-jwt
```

### 2. 환경 변수 설정

`.env` 파일에 JWT 설정 추가:

```env
JWT_SECRET=your-super-secret-key-change-this-in-production-minimum-32-characters
JWT_EXPIRES_IN=1h
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

#### (3) 인증된 요청

```bash
# 응답에서 받은 accessToken 사용
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

curl http://localhost:3000/auth/me \
  -H "Authorization: Bearer $TOKEN"
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

### 1. Refresh Token 구현

**목적**: Access Token 만료 시 재발급

#### (1) RefreshToken Entity 추가

```typescript
// src/adapter/auth/persistence/entity/refresh-token.entity.ts
@Entity({ tableName: 'refresh_tokens' })
export class RefreshTokenEntity {
  @PrimaryKey()
  id!: string;

  @Property()
  memberId!: string;

  @Property()
  token!: string;

  @Property()
  expiresAt!: Date;

  @Property()
  createdAt!: Date;
}
```

#### (2) RefreshToken Service

```typescript
// src/application/auth/refresh-token.service.ts
@Injectable()
export class RefreshTokenService {
  async create(memberId: string): Promise<string> {
    const token = randomBytes(64).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7일

    await this.repository.save({
      id: randomUUID(),
      memberId,
      token,
      expiresAt,
      createdAt: new Date(),
    });

    return token;
  }

  async verify(token: string): Promise<string> {
    const refreshToken = await this.repository.findByToken(token);

    if (!refreshToken || refreshToken.expiresAt < new Date()) {
      throw new InvalidRefreshTokenException();
    }

    return refreshToken.memberId;
  }
}
```

#### (3) Controller 확장

```typescript
// src/adapter/auth/api/auth.controller.ts
@Post('refresh')
async refresh(@Body() dto: RefreshTokenDto) {
  const memberId = await this.refreshTokenService.verify(dto.refreshToken);
  const member = await this.memberReadRepository.findById(memberId);

  const newAccessToken = this.jwtService.generateAccessToken(
    member.id,
    member.email,
  );

  return { accessToken: newAccessToken.accessToken };
}
```

---

### 2. 로그아웃 (Token Blacklist)

**목적**: 토큰 무효화

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
// src/adapter/auth/security/jwt-auth.guard.ts
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
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

### 3. Rate Limiting

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

### 4. OAuth 2.0 통합 (Google, Kakao)

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

### 5. 비밀번호 재설정

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
      throw new InvalidResetTokenException();
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

### 2. Password 저장

- ✅ bcrypt (현재 사용 중)
- ✅ salt rounds: 10 (적절)
- ❌ 평문 저장 금지
- ❌ MD5/SHA1 사용 금지

### 3. HTTPS 사용

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

### 4. CORS 설정

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
1. 토큰 만료 시간 확인 (`JWT_EXPIRES_IN`)
2. 토큰 형식 확인 (`Authorization: Bearer <token>`)
3. JWT_SECRET 일치 여부 확인

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

---

## 참고 자료

- [NestJS Authentication](https://docs.nestjs.com/security/authentication)
- [Passport JWT Strategy](http://www.passportjs.org/packages/passport-jwt/)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
