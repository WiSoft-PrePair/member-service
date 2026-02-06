import { Inject, Injectable } from "@nestjs/common";
import {
  InterviewQuestionNotification,
  NOTIFICATION_RECIPIENT_FINDER,
  NOTIFICATION_SENDER,
  NotificationChannel,
  NotificationRecipient,
  type NotificationRecipientFinder,
  type NotificationSender,
} from "@/application/interview/ports";
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";
import { InterviewService } from "@/application/interview/service/interview.service";
import { FrequencyEnum, NotificationEnum } from "@/domain/member";

@Injectable()
export class InterviewNotificationService {
  constructor(
    @Inject(NOTIFICATION_SENDER)
    private readonly notificationSenders: NotificationSender[],
    @Inject(NOTIFICATION_RECIPIENT_FINDER)
    private readonly notificationRecipientFinder: NotificationRecipientFinder,
    @Inject(LOGGER)
    private readonly logger: ILogger,
    private readonly interviewService: InterviewService,
  ) {}

  async sendDailyInterviewQuestions(): Promise<void> {
    const recipients: NotificationRecipient[] =
      await this.notificationRecipientFinder.findEligibleRecipients(
        FrequencyEnum.EVERY,
      );

    this.logger.log("Starting daily interview notification", {
      module: "InterviewNotificationService",
      recipientCount: recipients.length,
    });

    for (const recipient of recipients) {
      await this.sendToRecipient(recipient);
    }

    this.logger.log("Daily interview notification completed", {
      module: "InterviewNotificationService",
    });
  }

  async sendWeeklyInterviewQuestions(): Promise<void> {
    const recipients: NotificationRecipient[] =
      await this.notificationRecipientFinder.findEligibleRecipients(
        FrequencyEnum.WEEKLY,
      );

    this.logger.log("Starting weekly interview notification", {
      module: "InterviewNotificationService",
      recipientCount: recipients.length,
    });

    for (const recipient of recipients) {
      await this.sendToRecipient(recipient);
    }

    this.logger.log("Weekly interview notification completed", {
      module: "InterviewNotificationService",
    });
  }

  private async sendToRecipient(
    recipient: NotificationRecipient,
  ): Promise<void> {
    try {
      const [question] = await this.interviewService.generateQuestion(
        recipient.memberId,
        recipient.job,
        1,
      );

      const content: InterviewQuestionNotification = {
        question: question.question,
        questionTag: question.questionTag,
        recipientName: recipient.nickname,
      };

      await this.sendByNotificationPreference(recipient, content);

      this.logger.log("Notification sent successfully", {
        module: "InterviewNotificationService",
        memberId: recipient.memberId,
        notification: recipient.notification,
      });

    } catch (error) {
      this.logger.error("Failed to send notification", error as Error, {
        module: "InterviewNotificationService",
        memberId: recipient.memberId,
      });
    }
  }

  private async sendByNotificationPreference(
    recipient: NotificationRecipient,
    content: InterviewQuestionNotification,
  ): Promise<void> {
    const channelsToSend: NotificationChannel[] = this.getChannelsToSend(
      recipient.notification,
    );

    const sendPromises = channelsToSend.map((channel) => {
      const sender: NotificationSender | undefined =
        this.notificationSenders.find((s) => s.supports(channel));

      if (!sender) {
        this.logger.warn(`No sender found for channel: ${channel}`, {
          module: "InterviewNotificationService",
        });
        return Promise.resolve();
      }

      return sender.send(
        {
          email: recipient.email,
          kakaoAccessToken: recipient.kakaoAccessToken,
        },
        content,
      );
    });

    await Promise.allSettled(sendPromises);
  }

  private getChannelsToSend(
    notification: NotificationEnum,
  ): NotificationChannel[] {
    switch (notification) {
      case NotificationEnum.EMAIL:
        return ["email"];
      case NotificationEnum.KAKAO:
        return ["kakao"];
      case NotificationEnum.BOTH:
        return ["email", "kakao"];
      default:
        return [];
    }
  }
}
