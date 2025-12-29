# Implementation Plan: PrePair Backend (Full Stack)

**Status**: 📋 Planning
**Started**: 2024-12-24
**Last Updated**: 2024-12-24
**Architecture**: Hexagonal Architecture + Domain-Driven Design (DDD)

---

**⚠️ CRITICAL INSTRUCTIONS**: After completing each phase:
1. ✅ Check off completed task checkboxes
2. 🧪 Run all quality gate validation commands
3. ⚠️ Verify ALL quality gate items pass
4. 📅 Update "Last Updated" date above
5. 📝 Document learnings in Notes section
6. ➡️ Only then proceed to next phase

⛔ **DO NOT skip quality gates or proceed with failing checks**

---

## 📋 Overview

### Feature Description
PrePair 서비스의 전체 백엔드 API 구현. AI 면접 준비 서비스로, 사용자 인증, 면접 질문/피드백, 리워드 시스템을 포함합니다.

### Success Criteria
- [ ] 모든 프론트엔드 API 엔드포인트 구현 완료
- [ ] JWT 기반 인증 시스템 동작
- [ ] 헥사고날 아키텍처 원칙 준수
- [ ] 테스트 커버리지 80% 이상
- [ ] API 문서화 완료 (Swagger/OpenAPI)

### User Impact
- 사용자가 회원가입/로그인하여 서비스 이용 가능
- AI 기반 면접 질문 및 피드백 제공
- 포인트 적립 및 리워드 교환 가능

---

## 🏗️ Architecture Decisions

### 헥사고날 아키텍처 레이어 구조

```
src/
├── adapter/                    # 🔌 Driving/Driven Adapters
│   ├── {domain}/
│   │   ├── api/               # Driving: REST Controllers, DTOs
│   │   ├── persistence/       # Driven: Repository Implementations
│   │   └── security/          # Driven: Security Implementations
│   └── common/                # Shared adapters (Guards, Filters)
│
├── application/               # 📦 Application Services (Use Cases)
│   ├── {domain}/
│   │   ├── {use-case}.service.ts
│   │   └── port/              # Ports (interfaces)
│   │       ├── in/            # Input ports (use case interfaces)
│   │       └── out/           # Output ports (repository interfaces)
│   └── common/                # Shared services
│
├── domain/                    # 💎 Domain Layer (Pure Business Logic)
│   ├── {domain}/
│   │   ├── {aggregate}.ts     # Aggregate Root
│   │   ├── value-objects/     # Value Objects
│   │   ├── enums/             # Domain Enums
│   │   ├── exception/         # Domain Exceptions
│   │   └── event/             # Domain Events (optional)
│   └── common/                # Shared domain logic
│
└── config/                    # ⚙️ Configuration
```

### 주요 아키텍처 결정

| Decision | Rationale | Trade-offs |
|----------|-----------|------------|
| 헥사고날 아키텍처 | 도메인 로직 격리, 테스트 용이성, 유연한 인프라 교체 | 초기 보일러플레이트 증가, 학습 곡선 |
| MikroORM | TypeScript 친화적, 데이터 매퍼 패턴, 성능 최적화 | Prisma 대비 커뮤니티 작음 |
| JWT (Access + Refresh) | Stateless 인증, 확장성 | 토큰 탈취 시 대응 복잡 |
| CQRS-lite | 읽기/쓰기 분리로 성능 최적화 가능 | 복잡도 증가 |

---

## 📦 Dependencies

### Required Before Starting
- [ ] Node.js 20+ / Bun 설치
- [ ] PostgreSQL 데이터베이스 준비
- [ ] 환경변수 설정 (.env)

### External Dependencies
- NestJS v10+
- MikroORM v6+
- @nestjs/jwt, passport-jwt
- class-validator, class-transformer
- bcrypt 또는 argon2

---

## 🧪 Test Strategy

### Testing Approach
**TDD Principle**: Write tests FIRST, then implement to make them pass

