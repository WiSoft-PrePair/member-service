# 헥사고날 아키텍처 & DDD 패턴 개선 사항

> **종합 준수도 분석**
> - 헥사고날 아키텍처 준수도: **70/100**
> - DDD 패턴 준수도: **75/100**
>
> 이 문서는 실제 코드 분석을 통해 발견된 헥사고날 아키텍처 및 DDD 패턴 위반 사항과 개선 방법을 정리합니다.

---

## 📊 Executive Summary

### 주요 강점

**헥사고날 아키텍처:**
- ✅ Domain 계층이 인프라스트럭처로부터 완전히 격리됨 (MikroORM, NestJS 의존성 없음)
- ✅ Symbol 기반 의존성 역전 원칙(DIP) 체계적 구현
- ✅ Mapper 패턴을 통한 Domain ↔ Persistence 명확한 분리
- ✅ CQRS 패턴과 헥사고날 아키텍처의 우수한 조화

**DDD 패턴:**
- ✅ Value Objects(Email, Password) 검증 로직 캡슐화 우수
- ✅ Aggregate Root(Member, OAuthConnection) 명확한 일관성 경계
- ✅ Repository 인터페이스가 Domain 계층에 올바르게 위치
- ✅ Factory Method 패턴(Member.register(), Member.of()) 적절한 사용

### 치명적 위반 사항

**헥사고날 아키텍처 (Critical):**
1. ❌ **Application → Adapter 역방향 의존성** (28개 파일)
   - Port 인터페이스가 Adapter Entity 타입 노출
   - Application Service가 Adapter 구체 타입 직접 의존
   - EventHandler가 EntityManager 직접 사용

2. ❌ **Port/Adapter 패턴 위반** (3개 주요 Port)
   - MemberReadRepository → MemberReadEntity 노출
   - RefreshTokenRepository → RefreshTokenEntity 노출
   - OAuth/JWT Service Port 없이 직접 의존

**DDD 패턴 (Critical):**
3. ❌ **Aggregate가 도메인 이벤트를 생성하지 않음** (모든 Aggregate)
   - Member.changePassword() 등 상태 변경 메서드가 이벤트 미발생
   - CommandHandler에서 수동으로 이벤트 생성 (비즈니스 로직 분산)

4. ❌ **Aggregate 경계 위반 - Read Model 직접 수정** (2개 파일)
   - `AuthService.login()` (line 63-74)에서 MemberReadEntity.activity 직접 수정
   - `KakaoAuthService.handleCallback()` (line 249-260)에서 동일
   - CQRS 원칙 위반 (Read Model은 EventHandler를 통해서만 업데이트)

**기타 중요 위반 (Major):**
5. ❌ **Repository 인터페이스 일관성 문제**
   - register()/update()가 Member 반환 (void여야 함)
   - withdraw()만 동기 메서드 (비일관성)

6. ❌ **Logger Port가 Adapter에 위치** (28개 파일 영향)
   - `@/adapter/shared/logger/logger.inferface`를 Application에서 import

---

## 🎯 개선 우선순위

## Phase 1: Critical - DDD Aggregate 이벤트 패턴 수정

**우선순위: 최우선** (모든 리팩토링의 기반)

### 배경
현재 Aggregate(Member, OAuthConnection)가 상태 변경 시 도메인 이벤트를 직접 생성하지 않아, 비즈니스 로직이 Application 계층과 Domain 계층에 분산되어 있습니다. 이는 DDD의 핵심 원칙인 "Aggregate가 자신의 불변식과 이벤트를 관리한다"를 위배합니다.

### 1.1 Aggregate에 도메인 이벤트 수집 메커니즘 추가

**수정 대상: `/Users/moon/Developments/project/prepair/backend-ts/src/domain/member/member.ts`**

**현재 문제:**
```typescript
// ❌ src/domain/member/member.ts
export class Member {
  public changePassword(
    currentPassword: string,
    newPassword: string,
    encoder: PasswordEncoder,
  ): Member {
    if (!this.password.matches(currentPassword, encoder)) {
      throw new InvalidPasswordException();
    }
    const password: Password = Password.create(newPassword, encoder);
    return new Member({ ...this, password });
    // ❌ 이벤트가 발생하지 않음
  }

  public withdraw(): Member {
    return new Member({ ...this, isPro: false });
    // ❌ 이벤트가 발생하지 않음
  }
}
```

**CommandHandler에서 수동으로 이벤트 생성 (잘못된 패턴):**
```typescript
// ❌ src/application/member/command/change-password.command.ts
@CommandHandler(ChangePasswordCommand)
export class ChangePasswordCommandHandler {
  async execute(command: ChangePasswordCommand): Promise<void> {
    const member = await this.memberRepository.findById(command.memberId);
    const updatedMember = member.changePassword(/* ... */);
    this.memberRepository.update(updatedMember);

    // ❌ Application 계층에서 수동으로 이벤트 생성 (비즈니스 로직 누수)
    this.eventStore.append(
      createDomainEvent(member.id, "MemberPasswordChanged", {
        memberId: member.id,
        changedAt: new Date(),
      }),
    );

    await this.em.flush();
    this.eventBus.publish(new MemberPasswordChangedEvent(member.id, /* ... */));
  }
}
```

**개선 방법:**

**Step 1: Domain Event 기본 인터페이스 정의**

`/Users/moon/Developments/project/prepair/backend-ts/src/domain/shared/domain-event.ts`
```typescript
// 기존에 있다면 확장, 없다면 새로 생성
export interface IDomainEvent {
  readonly aggregateId: string;
  readonly eventType: string;
  readonly occurredAt: Date;
}

export class DomainEvent<T = any> implements IDomainEvent {
  constructor(
    public readonly aggregateId: string,
    public readonly eventType: string,
    public readonly eventData: T,
    public readonly occurredAt: Date = new Date(),
  ) {}
}

export function createDomainEvent<T>(
  aggregateId: string,
  eventType: string,
  eventData: T,
): DomainEvent<T> {
  return new DomainEvent(aggregateId, eventType, eventData);
}
```

**Step 2: Member Aggregate 수정**

