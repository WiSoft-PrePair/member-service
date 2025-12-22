import { FrequencyEnum } from "@/domain/member/enums";
import { NotificationEnum } from "@/domain/member/enums/notification.enum";
import { MemberType, RegisterMemberRequest } from "@/domain/member/types";
import { randomUUID } from "crypto";

export class Member {
  readonly id: string;
  readonly email: string;
  readonly password: string;
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
  public static register(registerRequest: RegisterMemberRequest) {
    return new Member({
      id: randomUUID(),
      point: 0,
      isPro: false,
      ...registerRequest,
    });
  }
}
