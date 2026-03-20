import express from 'express';
import multer from 'multer';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { config as dotenvConfig } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: path.join(__dirname, '.env'), override: true });
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const COLORS = ['#e53e3e','#dd6b20','#38a169','#3182ce','#805ad5','#d69e2e','#319795','#e91e8c'];

// ── 규칙 기반 분석 엔진 v2 ──────────────────────────────────────

// 1. 프로젝트 유형 감지 (게임 장르 세분화 포함)
function detectProjectType(text) {
  // 게임 장르 먼저 세분화 감지
  const gameGenres = [
    { key:'spot_diff',   keywords:['다른 그림','그림 찾기','틀린 그림','차이 찾기','숨은 그림','오답','발견'],     ko:'그림 찾기 게임', en:'spot the difference game' },
    { key:'sliding',     keywords:['슬라이딩','밀기','이동 경로','탈출하기','출구','슬라이드 퍼즐'],               ko:'슬라이딩 퍼즐 게임', en:'sliding puzzle game' },
    { key:'match3',      keywords:['3매치','매칭','같은 색','블록 매칭','젤리','캔디'],                           ko:'매치3 퍼즐 게임', en:'match-3 puzzle game' },
    { key:'runner',      keywords:['엔드리스','달리기','장애물 피하기','러너','점프'],                            ko:'러너 게임', en:'endless runner game' },
    { key:'strategy',    keywords:['전략','타워','디펜스','배치','유닛','병력'],                                  ko:'전략 게임', en:'strategy tower defense game' },
    { key:'path',        keywords:['경로 완성','파이프','연결하기','선 잇기','경로 찾기','TrackPath'],            ko:'경로 완성 게임', en:'path connect puzzle game' },
    { key:'card_game',   keywords:['카드 뒤집기','짝 맞추기','플래시카드','메모리 게임'],                         ko:'카드 게임', en:'card matching game' },
  ];
  for (const g of gameGenres) {
    const score = g.keywords.filter(k => text.includes(k)).length;
    if (score >= 1) return { ko: g.ko, en: g.en, key: g.key };
  }

  const scores = {
    game:     ['스테이지', '레벨', '클리어', '게임', '그리드', '퍼즐', '점수', '힌트', '플레이어', '아이템', '캐릭터', '보스', 'HP', '인게임'],
    shopping: ['상품', '장바구니', '결제', '주문', '배송', '리뷰', '할인', '쿠폰', '위시리스트'],
    social:   ['피드', '팔로우', '댓글', '좋아요', '게시물', '스토리', '채팅', '메시지', '알림'],
    utility:  ['메모', '일정', '캘린더', '할일', '노트', '파일', '문서', '대시보드', '통계'],
    finance:  ['잔액', '송금', '계좌', '거래', '투자', '포트폴리오', '환율'],
    health:   ['운동', '칼로리', '식단', '수면', '걸음', '건강', '루틴'],
  };
  let best = 'app', bestScore = 1;
  for (const [type, keywords] of Object.entries(scores)) {
    const score = keywords.filter(k => text.includes(k)).length;
    if (score > bestScore) { best = type; bestScore = score; }
  }
  const typeMap = { game:'모바일 게임', shopping:'쇼핑 앱', social:'SNS 앱', utility:'유틸리티 앱', finance:'금융 앱', health:'헬스 앱', app:'모바일 앱' };
  const typeEnMap = { game:'mobile game', shopping:'shopping app', social:'social app', utility:'utility app', finance:'finance app', health:'health app', app:'mobile app' };
  return { ko: typeMap[best], en: typeEnMap[best], key: best };
}