`/Users/moon/Developments/project/prepair/backend-ts/src/domain/member/member.ts`
```typescript
import { DomainEvent, createDomainEvent } from "@/domain/shared/domain-event";

export class Member {
  readonly id: string;
  readonly email: Email;
  readonly password: Password;
  readonly job: string;
  readonly nickname: string;
  readonly notification: NotificationEnum;
  readonly frequency: FrequencyEnum;
  readonly point: number;
  readonly isPro: boolean;

  // ✅ 도메인 이벤트 수집을 위한 내부 배열
  private readonly _domainEvents: DomainEvent[] = [];

  private constructor(member: MemberType) {
    Object.assign(this, member);
  }

  // ✅ Factory Method - 이벤트 발생
  public static register(
    registerRequest: RegisterMemberRequest,
    encoder: PasswordEncoder,
  ): Member {
    const member = new Member({
      ...registerRequest,
      id: randomUUID(),
      email: new Email(registerRequest.email),
      password: Password.create(registerRequest.password, encoder),
      point: 0,
      isPro: false,
    });

    // ✅ Aggregate 내부에서 이벤트 생성
    member._domainEvents.push(
      createDomainEvent(member.id, "MemberRegistered", {
        memberId: member.id,
        email: member.email.value,
        password: member.password.value,
        job: member.job,
        nickname: member.nickname,
        notification: member.notification,
        frequency: member.frequency,
        occurredAt: new Date(),
      }),
    );

    return member;
  }

  // ✅ 비밀번호 변경 - 이벤트 발생
  public changePassword(
    currentPassword: string,
    newPassword: string,
    encoder: PasswordEncoder,
  ): Member {
    if (!this.password.matches(currentPassword, encoder)) {
      throw new InvalidPasswordException();
    }

    const password: Password = Password.create(newPassword, encoder);
    const updatedMember = new Member({ ...this, password });

    // ✅ Aggregate 내부에서 이벤트 생성
    updatedMember._domainEvents.push(
      createDomainEvent(this.id, "MemberPasswordChanged", {
        memberId: this.id,
        changedAt: new Date(),
      }),
    );

    return updatedMember;
  }

  // ✅ 회원 탈퇴 - 이벤트 발생
  public withdraw(): Member {
    const updatedMember = new Member({ ...this, isPro: false });

    updatedMember._domainEvents.push(
      createDomainEvent(this.id, "MemberWithdrawn", {
        memberId: this.id,
        withdrawnAt: new Date(),
      }),
    );

    return updatedMember;
  }

  // ✅ 회원 정보 업데이트 - 이벤트 발생
  public update(request: UpdateMemberRequest): Member {
    const updatedMember = new Member({
      ...this,
      job: request.job,
      nickname: request.nickname,
      notification: request.notification,
      frequency: request.frequency,
    });

    updatedMember._domainEvents.push(
      createDomainEvent(this.id, "MemberUpdated", {
        memberId: this.id,
        job: request.job,
        nickname: request.nickname,
        notification: request.notification,
        frequency: request.frequency,
        updatedAt: new Date(),
      }),
    );

    return updatedMember;
  }

  // ✅ 이메일 변경 - 이벤트 발생
  public changeEmail(newEmail: string): Member {
    const email = new Email(newEmail);
    const updatedMember = new Member({ ...this, email });

    updatedMember._domainEvents.push(
      createDomainEvent(this.id, "MemberEmailChanged", {
        memberId: this.id,
        oldEmail: this.email.value,
        newEmail: email.value,
        changedAt: new Date(),
      }),
    );

    return updatedMember;
  }

  // ✅ 비밀번호 재설정 - 이벤트 발생
  public resetPassword(newPassword: string, encoder: PasswordEncoder): Member {
    const password: Password = Password.create(newPassword, encoder);
    const updatedMember = new Member({ ...this, password });

    updatedMember._domainEvents.push(
      createDomainEvent(this.id, "MemberPasswordReset", {
        memberId: this.id,
        resetAt: new Date(),
      }),
    );

    return updatedMember;
  }

  // ✅ 도메인 이벤트 접근자
  public getDomainEvents(): ReadonlyArray<DomainEvent> {
    return [...this._domainEvents];
  }

  public clearDomainEvents(): void {
    this._domainEvents.length = 0;
  }

  // ✅ 재구성용 팩토리 (DB에서 로드 시, 이벤트 발생 안 함)
  public static of(member: MemberType): Member {
    return new Member(member);
  }
}
```

**Step 3: CommandHandler 간소화**

`/Users/moon/Developments/project/prepair/backend-ts/src/application/member/command/change-password.command.ts`
```typescript
@CommandHandler(ChangePasswordCommand)
export class ChangePasswordCommandHandler {
  @Transactional()
  async execute(command: ChangePasswordCommand): Promise<void> {
    const member = await this.memberRepository.findById(command.memberId);

    if (!member) {
      throw new NotFoundException("존재하지 않는 회원입니다.");
    }

    // ✅ Aggregate 메서드 호출 (내부에서 이벤트 생성)
    const updatedMember = member.changePassword(
      command.currentPassword,
      command.newPassword,
      this.passwordEncoder,
    );

    this.memberRepository.update(updatedMember);

    // ✅ Aggregate가 생성한 이벤트를 수집하여 저장
    for (const event of updatedMember.getDomainEvents()) {
      this.eventStore.append(event);
    }

    await this.em.flush();

    // ✅ Integration Event 발행 (NestJS EventBus용)
    for (const event of updatedMember.getDomainEvents()) {
      this.eventBus.publish(
        new MemberPasswordChangedEvent(
          event.eventData.memberId,
          event.eventData.changedAt,
        ),
      );
    }

    updatedMember.clearDomainEvents();
  }
}
```

**적용 파일:**
- `/Users/moon/Developments/project/prepair/backend-ts/src/domain/member/member.ts`
- `/Users/moon/Developments/project/prepair/backend-ts/src/domain/oauth/oauth.ts` (OAuthConnection도 동일 패턴)
- 모든 CommandHandlers (register, update, withdraw, changePassword, changeEmail, resetPassword)

**효과:**
- 비즈니스 로직과 이벤트 생성이 Aggregate 내부로 응집
- CommandHandler는 순수하게 오케스트레이션만 담당
- 이벤트 누락 불가능 (상태 변경 시 항상 이벤트 발생 보장)
- Event Sourcing 재생 시 정확한 상태 재구성 가능

---

## Phase 2: Critical - CQRS Aggregate 경계 위반 수정

**우선순위: Critical**

### 배경
`AuthService.login()`과 `KakaoAuthService.handleCallback()`에서 Read Model(MemberReadEntity)을 직접 수정하여 CQRS 패턴을 위반하고 있습니다. Read Model은 EventHandler를 통해서만 업데이트되어야 합니다.

### 2.1 로그인 활동 로그를 이벤트 기반으로 변경

**현재 문제:**

`/Users/moon/Developments/project/prepair/backend-ts/src/application/auth/auth.service.ts` (Line 63-74)
```typescript
// ❌ Read Model을 직접 수정 (CQRS 위반)
const readEntity: MemberReadEntity | null =
  await this.memberReadRepository.findById(member.id);

if (readEntity) {
  const today: string = new Date().toISOString().slice(0, 10);
  readEntity.activity = readEntity.activity ?? [];

  if (!readEntity.activity.includes(today)) {
    readEntity.activity.push(today);  // ❌ 직접 mutation
  }

  await this.em.flush();  // ❌ EntityManager 직접 사용
}
```

