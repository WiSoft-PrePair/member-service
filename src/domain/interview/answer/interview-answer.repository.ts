import { InterviewAnswer } from "@/domain/interview/answer/interview-answer";

export interface InterviewAnswerRepository {
  save(answer: InterviewAnswer): Promise<void>;

  findByQuestionId(questionId: string): Promise<InterviewAnswer[]>;

  countByInterviewId(questionId: string): Promise<number>;
}

export const INTERVIEW_ANSWER_REPOSITORY: symbol = Symbol(
  "InterviewAnswerRepository",
);
