# 이메일 변경 기능 구현 가이드

## 개요

DDD + CQRS 패턴을 유지하면서 이메일 변경 기능을 구현합니다.

**주요 특징:**
- 새 이메일로 인증 코드 발송 (nodemailer)
- 메모리 기반 인증 코드 저장 (간단한 구현)
- 2단계 프로세스: 요청 → 검증
- 유효 시간: 5분

---

## 아키텍처 설계

### 1. API 엔드포인트

```
POST   /members/:id/email/request    # 이메일 변경 요청 (인증 코드 발송)
POST   /members/:id/email/verify     # 인증 코드 검증 및 이메일 변경
```

### 2. 플로우

**Step 1: 이메일 변경 요청**
```
FE → POST /members/:id/email/request { newEmail: "new@example.com" }
  → RequestChangeEmailCommand 실행
  → Member.requestEmailChange() 도메인 로직
  → 인증 코드 생성 (6자리 숫자)
  → 메모리에 저장 (Map)
  → 이메일 발송
  → 응답: { success: true }
```

**Step 2: 인증 코드 검증**
```
FE → POST /members/:id/email/verify { code: "123456" }
  → VerifyChangeEmailCommand 실행
  → 메모리에서 인증 코드 조회
  → 코드 일치 & 만료 시간 확인
  → Member.changeEmail() 도메인 로직
  → Write Model 업데이트
  → EventStore 기록
  → MemberEmailChangedEvent 발행
  → Read Model 업데이트 (이벤트 핸들러)
  → 응답: { success: true, email: "new@example.com" }
```

---

## 구현 파일 목록

### Domain Layer
```
src/domain/member/
├── member.ts                           # changeEmail() 메서드 구현
├── value-objects/
│   └── verification-code.ts            # [NEW] 인증 코드 VO
├── events/
│   └── member-email-changed.event.ts   # [NEW] 도메인 이벤트
└── exceptions/
    ├── invalid-verification-code.exception.ts  # [NEW]
    └── email-already-exists.exception.ts       # [NEW]
```

### Application Layer
```
src/application/member/
├── command/
│   ├── request-change-email.command.ts         # [NEW] 요청 Command
│   └── verify-change-email.command.ts          # [NEW] 검증 Command
├── event/
│   └── member-email-changed-event-handler.service.ts  # [NEW]
└── service/
    ├── email-verification.service.ts           # [NEW] 인증 코드 관리
    └── email.service.ts                        # [NEW] 이메일 발송
```

### Adapter Layer
```
src/adapter/member/
├── api/
│   ├── member.controller.ts            # [MODIFY] 엔드포인트 추가
│   └── dto/
│       ├── request-change-email.dto.ts # [NEW]
│       └── verify-change-email.dto.ts  # [NEW]
├── email/                              # [NEW] 이메일 모듈
│   ├── email.module.ts
│   ├── nodemailer.service.ts
│   └── templates/
│       └── verification-code.template.ts
└── member.module.ts                    # [MODIFY] providers 추가
```

---

## 상세 구현

### 1. Domain: Value Object (VerificationCode)

**파일:** `src/domain/member/value-objects/verification-code.ts`

```typescript
export class VerificationCode {
  private readonly _value: string;
  private readonly _expiresAt: Date;

  private constructor(value: string, expiresAt: Date) {
    this._value = value;
    this._expiresAt = expiresAt;
  }

  // 6자리 랜덤 숫자 생성
  public static generate(): VerificationCode {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5분 후
    return new VerificationCode(code, expiresAt);
  }

  public static of(value: string, expiresAt: Date): VerificationCode {
    return new VerificationCode(value, expiresAt);
  }

  public isExpired(): boolean {
    return new Date() > this._expiresAt;
  }

  public matches(inputCode: string): boolean {
    return this._value === inputCode && !this.isExpired();
  }

  public get value(): string {
    return this._value;
  }

  public get expiresAt(): Date {
    return this._expiresAt;
  }
}
```

**export 추가:** `src/domain/member/value-objects/index.ts`
```typescript
export * from './verification-code';
```

---

### 2. Domain: Exception

**파일:** `src/domain/member/exceptions/invalid-verification-code.exception.ts`

