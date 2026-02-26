export type TranscriptionResult = {
  text: string;
  durationSeconds: number;
};

export interface STTPort {
  transcribe(audio: Buffer, format: string): Promise<TranscriptionResult>;
}

export const STT_PORT: symbol = Symbol("STTPort");
