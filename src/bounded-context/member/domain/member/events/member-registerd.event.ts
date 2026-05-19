import {
  Notification,
  NotificationFrequency,
} from "@/bounded-context/member/domain/member/enums";
import { DomainEvent } from "@/shared-kernel/domain/domain-event.base";

export interface MemberRegisteredPayload {
  email: string;
  hashedPassword: string;
  nickname: string;
  job: string;
  notification: Notification;
  frequency: NotificationFrequency;
}

export class MemberRegisteredEvent extends DomainEvent<MemberRegisteredPayload> {
  public static readonly TYPE: string = "MemberRegistered";

  constructor(args: {
    aggregateId: string;
    eventVersion: number;
    payload: MemberRegisteredPayload;
  }) {
    super({
      aggregateId: args.aggregateId,
      aggregateType: "Member",
      eventType: MemberRegisteredEvent.TYPE,
      eventVersion: args.eventVersion,
      payload: args.payload,
    });
  }
}
