# 헥사고날 아키텍처 개선 사항

> **헥사고날 아키텍처 준수도: 70/100**
>
> 이 문서는 실제 코드 분석을 통해 발견된 헥사고날 아키텍처 위반 사항과 개선 방법을 정리합니다.
>
> **분석 기준일:** 2026-01-21
> **분석 도구:** DDD Pattern Reviewer, Hexagonal Architecture Auditor, Gemini Code Analysis

---

## 📊 Executive Summary

### 주요 강점

**헥사고날 아키텍처:**
- ✅ Domain 계층이 인프라스트럭처로부터 완전히 격리됨 (MikroORM, NestJS 의존성 없음)
- ✅ Symbol 기반 의존성 역전 원칙(DIP) 체계적 구현
- ✅ Mapper 패턴을 통한 Domain ↔ Persistence 명확한 분리
- ✅ CQRS Read/Write Model 분리 우수

**DDD 패턴:**
- ✅ Value Objects(Email, Password) 검증 로직 캡슐화 우수
- ✅ Aggregate Root(Member, OAuthConnection) 명확한 일관성 경계
- ✅ Repository 인터페이스가 Domain 계층에 올바르게 위치
- ✅ Factory Method 패턴(Member.register(), Member.of()) 적절한 사용

### 치명적 위반 사항

**헥사고날 아키텍처 위반 (Critical):**

1. ❌ **Application → Adapter 역방향 의존성** (28개 파일)
   - Port 인터페이스가 Adapter Entity 타입 노출 (`MemberReadEntity`, `RefreshTokenEntity`)
   - Application Service가 Adapter 구체 타입 직접 의존 (`KakaoOauthService`, `JwtService`)
   - EventHandler가 `EntityManager` 직접 사용

2. ❌ **Logger Port가 Adapter에 위치** (28개 파일 영향)
   - `@/adapter/shared/logger/logger.inferface`를 Application에서 import

**DDD 패턴 위반 (Critical):**

3. ❌ **Aggregate 경계 위반 - Read Model 직접 수정** (2개 파일)
   - `AuthService.login()` (line 63-74)에서 MemberReadEntity.activity 직접 수정
   - `KakaoAuthService.handleCallback()` (line 249-260)에서 동일
   - CQRS 원칙 위반 (Read Model은 EventHandler를 통해서만 업데이트)

**기타 중요 위반 (Major):**

4. ❌ **Repository 인터페이스 일관성 문제**
   - `register()/update()`가 Member 반환 (void여야 함)
   - `withdraw()`만 동기 메서드 (비일관성)

5. ❌ **Value Object 불변성 문제**
   - `VerificationCode.expiresAt`이 mutable Date 객체 직접 반환

---

## 🎯 개선 우선순위

## Phase 1: Critical - CQRS Aggregate 경계 위반 수정

**우선순위: 최우선**

### 배경
`AuthService.login()`과 `KakaoAuthService.handleCallback()`에서 Read Model(MemberReadEntity)을 직접 수정하여 CQRS 패턴을 위반하고 있습니다. Read Model은 EventHandler를 통해서만 업데이트되어야 합니다.

### 1.1 로그인 활동 로그를 이벤트 기반으로 변경

**현재 문제:**

**파일: `/Users/moon/Developments/project/prepair/backend-ts/src/application/auth/auth.service.ts` (Line 63-74)**
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

**파일: `/Users/moon/Developments/project/prepair/backend-ts/src/application/oauth/kakao-auth.service.ts` (Line 249-260)**
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

`/Users/moon/Developments/project/prepair/backend-ts/src/domain/member/events/member-logged-in.event.ts` **(신규)**
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

