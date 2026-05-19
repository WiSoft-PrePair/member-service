import {
  Notification,
  NotificationFrequency,
} from "@/bounded-context/member/domain/member/enums";
import { DomainEvent } from "@/shared-kernel/domain/domain-event.base";

export interface MemberUpdatedPayload {
  job?: string;
  nickname?: string;
  notification?: Notification;
  frequency?: NotificationFrequency;
}

export class MemberUpdatedEvent extends DomainEvent<MemberUpdatedPayload> {
  public static readonly TYPE: string = "MemberUpdated";

  constructor(args: {
    aggregateId: string;
    eventVersion: number;
    payload: MemberUpdatedPayload;
  }) {
    super({
      aggregateId: args.aggregateId,
      aggregateType: "Member",
      eventType: MemberUpdatedEvent.TYPE,
      eventVersion: args.eventVersion,
      payload: args.payload,
    });
  }
}
