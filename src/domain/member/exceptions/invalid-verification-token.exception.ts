import { DomainException } from "@/domain/shared/exception/domain.exception";

export class InvalidVerificationTokenException extends DomainException {
  readonly errorCode: string = "INVALID_VERIFICATION_TOKEN";

  constructor() {
    super("검증 토큰이 유효하지 않거나 만료되었습니다.");
    this.name = "InvalidVerificationTokenException";
  }
}
