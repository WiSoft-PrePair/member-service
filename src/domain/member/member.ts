import { FrequencyEnum } from "@/domain/member/enums";
import { NotificationEnum } from "@/domain/member/enums/notification.enum";
import { MemberType, RegisterMemberRequest } from "@/domain/member/types";
import { randomUUID } from "crypto";
import { Email, Password } from "@/domain/member/value-objects";

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

  // 사용자 등록
  public static register(registerRequest: RegisterMemberRequest): Member {
    return new Member({
      ...registerRequest,
      id: randomUUID(),
      email: new Email(registerRequest.email),
      password: Password.hashedPassword(registerRequest.password),
      point: 0,
      isPro: false,
    });
  }
}
