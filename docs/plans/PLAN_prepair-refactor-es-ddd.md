# PrePair 백엔드 리팩토링 — Hexagonal + DDD + True Event Sourcing

> 본 계획은 `docs/용어사전.md`, `docs/도메인모델.md`, `docs/요구사항.md` 와 함께 SSOT 로 유지된다. 코드가 바뀌면 이 문서도 동기화한다.

## Context

현재 코드(`refactor-backend-ts`)는 헥사고날 3-layer는 잡혀 있지만 다음 문제가 누적되어 있다.

- **도메인 경계 누수**: `MemberController`에 `PATCH /reward` 가 있고 `MemberPointUpdateAdapter`는 자기 자신 프로세스에 fetch 호출. `NotificationRecipientFinderImpl`은 `MemberReadEntity`를 포트 없이 직접 쿼리.
- **사문화된 Event Store**: `event_store` 에 매번 append 만 하고 `getEvents()` 는 어디서도 호출되지 않는다. 동시에 `DomainEvent`(Aggregate 수집) ↔ `IEvent`(NestJS CQRS) 가 **이중 시스템**으로 병존. 7개 이벤트 중 cross-context 가치는 `MemberWithdrawEvent` 1개뿐.
- **God Service**: `InterviewAnswerService.submitAnswer` 에 5개 책임이 응집되어 비즈니스 흐름이 코드만 봐서는 드러나지 않는다.
- **ORM 마이그레이션 미완**: member/oauth/auth 는 MikroORM 완료, `interview` 만 Prisma 잔존 → Prisma 패키지를 못 빼고 있음.
- **의존성 방향 위반 1건**: `application/auth/auth.service.ts:19` 가 `@/adapter/auth/api/dto` 임포트.

## 확정된 방향

1. **진짜 Event Sourcing 으로 강화** — `event_store` 가 write side 의 truth, replay 로 aggregate 재구성, CQRS Command DB ↔ Query DB 물리 분리, projection 으로 read DB 갱신.
2. **Interview 컨텍스트 통째 삭제** — `docs/용어사전.md` 도 면접 용어는 범위 밖이라 명시. Interview 를 지우면 Prisma 의존성·결합 누수·self-HTTP·God Service 가 한 번에 해결된다.
3. **TDD Inside-Out** — Member Aggregate 도메인 단위 테스트부터 시작.
4. **CQRS/Service 어휘 통일은 보류** — ES 재구축을 가로막는 부분만 손본다.

## 의도한 결과

- `event_store`(Command DB) 가 모든 Member 상태 변화의 단일 진실. `Member.fromHistory(events)` 로 재구성.
- `member_read`(Query DB) 는 projection 으로 갱신되는 조회 전용. CLI 로 언제든 replay 가능.
- Member 컨트롤러 한 파일만 봐도 비즈니스 의도가 드러나는 어휘(`register`, `withdraw`, `changePassword` …) 로 정렬.
- Prisma 패키지·생성 코드 0건, `@/adapter` 를 import 하는 `application/` 파일 0건.

---

## Phase 0 — 안전망 (E2E happy-path)

**Goal** 현재 외부 동작을 잠근다. 리팩토링 전후 동등성을 e2e 로 검증.

**TDD**
- Red: `test/e2e/{app-factory.ts, member-register.e2e-spec.ts, member-update.e2e-spec.ts, auth-login.e2e-spec.ts}` 작성. 본문은 현 동작을 그대로 단언 → main 에서 바로 GREEN.
- Refactor: `app-factory.ts` 로 부트스트랩 공통화, 테스트 간 `orm.schema.refreshDatabase()`.

**Exit**
- `pnpm test:e2e` 3개 스펙 그린.
- `docs/api-snapshots.md` 에 curl 응답 캡처(휴먼 diff 용).

**Files (create)**
- `test/e2e/app-factory.ts`
- `test/e2e/{member-register,member-update,auth-login}.e2e-spec.ts`
- `docs/api-snapshots.md`

**Reuse** `test/jest-e2e.json` 이미 존재, `test/unit/domain/member.spec.ts` 가 AAA + 한국어 `it()` 스타일 템플릿.

