# AI 화상 면접 시뮬레이션 - 상세 구현 가이드

## Context

기존 텍스트 기반 면접 기능을 확장하여 **영상 기반 면접 시뮬레이션**을 구현한다.
사용자가 1~10개의 질문으로 화상 면접을 시작하면, 질문이 SSE로 비동기 전달되고,
각 질문에 대해 영상을 촬영/업로드하면 백엔드에서 AI 분석(표정 + 답변 내용 + 종합)을 수행하여 3종 피드백을 제공한다.

### 핵심 설계 결정

| 항목 | 결정 |
|------|------|
| 표정 분석 | GPT-4o Vision (프레임별 프롬프트) |
| STT | OpenAI Whisper API |
| 처리 상태 전달 | 비동기 처리 후 별도 GET 조회 |
| 메시지 큐 | 인프로세스 비동기 (Promise 기반, Redis/BullMQ 미사용) |
| 질문 전달 | SSE 스트리밍 |
| 영상 저장 | AWS S3 |
| ORM | Prisma (기존 인터뷰 컨텍스트 패턴 유지) |
| 아키텍처 패턴 | Service 패턴 (기존 인터뷰와 동일, CQRS 미사용) |

---

## 1단계: 인프라 기반 구성

### 1.1 의존성 설치

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner fluent-ffmpeg
npm install -D @types/fluent-ffmpeg @types/multer
```

> FFmpeg 시스템 설치: macOS `brew install ffmpeg`, Docker `apk add --no-cache ffmpeg`

### 1.2 환경 변수 추가

**파일: `src/config/env.config.ts`**

```typescript
import { z } from "zod";

export const envSchema = z.object({
  // ... 기존 필드 유지

  // AWS S3 (추가)
  AWS_REGION: z.string(),
  AWS_ACCESS_KEY_ID: z.string(),
  AWS_SECRET_ACCESS_KEY: z.string(),
  S3_BUCKET_NAME: z.string(),
});

export type Env = z.infer<typeof envSchema>;
```

### 1.3 Dockerfile FFmpeg 추가

```dockerfile
# builder stage와 production stage 모두에 추가
RUN apk add --no-cache ffmpeg
```

---

## 2단계: 도메인 모델

### 2.1 VideoInterview 도메인 엔티티

**파일: `src/domain/interview/video-interview/enums/video-interview-status.enum.ts`**

```typescript
export enum VideoInterviewStatusEnum {
  GENERATING = "generating",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
}
```

**파일: `src/domain/interview/video-interview/enums/index.ts`**

```typescript
export * from "./video-interview-status.enum";
```

**파일: `src/domain/interview/video-interview/types/video-interview.type.ts`**

```typescript
import { VideoInterviewStatusEnum } from "@/domain/interview/video-interview/enums";

export type VideoInterviewType = {
  id: string;
  userId: string;
  questionCount: number;
  status: VideoInterviewStatusEnum;
  createdAt: Date;
  completedAt: Date | null;
};

export type CreateVideoInterviewRequest = {
  userId: string;
  questionCount: number;
};
```

**파일: `src/domain/interview/video-interview/types/index.ts`**

```typescript
export * from "./video-interview.type";
```

**파일: `src/domain/interview/video-interview/exceptions/video-interview-not-found.exception.ts`**

```typescript
import { DomainException } from "@/domain/shared/exception/domain.exception";

export class VideoInterviewNotFoundException extends DomainException {
  readonly errorCode = "VIDEO_INTERVIEW_NOT_FOUND";

  constructor(videoInterviewId: string) {
    super(`화상 면접을 찾을 수 없습니다: ${videoInterviewId}`);
    this.name = "VideoInterviewNotFoundException";
  }
}
```

**파일: `src/domain/interview/video-interview/exceptions/index.ts`**

```typescript
export * from "./video-interview-not-found.exception";
```

**파일: `src/domain/interview/video-interview/video-interview.ts`**

```typescript
import { VideoInterviewStatusEnum } from "@/domain/interview/video-interview/enums";
import {
  CreateVideoInterviewRequest,
  VideoInterviewType,
} from "@/domain/interview/video-interview/types";
import { randomUUID } from "crypto";

export class VideoInterview {
  readonly id: string;
  readonly userId: string;
  readonly questionCount: number;
  readonly status: VideoInterviewStatusEnum;
  readonly createdAt: Date;
  readonly completedAt: Date | null;

  private constructor(data: VideoInterviewType) {
    Object.assign(this, data);
  }

  public static create(request: CreateVideoInterviewRequest): VideoInterview {
    return new VideoInterview({
      id: randomUUID(),
      userId: request.userId,
      questionCount: request.questionCount,
      status: VideoInterviewStatusEnum.GENERATING,
      createdAt: new Date(),
      completedAt: null,
    });
  }

  public markQuestionsReady(): VideoInterview {
    return new VideoInterview({
      ...this,
      status: VideoInterviewStatusEnum.IN_PROGRESS,
    });
  }

  public markCompleted(): VideoInterview {
    return new VideoInterview({
      ...this,
      status: VideoInterviewStatusEnum.COMPLETED,
      completedAt: new Date(),
    });
  }

  public static of(data: VideoInterviewType): VideoInterview {
    return new VideoInterview(data);
  }
}
```

**파일: `src/domain/interview/video-interview/video-interview.repository.ts`**

```typescript
import { VideoInterview } from "@/domain/interview/video-interview/interview-session";

export interface VideoInterviewRepository {
  save(session: VideoInterview): Promise<void>;
  findById(id: string): Promise<VideoInterview | null>;
  findByUserId(userId: string): Promise<VideoInterview[]>;
  update(session: VideoInterview): Promise<void>;
}

export const VIDEO_INTERVIEW_REPOSITORY: symbol = Symbol(
  "VideoInterviewRepository",
);
```

**파일: `src/domain/interview/video-interview/index.ts`**

```typescript
export * from "./interview-session";
export * from "./video-interview.repository";
export * from "./enums";
export * from "./types";
export * from "./exceptions";
```

### 2.2 FeedbackType 열거형

**파일: `src/domain/interview/feedback/enums/feedback-type.enum.ts`**

```typescript
export enum FeedbackTypeEnum {
  CONTENT = "content",
  EXPRESSION = "expression",
  OVERALL = "overall",
}
```

**파일: `src/domain/interview/feedback/enums/index.ts`**

```typescript
export * from "./feedback-type.enum";
```

### 2.3 기존 InterviewQuestion 확장

**파일: `src/domain/interview/question/types/interview-type.ts` (수정)**

```typescript
import {
  QuestionStatusEnum,
  QuestionTypeEnum,
} from "@/domain/interview/question/enums";

export type InterviewQuestionType = {
  id: string;
  userId: string;
  videoInterviewId: string | null;          // 추가
  question: string;
  questionType: QuestionTypeEnum;
  questionTag: string;
  status: QuestionStatusEnum;
  score: number;
  sourceRef: string | null;
  createdAt: Date;
};

export type CreateQuestionRequest = {
  userId: string;
  videoInterviewId?: string;                // 추가
  question: string;
  questionType: QuestionTypeEnum;
  questionTag: string;
  sourceRef?: string;
};
```

**파일: `src/domain/interview/question/interview-question.ts` (수정)**

```typescript
import {
  QuestionStatusEnum,
  QuestionTypeEnum,
} from "@/domain/interview/question/enums";
import {
  CreateQuestionRequest,
  InterviewQuestionType,
} from "@/domain/interview/question/types";
import { randomUUID } from "crypto";

export class InterviewQuestion {
  readonly id: string;
  readonly userId: string;
  readonly videoInterviewId: string | null;   // 추가
  readonly question: string;
  readonly questionType: QuestionTypeEnum;
  readonly questionTag: string;
  readonly status: QuestionStatusEnum;
  readonly score: number;
  readonly sourceRef: string | null;
  readonly createdAt: Date;

  private constructor(interviewQuestionType: InterviewQuestionType) {
    Object.assign(this, interviewQuestionType);
  }

