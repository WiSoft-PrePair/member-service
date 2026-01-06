import { randomUUID } from "crypto";
import { email } from "zod";

export class VerificationToken {
  private constructor(
    private readonly _value: string,
    private readonly email: string,
    private readonly expiredAt: Date,
  ) {}

  public static generate(email: string): VerificationToken {
    const token: string = randomUUID();

    const expiredAt: Date = new Date(Date.now() + 5 * 60 * 1000);

    return new VerificationToken(token, email, expiredAt);
  }

  public static of(
    value: string,
    email: string,
    expiresAt: Date,
  ): VerificationToken {
    return new VerificationToken(value, email, expiresAt);
  }

  public isExpired(): boolean {
    return this.expiredAt < new Date();
  }

  public getValue(): string {
    return this._value;
  }
}