`/Users/moon/Developments/project/prepair/backend-ts/src/application/oauth/kakao-auth.service.ts` (Line 249-260)
```typescript
// ❌ 동일한 패턴으로 Read Model 직접 수정
private async updateActivityLog(memberId: string): Promise<void> {
  const readEntity: MemberReadEntity | null =
    await this.memberReadRepository.findById(memberId);

  if (readEntity) {
    const today: string = new Date().toISOString().slice(0, 10);
    readEntity.activity = readEntity.activity ?? [];

    if (!readEntity.activity.includes(today)) {
      readEntity.activity.push(today);
    }
  }
}
```

**개선 방법:**

**Step 1: 도메인 이벤트 정의**

`/Users/moon/Developments/project/prepair/backend-ts/src/domain/member/events/member-logged-in.event.ts` (신규)
```typescript
import { IEvent } from "@nestjs/cqrs";

export class MemberLoggedInEvent implements IEvent {
  constructor(
    public readonly memberId: string,
    public readonly loginAt: Date = new Date(),
  ) {}
}
```

**Step 2: AuthService 수정**

`/Users/moon/Developments/project/prepair/backend-ts/src/application/auth/auth.service.ts`
```typescript
import { EventBus } from "@nestjs/cqrs";
import { MemberLoggedInEvent } from "@/domain/member/events/member-logged-in.event";

@Injectable()
export class AuthService {
  constructor(
    @Inject(MEMBER_REPOSITORY)
    private readonly memberRepository: MemberRepository,
    @Inject(PASSWORD_ENCODER)
    private readonly passwordEncoder: PasswordEncoder,
    private readonly eventBus: EventBus,  // ✅ EventBus 주입
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  async login(request: LoginRequestDto): Promise<LoginResult> {
    const member: Member | null = await this.memberRepository.findByEmail(
      request.email,
    );

    if (!member) {
      throw new NotFoundException("존재하지 않는 회원입니다.");
    }

    const isValid: boolean = member.password.matches(
      request.password,
      this.passwordEncoder,
    );

    if (!isValid) {
      throw new UnauthorizedException(
        "이메일 또는 비밀번호가 일치하지 않습니다",
      );
    }

    // ✅ 이벤트 발행 (Read Model 업데이트는 EventHandler가 처리)
    this.eventBus.publish(new MemberLoggedInEvent(member.id));

    return {
      memberId: member.id,
      email: member.email.value,
    };
  }
}
```

**Step 3: EventHandler 생성**

`/Users/moon/Developments/project/prepair/backend-ts/src/application/member/event/member-logged-in-event-handler.service.ts` (신규)
```typescript
import { Injectable, Inject } from "@nestjs/common";
import { EventsHandler, IEventHandler } from "@nestjs/cqrs";
import { MemberLoggedInEvent } from "@/domain/member/events/member-logged-in.event";
import {
  MEMBER_READ_REPOSITORY,
  type MemberReadRepository,
} from "@/application/member/ports/member-read.repository";
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";

@Injectable()
@EventsHandler(MemberLoggedInEvent)
export class MemberLoggedInEventHandler
  implements IEventHandler<MemberLoggedInEvent> {
  constructor(
    @Inject(MEMBER_READ_REPOSITORY)
    private readonly memberReadRepository: MemberReadRepository,
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  async handle(event: MemberLoggedInEvent): Promise<void> {
    this.logger.log("Member logged in event handling started", {
      module: "MemberLoggedInEventHandler",
      memberId: event.memberId,
    });

    try {
      // ✅ Read Model 조회 (Phase 1 적용 후 MemberReadDto 사용)
      const readEntity = await this.memberReadRepository.findById(event.memberId);

      if (readEntity) {
        const today: string = event.loginAt.toISOString().slice(0, 10);
        const activity = readEntity.activity ?? [];

        if (!activity.includes(today)) {
          activity.push(today);

          // ✅ Repository를 통해 업데이트
          this.memberReadRepository.save({
            ...readEntity,
            activity,
          });
        }
      }

      this.logger.log("Member logged in event handling completed", {
        module: "MemberLoggedInEventHandler",
        memberId: event.memberId,
      });
    } catch (error) {
      this.logger.error(
        "Member logged in event handling failed",
        error instanceof Error ? error : undefined,
        {
          module: "MemberLoggedInEventHandler",
          memberId: event.memberId,
        },
      );
      throw error;
    }
  }
}
```

**Step 4: KakaoAuthService 수정**

`/Users/moon/Developments/project/prepair/backend-ts/src/application/oauth/kakao-auth.service.ts`
```typescript
@Injectable()
export class KakaoAuthService {
  constructor(
    private readonly kakaoOAuthService: KakaoOauthService,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
    // ...
    private readonly eventBus: EventBus,  // ✅ EventBus 주입
  ) {}

  private async loginExistingMember(memberId: string) {
    const member = await this.memberRepository.findById(memberId);

    if (!member) {
      throw new BadRequestException("회원 정보를 찾을 수 없습니다.");
    }

    // ✅ 이벤트 발행 (직접 수정 제거)
    this.eventBus.publish(new MemberLoggedInEvent(memberId));

    const accessToken = this.jwtService.generateAccessToken(
      member.id,
      member.email.value,
    );

    const refreshToken = await this.refreshTokenService.create(member.id);

    await this.em.flush();

    return {
      isNewMember: false,
      accessToken: accessToken.accessToken,
      refreshToken,
      accessTokenExpiresIn: accessToken.expiresIn,
      memberId: member.id,
    };
  }

  // ❌ updateActivityLog() 메서드 완전 제거
}
```

**Step 5: Module Provider 등록**

`/Users/moon/Developments/project/prepair/backend-ts/src/adapter/member/member.module.ts`
```typescript
import { MemberLoggedInEventHandler } from "@/application/member/event/member-logged-in-event-handler.service";

const EventHandlers = [
  MemberRegisterEventHandler,
  MemberWithdrawEventHandler,
  MemberUpdateEventHandler,
  MemberPasswordChangedEventHandler,
  MemberEmailChangedEventHandler,
  MemberPasswordResetEventHandler,
  MemberLoggedInEventHandler,  // ✅ 추가
];

@Module({
  // ...
  providers: [
    ...CommandHandlers,
    ...QueryHandlers,
    ...EventHandlers,  // ✅ 자동 등록
    // ...
  ],
})
export class MemberModule {}
```

**적용 파일:**
- `/Users/moon/Developments/project/prepair/backend-ts/src/application/auth/auth.service.ts` (line 63-74 제거)
- `/Users/moon/Developments/project/prepair/backend-ts/src/application/oauth/kakao-auth.service.ts` (line 249-260 제거)
- `/Users/moon/Developments/project/prepair/backend-ts/src/domain/member/events/member-logged-in.event.ts` (신규)
- `/Users/moon/Developments/project/prepair/backend-ts/src/application/member/event/member-logged-in-event-handler.service.ts` (신규)

**효과:**
- CQRS 패턴 준수 (Read Model은 EventHandler를 통해서만 업데이트)
- Aggregate 경계 명확화
- 로그인 활동 이력이 Event Store에 기록됨 (감사 추적 가능)

---

## Phase 3: Critical - Port 인터페이스 순수화

**우선순위: Critical**

