export class InvalidPointException extends Error {
  public readonly code = "INVALID_POINT";

  constructor() {
    super("Point must be non-negative");
  }
}
