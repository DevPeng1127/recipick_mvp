# 프로젝트 개요
- **이름:** Recipick (레시픽)
- **목적:** 1인 가구 및 소규모 가구를 위한 식재료 관리 및 초개인화 AI 맞춤 레시피 추천 서비스
- **핵심 철학 1:** **"Frictionless Input (입력 최소화)"** - 영수증/음성 입력을 통한 자동화
- **핵심 철학 2:** **"Intuitive Storage (직관적 보관)"** - 냉장고 내 보관함 단위의 세밀한 위치 관리
- **핵심 철학 3:** **"Hyper-Personalization (초개인화)"** - 유저의 장비, 알러지, 실력에 맞춘 AI 레시피

# 기능 개발 우선순위 (2026-10-26 합의)

1. 자동 입력: **영수증 사진 우선**, 이후 음성 입력. 인식 결과는 사용자가 확인·수정한 뒤 등록한다.
2. 가족 공유: 냉장고 초대·가입·회원 관리.
3. 요리 후 스마트 차감: 사용 재료·수량을 확인한 뒤 재고와 소비 이력에 반영한다.
4. 마이페이지의 소비·폐기 이력 대시보드.
5. AI 보관 위치 추천은 **먼 미래의 후보**로 보류한다.

첫 1시간 작업으로 영수증 사진 입력의 기본 흐름을 구현·검증했다. 사용자의 결과 컨펌과 커밋 승인에 따라 `codex/receipt-photo-import` 브랜치의 이번 로컬 커밋에 포함한다. 상세 범위와 검증 결과는 [기능 개발 기록](docs/feature-roadmap.md)을 따른다. 다음은 음성 자동 입력이며 입력 방식을 확인한 뒤 진행한다. 나머지 우선순위는 계획이며 전체 기능의 구현 승인을 뜻하지 않는다.

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
3. **AI Auto-Categorization (먼 미래로 보류):** Gemini가 식재료 추출 시 보관함 타입(ROOM/FRIDGE/FREEZER)을 예측하여 최적의 보관함을 추천하는 장기 구상. 현재 개발 범위에서는 사용자가 보관함을 직접 선택한다.
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
