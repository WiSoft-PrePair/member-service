# 05. 라즈베리파이 초기 세팅

## 개요

라즈베리파이를 배포 서버로 사용하기 위한 초기 설정 가이드입니다.
아래 순서대로 진행하세요.

---

## 전제 조건

- Raspberry Pi 4/5 (4GB+ RAM 권장)
- Raspberry Pi OS 64-bit (Bookworm) 또는 Ubuntu Server 24.04 ARM64
- microSD 카드 32GB 이상 (SSD 권장)
- SSH 접속 가능한 상태
- 인터넷 연결

---

## Step 1: 시스템 업데이트

```bash
sudo apt update && sudo apt upgrade -y
```

---

## Step 2: Docker 설치

### 자동 설치 스크립트

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
rm get-docker.sh
```

### 현재 사용자에게 Docker 권한 부여

```bash
sudo usermod -aG docker $USER
```

**중요**: 그룹 변경을 적용하려면 **로그아웃 후 다시 로그인**하거나 **재부팅**해야 합니다.

```bash
sudo reboot
```

### 설치 확인

```bash
docker --version
# Docker version 27.x.x

docker compose version
# Docker Compose version v2.x.x

# sudo 없이 실행되는지 확인
docker ps
```

---

## Step 3: 배포 디렉토리 생성

```bash
sudo mkdir -p /opt/prepair-backend
sudo chown $USER:$USER /opt/prepair-backend
```

### 필요한 파일 구조

```
/opt/prepair-backend/
├── .env                          # 환경 변수 (직접 생성)
├── docker/
│   └── docker-compose.prod.yaml  # 프로덕션 compose 파일
└── fluentbit/
    ├── fluent-bit-file.conf      # Fluent Bit 설정
    └── parsers.conf              # 파서 설정
```

### 방법 A: Git clone

```bash
cd /opt/prepair-backend
git clone https://github.com/YOUR_USERNAME/prepair-backend.git .
```

### 방법 B: 필요한 파일만 복사

Git을 사용하지 않는다면 필요한 파일만 복사합니다:

```bash
cd /opt/prepair-backend
mkdir -p docker fluentbit

# 로컬에서 scp로 복사 (로컬 머신에서 실행)
scp -P 10020 docker/docker-compose.prod.yaml student@RASPI_IP:/opt/prepair-backend/docker/
scp -P 10020 fluentbit/fluent-bit-file.conf student@RASPI_IP:/opt/prepair-backend/fluentbit/
scp -P 10020 fluentbit/parsers.conf student@RASPI_IP:/opt/prepair-backend/fluentbit/
```

---

## Step 4: 환경 변수 설정

### .env 파일 생성

```bash
nano /opt/prepair-backend/.env
```

### 시크릿 생성

```bash
# JWT Secret (64자 랜덤 문자열)
openssl rand -base64 64 | tr -d '\n'; echo

# PostgreSQL 비밀번호 (32자 랜덤 문자열)
openssl rand -base64 32 | tr -d '\n'; echo
```

### .env 내용

```bash
# GitHub Container Registry
GITHUB_OWNER=your-github-username

# 데이터베이스
POSTGRES_USER=prepair
POSTGRES_PASSWORD=여기에-위에서-생성한-비밀번호
POSTGRES_DB=prepair_prod
POSTGRES_PORT=5432

# JWT
JWT_SECRET=여기에-위에서-생성한-시크릿
JWT_ACCESS_TOKEN_EXPIRES_IN=15m
JWT_REFRESH_TOKEN_EXPIRES_IN=7d

# SMTP (Gmail 예시)
SMTP_HOST=smtp.gmail.com
SMTP_USER=your-email@gmail.com
SMTP_PASS=앱-비밀번호-16자리
SMTP_FROM=noreply@yourdomain.com

# Kakao OAuth
KAKAO_CLIENT_ID=your-kakao-rest-api-key
KAKAO_CLIENT_SECRET=your-kakao-client-secret
KAKAO_REDIRECT_URI=https://yourdomain.com/oauth/kakao/callback

# 로깅
LOG_LEVEL=info
SERVICE_NAME=prepair-member-service

