import { InvalidEmailException } from "@/bounded-context/member/domain/member/exceptions";
import { ValueObject } from "@/shared-kernel/domain/value-object.base";

export class Email extends ValueObject<string> {
  private static readonly PATTERN: RegExp =
    /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,7}$/;

  private constructor(value: string) {
    super(value);
  }

  public static of(value: string): Email {
    if (!Email.PATTERN.test(value)) {
      throw new InvalidEmailException(value);
    }

    return new Email(value);
  }
}
