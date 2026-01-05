# 이메일 변경 기능 구현 가이드

이 문서는 DDD + CQRS + Event Sourcing 아키텍처 기반으로 이메일 변경 기능을 구현하는 가이드입니다.

## 개요

### 보안 고려사항

이메일은 계정 식별 및 인증에 사용되는 중요한 정보이므로, 변경 시 추가 보안 검증이 필요합니다.

| 검증 항목 | 설명 |
|-----------|------|
| 현재 비밀번호 확인 | 본인 확인을 위한 비밀번호 재입력 |
| 이메일 중복 확인 | 이미 사용 중인 이메일인지 확인 |
| 이메일 형식 검증 | Email Value Object에서 처리 |

> **참고:** 이메일 인증(verification) 프로세스는 이 가이드에서 다루지 않습니다. 필요 시 별도 구현하세요.

---

## 구현 순서

### Step 1: Domain Layer

#### 1.1 Member 엔티티에 changeEmail 메서드 추가

**파일:** `src/domain/member/member.ts`

```typescript
import { Email, Password } from "./value-objects";
import type { PasswordEncoder } from "./password-encoder";

export class Member {
  // ... 기존 코드

  /**
   * 이메일 변경
   * @param newEmail 새 이메일 (raw string)
   * @param currentPassword 현재 비밀번호 (검증용)
   * @param encoder 비밀번호 인코더
   * @throws UnauthorizedException 비밀번호 불일치 시
   */
  public changeEmail(
    newEmail: string,
    currentPassword: string,
    encoder: PasswordEncoder,
  ): Member {
    // 비밀번호 검증
    if (!this.password.matches(currentPassword, encoder)) {
      throw new InvalidPasswordException();
    }

    return new Member({
      ...this,
      id: this.id,
      email: new Email(newEmail), // Email VO에서 형식 검증
      password: this.password,
      job: this.job,
      nickname: this.nickname,
      notification: this.notification,
      frequency: this.frequency,
      point: this.point,
      isPro: this.isPro,
    });
  }
}
```

#### 1.2 MemberEmailChangedEvent 정의

**파일:** `src/domain/member/events/member-email-changed.event.ts`

```typescript
import { IEvent } from "@nestjs/cqrs";

export class MemberEmailChangedEvent implements IEvent {
  constructor(
    public readonly memberId: string,
    public readonly oldEmail: string,
    public readonly newEmail: string,
    public readonly occurredAt: Date = new Date(Date.now() + 9 * 60 * 60 * 1000),
  ) {}
}
```

**파일:** `src/domain/member/events/index.ts` (export 추가)

```typescript
export * from "./member-register.event";
export * from "./member-withdraw.event";
export * from "./member-update.event";
export * from "./member-email-changed.event";
```

#### 1.3 EmailAlreadyExistsException 추가

**파일:** `src/domain/member/exceptions/email-already-exists.exception.ts`

```typescript
import { ConflictException } from "@nestjs/common";

export class EmailAlreadyExistsException extends ConflictException {
  constructor(email: string) {
    super(`이미 사용 중인 이메일입니다: ${email}`);
  }
}
```

**파일:** `src/domain/member/exceptions/index.ts` (export 추가)

```typescript
export * from "./invalid-email.exception";
export * from "./invalid-password.exception";
export * from "./email-already-exists.exception";
```

---

### Step 2: Application Layer

#### 2.1 ChangeEmailCommand 생성

**파일:** `src/application/member/command/change-email.command.ts`

