# 프로젝트 개요
- **이름:** Recipick (레시픽)
- **목적:** 1인 가구 및 소규모 가구를 위한 식재료 관리 및 초개인화 AI 맞춤 레시피 추천 서비스
- **핵심 철학 1:** **"Frictionless Input (입력 최소화)"** - 영수증/음성 입력을 통한 자동화
- **핵심 철학 2:** **"Intuitive Storage (직관적 보관)"** - 냉장고 내 보관함 단위의 세밀한 위치 관리
- **핵심 철학 3:** **"Hyper-Personalization (초개인화)"** - 유저의 장비, 알러지, 실력에 맞춘 AI 레시피

# 기술 스택 (Tech Stack) - All Native (No Docker Policy)
## 1. Frontend (Native Process)
- **Core:** React 18+, TypeScript, Vite
- **Styling:** TailwindCSS
- **State:** Zustand
- **Run:** `npm run build` 후 Nginx 서빙 및 HTTPS(Certbot) 적용

## 2. Backend (Native Process)
- **Core:** Python 3.10+, FastAPI (Product Engineer 지향, AI 결합 최적화)
- **ORM & DB Control:** SQLModel (또는 SQLAlchemy) + Alembic
- **AI Orchestration:** LangGraph (상태 기반 AI 워크플로우 제어)
- **Auth:** OAuth 2.0 (카카오/구글 등) + JWT 기반 인증
- **Run:** Uvicorn + PM2 (백그라운드 프로세스 관리)

## 3. Database (Native Process - No Docker)
- **RDBMS:** PostgreSQL 16+ (APT 설치)
- **Extension:** `pgvector` (추후 벡터 검색 대비)

# 주요 도메인 및 데이터 구조 (Data Modeling)
가족 공유 및 초개인화를 고려한 구조를 가집니다.

1. **User (사용자):** `id`, `oauth_provider`, `oauth_id`, `nickname`
2. **UserPreference (개인화 정보):** `user_id`, `cooking_skill` (상/중/하), `max_time`, `allergies` (List), `cooking_tools` (List), `dietary_habits`
3. **Refrigerator (냉장고):** `id`, `name` (예: 우리집 냉장고)
4. **RefrigeratorMember (공유 매핑):** `refrigerator_id`, `user_id`, `role` (OWNER, GUEST) - 가족 공유 기능을 위한 N:M 테이블
5. **StorageBox (보관함):** `id`, `refrigerator_id`, `name` (예: 야채칸), `type` (ENUM: ROOM, FRIDGE, FREEZER)
6. **Ingredient (식재료):** `id`, `storage_box_id`, `name`, `quantity`, `expiry_date`

# 주요 파이프라인 (Logic Flow)
1. **Authentication:** OAuth를 통해 로그인한 사용자만 본인이 속한(RefrigeratorMember) 냉장고의 데이터에 접근 가능.
2. **Zero-Storage Image Processing:** 영수증 등은 디스크 저장 없이 Base64 메모리 패스스루 방식으로 Gemini API에 전송 후 파기.
3. **AI Auto-Categorization:** Gemini가 식재료 추출 시 보관함 타입(ROOM/FRIDGE/FREEZER)을 예측하여 최적의 보관함을 추천.
4. **Hyper-Personalized Recipe:** - 사용자의 `UserPreference`(알러지 제외, 보유 도구 활용)와 냉장고의 유통기한 임박 재료를 결합하여 LangGraph 기반으로 Gemini에게 프롬프팅.
5. **Smart Deduction (스마트 차감):** 요리 완료 시 AI가 차감할 식재료/수량 제안 -> 사용자가 UI에서 확인/수정(`+`, `-`) 후 DB 최종 반영.

# 개발 방법론 (TDD - Strict Mode)
**CRITICAL: TDD 위반 시 PR 승인 불가**
1. 🔴 **Red:** 실패하는 테스트 작성
2. 🟢 **Green:** 테스트를 통과하는 최소 구현
3. 🔵 **Refactor:** 코드 개선 (테스트 유지)
- **Frontend:** `Vitest`, `React Testing Library`
- **Backend:** `Pytest`, `pytest-asyncio`

# 인프라 및 배포 전략 (Infrastructure)
**"No Docker Policy" & Memory Optimization**
- **Server:** AWS Lightsail (2 vCPU, 2GB RAM, 60GB SSD)
- 모든 서비스는 OS Native 프로세스로 구동한다.
- **Web Server:** Nginx (Reverse Proxy to FastAPI, HTTPS 적용)
- **Memory Management:** 2GB Swap 파티션을 구성하여 OOM 방지. Python 힙 메모리 모니터링.