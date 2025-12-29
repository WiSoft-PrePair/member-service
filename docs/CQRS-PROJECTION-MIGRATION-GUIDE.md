# CQRS + Projection (Read Model) 패턴 마이그레이션 가이드

## 📋 목차
1. [현재 상태 분석](#1-현재-상태-분석)
2. [목표 아키텍처](#2-목표-아키텍처)
3. [구현 계획](#3-구현-계획)
4. [단계별 구현](#4-단계별-구현)
5. [마이그레이션 체크리스트](#5-마이그레이션-체크리스트)

---

## 1. 현재 상태 분석

### 현재 아키텍처
```
RegisterMemberService
  ├─> MemberRepository.register()  (Write - DB 저장)
  └─> EventStore.append()          (Event 저장)
```

**문제점:**
- ❌ 데이터가 이중으로 저장됨 (member 테이블 + event_store 테이블)
- ❌ Event Store를 사용하는 목적이 불명확
- ❌ Command와 Query가 분리되지 않음
- ❌ Event가 발행되지만 활용되지 않음

### 현재 코드 구조
```typescript
// src/application/member/register-member.service.ts
@Transactional()
async register(registerRequest: RegisterMemberRequest): Promise<Member> {
  const member = Member.register(registerRequest, this.passwordEncoder);

  this.memberRepository.register(member);  // ← DB에 저장
  this.eventStore.append(...);             // ← Event 저장

  await this.em.flush();
  return member;
}
```

---

## 2. 목표 아키텍처

### CQRS + Event Sourcing + Projection 패턴

```
┌─────────────────────────────────────────────────────────────┐
│                        Command Side                          │
├─────────────────────────────────────────────────────────────┤
│  RegisterMemberCommand                                       │
│         ↓                                                    │
│  RegisterMemberHandler                                       │
│         ↓                                                    │
│  EventStore.append(MemberRegisteredEvent)                    │
│         ↓                                                    │
│  EventBus.publish(MemberRegisteredEvent)                     │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                     Event Handlers                           │
├─────────────────────────────────────────────────────────────┤
│  @OnEvent('MemberRegistered')                                │
│  MemberProjectionHandler                                     │
│         ↓                                                    │
│  MemberReadRepository.save()  ← Read Model 업데이트          │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                        Query Side                            │
├─────────────────────────────────────────────────────────────┤
│  GetMemberQuery                                              │
│         ↓                                                    │
│  GetMemberQueryHandler                                       │
│         ↓                                                    │
│  MemberReadRepository.findById() ← Read Model에서 조회       │
└─────────────────────────────────────────────────────────────┘
```

### 데이터베이스 구조
```
┌──────────────────┐         ┌──────────────────┐
│   event_store    │         │  member_read     │
├──────────────────┤         ├──────────────────┤
│ event_id (PK)    │         │ id (PK)          │
│ aggregate_id     │         │ email            │
│ event_type       │         │ nickname         │
│ payload (JSON)   │         │ job              │
│ occurred_at      │         │ point            │
└──────────────────┘         │ is_pro           │
  (Write Store)              │ registered_at    │
  (Source of Truth)          └──────────────────┘
                              (Read Model)
                              (최적화된 조회용)
```

---

## 3. 구현 계획

### Phase 1: CQRS 인프라 구축
- [ ] NestJS CQRS 모듈 설치
- [ ] Command/Query/Event 기본 구조 생성
- [ ] EventBus 설정

### Phase 2: Command Side 구현
- [ ] RegisterMemberCommand 생성
- [ ] RegisterMemberCommandHandler 생성
- [ ] MemberRepository 제거 (Event Store만 사용)

### Phase 3: Event Handler & Projection
- [ ] MemberReadModel 엔티티 생성
- [ ] MemberReadRepository 생성
- [ ] MemberProjectionHandler 구현 (@OnEvent)

### Phase 4: Query Side 구현
- [ ] GetMemberQuery 생성
- [ ] GetMemberQueryHandler 생성
- [ ] MemberController 업데이트 (CQRS 적용)

### Phase 5: 기존 데이터 마이그레이션
- [ ] Event Store에서 Read Model 재구성
- [ ] 기존 member 테이블 제거 또는 백업

---

## 4. 단계별 구현

### Step 1: NestJS CQRS 모듈 설치

```bash
npm install @nestjs/cqrs
# 또는
pnpm add @nestjs/cqrs
```

---

### Step 2: 디렉토리 구조 생성

```bash
mkdir -p src/application/member/commands
mkdir -p src/application/member/queries
mkdir -p src/application/member/events
mkdir -p src/application/member/projections
mkdir -p src/adapter/member/persistence/read-model
```

**최종 구조:**
```
src/
├── application/member/
│   ├── commands/
│   │   ├── register-member.command.ts
│   │   └── register-member.handler.ts
│   ├── queries/
│   │   ├── get-member.query.ts
│   │   └── get-member.handler.ts
│   ├── events/
│   │   └── member-registered.event.ts
│   └── projections/
│       └── member-projection.handler.ts
├── adapter/member/
│   └── persistence/
│       ├── read-model/
│       │   ├── member-read.entity.ts
│       │   ├── member-read.repository.ts
│       │   └── member-read.repository-impl.ts
│       └── mikro-orm/  (기존 - 삭제 예정)
└── domain/member/
    └── events/
        └── member-registered.event.ts
```

---

### Step 3: Command 구현

#### 3-1. Command 생성

**src/application/member/commands/register-member.command.ts**
```typescript
import { RegisterMemberRequest } from '@/domain/member/types';

export class RegisterMemberCommand {
  constructor(public readonly request: RegisterMemberRequest) {}
}
```

#### 3-2. Command Handler 생성

**src/application/member/commands/register-member.handler.ts**
```typescript
import { CommandHandler, ICommandHandler, EventBus } from '@nestjs/cqrs';
import { Inject, Injectable } from '@nestjs/common';
import { RegisterMemberCommand } from './register-member.command';
import { Member, PASSWORD_ENCODER, PasswordEncoder } from '@/domain/member';
import { EVENT_STORE, EventStore } from '@/domain/shared';
import { MemberRegisteredEvent } from '@/domain/member/events/member-registered.event';
import { Transactional } from '@mikro-orm/core';

@Injectable()
@CommandHandler(RegisterMemberCommand)
export class RegisterMemberHandler implements ICommandHandler<RegisterMemberCommand> {
  constructor(
    @Inject(PASSWORD_ENCODER)
    private readonly passwordEncoder: PasswordEncoder,
    @Inject(EVENT_STORE)
    private readonly eventStore: EventStore,
    private readonly eventBus: EventBus,
  ) {}

  @Transactional()
  async execute(command: RegisterMemberCommand): Promise<string> {
    // 1. Aggregate 생성
    const member = Member.register(command.request, this.passwordEncoder);

    // 2. Domain Event 생성
    const event = new MemberRegisteredEvent(
      member.id,
      member.email.value,
      member.nickname,
      member.job,
      member.notification,
      member.frequency,
      member.point,
      member.isPro,
    );

    // 3. Event Store에 저장
    this.eventStore.append({
      eventId: event.eventId,
      aggregateId: event.aggregateId,
      eventType: 'MemberRegistered',
      payload: event,
      occurredAt: event.occurredAt,
    });

    // 4. Event Bus로 발행 (Projection 트리거)
    await this.eventBus.publish(event);

    // 5. Aggregate ID 반환
    return member.id;
  }
}
```

---

### Step 4: Domain Event 정의

**src/domain/member/events/member-registered.event.ts**
```typescript
import { randomUUID } from 'crypto';

export class MemberRegisteredEvent {
  readonly eventId: string;
  readonly occurredAt: Date;

  constructor(
    public readonly aggregateId: string,
    public readonly email: string,
    public readonly nickname: string,
    public readonly job: string,
    public readonly notification: string,
    public readonly frequency: string,
    public readonly point: number,
    public readonly isPro: boolean,
  ) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
  }
}
```

---

### Step 5: Read Model 생성

#### 5-1. Read Model Entity

**src/adapter/member/persistence/read-model/member-read.entity.ts**
```typescript
import { Entity, PrimaryKey, Property, Index } from '@mikro-orm/core';

@Entity({ tableName: 'member_read' })
export class MemberReadEntity {
  @PrimaryKey()
  id!: string;

  @Property()
  @Index({ unique: true })
  email!: string;

  @Property()
  nickname!: string;

  @Property()
  job!: string;

  @Property()
  notification!: string;

  @Property()
  frequency!: string;

  @Property()
  point!: number;

  @Property()
  isPro!: boolean;

  @Property()
  registeredAt!: Date;

  @Property({ onUpdate: () => new Date() })
  updatedAt!: Date;
}
```

#### 5-2. Read Repository Interface

**src/adapter/member/persistence/read-model/member-read.repository.ts**
```typescript
import { MemberReadEntity } from './member-read.entity';

export interface MemberReadRepository {
  save(member: Partial<MemberReadEntity>): Promise<MemberReadEntity>;
  findById(id: string): Promise<MemberReadEntity | null>;
  findByEmail(email: string): Promise<MemberReadEntity | null>;
  findAll(): Promise<MemberReadEntity[]>;
}

export const MEMBER_READ_REPOSITORY = Symbol('MemberReadRepository');
```

#### 5-3. Read Repository Implementation

**src/adapter/member/persistence/read-model/member-read.repository-impl.ts**
```typescript
import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { MemberReadRepository } from './member-read.repository';
import { MemberReadEntity } from './member-read.entity';

@Injectable()
export class MemberReadRepositoryImpl implements MemberReadRepository {
  constructor(private readonly em: EntityManager) {}

  async save(member: Partial<MemberReadEntity>): Promise<MemberReadEntity> {
    const entity = this.em.create(MemberReadEntity, member);
    await this.em.persistAndFlush(entity);
    return entity;
  }

  async findById(id: string): Promise<MemberReadEntity | null> {
    return this.em.findOne(MemberReadEntity, { id });
  }

  async findByEmail(email: string): Promise<MemberReadEntity | null> {
    return this.em.findOne(MemberReadEntity, { email });
  }

  async findAll(): Promise<MemberReadEntity[]> {
    return this.em.find(MemberReadEntity, {});
  }
}
```

---

### Step 6: Projection Handler 구현

**src/application/member/projections/member-projection.handler.ts**
```typescript
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Inject, Injectable } from '@nestjs/common';
import { MemberRegisteredEvent } from '@/domain/member/events/member-registered.event';
import {
  MEMBER_READ_REPOSITORY,
  MemberReadRepository,
} from '@/adapter/member/persistence/read-model/member-read.repository';

@Injectable()
@EventsHandler(MemberRegisteredEvent)
export class MemberProjectionHandler implements IEventHandler<MemberRegisteredEvent> {
  constructor(
    @Inject(MEMBER_READ_REPOSITORY)
    private readonly memberReadRepository: MemberReadRepository,
  ) {}

  async handle(event: MemberRegisteredEvent): Promise<void> {
    console.log('[Projection] MemberRegisteredEvent received:', event.aggregateId);

    // Read Model 업데이트
    await this.memberReadRepository.save({
      id: event.aggregateId,
      email: event.email,
      nickname: event.nickname,
      job: event.job,
      notification: event.notification,
      frequency: event.frequency,
      point: event.point,
      isPro: event.isPro,
      registeredAt: event.occurredAt,
      updatedAt: event.occurredAt,
    });

    console.log('[Projection] Member Read Model updated:', event.aggregateId);
  }
}
```

---

### Step 7: Query 구현

#### 7-1. Query 생성

**src/application/member/queries/get-member.query.ts**
```typescript
export class GetMemberQuery {
  constructor(public readonly memberId: string) {}
}
```

#### 7-2. Query Handler 생성

**src/application/member/queries/get-member.handler.ts**
```typescript
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { GetMemberQuery } from './get-member.query';
import {
  MEMBER_READ_REPOSITORY,
  MemberReadRepository,
} from '@/adapter/member/persistence/read-model/member-read.repository';
import { MemberReadEntity } from '@/adapter/member/persistence/read-model/member-read.entity';

@Injectable()
@QueryHandler(GetMemberQuery)
export class GetMemberHandler implements IQueryHandler<GetMemberQuery> {
  constructor(
    @Inject(MEMBER_READ_REPOSITORY)
    private readonly memberReadRepository: MemberReadRepository,
  ) {}

  async execute(query: GetMemberQuery): Promise<MemberReadEntity> {
    const member = await this.memberReadRepository.findById(query.memberId);

    if (!member) {
      throw new NotFoundException(`Member not found: ${query.memberId}`);
    }

    return member;
  }
}
```

---

### Step 8: Controller 업데이트 (CQRS 적용)

**src/adapter/member/api/member.controller.ts**
```typescript
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { RegisterMemberCommand } from '@/application/member/commands/register-member.command';
import { GetMemberQuery } from '@/application/member/queries/get-member.query';
import { RegisterMemberRequest } from '@/domain/member/types';

@Controller('members')
export class MemberController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  // Command: 회원 등록
  @Post()
  async register(@Body() request: RegisterMemberRequest): Promise<{ memberId: string }> {
    const memberId = await this.commandBus.execute(new RegisterMemberCommand(request));
    return { memberId };
  }

  // Query: 회원 조회
  @Get(':id')
  async getMember(@Param('id') id: string) {
    return this.queryBus.execute(new GetMemberQuery(id));
  }

  // Query: 전체 회원 조회 (예시)
  @Get()
  async getAllMembers() {
    // GetAllMembersQuery 추가 구현 필요
    return this.queryBus.execute(new GetAllMembersQuery());
  }
}
```

---

### Step 9: Module 설정

**src/adapter/member/member.module.ts**
```typescript
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { MikroOrmModule } from '@mikro-orm/nestjs';

// Entities
import { EventStoreEntity } from '@/adapter/shared/event-store/event-store.entity';
import { MemberReadEntity } from './persistence/read-model/member-read.entity';

// Controllers
import { MemberController } from './api/member.controller';

// Command Handlers
import { RegisterMemberHandler } from '@/application/member/commands/register-member.handler';

// Query Handlers
import { GetMemberHandler } from '@/application/member/queries/get-member.handler';

// Event Handlers
import { MemberProjectionHandler } from '@/application/member/projections/member-projection.handler';

// Repositories
import { MemberReadRepositoryImpl } from './persistence/read-model/member-read.repository-impl';
import { MEMBER_READ_REPOSITORY } from './persistence/read-model/member-read.repository';

// Event Store
import { EventStoreModule } from '@/adapter/shared/event-store/event-store.module';

// Security
import { BcryptPasswordEncoder } from './security/bcrypt-password-encoder';
import { PASSWORD_ENCODER } from '@/domain/member';

@Module({
  imports: [
    CqrsModule,
    MikroOrmModule.forFeature([EventStoreEntity, MemberReadEntity]),
    EventStoreModule,
  ],
  controllers: [MemberController],
  providers: [
    // Command Handlers
    RegisterMemberHandler,

    // Query Handlers
    GetMemberHandler,

    // Event Handlers
    MemberProjectionHandler,

    // Repositories
    {
      provide: MEMBER_READ_REPOSITORY,
      useClass: MemberReadRepositoryImpl,
    },

    // Security
    {
      provide: PASSWORD_ENCODER,
      useClass: BcryptPasswordEncoder,
    },
  ],
})
export class MemberModule {}
```

---

### Step 10: EventStoreModule 업데이트

**src/adapter/shared/event-store/event-store.module.ts**
```typescript
import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { EventStoreEntity } from './event-store.entity';
import { EventStoreImpl } from './event-store.impl';
import { EVENT_STORE } from '@/domain/shared/event-store';

@Module({
  imports: [MikroOrmModule.forFeature([EventStoreEntity])],
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

---

### Step 11: Migration 생성

```bash
# Read Model 테이블 생성
npx mikro-orm migration:create --name=create_member_read_table
```

**migrations/Migration_xxx_create_member_read_table.ts**
```typescript
import { Migration } from '@mikro-orm/migrations';

export class Migration_xxx_create_member_read_table extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE member_read (
        id VARCHAR(255) PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        nickname VARCHAR(255) NOT NULL,
        job VARCHAR(255) NOT NULL,
        notification VARCHAR(50) NOT NULL,
        frequency VARCHAR(50) NOT NULL,
        point INTEGER NOT NULL DEFAULT 0,
        is_pro BOOLEAN NOT NULL DEFAULT FALSE,
        registered_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    this.addSql(`CREATE INDEX idx_member_read_email ON member_read(email);`);
  }

  async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS member_read;`);
  }
}
```

---

## 5. 마이그레이션 체크리스트

### Phase 1: 인프라 구축 ✅
- [ ] `@nestjs/cqrs` 패키지 설치
- [ ] 디렉토리 구조 생성
- [ ] MemberModule에 CqrsModule import

### Phase 2: Command Side ✅
- [ ] `RegisterMemberCommand` 생성
- [ ] `RegisterMemberHandler` 생성
- [ ] `MemberRegisteredEvent` (Domain Event) 생성
- [ ] EventBus 연동 확인

### Phase 3: Read Model & Projection ✅
- [ ] `MemberReadEntity` 생성
- [ ] `MemberReadRepository` 인터페이스 생성
- [ ] `MemberReadRepositoryImpl` 구현
- [ ] `MemberProjectionHandler` 생성 (@EventsHandler)
- [ ] Migration 파일 생성 및 실행

### Phase 4: Query Side ✅
- [ ] `GetMemberQuery` 생성
- [ ] `GetMemberHandler` 생성
- [ ] Controller에 QueryBus 적용

### Phase 5: 기존 코드 제거
- [ ] `RegisterMemberService` 삭제
- [ ] `MemberRepository` (기존) 삭제
- [ ] `member` 테이블 관련 Entity/Mapper 삭제
- [ ] 기존 member 테이블 백업 후 삭제

### Phase 6: 테스트
- [ ] Command Handler 단위 테스트
- [ ] Query Handler 단위 테스트
- [ ] Projection Handler 단위 테스트
- [ ] E2E 테스트 (회원 등록 → 조회)

---

## 6. 실행 및 검증

### 1. Migration 실행
```bash
npm run migration:up
```

### 2. 서버 실행
```bash
npm run start:dev
```

### 3. API 테스트

#### 회원 등록 (Command)
```bash
curl -X POST http://localhost:3000/members \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "nickname": "테스터",
    "job": "developer",
    "notification": "EMAIL",
    "frequency": "DAILY"
  }'
```

**응답:**
```json
{
  "memberId": "uuid-here"
}
```

#### 회원 조회 (Query)
```bash
curl http://localhost:3000/members/{memberId}
```

**응답:**
```json
{
  "id": "uuid-here",
  "email": "test@example.com",
  "nickname": "테스터",
  "job": "developer",
  "point": 0,
  "isPro": false,
  "registeredAt": "2025-12-29T10:00:00.000Z"
}
```

### 4. 데이터 확인

#### Event Store 확인
```sql
SELECT * FROM event_store WHERE event_type = 'MemberRegistered';
```

#### Read Model 확인
```sql
SELECT * FROM member_read;
```

---

## 7. 추가 개선 사항

### 7-1. Event Store Reader 분리 (선택사항)

```typescript
// src/domain/shared/event-store-reader.ts
export interface EventStoreReader {
  getEvents(aggregateId: string): Promise<DomainEvent[]>;
  getEventsByType(eventType: string): Promise<DomainEvent[]>;
  getEventsSince(timestamp: Date): Promise<DomainEvent[]>;
}

export const EVENT_STORE_READER = Symbol('EventStoreReader');
```

### 7-2. Aggregate 재구성 (Event Sourcing 완성)

```typescript
// src/domain/member/member.ts
export class Member {
  // ... 기존 코드

  static async loadFromHistory(
    aggregateId: string,
    eventStore: EventStoreReader,
  ): Promise<Member> {
    const events = await eventStore.getEvents(aggregateId);

    // 첫 이벤트로 Aggregate 생성
    const firstEvent = events[0];
    let member = this.fromEvent(firstEvent);

    // 나머지 이벤트 replay
    for (let i = 1; i < events.length; i++) {
      member = member.apply(events[i]);
    }

    return member;
  }

  private static fromEvent(event: DomainEvent): Member {
    // MemberRegistered 이벤트에서 Member 생성
    return new Member({ ...event.payload });
  }

  private apply(event: DomainEvent): Member {
    switch (event.eventType) {
      case 'MemberNameChanged':
        return new Member({ ...this, nickname: event.payload.nickname });
      // 다른 이벤트 처리...
      default:
        return this;
    }
  }
}
```

### 7-3. Snapshot 패턴 (성능 최적화)

Event가 많아질 경우 Snapshot을 저장해서 재구성 성능 개선:

```typescript
// src/adapter/shared/event-store/snapshot.entity.ts
@Entity({ tableName: 'snapshots' })
export class SnapshotEntity {
  @PrimaryKey()
  aggregateId!: string;

  @Property()
  version!: number;

  @Property({ type: 'json' })
  state!: Record<string, unknown>;

  @Property()
  createdAt!: Date;
}
```

---

## 8. 트러블슈팅

### 문제 1: Event가 발행되지 않음
**해결:** EventBus가 제대로 주입되었는지 확인. CqrsModule이 import되었는지 확인.

### 문제 2: Projection이 실행되지 않음
**해결:** `@EventsHandler(MemberRegisteredEvent)` 데코레이터 확인. Handler가 Module providers에 등록되었는지 확인.

### 문제 3: Transaction이 제대로 동작하지 않음
**해결:** `@Transactional()` 데코레이터가 Handler에 적용되었는지 확인. EventBus.publish()가 Transaction 안에서 호출되는지 확인.

### 문제 4: Read Model과 Event Store 데이터 불일치
**해결:** Event Replay 스크립트 작성:
```typescript
// scripts/replay-events.ts
async function replayEvents() {
  const events = await eventStore.getAllEvents();

  for (const event of events) {
    await eventBus.publish(event);
  }
}
```

---

## 9. 참고 자료

- [NestJS CQRS 공식 문서](https://docs.nestjs.com/recipes/cqrs)
- [Event Sourcing Pattern](https://martinfowler.com/eaaDev/EventSourcing.html)
- [CQRS Pattern](https://martinfowler.com/bliki/CQRS.html)
- [DDD Aggregates](https://www.martinfowler.com/bliki/DDD_Aggregate.html)

---

## 10. 다음 단계

1. ✅ 기본 CQRS + Projection 구현 완료
2. 🚀 다른 도메인에도 적용 (예: Order, Product 등)
3. 🔧 Event Store Reader 분리
4. ⚡ Snapshot 패턴 도입
5. 📊 Event Sourcing 완전 활용 (Aggregate 재구성)
6. 🎯 Event-Driven Architecture 확장 (Saga, Process Manager)

---

**작성일:** 2025-12-29
**버전:** 1.0.0
**작성자:** Claude Code Assistant