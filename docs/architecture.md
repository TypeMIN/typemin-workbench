# Workbench 아키텍처

이 문서는 `typemin-workbench`의 코드, 배포와 데이터 경계를 정의하는 정본입니다.

## 1. 자원 구성

| 영역         | 이름                            | 구성                                       |
| ------------ | ------------------------------- | ------------------------------------------ |
| GitHub       | `TypeMIN/typemin-workbench`     | 저장소 1개, `main`이 프로덕션              |
| 애플리케이션 | `Workbench`                     | Next.js App Router 앱 1개                  |
| 배포         | `workbench`                     | Vercel 프로젝트 1개, 기능 브랜치는 Preview |
| 백엔드       | `Workbench`                     | Supabase 프로젝트 1개, `ap-northeast-2`    |
| 웹 주소      | `workbench-type-min.vercel.app` | 앱별 최상위 서브패스                       |

`workbench.example.com`은 커스텀 도메인이 정해지기 전까지 문서에서만 쓰는 placeholder입니다.

```mermaid
flowchart TD
    GitHub["GitHub<br/>TypeMIN/typemin-workbench"] --> Next["Next.js 16<br/>Workbench"]
    Next --> Home["/"]
    Next --> Meal["/what-should-eat"]
    Next --> WorldCup["/worldcup-prediction"]
    Next --> Account["/account/*<br/>ID + PIN"]
    GitHub --> Vercel["Vercel<br/>workbench"]
    Vercel --> Host["workbench-type-min.vercel.app"]
    Host --> Home
    Meal --> MealAPI["/what-should-eat/api/*"]
    Account --> AuthAPI["/api/workbench/auth/*"]
    AuthAPI --> ServerSecret["SUPABASE_SECRET_KEY<br/>server only"]
    MealAPI --> ServerSecret
    ServerSecret --> Accounts["workbench_accounts<br/>workbench_sessions"]
    ServerSecret --> Profiles["what_should_eat_profiles"]
    ServerSecret --> MealTables["public.what_should_eat_*"]
    WorldCup --> PublicKey["Supabase publishable key<br/>read only"]
    PublicKey --> RPC["public.worldcup_* RPC wrappers"]
    RPC --> PrivateRPC["private.worldcup_*<br/>SECURITY DEFINER"]
    PrivateRPC --> WorldCupTables["public.worldcup_*"]
    Edge["sync-football-data<br/>410 Archived"] -.-> WorldCupTables
    Supabase["Supabase<br/>Workbench · Seoul"] --> MealTables
    Supabase --> WorldCupTables
```

## 2. 공개 URL과 라우트

| 책임          | 경로                     |
| ------------- | ------------------------ |
| Workbench 홈  | `/`                      |
| 공통 계정     | `/account/*`             |
| 공통 계정 API | `/api/workbench/*`       |
| 식사 앱       | `/what-should-eat`       |
| 월드컵 앱     | `/worldcup-prediction`   |
| 식사 앱 API   | `/what-should-eat/api/*` |

식사 앱 API는 다른 Workbench 앱의 `/api/*`와 충돌하지 않도록 앱 경로 아래에 둡니다. 앱 slug는 소문자 kebab-case, 데이터베이스 접두사는 대응하는 snake_case를 사용합니다.

```text
/restaurant-log -> public.restaurant_log_entries
```

`restaurant-log`는 명명 규칙을 설명하는 예시이며 실제 라우트나 테이블이 아닙니다.

## 3. 코드 경계

```text
typemin-workbench/
├── app/
│   ├── page.tsx
│   ├── what-should-eat/
│   │   ├── api/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── styles.css
│   └── worldcup-prediction/
│       ├── layout.tsx
│       ├── page.tsx
│       └── styles.css
├── components/
│   └── what-should-eat/
├── lib/
│   ├── supabase/
│   ├── what-should-eat/
│   └── worldcup-prediction/
├── supabase/
│   ├── functions/
│   └── migrations/
└── tests/e2e/
```

- `app/<app-name>`에는 앱의 라우트, metadata와 라우트 전용 CSS를 둡니다.
- `components/<app-name>`과 `lib/<app-name>`에는 해당 앱만 사용하는 UI와 도메인 로직을 둡니다.
- `lib/supabase`에는 두 앱이 공유하는 설정과 클라이언트 생성 코드만 둡니다.
- `components/workbench-*`, `lib/workbench`와 `app/account`에는 모든 앱이 공유하는 귀환 링크, 앱 카탈로그와 계정 기능을 둡니다.
- 둘 이상의 앱에서 실제로 같은 책임으로 재사용되는 코드만 루트 공통 모듈로 승격합니다.
- 앱 CSS는 각각 `.what-should-eat-app`, `.worldcup-prediction-app` 아래로 제한합니다.
- 모든 앱은 `WorkbenchHomeLink`와 공통 계정 상태 UI를 헤더에 배치합니다. 새 앱은 `lib/workbench/apps.ts` 카탈로그에 등록하고 카탈로그 기반 E2E로 누락을 검사합니다.
- `workbench_session` 쿠키는 `HttpOnly`, `SameSite=Lax`, Production `Secure`, `Path=/`, 30일 만료를 사용합니다. DB에는 32바이트 원문 토큰이 아니라 SHA-256 해시만 저장합니다.

