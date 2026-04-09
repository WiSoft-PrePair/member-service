# 카카오 OAuth 프론트엔드 구현 가이드

## 목차

1. [전체 흐름 요약](#1-전체-흐름-요약)
2. [리다이렉트 URI 설정](#2-리다이렉트-uri-설정)
3. [프론트엔드 구현](#3-프론트엔드-구현)
4. [체크리스트](#4-체크리스트)

---

## 1. 전체 흐름 요약

백엔드에 이미 구현된 4개의 API를 활용합니다.

```
[사용자] → 카카오 로그인/회원가입 버튼 클릭
   ↓
[FE] GET /api/auth/kakao/url → 카카오 인증 URL 받기
   ↓
[FE] window.location.href = 카카오 인증 URL (브라우저 리다이렉트)
   ↓
[카카오] 로그인/동의 → KAKAO_REDIRECT_URI?code=xxx 로 리다이렉트
   ↓
[FE] /auth/kakao/callback 페이지에서 code 추출
   ↓
[FE] POST /api/auth/kakao/callback { code } → 백엔드로 전달
   ↓
[BE] 코드 교환 → 토큰 발급 → 응답
   ↓
(기존 회원) → { isNewMember: false, accessToken, refreshToken, ... }
            → 토큰 저장 후 /mypage로 자동 이동 (로그인 완료)
(신규 회원) → { isNewMember: true, registrationToken, prefilledData }
            → /auth 페이지의 회원가입 Step 2(직무 선택)로 자동 리다이렉트
   ↓
(신규인 경우) [FE] 추가 정보 입력 후 POST /api/auth/kakao/register
```

### 백엔드 API 정리

| Method | Endpoint | Body | 설명 |
|--------|----------|------|------|
| `GET` | `/api/auth/kakao/url?state=&prompt=` | - | 카카오 인증 URL 반환 `{ url }` |
| `POST` | `/api/auth/kakao/callback` | `{ code, state? }` | 코드 교환 → 로그인 or 회원가입 토큰 반환 |
| `POST` | `/api/auth/kakao/register` | `{ registrationToken, job, notification, frequency }` | 신규 회원 가입 완료 |
| `POST` | `/api/auth/kakao/link` | `{ code, state? }` + JWT | 기존 계정에 카카오 연동 (로그인 필요) |

### callback 응답 형태

```ts
// 기존 회원 → 바로 로그인 처리
{
  accessToken: string
  refreshToken: string
  accessTokenExpiresIn: number
  memberId: string
  isNewMember: false
  nickname: string
}

// 신규 회원 → 회원가입 폼으로 리다이렉트
{
  isNewMember: true
  registrationToken: string   // JWT (유효시간 ~10분)
  prefilledData: {
    email: string
    nickname: string
  }
}
```

### register 요청 형태

```ts
{
  registrationToken: string
  job: string                              // 직업 (Auth.jsx의 signupForm.jobRole에 해당)
  notification: "EMAIL" | "KAKAO" | "BOTH" // 알림 수단 (signupForm.notificationKakao로 결정)
  frequency: "DAILY" | "WEEKLY" | "NONE"   // 알림 빈도 (signupForm.cadence에서 매핑)
}
```

---

## 2. 리다이렉트 URI 설정

OAuth 리다이렉트 URI는 **3곳에서 모두 일치**해야 합니다.

### 2-1. 카카오 개발자 콘솔

1. [Kakao Developers](https://developers.kakao.com) 접속
2. **내 애플리케이션** → 해당 앱 선택
3. **카카오 로그인** → **활성화** ON
4. **Redirect URI** 등록:

```
# 로컬 개발용 (vite.config.js의 server.port: 4173)
http://localhost:4173/auth/kakao/callback

# 배포용
https://prepair.wisoft.dev/auth/kakao/callback
```

5. **동의항목** 설정:
   - `profile_nickname` → **필수 동의**
   - `account_email` → **필수 동의**
   - (카카오톡 메시지 발송이 필요한 경우) `talk_message` → **선택 동의**

### 2-2. 백엔드 `.env`

현재 값: `KAKAO_REDIRECT_URI=http://localhost:3000/auth/kakao/callback`

**이 값을 프론트엔드 주소로 변경해야 합니다:**

```env
# 로컬 개발 시 (Vite dev server 포트 4173)
KAKAO_REDIRECT_URI=http://localhost:4173/auth/kakao/callback

# 배포 시
KAKAO_REDIRECT_URI=https://prepair.wisoft.dev/auth/kakao/callback
```

> **핵심**: 이 URI는 백엔드가 카카오에 보내는 요청에 포함됩니다.
> 카카오가 사용자를 리다이렉트하는 실제 URL이므로 **프론트엔드 주소**여야 합니다.

### 2-3. 프론트엔드 라우트

React Router에 `/auth/kakao/callback` 라우트를 추가해야 합니다 (아래 구현 섹션 참조).

### 리다이렉트 URI 불일치 시 에러

```
KOE006: redirect_uri mismatch
```

이 에러가 나면 3곳(카카오 콘솔, 백엔드 .env, 실제 접속 URL)이 일치하는지 확인하세요.

---

## 3. 프론트엔드 구현

### 3-1. API 유틸리티 추가 (`src/utils/authApi.js`)

기존 `authApi.js`에 카카오 OAuth 관련 함수를 추가합니다. 기존 `handleResponse`/`wrapNetworkError` 헬퍼를 재사용합니다.

```js
// 카카오 인증 URL 가져오기
export async function getKakaoAuthUrl() {
  try {
    const response = await fetch(`${API_BASE}/auth/kakao/url`)
    return handleResponse(response)
  } catch (error) {
    throw wrapNetworkError(error)
  }
}

// 카카오 콜백 처리 (code → 로그인 or 회원가입 토큰)
export async function kakaoCallback(code) {
  try {
    const response = await fetch(`${API_BASE}/auth/kakao/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    return handleResponse(response)
  } catch (error) {
    throw wrapNetworkError(error)
  }
}

// 카카오 신규 회원 가입 완료
export async function kakaoRegister({ registrationToken, job, notification, frequency }) {
  try {
    const response = await fetch(`${API_BASE}/auth/kakao/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ registrationToken, job, notification, frequency }),
    })
    return handleResponse(response)
  } catch (error) {
    throw wrapNetworkError(error)
  }
}

// 기존 계정에 카카오 연동 (로그인 상태에서)
export async function kakaoLink(code, accessToken) {
  try {
    const response = await fetch(`${API_BASE}/auth/kakao/link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ code }),
    })
    return handleResponse(response)
  } catch (error) {
    throw wrapNetworkError(error)
  }
}
```

### 3-2. 콜백 페이지 추가 (`src/pages/KakaoCallback.jsx`)

카카오 리다이렉트 후 `?code=xxx`를 받아 처리하는 페이지입니다.

```jsx
import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { kakaoCallback } from '../utils/authApi'
import { useAppState } from '../context/AppStateContext'

