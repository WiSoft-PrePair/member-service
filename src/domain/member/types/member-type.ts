import { FrequencyEnum, NotificationEnum } from "@/domain/member/enums";

export type MemberType = {
  id: string;
  email: string;
  password: string;
  job: string;
  nickname: string;
  notification: NotificationEnum;
  frequency: FrequencyEnum;
  point: number;
  isPro: boolean;
};

export type RegisterMemberRequest = Omit<MemberType, "id" | "point" | "isPro">;
