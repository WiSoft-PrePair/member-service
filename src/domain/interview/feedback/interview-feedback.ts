import {
  type CreateFeedbackRequest,
  ExpressionFeedbackContent,
  type InterviewFeedbackContent,
  type InterviewFeedbackType,
  OverallFeedbackContent,
} from "@/domain/interview/feedback/types";
import { randomUUID } from "crypto";
import { FeedbackTypeEnum } from "@/domain/interview/feedback/enums";

export class InterviewFeedback {
  readonly id: string;
  readonly answerId: string;
  readonly feedbackType: FeedbackTypeEnum;
  readonly feedback:
    | InterviewFeedbackContent
    | ExpressionFeedbackContent
    | OverallFeedbackContent;
  readonly score: number;
  readonly createdAt: Date;

  private constructor(data: InterviewFeedbackType) {
    Object.assign(this, data);
  }

  public static create(request: CreateFeedbackRequest): InterviewFeedback {
    return new InterviewFeedback({
      id: randomUUID(),
      answerId: request.answerId,
      feedbackType: request.feedbackType ?? FeedbackTypeEnum.CONTENT,
      feedback: request.feedback,
      score: request.score,
      createdAt: new Date(),
    });
  }

  public static of(data: InterviewFeedbackType): InterviewFeedback {
    return new InterviewFeedback(data);
  }
}
