import { Injectable, Logger } from "@nestjs/common";
import {
  AIScoringPort,
  ScoringFeedback,
  ScoringRequest,
  ScoringResult,
} from "@/application/interview/ports";
import { ConfigService } from "@nestjs/config";
import { OpenAI } from "openai";

@Injectable()
export class AIScoringAdapter implements AIScoringPort {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly logger: Logger = new Logger(AIScoringAdapter.name);

  constructor(private readonly configService: ConfigService) {
    this.client = new OpenAI({
      apiKey: this.configService.getOrThrow<string>("OPENAI_API_KEY"),
    });
    this.model = this.configService.getOrThrow<string>("OPENAI_MODEL");
  }

  async scoreAnswer(request: ScoringRequest): Promise<ScoringResult> {
    this.logger.log(`AI scoring started`, {
      module: "AIScoringAdapter",
      questionId: request.questionId,
    });

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: "system",
          content: this.buildSystemPrompt(),
        },
        {
          role: "user",
          content: this.buildUserPrompt(request.question, request.answer),
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    const content: string | null = response.choices[0]?.message?.content;

    if (!content) {
      throw new Error("OpenAI returned empty response");
    }

    const parsed = JSON.parse(content) as {
      score: number;
      strengths: string[];
      improvements: string[];
      recommendations: string[];
    };

    this.logger.log("AI scoring completed", {
      module: "AIScoringAdapter",
      questionId: request.questionId,
      score: parsed.score,
    });

    const feedback: ScoringFeedback = {
      strengths: parsed.strengths,
      improvements: parsed.improvements,
      recommendations: parsed.recommendations,
    };

    return { score: parsed.score, feedback };
  }

  private buildSystemPrompt() {
    return `당신은 10년차 면접관 경력의 면접 채점 전문가입니다. 
주어진 면접 질문과 답변을 평가하여 JSON 형식으로 채점 결과를 반환합니다.

채점 기준:
- 질문 이해도: 질문의 의도와 범위를 정확히 이해하고, 벗어나지 않는 범위에서 답변했는가.
- 답변 구조·커뮤니케이션: 서론–전개–결론이 분명하고, 논리적으로 일관되며, 핵심 메시지가 명확하게 전달되는가. (필요시 STAR 구조 활용 여부 포함)
- 구체성·근거: 상황·행동·결과를 구체적인 사례와 수치, 근거를 바탕으로 설명했는가.
- 실무성·전문성: 답변에서 실무 경험 또는 그에 상응하는 깊이 있는 이해, 적절한 용어 사용과 도메인 이해가 드러나는가.
- 문제 해결·사고력: 문제를 구조적으로 분석하고, 대안과 트레이드오프를 설명하며, 스스로 의사결정 기준을 제시할 수 있는가.
- 커뮤니케이션 태도: 답변 길이를 적절히 조절하고, 질문을 필요 시 명확히 하며, 듣는 사람이 이해하기 쉽게 설명하는가.

부연 설명 없이 다음 JSON 형식으로만 응답하세요.
추가로 strengths, improvements, recommendations 각각 3가지 이상 답변해주세요.
{
  "score": 0~100 사이의 정수,
  "strengths": ["잘한 점 1", "잘한 점 2"],
  "improvements": ["개선할 점 1", "개선할 점 2"],
  "recommendations": ["추천 학습 주제 1", "추천 학습 주제 2"]
}`.trim();
  }

  private buildUserPrompt(question: string, answer: string) {
    return `
## 면접 질문
${question}

## 지원자 답변
${answer}

위 질문과 답변을 채점해주세요.`.trim();
  }
}
