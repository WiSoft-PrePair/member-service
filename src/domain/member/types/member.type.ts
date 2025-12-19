import { Email } from "@/domain/member/value-objects";
import { FrequencyEnum, NotificationEnum } from "@/domain/member/enums";
import { Password } from "@/domain/member/value-objects/password";

export interface MemberType {
  id: string;
  email: Email;
  password: Password;
  job: string;
  nickname: string;
  notification: NotificationEnum;
  frequency: FrequencyEnum;
  point: number;
  isPro: boolean;
}
