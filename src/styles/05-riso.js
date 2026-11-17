// 05 riso: a two-or-three-spot-ink risograph print. Each ink (fluorescent pink, blue, yellow) is its own greyscale
// coverage layer at 500x500. A halftone pass (a rotated dot screen per ink) turns the coverage into dots, the inks are
// overprinted on cream paper with multiply, and the result is scaled up to w x w.
import { W, H, LAYOUT, DIMS, pose, story, particles, limbs, util, rng } from '../rig.js';

export const meta = { id: '05', slug: 'riso', name: 'Risograph', tag: 'two-ink print', accent: '#ff48b0' };

const R = 500, K = R / W;               // layer resolution, world -> layer scale
const PAPER = [243, 234, 215];          // #f3ead7
const INKS = [
  { c: [255, 72, 176], ang: 75, cell: 5.0, seed: 11 },   // fluorescent pink
  { c: [0, 120, 191], ang: 15, cell: 5.6, seed: 12 },    // blue
  { c: [255, 232, 0], ang: 45, cell: 6.2, seed: 13 },    // yellow
];
const { clamp, smooth } = util;

// ---- one-time setup: dot screens, ink noise, paper (all deterministic, never depend on t) ----------------------
let ready = false, LC = [], layerCv = [], outCv = null, outCtx = null, outImg = null, SCR = [], DENS = [], PAPERBUF = null;
const mk = (w, h) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }));
const GREY = Array.from({ length: 256 }, (_, i) => `rgb(${i},${i},${i})`);
const grey = (v) => GREY[Math.round(clamp(v) * 255)];

function init() {
  if (ready) return;
  ready = true;
  for (let i = 0; i < 3; i++) {
    const cv = mk(R, R); layerCv.push(cv); LC.push(cv.getContext('2d', { willReadFrequently: true }));
  }
  outCv = mk(R, R); outCtx = outCv.getContext('2d'); outImg = outCtx.createImageData(R, R);
  // dot screens
  INKS.forEach((ink, k) => {
    const s = new Float32Array(R * R), a = ink.ang * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), f = Math.PI * 2 / ink.cell;
    for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
      const u = x * ca + y * sa, v = -x * sa + y * ca;
      s[y * R + x] = 0.5 - 0.25 * (Math.cos(u * f) + Math.cos(v * f));
    }
    SCR.push(s);
    // ink density: slow blotches, fine grain, and a few dropout specks
    const rnd = rng(ink.seed * 977), G = 24, grid = new Float32Array((G + 2) * (G + 2));
    for (let i = 0; i < grid.length; i++) grid[i] = rnd();
    const d = new Float32Array(R * R);
    for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
      const gx = x / R * G, gy = y / R * G, ix = gx | 0, iy = gy | 0, fx = gx - ix, fy = gy - iy;
      const lo = (grid[iy * (G + 2) + ix] * (1 - fx) + grid[iy * (G + 2) + ix + 1] * fx) * (1 - fy) + (grid[(iy + 1) * (G + 2) + ix] * (1 - fx) + grid[(iy + 1) * (G + 2) + ix + 1] * fx) * fy;
      const fine = rnd();
      let dens = 0.9 + 0.12 * (lo - 0.5) + 0.07 * (fine - 0.5);
      if (fine < 0.012 || (lo > 0.72 && fine < 0.1)) dens = 0;       // dropout specks, clustered where the ink starves
      d[y * R + x] = dens;
    }
    DENS.push(d);
  });
  // paper with fibres
  const pr = rng(4242); PAPERBUF = new Float32Array(R * R * 3);
  for (let i = 0; i < R * R; i++) { const n = (pr() - 0.5) * 9; PAPERBUF[i * 3] = PAPER[0] + n; PAPERBUF[i * 3 + 1] = PAPER[1] + n; PAPERBUF[i * 3 + 2] = PAPER[2] + n * 1.2; }
  for (let f = 0; f < 900; f++) {
    let x = pr() * R, y = pr() * R, a = pr() * Math.PI, len = 5 + pr() * 12, dark = pr() < 0.7 ? -14 : 8;
    for (let s = 0; s < len; s++) { x += Math.cos(a); y += Math.sin(a); a += (pr() - 0.5) * 0.4; const ix = x | 0, iy = y | 0; if (ix >= 0 && ix < R && iy >= 0 && iy < R) { const j = (iy * R + ix) * 3; PAPERBUF[j] += dark; PAPERBUF[j + 1] += dark; PAPERBUF[j + 2] += dark; } }
  }
}

