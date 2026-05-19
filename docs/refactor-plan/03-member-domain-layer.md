# 03. Member Domain Layer

> **사전 조건**: Phase 02 완료 (Event Sourcing 인프라 동작)

## Goal

Member 도메인의 **순수 비즈니스 로직**을 구현한다. 이 레이어는 NestJS/MikroORM/프레임워크 의존성을 갖지 않는다. 오직 TypeScript + Phase 02의 도메인 베이스 클래스만 사용 (외부 lib 0개).

이 Phase의 결과물은 **단위 테스트만으로 100% 검증 가능**해야 한다.

---

## 사전 작업

별도 lib 설치나 베이스 클래스 보강은 필요 없다. Phase 02에서 정의된 `AggregateRoot` / `DomainEvent`를 그대로 사용한다.

### `when()` 리팩토링 방침 — **외부 Handlers 파일 + Snapshot 재사용**

설계 디스커션에서 다음 5개 안을 비교했다.

| 옵션 | 내용 | 결과 |
|---|---|---|
| A-naive. 내부 Dispatch Table | aggregate 안 `handlers` 맵 + private `whenXxx` 메서드 | 기각 — aggregate가 여전히 200+줄. private 메서드 7개가 그대로 남아 "메서드 너무 많음" 원래 불만 미해결 |
| **A. 외부 Dispatch Table** | `member.handlers.ts`에 `{ [EventType]: (state, event) => void }` 맵 분리. `MemberState = MemberSnapshot` alias로 타입 재사용. aggregate는 thin facade | **채택** |
| B. Inline 단순 케이스 | 1-2줄 핸들러는 `when()` 안에 inline | 기각 — 단순/복잡 경계가 시간이 흐르면 흐려짐, dispatch 위치 분산 |
| C. Self-Applying Events | 이벤트 클래스가 `applyTo(aggregate)` 메서드 보유 | 기각 — aggregate setter 노출로 캡슐화 약화 + EventStore `restore()` hydration 레지스트리 인프라 추가 필요 |
| D. Reducer + 별도 State 타입 | 새 `MemberState` interface + `reducer(state, event)` 함수 | 기각 — 채택안 A가 snapshot을 state로 alias 재사용하여 동일 효과를 달성하면서 타입 중복 없음 |

**A를 택한 이유**

`AggregateRoot.apply()`와 `loadFromHistory()`는 결국 `when(event)`를 호출하므로 `when()` 자체는 반드시 필요하다. 다만 dispatch 맵과 `whenXxx` 메서드 묶음을 aggregate 클래스 안에 두면 다음 문제가 생긴다.

- aggregate 클래스가 200+줄로 비대해지며 식별성/커맨드/dispatch/snapshot/state 변경이 한 파일 안에서 관심사를 잃는다.
- 이벤트별 상태 변경 함수가 private이라 단위 테스트 시 aggregate 인스턴스를 만들고 커맨드를 통해 간접 검증해야 한다.
- "메서드가 너무 많다"는 직관적 인상이 사라지지 않는다.

A는 다음을 달성한다.

- **aggregate는 thin facade**(~110줄, `when()`은 3줄, private 메서드 1개): commands + dispatch + snapshot mapping만 책임진다.
- **handlers는 순수 함수의 모음**: `(state, event) => void` 시그니처라 단위 테스트가 aggregate 인스턴스 없이 가능.
- **`MemberState = MemberSnapshot`**: state vs snapshot 타입 중복이 사라진다 (D를 기각했던 사유의 해결).
- **VO는 경계에서만 사용**: state는 primitive. 도메인 검증은 커맨드 메서드의 VO 팩토리(`Email.of(...)` 등)에서 1회 수행. EventStore는 신뢰한다 (append-only, 쓰기 시점에 이미 검증됨).

채택 패턴 (요약 — 전체 코드는 Step 7):

```typescript
// member.handlers.ts
export const memberEventHandlers = {
  [MemberRegisteredEvent.TYPE]: (s: MemberState, e: MemberRegisteredEvent) => { /* mutate state */ },
  // ...
} satisfies Record<MemberEventType, (s: MemberState, e: any) => void>;

// member.aggregate.ts
protected when(event: DomainEvent): void {
  const handler = memberEventHandlers[event.eventType as MemberEventType];
  if (!handler) throw new Error(`[Member] Unhandled event: ${event.eventType}`);
  handler(this.state, event as never);
}
```

중요: 각 이벤트의 `TYPE`은 반드시 `public static readonly TYPE = "MemberRegistered" as const;` 형태여야 한다. `string`으로 넓히면 `MemberEventType` literal union이 무너지고 `satisfies` 검사가 무력화된다.

> `satisfies` 결합은 컴파일 타임 누락 검출용 보강이다. 순수 dispatch table은 `Record<string, ...>`로도 성립하지만, ES에서 누락은 production replay 후 데이터 복구 불가로 이어지므로 컴파일 타임 차단을 추가한다.

> **Trade-off 노트**: state가 primitive이므로 핸들러 실행 시 VO 재검증이 없다. EventStore에 손상된 데이터가 들어가면 replay가 invalid state를 만들 수 있다. EventStore가 append-only + 쓰기 경계에서 VO 검증을 하므로 일반적으로는 충분하지만, 금융/규제 수준의 paranoid 시스템은 핸들러 안에서 `Email.of(payload.email)` 식으로 wrap-and-unwrap을 검토하라.

---

## 산출물 체크리스트

### Value Objects (`src/bounded-context/member/domain/member/value-objects/`)
- [ ] `email.vo.ts`
- [ ] `password.vo.ts`
- [ ] `nickname.vo.ts`
- [ ] `verification-code.vo.ts`
- [ ] `verification-token.vo.ts`
- [ ] `member-id.vo.ts`

### Enums (`src/bounded-context/member/domain/member/enums/`)
- [ ] `notification.enum.ts` (EMAIL, KAKAO, BOTH)
- [ ] `frequency.enum.ts` (EVERY, WEEKLY)

### Exceptions (`src/bounded-context/member/domain/member/exceptions/`)
- [ ] `invalid-email.exception.ts`
- [ ] `invalid-password.exception.ts`
- [ ] `invalid-nickname.exception.ts`
- [ ] `invalid-verification-code.exception.ts`
- [ ] `password-mismatch.exception.ts`
- [ ] `email-not-changed.exception.ts`

### Domain Events (`src/bounded-context/member/domain/member/events/`)
- [ ] `member-registered.event.ts`
- [ ] `member-updated.event.ts`
- [ ] `member-password-changed.event.ts`
- [ ] `member-password-reset.event.ts`
- [ ] `member-email-changed.event.ts`
- [ ] `member-point-added.event.ts`
- [ ] `member-withdrawn.event.ts`

### Commands (`src/bounded-context/member/domain/member/commands/`)
- [ ] `register-member.command.ts`
- [ ] `update-member.command.ts`

