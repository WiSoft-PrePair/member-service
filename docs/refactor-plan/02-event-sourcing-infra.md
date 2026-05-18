# 02. Event Sourcing Infrastructure

> **사전 조건**: Phase 01 완료 (부트스트랩 성공, `/health` 200)

## Goal

이번 Phase는 **이 프로젝트 전체의 척추**다. Member/Auth/OAuth 어느 도메인보다 먼저, 다음 세 가지를 구축한다:

1. **도메인 베이스 클래스**: `AggregateRoot`, `DomainEvent`, `ValueObject`
2. **Event Store**: PostgreSQL 기반 append-only 저장소 (낙관적 동시성 포함)
3. **Snapshot Store**: N개 이벤트마다 Aggregate 상태 JSON 저장
4. **Projection Dispatcher**: 이벤트가 저장되면 Projector들이 자동 구독

> **폴더 구조 원칙**: 헥사고날의 in/out 방향을 폴더에 그대로 드러낸다.
> - `application/ports/out/` — 코어가 외부에 위임할 계약 (`EventStore`, `SnapshotStore`, `EventPublisher`) — **이번 phase의 세 port 모두 outbound다.**
> - `application/ports/in/` — 코어가 외부에 노출할 계약(UseCase 인터페이스). 이번 phase에서는 만들지 않는다 (Phase 04에서 등장).
> - `adapter/out/` — outbound port의 기술적 구현체(`MikroEventStore`, `ProjectionDispatcher`). **이 phase에서 만드는 인프라 코드는 전부 여기로 간다.**
> - `adapter/in/` — driving adapter(REST Controller 등). Phase 05에서 등장.

이 Phase가 부실하면 이후 모든 Phase가 와르르 무너진다. **여기에서는 테스트 커버리지를 90% 이상 확보한다.**

---

## 산출물 체크리스트

### 도메인 베이스 (`src/shared-kernel/domain/`)
- [ ] `domain-event.base.ts` — `DomainEvent` 추상 클래스
- [ ] `aggregate-root.base.ts` — `AggregateRoot` 추상 클래스 (`apply`, `when`, `loadFromHistory`, `getUncommittedEvents`, `markAsCommitted`, `version`)
- [ ] `value-object.base.ts` — `ValueObject<T>` 추상 클래스 (`equals`)

### 애플리케이션 Outbound Port (`src/contexts/identity/application/ports/out/`)
> ES 인프라 공용 outbound port. 코어가 외부(DB, 메시지 브로커)에 위임하기 위한 계약이므로 `ports/out/` 아래에 둔다. feature별 port는 각 feature 폴더(`application/<feature>/ports/out/`)에 둔다.
- [ ] `event-store.port.ts` — `EventStore` 인터페이스
- [ ] `snapshot-store.port.ts` — `SnapshotStore` 인터페이스
- [ ] `event-publisher.port.ts` — `EventPublisher` 인터페이스 (ProjectionDispatcher 추상)

### Driven Adapter — 영속화 (`src/contexts/identity/adapter/out/persistence/event-store/`)
- [ ] `event-store.entity.ts` — MikroORM 엔티티
- [ ] `aggregate-snapshot.entity.ts` — MikroORM 엔티티
- [ ] `mikro-event-store.impl.ts` — `EventStore` 구현
- [ ] `mikro-snapshot-store.impl.ts` — `SnapshotStore` 구현
- [ ] `event-store.module.ts` — DI 모듈

### Driven Adapter — Projection Dispatch (`src/contexts/identity/adapter/out/projections/`)
- [ ] `projection-dispatcher.ts` — `EventPublisher` 구현 (NestJS `EventEmitter2` 래퍼)

### 통합 (`src/shared-kernel/shard-kernel.module.ts`)
- [ ] EventStore/SnapshotStore/Dispatcher 전역 등록 + export

### 테스트
- [ ] `test/unit/identity/shared/aggregate-root.spec.ts`
- [ ] `test/integration/identity/event-store/mikro-event-store.spec.ts` (실제 DB)
- [ ] `test/integration/identity/event-store/mikro-snapshot-store.spec.ts`

---

## Step 1. 의존성 추가

```bash
pnpm add @nestjs/event-emitter
pnpm add uuid
pnpm add -D @types/uuid
```

