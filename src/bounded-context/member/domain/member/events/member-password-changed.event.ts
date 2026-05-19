import { DomainEvent } from "@/shared-kernel/domain/domain-event.base";

export interface MemberPasswordChangedPayload {
  hashedPassword: string;
}

export class MemberPasswordChangedEvent extends DomainEvent<MemberPasswordChangedPayload> {
  public static readonly TYPE: string = "MemberPasswordChanged";

  constructor(args: {
    aggregateId: string;
    eventVersion: number;
    payload: MemberPasswordChangedPayload;
  }) {
    super({
      aggregateId: args.aggregateId,
      aggregateType: "Member",
      eventType: MemberPasswordChangedEvent.TYPE,
      eventVersion: args.eventVersion,
      payload: args.payload,
    });
  }
}
