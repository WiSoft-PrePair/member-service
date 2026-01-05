export class VerificationCode {
  private readonly value: string;
  private readonly expiredAt: Date;

  private constructor(value: string, expiredAt: Date) {
    this.value = value;
    this.expiredAt = expiredAt;
  }

  public static generate(): VerificationCode {
    const code: string = Math.floor(1000 + Math.random() * 9000).toString();

    const expiredAt: Date = new Date(Date.now() + 5 * 60 * 1000);

    return new VerificationCode(code, expiredAt);
  }

  public static of(value: string, expiresAt: Date): VerificationCode {
    return new VerificationCode(value, expiresAt);
  }

  public isExpired(): boolean {
    return new Date() > this.expiredAt;
  }

  public matches(inputCode: string): boolean {
    return this.value === inputCode && !this.isExpired();
  }
}
