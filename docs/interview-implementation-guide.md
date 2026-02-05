# Interview AI 질문 생성 구현 가이드

## 개요

사용자의 직업(job) 정보를 기반으로 OpenAI를 활용해 면접 질문을 생성하고, Prisma를 통해 데이터베이스에 저장하는 기능을 구현한다.

**핵심 결정 사항:**
- **아키텍처 패턴**: Service 패턴 (Auth/OAuth와 동일, CQRS 미적용)
- **ORM**: Prisma 7 (Interview/AI 전용) — 기존 MikroORM과 듀얼 ORM 구조
- **DB**: 동일 PostgreSQL 인스턴스 공유
- **트리거**: 회원가입 시 1회 + 매일 오전 08:30 Cron

---

## Prisma 7 주요 변경 사항

Prisma 7에서는 아키텍처가 대폭 변경되었다:

| 항목 | Prisma 6 이전 | Prisma 7 |
|------|--------------|----------|
| 설정 파일 | `schema.prisma`에 모든 설정 | `prisma.config.ts` + `schema.prisma` 분리 |
| Generator | `prisma-client-js` | `prisma-client` |
| 엔진 | Rust 바이너리 | TypeScript (Rust-free) |
| DB 연결 | `url = env("DATABASE_URL")` in schema | `prisma.config.ts`의 `datasource.url` |
| Driver | 내장 드라이버 | **Driver Adapter 필수** (`@prisma/adapter-pg`) |
| Client 출력 | `node_modules` | **커스텀 output 경로 필수** |
| Client 생성 | `new PrismaClient()` | `new PrismaClient({ adapter })` |

---

## 현재 구현 상태

| 항목 | 상태 | 파일 |
|------|------|------|
| 도메인 엔티티 | 완료 | `src/domain/interview/question/interview-question.ts` |
| 열거형 | 완료 | `src/domain/interview/enums/` |
| 타입 정의 | 완료 | `src/domain/interview/types/interview-type.ts` |
| 리포지토리 인터페이스 | 완료 | `src/domain/interview/question/interview-question.repository.ts` |
| AIQuestionGenerator 포트 | 완료 | `src/application/interview/ports/ai-question-genrator.port.ts` |
| InterviewService | 부분 완료 | `src/application/interview/interview.service.ts` (MikroORM 의존 제거 필요) |
| OpenAI 서비스 | 미완성 | `src/adapter/interview/ai/openai-question-generator.service.ts` (line 24에서 중단) |
| env.config | 완료 | `OPENAI_API_KEY`, `OPENAI_MODEL` 추가됨 |
| openai 패키지 | 설치됨 | `openai@^6.17.0` |

---

## 구현 순서

### Step 1. 패키지 설치

```bash
# Prisma 7 + PostgreSQL Driver Adapter
npm install @prisma/client@7 @prisma/adapter-pg pg
npm install -D prisma@7

# dotenv (Prisma 7에서 환경변수 로드 필수)
npm install dotenv

# NestJS 스케줄러 (Cron)
npm install @nestjs/schedule
```

> `openai@^6.17.0`은 이미 설치되어 있음.

**Prisma 7 필수 패키지:**
- `prisma@7`: Prisma CLI
- `@prisma/client@7`: Prisma Client
- `@prisma/adapter-pg`: PostgreSQL Driver Adapter **(Prisma 7 필수)**
- `pg`: Node.js PostgreSQL 드라이버
- `dotenv`: 환경변수 로드 (Prisma 7에서 자동 로드 안됨)

---

### Step 2. Prisma 7 초기 설정

#### 2-1. Prisma 초기화

```bash
npx prisma init --datasource-provider postgresql
```

Prisma 7에서는 다음 파일들이 생성된다:
- `prisma/schema.prisma` — 모델 정의
- `prisma.config.ts` — **Prisma 7 핵심 설정 파일**
- `.env` — 환경변수

#### 2-2. prisma.config.ts 설정 (Prisma 7 핵심)

```typescript
// prisma.config.ts (프로젝트 루트)

import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  // 스키마 파일 경로
  schema: "prisma/schema.prisma",

  // 마이그레이션 설정
  migrations: {
    path: "prisma/migrations",
  },

  // 데이터소스 설정 (Prisma 7에서 schema.prisma → config.ts로 이동)
  datasource: {
    url: env("DATABASE_URL"),
  },
});
```