`/Users/moon/Developments/project/prepair/backend-ts/src/application/member/event/member-logged-in-event-handler.service.ts` **(신규)**
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
      // Read Model 조회
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

  // ❌ updateActivityLog() 메서드 완전 제거 (line 249-260)
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
  providers: [
    ...CommandHandlers,
    ...QueryHandlers,
    ...EventHandlers,
    // ...
  ],
})
export class MemberModule {}
```

**수정 파일 목록:**
- ✏️ `/Users/moon/Developments/project/prepair/backend-ts/src/application/auth/auth.service.ts` (line 63-74 제거)
- ✏️ `/Users/moon/Developments/project/prepair/backend-ts/src/application/oauth/kakao-auth.service.ts` (line 249-260 제거)
- ➕ `/Users/moon/Developments/project/prepair/backend-ts/src/domain/member/events/member-logged-in.event.ts`
- ➕ `/Users/moon/Developments/project/prepair/backend-ts/src/application/member/event/member-logged-in-event-handler.service.ts`
- ✏️ `/Users/moon/Developments/project/prepair/backend-ts/src/adapter/member/member.module.ts`

**효과:**
- ✅ CQRS 패턴 준수 (Read Model은 EventHandler를 통해서만 업데이트)
- ✅ Aggregate 경계 명확화
- ✅ 로그인 활동 이력이 Event Store에 기록됨 (감사 추적 가능)

---

## Phase 2: Critical - Port 인터페이스 순수화

**우선순위: Critical**

### 2.1 MemberReadRepository Port를 Application DTO로 변경

**현재 문제:**

**파일: `/Users/moon/Developments/project/prepair/backend-ts/src/application/member/ports/member-read.repository.ts`**
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

**영향받는 파일 (9개):**
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

`/Users/moon/Developments/project/prepair/backend-ts/src/application/member/dto/member-read.dto.ts` **(신규)**
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
    const member: MemberReadEntity | null =
      await this.memberReadRepository.findById(query.memberId);
    // ...
  }
}

// ✅ 변경 후
import { MemberReadDto } from "@/application/member/dto/member-read.dto";

export class GetMemberHandler implements IQueryHandler<GetMemberQuery, GetMemberResult> {
  async execute(query: GetMemberQuery): Promise<GetMemberResult> {
    const member: MemberReadDto | null =
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
import { EntityManager } from "@mikro-orm/core";
import { MemberReadEntity } from "@/adapter/member/persistence/read";

@EventsHandler(MemberRegisterEvent)
export class MemberRegisterEventHandler {
  constructor(private readonly em: EntityManager) {}

  async handle(event: MemberRegisterEvent): Promise<void> {
    const em: EntityManager = this.em.fork();
    const readEntity = new MemberReadEntity();
    readEntity.id = event.memberId;
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
    private readonly memberReadRepository: MemberReadRepository,
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

      this.memberReadRepository.save(dto);

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

**동일한 패턴으로 수정할 파일들:**

#### MemberUpdateEventHandler

`/Users/moon/Developments/project/prepair/backend-ts/src/application/member/event/member-update-event-handler.service.ts`

```typescript
// ❌ 변경 전
import { MemberReadEntity } from "@/adapter/member/persistence/read";
import { EntityManager } from "@mikro-orm/postgresql";

