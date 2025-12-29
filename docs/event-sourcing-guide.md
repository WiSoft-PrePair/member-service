# Event Sourcing 구현 가이드

> 간단한 이벤트 저장 + 복원 방식

## 목차

1. [개요](#개요)
2. [아키텍처](#아키텍처)
3. [디렉토리 구조](#디렉토리-구조)
4. [구현 코드](#구현-코드)
   - [Domain Event](#1-domain-event)
   - [EventStore Port](#2-eventstore-port)
   - [EventStore Implementation](#3-eventstore-implementation)
   - [Application Service](#4-application-service)
   - [Member Reconstructor](#5-member-reconstructor)
   - [Module 설정](#6-module-설정)
5. [사용 예시](#사용-예시)
6. [테스트 가이드](#테스트-가이드)

---

## 개요

### 이벤트 소싱이란?

| 기존 방식 | 이벤트 소싱 |
|---------|----------|
| 현재 상태만 저장 | 상태 변경 이벤트를 순차적으로 저장 |
| UPDATE로 덮어쓰기 | INSERT only (이벤트 append) |
| 과거 이력 없음 | 모든 변경 이력 보존 |
| 현재 상태 = DB 조회 | 현재 상태 = 이벤트 재생 (replay) |

### 설계 원칙

- **도메인은 이벤트를 모름**: 기존 Member 클래스 변경 없음
- **Service에서 이벤트 생성**: 이벤트 타입과 페이로드를 Service에서 지정
- **Adapter에서 복원**: 복원 로직은 Reconstructor가 담당
- **최소한의 구조**: 필요한 파일만 생성

---

## 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                    Event Sourcing Flow                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  register 시                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │   Service    │───▶│  이벤트 생성  │───▶│  EventStore  │   │
│  │   (register) │    │  (타입 지정)  │    │   (저장)     │   │
│  └──────────────┘    └──────────────┘    └──────────────┘   │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────┐    ┌──────────────┐                       │
│  │    Member    │───▶│  Repository  │  ← Read Model 저장    │
│  │    (도메인)   │    │   (저장)     │                       │
│  └──────────────┘    └──────────────┘                       │
│                                                              │
│  복원 시                                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │  EventStore  │───▶│Reconstructor │───▶│    Member    │   │
│  │   (조회)     │    │   (재생)     │    │   (복원)     │   │
│  └──────────────┘    └──────────────┘    └──────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 계층별 책임

| 계층 | 책임 | 이벤트 관련 |
|-----|-----|----------|
| **Domain** | 비즈니스 로직 | 이벤트 모름 |
| **Application** | 유스케이스 조율 | 이벤트 생성, 타입 지정 |
| **Adapter** | 외부 시스템 연동 | 저장, 복원 |

---

## 디렉토리 구조

```
src/
├── domain/
│   ├── shared/
│   │   ├── domain-event.ts         # DomainEvent 타입
│   │   ├── event-store.ts          # EventStore 포트
│   │   └── index.ts
│   │
│   └── member/
│       └── ...                     # 기존 코드 (변경 없음)
│
├── application/
│   └── member/
│       └── register-member.service.ts  # 이벤트 생성 추가
│
└── adapter/
    ├── member/
    │   └── persistence/
    │       └── event-sourcing/
    │           └── member.reconstructor.ts  # 복원 담당
    │
    └── shared/
        └── persistence/
            └── event-store/
                ├── event-store.entity.ts      # MikroORM Entity
                ├── event-store.impl.ts  # EventStore 구현
                └── index.ts
```

---

## 구현 코드

### 1. Domain Event

#### `src/domain/shared/domain-event.ts`

```typescript
import { randomUUID } from "crypto";

/**
 * 도메인 이벤트 인터페이스
 */
export interface DomainEvent<T = Record<string, unknown>> {
  readonly eventId: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly payload: T;
  readonly occurredAt: Date;
}

/**
 * 도메인 이벤트 생성 헬퍼
 */
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
    occurredAt: new Date(),
  };
}
```

#### `src/domain/shared/event-store.ts`

```typescript
import type { DomainEvent } from "./domain-event";

export const EVENT_STORE = Symbol("EventStore");

/**
 * EventStore 포트 (인터페이스)
 */
export interface EventStore {
  /**
   * 이벤트 저장 (append-only)
   */
  append(event: DomainEvent): Promise<void>;

  /**
   * Aggregate ID로 이벤트 조회 (시간순)
   */
  getEvents(aggregateId: string): Promise<DomainEvent[]>;
}
```

#### `src/domain/shared/index.ts`

```typescript
export * from "./domain-event";
export * from "./event-store";
```

---

### 2. EventStore Port

이미 위의 `event-store.ts`에 정의됨.

---

### 3. EventStore Implementation

#### `src/adapter/shared/persistence/event-store/event-store.entity.ts`

```typescript
import { Entity, PrimaryKey, Property, Index } from "@mikro-orm/core";

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
```

#### `src/adapter/shared/persistence/event-store/event-store.impl.ts`

```typescript
import { Injectable } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/core";
import type { DomainEvent, EventStore } from "@/domain/shared";
import { EventEntity } from "./event.entity";

@Injectable()
export class EventStoreImpl implements EventStore {
  constructor(private readonly em: EntityManager) {}

  async append(event: DomainEvent): Promise<void> {
    const entity = new EventEntity();
    entity.eventId = event.eventId;
    entity.aggregateId = event.aggregateId;
    entity.eventType = event.eventType;
    entity.payload = event.payload;
    entity.occurredAt = event.occurredAt;

    this.em.persist(entity);
  }

  async getEvents(aggregateId: string): Promise<DomainEvent[]> {
    const entities = await this.em.find(
      EventEntity,
      { aggregateId },
      { orderBy: { occurredAt: "ASC" } },
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
```

#### `src/adapter/shared/persistence/event-store/index.ts`

```typescript
export * from "./event.entity";
export * from "./event-store.impl";
```

---

### 4. Application Service

#### `src/application/member/register-member.service.ts`

```typescript
import { Inject, Injectable } from "@nestjs/common";
import {
  Member,
  MEMBER_REPOSITORY,
  type MemberRepository,
  PASSWORD_ENCODER,
  type PasswordEncoder,
  type RegisterMemberRequest,
} from "@/domain/member";
import { EVENT_STORE, type EventStore, createDomainEvent } from "@/domain/shared";
import { EntityManager, Transactional } from "@mikro-orm/core";

@Injectable()
export class RegisterMemberService {
  constructor(
    @Inject(MEMBER_REPOSITORY)
    private readonly memberRepository: MemberRepository,
    @Inject(PASSWORD_ENCODER)
    private readonly passwordEncoder: PasswordEncoder,
    @Inject(EVENT_STORE)
    private readonly eventStore: EventStore,
    private readonly em: EntityManager,
  ) {}

  @Transactional()
  async register(registerRequest: RegisterMemberRequest): Promise<Member> {
    const member: Member = Member.register(registerRequest, this.passwordEncoder);

    // 1. Read Model 저장 (기존 방식)
    this.memberRepository.register(member);

    // 2. 이벤트 저장 (Service에서 이벤트 타입 지정)
    await this.eventStore.append(
      createDomainEvent(member.id, "MemberRegistered", {
        id: member.id,
        email: member.email.value,
        password: member.password.value,
        job: member.job,
        nickname: member.nickname,
        notification: member.notification,
        frequency: member.frequency,
        point: member.point,
        isPro: member.isPro,
      }),
    );

    await this.em.flush();
    return member;
  }
}
```

---

### 5. Member Reconstructor

#### `src/adapter/member/persistence/event-sourcing/member.reconstructor.ts`

```typescript
import { Injectable } from "@nestjs/common";
import { Member } from "@/domain/member";
import { Email, Password } from "@/domain/member/value-objects";
import type { DomainEvent } from "@/domain/shared";

interface MemberPayload {
  id: string;
  email: string;
  password: string;
  job: string;
  nickname: string;
  notification: string;
  frequency: string;
  point: number;
  isPro: boolean;
}

@Injectable()
export class MemberReconstructor {
  /**
   * 이벤트 목록에서 Member 복원
   */
  reconstruct(events: DomainEvent[]): Member {
    if (events.length === 0) {
      throw new Error("Cannot reconstruct: no events");
    }

    // 이벤트를 순서대로 적용하여 최종 상태 계산
    let state: Partial<MemberPayload> = {};

    for (const event of events) {
      state = this.apply(state, event);
    }

    return this.toMember(state as MemberPayload);
  }

  private apply(
    state: Partial<MemberPayload>,
    event: DomainEvent,
  ): Partial<MemberPayload> {
    switch (event.eventType) {
      case "MemberRegistered":
        return { ...state, ...(event.payload as MemberPayload) };

      // 나중에 이벤트 추가 시:
      // case "MemberEmailChanged":
      //   return { ...state, email: (event.payload as any).newEmail };

      default:
        return state;
    }
  }

  private toMember(payload: MemberPayload): Member {
    return Member.of({
      id: payload.id,
      email: new Email(payload.email),
      password: Password.fromHashed(payload.password),
      job: payload.job,
      nickname: payload.nickname,
      notification: payload.notification as any,
      frequency: payload.frequency as any,
      point: payload.point,
      isPro: payload.isPro,
    });
  }
}
```

---

### 6. Module 설정

#### `src/adapter/shared/persistence/event-store/event-store.module.ts`

```typescript
import { Module } from "@nestjs/common";
import { EVENT_STORE } from "@/domain/shared";
import { EventStoreImpl } from "./event-store.impl";

@Module({
  providers: [
    {
      provide: EVENT_STORE,
      useClass: EventStoreImpl,
    },
  ],
  exports: [EVENT_STORE],
})
export class EventStoreModule {}
```

#### `src/adapter/member/member.module.ts` (수정)

```typescript
import { Module } from "@nestjs/common";
import { MemberController } from "@/adapter/member/api";
import { RegisterMemberService } from "@/application/member";
import { MemberMapper, MemberRepositoryImpl } from "@/adapter/member/persistence";
import { MEMBER_REPOSITORY, PASSWORD_ENCODER } from "@/domain/member";
import { SecurePasswordEncoder } from "@/adapter/member/security";
import { EventStoreModule } from "@/adapter/shared/persistence/event-store/event-store.module";
import { MemberReconstructor } from "@/adapter/member/persistence/event-sourcing/member.reconstructor";

@Module({
  imports: [EventStoreModule],
  controllers: [MemberController],
  providers: [
    RegisterMemberService,
    MemberMapper,
    MemberReconstructor,
    {
      provide: PASSWORD_ENCODER,
      useClass: SecurePasswordEncoder,
    },
    {
      provide: MEMBER_REPOSITORY,
      useClass: MemberRepositoryImpl,
    },
  ],
  exports: [RegisterMemberService, MemberReconstructor],
})
export class MemberModule {}
```

---

## 사용 예시

### 회원 가입 (이벤트 저장)

```typescript
const member = await registerMemberService.register({
  email: "user@example.com",
  password: "securePassword123",
  job: "Developer",
  nickname: "john",
  notification: NotificationEnum.EMAIL,
  frequency: FrequencyEnum.WEEKLY,
});

// Member 반환 + 이벤트 저장됨
```

### 이벤트에서 복원

```typescript
// Service에 복원 메서드 추가
async restoreFromEvents(memberId: string): Promise<Member | null> {
  const events = await this.eventStore.getEvents(memberId);

  if (events.length === 0) {
    return null;
  }

  return this.reconstructor.reconstruct(events);
}

// 사용
const member = await registerMemberService.restoreFromEvents(memberId);
```

### 이벤트 조회

```typescript
const events = await eventStore.getEvents(memberId);

// [
//   { eventType: "MemberRegistered", payload: { ... }, occurredAt: ... }
// ]
```

---

## 테스트 가이드

### Reconstructor 테스트

```typescript
describe("MemberReconstructor", () => {
  const reconstructor = new MemberReconstructor();

  it("reconstructs Member from MemberRegistered event", () => {
    const events: DomainEvent[] = [
      {
        eventId: "event-1",
        aggregateId: "member-1",
        eventType: "MemberRegistered",
        payload: {
          id: "member-1",
          email: "test@example.com",
          password: "hashed-password",
          job: "Developer",
          nickname: "tester",
          notification: "EMAIL",
          frequency: "WEEKLY",
          point: 0,
          isPro: false,
        },
        occurredAt: new Date(),
      },
    ];

    const member = reconstructor.reconstruct(events);

    expect(member.id).toBe("member-1");
    expect(member.email.value).toBe("test@example.com");
    expect(member.job).toBe("Developer");
  });

  it("throws error when no events", () => {
    expect(() => reconstructor.reconstruct([])).toThrow("no events");
  });
});
```

### EventStore 테스트

```typescript
describe("EventStoreImpl", () => {
  let eventStore: EventStoreImpl;
  let em: EntityManager;

  beforeEach(() => {
    // MikroORM 테스트 설정
  });

  it("appends and retrieves events", async () => {
    const event = createDomainEvent("agg-1", "TestEvent", { foo: "bar" });

    await eventStore.append(event);
    await em.flush();

    const events = await eventStore.getEvents("agg-1");

    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("TestEvent");
  });
});
```

---

## 새 이벤트 추가 체크리스트

1. Service에서 `createDomainEvent()`로 이벤트 생성
2. `MemberReconstructor`의 `apply()` 메서드에 case 추가
3. 테스트 작성

```typescript
// 예: 이메일 변경 이벤트 추가

// 1. Service에서 이벤트 생성
await this.eventStore.append(
  createDomainEvent(member.id, "MemberEmailChanged", {
    oldEmail: member.email.value,
    newEmail: newEmail,
  }),
);

// 2. Reconstructor에 case 추가
case "MemberEmailChanged":
  return { ...state, email: (event.payload as any).newEmail };
```

---

## 참고 자료

- [Event Sourcing Pattern - Microsoft](https://docs.microsoft.com/en-us/azure/architecture/patterns/event-sourcing)
- [Martin Fowler - Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html)