**핵심 포인트:**
- `import "dotenv/config"` — Prisma 7에서 환경변수 자동 로드 안됨, 수동 import 필수
- `defineConfig()` — `prisma/config`에서 import, 타입 안전한 설정
- `env()` — 환경변수 참조 헬퍼 함수
- `datasource.url` — **schema.prisma에서 이동됨** (Prisma 7 breaking change)

#### 2-3. env.config.ts 수정

```typescript
// src/config/env.config.ts
export const envSchema = z.object({
  // ... 기존 설정 유지

  // Prisma용 DATABASE_URL 추가
  DATABASE_URL: z.string(),

  OPENAI_API_KEY: z.string(),
  OPENAI_MODEL: z.string(),
});
```

`.env` 파일에 추가:
```bash
# Prisma 7 - 실제 연결 문자열
DATABASE_URL="postgresql://username:password@localhost:5432/prepair?schema=public"
```

#### 2-4. Prisma 스키마 정의 (Prisma 7 문법)

```prisma
// prisma/schema.prisma

// Prisma 7: 새로운 generator 이름 + output 필수
generator client {
  provider     = "prisma-client"
  output       = "../src/generated/prisma"
  moduleFormat = "cjs"  // NestJS는 CommonJS 사용
}

// Prisma 7: datasource에서 url 제거 (prisma.config.ts로 이동)
datasource db {
  provider = "postgresql"
  // url은 prisma.config.ts에서 설정
}

model InterviewQuestion {
  id           String   @id @default(uuid()) @db.Uuid
  userId       String   @map("user_id") @db.Uuid
  question     String   @db.Text
  questionType String   @map("question_type") @db.VarChar(20)
  questionTag  String   @map("question_tag") @db.VarChar(50)
  status       String   @default("unanswered") @db.VarChar(20)
  score        Int      @default(0)
  sourceRef    String?  @map("source_ref")
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz

  @@map("interview_question")
  @@index([userId])
  @@index([userId, createdAt])
}
```

**Prisma 7 Generator 변경 사항:**
- `provider = "prisma-client"` — 이전: `prisma-client-js`
- `output = "../src/generated/prisma"` — **필수**, `node_modules`가 아닌 프로젝트 내 경로
- `moduleFormat = "cjs"` — NestJS (CommonJS) 호환성

**datasource 변경 사항:**
- `url = env("DATABASE_URL")` **제거** — Prisma 7에서 deprecated
- URL은 `prisma.config.ts`의 `datasource.url`에서 설정

#### 2-5. .gitignore 업데이트

```gitignore
# Prisma 7 generated client
/src/generated/prisma
```

#### 2-6. 마이그레이션 실행

```bash
# 마이그레이션 생성 및 적용
npx prisma migrate dev --name init-interview-question

# Prisma Client 생성 (src/generated/prisma 에 생성됨)
npx prisma generate
```

> **주의**: MikroORM 마이그레이션과 Prisma 마이그레이션이 같은 DB를 사용하므로, `_prisma_migrations` 테이블과 MikroORM의 마이그레이션 테이블이 공존하게 된다. 서로의 테이블에는 간섭하지 않으므로 문제없다.

---

### Step 3. PrismaService / PrismaModule (Prisma 7)

#### 3-1. PrismaService (Prisma 7 - Driver Adapter 사용)

```typescript
// src/adapter/shared/prisma/prisma.service.ts

import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly configService: ConfigService) {
    // Prisma 7: Driver Adapter 필수
    const adapter = new PrismaPg({
      connectionString: configService.getOrThrow<string>("DATABASE_URL"),
    });

    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
```

**Prisma 7 핵심 변경 사항:**
- `PrismaClient` import 경로: `@/generated/prisma/client` (output 경로 기반)
- `PrismaPg` adapter 필수 — Prisma 7은 내장 드라이버 없음
- `super({ adapter })` — PrismaClient 생성 시 adapter 전달 필수

**Connection Pool 설정 (선택):**

