# 카카오 OAuth: 로컬 프론트 + prod 백엔드 환경 정상화 가이드

> 생성일: 2026-05-06
> 선행 문서(설계): `backend-ts/docs/kakao-oauth-dynamic-redirect-uri.md`
> 대상 시나리오: 로컬 프론트(`http://localhost:4173`) + 배포된 prod 백엔드(`https://prepair.wisoft.dev`)

## 0. 현재 상태 진단

선행 문서에는 "코드 변경 완료, prod 배포 대기"라고 적혀 있지만, **실제 백엔드 코드에는 화이트리스트 기반 dynamic redirect_uri 변경이 적용돼 있지 않다.** 다음 위치를 직접 확인한 결과:

| 위치 | 선행 문서 기준 기대값 | 실제 코드 | 비고 |
|---|---|---|---|
| `src/config/env.config.ts:21-23` | `KAKAO_ALLOWED_REDIRECT_URIS` 추가 | `KAKAO_REDIRECT_URI`만 존재 | 적용 안 됨 |
| `src/adapter/oauth/api/kakao-oauth.controller.ts` | `resolveRedirectUri` 헬퍼 + `redirectUri` query/body 처리 | env 직접 사용, 헬퍼 없음 | 적용 안 됨 |
| `src/adapter/oauth/kakao/kakao-oauth-provider.service.ts:18,33` | `defaultRedirectUri` + 인자 받는 `exchangeCodeForAccessToken` | `redirectUri` 멤버 1개, 인자 없음 | 적용 안 됨 |
| `src/application/oauth/ports/oauth-provider.port.ts:15` | `redirectUri?: string` 인자 추가 | 인자 없음 | 적용 안 됨 |
| `src/application/oauth/kaka-oauth.service.ts:58,237` | `handleCallback`/`linkToExistingMember`에 `redirectUri` 인자 | 인자 없음 | 적용 안 됨 |
| `src/adapter/oauth/api/dto/oauth-callback.dto.ts` | `redirectUri?: string` 필드 | `code`, `state`만 | 적용 안 됨 |
| `backend-ts/.env:52` | 화이트리스트 등록 | 등록됨 ✅ | (코드가 안 읽으므로 무의미) |
| `frontend/src/utils/kakaoRedirectUri.js` 등 | 인가/콜백에 `redirectUri` 전달 | 전달함 ✅ | (백엔드가 받지 않음) |

즉 **프론트는 `redirectUri`를 보내지만 백엔드가 그 값을 무시**해서, 카카오 인가 URL에는 항상 `KAKAO_REDIRECT_URI` env(prod URL)가 박힘. 이 상태에서 prod env에 화이트리스트만 추가해도 코드가 그 env를 읽지 않아 효과 없음.

본 가이드는 **백엔드 코드 변경부터 적용**해서 끝까지 작동시키는 절차다.

> 💡 카카오 OAuth의 `redirect_uri`는 **카카오 서버가 도달해야 하는 주소가 아니라 사용자 브라우저가 리다이렉트되는 주소**다. 그래서 `localhost`도 정상 동작한다. 프론트엔드 IP 주소를 카카오 콘솔에 등록할 필요는 **없다**.

## 1. 작업 개요

| Phase | 위치 | 목적 |
|---|---|---|
| A. 코드 변경 | backend-ts 소스 6개 파일 | 화이트리스트 기반 dynamic redirect_uri 로직 적용 |
| B. 로컬 검증 | backend-ts | 타입/린트/로컬 OAuth 흐름 sanity check |
| C. 커밋/머지/배포 | git, 배포 파이프라인 | prod 백엔드 새 코드 반영 |
| D. prod env 등록 | prod 서버 `.env` | 화이트리스트 활성화 |
| E. 카카오 콘솔 확인 | developers.kakao.com | localhost redirect URI 등록 확인 |
| F. 프론트 dev 설정 | `frontend/.env.local` | vite proxy를 prod 백엔드로 |
| G. End-to-End 검증 | 브라우저 + curl | 로컬 프론트 → prod 백엔드 OAuth 통과 |

각 Phase는 **검증 게이트**를 두고 다음으로 넘어간다. 게이트에서 막히면 그 Phase 안에서 원인을 해결해야 그 다음이 의미가 있다.

---

## Phase A. 백엔드 코드 변경

선행 문서 `kakao-oauth-dynamic-redirect-uri.md`의 Step 1~6을 다시 적용한다. 이 가이드에는 핵심 diff만 옮겨 둔다.

