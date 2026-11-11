'use strict';
/* 테라 헥사 — 게임 데이터 (지형, 자원, 유닛, 건물, 지구, 불가사의, 기술, 정책, 종교, 세력) */

const TERRAINS = {
  ocean:    { name: '대양',   f: 1, p: 0, g: 0, water: true, color: '#1d4468' },
  coast:    { name: '해안',   f: 1, p: 0, g: 1, water: true, color: '#2c6f96' },
  lake:     { name: '호수',   f: 1, p: 0, g: 1, water: true, color: '#4597b8' },
  grass:    { name: '초원',   f: 2, p: 0, g: 0, color: '#6c9a4a' },
  plains:   { name: '평원',   f: 1, p: 1, g: 0, color: '#a5a24f' },
  desert:   { name: '사막',   f: 0, p: 0, g: 0, color: '#d6bd78' },
  tundra:   { name: '툰드라', f: 1, p: 0, g: 0, color: '#95a39a' },
  mountain: { name: '산',     f: 0, p: 0, g: 0, color: '#6f6a66' },
};

const RESOURCES = {
  wheat:  { name: '밀',     icon: '🌾', f: 1, kind: '보너스', imp: 'farm' },
  cattle: { name: '소',     icon: '🐄', f: 1, kind: '보너스', imp: 'pasture' },
  stone:  { name: '석재',   icon: '🪨', p: 1, kind: '보너스', imp: 'mine' },
  fish:   { name: '물고기', icon: '🐟', f: 1, kind: '보너스' },
  horses: { name: '말',     icon: '🐴', p: 1, kind: '전략', imp: 'pasture', tech: 'husbandry' },
  iron:   { name: '철',     icon: '⛓️', p: 1, kind: '전략', imp: 'mine', tech: 'bronze' },
  gems:   { name: '보석',   icon: '💎', g: 3, kind: '사치', imp: 'mine' },
  spices: { name: '향신료', icon: '🌶️', f: 1, g: 2, kind: '사치', imp: 'plantation' },
};

const IMPROVEMENTS = {
  farm:       { name: '농장', icon: '🌱', f: 1, tech: null },
  mine:       { name: '광산', icon: '⛏️', p: 1, tech: 'mining' },
  pasture:    { name: '목장', icon: '🐾', p: 1, tech: 'husbandry' },
  plantation: { name: '농원', icon: '🧺', g: 2, tech: 'irrigation' },
};

const ERAS = ['고대', '고전', '중세', '르네상스', '산업', '현대'];