```typescript
const adapter = new PrismaPg({
  connectionString: configService.getOrThrow<string>("DATABASE_URL"),
  pool: {
    max: 10,                      // 최대 연결 수
    connectionTimeoutMillis: 30000, // 연결 타임아웃
  },
});
```

#### 3-2. PrismaModule

```typescript
// src/adapter/shared/prisma/prisma.module.ts

import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

`@Global()`로 선언하여 모든 모듈에서 별도 import 없이 `PrismaService`를 주입받을 수 있도록 한다.

#### 3-3. barrel export

```typescript
// src/adapter/shared/prisma/index.ts

export * from "./prisma.service";
export * from "./prisma.module";
```

#### 3-4. tsconfig.json 경로 별칭 추가

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["src/*"],
      "@/generated/*": ["src/generated/*"]
    }
  }
}
```

---

### Step 4. Repository 구현체 (Prisma 7)

```typescript
// src/adapter/interview/persistence/interview-question-prisma.repository.ts

import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/adapter/shared/prisma";
import {
  InterviewQuestion,
  type InterviewQuestionRepository,
} from "@/domain/interview/question";

@Injectable()
export class InterviewQuestionPrismaRepository implements InterviewQuestionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(question: InterviewQuestion): Promise<void> {
    await this.prisma.interviewQuestion.create({
      data: {
        id: question.id,
        userId: question.userId,
        question: question.question,
        questionType: question.questionType,
        questionTag: question.questionTag,
        status: question.status,
        score: question.score,
        sourceRef: question.sourceRef,
        createdAt: question.createdAt,
      },
    });
  }
}
```

**설계 포인트:**
- 도메인 `InterviewQuestionRepository` 인터페이스를 구현
- DI 토큰 `INTERVIEW_QUESTION_REPOSITORY`로 바인딩
- MikroORM의 `EntityManager.flush()` 패턴 대신 Prisma의 즉시 실행 방식 사용

---

### Step 5. OpenAI 서비스 완성

기존 `openai-question-generator.service.ts`를 완성한다. `openai` v6 SDK를 사용한다.

```typescript
// src/adapter/interview/ai/openai-question-generator.service.ts

import { Injectable, Logger } from "@nestjs/common";
import {
  type AIQuestionGenerator,
  type GeneratedQuestion,
} from "@/application/interview/ports";
import { ConfigService } from "@nestjs/config";
import { QuestionTypeEnum } from "@/domain/interview/enums";
import OpenAI from "openai";

@Injectable()
export class OpenaiQuestionGeneratorService implements AIQuestionGenerator {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly logger = new Logger(OpenaiQuestionGeneratorService.name);

  constructor(private readonly configService: ConfigService) {
    this.client = new OpenAI({
      apiKey: this.configService.getOrThrow<string>("OPENAI_API_KEY"),
    });
    this.model = this.configService.getOrThrow<string>("OPENAI_MODEL");
  }

  async generateQuestions(
    job: string,
    count: number = 1,
  ): Promise<GeneratedQuestion[]> {
    const prompt = this.buildPrompt(job, count);

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: "system",
          content: "You are an expert interviewer. Always respond in valid JSON only.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.8,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI returned empty response");
    }

    const parsed = JSON.parse(content) as {
      questions: Array<{ question: string; questionTag: string }>;
    };

    return parsed.questions.map((q) => ({
      question: q.question,
      questionType: QuestionTypeEnum.TEXT,
      questionTag: q.questionTag,
    }));
  }

  private buildPrompt(job: string, count: number = 1): string {
    return `
10년차 실무 면접관의 입장에서 면접 질문을 생성해주세요.

직업: ${job}
질문 개수: ${count}

질문은 실제 업무에서 마주할 수 있는 상황을 바탕으로 하며,
하루에 하나씩 연습하기 좋은 면접 문제 형태로 작성해주세요.
답변 이후에는 생각을 더 확장해볼 수 있는 여지가 있어야 합니다.

부연 설명 없이 다음 JSON 형식으로만 응답하세요:
{
  "questions": [
    {
      "question": "면접 질문 내용",
      "questionTag": "태그 (예: 역량, 기술, 경험, 협업, 인성, 지원동기 등)"
    }
  ]
}`.trim();
  }
}
```

