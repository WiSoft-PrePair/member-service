import { DomainEvent } from "@/shared-kernel/domain/domain-event.base";

export interface MemberPointAddedPayload {
  point: number;
}

export class MemberPointAddedEvent extends DomainEvent<MemberPointAddedPayload> {
  public static readonly TYPE: string = "MemberPointAdded";

  constructor(args: {
    aggregateId: string;
    eventVersion: number;
    payload: MemberPointAddedPayload;
  }) {
    super({
      aggregateId: args.aggregateId,
      aggregateType: "Member",
      eventType: MemberPointAddedEvent.TYPE,
      eventVersion: args.eventVersion,
      payload: args.payload,
    });
  }
}