// ---- drawing into the ink layers ----------------------------------------------------------------------------------
// A value is 0..1 coverage (1 = solid ink, below 1 = halftone), a function(ctx) returning a gradient, or null (leave that ink alone,
// so the new shape overprints). A 0 knocks the ink out.
function paint(v, fn) {
  for (let i = 0; i < 3; i++) {
    const x = v[i]; if (x == null) continue;
    const c = LC[i]; c.save();
    const st = typeof x === 'function' ? x(c) : grey(x); c.fillStyle = st; c.strokeStyle = st;
    fn(c, i); c.restore();
  }
}
const F = (v, path) => paint(v, (c) => { c.beginPath(); path(c); c.fill(); });
const S = (v, lw, path, cap = 'round') => paint(v, (c) => { c.lineWidth = lw; c.lineCap = cap; c.lineJoin = 'round'; c.beginPath(); path(c); c.stroke(); });
const lin = (x0, y0, x1, y1, stops) => (c) => { const g = c.createLinearGradient(x0, y0, x1, y1); for (const [p, v] of stops) g.addColorStop(p, grey(v)); return g; };
const rad = (x, y, r0, r1, stops) => (c) => { const g = c.createRadialGradient(x, y, r0, x, y, r1); for (const [p, v] of stops) g.addColorStop(p, grey(v)); return g; };
const rect = (x, y, w, h) => (c) => c.rect(x, y, w, h);
const rr = (x, y, w, h, r) => (c) => c.roundRect(x, y, w, h, r);
const circ = (x, y, r) => (c) => { c.moveTo(x + r, y); c.arc(x, y, r, 0, Math.PI * 2); };
const poly = (pts) => (c) => { c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); };
const seg = (...pts) => (c) => { c.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y); };
// run a path inside a rotated/translated frame (applied to every layer)
const frame = (x, y, a, path) => (c) => { c.translate(x, y); c.rotate(a); path(c); };

const PAPERV = [0, 0, 0];       // knock every ink out
const SKIN = [0.14, 0, 0.3];    // pale pink + yellow dots

// ---- the room -------------------------------------------------------------------------------------------------------
function drawRoom(t, s) {
  // wall: blue halftone, darker at the top
  F([lin(0, 0, 0, 800, [[0, 0.42], [0.6, 0.12], [1, 0]]), lin(0, 0, 0, 800, [[0, 1], [1, 0.66]]), 0], rect(0, 0, 1000, 800));
  // floor: yellow solid under pink dots
  F([0.3, 0, 1], rect(0, 800, 1000, 200));
  // baseboard
  F([0.6, 1, 0], rect(0, 764, 1000, 36));
  F([0, 0, 0], rect(0, 758, 1000, 6));
  // floor planks and the shadow under the baseboard
  F([null, 0.7, null], rect(0, 800, 1000, 18));
  for (const [y, off] of [[868, 0], [936, 90]]) {
    S([null, 0.8, null], 5, (c) => { c.moveTo(0, y); c.lineTo(1000, y); });
    for (let x = 110 + off; x < 1000; x += 260) S([null, 0.8, null], 5, (c) => { c.moveTo(x, y - (y === 868 ? 68 : 68)); c.lineTo(x, y); });
  }
}

