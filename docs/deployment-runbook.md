# Recipick 운영 배포 기록

## 최신 배포 — 스마트 차감 잠금 순서 수정 (2026-11-07)

**`b2b5c9f` 커밋·운영 배포·기본 검증·원격 푸시를 완료했다.** 브랜치 **`codex/cooking-lock-order`**, 배포 이력 ID **`COOKING-LOCK-RELEASE-20261107`**. 이번 배포 기록도 같은 브랜치에 후속 문서 커밋으로 푸시한다. 아래 11-04 이전 문단은 당시 배포 이력이다.

- 사용자가 검증 결과를 확인하고 커밋·운영 반영·기록 갱신·원격 푸시를 승인했다. 분석·수정·39개 신규 회귀를 포함한 **`b2b5c9f fix: order inventory locks and commit before success responses`**를 기존 Cloud Run에 반영했다.
- 잠금은 냉장고 ID순 → 보관함 ID순 → 재료 ID순으로 획득하고 차감의 보관함은 SHARE를 사용한다. 관련 정렬·삭제·등록 경로와 회원/재고 재검사, 차감·관련 관리 API의 commit 완료 후 성공 응답 처리를 함께 반영했다.
- 배포 전 별도 운영 JWT 준비 원칙을 안내했다. 보관된 운영 키가 실제 Secret Manager 활성 버전 1과 일치하고 개발 키와 다름을 값 출력 없이 확인했다. 기존 비밀 참조, 1CPU/1GiB·동시성 2·120초·요청 기반 CPU·확장/ingress 설정으로 배포했다.
- 기존 Dockerfile의 `python:3.12-slim` 태그를 해석해 Linux/amd64 이미지를 빌드했다. 이번 베이스 인덱스는 `sha256:4840d514c583a4d3d8cad3940e68dee6f0f6f3635c12fcd0a3d74c21a5b93a54`다. 해시 고정 requirements 설치, 전체 앱 소스/requirements 해시 일치, 비루트 UID 10001 및 개발 `.env`/테스트 제외를 확인했다. 외부 통신 없이 저장된 메뉴 정상/불일치 거절과 음료 0.25L/0.5L 표본을 재생했다.
- 기존 격리 PostgreSQL 전체 백엔드 **732개 통과**에는 신규 회귀 **39개**가 포함된다. 테스트 증빙의 소스 해시 14개를 이번 작업 트리에 다시 대조했다. 이후 제품 소스 변경 없이 배포 산출물과 운영 연결을 검증했다.
- Cloud Run **`recipick-api-locks-b2b5c9f`** Ready·트래픽 **100%**, Linux 실행 manifest **`sha256:7f5b9c4452f8819959690104927132cf654d65931d04fca9588db38e78ea6468`** 일치 확인. 업로드된 이미지 인덱스는 `sha256:3934ec551fb0f54de308e0cd8a0938d8c290dfc92a18526dd76f8a004b2ab5ff`다.
- 운영 HTTPS health·미인증 접근 거절·CORS 허용/거절·Google/Kakao 콜백 설정·운영 서명 검사와 Neon 읽기 통과. 공개 HTML/JS/CSS 바이트와 6개 SPA 경로·캐시 정책도 일치했다. Firebase Hosting은 버전 **`e0726020915cb379`**, 릴리스 **`1793678139105000`**로 서비스 중이며 새 Hosting 릴리스는 생성하지 않았다.
- 확인 시점 새 리비전의 ERROR 이상 로그는 **0건**이었다. 운영 점검은 읽기 전용이며 동시 차감/롤백의 검증 근거는 격리 DB 회귀 결과다. 운영 실재고 차감·소셜 재로그인·브라우저 조작·모바일 세션은 이번 점검 범위 밖이다. 외부 AI 호출 0회, DB 마이그레이션 0건.
- 복구가 필요하면 직전 **`recipick-api-onboard-de2e409`**로 트래픽을 전환할 수 있다. 기존 Hosting 및 DB 스키마와 호환되며, 복구하면 이번 잠금 순서·commit 응답 개선이 해제된다. 실제 롤백은 실행하지 않았다.
- 공유 가능한 증빙은 [배포 검증 JSON](evidence/cooking-lock-release-20261107.json)이다. 무시된 `.deploy/`에 `locks-release-before.json`, `locks-release-previous-hosting.json`, `locks-image-metadata.json`, `locks-linux-manifest.txt`, `locks-release-verification.json`과 해당 릴리스 실행 스크립트를 보관했다. 이 경로에는 보호된 비밀 설정도 있어 Git에 포함하지 않는다.