---

## Step 2. 도메인 베이스 클래스 작성

### 2-1. `value-object.base.ts`

```typescript
// src/shared-kernel/domain/value-object.base.ts
export abstract class ValueObject<Props extends object> {
  protected readonly props: Props;

  protected constructor(props: Props) {
    this.props = Object.freeze({ ...props });
  }

  public equals(other?: ValueObject<Props>): boolean {
    if (!other) return false;
    return JSON.stringify(this.props) === JSON.stringify(other.props);
  }
}
```

### 2-2. `domain-event.base.ts`

```typescript
// src/shared-kernel/domain/domain-event.base.ts
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
```

> **메모**: `restore`는 EventStore가 raw row를 다시 메모리로 올릴 때만 쓴다. 도메인 비즈니스 로직에서 새 이벤트를 만들 때는 반드시 `MemberRegisteredEvent` 같은 *구체 서브클래스의 생성자*를 호출해야 한다. `RestoredDomainEvent`는 모듈 스코프에 단 한 번 정의되므로 V8 hidden class 캐시가 유지되어 매 row마다 클래스를 새로 만드는 비용이 없다.

### 2-3. `aggregate-root.base.ts`

```typescript
// src/shared-kernel/domain/aggregate-root.base.ts
import { DomainEvent } from "./domain-event.base";

export interface AggregateSnapshotState {
  readonly state: object;
  readonly version: number;
}

export abstract class AggregateRoot {
  protected _version: number = 0;
  private _uncommittedEvents: DomainEvent[] = [];

  public abstract get id(): string;
  public abstract get aggregateType(): string;

  public get version(): number {
    return this._version;
  }

  /**
   * 아직 EventStore에 저장되지 않은 이벤트 목록
   * (NestJS CQRS / Greg Young 컨벤션: getter 대신 명시적 메서드)
   */
  public getUncommittedEvents(): readonly DomainEvent[] {
    return this._uncommittedEvents;
  }

  /**
   * EventStore가 append를 성공한 뒤 호출하여 버퍼를 비운다.
   * (NestJS CQRS의 `commit()`은 발행도 겸하므로 의미 충돌을 피해 이름을 분리)
   */
  public markAsCommitted(): void {
    this._uncommittedEvents = [];
  }

  /**
   * 새 이벤트를 발행한다 — 도메인 메서드 안에서 호출.
   * 내부적으로 `when()`을 호출해 상태를 갱신하고 미커밋 버퍼에 쌓는다.
   * (NestJS CQRS / Axon Framework 컨벤션)
   */
  protected apply(event: DomainEvent): void {
    this.when(event);
    this._version = event.eventVersion;
    this._uncommittedEvents.push(event);
  }

  /**
   * EventStore에서 읽어온 과거 이벤트로 Aggregate 상태를 복원한다.
   * 미커밋 버퍼에는 쌓지 않는다.
   * (NestJS CQRS / Greg Young SimpleCQRS 컨벤션)
   */
  public loadFromHistory(events: readonly DomainEvent[]): void {
    for (const event of events) {
      this.when(event);
      this._version = event.eventVersion;
    }
  }

  /**
   * 이벤트가 발생했을 때 Aggregate 상태가 어떻게 변하는지 정의한다.
   * (F# DDD / Vaughn Vernon이 자주 쓰는 `when` 컨벤션 — `apply`와 의미 분리)
   */
  protected abstract when(event: DomainEvent): void;

  /**
   * Snapshot 적재/생성 hook
   */
  public abstract loadFromSnapshot(snapshot: AggregateSnapshotState): void;
  public abstract createSnapshot(): object;
}
```

---

## Step 3. Application Outbound Port 작성

> 이 셋은 모두 **Driven Port**(코어가 외부에 위임할 계약)다. 그러므로 `application/ports/out/` 폴더에 둔다.
> 향후 Driving Port(UseCase 인터페이스)는 feature별로 `application/<feature>/ports/in/` 에 정의된다.

### 3-1. `event-store.port.ts`