// 2. 테마 감지 (점수 기반 — 가장 많이 매칭된 테마 선택)
function detectTheme(text) {
  const themes = [
    { keywords: ['주차', '자동차', '차량', '도로', '주차장'],                    ko: '주차장 · 자동차', en: 'parking car' },
    { keywords: ['요리', '음식', '레시피', '쿠킹', '셰프', '식재료', '조리'],    ko: '음식 · 요리',     en: 'food cooking' },
    { keywords: ['우주', '행성', '로켓', '별', 'SF', '외계'],                   ko: '우주 · SF',       en: 'space sci-fi' },
    { keywords: ['판타지', '마법', '던전', '드래곤', '퀘스트', '용사'],          ko: '판타지',          en: 'fantasy rpg' },
    { keywords: ['동물', '애완', '펫', '강아지', '고양이', '귀여운 동물'],       ko: '캐릭터 · 동물',   en: 'cute animal character' },
    { keywords: ['퍼즐', '블록', '도형', '논리', '추리', '맞추기'],              ko: '퍼즐 · 논리',     en: 'puzzle logic' },
    { keywords: ['스포츠', '축구', '농구', '러닝', '피트니스', '운동 경기'],     ko: '스포츠',          en: 'sports fitness' },
    { keywords: ['패션', '옷', '스타일', '의류', '코디'],                        ko: '패션 · 쇼핑',     en: 'fashion shopping' },
    { keywords: ['음악', '악기', '노래', '플레이리스트', '멜로디'],              ko: '음악',            en: 'music audio' },
    { keywords: ['여행', '관광', '호텔', '항공', '숙소'],                        ko: '여행',            en: 'travel map' },
    { keywords: ['교육', '학습', '강의', '퀴즈', '공부', '문제 풀기'],           ko: '교육 · 학습',     en: 'education learning' },
    { keywords: ['의료', '병원', '진료', '약', '건강 관리'],                     ko: '의료 · 헬스케어', en: 'medical healthcare' },
    { keywords: ['그림', '일러스트', '드로잉', '색칠', '스케치'],               ko: '아트 · 일러스트',  en: 'art illustration' },
    { keywords: ['틀린 그림', '그림 찾기', '숨은 그림', '차이 찾기', '관찰'],   ko: '그림 찾기',        en: 'spot the difference' },
    { keywords: ['카드', '보드', '주사위', '보드게임', '카드게임'],              ko: '보드 · 카드게임', en: 'board card game' },
    { keywords: ['달리기', '점프', '장애물 피하기', '러너', '엔드리스'],         ko: '러너 게임',        en: 'endless runner game' },
    { keywords: ['매칭', '3매치', '같은 그림', '색깔 맞추기', '조각 맞추기'],   ko: '매칭 · 3매치',    en: 'match-3 puzzle' },
  ];
  let best = null, bestScore = 0;
  for (const t of themes) {
    const score = t.keywords.filter(k => text.includes(k)).length;
    if (score > bestScore) { best = t; bestScore = score; }
  }
  // 최소 1개 이상 매칭된 경우에만 해당 테마 사용
  return bestScore >= 1 ? best : { ko: '미니멀 · 모던', en: 'minimal modern' };
}

