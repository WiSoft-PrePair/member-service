import { IEvent } from "@nestjs/cqrs";

export class MemberEmailChangedEvent implements IEvent {
  constructor(
    public readonly memberId: string,
    public readonly newEmail: string,
    public readonly occurredAt: Date = new Date(
      Date.now() + 9 * 60 * 60 * 1000,
    ),
  ) {}
}
