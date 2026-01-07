# 카카오 OAuth 로그인 구현 가이드

## 목차

1. [OAuth 2.0 기본 개념](#1-oauth-20-기본-개념)
2. [카카오 로그인 전체 흐름](#2-카카오-로그인-전체-흐름)
3. [Redirect URI (콜백 URL) 이해하기](#3-redirect-uri-콜백-url-이해하기)
4. [FE/BE 역할 분리](#4-febe-역할-분리)
5. [카카오 개발자 앱 설정](#5-카카오-개발자-앱-설정)
6. [백엔드 구현 상세](#6-백엔드-구현-상세)
7. [프론트엔드 구현 상세](#7-프론트엔드-구현-상세)
8. [보안 고려사항](#8-보안-고려사항)
9. [에러 처리](#9-에러-처리)
10. [테스트 방법](#10-테스트-방법)

---

## 1. OAuth 2.0 기본 개념

### OAuth 2.0이란?

OAuth 2.0은 **제3자 애플리케이션이 사용자의 리소스에 접근할 수 있도록 권한을 위임하는 표준 프로토콜**입니다.

**쉽게 말해**: 사용자가 카카오에 저장된 자신의 정보(이메일, 프로필 등)를 우리 서비스에 공유하도록 허락하는 과정입니다.

### 핵심 용어

| 용어 | 설명 | 예시 |
|------|------|------|
| **Resource Owner** | 리소스 소유자 (사용자) | 카카오 계정을 가진 사용자 |
| **Client** | 리소스 접근을 요청하는 애플리케이션 | PrePair 서비스 |
| **Authorization Server** | 인증/권한 부여 서버 | 카카오 인증 서버 (kauth.kakao.com) |
| **Resource Server** | 리소스 제공 서버 | 카카오 API 서버 (kapi.kakao.com) |
| **Authorization Code** | 임시 인가 코드 | 토큰 교환용 일회성 코드 |
| **Access Token** | 리소스 접근 토큰 | API 호출에 사용하는 토큰 (12시간 유효) |
| **Refresh Token** | 토큰 갱신용 토큰 | Access Token 재발급용 (60일 유효) |

### OAuth 2.0 Grant Types

카카오 로그인은 **Authorization Code Grant** 방식을 사용합니다:

```
1. 사용자가 카카오 로그인 버튼 클릭
2. 카카오 로그인 페이지로 이동 (인가 코드 요청)
3. 사용자가 로그인 + 동의
4. 카카오가 인가 코드(Authorization Code)를 콜백 URL로 전달
5. 백엔드가 인가 코드로 Access Token 교환
6. Access Token으로 사용자 정보 조회
```

---

## 2. 카카오 로그인 전체 흐름

### 시퀀스 다이어그램

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
     │               │   콜백 URL로 리다이렉트            │                   │
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
     │               │                │   + Refresh Token│                   │
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
     │               │                │   + JWT 토큰 발급│                   │
     │               │                │                  │                   │
     │               │ ⑫ JWT 토큰 응답│                  │                   │
     │               │<───────────────│                  │                   │
     │               │                │                  │                   │
     │ ⑬ 로그인 완료  │                │                  │                   │
     │   (메인 페이지)│                │                  │                   │
     │<──────────────│                │                  │                   │
```

### 단계별 상세 설명

| 단계 | 주체 | 설명 |
|------|------|------|
| ①② | FE | 사용자가 카카오 로그인 버튼을 클릭하면, 카카오 인가 URL로 브라우저를 리다이렉트 |
| ③④ | 사용자 | 카카오 로그인 페이지에서 계정 로그인 및 정보 제공 동의 |
| ⑤ | 카카오 | 동의 완료 후, 인가 코드(code)를 포함하여 사전 등록된 콜백 URL로 리다이렉트 |
| ⑥ | FE | 콜백 URL에서 인가 코드를 추출하여 백엔드로 전달 |
| ⑦⑧ | BE | 인가 코드를 카카오에 전송하여 Access Token으로 교환 |
| ⑨⑩ | BE | Access Token으로 카카오 API 서버에서 사용자 정보 조회 |
| ⑪ | BE | 사용자 정보로 회원 조회 또는 신규 생성, 서비스 자체 JWT 토큰 발급 |
| ⑫⑬ | FE | JWT 토큰 저장 및 로그인 완료 처리 |

---

## 3. Redirect URI (콜백 URL) 이해하기

### Redirect URI란?

**Redirect URI(콜백 URL)** 는 OAuth 인증 과정에서 카카오가 인가 코드를 전달할 목적지 주소입니다.

```
https://kauth.kakao.com/oauth/authorize
  ?client_id=REST_API_KEY
  ?redirect_uri=https://myservice.com/auth/kakao/callback  ← 여기!
  ?response_type=code
```

### 왜 필요한가?

1. **보안**: 카카오는 사전 등록된 URL로만 인가 코드를 전송함
2. **공격 방지**: 악의적인 서비스가 임의의 URL로 인가 코드를 가로채는 것을 방지
3. **명확한 흐름**: 인증 완료 후 사용자가 돌아올 서비스 주소를 명시

### Redirect URI의 동작 방식

```
[1단계] Frontend가 사용자를 카카오 로그인 페이지로 보냄
        ↓
        https://kauth.kakao.com/oauth/authorize?...&redirect_uri=https://myapp.com/callback

[2단계] 사용자가 카카오에서 로그인 + 동의
        ↓

[3단계] 카카오가 사용자 브라우저를 redirect_uri로 보냄 (HTTP 302 Redirect)
        ↓
        Location: https://myapp.com/callback?code=인가코드&state=상태값

[4단계] Frontend의 /callback 페이지가 URL에서 code 파라미터를 추출
        ↓
        const code = new URLSearchParams(location.search).get('code');

[5단계] Frontend가 code를 Backend로 전송
        ↓
        POST /api/auth/kakao/callback { code: "인가코드" }
```

### Redirect URI 설정 위치

| 환경 | Redirect URI 예시 |
|------|-------------------|
| 로컬 개발 | `http://localhost:3000/auth/kakao/callback` |
| 스테이징 | `https://staging.myapp.com/auth/kakao/callback` |
| 프로덕션 | `https://myapp.com/auth/kakao/callback` |

**중요**: 카카오 개발자 콘솔에 모든 환경의 Redirect URI를 등록해야 합니다.

---

## 4. FE/BE 역할 분리

### 역할 분리 개요

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend 역할                               │
├─────────────────────────────────────────────────────────────────────┤
│ • 카카오 로그인 버튼 UI 제공                                         │
│ • 카카오 인가 URL로 리다이렉트                                       │
│ • 콜백 페이지에서 인가 코드(code) 추출                               │
│ • 인가 코드를 Backend로 전송                                        │
│ • JWT 토큰 저장 및 관리                                             │
│ • 로그인 상태 UI 업데이트                                           │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                         Backend 역할                                │
├─────────────────────────────────────────────────────────────────────┤
│ • 카카오 API 키 및 시크릿 안전 보관                                  │
│ • 인가 코드 → Access Token 교환                                     │
│ • Access Token으로 카카오 사용자 정보 조회                           │
│ • 회원 조회 또는 신규 가입 처리                                      │
│ • 서비스 자체 JWT 토큰 발급                                         │
│ • state 파라미터 검증 (CSRF 방지)                                   │
└─────────────────────────────────────────────────────────────────────┘
```

### Frontend 상세 역할

#### 1. 카카오 로그인 버튼

```typescript
// 카카오 인가 URL 생성
const KAKAO_CLIENT_ID = 'YOUR_REST_API_KEY';
const REDIRECT_URI = 'http://localhost:3000/auth/kakao/callback';
const STATE = crypto.randomUUID(); // CSRF 방지용

// 세션에 state 저장 (나중에 검증용)
sessionStorage.setItem('kakao_oauth_state', STATE);

const kakaoAuthUrl = `https://kauth.kakao.com/oauth/authorize?` +
  `client_id=${KAKAO_CLIENT_ID}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&state=${STATE}`;

// 버튼 클릭 시 리다이렉트
window.location.href = kakaoAuthUrl;
```

#### 2. 콜백 페이지 처리

```typescript
// /auth/kakao/callback 페이지
const urlParams = new URLSearchParams(window.location.search);
const code = urlParams.get('code');
const state = urlParams.get('state');
const error = urlParams.get('error');

// 에러 체크
if (error) {
  console.error('카카오 로그인 실패:', error);
  // 에러 페이지로 이동
  return;
}

// state 검증 (CSRF 방지)
const savedState = sessionStorage.getItem('kakao_oauth_state');
if (state !== savedState) {
  console.error('state 불일치 - CSRF 공격 의심');
  return;
}

// 백엔드로 인가 코드 전송
const response = await fetch('/api/auth/kakao/callback', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code, state }),
});

const { accessToken, refreshToken } = await response.json();

// 토큰 저장
localStorage.setItem('accessToken', accessToken);
// refreshToken은 httpOnly 쿠키로 받는 것이 더 안전

// 메인 페이지로 이동
window.location.href = '/';
```

#### 3. 카카오 로그인 버튼 컴포넌트 (React 예시)

```tsx
// KakaoLoginButton.tsx
const KakaoLoginButton = () => {
  const handleKakaoLogin = () => {
    const KAKAO_CLIENT_ID = process.env.NEXT_PUBLIC_KAKAO_CLIENT_ID;
    const REDIRECT_URI = `${window.location.origin}/auth/kakao/callback`;
    const state = crypto.randomUUID();

    sessionStorage.setItem('kakao_oauth_state', state);

    const authUrl = new URL('https://kauth.kakao.com/oauth/authorize');
    authUrl.searchParams.set('client_id', KAKAO_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('state', state);

    window.location.href = authUrl.toString();
  };

  return (
    <button onClick={handleKakaoLogin}>
      카카오로 로그인
    </button>
  );
};
```

### Backend 상세 역할

#### 1. API 엔드포인트 설계

```
POST /api/auth/kakao/callback
  - Request Body: { code: string, state: string }
  - Response: { accessToken, refreshToken, accessTokenExpiresIn, memberId }

GET /api/auth/kakao/url (선택적)
  - Response: { url: string } (카카오 인가 URL 반환)
```

#### 2. 핵심 처리 로직

```typescript
// KakaoOAuthService
async handleKakaoCallback(code: string, state: string) {
  // 1. 인가 코드로 Access Token 교환
  const kakaoTokens = await this.exchangeCodeForToken(code);

  // 2. Access Token으로 카카오 사용자 정보 조회
  const kakaoUser = await this.getKakaoUserInfo(kakaoTokens.access_token);

  // 3. 기존 회원 조회 (provider + providerId로)
  let member = await this.memberRepository.findByProviderId('kakao', kakaoUser.id);

  // 4. 신규 회원이면 가입 처리
  if (!member) {
    member = await this.createMemberFromKakao(kakaoUser);
  }

  // 5. 서비스 JWT 토큰 발급
  const accessToken = this.jwtService.generateAccessToken(member.id, member.email);
  const refreshToken = await this.refreshTokenService.create(member.id);

  return { accessToken, refreshToken, memberId: member.id };
}
```

#### 3. 카카오 API 호출

```typescript
// 인가 코드 → Access Token 교환
async exchangeCodeForToken(code: string): Promise<KakaoTokenResponse> {
  const tokenUrl = 'https://kauth.kakao.com/oauth/token';

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: this.configService.get('KAKAO_CLIENT_ID'),
    client_secret: this.configService.get('KAKAO_CLIENT_SECRET'),
    redirect_uri: this.configService.get('KAKAO_REDIRECT_URI'),
    code,
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: params,
  });

  return response.json();
}

// 사용자 정보 조회
async getKakaoUserInfo(accessToken: string): Promise<KakaoUserInfo> {
  const response = await fetch('https://kapi.kakao.com/v2/user/me', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
    },
  });

  return response.json();
}
```

---

## 5. 카카오 개발자 앱 설정

### Step 1: 카카오 개발자 등록

1. [Kakao Developers](https://developers.kakao.com/) 접속
2. 로그인 후 "내 애플리케이션" 클릭
3. "애플리케이션 추가하기" 클릭
4. 앱 이름, 사업자명 입력

### Step 2: 앱 키 확인

앱 생성 후 "앱 키" 메뉴에서 확인:

| 키 종류 | 용도 | 사용 위치 |
|---------|------|----------|
| **REST API 키** | OAuth 인증에 사용 | Frontend (client_id), Backend |
| **Admin 키** | 서버에서 관리 기능 사용 | Backend (절대 노출 금지) |
| **JavaScript 키** | 카카오 SDK 사용 시 | Frontend (필요시) |

### Step 3: 플랫폼 등록

"앱 설정" > "플랫폼" 메뉴:

**Web 플랫폼 등록:**
```
사이트 도메인:
- http://localhost:3000  (개발용)
- https://myapp.com      (프로덕션)
```

### Step 4: Redirect URI 등록

"카카오 로그인" > "Redirect URI" 메뉴:

```
http://localhost:3000/auth/kakao/callback       (개발용 FE)
http://localhost:5173/auth/kakao/callback       (Vite 개발용)
https://staging.myapp.com/auth/kakao/callback   (스테이징)
https://myapp.com/auth/kakao/callback           (프로덕션)
```

### Step 5: 동의항목 설정

"카카오 로그인" > "동의항목" 메뉴:

| 항목 | 동의 수준 | 필요 여부 | 설명 |
|------|----------|----------|------|
| **닉네임** | **필수 동의** | **필수** | Member 생성 시 nickname 필드에 사용 |
| 프로필 사진 | 선택 동의 | 선택 | 프로필 이미지가 필요한 경우 |
| **카카오계정(이메일)** | **필수 동의** | **필수** | 회원 식별 및 email 필드에 사용 |

**중요 설정**:
- **닉네임**: "필수 동의"로 설정 (Member.register에서 nickname 필수)
- **이메일**: "카카오계정으로 정보 수집 후 제공" 설정 필요

> PrePair 서비스는 회원가입 시 nickname이 필수이므로, 카카오 OAuth에서도 닉네임을 필수로 받아와야 합니다.

### Step 6: Client Secret 설정 (권장)

"보안" 메뉴에서 Client Secret 활성화:
1. "Client Secret 코드" 생성 클릭
2. 활성화 상태: "사용함" 설정
3. 발급된 시크릿을 Backend 환경변수에 저장

---

## 6. 백엔드 구현 상세 (DDD 설계 2: 별도 OAuthConnection Aggregate)

### 설계 원칙

**Member 도메인을 순수하게 유지**하면서 OAuth 연결 정보를 **별도 Aggregate**로 분리합니다.

```
┌─────────────────────────────────────┐
│  Member Aggregate (기존 유지)        │
├─────────────────────────────────────┤
│ - id, email, password               │
│ - nickname, job                     │
│ - notification, frequency           │
│ - point, isPro                      │
│                                     │
│ → OAuth와 완전히 독립적              │
│ → password는 항상 필수               │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  OAuthConnection Aggregate (신규)   │
├─────────────────────────────────────┤
│ - id                                │
│ - memberId (Member 참조)            │
│ - provider ('kakao' | 'google' | ..)│
│ - providerId (카카오 회원번호 등)    │
│ - email (OAuth 제공자의 이메일)      │
│ - connectedAt                       │
│                                     │
│ → 인증 수단 관리 전담                │
│ → 한 Member가 여러 OAuth 연결 가능   │
└─────────────────────────────────────┘
```

**장점:**
- Member 도메인 순수성 유지 (DDD 원칙 준수)
- 한 회원이 여러 소셜 계정 연결 가능 (카카오 + 구글)
- 추후 Identity Bounded Context 분리 용이
- 테스트 시 OAuth 고려 불필요

---

### 환경 변수 추가

```typescript
// src/config/env.config.ts (이미 추가됨)
export const envSchema = z.object({
  // ... 기존 설정

  // 카카오 OAuth
  KAKAO_CLIENT_ID: z.string(),
  KAKAO_CLIENT_SECRET: z.string(),
  KAKAO_REDIRECT_URI: z.string(),
});
```

```env
# .env
KAKAO_CLIENT_ID=your_rest_api_key
KAKAO_CLIENT_SECRET=your_client_secret
KAKAO_REDIRECT_URI=http://localhost:3000/auth/kakao/callback
```

---

### 6.1 Domain Layer: OAuthConnection Aggregate

#### 타입 정의

```typescript
// src/domain/oauth/types/oauth.types.ts

export type OAuthProvider = 'kakao' | 'google' | 'naver' | 'apple';

export type OAuthConnectionType = {
  id: string;
  memberId: string;
  provider: OAuthProvider;
  providerId: string;
  email: string;
  connectedAt: Date;
};

export type ConnectOAuthRequest = {
  memberId: string;
  provider: OAuthProvider;
  providerId: string;
  email: string;
};
```

#### OAuthConnection Aggregate

```typescript
// src/domain/oauth/oauth-connection.ts

import { randomUUID } from 'crypto';
import type {
  OAuthConnectionType,
  OAuthProvider,
  ConnectOAuthRequest,
} from './types/oauth.types';

export class OAuthConnection {
  readonly id: string;
  readonly memberId: string;
  readonly provider: OAuthProvider;
  readonly providerId: string;
  readonly email: string;
  readonly connectedAt: Date;

  private constructor(data: OAuthConnectionType) {
    this.id = data.id;
    this.memberId = data.memberId;
    this.provider = data.provider;
    this.providerId = data.providerId;
    this.email = data.email;
    this.connectedAt = data.connectedAt;
  }

  /**
   * 새로운 OAuth 연결 생성
   */
  public static connect(request: ConnectOAuthRequest): OAuthConnection {
    return new OAuthConnection({
      id: randomUUID(),
      memberId: request.memberId,
      provider: request.provider,
      providerId: request.providerId,
      email: request.email,
      connectedAt: new Date(),
    });
  }

  /**
   * DB에서 복원 (이미 검증된 데이터)
   */
  public static of(data: OAuthConnectionType): OAuthConnection {
    return new OAuthConnection(data);
  }

  /**
   * 특정 Provider인지 확인
   */
  public isProvider(provider: OAuthProvider): boolean {
    return this.provider === provider;
  }
}
```

#### Repository 인터페이스

```typescript
// src/domain/oauth/oauth-connection.repository.ts

import type { OAuthConnection } from './oauth-connection';
import type { OAuthProvider } from './types/oauth.types';

export interface OAuthConnectionRepository {
  /**
   * OAuth 연결 저장
   */
  save(connection: OAuthConnection): OAuthConnection;

  /**
   * Provider + ProviderId로 조회 (로그인 시 사용)
   */
  findByProviderAndProviderId(
    provider: OAuthProvider,
    providerId: string,
  ): Promise<OAuthConnection | null>;

  /**
   * Member의 모든 OAuth 연결 조회
   */
  findByMemberId(memberId: string): Promise<OAuthConnection[]>;

  /**
   * OAuth 연결 삭제 (연동 해제)
   */
  disconnect(id: string): Promise<void>;

  /**
   * Member의 모든 OAuth 연결 삭제 (회원 탈퇴 시)
   */
  disconnectAllByMemberId(memberId: string): Promise<void>;
}

export const OAUTH_CONNECTION_REPOSITORY = Symbol('OAuthConnectionRepository');
```

#### Domain Event

```typescript
// src/domain/oauth/events/oauth-connected.event.ts

import { createDomainEvent, type DomainEvent } from '@/domain/shared';
import type { OAuthProvider } from '../types/oauth.types';

export type OAuthConnectedPayload = {
  connectionId: string;
  memberId: string;
  provider: OAuthProvider;
  providerId: string;
  email: string;
};

export function createOAuthConnectedEvent(
  payload: OAuthConnectedPayload,
): DomainEvent<OAuthConnectedPayload> {
  return createDomainEvent(
    payload.connectionId,
    'OAuthConnected',
    payload,
  );
}
```

#### Index Export

```typescript
// src/domain/oauth/index.ts

export * from './oauth-connection';
export * from './oauth-connection.repository';
export * from './types/oauth.types';
export * from './events/oauth-connected.event';
```

---

### 6.2 Adapter Layer: Persistence

#### Entity

```typescript
// src/adapter/oauth/persistence/entity/oauth-connection.entity.ts

import { Entity, PrimaryKey, Property, Index } from '@mikro-orm/core';

@Entity({ tableName: 'oauth_connection' })
@Index({ properties: ['provider', 'providerId'], name: 'idx_oauth_provider_providerid' })
export class OAuthConnectionEntity {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Property({ type: 'uuid' })
  @Index()
  memberId!: string;

  @Property()
  provider!: string; // 'kakao' | 'google' | 'naver' | 'apple'

  @Property()
  providerId!: string; // 카카오 회원번호 등

  @Property()
  email!: string;

  @Property()
  connectedAt!: Date;
}
```

#### Mapper

```typescript
// src/adapter/oauth/persistence/mapper/oauth-connection.mapper.ts

import { Injectable } from '@nestjs/common';
import { OAuthConnection } from '@/domain/oauth';
import { OAuthConnectionEntity } from '../entity/oauth-connection.entity';
import type { OAuthProvider } from '@/domain/oauth';

@Injectable()
export class OAuthConnectionMapper {
  toDomain(entity: OAuthConnectionEntity): OAuthConnection {
    return OAuthConnection.of({
      id: entity.id,
      memberId: entity.memberId,
      provider: entity.provider as OAuthProvider,
      providerId: entity.providerId,
      email: entity.email,
      connectedAt: entity.connectedAt,
    });
  }

  toEntity(domain: OAuthConnection): OAuthConnectionEntity {
    const entity = new OAuthConnectionEntity();

    entity.id = domain.id;
    entity.memberId = domain.memberId;
    entity.provider = domain.provider;
    entity.providerId = domain.providerId;
    entity.email = domain.email;
    entity.connectedAt = domain.connectedAt;

    return entity;
  }
}
```

#### Repository Implementation

```typescript
// src/adapter/oauth/persistence/oauth-connection.repository-impl.ts

import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  OAuthConnection,
  type OAuthConnectionRepository,
  type OAuthProvider,
} from '@/domain/oauth';
import { OAuthConnectionEntity } from './entity/oauth-connection.entity';
import { OAuthConnectionMapper } from './mapper/oauth-connection.mapper';

@Injectable()
export class OAuthConnectionRepositoryImpl implements OAuthConnectionRepository {
  constructor(
    private readonly em: EntityManager,
    private readonly mapper: OAuthConnectionMapper,
  ) {}

  save(connection: OAuthConnection): OAuthConnection {
    const entity = this.mapper.toEntity(connection);
    this.em.persist(entity);
    return connection;
  }

  async findByProviderAndProviderId(
    provider: OAuthProvider,
    providerId: string,
  ): Promise<OAuthConnection | null> {
    const entity = await this.em.findOne(OAuthConnectionEntity, {
      provider,
      providerId,
    });

    if (!entity) {
      return null;
    }

    return this.mapper.toDomain(entity);
  }

  async findByMemberId(memberId: string): Promise<OAuthConnection[]> {
    const entities = await this.em.find(OAuthConnectionEntity, { memberId });
    return entities.map((e) => this.mapper.toDomain(e));
  }

  async disconnect(id: string): Promise<void> {
    await this.em.nativeDelete(OAuthConnectionEntity, { id });
  }

  async disconnectAllByMemberId(memberId: string): Promise<void> {
    await this.em.nativeDelete(OAuthConnectionEntity, { memberId });
  }
}
```

---

### 6.3 Adapter Layer: Kakao OAuth Service

#### 카카오 API 타입 정의

```typescript
// src/adapter/oauth/kakao/types/kakao-oauth.types.ts

export interface KakaoTokenResponse {
  token_type: 'bearer';
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_token_expires_in: number;
  scope?: string;
}

/**
 * 카카오 사용자 정보 응답 타입
 * @see https://developers.kakao.com/docs/latest/ko/kakaologin/rest-api#req-user-info
 */
export interface KakaoUserInfo {
  id: number; // 카카오 회원번호 (고유 식별자)
  connected_at: string;
  kakao_account?: {
    // 닉네임 관련 (필수 동의 항목으로 설정 필요)
    profile_nickname_needs_agreement?: boolean;
    profile?: {
      nickname?: string;              // 카카오 닉네임 → Member.nickname에 사용
      is_default_nickname?: boolean;  // 기본 닉네임 여부
      thumbnail_image_url?: string;
      profile_image_url?: string;
      is_default_image?: boolean;
    };
    // 이메일 관련 (필수 동의 항목으로 설정 필요)
    email_needs_agreement?: boolean;
    is_email_valid?: boolean;
    is_email_verified?: boolean;
    email?: string;                   // 카카오 이메일 → Member.email에 사용
  };
}

/**
 * 카카오 사용자 정보에서 추출한 회원 정보
 * - email: 필수 (없으면 BadRequestException)
 * - nickname: 필수 (없으면 BadRequestException)
 */
export interface KakaoUserProfile {
  kakaoId: string;
  email: string;
  nickname: string;
}
```

#### 카카오 OAuth 서비스

```typescript
// src/adapter/oauth/kakao/kakao-oauth.service.ts

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { KakaoTokenResponse, KakaoUserInfo } from './types/kakao-oauth.types';

@Injectable()
export class KakaoOAuthService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  constructor(private readonly configService: ConfigService) {
    this.clientId = this.configService.getOrThrow('KAKAO_CLIENT_ID');
    this.clientSecret = this.configService.getOrThrow('KAKAO_CLIENT_SECRET');
    this.redirectUri = this.configService.getOrThrow('KAKAO_REDIRECT_URI');
  }

  /**
   * 인가 코드를 Access Token으로 교환
   */
  async exchangeCodeForToken(code: string): Promise<KakaoTokenResponse> {
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
        `카카오 토큰 교환 실패: ${error.error_description || error.error}`,
      );
    }

    return response.json();
  }

  /**
   * Access Token으로 카카오 사용자 정보 조회
   */
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

  /**
   * 카카오 연결 해제 (회원 탈퇴 시)
   */
  async unlink(accessToken: string): Promise<void> {
    await fetch('https://kapi.kakao.com/v1/user/unlink', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }
}
```

---

### 6.4 Adapter Layer: Controller & DTO

#### DTO

```typescript
// src/adapter/oauth/api/dto/oauth-callback.dto.ts

import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class OAuthCallbackDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsOptional()
  state?: string;
}
```

```typescript
// src/adapter/oauth/api/dto/oauth-login-response.dto.ts

