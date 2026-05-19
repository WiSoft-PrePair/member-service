export class EmailNotChangedException extends Error {
  public readonly code = "EMAIL_NOT_CHANGED";

  constructor() {
    super("New email is identical to the current one");
  }
}
