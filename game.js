/* Crowd Cannon — a tiny crowd-multiplier action game. MIT licence. */
(() => {
'use strict';

// ---------- constants & balance ----------
const W = 400, H = 720;
const FIELD_TOP = 112, DEF_LINE = 592, CANNON_Y = 660;
const MAX_BLUE = 600, MAX_RED = 450;
const SAVE_KEY = 'crowdcannon.v1';
const SITE_URL = (location.origin + location.pathname).replace(/index\.html$/, '');

const CANNONS = {
  stream: { name: 'Stream', desc: 'Tight, fast single stream.',         cost: 0,   interval: 0.18, count: 1, spread: 0.0 },
  spread: { name: 'Spread', desc: 'Three-way fan. Covers wide gates.',  cost: 250, interval: 0.42, count: 3, spread: 0.30 },
  volley: { name: 'Volley', desc: 'Five-shot burst with a wide arc.',   cost: 700, interval: 0.80, count: 5, spread: 0.55 },
};
const CHAMPS = {
  knight: { name: 'Knight', icon: '🛡️', hp: 45, dmg: 4, r: 11, speed: 55, cooldown: 14, color: '#7dd3fc', hint: 'Tanky brawler that breaks dense lines.' },
  bomber: { name: 'Bomber', icon: '💣', hp: 14, dmg: 1, r: 9,  speed: 85, cooldown: 20, blast: 80, blastDmg: 7, color: '#fde047', hint: 'Sprints in and explodes on contact.' },
};
const UPGRADES = {
  hp:    { name: 'Soldier armour', desc: '+35% soldier HP per level',              base: 100, max: 5 },
  rate:  { name: 'Fire rate',      desc: '+12% fire rate per level',               base: 140, max: 5 },
  base:  { name: 'Wall repair',    desc: '+8 defensive line HP per level',         base: 90,  max: 5 },
  champ: { name: 'Champion power', desc: '+25% champion HP & damage, -8% cooldown', base: 180, max: 5 },
};
const upCost = k => UPGRADES[k].base * (save.up[k] + 1);

// ---------- save ----------
function loadSave() {
  const d = { coins: 0, level: 1, best: 1, cannon: 'stream', owned: ['stream'], up: { hp: 0, rate: 0, base: 0, champ: 0 }, totalKills: 0, sound: true };
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s) { const up = Object.assign({}, d.up, s.up || {}); Object.assign(d, s); d.up = up; }
  } catch (e) { /* no storage */ }
  return d;
}
const save = loadSave();
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } }

// ---------- helpers ----------
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const circleRect = (s, r) => s.x + s.r > r.x && s.x - s.r < r.x + r.w && s.y + s.r > r.y && s.y - s.r < r.y + r.h;
const baseRect = b => ({ x: b.x - b.w / 2, y: b.y - b.h / 2, w: b.w, h: b.h });

// ---------- audio (tiny) ----------
let AC = null;
function beep(freq, dur, type, vol) {
  if (!save.sound) return;
  try {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'square'; o.frequency.value = freq;
    g.gain.value = vol || 0.04;
    g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
    o.connect(g); g.connect(AC.destination); o.start(); o.stop(AC.currentTime + dur);
  } catch (e) { /* no audio */ }
}

// ---------- level generation ----------
function makeLevel(n) {
  const rng = mulberry32(n * 7919 + 17);
  const pick = arr => arr[Math.floor(rng() * arr.length)];
  const L = {
    n, gates: [], walls: [], boosts: [], bases: [], waves: [],
    spawnEvery: Math.max(0.4, 1.3 - n * 0.06),
    bruteChance: n < 3 ? 0 : Math.min(0.3, 0.04 + n * 0.02),
  };
  const nBases = Math.min(3, 1 + Math.floor((n - 1) / 2));
  const xs = nBases === 1 ? [200] : nBases === 2 ? [120, 280] : [75, 200, 325];
  const baseHp = 200 + n * 60;
  xs.forEach(x => L.bases.push({ x, y: 82, w: 66, h: 42, hp: baseHp, maxHp: baseHp, timer: 1 + rng() * 2, wobble: 0 }));

  const rowYs = [190, 272, 354, 436, 518];
  const nRows = Math.min(5, 2 + Math.ceil(n / 2));
  let gid = 0;
  for (let i = 0; i < nRows; i++) {
    const y = rowYs[i];
    const r = rng();
    const allowTrap = n >= 4;
    if (r < 0.42) {
      // Big multiplier on a narrow side route, small one on a wide route, wall between.
      const bigMult = n < 2 ? 3 : pick([3, 3, 4]);
      const bigOnLeft = rng() < 0.5;
      const bigW = 72, smallW = 140;
      const big = { id: gid++, x: bigOnLeft ? 14 : W - 14 - bigW, y, w: bigW, h: 26, mult: bigMult, flash: 0 };
      const small = { id: gid++, x: bigOnLeft ? W - 22 - smallW : 22, y, w: smallW, h: 26, mult: allowTrap && rng() < 0.3 ? 0.5 : 2, flash: 0 };
      L.gates.push(big, small);
      const wx = bigOnLeft ? big.x + bigW + 4 : small.x + smallW + 4;
      const wx2 = bigOnLeft ? small.x - 4 : big.x - 4;
      L.walls.push({ x: wx, y: y - 8, w: wx2 - wx, h: 42 });
    } else if (r < 0.64) {
      // Moving gate.
      const w = 90;
      L.gates.push({ id: gid++, x: 16 + rng() * (W - 32 - w), y, w, h: 26, mult: pick([2, 3, 3]), flash: 0,
        move: { min: 16, max: W - 16 - w, speed: 50 + n * 6 + rng() * 30, dir: rng() < 0.5 ? 1 : -1 } });
    } else if (r < 0.86) {
      // Wall with a narrow gap; a gate sits just beyond the gap.
      const gapW = 76;
      const gx = 40 + rng() * (W - 80 - gapW);
      L.walls.push({ x: 0, y, w: gx, h: 18 }, { x: gx + gapW, y, w: W - gx - gapW, h: 18 });
      L.gates.push({ id: gid++, x: gx - 8, y: y - 44, w: gapW + 16, h: 26, mult: pick([2, 3]), flash: 0 });
    } else {
      // Speed boost strip.
      L.boosts.push({ x: 30, y: y - 10, w: W - 60, h: 40 });
    }
  }
  const waveN = 5 + n * 2;
  for (let t = 6, k = 0; t < 150; t += Math.max(8, 16 - n), k++) L.waves.push({ t, count: waveN + k * 2, done: false });
  return L;
}

