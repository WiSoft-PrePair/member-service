# 06. Secrets 및 환경 변수 관리

## 개요

CI/CD 파이프라인과 프로덕션 환경에서 사용하는 모든 시크릿과 환경 변수를 정리합니다.

---

## 시크릿이 저장되는 곳

| 위치 | 용도 | 접근 주체 |
|------|------|-----------|
| GitHub Secrets | CD 배포 (SSH 키, 호스트 정보) | GitHub Actions |
| 라즈베리파이 `.env` | 앱 실행 환경 변수 (DB, JWT 등) | Docker Compose |

> CI 테스트용 환경 변수는 워크플로우 YAML에 하드코딩합니다 (더미 값이므로 안전).

---

## GitHub Secrets 목록

### 필수

GitHub 저장소 → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| Name | 값 예시 | 설명 |
|------|---------|------|
| `RASPI_SSH_PRIVATE_KEY` | `cat ~/.ssh/wisoft/wisoft-auth` 의 출력 | SSH 개인키 전체 내용 |
| `RASPI_USER` | `student` | 라즈베리파이 SSH 사용자명 |
| `RASPI_HOST` | 서버 IP 또는 도메인 | 라즈베리파이 외부 접근 주소 |
| `RASPI_SSH_PORT` | `10020` | SSH 포트 (기본 22가 아님) |
| `RASPI_DEPLOY_PATH` | `/opt/prepair-backend` | 배포 디렉토리 절대 경로 |

### 자동 제공 (설정 불필요)

| Name | 설명 |
|------|------|
| `GITHUB_TOKEN` | GitHub Actions가 자동 생성. GHCR 인증에 사용. |

### 선택

| Name | 설명 | 언제 필요한가 |
|------|------|---------------|
| `TS_OAUTH_CLIENT_ID` | Tailscale OAuth Client ID | Tailscale VPN 사용 시 |
| `TS_OAUTH_SECRET` | Tailscale OAuth Secret | Tailscale VPN 사용 시 |

---

## 라즈베리파이 `.env` 전체 변수

### 앱 필수 변수 (Zod 검증)

이 변수들이 없으면 앱이 시작되지 않습니다 (`env.config.ts`의 Zod 스키마가 검증).

| 변수 | 필수 | 기본값 | 설명 |
|------|------|--------|------|
| `NODE_ENV` | Y | - | `prod` (프로덕션) |
| `POSTGRES_HOST` | N | `localhost` | Docker에서는 `database` |
| `POSTGRES_PORT` | N | `5432` | DB 내부 포트 |
| `POSTGRES_USER` | Y | - | DB 사용자명 |
| `POSTGRES_PASSWORD` | Y | - | DB 비밀번호 |
| `POSTGRES_DB` | Y | - | DB 이름 |
| `JWT_SECRET` | N | `secret` | **반드시 변경!** |
| `JWT_ACCESS_TOKEN_EXPIRES_IN` | N | `15m` | 액세스 토큰 만료 |
| `JWT_REFRESH_TOKEN_EXPIRES_IN` | N | `7d` | 리프레시 토큰 만료 |
| `SMTP_HOST` | Y | - | SMTP 서버 주소 |
| `SMTP_USER` | Y | - | SMTP 사용자 |
| `SMTP_PASS` | Y | - | SMTP 비밀번호 |
| `SMTP_FROM` | Y | - | 발신 이메일 주소 |
| `KAKAO_CLIENT_ID` | Y | - | 카카오 REST API 키 |
| `KAKAO_CLIENT_SECRET` | Y | - | 카카오 Client Secret |
| `KAKAO_REDIRECT_URI` | Y | - | 카카오 OAuth 리다이렉트 URI |
| `LOG_LEVEL` | N | `info` | 로그 레벨 |
| `SERVICE_NAME` | N | `prepair-member-service` | 서비스 이름 |

### Docker Compose 추가 변수

| 변수 | 설명 |
|------|------|
| `GITHUB_OWNER` | GHCR 이미지 경로에 사용되는 GitHub 사용자명 |
| `ELASTIC_USERNAME` | Elasticsearch 사용자명 (Fluent Bit용) |
| `ELASTIC_PASSWORD` | Elasticsearch 비밀번호 |

---

## 시크릿 생성 방법

### JWT Secret

```bash
# 64바이트 랜덤 → Base64 인코딩 (약 88자)
openssl rand -base64 64 | tr -d '\n'
```

### PostgreSQL 비밀번호

```bash
# 32바이트 랜덤 (약 44자)
openssl rand -base64 32 | tr -d '\n'
```

### 영숫자만 필요한 경우

```bash
# 32자 영숫자 랜덤
LC_ALL=C tr -dc 'a-zA-Z0-9' < /dev/urandom | head -c 32
```

---

## Gmail SMTP 앱 비밀번호 설정

Gmail을 SMTP로 사용하려면 **앱 비밀번호**가 필요합니다 (일반 비밀번호 불가).

### 1. 2단계 인증 활성화

