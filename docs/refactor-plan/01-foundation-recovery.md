# 01. Foundation Recovery — 컴파일 가능 상태로 복구

> **사전 조건**: [`00-overview.md`](./00-overview.md) 정독 완료

## Goal

현재 `refactor-backend-ts`는 컴파일 실패 상태다. 다음 두 import가 깨져 있다:
- `@/config/env.config` (파일 삭제됨)
- `@/shared-kernel/shard-kernel.module` (파일 미생성)

이 Phase에서는 **비즈니스 로직 없이 단순히 부트스트랩만 성공**하게 만든다. DB 연결 확인, `/health` 응답까지 그린.

---

## 산출물 체크리스트

- [ ] `src/config/env.config.ts` — Zod 기반 환경변수 검증
- [ ] `src/shared-kernel/shard-kernel.module.ts` — 빈 모듈 (이후 Phase에서 채움)
- [ ] `package.json` — Prisma 관련 의존성 제거, 필요한 패키지 추가 확인
- [ ] `Dockerfile` — `prisma generate` 명령 제거
- [ ] `src/app.controller.ts` — `/health` 엔드포인트
- [ ] `docker compose -f docker/docker-compose.dev.yaml up -d` → DB 기동
- [ ] `pnpm start:dev` → 7200 포트 listen, `GET /health` 200 응답
- [ ] `test/unit/config/env.config.spec.ts` — env 검증 단위 테스트 통과

---

## Step 1. 의존성 정리

### 1-1. 제거할 패키지

`backend-ts`에서 가져온 잔재 중 Prisma 관련은 모두 제거. 현재 `refactor-backend-ts/package.json`은 이미 정리된 상태일 가능성이 높지만, 확인.

```bash
pnpm list | grep -E "(prisma|effect)"
# 위 명령에 결과가 나오면 제거
pnpm remove @prisma/client @prisma/adapter-pg prisma effect
```

### 1-2. 필수 패키지 확인

다음이 설치되어 있어야 한다:

```bash
pnpm list zod @nestjs/config @nestjs/cqrs @mikro-orm/core @mikro-orm/postgresql @mikro-orm/nestjs nestjs-pino
```

빠진 게 있으면:
```bash
pnpm add zod @nestjs/config @mikro-orm/core @mikro-orm/postgresql @mikro-orm/nestjs nestjs-pino pino-pretty
```

> `@nestjs/cqrs`는 이전 결정대로 **사용하지 않으므로** 의존성에서 제거해도 무방하다. 다만 `EventBus` 인프라 일부 활용 가능성을 위해 일단 유지 가능. (이번 Phase 결정: **제거**한다.)

```bash
pnpm remove @nestjs/cqrs
```

---

## Step 2. `src/config/env.config.ts` 작성 (Zod)

```typescript
// src/config/env.config.ts
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(7200),

  DATABASE_URL: z.string().url(),

  JWT_SECRET: z.string().min(16),
  JWT_ACCESS_TOKEN_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_TOKEN_EXPIRES_IN: z.string().default("7d"),

  SMTP_HOST: z.string().default("smtp.gmail.com"),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().email(),
  SMTP_PASSWORD: z.string(),

  KAKAO_CLIENT_ID: z.string(),
  KAKAO_CLIENT_SECRET: z.string(),
  KAKAO_REDIRECT_URI: z.string().url(),
  KAKAO_ALLOWED_REDIRECT_URIS: z.string(),  // comma-separated

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  SERVICE_NAME: z.string().default("prepair-member-service"),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(raw: Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
```

---

## Step 3. `test/unit/config/env.config.spec.ts` 작성 (TDD Red)

```typescript
import { loadEnv } from "@/config/env.config";

describe("loadEnv", () => {
  const baseValidEnv = {
    NODE_ENV: "test",
    PORT: "7200",
    DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
    JWT_SECRET: "a-very-secret-key-of-at-least-16-chars",
    SMTP_USER: "test@test.com",
    SMTP_PASSWORD: "password",
    KAKAO_CLIENT_ID: "kakao-id",
    KAKAO_CLIENT_SECRET: "kakao-secret",
    KAKAO_REDIRECT_URI: "http://localhost:4173/callback",
    KAKAO_ALLOWED_REDIRECT_URIS: "http://localhost:4173/callback",
  };

  it("유효한 환경변수를 파싱한다", () => {
    const env = loadEnv(baseValidEnv);
    expect(env.PORT).toBe(7200);
    expect(env.NODE_ENV).toBe("test");
  });

  it("DATABASE_URL이 없으면 예외를 던진다", () => {
    const { DATABASE_URL, ...rest } = baseValidEnv;
    expect(() => loadEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it("JWT_SECRET이 16자 미만이면 예외를 던진다", () => {
    expect(() => loadEnv({ ...baseValidEnv, JWT_SECRET: "short" }))
      .toThrow(/JWT_SECRET/);
  });

  it("PORT를 숫자로 강제 변환한다", () => {
    const env = loadEnv({ ...baseValidEnv, PORT: "9999" });
    expect(env.PORT).toBe(9999);
    expect(typeof env.PORT).toBe("number");
  });
});
```

실행:
```bash
pnpm test test/unit/config/env.config.spec.ts
```

→ 모두 그린 확인.

