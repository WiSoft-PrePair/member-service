# 04. Member Application Layer

> **사전 조건**: Phase 03 완료 (Member Aggregate + VO 단위 테스트 그린)

## Goal

Application 레이어는 Domain과 Infrastructure를 잇는 **시나리오 조립자**다. 이 Phase에서 만들 것:

1. **Inbound Port (Driving)** — 7개 UseCase의 인터페이스 (`ports/in/*.use-case.port.ts`)
2. **Outbound Port (Driven)** — Repository / EmailSender / PasswordEncoder / MemberReadRepository (`ports/out/*.port.ts`)
3. **MemberRepository 구현** — Event Store + Snapshot Store + Event Publisher를 합성 (`repositories/`)
4. **7개 UseCase 구현체** — 각 시나리오 단일 책임 클래스, 해당 inbound port를 implements (`use-cases/`)
5. **MemberProjector** — 이벤트 → `member_read` 테이블 투영 (`projections/`)
6. **MemberQueryService** — Read DB 직접 조회 (`queries/`)
7. **EmailVerificationService** — 인증 코드 저장/검증 (`services/`, in-memory; Phase 08에서 Redis 옵션)

> **폴더 구조 원칙 (재확인)**: 
> - `ports/in/` = 코어가 **외부에 노출**하는 계약 (Controller가 의존). 이번 phase에서 처음 등장.
> - `ports/out/` = 코어가 **외부에 위임**하는 계약 (외부 어댑터가 implements).
> - `use-cases/` = `ports/in/` 의 구현체. NestJS DI는 클래스 자체를 토큰으로 쓸 수 있어서 `@Inject` 없이 클래스 주입.
> - `repositories/` = "outbound port를 합성해 또 다른 outbound port를 만드는" 합성기. ES 패턴 특성상 application 안에 둔다.

---

## 산출물 체크리스트

### Inbound Ports (`src/contexts/identity/application/member/ports/in/`)
> 코어가 외부에 노출하는 UseCase 계약. Controller가 의존하는 것은 이 인터페이스다.
- [ ] `sign-up-member.use-case.port.ts`
- [ ] `update-member.use-case.port.ts`
- [ ] `change-password.use-case.port.ts`
- [ ] `reset-password.use-case.port.ts`
- [ ] `change-email.use-case.port.ts`
- [ ] `add-point.use-case.port.ts`
- [ ] `withdraw-member.use-case.port.ts`

### Outbound Ports (`src/contexts/identity/application/member/ports/out/`)
> 코어가 외부에 위임하는 계약. 어댑터(DB, SMTP, Bcrypt 등)가 implements 한다.
- [ ] `member.repository.port.ts` — Aggregate 영속화(`load`, `save`)
- [ ] `member-read.repository.port.ts` — Read DB 조회용
- [ ] `email-sender.port.ts`
- [ ] (Phase 03에서 만든 `password-encoder.port.ts`를 이 폴더로 둔다)

### Repository 합성기 (`src/contexts/identity/application/member/repositories/`)
- [ ] `event-sourced-member.repository.ts` — outbound port 3개(`EventStore`, `SnapshotStore`, `EventPublisher`)를 합성해 `MemberRepository`를 구현

### UseCase 구현체 (`src/contexts/identity/application/member/use-cases/`)
> 각 클래스는 동일 이름의 `ports/in` 인터페이스를 `implements` 한다.
- [ ] `sign-up-member.use-case.ts`
- [ ] `update-member.use-case.ts`
- [ ] `change-password.use-case.ts`
- [ ] `reset-password.use-case.ts`
- [ ] `change-email.use-case.ts`
- [ ] `add-point.use-case.ts`
- [ ] `withdraw-member.use-case.ts`

### Email Verification (`src/contexts/identity/application/member/services/`)
- [ ] `email-verification.service.ts`

### Projector (`src/contexts/identity/application/member/projections/`)
- [ ] `member.projector.ts`

### Query (`src/contexts/identity/application/member/queries/`)
- [ ] `member-query.service.ts`

### DTO (`src/contexts/identity/application/member/dto/`)
- [ ] `member-read.dto.ts`

### 테스트 (`test/unit/identity/member/use-cases/`, `test/integration/`)
- [ ] `sign-up-member.use-case.spec.ts` (in-memory)
- [ ] `change-password.use-case.spec.ts`
- [ ] `withdraw-member.use-case.spec.ts`
- [ ] (모든 UseCase 최소 1 happy path + 1 edge case)

---

## Step 1. Inbound Ports — UseCase 계약 (Driving)

