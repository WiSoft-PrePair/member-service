# 03. Member Domain Layer

> **사전 조건**: Phase 02 완료 (Event Sourcing 인프라 동작)

## Goal

Member 도메인의 **순수 비즈니스 로직**을 구현한다. 이 레이어는 NestJS/MikroORM/외부 라이브러리에 의존하지 않는다. 오직 TypeScript + Phase 02의 도메인 베이스 클래스만 사용.

이 Phase의 결과물은 **단위 테스트만으로 100% 검증 가능**해야 한다.

---

## 산출물 체크리스트

### Value Objects (`src/contexts/identity/domain/member/value-objects/`)
- [ ] `email.vo.ts`
- [ ] `password.vo.ts`
- [ ] `nickname.vo.ts`
- [ ] `verification-code.vo.ts`
- [ ] `verification-token.vo.ts`
- [ ] `member-id.vo.ts`

### Enums (`src/contexts/identity/domain/member/enums/`)
- [ ] `notification.enum.ts` (EMAIL, KAKAO, BOTH)
- [ ] `frequency.enum.ts` (EVERY, WEEKLY)

### Exceptions (`src/contexts/identity/domain/member/exceptions/`)
- [ ] `invalid-email.exception.ts`
- [ ] `invalid-password.exception.ts`
- [ ] `invalid-nickname.exception.ts`
- [ ] `invalid-verification-code.exception.ts`
- [ ] `password-mismatch.exception.ts`

### Domain Events (`src/contexts/identity/domain/member/events/`)
- [ ] `member-registered.event.ts`
- [ ] `member-updated.event.ts`
- [ ] `member-password-changed.event.ts`
- [ ] `member-password-reset.event.ts`
- [ ] `member-email-changed.event.ts`
- [ ] `member-point-added.event.ts`
- [ ] `member-withdrawn.event.ts`

### Aggregate (`src/contexts/identity/domain/member/`)
- [ ] `member.aggregate.ts` — Member Aggregate Root

### Ports (`src/contexts/identity/application/member/ports/`)
- [ ] `password-encoder.port.ts`

### 테스트 (`test/unit/identity/member/`)
- [ ] `value-objects/email.spec.ts`
- [ ] `value-objects/password.spec.ts`
- [ ] `value-objects/nickname.spec.ts`
- [ ] `value-objects/verification-code.spec.ts`
- [ ] `member.aggregate.spec.ts`

---

## Step 1. Enums

```typescript
// src/contexts/identity/domain/member/enums/notification.enum.ts
export enum NotificationChannel {
  EMAIL = "EMAIL",
  KAKAO = "KAKAO",
  BOTH = "BOTH",
}

// src/contexts/identity/domain/member/enums/frequency.enum.ts
export enum NotificationFrequency {
  EVERY = "EVERY",
  WEEKLY = "WEEKLY",
}
```

---

## Step 2. Exceptions (도메인 예외)

```typescript
// src/contexts/identity/domain/member/exceptions/invalid-email.exception.ts
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
```

> **하이브리드 에러 패턴 메모**: 도메인 레이어는 도메인 예외를 던지고, Presentation 레이어의 ExceptionFilter가 이를 HTTP 응답으로 매핑한다 (Phase 05).

---

## Step 3. Value Objects

### 3-1. `email.vo.ts`

```typescript
// src/contexts/identity/domain/member/value-objects/email.vo.ts
import { ValueObject } from "../../shared/value-object.base";
import { InvalidEmailException } from "../exceptions/invalid-email.exception";

interface EmailProps {
  value: string;
}

export class Email extends ValueObject<EmailProps> {
  private static readonly PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,7}$/;

  private constructor(props: EmailProps) {
    super(props);
  }

  public static of(value: string): Email {
    if (!Email.PATTERN.test(value)) {
      throw new InvalidEmailException(value);
    }
    return new Email({ value: value.toLowerCase() });
  }

  public get value(): string {
    return this.props.value;
  }
}
```

### 3-2. `password.vo.ts`

