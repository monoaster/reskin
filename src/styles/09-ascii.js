// 09 ascii: the whole scene is text on a CRT. A flat, class-coded silhouette of the scene is drawn into a tiny hidden
// canvas (one pixel per character cell), each cell becomes a glyph from a density ramp, coloured by what it belongs to,
// and the glyphs are blitted from a pre-rendered atlas. Phosphor bloom, scanlines, ghost grid and a curved glass on top.
import { W, H, LAYOUT, DIMS, pose, story, particles, util, rng } from '../rig.js';

const { clamp, lerp, smooth } = util;
const TAU = Math.PI * 2;

export const meta = { id: '09', slug: 'ascii', name: 'ASCII Terminal', tag: 'text only', accent: '#4dff7a' };

const N = 112;                         // grid is N x N cells
const TERM_ROW = 94;                   // rows from here down are the terminal strip
const RAMP = ' .:-=+*oxX#%@';          // density ramp, light to heavy
// colour table: index -> colour. Scene classes use indices 0..7, the terminal and confetti the rest.
const COL = ['#3d6fb5', '#23a04a', '#c07c2a', '#5ef0ff', '#37d36c', '#ffb000', '#dcffe6', '#9dffb4', '#4dff7a', '#27a050', '#d6ffe2', '#ffd23f', '#ff5f8f', '#5ef0ff', '#b6ff7a'];
const C = { sky: 0, floor: 1, desk: 2, cyan: 3, plant: 4, amber: 5, fig: 6, ship: 7, term: 8, termDim: 9, termHi: 10, conf: 11 };
const BG = '#030a05';
const FONT = 'ui-monospace, Menlo, Monaco, Consolas, monospace';

// ---- small canvases -----------------------------------------------------------------------------------------
const mk = (w, h) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }));

// ---- the silhouette canvas and its two arrays (class, luminance) -------------------------------------------------
let scratch = null, SG = null;
const CLS = new Uint8Array(N * N), LUM = new Float32Array(N * N);
const BG_CLS = new Uint8Array(N * N), BG_LUM = new Float32Array(N * N);
let bgReady = false;
const g8 = (l) => { const v = Math.round(clamp(l) * 255); return `rgb(${v},${v},${v})`; };

// Draw one object class with fn, in greys (grey = brightness), and merge it over what is already in the arrays.
function layer(cls, fn, cA = CLS, cL = LUM) {
  if (!scratch) { scratch = mk(N, N); SG = scratch.getContext('2d', { willReadFrequently: true }); }
  SG.setTransform(1, 0, 0, 1, 0, 0); SG.clearRect(0, 0, N, N);
  SG.setTransform(N / W, 0, 0, N / W, 0, 0);
  SG.lineCap = 'round'; SG.lineJoin = 'round';
  fn(SG);
  const d = SG.getImageData(0, 0, N, N).data;
  for (let i = 0, j = 0; i < N * N; i++, j += 4) {
    const a = d[j + 3];
    if (a > 45) { cA[i] = cls + 1; cL[i] = (d[j] / 255) * Math.sqrt(a / 255); }
  }
}
const poly = (g, pts) => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); };
const limb = (g, a, b, w, l) => { g.strokeStyle = g8(l); g.lineWidth = w; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); };
const cellPx = W / N;

