export class InvalidVerificationCodeException extends Error {
  readonly errorCode = "INVALID_VERIFICATION_CODE";

  constructor() {
    super("인증 코드가 유효하지 않거나 만료되었습니다.");
    this.name = "InvalidVerificationCodeException";
  }
}
