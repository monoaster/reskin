// reskin rig: one character, one scene, one 3.2 second walk. Every style draws from this.
//
// World: a 1000 x 1000 square, y points down, the floor is y = 800.
// The beat is 150 bpm (0.4 s). Footfalls land on the beat, the build passes on beat 7 (t = 2.8).
//
//   0.0 - 2.0   walks in from the left, slows to a stop at x = 490
//   2.0 - 2.4   raises the near hand to the laptop keyboard
//   2.4 - 2.8   types (three key taps: 2.4, 2.6, 2.8), code rows fill the screen
//   2.8         the build passes: the screen flips, confetti, a hop
//   2.8 - 3.2   fist pump, then the clip ends
//
// Everything here is a pure function of t. No randomness, no clock: call it with any t, in any order.

export const W = 1000;
export const H = 1000;
export const FLOOR = 800;
export const T = 3.2;            // seconds per style
export const BPM = 150;
export const BEAT = 0.4;
export const SHIP_T = 2.8;       // the moment the build passes

export const LAYOUT = {
  floor: FLOOR,
  desk:   { x: 560, y: 610, w: 400, h: 190 },                 // table top is y = 610
  laptop: { base: { x: 600, y: 598, w: 230, h: 12 },          // keyboard slab, sits on the desk
            screen: { x: 615, y: 440, w: 200, h: 158 } },      // facing the viewer
  hand:   { x: 650, y: 594 },                                  // where the near hand lands on the keys
  window: { x: 80, y: 130, w: 260, h: 350 },
  clock:  { x: 430, y: 170, r: 34 },
  plant:  { x: 880, y: 800 },
};

export const DIMS = {
  thigh: 100, shin: 98, upperArm: 92, foreArm: 86,
  torso: 124, neck: 16, headR: 38,
  thighW: 24, shinW: 19, upperArmW: 17, foreArmW: 15, torsoW: 58, footLen: 40, footH: 14,
  depth: 26,   // z offset of the near / far limbs, for 3D styles
};

export const SCREEN_LINES = [
  'const build = await ship()',
  'if (build.ok) {',
  '  deploy(build)',
  '}',
  'tests: 42 passed',
  'status: SHIPPED',
];

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (a, b, v) => { const k = clamp((v - a) / (b - a)); return k * k * (3 - 2 * k); };
const easeInOut = (k) => k * k * (3 - 2 * k);

// ---- where the body is --------------------------------------------------------------------
const X0 = -40, X1 = 490, CRUISE_END = 1.5, STOP = 2.0;
const V = (X1 - X0) / (CRUISE_END + (STOP - CRUISE_END) / 2);   // px per second while cruising

export function bodyX(t) {
  if (t <= CRUISE_END) return X0 + V * Math.max(t, -1);
  if (t >= STOP) return X1;
  const u = (t - CRUISE_END) / (STOP - CRUISE_END);               // linear slow-down to a stop
  return X0 + V * CRUISE_END + V * (STOP - CRUISE_END) * (u - u * u / 2);
}

// Feet plant in world space on the beat, so nothing slides. Each foot has a 0.8 s cycle:
// 0 - 0.6 planted, 0.6 - 1 swinging to the next planting spot, which is under the pelvis at mid-stance.
function footTrack(t, offset, side) {
  const P = 0.8, STANCE = 0.6;
  const n = Math.floor((t - offset) / P);
  const u = (t - offset) / P - n;
  const land = (k) => bodyX(offset + k * P + 0.24) + side * 6;
  const L0 = land(n), L1 = land(n + 1);
  if (u < STANCE) return { x: L0, lift: 0, swing: -1, u };
  const s = (u - STANCE) / (1 - STANCE);
  return { x: lerp(L0, L1, easeInOut(s)), lift: Math.sin(Math.PI * s), swing: s, u };
}

function ik2(ax, ay, tx, ty, l1, l2, sgn) {
  let dx = tx - ax, dy = ty - ay;
  let d = Math.hypot(dx, dy);
  const max = l1 + l2 - 0.5;
  if (d > max) { tx = ax + dx * max / d; ty = ay + dy * max / d; dx = tx - ax; dy = ty - ay; d = max; }
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const mx = ax + a * dx / d, my = ay + a * dy / d;
  return { x: mx + sgn * h * (-dy / d), y: my + sgn * h * (dx / d), tx, ty };
}

