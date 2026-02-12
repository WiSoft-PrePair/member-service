export type InterviewFeedbackContent = {
  strengths: string[];
  improvements: string[];
  recommendations: string[];
};

export type InterviewFeedbackType = {
  id: string;
  answerId: string;
  feedback: InterviewFeedbackContent;
  score: number;
  createdAt: Date;
};

export type CreateFeedbackRequest = {
  answerId: string;
  feedback: InterviewFeedbackContent;
  score: number;
};
