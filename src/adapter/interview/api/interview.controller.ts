import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Post,
  Query,
} from "@nestjs/common";
import { InterviewService } from "@/application/interview/service/interview.service";
import { CurrentUser } from "@/adapter/shared/api/decorators/current-user.decorator";
import type { User } from "@/adapter/shared/api/types/user";
import { InterviewQuestion } from "@/generated/prisma/client";
import { InterviewQuestionScheduler } from "@/application/interview/service/interview-question-scheduler";
import { Public } from "@/adapter/shared/api/decorators/public.decorator";

@Controller("api/interview")
export class InterviewController {
  constructor(
    private readonly interviewService: InterviewService,
    private readonly scheduler: InterviewQuestionScheduler,
  ) {}

  @Get("question")
  async createQuestion(
    @CurrentUser() user: User,
    @Query("count", new DefaultValuePipe(1), ParseIntPipe) count: number,
  ) {
    const questions: InterviewQuestion[] =
      await this.interviewService.generateQuestion(
        user.memberId,
        user.job,
        count,
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

  @Public()
  @Post("trigger-every")
  async triggerDaily() {
    await this.scheduler.handleDailyNotification();
    return { success: true };
  }

  @Public()
  @Post("trigger-weekly")
  async triggerWeekly() {
    await this.scheduler.handleWeeklyNotification();
    return { success: true };
  }
}
