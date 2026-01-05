# 회원정보 수정 기능 구현 가이드

이 문서는 DDD + CQRS + Event Sourcing 아키텍처 기반으로 회원정보 수정 기능을 구현하는 가이드입니다.

## 개요

### 수정 가능한 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `job` | `string` | 직업 |
| `nickname` | `string` | 닉네임 |
| `notification` | `NotificationEnum` | 알림 설정 (email, kakao, both) |
| `frequency` | `FrequencyEnum` | 알림 빈도 (every, weekly) |

### 수정 불가능한 필드

| 필드 | 이유 |
|------|------|
| `id` | 불변 식별자 |
| `email` | 별도 이메일 변경 프로세스 필요 (이메일 인증) |
| `password` | 별도 비밀번호 변경 기능으로 분리 |
| `point` | 시스템에서 관리 |
| `isPro` | 결제 시스템에서 관리 |

## 구현 순서

### Step 1: Domain Layer

#### 1.1 UpdateMemberRequest 타입 정의

**파일:** `src/domain/member/types/member-type.ts`

```typescript
export type UpdateMemberRequest = {
  job?: string;
  nickname?: string;
  notification?: NotificationEnum;
  frequency?: FrequencyEnum;
};
```

#### 1.2 Member 엔티티에 update 메서드 추가

**파일:** `src/domain/member/member.ts`

```typescript
export class Member {
  // ... 기존 코드

  public update(request: UpdateMemberRequest): Member {
    return new Member({
      ...this,
      id: this.id,
      email: this.email,
      password: this.password,
      job: request.job ?? this.job,
      nickname: request.nickname ?? this.nickname,
      notification: request.notification ?? this.notification,
      frequency: request.frequency ?? this.frequency,
      point: this.point,
      isPro: this.isPro,
    });
  }
}
```

#### 1.3 MemberUpdateEvent 정의

**파일:** `src/domain/member/events/member-update.event.ts`

```typescript
import { IEvent } from "@nestjs/cqrs";
import { FrequencyEnum, NotificationEnum } from "@/domain/member";

export class MemberUpdateEvent implements IEvent {
  constructor(
    public readonly memberId: string,
    public readonly job: string,
    public readonly nickname: string,
    public readonly notification: NotificationEnum,
    public readonly frequency: FrequencyEnum,
    public readonly occurredAt: Date = new Date(Date.now() + 9 * 60 * 60 * 1000),
  ) {}
}
```

**파일:** `src/domain/member/events/index.ts` (export 추가)

```typescript
export * from "./member-register.event";
export * from "./member-withdraw.event";
export * from "./member-update.event";
```

#### 1.4 MemberRepository 인터페이스 확장

**파일:** `src/domain/member/member.repository.ts`

```typescript
import { Member } from "@/domain/member/member";

export interface MemberRepository {
  register(member: Member): Member;

  update(member: Member): Member;

  withdraw(memberId: string): void;

  findById(id: string): Promise<Member | null>;
}

export const MEMBER_REPOSITORY = Symbol("MemberRepository");
```

---

### Step 2: Application Layer

#### 2.1 MemberUpdateCommand 생성

**파일:** `src/application/member/command/member-update.command.ts`

```typescript
import {
  CommandHandler,
  EventBus,
  ICommand,
  ICommandHandler,
} from "@nestjs/cqrs";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  FrequencyEnum,
  Member,
  MEMBER_REPOSITORY,
  type MemberRepository,
  NotificationEnum,
} from "@/domain/member";
import {
  createDomainEvent,
  EVENT_STORE,
  type EventStore,
} from "@/domain/shared";
import { EntityManager, Transactional } from "@mikro-orm/core";
import { MemberUpdateEvent } from "@/domain/member/events";

export class MemberUpdateCommand implements ICommand {
  constructor(
    public readonly id: string,
    public readonly job?: string,
    public readonly nickname?: string,
    public readonly notification?: NotificationEnum,
    public readonly frequency?: FrequencyEnum,
  ) {}
}

@Injectable()
@CommandHandler(MemberUpdateCommand)
export class MemberUpdateCommandHandler
  implements ICommandHandler<MemberUpdateCommand, string>
{
  constructor(
    @Inject(MEMBER_REPOSITORY)
    private readonly memberRepository: MemberRepository,
    @Inject(EVENT_STORE)
    private readonly eventStore: EventStore,
    private readonly eventBus: EventBus,
    private readonly em: EntityManager,
  ) {}

  @Transactional()
  async execute(command: MemberUpdateCommand): Promise<string> {
    // 1. 기존 회원 조회
    const existingMember = await this.memberRepository.findById(command.id);

    if (!existingMember) {
      throw new NotFoundException("회원을 찾을 수 없습니다.");
    }

    // 2. 도메인 로직 실행 (업데이트)
    const updatedMember: Member = existingMember.update({
      job: command.job,
      nickname: command.nickname,
      notification: command.notification,
      frequency: command.frequency,
    });

    // 3. Write Model 저장
    this.memberRepository.update(updatedMember);

    // 4. Event Store에 이벤트 기록
    this.eventStore.append(
      createDomainEvent(updatedMember.id, "MemberUpdated", {
        id: updatedMember.id,
        job: updatedMember.job,
        nickname: updatedMember.nickname,
        notification: updatedMember.notification,
        frequency: updatedMember.frequency,
      }),
    );

    // 5. 트랜잭션 플러시
    await this.em.flush();

    // 6. Integration Event 발행 (Read Model 업데이트 트리거)
    this.eventBus.publish(
      new MemberUpdateEvent(
        updatedMember.id,
        updatedMember.job,
        updatedMember.nickname,
        updatedMember.notification,
        updatedMember.frequency,
      ),
    );

    return updatedMember.id;
  }
}
```

