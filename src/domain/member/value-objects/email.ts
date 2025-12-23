import { InvalidEmailException } from "@/domain/member/exception";

export class Email {
  private static readonly EMAIL_PATTERN =
    /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,7}$/;

  constructor(private readonly _value: string) {
    if (!Email.EMAIL_PATTERN.test(_value)) {
      throw new InvalidEmailException(_value);
    }
    this._value = _value;
  }

  equals(other: Email): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }


  get value(): string {
    return this._value;
  }
}
