import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createTransport, type Transporter } from "nodemailer";
import { EmailService } from "@/application/member/service/email.service";

@Injectable()
export class NodemailerService implements EmailService {
  private transporter: Transporter;

  constructor(private readonly configService: ConfigService) {
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
    await this.transporter.sendMail({
      from: this.configService.get("SMTP_FROM", "noreply@prepair.com"),
      to: email,
      subject: "[PrePair] 이메일 인증 코드",
      html: `
        <!-- Email Verification Template (우리 사이트 스타일) -->
<table width="100%" cellpadding="0" cellspacing="0" style="font-family: 'Noto Sans KR', sans-serif; background-color:#f6f8fa; padding:40px 0;">
  <tr>
    <td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; padding:40px; box-shadow:0 4px 12px rgba(0,0,0,0.05);">
        
        <!-- Header / Logo -->
        <tr>
          <td align="center" style="padding-bottom:20px;">
            <!-- 프리페어 로고를 넣으면 더 좋음 -->
            <img src="https://prepair.wisoft.dev/assets/logo-EOf_Dr2C.png" alt="PrePair" width="120" style="display:block;" />
          </td>
        </tr>

        <!-- Title -->
        <tr>
          <td align="center" style="font-size:24px; font-weight:700; color:#333333; padding-bottom:10px;">
            이메일 인증을 완료해주세요
          </td>
        </tr>

        <!-- Subtitle -->
        <tr>
          <td align="center" style="font-size:16px; color:#555555; padding-bottom:30px;">
            아래 코드를 입력해 회원가입을 완료할 수 있어요.
          </td>
        </tr>

        <!-- Verification Code Box -->
        <tr>
          <td align="center" style="padding-bottom:30px;">
            <div style="font-size:32px; font-weight:800; letter-spacing:6px; color:#405173; background:#AEC5F2; border:2px dashed #405173; padding:15px 25px; border-radius:6px; display:inline-block;">
              ${code}
            </div>
          </td>
        </tr>

        <!-- Instructions -->
        <tr>
          <td align="center" style="font-size:14px; color:#777777; line-height:1.6; padding-bottom:25px;">
            이 코드는 <strong>5분</strong> 동안 유효합니다.<br>
            입력하지 않으면 인증이 자동으로 취소돼요.
          </td>
        </tr>

        <!-- Footer Hint -->
        <tr>
          <td align="center" style="font-size:12px; color:#aaaaaa; padding-top:15px;">
            요청하지 않은 인증이라면 이 메일을 무시해주세요.
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
      `,
    });
  }
}
