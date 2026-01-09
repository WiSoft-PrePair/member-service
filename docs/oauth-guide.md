# OAuth 2.0 Complete Guide

이 문서는 OAuth 2.0의 개념부터 실제 구현까지 상세하게 설명합니다.

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

**쉽게 설명하면**: 사용자가 카카오에 저장된 자신의 정보(이메일, 프로필 등)를 우리 서비스에 공유하도록 허락하는 과정입니다. 이때 사용자는 카카오 비밀번호를 우리 서비스에 알려주지 않아도 됩니다.

### 1.2 왜 OAuth가 필요한가?

**OAuth가 없던 시절의 문제점:**

```
기존 방식 (매우 위험!)
┌─────────┐                     ┌──────────┐
│  사용자   │   "카카오 ID/PW를     │ 제3자 앱  │
│         │    알려주세요"         │ (PrePair)│
└────┬────┘ ──────────────────> └─────┬────┘
     │                                │
     │                                │ 사용자의 ID/PW로
     │                                │ 카카오에 직접 로그인
     │                                ▼
     │                          ┌──────────┐
     │                          │   카카오   │
     │                          └──────────┘
     │
문제점:
1. 사용자가 비밀번호를 제3자에게 노출
2. 제3자 앱이 비밀번호를 저장해야 함 (유출 위험)
3. 제3자 앱이 사용자의 모든 권한을 가짐 (위험)
4. 비밀번호 변경 시 모든 연동 서비스에서 재설정 필요
```

**OAuth 2.0 방식 (안전!):**

```
┌─────────┐   1. "카카오로 로그인"  ┌──────────┐
│  사용자   │ <───────────────────│ 제3자 앱  │
└────┬────┘      버튼 클릭        └──────────┘
     │                                 ▲
     │ 2. 카카오 로그인 페이지에서           │
     │    직접 로그인 + 동의               │ 5. Access Token으로
     │    (비밀번호는 카카오만 앎)           │    허용된 정보만 요청
     ▼                                 │
┌──────────┐                           │
│   카카오   │   3. 인가 코드 발급 ─────────┘
│          │  4. Access Token 발급 ─────┘
└──────────┘

장점:
1. 비밀번호가 제3자에게 절대 노출되지 않음
2. 사용자가 제공할 정보를 직접 선택 (동의항목)
3. 언제든 연결 해제 가능
4. 비밀번호 변경해도 연동 서비스는 그대로 동작
```

### 1.3 OAuth 2.0 주요 용어

| 용어 | 설명 | 카카오 로그인 예시 |
|------|------|------------------|
| **Resource Owner** | 리소스(데이터)의 실제 소유자. 즉, 사용자 | 카카오 계정을 가진 사용자 |
| **Client** | 사용자의 리소스에 접근하려는 애플리케이션 | PrePair 서비스 (우리 앱) |
| **Authorization Server** | 사용자를 인증하고 권한을 부여하는 서버 | `kauth.kakao.com` |
| **Resource Server** | 사용자의 리소스를 보유한 서버 | `kapi.kakao.com` |
| **Authorization Code** | Access Token 교환용 임시 코드 (일회성, 약 10분 유효) | `code=abc123...` |
| **Access Token** | API 호출에 사용하는 접근 토큰 | 카카오 API 호출용 (12시간 유효) |
| **Refresh Token** | Access Token 재발급용 토큰 | 60일 유효 |
| **Redirect URI** | 인증 완료 후 돌아올 콜백 URL | `https://myapp.com/auth/kakao/callback` |
| **Scope** | 요청하는 권한 범위 | 이메일, 프로필, 친구목록 등 |

### 1.4 OAuth 2.0 Grant Types (인증 방식)

OAuth 2.0은 여러 인증 방식을 제공합니다. **카카오 로그인은 Authorization Code Grant**를 사용합니다.

#### 1.4.1 Authorization Code Grant (권장)

```
가장 안전한 방식. 웹/앱 서비스에서 표준으로 사용.

[흐름]
사용자 → 카카오 로그인 → 인가 코드 발급 → 백엔드에서 토큰 교환

[특징]
- 인가 코드는 프론트엔드로, 토큰 교환은 백엔드에서
- Client Secret이 노출되지 않음
- 가장 높은 보안 수준
```

#### 1.4.2 Implicit Grant (더 이상 권장하지 않음)

```
[흐름]
사용자 → 카카오 로그인 → 바로 Access Token 발급 (인가 코드 없이)

[문제점]
- Access Token이 URL에 노출됨
- 브라우저 히스토리에 토큰이 남음
- 보안 취약점이 많아 더 이상 권장하지 않음
```

#### 1.4.3 Client Credentials Grant

```
[용도]
서버 대 서버 통신. 사용자 인증 없이 앱 자체 권한으로 API 호출.

[예시]
- 서버에서 카카오 API의 일반 정보 조회
- 사용자와 무관한 서비스 간 통신
```

#### 1.4.4 Resource Owner Password Credentials Grant

```
[흐름]
사용자가 ID/PW를 앱에 직접 입력 → 앱이 카카오에 토큰 요청

[문제점]
- 사용자 비밀번호가 앱에 노출됨
- OAuth의 핵심 원칙 위배
- 특수한 경우(자사 앱)에만 제한적 사용
```

### 1.5 Access Token vs Refresh Token

```
┌─────────────────────────────────────────────────────────────┐
│                      Access Token                           │
├─────────────────────────────────────────────────────────────┤
│ 용도: API 호출 시 인증에 사용                                     │
│ 유효기간: 짧음 (카카오: 12시간)                                   │
│ 저장: 메모리 또는 localStorage (프론트엔드)                        │
│ 탈취 시: 제한된 시간 동안만 피해                                   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                      Refresh Token                          │
├─────────────────────────────────────────────────────────────┤
│ 용도: Access Token 재발급                                      │
│ 유효기간: 김 (카카오: 60일)                                      │
│ 저장: httpOnly 쿠키 (권장) 또는 안전한 저장소                       │
│ 탈취 시: 장기간 피해 가능 → 더 안전하게 보관해야 함                    │
└─────────────────────────────────────────────────────────────┘

[토큰 갱신 흐름]
1. Access Token으로 API 호출
2. 401 Unauthorized (토큰 만료)
3. Refresh Token으로 새 Access Token 요청
4. 새 Access Token 발급
5. 다시 API 호출
```

### 1.6 카카오 Access Token vs 서비스 JWT Token

**매우 중요한 개념입니다!**

