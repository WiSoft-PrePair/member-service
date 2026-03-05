export type FrameExpressionResult = {
  frameIndex: number;
  timestamp: number;
  emotion: string;
  detail: string;
};

export type ExpressionAnalysisResult = {
  frameResults: FrameExpressionResult[];
  summary: string;
  eyeContactScore: number;
  confidenceScore: number;
  score: number;
  recommendations: string[];
};

export interface FacialExpressionAnalysisPort {
  analyzeFrames(frames: Buffer[]): Promise<ExpressionAnalysisResult>;
}

export const FACIAL_EXPRESSION_ANALYSIS_PORT: symbol = Symbol(
  "FacialExpressionAnalysisPort",
);
