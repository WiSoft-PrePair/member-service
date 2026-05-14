# 00. Overview — PrePair Backend 리팩터링 마스터 가이드

> **읽는 순서**: 이 파일은 전체 로드맵이다. 이 문서를 먼저 끝까지 읽고, 각 Phase 파일을 순서대로 따라간다.

---

## 1. 목적

`backend-ts`(기존)의 복잡한 CQRS 구조를 정리하고, **단일 Bounded Context "Identity"** 아래 Member/Auth/OAuth를 **DDD + Hexagonal Architecture + Full Event Sourcing** 으로 새로 구현한다.

### 핵심 원칙

| 원칙 | 결정 |
|------|------|
| Bounded Context | **단일** — `contexts/identity/{member, auth, oauth}` |
| Write Path | **Full Event Sourcing** — `event_store` = Source of Truth |
| Read Path | **Projection** — 이벤트 발생 시 `*_read` 테이블로 투영, 조회는 직접 |
| Command DB | **없음** — `event_store` + `aggregate_snapshots` + `*_read` 3종 테이블만 |
| NestJS CQRS Bus | **미사용** — `CommandBus`/`QueryBus` 사용 금지. 명시적 UseCase 호출 |
| ORM | **MikroORM 단일** (PostgreSQL) |
| 개발 방식 | **TDD** — 모든 Phase에서 Red → Green → Refactor |
| 패키지 매니저 | `pnpm` (현 lockfile 기준), 단 명령어는 `bun`이 더 빠르면 `bun run`도 허용 |

---

## 2. 데이터베이스 스키마 (3개 테이블)

```sql
-- event_store : 진실의 원천 (append-only)
CREATE TABLE event_store (
  sequence       BIGSERIAL PRIMARY KEY,
  event_id       UUID NOT NULL UNIQUE,
  aggregate_id   UUID NOT NULL,
  aggregate_type VARCHAR(50) NOT NULL,
  event_type     VARCHAR(100) NOT NULL,
  event_version  INT NOT NULL,
  payload        JSONB NOT NULL,
  metadata       JSONB,
  occurred_at    TIMESTAMPTZ NOT NULL,
  UNIQUE (aggregate_id, event_version)
);
CREATE INDEX idx_event_store_aggregate ON event_store (aggregate_id, event_version);
CREATE INDEX idx_event_store_type      ON event_store (aggregate_type, event_type);

-- aggregate_snapshots : 성능 최적화 (N개 이벤트마다 1회)
CREATE TABLE aggregate_snapshots (
  aggregate_id   UUID NOT NULL,
  aggregate_type VARCHAR(50) NOT NULL,
  version        INT NOT NULL,
  state          JSONB NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (aggregate_id, version)
);

-- Read Models : 각 도메인별 (Phase에서 추가)
CREATE TABLE member_read              (...);  -- Phase 05
CREATE TABLE oauth_connection_read    (...);  -- Phase 07
CREATE TABLE refresh_token_read       (...);  -- Phase 06
```

---

## 3. 폴더 구조 (최종 형태)

```
src/
├── contexts/identity/
│   ├── domain/
│   │   ├── shared/                    # AggregateRoot, DomainEvent, ValueObject 베이스
│   │   ├── member/
│   │   │   ├── member.aggregate.ts
│   │   │   ├── events/                # MemberRegistered, MemberUpdated, ...
│   │   │   ├── value-objects/         # Email, Password, Nickname, VerificationCode
│   │   │   └── exceptions/
│   │   ├── auth/
│   │   │   ├── refresh-token.aggregate.ts
│   │   │   └── events/
│   │   └── oauth/
│   │       ├── oauth-connection.aggregate.ts
│   │       ├── events/
│   │       └── value-objects/
│   ├── application/
│   │   ├── shared/
│   │   │   ├── event-store.port.ts
│   │   │   └── snapshot-store.port.ts
│   │   ├── member/
│   │   │   ├── use-cases/             # SignUpMember, UpdateMember, ...
│   │   │   ├── projections/           # MemberProjector
│   │   │   ├── queries/               # MemberQueryService
│   │   │   └── ports/                 # MemberReadRepository, PasswordEncoder, EmailSender
│   │   ├── auth/
│   │   └── oauth/
│   ├── infrastructure/
│   │   ├── persistence/
│   │   │   ├── event-store/           # event_store, snapshots 엔티티/구현
│   │   │   └── read-models/           # *_read 엔티티/리포지토리
│   │   ├── security/                  # Bcrypt, JWT
│   │   ├── email/                     # Nodemailer
│   │   ├── oauth/                     # KakaoOAuthClient
│   │   └── projections/               # ProjectionDispatcher
│   └── presentation/
│       ├── member/
│       ├── auth/
│       └── oauth/
├── shared-kernel/
│   ├── shard-kernel.module.ts
│   ├── exceptions/
│   ├── filters/
│   └── decorators/                    # @Public, @CurrentUser
├── config/
│   └── env.config.ts                  # Zod
├── app.module.ts
└── main.ts
```

