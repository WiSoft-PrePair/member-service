# 01. Dockerfile & .dockerignore 구성

## 개요

NestJS 애플리케이션을 Docker 이미지로 빌드하기 위한 설정입니다.
Multi-stage 빌드를 사용하여 이미지 크기를 최소화하고, ARM64(라즈베리파이) 아키텍처를 지원합니다.

---

## 사전 작업: Health Check 엔드포인트 추가

Docker와 CD 파이프라인에서 앱이 정상 동작하는지 확인하려면 `/health` 엔드포인트가 필요합니다.

### 1. `src/adapter/shared/api/health.controller.ts` (신규 생성)

```typescript
import { Controller, Get } from "@nestjs/common";
import { Public } from "@/adapter/shared/api/decorators/public.decorator";

@Controller("health")
export class HealthController {
  @Public()
  @Get()
  check() {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}
```

**포인트:**
- `@Public()` 데코레이터로 JWT 인증을 건너뜁니다 (전역 `JwtAuthGuard` 적용 중이므로)
- `process.uptime()`으로 앱이 얼마나 오래 실행 중인지 확인 가능

### 2. `src/app.module.ts` 수정

```typescript
import { HealthController } from "@/adapter/shared/api/health.controller";

@Module({
  // ... 기존 imports
  controllers: [HealthController],  // ← 추가
  // ... 기존 providers
})
export class AppModule implements NestModule {
  // ...
}
```

### 3. 동작 확인

```bash
npm run start:dev
curl http://localhost:3000/health
# 응답: {"status":"ok","timestamp":"2026-01-31T...","uptime":5.123}
```

---

## Dockerfile 생성

프로젝트 루트에 `Dockerfile`을 생성합니다.

### 전체 코드

```dockerfile
# ============================================
# Stage 1: Build
# ============================================
FROM node:20-alpine AS builder

# pnpm 설치
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# 의존성 파일만 먼저 복사 (Docker 캐시 활용)
COPY package.json pnpm-lock.yaml ./

# 모든 의존성 설치 (devDependencies 포함 - 빌드에 필요)
RUN pnpm install --frozen-lockfile

# 소스 코드 복사
COPY . .

# TypeScript 빌드
RUN pnpm run build

# ============================================
# Stage 2: Production
# ============================================
FROM node:20-alpine AS production

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# 의존성 파일 복사
COPY package.json pnpm-lock.yaml ./

# 프로덕션 의존성만 설치 (devDependencies 제외)
RUN pnpm install --frozen-lockfile --prod

# 빌드 결과물 복사
COPY --from=builder /app/dist ./dist

# 로그 디렉토리 생성 (Fluent Bit과 공유)
RUN mkdir -p /logs

# 포트 노출
EXPOSE 3000

# Health Check 설정
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); });"

# 보안: non-root 사용자로 실행
USER node

# 앱 실행
CMD ["node", "dist/main.js"]
```

### 각 단계 설명

#### Stage 1: Build

| 단계 | 설명 |
|------|------|
| `FROM node:20-alpine AS builder` | Alpine Linux 기반 Node 20 (경량, ARM64 네이티브 지원) |
| `corepack enable` | Node.js 내장 pnpm 관리 도구 활성화 |
| `COPY package.json pnpm-lock.yaml` | 의존성 파일만 먼저 복사하여 Docker 레이어 캐시 활용 |
| `pnpm install --frozen-lockfile` | lockfile 기반 정확한 의존성 설치 (devDeps 포함) |
| `COPY . .` | 나머지 소스 복사 |
| `pnpm run build` | `nest build` → TypeScript 컴파일 → `dist/` 생성 |

**캐시 전략**: `package.json`/`pnpm-lock.yaml`이 변경되지 않으면 `pnpm install`이 캐시되어 빌드 속도가 크게 향상됩니다.

#### Stage 2: Production

| 단계 | 설명 |
|------|------|
| `pnpm install --frozen-lockfile --prod` | 프로덕션 의존성만 설치 (`devDependencies` 제외) |
| `COPY --from=builder /app/dist` | Stage 1에서 빌드된 결과물만 복사 |
| `mkdir -p /logs` | 프로덕션 로그 파일 저장 디렉토리 |
| `HEALTHCHECK` | Docker가 30초마다 `/health` 엔드포인트를 호출하여 상태 확인 |
| `USER node` | root가 아닌 node 사용자로 실행 (보안) |