function buildBG() {
  const wn = LAYOUT.window, cl = LAYOUT.clock, D = LAYOUT.desk;
  const r = rng(9);
  layer(C.sky, (g) => {
    const gr = g.createLinearGradient(0, wn.y, 0, wn.y + wn.h); gr.addColorStop(0, g8(0.04)); gr.addColorStop(1, g8(0.2));
    g.fillStyle = gr; g.fillRect(wn.x, wn.y, wn.w, wn.h);
    // stars: one cell each
    for (let i = 0; i < 16; i++) { const x = wn.x + 20 + r() * (wn.w - 40), y = wn.y + 14 + r() * 170; g.fillStyle = g8(0.55); g.fillRect(Math.floor(x / cellPx) * cellPx, Math.floor(y / cellPx) * cellPx, cellPx, cellPx); }
    g.fillStyle = g8(1); g.beginPath(); g.arc(276, 224, 35, 0, TAU); g.fill();
    g.fillStyle = g8(0.55); g.beginPath(); g.arc(268, 214, 7, 0, TAU); g.fill();
    // city
    let x = wn.x, i = 0;
    while (x < wn.x + wn.w - 4) { const bw = 30 + r() * 24, bh = 60 + r() * 120; g.fillStyle = g8(0.5); g.fillRect(x, wn.y + wn.h - bh, Math.min(bw, wn.x + wn.w - x), bh); x += bw + 4; i++; }
    x = wn.x + 10;
    while (x < wn.x + wn.w - 8) { const bw = 34 + r() * 22, bh = 30 + r() * 70; g.fillStyle = g8(0.78); g.fillRect(x, wn.y + wn.h - bh, Math.min(bw, wn.x + wn.w - x), bh); x += bw + 12; }
    for (let i2 = 0; i2 < 20; i2++) { const lx = wn.x + 12 + r() * (wn.w - 24), ly = wn.y + wn.h - 14 - r() * 80; g.fillStyle = g8(0.28); g.fillRect(Math.floor(lx / cellPx) * cellPx, Math.floor(ly / cellPx) * cellPx, cellPx, cellPx); }
    // frame, mullions, sill
    g.strokeStyle = g8(0.7); g.lineWidth = 16; g.strokeRect(wn.x - 6, wn.y - 6, wn.w + 12, wn.h + 12);
    g.fillStyle = g8(0.66); g.fillRect(wn.x + wn.w / 2 - 6, wn.y, 12, wn.h); g.fillRect(wn.x, wn.y + 150, wn.w, 12);
    g.fillStyle = g8(0.82); g.fillRect(wn.x - 30, wn.y + wn.h + 8, wn.w + 60, 20);
    // poster
    const px = 650, py = 150;
    g.fillStyle = g8(0.2); g.fillRect(px, py, 150, 182);
    g.fillStyle = g8(0.95); g.beginPath(); g.arc(px + 96, py + 62, 22, 0, TAU); g.fill();
    g.fillStyle = g8(0.5); poly(g, [[px, py + 182], [px, py + 112], [px + 44, py + 78], [px + 86, py + 120], [px + 112, py + 98], [px + 150, py + 126], [px + 150, py + 182]]); g.fill();
    g.fillStyle = g8(0.34); poly(g, [[px, py + 182], [px, py + 142], [px + 60, py + 124], [px + 100, py + 146], [px + 150, py + 132], [px + 150, py + 182]]); g.fill();
    g.strokeStyle = g8(0.72); g.lineWidth = 12; g.strokeRect(px, py, 150, 182);
    // clock
    g.fillStyle = g8(0.12); g.beginPath(); g.arc(cl.x, cl.y, cl.r, 0, TAU); g.fill();
    g.strokeStyle = g8(0.85); g.lineWidth = 9; g.beginPath(); g.arc(cl.x, cl.y, cl.r, 0, TAU); g.stroke();
  }, BG_CLS, BG_LUM);
  layer(C.floor, (g) => {
    g.fillStyle = g8(0.9); g.fillRect(0, 786, W, 14);
    g.fillStyle = g8(0.3); g.fillRect(0, 800, W, 36);
    g.fillStyle = g8(0.55); g.fillRect(0, 813, W, 4); g.fillRect(0, 828, W, 4);
    g.fillStyle = g8(0.5); for (const x of [120, 340, 610, 800, 930]) g.fillRect(x, 800, 4, 14);
  }, BG_CLS, BG_LUM);
  layer(C.desk, (g) => {
    g.fillStyle = g8(0.45); g.fillRect(D.x + 14, D.y + 30, 16, 160); g.fillRect(D.x + D.w - 30, D.y + 30, 16, 160);
    g.fillStyle = g8(0.4); g.fillRect(D.x + 40, D.y + 38, 160, 142);
    g.fillStyle = g8(0.62); g.fillRect(D.x + 52, D.y + 50, 136, 52); g.fillRect(D.x + 52, D.y + 112, 136, 52);
    g.fillStyle = g8(1); g.fillRect(D.x + 116, D.y + 72, 14, 12); g.fillRect(D.x + 116, D.y + 134, 14, 12);
    g.fillStyle = g8(0.45); g.fillRect(D.x + 4, D.y + 14, D.w - 8, 20);
    g.fillStyle = g8(0.95); g.fillRect(D.x - 6, D.y, D.w + 12, 24);
    // books and mug
    const bx = D.x + D.w - 108;
    g.fillStyle = g8(0.55); g.fillRect(bx, D.y - 20, 92, 20);
    g.fillStyle = g8(0.85); g.fillRect(bx + 8, D.y - 40, 78, 20);
    g.fillStyle = g8(0.6); g.fillRect(bx + 2, D.y - 58, 70, 18);
    g.fillStyle = g8(1); g.fillRect(bx + 20, D.y - 90, 34, 32); g.fillRect(bx + 52, D.y - 82, 10, 14);
    // pot
    const pl = LAYOUT.plant;
    g.fillStyle = g8(0.65); poly(g, [[pl.x - 38, pl.y - 66], [pl.x + 38, pl.y - 66], [pl.x + 29, pl.y], [pl.x - 29, pl.y]]); g.fill();
    g.fillStyle = g8(1); g.fillRect(pl.x - 44, pl.y - 74, 88, 16);
  }, BG_CLS, BG_LUM);
  bgReady = true;
}