**변경 사항:**
- 반환 타입을 `GeneratedQuestion` → `GeneratedQuestion[]`로 변경 (다중 질문 지원)
- `openai` v6 SDK의 `OpenAI` 클래스 사용
- `response_format: { type: "json_object" }`으로 JSON 응답 보장
- 에러 핸들링 추가

**포트 인터페이스 수정 필요:**

```typescript
// src/application/interview/ports/ai-question-genrator.port.ts

import { QuestionTypeEnum } from "@/domain/interview/enums";

export type GeneratedQuestion = {
  question: string;
  questionType: QuestionTypeEnum;
  questionTag: string;
};

export interface AIQuestionGenerator {
  generateQuestions(job: string, count?: number): Promise<GeneratedQuestion[]>;
  // 반환 타입 GeneratedQuestion → GeneratedQuestion[] 로 변경
}

export const AI_QUESTION_GENERATOR: symbol = Symbol("AIQuestionGenerator");
```

---

### Step 6. InterviewService 리팩토링

MikroORM `EntityManager` 의존성을 제거하고, 다중 질문 생성을 지원하도록 수정한다.

```typescript
// src/application/interview/interview.service.ts

import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  INTERVIEW_QUESTION_REPOSITORY,
  InterviewQuestion,
  type InterviewQuestionRepository,
} from "@/domain/interview/question";
import type { ILogger } from "@/adapter/shared/logger/logger.inferface";
import {
  AI_QUESTION_GENERATOR,
  type AIQuestionGenerator,
  type GeneratedQuestion,
} from "@/application/interview/ports";
import { QuestionTypeEnum } from "@/domain/interview/enums";

@Injectable()
export class InterviewService {
  constructor(
    @Inject(INTERVIEW_QUESTION_REPOSITORY)
    private readonly questionRepository: InterviewQuestionRepository,
    @Inject(Logger)
    private readonly logger: ILogger,
    @Inject(AI_QUESTION_GENERATOR)
    private readonly aiQuestionGenerator: AIQuestionGenerator,
  ) {}

  async generateQuestions(
    userId: string,
    job: string,
    count: number = 1,
  ): Promise<InterviewQuestion[]> {
    const generatedQuestions: GeneratedQuestion[] =
      await this.aiQuestionGenerator.generateQuestions(job, count);

    const questions: InterviewQuestion[] = generatedQuestions.map((gq) =>
      InterviewQuestion.createQuestion({
        userId,
        question: gq.question,
        questionType: QuestionTypeEnum.TEXT,
        questionTag: gq.questionTag,
      }),
    );

    for (const question of questions) {
      await this.questionRepository.save(question);
    }

    this.logger.log("AI interview questions generated", {
      module: "InterviewService",
      userId,
      job,
      count: questions.length,
    });

    return questions;
  }
}
```

**변경 사항:**
- `EntityManager` (MikroORM) 의존성 제거 — Prisma Repository가 즉시 실행하므로 `flush()` 불필요
- `generateQuestion()` → `generateQuestions()` 로 이름 변경 (다중 질문)
- 반환 타입 `InterviewQuestion` → `InterviewQuestion[]`
- `count` 파라미터 추가

---

### Step 7. InterviewController + DTO

#### 7-1. DTO 정의

```typescript
// src/adapter/interview/api/dto/create-question.dto.ts

import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class CreateQuestionDto {
  @IsString()
  job: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  count?: number;
}
```

> `userId`는 JWT에서 추출하므로 DTO에 포함하지 않는다.

#### 7-2. barrel export

```typescript
// src/adapter/interview/api/dto/index.ts

export * from "./create-question.dto";
```

#### 7-3. Controller