```typescript
// src/contexts/identity/application/ports/out/event-store.port.ts
import type { DomainEvent } from "@/shared-kernel/domain/domain-event.base";

export const EVENT_STORE = Symbol("EVENT_STORE");

export interface EventStore {
  /**
   * 이벤트 추가. expectedVersion이 일치하지 않으면 ConcurrencyException 발생.
   */
  append(
    aggregateId: string,
    expectedVersion: number,
    events: readonly DomainEvent[],
  ): Promise<void>;

  /**
   * 특정 Aggregate의 모든 이벤트 (특정 버전 이후)
   */
  loadEvents(
    aggregateId: string,
    fromVersion?: number,
  ): Promise<DomainEvent[]>;

  /**
   * 특정 Aggregate Type의 모든 이벤트 (전역 순서) — Projection rebuild 용
   */
  loadEventsByType(
    aggregateType: string,
    fromSequence?: number,
  ): Promise<DomainEvent[]>;
}

export class ConcurrencyException extends Error {
  constructor(aggregateId: string, expected: number, actual: number) {
    super(
      `Concurrency conflict on aggregate ${aggregateId}: expected version ${expected}, actual ${actual}`,
    );
  }
}
```

### 3-2. `snapshot-store.port.ts`

```typescript
// src/contexts/identity/application/ports/out/snapshot-store.port.ts
export const SNAPSHOT_STORE = Symbol("SNAPSHOT_STORE");

export interface AggregateSnapshot {
  aggregateId: string;
  aggregateType: string;
  version: number;
  state: object;
  createdAt: Date;
}

export interface SnapshotStore {
  save(snapshot: AggregateSnapshot): Promise<void>;
  loadLatest(
    aggregateId: string,
    aggregateType: string,
  ): Promise<AggregateSnapshot | null>;
}
```

### 3-3. `event-publisher.port.ts`

```typescript
// src/contexts/identity/application/ports/out/event-publisher.port.ts
import type { DomainEvent } from "@/shared-kernel/domain/domain-event.base";

export const EVENT_PUBLISHER = Symbol("EVENT_PUBLISHER");

export interface EventPublisher {
  publishAll(events: readonly DomainEvent[]): Promise<void>;
}
```

---

## Step 4. MikroORM 엔티티 정의

> 엔티티는 DB 어댑터의 일부이므로 `adapter/out/persistence/event-store/` 아래에 둔다.

### 4-1. `event-store.entity.ts`

```typescript
// src/contexts/identity/adapter/out/persistence/event-store/event-store.entity.ts
import { Entity, PrimaryKey, Property, Unique, Index } from "@mikro-orm/core";

@Entity({ tableName: "event_store" })
@Unique({ properties: ["aggregateId", "eventVersion"] })
@Index({ properties: ["aggregateId", "eventVersion"] })
@Index({ properties: ["aggregateType", "eventType"] })
export class EventStoreEntity {
  @PrimaryKey({ type: "bigint", autoincrement: true })
  sequence!: bigint;

  @Property({ type: "uuid", unique: true })
  eventId!: string;

  @Property({ type: "uuid" })
  aggregateId!: string;

  @Property({ length: 50 })
  aggregateType!: string;

  @Property({ length: 100 })
  eventType!: string;

  @Property()
  eventVersion!: number;

  @Property({ type: "jsonb" })
  payload!: object;

  @Property({ type: "jsonb", nullable: true })
  metadata?: object;

  @Property({ type: "timestamptz" })
  occurredAt!: Date;
}
```

### 4-2. `aggregate-snapshot.entity.ts`

```typescript
// src/contexts/identity/adapter/out/persistence/event-store/aggregate-snapshot.entity.ts
import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

@Entity({ tableName: "aggregate_snapshots" })
export class AggregateSnapshotEntity {
  @PrimaryKey({ type: "uuid" })
  aggregateId!: string;

  @PrimaryKey()
  version!: number;

  @Property({ length: 50 })
  aggregateType!: string;

  @Property({ type: "jsonb" })
  state!: object;

  @Property({ type: "timestamptz" })
  createdAt!: Date;
}
```

---

## Step 5. EventStore 구현