export class OAuthLoginResponseDto {
  accessToken!: string;
  refreshToken!: string;
  accessTokenExpiresIn!: number;
  memberId!: string;
  isNewMember!: boolean;
  nickname?: string; // 신규 회원일 경우 카카오 닉네임 (웰컴 메시지용)
}
```

#### 컨트롤러

```typescript
// src/adapter/oauth/api/kakao-oauth.controller.ts

import { Body, Controller, Post, Get, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '@/adapter/shared/api/decorators/public.decorator';
import { KakaoAuthService } from '@/application/oauth/kakao-auth.service';
import { OAuthCallbackDto, OAuthLoginResponseDto } from './dto';

@Controller('api/auth/kakao')
export class KakaoOAuthController {
  constructor(
    private readonly kakaoAuthService: KakaoAuthService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 카카오 인가 URL 반환
   * Postman 테스트 시: 이 URL을 브라우저에서 열어 인가 코드 획득
   */
  @Public()
  @Get('url')
  getAuthorizationUrl(@Query('state') state?: string): { url: string } {
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

  /**
   * 카카오 로그인 콜백 처리
   * - 신규 회원: Member 생성 + OAuthConnection 생성
   * - 기존 회원: OAuthConnection으로 Member 조회
   */
  @Public()
  @Post('callback')
  async callback(@Body() dto: OAuthCallbackDto): Promise<OAuthLoginResponseDto> {
    return this.kakaoAuthService.handleCallback(dto.code);
  }
}
```

---

### 6.5 Application Layer: KakaoAuthService

```typescript
// src/application/oauth/kakao-auth.service.ts

import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { KakaoOAuthService } from '@/adapter/oauth/kakao/kakao-oauth.service';
import type {
  KakaoUserInfo,
  KakaoUserProfile,
} from '@/adapter/oauth/kakao/types/kakao-oauth.types';
import { JwtService } from '@/adapter/auth/security';
import { RefreshTokenService } from '@/application/auth';
import {
  Member,
  MEMBER_REPOSITORY,
  PASSWORD_ENCODER,
  type MemberRepository,
  type PasswordEncoder,
} from '@/domain/member';
import {
  OAuthConnection,
  OAUTH_CONNECTION_REPOSITORY,
  type OAuthConnectionRepository,
} from '@/domain/oauth';
import {
  MEMBER_READ_REPOSITORY,
  type MemberReadRepository,
} from '@/adapter/member/persistence/read';

export interface OAuthLoginResult {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  memberId: string;
  isNewMember: boolean;
  nickname?: string; // 신규 회원일 경우 카카오 닉네임
}

@Injectable()
export class KakaoAuthService {
  constructor(
    private readonly kakaoOAuthService: KakaoOAuthService,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
    @Inject(MEMBER_REPOSITORY)
    private readonly memberRepository: MemberRepository,
    @Inject(OAUTH_CONNECTION_REPOSITORY)
    private readonly oauthConnectionRepository: OAuthConnectionRepository,
    @Inject(MEMBER_READ_REPOSITORY)
    private readonly memberReadRepository: MemberReadRepository,
    @Inject(PASSWORD_ENCODER)
    private readonly passwordEncoder: PasswordEncoder,
    private readonly em: EntityManager,
  ) {}

  /**
   * 카카오 로그인 콜백 처리
   */
  async handleCallback(code: string): Promise<OAuthLoginResult> {
    // 1. 인가 코드 → Access Token 교환
    const kakaoTokens = await this.kakaoOAuthService.exchangeCodeForToken(code);

    // 2. 카카오 사용자 정보 조회
    const kakaoUser = await this.kakaoOAuthService.getUserInfo(
      kakaoTokens.access_token,
    );

    // 3. OAuthConnection 조회 또는 Member + Connection 생성
    const { member, isNewMember, nickname } = await this.findOrCreateMember(kakaoUser);

    // 4. 활동 기록 업데이트
    await this.updateActivityLog(member.id);

    // 5. JWT 토큰 발급
    const accessToken = this.jwtService.generateAccessToken(
      member.id,
      member.email.value,
    );
    const refreshToken = await this.refreshTokenService.create(member.id);

    await this.em.flush();

    return {
      accessToken: accessToken.accessToken,
      refreshToken,
      accessTokenExpiresIn: accessToken.expiresIn,
      memberId: member.id,
      isNewMember,
      // 신규 회원일 경우 닉네임 포함 (웰컴 메시지용)
      ...(isNewMember && { nickname }),
    };
  }

  /**
   * 카카오 사용자로 Member 조회 또는 신규 생성
   */
  private async findOrCreateMember(
    kakaoUser: KakaoUserInfo,
  ): Promise<{ member: Member; isNewMember: boolean; nickname: string }> {
    // 카카오 사용자 정보 추출 및 검증 (email, nickname 필수)
    const { kakaoId, email, nickname } = this.extractKakaoUserProfile(kakaoUser);

    // 1. OAuthConnection으로 기존 회원 조회
    const existingConnection =
      await this.oauthConnectionRepository.findByProviderAndProviderId(
        'kakao',
        kakaoId,
      );

    if (existingConnection) {
      // 기존 연결 있음 → Member 조회
      const member = await this.memberRepository.findById(
        existingConnection.memberId,
      );

      if (!member) {
        // Connection은 있는데 Member가 없는 경우 (데이터 불일치)
        await this.oauthConnectionRepository.disconnect(existingConnection.id);
        throw new BadRequestException('회원 정보를 찾을 수 없습니다. 다시 로그인해주세요.');
      }

      return { member, isNewMember: false, nickname };
    }

    // 2. 이메일로 기존 Member 조회 (다른 방식으로 가입한 회원)
    const existingMember = await this.memberRepository.findByEmail(email);

    if (existingMember) {
      // 기존 Member에 카카오 연결 추가
      const connection = OAuthConnection.connect({
        memberId: existingMember.id,
        provider: 'kakao',
        providerId: kakaoId,
        email,
      });

      this.oauthConnectionRepository.save(connection);

      return { member: existingMember, isNewMember: false, nickname };
    }

    // 3. 신규 Member + OAuthConnection 생성 (카카오 닉네임 사용)
    const newMember = await this.createNewMember(email, nickname);

    const connection = OAuthConnection.connect({
      memberId: newMember.id,
      provider: 'kakao',
      providerId: kakaoId,
      email,
    });

    this.oauthConnectionRepository.save(connection);

    return { member: newMember, isNewMember: true, nickname };
  }

  /**
   * 카카오 사용자 정보에서 필수 필드 추출 및 검증
   * - email: 필수 (Member.email)
   * - nickname: 필수 (Member.nickname)
   */
  private extractKakaoUserProfile(kakaoUser: KakaoUserInfo): KakaoUserProfile {
    const kakaoId = String(kakaoUser.id);
    const email = kakaoUser.kakao_account?.email;
    const nickname = kakaoUser.kakao_account?.profile?.nickname;

    // 이메일 검증
    if (!email) {
      throw new BadRequestException(
        '이메일 정보가 필요합니다. 카카오 동의항목에서 "카카오계정(이메일)"을 필수 동의로 설정해주세요.',
      );
    }

    // 닉네임 검증
    if (!nickname) {
      throw new BadRequestException(
        '닉네임 정보가 필요합니다. 카카오 동의항목에서 "닉네임"을 필수 동의로 설정해주세요.',
      );
    }

    return { kakaoId, email, nickname };
  }

  /**
   * 신규 Member 생성 (OAuth 전용)
   * - 임시 비밀번호 생성 (사용자는 이후 비밀번호 설정 가능)
   */
  private async createNewMember(
    email: string,
    nickname: string,
  ): Promise<Member> {
    // OAuth 회원용 임시 비밀번호 생성 (랜덤 UUID)
    const tempPassword = crypto.randomUUID();

    const member = Member.register(
      {
        email,
        password: tempPassword,
        nickname,
        job: '미설정',
        notification: 'EMAIL',
        frequency: 'DAILY',
      },
      this.passwordEncoder,
    );

    this.memberRepository.register(member);

    return member;
  }

  /**
   * 활동 기록 업데이트
   */
  private async updateActivityLog(memberId: string): Promise<void> {
    const readEntity = await this.memberReadRepository.findById(memberId);

    if (readEntity) {
      const today = new Date().toISOString().slice(0, 10);
      readEntity.activity = readEntity.activity ?? [];

      if (!readEntity.activity.includes(today)) {
        readEntity.activity.push(today);
      }
    }
  }
}
```

---

### 6.6 Module 구성

#### OAuth Module

```typescript
// src/adapter/oauth/oauth.module.ts

import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { KakaoOAuthController } from './api/kakao-oauth.controller';
import { KakaoOAuthService } from './kakao/kakao-oauth.service';
import { OAuthConnectionEntity } from './persistence/entity/oauth-connection.entity';
import { OAuthConnectionMapper } from './persistence/mapper/oauth-connection.mapper';
import { OAuthConnectionRepositoryImpl } from './persistence/oauth-connection.repository-impl';
import { OAUTH_CONNECTION_REPOSITORY } from '@/domain/oauth';
import { KakaoAuthService } from '@/application/oauth/kakao-auth.service';
import { MemberModule } from '@/adapter/member/member.module';
import { AuthModule } from '@/adapter/auth/auth.module';

@Module({
  imports: [
    MikroOrmModule.forFeature([OAuthConnectionEntity]),
    MemberModule,
    AuthModule,
  ],
  controllers: [KakaoOAuthController],
  providers: [
    KakaoOAuthService,
    KakaoAuthService,
    OAuthConnectionMapper,
    {
      provide: OAUTH_CONNECTION_REPOSITORY,
      useClass: OAuthConnectionRepositoryImpl,
    },
  ],
  exports: [OAUTH_CONNECTION_REPOSITORY],
})
export class OAuthModule {}
```

#### App Module에 추가

```typescript
// src/app.module.ts

import { OAuthModule } from '@/adapter/oauth/oauth.module';

@Module({
  imports: [
    // ... 기존 imports
    OAuthModule, // 추가
  ],
})
export class AppModule {}
```

---

### 6.7 DB 마이그레이션

```sql
-- migrations/YYYYMMDDHHMMSS_create_oauth_connection.sql

CREATE TABLE oauth_connection (
  id UUID PRIMARY KEY,
  member_id UUID NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  provider VARCHAR(20) NOT NULL,
  provider_id VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  connected_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- 동일 Provider의 동일 계정은 중복 연결 불가
  CONSTRAINT uq_oauth_provider_providerid UNIQUE (provider, provider_id)
);

-- 인덱스
CREATE INDEX idx_oauth_member_id ON oauth_connection(member_id);
CREATE INDEX idx_oauth_provider_providerid ON oauth_connection(provider, provider_id);
```

---

### 6.8 폴더 구조 요약

```
src/
├── domain/
│   ├── member/           # 기존 유지 (변경 없음)
│   │   ├── member.ts
│   │   ├── member.repository.ts
│   │   └── ...
│   └── oauth/            # 신규
│       ├── oauth-connection.ts
│       ├── oauth-connection.repository.ts
│       ├── types/
│       │   └── oauth.types.ts
│       ├── events/
│       │   └── oauth-connected.event.ts
│       └── index.ts
│
├── application/
│   ├── auth/             # 기존 유지
│   │   └── ...
│   └── oauth/            # 신규
│       └── kakao-auth.service.ts
│
└── adapter/
    ├── auth/             # 기존 유지
    │   └── ...
    ├── member/           # 기존 유지 (변경 없음)
    │   └── ...
    └── oauth/            # 신규
        ├── api/
        │   ├── kakao-oauth.controller.ts
        │   └── dto/
        │       ├── oauth-callback.dto.ts
        │       └── oauth-login-response.dto.ts
        ├── kakao/
        │   ├── kakao-oauth.service.ts
        │   └── types/
        │       └── kakao-oauth.types.ts
        ├── persistence/
        │   ├── entity/
        │   │   └── oauth-connection.entity.ts
        │   ├── mapper/
        │   │   └── oauth-connection.mapper.ts
        │   └── oauth-connection.repository-impl.ts
        └── oauth.module.ts
```

---

## 7. 프론트엔드 구현 상세

### React + TypeScript 예시

#### 타입 정의

```typescript
// types/auth.ts

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  memberId: string;
  isNewMember?: boolean;
  nickname?: string; // 신규 회원일 경우 카카오 닉네임
}

export interface AuthError {
  error: string;
  error_description?: string;
}
```

#### 카카오 로그인 훅

```typescript
// hooks/useKakaoLogin.ts

import { useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const KAKAO_CLIENT_ID = import.meta.env.VITE_KAKAO_CLIENT_ID;

export function useKakaoLogin() {
  const navigate = useNavigate();

  const initiateLogin = useCallback(() => {
    const redirectUri = `${window.location.origin}/auth/kakao/callback`;
    const state = crypto.randomUUID();

    // CSRF 방지용 state 저장
    sessionStorage.setItem('kakao_oauth_state', state);

    const authUrl = new URL('https://kauth.kakao.com/oauth/authorize');
    authUrl.searchParams.set('client_id', KAKAO_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('state', state);

    window.location.href = authUrl.toString();
  }, []);

  return { initiateLogin };
}

export function useKakaoCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const error = searchParams.get('error');

      // 에러 처리
      if (error) {
        console.error('카카오 로그인 오류:', searchParams.get('error_description'));
        navigate('/login?error=kakao_auth_failed');
        return;
      }

      // state 검증
      const savedState = sessionStorage.getItem('kakao_oauth_state');
      if (state !== savedState) {
        console.error('state 불일치');
        navigate('/login?error=invalid_state');
        return;
      }

      // state 정리
      sessionStorage.removeItem('kakao_oauth_state');

      if (!code) {
        navigate('/login?error=no_code');
        return;
      }

      try {
        // 백엔드로 인가 코드 전송
        const response = await fetch('/api/auth/kakao/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, state }),
        });

        if (!response.ok) {
          throw new Error('로그인 처리 실패');
        }

        const data: LoginResponse = await response.json();

        // 토큰 저장
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);

        // 신규 회원이면 온보딩으로, 기존 회원이면 메인으로
        if (data.isNewMember) {
          // 닉네임을 온보딩에서 사용할 수 있도록 저장 (선택적)
          if (data.nickname) {
            sessionStorage.setItem('welcome_nickname', data.nickname);
          }
          navigate('/onboarding');
        } else {
          navigate('/');
        }
      } catch (err) {
        console.error('로그인 처리 오류:', err);
        navigate('/login?error=login_failed');
      }
    };

    handleCallback();
  }, [searchParams, navigate]);
}
```

#### 로그인 페이지 컴포넌트

```tsx
// pages/LoginPage.tsx

