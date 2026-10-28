# Recipick 코드 점검과 순차 수정 기록

2026년 10월 19일 시작한 코드 점검과 사용자 합의를 다음 세션에 전달하기 위한 기록이다. 핵심 수동 관리 MVP와 소비·폐기 기능을 기준으로 접근 제어, 비밀키 설정, 빌드 및 검증 체계를 보완했으며, 2026년 10월 23일 합의한 범위의 점검을 마무리했다. 운영 배포와 별도 보류 사항은 이번 점검 완료와 구분한다.

2026년 10월 26일 후속 기능 개발의 우선순위와 첫 1시간 계획을 [기능 개발 기록](feature-roadmap.md)에 별도로 기록했다. 사용자의 별도 브랜치·1시간 구현 승인에 따라 `codex/receipt-photo-import`에서 **영수증 사진 인식 → 후보 수정·제외 → 일괄 등록** 초기 버전을 구현하고 테스트했으며, 결과 컨펌 후 `ad6b54e`로 로컬 커밋했다. 다음으로 선택한 **앱에서 최대 60초 직접 녹음** 방식의 음성 입력은 카카오 로그인 복구 동안 일시 중단했다가, 2026년 10월 28일 사용자의 정상 로그인 확인과 재개 요청에 따라 구현·검증을 완료했다. **사용자가 음성 결과를 컨펌하고 커밋을 승인하여 이번 커밋에 포함한다.** 가족 공유는 구현 범위와 결정 사항을 브리핑하는 단계이며 아직 착수하지 않았다. 아래 항목 01~11 점검은 종료 상태를 유지한다.

## 카카오 로그인 KOE130 복구 기록 (2026-10-26~28)

