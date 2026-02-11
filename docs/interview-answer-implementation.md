# Interview Answer 기능 구현 가이드

## Context

현재 면접 질문(InterviewQuestion)을 매일 생성하여 사용자에게 전달하는 기능까지 구현된 상태이다. 이제 사용자가 질문에 **답변을 제출**하고, **첫 번째 답변에 대해서만 AI 채점 → 질문 점수 반영 → 회원 포인트 누적**이 이루어지는 기능을 구현한다.

**설계 결정사항:**
- ORM: Prisma (기존 Interview 도메인과 일관성 유지)
- 아키텍처: Service 패턴 (CQRS 미적용, 기존 Interview 도메인과 동일)
- AI 채점: OpenAI API 직접 호출 (기존 `OpenaiQuestionGeneratorService`와 동일 패턴)
- Member 포인트 누적: HTTP (REST) — Interview 도메인은 별도 Java MSA 서비스이므로, Member 서비스의 HTTP API를 호출
- 재답변: 가능 (첫 번째만 채점, 나머지는 연습용)

---

## 전체 프로세스 흐름도

```
사용자 → POST /api/interview/answer
         │
         ▼
  InterviewController.submitAnswer()
         │
         ▼
  InterviewAnswerService.submitAnswer()
         │
         ├─ 1. questionRepository.findById()  →  질문 조회 + 소유권 검증
         │
         ├─ 2. InterviewAnswer.createAnswer()  →  답변 도메인 객체 생성
         │
         ├─ 3. answerRepository.save()  →  답변 DB 저장 (항상 성공)
         │
         └─ 4. question.isFirstAnswer()?
              │
              ├─ YES → handleFirstAnswer()
              │         │
              │         ├─ aiScoring.scoreAnswer()     → OpenAI API 직접 호출
              │         │   (실패 시 score = 0)
              │         │
              │         ├─ question.markAsAnswered(score) → 질문 상태 ANSWERED + 점수
              │         ├─ questionRepository.update()    → DB 반영
              │         │
              │         └─ memberPointUpdate.addPoint()   → Member 포인트 누적
              │             │                               (HTTP → Member API)
              │             └─ PATCH /api/members/:id/point
              │                 └─ MemberController.addPoint()
              │                     └─ CommandBus → AddMemberPointCommand
              │                         ├─ member.addPoint()
              │                         ├─ memberRepository.update()
              │                         ├─ eventStore.append()
              │                         ├─ em.flush()
              │                         └─ eventBus.publish(MemberUpdateEvent)
              │                             └─ MemberUpdateEventHandler → Read Model 동기화
              │
              └─ NO  → score = null (연습 답변, 채점 없음)
```

---

## 구현 순서 (8 Phase)

---

### Phase 1: Domain Layer — 기반 구조

#### 1-1. InterviewAnswer 타입 정의

**새 파일: `src/domain/interview/answer/types/interview-answer.type.ts`**

```typescript
import { AnswerTypeEnum } from "@/domain/interview/answer/enums/answer-type.enum";

export type InterviewAnswerType = {
  id: string;
  questionId: string;
  answer: string;
  answerType: AnswerTypeEnum;
  mediaUrl: string | null;
  createdAt: Date;
};

export type CreateAnswerRequest = {
  questionId: string;
  answer: string;
  answerType: AnswerTypeEnum;
  mediaUrl?: string;
};
```

> **참고 패턴:** `src/domain/interview/types/interview-type.ts`

#### 1-2. InterviewAnswer 엔티티

**새 파일: `src/domain/interview/answer/interview-answer.ts`**

```typescript
import { AnswerTypeEnum } from "@/domain/interview/answer/enums";
import {
  CreateAnswerRequest,
  InterviewAnswerType,
} from "@/domain/interview/answer/types";
import { randomUUID } from "crypto";

export class InterviewAnswer {
  readonly id: string;
  readonly questionId: string;
  readonly answer: string;
  readonly answerType: AnswerTypeEnum;
  readonly mediaUrl: string | null;
  readonly createdAt: Date;

  private constructor(data: InterviewAnswerType) {
    Object.assign(this, data);
  }

  public static createAnswer(request: CreateAnswerRequest): InterviewAnswer {
    return new InterviewAnswer({
      id: randomUUID(),
      questionId: request.questionId,
      answer: request.answer,
      answerType: request.answerType,
      mediaUrl: request.mediaUrl ?? null,
      createdAt: new Date(),
    });
  }

  // DB에서 기존 엔티티 복원 (이미 검증된 데이터)
  public static of(data: InterviewAnswerType): InterviewAnswer {
    return new InterviewAnswer(data);
  }
}
```

> **참고 패턴:** `src/domain/interview/question/interview-question.ts` — `createQuestion()`, private constructor, readonly 필드

#### 1-3. InterviewAnswer Repository 인터페이스

**새 파일: `src/domain/interview/answer/interview-answer.repository.ts`**

