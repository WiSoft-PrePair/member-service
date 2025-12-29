import { Entity, Index, PrimaryKey, Property } from "@mikro-orm/core";

@Entity({ tableName: "event_store" })
export class EventStoreEntity {
  @PrimaryKey()
  eventId!: string;

  @Property()
  @Index()
  aggregateId!: string;

  @Property()
  eventType!: string;

  @Property({ type: "json" })
  payload!: Record<string, unknown>;

  @Property()
  occurredAt!: Date;
}
