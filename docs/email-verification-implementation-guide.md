# 이메일 검증 로직 구현 가이드

## 목표

회원가입 및 회원정보 수정(이메일 변경) 시 **공통으로 사용할 수 있는 이메일 검증 로직** 구현

### 요구사항

1. **이메일만 입력하면** 해당 이메일로 4자리 검증코드 발송
2. **회원가입 시**: 이메일 검증 완료 후 가입 진행
3. **회원수정 시**: 새 이메일로 검증 완료 후 이메일 변경

### 설계 원칙

이메일 검증은 **별도의 Bounded Context가 아님**. Member 도메인의 유스케이스(회원가입, 이메일변경)를 지원하는 부수 기능이므로 **Member 도메인 내부에서 처리**.

---

## 현재 구현 분석

### 회원가입 플로우 (현재)

```
[FE] 이메일 입력 → [BE] 바로 회원가입 완료
```

- `RegisterMemberCommandHandler`: 이메일 형식 검증(정규식)만 수행
- 실제 이메일 소유 확인 없음

**관련 파일:**
- `src/application/member/command/member-register.command.ts`
- `src/adapter/member/api/dto/register-member-request.dto.ts`
- `src/adapter/member/api/member.controller.ts`

### 이메일 변경 플로우 (현재)

```
[FE] 새 이메일 입력 → [BE] 검증코드 발송 → [FE] 코드 입력 → [BE] 검증 후 이메일 변경
```

- 2단계 검증 로직 구현됨
- **문제점**: `EmailVerificationService`가 `memberId` 기반으로 동작
- 회원가입 시에는 `memberId`가 없어서 재사용 불가

**관련 파일:**
- `src/application/member/command/request-change-email.command.ts`
- `src/application/member/command/verify-change-email.command.ts`
- `src/application/member/service/email-verification.service.ts`
- `src/adapter/member/email/nodemailer.service.ts`

---

## 구현 계획

### 목표 플로우

#### 회원가입

```
[FE] 이메일 입력 → [BE] POST /members/email/send-verification
                        ↓ 검증코드 발송
[FE] 코드 입력   → [BE] POST /members/email/verify
                        ↓ 검증 토큰 반환
[FE] 회원가입    → [BE] POST /members (verificationToken 포함)
                        ↓ 토큰 검증 후 회원가입 완료
```

#### 회원정보 수정 (이메일 변경)

```
[FE] 새 이메일 입력 → [BE] POST /members/email/send-verification
                          ↓ 검증코드 발송
[FE] 코드 입력     → [BE] POST /members/email/verify
                          ↓ 검증 토큰 반환
[FE] 이메일 변경   → [BE] PATCH /members/:id/email (verificationToken 포함)
                          ↓ 토큰 검증 후 이메일 변경
```

---

## 수정/추가 파일 목록

### 1. Domain Layer

#### 1.1 VerificationToken Value Object (신규)

**신규 파일:** `src/domain/member/value-objects/verification-token.ts`

이메일 검증 완료 후 발급되는 일회성 토큰. 회원가입/이메일변경 시 사용.

```typescript
import * as crypto from 'crypto';

export class VerificationToken {
  private constructor(
    private readonly _value: string,
    private readonly _email: string,
    private readonly _expiresAt: Date,
  ) {}

  public static generate(email: string): VerificationToken {
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10분 유효
    return new VerificationToken(token, email, expiresAt);
  }

  public static of(value: string, email: string, expiresAt: Date): VerificationToken {
    return new VerificationToken(value, email, expiresAt);
  }

  public isExpired(): boolean {
    return new Date() > this._expiresAt;
  }

  public get value(): string {
    return this._value;
  }

  public get email(): string {
    return this._email;
  }

  public get expiresAt(): Date {
    return this._expiresAt;
  }
}
```

#### 1.2 Value Objects index 수정

**기존 파일:** `src/domain/member/value-objects/index.ts`

```typescript
// 추가
export * from './verification-token';
```

#### 1.3 Exception 추가 (신규)

**신규 파일:** `src/domain/member/exceptions/invalid-verification-token.exception.ts`

```typescript
import { DomainException } from '@/domain/shared/domain.exception';

export class InvalidVerificationTokenException extends DomainException {
  constructor() {
    super('검증 토큰이 유효하지 않거나 만료되었습니다.');
  }
}
```

#### 1.4 Exceptions index 수정

**기존 파일:** `src/domain/member/exceptions/index.ts`

```typescript
// 추가
export * from './invalid-verification-token.exception';
```

