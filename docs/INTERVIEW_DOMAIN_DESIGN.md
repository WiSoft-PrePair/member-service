# Interview 도메인 DDD 설계 가이드

## 목차
1. [도메인 분석 요약](#1-도메인-분석-요약)
2. [도메인 구조 설계](#2-도메인-구조-설계)
3. [Aggregate Root 설계](#3-aggregate-root-설계)
4. [Value Objects](#4-value-objects)
5. [Enums](#5-enums)
6. [DB 스키마 설계](#6-db-스키마-설계)
7. [Read Model (CQRS)](#7-read-model-cqrs)
8. [Entity 관계도 (ERD)](#8-entity-관계도-erd)
9. [Application Layer 구조](#9-application-layer-구조)
10. [API Endpoints 설계](#10-api-endpoints-설계)
11. [Pro 플랜 제한 로직](#11-pro-플랜-제한-로직)
12. [포인트 획득 로직](#12-포인트-획득-로직)
13. [요약](#13-요약)

---

## 1. 도메인 분석 요약

프론트엔드 분석 결과, Interview 도메인은 다음 4개의 **서브도메인(Bounded Context)**으로 구분됩니다:

| 서브도메인 | 설명 | 주요 기능 |
|-----------|------|----------|
| **DailyQuestion** | 오늘의 면접 질문 | 매일 질문 제공, 답변 저장, AI 피드백 |
| **InterviewHistory** | 면접 기록 | 히스토리 관리, 재피드백, 역량 분석 |
| **MockInterview** | 모의 면접 | 화상 면접, 행동 분석, TTS |
| **JobPostAnalysis** | 공고 분석 | URL 크롤링, 맞춤 질문 생성 |

추가로 **Notification** (알림 설정)은 Member 도메인의 일부로 이미 존재합니다.

---

## 2. 도메인 구조 설계

```
src/domain/interview/
├── interview-question/           # 면접 질문 Aggregate
│   ├── interview-question.ts
│   ├── interview-question.repository.ts
│   ├── value-objects/
│   │   └── question-category.ts
│   ├── enums/
│   │   └── question-type.enum.ts
│   ├── types/
│   │   └── interview-question.type.ts
│   ├── events/
│   │   └── question-answered.event.ts
│   └── exceptions/
│       └── question-not-found.exception.ts
│
├── interview-history/            # 면접 기록 Aggregate
│   ├── interview-history.ts
│   ├── interview-history.repository.ts
│   ├── value-objects/
│   │   ├── feedback-score.ts
│   │   ├── feedback-breakdown.ts
│   │   └── ai-feedback.ts
│   ├── enums/
│   │   └── interview-source.enum.ts
│   ├── types/
│   │   └── interview-history.type.ts
│   ├── events/
│   │   ├── interview-completed.event.ts
│   │   └── feedback-regenerated.event.ts
│   └── exceptions/
│       └── history-not-found.exception.ts
│
├── mock-interview/               # 모의 면접 Aggregate
│   ├── mock-interview.ts
│   ├── mock-interview.repository.ts
│   ├── value-objects/
│   │   ├── behavior-analysis.ts
│   │   └── answer-record.ts
│   ├── enums/
│   │   └── mock-interview-status.enum.ts
│   ├── types/
│   │   └── mock-interview.type.ts
│   ├── events/
│   │   └── mock-interview-completed.event.ts
│   └── exceptions/
│       └── mock-limit-exceeded.exception.ts
│
└── job-post-analysis/            # 공고 분석 Aggregate
    ├── job-post-analysis.ts
    ├── job-post-analysis.repository.ts
    ├── value-objects/
    │   ├── job-requirements.ts
    │   └── custom-question.ts
    ├── types/
    │   └── job-post-analysis.type.ts
    ├── events/
    │   └── job-post-analyzed.event.ts
    └── exceptions/
        └── invalid-job-post-url.exception.ts
```

---

## 3. Aggregate Root 설계

### 3.1 InterviewQuestion (면접 질문)

```typescript
// src/domain/interview/interview-question/interview-question.ts
export class InterviewQuestion {
  readonly id: string;
  readonly text: string;
  readonly category: QuestionCategory;
  readonly type: QuestionType;
  readonly difficulty: number;        // 1-5
  readonly keywords: string[];
  readonly suggestedAnswer?: string;  // AI 추천 답변
  readonly isActive: boolean;
  readonly createdAt: Date;

  public static create(request: CreateQuestionRequest): InterviewQuestion;
  public static of(data: InterviewQuestionType): InterviewQuestion;

  public deactivate(): InterviewQuestion;
  public updateSuggestedAnswer(answer: string): InterviewQuestion;
}
```

### 3.2 InterviewHistory (면접 기록)

```typescript
// src/domain/interview/interview-history/interview-history.ts
export class InterviewHistory {
  readonly id: string;
  readonly memberId: string;
  readonly questionId: string;
  readonly question: string;           // 질문 텍스트 (스냅샷)
  readonly category: string;
  readonly answer: string;
  readonly feedback: AIFeedback;       // Value Object
  readonly score: FeedbackScore;       // Value Object
  readonly breakdown: FeedbackBreakdown; // Value Object
  readonly source: InterviewSource;    // DAILY | JOBPOST
  readonly jobPostId?: string;         // 공고 분석인 경우
  readonly company?: string;
  readonly position?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  public static create(request: CreateHistoryRequest): InterviewHistory;
  public static of(data: InterviewHistoryType): InterviewHistory;

  public regenerateFeedback(newAnswer: string, feedback: AIFeedback, score: FeedbackScore): InterviewHistory;
}
```

### 3.3 MockInterview (모의 면접)

```typescript
// src/domain/interview/mock-interview/mock-interview.ts
export class MockInterview {
  readonly id: string;
  readonly memberId: string;
  readonly questionCount: number;
  readonly voiceId: string;
  readonly status: MockInterviewStatus;
  readonly answers: AnswerRecord[];         // Value Object[]
  readonly behaviorAnalysis?: BehaviorAnalysis; // Value Object
  readonly startedAt: Date;
  readonly completedAt?: Date;
  readonly createdAt: Date;

  public static start(request: StartMockInterviewRequest): MockInterview;
  public static of(data: MockInterviewType): MockInterview;

  public recordAnswer(answer: AnswerRecord): MockInterview;
  public complete(behaviorAnalysis: BehaviorAnalysis): MockInterview;
  public cancel(): MockInterview;
}
```

### 3.4 JobPostAnalysis (공고 분석)

```typescript
// src/domain/interview/job-post-analysis/job-post-analysis.ts
export class JobPostAnalysis {
  readonly id: string;
  readonly memberId: string;
  readonly url: string;
  readonly company: string;
  readonly position: string;
  readonly department?: string;
  readonly requirements: JobRequirements;    // Value Object
  readonly keywords: string[];
  readonly customQuestions: CustomQuestion[]; // Value Object[]
  readonly createdAt: Date;

  public static analyze(request: AnalyzeJobPostRequest): JobPostAnalysis;
  public static of(data: JobPostAnalysisType): JobPostAnalysis;

  public addCustomQuestions(questions: CustomQuestion[]): JobPostAnalysis;
}
```

---

## 4. Value Objects

### FeedbackScore - 종합 점수

```typescript
export class FeedbackScore {
  constructor(
    readonly value: number,  // 0-100
  ) {
    if (value < 0 || value > 100) {
      throw new InvalidScoreException();
    }
  }

  get grade(): string {
    if (this.value >= 90) return 'A+';
    if (this.value >= 80) return 'A';
    if (this.value >= 70) return 'B+';
    if (this.value >= 60) return 'B';
    return 'C';
  }
}
```

### FeedbackBreakdown - 세부 점수

```typescript
export class FeedbackBreakdown {
  constructor(
    readonly structure: number,    // 구조화 0-100
    readonly clarity: number,      // 명료성 0-100
    readonly depth: number,        // 깊이 0-100
    readonly storytelling: number, // 스토리텔링 0-100
  ) {}

  get weightedScore(): number {
    return (
      this.structure * 0.25 +
      this.clarity * 0.25 +
      this.depth * 0.30 +
      this.storytelling * 0.20
    );
  }
}
```

### AIFeedback - AI 피드백 내용

```typescript
export class AIFeedback {
  constructor(
    readonly summary: string,
    readonly strengths: string[],
    readonly improvements: string[],
    readonly suggestedLearning?: string[],
  ) {}
}
```

### BehaviorAnalysis - 행동 분석 (모의 면접)

```typescript
export class BehaviorAnalysis {
  constructor(
    readonly overall: number,
    readonly eyeContact: number,   // 시선 처리 0-100
    readonly expression: number,   // 표정 0-100
    readonly posture: number,      // 자세 0-100
    readonly speech: number,       // 말하기 0-100
    readonly strengths: string[],
    readonly improvements: string[],
    readonly tips: string[],
  ) {}
}
```

### AnswerRecord - 개별 답변 기록

```typescript
export class AnswerRecord {
  constructor(
    readonly questionId: string,
    readonly question: string,
    readonly duration: number,  // 초
    readonly videoUrl?: string,
    readonly analysis?: {
      eyeContact: number;
      expression: number;
      posture: number;
      speech: number;
    },
  ) {}
}
```

### JobRequirements - 채용 요구사항

```typescript
export class JobRequirements {
  constructor(
    readonly qualifications: string[],     // 자격요건
    readonly preferred: string[],          // 우대사항
    readonly responsibilities: string[],   // 담당업무
  ) {}
}
```

### CustomQuestion - 맞춤형 질문

```typescript
export class CustomQuestion {
  constructor(
    readonly id: string,
    readonly category: string,  // 기술, 경험, 협업, 성장, 알고리즘
    readonly text: string,
    readonly relevance: string, // 관련 요구사항
  ) {}
}
```

### QuestionCategory - 질문 카테고리

```typescript
export class QuestionCategory {
  static readonly EXPERIENCE = new QuestionCategory('experience', '경험');
  static readonly COLLABORATION = new QuestionCategory('collaboration', '협업');
  static readonly SELF_ANALYSIS = new QuestionCategory('self-analysis', '자기분석');
  static readonly VISION = new QuestionCategory('vision', '비전');
  static readonly MOTIVATION = new QuestionCategory('motivation', '지원동기');
  static readonly LEADERSHIP = new QuestionCategory('leadership', '리더십');
  static readonly GROWTH = new QuestionCategory('growth', '성장');
  static readonly STRESS = new QuestionCategory('stress', '자기관리');
  static readonly COMPANY = new QuestionCategory('company', '기업분석');
  static readonly TECHNICAL = new QuestionCategory('technical', '기술');

  constructor(
    readonly code: string,
    readonly label: string,
  ) {}
}
```

---

## 5. Enums

### 면접 질문 타입

```typescript
export enum QuestionType {
  DAILY = 'daily',           // 오늘의 질문
  MOCK = 'mock',             // 모의 면접용
  JOBPOST = 'jobpost',       // 공고 분석 기반
}
```

### 면접 기록 출처

```typescript
export enum InterviewSource {
  DAILY = 'daily',           // 일일 면접
  JOBPOST = 'jobpost',       // 공고 분석 면접
}
```

### 모의 면접 상태

```typescript
export enum MockInterviewStatus {
  READY = 'ready',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}
```

---

## 6. DB 스키마 설계

### 6.1 interview_questions (면접 질문)

```sql
CREATE TABLE interview_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    text TEXT NOT NULL,
    category VARCHAR(50) NOT NULL,           -- experience, collaboration, etc.
    type VARCHAR(20) NOT NULL DEFAULT 'daily', -- daily, mock, jobpost
    difficulty INTEGER DEFAULT 3 CHECK (difficulty BETWEEN 1 AND 5),
    keywords TEXT[] DEFAULT '{}',
    suggested_answer TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_questions_category ON interview_questions(category);
CREATE INDEX idx_questions_type ON interview_questions(type);
CREATE INDEX idx_questions_active ON interview_questions(is_active);
```

### 6.2 interview_histories (면접 기록)

```sql
CREATE TABLE interview_histories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    question_id UUID REFERENCES interview_questions(id),
    question_text TEXT NOT NULL,             -- 질문 스냅샷
    category VARCHAR(50) NOT NULL,
    answer TEXT NOT NULL,

    -- 점수 (Embedded Value Object)
    score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
    score_structure INTEGER CHECK (score_structure BETWEEN 0 AND 100),
    score_clarity INTEGER CHECK (score_clarity BETWEEN 0 AND 100),
    score_depth INTEGER CHECK (score_depth BETWEEN 0 AND 100),
    score_storytelling INTEGER CHECK (score_storytelling BETWEEN 0 AND 100),

    -- AI 피드백 (JSON)
    feedback_summary TEXT,
    feedback_strengths TEXT[] DEFAULT '{}',
    feedback_improvements TEXT[] DEFAULT '{}',
    feedback_learning TEXT[],

    -- 출처 정보
    source VARCHAR(20) NOT NULL DEFAULT 'daily', -- daily, jobpost
    job_post_id UUID REFERENCES job_post_analyses(id),
    company VARCHAR(255),
    position VARCHAR(255),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_history_member ON interview_histories(member_id);
CREATE INDEX idx_history_source ON interview_histories(source);
CREATE INDEX idx_history_created ON interview_histories(created_at DESC);
CREATE INDEX idx_history_company ON interview_histories(company) WHERE company IS NOT NULL;
```

### 6.3 mock_interviews (모의 면접)

```sql
CREATE TABLE mock_interviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    question_count INTEGER NOT NULL CHECK (question_count BETWEEN 1 AND 10),
    voice_id VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ready', -- ready, in_progress, completed, cancelled

    -- 행동 분석 (Embedded Value Object)
    behavior_overall INTEGER CHECK (behavior_overall BETWEEN 0 AND 100),
    behavior_eye_contact INTEGER CHECK (behavior_eye_contact BETWEEN 0 AND 100),
    behavior_expression INTEGER CHECK (behavior_expression BETWEEN 0 AND 100),
    behavior_posture INTEGER CHECK (behavior_posture BETWEEN 0 AND 100),
    behavior_speech INTEGER CHECK (behavior_speech BETWEEN 0 AND 100),
    behavior_strengths TEXT[] DEFAULT '{}',
    behavior_improvements TEXT[] DEFAULT '{}',
    behavior_tips TEXT[] DEFAULT '{}',

    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_mock_member ON mock_interviews(member_id);
CREATE INDEX idx_mock_status ON mock_interviews(status);
CREATE INDEX idx_mock_created ON mock_interviews(created_at DESC);
```

### 6.4 mock_interview_answers (모의 면접 답변)

```sql
CREATE TABLE mock_interview_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mock_interview_id UUID NOT NULL REFERENCES mock_interviews(id) ON DELETE CASCADE,
    question_id UUID NOT NULL,
    question_text TEXT NOT NULL,
    sequence INTEGER NOT NULL,               -- 질문 순서
    duration INTEGER NOT NULL,               -- 답변 시간 (초)
    video_url TEXT,

    -- 개별 행동 분석
    analysis_eye_contact INTEGER CHECK (analysis_eye_contact BETWEEN 0 AND 100),
    analysis_expression INTEGER CHECK (analysis_expression BETWEEN 0 AND 100),
    analysis_posture INTEGER CHECK (analysis_posture BETWEEN 0 AND 100),
    analysis_speech INTEGER CHECK (analysis_speech BETWEEN 0 AND 100),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_mock_answers_interview ON mock_interview_answers(mock_interview_id);
CREATE UNIQUE INDEX idx_mock_answers_sequence ON mock_interview_answers(mock_interview_id, sequence);
```

### 6.5 job_post_analyses (공고 분석)

```sql
CREATE TABLE job_post_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    company VARCHAR(255) NOT NULL,
    position VARCHAR(255) NOT NULL,
    department VARCHAR(255),

    -- 요구사항 (JSON 배열)
    qualifications TEXT[] DEFAULT '{}',      -- 자격요건
    preferred TEXT[] DEFAULT '{}',           -- 우대사항
    responsibilities TEXT[] DEFAULT '{}',    -- 담당업무
    keywords TEXT[] DEFAULT '{}',            -- 기술 키워드

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_jobpost_member ON job_post_analyses(member_id);
CREATE INDEX idx_jobpost_company ON job_post_analyses(company);
CREATE INDEX idx_jobpost_created ON job_post_analyses(created_at DESC);
```

### 6.6 job_post_questions (공고 맞춤 질문)

```sql
CREATE TABLE job_post_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_post_id UUID NOT NULL REFERENCES job_post_analyses(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL,           -- 기술, 경험, 협업, 성장, 알고리즘
    text TEXT NOT NULL,
    relevance TEXT NOT NULL,                 -- 관련 요구사항
    sequence INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_jobpost_questions_post ON job_post_questions(job_post_id);
```

### 6.7 daily_question_logs (일일 질문 제공 로그)

```sql
CREATE TABLE daily_question_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES interview_questions(id),
    provided_date DATE NOT NULL,
    is_answered BOOLEAN DEFAULT false,
    answered_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_daily_log_unique ON daily_question_logs(member_id, provided_date);
CREATE INDEX idx_daily_log_member ON daily_question_logs(member_id);
```

### 6.8 pro_usage_tracking (Pro 사용량 추적)

```sql
CREATE TABLE pro_usage_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    usage_month VARCHAR(7) NOT NULL,         -- YYYY-MM
    mock_interview_count INTEGER DEFAULT 0,
    job_post_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_pro_usage_unique ON pro_usage_tracking(member_id, usage_month);
```

---

## 7. Read Model (CQRS)

### 면접 기록 읽기 모델 (역량 분석용)

```sql
CREATE TABLE interview_history_read (
    id UUID PRIMARY KEY,
    member_id UUID NOT NULL,
    question_text TEXT NOT NULL,
    category VARCHAR(50) NOT NULL,
    score INTEGER NOT NULL,
    source VARCHAR(20) NOT NULL,
    company VARCHAR(255),
    created_at TIMESTAMP NOT NULL,

    -- 비정규화된 역량 점수 (육각형 차트용)
    competency_proactivity INTEGER,     -- 적극성
    competency_values INTEGER,          -- 가치관
    competency_collaboration INTEGER,   -- 협동성
    competency_work_ethic INTEGER,      -- 성실성
    competency_creativity INTEGER,      -- 창의력
    competency_logical_thinking INTEGER -- 논리력
);

CREATE INDEX idx_history_read_member ON interview_history_read(member_id);
CREATE INDEX idx_history_read_created ON interview_history_read(created_at DESC);
```

---

## 8. Entity 관계도 (ERD)

```
┌─────────────────┐     ┌──────────────────────┐
│     member      │     │  interview_questions │
├─────────────────┤     ├──────────────────────┤
│ id (PK)         │     │ id (PK)              │
│ email           │     │ text                 │
│ nickname        │     │ category             │
│ job             │     │ type                 │
│ notification    │     │ difficulty           │
│ frequency       │     │ keywords             │
│ point           │     │ suggested_answer     │
│ isPro           │     │ is_active            │
└────────┬────────┘     └──────────┬───────────┘
         │                         │
         │ 1:N                     │ 1:N
         ▼                         ▼
┌─────────────────────────────────────────────┐
│            interview_histories              │
├─────────────────────────────────────────────┤
│ id (PK)                                     │
│ member_id (FK) ─────────────────────────────┤
│ question_id (FK) ───────────────────────────┤
│ question_text, category, answer             │
│ score, score_* (breakdown)                  │
│ feedback_* (AI feedback)                    │
│ source, job_post_id, company, position      │
└─────────────────────────────────────────────┘
         │
         │ N:1
         ▼
┌─────────────────────────────────────────────┐
│            job_post_analyses                │
├─────────────────────────────────────────────┤
│ id (PK)                                     │
│ member_id (FK)                              │
│ url, company, position, department          │
│ qualifications[], preferred[], keywords[]   │
└────────────────────┬────────────────────────┘
                     │ 1:N
                     ▼
         ┌───────────────────────┐
         │  job_post_questions   │
         ├───────────────────────┤
         │ id (PK)               │
         │ job_post_id (FK)      │
         │ category, text        │
         │ relevance, sequence   │
         └───────────────────────┘

┌─────────────────────────────────────────────┐
│              mock_interviews                │
├─────────────────────────────────────────────┤
│ id (PK)                                     │
│ member_id (FK)                              │
│ question_count, voice_id, status            │
│ behavior_* (analysis)                       │
│ started_at, completed_at                    │
└────────────────────┬────────────────────────┘
                     │ 1:N
                     ▼
         ┌───────────────────────────┐
         │  mock_interview_answers   │
         ├───────────────────────────┤
         │ id (PK)                   │
         │ mock_interview_id (FK)    │
         │ question_id, question_text│
         │ duration, video_url       │
         │ analysis_* (behavior)     │
         └───────────────────────────┘
```

---

## 9. Application Layer 구조

```
src/application/interview/
├── daily-question/
│   ├── command/
│   │   ├── provide-daily-question.command.ts
│   │   └── submit-answer.command.ts
│   ├── query/
│   │   ├── get-today-question.query.ts
│   │   └── get-suggested-answer.query.ts
│   └── event/
│       └── answer-submitted-event.handler.ts
│
├── interview-history/
│   ├── command/
│   │   ├── create-history.command.ts
│   │   └── regenerate-feedback.command.ts
│   ├── query/
│   │   ├── get-histories.query.ts
│   │   ├── get-history-detail.query.ts
│   │   └── get-summary-analysis.query.ts
│   └── event/
│       └── interview-completed-event.handler.ts
│
├── mock-interview/
│   ├── command/
│   │   ├── start-mock-interview.command.ts
│   │   ├── record-answer.command.ts
│   │   └── complete-mock-interview.command.ts
│   ├── query/
│   │   ├── get-mock-interview.query.ts
│   │   └── get-mock-history.query.ts
│   └── service/
│       ├── tts.service.ts
│       └── behavior-analysis.service.ts
│
└── job-post/
    ├── command/
    │   ├── analyze-job-post.command.ts
    │   └── generate-custom-questions.command.ts
    ├── query/
    │   ├── get-job-post-analysis.query.ts
    │   └── get-job-post-history.query.ts
    └── service/
        └── job-post-crawler.service.ts
```

---

## 10. API Endpoints 설계

### Daily Question

```typescript
GET    /api/interview/today              // 오늘의 질문 조회
POST   /api/interview/today/answer       // 답변 제출
GET    /api/interview/suggest            // AI 추천 답변
```

### Interview History

```typescript
GET    /api/interview/histories          // 기록 목록 (pagination, filter)
GET    /api/interview/histories/:id      // 기록 상세
POST   /api/interview/histories/:id/feedback  // 재피드백
GET    /api/interview/summary            // 역량 요약 (Pro)
```

### Mock Interview

```typescript
POST   /api/interview/mock               // 모의 면접 시작
GET    /api/interview/mock/:id           // 면접 상태 조회
POST   /api/interview/mock/:id/answer    // 답변 기록
POST   /api/interview/mock/:id/complete  // 면접 완료
GET    /api/interview/mock/history       // 모의 면접 기록
```

### Job Post Analysis

```typescript
POST   /api/interview/jobpost/analyze    // 공고 분석
GET    /api/interview/jobpost/:id        // 분석 결과 조회
GET    /api/interview/jobpost/history    // 분석 기록
```

### TTS

```typescript
POST   /api/tts/synthesize               // 음성 합성
```

---

## 11. Pro 플랜 제한 로직

### 사용량 체크 서비스

```typescript
@Injectable()
export class ProUsageService {
  private readonly FREE_LIMITS = {
    mockInterview: 3,
    jobPost: 3,
  };

  async canUseMockInterview(memberId: string): Promise<UsageResult> {
    const member = await this.memberRepository.findById(memberId);
    if (member.isPro) return { allowed: true, remaining: -1 };

    const usage = await this.getMonthlyUsage(memberId);
    const remaining = this.FREE_LIMITS.mockInterview - usage.mockInterviewCount;

    return {
      allowed: remaining > 0,
      remaining,
      limit: this.FREE_LIMITS.mockInterview,
    };
  }

  async useMockInterview(memberId: string): Promise<void> {
    const canUse = await this.canUseMockInterview(memberId);
    if (!canUse.allowed) {
      throw new MockLimitExceededException();
    }
    await this.incrementUsage(memberId, 'mockInterview');
  }

  async canUseJobPost(memberId: string): Promise<UsageResult> {
    const member = await this.memberRepository.findById(memberId);
    if (member.isPro) return { allowed: true, remaining: -1 };

    const usage = await this.getMonthlyUsage(memberId);
    const remaining = this.FREE_LIMITS.jobPost - usage.jobPostCount;

    return {
      allowed: remaining > 0,
      remaining,
      limit: this.FREE_LIMITS.jobPost,
    };
  }

  async useJobPost(memberId: string): Promise<void> {
    const canUse = await this.canUseJobPost(memberId);
    if (!canUse.allowed) {
      throw new JobPostLimitExceededException();
    }
    await this.incrementUsage(memberId, 'jobPost');
  }

  private async getMonthlyUsage(memberId: string): Promise<ProUsageTracking> {
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    let usage = await this.proUsageRepository.findByMemberAndMonth(memberId, currentMonth);

    if (!usage) {
      usage = await this.proUsageRepository.create({
        memberId,
        usageMonth: currentMonth,
        mockInterviewCount: 0,
        jobPostCount: 0,
      });
    }

    return usage;
  }

  private async incrementUsage(memberId: string, type: 'mockInterview' | 'jobPost'): Promise<void> {
    const currentMonth = new Date().toISOString().slice(0, 7);
    await this.proUsageRepository.increment(memberId, currentMonth, type);
  }
}

interface UsageResult {
  allowed: boolean;
  remaining: number;  // -1 for unlimited (Pro)
  limit: number;
}
```

---

## 12. 포인트 획득 로직

### 면접 완료 시 포인트 지급

```typescript
@EventsHandler(InterviewCompletedEvent)
export class GrantPointsOnInterviewCompleted
  implements IEventHandler<InterviewCompletedEvent> {

  constructor(
    @Inject(MEMBER_REPOSITORY)
    private readonly memberRepository: MemberRepository,
    private readonly em: EntityManager,
  ) {}

  async handle(event: InterviewCompletedEvent): Promise<void> {
    // 점수의 60%를 포인트로 지급
    const points = Math.floor(event.score * 0.6);

    const member = await this.memberRepository.findById(event.memberId);
    if (!member) return;

    // 포인트 추가
    const updatedMember = member.addPoints(points);

    // 연속 일일 도전 일수 증가 (오늘의 면접인 경우)
    if (event.source === InterviewSource.DAILY) {
      updatedMember.incrementStreak();
    }

    this.memberRepository.update(updatedMember);
    await this.em.flush();
  }
}
```

### Member Aggregate에 메서드 추가

```typescript
// src/domain/member/member.ts
export class Member {
  // ... 기존 필드

  public addPoints(points: number): Member {
    return new Member({
      ...this,
      point: this.point + points,
    });
  }

  public incrementStreak(): Member {
    return new Member({
      ...this,
      streak: this.streak + 1,
    });
  }
}
```

---

## 13. 요약

### 주요 테이블

| 구분 | 테이블 | 주요 필드 |
|------|--------|----------|
| 질문 관리 | `interview_questions` | text, category, type, difficulty |
| 면접 기록 | `interview_histories` | member_id, answer, score, feedback_*, source |
| 모의 면접 | `mock_interviews` | member_id, status, behavior_* |
| 모의 답변 | `mock_interview_answers` | mock_interview_id, duration, video_url |
| 공고 분석 | `job_post_analyses` | url, company, position, keywords[] |
| 맞춤 질문 | `job_post_questions` | job_post_id, category, text, relevance |
| 일일 로그 | `daily_question_logs` | member_id, question_id, provided_date |
| 사용량 | `pro_usage_tracking` | member_id, usage_month, counts |

### DDD 계층 구조

```
Domain Layer (비즈니스 로직)
  ├── Aggregate Roots: InterviewQuestion, InterviewHistory, MockInterview, JobPostAnalysis
  ├── Value Objects: FeedbackScore, FeedbackBreakdown, AIFeedback, BehaviorAnalysis
  ├── Domain Events: InterviewCompletedEvent, MockInterviewCompletedEvent
  └── Repository Interfaces (Ports)

Application Layer (Use Cases)
  ├── Commands: CreateHistory, StartMockInterview, AnalyzeJobPost
  ├── Queries: GetHistories, GetMockInterview, GetJobPostAnalysis
  ├── Event Handlers: GrantPointsOnInterviewCompleted
  └── Application Services: ProUsageService, TTSService

Adapter Layer (Infrastructure)
  ├── API Controllers & DTOs
  ├── Persistence (MikroORM Entities & Repositories)
  ├── Mappers (Domain ↔ Persistence)
  └── External Services (AI, TTS, Crawler)
```

### 구현 순서 권장사항

1. **Phase 1**: 기본 인프라
   - DB 스키마 생성
   - Entity 및 Mapper 구현
   - Repository 구현

2. **Phase 2**: 면접 질문 & 기록
   - InterviewQuestion Aggregate
   - InterviewHistory Aggregate
   - 오늘의 면접 기능

3. **Phase 3**: 모의 면접
   - MockInterview Aggregate
   - Pro 사용량 제한
   - TTS 통합

4. **Phase 4**: 공고 분석
   - JobPostAnalysis Aggregate
   - 크롤러 서비스
   - 맞춤 질문 생성

5. **Phase 5**: 고급 기능
   - 역량 분석 (Read Model)
   - 포인트 시스템
   - 통계 및 리포트

---

이 설계를 기반으로 Interview 도메인을 기존 Member 도메인과 동일한 DDD 패턴으로 구현하면 일관성 있는 아키텍처를 유지할 수 있습니다.
