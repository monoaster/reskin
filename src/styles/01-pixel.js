// 01 pixel: a true 128x128 pixel-art render. Everything is written into a 128x128 array of palette indices
// (16 fixed colours), turned into an ImageData, then scaled up to w x w with nearest neighbour. No anti-aliasing.
import { W, H, LAYOUT, DIMS, pose, story, particles, util, rng } from '../rig.js';

export const meta = { id: '01', slug: 'pixel', name: 'Pixel Art', tag: '8-bit', accent: '#ff3c9e' };

const N = 128;
const S = W / N; // world units per low-res pixel (7.8125)

// ---- the 16 colours ---------------------------------------------------------------------------------
const PAL = [
  '#120d24', // 0 ink
  '#2a1d4e', // 1 wall dark / hair of the night
  '#44347a', // 2 wall light
  '#6b55b0', // 3 lavender (horizon, far shoe, shade)
  '#ff3c9e', // 4 hot pink (hoodie)
  '#a8185f', // 5 dark pink
  '#ffd23f', // 6 yellow
  '#fff4d6', // 7 cream
  '#3fe0ff', // 8 cyan
  '#1c8fd0', // 9 jeans blue
  '#1a4a8a', // 10 deep blue
  '#3ddc84', // 11 green
  '#1c7a4a', // 12 dark green
  '#8a5a3c', // 13 wood
  '#4f321f', // 14 dark wood / hair
  '#f2a07b', // 15 skin
];
const INK = 0, WALL = 1, WALL2 = 2, LAV = 3, PINK = 4, PINKD = 5, YEL = 6, CREAM = 7, CYAN = 8, BLUE = 9, BLUED = 10,
  GRN = 11, GRND = 12, WOOD = 13, WOODD = 14, SKIN = 15;
const LUT = new Uint32Array(16);
PAL.forEach((h, i) => { const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16); LUT[i] = (255 << 24) | (b << 16) | (g << 8) | r; });

const FY = 101; // first floor row

// ---- low-res target (module-level caches; fully repainted on every call) ---------------------------------
const buf = new Uint8Array(N * N);
const mo = new Uint8Array(N * N), mf = new Uint8Array(N * N);
let low = null, lctx = null, img = null, img32 = null;
function target() {
  if (!low) {
    low = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(N, N) : Object.assign(document.createElement('canvas'), { width: N, height: N });
    lctx = low.getContext('2d'); lctx.imageSmoothingEnabled = false;
    img = lctx.createImageData(N, N); img32 = new Uint32Array(img.data.buffer);
  }
}