> 코어가 외부에 노출하는 시나리오 계약. Controller는 **이 인터페이스에만** 의존한다 (구현 클래스는 DI 시점에 주입).
> 각 인터페이스는 단일 메서드 `execute(req): Promise<res>` 형태이므로 테스트에서 `{ execute: jest.fn() }` 한 줄로 가짜를 만들 수 있다.

```typescript
// src/contexts/identity/application/member/ports/in/sign-up-member.use-case.port.ts
import type { NotificationChannel } from "@/contexts/identity/domain/member/enums/notification.enum";
import type { NotificationFrequency } from "@/contexts/identity/domain/member/enums/frequency.enum";

export interface SignUpMemberRequest {
  email: string;
  password: string;
  nickname: string;
  job: string;
  notification: NotificationChannel;
  frequency: NotificationFrequency;
}

export interface SignUpMemberResponse {
  memberId: string;
}

export interface SignUpMemberUseCase {
  execute(req: SignUpMemberRequest): Promise<SignUpMemberResponse>;
}
```

```typescript
// src/contexts/identity/application/member/ports/in/update-member.use-case.port.ts
import type { NotificationChannel } from "@/contexts/identity/domain/member/enums/notification.enum";
import type { NotificationFrequency } from "@/contexts/identity/domain/member/enums/frequency.enum";

export interface UpdateMemberRequest {
  memberId: string;
  job?: string;
  nickname?: string;
  notification?: NotificationChannel;
  frequency?: NotificationFrequency;
}

export interface UpdateMemberUseCase {
  execute(req: UpdateMemberRequest): Promise<void>;
}
```

```typescript
// src/contexts/identity/application/member/ports/in/change-password.use-case.port.ts
export interface ChangePasswordRequest {
  memberId: string;
  currentPassword: string;
  newPassword: string;
}

export interface ChangePasswordUseCase {
  execute(req: ChangePasswordRequest): Promise<void>;
}
```

```typescript
// src/contexts/identity/application/member/ports/in/reset-password.use-case.port.ts
export interface ResetPasswordRequest {
  email: string;
  verificationCode: string;
}

export interface ResetPasswordResponse {
  memberId: string;
  temporaryPassword: string;
}

export interface ResetPasswordUseCase {
  execute(req: ResetPasswordRequest): Promise<ResetPasswordResponse>;
}
```

```typescript
// src/contexts/identity/application/member/ports/in/change-email.use-case.port.ts
export interface ChangeEmailRequest {
  memberId: string;
  newEmail: string;
}

export interface ChangeEmailUseCase {
  execute(req: ChangeEmailRequest): Promise<void>;
}
```

```typescript
// src/contexts/identity/application/member/ports/in/add-point.use-case.port.ts
export interface AddPointRequest {
  memberId: string;
  amount: number;
}

export interface AddPointUseCase {
  execute(req: AddPointRequest): Promise<void>;
}
```

```typescript
// src/contexts/identity/application/member/ports/in/withdraw-member.use-case.port.ts
export interface WithdrawMemberUseCase {
  execute(memberId: string): Promise<void>;
}
```

---

## Step 2. Outbound Ports — 외부 위임 계약 (Driven)

### 2-1. `member.repository.port.ts`

```typescript
// src/contexts/identity/application/member/ports/out/member.repository.port.ts
import type { Member } from "@/contexts/identity/domain/member/member.aggregate";

export const MEMBER_REPOSITORY = Symbol("MEMBER_REPOSITORY");

export interface MemberRepository {
  load(memberId: string): Promise<Member | null>;
  save(member: Member): Promise<void>;
}
```

> 파일명을 기존의 `member-event-sourced.repository.port.ts`에서 `member.repository.port.ts`로 단순화한다. "Event Sourced"라는 구현 디테일은 port가 알 필요가 없다 — 어떤 구현이든 `load`/`save`만 제공하면 된다.

### 2-2. `member-read.repository.port.ts`

```typescript
// src/contexts/identity/application/member/ports/out/member-read.repository.port.ts
import type { NotificationChannel } from "@/contexts/identity/domain/member/enums/notification.enum";
import type { NotificationFrequency } from "@/contexts/identity/domain/member/enums/frequency.enum";

export const MEMBER_READ_REPOSITORY = Symbol("MEMBER_READ_REPOSITORY");

export interface MemberReadDto {
  id: string;
  email: string;
  nickname: string;
  job: string;
  notification: NotificationChannel;
  frequency: NotificationFrequency;
  point: number;
  isPro: boolean;
  createdAt: Date;
  updatedAt: Date;
  activity: string[];
}

export interface MemberReadRepository {
  findById(id: string): Promise<MemberReadDto | null>;
  findByEmail(email: string): Promise<MemberReadDto | null>;
  findAll(limit: number, offset: number): Promise<MemberReadDto[]>;
  existsByEmail(email: string): Promise<boolean>;

  // Projector 전용
  insert(dto: MemberReadDto): Promise<void>;
  update(id: string, patch: Partial<MemberReadDto>): Promise<void>;
  delete(id: string): Promise<void>;
  appendActivity(id: string, date: string): Promise<void>;
}
```