```typescript
import {
  CommandHandler,
  EventBus,
  ICommand,
  ICommandHandler,
} from "@nestjs/cqrs";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  Member,
  MEMBER_REPOSITORY,
  type MemberRepository,
  PASSWORD_ENCODER,
  type PasswordEncoder,
} from "@/domain/member";
import {
  createDomainEvent,
  EVENT_STORE,
  type EventStore,
} from "@/domain/shared";
import { EntityManager, Transactional } from "@mikro-orm/core";
import { MemberEmailChangedEvent } from "@/domain/member/events";
import {
  MEMBER_READ_REPOSITORY,
  type MemberReadRepository,
} from "@/adapter/member/persistence/read";
import { EmailAlreadyExistsException } from "@/domain/member/exceptions";

export class ChangeEmailCommand implements ICommand {
  constructor(
    public readonly memberId: string,
    public readonly newEmail: string,
    public readonly currentPassword: string,
  ) {}
}

@Injectable()
@CommandHandler(ChangeEmailCommand)
export class ChangeEmailCommandHandler
  implements ICommandHandler<ChangeEmailCommand, string>
{
  constructor(
    @Inject(MEMBER_REPOSITORY)
    private readonly memberRepository: MemberRepository,
    @Inject(MEMBER_READ_REPOSITORY)
    private readonly memberReadRepository: MemberReadRepository,
    @Inject(PASSWORD_ENCODER)
    private readonly passwordEncoder: PasswordEncoder,
    @Inject(EVENT_STORE)
    private readonly eventStore: EventStore,
    private readonly eventBus: EventBus,
    private readonly em: EntityManager,
  ) {}

  @Transactional()
  async execute(command: ChangeEmailCommand): Promise<string> {
    // 1. 기존 회원 조회
    const existingMember = await this.memberRepository.findById(command.memberId);

    if (!existingMember) {
      throw new NotFoundException("회원을 찾을 수 없습니다.");
    }

    const oldEmail = existingMember.email.value;

    // 2. 이메일 중복 확인
    const existingEmail = await this.memberReadRepository.findByEmail(command.newEmail);
    if (existingEmail && existingEmail.id !== command.memberId) {
      throw new EmailAlreadyExistsException(command.newEmail);
    }

    // 3. 도메인 로직 실행 (비밀번호 검증 + 이메일 변경)
    const updatedMember: Member = existingMember.changeEmail(
      command.newEmail,
      command.currentPassword,
      this.passwordEncoder,
    );

    // 4. Write Model 저장
    this.memberRepository.update(updatedMember);

    // 5. Event Store에 이벤트 기록
    this.eventStore.append(
      createDomainEvent(updatedMember.id, "MemberEmailChanged", {
        id: updatedMember.id,
        oldEmail: oldEmail,
        newEmail: updatedMember.email.value,
      }),
    );

    // 6. 트랜잭션 플러시
    await this.em.flush();

    // 7. Integration Event 발행
    this.eventBus.publish(
      new MemberEmailChangedEvent(
        updatedMember.id,
        oldEmail,
        updatedMember.email.value,
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
export * from "./change-email.command";
```

#### 2.2 MemberEmailChangedEventHandler 생성

**파일:** `src/application/member/event/member-email-changed-event-handler.service.ts`

```typescript
import { Inject, Injectable, Logger } from "@nestjs/common";
import { EventsHandler, IEventHandler } from "@nestjs/cqrs";
import { MemberEmailChangedEvent } from "@/domain/member/events";
import {
  MEMBER_READ_REPOSITORY,
  type MemberReadRepository,
} from "@/adapter/member/persistence/read";
import { EntityManager } from "@mikro-orm/core";

@Injectable()
@EventsHandler(MemberEmailChangedEvent)
export class MemberEmailChangedEventHandler
  implements IEventHandler<MemberEmailChangedEvent>
{
  private readonly logger: Logger = new Logger(MemberEmailChangedEventHandler.name);

  constructor(
    @Inject(MEMBER_READ_REPOSITORY)
    private readonly memberReadRepository: MemberReadRepository,
    private readonly em: EntityManager,
  ) {}

  async handle(event: MemberEmailChangedEvent): Promise<void> {
    this.logger.log(`이메일 변경 이벤트 시작: ${event.memberId}`);
    this.logger.log(`이메일 변경: ${event.oldEmail} -> ${event.newEmail}`);

    const readEntity = await this.memberReadRepository.findById(event.memberId);

    if (!readEntity) {
      this.logger.warn(`회원 Read Entity를 찾을 수 없음: ${event.memberId}`);
      return;
    }

    // Read Model 업데이트
    readEntity.email = event.newEmail;
    readEntity.updatedAt = event.occurredAt;

    await this.em.flush();

    this.logger.log(`이메일 변경 이벤트 종료: ${event.memberId}`);
  }
}
```

**파일:** `src/application/member/event/index.ts` (export 추가)