// 3. 텍스트에서 고유 특성 추출 (핵심 개선)
function extractUniqueProfile(text) {
  // 3-1. 시각/색감 단서
  const colorMoodMap = [
    { keywords: ['어두운', '다크', '블랙', '검정', '야간', '어둡'],       en: 'dark' },
    { keywords: ['밝은', '화이트', '흰색', '라이트', '밝고'],             en: 'light' },
    { keywords: ['파스텔', '귀여운', '부드러운', '연한'],                 en: 'pastel soft' },
    { keywords: ['네온', '형광', '사이버', '글로우'],                     en: 'neon glow' },
    { keywords: ['자연', '그린', '초록', '에코', '친환경'],               en: 'nature green' },
    { keywords: ['따뜻한', '오렌지', '붉은', '레드', '핫'],               en: 'warm vibrant' },
    { keywords: ['차가운', '블루', '파란', '쿨'],                         en: 'cool blue' },
    { keywords: ['미니멀', '심플', '깔끔', '단순'],                       en: 'minimal clean' },
    { keywords: ['화려한', '컬러풀', '다채로운'],                         en: 'colorful vibrant' },
  ];
  let colorMood = 'clean modern';
  for (const { keywords, en } of colorMoodMap) {
    if (keywords.some(k => text.includes(k))) { colorMood = en; break; }
  }

  // 3-2. 핵심 인터랙션 단서
  const interactionMap = [
    { keywords: ['드래그', '슬라이딩', '밀기', '이동'],  en: 'drag slide' },
    { keywords: ['탭', '터치', '클릭', '선택'],          en: 'tap select' },
    { keywords: ['스와이프', '스크롤', '넘기기'],         en: 'swipe scroll' },
    { keywords: ['핀치', '줌', '확대'],                   en: 'pinch zoom' },
    { keywords: ['그리기', '드로잉', '스케치'],           en: 'drawing sketch' },
    { keywords: ['음성', '말하기', '녹음'],               en: 'voice input' },
    { keywords: ['카메라', '사진', '촬영', 'AR'],         en: 'camera ar' },
  ];
  let interaction = 'tap navigation';
  for (const { keywords, en } of interactionMap) {
    if (keywords.some(k => text.includes(k))) { interaction = en; break; }
  }

  // 3-3. 그리드/레이아웃 단서
  const gridMatch = text.match(/(\d+)[×x\*](\d+)/);
  const gridTag = gridMatch ? `${gridMatch[1]}x${gridMatch[2]} grid` : '';

  // 3-4. 고유 명사/UI 요소 직접 추출
  // 일반 노이즈 + 모든 테마 키워드를 제외하고 진짜 고유 단어만 뽑기
  const allThemeKeywords = new Set([
    '주차','자동차','차량','도로','주차장','요리','음식','레시피','쿠킹','셰프','식재료',
    '우주','행성','로켓','별','외계','판타지','마법','던전','드래곤','퀘스트','용사',
    '동물','애완','펫','강아지','고양이','퍼즐','블록','도형','논리','추리',
    '스포츠','축구','농구','러닝','피트니스','패션','옷','스타일','의류','코디',
    '음악','악기','노래','플레이리스트','여행','관광','호텔','항공','숙소',
    '교육','학습','강의','퀴즈','공부','의료','병원','진료',
    '그림','일러스트','드로잉','색칠','스케치','카드','보드','주사위',
    '달리기','점프','장애물','러너','매칭','매치',
  ]);
  const noiseWords = new Set([
    '이동','경우','방향','경로','경계','사용','제공','기능','설명','버튼','화면',
    '디자인','클릭','이후','이때','해당','또는','그리고','하지만','하면','하여',
    '합니다','있습니다','됩니다','입니다','것이','수가','때는','위해','통해',
    '가능','경우에','으로는','에서는','에게는','관련','내용','방식','형태',
    '표시','출력','처리','저장','반환','호출','실행','시작','종료','완료',
  ]);
  const wordFreq = {};
  const koWords = text.match(/[가-힣]{2,6}/g) || [];
  for (const w of koWords) {
    if (!noiseWords.has(w) && !allThemeKeywords.has(w)) {
      wordFreq[w] = (wordFreq[w] || 0) + 1;
    }
  }
  const uniqueTermsKo = Object.entries(wordFreq)
    .filter(([, cnt]) => cnt >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([w]) => w);

  // 3-5. 영어/숫자 특수 요소 추출 (예: BFS, HP, UI 요소 이름)
  const enTerms = [...new Set((text.match(/[A-Z]{2,}/g) || []).filter(t => t.length <= 6))].slice(0, 4);

  return { colorMood, interaction, gridTag, uniqueTermsKo, enTerms };
}