### Test Pyramid for This Feature
| Test Type | Coverage Target | Purpose |
|-----------|-----------------|---------|
| **Unit Tests** | ≥80% | Domain logic, Value Objects, Services |
| **Integration Tests** | Critical paths | Repository, API endpoints |
| **E2E Tests** | Key user flows | 인증 플로우, 면접 플로우 |

### Test File Organization
```
test/
├── unit/
│   ├── domain/
│   │   ├── member/
│   │   ├── interview/
│   │   └── reward/
│   └── application/
├── integration/
│   ├── member/
│   ├── interview/
│   └── reward/
└── e2e/
    ├── auth.e2e-spec.ts
    └── interview.e2e-spec.ts
```

---

## 🚀 Implementation Phases

---

### Phase 1: 공통 인프라 및 인증 기반 구축
**Goal**: JWT 인증 시스템, 공통 예외 처리, Guard 구현
**Estimated Time**: 4 hours
**Status**: ⏳ Pending

#### Tasks

**🔴 RED: Write Failing Tests First**
- [ ] **Test 1.1**: JWT 토큰 생성/검증 유닛 테스트
  - File(s): `test/unit/application/auth/jwt-token.service.spec.ts`
  - Expected: Tests FAIL - JwtTokenService 미구현
  - Details:
    - Access Token 생성 테스트
    - Refresh Token 생성 테스트
    - 토큰 검증 성공/실패 테스트
    - 만료 토큰 테스트

- [ ] **Test 1.2**: AuthGuard 통합 테스트
  - File(s): `test/integration/auth/auth.guard.spec.ts`
  - Expected: Tests FAIL - Guard 미구현
  - Details:
    - 유효한 토큰으로 접근 허용
    - 토큰 없이 접근 거부 (401)
    - 만료된 토큰 접근 거부

**🟢 GREEN: Implement to Make Tests Pass**
- [ ] **Task 1.3**: 공통 인프라 구현
  - File(s):
    - `src/adapter/common/filter/http-exception.filter.ts`
    - `src/adapter/common/interceptor/logging.interceptor.ts`
    - `src/adapter/common/decorator/current-user.decorator.ts`
  - Goal: 공통 예외 처리, 로깅, 데코레이터 구현

- [ ] **Task 1.4**: JWT 인증 시스템 구현
  - File(s):
    - `src/application/auth/jwt-token.service.ts`
    - `src/application/auth/port/in/jwt-token.port.ts`
    - `src/adapter/auth/security/jwt.strategy.ts`
    - `src/adapter/common/guard/jwt-auth.guard.ts`
  - Goal: JWT 토큰 서비스 및 Passport 전략 구현

- [ ] **Task 1.5**: Auth 모듈 설정
  - File(s):
    - `src/adapter/auth/auth.module.ts`
    - `src/config/jwt.config.ts`
  - Goal: NestJS 모듈 구성 및 JWT 설정

**🔵 REFACTOR: Clean Up Code**
- [ ] **Task 1.6**: 리팩토링
  - [ ] 토큰 관련 상수 분리
  - [ ] 에러 메시지 상수화
  - [ ] Guard 재사용성 개선

#### Quality Gate ✋

**TDD Compliance**:
- [ ] Tests written FIRST and initially failed
- [ ] Production code written to make tests pass
- [ ] Code improved while tests still pass
- [ ] Coverage: ≥80% for auth services

**Validation Commands**:
```bash
# Test Commands
bun test test/unit/application/auth
bun test test/integration/auth

# Coverage Check
bun test --coverage

# Code Quality
bun run lint
bun run type-check

# Build Verification
bun run build
```

**Manual Test Checklist**:
- [ ] JWT 토큰 생성 확인 (Postman/Insomnia)
- [ ] Protected endpoint 접근 테스트
- [ ] 토큰 만료 후 401 응답 확인

---

### Phase 2: Member 도메인 완성 (인증 API 포함)
**Goal**: 로그인, 회원가입, 프로필 조회/수정 API 완성
**Estimated Time**: 4 hours
**Status**: ⏳ Pending

#### Tasks