```typescript
import { InterviewAnswer } from "./interview-answer";

export interface InterviewAnswerRepository {
  save(answer: InterviewAnswer): Promise<void>;
  findByQuestionId(questionId: string): Promise<InterviewAnswer[]>;
  countByQuestionId(questionId: string): Promise<number>;
}

export const INTERVIEW_ANSWER_REPOSITORY: symbol = Symbol("InterviewAnswerRepository");
```

> `countByQuestionId`는 첫 번째 답변 판별에 사용할 수 있지만, 실제로는 Question의 `status`로 판별하는 것이 race condition에 더 안전함

#### 1-4. 도메인 예외

**새 파일: `src/domain/interview/answer/exceptions/interview-question-not-found.exception.ts`**

```typescript
import { DomainException } from "@/domain/shared/exception/domain.exception";

export class InterviewQuestionNotFoundException extends DomainException {
  readonly errorCode = "INTERVIEW_QUESTION_NOT_FOUND";

  constructor(questionId: string) {
    super(`면접 질문을 찾을 수 없습니다: ${questionId}`);
    this.name = "InterviewQuestionNotFoundException";
  }
}
```

**새 파일: `src/domain/interview/answer/exceptions/index.ts`**

```typescript
export * from "./interview-question-not-found.exception";
```

#### 1-5. Barrel Exports

**새 파일: `src/domain/interview/answer/index.ts`**

```typescript
export * from "./interview-answer";
export * from "./interview-answer.repository";
export * from "./types";
export * from "./exceptions";
```

**수정: `src/domain/interview/indext.ts`** (기존 파일명의 오타 유지)

```typescript
export * from "./enums";
export * from "./types";
export * from "./question";
export * from "./answer";  // 추가
```

#### 1-6. InterviewQuestion 도메인 모델 업데이트

**수정: `src/domain/interview/question/interview-question.ts`**

기존 클래스에 3개 메서드 추가:

```typescript
// 첫 답변 여부 확인 (도메인 로직)
public isFirstAnswer(): boolean {
  return this.status === QuestionStatusEnum.UNANSWERED;
}

// 답변 완료 처리 + 점수 반영 (불변성 유지 — 새 인스턴스 반환)
public markAsAnswered(score: number): InterviewQuestion {
  return new InterviewQuestion({
    id: this.id,
    userId: this.userId,
    question: this.question,
    questionType: this.questionType,
    questionTag: this.questionTag,
    status: QuestionStatusEnum.ANSWERED,
    score,
    sourceRef: this.sourceRef,
    createdAt: this.createdAt,
  });
}

// DB에서 기존 엔티티 복원
public static of(data: InterviewQuestionType): InterviewQuestion {
  return new InterviewQuestion(data);
}
```

> **참고 패턴:** `src/domain/member/member.ts:59-85` — `update()` 메서드의 불변 패턴과 동일

#### 1-7. InterviewQuestionRepository 인터페이스 확장

**수정: `src/domain/interview/question/interview-question.repository.ts`**

```typescript
import { InterviewQuestion } from "@/domain/interview/question/interview-question";

export interface InterviewQuestionRepository {
  save(question: InterviewQuestion): Promise<void>;
  findById(id: string): Promise<InterviewQuestion | null>;  // 추가
  update(question: InterviewQuestion): Promise<void>;        // 추가
}

export const INTERVIEW_QUESTION_REPOSITORY: symbol = Symbol(
  "InterviewQuestionRepository",
);
```

---

### Phase 2: Prisma Schema & Migration

**수정: `prisma/schema.prisma`**

```prisma
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

  answers      InterviewAnswer[]  // 관계 추가

  @@map("interview_question")
  @@index([userId])
  @@index([userId, createdAt])
}

model InterviewAnswer {
  id         String   @id @default(uuid()) @db.Uuid
  questionId String   @map("question_id") @db.Uuid
  answer     String   @db.Text
  answerType String   @map("answer_type") @db.VarChar(20)
  mediaUrl   String?  @map("media_url") @db.Text
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz

  question   InterviewQuestion @relation(fields: [questionId], references: [id])

  @@map("interview_answer")
  @@index([questionId])
}
```

> **참고:** 현재 스키마에 `@map("quesiton_id")` 오타가 있음 → `@map("question_id")`로 수정 필요

**실행:**

```bash
npx prisma migrate dev --name add_interview_answer
npx prisma generate
```

---

### Phase 3: Persistence Layer (Adapter)

#### 3-1. InterviewAnswer Prisma Repository 구현

**새 파일: `src/adapter/interview/persistence/interview-answer-prisma.repository.ts`**