/* cls: civ(민간) / melee / ranged / cav / siege · up: 금으로 업그레이드할 다음 유닛 */
const UNITS = {
  settler:    { name: '정착민', icon: '⛺', cost: 50, move: 2, str: 0, cls: 'civ', desc: '새 도시를 세워요. 완성 시 도시 인구 -1' },
  builder:    { name: '건설자', icon: '🔨', cost: 36, move: 2, str: 0, cls: 'civ', charges: 3, desc: '타일을 개발해요. 3회 사용하면 사라져요' },
  missionary: { name: '선교사', icon: '📿', cost: 60, move: 3, str: 0, cls: 'civ', charges: 2, faithOnly: true, desc: '도시 옆에서 내 종교를 전파해요 (신앙으로만 구매)' },
  scout:      { name: '정찰병', icon: '🧭', cost: 20, move: 3, str: 10, cls: 'melee', sight: 3, desc: '빠르게 지도를 밝혀요' },
  warrior:    { name: '전사',   icon: '⚔️', cost: 28, move: 2, str: 20, cls: 'melee', up: 'swordsman', desc: '기본 근접 유닛' },
  archer:     { name: '궁수',   icon: '🏹', cost: 44, move: 2, str: 15, rs: 25, range: 2, cls: 'ranged', tech: 'archery', up: 'crossbow', desc: '2칸 거리에서 반격 없이 공격' },
  spearman:   { name: '창병',   icon: '🔱', cost: 46, move: 2, str: 25, cls: 'melee', anti: true, tech: 'bronze', up: 'musketman', desc: '기병 상대 전투력 +10' },
  horseman:   { name: '기마병', icon: '🐎', cost: 60, move: 4, str: 34, cls: 'cav', tech: 'riding', res: 'horses', up: 'knight', desc: '이동력 4의 빠른 돌격대' },
  swordsman:  { name: '검사',   icon: '🗡️', cost: 66, move: 2, str: 36, cls: 'melee', tech: 'iron', res: 'iron', up: 'musketman', desc: '강력한 근접 유닛' },
  catapult:   { name: '투석기', icon: '☄️', cost: 80, move: 2, str: 20, rs: 34, range: 2, cls: 'siege', tech: 'engineering', up: 'bombard', desc: '도시 공격에 특화 (유닛 상대로는 약해요)' },
  crossbow:   { name: '석궁병', icon: '🎯', cost: 90, move: 2, str: 28, rs: 40, range: 2, cls: 'ranged', tech: 'machinery', up: 'fieldcannon', desc: '강화된 원거리 유닛' },
  knight:     { name: '기사',   icon: '🏇', cost: 110, move: 4, str: 48, cls: 'cav', tech: 'stirrups', res: 'iron', up: 'cavalry', desc: '중세의 중장 기병' },
  musketman:  { name: '머스킷병', icon: '💂', cost: 130, move: 2, str: 55, cls: 'melee', tech: 'gunpowder', up: 'rifleman', desc: '화약 시대의 주력 보병 (자원 불필요)' },
  bombard:    { name: '대포',   icon: '💣', cost: 150, move: 2, str: 38, rs: 55, range: 2, cls: 'siege', tech: 'metalcasting', desc: '성벽을 무너뜨리는 공성 무기' },
  cavalry:    { name: '기병대', icon: '🎠', cost: 170, move: 5, str: 62, cls: 'cav', tech: 'milscience', res: 'horses', desc: '이동력 5의 근대 기병' },
  fieldcannon:{ name: '야포',   icon: '🧨', cost: 170, move: 2, str: 45, rs: 60, range: 2, cls: 'ranged', tech: 'milscience', desc: '근대의 원거리 화력' },
  rifleman:   { name: '소총병', icon: '🎖️', cost: 190, move: 2, str: 70, cls: 'melee', tech: 'rifling', desc: '가장 강력한 보병' },
};

/* f 식량 · p 생산 · g 금 · s 과학 · c 문화 · r 신앙 · t 관광 */
const BUILDINGS = {
  monument:   { name: '기념비',   icon: '🗿', cost: 36,  c: 2, desc: '문화 +2 — 국경 확장과 정책이 빨라져요' },
  granary:    { name: '곡창',     icon: '🏺', cost: 46,  f: 1, housing: 2, tech: 'pottery', desc: '식량 +1, 주거 +2' },
  walls:      { name: '성벽',     icon: '🧱', cost: 56,  tech: 'masonry', desc: '도시 방어력 +8, 2칸 내 적을 자동 사격' },
  aqueduct:   { name: '수로',     icon: '🚰', cost: 70,  housing: 3, tech: 'engineering', desc: '주거 +3' },
  sewer:      { name: '하수도',   icon: '🕳️', cost: 110, housing: 3, tech: 'industrial', desc: '주거 +3' },
  library:    { name: '도서관',   icon: '📚', cost: 60,  s: 2, tech: 'writing', district: 'campus', desc: '과학 +2' },
  university: { name: '대학',     icon: '🎓', cost: 120, s: 4, housing: 1, tech: 'education', district: 'campus', req: 'library', desc: '과학 +4, 주거 +1' },
  lab:        { name: '연구소',   icon: '🧪', cost: 240, s: 7, tech: 'electricity', district: 'campus', req: 'university', desc: '과학 +7' },
  market:     { name: '시장',     icon: '🏪', cost: 70,  g: 4, tech: 'currency', district: 'commerce', desc: '금 +4' },
  bank:       { name: '은행',     icon: '🏦', cost: 130, g: 5, tech: 'guilds', district: 'commerce', req: 'market', desc: '금 +5' },
  stock:      { name: '증권 거래소', icon: '📈', cost: 220, g: 7, tech: 'economics', district: 'commerce', req: 'bank', desc: '금 +7' },
  workshop:   { name: '작업장',   icon: '🛠️', cost: 70,  p: 2, tech: 'engineering', district: 'industry', desc: '생산 +2' },
  factory:    { name: '공장',     icon: '🏭', cost: 190, p: 4, tech: 'industrial', district: 'industry', req: 'workshop', desc: '생산 +4' },
  theater:    { name: '원형극장', icon: '🎪', cost: 70,  c: 3, t: 1, tech: 'drama', district: 'culture', desc: '문화 +3, 관광 +1' },
  museum:     { name: '박물관',   icon: '🖼️', cost: 150, c: 4, t: 3, tech: 'printing', district: 'culture', req: 'theater', desc: '문화 +4, 관광 +3' },
  broadcast:  { name: '방송국',   icon: '📻', cost: 260, c: 5, t: 6, tech: 'radio', district: 'culture', req: 'museum', desc: '문화 +5, 관광 +6' },
  shrine:     { name: '성소',     icon: '⛩️', cost: 50,  r: 2, tech: 'astrology', district: 'holy', desc: '신앙 +2 — 선교사를 살 수 있게 돼요' },
  temple:     { name: '사원',     icon: '🕌', cost: 100, r: 4, tech: 'theology', district: 'holy', req: 'shrine', desc: '신앙 +4, 주변 도시에 종교 압력 +50%' },
};