// 4. 화면 추출
function extractScreens(text, projectTypeKey) {
  const found = new Map();

  // 패턴: "XX 화면", "XX UI", "XX 페이지"
  let m;
  const pat = /([가-힣a-zA-Z0-9\s]{2,12})\s*(화면|페이지|스크린|UI|뷰)/g;
  while ((m = pat.exec(text)) !== null) {
    const raw = m[1].trim();
    if (raw.length < 2 || raw.length > 15) continue;
    const name = raw + (m[2] === 'UI' ? ' UI' : ' 화면');
    if (!found.has(name)) found.set(name, `${name} 디자인`);
  }

  const keywordScreens = [
    { keywords: ['힌트'],                              name: '힌트 UI',           desc: '힌트 버튼 · 카운터 · 강조 표시' },
    { keywords: ['튜토리얼', '가이드', '안내'],         name: '튜토리얼/가이드',   desc: '첫 실행 안내 · 드래그 가이드 오버레이' },
    { keywords: ['클리어', '게임 종료', '클리어되'],    name: '클리어/승리 화면',  desc: '클리어 연출 · 결과 표시' },
    { keywords: ['초기화', '리셋', '되돌리기'],         name: '초기화/리셋 UI',    desc: '초기 상태 복원 버튼 · 확인 팝업' },
    { keywords: ['스테이지', '레벨 선택'],              name: '스테이지 선택 화면',desc: '스테이지 목록 · 난이도 표시 · 잠금 상태' },
    { keywords: ['로딩', '스플래시'],                  name: '로딩/스플래시 화면',desc: '앱 시작 로딩 화면' },
    { keywords: ['팝업', '모달', '다이얼로그'],         name: '팝업/모달',         desc: '알림 · 확인 · 결과 팝업' },
    { keywords: ['설정', '환경설정'],                  name: '설정 화면',         desc: '음악·효과음·언어 등 설정' },
    { keywords: ['로그인'],                            name: '로그인 화면',        desc: '사용자 인증 화면' },
    { keywords: ['회원가입'],                          name: '회원가입 화면',      desc: '신규 계정 생성' },
    { keywords: ['프로필', '마이페이지'],              name: '프로필/마이페이지', desc: '사용자 정보 · 설정' },
    { keywords: ['검색'],                              name: '검색 화면',          desc: '검색창 · 결과 목록' },
    { keywords: ['알림', '푸시'],                      name: '알림 화면',          desc: '알림 목록 · 읽음 처리' },
    { keywords: ['장바구니'],                          name: '장바구니 화면',      desc: '상품 목록 · 합계 · 결제' },
    { keywords: ['결제', '주문'],                      name: '결제/주문 화면',     desc: '결제 수단 · 주문 확인' },
    { keywords: ['홈', '메인'],                        name: '홈/메인 화면',       desc: '대시보드 · 주요 기능' },
  ];
  for (const { keywords, name, desc } of keywordScreens) {
    if (keywords.some(k => text.includes(k)) && !found.has(name)) found.set(name, desc);
  }

  if (projectTypeKey === 'game' && !found.has('게임 메인 화면')) {
    found.set('게임 메인 화면', '메인 플레이 그리드 · HUD');
  }

  const defaults = {
    game:     [['게임 메인 화면','메인 플레이 그리드 · HUD'], ['스테이지 선택 화면','스테이지 목록 · 난이도'], ['클리어/승리 화면','클리어 연출 · 결과'], ['힌트 UI','힌트 버튼 · 잔여 횟수'], ['튜토리얼/가이드','첫 실행 가이드'], ['초기화/리셋 UI','초기 상태 복원']],
    shopping: [['홈 화면','추천 상품 · 배너'], ['상품 목록 화면','필터 · 카드'], ['상품 상세 화면','이미지 · 구매 버튼'], ['장바구니 화면','수량 · 결제'], ['주문 완료 화면','주문 확인']],
    social:   [['피드 화면','게시물 목록 · 좋아요'], ['프로필 화면','사용자 정보'], ['게시물 작성 화면','이미지 업로드'], ['알림 화면','알림 목록'], ['DM/채팅 화면','메시지 버블']],
    app:      [['홈/메인 화면','대시보드 · 주요 기능'], ['목록 화면','아이템 리스트'], ['상세 화면','상세 정보 · 액션'], ['설정 화면','환경설정'], ['온보딩/튜토리얼','앱 소개']],
  };
  for (const [name, desc] of (defaults[projectTypeKey] || defaults.app)) {
    if (!found.has(name)) found.set(name, desc);
    if (found.size >= 8) break;
  }
  return Array.from(found.entries()).slice(0, 9).map(([name, description]) => ({ name, description }));
}