### 2-3. `email-sender.port.ts`

```typescript
// src/contexts/identity/application/member/ports/out/email-sender.port.ts
export const EMAIL_SENDER = Symbol("EMAIL_SENDER");

export interface EmailSender {
  sendVerificationCode(toEmail: string, code: string): Promise<void>;
  sendTemporaryPassword(toEmail: string, tempPassword: string): Promise<void>;
}
```

> `password-encoder.port.ts`는 Phase 03에서 정의되었지만, **이번 phase부터 위치를 `ports/out/`로 통일한다.** Symbol 토큰(`PASSWORD_ENCODER`)과 인터페이스는 그대로.

---

## Step 3. EventSourcedMemberRepository — Outbound Port 합성기

> 이 클래스는 outbound port 3개(`EventStore`, `SnapshotStore`, `EventPublisher`)를 합성해서 또 다른 outbound port인 `MemberRepository`를 구현한다. 외부 기술(DB/메시지)에 직접 닿지 않고 "다른 port를 조립"하는 합성기이므로 `application/member/repositories/`에 둔다 (adapter 레이어가 아니다).

```typescript
// src/contexts/identity/application/member/repositories/event-sourced-member.repository.ts
import { Inject, Injectable } from "@nestjs/common";

import {
  EVENT_STORE,
  type EventStore,
} from "@/contexts/identity/application/ports/out/event-store.port";
import {
  SNAPSHOT_STORE,
  type SnapshotStore,
} from "@/contexts/identity/application/ports/out/snapshot-store.port";
import {
  EVENT_PUBLISHER,
  type EventPublisher,
} from "@/contexts/identity/application/ports/out/event-publisher.port";

import { Member } from "@/contexts/identity/domain/member/member.aggregate";

import type { MemberRepository } from "../ports/out/member.repository.port";

const SNAPSHOT_FREQUENCY = 20;

@Injectable()
export class EventSourcedMemberRepository implements MemberRepository {
  constructor(
    @Inject(EVENT_STORE) private readonly eventStore: EventStore,
    @Inject(SNAPSHOT_STORE) private readonly snapshotStore: SnapshotStore,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async load(memberId: string): Promise<Member | null> {
    const member = new (Member as any)() as Member;

    const snapshot = await this.snapshotStore.loadLatest(memberId, "Member");
    let fromVersion = 0;
    if (snapshot) {
      member.loadFromSnapshot(snapshot.state, snapshot.version);
      fromVersion = snapshot.version;
    }

    const events = await this.eventStore.loadEvents(memberId, fromVersion);
    if (!snapshot && events.length === 0) return null;

    member.replay(events);
    return member;
  }

  async save(member: Member): Promise<void> {
    const events = [...member.uncommittedEvents];
    if (events.length === 0) return;

    const expectedVersion = member.version - events.length;
    await this.eventStore.append(member.id, expectedVersion, events);

    // Projection dispatch (트랜잭션 일관성: 우선 same-process emit. Outbox는 Phase 08)
    await this.publisher.publishAll(events);

    if (member.version % SNAPSHOT_FREQUENCY === 0) {
      await this.snapshotStore.save({
        aggregateId: member.id,
        aggregateType: "Member",
        version: member.version,
        state: member.toSnapshot(),
        createdAt: new Date(),
      });
    }

    member.markEventsAsCommitted();
  }
}
```

---

## Step 4. EmailVerificationService (in-memory)