// ---- primitives -------------------------------------------------------------------------------------
const pix = (x, y, c) => { if (x >= 0 && x < N && y >= 0 && y < N) buf[y * N + x] = c; };
const get = (x, y) => (x >= 0 && x < N && y >= 0 && y < N ? buf[y * N + x] : -1);
const rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) pix(x + i, y + j, c); };
const disc = (cx, cy, r2, c) => { const r = Math.ceil(Math.sqrt(r2)); for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i * i + j * j <= r2) pix(cx + i, cy + j, c); };
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x, y) => (B4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
const dith = (x, y, level) => level > bayer(x, y);

// Bresenham, calling fn(x, y) on every step (end points included).
function line(x0, y0, x1, y1, fn) {
  let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy;
  for (;;) {
    fn(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
// Round brushes of d pixels across, as lists of offsets.
const BR = [];
for (let d = 1; d <= 9; d++) {
  const o = d % 2 ? 0 : 0.5, lo = -Math.floor(d / 2), hi = lo + d - 1, r = d / 2, a = [];
  for (let j = lo; j <= hi; j++) for (let i = lo; i <= hi; i++) if ((i + o) * (i + o) + (j + o) * (j + o) <= r * r + 0.7) a.push([i, j]);
  BR[d] = a;
}
function stamp(mask, ax, ay, bx, by, d) {
  const br = BR[d];
  line(ax, ay, bx, by, (x, y) => { for (const [dx, dy] of br) { const xx = x + dx, yy = y + dy; if (xx >= 0 && xx < N && yy >= 0 && yy < N) mask[yy * N + xx] = 1; } });
}
// One sprite part: segments [ax, ay, bx, by, width] drawn as thick Bresenham lines with a 1 px ink outline.
function part(segs, fillFn) {
  mo.fill(0); mf.fill(0);
  for (const s of segs) { stamp(mo, s[0], s[1], s[2], s[3], s[4] + 2); stamp(mf, s[0], s[1], s[2], s[3], s[4]); }
  for (let i = 0; i < N * N; i++) if (mo[i]) buf[i] = INK;
  for (let i = 0; i < N * N; i++) if (mf[i]) buf[i] = fillFn(i % N, (i / N) | 0);
}

// ---- 3x5 pixel font ---------------------------------------------------------------------------------
const GLYPH_SRC = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101111011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111',
  9: '111101111001110', '+': '000010111010000', '-': '000000111000000', x: '000101010101000', '!': '010010010000010', '.': '000000000000010',
};
function textWidth(s) { return s.length * 4 - 1; }
function text(s, x, y, c, shadow = -1) {
  for (let k = 0; k < s.length; k++) {
    const g = GLYPH_SRC[s[k]]; if (!g) continue;
    for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j * 3 + i] === '1') {
      if (shadow >= 0) pix(x + k * 4 + i + 1, y + j + 1, shadow);
    }
  }
  for (let k = 0; k < s.length; k++) {
    const g = GLYPH_SRC[s[k]]; if (!g) continue;
    for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j * 3 + i] === '1') pix(x + k * 4 + i, y + j, c);
  }
}

const P = (j) => [Math.round(j.x / S), Math.round(j.y / S)];

// ---- fixed art that never changes between frames ----------------------------------------------------
// code tokens for the laptop rows: lengths and colours
const TOK = [];
{ const r = rng(321); const cols = [CYAN, PINK, YEL, CREAM, GRN];
  for (let i = 0; i < 6; i++) { const a = []; let n = 0; while (n < 24) { const l = 2 + Math.floor(r() * 4); a.push([l, cols[(i + a.length * 2 + Math.floor(r() * 2)) % 5]]); n += l + 1; } TOK.push(a); } }

// ---- scene pieces -----------------------------------------------------------------------------------
function drawWall() {
  for (let y = 0; y < FY; y++) for (let x = 0; x < N; x++) buf[y * N + x] = dith(x, y, Math.max(0, (y - 4) / 100) * 0.9) ? WALL2 : WALL;
  // baseboard
  rect(0, 97, N, 1, WOOD); rect(0, 98, N, 3, WOODD); rect(0, 101, N, 1, INK);
}

const STARS = (() => { const r = rng(5), a = []; for (let i = 0; i < 14; i++) { const x = 15 + Math.floor(r() * 24), y = 22 + Math.floor(r() * 20); if (Math.hypot(x - 33, y - 28) > 9) a.push([x, y, Math.floor(r() * 5)]); } return a; })();
const CITY = (() => {
  const r = rng(77), far = [], near = [];
  for (let x = 14; x < 40;) { const w = 4 + Math.floor(r() * 4), h = 12 + Math.floor(r() * 12); far.push({ x, w, h }); x += w; }
  for (let x = 12; x < 40;) { const w = 4 + Math.floor(r() * 4), h = 5 + Math.floor(r() * 13); near.push({ x, w, h, seed: Math.floor(r() * 1000) }); x += w + (r() < 0.3 ? 1 : 0); }
  return { far, near };
})();

