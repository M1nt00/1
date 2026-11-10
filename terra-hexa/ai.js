'use strict';
/* 테라 헥사 — AI 세력과 약탈자 */

function enemiesNear(pid, pos, r) {
  const out = [];
  for (const i of within(pos, r)) { const u = UA[i]; if (u && u.owner !== pid && atWar(pid, u.owner)) out.push(u); }
  return out;
}
function nearestOwnCity(pid, pos) {
  let best = null, bd = 1e9;
  for (const c of G.cities) if (c.owner === pid) { const d = dist(c.pos, pos); if (d < bd) { bd = d; best = c; } }
  return best;
}

/* 공격 기대값 평가 후 가장 좋은 대상을 공격. 공격했으면 true */
function aiTryAttack(u, aggressive, noLeave) {
  const U = UNITS[u.type], targets = attackTargets(u);
  if (!targets.length) return false;
  const ranged = !!U.rs;
  let best = -1, bs = aggressive ? -12 : 0;
  for (const i of targets) {
    const t = G.tiles[i];
    let s;
    if (t.city != null) {
      const c = G.cities[t.city];
      if (G.players[u.owner].barb && c.hp > 120 && !ranged) continue;
      const dealt = rawDmg(unitStr(u, { ranged }) + (U.cls === 'siege' ? 10 : 0), cityStr(c));
      const taken = ranged ? 0 : rawDmg(cityStr(c), unitStr(u, {})) * 0.8;
      if (!ranged && taken >= u.hp && c.hp > dealt) continue;
      s = dealt * 0.8 - taken * 0.7 + (c.hp <= dealt * 1.5 ? 25 : 0) + 4;
    } else {
      const d = UA[i];
      if (!isMil(d)) { if (noLeave) continue; s = 30; }
      else {
        const sA = unitStr(u, { ranged, vs: d }) + (ranged ? 0 : flankBonus(u, i));
        const sD = unitStr(d, { defending: true, vs: u });
        const dealt = rawDmg(sA, sD), taken = ranged ? 0 : rawDmg(sD, sA);
        if (!ranged && taken >= u.hp - 5 && dealt < d.hp) continue;
        if (noLeave && !ranged && dealt >= d.hp) continue; // 주둔군은 도시를 비우지 않음
        s = dealt - taken * 0.85 + (dealt >= d.hp ? 30 : 0);
      }
    }
    if (s > bs) { bs = s; best = i; }
  }
  if (best < 0) return false;
  return attack(u, best);
}

/* dest에 인접할 때까지 접근 */
function aiApproach(u, dest) {
  if (dist(u.pos, dest) <= 1) return false;
  return moveToward(u, dest, false);
}

/* ---------- 약탈자 ---------- */
function barbTurn(pid) {
  const easy = G.difficulty === 'easy';
  // 스폰
  for (const camp of G.camps) {
    camp.cd--;
    if (camp.cd > 0) continue;
    camp.cd = (easy ? 12 : 8) + ri(5);
    const mine = G.units.filter(u => u.owner === pid && u.home === camp.pos).length;
    const cap = 1 + (G.turn > 30 ? 1 : 0) + (G.turn > 70 && !easy ? 1 : 0);
    if (mine >= cap) continue;
    let type = 'warrior';
    const r = rnd();
    if (G.turn > 90) type = r < 0.5 ? 'swordsman' : r < 0.8 ? 'archer' : 'spearman';
    else if (G.turn > 45) type = r < 0.4 ? 'spearman' : r < 0.7 ? 'archer' : 'warrior';
    else if (G.turn > 20 && r < 0.25) type = 'archer';
    const u = addUnit(type, pid, camp.pos);
    if (u) { u.home = camp.pos; u.guard = u.pos === camp.pos; }
  }
  // 새 야영지
  if (G.turn % 14 === 0 && G.camps.length < G.campTarget) {
    for (let k = 0; k < 60; k++) {
      const i = ri(M.N), t = G.tiles[i];
      if (!passable(t) || t.owner >= 0 || t.camp || t.res || UA[i]) continue;
      if (G.players.some(p => !p.barb && p.vis && p.vis[i])) continue;
      if (G.cities.some(c => dist(c.pos, i) < 5) || G.camps.some(c => dist(c.pos, i) < 5)) continue;
      t.camp = true; G.camps.push({ pos: i, cd: 3 });
      const u = addUnit('warrior', pid, i); if (u) { u.home = i; u.guard = true; }
      break;
    }
  }
  for (const u of unitsOf(pid)) {
    if (u.dead) continue;
    if (u.guard) { if (!G.tiles[u.pos].camp) u.guard = false; else { aiTryAttack(u, true, true); continue; } }
    if (aiTryAttack(u, true)) continue;
    // 가까운 목표로 이동
    let target = -1, bd = easy ? 5 : 7;
    for (const o of G.units) if (o.owner !== pid) { const d = dist(o.pos, u.pos); if (d < bd) { bd = d; target = o.pos; } }
    for (const c of G.cities) { const d = dist(c.pos, u.pos); if (d < bd - 1) { bd = d; target = c.pos; } }
    if (easy && G.turn < 20) target = -1;
    if (target >= 0) { aiApproach(u, target); if (!u.dead) aiTryAttack(u, true); }
    else {
      const opts = M.nb[u.pos].filter(n => passable(G.tiles[n]) && !UA[n] && G.tiles[n].city == null && (u.home == null || dist(n, u.home) <= 3));
      if (opts.length && rnd() < 0.6) stepUnit(u, pick(opts));
    }
  }
}