**Risk** OAuth/이메일 인증 부수효과는 e2e 범위 밖.

---

## Phase 1 — Interview & Prisma 제거 + Member 에서 Point/리워드 분리

**Goal** Bounded Context 1개 통째 삭제. `Member.point/isPro`, `/reward`, `/point` 같은 인터뷰 파생 상태도 함께 제거.

**TDD**
- Red: `test/unit/domain/member.spec.ts` 의 "point 는 0으로 초기화" 스펙(line 44–50) 제거 → `expect("point" in member).toBe(false)` 와 `MemberRegistered` payload 에 `point` 없음 단언.
- Green: 도메인/이벤트/엔티티/매퍼/핸들러에서 `point`·`isPro`·`MemberPointAdded` 제거. `AddPointCommand` 삭제. 컨트롤러의 `/point`·`/reward` 라우트 삭제. DTO 삭제.
- Refactor: `auth.service.ts:80` 응답에서 `point/isPro` 제거(또는 FE 호환 위해 단기간 상수).

**Exit**
- `grep -r "prisma\|@/domain/interview\|@/application/interview\|@/adapter/interview" src test` → 0건.
- `pnpm build && pnpm test && pnpm test:e2e` 그린.

**Files (delete)**
- 디렉토리: `src/domain/interview/`, `src/application/interview/`, `src/adapter/interview/`, `src/generated/prisma/`, `src/adapter/shared/prisma/`, `prisma/`, `prisma.config.ts`.
- 파일: `src/application/member/command/add-point.command.ts`, `src/adapter/member/api/dto/{add-point,update-score}.dto.ts`.

**Files (modify)**
- `src/app.module.ts` — InterviewModule, PrismaModule 제거
- `src/adapter/member/api/member.controller.ts` — `addPoint`, `updateScore` 메서드 제거, 관련 import/DTO 제거
- `src/adapter/member/{api/dto/index.ts, member.handlers.ts}` — export·CommandHandlers 정리
- `src/domain/member/member.ts` — `point` 필드·`addPoint` 메서드·`MemberPointAdded` 발행 제거; `update()` 에서 point/isPro 복사 제거
- `src/domain/member/events/{member-register,member-update}.event.ts` — `point`/`isPro` 제거
- `src/adapter/member/persistence/mikro-orm/{entity/member.entity.ts, mapper/member.mapper.ts}`
- `src/adapter/member/persistence/read/entity/member-read.entity.ts` — line 24–25 point/isPro 제거
- `src/application/member/event/member-update-event-handler.service.ts:46–47` — point/isPro 동기화 제거
- `package.json` — `@prisma/client`, `@prisma/adapter-pg`, `prisma`, 사용처 없는 `passport-auth` 제거

**Reuse** 이미 MikroORM 위에 있는 Member/OAuth/Auth 가 그대로 유지된다.

**Risk** FE 가 `point`/`isPro` 를 읽고 있을 수 있음. 한 릴리즈 `0`/`false` 상수로 응답 가능.

---

## Phase 2 — Member Aggregate 도메인 TDD (Inside-Out 핵심)

**Goal** Phase 3 에서 영속성 의미가 바뀌기 전에 도메인 행위에 안전망을 친다. `docs/용어사전.md` 를 따라 명명.

**Location** `test/unit/domain/member/` 아래 행위별 파일. 기존 `test/unit/domain/member.spec.ts` 를 쪼개 이동.

**TDD — 첫 테스트 목록 (각 Red → Green → Refactor)**

1. `register.spec.ts`
   - `Member.register()` 가 `MemberRegistered` 이벤트 1개를 발행한다 (email/job/nickname/notification/frequency 포함)
   - `Member.register()` 가 encoder 로 비밀번호를 해시한다
   - 잘못된 이메일 → `InvalidEmailException`
   - 약한 비밀번호 → `InvalidPasswordException`
2. `update.spec.ts` — partial update 가 미지정 필드를 보존, `MemberUpdated` 발행
3. `change-password.spec.ts`
   - 올바른 현재 비밀번호 → `MemberPasswordChanged` 발행
   - 틀린 현재 비밀번호 → `InvalidPasswordException` + 이벤트 0개  ← **Phase 3 rehydrate 핵심 케이스**