```typescript
export * from "./member-register-event-handler.service";
export * from "./member-withdraw-event-handler.service";
export * from "./member-update-event-handler.service";
export * from "./member-email-changed-event-handler.service";
```

---

### Step 3: Adapter Layer

#### 3.1 ChangeEmailRequestDto 생성

**파일:** `src/adapter/member/api/dto/change-email-request.dto.ts`

```typescript
import { IsEmail, IsString, MinLength } from "class-validator";

export class ChangeEmailRequestDto {
  @IsEmail()
  newEmail!: string;

  @IsString()
  @MinLength(8)
  currentPassword!: string;
}
```

**파일:** `src/adapter/member/api/dto/index.ts` (export 추가)

```typescript
export * from "./register-member-request.dto";
export * from "./update-member-request.dto";
export * from "./change-email-request.dto";
```

#### 3.2 MemberController에 changeEmail 엔드포인트 추가

**파일:** `src/adapter/member/api/member.controller.ts`

```typescript
import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from "@nestjs/common";
import {
  RegisterMemberRequestDto,
  UpdateMemberRequestDto,
  ChangeEmailRequestDto,
} from "@/adapter/member/api/dto";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import {
  ChangeEmailCommand,
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

  @Put(":id/email")
  async changeEmail(
    @Param("id") id: string,
    @Body() dto: ChangeEmailRequestDto,
  ) {
    const memberId: string = await this.commandBus.execute<
      ChangeEmailCommand,
      string
    >(
      new ChangeEmailCommand(
        id,
        dto.newEmail,
        dto.currentPassword,
      ),
    );

    return { id: memberId };
  }
}
```

#### 3.3 MemberModule에 Handler 등록

**파일:** `src/adapter/member/member.module.ts`

```typescript
import {
  ChangeEmailCommandHandler,  // 추가
  MemberRegisterCommandHandler,
  MemberUpdateCommandHandler,
  WithdrawMemberCommandHandler,
} from "@/application/member/command";
import {
  MemberEmailChangedEventHandler,  // 추가
  MemberRegisterEventHandler,
  MemberUpdateEventHandler,
  MemberWithdrawEventHandler,
} from "@/application/member/event";

const CommandHandlers = [
  MemberRegisterCommandHandler,
  MemberUpdateCommandHandler,
  ChangeEmailCommandHandler,  // 추가
  WithdrawMemberCommandHandler,
];

const EventHandlers = [
  MemberRegisterEventHandler,
  MemberUpdateEventHandler,
  MemberEmailChangedEventHandler,  // 추가
  MemberWithdrawEventHandler,
];
```

---

## 파일 체크리스트

### Domain Layer
- [ ] `src/domain/member/member.ts` - `changeEmail()` 메서드 추가
- [ ] `src/domain/member/events/member-email-changed.event.ts` - 새 파일 생성
- [ ] `src/domain/member/events/index.ts` - export 추가
- [ ] `src/domain/member/exceptions/email-already-exists.exception.ts` - 새 파일 생성
- [ ] `src/domain/member/exceptions/index.ts` - export 추가

### Application Layer
- [ ] `src/application/member/command/change-email.command.ts` - 새 파일 생성
- [ ] `src/application/member/command/index.ts` - export 추가
- [ ] `src/application/member/event/member-email-changed-event-handler.service.ts` - 새 파일 생성
- [ ] `src/application/member/event/index.ts` - export 추가

### Adapter Layer
- [ ] `src/adapter/member/api/dto/change-email-request.dto.ts` - 새 파일 생성
- [ ] `src/adapter/member/api/dto/index.ts` - export 추가
- [ ] `src/adapter/member/api/member.controller.ts` - `PUT /:id/email` 엔드포인트 추가
- [ ] `src/adapter/member/member.module.ts` - Handler 등록

---

## API 스펙

### Request

```http
PUT /members/:id/email
Content-Type: application/json

{
  "newEmail": "newemail@example.com",
  "currentPassword": "currentPassword123"
}
```

### Response

```json
{
  "id": "uuid-of-member"
}
```

### Error Responses

| Status | 설명 |
|--------|------|
| 400 | 유효성 검사 실패 (잘못된 이메일 형식, 비밀번호 길이 등) |
| 401 | 현재 비밀번호 불일치 |
| 404 | 회원을 찾을 수 없음 |
| 409 | 이미 사용 중인 이메일 |

