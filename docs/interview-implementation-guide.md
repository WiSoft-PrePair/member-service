# Interview Bounded Context 구현 가이드

> Service 패턴 (CQRS 미적용) | 3개 별도 Aggregate | question_tag: String 자유입력

---

## 목차

1. [파일 구조](#1-파일-구조)
2. [Domain Layer](#2-domain-layer)
3. [Application Layer](#3-application-layer)
4. [Adapter Layer](#4-adapter-layer)
5. [Module 와이어링](#5-module-와이어링)
6. [app.module.ts 등록](#6-appmodulets-등록)
7. [DB Migration](#7-db-migration)

---

## 1. 파일 구조

```
src/
├── domain/interview/
│   ├── interview-question.ts
│   ├── interview-question.repository.ts
│   ├── interview-answer.ts
│   ├── interview-answer.repository.ts
│   ├── interview-feedback.ts
│   ├── interview-feedback.repository.ts
│   ├── index.ts
│   ├── enums/
│   │   ├── question-type.enum.ts
│   │   ├── question-status.enum.ts
│   │   ├── answer-type.enum.ts
│   │   └── index.ts
│   ├── types/
│   │   ├── interview-question.type.ts
│   │   ├── interview-answer.type.ts
│   │   ├── interview-feedback.type.ts
│   │   └── index.ts
│   └── exceptions/
│       ├── question-not-found.exception.ts
│       ├── answer-not-found.exception.ts
│       ├── already-answered.exception.ts
│       └── index.ts
│
├── application/interview/
│   ├── interview.service.ts
│   └── index.ts
│
├── adapter/interview/
│   ├── api/
│   │   ├── interview.controller.ts
│   │   ├── dto/
│   │   │   ├── create-question.dto.ts
│   │   │   ├── submit-answer.dto.ts
│   │   │   ├── provide-feedback.dto.ts
│   │   │   └── index.ts
│   │   └── index.ts
│   ├── persistence/
│   │   ├── mikro-orm/
│   │   │   ├── entity/
│   │   │   │   ├── interview-question.entity.ts
│   │   │   │   ├── interview-answer.entity.ts
│   │   │   │   ├── interview-feedback.entity.ts
│   │   │   │   └── index.ts
│   │   │   ├── mapper/
│   │   │   │   ├── interview-question.mapper.ts
│   │   │   │   ├── interview-answer.mapper.ts
│   │   │   │   ├── interview-feedback.mapper.ts
│   │   │   │   └── index.ts
│   │   │   ├── interview-question.repository-impl.ts
│   │   │   ├── interview-answer.repository-impl.ts
│   │   │   ├── interview-feedback.repository-impl.ts
│   │   │   └── index.ts
│   │   └── index.ts
│   ├── interview.module.ts
│   └── index.ts
```

---

## 2. Domain Layer

### 2.1 Enums

#### `src/domain/interview/enums/question-type.enum.ts`

```typescript
export enum QuestionTypeEnum {
  TEXT = "text",
  VIDEO = "video",
  JOB_POSTING = "job_posting",
}
```

#### `src/domain/interview/enums/question-status.enum.ts`

```typescript
export enum QuestionStatusEnum {
  ANSWERED = "answered",
  UNANSWERED = "unanswered",
}
```

#### `src/domain/interview/enums/answer-type.enum.ts`

```typescript
export enum AnswerTypeEnum {
  TEXT = "text",
  VIDEO = "video",
}
```

#### `src/domain/interview/enums/index.ts`

```typescript
export * from "./question-type.enum";
export * from "./question-status.enum";
export * from "./answer-type.enum";
```

---

### 2.2 Types

#### `src/domain/interview/types/interview-question.type.ts`

```typescript
import { QuestionTypeEnum, QuestionStatusEnum } from "@/domain/interview/enums";

export type InterviewQuestionType = {
  id: string;
  userId: string;
  question: string;
  questionType: QuestionTypeEnum;
  questionTag: string;
  status: QuestionStatusEnum;
  score: number;
  sourceRef: string | null;
  createdAt: Date;
  answeredAt: Date | null;
};

export type CreateQuestionRequest = {
  userId: string;
  question: string;
  questionType: QuestionTypeEnum;
  questionTag: string;
  sourceRef?: string;
};
```

#### `src/domain/interview/types/interview-answer.type.ts`

```typescript
import { AnswerTypeEnum } from "@/domain/interview/enums";

export type InterviewAnswerType = {
  id: string;
  interviewId: string;
  answer: string;
  answerType: AnswerTypeEnum;
  mediaUrl: string | null;
  createdAt: Date;
};

export type SubmitAnswerRequest = {
  interviewId: string;
  answer: string;
  answerType: AnswerTypeEnum;
  mediaUrl?: string;
};
```

#### `src/domain/interview/types/interview-feedback.type.ts`

```typescript
export type InterviewFeedbackType = {
  id: string;
  answerId: string;
  feedback: string;
  createdAt: Date;
};

export type ProvideFeedbackRequest = {
  answerId: string;
  feedback: string;
};
```

#### `src/domain/interview/types/index.ts`

```typescript
export * from "./interview-question.type";
export * from "./interview-answer.type";
export * from "./interview-feedback.type";
```

---

### 2.3 Exceptions

#### `src/domain/interview/exceptions/question-not-found.exception.ts`

```typescript
import { DomainException } from "@/domain/shared";

export class QuestionNotFoundException extends DomainException {
  readonly errorCode = "QUESTION_NOT_FOUND";

  constructor(questionId: string) {
    super(`면접 질문을 찾을 수 없습니다: ${questionId}`);
    this.name = "QuestionNotFoundException";
  }
}
```

#### `src/domain/interview/exceptions/answer-not-found.exception.ts`

```typescript
import { DomainException } from "@/domain/shared";

export class AnswerNotFoundException extends DomainException {
  readonly errorCode = "ANSWER_NOT_FOUND";

  constructor(answerId: string) {
    super(`답변을 찾을 수 없습니다: ${answerId}`);
    this.name = "AnswerNotFoundException";
  }
}
```

#### `src/domain/interview/exceptions/already-answered.exception.ts`

```typescript
import { DomainException } from "@/domain/shared";

export class AlreadyAnsweredException extends DomainException {
  readonly errorCode = "ALREADY_ANSWERED";

  constructor(questionId: string) {
    super(`이미 답변된 질문입니다: ${questionId}`);
    this.name = "AlreadyAnsweredException";
  }
}
```

#### `src/domain/interview/exceptions/index.ts`

```typescript
export * from "./question-not-found.exception";
export * from "./answer-not-found.exception";
export * from "./already-answered.exception";
```

---

### 2.4 Aggregate Roots

#### `src/domain/interview/interview-question.ts`

```typescript
import { randomUUID } from "crypto";
import { QuestionStatusEnum, QuestionTypeEnum } from "./enums";
import {
  CreateQuestionRequest,
  InterviewQuestionType,
} from "./types";

export class InterviewQuestion {
  readonly id: string;
  readonly userId: string;
  readonly question: string;
  readonly questionType: QuestionTypeEnum;
  readonly questionTag: string;
  readonly status: QuestionStatusEnum;
  readonly score: number;
  readonly sourceRef: string | null;
  readonly createdAt: Date;
  readonly answeredAt: Date | null;

  private constructor(data: InterviewQuestionType) {
    Object.assign(this, data);
  }

  public static create(request: CreateQuestionRequest): InterviewQuestion {
    return new InterviewQuestion({
      id: randomUUID(),
      userId: request.userId,
      question: request.question,
      questionType: request.questionType,
      questionTag: request.questionTag,
      status: QuestionStatusEnum.UNANSWERED,
      score: 0,
      sourceRef: request.sourceRef ?? null,
      createdAt: new Date(),
      answeredAt: null,
    });
  }

  public markAsAnswered(): InterviewQuestion {
    return new InterviewQuestion({
      ...this,
      status: QuestionStatusEnum.ANSWERED,
      answeredAt: new Date(),
    });
  }

  public updateScore(score: number): InterviewQuestion {
    return new InterviewQuestion({
      ...this,
      score,
    });
  }

  // DB에서 기존 엔티티 복원 (이미 검증된 데이터)
  public static of(data: InterviewQuestionType): InterviewQuestion {
    return new InterviewQuestion(data);
  }
}
```

#### `src/domain/interview/interview-answer.ts`

```typescript
import { randomUUID } from "crypto";
import { AnswerTypeEnum } from "./enums";
import { InterviewAnswerType, SubmitAnswerRequest } from "./types";

export class InterviewAnswer {
  readonly id: string;
  readonly interviewId: string;
  readonly answer: string;
  readonly answerType: AnswerTypeEnum;
  readonly mediaUrl: string | null;
  readonly createdAt: Date;

  private constructor(data: InterviewAnswerType) {
    Object.assign(this, data);
  }

  public static submit(request: SubmitAnswerRequest): InterviewAnswer {
    return new InterviewAnswer({
      id: randomUUID(),
      interviewId: request.interviewId,
      answer: request.answer,
      answerType: request.answerType,
      mediaUrl: request.mediaUrl ?? null,
      createdAt: new Date(),
    });
  }

  // DB에서 기존 엔티티 복원
  public static of(data: InterviewAnswerType): InterviewAnswer {
    return new InterviewAnswer(data);
  }
}
```

#### `src/domain/interview/interview-feedback.ts`

```typescript
import { randomUUID } from "crypto";
import { InterviewFeedbackType, ProvideFeedbackRequest } from "./types";

export class InterviewFeedback {
  readonly id: string;
  readonly answerId: string;
  readonly feedback: string;
  readonly createdAt: Date;

  private constructor(data: InterviewFeedbackType) {
    Object.assign(this, data);
  }

  public static provide(request: ProvideFeedbackRequest): InterviewFeedback {
    return new InterviewFeedback({
      id: randomUUID(),
      answerId: request.answerId,
      feedback: request.feedback,
      createdAt: new Date(),
    });
  }

  // DB에서 기존 엔티티 복원
  public static of(data: InterviewFeedbackType): InterviewFeedback {
    return new InterviewFeedback(data);
  }
}
```

---

### 2.5 Repository Interfaces

#### `src/domain/interview/interview-question.repository.ts`

```typescript
import { InterviewQuestion } from "./interview-question";

export interface InterviewQuestionRepository {
  save(question: InterviewQuestion): Promise<void>;

  update(question: InterviewQuestion): Promise<void>;

  findById(id: string): Promise<InterviewQuestion | null>;

  findByUserId(userId: string): Promise<InterviewQuestion[]>;

  delete(id: string): Promise<void>;
}

export const INTERVIEW_QUESTION_REPOSITORY = Symbol(
  "InterviewQuestionRepository",
);
```

#### `src/domain/interview/interview-answer.repository.ts`

```typescript
import { InterviewAnswer } from "./interview-answer";

export interface InterviewAnswerRepository {
  save(answer: InterviewAnswer): Promise<void>;

  findById(id: string): Promise<InterviewAnswer | null>;

  findByInterviewId(interviewId: string): Promise<InterviewAnswer[]>;

  delete(id: string): Promise<void>;
}

export const INTERVIEW_ANSWER_REPOSITORY = Symbol(
  "InterviewAnswerRepository",
);
```

#### `src/domain/interview/interview-feedback.repository.ts`

```typescript
import { InterviewFeedback } from "./interview-feedback";

export interface InterviewFeedbackRepository {
  save(feedback: InterviewFeedback): Promise<void>;

  findById(id: string): Promise<InterviewFeedback | null>;

  findByAnswerId(answerId: string): Promise<InterviewFeedback[]>;

  delete(id: string): Promise<void>;
}

export const INTERVIEW_FEEDBACK_REPOSITORY = Symbol(
  "InterviewFeedbackRepository",
);
```

---

### 2.6 Barrel Export

#### `src/domain/interview/index.ts`

```typescript
export * from "./interview-question";
export * from "./interview-question.repository";
export * from "./interview-answer";
export * from "./interview-answer.repository";
export * from "./interview-feedback";
export * from "./interview-feedback.repository";
export * from "./enums";
export * from "./types";
export * from "./exceptions";
```

---

## 3. Application Layer

### `src/application/interview/interview.service.ts`

```typescript
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/core";
import {
  InterviewQuestion,
  INTERVIEW_QUESTION_REPOSITORY,
  type InterviewQuestionRepository,
  InterviewAnswer,
  INTERVIEW_ANSWER_REPOSITORY,
  type InterviewAnswerRepository,
  InterviewFeedback,
  INTERVIEW_FEEDBACK_REPOSITORY,
  type InterviewFeedbackRepository,
} from "@/domain/interview";
import type { CreateQuestionRequest, SubmitAnswerRequest, ProvideFeedbackRequest } from "@/domain/interview";
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";

@Injectable()
export class InterviewService {
  constructor(
    @Inject(INTERVIEW_QUESTION_REPOSITORY)
    private readonly questionRepository: InterviewQuestionRepository,
    @Inject(INTERVIEW_ANSWER_REPOSITORY)
    private readonly answerRepository: InterviewAnswerRepository,
    @Inject(INTERVIEW_FEEDBACK_REPOSITORY)
    private readonly feedbackRepository: InterviewFeedbackRepository,
    private readonly em: EntityManager,
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  // ─── Question ────────────────────────────────────────

  async createQuestion(request: CreateQuestionRequest): Promise<InterviewQuestion> {
    const question = InterviewQuestion.create(request);

    await this.questionRepository.save(question);
    await this.em.flush();

    this.logger.log("Interview question created", {
      module: "InterviewService",
      questionId: question.id,
      userId: question.userId,
    });

    return question;
  }

  async getQuestion(questionId: string): Promise<InterviewQuestion> {
    const question = await this.questionRepository.findById(questionId);

    if (!question) {
      throw new NotFoundException(`면접 질문을 찾을 수 없습니다: ${questionId}`);
    }

    return question;
  }

  async getQuestionsByUser(userId: string): Promise<InterviewQuestion[]> {
    return this.questionRepository.findByUserId(userId);
  }

  async deleteQuestion(questionId: string, userId: string): Promise<void> {
    const question = await this.questionRepository.findById(questionId);

    if (!question) {
      throw new NotFoundException(`면접 질문을 찾을 수 없습니다: ${questionId}`);
    }

    if (question.userId !== userId) {
      throw new NotFoundException(`면접 질문을 찾을 수 없습니다: ${questionId}`);
    }

    await this.questionRepository.delete(questionId);
    await this.em.flush();
  }

  // ─── Answer ──────────────────────────────────────────

  async submitAnswer(request: SubmitAnswerRequest): Promise<InterviewAnswer> {
    // 질문 존재 여부 확인
    const question = await this.questionRepository.findById(request.interviewId);

    if (!question) {
      throw new NotFoundException(
        `면접 질문을 찾을 수 없습니다: ${request.interviewId}`,
      );
    }

    // 답변 생성
    const answer = InterviewAnswer.submit(request);
    await this.answerRepository.save(answer);

    // 질문 상태를 ANSWERED로 변경
    const updatedQuestion = question.markAsAnswered();
    await this.questionRepository.update(updatedQuestion);

    await this.em.flush();

    this.logger.log("Interview answer submitted", {
      module: "InterviewService",
      answerId: answer.id,
      questionId: request.interviewId,
    });

    return answer;
  }

  async getAnswersByQuestion(
    interviewId: string,
  ): Promise<InterviewAnswer[]> {
    return this.answerRepository.findByInterviewId(interviewId);
  }

  // ─── Feedback ────────────────────────────────────────

  async provideFeedback(
    request: ProvideFeedbackRequest,
  ): Promise<InterviewFeedback> {
    // 답변 존재 여부 확인
    const answer = await this.answerRepository.findById(request.answerId);

    if (!answer) {
      throw new NotFoundException(
        `답변을 찾을 수 없습니다: ${request.answerId}`,
      );
    }

    // 피드백 생성
    const feedback = InterviewFeedback.provide(request);
    await this.feedbackRepository.save(feedback);

    await this.em.flush();

    this.logger.log("Interview feedback provided", {
      module: "InterviewService",
      feedbackId: feedback.id,
      answerId: request.answerId,
    });

    return feedback;
  }

  async getFeedbackByAnswer(
    answerId: string,
  ): Promise<InterviewFeedback[]> {
    return this.feedbackRepository.findByAnswerId(answerId);
  }

  // ─── Score ───────────────────────────────────────────

  async updateQuestionScore(
    questionId: string,
    score: number,
  ): Promise<InterviewQuestion> {
    const question = await this.questionRepository.findById(questionId);

    if (!question) {
      throw new NotFoundException(
        `면접 질문을 찾을 수 없습니다: ${questionId}`,
      );
    }

    const updatedQuestion = question.updateScore(score);
    await this.questionRepository.update(updatedQuestion);
    await this.em.flush();

    return updatedQuestion;
  }
}
```

### `src/application/interview/index.ts`

```typescript
export * from "./interview.service";
```

---

## 4. Adapter Layer

### 4.1 DTOs

#### `src/adapter/interview/api/dto/create-question.dto.ts`

```typescript
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from "class-validator";
import { QuestionTypeEnum } from "@/domain/interview";

export class CreateQuestionDto {
  @IsString()
  @IsNotEmpty()
  question!: string;

  @IsEnum(QuestionTypeEnum)
  questionType!: QuestionTypeEnum;

  @IsString()
  @IsNotEmpty()
  questionTag!: string;

  @IsString()
  @IsOptional()
  sourceRef?: string;
}
```

#### `src/adapter/interview/api/dto/submit-answer.dto.ts`

```typescript
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from "class-validator";
import { AnswerTypeEnum } from "@/domain/interview";

export class SubmitAnswerDto {
  @IsUUID()
  @IsNotEmpty()
  interviewId!: string;

  @IsString()
  @IsNotEmpty()
  answer!: string;

  @IsEnum(AnswerTypeEnum)
  answerType!: AnswerTypeEnum;

  @IsString()
  @IsOptional()
  mediaUrl?: string;
}
```

#### `src/adapter/interview/api/dto/provide-feedback.dto.ts`

```typescript
import { IsNotEmpty, IsString, IsUUID } from "class-validator";

export class ProvideFeedbackDto {
  @IsUUID()
  @IsNotEmpty()
  answerId!: string;

  @IsString()
  @IsNotEmpty()
  feedback!: string;
}
```

#### `src/adapter/interview/api/dto/index.ts`

```typescript
export * from "./create-question.dto";
export * from "./submit-answer.dto";
export * from "./provide-feedback.dto";
```

---

### 4.2 Controller

#### `src/adapter/interview/api/interview.controller.ts`

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { InterviewService } from "@/application/interview";
import {
  CreateQuestionDto,
  SubmitAnswerDto,
  ProvideFeedbackDto,
} from "@/adapter/interview/api/dto";
import { CurrentUser } from "@/adapter/shared/api/decorators/current-user.decorator";
import { type User } from "@/adapter/shared/api/types/user";

@Controller("api/interviews")
export class InterviewController {
  constructor(private readonly interviewService: InterviewService) {}

  // ─── Question ────────────────────────────────────────

  @Post("questions")
  async createQuestion(
    @CurrentUser() user: User,
    @Body() dto: CreateQuestionDto,
  ) {
    const question = await this.interviewService.createQuestion({
      userId: user.memberId,
      question: dto.question,
      questionType: dto.questionType,
      questionTag: dto.questionTag,
      sourceRef: dto.sourceRef,
    });

    return { id: question.id };
  }

  @Get("questions")
  async getMyQuestions(@CurrentUser() user: User) {
    return this.interviewService.getQuestionsByUser(user.memberId);
  }

  @Get("questions/:id")
  async getQuestion(@Param("id") id: string) {
    return this.interviewService.getQuestion(id);
  }

  @Delete("questions/:id")
  async deleteQuestion(
    @CurrentUser() user: User,
    @Param("id") id: string,
  ) {
    await this.interviewService.deleteQuestion(id, user.memberId);
    return { success: true };
  }

  // ─── Answer ──────────────────────────────────────────

  @Post("answers")
  async submitAnswer(@Body() dto: SubmitAnswerDto) {
    const answer = await this.interviewService.submitAnswer({
      interviewId: dto.interviewId,
      answer: dto.answer,
      answerType: dto.answerType,
      mediaUrl: dto.mediaUrl,
    });

    return { id: answer.id };
  }

  @Get("questions/:id/answers")
  async getAnswersByQuestion(@Param("id") interviewId: string) {
    return this.interviewService.getAnswersByQuestion(interviewId);
  }

  // ─── Feedback ────────────────────────────────────────

  @Post("feedback")
  async provideFeedback(@Body() dto: ProvideFeedbackDto) {
    const feedback = await this.interviewService.provideFeedback({
      answerId: dto.answerId,
      feedback: dto.feedback,
    });

    return { id: feedback.id };
  }

  @Get("answers/:id/feedback")
  async getFeedbackByAnswer(@Param("id") answerId: string) {
    return this.interviewService.getFeedbackByAnswer(answerId);
  }

  // ─── Score ───────────────────────────────────────────

  @Patch("questions/:id/score")
  async updateScore(
    @Param("id") questionId: string,
    @Body("score") score: number,
  ) {
    const question = await this.interviewService.updateQuestionScore(
      questionId,
      score,
    );

    return { id: question.id, score: question.score };
  }
}
```

#### `src/adapter/interview/api/index.ts`

```typescript
export * from "./interview.controller";
```

---

### 4.3 Persistence - MikroORM Entities

#### `src/adapter/interview/persistence/mikro-orm/entity/interview-question.entity.ts`

```typescript
import { Entity, Enum, PrimaryKey, Property } from "@mikro-orm/core";
import {
  QuestionTypeEnum,
  QuestionStatusEnum,
} from "@/domain/interview";

@Entity({ tableName: "interview_question" })
export class InterviewQuestionEntity {
  @PrimaryKey({ type: "uuid" })
  id!: string;

  @Property({ type: "uuid" })
  userId!: string;

  @Property({ type: "text" })
  question!: string;

  @Enum(() => QuestionTypeEnum)
  questionType!: QuestionTypeEnum;

  @Property()
  questionTag!: string;

  @Enum(() => QuestionStatusEnum)
  status!: QuestionStatusEnum;

  @Property({ default: 0 })
  score!: number;

  @Property({ type: "text", nullable: true })
  sourceRef!: string | null;

  @Property()
  createdAt!: Date;

  @Property({ nullable: true })
  answeredAt!: Date | null;
}
```

#### `src/adapter/interview/persistence/mikro-orm/entity/interview-answer.entity.ts`

```typescript
import { Entity, Enum, PrimaryKey, Property } from "@mikro-orm/core";
import { AnswerTypeEnum } from "@/domain/interview";

@Entity({ tableName: "interview_answer" })
export class InterviewAnswerEntity {
  @PrimaryKey({ type: "uuid" })
  id!: string;

  @Property({ type: "uuid" })
  interviewId!: string;

  @Property({ type: "text" })
  answer!: string;

  @Enum(() => AnswerTypeEnum)
  answerType!: AnswerTypeEnum;

  @Property({ type: "text", nullable: true })
  mediaUrl!: string | null;

  @Property()
  createdAt!: Date;
}
```

#### `src/adapter/interview/persistence/mikro-orm/entity/interview-feedback.entity.ts`

```typescript
import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

@Entity({ tableName: "interview_feedback" })
export class InterviewFeedbackEntity {
  @PrimaryKey({ type: "uuid" })
  id!: string;

  @Property({ type: "uuid" })
  answerId!: string;

  @Property({ type: "text" })
  feedback!: string;

  @Property()
  createdAt!: Date;
}
```

#### `src/adapter/interview/persistence/mikro-orm/entity/index.ts`

```typescript
export * from "./interview-question.entity";
export * from "./interview-answer.entity";
export * from "./interview-feedback.entity";
```

---

### 4.4 Persistence - Mappers

#### `src/adapter/interview/persistence/mikro-orm/mapper/interview-question.mapper.ts`

```typescript
import { Injectable } from "@nestjs/common";
import { InterviewQuestion } from "@/domain/interview";
import { InterviewQuestionEntity } from "@/adapter/interview/persistence/mikro-orm/entity";

@Injectable()
export class InterviewQuestionMapper {
  toDomain(entity: InterviewQuestionEntity): InterviewQuestion {
    return InterviewQuestion.of({
      id: entity.id,
      userId: entity.userId,
      question: entity.question,
      questionType: entity.questionType,
      questionTag: entity.questionTag,
      status: entity.status,
      score: entity.score,
      sourceRef: entity.sourceRef,
      createdAt: entity.createdAt,
      answeredAt: entity.answeredAt,
    });
  }

  toEntity(domain: InterviewQuestion): InterviewQuestionEntity {
    const entity = new InterviewQuestionEntity();

    entity.id = domain.id;
    entity.userId = domain.userId;
    entity.question = domain.question;
    entity.questionType = domain.questionType;
    entity.questionTag = domain.questionTag;
    entity.status = domain.status;
    entity.score = domain.score;
    entity.sourceRef = domain.sourceRef;
    entity.createdAt = domain.createdAt;
    entity.answeredAt = domain.answeredAt;

    return entity;
  }
}
```

#### `src/adapter/interview/persistence/mikro-orm/mapper/interview-answer.mapper.ts`

```typescript
import { Injectable } from "@nestjs/common";
import { InterviewAnswer } from "@/domain/interview";
import { InterviewAnswerEntity } from "@/adapter/interview/persistence/mikro-orm/entity";

@Injectable()
export class InterviewAnswerMapper {
  toDomain(entity: InterviewAnswerEntity): InterviewAnswer {
    return InterviewAnswer.of({
      id: entity.id,
      interviewId: entity.interviewId,
      answer: entity.answer,
      answerType: entity.answerType,
      mediaUrl: entity.mediaUrl,
      createdAt: entity.createdAt,
    });
  }

  toEntity(domain: InterviewAnswer): InterviewAnswerEntity {
    const entity = new InterviewAnswerEntity();

    entity.id = domain.id;
    entity.interviewId = domain.interviewId;
    entity.answer = domain.answer;
    entity.answerType = domain.answerType;
    entity.mediaUrl = domain.mediaUrl;
    entity.createdAt = domain.createdAt;

    return entity;
  }
}
```

#### `src/adapter/interview/persistence/mikro-orm/mapper/interview-feedback.mapper.ts`

```typescript
import { Injectable } from "@nestjs/common";
import { InterviewFeedback } from "@/domain/interview";
import { InterviewFeedbackEntity } from "@/adapter/interview/persistence/mikro-orm/entity";

@Injectable()
export class InterviewFeedbackMapper {
  toDomain(entity: InterviewFeedbackEntity): InterviewFeedback {
    return InterviewFeedback.of({
      id: entity.id,
      answerId: entity.answerId,
      feedback: entity.feedback,
      createdAt: entity.createdAt,
    });
  }

  toEntity(domain: InterviewFeedback): InterviewFeedbackEntity {
    const entity = new InterviewFeedbackEntity();

    entity.id = domain.id;
    entity.answerId = domain.answerId;
    entity.feedback = domain.feedback;
    entity.createdAt = domain.createdAt;

    return entity;
  }
}
```

#### `src/adapter/interview/persistence/mikro-orm/mapper/index.ts`

```typescript
export * from "./interview-question.mapper";
export * from "./interview-answer.mapper";
export * from "./interview-feedback.mapper";
```

---

### 4.5 Persistence - Repository Implementations

#### `src/adapter/interview/persistence/mikro-orm/interview-question.repository-impl.ts`

```typescript
import { Injectable } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import {
  InterviewQuestion,
  type InterviewQuestionRepository,
} from "@/domain/interview";
import { InterviewQuestionEntity } from "./entity";
import { InterviewQuestionMapper } from "./mapper";

@Injectable()
export class InterviewQuestionRepositoryImpl
  implements InterviewQuestionRepository
{
  constructor(
    private readonly em: EntityManager,
    private readonly mapper: InterviewQuestionMapper,
  ) {}

  async save(question: InterviewQuestion): Promise<void> {
    const entity = this.mapper.toEntity(question);
    this.em.persist(entity);
  }

  async update(question: InterviewQuestion): Promise<void> {
    const reference = this.em.getReference(
      InterviewQuestionEntity,
      question.id,
    );
    this.em.assign(reference, this.mapper.toEntity(question));
  }

  async findById(id: string): Promise<InterviewQuestion | null> {
    const entity = await this.em.findOne(InterviewQuestionEntity, { id });

    if (!entity) {
      return null;
    }

    return this.mapper.toDomain(entity);
  }

  async findByUserId(userId: string): Promise<InterviewQuestion[]> {
    const entities = await this.em.find(
      InterviewQuestionEntity,
      { userId },
      { orderBy: { createdAt: "DESC" } },
    );

    return entities.map((entity) => this.mapper.toDomain(entity));
  }

  async delete(id: string): Promise<void> {
    await this.em.nativeDelete(InterviewQuestionEntity, { id });
  }
}
```

#### `src/adapter/interview/persistence/mikro-orm/interview-answer.repository-impl.ts`

```typescript
import { Injectable } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import {
  InterviewAnswer,
  type InterviewAnswerRepository,
} from "@/domain/interview";
import { InterviewAnswerEntity } from "./entity";
import { InterviewAnswerMapper } from "./mapper";

@Injectable()
export class InterviewAnswerRepositoryImpl
  implements InterviewAnswerRepository
{
  constructor(
    private readonly em: EntityManager,
    private readonly mapper: InterviewAnswerMapper,
  ) {}

  async save(answer: InterviewAnswer): Promise<void> {
    const entity = this.mapper.toEntity(answer);
    this.em.persist(entity);
  }

  async findById(id: string): Promise<InterviewAnswer | null> {
    const entity = await this.em.findOne(InterviewAnswerEntity, { id });

    if (!entity) {
      return null;
    }

    return this.mapper.toDomain(entity);
  }

  async findByInterviewId(
    interviewId: string,
  ): Promise<InterviewAnswer[]> {
    const entities = await this.em.find(
      InterviewAnswerEntity,
      { interviewId },
      { orderBy: { createdAt: "ASC" } },
    );

    return entities.map((entity) => this.mapper.toDomain(entity));
  }

  async delete(id: string): Promise<void> {
    await this.em.nativeDelete(InterviewAnswerEntity, { id });
  }
}
```

#### `src/adapter/interview/persistence/mikro-orm/interview-feedback.repository-impl.ts`

```typescript
import { Injectable } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import {
  InterviewFeedback,
  type InterviewFeedbackRepository,
} from "@/domain/interview";
import { InterviewFeedbackEntity } from "./entity";
import { InterviewFeedbackMapper } from "./mapper";

@Injectable()
export class InterviewFeedbackRepositoryImpl
  implements InterviewFeedbackRepository
{
  constructor(
    private readonly em: EntityManager,
    private readonly mapper: InterviewFeedbackMapper,
  ) {}

  async save(feedback: InterviewFeedback): Promise<void> {
    const entity = this.mapper.toEntity(feedback);
    this.em.persist(entity);
  }

  async findById(id: string): Promise<InterviewFeedback | null> {
    const entity = await this.em.findOne(InterviewFeedbackEntity, { id });

    if (!entity) {
      return null;
    }

    return this.mapper.toDomain(entity);
  }

  async findByAnswerId(
    answerId: string,
  ): Promise<InterviewFeedback[]> {
    const entities = await this.em.find(
      InterviewFeedbackEntity,
      { answerId },
      { orderBy: { createdAt: "ASC" } },
    );

    return entities.map((entity) => this.mapper.toDomain(entity));
  }

  async delete(id: string): Promise<void> {
    await this.em.nativeDelete(InterviewFeedbackEntity, { id });
  }
}
```

#### `src/adapter/interview/persistence/mikro-orm/index.ts`

```typescript
export * from "./entity";
export * from "./mapper";
export * from "./interview-question.repository-impl";
export * from "./interview-answer.repository-impl";
export * from "./interview-feedback.repository-impl";
```

#### `src/adapter/interview/persistence/index.ts`

```typescript
export * from "./mikro-orm";
```

---

### 4.6 Adapter Barrel Export

#### `src/adapter/interview/index.ts`

```typescript
export * from "./interview.module";
```

---

## 5. Module 와이어링

#### `src/adapter/interview/interview.module.ts`

```typescript
import { Module } from "@nestjs/common";
import { InterviewController } from "@/adapter/interview/api";
import {
  InterviewQuestionMapper,
  InterviewAnswerMapper,
  InterviewFeedbackMapper,
  InterviewQuestionRepositoryImpl,
  InterviewAnswerRepositoryImpl,
  InterviewFeedbackRepositoryImpl,
} from "@/adapter/interview/persistence";
import {
  INTERVIEW_QUESTION_REPOSITORY,
  INTERVIEW_ANSWER_REPOSITORY,
  INTERVIEW_FEEDBACK_REPOSITORY,
} from "@/domain/interview";
import { InterviewService } from "@/application/interview";

@Module({
  controllers: [InterviewController],
  providers: [
    InterviewService,
    InterviewQuestionMapper,
    InterviewAnswerMapper,
    InterviewFeedbackMapper,
    {
      provide: INTERVIEW_QUESTION_REPOSITORY,
      useClass: InterviewQuestionRepositoryImpl,
    },
    {
      provide: INTERVIEW_ANSWER_REPOSITORY,
      useClass: InterviewAnswerRepositoryImpl,
    },
    {
      provide: INTERVIEW_FEEDBACK_REPOSITORY,
      useClass: InterviewFeedbackRepositoryImpl,
    },
  ],
  exports: [
    INTERVIEW_QUESTION_REPOSITORY,
    INTERVIEW_ANSWER_REPOSITORY,
    INTERVIEW_FEEDBACK_REPOSITORY,
  ],
})
export class InterviewModule {}
```

---

## 6. app.module.ts 등록

기존 `src/app.module.ts`의 `imports` 배열에 추가:

```typescript
import { InterviewModule } from "@/adapter/interview";

@Module({
  imports: [
    // ... 기존 모듈들
    InterviewModule,
  ],
})
export class AppModule {}
```

MikroORM 설정 파일(`mikro-orm.config.ts` 또는 `app.module.ts` 내 설정)의 entities 배열에 추가:

```typescript
import { InterviewQuestionEntity } from "@/adapter/interview/persistence/mikro-orm/entity";
import { InterviewAnswerEntity } from "@/adapter/interview/persistence/mikro-orm/entity";
import { InterviewFeedbackEntity } from "@/adapter/interview/persistence/mikro-orm/entity";

// entities 배열에 추가
entities: [
  // ... 기존 엔티티들
  InterviewQuestionEntity,
  InterviewAnswerEntity,
  InterviewFeedbackEntity,
],
```

---

## 7. DB Migration

마이그레이션 생성 후 아래 SQL이 생성되어야 함:

```sql
CREATE TABLE "interview_question" (
  "id"            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"       UUID          NOT NULL,
  "question"      TEXT          NOT NULL,
  "question_type" VARCHAR(255)  NOT NULL,
  "question_tag"  VARCHAR(255)  NOT NULL,
  "status"        VARCHAR(255)  NOT NULL DEFAULT 'unanswered',
  "score"         INT           NOT NULL DEFAULT 0,
  "source_ref"    TEXT,
  "created_at"    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  "answered_at"   TIMESTAMPTZ
);

CREATE TABLE "interview_answer" (
  "id"            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  "interview_id"  UUID          NOT NULL REFERENCES "interview_question"("id"),
  "answer"        TEXT          NOT NULL,
  "answer_type"   VARCHAR(255)  NOT NULL,
  "media_url"     TEXT,
  "created_at"    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE "interview_feedback" (
  "id"            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  "answer_id"     UUID          NOT NULL REFERENCES "interview_answer"("id"),
  "feedback"      TEXT          NOT NULL,
  "created_at"    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX "idx_interview_question_user_id" ON "interview_question" ("user_id");
CREATE INDEX "idx_interview_answer_interview_id" ON "interview_answer" ("interview_id");
CREATE INDEX "idx_interview_feedback_answer_id" ON "interview_feedback" ("answer_id");
```

마이그레이션 명령어:

```bash
npx mikro-orm migration:create
npx mikro-orm migration:up
```

---

## API Endpoints 요약

| Method | Path | Auth | 설명 |
|--------|------|------|------|
| `POST` | `/api/interviews/questions` | Required | 면접 질문 생성 |
| `GET` | `/api/interviews/questions` | Required | 내 질문 목록 조회 |
| `GET` | `/api/interviews/questions/:id` | Required | 질문 상세 조회 |
| `DELETE` | `/api/interviews/questions/:id` | Required | 질문 삭제 |
| `POST` | `/api/interviews/answers` | Required | 답변 제출 |
| `GET` | `/api/interviews/questions/:id/answers` | Required | 질문별 답변 목록 |
| `POST` | `/api/interviews/feedback` | Required | 피드백 제공 |
| `GET` | `/api/interviews/answers/:id/feedback` | Required | 답변별 피드백 목록 |
| `PATCH` | `/api/interviews/questions/:id/score` | Required | 점수 업데이트 |