4. `reset-password.spec.ts` — 항상 `MemberPasswordReset` 발행
5. `change-email.spec.ts` — 유효 이메일 → `MemberEmailChanged`, 무효 → 예외
6. `withdraw.spec.ts` — **새 메서드 추가**: `Member.withdraw(): Member` 가 `MemberWithdrew` 발행
7. `domain-events.spec.ts` — `getDomainEvents()` 시간순, `clearDomainEvents()` 비움

**Exit**
- `pnpm test` 도메인 스펙 ≥ 15개 그린.
- 프로덕션 코드 변경은 `Member.withdraw()` 추가와 `MemberWithdrawCommand` 가 이 도메인 메서드 경유로 변경된 것 뿐.

**Files**
- create: `test/unit/domain/member/{register,update,change-password,reset-password,change-email,withdraw,domain-events}.spec.ts`, `test/unit/domain/member/__fixtures__/encoder.ts`
- modify: `src/domain/member/member.ts` (`withdraw()` 추가), `src/application/member/command/member-withdraw.command.ts` (도메인 경유)

**Reuse** 기존 `test/unit/domain/member.spec.ts:19–24` 의 encoder mock 패턴.

---

## Phase 3 — True Event Sourcing 재구축 (단일 DB)

**Goal** `event_store` 를 write side 의 진실로. per-aggregate `version` + 낙관적 동시성. `Member` 가 `EventSourcedAggregateRoot` 상속, history 로 rebuild. **DB 분리는 다음 Phase**.

**새 `event_store` 스키마**

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `eventId` | uuid PK | |
| `aggregateId` | uuid | 인덱스 |
| `aggregateType` | text | `"Member"`, `"OAuthConnection"` |
| `version` | int | `(aggregateId, version)` UNIQUE |
| `eventType` | text | |
| `payload` | jsonb | |
| `metadata` | jsonb | correlationId/causationId/actorId |
| `occurredAt` | timestamptz | |

**새 도메인 contract**
- `src/domain/shared/event-store.ts`
  - `append(aggregateId, aggregateType, expectedVersion, events): Promise<void>` — 현재 max version ≠ expectedVersion 이면 `ConcurrencyException`
  - `loadEvents(aggregateId): Promise<{events, version}>`
- `src/domain/shared/event-sourced-aggregate-root.ts`
  - `protected version`, `apply(event)`, `loadFromHistory(events)`, `raise(event)` (push + apply)
- `Member` 가 상속 + `applyMemberRegistered/Updated/PasswordChanged/PasswordReset/EmailChanged/Withdrew/LoggedIn`.
- `Member.of()` (영속성 복원용) 제거 → `Member.fromHistory(events)` 로 대체.

**Repository contract 변경**
- `MemberRepository.save(member): Promise<void>` 가 `register/update/withdraw` 를 통합.
- 구현: `eventStore.append(id, "Member", prevVersion, member.getDomainEvents())` → `member.clearDomainEvents()`.
- `findById(id)` → `loadEvents(id)` + `Member.fromHistory(...)`.
- **`MemberEntity`/`member.mapper.ts`/기존 ORM 저장 경로 삭제**.

**TDD 순서**
1. `test/unit/shared/event-sourced-aggregate-root.spec.ts` — `loadFromHistory` 순차 apply, `raise` push+apply, version 증가
2. `test/unit/domain/member/rehydrate.spec.ts`
   - `[MemberRegistered]` → 가입 직후 상태
   - `[MemberRegistered, MemberEmailChanged]` → 새 이메일
   - `[MemberRegistered, MemberPasswordChanged]` 후 새 패스워드로만 `changePassword` 성공
   - `[MemberRegistered, MemberWithdrew]` 이후 명령 호출 모두 예외
3. `test/integration/event-store.spec.ts` (실제 PG)
   - expectedVersion=0 → 성공
   - stale expectedVersion → `ConcurrencyException`
   - `loadEvents` version ASC 순서
4. 모든 Member command handler 가 `repository.save(member)` 경유 → Phase 0 e2e 다시 그린

