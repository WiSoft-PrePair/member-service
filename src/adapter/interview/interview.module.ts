import { Module } from "@nestjs/common";
import { InterviewController } from "@/adapter/interview/api/interview.controller";
import { InterviewService } from "@/application/interview/interview.service";
import { INTERVIEW_QUESTION_REPOSITORY } from "@/domain/interview/question";
import { InterviewQuestionPrismaRepository } from "@/adapter/interview/persistence/interview-question-prisma.repository";
import { AI_QUESTION_GENERATOR } from "@/application/interview/ports";
import { OpenaiQuestionGeneratorService } from "@/adapter/interview/ai/openai-question-generator.service";

@Module({
  controllers: [InterviewController],
  providers: [
    InterviewService,
    {
      provide: INTERVIEW_QUESTION_REPOSITORY,
      useClass: InterviewQuestionPrismaRepository,
    },
    {
      provide: AI_QUESTION_GENERATOR,
      useClass: OpenaiQuestionGeneratorService,
    },
  ],
})
export class InterviewModule {}