// ---------- game state ----------
let L = null;
const G = {
  state: 'menu', t: 0, blue: [], red: [], parts: [], queue: [], toasts: [],
  cannon: { x: W / 2, tx: W / 2, recoil: 0 }, fireT: 0,
  cd: { knight: 0, bomber: 0 }, hp: 0, maxHp: 0, kills: 0, peak: 0, coins: 0, shake: 0, capFlash: 0,
};

function startLevel(n) {
  L = makeLevel(n);
  G.state = 'play'; G.t = 0; G.blue = []; G.red = []; G.parts = []; G.queue = []; G.toasts = [];
  G.cannon.x = G.cannon.tx = W / 2; G.cannon.recoil = 0; G.fireT = 0.4;
  G.cd.knight = 0; G.cd.bomber = 0;
  G.maxHp = G.hp = 24 + 8 * save.up.base;
  G.kills = 0; G.peak = 0; G.coins = 0; G.shake = 0; G.capFlash = 0;
  toast('Level ' + n + ' — drag to aim', 2.4);
  showScreen(null);
}

function mkSoldier(team, x, y, o) {
  return Object.assign({
    team, x, y, px: x, py: y, r: 4.5, hp: 1, maxHp: 1, dmg: 2,
    speed: team === 'blue' ? 95 : 46, boost: 0, lastGate: -1, champ: null,
    hit: 0, dead: false, brute: false, launchVx: 0, launchT: 0, ph: Math.random() * 6.283,
  }, o || {});
}

function spawnEnemy(x, y) {
  if (G.red.length >= MAX_RED) return;
  const brute = Math.random() < L.bruteChance;
  G.red.push(mkSoldier('red', clamp(x, 10, W - 10), y,
    brute ? { brute: true, r: 8, hp: 8, maxHp: 8, dmg: 3, speed: 34 } : {}));
}

function fire(cn) {
  const hpMul = 1 + 0.35 * save.up.hp;
  for (let i = 0; i < cn.count; i++) {
    if (G.blue.length + G.queue.length >= MAX_BLUE) { G.capFlash = 1; return; }
    const a = cn.count === 1 ? 0 : (i / (cn.count - 1) - 0.5) * 2 * cn.spread;
    G.blue.push(mkSoldier('blue', G.cannon.x + Math.sin(a) * 6, CANNON_Y - 26,
      { hp: hpMul, maxHp: hpMul, launchVx: Math.sin(a) * 150, launchT: 0.45 }));
  }
  G.cannon.recoil = 1;
}

function deploy(key) {
  if (G.state !== 'play' || G.cd[key] > 0) return;
  const c = CHAMPS[key], m = 1 + 0.25 * save.up.champ;
  G.cd[key] = c.cooldown * (1 - 0.08 * save.up.champ);
  G.blue.push(mkSoldier('blue', G.cannon.x, CANNON_Y - 34,
    { champ: key, hp: c.hp * m, maxHp: c.hp * m, dmg: c.dmg * m, r: c.r, speed: c.speed, lastGate: -2 }));
  toast(c.name + ' deployed!', 1.2);
  beep(220, 0.25, 'sawtooth', 0.05);
}

function explode(s) {
  s.dead = true;
  const c = CHAMPS.bomber, m = 1 + 0.25 * save.up.champ, R = c.blast;
  for (const e of G.red) {
    if (e.dead) continue;
    const dx = e.x - s.x, dy = e.y - s.y;
    if (dx * dx + dy * dy < R * R) { e.hp -= c.blastDmg * m; if (e.hp <= 0) { e.dead = true; G.kills++; puff(e.x, e.y, '#fca5a5', 2); } }
  }
  for (const b of L.bases) if (b.hp > 0 && Math.hypot(b.x - s.x, b.y - s.y) < R + 30) { b.hp -= 30 * m; b.wobble = 1; }
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 180;
    G.parts.push({ x: s.x, y: s.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.3, r: 2 + Math.random() * 3, color: Math.random() < 0.5 ? '#fde047' : '#fb923c' });
  }
  G.parts.push({ x: s.x, y: s.y, ring: true, life: 0.4, R });
  G.shake = 1; beep(90, 0.4, 'sawtooth', 0.08);
}

// ---------- spatial grid ----------
const CELL = 32, GW = Math.ceil(W / CELL), GH = Math.ceil(H / CELL) + 2;
function buildGrid(list) {
  const g = new Array(GW * GH);
  for (const s of list) {
    if (s.dead) continue;
    const i = clamp(Math.floor(s.y / CELL) + 1, 0, GH - 1) * GW + clamp(Math.floor(s.x / CELL), 0, GW - 1);
    (g[i] || (g[i] = [])).push(s);
  }
  return g;
}
function forNear(g, x, y, rad, fn) {
  const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL) + 1;
  for (let j = cy - rad; j <= cy + rad; j++) {
    if (j < 0 || j >= GH) continue;
    for (let i = cx - rad; i <= cx + rad; i++) {
      if (i < 0 || i >= GW) continue;
      const c = g[j * GW + i];
      if (c) for (let k = 0; k < c.length; k++) fn(c[k]);
    }
  }
}

