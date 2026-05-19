import { ValueObject } from "@/shared-kernel/domain/value-object.base";

interface VerificationCodeValue {
  code: string;
  expiresAt: Date;
}

export class VerificationCode extends ValueObject<VerificationCodeValue> {
  private static readonly TTL_MS: number = 5 * 60 * 1000; // 5분

  private constructor(value: VerificationCodeValue) {
    super(value);
  }

  public static generate(now: Date = new Date()): VerificationCode {
    const code: string = String(Math.floor(1000 + Math.random() * 9000));

    return new VerificationCode({
      code,
      expiresAt: new Date(now.getTime() + VerificationCode.TTL_MS),
    });
  }

  public static of(code: string, expiresAt: Date): VerificationCode {
    return new VerificationCode({ code, expiresAt });
  }

  public isExpired(now: Date = new Date()): boolean {
    return now.getTime() >= this._value.expiresAt.getTime();
  }

  public matches(input: string, now: Date = new Date()): boolean {
    return !this.isExpired(now) && this._value.code === input;
  }

  public get code(): string {
    return this._value.code;
  }

  public get expiresAt(): Date {
    return this._value.expiresAt;
  }
}
