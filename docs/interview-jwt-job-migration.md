# Interview API 변경 가이드: JWT Payload에 Job 추가

## 개요

현재 `InterviewController`에서 `job`을 request body로 받고 있는 구조를 JWT payload에서 추출하는 방식으로 변경합니다.
또한 POST 방식을 GET + Query String 방식으로 변경합니다.

## 변경 전/후 비교

### Before
```typescript
// POST /api/interview/create-question
// Body: { job: "backend", count: 5 }
```

### After
```typescript
// GET /api/interview/questions?count=5
// job은 JWT payload에서 자동 추출
```

---

## 수정 파일 목록

### 1. JWT Payload 타입 수정

**파일:** `src/application/oauth/ports/jwt.port.ts`

```typescript
// Before
export interface JwtPayload {
  sub: string;
  email: string;
  iat?: number;
  exp?: number;
}

export interface JwtPort {
  generateAccessToken(memberId: string, email: string): JwtToken;
  verifyToken(token: string): JwtPayload;
}

// After
export interface JwtPayload {
  sub: string;
  email: string;
  job: string;  // 추가
  iat?: number;
  exp?: number;
}

export interface JwtPort {
  generateAccessToken(memberId: string, email: string, job: string): JwtToken;  // job 파라미터 추가
  verifyToken(token: string): JwtPayload;
}
```

---

### 2. User 타입 수정

**파일:** `src/adapter/shared/api/types/user.ts`

```typescript
// Before
export type User = {
  memberId: string;
  email: string;
};

// After
export type User = {
  memberId: string;
  email: string;
  job: string;  // 추가
};
```

---

### 3. JwtService 수정

**파일:** `src/adapter/auth/security/jwt.service.ts`

```typescript
// Before
generateAccessToken(memberId: string, email: string): JwtToken {
  const payload: JwtPayload = {
    sub: memberId,
    email,
  };
  // ...
}

// After
generateAccessToken(memberId: string, email: string, job: string): JwtToken {
  const payload: JwtPayload = {
    sub: memberId,
    email,
    job,  // 추가
  };
  // ...
}
```

---

### 4. JwtStrategy 수정

**파일:** `src/adapter/auth/security/jwt.strategy.ts`

```typescript
// Before
validate(payload: JwtPayload) {
  return {
    memberId: payload.sub,
    email: payload.email,
  };
}

// After
validate(payload: JwtPayload) {
  return {
    memberId: payload.sub,
    email: payload.email,
    job: payload.job,  // 추가
  };
}
```

---

### 5. AuthService 수정

**파일:** `src/application/auth/auth.service.ts`

```typescript
// Before
async login(request: LoginRequestDto) {
  // ... 검증 로직
  return {
    memberId: member.id,
    email: member.email.value,
  };
}

// After
async login(request: LoginRequestDto) {
  // ... 검증 로직
  return {
    memberId: member.id,
    email: member.email.value,
    job: member.job,  // 추가
  };
}
```

---

### 6. AuthController 수정

**파일:** `src/adapter/auth/api/auth.controller.ts`

```typescript
// Before - login()
const accessToken: JwtToken = this.jwtService.generateAccessToken(
  loginResult.memberId,
  loginResult.email,
);

// After - login()
const accessToken: JwtToken = this.jwtService.generateAccessToken(
  loginResult.memberId,
  loginResult.email,
  loginResult.job,  // 추가
);

// Before - refresh()
const accessToken = this.jwtService.generateAccessToken(
  member.id,
  member.email,
);

// After - refresh()
const accessToken = this.jwtService.generateAccessToken(
  member.id,
  member.email,
  member.job,  // 추가
);
```

---

### 7. InterviewController 수정

**파일:** `src/adapter/interview/api/interview.controller.ts`

```typescript
// Before
import { Body, Controller, Post } from "@nestjs/common";
import { CreateQuestionDto } from "@/adapter/interview/api/dto";

@Controller("api/interview")
export class InterviewController {
  @Post("create-question")
  async createQuestion(
    @CurrentUser() user: User,
    @Body() dto: CreateQuestionDto,
  ) {
    const questions = await this.interviewService.generateQuestion(
      user.memberId,
      dto.job,
      dto.count,
    );
    // ...
  }
}

// After
import { Controller, Get, Query, ParseIntPipe, DefaultValuePipe } from "@nestjs/common";

@Controller("api/interview")
export class InterviewController {
  @Get("questions")
  async getQuestions(
    @CurrentUser() user: User,
    @Query("count", new DefaultValuePipe(5), ParseIntPipe) count: number,
  ) {
    const questions = await this.interviewService.generateQuestion(
      user.memberId,
      user.job,      // JWT에서 추출
      count,         // Query string에서 추출
    );
    // ...
  }
}
```

---

### 8. DTO 수정 (선택사항)

**파일:** `src/adapter/interview/api/dto/create-question.dto.ts`

이 DTO는 더 이상 필요하지 않을 수 있습니다. 필요하다면 `count`만 남기거나 삭제합니다.

```typescript
// 삭제하거나, Query용 DTO로 변경
import { IsInt, IsOptional, Max, Min } from "class-validator";
import { Type } from "class-transformer";

export class GetQuestionsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  count?: number = 5;
}
```

---

## 수정 순서 (권장)

의존성 순서에 따라 다음 순서로 수정하는 것을 권장합니다:

1. `jwt.port.ts` - JwtPayload, JwtPort 인터페이스 수정
2. `user.ts` - User 타입에 job 추가
3. `jwt.service.ts` - generateAccessToken 메서드 수정
4. `jwt.strategy.ts` - validate 메서드 수정
5. `auth.service.ts` - login 반환값에 job 추가
6. `auth.controller.ts` - login, refresh에서 job 전달
7. `interview.controller.ts` - GET 방식으로 변경, job을 user에서 추출
8. DTO 정리

---

## 고려사항

### 기존 JWT 토큰 호환성
- 변경 후 기존에 발급된 JWT 토큰에는 `job` 필드가 없습니다.
- 옵션 1: 기존 토큰을 무효화하고 재로그인 유도
- 옵션 2: `job`을 optional로 처리하고 없을 경우 DB에서 조회

```typescript
// 호환성을 위한 Optional 처리 예시
validate(payload: JwtPayload) {
  return {
    memberId: payload.sub,
    email: payload.email,
    job: payload.job ?? null,  // 기존 토큰 호환
  };
}
```

### OAuth 로그인 수정
OAuth 로그인에서도 동일하게 `job`을 JWT에 포함해야 합니다.

**파일:** `src/application/oauth/kaka-oauth.service.ts`

OAuth 로그인 시 JWT 생성 부분도 수정이 필요합니다.

---

## API 문서 변경

### Before
```
POST /api/interview/create-question
Authorization: Bearer <token>
Content-Type: application/json

{
  "job": "backend",
  "count": 5
}
```

### After
```
GET /api/interview/questions?count=5
Authorization: Bearer <token>

(job은 JWT에서 자동 추출)
```

---

## 테스트 케이스 업데이트

수정 후 다음 테스트를 확인해야 합니다:

1. 로그인 시 JWT에 job이 포함되는지 확인
2. Refresh token으로 새 access token 발급 시 job이 포함되는지 확인
3. Interview API에서 user.job으로 질문 생성이 되는지 확인
4. OAuth 로그인 시에도 job이 JWT에 포함되는지 확인