# Elasticsearch (Fluent Bit용, 없으면 비워도 됨)
ELASTIC_USERNAME=elastic
ELASTIC_PASSWORD=your-elastic-password
```

### .env 파일 권한 설정

```bash
chmod 600 /opt/prepair-backend/.env
```

---

## Step 5: SSH 키를 GitHub Secret에 등록

이미 라즈베리파이에 접속하는 SSH 키(`~/.ssh/wisoft/wisoft-auth`)가 있으므로, 이 키를 GitHub Actions에서도 사용합니다.

### 개인키를 GitHub Secret에 등록

```bash
# 개인키 내용 확인 (이 내용을 복사)
cat ~/.ssh/wisoft/wisoft-auth
```

1. GitHub 저장소 → **Settings** → **Secrets and variables** → **Actions**
2. **New repository secret** 클릭
3. Name: `RASPI_SSH_PRIVATE_KEY`
4. Value: 위에서 복사한 개인키 전체 (`-----BEGIN...`부터 `-----END...`까지)

### 나머지 Secrets 등록

| Name | Value |
|------|-------|
| `RASPI_USER` | `student` |
| `RASPI_HOST` | 라즈베리파이 서버 IP 또는 도메인 |
| `RASPI_SSH_PORT` | `10020` |
| `RASPI_DEPLOY_PATH` | `/opt/prepair-backend` |

### SSH 테스트

```bash
# 로컬에서 테스트 (현재 접속하는 방식과 동일)
ssh -p 10020 -i ~/.ssh/wisoft/wisoft-auth student@RASPI_HOST "echo OK && docker --version"
```

---

## Step 6: Docker 네트워크 생성

```bash
# Fluent Bit → Elasticsearch용 외부 네트워크
docker network create logging-network || echo "이미 존재합니다"
```

> Elasticsearch를 사용하지 않는다면 이 네트워크가 없어도 됩니다.
> 단, `docker-compose.prod.yaml`에서 `logging-network`를 참조하므로,
> Fluent Bit 없이 배포하려면 `docker compose up -d app database`로 실행하세요.

---

## Step 7: 방화벽 설정

```bash
# ufw 설치 (없을 경우)
sudo apt install ufw -y

# SSH 허용 (중요: 이걸 먼저 하지 않으면 접속이 끊길 수 있음!)
sudo ufw allow 10020/tcp

# 앱 포트 허용
sudo ufw allow 3000/tcp

# 방화벽 활성화
sudo ufw enable

# 상태 확인
sudo ufw status
```

출력 예시:
```
Status: active

To                         Action      From
--                         ------      ----
10020/tcp                  ALLOW       Anywhere
3000/tcp                   ALLOW       Anywhere
```

> **주의**: `sudo ufw enable` 전에 반드시 `allow 10020/tcp`를 먼저 실행하세요.
> 그렇지 않으면 SSH 접속이 끊기고 다시 물리적으로 접근해야 합니다.

---

## Step 8: 외부 접근 설정

GitHub Actions(인터넷)에서 라즈베리파이(내부 네트워크)에 접근해야 합니다.

### 옵션 A: 공유기 포트 포워딩

1. 공유기 관리 페이지 접속 (보통 `192.168.0.1` 또는 `192.168.1.1`)
2. 포트 포워딩 설정:
   - 외부 포트: `2222` (기본 22를 피하는 것이 보안상 좋음)
   - 내부 IP: 라즈베리파이 IP (예: `192.168.1.100`)
   - 내부 포트: `22`
3. `RASPI_HOST`에 공인 IP 또는 DDNS 주소 사용

SSH 설정 변경 (포트 2222를 사용하는 경우):
CD 워크플로우의 `ssh-keyscan`과 `ssh` 명령에 `-p 2222` 옵션을 추가해야 합니다.

### 옵션 B: Tailscale (추천)

포트 포워딩 없이 안전하게 접근할 수 있는 VPN 서비스입니다.

**라즈베리파이에 Tailscale 설치:**

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

브라우저에서 인증하면 Tailscale IP가 할당됩니다 (예: `100.x.y.z`).

**GitHub Actions에서 Tailscale 사용:**

CD 워크플로우에 Tailscale 연결 단계를 추가합니다.
[Tailscale GitHub Action 공식 문서](https://github.com/tailscale/github-action) 참고.

`RASPI_HOST` Secret에 Tailscale IP를 사용합니다.

### 옵션 C: Self-hosted Runner

라즈베리파이 자체를 GitHub Actions 러너로 등록하면 SSH 없이 직접 명령을 실행할 수 있습니다.

```bash
# 라즈베리파이에서 실행
# GitHub 저장소 → Settings → Actions → Runners → New self-hosted runner
# ARM64 Linux 선택 후 안내대로 설치
```

이 경우 CD 워크플로우에서 `runs-on: self-hosted`를 사용하고 SSH 관련 단계를 제거합니다.

---

## Step 9: 최초 수동 배포 (테스트)

자동화 전에 수동으로 한 번 배포하여 모든 설정이 맞는지 확인합니다.

### GHCR 로그인

라즈베리파이에서 GHCR에 접근하려면 **Personal Access Token(PAT)**이 필요합니다.

1. GitHub → Settings → Developer settings → Personal access tokens → **Tokens (classic)**
2. **Generate new token** 클릭
3. 권한: `read:packages` 선택
4. 토큰 생성 후 복사

```bash
# 라즈베리파이에서
echo "ghp_YOUR_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