  public static createQuestion(
    request: CreateQuestionRequest,
  ): InterviewQuestion {
    return new InterviewQuestion({
      id: randomUUID(),
      userId: request.userId,
      videoInterviewId: request.videoInterviewId ?? null,   // 추가
      question: request.question,
      questionType: request.questionType,
      questionTag: request.questionTag,
      status: QuestionStatusEnum.UNANSWERED,
      score: 0,
      sourceRef: request.sourceRef ?? null,
      createdAt: new Date(),
    });
  }

  public isFirstAnswer(): boolean {
    return this.status === QuestionStatusEnum.UNANSWERED;
  }

  public marksAnswered(score: number): InterviewQuestion {
    return new InterviewQuestion({
      ...this,
      status: QuestionStatusEnum.ANSWERED,
      score,
    });
  }

  public updateScore(score: number): InterviewQuestion {
    return new InterviewQuestion({
      ...this,
      score,
    });
  }

  public static of(data: InterviewQuestionType): InterviewQuestion {
    return new InterviewQuestion(data);
  }
}
```

### 2.4 기존 InterviewQuestion Repository 확장

**파일: `src/domain/interview/question/interview-question.repository.ts` (수정)**

```typescript
import { InterviewQuestion } from "@/domain/interview/question/interview-question";

export interface InterviewQuestionRepository {
  save(question: InterviewQuestion): Promise<void>;
  findById(id: string): Promise<InterviewQuestion | null>;
  update(question: InterviewQuestion): Promise<void>;
  findByVideoInterviewId(videoInterviewId: string): Promise<InterviewQuestion[]>;  // 추가
}

export const INTERVIEW_QUESTION_REPOSITORY: symbol = Symbol(
  "InterviewQuestionRepository",
);
```

### 2.5 InterviewFeedback 확장

**파일: `src/domain/interview/feedback/types/interview-feedback.type.ts` (수정)**

```typescript
import { FeedbackTypeEnum } from "@/domain/interview/feedback/enums";

export type InterviewFeedbackContent = {
  strengths: string[];
  improvements: string[];
  recommendations: string[];
};

export type ExpressionFeedbackContent = {
  emotionSummary: string;
  emotionTimeline: {
    timestamp: number;
    emotion: string;
    detail: string;
  }[];
  eyeContactScore: number;
  confidenceScore: number;
  recommendations: string[];
};

export type OverallFeedbackContent = {
  summary: string;
  contentScore: number;
  expressionScore: number;
  overallScore: number;
  strengths: string[];
  improvements: string[];
  recommendations: string[];
};

export type InterviewFeedbackType = {
  id: string;
  answerId: string;
  feedbackType: FeedbackTypeEnum;                            // 추가
  feedback: InterviewFeedbackContent | ExpressionFeedbackContent | OverallFeedbackContent;
  score: number;
  createdAt: Date;
};

export type CreateFeedbackRequest = {
  answerId: string;
  feedbackType?: FeedbackTypeEnum;                           // 추가
  feedback: InterviewFeedbackContent | ExpressionFeedbackContent | OverallFeedbackContent;
  score: number;
};
```

**파일: `src/domain/interview/feedback/interview-feedback.ts` (수정)**

```typescript
import { FeedbackTypeEnum } from "@/domain/interview/feedback/enums";
import {
  type CreateFeedbackRequest,
  type ExpressionFeedbackContent,
  type InterviewFeedbackContent,
  type InterviewFeedbackType,
  type OverallFeedbackContent,
} from "@/domain/interview/feedback/types";
import { randomUUID } from "crypto";

export class InterviewFeedback {
  readonly id: string;
  readonly answerId: string;
  readonly feedbackType: FeedbackTypeEnum;                   // 추가
  readonly feedback: InterviewFeedbackContent | ExpressionFeedbackContent | OverallFeedbackContent;
  readonly score: number;
  readonly createdAt: Date;

  private constructor(data: InterviewFeedbackType) {
    Object.assign(this, data);
  }

  public static create(request: CreateFeedbackRequest): InterviewFeedback {
    return new InterviewFeedback({
      id: randomUUID(),
      answerId: request.answerId,
      feedbackType: request.feedbackType ?? FeedbackTypeEnum.CONTENT,  // 추가
      feedback: request.feedback,
      score: request.score,
      createdAt: new Date(),
    });
  }

  public static of(data: InterviewFeedbackType): InterviewFeedback {
    return new InterviewFeedback(data);
  }
}
```

**파일: `src/domain/interview/feedback/interview-feedback.repository.ts` (수정)**

```typescript
import { InterviewFeedback } from "@/domain/interview/feedback/interview-feedback";
import { FeedbackTypeEnum } from "@/domain/interview/feedback/enums";

export interface InterviewFeedbackRepository {
  save(feedback: InterviewFeedback): Promise<void>;
  findByAnswerId(answerId: string): Promise<InterviewFeedback | null>;
  findByAnswerIds(answerIds: string[]): Promise<InterviewFeedback[]>;
  findAllByAnswerId(answerId: string): Promise<InterviewFeedback[]>;                              // 추가
  findByAnswerIdAndType(answerId: string, type: FeedbackTypeEnum): Promise<InterviewFeedback | null>;  // 추가
}

export const INTERVIEW_FEEDBACK_REPOSITORY: symbol = Symbol(
  "InterviewFeedbackRepository",
);
```

**파일: `src/domain/interview/feedback/index.ts` (수정)**

```typescript
export * from "./interview-feedback";
export * from "./interview-feedback.repository";
export * from "./types";
export * from "./enums";       // 추가
```

---

## 3단계: Prisma 스키마 마이그레이션

**파일: `prisma/schema.prisma` (수정)**

```prisma
generator client {
  provider     = "prisma-client"
  output       = "../src/generated/prisma"
  moduleFormat = "cjs"
}

datasource db {
  provider = "postgresql"
}

model VideoInterview {
  id            String    @id @default(uuid()) @db.Uuid
  userId        String    @map("user_id") @db.Uuid
  questionCount Int       @map("question_count")
  status        String    @default("generating") @db.VarChar(20)
  createdAt     DateTime  @default(now()) @map("created_at") @db.Timestamptz
  completedAt   DateTime? @map("completed_at") @db.Timestamptz

  questions InterviewQuestion[]

  @@index([userId])
  @@index([userId, createdAt])
  @@map("video_interview")
}

model InterviewQuestion {
  id           String   @id @default(uuid()) @db.Uuid
  userId       String   @map("user_id") @db.Uuid
  videoInterviewId    String?  @map("video_interview_id") @db.Uuid
  question     String   @db.Text
  questionType String   @map("question_type") @db.VarChar(20)
  questionTag  String   @map("question_tag") @db.VarChar(50)
  status       String   @default("unanswered") @db.VarChar(20)
  score        Int      @default(0)
  sourceRef    String?  @map("source_ref")
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz

  session VideoInterview? @relation(fields: [videoInterviewId], references: [id])
  answers InterviewAnswer[]

  @@index([userId])
  @@index([userId, createdAt])
  @@index([videoInterviewId])
  @@map("interview_question")
}

model InterviewAnswer {
  id         String   @id @default(uuid()) @db.Uuid
  questionId String   @map("question_id") @db.Uuid
  answer     String   @db.Text
  answerType String   @map("answer_type") @db.VarChar(20)
  mediaUrl   String?  @map("media_url") @db.Text
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz

  question  InterviewQuestion   @relation(fields: [questionId], references: [id])
  feedbacks InterviewFeedback[]

  @@index([questionId])
  @@map("interview_answer")
}

model InterviewFeedback {
  id           String   @id @default(uuid()) @db.Uuid
  answerId     String   @map("answer_id") @db.Uuid
  feedbackType String   @default("content") @map("feedback_type") @db.VarChar(20)
  feedback     String   @db.Text
  score        Int      @default(0)
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz

  answer InterviewAnswer @relation(fields: [answerId], references: [id])

  @@unique([answerId, feedbackType])
  @@map("interview_feedback")
}
```

```bash
npx prisma migrate dev --name add_interview_session_and_video_feedback
npx prisma generate
```

---

## 4단계: Port 정의 (Application 계층)

### 4.1 S3StoragePort

**파일: `src/application/interview/ports/s3-storage.port.ts`**

```typescript
export type S3UploadResult = {
  key: string;
  url: string;
};