// ---------- simulation ----------
function moveTeam(list, myGrid, enemyGrid, dirY, dt) {
  const isBlue = dirY < 0;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (s.dead) continue;
    s.px = s.x; s.py = s.y;
    if (s.hit > 0) s.hit -= dt;
    if (s.boost > 0) s.boost -= dt;
    const sp = s.speed * (s.boost > 0 ? 1.9 : 1);
    let tx = 0, ty = dirY;
    if (s.launchT > 0) {
      s.launchT -= dt;
      tx = (s.launchVx / sp) * (s.launchT / 0.45);
    } else {
      const range = isBlue ? 64 : 110;
      let best = range * range, tgt = null;
      forNear(enemyGrid, s.x, s.y, isBlue ? 2 : 4, e => {
        if (e.dead) return;
        const dx = e.x - s.x, dy = e.y - s.y;
        if (isBlue && dy > 24) return; // soldiers do not turn around for enemies far behind them
        const d2 = dx * dx + dy * dy;
        if (d2 < best) { best = d2; tgt = e; }
      });
      if (tgt) {
        const d = Math.sqrt(best) || 1;
        tx = (tgt.x - s.x) / d; ty = (tgt.y - s.y) / d;
      } else if (isBlue) {
        let bb = null, bd = Infinity;
        for (const b of L.bases) {
          if (b.hp <= 0) continue;
          const dx = b.x - s.x, dy = b.y - s.y;
          const near = Math.abs(dx) < 110 && dy < 0 && dy > -150;
          const topZone = s.y < FIELD_TOP + 90;
          if (!near && !topZone) continue;
          const d = Math.hypot(dx, dy);
          if (d < bd) { bd = d; bb = b; }
        }
        if (bb) { const d = bd || 1; tx = (bb.x - s.x) / d; ty = (bb.y - s.y) / d; }
      }
    }
    let sx = 0, sy = 0;
    forNear(myGrid, s.x, s.y, 1, o => {
      if (o === s || o.dead) return;
      const dx = s.x - o.x, dy = s.y - o.y, md = s.r + o.r, d2 = dx * dx + dy * dy;
      if (d2 < md * md) {
        if (d2 < 0.0001) { sx += Math.random() - 0.5; sy += Math.random() - 0.5; return; }
        const d = Math.sqrt(d2), f = (md - d) / md;
        sx += (dx / d) * f; sy += (dy / d) * f;
      }
    });
    s.x += (tx * sp + sx * 90) * dt;
    s.y += (ty * sp + sy * 90) * dt;
    s.x = clamp(s.x, s.r, W - s.r);
    for (const b of L.boosts) if (s.x > b.x && s.x < b.x + b.w && s.y > b.y && s.y < b.y + b.h) s.boost = 0.7;
  }
}

function collideWalls(s, dt) {
  for (const w of L.walls) {
    if (!circleRect(s, w)) continue;
    const pl = s.x + s.r - w.x, pr = w.x + w.w - (s.x - s.r), pt = s.y + s.r - w.y, pb = w.y + w.h - (s.y - s.r);
    const m = Math.min(pl, pr, pt, pb);
    if (m === pt) s.y = w.y - s.r;
    else if (m === pb) s.y = w.y + w.h + s.r;
    else if (m === pl) s.x = w.x - s.r;
    else s.x = w.x + w.w + s.r;
    if (m === pt || m === pb) {
      const leftOpen = w.x > 1, rightOpen = w.x + w.w < W - 1;
      let dir = 0;
      if (leftOpen && rightOpen) dir = (s.x - w.x) < (w.x + w.w - s.x) ? -1 : 1;
      else if (leftOpen) dir = -1; else if (rightOpen) dir = 1;
      s.x += dir * 85 * dt;
    }
  }
}

function checkGates(s) {
  if (s.champ) return;
  for (const g of L.gates) {
    if (s.lastGate === g.id) continue;
    const line = g.y + g.h / 2;
    if (s.py >= line && s.y < line && s.x >= g.x && s.x <= g.x + g.w) {
      s.lastGate = g.id;
      g.flash = 1;
      if (g.mult >= 2) {
        for (let i = 1; i < g.mult; i++) {
          if (G.blue.length + G.queue.length >= MAX_BLUE) { G.capFlash = 1; break; }
          G.queue.push(mkSoldier('blue', s.x + (Math.random() - 0.5) * 10, s.y - Math.random() * 6,
            { hp: s.maxHp, maxHp: s.maxHp, lastGate: g.id, px: s.px, py: s.py }));
        }
        G.gateTick = (G.gateTick || 0) + 1;
        if (G.gateTick % 4 === 0) beep(500 + Math.min(600, G.blue.length), 0.06, 'triangle', 0.03);
      } else {
        g.count = (g.count || 0) + 1;
        if (g.count % 2 === 0) { s.dead = true; puff(s.x, s.y, '#93c5fd', 2); }
      }
    }
  }
}

function combat(gRed, dt) {
  for (const s of G.blue) {
    if (s.dead) continue;
    forNear(gRed, s.x, s.y, 1, e => {
      if (e.dead || s.dead) return;
      const dx = e.x - s.x, dy = e.y - s.y, md = s.r + e.r + 1;
      const d2 = dx * dx + dy * dy;
      if (d2 >= md * md) return;
      if (s.champ === 'bomber') { explode(s); return; }
      e.hp -= s.dmg * dt; s.hp -= e.dmg * dt; s.hit = e.hit = 0.12;
      const d = Math.sqrt(d2) || 1, push = (md - d) * 0.3;
      s.x -= dx / d * push; s.y -= dy / d * push; e.x += dx / d * push; e.y += dy / d * push;
      if (e.hp <= 0) { e.dead = true; G.kills++; puff(e.x, e.y, '#fca5a5', 3); }
      if (s.hp <= 0) { s.dead = true; puff(s.x, s.y, '#93c5fd', 3); }
    });
  }
}

function hitBases(dt) {
  for (const b of L.bases) {
    if (b.hp <= 0) continue;
    const r = baseRect(b); r.y += 6; r.h += 6;
    if (b.wobble > 0) b.wobble -= dt;
    for (const s of G.blue) {
      if (s.dead || !circleRect(s, r)) continue;
      if (s.champ) { b.hp -= s.dmg * 3 * dt; s.y = r.y + r.h + s.r; b.wobble = 0.3; }
      else { b.hp -= 1; s.dead = true; b.wobble = 0.15; puff(s.x, s.y, '#bfdbfe', 2); }
    }
    if (b.hp <= 0) {
      b.hp = 0;
      for (let i = 0; i < 60; i++) {
        const a = Math.random() * Math.PI * 2, v = 40 + Math.random() * 160;
        G.parts.push({ x: b.x, y: b.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: 0.6 + Math.random() * 0.5, r: 2 + Math.random() * 4, color: Math.random() < 0.5 ? '#ef4444' : '#7f1d1d' });
      }
      G.shake = 1.2; toast('Base destroyed!', 1.5); beep(120, 0.5, 'square', 0.08);
    }
  }
}