### Aggregate (`src/bounded-context/member/domain/member/`)
- [ ] `member.aggregate.ts` — Member Aggregate Root (thin facade)
- [ ] `member.handlers.ts` — 이벤트 → 상태 변경 함수 (외부화된 reducer)
- [ ] `member.snapshot.ts` — 직렬화 표현(primitive only) + `MemberState` alias의 source

### Ports (`src/bounded-context/member/application/member/ports/out/`)
- [ ] `password-encoder.port.ts`

### 테스트 (`test/unit/bounded-context/member/member/`)
- [ ] `value-objects/email.spec.ts`
- [ ] `value-objects/password.spec.ts`
- [ ] `value-objects/nickname.spec.ts`
- [ ] `value-objects/verification-code.spec.ts`
- [ ] `member.aggregate.spec.ts`

---

## Step 1. Enums

```typescript
// src/bounded-context/member/domain/member/enums/notification.enum.ts
export enum NotificationChannel {
  EMAIL = "EMAIL",
  KAKAO = "KAKAO",
  BOTH = "BOTH",
}

// src/bounded-context/member/domain/member/enums/frequency.enum.ts
export enum NotificationFrequency {
  EVERY = "EVERY",
  WEEKLY = "WEEKLY",
}
```

---

## Step 2. Exceptions (도메인 예외)

```typescript
// src/bounded-context/member/domain/member/exceptions/invalid-email.exception.ts
export class InvalidEmailException extends Error {
  public readonly code = "INVALID_EMAIL";
  constructor(value: string) {
    super(`Invalid email format: ${value}`);
  }
}

// invalid-password.exception.ts
export class InvalidPasswordException extends Error {
  public readonly code = "INVALID_PASSWORD";
  constructor(reason: string) {
    super(`Invalid password: ${reason}`);
  }
}

// invalid-nickname.exception.ts
export class InvalidNicknameException extends Error {
  public readonly code = "INVALID_NICKNAME";
  constructor(reason: string) {
    super(`Invalid nickname: ${reason}`);
  }
}

// invalid-verification-code.exception.ts
export class InvalidVerificationCodeException extends Error {
  public readonly code = "INVALID_VERIFICATION_CODE";
  constructor() {
    super("Verification code is invalid or expired");
  }
}

// password-mismatch.exception.ts
export class PasswordMismatchException extends Error {
  public readonly code = "PASSWORD_MISMATCH";
  constructor() {
    super("Password does not match");
  }
}

// email-not-changed.exception.ts
export class EmailNotChangedException extends Error {
  public readonly code = "EMAIL_NOT_CHANGED";
  constructor() {
    super("New email is identical to the current one");
  }
}
```

> `EmailNotChangedException`은 "변경 요청이 들어왔는데 변경 대상이 같다"는 호출자 측 mismatch를 명시적으로 surface 한다. silent no-op은 UI 버그/stale form 등을 묻어버리므로 도메인 차원에서 거부한다(`PasswordMismatchException`과 같은 카테고리).

> **하이브리드 에러 패턴 메모**: 도메인 레이어는 도메인 예외를 던지고, Presentation 레이어의 ExceptionFilter가 이를 HTTP 응답으로 매핑한다 (Phase 05).

---

## Step 3. Value Objects

> **베이스 클래스 패턴**:
> - `ValueObject<V>`는 `V`에 대한 제약이 없으므로 `string` 같은 primitive 직접 사용 가능.
> - 베이스가 `protected readonly _value: V` 필드와 `public get value(): V` getter를 제공한다.
> - 자식 VO는 **단일 필드**면 `ValueObject<string>`처럼 primitive로, **다중 필드**면 `ValueObject<{ ... }>` 형태로 정의한다.
> - 다중 필드일 때 내부 키 이름으로 `value`를 피한다 (베이스의 `get value()`가 객체 전체를 반환하므로 의미 충돌).

### 3-1. `email.vo.ts`

```typescript
// src/bounded-context/member/domain/member/value-objects/email.vo.ts
import { ValueObject } from "@/shared-kernel/domain/value-object.base";
import { InvalidEmailException } from "../exceptions/invalid-email.exception";

export class Email extends ValueObject<string> {
  private static readonly PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,7}$/;

  private constructor(value: string) {
    super(value);
  }

  public static of(value: string): Email {
    if (!Email.PATTERN.test(value)) {
      throw new InvalidEmailException(value);
    }
    return new Email(value);
  }
}
```

> 베이스가 `get value(): string`을 자동 제공하므로 별도 getter를 정의하지 않는다. 외부에서 `email.value`로 접근.
>
> **권장**: 운영 단계에서는 `new Email(value.toLowerCase())`로 normalize 하는 게 안전하다 (RFC 5321 local-part 제외 case-insensitive). 단위 테스트도 그에 맞춰 추가할 것.

### 3-2. `password.vo.ts`

```typescript
// src/bounded-context/member/domain/member/value-objects/password.vo.ts
import { ValueObject } from "@/shared-kernel/domain/value-object.base";
import type { PasswordEncoder } from "@/bounded-context/member/application/member/ports/out/password-encoder.port";
import { InvalidPasswordException } from "../exceptions/invalid-password.exception";

export class Password extends ValueObject<string> {
  private static readonly MIN_LENGTH = 8;

  private constructor(hashed: string) {
    super(hashed);
  }

  public static create(plain: string, encoder: PasswordEncoder): Password {
    if (plain.length < Password.MIN_LENGTH) {
      throw new InvalidPasswordException(`Must be at least ${Password.MIN_LENGTH} chars`);
    }
    return new Password(encoder.encode(plain));
  }

  public static fromHashed(hashed: string): Password {
    return new Password(hashed);
  }

  public matches(plain: string, encoder: PasswordEncoder): boolean {
    return encoder.matches(plain, this._value);
  }

  public get hashed(): string {
    return this._value;
  }
}
```

> 베이스의 `value` getter도 자동 노출되지만, 도메인 의미를 살리기 위해 `hashed`라는 이름의 alias getter를 둔다. 외부 코드(`password.hashed`)와 도메인 의도가 일치한다.

### 3-3. `nickname.vo.ts`

```typescript
// src/bounded-context/member/domain/member/value-objects/nickname.vo.ts
import { ValueObject } from "@/shared-kernel/domain/value-object.base";
import { InvalidNicknameException } from "../exceptions/invalid-nickname.exception";

export class Nickname extends ValueObject<string> {
  private static readonly MIN = 2;
  private static readonly MAX = 20;

  private constructor(value: string) {
    super(value);
  }

  public static of(value: string): Nickname {
    const trimmed = value.trim();
    if (trimmed.length < Nickname.MIN || trimmed.length > Nickname.MAX) {
      throw new InvalidNicknameException(
        `Length must be between ${Nickname.MIN} and ${Nickname.MAX}`,
      );
    }
    return new Nickname(trimmed);
  }
}
```

### 3-4. `verification-code.vo.ts`