```typescript
import { DomainException } from '@/domain/shared';

export class InvalidVerificationCodeException extends DomainException {
  readonly errorCode = 'INVALID_VERIFICATION_CODE';

  constructor() {
    super('인증 코드가 유효하지 않거나 만료되었습니다.');
    this.name = 'InvalidVerificationCodeException';
  }
}
```

**파일:** `src/domain/member/exceptions/email-already-exists.exception.ts`

```typescript
import { DomainException } from '@/domain/shared';

export class EmailAlreadyExistsException extends DomainException {
  readonly errorCode = 'EMAIL_ALREADY_EXISTS';

  constructor(email: string) {
    super(`이미 사용 중인 이메일입니다: ${email}`);
    this.name = 'EmailAlreadyExistsException';
  }
}
```

**export 추가:** `src/domain/member/exceptions/index.ts`
```typescript
export * from './invalid-verification-code.exception';
export * from './email-already-exists.exception';
```

---

### 3. Domain: Member Entity

**파일:** `src/domain/member/member.ts` (변경)

기존 `changeEmail()` 메서드 구현:

```typescript
public changeEmail(newEmail: string): Member {
  const email: Email = new Email(newEmail);

  return new Member({
    ...this,
    id: this.id,
    email, // 새 이메일로 변경
    password: this.password,
    job: this.job,
    nickname: this.nickname,
    notification: this.notification,
    frequency: this.frequency,
    point: this.point,
    isPro: this.isPro,
  });
}
```

---

### 4. Domain: Event

**파일:** `src/domain/member/events/member-email-changed.event.ts`

```typescript
import { IEvent } from '@nestjs/cqrs';

export class MemberEmailChangedEvent implements IEvent {
  constructor(
    public readonly memberId: string,
    public readonly newEmail: string,
    public readonly occurredAt: Date = new Date(Date.now() + 9 * 60 * 60 * 1000),
  ) {}
}
```

**export 추가:** `src/domain/member/events/index.ts`
```typescript
export * from './member-email-changed.event';
```

---

### 5. Application: Email Verification Service (메모리 저장)

**파일:** `src/application/member/service/email-verification.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { VerificationCode } from '@/domain/member/value-objects';

interface VerificationEntry {
  memberId: string;
  newEmail: string;
  code: VerificationCode;
}

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);
  private readonly storage = new Map<string, VerificationEntry>();

  // 인증 코드 생성 및 저장
  saveVerificationCode(
    memberId: string,
    newEmail: string,
  ): VerificationCode {
    const code = VerificationCode.generate();

    this.storage.set(memberId, {
      memberId,
      newEmail,
      code,
    });

    this.logger.log(`인증 코드 생성: memberId=${memberId}, email=${newEmail}`);

    // 5분 후 자동 삭제
    setTimeout(() => {
      this.storage.delete(memberId);
      this.logger.log(`인증 코드 만료: memberId=${memberId}`);
    }, 5 * 60 * 1000);

    return code;
  }

  // 인증 코드 검증
  verifyCode(memberId: string, inputCode: string): string | null {
    const entry = this.storage.get(memberId);

    if (!entry) {
      this.logger.warn(`인증 코드 없음: memberId=${memberId}`);
      return null;
    }

    if (!entry.code.matches(inputCode)) {
      this.logger.warn(`인증 코드 불일치: memberId=${memberId}`);
      return null;
    }

    // 검증 성공 시 저장소에서 삭제
    this.storage.delete(memberId);
    this.logger.log(`인증 코드 검증 성공: memberId=${memberId}`);

    return entry.newEmail;
  }
}
```

**export 추가:** `src/application/member/service/index.ts`
```typescript
export * from './email-verification.service';
```

---

### 6. Application: Email Service (nodemailer)

**파일:** `src/application/member/service/email.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';

export interface EmailService {
  sendVerificationCode(email: string, code: string): Promise<void>;
}

export const EMAIL_SERVICE = Symbol('EMAIL_SERVICE');
```

