# 03. GitHub Actions CI 파이프라인

## 개요

코드를 push하면 자동으로 테스트/린트를 실행하고, `main` 브랜치에서는 Docker 이미지를 빌드하여 GHCR에 푸시합니다.

```
Push/PR → Lint → Test → (main만) Build Docker Image → Push to GHCR
```

---

## 사전 지식: GitHub Actions란?

GitHub Actions는 GitHub 저장소에서 코드 변경 시 자동으로 실행되는 워크플로우입니다.

- **워크플로우**: `.github/workflows/` 디렉토리의 YAML 파일
- **트리거**: push, PR, 다른 워크플로우 완료 등
- **러너**: GitHub이 제공하는 클라우드 서버 (Ubuntu)에서 실행
- **비용**: Public 저장소 무료, Private 저장소 월 2,000분 무료

---

## 사전 지식: GHCR(GitHub Container Registry)란?

GitHub에서 Docker 이미지를 저장하는 서비스입니다.

- `ghcr.io/사용자명/이미지명:태그` 형식
- GitHub Actions에서 `GITHUB_TOKEN`으로 자동 인증 (별도 설정 불필요)
- Private 저장소: 월 500MB 스토리지 무료

---

## 워크플로우 파일 생성

`.github/workflows/ci.yml`을 생성합니다.

### 전체 코드

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  # ============================================
  # Job 1: 린트 + 테스트
  # ============================================
  test:
    name: Lint & Test
    runs-on: ubuntu-latest

    # 테스트용 PostgreSQL 컨테이너
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: prepair_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - name: 코드 체크아웃
        uses: actions/checkout@v4

      - name: pnpm 설정
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Node.js 설정
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'       # pnpm 의존성 캐시

      - name: 의존성 설치
        run: pnpm install --frozen-lockfile

      - name: 린트 검사
        run: pnpm run lint

      - name: 테스트 실행
        env:
          NODE_ENV: test
          POSTGRES_HOST: localhost
          POSTGRES_PORT: 5432
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: prepair_test
          JWT_SECRET: test-jwt-secret-for-ci
          JWT_ACCESS_TOKEN_EXPIRES_IN: 15m
          JWT_REFRESH_TOKEN_EXPIRES_IN: 7d
          SMTP_HOST: smtp.test.com
          SMTP_USER: test@test.com
          SMTP_PASS: testpass
          SMTP_FROM: noreply@test.com
          KAKAO_CLIENT_ID: test-kakao-client
          KAKAO_CLIENT_SECRET: test-kakao-secret
          KAKAO_REDIRECT_URI: http://localhost:3000/oauth/kakao/callback
        run: pnpm run test

  # ============================================
  # Job 2: Docker 이미지 빌드 + GHCR 푸시
  # ============================================
  build:
    name: Build & Push Docker Image
    runs-on: ubuntu-latest
    needs: test                         # test job 성공 후 실행
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'  # main push만

    permissions:
      contents: read
      packages: write                   # GHCR에 이미지 푸시 권한

    steps:
      - name: 코드 체크아웃
        uses: actions/checkout@v4

      - name: Docker Buildx 설정
        uses: docker/setup-buildx-action@v3

      - name: GHCR 로그인
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: 이미지 메타데이터 설정
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ github.repository }}
          tags: |
            type=raw,value=latest
            type=sha,prefix=

      - name: Docker 이미지 빌드 & 푸시
        uses: docker/build-push-action@v6
        with:
          context: .
          platforms: linux/arm64        # 라즈베리파이용 ARM64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha          # GitHub Actions 캐시 사용
          cache-to: type=gha,mode=max
```

---

## 각 단계 상세 설명

### 트리거 (`on`)

```yaml
on:
  push:
    branches: [main, develop]      # main, develop에 push 시
  pull_request:
    branches: [main, develop]      # main, develop으로 PR 생성/업데이트 시
```

- PR에서는 테스트만 실행 (Docker 빌드 안 함)
- `main` push에서만 Docker 이미지 빌드 + GHCR 푸시

### PostgreSQL 서비스 컨테이너

```yaml
services:
  postgres:
    image: postgres:17
    ...