```typescript
// src/adapter/interview/api/interview.controller.ts

import { Body, Controller, Post } from "@nestjs/common";
import { InterviewService } from "@/application/interview/interview.service";
import { CurrentUser } from "@/adapter/shared/api/decorators/current-user.decorator";
import type { User } from "@/adapter/shared/api/types/user";
import { CreateQuestionDto } from "./dto";

@Controller("api/interview")
export class InterviewController {
  constructor(private readonly interviewService: InterviewService) {}

  @Post("create-question")
  async createQuestion(
    @CurrentUser() user: User,
    @Body() dto: CreateQuestionDto,
  ) {
    const questions = await this.interviewService.generateQuestions(
      user.memberId,
      dto.job,
      dto.count,
    );

    return {
      success: true,
      count: questions.length,
      questions: questions.map((q) => ({
        id: q.id,
        question: q.question,
        questionTag: q.questionTag,
        questionType: q.questionType,
        status: q.status,
        createdAt: q.createdAt,
      })),
    };
  }
}
```

**설계 포인트:**
- `@CurrentUser()` 데코레이터로 JWT에서 `memberId` 추출
- 인증된 사용자만 접근 가능 (JwtAuthGuard 전역 적용)
- 응답에서 `userId` 제외 (본인 요청이므로 불필요)

---

### Step 8. Cron 스케줄러

#### 8-1. 스케줄러 서비스

```typescript
// src/adapter/interview/scheduler/interview-scheduler.service.ts

import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InterviewService } from "@/application/interview/interview.service";
import { PrismaService } from "@/adapter/shared/prisma";

@Injectable()
export class InterviewSchedulerService {
  private readonly logger = new Logger(InterviewSchedulerService.name);

  constructor(
    private readonly interviewService: InterviewService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 매일 오전 08:30 (KST) 에 모든 활성 사용자에게 면접 질문 생성
   * Cron 표현식: 분(30) 시(8) 일(*) 월(*) 요일(*)
   * 서버 타임존이 KST가 아닌 경우 timeZone 옵션 사용
   */
  @Cron("30 8 * * *", { timeZone: "Asia/Seoul" })
  async handleDailyQuestionGeneration(): Promise<void> {
    this.logger.log("Daily interview question generation started");

    // 활성 사용자 목록 조회
    // member 테이블은 MikroORM이 관리하므로 Prisma raw query 또는
    // MemberReadRepository를 주입받아 사용할 수 있다.
    // 여기서는 Prisma의 $queryRaw를 사용하는 예시:
    const activeUsers = await this.prisma.$queryRaw<
      Array<{ id: string; job: string }>
    >`SELECT id, job FROM member_read WHERE job IS NOT NULL`;

    let successCount = 0;
    let failCount = 0;

    for (const user of activeUsers) {
      try {
        await this.interviewService.generateQuestions(user.id, user.job, 1);
        successCount++;
      } catch (error) {
        failCount++;
        this.logger.error(
          `Failed to generate question for user ${user.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    this.logger.log(
      `Daily generation completed: success=${successCount}, fail=${failCount}`,
    );
  }
}
```

**설계 포인트:**
- `timeZone: "Asia/Seoul"` 명시적 지정으로 KST 기준 08:30 실행
- 개별 사용자 실패가 전체 실행을 중단시키지 않도록 try-catch
- `member_read` 테이블에서 `job`이 있는 사용자만 조회 (질문 생성에 job 필수)
- `member_read`는 MikroORM 관리 테이블이므로 Prisma `$queryRaw`로 읽기 전용 접근

**대안 — MemberReadRepository 주입 방식:**

MikroORM의 `MemberReadRepository`를 직접 주입받으려면 `InterviewModule`에서 `MemberModule`을 import하고 `MEMBER_READ_REPOSITORY` 토큰을 사용할 수 있다. 이 경우 raw query 대신 타입 안전한 조회가 가능하다.

```typescript
// 대안: MemberReadRepository 주입 방식
constructor(
  private readonly interviewService: InterviewService,
  @Inject(MEMBER_READ_REPOSITORY)
  private readonly memberReadRepository: MemberReadRepository,
) {}

// 사용
const activeUsers = await this.memberReadRepository.findAllWithJob();
```

이 경우 `MemberReadRepository` 인터페이스에 `findAllWithJob()` 메서드를 추가하고 구현체에서 쿼리를 작성해야 한다.

---

### Step 9. MemberRegisterEvent 연동

회원가입 시 최초 면접 질문을 자동 생성한다.

```typescript
// src/application/interview/event/member-register-question.handler.ts