export interface S3StoragePort {
  uploadVideo(
    file: Buffer,
    key: string,
    contentType: string,
  ): Promise<S3UploadResult>;

  getSignedUrl(key: string, expiresIn?: number): Promise<string>;

  downloadObject(key: string): Promise<Buffer>;
}

export const S3_STORAGE_PORT: symbol = Symbol("S3StoragePort");
```

### 4.2 VideoProcessingPort

**파일: `src/application/interview/ports/video-processing.port.ts`**

```typescript
export type ExtractedFrames = {
  frames: Buffer[];
  totalFrames: number;
};

export type ExtractedAudio = {
  audio: Buffer;
  format: string;
  durationSeconds: number;
};

export interface VideoProcessingPort {
  extractFrames(videoBuffer: Buffer, fps?: number): Promise<ExtractedFrames>;
  extractAudio(videoBuffer: Buffer): Promise<ExtractedAudio>;
}

export const VIDEO_PROCESSING_PORT: symbol = Symbol("VideoProcessingPort");
```

### 4.3 STTPort

**파일: `src/application/interview/ports/stt.port.ts`**

```typescript
export type TranscriptionResult = {
  text: string;
  durationSeconds: number;
};

export interface STTPort {
  transcribe(audio: Buffer, format: string): Promise<TranscriptionResult>;
}

export const STT_PORT: symbol = Symbol("STTPort");
```

### 4.4 FacialExpressionAnalysisPort

**파일: `src/application/interview/ports/facial-expression-analysis.port.ts`**

```typescript
export type FrameExpressionResult = {
  frameIndex: number;
  timestamp: number;
  emotion: string;
  detail: string;
};

export type ExpressionAnalysisResult = {
  frameResults: FrameExpressionResult[];
  summary: string;
  eyeContactScore: number;
  confidenceScore: number;
  score: number;
  recommendations: string[];
};

export interface FacialExpressionAnalysisPort {
  analyzeFrames(frames: Buffer[]): Promise<ExpressionAnalysisResult>;
}

export const FACIAL_EXPRESSION_ANALYSIS_PORT: symbol = Symbol(
  "FacialExpressionAnalysisPort",
);
```

### 4.5 OverallFeedbackPort

**파일: `src/application/interview/ports/overall-feedback.port.ts`**

```typescript
export type OverallFeedbackRequest = {
  question: string;
  contentFeedback: {
    score: number;
    strengths: string[];
    improvements: string[];
    recommendations: string[];
  };
  expressionFeedback: {
    score: number;
    summary: string;
    recommendations: string[];
  };
};

export type OverallFeedbackResult = {
  overallScore: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  recommendations: string[];
};

export interface OverallFeedbackPort {
  generateOverallFeedback(
    request: OverallFeedbackRequest,
  ): Promise<OverallFeedbackResult>;
}

export const OVERALL_FEEDBACK_PORT: symbol = Symbol("OverallFeedbackPort");
```

### 4.6 ports/index.ts 수정

**파일: `src/application/interview/ports/index.ts` (수정)**

```typescript
export * from "./ai-question-genrator.port";
export * from "./notification-recipient-finder.port";
export * from "./notification-sender.port";
export * from "./kakao-token-refresher.port";
export * from "./ai-scoring.port";
export * from "./member-point-update.port";
// 추가
export * from "./s3-storage.port";
export * from "./video-processing.port";
export * from "./stt.port";
export * from "./facial-expression-analysis.port";
export * from "./overall-feedback.port";
```

---

## 5단계: Adapter 구현

### 5.1 S3 Storage Adapter

**파일: `src/adapter/interview/storage/s3-storage.adapter.ts`**

```typescript
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  S3StoragePort,
  S3UploadResult,
} from "@/application/interview/ports/s3-storage.port";

@Injectable()
export class S3StorageAdapter implements S3StoragePort {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly configService: ConfigService) {
    this.client = new S3Client({
      region: this.configService.getOrThrow<string>("AWS_REGION"),
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>("AWS_ACCESS_KEY_ID"),
        secretAccessKey: this.configService.getOrThrow<string>(
          "AWS_SECRET_ACCESS_KEY",
        ),
      },
    });
    this.bucket = this.configService.getOrThrow<string>("S3_BUCKET_NAME");
  }

  async uploadVideo(
    file: Buffer,
    key: string,
    contentType: string,
  ): Promise<S3UploadResult> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file,
        ContentType: contentType,
      }),
    );

    return {
      key,
      url: `https://${this.bucket}.s3.amazonaws.com/${key}`,
    };
  }

  async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn },
    );
  }

  async downloadObject(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );

    const stream = response.Body;
    if (!stream) {
      throw new Error(`S3 object not found: ${key}`);
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
}
```

### 5.2 FFmpeg Video Processing Adapter

**파일: `src/adapter/interview/video/ffmpeg-video-processing.adapter.ts`**

```typescript
import { Injectable } from "@nestjs/common";
import {
  VideoProcessingPort,
  ExtractedFrames,
  ExtractedAudio,
} from "@/application/interview/ports/video-processing.port";
import * as ffmpeg from "fluent-ffmpeg";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { randomUUID } from "crypto";

@Injectable()
export class FFmpegVideoProcessingAdapter implements VideoProcessingPort {
  async extractFrames(
    videoBuffer: Buffer,
    fps: number = 1,
  ): Promise<ExtractedFrames> {
    const tmpDir = path.join(os.tmpdir(), `frames-${randomUUID()}`);
    const videoPath = path.join(os.tmpdir(), `video-${randomUUID()}.webm`);

    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(videoPath, videoBuffer);

    try {
      await new Promise<void>((resolve, reject) => {
        ffmpeg(videoPath)
          .outputOptions([`-vf fps=${fps}`, "-f image2"])
          .output(path.join(tmpDir, "frame-%04d.jpg"))
          .on("end", () => resolve())
          .on("error", (err) => reject(err))
          .run();
      });

      const frameFiles = fs
        .readdirSync(tmpDir)
        .filter((f) => f.endsWith(".jpg"))
        .sort();

      const frames: Buffer[] = frameFiles.map((f) =>
        fs.readFileSync(path.join(tmpDir, f)),
      );

      return { frames, totalFrames: frames.length };
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      fs.rmSync(videoPath, { force: true });
    }
  }

  async extractAudio(videoBuffer: Buffer): Promise<ExtractedAudio> {
    const videoPath = path.join(os.tmpdir(), `video-${randomUUID()}.webm`);
    const audioPath = path.join(os.tmpdir(), `audio-${randomUUID()}.wav`);

    fs.writeFileSync(videoPath, videoBuffer);

    try {
      const durationSeconds = await this.getDuration(videoPath);

      await new Promise<void>((resolve, reject) => {
        ffmpeg(videoPath)
          .noVideo()
          .audioCodec("pcm_s16le")
          .audioFrequency(16000)
          .audioChannels(1)
          .output(audioPath)
          .on("end", () => resolve())
          .on("error", (err) => reject(err))
          .run();
      });

      const audio = fs.readFileSync(audioPath);

      return { audio, format: "wav", durationSeconds };
    } finally {
      fs.rmSync(videoPath, { force: true });
      fs.rmSync(audioPath, { force: true });
    }
  }

  private getDuration(videoPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) return reject(err);
        resolve(metadata.format.duration ?? 0);
      });
    });
  }
}
```

### 5.3 OpenAI Whisper STT Adapter

**파일: `src/adapter/interview/ai/openai-stt.adapter.ts`**

```typescript
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OpenAI } from "openai";
import {
  STTPort,
  TranscriptionResult,
} from "@/application/interview/ports/stt.port";

@Injectable()
export class OpenAISTTAdapter implements STTPort {
  private readonly client: OpenAI;
  private readonly logger: Logger = new Logger(OpenAISTTAdapter.name);

  constructor(private readonly configService: ConfigService) {
    this.client = new OpenAI({
      apiKey: this.configService.getOrThrow<string>("OPENAI_API_KEY"),
    });
  }