```typescript
// src/bounded-context/member/domain/member/value-objects/verification-code.vo.ts
import { ValueObject } from "@/shared-kernel/domain/value-object.base";

interface VerificationCodeValue {
  code: string;
  expiresAt: Date;
}

export class VerificationCode extends ValueObject<VerificationCodeValue> {
  private static readonly TTL_MS = 5 * 60 * 1000;

  private constructor(value: VerificationCodeValue) {
    super(value);
  }

  public static generate(now: Date = new Date()): VerificationCode {
    const code = String(Math.floor(1000 + Math.random() * 9000));  // 4자리
    return new VerificationCode({
      code,
      expiresAt: new Date(now.getTime() + VerificationCode.TTL_MS),
    });
  }

  public static of(code: string, expiresAt: Date): VerificationCode {
    return new VerificationCode({ code, expiresAt });
  }

  public isExpired(now: Date = new Date()): boolean {
    return now.getTime() >= this._value.expiresAt.getTime();
  }

  public matches(input: string, now: Date = new Date()): boolean {
    return !this.isExpired(now) && this._value.code === input;
  }

  public get code(): string { return this._value.code; }
  public get expiresAt(): Date { return this._value.expiresAt; }
}
```

> 내부 필드명을 `value` → `code`로 바꿔 베이스의 `get value()` (객체 전체 반환)와의 의미 충돌을 피한다. 외부 사용처는 `verificationCode.code` / `verificationCode.expiresAt`.

### 3-5. `verification-token.vo.ts`

```typescript
// src/bounded-context/member/domain/member/value-objects/verification-token.vo.ts
import { randomUUID } from "node:crypto";
import { ValueObject } from "@/shared-kernel/domain/value-object.base";

interface VerificationTokenValue {
  token: string;
  email: string;
  expiresAt: Date;
}

export class VerificationToken extends ValueObject<VerificationTokenValue> {
  private static readonly TTL_MS = 5 * 60 * 1000;

  private constructor(value: VerificationTokenValue) {
    super(value);
  }

  public static generate(email: string, now: Date = new Date()): VerificationToken {
    return new VerificationToken({
      token: randomUUID(),
      email,
      expiresAt: new Date(now.getTime() + VerificationToken.TTL_MS),
    });
  }

  public isExpired(now: Date = new Date()): boolean {
    return now.getTime() >= this._value.expiresAt.getTime();
  }

  public get token(): string { return this._value.token; }
  public get email(): string { return this._value.email; }
  public get expiresAt(): Date { return this._value.expiresAt; }
}
```

> `VerificationCode`와 동일한 원칙. 외부 사용처는 `verificationToken.token`.

### 3-6. `member-id.vo.ts`

```typescript
// src/bounded-context/member/domain/member/value-objects/member-id.vo.ts
import { randomUUID } from "node:crypto";
import { ValueObject } from "@/shared-kernel/domain/value-object.base";

export class MemberId extends ValueObject<string> {
  private constructor(value: string) {
    super(value);
  }

  public static generate(): MemberId {
    return new MemberId(randomUUID());
  }

  public static of(value: string): MemberId {
    return new MemberId(value);
  }
}
```

> 다른 VO들과의 일관성을 위해 `ValueObject<string>`을 상속한다. `value` getter와 `equals`는 베이스가 자동 제공.

---

## Step 4. PasswordEncoder Port

```typescript
// src/bounded-context/member/application/member/ports/out/password-encoder.port.ts
export const PASSWORD_ENCODER = Symbol("PASSWORD_ENCODER");

export interface PasswordEncoder {
  encode(plain: string): string;
  matches(plain: string, hashed: string): boolean;
}
```

> 도메인 레이어가 Application 레이어의 port를 import 하지만, 이는 "도메인이 정의한 인터페이스를 Application에 두는" Hexagonal의 일반적 변형이다. 더 엄격하게 분리하고 싶다면 `domain/member/ports/`에 두어도 된다. 본 가이드는 **Application에 둔다** (Phase 04에서 UseCase가 같은 폴더에서 import 하기 편함).

---

## Step 5. Domain Events

> **핵심 원칙**: 각 이벤트 클래스는 정적 `TYPE` 상수를 `as const`로 노출한다. `member.handlers.ts`가 이 상수들을 모아 `MemberEventType` literal union을 만들고, `satisfies Record<MemberEventType, Handler>` 핸들러 맵으로 이벤트 누락을 컴파일 타임에 잡는다.
>
> 금지: `public static readonly TYPE: string = "MemberRegistered";`
>
> 허용: `public static readonly TYPE = "MemberRegistered" as const;`

### 5-1. `member-registered.event.ts`

```typescript
// src/bounded-context/member/domain/member/events/member-registered.event.ts
import { DomainEvent } from "@/shared-kernel/domain/domain-event.base";
import type { NotificationChannel } from "../enums/notification.enum";
import type { NotificationFrequency } from "../enums/frequency.enum";

export interface MemberRegisteredPayload {
  email: string;
  hashedPassword: string;
  nickname: string;
  job: string;
  notification: NotificationChannel;
  frequency: NotificationFrequency;
}

export class MemberRegisteredEvent extends DomainEvent<MemberRegisteredPayload> {
  public static readonly TYPE = "MemberRegistered" as const;

  constructor(args: {
    aggregateId: string;
    eventVersion: number;
    payload: MemberRegisteredPayload;
  }) {
    super({
      aggregateId: args.aggregateId,
      aggregateType: "Member",
      eventType: MemberRegisteredEvent.TYPE,
      eventVersion: args.eventVersion,
      payload: args.payload,
    });
  }
}
```

### 5-2. 나머지 이벤트 (같은 패턴)

```typescript
// member-updated.event.ts
export interface MemberUpdatedPayload {
  job?: string;
  nickname?: string;
  notification?: NotificationChannel;
  frequency?: NotificationFrequency;
}
export class MemberUpdatedEvent extends DomainEvent<MemberUpdatedPayload> {
  public static readonly TYPE = "MemberUpdated" as const;
  /* constructor same as above */
}

// member-password-changed.event.ts
export interface MemberPasswordChangedPayload { hashedPassword: string; }
export class MemberPasswordChangedEvent extends DomainEvent<MemberPasswordChangedPayload> {
  public static readonly TYPE = "MemberPasswordChanged" as const;
}

// member-password-reset.event.ts
export interface MemberPasswordResetPayload { hashedPassword: string; }
export class MemberPasswordResetEvent extends DomainEvent<MemberPasswordResetPayload> {
  public static readonly TYPE = "MemberPasswordReset" as const;
}

// member-email-changed.event.ts
export interface MemberEmailChangedPayload { newEmail: string; }
export class MemberEmailChangedEvent extends DomainEvent<MemberEmailChangedPayload> {
  public static readonly TYPE = "MemberEmailChanged" as const;
}

// member-point-added.event.ts
export interface MemberPointAddedPayload { amount: number; }
export class MemberPointAddedEvent extends DomainEvent<MemberPointAddedPayload> {
  public static readonly TYPE = "MemberPointAdded" as const;
}

// member-withdrawn.event.ts
export interface MemberWithdrawnPayload { withdrawnAt: string; }
export class MemberWithdrawnEvent extends DomainEvent<MemberWithdrawnPayload> {
  public static readonly TYPE = "MemberWithdrawn" as const;
}
```