**2026-11-04 후속 상태:** 아래 첫 설정 수정/배포 기록 `bc2a1f5`까지 `origin/codex/onboarding-deduplication`에 푸시하고 로컬/원격 해시를 대조했다. 운영 코드는 `de2e409`를 유지한다. 실제 자원·결제·예산을 재조회한 [현재 사양·비용·한도](deployment-cost-plan.md)를 추가했고, 이 문서 갱신도 같은 브랜치에 커밋·푸시한다. 이력 ID `INFRA-LIMITS-20261104`. 아래의 ‘원격 미푸시’는 각 배포 당시 기록이다.

**2026-11-03 당시 첫 설정 냉장고 중복 방지 `de2e409` 배포·운영 기본 검증을 완료했다.** 브랜치 `codex/onboarding-deduplication`, 배포 문서 이력 ID `ONBOARDING-RELEASE-20261103`, 당시 원격 미푸시. 첫 배포는 `c256b5c`/`DEPLOY-20261102`, 직전은 도움말·음료 보정 `4c092cd`/`HELP-BEVERAGE-RELEASE-20261102`이며 아래 각 과정은 당시 기록이다.

## 첫 설정 냉장고 중복 방지 배포 (2026-11-03)

- 사용자 승인 후 코드·회귀 테스트·문서 12개를 **`de2e409 fix: prevent duplicate refrigerators during onboarding`**로 커밋했다. 새 `POST /api/v1/refrigerators/initial`를 포함한 **백엔드 먼저**, 새 API를 호출하는 프런트를 이어 배포했다. DB 마이그레이션·키 교체·요금제/자원 한도 변경은 없다.
- 운영 JWT 준비: 배포 전 별도 운영 키 필요 원칙을 안내하고, 개발 키와 다른 기존 운영 키가 실제 Secret Manager 활성 버전 1과 일치함을 값 출력 없이 확인했다. 기존 secret 참조·1CPU/1GiB·동시성 2·120초·요청 기반 CPU·확장/ingress 설정을 보존했다.
- 산출물 검증: 운영 API 주소로 TypeScript/Vite 빌드 통과. 이미지의 전체 앱 Python 소스/requirements 해시 일치·UID 10001·개발 `.env`/테스트 제외, 프런트의 새 API/진행 문구·운영 주소 포함 및 알려진 비밀 값 제외 확인. 외부 통신 없이 기존 메뉴 표본/불일치 거절·주스 0.25L/0.5L 재생도 통과했다. 앞선 전체 백엔드 693개·프런트 192개·린트 검증 이후 앱 코드 변경이 없어 전체 테스트는 중복 실행하지 않았다.
- 운영 검증: Cloud Run Ready·트래픽 100%·실행 manifest digest 일치. 공개 HTML/JS/CSS 바이트 일치, `/onboarding`·`/dashboard`·`/recipes`·`/login`·두 OAuth 콜백 SPA 경로와 캐시 정책 정상. health·새 초기 준비 API 미인증 401·CORS 허용/불허·두 OAuth 콜백 URL·기존 서명/Neon 연결 정상. 브라우저 1280×720에서 기존 로그인·대시보드의 현재 냉장고 목록·새로고침 정상, 반환된 콘솔 오류/경고 0건. 임시 검증 탭만 닫았다.
- 적용/한계: 화면을 새로고침하면 버튼 잠금과 새 초기 준비 API가 적용된다. 운영에서 첫 설정을 재제출하지 않았고 사용자 데이터/설정 변경·기존 냉장고 삭제·AI 호출은 하지 않았다. 연속 클릭/동시 요청/실패 후 재시도는 격리 환경의 자동·브라우저 테스트 결과를 따른다. 소셜 재로그인·모바일 실기기는 다시 검증하지 않았다.
- 복구 기준: 직전 Cloud Run **`recipick-api-help-4c092cd`**, Hosting **`33b7700e4d1ebba7`**/릴리스 **`1793604374537000`**. 이전 버전으로 복구해야 한다면 **Hosting을 먼저 이전 버전으로 전환한 뒤 Cloud Run**을 전환해야 새 프런트가 없는 API를 호출하지 않는다. 기존 중복 방지 기능은 복구 시 사라진다. 현재 정상 검증되어 복구를 실행하지 않았고 별도 데이터 롤백은 없다.
- 증빙: 저장소 밖 `C:/Users/pengveloper/.codex/visualizations/2026/10/23/01a16717-7b50-7211-8e19-054d43dd6b76/recipick-onboarding-production.jpg`. 무시된 `.deploy/`에 `onboard-release-before.json`, `onboard-release-previous-hosting.json`, `onboard-image-metadata.json`, `onboard-release-verification.json` 보관. 이미지 인덱스 digest **`sha256:b775582f151901f02128e8e044e618e1338778b502180617808f28480e2c7738`**는 아래 Linux 실행 manifest와 구분한다.

