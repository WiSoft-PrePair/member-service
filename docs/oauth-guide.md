# OAuth 2.0 Complete Guide

## 목차

1. [OAuth란 무엇인가](#1-oauth란-무엇인가)
2. [카카오 로그인 전체 흐름](#2-카카오-로그인-전체-흐름)
3. [Redirect URI(콜백 URL) 이해](#3-redirect-uri콜백-url-이해)
4. [FE/BE 역할 분리 및 구현 상세](#4-febe-역할-분리-및-구현-상세)
5. [PrePair 프로젝트 OAuth 구현](#5-prepair-프로젝트-oauth-구현)

---

## 1. OAuth란 무엇인가

### 1.1 OAuth 2.0 정의

**OAuth 2.0**은 제3자 애플리케이션이 사용자의 리소스에 접근할 수 있도록 **권한을 위임**하는 표준 프로토콜입니다.

**핵심 개념**: 사용자가 비밀번호를 공유하지 않고도, 카카오/구글 등에 저장된 자신의 정보(이메일, 프로필)를 다른 서비스에 제공할 수 있게 해줍니다.

```
기존 방식 (위험)
┌─────────┐   ID/PW 직접 전달   ┌──────────┐
│  사용자  │ ───────────────────>│ 제3자 앱  │
└─────────┘                     └──────────┘
                                     │
                                     │ 사용자 ID/PW로 카카오 접속
                                     ▼
                               ┌──────────┐
                               │   카카오  │
                               └──────────┘

OAuth 2.0 방식 (안전)
┌─────────┐   1. 카카오 로그인    ┌──────────┐
│  사용자  │ <─────────────────── │ 제3자 앱  │
└─────────┘                      └──────────┘
     │                                 ▲
     │ 2. 카카오에서 직접 로그인        │ 4. Access Token으로
     │    + 동의                       │    사용자 정보 요청
     ▼                                 │
┌──────────┐   3. 인가 코드 발급  ─────┘
│   카카오  │ ──────────────────────────>
└──────────┘
```

### 1.2 주요 용어

| 용어 | 설명 | 예시 |
|------|------|------|
| **Resource Owner** | 리소스 소유자 (사용자) | 카카오 계정을 가진 사용자 |
| **Client** | 리소스 접근을 요청하는 앱 | PrePair 서비스 |
| **Authorization Server** | 인증/권한 부여 서버 | `kauth.kakao.com` |
| **Resource Server** | 리소스 제공 서버 | `kapi.kakao.com` |
| **Authorization Code** | 임시 인가 코드 | 토큰 교환용 일회성 코드 |
| **Access Token** | 리소스 접근 토큰 | API 호출에 사용 (12시간) |
| **Refresh Token** | 토큰 갱신용 토큰 | Access Token 재발급용 (60일) |

### 1.3 OAuth 2.0 Grant Types

**Authorization Code Grant** (가장 안전, 카카오 로그인에서 사용)

```
사용자 → 카카오 로그인 → 인가 코드 발급 → 백엔드에서 토큰 교환
```

다른 Grant Types:
- **Implicit Grant**: 더 이상 권장되지 않음 (보안 취약)
- **Client Credentials**: 서버 간 통신용 (사용자 없음)
- **Resource Owner Password**: 직접 ID/PW 전달 (비권장)

### 1.4 왜 OAuth를 사용하는가?

| 장점 | 설명 |
|------|------|
| **보안** | 사용자 비밀번호를 제3자 앱에 노출하지 않음 |
| **편의성** | 별도 회원가입 없이 기존 계정으로 로그인 |
| **신뢰** | 카카오/구글 등 신뢰할 수 있는 제공자의 인증 활용 |
| **권한 제어** | 사용자가 제공할 정보를 직접 선택 (동의항목) |

---

## 2. 카카오 로그인 전체 흐름

### 2.1 시퀀스 다이어그램

```
┌─────────┐     ┌──────────┐     ┌──────────┐     ┌─────────────┐     ┌─────────────┐
│  사용자  │     │ Frontend │     │ Backend  │     │ 카카오 인증  │     │ 카카오 API  │
└────┬────┘     └────┬─────┘     └────┬─────┘     └──────┬──────┘     └──────┬──────┘
     │               │                │                  │                   │
     │ ① 카카오 로그인 │                │                  │                   │
     │    버튼 클릭   │                │                  │                   │
     │──────────────>│                │                  │                   │
     │               │                │                  │                   │
     │               │ ② 카카오 인가  │                  │                   │
     │               │   URL로 리다이렉트                 │                   │
     │<──────────────│                │                  │                   │
     │               │                │                  │                   │
     │ ③ 카카오 로그인 페이지          │                  │                   │
     │─────────────────────────────────────────────────>│                   │
     │               │                │                  │                   │
     │ ④ 로그인 + 동의│                │                  │                   │
     │─────────────────────────────────────────────────>│                   │
     │               │                │                  │                   │
     │               │ ⑤ 인가 코드와 함께                 │                   │
     │               │   redirect_uri로 리다이렉트        │                   │
     │<──────────────────────────────────────────────────│                   │
     │               │                │                  │                   │
     │               │ ⑥ 인가 코드 전달│                  │                   │
     │               │───────────────>│                  │                   │
     │               │                │                  │                   │
     │               │                │ ⑦ 인가 코드로    │                   │
     │               │                │   Access Token   │                   │
     │               │                │   요청           │                   │
     │               │                │─────────────────>│                   │
     │               │                │                  │                   │
     │               │                │ ⑧ Access Token   │                   │
     │               │                │<─────────────────│                   │
     │               │                │                  │                   │
     │               │                │ ⑨ Access Token으로│                   │
     │               │                │   사용자 정보 요청│                   │
     │               │                │──────────────────────────────────────>│
     │               │                │                  │                   │
     │               │                │ ⑩ 사용자 정보    │                   │
     │               │                │<──────────────────────────────────────│
     │               │                │                  │                   │
     │               │                │ ⑪ 회원 조회/생성 │                   │
     │               │                │   + 서비스 JWT   │                   │
     │               │                │   토큰 발급      │                   │
     │               │                │                  │                   │
     │               │ ⑫ JWT 토큰 응답│                  │                   │
     │               │<───────────────│                  │                   │
     │               │                │                  │                   │
     │ ⑬ 로그인 완료  │                │                  │                   │
     │<──────────────│                │                  │                   │
```

### 2.2 단계별 상세 설명

| 단계 | 주체 | 설명 |
|------|------|------|
| ①② | FE | 사용자가 "카카오로 로그인" 버튼 클릭 → 카카오 인가 URL로 리다이렉트 |
| ③④ | 사용자 | 카카오 로그인 페이지에서 계정 로그인 + 정보 제공 동의 |
| ⑤ | 카카오 | 동의 완료 후, **인가 코드(code)**를 포함하여 redirect_uri로 리다이렉트 |
| ⑥ | FE | 콜백 URL에서 인가 코드 추출 → 백엔드로 전달 |
| ⑦⑧ | BE | 인가 코드를 카카오에 전송 → **Access Token**으로 교환 |
| ⑨⑩ | BE | Access Token으로 카카오 API에서 사용자 정보 조회 |
| ⑪ | BE | 회원 조회/생성, **서비스 자체 JWT 토큰** 발급 |
| ⑫⑬ | FE | JWT 토큰 저장 → 로그인 완료 |

### 2.3 핵심 포인트

```
카카오 Access Token ≠ 우리 서비스 JWT 토큰

카카오 Access Token: 카카오 API 호출용 (12시간 유효)
서비스 JWT 토큰: 우리 서비스 인증용 (자체 관리)
```

**왜 두 개의 토큰이 필요한가?**
- 카카오 토큰은 카카오 API 호출에만 사용 (사용자 정보 조회)
- 서비스 JWT 토큰은 우리 서비스 API 인증에 사용
- 관심사 분리: OAuth 인증과 서비스 인증은 별개

---

## 3. Redirect URI(콜백 URL) 이해

### 3.1 Redirect URI란?

**Redirect URI(콜백 URL)**는 OAuth 인증 과정에서 카카오가 **인가 코드를 전달할 목적지 주소**입니다.

```
https://kauth.kakao.com/oauth/authorize
  ?client_id=REST_API_KEY
  ?redirect_uri=https://myapp.com/auth/kakao/callback  ← 여기!
  ?response_type=code
```

### 3.2 Redirect URI 동작 원리

```
[Step 1] 사용자가 카카오 로그인 클릭
         ↓
         Frontend가 브라우저를 카카오 인가 URL로 이동시킴
         (이때 redirect_uri 포함)

[Step 2] 사용자가 카카오에서 로그인 + 동의
         ↓

[Step 3] 카카오가 브라우저를 redirect_uri로 리다이렉트 (HTTP 302)
         ↓
         Location: https://myapp.com/auth/kakao/callback?code=인가코드&state=상태값

[Step 4] 브라우저가 redirect_uri 페이지 로드
         ↓
         Frontend가 URL에서 code 파라미터 추출

[Step 5] Frontend가 code를 Backend로 전송
         ↓
         POST /api/auth/kakao/callback { code: "인가코드" }
```

### 3.3 Redirect URI 보안

**왜 사전 등록이 필요한가?**

```
공격 시나리오 (Redirect URI 검증이 없다면):

1. 악의적 사용자가 redirect_uri를 자신의 서버로 변경
   ?redirect_uri=https://evil.com/steal

2. 피해자가 로그인하면 인가 코드가 evil.com으로 전송됨

3. 공격자가 인가 코드 탈취 → 피해자 계정 접근

방어:
- 카카오는 사전 등록된 redirect_uri로만 인가 코드 전송
- 등록되지 않은 URL로 요청하면 에러 발생
```

### 3.4 환경별 Redirect URI 설정

| 환경 | Redirect URI | 카카오 콘솔 등록 |
|------|-------------|----------------|
| 로컬 개발 | `http://localhost:3000/auth/kakao/callback` | 필수 |
| 개발 서버 | `https://dev.myapp.com/auth/kakao/callback` | 필수 |
| 프로덕션 | `https://myapp.com/auth/kakao/callback` | 필수 |

**주의**: 모든 환경의 Redirect URI를 카카오 개발자 콘솔에 등록해야 합니다.

---

## 4. FE/BE 역할 분리 및 구현 상세

### 4.1 역할 분리 개요

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend 역할                               │
├─────────────────────────────────────────────────────────────────────┤
│ 1. 카카오 로그인 버튼 UI 제공                                        │
│ 2. 카카오 인가 URL 생성 및 리다이렉트                                │
│ 3. 콜백 페이지에서 인가 코드(code) 추출                              │
│ 4. 인가 코드를 Backend로 전송                                       │
│ 5. JWT 토큰 저장 및 관리                                            │
│ 6. state 파라미터 생성/검증 (CSRF 방지)                             │
│ 7. 로그인 상태 UI 업데이트                                          │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                         Backend 역할                                │
├─────────────────────────────────────────────────────────────────────┤
│ 1. 카카오 API 키 및 시크릿 안전 보관                                 │
│ 2. 인가 코드 → Access Token 교환 (카카오 API 호출)                  │
│ 3. Access Token으로 카카오 사용자 정보 조회                          │
│ 4. 회원 조회 또는 신규 가입 처리                                    │
│ 5. 서비스 자체 JWT 토큰 발급                                        │
│ 6. OAuth 연결 정보 관리 (OAuthConnection)                           │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Frontend 구현 상세

#### 4.2.1 카카오 로그인 버튼

```typescript
// components/KakaoLoginButton.tsx
const KakaoLoginButton = () => {
  const handleKakaoLogin = async () => {
    // 1. Backend에서 인가 URL 가져오기 (권장)
    const response = await fetch('/api/auth/kakao/url');
    const { url } = await response.json();

    // 2. state 생성 및 저장 (CSRF 방지)
    const state = crypto.randomUUID();
    sessionStorage.setItem('kakao_oauth_state', state);

    // 3. 카카오 로그인 페이지로 이동
    window.location.href = `${url}&state=${state}`;
  };

  return (
    <button onClick={handleKakaoLogin} className="kakao-login-btn">
      카카오로 로그인
    </button>
  );
};
```

#### 4.2.2 콜백 페이지 처리

```typescript
// pages/auth/kakao/callback.tsx
const KakaoCallbackPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const error = searchParams.get('error');

      // 1. 에러 체크
      if (error) {
        console.error('카카오 로그인 실패:', error);
        navigate('/login?error=kakao_auth_failed');
        return;
      }

      // 2. state 검증 (CSRF 방지)
      const savedState = sessionStorage.getItem('kakao_oauth_state');
      if (state !== savedState) {
        console.error('state 불일치 - CSRF 공격 의심');
        navigate('/login?error=invalid_state');
        return;
      }
      sessionStorage.removeItem('kakao_oauth_state');

      // 3. Backend로 인가 코드 전송
      try {
        const response = await fetch('/api/auth/kakao/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });

        const data = await response.json();

        // 4. 신규 회원인 경우 추가 정보 입력 페이지로
        if (data.isNewMember && data.registrationToken) {
          sessionStorage.setItem('oauth_registration_token', data.registrationToken);
          sessionStorage.setItem('oauth_prefilled_data', JSON.stringify(data.prefilledData));
          navigate('/auth/kakao/register');
          return;
        }

        // 5. 기존 회원인 경우 토큰 저장 후 메인으로
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);
        navigate('/');
      } catch (err) {
        navigate('/login?error=login_failed');
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  return <div>카카오 로그인 처리 중...</div>;
};
```

#### 4.2.3 신규 회원 추가 정보 입력

```typescript
// pages/auth/kakao/register.tsx
const KakaoRegisterPage = () => {
  const navigate = useNavigate();
  const [prefilledData, setPrefilledData] = useState<{email: string; nickname: string} | null>(null);

  useEffect(() => {
    const data = sessionStorage.getItem('oauth_prefilled_data');
    if (data) {
      setPrefilledData(JSON.parse(data));
    }
  }, []);

  const handleSubmit = async (formData: { job: string; notification: string; frequency: string }) => {
    const registrationToken = sessionStorage.getItem('oauth_registration_token');

    const response = await fetch('/api/auth/kakao/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        registrationToken,
        ...formData,
      }),
    });

    const data = await response.json();

    // 토큰 저장
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);

    // 세션 정리
    sessionStorage.removeItem('oauth_registration_token');
    sessionStorage.removeItem('oauth_prefilled_data');

    navigate('/');
  };

  return (
    <form onSubmit={handleSubmit}>
      <p>환영합니다, {prefilledData?.nickname}님!</p>
      <p>이메일: {prefilledData?.email}</p>

      {/* 추가 정보 입력 폼 */}
      <input name="job" placeholder="직업" required />
      <select name="notification">
        <option value="EMAIL">이메일</option>
        <option value="PUSH">푸시</option>
      </select>
      <select name="frequency">
        <option value="DAILY">매일</option>
        <option value="WEEKLY">매주</option>
      </select>

      <button type="submit">가입 완료</button>
    </form>
  );
};
```

### 4.3 Backend 구현 상세

#### 4.3.1 API 엔드포인트 설계

```
GET  /api/auth/kakao/url         → 카카오 인가 URL 반환
POST /api/auth/kakao/callback    → 인가 코드 처리 (로그인 or 등록 토큰 발급)
POST /api/auth/kakao/register    → 신규 회원 가입 완료
```

#### 4.3.2 Controller 구현

```typescript
// adapter/oauth/api/kakao-oauth.controller.ts
@Controller('api/auth/kakao')
export class KakaoOauthController {
  constructor(
    private readonly kakaoAuthService: KakaoAuthService,
    private readonly configService: ConfigService,
  ) {}

  // 카카오 인가 URL 반환
  @Public()
  @Get('url')
  getAuthorizationUrl(@Query('state') state?: string) {
    const clientId = this.configService.getOrThrow('KAKAO_CLIENT_ID');
    const redirectUri = this.configService.getOrThrow('KAKAO_REDIRECT_URI');

    const url = new URL('https://kauth.kakao.com/oauth/authorize');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');

    if (state) {
      url.searchParams.set('state', state);
    }

    return { url: url.toString() };
  }

  // 카카오 콜백 처리
  @Public()
  @Post('callback')
  async callback(@Body() dto: OauthCallbackDto) {
    return this.kakaoAuthService.handleCallback(dto.code);
  }

  // 신규 회원 가입 완료
  @Public()
  @Post('register')
  async register(@Body() dto: OauthCompleteRegisterDto) {
    return this.kakaoAuthService.completeRegistration(
      dto.registrationToken,
      dto.job,
      dto.notification,
      dto.frequency,
    );
  }
}
```

#### 4.3.3 카카오 API 호출 서비스

```typescript
// adapter/oauth/kakao/kakao-oauth.service.ts
@Injectable()
export class KakaoOauthService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  constructor(configService: ConfigService) {
    this.clientId = configService.getOrThrow('KAKAO_CLIENT_ID');
    this.clientSecret = configService.getOrThrow('KAKAO_CLIENT_SECRET');
    this.redirectUri = configService.getOrThrow('KAKAO_REDIRECT_URI');
  }

  // 인가 코드 → Access Token 교환
  async exchangeCodeForAccessToken(code: string): Promise<KakaoTokenResponse> {
    const tokenUrl = 'https://kauth.kakao.com/oauth/token';

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: this.redirectUri,
      code,
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
      body: params,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new UnauthorizedException(
        `카카오 토큰 교환 실패: ${error.error_description}`,
      );
    }

    return response.json();
  }

  // 사용자 정보 조회
  async getUserInfo(accessToken: string): Promise<KakaoUserInfo> {
    const response = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
    });

    if (!response.ok) {
      throw new UnauthorizedException('카카오 사용자 정보 조회 실패');
    }

    return response.json();
  }
}
```

### 4.4 보안 고려사항

| 항목 | 구현 위치 | 설명 |
|------|----------|------|
| **state 파라미터** | FE | CSRF 공격 방지 (랜덤값 생성 → 검증) |
| **Client Secret** | BE only | 절대 프론트엔드에 노출 금지 |
| **HTTPS** | 전체 | 프로덕션에서 필수 |
| **Redirect URI 검증** | 카카오 콘솔 | 사전 등록된 URL만 허용 |
| **토큰 저장** | FE | Access Token은 메모리/localStorage, Refresh Token은 httpOnly 쿠키 권장 |

---

## 5. PrePair 프로젝트 OAuth 구현

### 5.1 아키텍처 개요

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Domain Layer                                │
├─────────────────────────────────────────────────────────────────────┤
│ domain/oauth/                                                       │
│ ├── oauth.ts                  # OAuthConnection Aggregate          │
│ ├── oauth.repository.ts       # Repository 인터페이스 + Symbol     │
│ └── types/oauth.types.ts      # OAuthProvider, OAuthConnectionType │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                       Application Layer                             │
├─────────────────────────────────────────────────────────────────────┤
│ application/oauth/                                                  │
│ ├── kakao-auth.service.ts          # 카카오 로그인 비즈니스 로직    │
│ ├── oauth-registration-token.service.ts  # 등록 토큰 관리          │
│ ├── command/                                                        │
│ │   └── oauth-member-register.command.ts  # 신규 회원 등록 CQRS    │
│ └── types/                                                          │
│     └── registration-token.types.ts  # OAuthRegistrationPayload    │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        Adapter Layer                                │
├─────────────────────────────────────────────────────────────────────┤
│ adapter/oauth/                                                      │
│ ├── api/                                                            │
│ │   ├── kakao-oauth.controller.ts   # REST 엔드포인트              │
│ │   └── dto/                        # Request/Response DTOs        │
│ ├── kakao/                                                          │
│ │   ├── kakao-oauth.service.ts      # 카카오 API 호출              │
│ │   └── types/kakao-oauth.types.ts  # 카카오 API 응답 타입         │
│ ├── persistence/                                                    │
│ │   ├── entity/oauth.entity.ts      # MikroORM Entity              │
│ │   ├── mapper/oauth.mapper.ts      # Domain ↔ Entity 변환        │
│ │   └── oauth.repository-impl.ts    # Repository 구현              │
│ └── oauth.module.ts                 # DI 설정                       │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 OAuth 로그인 3가지 시나리오

#### Case 1: 기존 OAuth 회원 로그인

```
카카오 로그인 → OAuthConnection 조회 (있음) → 바로 JWT 발급
```

```typescript
// KakaoAuthService.handleCallback()
const existingConnection = await this.oauthConnectionRepository
  .findByProviderAndProviderId('kakao', kakaoId);

if (existingConnection) {
  return this.loginExistingMember(existingConnection.memberId);
  // { isNewMember: false, accessToken, refreshToken, memberId }
}
```

#### Case 2: 동일 이메일 기존 회원 + OAuth 연결

```
카카오 로그인 → OAuthConnection 없음 → 이메일로 Member 조회 (있음)
→ OAuthConnection 추가 → JWT 발급
```

```typescript
const existingMember = await this.memberRepository.findByEmail(email);

if (existingMember) {
  // 기존 회원에 카카오 연결
  const connection = OAuthConnection.connect({
    memberId: existingMember.id,
    provider: 'kakao',
    providerId: kakaoId,
    email,
  });
  this.oauthConnectionRepository.save(connection);

  return this.loginExistingMember(existingMember.id);
}
```

#### Case 3: 신규 회원 (2단계 가입)

```
[1단계] 카카오 로그인 → 신규 → 등록 토큰 발급 + 카카오 정보 반환
[2단계] 추가 정보 입력 → 회원 생성 + OAuthConnection 생성 → JWT 발급
```

```typescript
// [1단계] handleCallback() - 등록 토큰 발급
const registrationToken = this.registrationTokenService
  .generateRegistrationToken({
    email,
    nickname,
    provider: 'kakao',
    providerId: kakaoId,
  });

return {
  isNewMember: true,
  registrationToken,
  prefilledData: { email, nickname },
};

// [2단계] completeRegistration() - 실제 가입
const result = await this.commandBus.execute(
  new OAuthMemberRegisterCommand(
    oauthData.email,
    oauthData.nickname,
    oauthData.provider,
    oauthData.providerId,
    job,
    notification,
    frequency,
  ),
);

return {
  accessToken,
  refreshToken,
  memberId: result.memberId,
  isNewMember: true,
};
```

### 5.3 주요 컴포넌트 설명

#### OAuthConnection (Domain Aggregate)

```typescript
// domain/oauth/oauth.ts
export class OAuthConnection {
  readonly id: string;
  readonly memberId: string;
  readonly provider: OAuthProvider;  // 'kakao' | 'google' | 'naver'
  readonly providerId: string;       // 카카오 회원번호
  readonly email: string;
  readonly connectedAt: Date;

  // 팩토리 메서드
  static connect(request: ConnectOAuthRequest): OAuthConnection { ... }
  static of(data: OAuthConnectionType): OAuthConnection { ... }
}
```

#### Registration Token

OAuth 신규 회원의 2단계 가입을 위한 임시 토큰:

```typescript
// application/oauth/types/registration-token.types.ts
export interface OAuthRegistrationPayload {
  email: string;
  nickname: string;
  provider: OAuthProvider;
  providerId: string;
  type: 'oauth_registration';  // 토큰 타입 구분용
}
```

### 5.4 API 명세

#### GET /api/auth/kakao/url

카카오 인가 URL 반환

**Response:**
```json
{
  "url": "https://kauth.kakao.com/oauth/authorize?client_id=...&redirect_uri=...&response_type=code"
}
```

#### POST /api/auth/kakao/callback

인가 코드로 로그인 처리

**Request:**
```json
{
  "code": "authorization_code_from_kakao"
}
```

**Response (기존 회원):**
```json
{
  "isNewMember": false,
  "accessToken": "eyJhbGci...",
  "refreshToken": "refresh_token...",
  "accessTokenExpiresIn": 900,
  "memberId": "uuid"
}
```

**Response (신규 회원):**
```json
{
  "isNewMember": true,
  "registrationToken": "eyJhbGci...",
  "prefilledData": {
    "email": "user@kakao.com",
    "nickname": "홍길동"
  }
}
```

#### POST /api/auth/kakao/register

신규 회원 가입 완료

**Request:**
```json
{
  "registrationToken": "eyJhbGci...",
  "job": "개발자",
  "notification": "EMAIL",
  "frequency": "DAILY"
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGci...",
  "refreshToken": "refresh_token...",
  "accessTokenExpiresIn": 900,
  "memberId": "uuid",
  "isNewMember": true,
  "nickname": "홍길동"
}
```

### 5.5 환경 변수 설정

```env
# .env
KAKAO_CLIENT_ID=your_rest_api_key
KAKAO_CLIENT_SECRET=your_client_secret
KAKAO_REDIRECT_URI=http://localhost:3000/auth/kakao/callback
```

### 5.6 카카오 개발자 콘솔 설정 체크리스트

- [ ] 앱 생성 및 REST API 키 확보
- [ ] Client Secret 활성화
- [ ] 플랫폼 도메인 등록 (`http://localhost:3000`)
- [ ] Redirect URI 등록 (`http://localhost:3000/auth/kakao/callback`)
- [ ] 동의항목 설정
  - [ ] 닉네임: **필수 동의**
  - [ ] 카카오계정(이메일): **필수 동의**

### 5.7 Postman 테스트 순서

```
1. GET /api/auth/kakao/url
   → URL 복사 → 브라우저에서 열기

2. 브라우저에서 카카오 로그인 + 동의
   → 콜백 URL에서 ?code=xxx 복사

3. POST /api/auth/kakao/callback
   Body: { "code": "복사한_인가코드" }

   → 기존 회원: accessToken 수령
   → 신규 회원: registrationToken 수령

4. (신규 회원만) POST /api/auth/kakao/register
   Body: { "registrationToken": "...", "job": "...", ... }

   → accessToken 수령

5. Authorization: Bearer {accessToken}으로 보호된 API 테스트
```

---

## 부록: 자주 발생하는 문제

| 문제 | 원인 | 해결 |
|------|------|------|
| `invalid_grant` | 인가 코드 만료(10분) 또는 재사용 | 새 인가 코드 발급 |
| `redirect_uri_mismatch` | Redirect URI 불일치 | 카카오 콘솔과 요청 URI 비교 |
| `invalid_client` | Client ID/Secret 오류 | .env 값 확인 |
| 이메일 없음 | 동의항목 미설정 | "카카오계정(이메일)" 필수 동의 설정 |
| 닉네임 없음 | 동의항목 미설정 | "닉네임" 필수 동의 설정 |
