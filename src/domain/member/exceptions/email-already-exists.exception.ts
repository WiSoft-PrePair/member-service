export class EmailAlreadyExistsException extends Error {
  readonly errorCode = "EMAIL_ALREADY_EXISTS";

  constructor(email: string) {
    super(`이미 사용 중인 이메일입니다: ${email}`);
    this.name = "EmailAlreadyExistsException";
  }
}
