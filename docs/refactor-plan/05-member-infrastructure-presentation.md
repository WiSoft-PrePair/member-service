# 05. Member Infrastructure & Presentation

> **사전 조건**: Phase 04 완료 (UseCase, Projector, QueryService 작성 + in-memory 테스트 그린)

## Goal

Phase 04에서 정의한 Port들의 실제 Adapter 구현을 만들고, REST 엔드포인트를 노출해서 **회원가입 ~ 조회 ~ 탈퇴 E2E 시나리오**를 통과시킨다.

---

## 산출물 체크리스트

### Read Model 인프라 (`src/contexts/identity/infrastructure/persistence/read-models/member/`)
- [ ] `member-read.entity.ts` — MikroORM 엔티티
- [ ] `mikro-member-read.repository.impl.ts` — `MemberReadRepository` 구현

### Security (`src/contexts/identity/infrastructure/security/`)
- [ ] `bcrypt-password-encoder.ts` — `PasswordEncoder` 구현

### Email (`src/contexts/identity/infrastructure/email/`)
- [ ] `nodemailer.email-sender.ts` — `EmailSender` 구현 (Gmail SMTP)

### Presentation (`src/contexts/identity/presentation/member/`)
- [ ] `member.controller.ts`
- [ ] `dto/sign-up.request.dto.ts`
- [ ] `dto/update-member.request.dto.ts`
- [ ] `dto/change-password.request.dto.ts`
- [ ] `dto/reset-password.request.dto.ts`
- [ ] `dto/change-email.request.dto.ts`
- [ ] `dto/add-point.request.dto.ts`
- [ ] `dto/send-verification.request.dto.ts`
- [ ] `dto/verify-email.request.dto.ts`
- [ ] `dto/member.response.dto.ts`

### Shared Kernel
- [ ] `src/shared-kernel/filters/global-exception.filter.ts` — 도메인 예외 → HTTP 매핑
- [ ] `src/shared-kernel/decorators/public.decorator.ts` (Auth 도입 전이지만 미리 작성)

### 모듈
- [ ] `src/contexts/identity/identity.module.ts` — Member 관련 모든 Provider 통합

### 테스트
- [ ] `test/integration/identity/member/mikro-member-read.repo.spec.ts`
- [ ] `test/e2e/member.e2e-spec.ts` — 가입 → 인증 → 가입완료 → 조회 → 수정 → 탈퇴

---

## Step 1. 의존성

```bash
pnpm add bcryptjs nodemailer class-validator class-transformer
pnpm add -D @types/bcryptjs @types/nodemailer
```

---

## Step 2. Read Model 엔티티 + Repository

### 2-1. `member-read.entity.ts`

```typescript
// src/contexts/identity/infrastructure/persistence/read-models/member/member-read.entity.ts
import { Entity, Enum, Index, PrimaryKey, Property } from "@mikro-orm/core";

import { NotificationChannel } from "@/contexts/identity/domain/member/enums/notification.enum";
import { NotificationFrequency } from "@/contexts/identity/domain/member/enums/frequency.enum";

@Entity({ tableName: "member_read" })
export class MemberReadEntity {
  @PrimaryKey({ type: "uuid" })
  id!: string;

  @Property({ unique: true })
  @Index()
  email!: string;

  @Property()
  nickname!: string;

  @Property()
  job!: string;

  @Enum(() => NotificationChannel)
  notification!: NotificationChannel;

  @Enum(() => NotificationFrequency)
  frequency!: NotificationFrequency;

  @Property({ default: 0 })
  point!: number;

  @Property({ default: false })
  isPro!: boolean;

  @Property({ type: "timestamptz" })
  createdAt!: Date;

  @Property({ type: "timestamptz", onUpdate: () => new Date() })
  updatedAt!: Date;

  @Property({ type: "jsonb", nullable: false, default: "[]" })
  activity: string[] = [];
}
```

### 2-2. Repository 구현

