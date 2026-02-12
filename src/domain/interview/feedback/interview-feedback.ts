import {
  type CreateFeedbackRequest,
  type InterviewFeedbackContent,
  type InterviewFeedbackType,
} from "@/domain/interview/feedback/types";
import { randomUUID } from "crypto";

export class InterviewFeedback {
  readonly id: string;
  readonly answerId: string;
  readonly feedback: InterviewFeedbackContent;
  readonly score: number;
  readonly createdAt: Date;

  private constructor(data: InterviewFeedbackType) {
    Object.assign(this, data);
  }

  public static create(request: CreateFeedbackRequest): InterviewFeedback {
    return new InterviewFeedback({
      id: randomUUID(),
      answerId: request.answerId,
      feedback: request.feedback,
      score: request.score,
      createdAt: new Date(),
    });
  }

  public static of(data: InterviewFeedbackType): InterviewFeedback {
    return new InterviewFeedback(data);
  }
}
