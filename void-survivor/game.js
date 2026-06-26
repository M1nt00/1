// ====================== VOID SURVIVOR ======================
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

// ---------- Input ----------
const keys = {};
window.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

// ---------- Game State ----------
let state = 'start'; // start | playing | levelup | gameover
let elapsed = 0;
let kills = 0;
let lastTime = 0;

let camera = { x: 0, y: 0 };

let player = null;
let enemies = [], projectiles = [], enemyProjectiles = [], orbs = [], particles = [], hearts = [];
let spawnTimer = 0;
let spawnInterval = 1.6;
let nextBossTime = 60;
let bossesSpawned = 0;
let bossBannerTimeout = null;

// ---------- Weapon Definitions ----------
const WEAPON_DEFS = {
  blaster: {
    name: '블래스터', icon: '🔵',
    desc: lvl => `전방 자동 사격 (LV ${lvl})`,
    maxLevel: 8,
  },
  orbit: {
    name: '오비탈 블레이드', icon: '⚔️',
    desc: lvl => `회전하는 칼날로 주변 적 처치 (LV ${lvl})`,
    maxLevel: 8,
  },
  aura: {
    name: '프로스트 오라', icon: '❄️',
    desc: lvl => `주기적으로 주변에 피해를 입힘 (LV ${lvl})`,
    maxLevel: 8,
  },
  chain: {
    name: '체인 라이트닝', icon: '⚡',
    desc: lvl => `가장 가까운 적을 시작으로 번개가 연쇄적으로 튕김 (LV ${lvl})`,
    maxLevel: 8,
  },
};

const PASSIVE_DEFS = {
  maxhp: { name: '활력', icon: '❤️', desc: '최대 체력 +20, 즉시 회복' },
  speed: { name: '신속', icon: '👟', desc: '이동 속도 +8%' },
  damage: { name: '공격력', icon: '💪', desc: '모든 무기 피해 +15%' },
  cooldown: { name: '연속 사격', icon: '⏱️', desc: '모든 무기 쿨다운 -8%' },
  pickup: { name: '자석', icon: '🧲', desc: '경험치 획득 범위 +30%' },
  regen: { name: '재생', icon: '✨', desc: '초당 체력 회복 +0.4' },
  lifesteal: { name: '흡혈', icon: '🩸', desc: '가한 피해의 5%만큼 체력 회복' },
  armor: { name: '방어', icon: '🛡️', desc: '받는 피해 -2 (최소 1)' },
};

function createPlayer() {
  return {
    x: WORLD_SIZE / 2, y: WORLD_SIZE / 2,
    r: 14,
    hp: 100, maxHp: 100,
    speed: 200,
    level: 1, xp: 0, xpToNext: 8,
    pickupRadius: 130,
    damageMult: 1,
    cooldownMult: 1,
    regen: 0,
    lifesteal: 0,
    armor: 0,
    invuln: 0,
    weapons: { blaster: 1 },
    passives: {},
    weaponCooldowns: { blaster: 0, orbit: 0, aura: 0, chain: 0 },
    orbitAngle: 0,
    facing: { x: 1, y: 0 },
  };
}

function resetGame() {
  player = createPlayer();
  enemies = [];
  projectiles = [];
  enemyProjectiles = [];
  orbs = [];
  particles = [];
  hearts = [];
  lightningBolts = [];
  elapsed = 0;
  kills = 0;
  spawnTimer = 0;
  spawnInterval = 1.6;
  nextBossTime = 60;
  bossesSpawned = 0;
  hideBossBanner();
  camera.x = player.x - W / 2;
  camera.y = player.y - H / 2;
}

// ---------- Enemy Types ----------
const ENEMY_TYPES = {
  grunt:  { hp: 22, speed: 80,  r: 13, dmg: 8,  color: '#ff5c7a', xp: 3, melee: true },
  swarm:  { hp: 10, speed: 130, r: 9,  dmg: 5,  color: '#ffd166', xp: 2, melee: true },
  brute:  { hp: 80, speed: 50,  r: 20, dmg: 16, color: '#9b59ff', xp: 8, melee: true },
  shooter:{ hp: 26, speed: 60,  r: 12, dmg: 10, color: '#4dd0ff', xp: 5, melee: false, range: 260, fireCd: 1.8 },
};

