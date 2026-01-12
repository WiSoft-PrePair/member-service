# 비밀번호 찾기 기능 구현 가이드

## 요구사항

1. 사용자가 email로 사용자 조회
2. 이메일로 인증 코드 발송
3. 인증 코드 확인
4. 인증 성공 시 **랜덤 임시 비밀번호** 생성 → DB 저장 → 사용자에게 임시 비밀번호 반환

## 현재 프로젝트 패턴 분석

### 기존 활용 가능한 컴포넌트

#### 1. EmailVerificationService (재사용 가능)
**위치**: `src/application/member/service/email-verification.service.ts`

```typescript
// 이미 구현된 메서드들
saveVerificationCode(email: string): VerificationCode  // 4자리 랜덤 코드 생성
verifyCode(email: string, inputCode: string): boolean  // 코드 검증
isEmailVerified(email: string): boolean                // 검증 완료 확인
consumeVerifiedEmail(email: string): boolean           // 검증 상태 소비 (일회용)
```

#### 2. 비밀번호 변경 패턴
**위치**: `src/application/member/command/member-change-password.command.ts`

```typescript
// 기존 ChangePasswordCommand는 현재 비밀번호 검증이 필요함
public changePassword(
  currentPassword: string,  // ← 비밀번호 찾기에는 없음!
  newPassword: string,
  encoder: PasswordEncoder,
): Member
```

**문제점**: 비밀번호 찾기는 현재 비밀번호를 모르는 상황이므로 **새로운 도메인 메서드 필요**

#### 3. Password Value Object
**위치**: `src/domain/member/value-objects/password.ts`

```typescript
// 비밀번호 생성 (검증 + 해싱)
public static create(plainPassword: string, encoder: PasswordEncoder): Password

// 검증 로직
private static validate(password: string): void {
  if (password.length < Password.MIN_LENGTH) {  // MIN_LENGTH = 8
    throw new InvalidPasswordException();
  }
}
```

#### 4. EmailVerificationPurpose (확장 필요)
**위치**: `src/application/member/service/email-verification-purpose.enum.ts`

```typescript
// 현재 정의된 타입
export type EmailVerificationPurpose = "REGISTER" | "CHANGE_EMAIL";

// 추가 필요: "PASSWORD_RESET"
```

---

## 구현 계획

### Phase 1: 도메인 계층 확장

#### 1-1. EmailVerificationPurpose 타입 확장
**파일**: `src/application/member/service/email-verification-purpose.enum.ts`

```typescript
export type EmailVerificationPurpose =
  | "REGISTER"
  | "CHANGE_EMAIL"
  | "PASSWORD_RESET";  // ← 추가
```

#### 1-2. Member 도메인에 resetPassword 메서드 추가
**파일**: `src/domain/member/member.ts`

```typescript
/**
 * 비밀번호 재설정 (현재 비밀번호 검증 없이)
 * 이메일 인증 완료 후에만 호출되어야 함
 */
public resetPassword(password: string, encoder: PasswordEncoder): Member {
  const newPassword: Password = Password.create(password, encoder);

  return new Member({
    id: this.id,
    email: this.email,
    password: newPassword,
    job: this.job,
    nickname: this.nickname,
    notification: this.notification,
    frequency: this.frequency,
    point: this.point,
    isPro: this.isPro,
  });
}
```

#### 1-3. 도메인 이벤트 추가
**파일**: `src/domain/member/events/member-password-reset.event.ts`

```typescript
import { type IEvent } from "@nestjs/cqrs";

export class MemberPasswordResetEvent implements IEvent {
  constructor(
    public readonly memberId: string,
    public readonly newPasswordHash: string,
    public readonly occurredAt: Date = new Date(
      Date.now() + 9 * 60 * 60 * 1000,  // KST
    ),
  ) {}
}
```

---

### Phase 2: Application 계층 구현

#### 2-1. ResetPasswordCommand 생성
**파일**: `src/application/member/command/reset-password.command.ts`