---

### 2. Application Layer

#### 2.1 이메일 검증 서비스 리팩토링 (수정)

**기존 파일:** `src/application/member/service/email-verification.service.ts`

**변경 사항:**
- `memberId` 기반 → `email` 기반으로 변경
- 검증 성공 시 `VerificationToken` 반환
- 회원가입/이메일변경 공용으로 사용

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { VerificationCode, VerificationToken } from '@/domain/member/value-objects';

interface VerificationEntry {
  email: string;
  code: VerificationCode;
}

interface VerifiedEntry {
  email: string;
  token: VerificationToken;
}

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  // 검증 대기 중인 이메일 (email -> code)
  private readonly pendingVerifications = new Map<string, VerificationEntry>();
  // 검증 완료된 이메일 (token -> email)
  private readonly verifiedTokens = new Map<string, VerifiedEntry>();

  /**
   * 이메일로 검증 코드 발송 요청
   * @param email 검증할 이메일
   * @returns 생성된 VerificationCode
   */
  saveVerificationCode(email: string): VerificationCode {
    const code = VerificationCode.generate();
    this.pendingVerifications.set(email, { email, code });

    this.logger.log(`인증 코드 생성: email=${email}`);

    // 5분 후 자동 삭제
    setTimeout(() => {
      this.pendingVerifications.delete(email);
      this.logger.log(`인증 코드 만료: email=${email}`);
    }, 5 * 60 * 1000);

    return code;
  }

  /**
   * 검증 코드 확인 및 검증 토큰 발급
   * @param email 검증할 이메일
   * @param inputCode 사용자 입력 코드
   * @returns 검증 성공 시 VerificationToken, 실패 시 null
   */
  verifyCode(email: string, inputCode: string): VerificationToken | null {
    const entry = this.pendingVerifications.get(email);

    if (!entry) {
      this.logger.warn(`인증 코드 없음: email=${email}`);
      return null;
    }

    if (!entry.code.matches(inputCode)) {
      this.logger.warn(`인증 코드 불일치: email=${email}`);
      return null;
    }

    // 검증 성공: 토큰 발급
    const token = VerificationToken.generate(email);
    this.verifiedTokens.set(token.value, { email, token });
    this.pendingVerifications.delete(email);

    this.logger.log(`인증 코드 검증 성공: email=${email}`);

    // 10분 후 토큰 만료
    setTimeout(() => {
      this.verifiedTokens.delete(token.value);
      this.logger.log(`검증 토큰 만료: email=${email}`);
    }, 10 * 60 * 1000);

    return token;
  }

  /**
   * 검증 토큰 유효성 확인
   * @param tokenValue 검증 토큰 값
   * @returns 유효한 경우 이메일 반환, 아니면 null
   */
  validateToken(tokenValue: string): string | null {
    const entry = this.verifiedTokens.get(tokenValue);

    if (!entry || entry.token.isExpired()) {
      return null;
    }

    return entry.email;
  }

  /**
   * 토큰 사용 완료 후 삭제 (일회성 토큰)
   * @param tokenValue 검증 토큰 값
   * @returns 유효한 경우 이메일 반환, 아니면 null
   */
  consumeToken(tokenValue: string): string | null {
    const email = this.validateToken(tokenValue);
    if (email) {
      this.verifiedTokens.delete(tokenValue);
      this.logger.log(`검증 토큰 사용 완료: email=${email}`);
    }
    return email;
  }
}
```

#### 2.2 이메일 검증 요청 Command (신규)

**신규 파일:** `src/application/member/command/send-email-verification.command.ts`

```typescript
import { ICommand, ICommandHandler, CommandHandler } from '@nestjs/cqrs';
import { Inject, Injectable } from '@nestjs/common';
import { EmailVerificationService } from '@/application/member/service/email-verification.service';
import { EmailService, EMAIL_SERVICE } from '@/application/member/service/email.service';
import { MemberReadRepository, MEMBER_READ_REPOSITORY } from '@/domain/member';
import { EmailAlreadyExistsException } from '@/domain/member/exceptions';

export type EmailVerificationPurpose = 'REGISTER' | 'CHANGE_EMAIL';

export class SendEmailVerificationCommand implements ICommand {
  constructor(
    public readonly email: string,
    public readonly purpose: EmailVerificationPurpose,
  ) {}
}