```typescript
// src/contexts/identity/domain/member/value-objects/password.vo.ts
import { ValueObject } from "../../shared/value-object.base";
import type { PasswordEncoder } from "@/contexts/identity/application/member/ports/password-encoder.port";
import { InvalidPasswordException } from "../exceptions/invalid-password.exception";

interface PasswordProps {
  hashed: string;
}

export class Password extends ValueObject<PasswordProps> {
  private static readonly MIN_LENGTH = 8;

  private constructor(props: PasswordProps) {
    super(props);
  }

  public static create(plain: string, encoder: PasswordEncoder): Password {
    if (plain.length < Password.MIN_LENGTH) {
      throw new InvalidPasswordException(`Must be at least ${Password.MIN_LENGTH} chars`);
    }
    return new Password({ hashed: encoder.encode(plain) });
  }

  public static fromHashed(hashed: string): Password {
    return new Password({ hashed });
  }

  public matches(plain: string, encoder: PasswordEncoder): boolean {
    return encoder.matches(plain, this.props.hashed);
  }

  public get hashed(): string {
    return this.props.hashed;
  }
}
```

### 3-3. `nickname.vo.ts`

```typescript
// src/contexts/identity/domain/member/value-objects/nickname.vo.ts
import { ValueObject } from "../../shared/value-object.base";
import { InvalidNicknameException } from "../exceptions/invalid-nickname.exception";

interface NicknameProps { value: string; }

export class Nickname extends ValueObject<NicknameProps> {
  private static readonly MIN = 2;
  private static readonly MAX = 20;

  private constructor(props: NicknameProps) {
    super(props);
  }

  public static of(value: string): Nickname {
    const trimmed = value.trim();
    if (trimmed.length < Nickname.MIN || trimmed.length > Nickname.MAX) {
      throw new InvalidNicknameException(
        `Length must be between ${Nickname.MIN} and ${Nickname.MAX}`,
      );
    }
    return new Nickname({ value: trimmed });
  }

  public get value(): string {
    return this.props.value;
  }
}
```

### 3-4. `verification-code.vo.ts`

```typescript
// src/contexts/identity/domain/member/value-objects/verification-code.vo.ts
import { ValueObject } from "../../shared/value-object.base";

interface VerificationCodeProps {
  value: string;
  expiresAt: Date;
}

export class VerificationCode extends ValueObject<VerificationCodeProps> {
  private static readonly TTL_MS = 5 * 60 * 1000;

  private constructor(props: VerificationCodeProps) {
    super(props);
  }

  public static generate(now: Date = new Date()): VerificationCode {
    const code = String(Math.floor(1000 + Math.random() * 9000));  // 4자리
    return new VerificationCode({
      value: code,
      expiresAt: new Date(now.getTime() + VerificationCode.TTL_MS),
    });
  }

  public static of(value: string, expiresAt: Date): VerificationCode {
    return new VerificationCode({ value, expiresAt });
  }

  public isExpired(now: Date = new Date()): boolean {
    return now.getTime() >= this.props.expiresAt.getTime();
  }

  public matches(input: string, now: Date = new Date()): boolean {
    return !this.isExpired(now) && this.props.value === input;
  }

  public get value(): string { return this.props.value; }
  public get expiresAt(): Date { return this.props.expiresAt; }
}
```

### 3-5. `verification-token.vo.ts`

```typescript
// src/contexts/identity/domain/member/value-objects/verification-token.vo.ts
import { randomUUID } from "node:crypto";
import { ValueObject } from "../../shared/value-object.base";

interface VerificationTokenProps {
  value: string;
  email: string;
  expiresAt: Date;
}

export class VerificationToken extends ValueObject<VerificationTokenProps> {
  private static readonly TTL_MS = 5 * 60 * 1000;

  private constructor(props: VerificationTokenProps) {
    super(props);
  }

  public static generate(email: string, now: Date = new Date()): VerificationToken {
    return new VerificationToken({
      value: randomUUID(),
      email,
      expiresAt: new Date(now.getTime() + VerificationToken.TTL_MS),
    });
  }

  public isExpired(now: Date = new Date()): boolean {
    return now.getTime() >= this.props.expiresAt.getTime();
  }

  public get value(): string { return this.props.value; }
  public get email(): string { return this.props.email; }
}
```

### 3-6. `member-id.vo.ts`

