# Response Format Standardization Guide

## 개요

NestJS 인터셉터와 Exception Filter를 사용하여 모든 API 응답을 표준 형식으로 통일합니다.

## 응답 규격

### 성공 응답 (Success Response)

```json
{
  "statusCode": 200,
  "data": { ... },
  "message": "조회 성공"
}
```

### 에러 응답 (Error Response)

```json
{
  "statusCode": 404,
  "error": {
    "code": "USER_NOT_FOUND",
    "message": "사용자를 찾을 수 없습니다"
  }
}
```

## 구현

### 1. 응답 타입 정의

**파일 위치:** `src/adapter/shared/api/types/api-response.type.ts`

```typescript
// 성공 응답 타입
export interface SuccessResponse<T = unknown> {
  statusCode: number;
  data: T;
  message: string;
}

// 에러 응답 타입
export interface ErrorResponse {
  statusCode: number;
  error: {
    code: string;
    message: string;
  };
}
```

### 2. 성공 응답 인터셉터 (Response Interceptor)

**파일 위치:** `src/adapter/shared/api/interceptors/transform-response.interceptor.ts`

```typescript
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import { type SuccessResponse } from "@/adapter/shared/api/types";

/**
 * 모든 성공 응답을 표준 형식으로 변환하는 인터셉터
 */
@Injectable()
export class TransformResponseInterceptor<T>
  implements NestInterceptor<T, SuccessResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<SuccessResponse<T>> {
    const response = context.switchToHttp().getResponse();
    const statusCode = response.statusCode;

    return next.handle().pipe(
      map((data) => ({
        statusCode,
        data,
        message: this.getSuccessMessage(statusCode),
      })),
    );
  }

  private getSuccessMessage(statusCode: number): string {
    switch (statusCode) {
      case 200:
        return "요청이 성공적으로 처리되었습니다";
      case 201:
        return "리소스가 성공적으로 생성되었습니다";
      case 204:
        return "요청이 성공적으로 처리되었습니다";
      default:
        return "성공";
    }
  }
}
```

### 3. 도메인 예외 기본 클래스 확장

**파일 위치:** `src/domain/shared/exceptions/domain.exception.ts`

```typescript
/**
 * 모든 도메인 예외의 기본 클래스
 * HTTP 응답을 위한 errorCode를 포함
 */
export abstract class DomainException extends Error {
  abstract readonly errorCode: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
```

### 4. 기존 도메인 예외 업데이트

**파일 위치:** `src/domain/member/exceptions/invalid-email.exception.ts`

```typescript
import { DomainException } from "@/domain/shared/exceptions";

export class InvalidEmailException extends DomainException {
  readonly errorCode = "INVALID_EMAIL";

  constructor(email?: string) {
    super(`이메일 형식이 올바르지 않습니다: ${email}`);
  }
}
```

**파일 위치:** `src/domain/member/exceptions/invalid-password.exception.ts`

```typescript
import { DomainException } from "@/domain/shared/exceptions";

export class InvalidPasswordException extends DomainException {
  readonly errorCode = "INVALID_PASSWORD";

  constructor(message: string) {
    super(message);
  }
}
```

### 5. HTTP Exception 확장 클래스

**파일 위치:** `src/adapter/shared/api/exceptions/http.exception.ts`

```typescript
import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * errorCode를 포함하는 HTTP 예외 클래스
 */
export class HttpExceptionWithCode extends HttpException {
  constructor(
    public readonly errorCode: string,
    message: string,
    statusCode: HttpStatus,
  ) {
    super(message, statusCode);
  }
}

// 자주 사용하는 예외들을 위한 헬퍼 클래스
export class NotFoundException extends HttpExceptionWithCode {
  constructor(errorCode: string, message: string) {
    super(errorCode, message, HttpStatus.NOT_FOUND);
  }
}

export class BadRequestException extends HttpExceptionWithCode {
  constructor(errorCode: string, message: string) {
    super(errorCode, message, HttpStatus.BAD_REQUEST);
  }
}

export class UnauthorizedException extends HttpExceptionWithCode {
  constructor(errorCode: string, message: string) {
    super(errorCode, message, HttpStatus.UNAUTHORIZED);
  }
}

export class ConflictException extends HttpExceptionWithCode {
  constructor(errorCode: string, message: string) {
    super(errorCode, message, HttpStatus.CONFLICT);
  }
}
```

### 6. 전역 Exception Filter

**파일 위치:** `src/adapter/shared/api/filters/http-exception.filter.ts`