```
┌─────────────────────────────────────────────────────────────┐
│                  카카오 Access Token                          │
├─────────────────────────────────────────────────────────────┤
│ 발급 주체: 카카오                                               │
│ 용도: 카카오 API 호출 (사용자 정보 조회 등)                          │
│ 유효기간: 12시간                                                │
│ 저장: 백엔드에서 일시적으로 사용 후 폐기 (저장 불필요)                   │
│                                                             │
│ → 우리 서비스 인증에는 사용하지 않음!                                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   서비스 JWT Token                            │
├─────────────────────────────────────────────────────────────┤
│ 발급 주체: 우리 서비스 (PrePair)                                 │
│ 용도: 우리 서비스 API 인증                                       │
│ 유효기간: 자체 설정 (예: 15분)                                    │
│ 저장: 프론트엔드 (localStorage 또는 메모리)                        │
│                                                             │
│ → 우리 서비스의 모든 API 호출에 사용                               │
└─────────────────────────────────────────────────────────────┘

[실제 흐름]
1. 사용자가 카카오 로그인
2. 카카오가 Access Token 발급 (카카오용)
3. 백엔드가 카카오 Access Token으로 사용자 정보 조회
4. 백엔드가 우리 서비스용 JWT Token 발급
5. 프론트엔드는 우리 JWT Token만 저장/사용
6. 카카오 Access Token은 백엔드에서 폐기

→ 두 토큰은 완전히 별개의 목적!
```

---

## 2. 카카오 로그인 전체 흐름

### 2.1 시퀀스 다이어그램

```
┌─────────┐     ┌──────────┐     ┌──────────┐     ┌─────────────┐     ┌─────────────┐
│  사용자   │     │ Frontend │     │ Backend  │     │ 카카오 인증    │    │ 카카오 API    │
│         │     │  (React) │     │ (NestJS) │     │   Server    │     │   Server    │
└────┬────┘     └────┬─────┘     └────┬─────┘     └──────┬──────┘     └──────┬──────┘
     │               │                │                  │                   │
     │ ① 카카오 로그인  │                │                  │                   │
     │    버튼 클릭    │                │                  │                   │
     │──────────────>│                │                  │                   │
     │               │                │                  │                   │
     │               │ ② 카카오 인가    │                  │                   │
     │               │   URL로 브라우저                     │                   │
     │               │   리다이렉트      │                  │                   │
     │<──────────────│                │                  │                   │
     │               │                │                  │                   │
     │               │                │                  │                   │
     │ ③ 카카오 로그인 페이지 표시          │                  │                   │
     │   (kauth.kakao.com)            │                  │                   │
     │─────────────────────────────────────────────────>│                   │
     │               │                │                  │                   │
     │               │                │                  │                   │
     │ ④ 사용자가      │                │                  │                   │
     │   ID/PW 입력   │                │                  │                   │
     │   + 동의항목    │                │                  │                   │
     │   체크         │                │                  │                   │
     │─────────────────────────────────────────────────>│                   │
     │               │                │                  │                   │
     │               │                │                  │                   │
     │               │ ⑤ 인가 코드(code)와 함께              │                   │
     │               │   redirect_uri로                  │                   │
     │               │   리다이렉트 (HTTP 302)              │                   │
     │<──────────────────────────────────────────────────│                   │
     │               │                │                  │                   │
     │   브라우저가     │                │                  │                   │
     │   redirect_uri│                │                  │                   │
     │   페이지 로드    │                │                  │                   │
     │──────────────>│                │                  │                   │
     │               │                │                  │                   │
     │               │ ⑥ URL에서 code │                  │                   │
     │               │   추출 후      │                  │                   │
     │               │   Backend으로  │                  │                   │
     │               │   전송         │                  │                   │
     │               │───────────────>│                  │                   │
     │               │ POST /api/auth │                  │                   │
     │               │ /kakao/callback│                  │                   │
     │               │ {code: "..."}  │                  │                   │
     │               │                │                  │                   │
     │               │                │                  │                   │
     │               │                │ ⑦ 인가 코드로      │                   │
     │               │                │   Access Token   │                   │
     │               │                │   교환 요청        │                   │
     │               │                │─────────────────>│                   │
     │               │                │ POST /oauth/token│                   │
     │               │                │ {code, client_id,│                   │
     │               │                │  client_secret}  │                   │
     │               │                │                  │                   │
     │               │                │                  │                   │
     │               │                │ ⑧ Access Token   │                   │
     │               │                │   반환            │                   │
     │               │                │<─────────────────│                   │
     │               │                │ {access_token,   │                   │
     │               │                │  refresh_token}  │                   │
     │               │                │                  │                   │
     │               │                │                  │                   │
     │               │                │ ⑨ Access Token   │                   │
     │               │                │   으로 사용자       │                   │
     │               │                │   정보 요청         │                   │
     │               │                │──────────────────────────────────────>│
     │               │                │ GET /v2/user/me  │                   │
     │               │                │ Authorization:   │                   │
     │               │                │ Bearer {token}   │                   │
     │               │                │                  │                   │
     │               │                │                  │                   │
     │               │                │ ⑩ 사용자 정보      │                   │
     │               │                │   반환            │                   │
     │               │                │<──────────────────────────────────────│
     │               │                │ {id, email,      │                   │
     │               │                │  nickname, ...}  │                   │
     │               │                │                  │                   │
     │               │                │                  │                   │
     │               │                │ ⑪ 회원 조회/생성    │                   │
     │               │                │   + 서비스 JWT    │                   │
     │               │                │   토큰 발급        │                   │
     │               │                │ (내부 처리)        │                   │
     │               │                │                  │                   │
     │               │                │                  │                   │
     │               │ ⑫ 서비스 JWT    │                  │                   │
     │               │   토큰 응답      │                  │                   │
     │               │<───────────────│                  │                   │
     │               │ {accessToken,  │                  │                   │
     │               │  refreshToken, │                  │                   │
     │               │  memberId}     │                  │                   │
     │               │                │                  │                   │
     │               │                │                  │                   │
     │ ⑬ 로그인 완료   │                │                  │                   │
     │   메인 페이지    │                │                  │                   │
     │   이동         │                │                  │                   │
     │<──────────────│                │                  │                   │
     │               │                │                  │                   │
```

### 2.2 단계별 상세 설명

| 단계 | 주체 | 상세 설명 |
|------|------|----------|
| ① | 사용자 → FE | 사용자가 "카카오로 로그인" 버튼 클릭 |
| ② | FE | 카카오 인가 URL 생성 후 브라우저를 해당 URL로 리다이렉트. `client_id`, `redirect_uri`, `response_type=code` 포함 |
| ③ | 카카오 | 카카오 로그인 페이지 표시 (kauth.kakao.com) |
| ④ | 사용자 → 카카오 | 사용자가 카카오 계정으로 로그인 + 정보 제공 동의항목 체크 |
| ⑤ | 카카오 → FE | 동의 완료 후, **인가 코드(code)**를 URL 파라미터에 포함하여 redirect_uri로 리다이렉트 |
| ⑥ | FE → BE | 콜백 페이지에서 URL의 code 파라미터 추출 후 백엔드 API로 전송 |
| ⑦ | BE → 카카오 | 인가 코드 + client_id + client_secret으로 Access Token 요청 |
| ⑧ | 카카오 → BE | Access Token, Refresh Token 반환 |
| ⑨ | BE → 카카오 | Access Token을 Authorization 헤더에 담아 사용자 정보 API 호출 |
| ⑩ | 카카오 → BE | 사용자 정보 반환 (id, email, nickname 등) |
| ⑪ | BE 내부 | DB에서 회원 조회. 없으면 신규 생성. 서비스 자체 JWT 토큰 발급 |
| ⑫ | BE → FE | 서비스 JWT 토큰 (accessToken, refreshToken) 응답 |
| ⑬ | FE | 토큰 저장 후 메인 페이지로 이동. 로그인 완료 |