// ---- the per-frame scene: dynamic classes merged over the cached background -------------------------------------------
function buildScene(t) {
  if (!bgReady) buildBG();
  CLS.set(BG_CLS); LUM.set(BG_LUM);
  const p = pose(t), st = story(t), sc = st.screen, S = LAYOUT.laptop.screen, L = LAYOUT.laptop;
  const age = t - 2.8;

  // laptop: lid, screen with code rows, keyboard; the clock hands share its cyan
  layer(C.cyan, (g) => {
    g.fillStyle = g8(0.85); g.fillRect(S.x - 10, S.y - 10, S.w + 20, S.h + 18);
    g.fillStyle = g8(0.02 + 0.2 * sc.awake); g.fillRect(S.x, S.y, S.w, S.h);
    for (let i = 0; i < sc.rows.length; i++) {
      const row = sc.rows[i]; if (row.len <= 0.001) continue;
      g.fillStyle = g8(0.95); g.fillRect(S.x + 14 + row.indent * 160, S.y + 16 + i * 22, Math.max(6, row.w * 170 * row.len), 11);
    }
    g.fillStyle = g8(0.62); g.fillRect(L.base.x, L.base.y, L.base.w, L.base.h + 2);
    if (p.tap > 0.2) { g.fillStyle = g8(1); g.fillRect(L.base.x + 44, L.base.y - 2, 22, 5); }
    const cl = LAYOUT.clock, min = -2.0 * Math.max(0, 1 - t / 2.8) - 0.02;
    g.strokeStyle = g8(1); g.lineWidth = 7; g.beginPath(); g.moveTo(cl.x, cl.y); g.lineTo(cl.x + Math.sin(-0.18) * 16, cl.y - Math.cos(-0.18) * 16); g.stroke();
    g.lineWidth = 5; g.beginPath(); g.moveTo(cl.x, cl.y); g.lineTo(cl.x + Math.sin(min) * 25, cl.y - Math.cos(min) * 25); g.stroke();
  });
  // ship: the screen wipes to a solid block, with a tick cut out of it
  if (sc.ship > 0.01) {
    layer(C.ship, (g) => {
      g.fillStyle = g8(1); g.fillRect(S.x - 4, S.y - 4, S.w + 8, (S.h + 8) * sc.ship);
      if (sc.ship > 0.95) { g.fillStyle = g8(0); poly(g, [[S.x + 62, S.y + 78], [S.x + 76, S.y + 64], [S.x + 92, S.y + 82], [S.x + 138, S.y + 30], [S.x + 152, S.y + 44], [S.x + 92, S.y + 112]]); g.fill(); }
    });
  }
  // plant leaves
  layer(C.plant, (g) => {
    const pl = LAYOUT.plant, top = pl.y - 60;
    [[-82, 96, 30], [-58, 132, 34], [-30, 158, 36], [-2, 172, 36], [26, 156, 36], [54, 134, 34], [80, 100, 30], [104, 66, 24]].forEach(([deg, len, wd], i) => {
      const wob = Math.sin(t * 2.6 + i * 1.7) * 0.03 + (age > 0 ? 0.2 * Math.exp(-age * 3.2) * Math.sin(age * 26 + i * 0.9) : 0);
      g.save(); g.translate(pl.x, top); g.rotate(((deg - 90) * Math.PI) / 180 + wob);
      g.fillStyle = g8(0.5 + 0.1 * (i % 3)); poly(g, [[0, 0], [len * 0.3, -wd * 0.7], [len * 0.7, -wd * 0.55], [len, 0], [len * 0.7, wd * 0.55], [len * 0.3, wd * 0.7]]); g.fill();
      g.strokeStyle = g8(0.95); g.lineWidth = 5; g.beginPath(); g.moveTo(6, 0); g.lineTo(len * 0.85, 0); g.stroke();
      g.restore();
    });
  });

  // the figure, far side first
  const far = p.far, near = p.near;
  layer(C.amber, (g) => { limb(g, far.shoulder, far.elbow, 26, 0.45); limb(g, far.elbow, far.hand, 22, 0.45); });
  layer(C.fig, (g) => { limb(g, far.hand, far.hand, 22, 0.55); });
  const leg = (s, lum) => (g) => {
    limb(g, s.hip, s.knee, 30, lum); limb(g, s.knee, s.ankle, 24, lum);
    const sa = Math.atan2(s.toe.y - s.ankle.y - 12, s.toe.x - s.ankle.x);
    g.save(); g.translate(s.ankle.x, s.ankle.y); g.rotate(sa); g.fillStyle = g8(1);
    poly(g, [[-17, -3], [-12, -12], [7, -13], [11, -4], [25, 0], [41, 5], [48, 10], [47, 13], [-17, 13]]); g.fill(); g.restore();
  };
  layer(C.fig, leg(far, 0.42));
  layer(C.fig, leg(near, 0.62));
  // hoodie
  const aT = Math.atan2(p.neck.y - p.pelvis.y, p.neck.x - p.pelvis.x), TL = DIMS.torso;
  layer(C.amber, (g) => {
    g.save(); g.translate(p.pelvis.x, p.pelvis.y); g.rotate(aT);
    const gr = g.createLinearGradient(0, -34, 0, 36); gr.addColorStop(0, g8(0.52)); gr.addColorStop(1, g8(0.9));
    g.fillStyle = gr; poly(g, [[-15, -31], [30, -33], [80, -30], [110, -26], [126, -17], [129, 0], [126, 17], [110, 28], [80, 32], [34, 34], [-15, 35]]); g.fill();
    g.fillStyle = g8(0.4); g.fillRect(-15, -31, 15, 66);
    g.fillStyle = g8(0.34); poly(g, [[6, 7], [46, 5], [52, 29], [6, 31]]); g.fill();
    g.fillStyle = g8(0.36); g.beginPath(); g.ellipse(TL - 4, -9, 17, 28, 0, 0, TAU); g.fill();
    g.restore();
  });
  // headphones round the neck
  layer(C.cyan, (g) => {
    g.save(); g.translate(p.pelvis.x, p.pelvis.y); g.rotate(aT);
    g.strokeStyle = g8(0.85); g.lineWidth = 11; g.beginPath(); g.ellipse(TL - 2, 1, 12, 28, 0, 0, TAU); g.stroke();
    g.fillStyle = g8(1); g.fillRect(TL - 48, 8, 40, 32);
    g.restore();
  });
  // head: face, nose tab, short hair, an eye
  const hd = p.head;
  layer(C.fig, (g) => {
    g.save(); g.translate(hd.x, hd.y); g.rotate(hd.angle);
    g.fillStyle = g8(0.48); poly(g, [[0, -38], [27, -27], [37, -9], [40, -3], [47, 7], [39, 12], [36, 24], [20, 36], [0, 40], [-24, 30], [-38, 0], [-26, -28]]); g.fill();
    g.fillStyle = g8(1); g.beginPath(); g.arc(0, 0, 43, Math.PI * 0.86, Math.PI * 1.9); g.lineTo(34, -14); g.lineTo(18, -18); g.lineTo(2, -12); g.lineTo(-16, -18); g.lineTo(-34, 4); g.closePath(); g.fill();
    g.fillStyle = g8(0.0); g.beginPath(); g.arc(19, -1, 7, 0, TAU); g.fill();
    g.restore();
  });
  // near arm over everything
  layer(C.amber, (g) => { limb(g, near.shoulder, near.elbow, 28, 0.92); limb(g, near.elbow, near.hand, 23, 0.82); });
  layer(C.fig, (g) => { g.fillStyle = g8(1); g.beginPath(); g.arc(near.hand.x, near.hand.y, 14, 0, TAU); g.fill(); });
}

