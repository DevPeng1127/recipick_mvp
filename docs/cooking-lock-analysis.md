# 스마트 차감 잠금 분석과 격리 재현

2026-11-07 작성. 이력 ID **`COOKING-LOCK-ANALYSIS-20261107`**. 기준 커밋 `2777bbfe584632200bf54aa5a121b53175b59008`, 브랜치 `codex/onboarding-deduplication`.

최초 요청에 따라 분석·격리 재현·수정안 비교를 완료한 뒤 사용자가 잠금 순서 통일과 보관함 SHARE 방식을 승인했다. 아래의 분석·재현 기록은 수정 전 코드에 관한 것이며, 후속 구현 상태는 다음 절을 따른다.

## 승인한 잠금 수정 (2026-11-07)

이력 ID **`COOKING-LOCK-FIX-20261107`**, 브랜치 **`codex/cooking-lock-order`**. 사용자가 관련 정렬·삭제 경로까지 함께 수정·테스트하고, 검증 결과 확인 후 운영 반영하기로 했다.

### 구현

- 차감은 CookingPlan UPDATE → 냉장고 ID순 SHARE 및 회원 재검사 → **관련 보관함 ID순 SHARE → 재료 ID순 UPDATE**로 진행한다. 보관함과 재료를 한 JOIN 결과의 순서로 함께 잠그던 부분을 분리했다.
- 보관함 후보 조회 후 잠금이 끝나면 재고를 다시 읽고, 잠근 보관함에 속한 재료로 결과를 제한한다. 그 사이 다른 보관함으로 이동한 재료나 삭제된 재고는 기존 전체 토큰 검증에서 409 처리한다. 요청 해시와 식사 완료 결과의 멱등성 처리는 유지한다.
- 공통 보관함 잠금 함수는 항상 ID순으로 잠그고 ORM의 기존 캐시를 최신 값으로 갱신한다. 차감과 일반 재고 쓰기는 부모 SHARE를 사용하므로 서로 다른 재료의 독립 작업을 병행할 수 있다.
- 보관함 생성·수정·삭제·정렬은 냉장고 SHARE를 먼저 획득한다. 수정·정렬·삭제는 대상 보관함 UPDATE를 ID순으로 얻으며, 삭제는 자식 재료 UPDATE도 ID순으로 얻은 뒤 ORM 삭제를 수행한다. 화면 정렬 결과는 사용자가 요청한 순서를 따른다.
- 냉장고 삭제는 냉장고 UPDATE와 소유자 재확인 → 보관함 ID순 UPDATE → 재료 ID순 UPDATE 후 회원/자식의 ORM 삭제를 진행한다.
- 수동 등록·수정·개별 소비/폐기·보관함 내 일괄 등록도 냉장고 SHARE → 회원 재확인 → 보관함 SHARE 후 재료를 처리한다. 개별 등록 삭제·일괄 삭제/폐기·냉장고 분배 등록은 기존 냉장고 UPDATE를 먼저 사용하며 같은 보관함 잠금 함수를 재사용한다. 인식/AI 요청 중에는 이 쓰기 잠금을 획득하지 않는다.

### 저장 완료와 성공 응답

회귀 테스트에서 `get_db`의 요청 종료 시점 commit이 실패했는데 이미 200 응답을 보낸 기존 문제를 확인했다. 사용자에게 변경 범위를 설명했고 **이번 수정에 포함**하는 승인을 받았다.

차감·보관함 정렬/삭제·냉장고 정렬/삭제 엔드포인트는 최종 `db.commit()`이 끝난 뒤 성공을 반환한다. 개별 등록 삭제와 일괄 삭제/폐기의 기존 명시적 commit도 유지한다. commit 직전 예외를 주입한 부분/전량 차감과 각 관리 요청에서 500 및 전체 상태 롤백을 검증했다. 이 검증은 서버가 commit을 수락한 뒤 연결 응답만 유실되는 상황의 결과를 단정하지 않으며, 차감의 응답 유실 후 동일 요청 재전송은 기존 멱등성 검사로 처리한다.

이번 응답 경계 변경은 위 엔드포인트에 적용했다. 그 밖의 쓰기 API가 요청 종료 의존성에서 commit하는 경우의 전수 점검은 별도 후속 범위로 기록한다. 자동 교착상태 재시도는 이번 구현에 포함하지 않았다.

### 회귀 검증

실제 PostgreSQL 16.13, 루프백의 별도 `recipick_test`, 매 시험 임의 스키마, 기존 `get_db` 트랜잭션 처리기를 사용했다. 실행 순서는 실제 SQL의 잠금 대기와 제한시간이 있는 이벤트로 통제했다.