### 3.1 MemberReadRepository Port를 Application DTO로 변경

**현재 문제:**

`/Users/moon/Developments/project/prepair/backend-ts/src/application/member/ports/member-read.repository.ts`
```typescript
// ❌ Adapter 계층 Entity를 타입으로 노출
import { MemberReadEntity } from "@/adapter/member/persistence/read/entity/member-read.entity";

export interface MemberReadRepository {
  save(entity: MemberReadEntity): void;  // ❌ Adapter 타입
  findById(id: string): Promise<MemberReadEntity | null>;  // ❌ Adapter 타입
  findByEmail(email: string): Promise<MemberReadEntity | null>;
  findAll(options?: {
    limit?: number;
    offset?: number;
  }): Promise<MemberReadEntity[]>;
  withdraw(id: string): Promise<number>;
}

export const MEMBER_READ_REPOSITORY = Symbol("MemberReadRepository");
```

**영향받는 파일:**
- `/Users/moon/Developments/project/prepair/backend-ts/src/application/member/query/get-member.query.ts`
- `/Users/moon/Developments/project/prepair/backend-ts/src/application/member/query/get-member-email.query.ts`
- `/Users/moon/Developments/project/prepair/backend-ts/src/application/member/command/member-withdraw.command.ts`
- `/Users/moon/Developments/project/prepair/backend-ts/src/application/member/command/send-email-verification.command.ts`
- `/Users/moon/Developments/project/prepair/backend-ts/src/application/member/event/member-register-event-handler.service.ts`
- `/Users/moon/Developments/project/prepair/backend-ts/src/application/member/event/member-update-event-handler.service.ts`
- `/Users/moon/Developments/project/prepair/backend-ts/src/application/member/event/member-email-changed-event-handler.service.ts`
- `/Users/moon/Developments/project/prepair/backend-ts/src/application/member/event/member-password-reset-event-handler.service.ts`
- `/Users/moon/Developments/project/prepair/backend-ts/src/application/auth/auth.service.ts` (Line 7, 19)

**개선 방법:**

**Step 1: Application DTO 생성**

`/Users/moon/Developments/project/prepair/backend-ts/src/application/member/dto/member-read.dto.ts` (신규)
```typescript
import { FrequencyEnum, NotificationEnum } from "@/domain/member";

/**
 * Read Model용 Application DTO
 * Adapter 계층 Entity와 분리된 Application 계층 타입
 */
export class MemberReadDto {
  readonly id: string;
  readonly email: string;
  readonly job: string;
  readonly nickname: string;
  readonly notification: NotificationEnum;
  readonly frequency: FrequencyEnum;
  readonly point: number;
  readonly isPro: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly activity?: string[];

  constructor(data: {
    id: string;
    email: string;
    job: string;
    nickname: string;
    notification: NotificationEnum;
    frequency: FrequencyEnum;
    point: number;
    isPro: boolean;
    createdAt: Date;
    updatedAt: Date;
    activity?: string[];
  }) {
    Object.assign(this, data);
    Object.freeze(this);  // ✅ 불변성 보장
  }
}
```

**Step 2: Port 인터페이스 수정**

`/Users/moon/Developments/project/prepair/backend-ts/src/application/member/ports/member-read.repository.ts`
```typescript
// ✅ Adapter 의존성 제거
import { MemberReadDto } from "@/application/member/dto/member-read.dto";

export interface MemberReadRepository {
  save(dto: MemberReadDto): void;
  findById(id: string): Promise<MemberReadDto | null>;
  findByEmail(email: string): Promise<MemberReadDto | null>;
  findAll(options?: {
    limit?: number;
    offset?: number;
  }): Promise<MemberReadDto[]>;
  withdraw(id: string): Promise<number>;
}

export const MEMBER_READ_REPOSITORY = Symbol("MemberReadRepository");
```

**Step 3: Repository 구현체에 Mapper 추가**

`/Users/moon/Developments/project/prepair/backend-ts/src/adapter/member/persistence/read/member-read.repository-impl.ts`
```typescript
import { Injectable } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/core";
import { MemberReadRepository } from "@/application/member/ports/member-read.repository";
import { MemberReadDto } from "@/application/member/dto/member-read.dto";
import { MemberReadEntity } from "./entity/member-read.entity";

@Injectable()
export class MemberReadRepositoryImpl implements MemberReadRepository {
  constructor(private readonly em: EntityManager) {}

  save(dto: MemberReadDto): void {
    const entity = this.toEntity(dto);
    this.em.persist(entity);
  }

  async findById(id: string): Promise<MemberReadDto | null> {
    const entity = await this.em.findOne(MemberReadEntity, { id });
    return entity ? this.toDto(entity) : null;
  }

  async findByEmail(email: string): Promise<MemberReadDto | null> {
    const entity = await this.em.findOne(MemberReadEntity, { email });
    return entity ? this.toDto(entity) : null;
  }

  async findAll(options?: {
    limit?: number;
    offset?: number;
  }): Promise<MemberReadDto[]> {
    const entities = await this.em.find(MemberReadEntity, {}, options);
    return entities.map((entity) => this.toDto(entity));
  }

  async withdraw(id: string): Promise<number> {
    return await this.em.nativeDelete(MemberReadEntity, { id });
  }

  // ✅ Adapter 계층 내부 Mapper 메서드
  private toDto(entity: MemberReadEntity): MemberReadDto {
    return new MemberReadDto({
      id: entity.id,
      email: entity.email,
      job: entity.job,
      nickname: entity.nickname,
      notification: entity.notification,
      frequency: entity.frequency,
      point: entity.point,
      isPro: entity.isPro,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      activity: entity.activity,
    });
  }

  private toEntity(dto: MemberReadDto): MemberReadEntity {
    const entity = new MemberReadEntity();
    entity.id = dto.id;
    entity.email = dto.email;
    entity.job = dto.job;
    entity.nickname = dto.nickname;
    entity.notification = dto.notification;
    entity.frequency = dto.frequency;
    entity.point = dto.point;
    entity.isPro = dto.isPro;
    entity.createdAt = dto.createdAt;
    entity.updatedAt = dto.updatedAt;
    entity.activity = dto.activity;
    return entity;
  }
}
```

**Step 4: QueryHandler 수정 예시**

`/Users/moon/Developments/project/prepair/backend-ts/src/application/member/query/get-member.query.ts`
```typescript
// ❌ 변경 전
import { MemberReadEntity } from "@/adapter/member/persistence/read";

export class GetMemberHandler implements IQueryHandler<GetMemberQuery, GetMemberResult> {
  async execute(query: GetMemberQuery): Promise<GetMemberResult> {
    const member: MemberReadEntity | null =  // ❌ Adapter 타입
      await this.memberReadRepository.findById(query.memberId);

    if (!member) {
      throw new NotFoundException(`Member not found: ${query.memberId}`);
    }

    return new GetMemberResult(
      member.id,
      member.email,
      member.job,
      // ...
    );
  }
}

// ✅ 변경 후
import { MemberReadDto } from "@/application/member/dto/member-read.dto";

export class GetMemberHandler implements IQueryHandler<GetMemberQuery, GetMemberResult> {
  async execute(query: GetMemberQuery): Promise<GetMemberResult> {
    const member: MemberReadDto | null =  // ✅ Application DTO
      await this.memberReadRepository.findById(query.memberId);

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
      member.activity,
    );
  }
}
```

