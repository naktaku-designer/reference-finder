# Claude Instructions — 기획서 레퍼런스 파인더

## 프로젝트 개요

기획서 PDF를 분석해서 Dribbble · Behance · Pinterest 디자인 레퍼런스를 자동으로 찾아주는 웹앱.

- **작업 디렉토리**: `/Users/kimtaekyun/Downloads/claude folder/level_B`
- **서버**: `node server.mjs` (포트 8080)
- **실행**: Claude Preview → `level_B (python)` 서버 시작

## Language
- 항상 한국어로 대답한다.

---

## 파일 구조

```
level_B/
├── index.html                          # SPA 프론트엔드
├── server.mjs                          # Node.js/Express 백엔드
├── package.json                        # 의존성
├── .env                                # ANTHROPIC_API_KEY
├── .env.example                        # API 키 템플릿
├── data/                               # 분석 결과 JSON 저장소
├── plan.md                             # 작업 플랜
├── CLAUDE.md                           # 이 파일
├── .claude/launch.json                 # 개발 서버 설정
├── 신규_탈출하기 (GridLock).pdf
├── [SPEC OUT] 신규_다른 그림 찾기.pdf
└── 신규_경로 완성하기 (TrackPath).pdf
```

---

## 백엔드 구조 (`server.mjs`)

### API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/` | index.html 서빙 |
| GET | `/projects` | 저장된 프로젝트 목록 |
| GET | `/projects/:id` | 특정 프로젝트 상세 |
| DELETE | `/projects/:id` | 프로젝트 삭제 |
| POST | `/analyze` | PDF 파일 업로드 → 분석 → 저장 |
| POST | `/analyze-path` | 로컬 파일 경로 `{ filepath }` → 분석 → 저장 |

### 분석 흐름 (`analyzeAndSave`)

```
PDF 텍스트 추출 (pdf-parse)
    ↓
ANTHROPIC_API_KEY 있음?
    ├─ Yes → claudeAnalyze() [2-step 프롬프트, claude-haiku]
    │         실패 시 → ruleBasedAnalyze() 폴백
    └─ No  → ruleBasedAnalyze()
    ↓
결과 JSON 저장 (data/{id}.json)
    ↓
응답 반환
```

### 규칙 기반 엔진 v2 — 주요 함수

| 함수 | 역할 |
|------|------|
| `detectProjectType(text)` | 게임 장르 세분화 포함 유형 감지 (그림 찾기 / 슬라이딩 퍼즐 / 매치3 / 러너 / 경로 완성 등) |
| `detectTheme(text)` | **점수 기반** 테마 감지 — 가장 많이 매칭된 테마 선택 |
| `extractUniqueProfile(text)` | 색감·인터랙션·그리드 크기·고유명사 추출 |
| `extractScreens(text, typeKey)` | 화면 목록 추출 (텍스트 패턴 + 키워드 매칭 + 기본값 보충) |
| `buildLinks(...)` | 화면별 Dribbble/Behance/Pinterest 링크 생성 |

#### `extractUniqueProfile` 추출 항목
- **colorMood**: 어두운/밝은/파스텔/네온 등 색감 방향 → 영어 태그
- **interaction**: 드래그/탭/스와이프 등 핵심 인터랙션 → 영어 태그
- **gridTag**: NxN 패턴 감지 (예: `6x6 grid`)
- **uniqueTermsKo**: 노이즈·테마 단어 제외 후 고빈도 고유 명사 top 10

#### `buildLinks` 키워드 조합 방식
```
Dribbble: [colorMood] [themeEn] [screenEn]
          [gridTag|uniqueTerm] [typeEn] [screenEn] design
          [interaction] [uniqueTerm|themeEn] [screenEn] ui

Behance:  [colorMood] [t1] [t2] [screenEn] ui
          [themeEn] [typeEn] [screenEn] ux design
          [gridTag|interaction] [screenEn] mobile interface

Pinterest: [colorMood] [themeEn] [screenEn] mobile ui
           [uniqueTerm|interaction] [typeEn] [screenEn]
```

### 환경변수

```bash
ANTHROPIC_API_KEY=sk-ant-...   # .env 파일에 저장
```

**주의**: dotenv v17은 기존 환경변수를 덮어쓰지 않으므로 반드시 `override: true` 사용:
```javascript
dotenvConfig({ path: path.join(__dirname, '.env'), override: true });
```

현재 상태: API 크레딧 부족 → 규칙 기반으로 자동 폴백 중
크레딧 충전: https://console.anthropic.com → Plans & Billing

### 의존성

```
express           — HTTP 서버
multer            — multipart/form-data 파일 업로드
pdf-parse@1       — PDF 텍스트 추출 (v2는 함수 export 방식 달라 v1 고정)
@anthropic-ai/sdk — Claude API 클라이언트
dotenv            — .env 환경변수 로드
```

---

## 프론트엔드 구조 (`index.html`)

### 뷰 구성
- **홈 뷰** (`#home-view`): 업로드 영역 + 경로 입력 + 프로젝트 카드 목록
- **디테일 뷰** (`#detail-view`): 화면별 레퍼런스 카드 (Dribbble/Behance/Pinterest)

### 파일 업로드 두 가지 방식
1. **클릭/드래그 업로드**: `<label>` + `<input type="file">` → `POST /analyze`
2. **경로 직접 입력**: 텍스트 필드 + 분석 버튼 → `POST /analyze-path`
   - Claude Preview 샌드박스에서 파일 선택 다이얼로그 미지원 문제 우회용
   - Finder에서 파일 우클릭 → "경로 이름 복사" (Option+우클릭)

### 결과 JSON 구조

```json
{
  "id": "abc1234",
  "project_name": "프로젝트명",
  "project_type": "그림 찾기 게임",
  "theme": "우주 · SF 테마",
  "visual_style": "dark / tap select",
  "analyzed_by": "claude | rule",
  "filename": "기획서.pdf",
  "created_at": "2026. 03. 20. 오후 03:53",
  "screens": [
    {
      "name": "화면 이름",
      "description": "화면 설명",
      "color": "#e53e3e",
      "links": [
        { "src": "Dribbble", "title": "검색어", "url": "https://...", "note": "화면 설명" }
      ]
    }
  ]
}
```

---

## 개발 서버 관리

```json
// .claude/launch.json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "level_B (python)",
      "runtimeExecutable": "node",
      "runtimeArgs": ["/Users/kimtaekyun/Downloads/claude folder/level_B/server.mjs"],
      "port": 8080
    }
  ]
}
```

서버 수정 후 반드시 **재시작** 필요 (preview_stop → preview_start).
프론트엔드 수정은 브라우저 새로고침으로 반영.

---

## Notes for Claude

- `server.mjs` 수정 후 서버 재시작 필수
- `index.html` 수정은 새로고침으로 반영
- 분석 결과는 `data/*.json`에 저장됨
- 작업 진행 상황은 `plan.md`에 반영
- PDF 경로에 한글/공백 포함 가능 — Node.js는 정상 처리함
- 한글 파일명 인코딩: `Buffer.from(originalname, 'latin1').toString('utf8')`

Last updated: 2026-03-20
