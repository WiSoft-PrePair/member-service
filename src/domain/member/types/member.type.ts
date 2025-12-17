import { Email } from "@/domain/member/value-objects";
import { FrequencyEnum, NotificationEnum } from "@/domain/member/enums";

export interface MemberType {
  id: string;
  email: Email;
  password: string;
  job: string;
  nickname: string;
  notification: NotificationEnum;
  frequency: FrequencyEnum;
  point: number;
  isPro: boolean;
}