// ---- glyph atlas, once per size ---------------------------------------------------------------------------------
const atlases = new Map();
function getAtlas(cell) {
  const T = Math.max(10, Math.ceil(cell * 1.7));
  let a = atlases.get(T);
  if (a) return a;
  const cv = mk(95 * T, COL.length * T), g = cv.getContext('2d');
  g.textBaseline = 'alphabetic';
  let adv = 0.6 * T;
  for (let c = 0; c < COL.length; c++) {
    g.font = `${c >= C.term && c < C.conf ? '' : 'bold '}${Math.round(T * 0.98)}px ${FONT}`;
    adv = g.measureText('M').width || T * 0.6;
    g.fillStyle = COL[c];
    for (let ch = 32; ch < 127; ch++) {
      g.save(); g.beginPath(); g.rect((ch - 32) * T, c * T, T, T); g.clip();
      g.translate((ch - 32) * T, c * T); g.scale((T * 0.94) / adv, 1);
      g.fillText(String.fromCharCode(ch), T * 0.03 / ((T * 0.94) / adv), T * 0.8);
      g.restore();
    }
  }
  a = { cv, T };
  atlases.set(T, a);
  return a;
}

// ---- cached overlays: ghost grid, scanlines, vignette + glass ---------------------------------------------------------
const overlays = new Map();
function getOverlays(w) {
  let o = overlays.get(w);
  if (o) return o;
  const cell = w / N;
  const ghost = mk(w, w), gg = ghost.getContext('2d');
  gg.fillStyle = 'rgba(60,200,100,0.17)';
  const dot = Math.max(1, cell * 0.13);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) gg.fillRect(i * cell + cell * 0.5 - dot / 2, j * cell + cell * 0.55 - dot / 2, dot, dot);
  const scan = mk(w, w), sg = scan.getContext('2d');
  const pitch = Math.max(2, cell / 3);
  sg.fillStyle = 'rgba(0,0,0,0.24)';
  for (let y = 0; y < w; y += pitch) sg.fillRect(0, y + pitch * 0.55, w, pitch * 0.45);
  const glass = mk(w, w), gl = glass.getContext('2d');
  const rv = gl.createRadialGradient(w / 2, w / 2, w * 0.28, w / 2, w / 2, w * 0.78);
  rv.addColorStop(0, 'rgba(0,0,0,0)'); rv.addColorStop(0.7, 'rgba(0,0,0,0.28)'); rv.addColorStop(1, 'rgba(0,0,0,0.72)');
  gl.fillStyle = rv; gl.fillRect(0, 0, w, w);
  const gl2 = gl.createRadialGradient(w * 0.28, w * 0.18, 0, w * 0.28, w * 0.18, w * 0.5);
  gl2.addColorStop(0, 'rgba(200,255,220,0.07)'); gl2.addColorStop(1, 'rgba(200,255,220,0)');
  gl.fillStyle = gl2; gl.fillRect(0, 0, w, w);
  // rounded screen corners cut into the bezel
  const rad = w * 0.075; gl.fillStyle = '#010302'; gl.beginPath(); gl.rect(0, 0, w, w);
  gl.moveTo(rad, 0); gl.arcTo(w, 0, w, rad, rad); gl.arcTo(w, w, w - rad, w, rad); gl.arcTo(0, w, 0, w - rad, rad); gl.arcTo(0, 0, rad, 0, rad); gl.closePath(); gl.fill('evenodd');
  o = { ghost, scan, glass };
  overlays.set(w, o);
  return o;
}

