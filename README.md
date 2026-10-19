# Recipick MVP

AI 기반 냉장고 식재료 관리 및 초개인화 레시피 추천 서비스

## Tech Stack

- **Backend**: Python 3.10+, FastAPI, SQLAlchemy (async), Alembic
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Zustand, React Router
- **Database**: PostgreSQL 16+ (Native)
- **AI**: LangGraph + Gemini 2.0 Flash
- **Auth**: OAuth 2.0 (Kakao/Google) + JWT

## Prerequisites

- Python 3.10+
- Node.js 18+
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
```

## API Docs

백엔드 실행 후: http://localhost:8000/docs
