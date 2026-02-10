import { QuestionStatusEnum, QuestionTypeEnum } from "@/domain/interview/enums";

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
};

export type CreateQuestionRequest = {
  userId: string;
  question: string;
  questionType: QuestionTypeEnum;
  questionTag: string;
  sourceRef?: string;
};