  async transcribe(
    audio: Buffer,
    format: string,
  ): Promise<TranscriptionResult> {
    this.logger.log("STT transcription started");

    const file = new File([audio], `audio.${format}`, {
      type: `audio/${format}`,
    });

    const response = await this.client.audio.transcriptions.create({
      file,
      model: "whisper-1",
      language: "ko",
      response_format: "verbose_json",
    });

    this.logger.log("STT transcription completed", {
      module: "OpenAISTTAdapter",
      textLength: response.text.length,
    });

    return {
      text: response.text,
      durationSeconds: response.duration ?? 0,
    };
  }
}
```

### 5.4 표정 분석 Adapter (GPT-4o Vision)

**파일: `src/adapter/interview/ai/facial-expression-analysis.adapter.ts`**

```typescript
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OpenAI } from "openai";
import {
  FacialExpressionAnalysisPort,
  ExpressionAnalysisResult,
  FrameExpressionResult,
} from "@/application/interview/ports/facial-expression-analysis.port";

@Injectable()
export class FacialExpressionAnalysisAdapter
  implements FacialExpressionAnalysisPort
{
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly logger: Logger = new Logger(
    FacialExpressionAnalysisAdapter.name,
  );

  // 비용 절감: N프레임마다 1개만 분석 (5초 간격)
  private readonly SAMPLE_INTERVAL = 5;

  constructor(private readonly configService: ConfigService) {
    this.client = new OpenAI({
      apiKey: this.configService.getOrThrow<string>("OPENAI_API_KEY"),
    });
    this.model = this.configService.getOrThrow<string>("OPENAI_MODEL");
  }

  async analyzeFrames(frames: Buffer[]): Promise<ExpressionAnalysisResult> {
    this.logger.log("Facial expression analysis started", {
      module: "FacialExpressionAnalysisAdapter",
      totalFrames: frames.length,
    });

    // 프레임 샘플링 (5초 간격, 1fps 기준이므로 5프레임 간격)
    const sampledFrames: { index: number; buffer: Buffer }[] = [];
    for (let i = 0; i < frames.length; i += this.SAMPLE_INTERVAL) {
      sampledFrames.push({ index: i, buffer: frames[i] });
    }

    const imageContents: OpenAI.Chat.Completions.ChatCompletionContentPart[] =
      sampledFrames.map(({ index, buffer }) => ({
        type: "image_url" as const,
        image_url: {
          url: `data:image/jpeg;base64,${buffer.toString("base64")}`,
          detail: "low" as const,
        },
      }));

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: "system",
          content: this.buildSystemPrompt(),
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `면접 영상에서 ${this.SAMPLE_INTERVAL}초 간격으로 추출한 ${sampledFrames.length}개의 프레임입니다. 각 프레임의 표정을 분석해주세요.`,
            },
            ...imageContents,
          ],
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI Vision returned empty response");
    }

    const parsed = JSON.parse(content) as {
      frames: {
        frameIndex: number;
        emotion: string;
        detail: string;
      }[];
      summary: string;
      eyeContactScore: number;
      confidenceScore: number;
      score: number;
      recommendations: string[];
    };

    const frameResults: FrameExpressionResult[] = parsed.frames.map(
      (f, idx) => ({
        frameIndex: sampledFrames[idx]?.index ?? idx,
        timestamp: (sampledFrames[idx]?.index ?? idx) * 1, // 1fps이므로 index = 초
        emotion: f.emotion,
        detail: f.detail,
      }),
    );

    this.logger.log("Facial expression analysis completed", {
      module: "FacialExpressionAnalysisAdapter",
      score: parsed.score,
    });

    return {
      frameResults,
      summary: parsed.summary,
      eyeContactScore: parsed.eyeContactScore,
      confidenceScore: parsed.confidenceScore,
      score: parsed.score,
      recommendations: parsed.recommendations,
    };
  }

  private buildSystemPrompt(): string {
    return `당신은 면접 표정 분석 전문가입니다.
면접 중인 지원자의 표정 프레임들을 분석하여 JSON 형식으로 결과를 반환합니다.

분석 기준:
- 감정 상태: 자신감, 긴장, 편안함, 당황 등
- 시선 처리: 카메라(면접관)를 바라보고 있는지
- 자신감 수준: 표정과 자세에서 드러나는 자신감
- 전반적 인상: 면접관 입장에서의 종합적 인상

부연 설명 없이 다음 JSON 형식으로만 응답하세요:
{
  "frames": [
    { "frameIndex": 0, "emotion": "자신감 있음", "detail": "카메라를 정면으로 바라보며 자연스러운 미소" }
  ],
  "summary": "전반적인 표정 요약",
  "eyeContactScore": 0~100,
  "confidenceScore": 0~100,
  "score": 0~100,
  "recommendations": ["추천1", "추천2", "추천3"]
}`.trim();
  }
}
```

### 5.5 종합 피드백 Adapter

**파일: `src/adapter/interview/ai/overall-feedback.adapter.ts`**

```typescript
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OpenAI } from "openai";
import {
  OverallFeedbackPort,
  OverallFeedbackRequest,
  OverallFeedbackResult,
} from "@/application/interview/ports/overall-feedback.port";

@Injectable()
export class OverallFeedbackAdapter implements OverallFeedbackPort {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly logger: Logger = new Logger(OverallFeedbackAdapter.name);

  constructor(private readonly configService: ConfigService) {
    this.client = new OpenAI({
      apiKey: this.configService.getOrThrow<string>("OPENAI_API_KEY"),
    });
    this.model = this.configService.getOrThrow<string>("OPENAI_MODEL");
  }

  async generateOverallFeedback(
    request: OverallFeedbackRequest,
  ): Promise<OverallFeedbackResult> {
    this.logger.log("Overall feedback generation started");

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: this.buildSystemPrompt() },
        { role: "user", content: this.buildUserPrompt(request) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI returned empty response");
    }

    const parsed = JSON.parse(content) as OverallFeedbackResult;

    this.logger.log("Overall feedback generation completed", {
      module: "OverallFeedbackAdapter",
      overallScore: parsed.overallScore,
    });

    return parsed;
  }

  private buildSystemPrompt(): string {
    return `당신은 10년차 면접 코칭 전문가입니다.
면접 답변 내용 피드백과 표정 분석 결과를 종합하여 최종 피드백을 생성합니다.

부연 설명 없이 다음 JSON 형식으로만 응답하세요:
{
  "overallScore": 0~100,
  "summary": "종합 피드백 요약 (2~3문장)",
  "strengths": ["강점1", "강점2", "강점3"],
  "improvements": ["개선점1", "개선점2", "개선점3"],
  "recommendations": ["추천1", "추천2", "추천3"]
}`.trim();
  }

  private buildUserPrompt(request: OverallFeedbackRequest): string {
    return `
## 면접 질문
${request.question}

## 답변 내용 피드백 (점수: ${request.contentFeedback.score}/100)
- 강점: ${request.contentFeedback.strengths.join(", ")}
- 개선점: ${request.contentFeedback.improvements.join(", ")}

## 표정 분석 피드백 (점수: ${request.expressionFeedback.score}/100)
- 요약: ${request.expressionFeedback.summary}
- 추천: ${request.expressionFeedback.recommendations.join(", ")}

위 두 가지 피드백을 종합하여 최종 면접 피드백을 생성해주세요.`.trim();
  }
}
```

### 5.6 Session Prisma Repository

**파일: `src/adapter/interview/persistence/video-interview-prisma.repository.ts`**

```typescript
import { Injectable } from "@nestjs/common";
import {
  VideoInterview,
  VideoInterviewRepository,
} from "@/domain/interview/video-interview";
import { VideoInterviewStatusEnum } from "@/domain/interview/video-interview/enums";
import { PrismaService } from "@/adapter/shared/prisma";