새 앱은 Next.js App Router의 [공식 프로젝트 구조](https://nextjs.org/docs/app/getting-started/project-structure)에 맞춰 `app/<app-name>/page.tsx`로 추가합니다.

## 4. Supabase 데이터와 권한

두 앱은 Supabase 프로젝트를 공유하지만 Supabase Auth는 사용하지 않습니다. 이메일 가입을 비활성화하고 Workbench 자체 `ID + PIN` 계정을 유일한 인증원으로 사용합니다.

### 공통 계정

- `workbench_accounts`: ID, scrypt PIN 해시, 표시 이름, `member`/`owner` 역할과 잠금 상태
- `workbench_sessions`: 계정별 루트 세션의 토큰 해시와 30일 만료
- `workbench_auth_rate_limits`: `WORKBENCH_AUTH_PEPPER` HMAC으로 익명화한 IP별 제한 버킷
- `what_should_eat_profiles`: 식사 추천에만 필요한 출생연도·성별

PIN은 숫자 4~6자리이며 계정별 5회 실패 시 15분 잠급니다. IP별 로그인은 15분에 30회, 가입은 시간당 5회로 제한합니다. owner가 발급한 임시 6자리 PIN은 기존 세션을 전부 폐기하며 다음 로그인 뒤 PIN 변경을 강제합니다. 유일한 owner 복구는 [관리자 복구 절차](account-recovery.md)를 따릅니다.

### 식사 앱

- `workbench_accounts`와 `workbench_sessions`의 공통 계정 참조
- `what_should_eat_profiles`
- `what_should_eat_decisions`
- `what_should_eat_decision_participants`
- `what_should_eat_place_feedback`
- `what_should_eat_comparisons`

브라우저 역할에는 직접 테이블 권한을 부여하지 않고, Vercel 서버의 `SUPABASE_SECRET_KEY`를 사용하는 API만 접근합니다. 비회원은 저장되지 않는 체험을 계속 사용할 수 있지만 저장·이력·친구 검색·피드백은 공통 계정과 식사 프로필을 모두 요구합니다.

### 월드컵 앱

- `worldcup_settings`: `archived_at`이 설정된 설정 1건
- `worldcup_participants`: 기존 참가자 5명
- `worldcup_matches`: 완료된 경기 32건
- `worldcup_predictions`: 기존 예측 40건
- `worldcup_events`: Realtime 갱신 알림

`anon`은 공개 상태 조회 RPC만 실행할 수 있습니다. 직접 테이블 접근과 참가·예측·관리 RPC 실행 권한은 차단합니다. 테이블 쓰기 트리거도 `archived_at`을 검사하므로 UI 우회나 기존 RPC 호출로 기록을 바꿀 수 없습니다.

기존 참가 PIN과 관리자 `0000` 로그인은 더 이상 인증 인터페이스가 아닙니다. 향후 다른 예측 프로젝트로 기능을 재활성화할 때는 PIN이 아니라 Workbench 계정 권한을 사용합니다.

### 공통 규칙

모든 공개 스키마 테이블은 다음을 같은 마이그레이션에서 정의합니다.

1. 테이블, 제약 조건과 필요한 인덱스
2. RLS 활성화와 앱별 정책
3. `anon`, `authenticated`, `service_role`의 명시적 `GRANT` 또는 `REVOKE`
4. 함수의 실행 주체, `search_path`와 최소 실행 권한

신규 테이블의 Data API 자동 노출을 가정하지 않습니다. 자세한 기준은 [Supabase 변경사항](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)과 [RLS 공식 문서](https://supabase.com/docs/guides/database/postgres/row-level-security)를 따릅니다.

## 5. 경기 데이터 동기화

`supabase/functions/sync-football-data`는 `verify_jwt=true`를 유지하지만 월드컵 프로젝트가 아카이브된 동안 항상 `410 Archived`를 반환합니다. 동기화 UI와 `FOOTBALL_DATA_TOKEN`은 사용하지 않습니다.

재활성화하려면 새 프로젝트 계획과 Workbench 계정 기반 권한을 먼저 구현한 뒤 DB 아카이브 상태, Edge Function 방어와 UI 플래그를 함께 변경해야 합니다.

## 6. 배포 흐름

- GitHub `main`은 Vercel Production에 연결합니다.
- 기능 브랜치의 push와 Pull Request는 Preview 배포를 만듭니다.
- Preview에서 `npm run check`, E2E와 Supabase 권한 검증을 통과한 뒤 `main`에 병합합니다.
- `.vercel/project.json`은 고정 버전 Vercel CLI로 로컬 프로젝트를 연결할 때 만들며 `.vercel/`은 커밋하지 않습니다.
- Supabase 스키마는 `supabase/migrations`의 수동 마이그레이션으로 관리하고 GitHub 기반 DB 브랜칭은 사용하지 않습니다.

## 7. 앱 독립 기준

사용자, 데이터, 배포 주기 또는 브랜드를 Workbench와 분리할 실질적 가치가 생기고 분리 비용보다 독립 가치가 큰 앱만 서비스화합니다.

- [ ] 앱 전용 코드를 새 저장소로 옮기고 공통 코드 의존성을 정리합니다.
- [ ] 앱 전용 Vercel 프로젝트와 환경변수를 만듭니다.
- [ ] 앱 전용 Supabase 프로젝트에 스키마, 정책과 필요한 데이터를 이전합니다.
- [ ] 앱 전용 도메인을 연결하고 기존 서브패스의 리다이렉트를 정의합니다.
- [ ] 새 배포의 인증, 데이터와 주요 사용자 흐름을 검증합니다.
- [ ] 롤백 기간 뒤 Workbench의 이전 코드, 데이터와 비밀키를 제거합니다.

## 8. 마이그레이션 원본

- 식사 앱: `TypeMIN/project-what-should-eat`의 `8d3c6a67db82892520fc7c752b10f724e75b52cd`
- 월드컵 앱: `TypeMIN/worldcup-prediction` PR #1을 squash merge한 `main`의 `d364f2d`

원본 저장소의 루트 템플릿과 에이전트 설정은 가져오지 않았습니다. 기존 운영 데이터도 Workbench로 이전하지 않았습니다.