### 2.3 인가 코드(Authorization Code)의 특징

```
┌─────────────────────────────────────────────────────────────┐
│                    인가 코드 (Authorization Code)             │
├─────────────────────────────────────────────────────────────┤
│ 유효 시간: 약 10분 (매우 짧음)                                   │
│ 사용 횟수: 1회만 사용 가능 (일회성)                                │
│ 전달 방식: URL 쿼리 파라미터로 전달                                │
│ 보안: 프론트엔드에 노출되지만, 단독으로는 무용지물                      │
│                                                             │
│ → 인가 코드만으로는 사용자 정보에 접근 불가!                          │
│ → 반드시 client_secret과 함께 교환해야 Access Token 획득           │
└─────────────────────────────────────────────────────────────┘

[왜 인가 코드를 사용하는가?]

1. 보안 분리
   - 인가 코드: 프론트엔드에서 받음 (노출되어도 상대적으로 안전)
   - Access Token: 백엔드에서 받음 (노출되면 위험)

2. Client Secret 보호
   - 토큰 교환 시 client_secret 필요
   - client_secret은 백엔드에만 저장
   - 프론트엔드에서는 절대 알 수 없음

3. 일회성
   - 탈취되어도 이미 사용되었다면 무용지물
   - 10분 후 만료
```

---

## 3. Redirect URI(콜백 URL) 이해

### 3.1 Redirect URI란?

**Redirect URI(콜백 URL)**는 OAuth 인증 과정에서 카카오가 **인가 코드를 전달할 목적지 주소**입니다.

사용자가 카카오에서 로그인을 완료하면, 카카오는 브라우저를 이 주소로 리다이렉트하면서 인가 코드를 URL 파라미터로 함께 전달합니다.

```
카카오 인가 요청 URL 구조:

https://kauth.kakao.com/oauth/authorize
  ?client_id=YOUR_REST_API_KEY        ← 카카오 앱의 REST API 키
  &redirect_uri=https://myapp.com/auth/kakao/callback  ← 콜백 URL (여기!)
  &response_type=code                 ← 인가 코드 방식 사용
  &state=random_csrf_token            ← CSRF 방지용 (선택)
```

### 3.2 Redirect URI 동작 원리

```
[Step 1] Frontend가 사용자를 카카오 로그인 페이지로 보냄
         ↓
         https://kauth.kakao.com/oauth/authorize
           ?client_id=abc123
           &redirect_uri=https://myapp.com/auth/kakao/callback
           &response_type=code

[Step 2] 사용자가 카카오에서 로그인 + 동의
         ↓

[Step 3] 카카오가 사용자 브라우저를 redirect_uri로 리다이렉트
         (HTTP 302 Redirect)
         ↓
         Location: https://myapp.com/auth/kakao/callback
                   ?code=AUTHORIZATION_CODE_HERE
                   &state=random_csrf_token

[Step 4] 브라우저가 redirect_uri 페이지 로드
         Frontend의 /auth/kakao/callback 페이지가 열림
         ↓

[Step 5] Frontend가 URL에서 code 파라미터 추출
         ↓
         const urlParams = new URLSearchParams(window.location.search);
         const code = urlParams.get('code');
         // code = "AUTHORIZATION_CODE_HERE"

[Step 6] Frontend가 code를 Backend로 전송
         ↓
         POST /api/auth/kakao/callback
         Body: { "code": "AUTHORIZATION_CODE_HERE" }
```

### 3.3 Redirect URI 보안: 왜 사전 등록이 필요한가?

```
[공격 시나리오 - Redirect URI 검증이 없다면]

1. 공격자가 피싱 링크 생성
   https://kauth.kakao.com/oauth/authorize
     ?client_id=정상_앱의_client_id
     &redirect_uri=https://evil.com/steal  ← 공격자 서버로 변경!
     &response_type=code

2. 피해자가 링크 클릭 → 카카오 로그인 (정상으로 보임)

3. 로그인 완료 후 인가 코드가 evil.com으로 전송됨
   https://evil.com/steal?code=피해자의_인가코드

4. 공격자가 인가 코드 탈취 → 피해자 계정에 접근 가능

[방어 메커니즘]

카카오 개발자 콘솔에 사전 등록된 redirect_uri로만 리다이렉트 허용

- 등록된 URI: https://myapp.com/auth/kakao/callback
- 요청된 URI: https://evil.com/steal
- 결과: ❌ 에러 발생 (redirect_uri_mismatch)
```

### 3.4 환경별 Redirect URI 설정

모든 환경의 Redirect URI를 카카오 개발자 콘솔에 등록해야 합니다.

| 환경 | Redirect URI | 카카오 콘솔 등록 |
|------|-------------|----------------|
| 로컬 개발 (CRA) | `http://localhost:3000/auth/kakao/callback` | 필수 |
| 로컬 개발 (Vite) | `http://localhost:5173/auth/kakao/callback` | 필수 |
| 개발 서버 | `https://dev.myapp.com/auth/kakao/callback` | 필수 |
| 스테이징 | `https://staging.myapp.com/auth/kakao/callback` | 필수 |
| 프로덕션 | `https://myapp.com/auth/kakao/callback` | 필수 |

```
카카오 개발자 콘솔 설정 위치:
내 애플리케이션 → 앱 선택 → 카카오 로그인 → Redirect URI

여러 개 등록 가능:
http://localhost:3000/auth/kakao/callback
http://localhost:5173/auth/kakao/callback
https://dev.myapp.com/auth/kakao/callback
https://myapp.com/auth/kakao/callback
```

### 3.5 Redirect URI vs Backend Callback Endpoint

혼동하기 쉬운 두 개념을 명확히 구분합니다.

```
┌─────────────────────────────────────────────────────────────┐
│            Redirect URI (Frontend Callback Page)            │
├─────────────────────────────────────────────────────────────┤
│ URL: https://myapp.com/auth/kakao/callback                  │
│ 주체: Frontend (React 페이지)                                  │
│ 역할: 카카오가 브라우저를 이 페이지로 리다이렉트                        │
│ 처리: URL에서 code 추출 → Backend API 호출                       │
│                                                             │
│ 카카오 콘솔에 등록해야 함!                                        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│           Backend Callback Endpoint (API)                   │
├─────────────────────────────────────────────────────────────┤
│ URL: POST /api/auth/kakao/callback                          │
│ 주체: Backend (NestJS Controller)                            │
│ 역할: Frontend에서 code를 받아 토큰 교환 처리                      │
│ 처리: code → Access Token → 사용자 정보 → JWT 발급               │
│                                                             │
│ 카카오와 직접 관련 없음. 우리 서비스 내부 API.                       │
└─────────────────────────────────────────────────────────────┘

[흐름]
카카오 → Redirect URI (FE 페이지) → Backend API Endpoint
                ↓                         ↓
         code 추출              code로 토큰 교환
```

