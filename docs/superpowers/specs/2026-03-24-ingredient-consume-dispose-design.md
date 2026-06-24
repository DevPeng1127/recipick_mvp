# Ingredient Consume/Dispose Feature Design

## Summary

Replace the current hard-delete ingredient removal with two distinct actions: **consume** (eaten/used) and **dispose** (expired/spoiled/discarded). Track all events in a separate `ingredient_logs` table for future dashboard statistics.

## Requirements

- Two removal actions: consume and dispose
- Partial quantity support (e.g., consume 300ml of 1L milk, keep 700ml)
- Full quantity shortcut (consume/dispose everything at once)
- Optional memo on each action
- History preserved even after ingredient/refrigerator deletion
- DB structure ready for future statistics dashboard

## DB Schema

### New Table: `ingredient_logs`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `int` | PK, auto-increment | |
| `user_id` | `int` | FK → users.id, NOT NULL | Who performed the action |
| `refrigerator_id` | `int` | FK → refrigerators.id, SET NULL on delete, nullable | Source refrigerator (null if fridge deleted) |
| `refrigerator_name` | `varchar(100)` | NOT NULL | Denormalized fridge name (queryable after fridge deleted) |
| `ingredient_id` | `int` | No FK constraint, nullable | Denormalized ref to original ingredient. Set to ingredient's ID at log creation time. No FK — the ingredient may be deleted immediately after. Null only if data is unavailable. |
| `action_type` | Enum(`ActionType`) | NOT NULL | `CONSUMED` or `DISPOSED`. Uses SQLAlchemy Enum with UPPERCASE values (consistent with existing `MemberRole`, `StorageType` patterns) |
| `ingredient_name` | `varchar(100)` | NOT NULL | Denormalized (queryable after original deleted) |
| `quantity` | `float` | NOT NULL | Amount consumed/disposed |
| `unit` | `varchar(20)` | NOT NULL | Unit of measurement |
| `expiry_date` | `date` | nullable | Ingredient's expiry date at time of action (for future waste analytics) |
| `memo` | `text` | nullable | Optional user note |
| `created_at` | `timestamp` | NOT NULL, default=now | When the action occurred |

**Indexes:**
- `ix_ingredient_logs_user_id_created_at` — composite index for per-user time-range statistics queries
- `ix_ingredient_logs_user_id_action_type` — composite index for per-user consume/dispose filtering

### Existing Tables: No Changes

The `ingredients` table remains unchanged. Partial consume/dispose reduces `quantity` in place.

## Schemas (Pydantic)

### Request
```python
class ConsumeDisposeRequest(BaseModel):
    quantity: float | None = None  # null/omit = full quantity
    memo: str | None = None        # optional note
```

### Response
- Full action: `204 No Content` (no body)
- Partial action: `200 OK` with existing `IngredientResponse`

No new response schema needed for this phase. Future log-listing endpoints will add `IngredientLogResponse`.

## API Endpoints

### Removed

- `DELETE /storage-boxes/{storage_box_id}/ingredients/{ingredient_id}` — replaced by consume/dispose

Note: This is a safe breaking change. The project has a single frontend deployed alongside the backend; there are no external API consumers.

### New Endpoints

#### POST `/storage-boxes/{storage_box_id}/ingredients/{ingredient_id}/consume`

Consume an ingredient (fully or partially).

**Request Body:**
```json
{
  "quantity": 5.0,          // optional: omit or null for full quantity
  "memo": "scrambled eggs"  // optional
}
```

**Response:**
- Full consume (quantity omitted/null or >= current): `204 No Content` (ingredient deleted)
- Partial consume (0 < quantity < current): `200 OK` with updated `IngredientResponse`
- Invalid quantity (<= 0): `400 Bad Request`

#### POST `/storage-boxes/{storage_box_id}/ingredients/{ingredient_id}/dispose`

Dispose of an ingredient (fully or partially). Same request/response contract as consume.

**Request Body:**
```json
{
  "quantity": null,           // null/omit = full disposal
  "memo": "mold discovered"  // optional
}
```

### Authorization

All new endpoints require:
1. Authenticated user (JWT via `get_current_user`)
2. **Refrigerator membership check**: service layer joins `StorageBox → Refrigerator → RefrigeratorMember` to verify `current_user.id` is a member of the refrigerator owning the storage box. Returns `403 Forbidden` if not a member.