```typescript
// src/contexts/identity/domain/member/value-objects/member-id.vo.ts
import { randomUUID } from "node:crypto";

export class MemberId {
  private constructor(public readonly value: string) {}

  public static generate(): MemberId {
    return new MemberId(randomUUID());
  }

  public static of(value: string): MemberId {
    return new MemberId(value);
  }

  public equals(other: MemberId): boolean {
    return this.value === other.value;
  }
}
```

---

## Step 4. PasswordEncoder Port

```typescript
// src/contexts/identity/application/member/ports/password-encoder.port.ts
export const PASSWORD_ENCODER = Symbol("PASSWORD_ENCODER");

export interface PasswordEncoder {
  encode(plain: string): string;
  matches(plain: string, hashed: string): boolean;
}
```

> 도메인 레이어가 Application 레이어의 port를 import 하지만, 이는 "도메인이 정의한 인터페이스를 Application에 두는" Hexagonal의 일반적 변형이다. 더 엄격하게 분리하고 싶다면 `domain/member/ports/`에 두어도 된다. 본 가이드는 **Application에 둔다** (Phase 04에서 UseCase가 같은 폴더에서 import 하기 편함).

---

## Step 5. Domain Events

### 5-1. `member-registered.event.ts`

```typescript
// src/contexts/identity/domain/member/events/member-registered.event.ts
import { DomainEvent } from "../../shared/domain-event.base";
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
  public static readonly TYPE = "MemberRegistered";

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
  public static readonly TYPE = "MemberUpdated";
  /* constructor same as above */
}

// member-password-changed.event.ts
export interface MemberPasswordChangedPayload { hashedPassword: string; }
export class MemberPasswordChangedEvent extends DomainEvent<MemberPasswordChangedPayload> {
  public static readonly TYPE = "MemberPasswordChanged";
}

// member-password-reset.event.ts
export interface MemberPasswordResetPayload { hashedPassword: string; }
export class MemberPasswordResetEvent extends DomainEvent<MemberPasswordResetPayload> {
  public static readonly TYPE = "MemberPasswordReset";
}

// member-email-changed.event.ts
export interface MemberEmailChangedPayload { newEmail: string; }
export class MemberEmailChangedEvent extends DomainEvent<MemberEmailChangedPayload> {
  public static readonly TYPE = "MemberEmailChanged";
}

// member-point-added.event.ts
export interface MemberPointAddedPayload { amount: number; }
export class MemberPointAddedEvent extends DomainEvent<MemberPointAddedPayload> {
  public static readonly TYPE = "MemberPointAdded";
}

// member-withdrawn.event.ts
export interface MemberWithdrawnPayload { withdrawnAt: string; }
export class MemberWithdrawnEvent extends DomainEvent<MemberWithdrawnPayload> {
  public static readonly TYPE = "MemberWithdrawn";
}
```

> **모든 이벤트의 payload는 primitive로 직렬화**해야 한다. VO 그대로 넣지 말 것 (`email.value`, `password.hashed`).

---

## Step 6. Member Aggregate

이 파일이 도메인 레이어의 **심장**이다.

