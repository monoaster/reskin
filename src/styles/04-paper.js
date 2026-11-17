// 04 paper: a shadow box of layered craft paper. Every object is a flat sheet with a hand-cut (deckled) edge
// and a soft drop shadow whose size grows with how close the sheet is to the viewer. The character is a pinned
// puppet: rigid paper pieces turning on brass brads, animated on twos (12 fps). Confetti and the screen run smooth.
import { W, H, LAYOUT, DIMS, pose, story, particles, util, rng } from '../rig.js';

const { clamp, lerp, smooth } = util;
const TAU = Math.PI * 2;

export const meta = { id: '04', slug: 'paper', name: 'Paper Cut-Out', tag: 'pinned puppets', accent: '#ee6b56' };

// ---- palette: six main papers plus a few tints --------------------------------------------------------------
const C = {
  cream: '#f4e7cb', creamD: '#ead8b3', creamS: '#fff7e2',
  kraft: '#cf9f64', kraftD: '#b3844c', kraftDD: '#8f6538',
  coral: '#ee6b56', coralD: '#d0503f', coralL: '#f68f7a',
  teal: '#2f9a95', tealD: '#237a78', tealL: '#47b5ae',
  mustard: '#eab13e', mustardD: '#c98f2b', mustardL: '#f7cc68',
  navy: '#1f2a52', navyM: '#2a3868', navyL: '#3b4e92', navyD: '#121936',
  ink: '#2d2b36', hair: '#3a2a2e', peach: '#f3c29b', peachD: '#d99f78',
  denim: '#3c5d97', denimD: '#2d4878', denimL: '#7497cc', green: '#3db36d', greenL: '#66d093',
};

// ---- hand-cut geometry --------------------------------------------------------------------------------------
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const geo = new Map();
// Subdivide every edge into short pieces and push each vertex sideways a little: a deckled, scissor-cut outline.
// Seeded by the object's key, cached, so the same object always has the same edge.
function cut(key, build, amp = 1.2, step = 10) {
  let g = geo.get(key);
  if (g) return g;
  const r = rng(hash(key));
  const base = build();
  const multi = Array.isArray(base[0][0]);
  const one = (pts) => {
    const out = [], n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
      const m = Math.max(1, Math.round(len / step));
      const nx = -dy / len, ny = dx / len;
      for (let j = 0; j < m; j++) {
        const f = j / m, jit = (r() - 0.5) * 2 * amp, al = (r() - 0.5) * amp * 0.8;
        out.push([a[0] + dx * f + nx * jit + (dx / len) * al, a[1] + dy * f + ny * jit + (dy / len) * al]);
      }
    }
    return out;
  };
  g = multi ? base.map(one) : one(base);
  geo.set(key, g);
  return g;
}
const ell = (cx, cy, rx, ry, n = 28, a0 = 0) => { const o = []; for (let i = 0; i < n; i++) { const a = a0 + (i / n) * TAU; o.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } return o; };
const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const rrect = (x, y, w, h, r, n = 4) => {
  const o = [];
  const arc = (cx, cy, a0) => { for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * Math.PI / 2; o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
  arc(x + w - r, y + r, -Math.PI / 2); arc(x + w - r, y + h - r, 0); arc(x + r, y + h - r, Math.PI / 2); arc(x + r, y + r, Math.PI);
  return o;
};
const capsule = (L, w0, w1) => {
  const o = [], r0 = w0 / 2, r1 = w1 / 2;
  o.push([0, -r0], [L, -r1]);
  for (let i = 1; i < 8; i++) { const a = -Math.PI / 2 + (i / 8) * Math.PI; o.push([L + Math.cos(a) * r1, Math.sin(a) * r1]); }
  o.push([L, r1], [0, r0]);
  for (let i = 1; i < 8; i++) { const a = Math.PI / 2 + (i / 8) * Math.PI; o.push([Math.cos(a) * r0, Math.sin(a) * r0]); }
  return o;
};
const star = (cx, cy, ro, ri, n) => { const o = []; for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + (i / (n * 2)) * TAU, r = i % 2 ? ri : ro; o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return o; };
const polyline = (p) => p.map((q) => [q[0], q[1]]);

// ---- drawing a sheet of paper ---------------------------------------------------------------------------------
// d is the sheet's height above what is under it. Bigger d: longer, softer, slightly darker shadow. Light is top left.
function shade(g, k, d, a = 0.34) {
  g.shadowColor = `rgba(56,30,14,${Math.min(0.55, a + d * 0.004)})`;
  g.shadowOffsetX = d * 0.55 * k; g.shadowOffsetY = d * 0.85 * k; g.shadowBlur = d * 1.5 * k;
}
const noShade = (g) => { g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetX = 0; g.shadowOffsetY = 0; };
function trace(g, pts) {
  const contours = Array.isArray(pts[0][0]) ? pts : [pts];
  g.beginPath();
  for (const c of contours) { g.moveTo(c[0][0], c[0][1]); for (let i = 1; i < c.length; i++) g.lineTo(c[i][0], c[i][1]); g.closePath(); }
}
function sheet(g, k, pts, fill, d, edge = 0.26) {
  trace(g, pts);
  g.fillStyle = fill;
  if (d > 0) shade(g, k, d);
  g.fill('evenodd');
  noShade(g);
  if (edge) { g.strokeStyle = `rgba(255,250,232,${edge})`; g.lineWidth = 1.25; g.stroke(); }
}
function piece(g, k, x, y, a, pts, fill, d, sx = 1, sy = 1) {
  g.save(); g.translate(x, y); g.rotate(a); if (sx !== 1 || sy !== 1) g.scale(sx, sy);
  sheet(g, k, pts, fill, d);
  g.restore();
}
function brad(g, k, x, y, r = 6) {
  shade(g, k, 4, 0.4);
  g.fillStyle = '#b3862b'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  noShade(g);
  g.fillStyle = '#e4ba50'; g.beginPath(); g.arc(x, y, r * 0.72, 0, TAU); g.fill();
  g.fillStyle = '#fff1b8'; g.beginPath(); g.arc(x - r * 0.26, y - r * 0.3, r * 0.27, 0, TAU); g.fill();
}
const ang = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
const spring = (a) => (a <= 0 ? 0 : 1 - Math.exp(-9 * a) * Math.cos(17 * a));

// ---- offscreen caches (keyed by size only, so output never depends on call order) ------------------------------
const mk = (w, h) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }));
const caches = new Map();
function cached(name, w, build) {
  const key = name + w;
  let c = caches.get(key);
  if (!c) { c = mk(w, w); const g = c.getContext('2d'); g.scale(w / W, w / W); build(g, w / W); caches.set(key, c); }
  return c;
}