```typescript
import { type ICommand } from "@nestjs/cqrs";

export class ResetPasswordCommand implements ICommand {
  constructor(
    public readonly email: string,
    public readonly verificationCode: string,
  ) {}
}
```

#### 2-2. ResetPasswordCommandHandler 구현
**파일**: `src/application/member/command/reset-password.command.ts`

```typescript
import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus, type ICommandHandler } from "@nestjs/cqrs";
import { Transactional } from "@mikro-orm/core";
import { EntityManager } from "@mikro-orm/postgresql";
import { ResetPasswordCommand } from "./reset-password.command";
import {
  type MemberRepository,
  MEMBER_REPOSITORY
} from "@/domain/member/member.repository";
import {
  type PasswordEncoder,
  PASSWORD_ENCODER
} from "@/domain/member/password-encoder";
import { type EventStore, EVENT_STORE } from "@/domain/shared/event-store";
import { createDomainEvent } from "@/domain/shared/domain-event";
import { MemberPasswordResetEvent } from "@/domain/member/events/member-password-reset.event";
import { EmailVerificationService } from "@/application/member/service/email-verification.service";
import { InvalidVerificationCodeException } from "@/domain/member/exceptions/invalid-verification-code.exception";
import { NotFoundException } from "@/domain/shared/exceptions/not-found.exception";
import { Member } from "@/domain/member/member";

// 임시 비밀번호 생성 함수
function generateTemporaryPassword(): string {
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const numbers = "0123456789";
  const special = "!@#$%^&*";
  const all = uppercase + lowercase + numbers + special;

  // 최소 조건 만족 (대문자 1, 소문자 1, 숫자 1, 특수문자 1)
  let password = "";
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];

  // 나머지 4자리 랜덤
  for (let i = 0; i < 4; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }

  // 셔플 (순서 예측 방지)
  return password.split("").sort(() => Math.random() - 0.5).join("");
}

export interface ResetPasswordResult {
  memberId: string;
  temporaryPassword: string;  // 평문 임시 비밀번호 (한 번만 반환)
}

@Injectable()
@CommandHandler(ResetPasswordCommand)
export class ResetPasswordCommandHandler
  implements ICommandHandler<ResetPasswordCommand, ResetPasswordResult>
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
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  @Transactional()
  async execute(command: ResetPasswordCommand): Promise<ResetPasswordResult> {
    // 1. 인증 코드 검증
    const isValid: boolean = this.emailVerificationService.verifyCode(
      command.email,
      command.verificationCode,
    );

    if (!isValid) {
      throw new InvalidVerificationCodeException();
    }

    // 2. 회원 조회 (write model)
    const existMember: Member | null = await this.memberRepository.findByEmail(
      command.email,
    );

    if (!existMember) {
      throw new NotFoundException("Member");
    }

    // 3. 랜덤 임시 비밀번호 생성
    const temporaryPassword: string = generateTemporaryPassword();

    // 4. 도메인 메서드 호출 (비밀번호 재설정)
    const updatedMember: Member = existMember.resetPassword(
      temporaryPassword,
      this.passwordEncoder,
    );

    // 5. Write model 업데이트
    this.memberRepository.update(updatedMember);

    // 6. Event Store에 이벤트 기록 (트랜잭션 내)
    this.eventStore.append(
      createDomainEvent(updatedMember.id, "MemberPasswordReset", {
        id: updatedMember.id,
        resetAt: new Date().toISOString(),
      }),
    );

    // 7. 트랜잭션 플러시
    await this.em.flush();

    // 8. Integration Event 발행 (트랜잭션 후)
    this.eventBus.publish(
      new MemberPasswordResetEvent(
        updatedMember.id,
        updatedMember.password.value,  // 해싱된 비밀번호
      ),
    );

    // 9. 인증 상태 소비 (일회용)
    this.emailVerificationService.consumeVerifiedEmail(command.email);

    // 10. 결과 반환 (평문 임시 비밀번호 포함)
    return {
      memberId: updatedMember.id,
      temporaryPassword,  // ← 사용자에게 보여줄 평문 비밀번호
    };
  }
}
```