import { useKakaoLogin } from '../hooks/useKakaoLogin';

export function LoginPage() {
  const { initiateLogin } = useKakaoLogin();

  return (
    <div className="login-container">
      <h1>로그인</h1>

      {/* 기존 이메일 로그인 폼 */}
      <form>
        {/* ... */}
      </form>

      <div className="divider">또는</div>

      {/* 소셜 로그인 버튼 */}
      <button
        onClick={initiateLogin}
        className="kakao-login-btn"
        style={{
          backgroundColor: '#FEE500',
          color: '#000000',
          border: 'none',
          padding: '12px 24px',
          borderRadius: '8px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <KakaoIcon />
        카카오로 시작하기
      </button>
    </div>
  );
}

function KakaoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20">
      {/* 카카오 아이콘 SVG */}
    </svg>
  );
}
```

#### 콜백 페이지 컴포넌트

```tsx
// pages/KakaoCallbackPage.tsx

import { useKakaoCallback } from '../hooks/useKakaoLogin';

export function KakaoCallbackPage() {
  useKakaoCallback();

  return (
    <div className="callback-loading">
      <div className="spinner" />
      <p>카카오 로그인 처리 중...</p>
    </div>
  );
}
```

#### 라우터 설정

```tsx
// App.tsx 또는 router.tsx

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { KakaoCallbackPage } from './pages/KakaoCallbackPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/kakao/callback" element={<KakaoCallbackPage />} />
        {/* ... 기타 라우트 */}
      </Routes>
    </BrowserRouter>
  );
}
```

#### 환경 변수 설정

```env
# .env.local (Frontend)
VITE_KAKAO_CLIENT_ID=your_rest_api_key
VITE_API_BASE_URL=http://localhost:3000
```

---

## 8. 보안 고려사항

### 필수 보안 조치

| 항목 | 설명 | 구현 위치 |
|------|------|----------|
| **state 파라미터** | CSRF 공격 방지 | FE에서 생성, 검증 |
| **HTTPS 사용** | 토큰 탈취 방지 | 프로덕션 환경 필수 |
| **Client Secret 보호** | 서버에서만 사용 | BE 환경변수 |
| **Redirect URI 검증** | 피싱 방지 | 카카오 개발자 콘솔 |
| **토큰 안전 저장** | XSS 공격 방지 | FE 저장 방식 |

### state 파라미터 상세

```typescript
// state 생성 (FE)
const state = crypto.randomUUID();
sessionStorage.setItem('kakao_oauth_state', state);