**🔴 RED: Write Failing Tests First**
- [ ] **Test 2.1**: Member 도메인 유닛 테스트 확장
  - File(s): `test/unit/domain/member/member.spec.ts`
  - Expected: Tests FAIL
  - Details:
    - Member.login() 메서드 테스트
    - 프로필 업데이트 테스트
    - 비밀번호 변경 테스트

- [ ] **Test 2.2**: 인증 API 통합 테스트
  - File(s): `test/integration/member/auth-api.spec.ts`
  - Expected: Tests FAIL
  - Details:
    - `POST /api/auth/signup` 회원가입
    - `POST /api/auth/login` 로그인
    - `POST /api/auth/password/find` 비밀번호 찾기

- [ ] **Test 2.3**: 회원 API 통합 테스트
  - File(s): `test/integration/member/member-api.spec.ts`
  - Expected: Tests FAIL
  - Details:
    - `GET /api/users/:id/summary` 사용자 요약
    - `PATCH /api/users/:id` 프로필 수정

**🟢 GREEN: Implement to Make Tests Pass**
- [ ] **Task 2.4**: Member 도메인 확장
  - File(s):
    - `src/domain/member/member.ts` (확장)
    - `src/domain/member/value-objects/nickname.ts`
  - Goal: 로그인 검증, 프로필 수정 도메인 로직

- [ ] **Task 2.5**: 인증 Use Cases 구현
  - File(s):
    - `src/application/member/login-member.service.ts`
    - `src/application/member/find-password.service.ts`
    - `src/application/member/port/in/login-member.port.ts`
  - Goal: 로그인, 비밀번호 찾기 유스케이스

- [ ] **Task 2.6**: 회원 Use Cases 구현
  - File(s):
    - `src/application/member/get-member-summary.service.ts`
    - `src/application/member/update-member-profile.service.ts`
  - Goal: 프로필 조회/수정 유스케이스

- [ ] **Task 2.7**: 인증 API Controller
  - File(s):
    - `src/adapter/member/api/auth.controller.ts`
    - `src/adapter/member/api/dto/login-request.dto.ts`
    - `src/adapter/member/api/dto/login-response.dto.ts`
  - Goal: 인증 관련 REST API 엔드포인트

- [ ] **Task 2.8**: 회원 API Controller 확장
  - File(s):
    - `src/adapter/member/api/member.controller.ts` (확장)
    - `src/adapter/member/api/dto/member-summary.dto.ts`
    - `src/adapter/member/api/dto/update-profile.dto.ts`
  - Goal: 회원 관련 REST API 엔드포인트

**🔵 REFACTOR: Clean Up Code**
- [ ] **Task 2.9**: 리팩토링
  - [ ] DTO 검증 로직 정리
  - [ ] 에러 핸들링 개선
  - [ ] 응답 형식 통일

#### Quality Gate ✋

**TDD Compliance**:
- [ ] Red-Green-Refactor cycle followed
- [ ] Coverage: ≥80% for member domain & services

**Validation Commands**:
```bash
bun test test/unit/domain/member
bun test test/integration/member
bun run lint && bun run type-check && bun run build
```

**Manual Test Checklist**:
- [ ] 회원가입 → 로그인 플로우 테스트
- [ ] 프로필 조회/수정 테스트
- [ ] 잘못된 비밀번호로 로그인 시도 (401)

---

### Phase 3: Reward 도메인 구축
**Goal**: 리워드 엔티티, 포인트 시스템, 교환 로직 구현
**Estimated Time**: 4 hours
**Status**: ⏳ Pending

#### Tasks

**🔴 RED: Write Failing Tests First**
- [ ] **Test 3.1**: Reward 도메인 유닛 테스트
  - File(s): `test/unit/domain/reward/reward.spec.ts`
  - Expected: Tests FAIL
  - Details:
    - Reward 엔티티 생성
    - Point 값 객체 테스트
    - 리워드 교환 가능 여부 검증