```typescript
// src/contexts/identity/infrastructure/persistence/read-models/member/mikro-member-read.repository.impl.ts
import { Injectable } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";

import {
  type MemberReadDto,
  type MemberReadRepository,
} from "@/contexts/identity/application/member/ports/member-read.repository.port";

import { MemberReadEntity } from "./member-read.entity";

@Injectable()
export class MikroMemberReadRepository implements MemberReadRepository {
  constructor(private readonly em: EntityManager) {}

  async findById(id: string): Promise<MemberReadDto | null> {
    const fork = this.em.fork();
    const row = await fork.findOne(MemberReadEntity, { id });
    return row ? this.toDto(row) : null;
  }

  async findByEmail(email: string): Promise<MemberReadDto | null> {
    const fork = this.em.fork();
    const row = await fork.findOne(MemberReadEntity, { email });
    return row ? this.toDto(row) : null;
  }

  async findAll(limit: number, offset: number): Promise<MemberReadDto[]> {
    const fork = this.em.fork();
    const rows = await fork.find(MemberReadEntity, {}, {
      orderBy: { createdAt: "desc" },
      limit, offset,
    });
    return rows.map((r) => this.toDto(r));
  }

  async existsByEmail(email: string): Promise<boolean> {
    const fork = this.em.fork();
    const count = await fork.count(MemberReadEntity, { email });
    return count > 0;
  }

  async insert(dto: MemberReadDto): Promise<void> {
    const fork = this.em.fork();
    fork.create(MemberReadEntity, { ...dto });
    await fork.flush();
  }

  async update(id: string, patch: Partial<MemberReadDto>): Promise<void> {
    const fork = this.em.fork();
    const row = await fork.findOne(MemberReadEntity, { id });
    if (!row) return;
    Object.assign(row, patch);
    await fork.flush();
  }

  async delete(id: string): Promise<void> {
    const fork = this.em.fork();
    await fork.nativeDelete(MemberReadEntity, { id });
  }

  async appendActivity(id: string, date: string): Promise<void> {
    const fork = this.em.fork();
    const row = await fork.findOne(MemberReadEntity, { id });
    if (!row) return;
    if (!row.activity.includes(date)) {
      row.activity = [...row.activity, date];
      await fork.flush();
    }
  }

  private toDto(row: MemberReadEntity): MemberReadDto {
    return {
      id: row.id,
      email: row.email,
      nickname: row.nickname,
      job: row.job,
      notification: row.notification,
      frequency: row.frequency,
      point: row.point,
      isPro: row.isPro,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      activity: row.activity ?? [],
    };
  }
}
```

---

## Step 3. Bcrypt Password Encoder

```typescript
// src/contexts/identity/infrastructure/security/bcrypt-password-encoder.ts
import { Injectable } from "@nestjs/common";
import * as bcrypt from "bcryptjs";

import type { PasswordEncoder } from "@/contexts/identity/application/member/ports/password-encoder.port";

@Injectable()
export class BcryptPasswordEncoder implements PasswordEncoder {
  private readonly rounds = 10;

  encode(plain: string): string {
    return bcrypt.hashSync(plain, this.rounds);
  }

  matches(plain: string, hashed: string): boolean {
    return bcrypt.compareSync(plain, hashed);
  }
}
```

---

## Step 4. Nodemailer Email Sender

```typescript
// src/contexts/identity/infrastructure/email/nodemailer.email-sender.ts
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";

import type { EmailSender } from "@/contexts/identity/application/member/ports/email-sender.port";
import type { Env } from "@/config/env.config";

@Injectable()
export class NodemailerEmailSender implements EmailSender {
  private readonly transporter;

  constructor(config: ConfigService<Env, true>) {
    this.transporter = nodemailer.createTransport({
      host: config.get("SMTP_HOST", { infer: true }),
      port: config.get("SMTP_PORT", { infer: true }),
      secure: false,
      auth: {
        user: config.get("SMTP_USER", { infer: true }),
        pass: config.get("SMTP_PASSWORD", { infer: true }),
      },
    });
  }

  async sendVerificationCode(toEmail: string, code: string): Promise<void> {
    await this.transporter.sendMail({
      from: '"PrePair" <no-reply@prepair.com>',
      to: toEmail,
      subject: "PrePair 이메일 인증 코드",
      html: this.verificationHtml(code),
    });
  }

  async sendTemporaryPassword(toEmail: string, tempPassword: string): Promise<void> {
    await this.transporter.sendMail({
      from: '"PrePair" <no-reply@prepair.com>',
      to: toEmail,
      subject: "PrePair 임시 비밀번호",
      html: this.tempPasswordHtml(tempPassword),
    });
  }

  private verificationHtml(code: string): string {
    return `
      <div style="font-family:sans-serif;padding:24px">
        <h2>PrePair</h2>
        <p>아래 인증 코드를 5분 이내에 입력해주세요.</p>
        <div style="font-size:32px;letter-spacing:8px;font-weight:700;color:#5C6BC0">${code}</div>
      </div>`;
  }

  private tempPasswordHtml(tempPassword: string): string {
    return `
      <div style="font-family:sans-serif;padding:24px">
        <h2>PrePair</h2>
        <p>임시 비밀번호가 발급되었습니다. 로그인 후 즉시 변경해주세요.</p>
        <div style="font-size:20px;font-weight:700;color:#D32F2F">${tempPassword}</div>
      </div>`;
  }
}
```

