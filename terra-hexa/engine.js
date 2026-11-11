'use strict';
/* 테라 헥사 — 게임 규칙 엔진 (DOM 없음: 브라우저와 Node 양쪽에서 동작) */

let G = null;        // 직렬화 가능한 게임 상태
let M = null;        // 지형 기하 캐시 (저장 안 함)
let UA = [];         // 타일 → 유닛 캐시
const NOTES = [];    // 사람 플레이어에게 보여줄 알림
const HOOK = { fx() {}, changed() {}, move() {}, attack() {}, death() {} };

/* ---------- 난수 ---------- */
function rnd() {
  G.rng = (G.rng + 0x6D2B79F5) | 0;
  let t = G.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function ri(n) { return Math.floor(rnd() * n); }
function pick(a) { return a[ri(a.length)]; }

/* ---------- 헥스 기하 (odd-r 오프셋, 뾰족한 꼭대기) ---------- */
function buildGeom(W, H) {
  const N = W * H, nei = new Array(N), nb = new Array(N), ax = new Array(N);
  const DIRS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]]; // E, SE, SW, W, NW, NE
  const idx = (q, r) => {
    if (r < 0 || r >= H) return -1;
    const col = q + ((r - (r & 1)) >> 1);
    if (col < 0 || col >= W) return -1;
    return r * W + col;
  };
  for (let i = 0; i < N; i++) {
    const col = i % W, row = (i / W) | 0;
    ax[i] = [col - ((row - (row & 1)) >> 1), row];
  }
  for (let i = 0; i < N; i++) {
    nei[i] = DIRS.map(d => idx(ax[i][0] + d[0], ax[i][1] + d[1]));
    nb[i] = nei[i].filter(n => n >= 0);
  }
  M = { W, H, N, nei, nb, ax, idx, cache: new Map() };
}
function dist(a, b) {
  const A = M.ax[a], B = M.ax[b];
  const dq = A[0] - B[0], dr = A[1] - B[1];
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
}
function within(i, d) {
  const key = i * 16 + d;
  let res = M.cache.get(key);
  if (res) return res;
  res = [i];
  const seen = new Set(res);
  let frontier = [i];
  for (let k = 0; k < d; k++) {
    const next = [];
    for (const a of frontier) for (const n of M.nb[a]) if (!seen.has(n)) { seen.add(n); next.push(n); res.push(n); }
    frontier = next;
  }
  M.cache.set(key, res);
  return res;
}

/* ---------- 기본 질의 ---------- */
function isWater(t) { return !!TERRAINS[t.t].water; }
function passable(t) { return !isWater(t) && t.t !== 'mountain'; }
function moveCost(t) { return 1 + (t.hill ? 1 : 0) + (t.forest ? 1 : 0); }
function factionOf(pid) { const p = G.players[pid]; return p ? p.faction : null; }
function hasTech(pid, id) { const p = G.players[pid]; return !!(p && p.techs[id]); }
function hasPol(pid, id) { const p = G.players[pid]; return !!(p && p.policies && p.policies.indexOf(id) >= 0); }
function atWar(a, b) {
  if (a === b) return false;
  if (G.players[a].barb || G.players[b].barb) return true;
  return !!G.war[a][b];
}
function isMil(u) { return UNITS[u.type].cls !== 'civ'; }
function fac(pid, id) { return factionOf(pid) === id; }
function techCost(id) { return Math.max(5, Math.round(TECHS[id].cost * (G.costMul || 1))); }
function playerEra(pid) { let e = 0; for (const id in G.players[pid].techs) e = Math.max(e, TECHS[id].col); return e; }
function worldEra() { let e = 0; for (const p of G.players) if (!p.barb && p.alive) e = Math.max(e, playerEra(p.id)); return e; }
function unitsOf(pid) { return G.units.filter(u => u.owner === pid); }
function citiesOf(pid) { return G.cities.filter(c => c.owner === pid); }
function techCount(pid) { return Object.keys(G.players[pid].techs).length; }
function resVisible(t, pid) {
  if (!t.res) return false;
  const R = RESOURCES[t.res];
  return !R.tech || pid == null || hasTech(pid, R.tech);
}
function freshWater(i) {
  let v = 0;
  for (const n of M.nb[i]) {
    const tt = G.tiles[n].t;
    if (tt === 'lake') v = Math.max(v, 2); else if (tt === 'coast' || tt === 'ocean') v = Math.max(v, 1);
  }
  return v; // 2 호수(담수), 1 해안, 0 없음
}
function note(pid, msg, pos, kind, tag) {
  const p = G.players[pid];
  if (p && p.human) NOTES.push({ msg, pos: pos == null ? -1 : pos, kind: kind || 'info', turn: G.turn, tag: tag || '' });
}
function seenByHuman(i) { const h = G.players[0]; return !!(h && h.vis && h.vis[i]); }
function fx(pos, text, color) { if (seenByHuman(pos)) HOOK.fx(pos, text, color); }

/* ---------- 산출량 ---------- */
function tileYield(i, pid) {
  const t = G.tiles[i], T = TERRAINS[t.t];
  if (t.t === 'mountain') return { f: 0, p: 0, g: 0 };
  let f = T.f, p = T.p, g = T.g;
  if (t.hill) p += 1;
  if (t.forest) { p += 1; if (pid != null && factionOf(pid) === 'silva') p += 1; }
  if (T.water && t.t !== 'ocean' && pid != null && factionOf(pid) === 'nord') f += 1;
  if (t.res && resVisible(t, pid)) { const R = RESOURCES[t.res]; f += R.f || 0; p += R.p || 0; g += R.g || 0; }
  if (t.imp) {
    const I = IMPROVEMENTS[t.imp];
    f += I.f || 0; p += I.p || 0; g += I.g || 0;
    const o = t.owner >= 0 ? t.owner : pid;
    if (t.imp === 'farm' && o != null && hasTech(o, 'irrigation')) f += 1;
    if (t.imp === 'mine' && o != null && hasTech(o, 'apprentice')) p += 1;
    if (t.imp === 'mine' && o != null && factionOf(o) === 'dwar') p += 1;
  }
  return { f, p, g };
}

function districtAdj(type, idx, pid) {
  let nd = 0, nf = 0, nm = 0, mines = 0, water = false;
  for (const n of M.nb[idx]) {
    const t = G.tiles[n];
    if (t.district || t.city != null || t.wonder) nd++;
    if (t.forest) nf++;
    if (t.t === 'mountain') nm++;
    if (t.imp === 'mine') mines++;
    if (isWater(t)) water = true;
  }
  let b = 1; // 지구 자체의 기본 +1
  if (type === 'campus') b += nm + (nf >> 1) + (factionOf(pid) === 'astel' ? 1 : 0);
  else if (type === 'holy') b += nm + (nf >> 1) + (factionOf(pid) === 'solari' ? 1 : 0);
  else if (type === 'commerce') b += (water ? 2 : 0) + (nd >> 1);
  else if (type === 'industry') b += mines + (nd >> 1) + (factionOf(pid) === 'dwar' ? 1 : 0);
  else if (type === 'culture') b += nd;
  return b;
}

function cityHousing(c) {
  let h = [3, 5, 6][freshWater(c.pos)];
  for (const b in c.buildings) h += BUILDINGS[b].housing || 0;
  h += Object.keys(c.districts).length;
  if (c.palace) h += 1;
  if (hasPol(c.owner, 'commons')) h += 2;
  if (fac(c.owner, 'nord') && freshWater(c.pos) > 0) h += 2;
  return h;
}

function cityYields(c) {
  const pid = c.owner;
  const y = { f: 0, p: 0, g: 0, s: 0, c: 0, r: 0 };
  const ct = tileYield(c.pos, pid);
  y.f += Math.max(2, ct.f); y.p += Math.max(1, ct.p); y.g += ct.g;
  for (const i of c.worked) { const t = tileYield(i, pid); y.f += t.f; y.p += t.p; y.g += t.g; }
  y.s += c.pop * 0.5; y.c += 1;
  if (c.palace) {
    y.p += 2; y.s += 2; y.c += 1; y.g += 4;
    if (factionOf(pid) === 'astel') y.s += 2;
    if (factionOf(pid) === 'merka') y.g += 4;
  }
  const rel = G.players[pid].religion, myFaith = cityReligion(c) === pid;
  for (const b in c.buildings) {
    const B = BUILDINGS[b]; y.f += B.f || 0; y.p += B.p || 0; y.g += B.g || 0; y.s += B.s || 0; y.c += B.c || 0; y.r += B.r || 0;
    if (B.district === 'culture' && fac(pid, 'bella')) y.c += 1;
    if (B.district === 'holy' && rel && rel.belief === 'choral') y.c += 2;
    if (b === 'shrine' && fac(pid, 'solari')) y.r += 1;
  }
  for (const w of c.wonders || []) { const W = WONDERS[w]; y.f += W.f || 0; y.p += W.p || 0; y.g += W.g || 0; y.s += W.s || 0; y.c += W.c || 0; y.r += W.r || 0; }
  for (const d in c.districts) {
    y[DISTRICTS[d].yld] += districtAdj(d, c.districts[d], pid);
    if (d === 'campus' && hasTech(pid, 'astronomy')) y.s += 2;
    if (d === 'holy' && rel && rel.belief === 'scripture') y.s += 2;
  }
  if (hasTech(pid, 'theory')) y.s += 2;
  if (rel && myFaith && rel.belief === 'feast') y.f += 2;
  if (hasPol(pid, 'piety')) y.r += 1;
  if (hasPol(pid, 'agrarian')) y.f += 1;
  if (hasPol(pid, 'planner')) y.p += 1;
  if (hasPol(pid, 'patron')) y.s += 1;
  if (hasPol(pid, 'trade')) y.g += 2;
  if (hasPol(pid, 'festival')) y.c += 1;
  y.housing = cityHousing(c);
  let surplus = y.f - c.pop * 2;
  if (surplus > 0) {
    if (c.pop >= y.housing) surplus = 0;
    else if (c.pop >= y.housing - 1) surplus *= 0.5;
  }
  y.surplus = surplus;
  return y;
}
function growthNeed(pop) { return Math.round(8 + 5 * (pop - 1) + Math.pow(pop - 1, 1.75)); }

