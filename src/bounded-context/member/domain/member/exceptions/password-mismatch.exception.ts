export class PasswordMismatchException extends Error {
  public readonly code = "PASSWORD_MISMATCH";

  constructor() {
    super("Password does not match");
  }
}