**Exit**
- Member 관련 6개 이벤트는 `event_store` 에만 기록.
- `member` 테이블 drop 가능 (`grep MemberEntity src` = 0).
- Phase 0 e2e 그린 + 새 unit/integration 스펙 그린.

**Files**
- create: `src/domain/shared/{event-sourced-aggregate-root.ts, concurrency.exception.ts}`, 위 테스트들
- modify: `src/domain/shared/event-store.ts`, `src/adapter/shared/event-store/{event-store.impl.ts, event-store.entity.ts}`, `src/domain/member/member.ts`, `src/domain/member/member.repository.ts`, `src/adapter/member/persistence/mikro-orm/member.repository-impl.ts`, 8개 Member command handler
- delete: `src/adapter/member/persistence/mikro-orm/{entity/member.entity.ts, mapper/member.mapper.ts}`

**Risk** `MemberRegisterEvent.payload` 에 password hash 포함(현재도 동일). `metadata` 에는 절대 로깅하지 않음.

---

## Phase 4 — Command DB / Query DB 물리 분리

**Goal** 두 개의 Postgres (개발은 같은 인스턴스의 다른 dbName, 운영은 다른 클러스터). 각 측에 별도 `EntityManager`, projection 이 query DB 를 갱신.

**MikroORM 토폴로지**
- `MikroOrmModule.forRootAsync` 2회 등록, `contextName: "command"` / `"query"`.
- `@InjectEntityManager("command")` / `("query")` 사용.
- Command side entities: `EventStoreEntity` + (Phase 5) `SnapshotEntity`.
- Query side entities: `MemberReadEntity` + 향후 OAuth/Auth read.
- `RefreshTokenEntity`, `OAuthEntity` 는 일단 command side (아직 event-sourced 아님 — 후순위).

**마이그레이션**
- 루트에 `mikro-orm-command.config.ts`, `mikro-orm-query.config.ts`.
- `package.json` 스크립트: `db:command:migrate`, `db:query:migrate`, `db:both:migrate`.
- 초기 마이그레이션: `migrations/command/Initial.ts`, `migrations/query/Initial.ts`.
- `persistence.module.ts:27` 의 `ensureDatabase()` 제거.

**Projection 재배선**
- `src/application/member/event/` 의 7개 핸들러를 `MemberReadProjection` 1개로 통합(`@EventsHandler(MemberRegisterEvent, MemberUpdateEvent, ...)`) → query EM 사용.
- `EventStoreImpl.append` 내부에서 flush 후 CQRS `IEvent` 미러를 발행해 projection 동기 실행 (현재 각 handler 가 중복으로 `eventBus.publish` 하는 패턴을 일원화).

**TDD**
- e2e: `member-register.e2e-spec.ts` 의 단언을 "command.event_store 에 row + query.member_read 에 row" 둘 다로 강화.
- Refactor: 7개 핸들러 → 1개 projection. 2-liner handler 들 삭제.

**Exit**
- `pnpm db:command:migrate && pnpm db:query:migrate` 두 DB 스키마 생성.
- 등록 curl 한 번에 두 DB 모두 row 생성.
- `contextName` 없는 EM 주입 0건.

**Files**
- create: `mikro-orm-{command,query}.config.ts`, `migrations/{command,query}/Initial.ts`, `src/adapter/shared/persistence/persistence.module.ts`, `src/application/member/projections/member-read.projection.ts`
- modify: `src/app.module.ts`, `src/config/database.config.ts` (factory 2개로 분리), `package.json` (CLI 스크립트)
- delete: 통합 후 남는 `member-{update,email-changed,password-changed,password-reset,login}-event-handler.service.ts`

**Reuse** `member-register-event-handler.service.ts:31–44` 의 idempotency 패턴(row 존재 시 skip, unique violation catch) → projection 템플릿.

**Risk** cross-DB 는 비원자적. Eventual consistency 수용. 실패 시 Phase 5 의 replay CLI 로 복구.

---

## Phase 5 — Projection 메커니즘 + Snapshot + Replay

**Goal** projection 일급화, snapshot 으로 rehydrate 비용 상한, replay CLI 로 read DB 재구축 가능.