export default function KakaoCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { login } = useAppState()
  const [error, setError] = useState(null)

  useEffect(() => {
    const code = searchParams.get('code')
    const errorParam = searchParams.get('error')

    // 사용자가 동의를 거부한 경우
    if (errorParam) {
      navigate('/auth', { state: { error: '카카오 로그인이 취소되었습니다.' } })
      return
    }

    if (!code) {
      navigate('/auth', { state: { error: '인증 코드가 없습니다.' } })
      return
    }

    handleCallback(code)
  }, [])

  async function handleCallback(code) {
    try {
      const result = await kakaoCallback(code)

      if (result.isNewMember) {
        // 신규 회원 → Auth 페이지의 회원가입 Step 2(직무 선택)로 자동 이동
        navigate('/auth', {
          state: {
            kakaoRegister: true,
            registrationToken: result.registrationToken,
            prefilledData: result.prefilledData, // { email, nickname }
          },
        })
      } else {
        // 기존 회원 → 토큰 저장 후 /mypage로 자동 이동
        localStorage.setItem('accessToken', result.accessToken)
        localStorage.setItem('refreshToken', result.refreshToken)
        login({
          email: result.prefilledData?.email,
          nickname: result.nickname,
          memberId: result.memberId,
        })
        navigate('/mypage', { replace: true })
      }
    } catch (err) {
      setError(err.message)
    }
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>로그인 처리 중 오류가 발생했습니다.</p>
        <p style={{ color: 'red' }}>{error}</p>
        <button onClick={() => navigate('/auth')}>돌아가기</button>
      </div>
    )
  }

  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <p>카카오 로그인 처리 중...</p>
    </div>
  )
}
```

### 3-3. 라우트 등록 (`src/App.jsx`)

```jsx
import KakaoCallback from './pages/KakaoCallback'