/* ---------- AI 세력 ---------- */
const AI_TECH_PRIO = ['pottery', 'mining', 'husbandry', 'writing', 'archery', 'bronze', 'masonry', 'irrigation', 'currency', 'drama', 'engineering',
  'education', 'iron', 'apprentice', 'riding', 'astronomy', 'machinery', 'theory'];

function aiBestSite(pid, from) {
  let best = -1, bs = -1e9;
  for (const i of within(from, 9)) {
    if (!canFoundAt(i, pid) || UA[i] && UA[i].owner !== pid) continue;
    const d = dist(i, from);
    let s = siteScore(i, pid) - d * 0.9;
    const near = nearestOwnCity(pid, i);
    if (near) { const nd = dist(near.pos, i); if (nd <= 6) s += 4; }
    if (enemiesNear(pid, i, 2).some(isMil)) s -= 20;
    if (s > bs) { bs = s; best = i; }
  }
  return bs > 14 ? best : -1;
}

function aiSettler(u, p) {
  if (!p.founded) { if (!canFoundAt(u.pos, u.owner)) { const s = aiBestSite(u.owner, u.pos); if (s >= 0) { moveToward(u, s, false); if (u.pos !== s) return; } } foundCity(u); return; }
  let target = p.ai.site;
  if (target == null || target < 0 || !canFoundAt(target, u.owner)) {
    const cap = citiesOf(u.owner)[0];
    target = aiBestSite(u.owner, cap ? cap.pos : u.pos);
    p.ai.site = target;
  }
  if (target < 0) { if (canFoundAt(u.pos, u.owner)) foundCity(u); return; }
  if (u.pos === target) { foundCity(u); p.ai.site = -1; return; }
  const before = u.pos;
  moveToward(u, target, false);
  if (u.dead) return;
  if (u.pos === target && u.mp > 0) { foundCity(u); p.ai.site = -1; }
  else if (u.pos === before) { p.ai.stuck = (p.ai.stuck || 0) + 1; if (p.ai.stuck > 3) { p.ai.site = -1; p.ai.stuck = 0; if (canFoundAt(u.pos, u.owner)) foundCity(u); } }
}

function aiImprovableTiles(pid) {
  const out = [];
  for (const c of citiesOf(pid)) for (const i of c.tiles) {
    const t = G.tiles[i];
    if (t.imp || dist(i, c.pos) > 3) continue;
    const opts = improveOptions(i, pid);
    if (opts.length) out.push({ i, imp: opts[0], w: (resVisible(t, pid) ? 5 : 0) + (c.worked.indexOf(i) >= 0 ? 3 : 0) - dist(i, c.pos) });
  }
  return out;
}
function aiBuilder(u, p) {
  if (enemiesNear(u.owner, u.pos, 2).some(isMil)) {
    const c = nearestOwnCity(u.owner, u.pos);
    if (c && c.pos !== u.pos) moveToward(u, c.pos, false);
    return;
  }
  const here = G.tiles[u.pos];
  if (!here.imp) { const o = improveOptions(u.pos, u.owner); if (o.length) { improve(u, o[0]); return; } }
  const list = aiImprovableTiles(u.owner).filter(x => !UA[x.i] || UA[x.i] === u);
  if (!list.length) return;
  let best = null, bs = -1e9;
  for (const x of list) { const s = x.w - dist(x.i, u.pos) * 1.2; if (s > bs) { bs = s; best = x; } }
  moveToward(u, best.i, false);
  if (!u.dead && u.pos === best.i && u.mp > 0) improve(u, best.imp);
}