> **모든 이벤트의 payload는 primitive로 직렬화**해야 한다. VO 그대로 넣지 말 것 (`email.value`, `password.hashed`).

---

## Step 6. Commands & Snapshot

> **분리 의도**:
> - **Commands**: Aggregate 메서드의 입력 shape. "회원에게 내리는 명령"의 도메인 의미를 이름에 담는다. VO를 그대로 품기 때문에 DTO(primitive only)와 구분된다.
> - **Snapshot**: Aggregate 내부 상태의 직렬화 가능 표현. Event Sourcing 스냅샷 적재/복원에서 persistence adapter(Phase 06)와 공유한다.
> - 모두 Aggregate 본체와 변경 이유(SRP)가 달라 별도 파일로 분리한다.

### 6-1. `register-member.command.ts`

```typescript
// src/bounded-context/member/domain/member/commands/register-member.command.ts
import type { Email } from "../value-objects/email.vo";
import type { Password } from "../value-objects/password.vo";
import type { Nickname } from "../value-objects/nickname.vo";
import type { NotificationChannel } from "../enums/notification.enum";
import type { NotificationFrequency } from "../enums/frequency.enum";

export interface RegisterMemberCommand {
  email: Email;
  password: Password;
  nickname: Nickname;
  job: string;
  notification: NotificationChannel;
  frequency: NotificationFrequency;
}
```

### 6-2. `update-member.command.ts`

```typescript
// src/bounded-context/member/domain/member/commands/update-member.command.ts
import type { Nickname } from "../value-objects/nickname.vo";
import type { NotificationChannel } from "../enums/notification.enum";
import type { NotificationFrequency } from "../enums/frequency.enum";

export interface UpdateMemberCommand {
  job?: string;
  nickname?: Nickname;
  notification?: NotificationChannel;
  frequency?: NotificationFrequency;
}
```

### 6-3. `member.snapshot.ts`

```typescript
// src/bounded-context/member/domain/member/member.snapshot.ts
import type { NotificationChannel } from "./enums/notification.enum";
import type { NotificationFrequency } from "./enums/frequency.enum";

export interface MemberSnapshot {
  id: string;
  email: string;
  hashedPassword: string;
  nickname: string;
  job: string;
  notification: NotificationChannel;
  frequency: NotificationFrequency;
  point: number;
  isPro: boolean;
  isWithdrawn: boolean;
}
```

> Snapshot은 도메인 상태의 "직렬화 가능 표현"이므로 도메인 레이어에 둔다. persistence adapter(Phase 06)는 이 타입을 import하여 DB 레코드 ↔ Snapshot 매핑만 책임진다.
>
> **Command와 도메인 의미**: NestJS CQRS lib을 도입할 경우 lib의 `ICommand`/`@CommandHandler`와 이름이 겹친다. 본 가이드는 CQRS lib을 사용하지 않으므로 도메인 Command가 충돌 없이 1급 시민이다. lib 도입 시점에 도메인 쪽은 `*Input`/`*Args`로 일괄 변경하거나, lib 측 명령을 `*UseCaseCommand`로 분리하는 규약을 정해야 한다.


---

## Step 7. Member Aggregate (Handlers + Facade)

도메인 레이어의 **심장**이다. 두 파일로 분리한다.

- **`member.handlers.ts`**: 이벤트 타입 → state 변경 함수의 dispatch 맵 + `MemberEventType` union + `MemberState` alias + 초기 state 상수.
- **`member.aggregate.ts`**: thin facade. state 필드 1개, factory/commands, `when()` 3줄, snapshot 매핑.

### 7-1. `member.handlers.ts`

```typescript
// src/bounded-context/member/domain/member/member.handlers.ts
import { NotificationChannel } from "./enums/notification.enum";
import { NotificationFrequency } from "./enums/frequency.enum";
import {
  MemberRegisteredEvent,
  MemberUpdatedEvent,
  MemberPasswordChangedEvent,
  MemberPasswordResetEvent,
  MemberEmailChangedEvent,
  MemberPointAddedEvent,
  MemberWithdrawnEvent,
} from "./events";
import type { MemberSnapshot } from "./member.snapshot";

/**
 * Member Aggregate가 받을 수 있는 모든 이벤트 타입(literal) union.
 * - 각 이벤트 클래스의 정적 `TYPE` 상수에서 typeof로 뽑아낸다.
 * - `memberEventHandlers`의 `satisfies Record<MemberEventType, ...>` 키 제약에 사용.
 * - 새 이벤트 추가 시 맵 누락은 컴파일 에러.
 */
export type MemberEventType =
  | typeof MemberRegisteredEvent.TYPE
  | typeof MemberUpdatedEvent.TYPE
  | typeof MemberPasswordChangedEvent.TYPE
  | typeof MemberPasswordResetEvent.TYPE
  | typeof MemberEmailChangedEvent.TYPE
  | typeof MemberPointAddedEvent.TYPE
  | typeof MemberWithdrawnEvent.TYPE;

/**
 * Member의 내부 가변 상태.
 * Snapshot과 shape가 동일하므로 같은 타입을 alias로 재사용한다.
 * - 결과 1: createSnapshot()이 `{ ...this.state }` 한 줄로 끝남.
 * - 결과 2: state 타입과 snapshot 타입이 영원히 동기화 (drift 불가).
 */
export type MemberState = MemberSnapshot;

/**
 * Member 인스턴스 생성 직후의 초기 state.
 * 첫 이벤트(`MemberRegisteredEvent`)가 모든 필드를 덮어쓰므로 sentinel 값으로 채운다.
 */
export const INITIAL_MEMBER_STATE: MemberState = {
  id: "",
  email: "",
  hashedPassword: "",
  nickname: "",
  job: "",
  notification: NotificationChannel.EMAIL,
  frequency: NotificationFrequency.WEEKLY,
  point: 0,
  isPro: false,
  isWithdrawn: false,
};

/**
 * Password 변경/리셋은 상태 변화가 동일하므로 한 핸들러를 두 키에 공유한다.
 * 두 이벤트의 payload shape `{ hashedPassword: string }`가 동일하기에 가능.
 */
const replacePassword = (
  s: MemberState,
  e: MemberPasswordChangedEvent | MemberPasswordResetEvent,
): void => {
  s.hashedPassword = e.payload.hashedPassword;
};

/**
 * 이벤트 타입 → 상태 변경 함수 dispatch 맵.
 * - 각 핸들러는 순수하게 state를 mutate 한다 (검증/부수효과 없음).
 * - `satisfies Record<MemberEventType, ...>`로 누락·오타를 양방향 컴파일 타임 차단:
 *   - union에 있는데 맵 키 부재 → "키 부족" 에러
 *   - 맵에 있는데 union 부재 → "알 수 없는 키" 에러
 * - 검증은 aggregate의 커맨드 메서드(VO 팩토리)에서 1회 수행하므로 replay는 무조건 안전하다고 가정.
 */
export const memberEventHandlers = {
  [MemberRegisteredEvent.TYPE]: (s: MemberState, e: MemberRegisteredEvent) => {
    s.id = e.aggregateId;
    s.email = e.payload.email;
    s.hashedPassword = e.payload.hashedPassword;
    s.nickname = e.payload.nickname;
    s.job = e.payload.job;
    s.notification = e.payload.notification;
    s.frequency = e.payload.frequency;
    s.point = 0;
    s.isPro = false;
    s.isWithdrawn = false;
  },
  [MemberUpdatedEvent.TYPE]: (s: MemberState, e: MemberUpdatedEvent) => {
    if (e.payload.job !== undefined) s.job = e.payload.job;
    if (e.payload.nickname !== undefined) s.nickname = e.payload.nickname;
    if (e.payload.notification !== undefined) s.notification = e.payload.notification;
    if (e.payload.frequency !== undefined) s.frequency = e.payload.frequency;
  },
  [MemberPasswordChangedEvent.TYPE]: replacePassword,
  [MemberPasswordResetEvent.TYPE]: replacePassword,
  [MemberEmailChangedEvent.TYPE]: (s: MemberState, e: MemberEmailChangedEvent) => {
    s.email = e.payload.newEmail;
  },
  [MemberPointAddedEvent.TYPE]: (s: MemberState, e: MemberPointAddedEvent) => {
    s.point += e.payload.amount;
  },
  [MemberWithdrawnEvent.TYPE]: (s: MemberState) => {
    s.isWithdrawn = true;
  },
} satisfies Record<MemberEventType, (s: MemberState, e: any) => void>;
```