### 로컬 Docker 시작 오류 복구

배포 준비 중 Docker Desktop이 꺼져 있어 첫 빌드가 실패했고, 시작 시 두 임시 Unix 소켓에 `The file cannot be accessed by the system` 오류가 발생했다. 개별 소켓 이름 변경도 실패했다. Docker를 정상 종료하고 해당 폴더에 0바이트 소켓만 있음을 확인한 뒤 같은 부모 경로의 백업 이름으로 보존 이동했다. 두 경로를 모두 비운 상태로 재시작한 후 빌드·이미지 검증·업로드를 통과했다. Docker 초기화·업데이트나 이미지/볼륨/설정 삭제는 하지 않았다.

- `%LOCALAPPDATA%/Docker/run` → `run.onboard-de2e409.backup` (기존 소켓 2개). 중간 실패로 재생성된 소켓 1개도 `run.onboard-de2e409.retry.backup`에 보존했다.
- `%LOCALAPPDATA%/docker-secrets-engine` → `docker-secrets-engine.onboard-de2e409.backup` (0바이트 `engine.sock`만 존재, 저장된 비밀 데이터 없음).
- 백업 폴더는 현재 로컬에 남아 있다. 오류 로그가 가리킨 실행 임시 폴더에 한정한 복구이며, 향후 오류에 대해 Docker 데이터 폴더 전체를 이동/삭제하라는 지침이 아니다. 정상 시작 후 Docker를 사용해 이번 배포를 완료했다.

## 도움말 UI·음료 사용량 보정 재배포 (2026-11-02)

- 사용자 승인 후 UI 코드·회귀 테스트·문서 14개를 **`4c092cd feat: fold optional explanations into contextual help`**로 커밋했다. 이 커밋은 음료 보정 **`edf35ca`**를 포함한다. 새 기능/마이그레이션·요금/한도 변경 없이 기존 Cloud Run/Firebase에 반영했다.
- 운영 JWT 준비: 개발 키와 별개인 로컬 보관 운영 키가 실제 Secret Manager 활성 버전 1과 일치함을 값 출력 없이 확인했다. 기존 서비스가 동일 참조를 사용한다. 카카오 버전 2, DB/Gemini/Google 버전 1과 실행·확장 설정을 유지했다.
- 산출물 검증: 운영 API 주소로 TypeScript/Vite 빌드 통과. Linux 컨테이너의 전체 앱 Python 소스/requirements 해시 일치·UID 10001·개발 `.env`/테스트 제외 확인. 네트워크 없이 저장된 메뉴를 재생해 정상/불일치 거절과 주스 1인분 **0.25L**, 2인분 **0.5L**를 확인했다. 프런트의 도움말/운영 주소 포함·알려진 비밀 값 제외 통과. 기존 전체 백엔드 684개·프런트 184개·린트 검증 후 코드 추가 변경이 없어 이를 반복하지 않았다.
- 배포: 검증 이미지를 기존 Registry에 푸시한 뒤 Cloud Run 이미지 참조만 갱신하고 Hosting 정적 파일 3개를 공개했다. Ready·100% 트래픽과 Linux manifest digest 일치 확인. 이미지 인덱스 digest는 `sha256:4c0c5955e5c95f304112f73f24bec54b6f201af71ebeeff66f35295f2d077814`이며 아래 실행 manifest digest와 구분한다.
- 실제 운영 검증: 공개 HTML/JS/CSS 바이트 일치, `/recipes`·`/login`·두 OAuth 콜백 SPA 새로고침/캐시 정책 통과. API health·인증 없는 접근 거절·CORS 허용/불허·로그인 URL의 운영 콜백 정상. 존재하지 않는 사용자의 서명 토큰으로 Neon 연결/거절을 읽기 전용 확인했다. 브라우저 1280×720에서 기존 로그인 세션과 목록, `?` Enter/Space 조작·새로고침 기본 접힘을 확인했다. 빈 화면·오류 오버레이·반환된 콘솔 오류/경고 없음. 임시 탭만 닫았다.
- 적용/한계: 도움말은 새로고침 후 적용된다. 음료 보정은 **새 추천부터** 적용하며 과거 저장 메뉴/재차감 계획은 자동 수정하지 않는다. 외부 AI 호출 0회, 재고·사용자 설정 변경 없음. 운영 실제 AI 생성/차감·소셜 재로그인·모바일 실기기는 재검증하지 않았으며 기존 로컬 테스트를 따른다.
- 복구 기준: 직전 Cloud Run **`recipick-api-menu-b8d8234`**, Hosting **`ec9a514cb5197f41`**/릴리스 **`1793600377238000`**. 필요 시 이전 Cloud Run으로 트래픽을 전환하고 해당 Hosting 버전을 다시 릴리스한다. 현재 정상 검증되어 복구를 실행하지 않았다. 개발/운영 키와 DB 스키마 변경이 없어 별도 데이터 롤백은 없다.
- 증빙: 저장소 밖 `C:/Users/pengveloper/.codex/visualizations/2026/10/23/01a16717-7b50-7211-8e19-054d43dd6b76/recipick-help-production.jpg`. 무시된 `.deploy/`에는 `help-release-before.json`, `help-release-previous-hosting.json`, `help-image-metadata.json`, `help-release-verification.json`을 보관한다. 배포 이력 ID **`HELP-BEVERAGE-RELEASE-20261102`**.