---

## Step 4. `src/shared-kernel/shard-kernel.module.ts` 빈 모듈

> **이름이 오타다** (Shard vs Shared). 기존 `app.module.ts`가 이 이름으로 import하고 있으므로 일단 유지하고, Phase 08에서 `shared-kernel.module.ts`로 rename 한다.

```typescript
// src/shared-kernel/shard-kernel.module.ts
import { Global, Module } from "@nestjs/common";

@Global()
@Module({
  imports: [],
  providers: [],
  exports: [],
})
export class ShardKernelModule {}
```

이후 Phase 02에서 EventStore, SnapshotStore, ProjectionDispatcher가 여기에 등록된다.

---

## Step 5. `src/app.module.ts` 정리

현재 import 깨진 상태를 복구한다.

```typescript
// src/app.module.ts
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { PostgreSqlDriver } from "@mikro-orm/postgresql";
import { LoggerModule } from "nestjs-pino";

import { type Env, loadEnv } from "@/config/env.config";
import { ShardKernelModule } from "@/shared-kernel/shard-kernel.module";
import { AppController } from "@/app.controller";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: loadEnv,
    }),

    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: {
          level: config.get("LOG_LEVEL", { infer: true }),
          transport:
            config.get("NODE_ENV", { infer: true }) === "development"
              ? { target: "pino-pretty" }
              : undefined,
        },
      }),
    }),

    MikroOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        driver: PostgreSqlDriver,
        clientUrl: config.get("DATABASE_URL", { infer: true }),
        entities: ["./dist/**/*.entity.js"],
        entitiesTs: ["./src/**/*.entity.ts"],
        debug: config.get("NODE_ENV", { infer: true }) === "development",
        discovery: { warnWhenNoEntities: false },
      }),
    }),

    ShardKernelModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
```

---

## Step 6. `src/app.controller.ts` 헬스 엔드포인트

```typescript
// src/app.controller.ts
import { Controller, Get } from "@nestjs/common";

@Controller()
export class AppController {
  @Get("/health")
  health(): { status: "ok"; timestamp: string } {
    return { status: "ok", timestamp: new Date().toISOString() };
  }
}
```

---

## Step 7. `src/main.ts` 확인

기존 그대로 두면 된다. 단, `ConfigService<Env, true>` 제네릭 사용 부분이 정상 동작하는지 확인.

```typescript
// src/main.ts (예시)
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { Logger } from "nestjs-pino";

import { AppModule } from "@/app.module";
import type { Env } from "@/config/env.config";

async function bootstrap(): Promise<void> {
  const isDev = process.env.NODE_ENV === "development";
  const app = await NestFactory.create(AppModule, { bufferLogs: !isDev });

  if (!isDev) app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  const config = app.get(ConfigService<Env, true>);
  await app.listen(config.get("PORT", { infer: true }));
}

void bootstrap();
```

---

## Step 8. `Dockerfile` Prisma 제거

```diff
- RUN pnpm exec prisma generate
```

해당 라인을 삭제. 그 외 `prisma`라는 단어가 들어간 모든 라인 점검.

---

## Step 9. Docker DB 기동 & 연결 확인

```bash
docker compose -f docker/docker-compose.dev.yaml up -d
docker ps | grep prepair-db   # healthy 상태인지 확인

# .env 파일 준비 (없으면 .env.example 복사)
cp .env.example .env  # 또는 직접 작성

# DATABASE_URL 예시
# DATABASE_URL=postgresql://prepair:prepair@localhost:55432/prepair
```

---

## Step 10. 부트스트랩 & 헬스 확인

```bash
pnpm start:dev
```

다른 터미널에서:
```bash
curl http://localhost:7200/health
# → {"status":"ok","timestamp":"..."}
```

---

## 검증 (Definition of Done)

```bash
# 1. 타입체크
pnpm run build

# 2. 단위 테스트
pnpm test

# 3. 부트스트랩
pnpm start:dev   # 다른 터미널에서 curl 확인

# 4. CQRS 잔재 확인
grep -r "@nestjs/cqrs" src/   # → 0건
grep -r "CommandBus\|QueryBus" src/  # → 0건

# 5. Prisma 잔재 확인
grep -r "prisma" src/ package.json Dockerfile  # → 0건 (주석 제외)
```

전부 통과하면 다음 Phase로.

---

## 흔한 문제 & 해결

| 문제 | 원인 | 해결 |
|------|------|------|
| `Cannot find module '@/config/env.config'` | path alias 미적용 | `tsconfig.json`의 `"paths": { "@/*": ["src/*"] }` 확인 + `tsc-alias` 또는 `ts-node` 설정 |
| `connect ECONNREFUSED 127.0.0.1:55432` | DB 미기동 | `docker ps`로 확인, healthcheck pass 까지 대기 |
| `Invalid environment configuration: JWT_SECRET` | `.env` 누락 | 위 Step 9 참고해서 `.env` 작성 |
| MikroORM 엔티티 경로 경고 | 아직 엔티티 없음 | `warnWhenNoEntities: false` 설정으로 무시. Phase 02에서 첫 엔티티 추가 |

---

다음: [`02-event-sourcing-infra.md`](./02-event-sourcing-infra.md) — Event Sourcing 인프라 구현