---

## Step 5. Global Exception Filter (도메인 예외 → HTTP)

```typescript
// src/shared-kernel/filters/global-exception.filter.ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";

import { InvalidEmailException } from "@/contexts/identity/domain/member/exceptions/invalid-email.exception";
import { InvalidPasswordException } from "@/contexts/identity/domain/member/exceptions/invalid-password.exception";
import { InvalidNicknameException } from "@/contexts/identity/domain/member/exceptions/invalid-nickname.exception";
import { InvalidVerificationCodeException } from "@/contexts/identity/domain/member/exceptions/invalid-verification-code.exception";
import { PasswordMismatchException } from "@/contexts/identity/domain/member/exceptions/password-mismatch.exception";

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();

    const { status, code, message } = this.map(exception);

    if (status >= 500) this.logger.error(exception);
    res.status(status).json({ code, message });
  }

  private map(e: unknown): { status: number; code: string; message: string } {
    if (e instanceof HttpException) {
      const r = e.getResponse();
      const msg = typeof r === "string" ? r : (r as any).message ?? e.message;
      return { status: e.getStatus(), code: e.name, message: Array.isArray(msg) ? msg.join(", ") : msg };
    }
    if (e instanceof InvalidEmailException) return { status: HttpStatus.BAD_REQUEST, code: e.code, message: e.message };
    if (e instanceof InvalidPasswordException) return { status: HttpStatus.BAD_REQUEST, code: e.code, message: e.message };
    if (e instanceof InvalidNicknameException) return { status: HttpStatus.BAD_REQUEST, code: e.code, message: e.message };
    if (e instanceof InvalidVerificationCodeException) return { status: HttpStatus.UNAUTHORIZED, code: e.code, message: e.message };
    if (e instanceof PasswordMismatchException) return { status: HttpStatus.UNAUTHORIZED, code: e.code, message: e.message };
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, code: "INTERNAL_ERROR", message: "Internal server error" };
  }
}
```

`main.ts`에 등록:
```typescript
app.useGlobalFilters(new GlobalExceptionFilter());
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
```

---

## Step 6. DTO

```typescript
// src/contexts/identity/presentation/member/dto/sign-up.request.dto.ts
import { IsEmail, IsEnum, IsString, MinLength } from "class-validator";
import { NotificationChannel } from "@/contexts/identity/domain/member/enums/notification.enum";
import { NotificationFrequency } from "@/contexts/identity/domain/member/enums/frequency.enum";

export class SignUpRequestDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(8) password!: string;
  @IsString() nickname!: string;
  @IsString() job!: string;
  @IsEnum(NotificationChannel) notification!: NotificationChannel;
  @IsEnum(NotificationFrequency) frequency!: NotificationFrequency;
}
```

```typescript
// update-member.request.dto.ts
export class UpdateMemberRequestDto {
  @IsOptional() @IsString() job?: string;
  @IsOptional() @IsString() nickname?: string;
  @IsOptional() @IsEnum(NotificationChannel) notification?: NotificationChannel;
  @IsOptional() @IsEnum(NotificationFrequency) frequency?: NotificationFrequency;
}

// change-password.request.dto.ts
export class ChangePasswordRequestDto {
  @IsString() @MinLength(8) currentPassword!: string;
  @IsString() @MinLength(8) newPassword!: string;
}

// reset-password.request.dto.ts
export class ResetPasswordRequestDto {
  @IsEmail() email!: string;
  @IsString() verificationCode!: string;
}

// change-email.request.dto.ts
export class ChangeEmailRequestDto {
  @IsEmail() newEmail!: string;
}

// add-point.request.dto.ts
export class AddPointRequestDto {
  @IsInt() point!: number;
}

// send-verification.request.dto.ts
export class SendVerificationRequestDto {
  @IsEmail() email!: string;
  @IsIn(["REGISTER", "CHANGE_EMAIL", "PASSWORD_RESET"]) purpose!: "REGISTER" | "CHANGE_EMAIL" | "PASSWORD_RESET";
}

// verify-email.request.dto.ts
export class VerifyEmailRequestDto {
  @IsEmail() email!: string;
  @IsString() code!: string;
  @IsIn(["REGISTER", "CHANGE_EMAIL", "PASSWORD_RESET"]) purpose!: "REGISTER" | "CHANGE_EMAIL" | "PASSWORD_RESET";
}

// member.response.dto.ts
export class MemberResponseDto {
  id!: string;
  email!: string;
  nickname!: string;
  job!: string;
  notification!: NotificationChannel;
  frequency!: NotificationFrequency;
  point!: number;
  isPro!: boolean;
  activity!: string[];
  static from(dto: MemberReadDto): MemberResponseDto { return { ...dto } as any; }
}
```

