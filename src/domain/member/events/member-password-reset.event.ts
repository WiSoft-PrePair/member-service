import { IEvent } from "@nestjs/cqrs";

export class MemberPasswordResetEvent implements IEvent {
  constructor(
    public readonly memberId: string,
    public readonly newPasswordHash: string,
    public readonly occurredAt: Date = new Date(
      Date.now() + 9 * 60 * 60 * 1000,
    ),
  ) {}
}
