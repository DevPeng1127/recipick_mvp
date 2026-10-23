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
- npm 11.19.1 이상(11.x) — 검증 버전은 11.19.1이며 `frontend/package.json`에 기록
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

호출은 기존 REST `generateContent`를 사용합니다. Gemini 3 권장 temperature `1.0`, 모델 기본 추론 수준(3.5 Flash-Lite는 `minimal`), 기존 `maxOutputTokens=2048`과 HTTP 단계별 타임아웃 30초를 적용합니다. HTTP 요청 전체에는 추가로 60초 제한을 둡니다. 완결된 응답의 텍스트 조각만 합쳐 레시피로 반환하며, 답변 없이 차단되거나 출력 한도로 잘린 응답은 성공으로 처리하지 않습니다. 자동 재시도나 다른 모델로의 전환은 하지 않습니다.

API 키는 [Google의 인증 방식](https://ai.google.dev/api#authentication)에 따라 `x-goog-api-key` 헤더로 전달합니다. 요청 URL과 본문에는 넣지 않으며, 설정 객체의 문자열·JSON 출력에서는 마스킹합니다. Gemini의 HTTP·연결·시간 초과·JSON 해석 오류는 내부 오류로 변환해 원문이 서버에 다시 출력되지 않도록 처리합니다. 앱 오류 로그에는 요청 방식·라우트 패턴·오류 종류·공급자 상태 코드·코드 위치만 남기고, 응답 본문·인증 헤더·예외 원문·지역 변수는 기록하지 않습니다. 일반 공급자 오류 응답은 HTTP 500이며 사용량 초과는 아래의 HTTP 429 안내를 유지합니다.

#### 레시피 추천 사용량 제한

| 대상 | 동시 요청 | 최근 60초 | 하루 | 하루 초기화 기준 |
| --- | --- | --- | --- | --- |
| 로그인 계정별 | 1건 | 3회 | 20회 | 한국 시간 자정 |
| 앱 전체 | 계정별 제한 적용 | 12회 | 400회 | 미국 태평양 시간 자정, 서머타임 반영 |

- Gemini 호출 직전에 횟수를 DB에 기록합니다. 성공·공급자 오류·시간 초과는 집계하며, 권한 거부·식재료 없음·앱의 한도 초과처럼 AI 호출 전에 끝난 요청은 집계하지 않습니다. 서버 재시작 후에도 횟수는 유지됩니다.
- 제한 시 HTTP 429와 이유를 반환하고, 확정할 수 있는 재시도 시각을 화면에 한국 시간으로 표시합니다. 진행 중인 요청이나 Google이 재시도 시간을 제공하지 않은 경우에는 정확한 시각을 임의로 안내하지 않습니다.
- 기존 개발 환경에도 `cd backend` 후 `alembic upgrade head`를 실행해 `recipe_usage_attempts` 테이블을 생성해야 합니다. 적용 후 실행 중인 백엔드를 재시작하거나 개발 서버의 자동 재로딩을 확인합니다. DB에 기록할 수 없으면 AI 호출을 진행하지 않습니다.
- 사용량 기록은 성공·실패 요청의 트랜잭션과 별도로 저장합니다. 짧은 PostgreSQL 잠금으로 여러 프로세스의 한도 확인·기록을 직렬화하고, AI 응답을 기다리는 동안에는 이 잠금을 유지하지 않습니다. 비정상 종료로 남은 진행 상태는 90초 뒤 풀립니다. 2일보다 오래된 사용량 기록은 다음 허용 요청에서 정리합니다.
- 제한값은 `backend/app/services/recipe_usage.py`에 있습니다. 같은 DB를 사용하는 앱 프로세스가 집계 대상이며, 같은 Google 프로젝트를 사용하는 다른 앱의 호출량이나 별도의 입력 토큰 한도(TPM)를 추적하지는 않습니다. Google에서 한도 초과가 발생하면 별도 안내를 표시합니다.

### 3. Frontend

```bash
cd frontend
npm ci
npm run dev
```

`npm ci`는 커밋된 `package-lock.json`의 버전대로 설치합니다. Node 22.19.0 / npm 11.19.1에서 검증했습니다. 기존 npm 10.9.3에서는 Vitest 의존성 설치 중 `edgesOut` 오류가 발생하여 npm을 업데이트했습니다. 다른 PC에서도 먼저 `node --version`과 `npm --version`을 확인합니다. `packageManager` 항목만으로 시스템 npm이 자동 업데이트되지는 않습니다.

Windows PowerShell에서 호스트·포트 옵션을 추가할 때는 `npm.cmd run dev -- --host 127.0.0.1 --port 5175 --strictPort`를 사용합니다. 이 환경에서는 `npm`의 PowerShell 실행 파일이 옵션을 가로채는 현상이 확인되었습니다.

설치 스크립트는 `package.json`의 `allowScripts`에서 검토한 `esbuild@0.25.12`, `msw@2.12.10`만 허용합니다. 패키지 업데이트 후 새 스크립트 승인이 필요하면 `npm install-scripts ls`로 확인하고 검토한 항목만 승인합니다. [npm 설치 스크립트 안내](https://docs.npmjs.com/cli/v11/commands/npm-install-scripts/)

#### 의존성 보안 점검

2026년 10월 19일 업데이트 후 `npm audit` 결과는 24건에서 **7건(High 5, Moderate 2)**으로 줄었고, `npm audit --omit=dev`는 **0건**입니다. 전체 감사는 남은 항목 때문에 종료 코드 1을 반환합니다. Tailwind 3을 유지하기로 한 결정에 따라 `braces`와 `postcss-selector-parser`의 문제가 개발 의존성 7개에 걸쳐 남아 있습니다. 이는 전체 프로젝트의 취약점이 없다는 의미는 아닙니다. 원인·영향 조건·후속 검토 사항은 [항목 10 기록](docs/code-audit-and-repair-log.md#항목-10-수정-기록)을 참고합니다.

## 배포 전 JWT 키 준비

- 현재 `backend/.env`는 로컬 개발 전용입니다. **배포 전에 별도의 운영용 JWT 키를 생성하고 운영 환경의 `JWT_SECRET_KEY`에 설정해야 합니다.**
- 로컬 키를 운영에 복사하지 않습니다. 운영 키는 운영 환경변수 또는 서버의 비공개 설정 파일에 보관하며 Git에 커밋하지 않습니다.
- 동일한 배포의 모든 백엔드 프로세스는 같은 운영 키를 사용해야 합니다. 키 교체 시 재로그인 영향과 프로세스 재시작을 함께 계획합니다.
- 배포를 진행하는 세션은 이 항목을 사용자에게 다시 안내하고 운영 키 준비 여부를 확인합니다.

## Testing

### Backend

```bash
cd backend
python -m pytest --cov=app tests/unit/
```

테스트는 실행할 때 별도의 임시 JWT 키를 생성하여 사용합니다. 로컬·운영 JWT 키 없이도 단위 테스트를 실행할 수 있습니다.

사용량 제한의 PostgreSQL 통합 테스트는 아래와 같이 파일을 지정해 별도로 실행합니다. 로컬 주소의 개발 DB에서 무작위 전용 스키마를 생성하며, 종료 시 그 스키마만 제거합니다. 기존 애플리케이션 테이블이나 사용량은 변경하지 않습니다. 다음은 PowerShell 예시입니다.

```powershell
# backend 폴더에서 실행
$env:RECIPICK_RUN_POSTGRES_TESTS = '1'
.venv\Scripts\python.exe -m pytest tests/integration/test_recipe_usage.py -q -p no:cacheprovider
Remove-Item Env:RECIPICK_RUN_POSTGRES_TESTS
```

이 파일은 기존 `setup_db`/`drop_all` 픽스처를 사용하지 않습니다. 다른 통합 테스트의 DB 초기화 방식은 별도 점검 대상이므로 위 명령의 테스트 경로를 그대로 사용합니다.

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