- [ ] **Test 3.2**: Redemption 도메인 유닛 테스트
  - File(s): `test/unit/domain/reward/redemption.spec.ts`
  - Expected: Tests FAIL
  - Details:
    - 리워드 교환 기록 생성
    - 포인트 차감 로직

- [ ] **Test 3.3**: Reward API 통합 테스트
  - File(s): `test/integration/reward/reward-api.spec.ts`
  - Expected: Tests FAIL
  - Details:
    - `GET /api/rewards` 목록 조회
    - `POST /api/rewards/redeem` 교환
    - `GET /api/rewards/history` 내역 조회

**🟢 GREEN: Implement to Make Tests Pass**
- [ ] **Task 3.4**: Reward 도메인 모델 생성
  - File(s):
    - `src/domain/reward/reward.ts`
    - `src/domain/reward/redemption.ts`
    - `src/domain/reward/value-objects/point.ts`
    - `src/domain/reward/reward.repository.ts`
    - `src/domain/reward/redemption.repository.ts`
  - Goal: 리워드 도메인 엔티티 및 리포지토리 인터페이스

- [ ] **Task 3.5**: Reward Use Cases 구현
  - File(s):
    - `src/application/reward/get-rewards.service.ts`
    - `src/application/reward/redeem-reward.service.ts`
    - `src/application/reward/get-redemption-history.service.ts`
  - Goal: 리워드 관련 유스케이스

- [ ] **Task 3.6**: Reward Persistence Adapter
  - File(s):
    - `src/adapter/reward/persistence/mikro-orm/reward.entity.ts`
    - `src/adapter/reward/persistence/mikro-orm/redemption.entity.ts`
    - `src/adapter/reward/persistence/mikro-orm/reward.repository-impl.ts`
    - `src/adapter/reward/persistence/mikro-orm/mapper/reward.mapper.ts`
  - Goal: MikroORM 엔티티 및 리포지토리 구현

- [ ] **Task 3.7**: Reward API Controller
  - File(s):
    - `src/adapter/reward/api/reward.controller.ts`
    - `src/adapter/reward/api/dto/reward-response.dto.ts`
    - `src/adapter/reward/api/dto/redeem-request.dto.ts`
  - Goal: 리워드 REST API 엔드포인트

- [ ] **Task 3.8**: Reward 모듈 구성
  - File(s):
    - `src/adapter/reward/reward.module.ts`
  - Goal: NestJS 모듈 설정

**🔵 REFACTOR: Clean Up Code**
- [ ] **Task 3.9**: 리팩토링
  - [ ] 포인트 계산 로직 캡슐화
  - [ ] 트랜잭션 처리 개선
  - [ ] 중복 코드 제거

#### Quality Gate ✋

**TDD Compliance**:
- [ ] Red-Green-Refactor cycle followed
- [ ] Coverage: ≥80% for reward domain

**Validation Commands**:
```bash
bun test test/unit/domain/reward
bun test test/integration/reward
bun run lint && bun run type-check && bun run build
```

**Manual Test Checklist**:
- [ ] 리워드 목록 조회
- [ ] 포인트 부족 시 교환 실패 (400)
- [ ] 교환 성공 및 히스토리 확인

---

### Phase 4: Interview 도메인 기반 구축
**Goal**: 면접 질문, 히스토리 엔티티 및 기본 CRUD 구현
**Estimated Time**: 4 hours
**Status**: ⏳ Pending

#### Tasks

**🔴 RED: Write Failing Tests First**
- [ ] **Test 4.1**: Interview Question 도메인 테스트
  - File(s): `test/unit/domain/interview/question.spec.ts`
  - Expected: Tests FAIL
  - Details:
    - Question 엔티티 생성
    - 직무별 질문 필터링
    - 난이도 검증

- [ ] **Test 4.2**: Interview History 도메인 테스트
  - File(s): `test/unit/domain/interview/history.spec.ts`
  - Expected: Tests FAIL
  - Details:
    - History 엔티티 생성
    - 답변 제출
    - 피드백 추가