---

## 4. FE/BE 역할 분리 및 구현 상세

### 4.1 역할 분리 개요

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend 역할                                │
├─────────────────────────────────────────────────────────────────────┤
│ 1. 카카오 로그인 버튼 UI 제공                                             │
│ 2. 카카오 인가 URL 생성 (또는 Backend에서 받아옴)                           │
│ 3. 브라우저를 카카오 로그인 페이지로 리다이렉트                                │
│ 4. 콜백 페이지에서 인가 코드(code) 추출                                    │
│ 5. 인가 코드를 Backend API로 전송                                       │
│ 6. state 파라미터 생성 및 검증 (CSRF 방지)                                │
│ 7. JWT 토큰 저장 및 관리 (localStorage/메모리)                           │
│ 8. 로그인 상태에 따른 UI 업데이트                                         │
│ 9. 에러 처리 및 사용자 안내                                              │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                         Backend 역할                                 │
├─────────────────────────────────────────────────────────────────────┤
│ 1. 카카오 API 키(client_id, client_secret) 안전 보관                    │
│ 2. 인가 코드 → Access Token 교환 (카카오 API 호출)                        │
│ 3. Access Token으로 카카오 사용자 정보 조회 (카카오 API 호출)                │
│ 4. 사용자 정보로 회원 조회 또는 신규 가입 처리                                │
│ 5. OAuthConnection 생성/관리 (소셜 연결 정보)                            │
│ 6. 서비스 자체 JWT 토큰 발급                                             │
│ 7. 에러 처리 및 적절한 HTTP 응답                                          │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Frontend 구현 상세

#### 4.2.1 카카오 로그인 버튼 컴포넌트

```tsx
// components/KakaoLoginButton.tsx
import { useCallback } from 'react';

const KAKAO_CLIENT_ID = import.meta.env.VITE_KAKAO_CLIENT_ID;

export function KakaoLoginButton() {
  const handleKakaoLogin = useCallback(async () => {
    // 방법 1: Frontend에서 직접 URL 생성
    const redirectUri = `${window.location.origin}/auth/kakao/callback`;
    const state = crypto.randomUUID(); // CSRF 방지용 랜덤 문자열

    // 세션에 state 저장 (나중에 검증용)
    sessionStorage.setItem('kakao_oauth_state', state);

    const authUrl = new URL('https://kauth.kakao.com/oauth/authorize');
    authUrl.searchParams.set('client_id', KAKAO_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('state', state);

    // 카카오 로그인 페이지로 이동
    window.location.href = authUrl.toString();

    // 방법 2: Backend에서 URL 받아오기 (권장)
    // const response = await fetch('/api/auth/kakao/url');
    // const { url } = await response.json();
    // const state = crypto.randomUUID();
    // sessionStorage.setItem('kakao_oauth_state', state);
    // window.location.href = `${url}&state=${state}`;
  }, []);

  return (
    <button
      onClick={handleKakaoLogin}
      style={{
        backgroundColor: '#FEE500',
        color: '#000000',
        border: 'none',
        padding: '12px 24px',
        borderRadius: '8px',
        cursor: 'pointer',
        fontSize: '16px',
        fontWeight: 'bold',
      }}
    >
      <KakaoIcon />
      카카오로 로그인
    </button>
  );
}

function KakaoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" style={{ marginRight: 8 }}>
      <path
        fill="#000000"
        d="M10 0C4.477 0 0 3.582 0 8c0 2.867 1.867 5.378 4.667 6.8-.147.533-.533 1.933-.612 2.267-.1.4.147.4.307.293.128-.08 2-.133 2.8-1.827.28.04.56.067.838.067 5.523 0 10-3.582 10-8S15.523 0 10 0z"
      />
    </svg>
  );
}
```

#### 4.2.2 콜백 페이지 (가장 중요!)

```tsx
// pages/auth/kakao/callback.tsx
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

interface LoginResponse {
  isNewMember: boolean;
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiresIn?: number;
  memberId?: string;
  registrationToken?: string;
  prefilledData?: {
    email: string;
    nickname: string;
  };
}

export function KakaoCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const handleCallback = async () => {
      // 1. URL 파라미터 추출
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const error = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');

      // 2. 카카오 에러 체크 (사용자가 동의 거부 등)
      if (error) {
        console.error('카카오 로그인 에러:', error, errorDescription);
        setStatus('error');
        setErrorMessage(
          error === 'access_denied'
            ? '카카오 로그인이 취소되었습니다.'
            : `로그인 오류: ${errorDescription || error}`
        );
        return;
      }

      // 3. 인가 코드 체크
      if (!code) {
        setStatus('error');
        setErrorMessage('인가 코드를 받지 못했습니다.');
        return;
      }

      // 4. state 검증 (CSRF 방지)
      const savedState = sessionStorage.getItem('kakao_oauth_state');
      if (state !== savedState) {
        console.error('state 불일치 - CSRF 공격 의심');
        setStatus('error');
        setErrorMessage('보안 검증에 실패했습니다. 다시 시도해주세요.');
        return;
      }
      // state 사용 완료 후 삭제
      sessionStorage.removeItem('kakao_oauth_state');

      try {
        // 5. Backend로 인가 코드 전송
        const response = await fetch('/api/auth/kakao/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || '로그인 처리 실패');
        }

        const data: LoginResponse = await response.json();

        // 6. 응답 처리
        if (data.isNewMember && data.registrationToken) {
          // Case: 신규 회원 → 추가 정보 입력 페이지로
          sessionStorage.setItem('oauth_registration_token', data.registrationToken);
          sessionStorage.setItem('oauth_prefilled_data', JSON.stringify(data.prefilledData));
          navigate('/auth/kakao/register');
        } else if (data.accessToken) {
          // Case: 기존 회원 → 토큰 저장 후 메인으로
          localStorage.setItem('accessToken', data.accessToken);
          localStorage.setItem('refreshToken', data.refreshToken!);
          navigate('/');
        } else {
          throw new Error('예상치 못한 응답 형식');
        }
      } catch (err) {
        console.error('로그인 처리 오류:', err);
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : '로그인 처리 중 오류가 발생했습니다.');
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  if (status === 'error') {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <h2>로그인 실패</h2>
        <p>{errorMessage}</p>
        <button onClick={() => navigate('/login')}>
          로그인 페이지로 돌아가기
        </button>
      </div>
    );
  }

  return (
    <div style={{ textAlign: 'center', padding: '40px' }}>
      <div className="spinner" />
      <p>카카오 로그인 처리 중...</p>
    </div>
  );
}
```