// 5. 화면별 고유 키워드 생성 (핵심 개선)
function buildLinks(screenName, screenDesc, pType, theme, profile) {
  const screenEnMap = {
    '게임 메인 화면': 'game play screen', '스테이지 선택 화면': 'level select', '클리어/승리 화면': 'victory win screen',
    '힌트 UI': 'hint overlay ui', '튜토리얼/가이드': 'tutorial guide overlay', '초기화/리셋 UI': 'reset button ui',
    '로딩/스플래시 화면': 'splash loading screen', '팝업/모달': 'popup modal dialog', '설정 화면': 'settings screen',
    '로그인 화면': 'login screen', '회원가입 화면': 'signup register screen', '홈/메인 화면': 'home dashboard',
    '홈 화면': 'home screen', '피드 화면': 'social feed', '프로필 화면': 'profile page',
    '프로필/마이페이지': 'profile mypage', '게시물 작성 화면': 'post creation', '알림 화면': 'notification screen',
    'DM/채팅 화면': 'chat messaging', '상품 목록 화면': 'product list', '상품 상세 화면': 'product detail',
    '장바구니 화면': 'shopping cart', '결제/주문 화면': 'checkout payment', '검색 화면': 'search screen',
    '온보딩/튜토리얼': 'onboarding tutorial',
  };
  // 알 수 없는 화면 이름은 한글 단어 단위로 번역 후 조합
  const koToEnWord = {
    '게임':'game','메인':'main','홈':'home','화면':'screen','선택':'select',
    '스테이지':'stage','레벨':'level','클리어':'clear','승리':'victory','패배':'defeat',
    '힌트':'hint','튜토리얼':'tutorial','가이드':'guide','오버레이':'overlay',
    '초기화':'reset','리셋':'reset','설정':'settings','로그인':'login',
    '회원가입':'signup','프로필':'profile','마이페이지':'mypage','알림':'notification',
    '검색':'search','장바구니':'cart','결제':'payment','주문':'order',
    '로딩':'loading','스플래시':'splash','팝업':'popup','모달':'modal',
    '공통':'common','가로':'landscape','세로':'portrait',
    '발견':'discover','찾기':'find','다른':'difference','틀린':'wrong',
    '경로':'path','완성':'complete','연결':'connect',
    '피드':'feed','채팅':'chat','상품':'product','상세':'detail',
  };
  let screenEn = screenEnMap[screenName];
  if (!screenEn) {
    const translated = (screenName.match(/[가-힣]+/g) || [])
      .map(w => koToEnWord[w] || null).filter(Boolean).join(' ');
    screenEn = translated || screenName.replace(/[가-힣]/g, '').trim() || 'screen';
  }

  const { colorMood, interaction, gridTag, uniqueTermsKo } = profile;

  // 고유 명사를 영어로 근사 변환 (한글 → 로마자 힌트)
  const topTermsEn = uniqueTermsKo.slice(0, 4).map(t => {
    const dict = {
      // 그림 찾기
      '틀린':'difference','차이':'difference','정답':'answer','관찰':'observation',
      '오브젝트':'object','장면':'scene','배경':'background','힌트':'hint',
      '타이머':'timer','시간':'time limit','스테이지':'stage','레벨':'level',
      // 게임 공통
      '그리드':'grid','출구':'exit','장애물':'obstacle','클리어':'clear',
      '자동차':'car','차량':'vehicle','주차장':'parking',
      '캐릭터':'character','아이템':'item','스킬':'skill','보스':'boss','전투':'battle',
      // 요리
      '레시피':'recipe','식재료':'ingredient','타이머':'timer','조리':'cooking step',
      // 커머스
      '상품':'product','장바구니':'cart','결제':'payment','배송':'delivery',
      // 소셜
      '피드':'feed','댓글':'comment','좋아요':'like','팔로우':'follow',
      // 유틸
      '일정':'schedule','메모':'memo','할일':'todo','루틴':'routine',
      // 지도/여행
      '지도':'map','경로':'route','위치':'location','예약':'reservation',
    };
    return dict[t] || null;
  }).filter(Boolean);

  // 조합 재료
  const style = colorMood;                           // e.g. "dark"
  const action = interaction;                        // e.g. "drag slide"
  const grid = gridTag;                              // e.g. "6x6 grid"
  const t1 = topTermsEn[0] || '';
  const t2 = topTermsEn[1] || '';
  const typeEn = pType.en;                           // e.g. "mobile game"
  const themeEn = theme.en;                          // e.g. "parking car"

  // 화면별 차별화 조합 생성
  const dribbble = [
    [style, themeEn, screenEn].filter(Boolean).join(' '),
    [grid || t1, typeEn, screenEn, 'design'].filter(Boolean).join(' '),
    [action, t1 || themeEn, screenEn, 'ui'].filter(Boolean).join(' '),
  ];
  const behance = [
    [style, t1, t2, screenEn, 'ui'].filter(Boolean).join(' '),
    [themeEn, typeEn, screenEn, 'ux design'].filter(Boolean).join(' '),
    [grid || action, screenEn, 'mobile interface'].filter(Boolean).join(' '),
  ];
  const pinterest = [
    [style, themeEn, screenEn, 'mobile ui'].filter(Boolean).join(' '),
    [t1 || action, typeEn, screenEn].filter(Boolean).join(' '),
  ];

  const links = [];
  for (const k of dribbble) links.push({ src:'Dribbble',  title:k, url:`https://dribbble.com/search/${k.replace(/ /g,'+')}`,                      note:screenDesc });
  for (const k of behance)  links.push({ src:'Behance',   title:k, url:`https://www.behance.net/search/projects/${k.replace(/ /g,'%20')}`,        note:screenDesc });
  for (const k of pinterest)links.push({ src:'Pinterest', title:k, url:`https://www.pinterest.com/search/pins/?q=${k.replace(/ /g,'+')}`,         note:screenDesc });
  return links;
}