- [ ] **Test 4.3**: Interview API 통합 테스트 (기본)
  - File(s): `test/integration/interview/interview-api.spec.ts`
  - Expected: Tests FAIL
  - Details:
    - `GET /api/interview/today` 오늘의 질문
    - `GET /api/interview/histories` 히스토리 목록
    - `GET /api/interview/histories/:id` 히스토리 상세

**🟢 GREEN: Implement to Make Tests Pass**
- [ ] **Task 4.4**: Interview 도메인 모델 생성
  - File(s):
    - `src/domain/interview/question.ts`
    - `src/domain/interview/history.ts`
    - `src/domain/interview/value-objects/answer.ts`
    - `src/domain/interview/value-objects/feedback.ts`
    - `src/domain/interview/enums/difficulty.enum.ts`
    - `src/domain/interview/question.repository.ts`
    - `src/domain/interview/history.repository.ts`
  - Goal: 면접 도메인 엔티티 및 값 객체

- [ ] **Task 4.5**: Interview Use Cases 구현 (기본)
  - File(s):
    - `src/application/interview/get-today-question.service.ts`
    - `src/application/interview/get-interview-histories.service.ts`
    - `src/application/interview/get-interview-history-detail.service.ts`
  - Goal: 기본 조회 유스케이스

- [ ] **Task 4.6**: Interview Persistence Adapter
  - File(s):
    - `src/adapter/interview/persistence/mikro-orm/question.entity.ts`
    - `src/adapter/interview/persistence/mikro-orm/history.entity.ts`
    - `src/adapter/interview/persistence/mikro-orm/question.repository-impl.ts`
    - `src/adapter/interview/persistence/mikro-orm/history.repository-impl.ts`
    - `src/adapter/interview/persistence/mikro-orm/mapper/interview.mapper.ts`
  - Goal: MikroORM 엔티티 및 리포지토리 구현

- [ ] **Task 4.7**: Interview API Controller (기본)
  - File(s):
    - `src/adapter/interview/api/interview.controller.ts`
    - `src/adapter/interview/api/dto/question-response.dto.ts`
    - `src/adapter/interview/api/dto/history-response.dto.ts`
  - Goal: 기본 REST API 엔드포인트

- [ ] **Task 4.8**: Interview 모듈 구성
  - File(s):
    - `src/adapter/interview/interview.module.ts`
  - Goal: NestJS 모듈 설정

**🔵 REFACTOR: Clean Up Code**
- [ ] **Task 4.9**: 리팩토링
  - [ ] 질문 선택 알고리즘 분리
  - [ ] 매퍼 로직 정리
  - [ ] DTO 응답 형식 통일

#### Quality Gate ✋

**TDD Compliance**:
- [ ] Red-Green-Refactor cycle followed
- [ ] Coverage: ≥80% for interview domain

**Validation Commands**:
```bash
bun test test/unit/domain/interview
bun test test/integration/interview
bun run lint && bun run type-check && bun run build
```

**Manual Test Checklist**:
- [ ] 오늘의 질문 조회
- [ ] 히스토리 목록/상세 조회
- [ ] 인증 없이 접근 시 401

---

### Phase 5: Interview AI 통합 (피드백 & 추천 답변)
**Goal**: AI 기반 피드백 생성, 추천 답변, 요약 기능 구현
**Estimated Time**: 4 hours
**Status**: ⏳ Pending

#### Tasks

**🔴 RED: Write Failing Tests First**
- [ ] **Test 5.1**: AI 피드백 서비스 테스트
  - File(s): `test/unit/application/interview/feedback.service.spec.ts`
  - Expected: Tests FAIL
  - Details:
    - 피드백 생성 테스트 (Mock AI)
    - 피드백 저장 테스트
    - 점수 계산 로직

- [ ] **Test 5.2**: AI 추천 답변 서비스 테스트
  - File(s): `test/unit/application/interview/suggest-answer.service.spec.ts`
  - Expected: Tests FAIL
  - Details:
    - 추천 답변 생성 테스트 (Mock AI)
    - 질문 기반 컨텍스트 구성

