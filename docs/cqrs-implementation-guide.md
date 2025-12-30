# CQRS + Event Store 구현 가이드

> NestJS + MikroORM + DDD 기반의 CQRS 패턴 적용

## 목차

1. [개요](#개요)
2. [현재 아키텍처 분석](#현재-아키텍처-분석)
3. [CQRS 개념](#cqrs-개념)
4. [목표 아키텍처](#목표-아키텍처)
5. [폴더 구조 설계](#폴더-구조-설계)
6. [구현 순서](#구현-순서)
7. [상세 구현](#상세-구현)
8. [테스트 가이드](#테스트-가이드)
9. [마이그레이션 체크리스트](#마이그레이션-체크리스트)

---

## 개요

### 목표

현재 구현된 **Event Store** 기반에 **CQRS (Command Query Responsibility Segregation)** 패턴을 적용하여:

1. **Command(쓰기)와 Query(읽기) 책임 분리**
2. **Event-Driven Architecture 기반 확장**
3. **Read Model을 통한 쿼리 최적화**
4. **도메인 이벤트 기반의 느슨한 결합**

### 사용 기술

| 기술 | 용도 |
|-----|-----|
| `@nestjs/cqrs` | Command/Query/Event Bus |
| `MikroORM` | Persistence (Write/Read Model) |
| `EventStore` | 도메인 이벤트 영속화 |

---

## 현재 아키텍처 분석

### 현재 폴더 구조

```
src/
├── adapter/
│   ├── member/
│   │   ├── api/
│   │   │   ├── dto/
│   │   │   │   └── register-member-request.dto.ts
│   │   │   └── member.controller.ts
│   │   ├── persistence/
│   │   │   └── mikro-orm/
│   │   │       ├── entity/
│   │   │       │   └── member.entity.ts
│   │   │       ├── mapper/
│   │   │       │   └── member.mapper.ts
│   │   │       └── member.repository-impl.ts
│   │   ├── security/
│   │   │   └── secure-password-encoder.ts
│   │   └── member.module.ts
│   └── shared/
│       └── event-store/
│           ├── event-store.entity.ts
│           ├── event-store.impl.ts
│           └── event-store.module.ts
├── application/
│   └── member/
│       └── register-member.service.ts    # ← 현재: Application Service
├── domain/
│   ├── member/
│   │   ├── enums/
│   │   ├── exception/
│   │   ├── types/
│   │   ├── value-objects/
│   │   ├── member.ts
│   │   ├── member.repository.ts
│   │   └── password-encoder.ts
│   └── shared/
│       ├── domain-event.ts
│       └── event-store.ts
├── config/
├── app.module.ts
└── main.ts
```

### 현재 흐름 (Command + Query 혼합)

```
Controller → Application Service → Domain → Repository → DB
                    ↓
               EventStore.append()
```

**문제점:**
- 읽기/쓰기가 동일한 모델 사용
- 복잡한 조회 시 도메인 모델 로딩 필요
- 이벤트가 저장만 되고 활용되지 않음

---

## CQRS 개념

### Command vs Query

| 구분 | Command (쓰기) | Query (읽기) |
|-----|---------------|-------------|
| **목적** | 상태 변경 | 데이터 조회 |
| **반환값** | void 또는 ID | DTO/ViewModel |
| **모델** | Domain Model (Aggregate) | Read Model (Projection) |
| **저장소** | Write DB + EventStore | Read DB (최적화된 스키마) |

### 이벤트 흐름

```
┌─────────────────────────────────────────────────────────────────┐
│                        CQRS + Event Store                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [Command Side]                                                  │
│                                                                  │
│  Controller ─→ CommandBus ─→ CommandHandler                     │
│                                      │                           │
│                                      ▼                           │
│                               Domain Aggregate                   │
│                                      │                           │
│                          ┌──────────┴──────────┐                │
│                          ▼                      ▼                │
│                    Repository              EventStore            │
│                    (Write Model)           (이벤트 저장)          │
│                                                 │                │
│                                                 ▼                │
│                                            EventBus              │
│                                                 │                │
│  ────────────────────────────────────────────────────────────── │
│                                                 │                │
│  [Query Side]                                   ▼                │
│                                           EventHandler           │
│  Controller ─→ QueryBus ─→ QueryHandler        │                │
│                     │                           ▼                │
│                     ▼                      Read Model            │
│               Read Repository              (Projection)          │
│                     │                           │                │
│                     └───────────────────────────┘                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 목표 아키텍처

### 계층별 책임

| 계층 | Command 측 | Query 측 |
|-----|-----------|----------|
| **Adapter/API** | Command DTO → Command 변환 | Query DTO 반환 |
| **Application** | CommandHandler (유스케이스) | QueryHandler (조회) |
| **Domain** | Aggregate, Domain Event | - |
| **Infrastructure** | Write Repository, EventStore | Read Repository |

### 핵심 원칙

1. **Command는 void 반환**: 생성 시 ID만 반환 가능
2. **Query는 상태 변경 없음**: 순수 조회만
3. **Event로 동기화**: Write → Event → Read Model 업데이트
4. **Eventual Consistency**: Read Model은 비동기 업데이트 (동일 트랜잭션 내 처리로 강한 일관성도 가능)

---

## 폴더 구조 설계

### CQRS 적용 후 구조

> **설계 원칙**: Command + Handler를 같은 파일에 배치하여 파일 수를 최소화

```
src/
├── adapter/
│   ├── member/
│   │   ├── api/
│   │   │   ├── dto/
│   │   │   │   ├── request/
│   │   │   │   │   └── register-member.request.dto.ts
│   │   │   │   └── response/
│   │   │   │       ├── member.response.dto.ts
│   │   │   │       └── member-detail.response.dto.ts
│   │   │   └── member.controller.ts
│   │   │
│   │   ├── persistence/
│   │   │   ├── write/                          # Write Side
│   │   │   │   ├── entity/
│   │   │   │   │   └── member.entity.ts
│   │   │   │   ├── mapper/
│   │   │   │   │   └── member.mapper.ts
│   │   │   │   └── member.repository-impl.ts
│   │   │   │
│   │   │   └── read/                           # Read Side (NEW)
│   │   │       ├── entity/
│   │   │       │   └── member-read.entity.ts
│   │   │       └── member-read.repository.ts
│   │   │
│   │   ├── security/
│   │   │   └── secure-password-encoder.ts
│   │   │
│   │   └── member.module.ts
│   │
│   └── shared/
│       └── event-store/
│           ├── event-store.entity.ts
│           ├── event-store.impl.ts
│           └── event-store.module.ts
│
├── application/
│   └── member/
│       ├── command/                            # Command Side (NEW)
│       │   ├── member-register.command.ts      # Command + Handler 통합
│       │   ├── change-email.command.ts
│       │   └── index.ts
│       │
│       ├── query/                              # Query Side (NEW)
│       │   ├── get-member.query.ts             # Query + Handler 통합
│       │   ├── get-member-list.query.ts
│       │   └── index.ts
│       │
│       ├── event/                              # Event Handlers (NEW)
│       │   ├── member-registered.handler.ts
│       │   └── index.ts
│       │
│       └── index.ts
│
├── domain/
│   ├── member/
│   │   ├── enums/
│   │   ├── exception/
│   │   ├── types/
│   │   ├── value-objects/
│   │   ├── event/                              # Domain Events (NEW)
│   │   │   ├── member-registered.event.ts
│   │   │   └── index.ts
│   │   ├── member.ts
│   │   ├── member.repository.ts
│   │   └── password-encoder.ts
│   │
│   └── shared/
│       ├── domain-event.ts
│       └── event-store.ts
│
├── config/
├── app.module.ts
└── main.ts
```

### 파일 명명 규칙

| 유형 | 패턴 | 내용 |
|-----|-----|-----|
| Command | `{action}.command.ts` | Command 클래스 + CommandHandler 클래스 |
| Query | `{action}.query.ts` | Query 클래스 + QueryHandler 클래스 + Result 클래스 |
| Event | `{event-name}.event.ts` | Domain Event 클래스 |
| Event Handler | `{event-name}.handler.ts` | EventHandler 클래스 (Projection) |

### 기존 방식 vs 대안 1 비교

```
# 기존 방식: 폴더별 분리 (파일 많음)
application/member/command/
├── register-member/
│   ├── member-register.command.ts
│   └── member-register.handler.ts      # 유스케이스마다 2개 파일
├── change-email/
│   ├── change-email.command.ts
│   └── change-email.handler.ts

# 대안 1: 파일 통합 (파일 최소화)
application/member/command/
├── member-register.command.ts          # Command + Handler 함께
├── change-email.command.ts             # 유스케이스마다 1개 파일
└── index.ts
```

---

## 구현 순서

### Phase 1: 기반 설정 (필수)

| 순서 | 작업 | 파일 |
|-----|-----|-----|
| 1-1 | CqrsModule 설정 | `app.module.ts` |
| 1-2 | Domain Event 클래스 정의 | `domain/member/event/member-registered.event.ts` |

### Phase 2: Command Side 구현

| 순서 | 작업 | 파일 |
|-----|-----|-----|
| 2-1 | MemberRegisterCommand + Handler | `application/member/command/member-register.command.ts` |
| 2-2 | Controller에서 CommandBus 사용 | `adapter/member/api/member.controller.ts` |
| 2-3 | 기존 Service 파일 제거 | `application/member/register-member.service.ts` 삭제 |

### Phase 3: Query Side 구현

| 순서 | 작업 | 파일 |
|-----|-----|-----|
| 3-1 | Read Model Entity 생성 | `adapter/member/persistence/read/entity/member-read.entity.ts` |
| 3-2 | Read Repository 구현 | `adapter/member/persistence/read/member-read.repository.ts` |
| 3-3 | GetMemberQuery + Handler | `application/member/query/get-member.query.ts` |
| 3-4 | Controller에서 QueryBus 사용 | `adapter/member/api/member.controller.ts` |

### Phase 4: Event Handler (Projection)

| 순서 | 작업 | 파일 |
|-----|-----|-----|
| 4-1 | MemberRegisteredHandler 구현 | `application/member/event/member-registered.handler.ts` |

### Phase 5: 모듈 통합

| 순서 | 작업 | 파일 |
|-----|-----|-----|
| 5-1 | MemberModule 업데이트 | `adapter/member/member.module.ts` |

---

## 상세 구현

### Phase 1: 기반 설정

#### 1-1. CqrsModule 설정

**파일:** `src/app.module.ts`

```typescript
import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { ConfigModule } from "@/config";
import { PersistenceModule } from "@/adapter/shared/persistence/persistence.module";
import { MemberModule } from "@/adapter/member/member.module";

@Module({
  imports: [
    ConfigModule,
    CqrsModule.forRoot(),  // 전역 CQRS 설정
    PersistenceModule,
    MemberModule,
  ],
})
export class AppModule {}
```

#### 1-2. Domain Event 클래스 정의

**파일:** `src/domain/member/event/member-registered.event.ts`

```typescript
import { IEvent } from "@nestjs/cqrs";
import type { FrequencyEnum, NotificationEnum } from "@/domain/member/enums";

export class MemberRegisteredEvent implements IEvent {
  constructor(
    public readonly memberId: string,
    public readonly email: string,
    public readonly job: string,
    public readonly nickname: string,
    public readonly notification: NotificationEnum,
    public readonly frequency: FrequencyEnum,
    public readonly occurredAt: Date = new Date(),
  ) {}
}
```

**파일:** `src/domain/member/event/index.ts`

```typescript
export * from "./member-registered.event";
```

---

### Phase 2: Command Side 구현

#### 2-1. Command + Handler 통합 파일

**파일:** `src/application/member/command/member-register.command.ts`

```typescript
import { CommandHandler, EventBus, ICommand, ICommandHandler } from "@nestjs/cqrs";
import { Inject, Injectable } from "@nestjs/common";
import { EntityManager, Transactional } from "@mikro-orm/core";
import {
  Member,
  MEMBER_REPOSITORY,
  type MemberRepository,
  PASSWORD_ENCODER,
  type PasswordEncoder,
} from "@/domain/member";
import type { FrequencyEnum, NotificationEnum } from "@/domain/member/enums";
import { MemberRegisteredEvent } from "@/domain/member/event";
import {
  createDomainEvent,
  EVENT_STORE,
  type EventStore,
} from "@/domain/shared";

// ============================================================
// Command
// ============================================================
export class MemberRegisterCommand implements ICommand {
  constructor(
    public readonly email: string,
    public readonly password: string,
    public readonly job: string,
    public readonly nickname: string,
    public readonly notification: NotificationEnum,
    public readonly frequency: FrequencyEnum,
  ) {}
}

// ============================================================
// Handler
// ============================================================
@Injectable()
@CommandHandler(MemberRegisterCommand)
export class MemberRegisterHandler
  implements ICommandHandler<MemberRegisterCommand, string>
{
  constructor(
    @Inject(MEMBER_REPOSITORY)
    private readonly memberRepository: MemberRepository,
    @Inject(PASSWORD_ENCODER)
    private readonly passwordEncoder: PasswordEncoder,
    @Inject(EVENT_STORE)
    private readonly eventStore: EventStore,
    private readonly eventBus: EventBus,
    private readonly em: EntityManager,
  ) {}

  @Transactional()
  async execute(command: MemberRegisterCommand): Promise<string> {
    // 1. Domain Aggregate 생성
    const member = Member.register(
      {
        email: command.email,
        password: command.password,
        job: command.job,
        nickname: command.nickname,
        notification: command.notification,
        frequency: command.frequency,
      },
      this.passwordEncoder,
    );

    // 2. Write Model 저장
    this.memberRepository.register(member);

    // 3. Event Store에 이벤트 저장 (영속화)
    this.eventStore.append(
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

    // 4. Event Bus로 이벤트 발행 (다른 핸들러에게 알림)
    this.eventBus.publish(
      new MemberRegisteredEvent(
        member.id,
        member.email.value,
        member.job,
        member.nickname,
        member.notification,
        member.frequency,
      ),
    );

    // 5. 생성된 ID 반환
    return member.id;
  }
}
```

**파일:** `src/application/member/command/index.ts`

```typescript
export { MemberRegisterCommand, MemberRegisterHandler } from "./register-member.command";
// 추가 Command는 여기에 export
// export { ChangeEmailCommand, ChangeEmailHandler } from "./change-email.command";
```

#### 2-2. Controller 수정

**파일:** `src/adapter/member/api/member.controller.ts`

```typescript
import { Body, Controller, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { RegisterMemberRequestDto } from "./dto/request/register-member.request.dto";
import { MemberRegisterCommand } from "@/application/member/command";

@Controller("members")
export class MemberController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post("register")
  async register(@Body() dto: RegisterMemberRequestDto): Promise<{ id: string }> {
    const memberId = await this.commandBus.execute<MemberRegisterCommand, string>(
      new MemberRegisterCommand(
        dto.email,
        dto.password,
        dto.job,
        dto.nickname,
        dto.notification,
        dto.frequency,
      ),
    );

    return { id: memberId };
  }
}
```

---

### Phase 3: Query Side 구현

#### 3-1. Read Model Entity

**파일:** `src/adapter/member/persistence/read/entity/member-read.entity.ts`

```typescript
import { Entity, PrimaryKey, Property, Index } from "@mikro-orm/core";

/**
 * Read Model: 조회에 최적화된 비정규화 테이블
 * Write Model과 별도로 관리 (같은 DB 또는 다른 DB)
 */
@Entity({ tableName: "member_read" })
export class MemberReadEntity {
  @PrimaryKey()
  id!: string;

  @Property()
  @Index()
  email!: string;

  @Property()
  job!: string;

  @Property()
  nickname!: string;

  @Property()
  notification!: string;

  @Property()
  frequency!: string;

  @Property({ default: 0 })
  point!: number;

  @Property({ default: false })
  isPro!: boolean;

  @Property()
  createdAt!: Date;

  @Property({ onUpdate: () => new Date() })
  updatedAt!: Date;
}
```

#### 3-2. Read Repository

**파일:** `src/adapter/member/persistence/read/member-read.repository.ts`

```typescript
import { Injectable } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/core";
import { MemberReadEntity } from "./entity/member-read.entity";

export const MEMBER_READ_REPOSITORY = Symbol("MemberReadRepository");

export interface MemberReadRepository {
  findById(id: string): Promise<MemberReadEntity | null>;
  findByEmail(email: string): Promise<MemberReadEntity | null>;
  findAll(options?: { limit?: number; offset?: number }): Promise<MemberReadEntity[]>;
  save(entity: MemberReadEntity): void;
}

@Injectable()
export class MemberReadRepositoryImpl implements MemberReadRepository {
  constructor(private readonly em: EntityManager) {}

  async findById(id: string): Promise<MemberReadEntity | null> {
    return this.em.findOne(MemberReadEntity, { id });
  }

  async findByEmail(email: string): Promise<MemberReadEntity | null> {
    return this.em.findOne(MemberReadEntity, { email });
  }

  async findAll(options?: { limit?: number; offset?: number }): Promise<MemberReadEntity[]> {
    return this.em.find(MemberReadEntity, {}, {
      limit: options?.limit ?? 20,
      offset: options?.offset ?? 0,
      orderBy: { createdAt: "DESC" },
    });
  }

  save(entity: MemberReadEntity): void {
    this.em.persist(entity);
  }
}
```

**파일:** `src/adapter/member/persistence/read/index.ts`

```typescript
export * from "./entity/member-read.entity";
export * from "./member-read.repository";
```

#### 3-3. Query + Handler 통합 파일

**파일:** `src/application/member/query/get-member.query.ts`

```typescript
import { IQuery, IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  MEMBER_READ_REPOSITORY,
  type MemberReadRepository,
} from "@/adapter/member/persistence/read";

// ============================================================
// Result (Response DTO)
// ============================================================
export class GetMemberResult {
  constructor(
    public readonly id: string,
    public readonly email: string,
    public readonly job: string,
    public readonly nickname: string,
    public readonly notification: string,
    public readonly frequency: string,
    public readonly point: number,
    public readonly isPro: boolean,
  ) {}
}

// ============================================================
// Query
// ============================================================
export class GetMemberQuery implements IQuery {
  constructor(public readonly memberId: string) {}
}

// ============================================================
// Handler
// ============================================================
@Injectable()
@QueryHandler(GetMemberQuery)
export class GetMemberHandler
  implements IQueryHandler<GetMemberQuery, GetMemberResult>
{
  constructor(
    @Inject(MEMBER_READ_REPOSITORY)
    private readonly memberReadRepository: MemberReadRepository,
  ) {}

  async execute(query: GetMemberQuery): Promise<GetMemberResult> {
    const member = await this.memberReadRepository.findById(query.memberId);

    if (!member) {
      throw new NotFoundException(`Member not found: ${query.memberId}`);
    }

    return new GetMemberResult(
      member.id,
      member.email,
      member.job,
      member.nickname,
      member.notification,
      member.frequency,
      member.point,
      member.isPro,
    );
  }
}
```

**파일:** `src/application/member/query/index.ts`

```typescript
export { GetMemberQuery, GetMemberResult, GetMemberHandler } from "./get-member.query";
// 추가 Query는 여기에 export
// export { GetMemberListQuery, GetMemberListResult, GetMemberListHandler } from "./get-member-list.query";
```

#### 3-4. Controller에 Query 추가

**파일:** `src/adapter/member/api/member.controller.ts` (확장)

```typescript
import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { RegisterMemberRequestDto } from "./dto/request/register-member.request.dto";
import { MemberRegisterCommand } from "@/application/member/command";
import { GetMemberQuery, GetMemberResult } from "@/application/member/query";

@Controller("members")
export class MemberController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post("register")
  async register(@Body() dto: RegisterMemberRequestDto): Promise<{ id: string }> {
    const memberId = await this.commandBus.execute<MemberRegisterCommand, string>(
      new MemberRegisterCommand(
        dto.email,
        dto.password,
        dto.job,
        dto.nickname,
        dto.notification,
        dto.frequency,
      ),
    );

    return { id: memberId };
  }

  @Get(":id")
  async getMember(@Param("id") id: string): Promise<GetMemberResult> {
    return this.queryBus.execute<GetMemberQuery, GetMemberResult>(
      new GetMemberQuery(id),
    );
  }
}
```

---

### Phase 4: Event Handler (Projection)

#### 4-1. Event Handler 구현

**파일:** `src/application/member/event/member-registered.handler.ts`

```typescript
import { EventsHandler, IEventHandler } from "@nestjs/cqrs";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/core";
import { MemberRegisteredEvent } from "@/domain/member/event";
import {
  MEMBER_READ_REPOSITORY,
  type MemberReadRepository,
  MemberReadEntity,
} from "@/adapter/member/persistence/read";

@Injectable()
@EventsHandler(MemberRegisteredEvent)
export class MemberRegisteredHandler
  implements IEventHandler<MemberRegisteredEvent>
{
  private readonly logger = new Logger(MemberRegisteredHandler.name);

  constructor(
    @Inject(MEMBER_READ_REPOSITORY)
    private readonly memberReadRepository: MemberReadRepository,
    private readonly em: EntityManager,
  ) {}

  async handle(event: MemberRegisteredEvent): Promise<void> {
    this.logger.log(`Projecting MemberRegisteredEvent: ${event.memberId}`);

    // Read Model 생성 (Projection)
    const readEntity = new MemberReadEntity();
    readEntity.id = event.memberId;
    readEntity.email = event.email;
    readEntity.job = event.job;
    readEntity.nickname = event.nickname;
    readEntity.notification = event.notification;
    readEntity.frequency = event.frequency;
    readEntity.point = 0;
    readEntity.isPro = false;
    readEntity.createdAt = event.occurredAt;
    readEntity.updatedAt = event.occurredAt;

    this.memberReadRepository.save(readEntity);
    await this.em.flush();

    this.logger.log(`Projection completed for member: ${event.memberId}`);
  }
}
```

**파일:** `src/application/member/event/index.ts`

```typescript
export * from "./member-registered.handler";
```

---

### Phase 5: 모듈 통합

#### 5-1. MemberModule 업데이트

**파일:** `src/adapter/member/member.module.ts`

```typescript
import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";

// API
import { MemberController } from "@/adapter/member/api/member.controller";

// Write Side - Persistence
import {
  MemberMapper,
  MemberRepositoryImpl,
} from "@/adapter/member/persistence/mikro-orm";
import { MEMBER_REPOSITORY } from "@/domain/member";

// Read Side - Persistence
import {
  MEMBER_READ_REPOSITORY,
  MemberReadRepositoryImpl,
} from "@/adapter/member/persistence/read";

// Security
import { SecurePasswordEncoder } from "@/adapter/member/security";
import { PASSWORD_ENCODER } from "@/domain/member";

// Event Store
import { EventStoreModule } from "@/adapter/shared/event-store/event-store.module";

// Command Handlers
import { MemberRegisterHandler } from "@/application/member/command";

// Query Handlers
import { GetMemberHandler } from "@/application/member/query";

// Event Handlers
import { MemberRegisteredHandler } from "@/application/member/event";

// Handler 배열로 관리
const CommandHandlers = [MemberRegisterHandler];
const QueryHandlers = [GetMemberHandler];
const EventHandlers = [MemberRegisteredHandler];

@Module({
  imports: [
    CqrsModule,
    EventStoreModule,
  ],
  controllers: [MemberController],
  providers: [
    // Handlers
    ...CommandHandlers,
    ...QueryHandlers,
    ...EventHandlers,

    // Write Side
    MemberMapper,
    {
      provide: MEMBER_REPOSITORY,
      useClass: MemberRepositoryImpl,
    },

    // Read Side
    {
      provide: MEMBER_READ_REPOSITORY,
      useClass: MemberReadRepositoryImpl,
    },

    // Security
    {
      provide: PASSWORD_ENCODER,
      useClass: SecurePasswordEncoder,
    },
  ],
  exports: [MEMBER_REPOSITORY, MEMBER_READ_REPOSITORY],
})
export class MemberModule {}
```

---

## 테스트 가이드

### Command Handler 테스트

**파일:** `src/application/member/command/register-member.command.spec.ts`

```typescript
import { Test, TestingModule } from "@nestjs/testing";
import { EventBus } from "@nestjs/cqrs";
import { EntityManager } from "@mikro-orm/core";
import { MemberRegisterCommand, MemberRegisterHandler } from "./register-member.command";
import { MEMBER_REPOSITORY, PASSWORD_ENCODER } from "@/domain/member";
import { EVENT_STORE } from "@/domain/shared";
import { NotificationEnum, FrequencyEnum } from "@/domain/member/enums";

describe("MemberRegisterHandler", () => {
  let handler: MemberRegisterHandler;
  let memberRepository: jest.Mocked<any>;
  let eventStore: jest.Mocked<any>;
  let eventBus: jest.Mocked<EventBus>;

  beforeEach(async () => {
    memberRepository = { register: jest.fn() };
    eventStore = { append: jest.fn() };
    eventBus = { publish: jest.fn() } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemberRegisterHandler,
        { provide: MEMBER_REPOSITORY, useValue: memberRepository },
        { provide: PASSWORD_ENCODER, useValue: { encode: (p: string) => `hashed_${p}` } },
        { provide: EVENT_STORE, useValue: eventStore },
        { provide: EventBus, useValue: eventBus },
        { provide: EntityManager, useValue: { flush: jest.fn() } },
      ],
    }).compile();

    handler = module.get<MemberRegisterHandler>(MemberRegisterHandler);
  });

  it("should register member and publish event", async () => {
    const command = new MemberRegisterCommand(
      "test@example.com",
      "password123",
      "Developer",
      "tester",
      NotificationEnum.EMAIL,
      FrequencyEnum.WEEKLY,
    );

    const memberId = await handler.execute(command);

    expect(memberId).toBeDefined();
    expect(memberRepository.register).toHaveBeenCalled();
    expect(eventStore.append).toHaveBeenCalled();
    expect(eventBus.publish).toHaveBeenCalled();
  });
});
```

### Query Handler 테스트

**파일:** `src/application/member/query/get-member.query.spec.ts`

```typescript
import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { GetMemberQuery, GetMemberHandler } from "./get-member.query";
import { MEMBER_READ_REPOSITORY } from "@/adapter/member/persistence/read";

describe("GetMemberHandler", () => {
  let handler: GetMemberHandler;
  let memberReadRepository: jest.Mocked<any>;

  beforeEach(async () => {
    memberReadRepository = { findById: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetMemberHandler,
        { provide: MEMBER_READ_REPOSITORY, useValue: memberReadRepository },
      ],
    }).compile();

    handler = module.get<GetMemberHandler>(GetMemberHandler);
  });

  it("should return member when found", async () => {
    const mockMember = {
      id: "member-1",
      email: "test@example.com",
      job: "Developer",
      nickname: "tester",
      notification: "EMAIL",
      frequency: "WEEKLY",
      point: 0,
      isPro: false,
    };

    memberReadRepository.findById.mockResolvedValue(mockMember);

    const result = await handler.execute(new GetMemberQuery("member-1"));

    expect(result.id).toBe("member-1");
    expect(result.email).toBe("test@example.com");
  });

  it("should throw NotFoundException when member not found", async () => {
    memberReadRepository.findById.mockResolvedValue(null);

    await expect(
      handler.execute(new GetMemberQuery("non-existent")),
    ).rejects.toThrow(NotFoundException);
  });
});
```

### Event Handler 테스트

**파일:** `src/application/member/event/member-registered.handler.spec.ts`

```typescript
import { Test, TestingModule } from "@nestjs/testing";
import { EntityManager } from "@mikro-orm/core";
import { MemberRegisteredHandler } from "./member-registered.handler";
import { MemberRegisteredEvent } from "@/domain/member/event";
import { MEMBER_READ_REPOSITORY } from "@/adapter/member/persistence/read";
import { NotificationEnum, FrequencyEnum } from "@/domain/member/enums";

describe("MemberRegisteredHandler", () => {
  let handler: MemberRegisteredHandler;
  let memberReadRepository: jest.Mocked<any>;
  let em: jest.Mocked<any>;

  beforeEach(async () => {
    memberReadRepository = { save: jest.fn() };
    em = { flush: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemberRegisteredHandler,
        { provide: MEMBER_READ_REPOSITORY, useValue: memberReadRepository },
        { provide: EntityManager, useValue: em },
      ],
    }).compile();

    handler = module.get<MemberRegisteredHandler>(MemberRegisteredHandler);
  });

  it("should project event to read model", async () => {
    const event = new MemberRegisteredEvent(
      "member-1",
      "test@example.com",
      "Developer",
      "tester",
      NotificationEnum.EMAIL,
      FrequencyEnum.WEEKLY,
    );

    await handler.handle(event);

    expect(memberReadRepository.save).toHaveBeenCalled();
    expect(em.flush).toHaveBeenCalled();
  });
});
```

---

## 마이그레이션 체크리스트

### 완료 후 확인사항

- [ ] `CqrsModule.forRoot()` 설정 완료
- [ ] Domain Event 클래스 생성 (`MemberRegisteredEvent`)
- [ ] Command + Handler 구현 (`member-register.command.ts`)
- [ ] Query + Handler 구현 (`get-member.query.ts`)
- [ ] Read Model Entity 생성 (`MemberReadEntity`)
- [ ] Read Repository 구현 (`MemberReadRepositoryImpl`)
- [ ] Event Handler 구현 (`MemberRegisteredHandler`)
- [ ] MemberModule 업데이트 (Handlers 등록)
- [ ] Controller 수정 (CommandBus, QueryBus 사용)
- [ ] 기존 `RegisterMemberService` 제거
- [ ] DB 마이그레이션 실행 (`member_read` 테이블 생성)
- [ ] 단위 테스트 작성
- [ ] E2E 테스트 검증

### 데이터베이스 마이그레이션

```sql
-- Read Model 테이블 생성
CREATE TABLE member_read (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    job VARCHAR(255) NOT NULL,
    nickname VARCHAR(255) NOT NULL,
    notification VARCHAR(50) NOT NULL,
    frequency VARCHAR(50) NOT NULL,
    point INTEGER DEFAULT 0,
    is_pro BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_member_read_email ON member_read(email);
```

---

## 추가 Command/Query 예시

### 추가 Command: 이메일 변경

**파일:** `src/application/member/command/change-email.command.ts`

```typescript
import { CommandHandler, EventBus, ICommand, ICommandHandler } from "@nestjs/cqrs";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { EntityManager, Transactional } from "@mikro-orm/core";
import { MEMBER_REPOSITORY, type MemberRepository } from "@/domain/member";
import { createDomainEvent, EVENT_STORE, type EventStore } from "@/domain/shared";

// ============================================================
// Command
// ============================================================
export class ChangeEmailCommand implements ICommand {
  constructor(
    public readonly memberId: string,
    public readonly newEmail: string,
  ) {}
}

// ============================================================
// Handler
// ============================================================
@Injectable()
@CommandHandler(ChangeEmailCommand)
export class ChangeEmailHandler implements ICommandHandler<ChangeEmailCommand, void> {
  constructor(
    @Inject(MEMBER_REPOSITORY)
    private readonly memberRepository: MemberRepository,
    @Inject(EVENT_STORE)
    private readonly eventStore: EventStore,
    private readonly eventBus: EventBus,
    private readonly em: EntityManager,
  ) {}

  @Transactional()
  async execute(command: ChangeEmailCommand): Promise<void> {
    // 1. 기존 멤버 조회
    const member = await this.memberRepository.findById(command.memberId);
    if (!member) {
      throw new NotFoundException(`Member not found: ${command.memberId}`);
    }

    // 2. 이메일 변경 (Domain logic)
    const oldEmail = member.email.value;
    member.changeEmail(command.newEmail);

    // 3. Event Store에 이벤트 저장
    this.eventStore.append(
      createDomainEvent(member.id, "MemberEmailChanged", {
        memberId: member.id,
        oldEmail,
        newEmail: command.newEmail,
      }),
    );

    await this.em.flush();

    // 4. Event Bus로 발행
    // this.eventBus.publish(new MemberEmailChangedEvent(...));
  }
}
```

### 추가 Query: 목록 조회

**파일:** `src/application/member/query/get-member-list.query.ts`

```typescript
import { IQuery, IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { Inject, Injectable } from "@nestjs/common";
import {
  MEMBER_READ_REPOSITORY,
  type MemberReadRepository,
} from "@/adapter/member/persistence/read";

// ============================================================
// Result
// ============================================================
export class MemberListItem {
  constructor(
    public readonly id: string,
    public readonly email: string,
    public readonly nickname: string,
    public readonly job: string,
  ) {}
}

export class GetMemberListResult {
  constructor(
    public readonly items: MemberListItem[],
    public readonly total: number,
  ) {}
}

// ============================================================
// Query
// ============================================================
export class GetMemberListQuery implements IQuery {
  constructor(
    public readonly limit: number = 20,
    public readonly offset: number = 0,
  ) {}
}

// ============================================================
// Handler
// ============================================================
@Injectable()
@QueryHandler(GetMemberListQuery)
export class GetMemberListHandler
  implements IQueryHandler<GetMemberListQuery, GetMemberListResult>
{
  constructor(
    @Inject(MEMBER_READ_REPOSITORY)
    private readonly memberReadRepository: MemberReadRepository,
  ) {}

  async execute(query: GetMemberListQuery): Promise<GetMemberListResult> {
    const members = await this.memberReadRepository.findAll({
      limit: query.limit,
      offset: query.offset,
    });

    const items = members.map(
      (m) => new MemberListItem(m.id, m.email, m.nickname, m.job),
    );

    return new GetMemberListResult(items, items.length);
  }
}
```

---

## Saga 패턴 (복잡한 비즈니스 프로세스)

```typescript
import { Injectable } from "@nestjs/common";
import { Saga, ICommand, ofType } from "@nestjs/cqrs";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import { MemberRegisteredEvent } from "@/domain/member/event";

@Injectable()
export class MemberSaga {
  @Saga()
  memberRegistered = (events$: Observable<any>): Observable<ICommand> => {
    return events$.pipe(
      ofType(MemberRegisteredEvent),
      map((event) => new SendWelcomeEmailCommand(event.memberId, event.email)),
    );
  };
}
```

---

## 파일 수 비교

| 구분 | 기존 방식 (폴더 분리) | 대안 1 (파일 통합) |
|-----|---------------------|-------------------|
| RegisterMember | 2개 파일 | **1개 파일** |
| GetMember | 3개 파일 | **1개 파일** |
| 10개 유스케이스 | 25+ 파일 | **10개 파일** |

---

## 참고 자료

- [NestJS CQRS 공식 문서](https://docs.nestjs.com/recipes/cqrs)
- [CQRS Pattern - Microsoft](https://docs.microsoft.com/en-us/azure/architecture/patterns/cqrs)
- [Event Sourcing Pattern - Martin Fowler](https://martinfowler.com/eaaDev/EventSourcing.html)
- [Domain-Driven Design Reference - Eric Evans](https://www.domainlanguage.com/ddd/reference/)