const DISTRICTS = {
  campus:   { name: '학문 지구', icon: '🔬', color: '#3f7fd9', tech: 'writing',     yld: 's', adj: '인접한 산마다 +1, 숲 2칸당 +1' },
  holy:     { name: '성지',     icon: '🛐', color: '#cfc7ee', tech: 'astrology',   yld: 'r', adj: '인접한 산마다 +1, 숲 2칸당 +1' },
  commerce: { name: '상업 지구', icon: '💰', color: '#d9a441', tech: 'currency',    yld: 'g', adj: '물가(해안·호수)에 붙으면 +2, 인접 지구 2칸당 +1' },
  industry: { name: '산업 지구', icon: '⚙️', color: '#c0703a', tech: 'engineering', yld: 'p', adj: '인접한 광산마다 +1, 인접 지구 2칸당 +1' },
  culture:  { name: '문화 지구', icon: '🎭', color: '#a05fc9', tech: 'drama',       yld: 'c', adj: '인접한 지구·도심·불가사의마다 +1' },
};

/* 세계에 하나뿐인 건축물. need: 놓을 타일의 조건 */
const WONDERS = {
  skypillar: { name: '하늘 기둥',     icon: '🗼', cost: 120, tech: 'astrology',   need: 'mountain', r: 3, t: 2, desc: '신앙 +3, 관광 +2', needText: '산 옆' },
  stonegarden:{ name: '거석 정원',    icon: '🪨', cost: 120, tech: 'masonry',     need: 'flat',     c: 3, t: 2, desc: '문화 +3, 관광 +2', needText: '평지' },
  scrollhall:{ name: '두루마리 서고', icon: '📜', cost: 170, tech: 'writing',     need: 'campus',   s: 4, t: 2, desc: '과학 +4, 관광 +2', needText: '학문 지구 옆' },
  seabeacon: { name: '바다 등불',     icon: '🔥', cost: 190, tech: 'currency',    need: 'water',    g: 5, f: 1, t: 2, desc: '금 +5, 식량 +1, 관광 +2', needText: '물가' },
  giantwall: { name: '거인의 방벽',   icon: '🏯', cost: 210, tech: 'engineering', need: 'center',   t: 2, desc: '내 모든 도시 방어력 +6, 관광 +2', needText: '도심 옆' },
  glassspire:{ name: '유리 첨탑 성당', icon: '⛪', cost: 300, tech: 'theology',    need: 'holy',     r: 6, t: 3, desc: '신앙 +6, 관광 +3, 새 선교사 사용 횟수 +1', needText: '성지 옆' },
  goldtheatre:{ name: '황금 극장',    icon: '🏟️', cost: 430, tech: 'printing',    need: 'culture',  c: 6, t: 5, desc: '문화 +6, 관광 +5', needText: '문화 지구 옆' },
  irontower: { name: '철의 탑',       icon: '🗽', cost: 580, tech: 'industrial',  need: 'center',   p: 4, t: 7, desc: '생산 +4, 관광 +7', needText: '도심 옆' },
  expohall:  { name: '세계 박람회장', icon: '🎡', cost: 720, tech: 'electricity', need: 'flat',     c: 4, t: 9, desc: '문화 +4, 관광 +9', needText: '평지' },
};