**Multi-stage 빌드의 장점**: TypeScript 컴파일러, @nestjs/cli, jest 등 개발 도구가 최종 이미지에 포함되지 않아 이미지 크기가 크게 줄어듭니다.

#### Path Alias (`@/`) 처리

`tsconfig.json`의 `@/*` → `src/*` path alias는 TypeScript 컴파일 시 상대 경로로 변환됩니다. 컴파일된 `dist/` 안의 JavaScript 파일은 이미 상대 경로를 사용하므로 런타임에서 추가 설정이 필요 없습니다.

---

## .dockerignore 생성

프로젝트 루트에 `.dockerignore`를 생성합니다. Docker 빌드 시 불필요한 파일을 제외하여 빌드 속도와 이미지 보안을 개선합니다.

```
# 의존성 (컨테이너 내부에서 설치)
node_modules

# 빌드 결과물 (컨테이너 내부에서 빌드)
dist

# 로그
logs
*.log
pnpm-debug.log*

# 환경 변수 (Docker env로 주입)
.env
.env.*

# Git
.git
.gitignore

# GitHub Actions
.github

# IDE
.idea
.vscode

# OS
.DS_Store
Thumbs.db

# 테스트/문서 (프로덕션 불필요)
test
docs
coverage
README.md
CLAUDE.md

# 설정 캐시
.eslintcache
```

---

## 로컬에서 빌드 & 테스트

### 이미지 빌드

```bash
# 일반 빌드 (현재 아키텍처)
docker build -t prepair-backend:local .

# ARM64 전용 빌드 (라즈베리파이용, Buildx 필요)
docker buildx build --platform linux/arm64 -t prepair-backend:arm64 .
```

### 로컬 실행 테스트

```bash
# PostgreSQL이 이미 docker-compose로 실행 중이라고 가정
docker run --rm -p 3000:3000 \
  -e NODE_ENV=dev \
  -e POSTGRES_HOST=host.docker.internal \
  -e POSTGRES_PORT=65432 \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=prepair \
  -e JWT_SECRET=test-secret \
  -e SMTP_HOST=smtp.test.com \
  -e SMTP_USER=test@test.com \
  -e SMTP_PASS=testpass \
  -e SMTP_FROM=noreply@test.com \
  -e KAKAO_CLIENT_ID=test \
  -e KAKAO_CLIENT_SECRET=test \
  -e KAKAO_REDIRECT_URI=http://localhost:3000/oauth/kakao/callback \
  prepair-backend:local
```

> `host.docker.internal`은 Docker 컨테이너에서 호스트 머신의 서비스에 접근할 때 사용합니다.

### Health Check 확인

```bash
curl http://localhost:3000/health
# {"status":"ok","timestamp":"...","uptime":...}
```

### 이미지 크기 확인

```bash
docker images prepair-backend
# REPOSITORY         TAG    SIZE
# prepair-backend    local  ~200-300MB (Alpine 기반)
```

---

## 트러블슈팅

### `pnpm: not found`
- `corepack enable`이 실행되었는지 확인
- Node 20 이상 필요 (corepack 내장)

### 빌드 시 TypeScript 에러
- 로컬에서 `pnpm run build`가 성공하는지 먼저 확인
- `pnpm-lock.yaml`이 최신인지 확인 (`pnpm install` 후 커밋)

### Health Check 실패
- `start-period=40s` 동안은 실패해도 무시됨 (앱 시작 대기)
- 앱이 3000 포트에서 리스닝하는지 확인
- 환경 변수가 모두 제공되었는지 확인 (Zod validation 실패 시 앱이 시작되지 않음)

### ARM64 빌드 시 bcryptjs 문제
- `bcryptjs`는 순수 JavaScript 구현이므로 ARM64에서 문제 없음
- 만약 `bcrypt` (native)를 사용한다면 ARM64 빌드가 실패할 수 있음 → `bcryptjs`를 계속 사용

---

## 다음 단계

→ [02-docker-compose-deploy.md](./02-docker-compose-deploy.md) — 프로덕션 docker-compose 구성