// 6. 메인 분석 함수
function ruleBasedAnalyze(text, filename) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const projectName = lines.slice(0, 5).find(l => l.length > 1 && l.length < 30) || filename.replace('.pdf', '');
  const pType   = detectProjectType(text);
  const theme   = detectTheme(text);
  const profile = extractUniqueProfile(text);
  const screens = extractScreens(text, pType.key);

  return {
    project_name: projectName,
    project_type: pType.ko,
    theme: `${theme.ko} 테마`,
    visual_style: `${profile.colorMood} / ${profile.interaction}`,
    screens: screens.map((screen, i) => ({
      ...screen,
      color: COLORS[i % COLORS.length],
      links: buildLinks(screen.name, screen.description, pType, theme, profile),
    })),
  };
}

// ── Claude API 분석 ─────────────────────────────────────────────

async function claudeAnalyze(text, filename) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Step 1: 기획서 고유 특성 추출
  const step1 = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `다음 기획서를 읽고 이 프로젝트만의 시각적·UX 특성을 분석하세요.

기획서 파일명: ${filename}
기획서 내용:
${text.slice(0, 6000)}

JSON으로만 응답하세요:
{
  "project_name": "프로젝트 이름",
  "project_type": "유형 (한국어)",
  "theme": "테마 (한국어, 예: 주차장 · 자동차 테마)",
  "visual_style": "예상 시각 스타일 (예: dark minimal, bright cartoon, neon cyberpunk, warm cozy)",
  "color_mood": "색감 방향 (예: dark asphalt gray, pastel warm, vibrant neon)",
  "interaction_pattern": "핵심 인터랙션 (예: drag-to-slide grid, tap-to-match, swipe-scroll feed)",
  "target_audience": "타겟 유저 (예: casual puzzle gamers, young shoppers)",
  "unique_ui_elements": ["이 기획서에서만 나타나는 고유 UI 요소들 (예: 6x6 sliding grid, hint arrow overlay, exit arrow indicator)"],
  "screens": [
    { "name": "화면 이름", "description": "설명", "key_ui": "이 화면의 핵심 UI 특징" }
  ]
}`
    }],
  });

  const raw1 = step1.content[0].text.trim();
  const json1Match = raw1.match(/\{[\s\S]*\}/);
  if (!json1Match) throw new Error('Step1 JSON 파싱 실패');
  const profile = JSON.parse(json1Match[0]);

  // Step 2: 특성을 반영한 구체적 검색어 생성
  const screenList = (profile.screens || []).map(s =>
    `- ${s.name}: ${s.description} / 핵심UI: ${s.key_ui}`
  ).join('\n');

  const step2 = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `다음 프로젝트 특성을 바탕으로 Dribbble/Behance/Pinterest 검색어를 생성하세요.

프로젝트: ${profile.project_name}
유형: ${profile.project_type}
시각 스타일: ${profile.visual_style}
색감: ${profile.color_mood}
핵심 인터랙션: ${profile.interaction_pattern}
타겟: ${profile.target_audience}
고유 UI 요소: ${(profile.unique_ui_elements || []).join(', ')}

화면 목록:
${screenList}

규칙:
1. 검색어는 반드시 영어
2. 각 검색어는 [시각스타일/색감] + [화면유형] + [고유특징] 조합으로 만들 것
   예) "dark asphalt puzzle grid ui", "car sliding game hint overlay", "minimal 6x6 grid mobile game"
3. 같은 유형의 다른 앱과 구별되는 키워드 포함 (일반적인 "game ui", "mobile app" 금지)
4. 각 화면마다 Dribbble 3개, Behance 3개, Pinterest 2개

JSON으로만 응답:
{
  "screens": [
    {
      "name": "화면 이름",
      "search_keywords": {
        "dribbble": ["구체적 검색어1", "구체적 검색어2", "구체적 검색어3"],
        "behance": ["구체적 검색어1", "구체적 검색어2", "구체적 검색어3"],
        "pinterest": ["구체적 검색어1", "구체적 검색어2"]
      }
    }
  ]
}`
    }],
  });

  const raw2 = step2.content[0].text.trim();
  const json2Match = raw2.match(/\{[\s\S]*\}/);
  if (!json2Match) throw new Error('Step2 JSON 파싱 실패');
  const keywords = JSON.parse(json2Match[0]);

  // 두 결과 병합
  const screenMap = new Map((keywords.screens || []).map(s => [s.name, s.search_keywords]));

  const result = {
    project_name: profile.project_name,
    project_type: profile.project_type,
    theme: profile.theme,
    visual_style: profile.visual_style,
    screens: (profile.screens || []).map((screen, i) => {
      const kw = screenMap.get(screen.name) || { dribbble: [], behance: [], pinterest: [] };
      const links = [];
      for (const k of (kw.dribbble  || [])) links.push({ src: 'Dribbble',  title: k, url: `https://dribbble.com/search/${k.replace(/ /g, '+')}`, note: screen.key_ui || screen.description });
      for (const k of (kw.behance   || [])) links.push({ src: 'Behance',   title: k, url: `https://www.behance.net/search/projects/${k.replace(/ /g, '%20')}`, note: screen.key_ui || screen.description });
      for (const k of (kw.pinterest || [])) links.push({ src: 'Pinterest', title: k, url: `https://www.pinterest.com/search/pins/?q=${k.replace(/ /g, '+')}`, note: screen.key_ui || screen.description });
      return { name: screen.name, description: screen.description, color: COLORS[i % COLORS.length], links };
    }),
  };

  return result;
}

