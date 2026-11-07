import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createTransport, type Transporter } from "nodemailer";
import { EmailService } from "@/application/member/service/email.service";
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";
import { EMAIL_LOGO_PNG_BASE64 } from "./email-logo";

const LOGO_CID = "prepair-logo";

@Injectable()
export class NodemailerService implements EmailService {
  private transporter: Transporter;

  constructor(
    private readonly configService: ConfigService,
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {
    this.transporter = createTransport({
      host: this.configService.get("SMTP_HOST", "smtp.gmail.com"),
      port: this.configService.get("SMTP_PORT", 587),
      secure: false,
      auth: {
        user: this.configService.get("SMTP_USER"),
        pass: this.configService.get("SMTP_PASS"),
      },
    });
  }

  async sendVerificationCode(email: string, code: string): Promise<void> {
    this.logger.log("Verification email send started", {
      module: "NodemailerService",
      email,
    });

    try {
      await this.transporter.sendMail({
        from: this.configService.get("SMTP_FROM", "noreply@prepair.com"),
        to: email,
        subject: `[PrePair] 인증번호 ${code}`,
        html: verificationEmailHtml(code),
        attachments: [
          {
            filename: "prepair.png",
            content: Buffer.from(EMAIL_LOGO_PNG_BASE64, "base64"),
            cid: LOGO_CID,
          },
        ],
        text: `PrePair 인증번호: ${code}\n5분 안에 입력해 주세요. 요청하지 않았다면 이 메일을 무시해 주세요.`,
      });

      this.logger.log("Verification email sent successfully", {
        module: "NodemailerService",
        email,
      });
    } catch (error) {
      this.logger.error(
        "Verification email send failed",
        error instanceof Error ? error : undefined,
        {
          module: "NodemailerService",
          email,
        },
      );
      throw error;
    }
  }
}

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', Pretendard, 'Noto Sans KR', 'Malgun Gothic', sans-serif";

/** 인증번호 메일: 웹(라이트 테마)과 같은 색 — 글자 #111, 보조 #6b7684, 선 #e3e7ec, 포인트 #3182f6 */
function verificationEmailHtml(code: string): string {
  return `<!doctype html>
<html lang="ko">
<body style="margin:0; padding:0; background:#f7f8fa;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8fa; padding:48px 16px; font-family:${FONT};">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px; background:#ffffff; border-radius:24px; padding:44px 36px 40px;">
          <tr>
            <td style="padding-bottom:32px;">
              <img src="cid:${LOGO_CID}" alt="PREPAIR" width="112" height="25" style="display:block; border:0; outline:none; font-size:18px; font-weight:700; color:#111111;" />
            </td>
          </tr>
          <tr>
            <td style="font-size:24px; font-weight:700; line-height:1.4; color:#111111; letter-spacing:-0.4px;">인증번호를 알려 드릴게요</td>
          </tr>
          <tr>
            <td style="padding-top:8px; font-size:15px; line-height:1.6; color:#6b7684; word-break:keep-all;">아래 6자리 숫자를 PrePair 화면에 입력해 주세요.</td>
          </tr>
          <tr>
            <td style="padding-top:28px;">
              <div style="background:#f2f4f6; border-radius:16px; padding:22px 0 22px 10px; text-align:center; font-size:34px; font-weight:700; letter-spacing:10px; color:#111111; font-variant-numeric:tabular-nums;">${code}</div>
            </td>
          </tr>
          <tr>
            <td style="padding-top:16px; font-size:14px; line-height:1.6; color:#6b7684;">인증번호는 <span style="color:#3182f6; font-weight:600;">5분</span> 동안 쓸 수 있어요.</td>
          </tr>
          <tr>
            <td style="padding-top:32px; border-bottom:1px solid #e3e7ec;"></td>
          </tr>
          <tr>
            <td style="padding-top:20px; font-size:13px; line-height:1.6; color:#b0b8c1; word-break:keep-all;">직접 요청하지 않았다면 이 메일을 무시해 주세요. 다른 사람에게 인증번호를 알려 주지 마세요.</td>
          </tr>
        </table>
        <p style="margin:20px 0 0; font-size:12px; color:#b0b8c1; font-family:${FONT};">© 2026 PrePair</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