**파일:** `src/application/member/command/index.ts` (export 추가)

```typescript
export * from "./member-register.command";
export * from "./member-withdraw.command";
export * from "./member-update.command";
```

#### 2.2 MemberUpdateEventHandler 생성

**파일:** `src/application/member/event/member-update-event-handler.service.ts`

```typescript
import { Inject, Injectable, Logger } from "@nestjs/common";
import { EventsHandler, IEventHandler } from "@nestjs/cqrs";
import { MemberUpdateEvent } from "@/domain/member/events";
import {
  MEMBER_READ_REPOSITORY,
  type MemberReadRepository,
} from "@/adapter/member/persistence/read";
import { EntityManager } from "@mikro-orm/core";

@Injectable()
@EventsHandler(MemberUpdateEvent)
export class MemberUpdateEventHandler
  implements IEventHandler<MemberUpdateEvent>
{
  private readonly logger: Logger = new Logger(MemberUpdateEventHandler.name);

  constructor(
    @Inject(MEMBER_READ_REPOSITORY)
    private readonly memberReadRepository: MemberReadRepository,
    private readonly em: EntityManager,
  ) {}

  async handle(event: MemberUpdateEvent): Promise<void> {
    this.logger.log(`회원정보 수정 이벤트 시작: ${event.memberId}`);

    const readEntity = await this.memberReadRepository.findById(event.memberId);

    if (!readEntity) {
      this.logger.warn(`회원 Read Entity를 찾을 수 없음: ${event.memberId}`);
      return;
    }

    // Read Model 업데이트
    readEntity.job = event.job;
    readEntity.nickname = event.nickname;
    readEntity.notification = event.notification;
    readEntity.frequency = event.frequency;
    readEntity.updatedAt = event.occurredAt;

    await this.em.flush();

    this.logger.log(`회원정보 수정 이벤트 종료: ${event.memberId}`);
  }
}
```

**파일:** `src/application/member/event/index.ts` (export 추가)

```typescript
export * from "./member-register-event-handler.service";
export * from "./member-withdraw-event-handler.service";
export * from "./member-update-event-handler.service";
```

---

### Step 3: Adapter Layer

#### 3.1 MemberRepository 구현체 확장

**파일:** `src/adapter/member/persistence/mikro-orm/member.repository-impl.ts`

```typescript
import { Injectable } from "@nestjs/common";
import { Member, MemberRepository } from "@/domain/member";
import { EntityManager } from "@mikro-orm/postgresql";
import { MemberEntity } from "./entity";
import { MemberMapper } from "./mapper";

@Injectable()
export class MemberRepositoryImpl implements MemberRepository {
  constructor(
    private readonly em: EntityManager,
    private readonly mapper: MemberMapper,
  ) {}

  register(member: Member): Member {
    const entity: MemberEntity = this.mapper.toEntity(member);
    this.em.persist(entity);
    return member;
  }

  update(member: Member): Member {
    const entity: MemberEntity = this.mapper.toEntity(member);
    this.em.merge(entity);
    return member;
  }

  withdraw(memberId: string): void {
    this.em.nativeDelete(MemberEntity, { id: memberId });
  }

  async findById(id: string): Promise<Member | null> {
    const entity = await this.em.findOne(MemberEntity, { id });
    if (!entity) {
      return null;
    }
    return this.mapper.toDomain(entity);
  }
}
```

