import { FeedbackTypeEnum } from "@/domain/interview/feedback/enums";

export type InterviewFeedbackContent = {
  strengths: string[];
  improvements: string[];
  recommendations: string[];
};

export type ExpressionFeedbackContent = {
  emotionSummary: string;
  emotionTimeline: {
    timestamp: unknown;
    emotion: string;
    detail: string;
  }[];
  eyeContactScore: number;
  confidenceScore: number;
  recommendations: string[];
};

export type OverallFeedbackContent = {
  summary: string;
  contentScore: number;
  expressionScore: number;
  overallScore: number;
  strengths: string[];
  improvements: string[];
  recommendations: string[];
};

export type InterviewFeedbackType = {
  id: string;
  answerId: string;
  feedbackType: FeedbackTypeEnum;
  feedback:
    | InterviewFeedbackContent
    | ExpressionFeedbackContent
    | OverallFeedbackContent;
  score: number;
  createdAt: Date;
};

export type CreateFeedbackRequest = {
  answerId: string;
  feedbackType?: FeedbackTypeEnum;
  feedback:
    | InterviewFeedbackContent
    | ExpressionFeedbackContent
    | OverallFeedbackContent;
  score: number;
};
