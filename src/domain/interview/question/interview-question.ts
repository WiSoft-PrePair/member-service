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
  readonly videoInterviewId: string | null;
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
      videoInterviewId: request.videoInterviewId ?? null,
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