@Injectable()
export class VideoInterviewPrismaRepository
  implements VideoInterviewRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async save(session: VideoInterview): Promise<void> {
    await this.prisma.videoInterview.create({
      data: {
        id: session.id,
        userId: session.userId,
        questionCount: session.questionCount,
        status: session.status,
        createdAt: session.createdAt,
        completedAt: session.completedAt,
      },
    });
  }

  async findById(id: string): Promise<VideoInterview | null> {
    const record = await this.prisma.videoInterview.findUnique({
      where: { id },
    });

    if (!record) return null;

    return VideoInterview.of({
      id: record.id,
      userId: record.userId,
      questionCount: record.questionCount,
      status: record.status as VideoInterviewStatusEnum,
      createdAt: record.createdAt,
      completedAt: record.completedAt,
    });
  }

  async findByUserId(userId: string): Promise<VideoInterview[]> {
    const records = await this.prisma.videoInterview.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return records.map((r) =>
      VideoInterview.of({
        id: r.id,
        userId: r.userId,
        questionCount: r.questionCount,
        status: r.status as VideoInterviewStatusEnum,
        createdAt: r.createdAt,
        completedAt: r.completedAt,
      }),
    );
  }

  async update(session: VideoInterview): Promise<void> {
    await this.prisma.videoInterview.update({
      where: { id: session.id },
      data: {
        status: session.status,
        completedAt: session.completedAt,
      },
    });
  }
}
```

### 5.7 기존 Repository 수정

**파일: `src/adapter/interview/persistence/interview-question-prisma.repository.ts` (수정)**

```typescript
import { Injectable } from "@nestjs/common";
import {
  InterviewQuestion,
  InterviewQuestionRepository,
} from "@/domain/interview/question";
import { PrismaService } from "@/adapter/shared/prisma";
import {
  QuestionStatusEnum,
  QuestionTypeEnum,
} from "@/domain/interview/question/enums";