// state 검증 (FE - 콜백에서)
const savedState = sessionStorage.getItem('kakao_oauth_state');
if (urlState !== savedState) {
  throw new Error('CSRF 공격 의심');
}
```

### 토큰 저장 권장 방식

| 토큰 종류 | 저장 위치 | 이유 |
|----------|----------|------|
| Access Token | 메모리 또는 localStorage | 짧은 만료 시간 (15분) |
| Refresh Token | httpOnly 쿠키 | XSS 공격으로부터 보호 |

```typescript
// 백엔드에서 httpOnly 쿠키로 Refresh Token 설정
@Post('callback')
async callback(
  @Body() dto: KakaoCallbackDto,
  @Res({ passthrough: true }) res: Response,
): Promise<Omit<KakaoLoginResult, 'refreshToken'>> {
  const result = await this.kakaoAuthService.handleCallback(dto.code);

  // Refresh Token을 httpOnly 쿠키로 설정
  res.cookie('refreshToken', result.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7일
  });

  // refreshToken은 응답 본문에서 제외
  const { refreshToken, ...rest } = result;
  return rest;
}
```

---

## 9. 에러 처리

### 카카오 OAuth 에러 코드

| 에러 코드 | 설명 | 처리 방법 |
|----------|------|----------|
| `access_denied` | 사용자가 동의 거부 | 로그인 페이지로 이동, 안내 메시지 |
| `invalid_request` | 잘못된 요청 파라미터 | 개발자 확인 필요 |
| `invalid_client` | 잘못된 client_id | 앱 키 확인 |
| `invalid_scope` | 잘못된 scope | 동의항목 설정 확인 |
| `server_error` | 카카오 서버 오류 | 재시도 안내 |

### 에러 처리 예시

```typescript
// Backend - 카카오 API 에러 처리
async exchangeCodeForToken(code: string): Promise<KakaoTokenResponse> {
  const response = await fetch(tokenUrl, { /* ... */ });

  if (!response.ok) {
    const error = await response.json();

    switch (error.error) {
      case 'invalid_grant':
        throw new UnauthorizedException('인가 코드가 만료되었거나 이미 사용되었습니다.');
      case 'invalid_client':
        throw new InternalServerErrorException('카카오 앱 설정을 확인해주세요.');
      default:
        throw new UnauthorizedException(`카카오 인증 오류: ${error.error_description}`);
    }
  }

  return response.json();
}
```

```typescript
// Frontend - 에러 처리
const handleCallback = async () => {
  const error = searchParams.get('error');

  if (error === 'access_denied') {
    // 사용자가 동의를 거부한 경우
    showToast('카카오 로그인이 취소되었습니다.');
    navigate('/login');
    return;
  }

  // ... 기타 처리
};
```

---

## 10. 테스트 방법

### Postman으로 FE 없이 테스트하기 (개발용)

FE가 없는 상태에서 백엔드 OAuth 구현을 테스트하는 방법입니다.

#### 전체 흐름 요약

```
[Step 1] 브라우저 → 카카오 인가 URL 직접 접속 → 로그인 → 인가 코드 복사
[Step 2] Postman → 백엔드 API 호출 (인가 코드 전달) → JWT 토큰 수령
[Step 3] Postman → JWT 토큰으로 보호된 API 테스트
```

> **핵심**: OAuth 인가 코드는 브라우저에서만 받을 수 있음 (카카오 로그인 UI 필요)

---

#### Step 0: 사전 설정

**1. 카카오 개발자 콘솔 설정**

| 항목 | 설정값 | 비고 |
|------|--------|------|
| Redirect URI | `http://localhost:3000/auth/kakao/callback` | |
| 플랫폼 도메인 | `http://localhost:3000` | |
| 동의항목 - 닉네임 | **필수 동의** | Member.nickname에 사용 |
| 동의항목 - 카카오계정(이메일) | **필수 동의** | Member.email에 사용 |

