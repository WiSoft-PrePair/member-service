import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from "@nestjs/common";
import { InterviewService } from "@/application/interview/service/interview.service";
import { InterviewAnswerService } from "@/application/interview/service/interview-answer.service";
import { CurrentUser } from "@/adapter/shared/api/decorators/current-user.decorator";
import type { User } from "@/adapter/shared/api/types/user";
import { InterviewQuestion } from "@/domain/interview/question";
import { InterviewQuestionScheduler } from "@/application/interview/service/interview-question-scheduler";
import { Public } from "@/adapter/shared/api/decorators/public.decorator";
import { SubmitAnswerDto } from "@/adapter/interview/api/dto/submit-answer.dto";
import { InterviewAnswer } from "@/domain/interview/answer";
import { InterviewFeedback } from "@/domain/interview/feedback";

@Controller("api/interview")
export class InterviewController {
  constructor(
    private readonly interviewService: InterviewService,
    private readonly interviewAnswerService: InterviewAnswerService,
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

  @Post("answer")
  async submitAnswer(@CurrentUser() user: User, @Body() dto: SubmitAnswerDto) {
    const result = await this.interviewAnswerService.submitAnswer(
      user.memberId,
      dto.questionId,
      dto.answer,
      dto.answerType,
      dto.mediaUrl,
    );
    return result;
  }

  @Get(":questionId/answers")
  async getAnswers(
    @CurrentUser() user: User,
    @Param("questionId") questionId: string,
  ) {
    const answers: InterviewAnswer[] =
      await this.interviewAnswerService.getAnswerByQuestion(questionId);

    const answerIds: string[] = answers.map((a) => a.id);
    const feedbacks: InterviewFeedback[] =
      await this.interviewAnswerService.getFeedbacksByAnswerIds(answerIds);

    const feedbackMap = new Map(feedbacks.map((f) => [f.answerId, f]));

    return {
      answers: answers.map((a) => {
        const fb: InterviewFeedback | undefined = feedbackMap.get(a.id);
        return {
          id: a.id,
          answer: a.answer,
          answerType: a.answerType,
          mediaUrl: a.mediaUrl,
          createdAt: a.createdAt,
          feedback: fb
            ? {
                score: fb.score,
                strengths: fb.feedback.strengths,
                improvements: fb.feedback.improvements,
                recommendations: fb.feedback.recommendations,
              }
            : null,
        };
      }),
    };
  }
}