function drawRays(t, s) {
  const age = s.shipAge; if (age < 0 || age > 1.2) return;
  const fade = 1 - smooth(0.15, 1.15, age), cx = 715, cy = 520, grow = 0.35 + 0.65 * smooth(0, 0.3, age), n = 14, RM = 600;
  const wedges = (c) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + age * 0.35, w = 0.085;
      c.moveTo(cx + Math.cos(a - w) * 90, cy + Math.sin(a - w) * 90);
      c.lineTo(cx + Math.cos(a - w * 1.5) * RM * grow, cy + Math.sin(a - w * 1.5) * RM * grow);
      c.lineTo(cx + Math.cos(a + w * 1.5) * RM * grow, cy + Math.sin(a + w * 1.5) * RM * grow);
      c.lineTo(cx + Math.cos(a + w) * 90, cy + Math.sin(a + w) * 90);
      c.closePath();
    }
  };
  // knock the wall out inside the rays, then lay down a yellow halftone that thins out with distance
  F([0, 0.14, 0], wedges);
  F([null, null, rad(cx, cy, 90, RM * grow, [[0, 0.95 * fade], [0.55, 0.55 * fade], [1, 0.08 * fade]])], wedges);
  F([rad(cx, cy, 90, 600 * grow, [[0, 0.5 * fade], [1, 0]]), null, null], wedges);
}

function drawWindow(t, s) {
  const wn = LAYOUT.window, x = wn.x, y = wn.y, w = wn.w, h = wn.h;
  F([1, 0, 0], rr(x - 18, y - 18, w + 36, h + 36, 10));              // pink frame
  F([0, 0, 0], rect(x, y, w, h));
  F([lin(0, y, 0, y + h, [[0, 0.62], [0.55, 0.7], [1, 0.9]]), 1, 0], rect(x, y, w, h));   // night sky, warming to the horizon
  // moon: halo, then a crescent
  F([null, 0.45, null], circ(270, 215, 66));
  paint([0, 0, 1], (c) => { c.beginPath(); circ(270, 215, 36)(c); c.clip(); c.beginPath(); c.rect(200, 150, 140, 140); circ(290, 200, 32)(c); c.fill('evenodd'); });
  // stars: paper dots, twinkling on the beat
  const sr = rng(8);
  for (let i = 0; i < 16; i++) {
    const sx = x + 16 + sr() * (w - 32), sy = y + 14 + sr() * 150, sz = 2 + sr() * 2.2;
    if (Math.hypot(sx - 270, sy - 215) < 70) continue;
    F(PAPERV, circ(sx, sy, sz));
    if ((Math.floor(t / 0.4) + i) % 6 === 0) S(PAPERV, 2.4, (c) => { c.moveTo(sx - 9, sy); c.lineTo(sx + 9, sy); c.moveTo(sx, sy - 9); c.lineTo(sx, sy + 9); });
  }
  // skyline: far towers in pink dots, near towers in a solid pink + blue overprint
  const cr = rng(31);
  paint([0.0, null, null], () => {});
  for (let bx = x, i = 0; bx < x + w; i++) {
    const bw = 34 + cr() * 30, bh = 70 + cr() * 110; F([0.7, 1, 0], rect(bx, y + h - bh, Math.min(bw, x + w - bx), bh)); bx += bw - 2;
  }
  const lit = s.shipAge >= 0;
  for (let bx = x - 6, i = 0; bx < x + w; i++) {
    const bw = 36 + cr() * 34, bh = 36 + cr() * 90, bxx = Math.max(bx, x), ww = Math.min(bw, x + w - bxx);
    F([1, 1, 0], rect(bxx, y + h - bh, ww, bh));
    const rw = rng(100 + i);
    for (let wy = y + h - bh + 12; wy < y + h - 14; wy += 24) for (let wx = bxx + 8; wx < bxx + ww - 14; wx += 20) {
      const a = rw(), on = a < 0.3 || (lit && a < 0.62);
      if (on) F([0, 0, 1], rect(wx, wy, 10, 12));
    }
    bx += bw + 4;
  }
  // blinking aerial light
  if (Math.floor(t / 0.4) % 2 === 0) F([1, 0, 0], circ(x + w * 0.62, y + h - 200, 6));
  // mullions
  F([1, 0, 0], rect(x + w / 2 - 6, y, 12, h)); F([1, 0, 0], rect(x, y + h * 0.42, w, 12));
  // sill
  F([1, 0, 0], rr(x - 30, y + h + 14, w + 60, 20, 6));
}