### A-1. `src/config/env.config.ts` — 화이트리스트 env 추가

기존 (line 21-23):
```typescript
KAKAO_CLIENT_ID: z.string(),
KAKAO_CLIENT_SECRET: z.string(),
KAKAO_REDIRECT_URI: z.string(),
```

변경:
```typescript
KAKAO_CLIENT_ID: z.string(),
KAKAO_CLIENT_SECRET: z.string(),
KAKAO_REDIRECT_URI: z.string(),
/**
 * 카카오 OAuth redirect_uri 화이트리스트 (콤마 구분).
 * 클라이언트가 redirectUri를 명시하면 이 목록과 정확히 일치할 때만 허용한다.
 * 미일치 또는 미지정 시 KAKAO_REDIRECT_URI를 fallback으로 사용한다.
 */
KAKAO_ALLOWED_REDIRECT_URIS: z.string().default(""),
```

### A-2. `src/application/oauth/ports/oauth-provider.port.ts` — 포트 시그니처 확장

기존:
```typescript
export interface OAuthProvider {
  exchangeCodeForAccessToken(code: string): Promise<OAuthTokenResponse>;
  // ...
}
```

변경:
```typescript
export interface OAuthProvider {
  /**
   * @param redirectUri 인가 단계에서 사용한 redirect_uri.
   *                    카카오는 토큰 교환 시 동일 값 검증을 강제한다.
   *                    생략 시 provider 기본 redirect_uri를 사용한다.
   */
  exchangeCodeForAccessToken(
    code: string,
    redirectUri?: string,
  ): Promise<OAuthTokenResponse>;
  // ...
}
```

### A-3. `src/adapter/oauth/kakao/kakao-oauth-provider.service.ts` — 인자 우선 사용

기존 (line 18, 23, 26-35):
```typescript
private readonly redirectUri: string;
// ...
this.redirectUri = configService.getOrThrow<string>("KAKAO_REDIRECT_URI");

async exchangeCodeForAccessToken(code: string): Promise<OAuthTokenResponse> {
  // ...
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: this.clientId,
    client_secret: this.clientSecret,
    redirect_uri: this.redirectUri,
    code,
  });
```

변경:
```typescript
private readonly defaultRedirectUri: string;
// ...
this.defaultRedirectUri =
  configService.getOrThrow<string>("KAKAO_REDIRECT_URI");

async exchangeCodeForAccessToken(
  code: string,
  redirectUri?: string,
): Promise<OAuthTokenResponse> {
  // ...
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: this.clientId,
    client_secret: this.clientSecret,
    redirect_uri: redirectUri ?? this.defaultRedirectUri,
    code,
  });
```

`||`가 아니라 `??` (nullish coalescing)을 쓰는 이유: 빈 문자열은 fallback이 아니라 명시적 오류로 다루기 위함. 카카오는 어차피 빈 redirect_uri를 거부함.

### A-4. `src/application/oauth/kaka-oauth.service.ts` — 서비스 시그니처 확장

`handleCallback`(line 58)와 `linkToExistingMember`(line 237)에 `redirectUri?: string` 인자를 추가하고 provider 호출에 전달한다.

기존:
```typescript
async handleCallback(code: string) {
  const tokens: OAuthTokenResponse =
    await this.oauthProvider.exchangeCodeForAccessToken(code);
  // ...
}

async linkToExistingMember(memberId: string, code: string) {
  const tokens: OAuthTokenResponse =
    await this.oauthProvider.exchangeCodeForAccessToken(code);
  // ...
}
```

변경:
```typescript
async handleCallback(code: string, redirectUri?: string) {
  const tokens: OAuthTokenResponse =
    await this.oauthProvider.exchangeCodeForAccessToken(code, redirectUri);
  // ...
}

async linkToExistingMember(
  memberId: string,
  code: string,
  redirectUri?: string,
) {
  const tokens: OAuthTokenResponse =
    await this.oauthProvider.exchangeCodeForAccessToken(code, redirectUri);
  // ...
}
```

### A-5. `src/adapter/oauth/api/dto/oauth-callback.dto.ts` — DTO 필드 추가

기존:
```typescript
import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class OauthCallbackDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsOptional()
  state?: string;
}
```

