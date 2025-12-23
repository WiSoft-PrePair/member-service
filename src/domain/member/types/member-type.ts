import { FrequencyEnum, NotificationEnum } from "@/domain/member/enums";
import { Email } from "@/domain/member/value-objects";

export type MemberType = {
  id: string;
  email: Email;
  password: string;
  job: string;
  nickname: string;
  notification: NotificationEnum;
  frequency: FrequencyEnum;
  point: number;
  isPro: boolean;
};

export type RegisterMemberRequest = Omit<
  MemberType,
  "id" | "email" | "point" | "isPro"
> & {
  email: string;
};