**Step 5: EventHandler에서 EntityManager 제거**

`/Users/moon/Developments/project/prepair/backend-ts/src/application/member/event/member-register-event-handler.service.ts`
```typescript
// ❌ 변경 전
import { EntityManager } from "@mikro-orm/core";  // ❌ ORM 직접 의존
import { MemberReadEntity } from "@/adapter/member/persistence/read";  // ❌ Adapter 의존

@EventsHandler(MemberRegisterEvent)
export class MemberRegisterEventHandler {
  constructor(private readonly em: EntityManager) {}  // ❌ 인프라 직접 주입

  async handle(event: MemberRegisterEvent): Promise<void> {
    const em: EntityManager = this.em.fork();
    const readEntity = new MemberReadEntity();  // ❌ Entity 직접 생성
    readEntity.id = event.memberId;
    readEntity.email = event.email;
    // ...
    em.persist(readEntity);
    await em.flush();
  }
}

// ✅ 변경 후
import {
  MEMBER_READ_REPOSITORY,
  MemberReadRepository,
} from "@/application/member/ports/member-read.repository";
import { MemberReadDto } from "@/application/member/dto/member-read.dto";

@EventsHandler(MemberRegisterEvent)
export class MemberRegisterEventHandler {
  constructor(
    @Inject(MEMBER_READ_REPOSITORY)
    private readonly memberReadRepository: MemberReadRepository,  // ✅ Port 사용
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  async handle(event: MemberRegisterEvent): Promise<void> {
    this.logger.log("Member register event handling started", {
      module: "MemberRegisterEventHandler",
      memberId: event.memberId,
    });

    try {
      const dto = new MemberReadDto({
        id: event.memberId,
        email: event.email,
        job: event.job,
        nickname: event.nickname,
        notification: event.notification,
        frequency: event.frequency,
        point: 0,
        isPro: false,
        createdAt: event.occurredAt,
        updatedAt: event.occurredAt,
      });

      this.memberReadRepository.save(dto);  // ✅ Repository 패턴

      this.logger.log("Member register event handling completed", {
        module: "MemberRegisterEventHandler",
        memberId: event.memberId,
      });
    } catch (error) {
      this.logger.error(
        "Member register event handling failed",
        error instanceof Error ? error : undefined,
        {
          module: "MemberRegisterEventHandler",
          memberId: event.memberId,
        },
      );
      throw error;
    }
  }
}
```

**동일한 패턴으로 수정할 EventHandlers:**
- `/Users/moon/Developments/project/prepair/backend-ts/src/application/member/event/member-update-event-handler.service.ts`
- `/Users/moon/Developments/project/prepair/backend-ts/src/application/member/event/member-email-changed-event-handler.service.ts`
- `/Users/moon/Developments/project/prepair/backend-ts/src/application/member/event/member-password-reset-event-handler.service.ts`
- `/Users/moon/Developments/project/prepair/backend-ts/src/application/member/event/member-logged-in-event-handler.service.ts` (Phase 2에서 생성)

### 3.2 RefreshTokenRepository Port 수정

**현재 문제:**

`/Users/moon/Developments/project/prepair/backend-ts/src/application/auth/ports/refresh-token.repository.ts`
```typescript
// ❌ Adapter Entity 노출
import { RefreshTokenEntity } from "@/adapter/auth/persistence/entity/refresh-token.entity";

export interface RefreshTokenRepository {
  save(entity: RefreshTokenEntity): Promise<void>;  // ❌
  findByToken(token: string): Promise<RefreshTokenEntity | null>;  // ❌
  delete(id: string): Promise<void>;
  deleteByToken(token: string): Promise<void>;
  deleteByMemberId(memberId: string): Promise<void>;
}
```

**개선 방법:**

**Step 1: Application DTO 생성**

`/Users/moon/Developments/project/prepair/backend-ts/src/application/auth/dto/refresh-token.dto.ts` (신규)
```typescript
export class RefreshTokenDto {
  readonly id: string;
  readonly memberId: string;
  readonly token: string;
  readonly expiresAt: Date;
  readonly createdAt: Date;

  constructor(data: {
    id: string;
    memberId: string;
    token: string;
    expiresAt: Date;
    createdAt: Date;
  }) {
    Object.assign(this, data);
    Object.freeze(this);
  }
}
```

**Step 2: Port 수정**

`/Users/moon/Developments/project/prepair/backend-ts/src/application/auth/ports/refresh-token.repository.ts`
```typescript
import { RefreshTokenDto } from "@/application/auth/dto/refresh-token.dto";

export interface RefreshTokenRepository {
  save(dto: RefreshTokenDto): Promise<void>;
  findByToken(token: string): Promise<RefreshTokenDto | null>;
  delete(id: string): Promise<void>;
  deleteByToken(token: string): Promise<void>;
  deleteByMemberId(memberId: string): Promise<void>;
}

export const REFRESH_TOKEN_REPOSITORY = Symbol("RefreshTokenRepository");
```

**Step 3: Repository 구현체 수정**

`/Users/moon/Developments/project/prepair/backend-ts/src/adapter/auth/persistence/refresh-token.repository-impl.ts`
```typescript
import { RefreshTokenDto } from "@/application/auth/dto/refresh-token.dto";

@Injectable()
export class RefreshTokenRepositoryImpl implements RefreshTokenRepository {
  constructor(private readonly em: EntityManager) {}

  async save(dto: RefreshTokenDto): Promise<void> {
    const entity = this.toEntity(dto);
    await this.em.persistAndFlush(entity);
  }

  async findByToken(token: string): Promise<RefreshTokenDto | null> {
    const entity = await this.em.findOne(RefreshTokenEntity, { token });
    return entity ? this.toDto(entity) : null;
  }

  async delete(id: string): Promise<void> {
    await this.em.nativeDelete(RefreshTokenEntity, { id });
  }

  async deleteByToken(token: string): Promise<void> {
    await this.em.nativeDelete(RefreshTokenEntity, { token });
  }

  async deleteByMemberId(memberId: string): Promise<void> {
    await this.em.nativeDelete(RefreshTokenEntity, { memberId });
  }

  private toDto(entity: RefreshTokenEntity): RefreshTokenDto {
    return new RefreshTokenDto({
      id: entity.id,
      memberId: entity.memberId,
      token: entity.token,
      expiresAt: entity.expiresAt,
      createdAt: entity.createdAt,
    });
  }

  private toEntity(dto: RefreshTokenDto): RefreshTokenEntity {
    const entity = new RefreshTokenEntity();
    entity.id = dto.id;
    entity.memberId = dto.memberId;
    entity.token = dto.token;
    entity.expiresAt = dto.expiresAt;
    entity.createdAt = dto.createdAt;
    return entity;
  }
}
```

