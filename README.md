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

# DB 마이그레이션
alembic upgrade head

# 개발 서버 실행
uvicorn app.main:app --reload
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

## Testing

### Backend

```bash
cd backend
pytest --cov=app tests/
```

### Frontend

```bash
cd frontend
npm run test
```

## API Docs

백엔드 실행 후: http://localhost:8000/docs