function assignWorkers(c) {
  const pid = c.owner;
  const cand = c.tiles.filter(i => i !== c.pos && !G.tiles[i].district && !G.tiles[i].wonder && G.tiles[i].t !== 'mountain' && dist(i, c.pos) <= 3)
    .map(i => ({ i, y: tileYield(i, pid) }));
  c.worked = [];
  let food = Math.max(2, tileYield(c.pos, pid).f);
  for (let k = 0; k < c.pop && cand.length; k++) {
    const hungry = food - (k + 1) * 2 < 1;
    let best = -1, bs = -1e9;
    for (let j = 0; j < cand.length; j++) {
      const y = cand[j].y;
      const s = y.f * (hungry ? 3.4 : 2.3) + y.p * 2.1 + y.g * 0.9;
      if (s > bs) { bs = s; best = j; }
    }
    food += cand[best].y.f;
    c.worked.push(cand[best].i);
    cand.splice(best, 1);
  }
}

/* ---------- 시야 ---------- */
function recomputeVis(pid) {
  const p = G.players[pid];
  if (p.barb) return;
  const vis = new Uint8Array(M.N);
  for (const u of G.units) if (u.owner === pid) for (const i of within(u.pos, UNITS[u.type].sight || 2)) vis[i] = 1;
  for (const c of G.cities) if (c.owner === pid) for (const i of c.tiles) { vis[i] = 1; for (const n of M.nb[i]) vis[n] = 1; }
  p.vis = vis;
  for (let i = 0; i < M.N; i++) if (vis[i]) {
    p.explored[i] = 1;
    const u = UA[i], t = G.tiles[i];
    if (u && u.owner !== pid) meet(pid, u.owner);
    if (t.owner >= 0 && t.owner !== pid) meet(pid, t.owner);
  }
}
function meet(a, b) {
  const A = G.players[a], B = G.players[b];
  if (A.barb || B.barb || A.met[b]) return;
  A.met[b] = 1; B.met[a] = 1;
  note(a, `${B.name}와(과) 처음 만났어요.`, -1, 'good');
  note(b, `${A.name}와(과) 처음 만났어요.`, -1, 'good');
  boostTech(a, 'writing'); boostTech(b, 'writing');
}

/* ---------- 유닛 ---------- */
function rebuildUA() { UA = new Array(M.N).fill(null); for (const u of G.units) UA[u.pos] = u; }
function freeSpot(pos) {
  if (!UA[pos] && passable(G.tiles[pos])) return pos;
  for (const i of within(pos, 3)) {
    const t = G.tiles[i];
    if (!UA[i] && passable(t) && (t.city == null || i === pos)) return i;
  }
  return -1;
}
function addUnit(type, owner, pos) {
  const at = freeSpot(pos);
  if (at < 0) return null;
  const U = UNITS[type];
  const u = { id: G.nextId++, type, owner, pos: at, hp: 100, mp: U.move, fort: 0, idle: true, goto: null, sleep: false, skip: false, auto: false };
  if (U.charges) u.charges = U.charges + (type === 'builder' && hasPol(owner, 'craft') ? 1 : 0);
  if (type === 'missionary') { u.rel = owner; u.charges += (fac(owner, 'solari') ? 1 : 0) + (G.wonders.glassspire && G.wonders.glassspire.pid === owner ? 1 : 0); }
  G.units.push(u); UA[at] = u;
  return u;
}
function killUnit(u) {
  if (u.dead) return;
  u.dead = true;
  HOOK.death(u);
  if (UA[u.pos] === u) UA[u.pos] = null;
  const k = G.units.indexOf(u);
  if (k >= 0) G.units.splice(k, 1);
}
function unitById(id) { return G.units.find(u => u.id === id) || null; }

function unitStr(u, o) {
  o = o || {};
  const U = UNITS[u.type];
  let s = o.ranged ? U.rs : U.str;
  s -= Math.round(10 * (1 - u.hp / 100));
  const pid = u.owner;
  if (G.players[pid].barb) { if (G.difficulty === 'easy') s -= 4; }
  else {
    if (factionOf(pid) === 'kardun' && (U.cls === 'melee' || U.cls === 'cav')) s += 3;
    if (o.defending && fac(pid, 'silva') && G.tiles[u.pos].forest) s += 3;
    if (o.defending && fac(pid, 'dwar') && G.tiles[u.pos].hill) s += 2;
    if (hasPol(pid, 'elite') && U.cls !== 'civ') s += 2;
    if (hasPol(pid, 'discipline') && o.vs && G.players[o.vs.owner].barb) s += 5;
  }
  if (o.defending) {
    const t = G.tiles[u.pos];
    if (t.hill) s += 3;
    if (t.forest) s += 3;
    s += 3 * Math.min(2, u.fort || 0);
  }
  if (U.anti && o.vs && UNITS[o.vs.type].cls === 'cav') s += 10;
  if (U.cls === 'siege' && o.ranged && o.vs) s -= 10;
  return s;
}
function rawDmg(a, d) { return 30 * Math.exp((a - d) / 25); }
function rollDmg(a, d) { return Math.max(1, Math.round(rawDmg(a, d) * (0.8 + rnd() * 0.4))); }
function flankBonus(att, defPos) {
  let b = 0;
  for (const n of M.nb[defPos]) { const o = UA[n]; if (o && o !== att && o.owner === att.owner && isMil(o)) b += 2; }
  return b;
}
function cityStr(c) {
  let s = 14 + c.pop * 1.5 + techCount(c.owner) * 0.7;
  if (c.buildings.walls) s += 8;
  if (hasPol(c.owner, 'bastion')) s += 5;
  if (G.wonders.giantwall && G.wonders.giantwall.pid === c.owner) s += 6;
  const g = UA[c.pos];
  if (g && g.owner === c.owner && isMil(g)) s += 5;
  return Math.round(s);
}

/* 지금 공격 가능한 타일 목록 (전쟁 중인 상대만) */
function attackTargets(u) {
  const U = UNITS[u.type], out = [];
  if (U.cls === 'civ' || u.mp <= 0) return out;
  const range = U.rs ? U.range : 1;
  for (const i of within(u.pos, range)) {
    if (i === u.pos) continue;
    const t = G.tiles[i], o = UA[i];
    if (t.city != null) {
      const c = G.cities[t.city];
      if (c.owner !== u.owner && atWar(u.owner, c.owner)) out.push(i);
      continue;
    }
    if (o && o.owner !== u.owner && atWar(u.owner, o.owner)) {
      if (U.rs && !isMil(o)) continue; // 원거리로는 민간 유닛을 잡을 수 없음
      out.push(i);
    }
  }
  return out;
}

function onKill(att, def) {
  const p = G.players[att.owner];
  p.kills = (p.kills || 0) + 1;
  boostTech(att.owner, 'archery');
  note(att.owner, `${UNITS[att.type].name}이(가) 적 ${UNITS[def.type].name}을(를) 처치했어요.`, def.pos, 'good');
  note(def.owner, `${UNITS[def.type].name}을(를) 잃었어요.`, def.pos, 'bad');
}

function attack(u, target) {
  const U = UNITS[u.type], t = G.tiles[target];
  if (attackTargets(u).indexOf(target) < 0) return false;
  u.fort = 0; u.idle = false; u.sleep = false; u.goto = null;
  const ranged = !!U.rs;
  HOOK.attack(u.pos, target, ranged, u.id);
  if (t.city != null) { attackCity(u, G.cities[t.city], ranged); u.mp = 0; HOOK.changed(); return true; }
  const d = UA[target];
  if (!isMil(d)) { // 민간 유닛 포획
    if (G.players[u.owner].barb || d.type === 'missionary') { killUnit(d); note(d.owner, `${G.players[u.owner].name}이(가) ${UNITS[d.type].name}을(를) 붙잡아 갔어요!`, target, 'bad'); }
    else {
      note(d.owner, `${UNITS[d.type].name}이(가) 적에게 붙잡혔어요!`, target, 'bad');
      note(u.owner, `적 ${UNITS[d.type].name}을(를) 포획했어요.`, target, 'good');
      d.owner = u.owner; d.goto = null; d.auto = false; d.mp = 0;
      if (d.type === 'settler') { d.type = 'builder'; d.charges = 2; }
    }
    u.mp = 0; recomputeVis(u.owner); HOOK.changed(); return true;
  }
  const sA = unitStr(u, { ranged, vs: d }) + (ranged ? 0 : flankBonus(u, target));
  const sD = unitStr(d, { defending: true, vs: u });
  const dmgD = rollDmg(sA, sD);
  d.hp -= dmgD; fx(target, '-' + dmgD, '#ff6b5e');
  if (!ranged) { const dmgA = rollDmg(sD, sA); u.hp -= dmgA; fx(u.pos, '-' + dmgA, '#ffb35e'); }
  note(d.owner, `${UNITS[d.type].name}이(가) ${G.players[u.owner].name}의 ${U.name}에게 공격받았어요 (-${dmgD}).`, target, 'bad');
  u.mp = 0;
  if (d.hp <= 0 && u.hp <= 0) u.hp = 1; // 동귀어진 방지: 공격자가 살아남음
  if (d.hp <= 0) {
    onKill(u, d); killUnit(d);
    if (!ranged && u.hp > 0 && G.tiles[target].city == null) { const from = u.pos; UA[u.pos] = null; u.pos = target; UA[target] = u; onEnter(u, target); recomputeVis(u.owner); HOOK.move(u, from, target); }
  } else if (u.hp <= 0) { onKill(d, u); killUnit(u); }
  recomputeVis(u.owner);
  HOOK.changed();
  return true;
}