**Step 4: RefreshTokenService 수정**

`/Users/moon/Developments/project/prepair/backend-ts/src/application/auth/refresh-token.service.ts`
```typescript
import { RefreshTokenDto } from "@/application/auth/dto/refresh-token.dto";

@Injectable()
export class RefreshTokenService {
  async create(memberId: string): Promise<string> {
    const token = randomUUID();
    const dto = new RefreshTokenDto({
      id: randomUUID(),
      memberId,
      token,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),  // 30 days
      createdAt: new Date(),
    });

    await this.repository.save(dto);
    return token;
  }

  async verify(token: string): Promise<RefreshTokenDto> {
    const refreshToken = await this.repository.findByToken(token);

    if (!refreshToken) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    if (refreshToken.expiresAt < new Date()) {
      await this.repository.deleteByToken(token);
      throw new UnauthorizedException("Refresh token expired");
    }

    return refreshToken;
  }

  async revoke(memberId: string): Promise<void> {
    await this.repository.deleteByMemberId(memberId);
  }
}
```

---

## Phase 4: Important - Application Service Port 의존성 해소

**우선순위: Important**

### 4.1 OAuth Provider Port 생성

**현재 문제:**

`/Users/moon/Developments/project/prepair/backend-ts/src/application/oauth/kakao-auth.service.ts`
```typescript
// ❌ Adapter Service 직접 의존
import { KakaoOauthService } from "@/adapter/oauth/kakao/kakao-oauth.service";
import { JwtService } from "@/adapter/auth/security";
import {
  KakaoUserInfo,
  KakaoUserProfile,
} from "@/adapter/oauth/kakao/types/kakao-oauth.types";  // ❌ Adapter 타입

@Injectable()
export class KakaoAuthService {
  constructor(
    private readonly kakaoOAuthService: KakaoOauthService,  // ❌ 구체 타입
    private readonly jwtService: JwtService,  // ❌ 구체 타입
  ) {}

  async handleCallback(code: string) {
    const kakaoTokens =
      await this.kakaoOAuthService.exchangeCodeForAccessToken(code);
    const kakaoUser = await this.kakaoOAuthService.getUserInfo(
      kakaoTokens.access_token,
    );
    // Adapter 타입 사용
  }
}
```

**개선 방법:**

**Step 1: Port 인터페이스 정의**

`/Users/moon/Developments/project/prepair/backend-ts/src/application/oauth/ports/oauth-provider.port.ts` (신규)
```typescript
export interface OAuthTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}

export interface OAuthUserInfo {
  providerId: string;
  email: string;
  nickname: string;
  profileImage?: string;
}

export interface OAuthProvider {
  exchangeCodeForAccessToken(code: string): Promise<OAuthTokenResponse>;
  getUserInfo(accessToken: string): Promise<OAuthUserInfo>;
  unlink(accessToken: string): Promise<void>;
}

export const KAKAO_OAUTH_PROVIDER = Symbol("KakaoOAuthProvider");
```

**Step 2: Adapter 구현체 수정**

`/Users/moon/Developments/project/prepair/backend-ts/src/adapter/oauth/kakao/kakao-oauth.service.ts`
```typescript
import {
  OAuthProvider,
  OAuthTokenResponse,
  OAuthUserInfo,
} from "@/application/oauth/ports/oauth-provider.port";

@Injectable()
export class KakaoOAuthService implements OAuthProvider {
  async exchangeCodeForAccessToken(code: string): Promise<OAuthTokenResponse> {
    // Kakao API 호출
    const tokenUrl = "https://kauth.kakao.com/oauth/token";
    const response = await fetch(tokenUrl, { /* ... */ });
    const kakaoTokens = await response.json();

    // ✅ Kakao 타입 → Port 타입 변환
    return {
      accessToken: kakaoTokens.access_token,
      refreshToken: kakaoTokens.refresh_token,
      expiresIn: kakaoTokens.expires_in,
    };
  }

  async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
    const response = await fetch("https://kapi.kakao.com/v2/user/me", { /* ... */ });
    const kakaoUser = await response.json();

    // ✅ Kakao 타입 → Port 타입 변환
    return {
      providerId: String(kakaoUser.id),
      email: kakaoUser.kakao_account?.email,
      nickname: kakaoUser.kakao_account?.profile?.nickname,
      profileImage: kakaoUser.kakao_account?.profile?.profile_image_url,
    };
  }

  async unlink(accessToken: string): Promise<void> {
    await fetch("https://kapi.kakao.com/v1/user/unlink", { /* ... */ });
  }
}
```

**Step 3: Application Service 수정**

`/Users/moon/Developments/project/prepair/backend-ts/src/application/oauth/kakao-auth.service.ts`
```typescript
import {
  OAuthProvider,
  KAKAO_OAUTH_PROVIDER,
} from "@/application/oauth/ports/oauth-provider.port";

@Injectable()
export class KakaoAuthService {
  constructor(
    @Inject(KAKAO_OAUTH_PROVIDER)
    private readonly oauthProvider: OAuthProvider,  // ✅ Port 인터페이스
    // JwtService도 Port로 변경 (4.2 참고)
  ) {}

  async handleCallback(code: string) {
    // ✅ Port 타입 사용
    const tokens = await this.oauthProvider.exchangeCodeForAccessToken(code);
    const userInfo = await this.oauthProvider.getUserInfo(tokens.accessToken);

    const { providerId, email, nickname } = userInfo;  // ✅ Port 타입

    // ... 비즈니스 로직
  }
}
```

**Step 4: Module 설정**

`/Users/moon/Developments/project/prepair/backend-ts/src/adapter/oauth/oauth.module.ts`
```typescript
import { KAKAO_OAUTH_PROVIDER } from "@/application/oauth/ports/oauth-provider.port";
import { KakaoOAuthService } from "./kakao/kakao-oauth.service";

@Module({
  providers: [
    {
      provide: KAKAO_OAUTH_PROVIDER,
      useClass: KakaoOAuthService,
    },
    // ...
  ],
  exports: [KAKAO_OAUTH_PROVIDER],
})
export class OAuthModule {}
```

### 4.2 JWT Service Port 생성

**Step 1: Port 정의**

`/Users/moon/Developments/project/prepair/backend-ts/src/application/auth/ports/jwt.port.ts` (신규)
```typescript
export interface JwtToken {
  token: string;
  expiresIn: number;
}

export interface JwtPayload {
  sub: string;  // memberId
  email: string;
  iat?: number;
  exp?: number;
}

export interface JwtPort {
  generateAccessToken(memberId: string, email: string): JwtToken;
  verifyToken(token: string): JwtPayload;
}

export const JWT_SERVICE = Symbol("JwtService");
```

**Step 2: Adapter 구현**

