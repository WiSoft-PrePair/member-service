import { DomainEvent } from "@/shared-kernel/domain/domain-event.base";

export interface MemberEmailChangedPayload {
  newEmail: string;
}
export class MemberEmailChangedEvent extends DomainEvent<MemberEmailChangedPayload> {
  public static readonly TYPE: string = "MemberEmailChanged";

  constructor(args: {
    aggregateId: string;
    eventVersion: number;
    payload: MemberEmailChangedPayload;
  }) {
    super({
      aggregateId: args.aggregateId,
      aggregateType: "Member",
      eventType: MemberEmailChangedEvent.TYPE,
      eventVersion: args.eventVersion,
      payload: args.payload,
    });
  }
}
