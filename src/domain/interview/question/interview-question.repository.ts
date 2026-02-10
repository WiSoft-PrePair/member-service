import { InterviewQuestion } from "@/domain/interview/question/interview-question";

export interface InterviewQuestionRepository {
  save(question: InterviewQuestion): Promise<void>;
}

export const INTERVIEW_QUESTION_REPOSITORY: symbol = Symbol(
  "InterviewQuestionRepository",
);
