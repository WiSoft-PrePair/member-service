import { IEvent } from "@nestjs/cqrs";

export class MemberLoginEvent implements IEvent {
  constructor(
    public readonly memberId: string,
    public readonly loginAt: Date = new Date(),
  ) {}
}