// ── Express 라우트 ──────────────────────────────────────────────

app.use(express.static(__dirname));

app.get('/projects', (req, res) => {
  const projects = [];
  for (const fname of fs.readdirSync(DATA_DIR).sort().reverse()) {
    if (!fname.endsWith('.json')) continue;
    try {
      const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, fname), 'utf-8'));
      projects.push({
        id: data.id, project_name: data.project_name,
        project_type: data.project_type || '', theme: data.theme || '',
        created_at: data.created_at || '', filename: data.filename || '',
        screen_count: (data.screens || []).length,
        link_count: (data.screens || []).reduce((a, s) => a + (s.links || []).length, 0),
      });
    } catch {}
  }
  res.json(projects);
});

app.get('/projects/:id', (req, res) => {
  const fpath = path.join(DATA_DIR, `${req.params.id}.json`);
  if (!fs.existsSync(fpath)) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });
  res.json(JSON.parse(fs.readFileSync(fpath, 'utf-8')));
});

app.delete('/projects/:id', (req, res) => {
  const fpath = path.join(DATA_DIR, `${req.params.id}.json`);
  if (!fs.existsSync(fpath)) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });
  fs.unlinkSync(fpath);
  res.json({ ok: true });
});

// ── 공통 분석 + 저장 헬퍼 ──────────────────────────────────────

