export class InvalidEmailException extends Error {
  public readonly code = "INVALID_EMAIL";

  constructor(value: string) {
    super(`Invalid email format: ${value}`);
  }
}