function spawnEnemy(t) {
  const def = ENEMY_TYPES[t];
  const angle = rand(0, Math.PI * 2);
  const radius = Math.max(W, H) / 1.4 + rand(40, 140);
  const x = clamp(player.x + Math.cos(angle) * radius, def.r, WORLD_SIZE - def.r);
  const y = clamp(player.y + Math.sin(angle) * radius, def.r, WORLD_SIZE - def.r);
  const timeScale = 1 + elapsed / 110;
  enemies.push({
    type: t, x, y, r: def.r,
    hp: def.hp * timeScale, maxHp: def.hp * timeScale,
    speed: def.speed, dmg: def.dmg, color: def.color, xp: def.xp,
    melee: def.melee, range: def.range, fireCd: def.fireCd, fireTimer: rand(0, 1),
    hitFlash: 0, contactCd: 0,
  });
}

function spawnBoss() {
  bossesSpawned++;
  const scale = 1 + (bossesSpawned - 1) * 0.6;
  const angle = rand(0, Math.PI * 2);
  const radius = Math.max(W, H) / 1.4 + rand(60, 140);
  const r = 32;
  const x = clamp(player.x + Math.cos(angle) * radius, r, WORLD_SIZE - r);
  const y = clamp(player.y + Math.sin(angle) * radius, r, WORLD_SIZE - r);
  enemies.push({
    type: 'boss', x, y, r,
    hp: 260 * scale, maxHp: 260 * scale,
    speed: 46, dmg: 22 + bossesSpawned * 2, color: '#ff3b5c', xp: 35,
    melee: true, hitFlash: 0, contactCd: 0, isBoss: true,
  });
  showBossBanner();
}

function showBossBanner() {
  const el = document.getElementById('boss-banner');
  if (!el) return;
  el.classList.remove('hidden');
  if (bossBannerTimeout) clearTimeout(bossBannerTimeout);
  bossBannerTimeout = setTimeout(() => el.classList.add('hidden'), 2600);
}

function hideBossBanner() {
  const el = document.getElementById('boss-banner');
  if (bossBannerTimeout) { clearTimeout(bossBannerTimeout); bossBannerTimeout = null; }
  if (el) el.classList.add('hidden');
}

function pickEnemyType() {
  const t = elapsed;
  const weights = [
    ['grunt', 5],
    ['swarm', 4 + Math.min(4, t / 30)],
    ['brute', t > 25 ? 2 + t / 60 : 0],
    ['shooter', t > 15 ? 2 + t / 50 : 0],
  ].filter(w => w[1] > 0);
  const total = weights.reduce((s, w) => s + w[1], 0);
  let r = rand(0, total);
  for (const [name, w] of weights) {
    if (r < w) return name;
    r -= w;
  }
  return 'grunt';
}

// ---------- Particles ----------
function spawnParticles(x, y, color, count = 6) {
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2);
    const sp = rand(40, 160);
    particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: rand(0.25, 0.5), maxLife: 0.5, color,
    });
  }
}

// ---------- XP Orbs ----------
function spawnOrb(x, y, value) {
  orbs.push({ x, y, value, r: 5 + Math.min(4, value / 4) });
}

// ---------- Heart Pickups ----------
function spawnHeart(x, y, amount) {
  hearts.push({ x, y, amount, r: 8 });
}

// ---------- Update ----------
function updatePlayer(dt) {
  let mx = 0, my = 0;
  if (keys['w'] || keys['arrowup']) my -= 1;
  if (keys['s'] || keys['arrowdown']) my += 1;
  if (keys['a'] || keys['arrowleft']) mx -= 1;
  if (keys['d'] || keys['arrowright']) mx += 1;
  if (mx !== 0 || my !== 0) {
    const len = Math.sqrt(mx * mx + my * my);
    mx /= len; my /= len;
    player.facing = { x: mx, y: my };
    player.x = clamp(player.x + mx * player.speed * dt, player.r, WORLD_SIZE - player.r);
    player.y = clamp(player.y + my * player.speed * dt, player.r, WORLD_SIZE - player.r);
  }

  if (player.regen > 0) {
    player.hp = Math.min(player.maxHp, player.hp + player.regen * dt);
  }
  if (player.invuln > 0) player.invuln -= dt;

  camera.x = lerp(camera.x, player.x - W / 2, 0.15);
  camera.y = lerp(camera.y, player.y - H / 2, 0.15);
  camera.x = clamp(camera.x, 0, WORLD_SIZE - W);
  camera.y = clamp(camera.y, 0, WORLD_SIZE - H);
}