// Fine paper fibre: noise, soft blotches and short fibres on a mid grey sheet, laid over the frame in soft-light.
const grains = new Map();
function getGrain(w) {
  let c = grains.get(w);
  if (c) return c;
  c = mk(w, w);
  const g = c.getContext('2d'), r = rng(424242);
  const img = g.createImageData(w, w), d = img.data;
  for (let i = 0; i < w * w; i++) { const v = 128 + Math.round((r() + r() + r() - 1.5) * 30); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  const lo = mk(40, 40), lg = lo.getContext('2d'), li = lg.createImageData(40, 40);
  for (let i = 0; i < 1600; i++) { const v = 128 + Math.round((r() - 0.5) * 46); li.data[i * 4] = li.data[i * 4 + 1] = li.data[i * 4 + 2] = v; li.data[i * 4 + 3] = 255; }
  lg.putImageData(li, 0, 0);
  g.globalAlpha = 0.55; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(lo, 0, 0, w, w); g.globalAlpha = 1;
  g.lineCap = 'round';
  const s = w / 1000, n = Math.round((w * w) / 330);
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * w, a = r() * TAU, len = (6 + r() * 16) * s + 1.5, bend = (r() - 0.5) * len * 0.8;
    g.strokeStyle = r() < 0.5 ? `rgba(255,255,255,${0.14 + r() * 0.22})` : `rgba(50,32,18,${0.12 + r() * 0.2})`;
    g.lineWidth = Math.max(0.6, (0.5 + r() * 0.7) * s * 1.2);
    g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * len * 0.5 - Math.sin(a) * bend, y + Math.sin(a) * len * 0.5 + Math.cos(a) * bend, x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  grains.set(w, c);
  return c;
}

// ---- static layer 1: sky, wall, window, poster, bunting, floor ----------------------------------------------
function buildBG(g, k) {
  const wn = LAYOUT.window, cl = LAYOUT.clock;
  // floor base sheet (furthest of the lot), the wall will lie over its top edge
  sheet(g, k, cut('floorbase', () => rect(-20, 780, W + 40, 260), 1.6, 14), C.kraftD, 0, 0);

  // ---- the sky behind the window hole: navy sheet, a lighter band, two rows of paper city, stars, moon on a tab
  g.fillStyle = C.navy; g.fillRect(wn.x - 14, wn.y - 14, wn.w + 28, wn.h + 28);
  const r = rng(77);
  const band = []; band.push([wn.x - 14, 500]); for (let x = wn.x - 14; x <= wn.x + wn.w + 14; x += 26) band.push([x, 322 + Math.sin(x * 0.045) * 9]); band.push([wn.x + wn.w + 14, 500]);
  sheet(g, k, cut('skyband', () => band, 1.4, 12), C.navyM, 3, 0.08);
  for (let i = 0; i < 26; i++) {
    const x = wn.x + 12 + r() * (wn.w - 24), y = wn.y + 10 + r() * 190, big = r() < 0.3, s = big ? 5.5 + r() * 2 : 2.2 + r() * 1.8;
    const col = r() < 0.25 ? C.mustardL : C.creamS;
    sheet(g, k, cut('star' + i, () => (big ? star(x, y, s * 1.5, s * 0.5, 4) : ell(x, y, s * 0.7, s * 0.7, 8)), 0.35, 4), col, 1.6, 0);
  }
  // moon on a kraft tab hung from the top of the hole
  sheet(g, k, cut('moontab', () => rect(268, wn.y - 10, 16, 110 + 10), 0.8, 8), C.kraft, 3, 0.15);
  sheet(g, k, cut('moon', () => ell(276, 224, 35, 35, 30), 1.0, 7), C.creamS, 5);
  for (const [cx, cy, cr] of [[266, 214, 7], [288, 236, 5.5], [282, 208, 3.5], [262, 238, 4]]) sheet(g, k, cut('crater' + cx, () => ell(cx, cy, cr, cr, 12), 0.4, 4), '#e8d7ac', 0, 0);
  // city, back row then front row
  let x = wn.x - 10, i = 0;
  while (x < wn.x + wn.w) {
    const bw = 30 + r() * 24, bh = 70 + r() * 90, bx = x;
    sheet(g, k, cut('bb' + i, () => rect(bx, 482 - bh, bw, bh + 20), 0.9, 9), C.navyL, 3, 0.08);
    x += bw + 2 + r() * 6; i++;
  }
  x = wn.x - 18; i = 0;
  while (x < wn.x + wn.w) {
    const bw = 34 + r() * 26, bh = 36 + r() * 78, bx = x, by = 482 - bh;
    sheet(g, k, cut('fb' + i, () => rect(bx, by, bw, bh + 20), 0.9, 9), C.navyD, 5, 0.05);
    for (let wy = by + 10; wy < 462; wy += 15) for (let wx = bx + 7; wx < bx + bw - 8; wx += 12) {
      if (r() < 0.42) sheet(g, k, cut(`bw${i}_${wx}_${wy}`, () => rect(wx, wy, 6, 8), 0.3, 6), r() < 0.8 ? C.mustardL : C.creamS, 0, 0);
    }
    x += bw + 3 + r() * 8; i++;
  }

  // ---- the wall: one cream sheet with the window cut out of it; it shadows the sky through the hole
  const wall = cut('wall', () => rect(-30, -30, W + 60, 830), 1.6, 14);
  const hole = cut('hole', () => rect(wn.x, wn.y, wn.w, wn.h), 1.5, 9);
  g.beginPath();
  g.moveTo(wall[0][0], wall[0][1]); for (const p of wall) g.lineTo(p[0], p[1]); g.closePath();
  g.moveTo(hole[0][0], hole[0][1]); for (const p of hole) g.lineTo(p[0], p[1]); g.closePath();
  g.fillStyle = C.cream; shade(g, k, 9, 0.4); g.fill('evenodd'); noShade(g);
  // tone-on-tone paper dots punched in the wallpaper
  g.save(); g.clip('evenodd');
  g.fillStyle = C.creamD;
  for (let row = 0, y = 30; y < 800; y += 44, row++) for (let x2 = (row % 2) * 30 + 10; x2 < W; x2 += 60) { g.beginPath(); g.arc(x2, y, 4.2, 0, TAU); g.fill(); }
  g.restore();

  // window frame: teal strips laid over the hole edge, a cross of mullions and a sill
  const fo = cut('fo', () => [rect(wn.x - 16, wn.y - 16, wn.w + 32, wn.h + 32), rect(wn.x + 2, wn.y + 2, wn.w - 4, wn.h - 4)], 1.0, 10);
  sheet(g, k, fo, C.teal, 7);
  sheet(g, k, cut('mullV', () => rect(wn.x + wn.w / 2 - 6, wn.y, 12, wn.h), 0.7, 10), C.tealL, 5);
  sheet(g, k, cut('mullH', () => rect(wn.x, wn.y + 150, wn.w, 11), 0.7, 10), C.tealL, 5);
  sheet(g, k, cut('sill', () => rect(wn.x - 26, wn.y + wn.h + 6, wn.w + 52, 22), 1.0, 10), C.tealD, 11);

  // wall clock: navy ring, cream face, mustard dots (hands are drawn live)
  sheet(g, k, cut('clk0', () => ell(cl.x, cl.y, cl.r + 6, cl.r + 6, 34), 0.9, 6), C.navy, 8);
  sheet(g, k, cut('clk1', () => ell(cl.x, cl.y, cl.r - 3, cl.r - 3, 30), 0.7, 6), C.creamS, 2);
  for (let h = 0; h < 12; h++) { const a = (h / 12) * TAU - Math.PI / 2; sheet(g, k, cut('tick' + h, () => ell(cl.x + Math.cos(a) * 23, cl.y + Math.sin(a) * 23, h % 3 ? 2 : 3.2, h % 3 ? 2 : 3.2, 8), 0.2, 4), h % 3 ? C.mustard : C.coral, 0, 0); }

  // poster: a little paper landscape in a coral frame
  const px = 650, py = 150;
  sheet(g, k, cut('pf', () => rect(px, py, 150, 182), 1.0, 10), C.coral, 8);
  sheet(g, k, cut('pm', () => rect(px + 9, py + 9, 132, 164), 0.8, 10), C.creamS, 1, 0.1);
  sheet(g, k, cut('ps', () => rect(px + 19, py + 19, 112, 144), 0.7, 10), C.navy, 2, 0.1);
  sheet(g, k, cut('psun', () => ell(px + 92, py + 66, 21, 21, 22), 0.8, 6), C.mustard, 3);
  sheet(g, k, cut('ph1', () => polyline([[px + 19, py + 163], [px + 19, py + 108], [px + 50, py + 80], [px + 82, py + 112], [px + 108, py + 92], [px + 131, py + 118], [px + 131, py + 163]]), 0.8, 8), C.teal, 4);
  sheet(g, k, cut('ph2', () => polyline([[px + 19, py + 163], [px + 19, py + 136], [px + 58, py + 120], [px + 96, py + 140], [px + 131, py + 128], [px + 131, py + 163]]), 0.8, 8), C.coralD, 4);
  for (let i = 0; i < 6; i++) sheet(g, k, cut('pst' + i, () => ell(px + 30 + i * 17 + (i % 2) * 5, py + 34 + (i * 13) % 30, 1.7, 1.7, 6), 0.2, 3), C.creamS, 0, 0);

  // bunting: a string with paper flags, pinned off both sides of the box
  const sag = (x) => 44 + 48 * (1 - Math.pow((x - 500) / 520, 2));
  const str = []; for (let x = -20; x <= 1020; x += 20) str.push([x, sag(x)]);
  g.strokeStyle = C.kraftDD; g.lineWidth = 2.4; shade(g, k, 3, 0.3); g.beginPath(); g.moveTo(str[0][0], str[0][1]); for (const p of str) g.lineTo(p[0], p[1]); g.stroke(); noShade(g);
  const cols = [C.coral, C.mustard, C.teal, C.creamS, C.coralL, C.tealL];
  for (let i = 0, x = 46; x < 980; x += 54, i++) {
    const y = sag(x), sl = Math.atan2(sag(x + 5) - sag(x - 5), 10);
    piece(g, k, x, y, sl, cut('flag' + i, () => [[-21, -1], [21, -1], [0, 38]], 0.8, 8), cols[i % cols.length], 6);
  }

  // baseboard: a coral strip over the foot of the wall, then paper floor planks laid on the kraft sheet
  sheet(g, k, cut('base', () => rect(-20, 782, W + 40, 18), 1.0, 12), C.coral, 6);
  const planks = [[812, 50, C.kraft], [878, 58, '#c4955b'], [950, 90, C.kraft]];
  planks.forEach(([y, h, col], i) => sheet(g, k, cut('plank' + i, () => rect(-20, y, W + 40, h), 1.5, 14), col, 7, 0.2));
  // a rug of two paper ovals on the planks
  sheet(g, k, cut('rug0', () => ell(520, 888, 250, 34, 44), 1.4, 10), C.coralD, 5);
  sheet(g, k, cut('rug1', () => ell(520, 888, 226, 26, 44), 1.2, 10), C.creamS, 1, 0.1);
  sheet(g, k, cut('rug2', () => ell(520, 888, 190, 19, 44), 1.0, 10), C.teal, 2, 0.1);
  // plank seams
  g.strokeStyle = 'rgba(90,56,26,.22)'; g.lineWidth = 1.5;
  [[190, 812, 862], [620, 812, 862], [820, 878, 936], [330, 878, 936], [100, 950, 1010], [520, 950, 1010], [900, 950, 1010]].forEach(([x, y0, y1]) => { g.beginPath(); g.moveTo(x, y0 + 3); g.lineTo(x + 2, y1 - 3); g.stroke(); });
}

// ---- static layer 2: desk, cabinet, books and mug (in front of the starburst, behind the laptop) ---------------
function buildDesk(g, k) {
  const D = LAYOUT.desk;
  sheet(g, k, cut('leg0', () => rect(D.x + 14, D.y + 30, 16, 190 - 30), 0.9, 10), C.mustardD, 8);
  sheet(g, k, cut('leg1', () => rect(D.x + D.w - 30, D.y + 30, 16, 190 - 30), 0.9, 10), C.mustardD, 8);
  sheet(g, k, cut('cab', () => rect(D.x + 40, D.y + 38, 160, 142), 1.1, 10), C.teal, 9);
  sheet(g, k, cut('dr1', () => rect(D.x + 52, D.y + 50, 136, 56), 0.8, 9), C.tealL, 3);
  sheet(g, k, cut('dr2', () => rect(D.x + 52, D.y + 112, 136, 56), 0.8, 9), C.tealL, 3);
  for (const y of [78, 140]) sheet(g, k, cut('kn' + y, () => ell(D.x + 120, D.y + y, 7, 7, 12), 0.4, 5), C.creamS, 3);
  sheet(g, k, cut('apron', () => rect(D.x + 4, D.y + 14, D.w - 8, 20), 1.0, 10), C.mustardD, 8);
  sheet(g, k, cut('slab', () => rect(D.x - 6, D.y, D.w + 12, 24), 1.0, 12), C.mustard, 10, 0.34);
  // books and a mug at the far end
  const bx = D.x + D.w - 108;
  sheet(g, k, cut('bk1', () => rect(bx, D.y - 20, 92, 20), 0.7, 9), C.teal, 4);
  sheet(g, k, cut('bk1s', () => rect(bx + 8, D.y - 14, 76, 4), 0.4, 8), C.creamS, 0, 0);
  sheet(g, k, cut('bk2', () => rect(bx + 8, D.y - 40, 78, 20), 0.7, 9), C.coralD, 4);
  sheet(g, k, cut('bk2s', () => rect(bx + 16, D.y - 34, 60, 4), 0.4, 8), C.mustardL, 0, 0);
  sheet(g, k, cut('bk3', () => rect(bx + 2, D.y - 58, 70, 18), 0.7, 9), C.navy, 4);
  sheet(g, k, cut('mug', () => rrect(bx + 20, D.y - 90, 34, 32, 6), 0.7, 8), C.coral, 5);
  sheet(g, k, cut('mugh', () => [[bx + 52, D.y - 82], [bx + 63, D.y - 82], [bx + 63, D.y - 68], [bx + 52, D.y - 68], [bx + 52, D.y - 73], [bx + 58, D.y - 73], [bx + 58, D.y - 77], [bx + 52, D.y - 77]], 0.4, 5), C.coralD, 2);
  sheet(g, k, cut('mugs', () => rect(bx + 20, D.y - 78, 34, 5), 0.4, 8), C.creamS, 0, 0);
}

// ---- live layers --------------------------------------------------------------------------------------------
function clockHands(g, k, tp) {
  const cl = LAYOUT.clock;
  const min = -2.0 * Math.max(0, 1 - tp / 2.8) - 0.02, hour = -0.18;
  piece(g, k, cl.x, cl.y, hour - Math.PI / 2, cut('hh', () => [[-4, -3], [15, -2], [17, 0], [15, 2], [-4, 3]], 0.3, 5), C.ink, 3);
  piece(g, k, cl.x, cl.y, min - Math.PI / 2, cut('mh', () => [[-5, -2], [24, -1.4], [27, 0], [24, 1.4], [-5, 2]], 0.3, 5), C.ink, 3);
  brad(g, k, cl.x, cl.y, 4);
}

function starburst(g, k, age) {
  if (age < 0) return;
  const R = 170 * spring(age / 1.1), cx = LAYOUT.laptop.screen.x + 100, cy = LAYOUT.laptop.screen.y + 80;
  const rot = Math.floor(age * 12) * 0.035;
  g.save(); g.translate(cx, cy); g.rotate(rot); g.scale(R / 100, R / 100);
  const sp = (n, ro, ri) => { const o = []; for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * TAU, r = i % 2 ? ri : ro; o.push([Math.cos(a) * r, Math.sin(a) * r]); } return o; };
  sheet(g, k / (R / 100 || 1), cut('burstA', () => sp(16, 100, 66), 1.0, 14), C.mustardL, 9 * (R / 100));
  g.rotate(TAU / 32);
  sheet(g, k / (R / 100 || 1), cut('burstB', () => sp(16, 80, 52), 0.9, 12), C.coralL, 6 * (R / 100));
  g.restore();
}

