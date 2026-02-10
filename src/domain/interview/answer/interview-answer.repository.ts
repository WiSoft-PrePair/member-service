import { InterviewAnswer } from "@/domain/interview/answer/interview-answer";

export interface InterviewAnswerRepository {
  save(answer: InterviewAnswer): Promise<void>;

  findByInterviewId(interviewId: string): Promise<InterviewAnswer[]>;

  countByInterviewId(interviewId: string): Promise<number>;
}

export const INTERVIEW_ANSWER_REPOSITORY: symbol = Symbol(
  "InterviewAnswerRepository",
);