**Projection 위치** `src/application/<context>/projections/<name>.projection.ts`. 각 projection 은 `eventTypes`, `apply(event, em)`, `reset(em)` 선언. `ProjectionRegistry` 가 모음.

**Snapshot 테이블 (`command.snapshots`)**
- PK `(aggregateId, version)`, `aggregateType`, `state` jsonb, `takenAt`, `schemaVersion`
- 정책: `EventStore.append` 후 `currentVersion % N === 0` 이면 스냅샷. Member 기본 N=20.

**Rehydrate w/ snapshot**
```
loadSnapshot(id) → snapshot or null
loadEvents(id, sinceVersion = snapshot?.version ?? 0)
Member.fromSnapshot(snapshot).loadFromHistory(tail)
```

**Replay CLI** `pnpm tsx src/cli/replay-projections.ts member-read`
1. `truncate query.member_read`
2. `event_store` 를 `(aggregateId, version)` 순회 스트리밍
3. projection registry 로 dispatch

**TDD**
- `test/integration/snapshot.spec.ts` — 21회 append 후 version=20 snapshot 존재, `findById` 가 snapshot+tail 로 동일 상태 복원
- `test/integration/replay.spec.ts` — `member_read` truncate → replay → row 내용이 원본과 동일 (SQL diff)

**Exit**
- snapshot row 가 20 events 마다 생성 (psql 검증)
- `pnpm replay:member-read` 후 row 동일성
- 두 integration 스펙 그린

**Files**
- create: `src/application/shared/projections/{projection.ts, projection-registry.ts}`, `src/application/member/projections/member-read.projection.ts`, `src/adapter/shared/event-store/{snapshot.entity.ts, snapshot.repository.ts}`, `src/cli/replay-projections.ts`, `migrations/command/AddSnapshots.ts`
- modify: `EventStoreImpl` (snapshot hook), `MemberRepositoryImpl` (snapshot-aware load), `Member` (`toSnapshot/fromSnapshot`)

**Risk** snapshot 직렬화 drift — `Member` 에 필드 추가 시 옛 snapshot 무효. `schemaVersion` 컬럼으로 mismatch 시 전체 replay.

---

## Phase 6 — 정리

**Goal** 잔돈 마무리.

**항목**
1. **의존성 방향 위반 수정** — `src/application/auth/auth.service.ts:19` 의 `@/adapter/auth/api/dto` import. `LoginRequest` 타입을 `src/application/auth/ports/login-request.ts` 로 옮기고 컨트롤러 DTO 가 `implements LoginRequest`.
2. **파일명/오타** — `kaka-oauth.service.ts` → `kakao-oauth.service.ts`. `inedex.ts` → `index.ts`.
3. **죽은 코드 제거** — `src/domain/oauth/events/oauth.event.ts` (publish/consume 0건).
4. **`MemberLoginEvent` 를 `event_store` 에서 분리** — `EventBus` 만으로 발행, projection 은 `member_read.activity` 유지.
5. **폴더 일관성** — barrel `index.ts` 통일.

**Exit**
- `grep -r "@/adapter" src/application` → 0
- `grep -r "kaka-oauth\|inedex" src` → 0
- `grep -r "OAuthConnected\|createOAuthConnectedEvent" src` → 0
- `pnpm build && pnpm test && pnpm test:e2e` 그린

---

## 단일 체크리스트