function drawClock(t) {
  const { x, y, r } = LAYOUT.clock;
  F([1, 0, 0], circ(x, y, r + 8)); F(PAPERV, circ(x, y, r - 4));
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; F([0, 1, 0], circ(x + Math.sin(a) * (r - 11), y - Math.cos(a) * (r - 11), i % 3 ? 1.8 : 3)); }
  const step = Math.floor(t / 0.4), am = (step * 30 + 60) * Math.PI / 180, ah = (step * 2.5 + 300) * Math.PI / 180;
  S([0, 1, 0], 4.5, (c) => { c.moveTo(x, y); c.lineTo(x + Math.sin(am) * (r - 10), y - Math.cos(am) * (r - 10)); });
  S([0, 1, 0], 6, (c) => { c.moveTo(x, y); c.lineTo(x + Math.sin(ah) * (r - 21), y - Math.cos(ah) * (r - 21)); });
  F([1, 0, 0], circ(x, y, 4.5));
}

function drawDesk(t, s) {
  const d = LAYOUT.desk;
  // shadow on the floor, hard-edged blue dots over the floor colour
  F([null, 0.85, null], poly([[d.x - 10, 800], [d.x + d.w + 10, 800], [d.x + d.w + 56, 842], [d.x + 24, 842]]));
  // legs, rail, top
  F([0.8, 1, 0], rect(574, 640, 16, 160)); F([0.8, 1, 0], rect(930, 640, 16, 160));
  F([0.8, 0.7, 0], rect(590, 700, 340, 14));
  F([0, 0, 0], rect(d.x - 6, d.y, d.w + 12, 8));
  F([0.8, 1, 0], rect(d.x - 6, d.y + 8, d.w + 12, 30));
}

function drawLaptop(t, s) {
  const L = LAYOUT.laptop, sc = L.screen, bs = L.base;
  const awake = s.screen.awake, ship = s.screen.ship, cx = sc.x + sc.w / 2;
  // base: paper with a blue shade
  F([0, 0.22, 0], rr(bs.x - 6, bs.y, bs.w + 12, bs.h, 5)); F([0, 0.9, 0], rect(bs.x - 2, bs.y + bs.h - 4, bs.w + 4, 4));
  const tap = pose(t).tap;
  if (tap > 0.1) for (let i = 0; i < 3; i++) F([null, null, 1], rect(bs.x + 24 + i * 46, bs.y + 3, 16, 5));
  // screen flips (scaleX through zero) when the build passes
  const sx = ship <= 0 ? 1 : ship < 0.5 ? Math.max(0.02, 1 - 2 * ship) : Math.max(0.02, 2 * ship - 1);
  const showShip = ship >= 0.5;
  const sp = (v, path, fill = true) => paint(v, (c) => { c.translate(cx, 0); c.scale(sx, 1); c.translate(-cx, 0); c.beginPath(); path(c); fill ? c.fill() : c.stroke(); });
  sp([0.85, 1, 0], rr(sc.x, sc.y, sc.w, sc.h, 10));
  const ix = sc.x + 12, iy = sc.y + 12, iw = sc.w - 24, ih = sc.h - 24;
  if (!showShip) {
    sp([0.85 * (1 - awake), 1 - awake, awake], rr(ix, iy, iw, ih, 4));
    if (awake < 0.9) { sp([0.3, 0.45, 0], poly([[ix + 24, iy + ih], [ix + 52, iy + ih], [ix + 92, iy], [ix + 64, iy]])); }
    if (awake > 0.4) {
      sp([0, 1, 0], circ(ix + 12, iy + 10, 4)); sp([1, null, null], circ(ix + 26, iy + 10, 4));
      s.screen.rows.forEach((r, i) => { if (r.len > 0) sp([0, 1, 0], rr(ix + 14 + r.indent * 150, iy + 28 + i * 17, Math.max(6, r.w * 150 * r.len), 9, 3)); });
      const ti = Math.min(5, Math.floor(s.screen.typed * 6.4));
      if (s.screen.typed > 0 && s.screen.typed < 1 && Math.floor(t / 0.1) % 2 === 0) { const r = s.screen.rows[ti]; sp([0, 1, 0], rect(ix + 20 + r.indent * 150 + r.w * 150 * r.len, iy + 24 + ti * 17, 7, 17)); }
    }
  } else {
    sp([1, 0, 0.32], rr(ix, iy, iw, ih, 4));
    // the SHIPPED stamp: paper letters in a double frame, a little crooked, pressed in with an overshoot
    const age = Math.max(0, s.shipAge), pop = 1 + 0.35 * Math.exp(-age * 16);
    const stampPaint = (path) => paint(PAPERV, (c) => { c.translate(cx, sc.y + sc.h / 2); c.scale(sx, 1); c.rotate(-0.09); c.scale(pop, pop); c.lineWidth = 5; c.lineJoin = 'round'; c.textAlign = 'center'; c.textBaseline = 'middle'; path(c); });
    const font = '900 40px "Helvetica Neue", Helvetica, Arial, sans-serif';
    stampPaint((c) => { c.strokeRect(-86, -34, 172, 68); c.lineWidth = 2; c.strokeRect(-79, -27, 158, 54); c.font = font; const m = c.measureText('SHIPPED').width; c.scale(146 / m, 146 / m * 1.2); c.fillText('SHIPPED', 0, 1); });
  }
}

