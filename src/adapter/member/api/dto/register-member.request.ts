import { FrequencyEnum, NotificationEnum } from "@/domain/member/enums";

export class RegisterMemberRequest {
  email!: string;
  password!: string;
  job!: string;
  nickname!: string;
  notification!: NotificationEnum;
  frequency!: FrequencyEnum;
}
