# Issue #32: OAuth 회원가입 Read Model 미반영 + OAuth 연동 기능

## 문제 1: OAuth 회원가입 시 `member_read` 테이블에 데이터가 들어가지 않음

### 근본 원인

`MemberRegisterEventHandler`에서 `memberReadRepository.save(dto)`를 호출하지만, `MemberReadRepositoryImpl.save()`는 `em.merge(entity)`만 수행하고 **`em.flush()`를 호출하지 않는다**. 또한 **`em.fork()`도 하지 않는다**.

이 문제는 OAuth 회원가입뿐 아니라 **일반 이메일 회원가입에서도 동일하게 발생할 수 있다**.

### 문제 코드 분석

**`src/adapter/member/persistence/read/member-read.repository-impl.ts:13-18`**
```typescript
save(dto: MemberReadDto): void {
  const entity: MemberReadEntity = this.toEntity(dto);
  this.em.merge(entity);  // ❌ merge만 하고 flush 없음
}
```

**`src/application/member/event/member-register-event-handler.service.ts:55`**
```typescript
this.memberReadRepository.save(dto);  // save 호출하지만 DB에 반영 안 됨
```

### 왜 동작하지 않는가

1. Command Handler(`OAuthMemberRegisterCommandHandler`)가 `@Transactional()` 내에서 `em.flush()`를 먼저 실행하고, 그 후에 `eventBus.publish()`를 호출한다.
2. Event Handler가 같은 EntityManager 컨텍스트에서 `em.merge()`를 실행하지만, **이미 트랜잭션은 flush된 상태**이므로 merge된 엔티티가 DB에 쓰여지지 않는다.
3. `@nestjs/cqrs`의 `eventBus.publish()`는 동기적으로 핸들러를 호출하지만, 핸들러 실행 후 추가적인 flush가 없다.

### 참고: 올바르게 동작하는 다른 Event Handler

`MemberPasswordChangedEventHandler`는 올바르게 구현되어 있다:

```typescript
// src/application/member/event/member-password-changed-event-handler.service.ts
async handle(event: MemberPasswordChangedEvent) {
  const em = this.em.fork();  // ✅ 새로운 EntityManager 컨텍스트
  const entity = await em.findOne(MemberReadEntity, { id: event.memberId });
  entity.updatedAt = event.occurredAt;
  await em.flush();  // ✅ 명시적 flush
}
```

### 수정 방법

**방법 A (권장): Event Handler에서 `em.fork()` + `em.flush()` 사용**

`MemberPasswordChangedEventHandler`와 동일한 패턴을 적용한다.

**`src/application/member/event/member-register-event-handler.service.ts` 수정:**

```typescript
@Injectable()
@EventsHandler(MemberRegisterEvent)
export class MemberRegisterEventHandler
  implements IEventHandler<MemberRegisterEvent>
{
  constructor(
    private readonly em: EntityManager,  // EntityManager 직접 주입
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  async handle(event: MemberRegisterEvent): Promise<void> {
    this.logger.log("Member register event handling started", {
      module: "MemberRegisterEventHandler",
      memberId: event.memberId,
      email: event.email,
    });

    try {
      const em = this.em.fork();  // ✅ 새 컨텍스트 생성

      // 멱등성 보장
      const existing = await em.findOne(MemberReadEntity, { id: event.memberId });
      if (existing) {
        this.logger.warn("Member read entity already exists, skipping", {
          module: "MemberRegisterEventHandler",
          memberId: event.memberId,
        });
        return;
      }

      const entity = new MemberReadEntity();
      entity.id = event.memberId;
      entity.email = event.email;
      entity.job = event.job;
      entity.nickname = event.nickname;
      entity.notification = event.notification;
      entity.frequency = event.frequency;
      entity.point = 0;
      entity.isPro = false;
      entity.createdAt = event.occurredAt;
      entity.updatedAt = event.occurredAt;

      em.persist(entity);
      await em.flush();  // ✅ 명시적 flush

      this.logger.log("Member register event handling completed", {
        module: "MemberRegisterEventHandler",
        memberId: event.memberId,
      });
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException) {
        this.logger.warn(
          "Member read entity already exists (race condition), skipping",
          { module: "MemberRegisterEventHandler", memberId: event.memberId },
        );
        return;
      }
      this.logger.error("Member register event handling failed",
        error instanceof Error ? error : undefined,
        { module: "MemberRegisterEventHandler", memberId: event.memberId },
      );
      throw error;
    }
  }
}
```