function laptop(g, k, t, tp, p) {
  const L = LAYOUT.laptop, S = L.screen, st = story(t), sc = st.screen;
  const age = t - 2.8;
  // lid and screen paper
  sheet(g, k, cut('lid', () => rrect(S.x - 10, S.y - 10, S.w + 20, S.h + 18, 9), 0.8, 10), C.ink, 12, 0.14);
  const awake = sc.awake;
  const sheetCol = awake < 0.5 ? '#2b2a35' : C.navy;
  sheet(g, k, cut('scr', () => rect(S.x, S.y, S.w, S.h), 0.6, 10), sheetCol, 2, 0);
  g.save();
  g.beginPath(); g.rect(S.x, S.y, S.w, S.h); g.clip();
  const rc = [C.creamS, C.tealL, C.mustardL, C.coralL, C.tealL, C.creamS];
  sc.rows.forEach((row, i) => {
    if (row.len <= 0.001) return;
    const x0 = S.x + 14 + row.indent * 160, y0 = S.y + 18 + i * 22, w = Math.max(3, row.w * 170 * row.len);
    // a short coloured keyword chip then the rest of the line, like syntax colour in cut paper
    const chip = Math.min(w, 24);
    g.save(); g.translate(x0, y0); g.scale(chip / 24, 1);
    sheet(g, k, cut('rowa' + i, () => rect(0, 0, 24, 10), 0.4, 8), rc[(i + 1) % 6], 2.5, 0.0);
    g.restore();
    if (w > 30) { g.save(); g.translate(x0 + 28, y0); g.scale((w - 28) / 100, 1); sheet(g, k, cut('rowb' + i, () => rect(0, 0, 100, 10), 0.5, 10), rc[i % 6], 2.5, 0); g.restore(); }
  });
  // text cursor while typing
  if (sc.typed > 0.02 && sc.typed < 0.999 && Math.floor(tp * 6) % 2 === 0) {
    const ri = clamp(Math.floor(sc.typed * 6.4), 0, 5), row = sc.rows[ri];
    g.save(); g.translate(S.x + 14 + row.indent * 160 + row.w * 170 * row.len + 6, S.y + 17 + ri * 22); g.fillStyle = C.mustardL; g.fillRect(0, 0, 7, 12); g.restore();
  }
  // ship: a green sheet slides down over the old screen paper
  if (age >= 0) {
    const e = 1 - Math.pow(1 - clamp(age / 0.16), 3), off = -(1 - e) * (S.h + 24);
    g.save(); g.translate(0, off);
    sheet(g, k, cut('gscr', () => rect(S.x - 2, S.y - 2, S.w + 4, S.h + 4), 0.6, 10), C.green, 9, 0);
    sheet(g, k, cut('gin', () => rect(S.x + 9, S.y + 9, S.w - 18, S.h - 18), 0.7, 10), C.greenL, 3, 0.2);
    g.restore();
    // a big cut-out tick, popping on a spring
    const sp = spring((age - 0.12) / 0.9);
    if (age > 0.12) {
      g.save(); g.translate(S.x + 100, S.y + 56); g.rotate(-0.05); g.scale(sp, sp);
      sheet(g, k, cut('tick', () => [[-36, 2], [-23, -11], [-9, 5], [28, -34], [41, -21], [-9, 31]], 0.7, 7), C.creamS, 6);
      g.restore();
    }
  }
  g.restore();
  // paper label and tape, outside the clip so they can lap over the lid
  if (age >= 0.2) {
    const sp = spring((age - 0.2) / 0.9);
    g.save(); g.translate(S.x + 100, S.y + 118); g.rotate(-0.045); g.scale(sp, sp);
    sheet(g, k, cut('lab0', () => rect(-92, -25, 184, 50), 0.9, 10), C.coral, 8);
    sheet(g, k, cut('lab1', () => rect(-86, -19, 172, 38), 0.7, 10), C.creamS, 1, 0.1);
    g.font = '900 25px Helvetica, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.letterSpacing = '2px'; g.fillStyle = C.navy; g.fillText('SHIPPED', 1, 2); g.letterSpacing = '0px';
    g.restore();
  }
  if (age >= 0.16) {
    const sp = spring((age - 0.16) / 0.5);
    for (const [tx, ty, a] of [[S.x + 8, S.y + 4, -0.75], [S.x + S.w - 8, S.y + 4, 0.75]]) {
      g.save(); g.translate(tx, ty); g.rotate(a); g.scale(sp, sp);
      g.globalAlpha = 0.86; sheet(g, k, cut('tape', () => rect(-24, -8, 48, 16), 0.9, 6), '#f6e7b0', 3, 0.3);
      g.restore();
    }
  }
  // keyboard slab with key caps
  sheet(g, k, cut('kbslab', () => rrect(L.base.x, L.base.y, L.base.w, L.base.h + 2, 3), 0.7, 10), '#4c4a5a', 9, 0.2);
  const hit = p.tap > 0 ? clamp(Math.round((tp - 2.4) / 0.2), 0, 2) : -1;
  for (let i = 0; i < 13; i++) {
    const kx = L.base.x + 10 + i * 16.4, on = hit >= 0 && i === [3, 5, 4][hit];
    sheet(g, k, cut('key' + i, () => rect(kx, L.base.y + 3, 12, 6), 0.3, 6), on ? C.mustardL : C.creamD, 0, 0);
  }
}