```typescript
import { Injectable } from "@nestjs/common";
import {
  InterviewAnswer,
  type InterviewAnswerRepository,
} from "@/domain/interview/answer";
import { PrismaService } from "@/adapter/shared/prisma";
import { AnswerTypeEnum } from "@/domain/interview/answer/enums";

@Injectable()
export class InterviewAnswerPrismaRepository implements InterviewAnswerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(answer: InterviewAnswer): Promise<void> {
    await this.prisma.interviewAnswer.create({
      data: {
        id: answer.id,
        questionId: answer.questionId,
        answer: answer.answer,
        answerType: answer.answerType,
        mediaUrl: answer.mediaUrl,
        createdAt: answer.createdAt,
      },
    });
  }

  async findByQuestionId(questionId: string): Promise<InterviewAnswer[]> {
    const records = await this.prisma.interviewAnswer.findMany({
      where: { questionId },
      orderBy: { createdAt: "asc" },
    });

    return records.map((r) =>
      InterviewAnswer.of({
        id: r.id,
        questionId: r.questionId,
        answer: r.answer,
        answerType: r.answerType as AnswerTypeEnum,
        mediaUrl: r.mediaUrl,
        createdAt: r.createdAt,
      }),
    );
  }

  async countByQuestionId(questionId: string): Promise<number> {
    return this.prisma.interviewAnswer.count({
      where: { questionId },
    });
  }
}
```

> **참고 패턴:** `src/adapter/interview/persistence/interview-question-prisma.repository.ts`

#### 3-2. InterviewQuestion Prisma Repository 확장

**수정: `src/adapter/interview/persistence/interview-question-prisma.repository.ts`**

기존 `save()` 메서드 아래에 `findById()`와 `update()` 추가:

```typescript
async findById(id: string): Promise<InterviewQuestion | null> {
  const record = await this.prisma.interviewQuestion.findUnique({
    where: { id },
  });

  if (!record) return null;

  return InterviewQuestion.of({
    id: record.id,
    userId: record.userId,
    question: record.question,
    questionType: record.questionType as QuestionTypeEnum,
    questionTag: record.questionTag,
    status: record.status as QuestionStatusEnum,
    score: record.score,
    sourceRef: record.sourceRef,
    createdAt: record.createdAt,
  });
}

async update(question: InterviewQuestion): Promise<void> {
  await this.prisma.interviewQuestion.update({
    where: { id: question.id },
    data: {
      status: question.status,
      score: question.score,
    },
  });
}
```

> 필요 import 추가: `QuestionStatusEnum`, `QuestionTypeEnum` from `@/domain/interview/enums`

---

### Phase 4: Application Layer — Ports & Service

#### 4-1. AI Scoring Port 정의

**새 파일: `src/application/interview/ports/ai-scoring.port.ts`**

```typescript
export type ScoringRequest = {
  questionId: string;
  question: string;
  answer: string;
};

export type ScoringFeedback = {
  strengths: string[];      // 잘한 점
  improvements: string[];   // 개선할 점
  recommendations: string[]; // 추천 학습
};

export type ScoringResult = {
  score: number;              // 0-100 범위
  feedback: ScoringFeedback;  // 구조화된 피드백
};

export interface AIScoringPort {
  scoreAnswer(request: ScoringRequest): Promise<ScoringResult>;
}

export const AI_SCORING_PORT: symbol = Symbol("AIScoringPort");
```

> **참고 패턴:** `src/application/interview/ports/ai-question-genrator.port.ts`

#### 4-2. Member Point Update Port 정의 (크로스 도메인 경계)

**새 파일: `src/application/interview/ports/member-point-update.port.ts`**

```typescript
export interface MemberPointUpdate {
  addPoint(memberId: string, point: number): Promise<void>;
}

export const MEMBER_POINT_UPDATE: symbol = Symbol("MemberPointUpdate");
```

> Interview 도메인은 이 포트 인터페이스만 알고, Member 서비스 내부(CQRS, DB 등)는 모름 (헥사고날 원칙). 실제로 MSA 간 HTTP 통신으로 연결됨.

#### 4-3. Ports barrel export 업데이트

**수정: `src/application/interview/ports/index.ts`**

```typescript
export * from "./ai-question-genrator.port";
export * from "./ai-scoring.port";                 // 추가
export * from "./member-point-update.port";         // 추가
export * from "./notification-recipient-finder.port";
export * from "./notification-sender.port";
export * from "./kakao-token-refresher.port";
```

#### 4-4. InterviewAnswerService 구현

**새 파일: `src/application/interview/service/interview-answer.service.ts`**

