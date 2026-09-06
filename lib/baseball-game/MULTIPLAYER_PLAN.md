# 야구 게임 멀티플레이·파티플레이 구현 계획

## 구현 현황 — 2026-09-06

- 완료: 두 기기용 방 생성·홈팀 참가·HTTP 전용 좌석 쿠키
- 완료: 서버 권위형 주사위·카드 행동과 revision 충돌·중복 요청 방지
- 완료: 좌석별 `GameView`와 상대 손패·RNG 비노출
- 완료: Supabase 경기·좌석·행동 로그 및 서버 전용 RLS
- 완료: 0.9초 동기화와 재접속
- 다음: 폴링을 비공개 Realtime 알림으로 교체
- 다음: 파티플레이 공용 화면과 개인기기 QR 참가

## 목표와 모드

| 모드       | 화면 구성                           | 비공개 정보                             |
| ---------- | ----------------------------------- | --------------------------------------- |
| 멀티플레이 | 원정팀 기기 1대 + 홈팀 기기 1대     | 각 기기에 자기 팀 손패만 전송           |
| 파티플레이 | 공용 경기장 1대 + 원정·홈 개인 기기 | 공용 화면에는 손패를 전혀 전송하지 않음 |

현재 순수 `transition(state, action)` 엔진을 규칙의 단일 기준으로 유지한다. 클라이언트는 주사위 면 대신 `ROLL_DIE`, 카드 인스턴스 ID, 카드 패스 같은 `MultiplayerCommand`만 제출한다. 서버가 주사위 결과를 생성하고 `GameAction`으로 변환한 뒤 상태를 계산한다.

## 서버 권위형 흐름

```text
개인 기기
  └─ MultiplayerCommand + expectedRevision + idempotencyKey
        ↓
Next.js Route Handler
  ├─ 참가자·차례·revision 확인
  ├─ 저장된 GameState에 transition() 실행
  ├─ 새 상태와 action/event 로그를 한 트랜잭션으로 저장
  └─ 현재는 0.9초 조회, 다음 단계에서 revision_changed 알림 추가
        ↓
각 기기는 자기 viewer용 GameView를 다시 조회
```

서버가 전체 상태를 저장하더라도 응답과 실시간 메시지는 반드시 `getGameView(state, viewer)`를 거친다. 전체 `GameState`, 상대 손패, 덱 순서, RNG 상태를 브라우저에 보내고 CSS로 숨기는 방식은 금지한다.

## URL과 참가 흐름

- 방 생성: `/baseball-game/rooms/new`
- 멀티플레이 원정·홈 화면: `/baseball-game/rooms/[code]/play`
- 파티플레이 공용 화면: `/baseball-game/rooms/[code]/board`
- 개인 참가 QR: `/baseball-game/rooms/[code]/join?seat=away|home&token=...`
- 6자리 방 코드는 탐색용이며 권한 증명이 아니다. 실제 참가 권한은 256비트 일회용 토큰의 해시로 확인한다.
- 게스트는 Supabase Anonymous Sign-In을 사용하고, 계정 사용자는 기존 Workbench 계정과 연결한다.

## 데이터 모델 초안

### `baseball_games`

- `id uuid primary key`
- `room_code text unique`
- `mode text check (mode in ('multiplayer', 'party'))`
- `status text check (status in ('lobby', 'playing', 'finished', 'expired'))`
- `state jsonb` — 서버 전용 전체 `GameState`
- `revision bigint`
- `ruleset_version text`
- `host_user_id uuid`
- `created_at`, `updated_at`, `expires_at`

### `baseball_game_seats`

- `game_id uuid`
- `team text check (team in ('away', 'home'))`
- `user_id uuid`
- `join_token_hash text`
- `connected_at`, `last_seen_at`
- `(game_id, team)` unique

### `baseball_game_actions`

- `game_id uuid`
- `sequence bigint`
- `actor_team text`
- `expected_revision bigint`
- `result_revision bigint`
- `idempotency_key uuid`
- `action jsonb`
- `events jsonb`
- `created_at`
- `(game_id, idempotency_key)` unique