## 메뉴 일관성 개선 재배포 (2026-11-02)

- 사용자가 검증 결과를 확인하고 커밋과 운영 반영을 승인했다. 코드·회귀 테스트·문서 12개를 `b8d8234`로 커밋한 뒤 동일 코드로 Linux 이미지와 운영 API 주소 프런트를 빌드했다. 기존 자동 검증은 백엔드 638개·프런트 182개·린트·타입·빌드 통과다. 앱 소스를 다시 수정하지 않아 전체 테스트를 중복 실행하지 않았으며 배포 산출물과 실제 운영을 추가 검증했다.
- 이미지 `api:menu-b8d8234`의 소스 해시 일치·비루트 실행·개발 `.env`/테스트 제외, 외부 통신 없는 저장 응답 재생(정상 2개·양념 누락 거절)을 확인했다. 프런트 새 오류 처리·운영 주소 포함 및 알려진 비밀 값 제외 검사 통과. 정적 파일 3개를 먼저 공개하고 백엔드는 기존 서비스의 이미지 참조만 갱신했다.
- 운영 JWT는 개발 키와 다르고 활성 Secret Manager 버전 1을 유지함을 값 출력 없이 확인했다. 기존 카카오 버전 2와 나머지 비밀 버전 1, 요청 기반 CPU·최소 0/최대 1·1CPU/1GiB·동시성 2·120초 및 다른 실행 설정을 유지했다. 새로운 마이그레이션·AI 요청·개인 설정 변경·외부 자원 생성·요금제 변경은 없다.
- Cloud Run Ready·트래픽 100%와 실행 manifest digest를 로컬 빌드 출력에 대조했다. 첫 검증 단정문은 푸시한 OCI 인덱스 digest(`sha256:6c90f7d04d63624993c5e85e10732ea292f200bbfc9feaa71dca87077a4b3e0a`)를 Linux 실행 manifest digest와 비교해 실패했으며, 빌드가 출력한 플랫폼 manifest 기준으로 고쳐 통과했다. 배포된 코드가 달라진 문제는 아니다.
- 공개 HTML·JS·CSS가 로컬 빌드와 바이트 단위로 일치한다. `/recipes`, `/login`, 두 OAuth 콜백 경로의 SPA 새로고침, HTML no-cache·해시 자원 immutable, API health·미인증 거절·허용/불허 CORS·두 로그인 URL의 운영 콜백을 확인했다. 기존 운영 JWT로 존재하지 않는 사용자 요청을 보내 서명 검사·Neon 조회 후 `User not found` 응답을 확인했으며 데이터 쓰기는 없다.
- 브라우저 1280×720에서 기존 로그인 세션과 냉장고 목록 표시, 인분 1→2→1 선택, 새로고침 정상. 빈 화면/오류 오버레이 없음, 반환된 콘솔 오류/경고 0건. 검증용 임시 탭만 닫고 사용자 탭을 유지했다. 증빙: `C:/Users/pengveloper/.codex/visualizations/2026/10/23/01a16717-7b50-7211-8e19-054d43dd6b76/recipick-menu-consistency-production.jpg`.
- 적용 범위: **새로 추천받는 메뉴부터** 제목·본문·재료·차감 연결 검증을 적용한다. 과거 저장 메뉴는 자동 변환하지 않는다. 운영에서 AI 재생성·소셜 재로그인·모바일 실기기 검증은 이번에 추가하지 않았다. 메뉴 의미/적정 인분의 한계는 기능 문서를 따른다.
- 복구 기준: 이번 직전 Cloud Run `recipick-api-00002-9nv`와 Hosting `07c280cf4ccbd8ae`/릴리스 `1793584896159000`이다. 이전 Cloud Run도 교체된 카카오 버전 2를 사용한다. 필요 시 이 리비전으로 트래픽을 전환하고 이전 Hosting 버전을 다시 릴리스한다. 현재는 정상 검증되어 복구를 실행하지 않았다.