function plant(g, k, t, tp) {
  const px = LAYOUT.plant.x, py = LAYOUT.plant.y, top = py - 66, age = tp - 2.8;
  const defs = [[-82, 96, 30, C.tealD], [-58, 132, 34, C.teal], [-30, 158, 36, C.tealL], [-2, 172, 36, C.teal], [26, 156, 36, C.tealD], [54, 134, 34, C.tealL], [80, 100, 30, C.teal], [104, 66, 24, C.tealD]];
  defs.forEach(([deg, len, wd, col], i) => {
    const wob = Math.sin(tp * 2.6 + i * 1.7) * 0.03 + (age > 0 ? 0.2 * Math.exp(-age * 3.2) * Math.sin(age * 26 + i * 0.9) : 0);
    const a = ((deg - 90) * Math.PI) / 180 + wob;
    piece(g, k, px, top + 6, a, cut('leaf' + i, () => [[0, 0], [len * 0.28, -wd * 0.62], [len * 0.62, -wd * 0.5], [len * 0.9, -wd * 0.16], [len, 0], [len * 0.9, wd * 0.16], [len * 0.62, wd * 0.5], [len * 0.28, wd * 0.62]], 0.9, 9), col, 9);
    g.save(); g.translate(px, top + 6); g.rotate(a); g.strokeStyle = 'rgba(255,255,255,.26)'; g.lineWidth = 2; g.beginPath(); g.moveTo(8, 0); g.lineTo(len * 0.86, 0); g.stroke(); g.restore();
  });
  sheet(g, k, cut('pot', () => [[px - 38, top], [px + 38, top], [px + 29, py], [px - 29, py]], 1.0, 10), C.coral, 11);
  sheet(g, k, cut('potband', () => [[px - 34, top + 30], [px + 34, top + 30], [px + 32, top + 40], [px - 32, top + 40]], 0.6, 9), C.creamS, 1, 0);
  sheet(g, k, cut('rim', () => rect(px - 44, top - 8, 88, 18), 0.9, 10), C.coralD, 6);
  brad(g, k, px, top + 6, 5);
}