function update(dt) {
  G.t += dt;
  const cn = CANNONS[save.cannon] || CANNONS.stream;
  G.cannon.x += (G.cannon.tx - G.cannon.x) * Math.min(1, dt * 16);
  G.cannon.recoil = Math.max(0, G.cannon.recoil - dt * 6);
  G.fireT -= dt;
  if (G.fireT <= 0) { G.fireT += cn.interval / (1 + 0.12 * save.up.rate); fire(cn); }
  for (const k in G.cd) G.cd[k] = Math.max(0, G.cd[k] - dt);
  G.shake = Math.max(0, G.shake - dt * 3);
  G.capFlash = Math.max(0, G.capFlash - dt);

  for (const g of L.gates) {
    g.flash = Math.max(0, g.flash - dt * 3);
    if (g.move) {
      g.x += g.move.dir * g.move.speed * dt;
      if (g.x < g.move.min) { g.x = g.move.min; g.move.dir = 1; }
      else if (g.x > g.move.max) { g.x = g.move.max; g.move.dir = -1; }
    }
  }
  for (const b of L.bases) if (b.hp > 0) {
    b.timer -= dt;
    if (b.timer <= 0) { b.timer += L.spawnEvery; spawnEnemy(b.x + (Math.random() - 0.5) * 50, b.y + b.h / 2 + 8); }
  }
  for (const w of L.waves) if (!w.done && G.t >= w.t) {
    w.done = true;
    for (let i = 0; i < w.count; i++) spawnEnemy(30 + Math.random() * (W - 60), FIELD_TOP - 20 - Math.random() * 40);
    toast('Enemy wave!', 1.2); beep(160, 0.3, 'square', 0.05);
  }

  const gBlue = buildGrid(G.blue), gRed = buildGrid(G.red);
  moveTeam(G.blue, gBlue, gRed, -1, dt);
  moveTeam(G.red, gRed, gBlue, 1, dt);
  for (const s of G.blue) collideWalls(s, dt);
  for (const s of G.red) collideWalls(s, dt);
  for (const s of G.blue) checkGates(s);
  combat(gRed, dt);
  hitBases(dt);

  for (const e of G.red) if (!e.dead && e.y > DEF_LINE + 4) {
    e.dead = true; G.hp -= e.brute ? 3 : 1; G.shake = Math.max(G.shake, 0.5);
    puff(e.x, DEF_LINE, '#fecaca', 4); beep(70, 0.2, 'square', 0.06);
  }
  for (const s of G.blue) if (!s.dead && s.y < 8) s.dead = true;

  if (G.queue.length) { for (const q of G.queue) G.blue.push(q); G.queue.length = 0; }
  G.blue = G.blue.filter(s => !s.dead);
  G.red = G.red.filter(s => !s.dead);
  G.peak = Math.max(G.peak, G.blue.length);

  for (let i = G.parts.length - 1; i >= 0; i--) {
    const p = G.parts[i]; p.life -= dt;
    if (p.life <= 0) { G.parts.splice(i, 1); continue; }
    if (!p.ring) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy = p.vy * 0.92 + 60 * dt; }
  }
  for (let i = G.toasts.length - 1; i >= 0; i--) { G.toasts[i].t -= dt; if (G.toasts[i].t <= 0) G.toasts.splice(i, 1); }

  if (G.hp <= 0) endLevel(false);
  else if (L.bases.every(b => b.hp <= 0)) endLevel(true);
}

function puff(x, y, color, n) {
  if (G.parts.length > 350) return;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = 20 + Math.random() * 60;
    G.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.25 + Math.random() * 0.2, r: 1.5 + Math.random() * 2, color });
  }
}
function toast(msg, t) { G.toasts.push({ msg, t: t || 1.5, max: t || 1.5 }); }

function endLevel(win) {
  G.state = win ? 'win' : 'lose';
  const earned = win
    ? 25 + L.n * 15 + L.bases.length * 20 + Math.round(G.kills * 0.25) + G.hp * 2
    : Math.round(G.kills * 0.1);
  G.coins = earned; save.coins += earned; save.totalKills += G.kills;
  if (win) { save.level = L.n + 1; save.best = Math.max(save.best, L.n + 1); }
  persist();
  beep(win ? 660 : 110, 0.6, win ? 'triangle' : 'sawtooth', 0.07);
  if (win) setTimeout(() => beep(880, 0.6, 'triangle', 0.07), 150);
  showEnd(win);
}

// ---------- rendering ----------
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const wrap = document.getElementById('wrap');
let scale = 1;
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const vw = window.innerWidth, vh = window.innerHeight;
  scale = Math.min(vw / W, vh / H);
  const cw = Math.round(W * scale), ch = Math.round(H * scale);
  canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
  wrap.style.width = cw + 'px'; wrap.style.height = ch + 'px';
  canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
}
window.addEventListener('resize', resize);
resize();

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