// work canvases, fully overwritten each frame
const work = new Map();
function getWork(w) {
  let o = work.get(w);
  if (o) return o;
  const s1 = Math.max(8, Math.round(w / 3)), s2 = Math.max(4, Math.round(w / 9));
  o = { tx: mk(w, w), small1: mk(s1, s1), small2: mk(s2, s2), sc: mk(w, w), tmp: mk(w, w), s1, s2 };
  work.set(w, o);
  return o;
}

// ---- text grid -----------------------------------------------------------------------------------------------------
const CH = new Uint8Array(N * N), CC = new Uint8Array(N * N), CA = new Uint8Array(N * N);
function put(col, row, s, color, alpha = 255) {
  for (let i = 0; i < s.length; i++) {
    const c = col + i; if (c < 0 || c >= N || row < 0 || row >= N) continue;
    const k = row * N + c; CH[k] = s.charCodeAt(i); CC[k] = color; CA[k] = alpha;
  }
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function sceneToText() {
  for (let row = 0; row < TERM_ROW; row++) for (let col = 0; col < N; col++) {
    const k = row * N + col, c = CLS[k];
    if (!c) { CH[k] = 32; continue; }
    const l = clamp(LUM[k] + (BAYER[(row & 3) * 4 + (col & 3)] / 16 - 0.47) * 0.1);
    const ci = c - 1;
    let ch;
    if (ci === C.ship) ch = l > 0.5 ? 35 : 32;
    else ch = RAMP.charCodeAt(Math.min(RAMP.length - 1, Math.round(Math.pow(l, 0.85) * (RAMP.length - 1))));
    CH[k] = ch; CC[k] = ci; CA[k] = 255;
  }
}

// a 5x7 block font for the banner (only the letters we need)
const FONT5 = {
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
};
function banner(age, t) {
  const word = 'SHIPPED', sc = 2, gap = 1;
  const bw = (word.length * 5 + (word.length - 1) * gap) * sc, bh = 7 * sc;
  const boxW = bw + 10, boxH = bh + 6;
  const e = clamp((age - 0.04) / 0.3), ease = 1 - Math.pow(1 - e, 3);
  const x0 = Math.round((N - boxW) / 2 + (1 - ease) * (N - (N - boxW) / 2)), y0 = 16;
  const lit = age < 0.9 && Math.floor(age * 12) % 2 === 1 ? C.termHi : C.ship;
  for (let j = 0; j < boxH; j++) for (let i = 0; i < boxW; i++) {
    const c = x0 + i, r = y0 + j; if (c < 0 || c >= N) continue;
    const k = r * N + c; const edge = i === 0 || j === 0 || i === boxW - 1 || j === boxH - 1;
    CH[k] = edge ? ((i === 0 || i === boxW - 1) && j > 0 && j < boxH - 1 ? 124 : (i === 0 || i === boxW - 1 ? 43 : 61)) : 32; CC[k] = edge ? C.termHi : C.term; CA[k] = 255;
  }
  const letter = (ch, ox, oy, glyph, color) => {
    const f = FONT5[ch];
    for (let ry = 0; ry < 7; ry++) for (let rx = 0; rx < 5; rx++) if (f[ry][rx] === '#') for (let dy = 0; dy < sc; dy++) for (let dx = 0; dx < sc; dx++) {
      const c = ox + rx * sc + dx, r = oy + ry * sc + dy; if (c < 0 || c >= N || r < 0 || r >= N) continue;
      const k = r * N + c; CH[k] = glyph; CC[k] = color; CA[k] = 255;
    }
  };
  for (const pass of [0, 1]) for (let i = 0; i < word.length; i++) {
    const ox = x0 + 5 + i * (5 + gap) * sc + (pass === 0 ? 1 : 0), oy = y0 + 3 + (pass === 0 ? 1 : 0);
    letter(word[i], ox, oy, pass === 0 ? 37 : 35, pass === 0 ? C.termDim : lit);
  }
}

function terminal(t) {
  const left = 4, right = N - 5, R = 15;
  put(left, TERM_ROW, '- terminal ' + '-'.repeat(right - left - 11), C.termDim);
  const st = story(t), lines = [['reskin tty0  ready', C.termDim]];
  for (let n = 1; n <= 5; n++) if (t >= n * 0.4 + 0.02) lines.push([`[${(n * 0.4).toFixed(1)}s] footfall ${n}   x=${String(Math.round(pose(n * 0.4).pelvis.x)).padStart(3, '0')}`, C.term]);
  if (t >= 2.0) lines.push(['$ ' + 'ship --now'.slice(0, Math.floor((t - 2.0) * 26)), C.termHi]);
  st.screen.chars.forEach((c) => { if (c) lines.push(['  | ' + c, C.termDim]); });
  if (t >= 2.8) { lines.push(['build ok - 42 passed, 0 failed', C.termHi]); lines.push(['status: SHIPPED  >> deployed', C.termHi]); lines.push(['$ ', C.termHi]); }
  const show = lines.slice(-R);
  show.forEach(([s, c], i) => put(left, TERM_ROW + 1 + i, s, c));
  // blinking block cursor after the last line
  if (Math.floor(t * 5) % 2 === 0) { const last = show.length - 1; put(left + show[last][0].length, TERM_ROW + 1 + last, '#', C.termHi); }
  // header line
  put(left, 3, 'ASCII TERMINAL  tty0', C.termDim);
  const clk = `t=${t.toFixed(2)}s  beat ${Math.min(8, Math.floor(t / 0.4) + 1)}`;
  put(right - clk.length + 1, 3, clk, C.termDim);
}

function confetti(t) {
  const chars = '*+ox';
  for (const q of particles(t)) {
    const col = Math.floor((q.x / W) * N), row = Math.floor((q.y / H) * N);
    if (col < 0 || col >= N || row < 0 || row >= TERM_ROW - 1) continue;
    const k = row * N + col; CH[k] = chars.charCodeAt(q.kind); CC[k] = C.conf + (q.i % 4); CA[k] = Math.round(255 * clamp(q.alpha * 1.1));
  }
}

// barrel warp in two passes of thin slices: gives the glass its curve
function warp(dst, src, w, vertical, amt) {
  const sl = Math.max(2, Math.round(w / 300)), c = w / 2;
  const f = (u) => u * (1 - amt * 0.6 * u * u);
  for (let s = 0; s < w; s += sl) {
    const u0 = (s - c) / c, u1 = (s + sl - c) / c, um = (u0 + u1) / 2;
    const k = 1 - amt * um * um, a = c + c * f(u0), b = c + c * f(u1), hh = w * k, o = c - hh / 2;
    if (vertical) dst.drawImage(src, s, 0, sl, w, a, o, Math.max(0.5, b - a) + 0.6, hh);
    else dst.drawImage(src, 0, s, w, sl, o, a, hh, Math.max(0.5, b - a) + 0.6);
  }
}

export function render(ctx, t, w, h) {
  const cell = w / N, wi = Math.round(w);
  const age = t - 2.8;
  buildScene(t);
  CH.fill(32); CA.fill(255);
  sceneToText();
  terminal(t);
  if (age >= 0.05) banner(age, t);
  confetti(t);

  const A = getAtlas(cell), O = getOverlays(wi), Wk = getWork(wi);
  // text layer
  const tg = Wk.tx.getContext('2d');
  tg.setTransform(1, 0, 0, 1, 0, 0); tg.globalCompositeOperation = 'source-over'; tg.globalAlpha = 1; tg.clearRect(0, 0, wi, wi);
  tg.imageSmoothingEnabled = true; tg.imageSmoothingQuality = 'high';
  for (let row = 0; row < N; row++) for (let col = 0; col < N; col++) {
    const k = row * N + col, ch = CH[k];
    if (ch <= 32) continue;
    const a = CA[k]; if (a !== 255) tg.globalAlpha = a / 255;
    tg.drawImage(A.cv, (ch - 32) * A.T, CC[k] * A.T, A.T, A.T, col * cell, row * cell, cell + 0.4, cell + 0.4);
    if (a !== 255) tg.globalAlpha = 1;
  }
  // bloom: blur the text by shrinking it twice and stretching it back underneath
  const s1 = Wk.small1.getContext('2d'), s2 = Wk.small2.getContext('2d');
  s1.clearRect(0, 0, Wk.s1, Wk.s1); s1.drawImage(Wk.tx, 0, 0, Wk.s1, Wk.s1);
  s2.clearRect(0, 0, Wk.s2, Wk.s2); s2.drawImage(Wk.small1, 0, 0, Wk.s2, Wk.s2);
  const sg = Wk.sc.getContext('2d');
  sg.setTransform(1, 0, 0, 1, 0, 0); sg.globalCompositeOperation = 'source-over'; sg.globalAlpha = 1;
  sg.fillStyle = BG; sg.fillRect(0, 0, wi, wi);
  sg.drawImage(O.ghost, 0, 0);
  const flash = age >= 0 && age < 0.35 ? 1 - age / 0.35 : 0;
  sg.globalCompositeOperation = 'lighter';
  sg.globalAlpha = 0.5 + 0.7 * flash; sg.drawImage(Wk.small2, 0, 0, wi, wi);
  sg.globalAlpha = 0.3 + 0.3 * flash; sg.drawImage(Wk.small1, 0, 0, wi, wi);
  sg.globalCompositeOperation = 'source-over'; sg.globalAlpha = 1;
  sg.drawImage(Wk.tx, 0, 0);
  sg.globalCompositeOperation = 'lighter'; sg.globalAlpha = 0.12; sg.drawImage(Wk.tx, 0, 0);
  sg.globalCompositeOperation = 'source-over'; sg.globalAlpha = 1;
  if (flash > 0) { sg.fillStyle = `rgba(120,255,160,${0.3 * flash})`; sg.globalCompositeOperation = 'lighter'; sg.fillRect(0, 0, wi, wi); sg.globalCompositeOperation = 'source-over'; }
  // scanlines and a slow rolling band
  sg.drawImage(O.scan, 0, 0);
  const by = ((t * 0.35) % 1.3 - 0.15) * wi, band = sg.createLinearGradient(0, by - wi * 0.08, 0, by + wi * 0.08);
  band.addColorStop(0, 'rgba(120,255,160,0)'); band.addColorStop(0.5, 'rgba(120,255,160,0.045)'); band.addColorStop(1, 'rgba(120,255,160,0)');
  sg.fillStyle = band; sg.fillRect(0, by - wi * 0.08, wi, wi * 0.16);
  // glass curve: two thin-slice passes into the output
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  const tm = Wk.tmp.getContext('2d');
  tm.setTransform(1, 0, 0, 1, 0, 0); tm.fillStyle = '#010302'; tm.fillRect(0, 0, wi, wi);
  warp(tm, Wk.sc, wi, true, 0.055);
  ctx.fillStyle = '#010302'; ctx.fillRect(0, 0, w, h);
  warp(ctx, Wk.tmp, wi, false, 0.055);
  ctx.drawImage(O.glass, 0, 0, w, h);
  ctx.restore();
}
