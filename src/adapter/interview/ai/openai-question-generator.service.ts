import { Injectable } from "@nestjs/common";
import {
  AIQuestionGenerator,
  GeneratedQuestion,
} from "@/application/interview/ports";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class OpenaiQuestionGeneratorService implements AIQuestionGenerator {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.getOrThrow<string>("OPENAI_API_KEY");
    this.model = this.configService.getOrThrow<string>("OPENAI_MODEL");
  }

  async generateQuestions(
    job: string,
    count?: number,
  ): Promise<GeneratedQuestion> {
    // const prompt: string = this.buildPrompt(job, count);
    //
    // const reponse = await
  }

  private buildPrompt(job: string, count: number = 1) {
    return `
10년차 실무 면접관의 입장에서 면접 질문을 생성해주세요.

직업: ${job}
질문 개수: ${count}

질문은 실제 업무에서 마주할 수 있는 상황을 바탕으로 하며,
하루에 하나씩 연습하기 좋은 면접 문제 형태로 작성해주세요.
답변 이후에는 생각을 더 확장해볼 수 있는 여지가 있어야 합니다.

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
