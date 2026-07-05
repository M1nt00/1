// ====================== VOID SURVIVOR v1.5 ======================
// 2D 로그라이크 서바이벌 슈팅 게임 - 순수 JS / Canvas

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;

const WORLD_SIZE = 2400;

// ---------- Utility ----------
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const dist2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;
const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;

function pickRandom(arr, n) {
  const pool = arr.slice();
  const out = [];
  while (out.length < n && pool.length > 0) {
    const i = randInt(0, pool.length - 1);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

// ---------- Sound (Web Audio API - no external files) ----------
let audioCtx = null;
function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function playTone(freq, type = 'square', vol = 0.12, attack = 0.003, sustain = 0.04, decay = 0.08) {
  try {
    const ac = getAudio();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain); gain.connect(ac.destination);
    osc.type = type; osc.frequency.value = freq;
    const t = ac.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + attack);
    gain.gain.setValueAtTime(vol, t + attack + sustain);
    gain.gain.exponentialRampToValueAtTime(0.001, t + attack + sustain + decay);
    osc.start(t); osc.stop(t + attack + sustain + decay + 0.02);
  } catch (e) {}
}
const sfxShoot = () => playTone(380, 'square', 0.07, 0.001, 0.015, 0.05);
const sfxShootgun = () => { playTone(180, 'sawtooth', 0.12, 0.001, 0.01, 0.08); };
const sfxHoming = () => playTone(260, 'sine', 0.08, 0.001, 0.03, 0.12);
const sfxHit = () => { playTone(110, 'sawtooth', 0.18, 0.001, 0.02, 0.1); };
const sfxDash = () => { playTone(300, 'sine', 0.15, 0.001, 0.02, 0.12); playTone(450, 'sine', 0.1, 0.01, 0.02, 0.1); };
const sfxPickup = () => playTone(660, 'sine', 0.1, 0.001, 0.03, 0.07);
const sfxHeart = () => { playTone(440, 'sine', 0.15, 0.001, 0.05, 0.1); playTone(660, 'sine', 0.12, 0.05, 0.05, 0.1); };
const sfxExplode = () => playTone(80, 'sawtooth', 0.2, 0.001, 0.08, 0.22);
function sfxLevelUp() { [440, 550, 660, 880].forEach((f, i) => setTimeout(() => playTone(f, 'sine', 0.18, 0.001, 0.06, 0.1), i * 70)); }
function sfxBoss() { [80, 60, 40].forEach((f, i) => setTimeout(() => playTone(f, 'sawtooth', 0.28, 0.01, 0.1, 0.3), i * 110)); }
function sfxDie() { playTone(200, 'sawtooth', 0.1, 0.001, 0.04, 0.18); setTimeout(() => playTone(100, 'sawtooth', 0.08, 0.001, 0.04, 0.15), 80); }
function sfxWave() { playTone(330, 'sine', 0.12, 0.001, 0.08, 0.15); setTimeout(() => playTone(440, 'sine', 0.1, 0.001, 0.06, 0.12), 120); }
function sfxChain() { playTone(700, 'sine', 0.13, 0.001, 0.01, 0.06); }

// ---------- Input ----------
const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
  if (e.key === ' ') e.preventDefault();
});
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

// ---------- Game State ----------
let state = 'start';
let elapsed = 0;
let kills = 0;
let score = 0;
let highScore = parseInt(localStorage.getItem('vs-hs') || '0');
let lastTime = 0;
let screenShake = 0;
let waveNumber = 0;
let waveBannerTimeout = null;

let camera = { x: 0, y: 0 };

let player = null;
let enemies = [], projectiles = [], enemyProjectiles = [];
let orbs = [], particles = [], hearts = [], floatingNums = [];
let spawnTimer = 0;
let spawnInterval = 1.6;
let nextBossTime = 60;
let bossesSpawned = 0;
let bossBannerTimeout = null;
let orbitDraws = [];
let auraPulses = [];
let lightningBolts = [];

// ---------- Weapon Definitions ----------
const WEAPON_DEFS = {
  blaster: { name: '블래스터',     icon: '🔵', desc: lvl => `전방 자동 사격 (LV ${lvl})`,              maxLevel: 8 },
  orbit:   { name: '오비탈 블레이드', icon: '⚔️', desc: lvl => `회전 칼날로 주변 적 처치 (LV ${lvl})`,  maxLevel: 8 },
  aura:    { name: '프로스트 오라', icon: '❄️', desc: lvl => `주기적으로 주변에 피해 (LV ${lvl})`,     maxLevel: 8 },
  chain:   { name: '체인 라이트닝', icon: '⚡', desc: lvl => `번개 연쇄 피해 (LV ${lvl})`,             maxLevel: 8 },
  shotgun: { name: '샷건',         icon: '🔫', desc: lvl => `근거리 ${4+Math.floor((lvl-1)/2)}방향 산탄 (LV ${lvl})`, maxLevel: 8 },
  homing:  { name: '유도 미사일',   icon: '🚀', desc: lvl => `적 추적 미사일 (LV ${lvl})`,             maxLevel: 8 },
};

const PASSIVE_DEFS = {
  maxhp:     { name: '활력',    icon: '❤️',  desc: '최대 체력 +20, 즉시 회복' },
  speed:     { name: '신속',    icon: '👟',  desc: '이동 속도 +8%' },
  damage:    { name: '공격력',  icon: '💪',  desc: '모든 무기 피해 +15%' },
  cooldown:  { name: '연속 사격', icon: '⏱️', desc: '모든 무기 쿨다운 -8%' },
  pickup:    { name: '자석',    icon: '🧲',  desc: '경험치 획득 범위 +30%' },
  regen:     { name: '재생',    icon: '✨',  desc: '초당 체력 회복 +0.4' },
  lifesteal: { name: '흡혈',    icon: '🩸',  desc: '가한 피해의 5%만큼 체력 회복' },
  armor:     { name: '방어',    icon: '🛡️',  desc: '받는 피해 -2 (최소 1)' },
  pierce:    { name: '관통',    icon: '🔰',  desc: '블래스터·샷건 탄환 관통 +1' },
  explode:   { name: '폭발',    icon: '💥',  desc: '탄환 명중 시 반경 60 폭발 피해' },
};

