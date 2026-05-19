export class InvalidVerificationCodeException extends Error {
  public readonly code = "INVALID_VERIFICATION_CODE";

  constructor() {
    super("Verification code is invalid or expired");
  }
}
