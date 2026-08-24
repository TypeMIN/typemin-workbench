# Workbench

`typemin-workbench`는 여러 토이 웹앱을 한곳에서 빠르게 만들고 직접 사용해 보는 개인 개발 공간입니다.

초기에는 저장소와 인프라를 최대한 통합하고, 실제 서비스로 성장할 가치가 생긴 앱만 독립시킵니다.

## 운영 원칙

토이 단계의 모든 앱은 다음 자원을 공유합니다.

- GitHub 저장소 1개: `typemin-workbench`
- Next.js 앱 1개: `Workbench`
- Vercel 프로젝트 1개: `Workbench`
- Supabase 프로젝트 1개: `Workbench`
- 도메인 1개

각 토이 앱은 별도 서비스나 서브도메인이 아니라 하나의 도메인 아래 서브패스로 제공합니다.

```text
https://workbench.example.com/
https://workbench.example.com/<app-name>
```

`workbench.example.com`은 실제 도메인이 정해지기 전까지 사용하는 placeholder입니다.

## 앱 추가 방식

앱은 Next.js App Router의 라우트 세그먼트로 추가합니다.

```text
app/<app-name>/page.tsx
```

예를 들어 URL slug가 `restaurant-log`라면 경로는 `/restaurant-log`가 됩니다. 앱별 Supabase 테이블은 같은 이름을 snake_case 접두사로 바꿔 `restaurant_log_entries`처럼 구분합니다.

`restaurant`, `travel`, `photo`, `unword`는 구조를 설명하기 위한 예시이며 현재 생성된 앱이나 라우트가 아닙니다.

## 서비스화

사용자, 데이터, 배포 주기 또는 브랜드를 Workbench와 분리할 실질적 가치가 생긴 앱은 저장소, Vercel 프로젝트, Supabase 프로젝트, 도메인을 모두 독립시킵니다.

전체 구조와 운영 규칙은 [아키텍처 문서](docs/architecture.md)를 기준으로 합니다.