const TAU = 6.2832;
function rrPath(x, y, w, h, r) {
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// Little soldiers: batched into a handful of fills per team so hundreds stay cheap.
// Blue faces up (we see helmets and backpacks); red faces down (we see faces).
const PAL = {
  blue: { body: '#3b82f6', dark: '#1e3a8a', helmet: '#1d4ed8', stripe: '#93c5fd', skin: '#fcd9b6', gun: '#1f2937' },
  red:  { body: '#ef4444', dark: '#7f1d1d', helmet: '#991b1b', stripe: '#fca5a5', skin: '#fcd9b6', gun: '#1f2937' },
};
function drawSoldiers(list, pal, facingUp) {
  const t = G.t * 14;
  const plain = s => !s.champ && !s.brute;
  // legs
  ctx.fillStyle = pal.dark; ctx.beginPath();
  for (const s of list) { if (!plain(s)) continue; const r = s.r, k = Math.sin(t + s.ph) * r * 0.4;
    ctx.rect(s.x - r * 0.72, s.y + r * 0.55 + k, r * 0.55, r * 0.95); ctx.rect(s.x + r * 0.17, s.y + r * 0.55 - k, r * 0.55, r * 0.95); }
  ctx.fill();
  // body
  ctx.fillStyle = pal.body; ctx.beginPath();
  for (const s of list) { if (!plain(s)) continue; const r = s.r; rrPath(s.x - r, s.y - r * 0.45, r * 2, r * 1.45, r * 0.45); }
  ctx.fill();
  // backpack (blue) or belt (red)
  ctx.fillStyle = pal.dark; ctx.beginPath();
  for (const s of list) { if (!plain(s)) continue; const r = s.r;
    if (facingUp) rrPath(s.x - r * 0.5, s.y - r * 0.2, r, r * 0.9, r * 0.25); else ctx.rect(s.x - r, s.y + r * 0.55, r * 2, r * 0.3); }
  ctx.fill();
  // rifle
  ctx.fillStyle = pal.gun; ctx.beginPath();
  for (const s of list) { if (!plain(s)) continue; const r = s.r; ctx.rect(s.x + r * 0.95, facingUp ? s.y - r * 1.5 : s.y - r * 0.1, r * 0.32, r * 1.6); }
  ctx.fill();
  // head
  ctx.fillStyle = pal.skin; ctx.beginPath();
  for (const s of list) { if (!plain(s)) continue; const r = s.r; ctx.moveTo(s.x + r * 0.7, s.y - r); ctx.arc(s.x, s.y - r, r * 0.7, 0, TAU); }
  ctx.fill();
  // helmet
  ctx.fillStyle = pal.helmet; ctx.beginPath();
  for (const s of list) { if (!plain(s)) continue; const r = s.r, hy = s.y - r * 1.05;
    if (facingUp) { ctx.moveTo(s.x + r * 0.76, hy); ctx.arc(s.x, hy, r * 0.76, 0, TAU); }
    else { ctx.moveTo(s.x - r * 0.78, hy + r * 0.1); ctx.arc(s.x, hy + r * 0.1, r * 0.78, Math.PI, 0); ctx.closePath(); } }
  ctx.fill();
  // helmet stripe / eyes
  if (facingUp) {
    ctx.fillStyle = pal.stripe; ctx.beginPath();
    for (const s of list) { if (!plain(s)) continue; const r = s.r; ctx.rect(s.x - r * 0.12, s.y - r * 1.75, r * 0.24, r * 1.1); }
    ctx.fill();
  } else {
    ctx.fillStyle = '#111827'; ctx.beginPath();
    for (const s of list) { if (!plain(s)) continue; const r = s.r, ey = s.y - r * 0.85;
      ctx.moveTo(s.x - r * 0.25 + r * 0.13, ey); ctx.arc(s.x - r * 0.25, ey, r * 0.13, 0, TAU);
      ctx.moveTo(s.x + r * 0.25 + r * 0.13, ey); ctx.arc(s.x + r * 0.25, ey, r * 0.13, 0, TAU); }
    ctx.fill();
  }
  // hit flash: white silhouette
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath();
  for (const s of list) { if (!plain(s) || s.hit <= 0) continue; const r = s.r;
    rrPath(s.x - r, s.y - r * 0.45, r * 2, r * 1.45, r * 0.45); ctx.moveTo(s.x + r * 0.78, s.y - r * 1.05); ctx.arc(s.x, s.y - r * 1.05, r * 0.78, 0, TAU); }
  ctx.fill();
}

function hpBar(s) {
  const w = s.r * 2.4, f = clamp(s.hp / s.maxHp, 0, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(s.x - w / 2, s.y - s.r * 2.1, w, 3);
  ctx.fillStyle = '#4ade80'; ctx.fillRect(s.x - w / 2, s.y - s.r * 2.1, w * f, 3);
}

// Brute: a spiky, hunched monster with a club.
function drawBrute(s) {
  const r = s.r, x = s.x, y = s.y, k = Math.sin(G.t * 9 + s.ph) * r * 0.25;
  ctx.fillStyle = '#7f1d1d';
  ctx.fillRect(x - r * 0.75, y + r * 0.45 + k, r * 0.5, r * 0.8); ctx.fillRect(x + r * 0.25, y + r * 0.45 - k, r * 0.5, r * 0.8);
  ctx.fillStyle = '#78350f'; ctx.fillRect(x + r * 0.85, y - r * 0.9, r * 0.32, r * 1.5);
  ctx.fillStyle = '#a16207'; ctx.beginPath(); ctx.arc(x + r * 1.01, y - r * 1.0, r * 0.42, 0, TAU); ctx.fill();
  ctx.fillStyle = s.hit > 0 ? '#fff' : '#991b1b';
  ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.85, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fca5a5'; ctx.beginPath();
  for (let i = -1; i <= 1; i++) { const sx = x + i * r * 0.55; ctx.moveTo(sx - r * 0.22, y - r * 0.55); ctx.lineTo(sx, y - r * 1.3); ctx.lineTo(sx + r * 0.22, y - r * 0.55); }
  ctx.fill();
  ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.1, r * 0.22, 0, TAU); ctx.arc(x + r * 0.35, y - r * 0.1, r * 0.22, 0, TAU); ctx.fill();
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x - r * 0.33, y - r * 0.05, r * 0.1, 0, TAU); ctx.arc(x + r * 0.37, y - r * 0.05, r * 0.1, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#450a0a'; ctx.lineWidth = 1.5; ctx.beginPath();
  ctx.moveTo(x - r * 0.6, y - r * 0.5); ctx.lineTo(x - r * 0.15, y - r * 0.3); ctx.moveTo(x + r * 0.6, y - r * 0.5); ctx.lineTo(x + r * 0.15, y - r * 0.3); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x - r * 0.3, y + r * 0.35); ctx.lineTo(x - r * 0.2, y + r * 0.6); ctx.lineTo(x - r * 0.1, y + r * 0.35); ctx.moveTo(x + r * 0.1, y + r * 0.35); ctx.lineTo(x + r * 0.2, y + r * 0.6); ctx.lineTo(x + r * 0.3, y + r * 0.35); ctx.fill();
  hpBar(s);
}