```typescript
// src/contexts/identity/application/member/services/email-verification.service.ts
import { Injectable } from "@nestjs/common";
import { VerificationCode } from "@/contexts/identity/domain/member/value-objects/verification-code.vo";
import { InvalidVerificationCodeException } from "@/contexts/identity/domain/member/exceptions/invalid-verification-code.exception";

interface PendingEntry { code: VerificationCode; purpose: VerificationPurpose; }
interface VerifiedEntry { email: string; verifiedAt: Date; purpose: VerificationPurpose; }

export type VerificationPurpose = "REGISTER" | "CHANGE_EMAIL" | "PASSWORD_RESET";

@Injectable()
export class EmailVerificationService {
  private pending = new Map<string, PendingEntry>();
  private verified = new Map<string, VerifiedEntry>();
  private static readonly VERIFIED_TTL_MS = 5 * 60 * 1000;

  startVerification(email: string, purpose: VerificationPurpose): string {
    const code = VerificationCode.generate();
    this.pending.set(this.key(email, purpose), { code, purpose });
    setTimeout(() => this.pending.delete(this.key(email, purpose)), 5 * 60 * 1000);
    return code.value;
  }

  verify(email: string, code: string, purpose: VerificationPurpose): void {
    const entry = this.pending.get(this.key(email, purpose));
    if (!entry || !entry.code.matches(code)) throw new InvalidVerificationCodeException();
    this.pending.delete(this.key(email, purpose));
    this.verified.set(this.key(email, purpose), { email, purpose, verifiedAt: new Date() });
    setTimeout(() => this.verified.delete(this.key(email, purpose)), EmailVerificationService.VERIFIED_TTL_MS);
  }

  consumeVerified(email: string, purpose: VerificationPurpose): void {
    const v = this.verified.get(this.key(email, purpose));
    if (!v || Date.now() - v.verifiedAt.getTime() > EmailVerificationService.VERIFIED_TTL_MS) {
      throw new InvalidVerificationCodeException();
    }
    this.verified.delete(this.key(email, purpose));
  }

  private key(email: string, purpose: VerificationPurpose): string {
    return `${purpose}:${email.toLowerCase()}`;
  }
}
```

---

## Step 5. UseCases (Inbound Port 구현)

> 각 UseCase 클래스는 Step 1에서 정의한 동일 이름의 inbound port 인터페이스를 `implements` 한다.
> Controller는 클래스를 직접 주입받지만, 타입 시스템 상 인터페이스 계약은 보장된다.

### 5-1. SignUpMember

```typescript
// src/contexts/identity/application/member/use-cases/sign-up-member.use-case.ts
import { ConflictException, Inject, Injectable } from "@nestjs/common";

import { Member } from "@/contexts/identity/domain/member/member.aggregate";
import { Email } from "@/contexts/identity/domain/member/value-objects/email.vo";
import { Password } from "@/contexts/identity/domain/member/value-objects/password.vo";
import { Nickname } from "@/contexts/identity/domain/member/value-objects/nickname.vo";

import type {
  SignUpMemberUseCase as SignUpMemberUseCasePort,
  SignUpMemberRequest,
  SignUpMemberResponse,
} from "../ports/in/sign-up-member.use-case.port";
import { MEMBER_REPOSITORY, type MemberRepository } from "../ports/out/member.repository.port";
import { MEMBER_READ_REPOSITORY, type MemberReadRepository } from "../ports/out/member-read.repository.port";
import { PASSWORD_ENCODER, type PasswordEncoder } from "../ports/out/password-encoder.port";
import { EmailVerificationService } from "../services/email-verification.service";

@Injectable()
export class SignUpMemberUseCase implements SignUpMemberUseCasePort {
  constructor(
    @Inject(MEMBER_REPOSITORY) private readonly repo: MemberRepository,
    @Inject(MEMBER_READ_REPOSITORY) private readonly read: MemberReadRepository,
    @Inject(PASSWORD_ENCODER) private readonly encoder: PasswordEncoder,
    private readonly verification: EmailVerificationService,
  ) {}

  async execute(req: SignUpMemberRequest): Promise<SignUpMemberResponse> {
    this.verification.consumeVerified(req.email, "REGISTER");

    if (await this.read.existsByEmail(req.email.toLowerCase())) {
      throw new ConflictException("Email already exists");
    }

    const member = Member.register({
      email: Email.of(req.email),
      password: Password.create(req.password, this.encoder),
      nickname: Nickname.of(req.nickname),
      job: req.job,
      notification: req.notification,
      frequency: req.frequency,
    });

    await this.repo.save(member);
    return { memberId: member.id };
  }
}
```

> **이름 충돌 회피**: 인터페이스와 클래스가 동일 이름 `SignUpMemberUseCase`를 가지므로, port import는 `as SignUpMemberUseCasePort`로 별칭을 부여한다. 클래스를 외부에서 import할 때는 클래스 본체 이름 그대로 쓰면 된다.

### 5-2. UpdateMember

```typescript
// src/contexts/identity/application/member/use-cases/update-member.use-case.ts
import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import { Nickname } from "@/contexts/identity/domain/member/value-objects/nickname.vo";

import type {
  UpdateMemberUseCase as UpdateMemberUseCasePort,
  UpdateMemberRequest,
} from "../ports/in/update-member.use-case.port";
import { MEMBER_REPOSITORY, type MemberRepository } from "../ports/out/member.repository.port";

@Injectable()
export class UpdateMemberUseCase implements UpdateMemberUseCasePort {
  constructor(
    @Inject(MEMBER_REPOSITORY) private readonly repo: MemberRepository,
  ) {}

  async execute(req: UpdateMemberRequest): Promise<void> {
    const member = await this.repo.load(req.memberId);
    if (!member) throw new NotFoundException("Member not found");

    member.update({
      job: req.job,
      nickname: req.nickname ? Nickname.of(req.nickname) : undefined,
      notification: req.notification,
      frequency: req.frequency,
    });

    await this.repo.save(member);
  }
}
```