// ---------- Player ----------
function createPlayer() {
  return {
    x: WORLD_SIZE / 2, y: WORLD_SIZE / 2,
    r: 14, hp: 100, maxHp: 100, speed: 200,
    level: 1, xp: 0, xpToNext: 8,
    pickupRadius: 130, damageMult: 1, cooldownMult: 1,
    regen: 0, lifesteal: 0, armor: 0, pierceBuff: 0,
    invuln: 0,
    dashCooldown: 0, dashTimer: 0, dashVx: 0, dashVy: 0,
    weapons: { blaster: 1 }, passives: {},
    weaponCooldowns: { blaster: 0, orbit: 0, aura: 0, chain: 0, shotgun: 0, homing: 0 },
    orbitAngle: 0, facing: { x: 1, y: 0 },
  };
}

function resetGame() {
  player = createPlayer();
  enemies = []; projectiles = []; enemyProjectiles = [];
  orbs = []; particles = []; hearts = []; floatingNums = [];
  lightningBolts = []; orbitDraws = []; auraPulses = [];
  elapsed = 0; kills = 0; score = 0;
  spawnTimer = 0; spawnInterval = 1.6;
  nextBossTime = 60; bossesSpawned = 0; waveNumber = 0;
  screenShake = 0;
  hideBossBanner(); hideWaveBanner();
  camera.x = player.x - W / 2;
  camera.y = player.y - H / 2;
}

// ---------- Enemy Types ----------
const ENEMY_TYPES = {
  grunt:      { hp: 22,  speed: 80,  r: 13, dmg: 8,  color: '#ff5c7a', xp: 3, melee: true },
  swarm:      { hp: 10,  speed: 132, r: 9,  dmg: 5,  color: '#ffd166', xp: 2, melee: true },
  brute:      { hp: 80,  speed: 50,  r: 20, dmg: 16, color: '#9b59ff', xp: 8, melee: true },
  shooter:    { hp: 26,  speed: 60,  r: 12, dmg: 10, color: '#4dd0ff', xp: 5, melee: false, range: 260, fireCd: 1.8 },
  teleporter: { hp: 18,  speed: 0,   r: 11, dmg: 14, color: '#a8ff78', xp: 7, melee: true },
};

function spawnEnemy(t) {
  const def = ENEMY_TYPES[t];
  const angle = rand(0, Math.PI * 2);
  const radius = Math.max(W, H) / 1.4 + rand(40, 140);
  const x = clamp(player.x + Math.cos(angle) * radius, def.r, WORLD_SIZE - def.r);
  const y = clamp(player.y + Math.sin(angle) * radius, def.r, WORLD_SIZE - def.r);
  const ts = 1 + elapsed / 110;
  const e = {
    type: t, x, y, r: def.r,
    hp: def.hp * ts, maxHp: def.hp * ts,
    speed: def.speed, dmg: def.dmg, color: def.color, xp: def.xp,
    melee: def.melee, range: def.range, fireCd: def.fireCd, fireTimer: rand(0, 1.5),
    teleportTimer: rand(1, 2.5),
    hitFlash: 0, contactCd: 0,
  };
  if (Math.random() < 0.07 && t !== 'boss') {
    e.isElite = true;
    e.hp *= 2.5; e.maxHp = e.hp;
    e.xp *= 3; e.dmg = Math.round(e.dmg * 1.5);
    e.r = Math.min(e.r + 4, 24);
    e.speed = Math.round(e.speed * 1.15);
  }
  enemies.push(e);
}

function spawnBoss() {
  bossesSpawned++;
  const scale = 1 + (bossesSpawned - 1) * 0.6;
  const angle = rand(0, Math.PI * 2);
  const radius = Math.max(W, H) / 1.4 + rand(60, 140);
  const r = 32;
  const bx = clamp(player.x + Math.cos(angle) * radius, r, WORLD_SIZE - r);
  const by = clamp(player.y + Math.sin(angle) * radius, r, WORLD_SIZE - r);
  enemies.push({
    type: 'boss', x: bx, y: by, r,
    hp: 280 * scale, maxHp: 280 * scale,
    speed: 46 + bossesSpawned * 2, dmg: 22 + bossesSpawned * 3,
    color: '#ff3b5c', xp: 40, melee: true,
    hitFlash: 0, contactCd: 0, isBoss: true,
    chargeTimer: rand(3, 5), charging: false, chargeDir: { x: 0, y: 0 }, chargeDuration: 0,
  });
  showBossBanner();
  sfxBoss();
}

function pickEnemyType() {
  const t = elapsed;
  const w = [
    ['grunt', 5],
    ['swarm', 4 + Math.min(4, t / 30)],
    ['brute', t > 25 ? 2 + t / 60 : 0],
    ['shooter', t > 15 ? 2 + t / 50 : 0],
    ['teleporter', t > 30 ? 1.5 + t / 80 : 0],
  ].filter(e => e[1] > 0);
  const total = w.reduce((s, e) => s + e[1], 0);
  let r = rand(0, total);
  for (const [name, wt] of w) { if (r < wt) return name; r -= wt; }
  return 'grunt';
}

// ---------- Banners ----------
function showBossBanner() {
  const el = document.getElementById('boss-banner');
  if (!el) return;
  el.classList.remove('hidden');
  if (bossBannerTimeout) clearTimeout(bossBannerTimeout);
  bossBannerTimeout = setTimeout(() => el.classList.add('hidden'), 2600);
}
function hideBossBanner() {
  if (bossBannerTimeout) { clearTimeout(bossBannerTimeout); bossBannerTimeout = null; }
  document.getElementById('boss-banner')?.classList.add('hidden');
}
function showWaveBanner(n) {
  const el = document.getElementById('wave-banner');
  if (!el) return;
  el.textContent = `WAVE  ${n}`;
  el.classList.remove('hidden');
  sfxWave();
  if (waveBannerTimeout) clearTimeout(waveBannerTimeout);
  waveBannerTimeout = setTimeout(() => el.classList.add('hidden'), 2000);
}
function hideWaveBanner() {
  if (waveBannerTimeout) { clearTimeout(waveBannerTimeout); waveBannerTimeout = null; }
  document.getElementById('wave-banner')?.classList.add('hidden');
}

