import { FrequencyEnum, NotificationEnum } from "@/domain/member/enums";

export interface MemberRegisterRequest {
  email: string;
  password: string;
  job: string;
  nickname: string;
  notification: NotificationEnum;
  frequency: FrequencyEnum;
}