### 5-3. ChangePassword

```typescript
// src/contexts/identity/application/member/use-cases/change-password.use-case.ts
import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import { Password } from "@/contexts/identity/domain/member/value-objects/password.vo";

import type {
  ChangePasswordUseCase as ChangePasswordUseCasePort,
  ChangePasswordRequest,
} from "../ports/in/change-password.use-case.port";
import { MEMBER_REPOSITORY, type MemberRepository } from "../ports/out/member.repository.port";
import { PASSWORD_ENCODER, type PasswordEncoder } from "../ports/out/password-encoder.port";

@Injectable()
export class ChangePasswordUseCase implements ChangePasswordUseCasePort {
  constructor(
    @Inject(MEMBER_REPOSITORY) private readonly repo: MemberRepository,
    @Inject(PASSWORD_ENCODER) private readonly encoder: PasswordEncoder,
  ) {}

  async execute(req: ChangePasswordRequest): Promise<void> {
    const member = await this.repo.load(req.memberId);
    if (!member) throw new NotFoundException();

    member.changePassword(
      req.currentPassword,
      Password.create(req.newPassword, this.encoder),
      this.encoder,
    );
    await this.repo.save(member);
  }
}
```

### 5-4. ResetPassword

```typescript
// src/contexts/identity/application/member/use-cases/reset-password.use-case.ts
import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import { Password } from "@/contexts/identity/domain/member/value-objects/password.vo";

import type {
  ResetPasswordUseCase as ResetPasswordUseCasePort,
  ResetPasswordRequest,
  ResetPasswordResponse,
} from "../ports/in/reset-password.use-case.port";
import { MEMBER_REPOSITORY, type MemberRepository } from "../ports/out/member.repository.port";
import { MEMBER_READ_REPOSITORY, type MemberReadRepository } from "../ports/out/member-read.repository.port";
import { PASSWORD_ENCODER, type PasswordEncoder } from "../ports/out/password-encoder.port";
import { EmailVerificationService } from "../services/email-verification.service";

@Injectable()
export class ResetPasswordUseCase implements ResetPasswordUseCasePort {
  constructor(
    @Inject(MEMBER_REPOSITORY) private readonly repo: MemberRepository,
    @Inject(MEMBER_READ_REPOSITORY) private readonly read: MemberReadRepository,
    @Inject(PASSWORD_ENCODER) private readonly encoder: PasswordEncoder,
    private readonly verification: EmailVerificationService,
  ) {}

  async execute(req: ResetPasswordRequest): Promise<ResetPasswordResponse> {
    this.verification.verify(req.email, req.verificationCode, "PASSWORD_RESET");
    this.verification.consumeVerified(req.email, "PASSWORD_RESET");

    const dto = await this.read.findByEmail(req.email.toLowerCase());
    if (!dto) throw new NotFoundException();

    const member = await this.repo.load(dto.id);
    if (!member) throw new NotFoundException();

    const tempPassword = generateTemporaryPassword();
    member.resetPassword(Password.create(tempPassword, this.encoder));
    await this.repo.save(member);

    return { memberId: dto.id, temporaryPassword: tempPassword };
  }
}

function generateTemporaryPassword(): string {
  const upper = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digit = "23456789";
  const symbol = "!@#$%^&*";
  const all = upper + lower + digit + symbol;
  const must = [upper, lower, digit, symbol].map((s) => s[Math.floor(Math.random() * s.length)]);
  const rest = Array.from({ length: 4 }, () => all[Math.floor(Math.random() * all.length)]);
  return [...must, ...rest].sort(() => Math.random() - 0.5).join("");
}
```

### 5-5. ChangeEmail

```typescript
// src/contexts/identity/application/member/use-cases/change-email.use-case.ts
import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import { Email } from "@/contexts/identity/domain/member/value-objects/email.vo";

import type {
  ChangeEmailUseCase as ChangeEmailUseCasePort,
  ChangeEmailRequest,
} from "../ports/in/change-email.use-case.port";
import { MEMBER_REPOSITORY, type MemberRepository } from "../ports/out/member.repository.port";
import { EmailVerificationService } from "../services/email-verification.service";

@Injectable()
export class ChangeEmailUseCase implements ChangeEmailUseCasePort {
  constructor(
    @Inject(MEMBER_REPOSITORY) private readonly repo: MemberRepository,
    private readonly verification: EmailVerificationService,
  ) {}

  async execute(req: ChangeEmailRequest): Promise<void> {
    this.verification.consumeVerified(req.newEmail, "CHANGE_EMAIL");

    const member = await this.repo.load(req.memberId);
    if (!member) throw new NotFoundException();

    member.changeEmail(Email.of(req.newEmail));
    await this.repo.save(member);
  }
}
```

