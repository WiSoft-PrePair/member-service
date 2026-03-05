import { InterviewFeedback } from "@/domain/interview/feedback/interview-feedback";
import { FeedbackTypeEnum } from "@/domain/interview/feedback/enums";

export interface InterviewFeedbackRepository {
  save(feedback: InterviewFeedback): Promise<void>;

  findByAnswerId(answerId: string): Promise<InterviewFeedback | null>;

  findByAnswerIds(answerIds: string[]): Promise<InterviewFeedback[]>;

  findAllByAnswerId(answerId: string): Promise<InterviewFeedback[]>;

  findByAnswerIdAndType(
    answerId: string,
    type: FeedbackTypeEnum,
  ): Promise<InterviewFeedback | null>;
}

export const INTERVIEW_FEEDBACK_REPOSITORY: symbol = Symbol(
  "InterviewFeedbackRepository",
);