---

## Step 7. MemberController

> Auth 가드는 Phase 06에서 추가된다. 이번 Phase에서는 우선 `@Public()` 데코레이터만 두고, 인증이 필요한 엔드포인트는 `@Body()`에 `memberId`를 받는 임시 방식으로 동작시킨 뒤 Phase 06에서 `@CurrentUser()`로 교체한다.

```typescript
// src/contexts/identity/presentation/member/member.controller.ts
import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query } from "@nestjs/common";
import { Inject } from "@nestjs/common";

import { SignUpMemberUseCase } from "@/contexts/identity/application/member/use-cases/sign-up-member.use-case";
import { UpdateMemberUseCase } from "@/contexts/identity/application/member/use-cases/update-member.use-case";
import { ChangePasswordUseCase } from "@/contexts/identity/application/member/use-cases/change-password.use-case";
import { ResetPasswordUseCase } from "@/contexts/identity/application/member/use-cases/reset-password.use-case";
import { ChangeEmailUseCase } from "@/contexts/identity/application/member/use-cases/change-email.use-case";
import { AddPointUseCase } from "@/contexts/identity/application/member/use-cases/add-point.use-case";
import { WithdrawMemberUseCase } from "@/contexts/identity/application/member/use-cases/withdraw-member.use-case";
import { MemberQueryService } from "@/contexts/identity/application/member/queries/member-query.service";
import { EmailVerificationService } from "@/contexts/identity/application/member/services/email-verification.service";

import { EMAIL_SENDER, type EmailSender } from "@/contexts/identity/application/member/ports/email-sender.port";

import {
  SignUpRequestDto,
  UpdateMemberRequestDto,
  ChangePasswordRequestDto,
  ResetPasswordRequestDto,
  ChangeEmailRequestDto,
  AddPointRequestDto,
  SendVerificationRequestDto,
  VerifyEmailRequestDto,
  MemberResponseDto,
} from "./dto";

@Controller("api/members")
export class MemberController {
  constructor(
    private readonly signUp: SignUpMemberUseCase,
    private readonly updateUC: UpdateMemberUseCase,
    private readonly changePwd: ChangePasswordUseCase,
    private readonly resetPwd: ResetPasswordUseCase,
    private readonly changeEmail: ChangeEmailUseCase,
    private readonly addPoint: AddPointUseCase,
    private readonly withdraw: WithdrawMemberUseCase,
    private readonly query: MemberQueryService,
    private readonly verification: EmailVerificationService,
    @Inject(EMAIL_SENDER) private readonly emailSender: EmailSender,
  ) {}

  @Post("register")
  async register(@Body() dto: SignUpRequestDto) {
    return this.signUp.execute(dto);
  }

  @Post("email")
  async sendVerification(@Body() dto: SendVerificationRequestDto) {
    const code = this.verification.startVerification(dto.email, dto.purpose);
    await this.emailSender.sendVerificationCode(dto.email, code);
    return { sent: true };
  }

  @Post("email-verify")
  async verifyEmail(@Body() dto: VerifyEmailRequestDto) {
    this.verification.verify(dto.email, dto.code, dto.purpose);
    return { verified: true };
  }

  @Get(":id")
  async findOne(@Param("id") id: string): Promise<MemberResponseDto> {
    const m = await this.query.findById(id);
    if (!m) throw new NotFoundException();
    return MemberResponseDto.from(m);
  }

  @Get()
  async findAll(@Query("limit") limit = "20", @Query("offset") offset = "0", @Query("email") email?: string) {
    if (email) {
      return { isEmailExists: await this.query.emailExists(email) };
    }
    const rows = await this.query.findAll(Number(limit), Number(offset));
    return rows.map(MemberResponseDto.from);
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body() dto: UpdateMemberRequestDto) {
    await this.updateUC.execute({ memberId: id, ...dto });
    return { updated: true };
  }

  @Patch(":id/password")
  async changePassword(@Param("id") id: string, @Body() dto: ChangePasswordRequestDto) {
    await this.changePwd.execute({ memberId: id, ...dto });
    return { changed: true };
  }

  @Post("password-reset")
  async resetPassword(@Body() dto: ResetPasswordRequestDto) {
    const result = await this.resetPwd.execute(dto);
    await this.emailSender.sendTemporaryPassword(dto.email, result.temporaryPassword);
    return { reset: true };
  }

  @Patch(":id/email")
  async changeEmailEndpoint(@Param("id") id: string, @Body() dto: ChangeEmailRequestDto) {
    await this.changeEmail.execute({ memberId: id, newEmail: dto.newEmail });
    return { changed: true };
  }

  @Patch(":id/point")
  async addPointEndpoint(@Param("id") id: string, @Body() dto: AddPointRequestDto) {
    await this.addPoint.execute({ memberId: id, amount: dto.point });
    return { added: true };
  }

  @Delete(":id")
  async withdrawEndpoint(@Param("id") id: string) {
    await this.withdraw.execute(id);
    return { withdrawn: true };
  }
}
```