// ---------- Particles ----------
function spawnParticles(x, y, color, count = 6) {
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2);
    const sp = rand(40, 180);
    particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.25, 0.55), maxLife: 0.55, color, r: rand(1.5, 3.5) });
  }
}

// ---------- Floating Numbers ----------
function spawnFloat(x, y, text, color = '#ffd166') {
  floatingNums.push({ x, y: y - 10, vy: -50, text: String(text), color, life: 0.75, maxLife: 0.75 });
}
function updateFloats(dt) {
  for (let i = floatingNums.length - 1; i >= 0; i--) {
    const f = floatingNums[i];
    f.y += f.vy * dt; f.vy *= 0.92;
    f.life -= dt;
    if (f.life <= 0) floatingNums.splice(i, 1);
  }
}

// ---------- Orbs / Hearts ----------
function spawnOrb(x, y, value) { orbs.push({ x, y, value, r: 5 + Math.min(4, value / 4) }); }
function spawnHeart(x, y, amount) { hearts.push({ x, y, amount, r: 9 }); }

// ---------- Enemy Logic ----------
function findNearestEnemy(x, y, maxRange = Infinity) {
  let best = null, bestD = maxRange * maxRange;
  for (const e of enemies) {
    if (e.dead) continue;
    const d = dist2(x, y, e.x, e.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

function damageEnemy(e, dmg, showNum = true) {
  e.hp -= dmg;
  e.hitFlash = 0.1;
  if (player.lifesteal > 0) player.hp = Math.min(player.maxHp, player.hp + dmg * player.lifesteal);
  if (showNum && dmg >= 3) spawnFloat(e.x + rand(-8, 8), e.y - e.r, Math.floor(dmg), e.isBoss ? '#ff7b54' : e.isElite ? '#ffd700' : '#ffd166');
  if (e.hp <= 0 && !e.dead) {
    e.dead = true; kills++;
    score += e.xp * 10 + (e.isBoss ? 500 : 0) + (e.isElite ? 100 : 0);
    spawnParticles(e.x, e.y, e.color, e.isBoss ? 16 : e.isElite ? 12 : 8);
    spawnOrb(e.x, e.y, e.xp);
    if (e.isBoss)       { spawnHeart(e.x, e.y, 50); sfxDie(); }
    else if (e.isElite) { if (Math.random() < 0.4) spawnHeart(e.x, e.y, 20); sfxDie(); }
    else if (Math.random() < 0.09) spawnHeart(e.x, e.y, 15);
  }
}

function damagePlayer(dmg) {
  if (player.invuln > 0) return;
  dmg = Math.max(1, dmg - player.armor);
  player.hp -= dmg;
  player.invuln = 0.5;
  screenShake = Math.min(10, screenShake + 6);
  spawnParticles(player.x, player.y, '#ff5c7a', 6);
  spawnFloat(player.x, player.y - player.r, `-${Math.floor(dmg)}`, '#ff5c7a');
  sfxHit();
  if (player.hp <= 0) { player.hp = 0; triggerGameOver(); }
}

// ---------- Weapons ----------
function fireBlaster(lvl) {
  const target = findNearestEnemy(player.x, player.y, 330);
  if (!target) return;
  const count = 1 + Math.floor((lvl - 1) / 2);
  const dmg = (12 + lvl * 5) * player.damageMult;
  const baseAngle = Math.atan2(target.y - player.y, target.x - player.x);
  for (let i = 0; i < count; i++) {
    const off = count === 1 ? 0 : (i - (count - 1) / 2) * 0.18;
    const a = baseAngle + off;
    projectiles.push({ x: player.x, y: player.y, vx: Math.cos(a)*520, vy: Math.sin(a)*520, dmg, r: 5, pierce: 1 + Math.floor(lvl/3) + player.pierceBuff, life: 1.2, color: '#ffd166' });
  }
  sfxShoot();
}

function fireShotgun(lvl) {
  const target = findNearestEnemy(player.x, player.y, 300);
  const baseAngle = target
    ? Math.atan2(target.y - player.y, target.x - player.x)
    : Math.atan2(player.facing.y, player.facing.x);
  const pellets = 4 + Math.floor((lvl - 1) / 2);
  const spread = 0.65;
  const dmg = (14 + lvl * 4) * player.damageMult;
  for (let i = 0; i < pellets; i++) {
    const off = (i - (pellets - 1) / 2) * (spread / Math.max(pellets - 1, 1));
    const a = baseAngle + off;
    projectiles.push({ x: player.x, y: player.y, vx: Math.cos(a)*540, vy: Math.sin(a)*540, dmg, r: 4, pierce: 1 + player.pierceBuff, life: 0.55, color: '#ff9966' });
  }
  sfxShootgun();
}

function fireHoming(lvl) {
  const count = 1 + Math.floor((lvl - 1) / 3);
  const dmg = (28 + lvl * 8) * player.damageMult;
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2);
    projectiles.push({ x: player.x, y: player.y, vx: Math.cos(a)*160, vy: Math.sin(a)*160, dmg, r: 7, pierce: 1, life: 4, color: '#ff78a8', homing: true, turnRate: 4.8 });
  }
  sfxHoming();
}

function updateOrbit(dt, lvl) {
  player.orbitAngle += dt * 2.8;
  const count = 2 + Math.floor((lvl - 1) / 2);
  const radius = 60 + Math.min(lvl, 4) * 4;
  const dmg = (6 + lvl * 3) * player.damageMult * dt * 6;
  for (let i = 0; i < count; i++) {
    const a = player.orbitAngle + (Math.PI * 2 / count) * i;
    const bx = player.x + Math.cos(a) * radius;
    const by = player.y + Math.sin(a) * radius;
    for (const e of enemies) { if (!e.dead && dist2(bx, by, e.x, e.y) < (e.r + 12) ** 2) damageEnemy(e, dmg, false); }
    if (state === 'playing') orbitDraws.push({ x: bx, y: by });
  }
}

function updateAura(dt, lvl) {
  player.weaponCooldowns.aura -= dt;
  const cd = Math.max(0.5, 1.6 - lvl * 0.12) * player.cooldownMult;
  if (player.weaponCooldowns.aura <= 0) {
    player.weaponCooldowns.aura = cd;
    const radius = 70 + lvl * 8;
    const dmg = (8 + lvl * 6) * player.damageMult;
    auraPulses.push({ x: player.x, y: player.y, r: 0, maxR: radius, life: 0.35 });
    for (const e of enemies) { if (!e.dead && dist2(player.x, player.y, e.x, e.y) < radius ** 2) damageEnemy(e, dmg); }
  }
}

function fireChain(lvl) {
  let current = findNearestEnemy(player.x, player.y, 320);
  if (!current) return;
  const dmg = (10 + lvl * 4) * player.damageMult;
  const maxJumps = 2 + Math.floor(lvl / 2);
  const hit = new Set();
  let prevX = player.x, prevY = player.y;
  for (let i = 0; i < maxJumps && current; i++) {
    damageEnemy(current, dmg);
    hit.add(current);
    lightningBolts.push({ x1: prevX, y1: prevY, x2: current.x, y2: current.y, life: 0.14, maxLife: 0.14 });
    prevX = current.x; prevY = current.y;
    let next = null, bestD = 180 * 180;
    for (const e of enemies) {
      if (hit.has(e) || e.dead) continue;
      const d = dist2(current.x, current.y, e.x, e.y);
      if (d < bestD) { bestD = d; next = e; }
    }
    current = next;
  }
  sfxChain();
}

function updateWeapons(dt) {
  orbitDraws = [];
  for (const [w, lvl] of Object.entries(player.weapons)) {
    if (w === 'blaster') {
      player.weaponCooldowns.blaster -= dt;
      const cd = Math.max(0.12, 0.55 - lvl * 0.04) * player.cooldownMult;
      if (player.weaponCooldowns.blaster <= 0) { player.weaponCooldowns.blaster = cd; fireBlaster(lvl); }
    } else if (w === 'orbit') {
      updateOrbit(dt, lvl);
    } else if (w === 'aura') {
      updateAura(dt, lvl);
    } else if (w === 'chain') {
      player.weaponCooldowns.chain -= dt;
      const cd = Math.max(0.4, 1.3 - lvl * 0.08) * player.cooldownMult;
      if (player.weaponCooldowns.chain <= 0) { player.weaponCooldowns.chain = cd; fireChain(lvl); }
    } else if (w === 'shotgun') {
      player.weaponCooldowns.shotgun -= dt;
      const cd = Math.max(0.35, 0.9 - lvl * 0.06) * player.cooldownMult;
      if (player.weaponCooldowns.shotgun <= 0) { player.weaponCooldowns.shotgun = cd; fireShotgun(lvl); }
    } else if (w === 'homing') {
      player.weaponCooldowns.homing -= dt;
      const cd = Math.max(0.6, 2.2 - lvl * 0.18) * player.cooldownMult;
      if (player.weaponCooldowns.homing <= 0) { player.weaponCooldowns.homing = cd; fireHoming(lvl); }
    }
  }
  for (let i = auraPulses.length - 1; i >= 0; i--) {
    const p = auraPulses[i];
    p.life -= dt; p.r = lerp(p.r, p.maxR, 0.3);
    if (p.life <= 0) auraPulses.splice(i, 1);
  }
  for (let i = lightningBolts.length - 1; i >= 0; i--) {
    lightningBolts[i].life -= dt;
    if (lightningBolts[i].life <= 0) lightningBolts.splice(i, 1);
  }
}

function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    // homing steering
    if (p.homing) {
      const target = findNearestEnemy(p.x, p.y);
      if (target) {
        const ta = Math.atan2(target.y - p.y, target.x - p.x);
        const ca = Math.atan2(p.vy, p.vx);
        let diff = ta - ca;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const turn = Math.min(Math.abs(diff), p.turnRate * dt) * Math.sign(diff);
        const na = ca + turn;
        const speed = Math.min(380, Math.sqrt(p.vx*p.vx + p.vy*p.vy) + 180 * dt);
        p.vx = Math.cos(na) * speed; p.vy = Math.sin(na) * speed;
      }
    }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0 || p.x < 0 || p.x > WORLD_SIZE || p.y < 0 || p.y > WORLD_SIZE) { projectiles.splice(i, 1); continue; }
    let removed = false;
    for (const e of enemies) {
      if (e.dead) continue;
      if (dist2(p.x, p.y, e.x, e.y) < (e.r + p.r) ** 2) {
        damageEnemy(e, p.dmg);
        // explosion passive
        if (player.passives.explode) {
          const lvl = player.passives.explode;
          const eR = 50 + (lvl - 1) * 10;
          const eDmg = 10 * lvl * player.damageMult;
          auraPulses.push({ x: p.x, y: p.y, r: 0, maxR: eR, life: 0.2, explode: true });
          for (const e2 of enemies) { if (!e2.dead && dist2(p.x, p.y, e2.x, e2.y) < eR * eR) damageEnemy(e2, eDmg); }
          sfxExplode();
        }
        p.pierce--;
        if (p.pierce <= 0) { projectiles.splice(i, 1); removed = true; break; }
      }
    }
    if (removed) continue;
  }

  for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
    const p = enemyProjectiles[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) { enemyProjectiles.splice(i, 1); continue; }
    if (dist2(p.x, p.y, player.x, player.y) < (player.r + p.r) ** 2) {
      damagePlayer(p.dmg); enemyProjectiles.splice(i, 1);
    }
  }
}

