import { Inject, Injectable } from "@nestjs/common";
import {
  InterviewQuestionNotification,
  NotificationChannel,
  NotificationSender,
} from "@/application/interview/ports";
import { createTransport, Transporter } from "nodemailer";
import { ConfigService } from "@nestjs/config";
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";

@Injectable()
export class EmailNotificationSender implements NotificationSender {
  readonly channel: NotificationChannel = "email";
  private transport: Transporter;

  constructor(
    private readonly configService: ConfigService,
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {
    this.transport = createTransport({
      host: this.configService.get("SMTP_HOST", "smtp.gmail.com"),
      port: this.configService.get("SMTP_PORT", 587),
      secure: false,
      auth: {
        user: this.configService.get("SMTP_USER"),
        pass: this.configService.get("SMTP_PASS"),
      },
    });
  }

  supports(channel: NotificationChannel): boolean {
    return channel === "email";
  }

  async send(
    recipient: { email?: string },
    content: InterviewQuestionNotification,
  ): Promise<void> {
    if (!recipient.email) {
      throw new Error(`Email is required for email notification`);
    }

    await this.transport.sendMail({
      from: this.configService.get("SMTP_FROM", "noreply@prepair.com"),
      to: recipient.email,
      subject: "💌 [PrePair] 오늘의 면접 질문이 도착했어요! 💌",
      html: this.buildEmailTemplate(content),
    });

    this.logger.log("Email notification sent", {
      module: "EmailNotificationSender",
      email: recipient.email,
    });
  }

  private buildEmailTemplate(content: InterviewQuestionNotification): string {
    return `
    <!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background-color:#f6f8fa;">
  <table width="100%" cellpadding="0" cellspacing="0" style="font-family: 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif; background-color:#f6f8fa; padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:12px; padding:40px; box-shadow:0 4px 12px rgba(0,0,0,0.05);">
          <!-- 로고 -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <img src="https://prepair.wisoft.dev/assets/logo-EOf_Dr2C.png" alt="PrePair" width="120" />
            </td>
          </tr>

          <!-- 인사말 -->
          <tr>
            <td align="center" style="font-size:24px; font-weight:700; color:#1a1a1a; padding-bottom:8px;">
              ${content.recipientName}님, 오늘의 면접 질문이에요!
            </td>
          </tr>

          <tr>
            <td align="center" style="font-size:14px; color:#666666; padding-bottom:32px;">
              매일 꾸준히 면접 준비하는 당신을 응원합니다 :)
            </td>
          </tr>

          <!-- 질문 카드 -->
          <tr>
            <td style="padding:24px; background:linear-gradient(135deg, #f0f4ff 0%, #e8f0fe 100%); border-radius:12px;">
              <!-- 태그 -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom:16px;">
                    <span style="display:inline-block; background:#405173; color:white; padding:6px 16px; border-radius:20px; font-size:13px; font-weight:600;">
                      #${content.questionTag}
                    </span>
                  </td>
                </tr>
              </table>

              <!-- 질문 -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="font-size:18px; color:#1a1a1a; line-height:1.7; padding:0 16px;">
                    "${content.question}"
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA 버튼 -->
          <tr>
            <td align="center" style="padding-top:32px;">
              <a href="https://prepair.wisoft.dev"
                 style="display:inline-block; background:#405173; color:white; padding:14px 32px; border-radius:8px; text-decoration:none; font-weight:600; font-size:16px;">
                답변하러 가기
              </a>
            </td>
          </tr>

          <!-- 푸터 -->
          <tr>
            <td align="center" style="padding-top:40px; font-size:12px; color:#999999;">
              이 메일은 PrePair 알림 설정에 따라 발송되었습니다.<br/>
              알림 설정은 마이페이지에서 변경할 수 있습니다.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }
}