function aiMilitary(u, p, ctx) {
  const pid = u.owner, U = UNITS[u.type];
  const garrisonOf = ctx.garrison.get(u.id);
  if (aiTryAttack(u, false, !!garrisonOf)) return;
  if (garrisonOf) {
    if (u.pos !== garrisonOf.pos) { if (!UA[garrisonOf.pos]) moveToward(u, garrisonOf.pos, false); else aiApproach(u, garrisonOf.pos); }
    return;
  }
  if (u.hp < 45) { // 후퇴해서 회복
    const c = nearestOwnCity(pid, u.pos);
    if (c && dist(c.pos, u.pos) > 1) aiApproach(u, c.pos);
    return;
  }
  // 영토 근처 위협 요격
  let target = -1, bd = 1e9;
  for (const o of G.units) {
    if (o.owner === pid || !atWar(pid, o.owner)) continue;
    const c = nearestOwnCity(pid, o.pos);
    if (!c || dist(c.pos, o.pos) > 5) continue;
    const d = dist(o.pos, u.pos);
    if (d < bd && d <= 8) { bd = d; target = o.pos; }
  }
  // 전쟁 목표 도시
  if (target < 0 && ctx.warTarget && ctx.army >= 3) target = ctx.warTarget.pos;
  // 가까운 야영지
  if (target < 0) {
    for (const c of G.camps) {
      const near = nearestOwnCity(pid, c.pos);
      if (near && dist(near.pos, c.pos) <= 7) { const d = dist(c.pos, u.pos); if (d < bd) { bd = d; target = c.pos; } }
    }
  }
  if (target >= 0) {
    if (U.rs) { if (dist(u.pos, target) > U.range) moveToward(u, target, false); }
    else if (!UA[target] && G.tiles[target].city == null) moveToward(u, target, false);
    else aiApproach(u, target);
    if (!u.dead) aiTryAttack(u, false);
    return;
  }
  // 할 일 없음: 영토 가장자리에서 대기
  if (u.type === 'scout') { exploreStep(u); return; }
  const c = nearestOwnCity(pid, u.pos);
  if (c && dist(c.pos, u.pos) > 3) aiApproach(u, c.pos);
}

function aiDiplomacy(p) {
  const pid = p.id, easy = G.difficulty === 'easy', hard = G.difficulty === 'hard';
  const myPow = milPower(pid);
  for (const q of majors()) {
    if (q.id === pid || !q.alive || !p.met[q.id]) continue;
    if (atWar(pid, q.id)) {
      const since = G.turn - G.war[pid][q.id];
      if (since >= 12 && rnd() < 0.12 && myPow < milPower(q.id) * 1.3 + 15) {
        if (q.human) { G.peaceOffer = pid; note(0, `🕊️ ${p.name}이(가) 평화를 제안했어요. 외교 창에서 답할 수 있어요.`, -1, 'good'); }
        else makePeace(pid, q.id);
      }
      continue;
    }
    if (G.turn - G.peaceTurn[pid][q.id] < 20) continue;
    const minTurn = q.human ? (easy ? 9999 : hard ? 30 : 45) : 35;
    if (G.turn < minTurn) continue;
    if (majors().some(o => o.id !== pid && o.alive && atWar(pid, o.id))) continue;
    const close = citiesOf(pid).some(a => citiesOf(q.id).some(b => dist(a.pos, b.pos) <= 10));
    if (close && myPow > milPower(q.id) * 1.5 + 30 && rnd() < (hard ? 0.07 : 0.035)) declareWar(pid, q.id);
  }
}

function aiPickMilitary(c, opts, p) {
  const av = opts.filter(o => o.kind === 'unit' && !o.lock && UNITS[o.id].cls !== 'civ' && o.id !== 'scout');
  if (!av.length) return null;
  const mil = unitsOf(p.id).filter(isMil);
  const rangedN = mil.filter(u => UNITS[u.type].rs).length;
  const wantRanged = rangedN < mil.length * 0.4;
  const atWarNow = majors().some(o => o.id !== p.id && o.alive && atWar(p.id, o.id));
  let best = null, bs = -1;
  for (const o of av) {
    const U = UNITS[o.id];
    let s = Math.max(U.str, U.rs || 0);
    if (U.cls === 'siege') s = atWarNow && !mil.some(u => u.type === 'catapult') ? 45 : 5;
    if (!!U.rs === wantRanged) s += 8;
    if (s > bs) { bs = s; best = o; }
  }
  return best;
}