function drawChampion(s) {
  const c = CHAMPS[s.champ], r = s.r, x = s.x, y = s.y, k = Math.sin(G.t * 12 + s.ph) * r * 0.3;
  ctx.save();
  ctx.shadowColor = c.color; ctx.shadowBlur = 10;
  if (s.champ === 'knight') {
    ctx.fillStyle = '#1e3a8a'; ctx.fillRect(x - r * 0.7, y + r * 0.5 + k, r * 0.5, r * 0.9); ctx.fillRect(x + r * 0.2, y + r * 0.5 - k, r * 0.5, r * 0.9);
    ctx.fillStyle = '#e5e7eb'; ctx.fillRect(x + r * 0.85, y - r * 2.2, r * 0.28, r * 2.1);
    ctx.fillStyle = '#78350f'; ctx.fillRect(x + r * 0.6, y - r * 0.2, r * 0.8, r * 0.3);
    ctx.fillStyle = s.hit > 0 ? '#fff' : '#60a5fa'; ctx.beginPath(); rrPath(x - r, y - r * 0.5, r * 2, r * 1.5, r * 0.45); ctx.fill();
    ctx.fillStyle = '#1e40af'; ctx.fillRect(x - r * 0.15, y - r * 0.5, r * 0.3, r * 1.5);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.arc(x - r * 1.05, y + r * 0.1, r * 0.6, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#b45309'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#b45309'; ctx.beginPath(); ctx.arc(x - r * 1.05, y + r * 0.1, r * 0.18, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fcd9b6'; ctx.beginPath(); ctx.arc(x, y - r * 1.1, r * 0.62, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1e40af'; ctx.beginPath(); ctx.arc(x, y - r * 1.15, r * 0.7, 0, TAU); ctx.fill();
    ctx.fillStyle = '#0f172a'; ctx.fillRect(x - r * 0.5, y - r * 1.2, r, r * 0.22);
    ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.moveTo(x, y - r * 1.85); ctx.quadraticCurveTo(x + r * 0.6, y - r * 2.4, x + r * 0.9, y - r * 1.7); ctx.quadraticCurveTo(x + r * 0.4, y - r * 1.8, x, y - r * 1.6); ctx.fill();
  } else {
    ctx.fillStyle = '#1f2937'; ctx.fillRect(x - r * 0.7, y + r * 0.5 + k, r * 0.5, r * 0.8); ctx.fillRect(x + r * 0.2, y + r * 0.5 - k, r * 0.5, r * 0.8);
    ctx.fillStyle = s.hit > 0 ? '#fff' : '#111827'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.35, 0, TAU); ctx.fill();
    ctx.fillStyle = '#6b7280'; ctx.fillRect(x - r * 0.25, y - r * 1.25, r * 0.5, r * 0.4);
    ctx.strokeStyle = '#d6d3d1'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y - r * 1.25); ctx.quadraticCurveTo(x + r * 0.4, y - r * 1.8, x + r * 0.8, y - r * 1.6); ctx.stroke();
    const sp = 0.8 + Math.sin(G.t * 40) * 0.3;
    ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.arc(x + r * 0.8, y - r * 1.6, r * 0.3 * sp, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fb923c'; ctx.beginPath(); ctx.arc(x + r * 0.8, y - r * 1.6, r * 0.15 * sp, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.1, r * 0.22, 0, TAU); ctx.arc(x + r * 0.3, y - r * 0.1, r * 0.22, 0, TAU); ctx.fill();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.15, r * 0.1, 0, TAU); ctx.arc(x + r * 0.3, y - r * 0.15, r * 0.1, 0, TAU); ctx.fill();
  }
  hpBar(s);
  ctx.restore();
}