```typescript
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Response } from "express";
import { DomainException } from "@/domain/shared/exceptions";
import {
  HttpExceptionWithCode,
  BadRequestException as CustomBadRequestException,
} from "@/adapter/shared/api/exceptions";
import { type ErrorResponse } from "@/adapter/shared/api/types";

/**
 * NestJS HttpException의 응답 타입 정의
 */
interface HttpExceptionResponse {
  message: string | string[];
  error?: string;
  statusCode?: number;
}

/**
 * 모든 예외를 표준 에러 응답 형식으로 변환하는 필터
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const errorResponse = this.buildErrorResponse(exception);

    response.status(errorResponse.statusCode).json(errorResponse);
  }

  private buildErrorResponse(exception: unknown): ErrorResponse {
    // 1. errorCode가 있는 커스텀 HTTP 예외
    if (exception instanceof HttpExceptionWithCode) {
      return {
        statusCode: exception.getStatus(),
        error: {
          code: exception.errorCode,
          message: exception.message,
        },
      };
    }

    // 2. 도메인 예외 -> BadRequest로 매핑
    if (exception instanceof DomainException) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        error: {
          code: exception.errorCode,
          message: exception.message,
        },
      };
    }

    // 3. NestJS 기본 HTTP 예외
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();

      // 타입 가드: string 응답
      if (typeof response === "string") {
        return {
          statusCode: status,
          error: {
            code: this.getErrorCodeFromStatus(status),
            message: response,
          },
        };
      }

      // 타입 가드: object 응답
      const exceptionResponse = response as HttpExceptionResponse;

      // Validation 에러 처리 (class-validator)
      if (Array.isArray(exceptionResponse.message)) {
        return {
          statusCode: status,
          error: {
            code: "VALIDATION_ERROR",
            message: exceptionResponse.message.join(", "),
          },
        };
      }

      return {
        statusCode: status,
        error: {
          code: this.getErrorCodeFromStatus(status),
          message: exceptionResponse.message || exception.message,
        },
      };
    }

    // 4. 알 수 없는 예외 -> Internal Server Error
    console.error("Unhandled exception:", exception);
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "내부 서버 오류가 발생했습니다",
      },
    };
  }

  private getErrorCodeFromStatus(status: HttpStatus): string {
    const codeMap: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: "BAD_REQUEST",
      [HttpStatus.UNAUTHORIZED]: "UNAUTHORIZED",
      [HttpStatus.FORBIDDEN]: "FORBIDDEN",
      [HttpStatus.NOT_FOUND]: "NOT_FOUND",
      [HttpStatus.CONFLICT]: "CONFLICT",
      [HttpStatus.UNPROCESSABLE_ENTITY]: "UNPROCESSABLE_ENTITY",
      [HttpStatus.INTERNAL_SERVER_ERROR]: "INTERNAL_SERVER_ERROR",
    };

    return codeMap[status] || "UNKNOWN_ERROR";
  }
}
```

### 7. AppModule에 전역 등록

**파일 위치:** `src/app.module.ts`

```typescript
import { Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { TransformResponseInterceptor } from "@/adapter/shared/api/interceptors";
import { HttpExceptionFilter } from "@/adapter/shared/api/filters";

@Module({
  imports: [
    // ... 기존 imports
  ],
  providers: [
    // 전역 인터셉터 등록
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformResponseInterceptor,
    },
    // 전역 Exception Filter 등록
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}
```

## 기존 코드 수정 방법

### 1. Controller 응답 수정

**Before:**
```typescript
@Post("register")
async register(@Body() registerDto: RegisterMemberRequestDto) {
  const memberId = await this.commandBus.execute(/* ... */);
  return { id: memberId };  // 직접 객체 반환
}
```

**After:**
```typescript
@Post("register")
@HttpCode(201)  // 필요시 상태 코드 명시
async register(@Body() registerDto: RegisterMemberRequestDto) {
  const memberId = await this.commandBus.execute(/* ... */);
  return { id: memberId };  // 인터셉터가 자동으로 감싸줌
}

// 최종 응답:
// {
//   "statusCode": 201,
//   "data": { "id": "..." },
//   "message": "리소스가 성공적으로 생성되었습니다"
// }
```

### 2. 예외 처리 수정

**Before:**
```typescript
@Post("refresh")
async refresh(@Body() refreshToken: RefreshTokenRequestDto) {
  const member = await this.memberReadRepository.findById(memberId);

  if (!member) {
    throw new NotFoundException("회원 정보를 찾을 수 없습니다.");  // NestJS 기본 예외
  }
  // ...
}
```

