# Logging Implementation Guide (Pino)

이 문서는 NestJS + Pino를 사용한 구조화된 로그 포맷 구현 가이드입니다.

## 목표 로그 포맷

```json
{
  "timestamp": "2026-01-16T12:33:36.774Z",
  "level": "INFO",
  "service": "member-service",
  "correlationId": "743ae05d-b90d-00fd-6599",
  "message": "Member registration completed",
  "module": "MemberCommandHandler",
  "error": {
    "type": "ValidationException",
    "message": "Invalid email format"
  }
}
```

## 필수 패키지 설치

```bash
npm install pino pino-http pino-pretty
npm install -D @types/pino-http
```

## 1. Pino Logger 설정

### 1.1 기본 Pino 설정 파일 생성

**위치:** `src/config/pino.config.ts`

```typescript
import { Params } from 'nestjs-pino';

export const pinoConfig: Params = {
  pinoHttp: {
    level: process.env.LOG_LEVEL || 'info',
    transport:
      process.env.NODE_ENV !== 'production'
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname',
              singleLine: false,
            },
          }
        : undefined,
    customProps: () => ({
      service: process.env.SERVICE_NAME || 'prepair-backend',
    }),
    formatters: {
      level: (label: string) => {
        return { level: label.toUpperCase() };
      },
    },
    serializers: {
      req: (req: any) => ({
        method: req.method,
        url: req.url,
        correlationId: req.headers['x-correlation-id'],
      }),
      res: (res: any) => ({
        statusCode: res.statusCode,
      }),
    },
    redact: {
      paths: ['req.headers.authorization', 'req.body.password'],
      remove: true,
    },
  },
};
```

### 1.2 환경 변수 추가

**위치:** `.env`

```bash
LOG_LEVEL=debug
SERVICE_NAME=prepair-backend
```

**위치:** `src/config/env.config.ts`

```typescript
export const envSchema = z.object({
  // ... 기존 필드들
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  SERVICE_NAME: z.string().default('prepair-backend'),
});
```

## 2. Correlation ID 미들웨어

### 2.1 Correlation ID 생성 미들웨어

**위치:** `src/adapter/shared/middleware/correlation-id.middleware.ts`

```typescript
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

export const CORRELATION_ID_HEADER = 'x-correlation-id';
export const CORRELATION_ID_KEY = 'correlationId';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const correlationId =
      (req.headers[CORRELATION_ID_HEADER] as string) || randomUUID();

    req[CORRELATION_ID_KEY] = correlationId;
    res.setHeader(CORRELATION_ID_HEADER, correlationId);

    next();
  }
}
```

### 2.2 Request 타입 확장

**위치:** `src/types/express.d.ts`

```typescript
declare namespace Express {
  export interface Request {
    correlationId?: string;
  }
}
```

## 3. 커스텀 Logger Service

### 3.1 Logger Interface

**위치:** `src/adapter/shared/logger/logger.interface.ts`

```typescript
export interface LogContext {
  module?: string;
  correlationId?: string;
  [key: string]: any;
}

export interface ErrorLog {
  type: string;
  message: string;
  stack?: string;
}

export interface ILogger {
  log(message: string, context?: LogContext): void;
  error(message: string, error?: Error, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  debug(message: string, context?: LogContext): void;
}

export const LOGGER = Symbol('LOGGER');
```

### 3.2 Pino Logger 구현체

**위치:** `src/adapter/shared/logger/pino-logger.service.ts`

```typescript
import { Injectable, Inject } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { ILogger, LogContext, ErrorLog } from './logger.interface';

@Injectable()
export class PinoLoggerService implements ILogger {
  constructor(private readonly logger: PinoLogger) {}

  log(message: string, context?: LogContext): void {
    this.logger.info(this.formatContext(context), message);
  }

  error(message: string, error?: Error, context?: LogContext): void {
    const errorLog = error ? this.formatError(error) : undefined;
    this.logger.error(
      {
        ...this.formatContext(context),
        error: errorLog,
      },
      message,
    );
  }

  warn(message: string, context?: LogContext): void {
    this.logger.warn(this.formatContext(context), message);
  }

  debug(message: string, context?: LogContext): void {
    this.logger.debug(this.formatContext(context), message);
  }

  private formatContext(context?: LogContext): Record<string, any> {
    if (!context) return {};

    const { module, correlationId, ...rest } = context;

    return {
      ...(module && { module }),
      ...(correlationId && { correlationId }),
      ...rest,
    };
  }

  private formatError(error: Error): ErrorLog {
    return {
      type: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
}
```