function drawWindow(t, s) {
  // frame
  rect(10, 17, 34, 45, INK); rect(11, 18, 32, 43, WOOD); rect(11, 18, 32, 1, SKIN); rect(11, 18, 1, 43, SKIN); rect(13, 20, 28, 39, INK);
  const x0 = 14, y0 = 21, x1 = 39, y1 = 57;
  for (let y = y0; y <= y1; y++) {
    const v = ((y - y0) / (y1 - y0)) * 3, f = Math.floor(v), fr = v - f;
    for (let x = x0; x <= x1; x++) pix(x, y, f >= 3 ? 3 : (dith(x, y, fr) ? f + 1 : f));
  }
  // moon with halo and a bite out of it
  for (let y = 21; y <= 40; y++) for (let x = 27; x <= 39; x++) { const d = (x - 33) * (x - 33) + (y - 28) * (y - 28); if (d <= 42 && d > 17 && dith(x, y, 0.55 - d / 90)) pix(x, y, y > 30 ? 3 : 2); }
  for (let y = 22; y <= 34; y++) for (let x = 28; x <= 39; x++) { const d1 = (x - 33) * (x - 33) + (y - 28) * (y - 28), d2 = (x - 35) * (x - 35) + (y - 27) * (y - 27); if (d1 <= 17 && d2 > 13) pix(x, y, y < 27 && x > 30 ? CREAM : YEL); }
  // stars: 1-bit, they blink on the beat
  for (const [x, y, k] of STARS) {
    pix(x, y, CREAM);
    if (((Math.floor(t / 0.4) + k) % 6) === 0) { pix(x, y - 1, LAV); pix(x, y + 1, LAV); }
  }
  // skyline: far layer (wall purple) then near layer (ink) with lit windows
  for (const b of CITY.far) for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) { if (b.x + i <= x1) pix(b.x + i, y1 - j, WALL); }
  const lit = s.shipAge >= 0 ? 1 : 0;
  for (const b of CITY.near) {
    for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) if (b.x + i >= x0 && b.x + i <= x1) pix(b.x + i, y1 - j, INK);
    const rr = rng(b.seed);
    for (let j = 2; j < b.h - 1; j += 2) for (let i = 1; i < b.w - 1; i += 2) {
      const a = rr(), on = a < 0.34 || (lit && a < 0.6 + Math.min(0.15, s.shipAge * 0.3));
      if (on && b.x + i <= x1) pix(b.x + i, y1 - j, rr() < 0.3 ? CYAN : YEL);
    }
  }
  // tallest building blinks a red light on the beat
  const tall = CITY.far.reduce((m, b) => (b.h > m.h ? b : m), CITY.far[0]);
  if (Math.floor(t / 0.4) % 2 === 0) pix(Math.min(x1, tall.x + 1), y1 - tall.h - 1, PINK);
  // mullions and sill
  rect(26, 21, 2, 37, WOOD); rect(14, 38, 26, 2, WOOD); rect(26, 21, 1, 37, SKIN); rect(14, 38, 26, 1, SKIN);
  rect(8, 61, 38, 2, CREAM); rect(8, 63, 38, 1, INK); rect(8, 61, 1, 3, INK); rect(45, 61, 1, 3, INK);
}

function drawClock(t) {
  const cx = 55, cy = 22;
  disc(cx, cy, 28, INK); disc(cx, cy, 19, PINK); disc(cx, cy, 10, CREAM);
  const step = Math.floor(t / 0.4);
  const am = (step * 30 + 60) * Math.PI / 180, ah = (step * 2.5 + 300) * Math.PI / 180;
  line(cx, cy, cx + Math.round(Math.sin(am) * 3), cy - Math.round(Math.cos(am) * 3), (x, y) => pix(x, y, INK));
  line(cx, cy, cx + Math.round(Math.sin(ah) * 2), cy - Math.round(Math.cos(ah) * 2), (x, y) => pix(x, y, PINKD));
  pix(cx, cy, INK);
}