- 신규 회귀 **39개 통과**. 교차 보관함의 두 진행 순서·부분/전량 차감이 모두 성공하며, 정렬·보관함 삭제·냉장고 삭제를 먼저/나중에 수행하는 6개 경우가 허용된 200/204/403/409로 끝났다. 해당 시험에서 `40P01`은 0건이다.
- 같은 보관함의 다른 재료 차감, 차감 중 수동/보관함 일괄 등록은 한 트랜잭션이 대기하는 동안 다른 요청이 완료됨을 확인했다. 여러 냉장고의 오래된 비정렬 목록도 ID순 잠금을 사용했다.
- 보관함/냉장고 이름, 재료 이름·수량·단위·기한 변경 후 잠금 해제 시 토큰을 재검사해 전체 409 처리했다. 잠금 후보 확인 후 재료가 다른 보관함으로 이동한 경우도 409 처리했다.
- 회원 제거 대기 후 차감·등록·수정·개별 소비/폐기·보관함 일괄 등록을 거절했다. 차감이 먼저인 회원 제거·분배 등록, 개별 소비와 일괄 삭제/폐기의 양방향 순서도 확인했다.
- 차감·관리 작업의 commit 직전 실패 주입에서 재고·이력·식사 결과·보관함 순서·냉장고 및 회원 상태의 롤백과 500 응답을 확인했다. 같은 차감 재전송은 추가 차감/이력을 만들지 않았다.
- 기존 관련 통합 테스트 168개와 입력 검증 단위 테스트 101개도 통과했다. 최종 전체 백엔드 **732개 통과**(213.15초), 이 수에는 신규 회귀 39개가 포함된다. 기존 UTC 사용 폐기 예정 경고 221건이 출력됐다. 실행 전후 기존 테스트 DB의 스키마·테이블 OID 일치와 남은 테스트 연결 0개를 확인했다. [수정 검증 증빙](evidence/cooking-lock-fix-20261107.json)

신규 검사는 [test_cooking_locks.py](../backend/tests/integration/test_cooking_locks.py)에 있으며 기본 백엔드 테스트에 포함된다. 기존 결함 진단은 수정 전 기준 `2777bbf`에 대한 역사적 재현용으로 유지했다. 현재 코드에서는 아래 명령으로 회귀 검사를 실행한다. 테스트 DB 설정은 기존 README의 명시적 로컬 테스트 설정을 따른다.

```powershell
.\.venv\Scripts\python.exe -m pytest tests/integration/test_cooking_locks.py tests/integration/test_cooking.py -q --tb=short -p no:cacheprovider
```

구현 검증 단계의 운영 접근·AI 호출은 0회다. 2026-11-07 사용자 결과 확인 후 **`b2b5c9f`**로 커밋하고 **`origin/codex/cooking-lock-order`**에 푸시했다. 운영 **`recipick-api-locks-b2b5c9f`** Ready·트래픽 100%, 실행 이미지 대조와 읽기 전용 HTTPS/DB 검증을 완료했다. 배포 이력 **`COOKING-LOCK-RELEASE-20261107`**의 상세와 복구 기준은 [운영 배포 기록](deployment-runbook.md), 검증 근거는 [배포 증빙](evidence/cooking-lock-release-20261107.json)에 있다. JUnit 결과와 정리 검증 원본은 저장소 밖 `C:/Users/pengveloper/.codex/visualizations/2026/10/23/01a16717-7b50-7211-8e19-054d43dd6b76/cooking-lock-fix-20261107/`에 있다.

## 확인된 사실

- 서로 다른 식사 건과 서로 겹치지 않는 재료 ID를 사용해도, 보관함을 반대 순서로 잠그면서 교착상태가 발생했다. 실제 차감 HTTP 엔드포인트에서 PostgreSQL **`40P01`**과 HTTP **500**을 확인했다.
- 사용자가 제시한 X/Y 사례를 부분 차감·전량 차감과 두 가지 실행 순서로 검증했다. 4개 경우 모두 두 요청 사이의 순환 대기를 관찰했다.
- 추가로 **스마트 차감과 보관함 정렬**, **스마트 차감과 냉장고 삭제**의 교착상태도 각각 실제 HTTP 경로에서 재현했다.
- 실패한 트랜잭션의 재고·소비 이력·식사 완료 상태는 롤백됐다. 관찰된 영향은 한 요청의 500 응답과 재시도 필요다. 재현에서 부분 차감이나 중복 이력은 발생하지 않았다.
- 기존 `test_cooking.py`는 **22개 통과**했다. 기존 동시성 사례가 다루는 동일 식사 건·동일 재료 경쟁만으로 이번 보관함 순서 문제를 검출할 수 없다.

## 실행 환경과 격리

