# 기획서 레퍼런스 파인더

기획서 PDF를 업로드하면 화면을 자동 분석하고, **Dribbble · Behance · Pinterest**에서 화면별 디자인 레퍼런스 링크를 찾아주는 웹앱.

---

## 바로 배포하기

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template/deploy?source=https://github.com/naktaku-designer/reference-finder)

> 버튼 클릭 → Railway 로그인 → `ANTHROPIC_API_KEY` 입력 → 배포 완료

---

## 주요 기능

- 📄 PDF 기획서 업로드 (드래그&드롭 또는 파일 경로 직접 입력)
- 🔍 화면 자동 추출 — 게임 장르(슬라이딩 퍼즐, 그림 찾기 등) 세분화 감지
- 🎨 기획서별 고유 검색어 생성 — 테마·색감·인터랙션 패턴 반영
- 🔗 Dribbble / Behance / Pinterest 레퍼런스 링크 자동 생성
- 💾 분석 결과 저장 및 목록 관리

---

## 로컬 실행

```bash
# 1. 의존성 설치
npm install

# 2. 환경변수 설정
cp .env.example .env
# .env 파일에 ANTHROPIC_API_KEY 입력

# 3. 서버 시작
npm start
# → http://localhost:8080
```

> API 키 없이도 규칙 기반 분석으로 동작합니다.
> Claude API 키가 있으면 더 정확한 분석이 가능합니다 → [Anthropic Console](https://console.anthropic.com)

---

## 기술 스택

| 항목 | 내용 |
|------|------|
| 백엔드 | Node.js + Express |
| PDF 파싱 | pdf-parse@1 |
| AI 분석 | Claude API (claude-haiku) + 규칙 기반 폴백 |
| 프론트엔드 | Vanilla JS SPA |
