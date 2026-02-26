import { Injectable, Logger } from "@nestjs/common";
import { STTPort, TranscriptionResult } from "@/application/interview/ports";
import { OpenAI, toFile } from "openai";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class STTAdapter implements STTPort {
  private readonly client: OpenAI;
  private readonly logger: Logger = new Logger(STTAdapter.name);

  constructor(private readonly configService: ConfigService) {
    this.client = new OpenAI({
      apiKey: this.configService.getOrThrow<string>("OPENAI_API_KEY"),
    });
  }

  async transcribe(
    audio: Buffer,
    format: string,
  ): Promise<TranscriptionResult> {
    this.logger.log("STT transcription started", {
      module: "STTAdapter",
    });

    const file = await toFile(audio, `audio.${format}`, {
      type: `audio/${format}`,
    });

    const response = await this.client.audio.transcriptions.create({
      file,
      model: "gpt-4o-mini-transcribe",
      language: "ko",
      response_format: "verbose_json",
    });

    this.logger.log("STT transcription completed", {
      module: "STTAdapter",
      textLength: response.text.length,
    });

    return {
      text: response.text,
      durationSeconds: response.duration ?? 0,
    };
  }
}