function updateEnemies(dt) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.dead) { enemies.splice(i, 1); continue; }
    if (e.hitFlash > 0) e.hitFlash -= dt;
    if (e.contactCd > 0) e.contactCd -= dt;
    const d = dist(e.x, e.y, player.x, player.y);

    if (e.type === 'teleporter') {
      e.teleportTimer -= dt;
      if (e.teleportTimer <= 0) {
        e.teleportTimer = 1.6 + rand(0, 1.2);
        const a = rand(0, Math.PI * 2), r = rand(50, 110);
        e.x = clamp(player.x + Math.cos(a) * r, e.r, WORLD_SIZE - e.r);
        e.y = clamp(player.y + Math.sin(a) * r, e.r, WORLD_SIZE - e.r);
        spawnParticles(e.x, e.y, '#a8ff78', 6);
      }
      const d2 = dist(e.x, e.y, player.x, player.y);
      if (d2 < e.r + player.r && e.contactCd <= 0) { damagePlayer(e.dmg); e.contactCd = 0.7; }

    } else if (e.isBoss) {
      // boss: charge ability
      e.chargeTimer -= dt;
      if (e.chargeDuration > 0) {
        e.chargeDuration -= dt;
        e.x = clamp(e.x + e.chargeDir.x * 280 * dt, e.r, WORLD_SIZE - e.r);
        e.y = clamp(e.y + e.chargeDir.y * 280 * dt, e.r, WORLD_SIZE - e.r);
        if (d < e.r + player.r && e.contactCd <= 0) { damagePlayer(e.dmg * 1.5); e.contactCd = 0.4; }
      } else if (e.chargeTimer <= 0) {
        if (d < 400) {
          e.chargeDir = { x: (player.x - e.x) / Math.max(d, 1), y: (player.y - e.y) / Math.max(d, 1) };
          e.chargeDuration = 0.45; e.chargeTimer = rand(2.5, 5);
        } else {
          e.chargeTimer = 1;
        }
      } else {
        if (d > 1) {
          const dx = (player.x - e.x) / d, dy = (player.y - e.y) / d;
          e.x += dx * e.speed * dt; e.y += dy * e.speed * dt;
        }
        if (d < e.r + player.r && e.contactCd <= 0) { damagePlayer(e.dmg); e.contactCd = 0.6; }
      }

    } else if (e.melee) {
      if (d > 1) {
        const dx = (player.x - e.x) / d, dy = (player.y - e.y) / d;
        e.x += dx * e.speed * dt; e.y += dy * e.speed * dt;
      }
      if (d < e.r + player.r && e.contactCd <= 0) { damagePlayer(e.dmg); e.contactCd = 0.6; }

    } else {
      if (d > e.range + 20) { const dx=(player.x-e.x)/d,dy=(player.y-e.y)/d; e.x+=dx*e.speed*dt; e.y+=dy*e.speed*dt; }
      else if (d < e.range - 20) { const dx=(e.x-player.x)/d,dy=(e.y-player.y)/d; e.x+=dx*e.speed*dt; e.y+=dy*e.speed*dt; }
      e.fireTimer -= dt;
      if (e.fireTimer <= 0 && d < e.range + 40) {
        e.fireTimer = e.fireCd;
        const a = Math.atan2(player.y - e.y, player.x - e.x);
        enemyProjectiles.push({ x: e.x, y: e.y, vx: Math.cos(a)*220, vy: Math.sin(a)*220, dmg: e.dmg, r: 5, life: 3 });
      }
    }
    e.x = clamp(e.x, e.r, WORLD_SIZE - e.r);
    e.y = clamp(e.y, e.r, WORLD_SIZE - e.r);
  }
}