#### 4.2.3 신규 회원 추가 정보 입력 페이지

```tsx
// pages/auth/kakao/register.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface PrefilledData {
  email: string;
  nickname: string;
}

export function KakaoRegisterPage() {
  const navigate = useNavigate();
  const [prefilledData, setPrefilledData] = useState<PrefilledData | null>(null);
  const [formData, setFormData] = useState({
    job: '',
    notification: 'EMAIL',
    frequency: 'DAILY',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // 세션에서 OAuth 데이터 로드
    const registrationToken = sessionStorage.getItem('oauth_registration_token');
    const prefilledDataStr = sessionStorage.getItem('oauth_prefilled_data');

    if (!registrationToken || !prefilledDataStr) {
      // 토큰이 없으면 로그인 페이지로
      navigate('/login');
      return;
    }

    setPrefilledData(JSON.parse(prefilledDataStr));
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    const registrationToken = sessionStorage.getItem('oauth_registration_token');

    try {
      const response = await fetch('/api/auth/kakao/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registrationToken,
          ...formData,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || '회원가입 실패');
      }

      const data = await response.json();

      // 토큰 저장
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);

      // 세션 정리
      sessionStorage.removeItem('oauth_registration_token');
      sessionStorage.removeItem('oauth_prefilled_data');

      // 메인 페이지로 이동
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : '회원가입 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!prefilledData) {
    return <div>로딩 중...</div>;
  }

  return (
    <div style={{ maxWidth: 400, margin: '0 auto', padding: 20 }}>
      <h1>회원가입 완료</h1>
      <p>환영합니다, {prefilledData.nickname}님!</p>
      <p>추가 정보를 입력해주세요.</p>

      <form onSubmit={handleSubmit}>
        {/* 카카오에서 받아온 정보 (읽기 전용) */}
        <div style={{ marginBottom: 16 }}>
          <label>이메일</label>
          <input
            type="email"
            value={prefilledData.email}
            disabled
            style={{ width: '100%', padding: 8, backgroundColor: '#f5f5f5' }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label>닉네임</label>
          <input
            type="text"
            value={prefilledData.nickname}
            disabled
            style={{ width: '100%', padding: 8, backgroundColor: '#f5f5f5' }}
          />
        </div>

        {/* 추가 정보 입력 */}
        <div style={{ marginBottom: 16 }}>
          <label>직업 *</label>
          <input
            type="text"
            value={formData.job}
            onChange={(e) => setFormData({ ...formData, job: e.target.value })}
            required
            placeholder="예: 개발자, 디자이너, 학생"
            style={{ width: '100%', padding: 8 }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label>알림 수신 방법 *</label>
          <select
            value={formData.notification}
            onChange={(e) => setFormData({ ...formData, notification: e.target.value })}
            style={{ width: '100%', padding: 8 }}
          >
            <option value="EMAIL">이메일</option>
            <option value="PUSH">푸시 알림</option>
            <option value="NONE">받지 않음</option>
          </select>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label>알림 빈도 *</label>
          <select
            value={formData.frequency}
            onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
            style={{ width: '100%', padding: 8 }}
          >
            <option value="DAILY">매일</option>
            <option value="WEEKLY">매주</option>
            <option value="MONTHLY">매월</option>
          </select>
        </div>

        {error && <p style={{ color: 'red' }}>{error}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            width: '100%',
            padding: 12,
            backgroundColor: '#FEE500',
            border: 'none',
            borderRadius: 8,
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
          }}
        >
          {isSubmitting ? '처리 중...' : '가입 완료'}
        </button>
      </form>
    </div>
  );
}
```

#### 4.2.4 라우터 설정

```tsx
// App.tsx 또는 router.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { KakaoCallbackPage } from './pages/auth/kakao/callback';
import { KakaoRegisterPage } from './pages/auth/kakao/register';
import { MainPage } from './pages/MainPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainPage />} />
        <Route path="/login" element={<LoginPage />} />

        {/* 카카오 OAuth 관련 라우트 */}
        <Route path="/auth/kakao/callback" element={<KakaoCallbackPage />} />
        <Route path="/auth/kakao/register" element={<KakaoRegisterPage />} />

        {/* 기타 라우트 */}
      </Routes>
    </BrowserRouter>
  );
}
```

### 4.3 Backend 구현 상세

#### 4.3.1 API 엔드포인트 설계

```
┌─────────────────────────────────────────────────────────────────────┐
│                     OAuth API Endpoints                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ GET  /api/auth/kakao/url                                            │
│ └─ 카카오 인가 URL 반환                                                 │
│    Response: { url: string }                                        │
│                                                                     │
│ POST /api/auth/kakao/callback                                       │
│ └─ 인가 코드로 로그인 처리                                                │
│    Request:  { code: string }                                       │
│    Response: { isNewMember, accessToken?, registrationToken?, ... } │
│                                                                     │
│ POST /api/auth/kakao/register                                       │
│ └─ 신규 회원 가입 완료                                                  │
│    Request:  { registrationToken, job, notification, frequency }    │
│    Response: { accessToken, refreshToken, memberId, ... }           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

#### 4.3.2 Controller 구현

```typescript
// src/adapter/oauth/api/kakao-oauth.controller.ts

import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '@/adapter/shared/api/decorators/public.decorator';
import { OauthCallbackDto, OauthCompleteRegisterDto } from './dto';
import { KakaoAuthService } from '@/application/oauth/kakao-auth.service';

@Controller('api/auth/kakao')
export class KakaoOauthController {
  constructor(
    private readonly kakaoAuthService: KakaoAuthService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 카카오 인가 URL 반환
   *
   * Frontend에서 이 URL로 브라우저를 리다이렉트하면
   * 카카오 로그인 페이지가 표시됩니다.
   *
   * @param state CSRF 방지용 상태값 (선택)
   * @param prompt 'login' 전달 시 매번 카카오 로그인 요청
   */
  @Public()
  @Get('url')
  getAuthorizationUrl(
    @Query('state') state?: string,
    @Query('prompt') prompt?: string,
  ) {
    const clientId = this.configService.getOrThrow('KAKAO_CLIENT_ID');
    const redirectUri = this.configService.getOrThrow('KAKAO_REDIRECT_URI');

    const url = new URL('https://kauth.kakao.com/oauth/authorize');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');

    if (state) {
      url.searchParams.set('state', state);
    }

    if (prompt) {
      url.searchParams.set('prompt', prompt);
    }

    return { url: url.toString() };
  }

  /**
   * 카카오 로그인 콜백 처리
   *
   * Frontend에서 인가 코드를 받아 처리합니다.
   *
   * 응답 케이스:
   * 1. 기존 회원: { isNewMember: false, accessToken, refreshToken, memberId }
   * 2. 신규 회원: { isNewMember: true, registrationToken, prefilledData }
   */
  @Public()
  @Post('callback')
  async callback(@Body() dto: OauthCallbackDto) {
    return this.kakaoAuthService.handleCallback(dto.code);
  }

  /**
   * 신규 회원 가입 완료
   *
   * callback에서 받은 registrationToken과 추가 정보로
   * 실제 회원 가입을 완료합니다.
   */
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
// src/adapter/oauth/kakao/kakao-oauth.service.ts

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  KakaoTokenResponse,
  KakaoUserInfo,
} from './types/kakao-oauth.types';

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

