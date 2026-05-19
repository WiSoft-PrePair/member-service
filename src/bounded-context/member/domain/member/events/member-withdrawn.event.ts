import { DomainEvent } from "@/shared-kernel/domain/domain-event.base";

export interface MemberWithdrawnPayload {
  withdrawnAt: string;
}

export class MemberWithdrawnEvent extends DomainEvent<MemberWithdrawnPayload> {
  public static readonly TYPE: string = "MemberWithdrawn";

  constructor(args: {
    aggregateId: string;
    eventVersion: number;
    payload: MemberWithdrawnPayload;
  }) {
    super({
      aggregateId: args.aggregateId,
      aggregateType: "Member",
      eventType: MemberWithdrawnEvent.TYPE,
      eventVersion: args.eventVersion,
      payload: args.payload,
    });
  }
}