## 4. Logger Module 설정

### 4.1 Logger Module

**위치:** `src/adapter/shared/logger/logger.module.ts`

```typescript
import { Module, Global } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { pinoConfig } from '@/config/pino.config';
import { PinoLoggerService } from './pino-logger.service';
import { LOGGER } from './logger.interface';

@Global()
@Module({
  imports: [PinoLoggerModule.forRoot(pinoConfig)],
  providers: [
    {
      provide: LOGGER,
      useClass: PinoLoggerService,
    },
  ],
  exports: [LOGGER],
})
export class LoggerModule {}
```

### 4.2 App Module에 통합

**위치:** `src/app.module.ts`

```typescript
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { LoggerModule } from './adapter/shared/logger/logger.module';
import { CorrelationIdMiddleware } from './adapter/shared/middleware/correlation-id.middleware';

@Module({
  imports: [
    LoggerModule, // 전역 모듈로 등록
    // ... 다른 모듈들
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
```

## 5. 사용 패턴

### 5.1 CommandHandler에서 사용

```typescript
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ILogger, LOGGER } from '@/adapter/shared/logger/logger.interface';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';

@CommandHandler(MemberRegisterCommand)
export class MemberRegisterCommandHandler
  implements ICommandHandler<MemberRegisterCommand>
{
  constructor(
    @Inject(LOGGER) private readonly logger: ILogger,
    @Inject(REQUEST) private readonly request: Request,
    // ... 다른 의존성들
  ) {}

  async execute(command: MemberRegisterCommand): Promise<string> {
    const { email } = command;
    const correlationId = this.request.correlationId;

    this.logger.log('Member registration started', {
      module: 'MemberRegisterCommandHandler',
      correlationId,
      email,
    });

    try {
      // ... 비즈니스 로직

      this.logger.log('Member registration completed', {
        module: 'MemberRegisterCommandHandler',
        correlationId,
        memberId: member.getId(),
      });

      return member.getId();
    } catch (error) {
      this.logger.error(
        'Member registration failed',
        error as Error,
        {
          module: 'MemberRegisterCommandHandler',
          correlationId,
          email,
        },
      );
      throw error;
    }
  }
}
```

### 5.2 Service에서 사용

```typescript
@Injectable()
export class EmailService {
  constructor(
    @Inject(LOGGER) private readonly logger: ILogger,
    @Inject(REQUEST) private readonly request: Request,
  ) {}

  async sendVerificationEmail(email: string, code: string): Promise<void> {
    const correlationId = this.request.correlationId;

    this.logger.debug('Sending verification email', {
      module: 'EmailService',
      correlationId,
      email,
    });

    try {
      // 이메일 발송 로직
      this.logger.log('Verification email sent successfully', {
        module: 'EmailService',
        correlationId,
        email,
      });
    } catch (error) {
      this.logger.error(
        'Failed to send verification email',
        error as Error,
        {
          module: 'EmailService',
          correlationId,
          email,
        },
      );
      throw error;
    }
  }
}
```

### 5.3 Exception Filter에서 사용

**위치:** `src/adapter/shared/filter/global-exception.filter.ts`

```typescript
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ILogger, LOGGER } from '../logger/logger.interface';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(@Inject(LOGGER) private readonly logger: ILogger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.message
        : 'Internal server error';

    this.logger.error(
      `HTTP ${status} - ${request.method} ${request.url}`,
      exception instanceof Error ? exception : undefined,
      {
        module: 'GlobalExceptionFilter',
        correlationId: request.correlationId,
        method: request.method,
        url: request.url,
        statusCode: status,
      },
    );

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
      correlationId: request.correlationId,
    });
  }
}
```