// ---- the pose -----------------------------------------------------------------------------
// Returns joints as {x, y, z}. z is -1 (far side), 0 (spine) or +1 (near side) so 3D styles can push limbs apart.
export function pose(t) {
  t = clamp(t, 0, T);
  const D = DIMS;
  const walk = 1 - smooth(1.55, 2.05, t);             // 1 while walking, 0 once stopped
  const reach = smooth(2.0, 2.45, t);                 // near hand goes to the keyboard
  const celebrate = smooth(2.82, 3.0, t);             // fist pump
  const tapPulse = (t0) => { const k = (t - t0) / 0.12; return k > 0 && k < 1 ? Math.sin(Math.PI * k) : 0; };
  const tap = Math.max(tapPulse(2.4), tapPulse(2.6), tapPulse(2.8));
  const hopK = clamp((t - 2.84) / 0.34);
  const hop = 34 * Math.sin(Math.PI * hopK);

  const px = bodyX(t) + 0;
  const bob = walk * 7 * (0.5 + 0.5 * Math.cos(2 * Math.PI * t / BEAT));
  const standH = 196;
  const py = FLOOR - standH + bob - hop;
  const lean = 0.05 * walk + 0.16 * reach * (1 - celebrate * 0.7) - 0.04 * celebrate;

  const sx = px + Math.sin(lean) * D.torso * 0.96;
  const sy = py - Math.cos(lean) * D.torso * 0.96;
  const neck = { x: px + Math.sin(lean) * D.torso, y: py - Math.cos(lean) * D.torso, z: 0 };
  const headTilt = lean + 0.1 * reach - 0.1 * celebrate;
  const head = { x: neck.x + Math.sin(headTilt) * (D.neck + D.headR), y: neck.y - Math.cos(headTilt) * (D.neck + D.headR), z: 0, r: D.headR, angle: headTilt };

  // legs
  const fN = footTrack(t, 0.0, +1);       // near foot lands on t = 0, 0.8, 1.6 ...
  const fF = footTrack(t, 0.4, -1);       // far foot lands on t = 0.4, 1.2, 2.0 ...
  const settle = 1 - walk;
  const stand = (side) => px + side * 16;
  const legJoints = (f, side, z) => {
    const fx = lerp(f.x, stand(side) + 0, settle);
    const lift = f.lift * 46 * walk + hop * 0.9;
    const ay = FLOOR - 12 - lift;
    const hip = { x: px + side * 4, y: py, z };
    const k = ik2(hip.x, hip.y, fx, ay, D.thigh, D.shin, -1);
    const pitch = f.swing < 0 ? 0 : lerp(0.55, -0.3, f.swing);
    const pitchAir = hop > 2 ? 0.25 : pitch;
    const toe = { x: k.tx + Math.cos(pitchAir) * D.footLen, y: k.ty + 12 + Math.sin(pitchAir) * D.footLen * 0.6 - (hop > 2 ? 0 : 0), z };
    if (f.swing < 0 && hop < 2) toe.y = FLOOR;
    return { hip, knee: { x: k.x, y: k.y, z }, ankle: { x: k.tx, y: k.ty, z }, toe };
  };
  const legN = legJoints(fN, +1, +1);
  const legF = legJoints(fF, -1, -1);

  // arms
  const swingA = 0.62 * walk;
  const thN = -swingA * Math.cos(2 * Math.PI * t / (BEAT * 2));
  const thF = +swingA * Math.cos(2 * Math.PI * t / (BEAT * 2));
  const armLen = 150;
  const shoulderN = { x: sx + 3, y: sy, z: +1 }, shoulderF = { x: sx - 3, y: sy, z: -1 };
  const hangN = { x: shoulderN.x + Math.sin(thN + 0.05) * armLen, y: shoulderN.y + Math.cos(thN + 0.05) * armLen };
  const hangF = { x: shoulderF.x + Math.sin(thF + 0.05) * armLen, y: shoulderF.y + Math.cos(thF + 0.05) * armLen };
  const keys = { x: LAYOUT.hand.x, y: LAYOUT.hand.y - tap * 9 };
  const up = { x: shoulderN.x + 52, y: shoulderN.y - 150 - Math.sin(t * 40) * 3 * celebrate };
  let tgtN = { x: lerp(hangN.x, keys.x, reach), y: lerp(hangN.y, keys.y, reach) };
  tgtN = { x: lerp(tgtN.x, up.x, celebrate), y: lerp(tgtN.y, up.y, celebrate) };
  const tgtF = { x: hangF.x + (hop > 0 ? -18 : 0), y: hangF.y - hop * 0.4 };
  const aN = ik2(shoulderN.x, shoulderN.y, tgtN.x, tgtN.y, D.upperArm, D.foreArm, +1);
  const aF = ik2(shoulderF.x, shoulderF.y, tgtF.x, tgtF.y, D.upperArm, D.foreArm, +1);

  return {
    t, walk, reach, celebrate, tap, hop, lean, facing: 1,
    pelvis: { x: px, y: py, z: 0 }, chest: { x: lerp(px, sx, 0.55), y: lerp(py, sy, 0.55), z: 0 }, neck, head,
    near: { hip: legN.hip, knee: legN.knee, ankle: legN.ankle, toe: legN.toe, shoulder: shoulderN, elbow: { x: aN.x, y: aN.y, z: +1 }, hand: { x: aN.tx, y: aN.ty, z: +1 } },
    far:  { hip: legF.hip, knee: legF.knee, ankle: legF.ankle, toe: legF.toe, shoulder: shoulderF, elbow: { x: aF.x, y: aF.y, z: -1 }, hand: { x: aF.tx, y: aF.ty, z: -1 } },
  };
}