## 실제 공개 자원

- 웹: **https://recipick-prod-1127.web.app**
- API: **https://recipick-api-inadpqyfnq-as.a.run.app**, API 경로 `/api/v1`, 상태 확인 `/health`.
- Google 프로젝트: `recipick-prod-1127` (`Recipick Production`), 번호 `306978637426`.
- Cloud Run은 Singapore의 `recipick-api`이며 현재 리비전은 **`recipick-api-locks-b2b5c9f`**(트래픽 100%)다. 직전 리비전은 `recipick-api-onboard-de2e409`, 최초 리비전은 `recipick-api-00001-ntg`다.
- 컨테이너는 `asia-southeast1-docker.pkg.dev/recipick-prod-1127/recipick/api:locks-b2b5c9f`, 실행 manifest digest는 **`sha256:7f5b9c4452f8819959690104927132cf654d65931d04fca9588db38e78ea6468`**다.
- Hosting 버전: **`sites/recipick-prod-1127/versions/e0726020915cb379`**, 릴리스 **`1793678139105000`**. 공개 JS `index-CCRzaGyW.js`, CSS `index-BA0K98cz.css`.
- 월 예산: **5,000 KRW**, 해당 Google 프로젝트만, 50%·90%·100% 실제 지출 알림. 기본 결제 관리자/사용자 알림 수신 유지. **자동 차단/청구 상한이 아니다.**
- 기존 AI/OAuth용 Google 프로젝트 `resolute-vault-478108-h0`는 결제 비활성 상태를 읽기 전용으로 확인했다. 호스팅용 새 프로젝트의 결제 연결과 분리되어 있다. AI Studio 모델 한도 자체의 실시간 확인과는 다르다.

## 확정된 범위

- 현재 Google 계정의 새 호스팅 전용 프로젝트. 기존 Google 프로젝트와 Gemini Free 프로젝트의 결제 설정은 바꾸지 않는다.
- Firebase Hosting 정적 화면 + Cloud Run FastAPI + Neon Free PostgreSQL. 기본 제공 HTTPS 도메인 사용.
- 운영 데이터는 새 빈 DB에서 시작한다. 로컬 계정·재고·가족 데이터는 이전하지 않는다.
- JWT는 새 운영 전용 키를 사용한다. 개발 `.env`는 배포하지 않는다.

## 승인받아 적용한 구성

아래 설정은 사용자에게 제시한 뒤 승인받아 적용했다. 최초 결제 연결 명령은 자동 승인 검토에서 거절되어 미실행이었고, 사용자가 월 5,000원 알림·초과 과금 가능성·자동 차단 없음에 동의한 뒤 생성/연결했다. Firebase 약관도 화면에서 별도 승인을 받아 수락했다.

| 항목 | 설정 |
| --- | --- |
| Google 프로젝트 | `recipick-prod-1127` / `Recipick Production` 생성 완료 |
| 결제 | 현재 계정의 기존 활성 사용량 기반 결제 계정 연결. 신규 체험·정액 약정·Cloud SQL 없음 |
| Cloud Run | Singapore `asia-southeast1`, 1 vCPU, 1 GiB, 요청 기반 과금, 최소 0, 최대 1 인스턴스, 동시 요청 2, 요청 제한 120초 |
| API 이미지 | 검증한 Python 3.12 이미지. 전용 Artifact Registry 저장소에 업로드. 현재 로컬 이미지 약 95 MB |
| 프런트 | Firebase Hosting; API는 Cloud Run 주소로 직접 호출. `VITE_API_BASE_URL`에는 공개 주소만 설정 |
| DB | 이미 생성한 Neon Free, PostgreSQL 16, Singapore, 0.25 CU, 5분 유휴 절전 |
| 비밀 관리 | Secret Manager의 JWT·DB·Gemini·카카오/Google client secret. 공개 client ID는 서버 환경 설정 |
| 비용 목표 | 월 0원에 가깝게 운영, 5,000원을 검토 예산으로 승인. 실제 청구액 보장 아님 |
| 비용 알림 | 원화 결제 계정에 프로젝트 전용 5,000원 기준 50%·90%·100% 알림 생성 완료 |

**예산 알림은 자동 차단이나 청구 상한이 아니다.** GCP는 이 구성의 총액을 월 $5/5,000원에 고정하지 않는다. 초과 가능성을 전제로 사용량 기반 결제 연결을 별도로 확인하며, 초과가 관측되면 추가 유료 자원/스케일 확장을 진행하지 않고 사용자와 조정한다. 알림 메일·청구 데이터 반영은 지연될 수 있다. 최소 인스턴스 0·최대 1도 금액 상한은 아니다.

