import { QuestionTypeEnum } from "@/domain/interview/enums";

export type GeneratedQuestion = {
  question: string;
  questionType: QuestionTypeEnum;
  questionTag: string;
};

export interface AIQuestionGenerator {
  generateQuestions(job: string, count?: number): Promise<GeneratedQuestion[]>;
}

export const AI_QUESTION_GENERATOR: symbol = Symbol("AIQuestionGenerator");