@Injectable()
export class InterviewQuestionPrismaRepository
  implements InterviewQuestionRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async save(question: InterviewQuestion): Promise<void> {
    await this.prisma.interviewQuestion.create({
      data: {
        id: question.id,
        userId: question.userId,
        videoInterviewId: question.videoInterviewId,       // 추가
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

  async findById(id: string): Promise<InterviewQuestion | null> {
    const record = await this.prisma.interviewQuestion.findUnique({
      where: { id },
    });

    if (!record) return null;

    return InterviewQuestion.of({
      id: record.id,
      userId: record.userId,
      videoInterviewId: record.videoInterviewId,           // 추가
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

  // 추가
  async findByVideoInterviewId(videoInterviewId: string): Promise<InterviewQuestion[]> {
    const records = await this.prisma.interviewQuestion.findMany({
      where: { videoInterviewId },
      orderBy: { createdAt: "asc" },
    });

    return records.map((r) =>
      InterviewQuestion.of({
        id: r.id,
        userId: r.userId,
        videoInterviewId: r.videoInterviewId,
        question: r.question,
        questionType: r.questionType as QuestionTypeEnum,
        questionTag: r.questionTag,
        status: r.status as QuestionStatusEnum,
        score: r.score,
        sourceRef: r.sourceRef,
        createdAt: r.createdAt,
      }),
    );
  }
}
```

**파일: `src/adapter/interview/persistence/interview-feedback-prisma.repository.ts` (수정)**

```typescript
import { Injectable } from "@nestjs/common";
import {
  InterviewFeedback,
  type InterviewFeedbackRepository,
} from "@/domain/interview/feedback";
import { FeedbackTypeEnum } from "@/domain/interview/feedback/enums";
import { PrismaService } from "@/adapter/shared/prisma";

@Injectable()
export class InterviewFeedbackPrismaRepository
  implements InterviewFeedbackRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async save(feedback: InterviewFeedback): Promise<void> {
    await this.prisma.interviewFeedback.create({
      data: {
        id: feedback.id,
        answerId: feedback.answerId,
        feedbackType: feedback.feedbackType,   // 추가
        feedback: JSON.stringify(feedback.feedback),
        score: feedback.score,
        createdAt: feedback.createdAt,
      },
    });
  }

  // 하위호환: 기존 코드는 CONTENT 타입 피드백만 조회
  async findByAnswerId(answerId: string): Promise<InterviewFeedback | null> {
    const record = await this.prisma.interviewFeedback.findFirst({
      where: { answerId, feedbackType: FeedbackTypeEnum.CONTENT },
    });

    if (!record) return null;
    return this.toDomain(record);
  }

  async findByAnswerIds(answerIds: string[]): Promise<InterviewFeedback[]> {
    const records = await this.prisma.interviewFeedback.findMany({
      where: { answerId: { in: answerIds } },
    });

    return records.map((r) => this.toDomain(r));
  }

  // 추가: 하나의 답변에 대한 모든 피드백 (CONTENT, EXPRESSION, OVERALL)
  async findAllByAnswerId(answerId: string): Promise<InterviewFeedback[]> {
    const records = await this.prisma.interviewFeedback.findMany({
      where: { answerId },
      orderBy: { createdAt: "asc" },
    });

    return records.map((r) => this.toDomain(r));
  }

  // 추가: 특정 타입의 피드백 조회
  async findByAnswerIdAndType(
    answerId: string,
    type: FeedbackTypeEnum,
  ): Promise<InterviewFeedback | null> {
    const record = await this.prisma.interviewFeedback.findUnique({
      where: { answerId_feedbackType: { answerId, feedbackType: type } },
    });

    if (!record) return null;
    return this.toDomain(record);
  }

  private toDomain(record: {
    id: string;
    answerId: string;
    feedbackType: string;
    feedback: string;
    score: number;
    createdAt: Date;
  }): InterviewFeedback {
    return InterviewFeedback.of({
      id: record.id,
      answerId: record.answerId,
      feedbackType: record.feedbackType as FeedbackTypeEnum,
      feedback: JSON.parse(record.feedback),
      score: record.score,
      createdAt: record.createdAt,
    });
  }
}
```

---

## 6단계: Application 서비스

### 6.1 VideoInterviewService

**파일: `src/application/interview/service/video-interview.service.ts`**

```typescript
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Observable } from "rxjs";
import {
  VIDEO_INTERVIEW_REPOSITORY,
  VideoInterview,
  type VideoInterviewRepository,
} from "@/domain/interview/video-interview";
import { VideoInterviewStatusEnum } from "@/domain/interview/video-interview/enums";
import { VideoInterviewNotFoundException } from "@/domain/interview/video-interview/exceptions";
import {
  INTERVIEW_QUESTION_REPOSITORY,
  InterviewQuestion,
  type InterviewQuestionRepository,
} from "@/domain/interview/question";
import { QuestionTypeEnum } from "@/domain/interview/question/enums";
import {
  INTERVIEW_ANSWER_REPOSITORY,
  InterviewAnswer,
  type InterviewAnswerRepository,
  AnswerTypeEnum,
} from "@/domain/interview/answer";
import {
  INTERVIEW_FEEDBACK_REPOSITORY,
  InterviewFeedback,
  type InterviewFeedbackRepository,
} from "@/domain/interview/feedback";
import { FeedbackTypeEnum } from "@/domain/interview/feedback/enums";
import {
  AI_QUESTION_GENERATOR,
  type AIQuestionGenerator,
  AI_SCORING_PORT,
  type AIScoringPort,
  S3_STORAGE_PORT,
  type S3StoragePort,
  VIDEO_PROCESSING_PORT,
  type VideoProcessingPort,
  STT_PORT,
  type STTPort,
  FACIAL_EXPRESSION_ANALYSIS_PORT,
  type FacialExpressionAnalysisPort,
  OVERALL_FEEDBACK_PORT,
  type OverallFeedbackPort,
} from "@/application/interview/ports";
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";
import { randomUUID } from "crypto";

@Injectable()
export class VideoInterviewService {
  constructor(
    @Inject(VIDEO_INTERVIEW_REPOSITORY)
    private readonly videoInterviewRepository: VideoInterviewRepository,
    @Inject(INTERVIEW_QUESTION_REPOSITORY)
    private readonly questionRepository: InterviewQuestionRepository,
    @Inject(INTERVIEW_ANSWER_REPOSITORY)
    private readonly answerRepository: InterviewAnswerRepository,
    @Inject(INTERVIEW_FEEDBACK_REPOSITORY)
    private readonly feedbackRepository: InterviewFeedbackRepository,
    @Inject(AI_QUESTION_GENERATOR)
    private readonly aiQuestionGenerator: AIQuestionGenerator,
    @Inject(AI_SCORING_PORT)
    private readonly aiScoring: AIScoringPort,
    @Inject(S3_STORAGE_PORT)
    private readonly s3Storage: S3StoragePort,
    @Inject(VIDEO_PROCESSING_PORT)
    private readonly videoProcessing: VideoProcessingPort,
    @Inject(STT_PORT)
    private readonly stt: STTPort,
    @Inject(FACIAL_EXPRESSION_ANALYSIS_PORT)
    private readonly expressionAnalysis: FacialExpressionAnalysisPort,
    @Inject(OVERALL_FEEDBACK_PORT)
    private readonly overallFeedback: OverallFeedbackPort,
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  // ─── 화상 면접 생성 ───
  async createSession(
    userId: string,
    questionCount: number,
  ): Promise<VideoInterview> {
    const videoInterview = VideoInterview.create({ userId, questionCount });
    await this.videoInterviewRepository.save(session);

    this.logger.log("Interview session created", {
      module: "VideoInterviewService",
      videoInterviewId: session.id,
      userId,
      questionCount,
    });

    return videoInterview;
  }

  // ─── SSE 질문 스트리밍 ───
  streamQuestions(
    videoInterviewId: string,
    userId: string,
    job: string,
  ): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      (async () => {
        const videoInterview = await this.videoInterviewRepository.findById(videoInterviewId);
        if (!session || session.userId !== userId) {
          throw new VideoInterviewNotFoundException(videoInterviewId);
        }

        for (let i = 0; i < session.questionCount; i++) {
          const [generated] =
            await this.aiQuestionGenerator.generateQuestions(job, 1);

          const question = InterviewQuestion.createQuestion({
            userId,
            videoInterviewId,
            question: generated.question,
            questionType: QuestionTypeEnum.VIDEO,
            questionTag: generated.questionTag,
          });

          await this.questionRepository.save(question);

          subscriber.next({
            data: JSON.stringify({
              type: "question",
              index: i + 1,
              total: session.questionCount,
              question: {
                id: question.id,
                question: question.question,
                questionTag: question.questionTag,
              },
            }),
          } as MessageEvent);

          this.logger.log(
            `Question ${i + 1}/${session.questionCount} streamed`,
            {
              module: "VideoInterviewService",
              videoInterviewId,
              questionId: question.id,
            },
          );
        }

        // 화상 면접 상태 업데이트
        const updatedSession = session.markQuestionsReady();
        await this.videoInterviewRepository.update(updatedSession);

        subscriber.next({
          data: JSON.stringify({ type: "complete" }),
        } as MessageEvent);
        subscriber.complete();
      })().catch((err) => subscriber.error(err));
    });
  }

  // ─── 영상 답변 업로드 ───
  async uploadVideoAnswer(
    userId: string,
    videoInterviewId: string,
    questionId: string,
    file: Express.Multer.File,
  ): Promise<{ answerId: string; status: string }> {
    // 화상 면접 검증
    const videoInterview = await this.videoInterviewRepository.findById(videoInterviewId);
    if (!session || session.userId !== userId) {
      throw new VideoInterviewNotFoundException(videoInterviewId);
    }

    // 질문 검증
    const question = await this.questionRepository.findById(questionId);
    if (!question || question.userId !== userId) {
      throw new NotFoundException(`질문을 찾을 수 없습니다: ${questionId}`);
    }

    // S3 업로드
    const s3Key = `interviews/${videoInterviewId}/${questionId}/${randomUUID()}.webm`;
    const { url: mediaUrl } = await this.s3Storage.uploadVideo(
      file.buffer,
      s3Key,
      file.mimetype,
    );

    // Answer 저장
    const answer = InterviewAnswer.createAnswer({
      questionId,
      answer: "", // STT 처리 후 업데이트됨
      answerType: AnswerTypeEnum.VIDEO,
      mediaUrl,
    });
    await this.answerRepository.save(answer);

    this.logger.log("Video answer uploaded", {
      module: "VideoInterviewService",
      videoInterviewId,
      questionId,
      answerId: answer.id,
      s3Key,
    });

    // 비동기 분석 파이프라인 시작 (fire-and-forget)
    this.processVideoAnswer(
      answer.id,
      questionId,
      videoInterviewId,
      s3Key,
      question.question,
    ).catch((err) =>
      this.logger.error("비디오 분석 파이프라인 실패", err instanceof Error ? err : undefined, {
        module: "VideoInterviewService",
        answerId: answer.id,
      }),
    );

    return { answerId: answer.id, status: "processing" };
  }

  // ─── 비동기 비디오 분석 파이프라인 ───
  private async processVideoAnswer(
    answerId: string,
    questionId: string,
    videoInterviewId: string,
    s3Key: string,
    questionText: string,
  ): Promise<void> {
    this.logger.log("Video processing pipeline started", {
      module: "VideoInterviewService",
      answerId,
    });

    // 1. S3에서 영상 다운로드
    const videoBuffer = await this.s3Storage.downloadObject(s3Key);

    // 2. 프레임 추출 + 오디오 추출 병렬 실행
    const [extractedFrames, extractedAudio] = await Promise.all([
      this.videoProcessing.extractFrames(videoBuffer, 1),
      this.videoProcessing.extractAudio(videoBuffer),
    ]);

    // 3. 표정 분석 + (STT → 답변 채점) 병렬 실행
    const [expressionResult, { transcription, scoringResult }] =
      await Promise.all([
        this.expressionAnalysis.analyzeFrames(extractedFrames.frames),
        this.transcribeAndScore(
          extractedAudio.audio,
          extractedAudio.format,
          questionId,
          questionText,
        ),
      ]);

    // 4. EXPRESSION 피드백 저장
    const expressionFeedback = InterviewFeedback.create({
      answerId,
      feedbackType: FeedbackTypeEnum.EXPRESSION,
      feedback: {
        emotionSummary: expressionResult.summary,
        emotionTimeline: expressionResult.frameResults.map((f) => ({
          timestamp: f.timestamp,
          emotion: f.emotion,
          detail: f.detail,
        })),
        eyeContactScore: expressionResult.eyeContactScore,
        confidenceScore: expressionResult.confidenceScore,
        recommendations: expressionResult.recommendations,
      },
      score: expressionResult.score,
    });
    await this.feedbackRepository.save(expressionFeedback);

    // 5. CONTENT 피드백 저장
    const contentFeedback = InterviewFeedback.create({
      answerId,
      feedbackType: FeedbackTypeEnum.CONTENT,
      feedback: {
        strengths: scoringResult.feedback.strengths,
        improvements: scoringResult.feedback.improvements,
        recommendations: scoringResult.feedback.recommendations,
      },
      score: scoringResult.score,
    });
    await this.feedbackRepository.save(contentFeedback);

    // 6. 종합 피드백 생성 + 저장
    const overallResult = await this.overallFeedback.generateOverallFeedback({
      question: questionText,
      contentFeedback: {
        score: scoringResult.score,
        strengths: scoringResult.feedback.strengths,
        improvements: scoringResult.feedback.improvements,
        recommendations: scoringResult.feedback.recommendations,
      },
      expressionFeedback: {
        score: expressionResult.score,
        summary: expressionResult.summary,
        recommendations: expressionResult.recommendations,
      },
    });

    const overallFeedback = InterviewFeedback.create({
      answerId,
      feedbackType: FeedbackTypeEnum.OVERALL,
      feedback: {
        summary: overallResult.summary,
        contentScore: scoringResult.score,
        expressionScore: expressionResult.score,
        overallScore: overallResult.overallScore,
        strengths: overallResult.strengths,
        improvements: overallResult.improvements,
        recommendations: overallResult.recommendations,
      },
      score: overallResult.overallScore,
    });
    await this.feedbackRepository.save(overallFeedback);

    // 7. 질문 상태 업데이트
    const question = await this.questionRepository.findById(questionId);
    if (question) {
      const updatedQuestion = question.marksAnswered(overallResult.overallScore);
      await this.questionRepository.update(updatedQuestion);
    }

    // 8. 화상 면접 완료 여부 체크
    await this.checkVideoInterviewCompletion(videoInterviewId);

    this.logger.log("Video processing pipeline completed", {
      module: "VideoInterviewService",
      answerId,
      overallScore: overallResult.overallScore,
    });
  }

  private async transcribeAndScore(
    audioBuffer: Buffer,
    format: string,
    questionId: string,
    questionText: string,
  ) {
    const transcription = await this.stt.transcribe(audioBuffer, format);

    const scoringResult = await this.aiScoring.scoreAnswer({
      questionId,
      question: questionText,
      answer: transcription.text,
    });

    return { transcription, scoringResult };
  }

  private async checkVideoInterviewCompletion(videoInterviewId: string): Promise<void> {
    const questions = await this.questionRepository.findByVideoInterviewId(videoInterviewId);
    const allAnswered = questions.every((q) => q.status === "answered");

    if (allAnswered) {
      const videoInterview = await this.videoInterviewRepository.findById(videoInterviewId);
      if (session) {
        const completedSession = session.markCompleted();
        await this.videoInterviewRepository.update(completedSession);
      }
    }
  }

  // ─── 화상 면접 결과 조회 ───
  async getSessionResult(videoInterviewId: string, userId: string) {
    const videoInterview = await this.videoInterviewRepository.findById(videoInterviewId);
    if (!session || session.userId !== userId) {
      throw new VideoInterviewNotFoundException(videoInterviewId);
    }

    const questions =
      await this.questionRepository.findByVideoInterviewId(videoInterviewId);

    const questionsWithFeedback = await Promise.all(
      questions.map(async (q) => {
        const answers = await this.answerRepository.findByQuestionId(q.id);
        const latestAnswer = answers[answers.length - 1] ?? null;

        let feedbacks: InterviewFeedback[] = [];
        if (latestAnswer) {
          feedbacks =
            await this.feedbackRepository.findAllByAnswerId(latestAnswer.id);
        }

        const feedbackMap = new Map(
          feedbacks.map((f) => [f.feedbackType, f]),
        );

        return {
          questionId: q.id,
          question: q.question,
          questionTag: q.questionTag,
          status: q.status,
          score: q.score,
          answer: latestAnswer
            ? {
                id: latestAnswer.id,
                mediaUrl: latestAnswer.mediaUrl,
                createdAt: latestAnswer.createdAt,
              }
            : null,
          feedbacks: {
            content: feedbackMap.get(FeedbackTypeEnum.CONTENT)
              ? {
                  score: feedbackMap.get(FeedbackTypeEnum.CONTENT)!.score,
                  feedback: feedbackMap.get(FeedbackTypeEnum.CONTENT)!.feedback,
                }
              : null,
            expression: feedbackMap.get(FeedbackTypeEnum.EXPRESSION)
              ? {
                  score: feedbackMap.get(FeedbackTypeEnum.EXPRESSION)!.score,
                  feedback: feedbackMap.get(FeedbackTypeEnum.EXPRESSION)!.feedback,
                }
              : null,
            overall: feedbackMap.get(FeedbackTypeEnum.OVERALL)
              ? {
                  score: feedbackMap.get(FeedbackTypeEnum.OVERALL)!.score,
                  feedback: feedbackMap.get(FeedbackTypeEnum.OVERALL)!.feedback,
                }
              : null,
          },
        };
      }),
    );

    return {
      session: {
        id: session.id,
        status: session.status,
        questionCount: session.questionCount,
        createdAt: session.createdAt,
        completedAt: session.completedAt,
      },
      questions: questionsWithFeedback,
    };
  }

  // ─── 화상 면접 상태 조회 ───
  async getSession(videoInterviewId: string, userId: string) {
    const videoInterview = await this.videoInterviewRepository.findById(videoInterviewId);
    if (!session || session.userId !== userId) {
      throw new VideoInterviewNotFoundException(videoInterviewId);
    }

    const questions =
      await this.questionRepository.findByVideoInterviewId(videoInterviewId);

    return {
      id: session.id,
      status: session.status,
      questionCount: session.questionCount,
      createdAt: session.createdAt,
      completedAt: session.completedAt,
      questions: questions.map((q) => ({
        id: q.id,
        question: q.question,
        status: q.status,
        score: q.score,
      })),
    };
  }
}
```

---

## 7단계: API 계층

### 7.1 SkipTransformResponse 데코레이터

**파일: `src/adapter/shared/api/decorators/skip-transform.decorator.ts`**

```typescript
import { SetMetadata } from "@nestjs/common";

export const SKIP_TRANSFORM_KEY = "skipTransform";
export const SkipTransformResponse = () =>
  SetMetadata(SKIP_TRANSFORM_KEY, true);
```

### 7.2 TransformResponseInterceptor 수정

**파일: `src/adapter/shared/api/interceptors/transform-response.interceptor.ts` (수정)**

```typescript
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Response } from "express";
import { SuccessResponse } from "@/adapter/shared/api/types/api-response.type";
import { map, Observable } from "rxjs";
import { SKIP_TRANSFORM_KEY } from "@/adapter/shared/api/decorators/skip-transform.decorator";

@Injectable()
export class TransformResponseInterceptor<T>
  implements NestInterceptor<T, SuccessResponse<T>>
{
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<SuccessResponse<T>> | Observable<T> {
    // SSE 등 변환을 건너뛰어야 하는 엔드포인트 처리
    const skip = this.reflector.get<boolean>(
      SKIP_TRANSFORM_KEY,
      context.getHandler(),
    );
    if (skip) {
      return next.handle();
    }

    const response: Response = context.switchToHttp().getResponse<Response>();
    const statusCode: number = response.statusCode;

    return next.handle().pipe(
      map((data: any) => {
        const customMessage = data?.message;
        const finalMessage =
          customMessage || this.getSuccessMessage(statusCode);

        if (data && typeof data === "object" && "message" in data) {
          const { message: _, ...rest } = data;
          return {
            statusCode,
            data: rest,
            message: finalMessage,
          };
        }

        return {
          statusCode,
          data,
          message: finalMessage,
        };
      }),
    );
  }

  private getSuccessMessage(StatusCode: number): string {
    switch (StatusCode) {
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

### 7.3 DTOs

**파일: `src/adapter/interview/api/dto/create-video-interview.dto.ts`**

```typescript
import { IsInt, Max, Min } from "class-validator";

export class CreateVideoInterviewDto {
  @IsInt()
  @Min(1)
  @Max(10)
  questionCount!: number;
}
```

### 7.4 VideoInterviewController

**파일: `src/adapter/interview/api/video-interview.controller.ts`**

```typescript
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Sse,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Observable } from "rxjs";
import { VideoInterviewService } from "@/application/interview/service/video-interview.service";
import { CurrentUser } from "@/adapter/shared/api/decorators/current-user.decorator";
import type { User } from "@/adapter/shared/api/types/user";
import { CreateVideoInterviewDto } from "@/adapter/interview/api/dto/create-video-interview.dto";
import { SkipTransformResponse } from "@/adapter/shared/api/decorators/skip-transform.decorator";

@Controller("api/interview/video-interview")
export class VideoInterviewController {
  constructor(
    private readonly videoInterviewService: VideoInterviewService,
  ) {}

  @Post()
  async createSession(
    @CurrentUser() user: User,
    @Body() dto: CreateVideoInterviewDto,
  ) {
    const videoInterview = await this.videoInterviewService.createSession(
      user.memberId,
      dto.questionCount,
    );
    return { videoInterviewId: session.id };
  }

  @Sse(":videoInterviewId/questions/stream")
  @SkipTransformResponse()
  streamQuestions(
    @CurrentUser() user: User,
    @Param("videoInterviewId", ParseUUIDPipe) videoInterviewId: string,
  ): Observable<MessageEvent> {
    return this.videoInterviewService.streamQuestions(
      videoInterviewId,
      user.memberId,
      user.job,
    );
  }

  @Post(":videoInterviewId/questions/:questionId/video")
  @UseInterceptors(FileInterceptor("video"))
  async uploadVideoAnswer(
    @CurrentUser() user: User,
    @Param("videoInterviewId", ParseUUIDPipe) videoInterviewId: string,
    @Param("questionId", ParseUUIDPipe) questionId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.videoInterviewService.uploadVideoAnswer(
      user.memberId,
      videoInterviewId,
      questionId,
      file,
    );
  }

  @Get(":videoInterviewId/result")
  async getSessionResult(
    @CurrentUser() user: User,
    @Param("videoInterviewId", ParseUUIDPipe) videoInterviewId: string,
  ) {
    return this.videoInterviewService.getSessionResult(videoInterviewId, user.memberId);
  }

  @Get(":videoInterviewId")
  async getSession(
    @CurrentUser() user: User,
    @Param("videoInterviewId", ParseUUIDPipe) videoInterviewId: string,
  ) {
    return this.videoInterviewService.getSession(videoInterviewId, user.memberId);
  }
}
```

---

## 8단계: 모듈 등록

### 8.1 VideoInterviewModule

**파일: `src/adapter/interview/video-interview.module.ts`**

```typescript
import { Module } from "@nestjs/common";
import { VideoInterviewController } from "@/adapter/interview/api/video-interview.controller";
import { VideoInterviewService } from "@/application/interview/service/video-interview.service";
import { VIDEO_INTERVIEW_REPOSITORY } from "@/domain/interview/video-interview";
import { VideoInterviewPrismaRepository } from "@/adapter/interview/persistence/video-interview-prisma.repository";
import { INTERVIEW_QUESTION_REPOSITORY } from "@/domain/interview/question";
import { InterviewQuestionPrismaRepository } from "@/adapter/interview/persistence/interview-question-prisma.repository";
import { INTERVIEW_ANSWER_REPOSITORY } from "@/domain/interview/answer";
import { InterviewAnswerPrismaRepository } from "@/adapter/interview/persistence/interview-answer-prisma.repository";
import { INTERVIEW_FEEDBACK_REPOSITORY } from "@/domain/interview/feedback";
import { InterviewFeedbackPrismaRepository } from "@/adapter/interview/persistence/interview-feedback-prisma.repository";
import {
  AI_QUESTION_GENERATOR,
  AI_SCORING_PORT,
  FACIAL_EXPRESSION_ANALYSIS_PORT,
  OVERALL_FEEDBACK_PORT,
  S3_STORAGE_PORT,
  STT_PORT,
  VIDEO_PROCESSING_PORT,
} from "@/application/interview/ports";
import { OpenaiQuestionGeneratorService } from "@/adapter/interview/ai/openai-question-generator.service";
import { AIScoringAdapter } from "@/adapter/interview/ai/ai-scoring.adapter";
import { FacialExpressionAnalysisAdapter } from "@/adapter/interview/ai/facial-expression-analysis.adapter";
import { OverallFeedbackAdapter } from "@/adapter/interview/ai/overall-feedback.adapter";
import { S3StorageAdapter } from "@/adapter/interview/storage/s3-storage.adapter";
import { FFmpegVideoProcessingAdapter } from "@/adapter/interview/video/ffmpeg-video-processing.adapter";
import { OpenAISTTAdapter } from "@/adapter/interview/ai/openai-stt.adapter";

@Module({
  controllers: [VideoInterviewController],
  providers: [
    VideoInterviewService,

    // Repositories
    {
      provide: VIDEO_INTERVIEW_REPOSITORY,
      useClass: VideoInterviewPrismaRepository,
    },
    {
      provide: INTERVIEW_QUESTION_REPOSITORY,
      useClass: InterviewQuestionPrismaRepository,
    },
    {
      provide: INTERVIEW_ANSWER_REPOSITORY,
      useClass: InterviewAnswerPrismaRepository,
    },
    {
      provide: INTERVIEW_FEEDBACK_REPOSITORY,
      useClass: InterviewFeedbackPrismaRepository,
    },

    // AI Ports
    {
      provide: AI_QUESTION_GENERATOR,
      useClass: OpenaiQuestionGeneratorService,
    },
    {
      provide: AI_SCORING_PORT,
      useClass: AIScoringAdapter,
    },
    {
      provide: FACIAL_EXPRESSION_ANALYSIS_PORT,
      useClass: FacialExpressionAnalysisAdapter,
    },
    {
      provide: OVERALL_FEEDBACK_PORT,
      useClass: OverallFeedbackAdapter,
    },

    // Infrastructure Ports
    {
      provide: S3_STORAGE_PORT,
      useClass: S3StorageAdapter,
    },
    {
      provide: VIDEO_PROCESSING_PORT,
      useClass: FFmpegVideoProcessingAdapter,
    },
    {
      provide: STT_PORT,
      useClass: OpenAISTTAdapter,
    },
  ],
})
export class VideoInterviewModule {}
```

### 8.2 AppModule 등록

**파일: `src/app.module.ts` (수정)**

```typescript
import { VideoInterviewModule } from "@/adapter/interview/video-interview.module";

@Module({
  imports: [
    // ... 기존 imports
    VideoInterviewModule,   // 추가
  ],
  // ...
})
export class AppModule implements NestModule {
  // ...
}
```

---

## 검증 방법

### curl 테스트

```bash
# 1. 화상 면접 생성
curl -X POST http://localhost:3000/api/interview/video-interview \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"questionCount": 3}'

# 2. SSE 질문 스트리밍
curl -N -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/interview/video-interview/$VIDEO_INTERVIEW_ID/questions/stream

# 3. 영상 업로드
curl -X POST http://localhost:3000/api/interview/video-interview/$VIDEO_INTERVIEW_ID/questions/$QID/video \
  -H "Authorization: Bearer $TOKEN" \
  -F "video=@recording.webm"

# 4. 화상 면접 상태 확인 (분석 진행 중 확인)
curl http://localhost:3000/api/interview/video-interview/$VIDEO_INTERVIEW_ID \
  -H "Authorization: Bearer $TOKEN"

# 5. 결과 조회 (분석 완료 후)
curl http://localhost:3000/api/interview/video-interview/$VIDEO_INTERVIEW_ID/result \
  -H "Authorization: Bearer $TOKEN"
```

### API 응답 예시

**화상 면접 결과 조회 응답:**

```json
{
  "videoInterview": {
    "id": "uuid",
    "status": "completed",
    "questionCount": 3,
    "createdAt": "2026-02-12T...",
    "completedAt": "2026-02-12T..."
  },
  "questions": [
    {
      "questionId": "uuid",
      "question": "팀 프로젝트에서 갈등이 발생했을 때...",
      "questionTag": "협업",
      "status": "answered",
      "score": 78,
      "answer": {
        "id": "uuid",
        "mediaUrl": "https://bucket.s3.amazonaws.com/interviews/...",
        "createdAt": "2026-02-12T..."
      },
      "feedbacks": {
        "content": {
          "score": 75,
          "feedback": {
            "strengths": ["구체적 사례 제시", "논리적 전개"],
            "improvements": ["결론 명확화 필요"],
            "recommendations": ["STAR 기법 연습"]
          }
        },
        "expression": {
          "score": 82,
          "feedback": {
            "emotionSummary": "전반적으로 자신감 있는 표정",
            "emotionTimeline": [
              {"timestamp": 0, "emotion": "자신감", "detail": "카메라 정면 응시"}
            ],
            "eyeContactScore": 85,
            "confidenceScore": 80,
            "recommendations": ["간헐적 시선 분산 주의"]
          }
        },
        "overall": {
          "score": 78,
          "feedback": {
            "summary": "답변 내용과 비언어적 표현 모두 준수한 수준...",
            "contentScore": 75,
            "expressionScore": 82,
            "overallScore": 78,
            "strengths": ["답변과 표정의 일관성"],
            "improvements": ["답변 마무리 시 자신감 유지"],
            "recommendations": ["모의 면접 반복 연습"]
          }
        }
      }
    }
  ]
}
```

---

## 비용 최적화 참고

| 서비스 | 예상 비용 (질문 1개당) | 비고 |
|--------|----------------------|------|
| 질문 생성 (GPT-4o) | ~$0.01 | 텍스트만 |
| STT (Whisper) | ~$0.012 | 2분 영상 기준 |
| 답변 채점 (GPT-4o) | ~$0.02 | 텍스트만 |
| 표정 분석 (GPT-4o Vision) | ~$0.15~$0.30 | 12~24프레임, low detail |
| 종합 피드백 (GPT-4o) | ~$0.02 | 텍스트만 |
| **총 예상** | **~$0.21~$0.37** | **질문 1개당** |

- 프레임 샘플링 간격(`SAMPLE_INTERVAL`)으로 비용 조절 가능
- Vision API `detail: "low"` 사용으로 토큰 절약