function attackCity(u, c, ranged) {
  const U = UNITS[u.type];
  const sC = cityStr(c);
  const sA = unitStr(u, { ranged }) + (U.cls === 'siege' ? 10 : 0);
  let dmgC = rollDmg(sA, sC);
  if (ranged) dmgC = Math.round(dmgC * (U.cls === 'siege' ? 1.5 : (c.buildings.walls ? 0.5 : 0.8)));
  c.hp = Math.max(0, c.hp - dmgC); c.hit = true;
  fx(c.pos, '-' + dmgC, '#ff6b5e');
  note(c.owner, `${c.name}이(가) 공격받고 있어요! (-${dmgC})`, c.pos, 'bad');
  if (!ranged) {
    const dmgA = Math.round(rollDmg(sC, sA) * 0.8);
    u.hp -= dmgA; fx(u.pos, '-' + dmgA, '#ffb35e');
    if (u.hp <= 0 && c.hp > 0) { note(u.owner, `${U.name}이(가) ${c.name} 공격 중 쓰러졌어요.`, c.pos, 'bad'); killUnit(u); return; }
    if (u.hp <= 0) u.hp = 1;
    if (c.hp <= 0) captureCity(c, u);
  }
}

function captureCity(c, u) {
  const oldO = c.owner, newO = u.owner;
  const g = UA[c.pos];
  if (g && g !== u) killUnit(g);
  if (G.players[newO].barb) { // 약탈자는 점령하지 않고 약탈만 함
    const P = G.players[oldO];
    const loot = Math.min(P.gold, 30);
    P.gold -= loot; if (c.pop > 1) c.pop--; c.hp = 60;
    note(oldO, `약탈자가 ${c.name}을(를) 약탈했어요! 금 -${loot}`, c.pos, 'bad');
    killUnit(u); assignWorkers(c);
    return;
  }
  c.owner = newO;
  for (const i of c.tiles) G.tiles[i].owner = newO;
  c.pop = Math.max(1, c.pop - 1); c.hp = 100; c.prodItem = null; c.progress = {}; c.carry = 0;
  for (const w of c.wonders || []) G.wonders[w].pid = newO;
  delete c.buildings.walls;
  if (c.palace) {
    c.palace = false;
    const rest = citiesOf(oldO).sort((a, b) => b.pop - a.pop);
    if (rest.length) rest[0].palace = true;
  }
  UA[u.pos] = null; u.pos = c.pos; UA[c.pos] = u;
  assignWorkers(c);
  note(newO, `${c.name}을(를) 점령했어요!`, c.pos, 'good');
  note(oldO, `${c.name}을(를) 빼앗겼어요!`, c.pos, 'bad');
  if (newO !== 0 && oldO !== 0) note(0, `${G.players[newO].name}이(가) ${G.players[oldO].name}의 ${c.name}을(를) 점령했어요.`, -1, 'info');
  if (!citiesOf(oldO).length) eliminate(oldO, newO);
  recomputeVis(newO); recomputeVis(oldO);
  checkDomination(newO);
}
function eliminate(pid, by) {
  const P = G.players[pid];
  P.alive = false;
  for (const u of unitsOf(pid)) killUnit(u);
  note(0, `${P.name}이(가) 멸망했어요.`, -1, 'info');
  if (P.human && !G.over) G.over = { winner: by, type: 'defeat' };
}
function majors() { return G.players.filter(p => !p.barb); }
function checkDomination(pid) {
  if (G.over) return;
  const caps = G.cities.filter(c => c.origCap != null);
  const need = majors().filter(p => p.founded).length;
  if (majors().length > 1 && caps.length >= majors().length && caps.every(c => c.owner === pid)) G.over = { winner: pid, type: 'domination' };
  else if (majors().filter(p => p.alive).length === 1 && need > 1) G.over = { winner: pid, type: 'domination' };
}

/* ---------- 이동 ---------- */
function blockedFor(u, n, dest) {
  const t = G.tiles[n];
  if (!passable(t)) return true;
  if (n === dest) return false;
  if (UA[n]) return true;
  if (t.city != null && G.cities[t.city].owner !== u.owner) return true;
  return false;
}
function findPath(u, dest) {
  if (dest === u.pos) return [];
  const p = G.players[u.owner];
  const known = i => p.barb || !p.human || p.explored[i];
  if (known(dest) && !passable(G.tiles[dest])) return null;
  const D = new Float32Array(M.N).fill(1e9), prev = new Int32Array(M.N).fill(-1);
  D[u.pos] = 0;
  const open = [u.pos];
  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (D[open[k]] < D[open[bi]]) bi = k;
    const cur = open.splice(bi, 1)[0];
    if (cur === dest) break;
    for (const n of M.nb[cur]) {
      let c;
      if (!known(n)) c = 1.6; // 모르는 땅은 갈 수 있다고 가정
      else { if (blockedFor(u, n, dest)) continue; c = moveCost(G.tiles[n]); }
      const nd = D[cur] + c + dist(n, dest) * 0.001;
      if (nd < D[n]) { if (D[n] > 9e8) open.push(n); D[n] = nd; prev[n] = cur; }
    }
  }
  if (prev[dest] < 0) return null;
  const path = [];
  for (let c = dest; c !== u.pos; c = prev[c]) path.push(c);
  return path.reverse();
}
/* 이번 턴에 갈 수 있는 타일 → 남는 이동력 */
function reachable(u) {
  const res = new Map();
  if (u.mp <= 0) return res;
  const best = new Map([[u.pos, u.mp]]);
  const open = [u.pos];
  while (open.length) {
    const cur = open.shift(), mp = best.get(cur);
    if (mp <= 0) continue;
    for (const n of M.nb[cur]) {
      const t = G.tiles[n];
      if (!passable(t) || UA[n] || (t.city != null && G.cities[t.city].owner !== u.owner)) continue;
      const left = Math.max(0, mp - moveCost(t));
      if (!best.has(n) || best.get(n) < left) { best.set(n, left); res.set(n, left); open.push(n); }
    }
  }
  return res;
}
function onEnter(u, n) {
  const t = G.tiles[n], p = G.players[u.owner];
  if (t.village && !p.barb) {
    t.village = false;
    const r = rnd();
    let msg;
    if (r < 0.4) { const g = 25 + ri(4) * 5; p.gold += g; msg = `유적에서 금 ${g}을 찾았어요!`; }
    else if (r < 0.7) {
      const av = availableTechs(u.owner).filter(id => !p.boosted[id]);
      if (av.length) { const id = pick(av); p.boosted[id] = 1; p.techProg[id] = (p.techProg[id] || 0) + techCost(id) * 0.4; msg = `유적의 기록으로 '${TECHS[id].name}' 연구가 앞당겨졌어요!`; }
      else { p.gold += 30; msg = '유적에서 금 30을 찾았어요!'; }
    } else if (r < 0.85) { for (const i of within(n, 4)) p.explored[i] = 1; msg = '유적의 지도가 주변 지형을 밝혀줬어요!'; }
    else { const c = citiesOf(u.owner)[0]; if (c) { c.pop++; assignWorkers(c); msg = `유적의 사람들이 ${c.name}에 합류했어요! (인구 +1)`; } else { p.gold += 30; msg = '유적에서 금 30을 찾았어요!'; } }
    note(u.owner, msg, n, 'good'); fx(n, '✨', '#ffe9a8');
    p.villages = (p.villages || 0) + 1;
    boostTech(u.owner, 'astrology');
  }
  if (t.camp && !p.barb && isMil(u)) {
    t.camp = false;
    G.camps = G.camps.filter(c => c.pos !== n);
    p.gold += 40; p.campsDestroyed = (p.campsDestroyed || 0) + 1;
    note(u.owner, '약탈자 야영지를 파괴했어요! 금 +40', n, 'good', 'camp'); fx(n, '+40💰', '#ffe9a8');
    boostTech(u.owner, 'bronze');
  }
}
function stepUnit(u, n) {
  const t = G.tiles[n];
  if (!passable(t) || UA[n] || (t.city != null && G.cities[t.city].owner !== u.owner)) return false;
  u.mp = Math.max(0, u.mp - moveCost(t));
  const from = u.pos;
  UA[u.pos] = null; u.pos = n; UA[n] = u;
  u.fort = 0; u.idle = false;
  onEnter(u, n);
  recomputeVis(u.owner);
  HOOK.move(u, from, n);
  return true;
}
/* dest 쪽으로 이번 턴에 갈 수 있는 만큼 이동. 도착 못하면 goto로 기억 */
function moveToward(u, dest, keepGoto) {
  const path = findPath(u, dest);
  if (!path) { u.goto = null; return false; }
  let moved = false;
  for (const n of path) {
    if (u.mp <= 0) break;
    if (!stepUnit(u, n)) break;
    moved = true;
    if (u.dead) return true;
  }
  if (u.pos === dest) u.goto = null;
  else if (keepGoto !== false) u.goto = (moved || u.mp <= 0) ? dest : null; // 막혀서 한 걸음도 못 가면 명령 취소
  HOOK.changed();
  return moved;
}

/* ---------- 도시 ---------- */
function canFoundAt(i, pid) {
  const t = G.tiles[i];
  if (!passable(t) || t.camp || t.district || t.wonder || t.city != null) return false;
  if (t.owner >= 0 && t.owner !== pid) return false;
  for (const c of G.cities) if (dist(c.pos, i) <= 3) return false;
  return true;
}
function siteScore(i, pid) {
  let s = 0;
  for (const j of within(i, 2)) {
    const t = G.tiles[j];
    if (t.owner >= 0 && j !== i) { s -= 0.5; continue; }
    const y = tileYield(j, pid);
    s += y.f * 2.6 + y.p * 1.3 + y.g * 0.5 + (t.res ? 2 : 0) - (t.t === 'mountain' ? 0.3 : 0);
  }
  s += [0, 4, 7][freshWater(i)];
  return s;
}
function foundCity(u) {
  if (u.type !== 'settler' || !canFoundAt(u.pos, u.owner)) return null;
  const p = G.players[u.owner], F = FACTIONS.find(f => f.id === p.faction);
  const n = p.cityCount || 0;
  const c = {
    id: G.cities.length, name: F.cities[n % F.cities.length] + (n >= F.cities.length ? ' ' + (1 + Math.floor(n / F.cities.length)) : ''),
    owner: u.owner, pos: u.pos, pop: 1, food: 0, carry: 0, cult: 0, prodItem: null, progress: {},
    buildings: {}, districts: {}, wonders: [], relP: { '-1': 60 }, tiles: [], worked: [], hp: 200, hit: false, palace: false, origCap: null,
  };
  p.cityCount = n + 1;
  if (!p.founded) { p.founded = true; c.palace = true; c.origCap = u.owner; }
  G.cities.push(c);
  const t = G.tiles[c.pos];
  t.city = c.id; t.forest = false; t.imp = null; t.village = false;
  for (const i of within(c.pos, 1)) claimTile(c, i);
  killUnit(u);
  assignWorkers(c);
  recomputeVis(c.owner);
  note(c.owner, `${c.name}을(를) 세웠어요!`, c.pos, 'good', 'found');
  if (citiesOf(c.owner).length >= 3) boostTech(c.owner, 'theory');
  HOOK.changed();
  return c;
}
function claimTile(c, i) {
  const t = G.tiles[i];
  if (t.owner >= 0) return false;
  t.owner = c.owner; t.cid = c.id; c.tiles.push(i);
  return true;
}
function expandBorder(c) {
  let best = -1, bs = -1e9;
  for (const i of within(c.pos, 3)) {
    const t = G.tiles[i];
    if (t.owner >= 0) continue;
    if (!M.nb[i].some(n => G.tiles[n].cid === c.id && G.tiles[n].owner === c.owner)) continue;
    const y = tileYield(i, c.owner);
    const s = y.f * 2 + y.p * 2 + y.g + (resVisible(t, c.owner) ? 4 : 0) - dist(i, c.pos) * 1.5 + (t.t === 'mountain' ? -2 : 0);
    if (s > bs) { bs = s; best = i; }
  }
  if (best < 0) return false;
  claimTile(c, best);
  return true;
}
function borderCost(c) { return 8 + 4 * Math.max(0, c.tiles.length - 7); }

