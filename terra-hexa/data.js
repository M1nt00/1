'use strict';
/* 테라 헥사 — 게임 데이터 (지형, 자원, 유닛, 건물, 지구, 기술, 정책, 세력) */

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

/* cls: civ(민간) / melee / ranged / cav / siege */
const UNITS = {
  settler:  { name: '정착민', icon: '⛺', cost: 50, move: 2, str: 0,  cls: 'civ', desc: '새 도시를 세워요. 완성 시 도시 인구 -1' },
  builder:  { name: '건설자', icon: '🔨', cost: 36, move: 2, str: 0,  cls: 'civ', charges: 3, desc: '타일을 개발해요. 3회 사용하면 사라져요' },
  scout:    { name: '정찰병', icon: '🧭', cost: 20, move: 3, str: 10, cls: 'melee', sight: 3, desc: '빠르게 지도를 밝혀요' },
  warrior:  { name: '전사',   icon: '⚔️', cost: 28, move: 2, str: 20, cls: 'melee', desc: '기본 근접 유닛' },
  archer:   { name: '궁수',   icon: '🏹', cost: 44, move: 2, str: 15, rs: 25, range: 2, cls: 'ranged', tech: 'archery', desc: '2칸 거리에서 반격 없이 공격' },
  spearman: { name: '창병',   icon: '🔱', cost: 46, move: 2, str: 25, cls: 'melee', anti: true, tech: 'bronze', desc: '기병 상대 전투력 +10' },
  horseman: { name: '기마병', icon: '🐎', cost: 60, move: 4, str: 34, cls: 'cav', tech: 'riding', res: 'horses', desc: '이동력 4의 빠른 돌격대' },
  swordsman:{ name: '검사',   icon: '🗡️', cost: 66, move: 2, str: 36, cls: 'melee', tech: 'iron', res: 'iron', desc: '강력한 근접 유닛' },
  crossbow: { name: '석궁병', icon: '🎯', cost: 90, move: 2, str: 28, rs: 40, range: 2, cls: 'ranged', tech: 'machinery', desc: '강화된 원거리 유닛' },
  catapult: { name: '투석기', icon: '☄️', cost: 80, move: 2, str: 20, rs: 34, range: 2, cls: 'siege', tech: 'engineering', desc: '도시 공격에 특화 (유닛 상대로는 약해요)' },
};

const BUILDINGS = {
  monument:   { name: '기념비',   icon: '🗿', cost: 36,  c: 2, desc: '문화 +2 — 국경 확장과 정책이 빨라져요' },
  granary:    { name: '곡창',     icon: '🏺', cost: 46,  f: 1, housing: 2, tech: 'pottery', desc: '식량 +1, 주거 +2' },
  walls:      { name: '성벽',     icon: '🧱', cost: 56,  tech: 'masonry', desc: '도시 방어력 +8, 2칸 내 적을 자동 사격' },
  library:    { name: '도서관',   icon: '📚', cost: 60,  s: 2, tech: 'writing', district: 'campus', desc: '과학 +2' },
  university: { name: '대학',     icon: '🎓', cost: 120, s: 4, housing: 1, tech: 'education', district: 'campus', req: 'library', desc: '과학 +4, 주거 +1' },
  market:     { name: '시장',     icon: '🏪', cost: 70,  g: 4, tech: 'currency', district: 'commerce', desc: '금 +4' },
  workshop:   { name: '작업장',   icon: '🛠️', cost: 70,  p: 2, tech: 'engineering', district: 'industry', desc: '생산 +2' },
  factory:    { name: '공방 단지', icon: '🏭', cost: 120, p: 3, tech: 'apprentice', district: 'industry', req: 'workshop', desc: '생산 +3' },
  theater:    { name: '원형극장', icon: '🎪', cost: 70,  c: 3, tech: 'drama', district: 'culture', desc: '문화 +3' },
};

const DISTRICTS = {
  campus:   { name: '학문 지구', icon: '🔬', color: '#3f7fd9', tech: 'writing',     yld: 's', adj: '인접한 산마다 +1, 숲 2칸당 +1' },
  commerce: { name: '상업 지구', icon: '💰', color: '#d9a441', tech: 'currency',    yld: 'g', adj: '물가(해안·호수)에 붙으면 +2, 인접 지구 2칸당 +1' },
  industry: { name: '산업 지구', icon: '⚙️', color: '#c0703a', tech: 'engineering', yld: 'p', adj: '인접한 광산마다 +1, 인접 지구 2칸당 +1' },
  culture:  { name: '문화 지구', icon: '🎭', color: '#a05fc9', tech: 'drama',       yld: 'c', adj: '인접한 지구·도심마다 +1' },
};