핵심 변경점:
- `MemberReadRepository` 의존성 제거 → `EntityManager` 직접 사용
- `this.em.fork()`로 독립된 컨텍스트 생성
- `em.persist(entity)` + `await em.flush()`로 확실하게 DB 반영

**방법 B (대안): `MemberReadRepositoryImpl.save()`에 flush 추가**

```typescript
async save(dto: MemberReadDto): Promise<void> {
  const em = this.em.fork();
  const entity: MemberReadEntity = this.toEntity(dto);
  em.persist(entity);
  await em.flush();
}
```

이 방법은 Repository 인터페이스를 `async`로 변경해야 하므로, 다른 호출부도 함께 수정해야 한다. 방법 A가 더 간단하다.

---

## 문제 2: 이메일로 가입한 회원이 나중에 카카오 OAuth를 연동하는 기능

### 현재 상태

현재 코드에는 **카카오 로그인 콜백 시 자동 연동** 로직이 이미 있다.

**`src/application/oauth/kaka-oauth.service.ts:79-91`** (Case 2):
```typescript
// Case 2: 동일 이메일로 가입된 일반 회원이 있는 경우 → OAuth 연결 후 로그인
const existingMember = await this.memberRepository.findByEmail(email);

if (existingMember) {
  await this.connectOAuthToExistingMember(existingMember, providerId, email);
  return this.loginExistingMember(existingMember.id);
}
```

즉, **카카오 계정의 이메일**과 **이미 가입한 이메일**이 동일하면 자동으로 `OAuthConnection`이 생성되고 로그인된다.

### 문제점과 개선 필요 사항

그러나 이 로직에는 몇 가지 문제가 있다:

#### 1. 이메일이 다른 경우를 처리하지 못함

사용자가 `a@gmail.com`으로 이메일 가입 후, 카카오 계정(`b@kakao.com`)으로 연동하려는 경우 → 현재는 **새 회원 가입으로 처리**되어 중복 계정이 만들어진다.

#### 2. 사용자의 명시적 동의 없이 자동 연동

동일 이메일이라고 자동으로 연동하는 것은 보안상 위험할 수 있다. 제3자가 카카오에서 같은 이메일을 사용할 수 있기 때문이다.

#### 3. 로그인된 상태에서 OAuth 연동 API가 없음

사용자가 직접 "카카오 연결하기" 버튼을 눌러 기존 계정에 OAuth를 연동하는 명시적인 API가 없다.

### 권장 해결 방안: 명시적 OAuth 연동 API 추가

로그인된 사용자가 자신의 계정에 OAuth provider를 연동하는 전용 엔드포인트를 추가한다.

#### 전체 흐름

```
[로그인된 상태] → "카카오 연결하기" 클릭
  → GET /oauth/kakao/link (redirect_uri에 link 용 콜백 지정)
  → 카카오 인증 → callback
  → POST /oauth/kakao/link/callback?code=xxx
  → JWT에서 memberId 추출 + 카카오에서 providerId 추출
  → OAuthConnection 생성
  → 성공 응답
```

#### 구현해야 할 파일들

**1. Controller: `src/adapter/oauth/api/kakao-oauth.controller.ts`**

새 엔드포인트 추가:

```typescript
@UseGuards(JwtAuthGuard)
@Post('kakao/link')
async linkKakaoAccount(
  @Req() req: AuthenticatedRequest,
  @Body() body: LinkKakaoDto,  // { code: string }
) {
  return this.kakaOauthService.linkToExistingMember(
    req.user.memberId,
    body.code,
  );
}
```

**2. DTO: `src/adapter/oauth/api/dto/link-kakao.dto.ts`**