```typescript
// src/contexts/identity/adapter/out/persistence/event-store/mikro-event-store.impl.ts
import { Injectable } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";

import {
  ConcurrencyException,
  type EventStore,
} from "@/contexts/identity/application/ports/out/event-store.port";
import {
  DomainEvent,
  type DomainEventMetadata,
} from "@/shared-kernel/domain/domain-event.base";

import { EventStoreEntity } from "./event-store.entity";

@Injectable()
export class MikroEventStore implements EventStore {
  constructor(private readonly em: EntityManager) {}

  async append(
    aggregateId: string,
    expectedVersion: number,
    events: readonly DomainEvent[],
  ): Promise<void> {
    if (events.length === 0) return;

    const fork = this.em.fork();

    // 1) 현재 최대 version 확인
    const latest = await fork
      .createQueryBuilder(EventStoreEntity)
      .select("event_version")
      .where({ aggregateId })
      .orderBy({ eventVersion: "desc" })
      .limit(1)
      .execute("get");

    const actualVersion: number = latest?.eventVersion ?? 0;

    if (actualVersion !== expectedVersion) {
      throw new ConcurrencyException(aggregateId, expectedVersion, actualVersion);
    }

    // 2) 모든 이벤트 insert (Unique 제약으로 중복 방지)
    const entities = events.map((e) =>
      fork.create(EventStoreEntity, {
        eventId: e.eventId,
        aggregateId: e.aggregateId,
        aggregateType: e.aggregateType,
        eventType: e.eventType,
        eventVersion: e.eventVersion,
        payload: e.payload as object,
        metadata: e.metadata,
        occurredAt: e.occurredAt,
      }),
    );
    await fork.persistAndFlush(entities);
  }

  async loadEvents(aggregateId: string, fromVersion: number = 0): Promise<DomainEvent[]> {
    const fork = this.em.fork();
    const rows = await fork.find(
      EventStoreEntity,
      { aggregateId, eventVersion: { $gt: fromVersion } },
      { orderBy: { eventVersion: "asc" } },
    );
    return rows.map((row) =>
      DomainEvent.restore({
        eventId: row.eventId,
        aggregateId: row.aggregateId,
        aggregateType: row.aggregateType,
        eventType: row.eventType,
        eventVersion: row.eventVersion,
        payload: row.payload,
        metadata: (row.metadata ?? {}) as DomainEventMetadata,
        occurredAt: row.occurredAt,
      }),
    );
  }

  async loadEventsByType(
    aggregateType: string,
    fromSequence: bigint = 0n,
  ): Promise<DomainEvent[]> {
    const fork = this.em.fork();
    const rows = await fork.find(
      EventStoreEntity,
      { aggregateType, sequence: { $gt: fromSequence } },
      { orderBy: { sequence: "asc" } },
    );
    return rows.map((row) =>
      DomainEvent.restore({
        eventId: row.eventId,
        aggregateId: row.aggregateId,
        aggregateType: row.aggregateType,
        eventType: row.eventType,
        eventVersion: row.eventVersion,
        payload: row.payload,
        metadata: (row.metadata ?? {}) as DomainEventMetadata,
        occurredAt: row.occurredAt,
      }),
    );
  }
}
```

> **메모**: `DomainEvent.restore()`는 EventStore 어댑터에서만 호출하는 *복원 전용 팩토리*다. `Aggregate.replay()`가 `event.eventType`으로 분기하는 구조이므로 구체 이벤트 클래스로 deserialize 하지 않아도 충분히 동작한다. 만약 향후 projection/외부 핸들러가 `instanceof MemberRegisteredEvent` 같은 분기를 요구한다면, `eventType -> 구체 클래스` 레지스트리를 두고 `restore`를 그쪽에 위임하는 식으로 확장한다.

---

## Step 6. SnapshotStore 구현

```typescript
// src/contexts/identity/adapter/out/persistence/event-store/mikro-snapshot-store.impl.ts
import { Injectable } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";

import type {
  AggregateSnapshot,
  SnapshotStore,
} from "@/contexts/identity/application/ports/out/snapshot-store.port";

import { AggregateSnapshotEntity } from "./aggregate-snapshot.entity";

@Injectable()
export class MikroSnapshotStore implements SnapshotStore {
  constructor(private readonly em: EntityManager) {}

  async save(snapshot: AggregateSnapshot): Promise<void> {
    const fork = this.em.fork();
    const entity = fork.create(AggregateSnapshotEntity, snapshot);
    await fork.persistAndFlush(entity);
  }

  async loadLatest(
    aggregateId: string,
    aggregateType: string,
  ): Promise<AggregateSnapshot | null> {
    const fork = this.em.fork();
    const row = await fork.findOne(
      AggregateSnapshotEntity,
      { aggregateId, aggregateType },
      { orderBy: { version: "desc" } },
    );
    return row
      ? {
          aggregateId: row.aggregateId,
          aggregateType: row.aggregateType,
          version: row.version,
          state: row.state,
          createdAt: row.createdAt,
        }
      : null;
  }
}
```