function drawPlant(t, s) {
  const bx = LAYOUT.plant.x, by = LAYOUT.plant.y, age = s.shipAge, wob = age >= 0 ? Math.exp(-age * 3) : 0;
  const leaves = [[-62, -150, -40], [-34, -210, -30], [10, -250, 4], [52, -200, 40], [70, -130, 56], [-84, -92, -60]];
  leaves.forEach(([dx, dy, bend], i) => {
    const sw = Math.sin(t * 3.2 + i * 1.4) * 4 + (age >= 0 ? Math.sin(age * 20 + i) * wob * 20 : 0);
    const tx = bx + dx + sw, ty = by - 66 + dy;
    const mx = bx + dx * 0.4 + bend * 0.5, my = by - 66 + dy * 0.55, nx = -(ty - (by - 66)), ny = tx - bx, nl = Math.hypot(nx, ny) || 1, wdt = 22;
    const path = (c) => { c.moveTo(bx, by - 66); c.quadraticCurveTo(mx + nx / nl * wdt, my + ny / nl * wdt, tx, ty); c.quadraticCurveTo(mx - nx / nl * wdt, my - ny / nl * wdt, bx, by - 66); };
    F([0, 0.62, 1], path);
    S([0, 1, 0.1], 3, (c) => { c.moveTo(bx, by - 66); c.quadraticCurveTo(mx, my, tx, ty); });
  });
  // pot: pink with yellow dots, a lip on top
  F([1, 0, 0.4], poly([[bx - 46, by - 66], [bx + 46, by - 66], [bx + 34, by], [bx - 34, by]]));
  F([1, 0, 0], rr(bx - 52, by - 78, 104, 20, 6));
  F([null, 0.5, null], poly([[bx + 14, by - 58], [bx + 46, by - 66], [bx + 34, by], [bx + 14, by]]));
}