### 7-2. `member.aggregate.ts`

```typescript
// src/bounded-context/member/domain/member/member.aggregate.ts
import {
  AggregateRoot,
  type AggregateSnapshotState,
} from "@/shared-kernel/domain/aggregate-root.base";
import { DomainEvent } from "@/shared-kernel/domain/domain-event.base";

import { MemberId } from "./value-objects/member-id.vo";
import { Email } from "./value-objects/email.vo";
import { Password } from "./value-objects/password.vo";

import type { PasswordEncoder } from "@/bounded-context/member/application/member/ports/out/password-encoder.port";

import { PasswordMismatchException } from "./exceptions/password-mismatch.exception";
import { EmailNotChangedException } from "./exceptions/email-not-changed.exception";

import {
  MemberRegisteredEvent,
  MemberUpdatedEvent,
  MemberPasswordChangedEvent,
  MemberPasswordResetEvent,
  MemberEmailChangedEvent,
  MemberPointAddedEvent,
  MemberWithdrawnEvent,
  type MemberUpdatedPayload,
} from "./events";

import type { RegisterMemberCommand } from "./commands/register-member.command";
import type { UpdateMemberCommand } from "./commands/update-member.command";
import type { MemberSnapshot } from "./member.snapshot";
import {
  memberEventHandlers,
  INITIAL_MEMBER_STATE,
  type MemberState,
  type MemberEventType,
} from "./member.handlers";

export class Member extends AggregateRoot {
  private state: MemberState = { ...INITIAL_MEMBER_STATE };

  public get id(): string { return this.state.id; }
  public get aggregateType(): string { return "Member"; }

  // 내부 상태는 getter로 노출하지 않는다.
  // - Event Sourcing + CQRS 환경에서 Aggregate는 Write Side 전용이며, 외부 조회는 Read Model(Projection/QueryService)에서 담당한다.
  // - 테스트나 영속화 어댑터가 상태를 봐야 할 때는 `createSnapshot()`을 사용한다.
  // - `id`/`aggregateType`은 상태가 아니라 EventStore가 참조해야 하는 공개 정체성이므로 노출한다.

  // -------- Factory --------
  public static register(command: RegisterMemberCommand): Member {
    const member = new Member();
    const id = MemberId.generate();
    member.apply(new MemberRegisteredEvent({
      aggregateId: id.value,
      eventVersion: 1,
      payload: {
        email: command.email.value,
        hashedPassword: command.password.hashed,
        nickname: command.nickname.value,
        job: command.job,
        notification: command.notification,
        frequency: command.frequency,
      },
    }));
    return member;
  }

  // -------- Commands --------
  public update(command: UpdateMemberCommand): void {
    this.guardNotWithdrawn();
    const payload: MemberUpdatedPayload = {
      job: command.job,
      nickname: command.nickname?.value,
      notification: command.notification,
      frequency: command.frequency,
    };
    this.apply(new MemberUpdatedEvent({
      aggregateId: this.id,
      eventVersion: this.version + 1,
      payload,
    }));
  }

  public changePassword(
    currentPlain: string,
    newPassword: Password,
    encoder: PasswordEncoder,
  ): void {
    this.guardNotWithdrawn();
    if (!encoder.matches(currentPlain, this.state.hashedPassword)) {
      throw new PasswordMismatchException();
    }
    this.apply(new MemberPasswordChangedEvent({
      aggregateId: this.id,
      eventVersion: this.version + 1,
      payload: { hashedPassword: newPassword.hashed },
    }));
  }

  public resetPassword(newPassword: Password): void {
    this.guardNotWithdrawn();
    this.apply(new MemberPasswordResetEvent({
      aggregateId: this.id,
      eventVersion: this.version + 1,
      payload: { hashedPassword: newPassword.hashed },
    }));
  }

  public changeEmail(newEmail: Email): void {
    this.guardNotWithdrawn();
    if (this.state.email === newEmail.value) {
      throw new EmailNotChangedException();
    }
    this.apply(new MemberEmailChangedEvent({
      aggregateId: this.id,
      eventVersion: this.version + 1,
      payload: { newEmail: newEmail.value },
    }));
  }

  public addPoint(amount: number): void {
    this.guardNotWithdrawn();
    if (amount === 0) return;
    this.apply(new MemberPointAddedEvent({
      aggregateId: this.id,
      eventVersion: this.version + 1,
      payload: { amount },
    }));
  }

  public withdraw(): void {
    this.guardNotWithdrawn();
    this.apply(new MemberWithdrawnEvent({
      aggregateId: this.id,
      eventVersion: this.version + 1,
      payload: { withdrawnAt: new Date().toISOString() },
    }));
  }

  // -------- Event Dispatch --------
  protected when(event: DomainEvent): void {
    const handler = memberEventHandlers[event.eventType as MemberEventType];
    if (!handler) throw new Error(`[Member] Unhandled event: ${event.eventType}`);
    handler(this.state, event as never);
  }

  // -------- Snapshot --------
  public createSnapshot(): MemberSnapshot {
    return { ...this.state };
  }

  public loadFromSnapshot(snapshot: AggregateSnapshotState): void {
    this.state = { ...(snapshot.state as MemberSnapshot) };
    this._version = snapshot.version;
  }

  // -------- Guards --------
  private guardNotWithdrawn(): void {
    if (this.state.isWithdrawn) {
      throw new Error("Member is already withdrawn");
    }
  }
}
```