| 항목 | 실제 검증 조건 |
| --- | --- |
| DB | 로컬 `127.0.0.1:5432/recipick_test` |
| PostgreSQL | 16.13, Windows 64-bit |
| 격리 수준 | READ COMMITTED |
| 교착상태 감지 | 서버 기본 `deadlock_timeout=1s` 유지 |
| 제한 | 진단 세션 `statement_timeout=12s`, `lock_timeout=10s`, 상태 대기 최대 8초, 요청 완료 대기 최대 15초 |
| 데이터 | 소유자 1·공유 회원 2와 테스트 재고·식사 건을 새 임의 스키마에 생성 |
| 연결 | 요청 A/B, 진행 제어용 세션, 관찰 세션, NOWAIT 확인 세션을 각각 분리 |
| 트랜잭션 | `ASGITransport`로 제품 엔드포인트 실행, 기존 `get_db`의 commit/rollback 사용 |
| 접근 제한 | 기존 테스트 안전장치로 개발 환경·루프백·별도 `_test` DB 검증, 앱 기본 DB 엔진 연결 차단 |
| 종료 | 요청 종료/취소·세션 종료·엔진 dispose·해당 임의 스키마 삭제 |

최종 실행에서 진단 **10개 통과**, 기존 차감 통합 테스트 **22개 통과**. 각각 기존 `datetime.utcnow()` 사용에 대한 경고 20건·8건이 있었다. 진단 통과는 현재 결함의 재현과 롤백 확인에 성공했다는 의미다. 수정 후에는 성공을 기대하는 회귀 테스트로 전환해야 한다.

실행 전후 테스트 DB의 기존 스키마·테이블 OID 목록이 같았고, 남은 `recipick-tests` 연결은 0개였다. 운영 DB·운영 서비스 접근과 AI 호출은 0회다. 첫 샌드박스 실행은 출력 없이 지연되어 종료했고, 허용된 권한 확장으로 동일한 로컬 테스트 대상을 검증했다.

## 실제 차감 경로의 잠금

제품 코드는 [cooking_service.py](../backend/app/services/cooking_service.py), 트랜잭션 경계는 [connection.py](../backend/app/database/connection.py)에서 확인했다.

| 순서 | 동작 | 행 잠금과 순서 |
| --- | --- | --- |
| 1 | 인증된 사용자 조회 | 일반 SELECT. 사용자 행을 잠그는 절 없음 |
| 2 | `get_plan(..., lock=True)` | 해당 사용자의 CookingPlan 1개에 `FOR UPDATE` |
| 3 | `authorize(..., lock=True)` | 선택 냉장고들을 `Refrigerator.id ASC`로 `FOR SHARE` |
| 4 | 회원 여부 재조회 | 냉장고 공유 잠금을 보유한 채 RefrigeratorMember 조회 |
| 5 | `stock_rows(..., item_ids=요청ID, lock=True)` | 요청 재료만 `Ingredient.id ASC`로 읽으며 Ingredient와 StorageBox 모두 `FOR UPDATE` |
| 6 | 전체 재고 검사 | 토큰·수량·접근 범위 검사. 하나라도 다르면 409 |
| 7 | 기록·재고·완료 상태 flush | CookingPlan 갱신, Ingredient 갱신 또는 삭제, IngredientLog 추가 |
| 8 | 요청 트랜잭션 종료 | 모두 commit, 예외이면 모두 rollback |

서로 다른 식사 건의 2번 잠금은 독립적이다. 같은 냉장고의 `FOR SHARE`끼리는 함께 획득할 수 있다. 5번에서 재료 ID가 서로 달라도 같은 보관함 행에 대한 `FOR UPDATE`가 충돌한다.

토큰은 재료 ID·이름·수량·단위·기한·기한 출처와 보관함 ID·이름, 냉장고 ID·이름을 포함한다. 보관함 이름이나 소속을 변경 가능한 상태로 두는 수정안은 이 토큰을 검사하는 시점의 안정성까지 검토해야 한다.

### SQL과 실행 계획

드라이버의 `before_cursor_execute`에서 실행 SQL을 수집했다. 핵심 절은 다음과 같다. 전체 SELECT 목록과 계획은 [재현 증빙](evidence/cooking-lock-analysis-20261107.json)에 있다.

```sql
FROM ingredients
JOIN storage_boxes ON ingredients.storage_box_id = storage_boxes.id
JOIN refrigerators ON storage_boxes.refrigerator_id = refrigerators.id
WHERE refrigerators.id IN ($1::INTEGER)
  AND ingredients.id IN ($2::INTEGER, $3::INTEGER)
ORDER BY ingredients.id
FOR UPDATE OF ingredients, storage_boxes
```

실제 드라이버 SQL과 바인드 값으로 `EXPLAIN (ANALYZE, VERBOSE, BUFFERS, FORMAT JSON)`을 실행했다. 분석용 트랜잭션은 동시성 시험 전에 롤백했다. 관찰된 계획은 아래 구조이며 LockRows의 실제 반환 행은 2개였다.