```

GitHub Actions 러너 안에서 PostgreSQL 컨테이너가 자동으로 시작됩니다. 테스트 코드가 `localhost:5432`로 접근할 수 있습니다.

### pnpm 캐시

```yaml
- uses: pnpm/action-setup@v4      # pnpm 설치
- uses: actions/setup-node@v4
  with:
    cache: 'pnpm'                  # node_modules 캐시
```

두 번째 실행부터 `pnpm install`이 캐시를 사용하여 빠르게 완료됩니다.

### 테스트 환경 변수

앱이 시작할 때 Zod가 환경 변수를 검증합니다. 모든 필수 변수를 CI용 더미 값으로 제공합니다. 이 값들은 실제 서비스에 접근하지 않으므로 보안 걱정이 없습니다.

### Docker Buildx

```yaml
- uses: docker/setup-buildx-action@v3
```

**Buildx**는 Docker의 확장 빌드 도구로, **다른 아키텍처**(ARM64)용 이미지를 x86 서버(GitHub Actions 러너)에서 빌드할 수 있게 합니다. 내부적으로 QEMU 에뮬레이터를 사용합니다.

### 이미지 태그

```yaml
tags: |
  type=raw,value=latest         # ghcr.io/user/repo:latest
  type=sha,prefix=              # ghcr.io/user/repo:abc1234 (커밋 SHA)
```

- `latest`: 항상 가장 최신 빌드를 가리킴 → 배포 시 사용
- `abc1234`: 특정 커밋의 이미지 → 롤백 시 사용

### GHCR 인증

```yaml
- uses: docker/login-action@v3
  with:
    registry: ghcr.io
    username: ${{ github.actor }}
    password: ${{ secrets.GITHUB_TOKEN }}
```

`GITHUB_TOKEN`은 GitHub Actions가 자동으로 제공합니다. 별도 시크릿 설정이 필요 없습니다.

### `permissions`

```yaml
permissions:
  contents: read      # 코드 읽기
  packages: write     # GHCR에 이미지 쓰기
```

기본 `GITHUB_TOKEN`의 권한을 명시적으로 설정합니다. `packages: write`가 있어야 GHCR에 이미지를 푸시할 수 있습니다.

---

## 이미지 태그 확인

빌드 후 GitHub 저장소에서 확인할 수 있습니다:

1. GitHub 저장소 → 오른쪽 사이드바 → "Packages"
2. 또는 `ghcr.io/사용자명/저장소명` 주소로 직접 접근

CLI로 확인:

```bash
# GHCR에서 이미지 태그 목록
docker manifest inspect ghcr.io/your-username/prepair-backend:latest
```

---

## GitHub Actions 로그 확인

1. GitHub 저장소 → **Actions** 탭
2. 워크플로우 실행 목록에서 클릭
3. 각 Job과 Step의 로그 확인 가능

---

## 트러블슈팅

### `pnpm-lock.yaml`이 outdated

```
ERR_PNPM_OUTDATED_LOCKFILE
```

로컬에서 `pnpm install`을 실행하고 `pnpm-lock.yaml`을 커밋합니다.

### ARM64 빌드가 너무 느림

QEMU 에뮬레이션은 네이티브 빌드보다 느립니다. `cache-from: type=gha`로 캐시를 활용하면 두 번째부터 빠릅니다. 첫 빌드는 10-15분 정도 소요될 수 있습니다.

### `permission denied` on GHCR push

저장소 Settings → Actions → General에서:
- "Workflow permissions"가 "Read and write permissions"인지 확인

또는 Package visibility 설정:
- GitHub 프로필 → Packages → 해당 패키지 → Settings → Manage Actions access

### 테스트 실패: DB 연결 에러

- PostgreSQL 서비스 컨테이너가 정상 시작되었는지 확인
- `POSTGRES_HOST: localhost`, `POSTGRES_PORT: 5432`가 맞는지 확인
- 서비스 컨테이너의 health check가 통과했는지 로그 확인

---

## 다음 단계

→ [04-github-actions-cd.md](./04-github-actions-cd.md) — CD 파이프라인 (라즈베리파이 자동 배포)