일반 사용 가정은 10명×AI 하루 5회×30일, 호출당 30초다. AI 처리분은 약 45,000 vCPU초이며 일반 API/시작 시간/지역 단가/외부 통신/빌드/이미지 보관은 별도다. 상시 무료량은 같은 결제 계정의 다른 프로젝트와 공유한다. 공식 근거와 제약은 [비용 검토](deployment-cost-plan.md)를 따른다.

## 준비된 자원과 비밀 파일

- Neon 프로젝트 `autumn-morning-81047996`, 이름 `recipick-production`.
- 브랜치 `br-long-thunder-a1frcqx3` (`production`), DB `recipick`, PostgreSQL 16.
- 새 빈 DB에 Alembic `e4a817c2b590` 적용 완료. Google 로그인 검증 전 사용자/재고 0건을 확인했고, 이후 실제 소셜 로그인으로 운영 계정이 생성됐다. 로컬 데이터는 이전하지 않았다. 후속 브라우저 검증용 재고는 별도 냉장고에 생성한 뒤 사용자 승인으로 정리했다. 배포 이미지에서 TLS 1.3과 인증서/호스트 검증 확인.
- `.deploy/secrets/jwt-secret.txt`: 새 운영 키. `backend/scripts/create_production_jwt.py`는 값 출력·기존 키 덮어쓰기를 하지 않는다.
- `.deploy/secrets/database-url.txt`: asyncpg용 직접 연결 주소. `sslmode` 등 libpq 전용 쿼리는 제거하고 `DATABASE_SSL=true`로 검증 TLS를 적용한다.
- `.deploy/secrets/container-qa.env`: 로컬 이미지 확인용. 임시 `https://recipick.example.test` CORS 주소이며 실제 운영 환경 파일로 쓰지 않는다.
- 비밀 폴더는 Git 제외이며 현재 Windows 사용자와 SYSTEM에만 접근 허용. 코드/프런트/문서에 키 값을 복사하지 않는다.
- `.deploy/tools/google-cloud-sdk/`: 공식 체크섬 검증을 마친 CLI 591.0.0. 인증 설정은 `.deploy/secrets/gcloud-config/`로 격리했다. 시스템 PATH와 기존 프로젝트 설정은 바꾸지 않았다.

## 배포 순서와 남은 확인

아래 자원 준비·공개·운영 콜백 설정과 기본 실사용 검증을 완료했다. Google 운영 원본/콜백과 카카오 운영 콜백은 사용자 승인 후 저장했다. Recipick 카카오 앱(`1396936`)의 기존 REST API 키에 `https://recipick-prod-1127.web.app/oauth/kakao/callback`을 저장했고 localhost 주소도 유지했다. 두 공급자 실제 로그인과 카카오 시크릿 교체 후 재로그인을 검증했다. 사용자가 첫 설정을 직접 완료한 뒤 재고·AI 흐름을 확인했다. 알레르기·식사 선호는 대신 임의 선택하지 않았다. 아래 순서는 재현 메모이며 이미 생성한 자원을 다시 만들라는 뜻이 아니다.

**카카오 시크릿 교체 완료:** 개발자센터 상세 조회 중 카카오 로그인·비즈니스 인증 client secret이 도구 출력에 포함되어 사용자에게 알리고 두 코드의 재발급을 권고했다. 사용자가 직접 재발급 완료를 확인했다. 앱에서 쓰는 로그인 키가 이전 값과 다름을 값 출력 없이 확인하고 `backend/.env`의 해당 항목, 보호된 배포 파일, Secret Manager 버전 2와 Cloud Run 참조에 반영했다. 이전 Secret Manager 버전 1은 사용 중지했고 임시 전달 파일을 제거했다. 후속 전달에는 값을 출력하지 않았으며 코드/Git/문서/증빙 이미지에도 원문을 추가하지 않았다. 비즈니스 인증 코드는 미사용이므로 가져오거나 저장하지 않았다. 이미 실행 중인 로컬 개발 서버는 재시작해야 새 `.env`가 반영될 수 있다.

리비전 `recipick-api-00002-9nv` Ready·트래픽 100% 확인 후 HTTPS API 기본 검사를 다시 통과했다. 공개 앱에서 기존 세션 로그아웃 → 새 카카오 인증 → 첫 닉네임 설정 화면 진입도 성공했고 반환된 콘솔 오류/경고는 0건이다. 운영용 JWT는 별도 생성한 기존 운영 키를 유지한다.