function hasResource(pid, res) {
  for (let i = 0; i < M.N; i++) { const t = G.tiles[i]; if (t.owner === pid && t.res === res && (t.imp || t.city != null)) return true; }
  return false;
}
function unitCost(p, id) {
  let c = UNITS[id].cost;
  if (id === 'settler') c += 12 * (p.settlersBuilt || 0);
  if (id === 'builder') c += 4 * (p.buildersBuilt || 0);
  return c;
}
function districtLimit(c) { return 1 + Math.floor((c.pop - 1) / 3); }
function districtSites(c, type) {
  const out = [];
  for (const i of c.tiles) {
    const t = G.tiles[i];
    if (!siteFree(c, i)) continue;
    out.push({ idx: i, bonus: districtAdj(type, i, c.owner) });
  }
  return out.sort((a, b) => b.bonus - a.bonus);
}
function siteFree(c, i) {
  const t = G.tiles[i];
  if (i === c.pos || t.cid !== c.id || !passable(t) || t.district || t.wonder || t.res || t.camp || dist(i, c.pos) > 3 || (UA[i] && UA[i].owner !== c.owner)) return false;
  for (const o of G.cities) if (o.prodItem && o.prodItem.tile === i && o !== c) return false;
  return true;
}
function wonderSites(c, id) {
  const need = WONDERS[id].need, out = [];
  for (const i of c.tiles) {
    if (!siteFree(c, i)) continue;
    if (c.prodItem && c.prodItem.tile === i && c.prodItem.id !== id) continue;
    const t = G.tiles[i], nb = M.nb[i];
    let ok = true;
    if (need === 'mountain') ok = nb.some(n => G.tiles[n].t === 'mountain');
    else if (need === 'water') ok = nb.some(n => isWater(G.tiles[n]));
    else if (need === 'flat') ok = !t.hill && !t.forest;
    else if (need === 'center') ok = nb.indexOf(c.pos) >= 0;
    else if (need === 'campus' || need === 'holy' || need === 'culture') ok = nb.some(n => G.tiles[n].district === need && G.tiles[n].owner === c.owner);
    if (ok) out.push({ idx: i, bonus: 0 });
  }
  return out;
}
function itemCost(c, item) {
  const p = G.players[c.owner];
  const m = G.costMul || 1;
  if (item.kind === 'unit') return Math.round(unitCost(p, item.id) * m);
  if (item.kind === 'building') return Math.round(BUILDINGS[item.id].cost * m);
  if (item.kind === 'district') return Math.round((55 + 15 * Object.keys(c.districts).length) * m);
  if (item.kind === 'wonder') return Math.round(WONDERS[item.id].cost * m);
  return Math.round(PROJECTS[item.id].cost * (item.id === 'wealth' ? 1 : m));
}
function itemKey(item) { return item.kind + ':' + item.id; }
function cityOptions(c) {
  const p = G.players[c.owner], out = [];
  const add = (kind, id, D, lock) => {
    const item = { kind, id };
    out.push({ kind, id, key: itemKey(item), name: D.name, icon: D.icon, desc: D.desc || D.adj || '', cost: itemCost(c, item), lock: lock || null });
  };
  for (const id in UNITS) {
    const U = UNITS[id]; let lock = null;
    if (U.tech && !p.techs[U.tech]) lock = `연구 필요: ${TECHS[U.tech].name}`;
    else if (U.res && !hasResource(p.id, U.res)) lock = `개발된 ${RESOURCES[U.res].name} 자원 필요`;
    else if (id === 'settler' && c.pop < 2) lock = '인구 2 이상 필요';
    else if (U.faithOnly) lock = missionaryLock(c) || '신앙으로만 살 수 있어요';
    if (U.up && !lock) { const nx = UNITS[U.up]; if (p.techs[nx.tech] && (!nx.res || hasResource(p.id, nx.res))) continue; } // 구식 유닛은 목록에서 뺌
    add('unit', id, U, lock);
  }
  for (const id in BUILDINGS) {
    if (c.buildings[id]) continue;
    const B = BUILDINGS[id]; let lock = null;
    if (B.tech && !p.techs[B.tech]) lock = `연구 필요: ${TECHS[B.tech].name}`;
    else if (B.district && c.districts[B.district] == null) lock = `${DISTRICTS[B.district].name} 필요`;
    else if (B.req && !c.buildings[B.req]) lock = `${BUILDINGS[B.req].name} 필요`;
    add('building', id, B, lock);
  }
  for (const id in DISTRICTS) {
    if (c.districts[id] != null) continue;
    const D = DISTRICTS[id]; let lock = null;
    const cnt = Object.keys(c.districts).length;
    if (!p.techs[D.tech]) lock = `연구 필요: ${TECHS[D.tech].name}`;
    else if (cnt >= districtLimit(c)) lock = `인구 ${cnt * 3 + 1} 필요 (지구는 인구 3마다 1개)`;
    else if (!districtSites(c, id).length) lock = '지을 수 있는 타일이 없어요';
    add('district', id, D, lock);
  }
  for (const id in WONDERS) {
    if (G.wonders[id]) continue;
    const W = WONDERS[id]; let lock = null;
    if (!p.techs[W.tech]) lock = `연구 필요: ${TECHS[W.tech].name}`;
    else if (G.cities.some(o => o !== c && o.owner === c.owner && o.prodItem && o.prodItem.kind === 'wonder' && o.prodItem.id === id)) lock = '다른 도시에서 짓고 있어요';
    else if (!wonderSites(c, id).length) lock = `놓을 자리가 없어요 (${W.needText})`;
    out.push({ kind: 'wonder', id, key: 'wonder:' + id, name: W.name, icon: W.icon, desc: `${W.desc} · ${W.needText}`, cost: itemCost(c, { kind: 'wonder', id }), lock });
  }
  { let lock = null;
    if (!p.techs.rocketry) lock = '연구 필요: 로켓 공학';
    else if (!c.buildings.lab) lock = '연구소 필요';
    add('project', 'space', PROJECTS.space, lock);
    add('project', 'wealth', PROJECTS.wealth, null); }
  return out;
}
function setProduction(c, item) {
  const opt = cityOptions(c).find(o => o.key === itemKey(item));
  if (!opt || opt.lock) return false;
  if (item.kind === 'district') {
    if (item.tile == null || !districtSites(c, item.id).some(s => s.idx === item.tile)) return false;
  }
  if (item.kind === 'wonder') {
    if (item.tile == null || !wonderSites(c, item.id).some(s => s.idx === item.tile)) return false;
  }
  c.prodItem = { kind: item.kind, id: item.id, tile: item.tile == null ? null : item.tile };
  HOOK.changed();
  return true;
}
function prodMult(c, item) {
  const pid = c.owner, p = G.players[pid];
  let m = 1;
  if (item.kind === 'unit') {
    if (item.id === 'settler' && hasPol(pid, 'pioneer')) m += 0.5;
    if (UNITS[item.id].cls !== 'civ' && hasPol(pid, 'conscript')) m += 0.25;
    if (UNITS[item.id].cls !== 'civ' && fac(pid, 'kardun')) m += 0.15;
  }
  if (item.kind === 'wonder') m += (hasPol(pid, 'masons') ? 0.2 : 0) + (fac(pid, 'bella') ? 0.15 : 0);
  if (item.kind === 'district' && hasPol(pid, 'planner')) m += 0.25;
  if (!p.human) m *= G.aiMult;
  return m;
}
function turnsLeft(c, item, y) {
  y = y || cityYields(c);
  const left = itemCost(c, item) - (c.progress[itemKey(item)] || 0) - (c.carry || 0);
  const rate = y.p * prodMult(c, item);
  return rate > 0 ? Math.max(1, Math.ceil(left / rate)) : 999;
}
function buyCost(c, item) {
  if (item.kind !== 'unit' && item.kind !== 'building') return null;
  if (item.kind === 'unit' && UNITS[item.id].faithOnly) return null;
  const left = itemCost(c, item) - (c.progress[itemKey(item)] || 0);
  return Math.max(10, Math.ceil(left * 2.2 * (factionOf(c.owner) === 'merka' ? 0.8 : 1)));
}
function buyItem(c, item) {
  const p = G.players[c.owner], cost = buyCost(c, item);
  const opt = cityOptions(c).find(o => o.key === itemKey(item));
  if (cost == null || !opt || opt.lock || p.gold < cost) return false;
  if (item.kind === 'unit' && freeSpot(c.pos) < 0) return false;
  p.gold -= cost;
  delete c.progress[itemKey(item)];
  if (c.prodItem && itemKey(c.prodItem) === itemKey(item)) c.prodItem = null;
  completeItem(c, item, true);
  HOOK.changed();
  return true;
}
function completeItem(c, item, bought) {
  const pid = c.owner, p = G.players[pid];
  if (item.kind === 'unit') {
    const u = addUnit(item.id, pid, c.pos);
    if (!u) return false;
    if (item.id === 'settler') { c.pop = Math.max(1, c.pop - 1); p.settlersBuilt = (p.settlersBuilt || 0) + 1; assignWorkers(c); }
    if (item.id === 'builder') p.buildersBuilt = (p.buildersBuilt || 0) + 1;
    if (bought) u.mp = 0;
    if (unitsOf(pid).filter(x => x.type === 'archer').length >= 2) boostTech(pid, 'machinery');
    const ub = { horseman: 'stirrups', crossbow: 'gunpowder', catapult: 'metalcasting', knight: 'milscience', musketman: 'rifling' };
    if (ub[item.id]) boostTech(pid, ub[item.id]);
    note(pid, `${c.name}: ${UNITS[item.id].name} 완성!`, u.pos, 'good');
    recomputeVis(pid);
  } else if (item.kind === 'building') {
    c.buildings[item.id] = 1;
    const boosts = { monument: 'drama', walls: 'engineering', library: 'education', university: 'astronomy', shrine: 'theology', market: 'guilds', theater: 'printing', bank: 'economics', workshop: 'industrial', factory: 'electricity', museum: 'radio', lab: 'rocketry' };
    if (boosts[item.id]) boostTech(pid, boosts[item.id]);
    note(pid, `${c.name}: ${BUILDINGS[item.id].name} 완성!`, c.pos, 'good');
  } else if (item.kind === 'district') {
    const t = G.tiles[item.tile];
    if (t.district || t.cid !== c.id || t.owner !== pid) return false;
    t.district = item.id; t.imp = null; t.forest = false;
    c.districts[item.id] = item.tile;
    p.districtsBuilt = (p.districtsBuilt || 0) + 1;
    assignWorkers(c);
    note(pid, `${c.name}: ${DISTRICTS[item.id].name} 완성! (인접 보너스 +${districtAdj(item.id, item.tile, pid)})`, item.tile, 'good');
  } else if (item.kind === 'wonder') {
    const t = G.tiles[item.tile];
    if (G.wonders[item.id] || t.district || t.wonder || t.cid !== c.id || t.owner !== pid) return false;
    t.wonder = item.id; t.imp = null; t.forest = false;
    c.wonders.push(item.id);
    G.wonders[item.id] = { pid, city: c.id, turn: G.turn };
    assignWorkers(c);
    for (const q of majors()) note(q.id, q.id === pid ? `🏆 ${c.name}에 불가사의 '${WONDERS[item.id].name}' 완성!` : `${p.name}이(가) 불가사의 '${WONDERS[item.id].name}'을(를) 완성했어요.`, q.id === pid ? item.tile : -1, q.id === pid ? 'good' : 'info', q.id === pid ? 'wonder' : '');
    for (const o of G.cities) { // 같은 불가사의를 짓던 다른 도시는 금으로 환급
      if (o === c || !o.prodItem || o.prodItem.kind !== 'wonder' || o.prodItem.id !== item.id) continue;
      const refund = Math.round((o.progress['wonder:' + item.id] || 0) * 0.6);
      G.players[o.owner].gold += refund; delete o.progress['wonder:' + item.id]; o.prodItem = null;
      note(o.owner, `'${WONDERS[item.id].name}'을(를) 다른 세력이 먼저 지었어요. ${o.name}의 진행분은 금 ${refund}으로 돌려받았어요.`, o.pos, 'bad');
    }
  } else if (item.id === 'wealth') {
    p.gold += 20;
  } else if (item.id === 'space') {
    note(pid, '우주 탐사선이 발사됐어요!', c.pos, 'good');
    if (!G.over) G.over = { winner: pid, type: 'science' };
  }
  return true;
}

