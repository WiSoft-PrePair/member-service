import { Module } from "@nestjs/common";
import { InterviewController } from "@/adapter/interview/api/interview.controller";
import { InterviewService } from "@/application/interview/service/interview.service";
import { INTERVIEW_QUESTION_REPOSITORY } from "@/domain/interview/question";
import { InterviewQuestionPrismaRepository } from "@/adapter/interview/persistence/interview-question-prisma.repository";
import {
  AI_QUESTION_GENERATOR,
  AI_SCORING_PORT,
  KAKAO_TOKEN_REFRESHER,
  MEMBER_POINT_UPDATE,
  NOTIFICATION_RECIPIENT_FINDER,
  NOTIFICATION_SENDER,
} from "@/application/interview/ports";
import { OpenaiQuestionGeneratorService } from "@/adapter/interview/ai/openai-question-generator.service";
import { InterviewNotificationService } from "@/application/interview/service/interview-notification.service";
import { InterviewQuestionScheduler } from "@/application/interview/service/interview-question-scheduler";
import { EmailNotificationSender } from "@/adapter/interview/notification/email-notification.sender";
import { KakaoNotificationSender } from "@/adapter/interview/notification/kakao-notification.sender";
import { NotificationRecipientFinderImpl } from "@/adapter/interview/notification/notification-recipient-finder.impl";
import { OAuthModule } from "@/adapter/oauth/oauth.module";
import { KakaoTokenRefresherImpl } from "@/adapter/interview/notification/kakao-token-refresher.impl";
import { InterviewAnswerService } from "@/application/interview/service/interview-answer.service";
import { INTERVIEW_ANSWER_REPOSITORY } from "@/domain/interview/answer";
import { InterviewAnswerPrismaRepository } from "@/adapter/interview/persistence/interview-answer-prisma.repository";
import { AIScoringAdapter } from "@/adapter/interview/ai/ai-scoring.adapter";
import { MemberPointUpdateAdapter } from "@/adapter/interview/ai/member-point-update.adapter";

@Module({
  imports: [OAuthModule],
  controllers: [InterviewController],
  providers: [
    InterviewService,
    InterviewAnswerService,
    InterviewNotificationService,
    InterviewQuestionScheduler,
    EmailNotificationSender,
    KakaoNotificationSender,
    {
      provide: INTERVIEW_QUESTION_REPOSITORY,
      useClass: InterviewQuestionPrismaRepository,
    },
    {
      provide: INTERVIEW_ANSWER_REPOSITORY,
      useClass: InterviewAnswerPrismaRepository,
    },
    {
      provide: AI_QUESTION_GENERATOR,
      useClass: OpenaiQuestionGeneratorService,
    },
    {
      provide: AI_SCORING_PORT,
      useClass: AIScoringAdapter,
    },
    {
      provide: MEMBER_POINT_UPDATE,
      useClass: MemberPointUpdateAdapter,
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
    {
      provide: KAKAO_TOKEN_REFRESHER,
      useClass: KakaoTokenRefresherImpl,
    },
  ],
})
export class InterviewModule {}