```typescript
import { Inject, Injectable } from "@nestjs/common";
import {
  INTERVIEW_ANSWER_REPOSITORY,
  InterviewAnswer,
  type InterviewAnswerRepository,
  InterviewQuestionNotFoundException,
} from "@/domain/interview/answer";
import {
  INTERVIEW_QUESTION_REPOSITORY,
  InterviewQuestion,
  type InterviewQuestionRepository,
} from "@/domain/interview/question";
import {
  AI_SCORING_PORT,
  type AIScoringPort,
  MEMBER_POINT_UPDATE,
  type MemberPointUpdate,
  type ScoringResult,
  type ScoringFeedback,
} from "@/application/interview/ports";
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";
import { AnswerTypeEnum } from "@/domain/interview/answer/enums";

@Injectable()
export class InterviewAnswerService {
  constructor(
    @Inject(INTERVIEW_ANSWER_REPOSITORY)
    private readonly interviewAnswerRepository: InterviewAnswerRepository,
    @Inject(INTERVIEW_QUESTION_REPOSITORY)
    private readonly interviewQuestionRepository: InterviewQuestionRepository,
    @Inject(AI_SCORING_PORT)
    private readonly aiScoring: AIScoringPort,
    @Inject(MEMBER_POINT_UPDATE)
    private readonly memberPointUpdate: MemberPointUpdate,
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  async submitAnswer(
    userId: string,
    questionId: string,
    answer: string,
    answerType: AnswerTypeEnum,
    mediaUrl?: string,
  ) {
    // 1. 질문 조회 + 소유권 검증
    const question: InterviewQuestion | null =
      await this.interviewQuestionRepository.findById(questionId);

    if (!question || question.userId !== userId) {
      throw new InterviewQuestionNotFoundException(questionId);
    }

    // 2. 답변 저장 (항상 성공해야 함 — 채점 전 먼저 저장)
    const interviewAnswer: InterviewAnswer = InterviewAnswer.createAnswer({
      questionId,
      answer,
      answerType,
      mediaUrl,
    });
    await this.interviewAnswerRepository.save(interviewAnswer);

    // 3. 첫 번째 답변인 경우에만 채점 프로세스 실행
    let score: number | null = null;
    let feedback: ScoringFeedback | null = null;

    if (question.isFirstAnswer()) {
      const result: { score: number; feedback: ScoringFeedback } =
        await this.handleFirstAnswer(question, answer);
      score = result.score;
      feedback = result.feedback;
    }

    return {
      answerId: interviewAnswer.id,
      score,
      feedback,
    };
  }

  private async handleFirstAnswer(
    question: InterviewQuestion,
    answer: string,
  ): Promise<{ score: number; feedback: ScoringFeedback }> {
    let score: number = 0;
    let feedback: ScoringFeedback = {
      strengths: [],
      improvements: [],
      recommendations: [],
    };

    // 3a. AI 채점 (실패해도 답변은 이미 저장됨)
    try {
      const result: ScoringResult = await this.aiScoring.scoreAnswer({
        questionId: question.id,
        question: question.question,
        answer,
      });

      score = result.score;
      feedback = result.feedback;
    } catch (error) {
      this.logger.error(
        `AI 채점 실패, 점수 0으로 기본 설정`,
        error instanceof Error ? error : undefined,
        { module: "InterviewAnswerService", questionId: question.id },
      );
    }

    // 3b. 질문 상태 ANSWERED + 점수 업데이트
    const updatedQuestion: InterviewQuestion = question.marksAnswered(score);
    await this.interviewQuestionRepository.update(updatedQuestion);

    // 3c. Member 포인트 누적 (크로스 도메인 — HTTP 통신)
    if (score > 0) {
      try {
        await this.memberPointUpdate.addPoint(question.userId, score);
      } catch (error) {
        this.logger.error(
          `회원 포인트 업데이트 실패`,
          error instanceof Error ? error : undefined,
          {
            module: "InterviewAnswerService",
            userId: question.userId,
            score,
          },
        );
        // 포인트 실패해도 답변+점수는 유지 (eventual consistency)
      }
    }

    return { score, feedback };
  }

  async getAnswerByQuestion(questionId: string): Promise<InterviewAnswer[]> {
    return this.interviewAnswerRepository.findByQuestionId(questionId);
  }
}
```

**핵심 설계 포인트:**
- `question.isFirstAnswer()` — 도메인 로직으로 첫 답변 판별 (`status === UNANSWERED`)
- AI 채점 실패 시 → 점수 0으로 저장, 답변은 유지
- Member 서비스 HTTP 통신 실패 시 → 로그만 남기고 답변+점수는 유지 (eventual consistency)
- 답변 저장은 채점 전에 먼저 실행 (데이터 유실 방지)

---

### Phase 5: AI Adapter + Cross-Domain HTTP Bridge

#### 5-1. AI Scoring OpenAI Adapter

**새 파일: `src/adapter/interview/ai/ai-scoring-openai.adapter.ts`**

기존 `OpenaiQuestionGeneratorService`와 동일한 패턴으로 OpenAI API를 직접 호출한다.

