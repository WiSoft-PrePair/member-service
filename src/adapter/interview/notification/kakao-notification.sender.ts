import { Inject, Injectable } from "@nestjs/common";
import {
  InterviewQuestionNotification,
  NotificationChannel,
  NotificationSender,
} from "@/application/interview/ports";
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";

@Injectable()
export class KakaoNotificationSender implements NotificationSender {
  readonly channel: NotificationChannel = "kakao";

  constructor(
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  supports(channel: NotificationChannel): boolean {
    return channel === "kakao";
  }

  async send(
    recipient: { kakaoAccessToken?: string },
    content: InterviewQuestionNotification,
  ): Promise<void> {
    if (!recipient.kakaoAccessToken) {
      this.logger.warn(`Kakao access token not available, skipping`, {
        module: "KakaoNotificationSender",
      });

      return;
    }

    const response: Response = await fetch(
      "https://kapi.kakao.com/v2/api/talk/memo/default/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${recipient.kakaoAccessToken}`,
          "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
        },
        body: new URLSearchParams({
          template_object: JSON.stringify(this.buildTextTemplate(content)),
        }),
      },
    );

    if (!response.ok) {
      const error: any = await response.json();

      if (error.code === -401) {
        this.logger.warn("Kakao token expired", {
          module: "KakaoNotificationSender",
          errorCode: error.code,
        });

        return;
      }

      this.logger.error(
        "Kakao notification failed",
        new Error(JSON.stringify(error)),
        {
          module: "KakaoNotificationSender",
          errorCode: error.code,
        },
      );
      throw new Error(`Kakao notification failed: ${error.msg}`);
    }

    this.logger.log("Kakao notification sent", {
      module: "KakaoNotificationSender",
    });
  }

  private buildTextTemplate(content: InterviewQuestionNotification) {
    const header = `${content.recipientName}님, 오늘의 면접 질문\n\n`;
    const maxQuestionLength = 200 - header.length;
    const question =
      content.question.length > maxQuestionLength
        ? `${content.question.slice(0, maxQuestionLength - 3)}...`
        : content.question;

    return {
      object_type: "text",
      text: `${header}${question}`,
      link: {
        web_url: "https://prepair.wisoft.dev",
        mobile_web_url: "https://prepair.wisoft.dev",
      },
      buttons: [
        {
          title: "답변하러 가기",
          link: {
            web_url: "https://prepair.wisoft.dev",
            mobile_web_url: "https://prepair.wisoft.dev",
          },
        },
      ],
    };
  }
}