- [ ] **Test 5.3**: AI 통합 API 테스트
  - File(s): `test/integration/interview/interview-ai-api.spec.ts`
  - Expected: Tests FAIL
  - Details:
    - `POST /api/interview/:id/feedback` 피드백 생성
    - `POST /api/interview/suggest` 추천 답변
    - `GET /api/interview/summary` 요약

**🟢 GREEN: Implement to Make Tests Pass**
- [ ] **Task 5.4**: AI Provider Adapter 구현
  - File(s):
    - `src/application/interview/port/out/ai-provider.port.ts`
    - `src/adapter/interview/ai/openai-provider.adapter.ts`
    - `src/adapter/interview/ai/ai.module.ts`
  - Goal: AI 서비스 통합 (OpenAI/Claude)

- [ ] **Task 5.5**: 피드백 Use Case 구현
  - File(s):
    - `src/application/interview/generate-feedback.service.ts`
    - `src/domain/interview/value-objects/score.ts`
  - Goal: 피드백 생성 및 점수 계산

- [ ] **Task 5.6**: 추천 답변 Use Case 구현
  - File(s):
    - `src/application/interview/suggest-answer.service.ts`
  - Goal: AI 기반 추천 답변 생성

- [ ] **Task 5.7**: 요약 Use Case 구현
  - File(s):
    - `src/application/interview/get-summary-feedback.service.ts`
  - Goal: 전체 면접 요약 피드백

- [ ] **Task 5.8**: Interview API Controller 확장
  - File(s):
    - `src/adapter/interview/api/interview.controller.ts` (확장)
    - `src/adapter/interview/api/dto/feedback-request.dto.ts`
    - `src/adapter/interview/api/dto/feedback-response.dto.ts`
    - `src/adapter/interview/api/dto/suggest-request.dto.ts`
  - Goal: AI 관련 REST API 엔드포인트

**🔵 REFACTOR: Clean Up Code**
- [ ] **Task 5.9**: 리팩토링
  - [ ] AI Provider 추상화 개선
  - [ ] 프롬프트 템플릿 분리
  - [ ] 에러 핸들링 강화

#### Quality Gate ✋

**TDD Compliance**:
- [ ] Red-Green-Refactor cycle followed
- [ ] AI Provider Mock 테스트 완료
- [ ] Coverage: ≥80%

**Validation Commands**:
```bash
bun test test/unit/application/interview
bun test test/integration/interview
bun run lint && bun run type-check && bun run build
```

**Manual Test Checklist**:
- [ ] 답변 제출 후 피드백 수신
- [ ] 추천 답변 생성 (AI API 호출)
- [ ] 요약 피드백 조회

---

### Phase 6: 통합 테스트, 문서화 및 최적화
**Goal**: E2E 테스트, API 문서화, 성능 최적화
**Estimated Time**: 3 hours
**Status**: ⏳ Pending

#### Tasks

**🔴 RED: Write Failing Tests First**
- [ ] **Test 6.1**: E2E 인증 플로우 테스트
  - File(s): `test/e2e/auth.e2e-spec.ts`
  - Expected: Tests FAIL (if any flow broken)
  - Details:
    - 회원가입 → 로그인 → 토큰 갱신 → 로그아웃

- [ ] **Test 6.2**: E2E 면접 플로우 테스트
  - File(s): `test/e2e/interview.e2e-spec.ts`
  - Expected: Tests FAIL (if any flow broken)
  - Details:
    - 로그인 → 오늘 질문 → 답변 제출 → 피드백 수신

**🟢 GREEN: Implement to Make Tests Pass**
- [ ] **Task 6.3**: Swagger/OpenAPI 문서화
  - File(s):
    - `src/config/swagger.config.ts`
    - 각 Controller에 `@ApiTags`, `@ApiOperation` 추가
  - Goal: API 문서 자동 생성

- [ ] **Task 6.4**: 성능 최적화
  - File(s):
    - 필요한 곳에 캐싱 추가
    - N+1 쿼리 최적화
  - Goal: 응답 시간 개선

