export class InvalidEmailException extends Error {
  constructor(email?: string) {
    super(`이메일 형식이 올바르지 않습니다: ${email}`);
    this.name = "InvalidEmailException";
  }
}
