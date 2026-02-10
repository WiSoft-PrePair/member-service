import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import {
  InterviewQuestionNotification,
  KAKAO_TOKEN_REFRESHER,
  type KakaoTokenRefresher,
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
    @Inject(KAKAO_TOKEN_REFRESHER)
    private readonly tokenRefresher: KakaoTokenRefresher,
  ) {}

  supports(channel: NotificationChannel): boolean {
    return channel === "kakao";
  }

  async send(
    recipient: {
      email?: string;
      kakaoAccessToken?: string;
      kakaoRefreshToken?: string;
      kakaoConnectionId?: string;
    },
    content: InterviewQuestionNotification,
  ): Promise<void> {
    if (!recipient.kakaoAccessToken) {
      this.logger.warn(`Kakao access token not available, skipping`, {
        module: "KakaoNotificationSender",
      });

      return;
    }

    const result = await this.sendKakaoMessage(
      recipient.kakaoAccessToken,
      content,
    );
    if (result === "success") return;

    if (result === "token_expired") {
      if (!recipient.kakaoRefreshToken || !recipient.kakaoConnectionId) {
        throw new UnauthorizedException();
      }

      try {
        const refreshResult = await this.tokenRefresher.refreshToken(
          recipient.kakaoConnectionId,
          recipient.kakaoRefreshToken,
        );

        const retryResult = await this.sendKakaoMessage(
          refreshResult.accessToken,
          content,
        );

        if (retryResult === "success") return;

        throw new UnauthorizedException();
      } catch (error) {
        if (error instanceof Error) throw error;
        this.logger.warn("Kakao token refresh failed", {
          error: (error as Error).message,
        });
        throw new UnauthorizedException();
      }
    }
  }

  private async sendKakaoMessage(
    accessToken: string,
    content: InterviewQuestionNotification,
  ): Promise<"success" | "token_expired" | "error"> {
    const response: Response = await fetch(
      "https://kapi.kakao.com/v2/api/talk/memo/default/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
        },
        body: new URLSearchParams({
          template_object: JSON.stringify(this.buildTextTemplate(content)),
        }),
      },
    );

    if (response.ok) return "success";

    const error: any = await response.json();

    if (error.code === -401) return "token_expired";

    this.logger.error(
      "Kakao notification failed",
      new Error(JSON.stringify(error)),
      {},
    );

    return "error";
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