```typescript
// src/contexts/identity/domain/member/member.aggregate.ts
import { AggregateRoot } from "../shared/aggregate-root.base";
import { DomainEvent } from "../shared/domain-event.base";

import { MemberId } from "./value-objects/member-id.vo";
import { Email } from "./value-objects/email.vo";
import { Password } from "./value-objects/password.vo";
import { Nickname } from "./value-objects/nickname.vo";

import { NotificationChannel } from "./enums/notification.enum";
import { NotificationFrequency } from "./enums/frequency.enum";

import type { PasswordEncoder } from "@/contexts/identity/application/member/ports/password-encoder.port";

import { PasswordMismatchException } from "./exceptions/password-mismatch.exception";

import { MemberRegisteredEvent } from "./events/member-registered.event";
import { MemberUpdatedEvent, type MemberUpdatedPayload } from "./events/member-updated.event";
import { MemberPasswordChangedEvent } from "./events/member-password-changed.event";
import { MemberPasswordResetEvent } from "./events/member-password-reset.event";
import { MemberEmailChangedEvent } from "./events/member-email-changed.event";
import { MemberPointAddedEvent } from "./events/member-point-added.event";
import { MemberWithdrawnEvent } from "./events/member-withdrawn.event";

export interface RegisterMemberRequest {
  email: Email;
  password: Password;
  nickname: Nickname;
  job: string;
  notification: NotificationChannel;
  frequency: NotificationFrequency;
}

export interface UpdateMemberRequest {
  job?: string;
  nickname?: Nickname;
  notification?: NotificationChannel;
  frequency?: NotificationFrequency;
}

interface MemberSnapshot {
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

export class Member extends AggregateRoot {
  private _id!: MemberId;
  private _email!: Email;
  private _password!: Password;
  private _nickname!: Nickname;
  private _job!: string;
  private _notification!: NotificationChannel;
  private _frequency!: NotificationFrequency;
  private _point: number = 0;
  private _isPro: boolean = false;
  private _isWithdrawn: boolean = false;

  public get id(): string { return this._id.value; }
  public get aggregateType(): string { return "Member"; }

  public get email(): Email { return this._email; }
  public get password(): Password { return this._password; }
  public get nickname(): Nickname { return this._nickname; }
  public get job(): string { return this._job; }
  public get notification(): NotificationChannel { return this._notification; }
  public get frequency(): NotificationFrequency { return this._frequency; }
  public get point(): number { return this._point; }
  public get isPro(): boolean { return this._isPro; }
  public get isWithdrawn(): boolean { return this._isWithdrawn; }

  // -------- Factory --------
  public static register(request: RegisterMemberRequest): Member {
    const member = new Member();
    const id = MemberId.generate();
    member.raise(new MemberRegisteredEvent({
      aggregateId: id.value,
      eventVersion: 1,
      payload: {
        email: request.email.value,
        hashedPassword: request.password.hashed,
        nickname: request.nickname.value,
        job: request.job,
        notification: request.notification,
        frequency: request.frequency,
      },
    }));
    return member;
  }

  // -------- Commands --------
  public update(request: UpdateMemberRequest): void {
    this.guardNotWithdrawn();
    const payload: MemberUpdatedPayload = {
      job: request.job,
      nickname: request.nickname?.value,
      notification: request.notification,
      frequency: request.frequency,
    };
    this.raise(new MemberUpdatedEvent({
      aggregateId: this.id,
      eventVersion: this.version + 1,
      payload,
    }));
  }

  public changePassword(currentPlain: string, newPassword: Password, encoder: PasswordEncoder): void {
    this.guardNotWithdrawn();
    if (!this._password.matches(currentPlain, encoder)) {
      throw new PasswordMismatchException();
    }
    this.raise(new MemberPasswordChangedEvent({
      aggregateId: this.id,
      eventVersion: this.version + 1,
      payload: { hashedPassword: newPassword.hashed },
    }));
  }

  public resetPassword(newPassword: Password): void {
    this.guardNotWithdrawn();
    this.raise(new MemberPasswordResetEvent({
      aggregateId: this.id,
      eventVersion: this.version + 1,
      payload: { hashedPassword: newPassword.hashed },
    }));
  }

  public changeEmail(newEmail: Email): void {
    this.guardNotWithdrawn();
    if (this._email.equals(newEmail)) return;
    this.raise(new MemberEmailChangedEvent({
      aggregateId: this.id,
      eventVersion: this.version + 1,
      payload: { newEmail: newEmail.value },
    }));
  }

  public addPoint(amount: number): void {
    this.guardNotWithdrawn();
    if (amount === 0) return;
    this.raise(new MemberPointAddedEvent({
      aggregateId: this.id,
      eventVersion: this.version + 1,
      payload: { amount },
    }));
  }

  public withdraw(): void {
    this.guardNotWithdrawn();
    this.raise(new MemberWithdrawnEvent({
      aggregateId: this.id,
      eventVersion: this.version + 1,
      payload: { withdrawnAt: new Date().toISOString() },
    }));
  }

  // -------- Event Application --------
  protected applyEvent(event: DomainEvent): void {
    switch (event.eventType) {
      case MemberRegisteredEvent.TYPE: {
        const p = event.payload as import("./events/member-registered.event").MemberRegisteredPayload;
        this._id = MemberId.of(event.aggregateId);
        this._email = Email.of(p.email);
        this._password = Password.fromHashed(p.hashedPassword);
        this._nickname = Nickname.of(p.nickname);
        this._job = p.job;
        this._notification = p.notification;
        this._frequency = p.frequency;
        this._point = 0;
        this._isPro = false;
        this._isWithdrawn = false;
        return;
      }
      case MemberUpdatedEvent.TYPE: {
        const p = event.payload as import("./events/member-updated.event").MemberUpdatedPayload;
        if (p.job !== undefined) this._job = p.job;
        if (p.nickname !== undefined) this._nickname = Nickname.of(p.nickname);
        if (p.notification !== undefined) this._notification = p.notification;
        if (p.frequency !== undefined) this._frequency = p.frequency;
        return;
      }
      case MemberPasswordChangedEvent.TYPE:
      case MemberPasswordResetEvent.TYPE: {
        const p = event.payload as { hashedPassword: string };
        this._password = Password.fromHashed(p.hashedPassword);
        return;
      }
      case MemberEmailChangedEvent.TYPE: {
        const p = event.payload as { newEmail: string };
        this._email = Email.of(p.newEmail);
        return;
      }
      case MemberPointAddedEvent.TYPE: {
        const p = event.payload as { amount: number };
        this._point += p.amount;
        return;
      }
      case MemberWithdrawnEvent.TYPE: {
        this._isWithdrawn = true;
        return;
      }
    }
  }

  // -------- Snapshot --------
  public toSnapshot(): MemberSnapshot {
    return {
      id: this.id,
      email: this._email.value,
      hashedPassword: this._password.hashed,
      nickname: this._nickname.value,
      job: this._job,
      notification: this._notification,
      frequency: this._frequency,
      point: this._point,
      isPro: this._isPro,
      isWithdrawn: this._isWithdrawn,
    };
  }

  public loadFromSnapshot(state: MemberSnapshot, version: number): void {
    this._id = MemberId.of(state.id);
    this._email = Email.of(state.email);
    this._password = Password.fromHashed(state.hashedPassword);
    this._nickname = Nickname.of(state.nickname);
    this._job = state.job;
    this._notification = state.notification;
    this._frequency = state.frequency;
    this._point = state.point;
    this._isPro = state.isPro;
    this._isWithdrawn = state.isWithdrawn;
    this._version = version;
  }

  // -------- Guards --------
  private guardNotWithdrawn(): void {
    if (this._isWithdrawn) {
      throw new Error("Member is already withdrawn");
    }
  }
}
```