---

## 4. Phase 로드맵

각 Phase는 **사전 조건 → TDD 단계 → 검증 명령 → 통과 체크리스트** 구조를 가진다. 체크리스트가 모두 그린이 아니면 다음 Phase로 넘어가지 않는다.

| Phase | 파일 | 핵심 산출물 | 의존 |
|-------|------|------------|------|
| 01 | `01-foundation-recovery.md` | 컴파일 가능한 상태로 복구 (`env.config.ts`, `shard-kernel.module.ts`, MikroORM 연결, Docker DB) | - |
| 02 | `02-event-sourcing-infra.md` | 도메인 베이스 클래스, EventStore/SnapshotStore 구현, ProjectionDispatcher | 01 |
| 03 | `03-member-domain-layer.md` | Member Aggregate + 모든 VO + 도메인 이벤트 + 단위 테스트 | 02 |
| 04 | `04-member-application-layer.md` | 7개 UseCase + Projector + QueryService + EmailVerification | 03 |
| 05 | `05-member-infrastructure-presentation.md` | Read Entity/Repo, Bcrypt, Nodemailer, Controller, E2E | 04 |
| 06 | `06-auth-domain.md` | RefreshToken Aggregate, JWT, Guard, Login/Logout E2E | 05 |
| 07 | `07-oauth-domain.md` | OAuthConnection Aggregate, Kakao Client, OAuth Flow E2E | 06 |
| 08 | `08-operational-finalization.md` | Snapshot 정책, Event Replay CLI, 로거, Health, 마이그레이션 | 07 |

---

## 5. TDD 사이클 (모든 Phase 공통)

```
[Red]    test/unit/.../<target>.spec.ts 작성 → 실행 → 빨간색 확인
[Green]  최소 구현으로 통과시킴
[Refactor] 중복 제거 + 명명 개선 + 테스트 그대로 그린 유지
[Commit] git commit -m "test: <whatever>" 또는 "feat: <whatever>"
```

테스트 파일 위치 규칙:
- 단위 테스트: `test/unit/<phase-domain>/<file>.spec.ts`
- 통합 테스트: `test/integration/<phase-domain>/<file>.spec.ts` (실제 DB 사용)
- E2E: `test/e2e/<flow>.e2e-spec.ts`

---

## 6. 진행 체크리스트

각 Phase 완료 시 이 표의 체크박스를 업데이트한다.

- [ ] Phase 01 — Foundation Recovery
- [ ] Phase 02 — Event Sourcing Infrastructure
- [ ] Phase 03 — Member Domain Layer
- [ ] Phase 04 — Member Application Layer
- [ ] Phase 05 — Member Infrastructure & Presentation
- [ ] Phase 06 — Auth Domain
- [ ] Phase 07 — OAuth Domain (Kakao)
- [ ] Phase 08 — Operational Finalization

---

## 7. 최종 검증 (모든 Phase 완료 후)

```bash
# 빌드
pnpm run build

# 단위 테스트
pnpm test

# E2E 테스트 (PostgreSQL 필요)
docker compose -f docker/docker-compose.dev.yaml up -d
pnpm test:e2e

# Event Replay 검증 (Phase 08 산출물)
pnpm exec ts-node scripts/replay-aggregate.ts <memberId>
```

**합격 기준**:
- ✅ `member` 같은 정규화 Command 테이블이 DB에 존재하지 않음
- ✅ `MemberRegistered` 이벤트 발생 즉시 `member_read` 행이 생성됨
- ✅ `event_store`만으로 Member Aggregate가 재구성 가능 (Replay)
- ✅ `grep -r "CommandBus\|QueryBus" src/` → 0건
- ✅ Interview 관련 코드/디렉토리/의존성이 0건
- ✅ 모든 도메인 비즈니스 규칙 (요구사항.md) 충족

---

## 8. 용어 (이 시리즈 전체 공통)

- **Aggregate** — 일관성 경계를 가진 객체 그룹. 외부에서는 Aggregate Root만 참조.
- **Domain Event** — Aggregate 내부에서 상태 변경이 일어났음을 알리는 사실. 과거형 (`MemberRegistered`).
- **Event Store** — 도메인 이벤트를 시간순으로 저장하는 append-only 저장소.
- **Snapshot** — N개 이벤트마다 저장되는 Aggregate의 상태 스냅샷 (JSON).
- **Projection** — 이벤트 스트림을 받아 Read Model을 갱신하는 코드 (Projector).
- **Read Model** — 조회 최적화된 비정규화 테이블 (`member_read` 등).
- **UseCase** — 애플리케이션 레이어의 단일 책임 비즈니스 시나리오 클래스. `execute()` 메서드 하나.
- **Port** — 도메인/애플리케이션이 외부에 요구하는 인터페이스.
- **Adapter** — Port의 구현체 (Infrastructure 레이어).

---

다음 단계: [`01-foundation-recovery.md`](./01-foundation-recovery.md) 부터 시작한다.