> **중요**: 닉네임과 이메일 모두 "필수 동의"로 설정해야 합니다. 설정하지 않으면 `BadRequestException`이 발생합니다.

> Redirect URI는 실제로 동작하는 FE가 없어도 됨. 카카오가 이 URL로 리다이렉트할 때 인가 코드를 URL에 포함시켜 주기 때문.

**2. 환경 변수 (.env)**

```env
KAKAO_CLIENT_ID=your_rest_api_key
KAKAO_CLIENT_SECRET=your_client_secret
KAKAO_REDIRECT_URI=http://localhost:3000/auth/kakao/callback
```

---

#### Step 1: 브라우저에서 인가 코드 받기

**1-1. 카카오 인가 URL 생성**

브라우저 주소창에 아래 URL을 직접 입력합니다 (한 줄로):

```
https://kauth.kakao.com/oauth/authorize?client_id=YOUR_REST_API_KEY&redirect_uri=http://localhost:3000/auth/kakao/callback&response_type=code
```

또는 백엔드 API를 활용:

```
GET http://localhost:3000/api/auth/kakao/url
```

응답:
```json
{
  "url": "https://kauth.kakao.com/oauth/authorize?client_id=xxx&redirect_uri=xxx&response_type=code"
}
```

**1-2. 카카오 로그인 수행**

