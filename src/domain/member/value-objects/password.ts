import { InvalidPasswordException } from "@/domain/member";

export class Password {
  readonly value: string;

  constructor(password: string) {
    this.value = password;
  }

  public static hashedPassword(password: string): Password {
    return new Password(password);
  }

  public validate(password: string) {
    if (password.length < 8) {
      throw new InvalidPasswordException();
    }
  }
}