#### 2-3. 이벤트 핸들러 구현 (Read Model 업데이트)
**파일**: `src/application/member/event/member-password-reset-event-handler.service.ts`

```typescript
import { Injectable } from "@nestjs/common";
import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";
import { EntityManager } from "@mikro-orm/postgresql";
import { MemberPasswordResetEvent } from "@/domain/member/events/member-password-reset.event";
import { MemberReadEntity } from "@/adapter/member/persistence/read/member-read.entity";

@Injectable()
@EventsHandler(MemberPasswordResetEvent)
export class MemberPasswordResetEventHandler
  implements IEventHandler<MemberPasswordResetEvent>
{
  constructor(private readonly em: EntityManager) {}

  async handle(event: MemberPasswordResetEvent): Promise<void> {
    // 1. Read Model용 EntityManager fork
    const em = this.em.fork();

    // 2. Read Model 조회
    const entity: MemberReadEntity | null = await em.findOne(MemberReadEntity, {
      id: event.memberId,
    });

    if (!entity) {
      return;  // Read Model이 없으면 스킵 (최종 일관성)
    }

    // 3. Read Model 업데이트
    entity.updatedAt = event.occurredAt;

    // 4. 변경사항 플러시
    await em.flush();
  }
}
```

---

### Phase 3: Adapter 계층 구현

#### 3-1. ResetPasswordDto 생성
**파일**: `src/adapter/member/api/dto/reset-password.dto.ts`

```typescript
import { IsEmail, IsString, Length } from "class-validator";

export class ResetPasswordDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(4, 4)  // 인증 코드 4자리
  verificationCode!: string;
}
```

#### 3-2. DTO export 추가
**파일**: `src/adapter/member/api/dto/index.ts`

```typescript
// 기존 exports...
export { ResetPasswordDto } from "./reset-password.dto";
```

#### 3-3. Controller 엔드포인트 추가
**파일**: `src/adapter/member/api/member.controller.ts`

```typescript
// imports에 추가
import { ResetPasswordDto } from "@/adapter/member/api/dto";
import { ResetPasswordCommand } from "@/application/member/command";

// MemberController 클래스 내부에 메서드 추가:

@Public()
@Post("password-reset")
async resetPassword(@Body() dto: ResetPasswordDto) {
  const result = await this.commandBus.execute<
    ResetPasswordCommand,
    ResetPasswordResult
  >(
    new ResetPasswordCommand(
      dto.email,
      dto.verificationCode,
    ),
  );

  return {
    success: true,
    memberId: result.memberId,
    temporaryPassword: result.temporaryPassword,  // ← 임시 비밀번호 반환
    message: "비밀번호가 재설정되었습니다. 임시 비밀번호로 로그인 후 변경해주세요.",
  };
}
```

#### 3-4. Command export 추가
**파일**: `src/application/member/command/index.ts`

```typescript
// 기존 exports...
export { ResetPasswordCommand } from "./reset-password.command";
export { ResetPasswordCommandHandler } from "./reset-password.handler";
export type { ResetPasswordResult } from "./reset-password.handler";
```

#### 3-5. Event export 추가
**파일**: `src/domain/member/events/index.ts`

```typescript
// 기존 exports...
export { MemberPasswordResetEvent } from "./member-password-reset.event";
```

#### 3-6. Module에 핸들러 등록
**파일**: `src/adapter/member/member.module.ts`

```typescript
// imports에 추가
import { ResetPasswordCommandHandler } from "@/application/member/command";
import { MemberPasswordResetEventHandler } from "@/application/member/event/member-password-reset-event-handler.service";

// providers 배열 수정
const CommandHandlers = [
  // 기존 handlers...
  ResetPasswordCommandHandler,  // ← 추가
];

const EventHandlers = [
  // 기존 handlers...
  MemberPasswordResetEventHandler,  // ← 추가
];
```

---

### Phase 4: 예외 클래스 추가 (필요시)

#### 4-1. InvalidVerificationCodeException
**파일**: `src/domain/member/exceptions/invalid-verification-code.exception.ts`

