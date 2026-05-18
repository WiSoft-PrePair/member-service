# 08. Operational Finalization

> **사전 조건**: Phase 07 완료 (Member + Auth + OAuth E2E 모두 그린)

## Goal

운영 가능한 상태로 마무리한다. 스냅샷 정책 확정, Event Replay CLI 도구, 트랜잭션 일관성을 위한 Outbox 패턴 검토, 로깅/모니터링, 마이그레이션 정리, README 갱신.

---

## 산출물 체크리스트

- [ ] Snapshot 정책 확정 (`SNAPSHOT_FREQUENCY` 튜닝)
- [ ] `scripts/replay-aggregate.ts` — CLI로 이벤트만으로 Aggregate 복원 검증
- [ ] `scripts/rebuild-projection.ts` — Read DB 전체 재구축 도구
- [ ] Outbox 패턴 결정 (도입 또는 향후 과제 명시)
- [ ] Pino 로거 운영 설정 (correlationId 등)
- [ ] `/health` 엔드포인트 + DB connectivity 체크
- [ ] MikroORM migration 폴더 정리 (개발 누적 → 단일 init migration 정리 옵션)
- [ ] `shard-kernel.module.ts` → `shared-kernel.module.ts` 이름 정정
- [ ] Dockerfile / docker-compose.prod.yaml 검증
- [ ] README.md 갱신
- [ ] 전체 회귀 테스트

---

## Step 1. Snapshot 정책

`EventSourcedMemberRepository.SNAPSHOT_FREQUENCY` 결정:

| 값 | 효과 |
|----|------|
| 1 (매 이벤트) | 사실상 Snapshot DB. ES 의미 없음 |
| 10 | 로드 시 최대 9 이벤트 replay |
| 20 (기본 권장) | 균형 |
| 50 | 적은 쓰기, 더 많은 replay |
| 100+ | 회원처럼 변경 적은 도메인에 적합 |

**최종 결정**:
- Member: 20
- OAuthConnection: 50

상수로 빼서 환경변수화 가능하게 만든다:

```typescript
// src/contexts/identity/application/policies/snapshot-policy.ts
export const SNAPSHOT_POLICY = {
  Member: 20,
  OAuthConnection: 50,
} as const;
```

각 Repository에서 위 상수를 import.

---

## Step 2. Event Replay CLI

순수 `event_store` 만으로 Aggregate가 복원 가능한지 검증하는 도구.

```typescript
// scripts/replay-aggregate.ts
import { NestFactory } from "@nestjs/core";
import { AppModule } from "@/app.module";
import { EVENT_STORE, type EventStore } from "@/contexts/identity/application/ports/event-store.port";
import { Member } from "@/contexts/identity/domain/member/member.aggregate";

async function main() {
  const memberId = process.argv[2];
  if (!memberId) {
    console.error("Usage: ts-node scripts/replay-aggregate.ts <memberId>");
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule);
  const store = app.get<EventStore>(EVENT_STORE);

  const events = await store.loadEvents(memberId, 0);
  if (events.length === 0) {
    console.log("No events found");
    process.exit(0);
  }

  const member = new (Member as any)() as Member;
  member.replay(events);

  console.log(JSON.stringify({
    id: member.id,
    email: member.email.value,
    nickname: member.nickname.value,
    point: member.point,
    version: member.version,
    eventCount: events.length,
    isWithdrawn: member.isWithdrawn,
  }, null, 2));

  await app.close();
}

void main();
```

실행:
```bash
pnpm exec ts-node scripts/replay-aggregate.ts <memberId>
```

**검증 기준**: 출력된 상태가 `member_read` 테이블의 row와 일치해야 한다 (point, nickname, email).

---

## Step 3. Projection Rebuild CLI

Projection 코드 변경 시 Read DB 전체 재구축이 필요한 경우.

```typescript
// scripts/rebuild-projection.ts
import { NestFactory } from "@nestjs/core";
import { AppModule } from "@/app.module";
import { EVENT_STORE, type EventStore } from "@/contexts/identity/application/ports/event-store.port";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { MikroORM } from "@mikro-orm/postgresql";
import { MemberReadEntity } from "@/contexts/identity/infrastructure/persistence/read-models/member/member-read.entity";

async function main() {
  const aggregateType = process.argv[2] ?? "Member";
  const app = await NestFactory.createApplicationContext(AppModule);
  const store = app.get<EventStore>(EVENT_STORE);
  const emitter = app.get(EventEmitter2);
  const orm = app.get(MikroORM);

  // 1. Read DB truncate
  const fork = orm.em.fork();
  if (aggregateType === "Member") {
    await fork.nativeDelete(MemberReadEntity, {});
  }
  // ... 다른 aggregate type

  // 2. Event Store 전수 순회
  const events = await store.loadEventsByType(aggregateType);
  console.log(`Rebuilding ${events.length} events for ${aggregateType}...`);

  for (const e of events) {
    await emitter.emitAsync(e.eventType, e);
  }

  console.log("Done.");
  await app.close();
}

void main();
```

