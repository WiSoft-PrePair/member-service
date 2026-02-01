# 04. GitHub Actions CD 파이프라인

## 개요

CI에서 Docker 이미지가 GHCR에 푸시되면, 자동으로 라즈베리파이에 SSH 접속하여 새 이미지를 배포합니다.

```
CI 성공 (main) → CD 트리거 → SSH to RPi → docker pull → docker up → health check
```

---

## 사전 지식: CD(Continuous Deployment)란?

CI가 "코드가 정상인지 확인"이라면, CD는 "확인된 코드를 서버에 자동으로 배포"합니다.

이 파이프라인에서는:
1. GitHub Actions 러너(클라우드)에서 SSH로 라즈베리파이에 접속
2. 라즈베리파이에서 GHCR로부터 새 이미지를 다운로드
3. 기존 컨테이너를 새 이미지로 교체
4. `/health` 엔드포인트로 정상 동작 확인

---

## 사전 준비: GitHub Secrets 등록

GitHub 저장소 → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| Secret 이름 | 값 | 설명 |
|---|---|---|
| `RASPI_SSH_PRIVATE_KEY` | SSH 개인키 내용 전체 | `~/.ssh/wisoft/wisoft-auth` 파일의 전체 내용 |
| `RASPI_USER` | `student` | 라즈베리파이 SSH 사용자명 |
| `RASPI_HOST` | 서버 IP 또는 도메인 | 라즈베리파이 IP 주소 또는 도메인 |
| `RASPI_SSH_PORT` | `10020` | SSH 포트 (기본 22가 아님) |
| `RASPI_DEPLOY_PATH` | `/opt/prepair-backend` | 배포 디렉토리 경로 |

> 기존에 사용 중인 SSH 키(`~/.ssh/wisoft/wisoft-auth`)를 GitHub Secret에 등록합니다.
> `cat ~/.ssh/wisoft/wisoft-auth` 로 개인키 내용을 복사하여 `RASPI_SSH_PRIVATE_KEY`에 등록하세요.

### 중요: 라즈베리파이가 외부에서 접근 가능해야 합니다

GitHub Actions 러너는 인터넷에 있으므로, 라즈베리파이에 SSH로 접근하려면:

**옵션 A: 포트 포워딩** (공유기 설정)
- 공유기에서 외부 포트(예: 2222) → 라즈베리파이 내부 IP:22 포워딩
- `RASPI_HOST`에 공인 IP 또는 DDNS 주소 사용

