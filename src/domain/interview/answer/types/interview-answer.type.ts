import { AnswerTypeEnum } from "@/domain/interview/answer/enums/answer-type.enum";

export type InterviewAnswerType = {
  id: string;
  interviewId: string;
  answer: string;
  answerType: AnswerTypeEnum;
  mediaUrl: string | null;
  createdAt: Date;
};

export type CreateAnswerRequest = {
  interviewId: string;
  answer: string;
  answerType: AnswerTypeEnum;
  mediaUrl?: string;
};
