export class InvalidPasswordException extends Error {
  public readonly code = "INVALID_PASSWORD";

  constructor(reason: string) {
    super(`Invalid password: ${reason}`);
  }
}
