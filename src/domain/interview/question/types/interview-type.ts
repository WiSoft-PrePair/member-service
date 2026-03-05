import {
  QuestionStatusEnum,
  QuestionTypeEnum,
} from "@/domain/interview/question/enums";

export type InterviewQuestionType = {
  id: string;
  userId: string;
  videoInterviewId: string | null;
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
  videoInterviewId?: string;
  question: string;
  questionType: QuestionTypeEnum;
  questionTag: string;
  sourceRef?: string;
};