function processCity(c) {
  const pid = c.owner, p = G.players[pid];
  assignWorkers(c);
  const y = cityYields(c);
  // 성장
  c.food += y.surplus;
  const need = growthNeed(c.pop);
  if (c.food >= need) {
    c.food -= need; c.pop++; assignWorkers(c);
    note(pid, `${c.name}의 인구가 ${c.pop}(으)로 늘었어요.`, c.pos, 'info');
  } else if (c.food < 0) {
    if (c.pop > 1) { c.pop--; assignWorkers(c); note(pid, `${c.name}에 식량이 부족해 인구가 줄었어요.`, c.pos, 'bad'); }
    c.food = 0;
  }
  // 생산
  if (c.prodItem) {
    const item = c.prodItem, key = itemKey(item);
    c.progress[key] = (c.progress[key] || 0) + y.p * prodMult(c, item) + (c.carry || 0);
    c.carry = 0;
    const cost = itemCost(c, item);
    if (c.progress[key] >= cost) {
      if (item.kind === 'unit' && item.id === 'settler' && c.pop < 2) {
        c.progress[key] = cost; // 인구가 2가 될 때까지 대기
      } else if (completeItem(c, item)) {
        c.carry = Math.min(40, c.progress[key] - cost);
        delete c.progress[key];
        c.prodItem = item.id === 'wealth' && !p.human ? null : (item.id === 'wealth' ? item : null);
      } else {
        if (item.kind === 'district' || item.kind === 'wonder') { delete c.progress[key]; c.prodItem = null; }
        else c.progress[key] = cost;
      }
    }
  }
  // 문화 → 국경
  c.cult += y.c;
  let guard = 0;
  while (c.cult >= borderCost(c) && guard++ < 3) {
    const cost = borderCost(c);
    if (!expandBorder(c)) { c.cult = Math.min(c.cult, cost); break; }
    c.cult -= cost;
  }
  // 도시 방어
  if (c.buildings.walls) cityStrike(c);
  if (!c.hit) c.hp = Math.min(200, c.hp + 20);
  c.hit = false;
  return y;
}
function cityStrike(c) {
  let best = null;
  for (const i of within(c.pos, 2)) {
    const u = UA[i];
    if (u && u.owner !== c.owner && atWar(c.owner, u.owner) && isMil(u) && (!best || u.hp < best.hp)) best = u;
  }
  if (!best) return;
  const d = rollDmg(cityStr(c), unitStr(best, { defending: true }));
  HOOK.attack(c.pos, best.pos, true, null);
  best.hp -= d; fx(best.pos, '-' + d, '#ff6b5e');
  if (best.hp <= 0) {
    note(c.owner, `${c.name}의 성벽 사격으로 적 ${UNITS[best.type].name}을(를) 처치했어요.`, best.pos, 'good');
    note(best.owner, `${UNITS[best.type].name}이(가) ${c.name}의 사격에 쓰러졌어요.`, best.pos, 'bad');
    G.players[c.owner].kills = (G.players[c.owner].kills || 0) + 1;
    boostTech(c.owner, 'archery');
    killUnit(best);
  }
}

/* ---------- 건설자 ---------- */
function canImprove(i, imp, pid) {
  const t = G.tiles[i], I = IMPROVEMENTS[imp];
  if (t.owner !== pid || t.city != null || t.district || t.wonder || !passable(t) || t.imp === imp) return false;
  if (I.tech && !hasTech(pid, I.tech)) return false;
  const res = resVisible(t, pid) ? t.res : null;
  if (t.res && !res) { // 아직 모르는 자원이 있는 타일: 지형 규칙만 적용
    if (imp === 'farm') return !t.forest && !t.hill && (t.t === 'grass' || t.t === 'plains');
    if (imp === 'mine') return t.hill && !t.forest;
    return false;
  }
  if (imp === 'farm') return !t.forest && !t.hill && (t.t === 'grass' || t.t === 'plains') && (!res || res === 'wheat');
  if (imp === 'mine') return (t.hill && !t.forest && (!res || RESOURCES[res].imp === 'mine')) || (!!res && RESOURCES[res].imp === 'mine');
  if (imp === 'pasture') return !!res && RESOURCES[res].imp === 'pasture';
  if (imp === 'plantation') return res === 'spices';
  return false;
}
function improveOptions(i, pid) { return Object.keys(IMPROVEMENTS).filter(k => canImprove(i, k, pid)); }
function countImp(pid, imp) { let n = 0; for (const t of G.tiles) if (t.owner === pid && t.imp === imp) n++; return n; }
function useCharge(u) {
  u.charges--; u.mp = 0; u.idle = false;
  if (u.charges <= 0) { killUnit(u); note(u.owner, '건설자가 임무를 모두 마쳤어요.', u.pos, 'info'); }
}
function improve(u, imp) {
  if (u.type !== 'builder' || u.mp <= 0 || !canImprove(u.pos, imp, u.owner)) return false;
  const t = G.tiles[u.pos];
  t.imp = imp;
  if (imp === 'farm') { t.forest = false; boostTech(u.owner, 'irrigation'); }
  if (imp === 'pasture') boostTech(u.owner, 'riding');
  if (imp === 'mine') {
    boostTech(u.owner, 'masonry');
    const n = countImp(u.owner, 'mine');
    if (n >= 2) boostTech(u.owner, 'iron');
    if (n >= 3) boostTech(u.owner, 'apprentice');
  }
  fx(u.pos, IMPROVEMENTS[imp].icon, '#fff');
  useCharge(u);
  if (t.cid != null) assignWorkers(G.cities[t.cid]);
  HOOK.changed();
  return true;
}
function canChop(u) {
  const t = G.tiles[u.pos];
  return u.type === 'builder' && u.mp > 0 && t.forest && t.owner === u.owner && !t.district && !t.wonder && t.city == null && hasTech(u.owner, 'mining');
}
function chop(u) {
  if (!canChop(u)) return false;
  const t = G.tiles[u.pos];
  t.forest = false;
  const c = G.cities[t.cid];
  if (c) { c.carry = (c.carry || 0) + 20; note(u.owner, `벌목으로 ${c.name}에 생산 +20`, u.pos, 'good'); }
  fx(u.pos, '+20⚙️', '#ffb35e');
  useCharge(u);
  HOOK.changed();
  return true;
}