// 기존 라우트에 추가 (ProtectedRoute 바깥)
<Route path="auth/kakao/callback" element={<KakaoCallback />} />
```

> 이 라우트는 `ProtectedRoute` 바깥에 위치해야 합니다 (비로그인 상태에서 접근).
> 기존 `<Route path="auth" element={<AuthPage />} />` 근처에 배치하면 됩니다.

### 3-4. Auth.jsx 수정

#### 카카오 로그인/회원가입 버튼 — mock을 실제 API로 교체

기존 `handleKakaoAuth`와 `handleKakaoLogin` 두 함수를 **하나의 함수**로 통합합니다.
카카오 OAuth는 로그인/회원가입 구분 없이 같은 플로우이고, `isNewMember`로 분기됩니다.

```jsx
import { getKakaoAuthUrl, kakaoRegister } from '../utils/authApi'

// 카카오 인증 (로그인 & 회원가입 공통)
// 기존 handleKakaoAuth, handleKakaoLogin 두 함수를 이걸로 교체
const handleKakaoAuth = async () => {
  setIsKakaoAuthenticating(true)
  setError('')

  try {
    const data = await getKakaoAuthUrl()
    // 카카오 로그인 페이지로 전체 리다이렉트
    window.location.href = data.url
  } catch (err) {
    setError(err.message || '카카오 인증 URL을 가져올 수 없습니다.')
    setIsKakaoAuthenticating(false)
  }
}
```

> `handleKakaoLogin`도 같은 `handleKakaoAuth`를 호출하면 됩니다.
> 카카오에서 돌아온 후 callback 페이지에서 기존/신규를 판별합니다.

#### 카카오 콜백에서 신규 회원으로 돌아온 경우

```jsx
useEffect(() => {
  if (location.state?.kakaoRegister) {
    // 카카오 신규 회원 → Step 2(직무 선택)로 바로 이동
    setAuthMethod('kakao')
    setActiveStep(1) // Step 2 (직무 선택) — Step 1은 카카오에서 받은 정보로 자동 채워짐
    setSignupForm((prev) => ({
      ...prev,
      name: location.state.prefilledData.nickname,
      email: location.state.prefilledData.email,
    }))
    setKakaoAuthData({
      name: location.state.prefilledData.nickname,
      email: location.state.prefilledData.email,
      registrationToken: location.state.registrationToken,
    })
    setMode('signup')
  }
}, [location.state])
```

#### 회원가입 완료 시 — kakaoRegister API 호출

기존 `handleSignup` 내부에서 `authMethod === 'kakao'`일 때 분기 처리:

```jsx
const handleSignup = async (e) => {
  e.preventDefault()
  if (!step3Valid) return

  setIsLoading(true)
  setError('')

  try {
    if (authMethod === 'kakao') {
      // 카카오 회원가입
      const result = await kakaoRegister({
        registrationToken: kakaoAuthData.registrationToken,
        job: signupForm.jobRole,
        notification: signupForm.notificationKakao ? 'KAKAO' : 'EMAIL',
        frequency: signupForm.cadence?.id || 'WEEKLY', // cadence preset → frequency 매핑
      })

      localStorage.setItem('accessToken', result.accessToken)
      localStorage.setItem('refreshToken', result.refreshToken)
      login({
        email: signupForm.email,
        nickname: signupForm.name,
        memberId: result.memberId,
      })
      navigate('/mypage', { replace: true })
    } else {
      // 기존 이메일 회원가입
      await signup(signupForm)
      navigate('/mypage', { replace: true })
    }
  } catch (err) {
    setError(err.message || '회원가입에 실패했습니다.')
  } finally {
    setIsLoading(false)
  }
}
```

### 3-5. 필드 매핑 참고

| Auth.jsx (프론트) | register API (백엔드) | 설명 |
|---|---|---|
| `signupForm.jobRole` | `job` | 직업/직무 |
| `signupForm.notificationKakao` | `notification` | `true` → `"KAKAO"`, `false` → `"EMAIL"`, 둘다 → `"BOTH"` |
| `signupForm.cadence?.id` | `frequency` | `"DAILY"` / `"WEEKLY"` / `"NONE"` |
| `kakaoAuthData.registrationToken` | `registrationToken` | 콜백에서 받은 JWT |

---

## 4. 체크리스트

### 설정 관련

- [ ] **카카오 개발자 콘솔**에 Redirect URI 등록 (`http://localhost:4173/auth/kakao/callback`)
- [ ] **카카오 개발자 콘솔**에서 동의항목 설정 (`profile_nickname`, `account_email` 필수)
- [ ] **백엔드 `.env`**의 `KAKAO_REDIRECT_URI` 값을 프론트엔드 주소로 변경
- [ ] 배포 환경에서는 Redirect URI를 프로덕션 URL로 변경

