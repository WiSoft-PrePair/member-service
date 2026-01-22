import { FrequencyEnum, NotificationEnum } from "@/domain/member";

export class MemberReadDto {
  readonly id: string;
  readonly email: string;
  readonly job: string;
  readonly nickname: string;
  readonly notification: NotificationEnum;
  readonly frequency: FrequencyEnum;
  readonly point: number;
  readonly isPro: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly activity?: string[];

  constructor(data: {
    id: string;
    email: string;
    job: string;
    nickname: string;
    notification: NotificationEnum;
    frequency: FrequencyEnum;
    point: number;
    isPro: boolean;
    createdAt: Date;
    updatedAt: Date;
    activity?: string[];
  }) {
    Object.assign(this, data);
    Object.freeze(this);
  }
}