function findNearestEnemy(x, y, maxRange = Infinity) {
  let best = null, bestD = maxRange * maxRange;
  for (const e of enemies) {
    const d = dist2(x, y, e.x, e.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

function fireBlaster(lvl) {
  const target = findNearestEnemy(player.x, player.y, 320);
  if (!target) return;
  const count = 1 + Math.floor((lvl - 1) / 2);
  const dmg = (12 + lvl * 5) * player.damageMult;
  const baseAngle = Math.atan2(target.y - player.y, target.x - player.x);
  const spread = 0.18;
  for (let i = 0; i < count; i++) {
    const off = count === 1 ? 0 : (i - (count - 1) / 2) * spread;
    const a = baseAngle + off;
    projectiles.push({
      x: player.x, y: player.y,
      vx: Math.cos(a) * 520, vy: Math.sin(a) * 520,
      dmg, r: 5, pierce: 1 + Math.floor(lvl / 3), life: 1.2,
    });
  }
}

function updateOrbit(dt, lvl) {
  player.orbitAngle += dt * 2.6;
  const count = 2 + Math.floor((lvl - 1) / 2);
  const radius = 60 + Math.min(lvl, 4) * 4;
  const dmg = (6 + lvl * 3) * player.damageMult * dt * 6;
  for (let i = 0; i < count; i++) {
    const a = player.orbitAngle + (Math.PI * 2 / count) * i;
    const bx = player.x + Math.cos(a) * radius;
    const by = player.y + Math.sin(a) * radius;
    for (const e of enemies) {
      if (dist2(bx, by, e.x, e.y) < (e.r + 12) ** 2) {
        damageEnemy(e, dmg);
      }
    }
    if (state === 'playing') {
      orbitDraws.push({ x: bx, y: by });
    }
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
    for (const e of enemies) {
      if (dist2(player.x, player.y, e.x, e.y) < radius ** 2) {
        damageEnemy(e, dmg);
      }
    }
  }
}

let orbitDraws = [];
let auraPulses = [];
let lightningBolts = [];

function fireChain(lvl) {
  let current = findNearestEnemy(player.x, player.y, 300);
  if (!current) return;
  const dmg = (10 + lvl * 4) * player.damageMult;
  const maxJumps = 2 + Math.floor(lvl / 2);
  const hit = new Set();
  let prevX = player.x, prevY = player.y;
  for (let i = 0; i < maxJumps && current; i++) {
    damageEnemy(current, dmg);
    hit.add(current);
    lightningBolts.push({ x1: prevX, y1: prevY, x2: current.x, y2: current.y, life: 0.15, maxLife: 0.15 });
    prevX = current.x; prevY = current.y;
    let next = null, bestD = 170 * 170;
    for (const e of enemies) {
      if (hit.has(e) || e.dead) continue;
      const d = dist2(current.x, current.y, e.x, e.y);
      if (d < bestD) { bestD = d; next = e; }
    }
    current = next;
  }
}

function updateLightning(dt) {
  for (let i = lightningBolts.length - 1; i >= 0; i--) {
    lightningBolts[i].life -= dt;
    if (lightningBolts[i].life <= 0) lightningBolts.splice(i, 1);
  }
}

function updateWeapons(dt) {
  orbitDraws = [];
  for (const [w, lvl] of Object.entries(player.weapons)) {
    if (w === 'blaster') {
      player.weaponCooldowns.blaster -= dt;
      const cd = Math.max(0.12, 0.55 - lvl * 0.04) * player.cooldownMult;
      if (player.weaponCooldowns.blaster <= 0) {
        player.weaponCooldowns.blaster = cd;
        fireBlaster(lvl);
      }
    } else if (w === 'orbit') {
      updateOrbit(dt, lvl);
    } else if (w === 'aura') {
      updateAura(dt, lvl);
    } else if (w === 'chain') {
      player.weaponCooldowns.chain -= dt;
      const cd = Math.max(0.4, 1.3 - lvl * 0.08) * player.cooldownMult;
      if (player.weaponCooldowns.chain <= 0) {
        player.weaponCooldowns.chain = cd;
        fireChain(lvl);
      }
    }
  }
  for (let i = auraPulses.length - 1; i >= 0; i--) {
    const p = auraPulses[i];
    p.life -= dt;
    p.r = lerp(p.r, p.maxR, 0.3);
    if (p.life <= 0) auraPulses.splice(i, 1);
  }
  updateLightning(dt);
}

function damageEnemy(e, dmg) {
  e.hp -= dmg;
  e.hitFlash = 0.12;
  if (player.lifesteal > 0) {
    player.hp = Math.min(player.maxHp, player.hp + dmg * player.lifesteal);
  }
  if (e.hp <= 0 && !e.dead) {
    e.dead = true;
    kills++;
    spawnParticles(e.x, e.y, e.color, 8);
    spawnOrb(e.x, e.y, e.xp);
    if (e.isBoss) {
      spawnHeart(e.x, e.y, 40);
    } else if (Math.random() < 0.1) {
      spawnHeart(e.x, e.y, 15);
    }
  }
}

function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.life -= dt;
    let removed = false;
    if (p.life <= 0 || p.x < 0 || p.x > WORLD_SIZE || p.y < 0 || p.y > WORLD_SIZE) {
      projectiles.splice(i, 1); continue;
    }
    for (const e of enemies) {
      if (e.dead) continue;
      if (dist2(p.x, p.y, e.x, e.y) < (e.r + p.r) ** 2) {
        damageEnemy(e, p.dmg);
        p.pierce--;
        if (p.pierce <= 0) { projectiles.splice(i, 1); removed = true; }
        break;
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
      damagePlayer(p.dmg);
      enemyProjectiles.splice(i, 1);
    }
  }
}

function damagePlayer(dmg) {
  if (player.invuln > 0) return;
  dmg = Math.max(1, dmg - player.armor);
  player.hp -= dmg;
  player.invuln = 0.5;
  spawnParticles(player.x, player.y, '#ff5c7a', 5);
  if (player.hp <= 0) {
    player.hp = 0;
    triggerGameOver();
  }
}

function updateEnemies(dt) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.dead) { enemies.splice(i, 1); continue; }
    if (e.hitFlash > 0) e.hitFlash -= dt;
    if (e.contactCd > 0) e.contactCd -= dt;

    const d = dist(e.x, e.y, player.x, player.y);
    if (e.melee) {
      if (d > 1) {
        const dx = (player.x - e.x) / d, dy = (player.y - e.y) / d;
        e.x += dx * e.speed * dt;
        e.y += dy * e.speed * dt;
      }
      if (d < e.r + player.r && e.contactCd <= 0) {
        damagePlayer(e.dmg);
        e.contactCd = 0.6;
      }
    } else {
      if (d > e.range + 20) {
        const dx = (player.x - e.x) / d, dy = (player.y - e.y) / d;
        e.x += dx * e.speed * dt;
        e.y += dy * e.speed * dt;
      } else if (d < e.range - 20) {
        const dx = (e.x - player.x) / d, dy = (e.y - player.y) / d;
        e.x += dx * e.speed * dt;
        e.y += dy * e.speed * dt;
      }
      e.fireTimer -= dt;
      if (e.fireTimer <= 0 && d < e.range + 40) {
        e.fireTimer = e.fireCd;
        const a = Math.atan2(player.y - e.y, player.x - e.x);
        enemyProjectiles.push({
          x: e.x, y: e.y, vx: Math.cos(a) * 220, vy: Math.sin(a) * 220,
          dmg: e.dmg, r: 5, life: 3,
        });
      }
    }
    e.x = clamp(e.x, e.r, WORLD_SIZE - e.r);
    e.y = clamp(e.y, e.r, WORLD_SIZE - e.r);
  }
}