`/Users/moon/Developments/project/prepair/backend-ts/src/adapter/auth/security/jwt.service.ts`
```typescript
import { JwtPort, JwtToken, JwtPayload } from "@/application/auth/ports/jwt.port";
import { JwtService as NestJwtService } from "@nestjs/jwt";

@Injectable()
export class JwtService implements JwtPort {
  constructor(
    private readonly jwtService: NestJwtService,
    private readonly configService: ConfigService,
  ) {}

  generateAccessToken(memberId: string, email: string): JwtToken {
    const payload = { sub: memberId, email };
    const token = this.jwtService.sign(payload, {
      secret: this.configService.get("JWT_SECRET"),
      expiresIn: "1h",
    });

    return {
      token,
      expiresIn: 3600,
    };
  }

  verifyToken(token: string): JwtPayload {
    try {
      return this.jwtService.verify(token, {
        secret: this.configService.get("JWT_SECRET"),
      });
    } catch (error) {
      throw new UnauthorizedException("Invalid token");
    }
  }
}
```

**Step 3: Module 설정**

`/Users/moon/Developments/project/prepair/backend-ts/src/adapter/auth/auth.module.ts`
```typescript
import { JWT_SERVICE } from "@/application/auth/ports/jwt.port";
import { JwtService } from "./security/jwt.service";

@Module({
  providers: [
    {
      provide: JWT_SERVICE,
      useClass: JwtService,
    },
    // ...
  ],
  exports: [JWT_SERVICE],
})
export class AuthModule {}
```

---

## Phase 5: Enhancement - Logger Port 재배치

**우선순위: Medium**

### 배경
Logger 인터페이스가 Adapter 계층(`@/adapter/shared/logger/logger.inferface`)에 정의되어 있어 Application 계층이 Adapter에 의존하는 상황입니다.

**현재 문제:**

모든 Application 파일에서 (28개):
```typescript
// ❌ Adapter 계층의 Logger 인터페이스 import
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";
```

**개선 방법:**

**Step 1: Port를 Application 계층으로 이동**

`/Users/moon/Developments/project/prepair/backend-ts/src/application/shared/ports/logger.port.ts` (신규)
```typescript
export interface LogContext {
  module?: string;
  correlationId?: string;
  [key: string]: any;
}

export interface ILogger {
  log(message: string, context?: LogContext): void;
  error(message: string, error?: Error, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  debug(message: string, context?: LogContext): void;
}

export const LOGGER = Symbol("LOGGER");
```

**Step 2: 기존 Adapter 인터페이스 제거**

`/Users/moon/Developments/project/prepair/backend-ts/src/adapter/shared/logger/logger.inferface.ts` 삭제

**Step 3: Logger 구현체 수정**

`/Users/moon/Developments/project/prepair/backend-ts/src/adapter/shared/logger/winston.logger.ts`
```typescript
import { Injectable } from "@nestjs/common";
import { ILogger, LogContext } from "@/application/shared/ports/logger.port";

@Injectable()
export class WinstonLogger implements ILogger {
  // ... 구현은 동일
}
```

**Step 4: 일괄 import 경로 변경**

```bash
# 모든 Application 파일에서 import 경로 변경
find src/application -type f -name "*.ts" -exec sed -i '' \
  's|@/adapter/shared/logger/logger.inferface|@/application/shared/ports/logger.port|g' {} +
```

**영향받는 파일 (28개):**
- 모든 CommandHandlers (8개)
- 모든 QueryHandlers (2개)
- 모든 EventHandlers (7개)
- AuthService, KakaoAuthService, RefreshTokenService 등 (11개)

---

## Phase 6: Optional - Domain Event 프레임워크 독립

**우선순위: Low** (마커 인터페이스이므로 실질적 영향 미미)

### 배경
Domain Events가 `@nestjs/cqrs`의 `IEvent` 인터페이스를 구현하여 이론적으로 Domain 계층이 프레임워크에 의존합니다.

**현재 상황:**

`/Users/moon/Developments/project/prepair/backend-ts/src/domain/member/events/member-register.event.ts`
```typescript
import { IEvent } from "@nestjs/cqrs";  // ⚠️ NestJS 의존

export class MemberRegisterEvent implements IEvent {
  constructor(
    public readonly memberId: string,
    public readonly email: string,
    // ...
  ) {}
}
```

**동일 패턴 파일:**
- `member-password-reset.event.ts`
- `member-email-changed.event.ts`
- `member-withdraw.event.ts`
- `member-password-changed.event.ts`
- `member-update.event.ts`

**개선 방법 (선택적):**

Phase 1에서 정의한 `IDomainEvent` 사용:

```typescript
// ✅ src/domain/member/events/member-register.event.ts
import { IDomainEvent } from "@/domain/shared/domain-event";

export class MemberRegisterEvent implements IDomainEvent {
  readonly aggregateId: string;
  readonly eventType = "MemberRegistered";

  constructor(
    public readonly memberId: string,
    public readonly email: string,
    // ...
    public readonly occurredAt: Date = new Date(),
  ) {
    this.aggregateId = memberId;
  }
}
```

**평가:**
- 이 변경은 선택적이며, `IEvent`는 빈 마커 인터페이스이므로 실질적 문제 없음
- Domain 이론적 순수성을 위해서만 필요
- 프로젝트 우선순위에 따라 결정

---

## Phase 7: Enhancement - Repository 인터페이스 일관성 개선

**우선순위: Low-Medium**

### 배경
Repository 메서드 시그니처가 일관성이 없습니다.

**현재 문제:**

`/Users/moon/Developments/project/prepair/backend-ts/src/domain/member/member.repository.ts`
```typescript
export interface MemberRepository {
  register(member: Member): Member;  // ❌ Member 반환 (불필요)
  withdraw(memberId: string): void;  // ❌ 동기 메서드 (다른 건 비동기)
  update(member: Member): Member;  // ❌ Member 반환 (불필요)
  findById(id: string): Promise<Member | null>;  // ✅ 일관성 있음
  findByEmail(email: string): Promise<Member | null>;  // ✅ 일관성 있음
}
```

**개선 방법:**

```typescript
export interface MemberRepository {
  save(member: Member): Promise<void>;  // ✅ register/update 통합
  delete(memberId: string): Promise<void>;  // ✅ 비동기로 변경
  findById(id: string): Promise<Member | null>;
  findByEmail(email: string): Promise<Member | null>;
}

export const MEMBER_REPOSITORY = Symbol("MemberRepository");
```

**효과:**
- Repository 패턴 표준 준수 (write 메서드는 void 반환)
- 메서드 시그니처 일관성 확보
- Aggregate 저장/삭제가 부수효과임을 명확히 표현

---

## Phase 8: Minor - Value Object 불변성 강화

**우선순위: Low**

### 배경
`VerificationCode` Value Object가 Date 객체를 직접 반환하여 외부에서 변경 가능합니다.

**현재 문제:**