1. 브라우저에서 위 URL 접속
2. 카카오 계정으로 로그인
3. 동의항목 체크 후 "동의하고 계속하기" 클릭

**1-3. 인가 코드 복사**

로그인 완료 후 브라우저가 리다이렉트됩니다:

```
http://localhost:3000/auth/kakao/callback?code=AUTHORIZATION_CODE_HERE
```

> 이 페이지는 404가 나와도 상관없음! URL에서 `code=` 뒤의 값만 복사하면 됨.

**예시 URL:**
```
http://localhost:3000/auth/kakao/callback?code=abc123xyz456...
```

복사할 값: `abc123xyz456...`

> **주의**: 인가 코드는 약 10분 내에 사용해야 하며, 한 번만 사용 가능

---

#### Step 2: Postman에서 토큰 교환

**Request:**
```
POST http://localhost:3000/api/auth/kakao/callback
Content-Type: application/json

{
  "code": "여기에_복사한_인가코드_붙여넣기"
}
```

**Postman 설정:**
- Method: `POST`
- URL: `http://localhost:3000/api/auth/kakao/callback`
- Headers: `Content-Type: application/json`
- Body (raw, JSON):
```json
{
  "code": "abc123xyz456..."
}
```

**Expected Response (신규 회원):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "refresh-token-uuid...",
  "accessTokenExpiresIn": 3600,
  "memberId": "uuid-member-id",
  "isNewMember": true,
  "nickname": "홍길동"
}
```

**Expected Response (기존 회원):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "refresh-token-uuid...",
  "accessTokenExpiresIn": 3600,
  "memberId": "uuid-member-id",
  "isNewMember": false
}
```