function aiChooseProd(c, p, ctx) {
  const pid = p.id, opts = cityOptions(c), ok = key => opts.find(o => o.key === key && !o.lock);
  const set = o => setProduction(c, o);
  const myCities = citiesOf(pid), n = myCities.length;
  const us = unitsOf(pid), mil = us.filter(isMil);
  const queued = id => myCities.some(x => x.prodItem && x.prodItem.kind === 'unit' && x.prodItem.id === id);
  const atWarNow = !!ctx.warTarget || majors().some(o => o.id !== pid && o.alive && atWar(pid, o.id));
  const threat = enemiesNear(pid, c.pos, 4).filter(isMil).length;
  const income = playerIncome(pid).net;
  const milWant = n + 1 + (atWarNow ? 3 : 0) + (G.turn > 50 ? 1 : 0) + (G.turn > 100 ? 1 : 0) + (G.difficulty === 'hard' ? 1 : 0);

  if ((mil.length < Math.min(milWant, n + 1) || (threat && mil.length < milWant + 1)) && income > -2) { const m = aiPickMilitary(c, opts, p); if (m && set(m)) return; }
  if (n === 1 && G.turn < 12 && !us.some(u => u.type === 'scout') && !queued('scout') && ok('unit:scout') && set(ok('unit:scout'))) return;
  const maxCities = G.players.length - 1 <= 2 ? 4 : 4;
  if (n < maxCities && c.pop >= 2 && !us.some(u => u.type === 'settler') && !queued('settler') && ok('unit:settler')) {
    const cap = myCities[0];
    if (aiBestSite(pid, cap.pos) >= 0 && set(ok('unit:settler'))) return;
  }
  if (!us.some(u => u.type === 'builder') && !queued('builder') && aiImprovableTiles(pid).length >= 2 && ok('unit:builder') && set(ok('unit:builder'))) return;
  if (ok('building:monument') && set(ok('building:monument'))) return;
  if (mil.length < milWant && income > 0 && rnd() < 0.5) { const m = aiPickMilitary(c, opts, p); if (m && set(m)) return; }
  if (!(G.difficulty === 'easy' && G.turn < 140) && ok('project:observatory') && set(ok('project:observatory'))) return;
  for (const d of ['campus', 'commerce', 'industry', 'culture']) {
    const o = ok('district:' + d);
    if (o) { const sites = districtSites(c, d); if (sites.length && setProduction(c, { kind: 'district', id: d, tile: sites[0].idx })) return; }
  }
  const order = ['granary', 'library', 'market', 'workshop', 'university', 'theater', 'factory'];
  if (threat || atWarNow) order.unshift('walls'); else order.push('walls');
  for (const b of order) { const o = ok('building:' + b); if (o && set(o)) return; }
  if (mil.length < milWant + 1 && income > 1) { const m = aiPickMilitary(c, opts, p); if (m && set(m)) return; }
  set(ok('project:wealth'));
}

function aiTurn(pid) {
  const p = G.players[pid];
  // 연구 · 정책
  if (!p.research) {
    const av = availableTechs(pid);
    if (av.length) {
      let best = av[0], bs = 1e9;
      for (const id of av) { const s = AI_TECH_PRIO.indexOf(id) + rnd() * 3 - (p.boosted[id] ? 2 : 0); if (s < bs) { bs = s; best = id; } }
      p.research = best;
    }
  }
  if (p.policyOpts) choosePolicy(pid, pick(p.policyOpts));
  aiDiplomacy(p);

  // 전쟁 목표: 가장 가까운 적 도시
  const ctx = { garrison: new Map(), warTarget: null, army: 0 };
  const myCities = citiesOf(pid);
  let bd = 1e9;
  for (const c of G.cities) {
    if (c.owner === pid || G.players[c.owner].barb || !atWar(pid, c.owner)) continue;
    for (const m of myCities) { const d = dist(m.pos, c.pos); if (d < bd) { bd = d; ctx.warTarget = c; } }
  }
  // 주둔군 배정: 도시마다 가장 가까운 군사 유닛 1기
  const mil = unitsOf(pid).filter(u => isMil(u) && u.type !== 'scout');
  const free = mil.slice();
  for (const c of myCities) {
    if (!free.length) break;
    let bi = 0;
    for (let k = 1; k < free.length; k++) {
      const a = free[k], b = free[bi];
      const sa = dist(a.pos, c.pos) - (UNITS[a.type].rs ? 2 : 0), sb = dist(b.pos, c.pos) - (UNITS[b.type].rs ? 2 : 0);
      if (sa < sb) bi = k;
    }
    ctx.garrison.set(free[bi].id, c);
    free.splice(bi, 1);
  }
  ctx.army = free.length;

  for (const u of unitsOf(pid)) {
    if (u.dead || u.owner !== pid) continue;
    if (u.type === 'settler') aiSettler(u, p);
    else if (u.type === 'builder') aiBuilder(u, p);
    else if (u.type === 'scout' && !ctx.warTarget) { if (!aiTryAttack(u, false)) exploreStep(u); }
    else aiMilitary(u, p, ctx);
    if (G.over) return;
  }
  for (const c of citiesOf(pid)) if (!c.prodItem) aiChooseProd(c, p, ctx);
  // 남는 금으로 구매
  if (p.gold > 120) {
    for (const c of citiesOf(pid)) {
      if (!c.prodItem) continue;
      const cost = buyCost(c, c.prodItem);
      if (cost != null && cost < p.gold - 30) { buyItem(c, c.prodItem); break; }
    }
  }
}