function updatePlayer(dt) {
  let mx = 0, my = 0;
  if (keys['w'] || keys['arrowup'])    my -= 1;
  if (keys['s'] || keys['arrowdown'])  my += 1;
  if (keys['a'] || keys['arrowleft'])  mx -= 1;
  if (keys['d'] || keys['arrowright']) mx += 1;

  if (mx !== 0 || my !== 0) {
    const len = Math.sqrt(mx*mx + my*my);
    mx /= len; my /= len;
    player.facing = { x: mx, y: my };
  }

  // Dash — Space or Shift
  if ((keys[' '] || keys['shift']) && player.dashCooldown <= 0) {
    let dx = mx || player.facing.x, dy = my || player.facing.y;
    const l = Math.sqrt(dx*dx+dy*dy) || 1; dx /= l; dy /= l;
    player.dashTimer = 0.18; player.dashVx = dx * 560; player.dashVy = dy * 560;
    player.invuln = Math.max(player.invuln, 0.22);
    player.dashCooldown = 2.0;
    spawnParticles(player.x, player.y, '#7b5cff', 6);
    sfxDash();
  }
  player.dashCooldown = Math.max(0, player.dashCooldown - dt);

  if (player.dashTimer > 0) {
    player.dashTimer -= dt;
    player.x = clamp(player.x + player.dashVx * dt, player.r, WORLD_SIZE - player.r);
    player.y = clamp(player.y + player.dashVy * dt, player.r, WORLD_SIZE - player.r);
  } else if (mx !== 0 || my !== 0) {
    player.x = clamp(player.x + mx * player.speed * dt, player.r, WORLD_SIZE - player.r);
    player.y = clamp(player.y + my * player.speed * dt, player.r, WORLD_SIZE - player.r);
  }

  if (player.regen > 0) player.hp = Math.min(player.maxHp, player.hp + player.regen * dt);
  if (player.invuln > 0) player.invuln -= dt;

  camera.x = lerp(camera.x, player.x - W/2, 0.15);
  camera.y = lerp(camera.y, player.y - H/2, 0.15);
  camera.x = clamp(camera.x, 0, WORLD_SIZE - W);
  camera.y = clamp(camera.y, 0, WORLD_SIZE - H);

  if (screenShake > 0) screenShake = Math.max(0, screenShake - 18 * dt);
}