// ---- the character -------------------------------------------------------------------------------------------------
function drawChar(t, p, s) {
  const D = DIMS, happy = s.shipAge >= 0;
  const KEY = 10;                                                     // paper keyline around each part
  const limb = (a, b, w, fill) => { S(PAPERV, w + KEY, seg(a, b)); S(fill, w, seg(a, b)); };
  const leg = (side, jeans, shoe, sole) => {
    S(PAPERV, D.thighW + 12, seg(side.hip, side.knee)); S(PAPERV, D.shinW + 12, seg(side.knee, side.ankle));
    S(jeans, D.thighW + 4, seg(side.hip, side.knee)); S(jeans, D.shinW + 4, seg(side.knee, side.ankle));
    // sneaker: chunky toe box, a stripe and a sole
    const a = side.ankle, o = side.toe;
    S(PAPERV, 44, seg({ x: a.x - 2, y: a.y + 8 }, { x: o.x + 4, y: o.y - 8 }));
    S(shoe, 32, seg({ x: a.x - 2, y: a.y + 8 }, { x: o.x + 4, y: o.y - 8 }));
    S(sole, 9, seg({ x: a.x - 14, y: Math.max(a.y + 22, o.y) + 1 }, { x: o.x + 14, y: o.y + 1 }), 'butt');
  };
  const ARM = D.upperArmW + 9;
  const arm = (side, fill, handCol, fist) => {
    S(PAPERV, ARM + KEY, seg(side.shoulder, side.elbow)); S(PAPERV, ARM - 2 + KEY, seg(side.elbow, side.hand));
    S(fill, ARM, seg(side.shoulder, side.elbow)); S(fill, ARM - 2, seg(side.elbow, side.hand));
    const r = fist ? 15 : 12.5;
    F(PAPERV, circ(side.hand.x, side.hand.y, r + 5)); F(handCol, circ(side.hand.x, side.hand.y, r));
  };

  // far side
  leg(p.far, [0.6, 1, 0], [0, 0.45, 0.85], [0.8, 0.8, 0]);
  arm(p.far, [1, 0.42, 0], SKIN, false);

  // torso with a paper keyline, back shading, pocket and strings, drawn in a frame that leans with the body
  const pel = p.pelvis, nk = p.neck, lean = p.lean;
  S(PAPERV, D.torsoW + KEY + 6, seg(pel, nk));
  S([1, 0, 0], D.torsoW + 2, seg(pel, nk));
  const tf = (path) => frame(pel.x, pel.y, lean, path);
  F([1, 0.4, null], tf((c) => { c.roundRect(-30, -116, 18, 112, 8); }));                          // back shade (blue dots on pink)
  F([1, 0.55, null], tf((c) => { c.roundRect(-8, -64, 34, 26, 8); }));                             // pocket
  F([1, 0.5, null], tf((c) => { c.rect(-30, -14, 60, 14); }));                                      // ribbed hem
  S(PAPERV, 4, tf((c) => { c.moveTo(14, -112); c.lineTo(16, -86); c.moveTo(26, -112); c.lineTo(28, -92); }));   // drawstrings
  // hood behind the head
  const nf = (path) => frame(nk.x, nk.y, lean, path);
  F(PAPERV, nf((c) => { c.ellipse(-16, -6, 38, 30, 0, 0, 7); }));
  F([1, 0.45, 0], nf((c) => { c.ellipse(-16, -6, 32, 24, 0, 0, 7); }));

  // head
  const hd = p.head, hf = (path) => frame(hd.x, hd.y, hd.angle, path);
  F(PAPERV, hf((c) => { c.arc(0, 0, hd.r + 6, 0, 7); c.moveTo(44, 4); c.arc(40, 6, 10, 0, 7); }));
  F(SKIN, hf((c) => { c.arc(0, 0, hd.r, 0, 7); }));
  F(SKIN, hf((c) => { c.moveTo(46, 9); c.arc(40, 9, 6.5, 0, 7); }));
  paint([0.78, 1, 0], (c) => { // short hair, clipped to the head
    c.translate(hd.x, hd.y); c.rotate(hd.angle); c.beginPath(); c.arc(0, 0, hd.r, 0, 7); c.clip();
    c.beginPath(); c.moveTo(-60, -60); c.lineTo(60, -60); c.lineTo(60, -16); c.lineTo(36, -9); c.lineTo(22, -19); c.lineTo(8, -5); c.lineTo(-10, -16); c.lineTo(-20, 8); c.lineTo(-24, 30); c.lineTo(-60, 40); c.closePath(); c.fill();
  });
  F([0.55, 0, 0.45], hf((c) => { c.ellipse(-4, 10, 6.5, 8, 0, 0, 7); }));                          // ear
  F([0.6, 0, 0], hf((c) => { c.arc(20, 17, 6.5, 0, 7); }));                                         // cheek
  if (happy) {
    S([0, 1, 0], 4, hf((c) => { for (const ex of [10, 29]) { c.moveTo(ex - 6, 6); c.arc(ex, 6, 6, Math.PI, Math.PI * 2); } }));
    F([0, 1, 0], hf((c) => { c.moveTo(16, 20); c.lineTo(36, 20); c.arc(26, 20, 10, 0, Math.PI); c.closePath(); }));
    F([1, 0, 0], hf((c) => { c.ellipse(26, 28, 5, 3.5, 0, 0, 7); }));
  } else {
    F([0, 1, 0], hf((c) => { c.ellipse(10, 3, 4, 6, 0, 0, 7); c.moveTo(33, 3); c.ellipse(29, 3, 4, 6, 0, 0, 7); }));
    S([0, 1, 0], 3.5, hf((c) => { c.moveTo(20, 24); c.lineTo(32, 24); }));
  }

  // headphones around the neck: yellow band, yellow cups with blue pads
  S(PAPERV, 22, nf((c) => { c.ellipse(0, 10, 34, 24, 0, 0.1 * Math.PI, 0.9 * Math.PI); }));
  S([0, 0, 1], 11, nf((c) => { c.ellipse(0, 10, 34, 24, 0, 0.1 * Math.PI, 0.9 * Math.PI); }));
  for (const sx of [-38, 38]) {
    F(PAPERV, nf((c) => { c.roundRect(sx - 15, 0, 30, 36, 9); }));
    F([0, 0, 1], nf((c) => { c.roundRect(sx - 10, 5, 20, 26, 6); }));
    F([0, 1, 0], nf((c) => { c.arc(sx, 18, 5, 0, 7); }));
  }

  // near side
  leg(p.near, [0, 1, 0], [0, 0, 1], [1, 0, 0]);
  arm(p.near, [1, 0, 0.22], SKIN, p.celebrate > 0.5);
  if (p.celebrate > 0.5) { // action ticks above the fist
    const hx = p.near.hand.x, hy = p.near.hand.y, f = Math.floor(t * 15) % 2;
    S([1, 0, 0], 5, (c) => { for (const dx of [-30, 0, 30]) { c.moveTo(hx + dx, hy - 38 - f * 6); c.lineTo(hx + dx * 1.2, hy - 62 - f * 6); } });
  }
}