- [ ] **P0-1** `test/e2e/app-factory.ts` + 3개 happy-path e2e 스펙 작성, `pnpm test:e2e` 그린
- [ ] **P0-2** `docs/api-snapshots.md` curl 캡처
- [ ] **P1-1** `src/{domain,application,adapter}/interview/`, `prisma/`, `prisma.config.ts`, `src/generated/prisma/`, `src/adapter/shared/prisma/` 삭제
- [ ] **P1-2** `app.module.ts` 에서 InterviewModule/PrismaModule 제거. `package.json` 에서 prisma 3종 + `passport-auth` 제거 후 `pnpm install`
- [ ] **P1-3** Member 에서 `point`/`addPoint`/`MemberPointAdded`/`/reward`/`/point` 제거
- [ ] **P1-4** 영향 받은 e2e/unit 스펙 수정 → `pnpm test && pnpm test:e2e && pnpm build` 그린
- [ ] **P2-1** `test/unit/domain/member.spec.ts` 를 행위별 7개 파일로 분리 + 케이스 추가
- [ ] **P2-2** `Member.withdraw()` 도메인 메서드 추가, `MemberWithdrawCommand` 가 이 메서드 경유
- [ ] **P3-1** `EventSourcedAggregateRoot`, 새 `EventStore` contract, `event_store` 컬럼 확장
- [ ] **P3-2** `Member` 가 `EventSourcedAggregateRoot` 상속 + `apply*`, `Member.fromHistory`, `ConcurrencyException`
- [ ] **P3-3** `MemberRepositoryImpl` 을 `EventStore` 위임으로 재작성, `MemberEntity`/매퍼 삭제, 8개 command handler 가 `repository.save` 경유
- [ ] **P3-4** rehydrate unit + 낙관적 동시성 integration 스펙 그린
- [ ] **P4-1** `mikro-orm-{command,query}.config.ts` + 마이그레이션 스크립트, 첫 마이그레이션 적용
- [ ] **P4-2** 두 개 `MikroOrmModule` 인스턴스, projection 핸들러 query EM 으로 이전, `MemberReadProjection` 으로 통합
- [ ] **P4-3** `pnpm db:command:migrate && pnpm db:query:migrate` → curl 등록 한 번에 두 DB 모두 row
- [ ] **P5-1** snapshot 엔티티+리포지토리, 20-events 정책을 `EventStore.append` 에 적용
- [ ] **P5-2** `MemberRepositoryImpl.findById` snapshot-aware
- [ ] **P5-3** `ProjectionRegistry` + `replay-projections.ts` CLI + integration 스펙
- [ ] **P6-1** `application/auth/auth.service.ts` adapter import 위반 수정, `kaka-oauth.service.ts`/`inedex.ts` rename
- [ ] **P6-2** `OAuthConnectedEvent` 삭제 + 모든 import 검증
- [ ] **P6-3** `MemberLoginEvent` 를 `event_store` 에서 분리, projection 만 유지
- [ ] **P6-4** 최종 `pnpm build && pnpm test && pnpm test:e2e && pnpm start:dev` 스모크

---

## 검증 명령 (각 Phase 종료 시)

```bash
pnpm build
pnpm test
pnpm test:e2e
pnpm start:dev                                      # 다음 curl 스모크
pnpm db:command:migrate && pnpm db:query:migrate    # Phase 4+
pnpm replay:member-read                              # Phase 5+

# 스모크 (Phase 3+):
curl -X POST localhost:3000/api/members/email \
  -H 'content-type: application/json' \
  -d '{"email":"x@y.z","purpose":"REGISTER"}'
curl -X POST localhost:3000/api/members/email-verify \
  -H 'content-type: application/json' \
  -d '{"email":"x@y.z","code":"<from logs>"}'
curl -X POST localhost:3000/api/members/register \
  -H 'content-type: application/json' \
  -d '{"email":"x@y.z","password":"Aa1!aaaa","job":"dev","nickname":"n","notification":"EMAIL","frequency":"EVERY"}'
psql prepair_command -c "select aggregate_id, aggregate_type, version, event_type from event_store order by version;"
psql prepair_query   -c "select id, email, nickname from member_read;"
```

## 주요 수정 파일 (참고)

- `src/domain/member/member.ts` — `EventSourcedAggregateRoot` 상속, `apply*` / `fromHistory` / `withdraw`
- `src/domain/shared/event-store.ts` — 새 contract
- `src/adapter/shared/event-store/event-store.impl.ts` — version + concurrency + snapshot hook
- `src/adapter/member/persistence/mikro-orm/member.repository-impl.ts` — `EventStore` 위임
- `src/config/database.config.ts` — command/query factory 2개로 분리
- `src/application/member/projections/member-read.projection.ts` — 7개 핸들러 통합
- `src/cli/replay-projections.ts` — read DB 재구축 CLI
- `docs/용어사전.md`, `docs/도메인모델.md` — SSOT, 코드 변경 시 동기화