function drawFloor() {
  for (let y = FY + 1; y < N; y++) for (let x = 0; x < N; x++) buf[y * N + x] = WOODD;
  // plank seams, wider apart toward the viewer
  const seams = [108, 116, 125];
  seams.forEach((sy, k) => {
    rect(0, sy, N, 1, WALL);
    const off = k * 17;
    for (let x = off % 26 + 6; x < N; x += 26) { const top = k === 0 ? FY + 1 : seams[k - 1] + 1; rect(x, top, 1, sy - top, WALL); }
    if (k === 2) for (let x = (off + 11) % 26; x < N; x += 26) rect(x, 126, 1, 2, WALL);
  });
  // grain
  const r = rng(9);
  for (let i = 0; i < 90; i++) { const x = Math.floor(r() * N), y = FY + 2 + Math.floor(r() * 25); if (get(x, y) === WOODD) pix(x, y, WOOD); if (get(x + 1, y) === WOODD && r() < 0.6) pix(x + 1, y, WOOD); }
  // moonlight from the window: four skewed panes, half dithered
  for (let v = 0; v < 22; v++) {
    const y = 104 + v; if (v > 9 && v < 12) continue;
    for (const [u0, u1] of [[0, 12], [15, 27]]) for (let u = u0; u <= u1; u++) { const x = 10 + u + Math.round(v * 0.9); if (get(x, y) !== INK && (x + y) % 2 === 0) pix(x, y, WOOD); }
  }
}

function drawPlant(t, s) {
  const bx = 113, by = 96;
  const age = s.shipAge, wob = age >= 0 ? Math.exp(-age * 3.2) : 0;
  // five leaves fanning out of the pot: tapering Bresenham curves with an ink outline, dark body, light mid-rib
  const leaves = [[-6, -17, -10], [-3, -28, -6], [3, -32, 1], [8, -26, 9], [10, -15, 13]];
  const polys = leaves.map(([dx, dy, bend], i) => {
    const sw = Math.sin(t * 3.4 + i * 1.3) * 0.8 + (age >= 0 ? Math.sin(age * 20 + i * 1.7) * wob * 2.4 : 0);
    const tx = Math.round(bx + dx + sw), ty = Math.round(by + dy + (age >= 0 ? Math.sin(age * 16 + i) * wob * 1.2 : 0));
    const mx = Math.round(bx + dx * 0.3 + bend * 0.55 + sw * 0.4), my = Math.round(by + dy * 0.55);
    return [[bx, by, mx, my], [mx, my, tx, ty]];
  });
  const pass = (col, grow, ox) => polys.forEach((segs) => { let n = 0; segs.forEach(([ax, ay, cx, cy]) => line(ax, ay, cx, cy, (x, y) => { const d = n++ < 9 ? 3 : n < 16 ? 3 : 1; const dd = Math.max(1, (grow < 0 ? d - 2 : d + grow)); for (const [a, b] of BR[dd]) pix(x + a + ox, y + b, col); })); });
  pass(INK, 2, 0); pass(GRND, 0, 0); pass(GRN, -2, 0);
  // pot: a trapezoid, cream with a pink rim and a lavender shaded side
  for (let y = 0; y < 8; y++) { const half = 5 - Math.floor(y / 3); rect(bx - half - 1, by + y, half * 2 + 3, 1, INK); rect(bx - half, by + y, half * 2 + 1, 1, y < 2 ? PINK : CREAM); rect(bx + half - 2, by + y, 3, 1, y < 2 ? PINKD : LAV); }
  rect(bx - 6, by - 1, 13, 1, INK); rect(bx - 6, by + 8, 13, 1, INK);
}

function drawDesk() {
  const L = 72, R = 122;
  // legs
  for (const lx of [73, 119]) { rect(lx - 1, 81, 5, 23, INK); rect(lx, 81, 3, 22, WOOD); rect(lx + 2, 81, 1, 22, WOODD); }
  // top slab
  rect(L - 1, 77, R - L + 3, 6, INK); rect(L, 78, R - L + 1, 4, WOOD); rect(L, 78, R - L + 1, 1, SKIN); rect(L, 81, R - L + 1, 1, WOODD);
  // drawer rail between the legs
  rect(76, 82, 43, 1, INK); rect(76, 83, 43, 1, WOODD);
}