### 5.4 main.ts에 Exception Filter 등록

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './adapter/shared/filter/global-exception.filter';
import { LOGGER } from './adapter/shared/logger/logger.interface';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Logger 가져오기
  const logger = app.get(LOGGER);

  // Global Exception Filter 등록
  app.useGlobalFilters(new GlobalExceptionFilter(logger));

  await app.listen(3000);
}
bootstrap();
```

## 6. REQUEST 스코프 주의사항

### 6.1 REQUEST 스코프가 필요한 이유

Correlation ID는 각 HTTP 요청마다 다르므로 `REQUEST` 스코프로 주입해야 합니다.

### 6.2 Provider를 REQUEST 스코프로 변경

CommandHandler나 Service에서 `@Inject(REQUEST)`를 사용하면 해당 Provider는 자동으로 REQUEST 스코프가 됩니다.

**주의:** REQUEST 스코프 Provider는 각 요청마다 새로 생성되므로 성능에 영향을 줄 수 있습니다.

### 6.3 대안: AsyncLocalStorage (선택사항)

REQUEST 주입 없이 correlation ID를 추적하려면 AsyncLocalStorage를 사용할 수 있습니다.

**위치:** `src/adapter/shared/correlation/correlation.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

interface CorrelationContext {
  correlationId: string;
}

@Injectable()
export class CorrelationService {
  private als = new AsyncLocalStorage<CorrelationContext>();

  run(correlationId: string, callback: () => void) {
    this.als.run({ correlationId }, callback);
  }

  getCorrelationId(): string | undefined {
    return this.als.getStore()?.correlationId;
  }
}
```

이 방식은 REQUEST 스코프 없이도 correlation ID를 추적할 수 있습니다.

## 7. 로그 레벨 가이드

| Level | 용도 | 예시 |
|-------|------|------|
| ERROR | 시스템 오류, 예외 상황 | DB 연결 실패, 외부 API 오류 |
| WARN  | 경고, 잠재적 문제 | Deprecated API 사용, 느린 쿼리 |
| INFO  | 중요한 비즈니스 이벤트 | 회원 가입 완료, 주문 생성 |
| DEBUG | 디버깅 정보 | 메서드 진입/종료, 변수 값 |

## 8. 보안 고려사항

### 8.1 민감 정보 Redaction

Pino 설정에서 민감 정보를 자동으로 제거합니다:

```typescript
redact: {
  paths: [
    'req.headers.authorization',
    'req.body.password',
    'req.body.accessToken',
    'req.body.refreshToken',
  ],
  remove: true,
}
```

### 8.2 로그에 포함하지 말아야 할 정보

- 비밀번호 (평문/해시 모두)
- JWT 토큰 전체 값
- 신용카드 번호
- 개인 식별 정보 (주민등록번호 등)

이메일 주소는 디버깅을 위해 포함 가능하지만, 프로덕션 환경에서는 마스킹을 고려하세요.

## 9. 테스팅

### 9.1 Mock Logger

```typescript
export const mockLogger = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

// 테스트에서 사용
{
  provide: LOGGER,
  useValue: mockLogger,
}
```

## 10. 로그 출력 예시

### 개발 환경 (pino-pretty)

```
[12:33:36.774] INFO  (prepair-backend): Member registration completed
    module: "MemberRegisterCommandHandler"
    correlationId: "743ae05d-b90d-00fd-6599"
    memberId: "uuid-here"
```

### 프로덕션 환경 (JSON)

```json
{
  "timestamp": "2026-01-16T12:33:36.774Z",
  "level": "INFO",
  "service": "prepair-backend",
  "correlationId": "743ae05d-b90d-00fd-6599",
  "message": "Member registration completed",
  "module": "MemberRegisterCommandHandler",
  "memberId": "uuid-here"
}
```

## 구현 순서

1. 패키지 설치 및 환경 변수 설정
2. Pino 설정 파일 작성 (`pino.config.ts`)
3. Correlation ID 미들웨어 구현
4. Logger Interface 및 구현체 작성
5. Logger Module 생성 및 App Module에 통합
6. Global Exception Filter 구현
7. 기존 코드에 Logger 적용 (CommandHandler, Service 등)
8. 테스트 및 검증
