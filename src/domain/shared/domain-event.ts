import { randomUUID } from "crypto";

export interface DomainEvent<T = Record<string, unknown>> {
  readonly eventId: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly payload: T;
  readonly occurredAt: Date;
}

export function createDomainEvent<T extends Record<string, unknown>>(
  aggregateId: string,
  eventType: string,
  payload: T,
): DomainEvent<T> {
  return {
    eventId: randomUUID(),
    aggregateId,
    eventType,
    payload,
    occurredAt: new Date(Date.now() + 9 * 60 * 60 * 1000),
  };
}
