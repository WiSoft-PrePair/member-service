export type ExtractedFrames = {
  frames: Buffer[];
  totalFrames: number;
};

export type ExtractedAudio = {
  audio: Buffer;
  format: string;
  durationSeconds: number;
};

export interface VideoProcessingPort {
  extractFrames(videoBuffer: Buffer, fps?: number): Promise<ExtractedFrames>;
  extractAudio(videoBuffer: Buffer): Promise<ExtractedAudio>;
}

export const VIDEO_PROCESSING_PORT: symbol = Symbol("VideoProcessingPort");