```typescript
import { DomainException } from "@/domain/shared/exceptions/domain.exception";

export class InvalidVerificationCodeException extends DomainException {
  constructor() {
    super("인증 코드가 올바르지 않거나 만료되었습니다.");
  }
}
```

#### 4-2. Exception export
**파일**: `src/domain/member/exceptions/index.ts`

```typescript
// 기존 exports...
export { InvalidVerificationCodeException } from "./invalid-verification-code.exception";
```

---

## 전체 플로우

### 1단계: 인증 코드 발송
```http
POST /api/members/email
Content-Type: application/json

{
  "email": "user@example.com",
  "purpose": "PASSWORD_RESET"
}
```

**처리 로직** (기존 `SendEmailVerificationCommand` 재사용):
1. 회원 존재 여부 확인 (read model)
2. 4자리 랜덤 코드 생성
3. 이메일 발송 (Nodemailer)
4. 메모리에 5분간 저장

### 2단계: 비밀번호 재설정
```http
POST /api/members/password-reset
Content-Type: application/json

{
  "email": "user@example.com",
  "verificationCode": "1234"
}
```

**처리 로직** (`ResetPasswordCommandHandler`):
1. 인증 코드 검증
2. 회원 조회 (write model)
3. **랜덤 임시 비밀번호 생성** (8자리: 대/소/숫자/특수문자 포함)
4. 도메인 메서드 `resetPassword()` 호출
5. Write model 업데이트
6. Event Store에 이벤트 저장
7. 트랜잭션 커밋
8. Integration Event 발행 → Read Model 업데이트
9. 인증 상태 소비 (일회용)
10. **임시 비밀번호 평문 반환**

**응답**:
```json
{
  "success": true,
  "memberId": "uuid-string",
  "temporaryPassword": "aB3$xY9z",
  "message": "비밀번호가 재설정되었습니다. 임시 비밀번호로 로그인 후 변경해주세요."
}
```

### 3단계: 임시 비밀번호로 로그인
```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "aB3$xY9z"
}
```

### 4단계: 비밀번호 변경
```http
PATCH /api/members/password
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "currentPassword": "aB3$xY9z",
  "newPassword": "MyNewSecurePassword123!"
}
```

---

## 보안 고려사항

### 1. 인증 코드 관리
- **만료 시간**: 5분 (EmailVerificationService 기본값)
- **일회용**: `consumeVerifiedEmail()`로 사용 후 소비
- **메모리 저장**: 재시작 시 초기화 (필요 시 Redis 등으로 마이그레이션)

### 2. 임시 비밀번호 정책
- **길이**: 8자리 이상
- **복잡도**: 대문자, 소문자, 숫자, 특수문자 최소 1개씩 포함
- **랜덤성**: Math.random() + 셔플링 (프로덕션에서는 `crypto.randomBytes()` 권장)
- **노출 제한**: 평문은 API 응답에 한 번만 포함, DB에는 해시만 저장

### 3. Rate Limiting
- 인증 코드 발송: IP/email 기준 횟수 제한 필요 (스팸 방지)
- 비밀번호 재설정: IP/email 기준 횟수 제한 필요 (무차별 대입 방지)
- 구현 방법: `@nestjs/throttler` 또는 Redis 기반 rate limiter

### 4. 이메일 검증
- 회원 존재 여부 노출 방지 고려 (타이밍 공격 방어)
- 성공/실패 시 동일한 응답 메시지 사용 가능

---

## 개선 사항 제안

### 1. 임시 비밀번호 만료
현재는 임시 비밀번호가 영구 유효합니다. 개선 방안:
- Member 엔티티에 `passwordResetRequired: boolean` 필드 추가
- 로그인 시 플래그 확인 → 강제 비밀번호 변경 유도
- 또는 임시 비밀번호 생성 시간 저장 → 24시간 후 자동 만료

### 2. 프로덕션 랜덤 생성
현재 `Math.random()` 사용 → `crypto.randomBytes()` 권장:

