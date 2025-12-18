# 프로젝트 아키텍처 (레이어 중심 DDD)

## 폴더 구조

```
src/
├── domain/                              # 핵심 비즈니스 로직
│   └── member/
│       ├── member.ts                    # Aggregate Root
│       ├── member.repository.ts         # Repository 인터페이스 (Port)
│       ├── enums/
│       │   ├── index.ts
│       │   ├── frequency.enum.ts
│       │   └── notification.enum.ts
│       ├── types/
│       │   ├── index.ts
│       │   ├── member.type.ts
│       │   └── member-register.type.ts
│       ├── value-objects/
│       │   ├── index.ts
│       │   └── email.spec.ts
│       ├── exceptions/
│       │   ├── index.ts
│       │   └── invalid-email.exception.ts
│       └── index.ts
│
├── application/                         # 유스케이스 조율
│   └── member/
│       └── register-member.service.ts   # Use Case
│
├── adapter/                             # 외부 세계와의 연결
│   └── member/
│       ├── web/
│       │   ├── member.controller.ts     # HTTP 진입점
│       │   └── dto/
│       │       └── register-member.request.ts
│       ├── persistence/
│       │   ├── member.repository-impl.ts
│       │   ├── member.orm-entity.ts
│       │   └── member.mapper.ts
│       └── member.module.ts             # NestJS 모듈
│
├── app.module.ts
└── main.ts
```

---

## 각 레이어별 역할

### 1. `domain/` - 핵심 비즈니스 로직

**원칙**: 프레임워크 의존성 없음, 순수 비즈니스 규칙만

| 파일 | 역할 |
|------|------|
| `member.ts` | Aggregate Root. 도메인 로직 포함 |
| `member.repository.ts` | Repository 인터페이스 (Port) + Symbol |
| `enums/` | 도메인에서 사용하는 열거형 |
| `types/` | 도메인 타입 정의 |
| `value-objects/` | 불변 객체 (Email 등) |
| `exceptions/` | 도메인 예외 |

```typescript
// domain/member/member.ts
export class Member {
  readonly id: string;
  readonly email: Email;
  readonly password: string;
  // ...

  public static register(request: MemberRegisterRequest): Member {
    return new Member({
      id: uuid(),
      email: new Email(request.email),
      // ...
    });
  }
}
```

```typescript
// domain/member/member.repository.ts
export const MEMBER_REPOSITORY = Symbol("MemberRepository");

export interface MemberRepository {
  save(member: Member): Member;
}
```

```typescript
// domain/member/value-objects/email.spec.ts
export class Email {
  readonly value: string;

  constructor(address: string) {
    if (!Email.isValid(address)) {
      throw new InvalidEmailException(address);
    }
    this.value = address;
  }
}
```

```typescript
// domain/member/exceptions/invalid-email.exception.ts
export class InvalidEmailException extends Error {
  constructor(email: string) {
    super(`이메일 형식이 바르지 않습니다: ${email}`);
  }
}
```

---

### 2. `application/` - 유스케이스 조율

**원칙**: 도메인 로직 호출, 트랜잭션 관리

| 파일 | 역할 |
|------|------|
| `register-member.service.ts` | 회원 등록 유스케이스 |

```typescript
// application/member/register-member.service.ts
@Injectable()
export class RegisterMemberService {
  constructor(
    @Inject(MEMBER_REPOSITORY)
    private readonly memberRepository: MemberRepository,
    private readonly em: EntityManager,
  ) {}

  async execute(request: MemberRegisterRequest): Promise<Member> {
    const member = Member.register(request);
    this.memberRepository.save(member);
    await this.em.flush();
    return member;
  }
}
```

---

### 3. `adapter/` - 외부 세계와의 연결

**원칙**: 인프라 관심사 격리, Port 구현

#### `adapter/{도메인}/web/` - HTTP 진입점

```typescript
// adapter/member/web/member.controller.ts
@Controller("members")
export class MemberController {
  constructor(private readonly registerMemberService: RegisterMemberService) {}

  @Post("register")
  async register(@Body() request: RegisterMemberRequest) {
    const member = await this.registerMemberService.execute(request);
    return { id: member.id, email: member.email.value };
  }
}
```

#### `adapter/{도메인}/persistence/` - DB 관련

```typescript
// adapter/member/persistence/member.repository-impl.ts
@Injectable()
export class MemberRepositoryImpl implements MemberRepository {
  private readonly mapper = new MemberMapper();

  constructor(private readonly em: EntityManager) {}

  save(member: Member): Member {
    const entity = this.mapper.toEntity(member);
    this.em.persist(entity);
    return member;
  }
}
```

```typescript
// adapter/member/persistence/member.orm-entity.ts
@Entity({ tableName: "member" })
export class MemberOrmEntity {
  @PrimaryKey({ type: "uuid" })
  id!: string;

  @Property()
  email!: string;
  // ...
}
```

#### `adapter/{도메인}/member.module.ts` - 의존성 조립

```typescript
@Module({
  controllers: [MemberController],
  providers: [
    RegisterMemberService,
    {
      provide: MEMBER_REPOSITORY,
      useClass: MemberRepositoryImpl,
    },
  ],
  exports: [RegisterMemberService],
})
export class MemberModule {}
```

---

## 의존성 흐름

```
HTTP Request
    ↓
Controller (adapter/web)
    ↓
Service (application)
    ↓
Repository Interface (domain)
    ↓
Repository Impl (adapter/persistence)
    ↓
ORM Entity → Database
```

**핵심 규칙**:
- `domain/`은 다른 레이어에 의존하지 않음
- `application/`은 `domain/`에만 의존
- `adapter/`는 `application/`과 `domain/`에 의존

---

## Adapter 폴더 분류 기준

| 폴더 | 언제 사용? | 예시 |
|------|-----------|------|
| `web/` | HTTP 요청 처리 | Controller, DTO |
| `persistence/` | 데이터 저장/조회 | Repository 구현체, ORM Entity |
| `integration/` | 외부 API 연동 | Email, SMS, OAuth |
| `security/` | 보안 관련 | 암호화, JWT |

---

## 레이어 중심 vs 모듈 중심

### 현재: 레이어 중심 구조

```
src/
├── domain/
│   ├── member/
│   └── order/
├── application/
│   ├── member/
│   └── order/
└── adapter/
    ├── member/
    └── order/
```

**장점**:
- 레이어별 책임이 명확
- DDD 원칙에 충실
- 도메인이 프레임워크에서 완전히 분리

**단점**:
- 하나의 기능 수정 시 여러 폴더 탐색 필요
- NestJS 모듈 구조와 약간 불일치

---

## 새 도메인 추가 시

1. `domain/{도메인명}/` 생성 - Aggregate, Repository 인터페이스, VO, Exceptions
2. `application/{도메인명}/` 생성 - Use Case (Service)
3. `adapter/{도메인명}/` 생성 - Controller, Repository 구현체, Module
4. `app.module.ts`에 Module import 추가
