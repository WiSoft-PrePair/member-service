export type TranscriptionResult = {
  text: string;
  durationSeconds: number;
};

export interface STTPort {
  transcribe(audioBuffer: Buffer): Promise<TranscriptionResult>;
}

export const STT_PORT: symbol = Symbol("STTPort");
