export class InvalidPasswordException extends Error {
  constructor() {
    super(`비밀번호 형식이 올바르지 않습니다.`);
    this.name = "InvalidPasswordException";
  }
}