---

## Step 7. Projection Dispatcher

> `EventPublisher` port를 구현하는 driven adapter. `EventEmitter2`라는 외부(NestJS) 기술에 의존하므로 `adapter/out/projections/` 아래에 둔다.

```typescript
// src/contexts/identity/adapter/out/projections/projection-dispatcher.ts
import { Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";

import type { EventPublisher } from "@/contexts/identity/application/ports/out/event-publisher.port";
import type { DomainEvent } from "@/shared-kernel/domain/domain-event.base";

@Injectable()
export class ProjectionDispatcher implements EventPublisher {
  constructor(private readonly emitter: EventEmitter2) {}

  async publishAll(events: readonly DomainEvent[]): Promise<void> {
    for (const event of events) {
      // 이벤트 타입 이름으로 emit (예: "MemberRegistered")
      // Projector는 @OnEvent("MemberRegistered") 데코레이터로 구독
      await this.emitter.emitAsync(event.eventType, event);
    }
  }
}
```

> **Outbox 패턴 vs EventEmitter**: 트랜잭션 일관성을 위한 완전한 Outbox 패턴은 Phase 08에서 다룬다. 현재는 단순 InMemory dispatch로 시작하고, 같은 트랜잭션 안에서 EventStore.append() 와 Projection이 함께 commit 되는 구조로 충분하다. (만약 Projection이 실패하면 Event Replay로 복구 가능)

---

## Step 8. EventStore Module + 전역 등록

```typescript
// src/contexts/identity/adapter/out/persistence/event-store/event-store.module.ts
import { Module } from "@nestjs/common";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { EventEmitterModule } from "@nestjs/event-emitter";

import { EVENT_STORE } from "@/contexts/identity/application/ports/out/event-store.port";
import { SNAPSHOT_STORE } from "@/contexts/identity/application/ports/out/snapshot-store.port";
import { EVENT_PUBLISHER } from "@/contexts/identity/application/ports/out/event-publisher.port";

import { EventStoreEntity } from "./event-store.entity";
import { AggregateSnapshotEntity } from "./aggregate-snapshot.entity";
import { MikroEventStore } from "./mikro-event-store.impl";
import { MikroSnapshotStore } from "./mikro-snapshot-store.impl";
import { ProjectionDispatcher } from "../../projections/projection-dispatcher";

@Module({
  imports: [
    EventEmitterModule.forRoot({ wildcard: false, delimiter: "." }),
    MikroOrmModule.forFeature([EventStoreEntity, AggregateSnapshotEntity]),
  ],
  providers: [
    MikroEventStore,
    MikroSnapshotStore,
    ProjectionDispatcher,
    { provide: EVENT_STORE, useExisting: MikroEventStore },
    { provide: SNAPSHOT_STORE, useExisting: MikroSnapshotStore },
    { provide: EVENT_PUBLISHER, useExisting: ProjectionDispatcher },
  ],
  exports: [EVENT_STORE, SNAPSHOT_STORE, EVENT_PUBLISHER],
})
export class EventStoreModule {}
```

`shard-kernel.module.ts`에 등록:

```typescript
// src/shared-kernel/shard-kernel.module.ts
import { Global, Module } from "@nestjs/common";
import { EventStoreModule } from "@/contexts/identity/adapter/out/persistence/event-store/event-store.module";

@Global()
@Module({
  imports: [EventStoreModule],
  exports: [EventStoreModule],
})
export class ShardKernelModule {}
```

---

## Step 9. MikroORM 마이그레이션 적용

```bash
# 마이그레이션 디렉토리 준비
mkdir -p mikro/migrations

# mikro-orm.config.ts 작성 (또는 package.json에 mikro-orm config)
```

