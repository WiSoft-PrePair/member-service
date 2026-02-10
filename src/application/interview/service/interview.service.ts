import { Inject, Injectable } from "@nestjs/common";
import {
  INTERVIEW_QUESTION_REPOSITORY,
  InterviewQuestion,
  type InterviewQuestionRepository,
} from "@/domain/interview/question";
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";
import {
  AI_QUESTION_GENERATOR,
  type AIQuestionGenerator,
  GeneratedQuestion,
}                           from "@/application/interview/ports";
import { QuestionTypeEnum } from "@/domain/interview/question/enums";

@Injectable()
export class InterviewService {
  constructor(
    @Inject(INTERVIEW_QUESTION_REPOSITORY)
    private readonly questionRepository: InterviewQuestionRepository,
    @Inject(LOGGER)
    private readonly logger: ILogger,
    @Inject(AI_QUESTION_GENERATOR)
    private readonly aiQuestionGenerator: AIQuestionGenerator,
  ) {}

  async generateQuestion(
    userId: string,
    job: string,
    count: number = 1,
  ): Promise<InterviewQuestion[]> {
    const generatedQuestions: GeneratedQuestion[] =
      await this.aiQuestionGenerator.generateQuestions(job, count);

    const questions: InterviewQuestion[] = generatedQuestions.map((gquestion) =>
      InterviewQuestion.createQuestion({
        userId,
        question: gquestion.question,
        questionType: QuestionTypeEnum.TEXT,
        questionTag: gquestion.questionTag,
      }),
    );

    for (const question of questions) {
      await this.questionRepository.save(question);
    }

    this.logger.log("AI interview questions generated", {
      module: "InterviewService",
      userId,
      job,
    });

    return questions;
  }
}
