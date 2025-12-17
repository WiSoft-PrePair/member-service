import { InvalidEmailException } from "@/domain/member/exceptions/invalid-email.exception";

export class Email {
  readonly value: string;
  private static readonly EMAIL_PATTERN: RegExp =
    /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,7}$/;

  constructor(address: string) {
    if (!Email.EMAIL_PATTERN.test(address)) {
      throw new InvalidEmailException(address);
    }
    this.value = address;
  }
}
