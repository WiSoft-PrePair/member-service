import { DomainException } from "@/domain/shared/exception/domain.exception";

export class InvalidPasswordException extends DomainException {
  readonly errorCode: "INVALID_PASSWORD";

  constructor() {
    super(`비밀번호 형식이 올바르지 않습니다.`);
    this.name = "InvalidPasswordException";
  }
}
