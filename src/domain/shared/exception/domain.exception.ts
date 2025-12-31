export abstract class DomainException extends Error {
  abstract readonly errorCode: string;

  constructor(message?: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