### 5-6. AddPoint

```typescript
// src/contexts/identity/application/member/use-cases/add-point.use-case.ts
import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import type {
  AddPointUseCase as AddPointUseCasePort,
  AddPointRequest,
} from "../ports/in/add-point.use-case.port";
import { MEMBER_REPOSITORY, type MemberRepository } from "../ports/out/member.repository.port";

@Injectable()
export class AddPointUseCase implements AddPointUseCasePort {
  constructor(@Inject(MEMBER_REPOSITORY) private readonly repo: MemberRepository) {}

  async execute(req: AddPointRequest): Promise<void> {
    const m = await this.repo.load(req.memberId);
    if (!m) throw new NotFoundException();
    m.addPoint(req.amount);
    await this.repo.save(m);
  }
}
```

### 5-7. WithdrawMember

```typescript
// src/contexts/identity/application/member/use-cases/withdraw-member.use-case.ts
import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import type { WithdrawMemberUseCase as WithdrawMemberUseCasePort } from "../ports/in/withdraw-member.use-case.port";
import { MEMBER_REPOSITORY, type MemberRepository } from "../ports/out/member.repository.port";

@Injectable()
export class WithdrawMemberUseCase implements WithdrawMemberUseCasePort {
  constructor(@Inject(MEMBER_REPOSITORY) private readonly repo: MemberRepository) {}

  async execute(memberId: string): Promise<void> {
    const m = await this.repo.load(memberId);
    if (!m) throw new NotFoundException();
    m.withdraw();
    await this.repo.save(m);
  }
}
```

---

## Step 6. MemberProjector

Projector는 `@OnEvent` 데코레이터로 `ProjectionDispatcher`가 emit하는 이벤트를 구독한다.

```typescript
// src/contexts/identity/application/member/projections/member.projector.ts
import { Inject, Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";

import { MEMBER_READ_REPOSITORY, type MemberReadRepository } from "../ports/out/member-read.repository.port";
import type { DomainEvent } from "@/shared-kernel/domain/domain-event.base";

import { MemberRegisteredEvent } from "@/contexts/identity/domain/member/events/member-registered.event";
import { MemberUpdatedEvent } from "@/contexts/identity/domain/member/events/member-updated.event";
import { MemberPasswordChangedEvent } from "@/contexts/identity/domain/member/events/member-password-changed.event";
import { MemberPasswordResetEvent } from "@/contexts/identity/domain/member/events/member-password-reset.event";
import { MemberEmailChangedEvent } from "@/contexts/identity/domain/member/events/member-email-changed.event";
import { MemberPointAddedEvent } from "@/contexts/identity/domain/member/events/member-point-added.event";
import { MemberWithdrawnEvent } from "@/contexts/identity/domain/member/events/member-withdrawn.event";

@Injectable()
export class MemberProjector {
  constructor(
    @Inject(MEMBER_READ_REPOSITORY) private readonly read: MemberReadRepository,
  ) {}

  @OnEvent(MemberRegisteredEvent.TYPE)
  async onRegistered(event: DomainEvent): Promise<void> {
    const p = event.payload as import("@/contexts/identity/domain/member/events/member-registered.event").MemberRegisteredPayload;
    await this.read.insert({
      id: event.aggregateId,
      email: p.email,
      nickname: p.nickname,
      job: p.job,
      notification: p.notification,
      frequency: p.frequency,
      point: 0,
      isPro: false,
      createdAt: event.occurredAt,
      updatedAt: event.occurredAt,
      activity: [],
    });
  }

  @OnEvent(MemberUpdatedEvent.TYPE)
  async onUpdated(event: DomainEvent): Promise<void> {
    const p = event.payload as Record<string, unknown>;
    await this.read.update(event.aggregateId, { ...p, updatedAt: event.occurredAt });
  }

  @OnEvent(MemberPasswordChangedEvent.TYPE)
  @OnEvent(MemberPasswordResetEvent.TYPE)
  async onPasswordChanged(event: DomainEvent): Promise<void> {
    // Read DB는 password를 보관하지 않으므로 updatedAt만 갱신
    await this.read.update(event.aggregateId, { updatedAt: event.occurredAt });
  }

  @OnEvent(MemberEmailChangedEvent.TYPE)
  async onEmailChanged(event: DomainEvent): Promise<void> {
    const p = event.payload as { newEmail: string };
    await this.read.update(event.aggregateId, { email: p.newEmail, updatedAt: event.occurredAt });
  }

  @OnEvent(MemberPointAddedEvent.TYPE)
  async onPointAdded(event: DomainEvent): Promise<void> {
    const dto = await this.read.findById(event.aggregateId);
    if (!dto) return;
    const p = event.payload as { amount: number };
    await this.read.update(event.aggregateId, {
      point: dto.point + p.amount,
      updatedAt: event.occurredAt,
    });
  }

  @OnEvent(MemberWithdrawnEvent.TYPE)
  async onWithdrawn(event: DomainEvent): Promise<void> {
    await this.read.delete(event.aggregateId);
  }
}
```

