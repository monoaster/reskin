// 03 neon: a night scene lit only by glass tubing. Everything that is not brick, floor or glass is a tube:
// a 7 px near-white core, a coloured sheath, two shadowBlur passes, additive ('lighter') compositing, and a
// blurred copy of the tube layer for the big bloom. The same layer is mirrored into a wet floor.
import { W, H, LAYOUT, pose, story, particles, util, rng } from '../rig.js';

export const meta = { id: '03', slug: 'neon', name: 'Neon Tube', tag: 'glass and gas', accent: '#ff2bd6' };

const { clamp, lerp, smooth } = util;

// palette: black brick, cyan body, magenta hoodie, amber headphones, violet hair and desk, blue window,
// lime plant, orange clock and shoes, green for the build.
const C = {
  cyan: [25, 240, 255], mag: [255, 43, 214], amber: [255, 178, 30], violet: [160, 110, 255],
  blue: [64, 130, 255], lime: [190, 255, 60], orange: [255, 98, 56], green: [57, 255, 106],
  ice: [120, 215, 255], white: [255, 255, 255],
};
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a < 0 ? 0 : a > 1 ? 1 : a})`;
const mixc = (c, d, k) => [c[0] + (d[0] - c[0]) * k, c[1] + (d[1] - c[1]) * k, c[2] + (d[2] - c[2]) * k];

// ---- deterministic flicker ---------------------------------------------------------------------------
function hash(n, s) {
  let x = Math.imul(n | 0, 374761393) ^ Math.imul(s | 0, 668265263);
  x = Math.imul(x ^ (x >>> 13), 1274126177); x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
function flick(t, seed, rate, prob, depth) {
  const n = Math.floor(t * rate);
  const hum = 1 - 0.02 * (0.5 + 0.5 * Math.sin(t * 37 + seed * 3));
  if (hash(n, seed) < prob) return (1 - depth * (0.45 + 0.55 * hash(n, seed + 9))) * hum;
  return hum;
}

// ---- offscreen layers (cleared every frame, so output never depends on call order) -------------------
const cache = new Map();
function mk(w, h) {
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = Math.max(2, w | 0); c.height = Math.max(2, h | 0); return c; }
  return new OffscreenCanvas(Math.max(2, w | 0), Math.max(2, h | 0));
}
function layers(w) {
  let L = cache.get(w);
  if (L) return L;
  const sizes = { T: w, H: w / 2, G1: w / 4, G2: w / 8, G3: w / 16, Lc: w };
  L = {};
  for (const k in sizes) { L[k] = mk(sizes[k], sizes[k]); L[k + 'x'] = L[k].getContext('2d'); }
  L.B = bricks(w);
  cache.set(w, L);
  return L;
}

// grayscale brick texture in world units; multiplied with the light field so bricks only show where lit
function bricks(w) {
  const c = mk(w, w), x = c.getContext('2d'), k = w / W, r = rng(77);
  x.scale(k, k);
  x.fillStyle = '#1a1614'; x.fillRect(0, 0, W, H);                      // mortar
  const BW = 58, BH = 25, gap = 3;
  for (let row = 0, y = -4; y < 830; row++, y += BH) {
    const off = row % 2 ? BW / 2 : 0;
    for (let bx = -BW; bx < W + BW; bx += BW) {
      const v = 0.5 + 0.5 * r(), g = 255 * v;
      x.fillStyle = `rgb(${g | 0},${(g * 0.9) | 0},${(g * 0.84) | 0})`;
      x.fillRect(bx + off + gap / 2, y + gap / 2, BW - gap, BH - gap);
      x.fillStyle = 'rgba(255,255,255,.22)'; x.fillRect(bx + off + gap / 2, y + gap / 2, BW - gap, 2);   // top bevel
      x.fillStyle = 'rgba(0,0,0,.30)'; x.fillRect(bx + off + gap / 2, y + BH - gap / 2 - 3, BW - gap, 3); // bottom shade
      if (r() < 0.3) { x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(bx + off + 6 + r() * (BW - 20), y + 6 + r() * 10, 3 + r() * 8, 2 + r() * 3); }
    }
  }
  for (let i = 0; i < 700; i++) { x.fillStyle = r() < 0.5 ? 'rgba(0,0,0,.25)' : 'rgba(255,255,255,.07)'; x.fillRect(r() * W, r() * 800, 1 + r() * 3, 1 + r() * 2); }
  for (let i = 0; i < 9; i++) {                                         // water stains
    const sx = r() * W, sw = 18 + r() * 40, g = x.createLinearGradient(0, 0, 0, 800);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.3 + r() * 0.3, 'rgba(0,0,0,.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(sx, 0, sw, 800);
  }
  return c;
}

// ---- tube geometry -----------------------------------------------------------------------------------
// A point is [x, y] or [x, y, r] where r is the corner radius at that vertex.
function mkPath(it) {
  const P = it.pts, n = P.length, path = new Path2D(), cr = it.cr || 0;
  if (it.smooth) {
    const m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (it.closed) {
      const s = m(P[n - 1], P[0]); path.moveTo(s[0], s[1]);
      for (let i = 0; i < n; i++) { const e = m(P[i], P[(i + 1) % n]); path.quadraticCurveTo(P[i][0], P[i][1], e[0], e[1]); }
      path.closePath();
    } else {
      path.moveTo(P[0][0], P[0][1]);
      for (let i = 1; i < n - 1; i++) { const e = m(P[i], P[i + 1]); path.quadraticCurveTo(P[i][0], P[i][1], e[0], e[1]); }
      path.lineTo(P[n - 1][0], P[n - 1][1]);
    }
    return path;
  }
  const rad = (q) => (q[2] === undefined ? cr : q[2]);
  if (it.closed) {
    const s = [(P[n - 1][0] + P[0][0]) / 2, (P[n - 1][1] + P[0][1]) / 2]; path.moveTo(s[0], s[1]);
    for (let i = 0; i < n; i++) {
      const q = P[i], nx = P[(i + 1) % n], e = [(q[0] + nx[0]) / 2, (q[1] + nx[1]) / 2], r = rad(q);
      if (r > 0) path.arcTo(q[0], q[1], e[0], e[1], r); else { path.lineTo(q[0], q[1]); path.lineTo(e[0], e[1]); }
    }
    path.closePath();
  } else {
    path.moveTo(P[0][0], P[0][1]);
    for (let i = 1; i < n - 1; i++) { const r = rad(P[i]); if (r > 0) path.arcTo(P[i][0], P[i][1], P[i + 1][0], P[i + 1][1], r); else path.lineTo(P[i][0], P[i][1]); }
    path.lineTo(P[n - 1][0], P[n - 1][1]);
  }
  return path;
}

// outline of a limb: two offset sides, optional round caps, mitred at joints. Returns points with corner radii.
function limb(chain, hw, o = {}) {
  const n = chain.length, P = chain.map((q) => q.slice());
  const dir = (i) => { const dx = P[i + 1][0] - P[i][0], dy = P[i + 1][1] - P[i][1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
  if (o.t0) { const d = dir(0); P[0][0] += d[0] * o.t0; P[0][1] += d[1] * o.t0; }
  if (o.t1) { const d = dir(n - 2); P[n - 1][0] -= d[0] * o.t1; P[n - 1][1] -= d[1] * o.t1; }
  const ds = []; for (let i = 0; i < n - 1; i++) ds.push(dir(i));
  const A = [], B = [], r = o.r === undefined ? 24 : o.r;
  for (let i = 0; i < n; i++) {
    let nx, ny, m = 1, rr = 0;
    if (i === 0) { nx = -ds[0][1]; ny = ds[0][0]; }
    else if (i === n - 1) { nx = -ds[n - 2][1]; ny = ds[n - 2][0]; }
    else {
      let ax = -ds[i - 1][1] - ds[i][1], ay = ds[i - 1][0] + ds[i][0]; const l = Math.hypot(ax, ay) || 1; ax /= l; ay /= l;
      m = 1 / Math.max(0.55, ax * -ds[i][1] + ay * ds[i][0]); nx = ax; ny = ay; rr = r;
    }
    A.push([P[i][0] + nx * hw[i] * m, P[i][1] + ny * hw[i] * m, rr]);
    B.push([P[i][0] - nx * hw[i] * m, P[i][1] - ny * hw[i] * m, rr]);
  }
  const out = [...A];
  const cap = (p0, d, h, sgn) => {                                    // sgn +1 goes from the A side to the B side
    const nn = [-d[1], d[0]];
    for (let j = 1; j < 6; j++) { const a = Math.PI * j / 6; out.push([p0[0] + sgn * nn[0] * h * Math.cos(a) + d[0] * h * Math.sin(a), p0[1] + sgn * nn[1] * h * Math.cos(a) + d[1] * h * Math.sin(a), 0]); }
  };
  if (o.c1) cap(P[n - 1], ds[n - 2], hw[n - 1], 1);
  out.push(...B.reverse());
  if (o.c0) cap(P[0], [-ds[0][0], -ds[0][1]], hw[0], 1);
  return out;
}

// ---- single-stroke letters ---------------------------------------------------------------------------
const GLYPH = {
  S: { w: 44, s: [[[0.95, 0], [0, 0], [0, 0.5], [1, 0.5], [1, 1], [0.05, 1]]], caps: ['both'] },
  H: { w: 46, s: [[[0, 0], [0, 1]], [[1, 0], [1, 1]], [[0, 0.5], [1, 0.5]]], caps: ['both', 'both', null] },
  I: { w: 12, s: [[[0.5, 0], [0.5, 1]]], caps: ['both'] },
  P: { w: 44, s: [[[0, 1], [0, 0], [1, 0], [1, 0.52], [0, 0.52]]], caps: ['start'] },
  E: { w: 40, s: [[[1, 0], [0, 0], [0, 1], [1, 1]], [[0, 0.5], [0.8, 0.5]]], caps: ['both', 'end'] },
  D: { w: 46, s: [[[0, 0], [0.62, 0], [1, 0.3], [1, 0.7], [0.62, 1], [0, 1]]], closed: true, caps: [null] },
};
function word(str, x0, y0, h, gap) {
  const out = []; let x = x0; const sc = h / 72;
  [...str].forEach((ch, i) => {
    const g = GLYPH[ch], w = g.w * sc;
    out.push({ i, strokes: g.s.map((s) => s.map(([u, v]) => [x + u * w, y0 + v * h])), caps: g.caps, closed: !!g.closed });
    x += w + gap * sc;
  });
  return { letters: out, width: x - x0 - gap * sc };
}

// two-step flicker: a dim flash, off, a brighter flash, off, then steady with a faint buzz
function signLevel(age, i) {
  if (age < 0) return 0;
  const a = age - i * 0.011;
  if (a < 0.03) return 0;
  if (a < 0.07) return i % 2 ? 0.7 : 0.35;
  if (a < 0.12) return i % 3 === 0 ? 0.25 : 0;
  if (a < 0.17) return 0.85;
  if (a < 0.21) return i % 2 ? 0 : 0.2;
  let v = 0.95 + 0.05 * Math.sin(age * 150 + i * 2);
  if (i === 5 && age > 0.3 && age < 0.34) v *= 0.35;                  // one tired letter
  return v;
}

// the skyline behind the window: two rows of buildings, windows on a grid (built once, fully deterministic)
const CITY = (() => {
  const wn = LAYOUT.window, rb = rng(11), out = { b: [], dots: [] }, cols = [C.mag, C.cyan, C.amber, C.violet];
  for (let layer = 0; layer < 2; layer++) {
    let bx = wn.x - 6;
    while (bx < wn.x + wn.w) {
      const bw = 26 + rb() * 30, bh = (layer ? 70 : 130) + rb() * (layer ? 70 : 90), by = wn.y + wn.h - bh;
      const col = cols[Math.floor(rb() * 4)], ant = rb() < 0.45;
      out.b.push({ layer, bx, bw, by, bh, ant });
      for (let yy = by + 14; yy < wn.y + wn.h - 8; yy += 15) for (let xx = bx + 6; xx < bx + bw - 8; xx += 11) {
        if (xx < wn.x + 8 || xx + 5 > wn.x + wn.w - 8 || yy < wn.y + 160) continue;
        if (rb() < (layer ? 0.55 : 0.35)) out.dots.push({ x: xx, y: yy, col: layer ? col : mixc(col, [30, 20, 70], 0.5), far: !layer, keep: rb() < 0.3 });
      }
      bx += bw + 2;
    }
  }
  return out;
})();

// ---- the scene as a list of commands -----------------------------------------------------------------
const tube = (pts, col, o = {}) => ({ t: 'tube', pts, col, ...o });
const erase = (pts, o = {}) => ({ t: 'erase', pts, ...o });

function buildProps(t, st, p, cmds, aux) {
  const ship = st.screen.ship, age = st.shipAge;
  const L = LAYOUT, g = {
    win: flick(t, 1, 18, 0.05, 0.3), clock: flick(t, 2, 14, 0.14, 0.55), plant: flick(t, 3, 18, 0.04, 0.3),
    desk: flick(t, 4, 18, 0.03, 0.25),
  };
  // window: frame, mullions, moon. The glass and the city are painted on the main canvas.
  const wn = L.window;
  cmds.push(tube([[wn.x, wn.y], [wn.x + wn.w, wn.y], [wn.x + wn.w, wn.y + wn.h], [wn.x, wn.y + wn.h]], C.blue, { closed: true, cr: 10, a: g.win }));
  cmds.push(tube([[wn.x + wn.w / 2, wn.y], [wn.x + wn.w / 2, wn.y + wn.h]], C.blue, { wd: 5, a: 0.8 * g.win, caps: 'both', capS: 0.7 }));
  cmds.push(tube([[wn.x, wn.y + 150], [wn.x + wn.w, wn.y + 150]], C.blue, { wd: 5, a: 0.8 * g.win, caps: 'both', capS: 0.7 }));
  // crescent moon: outer circle and an inner arc
  const mx = 272, my = 222, mr = 32, mp = [];
  for (let i = 0; i <= 28; i++) { const a = lerp(0.55, 2 * Math.PI - 0.55, i / 28) + 0.35; mp.push([mx + Math.cos(a) * mr, my + Math.sin(a) * mr, 0]); }
  for (let i = 0; i <= 14; i++) { const a = lerp(2 * Math.PI - 0.55, 0.55, i / 14) + 0.35; mp.push([mx + 14 + Math.cos(a) * (mr * 0.82), my - 4 + Math.sin(a) * (mr * 0.82), 0]); }
  cmds.push(tube(mp, C.amber, { closed: true, a: g.win, glow: 1.1 }));
  // lit windows in the city: tiny tubes that come and go
  CITY.dots.forEach((d, i) => {
    const on = d.keep || hash(Math.floor(t * 2.2) + i * 7, 31 + i) < 0.5;
    if (on) cmds.push(tube([[d.x, d.y], [d.x + 5, d.y]], d.col, { wd: 4, ns: true, a: d.far ? 0.4 : 0.8 }));
  });

  // wall clock
  const ck = L.clock, ca = g.clock;
  const cring = []; for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; cring.push([ck.x + Math.cos(a) * ck.r, ck.y + Math.sin(a) * ck.r, 0]); }
  cmds.push(tube(cring, C.orange, { closed: true, a: ca }));
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; cmds.push(tube([[ck.x + Math.cos(a) * 24, ck.y + Math.sin(a) * 24], [ck.x + Math.cos(a) * 28, ck.y + Math.sin(a) * 28]], C.orange, { wd: 3, ns: true, a: 0.7 * ca })); }
  const hand = (deg, len, wd, col, a) => { const r2 = (deg - 90) * Math.PI / 180; return tube([[ck.x, ck.y], [ck.x + Math.cos(r2) * len, ck.y + Math.sin(r2) * len]], col, { wd, ns: true, a }); };
  cmds.push(hand(356 + t * 0.4, 15, 5, C.orange, 0.95 * ca));
  cmds.push(hand(312 + t * 5, 23, 4, C.orange, 0.95 * ca));
  cmds.push(hand(t * 200, 27, 2.5, C.mag, 0.9 * ca));

  // sign (mounted over the desk): outline plus letters. Dark glass until the build passes.
  const sg = aux.sign, border = [[sg.x, sg.y], [sg.x + sg.w, sg.y], [sg.x + sg.w, sg.y + sg.h], [sg.x, sg.y + sg.h]];
  const bl = age < 0 ? 0 : signLevel(age, 8);
  const sOn = (lvl, col, o) => (lvl > 0.02 ? tube(o.pts, col, { ...o, a: lvl }) : tube(o.pts, col, { ...o, off: true }));
  cmds.push(sOn(bl, C.cyan, { pts: border, closed: true, cr: 16, wd: 5, glow: 0.8 }));
  const wd = word('SHIPPED', sg.x + (sg.w - aux.wordW) / 2, sg.y + 26, 72, 18);
  for (const lt of wd.letters) {
    const lvl = signLevel(age, lt.i);
    lt.strokes.forEach((s, j) => cmds.push(sOn(lvl, C.mag, { pts: s, closed: lt.closed, cr: 10, wd: 7, caps: lt.caps[j] || undefined, capS: 0.62 })));
  }

  // desk
  const d = L.desk, dc = C.violet, da = g.desk;
  cmds.push(tube([[d.x, d.y + 7], [d.x + d.w, d.y + 7]], dc, { a: da, caps: 'both' }));
  cmds.push(tube([[d.x + 21, d.y + 22], [d.x + 21, L.floor - 4]], dc, { a: da, caps: 'end' }));
  cmds.push(tube([[d.x + d.w - 21, d.y + 22], [d.x + d.w - 21, L.floor - 4]], dc, { a: da, caps: 'end' }));
  cmds.push(tube([[d.x + 21, d.y + 100], [d.x + d.w - 21, d.y + 100]], dc, { wd: 5, a: 0.7 * da, ns: true }));
  cmds.push(tube([[d.x + 130, d.y + 28], [d.x + 290, d.y + 28], [d.x + 290, d.y + 78], [d.x + 130, d.y + 78]], dc, { closed: true, cr: 8, wd: 5, a: 0.75 * da }));
  cmds.push(tube([[d.x + 200, d.y + 48], [d.x + 220, d.y + 48]], dc, { wd: 5, a: 0.8 * da, ns: true }));

  // laptop: frame, screen glow, code rows, base. Cyan-white, then green on the ship beat.
  const lp = L.laptop, sc = lp.screen, pulse = Math.exp(-Math.max(age, 0) * 7) * (age >= 0 ? 1 : 0);
  const lcol = mixc(C.ice, C.green, ship), lg = (0.55 + 0.45 * st.screen.awake) * (1 + 0.5 * pulse);
  cmds.push({ t: 'fill', rect: [sc.x + 6, sc.y + 6, sc.w - 12, sc.h - 12], col: mixc(C.blue, C.green, ship), a: (0.1 + 0.28 * st.screen.awake) * (1 - ship) + ship * (0.5 + 0.3 * pulse) + 0.1 * p.tap });
  cmds.push(tube([[sc.x, sc.y], [sc.x + sc.w, sc.y], [sc.x + sc.w, sc.y + sc.h], [sc.x, sc.y + sc.h]], lcol, { closed: true, cr: 9, a: lg }));
  cmds.push(tube([[lp.base.x - 4, lp.base.y + 8], [lp.base.x + lp.base.w + 8, lp.base.y + 8]], lcol, { wd: 6, a: lg, caps: 'both', capS: 0.7 }));
  const rc = [C.cyan, C.mag, C.amber, C.cyan, C.violet, C.mag];
  st.screen.rows.forEach((rw, i) => {
    if (rw.len < 0.04) return;
    const x0 = sc.x + 20 + rw.indent * 150, y0 = sc.y + 26 + i * 21;
    cmds.push(tube([[x0, y0], [x0 + Math.max(2, rw.w * 150 * rw.len), y0]], rc[i], { wd: 5, a: (1 - ship) * 0.95 * lg, ns: true }));
  });
  if (ship > 0.02) {
    const cx = sc.x + sc.w / 2, cy = sc.y + 42;
    cmds.push(tube([[cx - 22, cy + 2], [cx - 7, cy + 18], [cx + 24, cy - 20]], C.green, { wd: 8, a: ship, cr: 4, glow: 1.2 }));
    const w2 = word('SHIPPED', 0, 0, 24, 10), ox = cx - w2.width / 2, oy = sc.y + 92;
    const w3 = word('SHIPPED', ox, oy, 24, 10);
    for (const lt of w3.letters) for (const s of lt.strokes) cmds.push(tube(s, C.green, { closed: lt.closed, cr: 4, wd: 4, a: ship, ns: true }));
  }

  // plant, in front of the desk
  const pl = L.plant, sway = (i) => Math.sin(t * 1.7 + i * 1.3) * 1.8 + (age >= 0 ? 6 * Math.exp(-age * 6) * Math.sin(age * 38 + i) : 0);
  const pa = g.plant;
  const pot = [[pl.x - 36, pl.y - 58], [pl.x + 36, pl.y - 58], [pl.x + 27, pl.y], [pl.x - 27, pl.y]];
  cmds.push(erase(pot, { cr: 6, pad: 8 }));
  cmds.push(tube(pot, C.orange, { closed: true, cr: 7, a: pa }));
  cmds.push(tube([[pl.x - 44, pl.y - 68], [pl.x + 44, pl.y - 68]], C.orange, { a: pa, caps: 'both', capS: 0.7 }));
  const ang = [-72, -47, -22, 3, 28, 50, 72], len = [105, 150, 185, 205, 178, 142, 104];
  ang.forEach((aa, i) => {
    const th = (aa + sway(i)) * Math.PI / 180, dx = Math.sin(th), dy = -Math.cos(th), nx = -dy, ny = dx, L0 = len[i], bx = pl.x, by = pl.y - 70;
    const at = (s, q) => [bx + dx * s + nx * q, by + dy * s + ny * q, 0], w = L0 * 0.13;
    const leaf = [at(L0 * 0.34, 0), at(L0 * 0.52, w), at(L0 * 0.78, w * 0.85), at(L0, 0), at(L0 * 0.78, -w * 0.85), at(L0 * 0.52, -w)];
    cmds.push(erase(leaf, { smooth: true, pad: 8 }));
    cmds.push(tube([at(0, 0), at(L0 * 0.34, 0)], C.lime, { wd: 4, a: 0.6 * pa, ns: true }));
    cmds.push(tube(leaf, C.lime, { closed: true, smooth: true, a: 0.7 * pa, glow: 0.5 }));
  });
}

function buildFigure(t, p, st, cmds, shade, aux) {
  const ship = st.screen.ship, cel = p.celebrate, sm = Math.max(cel, ship);
  const fg = flick(t, 5, 20, 0.02, 0.15);
  const f = (x, y) => [x, y];
  const addLeg = (s, near) => {
    const dim = near ? 1 : 0.5;
    const chain = [f(s.hip.x, s.hip.y), f(s.knee.x, s.knee.y), f(s.ankle.x, s.ankle.y)];
    const jeans = limb(chain, [13, 10.5, 9], { t0: 18, t1: 17 });
    const ex = Math.atan2(s.toe.y - s.ankle.y - 12, s.toe.x - s.ankle.x), fx = [Math.cos(ex), Math.sin(ex)], ux = [fx[1], -fx[0]];
    const sp = (a, b, r = 6) => [s.toe.x + fx[0] * a + ux[0] * b, s.toe.y + fx[1] * a + ux[1] * b, r];
    const shoe = [sp(-50, 0, 5), sp(-53, 17, 6), sp(-48, 31, 8), sp(-30, 32, 8), sp(-23, 21, 7), sp(-8, 16, 7), sp(8, 10, 6), sp(7, 0, 5)];
    if (near) { cmds.push(erase(jeans, { closed: true, cr: 6, pad: 6 })); cmds.push(erase(shoe, { closed: true, pad: 6 })); shade.push(jeans, shoe); }
    cmds.push(tube(jeans, C.cyan, { cr: 26, a: dim * fg }));
    cmds.push(tube(shoe, C.orange, { closed: true, a: dim * fg }));
    cmds.push(tube([sp(-26, 24, 0), sp(-14, 17, 0)], C.white, { wd: 3, ns: true, a: 0.7 * dim * fg }));
  };
  const addArm = (s, near) => {
    const dim = near ? 1 : 0.5;
    const chain = [f(s.shoulder.x, s.shoulder.y), f(s.elbow.x, s.elbow.y), f(s.hand.x, s.hand.y)];
    const sleeve = limb(chain, [10.5, 9, 7.5], { t0: 2, t1: 9, c0: true, r: 22 });
    if (near) { cmds.push(erase(sleeve, { closed: true, pad: 7, cr: 6 })); shade.push(sleeve); }
    cmds.push(tube(sleeve, C.mag, { closed: true, cr: 22, a: dim * fg }));
    const dx = s.hand.x - s.elbow.x, dy = s.hand.y - s.elbow.y, dl = Math.hypot(dx, dy) || 1;
    const hx = s.hand.x + dx / dl * 9, hy = s.hand.y + dy / dl * 9, hr = cel > 0.5 && near ? 11 : 9;
    const hp = []; for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; hp.push([hx + Math.cos(a) * hr, hy + Math.sin(a) * hr, 0]); }
    if (near) cmds.push(erase(hp, { closed: true, pad: 4 }));
    cmds.push(tube(hp, C.cyan, { closed: true, wd: 6, a: dim * fg }));
  };
  addLeg(p.far, false);
  addArm(p.far, false);

  // hoodie
  const a0 = [p.neck.x - p.pelvis.x, p.neck.y - p.pelvis.y], al = Math.hypot(a0[0], a0[1]) || 1, a = [a0[0] / al, a0[1] / al], fw = [-a[1], a[0]];
  const T = (s, q, r = 10) => [p.pelvis.x + a[0] * s + fw[0] * q, p.pelvis.y + a[1] * s + fw[1] * q, r];
  const body = [T(-12, -27), T(30, -31), T(84, -30), T(112, -28), T(al - 3, -15, 6), T(al - 1, 13, 6), T(112, 27), T(84, 31), T(30, 30), T(-12, 28)];
  cmds.push(erase(body, { closed: true, pad: 6 })); shade.push(body);
  cmds.push(tube([T(al - 6, -15, 0), T(al + 8, -28, 0), T(al - 14, -41, 0), T(al - 40, -36, 0)], C.mag, { smooth: true, wd: 5, a: 0.8 * fg, glow: 0.7 }));
  cmds.push(tube(body, C.mag, { closed: true, a: fg }));
  const sw = (i) => Math.sin(t * 9 + i * 2) * 4 * p.walk + (p.hop > 1 ? 5 : 0);
  cmds.push(tube([T(al - 6, 10, 0), T(al - 30, 14 + sw(0), 0), T(al - 52, 15 + sw(0) * 1.6, 0)], C.mag, { wd: 4, a: 0.9 * fg, caps: 'end', capS: 0.5, smooth: true, glow: 0.7 }));

  // headphones around the neck: a band that runs under the chin and behind the neck, a near cup on the chest, a far cup behind
  const N = (s, q, r = 0) => [p.neck.x + a[0] * s + fw[0] * q, p.neck.y + a[1] * s + fw[1] * q, r];
  const fcup = [N(-14, -30, 6), N(-14, -46, 6), N(-42, -46, 6), N(-42, -30, 6)];
  cmds.push(tube(fcup, C.amber, { closed: true, wd: 5, a: 0.5 * fg, glow: 0.6 }));
  cmds.push(tube([N(-26, 33), N(-10, 20), N(-4, 0), N(-8, -20), N(-14, -30)], C.amber, { smooth: true, a: fg, glow: 0.8 }));
  const cup = [N(-14, 24, 8), N(-14, 44, 8), N(-48, 44, 8), N(-48, 24, 8)];
  cmds.push(erase(cup, { closed: true, pad: 5 })); shade.push(cup);
  cmds.push(tube(cup, C.amber, { closed: true, a: fg, glow: 0.8 }));

  // near leg over the hoodie hem
  addLeg(p.near, true);

  // head
  const hd = p.head, ang = hd.angle, fh = [Math.cos(ang), Math.sin(ang)], dh = [-Math.sin(ang), Math.cos(ang)];
  const hl = (x, y, r = 0) => [hd.x + fh[0] * x + dh[0] * y, hd.y + fh[1] * x + dh[1] * y, r];
  const skull = [], nHead = 56;
  for (let i = 0; i <= nHead; i++) {
    const ph = lerp(130, 455, i / nHead), q = ph * Math.PI / 180;
    const dn = ((ph % 360) - 354) / 7, rr = hd.r + 8 * Math.exp(-dn * dn);
    skull.push(hl(Math.cos(q) * rr, Math.sin(q) * rr));
  }
  const disc = []; for (let i = 0; i < 24; i++) { const q = i / 24 * Math.PI * 2; disc.push(hl(Math.cos(q) * (hd.r - 1), Math.sin(q) * (hd.r - 1))); }
  cmds.push(erase(disc, { closed: true, pad: 8 })); shade.push(disc);
  cmds.push(tube(skull, C.cyan, { a: fg, caps: 'both', capS: 0.6 }));
  const hair = [];
  for (let i = 0; i <= 8; i++) { const ph = lerp(-20, -200, i / 8) * Math.PI / 180, rr = hd.r + (i % 2 ? 15 : 5); hair.push(hl(Math.cos(ph) * rr, Math.sin(ph) * rr)); }
  cmds.push(tube(hair, C.violet, { wd: 5, a: 0.9 * fg, glow: 0.6 }));
  const ear = []; for (let i = 0; i < 10; i++) { const q = i / 10 * Math.PI * 2; ear.push(hl(-6 + Math.cos(q) * 7, 6 + Math.sin(q) * 8)); }
  cmds.push(tube(ear, C.cyan, { closed: true, smooth: true, wd: 4, a: 0.7 * fg, ns: true }));
  const blink = (t > 0.9 && t < 0.96) || (t > 1.9 && t < 1.95) || (t > 2.55 && t < 2.59) ? 0.1 : 1;
  cmds.push(tube([hl(18, -9), hl(18, -9 + 9 * blink)], C.white, { wd: 6, ns: true, a: fg }));
  const m0 = hl(14, lerp(18, 13, sm)), m1 = hl(21, lerp(18, 23, sm)), m2 = hl(30, lerp(17, 14, sm));
  cmds.push(tube([m0, m1, m2], C.cyan, { smooth: true, wd: 5, a: fg, ns: true }));

  // near arm on top of everything
  addArm(p.near, true);
}

// ---- the renderer ------------------------------------------------------------------------------------
function drawTube(c, k, it, gain) {
  const a = (it.a === undefined ? 1 : it.a) * gain;
  if (a < 0.02 && !it.off) return;
  const path = mkPath(it), col = it.col, wd = it.wd || 7, g = it.glow === undefined ? 1 : it.glow;
  c.lineCap = 'round'; c.lineJoin = 'round';
  if (it.off) {                                                       // unlit glass
    c.globalCompositeOperation = 'source-over';
    c.strokeStyle = 'rgba(52,46,66,.95)'; c.lineWidth = wd; c.stroke(path);
    c.strokeStyle = 'rgba(150,140,190,.35)'; c.lineWidth = 2; c.stroke(path);
    c.globalCompositeOperation = 'lighter';
    return;
  }
  if (!it.ns) {
    c.shadowColor = rgba(col, 0.55 * a); c.shadowBlur = 30 * k * g;
    c.strokeStyle = rgba(col, 0.25 * a); c.lineWidth = wd + 2; c.stroke(path);
    c.shadowColor = rgba(col, 0.7 * a); c.shadowBlur = 10 * k * g;
    c.strokeStyle = rgba(col, 0.7 * a); c.lineWidth = wd + 3; c.stroke(path);
    c.shadowBlur = 0; c.shadowColor = 'rgba(0,0,0,0)';
  } else {
    c.strokeStyle = rgba(col, 0.85 * a); c.lineWidth = wd + 4; c.stroke(path);
  }
  c.strokeStyle = rgba(mixc(col, C.white, 0.82), a); c.lineWidth = wd; c.stroke(path);
}

function capsOf(it, out) {
  if (!it.caps || it.off) return;
  const P = it.pts, n = P.length;
  const end = (i, j) => { const dx = P[i][0] - P[j][0], dy = P[i][1] - P[j][1], l = Math.hypot(dx, dy) || 1; out.push({ x: P[i][0], y: P[i][1], dx: dx / l, dy: dy / l, s: it.capS || 1, a: Math.min(1, (it.a === undefined ? 1 : it.a)) }); };
  if (it.caps === 'both' || it.caps === 'start') end(0, 1);
  if (it.caps === 'both' || it.caps === 'end') end(n - 1, n - 2);
}

export function render(ctx, t, w, h) {
  const k = w / W, Ls = layers(w), st = story(t), p = pose(t), age = st.shipAge, ship = st.screen.ship;
  const aux = { sign: { x: 520, y: 176, w: 450, h: 124 }, wordW: 0 };
  aux.wordW = word('SHIPPED', 0, 0, 72, 18).width;
  const cmds = [], shade = [];
  buildProps(t, st, p, cmds, aux);
  buildFigure(t, p, st, cmds, shade, aux);
  for (const q of particles(t)) {
    const col = [C.mag, C.cyan, C.amber, C.green][q.kind], hl = q.size * 1.15, dx = Math.cos(q.rot) * hl, dy = Math.sin(q.rot) * hl;
    cmds.push(tube([[q.x - dx, q.y - dy], [q.x + dx, q.y + dy]], col, { wd: 6, a: q.alpha, glow: 0.8 }));
  }
  // hand flare on each key tap
  const flare = p.tap;

  // 1. tube layer
  const T = Ls.Tx; T.setTransform(1, 0, 0, 1, 0, 0); T.globalCompositeOperation = 'source-over'; T.clearRect(0, 0, w, w);
  T.setTransform(k, 0, 0, k, 0, 0); T.globalCompositeOperation = 'lighter';
  const capList = [];
  for (const cm of cmds) {
    if (cm.t === 'tube') { drawTube(T, k, cm, 1); capsOf(cm, capList); }
    else if (cm.t === 'fill') { const [x, y, ww, hh] = cm.rect, gr = T.createLinearGradient(0, y, 0, y + hh); gr.addColorStop(0, rgba(cm.col, cm.a)); gr.addColorStop(1, rgba(cm.col, cm.a * 0.45)); T.fillStyle = gr; T.fillRect(x, y, ww, hh); }
    else if (cm.t === 'erase') {
      const path = mkPath(cm);
      T.globalCompositeOperation = 'destination-out'; T.fillStyle = 'rgba(0,0,0,.94)'; T.strokeStyle = 'rgba(0,0,0,.94)'; T.lineWidth = cm.pad || 6; T.lineJoin = 'round';
      T.fill(path); T.stroke(path); T.globalCompositeOperation = 'lighter';
    }
  }
  T.globalCompositeOperation = 'source-over';

  // 2. blur chain for bloom and wall spill
  const halve = (dst, src, blur) => { dst.x.setTransform(1, 0, 0, 1, 0, 0); dst.x.clearRect(0, 0, dst.c.width, dst.c.height); dst.x.imageSmoothingEnabled = true; dst.x.imageSmoothingQuality = 'high'; dst.x.filter = blur; dst.x.drawImage(src, 0, 0, dst.c.width, dst.c.height); dst.x.filter = 'none'; };
  halve({ c: Ls.H, x: Ls.Hx }, Ls.T, 'none');
  halve({ c: Ls.G1, x: Ls.G1x }, Ls.H, 'blur(1px)');
  halve({ c: Ls.G2, x: Ls.G2x }, Ls.G1, 'blur(2px)');
  halve({ c: Ls.G3, x: Ls.G3x }, Ls.G2, 'blur(2px)');

  // 3. wall light: spill from every glowing thing, multiplied by the brick texture
  const Lx = Ls.Lcx; Lx.setTransform(1, 0, 0, 1, 0, 0); Lx.globalCompositeOperation = 'source-over'; Lx.fillStyle = 'rgb(12,9,16)'; Lx.fillRect(0, 0, w, w);
  Lx.globalCompositeOperation = 'lighter'; Lx.imageSmoothingEnabled = true; Lx.imageSmoothingQuality = 'high';
  Lx.globalAlpha = 0.5; Lx.drawImage(Ls.G2, 0, 0, w, w); Lx.globalAlpha = 0.8; Lx.drawImage(Ls.G3, 0, 0, w, w); Lx.globalAlpha = 1;
  Lx.setTransform(k, 0, 0, k, 0, 0);
  const pulse = age >= 0 ? Math.exp(-age * 7) : 0;
  const lamp = (x, y, r, col, a) => { const g = Lx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(col, a)); g.addColorStop(0.5, rgba(col, a * 0.35)); g.addColorStop(1, rgba(col, 0)); Lx.fillStyle = g; Lx.fillRect(x - r, y - r, r * 2, r * 2); };
  const sc = LAYOUT.laptop.screen, lgreen = mixc(C.cyan, C.green, ship);
  lamp(210, 330, 420, C.blue, 0.5 * flick(t, 1, 18, 0.05, 0.3));
  lamp(430, 170, 170, C.orange, 0.38 * flick(t, 2, 14, 0.14, 0.55));
  lamp(sc.x + sc.w / 2, sc.y + sc.h / 2, 380, lgreen, 0.55 * (0.4 + 0.6 * st.screen.awake) * (1 + pulse * 0.8));
  lamp(aux.sign.x + aux.sign.w / 2, aux.sign.y + aux.sign.h / 2, 330, C.mag, age >= 0 ? 0.55 * signLevel(age, 3) : 0);
  lamp(p.chest.x + 20, p.chest.y - 20, 360, C.cyan, 0.34);
  lamp(p.chest.x + 20, p.chest.y - 60, 300, C.mag, 0.3);
  lamp(880, 660, 200, C.lime, 0.18);
  lamp(900, 150, 300, [60, 20, 120], 0.3);
  Lx.setTransform(1, 0, 0, 1, 0, 0); Lx.globalCompositeOperation = 'multiply'; Lx.drawImage(Ls.B, 0, 0, w, w); Lx.globalCompositeOperation = 'source-over';

  // 4. compose
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
  ctx.fillStyle = '#050409'; ctx.fillRect(0, 0, w, w);
  ctx.drawImage(Ls.Lc, 0, 0, w, w);
  ctx.setTransform(k, 0, 0, k, 0, 0);

  // floor: wet and dark, light pools under things
  const fy = LAYOUT.floor;
  let g = ctx.createLinearGradient(0, fy, 0, H); g.addColorStop(0, '#0d0a17'); g.addColorStop(1, '#030207');
  ctx.fillStyle = g; ctx.fillRect(0, fy, W, H - fy);
  ctx.fillStyle = '#020105'; ctx.fillRect(0, fy - 10, W, 10);                 // skirting
  ctx.fillStyle = 'rgba(160,130,200,.18)'; ctx.fillRect(0, fy - 10, W, 1.5);
  ctx.fillStyle = 'rgba(160,130,200,.10)'; ctx.fillRect(0, fy, W, 2);
  const rr = rng(5);
  for (let i = 0; i < 26; i++) {                                                // puddle sheen
    const y = fy + 6 + rr() * 190, x = rr() * W, wd = 80 + rr() * 260;
    const gg = ctx.createLinearGradient(x, 0, x + wd, 0); gg.addColorStop(0, 'rgba(150,120,255,0)'); gg.addColorStop(0.5, `rgba(150,120,255,${0.04 + rr() * 0.05})`); gg.addColorStop(1, 'rgba(150,120,255,0)');
    ctx.fillStyle = gg; ctx.fillRect(x, y, wd, 1.5 + rr() * 2.5);
  }
  ctx.globalCompositeOperation = 'lighter';
  const pool = (x, y, rx, col, a) => { ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.16); const gp = ctx.createRadialGradient(0, 0, 0, 0, 0, rx); gp.addColorStop(0, rgba(col, a)); gp.addColorStop(1, rgba(col, 0)); ctx.fillStyle = gp; ctx.fillRect(-rx, -rx, rx * 2, rx * 2); ctx.restore(); };
  pool(p.pelvis.x + 10, fy + 14, 260, C.cyan, 0.32);
  pool(p.pelvis.x + 10, fy + 14, 200, C.mag, 0.22);
  pool(760, fy + 18, 300, lgreen, 0.3 * (0.4 + 0.6 * st.screen.awake));
  pool(880, fy + 16, 150, C.lime, 0.2);
  pool(190, fy + 14, 260, C.blue, 0.2);
  ctx.globalCompositeOperation = 'source-over';

  // window glass and city
  const wn = LAYOUT.window;
  ctx.save(); ctx.beginPath(); ctx.rect(wn.x + 3, wn.y + 3, wn.w - 6, wn.h - 6); ctx.clip();
  g = ctx.createLinearGradient(0, wn.y, 0, wn.y + wn.h); g.addColorStop(0, '#06061f'); g.addColorStop(0.55, '#150b38'); g.addColorStop(1, '#3a0f4a');
  ctx.fillStyle = g; ctx.fillRect(wn.x, wn.y, wn.w, wn.h);
  const rs = rng(3);
  for (let i = 0; i < 26; i++) { const sx = wn.x + 10 + rs() * (wn.w - 20), sy = wn.y + 8 + rs() * 190, tw = 0.35 + 0.65 * hash(Math.floor(t * 4) + i, 77 + i); ctx.fillStyle = `rgba(220,230,255,${0.55 * tw})`; ctx.fillRect(sx, sy, 2, 2); }
  g = ctx.createRadialGradient(272, 222, 0, 272, 222, 120); g.addColorStop(0, 'rgba(255,200,90,.3)'); g.addColorStop(1, 'rgba(255,200,90,0)'); ctx.fillStyle = g; ctx.fillRect(wn.x, wn.y, wn.w, 260);
  for (const b of CITY.b) {
    ctx.fillStyle = b.layer ? '#0d0826' : '#1b1040'; ctx.fillRect(b.bx, b.by, b.bw, b.bh);
    ctx.fillStyle = b.layer ? 'rgba(160,100,255,.45)' : 'rgba(255,70,200,.3)'; ctx.fillRect(b.bx, b.by, b.bw, 2);
    ctx.fillStyle = b.layer ? 'rgba(160,100,255,.15)' : 'rgba(255,70,200,.1)'; ctx.fillRect(b.bx, b.by, 2, b.bh);
    if (b.ant && !b.layer) { ctx.fillStyle = '#1b1040'; ctx.fillRect(b.bx + b.bw / 2 - 1, b.by - 20, 2, 20); ctx.fillStyle = 'rgba(255,60,90,.95)'; ctx.fillRect(b.bx + b.bw / 2 - 2.5, b.by - 23, 5, 4); }
  }
  ctx.fillStyle = 'rgba(255,255,255,.035)'; ctx.beginPath(); ctx.moveTo(wn.x + 20, wn.y + wn.h); ctx.lineTo(wn.x + 110, wn.y); ctx.lineTo(wn.x + 150, wn.y); ctx.lineTo(wn.x + 60, wn.y + wn.h); ctx.fill();
  ctx.restore();

  // sign backing board and standoffs
  const sg = aux.sign;
  ctx.fillStyle = 'rgba(8,6,12,.82)'; ctx.beginPath(); ctx.roundRect(sg.x - 14, sg.y - 12, sg.w + 28, sg.h + 24, 10); ctx.fill();
  ctx.strokeStyle = 'rgba(120,100,150,.3)'; ctx.lineWidth = 1.5; ctx.stroke();
  for (const [bx, by] of [[sg.x - 4, sg.y - 2], [sg.x + sg.w + 4, sg.y - 2], [sg.x - 4, sg.y + sg.h + 2], [sg.x + sg.w + 4, sg.y + sg.h + 2]]) { ctx.fillStyle = '#4b4258'; ctx.beginPath(); ctx.arc(bx, by, 3.2, 0, 7); ctx.fill(); }

  // dark glass inside the figure so it reads as a solid shape
  ctx.fillStyle = 'rgba(4,3,9,.5)';
  for (const poly of shade) { ctx.beginPath(); poly.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); ctx.fill(); }

  // wet floor: mirrored strips of the tube layer and its blur, fading with depth, with a slow ripple
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'lighter'; ctx.imageSmoothingEnabled = true;
  const RD = 6;
  for (let d = 0; d < 210; d += RD) {
    const f2 = Math.pow(1 - d / 210, 1.6), dx = Math.sin(d * 0.11 + t * 2.4) * (1 + d * 0.012) * k, sy = Math.max(0, (fy - d - RD) * k);
    ctx.globalAlpha = 0.55 * f2; ctx.drawImage(Ls.T, 0, sy, w, RD * k, dx, (fy + d) * k, w, RD * k);
    ctx.globalAlpha = 0.9 * f2; ctx.drawImage(Ls.G1, 0, sy / 4, w / 4, RD * k / 4, dx, (fy + d) * k, w, RD * k);
  }
  ctx.globalAlpha = 1;

  // the tubes
  ctx.drawImage(Ls.T, 0, 0, w, w);
  ctx.globalCompositeOperation = 'source-over';

  // electrode caps
  ctx.setTransform(k, 0, 0, k, 0, 0);
  for (const e of capList) {
    ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(Math.atan2(e.dy, e.dx)); ctx.scale(e.s, e.s);
    ctx.fillStyle = '#16111b'; ctx.strokeStyle = '#6b5640'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(2, -7, 11, 14, 2.5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#8a6a3c'; ctx.fillRect(1, -4.5, 2.5, 9);
    ctx.strokeStyle = '#3a3040'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(19, 0); ctx.stroke();
    ctx.restore();
  }

  // bloom
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.25; ctx.drawImage(Ls.G1, 0, 0, w, w);
  ctx.globalAlpha = 0.3; ctx.drawImage(Ls.G2, 0, 0, w, w);
  ctx.globalAlpha = 0.3; ctx.drawImage(Ls.G3, 0, 0, w, w);
  ctx.globalAlpha = 1;

  // key flare at the hand, and a short green flash on ship
  ctx.setTransform(k, 0, 0, k, 0, 0);
  if (flare > 0.01) { const hx = p.near.hand.x, hy = p.near.hand.y; const gf = ctx.createRadialGradient(hx, hy, 0, hx, hy, 70); gf.addColorStop(0, rgba(C.cyan, 0.6 * flare)); gf.addColorStop(1, rgba(C.cyan, 0)); ctx.fillStyle = gf; ctx.fillRect(hx - 70, hy - 70, 140, 140); }
  if (age >= 0 && age < 0.3) { ctx.fillStyle = rgba(C.green, 0.12 * Math.exp(-age * 14)); ctx.fillRect(0, 0, W, H); }
  ctx.globalCompositeOperation = 'source-over';

  // vignette
  g = ctx.createRadialGradient(500, 480, 380, 500, 500, 820); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.6)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
