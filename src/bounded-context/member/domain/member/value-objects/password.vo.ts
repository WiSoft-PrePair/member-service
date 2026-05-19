import type { PasswordEncoder } from "@/bounded-context/member/application/ports/out/password-encoder.port";
import { InvalidPasswordException } from "@/bounded-context/member/domain/member/exceptions";
import { ValueObject } from "@/shared-kernel/domain/value-object.base";

export class Password extends ValueObject<string> {
  private static readonly MIN_LENGTH: number = 8;

  private constructor(hashed: string) {
    super(hashed);
  }

  public static create(plain: string, encoder: PasswordEncoder): Password {
    if (plain.length < Password.MIN_LENGTH) {
      throw new InvalidPasswordException(
        `Must be at least ${Password.MIN_LENGTH}`,
      );
    }

    return new Password(encoder.encode(plain));
  }

  public static fromHashed(hashed: string): Password {
    return new Password(hashed);
  }

  public matches(plain: string, encoder: PasswordEncoder): boolean {
    return encoder.matches(plain, this._value);
  }

  public get hashed(): string {
    return this._value;
  }
}
