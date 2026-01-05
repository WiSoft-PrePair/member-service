import { Injectable } from "@nestjs/common";
import { VerificationCode } from "@/domain/member";

interface VerificationEntry {
  memberId: string;
  newEmail: string;
  code: VerificationCode;
}

@Injectable()
export class EmailVerificationService {
  private readonly storage: Map<string, VerificationEntry> = new Map<
    string,
    VerificationEntry
  >();

  saveVerificationCode(memberId: string, newEmail: string): VerificationCode {
    const code: VerificationCode = VerificationCode.generate();

    this.storage.set(memberId, { memberId, newEmail, code });

    setTimeout(
      () => {
        this.storage.delete(memberId);
      },
      5 * 60 * 1000,
    );

    return code;
  }

  verifyCode(memberId: string, inputCode: string) {
    const entry: VerificationEntry | undefined = this.storage.get(memberId);

    if (!entry) {
      return null;
    }

    if (!entry.code.matches(inputCode)) {
      return null;
    }

    this.storage.delete(memberId);
    return entry.newEmail;
  }
}