#### 3.2 MemberMapper에 toDomain 메서드 추가

**파일:** `src/adapter/member/persistence/mikro-orm/mapper/member.mapper.ts`

```typescript
import { Injectable } from "@nestjs/common";
import { Member } from "@/domain/member";
import { Email, Password } from "@/domain/member/value-objects";
import { MemberEntity } from "../entity";

@Injectable()
export class MemberMapper {
  toEntity(member: Member): MemberEntity {
    const entity = new MemberEntity();
    entity.id = member.id;
    entity.email = member.email.value;
    entity.password = member.password.value;
    entity.job = member.job;
    entity.nickname = member.nickname;
    entity.notification = member.notification;
    entity.frequency = member.frequency;
    entity.point = member.point;
    entity.isPro = member.isPro;
    return entity;
  }

  toDomain(entity: MemberEntity): Member {
    return Member.of({
      id: entity.id,
      email: Email.of(entity.email),
      password: Password.of(entity.password),
      job: entity.job,
      nickname: entity.nickname,
      notification: entity.notification,
      frequency: entity.frequency,
      point: entity.point,
      isPro: entity.isPro,
    });
  }
}
```

#### 3.3 Value Object에 of 메서드 추가 (이미 검증된 데이터용)

**파일:** `src/domain/member/value-objects/email.ts`

```typescript
export class Email {
  readonly value: string;

  constructor(email: string) {
    // 검증 로직
    this.value = email;
  }

  // DB에서 복원용 (이미 검증된 데이터)
  public static of(email: string): Email {
    const instance = Object.create(Email.prototype);
    instance.value = email;
    return instance;
  }
}
```

**파일:** `src/domain/member/value-objects/password.ts`

```typescript
export class Password {
  readonly value: string;

  // ... 기존 코드

  // DB에서 복원용 (이미 인코딩된 데이터)
  public static of(encodedPassword: string): Password {
    const instance = Object.create(Password.prototype);
    instance.value = encodedPassword;
    return instance;
  }
}
```

#### 3.4 UpdateMemberRequestDto 생성

**파일:** `src/adapter/member/api/dto/update-member-request.dto.ts`

```typescript
import { FrequencyEnum, NotificationEnum } from "@/domain/member";
import { IsEnum, IsOptional, IsString } from "class-validator";

export class UpdateMemberRequestDto {
  @IsOptional()
  @IsString()
  job?: string;

  @IsOptional()
  @IsString()
  nickname?: string;

  @IsOptional()
  @IsEnum(NotificationEnum)
  notification?: NotificationEnum;

  @IsOptional()
  @IsEnum(FrequencyEnum)
  frequency?: FrequencyEnum;
}
```

**파일:** `src/adapter/member/api/dto/index.ts` (export 추가)

```typescript
export * from "./register-member-request.dto";
export * from "./update-member-request.dto";
```

#### 3.5 MemberController에 update 엔드포인트 추가

**파일:** `src/adapter/member/api/member.controller.ts`

```typescript
import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { RegisterMemberRequestDto, UpdateMemberRequestDto } from "@/adapter/member/api/dto";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import {
  MemberRegisterCommand,
  MemberUpdateCommand,
  MemberWithdrawCommand,
} from "@/application/member/command";
import { GetMemberQuery, GetMemberResult } from "@/application/member/query";

@Controller("members")
export class MemberController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  // ... 기존 코드

  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() updateDto: UpdateMemberRequestDto,
  ) {
    const memberId: string = await this.commandBus.execute<
      MemberUpdateCommand,
      string
    >(
      new MemberUpdateCommand(
        id,
        updateDto.job,
        updateDto.nickname,
        updateDto.notification,
        updateDto.frequency,
      ),
    );

    return { id: memberId };
  }
}
```

#### 3.6 MemberModule에 Handler 등록

**파일:** `src/adapter/member/member.module.ts`

```typescript
import {
  MemberRegisterCommandHandler,
  MemberUpdateCommandHandler,  // 추가
  WithdrawMemberCommandHandler,
} from "@/application/member/command";
import {
  MemberRegisterEventHandler,
  MemberUpdateEventHandler,  // 추가
  MemberWithdrawEventHandler,
} from "@/application/member/event";

const CommandHandlers = [
  MemberRegisterCommandHandler,
  MemberUpdateCommandHandler,  // 추가
  WithdrawMemberCommandHandler,
];

const EventHandlers = [
  MemberRegisterEventHandler,
  MemberUpdateEventHandler,  // 추가
  MemberWithdrawEventHandler,
];
```