### 7-3. 설계 결정 노트

**왜 handlers를 외부 파일로 빼는가 (이미 상단 비교표에서 결론)**

aggregate 안에 `whenXxx` 메서드가 7개 매달려 있으면 클래스가 식별성/커맨드/dispatch/snapshot/state 변경을 모두 짊어진다. 외부 파일로 빼면 aggregate는 commands + dispatch + snapshot 세 가지로 압축된다. handlers는 순수 함수 모음이라 aggregate 인스턴스 없이 단위 테스트 가능 (Step 8 추가 예시 참조).

**왜 `MemberState = MemberSnapshot` alias인가**

이전 분석에서 외부 파일 분리를 기각했던 이유는 "state interface와 snapshot 타입 중복". 그런데 두 타입의 shape는 본래 같다 (snapshot = state의 직렬화 표현, 우리 도메인은 모두 primitive). 그래서 둘을 alias로 묶어버리면 중복이 0이 되고 `createSnapshot()`이 `{ ...this.state }` 한 줄로 끝난다.

이 선택의 함의: state도 primitive(`string`, `number`, enum)만 가진다. `_email: Email` 같은 VO 필드는 사라진다.

**왜 VO를 state에서 제거하는가**

이전엔 `_email = Email.of(payload.email)`처럼 핸들러가 매 replay마다 VO 팩토리를 호출해 재검증했다. 외부 파일로 옮기면서 두 가지 선택지가 있다.

1. **VO 재검증 유지**: handlers가 `s.email = Email.of(e.payload.email).value`로 wrap-unwrap. 안전하지만 redundant (이미 쓸 때 검증).
2. **검증을 경계에서만**: handlers는 primitive를 그대로 대입. 본 가이드 채택.

(2)를 택한 이유: EventStore가 append-only이고 쓰기 경계(커맨드 메서드의 `Email.of(...)`)에서 이미 검증을 통과한 데이터만 이벤트로 기록된다. EventStore = source of truth라는 ES 원칙과 정합. 단점은 EventStore 데이터가 외부 조작으로 손상되면 replay가 invalid state를 만든다는 것 — 이는 EventStore 보안/무결성으로 막을 일이지 매 replay마다 재검증할 일이 아니라고 본다.

**`encoder.matches(plain, hashedString)` 직접 호출**

이전: `this._password.matches(plain, encoder)` (Password VO의 인스턴스 메서드)
지금: `encoder.matches(plain, this.state.hashedPassword)` (encoder 직접)

state가 primitive가 되면서 Password VO의 indirection이 사라진다. Password는 쓰기 경계(커맨드의 `Password.create(plain, encoder)`)에서 검증/해싱하는 팩토리 역할만 남는다.

**`changeEmail`의 동등성 비교**

이전: `this._email.equals(newEmail)` (Email VO의 equals)
지금: `this.state.email === newEmail.value` (primitive 비교)

Email VO에 normalization(예: `toLowerCase`)을 도입하면 `Email.of(...)`가 입력을 정규화해서 들어오므로 primitive 비교로 충분하다. 정규화는 VO 팩토리의 책임으로 일원화.

**새 이벤트를 추가할 때의 변경 절차** (예: `MemberSubscribedEvent`):

1. `events/member-subscribed.event.ts` 작성 (Step 5와 동일 패턴, `static readonly TYPE = "MemberSubscribed" as const` 포함).
2. `member.handlers.ts`의 `MemberEventType` union에 `| typeof MemberSubscribedEvent.TYPE` 한 줄 추가.
3. `memberEventHandlers` 맵에 `[MemberSubscribedEvent.TYPE]: (s, e) => { ... }` 추가.
4. (state shape이 변하면) `member.snapshot.ts`에 새 필드 추가 + `INITIAL_MEMBER_STATE`에도 초기값.
5. (선택) `member.aggregate.ts`에 커맨드 메서드 `subscribe()` 추가, `this.apply(new MemberSubscribedEvent({...}))` 호출.

2가 누락되면 `satisfies` 검사가 "맵에 알 수 없는 키"를 에러로 표시. 3에서 맵 항목이 누락되면 `satisfies`가 "`MemberEventType`의 키가 부족하다"고 에러. **모든 컴파일 타임 차단은 `member.handlers.ts` 한 파일 안에서 일어난다.**

---

## Step 8. 단위 테스트

> 두 종류로 나뉜다:
> 1. **Aggregate 외부 인터페이스 테스트**: `createSnapshot()` / `getUncommittedEvents()` / `loadFromHistory()` / `loadFromSnapshot()` 기반. 커맨드 → 이벤트 → snapshot 흐름 검증.
> 2. **Handlers 순수 함수 테스트**: `member.handlers.ts`의 핸들러를 aggregate 인스턴스 없이 직접 호출. 외부 파일 분리의 핵심 이득.

### 8-1. Email VO

```typescript
// test/unit/bounded-context/member/member/value-objects/email.spec.ts
import { Email } from "@/bounded-context/member/domain/member/value-objects/email.vo";
import { InvalidEmailException } from "@/bounded-context/member/domain/member/exceptions/invalid-email.exception";

describe("Email VO", () => {
  it.each(["a@b.com", "User.Name@example.co.kr"])("유효한 이메일 (%s)", (val) => {
    expect(Email.of(val).value).toBe(val);
  });

  it.each(["", "abc", "@b.com", "a@b", "a b@c.com"])("잘못된 이메일 (%s)", (val) => {
    expect(() => Email.of(val)).toThrow(InvalidEmailException);
  });

  it("equals는 같은 값이면 true", () => {
    expect(Email.of("a@b.com").equals(Email.of("a@b.com"))).toBe(true);
  });

  it("equals는 다른 값이면 false", () => {
    expect(Email.of("a@b.com").equals(Email.of("c@d.com"))).toBe(false);
  });
});
```

> normalize(`toLowerCase`)를 도입할 경우 위 테스트의 첫 번째 케이스는 `.toBe(val.toLowerCase())`로, 대소문자 동치 테스트(`Email.of("A@B.COM").equals(Email.of("a@b.com"))`)를 추가한다.

### 8-2. Password VO

```typescript
// test/unit/bounded-context/member/member/value-objects/password.spec.ts
import { Password } from "@/bounded-context/member/domain/member/value-objects/password.vo";
import { InvalidPasswordException } from "@/bounded-context/member/domain/member/exceptions/invalid-password.exception";

class FakeEncoder {
  encode(p: string) { return `hash:${p}`; }
  matches(p: string, h: string) { return h === `hash:${p}`; }
}

describe("Password VO", () => {
  const encoder = new FakeEncoder();

  it("최소 길이를 충족하면 생성", () => {
    expect(Password.create("12345678", encoder).hashed).toBe("hash:12345678");
  });

  it("8자 미만이면 예외", () => {
    expect(() => Password.create("short", encoder)).toThrow(InvalidPasswordException);
  });

  it("matches는 인코더에 위임", () => {
    const pw = Password.create("password123", encoder);
    expect(pw.matches("password123", encoder)).toBe(true);
    expect(pw.matches("wrong", encoder)).toBe(false);
  });

  it("fromHashed는 검증 없이 복원", () => {
    expect(Password.fromHashed("any-hash").hashed).toBe("any-hash");
  });
});
```