> **참고**: `isNewMember: true`일 경우에만 `nickname`이 응답에 포함됩니다.

---

#### Step 3: JWT 토큰으로 보호된 API 테스트

발급받은 `accessToken`으로 인증이 필요한 API를 테스트합니다.

**Request:**
```
GET http://localhost:3000/api/members/me
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Postman 설정:**
- Headers에 추가: `Authorization: Bearer {accessToken}`
- 또는 Authorization 탭 → Type: Bearer Token → Token 입력

---

#### Postman Environment 설정 (권장)

반복 테스트를 위해 Postman Environment를 활용합니다.

**Environment Variables:**
| Variable | Initial Value | Current Value |
|----------|---------------|---------------|
| `base_url` | `http://localhost:3000` | |
| `kakao_client_id` | `your_rest_api_key` | |
| `auth_code` | | (테스트마다 갱신) |
| `access_token` | | (자동 저장) |
| `refresh_token` | | (자동 저장) |
| `member_id` | | (자동 저장) |
| `nickname` | | (신규 회원일 경우 자동 저장) |

**Collection 구조:**
```
📁 PrePair OAuth
├── 📄 [GET] 카카오 인가 URL 조회
├── 📄 [POST] 카카오 콜백 (토큰 교환)
│   └── Tests 스크립트로 토큰 자동 저장
├── 📄 [GET] 내 정보 조회 (인증 테스트)
└── 📄 [POST] 토큰 갱신
```

**카카오 콜백 요청의 Tests 스크립트:**
```javascript
// Response에서 토큰 추출하여 Environment에 저장
if (pm.response.code === 200 || pm.response.code === 201) {
    const response = pm.response.json();

    pm.environment.set("access_token", response.accessToken);
    pm.environment.set("refresh_token", response.refreshToken);
    pm.environment.set("member_id", response.memberId);

    console.log("✅ 토큰 저장 완료");
    console.log("Member ID:", response.memberId);
    console.log("신규 회원:", response.isNewMember);

    // 신규 회원일 경우 닉네임 출력
    if (response.isNewMember && response.nickname) {
        console.log("카카오 닉네임:", response.nickname);
        pm.environment.set("nickname", response.nickname);
    }
}
```

---

#### 전체 테스트 시나리오

**시나리오 1: 신규 회원 카카오 로그인**
1. 브라우저에서 인가 코드 획득
2. `POST /api/auth/kakao/callback` 호출
3. 응답 확인:
   - `isNewMember: true`
   - `nickname`: 카카오 프로필 닉네임
4. DB 확인:
   - `member` 테이블: 새 회원 생성됨 (nickname = 카카오 닉네임)
   - `oauth_connection` 테이블: provider='kakao', member_id 연결됨

**시나리오 2: 기존 회원 재로그인**
1. 동일 카카오 계정으로 다시 인가 코드 획득
2. `POST /api/auth/kakao/callback` 호출
3. `isNewMember: false` 확인
4. 동일 memberId 반환 확인

**시나리오 3: 기존 로컬 회원 + 카카오 연동**
1. 로컬 회원 가입 (이메일: user@kakao.com)
2. 동일 이메일의 카카오 계정으로 로그인
3. `isNewMember: false` 확인 (기존 회원으로 인식)
4. DB 확인: 기존 member에 oauth_connection 추가됨

**시나리오 4: 인가 코드 오류**
1. 만료되거나 잘못된 코드로 요청
2. `401 Unauthorized` 확인
3. 에러 메시지 확인

**시나리오 5: 필수 동의항목 누락**
1. 카카오 콘솔에서 닉네임 또는 이메일이 필수 동의가 아닌 경우
2. `400 BadRequest` 확인
3. 에러 메시지: "닉네임 정보가 필요합니다" 또는 "이메일 정보가 필요합니다"

**시나리오 6: JWT 인증 테스트**
1. 발급받은 토큰으로 `GET /api/members/me` 호출
2. 본인 정보 정상 반환 확인

---

#### 카카오 API 직접 테스트 (디버깅용)

백엔드 구현 전에 카카오 API 자체를 먼저 테스트할 수 있습니다.

**토큰 교환 (카카오 직접 호출):**
```
POST https://kauth.kakao.com/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&client_id=YOUR_REST_API_KEY
&client_secret=YOUR_CLIENT_SECRET
&redirect_uri=http://localhost:3000/auth/kakao/callback
&code=인가코드
```