function drawDeskShadows() {
  for (let y = 102; y <= 106; y++) for (let x = 70; x <= 127; x++) {
    const edge = y === 105 ? 0.6 : y === 106 ? 0.3 : 1; if (dith(x, y, edge) && get(x, y) !== INK) pix(x, y, INK);
  }
}

function drawLaptop(t, s) {
  const sc = LAYOUT.laptop.screen;
  const x0 = Math.round(sc.x / S), y0 = Math.round(sc.y / S), w = Math.round(sc.w / S), h = Math.round(sc.h / S); // 79,56,26,20
  // glow on the wall around the screen: hard lighting, dithered
  const awake = s.screen.awake, ship = s.screen.ship;
  const gl = Math.max(awake * 0.45, ship);
  if (gl > 0.02) {
    for (let y = y0 - 10; y < y0 + h + 2; y++) for (let x = x0 - 10; x < x0 + w + 10; x++) {
      const dx = Math.max(x0 - x, 0, x - (x0 + w - 1)), dy = Math.max(y0 - y, 0, y - (y0 + h - 1));
      const d = Math.hypot(dx, dy); if (d <= 0 || d > 10) continue;
      const c = get(x, y); if (c !== WALL && c !== WALL2) continue;
      if (dith(x, y, gl * (1 - d / 10) * 1.1)) pix(x, y, ship > 0.5 ? GRND : (c === WALL ? WALL2 : LAV));
    }
  }
  // lid + glass
  rect(x0, y0, w, h, INK); rect(x0 + 1, y0 + 1, w - 2, 1, LAV);
  const ix = x0 + 1, iy = y0 + 1, iw = w - 2, ih = h - 2; // interior
  rect(ix, iy, iw, ih, awake < 0.05 ? INK : INK);
  if (awake < 0.98) { for (let k = 0; k < 6; k++) { pix(ix + 3 + k, iy + 7 - k, WALL2); pix(ix + 9 + k, iy + 13 - k, WALL2); } }
  for (let y = iy; y < iy + ih; y++) for (let x = ix; x < ix + iw; x++) if (dith(x, y, awake)) pix(x, y, y < iy + 3 ? WALL2 : WALL);
  if (awake > 0.3) { pix(ix + 2, iy + 1, PINK); pix(ix + 4, iy + 1, YEL); pix(ix + 6, iy + 1, GRN); }
  // code rows
  const sh = s.screen;
  sh.rows.forEach((r, i) => {
    if (r.len <= 0 || awake < 0.5) return;
    const y = iy + 4 + i * 2, x = ix + 3 + (r.indent > 0 ? 2 : 0), maxw = Math.round(r.w * 19 * r.len + (r.len > 0 ? 1 : 0));
    pix(ix + 1, y, LAV);
    let cx = 0;
    for (const [l, c] of TOK[i]) { for (let k = 0; k < l && cx < maxw; k++, cx++) pix(x + cx, y, c); cx++; if (cx >= maxw) break; }
  });
  // blinking cursor at the end of the line being typed
  if (sh.typed > 0 && sh.typed < 1 && Math.floor(t / 0.1) % 2 === 0) {
    const i = Math.min(5, Math.floor(sh.typed * 6.4)); const r = sh.rows[i];
    const x = ix + 3 + (r.indent > 0 ? 2 : 0) + Math.round(r.w * 19 * r.len) + 1; rect(x, iy + 3 + i * 2, 1, 3, CREAM);
  }
  // the build passes: dithered wipe to green, a big tick and SHIP
  if (ship > 0) {
    for (let y = iy; y < iy + ih; y++) for (let x = ix; x < ix + iw; x++) if (dith(x, y, ship * 1.05)) pix(x, y, (x + y) % 6 < 1 ? GRND : GRN);
    if (ship > 0.6) {
      const jump = s.shipAge < 0.25 ? -Math.round(Math.sin(s.shipAge / 0.25 * Math.PI) * 2) : 0;
      const CHK = ['.......XX', '......XXX', '.....XXX.', 'XX..XXX..', 'XXXXXX...', '.XXXX....', '..XX.....'];
      const cx = ix + 7, cy = iy + 2 + jump;
      CHK.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === 'X') { pix(cx + i + 1, cy + j + 1, GRND); } });
      CHK.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === 'X') pix(cx + i, cy + j, CREAM); });
      text('SHIP', ix + Math.floor((iw - 15) / 2), iy + ih - 7, CREAM, GRND);
    }
  }
  // keyboard slab
  const bx = Math.round(LAYOUT.laptop.base.x / S), bw = Math.round(LAYOUT.laptop.base.w / S);
  rect(bx - 1, 76, bw + 2, 3, INK); rect(bx, 76, bw, 1, CREAM); rect(bx, 77, bw, 1, LAV);
  for (let x = bx + 2; x < bx + bw - 1; x += 2) pix(x, 76, LAV);
  // the keys flash on the three taps
  const tap = pose(t).tap;
  if (tap > 0.15) { const k = Math.round(tap * 3); for (let i = 0; i < 3; i++) pix(bx + 7 + i * 3 + (Math.floor((t - 2.4) / 0.2) % 3) * 2, 76, CYAN); }
}