// ---- the story around the body -----------------------------------------------------------------
// screen.awake: laptop wakes while the hand lifts. screen.typed: 0..1 of the code on screen.
// screen.ship: 0 -> 1 across the flip to the green "SHIPPED" state. shipAge: seconds since it passed (or -1).
export function story(t) {
  const typed = smooth(2.38, 2.8, t);
  const ship = smooth(SHIP_T, SHIP_T + 0.12, t);
  const awake = smooth(1.7, 2.0, t);
  const rows = [0.55, 0.8, 0.45, 0.2, 0.7, 0.35].map((w, i) => ({
    w, indent: [0, 0, 0.12, 0, 0, 0.12][i],
    len: clamp(typed * 6.4 - i, 0, 1),
  }));
  const chars = SCREEN_LINES.map((s, i) => s.slice(0, Math.round(s.length * clamp(typed * 6.4 - i, 0, 1))));
  return { t, screen: { awake, typed, ship, rows, chars }, shipAge: t >= SHIP_T ? t - SHIP_T : -1 };
}

// Confetti: deterministic bits that fly up from the top of the laptop on the beat the build passes.
export function particles(t, n = 28) {
  const age = t - SHIP_T;
  if (age < 0 || age > 1.5) return [];
  const out = [];
  let s = 1234567;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < n; i++) {
    const vx = (rnd() - 0.5) * 520, vy = -(220 + rnd() * 330), w = (rnd() - 0.5) * 14;
    const size = 8 + rnd() * 10, kind = Math.floor(rnd() * 4);
    out.push({
      x: LAYOUT.laptop.screen.x + LAYOUT.laptop.screen.w / 2 + vx * age,
      y: LAYOUT.laptop.screen.y + vy * age + 520 * age * age,
      rot: w * age, size, kind, alpha: 1 - smooth(1.0, 1.5, age), i,
    });
  }
  return out;
}

// For styles that want to draw limbs as two-bone chains: [[from, to, width], ...] far side first.
export function limbs(p) {
  const D = DIMS;
  const L = (a, b, w) => [a, b, w];
  const leg = (s) => [L(s.hip, s.knee, D.thighW), L(s.knee, s.ankle, D.shinW), L(s.ankle, s.toe, D.footH)];
  const arm = (s) => [L(s.shoulder, s.elbow, D.upperArmW), L(s.elbow, s.hand, D.foreArmW)];
  return { farLeg: leg(p.far), farArm: arm(p.far), torso: L(p.pelvis, p.neck, D.torsoW), nearLeg: leg(p.near), nearArm: arm(p.near) };
}

// Shared helpers for style code.
export const util = { clamp, lerp, smooth, easeInOut };
export function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