**파일:** `src/adapter/member/email/nodemailer.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { EmailService } from '@/application/member/service';

@Injectable()
export class NodemailerService implements EmailService {
  private readonly logger = new Logger(NodemailerService.name);
  private transporter: Transporter;

  constructor(private readonly configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get('SMTP_HOST', 'smtp.gmail.com'),
      port: this.configService.get('SMTP_PORT', 587),
      secure: false,
      auth: {
        user: this.configService.get('SMTP_USER'),
        pass: this.configService.get('SMTP_PASS'),
      },
    });
  }

  async sendVerificationCode(email: string, code: string): Promise<void> {
    try {
      const info = await this.transporter.sendMail({
        from: this.configService.get('SMTP_FROM', 'noreply@prepair.com'),
        to: email,
        subject: '[PrePair] 이메일 변경 인증 코드',
        html: `
          <h2>이메일 변경 인증 코드</h2>
          <p>아래 인증 코드를 입력하여 이메일 변경을 완료하세요.</p>
          <h1 style="color: #4CAF50;">${code}</h1>
          <p>이 코드는 5분 동안 유효합니다.</p>
          <p>본인이 요청하지 않았다면 이 메일을 무시하세요.</p>
        `,
      });

      this.logger.log(`이메일 발송 완료: ${email} (messageId: ${info.messageId})`);
    } catch (error) {
      this.logger.error(`이메일 발송 실패: ${email}`, error);
      throw error;
    }
  }
}
```

---

### 7. Application: Commands

**파일:** `src/application/member/command/request-change-email.command.ts`

```typescript
import {
  CommandHandler,
  ICommand,
  ICommandHandler,
} from '@nestjs/cqrs';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  Member,
  MEMBER_REPOSITORY,
  type MemberRepository,
  EmailAlreadyExistsException,
} from '@/domain/member';
import { EmailVerificationService } from '@/application/member/service';
import { EMAIL_SERVICE, type EmailService } from '@/application/member/service';
import { MEMBER_READ_REPOSITORY, type MemberReadRepository } from '@/adapter/member/persistence/read';

export class RequestChangeEmailCommand implements ICommand {
  constructor(
    public readonly memberId: string,
    public readonly newEmail: string,
  ) {}
}

@Injectable()
@CommandHandler(RequestChangeEmailCommand)
export class RequestChangeEmailCommandHandler implements ICommandHandler<
  RequestChangeEmailCommand,
  void
> {
  constructor(
    @Inject(MEMBER_REPOSITORY)
    private readonly memberRepository: MemberRepository,
    @Inject(MEMBER_READ_REPOSITORY)
    private readonly memberReadRepository: MemberReadRepository,
    private readonly emailVerificationService: EmailVerificationService,
    @Inject(EMAIL_SERVICE)
    private readonly emailService: EmailService,
  ) {}

  async execute(command: RequestChangeEmailCommand): Promise<void> {
    // 1. 회원 존재 확인
    const existMember: Member | null = await this.memberRepository.findById(
      command.memberId,
    );

    if (!existMember) {
      throw new NotFoundException('회원을 찾을 수 없습니다.');
    }

    // 2. 이메일 중복 확인
    const emailExists = await this.memberReadRepository.findByEmail(
      command.newEmail,
    );

    if (emailExists) {
      throw new EmailAlreadyExistsException(command.newEmail);
    }

    // 3. 인증 코드 생성 및 저장
    const verificationCode = this.emailVerificationService.saveVerificationCode(
      command.memberId,
      command.newEmail,
    );

    // 4. 이메일 발송
    await this.emailService.sendVerificationCode(
      command.newEmail,
      verificationCode.value,
    );
  }
}
```

**파일:** `src/application/member/command/verify-change-email.command.ts`