function drawFootDust(t) {
  for (let k = 0; k <= 5; k++) {
    const tl = k * 0.4, age = t - tl; if (age < 0 || age > 0.24) continue;
    const q = pose(tl), f = k % 2 === 0 ? q.near : q.far;
    const [ax] = P(f.ankle);
    const fa = age / 0.24;
    for (let i = 0; i < 3; i++) { const x = ax - 2 - Math.round(fa * (3 + i * 2)), y = 103 - Math.round(fa * (2 + i)) - (i === 1 ? 1 : 0); if (dith(x, y, 1 - fa * 0.8)) pix(x, y, i === 1 ? LAV : CREAM); }
  }
}

// ---- the character ----------------------------------------------------------------------------------
function drawChar(t, p, s) {
  const happy = s.shipAge >= 0;
  const J = (j) => P(j);
  const leg = (side, jeans, shoeCol) => {
    const hip = J(side.hip), kn = J(side.knee), an = J(side.ankle), to = J(side.toe);
    part([[hip[0], hip[1], kn[0], kn[1], 4], [kn[0], kn[1], an[0], an[1], 3]], () => jeans);
    // sneaker: foot line with a lavender sole
    part([[an[0], an[1] + 1, to[0], to[1] - 1, 3]], (x, y) => (y >= Math.max(an[1] + 1, to[1] - 1) + 1 ? LAV : shoeCol));
    pix(an[0] - 1, an[1] + 1, PINK); // heel tab
  };
  const arm = (side, col, dark) => {
    const sh = J(side.shoulder), el = J(side.elbow), ha = J(side.hand);
    part([[sh[0], sh[1], el[0], el[1], 3], [el[0], el[1], ha[0], ha[1], 3]], (x, y) => col);
    return ha;
  };
  const hand = (ha, fist) => { part([[ha[0], ha[1], ha[0], ha[1], fist ? 3 : 3]], () => SKIN); if (fist) { pix(ha[0] - 1, ha[1], 15); } };

  // far side first
  leg(p.far, BLUED, LAV);
  const hF = arm(p.far, PINKD); hand(hF, false);

  // torso: hoodie
  const pel = J(p.pelvis), nk = J(p.neck);
  const ts = [pel[0] + (nk[0] - pel[0]) * 0.2, pel[1] + (nk[1] - pel[1]) * 0.2].map(Math.round);
  const te = [nk[0], nk[1] + 1];
  const axis = (y) => pel[0] + (nk[0] - pel[0]) * (pel[1] - y) / Math.max(1, pel[1] - nk[1]);
  part([[ts[0], ts[1], te[0], te[1], 7]], (x, y) => {
    const a = axis(y);
    if (y >= pel[1] - 1) return PINKD;                   // ribbed hem
    if (x < a - 1.4) return PINKD;                       // back shade
    return PINK;
  });
  // pocket
  const pa = axis(pel[1] - 5);
  line(Math.round(pa - 1), pel[1] - 5, Math.round(pa + 3), pel[1] - 5, (x, y) => pix(x, y, PINKD));
  pix(Math.round(pa + 3), pel[1] - 4, PINKD); pix(Math.round(pa - 1), pel[1] - 4, PINKD);
  // hood behind the head + drawstrings
  disc(nk[0] - 2, nk[1], 10, INK); disc(nk[0] - 2, nk[1], 5, PINKD);
  pix(nk[0] + 1, nk[1] + 3, CREAM); pix(nk[0] + 1, nk[1] + 4, CREAM); pix(nk[0] + 3, nk[1] + 3, CREAM); pix(nk[0] + 3, nk[1] + 4, CREAM);

  // head
  const [hx, hy] = J(p.head), a = p.head.angle, ca = Math.cos(a), sa = Math.sin(a);
  disc(hx, hy, 33, INK);
  const local = (x, y) => { const dx = x - hx, dy = y - hy; return [dx * ca + dy * sa, -(dx * sa - dy * ca)]; }; // u right, v down
  for (let y = hy - 6; y <= hy + 6; y++) for (let x = hx - 6; x <= hx + 6; x++) {
    const dx = x - hx, dy = y - hy; if (dx * dx + dy * dy > 21) continue;
    const [u, v] = local(x, y);
    let c = SKIN;
    if (v < -1.8 || (u < -1.2 && v < 2.2) || (v < -0.8 && u < 1.2)) c = WOODD;      // short hair: top, back, a fringe
    if (c === WOODD && v < -3.2 && u > -1) c = WOOD;                                  // hair highlight
    if (c === SKIN && u < -2.2 && v > 2.2) c = PINKD;                                 // hood rim at the jaw
    pix(x, y, c);
  }
  const ep = (u, v) => { const x = Math.round(hx + u * ca - v * sa), y = Math.round(hy + u * sa + v * ca); return [x, y]; };
  const [e1x, e1y] = ep(1.2, 0.8), [e2x, e2y] = ep(3.4, 0.8);
  if (happy) { // eyes closed with joy, a open grin
    pix(e1x, e1y, INK); pix(e2x, e2y, INK); pix(e1x - 1, e1y + 1, INK); pix(e2x + 1, e2y + 1, INK);
    const [m1x, m1y] = ep(2.0, 3.0); rect(m1x, m1y, 3, 1, INK); pix(m1x + 1, m1y + 1, PINK);
    const [c1x, c1y] = ep(0.2, 2.2); pix(c1x, c1y, PINK);
  } else {
    pix(e1x, e1y, INK); pix(e1x, e1y - 1, INK); pix(e2x, e2y, INK); pix(e2x, e2y - 1, INK);
    const [m1x, m1y] = ep(2.6, 3.0); pix(m1x, m1y, PINKD);
  }
  // headphones around the neck: yellow band, cyan cups hanging on the chest
  const bx = nk[0], by = nk[1] + 3;
  line(bx - 4, by, bx - 2, by + 2, (x, y) => pix(x, y, YEL)); line(bx - 2, by + 2, bx + 2, by + 2, (x, y) => pix(x, y, YEL)); line(bx + 2, by + 2, bx + 4, by, (x, y) => pix(x, y, YEL));
  line(bx - 3, by + 3, bx + 3, by + 3, (x, y) => pix(x, y, INK));
  for (const cx of [bx - 3, bx + 3]) { rect(cx - 1, by, 4, 5, INK); rect(cx, by + 1, 2, 3, YEL); pix(cx, by + 2, CYAN); }

  // near side
  leg(p.near, BLUE, CREAM);
  const hN = arm(p.near, PINK);
  hand(hN, p.celebrate > 0.5);
  // keys: a skin highlight and cuff
  if (p.celebrate > 0.5) { // action lines above the fist
    const f = Math.floor(t * 15) % 2;
    for (const dx of [-3, 0, 3]) { rect(hN[0] + dx, hN[1] - 5 - f * (dx === 0 ? 1 : 0), 1, 2, YEL); }
  }
  return { hN };
}

