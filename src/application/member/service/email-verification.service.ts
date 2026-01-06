import { Injectable, Logger } from "@nestjs/common";
import { VerificationCode } from "@/domain/member/value-objects";

interface VerificationEntry {
  email: string;
  code: VerificationCode;
}

@Injectable()
export class EmailVerificationService {
  private readonly logger: Logger = new Logger(EmailVerificationService.name);

  private readonly pendingVerifications: Map<string, VerificationEntry> =
    new Map<string, VerificationEntry>();

  private readonly verifiedEmails: Map<
    string,
    { email: string; verifiedAt: Date }
  > = new Map<string, { email: string; verifiedAt: Date }>();

  // 인증 코드 생성 및 저장
  public saveVerificationCode(email: string): VerificationCode {
    const code: VerificationCode = VerificationCode.generate();

    this.pendingVerifications.set(email, {
      email,
      code,
    });

    this.logger.log(`인증 코드 생성: email=${email}`);

    // 5분 후 자동 삭제
    setTimeout(
      () => {
        this.pendingVerifications.delete(email);
        this.logger.log(`인증 코드 만료: email=${email}`);
      },
      5 * 60 * 1000,
    );

    return code;
  }

  // 인증 코드 검증
  public verifyCode(email: string, inputCode: string): boolean {
    const entry: VerificationEntry | undefined =
      this.pendingVerifications.get(email);

    if (!entry || !entry.code.matches(inputCode)) {
      return false;
    }

    this.verifiedEmails.set(email, { email, verifiedAt: new Date() });

    this.pendingVerifications.delete(email);

    setTimeout(
      () => {
        this.verifiedEmails.delete(email);
      },
      5 * 60 * 1000,
    );

    return true;
  }

  public isEmailVerified(email: string): boolean {
    return this.verifiedEmails.has(email);
  }

  consumeVerifiedEmail(email: string): boolean {
    if (!this.verifiedEmails.has(email)) {
      return false;
    }

    this.verifiedEmails.delete(email);
    return true;
  }
}