```typescript
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OpenAI } from "openai";
import {
  type AIScoringPort,
  type ScoringRequest,
  type ScoringResult,
  type ScoringFeedback,
} from "@/application/interview/ports";

@Injectable()
export class AIScoringOpenaiAdapter implements AIScoringPort {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly logger: Logger = new Logger(AIScoringOpenaiAdapter.name);

  constructor(private readonly configService: ConfigService) {
    this.client = new OpenAI({
      apiKey: this.configService.getOrThrow<string>("OPENAI_API_KEY"),
    });
    this.model = this.configService.getOrThrow<string>("OPENAI_MODEL");
  }

  async scoreAnswer(request: ScoringRequest): Promise<ScoringResult> {
    this.logger.log("AI scoring started", {
      module: "AIScoringOpenaiAdapter",
      questionId: request.questionId,
    });

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: "system",
          content: this.buildSystemPrompt(),
        },
        {
          role: "user",
          content: this.buildUserPrompt(request.question, request.answer),
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const content: string | null = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI returned empty response");
    }

    const parsed = JSON.parse(content) as {
      score: number;
      strengths: string[];
      improvements: string[];
      recommendations: string[];
    };

    this.logger.log("AI scoring completed", {
      module: "AIScoringOpenaiAdapter",
      questionId: request.questionId,
      score: parsed.score,
    });

    const feedback: ScoringFeedback = {
      strengths: parsed.strengths,
      improvements: parsed.improvements,
      recommendations: parsed.recommendations,
    };

    return { score: parsed.score, feedback };
  }

  private buildSystemPrompt(): string {
    return `당신은 10년차 면접관 경력의 면접 채점 전문가입니다.
주어진 면접 질문과 답변을 평가하여 JSON 형식으로 채점 결과를 반환합니다.

채점 기준:
- 질문의 핵심을 정확히 이해했는지
- 논리적이고 구조적으로 답변했는지
- 구체적인 사례나 근거를 제시했는지
- 실무 경험이나 깊이 있는 이해를 보여주는지

부연 설명 없이 다음 JSON 형식으로만 응답하세요:
{
  "score": 0~100 사이의 정수,
  "strengths": ["잘한 점 1", "잘한 점 2"],
  "improvements": ["개선할 점 1", "개선할 점 2"],
  "recommendations": ["추천 학습 주제 1", "추천 학습 주제 2"]
}`.trim();
  }

  private buildUserPrompt(question: string, answer: string): string {
    return `
## 면접 질문
${question}

## 지원자 답변
${answer}

위 질문과 답변을 채점해주세요.`.trim();
  }
}
```

> **참고 패턴:** `src/adapter/interview/ai/openai-question-generator.service.ts` — `new OpenAI({ apiKey })`, `response_format: { type: "json_object" }`, `configService.getOrThrow("OPENAI_MODEL")`

#### 5-2. Member Point Update HTTP Adapter (MSA 통신)

**새 파일: `src/adapter/interview/bridge/member-point-update-http.adapter.ts`**

```typescript
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { MemberPointUpdate } from "@/application/interview/ports";

@Injectable()
export class MemberPointUpdateHttpAdapter implements MemberPointUpdate {
  private readonly baseUrl: string;
  private readonly logger = new Logger(MemberPointUpdateHttpAdapter.name);

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.getOrThrow<string>("MEMBER_SERVICE_URL");
  }

  async addPoint(memberId: string, point: number): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/api/members/${memberId}/point`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ point }),
        signal: AbortSignal.timeout(10_000), // 10초 타임아웃
      },
    );

    if (!response.ok) {
      throw new Error(
        `Member point update failed: ${response.status} ${response.statusText}`,
      );
    }
  }
}
```

> **MSA 아키텍처 핵심:** Interview 서비스(Java MSA)는 `MemberPointUpdate` 포트만 알고, HTTP를 통해 Member 서비스(NestJS)의 API를 호출. 포트/어댑터 경계를 깨끗하게 유지하면서 MSA 간 통신을 수행.

---

### Phase 6: Member 도메인 업데이트 (크로스 도메인)

#### 6-1. Member 도메인 모델에 `addPoint()` 추가

**수정: `src/domain/member/member.ts`**

기존 `changeEmail()` 메서드 아래에 추가:

```typescript
public addPoint(point: number): Member {
  const updatedMember: Member = new Member({
    ...this,
    point: this.point + point,
  });

  updatedMember.domainEvents.push(
    createDomainEvent(this.id, "MemberPointAdded", {
      memberId: updatedMember.id,
      addedPoint: point,
      totalPoint: updatedMember.point,
      occurredAt: new Date(),
    }),
  );

  return updatedMember;
}
```

> **참고 패턴:** `src/domain/member/member.ts:59-85` — `update()` 메서드와 동일한 불변 패턴

#### 6-2. AddMemberPointCommand + Handler

**새 파일: `src/application/member/command/add-member-point.command.ts`**

```typescript
import {
  CommandHandler,
  EventBus,
  ICommand,
  ICommandHandler,
} from "@nestjs/cqrs";
import {
  Member,
  MEMBER_REPOSITORY,
  type MemberRepository,
  MemberUpdateEvent,
} from "@/domain/member";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { EVENT_STORE, type EventStore } from "@/domain/shared";
import { EntityManager, Transactional } from "@mikro-orm/core";
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";