**옵션 B: Tailscale/ZeroTier** (추천)
- 라즈베리파이와 GitHub Actions 러너를 같은 VPN에 연결
- 포트 포워딩 없이 안전하게 접근
- [Tailscale GitHub Action](https://github.com/tailscale/github-action) 사용

**옵션 C: Self-hosted Runner**
- 라즈베리파이 자체를 GitHub Actions 러너로 등록
- SSH 불필요, 직접 명령 실행
- 단점: 러너 관리 필요

---

## 워크플로우 파일 생성

`.github/workflows/cd.yml`을 생성합니다.

### 전체 코드

```yaml
name: CD

on:
  workflow_run:
    workflows: ['CI']           # CI 워크플로우 이름과 일치해야 함
    types: [completed]
    branches: [main]

jobs:
  deploy:
    name: Deploy to Raspberry Pi
    runs-on: ubuntu-latest
    if: ${{ github.event.workflow_run.conclusion == 'success' }}  # CI 성공 시만

    steps:
      - name: SSH 키 설정
        uses: webfactory/ssh-agent@v0.9.0
        with:
          ssh-private-key: ${{ secrets.RASPI_SSH_PRIVATE_KEY }}

      - name: Known Hosts 등록
        run: |
          mkdir -p ~/.ssh
          ssh-keyscan -p ${{ secrets.RASPI_SSH_PORT }} -H ${{ secrets.RASPI_HOST }} >> ~/.ssh/known_hosts

      - name: 라즈베리파이에 배포
        env:
          RASPI_USER: ${{ secrets.RASPI_USER }}
          RASPI_HOST: ${{ secrets.RASPI_HOST }}
          SSH_PORT: ${{ secrets.RASPI_SSH_PORT }}
          DEPLOY_PATH: ${{ secrets.RASPI_DEPLOY_PATH }}
        run: |
          ssh -p ${SSH_PORT} ${RASPI_USER}@${RASPI_HOST} << 'ENDSSH'
            set -e

            echo "=== 배포 디렉토리 이동 ==="
            cd ${{ secrets.RASPI_DEPLOY_PATH }}

            echo "=== GHCR 로그인 ==="
            echo "${{ secrets.GITHUB_TOKEN }}" | docker login ghcr.io -u ${{ github.actor }} --password-stdin

            echo "=== 최신 이미지 Pull ==="
            docker compose -f docker/docker-compose.prod.yaml --env-file .env pull app

            echo "=== 앱 컨테이너 재시작 ==="
            docker compose -f docker/docker-compose.prod.yaml --env-file .env up -d app

            echo "=== Health Check (최대 60초 대기) ==="
            for i in $(seq 1 12); do
              if curl -sf http://localhost:3000/health > /dev/null 2>&1; then
                echo "Health check 통과!"
                exit 0
              fi
              echo "시도 $i/12 실패, 5초 후 재시도..."
              sleep 5
            done

            echo "Health check 실패! 컨테이너 로그:"
            docker compose -f docker/docker-compose.prod.yaml logs --tail=50 app
            exit 1
          ENDSSH

      - name: 오래된 이미지 정리
        if: success()
        run: |
          ssh -p ${{ secrets.RASPI_SSH_PORT }} ${{ secrets.RASPI_USER }}@${{ secrets.RASPI_HOST }} << 'ENDSSH'
            docker image prune -af --filter "until=72h" || true
          ENDSSH
```

---

## 각 단계 상세 설명

### 트리거

```yaml
on:
  workflow_run:
    workflows: ['CI']
    types: [completed]
    branches: [main]
```

- `workflow_run`: 다른 워크플로우가 끝난 후 실행
- `workflows: ['CI']`: CI 워크플로우의 `name` 필드와 일치해야 함
- `types: [completed]`: CI가 완료(성공/실패 모두)되면 트리거
- `if: conclusion == 'success'`: Job 레벨에서 CI 성공 여부를 다시 확인

### SSH 키 설정

```yaml
- uses: webfactory/ssh-agent@v0.9.0
  with:
    ssh-private-key: ${{ secrets.RASPI_SSH_PRIVATE_KEY }}
```

SSH 에이전트에 개인키를 등록합니다. 이후 `ssh` 명령이 이 키를 자동으로 사용합니다.

### Known Hosts

```yaml
- run: ssh-keyscan -p ${{ secrets.RASPI_SSH_PORT }} -H ${{ secrets.RASPI_HOST }} >> ~/.ssh/known_hosts
```

SSH 접속 시 "Are you sure you want to continue connecting?" 프롬프트를 방지합니다. `ssh-keyscan`이 라즈베리파이의 공개키를 가져와 등록합니다. `-p 10020`으로 비표준 포트를 지정합니다.

### 배포 스크립트

```bash
# Heredoc: 여러 줄의 명령을 SSH로 원격 실행 (-p로 포트 지정)
ssh -p 10020 student@host << 'ENDSSH'
  명령1
  명령2
ENDSSH
```

| 명령 | 설명 |
|------|------|
| `set -e` | 어떤 명령이든 실패하면 즉시 중단 |
| `docker login ghcr.io` | GHCR에서 이미지를 받기 위한 인증 |
| `docker compose pull app` | 최신 이미지 다운로드 (다른 서비스는 건드리지 않음) |
| `docker compose up -d app` | 앱 컨테이너만 새 이미지로 재시작 |
| health check 루프 | 5초 간격으로 12번 (최대 60초) `/health` 확인 |

### Health Check 로직

```bash
for i in $(seq 1 12); do
  if curl -sf http://localhost:3000/health > /dev/null 2>&1; then
    echo "Health check 통과!"
    exit 0    # 성공 → Job 성공
  fi
  sleep 5
done
exit 1        # 12번 모두 실패 → Job 실패
```

- `-s`: curl 진행 표시 숨김
- `-f`: HTTP 에러(4xx, 5xx) 시 실패 반환
- 실패 시 컨테이너 로그를 출력하여 원인 파악 가능

### 이미지 정리

```bash
docker image prune -af --filter "until=72h"
```

72시간(3일) 이상 된 미사용 이미지를 삭제합니다. 라즈베리파이는 저장 공간이 제한적이므로 정기적 정리가 중요합니다.

---

## 롤백 방법

배포 후 문제가 발생하면 이전 버전으로 롤백할 수 있습니다.

### 1. 이전 이미지 태그 확인

GitHub Actions → CI 워크플로우 → 이전 성공한 실행에서 커밋 SHA 확인
또는 라즈베리파이에서:

```bash
docker images ghcr.io/*/prepair-backend*
```

### 2. 특정 버전으로 롤백

```bash
ssh -p 10020 -i ~/.ssh/wisoft/wisoft-auth student@RASPI_HOST

cd /opt/prepair-backend

# docker-compose.prod.yaml에서 이미지 태그를 특정 SHA로 변경
# image: ghcr.io/username/prepair-backend:abc1234
# 또는 직접 pull & run:
docker pull ghcr.io/username/prepair-backend:abc1234
docker compose -f docker/docker-compose.prod.yaml --env-file .env up -d app
```

### 3. 롤백 확인

```bash
curl http://localhost:3000/health
docker compose -f docker/docker-compose.prod.yaml logs --tail=20 app
```

---

## 배포 모니터링

### GitHub Actions UI

1. 저장소 → **Actions** 탭
2. **CD** 워크플로우 선택
3. 각 실행의 성공/실패 확인
4. 실패 시 "Deploy to Raspberry Pi" 스텝의 로그에서 원인 확인

### 라즈베리파이에서 직접 확인

```bash
# 컨테이너 상태
docker ps

# 앱 로그 (실시간)
docker logs -f prepair-app

# 리소스 사용량
docker stats
```

---

## Tailscale 사용 시 CD 워크플로우 수정

포트 포워딩 대신 Tailscale VPN을 사용한다면:

```yaml
steps:
  - name: Tailscale 설정
    uses: tailscale/github-action@v2
    with:
      oauth-client-id: ${{ secrets.TS_OAUTH_CLIENT_ID }}
      oauth-secret: ${{ secrets.TS_OAUTH_SECRET }}
      tags: tag:ci

  # 이후 SSH 단계는 동일 (RASPI_HOST에 Tailscale IP 사용)
```

필요한 추가 Secrets:
- `TS_OAUTH_CLIENT_ID`: Tailscale OAuth 클라이언트 ID
- `TS_OAUTH_SECRET`: Tailscale OAuth 시크릿

---

## 트러블슈팅

### `ssh: connect to host ... port 10020: Connection timed out`

- 라즈베리파이가 외부에서 접근 가능한지 확인
- SSH 포트가 `10020`인지 확인 (`RASPI_SSH_PORT` Secret)
- 포트 포워딩 설정 확인 (공유기)
- 방화벽에서 SSH(10020번 포트) 허용 여부 확인
- 수동 테스트: `ssh -p 10020 -i ~/.ssh/wisoft/wisoft-auth student@HOST`

### `Permission denied (publickey)`

- `RASPI_SSH_PRIVATE_KEY` Secret 값이 개인키 전체인지 확인
- 라즈베리파이의 `~/.ssh/authorized_keys`에 공개키가 있는지 확인
- 키 파일 권한: `chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys`

### `docker: command not found`

- 라즈베리파이에 Docker가 설치되어 있는지 확인
- SSH 사용자가 docker 그룹에 속해 있는지 확인: `groups $USER`

### Health check 실패

- 앱 컨테이너 로그 확인: `docker logs prepair-app`
- DB 연결 확인: `docker ps` (prepair-db가 healthy인지)
- 환경 변수 확인: `.env` 파일의 모든 필수 값 존재 여부
- 포트 충돌: `sudo lsof -i :3000`

### GHCR 로그인 실패

`GITHUB_TOKEN`은 같은 저장소의 패키지에만 접근 가능합니다.
라즈베리파이에서 수동 로그인 시에는 Personal Access Token(PAT)이 필요합니다:
1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. `read:packages` 권한으로 생성
3. `echo "토큰" | docker login ghcr.io -u 사용자명 --password-stdin`

---

## 다음 단계

→ [05-raspberry-pi-setup.md](./05-raspberry-pi-setup.md) — 라즈베리파이 초기 세팅
