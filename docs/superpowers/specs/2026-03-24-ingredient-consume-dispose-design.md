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
| `refrigerator_id` | `int` | FK → refrigerators.id, SET NULL on delete, nullable | Source refrigerator (preserved if fridge deleted) |
| `ingredient_id` | `int` | nullable | Original ingredient ref (null if fully consumed/disposed) |
| `action_type` | `varchar(20)` | NOT NULL, CHECK in ('consumed','disposed') | Consume vs dispose |
| `ingredient_name` | `varchar(100)` | NOT NULL | Denormalized (queryable after original deleted) |
| `quantity` | `float` | NOT NULL | Amount consumed/disposed |
| `unit` | `varchar(20)` | NOT NULL | Unit of measurement |
| `memo` | `text` | nullable | Optional user note |
| `created_at` | `timestamp` | NOT NULL, default=now | When the action occurred |

**Indexes:**
- `ix_ingredient_logs_user_id` — per-user history queries
- `ix_ingredient_logs_created_at` — time-range statistics
- `ix_ingredient_logs_action_type` — consume/dispose filtering

### Existing Tables: No Changes

The `ingredients` table remains unchanged. Partial consume/dispose reduces `quantity` in place.

## API Endpoints

### Removed

- `DELETE /storage-boxes/{storage_box_id}/ingredients/{ingredient_id}` — replaced by consume/dispose

### New Endpoints

#### POST `/storage-boxes/{storage_box_id}/ingredients/{ingredient_id}/consume`

Consume an ingredient (fully or partially).

**Request Body:**
```json
{
  "quantity": 5.0,       // optional: omit or null for full quantity
  "memo": "scrambled eggs"  // optional
}
```

**Response:**
- Full consume (quantity >= current): `204 No Content` (ingredient deleted)
- Partial consume: `200 OK` with updated `IngredientResponse`
- Invalid quantity (> current): `400 Bad Request`

#### POST `/storage-boxes/{storage_box_id}/ingredients/{ingredient_id}/dispose`

Dispose of an ingredient (fully or partially). Same request/response contract as consume.

**Request Body:**
```json
{
  "quantity": null,           // null/omit = full disposal
  "memo": "mold discovered"  // optional
}
```

### Business Logic

1. Validate ingredient exists and belongs to storage box
2. Validate user has access to the refrigerator
3. If `quantity` is null/omitted or >= ingredient.quantity → **full action**:
   - Create `ingredient_log` with the ingredient's full quantity
   - Delete the ingredient from `ingredients` table
   - Return `204 No Content`
4. If `quantity` < ingredient.quantity → **partial action**:
   - Create `ingredient_log` with the specified quantity
   - Subtract quantity from ingredient (`ingredient.quantity -= request.quantity`)
   - Return `200 OK` with updated ingredient
5. If `quantity` <= 0 → `400 Bad Request`

## Frontend UI

### IngredientCard KebabMenu Changes

**Before:** `수정` | `삭제`
**After:** `수정` | `소비` | `폐기`

### ConsumeDisposeDialog Component

New dialog component triggered from KebabMenu.

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
- "수량 지정" tab: shows quantity input, default = current quantity
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

### Frontend API Client

Add to `frontend/src/api/ingredients.ts`:
- `consumeIngredient(storageBoxId, ingredientId, body)` → POST consume endpoint
- `disposeIngredient(storageBoxId, ingredientId, body)` → POST dispose endpoint

Remove:
- `deleteIngredient()` — replaced by consume/dispose

## Testing Strategy

### Backend Unit Tests
- Consume full quantity → ingredient deleted + log created
- Consume partial quantity → ingredient quantity reduced + log created
- Dispose full quantity → ingredient deleted + log created
- Dispose partial quantity → ingredient quantity reduced + log created
- Invalid quantity (> current, <= 0) → 400 error
- Memo saved correctly (with and without)
- Log contains correct denormalized data (name, unit)

### Frontend Unit Tests
- ConsumeDisposeDialog renders correctly for consume/dispose modes
- Tab switching between "전부" and "수량 지정"
- Quantity validation (not > current, not <= 0)
- API calls with correct payloads
- State updates after full/partial actions
- KebabMenu shows 소비/폐기 instead of 삭제

## Out of Scope

- Statistics dashboard UI (future phase)
- Aggregation/reporting API endpoints (future phase)
- Undo consume/dispose
- Batch consume/dispose
