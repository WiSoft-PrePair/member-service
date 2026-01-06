import { FrequencyEnum, NotificationEnum } from "../enums";
import { Email, Password } from "@/domain/member";

export type MemberType = {
  id: string;
  email: Email;
  password: Password;
  job: string;
  nickname: string;
  notification: NotificationEnum;
  frequency: FrequencyEnum;
  point: number;
  isPro: boolean;
};

export type RegisterMemberRequest = Omit<
  MemberType,
  "id" | "email" | "point" | "isPro" | "password"
> & {
  email: string;
  password: string;
};

export type UpdateMemberRequest = {
  job?: string;
  nickname?: string;
  notification?: NotificationEnum;
  frequency?: FrequencyEnum;
};