공개 스키마의 모든 테이블은 RLS를 활성화하고 필요한 동작만 `authenticated`에 명시적으로 허용한다. 단순히 `TO authenticated`만 사용하지 않고 해당 게임 좌석의 `user_id = auth.uid()`인지 확인한다.

## API 경계

- `POST /api/baseball-game/rooms` — 방 생성과 호스트 좌석 배정
- `POST /api/baseball-game/rooms/[code]/join` — 참가 토큰 교환과 좌석 배정
- `GET /api/baseball-game/rooms/[code]/view` — 인증된 좌석 또는 공용 화면에 맞춘 `GameView`
- `POST /api/baseball-game/rooms/[code]/actions` — 행동 제출
- `POST /api/baseball-game/rooms/[code]/heartbeat` — 연결 상태와 만료 연장

행동 API는 `expectedRevision`이 현재 값과 다르면 `409 REVISION_CONFLICT`와 최신 revision을 반환한다. 재시도는 동일한 `idempotencyKey`를 사용해 카드 중복 사용이나 주사위 중복 반영을 막는다.

## 실시간 동기화

- 채널 이름: `baseball-game:<game-id>`
- 운영 환경은 `private: true` 채널만 사용한다.
- 클라이언트가 직접 전체 상태를 Broadcast하지 않는다.
- 서버 저장이 완료된 뒤 `{ revision, eventSummary }`만 Broadcast한다.
- 수신 클라이언트는 자신의 권한으로 최신 `GameView`를 다시 조회한다.
- 재접속은 저장된 revision과 행동 로그를 기준으로 복구한다.
- Supabase Realtime Broadcast Replay의 보존 기간은 영구 리플레이 용도가 아니므로, 정식 리플레이는 `baseball_game_actions`를 사용한다.

Supabase는 2026년 7월부터 `realtime` 스키마 자체 변경을 차단한다. 따라서 `realtime.messages`에는 허용된 RLS 정책만 만들고 스키마 객체를 추가하거나 변경하지 않는다.

## 파티플레이 화면 분리

### 공용 화면

- 점수, 이닝, 카운트, 주자, 경기장, 주사위·타구 결과, 공개 카드 연쇄만 표시
- 손패, 덱 순서, 사용 가능 카드, 개인 참가 토큰은 포함하지 않음
- 행동 제출 권한 없이 읽기 전용

### 개인 화면

- 자기 손패 4장, 합법 카드, 현재 결정 요청만 표시
- 공용 경기 정보는 작은 점수판으로 유지
- QR 참가 후 브라우저를 닫아도 같은 익명 계정 세션이면 재접속 가능

## 구현 순서

1. 방·좌석·행동 로그 스키마와 RLS 정책
2. 서버 권위형 `actions` API와 revision 충돌 테스트
3. 두 기기 멀티플레이와 비공개 `GameView`
4. 비공개 Realtime 알림과 재접속
5. 파티 공용 화면 및 좌석별 QR
6. 만료·퇴장·호스트 이관·리플레이
7. 네트워크 단절, 중복 제출, 악성 카드 ID, 상대 좌석 접근 보안 테스트

## 완료 기준

- 상대 손패와 RNG가 네트워크 응답·HTML·Broadcast payload에 존재하지 않는다.
- 동시에 같은 revision으로 행동을 보내도 하나만 반영된다.
- 연결이 끊긴 뒤 최신 상태와 행동 로그로 복구된다.
- 공용 화면은 행동 제출이 불가능하다.
- 두 개인 화면과 공용 화면이 같은 revision을 표시한다.
- RLS 및 Realtime Authorization 테스트가 좌석 간 접근을 차단한다.

## 참고 문서

- [Supabase Realtime Broadcast](https://supabase.com/docs/guides/realtime/broadcast)
- [Supabase Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization)
- [Supabase Anonymous Sign-Ins](https://supabase.com/docs/guides/auth/auth-anonymous)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [2026 Realtime 스키마 잠금 변경](https://supabase.com/changelog/realtime-schema-locked-down-against-modification)