const PROJECTS = {
  space:  { name: '우주 탐사선', icon: '🚀', cost: 900, tech: 'rocketry', desc: '완성하면 과학 승리! (연구소가 있는 도시에서만)' },
  wealth: { name: '재화 생산', icon: '🪙', cost: 30, desc: '생산을 금 20으로 바꿔요 (반복 가능)' },
};

/* col = 시대 */
const TECHS = {
  pottery:    { name: '도예',      cost: 20,  req: [], col: 0, unlock: '곡창' },
  husbandry:  { name: '목축',      cost: 20,  req: [], col: 0, unlock: '목장 · 말 자원 발견' },
  mining:     { name: '채광',      cost: 20,  req: [], col: 0, unlock: '광산 · 벌목' },
  astrology:  { name: '점성술',    cost: 24,  req: [], col: 0, unlock: '성지 · 성소 · 하늘 기둥', boost: '유적 1곳 탐험' },
  writing:    { name: '문자',      cost: 38,  req: ['pottery'],   col: 0, unlock: '학문 지구 · 도서관 · 두루마리 서고', boost: '다른 세력과 만나기' },
  irrigation: { name: '관개',      cost: 38,  req: ['pottery'],   col: 0, unlock: '농원 · 농장 식량 +1', boost: '농장 1개 건설' },
  archery:    { name: '궁술',      cost: 34,  req: ['husbandry'], col: 0, unlock: '궁수', boost: '적 유닛 1기 처치' },
  bronze:     { name: '청동 기술', cost: 45,  req: ['mining'],    col: 0, unlock: '창병 · 철 자원 발견', boost: '약탈자 야영지 파괴' },
  masonry:    { name: '석공술',    cost: 40,  req: ['mining'],    col: 0, unlock: '성벽 · 거석 정원', boost: '광산 1개 건설' },

  currency:   { name: '화폐',      cost: 65,  req: ['writing'],   col: 1, unlock: '상업 지구 · 시장 · 바다 등불', boost: '금 100 모으기' },
  drama:      { name: '연극과 시', cost: 65,  req: ['writing'],   col: 1, unlock: '문화 지구 · 원형극장', boost: '기념비 건설' },
  theology:   { name: '신학',      cost: 80,  req: ['astrology', 'writing'], col: 1, unlock: '사원 · 유리 첨탑 성당', boost: '성소 건설' },
  riding:     { name: '기마술',    cost: 65,  req: ['archery'],   col: 1, unlock: '기마병 (말 필요)', boost: '목장 1개 건설' },
  iron:       { name: '철기',      cost: 75,  req: ['bronze'],    col: 1, unlock: '검사 (철 필요)', boost: '광산 2개 보유' },
  engineering:{ name: '공학',      cost: 90,  req: ['masonry', 'bronze'], col: 1, unlock: '산업 지구 · 작업장 · 수로 · 투석기 · 거인의 방벽', boost: '성벽 건설' },

  education:  { name: '교육',      cost: 150, req: ['currency', 'drama'], col: 2, unlock: '대학', boost: '도서관 건설' },
  guilds:     { name: '길드',      cost: 160, req: ['currency', 'drama'], col: 2, unlock: '은행', boost: '시장 건설' },
  machinery:  { name: '기계',      cost: 150, req: ['engineering', 'archery'], col: 2, unlock: '석궁병', boost: '궁수 2기 보유' },
  apprentice: { name: '도제 제도', cost: 160, req: ['engineering', 'currency'], col: 2, unlock: '광산 생산 +1', boost: '광산 3개 보유' },
  stirrups:   { name: '등자',      cost: 150, req: ['riding', 'iron'], col: 2, unlock: '기사 (철 필요)', boost: '기마병 생산' },

  astronomy:  { name: '천문학',    cost: 240, req: ['education'], col: 3, unlock: '학문 지구 과학 +2', boost: '대학 건설' },
  printing:   { name: '인쇄술',    cost: 240, req: ['education', 'guilds'], col: 3, unlock: '박물관 · 황금 극장', boost: '원형극장 건설' },
  gunpowder:  { name: '화약',      cost: 260, req: ['machinery', 'apprentice'], col: 3, unlock: '머스킷병', boost: '석궁병 생산' },
  metalcasting:{ name: '금속 주조', cost: 270, req: ['gunpowder'], col: 3, unlock: '대포', boost: '투석기 생산' },

  theory:     { name: '과학 이론', cost: 340, req: ['astronomy', 'printing'], col: 4, unlock: '모든 도시 과학 +2', boost: '도시 3개 보유' },
  economics:  { name: '경제학',    cost: 340, req: ['guilds', 'printing'], col: 4, unlock: '증권 거래소', boost: '은행 건설' },
  industrial: { name: '산업화',    cost: 350, req: ['apprentice', 'gunpowder'], col: 4, unlock: '공장 · 하수도 · 철의 탑', boost: '작업장 건설' },
  milscience: { name: '군사학',    cost: 350, req: ['gunpowder', 'stirrups'], col: 4, unlock: '기병대 (말 필요) · 야포', boost: '기사 생산' },
  rifling:    { name: '강선',      cost: 400, req: ['metalcasting', 'milscience'], col: 4, unlock: '소총병', boost: '머스킷병 생산' },

  electricity:{ name: '전기',      cost: 450, req: ['theory', 'industrial'], col: 5, unlock: '연구소 · 세계 박람회장', boost: '공장 건설' },
  radio:      { name: '라디오',    cost: 450, req: ['electricity', 'economics'], col: 5, unlock: '방송국', boost: '박물관 건설' },
  rocketry:   { name: '로켓 공학', cost: 560, req: ['electricity', 'rifling'], col: 5, unlock: '우주 탐사선 (과학 승리)', boost: '연구소 건설' },
};

