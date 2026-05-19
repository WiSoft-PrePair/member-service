import { DomainEvent } from "@/shared-kernel/domain/domain-event.base";

export interface AggregateSnapshotState {
  readonly state: object;
  readonly version: number;
}

export abstract class AggregateRoot {
  protected _version: number = 0;
  private _uncommittedEvents: DomainEvent[] = [];

  /**
   * 아직 Event Store에 저장되지 않은 이벤트 목록
   */
  public getUncommittedEvents(): readonly DomainEvent[] {
    return this._uncommittedEvents;
  }

  /**
   * Event Store가 append를 성공한 뒤 호출해 버퍼를 비움
   */
  public markAsCommitted(): void {
    this._uncommittedEvents = [];
  }

  /**
   * 새 이벤트 발행
   */
  protected apply(event: DomainEvent): void {
    this.when(event);
    this._version = event.eventVersion;
    this._uncommittedEvents.push(event);
  }

  /**
   * Event Store에서 읽어온 과거 이벤트로 Aggregate 상태 복원
   */
  public loadFromHistory(events: readonly DomainEvent[]): void {
    for (const event of events) {
      this.when(event);
      this._version = event.eventVersion;
    }
  }

  public get version(): number {
    return this._version;
  }

  /**
   * 이벤트가 발생했을 때 Aggregate 상태가 어떻게 변하는지 정의
   */
  protected abstract when(event: DomainEvent): void;

  /**
   * Snapshot 적재/생성
   */
  public abstract loadFromSnapshot(snapshot: AggregateSnapshotState): void;
  public abstract createSnapshot(): object;

  public abstract get id(): string;
  public abstract get aggregateType(): string;
}
