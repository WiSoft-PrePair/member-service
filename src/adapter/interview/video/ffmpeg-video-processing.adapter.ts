import { Injectable } from "@nestjs/common";
import {
  ExtractedAudio,
  ExtractedFrames,
  VideoProcessingPort,
} from "@/application/interview/ports";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import ffmpeg from "fluent-ffmpeg";
import { randomUUID } from "crypto";

@Injectable()
export class FfmpegVideoProcessingAdapter implements VideoProcessingPort {
  async extractFrames(
    videoBuffer: Buffer,
    fps?: number,
  ): Promise<ExtractedFrames> {
    const tmpDir: string = path.join(os.tmpdir(), `frames-${randomUUID()}`);
    const videoPath: string = path.join(
      os.tmpdir(),
      `video-${randomUUID()}.webm`,
    );

    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(videoPath, videoBuffer);

    try {
      await new Promise<void>((resolve, reject) => {
        ffmpeg(videoPath)
          .outputOptions([`-vf fps=${fps}`, "-f image2"])
          .output(path.join(tmpDir, "frame-%04d.jpg"))
          .on("end", () => resolve())
          .on("error", (err) => reject(err))
          .run();
      });

      const frameFiles = fs
        .readdirSync(tmpDir)
        .filter((file) => file.endsWith(".jpg"))
        .sort();

      const frames: Buffer[] = frameFiles.map((f) =>
        fs.readFileSync(path.join(tmpDir, f)),
      );

      return { frames, totalFrames: frames.length };
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      fs.rmSync(videoPath, { force: true });
    }
  }

  async extractAudio(videoBuffer: Buffer): Promise<ExtractedAudio> {
    const videoPath = path.join(os.tmpdir(), `video-${randomUUID()}.webm`);
    const audioPath = path.join(os.tmpdir(), `audio-${randomUUID()}.wav`);

    fs.writeFileSync(videoPath, videoBuffer);

    try {
      const durationSeconds = await this.getDuration(videoPath);

      await new Promise<void>((resolve, reject) => {
        ffmpeg(videoPath)
          .noVideo()
          .audioCodec("pcm_s16le")
          .audioFrequency(16000)
          .audioChannels(1)
          .output(audioPath)
          .on("end", () => resolve())
          .on("error", (err) => reject(err))
          .run();
      });

      const audio = fs.readFileSync(audioPath);

      return { audio, format: "wav", durationSeconds };
    } finally {
      fs.rmSync(videoPath, { force: true });
      fs.rmSync(audioPath, { force: true });
    }
  }

  private getDuration(videoPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err: Error | null, metadata) => {
        if (err) return reject(err);
        resolve(metadata.format.duration ?? 0);
      });
    });
  }
}
