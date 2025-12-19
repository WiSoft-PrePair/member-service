import { FrequencyEnum, NotificationEnum } from "@/domain/member/enums";
import { MemberRegisterRequest, MemberType } from "@/domain/member/types";
import { v4 as uuid } from "uuid";
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

  constructor(member: MemberType) {
    this.id = member.id;
    this.email = member.email;
    this.password = member.password;
    this.job = member.job;
    this.nickname = member.nickname;
    this.notification = member.notification;
    this.frequency = member.frequency;
    this.point = member.point;
    this.isPro = member.isPro;
  }

  // 사용자 등록
  public static register(registerRequest: MemberRegisterRequest): Member {
    return new Member({
      id: uuid(),
      email: new Email(registerRequest.email),
      password: Password.hashedPassword(registerRequest.password),
      job: registerRequest.job,
      nickname: registerRequest.nickname,
      notification: registerRequest.notification,
      frequency: registerRequest.frequency,
      point: 0,
      isPro: false,
    });
  }

  // 사용자 정보 변경
  // 포인트 변경
  // 프로모션 변경
  // 알림 주기 변경
  // 알림 방법 변경
}
