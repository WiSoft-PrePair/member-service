import { FrequencyEnum } from "@/domain/member/enums";
import { NotificationEnum } from "@/domain/member/enums/notification.enum";

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
}