---

## Step 8. Identity Module 통합

```typescript
// src/contexts/identity/identity.module.ts
import { Module } from "@nestjs/common";
import { MikroOrmModule } from "@mikro-orm/nestjs";

import { MemberReadEntity } from "./infrastructure/persistence/read-models/member/member-read.entity";
import { MikroMemberReadRepository } from "./infrastructure/persistence/read-models/member/mikro-member-read.repository.impl";

import { BcryptPasswordEncoder } from "./infrastructure/security/bcrypt-password-encoder";
import { NodemailerEmailSender } from "./infrastructure/email/nodemailer.email-sender";

import { EventSourcedMemberRepository } from "./application/member/repositories/event-sourced-member.repository";
import { MemberProjector } from "./application/member/projections/member.projector";
import { MemberQueryService } from "./application/member/queries/member-query.service";
import { EmailVerificationService } from "./application/member/services/email-verification.service";

import { SignUpMemberUseCase } from "./application/member/use-cases/sign-up-member.use-case";
import { UpdateMemberUseCase } from "./application/member/use-cases/update-member.use-case";
import { ChangePasswordUseCase } from "./application/member/use-cases/change-password.use-case";
import { ResetPasswordUseCase } from "./application/member/use-cases/reset-password.use-case";
import { ChangeEmailUseCase } from "./application/member/use-cases/change-email.use-case";
import { AddPointUseCase } from "./application/member/use-cases/add-point.use-case";
import { WithdrawMemberUseCase } from "./application/member/use-cases/withdraw-member.use-case";

import { MEMBER_REPOSITORY } from "./application/member/ports/member-event-sourced.repository.port";
import { MEMBER_READ_REPOSITORY } from "./application/member/ports/member-read.repository.port";
import { PASSWORD_ENCODER } from "./application/member/ports/password-encoder.port";
import { EMAIL_SENDER } from "./application/member/ports/email-sender.port";

import { MemberController } from "./presentation/member/member.controller";

@Module({
  imports: [MikroOrmModule.forFeature([MemberReadEntity])],
  controllers: [MemberController],
  providers: [
    // Repositories
    MikroMemberReadRepository,
    EventSourcedMemberRepository,
    { provide: MEMBER_REPOSITORY, useExisting: EventSourcedMemberRepository },
    { provide: MEMBER_READ_REPOSITORY, useExisting: MikroMemberReadRepository },

    // Infrastructure
    BcryptPasswordEncoder,
    NodemailerEmailSender,
    { provide: PASSWORD_ENCODER, useExisting: BcryptPasswordEncoder },
    { provide: EMAIL_SENDER, useExisting: NodemailerEmailSender },

    // Services
    EmailVerificationService,
    MemberQueryService,
    MemberProjector,

    // UseCases
    SignUpMemberUseCase,
    UpdateMemberUseCase,
    ChangePasswordUseCase,
    ResetPasswordUseCase,
    ChangeEmailUseCase,
    AddPointUseCase,
    WithdrawMemberUseCase,
  ],
  exports: [MEMBER_REPOSITORY, MEMBER_READ_REPOSITORY, PASSWORD_ENCODER],
})
export class IdentityModule {}
```

`AppModule`에 등록:
```typescript
@Module({
  imports: [
    /* ... */
    ShardKernelModule,
    IdentityModule,
  ],
})
```