export class AddMemberPointCommand implements ICommand {
  constructor(
    public readonly memberId: string,
    public readonly point: number,
  ) {}
}

@Injectable()
@CommandHandler(AddMemberPointCommand)
export class AddMemberPointCommandHandler
  implements ICommandHandler<AddMemberPointCommand, void>
{
  constructor(
    @Inject(MEMBER_REPOSITORY)
    private readonly memberRepository: MemberRepository,
    @Inject(EVENT_STORE)
    private readonly eventStore: EventStore,
    private readonly eventBus: EventBus,
    private readonly em: EntityManager,
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  @Transactional()
  async execute(command: AddMemberPointCommand): Promise<void> {
    const member = await this.memberRepository.findById(command.memberId);
    if (!member) {
      throw new NotFoundException("회원을 찾을 수 없습니다.");
    }

    const updatedMember: Member = member.addPoint(command.point);

    await this.memberRepository.update(updatedMember);

    for (const event of updatedMember.getDomainEvents()) {
      this.eventStore.append(event);
    }
    await this.em.flush();

    // Read 모델 동기화를 위한 통합 이벤트 발행
    this.eventBus.publish(
      new MemberUpdateEvent(
        updatedMember.id,
        updatedMember.email.value,
        updatedMember.password.value,
        updatedMember.job,
        updatedMember.nickname,
        updatedMember.notification,
        updatedMember.frequency,
        updatedMember.point,
        updatedMember.isPro,
      ),
    );

    updatedMember.clearDomainEvents();
  }
}
```

> **참고 패턴:** `src/application/member/command/member-update.command.ts` — 동일한 CQRS 흐름
> (find → 도메인 로직 → save → eventStore → flush → eventBus → clear)

#### 6-3. Member API 엔드포인트 추가 (Interview → Member HTTP 통신 수신)

**새 파일: `src/adapter/member/api/dto/add-point.dto.ts`**

```typescript
import { IsInt, Min } from "class-validator";

export class AddPointDto {
  @IsInt()
  @Min(1)
  point!: number;
}
```

**수정: `src/adapter/member/api/member.controller.ts`** — 포인트 추가 엔드포인트 추가:

```typescript
// 추가 import
import { Patch, Param } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { AddMemberPointCommand } from "@/application/member/command";
import { AddPointDto } from "@/adapter/member/api/dto/add-point.dto";

// constructor에 CommandBus 주입 추가:
// private readonly commandBus: CommandBus,

@Patch(":id/point")
async addPoint(
  @Param("id") memberId: string,
  @Body() dto: AddPointDto,
) {
  await this.commandBus.execute(
    new AddMemberPointCommand(memberId, dto.point),
  );
  return { success: true };
}
```

> **MSA 수신 엔드포인트:** Interview 서비스가 HTTP로 호출하는 진입점. 내부적으로 CQRS CommandBus에 위임하여 기존 도메인 로직과 Event Sourcing을 그대로 활용.

#### 6-4. Member Command 등록

**수정: `src/application/member/command/index.ts`** — 추가:

```typescript
export * from "./add-member-point.command";
```

**수정: `src/adapter/member/member.handlers.ts`** — `CommandHandlers` 배열에 추가:

```typescript
import { AddMemberPointCommandHandler } from "@/application/member/command";

export const CommandHandlers = [
  // ... 기존 핸들러들
  AddMemberPointCommandHandler,  // 추가
];
```

---

### Phase 7: Controller + Module 조립

#### 7-1. DTO 작성

**새 파일: `src/adapter/interview/api/dto/submit-answer.dto.ts`**

```typescript
import { AnswerTypeEnum } from "@/domain/interview/enums";
import { IsEnum, IsOptional, IsString, IsUUID, MinLength } from "class-validator";

export class SubmitAnswerDto {
  @IsUUID()
  questionId!: string;

  @IsString()
  @MinLength(1)
  answer!: string;

  @IsEnum(AnswerTypeEnum)
  answerType!: AnswerTypeEnum;

  @IsOptional()
  @IsString()
  mediaUrl?: string;
}
```

#### 7-2. Controller 엔드포인트 추가

**수정: `src/adapter/interview/api/interview.controller.ts`**

기존 constructor에 `InterviewAnswerService` 주입 추가, 엔드포인트 2개 추가:

```typescript
// 추가 import
import { Body, Param } from "@nestjs/common";
import { InterviewAnswerService } from "@/application/interview/service/interview-answer.service";
import { SubmitAnswerDto } from "@/adapter/interview/api/dto/submit-answer.dto";

// constructor에 추가:
// private readonly interviewAnswerService: InterviewAnswerService,

@Post("answer")
async submitAnswer(
  @CurrentUser() user: User,
  @Body() dto: SubmitAnswerDto,
) {
  const result = await this.interviewAnswerService.submitAnswer(
    user.memberId,
    dto.questionId,
    dto.answer,
    dto.answerType,
    dto.mediaUrl,
  );
  return result;
}

@Get("question/:questionId/answers")
async getAnswers(
  @CurrentUser() user: User,
  @Param("questionId") questionId: string,
) {
  const answers = await this.interviewAnswerService.getAnswerByQuestion(questionId);
  return {
    answers: answers.map((a) => ({
      id: a.id,
      answer: a.answer,
      answerType: a.answerType,
      mediaUrl: a.mediaUrl,
      createdAt: a.createdAt,
    })),
  };
}
```

#### 7-3. InterviewModule 업데이트

**수정: `src/adapter/interview/interview.module.ts`**

```typescript
// 추가 import
import { InterviewAnswerService } from "@/application/interview/service/interview-answer.service";
import { INTERVIEW_ANSWER_REPOSITORY } from "@/domain/interview/answer";
import { InterviewAnswerPrismaRepository } from "@/adapter/interview/persistence/interview-answer-prisma.repository";
import { AI_SCORING_PORT, MEMBER_POINT_UPDATE } from "@/application/interview/ports";
import { AIScoringOpenaiAdapter } from "@/adapter/interview/ai/ai-scoring-openai.adapter";
import { MemberPointUpdateHttpAdapter } from "@/adapter/interview/bridge/member-point-update-http.adapter";

@Module({
  imports: [OAuthModule],  // CqrsModule 불필요 (HTTP 통신으로 대체)
  controllers: [InterviewController],
  providers: [
    InterviewService,
    InterviewAnswerService,  // 추가
    InterviewNotificationService,
    InterviewQuestionScheduler,
    EmailNotificationSender,
    KakaoNotificationSender,
    {
      provide: INTERVIEW_QUESTION_REPOSITORY,
      useClass: InterviewQuestionPrismaRepository,
    },
    {
      provide: INTERVIEW_ANSWER_REPOSITORY,  // 추가
      useClass: InterviewAnswerPrismaRepository,
    },
    {
      provide: AI_QUESTION_GENERATOR,
      useClass: OpenaiQuestionGeneratorService,
    },
    {
      provide: AI_SCORING_PORT,  // 추가 — OpenAI 직접 호출
      useClass: AIScoringOpenaiAdapter,
    },
    {
      provide: MEMBER_POINT_UPDATE,  // 추가 — HTTP로 Member 서비스 호출
      useClass: MemberPointUpdateHttpAdapter,
    },
    {
      provide: NOTIFICATION_SENDER,
      useFactory: (
        emailSender: EmailNotificationSender,
        kakaoSender: KakaoNotificationSender,
      ) => [emailSender, kakaoSender],
      inject: [EmailNotificationSender, KakaoNotificationSender],
    },
    {
      provide: NOTIFICATION_RECIPIENT_FINDER,
      useClass: NotificationRecipientFinderImpl,
    },
    {
      provide: KAKAO_TOKEN_REFRESHER,
      useClass: KakaoTokenRefresherImpl,
    },
  ],
})
export class InterviewModule {}
```

---

### Phase 8: 환경 설정

**수정: `src/config/env.config.ts`**

```typescript
// envSchema 객체에 추가:
MEMBER_SERVICE_URL: z.string().optional().default("http://localhost:3000"),
```

> **참고:** `OPENAI_API_KEY`와 `OPENAI_MODEL`은 이미 설정되어 있으므로 AI 채점에 재사용. 별도의 `AI_SCORING_SERVICE_URL`, `AI_SCORING_USE_STUB` 환경변수는 불필요.

**.env 파일에 추가:**

```
# Member Service (MSA 간 HTTP 통신)
MEMBER_SERVICE_URL=http://localhost:3000
```

---

## 에러 처리 전략

| 시나리오 | 동작 | HTTP Status |
|---|---|---|
| 질문 미존재 / 타인 질문 | `InterviewQuestionNotFoundException` 발생 | 400 |
| AI 채점 실패 (OpenAI API 오류) | 로그 기록 + score=0으로 저장, 답변 유지 | 200 |
| Member 서비스 HTTP 통신 실패 (타임아웃/5xx) | 로그 기록, 답변+점수는 유지 (eventual consistency) | 200 |
| Member 서비스 HTTP 4xx 응답 | 로그 기록, 답변+점수는 유지 | 200 |
| DTO 유효성 검증 실패 | class-validator ValidationPipe | 400 |
| 동시 첫 답변 (race condition) | `question.isFirstAnswer()` 체크로 방어 | 200 |

---

## 파일 목록 요약

### 새로 생성 (14개)

| 파일 | 계층 | 설명 |
|---|---|---|
| `src/domain/interview/answer/types/interview-answer.type.ts` | Domain | 타입 정의 |
| `src/domain/interview/answer/interview-answer.ts` | Domain | 엔티티 |
| `src/domain/interview/answer/interview-answer.repository.ts` | Domain | Repository 인터페이스 |
| `src/domain/interview/answer/exceptions/interview-question-not-found.exception.ts` | Domain | 예외 |
| `src/domain/interview/answer/exceptions/index.ts` | Domain | Barrel export |
| `src/domain/interview/answer/index.ts` | Domain | Barrel export |
| `src/application/interview/ports/ai-scoring.port.ts` | Application | AI 채점 포트 |
| `src/application/interview/ports/member-point-update.port.ts` | Application | 크로스 도메인 포트 (HTTP) |
| `src/application/interview/service/interview-answer.service.ts` | Application | 서비스 |
| `src/adapter/interview/api/dto/submit-answer.dto.ts` | Adapter | DTO |
| `src/adapter/interview/ai/ai-scoring-openai.adapter.ts` | Adapter | AI OpenAI 어댑터 |
| `src/adapter/interview/persistence/interview-answer-prisma.repository.ts` | Adapter | Prisma Repository |
| `src/adapter/interview/bridge/member-point-update-http.adapter.ts` | Adapter | Member 서비스 HTTP 어댑터 |
| `src/adapter/member/api/dto/add-point.dto.ts` | Adapter (Member) | 포인트 추가 DTO |
| `src/application/member/command/add-member-point.command.ts` | Application (Member) | CQRS Command |

### 수정 (13개)

| 파일 | 변경 내용 |
|---|---|
| `src/domain/interview/question/interview-question.ts` | `of()`, `isFirstAnswer()`, `marksAnswered()` 추가 |
| `src/domain/interview/question/interview-question.repository.ts` | `findById()`, `update()` 추가 |
| `src/domain/interview/indext.ts` | answer barrel export 추가 |
| `src/domain/member/member.ts` | `addPoint()` 메서드 추가 |
| `src/application/interview/ports/index.ts` | 새 포트 export 추가 |
| `src/application/member/command/index.ts` | `AddMemberPointCommand` export 추가 |
| `src/adapter/interview/api/interview.controller.ts` | 답변 제출/조회 엔드포인트 추가 |
| `src/adapter/interview/persistence/interview-question-prisma.repository.ts` | `findById()`, `update()` 추가 |
| `src/adapter/interview/interview.module.ts` | 새 providers 등록 (CqrsModule 불필요) |
| `src/adapter/member/api/member.controller.ts` | `PATCH :id/point` 엔드포인트 추가 |
| `src/adapter/member/member.handlers.ts` | `AddMemberPointCommandHandler` 등록 |
| `prisma/schema.prisma` | `InterviewAnswer` 모델 + 관계 추가, `quesiton_id` 오타 수정 |
| `src/config/env.config.ts` | `MEMBER_SERVICE_URL` 환경변수 추가 |

---

## 검증 방법

### 1. 마이그레이션 + 빌드

```bash
npx prisma migrate dev --name add_interview_answer
npx prisma generate
npm run build
```

### 2. API 테스트

**답변 제출 (첫 번째 — 채점 발생):**

```bash
curl -X POST http://localhost:3000/api/interview/answer \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "questionId": "<question-uuid>",
    "answer": "의존성 주입은 객체 간 결합도를 낮추기 위한 디자인 패턴으로...",
    "answerType": "text"
  }'