// ---- the puppet ---------------------------------------------------------------------------------------------
function puppet(g, k, tp, fr) {
  const p = pose(tp);
  const R = rng(fr * 7919 + 31);
  const wob = (a = 0.03) => (R() - 0.5) * a;
  const smile = p.celebrate > 0.25 || p.hop > 1;

  const leg = (s, far) => {
    const jean = far ? C.denimD : C.denim, cuff = far ? '#5877ac' : C.denimL, shoe = far ? '#d9c9a2' : C.creamS, sole = far ? C.mustardD : C.mustard, d = far ? 9 : 13;
    piece(g, k, s.hip.x, s.hip.y, ang(s.hip, s.knee) + wob(), cut('thigh', () => capsule(DIMS.thigh, 36, 27), 1.1, 10), jean, d);
    const a2 = ang(s.knee, s.ankle) + wob();
    piece(g, k, s.knee.x, s.knee.y, a2, cut('shin', () => capsule(DIMS.shin, 26, 20), 1.0, 10), jean, d);
    piece(g, k, s.knee.x, s.knee.y, a2, cut('cuff', () => rect(DIMS.shin - 22, -11, 14, 22), 0.7, 6), cuff, d * 0.3);
    brad(g, k, s.knee.x, s.knee.y, 5.6);
    const sa = Math.atan2(s.toe.y - s.ankle.y - 12, s.toe.x - s.ankle.x);
    g.save(); g.translate(s.ankle.x, s.ankle.y); g.rotate(sa);
    sheet(g, k, cut('shoe', () => [[-17, -3], [-12, -12], [7, -13], [11, -4], [25, 0], [41, 5], [48, 10], [47, 13], [-17, 13]], 0.9, 8), shoe, d);
    sheet(g, k, cut('sole', () => [[-17, 8], [47, 8], [47, 13], [-17, 13]], 0.5, 8), sole, 0, 0.1);
    sheet(g, k, cut('lace', () => rect(12, -3, 11, 3), 0.3, 6), far ? C.coralD : C.coral, 0, 0);
    g.restore();
    brad(g, k, s.ankle.x, s.ankle.y - 2, 4.4);
  };
  const arm = (s, far) => {
    const sl = far ? C.coralD : C.coral, cu = far ? '#a53f31' : C.coralD, hd = far ? C.peachD : C.peach, d = far ? 8 : 12;
    piece(g, k, s.shoulder.x, s.shoulder.y, ang(s.shoulder, s.elbow) + wob(), cut('uarm', () => capsule(DIMS.upperArm, 27, 22), 1.0, 10), sl, d);
    const a2 = ang(s.elbow, s.hand) + wob();
    g.save(); g.translate(s.elbow.x, s.elbow.y); g.rotate(a2);
    sheet(g, k, cut('farm', () => capsule(DIMS.foreArm, 22, 18), 0.9, 10), sl, d);
    sheet(g, k, cut('wrist', () => rect(DIMS.foreArm - 18, -10, 11, 20), 0.6, 6), cu, 0, 0.1);
    sheet(g, k, cut('hand', () => ell(DIMS.foreArm + 5, 0, 12, 11, 16), 0.7, 6), hd, d * 0.6);
    g.restore();
    brad(g, k, s.elbow.x, s.elbow.y, 5.2);
    if (!far) brad(g, k, s.shoulder.x, s.shoulder.y, 5.6);
  };

  arm(p.far, true);
  leg(p.far, true);
  leg(p.near, false);

  // hoodie torso, in its own frame: x runs pelvis to neck, +y is the front
  const aT = ang(p.pelvis, p.neck) + wob(0.016), TL = DIMS.torso;
  g.save(); g.translate(p.pelvis.x, p.pelvis.y); g.rotate(aT);
  sheet(g, k, cut('torso', () => [[-15, -31], [30, -33], [80, -30], [110, -26], [126, -17], [129, 0], [126, 17], [110, 28], [80, 32], [34, 34], [-15, 35]], 1.2, 10), C.coral, 14);
  sheet(g, k, cut('hem', () => rect(-15, -31, 15, 66), 0.6, 8), C.coralD, 0, 0.1);
  sheet(g, k, cut('pocket', () => [[6, 7], [46, 5], [52, 29], [6, 31]], 0.7, 8), C.coralD, 3, 0.12);
  // hood bunched behind the neck, and drawstrings
  sheet(g, k, cut('hood', () => ell(TL - 4, -9, 17, 28, 20), 0.8, 8), C.coralD, 5, 0.12);
  sheet(g, k, cut('str1', () => rect(76, 11, 34, 3), 0.25, 6), C.creamS, 1.5, 0);
  sheet(g, k, cut('str2', () => rect(88, 19, 30, 3), 0.25, 6), C.creamS, 1.5, 0);
  // headphones round the neck: a teal band and a mustard cup resting on the chest
  sheet(g, k, cut('band', () => [ell(TL - 2, 1, 16, 33, 28), ell(TL - 2, 1, 7.5, 24, 22)], 0.5, 6), C.teal, 4, 0.2);
  sheet(g, k, cut('cup', () => rrect(TL - 46, 10, 38, 30, 8), 0.7, 8), C.mustard, 7, 0.3);
  sheet(g, k, cut('cupi', () => rrect(TL - 41, 15, 28, 20, 6), 0.5, 8), C.mustardD, 0, 0.15);
  g.restore();

  // head: a peach disc with a nose tab, ear, hair cap, eye
  const hd = p.head;
  g.save(); g.translate(hd.x, hd.y); g.rotate(hd.angle + wob(0.03));
  const headPts = cut('head', () => {
    const o = []; for (let i = 0; i <= 24; i++) { const a = (20 + (320 * i) / 24) * Math.PI / 180; o.push([Math.cos(a) * 38, Math.sin(a) * 38]); }
    o.push([37, -9], [40, -3], [47, 7], [39, 12]); return o;
  }, 0.9, 7);
  sheet(g, k, headPts, C.peach, 15);
  sheet(g, k, cut('ear', () => ell(-5, 6, 7.5, 9.5, 14), 0.5, 5), C.peachD, 3, 0.15);
  sheet(g, k, cut('hair', () => {
    const o = []; for (let i = 0; i <= 20; i++) { const a = (155 + (190 * i) / 20) * Math.PI / 180, bump = i === 6 || i === 7 ? 9 : 0; o.push([Math.cos(a) * (43 + bump * 0.6), Math.sin(a) * (43 + bump)]); }
    o.push([36, -16], [30, -10], [22, -19], [13, -11], [4, -20], [-6, -12], [-17, -19], [-27, -9], [-32, 4], [-37, 16]); return o;
  }, 0.9, 7), C.hair, 6, 0.1);
  // face: eye (blinks on a few frames), brow, blush, mouth
  const blink = fr % 40 === 17 || fr % 40 === 18;
  g.fillStyle = C.ink;
  const look = p.reach > 0.5 ? 1.5 : 0;
  g.beginPath(); g.ellipse(19 + look, -2, 3.3, blink ? 0.8 : 3.8, 0, 0, TAU); g.fill();
  g.strokeStyle = C.hair; g.lineWidth = 2.6; g.lineCap = 'round'; g.beginPath(); g.moveTo(12, -11 - (smile ? 2 : 0)); g.lineTo(25, -12 - (smile ? 3 : 0)); g.stroke();
  g.fillStyle = 'rgba(238,107,86,.55)'; g.beginPath(); g.ellipse(21, 12, 6.5, 4.2, 0, 0, TAU); g.fill();
  g.strokeStyle = C.ink; g.lineWidth = 2.4;
  g.beginPath();
  if (smile) { g.arc(23, 15, 9, 0.15 * Math.PI, 0.8 * Math.PI); } else { g.moveTo(19, 22); g.lineTo(28, 21); }
  g.stroke();
  g.restore();

  arm(p.near, false);
  return p;
}