변경:
```typescript
import { IsNotEmpty, IsOptional, IsString, IsUrl } from "class-validator";

export class OauthCallbackDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsOptional()
  state?: string;

  /**
   * 인가 단계에서 사용한 redirect_uri.
   * 카카오는 토큰 교환 시 동일 값 검증을 강제하므로 클라이언트가 같이 전달해야 한다.
   * 컨트롤러에서 화이트리스트 검증 후 사용한다.
   */
  @IsUrl({ require_tld: false, require_protocol: true })
  @IsOptional()
  redirectUri?: string;
}
```

`require_tld: false`로 `localhost`처럼 TLD 없는 호스트 허용. `require_protocol: true`로 스킴 강제.

### A-6. `src/adapter/oauth/api/kakao-oauth.controller.ts` — 화이트리스트 헬퍼 + 동적 처리

전체 교체:

```typescript
import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Public } from "@/adapter/shared/api/decorators/public.decorator";
import {
  OauthCallbackDto,
  OauthCompleteRegisterDto,
} from "@/adapter/oauth/api/dto";
import { KakaOauthService } from "@/application/oauth/kaka-oauth.service";
import { CurrentUser } from "@/adapter/shared/api/decorators/current-user.decorator";
import type { User } from "@/adapter/shared/api/types/user";
import type { Env } from "@/config/env.config";

@Controller("api/auth/kakao")
export class KakaoOauthController {
  private readonly defaultRedirectUri: string;
  private readonly allowedRedirectUris: ReadonlySet<string>;

  constructor(
    private readonly kakaoAuthService: KakaOauthService,
    private readonly configService: ConfigService<Env, true>,
  ) {
    this.defaultRedirectUri = this.configService.getOrThrow("KAKAO_REDIRECT_URI");
    const allowedRaw: string =
      this.configService.get("KAKAO_ALLOWED_REDIRECT_URIS", { infer: true }) ??
      "";
    const parsed: string[] = allowedRaw
      .split(",")
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0);
    this.allowedRedirectUris = new Set<string>([
      this.defaultRedirectUri,
      ...parsed,
    ]);
  }

  /**
   * 클라이언트가 보낸 redirectUri를 화이트리스트로 검증해 반환한다.
   * 미일치/미지정 시 기본 redirect_uri로 fallback.
   *
   * 보안: redirectUri를 화이트리스트 없이 사용하면 OAuth open-redirect /
   * authorization code interception 취약점이 발생하므로 반드시 검증한다.
   */
  private resolveRedirectUri(candidate?: string): string {
    if (candidate && this.allowedRedirectUris.has(candidate)) {
      return candidate;
    }
    return this.defaultRedirectUri;
  }

  @Public()
  @Get("url")
  getAuthorizationUrl(
    @Query("state") state?: string,
    @Query("prompt") prompt?: string,
    @Query("redirectUri") redirectUriParam?: string,
  ) {
    const clientId: string = this.configService.getOrThrow("KAKAO_CLIENT_ID");
    const redirectUri: string = this.resolveRedirectUri(redirectUriParam);

    const url = new URL("https://kauth.kakao.com/oauth/authorize");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    if (state) url.searchParams.set("state", state);
    if (prompt) url.searchParams.set("prompt", prompt);

    return { url: url.toString(), redirectUri };
  }

  @Public()
  @Post("callback")
  async callback(@Body() dto: OauthCallbackDto) {
    const redirectUri: string = this.resolveRedirectUri(dto.redirectUri);
    return this.kakaoAuthService.handleCallback(dto.code, redirectUri);
  }

  @Public()
  @Post("register")
  async register(@Body() dto: OauthCompleteRegisterDto) {
    return this.kakaoAuthService.completeRegistration(
      dto.registrationToken,
      dto.job,
      dto.notification,
      dto.frequency,
    );
  }

  @Post("link")
  async link(@CurrentUser() user: User, @Body() dto: OauthCallbackDto) {
    const redirectUri: string = this.resolveRedirectUri(dto.redirectUri);
    return this.kakaoAuthService.linkToExistingMember(
      user.memberId,
      dto.code,
      redirectUri,
    );
  }
}
```

핵심 포인트:
- 생성자에서 한 번만 파싱해 `Set<string>`으로 보관 → 매 요청 O(1) 조회.
- `defaultRedirectUri`를 자동 포함 → 화이트리스트 env가 비어 있어도 기존 prod 동작 유지(하위 호환).
- 응답에 `redirectUri`를 같이 반환해 프론트가 콜백 단계에서 동일 값을 재사용할 수 있게 함.

