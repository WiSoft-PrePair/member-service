import { Injectable, Logger } from "@nestjs/common";
import {
  VerificationCode,
  VerificationToken,
} from "@/domain/member/value-objects";

interface VerificationEntry {
  email: string;
  code: VerificationCode;
}

interface VerifiedEntry {
  email: string;
  token: VerificationToken;
}

@Injectable()
export class EmailVerificationService {
  private readonly logger: Logger = new Logger(EmailVerificationService.name);

  private readonly pendingVerifications: Map<string, VerificationEntry> =
    new Map<string, VerificationEntry>();

  private readonly verifiedTokens: Map<string, VerifiedEntry> = new Map<
    string,
    VerifiedEntry
  >();

  // 인증 코드 생성 및 저장
  saveVerificationCode(email: string): VerificationCode {
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
  verifyCode(email: string, inputCode: string): VerificationToken | null {
    const entry = this.pendingVerifications.get(email);

    if (!entry) {
      this.logger.warn(`인증 코드 없음: email=${email}`);
      return null;
    }

    if (!entry.code.matches(inputCode)) {
      this.logger.warn(`인증 코드 불일치: email=${email}`);
      return null;
    }

    // 검증 성공 시 저장소에서 삭제
    const token: VerificationToken = VerificationToken.generate(email);
    this.verifiedTokens.set(token.getValue(), { email, token });
    this.pendingVerifications.delete(email);

    this.logger.log(`인증 코드 검증 성공: email=${email}`);

    setTimeout(
      () => {
        this.verifiedTokens.delete(token.getValue());
        this.logger.log(`검증 토큰 만료: email=${email}`);
      },
      5 * 60 * 1000,
    );

    return token;
  }

  validateToken(tokenValue: string): string | null {
    const entry: VerifiedEntry | undefined =
      this.verifiedTokens.get(tokenValue);

    if (!entry || entry.token.isExpired()) {
      return null;
    }

    return entry.email;
  }

  consumeToken(tokenValue: string): string | null {
    const email = this.validateToken(tokenValue);

    if (email) {
      this.verifiedTokens.delete(tokenValue);
      this.logger.log(`검증 토큰 사용 완료: email=${email}`);
    }

    return email;
  }
}