- 사용자 보고: 처음에는 앱에서 `잘못된 콜백 요청입니다.`를 확인했고, 재시도 시 카카오 오류 화면의 **KOE130**을 전달했다. 제공된 백엔드 로그에는 로그인 주소 요청 성공(200)까지만 있고 콜백 API 요청은 없다.
- 확인된 원인: [카카오 공식 에러 코드](https://developers.kakao.com/docs/ko/kakaologin/trouble-shooting)의 KOE130은 개발자 앱이 **장기 미이용 상태**로 전환되어 API 호출이 차단됐음을 뜻한다. [앱 분류 안내](https://developers.kakao.com/docs/ko/app-setting/app)에 따라 카카오 개발자 앱 관리 페이지에서 기존 Recipick 앱의 장기 미이용 상태를 해제해야 한다.
- 완료 확인: 2026년 10월 28일 사용자가 콘솔 해제 완료를 알렸다. 로컬 백엔드 `/health`와 프런트 `/login`의 HTTP 200 응답을 확인한 뒤, 사용자가 **“로그인 잘 되고 대시보드도 정상적으로 열려”**라고 실제 카카오 로그인 성공을 확인했다. 별도의 OAuth 코드 수정 없이 복구했다.
- 범위: OAuth 실행 코드·키·설정을 변경하지 않았고 사용자 OAuth state 원문은 기록하지 않았다. 사용자가 **“멈춰둔 음성 입력 구현이랑 테스트 이어서 진행하자”**라고 명시적으로 요청하여 해당 항목만 재개했다.

## 현재 항목 — 음성 자동 입력 (2026-10-28)

- 상태: **초기 버전 구현·검증·문서화·결과 컨펌 완료, 이번 로컬 커밋에 포함**. 2026년 10월 28일 사용자가 “음성 입력 구현 내용까지 커밋하고 다음 가족 공유 기능에서 뭘 구현할 건지, 내가 결정해야 할 사항은 뭔지 짧게 브리핑해줘”라고 승인했다. 녹음 → 미리듣기 → 명시적 인식 → 후보 수정·제외 → 일괄 등록을 제공한다. 영수증·레시피와 기존 Gemini Free·합산 한도를 공유한다.
- 검증: 백엔드 **379개**, 프런트 **82개**, 린트·빌드 통과. Chrome 데스크톱·모바일 크기에서 가상 마이크를 통한 실제 녹음·Gemini 인식·격리 PostgreSQL 저장·새로고침 유지까지 확인했다. 테스트용 서버와 스키마를 정리했다.
- 확인 및 수정: 첫 실제 음성 인식에서 비식품인 세제가 포함되어 비식품 제외 지침을 강화했다. 동일 음성의 데스크톱·모바일 재검증과 별도 수량 정정·미지정 수량·생활용품·폐기 발화 사례가 통과했다. 전체 실제 Gemini 호출은 5회이다.
- 한계: 실제 사용자 마이크·잡음·방언·모바일 Safari/Android 실기기는 미검증이다. AI 정확도는 보장하지 않으므로 사용자 확인 후 등록한다. 파일 업로드·실시간 자막·오디오 보관·자동 재고 합산은 범위 밖이다.
- 다음 세션: 상세 구현과 검증 근거는 [음성 입력 기록](feature-roadmap.md#음성-입력-초기-버전-구현검증-결과)을 따른다. 다음 우선순위인 가족 공유는 별도 합의 전 시작하지 않는다. `.env`, 기존 `.claude/`, `nul`은 보존하며 원격 푸시·배포는 하지 않았다.
- 커밋 확인: 검증 이후 실행 코드 변경이 없어 테스트를 반복하지 않고 변경 파일과 `git diff --check`를 확인했다. 음성 구현·회귀 테스트·사용법·카카오 복구 기록 및 다음 기능의 미확정 제안만 포함한다.

## 점검 종료 시점 상태 (2026-10-23)

- 마지막 구현 승인 항목: **11-3 소비·폐기 핵심 DB 검증**. 2026년 10월 23일 사용자가 “좋아 그럼 11-3 소비·폐기 핵심 DB 검증까지 진행해줘. 테스트가 통과하면 이번 점검은 여기서 마무리하자.”라고 승인했다.
- 현재 상태: **11-3 검증·문서화·결과 컨펌 완료, 이번 로컬 커밋에 포함. 합의한 이번 점검 종료**. 신규 실제 DB 테스트 24개와 기존 회귀 검증을 포함한 백엔드 315개가 통과했다. 수정할 기능 오류는 재현되지 않아 테스트와 문서만 추가·변경했다. 원격 푸시는 하지 않았다.
- 완료 커밋: 항목 01 `1d955ce`, 항목 02 `be5781e`, 항목 03 `f9f2292`, 항목 04 `aec9c6e`, 항목 05 `5e9d0f7`, 항목 06 `7e084a3`, 항목 07 `f26f61b`, 항목 08 `2fc0cad`, 항목 09 `d6f7743`, 항목 10 `78fb7a7`, 항목 11-1 `ae1cfc2`, 항목 11-2 `8907f59`. 모두 로컬 `phase2` 브랜치이다.
- 현재 범위 결정: 항목 01~10과 11-1~11-3까지 합의한 보완·검증을 완료했다. **추가 구현 항목은 없다.** 기존 **Tailwind 3 유지·잔여 보안 항목 기록** 결정과 별도 검토 목록은 유지하며 새 개선 후보를 이번 점검의 필수 단계로 추가하지 않는다.
- 설정 범위: 사용자가 현재 `backend/.env`는 로컬 개발 전용이라고 확인했다. 배포 전에 별도의 운영용 JWT 키를 준비하도록 반드시 안내해 달라고 요청했다.
- 최초 점검 당시 기존 미추적 파일: `.claude/`, `nul`. 이 작업에서 만든 파일이 아니므로 보존한다.

## 점검 종료 시점 인계 요약 (2026-10-23)

- 최신 사용자 지시: 2026년 10월 23일 “좋아 그럼 11-3도 커밋하고 이번 점검은 여기서 마무리하자.”로 결과 컨펌과 커밋·점검 종료를 승인했다. 다음 항목은 시작하지 않는다.
- 완료한 작업: 항목 01~10과 11-1~11-2는 수정·검증·컨펌·커밋 완료. 11-3은 [소비·폐기 통합 테스트](../backend/tests/integration/test_consume_dispose.py) 24개를 추가해 재고·이력 결과, 실패 시 롤백, 권한 차단을 검증하고 이번 커밋에 기록한다. 이번 변경은 새 테스트 파일과 이 문서, 총 2개 파일이다. 앱 실행 코드·의존성·실제 키·`.env`·운영 설정은 변경하지 않았다.
- 마지막 검증 결과: 백엔드 **315개 통과(단위 275개·실제 PostgreSQL 통합 40개)**. 로컬 `recipick_test`에서 실행했고 기존 스키마·테이블 식별자가 유지되며 새 임시 스키마가 모두 정리되는 것을 확인했다. 기존 `datetime.utcnow()` 사용에 따른 경고는 총 89건(기존 71건과 이번 경로 18건)이다. 최근 프런트 결과는 항목 11-1의 58개·린트·빌드·Chrome 검증 통과, 의존성 감사는 항목 10의 전체 7건·`--omit=dev` 0건이며 이번에는 반복하지 않았다.
- 검증 한계: 테스트 DB 안전장치는 로컬 PostgreSQL 개발 환경 전용이다. 프로세스 강제 종료·DB 연결 단절 시 임시 스키마가 남을 수 있다. 실제 OAuth·Gemini를 연결한 전체 사용자 흐름·운영 배포는 미검증이다. 항목 11-1의 여러 탭 간 갱신 조정, Tailwind 3 잔여 취약점, Python 보안 감사·시간 처리 경고는 기존 기록대로 남아 있다.
- 작업 위치: 로컬 `phase2` 브랜치. 원격 푸시는 하지 않는다. 기존 `.claude/`, `nul`은 커밋 대상에서 제외한다. 브라우저 캡처와 임시 QA 스크립트는 저장소 밖 임시 폴더에 있으며 Git에 포함하지 않는다.
- 이후 세션: **이번 점검은 종료됐으므로 추가 수정을 자동으로 시작하지 않는다.** 11-3의 테스트와 이 문서까지 커밋 대상으로 확정했으며 남은 점검 항목은 없다. PostgreSQL 테스트 재실행은 README의 안전 설정을 따른다. 기존 백엔드는 재시작하지 않았다.
- 배포 전: 현재 설정은 로컬 개발 전용이며, 별도의 운영용 JWT 키 준비를 반드시 다시 안내한다.

## 사용자와 합의한 진행 방식

사용자 요청: “한번에 하나씩만 수정하고 내가 컨펌하면 다음 수정사항으로 넘어가는 걸로 하자. 논의가 필요한 부분은 물어봐줘.”

1. 한 번에 수정 항목 하나만 진행한다. 해당 항목의 회귀 테스트와 문서 갱신은 같은 작업에 포함한다.
2. 변경 이유, 변경 내용, 검증 결과, 남은 한계를 보고한다.
3. 구현과 테스트가 끝나도 다음 항목을 자동으로 시작하지 않는다. 사용자의 명시적인 컨펌을 기다린다.
4. 동작 정책, 인증정보, 비용, 배포에 영향을 주는 결정 중 맥락으로 정할 수 없는 사항은 질문한다.
5. 각 항목의 상태와 실제 사용자 컨펌을 이 문서에 기록한다. 컨펌을 추정해서 기록하지 않는다.
6. 코드 수정과 배포는 구분한다. 운영 설정이나 운영 서버의 상태는 별도로 확인해야 한다.

추가 승인: 2026년 10월 19일 사용자는 항목 03 커밋 후 린트를 초보자에게 설명하고 항목 04 수정을 추가 컨펌 없이 진행하도록 요청했다. 이 승인은 항목 04에 적용하며 이후 항목에 대한 포괄 승인은 아니다.

종료 승인: 2026년 10월 23일 사용자는 11-3 테스트가 통과하면 이번 점검을 마무리하도록 사전에 지시했다. 이 조건을 충족하여 이번 점검을 종료했으며 새로운 항목을 추가하지 않는다.

## 구현 범위 (2026-10-23 점검 종료 기준)

| 영역 | 코드에 구현된 내용 | 남은 범위 |
| --- | --- | --- |
| 로그인과 개인 설정 | 카카오·구글 OAuth, JWT 갱신, 온보딩, 닉네임·알레르기·조리도구·실력·시간 설정 | 실제 OAuth 외부 연동은 이번 점검에서 실행하지 않음 |
| 냉장고 관리 | 생성·조회·수정·삭제, 즐겨찾기, 드래그 정렬, 식재료 미리보기 | 접근 권한 회귀 테스트 보강 |
| 보관함과 식재료 | 냉장·냉동·실온 구분, 등록·수정, 소수 수량·단위·유통기한, 전체 검색, 서버 입력 검증 | 실제 DB 통합 검증 보강 |
| 소비와 폐기 | 전량·일부 처리, 메모와 이력 저장, DB 행 잠금, 실패 표시·입력 유지·재시도, 처리 중 중복 제출 방지 | 이력 조회 API·화면 없음, 서버 멱등성 처리 별도 검토 |
| AI 추천 | 여러 냉장고와 개인 설정을 조합하는 Gemini·LangGraph 파이프라인, 3.5 Flash-Lite 실제 호출과 응답 완결 여부 검사 | 로그인·DB·브라우저 전체 흐름 미검증, 레시피 내용 검증·저장 없음 |
| 가족 공유 | 회원·역할 모델 | 초대·가입 UI와 API 없음 |
| 자동 입력과 차감 | 기획 문서에 정의 | 영수증·음성 입력, AI 보관 위치 분류, 요리 완료 후 스마트 차감 미구현 |

구현 여부는 [기획](../recipick_guide.md), [라우트](../frontend/src/App.tsx), [백엔드 API](../backend/app/api/v1/), 서비스와 모델을 대조한 결과이다. 코드가 존재한다는 판단과 외부 연동까지 실행 검증했다는 판단은 구분한다.

## 점검 당시 검증 결과

| 검사 | 결과 |
| --- | --- |
| 백엔드 단위 테스트 | 41개 통과. 프로젝트 `.venv`에서 재확인 |
| 백엔드 단위 테스트 실행 기준 커버리지 | 63%. 서비스 계층은 대체로 22~32%이며, import만으로 집계되는 선언도 포함 |
| 프런트 테스트 | 18개 통과 |
| 프런트 프로덕션 빌드 | 실패. `SortableContainer.tsx`의 미사용 `useRef`, `activeId`로 TS6133 발생 |
| 프런트 린트 | 실패. `eslint` 명령을 찾을 수 없으며 의존성과 설정도 없음 |
| npm audit | Critical 1, High 17, Moderate 5, Low 1, 총 24. 개발 도구와 전이 의존성 포함 |

실제 DB 통합 흐름, OAuth 공급자 로그인, 유료 AI 호출, 운영 배포는 검증 범위에 포함하지 않았다. 의존성 감사 수치는 2026년 10월 19일 조회 결과이며 수정 시 다시 확인한다.

## 수정 항목과 완료 상태

각 행을 별도 수정 항목으로 취급한다. 우선순위가 같아도 한꺼번에 수정하지 않는다.

| 번호 | 우선순위 | 항목 | 점검 근거와 필요한 조치 | 상태 |
| --- | --- | --- | --- | --- |
| 01 | 최우선 | 레시피 추천 접근 권한 | 로그인만 확인하고 요청받은 냉장고 ID로 식재료 조회하던 문제. 모든 ID의 회원 여부를 식재료 조회 전에 확인하도록 수정 | 컨펌 및 커밋 완료 `1d955ce` |
| 02 | 최우선 | JWT 기본 비밀키 | 키 필수 설정·검증과 로컬 키 교체 완료. 배포 전 별도 운영 키 준비 필요 | 컨펌 및 커밋 완료 `be5781e` |
| 03 | 배포 전 | 프런트 빌드 복구 | 미사용 import·상태 갱신 코드 제거 후 프로덕션 빌드 통과 | 컨펌 및 커밋 완료 `f9f2292` |
| 04 | 배포 전 | 린트 실행 복구 | ESLint와 TypeScript·React 검사 규칙을 연결하고 오류·경고 없이 실행 확인 | 컨펌 및 커밋 완료 `aec9c6e` |
| 05 | 배포 전 | 서버 입력 검증 | 냉장고·보관함·식재료 이름, 단위, 수량, 필수값의 명시적 null을 검증하고 HTTP 422 응답 확인 | 컨펌 및 커밋 완료 `5e9d0f7` |
| 06 | 배포 전 | 소비·폐기 실패 처리 | 요청 성공 후 닫기, 실패 시 입력 유지·오류 표시, 처리 중 중복 제출·수정·닫기 방지 | 컨펌 및 커밋 완료 `7e084a3` |
| 07 | 배포 전 | Gemini 모델 설정 | `gemini-3.5-flash-lite`로 교체, 응답 처리 보완, 모의 검증 및 실제 HTTP 200·레시피 응답 확인 | 컨펌·커밋 완료 `f26f61b` |
| 08 | 배포 전 | AI 사용량 제한 | 계정·앱 전체 한도와 실패 집계, DB 영구 기록·동시 요청 제어, HTTP 429·재시도 안내 | 컨펌·커밋 완료 `2fc0cad` |
| 09 | 배포 전 | AI API 키의 로그 노출 경로 | 인증 헤더 사용, Gemini 설정값 마스킹, 안전한 공급자 오류 처리와 앱 로그 보완 | 컨펌·커밋 완료 `d6f7743` |
| 10 | 빠른 보완 | 의존성 보안 업데이트 | npm 11.19.1 및 의존성 갱신, 감사 24→7건·앱 의존성 0건. Tailwind 3 잔여 취약점 기록 | 컨펌·커밋 완료 `78fb7a7` |
| 11 | 빠른 보완 | 실제 동작을 검증하는 테스트 | 11-1 인증 갱신, 11-2 테스트 DB 안전장치, 11-3 소비·폐기 재고·이력·롤백·권한 실제 DB 검증 완료 | 11-1 `ae1cfc2`, 11-2 `8907f59` 커밋. **11-3 테스트 24개·전체 315개 통과, 문서화·컨펌 완료, 이번 커밋에 포함. 이번 점검 종료** |

주요 코드 근거:

- 01: [추천 API](../backend/app/api/v1/recipes.py), [추천 서비스](../backend/app/services/recipe_service.py), [식재료 조회](../backend/app/services/ingredient_service.py)
- 02: [설정](../backend/app/config.py), [토큰 유틸리티](../backend/app/utils/security.py)
- 03과 04: [정렬 컴포넌트](../frontend/src/components/common/SortableContainer.tsx), [패키지 설정](../frontend/package.json)
- 05와 06: [식재료 스키마](../backend/app/schemas/ingredient.py), [소비·폐기 다이얼로그](../frontend/src/components/ingredient/ConsumeDisposeDialog.tsx)
- 07~09: [Gemini 클라이언트](../backend/app/ai/gemini_client.py), [오류 로깅](../backend/app/middleware/error_handler.py)
- 11: [프런트 테스트](../frontend/src/__tests__/), [백엔드 테스트](../backend/tests/)

외부 근거:

- [Google 모델 종료 안내](https://ai.google.dev/gemini-api/docs/deprecations): `gemini-2.0-flash` 종료일 확인. 실제 모델 호출은 수행하지 않았다.
- [Vitest 공식 보안 공지](https://github.com/vitest-dev/vitest/security/advisories/GHSA-5xrq-8626-4rwp): Critical 항목은 UI 서버·Browser 모드 등의 실행 조건이 있다. 감사 결과의 심각도가 곧 현재 배포 서비스의 악용 가능성을 뜻하지는 않는다.

## 별도 검토 사항

다음 내용은 점검 중 발견한 보완 후보이며 현재 수정 범위가 아니다.

- OAuth state가 만료 시간과 타입만 가진 JWT이며, 요청별 무작위 값과 서버의 일회성 검증이 없다. 프런트의 sessionStorage 비교는 존재한다.
- 로그아웃은 로컬 토큰을 삭제하며, 서버의 refresh token 폐기·재사용 감지는 없다.
- 항목 10 브라우저 확인에서 발견한 동시 401의 갱신 중복은 **항목 11-1에서 수정·검증 완료**했다. 한 탭 내 요청을 대상으로 하며 여러 탭 사이의 갱신 조정은 별도 범위이다. 의존성 업데이트로 도입된 문제는 아니었다.
- 테스트 DB 주소 문자열 치환과 `drop_all` 경로는 **11-2에서 제거·검증 완료**했다. 전용 DB 명시와 접속 전 검증을 적용하며, 각 테스트는 자신이 만든 무작위 스키마만 정리한다.
- 저장소에 CI·배포 자동화 설정이 없고 `/health`는 정적 응답이다. 운영 서버의 별도 구성 유무는 확인하지 않았다.

## Python 실행 오류와 확인된 해결 경로

첫 가상환경 테스트 명령에서 `SyntaxError: Non-UTF-8 code starting with '\x90' in file ...python.exe`가 발생했다. 이는 실행 파일이 Python 소스로 해석됐다는 오류이며, 최초 호출이 그렇게 처리된 이유는 재현되지 않아 확정하지 못했다.

이후 동일한 가상환경에서 Python 3.12.12 실행, 라이브러리 로딩, 단위 테스트 41개 통과를 확인했다. 상대경로 실행도 재확인 시 성공했다. 가상환경 손상이나 재설치 필요성은 확인되지 않았다.

PowerShell에서 검증한 실행 방식:

```powershell
cd C:\Users\pengveloper\dev\recipick_mvp\backend
& 'C:\Users\pengveloper\dev\recipick_mvp\backend\.venv\Scripts\python.exe' -m pytest tests/unit/ -q
```

시스템 `python`은 `C:\ProgramData\miniforge3\python.exe`이므로, 프로젝트 검증에는 가상환경 실행 파일을 명시한다.

## 항목 01 수정 기록

- 문제: 요청자의 회원 여부를 확인하지 않은 냉장고에서 식재료를 조회하여 AI에 전달할 수 있다.
- 수정 전 확인: DB와 AI를 모의 처리한 API 요청에서 회원 조회 없이 HTTP 200과 AI 호출이 발생했다. 실제 다른 사용자의 DB 데이터나 외부 AI는 호출하지 않았다.
- 적용한 정책: 요청한 냉장고 중 하나라도 회원 권한이 없거나 존재하지 않으면 HTTP 403으로 전체 요청을 거부한다. 식재료 조회와 AI 호출 전에 모든 권한을 확인한다. 기존 회원 역할인 OWNER와 GUEST 모두 허용한다. 중복 ID와 빈 선택에 대한 기존 허용 동작은 유지한다.
- 변경: [추천 서비스](../backend/app/services/recipe_service.py)에서 요청 사용자와 냉장고 ID 목록으로 회원 관계를 한 번에 조회하고 전체 목록의 권한을 확인한다. 권한 누락 시 `PermissionError`를 발생시키며 [API](../backend/app/api/v1/recipes.py)에서 HTTP 403으로 변환한다. 서비스 직접 호출에도 권한 검증이 적용된다.
- 회귀 테스트: [test_recipe_authorization.py](../backend/tests/unit/test_recipe_authorization.py)에 12개 추가. 다른 사용자의 냉장고, 허용·비허용 ID 혼합과 순서 변경, 존재하지 않는 ID, 중복 ID, OWNER·GUEST 허용, 서비스 직접 호출, 빈 선택을 검증한다. 거부된 요청에서는 식재료·설정 조회와 AI 호출이 발생하지 않는지도 확인한다.
- 테스트 방식: 회원 관계 조회 SQL은 메모리 SQLite의 실제 회원 행에 실행한다. 비동기 DB 인터페이스, 식재료·설정 조회, AI는 테스트 대역을 사용한다. 설정된 PostgreSQL DB와 외부 AI는 호출하지 않는다. PostgreSQL 전체 통합 검증은 별도이다.
- 검증 결과: 수정 전 새 테스트 7개 실패·5개 통과로 취약 경로 재현. 수정 후 `python -m pytest tests/unit/ -q --tb=short -p no:cacheprovider`에서 **53개 전체 통과**. 새 테스트가 기존 모델의 `datetime.utcnow()` 기본값을 실행하면서 사용 중단 예정 경고 60건이 발생했으며, 현재 항목과 무관하여 모델 시간 처리 변경은 하지 않았다.
- 범위 밖: JWT 키, 프런트 빌드·린트, Gemini 설정, 의존성, 운영 설정은 변경하지 않았다. 문서의 초기 점검 결과는 수정 전 기준이다.
- 사용자 컨펌: 2026년 10월 19일 “좋아 여기까지 커밋하고 다음 항목으로 넘어가자.”로 승인. 항목 01을 커밋한 뒤 항목 02만 진행한다.
- 커밋: `1d955ce` — `fix: authorize all refrigerators before recommending recipes`. 작성자 `DevPeng`, 로컬 `phase2` 브랜치. 원격 푸시는 하지 않았다.

## 항목 02 수정 기록

- 사용자 확인: 현재 `backend/.env`는 로컬 개발 전용이다. 사용자가 배포 전에 운영용 키를 준비하도록 다시 안내해 달라고 요청했다.
- 변경: [설정](../backend/app/config.py)의 공개 기본키를 제거하고 `JWT_SECRET_KEY`를 필수로 지정했다. 개발·운영 모두 키 누락, 빈 값, 기존 공개 기본값, 32바이트 미만 값, 앞뒤 공백이 있는 값을 거부한다. 32바이트는 현재 기본 알고리즘 HS256에 대한 최소 길이 검증이며, 난수성 자체를 판정하지는 않는다.
- 비밀정보 처리: 키는 `SecretStr`로 보관하고 토큰 서명·검증 시에만 꺼낸다. 설정의 문자열 표현과 JSON 출력에서 키가 마스킹되고, 설정 검증 오류 문자열에서도 입력값을 숨긴다.
- 로컬 설정: `secrets.token_urlsafe(32)`로 생성한 개발용 키를 기존 `backend/.env`의 JWT 항목에만 저장했다. 다른 설정 바이트는 보존했다. 실제 키는 출력하거나 문서에 기록하지 않았으며 `.env`가 Git에서 제외되는 것을 확인했다.
- 동작 영향: 새 설정으로 서버를 재시작하면 기존 access token, refresh token, 진행 중인 OAuth state가 무효화된다. 로컬 사용자는 다시 로그인해야 한다. 서버 프로세스 재시작이나 운영 배포는 수행하지 않았다.
- 테스트 격리: [루트 conftest](../backend/conftest.py)에서 테스트 프로세스 전용 난수 키를 설정해 실제 로컬·운영 키 없이도 단위 테스트를 실행할 수 있게 했다.
- 회귀 테스트: [설정 테스트](../backend/tests/unit/test_settings.py) 18개와 [토큰 테스트](../backend/tests/unit/test_security.py) 4개를 추가했다. 잘못된 설정의 차단, 키 마스킹, 환경변수·파일 우선순위, 고정 키 재사용, 공개 기본키로 서명된 토큰 거부, 교체 후 기존 토큰 무효화, OAuth state 서명을 확인한다.
- 검증 결과: 수정 전 대상 테스트 19개 실패·7개 통과. 수정 후 백엔드 단위 테스트 **75개 전체 통과**. 실제 로컬 설정으로 앱 import와 토큰 생성·검증도 통과했다. 기존 `datetime.utcnow()` 경고 60건은 그대로이다.
- 시작 안내: [환경변수 예제](../backend/.env.example)는 빈 JWT 키와 생성 명령을 제공한다. [README](../README.md)에 최초 설정, 재로그인 영향, 배포 전 준비 절차를 추가했다.
- 근거: [RFC 7518의 HMAC 키 길이 요구사항](https://datatracker.ietf.org/doc/html/rfc7518#section-3.2), [Pydantic 오류 입력 숨김 설정](https://docs.pydantic.dev/latest/api/config/#pydantic.config.ConfigDict.hide_input_in_errors).
- 사용자 컨펌: 2026년 10월 19일 “오케이 커밋하자. 이후에 다음 항목으로 넘어가도 좋을 것 같아.”로 승인. 항목 02를 커밋한 뒤 항목 03만 진행한다.
- 커밋: `be5781e` — `fix: require a secure JWT signing key in every environment`. 작성자 `DevPeng`, 로컬 `phase2` 브랜치. 실제 비밀키가 있는 `.env`는 제외했다. 원격 푸시는 하지 않았다.

## 항목 03 수정 기록

- 문제 재현: `npm run build`에서 `SortableContainer.tsx`의 미사용 `useRef`와 `activeId`로 TS6133 오류 2건이 발생했다.
- 변경: [정렬 컴포넌트](../frontend/src/components/common/SortableContainer.tsx)의 미사용 React import, 읽지 않는 `activeId` 상태, 해당 상태만 갱신하던 드래그 시작·종료 코드를 제거했다. 드래그 핸들, 포인터·키보드 센서, 순서 계산과 `onReorder` 호출은 유지한다.
- 범위: 타입 검사 설정을 완화하지 않았으며 린트 설정과 패키지 버전도 변경하지 않았다. 컴파일 오류 수정이므로 기존 빌드 명령으로 실패와 통과를 검증했다.
- 검증 결과: `npm run build` 성공. TypeScript 검사와 Vite 프로덕션 번들 생성 완료. `npm run test`에서 기존 프런트 테스트 **18개 전체 통과**. 브라우저에서 드래그 조작을 재검증한 것은 아니다.
- 실행 환경: 샌드박스 실행에서는 Vite 설정 로딩 중 상위 디렉터리 접근이 차단됐고, 권한을 부여한 동일한 빌드 명령으로 성공했다.
- 남은 경고: `caniuse-lite` 데이터가 오래됐다는 Browserslist 경고가 있으나 빌드는 성공했다. 해당 갱신은 항목 10에서 다룬다.
- 사용자 컨펌: 2026년 10월 19일 항목 03 커밋을 승인하고 린트 실행 복구를 간단히 설명한 뒤 추가 컨펌 없이 수정하도록 요청했다.
- 커밋: `f9f2292` — `fix: restore frontend production build`. 로컬 `phase2` 브랜치에 커밋했고 원격 푸시는 하지 않았다.

## 항목 04 수정 기록

- 사용자 승인: 항목 03 커밋 후 린트를 초보자에게 간단히 설명하고, 추가 컨펌 없이 린트 실행 복구를 진행하도록 요청했다. 린트는 코드를 실행하기 전에 실수를 찾아주는 코딩용 맞춤법 검사에 해당한다고 설명했다.
- 문제 재현: `npm run lint`에서 `eslint` 명령을 찾을 수 없어 실패했다. 검사 스크립트만 있고 검사 도구와 설정 파일이 없었다.
- 변경: ESLint 10과 JavaScript·TypeScript 추천 규칙, React Hooks 기본 규칙, Vite용 React Refresh 검사, 실행 환경별 전역 이름 정의를 개발 의존성으로 추가했다. [eslint.config.js](../frontend/eslint.config.js)에 검사 규칙을 정의하고 lint 스크립트를 새 설정 형식에 맞췄다.
- 검사 범위: 프런트 소스와 JS·TS 설정 파일을 검사한다. `dist/`와 `coverage/`는 제외한다. React Hooks는 호출 순서와 의존성 누락을 검사한다. React Compiler 관련 추가 진단 확대는 별도 범위로 두었다. 오류·경고 및 불필요한 disable 주석이 있으면 lint 명령이 실패한다.
- 기존 코드: 앱 소스 수정 없이 검사에 통과했다. 패키지 잠금 파일에는 새 패키지 92개가 추가됐으며 기존 패키지 버전 변경은 없었다.
- 실행 환경: Node.js 22.19.0에서 검증했다. ESLint 10의 지원 범위인 Node.js 20.19 이상(20.x), 22.13 이상(22.x), 또는 24 이상을 [README](../README.md)에 반영했다.
- 검증 결과: `npm run lint` 오류·경고 0, `npm run test` **18개 전체 통과**, `npm run build` 성공. 기존 Browserslist 데이터 경고는 항목 10에 남아 있다.
- 검사 동작 확인: 파일로 저장하지 않은 잘못된 코드 예제에 대해 미사용 변수, 조건부 Hooks 호출, Effect 의존성 누락, JS 미정의 변수 진단이 실제로 발생하는 것을 확인했다. `dist/` 제외와 `src/App.tsx` 포함도 확인했다.
- 문서: README에 린트의 목적, 실행 명령과 검사 범위를 추가했다. 참고한 공식 문서는 [typescript-eslint 시작 안내](https://typescript-eslint.io/getting-started/), [ESLint 설정](https://eslint.org/docs/latest/use/configure/configuration-files), [React Hooks 검사 규칙](https://react.dev/reference/eslint-plugin-react-hooks)이다.
- 사용자 컨펌: 2026년 10월 19일 “좋아 커밋 후에 다음 작업을 이어서 진행하자”로 승인. 항목 04를 커밋한 뒤 항목 05만 진행한다.
- 커밋: `aec9c6e` — `fix: restore frontend lint checks`. 로컬 `phase2` 브랜치에 커밋했고 원격 푸시는 하지 않았다.

## 항목 05 수정 기록

- 사용자 승인: 항목 04 커밋 후 다음 작업 진행을 요청했다. 이번 범위는 냉장고·보관함·식재료의 생성·수정 및 소비·폐기 요청 검증이다.
- 문제 재현: 기존 API가 빈 이름·공백 이름·DB 길이 초과 문자열·음수 수량을 받아들였다. 일부 수정 요청은 필수 필드의 명시적 `null`을 저장 단계로 넘겼다. DB 입출력을 대체한 HTTP 테스트에서 재현했으며 실제 DB에 잘못된 값을 저장하지 않았다.
- 이름과 단위: [공통 이름 규칙](../backend/app/schemas/common.py)을 냉장고·보관함·식재료 생성 및 수정에 적용했다. 앞뒤 공백을 제거한 이름은 1~100자, 식재료 단위는 1~20자여야 한다. 중간 공백과 사용자 정의 단위는 허용한다. 길이 상한은 기존 DB 컬럼과 일치한다.
- 수량: [식재료 스키마](../backend/app/schemas/ingredient.py)에서 생성·수정·소비·폐기의 명시적 수량을 0보다 큰 유한한 JSON 숫자로 제한했다. 소수는 허용하며 0·음수·NaN·무한대·불리언·숫자 문자열은 거절한다. 화면의 기존 양수 입력 정책과 일치하며 수량 기본값 1과 단위 기본값 `개`는 유지한다.
- 부분 수정과 null: 식재료의 이름·수량·단위, 보관함의 이름·유형은 생략할 수 있지만 명시적 `null`은 거절한다. `exclude_unset=True`를 사용하는 기존 서비스 동작을 유지한다. 유통기한의 `null`은 날짜 삭제, 소비·폐기 수량의 생략 또는 `null`은 전량 처리라는 기존 의미를 유지한다. API 문서에서도 생략 가능 필드와 null 허용 필드를 구분했다.
- 오류 응답: 잘못된 요청은 HTTP 422와 기존 FastAPI 형식의 `detail` 오류 목록을 반환한다. 소비·폐기의 0·음수 수량도 기존 서비스의 HTTP 400 대신 입력 검증 단계에서 422로 거절한다. [오류 처리](../backend/app/middleware/error_handler.py)는 오류 입력에 들어 있는 NaN·무한대를 문자열로 변환하여 오류 응답의 JSON 직렬화 실패를 방지한다. `1e400`처럼 숫자로 해석하다 범위를 넘는 입력도 검증했다.
- 회귀 테스트: [test_request_validation.py](../backend/tests/unit/test_request_validation.py)에 매개변수 조합을 포함한 101개를 추가했다. 거절된 요청의 오류 필드와 저장 로직 미호출, 길이 경계, 공백 정리, 기본값, 소수 수량, 부분 수정, 날짜 삭제, 전량·부분 소비 및 폐기, 이력 수량과 API 문서를 검증한다. 실제 라우트·스키마·서비스·모델 객체를 사용하고 인증 의존성과 DB 입출력은 대체한다. 실제 PostgreSQL 제약과 트랜잭션 통합 검증은 수행하지 않았다.
- 검증 결과: 프로젝트 가상환경에서 `python -m pytest tests/unit/ -q --tb=short -p no:cacheprovider` 실행, **176개 전체 통과**. 기존 `datetime.utcnow()` 사용 중단 예정 경고 60건은 동일하다. 실제 DB와 외부 AI는 호출하지 않았다.
- 범위와 한계: DB 스키마·기존 저장 데이터·프런트 화면은 변경하지 않았다. 기존 소비·폐기의 현재 재고 이상 요청을 전량으로 처리하는 정책과 소수점 네 자리 반올림은 유지했다. 재고 초과 처리 및 수량 정밀도 정책을 바꾸려면 별도 논의가 필요하다. 개인 설정·AI 입력 정책 확대는 이번 범위에 포함하지 않았다.
- 참고: [Pydantic 필드 제약](https://docs.pydantic.dev/latest/concepts/fields/), [JSON 스키마의 부분 제외](https://docs.pydantic.dev/latest/api/json_schema/#pydantic.json_schema.SkipJsonSchema), [FastAPI 요청 검증 오류 처리](https://fastapi.tiangolo.com/tutorial/handling-errors/#override-request-validation-exceptions).
- 사용자 컨펌: 2026년 10월 19일 “좋아 커밋하고 다음으로 넘어가자”로 승인. 항목 05를 커밋한 뒤 항목 06만 진행한다.
- 커밋: `5e9d0f7` — `fix: validate inventory input before saving`. 로컬 `phase2` 브랜치에 커밋했고 원격 푸시는 하지 않았다.

## 항목 06 수정 기록

- 사용자 승인: 항목 05 커밋 후 다음 작업 진행을 요청했다. 이번 범위는 소비·폐기 다이얼로그의 비동기 완료와 실패 처리이다.
- 원인: [ConsumeDisposeDialog](../frontend/src/components/ingredient/ConsumeDisposeDialog.tsx)의 `onConfirm`이 `void` 타입이었고, 호출 결과를 기다리지 않은 채 입력을 지우고 창을 닫았다. API와 스토어는 비동기로 실패를 전달하지만 다이얼로그는 이를 처리하지 않았다. 수정 전 소비·폐기 각각의 연속 클릭 테스트에서 요청 콜백이 두 번 실행됐다.
- 변경: 콜백을 `Promise<void>`로 명시하고 `await`한다. 성공한 뒤에만 입력을 초기화하고 창을 닫는다. 실패하면 선택 모드·수량·메모를 유지하고 전량·부분 처리 모두에서 오류 메시지를 보여준다. 처리 중에는 `처리 중...`을 표시하고 입력과 버튼을 비활성화한다. 렌더링 전에 연속 클릭해도 제출하지 않도록 ref로 즉시 잠근다.
- 닫기 처리: [Modal](../frontend/src/components/common/Modal.tsx)에 기본값이 false인 `closeDisabled`를 추가했다. 소비·폐기 요청 중에만 닫기 버튼과 배경 클릭을 막고, 요청이 실패한 뒤에는 다시 닫거나 재시도할 수 있다. 닫기 버튼에 접근 가능한 이름을 추가했다. 다른 모달은 기존처럼 닫을 수 있다.
- 기존 동작: 전량 처리의 `quantity: null`, 메모 전달, 부분 처리의 소수 수량, 현재 재고 초과 입력 거절을 유지한다. 수량의 비유한 값도 클라이언트에서 거절한다. 서버 요청·응답 형식과 스토어의 성공 시 목록 갱신은 변경하지 않았다.
- 회귀 테스트: [다이얼로그 테스트](../frontend/src/__tests__/ConsumeDisposeDialog.test.tsx) 11개와 [페이지·스토어 연결 테스트](../frontend/src/__tests__/StorageBoxActions.test.tsx) 2개를 추가했다. 소비·폐기 각각의 응답 대기, 중복 제출 방지, 입력·닫기 잠금, 전량·부분 실패와 재시도, 닫은 뒤 입력 초기화, 수량 검증, 실패 시 재고 유지, 부분 성공 시 수량 갱신과 전량 성공 시 목록 제거를 검증한다.
- 명령 검증: `npm run test` **31개 전체 통과**, `npm run lint` 오류·경고 0, `npm run build` 성공. 테스트 선택자 옵션의 TypeScript 오류를 수정한 뒤 빌드와 해당 페이지 테스트 2개를 재검증했다. 기존 Browserslist 데이터 경고는 항목 10에 남아 있다.
- 사용 지침: `frontend-testing-debugging`과 `react-best-practices`를 적용했다. **Browser plugin not available** — 세션에 Browser 플러그인/스킬이 없어 기존 설치된 Playwright 1.63.0과 Chrome headless로 검증했다. 프로젝트 패키지나 브라우저 의존성을 추가하지 않았다.
- 브라우저 환경: `http://127.0.0.1:5175/storage-boxes/10`, 데스크톱 1440×1000에서 소비, 모바일 390×844에서 폐기. 테스트 스크립트는 저장소 밖 `C:/Users/Public/Documents/ESTsoft/CreatorTemp/recipick-consume-dispose-qa.mjs`에 두었다. 인증·재고 API를 브라우저에서 대체했고 실제 DB, OAuth, AI에는 연결하지 않았다. 검증용 개발 서버와 브라우저는 종료했다.
- 상호작용 검증: 식재료 관리 → 소비 또는 폐기 → 수량 0.5와 메모 입력 → 빠른 연속 클릭 → 응답 대기 중 입력·닫기 잠금 → 모의 HTTP 500 실패 → 수량·메모 유지 및 오류 표시 → 재시도 성공 → 잔량 2L 반영 → 다시 열어 전량 처리 → 목록 제거. 각 환경에서 요청 수는 의도한 실패·재시도·전량 처리의 총 3회였다.

| 브라우저 확인 | 결과 |
| --- | --- |
| 페이지 주소·제목 | 대상 경로와 `Recipick` 일치 |
| 빈 화면 여부 | 식재료 관리 화면·우유 목록·다이얼로그 렌더링 확인 |
| 프레임워크 오류 화면 | Vite 오류 오버레이 없음 |
| 콘솔 | 앱 예외·경고 없음. 의도한 HTTP 500의 네트워크 오류 로그만 각 1회 |
| 화면 캡처 | 데스크톱 대기 상태와 데스크톱·모바일 실패 상태 확인, 다이얼로그 잘림·가로 넘침 없음 |
| 동작 | 대기·실패·재시도·부분 및 전량 성공, 중복 요청 차단 확인 |

- 캡처 및 결과: 위 임시 폴더의 `recipick-consume-pending.png`, `recipick-consume-failure-desktop.png`, `recipick-dispose-failure-mobile.png`, `recipick-consume-dispose-qa.json`. 브라우저 첫 실행에서는 테스트용 API 가로채기 범위가 소스 모듈까지 포함되어 화면을 로딩하지 못했고, `/api/v1/`로 범위를 바로잡아 재검증했다.
- 한계: 모의 API로 화면과 실제 스토어 연결을 검증했으며 실제 DB 저장·다른 브라우저·기기에서는 확인하지 않았다. 이번 잠금은 같은 창에서 진행 중인 요청의 중복 제출을 방지한다. 여러 탭과 응답 유실 후 재시도까지 중복 처리를 보장하는 서버 멱등성 처리는 별도 범위이다. 모바일 상단 메뉴의 기존 줄바꿈은 이번 다이얼로그 수정 범위에 포함하지 않았다.
- 사용자 컨펌: 2026년 10월 19일 지금까지 진행한 내용을 문서화하고 커밋한 뒤 잠시 대기하도록 요청했다. 항목 06까지 커밋하고 다음 항목은 시작하지 않는다.
- 커밋 기록: `7e084a3` — `fix: preserve consume and dispose input on failure`. 소비·폐기 다이얼로그, 공통 모달의 닫기 잠금, 회귀 테스트 13개, 당시 진행·대기 인계 문서를 함께 커밋했다.
- 현재 상태: 수정·검증·컨펌·커밋 완료. 당시 사용자 요청에 따라 대기했으며 이후 재개 요청에 따라 항목 07을 진행한다.

## 항목 07 수정 기록

- 사용자 결정: 무료 등급을 지원하는 **Gemini 3.5 Flash-Lite**를 선택했다. 무료 등급과 일반 유료 단가는 구분하여 설명했다. 이후 사용자가 직접 유료 Tier 1에서 Free로 전환했다고 확인하고 실제 연결 테스트를 요청했다. 에이전트는 결제 설정을 변경하지 않았다.
- 문제: 코드 기본값, 환경 예제, 실제 로컬 설정이 모두 `gemini-2.0-flash`를 사용했다. [공식 종료 안내](https://ai.google.dev/gemini-api/docs/deprecations)에 종료일이 2026년 6월 1일로 기재되어 교체했다. 구 모델을 실제 호출해 종료 여부를 재현하지는 않았다.
- 모델 설정: [config.py](../backend/app/config.py), [.env.example](../backend/.env.example), [README](../README.md)를 `gemini-3.5-flash-lite`로 갱신했다. 실제 로컬 `backend/.env`는 모델 한 줄만 바꾸고 다른 바이트를 보존했다. 키 값은 출력·기록하지 않았으며 `.env`의 Git 제외도 확인했다. 실행 중인 백엔드는 설정 적용을 위해 재시작해야 하며, 이번 작업에서 서버 프로세스를 재시작하지 않았다.
- 호출 호환성: [클라이언트](../backend/app/ai/gemini_client.py)는 기존 REST `generateContent`를 유지한다. Gemini 3 권장값인 temperature `1.0`을 사용하고 3.5 Flash-Lite 기본 추론 수준 `minimal`을 따른다. 기존 출력 한도 2048과 HTTP 타임아웃 30초를 유지한다. 추론 요약·비텍스트 조각을 제외하고 답변 텍스트를 합친다. 정상 종료 `STOP`과 비어 있지 않은 답변을 요구하여 출력 제한으로 잘리거나 차단된 응답을 완성된 레시피로 반환하지 않는다. 이는 응답 형식 검사이며 레시피 내용의 정확성 검증은 아니다.
- 근거: [모델 정보](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite), [Gemini 3 생성 설정](https://ai.google.dev/gemini-api/docs/generate-content/gemini-3), [추론 수준과 응답 조각](https://ai.google.dev/gemini-api/docs/generate-content/thinking), [응답 종료 이유](https://ai.google.dev/api/generate-content#FinishReason). 모두 2026년 10월 19일 확인.
- 무료 개발 안내: [README](../README.md)에 AI Studio의 프로젝트 등급과 실제 한도 확인 절차를 남겼다. [가격표](https://ai.google.dev/gemini-api/docs/pricing)에 일반 입력·출력 무료 지원이 있으나, 실제 키가 속한 프로젝트가 Free 등급이어야 한다. [과금 안내](https://ai.google.dev/gemini-api/docs/billing)와 [사용량 제한](https://ai.google.dev/gemini-api/docs/rate-limits)을 함께 기록했다. 무료 등급의 입력·응답은 제품 개선에 사용될 수 있어 실제 연결 검증에는 가상 데이터를 사용한다.
- 회귀 테스트: [test_gemini_client.py](../backend/tests/unit/test_gemini_client.py)에 **19개** 추가. `httpx.MockTransport`와 테스트 전용 가짜 키를 사용하여 네트워크 요청 없이 검증한다. LangGraph에서 식재료·개인 설정을 조합해 선택 모델로 요청하고 여러 답변 조각을 레시피로 반환하는 흐름을 확인했다. 추론 요약·비텍스트 제외, 빈 답변·차단·잘린 답변 거부, HTTP 403/404/429/503 및 타임아웃 시 자동 재시도·다른 모델 호출이 없는지도 확인했다.
- 단위 검증 결과: 프로젝트 `.venv`의 `python -m pytest tests/unit/ -q --tb=short -p no:cacheprovider`에서 **195개 전체 통과**. 기존 `datetime.utcnow()` 경고 60건은 유지된다. 실제 로컬 설정 로딩도 `gemini-3.5-flash-lite`를 반환하며 키는 설정되어 있음을 값 공개 없이 확인했다. 단위 테스트는 실제 DB·외부 Gemini에 연결하지 않았다.
- 실제 연결 검증: 사용자 Free 전환 확인과 테스트 요청 이후, 실제 `run_recipe_graph`를 가상 식재료 두부 1개·계란 2개, 최대 조리 시간 15분·프라이팬 설정으로 실행했다. 코드의 프롬프트 생성·HTTP 호출·응답 처리를 그대로 사용하고 상태·토큰 수를 관찰하는 래퍼만 추가했다. **HTTP 200**, 응답 모델 버전 **`gemini-3.5-flash-lite`**, 종료 이유 **`STOP`**, 소요 시간 **2.65초**를 확인했다. 한국어 레시피 “초간단 몽글몽글 두부계란덮밥”과 재료·조리 순서·예상 시간 10분·팁이 반환되었다. 결과 문자열은 637자이며 API 보고 토큰은 입력 273, 출력 416, 합계 689이다. 추론 토큰 수는 응답에 없어 별도로 확정하지 않는다.
- 실행 환경: 샌드박스 안의 최초 시도는 HTTP 응답 전 `ConnectError`로 실패했다. 네트워크 권한 요청을 사용자가 실수로 거부한 뒤 다시 허용했으며, 이전 Python 실행이 남아 있지 않음을 확인한 후 권한 확장 환경에서 1회 요청해 성공했다. 자동 재시도·다른 모델 전환은 없었다. 임시 실행 과정의 HTTP 로깅과 원문 예외 출력은 비활성화하여 키가 포함된 URL을 출력하지 않았다. 영구적인 키·로그 보완은 항목 09에 남아 있다.
- 검증 자료: 저장소 밖 `C:/Users/Public/Documents/ESTsoft/CreatorTemp/recipick-gemini-live-check.json`에 모델·상태·사용량·가상 데이터 기반 레시피를 기록했다. API 키와 요청 URL은 포함하지 않는다. 실제 DB 조회·저장과 실행 중인 서버 재시작은 하지 않았다. 추가 코드 변경이 없어 통과한 단위 테스트를 반복하지 않았다.
- 한계: Free 등급은 사용자 확인을 근거로 하며 현재 계정의 정확한 무료 한도·청구 내역은 직접 조회하지 않았다. 실제 호출 성공으로 키와 선택 모델의 접근 가능성을 확인했으나, 한 번의 응답으로 전반적인 레시피 품질을 보장하지 않는다. 응답에는 가상 재고 외 기본 양념과 밥 제안도 있어 재고 재료만 엄격히 사용하는 정책은 별도 검토가 필요하다.
- 범위: 사용자별 호출 제한(항목 08), API 키의 URL·로그 노출 경로(항목 09), 의존성 업데이트는 변경하지 않았다.
- 사용자 컨펌: “훌륭해 커밋 후 다음 작업에 대해 짧게 브리핑해줘.”로 결과 컨펌과 커밋을 승인했다.
- 커밋 기록: `fix: migrate recipe recommendations to Gemini 3.5 Flash-Lite` — 모델 기본값과 환경 예제, 응답 처리, 회귀 테스트 19개, README 및 이 인계 문서를 함께 기록한다. 실제 `.env`와 저장소 밖 연결 테스트 자료는 포함하지 않는다. 커밋 해시는 `git log -1 --oneline -- backend/app/ai/gemini_client.py`로 확인할 수 있다.
- 현재 상태: 코드 수정·단위 검증·실제 연결 검증·문서화·컨펌·커밋 완료. 커밋은 `f26f61b`이며 항목 08은 별도로 정책을 논의한다.

## 항목 08 수정 기록

- 사용자 제공 자료: AI Studio의 “지난 28일 동안의 모델별 최대 사용량과 한도 비교” 표. `Gemini 3.5 Flash Lite` 행은 RPM `0 / 15`, TPM `0 / 250K`, RPD `0 / 500`이다. 표시된 한도는 분당 요청 15회, 분당 입력 250,000토큰, 일일 요청 500회이다. 앞의 0은 해당 화면의 사용량 표시이며 남은 호출 횟수로 해석하지 않는다. 앱 API 키와 같은 프로젝트의 화면이라는 전제이며 에이전트가 계정 화면을 직접 조회한 것은 아니다.
- 확정값: 사용자가 “그렇게 하자”로 승인했다. 계정별 동시 1건, 최근 60초 최대 3회, 하루 20회. 앱 전체는 최근 60초 최대 12회·하루 400회이다. 앱 밖에서 같은 프로젝트를 사용하는 호출도 Google 한도를 공유하므로 앱 제한만으로 프로젝트의 남은 할당량을 정확히 알 수는 없다.
- 날짜 기준: 사용자별 일일 횟수는 한국 시간 자정, 앱 전체 일일 횟수는 미국 태평양 시간 자정에 초기화한다. `ZoneInfo`의 `Asia/Seoul`, `America/Los_Angeles`와 UTC 저장 시각을 사용한다. 서머타임 전환의 23시간·25시간 하루도 테스트했다. Windows에서도 시간대 데이터가 설치되도록 `tzdata>=2025.2`를 직접 의존성으로 명시했으며 로컬에는 이미 2025.3이 있어 추가 설치하지 않았다. [공식 한도 안내](https://ai.google.dev/gemini-api/docs/rate-limits), [Python 시간대 데이터 안내](https://docs.python.org/3/library/zoneinfo.html)
- 집계·동작: Gemini 호출 직전에 영구 기록하며 성공·실패·시간 초과 모두 1회로 집계한다. 권한 거부·식재료 없음·앱 제한 거부·API 키 미설정·프롬프트 생성 실패처럼 호출 이전 단계에서 끝난 요청은 집계하지 않는다. 전송 직전 기록 후 프로세스가 중단되는 아주 짧은 구간에서는 보수적으로 1회를 유지한다. 자동 재시도나 다른 모델로의 전환은 없다.
- DB 구현: [사용량 모델](../backend/app/models/recipe_usage.py), [마이그레이션](../backend/alembic/versions/b84e1f920a63_add_recipe_usage_attempts.py), [제한 서비스](../backend/app/services/recipe_usage.py)를 추가했다. 요청별 UUID·계정 ID·시작/완료/진행 만료 시각만 저장하며 프롬프트·식재료·키는 저장하지 않는다. 시각은 timezone-aware이고 조회·정리 조건에 시작 시각 인덱스를 사용한다. 계정 삭제가 전체 사용량까지 초기화하지 않도록 계정 FK의 cascade 삭제에 연결하지 않았다.
- 동시성·영속성: 별도 짧은 트랜잭션에서 PostgreSQL advisory transaction lock으로 확인·기록을 직렬화한다. 요청 본문의 트랜잭션이 롤백되어도 집계는 남는다. AI 응답 대기 중에는 이 잠금을 보유하지 않는다. 추천 서비스의 읽기 트랜잭션도 먼저 종료하여 연결 풀을 점유한 채 별도 기록용 연결을 기다리지 않게 했다. DB 오류 시에는 AI 호출을 진행하지 않는다. 2일 이전 기록은 다음 허용 요청에서 정리한다. [PostgreSQL 잠금 근거](https://www.postgresql.org/docs/current/explicit-locking.html)
- 진행 상태 복구: HTTP 단계별 30초에 더해 요청 전체를 60초로 제한하고, 진행 상태는 최대 90초의 임시 점유로 기록한다. 정상·실패·취소 시 완료 상태를 별도 저장한다. 완료 기록은 최대 5초만 기다리며 DB 장애·프로세스 강제 종료로 남은 점유는 만료 후 복구된다. 재시작해도 호출 횟수는 유지되며 진행 중이던 요청의 점유만 잠시 남을 수 있다.
- API·화면: 로컬 제한은 HTTP 429의 `code`, `message`, `retry_at`, `retry_after_seconds`와 가능한 경우 `Retry-After` 헤더를 반환한다. 여러 횟수 제한이 겹치면 가장 늦게 풀리는 시각을 사용한다. 공급자의 HTTP 429도 비밀정보 없는 안내로 변환하며 공급자가 `Retry-After`를 제공하면 반영한다. 진행 중 요청이나 공급자의 재시도 시간이 불명확한 경우에는 시각을 추정하지 않는다. [레시피 스토어](../frontend/src/stores/useRecipeStore.ts)는 한국 시간으로 표시하고 React 재렌더 전 중복 호출도 차단한다. [페이지](../frontend/src/pages/RecipePage.tsx)에는 오류 안내의 `role="alert"`를 추가했다.
- 테스트: [정책 단위 테스트](../backend/tests/unit/test_recipe_usage.py), [PostgreSQL 통합 테스트](../backend/tests/integration/test_recipe_usage.py), 기존 Gemini·권한 테스트를 보강했다. 같은 계정의 8개 동시 예약 중 1개, 서로 다른 계정의 17개 중 12개만 허용했다. 분 경계, 두 시간대의 자정, DST, 실패·취소·요청 롤백, 연결 풀·제한 서비스 재생성 후 집계 유지, 프로세스 중단·완료 기록 실패 후 만료 복구, DB 장애 시 차단, 기록 정리 및 마이그레이션 upgrade/downgrade를 확인했다. [프런트 회귀 테스트](../frontend/src/__tests__/RecipeLimits.test.tsx) 6개는 안내·시각·수동 재시도·중복 차단·비정상 오류 응답을 검증한다.
- 안전한 DB 검증: `RECIPICK_RUN_POSTGRES_TESTS=1`로 새 통합 테스트 파일만 명시적으로 실행한다. localhost 개발 DB만 허용하고 무작위 `recipick_usage_test_<uuid>` 스키마를 생성해 실제 새 마이그레이션을 실행한 뒤 해당 스키마만 제거한다. 기존 위험한 `setup_db`/`drop_all` 픽스처는 사용하지 않는다. 최종 잔여 테스트 스키마 0개, 실제 앱 사용량 기록 0건을 확인했다.
- 로컬 적용: PostgreSQL 16.13에서 기존 리비전 `1338c8f9fe82`를 확인한 후 `alembic upgrade head`로 **`b84e1f920a63`**을 적용했다. 새 테이블·인덱스 생성만 포함하며 기존 사용자·재고 데이터는 변경하지 않았다. 다른 환경의 적용 절차는 [README](../README.md)에 기록했다.
- 최종 명령 검증: `python -m pytest tests/unit/ tests/integration/test_recipe_usage.py -q --tb=short -p no:cacheprovider`에서 **224개 통과**(단위 212 + 실제 DB 12), `npm run test` **37개 통과**, `npm run lint` 오류·경고 0, `npm run build` 성공. 기존 `datetime.utcnow()` 경고는 권한 테스트 추가로 70건이며 원인은 동일하다. 빌드의 Browserslist 데이터 경고는 항목 10에 남는다. 샌드박스의 Vite 설정 폴더 접근과 pytest 임시 폴더 접근 오류는 권한 확장 후 통과했다.
- 브라우저 환경: **Browser plugin not available**이므로 기존 Playwright 1.63.0 + Chrome headless를 사용했다. `http://127.0.0.1:5175/recipes`, 데스크톱 1440×1000 및 모바일 390×844. 인증·냉장고·추천 API는 모의 응답이며 실제 Gemini를 추가 호출하지 않았다. 테스트용 개발 서버와 브라우저는 종료했다.

| 브라우저 검사 | 결과 |
| --- | --- |
| 주소·제목·빈 화면·오류 오버레이 | `/recipes`, `Recipick`, 냉장고 선택과 추천 화면 정상, Vite 오버레이 없음 |
| 콘솔 | 앱 예외·경고 없음. 의도한 HTTP 429 네트워크 오류만 각 환경에 2회 |
| 화면 캡처 | 제한 이유와 한국 시간 안내 표시, 가로 넘침·안내 영역 잘림 없음 |
| 상호작용 | 냉장고 선택 → 요청 중 중복 클릭 차단 → 제한 이유/재시도 시각 → 수동 재시도 성공 → 공급자 제한 안내, 각 환경 요청 3회 |

- 브라우저 자료: 저장소 밖 `C:/Users/Public/Documents/ESTsoft/CreatorTemp/`의 `recipick-recipe-limits-qa.mjs`, `recipick-recipe-limits-qa.json`, `recipick-recipe-limit-desktop.png`, `recipick-recipe-limit-mobile.png`. 모바일 상단 메뉴의 기존 줄바꿈은 이번 변경 범위가 아니다.
- 한계: 이번 제한은 같은 DB를 공유하는 앱의 요청 횟수에 적용된다. TPM 입력량 제한과 다른 앱의 프로젝트 사용량을 직접 추적하지 않으며, 공급자의 한도 오류를 안내한다. 실제 로그인·DB·Gemini·브라우저를 모두 연결한 전체 흐름이나 운영 배포는 검증하지 않았다. API 키의 URL·일반 오류 로그 노출 경로는 항목 09로 남겨 두었다.
- 사용자 컨펌: “오케이 커밋 후 다음 항목으로 넘어가자.”로 결과 컨펌, 커밋, 항목 09 진행을 승인했다.
- 커밋 기록: `fix: enforce persistent recipe recommendation limits` — 사용량 모델·마이그레이션·제한 서비스, API·화면 안내, 단위·통합 테스트와 문서를 포함한다. 기존 미추적 파일과 임시 QA 자료는 제외한다. 해시는 `git log -1 --oneline -- backend/app/services/recipe_usage.py`로 확인할 수 있다.
- 상태: 항목 08 구현·검증·문서화·로컬 DB 적용·컨펌·커밋 완료. 커밋은 `2fc0cad`이다.

## 항목 09 수정 기록

- 문제 재현: 가짜 키 `test-only-key`와 `httpx.MockTransport`로 호출했을 때 요청 URL의 `?key=...`와 HTTPX INFO 요청 로그에 키가 포함됨을 확인했다. 성공 응답에서도 재현되며, 실제 키를 출력하거나 Google에 요청하지 않았다. 기존 일반 오류 로거는 예외 문자열과 전체 traceback을 기록했다.
- 인증 변경: [Gemini 클라이언트](../backend/app/ai/gemini_client.py)에서 URL 쿼리의 키를 제거하고 `x-goog-api-key` 헤더로 전송한다. [Google 공식 API 인증 안내](https://ai.google.dev/api#authentication)를 확인했다. 모델·프롬프트·생성 설정·호출 횟수 정책은 유지하며 키는 요청 본문에도 넣지 않는다. 리다이렉트·자동 재시도·다른 모델 전환은 하지 않는다.
- 설정 마스킹: [설정](../backend/app/config.py)의 `GEMINI_API_KEY`를 `SecretStr`로 바꾸어 문자열·repr·JSON 출력에 원문이 드러나지 않게 했다. HTTP 인증 헤더를 만들 때만 값을 꺼낸다. 실제 `.env`나 키 값은 변경하지 않았고 설정 방법도 동일하다. 다른 설정 필드 전체를 비밀정보로 전환한 것은 아니다.
- 공급자 오류: HTTP 오류, 연결/프로토콜 오류, 단계별·전체 시간 초과, 잘못된 JSON을 `GeminiRequestError`로 변환한다. 오류에는 코드에서 정한 종류와 숫자 상태 코드만 담고 원문 메시지·응답·요청 객체를 사용자 정의 속성에 보관하지 않는다. 잡은 예외는 `from None`으로 체인 출력을 억제한다. 응답 JSON 해석 실패는 공급자 내부 오류로 처리하여 기존 ValueError 처리의 HTTP 400 대신 일반 오류와 같은 HTTP 500을 반환한다. 공급자의 HTTP 429 안내와 완결되지 않은 답변 거부는 기존 동작을 유지한다.
- 서버 재출력 방지: 설치된 Starlette의 `ServerErrorMiddleware`는 일반 500 처리 후 예외를 다시 발생시켜 Uvicorn에 전달한다. 따라서 일반 로그 문구만 바꾸는 것으로 끝내지 않고 `GeminiRequestError` 전용 예외 핸들러를 등록했다. Gemini 처리 오류가 서버의 원문 예외 로깅으로 다시 전달되지 않음을 `raise_app_exceptions=True`인 ASGI 테스트에서 확인했다.
- 앱 오류 로그: [오류 처리](../backend/app/middleware/error_handler.py)는 요청 방식·라우트 패턴·예외 종류·공급자 오류 종류/상태·파일명/행/함수만 기록한다. 실제 요청 경로 값·쿼리·인증 헤더·본문·예외 메시지/체인/노트·소스 줄·지역 변수는 포함하지 않으며 로그 레코드에도 원본 예외를 전달하지 않는다. 일반 500 응답 문구는 `Internal server error`를 유지한다.
- 회귀 검증: [Gemini 테스트](../backend/tests/unit/test_gemini_client.py)와 [오류 처리 테스트](../backend/tests/unit/test_error_handler.py)를 보강하여 총 단위 테스트가 212개에서 **223개**로 늘었다. 헤더 인증과 URL/본문의 키 부재, 정상 HTTPX 로그, 설정 마스킹, HTTP 307/403/404/503, 연결·프로토콜·시간 초과, JSON 해석 실패, 원문 예외 체인 제거, 안전한 500 응답, ASGI 밖으로 예외가 전달되지 않음, 로그의 호출 위치 유지, 요청 경로/쿼리/본문/인증정보 제외를 확인했다. 기존 429·중복 요청·권한·시간 초과 후 점유 해제 테스트도 통과했다.
- 실행 결과: 프로젝트 `.venv`의 `python -m pytest tests/unit/ -q --tb=short -p no:cacheprovider`에서 **223개 전체 통과**, 기존 `datetime.utcnow()` 경고 70건. 실제 DB나 외부 Gemini에 연결하지 않았다. 테스트 작성 중 여러 모의 응답의 요청 목록을 누적한 검증 코드 오류를 발견해 각 응답을 독립된 매개변수 테스트로 분리한 뒤 전체 통과를 확인했다. 프런트·DB 스키마 변경이 없어 해당 검증은 반복하지 않았다.
- 한계: Google 실제 연결을 이번 헤더 방식으로 다시 호출하지는 않았다. 이번 검증은 앱 오류 로거와 Gemini 처리 경로를 대상으로 한다. 별도 프록시·헤더/본문 디버그 덤프·외부 수집 도구, Gemini 이외의 미처리 예외에 대한 Uvicorn 로그는 별도 점검 대상이다. 기존 로그에 실제 키가 남았는지나 과거 유출 여부는 확인하지 않았다.
- 사용자 승인: “9번은 뭘 수정한 건데?”라는 질문에 URL에서 헤더로 이동, 진단 정보만 로그에 기록, 설정 출력 마스킹을 설명했다. 사용자는 “좋아 다 되면 커밋하자”라고 완료 후 커밋을 승인했고, 커밋 보고 후 “ㄱㄱ”로 항목 10 진행도 승인했다.
- 커밋 기록: `fix: keep Gemini credentials out of request and error logs` — Gemini 클라이언트·설정·오류 처리·회귀 테스트·README·이 인계 문서를 포함한다. 실제 `.env`, 기존 미추적 `.claude/`와 `nul`은 제외한다. 해시는 `git log -1 --oneline -- backend/app/middleware/error_handler.py`로 확인한다.
- 현재 상태: 구현·검증·문서화·사용자 승인·로컬 커밋 완료. 커밋은 `d6f7743`이다.

## 항목 10 수정 기록

- 사용자 범위 결정: “Tailwind 3 유지, 나머지 보안 업데이트 후 잔여 항목 기록 (추천) 이건 추천대로 할게 일단. 기록해줘”라고 승인했다. Tailwind 4 전환과 CSS 전면 변경은 진행하지 않는다. 남는 항목을 숨기거나 `npm audit fix --force`로 강제 전환하지 않는다.
- 시작 상태: 2026년 10월 19일 `npm audit` 재검사에서 **24건(Critical 1, High 17, Moderate 5, Low 1)**을 확인했다. 전체 원본은 저장소 밖 `C:/Users/Public/Documents/ESTsoft/CreatorTemp/recipick-audit-before.json`에 저장했다. 이번 수정은 최초 점검의 프런트 npm 의존성을 대상으로 한다.
- 영향 구분: Vitest의 Critical은 UI/API 서버·Browser Mode 관련 기능의 노출 조건이 있다. 현재 테스트는 `vitest run` + jsdom이며 UI 서버를 켜지 않는다. Vite는 개발 서버, PostCSS·Babel·Browserslist는 빌드 도구이다. Axios와 React Router는 앱에서 사용하는 의존성으로 같은 주 버전 내에서 보안 수정판으로 갱신한다. 공지의 심각도와 현재 앱에서 재현된 취약점은 구분한다. [Vitest 공지](https://github.com/vitest-dev/vitest/security/advisories/GHSA-5xrq-8626-4rwp)
- Tailwind 잔여 사유: `braces`는 3.0.3까지 재귀 깊이 제한 누락에 따른 프로세스 중단 문제가 있으며 현재 수정 릴리스가 없다. Tailwind 3의 `chokidar`·`micromatch` 경로에 포함된다. `postcss-selector-parser`의 계산량 문제는 7.1.6에서 수정되었으나 Tailwind 3은 6.x를 요구한다. 현재 프로젝트는 저장소의 고정 파일 패턴·CSS를 빌드하며 사용자에게 이 도구의 입력을 받는 경로는 확인되지 않았다. 신뢰할 수 없는 코드·CSS를 빌드하거나 외부 입력을 처리하는 기능을 추가하기 전에는 다시 검토해야 한다. [braces 원 보고](https://github.com/micromatch/braces/issues/70), [선택자 파서 공식 공지](https://github.com/postcss/postcss-selector-parser/security/advisories/GHSA-rj75-hqrm-r3gf)
- 적용 버전: 아래 표는 변경 전후 잠금 파일의 실제 버전이다. Vite 6.4는 확인 시점의 보안 패치 지원 대상으로, 5에서의 변경 범위를 줄이기 위해 선택했다. 플러그인·Vitest는 Vite 6.4.4 한 버전을 공유한다. [Vite 지원 정책](https://vite.dev/releases), [Vite 5→6 변경 안내](https://v6.vite.dev/guide/migration)

| 패키지 | 변경 전 | 변경 후 |
| --- | --- | --- |
| Axios | 1.13.3 | 1.20.0 |
| React Router DOM | 7.13.1 | 7.18.4 |
| Vite | 5.4.21, Vitest 하위 7.3.1 | 6.4.4로 통합 |
| Vitest | 4.0.18 | 4.1.12 |
| PostCSS | 8.5.6 | 8.5.31 |
| Tailwind CSS | 3.4.19 | 3.4.19 유지 |

- 전이 의존성: Babel, Browserslist·caniuse-lite, Rollup, Undici, Nano ID, Axios 하위 패키지 등을 허용 범위 안에서 갱신했다. 최종 주요 버전은 `@babel/core` 7.29.7, Browserslist 4.29.3, Undici 7.30.1이다. 강제 major override·`legacy-peer-deps`는 사용하지 않았다.
- npm 설치 문제와 해결: Node 22.19.0 / npm 10.9.3에서 Vitest 설치 중 Arborist의 `Cannot read properties of null (reading 'edgesOut')`가 반복됐다. 임시 npm 11 실행은 설명을 위해 중단했으며 사용자가 이후 정식 업데이트를 승인했다. `C:/Program Files/nodejs`의 기존 npm을 **11.19.1**로 교체했고 새 셸의 `npm --version`과 기본 실행 경로로 확인했다. 같은 Vitest 설치도 성공했다. Node 버전이나 PATH는 바꾸지 않았다. 다른 프로젝트에서 사용하는 기본 npm에도 적용되며, 다른 프로젝트의 설치 검증은 하지 않았다. [호환 조건](https://github.com/npm/cli/blob/v11.19.1/package.json), [관련 오류 수정](https://github.com/npm/cli/pull/8448), [Vitest 설치 오류 보고](https://github.com/npm/cli/issues/9787)
- Windows 권한: Program Files 쓰기는 일반 실행에서 EPERM으로 거부됐다. npm 설치 명령만 담은 임시 스크립트를 관리자 권한/UAC로 실행하여 종료 코드 0을 확인했다. 사용자에게 허용받은 시스템 npm 업데이트 범위이며 로컬 앱 설정·키는 변경하지 않았다.
- 설치 재현: `packageManager: npm@11.19.1` 및 Node/npm `engines`를 기록하고 `npm install --package-lock-only --no-audit --no-fund`로 잠금 파일을 맞췄다. 이어 `npm ci --no-audit --no-fund`로 396개 패키지를 재설치했다. `npm ls`에서 peer 의존성 오류 없이 Vite 중복 제거를 확인했다. `packageManager`는 시스템 npm을 자동 설치하지 않는다.
- 설치 스크립트: npm 11이 미승인 `esbuild`·`msw` 설치 스크립트를 건너뛰어 공식 정책과 실제 스크립트를 검토했다. `npm install-scripts approve esbuild msw`로 `esbuild@0.25.12`, `msw@2.12.10` 두 버전만 `allowScripts`에 기록했다. esbuild는 플랫폼 바이너리를 확인하며, msw는 프로젝트에 `workerDirectory`가 없어 워커 파일을 만들지 않는다. 전체 스크립트 허용 옵션은 사용하지 않았다. [npm 공식 문서](https://docs.npmjs.com/cli/v11/commands/npm-install-scripts/)
- 최종 감사: 재설치 후 `npm audit --json`은 **7건(High 5, Moderate 2, Critical 0, Low 0)**이며 잔여 항목 때문에 종료 코드 1이다. `npm audit --omit=dev --json`은 **0건**, 종료 코드 0이다. 전부 해결됐다는 의미가 아니며 아래 7개는 서로 독립된 7가지 원인이 아니라 두 공지의 전이 영향까지 집계한 수치다.

| 남은 원인 | 감사에 표시되는 패키지 | 심각도·후속 조치 |
| --- | --- | --- |
| 중첩 패턴 재귀 (`braces`) | braces, chokidar, micromatch, fast-glob, tailwindcss | High 5건. Tailwind 3 유지에 따라 기록하고 후속 패치·전환 시 재검사 |
| 선택자 파싱 CPU 소모 (`postcss-selector-parser`) | postcss-selector-parser, postcss-nested | Moderate 2건. 수정된 7.x 강제 주입 없이 Tailwind 전환 또는 호환 수정판 검토 |

- 자동 검증: `npm run test` **6개 파일·37개 테스트 통과**, `npm run lint` 오류·경고 0, `npm run build` TypeScript·Vite 6.4.4 프로덕션 빌드 통과. Browserslist 데이터 경고도 없어졌다. 백엔드는 변경하지 않았다. `pip check`는 통과했으나 Python 보안 감사 도구가 설치되지 않아 Python 취약점 검사를 했다는 의미는 아니다.
- 브라우저 환경: **Browser plugin not available**이므로 기존 Playwright 1.63.0 + Chrome headless를 사용했다. `http://127.0.0.1:5175`, 1440×1000·390×844. PowerShell에서 `npm run dev -- --host ...`가 옵션을 가로채어 `npm.cmd run dev -- --host 127.0.0.1 --port 5175 --strictPort`를 사용했다. Vite 설정 로딩의 샌드박스 접근 제한은 같은 명령의 권한 확장 후 해결됐다. 테스트 서버와 브라우저는 종료했다.

| 브라우저 확인 | 결과 |
| --- | --- |
| 주소·제목·내용·오버레이 | 레시피·식재료·선호 설정·로그인 경로 확인, 제목 Recipick, 빈 화면·Vite 오류 오버레이 없음 |
| 콘솔 | 앱 예외·경고 없음. 의도한 모의 401·429·500 네트워크 오류만 발생 |
| 인증·라우팅 | 단일 401 → 토큰 갱신 → 원 요청 재시도·토큰 교체 → 설정/레시피 링크 이동·뒤로가기 → 로그아웃·토큰 제거 통과 |
| 레시피 | 냉장고 선택 → 중복 요청 차단 → 제한 이유·한국 시간 안내 → 수동 재시도 성공 → 공급자 한도 안내 통과 |
| 소비·폐기 | 처리 중 중복/닫기 차단 → 오류 후 수량·메모 유지 → 수동 재시도 → 일부/전체 처리와 목록 갱신 통과 |
| 화면 | 데스크톱·모바일 캡처 확인. 레시피·오류 모달 잘림·가로 넘침 없음. 기존 모바일 상단 메뉴 줄바꿈은 남아 있음 |

- 인증 검증에서 발견한 별도 항목: 첫 스크립트는 겹쳐 발생한 GET 모두에 401을 주어 refresh가 여러 번 호출됐다. 개발 StrictMode의 효과 재실행과 현재 요청별 갱신 처리 구조를 확인했다. 단일 만료 요청의 갱신 검증은 모의 401을 한 번만 발생시키도록 분리하여 통과했다. 동시 401을 하나의 갱신으로 처리하는 개선·실패 검증은 항목 11 후보이며 이번에 수정하거나 해결됐다고 판단하지 않는다.
- 자료: 저장소 밖 `C:/Users/Public/Documents/ESTsoft/CreatorTemp/`에 `recipick-deps-recipe-limits-qa.mjs/.json`, `recipick-deps-consume-dispose-qa.mjs/.json`, `recipick-deps-auth-navigation-qa.mjs/.json`, `recipick-deps-*.png`와 `recipick-audit-after.json`을 보관했다. 앱 저장소에는 QA 스크립트·캡처·실제 키를 추가하지 않는다.
- 검증 한계: 브라우저의 인증·재고·추천 응답은 모두 모의 API이며 실제 OAuth·DB·Gemini 통합은 재실행하지 않았다. Chrome 이외 브라우저, 다른 프로젝트의 npm 호환성, 운영 배포는 검증하지 않았다. Tailwind 잔여 취약점은 새 패치나 Tailwind 전환 시 다시 검토한다.
- 사용자 컨펌: 2026년 10월 23일 “좋아 그럼 항목 10 커밋하고, 항목 11에서 뭘 수정할 건지 짧게 브리핑해줘.”로 결과 컨펌·커밋을 승인했다. 이 시점의 항목 11 요청은 브리핑이며, 이후 구현 승인은 아래 11-1에 별도로 기록한다.
- 커밋 기록: **`78fb7a7` — `chore: update frontend dependencies and document remaining security risks`**. `frontend/package.json`, `frontend/package-lock.json`, `README.md`, 이 문서의 4개 파일을 포함한다. 시스템 npm의 설치 자체는 Git에 담기지 않으며 요구 버전과 설치 정책을 기록했다. 원격 푸시는 하지 않았다.
- 현재 상태: 항목 10 수정·검증·문서화·컨펌·로컬 커밋 완료. 검증 후 실행 코드 변경이 없어 커밋 시 테스트·빌드는 반복하지 않았고, 변경 파일 범위와 `git diff --check`를 확인했다.

## 항목 11-1 수정 기록 — 인증 토큰 갱신 중복 방지

- 구현 승인: 2026년 10월 23일 “좋아 그럼 추천한 대로 인증 토큰 갱신 중복 문제부터 수정하고 테스트까지 진행해줘.”라는 사용자 요청. 항목 11 전체를 한 번에 수정하는 승인은 아니다.
- 문제 재현: 실제 Axios 인터셉터에 MSW 모의 HTTP 응답을 연결한 새 테스트 5개가 수정 전 모두 실패했다. 동시 요청 3개가 갱신을 **3회** 호출하고, 갱신 완료 뒤 늦은 401이 **추가 갱신**을 호출했다. 갱신 중 로그아웃 후 토큰 복원, refresh token 부재 시 오래된 access token 잔류도 재현했다.
- 변경: [Axios 클라이언트](../frontend/src/api/client.ts)에서 현재 로그인 세션의 진행 중인 갱신 Promise를 공유한다. 성공하면 각 요청을 원래 HTTP 방식·주소·쿼리·본문으로 한 번만 재시도한다. 갱신 완료 횟수를 함께 기록하여 늦은 401은 새 토큰을 재사용한다. 서버가 같은 문자열의 토큰을 반환해도 중복 갱신을 막는다.
- 세션 보호: 요청이 시작된 세션과 현재 localStorage 토큰 쌍을 비교한다. 갱신 도중 로그아웃·다른 계정 로그인으로 토큰이 바뀌면 이전 갱신/401 응답은 현재 토큰을 덮어쓰거나 삭제하지 않고, 이전 요청을 다른 계정 자격으로 재시도하지 않는다. 이 보호는 API 클라이언트의 갱신·401 처리 범위이다.
- 실패 처리: 갱신의 HTTP 오류·네트워크 오류·잘못된 토큰 응답·**30초 시간 초과** 시 대기 요청을 모두 거절하고, 해당 세션 토큰을 삭제한 뒤 로그인 페이지로 한 번 이동한다. 갱신에는 인터셉터가 없는 Axios를 사용하며 명시적인 `/auth/refresh` 실패도 다시 갱신하지 않는다. 새 토큰으로 한 번 재시도한 요청도 401이면 추가 갱신 반복을 막는다. 403·500 등 일반 요청 오류는 인증을 변경하지 않는다.
- 회귀 테스트: [apiClient.test.ts](../frontend/src/__tests__/apiClient.test.ts)에 **21개** 추가. 동시 GET/POST/PATCH와 본문·쿼리 보존, 늦은 401, 동일 토큰 응답, HTTP 401/503·네트워크·응답 형식 오류, 갱신 중 로그아웃/새 로그인, refresh token 부재, 재시도 401, 일반 오류, 다음 만료의 재갱신, 실패 후 새 로그인, 일부 요청 취소, 직접 갱신 실패, 시간 초과를 검증한다. Axios 자체는 실제로 실행하며 서버 응답을 MSW로 대체한다. 시간 초과 테스트는 실제 Axios timeout 동작을 50ms로 단축하고 앱 설정 30초도 확인한다.
- 자동 검증: `npm.cmd run test` **7개 파일·58개 테스트 통과**, `npm.cmd run lint` 오류·경고 0, `npm.cmd run build` TypeScript·Vite 빌드 통과. 빌드 과정에서 새 테스트의 Vitest mock 타입이 함수/생성자 합집합으로 추론되는 오류를 발견해 함수 서명을 명시하고 해결했다. 테스트·개발 서버의 초기 실행은 샌드박스의 Vite 설정 접근 제한으로 실패하여 동일 명령을 권한 확장으로 실행했다.
- 브라우저 검증: 스킬 기준 **Browser plugin not available**이므로 기존 Playwright + Chrome headless를 사용했다. `http://127.0.0.1:5175`, 1440×1000·390×844에서 성공/실패 총 4개 시나리오를 실행했다. 흐름은 `/recipes` 진입 → 동시 만료 → 성공 시 화면 복구·설정 메뉴·로그아웃, 실패 시 `/login` 이동이다. 각각 만료 응답 **4개·갱신 1회**, 실패 시 원 요청 재시도 0회·로그인 문서 요청 1회를 확인했다. 제목 Recipick·유의미한 화면·토큰 교체/삭제·Vite 오류 오버레이 부재를 확인했으며 앱 예외·경고는 없었다. 콘솔의 401은 의도한 모의 오류만 발생했다.
- 브라우저 검증 코드 보정: React Router의 같은 URL history 변경까지 포함하는 `framenavigated` 이벤트를 로그인 재로드로 잘못 집계한 최초 assertion을 실제 문서 navigation 요청 집계로 바꿨다. 이후 네 시나리오 모두 통과했다. 앱 코드는 이 보정 과정에서 바꾸지 않았다.
- 화면·자료: 성공 후 선호 설정과 실패 후 로그인 화면 캡처를 확인했다. 모바일 상단 메뉴 줄바꿈은 기존 상태이며 이번 범위에서 바꾸지 않았다. 저장소 밖 `C:/Users/Public/Documents/ESTsoft/CreatorTemp/recipick-auth-refresh-qa.mjs/.json`, `recipick-auth-refresh-*.png`에 QA 자료를 저장했다. 검증용 개발 서버와 Chrome은 종료했다.
- 한계·후속 범위: 동일 탭의 동시 갱신만 공유하며 여러 탭 간 잠금은 구현하지 않았다. 실제 OAuth 공급자·백엔드·DB·Gemini는 이번 검증에서 연결하지 않았다. 백엔드, 인증 저장 방식, 의존성, 키, DB 스키마는 변경하지 않았다. 재고 수량·이력·권한 테스트와 테스트 DB 안전장치는 미착수이다.
- 사용자 컨펌: 2026년 10월 23일 “좋아 커밋하고, 다음 항목에서 뭘 수정할 건지 짧게 브리핑해줘.”로 결과 컨펌·커밋 승인. 다음 세부 항목의 구현 승인은 아직 없다.
- 커밋 기록: **`ae1cfc2` — `fix: deduplicate concurrent authentication token refreshes`**. 클라이언트·회귀 테스트·이 문서 3개 파일을 포함한다. 기존 `.claude/`, `nul`은 제외하며 원격 푸시는 하지 않았다.
- 현재 상태: 수정·검증·문서화·컨펌·로컬 커밋 완료. 검증 이후 실행 코드 변경이 없어 커밋 시 테스트·빌드는 반복하지 않고 변경 범위와 `git diff --check`를 확인했다.

## 항목 11-2 수정 기록 — 테스트 DB 안전장치

- 구현 승인: 2026년 10월 23일 “좋아 그럼 11-2 테스트 DB 안전장치부터 수정하고 테스트까지 진행해줘.”라는 사용자 요청. 재고 수량·이력·권한 테스트 보강은 아직 승인하지 않았다.
- 수정 전 문제: [공용 테스트 설정](../backend/tests/conftest.py)이 앱 DB 주소에서 `/recipick` 문자열을 치환하고 종료 시 `drop_all`로 테이블을 삭제했다. DB 이름이 예상과 다르면 앱 DB에 그대로 접근할 가능성이 있었다. 사용량 통합 테스트는 별도 무작위 스키마를 사용했지만 앱 개발 DB에 연결하는 다른 설정 경로였다.
- 명시적 설정: 모든 PostgreSQL 테스트는 `RECIPICK_RUN_POSTGRES_TESTS=1`과 셸 환경변수 `TEST_DATABASE_URL`을 요구한다. 실행 허용이 없으면 DB 테스트만 건너뛰며, 허용했는데 URL이 없거나 위험하면 연결 전에 실패한다. 테스트 URL은 앱 주소에서 자동 생성하지 않고 `.env`에서도 자동으로 읽지 않는다. 단위 테스트에는 DB 설정이 필요 없다.
- 접속 전 검사: [안전장치](../backend/tests/database.py)는 개발 환경·`postgresql+asyncpg`·로컬 loopback 호스트·사용자명·유효 포트·소문자로 시작하는 63자 이하 `_test` DB 이름을 검사한다. 앱 DB와 이름이 같으면 호스트·포트·계정이 달라도 거부한다. 접속 대상을 우회할 수 있는 URL 쿼리 매개변수는 앱/테스트 URL 모두 거부한다. 파싱·검증 오류에는 URL·계정·비밀번호를 포함하지 않는다.
- 스키마 분리: 주소 검증 후에만 테스트 엔진을 만들고, 실제 `current_database()`도 확인한 뒤 UUID로 만든 스키마를 생성한다. 테스트용 연결의 `current_schema()`와 `search_path`가 해당 스키마 하나인지 확인하여 `public`으로 넘어가는 것을 막는다. 공용 모델·Enum 생성과 기존 사용량 마이그레이션 모두 그 안에서 실행한다. 종료 시 테스트 엔진을 정리하고 자신이 성공적으로 생성한 스키마만 삭제한다. 생성 실패 시 기존 스키마를 삭제하지 않으며, 일부 초기화·정리 실패에도 관리 연결을 해제한다. `drop_all` 경로와 import 시 전역 테스트 엔진 생성을 제거했다.
- 앱 DB 접근 차단: 자동 적용 픽스처가 앱의 기본 엔진 연결을 거부한다. `get_db`를 교체하지 않았거나 서비스가 앱 기본 세션 팩토리를 직접 사용해도 앱 DB로 넘어가지 않는다. API 테스트의 dependency override는 `finally`에서 이전 상태로 복구한다. 테스트 코드가 별도 엔진을 임의 생성하는 모든 경우를 격리하는 네트워크 샌드박스는 아니므로 후속 테스트도 공용 픽스처를 사용해야 한다.
- 회귀 테스트: [안전장치 단위 테스트](../backend/tests/unit/test_database_safety.py) **52개** 추가. 잘못된 주소·환경·이름·별칭·포트·쿼리·누락 설정에서 테스트 엔진 생성이 0회인지, 오류의 비밀정보 제외, 스키마 생성/본문/정리 실패, 실제 DB/검색 경로 불일치, 실행 opt-in, 앱 기본 세션 차단을 검증한다. [DB 격리 통합 테스트](../backend/tests/integration/test_database_isolation.py) **3개**를 추가하여 성공·예외 종료 후 다른 스키마의 행 보존, 생성한 스키마 제거, 공용 모델·Enum·사용자 커밋이 테스트 스키마에만 존재하는지 확인한다.
- 최종 검증: 단위 **275개**와 실제 PostgreSQL 통합 **16개**, 합계 **291개 통과**. 기존 사용량 통합 12개와 헬스체크 1개도 새 공용 엔진으로 통과했다. 별도 기본 실행에서 DB 테스트 16개가 skip되는 것을 확인했다. 기존 `datetime.utcnow()` 경고는 단위 70건·새 통합 경로 1건, 총 71건이며 시간 처리 변경은 이번 범위가 아니다. 일부 기존 테스트의 임시 폴더 접근이 샌드박스에서 차단되어 동일한 검증을 권한 확장으로 실행했다.
- 실제 DB 확인: 기존 로컬 `recipick_test` DB를 명시적으로 선택하고 현재 로컬 접속 자격을 일회성 QA 프로세스에서만 재사용했다. DB·계정·권한을 새로 만들거나 `.env`를 편집하지 않았다. 실행 전후 스키마와 테이블 식별자 목록이 동일하고 임시 스키마가 모두 정리됐음을 확인했다. 저장소 밖 `C:/Users/Public/Documents/ESTsoft/CreatorTemp/recipick-test-db-qa.py`에서 임시 JWT 키를 설정한 뒤 전체 테스트를 실행했으며 접속 자격은 출력하지 않았다.
- 실행 안내: [README](../README.md#postgresql-통합-테스트-안전-설정)에 새 환경변수·허용 조건·실행 명령·정리 범위를 기록했다. 참고한 API 의미는 [SQLAlchemy URL 구성](https://docs.sqlalchemy.org/en/20/core/engines.html)과 [PostgreSQL 스키마·검색 경로](https://www.postgresql.org/docs/current/ddl-schemas.html) 문서를 기준으로 확인했다.
- 한계: 현재 정책은 로컬 개발 PostgreSQL 전용이며 원격 CI DB는 허용하지 않는다. DB 연결 단절·프로세스 강제 종료에서는 임시 스키마가 남을 수 있으므로 확인 후 해당 스키마만 정리해야 한다. 앱 기능·프런트·운영 DB·키·의존성은 변경하지 않았고 프런트 검증은 반복하지 않았다. 수량·소비 이력·권한의 신규 기능 테스트는 다음 항목이다.
- 사용자 컨펌: 2026년 10월 23일 “좋아 11-2 커밋하고, 다음 항목에서 뭘 수정할 건지 짧게 브리핑해줘.”로 결과와 커밋 승인. 이어 원래 계획의 완료 여부와 불필요한 범위 확대 여부를 확인했다.
- 커밋 기록: **`8907f59` — `test: isolate PostgreSQL tests and guard database access`**. README·이 문서·공용 설정·DB 안전장치·단위/격리/사용량 테스트 총 7개 파일을 포함한다. 원격 푸시는 하지 않았다.
- 현재 상태: **수정·검증·문서화·컨펌·로컬 커밋 완료**. 검증 이후 실행 코드 변경이 없어 커밋 시 테스트를 반복하지 않고 변경 범위와 `git diff --check`를 확인했다. 기존 `.claude/`, `nul`은 제외했다.

## 항목 11-3 검증 기록 — 소비·폐기 핵심 DB 검증

- 구현·종료 승인: 2026년 10월 23일 “좋아 그럼 11-3 소비·폐기 핵심 DB 검증까지 진행해줘. 테스트가 통과하면 이번 점검은 여기서 마무리하자.”라는 사용자 요청. 마지막 항목으로 세 범위만 검증하고, 재현된 기능 오류만 수정하기로 했다.
- 변경: [test_consume_dispose.py](../backend/tests/integration/test_consume_dispose.py)에 실제 PostgreSQL 테스트 **24개**를 추가했다. 11-2의 명시적 테스트 DB·무작위 스키마·앱 기본 DB 연결 차단을 그대로 사용한다. 기존 공용 API 클라이언트는 `get_db`를 단순 세션 공급으로 대체하므로, 이번 파일은 앱의 실제 `get_db`를 유지하고 세션 팩토리만 격리된 테스트 DB로 연결했다. 실제 인증·회원 권한·라우트·서비스·커밋·롤백을 실행하며 각 요청 전후 별도 세션에서 DB 행을 읽는다.
- 정상 처리 **10개**: 소비·폐기 각각 OWNER/GUEST의 일부 처리, 본문 생략·현재 수량과 동일·현재 수량 초과 요청의 전량 처리를 확인했다. 일부 요청은 200과 남은 수량, 전량 요청은 본문 없는 204와 재료 삭제를 검증한다. 새 이력이 정확히 한 건 추가되고 처리 사용자·냉장고·재료·수량·단위·유통기한·메모가 맞는지, 기존 이력과 다른 냉장고 재료가 유지되는지 확인했다. 요청 수량이 재고 이상이면 실제 재고량만 이력에 남기는 기존 정책을 변경하지 않았다.
- 실패 원자성 **8개**: 소비·폐기 각각 일부·전량에 대해 (1) 실제 서비스가 재고 변경과 이력 INSERT를 flush한 뒤 예외를 발생시키고, 오류 직전 두 SQL 결과를 확인한 다음 요청 종료 후 둘 다 원복됐는지 검증했다. (2) 해당 임시 스키마에만 이력 저장을 거절하는 CHECK 제약을 추가하여 실제 DB `IntegrityError`를 발생시켰다. 모두 일반화된 HTTP 500 응답과 재고·기존 이력 보존, 새 이력 부재를 확인했다.
- 권한 차단 **6개**: 소비·폐기 각각 잘못된 토큰(401), 대상 냉장고 비회원(403), 자신의 보관함 경로에 다른 냉장고의 재료 ID를 넣는 요청(404)을 검증했다. 모든 경우 전체 테스트 재고·이력이 요청 전과 동일했다.
- 결과: 신규 **24개** 통과 후 전체 회귀 검증 **315개(단위 275개 + 실제 PostgreSQL 통합 40개)** 통과. 재현된 기능 오류가 없어 앱 실행 코드와 동작 정책은 변경하지 않았다. 기존 `datetime.utcnow()` 경고 71건에 새 경로의 동일 경고 18건이 더해져 총 89건이며, 시간 처리 변경은 추가하지 않았다.
- 실행 과정: 전체 검증의 최초 샌드박스 실행은 312개 통과·기존 설정 테스트 3개가 임시 폴더 접근 `PermissionError`로 실행되지 않았다. 동일 명령을 권한 확장으로 다시 실행하여 315개 전체 통과를 확인했다. 저장소 밖 `C:/Users/Public/Documents/ESTsoft/CreatorTemp/recipick-consume-dispose-qa.py`(신규 테스트)와 기존 `recipick-test-db-qa.py`(전체 테스트)를 사용했다. 자격 정보는 프로세스 안에서만 재사용하고 출력하지 않았다.
- DB 보존: 기존 로컬 `recipick_test`에서만 실행했다. 실행 전후 기존 스키마·테이블의 식별자 목록이 동일하고 각 테스트의 임시 스키마가 모두 정리됐음을 확인했다. 실제 앱 데이터·`.env`·키·운영 설정은 변경하지 않았다. 프런트·의존성·외부 OAuth/Gemini·배포 검증은 이번 범위가 아니므로 반복하지 않았다.
- 사용자 컨펌: 2026년 10월 23일 “좋아 그럼 11-3도 커밋하고 이번 점검은 여기서 마무리하자.”로 결과 컨펌·커밋·점검 종료를 승인했다.
- 커밋 기록: `test: verify consume and dispose database transactions` — 신규 테스트와 이 문서 두 파일을 포함한다. 해시는 `git log -1 --oneline -- backend/tests/integration/test_consume_dispose.py`로 확인한다. 기존 `.claude/`, `nul`은 제외하며 원격 푸시는 하지 않는다.
- 현재 상태: **검증·문서화·컨펌 완료, 이번 로컬 커밋에 포함**. 통과한 검증 이후 테스트·앱 코드 변경이 없어 테스트를 반복하지 않고 변경 범위와 `git diff --check`를 확인했다. 사용자의 지시에 따라 이번 점검을 마무리했다.

## 이번 점검의 확정 범위와 종료 결과

- 최초 계획 확인: 최초 기록 커밋 `1d955ce`의 항목 11에도 “권한·수량·이력·인증 갱신·실패 처리 중심으로 보강”이 있었다. 01~10은 사용자와 합의한 범위로 완료했다. 항목 10의 Tailwind 잔여 취약점은 승인된 보류 사항이며, 이번 작업에서 전부 제거됐다는 의미는 아니다.
- 11-1에서 실제 발견한 인증 갱신 문제를 수정·검증했고, 11-2에서 실제 DB 검증의 데이터 삭제 위험을 줄였다. 마지막 11-3에서 수량·소비/폐기 이력·권한·실패 원자성을 실제 DB에서 검증했다.
- 확정한 **11-3**의 범위는 세 가지이다: (1) 일부·전량 소비/폐기의 재고와 이력 결과, (2) 처리 실패 시 재고 변경과 이력 저장의 동시 롤백, (3) 권한 없는 요청에서 재고·이력 보존. 11-2의 격리된 테스트 DB로 모두 통과했다.
- 종료 기준과 결과: 사용자가 11-3 구현과 **테스트 통과 시 종료**를 사전 승인했다. 해당 검증과 기존 백엔드 회귀 검증 총 315개가 통과했으므로 **이번 코드 점검·보완 작업을 마무리했다**. 모든 기능의 테스트를 망라하거나 운영 배포 준비가 끝났다는 의미는 아니다.
- 추가 후보 취급: Tailwind 전환, 다중 탭 인증 조정, OAuth 추가 보강, CI, 운영 배포 준비 등은 별도 목록으로 유지한다. 새 발견은 근거와 영향을 기록하되 사용자 승인 없이 이번 작업의 필수 단계로 늘리지 않는다.
- 상태: **합의한 점검 종료. 추가 항목 없음.** 11-3 테스트·문서까지 이번 로컬 커밋에 기록하며 별도 요청 전까지 새 작업을 시작하지 않는다.

## 배포 전 운영용 JWT 키 준비 알림

배포를 진행하는 세션은 사용자에게 **운영용 JWT 키를 별도로 준비해야 한다**고 다시 안내하고 준비 여부를 확인한다. 이 안내는 [AGENTS.md](../AGENTS.md)에도 기록되어 있다.

1. 로컬 개발 키와 다른 운영 전용 난수 키를 생성한다.
2. 운영 환경의 `JWT_SECRET_KEY`에 설정한다. 키 자체를 채팅으로 요청하거나 Git에 커밋하지 않는다.
3. 같은 배포의 모든 백엔드 프로세스에 동일한 운영 키를 적용하고, 재시작 시 유지되도록 보관한다.
4. 기존 운영 키를 교체하는 경우에는 기존 로그인과 진행 중인 OAuth 인증이 무효화되는 영향을 안내하고 재시작을 조율한다.

현재 상태: **운영 키 준비 여부는 미확인**. 로컬 키 교체 완료가 운영 키 준비 완료를 의미하지 않는다.