@EventsHandler(MemberUpdateEvent)
export class MemberUpdateEventHandler {
  constructor(
    private readonly em: EntityManager,  // ❌ EntityManager 직접 사용
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  async handle(event: MemberUpdateEvent) {
    const em: EntityManager = this.em.fork();
    const entity: MemberReadEntity | null = await em.findOne(MemberReadEntity, { id: event.memberId });
    // ❌ Entity 직접 수정
    entity.email = event.email;
    entity.job = event.job;
    // ...
    await em.flush();
  }
}

// ✅ 변경 후
import {
  MEMBER_READ_REPOSITORY,
  MemberReadDto,
  type MemberReadRepository,
} from "@/application/member/ports";

@EventsHandler(MemberUpdateEvent)
export class MemberUpdateEventHandler {
  constructor(
    @Inject(MEMBER_READ_REPOSITORY)
    private readonly memberReadRepository: MemberReadRepository,  // ✅ Repository Port 사용
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  async handle(event: MemberUpdateEvent) {
    const existingDto = await this.memberReadRepository.findById(event.memberId);

    if (!existingDto) {
      this.logger.warn("Member read entity not found", {
        module: "MemberUpdateEventHandler",
        memberId: event.memberId,
      });
      return;
    }

    // ✅ 새로운 DTO 생성하여 Repository에 저장
    const updatedDto = new MemberReadDto({
      id: existingDto.id,
      email: event.email,
      job: event.job,
      nickname: event.nickname,
      notification: event.notification,
      frequency: event.frequency,
      point: event.point,
      isPro: event.isPro,
      createdAt: existingDto.createdAt,
      updatedAt: event.occurredAt,
      activity: existingDto.activity,
    });

    this.memberReadRepository.save(updatedDto);
  }
}
```

#### MemberEmailChangedEventHandler

`/Users/moon/Developments/project/prepair/backend-ts/src/application/member/event/member-email-changed-event-handler.service.ts`

```typescript
// ❌ 변경 전
import { MemberReadEntity } from "@/adapter/member/persistence/read";
import { EntityManager } from "@mikro-orm/postgresql";

@EventsHandler(MemberEmailChangedEvent)
export class MemberEmailChangedEventHandler {
  constructor(
    private readonly em: EntityManager,
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  async handle(event: MemberEmailChangedEvent) {
    const em: EntityManager = this.em.fork();
    const entity: MemberReadEntity | null = await em.findOne(MemberReadEntity, { id: event.memberId });
    entity.email = event.newEmail;  // ❌ Entity 직접 수정
    entity.updatedAt = event.occurredAt;
    await em.flush();
  }
}

// ✅ 변경 후
import {
  MEMBER_READ_REPOSITORY,
  MemberReadDto,
  type MemberReadRepository,
} from "@/application/member/ports";

@EventsHandler(MemberEmailChangedEvent)
export class MemberEmailChangedEventHandler {
  constructor(
    @Inject(MEMBER_READ_REPOSITORY)
    private readonly memberReadRepository: MemberReadRepository,
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  async handle(event: MemberEmailChangedEvent) {
    const existingDto = await this.memberReadRepository.findById(event.memberId);

    if (!existingDto) {
      this.logger.warn("Member read entity not found", {
        module: "MemberEmailChangedEventHandler",
        memberId: event.memberId,
      });
      return;
    }

    // ✅ 이메일만 변경된 새 DTO 생성
    const updatedDto = new MemberReadDto({
      ...existingDto,  // 기존 값 복사
      email: event.newEmail,  // 이메일만 변경
      updatedAt: event.occurredAt,
    });

    this.memberReadRepository.save(updatedDto);
  }
}
```

#### MemberPasswordResetEventHandler

`/Users/moon/Developments/project/prepair/backend-ts/src/application/member/event/member-password-reset-event-handler.service.ts`

```typescript
// ❌ 변경 전
import { MemberReadEntity } from "@/adapter/member/persistence/read";
import { EntityManager } from "@mikro-orm/postgresql";

@EventsHandler(MemberPasswordResetEvent)
export class MemberPasswordResetEventHandler {
  constructor(
    private readonly em: EntityManager,
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  async handle(event: MemberPasswordResetEvent) {
    const em: EntityManager = this.em.fork();
    const entity: MemberReadEntity | null = await em.findOne(MemberReadEntity, { id: event.memberId });
    entity.updatedAt = event.occurredAt;  // ❌ Entity 직접 수정
    await em.flush();
  }
}

// ✅ 변경 후
import {
  MEMBER_READ_REPOSITORY,
  MemberReadDto,
  type MemberReadRepository,
} from "@/application/member/ports";

@EventsHandler(MemberPasswordResetEvent)
export class MemberPasswordResetEventHandler {
  constructor(
    @Inject(MEMBER_READ_REPOSITORY)
    private readonly memberReadRepository: MemberReadRepository,
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  async handle(event: MemberPasswordResetEvent) {
    const existingDto = await this.memberReadRepository.findById(event.memberId);

    if (!existingDto) {
      this.logger.warn("Member read entity not found", {
        module: "MemberPasswordResetEventHandler",
        memberId: event.memberId,
      });
      return;
    }

    // ✅ updatedAt만 변경된 새 DTO 생성
    const updatedDto = new MemberReadDto({
      ...existingDto,
      updatedAt: event.occurredAt,
    });

    this.memberReadRepository.save(updatedDto);
  }
}
```

**공통 수정 패턴 요약:**

| 항목 | 변경 전 | 변경 후 |
|------|---------|---------|
| 의존성 | `EntityManager` | `MemberReadRepository` (Port) |
| 타입 | `MemberReadEntity` (Adapter) | `MemberReadDto` (Application) |
| 조회 | `em.findOne(MemberReadEntity, ...)` | `memberReadRepository.findById(...)` |
| 수정 | Entity 프로퍼티 직접 변경 | 새로운 불변 DTO 생성 |
| 저장 | `em.flush()` | `memberReadRepository.save(dto)` |

### 2.2 RefreshTokenRepository Port 수정

**현재 문제:**

**파일: `/Users/moon/Developments/project/prepair/backend-ts/src/application/auth/ports/refresh-token.repository.ts`**
```typescript
// ❌ Adapter Entity 노출
import { RefreshTokenEntity } from "@/adapter/auth/persistence/entity/refresh-token.entity";

export interface RefreshTokenRepository {
  save(entity: RefreshTokenEntity): Promise<void>;
  findByToken(token: string): Promise<RefreshTokenEntity | null>;
  delete(id: string): Promise<void>;
  deleteByToken(token: string): Promise<void>;
  deleteByMemberId(memberId: string): Promise<void>;
}
```

**개선 방법:**

**Step 1: Application DTO 생성**

`/Users/moon/Developments/project/prepair/backend-ts/src/application/auth/dto/refresh-token.dto.ts` **(신규)**
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
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
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

## Phase 3: Important - Application Service Port 의존성 해소

**우선순위: Important**

### 3.1 OAuth Provider Port 생성

**현재 문제:**

**파일: `/Users/moon/Developments/project/prepair/backend-ts/src/application/oauth/kakao-auth.service.ts`**
```typescript
// ❌ Adapter Service 직접 의존
import { KakaoOauthService } from "@/adapter/oauth/kakao/kakao-oauth.service";
import { JwtService } from "@/adapter/auth/security";
import {
  KakaoUserInfo,
  KakaoUserProfile,
} from "@/adapter/oauth/kakao/types/kakao-oauth.types";

@Injectable()
export class KakaoAuthService {
  constructor(
    private readonly kakaoOAuthService: KakaoOauthService,  // ❌ 구체 타입
    private readonly jwtService: JwtService,  // ❌ 구체 타입
  ) {}
}
```

**개선 방법:**

**Step 1: Port 인터페이스 정의**

`/Users/moon/Developments/project/prepair/backend-ts/src/application/oauth/ports/oauth-provider.port.ts` **(신규)**
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
    // JwtService도 Port로 변경 (3.2 참고)
  ) {}

  async handleCallback(code: string) {
    // ✅ Port 타입 사용
    const tokens = await this.oauthProvider.exchangeCodeForAccessToken(code);
    const userInfo = await this.oauthProvider.getUserInfo(tokens.accessToken);

    const { providerId, email, nickname } = userInfo;
    // ...
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

### 3.2 JWT Service Port 생성

**Step 1: Port 정의**

`/Users/moon/Developments/project/prepair/backend-ts/src/application/auth/ports/jwt.port.ts` **(신규)**
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

## Phase 4: Medium - Logger Port 재배치

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

`/Users/moon/Developments/project/prepair/backend-ts/src/application/shared/ports/logger.port.ts` **(신규)**
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

## Phase 5: Low-Medium - Repository 인터페이스 일관성 개선

**우선순위: Low-Medium**

### 배경
Repository 메서드 시그니처가 일관성이 없습니다.

**현재 문제:**

**파일: `/Users/moon/Developments/project/prepair/backend-ts/src/domain/member/member.repository.ts`**
```typescript
export interface MemberRepository {
  register(member: Member): Member;  // ❌ Member 반환 (불필요)
  withdraw(memberId: string): void;  // ❌ 동기 메서드 (다른 건 비동기)
  update(member: Member): Member;  // ❌ Member 반환 (불필요)
  findById(id: string): Promise<Member | null>;
  findByEmail(email: string): Promise<Member | null>;
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

## Phase 6: Low - Value Object 불변성 강화

**우선순위: Low**

### 배경
`VerificationCode` Value Object가 Date 객체를 직접 반환하여 외부에서 변경 가능합니다.

**현재 문제:**

**파일: `/Users/moon/Developments/project/prepair/backend-ts/src/domain/member/value-objects/verification-code.ts`**
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

### Phase 1: CQRS Aggregate 경계 (Critical)

- [ ] `src/domain/member/events/member-logged-in.event.ts` 생성
- [ ] `src/application/member/event/member-logged-in-event-handler.service.ts` 생성
- [ ] `AuthService.login()`에서 Read Model 직접 수정 제거 (line 63-74)
- [ ] `AuthService`에 `EventBus` 주입 추가
- [ ] `KakaoAuthService.loginExistingMember()`에서 Read Model 직접 수정 제거
- [ ] `KakaoAuthService.updateActivityLog()` 메서드 완전 제거 (line 249-260)
- [ ] `KakaoAuthService`에 `EventBus` 주입 추가
- [ ] `MemberModule`에 `MemberLoggedInEventHandler` 등록

### Phase 2: Port 인터페이스 순수화 (Critical)

**MemberReadRepository:**
- [ ] `src/application/member/dto/member-read.dto.ts` 생성
- [ ] `MemberReadRepository` Port 인터페이스에서 `MemberReadEntity` import 제거
- [ ] `MemberReadRepository` 메서드 시그니처를 `MemberReadDto` 반환으로 변경
- [ ] `MemberReadRepositoryImpl`에 `toDto()`, `toEntity()` Mapper 추가
- [ ] `GetMemberHandler`에서 `MemberReadDto` 사용
- [ ] `GetMemberEmailQueryHandler`에서 `MemberReadDto` 사용
- [ ] 모든 `EventHandler`에서 `EntityManager` 제거, `MemberReadRepository` 사용 (6개)

**RefreshTokenRepository:**
- [ ] `src/application/auth/dto/refresh-token.dto.ts` 생성
- [ ] `RefreshTokenRepository` Port 인터페이스에서 `RefreshTokenEntity` 제거
- [ ] `RefreshTokenRepositoryImpl`에 `toDto()`, `toEntity()` Mapper 추가
- [ ] `RefreshTokenService`에서 `RefreshTokenDto` 사용

### Phase 3: Application Service Port (Important)

**OAuth Provider:**
- [ ] `src/application/oauth/ports/oauth-provider.port.ts` 생성
- [ ] `KakaoOAuthService`를 `OAuthProvider` 구현으로 수정
- [ ] `KakaoAuthService`에서 Port 인터페이스 사용
- [ ] `OAuthModule`에 DI 설정

**JWT Service:**
- [ ] `src/application/auth/ports/jwt.port.ts` 생성
- [ ] `JwtService`를 `JwtPort` 구현으로 수정
- [ ] `AuthModule`에 DI 설정

### Phase 4: Logger Port 재배치 (Medium)

- [ ] `src/application/shared/ports/logger.port.ts` 생성
- [ ] `src/adapter/shared/logger/logger.inferface.ts` 삭제
- [ ] `WinstonLogger`에서 새로운 Port import
- [ ] 모든 Application 파일 import 경로 변경 (28개)

### Phase 5: Repository 일관성 (Low-Medium)

- [ ] `MemberRepository.register()` → `save()`로 변경, `Promise<void>` 반환
- [ ] `MemberRepository.update()` → `save()`로 통합
- [ ] `MemberRepository.withdraw()` → `delete()`로 변경, `Promise<void>` 반환
- [ ] `MemberRepositoryImpl` 구현 변경

### Phase 6: Value Object 불변성 (Low)

- [ ] `VerificationCode.expiresAt` getter에 Defensive copy 추가

---

## 📈 예상 효과

### 헥사고날 아키텍처 준수도

**현재: 70/100 → 개선 후: 92/100**

- ✅ Application → Adapter 역방향 의존성 완전 제거
- ✅ Port 인터페이스가 Adapter 타입 미노출
- ✅ Logger Port가 Application 계층으로 이동

### 테스트 용이성

**Before:**
```typescript
// Adapter Entity 모킹 필요
const mockEntity = new MemberReadEntity();
mockEntity.id = "...";
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
- OAuth Provider 교체 시 Adapter만 수정
- Logger 구현 교체 시 Adapter만 수정

---

## 🔗 참고 문서

- `CLAUDE.md` - 프로젝트 아키텍처 개요
- `docs/oauth-guide.md` - OAuth 구현 가이드
- `docs/authentication-implementation-guide.md` - 인증 구현 가이드
- `docs/password-reset-implementation.md` - 비밀번호 재설정 가이드

---

**마지막 업데이트:** 2026-01-21
**작성자:** Claude Code (Hexagonal Architecture Auditor)