---

## Step 7. MemberQueryService

CQRS Query Bus는 쓰지 않는다. Controller가 이 서비스를 직접 호출.

```typescript
// src/contexts/identity/application/member/queries/member-query.service.ts
import { Inject, Injectable } from "@nestjs/common";
import {
  MEMBER_READ_REPOSITORY,
  type MemberReadDto,
  type MemberReadRepository,
} from "../ports/out/member-read.repository.port";

@Injectable()
export class MemberQueryService {
  constructor(
    @Inject(MEMBER_READ_REPOSITORY) private readonly read: MemberReadRepository,
  ) {}

  findById(id: string): Promise<MemberReadDto | null> { return this.read.findById(id); }
  findByEmail(email: string): Promise<MemberReadDto | null> { return this.read.findByEmail(email.toLowerCase()); }
  findAll(limit: number, offset: number): Promise<MemberReadDto[]> { return this.read.findAll(limit, offset); }
  emailExists(email: string): Promise<boolean> { return this.read.existsByEmail(email.toLowerCase()); }
}
```

---

## Step 8. 모듈 구성 (선택적, Phase 05에서 통합 가능)

이 시점에서는 아직 Adapter(MemberReadRepository 구현, BcryptEncoder, Nodemailer)가 없으므로 모듈 통합은 **Phase 05에서 일괄 수행**한다.

---

## Step 9. 테스트 — In-memory Test Doubles

UseCase 통합 테스트를 in-memory 더블로 작성하면 Phase 05 (DB) 없이도 비즈니스 시나리오 검증이 가능하다.

### 8-1. Test Doubles

```typescript
// test/unit/identity/member/_doubles.ts
import type { EventStore } from "@/contexts/identity/application/ports/out/event-store.port";
import type { SnapshotStore } from "@/contexts/identity/application/ports/out/snapshot-store.port";
import type { EventPublisher } from "@/contexts/identity/application/ports/out/event-publisher.port";
import type { MemberReadRepository } from "@/contexts/identity/application/member/ports/out/member-read.repository.port";
import type { PasswordEncoder } from "@/contexts/identity/application/member/ports/out/password-encoder.port";
import type { EmailSender } from "@/contexts/identity/application/member/ports/out/email-sender.port";
import type { DomainEvent } from "@/shared-kernel/domain/domain-event.base";

export class InMemoryEventStore implements EventStore {
  private store = new Map<string, DomainEvent[]>();
  async append(id: string, expected: number, events: readonly DomainEvent[]) {
    const list = this.store.get(id) ?? [];
    if (list.length !== expected) throw new Error("CONCURRENCY");
    this.store.set(id, [...list, ...events]);
  }
  async loadEvents(id: string, from = 0) {
    return (this.store.get(id) ?? []).filter((e) => e.eventVersion > from);
  }
  async loadEventsByType(type: string) {
    return [...this.store.values()].flat().filter((e) => e.aggregateType === type);
  }
}

export class InMemorySnapshotStore implements SnapshotStore {
  private map = new Map<string, any>();
  async save(s: any) { this.map.set(`${s.aggregateId}:${s.version}`, s); }
  async loadLatest(id: string) {
    const arr = [...this.map.values()].filter((s) => s.aggregateId === id);
    return arr.sort((a, b) => b.version - a.version)[0] ?? null;
  }
}

export class FakeEventPublisher implements EventPublisher {
  public published: DomainEvent[] = [];
  async publishAll(events: readonly DomainEvent[]) { this.published.push(...events); }
}

export class FakePasswordEncoder implements PasswordEncoder {
  encode(p: string) { return `hash:${p}`; }
  matches(p: string, h: string) { return h === `hash:${p}`; }
}

export class InMemoryMemberReadRepo implements MemberReadRepository {
  public rows = new Map<string, any>();
  async findById(id: string) { return this.rows.get(id) ?? null; }
  async findByEmail(email: string) { return [...this.rows.values()].find((r) => r.email === email) ?? null; }
  async findAll(limit: number, offset: number) { return [...this.rows.values()].slice(offset, offset + limit); }
  async existsByEmail(email: string) { return !![...this.rows.values()].find((r) => r.email === email); }
  async insert(dto: any) { this.rows.set(dto.id, dto); }
  async update(id: string, p: any) {
    const r = this.rows.get(id); if (r) this.rows.set(id, { ...r, ...p });
  }
  async delete(id: string) { this.rows.delete(id); }
  async appendActivity(id: string, date: string) {
    const r = this.rows.get(id); if (r) r.activity = [...new Set([...(r.activity ?? []), date])];
  }
}
```

