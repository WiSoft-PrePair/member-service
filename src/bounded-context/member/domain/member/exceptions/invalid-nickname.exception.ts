export class InvalidNicknameException extends Error {
  public readonly code = "INVALID_NICKNAME";

  constructor(reason: string) {
    super(`Invalid nickname: ${reason}`);
  }
}