function draw() {
  ctx.save();
  if (G.shake > 0) ctx.translate((Math.random() - 0.5) * G.shake * 8, (Math.random() - 0.5) * G.shake * 8);

  // field
  ctx.fillStyle = '#72b96c'; ctx.fillRect(-10, -10, W + 20, H + 20);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let y = 0; y < H; y += 80) ctx.fillRect(-10, y, W + 20, 40);
  ctx.fillStyle = 'rgba(190,24,60,0.22)'; ctx.fillRect(-10, -10, W + 20, FIELD_TOP + 10);
  ctx.fillStyle = 'rgba(37,99,235,0.18)'; ctx.fillRect(-10, DEF_LINE, W + 20, H - DEF_LINE + 10);

  if (L) {
    // boosts
    for (const b of L.boosts) {
      ctx.fillStyle = 'rgba(253,224,71,0.28)'; ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = 'rgba(250,204,21,0.9)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      const off = (G.t * 60) % 20;
      for (let x = b.x + 20; x < b.x + b.w; x += 44) {
        for (let k = 0; k < 2; k++) {
          const yy = b.y + b.h - 8 - ((off + k * 20) % 40);
          ctx.beginPath(); ctx.moveTo(x - 8, yy + 6); ctx.lineTo(x, yy - 2); ctx.lineTo(x + 8, yy + 6); ctx.stroke();
        }
      }
    }
    // gates
    for (const g of L.gates) {
      const good = g.mult >= 2;
      const col = !good ? '239,68,68' : g.mult >= 4 ? '168,85,247' : g.mult === 3 ? '34,197,94' : '59,130,246';
      ctx.fillStyle = `rgba(${col},${(good ? 0.35 : 0.55) + g.flash * 0.4})`;
      roundRect(g.x, g.y, g.w, g.h, 6); ctx.fill();
      ctx.strokeStyle = `rgba(${col},0.95)`; ctx.lineWidth = 2.5; ctx.stroke();
      // posts
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(g.x - 3, g.y - 4, 6, g.h + 8); ctx.fillRect(g.x + g.w - 3, g.y - 4, 6, g.h + 8);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 17px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 4;
      ctx.fillText(good ? '×' + g.mult : '÷2', g.x + g.w / 2, g.y + g.h / 2 + 1);
      ctx.shadowBlur = 0;
      if (g.move) { ctx.font = 'bold 11px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillText(g.move.dir > 0 ? '▶' : '◀', g.x + g.w / 2 + (g.move.dir > 0 ? 24 : -24), g.y + g.h / 2 + 1); }
    }
    // walls
    for (const w of L.walls) {
      ctx.fillStyle = '#64748b'; roundRect(w.x, w.y + 5, w.w, w.h, 4); ctx.fill();
      ctx.fillStyle = '#e2e8f0'; roundRect(w.x, w.y, w.w, w.h, 4); ctx.fill();
      ctx.fillStyle = '#cbd5e1'; roundRect(w.x, w.y + w.h * 0.5, w.w, w.h * 0.5, 4); ctx.fill();
    }
    // bases
    for (const b of L.bases) {
      const r = baseRect(b);
      if (b.hp <= 0) {
        ctx.fillStyle = '#57534e'; roundRect(r.x + 6, r.y + 12, r.w - 12, r.h - 12, 6); ctx.fill();
        ctx.fillStyle = '#78716c'; roundRect(r.x + 14, r.y + 6, r.w - 28, 16, 4); ctx.fill();
        continue;
      }
      const wob = b.wobble > 0 ? Math.sin(G.t * 60) * 2 : 0;
      ctx.save(); ctx.translate(wob, 0);
      ctx.fillStyle = '#7f1d1d'; roundRect(r.x, r.y + 6, r.w, r.h, 6); ctx.fill();
      ctx.fillStyle = '#dc2626'; roundRect(r.x, r.y, r.w, r.h, 6); ctx.fill();
      ctx.fillStyle = '#b91c1c';
      for (let x = r.x + 4; x < r.x + r.w - 6; x += 14) ctx.fillRect(x, r.y - 7, 9, 10);
      ctx.fillStyle = '#fecaca'; roundRect(r.x + r.w / 2 - 9, r.y + 14, 18, r.h - 14, 4); ctx.fill();
      ctx.fillStyle = '#1f2937'; roundRect(r.x + r.w / 2 - 5, r.y + 20, 10, r.h - 20, 3); ctx.fill();
      ctx.restore();
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; roundRect(r.x, r.y + r.h + 9, r.w, 7, 3); ctx.fill();
      ctx.fillStyle = '#f87171'; roundRect(r.x, r.y + r.h + 9, r.w * clamp(b.hp / b.maxHp, 0, 1), 7, 3); ctx.fill();
    }
    // defensive line
    ctx.setLineDash([8, 6]); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, DEF_LINE); ctx.lineTo(W, DEF_LINE); ctx.stroke(); ctx.setLineDash([]);
    for (let x = 6; x < W; x += 24) {
      ctx.fillStyle = '#b08d57'; ctx.beginPath(); ctx.ellipse(x + 10, DEF_LINE + 8, 11, 5.5, 0, 0, 6.2832); ctx.fill();
      ctx.fillStyle = '#d4b483'; ctx.beginPath(); ctx.ellipse(x + 10, DEF_LINE + 6, 10, 4, 0, 0, 6.2832); ctx.fill();
    }
  }

  // soldiers
  drawSoldiers(G.red, PAL.red, false);
  for (const s of G.red) if (s.brute) drawBrute(s);
  drawSoldiers(G.blue, PAL.blue, true);
  for (const s of G.blue) if (s.champ) drawChampion(s);

  // particles
  for (const p of G.parts) {
    if (p.ring) {
      ctx.strokeStyle = `rgba(253,224,71,${p.life / 0.4})`; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.R * (1 - p.life / 0.4), 0, 6.2832); ctx.stroke();
      continue;
    }
    ctx.globalAlpha = clamp(p.life * 3, 0, 1); ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // cannon
  const cx = G.cannon.x, rec = G.cannon.recoil * 5;
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(cx, CANNON_Y + 14, 26, 9, 0, 0, 6.2832); ctx.fill();
  ctx.fillStyle = '#1e40af'; ctx.beginPath(); ctx.arc(cx, CANNON_Y + 4, 22, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#3b82f6'; ctx.beginPath(); ctx.arc(cx, CANNON_Y + 4, 16, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#334155'; roundRect(cx - 9, CANNON_Y - 34 + rec, 18, 40, 5); ctx.fill();
  ctx.fillStyle = '#0f172a'; roundRect(cx - 7, CANNON_Y - 36 + rec, 14, 8, 3); ctx.fill();
  ctx.fillStyle = '#93c5fd'; ctx.fillRect(cx - 9, CANNON_Y - 20 + rec, 18, 3);

  // HUD
  if (L) {
    ctx.fillStyle = 'rgba(15,23,42,0.6)'; roundRect(8, 8, W - 16, 38, 10); ctx.fill();
    ctx.textBaseline = 'middle'; ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.fillText('LVL ' + L.n, 20, 27);
    ctx.textAlign = 'center';
    ctx.fillStyle = G.capFlash > 0 ? '#fde047' : '#93c5fd'; ctx.fillText('⬤ ' + G.blue.length + (G.capFlash > 0 ? ' MAX' : ''), W / 2 - 30, 27);
    ctx.fillStyle = '#fca5a5'; ctx.fillText('⬤ ' + G.red.length, W / 2 + 50, 27);
    ctx.textAlign = 'right'; ctx.fillStyle = '#fde047'; ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText('☠ ' + G.kills, W - 20, 27);

    const bw = 180, bx = W / 2 - bw / 2, by = DEF_LINE + 20;
    ctx.fillStyle = 'rgba(15,23,42,0.6)'; roundRect(bx - 4, by - 4, bw + 8, 16, 6); ctx.fill();
    ctx.fillStyle = '#1e293b'; roundRect(bx, by, bw, 8, 4); ctx.fill();
    ctx.fillStyle = G.hp / G.maxHp < 0.3 ? '#ef4444' : '#4ade80'; roundRect(bx, by, bw * clamp(G.hp / G.maxHp, 0, 1), 8, 4); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('LINE ' + Math.max(0, G.hp) + '/' + G.maxHp, W / 2, by + 4);
  }

  // toasts
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  G.toasts.forEach((t, i) => {
    const a = clamp(t.t * 2, 0, 1) * clamp((t.max - t.t) * 4, 0, 1);
    ctx.globalAlpha = a; ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(15,23,42,0.6)'; roundRect(W / 2 - 120, 300 + i * 40 - 18, 240, 36, 10); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(t.msg, W / 2, 300 + i * 40);
  });
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ---------- champion buttons ----------
const champBtns = {};
for (const k in CHAMPS) {
  const b = document.getElementById('btn-' + k);
  if (!b) continue;
  champBtns[k] = b;
  b.innerHTML = `<span class="ic">${CHAMPS[k].icon}</span><span class="nm">${CHAMPS[k].name}</span><span class="cd"></span>`;
  b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); deploy(k); });
}
function updateChampBtns() {
  for (const k in champBtns) {
    const b = champBtns[k], cd = G.cd[k], c = CHAMPS[k];
    const total = c.cooldown * (1 - 0.08 * save.up.champ);
    b.classList.toggle('ready', cd <= 0);
    b.style.setProperty('--cd', (cd / total * 100).toFixed(1) + '%');
    b.querySelector('.cd').textContent = cd > 0 ? Math.ceil(cd) + 's' : 'READY';
  }
}

// ---------- input ----------
let dragging = false;
function pointerX(e) {
  const r = canvas.getBoundingClientRect();
  return (e.clientX - r.left) / r.width * W;
}
canvas.addEventListener('pointerdown', e => {
  if (G.state !== 'play') return;
  dragging = true; G.cannon.tx = clamp(pointerX(e), 24, W - 24);
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  if (!AC) beep(1, 0.01, 'sine', 0.0001);
});
canvas.addEventListener('pointermove', e => { if (dragging && G.state === 'play') G.cannon.tx = clamp(pointerX(e), 24, W - 24); });
canvas.addEventListener('pointerup', () => { dragging = false; });
canvas.addEventListener('pointercancel', () => { dragging = false; });
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.key] = true;
  if (G.state === 'play') { if (e.key === '1') deploy('knight'); if (e.key === '2') deploy('bomber'); }
});
window.addEventListener('keyup', e => { keys[e.key] = false; });

