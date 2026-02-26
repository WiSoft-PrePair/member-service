import { Injectable, Logger } from "@nestjs/common";
import {
  ExpressionAnalysisResult,
  FacialExpressionAnalysisPort,
  FrameExpressionResult,
} from "@/application/interview/ports";
import { OpenAI } from "openai";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class FacialExpressionAnalysisAdapter implements FacialExpressionAnalysisPort {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly logger: Logger = new Logger(
    FacialExpressionAnalysisAdapter.name,
  );

  private readonly SAMPLE_INTERVAL = 5;

  constructor(private readonly configService: ConfigService) {
    this.client = new OpenAI({
      apiKey: this.configService.getOrThrow<string>("OPENAI_API_KEY"),
    });
    this.model = this.configService.getOrThrow<string>("OPENAI_MODEL");
  }

  async analyzeFrames(frames: Buffer[]): Promise<ExpressionAnalysisResult> {
    this.logger.log("Facial expression analysis started", {
      module: "FacialExpressionAnalysisAdapter",
      totalFrames: frames.length,
    });

    const sampledFrames: { index: number; buffer: Buffer }[] = [];
    for (let i = 0; i < frames.length; i += this.SAMPLE_INTERVAL) {
      sampledFrames.push({ index: i, buffer: frames[i] });
    }

    const imageContents: OpenAI.Chat.Completions.ChatCompletionContentPart[] =
      sampledFrames.map(({ index, buffer }) => ({
        type: "image_url" as const,
        image_url: {
          url: `data:image/jpeg;base64,${buffer.toString("base64")}`,
          detail: "low" as const,
        },
      }));

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: "system",
          content: this.buildSystemPrompt(),
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `면접 영상에서 ${this.SAMPLE_INTERVAL}초 간격으로 추출한 ${sampledFrames.length}개의 프레임입니다. 각 프레임의 표정을 분석해주세요.`,
            },
            ...imageContents,
          ],
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_completion_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI Vision returned empty response");
    }

    const parsed = JSON.parse(content) as {
      frames: {
        frameIndex: number;
        emotion: string;
        detail: string;
      }[];
      summary: string;
      eyeContactScore: number;
      confidenceScore: number;
      score: number;
      recommendations: string[];
    };

    const frameResults: FrameExpressionResult[] = parsed.frames.map(
      (f, idx) => ({
        frameIndex: sampledFrames[idx]?.index ?? idx,
        timestamp: (sampledFrames[idx]?.index ?? idx) * 1,
        emotion: f.emotion,
        detail: f.detail,
      }),
    );

    this.logger.log("Facial expression analysis completed", {
      module: "FacialExpressionAnalysisAdapter",
      score: parsed.score,
    });

    return {
      frameResults,
      summary: parsed.summary,
      eyeContactScore: parsed.eyeContactScore,
      confidenceScore: parsed.confidenceScore,
      score: parsed.score,
      recommendations: parsed.recommendations,
    };
  }

  private buildSystemPrompt(): string {
    return `당신은 면접 표정 분석 전문가입니다.
면접 중인 지원자의 표정 프레임들을 분석하여 JSON 형식으로 결과를 반환합니다.

분석 기준:
- 감정 상태: 자신감, 긴장, 편안함, 당황 등
- 시선 처리: 카메라(면접관)를 바라보고 있는지
- 자신감 수준: 표정과 자세에서 드러나는 자신감
- 전반적 인상: 면접관 입장에서의 종합적 인상

부연 설명 없이 다음 JSON 형식으로만 응답하세요:
{
  "frames": [
    { "frameIndex": 0, "emotion": "자신감 있음", "detail": "카메라를 정면으로 바라보며 자연스러운 미소" }
  ],
  "summary": "전반적인 표정 요약",
  "eyeContactScore": 0~100,
  "confidenceScore": 0~100,
  "score": 0~100,
  "recommendations": ["추천1", "추천2", "추천3"]
}`.trim();
  }
}