# 기대 응답:
# {
#   "answerId": "...",
#   "score": 75,
#   "feedback": {
#     "strengths": ["핵심 개념을 정확히 이해하고 있음"],
#     "improvements": ["구체적인 사례 추가 필요"],
#     "recommendations": ["SOLID 원칙 학습 권장"]
#   }
# }
```

**답변 제출 (두 번째 — 연습, 채점 없음):**

```bash
# 같은 질문에 다시 답변
# 기대 응답: { "answerId": "...", "score": null, "feedback": null }
```

**답변 목록 조회:**

```bash
curl http://localhost:3000/api/interview/question/<question-uuid>/answers \
  -H "Authorization: Bearer <token>"
```

**Member 포인트 추가 API (Member 서비스 직접 호출 검증):**

```bash
curl -X PATCH http://localhost:3000/api/members/<member-uuid>/point \
  -H "Content-Type: application/json" \
  -d '{ "point": 75 }'
# 기대 응답: { "success": true }
```

### 3. DB 검증 (PostgreSQL)

```sql
-- 답변 저장 확인
SELECT * FROM interview_answer WHERE question_id = '<question-uuid>';

-- 질문 상태 + 점수 변경 확인
SELECT id, status, score FROM interview_question WHERE id = '<question-uuid>';

-- 회원 포인트 누적 확인 (Write + Read 모델)
SELECT id, point FROM member WHERE id = '<member-uuid>';
SELECT id, point FROM member_read WHERE id = '<member-uuid>';
```

### 4. 단위 테스트

```bash
npm test
```
