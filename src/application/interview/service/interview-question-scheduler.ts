import { Inject, Injectable } from "@nestjs/common";
import { InterviewNotificationService } from "@/application/interview/service/interview-notification.service";
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";
import { Cron } from "@nestjs/schedule";

@Injectable()
export class InterviewQuestionScheduler {
  constructor(
    private readonly notificationService: InterviewNotificationService,
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  // @Cron("0 30 8 * * 1-5", {
  //   name: "daily-interview-questions",
  //   timeZone: "Asia/Seoul",
  // })
  async handleDailyNotification(): Promise<void> {
    this.logger.log(`Daily interview question scheduler triggered`, {
      module: "InterviewQuestionScheduler",
      timestamp: new Date().toISOString(),
    });

    try {
      await this.notificationService.sendDailyInterviewQuestions();
    } catch (error) {
      this.logger.error(`Daily notification schedular failed`, error as Error, {
        module: "InterviewQuestionScheduler",
      });
    }
  }

  // @Cron("0 30 8 * * 1", {
  //   name: "weekly-interview-questions",
  //   timeZone: "Asia/Seoul",
  // })
  async handleWeeklyNotification(): Promise<void> {
    this.logger.log(`Daily interview question scheduler triggered`, {
      module: "InterviewQuestionScheduler",
      timestamp: new Date().toISOString(),
    });

    try {
      await this.notificationService.sendWeeklyInterviewQuestions();
    } catch (error) {
      this.logger.error(
        `Weekly notification schedular failed`,
        error as Error,
        {
          module: "InterviewQuestionScheduler",
        },
      );
    }
  }
}