  /**
   * 인가 코드를 Access Token으로 교환
   *
   * 카카오 OAuth 토큰 발급 API 호출
   * https://developers.kakao.com/docs/latest/ko/kakaologin/rest-api#request-token
   */
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
      // 에러 케이스:
      // - invalid_grant: 인가 코드 만료/이미 사용됨
      // - invalid_client: client_id/secret 오류
      throw new UnauthorizedException(
        `카카오 토큰 교환 실패: ${error.error_description || error.error}`,
      );
    }

    return response.json();
  }

  /**
   * Access Token으로 카카오 사용자 정보 조회
   *
   * 카카오 사용자 정보 가져오기 API 호출
   * https://developers.kakao.com/docs/latest/ko/kakaologin/rest-api#req-user-info
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
   * 카카오 연결 해제 (회원 탈퇴 시 사용)
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

#### 4.3.4 카카오 API 타입 정의

```typescript
// src/adapter/oauth/kakao/types/kakao-oauth.types.ts

/**
 * 카카오 토큰 발급 응답
 * https://developers.kakao.com/docs/latest/ko/kakaologin/rest-api#request-token-response
 */
export interface KakaoTokenResponse {
  token_type: 'bearer';
  access_token: string;
  expires_in: number;           // Access Token 만료 시간 (초)
  refresh_token: string;
  refresh_token_expires_in: number;
  scope?: string;               // 인가된 scope 목록
}

/**
 * 카카오 사용자 정보 응답
 * https://developers.kakao.com/docs/latest/ko/kakaologin/rest-api#req-user-info-response
 */
export interface KakaoUserInfo {
  id: number;                   // 카카오 회원번호 (고유 식별자)
  connected_at: string;         // 서비스 연결 시각
  kakao_account?: {
    // 프로필 정보
    profile_nickname_needs_agreement?: boolean;
    profile?: {
      nickname?: string;        // 닉네임
      is_default_nickname?: boolean;
      thumbnail_image_url?: string;
      profile_image_url?: string;
      is_default_image?: boolean;
    };

    // 이메일 정보
    email_needs_agreement?: boolean;
    is_email_valid?: boolean;
    is_email_verified?: boolean;
    email?: string;             // 이메일 주소
  };
}

/**
 * 카카오 사용자 정보에서 추출한 프로필
 */
export interface KakaoUserProfile {
  kakaoId: string;   // 카카오 회원번호 (문자열 변환)
  email: string;     // 이메일
  nickname: string;  // 닉네임
}
```

### 4.4 보안 고려사항

#### 4.4.1 state 파라미터 (CSRF 방지)

```typescript
// Frontend에서 state 생성 및 검증

// [로그인 시작]
const state = crypto.randomUUID();  // 랜덤 문자열 생성
sessionStorage.setItem('kakao_oauth_state', state);  // 세션에 저장
// URL에 state 포함하여 카카오로 리다이렉트

// [콜백에서]
const urlState = searchParams.get('state');
const savedState = sessionStorage.getItem('kakao_oauth_state');

if (urlState !== savedState) {
  // CSRF 공격 가능성!
  throw new Error('state 불일치');
}

sessionStorage.removeItem('kakao_oauth_state');  // 사용 후 삭제
```

#### 4.4.2 Client Secret 보호

```
┌─────────────────────────────────────────────────────────────┐
│                    절대 노출 금지!                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Client Secret은 백엔드에서만 사용                                │
│                                                             │
│ ❌ Frontend 코드에 포함                                       │
│ ❌ Git 저장소에 커밋                                           │
│ ❌ 브라우저 개발자 도구에서 확인 가능                               │
│ ❌ API 응답에 포함                                             │
│                                                             │
│ ✅ 환경 변수로 관리 (.env)                                      │
│ ✅ 백엔드 서버에서만 사용                                        │
│ ✅ 서버 환경 변수로 주입                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 4.4.3 토큰 저장 방식

| 토큰 | 저장 위치 | 이유 |
|------|----------|------|
| Access Token | localStorage 또는 메모리 | 짧은 만료 시간, API 호출에 필요 |
| Refresh Token | httpOnly 쿠키 (권장) | XSS 공격 방지, 긴 유효기간 |

```typescript
// httpOnly 쿠키로 Refresh Token 설정 (Backend)
@Post('callback')
async callback(
  @Body() dto: OauthCallbackDto,
  @Res({ passthrough: true }) res: Response,
) {
  const result = await this.kakaoAuthService.handleCallback(dto.code);

  if (!result.isNewMember) {
    // Refresh Token을 httpOnly 쿠키로 설정
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,           // JavaScript에서 접근 불가
      secure: process.env.NODE_ENV === 'production',  // HTTPS에서만
      sameSite: 'lax',          // CSRF 방지
      maxAge: 7 * 24 * 60 * 60 * 1000,  // 7일
    });

    // refreshToken은 응답 본문에서 제외
    const { refreshToken, ...rest } = result;
    return rest;
  }

  return result;
}
```

---

## 5. PrePair 프로젝트 OAuth 구현

### 5.1 아키텍처 개요