import { Inject, Injectable, Logger } from "@nestjs/common";
import { EventsHandler, IEventHandler } from "@nestjs/cqrs";
import { MemberRegisterEvent } from "@/domain/member/events";
import { InterviewService } from "@/application/interview/interview.service";

@Injectable()
@EventsHandler(MemberRegisterEvent)
export class MemberRegisterQuestionHandler
  implements IEventHandler<MemberRegisterEvent>
{
  private readonly logger = new Logger(MemberRegisterQuestionHandler.name);

  constructor(private readonly interviewService: InterviewService) {}

  async handle(event: MemberRegisterEvent): Promise<void> {
    const { memberId, job } = event;

    if (!job) {
      this.logger.warn(
        `Skipping question generation for member ${memberId}: no job info`,
      );
      return;
    }

    try {
      await this.interviewService.generateQuestions(memberId, job, 1);
      this.logger.log(
        `Initial interview question generated for member ${memberId}`,
      );
    } catch (error) {
      // 질문 생성 실패가 회원가입을 방해하지 않도록 에러만 로깅
      this.logger.error(
        `Failed to generate initial question for member ${memberId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
```

**주의 사항:**
- `MemberRegisterEvent`에 `job` 필드가 포함되어 있는지 확인 필요
- 포함되어 있지 않다면:
  - 방법 1: `MemberRegisterEvent` payload에 `job` 추가
  - 방법 2: 이벤트 핸들러에서 `MemberReadRepository`로 job 조회
- 질문 생성 실패는 회원가입 트랜잭션에 영향을 주지 않음 (비동기 이벤트 핸들러)

---

### Step 10. InterviewModule

```typescript
// src/adapter/interview/interview.module.ts

import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { InterviewController } from "@/adapter/interview/api/interview.controller";
import { InterviewService } from "@/application/interview/interview.service";
import { OpenaiQuestionGeneratorService } from "@/adapter/interview/ai/openai-question-generator.service";
import { InterviewQuestionPrismaRepository } from "@/adapter/interview/persistence/interview-question-prisma.repository";
import { InterviewSchedulerService } from "@/adapter/interview/scheduler/interview-scheduler.service";
import { MemberRegisterQuestionHandler } from "@/application/interview/event/member-register-question.handler";
import { INTERVIEW_QUESTION_REPOSITORY } from "@/domain/interview/question";
import { AI_QUESTION_GENERATOR } from "@/application/interview/ports";

const EventHandlers = [MemberRegisterQuestionHandler];

@Module({
  imports: [CqrsModule],
  controllers: [InterviewController],
  providers: [
    InterviewService,
    ...EventHandlers,
    InterviewSchedulerService,
    {
      provide: INTERVIEW_QUESTION_REPOSITORY,
      useClass: InterviewQuestionPrismaRepository,
    },
    {
      provide: AI_QUESTION_GENERATOR,
      useClass: OpenaiQuestionGeneratorService,
    },
  ],
})
export class InterviewModule {}
```

**패턴 준수:**
- Symbol 토큰 기반 DI (기존 프로젝트 패턴)
- EventHandlers 배열 분리 (MemberModule 패턴 준수)
- `PrismaModule`은 `@Global()`이므로 별도 import 불필요

---

### Step 11. app.module.ts 업데이트

```typescript
// src/app.module.ts

import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { MemberModule } from "@/adapter/member/member.module";
import { PersistenceModule } from "@/adapter/member/persistence/persistence.module";
import { ConfigModule } from "@nestjs/config";
import { envSchema } from "@/config/env.config";
import { CqrsModule } from "@nestjs/cqrs";
import { AuthModule } from "@/adapter/auth/auth.module";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { TransformResponseInterceptor } from "@/adapter/shared/api/interceptors/transform-response.interceptor";
import { JwtAuthGuard } from "@/adapter/auth/security";
import { OAuthModule } from "@/adapter/oauth/oauth.module";
import { LoggerModule } from "@/adapter/shared/logger/logger.module";
import { CorrelationIdMiddleware } from "@/adapter/shared/middleware/correlation-id.middleware";
import { HealthController } from "@/adapter/shared/api/health.controller";
import { PrismaModule } from "@/adapter/shared/prisma";              // 추가
import { InterviewModule } from "@/adapter/interview/interview.module"; // 추가
import { ScheduleModule } from "@nestjs/schedule";                     // 추가

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config: Record<string, any>) => envSchema.parse(config),
    }),
    CqrsModule.forRoot(),
    ScheduleModule.forRoot(),  // 추가
    PersistenceModule,
    PrismaModule,              // 추가
    MemberModule,
    AuthModule,
    OAuthModule,
    InterviewModule,           // 추가
    LoggerModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformResponseInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes("*");
  }
}
```

---

## 파일 체크리스트

### 신규 생성

| 파일 | 설명 |
|------|------|
| `prisma.config.ts` | **Prisma 7 핵심 설정 파일** (프로젝트 루트) |
| `prisma/schema.prisma` | Prisma 스키마 (InterviewQuestion 모델) |
| `src/generated/prisma/` | Prisma Client 생성 위치 (gitignore) |
| `src/adapter/shared/prisma/prisma.service.ts` | PrismaClient + Driver Adapter 래퍼 |
| `src/adapter/shared/prisma/prisma.module.ts` | Global Prisma 모듈 |
| `src/adapter/shared/prisma/index.ts` | barrel export |
| `src/adapter/interview/persistence/interview-question-prisma.repository.ts` | Prisma 기반 리포지토리 구현체 |
| `src/adapter/interview/api/interview.controller.ts` | Interview API 컨트롤러 |
| `src/adapter/interview/api/dto/create-question.dto.ts` | 질문 생성 요청 DTO |
| `src/adapter/interview/api/dto/index.ts` | barrel export |
| `src/adapter/interview/interview.module.ts` | Interview 피처 모듈 |
| `src/adapter/interview/scheduler/interview-scheduler.service.ts` | Cron 스케줄러 |
| `src/application/interview/event/member-register-question.handler.ts` | 회원가입 이벤트 핸들러 |

### 수정

| 파일 | 변경 내용 |
|------|----------|
| `src/adapter/interview/ai/openai-question-generator.service.ts` | OpenAI API 호출 완성 |
| `src/application/interview/ports/ai-question-genrator.port.ts` | 반환 타입 `GeneratedQuestion[]`로 변경 |
| `src/application/interview/interview.service.ts` | MikroORM 제거, 다중 질문 지원 |
| `src/config/env.config.ts` | `DATABASE_URL` 추가 |
| `tsconfig.json` | `@/generated/*` 경로 별칭 추가 |
| `src/app.module.ts` | PrismaModule, InterviewModule, ScheduleModule 추가 |
| `package.json` | Prisma 7 패키지들 추가 |
| `.gitignore` | `/src/generated/prisma` 추가 |

---

## 아키텍처 다이어그램

```
                        ┌─────────────────────────────┐
                        │       app.module.ts          │
                        │  ScheduleModule.forRoot()    │
                        │  PrismaModule (Global)       │
                        │  InterviewModule             │
                        └──────────┬──────────────────┘
                                   │
                    ┌──────────────┼──────────────────┐
                    │              │                   │
             ┌──────▼──────┐ ┌────▼─────┐    ┌───────▼────────┐
             │  Controller │ │  Cron    │    │  EventHandler  │
             │  POST /api/ │ │  08:30   │    │  MemberRegister│
             │  interview/ │ │  daily   │    │  QuestionHandler│
             │  create-    │ └────┬─────┘    └───────┬────────┘
             │  question   │      │                  │
             └──────┬──────┘      │                  │
                    │             │                  │
                    └─────────────┼──────────────────┘
                                  │
                         ┌────────▼────────┐
                         │ InterviewService │
                         │ (Application)    │
                         └───┬─────────┬───┘
                             │         │
                    ┌────────▼──┐  ┌───▼──────────────┐
                    │ AI Port   │  │ Repository Port   │
                    │ (OpenAI)  │  │ (InterviewQuestion│
                    └────────┬──┘  │  Repository)      │
                             │     └───┬───────────────┘
                    ┌────────▼──┐  ┌───▼───────────────┐
                    │ OpenAI    │  │ Prisma 7 Repository│
                    │ Adapter   │  │ + Driver Adapter   │
                    │ (v6 SDK)  │  │ (@prisma/adapter-pg)│
                    └───────────┘  └───┬───────────────┘
                                      │
                              ┌───────▼───────┐
                              │  PostgreSQL    │
                              │ (동일 인스턴스) │
                              │               │
                              │ MikroORM 테이블│
                              │ + Prisma 테이블│
                              └───────────────┘
```

---

## API 스펙

### POST /api/interview/create-question

**인증**: JWT Bearer Token 필수

**Request Body:**
```json
{
  "job": "백엔드 개발자",
  "count": 3
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `job` | string | O | 사용자 직업 |
| `count` | number | X | 생성할 질문 수 (기본값: 1, 최대: 10) |

**Response (200):**
```json
{
  "success": true,
  "count": 3,
  "questions": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "question": "대규모 트래픽 상황에서 데이터베이스 병목을 해결한 경험이 있나요?",
      "questionTag": "기술",
      "questionType": "text",
      "status": "unanswered",
      "createdAt": "2025-01-15T08:30:00.000Z"
    }
  ]
}
```

---

## 검증 방법

### 1. Prisma 7 설정 확인

```bash
# Prisma Client 생성 확인
npx prisma generate

# src/generated/prisma/ 디렉토리에 client.ts 등 생성 확인
ls -la src/generated/prisma/

# 마이그레이션 적용 확인
npx prisma migrate status

# Prisma Studio로 테이블 확인 (Prisma 7)
npx prisma studio --config ./prisma.config.ts
```

### 2. API 테스트

```bash
# 로그인하여 access token 획득 후
curl -X POST http://localhost:3000/api/interview/create-question \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"job": "백엔드 개발자", "count": 2}'
```

### 3. Cron 동작 확인

개발 중 즉시 테스트하려면 Cron 표현식을 임시로 변경:

```typescript
// 10초마다 실행 (테스트용)
@Cron("*/10 * * * * *", { timeZone: "Asia/Seoul" })
```

로그에서 `Daily interview question generation started` 메시지 확인.

### 4. 회원가입 연동 확인

1. `POST /api/members/register`로 회원가입 (job 포함)
2. 로그에서 `Initial interview question generated for member ...` 확인
3. DB에서 `interview_question` 테이블 조회로 질문 생성 확인

---

## 주의 사항

1. **Prisma 7 필수 변경**: `prisma.config.ts` 없이는 마이그레이션/생성 불가
2. **Driver Adapter 필수**: `@prisma/adapter-pg` 없이 PrismaClient 생성 시 에러 발생
3. **Import 경로**: `@prisma/client` 아닌 `@/generated/prisma/client`에서 import
4. **듀얼 ORM 마이그레이션 충돌**: MikroORM과 Prisma 각각 별도 마이그레이션 테이블 사용, **같은 테이블 이름** 사용 금지
5. **MemberRegisterEvent payload**: 현재 이벤트에 `job` 필드 포함 여부 확인 필요
6. **OpenAI Rate Limit**: Cron으로 다수의 사용자에게 동시 요청 시 rate limit 고려
7. **`indext.ts` 오타**: `src/domain/interview/question/indext.ts` → `index.ts`로 수정 필요

---

## Prisma 7 트러블슈팅

### 에러: `@prisma/client did not initialize yet`

```bash
# Prisma Client 재생성
npx prisma generate
```

### 에러: `datasource property "url" is deprecated`

`schema.prisma`에서 `url = env("DATABASE_URL")` 제거하고 `prisma.config.ts`로 이동

### 에러: `paths[1] must be a string`

`PrismaPg` 생성 시 `connectionString` 옵션 사용:

```typescript
// 올바른 방식
const adapter = new PrismaPg({
  connectionString: configService.get<string>("DATABASE_URL"),
});

// 잘못된 방식 (일부 버전에서 에러)
const adapter = new PrismaPg({
  url: configService.get<string>("DATABASE_URL"),
});
```

### 에러: `Cannot find module './generated/prisma/client'`

1. `prisma generate` 실행 확인
2. `tsconfig.json`에 `@/generated/*` 경로 별칭 추가
3. `schema.prisma`의 `output` 경로 확인