function updateOrbs(dt) {
  for (let i = orbs.length - 1; i >= 0; i--) {
    const o = orbs[i];
    const d = dist(o.x, o.y, player.x, player.y);
    if (d < player.pickupRadius) {
      const speed = 360;
      const dx = (player.x - o.x) / Math.max(d, 1), dy = (player.y - o.y) / Math.max(d, 1);
      o.x += dx * speed * dt;
      o.y += dy * speed * dt;
    }
    if (d < player.r + o.r + 4) {
      gainXp(o.value);
      orbs.splice(i, 1);
    }
  }
}

function updateHearts(dt) {
  for (let i = hearts.length - 1; i >= 0; i--) {
    const h = hearts[i];
    const d = dist(h.x, h.y, player.x, player.y);
    if (d < player.pickupRadius) {
      const speed = 320;
      const dx = (player.x - h.x) / Math.max(d, 1), dy = (player.y - h.y) / Math.max(d, 1);
      h.x += dx * speed * dt;
      h.y += dy * speed * dt;
    }
    if (d < player.r + h.r + 4) {
      player.hp = Math.min(player.maxHp, player.hp + h.amount);
      spawnParticles(player.x, player.y, '#5cff7b', 6);
      hearts.splice(i, 1);
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
    p.vx *= 0.92; p.vy *= 0.92;
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
  if (elapsed >= nextBossTime) {
    nextBossTime += 75;
    spawnBoss();
  }
}

// ---------- Level Up / Upgrades ----------
function getUpgradePool() {
  const pool = [];
  for (const key of Object.keys(WEAPON_DEFS)) {
    const lvl = player.weapons[key] || 0;
    if (lvl < WEAPON_DEFS[key].maxLevel) {
      pool.push({ kind: 'weapon', key, lvl: lvl + 1 });
    }
  }
  for (const key of Object.keys(PASSIVE_DEFS)) {
    pool.push({ kind: 'passive', key });
  }
  return pool;
}

function applyUpgrade(choice) {
  if (choice.kind === 'weapon') {
    player.weapons[choice.key] = (player.weapons[choice.key] || 0) + 1;
  } else {
    const k = choice.key;
    player.passives[k] = (player.passives[k] || 0) + 1;
    if (k === 'maxhp') { player.maxHp += 20; player.hp = Math.min(player.maxHp, player.hp + 20); }
    if (k === 'speed') player.speed *= 1.08;
    if (k === 'damage') player.damageMult *= 1.15;
    if (k === 'cooldown') player.cooldownMult *= 0.92;
    if (k === 'pickup') player.pickupRadius *= 1.3;
    if (k === 'regen') player.regen += 0.4;
    if (k === 'lifesteal') player.lifesteal += 0.05;
    if (k === 'armor') player.armor += 2;
  }
}

function triggerLevelUp() {
  state = 'levelup';
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
    card.onclick = () => {
      applyUpgrade(c);
      document.getElementById('levelup-screen').classList.add('hidden');
      state = 'playing';
    };
    container.appendChild(card);
  }
  document.getElementById('levelup-screen').classList.remove('hidden');
}

function triggerGameOver() {
  state = 'gameover';
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(Math.floor(elapsed % 60)).padStart(2, '0');
  document.getElementById('final-stats').innerHTML =
    `생존 시간: ${mm}:${ss}<br>레벨: ${player.level}<br>처치 수: ${kills}`;
  document.getElementById('gameover-screen').classList.remove('hidden');
}

// ---------- Rendering ----------
function drawBackground() {
  ctx.fillStyle = '#11111c';
  ctx.fillRect(0, 0, W, H);
  const grid = 64;
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  const startX = -((camera.x) % grid);
  const startY = -((camera.y) % grid);
  for (let x = startX; x < W; x += grid) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = startY; y < H; y += grid) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  // world bounds
  ctx.strokeStyle = 'rgba(123,92,255,0.5)';
  ctx.lineWidth = 4;
  ctx.strokeRect(-camera.x, -camera.y, WORLD_SIZE, WORLD_SIZE);
}