### 프론트엔드 코드

- [ ] `src/utils/authApi.js`에 카카오 API 함수 추가 (`getKakaoAuthUrl`, `kakaoCallback`, `kakaoRegister`, `kakaoLink`)
- [ ] `src/pages/KakaoCallback.jsx` 콜백 페이지 생성
- [ ] `src/App.jsx`에 `/auth/kakao/callback` 라우트 추가 (ProtectedRoute 바깥)
- [ ] `src/pages/Auth.jsx`의 mock 카카오 함수(`handleKakaoAuth`, `handleKakaoLogin`)를 실제 API 호출로 교체
- [ ] `Auth.jsx`에 `location.state.kakaoRegister` 처리 추가 (신규 회원 → Step 2 자동 이동)
- [ ] `handleSignup`에서 `authMethod === 'kakao'`일 때 `kakaoRegister` API 호출 분기 추가
- [ ] 기존 회원 → 토큰 저장 → `/mypage` 이동

### 삭제할 코드

- [ ] `Auth.jsx`의 mock `handleKakaoAuth` (setTimeout + 모의 데이터 부분)
- [ ] `Auth.jsx`의 mock `handleKakaoLogin` (setTimeout + 모의 로그인 부분)
- [ ] 카카오 알림 모달 (`showKakaoNotificationModal`) — 알림 설정은 Step 3에서 처리

### 토큰 관리 (추가 권장)

- [ ] accessToken을 메모리 또는 httpOnly cookie로 관리 (localStorage는 XSS 취약)
- [ ] refreshToken으로 accessToken 갱신 로직 추가
- [ ] API 요청 시 `Authorization: Bearer <accessToken>` 헤더 자동 첨부

### 배포 시 추가 확인

- [ ] Vite proxy 설정이 아닌 실제 백엔드 URL로 API 요청 경로 설정
- [ ] HTTPS 적용 (카카오는 프로덕션에서 HTTPS 필수)
- [ ] 카카오 앱 상태를 **활성화**(라이브)로 전환