/* ---------- 연구 · 정책 ---------- */
function availableTechs(pid) {
  const p = G.players[pid];
  return Object.keys(TECHS).filter(id => !p.techs[id] && TECHS[id].req.every(r => p.techs[r]));
}
function boostTech(pid, id) {
  const p = G.players[pid];
  if (!p || p.barb || p.techs[id] || p.boosted[id]) return;
  p.boosted[id] = 1;
  p.techProg[id] = (p.techProg[id] || 0) + techCost(id) * 0.4;
  note(pid, `💡 영감! '${TECHS[id].name}' 연구가 40% 앞당겨졌어요.`, -1, 'good', 'boost');
}
function addScience(p, amt) {
  if (!p.research) { p.sciBank = Math.min(60, (p.sciBank || 0) + amt); return; }
  const id = p.research;
  p.techProg[id] = (p.techProg[id] || 0) + amt + (p.sciBank || 0);
  p.sciBank = 0;
  if (p.techProg[id] >= techCost(id)) {
    p.sciBank = Math.min(60, p.techProg[id] - techCost(id));
    p.techs[id] = 1; delete p.techProg[id]; p.research = null;
    note(p.id, `🔬 연구 완료: ${TECHS[id].name} — ${TECHS[id].unlock}`, -1, 'good', 'tech');
    for (const c of citiesOf(p.id)) assignWorkers(c);
  }
}
function researchTurns(p, id, sci) {
  const left = techCost(id) - (p.techProg[id] || 0) - (p.research === id || !p.research ? (p.sciBank || 0) : 0);
  return sci > 0 ? Math.max(1, Math.ceil(left / sci)) : 999;
}
function policyCost(n) { return Math.round((20 + 18 * n + 4 * n * n) * (G.costMul || 1)); }
function addCulture(p, amt) {
  p.cult = (p.cult || 0) + amt;
  const cost = policyCost(p.policies.length);
  if (!p.policyOpts && p.cult >= cost) {
    const pool = Object.keys(POLICIES).filter(id => p.policies.indexOf(id) < 0);
    if (!pool.length) return;
    p.cult -= cost;
    const opts = [];
    while (opts.length < 3 && pool.length) opts.push(pool.splice(ri(pool.length), 1)[0]);
    p.policyOpts = opts;
    note(p.id, '🎭 새 정책을 고를 수 있어요!', -1, 'good');
  }
}
function choosePolicy(pid, id) {
  const p = G.players[pid];
  if (!p.policyOpts || p.policyOpts.indexOf(id) < 0) return false;
  p.policies.push(id); p.policyOpts = null;
  HOOK.changed();
  return true;
}

/* ---------- 외교 ---------- */
function milPower(pid) {
  let s = 0;
  for (const u of G.units) if (u.owner === pid && isMil(u)) s += Math.max(UNITS[u.type].str, UNITS[u.type].rs || 0) * (0.5 + u.hp / 200);
  return s;
}
function declareWar(a, b) {
  if (atWar(a, b)) return;
  G.war[a][b] = G.war[b][a] = G.turn;
  note(a, `${G.players[b].name}에 전쟁을 선포했어요.`, -1, 'bad');
  note(b, `⚔️ ${G.players[a].name}이(가) 전쟁을 선포했어요!`, -1, 'bad', 'war');
  if (a !== 0 && b !== 0 && G.players[0].met[a] && G.players[0].met[b]) note(0, `${G.players[a].name}이(가) ${G.players[b].name}에 전쟁을 선포했어요.`, -1, 'info');
  HOOK.changed();
}
function makePeace(a, b) {
  G.war[a][b] = G.war[b][a] = 0;
  G.peaceTurn[a][b] = G.peaceTurn[b][a] = G.turn;
  note(a, `${G.players[b].name}와(과) 평화 협정을 맺었어요.`, -1, 'good');
  note(b, `${G.players[a].name}와(과) 평화 협정을 맺었어요.`, -1, 'good');
  HOOK.changed();
}
/* 사람이 AI에게 평화를 제안 */
function aiAcceptsPeace(ai, other) {
  const since = G.turn - G.war[ai][other];
  if (since < 8) return false;
  return milPower(ai) < milPower(other) * 1.6 + 20;
}

function playerScore(pid) {
  const p = G.players[pid];
  let s = techCount(pid) * 4 + p.policies.length * 3 + (p.kills || 0);
  for (const c of citiesOf(pid)) s += 8 + c.pop * 3 + Object.keys(c.districts).length * 4 + Object.keys(c.buildings).length * 2 + (c.wonders || []).length * 10;
  if (p.religion) s += 10 + G.cities.filter(c => cityReligion(c) === pid).length * 3;
  return s;
}

/* ---------- 턴 진행 ---------- */
function playerIncome(pid) {
  const tot = { g: 0, s: 0, c: 0, r: 0, t: playerTourism(pid), upkeep: 0 };
  for (const c of citiesOf(pid)) { const y = cityYields(c); tot.g += y.g; tot.s += y.s; tot.c += y.c; tot.r += y.r; }
  const fb = faithBonus(pid); tot.g += fb.g; tot.r += fb.r;
  const mil = unitsOf(pid).filter(isMil).length;
  tot.upkeep = Math.max(0, mil - 2 - (hasPol(pid, 'conscript') ? 2 : 0));
  tot.net = tot.g - tot.upkeep;
  return tot;
}
function beginTurn(pid) {
  const p = G.players[pid];
  for (const u of unitsOf(pid)) {
    if (u.idle) {
      const t = G.tiles[u.pos];
      const heal = t.city != null ? 20 : (t.owner === pid ? 15 : 10);
      if (u.hp < 100) u.hp = Math.min(100, u.hp + heal);
      if (isMil(u)) u.fort = Math.min(2, (u.fort || 0) + 1);
    }
    u.mp = UNITS[u.type].move; u.idle = true; u.skip = false;
  }
  if (p.barb) return;
  recomputeVis(pid);
  if (p.human) {
    for (const u of unitsOf(pid)) {
      if (u.dead) continue;
      if (u.sleep || u.goto != null || u.auto) {
        let threat = false;
        for (const i of within(u.pos, 2)) { const o = UA[i]; if (o && o.owner !== pid && atWar(pid, o.owner) && isMil(o)) threat = true; }
        if (threat && (u.sleep || !isMil(u))) { u.sleep = false; u.goto = null; u.auto = false; note(pid, `${UNITS[u.type].name} 근처에 적이 나타났어요!`, u.pos, 'bad'); continue; }
      }
      if (u.goto != null) moveToward(u, u.goto);
      else if (u.auto) exploreStep(u);
    }
  }
}
function finishTurn(pid) {
  const p = G.players[pid];
  if (p.barb) return;
  let sci = 0, cult = 0, gold = 0, faith = 0;
  for (const c of citiesOf(pid)) { const y = processCity(c); sci += y.s; cult += y.c; gold += y.g; faith += y.r; if (G.over) break; }
  const fb = faithBonus(pid); gold += fb.g; faith += fb.r;
  p.faith = (p.faith || 0) + faith;
  p.cultLife = (p.cultLife || 0) + cult;
  p.tourism = (p.tourism || 0) + playerTourism(pid);
  const mil = unitsOf(pid).filter(isMil).length;
  gold -= Math.max(0, mil - 2 - (hasPol(pid, 'conscript') ? 2 : 0));
  p.gold = Math.max(0, p.gold + gold);
  if (p.gold >= 100) boostTech(pid, 'currency');
  addScience(p, sci * (p.human ? 1 : G.sciMult));
  addCulture(p, cult);
  recomputeVis(pid);
  checkPeacefulVictory(pid);
}