1. 구체적인 결제 연결 승인 후 전용 Google 프로젝트·필수 API·배포용 서비스 계정을 준비한다.
2. 별도 운영 JWT와 DB 연결 정보, Gemini/OAuth 비밀을 Secret Manager에 파일 입력으로 저장한다. 운영 서비스 계정에는 필요한 비밀의 읽기 권한만 부여한다.
3. 컨테이너를 업로드하고 Cloud Run에 요청 기반·최소 0 설정으로 배포한다. 비밀 버전은 명시적으로 고정한다. 자동 확장 시작 시마다 DB 마이그레이션을 실행하지 않는다.
4. 실제 Hosting 주소로 `FRONTEND_URL`, 카카오·Google 콜백을 설정한다. 공급자 콘솔에 새 콜백을 추가하고 로컬 콜백은 유지한다.
5. 실제 Cloud Run `/api/v1` 주소를 `VITE_API_BASE_URL`로 넣고 프런트를 다시 빌드한다. 기존 `dist`는 로컬 주소 기준이므로 그대로 공개하지 않는다.
6. Firebase Hosting에 정적 빌드를 배포하고 로그인 경로의 SPA 새로고침·CORS·인증 갱신·권한 검사·DB 읽기/쓰기·절전 복귀를 확인한다.
7. 실제 Gemini Free 등급/한도와 운영 연결을 확인하고 최소 표본으로 AI를 검증한다. 개발·운영이 같은 공급자 프로젝트를 쓰면 사용량이 합산된다.
8. 최종 URL·리비전·실제 검증 결과·남은 수동 절차를 인계 문서와 개발 이력에 기록한다. 사용자 확인 전 배포 완료로 표시하지 않는다.

## 완료한 검증

백엔드 전체 594개, 프런트 전체 181개, 린트·TypeScript·Vite 빌드 통과. 기존 테스트 DB 스키마/테이블 식별자 보존. Linux 이미지 빌드·비루트 실행·개발 비밀 파일 제외 확인. 1GB/1CPU 제한에서 2천만 화소 RGBA 이미지 2장 동시 처리 성공(표본 최대 RSS 564.8MiB, AI 호출 없음).

실제 Cloud Run HTTPS에서 `/health`, 토큰 없는 `/users/me` 401, 허용/불허 CORS 200/400, Google/카카오 로그인 URL의 운영 콜백 설정을 확인했다. Hosting `/login`과 OAuth 경로 새로고침 200, HTML no-cache·해시 자원 1년 immutable, 실제 운영 API 주소 반영도 확인했다. 브라우저 `Recipick` 로그인 화면은 빈 화면/오류 오버레이 없이 표시됐고 반환된 콘솔 오류/경고는 0건이다. Google와 카카오 OAuth 로그인, 온보딩 후 기본 흐름·앱 내부 AI 검증도 아래 범위에서 완료했다.

Google 로그인 검증 전에 Neon compute의 `idle`을 확인한 뒤 TLS 재연결과 11개 테이블·마이그레이션 head·사용자/재고 0건을 재확인했다. 실제 Cloud Run에 존재하지 않는 사용자 ID의 1분짜리 테스트 토큰을 전달해 운영 서명 검증·DB 조회 후 `User not found` 401을 확인했다. 이 DB 연결 검사에는 데이터 쓰기·토큰 출력/저장이 없다. 정적 파일의 실제 비밀 값 포함 여부 검사도 통과했다. 이는 이후 수행한 소셜 로그인 검증과 구분한다.