// ---- main ---------------------------------------------------------------------------------------------
export function render(ctx, t, w, h) {
  target();
  const p = pose(t), s = story(t);
  drawWall();
  drawWindow(t, s);
  drawClock(t);
  drawFloor();
  drawDeskShadows();
  drawDesk();
  drawLaptop(t, s);
  drawPlant(t, s);

  // rays burst from the laptop at the moment of shipping
  const age = s.shipAge;
  if (age >= 0 && age < 0.3) {
    const cx = 92, cy = 65;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.2, r1 = 17 + age * 70, r2 = r1 + 6 - age * 14;
      line(Math.round(cx + Math.cos(a) * r1), Math.round(cy + Math.sin(a) * r1), Math.round(cx + Math.cos(a) * r2), Math.round(cy + Math.sin(a) * r2), (x, y) => { if (get(x, y) !== INK) pix(x, y, i % 2 ? YEL : CREAM); });
    }
  }

  drawFootDust(t);
  // hard pixel shadow under the character: shrinks while the hop is in the air
  const pel = P(p.pelvis), air = Math.min(1, p.hop / 34);
  const rx = 9 - air * 3, ry = 1.7 - air * 0.5;
  for (let y = 102; y <= 106; y++) for (let x = pel[0] - 11; x <= pel[0] + 11; x++) {
    const dx = x - (pel[0] + 2), dy = y - 104; if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1 && y > 101) pix(x, y, INK);
  }
  drawChar(t, p, s);

  // confetti: 2x2 blocks that flip to 2x1 / 1x2 as they spin; fade out with a dither
  for (const q of particles(t)) {
    const x = Math.round(q.x / S), y = Math.round(q.y / S);
    const ph = Math.floor(((q.rot % (Math.PI * 2)) + Math.PI * 2) / (Math.PI / 2)) % 4;
    const bw = ph === 1 ? 2 : ph === 3 ? 1 : 2, bh = ph === 1 ? 1 : ph === 3 ? 2 : 2;
    const col = [PINK, YEL, CYAN, GRN][q.kind];
    for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) if (dith(x + i, y + j, q.alpha * 1.15)) pix(x + i, y + j, col);
  }

  // HUD
  const lines = Math.round(s.screen.typed * 6.4 > 0 ? Math.min(6, Math.floor(s.screen.typed * 6.4 + 0.001)) : 0);
  if (age < 0) text('LINES x0' + lines, 3, 3, CREAM, INK);
  else {
    const flash = age < 0.6 && Math.floor(age / 0.1) % 2 === 0;
    text('+1000 SHIPPED', 3, 3, flash ? PINK : YEL, INK);
  }
  const wl = 'WORLD 1-1'; text(wl, N - 3 - textWidth(wl), 3, CREAM, INK);
  // +1000 floats up off the laptop
  if (age >= 0.05 && age < 1.2) {
    const y = 52 - Math.min(14, Math.round((age - 0.05) * 26)), x = 92 - Math.floor(textWidth('+1000') / 2);
    if (age < 0.9 || Math.floor(age / 0.08) % 2 === 0) text('+1000', x, y, YEL, INK);
  }

  // composite: palette indices -> ImageData -> offscreen -> nearest-neighbour upscale (with a few frames of shake on the ship)
  for (let i = 0; i < N * N; i++) img32[i] = LUT[buf[i]];
  lctx.putImageData(img, 0, 0);
  let sx = 0, sy = 0;
  if (age >= 0 && age < 0.17) { const f = Math.floor(age * 30); sx = f % 2 ? 1 : -1; sy = f % 3 === 0 ? 1 : 0; }
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = PAL[0]; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(low, 0, 0, N, N, (sx * w) / N, (sy * h) / N, w, h);
  ctx.restore();
}
