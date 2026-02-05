import { Injectable, Logger } from "@nestjs/common";
import {
  AIQuestionGenerator,
  GeneratedQuestion,
} from "@/application/interview/ports";
import { ConfigService } from "@nestjs/config";
import { OpenAI } from "openai";
import { QuestionTypeEnum } from "@/domain/interview/enums";

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

1. 질문은 실제 업무에서 마주할 수 있는 상황을 기반으로 하되,
   직무 특성에 따라 다음 유형을 균형 있게 포함합니다.
   - 실무 상황 판단 질문
   - 기술 / 이론 이해를 묻는 질문
   - 문제 해결 및 설계 사고를 확인하는 질문
   - 경험을 바탕으로 한 의사결정 질문

2. 개발자, 엔지니어 등 기술 직군의 경우  
   단순한 상황 설명보다는 **기술 선택 이유, 구조 설계, 트레이드오프**를
   자연스럽게 생각해볼 수 있는 질문을 포함합니다.

3. 질문은 하루에 하나씩 연습하기 좋은 “데일리 면접 문제” 형식으로 작성합니다.

4. 모든 질문은 답변 이후
   “왜 그렇게 선택했는지”, “다른 방법은 없었는지” 등
   생각을 확장할 수 있는 여지가 있도록 설계합니다.

5. 난이도는 초급 / 중급 / 고급 중 하나로 무작위로 지정합니다

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