const PROJECTS = {
  observatory: { name: '대천문대', icon: '🔭', cost: 600, tech: 'theory', desc: '완성하면 과학 승리! (대학이 있는 도시에서만)' },
  wealth:      { name: '재화 생산', icon: '🪙', cost: 30, desc: '생산을 금 20으로 바꿔요 (반복 가능)' },
};

/* col = 기술 트리에서의 열(시대) */
const TECHS = {
  pottery:    { name: '도예',      cost: 20,  req: [], col: 0, unlock: '곡창' },
  husbandry:  { name: '목축',      cost: 20,  req: [], col: 0, unlock: '목장 · 말 자원 발견' },
  mining:     { name: '채광',      cost: 20,  req: [], col: 0, unlock: '광산 · 벌목' },
  writing:    { name: '문자',      cost: 38,  req: ['pottery'],   col: 1, unlock: '학문 지구 · 도서관', boost: '다른 세력과 만나기' },
  irrigation: { name: '관개',      cost: 38,  req: ['pottery'],   col: 1, unlock: '농원 · 농장 식량 +1', boost: '농장 1개 건설' },
  archery:    { name: '궁술',      cost: 34,  req: ['husbandry'], col: 1, unlock: '궁수', boost: '적 유닛 1기 처치' },
  bronze:     { name: '청동 기술', cost: 45,  req: ['mining'],    col: 1, unlock: '창병 · 철 자원 발견', boost: '약탈자 야영지 파괴' },
  masonry:    { name: '석공술',    cost: 40,  req: ['mining'],    col: 1, unlock: '성벽', boost: '광산 1개 건설' },
  currency:   { name: '화폐',      cost: 65,  req: ['writing'],   col: 2, unlock: '상업 지구 · 시장', boost: '금 100 모으기' },
  drama:      { name: '연극과 시', cost: 65,  req: ['writing'],   col: 2, unlock: '문화 지구 · 원형극장', boost: '기념비 건설' },
  riding:     { name: '기마술',    cost: 65,  req: ['archery'],   col: 2, unlock: '기마병 (말 필요)', boost: '목장 1개 건설' },
  iron:       { name: '철기',      cost: 75,  req: ['bronze'],    col: 2, unlock: '검사 (철 필요)', boost: '광산 2개 보유' },
  engineering:{ name: '공학',      cost: 90,  req: ['masonry', 'bronze'], col: 2, unlock: '산업 지구 · 작업장 · 투석기', boost: '성벽 건설' },
  education:  { name: '교육',      cost: 150, req: ['currency', 'drama'], col: 3, unlock: '대학', boost: '도서관 건설' },
  machinery:  { name: '기계',      cost: 150, req: ['engineering', 'archery'], col: 3, unlock: '석궁병', boost: '궁수 2기 보유' },
  apprentice: { name: '도제 제도', cost: 160, req: ['engineering', 'currency'], col: 3, unlock: '공방 단지 · 광산 생산 +1', boost: '광산 3개 보유' },
  astronomy:  { name: '천문학',    cost: 240, req: ['education'], col: 4, unlock: '학문 지구 과학 +2', boost: '대학 건설' },
  theory:     { name: '과학 이론', cost: 330, req: ['astronomy', 'apprentice'], col: 5, unlock: '대천문대 (과학 승리)', boost: '도시 3개 보유' },
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
};

const FACTIONS = [
  { id: 'astel',  name: '아스텔 연방', color: '#4a8df0', dark: '#1d3f7a', trait: '학자의 나라 — 학문 지구 인접 보너스 +1, 수도 과학 +1',
    cities: ['아스테라', '루멘', '벨로스', '미라드', '코넬', '세이른', '오르비', '타렌'] },
  { id: 'kardun', name: '카르둔 왕국', color: '#e0503c', dark: '#6e1f14', trait: '전사의 나라 — 근접 유닛 전투력 +3',
    cities: ['카르두', '그란홀', '볼크', '드라벤', '모르간', '스톤가드', '브락', '울펜'] },
  { id: 'silva',  name: '실바 씨족',   color: '#3fae5a', dark: '#17502a', trait: '숲의 사람들 — 숲 타일 생산 +1',
    cities: ['실바린', '엘더루트', '모스헤임', '파인홀로', '그린웰', '소른', '이브리', '윌로'] },
  { id: 'merka',  name: '메르카 상단', color: '#e8b33a', dark: '#6b4c0c', trait: '상인의 나라 — 수도 금 +4, 금 구매 20% 할인',
    cities: ['메르카', '골든포트', '살리브', '바자르', '코인테', '실크로', '두카트', '엠버'] },
];

const BARB = { name: '약탈자', color: '#3b3b44', dark: '#8a1c1c' };

const MAX_TURN = 160;