실행:
```bash
pnpm exec ts-node scripts/rebuild-projection.ts Member
pnpm exec ts-node scripts/rebuild-projection.ts OAuthConnection
```

---

## Step 4. Outbox 패턴 결정

**현재 구조의 문제**: `EventStore.append()` 후 `ProjectionDispatcher.publishAll()`를 호출한다. 만약 publish가 실패하면 이벤트는 저장되었지만 Read DB가 갱신되지 않는다. 반대로 publish가 성공한 후 transaction이 롤백되면 ghost projection이 생긴다.

**해결책 옵션**:

| 옵션 | 장점 | 단점 |
|------|------|------|
| A. 같은 트랜잭션 안에서 처리 (현재) | 단순 | 부분 실패 가능 |
| B. Outbox 테이블 + Polling Worker | 확실한 일관성 | 인프라 복잡, 지연 |
| C. Projection 실패 시 Replay (Phase 08 도구 활용) | 단순 + 복구 가능 | 일시적 일관성 깨짐 가능 |

**결정** (본 가이드): **C 채택** — 운영 중 Projection 실패 발생 시 `rebuild-projection.ts`로 복구. Outbox 도입은 트래픽이 증가할 때 별도 Phase로 분리.

**보강 작업**:
- ProjectionDispatcher에 try/catch + Logger 추가
- 실패 시 이벤트 sequence를 별도 `failed_projection_log` 테이블에 기록 (선택)

```typescript
// projection-dispatcher.ts 보강
async publishAll(events: readonly DomainEvent[]): Promise<void> {
  for (const event of events) {
    try {
      await this.emitter.emitAsync(event.eventType, event);
    } catch (e) {
      this.logger.error({
        msg: "Projection failed",
        eventId: event.eventId,
        eventType: event.eventType,
        error: e,
      });
      // 운영 시: rebuild-projection.ts로 복구
    }
  }
}
```

---

## Step 5. Pino 로거 운영 설정

```typescript
// app.module.ts LoggerModule 설정 보강
LoggerModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>) => ({
    pinoHttp: {
      level: config.get("LOG_LEVEL", { infer: true }),
      transport: config.get("NODE_ENV", { infer: true }) === "development"
        ? { target: "pino-pretty" }
        : undefined,
      customProps: () => ({ service: config.get("SERVICE_NAME", { infer: true }) }),
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
      genReqId: (req) => req.headers["x-correlation-id"] ?? randomUUID(),
    },
  }),
}),
```

---

## Step 6. Health Check 강화

```typescript
// app.controller.ts
@Injectable()
export class HealthService {
  constructor(private readonly orm: MikroORM) {}

  async check() {
    try {
      await this.orm.em.fork().getConnection().execute("SELECT 1");
      return { status: "ok", db: "ok", timestamp: new Date().toISOString() };
    } catch (e) {
      return { status: "error", db: "error", timestamp: new Date().toISOString() };
    }
  }
}

@Controller()
export class AppController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get("/health")
  async healthEndpoint() {
    const result = await this.health.check();
    return result;
  }
}
```

---

## Step 7. `shard-kernel` → `shared-kernel` 이름 정정

오타였던 `shard-kernel.module.ts`를 정정한다:

```bash
git mv src/shared-kernel/shard-kernel.module.ts src/shared-kernel/shared-kernel.module.ts
# 클래스명도 변경: ShardKernelModule → SharedKernelModule
```

`grep -r "ShardKernelModule\|shard-kernel" src/`로 모든 import 갱신.

---

## Step 8. 마이그레이션 통합

개발 중 누적된 마이그레이션을 단일 init 마이그레이션으로 정리 (선택):

```bash
# DB 백업 후
rm -rf mikro/migrations
pnpm exec mikro-orm migration:create --initial
pnpm exec mikro-orm migration:fresh
```

---

## Step 9. Dockerfile / docker-compose.prod

```dockerfile
# Dockerfile (정리된 버전)
FROM node:24-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.1 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

FROM node:24-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@9.15.1 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/mikro ./mikro
EXPOSE 7200
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:7200/health || exit 1
USER node
CMD ["sh", "-c", "node ./node_modules/@mikro-orm/cli/dist/cli.js migration:up && node dist/src/main.js"]
```

`docker-compose.prod.yaml`에서 `prisma` 참조 모두 제거 확인.

---

## Step 10. README.md 갱신

