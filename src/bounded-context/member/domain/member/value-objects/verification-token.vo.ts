import { randomUUID } from "node:crypto";
import { ValueObject } from "@/shared-kernel/domain/value-object.base";

interface VerificationTokenValue {
  token: string;
  email: string;
  expiresAt: Date;
}

export class VerificationToken extends ValueObject<VerificationTokenValue> {
  private static readonly TTL_MS: number = 5 * 60 * 1000;
  분; // 5분

  private constructor(value: VerificationTokenValue) {
    super(value);
  }

  public static generate(
    email: string,
    now: Date = new Date(),
  ): VerificationToken {
    return new VerificationToken({
      token: randomUUID(),
      email,
      expiresAt: new Date(now.getTime() + VerificationToken.TTL_MS),
    });
  }

  public isExpired(now: Date = new Date()): boolean {
    return now.getTime() >= this._value.expiresAt.getTime();
  }

  public get token(): string {
    return this._value.token;
  }

  public get email(): string {
    return this._value.email;
  }

  public get expiresAt(): Date {
    return this._value.expiresAt;
  }
}