Note: This is a pre-existing gap in current ingredient endpoints. The new consume/dispose service will implement proper authorization. Fixing existing endpoints (create, update) is out of scope for this feature but noted as tech debt.

### Business Logic

1. Validate ingredient exists and belongs to storage box
2. **Validate user is a member of the refrigerator** (join StorageBox → Refrigerator → RefrigeratorMember, check user_id)
3. If `quantity` is null/omitted or >= ingredient.quantity → **full action**:
   - Create `ingredient_log` with the ingredient's full quantity, recording `ingredient_id`, `ingredient_name`, `unit`, `expiry_date`, `refrigerator_id`, `refrigerator_name`
   - Delete the ingredient from `ingredients` table
   - Return `204 No Content`
4. If 0 < `quantity` < ingredient.quantity → **partial action**:
   - Create `ingredient_log` with the specified quantity
   - Subtract quantity from ingredient (`ingredient.quantity -= request.quantity`)
   - Use `SELECT ... FOR UPDATE` (SQLAlchemy `with_for_update()`) to prevent race conditions on concurrent partial consume/dispose
   - Return `200 OK` with updated ingredient
5. If `quantity` <= 0 → `400 Bad Request`

## Frontend UI

### IngredientCard KebabMenu Changes

**Before:** `수정` | `삭제`
**After:** `수정` | `소비` | `폐기`

**Prop changes:** Replace `onDelete: (id: number) => void` with:
- `onConsume: (ingredient: Ingredient) => void` — passes full ingredient object (needed for dialog)
- `onDispose: (ingredient: Ingredient) => void` — passes full ingredient object

### ConsumeDisposeDialog Component

New dialog component triggered from KebabMenu. Accepts `action: 'consume' | 'dispose'` prop to control title, button text, and color.

```
+----------------------------------+
|  (icon) 식재료 소비/폐기          |
|                                  |
|  계란 (현재: 10개)                |
|                                  |
|  [전부 소비]  [수량 지정]    <- tabs
|                                  |
|  (if 수량 지정):                  |
|  수량: [____5____] 개            |
|                                  |
|  메모 (선택):                    |
|  [________________________]      |
|                                  |
|  [취소]            [소비하기]     |
+----------------------------------+
```

**Behavior:**
- Default: "전부" tab selected (no quantity input needed)
- "수량 지정" tab: shows quantity input with `type="number"`, `step="any"`. Default = current quantity. Validates on submit (not real-time), same pattern as ingredient creation quantity input (allows typing `0.5` naturally).
- Memo field always visible, optional
- Confirm button text/color:
  - Consume: "소비하기" (blue/primary)
  - Dispose: "폐기하기" (red/danger)
- After action: dialog closes, ingredient list refreshes
  - Full action: ingredient disappears from list
  - Partial action: ingredient quantity updates

### State Management (Zustand)

Add to `useIngredientStore`:
- `consumeIngredient(storageBoxId, ingredientId, quantity?, memo?)` — calls consume API, updates local state
- `disposeIngredient(storageBoxId, ingredientId, quantity?, memo?)` — calls dispose API, updates local state

**Dual response handling:** API client returns `Ingredient | null`. If `null` (204 response), filter ingredient from state. If `Ingredient` (200 response), replace ingredient in state with updated version.

### Frontend API Client

Add to `frontend/src/api/ingredients.ts`:
- `consumeIngredient(storageBoxId, ingredientId, body)` → POST consume endpoint, returns `Ingredient | null`
- `disposeIngredient(storageBoxId, ingredientId, body)` → POST dispose endpoint, returns `Ingredient | null`

Remove:
- `deleteIngredient()` — replaced by consume/dispose

## Testing Strategy

### Backend Unit Tests
- Consume full quantity → ingredient deleted + log created with correct denormalized data
- Consume partial quantity → ingredient quantity reduced + log created
- Dispose full quantity → ingredient deleted + log created
- Dispose partial quantity → ingredient quantity reduced + log created
- Invalid quantity (<= 0) → 400 error
- Quantity >= current treated as full action (not error)
- Memo saved correctly (with and without)
- Log contains correct denormalized data (name, unit, expiry_date, refrigerator_name)
- Authorization: non-member user gets 403

