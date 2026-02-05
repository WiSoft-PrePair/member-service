import { Body, Controller, Post } from "@nestjs/common";
import { InterviewService } from "@/application/interview/interview.service";
import { CurrentUser } from "@/adapter/shared/api/decorators/current-user.decorator";
import type { User } from "@/adapter/shared/api/types/user";
import { CreateQuestionDto } from "@/adapter/interview/api/dto";
import { InterviewQuestion } from "@/generated/prisma/client";

@Controller("api/interview")
export class InterviewController {
  constructor(private readonly interviewService: InterviewService) {}

  @Post("create-question")
  async createQuestion(
    @CurrentUser() user: User,
    @Body() dto: CreateQuestionDto,
  ) {
    const questions: InterviewQuestion[] =
      await this.interviewService.generateQuestion(
        user.memberId,
        dto.job,
        dto.count,
      );

    return {
      success: true,
      count: questions.length,
      questions: questions.map((q) => ({
        id: q.id,
        question: q.question,
        questionTag: q.questionTag,
        questionType: q.questionType,
        status: q.status,
        createdAt: q.createdAt,
      })),
    };
  }
}