function updateOrbs(dt) {
  for (let i = orbs.length - 1; i >= 0; i--) {
    const o = orbs[i];
    const d = dist(o.x, o.y, player.x, player.y);
    if (d < player.pickupRadius) {
      const dx = (player.x - o.x) / Math.max(d, 1), dy = (player.y - o.y) / Math.max(d, 1);
      o.x += dx * 370 * dt; o.y += dy * 370 * dt;
    }
    if (d < player.r + o.r + 4) { gainXp(o.value); sfxPickup(); orbs.splice(i, 1); }
  }
}

function updateHearts(dt) {
  for (let i = hearts.length - 1; i >= 0; i--) {
    const h = hearts[i];
    const d = dist(h.x, h.y, player.x, player.y);
    if (d < player.pickupRadius) {
      const dx = (player.x - h.x) / Math.max(d, 1), dy = (player.y - h.y) / Math.max(d, 1);
      h.x += dx * 330 * dt; h.y += dy * 330 * dt;
    }
    if (d < player.r + h.r + 4) {
      player.hp = Math.min(player.maxHp, player.hp + h.amount);
      spawnParticles(player.x, player.y, '#5cff7b', 6);
      spawnFloat(player.x, player.y - 20, `+${h.amount}`, '#5cff7b');
      sfxHeart(); hearts.splice(i, 1);
    }
  }
}

