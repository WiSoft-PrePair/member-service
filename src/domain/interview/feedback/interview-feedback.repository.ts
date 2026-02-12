import { InterviewFeedback } from "@/domain/interview/feedback/interview-feedback";

export interface InterviewFeedbackRepository {
  save(feedback: InterviewFeedback): Promise<void>;

  findByAnswerId(answerId: string): Promise<InterviewFeedback | null>;

  findByAnswerIds(answerIds: string[]): Promise<InterviewFeedback[]>;
}

export const INTERVIEW_FEEDBACK_REPOSITORY: symbol = Symbol(
  "InterviewFeedbackRepository",
);