### 8-2. SignUpMember 테스트

```typescript
// test/unit/identity/member/use-cases/sign-up-member.use-case.spec.ts
import { SignUpMemberUseCase } from "@/contexts/identity/application/member/use-cases/sign-up-member.use-case";
import { EventSourcedMemberRepository } from "@/contexts/identity/application/member/repositories/event-sourced-member.repository";
import { EmailVerificationService } from "@/contexts/identity/application/member/services/email-verification.service";
import { NotificationChannel } from "@/contexts/identity/domain/member/enums/notification.enum";
import { NotificationFrequency } from "@/contexts/identity/domain/member/enums/frequency.enum";
import { ConflictException } from "@nestjs/common";

import {
  InMemoryEventStore,
  InMemorySnapshotStore,
  FakeEventPublisher,
  FakePasswordEncoder,
  InMemoryMemberReadRepo,
} from "../_doubles";

describe("SignUpMemberUseCase", () => {
  let useCase: SignUpMemberUseCase;
  let read: InMemoryMemberReadRepo;
  let publisher: FakeEventPublisher;
  let verification: EmailVerificationService;

  beforeEach(() => {
    const eventStore = new InMemoryEventStore();
    const snapshotStore = new InMemorySnapshotStore();
    publisher = new FakeEventPublisher();
    const repo = new EventSourcedMemberRepository(eventStore, snapshotStore, publisher);
    read = new InMemoryMemberReadRepo();
    const encoder = new FakePasswordEncoder();
    verification = new EmailVerificationService();
    useCase = new SignUpMemberUseCase(repo, read, encoder, verification);
  });

  const baseReq = {
    email: "new@test.com",
    password: "password123",
    nickname: "nick",
    job: "developer",
    notification: NotificationChannel.EMAIL,
    frequency: NotificationFrequency.WEEKLY,
  };

  it("이메일 인증 완료 후 가입 성공 → MemberRegistered 발행", async () => {
    const code = verification.startVerification(baseReq.email, "REGISTER");
    verification.verify(baseReq.email, code, "REGISTER");

    const result = await useCase.execute(baseReq);
    expect(result.memberId).toMatch(/^[0-9a-f-]{36}$/);
    expect(publisher.published).toHaveLength(1);
    expect(publisher.published[0].eventType).toBe("MemberRegistered");
  });

  it("이메일 인증 없이 가입 시도 → 예외", async () => {
    await expect(useCase.execute(baseReq)).rejects.toThrow();
  });

  it("중복 이메일 → ConflictException", async () => {
    await read.insert({ id: "x", email: baseReq.email, /* ...other fields */ } as any);
    const code = verification.startVerification(baseReq.email, "REGISTER");
    verification.verify(baseReq.email, code, "REGISTER");
    await expect(useCase.execute(baseReq)).rejects.toBeInstanceOf(ConflictException);
  });
});
```

### 8-3. ChangePassword & Withdraw 테스트

(같은 패턴으로 작성 — 가입 후 → 로드 → 동작 → 이벤트 발행 검증)

```typescript
// test/unit/identity/member/use-cases/withdraw-member.use-case.spec.ts
describe("WithdrawMemberUseCase", () => {
  it("탈퇴 후 동일 회원에 대한 명령은 실패", async () => {
    // setUp: signUp 먼저
    // act: withdrawUseCase.execute(memberId)
    // assert: publisher.published에 MemberWithdrawn 포함
    // assert: 다시 update 시도하면 실패
  });
});
```

---

## 검증 (Definition of Done)

```bash
pnpm test test/unit/identity/member
```

- [ ] 7개 UseCase 모두 happy path + 핵심 edge case 그린
- [ ] EventSourcedMemberRepository in-memory 통합 시나리오 그린 (signUp → load → command → save → reload → 상태 일치)
- [ ] `pnpm run build` 성공
- [ ] `grep -r "CommandBus\|QueryBus" src/contexts/identity/application/` → 0건

---

다음: [`05-member-infrastructure-presentation.md`](./05-member-infrastructure-presentation.md) — DB, Bcrypt, Nodemailer, Controller, E2E