```typescript
import {
  CommandHandler,
  EventBus,
  ICommand,
  ICommandHandler,
} from '@nestjs/cqrs';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  Member,
  MEMBER_REPOSITORY,
  type MemberRepository,
  MemberEmailChangedEvent,
  InvalidVerificationCodeException,
} from '@/domain/member';
import { EmailVerificationService } from '@/application/member/service';
import {
  createDomainEvent,
  EVENT_STORE,
  type EventStore,
} from '@/domain/shared';
import { EntityManager } from '@mikro-orm/postgresql';
import { Transactional } from '@mikro-orm/core';

export class VerifyChangeEmailCommand implements ICommand {
  constructor(
    public readonly memberId: string,
    public readonly code: string,
  ) {}
}

@Injectable()
@CommandHandler(VerifyChangeEmailCommand)
export class VerifyChangeEmailCommandHandler implements ICommandHandler<
  VerifyChangeEmailCommand,
  string
> {
  constructor(
    @Inject(MEMBER_REPOSITORY)
    private readonly memberRepository: MemberRepository,
    private readonly emailVerificationService: EmailVerificationService,
    @Inject(EVENT_STORE)
    private readonly eventStore: EventStore,
    private readonly eventBus: EventBus,
    private readonly em: EntityManager,
  ) {}

  @Transactional()
  async execute(command: VerifyChangeEmailCommand): Promise<string> {
    // 1. 회원 조회
    const existMember: Member | null = await this.memberRepository.findById(
      command.memberId,
    );

    if (!existMember) {
      throw new NotFoundException('회원을 찾을 수 없습니다.');
    }

    // 2. 인증 코드 검증
    const newEmail = this.emailVerificationService.verifyCode(
      command.memberId,
      command.code,
    );

    if (!newEmail) {
      throw new InvalidVerificationCodeException();
    }

    // 3. 도메인 로직 실행 (이메일 변경)
    const updatedMember: Member = existMember.changeEmail(newEmail);

    // 4. Write Model 업데이트
    this.memberRepository.update(updatedMember);

    // 5. Event Store에 기록
    this.eventStore.append(
      createDomainEvent(updatedMember.id, 'MemberEmailChanged', {
        id: updatedMember.id,
        newEmail: updatedMember.email.value,
        changedAt: new Date().toISOString(),
      }),
    );

    // 6. 트랜잭션 커밋
    await this.em.flush();

    // 7. 이벤트 발행
    this.eventBus.publish(
      new MemberEmailChangedEvent(
        updatedMember.id,
        updatedMember.email.value,
      ),
    );

    return updatedMember.email.value;
  }
}
```

**export 추가:** `src/application/member/command/index.ts`
```typescript
export * from './request-change-email.command';
export * from './verify-change-email.command';
```

---

### 8. Application: Event Handler

**파일:** `src/application/member/event/member-email-changed-event-handler.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { MemberEmailChangedEvent } from '@/domain/member';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { MemberReadEntity } from '@/adapter/member/persistence/read';
import { EntityManager } from '@mikro-orm/postgresql';

@Injectable()
@EventsHandler(MemberEmailChangedEvent)
export class MemberEmailChangedEventHandler implements IEventHandler<MemberEmailChangedEvent> {
  private readonly logger: Logger = new Logger(
    MemberEmailChangedEventHandler.name,
  );

  constructor(private readonly em: EntityManager) {}

  async handle(event: MemberEmailChangedEvent) {
    this.logger.log(`이메일 변경 이벤트 시작: ${event.memberId}`);

    const em = this.em.fork();

    const entity: MemberReadEntity | null = await em.findOne(MemberReadEntity, {
      id: event.memberId,
    });

    if (!entity) {
      this.logger.warn(`회원 Read Entity를 찾을 수 없음: ${event.memberId}`);
      return;
    }

    entity.email = event.newEmail;
    entity.updatedAt = event.occurredAt;

    await em.flush();

    this.logger.log(`이메일 변경 이벤트 종료: ${event.memberId}`);
  }
}
```

**export 추가:** `src/application/member/event/index.ts`
```typescript
export * from './member-email-changed-event-handler.service';
```

---

### 9. Adapter: DTOs

**파일:** `src/adapter/member/api/dto/request-change-email.dto.ts`

```typescript
import { IsEmail, IsNotEmpty } from 'class-validator';

export class RequestChangeEmailDto {
  @IsEmail({}, { message: '올바른 이메일 형식이 아닙니다.' })
  @IsNotEmpty({ message: '이메일은 필수입니다.' })
  newEmail: string;
}
```

**파일:** `src/adapter/member/api/dto/verify-change-email.dto.ts`

```typescript
import { IsString, Length } from 'class-validator';

export class VerifyChangeEmailDto {
  @IsString()
  @Length(6, 6, { message: '인증 코드는 6자리여야 합니다.' })
  code: string;
}
```

**export 추가:** `src/adapter/member/api/dto/index.ts`
```typescript
export * from './request-change-email.dto';
export * from './verify-change-email.dto';
```

---

### 10. Adapter: Controller

**파일:** `src/adapter/member/api/member.controller.ts` (수정)

기존 import에 추가:
```typescript
import {
  RequestChangeEmailCommand,
  VerifyChangeEmailCommand,
} from '@/application/member/command';
import {
  RequestChangeEmailDto,
  VerifyChangeEmailDto,
} from '@/adapter/member/api/dto';
```

