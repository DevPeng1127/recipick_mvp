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