---

## Step 9. 마이그레이션

```bash
pnpm exec mikro-orm migration:create
pnpm exec mikro-orm migration:up
# member_read 테이블 생성 확인
docker exec -it prepair-db psql -U prepair -d prepair -c "\dt"
```

---

## Step 10. E2E 테스트

```typescript
// test/e2e/member.e2e-spec.ts
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import * as request from "supertest";

import { AppModule } from "@/app.module";
import { GlobalExceptionFilter } from "@/shared-kernel/filters/global-exception.filter";
import { EmailVerificationService } from "@/contexts/identity/application/member/services/email-verification.service";

describe("Member E2E", () => {
  let app: INestApplication;
  let verification: EmailVerificationService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();

    verification = app.get(EmailVerificationService);
  });

  afterAll(() => app.close());

  it("회원가입 → 조회 → 수정 → 탈퇴 시나리오", async () => {
    const email = `e2e-${Date.now()}@test.com`;

    // 1) 이메일 인증 시작
    await request(app.getHttpServer()).post("/api/members/email").send({ email, purpose: "REGISTER" }).expect(201);

    // 2) 코드 가져오기 (실제 메일 대신 service 내부 접근)
    const code = (verification as any).pending.get(`REGISTER:${email}`).code.value as string;

    // 3) 인증 코드 검증
    await request(app.getHttpServer()).post("/api/members/email-verify")
      .send({ email, code, purpose: "REGISTER" }).expect(201);

    // 4) 가입
    const signUpRes = await request(app.getHttpServer()).post("/api/members/register").send({
      email, password: "password123", nickname: "nick", job: "dev",
      notification: "EMAIL", frequency: "WEEKLY",
    }).expect(201);
    const { memberId } = signUpRes.body;
    expect(memberId).toBeDefined();

    // 5) 조회 (Projection 즉시 반영 확인)
    const findRes = await request(app.getHttpServer()).get(`/api/members/${memberId}`).expect(200);
    expect(findRes.body.email).toBe(email);
    expect(findRes.body.point).toBe(0);

    // 6) 수정
    await request(app.getHttpServer()).patch(`/api/members/${memberId}`).send({ nickname: "newnick" }).expect(200);
    const updated = await request(app.getHttpServer()).get(`/api/members/${memberId}`);
    expect(updated.body.nickname).toBe("newnick");

    // 7) 포인트 추가
    await request(app.getHttpServer()).patch(`/api/members/${memberId}/point`).send({ point: 100 }).expect(200);
    const withPoint = await request(app.getHttpServer()).get(`/api/members/${memberId}`);
    expect(withPoint.body.point).toBe(100);

    // 8) 탈퇴
    await request(app.getHttpServer()).delete(`/api/members/${memberId}`).expect(200);
    await request(app.getHttpServer()).get(`/api/members/${memberId}`).expect(404);
  });
});
```

`package.json` 스크립트:
```json
{
  "scripts": {
    "test:e2e": "jest --config test/jest-e2e.json"
  }
}
```

`test/jest-e2e.json`:
```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": "..",
  "testRegex": ".e2e-spec\\.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" },
  "moduleNameMapper": { "^@/(.*)$": "<rootDir>/src/$1" },
  "testEnvironment": "node"
}
```

---

## 검증 (Definition of Done)

```bash
# 1) DB 띄우기
docker compose -f docker/docker-compose.dev.yaml up -d

# 2) 마이그레이션
pnpm exec mikro-orm migration:up

# 3) 통합 테스트
pnpm test test/integration/identity/member

# 4) E2E
pnpm test:e2e

# 5) member_read 테이블 직접 확인
docker exec -it prepair-db psql -U prepair -d prepair -c "SELECT id, email, nickname, point FROM member_read;"
docker exec -it prepair-db psql -U prepair -d prepair -c "SELECT aggregate_id, event_type, event_version FROM event_store ORDER BY sequence;"
```

체크리스트:
- [ ] E2E 시나리오 전체 그린
- [ ] `event_store`에 가입~탈퇴 모든 이벤트 기록
- [ ] `member_read`가 Projector로 자동 갱신
- [ ] 탈퇴 시 `member_read` row 삭제됨
- [ ] (DB에 `member` 같은 정규화 Command 테이블이 **없다** ✅)

---

다음: [`06-auth-domain.md`](./06-auth-domain.md) — JWT/RefreshToken, 로그인 흐름