function gainXp(v) {
  player.xp += v;
  while (player.xp >= player.xpToNext) {
    player.xp -= player.xpToNext;
    player.level++;
    player.xpToNext = Math.floor(player.xpToNext * 1.3 + 4);
    triggerLevelUp();
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.9; p.vy *= 0.9;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function updateSpawning(dt) {
  spawnTimer -= dt;
  spawnInterval = Math.max(0.35, 1.6 - elapsed / 60);
  if (spawnTimer <= 0) {
    spawnTimer = spawnInterval;
    const batch = Math.min(6, 1 + Math.floor(elapsed / 40));
    for (let i = 0; i < batch; i++) spawnEnemy(pickEnemyType());
  }
  if (elapsed >= nextBossTime) { nextBossTime += 75; spawnBoss(); }
  const newWave = 1 + Math.floor(elapsed / 30);
  if (newWave !== waveNumber) { waveNumber = newWave; showWaveBanner(waveNumber); }
}

// ---------- Level Up / Upgrades ----------
function getUpgradePool() {
  const pool = [];
  for (const key of Object.keys(WEAPON_DEFS)) {
    const lvl = player.weapons[key] || 0;
    if (lvl < WEAPON_DEFS[key].maxLevel) pool.push({ kind: 'weapon', key, lvl: lvl + 1 });
  }
  for (const key of Object.keys(PASSIVE_DEFS)) pool.push({ kind: 'passive', key });
  return pool;
}

function applyUpgrade(choice) {
  if (choice.kind === 'weapon') {
    player.weapons[choice.key] = (player.weapons[choice.key] || 0) + 1;
  } else {
    const k = choice.key;
    player.passives[k] = (player.passives[k] || 0) + 1;
    if (k === 'maxhp')    { player.maxHp += 20; player.hp = Math.min(player.maxHp, player.hp + 20); }
    if (k === 'speed')     player.speed *= 1.08;
    if (k === 'damage')    player.damageMult *= 1.15;
    if (k === 'cooldown')  player.cooldownMult *= 0.92;
    if (k === 'pickup')    player.pickupRadius *= 1.3;
    if (k === 'regen')     player.regen += 0.4;
    if (k === 'lifesteal') player.lifesteal += 0.05;
    if (k === 'armor')     player.armor += 2;
    if (k === 'pierce')    player.pierceBuff += 1;
  }
}

function triggerLevelUp() {
  state = 'levelup'; sfxLevelUp();
  const pool = getUpgradePool();
  const choices = pickRandom(pool, Math.min(3, pool.length));
  const container = document.getElementById('upgrade-options');
  container.innerHTML = '';
  for (const c of choices) {
    const def = c.kind === 'weapon' ? WEAPON_DEFS[c.key] : PASSIVE_DEFS[c.key];
    const card = document.createElement('div');
    card.className = 'upgrade-card';
    const title = c.kind === 'weapon'
      ? `${def.name} ${(player.weapons[c.key] || 0) === 0 ? '(신규)' : 'LV ' + c.lvl}`
      : def.name;
    const desc = c.kind === 'weapon' ? def.desc(c.lvl) : def.desc;
    card.innerHTML = `<div class="icon">${def.icon}</div><div class="name">${title}</div><div class="desc">${desc}</div>`;
    card.onclick = () => { applyUpgrade(c); document.getElementById('levelup-screen').classList.add('hidden'); state = 'playing'; };
    container.appendChild(card);
  }
  document.getElementById('levelup-screen').classList.remove('hidden');
}

function triggerGameOver() {
  state = 'gameover';
  if (score > highScore) { highScore = score; localStorage.setItem('vs-hs', String(score)); }
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(Math.floor(elapsed % 60)).padStart(2, '0');
  document.getElementById('final-stats').innerHTML =
    `생존 시간: ${mm}:${ss} &nbsp;·&nbsp; 레벨: ${player.level} &nbsp;·&nbsp; 처치: ${kills}<br>
     점수: <b>${score.toLocaleString()}</b> &nbsp;·&nbsp; 최고: <b>${highScore.toLocaleString()}</b>`;
  document.getElementById('gameover-screen').classList.remove('hidden');
}

// ---------- HUD ----------
function updateHud() {
  document.getElementById('hp-bar').style.width = `${Math.max(0, player.hp / player.maxHp) * 100}%`;
  document.getElementById('hp-text').textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
  document.getElementById('xp-bar').style.width = `${(player.xp / player.xpToNext) * 100}%`;
  document.getElementById('level').textContent = `LV ${player.level}`;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(Math.floor(elapsed % 60)).padStart(2, '0');
  document.getElementById('timer').textContent = `${mm}:${ss}`;
  document.getElementById('kills').textContent = `킬: ${kills}`;
  document.getElementById('score-hud').textContent = `${score.toLocaleString()}`;
}

// ---------- Rendering ----------
function drawBackground() {
  ctx.fillStyle = '#0e0e1a';
  ctx.fillRect(0, 0, W, H);
  // parallax star-dots (two layers)
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  const seed1 = Math.floor(camera.x / 200), seed2 = Math.floor(camera.y / 200);
  for (let sx = seed1 - 1; sx <= seed1 + 6; sx++) {
    for (let sy = seed2 - 1; sy <= seed2 + 5; sy++) {
      const hx = Math.sin(sx * 127.1 + sy * 311.7) * 43758.5453;
      const hy = Math.sin(sx * 269.5 + sy * 183.3) * 43758.5453;
      const px = (sx * 200 + (hx - Math.floor(hx)) * 200) - camera.x * 0.4;
      const py = (sy * 200 + (hy - Math.floor(hy)) * 200) - camera.y * 0.4;
      if (px > -4 && px < W + 4 && py > -4 && py < H + 4) {
        ctx.fillRect(px, py, 1.5, 1.5);
      }
    }
  }
  // grid
  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  ctx.lineWidth = 1;
  const grid = 80;
  const startX = -(camera.x % grid), startY = -(camera.y % grid);
  for (let x = startX; x < W; x += grid) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = startY; y < H; y += grid) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  // world border
  ctx.strokeStyle = 'rgba(123,92,255,0.45)';
  ctx.lineWidth = 5;
  ctx.strokeRect(-camera.x, -camera.y, WORLD_SIZE, WORLD_SIZE);
}

function drawEnemies() {
  for (const e of enemies) {
    const sx = e.x - camera.x, sy = e.y - camera.y;
    if (sx < -60 || sx > W+60 || sy < -60 || sy > H+60) continue;
    // elite aura
    if (e.isElite) {
      ctx.beginPath(); ctx.strokeStyle = 'rgba(255,215,0,0.65)'; ctx.lineWidth = 2.5;
      ctx.arc(sx, sy, e.r + 4, 0, Math.PI * 2); ctx.stroke();
    }
    // boss aura + charge flash
    if (e.isBoss) {
      ctx.beginPath();
      ctx.strokeStyle = e.chargeDuration > 0 ? 'rgba(255,200,0,0.8)' : 'rgba(255,59,92,0.5)';
      ctx.lineWidth = 4; ctx.arc(sx, sy, e.r + 7, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.beginPath();
    if (e.hitFlash > 0) { ctx.fillStyle = '#fff'; }
    else { ctx.fillStyle = e.color; }
    if (e.isBoss)  { ctx.shadowColor = '#ff3b5c'; ctx.shadowBlur = 18; }
    if (e.isElite) { ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 12; }
    ctx.arc(sx, sy, e.r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    // hp bar
    if (e.hp < e.maxHp) {
      const bw = e.r * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(sx - bw/2, sy - e.r - 8, bw, 4);
      ctx.fillStyle = e.isBoss ? '#ff7b54' : '#ff5c7a';
      ctx.fillRect(sx - bw/2, sy - e.r - 8, bw * (e.hp / e.maxHp), 4);
    }
    if (e.isBoss) {
      ctx.fillStyle = '#ffd166'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('BOSS', sx, sy - e.r - 14);
    }
    if (e.isElite && !e.isBoss) {
      ctx.fillStyle = '#ffd700'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('★', sx, sy - e.r - 10);
    }
  }
  ctx.textAlign = 'left';
}

function drawPlayer() {
  const sx = player.x - camera.x, sy = player.y - camera.y;
  ctx.save();
  if (player.invuln > 0 && Math.floor(player.invuln * 20) % 2 === 0) ctx.globalAlpha = 0.35;
  // dash trail
  if (player.dashTimer > 0) {
    ctx.beginPath(); ctx.fillStyle = 'rgba(123,92,255,0.3)';
    ctx.arc(sx, sy, player.r * 1.8, 0, Math.PI * 2); ctx.fill();
  }
  ctx.beginPath(); ctx.fillStyle = '#7b5cff';
  ctx.shadowColor = '#7b5cff'; ctx.shadowBlur = 14;
  ctx.arc(sx, sy, player.r, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.beginPath(); ctx.fillStyle = '#e8e8f0';
  ctx.arc(sx + player.facing.x * 8, sy + player.facing.y * 8, 4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // dash cooldown ring
  if (player.dashCooldown > 0) {
    ctx.beginPath(); ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 2.5;
    ctx.arc(sx, sy, player.r + 5, 0, Math.PI * 2); ctx.stroke();
    const frac = 1 - player.dashCooldown / 2.0;
    ctx.beginPath();
    ctx.strokeStyle = frac > 0.8 ? '#5cff7b' : frac > 0.4 ? '#ffd166' : '#ff5c7a';
    ctx.lineWidth = 2.5;
    ctx.arc(sx, sy, player.r + 5, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();
  }

  // orbit blades
  for (const o of orbitDraws) {
    ctx.beginPath(); ctx.fillStyle = '#4dd0ff';
    ctx.shadowColor = '#4dd0ff'; ctx.shadowBlur = 10;
    ctx.arc(o.x - camera.x, o.y - camera.y, 7, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }
  // aura pulses
  for (const p of auraPulses) {
    ctx.beginPath();
    const col = p.explode ? `rgba(255,160,80,${Math.max(0, p.life/0.2)*0.7})` : `rgba(120,220,255,${Math.max(0, p.life/0.35)*0.55})`;
    ctx.strokeStyle = col; ctx.lineWidth = 3;
    ctx.arc(p.x - camera.x, p.y - camera.y, p.r, 0, Math.PI * 2); ctx.stroke();
  }
}

function drawProjectiles() {
  for (const p of projectiles) {
    const sx = p.x - camera.x, sy = p.y - camera.y;
    ctx.beginPath();
    ctx.fillStyle = p.color || '#ffd166';
    if (p.homing) { ctx.shadowColor = '#ff78a8'; ctx.shadowBlur = 8; }
    ctx.arc(sx, sy, p.r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.fillStyle = 'rgba(255,90,90,0.9)';
  for (const p of enemyProjectiles) {
    ctx.beginPath(); ctx.arc(p.x - camera.x, p.y - camera.y, p.r, 0, Math.PI * 2); ctx.fill();
  }
}

function drawOrbs() {
  for (const o of orbs) {
    const sx = o.x - camera.x, sy = o.y - camera.y;
    if (sx < -20 || sx > W+20 || sy < -20 || sy > H+20) continue;
    ctx.beginPath(); ctx.fillStyle = '#4dd0ff';
    ctx.shadowColor = '#4dd0ff'; ctx.shadowBlur = 7;
    ctx.arc(sx, sy, o.r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function drawHearts() {
  for (const h of hearts) {
    const sx = h.x - camera.x, sy = h.y - camera.y;
    if (sx < -20 || sx > W+20 || sy < -20 || sy > H+20) continue;
    ctx.beginPath(); ctx.fillStyle = '#5cff7b';
    ctx.shadowColor = '#5cff7b'; ctx.shadowBlur = 8;
    ctx.arc(sx, sy, h.r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#0a0a12'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('+', sx, sy + 4);
    ctx.textAlign = 'left';
  }
}

function drawLightning() {
  for (const b of lightningBolts) {
    ctx.beginPath();
    ctx.strokeStyle = `rgba(180,240,255,${Math.max(0, b.life / b.maxLife) * 0.9})`;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#a8f0ff'; ctx.shadowBlur = 6;
    ctx.moveTo(b.x1 - camera.x, b.y1 - camera.y);
    ctx.lineTo(b.x2 - camera.x, b.y2 - camera.y);
    ctx.stroke(); ctx.shadowBlur = 0;
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x - camera.x, p.y - camera.y, p.r || 2.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawFloats() {
  ctx.textAlign = 'center';
  for (const f of floatingNums) {
    ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
    ctx.fillStyle = f.color;
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(f.text, f.x - camera.x, f.y - camera.y);
  }
  ctx.globalAlpha = 1; ctx.textAlign = 'left';
}

function drawMinimap() {
  const mx = W - 174, my = H - 134, mw = 164, mh = 124;
  const scaleX = mw / WORLD_SIZE, scaleY = mh / WORLD_SIZE;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(mx, my, mw, mh);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.strokeRect(mx, my, mw, mh);
  // orbs
  ctx.fillStyle = '#4dd0ff';
  for (const o of orbs) ctx.fillRect(mx + o.x * scaleX - 1, my + o.y * scaleY - 1, 2, 2);
  // hearts
  ctx.fillStyle = '#5cff7b';
  for (const h of hearts) ctx.fillRect(mx + h.x * scaleX - 1, my + h.y * scaleY - 1, 2, 2);
  // enemies
  for (const e of enemies) {
    ctx.fillStyle = e.isBoss ? '#ff3b5c' : e.isElite ? '#ffd700' : e.color;
    const er = e.isBoss ? 4 : 2.5;
    ctx.beginPath(); ctx.arc(mx + e.x * scaleX, my + e.y * scaleY, er, 0, Math.PI * 2); ctx.fill();
  }
  // player
  ctx.fillStyle = '#fff';
  ctx.shadowColor = '#7b5cff'; ctx.shadowBlur = 6;
  ctx.beginPath(); ctx.arc(mx + player.x * scaleX, my + player.y * scaleY, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  // viewport
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1;
  ctx.strokeRect(mx + camera.x * scaleX, my + camera.y * scaleY, W * scaleX, H * scaleY);
  ctx.restore();
}

function drawEnemyArrows() {
  const cx = W / 2, cy = H / 2;
  const margin = 26;
  for (const e of enemies) {
    const sx = e.x - camera.x, sy = e.y - camera.y;
    if (sx > -60 && sx < W + 60 && sy > -60 && sy < H + 60) continue;
    const angle = Math.atan2(sy - cy, sx - cx);
    // clamp arrow to screen edge
    const maxDist = Math.min((cx - margin) / Math.abs(Math.cos(angle)), (cy - margin) / Math.abs(Math.sin(angle)));
    const ax = cx + Math.cos(angle) * maxDist;
    const ay = cy + Math.sin(angle) * maxDist;
    ctx.save();
    ctx.translate(ax, ay); ctx.rotate(angle);
    ctx.fillStyle = e.isBoss ? '#ff3b5c' : e.isElite ? '#ffd700' : 'rgba(255,255,255,0.65)';
    ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-5, -5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

// ---------- Main Loop ----------
function update(dt) {
  elapsed += dt;
  score += Math.floor(dt * 4);
  updatePlayer(dt);
  updateWeapons(dt);
  updateProjectiles(dt);
  updateEnemies(dt);
  updateOrbs(dt);
  updateHearts(dt);
  updateParticles(dt);
  updateFloats(dt);
  updateSpawning(dt);
  updateHud();
}

function render() {
  if (!player) return;
  const shakeX = screenShake > 0 ? rand(-screenShake, screenShake) : 0;
  const shakeY = screenShake > 0 ? rand(-screenShake, screenShake) : 0;
  ctx.save();
  ctx.translate(shakeX, shakeY);
  drawBackground();
  drawOrbs();
  drawHearts();
  drawEnemies();
  drawLightning();
  drawProjectiles();
  drawPlayer();
  drawParticles();
  drawFloats();
  drawEnemyArrows();
  ctx.restore();
  drawMinimap();
}

function loop(ts) {
  requestAnimationFrame(loop);
  if (!lastTime) lastTime = ts;
  let dt = (ts - lastTime) / 1000;
  lastTime = ts;
  dt = Math.min(dt, 0.05);
  if (state === 'playing') update(dt);
  render();
}

// ---------- UI Wiring ----------
document.getElementById('start-btn').onclick = () => {
  getAudio(); // unlock AudioContext on user gesture
  resetGame();
  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('gameover-screen').classList.add('hidden');
  state = 'playing';
};
document.getElementById('restart-btn').onclick = () => {
  resetGame();
  document.getElementById('gameover-screen').classList.add('hidden');
  state = 'playing';
};

requestAnimationFrame(loop);