`mikro-orm.config.ts` 예시:
```typescript
import { defineConfig } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";

export default defineConfig({
  clientUrl: process.env.DATABASE_URL,
  entities: ["./dist/**/*.entity.js"],
  entitiesTs: ["./src/**/*.entity.ts"],
  migrations: {
    path: "./dist/mikro/migrations",
    pathTs: "./mikro/migrations",
  },
  extensions: [Migrator],
});
```

마이그레이션 생성/적용:
```bash
pnpm exec mikro-orm migration:create --initial
pnpm exec mikro-orm migration:up
```

DB에 접속해서 `event_store`, `aggregate_snapshots` 테이블이 생겼는지 확인.

---

## Step 10. TDD — 테스트 작성

### 10-1. `aggregate-root.spec.ts` (단위)

`AggregateRoot`를 상속받은 더미 Aggregate로 동작 검증.

```typescript
// test/unit/identity/shared/aggregate-root.spec.ts
import { AggregateRoot } from "@/shared-kernel/domain/aggregate-root.base";
import { DomainEvent } from "@/shared-kernel/domain/domain-event.base";

class FooCreated extends DomainEvent<{ name: string }> {
  constructor(aggregateId: string, version: number, name: string) {
    super({
      aggregateId,
      aggregateType: "Foo",
      eventType: "FooCreated",
      eventVersion: version,
      payload: { name },
    });
  }
}

class Foo extends AggregateRoot {
  private _id!: string;
  private _name!: string;
  public get id() { return this._id; }
  public get aggregateType() { return "Foo"; }
  public get name() { return this._name; }

  public static create(id: string, name: string): Foo {
    const foo = new Foo();
    foo.apply(new FooCreated(id, 1, name));
    return foo;
  }

  protected when(event: DomainEvent): void {
    if (event.eventType === "FooCreated") {
      const payload = event.payload as { name: string };
      this._id = event.aggregateId;
      this._name = payload.name;
    }
  }

  public createSnapshot(): object {
    return { id: this._id, name: this._name };
  }

  public loadFromSnapshot(snapshot: { state: { id: string; name: string }; version: number }): void {
    this._id = snapshot.state.id;
    this._name = snapshot.state.name;
    this._version = snapshot.version;
  }
}

describe("AggregateRoot", () => {
  it("apply()는 이벤트를 미커밋 버퍼에 쌓고 version을 올린다", () => {
    const foo = Foo.create("foo-1", "hello");
    expect(foo.version).toBe(1);
    expect(foo.getUncommittedEvents()).toHaveLength(1);
    expect(foo.name).toBe("hello");
  });

  it("markAsCommitted()로 미커밋 버퍼를 비운다", () => {
    const foo = Foo.create("foo-1", "hello");
    foo.markAsCommitted();
    expect(foo.getUncommittedEvents()).toHaveLength(0);
    expect(foo.version).toBe(1);  // version은 유지
  });

  it("loadFromHistory()로 이벤트 스트림으로부터 상태를 복원한다", () => {
    const events = [new FooCreated("foo-1", 1, "replayed")];
    const foo = new (Foo as any)() as Foo;
    foo.loadFromHistory(events);
    expect(foo.version).toBe(1);
    expect(foo.name).toBe("replayed");
    expect(foo.getUncommittedEvents()).toHaveLength(0); // 복원은 미커밋에 쌓지 않는다
  });
});
```

### 10-2. `mikro-event-store.spec.ts` (통합 — 실제 DB)

