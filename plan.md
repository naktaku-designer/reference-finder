# 기획서 레퍼런스 파인더 — 작업 플랜

> 마지막 업데이트: 2026-03-20

---

## 프로젝트 개요

기획서 PDF를 업로드하면 화면을 자동 분석하고, Dribbble · Behance · Pinterest에서
화면별 디자인 레퍼런스 링크를 찾아주는 웹앱.

- **작업 디렉토리**: `/Users/kimtaekyun/Downloads/claude folder/level_B`
- **서버 주소**: `http://localhost:8080`
- **실행 방법**: Claude Preview → `level_B (python)` 서버 시작

---

## 작업 단계

### Step 1. 초기 앱 구축 ✅
- Node.js + Express 백엔드 (`server.mjs`) 제작
- SPA 프론트엔드 (`index.html`) 제작
- PDF 파싱: `pdf-parse@1` (v2는 API 호환성 문제로 v1 고정)
- 프로젝트 결과 JSON 저장 (`data/` 디렉토리)
- `.claude/launch.json`으로 개발 서버 관리

### Step 2. 분석 엔진 구축 ✅
- **Claude API 분석** 우선 시도 (claude-haiku 모델, 2-step 프롬프트)
  - Step 1: 기획서에서 시각 스타일 · 색감 · 인터랙션 · 고유 UI 요소 추출
  - Step 2: 추출된 특성으로 화면별 구체적 검색어 생성
- **규칙 기반 분석 엔진 v2** (API 실패 시 자동 폴백)
  - 텍스트에서 고유 특성 직접 추출 (색감·인터랙션·그리드·고유명사)
  - 기획서별로 다른 검색어 생성

### Step 3. 파일 업로드 방식 개선 ✅
- 브라우저 파일 선택 다이얼로그: `<label>` + `<input type="file">` 방식
- **로컬 파일 경로 직접 입력** 추가 (`/analyze-path` 엔드포인트)
  - Claude Preview 샌드박스 환경에서 파일 선택 불가 문제 해결
  - 텍스트 필드에 전체 경로 입력 → 서버가 직접 파일 읽기

### Step 4. 분석 품질 개선 ✅
- **dotenv 로드 버그 수정**: dotenv v17이 기존 환경변수를 덮어쓰지 않는 문제
  → `dotenvConfig({ override: true })` 적용
- **테마 감지 고도화**: 첫 매칭 → 점수 기반으로 변경 (가장 많이 매칭된 테마 선택)
- **게임 장르 세분화 감지** 추가:
  - 그림 찾기 / 슬라이딩 퍼즐 / 매치3 / 러너 / 전략 / 경로 완성 / 카드게임
- **화면 이름 영어 변환 개선**: 알 수 없는 화면명도 한글 단어 단위 번역 후 조합
- **고유 명사 추출 개선**: 테마 키워드 · 노이즈 단어 제거 후 진짜 고유 단어 추출
- 결과에 `analyzed_by: "claude" | "rule"` 필드 포함

---

## 현재 상태

| 항목 | 상태 |
|------|------|
| Claude API | 크레딧 부족으로 비활성 (규칙 기반으로 자동 폴백) |
| 규칙 기반 엔진 | v2 동작 중 — 기획서별 고유 키워드 생성 |
| 파일 업로드 | 클릭/드래그 + 경로 입력 두 가지 방식 |
| 분석된 기획서 | GridLock, 다른 그림 찾기, 경로 완성하기 |

---

## 알려진 한계 및 개선 방향

- Claude API 크레딧 충전 시 정확도 대폭 향상 가능 (console.anthropic.com)
- 규칙 기반은 PDF 텍스트 추출 품질에 의존 (스캔본 PDF는 텍스트 추출 불가)
- 테마 감지 정확도: 기획서에 테마 관련 단어가 적으면 `미니멀 · 모던` 폴백

---

## 파일 목록

| 파일 | 설명 |
|------|------|
| `index.html` | SPA 프론트엔드 |
| `server.mjs` | Node.js/Express 백엔드 |
| `package.json` | 의존성 (express, multer, pdf-parse@1, @anthropic-ai/sdk, dotenv) |
| `.env` | API 키 (ANTHROPIC_API_KEY) |
| `.env.example` | API 키 템플릿 |
| `data/` | 분석 결과 JSON 저장소 |
| `plan.md` | 이 파일 |
| `CLAUDE.md` | Claude 작업 지침 |
| `.claude/launch.json` | 개발 서버 설정 |
| `신규_탈출하기 (GridLock).pdf` | 분석 테스트용 기획서 1 |
| `[SPEC OUT] 신규_다른 그림 찾기.pdf` | 분석 테스트용 기획서 2 |
| `신규_경로 완성하기 (TrackPath).pdf` | 분석 테스트용 기획서 3 |
