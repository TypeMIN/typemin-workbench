# Workbench owner 계정 복구

이 절차는 유일한 `owner`가 PIN을 잊어 `/account/admin`을 사용할 수 없을 때만 수행합니다. 일반 계정은 owner 화면의 임시 PIN 발급 기능을 사용합니다.

## 원칙

- PIN 원문을 SQL, Git, 배포 로그나 채팅에 남기지 않습니다.
- 새 PIN은 숫자 6자리 임시 값으로 만들고 scrypt 해시만 DB에 저장합니다.
- 복구와 동시에 해당 계정의 모든 세션을 폐기하고 `must_change_pin=true`로 설정합니다.
- 복구 후 한 번 로그인해 개인 PIN으로 즉시 변경합니다.

## 절차

1. Supabase 대시보드에서 Workbench 프로젝트의 SQL Editor를 열고 `workbench_accounts`에서 `role='owner'`인 계정이 정확히 하나인지 확인합니다.
2. 신뢰할 수 있는 로컬 환경에서 `lib/workbench/security.ts`와 동일한 scrypt 방식으로 임시 6자리 PIN의 해시를 생성합니다. PIN 원문은 화면이나 파일에 저장하지 않습니다.
3. 유지보수 시간을 알린 뒤 SQL Editor에서 하나의 트랜잭션으로 owner 행의 `pin_hash`를 새 해시로 교체하고 `must_change_pin=true`, `failed_login_attempts=0`, `locked_until=null`로 설정합니다. 같은 트랜잭션에서 해당 `account_id`의 `workbench_sessions`를 모두 삭제합니다.
4. Workbench 로그인 화면에서 임시 PIN으로 로그인하고 `/account`에서 새 PIN으로 변경합니다.
5. 로그인, 강제 PIN 변경 해제, 이전 세션 무효화를 확인하고 유지보수를 종료합니다.

DB를 직접 수정하기 전에 공식 백업을 남기며, 계정이 둘 이상 owner이거나 대상 ID가 불명확하면 작업을 중단합니다.