function drawShadow(t, p) {
  const air = Math.min(1, p.hop / 34), x = p.pelvis.x + 14, rx = 105 - air * 32, ry = 15 - air * 4;
  F([null, 0.9, null], (c) => { c.ellipse(x, 818, rx, ry, 0, 0, 7); });
}

function drawConfetti(t) {
  for (const q of particles(t)) {
    const a = clamp(q.alpha * 1.1), sz = q.size * 2.3, at = (path) => frame(q.x, q.y, q.rot, path);
    // each piece gets a paper underlay so it reads on the dark wall; its inks then overprint each other
    const shape = q.kind === 0 ? (c) => c.rect(-sz / 2, -sz / 2.6, sz, sz / 1.3)
      : q.kind === 1 ? (c) => c.arc(0, 0, sz * 0.52, 0, 7)
      : q.kind === 2 ? poly([[0, -sz * 0.62], [sz * 0.6, sz * 0.5], [-sz * 0.6, sz * 0.5]])
      : (c) => { c.rect(-sz / 2, -sz / 5, sz, sz * 0.4); c.rect(-sz / 5, -sz / 2, sz * 0.4, sz); };
    F([a > 0.5 ? 0 : null, a > 0.5 ? 0 : null, a > 0.5 ? 0 : null], at(shape));
    const v = [null, null, null];
    if (q.kind === 0) v[0] = a; else if (q.kind === 1) v[2] = a; else if (q.kind === 2) v[1] = a; else { v[0] = a; v[2] = a * 0.8; }
    F(v, at(shape));
  }
}