> Phase A 검증 게이트: 위 6개 파일을 모두 수정 후, `grep -rn "KAKAO_ALLOWED_REDIRECT_URIS\|resolveRedirectUri\|allowedRedirectUris" src/` 가 비어있지 않아야 한다.

---

## Phase B. 로컬 검증

### B-1. 타입/린트 통과

```bash
cd /Users/dongmin/Developments/project/prepair/backend-ts
pnpm exec tsc --noEmit
pnpm exec biome check .
# 위반이 있으면: pnpm exec biome check . --write
```

### B-2. 로컬 백엔드 부팅

로컬 백엔드 `.env`에는 화이트리스트가 이미 등록돼 있으므로 그대로 사용.

```bash
docker compose -f docker/docker-compose.dev.yaml --env-file .env up -d  # Postgres
pnpm install
pnpm start:dev
# → http://localhost:7200
```

### B-3. 로컬 백엔드의 인가 URL 응답 검증 (Phase A의 작동 확인)

```bash
# (1) localhost 후보 — 화이트리스트 매치 → 그대로 반환
curl 'http://localhost:7200/api/auth/kakao/url?prompt=login&redirectUri=http%3A%2F%2Flocalhost%3A4173%2Fauth%2Fkakao%2Fcallback' | jq

# (2) 화이트리스트에 없는 origin — fallback으로 떨어져야 함
curl 'http://localhost:7200/api/auth/kakao/url?prompt=login&redirectUri=https%3A%2F%2Fattacker.com%2Fcallback' | jq
```

기대:
- (1) 응답 `redirectUri` = `"http://localhost:4173/auth/kakao/callback"`
- (2) 응답 `redirectUri` = `"http://localhost:4173/auth/kakao/callback"` (`KAKAO_REDIRECT_URI` 로컬 fallback)

> Phase B 검증 게이트: (1)과 (2)가 위 기대값과 일치해야 한다. 일치하지 않으면 Phase A의 어느 step이 누락된 것이므로 코드 diff를 다시 확인.

---

## Phase C. 커밋, 머지, prod 배포

```bash
# branch (예시)
git checkout -b feat/kakao-oauth-dynamic-redirect-uri

# 변경된 파일 추가 (코드 6개 + .env는 이미 반영됨)
git add src/config/env.config.ts \
        src/application/oauth/ports/oauth-provider.port.ts \
        src/adapter/oauth/kakao/kakao-oauth-provider.service.ts \
        src/application/oauth/kaka-oauth.service.ts \
        src/adapter/oauth/api/dto/oauth-callback.dto.ts \
        src/adapter/oauth/api/kakao-oauth.controller.ts \
        docs/kakao-oauth-dynamic-redirect-uri.md \
        docs/kakao-oauth-prod-localhost-setup.md

git commit -m "feat: 카카오 OAuth redirect_uri 화이트리스트 기반 동적 처리"
git push origin HEAD
```

PR을 머지한 뒤 prod 배포:

```bash
# prod 머신에서
docker compose -f docker/docker-compose.prod.yaml --env-file .env up -d --build
```

---

## Phase D. prod `.env`에 화이트리스트 등록

prod 서버의 `.env` 파일에 다음을 추가/확인.

```bash
# prod 서버의 .env (배포 머신)
KAKAO_CLIENT_ID=...
KAKAO_CLIENT_SECRET=...
KAKAO_REDIRECT_URI=https://prepair.wisoft.dev/auth/kakao/callback

# 클라이언트가 동적으로 redirectUri를 명시할 때 허용되는 화이트리스트 (콤마 구분).
# 카카오 개발자 콘솔의 Redirect URI 등록값과 정확히 일치해야 한다.
KAKAO_ALLOWED_REDIRECT_URIS=https://prepair.wisoft.dev/auth/kakao/callback,http://localhost:4173/auth/kakao/callback
```

체크 포인트:
- `KAKAO_REDIRECT_URI`(prod URL)는 그대로 둔다 — 화이트리스트가 비거나 매치 실패 시 fallback.
- 콤마 구분, 공백 없음. trailing slash, 포트, 스킴까지 카카오 콘솔과 1바이트도 다르면 안 됨.
- env 변경은 컨테이너 재시작이 필요. 보통은 Phase C의 재배포에서 같이 반영됨. 그렇지 않다면 다음 명령으로 재기동:

```bash
docker compose -f docker/docker-compose.prod.yaml --env-file .env up -d
```

