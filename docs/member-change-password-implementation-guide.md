# 비밀번호 변경 기능 구현 가이드

이 문서는 DDD + CQRS + Event Sourcing 아키텍처 기반으로 비밀번호 변경 기능을 구현하는 가이드입니다.

## 개요

### 보안 고려사항

| 검증 항목 | 설명 |
|-----------|------|
| 현재 비밀번호 확인 | 본인 확인을 위한 현재 비밀번호 검증 |
| 새 비밀번호 정책 | 최소 8자 이상 (Password VO에서 처리) |
| 비밀번호 확인 | 새 비밀번호와 확인 비밀번호 일치 검증 |

---

## 구현 순서

### Step 1: Domain Layer

#### 1.1 Member 엔티티에 changePassword 메서드 추가

**파일:** `src/domain/member/member.ts`

```typescript
import { Email, Password } from "./value-objects";
import type { PasswordEncoder } from "./password-encoder";
import { InvalidPasswordException } from "./exceptions";

export class Member {
  // ... 기존 코드

  /**
   * 비밀번호 변경
   * @param currentPassword 현재 비밀번호
   * @param newPassword 새 비밀번호 (평문)
   * @param encoder 비밀번호 인코더
   * @throws InvalidPasswordException 현재 비밀번호 불일치 또는 새 비밀번호 정책 위반 시
   */
  public changePassword(
    currentPassword: string,
    newPassword: string,
    encoder: PasswordEncoder,
  ): Member {
    // 현재 비밀번호 검증
    if (!this.password.matches(currentPassword, encoder)) {
      throw new InvalidPasswordException();
    }

    // 새 비밀번호로 변경 (Password.create에서 정책 검증)
    const newPasswordVO = Password.create(newPassword, encoder);

    return new Member({
      ...this,
      id: this.id,
      email: this.email,
      password: newPasswordVO,
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

#### 1.2 MemberPasswordChangedEvent 정의

**파일:** `src/domain/member/events/member-password-changed.event.ts`

```typescript
import { IEvent } from "@nestjs/cqrs";

