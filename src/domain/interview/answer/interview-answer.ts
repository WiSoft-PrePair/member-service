import { AnswerTypeEnum } from "@/domain/interview/answer/enums";
import {
  CreateAnswerRequest,
  InterviewAnswerType,
} from "@/domain/interview/answer/types";
import { randomUUID } from "crypto";

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

  public static createAnswer(request: CreateAnswerRequest): InterviewAnswer {
    return new InterviewAnswer({
      id: randomUUID(),
      interviewId: request.interviewId,
      answer: request.answer,
      answerType: request.answerType,
      mediaUrl: request.mediaUrl ?? null,
      createdAt: new Date(),
    });
  }

  public static of(data: InterviewAnswerType): InterviewAnswer {
    return new InterviewAnswer(data);
  }
}
