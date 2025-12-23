import { InvalidPasswordException } from "@/domain/member/exception/invalid-password.exception";

export class Password {
  constructor(private readonly _value: string) {
    this._value = _value;
  }

  public static hashedPassword(password: string): Password {
    return new Password(password);
  }

  public validate(password: string): never | void {
    if (password.length < 8) {
      throw new InvalidPasswordException();
    }
  }

  get value(): string {
    return this._value;
  }
}