PrePair 프로젝트는 DDD + CQRS 패턴을 따르며, OAuth도 이 구조에 맞게 구현되어 있습니다.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Domain Layer                                │
├─────────────────────────────────────────────────────────────────────┤
│ domain/oauth/                                                       │
│ ├── oauth.ts                  # OAuthConnection Aggregate           │
│ │   - connect(): 새 OAuth 연결 생성                                    │
│ │   - of(): DB에서 복원                                               │
│ ├── oauth.repository.ts       # Repository 인터페이스 + Symbol         │
│ │   - OAUTH_REPOSITORY                                              │
│ │   - findByProviderAndProviderId()                                 │ 
│ │   - save()                                                        │
│ └── types/oauth.types.ts      # 도메인 타입 정의                        │
│     - OAuthProvider: 'kakao' | 'google' | 'naver'                   │
│     - OAuthConnectionType                                           │
│     - ConnectOAuthRequest                                           │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                       Application Layer                             │
├─────────────────────────────────────────────────────────────────────┤
│ application/oauth/                                                  │
│ ├── kakao-auth.service.ts          # 카카오 로그인 비즈니스 로직           │
│ │   - handleCallback(): 콜백 처리 (3가지 케이스)                         │
│ │   - completeRegistration(): 신규 회원 가입 완료                        │
│ │   - loginExistingMember(): 기존 회원 로그인                           │
│ │   - connectOAuthToExistingMember(): OAuth 연결 추가                  │
│ │                                                                   │
│ ├── oauth-registration-token.service.ts  # 등록 토큰 관리               │
│ │   - generateRegistrationToken(): JWT 형태 토큰 생성                   │
│ │   - verifyRegistrationToken(): 토큰 검증 및 데이터 추출                 │
│ │                                                                   │
│ ├── command/                                                        │
│ │   └── oauth-member-register.command.ts  # 신규 회원 등록 CQRS        │
│ │       - OAuthMemberRegisterCommand                                │
│ │       - OAuthMemberRegisterCommandHandler                         │
│ │                                                                   │
│ └── types/                                                          │
│     └── registration-token.types.ts  # Application 레이어 타입         │
│         - OAuthRegistrationPayload                                  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        Adapter Layer                                │
├─────────────────────────────────────────────────────────────────────┤
│ adapter/oauth/                                                      │
│ ├── api/                                                            │
│ │   ├── kakao-oauth.controller.ts   # REST 엔드포인트                  │
│ │   │   - GET /url: 인가 URL 반환                                     │
│ │   │   - POST /callback: 콜백 처리                                   │
│ │   │   - POST /register: 가입 완료                                   │
│ │   └── dto/                        # Request/Response DTOs        │
│ │       ├── oauth-callback.dto.ts                                  │
│ │       ├── oauth-complete-register.dto.ts                         │
│ │       └── oauth-login-response.dto.ts                            │
│ │                                                                  │
│ ├── kakao/                                                         │
│ │   ├── kakao-oauth.service.ts      # 카카오 API 호출                 │
│ │   │   - exchangeCodeForAccessToken()                             │
│ │   │   - getUserInfo()                                            │
│ │   │   - unlink()                                                 │
│ │   └── types/kakao-oauth.types.ts  # 카카오 API 응답 타입             │
│ │       - KakaoTokenResponse                                       │
│ │       - KakaoUserInfo                                            │
│ │       - KakaoUserProfile                                         │
│ │                                                                  │
│ ├── persistence/                                                   │
│ │   ├── entity/oauth.entity.ts      # MikroORM Entity              │
│ │   ├── mapper/oauth.mapper.ts      # Domain ↔ Entity 변환          │
│ │   └── oauth.repository-impl.ts    # Repository 구현               │
│ │                                                                  │
│ └── oauth.module.ts                 # NestJS Module (DI 설정)       │
└────────────────────────────────────────────────────────────────────┘
```

### 5.2 OAuth 로그인 3가지 시나리오

PrePair의 카카오 로그인은 3가지 케이스를 처리합니다.

#### Case 1: 기존 OAuth 회원 로그인

```
[조건]
- OAuthConnection 테이블에 (provider='kakao', providerId=카카오ID) 존재

[흐름]
카카오 로그인 → OAuthConnection 조회 → 있음!
→ 해당 memberId로 Member 조회
→ JWT 토큰 발급
→ 로그인 완료

[코드]
const existingConnection = await this.oauthConnectionRepository
  .findByProviderAndProviderId('kakao', kakaoId);

if (existingConnection) {
  return this.loginExistingMember(existingConnection.memberId);
}

[응답]
{
  "isNewMember": false,
  "accessToken": "eyJhbGci...",
  "refreshToken": "...",
  "accessTokenExpiresIn": 900,
  "memberId": "uuid"
}
```

#### Case 2: 동일 이메일 기존 회원 + OAuth 연결

```
[조건]
- OAuthConnection 없음
- 하지만 같은 이메일로 가입한 Member 존재 (일반 회원가입)

[흐름]
카카오 로그인 → OAuthConnection 없음
→ 이메일로 Member 조회 → 있음!
→ 새 OAuthConnection 생성 (기존 Member에 카카오 연결)
→ JWT 토큰 발급
→ 로그인 완료

[코드]
const existingMember = await this.memberRepository.findByEmail(email);

if (existingMember) {
  const connection = OAuthConnection.connect({
    memberId: existingMember.id,
    provider: 'kakao',
    providerId: kakaoId,
    email,
  });
  this.oauthConnectionRepository.save(connection);

  return this.loginExistingMember(existingMember.id);
}

[응답]
{
  "isNewMember": false,
  "accessToken": "eyJhbGci...",
  "refreshToken": "...",
  "memberId": "uuid"
}
```

#### Case 3: 신규 회원 (2단계 가입)

```
[조건]
- OAuthConnection 없음
- 같은 이메일의 Member도 없음
- 완전히 새로운 사용자

[흐름 - 1단계]
카카오 로그인 → OAuthConnection 없음 → Member도 없음
→ 등록 토큰(registrationToken) 발급
→ 카카오에서 받은 이메일, 닉네임과 함께 응답
→ Frontend에서 추가 정보 입력 페이지로 이동

[코드 - 1단계]
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

[응답 - 1단계]
{
  "isNewMember": true,
  "registrationToken": "eyJhbGci...",
  "prefilledData": {
    "email": "user@kakao.com",
    "nickname": "홍길동"
  }
}

[흐름 - 2단계]
사용자가 추가 정보(job, notification, frequency) 입력
→ POST /api/auth/kakao/register 호출
→ 등록 토큰 검증
→ Member 생성 + OAuthConnection 생성
→ JWT 토큰 발급
→ 가입 완료

[코드 - 2단계]
const oauthData = this.registrationTokenService
  .verifyRegistrationToken(registrationToken);

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
  accessToken: accessToken.accessToken,
  refreshToken,
  memberId: result.memberId,
  isNewMember: true,
  nickname: result.member.nickname,
};

[응답 - 2단계]
{
  "accessToken": "eyJhbGci...",
  "refreshToken": "...",
  "accessTokenExpiresIn": 900,
  "memberId": "uuid",
  "isNewMember": true,
  "nickname": "홍길동"
}
```

### 5.3 등록 토큰 (Registration Token) 설명

신규 회원 가입 시 2단계로 나누어 처리하기 위해 등록 토큰을 사용합니다.

```
┌─────────────────────────────────────────────────────────────┐
│                    Registration Token                       │
├─────────────────────────────────────────────────────────────┤
│ 목적: OAuth 정보를 안전하게 임시 저장                              │
│ 형식: JWT (서비스 자체 시크릿으로 서명)                             │
│ 유효기간: 짧음 (예: 10분)                                        │
│ 용도: 추가 정보 입력 후 가입 완료 시 사용                            │
│                                                             │
│ Payload:                                                    │
│ {                                                           │
│   email: "user@kakao.com",                                  │
│   nickname: "홍길동",                                         │
│   provider: "kakao",                                        │
│   providerId: "123456789",                                  │
│   type: "oauth_registration"  // 토큰 타입 구분용               │
│ }                                                           │
└─────────────────────────────────────────────────────────────┘

[왜 등록 토큰을 사용하는가?]