```markdown
# PrePair Member Service

DDD + Hexagonal Architecture + Event Sourcing 기반 회원/인증/OAuth 서비스.

## 아키텍처

- **Bounded Context**: `Identity` (Member + Auth + OAuth)
- **Write Path**: Full Event Sourcing — `event_store`가 진실의 원천
- **Read Path**: Projection — `*_read` 테이블로 비동기 투영
- **ORM**: MikroORM 6 (PostgreSQL)

## 폴더 구조

(`docs/refactor-plan/00-overview.md` 참조)

## 시작하기

\`\`\`bash
# 의존성
pnpm install

# 환경변수
cp .env.example .env

# DB 기동
docker compose -f docker/docker-compose.dev.yaml up -d

# 마이그레이션
pnpm exec mikro-orm migration:up

# 개발 서버
pnpm start:dev
\`\`\`

## 테스트

\`\`\`bash
pnpm test          # 단위 테스트
pnpm test:e2e      # E2E (DB 필요)
\`\`\`

## 운영 도구

\`\`\`bash
# 특정 회원의 이벤트만으로 Aggregate 복원 검증
pnpm exec ts-node scripts/replay-aggregate.ts <memberId>

# Read DB 전체 재구축 (Projection 코드 변경 후)
pnpm exec ts-node scripts/rebuild-projection.ts Member
\`\`\`

## 구현 가이드

이 프로젝트는 단계별 가이드를 따라 구현되었습니다. 처음부터 다시 짜려면:

- [`docs/refactor-plan/00-overview.md`](./docs/refactor-plan/00-overview.md) 부터 순서대로
```

---

## Step 11. 최종 회귀 테스트

```bash
# 1) 클린 빌드
rm -rf dist node_modules
pnpm install
pnpm run build

# 2) 클린 DB
docker compose -f docker/docker-compose.dev.yaml down -v
docker compose -f docker/docker-compose.dev.yaml up -d
pnpm exec mikro-orm migration:up

# 3) 단위 + E2E
pnpm test
pnpm test:e2e

# 4) 운영 시나리오 검증
# 4-1) Member E2E (Phase 05 시나리오)
# 4-2) Auth E2E (Phase 06 시나리오)
# 4-3) OAuth E2E (Phase 07 시나리오)

# 5) Event Replay 검증
MEMBER_ID=$(docker exec prepair-db psql -U prepair -d prepair -tAc "SELECT id FROM member_read LIMIT 1")
pnpm exec ts-node scripts/replay-aggregate.ts $MEMBER_ID

# 6) Projection Rebuild 검증
pnpm exec ts-node scripts/rebuild-projection.ts Member

# 7) Grep 검증
grep -r "CommandBus\|QueryBus" src/   # → 0건
grep -r "prisma\|Prisma" src/ package.json Dockerfile   # → 0건
grep -r "interview\|Interview" src/   # → 0건
```

---

## 최종 Definition of Done

- [ ] 전체 9개 Phase 체크리스트 그린 (00-overview.md의 표 참조)
- [ ] 모든 E2E 시나리오 통과
- [ ] `replay-aggregate.ts` 출력이 `member_read` row와 일치
- [ ] `rebuild-projection.ts`가 정상 동작 (Read DB 완전 재구축 가능)
- [ ] `event_store` + `aggregate_snapshots` + `*_read` 3종 테이블 외에 정규화 Command 테이블 없음
- [ ] Auth/OAuth 흐름 모두 정상
- [ ] README + 가이드 문서 일치
- [ ] CI 빌드/테스트 그린 (있다면)

---

## 향후 확장 가능성 (이 가이드 범위 밖)

| 확장 | 시점 | 비고 |
|------|------|------|
| Outbox 패턴 | 트래픽 증가 / Multi-Service 이벤트 발행 시 | Phase 08의 옵션 B |
| Saga (분산 트랜잭션) | Interview 등 외부 BC와 통합 시 | 별도 Coordinator BC 필요 |
| Read DB → Materialized View | Read 성능 한계 시 | PostgreSQL Materialized View 또는 Redis |
| Event Versioning | 이벤트 스키마 변경 누적 시 | Upcaster 패턴 |
| Distributed Tracing | 서비스 분리 시 | OpenTelemetry |
| GraphQL Gateway | Frontend 통합 시 | Apollo Federation |

---

## 마무리

이로써 PrePair Backend의 DDD + Hexagonal + Event Sourcing 리팩터링이 완료된다. 각 Phase는 독립적으로 검증 가능하고, TDD 사이클을 통해 비즈니스 규칙이 테스트로 명문화되었다.

문제가 발생하면 다음을 점검:
1. `event_store`에 이벤트가 정상 기록되는가?
2. `aggregate_snapshots`가 N개 주기로 저장되는가?
3. Projector가 모든 이벤트 타입을 구독하는가?
4. `member_read` row가 이벤트 흐름에 따라 동기화되는가?
5. `replay-aggregate.ts` 결과가 Read DB와 일치하는가?

이 5가지가 그린이면 시스템은 건강하다.