새 엔드포인트 추가:
```typescript
@Post(':id/email/request')
@UseGuards(JwtAuthGuard)
async requestChangeEmail(
  @Param('id') id: string,
  @Body() requestDto: RequestChangeEmailDto,
) {
  await this.commandBus.execute<RequestChangeEmailCommand, void>(
    new RequestChangeEmailCommand(id, requestDto.newEmail),
  );

  return { success: true, message: '인증 코드가 이메일로 발송되었습니다.' };
}

@Post(':id/email/verify')
@UseGuards(JwtAuthGuard)
async verifyChangeEmail(
  @Param('id') id: string,
  @Body() verifyDto: VerifyChangeEmailDto,
) {
  const newEmail: string = await this.commandBus.execute<
    VerifyChangeEmailCommand,
    string
  >(new VerifyChangeEmailCommand(id, verifyDto.code));

  return { success: true, email: newEmail };
}
```

---

### 11. Module 설정

**파일:** `src/adapter/member/member.module.ts` (수정)

import 추가:
```typescript
import {
  RequestChangeEmailCommandHandler,
  VerifyChangeEmailCommandHandler,
} from '@/application/member/command';
import { MemberEmailChangedEventHandler } from '@/application/member/event';
import {
  EmailVerificationService,
  EMAIL_SERVICE,
} from '@/application/member/service';
import { NodemailerService } from '@/adapter/member/email';
```

배열 업데이트:
```typescript
const CommandHandlers = [
  MemberRegisterCommandHandler,
  WithdrawMemberCommandHandler,
  MemberUpdateCommandHandler,
  ChangePasswordCommandHandler,
  RequestChangeEmailCommandHandler,  // 추가
  VerifyChangeEmailCommandHandler,    // 추가
];

const EventHandlers = [
  MemberRegisterEventHandler,
  MemberWithdrawEventHandler,
  MemberUpdateEventHandler,
  MemberPasswordChangedEventHandler,
  MemberEmailChangedEventHandler,     // 추가
];
```

providers 추가:
```typescript
providers: [
  ...CommandHandlers,
  ...QueryHandlers,
  ...EventHandlers,
  MemberMapper,
  EmailVerificationService,           // 추가
  {
    provide: EMAIL_SERVICE,           // 추가
    useClass: NodemailerService,
  },
  // ... 기존 providers
],
```

---

### 12. 환경 변수 설정

**파일:** `.env`

```env
# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM="PrePair <noreply@prepair.com>"
```

**Gmail 앱 비밀번호 생성:**
1. Google 계정 → 보안 → 2단계 인증 활성화
2. 앱 비밀번호 생성
3. `.env`의 `SMTP_PASS`에 설정

---

### 13. 패키지 설치

```bash
npm install nodemailer
npm install -D @types/nodemailer
```

---

## 구현 순서

### Phase 1: 기본 구조
1. ✅ 패키지 설치 (`nodemailer`)
2. ✅ 환경 변수 설정 (`.env`)
3. ✅ Value Object 생성 (`VerificationCode`)
4. ✅ Exception 클래스 생성 (`InvalidVerificationCodeException`, `EmailAlreadyExistsException`)

### Phase 2: 서비스 레이어
5. ✅ EmailService 인터페이스 정의
6. ✅ NodemailerService 구현
7. ✅ EmailVerificationService 구현 (메모리 저장)

### Phase 3: Domain & Application
8. ✅ Member.changeEmail() 메서드 구현
9. ✅ MemberEmailChangedEvent 생성
10. ✅ RequestChangeEmailCommand + Handler
11. ✅ VerifyChangeEmailCommand + Handler
12. ✅ MemberEmailChangedEventHandler

### Phase 4: Adapter
13. ✅ DTO 생성 (`RequestChangeEmailDto`, `VerifyChangeEmailDto`)
14. ✅ Controller 엔드포인트 추가
15. ✅ Module 설정 업데이트

### Phase 5: 테스트
16. ✅ 이메일 발송 테스트 (콘솔 확인)
17. ✅ 인증 코드 검증 테스트
18. ✅ Read Model 동기화 확인

---

## 테스트 시나리오

### 1. 이메일 변경 요청
```bash
POST http://localhost:3000/members/{memberId}/email/request
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "newEmail": "newemail@example.com"
}

# 응답
{
  "success": true,
  "message": "인증 코드가 이메일로 발송되었습니다."
}
```

