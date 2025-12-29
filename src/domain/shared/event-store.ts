import { DomainEvent } from "@/domain/shared/domain-event";

export interface EventStore {
  append(event: DomainEvent): void;

  getEvents(aggregateId: string): Promise<DomainEvent[]>;
}

export const EVENT_STORE = Symbol("EventStore");
