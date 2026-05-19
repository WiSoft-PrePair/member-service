import { randomUUID } from "node:crypto";
import { ValueObject } from "@/shared-kernel/domain/value-object.base";

export class MemberId extends ValueObject<string> {
  private constructor(value: string) {
    super(value);
  }

  public static generate(): MemberId {
    return new MemberId(randomUUID());
  }

  public static of(value: string): MemberId {
    return new MemberId(value);
  }
}