Google 제공자 콘솔의 운영 원본/콜백은 **사용자 승인 후 저장 완료**이며, 기존 localhost 주소를 유지했다. 실제 공개 사이트의 Google 로그인 → 콜백 처리 → 첫 사용자 닉네임 설정 화면 진입에 성공했다. 카카오 운영 콜백도 사용자 승인 후 저장·재조회 확인을 마쳤다. Google 앱은 외부/테스트 중 상태이며 브랜딩 구성이 미완료지만, 현재 요청 범위는 `openid email profile`뿐이다. 기본 신원 범위만 요청하는 앱은 테스트 사용자 제한의 공식 예외이며 실제 로그인 성공도 확인했다. 추가 Google API 권한을 도입한다면 게시/검증 요건을 다시 확인한다. [Google 공식 테스트 상태 예외](https://support.google.com/cloud/answer/15549945?hl=en)

운영에 등록한 기존 Gemini 키·`gemini-3.5-flash-lite`로 개인정보 없는 `OK` 요청 1회(입력 5, 총 6 토큰)가 성공했다. **로컬에서 공급자를 직접 호출한 검사**이며, Cloud Run 앱 내부의 인증·사용량 예약·AI 응답 전체 흐름 검증과 구분한다. 앱 횟수 기록에는 포함되지 않고 공급자 사용량에는 포함된다. 모델/결제 등급 변경은 하지 않았다.

### 사용자 첫 설정 이후 운영 검사

- 사용자가 첫 설정을 완료했다. 별도 테스트 냉장고 ID 4·냉장 보관함 ID 1에서 당근 2개/양파 1개를 등록했다. 추정 권장일 자동 입력과 저장·새로고침 후 유지, 냉장고 요약 표시를 확인했다.
- 건강 관련 설정 전송은 직전에 별도 승인받았다. 테스트 재료·저장된 알레르기/식사 선호를 Google Gemini로 보내 기본 1인분·당근 우선 메뉴를 **앱에서 1회** 추천받았다. 응답·계획 저장·새로고침 복원·스마트 차감 미리보기까지 성공했다. 읽기 전용 DB 검증에서 앱 사용량 1회 시작/완료와 미적용 계획을 확인했다. 이 요청의 공급자 토큰 수는 별도 수집하지 않았으며 이전 `OK` 호출의 6토큰과 혼동하지 않는다.
- 차감 제안은 당근/양파 각 0.5개를 실제 재고에 연결했다. 재고에 없는 식용유/소금 행은 확인 필요로 표시되고 확정 버튼이 비활성화됐다. 실제 차감은 하지 않았으며 재고 수량 유지·소비/폐기 이력 0건을 DB에서 확인했다. 마이페이지의 최근 30일 빈 통계/상세 이력도 정상이다.
- 이번 응답 제목에 있는 달걀/볶음밥이 본문·재료 목록에는 빠진 품질 한계가 관찰됐다. 연결 성공과 생성 내용의 정확성을 구분한다. 별도 개선 후보로 기록하며 이 배포에서 프롬프트를 추가 수정하지 않았다.
- 사용자에게 복구 불가를 알리고 ‘테스트 냉장고만 삭제’ 승인을 받은 후 UI로 정리했다. DB에서 테스트 냉장고·보관함·재고 제거, 기존 냉장고 ID 1·2·3 보존을 확인했다. 추천 계획과 AI 사용 기록은 유지했다. 개인 설정 원문은 문서에 기록하지 않는다.
- 이번 운영 검사에서는 사진 인식·직접 녹음·가족 두 계정·차감 확정/소비/폐기를 다시 실행하지 않았다. 실제 모바일 기기 검증도 아니다. 이 기능의 기존 자동/개발 환경 결과는 기능 기록을 따른다. 반환된 브라우저 오류/경고는 0건이다.
- 마지막 실행 코드 변경 이후 자동 테스트는 반복하지 않았다. 사용자 승인으로 문서와 배포 코드를 이번 로컬 커밋에 반영한다. 커밋 제목은 `chore: deploy Recipick to Cloud Run and Firebase`, 이력 ID는 `DEPLOY-20261102`이며 Git 이력에서 해시를 확인한다. 원격 푸시·새 배포는 하지 않고 다음 개선은 사용자 확인 후 진행한다.

## 재배포 메모

백엔드는 `backend/`만 컨테이너 빌드 문맥으로 사용한다. `.dockerignore`/`.gcloudignore`의 허용 목록을 유지하고 새 이미지 태그 또는 digest를 사용한다. 최초 배포는 검증한 로컬 이미지를 직접 업로드했으며 Cloud Build 실행 비용은 발생시키지 않았다.

프런트는 `VITE_API_BASE_URL=https://recipick-api-inadpqyfnq-as.a.run.app/api/v1`로 빌드한다. 이 변수에 비밀키를 넣지 않는다. `firebase.json`과 `.firebaserc`에 호스팅 설정/프로젝트를 기록했다. 최초 공개는 공식 Firebase Hosting REST API로 압축 파일 SHA-256 등록 → 파일 업로드 → FINALIZED → release 순서로 수행했다. 이후 공식 Firebase CLI로도 같은 설정을 사용할 수 있다.

Secret Manager의 현재 서버 참조는 `kakao-client-secret` **버전 2**, `jwt-secret`, `database-url`, `gemini-api-key`, `google-client-secret` **버전 1**이다. 런타임 계정에는 해당 비밀 읽기 권한만 부여했다. 카카오 이전 버전 1은 `DISABLED`이며 공급자에서도 이미 재발급됐으므로 이전 리비전을 그대로 복구하면 카카오 로그인이 실패할 수 있다. 재배포 시 반드시 새 버전 참조를 유지한다. 키를 교체할 때는 새 버전 등록과 서비스 참조 갱신을 함께 수행한다.