**Response:**
```json
{
  "token_type": "bearer",
  "access_token": "카카오_액세스_토큰",
  "expires_in": 43199,
  "refresh_token": "카카오_리프레시_토큰",
  "refresh_token_expires_in": 5183999
}
```

**사용자 정보 조회 (카카오 직접 호출):**
```
GET https://kapi.kakao.com/v2/user/me
Authorization: Bearer 카카오_액세스_토큰
```

**Response:**
```json
{
  "id": 1234567890,
  "connected_at": "2024-01-01T00:00:00Z",
  "kakao_account": {
    "profile_nickname_needs_agreement": false,
    "profile": {
      "nickname": "홍길동",
      "is_default_nickname": false
    },
    "email_needs_agreement": false,
    "is_email_valid": true,
    "is_email_verified": true,
    "email": "user@kakao.com"
  }
}
```

> **확인 사항**: `profile.nickname`과 `email`이 모두 존재해야 Member 생성이 가능합니다.

---

#### 자주 발생하는 문제

| 문제 | 원인 | 해결 |
|------|------|------|
| `invalid_grant` | 인가 코드 만료 또는 재사용 | 새 인가 코드 발급 |
| `redirect_uri_mismatch` | Redirect URI 불일치 | 카카오 콘솔 설정 확인 |
| `invalid_client` | Client ID/Secret 오류 | .env 값 확인 |
| 이메일 없음 | 동의항목 미설정 | 카카오 콘솔에서 "카카오계정(이메일)" 필수 동의 설정 |
| 닉네임 없음 | 동의항목 미설정 | 카카오 콘솔에서 "닉네임" 필수 동의 설정 |

---

### 로컬 개발 환경 테스트 (FE 있는 경우)

1. **카카오 개발자 앱 설정**
   - Redirect URI에 `http://localhost:3000/auth/kakao/callback` 등록
   - 플랫폼 도메인에 `http://localhost:3000` 등록

2. **환경 변수 설정**
   ```env
   KAKAO_CLIENT_ID=your_rest_api_key
   KAKAO_CLIENT_SECRET=your_client_secret
   KAKAO_REDIRECT_URI=http://localhost:3000/auth/kakao/callback
   ```

3. **테스트 계정 사용**
   - 카카오 개발자 계정으로 직접 테스트
   - 또는 팀원 계정 추가 (앱 설정 > 팀 관리)

### 단위 테스트

```typescript
// kakao-oauth.service.spec.ts

describe('KakaoOAuthService', () => {
  let service: KakaoOAuthService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        KakaoOAuthService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn().mockImplementation((key: string) => {
              const config: Record<string, string> = {
                KAKAO_CLIENT_ID: 'test_client_id',
                KAKAO_CLIENT_SECRET: 'test_client_secret',
                KAKAO_REDIRECT_URI: 'http://localhost:3000/callback',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<KakaoOAuthService>(KakaoOAuthService);
  });

  describe('exchangeCodeForToken', () => {
    it('should exchange code for token successfully', async () => {
      // Mock fetch
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'test_access_token',
          refresh_token: 'test_refresh_token',
          expires_in: 43199,
        }),
      });

      const result = await service.exchangeCodeForToken('test_code');

      expect(result.access_token).toBe('test_access_token');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://kauth.kakao.com/oauth/token',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('should throw error when code is invalid', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({
          error: 'invalid_grant',
          error_description: 'authorization code not found',
        }),
      });

      await expect(service.exchangeCodeForToken('invalid_code'))
        .rejects.toThrow(UnauthorizedException);
    });
  });
});
```

### E2E 테스트 시나리오

1. **정상 로그인 흐름**
   - 카카오 로그인 버튼 클릭 → 인가 → 콜백 → 토큰 발급 → 메인 페이지

2. **신규 회원 가입**
   - 처음 로그인하는 사용자 → 자동 회원 가입 → 온보딩 페이지

3. **기존 회원 연동**
   - 이메일이 동일한 기존 회원 → 카카오 계정 연동

4. **에러 시나리오**
   - 사용자 동의 거부 → 로그인 페이지 + 안내 메시지
   - state 불일치 → 에러 페이지

---

## 구현 체크리스트 (설계 2: 별도 OAuthConnection Aggregate)

### 카카오 개발자 설정 (선행)

- [ ] 앱 생성
- [ ] REST API 키 확보
- [ ] Client Secret 활성화
- [ ] 플랫폼 도메인 등록 (`http://localhost:3000`)
- [ ] Redirect URI 등록 (`http://localhost:3000/auth/kakao/callback`)
- [ ] 동의항목 설정 (닉네임: 필수, 이메일: 필수)

### Backend - Domain Layer

- [ ] `src/domain/oauth/` 폴더 생성
- [ ] `types/oauth.types.ts` - OAuthProvider, OAuthConnectionType, ConnectOAuthRequest 타입
- [ ] `oauth-connection.ts` - OAuthConnection Aggregate (connect, of 팩토리 메서드)
- [ ] `oauth-connection.repository.ts` - Repository 인터페이스 + Symbol 토큰
- [ ] `events/oauth-connected.event.ts` - 도메인 이벤트 (선택)
- [ ] `index.ts` - 배럴 export

### Backend - Adapter Layer (Persistence)

- [ ] `src/adapter/oauth/persistence/entity/oauth-connection.entity.ts` - MikroORM Entity
- [ ] `src/adapter/oauth/persistence/mapper/oauth-connection.mapper.ts` - Mapper
- [ ] `src/adapter/oauth/persistence/oauth-connection.repository-impl.ts` - Repository 구현
- [ ] DB 마이그레이션 - `oauth_connection` 테이블 생성

### Backend - Adapter Layer (Kakao API)

- [ ] `src/adapter/oauth/kakao/types/kakao-oauth.types.ts` - 카카오 API 응답 타입
- [ ] `src/adapter/oauth/kakao/kakao-oauth.service.ts` - 카카오 API 호출 (토큰 교환, 사용자 정보)

### Backend - Adapter Layer (API)

- [ ] `src/adapter/oauth/api/dto/oauth-callback.dto.ts` - 콜백 DTO
- [ ] `src/adapter/oauth/api/dto/oauth-login-response.dto.ts` - 응답 DTO
- [ ] `src/adapter/oauth/api/kakao-oauth.controller.ts` - 컨트롤러 (GET url, POST callback)

### Backend - Application Layer

- [ ] `src/application/oauth/kakao-auth.service.ts` - 비즈니스 로직 (findOrCreateMember)

### Backend - Module & Config

- [ ] `src/adapter/oauth/oauth.module.ts` - OAuth 모듈
- [ ] `src/app.module.ts` - OAuthModule import 추가
- [ ] `.env` - KAKAO_CLIENT_ID, KAKAO_CLIENT_SECRET, KAKAO_REDIRECT_URI 추가
- [ ] `src/config/env.config.ts` - 환경 변수 스키마 (이미 추가됨)

### Backend - 테스트

- [ ] Postman으로 인가 URL 조회 테스트
- [ ] 브라우저에서 카카오 로그인 → 인가 코드 획득
- [ ] Postman으로 콜백 API 테스트 (신규 회원)
- [ ] Postman으로 콜백 API 테스트 (기존 회원 재로그인)
- [ ] DB에서 `member`, `oauth_connection` 테이블 데이터 확인

### Frontend (추후)

- [ ] 카카오 로그인 버튼 컴포넌트
- [ ] 콜백 페이지 및 라우트 설정
- [ ] state 생성 및 검증 로직
- [ ] 토큰 저장 및 관리
- [ ] 에러 처리 UI

---

## 참고 자료

- [카카오 로그인 REST API 문서](https://developers.kakao.com/docs/latest/ko/kakaologin/rest-api)
- [OAuth 2.0 RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749)
- [카카오 개발자 가이드](https://developers.kakao.com/docs/latest/ko/getting-started/app)