/* ---------- 종교 ---------- */
function religionSlots() { return Math.max(2, majors().length - 1); }
function religionsFounded() { return majors().filter(p => p.religion).length; }
function foundCost() { return Math.round(36 * (G.costMul || 1)); }
function cityReligion(c) {
  let best = null, bv = 0;
  for (const k in c.relP) if (c.relP[k] > bv) { bv = c.relP[k]; best = +k; }
  return bv >= 10 && best >= 0 ? best : null; // -1 = 토착 신앙 (아직 종교 없음)
}
function canFoundReligion(pid) {
  const p = G.players[pid];
  return !p.religion && (p.faith || 0) >= foundCost() && religionsFounded() < religionSlots() && citiesOf(pid).some(c => c.districts.holy != null);
}
function addPressure(c, rid, amt, shrink) {
  if (shrink) for (const k in c.relP) if (+k !== rid) c.relP[k] *= shrink;
  c.relP[rid] = (c.relP[rid] || 0) + amt;
  let sum = 0; for (const k in c.relP) sum += c.relP[k];
  if (sum > 100) for (const k in c.relP) c.relP[k] *= 100 / sum;
}
function foundReligion(pid, name, belief) {
  if (!canFoundReligion(pid) || !BELIEFS[belief]) return false;
  const p = G.players[pid];
  const holy = citiesOf(pid).filter(c => c.districts.holy != null).sort((a, b) => (b.palace ? 1 : 0) - (a.palace ? 1 : 0) || b.pop - a.pop)[0];
  p.faith -= foundCost();
  p.religion = { name: name || RELIGION_NAMES[pid % RELIGION_NAMES.length], belief, holy: holy.id, turn: G.turn };
  for (const c of citiesOf(pid)) addPressure(c, pid, c === holy ? 80 : (c.districts.holy != null ? 40 : 20), 0.5);
  for (const q of majors()) note(q.id, q.id === pid ? `🙏 종교 '${p.religion.name}'을(를) 창시했어요! 성도는 ${holy.name}.` : `${p.name}이(가) 종교 '${p.religion.name}'을(를) 창시했어요.`, q.id === pid ? holy.pos : -1, q.id === pid ? 'good' : 'info', q.id === pid ? 'faith' : '');
  HOOK.changed();
  return true;
}
/* 믿는 도시가 주변 도시에 조금씩 퍼뜨리는 압력 (라운드마다 한 번) */
function spreadPressure() {
  const src = G.cities.map(c => ({ c, r: cityReligion(c) })).filter(x => x.r != null && G.players[x.r].religion);
  for (const { c, r } of src) {
    const holy = G.players[r].religion.holy === c.id;
    const base = (holy ? 1.5 : 0.6) * (c.buildings.temple ? 1.5 : 1);
    for (const o of G.cities) { const d = dist(c.pos, o.pos); if (d <= 6) addPressure(o, r, base / (1 + d / 2)); }
  }
}
function faithBonus(pid) {
  const rel = G.players[pid].religion, out = { g: 0, r: 0 };
  if (!rel) return out;
  let n = 0; for (const c of G.cities) if (cityReligion(c) === pid) n++;
  if (rel.belief === 'tithe') out.g = n * 2;
  if (rel.belief === 'pilgrimage') out.r = n;
  return out;
}
function missionaryCost(pid) { return Math.round((60 + 14 * (G.players[pid].missBought || 0)) * (G.costMul || 1)); }
function missionaryLock(c) {
  const p = G.players[c.owner];
  if (!p.religion) return '종교를 먼저 창시해야 해요';
  if (c.districts.holy == null) return '성지가 있는 도시에서만 살 수 있어요';
  if (!c.buildings.shrine) return '성소 필요';
  return null;
}
function buyMissionary(c) {
  const p = G.players[c.owner], cost = missionaryCost(c.owner);
  if (missionaryLock(c) || (p.faith || 0) < cost || freeSpot(c.pos) < 0) return null;
  const u = addUnit('missionary', c.owner, c.pos);
  if (!u) return null;
  p.faith -= cost; p.missBought = (p.missBought || 0) + 1; u.mp = 0;
  note(c.owner, `${c.name}: 선교사가 길을 떠날 준비를 마쳤어요.`, u.pos, 'good');
  recomputeVis(c.owner); HOOK.changed();
  return u;
}
function spreadTarget(u) {
  if (u.type !== 'missionary' || u.mp <= 0) return null;
  let best = null;
  for (const i of within(u.pos, 1)) { const t = G.tiles[i]; if (t.city != null) { const c = G.cities[t.city]; if ((c.relP[u.rel] || 0) < 75) best = c; } }
  return best;
}
function spreadReligion(u) {
  const c = spreadTarget(u);
  if (!c) return false;
  const before = cityReligion(c);
  const holyOf = majors().find(q => q.religion && q.religion.holy === c.id && q.id !== u.rel); // 다른 종교의 성도는 잘 넘어가지 않음
  addPressure(c, u.rel, holyOf ? 14 : 26, holyOf ? 0.9 : 0.8);
  fx(c.pos, '🙏', '#e9dcff');
  const now = cityReligion(c), R = G.players[u.rel].religion;
  if (now === u.rel && before !== u.rel) {
    note(u.owner, `${c.name}이(가) '${R.name}'을(를) 믿게 됐어요!`, c.pos, 'good', 'faith');
    if (c.owner !== u.owner) note(c.owner, `${c.name}이(가) ${G.players[u.rel].name}의 종교 '${R.name}'(으)로 개종했어요.`, c.pos, 'info');
  }
  u.charges--; u.mp = 0; u.idle = false;
  if (u.charges <= 0) killUnit(u);
  checkPeacefulVictory(u.rel);
  HOOK.changed();
  return true;
}
function religionProgress(pid) {
  const out = [];
  for (const q of majors()) {
    if (!q.alive) continue;
    const cs = citiesOf(q.id);
    if (!cs.length) continue;
    out.push({ pid: q.id, have: cs.filter(c => cityReligion(c) === pid).length, total: cs.length });
  }
  return out;
}

/* ---------- 관광 · 문화 승리 ---------- */
function cityTourism(c) {
  let t = 0;
  for (const b in c.buildings) t += BUILDINGS[b].t || 0;
  for (const w of c.wonders || []) t += WONDERS[w].t || 0;
  const rel = G.players[c.owner].religion;
  if (rel && rel.holy === c.id) t += 2;
  return t;
}
function playerTourism(pid) {
  let t = 0;
  for (const c of citiesOf(pid)) t += cityTourism(c);
  return t * (1 + (hasPol(pid, 'heritage') ? 0.25 : 0) + (fac(pid, 'bella') ? 0.25 : 0));
}
/* 상대의 누적 문화를 내 누적 관광이 넘어서야 함 */
function cultureNeed(qid) { return Math.round((G.players[qid].cultLife || 0) * 0.8 + 250 * (G.costMul || 1)); }
function checkPeacefulVictory(pid) {
  if (G.over) return;
  const p = G.players[pid];
  if (!p || p.barb || !p.alive) return;
  if (!p.human && G.difficulty === 'easy') return; // 입문 난이도: AI는 문화·종교 승리를 하지 않음
  const others = majors().filter(q => q.alive && q.id !== pid);
  if (!others.length) return;
  if ((p.tourism || 0) > 0 && others.every(q => p.tourism >= cultureNeed(q.id))) { G.over = { winner: pid, type: 'culture' }; return; }
  if (p.religion) {
    const pr = religionProgress(pid);
    if (pr.length >= 2 && pr.every(x => x.have * 2 > x.total)) G.over = { winner: pid, type: 'religion' };
  }
}

/* ---------- 유닛 업그레이드 ---------- */
function upgradeTarget(u) {
  const p = G.players[u.owner];
  let id = UNITS[u.type].up, best = null;
  while (id) { const U = UNITS[id]; if ((!U.tech || p.techs[U.tech]) && (!U.res || hasResource(u.owner, U.res))) best = id; id = U.up; }
  return best;
}
function upgradeCost(u, to) { return Math.max(20, Math.round((UNITS[to].cost - UNITS[u.type].cost) * 1.5 * (G.costMul || 1)) + 10); }
function upgradeUnit(u) {
  const to = upgradeTarget(u), p = G.players[u.owner];
  if (!to || u.mp <= 0 || G.tiles[u.pos].owner !== u.owner) return false;
  const cost = upgradeCost(u, to);
  if (p.gold < cost) return false;
  p.gold -= cost; u.type = to; u.mp = 0; u.idle = false;
  fx(u.pos, '⬆', '#ffe9a8');
  recomputeVis(u.owner); HOOK.changed();
  return true;
}

/* 자동 탐험: 가장 가까운 미탐험 경계로 이동 */
function exploreStep(u) {
  const p = G.players[u.owner];
  let guard = 0;
  while (u.mp > 0 && !u.dead && guard++ < 6) {
    const seen = new Uint8Array(M.N); seen[u.pos] = 1;
    let frontier = [u.pos], target = -1;
    search: while (frontier.length) {
      const next = [];
      for (const a of frontier) for (const n of M.nb[a]) {
        if (seen[n]) continue; seen[n] = 1;
        const t = G.tiles[n];
        if (!passable(t) || UA[n] || t.city != null) continue;
        if (M.nb[n].some(m => { const o = UA[m]; return o && o.owner !== u.owner && isMil(o) && atWar(u.owner, o.owner) && p.vis[m]; })) continue; // 적 옆은 피함
        if (t.village || M.nb[n].some(m => !p.explored[m])) { target = n; break search; }
        next.push(n);
      }
      frontier = next;
    }
    if (target < 0) { u.auto = false; if (p.human) note(u.owner, `${UNITS[u.type].name}: 더 탐험할 곳이 없어요.`, u.pos, 'info'); return false; }
    const before = u.pos;
    moveToward(u, target, false);
    if (u.pos === before) break;
  }
  return true;
}

function endTurn() {
  if (G.over) return;
  finishTurn(0);
  for (let i = 1; i < G.players.length && !G.over; i++) {
    const p = G.players[i];
    if (!p.alive) continue;
    G.cur = i;
    beginTurn(i);
    if (p.barb) barbTurn(i); else aiTurn(i);
    finishTurn(i);
  }
  G.cur = 0;
  if (!G.over) spreadPressure();
  G.turn++;
  if (!G.over && G.turn > G.maxTurn) {
    const best = majors().filter(p => p.alive).sort((a, b) => playerScore(b.id) - playerScore(a.id))[0];
    G.over = { winner: best.id, type: 'score' };
  }
  if (!G.over) beginTurn(0);
  HOOK.changed();
}

/* ---------- 지도 생성 ---------- */
function makeNoise(W, H, scale) {
  const gw = Math.ceil((W + 1) / scale) + 2, gh = Math.ceil((H + 1) / scale) + 2, g = [];
  for (let i = 0; i < gw * gh; i++) g.push(rnd());
  return (x, y) => {
    const fx_ = x / scale, fy = y / scale, x0 = Math.floor(fx_), y0 = Math.floor(fy);
    const tx = fx_ - x0, ty = fy - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = g[y0 * gw + x0], b = g[y0 * gw + x0 + 1], c = g[(y0 + 1) * gw + x0], d = g[(y0 + 1) * gw + x0 + 1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}
function quantile(arr, q) { const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)))]; }

