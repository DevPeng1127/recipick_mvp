# Recipick MVP

AI 기반 냉장고 식재료 관리 및 초개인화 레시피 추천 서비스

## Tech Stack

- **Backend**: Python 3.10+, FastAPI, SQLAlchemy (async), Alembic
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Zustand, React Router
- **Database**: PostgreSQL 16+ (Native)
- **AI**: LangGraph + Gemini 3.5 Flash-Lite
- **Auth**: OAuth 2.0 (Kakao/Google) + JWT

## Prerequisites

- Python 3.10+
- Node.js 20.19 이상(20.x), 22.13 이상(22.x), 또는 24 이상 — 린트 도구의 실행 조건
- PostgreSQL 16+

## Setup

### 1. Database

```bash
# PostgreSQL에 recipick DB 생성
createdb recipick
# 테스트용 DB
createdb recipick_test
```

### 2. Backend

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

pip install -e ".[dev]"

# 환경 변수 설정
cp .env.example .env
# .env 파일에서 DB URL, API 키 등 설정

# JWT 서명 키 생성 후 출력값을 .env의 JWT_SECRET_KEY에 설정
python -c "import secrets; print(secrets.token_urlsafe(32))"

# DB 마이그레이션
alembic upgrade head

# 개발 서버 실행
uvicorn app.main:app --reload
```

`JWT_SECRET_KEY`는 개발·운영 모두 필수입니다. 누락, 빈 값, 공개된 기본값, 32바이트 미만 값, 앞뒤 공백이 있는 값은 서버 시작 시 거부됩니다. 키는 한 번 생성해 환경 설정에 보관하며 서버 재시작마다 새로 만들지 않습니다. 키를 교체하면 기존 로그인 토큰과 진행 중인 OAuth 인증 상태가 무효화되므로 서버 재시작 후 다시 로그인해야 합니다.

#### Gemini 무료 개발 설정

`backend/.env`에 `GEMINI_API_KEY`와 `GEMINI_MODEL=gemini-3.5-flash-lite`를 설정합니다. 기존 `.env`가 있다면 모델 항목도 직접 바꿔야 합니다. 코드의 기본값이나 `.env.example`만 변경해도 기존 `.env`를 덮어쓰지는 않습니다. 실행 중인 백엔드는 설정 변경 후 재시작합니다.

- Google AI Studio의 **Projects → Billing Tier**에서 해당 API 키의 프로젝트가 **Free**인지 확인합니다. 무료 개발에는 이 프로젝트의 키를 사용하며 유료 등급으로 업그레이드할 필요가 없습니다. 모델 이름을 바꿔도 프로젝트의 결제 등급은 바뀌지 않습니다. [과금 안내](https://ai.google.dev/gemini-api/docs/billing)
- 2026년 10월 19일 확인 기준, 이 모델의 일반 텍스트 입력·출력은 무료 등급에서 무료입니다. 무료 등급의 입력·응답은 Google 제품 개선에 사용될 수 있으므로 개발 검증에는 가상 식재료·설정을 사용합니다. [가격과 데이터 사용 안내](https://ai.google.dev/gemini-api/docs/pricing)
- 분당 요청·토큰 수와 일일 요청 한도는 AI Studio에 표시되는 실제 프로젝트 한도를 확인합니다. 한도 초과 시 요청이 제한됩니다. [사용량 제한](https://ai.google.dev/gemini-api/docs/rate-limits)

호출은 기존 REST `generateContent`를 사용합니다. Gemini 3 권장 temperature `1.0`, 모델 기본 추론 수준(3.5 Flash-Lite는 `minimal`), 기존 `maxOutputTokens=2048`과 HTTP 타임아웃 30초를 적용합니다. 완결된 응답의 텍스트 조각만 합쳐 레시피로 반환하며, 답변 없이 차단되거나 출력 한도로 잘린 응답은 성공으로 처리하지 않습니다. 자동 재시도나 다른 모델로의 전환은 하지 않습니다.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

## 배포 전 JWT 키 준비

- 현재 `backend/.env`는 로컬 개발 전용입니다. **배포 전에 별도의 운영용 JWT 키를 생성하고 운영 환경의 `JWT_SECRET_KEY`에 설정해야 합니다.**
- 로컬 키를 운영에 복사하지 않습니다. 운영 키는 운영 환경변수 또는 서버의 비공개 설정 파일에 보관하며 Git에 커밋하지 않습니다.
- 동일한 배포의 모든 백엔드 프로세스는 같은 운영 키를 사용해야 합니다. 키 교체 시 재로그인 영향과 프로세스 재시작을 함께 계획합니다.
- 배포를 진행하는 세션은 이 항목을 사용자에게 다시 안내하고 운영 키 준비 여부를 확인합니다.

## Testing

### Backend

```bash
cd backend
pytest --cov=app tests/
```

테스트는 실행할 때 별도의 임시 JWT 키를 생성하여 사용합니다. 로컬·운영 JWT 키 없이도 단위 테스트를 실행할 수 있습니다.

### Frontend

```bash
cd frontend
npm run test
npm run lint
npm run build
```

`npm run lint`는 JavaScript·TypeScript 코드와 React Hooks 사용 방식을 정적으로 검사합니다. 사용하지 않는 변수, 잘못된 Hooks 호출, 빠진 의존성 등을 찾아내며 경고가 있어도 실패합니다. 검사 규칙은 `frontend/eslint.config.js`에 있고, 빌드 산출물인 `dist/`와 테스트 커버리지 결과는 검사에서 제외합니다.

## API Docs

백엔드 실행 후: http://localhost:8000/docs