```typescript
import { IsNotEmpty, IsString } from 'class-validator';

export class LinkKakaoDto {
  @IsString()
  @IsNotEmpty()
  code: string;
}
```

**3. Service: `src/application/oauth/kaka-oauth.service.ts`**

새 메서드 추가:

```typescript
async linkToExistingMember(memberId: string, code: string) {
  // 1. 카카오 인증
  const tokens = await this.oauthProvider.exchangeCodeForAccessToken(code);
  const userInfo = await this.oauthProvider.getUserInfo(tokens.accessToken);

  // 2. 이미 연결된 카카오 계정인지 확인
  const existingConnection = await this.oauthConnectionRepository
    .findByProviderAndProviderId('kakao', userInfo.providerId);

  if (existingConnection) {
    if (existingConnection.memberId === memberId) {
      throw new ConflictException('이미 연결된 카카오 계정입니다.');
    }
    throw new ConflictException('해당 카카오 계정은 다른 회원에게 연결되어 있습니다.');
  }

  // 3. 해당 회원에 이미 카카오 연동이 있는지 확인
  const memberConnections = await this.oauthConnectionRepository
    .findByMemberIdAndProvider(memberId, 'kakao');

  if (memberConnections) {
    throw new ConflictException('이미 카카오 계정이 연동되어 있습니다.');
  }

  // 4. OAuthConnection 생성
  const connection = OAuthConnection.connect({
    memberId,
    provider: 'kakao',
    providerId: userInfo.providerId,
    email: userInfo.email,
  });

  this.oauthConnectionRepository.save(connection);
  await this.em.flush();

  return { linked: true, provider: 'kakao' };
}
```

**4. Repository 메서드 추가: `src/domain/oauth/oauth.repository.ts`**

`OauthRepository` 인터페이스에 메서드 추가:

```typescript
export interface OauthRepository {
  save(connection: OAuthConnection): void;
  findByProviderAndProviderId(
    provider: OAuthProvider,
    providerId: string,
  ): Promise<OAuthConnection | null>;

  // ✅ 새로 추가
  findByMemberIdAndProvider(
    memberId: string,
    provider: OAuthProvider,
  ): Promise<OAuthConnection | null>;
}
```

**5. Repository 구현체: `src/adapter/oauth/persistence/oauth.repository-impl.ts`**

```typescript
async findByMemberIdAndProvider(
  memberId: string,
  provider: OAuthProvider,
): Promise<OAuthConnection | null> {
  const entity = await this.em.findOne(OAuthConnectionEntity, {
    memberId,
    provider,
  });
  if (!entity) return null;
  return this.mapper.toDomain(entity);
}
```

### 보안 고려사항

- `linkToExistingMember`는 반드시 `JwtAuthGuard`로 보호해야 한다 (로그인 필수).
- 카카오 계정 1개는 1명의 회원에만 연결 가능하도록 유니크 제약조건을 확인한다.
- 기존 Case 2 (자동 연동)의 보안 강화를 고려한다. 자동 연동 대신 등록 토큰을 발급하고 사용자에게 "기존 계정에 연결할지" 확인을 받는 방식도 가능하다.

---

## 수정 파일 요약

| 파일 | 변경 유형 | 설명 |
|------|----------|------|
| `src/application/member/event/member-register-event-handler.service.ts` | **수정** | `em.fork()` + `em.flush()` 패턴 적용 |
| `src/adapter/oauth/api/kakao-oauth.controller.ts` | **수정** | `POST /oauth/kakao/link` 엔드포인트 추가 |
| `src/adapter/oauth/api/dto/link-kakao.dto.ts` | **신규** | 연동 요청 DTO |
| `src/application/oauth/kaka-oauth.service.ts` | **수정** | `linkToExistingMember()` 메서드 추가 |
| `src/domain/oauth/oauth.repository.ts` | **수정** | `findByMemberIdAndProvider()` 인터페이스 추가 |
| `src/adapter/oauth/persistence/oauth.repository-impl.ts` | **수정** | `findByMemberIdAndProvider()` 구현 |
