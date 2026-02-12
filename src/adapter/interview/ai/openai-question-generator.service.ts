import { Injectable, Logger } from "@nestjs/common";
import {
  AIQuestionGenerator,
  GeneratedQuestion,
} from "@/application/interview/ports";
import { ConfigService } from "@nestjs/config";
import { OpenAI } from "openai";
import { QuestionTypeEnum } from "@/domain/interview/question/enums";

@Injectable()
export class OpenaiQuestionGeneratorService implements AIQuestionGenerator {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly logger: Logger = new Logger(
    OpenaiQuestionGeneratorService.name,
  );

  constructor(private readonly configService: ConfigService) {
    this.client = new OpenAI({
      apiKey: this.configService.getOrThrow<string>("OPENAI_API_KEY"),
    });
    this.model = this.configService.getOrThrow<string>("OPENAI_MODEL");
  }

  async generateQuestions(
    job: string,
    count: number = 1,
  ): Promise<GeneratedQuestion[]> {
    const prompt: string = this.buildPrompt(job, count);

    this.logger.log("Interview Question generate started", {
      module: "OpenaiQuestionGeneratorService",
      job,
      count,
    });

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: "system",
          content:
            "You are an expert interview. Always respond in valid JSON only.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.8,
    });

    const content: string | null = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI returned Error response");
    }

    const parsed = JSON.parse(content) as {
      questions: Array<{ question: string; questionTag: string }>;
    };

    this.logger.log("Interview Question generate completed", {
      module: "OpenaiQuestionGeneratorService",
      job,
      count,
    });

    return parsed.questions.map((q) => ({
      question: q.question,
      questionType: QuestionTypeEnum.TEXT,
      questionTag: q.questionTag,
    }));
  }

  private buildPrompt(job: string, count: number = 1) {
    return `
10년차 실무 면접관의 입장에서 면접 질문을 생성해주세요.

직업: ${job}
질문 개수: ${count}

질문은 다음 원칙을 따릅니다:

1. "${job}" 직무에 실제로 필요한 역량과 상황을 기반으로 질문합니다.
     해당 직무의 핵심 업무, 필요 역량, 실무 환경을 고려하세요.

2. 다음 유형을 균형 있게 포함합니다:
     - 직무 전문 지식 (해당 분야의 핵심 개념과 원리)
     - 실무 상황 판단 (업무 중 마주칠 수 있는 구체적 시나리오)
     - 문제 해결 (예상치 못한 상황에서의 대처와 의사결정)
     - 협업 및 커뮤니케이션 (팀워크, 갈등 해결, 이해관계자 소통)
     - 성장 및 경험 (실패 경험, 학습 방법, 개선 사례)

3. 특정 제품명, 브랜드명, 도구명을 직접 언급하지 마세요.
   대신 개념, 원리, 판단 기준을 물어보는 방식으로 작성합니다.

4. 질문은 하루에 하나씩 연습하기 좋은 "데일리 면접 문제" 형식으로 작성합니다.

5. 모든 질문은 답변 이후, "왜 그렇게 선택했는지", "다른 방법은 없었는지" 등 생각을 확장할 수 있는 여지가 있도록 설계합니다.

6. 난이도는 초급 / 중급 / 고급 중 하나로 무작위로 지정합니다.

부연 설명 없이 다음 JSON 형식으로만 응답하세요:
{
  "questions": [
    {
      "question": "면접 질문 내용",
      "questionTag": "태그 (예: 역량, 기술, 경험, 협업, 인성, 지원동기 등)"
    }
  ]
}`.trim();
  }
}