const POLICIES = {
  pioneer:  { name: '개척 정신', desc: '정착민 생산 속도 +50%' },
  craft:    { name: '장인 정신', desc: '새 건설자의 사용 횟수 +1' },
  agrarian: { name: '농경 전통', desc: '모든 도시 식량 +1' },
  planner:  { name: '도시 계획', desc: '모든 도시 생산 +1, 지구 건설 +25%' },
  discipline:{ name: '규율',     desc: '약탈자 상대 전투력 +5' },
  patron:   { name: '학자 후원', desc: '모든 도시 과학 +1' },
  trade:    { name: '교역로',    desc: '모든 도시 금 +2' },
  festival: { name: '축제',      desc: '모든 도시 문화 +1' },
  conscript:{ name: '징병제',    desc: '군사 유닛 생산 +25%, 유지비 면제 +2기' },
  bastion:  { name: '성곽 도시', desc: '도시 방어력 +5' },
  elite:    { name: '정예병',    desc: '모든 군사 유닛 전투력 +2' },
  commons:  { name: '공동 주택', desc: '모든 도시 주거 +2' },
  piety:    { name: '신심',      desc: '모든 도시 신앙 +1' },
  heritage: { name: '문화유산',  desc: '관광 +25%' },
  masons:   { name: '석공 조합', desc: '불가사의 건설 +20%' },
};