```typescript
// test/integration/identity/event-store/mikro-event-store.spec.ts
import { Test } from "@nestjs/testing";
import { MikroORM } from "@mikro-orm/postgresql";
import { ConfigModule } from "@nestjs/config";

import { loadEnv } from "@/config/env.config";
import { EventStoreModule } from "@/contexts/identity/adapter/out/persistence/event-store/event-store.module";
import { MikroEventStore } from "@/contexts/identity/adapter/out/persistence/event-store/mikro-event-store.impl";
import { ConcurrencyException } from "@/contexts/identity/application/ports/out/event-store.port";
import { DomainEvent } from "@/shared-kernel/domain/domain-event.base";

class TestEvent extends DomainEvent<{ msg: string }> {
  constructor(aggregateId: string, version: number, msg: string) {
    super({
      aggregateId,
      aggregateType: "Test",
      eventType: "TestEvent",
      eventVersion: version,
      payload: { msg },
    });
  }
}

describe("MikroEventStore (integration)", () => {
  let store: MikroEventStore;
  let orm: MikroORM;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, validate: loadEnv }),
        // ... MikroOrmModule 동적 import
        EventStoreModule,
      ],
    }).compile();
    store = mod.get(MikroEventStore);
    orm = mod.get(MikroORM);
    await orm.schema.refreshDatabase();
  });

  afterAll(() => orm.close());

  it("이벤트를 저장하고 다시 로드할 수 있다", async () => {
    const aggId = crypto.randomUUID();
    await store.append(aggId, 0, [new TestEvent(aggId, 1, "first")]);
    const events = await store.loadEvents(aggId);
    expect(events).toHaveLength(1);
    expect(events[0].payload).toEqual({ msg: "first" });
  });

  it("expectedVersion 불일치 시 ConcurrencyException", async () => {
    const aggId = crypto.randomUUID();
    await store.append(aggId, 0, [new TestEvent(aggId, 1, "first")]);
    await expect(
      store.append(aggId, 0, [new TestEvent(aggId, 1, "duplicate")]),
    ).rejects.toBeInstanceOf(ConcurrencyException);
  });

  it("loadEventsByType은 같은 타입의 이벤트만 전역 순서로 가져온다", async () => {
    const events = await store.loadEventsByType("Test");
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.aggregateType === "Test")).toBe(true);
  });
});
```

### 10-3. `mikro-snapshot-store.spec.ts` (통합)

```typescript
describe("MikroSnapshotStore (integration)", () => {
  it("save → loadLatest로 최신 스냅샷을 가져온다", async () => {
    const aggId = crypto.randomUUID();
    await snapshotStore.save({
      aggregateId: aggId,
      aggregateType: "Test",
      version: 5,
      state: { foo: "bar" },
      createdAt: new Date(),
    });
    await snapshotStore.save({
      aggregateId: aggId,
      aggregateType: "Test",
      version: 10,
      state: { foo: "baz" },
      createdAt: new Date(),
    });
    const latest = await snapshotStore.loadLatest(aggId, "Test");
    expect(latest?.version).toBe(10);
    expect(latest?.state).toEqual({ foo: "baz" });
  });

  it("존재하지 않으면 null", async () => {
    const latest = await snapshotStore.loadLatest(crypto.randomUUID(), "Test");
    expect(latest).toBeNull();
  });
});
```

---

## 검증 (Definition of Done)

```bash
# 단위 + 통합 테스트
pnpm test test/unit/identity/shared
pnpm test test/integration/identity/event-store

# DB 테이블 확인
docker exec -it prepair-db psql -U prepair -d prepair -c "\dt"
# → event_store, aggregate_snapshots 두 테이블이 있어야 함

# 빌드
pnpm run build
```

체크리스트:
- [ ] `AggregateRoot.loadFromHistory()`가 이벤트 스트림으로부터 상태 복원
- [ ] `EventStore.append()`가 낙관적 동시성 검증
- [ ] `SnapshotStore.loadLatest()`가 최신 버전 반환
- [ ] `ProjectionDispatcher.publishAll()`가 EventEmitter로 emit
- [ ] 단위 테스트 + 통합 테스트 모두 그린

---

## 흔한 함정

| 함정 | 해결 |
|------|------|
| `EntityManager`를 fork 없이 쓰면 request scope 충돌 | 항상 `this.em.fork()` |
| `payload`를 JSON.stringify로 저장 (MikroORM이 자동 처리하는데도) | `type: "jsonb"`만 선언, 직접 stringify 금지 |
| 이벤트 클래스를 그대로 deserialize 시도 | Concrete 클래스 복원 불필요. `eventType` 문자열 분기로 충분 |
| Snapshot version과 Aggregate version 혼동 | Snapshot version = "이 스냅샷이 반영한 마지막 event_version" |

---

다음: [`03-member-domain-layer.md`](./03-member-domain-layer.md) — Member 도메인 레이어 구현
