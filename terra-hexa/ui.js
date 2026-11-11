'use strict';
/* 테라 헥사 — 화면: 지도 렌더링, 입력, 패널, 길잡이 */
(function () {
  const $ = id => document.getElementById(id);
  const cv = $('map'), cx = cv.getContext('2d');
  const S = HEX, SQ3 = Math.sqrt(3), CORN = ART.CORN;
  const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  const UIFONT = getComputedStyle(document.body).fontFamily;
  const SAVE_KEY = 'terrahexa.save.v2';

  let cam = { x: 0, y: 0, z: 1 }, camTo = null, dpr = 1, vw = 0, vh = 0;
  let sel = null, reach = null, targets = [], placing = null, hover = -1, hoverPath = null, infoTile = -1, showYields = false;
  let fxList = [], dirty = true, uiDirty = true, busy = false, started = false;
  let lastQuest = -1;
  let logItems = [], history = [], advisorOpen = true, lockedOpen = false, toastTimer = 0, modalOnClose = null, modalSticky = false;
  const setupSel = { faction: 'astel', numAI: 2, difficulty: 'easy', length: 'standard' };

  const H = () => G.players[0];
  const fmt = x => String(Math.round(x * 10) / 10);
  const sign = x => (x >= 0 ? '+' : '') + fmt(x);
  const narrow = () => window.innerWidth <= 760;

  HOOK.changed = () => { dirty = true; uiDirty = true; };

  /* ---------- 좌표 ---------- */
  function tc(i) { const c = i % G.W, r = (i / G.W) | 0; return [S * SQ3 * (c + 0.5 * (r & 1)), S * 1.5 * r]; }
  function toScreen(x, y) { return [(x - cam.x) * cam.z + vw / 2, (y - cam.y) * cam.z + vh / 2]; }
  function tileAt(sx, sy) {
    const wx = (sx - vw / 2) / cam.z + cam.x, wy = (sy - vh / 2) / cam.z + cam.y;
    const q = (SQ3 / 3 * wx - wy / 3) / S, r = (2 / 3 * wy) / S;
    let rx = Math.round(q), rz = Math.round(r), ry = Math.round(-q - r);
    const dx = Math.abs(rx - q), dz = Math.abs(rz - r), dy = Math.abs(ry + q + r);
    if (dx > dy && dx > dz) rx = -ry - rz; else if (dy <= dz) rz = -rx - ry;
    return M.idx(rx, rz);
  }
  function clampCam() {
    const maxX = S * SQ3 * (G.W - 0.5), maxY = S * 1.5 * (G.H - 1);
    cam.x = Math.max(0, Math.min(maxX, cam.x)); cam.y = Math.max(0, Math.min(maxY, cam.y));
  }
  function centerOn(i, smooth) {
    const [x, y] = tc(i);
    const oy = narrow() && sel && sel.type === 'city' ? vh * 0.22 / cam.z : 0;
    if (smooth) camTo = { x, y: y + oy }; else { cam.x = x; cam.y = y + oy; camTo = null; clampCam(); }
    dirty = true;
  }
  function ensureVisible(i) {
    const [x, y] = tc(i), [sx, sy] = toScreen(x, y);
    if (sx < 90 || sx > vw - 90 || sy < 130 || sy > vh - 230) centerOn(i, true);
  }
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    vw = cv.clientWidth; vh = cv.clientHeight;
    cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
    dirty = true;
  }

  /* ---------- 그리기 ---------- */
  const hexPath = (x, y, k) => ART.hex(cx, x, y, k);
  function emoji(ch, x, y, size) { cx.font = `${size}px ${EMOJI}`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillStyle = '#fff'; cx.fillText(ch, x, y + size * 0.06); }
  function badge(ch, x, y) {
    cx.beginPath(); cx.arc(x, y, S * 0.25, 0, 7); cx.fillStyle = 'rgba(14,19,29,.72)'; cx.fill();
    cx.strokeStyle = 'rgba(255,255,255,.55)'; cx.lineWidth = 1.2; cx.stroke();
    emoji(ch, x, y, S * 0.33);
  }
  const lum = ART.lum;

  /* 지형은 지도 전체를 한 번 그려 두고 재사용 (숲·개발 시설이 바뀔 때만 다시 그림) */
  let tcache = null;
  function terrainSig() {
    let h = G.seed | 0;
    for (let i = 0; i < M.N; i++) { const t = G.tiles[i]; h = (Math.imul(h, 31) + (t.forest ? 1 : 0) + (t.hill ? 2 : 0) + (t.imp ? t.imp.charCodeAt(0) * 4 : 0) + t.t.charCodeAt(0) * 1024 + (t.res === 'wheat' ? 7 : 0)) | 0; }
    return h + ':' + M.N + ':' + G.W;
  }
  function terrainLayer() {
    const sig = terrainSig();
    if (tcache && tcache.sig === sig) return tcache;
    const pad = S * 1.2, w = S * SQ3 * (G.W + 0.5) + pad * 2, h = S * 1.5 * (G.H - 1) + S * 2 + pad * 2;
    const K = Math.min(2, Math.sqrt(8e6 / (w * h)));
    const layer = (tcache && tcache.cv) || document.createElement('canvas');
    layer.width = Math.ceil(w * K); layer.height = Math.ceil(h * K);
    const c = layer.getContext('2d');
    c.setTransform(K, 0, 0, K, 0, 0); c.translate(pad + S * SQ3 / 2, pad + S);
    for (let i = 0; i < M.N; i++) { const [x, y] = tc(i); ART.tileBase(c, i, x, y); }
    for (let i = 0; i < M.N; i++) { const [x, y] = tc(i); ART.tileFeatures(c, i, x, y); }
    tcache = { cv: layer, sig, ox: -(pad + S * SQ3 / 2), oy: -(pad + S), w, h };
    return tcache;
  }

  function drawFeatures(i, x, y) {
    const t = G.tiles[i];
    if (t.owner >= 0 && t.city == null && !t.district) { hexPath(x, y, 1); cx.fillStyle = G.players[t.owner].color + '1c'; cx.fill(); }
    if (t.district) ART.district(cx, t.district, x, y);
    if (t.wonder) drawWonder(t.wonder, x, y);
    if (t.camp) ART.camp(cx, x, y);
    if (t.village) ART.village(cx, x, y);
    if (t.res && resVisible(t, 0) && t.city == null) badge(RESOURCES[t.res].icon, x, y - 0.56 * S);
  }
  function drawWonder(id, x, y) {
    hexPath(x, y, 0.84); cx.fillStyle = 'rgba(60,44,10,.8)'; cx.fill(); cx.strokeStyle = '#f2ca52'; cx.lineWidth = 2.6; cx.stroke();
    emoji(WONDERS[id].icon, x, y, S * 0.74);
  }
  function drawBorder(i, x, y) {
    const t = G.tiles[i];
    if (t.owner < 0) return;
    const col = G.players[t.owner].color;
    cx.lineCap = 'round';
    for (let k = 0; k < 6; k++) {
      const n = M.nei[i][k];
      if (n >= 0 && G.tiles[n].owner === t.owner) continue;
      const a = CORN[k], b = CORN[(k + 1) % 6];
      cx.strokeStyle = col + '55'; cx.lineWidth = 8;
      cx.beginPath(); cx.moveTo(x + a[0] * S * 0.88, y + a[1] * S * 0.88); cx.lineTo(x + b[0] * S * 0.88, y + b[1] * S * 0.88); cx.stroke();
      cx.strokeStyle = col; cx.lineWidth = 2.6;
      cx.beginPath(); cx.moveTo(x + a[0] * S * 0.95, y + a[1] * S * 0.95); cx.lineTo(x + b[0] * S * 0.95, y + b[1] * S * 0.95); cx.stroke();
    }
  }
  function drawYield(i, x, y) {
    const v = tileYield(i, 0);
    const items = [[v.f, '#9bd66e'], [v.p, '#e79d55'], [v.g, '#f2ca52']].filter(a => a[0] > 0);
    const r = S * 0.17, gap = S * 0.38, x0 = x - (items.length - 1) * gap / 2;
    items.forEach((it, k) => {
      cx.beginPath(); cx.arc(x0 + k * gap, y + 0.06 * S, r, 0, 7); cx.fillStyle = it[1]; cx.fill(); cx.strokeStyle = 'rgba(0,0,0,.55)'; cx.lineWidth = 1.2; cx.stroke();
      cx.fillStyle = '#10151f'; cx.font = `700 ${S * 0.26}px ${UIFONT}`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(it[0], x0 + k * gap, y + 0.07 * S);
    });
  }
  function needsOrders(u) { return u.owner === 0 && u.mp > 0 && !u.sleep && !u.skip && u.goto == null && !u.auto; }

  /* 움직임 · 타격 · 쓰러짐 애니메이션 상태 */
  const upos = new Map();
  let ghosts = [], strikes = [], evStart = 0, evClock = 0, lastTick = 0;
  const humanSees = i => { const p = G && G.players[0]; return !!(p && p.vis && p.vis[i]); };
  function evDelay(step) {
    const now = performance.now();
    if (now - evStart > evClock + 250) { evStart = now; evClock = 0; }
    const d = Math.max(0, evStart + evClock - now);
    evClock += step;
    return d;
  }
  HOOK.move = (u, from, to) => {
    if (!started || !(u.owner === 0 || humanSees(from) || humanSees(to))) return;
    let a = upos.get(u.id);
    if (!a) { const [x, y] = tc(from); a = { x, y, q: [] }; upos.set(u.id, a); }
    a.q.push(to);
  };
  HOOK.attack = (from, to, ranged, uid) => {
    if (!started || !(humanSees(from) || humanSees(to))) return;
    const d = evDelay(170);
    strikes.push({ from, to, ranged, uid, t: performance.now() + d });
    if (d < 1400) SFX.play(ranged ? 'shoot' : 'melee', d / 1000);
  };
  HOOK.death = u => {
    if (!started || !G || !humanSees(u.pos)) return;
    if (G.tiles[u.pos].city != null && u.type === 'settler') return;
    ghosts.push({ type: u.type, owner: u.owner, pos: u.pos, t: performance.now() + evDelay(0) });
    upos.delete(u.id);
  };
  HOOK.fx = (pos, text, color) => { fxList.push({ pos, text, color, t: performance.now() + Math.max(0, evDelay(0) - 60) + (fxList.length % 3) * 45 }); };

  function unitXY(u) {
    const a = upos.get(u.id);
    let [x, y] = a ? [a.x, a.y] : tc(u.pos);
    const now = performance.now();
    for (const s of strikes) {
      if (s.uid !== u.id || s.ranged) continue;
      const age = (now - s.t) / 260;
      if (age < 0 || age > 1) continue;
      const [tx, ty] = tc(s.to), k = Math.sin(Math.PI * age) * 0.42;
      x += (tx - x) * k; y += (ty - y) * k;
    }
    return [x, y];
  }
  function drawUnit(u, x, y, k) {
    const P = G.players[u.owner], r = S * 0.4 * k, mine = u.owner === 0;
    if (sel && sel.type === 'unit' && sel.id === u.id) {
      cx.beginPath(); cx.arc(x, y, r + 6.5, 0, 7); cx.strokeStyle = 'rgba(255,211,107,.35)'; cx.lineWidth = 7; cx.stroke();
      cx.beginPath(); cx.arc(x, y, r + 6.5, 0, 7); cx.strokeStyle = '#ffd36b'; cx.lineWidth = 2.5; cx.stroke();
    }
    ART.token(cx, u.type, P, x, y, r, { ready: mine && needsOrders(u), spent: mine && u.mp <= 0 });
    if (u.hp < 100) {
      const w = r * 2, hy = y + r + 4;
      cx.fillStyle = 'rgba(0,0,0,.75)'; cx.fillRect(x - r - 1, hy - 1, w + 2, 6);
      cx.fillStyle = u.hp > 60 ? '#7bd193' : u.hp > 30 ? '#f2ca52' : '#f07a66'; cx.fillRect(x - r, hy, w * Math.max(0, u.hp) / 100, 4);
    }
    if (mine && (u.sleep || u.auto || u.goto != null)) {
      cx.font = `700 ${S * 0.27}px ${UIFONT}`; cx.fillStyle = '#fff'; cx.strokeStyle = 'rgba(0,0,0,.85)'; cx.lineWidth = 3; cx.textAlign = 'center'; cx.textBaseline = 'middle';
      const m = u.sleep ? 'zZ' : u.auto ? '↻' : '→';
      cx.strokeText(m, x + r, y - r); cx.fillText(m, x + r, y - r);
    }
    if (u.type === 'missionary' && u.rel != null) { cx.beginPath(); cx.arc(x - r * 0.8, y - r * 0.8, r * 0.3, 0, 7); cx.fillStyle = G.players[u.rel].color; cx.fill(); cx.strokeStyle = '#fff'; cx.lineWidth = 1.2; cx.stroke(); }
  }

  function drawBackdrop(now) {
    const L = terrainLayer();
    const mx = S * SQ3 * G.W / 2, my = S * 1.5 * G.H / 2, still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = still ? 0 : now / 1000;
    const z = Math.max(vw / (S * SQ3 * G.W) * 1.5, 0.75);
    cx.save(); cx.translate(vw / 2, vh / 2); cx.scale(z, z);
    cx.translate(-(mx + Math.sin(t / 23) * mx * 0.28), -(my + Math.cos(t / 31) * my * 0.2));
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(L.cv, L.ox, L.oy, L.w, L.h);
    cx.restore();
  }

  function draw(now) {
    dirty = false;
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.fillStyle = '#090d14'; cx.fillRect(0, 0, vw, vh);
    if (!G) return;
    if (!started) { drawBackdrop(now); return; }
    const p = H(), all = !!G.over;
    const seen = i => all || p.explored[i], visNow = i => all || p.vis[i];
    cx.save();
    cx.translate(vw / 2, vh / 2); cx.scale(cam.z, cam.z); cx.translate(-cam.x, -cam.y);
    const L = terrainLayer();
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(L.cv, L.ox, L.oy, L.w, L.h);
    const hw = vw / 2 / cam.z + S * 2, hh = vh / 2 / cam.z + S * 2, list = [];
    for (let i = 0; i < M.N; i++) { const [x, y] = tc(i); if (Math.abs(x - cam.x) < hw && Math.abs(y - cam.y) < hh) list.push([i, x, y]); }
    for (const [i, x, y] of list) if (seen(i)) drawFeatures(i, x, y);
    for (const [i, x, y] of list) if (seen(i)) drawBorder(i, x, y);
    // 도시
    for (const [i, x, y] of list) {
      const t = G.tiles[i];
      if (t.city == null || !seen(i)) continue;
      const c = G.cities[t.city];
      ART.city(cx, c, x, y, G.players[c.owner]);
    }
    // 건설 중인 지구 · 불가사의 자리
    for (const c of G.cities) {
      if (c.owner !== 0 || !c.prodItem || c.prodItem.tile == null) continue;
      const [x, y] = tc(c.prodItem.tile);
      cx.globalAlpha = 0.5;
      if (c.prodItem.kind === 'district') ART.district(cx, c.prodItem.id, x, y); else if (c.prodItem.kind === 'wonder') drawWonder(c.prodItem.id, x, y);
      cx.globalAlpha = 1;
      hexPath(x, y, 0.9); cx.strokeStyle = '#fff'; cx.lineWidth = 2; cx.setLineDash([6, 5]); cx.stroke(); cx.setLineDash([]);
    }
    // 안개
    for (const [i, x, y] of list) {
      if (!seen(i)) {
        const fringe = M.nb[i].some(seen);
        hexPath(x, y, 1.03); cx.fillStyle = fringe ? 'rgba(15,21,32,.9)' : '#0f1520'; cx.fill();
        if (!fringe) { cx.fillStyle = 'rgba(255,255,255,.018)'; cx.beginPath(); cx.ellipse(x + ((i * 37) % 17 - 8), y + ((i * 53) % 13 - 6), S * 0.5, S * 0.22, 0, 0, 7); cx.fill(); }
      } else if (!visNow(i)) { hexPath(x, y, 1.02); cx.fillStyle = 'rgba(9,13,20,.42)'; cx.fill(); }
    }
    // 선택 표시
    const sc = selCity();
    if (sc) {
      for (const i of sc.tiles) { if (i === sc.pos || G.tiles[i].t === 'mountain') continue; const [x, y] = tc(i); if (!G.tiles[i].district && !G.tiles[i].wonder) drawYield(i, x, y); }
      for (const i of sc.worked) { const [x, y] = tc(i); hexPath(x, y, 0.9); cx.strokeStyle = 'rgba(255,255,255,.8)'; cx.lineWidth = 2; cx.setLineDash([5, 4]); cx.stroke(); cx.setLineDash([]); }
    } else if (showYields) {
      for (const [i, x, y] of list) if (seen(i) && G.tiles[i].city == null && !G.tiles[i].district && G.tiles[i].t !== 'mountain') drawYield(i, x, y);
    }
    if (placing) {
      const col = placing.kind === 'wonder' ? '#f2ca52' : DISTRICTS[placing.type].color;
      for (const [i, b] of placing.sites) {
        const [x, y] = tc(i);
        hexPath(x, y, 0.9); cx.fillStyle = col + '70'; cx.fill(); cx.strokeStyle = '#fff'; cx.lineWidth = 2; cx.stroke();
        const label = placing.kind === 'wonder' ? '★' : '+' + b;
        cx.font = `700 ${S * 0.56}px ${UIFONT}`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.lineWidth = 4; cx.strokeStyle = 'rgba(0,0,0,.7)';
        cx.strokeText(label, x, y); cx.fillStyle = '#fff'; cx.fillText(label, x, y);
      }
    } else if (reach) {
      for (const i of reach.keys()) { const [x, y] = tc(i); hexPath(x, y, 0.88); cx.fillStyle = 'rgba(255,255,255,.13)'; cx.fill(); cx.strokeStyle = 'rgba(255,255,255,.55)'; cx.lineWidth = 1.5; cx.stroke(); }
      for (const i of targets) { const [x, y] = tc(i); hexPath(x, y, 0.9); cx.fillStyle = 'rgba(255,60,40,.25)'; cx.fill(); cx.strokeStyle = '#ff5a4a'; cx.lineWidth = 3; cx.stroke(); }
      const su = selUnit();
      if (su && hoverPath && hoverPath.length) {
        cx.beginPath(); let [x, y] = tc(su.pos); cx.moveTo(x, y);
        for (const n of hoverPath) { [x, y] = tc(n); cx.lineTo(x, y); }
        cx.strokeStyle = 'rgba(255,211,107,.9)'; cx.lineWidth = 3; cx.lineJoin = 'round'; cx.setLineDash([7, 6]); cx.stroke(); cx.setLineDash([]);
        cx.beginPath(); cx.arc(x, y, 5, 0, 7); cx.fillStyle = '#ffd36b'; cx.fill();
      }
      if (su && su.goto != null) { const [x, y] = tc(su.goto); cx.beginPath(); cx.arc(x, y, 7, 0, 7); cx.strokeStyle = '#ffd36b'; cx.lineWidth = 3; cx.stroke(); }
    }
    if (hover >= 0 && !G.over) { const [x, y] = tc(hover); hexPath(x, y, 0.97); cx.strokeStyle = 'rgba(255,255,255,.45)'; cx.lineWidth = 1.6; cx.stroke(); }
    // 유닛 (아래쪽 줄이 위를 덮도록 순서대로)
    for (const [i] of list) {
      const u = UA[i];
      if (!u || !(visNow(i) || (u.owner === 0 && upos.has(u.id)))) continue;
      const [x, y] = unitXY(u), inCity = G.tiles[i].city != null && !upos.has(u.id);
      if (inCity) drawUnit(u, x + 0.42 * S, y + 0.4 * S, 0.7); else drawUnit(u, x, y, 1);
    }
    // 쓰러진 유닛
    for (const g of ghosts) {
      const age = (now - g.t) / 450;
      if (age > 1) continue;
      const [x, y] = tc(g.pos), a = age < 0 ? 1 : 1 - age;
      cx.globalAlpha = a; ART.token(cx, g.type, G.players[g.owner], x, y + (age > 0 ? age * 6 : 0), S * 0.4 * (age > 0 ? 1 - age * 0.3 : 1), {}); cx.globalAlpha = 1;
    }
    // 타격 효과
    for (const s of strikes) {
      const age = (now - s.t) / 260;
      if (age < 0 || age > 1.6) continue;
      const [fx0, fy0] = tc(s.from), [tx, ty] = tc(s.to);
      if (s.ranged && age < 0.75) {
        const k = age / 0.75, k0 = Math.max(0, k - 0.22);
        cx.strokeStyle = '#fff3c4'; cx.lineWidth = 2.6; cx.lineCap = 'round';
        cx.beginPath(); cx.moveTo(fx0 + (tx - fx0) * k0, fy0 + (ty - fy0) * k0 - Math.sin(k0 * Math.PI) * S * 0.5); cx.lineTo(fx0 + (tx - fx0) * k, fy0 + (ty - fy0) * k - Math.sin(k * Math.PI) * S * 0.5); cx.stroke();
      }
      const hit = (age - (s.ranged ? 0.75 : 0.45)) / 0.8;
      if (hit > 0 && hit < 1) {
        cx.beginPath(); cx.arc(tx, ty, S * (0.25 + hit * 0.5), 0, 7); cx.strokeStyle = `rgba(255,240,200,${1 - hit})`; cx.lineWidth = 4 * (1 - hit) + 1; cx.stroke();
        cx.beginPath(); cx.arc(tx, ty, S * 0.3 * (1 - hit), 0, 7); cx.fillStyle = `rgba(255,255,255,${0.7 * (1 - hit)})`; cx.fill();
      }
    }
    cx.restore();
    // 도시 이름표 (화면 좌표)
    for (const [i, x, y] of list) {
      const t = G.tiles[i];
      if (t.city == null || !seen(i)) continue;
      const c = G.cities[t.city], P = G.players[c.owner];
      const [sx, sy] = toScreen(x, y);
      let label = c.name;
      if (c.owner === 0) { const it = c.prodItem; label += it ? '  ' + defOf(it).icon : '  ❗'; }
      const rel = typeof cityReligion === 'function' ? cityReligion(c) : null;
      cx.font = `600 12px ${UIFONT}, ${EMOJI}`;
      const tw = cx.measureText(label).width, w = tw + 34 + (rel != null ? 14 : 0), bx = sx - w / 2, by = sy - S * cam.z * 0.92 - 22, dark = lum(P.color) > 0.6;
      cx.fillStyle = 'rgba(0,0,0,.35)'; cx.beginPath(); if (cx.roundRect) cx.roundRect(bx + 1, by + 2, w, 20, 10); else cx.rect(bx + 1, by + 2, w, 20); cx.fill();
      cx.fillStyle = P.color; cx.beginPath(); if (cx.roundRect) cx.roundRect(bx, by, w, 20, 10); else cx.rect(bx, by, w, 20); cx.fill();
      cx.strokeStyle = 'rgba(0,0,0,.55)'; cx.lineWidth = 1; cx.stroke();
      cx.beginPath(); cx.arc(bx + 10, by + 10, 8.5, 0, 7); cx.fillStyle = dark ? 'rgba(40,28,6,.85)' : 'rgba(10,14,22,.7)'; cx.fill();
      cx.fillStyle = '#fff'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.font = `700 11.5px ${UIFONT}`; cx.fillText(c.pop, bx + 10, by + 10.5);
      cx.font = `600 12px ${UIFONT}, ${EMOJI}`; cx.fillStyle = dark ? '#1a1305' : '#fff'; cx.textAlign = 'left'; cx.fillText(label, bx + 23, by + 10.5);
      if (rel != null) { cx.beginPath(); cx.arc(bx + w - 11, by + 10, 5.5, 0, 7); cx.fillStyle = G.players[rel].color; cx.fill(); cx.strokeStyle = '#fff'; cx.lineWidth = 1.4; cx.stroke(); }
      if (c.hp < 200) { cx.fillStyle = 'rgba(0,0,0,.75)'; cx.fillRect(bx + 8, by + 22, w - 16, 4); cx.fillStyle = c.hp > 100 ? '#7bd193' : '#f07a66'; cx.fillRect(bx + 8, by + 22, (w - 16) * c.hp / 200, 4); }
    }
    // 떠오르는 숫자
    fxList = fxList.filter(f => now - f.t < 1100);
    for (const f of fxList) {
      const age = (now - f.t) / 1100;
      if (age < 0) continue;
      const [x, y] = tc(f.pos), [sx, sy] = toScreen(x, y);
      cx.globalAlpha = 1 - age * age;
      cx.font = `700 17px ${UIFONT}, ${EMOJI}`; cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.lineWidth = 4; cx.strokeStyle = 'rgba(0,0,0,.8)'; cx.strokeText(f.text, sx, sy - 16 - age * 34);
      cx.fillStyle = f.color; cx.fillText(f.text, sx, sy - 16 - age * 34);
      cx.globalAlpha = 1;
    }
  }
  function drawMinimap() {
    const mm = $('minimap');
    if (!mm.offsetParent) return;
    const m = mm.getContext('2d'), cw = mm.width / (G.W + 0.5), ch = mm.height / G.H, p = H(), all = !!G.over;
    m.fillStyle = '#0b0f17'; m.fillRect(0, 0, mm.width, mm.height);
    for (let i = 0; i < M.N; i++) {
      if (!all && !p.explored[i]) continue;
      const c = i % G.W, r = (i / G.W) | 0, t = G.tiles[i];
      m.fillStyle = t.city != null ? '#fff' : t.owner >= 0 ? G.players[t.owner].color : ART.BASE[t.t];
      m.fillRect((c + 0.5 * (r & 1)) * cw, r * ch, cw + 0.5, ch + 0.5);
    }
    for (const u of G.units) if (all || p.vis[u.pos]) {
      const c = u.pos % G.W, r = (u.pos / G.W) | 0;
      m.fillStyle = u.owner === 0 ? '#fff' : G.players[u.owner].barb ? '#ff4433' : '#111';
      m.fillRect((c + 0.5 * (r & 1)) * cw + cw * 0.25, r * ch + ch * 0.25, cw * 0.5, ch * 0.5);
    }
    const sx = mm.width / (S * SQ3 * (G.W + 0.5)), sy = mm.height / (S * 1.5 * G.H);
    m.strokeStyle = '#ffd36b'; m.lineWidth = 1.5;
    m.strokeRect((cam.x - vw / 2 / cam.z + S * SQ3 / 2) * sx, (cam.y - vh / 2 / cam.z + S * 0.75) * sy, vw / cam.z * sx, vh / cam.z * sy);
  }

  /* ---------- 선택 ---------- */
  function selUnit() { return sel && sel.type === 'unit' ? unitById(sel.id) : null; }
  function selCity() { return sel && sel.type === 'city' ? G.cities[sel.id] : null; }
  function deselect() { sel = null; reach = null; targets = []; placing = null; hoverPath = null; HOOK.changed(); }
  function selectUnit(u, center) {
    sel = { type: 'unit', id: u.id }; placing = null; hoverPath = null;
    reach = reachable(u); targets = attackTargets(u);
    if (center) ensureVisible(u.pos);
    HOOK.changed();
  }
  function selectCity(c, center) {
    sel = { type: 'city', id: c.id }; reach = null; targets = []; placing = null; lockedOpen = false;
    if (center || narrow()) centerOn(c.pos, true);
    HOOK.changed();
  }
  function refreshSel() {
    if (!sel) return;
    if (sel.type === 'unit') { const u = selUnit(); if (!u || u.owner !== 0) deselect(); else { reach = reachable(u); targets = attackTargets(u); } }
    else { const c = selCity(); if (!c || c.owner !== 0) deselect(); }
  }
  function idleUnits() { return G.units.filter(needsOrders); }
  function autoSelect(except) {
    const list = idleUnits().filter(u => !except || u.id !== except.id);
    if (list.length) { selectUnit(list[0], true); return true; }
    return false;
  }
  function afterAction(u) {
    flushNotes();
    if (G.over) { deselect(); showEnd(); return; }
    if (u && !u.dead && u.owner === 0 && needsOrders(u)) { selectUnit(u); return; }
    if (!autoSelect(u)) deselect();
  }

  /* ---------- 알림 ---------- */
  function flushNotes(newTurn) {
    if (newTurn) logItems.forEach(n => { n.old = true; });
    const tags = new Set();
    while (NOTES.length) { const n = NOTES.shift(); logItems.push(n); history.push(n); tags.add(n.tag || (newTurn && n.kind === 'bad' ? 'bad' : '')); }
    for (const [tag, name] of [['war', 'war'], ['tech', 'tech'], ['found', 'found'], ['camp', 'found'], ['boost', 'boost'], ['faith', 'faith'], ['wonder', 'win'], ['bad', 'bad']]) if (tags.has(tag)) { SFX.play(name); break; }
    logItems = logItems.slice(-5); history = history.slice(-80);
    const el = $('log');
    el.innerHTML = logItems.map((n, k) => `<button type="button" class="note ${n.kind}${n.old ? ' old' : ''}" data-act="note" data-k="${k}">${n.msg}</button>`).join('');
    uiDirty = true;
  }
  function toast(msg) {
    const el = $('toast'); el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
  }
  function save() { try { localStorage.setItem(SAVE_KEY, serialize()); } catch (e) { /* 저장 불가 환경에서는 그냥 진행 */ } }
  function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }

  /* ---------- 명령 ---------- */
  function giveOrder(u, i) {
    const p = H(), t = G.tiles[i];
    if (u.owner !== 0) return;
    const here = p.vis[i] ? UA[i] : null;
    const eCity = p.explored[i] && t.city != null && G.cities[t.city].owner !== 0 ? G.cities[t.city] : null;
    if ((here && here.owner !== 0) || eCity) {
      const owner = eCity ? eCity.owner : here.owner;
      if (!isMil(u)) { toast('민간 유닛은 공격할 수 없어요.'); return; }
      if (!atWar(0, owner)) { confirmWar(owner); return; }
      if (UNITS[u.type].rs && here && !eCity && !isMil(here)) { toast('원거리 유닛으로는 민간 유닛을 붙잡을 수 없어요.'); return; }
      const range = UNITS[u.type].rs ? UNITS[u.type].range : 1;
      if (dist(u.pos, i) > range) {
        const path = findPath(u, i);
        if (!path) { toast('갈 수 있는 길이 없어요.'); return; }
        for (const n of path) { if (u.mp <= 0 || dist(u.pos, i) <= range) break; if (!stepUnit(u, n) || u.dead) break; }
      }
      if (!u.dead && dist(u.pos, i) <= range) { if (u.mp > 0) attack(u, i); else toast('이동력이 없어서 다음 턴에 공격할 수 있어요.'); }
      else if (!u.dead) toast('이번 턴에는 닿지 않아요.');
      afterAction(u);
      return;
    }
    if (p.explored[i] && !passable(t)) { toast(t.t === 'mountain' ? '산은 지나갈 수 없어요.' : '육상 유닛은 물에 들어갈 수 없어요.'); return; }
    if (here && here.owner === 0 && here !== u) { toast('한 타일에는 유닛 하나만 있을 수 있어요.'); return; }
    if (u.mp <= 0) { u.goto = i; toast('다음 턴에 이동할게요.'); HOOK.changed(); afterAction(u); return; }
    const before = u.pos;
    u.sleep = false; u.auto = false;
    moveToward(u, i);
    if (u.pos === before && u.goto == null) toast('갈 수 있는 길이 없어요.'); else SFX.play('move');
    H().tut.moved = 1;
    afterAction(u);
  }
  function onTap(i, order) {
    if (busy || i < 0 || !started || G.over) { if (G && G.over && i >= 0) { infoTile = i; uiDirty = true; } return; }
    const p = H(), t = G.tiles[i];
    if (narrow() && advisorOpen && G.turn > 1) { advisorOpen = false; uiDirty = true; } // 좁은 화면에서는 지도를 누르면 길잡이를 접음
    if (placing) {
      if (placing.sites.has(i)) {
        const c = G.cities[placing.cityId];
        const kind = placing.kind || 'district';
        if (setProduction(c, { kind, id: placing.type, tile: i })) { H().tut.prod = 1; SFX.play('build'); toast(`${(kind === 'wonder' ? WONDERS : DISTRICTS)[placing.type].name} 건설을 시작했어요.`); }
        placing = null; selectCity(c);
      } else { const c = G.cities[placing.cityId]; placing = null; selectCity(c); toast('배치를 취소했어요.'); }
      return;
    }
    const selBefore = sel ? sel.type + sel.id : '';
    setTimeout(() => { const now = sel ? sel.type + sel.id : ''; if (now && now !== selBefore) SFX.play('select'); }, 0);
    const u = selUnit(), here = UA[i] && (p.vis[i] || UA[i].owner === 0) ? UA[i] : null;
    const myCity = t.city != null && G.cities[t.city].owner === 0 ? G.cities[t.city] : null;
    infoTile = i;
    if (u && order) { giveOrder(u, i); return; }
    if (u) {
      if (i === u.pos) { if (myCity) selectCity(myCity); else deselect(); return; }
      if (here && here.owner === 0) { selectUnit(here); return; }
      if (myCity && here == null && !(reach && reach.has(i))) { selectCity(myCity); return; }
      giveOrder(u, i); return;
    }
    if (here && here.owner === 0) { if (sel && sel.type === 'city' && myCity && sel.id === myCity.id || !myCity) selectUnit(here); else selectCity(myCity); return; }
    if (myCity) { selectCity(myCity); return; }
    deselect();
  }
  function unitAct(act, arg) {
    const u = selUnit();
    if (!u || busy) return;
    if (act === 'found') { const c = foundCity(u); if (c) { save(); flushNotes(); selectCity(c, true); } else toast('여기에는 도시를 세울 수 없어요.'); return; }
    if (act === 'improve') { if (improve(u, arg)) { H().tut.improved = 1; SFX.play('work'); } }
    else if (act === 'chop') { if (chop(u)) SFX.play('work'); }
    else if (act === 'spread') { if (spreadReligion(u)) SFX.play('faith'); }
    else if (act === 'upgrade') { if (upgradeUnit(u)) SFX.play('build'); else toast('금이 모자라거나 내 영토 밖이에요.'); }
    else if (act === 'skip') u.skip = true;
    else if (act === 'sleep') { u.sleep = true; u.goto = null; u.auto = false; }
    else if (act === 'wake') { u.sleep = false; u.auto = false; u.goto = null; HOOK.changed(); selectUnit(u); return; }
    else if (act === 'explore') { u.auto = true; u.sleep = false; u.goto = null; exploreStep(u); H().tut.moved = 1; }
    else if (act === 'cancel') { u.goto = null; HOOK.changed(); selectUnit(u); return; }
    else if (act === 'disband') {
      confirmBox('유닛 해산', `${UNITS[u.type].name}을(를) 해산할까요? 되돌릴 수 없어요.`, '해산', () => { killUnit(u); recomputeVis(0); HOOK.changed(); afterAction(null); });
      return;
    }
    HOOK.changed();
    afterAction(u);
  }
  function defOf(item) { return item.kind === 'unit' ? UNITS[item.id] : item.kind === 'building' ? BUILDINGS[item.id] : item.kind === 'district' ? DISTRICTS[item.id] : item.kind === 'wonder' ? WONDERS[item.id] : PROJECTS[item.id]; }
  function chooseProd(kind, id) {
    const c = selCity();
    if (!c) return;
    if (kind === 'district' || kind === 'wonder') {
      const sites = kind === 'wonder' ? wonderSites(c, id) : districtSites(c, id);
      if (!sites.length) return;
      placing = { kind, cityId: c.id, type: id, sites: new Map(sites.map(s => [s.idx, s.bonus])) };
      centerOn(c.pos, true); HOOK.changed();
      return;
    }
    if (setProduction(c, { kind, id })) { H().tut.prod = 1; SFX.play('build'); nextAfterCity(c); }
  }
  function nextAfterCity(c) {
    const other = citiesOf(0).find(x => !x.prodItem);
    if (other) selectCity(other, true); else if (narrow()) { if (!autoSelect()) deselect(); } else HOOK.changed();
  }
  function doEndTurn() {
    if (busy || G.over) return;
    busy = true; deselect(); refreshUI();
    setTimeout(() => {
      try { endTurn(); } catch (e) { console.error(e); toast('문제가 생겼어요: ' + e.message); }
      busy = false;
      SFX.play('turn'); flashTurn();
      flushNotes(true); save();
      if (G.over) { showEnd(); HOOK.changed(); return; }
      if (G.peaceOffer != null && atWar(0, G.peaceOffer)) showPeaceOffer(); else { G.peaceOffer = null; autoSelect(); }
      HOOK.changed();
    }, 30);
  }
  function flashTurn() {
    const el = $('turnFlash');
    el.textContent = `턴 ${G.turn}`; el.hidden = true; void el.offsetWidth; el.hidden = false;
    clearTimeout(flashTurn.t); flashTurn.t = setTimeout(() => { el.hidden = true; }, 1500);
  }
  function nextAction() {
    const p = H();
    if (G.over) return { t: '결과 보기', sub: '', f: showEnd };
    if (busy) return { t: '상대 차례…', sub: '잠시만요', f: () => {}, wait: true };
    if (p.policyOpts) return { t: '정책 선택', sub: '새 정책을 고를 수 있어요', f: openPolicy, todo: true };
    if (canFoundReligion(0) && !p.tut.skipRel) return { t: '종교 창시', sub: '신앙이 충분히 모였어요', f: openReligion, todo: true };
    if (!p.research && citiesOf(0).length && availableTechs(0).length) return { t: '연구 선택', sub: '무엇을 연구할까요?', f: openTech, todo: true };
    const c = citiesOf(0).find(x => !x.prodItem);
    if (c) return { t: '생산 선택', sub: `${c.name}이(가) 쉬고 있어요`, f: () => selectCity(c, true), todo: true };
    const idle = idleUnits();
    if (idle.length) return { t: '유닛 명령', sub: `${UNITS[idle[0].type].name}이(가) 기다려요`, f: () => { const su = selUnit(); const nx = idle.find(u => !su || u.id !== su.id) || idle[0]; selectUnit(nx, true); centerOn(nx.pos, true); }, todo: true };
    return { t: '턴 종료', sub: 'Enter', f: doEndTurn };
  }

  /* ---------- 길잡이 ---------- */
  const QUESTS = [
    { t: '첫 도시를 세워요', d: '정착민(⛺)을 누르고 [도시 건설]을 선택하세요. 지금 서 있는 자리도 충분히 좋아요.',
      w: '호수·해안 옆 도시는 주거 공간이 넉넉해서 인구가 더 크게 자라요. 대부분의 4X 게임에서 "물가에 정착"은 기본 원칙이에요.', done: p => citiesOf(0).length >= 1 },
    { t: '무엇을 만들지 정해요', d: '도시를 누르면 생산 목록이 열려요. 처음에는 정찰병 → 건설자 → 정착민 순서가 무난해요.',
      w: '도시는 한 번에 한 가지만 만들어요. 생산(⚙️)이 높을수록 빨리 끝나요.', done: p => p.tut.prod || citiesOf(0).some(c => c.prodItem) || G.turn > 3 },
    { t: '연구를 골라요', d: '화면 위 연구 칸을 눌러 기술을 고르세요. 주변에 자원이 있다면 그걸 개발하는 기술부터요.',
      w: '각 기술에는 💡 영감 조건이 있어요. 조건을 채우면 연구가 40% 앞당겨져요. 그냥 기다리지 말고 조건을 노려보세요.', done: p => p.research || techCount(0) > 0 },
    { t: '턴을 넘겨요', d: '오른쪽 아래 버튼이 지금 할 일을 알려줘요. 할 일이 없으면 [턴 종료]가 돼요.',
      w: '턴제 게임이라 서두를 필요가 없어요. 내 턴에는 얼마든지 고민해도 돼요.', done: () => G.turn >= 2 },
    { t: '주변을 탐험해요', d: '전사나 정찰병을 움직여 안개를 걷어내세요. 유적(🛖)에 들어가면 보상을 받아요. [자동 탐험]도 있어요.',
      w: '초반 탐험으로 좋은 도시 자리, 이웃 세력, 약탈자 야영지 위치를 알아두는 게 중요해요.', done: p => (p.villages || 0) >= 1 || G.turn >= 14 },
    { t: '땅을 개발해요', d: '건설자(🔨)를 만들어 도시 주변 타일에 농장이나 광산을 지어요. 자원(🌾🐄🪨)이 있는 타일부터요.',
      w: '건설자는 3번 쓰면 사라지는 소모품이에요. 시민이 일하는 타일(점선)을 먼저 개발하면 효과가 바로 나와요.', done: p => p.tut.improved || G.tiles.some(t => t.owner === 0 && t.imp) },
    { t: '두 번째 도시를 세워요', d: '도시 인구가 2가 되면 정착민을 만들 수 있어요. 새 도시는 다른 도시에서 4칸 이상 떨어져야 해요.',
      w: '도시가 많을수록 과학·생산·금이 모두 늘어요. 초반에 3~4개까지 넓히는 걸 추천해요.', done: () => citiesOf(0).length >= 2 },
    { t: '정책을 골라요', d: '문화(🎭)가 쌓이면 정책을 고를 수 있어요. 기념비를 지으면 문화가 빨리 쌓여요.',
      w: '문화는 국경을 넓히고 정책을 열어줘요. 과학만큼 중요한 두 번째 연구 축이라고 생각하면 돼요.', done: p => p.policies.length >= 1 },
    { t: '지구를 지어요', d: "'문자'를 연구하면 학문 지구(🔬)를 지을 수 있어요. 지을 타일을 직접 고르는데, 산 옆이면 과학이 더 나와요.",
      w: '지구는 놓는 위치에 따라 인접 보너스가 달라져요. 도시 주변 지형을 보고 "어디에 뭘 지을지" 계획하는 게 이 장르의 핵심 재미예요.', done: p => (p.districtsBuilt || 0) >= 1 },
    { t: '약탈자 야영지를 없애요', d: '야영지(🔥)는 약탈자를 계속 만들어내요. 군사 유닛 2~3기로 지키는 적을 처치하고 야영지 타일로 들어가세요.',
      w: '숲·언덕 위의 유닛은 방어력이 높아요. 궁수로 먼저 깎고 근접 유닛으로 마무리하면 피해가 적어요.', done: p => (p.campsDestroyed || 0) >= 1 || G.turn >= 70 },
    { t: '신앙을 모아 종교를 세워요', d: "'점성술'을 연구하고 성지(🛐)를 지으면 신앙(🙏)이 쌓여요. 충분히 모이면 종교를 창시하고 교리를 고를 수 있어요.",
      w: '종교는 세계에 몇 개만 생기니 원한다면 서둘러야 해요. 관심 없으면 건너뛰어도 괜찮아요. 종교 창(🙏)에서 진행 상황을 볼 수 있어요.', done: p => p.religion || religionsFounded() >= religionSlots() || G.turn >= 90 },
    { t: '불가사의에 도전해요', d: '도시 생산 목록 아래쪽의 불가사의는 세계에 하나뿐인 건축물이에요. 저마다 놓을 수 있는 타일 조건이 달라요.',
      w: '다른 세력이 먼저 완성하면 진행분은 금으로 돌려받아요. 불가사의와 박물관은 관광을 만들어 문화 승리로 이어져요.', done: p => G.cities.some(c => c.owner === 0 && (c.wonders || []).length) || G.turn >= 130 },
    { t: '승리를 향해 가요', d: '과학(우주 탐사선) · 문화(관광) · 종교(전도) · 정복(수도 점령) 중 하나를 먼저 이루면 이겨요. 아무도 못 이루면 마지막 턴에 점수로 결정돼요.',
      w: '외교 창(🤝)에서 승리 조건별 진행 상황과 다른 세력의 점수를 확인할 수 있어요.', done: () => false },
  ];
  function renderAdvisor() {
    const el = $('advisor'), p = H();
    if (p.tut.off) { el.hidden = true; return; }
    el.hidden = false;
    const idx = QUESTS.findIndex(q => !q.done(p)), q = QUESTS[idx];
    if (idx !== lastQuest) { if (lastQuest >= 0) advisorOpen = true; lastQuest = idx; } // 새 단계가 열리면 다시 펼침
    const open = advisorOpen && !(narrow() && (selCity() || placing));
    el.innerHTML = `<button type="button" class="adv-head" data-act="advToggle"><span class="tag">길잡이</span><b>${open ? '' : q.t}</b><span class="count">${idx + 1}/${QUESTS.length} ${open ? '▾' : '▸'}</span></button>` +
      (open ? `<div class="adv-body"><h3>${q.t}</h3><p>${q.d}</p><p class="why">${q.w}</p></div>` : '');
  }

  /* ---------- 패널 ---------- */
  function tileInfoHTML(i) {
    const p = H();
    if (!G.over && !p.explored[i]) return '아직 탐험하지 않은 곳이에요';
    const t = G.tiles[i], T = TERRAINS[t.t], parts = [];
    const y = tileYield(i, 0);
    const ys = [y.f ? `<span class="y-f">식량 ${y.f}</span>` : '', y.p ? `<span class="y-p">생산 ${y.p}</span>` : '', y.g ? `<span class="y-g">금 ${y.g}</span>` : ''].filter(Boolean).join(' ');
    parts.push(`<b>${T.name}${t.hill ? ' · 언덕' : ''}${t.forest ? ' · 숲' : ''}</b> ${ys || '<em>산출 없음</em>'}`);
    if (t.res && resVisible(t, 0)) { const R = RESOURCES[t.res]; parts.push(`${R.icon} ${R.name} <em>(${R.kind} 자원${R.imp ? ' · ' + IMPROVEMENTS[R.imp].name + '(으)로 개발' : ''})</em>`); }
    if (t.imp) parts.push(`${IMPROVEMENTS[t.imp].icon} ${IMPROVEMENTS[t.imp].name}`);
    if (t.district) parts.push(`${DISTRICTS[t.district].icon} ${DISTRICTS[t.district].name}`);
    if (t.wonder) parts.push(`${WONDERS[t.wonder].icon} 불가사의: ${WONDERS[t.wonder].name} <em>(${WONDERS[t.wonder].desc})</em>`);
    if (t.city != null) { const c = G.cities[t.city]; parts.push(`🏛️ ${c.name} <em>(${G.players[c.owner].name} · 인구 ${c.pop} · 방어력 ${cityStr(c)} · HP ${c.hp}/200)</em>`); }
    else if (t.owner >= 0) parts.push(`<em>${G.players[t.owner].name} 영토</em>`);
    if (t.camp) parts.push('🔥 약탈자 야영지 <em>(군사 유닛으로 들어가면 파괴 · 금 +40)</em>');
    if (t.village) parts.push('🛖 유적 <em>(들어가면 보상)</em>');
    if (t.t === 'mountain') parts.push('<em>지나갈 수 없어요</em>');
    else if (passable(t) && moveCost(t) > 1) parts.push(`<em>이동 비용 ${moveCost(t)} · 방어 +${(t.hill ? 3 : 0) + (t.forest ? 3 : 0)}</em>`);
    const u = (G.over || p.vis[i]) ? UA[i] : null, su = selUnit();
    if (u && u.owner !== 0) {
      const U = UNITS[u.type];
      parts.push(`${U.icon} ${G.players[u.owner].name} ${U.name} <em>(HP ${u.hp}${isMil(u) ? ' · 전투력 ' + Math.max(U.str, U.rs || 0) : ''})</em>`);
    }
    if (su && isMil(su) && !G.over) {
      const ranged = !!UNITS[su.type].rs;
      if (t.city != null && G.cities[t.city].owner !== 0) {
        const c = G.cities[t.city], sC = cityStr(c), sA = unitStr(su, { ranged }) + (UNITS[su.type].cls === 'siege' ? 10 : 0);
        let d = rawDmg(sA, sC); if (ranged) d *= UNITS[su.type].cls === 'siege' ? 1.5 : (c.buildings.walls ? 0.5 : 0.8);
        parts.push(`<span class="pv">예상 피해: 도시 -${Math.round(d)}${ranged ? '' : ' / 아군 -' + Math.round(rawDmg(sC, sA) * 0.8)}</span>`);
      } else if (u && u.owner !== 0 && isMil(u)) {
        const sA = unitStr(su, { ranged, vs: u }) + (ranged ? 0 : flankBonus(su, i)), sD = unitStr(u, { defending: true, vs: su });
        parts.push(`<span class="pv">예상 피해: 적 -${Math.round(rawDmg(sA, sD))}${ranged ? ' (반격 없음)' : ' / 아군 -' + Math.round(rawDmg(sD, sA))}</span>`);
      }
    }
    return parts.join(' &nbsp;·&nbsp; ');
  }
  function renderUnitPanel() {
    const el = $('unitPanel'), u = selUnit();
    if (!u || placing) { el.hidden = true; return; }
    el.hidden = false;
    const U = UNITS[u.type], P = H(), t = G.tiles[u.pos], acts = [];
    let hint = '';
    const btn = (act, label, key, cls, dis, arg) => `<button type="button" class="act ${cls || ''}" data-act="unit" data-a="${act}"${arg ? ` data-arg="${arg}"` : ''}${dis ? ' disabled' : ''}>${label}${key ? `<kbd>${key}</kbd>` : ''}</button>`;
    if (u.sleep || u.auto) { acts.push(btn('wake', u.auto ? '자동 탐험 중지' : '깨우기', '', 'main')); hint = u.auto ? '자동으로 탐험하고 있어요.' : '쉬는 중이에요. 적이 가까이 오면 스스로 깨어나요.'; }
    else {
      if (u.type === 'settler') {
        const ok = canFoundAt(u.pos, 0) && u.mp > 0;
        acts.push(btn('found', '도시 건설', 'B', 'main', !ok));
        const fw = freshWater(u.pos);
        hint = !canFoundAt(u.pos, 0) ? '여기엔 세울 수 없어요. 다른 도시에서 4칸 이상 떨어진 빈 땅으로 가세요.'
          : `이 자리: 주거 ${[3, 5, 6][fw]} (${['물가가 아니에요', '해안 옆이에요', '호수 옆이라 가장 좋아요'][fw]}). 주변 2칸의 식량·생산도 확인해 보세요.`;
      } else if (u.type === 'builder') {
        const opts = u.mp > 0 ? improveOptions(u.pos, 0) : [];
        for (const k of opts) acts.push(btn('improve', `${IMPROVEMENTS[k].icon} ${IMPROVEMENTS[k].name} 건설`, '', 'main', false, k));
        if (canChop(u)) acts.push(btn('chop', '🪓 벌목 (생산 +20)', '', ''));
        hint = `남은 사용 횟수 ${u.charges}회. ` + (opts.length ? '' : t.owner !== 0 ? '내 영토의 타일로 옮겨야 개발할 수 있어요.' : t.imp ? '이미 개발된 타일이에요.' : u.mp <= 0 ? '이동력이 없어요. 다음 턴에 지을 수 있어요.' : '이 타일에 지을 수 있는 게 없어요. 평지(농장)·언덕(광산)·자원 타일을 찾아보세요.');
      } else if (u.type === 'missionary') {
        const tc2 = spreadTarget(u), R = G.players[u.rel].religion;
        acts.push(btn('spread', `🙏 ${tc2 ? tc2.name + '에 ' : ''}전도`, '', 'main', !tc2));
        hint = `'${R ? R.name : ''}' 선교사 · 남은 전도 ${u.charges}회. ` + (tc2 ? '' : '도시 바로 옆 타일(또는 도시 안)로 가면 전도할 수 있어요. 한 도시를 바꾸려면 보통 2~3번이 필요해요.');
      } else {
        hint = targets.length ? '빨간 타일의 적을 눌러 공격할 수 있어요.' : (U.rs ? `${U.range}칸 떨어진 적을 반격 없이 공격해요.` : '');
        if (u.fort > 0) hint += ` 방어 태세 +${3 * Math.min(2, u.fort)}.`;
        const to = upgradeTarget(u);
        if (to) { const uc = upgradeCost(u, to), can = u.mp > 0 && t.owner === 0 && P.gold >= uc; acts.push(btn('upgrade', `⬆ ${UNITS[to].name}(으)로 업그레이드 💰${uc}`, '', '', !can)); if (t.owner !== 0) hint += ' 업그레이드는 내 영토 안에서만 할 수 있어요.'; }
      }
      if (u.goto != null) acts.push(btn('cancel', '이동 취소', '', ''));
      if (isMil(u)) acts.push(btn('explore', '자동 탐험', 'E', ''));
      acts.push(btn('skip', '이번 턴 대기', 'Space', ''));
      acts.push(btn('sleep', isMil(u) ? '방어 태세로 쉬기' : '쉬기', 'F', ''));
      acts.push(btn('disband', '해산', '', 'danger'));
    }
    const str = isMil(u) ? ` · 전투력 ${unitStr(u, {})}${U.rs ? ' / 원거리 ' + unitStr(u, { ranged: true }) : ''}` : '';
    el.innerHTML = `<div class="u-head"><img class="u-icon" alt="" src="${ART.tokenURL(u.type, P)}"><div><div class="u-title">${U.name}</div>
      <div class="u-stats">HP ${u.hp}/100 · 이동력 ${fmt(u.mp)}/${U.move}${str}</div></div><button type="button" class="u-close" data-act="deselect" aria-label="닫기">✕</button></div>
      ${hint ? `<p class="u-hint">${hint}</p>` : ''}<div class="acts">${acts.join('')}</div>`;
  }
  function renderCityPanel() {
    const el = $('cityPanel'), c = selCity();
    if (!c || placing) { el.hidden = true; return; }
    const scroll = el.querySelector('.c-scroll'), st = scroll ? scroll.scrollTop : 0, sameCity = el.dataset.cid === String(c.id);
    el.hidden = false; el.dataset.cid = c.id;
    assignWorkers(c);
    const y = cityYields(c), p = H(), need = growthNeed(c.pop);
    const grow = y.surplus > 0 ? `${Math.max(1, Math.ceil((need - c.food) / y.surplus))}턴 뒤 성장` : y.surplus < 0 ? '식량 부족!' : '성장 멈춤';
    const stat = (cls, k, v) => `<div class="stat ${cls}"><span class="k">${k}</span><span class="v">${v}</span></div>`;
    let notes = '';
    if (c.pop >= y.housing) notes += `<p class="c-note warn">주거 공간이 꽉 차서 성장이 멈췄어요. 곡창이나 지구를 지으면 늘어나요.</p>`;
    else if (c.pop >= y.housing - 1) notes += `<p class="c-note">주거 공간이 거의 찼어요. 성장 속도가 절반이에요.</p>`;
    if (y.surplus < 0) notes += `<p class="c-note warn">식량이 모자라요. 농장을 짓거나 식량 타일을 확보하세요.</p>`;
    const opts = cityOptions(c);
    let now;
    if (c.prodItem) {
      const it = c.prodItem, D = defOf(it), cost = itemCost(c, it), prog = Math.min(cost, c.progress[itemKey(it)] || 0);
      now = `<div class="now"><div class="row"><b>${D.icon} ${D.name}</b><span>${turnsLeft(c, it, y)}턴</span></div><div class="bar prod"><i style="width:${prog / cost * 100}%"></i></div><div class="row"><small>${fmt(prog)} / ${cost}</small><small>턴당 +${fmt(y.p * prodMult(c, it))}</small></div></div>`;
    } else now = `<div class="now empty">아래 목록에서 만들 것을 골라주세요.</div>`;
    const row = o => {
      const cur = c.prodItem && itemKey(c.prodItem) === o.key, item = { kind: o.kind, id: o.id };
      const bc = o.lock ? null : buyCost(c, item);
      const turns = o.lock ? '' : `${turnsLeft(c, item, y)}턴`;
      const main = `<button type="button" class="opt${cur ? ' cur' : ''}${o.lock ? ' locked' : ''}" data-act="prod" data-kind="${o.kind}" data-id="${o.id}"${o.lock ? ' disabled' : ''}>
        <span class="ico">${o.kind === 'unit' ? `<img alt="" src="${ART.tokenURL(o.id, p)}">` : o.icon}</span><span><span class="nm">${o.name}</span><span class="ds">${o.lock || o.desc}</span></span><span class="cost"><b>⚙️ ${o.cost}</b>${turns}</span></button>`;
      return `<div class="opt-wrap">${main}${bc != null ? `<button type="button" class="buy" data-act="buy" data-kind="${o.kind}" data-id="${o.id}" title="금으로 즉시 구매"${p.gold < bc ? ' disabled' : ''}>💰${bc}</button>` : ''}</div>`;
    };
    const group = (title, kind) => { const list = opts.filter(o => o.kind === kind && !o.lock); return list.length ? `<div class="c-sec"><h4>${title}</h4>${list.map(row).join('')}</div>` : ''; };
    const locked = opts.filter(o => o.lock && !(o.kind === 'unit' && UNITS[o.id].faithOnly));
    const cr = cityReligion(c), crP = cr != null ? G.players[cr] : null;
    const share = k => Math.round(c.relP[k] || 0);
    notes += `<p class="c-note">종교: ${crP ? `<b style="color:${crP.color}">${crP.religion.name}</b> (${share(cr)}%)` : '아직 없음 (토착 신앙 ' + share(-1) + '%)'}${p.religion && cr !== 0 ? ` · 내 종교 ${share(0)}%` : ''}</p>`;
    const mLock = missionaryLock(c), mCost = missionaryCost(0);
    const mRow = p.religion ? `<div class="opt-wrap"><div class="opt${mLock ? ' locked' : ''}"><span class="ico"><img alt="" src="${ART.tokenURL('missionary', p)}"></span><span><span class="nm">선교사</span><span class="ds">${mLock || '도시 옆에서 내 종교를 전파해요 (' + (2 + (fac(0, 'solari') ? 1 : 0) + (G.wonders.glassspire && G.wonders.glassspire.pid === 0 ? 1 : 0)) + '회)'}</span></span><span class="cost"></span></div>${mLock ? '' : `<button type="button" class="buy faith" data-act="buyMiss" title="신앙으로 구매"${p.faith < mCost ? ' disabled' : ''}>🙏${mCost}</button>`}</div>` : '';
    const built = (c.wonders || []).map(w => WONDERS[w].icon + ' ' + WONDERS[w].name).concat(Object.keys(c.buildings).map(b => BUILDINGS[b].icon + ' ' + BUILDINGS[b].name)).concat(Object.keys(c.districts).map(d => `${DISTRICTS[d].icon} ${DISTRICTS[d].name} +${districtAdj(d, c.districts[d], 0)}`));
    el.innerHTML = `<div class="c-head"><h2>${c.palace ? '🏛️' : '🏘️'} ${c.name}</h2><span class="pop">인구 ${c.pop}${c.palace ? ' · 수도' : ''}</span><button type="button" class="u-close" data-act="deselect" aria-label="닫기">✕</button></div>
      <div class="c-scroll">
        <div class="c-stats">${stat('f', '식량', sign(y.surplus) + ' <small>' + grow + '</small>')}${stat('p', '생산', '+' + fmt(y.p))}${stat('g', '금', '+' + fmt(y.g))}
          ${stat('s', '과학', '+' + fmt(y.s))}${stat('c', '문화', '+' + fmt(y.c))}${stat('r', '신앙', '+' + fmt(y.r))}
          ${stat('', '주거', c.pop + ' / ' + y.housing)}${stat('', '관광', '+' + fmt(cityTourism(c)))}${stat('', '방어력', cityStr(c))}</div>
        <div class="bar food" title="성장까지"><i style="width:${Math.min(100, c.food / need * 100)}%"></i></div>
        ${notes}
        <p class="c-note">점선 타일에서 시민 ${c.worked.length}명이 일하고 있어요. 국경 확장까지 문화 ${fmt(Math.max(0, borderCost(c) - c.cult))}.${c.hp < 200 ? ` 도시 HP ${c.hp}/200.` : ''}</p>
        ${built.length ? `<p class="c-note">보유: ${built.join(' · ')}</p>` : ''}
        <div class="c-sec"><h4>생산 중</h4>${now}</div>
        ${group('유닛', 'unit')}${mRow}${group('건물', 'building')}${group('지구 — 타일을 직접 골라요', 'district')}${group('불가사의 — 세계에 하나뿐, 타일을 직접 골라요', 'wonder')}${group('사업', 'project')}
        ${locked.length ? `<details class="locked-list"${lockedOpen ? ' open' : ''}><summary>아직 만들 수 없는 것 ${locked.length}개</summary>${locked.map(row).join('')}</details>` : ''}
      </div>`;
    if (sameCity) el.querySelector('.c-scroll').scrollTop = st;
    const det = el.querySelector('details'); if (det) det.addEventListener('toggle', () => { lockedOpen = det.open; });
  }
  function refreshUI() {
    uiDirty = false;
    if (!started || !G) return;
    const p = H(), inc = playerIncome(0);
    $('yields').innerHTML = `<span class="chip sci" title="턴마다 얻는 과학">🔬 <b>+${fmt(inc.s)}</b></span>
      <span class="chip cult" title="문화: 다음 정책까지">🎭 <b>+${fmt(inc.c)}</b> <small>${Math.floor(p.cult)}/${policyCost(p.policies.length)}</small></span>
      <span class="chip faith" title="보유 신앙 (턴당) — 종교 창시와 선교사 구매에 써요">🙏 <b>${Math.floor(p.faith || 0)}</b> <small>${sign(inc.r)}/턴</small></span>
      <span class="chip gold" title="보유 금 (턴당 수입, 군사 유지비 ${inc.upkeep} 포함)">💰 <b>${Math.floor(p.gold)}</b> <small>${sign(inc.net)}/턴</small></span>`;
    const rc = $('researchChip');
    if (p.research) {
      const T = TECHS[p.research], tcst = techCost(p.research), prog = Math.min(tcst, p.techProg[p.research] || 0);
      rc.className = 'research';
      rc.innerHTML = `<div class="r-top"><span class="r-name">연구: <b>${T.name}</b></span><span class="r-turn">${researchTurns(p, p.research, inc.s)}턴</span></div><div class="bar"><i style="width:${prog / tcst * 100}%"></i></div>`;
    } else {
      const can = citiesOf(0).length && availableTechs(0).length;
      rc.className = 'research' + (can ? ' need' : '');
      rc.innerHTML = `<div class="r-top"><span class="r-name">${can ? '연구를 골라주세요' : availableTechs(0).length ? '도시를 세우면 연구할 수 있어요' : '모든 연구 완료'}</span></div><div class="bar"><i style="width:0"></i></div>`;
    }
    $('turnLabel').innerHTML = `<small>${ERAS[playerEra(0)]} 시대</small> 턴 ${Math.min(G.turn, G.maxTurn)}/${G.maxTurn}`;
    $('btnRel').classList.toggle('alert', canFoundReligion(0));
    $('btnPolicy').classList.toggle('alert', !!p.policyOpts);
    $('btnYield').classList.toggle('on', showYields);
    renderAdvisor(); renderUnitPanel(); renderCityPanel();
    $('dock').classList.toggle('city-open', !!selCity());
    const na = nextAction(), nb = $('nextBtn');
    nb.innerHTML = `${na.t}<small>${na.sub || '&nbsp;'}</small>`; nb.className = na.todo ? 'todo' : ''; nb.disabled = !!na.wait;
    const bn = $('banner');
    if (placing) { bn.hidden = false; bn.innerHTML = placing.kind === 'wonder' ? `'${WONDERS[placing.type].name}'을(를) 놓을 타일을 고르세요 (${WONDERS[placing.type].needText}). <button type="button" data-act="cancelPlace">취소</button>` : `${DISTRICTS[placing.type].name}를 놓을 타일을 고르세요. 숫자가 인접 보너스예요. <button type="button" data-act="cancelPlace">취소</button>`; }
    else bn.hidden = true;
    const ti = $('tileInfo'), it = hover >= 0 ? hover : infoTile;
    if (it >= 0 && !selCity() && !placing) { ti.hidden = false; ti.innerHTML = tileInfoHTML(it); } else ti.hidden = true;
    drawMinimap();
  }

  /* ---------- 모달 ---------- */
  function openModal(html, opts) {
    opts = opts || {};
    $('modalBody').innerHTML = html; $('modal').hidden = false;
    modalOnClose = opts.onClose || null; modalSticky = !!opts.sticky;
    $('modal').firstElementChild.classList.toggle('wide', !!opts.wide);
    const f = $('modal').querySelector('.primary, .x'); if (f) f.focus();
  }
  function closeModal() { $('modal').hidden = true; const f = modalOnClose; modalOnClose = null; if (f) f(); HOOK.changed(); }
  const mHead = (title, noX) => `<div class="m-head"><h2>${title}</h2>${noX ? '' : '<button type="button" class="x" data-act="close" aria-label="닫기">✕</button>'}</div>`;
  let confirmFn = null;
  function confirmBox(title, text, okLabel, fn) {
    confirmFn = fn;
    openModal(`${mHead(title)}<div class="m-body"><p>${text}</p></div><div class="m-foot"><button type="button" class="ghost" data-act="close">취소</button><button type="button" class="primary" data-act="confirm">${okLabel}</button></div>`);
  }
  function confirmWar(pid) {
    const P = G.players[pid];
    confirmBox('전쟁 선포', `${P.name}와(과)는 지금 평화 상태예요. 공격하려면 전쟁을 선포해야 해요. 선포할까요?`, '전쟁 선포', () => { declareWar(0, pid); flushNotes(); refreshSel(); });
  }
  function openTech() {
    const p = H(), inc = playerIncome(0), av = availableTechs(0), cols = [[], [], [], [], [], []];
    for (const id in TECHS) cols[TECHS[id].col].push(id);
    const names = ERAS.map(n => n + ' 시대');
    const card = id => {
      const T = TECHS[id], done = p.techs[id], ok = av.indexOf(id) >= 0, cur = p.research === id;
      const cls = done ? 'done' : cur ? 'avail cur' : ok ? 'avail' : 'locked';
      const prog = p.techProg[id] || 0;
      const req = !done && !ok ? `<span class="t-req">선행: ${T.req.filter(r => !p.techs[r]).map(r => TECHS[r].name).join(', ')}</span>` : '';
      const boost = T.boost ? `<span class="t-boost${p.boosted[id] ? ' got' : ''}">${p.boosted[id] ? '✓ 영감 받음' : '💡 ' + T.boost}</span>` : '';
      return `<button type="button" class="tech ${cls}" data-act="research" data-id="${id}"${done || !ok ? ' disabled' : ''}>
        <span class="t-name">${done ? '✓ ' : ''}${T.name}<span class="t-cost">${done ? '' : `${fmt(prog)}/${techCost(id)} · ${researchTurns(p, id, inc.s)}턴`}</span></span>
        <span class="t-unlock">${T.unlock}</span>${boost}${req}</button>`;
    };
    openModal(`${mHead('연구')}<div class="m-body"><p>과학(🔬 턴당 +${fmt(inc.s)})이 쌓여 기술이 완성돼요. 💡 조건을 채우면 그 기술이 40% 앞당겨져요.</p>
      <div class="tech-scroll"><div class="tech-grid">${cols.map((c, k) => `<div class="tech-col"><h5>${names[k]}</h5>${c.map(card).join('')}</div>`).join('')}</div></div></div>`, { wide: true });
  }
  function openPolicy() {
    const p = H();
    const have = p.policies.length ? `<h3>채택한 정책</h3><div class="pol-have">${p.policies.map(id => `<span><b>${POLICIES[id].name}</b> — ${POLICIES[id].desc}</span>`).join('')}</div>` : '';
    if (p.policyOpts) {
      openModal(`${mHead('정책 선택')}<div class="m-body"><p>문화가 쌓여 새 정책을 채택할 수 있어요. 하나를 고르면 게임 끝까지 유지돼요.</p>
        <div class="pol-grid">${p.policyOpts.map(id => `<button type="button" class="pol" data-act="policy" data-id="${id}"><b>${POLICIES[id].name}</b>${POLICIES[id].desc}</button>`).join('')}</div>${have}</div>`);
    } else {
      openModal(`${mHead('정책')}<div class="m-body"><p>다음 정책까지 문화 ${Math.floor(p.cult)} / ${policyCost(p.policies.length)}. 기념비·원형극장·문화 지구가 문화를 늘려줘요.</p>${have || '<p>아직 채택한 정책이 없어요.</p>'}</div>`);
    }
  }
  function openDiplo() {
    const p = H(), myPow = milPower(0);
    const rows = majors().map(q => {
      const me = q.id === 0, met = me || p.met[q.id] || G.over;
      if (!met) return `<tr><td colspan="6"><span class="dot" style="background:#555"></span>아직 만나지 못한 세력</td></tr>`;
      const F = FACTIONS.find(f => f.id === q.faction), pw = milPower(q.id);
      const rel = pw > myPow * 1.4 + 10 ? '우리보다 강함' : pw < myPow * 0.7 - 10 ? '우리보다 약함' : '비슷함';
      let status = '', act = '';
      if (!q.alive) status = '<span class="pill">멸망</span>';
      else if (!me) {
        const war = atWar(0, q.id);
        status = war ? '<span class="pill war">전쟁</span>' : '<span class="pill peace">평화</span>';
        if (!G.over) act = war ? `<button type="button" data-act="peace" data-id="${q.id}">평화 제안</button>` : `<button type="button" data-act="war" data-id="${q.id}">전쟁 선포</button>`;
      }
      return `<tr><td><span class="dot" style="background:${q.color}"></span><b>${q.name}</b>${me ? ' (나)' : ''}<span class="sub">${F.leader} · ${F.trait} · ${F.ltrait}${q.religion ? ` · 🙏 ${q.religion.name}` : ''}</span></td>
        <td>${playerScore(q.id)}</td><td>${citiesOf(q.id).length}</td><td>${techCount(q.id)}</td><td>${me ? '—' : rel}</td><td>${status} ${act}</td></tr>`;
    }).join('');
    const obs = G.cities.find(c => c.owner === 0 && c.progress['project:space']);
    const rivals = majors().filter(q => q.alive && q.id !== 0);
    const cultLine = rivals.map(q => `${p.met[q.id] || G.over ? q.name : '미지의 세력'} ${Math.floor(p.tourism || 0)}/${cultureNeed(q.id)}`).join(' · ');
    const relLine = p.religion ? religionProgress(0).map(x => `${x.pid === 0 ? '내 도시' : (p.met[x.pid] || G.over ? G.players[x.pid].name : '미지의 세력')} ${x.have}/${x.total}`).join(' · ') : '아직 종교가 없어요';
    const caps = G.cities.filter(c => c.origCap != null), mine = caps.filter(c => c.owner === 0).length;
    openModal(`${mHead('외교 · 승리 현황')}<div class="m-body"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>세력</th><th>점수</th><th>도시</th><th>기술</th><th>군사력</th><th>관계</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="vict"><div><b>과학 승리</b><small>'로켓 공학' 연구 → 연구소가 있는 도시에서 우주 탐사선 완성</small>기술 ${techCount(0)}/${Object.keys(TECHS).length}${obs ? ` · 탐사선 ${Math.floor(obs.progress['project:space'])}/${itemCost(obs, { kind: 'project', id: 'space' })}` : ''}</div>
      <div><b>문화 승리</b><small>내 누적 관광이 다른 모든 세력의 누적 문화(의 80%)를 넘어서기 · 지금 턴당 관광 +${fmt(playerTourism(0))}</small>${cultLine}</div>
      <div><b>종교 승리</b><small>모든 세력에서 도시의 절반 넘게 내 종교를 믿게 하기</small>${relLine}</div>
      <div><b>정복 승리</b><small>모든 세력의 처음 수도를 점령</small>수도 ${mine}/${majors().length} 보유</div>
      <div><b>점수 승리</b><small>${G.maxTurn}턴이 끝날 때 점수 1위</small>현재 ${playerScore(0)}점 · ${Math.max(0, G.maxTurn - G.turn + 1)}턴 남음</div></div></div>`);
  }
  let relName = 0;
  function openReligion() {
    const p = H();
    let body;
    const cityRows = () => {
      const known = G.cities.filter(c => G.over || p.explored[c.pos]);
      return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>도시</th><th>세력</th><th>믿는 종교</th><th>내 종교 비중</th></tr></thead><tbody>${known.map(c => {
        const r = cityReligion(c), R = r != null ? G.players[r] : null;
        return `<tr><td>${c.name}</td><td><span class="dot" style="background:${G.players[c.owner].color}"></span>${G.players[c.owner].name}</td><td>${R ? `<span class="dot" style="background:${R.color}"></span>${R.religion.name}` : '<em style="color:var(--dim);font-style:normal">토착 신앙</em>'}</td><td>${p.religion ? Math.round(c.relP[0] || 0) + '%' : '—'}</td></tr>`;
      }).join('')}</tbody></table></div>`;
    };
    if (p.religion) {
      const B = BELIEFS[p.religion.belief], pr = religionProgress(0);
      body = `<p><b>${p.religion.name}</b> — 성도 ${G.cities[p.religion.holy].name} · 교리 <b>${B.name}</b>: ${B.desc}</p>
        <p>성지와 성소가 있는 도시에서 신앙 🙏${missionaryCost(0)}으로 선교사를 살 수 있어요 (도시 창의 유닛 목록). 선교사를 다른 도시 옆으로 보내 [전도]하세요.</p>
        <h3>종교 승리까지</h3><div class="pol-have">${pr.map(x => `<span>${x.pid === 0 ? '내 도시' : (p.met[x.pid] ? G.players[x.pid].name : '미지의 세력')} <b>${x.have}/${x.total}</b>${x.have * 2 > x.total ? ' ✓' : ''}</span>`).join('')}</div>
        <h3>도시별 종교</h3>${cityRows()}`;
    } else if (canFoundReligion(0)) {
      p.tut.skipRel = 0;
      body = `<p>신앙이 ${foundCost()} 모였어요. 종교를 창시하면 성지가 있는 도시가 <b>성도</b>가 되고, 선교사로 다른 도시에 전파할 수 있어요.</p>
        <p>이름: <b>${RELIGION_NAMES[relName]}</b> <button type="button" class="act" data-act="relName">다른 이름</button></p>
        <h3>교리를 하나 고르세요</h3><div class="pol-grid">${Object.keys(BELIEFS).map(id => `<button type="button" class="pol" data-act="belief" data-id="${id}"><b>${BELIEFS[id].name}</b>${BELIEFS[id].desc}</button>`).join('')}</div>
        <div class="acts"><button type="button" class="act" data-act="relLater">나중에 정할게요</button></div>`;
    } else {
      const left = religionSlots() - religionsFounded(), hasHoly = citiesOf(0).some(c => c.districts.holy != null);
      body = `<p>${left <= 0 ? '이미 세계의 종교가 모두 창시됐어요. 다른 세력의 종교가 내 도시에 퍼질 수 있어요.' : `종교는 세계에 ${religionSlots()}개까지만 생겨요 (남은 자리 ${left}개). 먼저 창시하는 세력이 임자예요.`}</p>
        <ul><li>${p.techs.astrology ? '✓' : '①'} '점성술' 연구</li><li>${hasHoly ? '✓' : '②'} 도시에 <b>성지</b> 지구 건설 (산이나 숲 옆이 좋아요) → 성소·사원으로 신앙 늘리기</li><li>③ 신앙 ${Math.floor(p.faith || 0)} / ${foundCost()} 모으기</li></ul>
        <h3>도시별 종교</h3>${cityRows()}`;
    }
    openModal(`${mHead('종교')}<div class="m-body">${body}</div>`);
  }
  function showPeaceOffer() {
    const pid = G.peaceOffer, P = G.players[pid];
    openModal(`${mHead('평화 제안', true)}<div class="m-body"><p>${P.name}이(가) 전쟁을 끝내자고 제안했어요. 받아들일까요?</p></div>
      <div class="m-foot"><button type="button" class="ghost" data-act="peaceNo">거절</button><button type="button" class="primary" data-act="peaceYes">평화 수락</button></div>`, { sticky: true });
  }
  const HELP = {
    flow: `<h3>한 턴의 흐름</h3><p>오른쪽 아래 큰 버튼이 지금 해야 할 일을 차례로 알려줘요. 연구 선택 → 도시 생산 선택 → 유닛 명령이 끝나면 [턴 종료]가 돼요.</p>
      <h3>여섯 가지 산출</h3><ul><li><b style="color:var(--food)">식량</b> — 도시 인구를 키워요. 시민 1명당 식량 2를 먹고, 남는 만큼 쌓여 인구가 늘어요.</li>
      <li><b style="color:var(--prod)">생산</b> — 유닛·건물·지구를 만드는 속도예요.</li><li><b style="color:var(--gold)">금</b> — 즉시 구매와 군사 유지비에 써요.</li>
      <li><b style="color:var(--sci)">과학</b> — 기술 연구 속도예요.</li><li><b style="color:var(--cult)">문화</b> — 국경을 넓히고 정책을 열어요.</li><li><b style="color:#d9c8ff">신앙</b> — 종교를 창시하고 선교사를 사요.</li></ul>
      <h3>추천 초반 순서</h3><ul><li>1턴: 그 자리에 도시 건설 → 정찰병 생산, 연구는 채광이나 목축.</li><li>이어서 건설자 → 정착민. 전사로 주변을 밝혀 두 번째 도시 자리를 찾아요.</li>
      <li>20~30턴: 도시 2~3개, 기념비, 그리고 '문자' 연구 후 학문 지구.</li><li>약탈자가 보이면 궁수를 1~2기 뽑아두면 든든해요.</li></ul>`,
    keys: `<h3>마우스 · 터치</h3><div class="keys"><kbd>클릭 / 탭</kbd><span>유닛·도시 선택, 선택한 유닛에게 이동·공격 명령</span><kbd>우클릭 / 길게 누르기</kbd><span>무조건 이동·공격 명령 (유닛을 도시 안으로 넣을 때 편해요)</span>
      <kbd>드래그</kbd><span>지도 이동</span><kbd>휠 / 두 손가락</kbd><span>확대·축소</span></div>
      <h3>키보드</h3><div class="keys"><kbd>Enter</kbd><span>다음 할 일 / 턴 종료</span><kbd>Space</kbd><span>선택한 유닛 이번 턴 대기</span><kbd>B</kbd><span>도시 건설</span><kbd>F</kbd><span>쉬기 (방어 태세)</span>
      <kbd>E</kbd><span>자동 탐험</span><kbd>T</kbd><span>연구 창</span><kbd>Y</kbd><span>타일 산출량 표시</span><kbd>Esc</kbd><span>선택 해제 / 창 닫기</span><kbd>방향키</kbd><span>지도 이동</span></div>`,
    gloss: `<div class="gloss">
      <div><b>타일과 시민</b><span>도시는 인구 1명당 주변 타일 1개에서 일해 산출을 얻어요. 도시를 누르면 일하는 타일이 점선으로 보여요.</span></div>
      <div><b>주거 공간</b><span>인구의 상한선이에요. 호수 옆 6, 해안 옆 5, 그 외 3에서 시작하고 곡창·지구로 늘어나요.</span></div>
      <div><b>건설자</b><span>농장(식량+1), 광산(생산+1), 목장, 농원을 지어요. 3회 쓰면 사라지는 소모품이에요.</span></div>
      <div><b>자원</b><span>보너스(산출 증가), 사치(금), 전략(말·철: 개발해야 기마병·검사를 만들 수 있어요).</span></div>
      <div><b>지구와 인접 보너스</b><span>학문·상업·산업·문화 지구는 놓는 타일 주변 지형에 따라 보너스가 달라져요. 인구 3마다 1개 지을 수 있어요.</span></div>
      <div><b>영감</b><span>기술마다 정해진 행동(광산 건설, 적 처치 등)을 하면 연구가 40% 앞당겨져요.</span></div>
      <div><b>전투력</b><span>전투력 차이가 클수록 주는 피해는 늘고 받는 피해는 줄어요. 다친 유닛, 평지의 유닛은 약해져요.</span></div>
      <div><b>지형 방어</b><span>언덕 +3, 숲 +3, 움직이지 않고 버티면 턴마다 +3(최대 +6). 가만히 있으면 체력도 회복해요.</span></div>
      <div><b>원거리와 근접</b><span>궁수는 반격 없이 때리지만 도시를 점령할 수 없어요. 도시 HP를 0으로 만든 뒤 근접 유닛이 들어가야 해요.</span></div>
      <div><b>협공</b><span>적 주변에 내 군사 유닛이 더 있으면 1기당 전투력 +2를 받아요.</span></div>
      <div><b>약탈자</b><span>야영지(🔥)에서 계속 생겨나요. 야영지 타일에 군사 유닛이 들어가면 파괴하고 금 40을 얻어요.</span></div>
      <div><b>유지비</b><span>군사 유닛은 2기까지 무료, 그 뒤로는 1기당 턴마다 금 1이 들어요.</span></div>
      <div><b>신앙과 종교</b><span>성지·성소·사원이 신앙을 만들어요. 신앙으로 종교를 창시하고 선교사를 사요. 도시마다 종교 비중이 있고, 가장 높은 종교가 그 도시의 종교예요.</span></div>
      <div><b>불가사의</b><span>세계에 하나뿐인 건축물이에요. 타일에 직접 놓고, 저마다 "산 옆", "물가" 같은 조건이 있어요.</span></div>
      <div><b>관광</b><span>문화 지구 건물과 불가사의가 만들어요. 쌓인 관광이 상대의 문화를 넘어서면 문화 승리예요.</span></div>
      <div><b>유닛 업그레이드</b><span>기술이 발전하면 내 영토 안에서 금을 내고 옛 유닛을 새 유닛으로 바꿀 수 있어요 (전사 → 검사 → 머스킷병 → 소총병).</span></div>
      <div><b>시대</b><span>고대 → 고전 → 중세 → 르네상스 → 산업 → 현대. 약탈자도 시대에 맞춰 강해져요.</span></div></div>`,
    win: `<h3>과학 승리</h3><p>'로켓 공학'까지 연구한 뒤, 연구소가 있는 도시에서 <b>우주 탐사선</b>을 완성하면 이겨요. 학문 지구 → 도서관 → 대학 → 연구소 순서로 지어야 해요.</p>
      <h3>문화 승리</h3><p>원형극장·박물관·방송국과 <b>불가사의</b>가 <b>관광</b>을 만들어요. 내 누적 관광이 다른 모든 세력의 누적 문화(의 80%)를 넘어서면 이겨요. 상대가 문화를 많이 쌓을수록 어려워져요.</p>
      <h3>종교 승리</h3><p>성지에서 신앙을 모아 종교를 창시하고, 선교사로 전파해요. <b>모든 세력에서 도시의 절반 넘게</b> 내 종교를 믿으면 이겨요. 내 도시도 포함이에요.</p>
      <h3>정복 승리</h3><p>다른 모든 세력의 <b>처음 수도</b>를 점령하면 이겨요. 도시는 원거리·공성 유닛으로 HP를 깎고 근접 유닛으로 마무리해요.</p>
      <h3>점수 승리</h3><p>마지막 턴까지 아무도 이기지 못하면 점수가 가장 높은 세력이 이겨요.</p>
      <h3>패배</h3><p>마지막 도시를 잃거나, 다른 세력이 먼저 승리 조건을 채우면 져요.</p>`,
    next: `<p>테라 헥사는 헥스 타일 4X 전략의 핵심 시스템을 간추린 게임이에요. 여기서 익힌 감각은 「문명 6」 같은 본격적인 4X 게임에서도 거의 그대로 통해요.</p>
      <h3>그대로 통하는 것</h3><ul><li>물가에 정착하면 주거가 넉넉하다 · 시민이 타일에서 일한다 · 건설자는 횟수 제한 소모품이다</li>
      <li>지구는 직접 타일에 놓고, 주변 지형에 따라 인접 보너스가 달라진다 (학문 지구는 산 옆!)</li>
      <li>특정 행동으로 연구가 앞당겨진다 (문명 6의 '유레카') · 한 타일에 유닛 하나</li>
      <li>성지에서 신앙을 모아 종교를 창시하고 선교사로 전파 · 불가사의는 조건에 맞는 타일에 직접 건설</li>
      <li>과학·문화·종교·정복·점수 승리, 지도자마다 다른 고유 능력</li>
      <li>언덕·숲의 방어 보너스, 원거리로 깎고 근접으로 점령, 야만인 주둔지 정리</li></ul>
      <h3>본격적인 게임에서 더해지는 것</h3><ul><li><b>사회 제도 트리와 정부·정책 카드</b> — 여기서는 '정책 3택 1'로 단순화했어요.</li>
      <li><b>강과 담수</b>, <b>쾌적도</b>(사치 자원이 도시 만족도를 올림), <b>교역로</b>, <b>위인과 걸작</b>, <b>도시국가</b>, <b>충성도</b></li>
      <li>종교는 신앙 전투(사도·심문관)와 여러 겹의 교리가 더해지고, 문화 승리는 걸작·유물·국립공원까지 얽혀요.</li>
      <li><b>해상 유닛과 승선</b>, 유닛 <b>진급</b>과 업그레이드, 훨씬 큰 기술 트리와 여러 시대</li>
      </ul>
      <p>친구에게 가르칠 때는 "도시 자리 고르기 → 건설자로 개발 → 지구 인접 보너스" 세 가지만 여기서 손에 익혀도 첫 판이 훨씬 수월해져요.</p>`,
  };
  function openHelp(tab) {
    tab = tab || 'flow';
    const tabs = [['flow', '게임 흐름'], ['keys', '조작법'], ['gloss', '개념 사전'], ['win', '승리 조건'], ['next', '다음 단계']];
    openModal(`${mHead('도움말')}<div class="tabs">${tabs.map(t => `<button type="button" data-act="help" data-id="${t[0]}" class="${t[0] === tab ? 'on' : ''}">${t[1]}</button>`).join('')}</div><div class="m-body">${HELP[tab]}</div>`);
  }
  function openMenu() {
    const p = H();
    openModal(`${mHead('메뉴')}<div class="m-body"><p>매 턴이 끝날 때 이 브라우저에 자동 저장돼요.</p>
      <div class="acts"><button type="button" class="act" data-act="advOnOff">길잡이 ${p.tut.off ? '켜기' : '끄기'}</button><button type="button" class="act" data-act="sound">효과음 ${SFX.on ? '끄기' : '켜기'}</button><button type="button" class="act" data-act="history">지난 알림 보기</button><button type="button" class="act danger" data-act="newGame">새 게임</button></div></div>`);
  }
  function showEnd() {
    const o = G.over, W = G.players[o.winner], win = o.winner === 0;
    if (!showEnd.played) { showEnd.played = true; SFX.play(win ? 'win' : 'lose'); }
    const kind = { science: '과학 승리', culture: '문화 승리', religion: '종교 승리', domination: '정복 승리', score: '점수 승리', defeat: '패배' }[o.type];
    const title = win ? `${kind}!` : o.type === 'defeat' ? '도시를 모두 잃었어요' : `${W.name}의 ${kind}`;
    const text = win ? '축하해요! 문명을 승리로 이끌었어요.' : '아쉽지만 이번 판은 여기까지예요. 지도 전체가 공개됐으니 상대가 어떻게 발전했는지 살펴보세요.';
    const rows = majors().sort((a, b) => playerScore(b.id) - playerScore(a.id)).map(q => `<tr><td><span class="dot" style="background:${q.color}"></span>${q.name}${q.id === 0 ? ' (나)' : ''}</td><td>${playerScore(q.id)}</td><td>${citiesOf(q.id).length}</td><td>${techCount(q.id)}</td></tr>`).join('');
    openModal(`${mHead(title)}<div class="m-body"><p>${text} (${Math.min(G.turn, G.maxTurn)}턴)</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th>세력</th><th>점수</th><th>도시</th><th>기술</th></tr></thead><tbody>${rows}</tbody></table></div></div>
      <div class="m-foot"><button type="button" class="ghost" data-act="close">지도 둘러보기</button><button type="button" class="primary" data-act="toSetup">새 게임</button></div>`);
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 무시 */ }
  }

  /* ---------- 클릭 위임 ---------- */
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) { if (e.target.id === 'modal' && !modalSticky) closeModal(); return; }
    const a = b.dataset.act, d = b.dataset;
    if (a === 'close') closeModal();
    else if (a === 'confirm') { const f = confirmFn; confirmFn = null; closeModal(); if (f) f(); }
    else if (a === 'unit') unitAct(d.a, d.arg);
    else if (a === 'deselect') deselect();
    else if (a === 'prod') chooseProd(d.kind, d.id);
    else if (a === 'buyMiss') { const c = selCity(); if (c && buyMissionary(c)) { SFX.play('faith'); flushNotes(); } }
    else if (a === 'buy') { const c = selCity(); if (c && buyItem(c, { kind: d.kind, id: d.id })) { flushNotes(); toast('구매했어요.'); } }
    else if (a === 'cancelPlace') { const c = G.cities[placing.cityId]; placing = null; selectCity(c); }
    else if (a === 'research') { H().research = d.id; SFX.play('click'); closeModal(); }
    else if (a === 'policy') { choosePolicy(0, d.id); SFX.play('policy'); closeModal(); toast(`'${POLICIES[d.id].name}' 정책을 채택했어요.`); }
    else if (a === 'war') { closeModal(); confirmWar(+d.id); }
    else if (a === 'peace') {
      const pid = +d.id;
      if (aiAcceptsPeace(pid, 0)) { makePeace(0, pid); flushNotes(); refreshSel(); openDiplo(); toast('평화 협정을 맺었어요.'); }
      else toast(`${G.players[pid].name}이(가) 아직은 평화를 원하지 않아요.`);
    }
    else if (a === 'peaceYes') { makePeace(0, G.peaceOffer); G.peaceOffer = null; flushNotes(); closeModal(); autoSelect(); }
    else if (a === 'peaceNo') { G.peaceOffer = null; closeModal(); autoSelect(); }
    else if (a === 'belief') { if (foundReligion(0, RELIGION_NAMES[relName], d.id)) { flushNotes(); openReligion(); } }
    else if (a === 'relName') { relName = (relName + 1) % RELIGION_NAMES.length; openReligion(); }
    else if (a === 'relLater') { H().tut.skipRel = 1; closeModal(); }
    else if (a === 'help') openHelp(d.id);
    else if (a === 'advToggle') { advisorOpen = !advisorOpen; uiDirty = true; }
    else if (a === 'sound') { SFX.toggle(); openMenu(); }
    else if (a === 'advOnOff') { H().tut.off = !H().tut.off; closeModal(); }
    else if (a === 'history') openModal(`${mHead('지난 알림')}<div class="m-body">${history.length ? history.slice().reverse().map(n => `<p><em style="color:var(--dim);font-style:normal">${n.turn}턴</em> ${n.msg}</p>`).join('') : '<p>아직 알림이 없어요.</p>'}</div>`);
    else if (a === 'newGame') confirmBox('새 게임', '지금 게임을 그만두고 처음 화면으로 돌아갈까요?', '새 게임', toSetup);
    else if (a === 'toSetup') { closeModal(); toSetup(); }
    else if (a === 'note') { const n = logItems[+d.k]; if (n && n.pos >= 0) centerOn(n.pos, true); }
  });
  $('nextBtn').addEventListener('click', () => { if (started && !busy) nextAction().f(); });
  $('researchChip').addEventListener('click', openTech);
  $('btnTech').addEventListener('click', openTech);
  $('btnPolicy').addEventListener('click', openPolicy);
  $('btnDiplo').addEventListener('click', openDiplo);
  $('btnRel').addEventListener('click', openReligion);
  $('btnHelp').addEventListener('click', () => openHelp());
  $('btnMenu').addEventListener('click', openMenu);
  $('btnYield').addEventListener('click', () => { showYields = !showYields; HOOK.changed(); });
  $('minimap').addEventListener('click', e => {
    const r = e.currentTarget.getBoundingClientRect();
    cam.x = (e.clientX - r.left) / r.width * S * SQ3 * (G.W + 0.5) - S * SQ3 / 2; cam.y = (e.clientY - r.top) / r.height * S * 1.5 * G.H - S * 0.75;
    camTo = null; clampCam(); HOOK.changed();
  });

  /* ---------- 지도 입력 ---------- */
  const pts = new Map();
  let drag = null, pinch = null, longTimer = 0;
  const local = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener('pointerdown', e => {
    if (!started) return;
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    const [x, y] = local(e);
    pts.set(e.pointerId, [x, y]); camTo = null;
    if (pts.size === 1) {
      drag = { sx: x, sy: y, cx: cam.x, cy: cam.y, moved: false, long: false, button: e.button };
      clearTimeout(longTimer);
      if (e.pointerType !== 'mouse') longTimer = setTimeout(() => { if (drag && !drag.moved) { drag.long = true; onTap(tileAt(drag.sx, drag.sy), true); } }, 520);
    } else if (pts.size === 2) {
      clearTimeout(longTimer);
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: cam.z };
      if (drag) drag.moved = true;
    }
  });
  cv.addEventListener('pointermove', e => {
    const [x, y] = local(e);
    if (pts.has(e.pointerId)) pts.set(e.pointerId, [x, y]);
    if (pinch && pts.size === 2) {
      const [a, b] = [...pts.values()];
      cam.z = Math.max(0.45, Math.min(2.2, pinch.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d)); dirty = true;
      return;
    }
    if (drag && pts.size === 1) {
      const dx = x - drag.sx, dy = y - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) > 7) { drag.moved = true; clearTimeout(longTimer); cv.style.cursor = 'grabbing'; }
      if (drag.moved) { cam.x = drag.cx - dx / cam.z; cam.y = drag.cy - dy / cam.z; clampCam(); dirty = true; }
      return;
    }
    if (e.pointerType === 'mouse' && started) {
      const i = tileAt(x, y);
      if (i !== hover) {
        hover = i; hoverPath = null;
        const su = selUnit();
        if (su && i >= 0 && i !== su.pos && H().explored[i] && passable(G.tiles[i]) && !G.over) hoverPath = findPath(su, i);
        HOOK.changed();
      }
    }
  });
  const up = e => {
    const had = pts.has(e.pointerId);
    pts.delete(e.pointerId); clearTimeout(longTimer); cv.style.cursor = 'grab';
    if (pts.size < 2) pinch = null;
    if (had && drag && pts.size === 0) {
      const d = drag; drag = null;
      if (!d.moved && !d.long && e.type === 'pointerup') onTap(tileAt(d.sx, d.sy), d.button === 2);
    }
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', () => { if (hover !== -1) { hover = -1; hoverPath = null; HOOK.changed(); } });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('wheel', e => {
    if (!started) return;
    e.preventDefault();
    const [x, y] = local(e), wx = (x - vw / 2) / cam.z + cam.x, wy = (y - vh / 2) / cam.z + cam.y;
    cam.z = Math.max(0.45, Math.min(2.2, cam.z * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
    cam.x = wx - (x - vw / 2) / cam.z; cam.y = wy - (y - vh / 2) / cam.z; camTo = null; clampCam(); dirty = true;
  }, { passive: false });
  window.addEventListener('keydown', e => {
    if (!started || e.metaKey || e.ctrlKey || e.altKey) return;
    if (!$('modal').hidden) { if (e.key === 'Escape' && !modalSticky) closeModal(); return; }
    const k = e.key.toLowerCase();
    if (k === 'enter') { e.preventDefault(); if (!busy) nextAction().f(); }
    else if (k === ' ') { e.preventDefault(); unitAct('skip'); }
    else if (k === 'b') { const u = selUnit(); if (u && u.type === 'settler') unitAct('found'); }
    else if (k === 'f') { if (selUnit()) unitAct('sleep'); }
    else if (k === 'e') { const u = selUnit(); if (u && isMil(u)) unitAct('explore'); }
    else if (k === 't') openTech();
    else if (k === 'y') { showYields = !showYields; HOOK.changed(); }
    else if (k === 'escape') { if (placing) { const c = G.cities[placing.cityId]; placing = null; selectCity(c); } else deselect(); }
    else if (k.startsWith('arrow')) { const st = 90 / cam.z; cam.x += k === 'arrowleft' ? -st : k === 'arrowright' ? st : 0; cam.y += k === 'arrowup' ? -st : k === 'arrowdown' ? st : 0; camTo = null; clampCam(); dirty = true; e.preventDefault(); }
    else if (k === '+' || k === '=') { cam.z = Math.min(2.2, cam.z * 1.15); dirty = true; }
    else if (k === '-') { cam.z = Math.max(0.45, cam.z / 1.15); dirty = true; }
  });
  window.addEventListener('resize', () => { resize(); uiDirty = true; });

  /* ---------- 시작 화면 ---------- */
  const DIFF_HINT = {
    easy: '입문 — 다른 세력이 먼저 전쟁을 걸지 않고, 문화·종교 승리도 노리지 않아요. 천천히 배우기 좋아요.',
    normal: '보통 — 다른 세력이 기회를 보면 전쟁을 걸어와요.',
    hard: '어려움 — 다른 세력이 더 빨리 발전하고 더 공격적이에요.',
  };
  function renderSetup() {
    $('factionList').innerHTML = FACTIONS.map(f => `<button type="button" class="fac${f.id === setupSel.faction ? ' on' : ''}" data-f="${f.id}"><span class="sw" style="background:${f.color}"></span><b>${f.name}</b><span class="ld">${f.leader}</span><span>${f.trait}<br>${f.ltrait}</span></button>`).join('');
    for (const b of $('segLen').children) b.classList.toggle('on', b.dataset.v === setupSel.length);
    for (const b of $('segAI').children) b.classList.toggle('on', +b.dataset.v === setupSel.numAI);
    for (const b of $('segDiff').children) b.classList.toggle('on', b.dataset.v === setupSel.difficulty);
    $('diffHint').textContent = DIFF_HINT[setupSel.difficulty] + ` 게임 길이: ${GAME_LENGTH[setupSel.length].turns}턴.`;
    $('btnContinue').hidden = !hasSave();
  }
  $('factionList').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b) { setupSel.faction = b.dataset.f; renderSetup(); } });
  $('segAI').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) { setupSel.numAI = +b.dataset.v; renderSetup(); } });
  $('segLen').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) { setupSel.length = b.dataset.v; renderSetup(); } });
  $('segDiff').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) { setupSel.difficulty = b.dataset.v; renderSetup(); } });
  $('btnStart').addEventListener('click', () => { newGame(setupSel); begin(); save(); });
  $('btnContinue').addEventListener('click', () => {
    try { deserialize(localStorage.getItem(SAVE_KEY)); begin(); }
    catch (e) { $('btnContinue').hidden = true; $('diffHint').textContent = '저장된 게임을 불러오지 못했어요. 새 게임을 시작해 주세요.'; }
  });
  function toSetup() {
    started = false; sel = null; reach = null; placing = null;
    for (const id of ['top', 'dock', 'cityPanel']) $(id).hidden = true;
    makeBackdrop();
    $('setup').hidden = false; renderSetup(); dirty = true;
  }
  function makeBackdrop() { try { newGame({ seed: 5000 + Math.floor(Math.random() * 4000), numAI: 2 }); } catch (e) { G = null; } }
  function begin() {
    const p = H();
    if (!p.tut) p.tut = {};
    started = true; logItems = []; history = []; fxList = []; upos.clear(); ghosts = []; strikes = []; showEnd.played = false; sel = null; placing = null; hover = -1; infoTile = -1;
    $('setup').hidden = true; $('modal').hidden = true;
    for (const id of ['top', 'dock']) $(id).hidden = false;
    resize();
    cam.z = narrow() ? 0.8 : 1;
    const first = unitsOf(0)[0] || citiesOf(0)[0];
    if (first) centerOn(first.pos, false);
    advisorOpen = true; lastQuest = -1;
    flushNotes();
    if (G.over) showEnd(); else if (!autoSelect()) deselect();
    HOOK.changed();
  }

  function tick(now) {
    now = now || performance.now();
    const dt = Math.min(60, now - lastTick); lastTick = now;
    if (upos.size) {
      for (const [id, a] of upos) {
        if (!a.q.length) { upos.delete(id); continue; }
        const [tx, ty] = tc(a.q[0]), sp = S * SQ3 * (6 + a.q.length * 2.5) / 1000 * dt, dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
        if (d <= sp) { a.x = tx; a.y = ty; a.q.shift(); } else { a.x += dx / d * sp; a.y += dy / d * sp; }
      }
      dirty = true;
    }
    if (strikes.length) { strikes = strikes.filter(s => now - s.t < 450); dirty = true; }
    if (ghosts.length) { ghosts = ghosts.filter(g => now - g.t < 450); dirty = true; }
    if (camTo) {
      cam.x += (camTo.x - cam.x) * 0.2; cam.y += (camTo.y - cam.y) * 0.2;
      if (Math.abs(camTo.x - cam.x) + Math.abs(camTo.y - cam.y) < 1) camTo = null;
      clampCam(); dirty = true;
    }
    if (uiDirty) refreshUI();
    if (dirty || fxList.length || !started) draw(now);
    requestAnimationFrame(tick);
  }
  window.__th = { tap: onTap, next: () => nextAction(), tc, toScreen, start: o => { newGame(o); begin(); }, sel: () => sel, placing: () => placing };
  makeBackdrop(); renderSetup(); resize(); requestAnimationFrame(tick);
})();