1. [Google 계정](https://myaccount.google.com/) → **보안**
2. **2단계 인증** → 활성화

### 2. 앱 비밀번호 생성

1. [앱 비밀번호 페이지](https://myaccount.google.com/apppasswords)
2. 앱 이름: `prepair-backend` (아무 이름)
3. **생성** 클릭
4. 16자리 비밀번호가 표시됨 → `.env`의 `SMTP_PASS`에 입력

```bash
SMTP_HOST=smtp.gmail.com
SMTP_USER=your-email@gmail.com
SMTP_PASS=abcd efgh ijkl mnop    # 공백 제거: abcdefghijklmnop
SMTP_FROM=your-email@gmail.com
```

---

## 카카오 OAuth 키 확인

1. [Kakao Developers](https://developers.kakao.com/) → 내 애플리케이션
2. 앱 선택 → **앱 키**
   - **REST API 키** → `KAKAO_CLIENT_ID`
3. **보안** 탭
   - **Client Secret** → `KAKAO_CLIENT_SECRET` (코드 생성 필요)
4. **카카오 로그인** → **Redirect URI**
   - 프로덕션 URI 등록: `https://yourdomain.com/oauth/kakao/callback`
   - `KAKAO_REDIRECT_URI`와 일치해야 함

---

## 환경별 값 차이

| 변수 | 개발 (.env) | 프로덕션 (RPi .env) |
|------|-------------|---------------------|
| `NODE_ENV` | `dev` | `prod` |
| `POSTGRES_HOST` | `localhost` | `database` |
| `POSTGRES_PORT` | `65432` | `5432` |
| `JWT_SECRET` | `helloworld` | `랜덤-64자-이상` |
| `LOG_LEVEL` | `debug` | `info` |
| `KAKAO_REDIRECT_URI` | `http://localhost:3000/...` | `https://yourdomain.com/...` |

---

## 시크릿 로테이션 (비밀번호 변경)

### JWT Secret 변경

```bash
# 1. 새 시크릿 생성
openssl rand -base64 64 | tr -d '\n'

# 2. .env 파일 수정
nano /opt/prepair-backend/.env
# JWT_SECRET=새로운-시크릿

# 3. 앱 재시작
cd /opt/prepair-backend
docker compose -f docker/docker-compose.prod.yaml --env-file .env restart app
```

> JWT Secret이 바뀌면 기존에 발급된 모든 토큰이 무효화됩니다.
> 사용자들이 다시 로그인해야 합니다.

### PostgreSQL 비밀번호 변경

```bash
# 1. 먼저 DB에서 비밀번호 변경
docker exec -it prepair-db psql -U prepair -c "ALTER USER prepair PASSWORD 'new-password';"

# 2. .env 파일 수정
nano /opt/prepair-backend/.env
# POSTGRES_PASSWORD=new-password

# 3. 앱 재시작
docker compose -f docker/docker-compose.prod.yaml --env-file .env restart app
```

> **순서 중요**: DB에서 먼저 변경 → .env 수정 → 앱 재시작.
> .env만 바꾸고 DB를 안 바꾸면 앱이 DB에 접속하지 못합니다.

---

## .env 파일 백업

```bash
# 백업 생성
cp /opt/prepair-backend/.env ~/env-backup-$(date +%Y%m%d).txt
chmod 600 ~/env-backup-*.txt

# 복원
cp ~/env-backup-20260131.txt /opt/prepair-backend/.env
```

> 백업 파일은 안전한 곳(비밀번호 관리자, 암호화된 저장소)에 보관하세요.

---

## 보안 체크리스트

- [ ] `.env` 파일이 `.gitignore`에 포함되어 있는지 확인
- [ ] `JWT_SECRET`이 64자 이상의 랜덤 문자열인지 확인
- [ ] `POSTGRES_PASSWORD`가 충분히 강력한지 확인
- [ ] SSH 키에 패스프레이즈가 없는 것은 자동화를 위한 것 (키 파일 자체를 안전하게 관리)
- [ ] GitHub Secrets에 등록된 값이 올바른지 확인
- [ ] 라즈베리파이 `.env` 파일 권한이 `600`인지 확인
- [ ] GHCR 패키지 visibility가 Private인지 확인 (필요 시)
- [ ] 프로덕션에서 `LOG_LEVEL`이 `debug`가 아닌지 확인 (민감 정보 로깅 방지)

---

## 전체 문서 목록

1. [01-dockerfile.md](./01-dockerfile.md) — Dockerfile & Health Check
2. [02-docker-compose-deploy.md](./02-docker-compose-deploy.md) — 프로덕션 Compose
3. [03-github-actions-ci.md](./03-github-actions-ci.md) — CI 파이프라인
4. [04-github-actions-cd.md](./04-github-actions-cd.md) — CD 파이프라인
5. [05-raspberry-pi-setup.md](./05-raspberry-pi-setup.md) — 라즈베리파이 설정
6. **[06-secrets-and-env.md](./06-secrets-and-env.md)** — 시크릿 관리 (현재 문서)
