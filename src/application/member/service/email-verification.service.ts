import { Injectable, Logger } from "@nestjs/common";
import { VerificationCode } from "@/domain/member/value-objects";

interface VerificationEntry {
  memberId: string;
  newEmail: string;
  code: VerificationCode;
}

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);
  private readonly storage = new Map<string, VerificationEntry>();

  // 인증 코드 생성 및 저장
  saveVerificationCode(memberId: string, newEmail: string): VerificationCode {
    const code = VerificationCode.generate();

    this.storage.set(memberId, {
      memberId,
      newEmail,
      code,
    });

    this.logger.log(`인증 코드 생성: memberId=${memberId}, email=${newEmail}`);

    // 5분 후 자동 삭제
    setTimeout(
      () => {
        this.storage.delete(memberId);
        this.logger.log(`인증 코드 만료: memberId=${memberId}`);
      },
      5 * 60 * 1000,
    );

    return code;
  }

  // 인증 코드 검증
  verifyCode(memberId: string, inputCode: string): string | null {
    const entry = this.storage.get(memberId);

    if (!entry) {
      this.logger.warn(`인증 코드 없음: memberId=${memberId}`);
      return null;
    }

    if (!entry.code.matches(inputCode)) {
      this.logger.warn(`인증 코드 불일치: memberId=${memberId}`);
      return null;
    }

    // 검증 성공 시 저장소에서 삭제
    this.storage.delete(memberId);
    this.logger.log(`인증 코드 검증 성공: memberId=${memberId}`);

    return entry.newEmail;
  }
}
