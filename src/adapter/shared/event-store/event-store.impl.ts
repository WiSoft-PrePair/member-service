import { DomainEvent, EventStore } from "@/domain/shared";
import { Injectable } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/core";
import { EventStoreEntity } from "@/adapter/shared/event-store/event-store.entity";

@Injectable()
export class EventStoreImpl implements EventStore {
  constructor(private readonly em: EntityManager) {}

  append(event: DomainEvent): void {
    const entity = new EventStoreEntity();

    entity.eventId = event.eventId;
    entity.aggregateId = event.aggregateId;
    entity.eventType = event.eventType;
    entity.payload = event.payload;
    entity.occurredAt = event.occurredAt;

    this.em.persist(entity);
  }

  async getEvents(aggregateId: string): Promise<DomainEvent[]> {
    const entities = await this.em.find(
      EventStoreEntity,
      { aggregateId },
      {
        orderBy: { occurredAt: "ASC" },
      },
    );

    return entities.map((e) => ({
      eventId: e.eventId,
      aggregateId: e.aggregateId,
      eventType: e.eventType,
      payload: e.payload,
      occurredAt: e.occurredAt,
    }));
  }
}