```typescript
import { randomBytes } from "node:crypto";

function generateSecureTemporaryPassword(): string {
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const numbers = "0123456789";
  const special = "!@#$%^&*";

  // 암호학적으로 안전한 랜덤 바이트 생성
  const buffer = randomBytes(8);

  let password = "";
  password += uppercase[buffer[0] % uppercase.length];
  password += lowercase[buffer[1] % lowercase.length];
  password += numbers[buffer[2] % numbers.length];
  password += special[buffer[3] % special.length];

  const all = uppercase + lowercase + numbers + special;
  for (let i = 4; i < 8; i++) {
    password += all[buffer[i] % all.length];
  }

  return password.split("").sort(() => randomBytes(1)[0] - 128).join("");
}
```

### 3. 이메일 전송 개선
임시 비밀번호를 이메일로도 전송 고려:
- API 응답으로만 제공 시 사용자가 놓칠 수 있음
- 이메일 템플릿에 임시 비밀번호 포함
- 보안 권장사항 안내 (즉시 변경 권장)

### 4. 감사 로깅
비밀번호 재설정 이벤트는 보안 이슈와 직결:
- Event Store에 이미 기록되지만, 추가로 보안 감사 로그 생성 고려
- IP 주소, User-Agent, 시간 등 컨텍스트 정보 저장

---

## 테스트 시나리오

### 단위 테스트

#### 1. 임시 비밀번호 생성 함수
```typescript
describe("generateTemporaryPassword", () => {
  it("should generate 8-character password", () => {
    const password = generateTemporaryPassword();
    expect(password).toHaveLength(8);
  });

  it("should contain at least one uppercase letter", () => {
    const password = generateTemporaryPassword();
    expect(password).toMatch(/[A-Z]/);
  });

  it("should contain at least one lowercase letter", () => {
    const password = generateTemporaryPassword();
    expect(password).toMatch(/[a-z]/);
  });

  it("should contain at least one number", () => {
    const password = generateTemporaryPassword();
    expect(password).toMatch(/[0-9]/);
  });

  it("should contain at least one special character", () => {
    const password = generateTemporaryPassword();
    expect(password).toMatch(/[!@#$%^&*]/);
  });
});
```

#### 2. Member.resetPassword() 도메인 메서드
```typescript
describe("Member.resetPassword", () => {
  it("should update password without validating current password", () => {
    const member = Member.of({...});  // 기존 회원
    const encoder = new SecurePasswordEncoder();

    const newPassword = "NewPass123!";
    const updated = member.resetPassword(newPassword, encoder);

    expect(updated.password.matches(newPassword, encoder)).toBe(true);
  });

  it("should throw exception for invalid password", () => {
    const member = Member.of({...});
    const encoder = new SecurePasswordEncoder();

    expect(() => {
      member.resetPassword("short", encoder);  // 8자 미만
    }).toThrow(InvalidPasswordException);
  });
});
```

#### 3. ResetPasswordCommandHandler
```typescript
describe("ResetPasswordCommandHandler", () => {
  it("should reset password with valid verification code", async () => {
    // Arrange
    const command = new ResetPasswordCommand("test@example.com", "1234");

    mockEmailVerificationService.verifyCode.mockReturnValue(true);
    mockMemberRepository.findByEmail.mockResolvedValue(mockMember);

    // Act
    const result = await handler.execute(command);

    // Assert
    expect(result.temporaryPassword).toHaveLength(8);
    expect(mockMemberRepository.update).toHaveBeenCalled();
    expect(mockEventStore.append).toHaveBeenCalled();
    expect(mockEventBus.publish).toHaveBeenCalledWith(
      expect.any(MemberPasswordResetEvent)
    );
  });

  it("should throw exception for invalid verification code", async () => {
    const command = new ResetPasswordCommand("test@example.com", "9999");

    mockEmailVerificationService.verifyCode.mockReturnValue(false);

    await expect(handler.execute(command)).rejects.toThrow(
      InvalidVerificationCodeException
    );
  });

  it("should throw exception for non-existent member", async () => {
    const command = new ResetPasswordCommand("none@example.com", "1234");

    mockEmailVerificationService.verifyCode.mockReturnValue(true);
    mockMemberRepository.findByEmail.mockResolvedValue(null);

    await expect(handler.execute(command)).rejects.toThrow(
      NotFoundException
    );
  });
});
```

