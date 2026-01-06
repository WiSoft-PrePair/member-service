# 전역 JWT 가드 설정 가이드

## 개요

현재 `@UseGuards(JwtAuthGuard)`를 각 엔드포인트에 수동으로 붙이는 방식에서, 전역으로 가드를 적용하고 public 엔드포인트만 `@Public()` 데코레이터로 예외 처리하는 방식으로 변경합니다.

**장점:**
- Secure by default: 기본적으로 모든 엔드포인트 보호
- 실수로 가드를 빠뜨릴 위험 감소
- 보일러플레이트 코드 감소

## 구현 단계

### 1. Public 데코레이터 생성

**파일:** `src/adapter/auth/api/decorators/public.decorator.ts`

```typescript
import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

### 2. JwtAuthGuard 수정

**파일:** `src/adapter/auth/security/jwt-auth.guard.ts`

```typescript
import { ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import { Observable } from "rxjs";
import { IS_PUBLIC_KEY } from "@/adapter/auth/api/decorators/public.decorator";

@Injectable()
export class JwtAuthGuard extends AuthGuard("auth") {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    // @Public() 데코레이터가 붙은 핸들러는 인증 생략
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }
}
```

**주요 변경사항:**
- `Reflector` 주입
- `getAllAndOverride()`: 메서드 레벨 → 클래스 레벨 순으로 메타데이터 확인
- `@Public()`이 붙으면 인증 생략

### 3. 전역 가드 등록

**파일:** `src/app.module.ts`

```typescript
import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { JwtAuthGuard } from "@/adapter/auth/security";
// ... 기타 imports

@Module({
  imports: [
    // ... 기존 imports
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformResponseInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    // 🆕 전역 JWT 가드 추가
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
```

### 4. Auth Security Export 업데이트

**파일:** `src/adapter/auth/security/index.ts`

```typescript
export * from "./jwt.strategy";
export * from "./jwt-auth.guard";
export * from "./jwt.service";
export * from "../api/decorators/public.decorator"; // 🆕 추가
```

### 5. Public 엔드포인트에 데코레이터 적용

#### AuthController 수정

**파일:** `src/adapter/auth/api/auth.controller.ts`

```typescript
import { Public } from "@/adapter/auth/security";
// ... 기타 imports

@Controller("api/auth")
export class AuthController {
  // ...

  @Public()  // 🆕 추가
  @Post("login")
  async login(@Body() loginRequestDto: LoginRequestDto) {
    // ...
  }

  @Public()  // 🆕 추가
  @Post("refresh")
  async refresh(@Body() refreshToken: RefreshTokenRequestDto) {
    // ...
  }

  @Post("logout")
  async logout(@Body() logoutRequestDto: LogoutRequestDto) {
    // logout은 인증 필요 (refreshToken 검증)
  }

  @Get("me")
  // @UseGuards(JwtAuthGuard) 제거 - 전역 가드로 자동 적용
  getUser(@CurrentUser() user: { memberId: string; email: string }) {
    // ...
  }
}
```

#### MemberController 수정

**파일:** `src/adapter/member/api/member.controller.ts`

```typescript
import { Public } from "@/adapter/auth/security";
// ... 기타 imports

@Controller("api/members")
export class MemberController {
  // ...

  @Public()  // 🆕 추가
  @Post("register")
  async register(@Body() registerDto: RegisterMemberDto) {
    // ...
  }

  @Public()  // 🆕 추가 (회원가입 시 이메일 인증)
  @Post("email/")
  async sendEmailVerification(@Body() dto: SendEmailVerificationDto) {
    // ...
  }

  @Public()  // 🆕 추가
  @Post("email/verify")
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    // ...
  }

  @Get(":id")
  // @UseGuards(JwtAuthGuard) 제거 - 전역 가드로 자동 적용
  async getMember(@Param("id") id: string): Promise<GetMemberResult> {
    // ...
  }

  @Patch(":id")
  // @UseGuards(JwtAuthGuard) 제거
  async update(/* ... */) {
    // ...
  }

  @Patch(":id/password")
  // @UseGuards(JwtAuthGuard) 제거
  async changePassword(/* ... */) {
    // ...
  }

  @Patch(":id/email")
  // @UseGuards(JwtAuthGuard) 제거
  async changeEmail(/* ... */) {
    // ...
  }

  @Delete(":id")
  // withdraw는 인증 필요 - @Public() 없음
  async withdraw(@Param("id") id: string) {
    // ...
  }
}
```

## Public 엔드포인트 목록

인증이 **필요 없는** 엔드포인트:

- `POST /api/auth/login` - 로그인
- `POST /api/auth/refresh` - 토큰 갱신
- `POST /api/members/register` - 회원가입
- `POST /api/members/email/` - 이메일 인증 코드 발송
- `POST /api/members/email/verify` - 이메일 인증 코드 확인

인증이 **필요한** 엔드포인트:

- `POST /api/auth/logout` - 로그아웃 (refreshToken 검증 필요)
- `GET /api/auth/me` - 현재 사용자 정보
- `GET /api/members/:id` - 회원 조회
- `PATCH /api/members/:id` - 회원 정보 수정
- `PATCH /api/members/:id/password` - 비밀번호 변경
- `PATCH /api/members/:id/email` - 이메일 변경
- `DELETE /api/members/:id` - 회원 탈퇴

## 테스트

변경 후 다음을 확인하세요:

1. **Public 엔드포인트**는 토큰 없이 접근 가능
   ```bash
   curl -X POST http://localhost:3000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"password"}'
   ```

2. **Protected 엔드포인트**는 토큰 필요
   ```bash
   # 토큰 없이 요청 시 401 에러
   curl -X GET http://localhost:3000/api/auth/me

   # 토큰과 함께 요청 시 성공
   curl -X GET http://localhost:3000/api/auth/me \
     -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
   ```

3. **E2E 테스트** 실행
   ```bash
   npm run test:e2e
   ```

## 주의사항

1. **새로운 엔드포인트 추가 시:**
   - 기본적으로 인증 필요
   - public이어야 한다면 명시적으로 `@Public()` 추가

2. **클래스 레벨 vs 메서드 레벨:**
   ```typescript
   @Public()  // 클래스 전체를 public으로
   @Controller("api/public")
   export class PublicController {
     @Get()  // 자동으로 public
     getPublicData() {}
   }
   ```

3. **메서드 레벨이 우선:**
   ```typescript
   @Public()
   @Controller("api/mixed")
   export class MixedController {
     @Get("public")  // public
     getPublic() {}

     // ❌ 불가능: 클래스가 @Public()이면 메서드만 protected로 만들 수 없음
     // 이런 경우 클래스에 @Public() 제거하고 각 메서드에 개별 적용
   }
   ```

## 마이그레이션 체크리스트

- [ ] Public 데코레이터 생성
- [ ] JwtAuthGuard에 Reflector 추가
- [ ] app.module.ts에 APP_GUARD 등록
- [ ] AuthController에 @Public() 추가
- [ ] MemberController에 @Public() 추가
- [ ] 기존 @UseGuards(JwtAuthGuard) 제거
- [ ] E2E 테스트 실행 및 검증
- [ ] Swagger/OpenAPI 문서 확인