---

## Step 7. 단위 테스트

### 7-1. Email VO

```typescript
// test/unit/identity/member/value-objects/email.spec.ts
import { Email } from "@/contexts/identity/domain/member/value-objects/email.vo";
import { InvalidEmailException } from "@/contexts/identity/domain/member/exceptions/invalid-email.exception";

describe("Email VO", () => {
  it.each(["a@b.com", "User.Name@example.co.kr"])("유효한 이메일 (%s)", (val) => {
    expect(Email.of(val).value).toBe(val.toLowerCase());
  });

  it.each(["", "abc", "@b.com", "a@b", "a b@c.com"])("잘못된 이메일 (%s)", (val) => {
    expect(() => Email.of(val)).toThrow(InvalidEmailException);
  });

  it("equals는 정규화된 값으로 비교", () => {
    expect(Email.of("A@B.COM").equals(Email.of("a@b.com"))).toBe(true);
  });
});
```

### 7-2. Password VO

```typescript
// test/unit/identity/member/value-objects/password.spec.ts
import { Password } from "@/contexts/identity/domain/member/value-objects/password.vo";
import { InvalidPasswordException } from "@/contexts/identity/domain/member/exceptions/invalid-password.exception";

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

### 7-3. VerificationCode

```typescript
// test/unit/identity/member/value-objects/verification-code.spec.ts
import { VerificationCode } from "@/contexts/identity/domain/member/value-objects/verification-code.vo";

