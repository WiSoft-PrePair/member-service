import { DomainEvent } from "@/shared-kernel/domain/domain-event.base";

export interface MemberPasswordResetPayload {
  hashedPassword: string;
}

export class MemberPasswordResetEvent extends DomainEvent<MemberPasswordResetPayload> {
  public static readonly TYPE: string = "MemberPasswordReset";

  constructor(args: {
    aggregateId: string;
    eventVersion: number;
    payload: MemberPasswordResetPayload;
  }) {
    super({
      aggregateId: args.aggregateId,
      aggregateType: "Member",
      eventType: MemberPasswordResetEvent.TYPE,
      eventVersion: args.eventVersion,
      payload: args.payload,
    });
  }
}
