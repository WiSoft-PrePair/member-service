import { IEvent } from "@nestjs/cqrs";
import { FrequencyEnum, NotificationEnum } from "@/domain/member";

export class MemberRegisterEvent implements IEvent {
  constructor(
    public readonly memberId: string,
    public readonly email: string,
    public readonly job: string,
    public readonly nickname: string,
    public readonly notification: NotificationEnum,
    public readonly frequency: FrequencyEnum,
    public readonly occurredAt: Date = new Date(
      Date.now() + 9 * 60 * 60 * 1000,
    ),
  ) {}
}