describe("VerificationCode", () => {
  it("4자리 숫자 생성", () => {
    const c = VerificationCode.generate();
    expect(c.value).toMatch(/^\d{4}$/);
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

### 7-4. Member Aggregate

```typescript
// test/unit/identity/member/member.aggregate.spec.ts
import { Member } from "@/contexts/identity/domain/member/member.aggregate";
import { Email } from "@/contexts/identity/domain/member/value-objects/email.vo";
import { Password } from "@/contexts/identity/domain/member/value-objects/password.vo";
import { Nickname } from "@/contexts/identity/domain/member/value-objects/nickname.vo";
import { NotificationChannel } from "@/contexts/identity/domain/member/enums/notification.enum";
import { NotificationFrequency } from "@/contexts/identity/domain/member/enums/frequency.enum";
import { PasswordMismatchException } from "@/contexts/identity/domain/member/exceptions/password-mismatch.exception";
import { MemberRegisteredEvent } from "@/contexts/identity/domain/member/events/member-registered.event";

class FakeEncoder {
  encode(p: string) { return `hash:${p}`; }
  matches(p: string, h: string) { return h === `hash:${p}`; }
}

const buildReq = () => ({
  email: Email.of("test@test.com"),
  password: Password.create("password123", new FakeEncoder()),
  nickname: Nickname.of("nick"),
  job: "developer",
  notification: NotificationChannel.EMAIL,
  frequency: NotificationFrequency.WEEKLY,
});

describe("Member Aggregate", () => {
  it("register 시 MemberRegisteredEvent 1개 발행, version=1", () => {
    const m = Member.register(buildReq());
    expect(m.version).toBe(1);
    expect(m.uncommittedEvents).toHaveLength(1);
    expect(m.uncommittedEvents[0].eventType).toBe(MemberRegisteredEvent.TYPE);
    expect(m.point).toBe(0);
    expect(m.isPro).toBe(false);
  });

  it("update는 MemberUpdated 이벤트로 상태 변경", () => {
    const m = Member.register(buildReq());
    m.markEventsAsCommitted();
    m.update({ nickname: Nickname.of("new-nick") });
    expect(m.nickname.value).toBe("new-nick");
    expect(m.version).toBe(2);
  });

  it("changePassword: 현재 비밀번호 불일치 시 PasswordMismatchException", () => {
    const m = Member.register(buildReq());
    const encoder = new FakeEncoder();
    expect(() => m.changePassword("wrong", Password.create("newpassword", encoder), encoder))
      .toThrow(PasswordMismatchException);
  });

  it("changePassword: 정상 변경", () => {
    const encoder = new FakeEncoder();
    const m = Member.register(buildReq());
    m.changePassword("password123", Password.create("newpass12", encoder), encoder);
    expect(m.password.hashed).toBe("hash:newpass12");
  });

  it("addPoint: 누적", () => {
    const m = Member.register(buildReq());
    m.addPoint(50);
    m.addPoint(30);
    expect(m.point).toBe(80);
  });

  it("withdraw 이후 모든 명령은 거부", () => {
    const m = Member.register(buildReq());
    m.withdraw();
    expect(m.isWithdrawn).toBe(true);
    expect(() => m.addPoint(1)).toThrow();
  });

  it("replay로 이벤트 스트림으로부터 복원", () => {
    const original = Member.register(buildReq());
    original.addPoint(100);
    const events = [...original.uncommittedEvents];

    const restored = new (Member as any)() as Member;
    restored.replay(events);
    expect(restored.point).toBe(100);
    expect(restored.email.value).toBe("test@test.com");
    expect(restored.version).toBe(2);
  });

  it("toSnapshot / loadFromSnapshot 왕복", () => {
    const m = Member.register(buildReq());
    m.addPoint(42);
    const snap = m.toSnapshot();
    const restored = new (Member as any)() as Member;
    restored.loadFromSnapshot(snap, m.version);
    expect(restored.point).toBe(42);
    expect(restored.version).toBe(m.version);
  });
});
```

---

## 검증 (Definition of Done)

```bash
pnpm test test/unit/identity/member
```

- [ ] 모든 VO 단위 테스트 그린
- [ ] Member Aggregate 모든 명령 + replay + snapshot 그린
- [ ] `pnpm run build` 성공 (타입 오류 0)
- [ ] `src/contexts/identity/domain/` 안에 NestJS/MikroORM import 0건 (순수성 검증):
  ```bash
  grep -r "@nestjs\|@mikro-orm" src/contexts/identity/domain/
  # → 결과 없어야 함
  ```

---

다음: [`04-member-application-layer.md`](./04-member-application-layer.md) — UseCase, Projector, QueryService 구현