function drawPlayer() {
  const sx = player.x - camera.x, sy = player.y - camera.y;
  ctx.save();
  if (player.invuln > 0 && Math.floor(player.invuln * 20) % 2 === 0) {
    ctx.globalAlpha = 0.4;
  }
  ctx.beginPath();
  ctx.fillStyle = '#7b5cff';
  ctx.shadowColor = '#7b5cff';
  ctx.shadowBlur = 14;
  ctx.arc(sx, sy, player.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  // facing indicator
  ctx.beginPath();
  ctx.fillStyle = '#e8e8f0';
  ctx.arc(sx + player.facing.x * 8, sy + player.facing.y * 8, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // orbit blades
  for (const o of orbitDraws) {
    ctx.beginPath();
    ctx.fillStyle = '#4dd0ff';
    ctx.shadowColor = '#4dd0ff';
    ctx.shadowBlur = 10;
    ctx.arc(o.x - camera.x, o.y - camera.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // aura pulses
  for (const p of auraPulses) {
    ctx.beginPath();
    ctx.strokeStyle = `rgba(120,220,255,${Math.max(0, p.life / 0.35) * 0.6})`;
    ctx.lineWidth = 3;
    ctx.arc(p.x - camera.x, p.y - camera.y, p.r, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawEnemies() {
  for (const e of enemies) {
    const sx = e.x - camera.x, sy = e.y - camera.y;
    if (sx < -60 || sx > W + 60 || sy < -60 || sy > H + 60) continue;
    if (e.isBoss) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255,59,92,0.5)';
      ctx.lineWidth = 4;
      ctx.arc(sx, sy, e.r + 6, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : e.color;
    if (e.isBoss) { ctx.shadowColor = '#ff3b5c'; ctx.shadowBlur = 16; }
    ctx.arc(sx, sy, e.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // hp bar
    if (e.hp < e.maxHp) {
      const w = e.r * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(sx - w / 2, sy - e.r - 8, w, 4);
      ctx.fillStyle = '#ff5c7a';
      ctx.fillRect(sx - w / 2, sy - e.r - 8, w * (e.hp / e.maxHp), 4);
    }
    if (e.isBoss) {
      ctx.fillStyle = '#ffd166';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('BOSS', sx, sy - e.r - 14);
    }
  }
}

function drawProjectiles() {
  ctx.fillStyle = '#ffd166';
  for (const p of projectiles) {
    ctx.beginPath();
    ctx.arc(p.x - camera.x, p.y - camera.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#ff5c7a';
  for (const p of enemyProjectiles) {
    ctx.beginPath();
    ctx.arc(p.x - camera.x, p.y - camera.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawOrbs() {
  for (const o of orbs) {
    const sx = o.x - camera.x, sy = o.y - camera.y;
    ctx.beginPath();
    ctx.fillStyle = '#4dd0ff';
    ctx.shadowColor = '#4dd0ff';
    ctx.shadowBlur = 8;
    ctx.arc(sx, sy, o.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function drawHearts() {
  for (const h of hearts) {
    const sx = h.x - camera.x, sy = h.y - camera.y;
    ctx.beginPath();
    ctx.fillStyle = '#5cff7b';
    ctx.shadowColor = '#5cff7b';
    ctx.shadowBlur = 8;
    ctx.arc(sx, sy, h.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#0a0a12';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('+', sx, sy + 3);
  }
}

function drawLightning() {
  for (const b of lightningBolts) {
    ctx.beginPath();
    ctx.strokeStyle = `rgba(120,220,255,${Math.max(0, b.life / b.maxLife)})`;
    ctx.lineWidth = 2.5;
    ctx.moveTo(b.x1 - camera.x, b.y1 - camera.y);
    ctx.lineTo(b.x2 - camera.x, b.y2 - camera.y);
    ctx.stroke();
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x - camera.x, p.y - camera.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function updateHud() {
  document.getElementById('hp-bar').style.width = `${Math.max(0, player.hp / player.maxHp) * 100}%`;
  document.getElementById('hp-text').textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
  document.getElementById('xp-bar').style.width = `${(player.xp / player.xpToNext) * 100}%`;
  document.getElementById('level').textContent = `LV ${player.level}`;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(Math.floor(elapsed % 60)).padStart(2, '0');
  document.getElementById('timer').textContent = `${mm}:${ss}`;
  document.getElementById('kills').textContent = `킬: ${kills}`;
}

// ---------- Main Loop ----------
function update(dt) {
  elapsed += dt;
  updatePlayer(dt);
  updateWeapons(dt);
  updateProjectiles(dt);
  updateEnemies(dt);
  updateOrbs(dt);
  updateHearts(dt);
  updateParticles(dt);
  updateSpawning(dt);
  updateHud();
}

function render() {
  if (!player) return;
  drawBackground();
  drawOrbs();
  drawHearts();
  drawEnemies();
  drawLightning();
  drawProjectiles();
  drawPlayer();
  drawParticles();
}

function loop(ts) {
  requestAnimationFrame(loop);
  if (!lastTime) lastTime = ts;
  let dt = (ts - lastTime) / 1000;
  lastTime = ts;
  dt = Math.min(dt, 0.05);

  if (state === 'playing') {
    update(dt);
  }
  render();
}

// ---------- UI Wiring ----------
document.getElementById('start-btn').onclick = () => {
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
