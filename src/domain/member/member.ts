import { FrequencyEnum, NotificationEnum } from "./enums";
import { MemberType, RegisterMemberRequest } from "./types";
import { randomUUID } from "crypto";
import { Email, Password } from "./value-objects";
import type { PasswordEncoder } from "./password-encoder";

export class Member {
  readonly id: string;
  readonly email: Email;
  readonly password: Password;
  readonly job: string;
  readonly nickname: string;
  readonly notification: NotificationEnum;
  readonly frequency: FrequencyEnum;
  readonly point: number;
  readonly isPro: boolean;

  private constructor(member: MemberType) {
    Object.assign(this, member);
  }

  public static register(
    registerRequest: RegisterMemberRequest,
    encoder: PasswordEncoder,
  ): Member {
    return new Member({
      ...registerRequest,
      id: randomUUID(),
      email: new Email(registerRequest.email),
      password: Password.create(registerRequest.password, encoder),
      point: 0,
      isPro: false,
    });
  }

  // DB에서 기존 엔티티 복원 (이미 검증된 데이터)
  public static of(member: MemberType): Member {
    return new Member(member);
  }
}
