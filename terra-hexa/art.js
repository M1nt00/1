'use strict';
/* 테라 헥사 — 지도 그림: 지형, 개발 시설, 도시, 지구, 유닛 토큰 (모두 캔버스로 직접 그림) */

const HEX = 38;
const ART = (function () {
  const S = HEX, TAU = Math.PI * 2;
  const CORN = [];
  for (let k = 0; k < 6; k++) { const a = (60 * k - 30) * Math.PI / 180; CORN.push([Math.cos(a), Math.sin(a)]); }

  function rng(seed) {
    let s = (seed * 2654435761) >>> 0;
    return () => { s = (s + 0x6D2B79F5) | 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function hex(c, x, y, k) {
    c.beginPath();
    for (let j = 0; j < 6; j++) { const px = x + CORN[j][0] * S * k, py = y + CORN[j][1] * S * k; if (j) c.lineTo(px, py); else c.moveTo(px, py); }
    c.closePath();
  }
  function poly(c, pts) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let k = 2; k < pts.length; k += 2) c.lineTo(pts[k], pts[k + 1]); c.closePath(); }
  /* amt > 0 밝게, < 0 어둡게 */
  function shade(col, amt) {
    const n = parseInt(col.slice(1, 7), 16), t = amt < 0 ? 0 : 255, a = Math.abs(amt);
    const f = v => Math.round(v + (t - v) * a);
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }
  function lum(col) { const n = parseInt(col.slice(1, 7), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; }

  const BASE = { ocean: '#1b4266', coast: '#2e7499', lake: '#4a9cbc', grass: '#6b9d49', plains: '#a8a453', desert: '#dcc480', tundra: '#9aa9a1', mountain: '#817c75' };

  /* ----- 지형 바닥 ----- */
  function tileBase(c, i, x, y) {
    const t = G.tiles[i], r = rng(i + 7), base = BASE[t.t];
    hex(c, x, y, 1.02); c.fillStyle = shade(base, (r() - 0.5) * 0.12); c.fill();
    c.save(); hex(c, x, y, 1); c.clip();
    const px = () => x + (r() - 0.5) * S * 1.5, py = () => y + (r() - 0.5) * S * 1.6;
    if (t.t === 'ocean' || t.t === 'coast' || t.t === 'lake') {
      c.strokeStyle = t.t === 'ocean' ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.17)'; c.lineWidth = 1.4; c.lineCap = 'round';
      for (let k = 0; k < 3; k++) { const wx = px(), wy = py(), w = S * (0.16 + r() * 0.1); c.beginPath(); c.moveTo(wx - w, wy); c.quadraticCurveTo(wx - w / 2, wy - w * 0.45, wx, wy); c.quadraticCurveTo(wx + w / 2, wy + w * 0.45, wx + w, wy); c.stroke(); }
      for (let k = 0; k < 6; k++) { // 해변
        const n = M.nei[i][k];
        if (n < 0 || TERRAINS[G.tiles[n].t].water) continue;
        const a = CORN[k], b = CORN[(k + 1) % 6];
        c.lineCap = 'round';
        c.strokeStyle = t.t === 'lake' ? '#b7c489' : '#e3d39c'; c.lineWidth = S * 0.26;
        c.beginPath(); c.moveTo(x + a[0] * S, y + a[1] * S); c.lineTo(x + b[0] * S, y + b[1] * S); c.stroke();
        c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(x + a[0] * S * 0.82, y + a[1] * S * 0.82); c.lineTo(x + b[0] * S * 0.82, y + b[1] * S * 0.82); c.stroke();
      }
    } else if (t.t === 'grass') {
      c.lineWidth = 1.3; c.lineCap = 'round';
      for (let k = 0; k < 11; k++) { const gx = px(), gy = py(); c.strokeStyle = k % 3 ? shade(base, -0.2) : shade(base, 0.16); c.beginPath(); c.moveTo(gx - 2.5, gy - 3.5); c.lineTo(gx, gy); c.lineTo(gx + 2.5, gy - 3.5); c.stroke(); }
    } else if (t.t === 'plains') {
      c.lineWidth = 1.3; c.lineCap = 'round';
      for (let k = 0; k < 10; k++) { const gx = px(), gy = py(), w = 3 + r() * 4; c.strokeStyle = k % 3 ? shade(base, -0.17) : shade(base, 0.2); c.beginPath(); c.moveTo(gx - w, gy); c.lineTo(gx + w, gy - 1); c.stroke(); }
    } else if (t.t === 'desert') {
      c.strokeStyle = shade(base, -0.14); c.lineWidth = 1.5; c.lineCap = 'round';
      for (let k = 0; k < 3; k++) { const gx = px(), gy = py(), w = S * (0.3 + r() * 0.2); c.beginPath(); c.moveTo(gx - w, gy); c.quadraticCurveTo(gx, gy - w * 0.4, gx + w, gy); c.stroke(); }
      c.fillStyle = shade(base, 0.25);
      for (let k = 0; k < 6; k++) { c.beginPath(); c.arc(px(), py(), 1.2, 0, TAU); c.fill(); }
    } else if (t.t === 'tundra') {
      c.fillStyle = 'rgba(255,255,255,.34)';
      for (let k = 0; k < 4; k++) { c.beginPath(); c.ellipse(px(), py(), S * (0.16 + r() * 0.14), S * (0.07 + r() * 0.05), 0, 0, TAU); c.fill(); }
      c.fillStyle = 'rgba(40,50,48,.3)';
      for (let k = 0; k < 6; k++) { c.beginPath(); c.arc(px(), py(), 1.3, 0, TAU); c.fill(); }
    } else if (t.t === 'mountain') {
      c.fillStyle = 'rgba(0,0,0,.12)';
      for (let k = 0; k < 7; k++) { c.beginPath(); c.arc(px(), py(), 1.8 + r() * 2, 0, TAU); c.fill(); }
    }
    c.restore();
    hex(c, x, y, 1); c.strokeStyle = 'rgba(0,0,0,.11)'; c.lineWidth = 1; c.stroke();
  }

  /* ----- 지형지물 ----- */
  function peak(c, cx, by, w, h) {
    c.fillStyle = 'rgba(0,0,0,.2)'; c.beginPath(); c.ellipse(cx + w * 0.15, by, w * 1.05, w * 0.16, 0, 0, TAU); c.fill();
    c.fillStyle = '#aaa49c'; poly(c, [cx - w, by, cx, by - h, cx + w * 0.12, by]); c.fill();
    c.fillStyle = '#6c6761'; poly(c, [cx, by - h, cx + w, by, cx + w * 0.12, by]); c.fill();
    const sh = h * 0.36;
    c.fillStyle = '#f5f6f4'; poly(c, [cx, by - h, cx - w * 0.36, by - h + sh, cx - w * 0.14, by - h + sh * 0.78, cx + w * 0.04, by - h + sh * 1.05]); c.fill();
    c.fillStyle = '#c9d1d6'; poly(c, [cx, by - h, cx + w * 0.04, by - h + sh * 1.05, cx + w * 0.2, by - h + sh * 0.8, cx + w * 0.36, by - h + sh]); c.fill();
  }
  function mound(c, cx, by, w, h, base) {
    const g = c.createLinearGradient(cx - w, by - h, cx + w, by);
    g.addColorStop(0, shade(base, 0.18)); g.addColorStop(1, shade(base, -0.24));
    c.beginPath(); c.moveTo(cx - w, by); c.bezierCurveTo(cx - w * 0.6, by - h * 1.3, cx + w * 0.6, by - h * 1.3, cx + w, by); c.closePath();
    c.fillStyle = g; c.fill(); c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 1.1; c.stroke();
  }
  function tree(c, tx, ty, conifer, s) {
    c.fillStyle = 'rgba(0,0,0,.2)'; c.beginPath(); c.ellipse(tx + 1.5, ty + 1, 6 * s, 2.4 * s, 0, 0, TAU); c.fill();
    c.fillStyle = '#5b4226'; c.fillRect(tx - 1.2 * s, ty - 4 * s, 2.4 * s, 5 * s);
    if (conifer) {
      for (let k = 0; k < 3; k++) {
        const by = ty - (3 + k * 5) * s, w = (7 - k * 1.6) * s, h = 8 * s;
        c.fillStyle = '#2b5a3c'; poly(c, [tx - w, by, tx, by - h, tx + w, by]); c.fill();
        c.fillStyle = '#3d7550'; poly(c, [tx - w, by, tx, by - h, tx - w * 0.1, by]); c.fill();
      }
    } else {
      c.fillStyle = '#356e33'; c.beginPath(); c.arc(tx, ty - 10 * s, 7 * s, 0, TAU); c.fill();
      c.fillStyle = '#4f9143'; c.beginPath(); c.arc(tx - 2 * s, ty - 12 * s, 4.6 * s, 0, TAU); c.fill();
      c.fillStyle = '#72b057'; c.beginPath(); c.arc(tx - 3 * s, ty - 13.5 * s, 2 * s, 0, TAU); c.fill();
    }
  }
  function farm(c, i, x, y, golden) {
    const r = rng(i + 91), ang = [0, Math.PI / 3, -Math.PI / 3][Math.floor(r() * 3)];
    c.save(); hex(c, x, y, 0.8); c.clip();
    c.fillStyle = golden ? '#d6b952' : '#c2ad62'; c.fillRect(x - S, y - S, 2 * S, 2 * S);
    c.translate(x, y); c.rotate(ang);
    c.fillStyle = golden ? '#b08f2e' : '#86a04a';
    for (let k = -5; k <= 5; k++) c.fillRect(-S, k * S * 0.2 - S * 0.045, 2 * S, S * 0.09);
    c.restore();
    hex(c, x, y, 0.8); c.strokeStyle = 'rgba(84,62,24,.75)'; c.lineWidth = 1.6; c.stroke();
  }
  function mine(c, x, y) {
    const mx = x, my = y + S * 0.34;
    c.fillStyle = '#8c8c8a'; for (const [ox, oy, rr] of [[-0.36, 0.02, 5], [-0.24, 0.07, 4], [0.34, 0.05, 4.5]]) { c.beginPath(); c.arc(mx + ox * S, my + oy * S, rr, 0, TAU); c.fill(); }
    c.fillStyle = '#211c18'; c.beginPath(); c.moveTo(mx - 8, my + 2); c.lineTo(mx - 8, my - 7); c.arc(mx, my - 7, 8, Math.PI, 0); c.lineTo(mx + 8, my + 2); c.closePath(); c.fill();
    c.strokeStyle = '#9a7340'; c.lineWidth = 2.6; c.lineCap = 'butt';
    c.beginPath(); c.moveTo(mx - 9.5, my + 2); c.lineTo(mx - 9.5, my - 9); c.moveTo(mx + 9.5, my + 2); c.lineTo(mx + 9.5, my - 9); c.moveTo(mx - 12, my - 10.5); c.lineTo(mx + 12, my - 10.5); c.stroke();
  }
  function pasture(c, x, y) {
    const cx = x, cy = y + S * 0.08, rx = S * 0.56, ry = S * 0.4;
    c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, TAU); c.fillStyle = 'rgba(190,220,120,.28)'; c.fill();
    c.strokeStyle = '#8a6535'; c.lineWidth = 1.6; c.stroke();
    c.beginPath(); c.ellipse(cx, cy - 3, rx, ry, 0, 0, TAU); c.stroke();
    c.lineWidth = 2;
    for (let k = 0; k < 10; k++) { const a = k / 10 * TAU, fx = cx + Math.cos(a) * rx, fy = cy + Math.sin(a) * ry; c.beginPath(); c.moveTo(fx, fy + 1.5); c.lineTo(fx, fy - 5.5); c.stroke(); }
  }
  function plantation(c, x, y) {
    for (let row = 0; row < 3; row++) for (let k = 0; k < 4 - (row === 1 ? 0 : 1); k++) {
      const bx = x + (k - (row === 1 ? 1.5 : 1)) * S * 0.3, by = y + (row - 1) * S * 0.3 + S * 0.1;
      c.fillStyle = '#2d6a36'; c.beginPath(); c.arc(bx, by, 4.2, 0, TAU); c.fill();
      c.fillStyle = '#d9483b'; c.beginPath(); c.arc(bx + 1.2, by - 1, 1.5, 0, TAU); c.fill();
    }
  }
  function tileFeatures(c, i, x, y) {
    const t = G.tiles[i], r = rng(i + 31), base = BASE[t.t];
    if (t.t === 'mountain') { peak(c, x + S * 0.3, y + S * 0.44, S * 0.42, S * 0.62); peak(c, x - S * 0.2, y + S * 0.5, S * 0.56, S * 0.98); return; }
    if (t.imp === 'farm') farm(c, i, x, y, t.res === 'wheat');
    if (t.hill) { mound(c, x + S * 0.28, y + S * 0.2, S * 0.34, S * 0.26, base); mound(c, x - S * 0.24, y + S * 0.4, S * 0.42, S * 0.32, base); }
    if (t.imp === 'pasture') pasture(c, x, y);
    if (t.imp === 'plantation' && !t.forest) plantation(c, x, y);
    if (t.forest) {
      const n = t.hill ? 4 : 5, trees = [];
      for (let k = 0; k < n; k++) { const a = k / n * TAU + r() * 0.9, d = S * (0.2 + r() * 0.36); trees.push([x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8 + S * 0.16, t.t === 'tundra' || r() < 0.35, 0.82 + r() * 0.3]); }
      trees.sort((a, b) => a[1] - b[1]);
      for (const tr of trees) tree(c, tr[0], tr[1], tr[2], tr[3]);
      if (t.imp === 'plantation') { c.fillStyle = '#d9483b'; for (const tr of trees) { c.beginPath(); c.arc(tr[0] + 2, tr[1] - 9, 1.7, 0, TAU); c.fill(); } }
    }
    if (t.imp === 'mine') mine(c, x, y);
  }

  /* ----- 도시 · 지구 · 야영지 · 유적 ----- */
  function house(c, hx, hy, w, h, roof) {
    c.fillStyle = '#f1e8d2'; c.fillRect(hx - w / 2, hy - h, w, h);
    c.fillStyle = 'rgba(0,0,0,.16)'; c.fillRect(hx, hy - h, w / 2, h);
    c.fillStyle = roof; poly(c, [hx - w * 0.68, hy - h, hx, hy - h - w * 0.62, hx + w * 0.68, hy - h]); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = 0.8; c.stroke();
  }
  function city(c, ct, x, y, P) {
    hex(c, x, y, 0.86); c.fillStyle = '#bba978'; c.fill();
    c.strokeStyle = P.color; c.lineWidth = 3; c.stroke();
    if (ct.buildings.walls) {
      hex(c, x, y, 0.7); c.strokeStyle = '#6d7076'; c.lineWidth = 6; c.stroke(); c.strokeStyle = '#b9bcc2'; c.lineWidth = 3; c.stroke();
      c.fillStyle = '#8b8e95'; for (const k of CORN) c.fillRect(x + k[0] * S * 0.7 - 3.5, y + k[1] * S * 0.7 - 5, 7, 8);
    }
    const r = rng(ct.id * 13 + 5), items = [], n = Math.min(9, 2 + Math.floor(ct.pop / 1.4)), roof = shade(P.color, -0.12);
    for (let k = 0; k < n; k++) { const a = k / n * TAU + 0.5, d = S * (k % 2 ? 0.44 : 0.36); items.push([x + Math.cos(a) * d, y + Math.sin(a) * d * 0.78 + S * 0.16, 0]); }
    items.push([x, y + S * 0.14, 1]);
    items.sort((a, b) => a[1] - b[1]);
    for (const it of items) {
      if (!it[2]) { house(c, it[0], it[1], S * (0.2 + r() * 0.05), S * (0.13 + r() * 0.04), roof); continue; }
      const hx = it[0], hy = it[1];
      if (ct.palace) {
        c.fillStyle = '#f6efdc'; c.fillRect(hx - S * 0.23, hy - S * 0.24, S * 0.46, S * 0.24);
        c.fillStyle = 'rgba(0,0,0,.15)'; c.fillRect(hx, hy - S * 0.24, S * 0.23, S * 0.24);
        c.fillStyle = '#5a4a36'; c.fillRect(hx - S * 0.045, hy - S * 0.12, S * 0.09, S * 0.12);
        c.fillStyle = P.color; c.beginPath(); c.arc(hx, hy - S * 0.24, S * 0.17, Math.PI, 0); c.fill(); c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 0.9; c.stroke();
        c.strokeStyle = '#3a2f22'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(hx, hy - S * 0.41); c.lineTo(hx, hy - S * 0.62); c.stroke();
        c.fillStyle = P.color; poly(c, [hx, hy - S * 0.62, hx + S * 0.17, hy - S * 0.56, hx, hy - S * 0.5]); c.fill(); c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 0.8; c.stroke();
      } else house(c, hx, hy, S * 0.3, S * 0.2, roof);
    }
  }
  function district(c, type, x, y) {
    const D = DISTRICTS[type];
    hex(c, x, y, 0.84); c.fillStyle = shade(D.color, -0.38); c.fill(); c.strokeStyle = D.color; c.lineWidth = 2.6; c.stroke();
    hex(c, x, y, 0.7); c.fillStyle = shade(D.color, -0.12); c.globalAlpha = 0.55; c.fill(); c.globalAlpha = 1;
    const u = S / 38, by = y + 13 * u;
    c.lineWidth = 0.9; c.strokeStyle = 'rgba(0,0,0,.45)';
    if (type === 'campus') {
      c.fillStyle = '#e9edf5'; c.fillRect(x - 13 * u, by - 12 * u, 26 * u, 12 * u); c.fillStyle = 'rgba(0,0,0,.14)'; c.fillRect(x, by - 12 * u, 13 * u, 12 * u);
      c.fillStyle = '#8fbcf5'; c.beginPath(); c.arc(x - 2 * u, by - 12 * u, 9 * u, Math.PI, 0); c.fill(); c.stroke();
      c.fillStyle = '#1f2f4a'; c.fillRect(x - 3 * u, by - 20.5 * u, 2 * u, 8 * u);
      c.fillStyle = '#e9edf5'; c.fillRect(x + 9 * u, by - 22 * u, 5 * u, 10 * u); c.fillStyle = '#8fbcf5'; poly(c, [x + 8 * u, by - 22 * u, x + 11.5 * u, by - 28 * u, x + 15 * u, by - 22 * u]); c.fill();
    } else if (type === 'commerce') {
      c.fillStyle = '#6b4a22'; c.fillRect(x - 13 * u, by - 14 * u, 2 * u, 14 * u); c.fillRect(x + 5 * u, by - 14 * u, 2 * u, 14 * u);
      c.fillStyle = '#d9c9a0'; c.fillRect(x - 12 * u, by - 6 * u, 18 * u, 6 * u);
      for (let k = 0; k < 5; k++) { c.fillStyle = k % 2 ? '#fff7e0' : '#e8b33a'; poly(c, [x - 15 * u + k * 4.8 * u, by - 14 * u, x - 13 * u + k * 4.4 * u, by - 21 * u, x - 13 * u + (k + 1) * 4.4 * u, by - 21 * u, x - 15 * u + (k + 1) * 4.8 * u, by - 14 * u]); c.fill(); }
      for (let k = 0; k < 3; k++) { c.fillStyle = '#f4cf55'; c.beginPath(); c.ellipse(x + 13 * u, by - 2 * u - k * 3.2 * u, 5 * u, 2.2 * u, 0, 0, TAU); c.fill(); c.stroke(); }
    } else if (type === 'industry') {
      c.fillStyle = '#8a4b2c'; c.fillRect(x + 6 * u, by - 26 * u, 5 * u, 16 * u);
      c.fillStyle = 'rgba(230,230,230,.6)'; c.beginPath(); c.arc(x + 10 * u, by - 29 * u, 3.4 * u, 0, TAU); c.arc(x + 14 * u, by - 33 * u, 4.4 * u, 0, TAU); c.fill();
      c.fillStyle = '#d2cbc0'; poly(c, [x - 15 * u, by, x - 15 * u, by - 14 * u, x - 8 * u, by - 9 * u, x - 8 * u, by - 14 * u, x - 1 * u, by - 9 * u, x - 1 * u, by - 14 * u, x + 6 * u, by - 9 * u, x + 15 * u, by - 9 * u, x + 15 * u, by]); c.fill(); c.stroke();
      c.fillStyle = '#3b3027'; c.fillRect(x - 11 * u, by - 5 * u, 4 * u, 5 * u); c.fillRect(x + 4 * u, by - 5 * u, 4 * u, 5 * u);
    } else if (type === 'holy') {
      c.fillStyle = '#f3efe3'; c.fillRect(x - 13 * u, by - 9 * u, 26 * u, 9 * u); c.fillStyle = 'rgba(0,0,0,.14)'; c.fillRect(x, by - 9 * u, 13 * u, 9 * u);
      c.fillStyle = '#f3efe3'; c.fillRect(x - 4.5 * u, by - 19 * u, 9 * u, 19 * u); c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(x, by - 19 * u, 4.5 * u, 19 * u);
      c.fillStyle = '#9d86e0'; poly(c, [x - 6 * u, by - 19 * u, x, by - 30 * u, x + 6 * u, by - 19 * u]); c.fill(); c.stroke();
      c.fillStyle = '#3f3168'; c.beginPath(); c.arc(x, by - 5.5 * u, 2.4 * u, Math.PI, 0); c.lineTo(x + 2.4 * u, by); c.lineTo(x - 2.4 * u, by); c.closePath(); c.fill();
      c.fillStyle = '#f2ca52'; c.beginPath(); c.arc(x, by - 32 * u, 2.1 * u, 0, TAU); c.fill();
    } else {
      c.fillStyle = '#f0e9f7'; c.fillRect(x - 14 * u, by - 3 * u, 28 * u, 3 * u);
      for (let k = 0; k < 4; k++) c.fillRect(x - 12 * u + k * 7 * u, by - 15 * u, 3 * u, 12 * u);
      c.fillStyle = '#c79bf0'; poly(c, [x - 15 * u, by - 15 * u, x, by - 25 * u, x + 15 * u, by - 15 * u]); c.fill(); c.stroke();
    }
  }
  function camp(c, x, y) {
    hex(c, x, y, 0.84); c.fillStyle = 'rgba(110,22,18,.45)'; c.fill(); c.strokeStyle = '#c0392b'; c.lineWidth = 2; c.stroke();
    c.strokeStyle = '#5b3d20'; c.lineWidth = 2.4; c.lineCap = 'round';
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU, px = x + Math.cos(a) * S * 0.56, py = y + Math.sin(a) * S * 0.46 + 3; c.beginPath(); c.moveTo(px, py + 4); c.lineTo(px, py - 6); c.stroke(); }
    c.fillStyle = '#7b2a22'; poly(c, [x - 13, y + 9, x - 2, y - 12, x + 9, y + 9]); c.fill(); c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 1; c.stroke();
    c.fillStyle = '#1c1512'; poly(c, [x - 5, y + 9, x - 2, y - 1, x + 1, y + 9]); c.fill();
    c.fillStyle = '#ff9a3c'; c.beginPath(); c.arc(x + 12, y + 7, 3.4, 0, TAU); c.fill(); c.fillStyle = '#ffe07a'; c.beginPath(); c.arc(x + 12, y + 7.6, 1.6, 0, TAU); c.fill();
  }
  function village(c, x, y) {
    for (const [ox, oy, s] of [[-9, 2, 1], [9, 8, 0.85]]) {
      const hx = x + ox, hy = y + oy;
      c.fillStyle = 'rgba(0,0,0,.2)'; c.beginPath(); c.ellipse(hx + 2, hy + 1, 11 * s, 3.4 * s, 0, 0, TAU); c.fill();
      c.fillStyle = '#b98d4f'; c.fillRect(hx - 7 * s, hy - 7 * s, 14 * s, 8 * s);
      c.fillStyle = '#e3c06a'; c.beginPath(); c.moveTo(hx - 10 * s, hy - 6 * s); c.quadraticCurveTo(hx, hy - 24 * s, hx + 10 * s, hy - 6 * s); c.closePath(); c.fill(); c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = 0.9; c.stroke();
      c.fillStyle = '#3a2a18'; c.fillRect(hx - 2 * s, hy - 5 * s, 4 * s, 6 * s);
    }
  }

  /* ----- 유닛 아이콘 (24×24 좌표) ----- */
  function sword(c) { poly(c, [5.2, 17.2, 16.8, 5.6, 19.6, 4.4, 18.4, 7.2, 6.8, 18.8]); c.fill(); poly(c, [4.6, 13.4, 10.6, 19.4, 9.3, 20.7, 3.3, 14.7]); c.fill(); c.beginPath(); c.arc(4.3, 19.7, 1.6, 0, TAU); c.fill(); }
  const ICONS = {
    warrior(c) { sword(c); },
    swordsman(c) { sword(c); c.save(); c.translate(24, 0); c.scale(-1, 1); sword(c); c.restore(); },
    scout(c) { poly(c, [12, 2.5, 14.2, 9.8, 21.5, 12, 14.2, 14.2, 12, 21.5, 9.8, 14.2, 2.5, 12, 9.8, 9.8]); c.fill(); },
    archer(c) {
      c.lineWidth = 2.2; c.beginPath(); c.moveTo(8, 3); c.quadraticCurveTo(21, 12, 8, 21); c.stroke();
      c.lineWidth = 1; c.beginPath(); c.moveTo(8, 3); c.lineTo(8, 21); c.stroke();
      c.lineWidth = 1.7; c.beginPath(); c.moveTo(3, 12); c.lineTo(18, 12); c.stroke(); poly(c, [21.5, 12, 16.5, 9.2, 16.5, 14.8]); c.fill();
    },
    spearman(c) {
      c.lineWidth = 2; c.beginPath(); c.moveTo(4, 20); c.lineTo(16, 8); c.stroke(); poly(c, [21, 3, 18.6, 10.2, 13.8, 5.4]); c.fill();
      c.beginPath(); c.arc(8.5, 9, 4.6, 0, TAU); c.fill(); c.save(); c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.arc(8.5, 9, 1.5, 0, TAU); c.fill(); c.restore();
    },
    horseman(c) {
      c.beginPath(); c.moveTo(6.5, 21); c.lineTo(18, 21); c.lineTo(17.4, 14.5); c.bezierCurveTo(18.6, 11, 17.6, 7.2, 14.4, 5.2); c.lineTo(14, 2.6); c.lineTo(11.8, 4.6);
      c.bezierCurveTo(8.8, 5.6, 7.2, 8.4, 5.4, 11.6); c.lineTo(4.2, 13.8); c.lineTo(6.2, 15.6); c.lineTo(10.2, 13); c.bezierCurveTo(10.6, 15.4, 8.2, 17.2, 6.5, 21); c.closePath(); c.fill();
      c.save(); c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.arc(11.6, 8.6, 1, 0, TAU); c.fill(); c.restore();
    },
    crossbow(c) {
      c.lineWidth = 2.3; c.beginPath(); c.moveTo(3.5, 10); c.quadraticCurveTo(12, 2.5, 20.5, 10); c.stroke();
      c.lineWidth = 1; c.beginPath(); c.moveTo(3.5, 10); c.lineTo(20.5, 10); c.stroke();
      c.fillRect(10.8, 6, 2.4, 15.5); c.fillRect(8.6, 16, 6.8, 2.2); poly(c, [12, 1.5, 14.2, 5.6, 9.8, 5.6]); c.fill();
    },
    catapult(c) {
      c.lineWidth = 2; c.beginPath(); c.moveTo(3.5, 16); c.lineTo(20.5, 16); c.moveTo(7, 16); c.lineTo(18, 5.4); c.moveTo(12, 16); c.lineTo(13, 10); c.moveTo(15.5, 16); c.lineTo(13, 10); c.stroke();
      c.beginPath(); c.arc(18.8, 4.6, 2.5, 0, TAU); c.fill(); c.beginPath(); c.arc(7, 19.3, 2.6, 0, TAU); c.arc(17, 19.3, 2.6, 0, TAU); c.fill();
    },
    settler(c) {
      poly(c, [12, 5.5, 21.5, 20.5, 2.5, 20.5]); c.fill();
      c.save(); c.globalCompositeOperation = 'destination-out'; poly(c, [12, 12, 15, 20.5, 9, 20.5]); c.fill(); c.restore();
      c.lineWidth = 1.4; c.beginPath(); c.moveTo(12, 6); c.lineTo(12, 1.6); c.stroke(); poly(c, [12, 1.4, 17, 2.8, 12, 4.4]); c.fill();
    },
    missionary(c) {
      c.lineWidth = 2; c.beginPath(); c.moveTo(12, 11); c.lineTo(12, 22); c.stroke(); c.fillRect(8, 14.5, 8, 1.9);
      c.beginPath(); c.arc(12, 7, 3.1, 0, TAU); c.fill(); c.lineWidth = 1.5;
      for (let k = 0; k < 8; k++) { const an = k / 8 * TAU; c.beginPath(); c.moveTo(12 + Math.cos(an) * 4.5, 7 + Math.sin(an) * 4.5); c.lineTo(12 + Math.cos(an) * 6.4, 7 + Math.sin(an) * 6.4); c.stroke(); }
    },
    knight(c) {
      c.save(); c.translate(-2.2, 1.5); c.scale(0.92, 0.92); ICONS.horseman(c); c.restore();
      c.lineWidth = 1.7; c.beginPath(); c.moveTo(20.5, 22); c.lineTo(20.5, 2.5); c.stroke(); poly(c, [20.5, 2.5, 15, 4.4, 20.5, 6.6]); c.fill();
    },
    cavalry(c) {
      c.save(); c.translate(-2.4, 1.5); c.scale(0.92, 0.92); ICONS.horseman(c); c.restore();
      c.lineWidth = 2; c.beginPath(); c.moveTo(18.5, 21); c.quadraticCurveTo(24.5, 12, 19.5, 2.5); c.stroke();
      c.lineWidth = 1.6; c.beginPath(); c.moveTo(16.4, 18.2); c.lineTo(21.2, 19.6); c.stroke();
    },
    musketman(c) {
      c.lineWidth = 2.3; c.beginPath(); c.moveTo(6, 18); c.lineTo(19.5, 4.5); c.stroke();
      poly(c, [2.2, 20.6, 8.2, 19.4, 7.4, 15.4, 4.2, 15.8]); c.fill();
      c.lineWidth = 1.2; c.beginPath(); c.moveTo(19.5, 4.5); c.lineTo(22.3, 1.7); c.stroke();
      c.lineWidth = 1.3; c.beginPath(); c.arc(10.4, 15.8, 1.7, 0.3, 2.6); c.stroke();
    },
    rifleman(c) { ICONS.musketman(c); c.save(); c.translate(24, 0); c.scale(-1, 1); ICONS.musketman(c); c.restore(); },
    bombard(c) {
      c.save(); c.translate(9.5, 13.5); c.rotate(-0.52); c.fillRect(-2.5, -3.6, 14.5, 7.2); c.fillRect(11, -4.4, 2.2, 8.8); c.restore();
      c.beginPath(); c.arc(9, 17.6, 4.4, 0, TAU); c.fill();
      c.save(); c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.arc(9, 17.6, 1.5, 0, TAU); c.fill(); c.restore();
      c.beginPath(); c.arc(21, 4.2, 1.9, 0, TAU); c.fill();
    },
    fieldcannon(c) {
      c.save(); c.translate(8, 15.5); c.rotate(-0.36); c.fillRect(0, -1.9, 15.5, 3.8); c.restore();
      c.lineWidth = 2; c.beginPath(); c.moveTo(8.5, 17.5); c.lineTo(2.5, 21.5); c.stroke();
      c.beginPath(); c.arc(9, 18, 3.8, 0, TAU); c.fill();
      c.save(); c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.arc(9, 18, 1.3, 0, TAU); c.fill(); c.restore();
      c.lineWidth = 1.3; c.beginPath(); c.moveTo(22.3, 6.4); c.lineTo(23.6, 4.6); c.moveTo(21.6, 5); c.lineTo(21.4, 2.6); c.moveTo(22.8, 8.2); c.lineTo(23.8, 9); c.stroke();
    },
    builder(c) {
      c.save(); c.translate(12, 12); c.rotate(Math.PI / 4); c.fillRect(-1.3, -5, 2.6, 15); c.fillRect(-6.5, -9.5, 13, 5.4); c.restore();
    },
  };

  /* ----- 유닛 토큰 ----- */
  function token(c, type, P, x, y, r, o) {
    o = o || {};
    const U = UNITS[type], civ = U.cls === 'civ';
    const col = P.barb ? '#34343d' : P.color, fg = P.barb ? '#f3d9d2' : (lum(col) > 0.62 ? '#2b1e06' : '#ffffff');
    const shape = k => { c.beginPath(); if (civ && c.roundRect) c.roundRect(x - r * k, y - r * k, 2 * r * k, 2 * r * k, r * 0.42 * k); else c.arc(x, y, r * k, 0, TAU); };
    if (!o.flat) { c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(x + r * 0.08, y + r * 0.98, r * 0.86, r * 0.3, 0, 0, TAU); c.fill(); }
    const g = c.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.1, x, y, r * 1.15);
    g.addColorStop(0, shade(col, 0.3)); g.addColorStop(0.55, col); g.addColorStop(1, shade(col, -0.3));
    shape(1); c.fillStyle = g; c.fill();
    c.lineWidth = Math.max(1.5, r * 0.13); c.strokeStyle = P.barb ? '#d0432f' : shade(col, -0.5); c.stroke();
    if (o.ready) { shape(1.13); c.lineWidth = Math.max(1.4, r * 0.1); c.strokeStyle = '#ffffff'; c.stroke(); }
    c.save();
    c.translate(x - r * 0.64, y - r * 0.64); c.scale(r * 1.28 / 24, r * 1.28 / 24);
    c.fillStyle = fg; c.strokeStyle = fg; c.lineCap = 'round'; c.lineJoin = 'round';
    // 아이콘은 destination-out을 쓰므로 별도 레이어에서 그려 토큰 색이 뚫리지 않게 함
    const ic = iconLayer(type, fg);
    c.drawImage(ic, 0, 0, 24, 24);
    c.restore();
    if (o.spent) { shape(1); c.fillStyle = 'rgba(13,18,27,.4)'; c.fill(); }
  }
  const layers = new Map();
  function iconLayer(type, fg) {
    const key = type + fg;
    let cv = layers.get(key);
    if (cv) return cv;
    cv = document.createElement('canvas'); cv.width = cv.height = 96;
    const c = cv.getContext('2d');
    c.scale(4, 4); c.fillStyle = fg; c.strokeStyle = fg; c.lineCap = 'round'; c.lineJoin = 'round';
    (ICONS[type] || ICONS.warrior)(c);
    layers.set(key, cv);
    return cv;
  }
  const urls = new Map();
  function tokenURL(type, P) {
    const key = type + (P.barb ? 'barb' : P.color);
    let u = urls.get(key);
    if (u) return u;
    const cv = document.createElement('canvas'); cv.width = cv.height = 72;
    token(cv.getContext('2d'), type, P, 36, 36, 29, { flat: true });
    u = cv.toDataURL(); urls.set(key, u);
    return u;
  }

  return { S, CORN, hex, shade, lum, tileBase, tileFeatures, city, district, camp, village, token, tokenURL, BASE };
})();