function regMarks() {
  for (let i = 0; i < 3; i++) {
    const v = [0, 0, 0]; v[i] = 1;
    for (const [x, y] of [[15, 500], [985, 500], [500, 15], [500, 985]]) {
      S(v, 2.2, (c) => { c.moveTo(x + 8, y); c.arc(x, y, 8, 0, 7); c.moveTo(x - 14, y); c.lineTo(x + 14, y); c.moveTo(x, y - 14); c.lineTo(x, y + 14); });
    }
  }
  // colour bars in the bottom margin
  for (let i = 0; i < 3; i++) { const v = [null, null, null]; v[i] = 1; F(v, rect(40 + i * 34, 975, 30, 14)); }
  for (let i = 0; i < 3; i++) { const v = [null, null, null]; v[i] = 0.5; F(v, rect(160 + i * 34, 975, 30, 14)); }
}

// ---- frame ---------------------------------------------------------------------------------------------------------
export function render(ctx, t, w, h) {
  init();
  const p = pose(t), s = story(t), age = s.shipAge, slam = age >= 0 ? Math.exp(-age * 9) : 0;
  // misregistration: each ink sits a few pixels off, wobbling slowly; the blue plate jolts when the build passes
  const off = [
    [0.4 + Math.sin(t * 1.7) * 0.5, -0.3 + Math.cos(t * 1.3) * 0.5],
    [2.4 + Math.sin(t * 2.3 + 1) * 0.7 + slam * 3.5, -1.8 + Math.cos(t * 1.9) * 0.6 - slam * 1.5],
    [-2.2 + Math.cos(t * 2.1 + 2) * 0.7 - slam * 2, 1.9 + Math.sin(t * 1.6 + 3) * 0.6],
  ];
  for (let i = 0; i < 3; i++) {
    const c = LC[i]; c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#000'; c.fillRect(0, 0, R, R);
    c.setTransform(K, 0, 0, K, off[i][0], off[i][1]);
  }
  // print margin: everything inside is clipped to the poster area
  for (let i = 0; i < 3; i++) { LC[i].save(); LC[i].beginPath(); LC[i].rect(30, 30, 940, 940); LC[i].clip(); }
  drawRoom(t, s);
  drawRays(t, s);
  drawWindow(t, s);
  drawClock(t);
  drawDesk(t, s);
  drawLaptop(t, s);
  drawPlant(t, s);
  drawShadow(t, p);
  drawChar(t, p, s);
  drawConfetti(t);
  for (let i = 0; i < 3; i++) LC[i].restore();
  regMarks();

  // halftone + multiply composite, per pixel
  const d = [LC[0].getImageData(0, 0, R, R).data, LC[1].getImageData(0, 0, R, R).data, LC[2].getImageData(0, 0, R, R).data];
  const out = outImg.data;
  const c0 = INKS[0].c, c1 = INKS[1].c, c2 = INKS[2].c;
  const m = INKS.map((k) => [1 - k.c[0] / 255, 1 - k.c[1] / 255, 1 - k.c[2] / 255]);
  for (let i = 0, j = 0; i < R * R; i++, j += 4) {
    let r = PAPERBUF[i * 3], g = PAPERBUF[i * 3 + 1], b = PAPERBUF[i * 3 + 2];
    for (let k = 0; k < 3; k++) {
      const v8 = d[k][j]; if (v8 === 0) continue;
      const v = v8 / 255;
      let a = 6 * (v - SCR[k][i]) + 0.5 + 10 * Math.max(0, v - 0.9);
      a = (a > 1 ? 1 : a < 0 ? 0 : a) * (v * 20 > 1 ? 1 : v * 20) * DENS[k][i];
      if (a <= 0) continue;
      const mk3 = m[k]; r *= 1 - a * mk3[0]; g *= 1 - a * mk3[1]; b *= 1 - a * mk3[2];
    }
    out[j] = r; out[j + 1] = g; out[j + 2] = b; out[j + 3] = 255;
  }
  outCtx.putImageData(outImg, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(outCv, 0, 0, R, R, 0, 0, w, h);
  ctx.restore();
}