### 8-3. VerificationCode

```typescript
// test/unit/bounded-context/member/member/value-objects/verification-code.spec.ts
import { VerificationCode } from "@/bounded-context/member/domain/member/value-objects/verification-code.vo";

describe("VerificationCode", () => {
  it("4자리 숫자 생성", () => {
    const c = VerificationCode.generate();
    expect(c.code).toMatch(/^\d{4}$/);
  });

  it("5분 후 만료", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const c = VerificationCode.generate(now);
    expect(c.isExpired(new Date("2026-01-01T00:04:59Z"))).toBe(false);
    expect(c.isExpired(new Date("2026-01-01T00:05:00Z"))).toBe(true);
  });

  it("matches는 미만료+일치 모두 검사", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const c = VerificationCode.of("1234", new Date("2026-01-01T00:05:00Z"));
    expect(c.matches("1234", now)).toBe(true);
    expect(c.matches("9999", now)).toBe(false);
    expect(c.matches("1234", new Date("2026-01-01T00:06:00Z"))).toBe(false);
  });
});
```

### 8-4. Member Aggregate

```typescript
// test/unit/bounded-context/member/member/member.aggregate.spec.ts
import { Member } from "@/bounded-context/member/domain/member/member.aggregate";
import { Email } from "@/bounded-context/member/domain/member/value-objects/email.vo";
import { Password } from "@/bounded-context/member/domain/member/value-objects/password.vo";
import { Nickname } from "@/bounded-context/member/domain/member/value-objects/nickname.vo";
import { NotificationChannel } from "@/bounded-context/member/domain/member/enums/notification.enum";
import { NotificationFrequency } from "@/bounded-context/member/domain/member/enums/frequency.enum";
import { PasswordMismatchException } from "@/bounded-context/member/domain/member/exceptions/password-mismatch.exception";
import { MemberRegisteredEvent } from "@/bounded-context/member/domain/member/events/member-registered.event";
import type { RegisterMemberCommand } from "@/bounded-context/member/domain/member/commands/register-member.command";

class FakeEncoder {
  encode(p: string) { return `hash:${p}`; }
  matches(p: string, h: string) { return h === `hash:${p}`; }
}

const buildCommand = (): RegisterMemberCommand => ({
  email: Email.of("test@test.com"),
  password: Password.create("password123", new FakeEncoder()),
  nickname: Nickname.of("nick"),
  job: "developer",
  notification: NotificationChannel.EMAIL,
  frequency: NotificationFrequency.WEEKLY,
});

describe("Member Aggregate", () => {
  it("register 시 MemberRegisteredEvent 1개 발행, version=1", () => {
    const m = Member.register(buildCommand());
    expect(m.version).toBe(1);
    expect(m.getUncommittedEvents()).toHaveLength(1);
    expect(m.getUncommittedEvents()[0].eventType).toBe(MemberRegisteredEvent.TYPE);
    const snap = m.createSnapshot();
    expect(snap.point).toBe(0);
    expect(snap.isPro).toBe(false);
  });

  it("update는 MemberUpdated 이벤트로 상태 변경", () => {
    const m = Member.register(buildCommand());
    m.markAsCommitted();
    m.update({ nickname: Nickname.of("new-nick") });
    expect(m.createSnapshot().nickname).toBe("new-nick");
    expect(m.version).toBe(2);
  });

  it("changePassword: 현재 비밀번호 불일치 시 PasswordMismatchException", () => {
    const m = Member.register(buildCommand());
    const encoder = new FakeEncoder();
    expect(() => m.changePassword("wrong", Password.create("newpassword", encoder), encoder))
      .toThrow(PasswordMismatchException);
  });

  it("changePassword: 정상 변경", () => {
    const encoder = new FakeEncoder();
    const m = Member.register(buildCommand());
    m.changePassword("password123", Password.create("newpass12", encoder), encoder);
    expect(m.createSnapshot().hashedPassword).toBe("hash:newpass12");
  });

  it("addPoint: 누적", () => {
    const m = Member.register(buildCommand());
    m.addPoint(50);
    m.addPoint(30);
    expect(m.createSnapshot().point).toBe(80);
  });

  it("withdraw 이후 모든 명령은 거부", () => {
    const m = Member.register(buildCommand());
    m.withdraw();
    expect(m.createSnapshot().isWithdrawn).toBe(true);
    expect(() => m.addPoint(1)).toThrow();
  });

  it("loadFromHistory로 이벤트 스트림으로부터 복원", () => {
    const original = Member.register(buildCommand());
    original.addPoint(100);
    const events = [...original.getUncommittedEvents()];

    const restored = new (Member as any)() as Member;
    restored.loadFromHistory(events);
    const snap = restored.createSnapshot();
    expect(snap.point).toBe(100);
    expect(snap.email).toBe("test@test.com");
    expect(restored.version).toBe(2);
  });

  it("createSnapshot / loadFromSnapshot 왕복", () => {
    const m = Member.register(buildCommand());
    m.addPoint(42);
    const snap = m.createSnapshot();
    const restored = new (Member as any)() as Member;
    restored.loadFromSnapshot({ state: snap, version: m.version });
    expect(restored.createSnapshot().point).toBe(42);
    expect(restored.version).toBe(m.version);
  });
});
```

### 8-5. Member Handlers (순수 함수)

> 핸들러를 aggregate 인스턴스 없이 직접 호출해 검증한다. `INITIAL_MEMBER_STATE` 사본을 만들고, 이벤트를 적용한 뒤 state의 mutation을 확인.