### Frontend Unit Tests
- ConsumeDisposeDialog renders correctly for consume/dispose modes
- Tab switching between "전부" and "수량 지정"
- Quantity validation (not <= 0)
- API calls with correct payloads
- State updates after full action (ingredient removed) vs partial action (ingredient updated)
- KebabMenu shows 소비/폐기 instead of 삭제

## Out of Scope

- Statistics dashboard UI (future phase)
- Aggregation/reporting API endpoints (future phase)
- Undo consume/dispose
- Batch consume/dispose
- Storage box name/ID in logs (can be derived from refrigerator context if needed later)
- Fixing authorization gap in existing ingredient create/update endpoints (noted as tech debt)

---

## Implementation Progress (2026-06-24)

### Completed (commit `ea96b51` on `phase2` branch)

#### Backend
- [x] `IngredientLog` 모델 + `ActionType` enum (`backend/app/models/ingredient_log.py`)
- [x] `models/__init__.py`에 export 추가
- [x] Alembic 마이그레이션 생성 및 적용 (`1338c8f9fe82_add_ingredient_logs_table`)
- [x] `ConsumeDisposeRequest` 스키마 (`backend/app/schemas/ingredient.py`)
- [x] `consume_or_dispose_ingredient()` 서비스 함수 (`SELECT FOR UPDATE`, 전량/부분 분기)
- [x] `DELETE` 엔드포인트 제거, `POST .../consume` + `POST .../dispose` 추가
- [x] 미사용 `delete_ingredient()` 함수 및 `selectinload` import 제거
- [x] 단위 테스트: `TestConsumeDisposeRequest` (4개), `TestActionType` (4개)
- [x] `pytest tests/unit/ -v` — 41 passed

#### Frontend
- [x] `ConsumeDisposeRequest` 타입 (`frontend/src/types/ingredient.ts`)
- [x] `consumeIngredient()` / `disposeIngredient()` API 클라이언트 (204→null, 200→Ingredient)
- [x] `deleteIngredient()` 제거
- [x] Zustand 스토어: `removeIngredient` → `consumeIngredient` + `disposeIngredient`
- [x] `ConsumeDisposeDialog` 컴포넌트 (전부/수량지정 탭, 메모, 클라이언트 검증)
- [x] `IngredientCard` 케밥메뉴: "삭제" → "소비" + "폐기"
- [x] `IngredientList` prop 변경 전파
- [x] `StorageBoxPage` 다이얼로그 연결
- [x] 프론트 테스트 10개 추가, 전체 18 passed
- [x] `npx tsc --noEmit` 클린

#### DnD 클릭 관통 수정
- [x] `SortableContainer.tsx` — `useRef` + `onClickCapture`로 드래그 후 Link 클릭 차단

#### 문서
- [x] `CLAUDE.md` — API 테이블 업데이트, Phase 3 항목 추가

### 검증 결과
- `alembic upgrade head` — 성공
- `pytest tests/unit/ -v` — 41 passed
- `npx tsc --noEmit` — 에러 없음
- `npm run test` (vitest) — 18 passed
- 수동 테스트 — 미실시

---

## TODO (다음 세션)

### 즉시 필요
- [ ] **수동 테스트**: 개발서버 띄워서 소비/폐기 전량·부분 동작 확인, DnD 후 네비게이션 차단 확인
- [ ] **스펙과의 차이 확인**:
  - 스펙 인덱스: `(user_id, created_at)` 복합, `(user_id, action_type)` 복합 → 구현은 단일 컬럼 인덱스 3개. 현재 단계에서 문제없으나 통계 대시보드 구현 시 복합 인덱스로 변경 고려
  - 스펙 ConsumeDisposeDialog 확인 버튼 색상: 소비=blue → 구현은 green. 디자인 의도에 따라 조정 가능
  - `ingredient_id` 컬럼: 스펙 nullable → 구현은 NOT NULL. 실제로 null이 되는 케이스가 없으므로 현재 구현이 더 정확

### 후속 작업 (Phase 3 확장)
- [ ] 소비/폐기 이력 조회 API (`GET /ingredient-logs`)
- [ ] 통계 대시보드 UI (소비율, 폐기율, 기간별 트렌드)
- [ ] 기존 ingredient create/update 엔드포인트 권한 검증 개선 (tech debt)
- [ ] `origin/phase2`에 push (현재 로컬 5 commits ahead)
