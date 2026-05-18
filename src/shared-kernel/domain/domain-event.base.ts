import { randomUUID } from "node:crypto";

export interface DomainEventMetadata {
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly actorId?: string;
}

export interface DomainEventArgs<Payload = unknown> {
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  eventVersion: number;
  payload: Payload;
  metadata?: DomainEventMetadata;
  eventId?: string;
  occurredAt?: Date;
}

export abstract class DomainEvent<Payload = unknown> {
  public readonly eventId: string;
  public readonly occurredAt: Date;
  public readonly aggregateId: string;
  public readonly aggregateType: string;
  public readonly eventType: string;
  public readonly eventVersion: number;
  public readonly payload: Payload;
  public readonly metadata: DomainEventMetadata;

  protected constructor(args: DomainEventArgs<Payload>) {
    this.eventId = args.eventId ?? randomUUID();
    this.occurredAt = args.occurredAt ?? new Date();
    this.aggregateId = args.aggregateId;
    this.aggregateType = args.aggregateType;
    this.eventType = args.eventType;
    this.eventVersion = args.eventVersion;
    this.payload = args.payload;
    this.metadata = args.metadata ?? {};
  }

  /**
   * 이벤트 스토어 row 복원 전용 팩토리.
   * 도메인 비즈니스 로직에서는 호출 금지 — 구체 이벤트 클래스의 생성자를 직접 사용할 것.
   */
  static restore(args: DomainEventArgs): DomainEvent {
    return new RestoredDomainEvent(args);
  }
}

class RestoredDomainEvent extends DomainEvent {}
