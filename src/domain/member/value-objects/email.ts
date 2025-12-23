import { InvalidEmailException } from "@/domain/member/exception";

export class Email {
  private static readonly EMAIL_PATTERN =
    /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,7}$/;

  private constructor(readonly value: string) {
    if (!Email.EMAIL_PATTERN.test(value)) {
      throw new InvalidEmailException(value);
    }
    this.value = value;
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
