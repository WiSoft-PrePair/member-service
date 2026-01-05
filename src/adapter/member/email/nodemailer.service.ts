import { Injectable } from "@nestjs/common";
import { EmailService } from "@/application/member/service/email.service";
import { createTransport, type Transporter } from "nodemailer";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class NodemailerService implements EmailService {
  private transporter: Transporter;

  constructor(private readonly configService: ConfigService) {
    this.transporter = createTransport({
      host: this.configService.get<string>("SMTP_HOST", "smtp.gmail.com"),
      port: this.configService.get<number>("SMTP_PORT", 587),
      secure: false,
      auth: {
        user: this.configService.get<string>("SMTP_USER"),
        pass: this.configService.get<string>("SMTP_PASSWORD"),
      },
    });
  }

  async sendVerificationEmail(email: string, code: string): Promise<void> {
    await this.transporter.sendMail({
      from: this.configService.get<string>("SMTP_FROM", "noreply@prepair.com"),
      to: email,
      subject: "[PrePair] 이메일 변경 인증 코드",
      html: `
        <h2>이메일 변경 인증 코드</h2>
        <p>아래 인증 코드를 입력하여 이메일 변경을 완료하세요.</p>
        <h1 style="color: #4CAF50;">${code}</h1>
        <p>이 코드는 5분 동안 유효합니다.</p>
        <p>본인이 요청하지 않았다면 이 메일을 무시하세요.</p>
      `,
    });
  }
}
