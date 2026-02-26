export type OverallFeedbackRequest = {
  question: string;
  contentFeedback: {
    score: number;
    strengths: string[];
    improvements: string[];
    recommendations: string[];
  };
  expressionFeedback: {
    score: number;
    summary: string;
    recommendations: string[];
  };
};

export type OverallFeedbackResult = {
  overallScore: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  recommendations: string[];
};

export interface OverallFeedbackPort {
  generateOverallFeedback(
    request: OverallFeedbackRequest,
  ): Promise<OverallFeedbackResult>;
}

export const OVERALL_FEEDBACK_PORT: symbol = Symbol("OverallFeedbackPort");