> Phase D 검증 게이트:
> ```bash
> curl 'https://prepair.wisoft.dev/api/auth/kakao/url?prompt=login&redirectUri=http%3A%2F%2Flocalhost%3A4173%2Fauth%2Fkakao%2Fcallback' | jq
> ```
> 응답 `redirectUri`가 `"http://localhost:4173/auth/kakao/callback"`이어야 한다.
> `"https://prepair.wisoft.dev/auth/kakao/callback"`로 떨어지면: prod env 미반영 또는 prod에 새 코드가 안 올라간 것이므로 Phase C/D를 다시 점검.

---

## Phase E. 카카오 콘솔 등록 확인

[Kakao Developers](https://developers.kakao.com/) → 내 애플리케이션 → 카카오 로그인 → Redirect URI 에 두 값이 모두 등록되어 있는지 확인 (사용자가 이미 등록했다고 응답함):

```
https://prepair.wisoft.dev/auth/kakao/callback
http://localhost:4173/auth/kakao/callback
```

문자열 완전 일치 필수 (대소문자/포트/trailing slash 포함). 누락 시 인가 단계에서 `KOE006 invalid redirect_uri`.

---

## Phase F. 프론트 `.env.local` 설정

`frontend/.env.local`을 다음과 같이 변경.

```bash
# 로컬 백엔드 시나리오로 전환할 때만 주석을 해제하고 사용
# VITE_API_TARGET=http://localhost:7200

# 로컬 프론트 + prod 백엔드 (현재 시나리오)
VITE_API_TARGET=https://prepair.wisoft.dev
```

근거: `frontend/vite.config.js:6` — `VITE_API_TARGET`이 비어 있으면 fallback으로 prod가 사용되지만, 명시적으로 적어 두는 편이 시나리오 의도가 코드에 남아 다음 사람이 토글하기 쉽다.

vite는 `loadEnv`를 부팅 시점에만 읽으므로 dev server를 재기동:

```bash
cd /Users/dongmin/Developments/project/prepair/frontend
# 기존 vite dev 프로세스 종료 후
pnpm dev
# → http://localhost:4173
```

---

## Phase G. End-to-End 검증

1. 브라우저로 `http://localhost:4173` 접속.
2. 카카오 로그인 버튼 클릭. 페이지가 `https://kauth.kakao.com/oauth/authorize?...`로 이동.
3. **카카오 동의 화면 URL의 `redirect_uri` 쿼리 파라미터가 `http%3A%2F%2Flocalhost%3A4173%2Fauth%2Fkakao%2Fcallback`인지 주소창에서 확인.** prod로 박혀 있으면 Phase D 게이트로.
4. 동의 후 콜백이 `http://localhost:4173/auth/kakao/callback?code=...`로 떨어지는지 확인 (DevTools Network 탭).
5. `KakaoCallbackRedirect.jsx`가 `POST /api/auth/kakao/callback`을 호출 시 body에 `{ code, redirectUri: "http://localhost:4173/auth/kakao/callback" }`이 담겨 있고 200 응답을 받는지 확인.
6. 응답에 따라:
   - 신규 회원 → `/auth?mode=signup`으로 이동, 추가 정보 입력
   - 기존 회원 → `/mypage`로 이동

---

## 트러블슈팅

| 증상 | 원인 / 조치 |
|---|---|
| Phase B 게이트에서 응답에 `redirectUri` 필드 자체가 없음 | Phase A-6 컨트롤러 변경 누락. `getAuthorizationUrl`이 `{ url, redirectUri }`를 반환하는지 확인. |
| Phase B (1) 응답이 prod fallback | 컨트롤러 생성자에서 `KAKAO_ALLOWED_REDIRECT_URIS`를 안 읽거나 파싱 누락. 로컬 `.env:52` 값이 정상인지 확인. |
| Phase D 게이트에서 prod fallback이 떨어짐 | (a) prod에 새 코드가 안 올라감 (Phase C 재배포 확인), (b) prod `.env`에 `KAKAO_ALLOWED_REDIRECT_URIS` 미등록. |
| 동의 화면 URL의 `redirect_uri`가 prod | 위와 동일. 인가 URL은 백엔드가 생성하므로 prod 백엔드의 응답이 곧 이 값. Phase D 게이트로. |
| 인가 화면에서 `KOE006 invalid redirect_uri` | 카카오 콘솔에 localhost URI 미등록. Phase E. |
| 토큰 교환에서 `invalid_grant` | 인가/콜백 두 단계의 `redirect_uri` 불일치. 프론트 `getKakaoRedirectUri()`는 두 단계 모두 같은 값을 만들지만, DevTools에서 두 요청의 값이 실제 동일한지 비교. |
| `/api/auth/kakao/url` 호출이 `ECONNREFUSED` 또는 502 | 프론트 vite proxy 타겟 잘못 잡힘. Phase F의 `VITE_API_TARGET` 확인 후 dev server 재기동. |
| `.env.local` 바꿨는데 그대로 prod | vite는 부팅 시점에만 env 로드. dev server 재기동 필수. |

---

## 롤백

| 변경 | 롤백 방법 |
|---|---|
| Phase A 코드 변경 | `git revert <merge-commit>` 후 prod 재배포. 화이트리스트 누락 시 자동 fallback이라 트래픽은 안 끊김. |
| Phase D prod env | `KAKAO_ALLOWED_REDIRECT_URIS` 라인 삭제 + 컨테이너 재시작 → 기존 동작(prod URL 강제). |
| Phase F 프론트 env | `.env.local`의 `VITE_API_TARGET=http://localhost:7200`(또는 원래 값)으로 복구 + dev server 재기동. |

---

## 체크리스트

코드 작업자:
- [ ] Phase A-1 ~ A-6 코드 변경
- [ ] Phase B-1 타입/린트 통과
- [ ] Phase B-3 curl (1)(2) 모두 기대값
- [ ] 커밋 + PR + 머지

prod 운영자:
- [ ] Phase C 재배포
- [ ] Phase D prod `.env`에 `KAKAO_ALLOWED_REDIRECT_URIS` 추가
- [ ] Phase D 게이트 curl 통과 (응답 redirectUri = localhost)
- [ ] Phase E 카카오 콘솔 두 URI 등록 확인 (이미 됨)

로컬 작업자:
- [ ] Phase F `.env.local` `VITE_API_TARGET=https://prepair.wisoft.dev`
- [ ] dev server 재기동
- [ ] Phase G 브라우저 흐름 통과

---

## 운영상 리스크

- **prod DB에 로컬 테스트 회원이 섞일 수 있다.** 본 시나리오는 의도적으로 prod 백엔드를 쓰므로, 카카오 로그인으로 가입을 끝까지 진행하면 prod DB에 회원이 생성된다. UI/Flow 검증 목적엔 큰 문제는 아니지만, 본격 회원 모델/스키마 테스트는 **로컬 백엔드 + 로컬 DB 조합**(`docker-compose.dev.yaml`)을 권장.
- **운영 변수 변경의 가시성.** `KAKAO_ALLOWED_REDIRECT_URIS` 추가 사실이 팀에 공유되지 않으면 다음 사람이 같은 문제를 겪을 때 추적이 늦어진다. 본 문서가 일부 그 역할을 하지만, prod env가 secret manager로 관리된다면 거기에도 동일 항목 반영 필요.
- **카카오 콘솔과 백엔드 화이트리스트의 동기화.** 두 곳은 항상 같은 집합이어야 한다. 신규 환경(staging 등) 추가 시 콘솔 등록 → env 추가 → 재배포 순으로 진행.

---

## 관련 파일

수정 대상 (Phase A):
- `backend-ts/src/config/env.config.ts`
- `backend-ts/src/application/oauth/ports/oauth-provider.port.ts`
- `backend-ts/src/adapter/oauth/kakao/kakao-oauth-provider.service.ts`
- `backend-ts/src/application/oauth/kaka-oauth.service.ts`
- `backend-ts/src/adapter/oauth/api/dto/oauth-callback.dto.ts`
- `backend-ts/src/adapter/oauth/api/kakao-oauth.controller.ts`

수정 안 함 (참고):
- `backend-ts/.env:52` — 로컬 백엔드용 화이트리스트, 이미 정상값
- `frontend/src/utils/kakaoRedirectUri.js` — origin 기반 redirect_uri 헬퍼
- `frontend/src/pages/Auth.jsx` — 인가 단계 `redirectUri` 전달
- `frontend/src/pages/KakaoCallbackRedirect.jsx` — 콜백 단계 `redirectUri` 전달
- `frontend/vite.config.js` — `VITE_API_TARGET` 기반 `/api` proxy

선행 문서:
- `backend-ts/docs/kakao-oauth-dynamic-redirect-uri.md` — 설계 배경, 호출 관계, 단위/통합 테스트 포인트
- `frontend/docs/local-dev-api-proxy.md` — 프론트 dev proxy 시나리오