### 이미지 Pull & 실행

```bash
cd /opt/prepair-backend

# 이미지 다운로드
docker compose -f docker/docker-compose.prod.yaml --env-file .env pull app

# 모든 서비스 시작
docker compose -f docker/docker-compose.prod.yaml --env-file .env up -d

# 상태 확인
docker compose -f docker/docker-compose.prod.yaml ps

# Health check
curl http://localhost:3000/health
```

> 아직 CI에서 이미지를 빌드하지 않았다면 이 단계는 건너뛰고,
> 01-dockerfile.md에 따라 로컬에서 빌드 후 GHCR에 수동 push하거나,
> CI를 먼저 설정하세요.

---

## Step 10: 자동 시작 설정

라즈베리파이가 재부팅되면 Docker 서비스와 컨테이너가 자동으로 시작되도록 설정합니다.

```bash
# Docker 서비스 자동 시작
sudo systemctl enable docker

# 컨테이너는 restart: unless-stopped 으로 이미 자동 재시작 설정됨
# (docker-compose.prod.yaml에 설정되어 있음)
```

---

## 유지보수 명령어 모음

### 로그 확인

```bash
# 앱 로그 (실시간)
docker logs -f prepair-app

# 최근 100줄
docker logs --tail=100 prepair-app

# DB 로그
docker logs -f prepair-db
```

### 서비스 관리

```bash
cd /opt/prepair-backend

# 앱 재시작
docker compose -f docker/docker-compose.prod.yaml restart app

# 앱 중지
docker compose -f docker/docker-compose.prod.yaml stop app

# 모든 서비스 중지
docker compose -f docker/docker-compose.prod.yaml down
```

### 디스크 정리

```bash
# 미사용 이미지 삭제
docker image prune -af

# 미사용 볼륨 삭제 (주의: DB 데이터 삭제 가능!)
# docker volume prune -f

# 디스크 사용량 확인
df -h
docker system df
```

### 리소스 모니터링

```bash
# 컨테이너 CPU/메모리 사용량
docker stats

# 시스템 전체 (htop 설치 추천)
sudo apt install htop -y
htop
```

---

## 트러블슈팅

### Docker 설치 실패

ARM64 OS인지 확인:
```bash
uname -m
# aarch64 이어야 함
```

### 디스크 공간 부족

```bash
# Docker 관련 정리
docker system prune -af

# 불필요한 패키지 정리
sudo apt autoremove -y
```

### SSH 접속 불가

```bash
# SSH 서비스 상태 확인 (라즈베리파이에서)
sudo systemctl status ssh

# SSH 서비스 시작
sudo systemctl start ssh
sudo systemctl enable ssh
```

### 컨테이너가 계속 재시작됨

```bash
# 컨테이너 상태 확인
docker ps -a

# 종료 코드 확인
docker inspect prepair-app --format='{{.State.ExitCode}}'

# 로그에서 원인 확인
docker logs prepair-app
```

일반적인 원인:
- 환경 변수 누락 (Zod validation 실패)
- DB 연결 실패 (`POSTGRES_HOST`가 `database`인지 확인)
- 포트 충돌 (3000번 포트가 이미 사용 중)

---

## 다음 단계

→ [06-secrets-and-env.md](./06-secrets-and-env.md) — 시크릿 및 환경 변수 관리