- [ ] **Task 6.5**: 에러 핸들링 통합
  - File(s):
    - `src/adapter/common/filter/all-exception.filter.ts`
    - 각 도메인 예외 클래스 정리
  - Goal: 일관된 에러 응답 형식

- [ ] **Task 6.6**: 환경 설정 정리
  - File(s):
    - `src/config/env.validation.ts`
    - `.env.example` 업데이트
  - Goal: 환경 변수 검증 및 문서화

**🔵 REFACTOR: Clean Up Code**
- [ ] **Task 6.7**: 최종 리팩토링
  - [ ] 미사용 코드 제거
  - [ ] 코드 스타일 통일
  - [ ] 주석 및 문서 정리

#### Quality Gate ✋

**Final Validation**:
- [ ] 모든 E2E 테스트 통과
- [ ] API 문서 접근 가능 (/api/docs)
- [ ] 전체 테스트 커버리지 80% 이상
- [ ] Lint/Type 에러 없음

**Validation Commands**:
```bash
# Full Test Suite
bun test

# E2E Tests
bun test:e2e

# Coverage Report
bun test --coverage

# All Quality Checks
bun run lint && bun run type-check && bun run build

# API Docs (start server and check)
bun run start:dev
# Open: http://localhost:3000/api/docs
```

---

## ⚠️ Risk Assessment

| Risk | Probability | Impact | Mitigation Strategy |
|------|-------------|--------|---------------------|
| AI API 호출 실패 | Medium | High | Retry 로직, Fallback 응답, Mock 모드 |
| JWT 보안 취약점 | Low | High | 보안 모범 사례 적용, 짧은 토큰 만료 |
| DB 마이그레이션 이슈 | Medium | Medium | 마이그레이션 스크립트 테스트, 롤백 계획 |
| 성능 저하 (AI 응답) | Medium | Medium | 비동기 처리, 캐싱, 타임아웃 설정 |

---

## 🔄 Rollback Strategy

### If Phase 1 Fails
- JWT 설정 롤백
- 기존 인증 없는 상태로 복원

### If Phase 2-3 Fails
- Git으로 이전 커밋 복원
- DB 마이그레이션 롤백: `bun mikro-orm migration:down`

### If Phase 4-5 Fails
- Interview 모듈 제거
- 관련 DB 테이블 드롭

### If Phase 6 Fails
- 문서화/최적화 코드만 롤백
- 핵심 기능에는 영향 없음

---

## 📊 Progress Tracking

### Completion Status
- **Phase 1 (인프라/인증)**: ⏳ 0%
- **Phase 2 (Member)**: ⏳ 0%
- **Phase 3 (Reward)**: ⏳ 0%
- **Phase 4 (Interview 기본)**: ⏳ 0%
- **Phase 5 (Interview AI)**: ⏳ 0%
- **Phase 6 (통합/문서화)**: ⏳ 0%

**Overall Progress**: 0% complete

---

## 📝 Notes & Learnings

### Implementation Notes
- (작업 중 발견한 인사이트 기록)

### Blockers Encountered
- (발생한 블로커와 해결 방법 기록)

### Improvements for Future Plans
- (다음 계획을 위한 개선점 기록)

---

## 📚 References

### Documentation
- [NestJS Documentation](https://docs.nestjs.com/)
- [MikroORM Documentation](https://mikro-orm.io/docs)
- [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/)

### Related Files
- `src/domain/member/` - 현재 Member 도메인 구현
- `src/adapter/member/` - Member 어댑터 구현

---

## ✅ Final Checklist

**Before marking plan as COMPLETE**:
- [ ] All phases completed with quality gates passed
- [ ] Full integration testing performed
- [ ] API documentation complete (Swagger)
- [ ] Test coverage ≥80%
- [ ] Security review completed (JWT, Password hashing)
- [ ] All frontend API endpoints implemented
- [ ] Plan document archived for future reference

---

**Plan Status**: 📋 Planning
**Next Action**: 사용자 승인 후 Phase 1 시작
**Blocked By**: None
