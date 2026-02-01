# 02. Docker Compose 프로덕션 배포 구성

## 개요

라즈베리파이에서 앱, 데이터베이스, 로그 수집기를 함께 실행하는 docker-compose 설정입니다.

---

## 아키텍처

```
                    ┌───────────────────┐
                    │   Fluent Bit      │
                    │ (로그 → ES 전송)  │
                    └──────▲────────────┘
                           │ /logs 볼륨 (read-only)
                           │
┌──────────┐       ┌───────┴───────────┐
│ 클라이언트│──────▶│   PrePair App     │
│          │ :3000 │   (NestJS)        │
└──────────┘       └──────┬────────────┘
                          │ :5432
                   ┌──────▼────────────┐
                   │   PostgreSQL 17   │
                   │   (데이터베이스)    │
                   └───────────────────┘
```

---

## docker-compose.prod.yaml 전체 코드

`docker/docker-compose.prod.yaml`을 아래 내용으로 교체합니다.

```yaml
services:
  # ============================================
  # NestJS 애플리케이션
  # ============================================
  app:
    image: ghcr.io/${GITHUB_OWNER}/prepair-backend:latest
    container_name: prepair-app
    ports:
      - '3000:3000'
    environment:
      NODE_ENV: prod
      PORT: 3000
      POSTGRES_HOST: database          # Docker 내부 서비스명으로 접근
      POSTGRES_PORT: 5432              # 컨테이너 내부 포트 (호스트 포트 아님)
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
      JWT_SECRET: ${JWT_SECRET}
      JWT_ACCESS_TOKEN_EXPIRES_IN: ${JWT_ACCESS_TOKEN_EXPIRES_IN:-15m}
      JWT_REFRESH_TOKEN_EXPIRES_IN: ${JWT_REFRESH_TOKEN_EXPIRES_IN:-7d}
      SMTP_HOST: ${SMTP_HOST}
      SMTP_USER: ${SMTP_USER}
      SMTP_PASS: ${SMTP_PASS}
      SMTP_FROM: ${SMTP_FROM}
      KAKAO_CLIENT_ID: ${KAKAO_CLIENT_ID}
      KAKAO_CLIENT_SECRET: ${KAKAO_CLIENT_SECRET}
      KAKAO_REDIRECT_URI: ${KAKAO_REDIRECT_URI}
      LOG_LEVEL: ${LOG_LEVEL:-info}
      SERVICE_NAME: ${SERVICE_NAME:-prepair-member-service}
    volumes:
      - prepair-app-logs:/logs         # 앱 로그 → Fluent Bit과 공유
    networks:
      - prepair-member-network
    depends_on:
      database:
        condition: service_healthy     # DB health check 통과 후 시작
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'node', '-e', "require('http').get('http://localhost:3000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); });"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # ============================================
  # PostgreSQL 데이터베이스
  # ============================================
  database:
    image: postgres:17
    container_name: prepair-db
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    ports:
      - '${POSTGRES_PORT:-5432}:5432'
    volumes:
      - prepair-pg:/var/lib/postgresql/data
    networks:
      - prepair-member-network
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}']
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  # ============================================
  # Fluent Bit (로그 수집 → Elasticsearch)
  # ============================================
  fluent-bit:
    image: fluent/fluent-bit:3.2
    container_name: prepair-fluent-bit
    volumes:
      - ../fluentbit/fluent-bit-file.conf:/fluent-bit/etc/fluent-bit.conf
      - ../fluentbit/parsers.conf:/fluent-bit/etc/parsers.conf
      - prepair-app-logs:/logs:ro      # 앱 로그 읽기 전용
    environment:
      - SERVICE_NAME=prepair-member-logs
      - SERVICE_ENV=production
      - ELASTICSEARCH_HOST=elasticsearch
      - ELASTIC_USERNAME=${ELASTIC_USERNAME}
      - ELASTIC_PASSWORD=${ELASTIC_PASSWORD}
    networks:
      - prepair-member-network
      - logging-network
    depends_on:
      - app
    restart: unless-stopped

volumes:
  prepair-pg:
    name: prepair-pg
  prepair-app-logs:
    name: prepair-app-logs

networks:
  prepair-member-network:
    driver: bridge

  logging-network:
    external: true
    name: logging-network
```

---

## 기존 파일과 달라진 점

| 항목 | 기존 | 변경 후 |
|------|------|---------|
| app 서비스 | 없음 | GHCR 이미지 기반 추가 |
| app → DB 연결 | 호스트에서 직접 | Docker 네트워크 내부 (`database:5432`) |
| 로그 공유 | 호스트 마운트 (`./logs`) | Named volume (`prepair-app-logs`) |
| Fluent Bit 로그 | 호스트 경로 | Named volume (read-only) |