/* 종교를 창시할 때 고르는 교리 */
const BELIEFS = {
  tithe:      { name: '십일조',     desc: '내 종교를 믿는 도시마다(남의 도시 포함) 금 +2' },
  pilgrimage: { name: '순례',       desc: '내 종교를 믿는 도시마다(남의 도시 포함) 신앙 +1' },
  scripture:  { name: '경전 연구',  desc: '성지가 있는 내 도시마다 과학 +2' },
  choral:     { name: '성가',       desc: '성소·사원마다 문화 +2' },
  feast:      { name: '나눔의 식탁', desc: '내 종교를 믿는 내 도시마다 식량 +2' },
};
const RELIGION_NAMES = ['빛의 길', '대지의 어머니', '별의 인도', '바람의 서약', '옛 숲의 신앙', '황금 저울', '달의 교단', '불꽃의 맹세'];

/* focus: AI가 노리는 방향 (sci 과학 · mil 정복 · cul 문화 · rel 종교 · bal 균형) */
const FACTIONS = [
  { id: 'astel',  name: '아스텔 연방', leader: '현자 오렐리아', color: '#4a8df0', dark: '#1d3f7a', focus: 'sci',
    trait: '학문 지구 인접 보너스 +1', ltrait: '수도 과학 +2',
    cities: ['아스테라', '루멘', '벨로스', '미라드', '코넬', '세이른', '오르비', '타렌'] },
  { id: 'kardun', name: '카르둔 왕국', leader: '철혈왕 가르막', color: '#e0503c', dark: '#6e1f14', focus: 'mil',
    trait: '근접·기병 유닛 전투력 +3', ltrait: '군사 유닛 생산 +15%',
    cities: ['카르두', '그란홀', '볼크', '드라벤', '모르간', '스톤가드', '브락', '울펜'] },
  { id: 'silva',  name: '실바 씨족',   leader: '숲지기 엘린드라', color: '#3fae5a', dark: '#17502a', focus: 'bal',
    trait: '숲 타일 생산 +1', ltrait: '숲에서 방어하는 유닛 전투력 +3',
    cities: ['실바린', '엘더루트', '모스헤임', '파인홀로', '그린웰', '소른', '이브리', '윌로'] },
  { id: 'merka',  name: '메르카 상단', leader: '대상주 자히르', color: '#e8b33a', dark: '#6b4c0c', focus: 'bal',
    trait: '수도 금 +4', ltrait: '금 구매 20% 할인',
    cities: ['메르카', '골든포트', '살리브', '바자르', '코인테', '실크로', '두카트', '엠버'] },
  { id: 'solari', name: '솔라리 성국', leader: '대사제 이르멜라', color: '#b58cf5', dark: '#3d2470', focus: 'rel',
    trait: '성지 인접 보너스 +1, 성소 신앙 +1', ltrait: '새 선교사 사용 횟수 +1',
    cities: ['솔라리움', '헬리온', '아우렐', '산토리', '루시드', '오라클', '미르', '벨라'] },
  { id: 'nord',   name: '노르드해 연합', leader: '해왕 토르빈', color: '#35c2b4', dark: '#0f4a45', focus: 'bal',
    trait: '해안·호수 타일 식량 +1', ltrait: '물가 도시 주거 +2',
    cities: ['스카겐', '피요르', '하븐', '노르케', '빈터홀', '에이르', '울프순', '달가'] },
  { id: 'bella',  name: '벨라토 공화국', leader: '시인 여왕 세레나', color: '#f06fa3', dark: '#6d1f42', focus: 'cul',
    trait: '문화 지구 건물마다 문화 +1', ltrait: '관광 +25%, 불가사의 건설 +15%',
    cities: ['벨라토', '칸초네', '피오레', '베르소', '리라', '아리아', '소네트', '카덴차'] },
  { id: 'dwar',   name: '드와르 산악국', leader: '대장장이 왕 발드린', color: '#d98a3d', dark: '#5e3510', focus: 'sci',
    trait: '광산 생산 +1', ltrait: '산업 지구 인접 보너스 +1, 언덕에서 방어 +2',
    cities: ['드와르홀', '아이언딥', '카즈룬', '모루', '그림포지', '스톤하스', '발드', '오어게이트'] },
];

const BARB = { name: '약탈자', color: '#3b3b44', dark: '#8a1c1c' };

const GAME_LENGTH = { quick: { turns: 170, mul: 0.67, name: '빠름' }, standard: { turns: 250, mul: 1, name: '표준' } };