@Injectable()
@CommandHandler(SendEmailVerificationCommand)
export class SendEmailVerificationCommandHandler
  implements ICommandHandler<SendEmailVerificationCommand, void>
{
  constructor(
    @Inject(MEMBER_READ_REPOSITORY)
    private readonly memberReadRepository: MemberReadRepository,
    private readonly emailVerificationService: EmailVerificationService,
    @Inject(EMAIL_SERVICE)
    private readonly emailService: EmailService,
  ) {}

  async execute(command: SendEmailVerificationCommand): Promise<void> {
    const { email, purpose } = command;

    // 이메일 중복 확인 (회원가입/이메일변경 모두 동일)
    const existingMember = await this.memberReadRepository.findByEmail(email);
    if (existingMember) {
      throw new EmailAlreadyExistsException(email);
    }

    // 검증 코드 생성 및 발송
    const code = this.emailVerificationService.saveVerificationCode(email);
    await this.emailService.sendVerificationCode(email, code.value);
  }
}
```

#### 2.3 이메일 검증 확인 Command (신규)

**신규 파일:** `src/application/member/command/verify-email.command.ts`

```typescript
import { ICommand, ICommandHandler, CommandHandler } from '@nestjs/cqrs';
import { Injectable } from '@nestjs/common';
import { EmailVerificationService } from '@/application/member/service/email-verification.service';
import { InvalidVerificationCodeException } from '@/domain/member/exceptions';

export class VerifyEmailCommand implements ICommand {
  constructor(
    public readonly email: string,
    public readonly code: string,
  ) {}
}

