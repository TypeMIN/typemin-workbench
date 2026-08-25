# Workbench 마이그레이션과 운영

## 출시 범위

- 새 GitHub 저장소의 기능 브랜치에서 두 앱을 통합합니다.
- 새 Vercel `workbench`와 새 Supabase `Workbench`만 사용합니다.
- 기존 앱의 운영 데이터는 복사하지 않습니다.
- 기존 GitHub, Vercel과 Supabase 자원은 새 Production 출시 뒤 7일간 롤백용으로 유지합니다.
- 커스텀 도메인과 기존 URL 리다이렉트는 후속 작업입니다.

## 환경변수

Vercel Preview와 Production에 다음 이름을 설정합니다. 값은 로그와 Git에 남기지 않습니다.

| 이름                                   | 공개 여부       | 출처                    |
| -------------------------------------- | --------------- | ----------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | 공개            | 새 Workbench Supabase   |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 공개            | 새 Workbench Supabase   |
| `SUPABASE_SECRET_KEY`                  | 비밀, 서버 전용 | 새 Workbench Supabase   |
| `WORKBENCH_AUTH_PEPPER`                | 비밀, 서버 전용 | 32바이트 이상 무작위 값 |
| `KAKAO_REST_API_KEY`                   | 비밀, 서버 전용 | 기존 식사 앱 Vercel     |
| `NEXT_PUBLIC_WORLDCUP_SYNC_ENABLED`    | 공개            | 기본값 `false`          |

Edge Function의 `FOOTBALL_DATA_TOKEN`은 현재 설정하지 않습니다. `FOOTBALL_DATA_SEASON`은 함수 기본값 `2026`을 사용하며 토큰 발급 시 secret에도 명시합니다.

기존 Vercel의 `KAKAO_REST_API_KEY`는 `sensitive` 타입이라 Vercel API에서 원문을 다시 읽지 않습니다. 2026-08-25에 Workbench Preview·Production에 새 값을 직접 설정했고, Preview E2E에서 Kakao 장소 검색 API의 성공 응답을 확인했습니다.

## 출시 검증

1. 기능 브랜치 Preview가 `READY`인지 확인합니다.
2. `npm run check`와 `npm run test:e2e`를 통과시킵니다.
3. 홈에서 두 앱으로 이동하고 앱별 metadata, CSS와 API 경계를 확인합니다.
4. 공통 계정의 가입, 로그인, 중복 ID, 잠금, PIN 변경, owner 임시 PIN과 루트 세션 공유를 확인합니다.
5. 식사 앱의 비회원 체험, 식사 프로필 등록, 결정, 피드백과 장소 검색을 확인합니다.
6. 월드컵 기존 참가자 5명, 예측 40건, 완료 경기 32건이 공개되며 참가·예측·관리 UI가 없는지 확인합니다.
7. 직접 테이블 접근 차단, 월드컵 모든 쓰기 RPC·테이블 쓰기 차단과 Edge Function의 `410 Archived`를 확인합니다.
8. Supabase security advisor의 경고와 Vercel runtime error를 해소합니다.
9. `main`에 병합하고 Production의 두 공개 경로가 HTTP 200인지 확인합니다.

테스트가 데이터를 만들었다면 출시 전 정리하고 위 기본 건수를 다시 확인합니다.

## 롤백

출시 후 새 시스템에서 쓰기 오류나 권한 문제가 확인되면 기존 앱 URL을 계속 안내하고 Workbench 배포를 이전 정상 버전으로 롤백합니다. 이 기간에는 기존 저장소, Vercel 프로젝트와 Supabase 프로젝트를 수정하거나 삭제하지 않습니다.

## 안정화 후 백업과 정리

7일 안정화 기간이 끝나면 기존 Supabase 데이터를 삭제하기 전에 [공식 dump 절차](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)로 백업합니다.

```text
/Users/typemin/Backups/typemin-workbench/<date>/
```

- dump 파일은 `openssl` AES-256과 PBKDF2로 암호화합니다.
- dump 목록, 파일 크기와 복호화 가능 여부를 검증합니다.
- 백업과 키는 저장소에 커밋하지 않습니다.
- 검증 뒤에도 사용자의 별도 승인을 받은 경우에만 기존 GitHub 저장소 보관, Vercel 프로젝트 제거와 Supabase 프로젝트 삭제를 진행합니다.
