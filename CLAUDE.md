# Recipick MVP

## Architecture
- **Backend**: Python 3.12 / FastAPI / async SQLAlchemy + asyncpg (`backend/`)
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS (`frontend/`)
- **DB**: Native PostgreSQL (no Docker), test DB: `recipick_test`
- **AI**: LangGraph + Gemini 2.0 Flash for recipe recommendations
- **Auth**: OAuth 2.0 (Kakao/Google) + JWT
- **State**: Zustand (frontend stores)

## Key Paths
- Backend entry: `backend/app/main.py`
- API router: `backend/app/api/v1/router.py`
- API routes: `backend/app/api/v1/` (auth, users, refrigerators, storage_boxes, ingredients, recipes)
- Models: `backend/app/models/` (user, refrigerator, storage, ingredient)
- Schemas: `backend/app/schemas/`
- Services: `backend/app/services/`
- Frontend entry: `frontend/src/main.tsx` (BrowserRouter wrap)
- Routes: `frontend/src/App.tsx`
- Pages: `frontend/src/pages/`
- Components: `frontend/src/components/`
- Stores: `frontend/src/stores/` (Zustand)
- API clients: `frontend/src/api/`
- Types: `frontend/src/types/`

## Dev Commands
```bash
# Backend
cd backend && source .venv/Scripts/activate
pytest tests/unit/ -v          # unit tests (no DB needed)
uvicorn app.main:app --reload  # dev server :8000

# Frontend
cd frontend
npm run dev                    # dev server :5173
npm run test                   # vitest
npm run build                  # production build
npx tsc --noEmit               # type check
```

## Conventions
- TDD: Pytest (backend) + Vitest (frontend)
- Korean UI, English code
- Windows Git Bash: use `/c/Users/...` path format
- `pytest-asyncio` mode=auto, DB fixtures not autouse (unit tests must run without DB)

## API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/recipes/recommend` | AI recipe recommendation (body: `{ refrigerator_ids: [int] }`) |
| GET | `/api/v1/refrigerators` | List user's refrigerators (returns `is_favorite`, `top_ingredients`, `total_ingredient_count`, ordered by favorite+display_order) |
| GET | `/api/v1/refrigerators/{id}` | Refrigerator detail (with members, storage_boxes) |
| PATCH | `/api/v1/refrigerators/{id}/favorite` | Toggle favorite (returns `{ is_favorite: bool }`) |
| PUT | `/api/v1/refrigerators/reorder` | Reorder refrigerators (body: `{ ordered_ids: [int] }`) |
| PUT | `/api/v1/refrigerators/{id}/storage-boxes/reorder` | Reorder storage boxes (body: `{ ordered_ids: [int] }`) |
| GET | `/api/v1/ingredients/search?q=` | Search ingredients across all user's refrigerators (ILIKE) |
| GET | `/api/v1/storage-boxes/{id}/ingredients` | List ingredients in storage box |
| POST | `/api/v1/storage-boxes/{id}/ingredients` | Create ingredient |

## Data Flow Notes
- `RefrigeratorListResponse` returns `is_favorite` + `top_ingredients` (up to 7, sorted by expiry) + `total_ingredient_count` (not `storage_boxes`)
- `RefrigeratorMember` has `is_favorite` (bool) and `display_order` (int) for per-user ordering
- `StorageBox` has `display_order` (int) for ordering within a refrigerator
- `RefrigeratorDetailResponse` still returns `storage_boxes` and `members`
- Recipe recommendation accepts `refrigerator_ids: list[int]` (multiple fridges), deduplicates ingredients by name
- Ingredient search joins Ingredient → StorageBox → Refrigerator → RefrigeratorMember to scope results to current user

## Phase History
- **Phase 1**: Initial MVP (auth, refrigerator CRUD, storage box, ingredients, AI recipe)
- **Phase 2**: Onboarding, ingredient units/shelf life, refrigerator card redesign, CRUD UI
- **Phase 2.5**: UX improvements
  - StorageBoxPage empty state bug fix (error no longer hides ingredient form)
  - Multi-select recipe recommendation (card grid + single button)
  - Refrigerator card ingredient preview with D-day badges (red 0-3d / orange 4-7d / green 8d+)
  - Dashboard ingredient search ("어디다 뒀더라?" with debounced ILIKE search)
  - Ingredient unit input: custom unit mode ↔ dropdown toggle ("목록" button)
  - Ingredient quantity: `int` → `float` (supports decimal like 0.5)
  - Quantity input: removed `min` constraint, validates on submit (allows typing 0.5 naturally)
  - Favorite refrigerator: star toggle on cards, favorites sorted to top (`is_favorite DESC`)
  - Drag-and-drop reorder: refrigerator cards + storage box cards (`@dnd-kit/sortable`, `display_order`)
