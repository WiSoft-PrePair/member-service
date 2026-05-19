import { ValueObject } from "@/shared-kernel/domain/value-object.base";
import { InvalidNicknameException } from "../exceptions/invalid-nickname.exception";

export class Nickname extends ValueObject<string> {
  private static readonly MIN: number = 2;
  private static readonly MAX: number = 20;

  private constructor(value: string) {
    super(value);
  }

  public static of(value: string): Nickname {
    const trimmed: string = value.trim();

    if (trimmed.length < Nickname.MIN || trimmed.length > Nickname.MAX) {
      throw new InvalidNicknameException(
        `Length must be between ${Nickname.MIN} and ${Nickname.MAX}`,
      );
    }

    return new Nickname(trimmed);
  }
}