1. 보안: 카카오 정보를 Frontend에 노출하지 않고 안전하게 전달
2. 무결성: JWT 서명으로 변조 방지
3. 유효기간: 만료 시간 설정으로 오래된 요청 차단
4. 검증: Backend에서 토큰 검증 후 안전하게 사용
```

### 5.4 OAuthConnection Aggregate

```typescript
// domain/oauth/oauth.ts

export class OAuthConnection {
  readonly id: string;
  readonly memberId: string;        // 연결된 Member ID
  readonly provider: OAuthProvider; // 'kakao' | 'google' | 'naver'
  readonly providerId: string;      // 카카오 회원번호
  readonly email: string;           // OAuth 제공자의 이메일
  readonly connectedAt: Date;       // 연결 시각

  private constructor(data: OAuthConnectionType) { ... }

  /**
   * 새로운 OAuth 연결 생성
   * Member가 소셜 로그인을 연결할 때 사용
   */
  static connect(request: ConnectOAuthRequest): OAuthConnection {
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
  static of(data: OAuthConnectionType): OAuthConnection {
    return new OAuthConnection(data);
  }
}
```

### 5.5 API 명세 상세

#### GET /api/auth/kakao/url

카카오 인가 URL을 반환합니다.

**Request:**
```
GET /api/auth/kakao/url?state=csrf_token&prompt=login
```

**Query Parameters:**
| 파라미터 | 필수 | 설명 |
|---------|------|------|
| state | 선택 | CSRF 방지용 상태값 |
| prompt | 선택 | 'login' 전달 시 매번 카카오 로그인 요청 |

**Response:**
```json
{
  "url": "https://kauth.kakao.com/oauth/authorize?client_id=abc123&redirect_uri=http://localhost:3000/auth/kakao/callback&response_type=code"
}
```

#### POST /api/auth/kakao/callback

인가 코드로 로그인을 처리합니다.

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
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "550e8400-e29b-41d4-a716-446655440000",
  "accessTokenExpiresIn": 900,
  "memberId": "123e4567-e89b-12d3-a456-426614174000"
}
```

**Response (신규 회원):**
```json
{
  "isNewMember": true,
  "registrationToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "prefilledData": {
    "email": "user@kakao.com",
    "nickname": "홍길동"
  }
}
```

**Error Response:**
```json
{
  "statusCode": 401,
  "message": "카카오 토큰 교환 실패: authorization code not found",
  "error": "Unauthorized"
}
```

#### POST /api/auth/kakao/register

신규 회원 가입을 완료합니다.

**Request:**
```json
{
  "registrationToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "job": "개발자",
  "notification": "EMAIL",
  "frequency": "DAILY"
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "550e8400-e29b-41d4-a716-446655440000",
  "accessTokenExpiresIn": 900,
  "memberId": "123e4567-e89b-12d3-a456-426614174000",
  "isNewMember": true,
  "nickname": "홍길동"
}
```

### 5.6 환경 변수 설정

```env
# .env

# 카카오 OAuth 설정
KAKAO_CLIENT_ID=your_rest_api_key          # 카카오 REST API 키
KAKAO_CLIENT_SECRET=your_client_secret     # 카카오 Client Secret
KAKAO_REDIRECT_URI=http://localhost:3000/auth/kakao/callback

# JWT 설정 (서비스 자체 토큰용)
JWT_SECRET=your_jwt_secret_key
JWT_ACCESS_TOKEN_EXPIRES_IN=15m
```

### 5.7 카카오 개발자 콘솔 설정 체크리스트

```
[ ] 1. 앱 생성
    - Kakao Developers (https://developers.kakao.com) 접속
    - 내 애플리케이션 → 애플리케이션 추가하기

[ ] 2. 앱 키 확인
    - 앱 설정 → 앱 키
    - REST API 키 복사 → KAKAO_CLIENT_ID

[ ] 3. Client Secret 활성화
    - 보안 → Client Secret
    - 코드 생성 → 활성화 상태: 사용함
    - 시크릿 복사 → KAKAO_CLIENT_SECRET

[ ] 4. 플랫폼 등록
    - 앱 설정 → 플랫폼
    - Web 플랫폼 등록
    - 사이트 도메인: http://localhost:3000

[ ] 5. Redirect URI 등록
    - 카카오 로그인 → Redirect URI
    - http://localhost:3000/auth/kakao/callback

[ ] 6. 동의항목 설정 (매우 중요!)
    - 카카오 로그인 → 동의항목
    - 닉네임: 필수 동의 ✅
    - 카카오계정(이메일): 필수 동의 ✅

[ ] 7. 카카오 로그인 활성화
    - 카카오 로그인 → 활성화 설정 → ON
```

### 5.8 Postman 테스트 가이드

#### Step 1: 카카오 인가 URL 조회

```
GET http://localhost:3000/api/auth/kakao/url

Response:
{
  "url": "https://kauth.kakao.com/oauth/authorize?..."
}
```

#### Step 2: 브라우저에서 카카오 로그인

1. Step 1에서 받은 URL을 브라우저에 복사/붙여넣기
2. 카카오 로그인 + 동의
3. 리다이렉트된 URL에서 `code` 파라미터 복사

```
http://localhost:3000/auth/kakao/callback?code=ABC123XYZ...
                                              ↑ 이 부분 복사
```

#### Step 3: 콜백 API 호출

```
POST http://localhost:3000/api/auth/kakao/callback
Content-Type: application/json

{
  "code": "ABC123XYZ..."
}
```

#### Step 4: (신규 회원만) 가입 완료

```
POST http://localhost:3000/api/auth/kakao/register
Content-Type: application/json

{
  "registrationToken": "Step 3에서 받은 토큰",
  "job": "개발자",
  "notification": "EMAIL",
  "frequency": "DAILY"
}
```

#### Step 5: JWT로 보호된 API 테스트

```
GET http://localhost:3000/api/members/me
Authorization: Bearer eyJhbGci...
```

---

## 부록: 자주 발생하는 문제와 해결

| 문제 | 원인 | 해결 방법 |
|------|------|----------|
| `invalid_grant` | 인가 코드 만료(10분) 또는 이미 사용됨 | 새로운 인가 코드 발급 |
| `redirect_uri_mismatch` | Redirect URI 불일치 | 카카오 콘솔과 요청 URI 정확히 일치 확인 |
| `invalid_client` | Client ID 또는 Secret 오류 | .env 값 확인 |
| 이메일 없음 | 동의항목 미설정 | "카카오계정(이메일)" 필수 동의로 설정 |
| 닉네임 없음 | 동의항목 미설정 | "닉네임" 필수 동의로 설정 |
| state 불일치 | CSRF 공격 또는 세션 만료 | 다시 로그인 시도, sessionStorage 확인 |
| 401 Unauthorized | JWT 토큰 만료 | Refresh Token으로 재발급 |

---

## 참고 자료

- [카카오 로그인 REST API 문서](https://developers.kakao.com/docs/latest/ko/kakaologin/rest-api)
- [OAuth 2.0 RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749)
- [카카오 개발자 가이드](https://developers.kakao.com/docs/latest/ko/getting-started/app)
