import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OpenAI } from "openai";
import {
  OverallFeedbackPort,
  OverallFeedbackRequest,
  OverallFeedbackResult,
} from "@/application/interview/ports/overall-feedback.port";

@Injectable()
export class OverallFeedbackAdapter implements OverallFeedbackPort {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly logger: Logger = new Logger(OverallFeedbackAdapter.name);

  constructor(private readonly configService: ConfigService) {
    this.client = new OpenAI({
      apiKey: this.configService.getOrThrow<string>("OPENAI_API_KEY"),
    });
    this.model = this.configService.getOrThrow<string>("OPENAI_MODEL");
  }

  async generateOverallFeedback(
    request: OverallFeedbackRequest,
  ): Promise<OverallFeedbackResult> {
    this.logger.log("Overall feedback generation started");

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: this.buildSystemPrompt() },
        { role: "user", content: this.buildUserPrompt(request) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI returned empty response");
    }

    const parsed = JSON.parse(content) as OverallFeedbackResult;

    this.logger.log("Overall feedback generation completed", {
      module: "OverallFeedbackAdapter",
      overallScore: parsed.overallScore,
    });

    return parsed;
  }

  private buildSystemPrompt(): string {
    return `당신은 10년차 면접 코칭 전문가입니다.
면접 답변 내용 피드백과 표정 분석 결과를 종합하여 최종 피드백을 생성합니다.

부연 설명 없이 다음 JSON 형식으로만 응답하세요:
{
  "overallScore": 0~100,
  "summary": "종합 피드백 요약",
  "strengths": ["강점1", "강점2", "강점3"],
  "improvements": ["개선점1", "개선점2", "개선점3"],
  "recommendations": ["추천1", "추천2", "추천3"]
}`.trim();
  }

  private buildUserPrompt(request: OverallFeedbackRequest): string {
    return `
## 면접 질문
${request.question}

## 답변 내용 피드백 (점수: ${request.contentFeedback.score}/100)
- 강점: ${request.contentFeedback.strengths.join(", ")}
- 개선점: ${request.contentFeedback.improvements.join(", ")}

## 표정 분석 피드백 (점수: ${request.expressionFeedback.score}/100)
- 요약: ${request.expressionFeedback.summary}
- 추천: ${request.expressionFeedback.recommendations.join(", ")}

위 두 가지 피드백을 종합하여 최종 면접 피드백을 생성해주세요.`.trim();
  }
}
