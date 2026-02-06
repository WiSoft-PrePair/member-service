import { Module } from "@nestjs/common";
import { InterviewController } from "@/adapter/interview/api/interview.controller";
import { InterviewService } from "@/application/interview/service/interview.service";
import { INTERVIEW_QUESTION_REPOSITORY } from "@/domain/interview/question";
import { InterviewQuestionPrismaRepository } from "@/adapter/interview/persistence/interview-question-prisma.repository";
import {
  AI_QUESTION_GENERATOR,
  NOTIFICATION_RECIPIENT_FINDER,
  NOTIFICATION_SENDER,
} from "@/application/interview/ports";
import { OpenaiQuestionGeneratorService } from "@/adapter/interview/ai/openai-question-generator.service";
import { InterviewNotificationService } from "@/application/interview/service/interview-notification.service";
import { InterviewQuestionScheduler } from "@/application/interview/service/interview-question-scheduler";
import { EmailNotificationSender } from "@/adapter/interview/notification/email-notification.sender";
import { KakaoNotificationSender } from "@/adapter/interview/notification/kakao-notification.sender";
import { NotificationRecipientFinderImpl } from "@/adapter/interview/notification/notification-recipient-finder.impl";

@Module({
  controllers: [InterviewController],
  providers: [
    InterviewService,
    InterviewNotificationService,
    InterviewQuestionScheduler,
    EmailNotificationSender,
    KakaoNotificationSender,
    {
      provide: INTERVIEW_QUESTION_REPOSITORY,
      useClass: InterviewQuestionPrismaRepository,
    },
    {
      provide: AI_QUESTION_GENERATOR,
      useClass: OpenaiQuestionGeneratorService,
    },
    {
      provide: NOTIFICATION_SENDER,
      useFactory: (
        emailSender: EmailNotificationSender,
        kakaoSender: KakaoNotificationSender,
      ) => [emailSender, kakaoSender],
      inject: [EmailNotificationSender, KakaoNotificationSender],
    },
    {
      provide: NOTIFICATION_RECIPIENT_FINDER,
      useClass: NotificationRecipientFinderImpl,
    },
  ],
})
export class InterviewModule {}
