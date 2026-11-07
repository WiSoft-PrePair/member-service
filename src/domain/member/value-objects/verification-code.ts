import { randomInt } from "node:crypto";

export class VerificationCode {
  private readonly _value: string;
  private readonly _expiresAt: Date;

  private constructor(value: string, expiresAt: Date) {
    this._value = value;
    this._expiresAt = expiresAt;
  }

  // 6자리 랜덤 숫자 생성
  public static generate(): VerificationCode {
    const code: string = randomInt(0, 1_000_000).toString().padStart(6, "0");

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    return new VerificationCode(code, expiresAt);
  }

  public static of(value: string, expiresAt: Date): VerificationCode {
    return new VerificationCode(value, expiresAt);
  }

  public isExpired(): boolean {
    return new Date() > this._expiresAt;
  }

  public matches(inputCode: string): boolean {
    return this._value === inputCode && !this.isExpired();
  }

  public get value(): string {
    return this._value;
  }

  public get expiresAt(): Date {
    return this._expiresAt;
  }
}
