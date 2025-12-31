import { DomainException } from "@/domain/shared/exception/domain.exception";

export class InvalidEmailException extends DomainException {
  readonly errorCode = "INVALID_EMAIL";

  constructor(email?: string) {
    super(`이메일 형식이 올바르지 않습니다: ${email}`);
    this.name = "InvalidEmailException";
  }
}