async function analyzeAndSave(text, filename) {
  let result;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey && apiKey.startsWith('sk-ant-')) {
    try {
      result = await claudeAnalyze(text, filename);
      result.analyzed_by = 'claude';
    } catch (e) {
      console.warn('Claude API 실패, 규칙 기반으로 전환:', e.message);
    }
  }

  if (!result) {
    result = ruleBasedAnalyze(text, filename);
    result.analyzed_by = 'rule';
  }

  const id = randomBytes(4).toString('hex');
  result.id = id;
  result.filename = filename;
  result.created_at = new Date().toLocaleString('ko-KR', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
  fs.writeFileSync(path.join(DATA_DIR, `${id}.json`), JSON.stringify(result, null, 2), 'utf-8');
  return result;
}

app.post('/analyze', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' });
  if (!req.file.originalname.toLowerCase().endsWith('.pdf'))
    return res.status(400).json({ error: 'PDF 파일만 지원합니다.' });

  let text = '';
  try {
    const parsed = await pdfParse(req.file.buffer);
    text = parsed.text;
  } catch (e) {
    return res.status(400).json({ error: `PDF 파싱 오류: ${e.message}` });
  }
  if (!text.trim()) return res.status(400).json({ error: 'PDF에서 텍스트를 추출할 수 없습니다.' });

  const filename = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  try {
    const result = await analyzeAndSave(text, filename);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: `분석 오류: ${e.message}` });
  }
});

app.use(express.json());

app.post('/analyze-path', async (req, res) => {
  const { filepath } = req.body || {};
  if (!filepath) return res.status(400).json({ error: '파일 경로가 없습니다.' });
  if (!filepath.toLowerCase().endsWith('.pdf'))
    return res.status(400).json({ error: 'PDF 파일만 지원합니다.' });

  const absPath = filepath.startsWith('/') ? filepath : path.join(__dirname, filepath);
  if (!fs.existsSync(absPath)) return res.status(400).json({ error: `파일을 찾을 수 없습니다: ${absPath}` });

  let text = '';
  try {
    const buffer = fs.readFileSync(absPath);
    const parsed = await pdfParse(buffer);
    text = parsed.text;
  } catch (e) {
    return res.status(400).json({ error: `PDF 파싱 오류: ${e.message}` });
  }
  if (!text.trim()) return res.status(400).json({ error: 'PDF에서 텍스트를 추출할 수 없습니다.' });

  try {
    const result = await analyzeAndSave(text, path.basename(absPath));
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: `분석 오류: ${e.message}` });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