---

## 주요 설정 해설

### `POSTGRES_HOST: database`

Docker Compose에서 서비스 이름은 자동으로 DNS 호스트명이 됩니다. 앱 컨테이너에서 `database`라고 쓰면 PostgreSQL 컨테이너의 IP로 해석됩니다.

### `depends_on.condition: service_healthy`

앱이 시작되기 전에 PostgreSQL이 "ready to accept connections" 상태인지 확인합니다. MikroORM이 DB에 연결 시도할 때 실패하는 것을 방지합니다.

### Named Volume (`prepair-app-logs`)

앱이 `/logs/app.log`에 쓴 로그를 Fluent Bit이 읽습니다. Named volume을 사용하면:
- 컨테이너가 재시작되어도 로그 유지
- `:ro` (read-only)로 Fluent Bit이 실수로 로그를 수정하는 것 방지
- 호스트 경로에 의존하지 않음

### `GITHUB_OWNER` 환경 변수

`.env` 파일에 GitHub username/organization을 설정해야 합니다:

```bash
# .env
GITHUB_OWNER=your-github-username
```

---

## .env 파일 템플릿

라즈베리파이의 배포 디렉토리에 `.env` 파일을 생성합니다:

```bash
# ===================
# GitHub Container Registry
# ===================
GITHUB_OWNER=your-github-username

# ===================
# 데이터베이스
# ===================
POSTGRES_USER=prepair
POSTGRES_PASSWORD=여기에-강력한-비밀번호
POSTGRES_DB=prepair_prod
POSTGRES_PORT=5432

# ===================
# JWT 인증
# ===================
JWT_SECRET=여기에-64자-이상-랜덤-문자열
JWT_ACCESS_TOKEN_EXPIRES_IN=15m
JWT_REFRESH_TOKEN_EXPIRES_IN=7d

# ===================
# 이메일 (SMTP)
# ===================
SMTP_HOST=smtp.gmail.com
SMTP_USER=your-email@gmail.com
SMTP_PASS=앱-비밀번호
SMTP_FROM=noreply@yourdomain.com

# ===================
# 카카오 OAuth
# ===================
KAKAO_CLIENT_ID=your-kakao-client-id
KAKAO_CLIENT_SECRET=your-kakao-client-secret
KAKAO_REDIRECT_URI=https://yourdomain.com/oauth/kakao/callback

# ===================
# 로깅
# ===================
LOG_LEVEL=info
SERVICE_NAME=prepair-member-service

# ===================
# Elasticsearch (Fluent Bit)
# ===================
ELASTIC_USERNAME=elastic
ELASTIC_PASSWORD=your-elastic-password
```

---

## 배포 명령어

### 최초 배포

```bash
cd /opt/prepair-backend

# 1. logging-network이 없으면 생성 (Elasticsearch가 이 네트워크에 있어야 함)
docker network create logging-network || true

# 2. 모든 서비스 시작
docker compose -f docker/docker-compose.prod.yaml --env-file .env up -d
```

### 앱만 업데이트 (DB/Fluent Bit 유지)

```bash
docker compose -f docker/docker-compose.prod.yaml --env-file .env pull app
docker compose -f docker/docker-compose.prod.yaml --env-file .env up -d app
```

### 상태 확인

```bash
# 컨테이너 상태
docker compose -f docker/docker-compose.prod.yaml ps

# 앱 로그
docker compose -f docker/docker-compose.prod.yaml logs -f app

# Health check
curl http://localhost:3000/health
```

### 중지

```bash
# 앱만 중지
docker compose -f docker/docker-compose.prod.yaml stop app

# 모든 서비스 중지 (DB 데이터는 볼륨에 보존)
docker compose -f docker/docker-compose.prod.yaml down

# 모든 서비스 + 볼륨 삭제 (주의: DB 데이터 삭제됨!)
docker compose -f docker/docker-compose.prod.yaml down -v
```

---

## Elasticsearch/Fluent Bit 없이 배포하기

Elasticsearch가 아직 없다면 Fluent Bit 없이 배포할 수 있습니다:

```bash
# app + database만 실행 (fluent-bit 제외)
docker compose -f docker/docker-compose.prod.yaml --env-file .env up -d app database
```

나중에 Elasticsearch를 설정한 후 Fluent Bit을 추가로 시작하면 됩니다:

```bash
docker compose -f docker/docker-compose.prod.yaml --env-file .env up -d fluent-bit
```

---

## 다음 단계

→ [03-github-actions-ci.md](./03-github-actions-ci.md) — CI 파이프라인 (테스트 + 빌드 + GHCR 푸시)