function genMap(W, H, nMajors) {
  buildGeom(W, H);
  const N = M.N;
  const pxy = i => { const c = i % W, r = (i / W) | 0; return [c + 0.5 * (r & 1), r * 0.866]; };
  const n1 = makeNoise(W, H, 5.5), n2 = makeNoise(W, H, 2.7), n3 = makeNoise(W, H, 1.4);
  const nM = makeNoise(W, H, 2.0), nH = makeNoise(W, H, 2.2), nF = makeNoise(W, H, 2.4), nW = makeNoise(W, H, 4.5), nL = makeNoise(W, H, 3);
  const ev = new Array(N);
  for (let i = 0; i < N; i++) {
    const [x, y] = pxy(i), col = i % W, row = (i / W) | 0;
    const dx = (x - W / 2) / (W / 2), dy = (y - H * 0.433) / (H * 0.433);
    ev[i] = 0.6 * n1(x, y) + 0.28 * n2(x, y) + 0.12 * n3(x, y) - 0.5 * (dx * dx * 0.9 + dy * dy * 1.1);
    if (col === 0 || col === W - 1 || row === 0 || row === H - 1) ev[i] = -9;
  }
  const thr = quantile(ev, 0.42);
  const tiles = new Array(N);
  const land = [];
  for (let i = 0; i < N; i++) {
    tiles[i] = { t: 'ocean', hill: false, forest: false, res: null, imp: null, owner: -1, cid: null, city: null, district: null, camp: false, village: false };
    if (ev[i] > thr) land.push(i);
  }
  const mv = land.map(i => nM(...pxy(i))), hv = land.map(i => nH(...pxy(i)));
  const mThr = quantile(mv, 0.9), hThr = quantile(hv, 0.74);
  land.forEach((i, k) => {
    const [x, y] = pxy(i), row = (i / W) | 0, t = tiles[i];
    const lat = Math.abs(row - (H - 1) / 2) / ((H - 1) / 2) + (nL(x, y) - 0.5) * 0.3;
    const wet = nW(x, y);
    if (mv[k] > mThr) { t.t = 'mountain'; return; }
    if (lat > 0.8) t.t = 'tundra';
    else if (wet < 0.29 && lat < 0.6) t.t = 'desert';
    else if (wet > 0.52) t.t = 'grass';
    else t.t = 'plains';
    if (hv[k] > hThr) t.hill = true;
    const fv = nF(x, y);
    if (t.t !== 'desert' && fv > (t.t === 'tundra' ? 0.62 : 0.54) && rnd() < 0.8) t.forest = true;
  });
  // 호수: 바다와 이어지지 않은 물 + 내륙에 몇 개 추가
  const seaSeen = new Uint8Array(N);
  let fr = [];
  for (let i = 0; i < N; i++) { const c = i % W, r = (i / W) | 0; if ((c === 0 || r === 0 || c === W - 1 || r === H - 1)) { seaSeen[i] = 1; fr.push(i); } }
  while (fr.length) { const nx = []; for (const a of fr) for (const n of M.nb[a]) if (!seaSeen[n] && tiles[n].t === 'ocean') { seaSeen[n] = 1; nx.push(n); } fr = nx; }
  for (let i = 0; i < N; i++) if (tiles[i].t === 'ocean' && !seaSeen[i]) tiles[i].t = 'lake';
  const lakes = [];
  for (let i = 0; i < N; i++) if (tiles[i].t === 'lake') lakes.push(i);
  let want = Math.max(3, Math.round(N / 80)), tries = 0;
  while (want > 0 && tries++ < 400) {
    const i = pick(land), t = tiles[i];
    if (t.t === 'mountain' || isWater(t)) continue;
    if (M.nb[i].length < 6 || M.nb[i].some(n => isWater(tiles[n]))) continue;
    if (lakes.some(l => dist(l, i) < 4)) continue;
    t.t = 'lake'; t.hill = false; t.forest = false; lakes.push(i); want--;
  }
  for (let i = 0; i < N; i++) if (tiles[i].t === 'ocean' && M.nb[i].some(n => !isWater(tiles[n]))) tiles[i].t = 'coast';
  G.tiles = tiles;
  // 가장 큰 대륙
  const comp = new Int32Array(N).fill(-1); let best = -1, bestSize = 0, nc = 0;
  for (let i = 0; i < N; i++) {
    if (comp[i] >= 0 || !passable(tiles[i])) continue;
    let size = 0, f = [i]; comp[i] = nc;
    while (f.length) { const nx = []; for (const a of f) { size++; for (const n of M.nb[a]) if (comp[n] < 0 && passable(tiles[n])) { comp[n] = nc; nx.push(n); } } f = nx; }
    if (size > bestSize) { bestSize = size; best = nc; }
    nc++;
  }
  const main = []; for (let i = 0; i < N; i++) if (comp[i] === best) main.push(i);
  if (main.length < N * 0.3) return null;
  // 자원
  for (let i = 0; i < N; i++) {
    const t = tiles[i];
    if (t.t === 'mountain' || t.t === 'ocean' || t.t === 'lake') continue;
    if (t.t === 'coast') { if (rnd() < 0.1) t.res = 'fish'; continue; }
    if (rnd() > 0.15) continue;
    const r = rnd();
    if (t.hill) t.res = t.forest ? null : (r < 0.4 ? 'stone' : r < 0.75 ? 'iron' : 'gems');
    else if (t.forest) t.res = t.t === 'tundra' ? null : (r < 0.7 ? 'spices' : null);
    else if (t.t === 'grass') t.res = r < 0.4 ? 'wheat' : r < 0.75 ? 'cattle' : 'horses';
    else if (t.t === 'plains') t.res = r < 0.35 ? 'wheat' : r < 0.65 ? 'horses' : r < 0.85 ? 'cattle' : 'stone';
    else if (t.t === 'desert') t.res = r < 0.5 ? 'stone' : null;
    else if (t.t === 'tundra') t.res = r < 0.4 ? 'iron' : null;
  }
  // 시작 위치
  const cand = main.filter(i => { const c = i % W, r = (i / W) | 0; return c > 1 && r > 1 && c < W - 2 && r < H - 2 && !tiles[i].res; });
  const scores = new Map(cand.map(i => [i, siteScore(i, null)]));
  const good = cand.filter(i => scores.get(i) >= quantile([...scores.values()], 0.55));
  let bestSet = null, bestVal = -1;
  for (let k = 0; k < 400; k++) {
    const set = [];
    for (let j = 0; j < nMajors; j++) set.push(pick(good));
    let minD = 99, sum = 0;
    for (let a = 0; a < set.length; a++) { sum += scores.get(set[a]); for (let b = a + 1; b < set.length; b++) minD = Math.min(minD, dist(set[a], set[b])); }
    if (minD < 8) continue;
    const val = Math.min(minD, 14) * 3 + sum / nMajors * 0.4;
    if (val > bestVal) { bestVal = val; bestSet = set; }
  }
  if (!bestSet) return null;
  for (const s of bestSet) { tiles[s].hill = false; tiles[s].forest = false; if (tiles[s].t === 'desert' || tiles[s].t === 'tundra') tiles[s].t = 'plains'; }
  // 야영지 · 유적
  const camps = [], villages = [];
  const wantCamps = nMajors + 1, wantVill = Math.round(N / 55);
  tries = 0;
  while (camps.length < wantCamps && tries++ < 600) {
    const i = pick(main);
    if (bestSet.some(s => dist(s, i) < 7) || camps.some(c => dist(c, i) < 5) || tiles[i].res) continue;
    camps.push(i); tiles[i].camp = true;
  }
  tries = 0;
  while (villages.length < wantVill && tries++ < 600) {
    const i = pick(main);
    if (tiles[i].camp || bestSet.some(s => dist(s, i) < 3) || villages.some(v => dist(v, i) < 3) || camps.some(c => dist(c, i) < 2)) continue;
    villages.push(i); tiles[i].village = true;
  }
  return { starts: bestSet, camps };
}

function newGame(opts) {
  opts = opts || {};
  const nAI = Math.max(1, Math.min(5, opts.numAI || 2));
  const nMajors = nAI + 1;
  const size = { 2: [24, 16], 3: [30, 19], 4: [34, 22], 5: [38, 24], 6: [42, 26] }[nMajors];
  const len = GAME_LENGTH[opts.length] || GAME_LENGTH.standard;
  let seed = (opts.seed == null ? (Date.now() & 0x7fffffff) : opts.seed) | 0;
  let gen = null;
  for (let attempt = 0; attempt < 40 && !gen; attempt++) {
    G = { v: 2, seed, rng: seed + attempt * 7919, W: size[0], H: size[1], turn: 1, cur: 0, tiles: null, units: [], cities: [], players: [], camps: [], nextId: 1, over: null,
          difficulty: opts.difficulty || 'easy', war: [], peaceTurn: [], wonders: {}, maxTurn: len.turns, costMul: len.mul, length: opts.length || 'standard' };
    gen = genMap(size[0], size[1], nMajors);
  }
  if (!gen) throw new Error('지도 생성 실패');
  G.aiMult = { easy: 0.8, normal: 1, hard: 1.25 }[G.difficulty] || 1;
  G.sciMult = { easy: 0.7, normal: 1, hard: 1.15 }[G.difficulty] || 1;
  NOTES.length = 0;
  const humanF = opts.faction || 'astel';
  const others = FACTIONS.filter(f => f.id !== humanF);
  for (let i = others.length - 1; i > 0; i--) { const j = ri(i + 1); [others[i], others[j]] = [others[j], others[i]]; }
  const facs = [FACTIONS.find(f => f.id === humanF)].concat(others.slice(0, nAI));
  facs.forEach((F, i) => {
    G.players.push({ id: i, name: F.name, leader: F.leader, faction: F.id, color: F.color, dark: F.dark, focus: F.focus, human: i === 0, alive: true, barb: false, faith: 0, religion: null, tourism: 0, cultLife: 0, missBought: 0,
      gold: 10, research: null, techs: {}, techProg: {}, boosted: {}, sciBank: 0, cult: 0, policies: [], policyOpts: null,
      explored: new Array(M.N).fill(0), met: {}, founded: false, cityCount: 0, kills: 0, ai: {} });
  });
  G.players.push({ id: nMajors, name: BARB.name, faction: 'barb', color: BARB.color, dark: BARB.dark, human: false, alive: true, barb: true,
    gold: 0, techs: {}, techProg: {}, boosted: {}, policies: [], explored: [], met: {}, ai: {} });
  for (let a = 0; a <= nMajors; a++) { G.war.push(new Array(nMajors + 1).fill(0)); G.peaceTurn.push(new Array(nMajors + 1).fill(-99)); }
  UA = new Array(M.N).fill(null);
  gen.starts.forEach((s, i) => { addUnit('settler', i, s); addUnit('warrior', i, s); });
  G.camps = gen.camps.map(pos => ({ pos, cd: (G.difficulty === 'easy' ? 14 : 6) + ri(5) }));
  G.campTarget = G.camps.length;
  G.peaceOffer = null;
  for (const c of G.camps) { const u = addUnit('warrior', nMajors, c.pos); if (u) u.guard = true; }
  for (let i = 0; i < nMajors; i++) recomputeVis(i);
  beginTurn(0);
  return G;
}

/* ---------- 저장 / 불러오기 ---------- */
function serialize() {
  return JSON.stringify(G, (k, v) => (k === 'vis' ? undefined : v));
}
function deserialize(str) {
  const g = JSON.parse(str);
  if (!g || g.v !== 2 || !g.tiles) throw new Error('저장 데이터가 올바르지 않아요');
  G = g;
  buildGeom(G.W, G.H);
  rebuildUA();
  NOTES.length = 0;
  for (const p of G.players) if (!p.barb) recomputeVis(p.id);
  return G;
}