// ---------- screens ----------
const $ = id => document.getElementById(id);
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('hidden', s.id !== id));
  $('hud-bottom').classList.toggle('hidden', G.state !== 'play');
}
function fmt(n) { return n.toLocaleString(); }

function showMenu() {
  G.state = 'menu';
  $('menu-level').textContent = 'PLAY  ·  LEVEL ' + save.level;
  $('menu-coins').textContent = '🪙 ' + fmt(save.coins);
  $('menu-best').textContent = save.best > 1 ? 'Best: level ' + (save.best - 1) + ' cleared  ·  ' + fmt(save.totalKills) + ' enemies defeated' : 'Drag to aim. Multiply through the gates. Crush the red bases.';
  $('btn-sound').textContent = save.sound ? '🔊 Sound on' : '🔇 Sound off';
  showScreen('menu');
}

function showEnd(win) {
  $('end-title').textContent = win ? 'VICTORY!' : 'OVERRUN';
  $('end-title').className = win ? 'win' : 'lose';
  $('end-sub').textContent = win ? 'Level ' + L.n + ' cleared' : 'The enemy broke your line on level ' + L.n;
  $('end-stats').innerHTML =
    `<div><b>${fmt(G.peak)}</b><span>peak army</span></div>` +
    `<div><b>${fmt(G.kills)}</b><span>enemies defeated</span></div>` +
    `<div><b>+${fmt(G.coins)}</b><span>coins earned</span></div>`;
  $('btn-next').textContent = win ? 'NEXT LEVEL ▶' : 'RETRY ↻';
  const text = win
    ? `I just crushed level ${L.n} of Crowd Cannon with a peak army of ${G.peak} soldiers! 🔵💥🔴 Can you beat it?`
    : `My army of ${G.peak} soldiers fell on level ${L.n} of Crowd Cannon. Think you can do better? 🔵🔴`;
  $('btn-share').href = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(SITE_URL) + '&hashtags=CrowdCannon';
  showScreen('end');
}

function showShop() {
  G.state = 'shop';
  $('shop-coins').textContent = '🪙 ' + fmt(save.coins);
  let html = '<h3>Cannons</h3>';
  for (const k in CANNONS) {
    const c = CANNONS[k], owned = save.owned.includes(k), eq = save.cannon === k;
    html += `<div class="item ${eq ? 'eq' : ''}"><div class="info"><b>${c.name}</b><span>${c.desc}</span></div>` +
      (eq ? '<button disabled>EQUIPPED</button>' : owned ? `<button data-equip="${k}">EQUIP</button>` :
        `<button data-buy="${k}" ${save.coins < c.cost ? 'disabled' : ''}>🪙 ${c.cost}</button>`) + '</div>';
  }
  html += '<h3>Upgrades</h3>';
  for (const k in UPGRADES) {
    const u = UPGRADES[k], lv = save.up[k], maxed = lv >= u.max, cost = upCost(k);
    html += `<div class="item"><div class="info"><b>${u.name} <em>Lv ${lv}/${u.max}</em></b><span>${u.desc}</span></div>` +
      (maxed ? '<button disabled>MAX</button>' : `<button data-up="${k}" ${save.coins < cost ? 'disabled' : ''}>🪙 ${cost}</button>`) + '</div>';
  }
  html += '<h3>Champions</h3>';
  for (const k in CHAMPS) html += `<div class="item"><div class="info"><b>${CHAMPS[k].icon} ${CHAMPS[k].name}</b><span>${CHAMPS[k].hint}</span></div></div>`;
  $('shop-list').innerHTML = html;
  showScreen('shop');
}
$('shop-list').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  if (b.dataset.buy) { const c = CANNONS[b.dataset.buy]; if (save.coins >= c.cost) { save.coins -= c.cost; save.owned.push(b.dataset.buy); save.cannon = b.dataset.buy; } }
  else if (b.dataset.equip) save.cannon = b.dataset.equip;
  else if (b.dataset.up) { const k = b.dataset.up, cost = upCost(k); if (save.coins >= cost && save.up[k] < UPGRADES[k].max) { save.coins -= cost; save.up[k]++; } }
  persist(); beep(700, 0.1, 'triangle', 0.04); showShop();
});

let shopReturn = 'menu';
$('btn-play').addEventListener('click', () => startLevel(save.level));
$('btn-shop').addEventListener('click', () => { shopReturn = 'menu'; showShop(); });
$('btn-howto').addEventListener('click', () => $('howto').classList.toggle('hidden'));
$('btn-sound').addEventListener('click', () => { save.sound = !save.sound; persist(); $('btn-sound').textContent = save.sound ? '🔊 Sound on' : '🔇 Sound off'; });
$('btn-shop-back').addEventListener('click', () => shopReturn === 'end' ? showScreen('end') : showMenu());
$('btn-next').addEventListener('click', () => startLevel(save.level));
$('btn-end-shop').addEventListener('click', () => { shopReturn = 'end'; showShop(); });
$('btn-end-menu').addEventListener('click', showMenu);
$('btn-reset').addEventListener('click', () => {
  if (!confirm('Reset all progress and coins?')) return;
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  location.reload();
});

// ---------- main loop ----------
let last = performance.now();
function frame(now) {
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.05) dt = 0.05;
  if (G.state === 'play') {
    if (keys.ArrowLeft || keys.a) G.cannon.tx = clamp(G.cannon.tx - 320 * dt, 24, W - 24);
    if (keys.ArrowRight || keys.d) G.cannon.tx = clamp(G.cannon.tx + 320 * dt, 24, W - 24);
    update(dt);
    updateChampBtns();
  }
  draw();
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', () => { last = performance.now(); });

showMenu();
requestAnimationFrame(frame);

// Exposed for tests and tinkering.
window.CrowdCannon = { G, save, startLevel, update, draw, makeLevel, deploy, CANNONS, CHAMPS, UPGRADES, get level() { return L; } };
})();