### E2E 테스트

```typescript
describe("Password Reset (e2e)", () => {
  it("should complete full password reset flow", async () => {
    // 1. 인증 코드 발송
    await request(app.getHttpServer())
      .post("/api/members/email")
      .send({
        email: "test@example.com",
        purpose: "PASSWORD_RESET",
      })
      .expect(200);

    // 2. 인증 코드 가져오기 (테스트 환경에서만)
    const verificationService = app.get(EmailVerificationService);
    const savedCode = verificationService["pendingVerifications"]
      .get("test@example.com")?.code.value;

    // 3. 비밀번호 재설정
    const response = await request(app.getHttpServer())
      .post("/api/members/password-reset")
      .send({
        email: "test@example.com",
        verificationCode: savedCode,
      })
      .expect(201);

    expect(response.body).toMatchObject({
      success: true,
      memberId: expect.any(String),
      temporaryPassword: expect.any(String),
    });

    const temporaryPassword = response.body.temporaryPassword;

    // 4. 임시 비밀번호로 로그인
    const loginResponse = await request(app.getHttpServer())
      .post("/auth/login")
      .send({
        email: "test@example.com",
        password: temporaryPassword,
      })
      .expect(200);

    expect(loginResponse.body).toHaveProperty("accessToken");
  });
});
```

---

## 구현 체크리스트

- [ ] `EmailVerificationPurpose`에 "PASSWORD_RESET" 추가
- [ ] `Member.resetPassword()` 도메인 메서드 구현
- [ ] `MemberPasswordResetEvent` 도메인 이벤트 생성
- [ ] `ResetPasswordCommand` 생성
- [ ] `ResetPasswordCommandHandler` 구현
  - [ ] 임시 비밀번호 생성 함수
  - [ ] 인증 코드 검증
  - [ ] 도메인 메서드 호출
  - [ ] Event Store 저장
  - [ ] Read Model 업데이트 이벤트 발행
- [ ] `MemberPasswordResetEventHandler` 구현 (Read Model 업데이트)
- [ ] `ResetPasswordDto` 생성 및 validation
- [ ] Controller 엔드포인트 추가
- [ ] Module에 핸들러 등록
- [ ] `InvalidVerificationCodeException` 추가 (필요시)
- [ ] 단위 테스트 작성
- [ ] E2E 테스트 작성
- [ ] Postman/REST Client 테스트
- [ ] Rate Limiting 적용 고려

---

## API 문서 (참고용)

### POST /api/members/email (기존)
인증 코드 발송

**Request:**
```json
{
  "email": "user@example.com",
  "purpose": "PASSWORD_RESET"
}
```

**Response:**
```json
{
  "success": true,
  "message": "인증 코드가 이메일로 발송되었습니다."
}
```

### POST /api/members/password-reset (신규)
비밀번호 재설정

**Request:**
```json
{
  "email": "user@example.com",
  "verificationCode": "1234"
}
```

**Response:**
```json
{
  "success": true,
  "memberId": "550e8400-e29b-41d4-a716-446655440000",
  "temporaryPassword": "aB3$xY9z",
  "message": "비밀번호가 재설정되었습니다. 임시 비밀번호로 로그인 후 변경해주세요."
}
```

**Error Responses:**
```json
// 인증 코드 오류
{
  "statusCode": 400,
  "message": "인증 코드가 올바르지 않거나 만료되었습니다."
}

// 회원 없음
{
  "statusCode": 404,
  "message": "Member not found"
}
```

---

## 마무리

이 가이드를 따라 구현하면:
1. ✅ 이메일로 사용자 조회
2. ✅ 이메일로 인증 코드 발송
3. ✅ 인증 코드 검증
4. ✅ 랜덤 임시 비밀번호 생성 → DB 저장 → 사용자에게 반환

모든 요구사항을 만족하며, 프로젝트의 CQRS + Event Sourcing + DDD 패턴을 준수합니다.