```typescript
// test/unit/bounded-context/member/member/member.handlers.spec.ts
import {
  memberEventHandlers,
  INITIAL_MEMBER_STATE,
  type MemberState,
} from "@/bounded-context/member/domain/member/member.handlers";
import { MemberRegisteredEvent } from "@/bounded-context/member/domain/member/events/member-registered.event";
import { MemberPointAddedEvent } from "@/bounded-context/member/domain/member/events/member-point-added.event";
import { MemberWithdrawnEvent } from "@/bounded-context/member/domain/member/events/member-withdrawn.event";
import { NotificationChannel } from "@/bounded-context/member/domain/member/enums/notification.enum";
import { NotificationFrequency } from "@/bounded-context/member/domain/member/enums/frequency.enum";

const freshState = (): MemberState => ({ ...INITIAL_MEMBER_STATE });

describe("Member Handlers (pure)", () => {
  it("MemberRegistered: state를 이벤트 payload로 채움", () => {
    const s = freshState();
    const e = new MemberRegisteredEvent({
      aggregateId: "id-1",
      eventVersion: 1,
      payload: {
        email: "u@u.com",
        hashedPassword: "hash:pw",
        nickname: "nick",
        job: "dev",
        notification: NotificationChannel.EMAIL,
        frequency: NotificationFrequency.WEEKLY,
      },
    });
    memberEventHandlers[MemberRegisteredEvent.TYPE](s, e);
    expect(s.id).toBe("id-1");
    expect(s.email).toBe("u@u.com");
    expect(s.point).toBe(0);
    expect(s.isWithdrawn).toBe(false);
  });

  it("MemberPointAdded: 누적 mutate", () => {
    const s = { ...freshState(), point: 10 };
    memberEventHandlers[MemberPointAddedEvent.TYPE](
      s,
      new MemberPointAddedEvent({
        aggregateId: "id-1",
        eventVersion: 2,
        payload: { amount: 5 },
      }),
    );
    expect(s.point).toBe(15);
  });

  it("MemberWithdrawn: isWithdrawn = true", () => {
    const s = freshState();
    memberEventHandlers[MemberWithdrawnEvent.TYPE](
      s,
      new MemberWithdrawnEvent({
        aggregateId: "id-1",
        eventVersion: 2,
        payload: { withdrawnAt: new Date().toISOString() },
      }),
    );
    expect(s.isWithdrawn).toBe(true);
  });
});
```

> 이 테스트가 가능한 이유 = 핸들러가 외부 파일에 순수 함수로 노출되어 있기 때문. 내부 dispatch 패턴이었다면 `m["whenPointAdded"]`처럼 private 접근 트릭이 필요했다.

---

## 검증 (Definition of Done)

```bash
pnpm test test/unit/bounded-context/member/member
```

- [ ] 모든 VO 단위 테스트 그린
- [ ] Member Aggregate 모든 명령 + replay + snapshot 그린
- [ ] Member Handlers 순수 함수 테스트 그린
- [ ] `pnpm run build` 성공 (타입 오류 0) — 특히 `member.handlers.ts`의 `memberEventHandlers satisfies Record<MemberEventType, (s: MemberState, e: any) => void>`가 union의 모든 literal에 대응하는 키 존재를 컴파일 타임에 강제하는지 확인. union에 새 항목 추가 후 맵 항목 누락 → 컴파일 에러로 즉시 잡혀야 함.
- [ ] `member.aggregate.ts`에 `whenXxx` 메서드 0건 (handlers가 외부 파일로 분리되었는지 확인):
  ```bash
  grep -c "private when" src/bounded-context/member/domain/member/member.aggregate.ts
  # → 0
  ```
- [ ] `src/bounded-context/member/domain/` 안에 NestJS/MikroORM import 0건 (순수성 검증):
  ```bash
  grep -r "@nestjs\|@mikro-orm" src/bounded-context/member/domain/
  # → 결과 없어야 함
  ```
- [ ] 외부 lib import 0건:
  ```bash
  grep -rE "^import .* from \"[^@\.]" src/bounded-context/member/domain/ | grep -v "node:"
  # → 결과 없어야 함 (path alias `@/`, 상대 경로 `./`, node built-in만 허용)
  ```

---

## Aggregate Event Dispatch 컨벤션 (전체 적용)

본 phase에서 정립한 **외부 handlers 파일 + Snapshot alias state + `satisfies` 맵** 패턴은 이후 모든 aggregate(Auth, OAuth, Question 등)에 동일하게 적용한다.

**파일 구성 (3-piece)**
- `<aggregate>.aggregate.ts` — thin facade: `state` 필드 1개 + factory + 커맨드 + `when()` 3줄 + snapshot 매핑 + `guardXxx`.
- `<aggregate>.handlers.ts` — `<Aggregate>EventType` union + `<Aggregate>State` alias + `INITIAL_<AGGREGATE>_STATE` + `<aggregate>EventHandlers` 맵.
- `<aggregate>.snapshot.ts` — primitive only 직렬화 표현. `<aggregate>State`의 source of truth.

**`<aggregate>.handlers.ts` 내부 구조 (관습)**
1. import: enums, events, snapshot 타입.
2. `<Aggregate>EventType` literal union — `export`.
3. `<Aggregate>State = <Aggregate>Snapshot` alias — `export`.
4. `INITIAL_<AGGREGATE>_STATE` 상수 — `export`. 첫 이벤트 전의 sentinel.
5. (선택) 공유 핸들러 헬퍼 — module-private 화살표 함수.
6. `<aggregate>EventHandlers` 객체 — `export`, `satisfies Record<<Aggregate>EventType, (s: <Aggregate>State, e: any) => void>` 강제.

**`<aggregate>.aggregate.ts` 내부 구조 (관습)**
1. import handlers module의 `<aggregate>EventHandlers`, `INITIAL_*`, `<Aggregate>State`, `<Aggregate>EventType`.
2. `private state: <Aggregate>State = { ...INITIAL_* }` — 단일 상태 필드.
3. `id` / `aggregateType` getter — state 또는 상수 기반.
4. 정적 팩토리(`register`/`create` 등) — VO 검증된 command를 받아 첫 이벤트 발행.
5. 커맨드 메서드 — guard → 도메인 검증(VO 팩토리, encoder, etc.) → `this.apply(new XxxEvent(...))`.
6. `protected when(event)` — 3줄: 맵 조회 → 없으면 throw → `handler(this.state, event as never)` 호출.
7. `createSnapshot()` — `return { ...this.state };`.
8. `loadFromSnapshot()` — `this.state = { ...(snapshot.state as <Aggregate>Snapshot) }; this._version = snapshot.version;`.
9. `guardXxx()` private 헬퍼 — invariant 검사.

**규칙**
- 같은 shape의 이벤트는 한 핸들러 함수를 여러 키에 공유 등록한다 (예: `MemberPasswordChangedEvent` / `MemberPasswordResetEvent` → `replacePassword` 헬퍼).
- 새 이벤트 추가 = (1) 이벤트 클래스 + (2) handlers 파일의 `EventType` union에 `typeof X.TYPE` 한 줄 + (3) handlers 맵 키-값 + (선택 4) state shape 확장(snapshot도 함께) + (선택 5) aggregate에 커맨드 메서드. (2)(3) 누락은 `satisfies`가 컴파일 타임에 차단.
- 핸들러는 **검증/부수효과 없이** state mutation만 한다. 검증은 커맨드 메서드의 VO 팩토리에서.
- state는 **primitive only**. VO는 aggregate의 commands 경계에서만 다룬다.
- 베이스(`AggregateRoot`)는 손대지 않는다. 이 패턴은 베이스 변경 0건으로 성립한다.
- 별도 lint 규칙은 두지 않는다. **파일 명명 규약 + 코드 리뷰**로 일관성을 유지한다.

> 이 컨벤션을 변경하려면 본 문서를 갱신하고 모든 phase에 일괄 반영해야 한다. 임의 aggregate에서만 다른 dispatch 패턴을 사용하지 않는다.

---

다음: [`04-member-application-layer.md`](./04-member-application-layer.md) — UseCase, Projector, QueryService 구현