---

## Event Sourcing 이벤트 예시

```json
{
  "aggregateId": "member-uuid",
  "eventType": "MemberEmailChanged",
  "payload": {
    "id": "member-uuid",
    "oldEmail": "old@example.com",
    "newEmail": "new@example.com"
  },
  "occurredAt": "2024-01-15T10:30:00.000Z"
}
```

---

## 테스트 코드 가이드

### Unit Test: Member.changeEmail()

```typescript
describe("Member", () => {
  describe("changeEmail", () => {
    const mockEncoder: PasswordEncoder = {
      encode: jest.fn((plain) => `hashed_${plain}`),
      matches: jest.fn((plain, hashed) => hashed === `hashed_${plain}`),
    };

    it("should change email when password is correct", () => {
      const member = Member.of({
        id: "test-id",
        email: Email.of("old@example.com"),
        password: Password.fromHashed("hashed_password123"),
        job: "Developer",
        nickname: "nick",
        notification: NotificationEnum.EMAIL,
        frequency: FrequencyEnum.EVERY,
        point: 0,
        isPro: false,
      });

      const updated = member.changeEmail(
        "new@example.com",
        "password123",
        mockEncoder,
      );

      expect(updated.email.value).toBe("new@example.com");
    });

    it("should throw when password is incorrect", () => {
      const member = Member.of({
        id: "test-id",
        email: Email.of("old@example.com"),
        password: Password.fromHashed("hashed_password123"),
        // ... other fields
      });

      expect(() => {
        member.changeEmail("new@example.com", "wrongPassword", mockEncoder);
      }).toThrow(InvalidPasswordException);
    });
  });
});
```

### Integration Test: PUT /members/:id/email

```typescript
describe("MemberController (e2e)", () => {
  it("PUT /members/:id/email should change email", async () => {
    // Given
    const createRes = await request(app.getHttpServer())
      .post("/members/register")
      .send({
        email: "old@example.com",
        password: "password123",
        // ... other fields
      });

    const memberId = createRes.body.id;

    // When
    const changeRes = await request(app.getHttpServer())
      .put(`/members/${memberId}/email`)
      .send({
        newEmail: "new@example.com",
        currentPassword: "password123",
      });

    // Then
    expect(changeRes.status).toBe(200);

    // Verify
    const getRes = await request(app.getHttpServer())
      .get(`/members/${memberId}`);

    expect(getRes.body.email).toBe("new@example.com");
  });

  it("should reject when password is incorrect", async () => {
    // Given
    const createRes = await request(app.getHttpServer())
      .post("/members/register")
      .send({ /* ... */ });

    // When
    const changeRes = await request(app.getHttpServer())
      .put(`/members/${createRes.body.id}/email`)
      .send({
        newEmail: "new@example.com",
        currentPassword: "wrongPassword",
      });

    // Then
    expect(changeRes.status).toBe(401);
  });

  it("should reject duplicate email", async () => {
    // Given: 두 회원 생성
    await request(app.getHttpServer())
      .post("/members/register")
      .send({ email: "existing@example.com", /* ... */ });

    const secondMember = await request(app.getHttpServer())
      .post("/members/register")
      .send({ email: "second@example.com", /* ... */ });

    // When: 두 번째 회원이 첫 번째 이메일로 변경 시도
    const changeRes = await request(app.getHttpServer())
      .put(`/members/${secondMember.body.id}/email`)
      .send({
        newEmail: "existing@example.com",
        currentPassword: "password123",
      });

    // Then
    expect(changeRes.status).toBe(409);
  });
});
```

---

## 선택적 확장: 이메일 인증 프로세스

이메일 변경 전 인증을 추가하려면:

1. **이메일 인증 요청** (POST `/members/:id/email/verification`)
   - 인증 코드 생성 및 새 이메일로 발송
   - Redis에 인증 코드 저장 (TTL 10분)

2. **이메일 인증 확인** (POST `/members/:id/email/verify`)
   - 인증 코드 검증
   - 검증 성공 시 이메일 변경 처리

이 확장은 별도 가이드에서 다룹니다.
