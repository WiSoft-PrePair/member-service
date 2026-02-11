export type ScoringRequest = {
  questionId: string;
  question: string;
  answer: string;
};

export type ScoringResult = {
  score: number;
  feedback?: string;
};

export interface AIScoringPort {
  scoreAnswer(request: ScoringRequest): Promise<ScoringResult>;
}

export const AI_SCORING_PORT: symbol = Symbol("AIScoringPort");