---

## 파일 체크리스트

### Domain Layer
- [ ] `src/domain/member/types/member-type.ts` - `UpdateMemberRequest` 타입 추가
- [ ] `src/domain/member/member.ts` - `update()` 메서드 추가
- [ ] `src/domain/member/events/member-update.event.ts` - 새 파일 생성
- [ ] `src/domain/member/events/index.ts` - export 추가
- [ ] `src/domain/member/member.repository.ts` - `update()`, `findById()` 메서드 추가
- [ ] `src/domain/member/value-objects/email.ts` - `of()` 정적 메서드 추가
- [ ] `src/domain/member/value-objects/password.ts` - `of()` 정적 메서드 추가

### Application Layer
- [ ] `src/application/member/command/member-update.command.ts` - 새 파일 생성
- [ ] `src/application/member/command/index.ts` - export 추가
- [ ] `src/application/member/event/member-update-event-handler.service.ts` - 새 파일 생성
- [ ] `src/application/member/event/index.ts` - export 추가

### Adapter Layer
- [ ] `src/adapter/member/persistence/mikro-orm/member.repository-impl.ts` - `update()`, `findById()` 구현
- [ ] `src/adapter/member/persistence/mikro-orm/mapper/member.mapper.ts` - `toDomain()` 추가
- [ ] `src/adapter/member/api/dto/update-member-request.dto.ts` - 새 파일 생성
- [ ] `src/adapter/member/api/dto/index.ts` - export 추가
- [ ] `src/adapter/member/api/member.controller.ts` - `PATCH /:id` 엔드포인트 추가
- [ ] `src/adapter/member/member.module.ts` - Handler 등록

---

## API 스펙

### Request

```http
PATCH /members/:id
Content-Type: application/json

{
  "job": "Backend Developer",
  "nickname": "newNickname",
  "notification": "both",
  "frequency": "weekly"
}
```

모든 필드는 optional이며, 전달된 필드만 업데이트됩니다.

### Response

```json
{
  "id": "uuid-of-member"
}
```

### Error Responses

| Status | 설명 |
|--------|------|
| 400 | 유효성 검사 실패 (잘못된 enum 값 등) |
| 404 | 회원을 찾을 수 없음 |

---

## Event Sourcing 이벤트 예시

```json
{
  "aggregateId": "member-uuid",
  "eventType": "MemberUpdated",
  "payload": {
    "id": "member-uuid",
    "job": "Backend Developer",
    "nickname": "newNickname",
    "notification": "both",
    "frequency": "weekly"
  },
  "occurredAt": "2024-01-15T10:30:00.000Z"
}
```

---

## 테스트 코드 가이드

### Unit Test: Member.update()

```typescript
describe("Member", () => {
  describe("update", () => {
    it("should update member fields", () => {
      const member = Member.of({
        id: "test-id",
        email: Email.of("test@example.com"),
        password: Password.of("hashedPassword"),
        job: "Student",
        nickname: "oldNick",
        notification: NotificationEnum.EMAIL,
        frequency: FrequencyEnum.EVERY,
        point: 0,
        isPro: false,
      });

      const updated = member.update({
        job: "Developer",
        nickname: "newNick",
      });

      expect(updated.job).toBe("Developer");
      expect(updated.nickname).toBe("newNick");
      expect(updated.notification).toBe(NotificationEnum.EMAIL); // 변경 안됨
      expect(updated.id).toBe("test-id"); // 불변
    });
  });
});
```

### Integration Test: PATCH /members/:id

```typescript
describe("MemberController (e2e)", () => {
  it("PATCH /members/:id should update member", async () => {
    // Given: 회원 생성
    const createRes = await request(app.getHttpServer())
      .post("/members/register")
      .send({ /* ... */ });

    const memberId = createRes.body.id;

    // When: 회원 정보 수정
    const updateRes = await request(app.getHttpServer())
      .patch(`/members/${memberId}`)
      .send({
        job: "Updated Job",
        nickname: "Updated Nick",
      });

    // Then
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.id).toBe(memberId);

    // Verify
    const getRes = await request(app.getHttpServer())
      .get(`/members/${memberId}`);

    expect(getRes.body.job).toBe("Updated Job");
    expect(getRes.body.nickname).toBe("Updated Nick");
  });
});
```
