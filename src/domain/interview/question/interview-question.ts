import { QuestionStatusEnum, QuestionTypeEnum } from "@/domain/interview/enums";
import {
  CreateQuestionRequest,
  InterviewQuestionType,
} from "@/domain/interview/types";
import { randomUUID } from "crypto";

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

  private constructor(interviewQuestionType: InterviewQuestionType) {
    Object.assign(this, interviewQuestionType);
  }

  public static createQuestion(
    request: CreateQuestionRequest,
  ): InterviewQuestion {
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
    });
  }
}