### 2. 인증 코드 검증
```bash
POST http://localhost:3000/members/{memberId}/email/verify
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "code": "123456"
}

# 응답
{
  "success": true,
  "email": "newemail@example.com"
}
```

### 3. 에러 케이스

**중복 이메일:**
```json
{
  "statusCode": 400,
  "message": "이미 사용 중인 이메일입니다: test@example.com",
  "errorCode": "EMAIL_ALREADY_EXISTS"
}
```

**잘못된 인증 코드:**
```json
{
  "statusCode": 400,
  "message": "인증 코드가 유효하지 않거나 만료되었습니다.",
  "errorCode": "INVALID_VERIFICATION_CODE"
}
```

---

## 보안 고려사항 (토이 프로젝트용 간소화)

현재 구현은 **메모리 기반**으로 다음 제약이 있습니다:
- ⚠️ 서버 재시작 시 인증 코드 손실
- ⚠️ 클러스터 환경에서 동작하지 않음
- ⚠️ 영구 감사 추적 불가

**프로덕션 환경으로 전환 시:**
1. `EmailVerificationService`를 DB 기반으로 변경
2. Redis 캐시 도입 (TTL 자동 만료)
3. 이메일 발송 재시도 로직 추가
4. Rate Limiting (동일 이메일 연속 요청 제한)

---

## 디렉토리 구조 최종 정리

```
src/
├── domain/member/
│   ├── member.ts                               [MODIFY]
│   ├── value-objects/
│   │   ├── verification-code.ts                [NEW]
│   │   └── index.ts                            [MODIFY]
│   ├── events/
│   │   ├── member-email-changed.event.ts       [NEW]
│   │   └── index.ts                            [MODIFY]
│   └── exceptions/
│       ├── invalid-verification-code.exception.ts  [NEW]
│       ├── email-already-exists.exception.ts       [NEW]
│       └── index.ts                                [MODIFY]
│
├── application/member/
│   ├── command/
│   │   ├── request-change-email.command.ts     [NEW]
│   │   ├── verify-change-email.command.ts      [NEW]
│   │   └── index.ts                            [MODIFY]
│   ├── event/
│   │   ├── member-email-changed-event-handler.service.ts  [NEW]
│   │   └── index.ts                            [MODIFY]
│   └── service/
│       ├── email-verification.service.ts       [NEW]
│       ├── email.service.ts                    [NEW]
│       └── index.ts                            [NEW]
│
└── adapter/member/
    ├── api/
    │   ├── member.controller.ts                [MODIFY]
    │   └── dto/
    │       ├── request-change-email.dto.ts     [NEW]
    │       ├── verify-change-email.dto.ts      [NEW]
    │       └── index.ts                        [MODIFY]
    ├── email/
    │   └── nodemailer.service.ts               [NEW]
    └── member.module.ts                        [MODIFY]
```

---

## 체크리스트

- [ ] nodemailer 패키지 설치
- [ ] `.env` 파일에 SMTP 설정 추가
- [ ] VerificationCode VO 구현
- [ ] Exception 클래스 생성
- [ ] EmailService 인터페이스 정의
- [ ] NodemailerService 구현
- [ ] EmailVerificationService 구현
- [ ] Member.changeEmail() 구현
- [ ] MemberEmailChangedEvent 생성
- [ ] RequestChangeEmailCommand + Handler
- [ ] VerifyChangeEmailCommand + Handler
- [ ] MemberEmailChangedEventHandler
- [ ] DTO 생성
- [ ] Controller 엔드포인트 추가
- [ ] Module providers 업데이트
- [ ] 이메일 발송 테스트
- [ ] E2E 테스트

---

## 추가 개선 사항 (선택)

1. **이메일 템플릿 외부화:**
   - Handlebars/Pug를 사용한 HTML 템플릿
   - 브랜딩 및 다국어 지원

2. **알림 추가:**
   - 이메일 변경 완료 시 기존 이메일로 알림 발송

3. **로깅 강화:**
   - Winston/Pino를 통한 구조화된 로그
   - 이메일 발송 실패 모니터링

4. **테스트 코드:**
   - Unit Test (도메인 로직, 서비스)
   - E2E Test (전체 플로우)

---

이 가이드를 따라 구현하면 DDD + CQRS 아키텍처를 유지하면서 이메일 변경 기능을 완성할 수 있습니다.