**After:**
```typescript
import { NotFoundException } from "@/adapter/shared/api/exceptions";

@Post("refresh")
async refresh(@Body() refreshToken: RefreshTokenRequestDto) {
  const member = await this.memberReadRepository.findById(memberId);

  if (!member) {
    throw new NotFoundException(
      "MEMBER_NOT_FOUND",
      "회원 정보를 찾을 수 없습니다"
    );
  }
  // ...
}

// 최종 응답:
// {
//   "statusCode": 404,
//   "error": {
//     "code": "MEMBER_NOT_FOUND",
//     "message": "회원 정보를 찾을 수 없습니다"
//   }
// }
```

### 3. 도메인 예외 자동 변환

도메인 레이어에서 발생한 예외는 자동으로 BadRequest(400)로 매핑됩니다:

```typescript
// Domain Layer
const email = Email.create("invalid-email");
// -> InvalidEmailException 발생 (errorCode: "INVALID_EMAIL")

// 최종 HTTP 응답 (자동 변환):
// {
//   "statusCode": 400,
//   "error": {
//     "code": "INVALID_EMAIL",
//     "message": "이메일 형식이 올바르지 않습니다: invalid-email"
//   }
// }
```

### 4. Validation 에러 자동 처리

class-validator의 ValidationPipe 에러도 자동으로 변환됩니다:

```typescript
// DTO 검증 실패 시 자동 응답:
// {
//   "statusCode": 400,
//   "error": {
//     "code": "VALIDATION_ERROR",
//     "message": "email must be an email, password must be longer than 8 characters"
//   }
// }
```

## 에러 코드 네이밍 컨벤션

에러 코드는 **UPPER_SNAKE_CASE**를 사용하며, 다음 구조를 권장합니다:

```
{RESOURCE}_{ACTION}_{REASON}

예시:
- MEMBER_NOT_FOUND
- EMAIL_ALREADY_EXISTS
- PASSWORD_INVALID_FORMAT
- TOKEN_EXPIRED
- UNAUTHORIZED_ACCESS
- VALIDATION_ERROR
```

## 구현 체크리스트

- [ ] 1. `src/adapter/shared/api/types/api-response.type.ts` 생성
- [ ] 2. `src/adapter/shared/api/interceptors/transform-response.interceptor.ts` 생성
- [ ] 3. `src/domain/shared/exceptions/domain.exception.ts` 생성
- [ ] 4. 기존 도메인 예외들 `DomainException` 상속으로 수정
- [ ] 5. `src/adapter/shared/api/exceptions/http.exception.ts` 생성
- [ ] 6. `src/adapter/shared/api/filters/http-exception.filter.ts` 생성
- [ ] 7. `app.module.ts`에 전역 등록
- [ ] 8. 기존 Controller에서 NestJS 기본 예외 사용처를 커스텀 예외로 교체

## 추가 고려사항

### 1. 메시지 커스터마이징

특정 엔드포인트에서 다른 메시지를 사용하고 싶다면 `@SetMetadata`를 활용:

```typescript
import { SetMetadata } from "@nestjs/common";

export const SuccessMessage = (message: string) =>
  SetMetadata("successMessage", message);

@Post("register")
@SuccessMessage("회원가입이 완료되었습니다")
async register(@Body() dto: RegisterMemberRequestDto) {
  // ...
}
```

인터셉터에서 메타데이터를 읽어 커스텀 메시지 적용:

```typescript
intercept(context: ExecutionContext, next: CallHandler) {
  const customMessage = this.reflector.get<string>(
    "successMessage",
    context.getHandler(),
  );

  return next.handle().pipe(
    map((data) => ({
      statusCode: response.statusCode,
      data,
      message: customMessage || this.getSuccessMessage(response.statusCode),
    })),
  );
}
```

### 2. 로깅

Exception Filter에서 모든 에러를 로깅하면 디버깅에 유용합니다:

```typescript
catch(exception: unknown, host: ArgumentsHost) {
  const ctx = host.switchToHttp();
  const request = ctx.getRequest();

  // 로깅
  console.error({
    timestamp: new Date().toISOString(),
    path: request.url,
    method: request.method,
    exception: exception instanceof Error ? exception.stack : exception,
  });

  // 응답
  const errorResponse = this.buildErrorResponse(exception);
  response.status(errorResponse.statusCode).json(errorResponse);
}
```

### 3. 환경별 에러 상세도 조절

개발 환경에서는 상세한 에러 정보를, 프로덕션에서는 제한된 정보만 노출:

```typescript
private buildErrorResponse(exception: unknown): ErrorResponse {
  const isDevelopment = process.env.NODE_ENV === "development";

  // ... 기존 로직

  // 알 수 없는 예외
  if (isDevelopment) {
    console.error("Unhandled exception:", exception);
  }

  return {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: isDevelopment
        ? String(exception)  // 개발: 상세 에러
        : "내부 서버 오류가 발생했습니다",  // 프로덕션: 일반 메시지
    },
  };
}
```