```text
LockRows
  Sort — ingredients.id
    Nested Loop
      Nested Loop
        Seq Scan — ingredients, id IN (10, 40)
        Materialize
          Bitmap Heap Scan — storage_boxes, refrigerator_id = 10
            Bitmap Index Scan
      Index Scan — refrigerators_pkey
```

LockRows는 하위 실행 노드에서 받은 각 결과 행의 잠금 대상을 처리한다. 이 실행에서는 먼저 한 결과 행의 Ingredient·StorageBox를 잠그고 다음 결과 행으로 진행했다. 재료 정렬을 따르면서 A의 보관함 순서는 X→Y, B는 Y→X가 됐다. 전체 보관함을 보관함 ID로 별도 정렬해 잠그는 단계는 없다. [PostgreSQL 16 실행기 소스](https://github.com/postgres/postgres/blob/REL_16_STABLE/src/backend/executor/nodeLockRows.c)

### 자동 획득 잠금과 외래키

- 잠금 SELECT는 해당 테이블에 `RowShareLock`, 일반 조회는 `AccessShareLock`, INSERT/UPDATE/DELETE는 대상 테이블에 `RowExclusiveLock`을 수반한다. 관찰한 재현에서 이 테이블 잠금들은 서로 호환되며, 대기는 트랜잭션 ID에서 발생했다.
- `pg_locks`에서 각 작업은 자기 트랜잭션 ID의 `ExclusiveLock`을 보유하고, 상대 트랜잭션 ID에 `ShareLock`을 요청한 채 기다렸다. 이 ShareLock은 상대 트랜잭션의 종료를 기다리는 표시다.
- 행 잠금 소유 정보는 튜플 자체에도 저장된다. `pg_locks`에 모든 소유 행이 별도 항목으로 나타난다고 가정할 수 없다. 따라서 `pg_blocking_pids`, `wait_event`, 튜플의 `ctid`, 독립 세션의 NOWAIT 결과를 함께 사용했다. [잠금 조회 문서](https://www.postgresql.org/docs/16/view-pg-locks.html)
- 재료 INSERT는 외래키 부모인 StorageBox를 `KEY SHARE`로 보호한다. 소비 이력 INSERT는 User와 Refrigerator를 같은 방식으로 보호한다. 별도 세션의 부모 `FOR NO KEY UPDATE NOWAIT`는 성공하고 `FOR UPDATE NOWAIT`는 `55P03`으로 실패하는 것을 확인했다. 이 결과는 참조 무결성 검사 소스의 `FOR KEY SHARE`와 일치한다. [외래키 검사 소스](https://github.com/postgres/postgres/blob/REL_16_STABLE/src/backend/utils/adt/ri_triggers.c)
- CookingPlan의 외래키는 User뿐이며, Refrigerator 목록은 JSON이다. IngredientLog의 `ingredient_id`는 과거 재고 ID를 보존하는 일반 컬럼이다. 이번 순환 대기는 stock_rows 안에서 발생했으므로 소비 이력 INSERT의 외래키 잠금은 해당 순환을 만드는 조건이 아니었다.
- 일반 비키 컬럼 UPDATE는 통상 `NO KEY UPDATE` 강도, DELETE는 `UPDATE` 강도로 행을 보호한다. 보관함 정렬의 `display_order` UPDATE도 차감이 보유한 보관함 `FOR UPDATE`와 충돌했다. [행 잠금 호환성](https://www.postgresql.org/docs/16/explicit-locking.html#LOCKING-ROWS)

## 재현 절차와 결과

### 요청 A와 요청 B의 교차 보관함

냉장고 10 안에 X=100, Y=101을 만들었다. 재료 10·30은 X, 재료 20·40은 Y에 있으며 초기 수량은 각각 5개다. A는 사용자 1의 식사 건으로 10·40을 차감하고, B는 사용자 2의 별도 식사 건으로 20·30을 차감한다.

1. 독립 제어 세션에서 재료 40과 30을 각각 `FOR UPDATE`로 잠근다.
2. 두 HTTP 차감 요청을 시작한다. A가 10/X를 잡은 후 40에서, B가 20/Y를 잡은 후 30에서 기다리는 것을 확인한다.
3. 별도 NOWAIT 확인에서 X/Y 모두 `55P03`으로 잠금 충돌을 확인한다.
4. 한 제어 세션만 해제한다. 먼저 풀린 요청이 상대 요청의 보관함을 기다리고, 다른 요청은 여전히 제어 세션을 기다리는지 관찰한다.
5. 나머지 제어 세션도 해제한다. 이제 제어 세션은 트랜잭션이 끝난 idle 상태이고, 대기 관계는 A→B와 B→A만 남는다.
6. PostgreSQL이 한 트랜잭션을 `40P01`로 중단한다. 제품 `get_db`가 롤백하고 일반 예외 처리기가 500을 반환한다. 다른 요청은 200으로 완료한다.

```mermaid
flowchart LR
    A[A · 재료 10/40 · 보관함 X 보유] -->|보관함 Y 대기| B[B · 재료 20/30 · 보관함 Y 보유]
    B -->|보관함 X 대기| A
```

계측용 재료 잠금은 실제 잠금 SQL이 다음 결과 행으로 진행하는 시점을 제어한다. 제품 쿼리의 WHERE·ORDER BY·FOR UPDATE를 변경하거나 보관함 잠금을 인위적으로 추가하지 않았다. 제어 트랜잭션을 모두 끝낸 후에도 요청 A/B만의 순환이 남는 것을 확인했다. 실제 실행기의 결과 행 처리 사이에서도 가능한 순서를 강제한 시험이며, 자연 트래픽에서 이 순서가 발생하는 빈도를 측정한 시험은 아니다.

| 경우 | 관찰 결과 |
| --- | --- |
| A 먼저 진행, 각 1개 차감 | A 500 / B 200, `40P01` |
| B 먼저 진행, 각 1개 차감 | A 200 / B 500, `40P01` |
| A 먼저 진행, 각 5개 전량 차감 | A 500 / B 200, `40P01` |
| B 먼저 진행, 각 5개 전량 차감 | A 200 / B 500, `40P01` |

위 피해자 선택은 이번 실행 결과다. 향후 실행에서 같은 요청이 항상 중단된다고 보장하지 않는다.

대표적인 부분 차감 결과에서 성공한 B의 재료 20·30만 5→4가 되고 소비 이력이 2개 생겼다. A의 재료 10·40은 5를 유지하며 A 식사 건의 `applied_at`, `request_hash`, `result`는 모두 NULL이다. 전량 차감에서는 성공한 요청의 재료 행만 삭제됐다. 기존 이력·다른 냉장고의 재고는 보존됐다.

성공한 요청을 동일 본문으로 다시 보내면 추가 차감·이력이 없었다. 실패한 요청도 원래 토큰으로 다시 보내 성공했다. 이 사례에서는 두 요청의 재료 ID가 겹치지 않아 실패한 요청의 재고가 그대로였기 때문이다. 공유 재료 경쟁에서는 다시 토큰을 검사해 409가 될 수 있다.

### 보관함 정렬과 동시 차감

차감이 X를 보유하고 재료 40에서 기다리도록 한 뒤, 소유자 계정으로 정렬 API에 `[Y, X]`를 제출했다. 실제 정렬 서비스는 요청 배열 순서로 UPDATE하므로 Y를 갱신하고 X에서 기다렸다. 제어 잠금을 풀자 차감은 Y에서 대기하고 정렬은 X에서 대기하여 `40P01`이 발생했다.

최종 실행에서 차감 200·정렬 500이었다. 정렬의 앞선 Y 변경도 롤백된 것을 확인했다. 따라서 차감의 보관함 정렬만 고쳐서는 이 관련 경로까지 해결했다고 판단할 수 없다.

### 냉장고 삭제와 동시 차감

별도 제어용 DB 잠금을 추가하지 않았다. 차감이 냉장고 `FOR SHARE`를 잡은 직후, 다음 SQL 호출 전에 테스트 이벤트로 일시 중지했다. 소유자 계정의 냉장고 삭제 API를 실행하자 ORM이 회원→재료→보관함→냉장고 순서로 DELETE했다. 마지막 냉장고 DELETE가 차감의 공유 잠금을 기다렸다.

차감을 계속 진행하면 stock_rows가 삭제 트랜잭션의 재료 잠금을 기다리므로 순환이 된다. 실제 `40P01`, 차감 200·삭제 500과 전체 삭제 롤백을 확인했다. 이 시험의 일시 중지는 두 실제 SQL 호출 사이의 실행 순서를 제어한다.

## 관련 경로 검토

| 경로 | 현재 잠금 순서 | 차감과의 관계 및 확인 수준 |
| --- | --- | --- |
| 개별 재료 수정 | 일반 조회 → 해당 Ingredient UPDATE | 단일 재료의 비키 갱신. 차감의 재료 잠금과 경합하며, 이번 두 작업만으로 역방향 보관함 대기는 발견하지 못함. 동시 전 조합 재현은 미수행 |
| 개별 등록 삭제 | Refrigerator `FOR UPDATE` → 권한 재조회 → Ingredient `FOR UPDATE` → DELETE | 차감의 냉장고 SHARE와 먼저 경합하여 같은 냉장고에서는 직렬화. 코드 확인 |
| 일괄 삭제·폐기 | Refrigerator `FOR UPDATE` → 권한 재조회 → Ingredient ID순 `FOR UPDATE` → 이력/DELETE | 차감과 동일 냉장고의 상위 잠금에서 직렬화. 코드 확인 |
| 단일 소비·폐기 | Ingredient `FOR UPDATE` → 이력 INSERT의 User/Refrigerator KEY SHARE | 차감의 냉장고 SHARE와 FK KEY SHARE는 호환. 재료 잠금·FK 호환성을 격리 DB에서 관찰 |
| 수동 재료 등록 | 새 Ingredient INSERT → 부모 StorageBox KEY SHARE | 차감의 보관함 UPDATE 잠금 때문에 등록이 기다릴 수 있음. FK 호환성 실측 |
| 영수증·음성 분배 등록 | Refrigerator `FOR UPDATE` → 회원 재조회 → StorageBox ID순 `FOR UPDATE` → INSERT | 차감과 냉장고에서 직렬화. 코드 확인 |
| 보관함 이름·유형 수정 | StorageBox UPDATE | 단일 보관함 경합. 현재 토큰에 포함된 이름을 동시 변경하지 못하게 하는 효과가 있음 |
| 보관함 정렬 | 요청 배열 순서대로 StorageBox UPDATE | 역순 정렬과 차감 교착상태 재현 |
| 보관함 삭제 | 자식 재료 DELETE → StorageBox DELETE | ORM의 자식 선행 순서를 실제 SQL로 확인. 보관함 선행 잠금안과의 역전 가능성을 수정 설계에서 다뤄야 함 |
| 냉장고 이름 수정 | Refrigerator UPDATE | 차감의 냉장고 SHARE와 경합하며 이름을 안정화 |
| 냉장고 삭제 | 회원 DELETE → 재료 DELETE → 보관함 DELETE → Refrigerator DELETE | 차감과 교착상태 재현 |
| 초대 조회/수락·철회·회원 탈퇴/제거 | Refrigerator `FOR UPDATE` → 초대 또는 회원 처리 | 차감의 권한 재검사와 냉장고 잠금을 공유. 차감 진행 중 회원 제거를 직렬화하는 보호를 유지해야 함 |
| 초대 생성·보관함 생성 | INSERT → Refrigerator FK KEY SHARE | 기존 부모 조회를 동반한 새 행 추가. FK 잠금의 상위 관계를 설계에 포함 |
| 첫 설정 | User `FOR UPDATE` → 기존 냉장고 조회 또는 신규 생성 | 소비 이력의 User FK KEY SHARE와 경합 가능. 현재 기존 냉장고 경로는 추가 배타 잠금을 잡지 않음 |

기본 권한 의존성은 일반 SELECT다. 모든 수정 경로가 냉장고 행을 먼저 잠그는 것으로 일반화하면 안 된다. 특히 보관함 관리·냉장고 삭제와 단일 소비/폐기를 확인해야 한다.

## 미확인 가설과 검증 한계

- 운영에서 실제로 이 오류가 발생한 이력·빈도·사용자 영향은 조회하지 않았다. 운영 배포 기록의 PostgreSQL 16과 같은 주 버전에서 가능성을 확인했으며, 운영 실행 계획이나 설정을 직접 확인한 결과는 아니다.
- 로컬 데이터 크기와 통계에서 관찰한 계획을 사용했다. 다른 데이터 분포·플래너 설정·PostgreSQL 버전의 모든 계획을 검증하지 않았다.
- 보관함 삭제와 차감의 모든 순열, 여러 냉장고를 가로지르는 조합, 회원 관리·초기 설정·계정 삭제의 다자간 교착상태는 전수 재현하지 않았다.
- 단일 소비/폐기가 재료를 먼저 잡고 FK 검사에서 냉장고를 기다리는 동안, 일괄 삭제/폐기 등이 냉장고를 먼저 잡고 같은 재료를 기다리는 역전은 코드상 추가 가설이다. 이번 재현 결과와 구분하며 수정 회귀 범위에 포함할 가치가 있다.
- 주 재현의 실패 요청은 재고 조회 잠금 단계에서 중단됐다. 쓰기 이후 임의 실패의 전체 롤백은 기존 `test_failure_after_flush_rolls_back_inventory_logs_and_receipt`가 확인하며 이번에도 통과했다.

## 기존 동시성 테스트의 범위

- `test_same_request_concurrently_and_after_response_loss_is_once`는 같은 CookingPlan에 같은 요청을 3회 보낸다. 첫 식사 건 잠금에서 직렬화되고 재시도 멱등성을 검사한다.
- `test_two_users_cannot_apply_stale_plans_to_same_stock`는 사용자 2명이 같은 재료 1000을 차감한다. 같은 Ingredient 잠금에서 경합하여 한 요청 200·다른 요청 409를 검사한다.
- 두 시험 모두 서로 다른 재료 집합이 두 보관함을 반대 순서로 접근하는 조건을 만들지 않는다. `asyncio.gather()`만으로 교착상태 발생 지점을 통제하거나 잠금 대기 관계를 관찰하지도 않는다. 이번 별도 진단은 그 조건을 추가했다.

## 수정 후보 비교

### 1. 보관함 ID순 선행 잠금, 이후 재료 ID순 잠금

관련 보관함을 확정한 뒤 ID순으로 잠그고 재료를 ID순으로 잠근다. 권한 확인에 사용하는 냉장고 잠금을 먼저 유지한다. 보관함 목록을 얻는 초기 조회와 실제 잠금 사이에 삭제·소속 변경이 있을 수 있으므로 잠금 후 재료/보관함 소속을 다시 조회하고 누락·토큰 변경을 검사해야 한다.

- **권한과 토큰**은 냉장고 잠금 후 회원 재검사, 보관함·재료 잠금 후 최신 상태 읽기, 동일 토큰 검증을 유지한다.
- **중복 방지와 롤백**은 CookingPlan 잠금·요청 해시·결과 저장과 하나의 트랜잭션을 유지한다.
- **동시성**은 보관함을 배타 잠금으로 잡으면 같은 보관함의 독립 재료 차감도 직렬화된다. 필요한 보관함만 잠그며 잠금 대상 조회 비용이 추가된다.
- **관련 경로**의 보관함 정렬·보관함 삭제·냉장고 삭제도 같은 상위→하위 순서로 조정해야 한다. 현재 자식 선행 삭제를 그대로 둔 채 차감만 부모 선행으로 바꾸면 새로운 역전이 가능하다. 정렬 결과는 사용자가 정한 순서를 유지하면서 잠금 획득 순서만 ID순으로 만들 수 있다.

### 2. 대상 또는 강도 조정

| 후보 | 효과 | 검토할 영향 |
| --- | --- | --- |
| StorageBox를 `FOR SHARE`로 보호, Ingredient는 `FOR UPDATE` | 서로 다른 차감끼리 보관함 공유 잠금이 호환. 이름/구조 수정·삭제는 계속 대기 | 최초 교차 보관함 사례 해소 후보. 정렬과 냉장고 삭제의 역전은 별도 순서 조정 필요. 차감 중 보관함을 갱신하지 않아 잠금 승격은 필요하지 않음 |
| StorageBox `FOR NO KEY UPDATE` | 재료 INSERT의 FK KEY SHARE와 호환 | 두 차감의 NO KEY UPDATE끼리는 충돌하므로 최초 문제를 단독 해결하지 못함 |
| StorageBox `FOR KEY SHARE` 또는 잠금 제외 | 보관함 비키 갱신과 동시 처리 가능 | 이름 변경과 토큰 검사 시점의 안정성이 달라짐. 명시적인 동작 합의와 추가 검증 필요 |
| Refrigerator `FOR UPDATE`로 차감 전체 직렬화 | 같은 냉장고의 차감끼리 먼저 직렬화 | 처리량 감소. 상위 잠금을 생략하는 정렬·삭제 경로가 있어 차감의 강도 변경만으로 전체 해결 불가 |

Ingredient 잠금과 CookingPlan 잠금을 줄이는 것은 재고 경쟁·중복 차감에 영향을 준다. 이번 범위의 개선에서는 이 두 보호와 토큰 검사를 유지하는 편을 권한다.

### 3. 전체 트랜잭션 제한 재시도

`40P01` 확인 후 실패 세션을 롤백하고 새로운 트랜잭션에서 권한 조회·식사 건 잠금·재고 조회·토큰 검증·기록 저장 전체를 다시 수행한다. 오류가 난 SQL 한 문장만 재실행하면 중단된 트랜잭션이나 오래된 ORM 상태를 재사용할 수 있다. 재시도 경계는 현재 `get_db`가 담당하는 최종 commit까지 포함해야 한다.

- 총 시도 횟수는 예를 들어 **최초 1회 + 추가 최대 2회**, 지연은 짧은 무작위 backoff로 제한하는 안을 검토할 수 있다. 횟수·최종 오류 안내는 아직 확정하지 않았다.
- 재시도 시 권한이 없어지면 403, 토큰이 달라졌으면 409를 그대로 반환해야 한다. 최신 토큰으로 자동 교체하여 사용자 확인을 건너뛰면 안 된다.
- 같은 식사 건·요청 해시·결과를 다시 확인해 이미 성공한 요청은 결과만 반환한다. 실패한 시도의 재고·이력·식사 상태는 모두 롤백해야 한다.
- 이 엔드포인트는 새 AI 호출이 없어 재시도에 따른 AI 비용은 없다. DB 작업량과 응답 지연은 증가하며, 반복 충돌을 종료할 횟수와 시간 한도가 필요하다.
- 원래 잠금 순서가 남으면 충돌은 계속 발생할 수 있다. 순서/강도 정리와 함께 적용할 보완책으로 검토한다. [PostgreSQL 교착상태 처리 지침](https://www.postgresql.org/docs/16/explicit-locking.html#LOCKING-DEADLOCKS)

### 논의할 권장 방향

**냉장고 → 보관함 ID순 → 재료 ID순의 일관된 순서**를 관련 쓰기 경로까지 정리하는 방향을 권한다. 차감이 읽기만 하는 보관함은 SHARE, 실제 수정·삭제에는 필요한 강도의 잠금을 쓰면 같은 보관함의 서로 다른 재료 차감을 병행할 여지가 있다. 권한 확인용 냉장고 SHARE, 식사 건 UPDATE, 재료 UPDATE와 상태 토큰·요청 해시는 유지한다. 제한 재시도의 도입 여부는 이 순서 정리와 회귀 결과를 보고 결정한다.

수정 범위에는 실제 충돌이 확인된 보관함 정렬·냉장고 삭제와, 순서 변경에 영향을 받는 보관함 삭제 및 FK 연계 경로가 포함되어야 한다. 이는 이번 교착상태 수정의 동작 보존 범위를 구체화한 제안이다. 제품 코드 적용은 사용자와 논의 후 진행한다.

## 필요한 회귀 테스트

1. 이번 A/B 교차 보관함의 두 진행 순서·부분/전량 차감에서 최종 성공과 정확한 이력 4개를 확인한다.
2. 차감과 역순 보관함 정렬, 보관함 삭제, 냉장고 삭제를 제어된 순서로 실행하고 허용된 성공/충돌 응답·전체 롤백을 검사한다.
3. 여러 냉장고/보관함의 요청 순서를 섞고, 같은 보관함의 서로 다른 재료가 수정안에서 기대하는 만큼 병행 처리되는지 관찰한다.
4. 대기 중 재료 수량·이름·단위·기한·위치, 보관함/냉장고 이름이 변경되면 최신 토큰 검증으로 전체 409가 되는지 검사한다.
5. 공유 탈퇴·내보내기·초대 수락과 차감, 단일 소비/폐기와 일괄 삭제/폐기, 수동/분배 등록의 FK 대기를 확인한다.
6. 같은 식사 건 동시 요청·응답 유실 재시도·다른 본문 재제출에서 멱등성과 충돌 정책을 유지한다.
7. 이력 INSERT 거절·flush 이후 예외·최종 commit 실패에서도 재고·이력·식사 상태가 함께 롤백되는지 확인한다.
8. 재시도를 도입하면 실제 `40P01`의 제한 횟수, 새 세션/트랜잭션, 권한·토큰 재검사, 403/409 비재시도, 성공 이력 1회, 취소·시간 초과·한도 소진을 검사한다.

## 재실행과 증빙

진단 파일은 [cooking_lock_probe.py](../backend/tests/diagnostics/cooking_lock_probe.py)다. `test_` 접두사가 없어 일반 전체 검사에 자동 포함되지 않으며 명시적으로 선택한다. 기존 README의 안전 조건에 맞는 로컬 테스트 계정을 사용한다. 아래 주소의 계정·암호는 자리표시자다.

```powershell
cd C:\Users\pengveloper\dev\recipick_mvp\backend
$env:RECIPICK_RUN_POSTGRES_TESTS = '1'
$env:TEST_DATABASE_URL = 'postgresql+asyncpg://TEST_USER:TEST_PASSWORD@127.0.0.1:5432/recipick_test'
$env:RECIPICK_LOCK_PROBE_OUTPUT = Join-Path $env:TEMP 'recipick-lock-probe'
try {
    .\.venv\Scripts\python.exe -m pytest tests/diagnostics/cooking_lock_probe.py tests/integration/test_cooking.py -q --tb=short -p no:cacheprovider
} finally {
    Remove-Item Env:RECIPICK_RUN_POSTGRES_TESTS
    Remove-Item Env:TEST_DATABASE_URL
    Remove-Item Env:RECIPICK_LOCK_PROBE_OUTPUT
}
```

공유 가능한 축약 증빙은 `docs/evidence/cooking-lock-analysis-20261107.json`에 있다. 실제 SQL, 계획의 주요 필드, PID·대기 관계·SQLSTATE, 재고/이력/식사 결과, FK 확인 및 정리 결과를 담았다. 전체 VERBOSE 계획·잠금 스냅샷·로컬 실행 래퍼는 저장소 밖 `C:/Users/pengveloper/.codex/visualizations/2026/10/23/01a16717-7b50-7211-8e19-054d43dd6b76/cooking-lock-probe-20261107/` 및 상위 `run_cooking_lock_probe.py`에 있다. 모두 합성 데이터이며 인증정보를 포함하지 않는다.
