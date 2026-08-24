# Workbench

`typemin-workbench`는 여러 토이 웹앱을 한곳에서 빠르게 만들고 직접 사용해 보는 개인 개발 공간입니다. 토이 단계에서는 저장소와 인프라를 통합하고, 독립적인 서비스 가치가 생긴 앱만 분리합니다.

## 현재 앱

| 앱               | 경로                   | 상태                                       |
| ---------------- | ---------------------- | ------------------------------------------ |
| 오늘 뭐 먹지?    | `/what-should-eat`     | 마이그레이션 완료                          |
| 월드컵 예측 내기 | `/worldcup-prediction` | 마이그레이션 완료, 자동 경기 동기화 비활성 |

홈 `/`에서 두 앱으로 이동할 수 있습니다. 실제 배포 주소는 Vercel `workbench` 프로젝트의 기본 `.vercel.app` 주소를 사용합니다.

문서에 남아 있는 `https://workbench.example.com/<app-name>`은 커스텀 도메인이 정해지기 전까지의 placeholder이며 실제 호스트가 아닙니다.

## 운영 원칙

토이 단계의 모든 앱은 다음 자원을 공유합니다.

- GitHub 저장소 1개: `TypeMIN/typemin-workbench`
- Next.js 앱 1개: `Workbench`
- Vercel 프로젝트 1개: `workbench`
- Supabase 프로젝트 1개: `Workbench`
- 공개 호스트 1개와 앱별 서브패스

사용자, 데이터, 배포 주기 또는 브랜드를 분리할 실질적 가치가 생기면 해당 앱의 저장소, Vercel, Supabase와 도메인을 함께 독립시킵니다.

## 기술 기준

- Node.js 24.14.1, npm 11.11.0
- Next.js 16.3.0, React 19.2.8
- Tailwind CSS 4.3.3
- Vercel과 Supabase 서울 리전

## 로컬 실행

```bash
npm install
cp .env.example .env.local
npm run dev
```

필요한 환경변수 이름은 `.env.example`에만 기록합니다. 실제 값과 비밀키는 로컬 환경 또는 Vercel에만 저장하고 커밋하지 않습니다.

```bash
npm run check
npm run test:e2e
```

`npm run check`는 포맷, ESLint, TypeScript, Vitest와 프로덕션 빌드를 순서대로 검증합니다.

## 문서

- [아키텍처와 보안 경계](docs/architecture.md)
- [마이그레이션과 운영 절차](docs/migration.md)
