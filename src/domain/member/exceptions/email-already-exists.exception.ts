import { DomainException } from "@/domain/shared/exception/domain.exception";

export class EmailAlreadyExistsException extends DomainException {
  readonly errorCode: string = "EMAIL_ALREADY_EXISTS";

  constructor(email: string) {
    super(`이미 사용중인 이메일입니다: ${email}`);
    this.name = "EmailAlreadyExistsException";
  }
}