`/Users/moon/Developments/project/prepair/backend-ts/src/domain/member/value-objects/verification-code.ts`
```typescript
export class VerificationCode {
  private readonly _expiresAt: Date;

  public get expiresAt(): Date {
    return this._expiresAt;  // ❌ mutable Date 객체 직접 반환
  }
}

// 외부에서 변경 가능:
const code = VerificationCode.generate();
code.expiresAt.setFullYear(2099);  // ❌ 불변성 위반
```

**개선 방법:**

```typescript
export class VerificationCode {
  private readonly _expiresAt: Date;

  public get expiresAt(): Date {
    return new Date(this._expiresAt.getTime());  // ✅ Defensive copy
  }

  // 또는 불변 문자열로 반환
  public get expiresAtIso(): string {
    return this._expiresAt.toISOString();
  }
}
```

---

## 📂 체크리스트

### Phase 1: Aggregate 이벤트 패턴 (Critical)

- [ ] `src/domain/shared/domain-event.ts`에 `IDomainEvent`, `DomainEvent` 정의
- [ ] `src/domain/member/member.ts`에 `_domainEvents` 배열 추가
- [ ] `Member.register()` 메서드에 이벤트 생성 로직 추가
- [ ] `Member.changePassword()` 메서드에 이벤트 생성 로직 추가
- [ ] `Member.withdraw()` 메서드에 이벤트 생성 로직 추가
- [ ] `Member.update()` 메서드에 이벤트 생성 로직 추가
- [ ] `Member.changeEmail()` 메서드에 이벤트 생성 로직 추가
- [ ] `Member.resetPassword()` 메서드에 이벤트 생성 로직 추가
- [ ] `Member.getDomainEvents()`, `clearDomainEvents()` 메서드 추가
- [ ] `src/domain/oauth/oauth.ts`에 동일 패턴 적용
- [ ] 모든 CommandHandler에서 Aggregate 이벤트 수집 로직으로 변경

### Phase 2: CQRS Aggregate 경계 (Critical)

- [ ] `src/domain/member/events/member-logged-in.event.ts` 생성
- [ ] `src/application/member/event/member-logged-in-event-handler.service.ts` 생성
- [ ] `AuthService.login()`에서 Read Model 직접 수정 제거 (line 63-74)
- [ ] `KakaoAuthService.loginExistingMember()`에서 Read Model 직접 수정 제거
- [ ] `KakaoAuthService.updateActivityLog()` 메서드 완전 제거 (line 249-260)
- [ ] `MemberModule`에 `MemberLoggedInEventHandler` 등록

### Phase 3: Port 인터페이스 순수화 (Critical)

**MemberReadRepository:**
- [ ] `src/application/member/dto/member-read.dto.ts` 생성
- [ ] `MemberReadRepository` Port 인터페이스에서 `MemberReadEntity` 제거
- [ ] `MemberReadRepositoryImpl`에 `toDto()`, `toEntity()` Mapper 추가
- [ ] `GetMemberHandler`에서 `MemberReadDto` 사용 (9개 파일)
- [ ] 모든 `EventHandler`에서 `EntityManager` 제거, `MemberReadRepository` 사용 (6개 파일)

**RefreshTokenRepository:**
- [ ] `src/application/auth/dto/refresh-token.dto.ts` 생성
- [ ] `RefreshTokenRepository` Port 인터페이스에서 `RefreshTokenEntity` 제거
- [ ] `RefreshTokenRepositoryImpl`에 `toDto()`, `toEntity()` Mapper 추가
- [ ] `RefreshTokenService`에서 `RefreshTokenDto` 사용

### Phase 4: Application Service Port (Important)

- [ ] `src/application/oauth/ports/oauth-provider.port.ts` 생성
- [ ] `KakaoOAuthService`를 `OAuthProvider` 구현으로 수정
- [ ] `KakaoAuthService`에서 Port 인터페이스 사용
- [ ] `OAuthModule`에 DI 설정
- [ ] `src/application/auth/ports/jwt.port.ts` 생성
- [ ] `JwtService`를 `JwtPort` 구현으로 수정
- [ ] `AuthModule`에 DI 설정

### Phase 5: Logger Port 재배치 (Medium)

- [ ] `src/application/shared/ports/logger.port.ts` 생성
- [ ] `src/adapter/shared/logger/logger.inferface.ts` 삭제
- [ ] `WinstonLogger`에서 새로운 Port import
- [ ] 모든 Application 파일 import 경로 변경 (28개)

### Phase 6: Domain Event 프레임워크 독립 (Optional)

- [ ] 6개 도메인 이벤트에서 `IEvent` 제거
- [ ] `IDomainEvent` 구현으로 변경
- [ ] (선택) Integration Event Wrapper 패턴 도입

### Phase 7: Repository 일관성 (Low-Medium)

- [ ] `MemberRepository.register()` → `save()`로 변경, `Promise<void>` 반환
- [ ] `MemberRepository.update()` → `save()`로 통합
- [ ] `MemberRepository.withdraw()` → `delete()`로 변경, `Promise<void>` 반환

### Phase 8: Value Object 불변성 (Low)

- [ ] `VerificationCode.expiresAt` getter에 Defensive copy 추가

---

## 📈 예상 효과

### 헥사고날 아키텍처 준수도

**현재: 70/100 → 개선 후: 95/100**

- ✅ Application → Adapter 역방향 의존성 완전 제거
- ✅ Port 인터페이스가 Adapter 타입 미노출
- ✅ Domain 계층 완전한 프레임워크 독립

### DDD 패턴 준수도

**현재: 75/100 → 개선 후: 95/100**

- ✅ Aggregate가 도메인 이벤트 생성 (비즈니스 로직 응집)
- ✅ Aggregate 경계 명확화 (Read Model 직접 수정 제거)
- ✅ Repository 패턴 일관성 확보
- ✅ CQRS 패턴 엄격한 준수

### 테스트 용이성

**Before:**
```typescript
// Adapter Entity 모킹 필요
const mockEntity = new MemberReadEntity();
mockEntity.id = "...";
// ORM 의존성
```

**After:**
```typescript
// Application DTO만 모킹
const mockDto = new MemberReadDto({
  id: "...",
  email: "...",
  // ...
});
```

### 유연성

- ORM 교체 시 Adapter만 수정 (Application/Domain 무영향)
- 이벤트 버스 교체 시 Integration Event만 수정
- Logger 구현 교체 시 Adapter만 수정

---

## 🔗 참고 문서

- `CLAUDE.md` - 프로젝트 아키텍처 개요
- `docs/oauth-guide.md` - OAuth 구현 가이드
- `docs/authentication-implementation-guide.md` - 인증 구현 가이드
- `docs/password-reset-implementation.md` - 비밀번호 재설정 가이드

---

**분석 수행일:** 2026-01-21
**분석 도구:**
- DDD Pattern Reviewer Agent
- Hexagonal Architecture Auditor Agent
- Gemini Code Analysis Agent

**작성자:** Claude Code Architecture Analysis Team