@Injectable()
@CommandHandler(VerifyEmailCommand)
export class VerifyEmailCommandHandler
  implements ICommandHandler<VerifyEmailCommand, string>
{
  constructor(
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  async execute(command: VerifyEmailCommand): Promise<string> {
    const { email, code } = command;

    const token = this.emailVerificationService.verifyCode(email, code);

    if (!token) {
      throw new InvalidVerificationCodeException();
    }

    return token.value; // 검증 토큰 반환
  }
}
```

#### 2.4 회원가입 Command 수정

**기존 파일:** `src/application/member/command/member-register.command.ts`

**변경 사항:**
- `verificationToken` 파라미터 추가
- 토큰 검증 로직 추가

```typescript
import { ICommand, ICommandHandler, CommandHandler, EventBus } from '@nestjs/cqrs';
import { Inject, Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Transactional } from '@nestjs-cls/transactional';
import { Member } from '@/domain/member/member';
import {
  MEMBER_REPOSITORY,
  MemberRepository,
  PASSWORD_ENCODER,
  PasswordEncoder,
} from '@/domain/member';
import { EVENT_STORE, EventStore } from '@/domain/shared/event-store';
import { MemberRegisterEvent } from '@/domain/member/events';
import { EmailVerificationService } from '@/application/member/service/email-verification.service';
import { InvalidVerificationTokenException } from '@/domain/member/exceptions';
import { NotificationEnum, FrequencyEnum } from '@/domain/member/enums';

export class MemberRegisterCommand implements ICommand {
  constructor(
    public readonly email: string,
    public readonly password: string,
    public readonly job: string,
    public readonly nickname: string,
    public readonly notification: NotificationEnum,
    public readonly frequency: FrequencyEnum,
    public readonly verificationToken: string,  // 추가
  ) {}
}

@Injectable()
@CommandHandler(MemberRegisterCommand)
export class MemberRegisterCommandHandler
  implements ICommandHandler<MemberRegisterCommand, string>
{
  constructor(
    @Inject(MEMBER_REPOSITORY)
    private readonly memberRepository: MemberRepository,
    @Inject(PASSWORD_ENCODER)
    private readonly passwordEncoder: PasswordEncoder,
    @Inject(EVENT_STORE)
    private readonly eventStore: EventStore,
    private readonly em: EntityManager,
    private readonly eventBus: EventBus,
    private readonly emailVerificationService: EmailVerificationService,  // 추가
  ) {}

  @Transactional()
  async execute(command: MemberRegisterCommand): Promise<string> {
    const { verificationToken, email, password, job, nickname, notification, frequency } = command;

    // 토큰 검증 및 이메일 확인
    const verifiedEmail = this.emailVerificationService.consumeToken(verificationToken);

    if (!verifiedEmail || verifiedEmail !== email) {
      throw new InvalidVerificationTokenException();
    }

    // 기존 로직 유지
    const member = Member.register({
      email,
      rawPassword: password,
      job,
      nickname,
      notification,
      frequency,
      passwordEncoder: this.passwordEncoder,
    });

    await this.memberRepository.save(member);

    await this.eventStore.append(member.id, 'MemberRegistered', {
      memberId: member.id,
      email: member.email.value,
      job: member.job,
      nickname: member.nickname,
      notification: member.notification,
      frequency: member.frequency,
    });

    await this.em.flush();

    this.eventBus.publish(
      new MemberRegisterEvent(
        member.id,
        member.email.value,
        member.job,
        member.nickname,
        member.notification,
        member.frequency,
      ),
    );

    return member.id;
  }
}
```

#### 2.5 이메일 변경 Command 수정

**기존 파일들 정리:**
- `src/application/member/command/request-change-email.command.ts` → **삭제**
- `src/application/member/command/verify-change-email.command.ts` → **수정 (파일명 변경)**

**수정 파일:** `src/application/member/command/change-email.command.ts`

```typescript
import { ICommand, ICommandHandler, CommandHandler, EventBus } from '@nestjs/cqrs';
import { Inject, Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Transactional } from '@nestjs-cls/transactional';
import { MEMBER_REPOSITORY, MemberRepository } from '@/domain/member';
import { EVENT_STORE, EventStore } from '@/domain/shared/event-store';
import { MemberEmailChangedEvent } from '@/domain/member/events';
import { EmailVerificationService } from '@/application/member/service/email-verification.service';
import {
  InvalidVerificationTokenException,
  MemberNotFoundException,
} from '@/domain/member/exceptions';

export class ChangeEmailCommand implements ICommand {
  constructor(
    public readonly memberId: string,
    public readonly verificationToken: string,
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
    @Inject(EVENT_STORE)
    private readonly eventStore: EventStore,
    private readonly em: EntityManager,
    private readonly eventBus: EventBus,
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  @Transactional()
  async execute(command: ChangeEmailCommand): Promise<string> {
    const { memberId, verificationToken } = command;

    // 토큰에서 검증된 이메일 추출
    const newEmail = this.emailVerificationService.consumeToken(verificationToken);

    if (!newEmail) {
      throw new InvalidVerificationTokenException();
    }

    // 회원 조회
    const member = await this.memberRepository.findById(memberId);
    if (!member) {
      throw new MemberNotFoundException(memberId);
    }

    // 이메일 변경
    const updatedMember = member.changeEmail(newEmail);

    // 저장
    await this.memberRepository.save(updatedMember);

    // Event Store 기록
    await this.eventStore.append(memberId, 'MemberEmailChanged', {
      memberId,
      newEmail,
    });

    await this.em.flush();

    // 이벤트 발행
    this.eventBus.publish(new MemberEmailChangedEvent(memberId, newEmail));

    return newEmail;
  }
}
```

#### 2.6 Command index 수정

**기존 파일:** `src/application/member/command/index.ts`

```typescript
export * from './member-register.command';
export * from './send-email-verification.command';  // 추가
export * from './verify-email.command';              // 추가
export * from './change-email.command';              // 추가 (기존 verify-change-email 대체)
// export * from './request-change-email.command';  // 삭제
// export * from './verify-change-email.command';   // 삭제
// ... 기타 exports
```

---

### 3. Adapter Layer

#### 3.1 이메일 검증 DTO (신규)

**신규 파일:** `src/adapter/member/api/dto/send-email-verification.dto.ts`

```typescript
import { IsEmail, IsIn } from 'class-validator';
import { EmailVerificationPurpose } from '@/application/member/command/send-email-verification.command';

export class SendEmailVerificationDto {
  @IsEmail()
  email: string;

  @IsIn(['REGISTER', 'CHANGE_EMAIL'])
  purpose: EmailVerificationPurpose;
}
```

**신규 파일:** `src/adapter/member/api/dto/verify-email.dto.ts`

```typescript
import { IsEmail, Length } from 'class-validator';

export class VerifyEmailDto {
  @IsEmail()
  email: string;

  @Length(4, 4)
  code: string;
}
```

#### 3.2 이메일 변경 DTO (신규/수정)

**신규 파일:** `src/adapter/member/api/dto/change-email.dto.ts`

```typescript
import { IsString, IsNotEmpty } from 'class-validator';

export class ChangeEmailDto {
  @IsString()
  @IsNotEmpty()
  verificationToken: string;
}
```

#### 3.3 회원가입 DTO 수정

**기존 파일:** `src/adapter/member/api/dto/register-member-request.dto.ts`

```typescript
import { IsEmail, IsEnum, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { NotificationEnum, FrequencyEnum } from '@/domain/member/enums';

export class RegisterMemberRequestDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  job: string;

  @IsString()
  nickname: string;

  @IsEnum(NotificationEnum)
  notification: NotificationEnum;

  @IsEnum(FrequencyEnum)
  frequency: FrequencyEnum;

  @IsString()
  @IsNotEmpty()
  verificationToken: string;  // 추가
}
```

#### 3.4 DTO index 수정

**기존 파일:** `src/adapter/member/api/dto/index.ts`

```typescript
export * from './register-member-request.dto';
export * from './send-email-verification.dto';  // 추가
export * from './verify-email.dto';              // 추가
export * from './change-email.dto';              // 추가
// export * from './request-change-email.dto';  // 삭제
// export * from './verify-change-email.dto';   // 삭제
// ... 기타 exports
```

#### 3.5 Member Controller 수정

**기존 파일:** `src/adapter/member/api/member.controller.ts`

```typescript
import { Controller, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { JwtAuthGuard } from '@/adapter/auth/security/jwt-auth.guard';
import {
  MemberRegisterCommand,
  SendEmailVerificationCommand,
  VerifyEmailCommand,
  ChangeEmailCommand,
} from '@/application/member/command';
import {
  RegisterMemberRequestDto,
  SendEmailVerificationDto,
  VerifyEmailDto,
  ChangeEmailDto,
} from './dto';

@Controller('members')
export class MemberController {
  constructor(private readonly commandBus: CommandBus) {}

  /**
   * 이메일 검증 코드 발송 (회원가입/이메일변경 공용)
   * POST /members/email/send-verification
   */
  @Post('email/send-verification')
  async sendEmailVerification(@Body() dto: SendEmailVerificationDto) {
    await this.commandBus.execute(
      new SendEmailVerificationCommand(dto.email, dto.purpose),
    );

    return {
      success: true,
      message: '인증 코드가 이메일로 발송되었습니다.',
    };
  }

  /**
   * 이메일 검증 코드 확인
   * POST /members/email/verify
   */
  @Post('email/verify')
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    const token = await this.commandBus.execute<VerifyEmailCommand, string>(
      new VerifyEmailCommand(dto.email, dto.code),
    );

    return {
      success: true,
      verificationToken: token,
      message: '이메일 검증이 완료되었습니다.',
    };
  }

  /**
   * 회원가입
   * POST /members
   */
  @Post()
  async register(@Body() dto: RegisterMemberRequestDto) {
    const memberId = await this.commandBus.execute<MemberRegisterCommand, string>(
      new MemberRegisterCommand(
        dto.email,
        dto.password,
        dto.job,
        dto.nickname,
        dto.notification,
        dto.frequency,
        dto.verificationToken,
      ),
    );

    return { success: true, memberId };
  }

  /**
   * 이메일 변경
   * PATCH /members/:id/email
   */
  @Patch(':id/email')
  @UseGuards(JwtAuthGuard)
  async changeEmail(
    @Param('id') id: string,
    @Body() dto: ChangeEmailDto,
  ) {
    const newEmail = await this.commandBus.execute<ChangeEmailCommand, string>(
      new ChangeEmailCommand(id, dto.verificationToken),
    );

    return { success: true, email: newEmail };
  }

  // 삭제 대상:
  // @Post(':id/email/request') requestChangeEmail
  // @Post(':id/email/verify') verifyChangeEmail

  // ... 기타 엔드포인트
}
```

#### 3.6 Nodemailer 서비스 수정

**기존 파일:** `src/adapter/member/email/nodemailer.service.ts`

**변경 사항:**
- 이메일 제목/본문을 회원가입/이메일변경 구분 없이 범용으로 수정

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { EmailService } from '@/application/member/service/email.service';

@Injectable()
export class NodemailerService implements EmailService {
  private transporter: Transporter;

  constructor(private readonly configService: ConfigService) {
    this.transporter = createTransport({
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
    await this.transporter.sendMail({
      from: this.configService.get('SMTP_FROM', 'noreply@prepair.com'),
      to: email,
      subject: '[PrePair] 이메일 인증 코드',
      html: `
        <h2>이메일 인증 코드</h2>
        <p>아래 인증 코드를 입력하여 이메일 인증을 완료하세요.</p>
        <h1 style="color: #4CAF50; letter-spacing: 8px;">${code}</h1>
        <p>이 코드는 5분 동안 유효합니다.</p>
        <p>본인이 요청하지 않았다면 이 메일을 무시하세요.</p>
      `,
    });
  }
}
```

---

### 4. Module 설정

#### 4.1 MemberModule 수정

**기존 파일:** `src/adapter/member/member.module.ts`

**변경 사항:**
- `RequestChangeEmailCommandHandler` 제거
- `VerifyChangeEmailCommandHandler` → `ChangeEmailCommandHandler`로 변경
- `SendEmailVerificationCommandHandler`, `VerifyEmailCommandHandler` 추가

```typescript
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { EventStoreModule } from '@/adapter/shared/event-store/event-store.module';

// Controllers
import { MemberController } from './api/member.controller';

// Command Handlers
import {
  MemberRegisterCommandHandler,
  SendEmailVerificationCommandHandler,  // 추가
  VerifyEmailCommandHandler,             // 추가
  ChangeEmailCommandHandler,             // 수정
  // RequestChangeEmailCommandHandler,   // 삭제
  // VerifyChangeEmailCommandHandler,    // 삭제
} from '@/application/member/command';

// Query Handlers
import { /* ... */ } from '@/application/member/query';

// Event Handlers
import { /* ... */ } from '@/application/member/event';

// Services
import { EmailVerificationService } from '@/application/member/service/email-verification.service';
import { EMAIL_SERVICE } from '@/application/member/service/email.service';
import { NodemailerService } from './email/nodemailer.service';

// Repositories
import { MEMBER_REPOSITORY, MEMBER_READ_REPOSITORY, PASSWORD_ENCODER } from '@/domain/member';
import { MemberRepositoryImpl } from './persistence/mikro-orm/member.repository';
import { MemberReadRepositoryImpl } from './persistence/read/member-read.repository';
import { SecurePasswordEncoder } from './security/secure-password-encoder';

// Entities
import { MemberEntity } from './persistence/mikro-orm/entity/member.entity';
import { MemberReadEntity } from './persistence/read/entity/member-read.entity';

const CommandHandlers = [
  MemberRegisterCommandHandler,
  SendEmailVerificationCommandHandler,  // 추가
  VerifyEmailCommandHandler,             // 추가
  ChangeEmailCommandHandler,             // 수정
  // ... 기타 handlers
];

const QueryHandlers = [
  // ...
];

const EventHandlers = [
  // ...
];

@Module({
  imports: [
    EventStoreModule,
    CqrsModule,
    MikroOrmModule.forFeature([MemberEntity, MemberReadEntity]),
  ],
  controllers: [MemberController],
  providers: [
    ...CommandHandlers,
    ...QueryHandlers,
    ...EventHandlers,
    EmailVerificationService,
    {
      provide: EMAIL_SERVICE,
      useClass: NodemailerService,
    },
    {
      provide: MEMBER_REPOSITORY,
      useClass: MemberRepositoryImpl,
    },
    {
      provide: MEMBER_READ_REPOSITORY,
      useClass: MemberReadRepositoryImpl,
    },
    {
      provide: PASSWORD_ENCODER,
      useClass: SecurePasswordEncoder,
    },
  ],
  exports: [MEMBER_REPOSITORY, MEMBER_READ_REPOSITORY],
})
export class MemberModule {}
```

---

## 삭제 대상 파일

| 파일 경로 | 사유 |
|---------|-----|
| `src/application/member/command/request-change-email.command.ts` | 공용 API로 대체 |
| `src/application/member/command/verify-change-email.command.ts` | `change-email.command.ts`로 대체 |
| `src/adapter/member/api/dto/request-change-email.dto.ts` | 공용 DTO로 대체 |
| `src/adapter/member/api/dto/verify-change-email.dto.ts` | 공용 DTO로 대체 |

---

## API 엔드포인트 변경 사항

### Before (현재)

| Method | Endpoint | 설명 |
|--------|----------|-----|
| POST | `/members` | 회원가입 (검증 없음) |
| POST | `/members/:id/email/request` | 이메일 변경 코드 요청 |
| POST | `/members/:id/email/verify` | 이메일 변경 코드 확인 |

### After (변경 후)

| Method | Endpoint | 설명 |
|--------|----------|-----|
| POST | `/members/email/send-verification` | 이메일 검증 코드 발송 (공용) |
| POST | `/members/email/verify` | 이메일 검증 코드 확인 (공용) |
| POST | `/members` | 회원가입 (verificationToken 필수) |
| PATCH | `/members/:id/email` | 이메일 변경 (verificationToken 필수) |

---

## 시퀀스 다이어그램

### 회원가입 플로우

```
┌──────┐          ┌────────────────┐          ┌─────────────────────┐          ┌───────────────┐
│  FE  │          │ MemberController│          │ EmailVerificationSvc│          │ NodemailerSvc │
└──┬───┘          └───────┬────────┘          └──────────┬──────────┘          └───────┬───────┘
   │                      │                              │                             │
   │ POST /members/email/send-verification               │                             │
   │ {email, purpose:"REGISTER"}                         │                             │
   │─────────────────────>│                              │                             │
   │                      │ saveVerificationCode(email)  │                             │
   │                      │─────────────────────────────>│                             │
   │                      │                              │ sendVerificationCode()      │
   │                      │                              │────────────────────────────>│
   │                      │                              │                         ┌───┴───┐
   │                      │                              │                         │ 메일발송 │
   │                      │                              │                         └───┬───┘
   │<─────────────────────│                              │                             │
   │ {success: true}      │                              │                             │
   │                      │                              │                             │
   │ POST /members/email/verify                          │                             │
   │ {email, code}        │                              │                             │
   │─────────────────────>│                              │                             │
   │                      │ verifyCode(email, code)      │                             │
   │                      │─────────────────────────────>│                             │
   │                      │<─────────────────────────────│                             │
   │                      │ VerificationToken            │                             │
   │<─────────────────────│                              │                             │
   │ {verificationToken}  │                              │                             │
   │                      │                              │                             │
   │ POST /members        │                              │                             │
   │ {..., verificationToken}                            │                             │
   │─────────────────────>│                              │                             │
   │                      │ consumeToken(token)          │                             │
   │                      │─────────────────────────────>│                             │
   │                      │<─────────────────────────────│                             │
   │                      │ verifiedEmail                │                             │
   │                      │                              │                             │
   │                      │ Member.register()            │                             │
   │                      │──────────┐                   │                             │
   │                      │          │ 회원 생성          │                             │
   │                      │<─────────┘                   │                             │
   │<─────────────────────│                              │                             │
   │ {memberId}           │                              │                             │
```

### 이메일 변경 플로우

```
┌──────┐          ┌────────────────┐          ┌─────────────────────┐          ┌───────────────┐
│  FE  │          │ MemberController│          │ EmailVerificationSvc│          │ NodemailerSvc │
└──┬───┘          └───────┬────────┘          └──────────┬──────────┘          └───────┬───────┘
   │                      │                              │                             │
   │ POST /members/email/send-verification               │                             │
   │ {email:"new@email.com", purpose:"CHANGE_EMAIL"}     │                             │
   │─────────────────────>│                              │                             │
   │                      │ (중복 확인)                   │                             │
   │                      │ saveVerificationCode(email)  │                             │
   │                      │─────────────────────────────>│                             │
   │                      │                              │ sendVerificationCode()      │
   │                      │                              │────────────────────────────>│
   │<─────────────────────│                              │                             │
   │ {success: true}      │                              │                             │
   │                      │                              │                             │
   │ POST /members/email/verify                          │                             │
   │ {email, code}        │                              │                             │
   │─────────────────────>│                              │                             │
   │                      │ verifyCode()                 │                             │
   │                      │─────────────────────────────>│                             │
   │<─────────────────────│                              │                             │
   │ {verificationToken}  │                              │                             │
   │                      │                              │                             │
   │ PATCH /members/:id/email                            │                             │
   │ {verificationToken}  │                              │                             │
   │─────────────────────>│                              │                             │
   │                      │ consumeToken(token)          │                             │
   │                      │─────────────────────────────>│                             │
   │                      │<─────────────────────────────│                             │
   │                      │ newEmail                     │                             │
   │                      │                              │                             │
   │                      │ member.changeEmail()         │                             │
   │                      │──────────┐                   │                             │
   │                      │          │ 이메일 변경        │                             │
   │                      │<─────────┘                   │                             │
   │<─────────────────────│                              │                             │
   │ {email: "new@..."}   │                              │                             │
```

---

## 파일 구조 (최종)

```
src/
├── domain/member/
│   ├── value-objects/
│   │   ├── index.ts                     # 수정
│   │   ├── email.ts
│   │   ├── password.ts
│   │   ├── verification-code.ts         # 기존 유지
│   │   └── verification-token.ts        # 신규
│   ├── exceptions/
│   │   ├── index.ts                     # 수정
│   │   └── invalid-verification-token.exception.ts  # 신규
│   └── ...
│
├── application/member/
│   ├── command/
│   │   ├── index.ts                           # 수정
│   │   ├── member-register.command.ts         # 수정
│   │   ├── send-email-verification.command.ts # 신규
│   │   ├── verify-email.command.ts            # 신규
│   │   ├── change-email.command.ts            # 신규 (기존 verify-change-email 대체)
│   │   └── ...
│   └── service/
│       ├── email.service.ts                   # 기존 유지
│       └── email-verification.service.ts      # 수정
│
├── adapter/member/
│   ├── api/
│   │   ├── member.controller.ts               # 수정
│   │   └── dto/
│   │       ├── index.ts                       # 수정
│   │       ├── register-member-request.dto.ts # 수정
│   │       ├── send-email-verification.dto.ts # 신규
│   │       ├── verify-email.dto.ts            # 신규
│   │       └── change-email.dto.ts            # 신규
│   ├── email/
│   │   └── nodemailer.service.ts              # 수정
│   └── member.module.ts                       # 수정
│
└── app.module.ts                              # 변경 없음
```

---

## 테스트 케이스 추가 항목

### Unit Tests

1. **VerificationToken Value Object**
   - `generate()`: 토큰 생성 및 10분 만료 시간 설정
   - `isExpired()`: 만료 여부 확인

2. **EmailVerificationService**
   - `saveVerificationCode()`: 이메일로 코드 저장
   - `verifyCode()`: 올바른 코드 입력 시 토큰 반환
   - `verifyCode()`: 잘못된 코드 입력 시 null 반환
   - `verifyCode()`: 만료된 코드 입력 시 null 반환
   - `validateToken()`: 유효한 토큰 검증
   - `consumeToken()`: 토큰 사용 후 삭제 확인

3. **SendEmailVerificationCommandHandler**
   - 이미 존재하는 이메일이면 `EmailAlreadyExistsException`
   - 정상 케이스: 코드 발송 성공

4. **VerifyEmailCommandHandler**
   - 올바른 코드 입력 시 토큰 반환
   - 잘못된 코드 입력 시 `InvalidVerificationCodeException`

5. **MemberRegisterCommandHandler (수정)**
   - 유효한 토큰으로 회원가입 성공
   - 유효하지 않은 토큰으로 `InvalidVerificationTokenException`
   - 토큰의 이메일과 요청 이메일 불일치 시 `InvalidVerificationTokenException`

6. **ChangeEmailCommandHandler**
   - 유효한 토큰으로 이메일 변경 성공
   - 유효하지 않은 토큰으로 `InvalidVerificationTokenException`

### E2E Tests

1. **회원가입 플로우**
   - 이메일 검증 없이 회원가입 시도 → 실패
   - 이메일 검증 후 회원가입 → 성공

2. **이메일 변경 플로우**
   - 검증 없이 이메일 변경 시도 → 실패
   - 검증 후 이메일 변경 → 성공

---

## 주의사항

### 프로덕션 환경 고려사항

1. **검증 코드 저장소**
   - 현재: 메모리 Map (서버 재시작 시 데이터 손실)
   - 권장: Redis 사용 (TTL 지원, 분산 환경 대응)

2. **Rate Limiting**
   - 이메일 발송 API에 rate limiting 적용 필요
   - 예: 동일 이메일에 1분에 1회 제한

3. **보안**
   - 검증 코드 brute force 방지 (5회 실패 시 30분 차단 등)
   - 검증 토큰은 일회성으로 사용 후 즉시 삭제

4. **이메일 발송 실패 처리**
   - 발송 실패 시 재시도 로직
   - Dead Letter Queue 등 고려

---

## 구현 우선순위

| 순서 | 작업 | 중요도 |
|-----|------|-------|
| 1 | `VerificationToken` Value Object 생성 | 높음 |
| 2 | `InvalidVerificationTokenException` 생성 | 높음 |
| 3 | `EmailVerificationService` 리팩토링 | 높음 |
| 4 | `SendEmailVerificationCommand` 생성 | 높음 |
| 5 | `VerifyEmailCommand` 생성 | 높음 |
| 6 | `MemberRegisterCommand` 수정 | 높음 |
| 7 | `ChangeEmailCommand` 생성 (기존 삭제) | 높음 |
| 8 | Controller/DTO 수정 | 높음 |
| 9 | MemberModule 수정 | 높음 |
| 10 | 기존 파일 삭제 | 중간 |
| 11 | 단위 테스트 작성 | 중간 |
| 12 | E2E 테스트 작성 | 낮음 |