// ---- confetti: cut paper scraps with their own shadows --------------------------------------------------------
function confetti(g, k, t) {
  const cols = [C.coral, C.mustard, C.teal, C.navyL, C.green, C.coralL];
  for (const q of particles(t)) {
    const col = cols[q.i % cols.length], flip = 0.3 + 0.7 * Math.abs(Math.cos(q.rot * 0.9 + q.i)), s = q.size / 10;
    let pts;
    if (q.kind === 0) pts = cut('cf0', () => ell(0, 0, 8, 8, 14), 0.5, 4);
    else if (q.kind === 1) pts = cut('cf1', () => star(0, 0, 10, 4.4, 5), 0.4, 4);
    else if (q.kind === 2) pts = cut('cf2', () => rect(-9, -5, 18, 10), 0.5, 5);
    else pts = cut('cf3', () => rect(-3.5, -12, 7, 24), 0.4, 6);
    g.save(); g.globalAlpha = q.alpha; g.translate(q.x, q.y); g.rotate(q.rot); g.scale(s, s * flip);
    sheet(g, k, pts, col, 9 / (s * flip + 0.2), 0.2);
    g.restore();
  }
  g.globalAlpha = 1;
}

// ---- the shadow box itself: sloped inner walls, nearest layer -------------------------------------------------
function boxFrame(g, k) {
  const B = 40;
  const ring = cut('ring', () => [rect(-20, -20, W + 40, H + 40), rect(B, B, W - 2 * B, H - 2 * B)], 1.4, 14);
  trace(g, ring); g.fillStyle = C.kraftDD; shade(g, k, 16, 0.5); g.fill('evenodd'); noShade(g);
  const face = (pts, c0, c1, x0, y0, x1, y1) => {
    const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, c0); gr.addColorStop(1, c1);
    g.fillStyle = gr; trace(g, pts); g.fill(); g.strokeStyle = 'rgba(255,230,190,.22)'; g.lineWidth = 1.2; g.stroke();
  };
  face(cut('fT', () => [[0, 0], [W, 0], [W - B, B], [B, B]], 0.9, 12), '#a47c52', '#c29a68', 0, 0, 0, B);
  face(cut('fL', () => [[0, 0], [B, B], [B, H - B], [0, H]], 0.9, 12), '#8c6540', '#a67b50', 0, 0, B, 0);
  face(cut('fR', () => [[W, 0], [W, H], [W - B, H - B], [W - B, B]], 0.9, 12), '#6b4a2e', '#855d3a', W, 0, W - B, 0);
  face(cut('fB', () => [[0, H], [W, H], [W - B, H - B], [B, H - B]], 0.9, 12), '#5a3d25', '#73512f', 0, H, 0, H - B);
}

export function render(ctx, t, w, h) {
  const k = w / W, wi = Math.round(w);
  const fr = Math.floor(t * 12 + 1e-6), tp = fr / 12;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(cached('bg', wi, buildBG), 0, 0, w, h);
  ctx.scale(k, k);
  clockHands(ctx, k, tp);
  starburst(ctx, k, t - 2.8);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(cached('desk', wi, buildDesk), 0, 0, w, h);
  ctx.scale(k, k);
  const p = pose(tp);
  laptop(ctx, k, t, tp, p);
  plant(ctx, k, t, tp);
  puppet(ctx, k, tp, fr);
  confetti(ctx, k, t);
  boxFrame(ctx, k);
  ctx.restore();
  // paper fibre over everything, then a little light falloff toward the bottom right
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = 0.9;
  ctx.drawImage(getGrain(wi), 0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  const gr = ctx.createRadialGradient(w * 0.3, w * 0.2, w * 0.2, w * 0.5, w * 0.5, w * 0.85);
  gr.addColorStop(0, 'rgba(255,236,190,0.10)'); gr.addColorStop(1, 'rgba(60,30,10,0.22)');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
  ctx.restore();
}