export class MemberPasswordChangedEvent implements IEvent {
  constructor(
    public readonly memberId: string,
    public readonly newPasswordHash: string,
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
export * from "./member-password-changed.event";
```

#### 1.3 PasswordMismatchException 추가 (선택)

현재 비밀번호와 새 비밀번호 정책 위반을 구분하고 싶다면:

**파일:** `src/domain/member/exceptions/password-mismatch.exception.ts`

```typescript
import { UnauthorizedException } from "@nestjs/common";

export class PasswordMismatchException extends UnauthorizedException {
  constructor() {
    super("현재 비밀번호가 일치하지 않습니다.");
  }
}
```

**파일:** `src/domain/member/exceptions/index.ts` (export 추가)

```typescript
export * from "./invalid-email.exception";
export * from "./invalid-password.exception";
export * from "./email-already-exists.exception";
export * from "./password-mismatch.exception";
```

이 경우 `Member.changePassword`에서 `PasswordMismatchException`을 사용:

```typescript
if (!this.password.matches(currentPassword, encoder)) {
  throw new PasswordMismatchException();
}
```

---

### Step 2: Application Layer

#### 2.1 ChangePasswordCommand 생성

**파일:** `src/application/member/command/change-password.command.ts`

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
import { MemberPasswordChangedEvent } from "@/domain/member/events";

export class ChangePasswordCommand implements ICommand {
  constructor(
    public readonly memberId: string,
    public readonly currentPassword: string,
    public readonly newPassword: string,
  ) {}
}

@Injectable()
@CommandHandler(ChangePasswordCommand)
export class ChangePasswordCommandHandler
  implements ICommandHandler<ChangePasswordCommand, string>
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
  async execute(command: ChangePasswordCommand): Promise<string> {
    // 1. 기존 회원 조회
    const existingMember = await this.memberRepository.findById(command.memberId);

    if (!existingMember) {
      throw new NotFoundException("회원을 찾을 수 없습니다.");
    }

    // 2. 도메인 로직 실행 (현재 비밀번호 검증 + 새 비밀번호로 변경)
    const updatedMember: Member = existingMember.changePassword(
      command.currentPassword,
      command.newPassword,
      this.passwordEncoder,
    );

    // 3. Write Model 저장
    this.memberRepository.update(updatedMember);

    // 4. Event Store에 이벤트 기록
    // 주의: 보안상 비밀번호 해시만 저장 (평문 절대 저장 금지)
    this.eventStore.append(
      createDomainEvent(updatedMember.id, "MemberPasswordChanged", {
        id: updatedMember.id,
        // 이벤트 발생 시점만 기록 (해시도 저장하지 않는 것이 더 안전)
        changedAt: new Date().toISOString(),
      }),
    );

    // 5. 트랜잭션 플러시
    await this.em.flush();

    // 6. Integration Event 발행
    this.eventBus.publish(
      new MemberPasswordChangedEvent(
        updatedMember.id,
        updatedMember.password.value,
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
export * from "./change-password.command";
```

#### 2.2 MemberPasswordChangedEventHandler 생성

**파일:** `src/application/member/event/member-password-changed-event-handler.service.ts`

```typescript
import { Inject, Injectable, Logger } from "@nestjs/common";
import { EventsHandler, IEventHandler } from "@nestjs/cqrs";
import { MemberPasswordChangedEvent } from "@/domain/member/events";
import {
  MEMBER_READ_REPOSITORY,
  type MemberReadRepository,
} from "@/adapter/member/persistence/read";
import { EntityManager } from "@mikro-orm/core";

@Injectable()
@EventsHandler(MemberPasswordChangedEvent)
export class MemberPasswordChangedEventHandler
  implements IEventHandler<MemberPasswordChangedEvent>
{
  private readonly logger: Logger = new Logger(MemberPasswordChangedEventHandler.name);

  constructor(
    @Inject(MEMBER_READ_REPOSITORY)
    private readonly memberReadRepository: MemberReadRepository,
    private readonly em: EntityManager,
  ) {}

  async handle(event: MemberPasswordChangedEvent): Promise<void> {
    this.logger.log(`비밀번호 변경 이벤트 시작: ${event.memberId}`);

    const readEntity = await this.memberReadRepository.findById(event.memberId);

    if (!readEntity) {
      this.logger.warn(`회원 Read Entity를 찾을 수 없음: ${event.memberId}`);
      return;
    }

    // Read Model 업데이트
    readEntity.password = event.newPasswordHash;
    readEntity.updatedAt = event.occurredAt;

    await this.em.flush();

    this.logger.log(`비밀번호 변경 이벤트 종료: ${event.memberId}`);
  }
}
```

**파일:** `src/application/member/event/index.ts` (export 추가)

```typescript
export * from "./member-register-event-handler.service";
export * from "./member-withdraw-event-handler.service";
export * from "./member-update-event-handler.service";
export * from "./member-email-changed-event-handler.service";
export * from "./member-password-changed-event-handler.service";
```

---

### Step 3: Adapter Layer

#### 3.1 ChangePasswordRequestDto 생성

**파일:** `src/adapter/member/api/dto/change-password-request.dto.ts`

```typescript
import { IsString, MinLength } from "class-validator";
import { Match } from "@/adapter/shared/decorators/match.decorator";

export class ChangePasswordRequestDto {
  @IsString()
  @MinLength(8)
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;

  @IsString()
  @MinLength(8)
  @Match("newPassword", { message: "비밀번호 확인이 일치하지 않습니다." })
  confirmPassword!: string;
}
```

#### 3.2 Match 커스텀 데코레이터 생성

**파일:** `src/adapter/shared/decorators/match.decorator.ts`

```typescript
import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from "class-validator";

export function Match(property: string, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: "Match",
      target: object.constructor,
      propertyName: propertyName,
      constraints: [property],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints;
          const relatedValue = (args.object as Record<string, unknown>)[
            relatedPropertyName
          ];
          return value === relatedValue;
        },
        defaultMessage(args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints;
          return `${args.property} must match ${relatedPropertyName}`;
        },
      },
    });
  };
}
```

**파일:** `src/adapter/shared/decorators/index.ts`

```typescript
export * from "./match.decorator";
```

**파일:** `src/adapter/member/api/dto/index.ts` (export 추가)

```typescript
export * from "./register-member-request.dto";
export * from "./update-member-request.dto";
export * from "./change-email-request.dto";
export * from "./change-password-request.dto";
```

#### 3.3 MemberController에 changePassword 엔드포인트 추가

**파일:** `src/adapter/member/api/member.controller.ts`

```typescript
import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from "@nestjs/common";
import {
  ChangeEmailRequestDto,
  ChangePasswordRequestDto,
  RegisterMemberRequestDto,
  UpdateMemberRequestDto,
} from "@/adapter/member/api/dto";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import {
  ChangeEmailCommand,
  ChangePasswordCommand,
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

  @Put(":id/password")
  async changePassword(
    @Param("id") id: string,
    @Body() dto: ChangePasswordRequestDto,
  ) {
    const memberId: string = await this.commandBus.execute<
      ChangePasswordCommand,
      string
    >(
      new ChangePasswordCommand(
        id,
        dto.currentPassword,
        dto.newPassword,
      ),
    );

    return { id: memberId };
  }
}
```

#### 3.4 MemberModule에 Handler 등록

**파일:** `src/adapter/member/member.module.ts`

```typescript
import {
  ChangeEmailCommandHandler,
  ChangePasswordCommandHandler,  // 추가
  MemberRegisterCommandHandler,
  MemberUpdateCommandHandler,
  WithdrawMemberCommandHandler,
} from "@/application/member/command";
import {
  MemberEmailChangedEventHandler,
  MemberPasswordChangedEventHandler,  // 추가
  MemberRegisterEventHandler,
  MemberUpdateEventHandler,
  MemberWithdrawEventHandler,
} from "@/application/member/event";

const CommandHandlers = [
  MemberRegisterCommandHandler,
  MemberUpdateCommandHandler,
  ChangeEmailCommandHandler,
  ChangePasswordCommandHandler,  // 추가
  WithdrawMemberCommandHandler,
];

const EventHandlers = [
  MemberRegisterEventHandler,
  MemberUpdateEventHandler,
  MemberEmailChangedEventHandler,
  MemberPasswordChangedEventHandler,  // 추가
  MemberWithdrawEventHandler,
];
```

---

## 파일 체크리스트

### Domain Layer
- [ ] `src/domain/member/member.ts` - `changePassword()` 메서드 추가
- [ ] `src/domain/member/events/member-password-changed.event.ts` - 새 파일 생성
- [ ] `src/domain/member/events/index.ts` - export 추가
- [ ] `src/domain/member/exceptions/password-mismatch.exception.ts` - 새 파일 생성 (선택)
- [ ] `src/domain/member/exceptions/index.ts` - export 추가

### Application Layer
- [ ] `src/application/member/command/change-password.command.ts` - 새 파일 생성
- [ ] `src/application/member/command/index.ts` - export 추가
- [ ] `src/application/member/event/member-password-changed-event-handler.service.ts` - 새 파일 생성
- [ ] `src/application/member/event/index.ts` - export 추가

### Adapter Layer
- [ ] `src/adapter/shared/decorators/match.decorator.ts` - 새 파일 생성
- [ ] `src/adapter/shared/decorators/index.ts` - 새 파일 생성
- [ ] `src/adapter/member/api/dto/change-password-request.dto.ts` - 새 파일 생성
- [ ] `src/adapter/member/api/dto/index.ts` - export 추가
- [ ] `src/adapter/member/api/member.controller.ts` - `PUT /:id/password` 엔드포인트 추가
- [ ] `src/adapter/member/member.module.ts` - Handler 등록

---

## API 스펙

### Request

```http
PUT /members/:id/password
Content-Type: application/json

{
  "currentPassword": "currentPassword123",
  "newPassword": "newPassword456",
  "confirmPassword": "newPassword456"
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
| 400 | 유효성 검사 실패 (비밀번호 길이, 확인 불일치 등) |
| 401 | 현재 비밀번호 불일치 |
| 404 | 회원을 찾을 수 없음 |

---

## Event Sourcing 이벤트 예시

```json
{
  "aggregateId": "member-uuid",
  "eventType": "MemberPasswordChanged",
  "payload": {
    "id": "member-uuid",
    "changedAt": "2024-01-15T10:30:00.000Z"
  },
  "occurredAt": "2024-01-15T10:30:00.000Z"
}
```

> **보안 주의:** Event Store에는 비밀번호 해시도 저장하지 않는 것이 권장됩니다. 비밀번호 변경 사실만 기록합니다.

---

## 테스트 코드 가이드

### Unit Test: Member.changePassword()

```typescript
describe("Member", () => {
  describe("changePassword", () => {
    const mockEncoder: PasswordEncoder = {
      encode: jest.fn((plain) => `hashed_${plain}`),
      matches: jest.fn((plain, hashed) => hashed === `hashed_${plain}`),
    };

    it("should change password when current password is correct", () => {
      const member = Member.of({
        id: "test-id",
        email: Email.of("test@example.com"),
        password: Password.fromHashed("hashed_oldPassword123"),
        job: "Developer",
        nickname: "nick",
        notification: NotificationEnum.EMAIL,
        frequency: FrequencyEnum.EVERY,
        point: 0,
        isPro: false,
      });

      const updated = member.changePassword(
        "oldPassword123",
        "newPassword456",
        mockEncoder,
      );

      expect(updated.password.value).toBe("hashed_newPassword456");
    });

    it("should throw when current password is incorrect", () => {
      const member = Member.of({
        id: "test-id",
        email: Email.of("test@example.com"),
        password: Password.fromHashed("hashed_oldPassword123"),
        // ... other fields
      });

      expect(() => {
        member.changePassword("wrongPassword", "newPassword456", mockEncoder);
      }).toThrow(InvalidPasswordException);
    });

    it("should throw when new password does not meet policy", () => {
      const member = Member.of({
        id: "test-id",
        email: Email.of("test@example.com"),
        password: Password.fromHashed("hashed_oldPassword123"),
        // ... other fields
      });

      expect(() => {
        member.changePassword("oldPassword123", "short", mockEncoder);
      }).toThrow(InvalidPasswordException);
    });
  });
});
```

### Unit Test: Match Decorator

```typescript
describe("ChangePasswordRequestDto", () => {
  it("should pass validation when passwords match", async () => {
    const dto = new ChangePasswordRequestDto();
    dto.currentPassword = "oldPassword123";
    dto.newPassword = "newPassword456";
    dto.confirmPassword = "newPassword456";

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("should fail validation when passwords do not match", async () => {
    const dto = new ChangePasswordRequestDto();
    dto.currentPassword = "oldPassword123";
    dto.newPassword = "newPassword456";
    dto.confirmPassword = "differentPassword";

    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toHaveProperty("Match");
  });
});
```

### Integration Test: PUT /members/:id/password

```typescript
describe("MemberController (e2e)", () => {
  it("PUT /members/:id/password should change password", async () => {
    // Given
    const createRes = await request(app.getHttpServer())
      .post("/members/register")
      .send({
        email: "test@example.com",
        password: "oldPassword123",
        // ... other fields
      });

    const memberId = createRes.body.id;

    // When
    const changeRes = await request(app.getHttpServer())
      .put(`/members/${memberId}/password`)
      .send({
        currentPassword: "oldPassword123",
        newPassword: "newPassword456",
        confirmPassword: "newPassword456",
      });

    // Then
    expect(changeRes.status).toBe(200);

    // Verify: 새 비밀번호로 로그인 가능
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({
        email: "test@example.com",
        password: "newPassword456",
      });

    expect(loginRes.status).toBe(200);
  });

  it("should reject when current password is incorrect", async () => {
    // Given
    const createRes = await request(app.getHttpServer())
      .post("/members/register")
      .send({ password: "oldPassword123", /* ... */ });

    // When
    const changeRes = await request(app.getHttpServer())
      .put(`/members/${createRes.body.id}/password`)
      .send({
        currentPassword: "wrongPassword",
        newPassword: "newPassword456",
        confirmPassword: "newPassword456",
      });

    // Then
    expect(changeRes.status).toBe(401);
  });

  it("should reject when confirmPassword does not match", async () => {
    // Given
    const createRes = await request(app.getHttpServer())
      .post("/members/register")
      .send({ password: "oldPassword123", /* ... */ });

    // When
    const changeRes = await request(app.getHttpServer())
      .put(`/members/${createRes.body.id}/password`)
      .send({
        currentPassword: "oldPassword123",
        newPassword: "newPassword456",
        confirmPassword: "differentPassword",
      });

    // Then
    expect(changeRes.status).toBe(400);
  });
});
```

---

## 보안 권장사항

1. **Rate Limiting**: 비밀번호 변경 API에 요청 제한 적용
2. **로그 기록**: 비밀번호 변경 시도(성공/실패) 로그 기록
3. **세션 무효화**: 비밀번호 변경 후 기존 세션/토큰 무효화 고려
4. **알림 발송**: 비밀번호 변경 시 이메일/카카오 알림 발송
5. **비밀번호 히스토리**: 이전 비밀번호 재사용 방지 (선택)
