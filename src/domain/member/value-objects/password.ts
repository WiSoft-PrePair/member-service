import { InvalidPasswordException } from "@/domain/member/exceptions";
import type { PasswordEncoder }     from "@/domain/member/password-encoder";

export class Password {
  private static readonly MIN_LENGTH = 8;

  private constructor(private readonly _value: string) {}

  public static create(
    plainPassword: string,
    encoder: PasswordEncoder,
  ): Password {
    Password.validate(plainPassword);

    const hashed: string = encoder.encode(plainPassword);

    return new Password(hashed);
  }

  public static fromHashed(hashedPassword: string): Password {
    return new Password(hashedPassword);
  }

  private static validate(password: string): void {
    if (password.length < this.MIN_LENGTH) {
      throw new InvalidPasswordException();
    }
  }

  public matches(plain: string, encoder: PasswordEncoder): boolean {
    return encoder.matches(plain, this._value);
  }

  public get value(): string {
    return this._value;
  }
}
