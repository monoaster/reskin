// 00 skeleton: the plainest possible renderer. It exists to show the rig contract and to be the file every
// other style starts from. A style is one function: render(ctx, t, w, h) draws frame t (seconds) on a w x w canvas.
import { W, H, LAYOUT, DIMS, pose, story, particles, limbs, util } from '../rig.js';

export const meta = { id: '00', slug: 'skeleton', name: 'Skeleton', tag: 'the rig', accent: '#9ad1ff' };

export function render(ctx, t, w, h) {
  const k = w / W;
  ctx.save();
  ctx.scale(k, k);
  ctx.fillStyle = '#10131c'; ctx.fillRect(0, 0, W, H);
  // floor
  ctx.fillStyle = '#1b2030'; ctx.fillRect(0, LAYOUT.floor, W, H - LAYOUT.floor);
  // window + clock
  const wn = LAYOUT.window; ctx.strokeStyle = '#3a4260'; ctx.lineWidth = 4; ctx.strokeRect(wn.x, wn.y, wn.w, wn.h);
  ctx.beginPath(); ctx.arc(LAYOUT.clock.x, LAYOUT.clock.y, LAYOUT.clock.r, 0, 7); ctx.stroke();
  // desk
  const d = LAYOUT.desk; ctx.fillStyle = '#2a3150'; ctx.fillRect(d.x, d.y, d.w, 16); ctx.fillRect(d.x + 14, d.y, 14, d.h); ctx.fillRect(d.x + d.w - 28, d.y, 14, d.h);
  // laptop
  const s = story(t), L = LAYOUT.laptop;
  ctx.fillStyle = '#c9ced8'; ctx.fillRect(L.base.x, L.base.y, L.base.w, L.base.h);
  const ship = s.screen.ship;
  ctx.fillStyle = ship > 0.5 ? '#1fb36b' : `rgba(120,160,255,${0.15 + 0.5 * s.screen.awake})`;
  ctx.fillRect(L.screen.x, L.screen.y, L.screen.w, L.screen.h);
  ctx.fillStyle = 'rgba(0,0,0,.55)';
  s.screen.rows.forEach((r, i) => ctx.fillRect(L.screen.x + 14 + r.indent * 160, L.screen.y + 16 + i * 22, r.w * 170 * r.len, 10));
  // figure
  const p = pose(t), lb = limbs(p);
  const draw = (list, col) => { ctx.strokeStyle = col; ctx.lineCap = 'round'; for (const [a, b, wd] of list) { ctx.lineWidth = wd; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); } };
  draw(lb.farLeg, '#6b7bb0'); draw(lb.farArm, '#6b7bb0');
  draw([lb.torso], '#ff8fa3');
  draw(lb.nearLeg, '#9ad1ff'); draw(lb.nearArm, '#ffd27a');
  ctx.fillStyle = '#ffd9b8'; ctx.beginPath(); ctx.arc(p.head.x, p.head.y, p.head.r, 0, 7); ctx.fill();
  for (const q of particles(t)) { ctx.globalAlpha = q.alpha; ctx.fillStyle = ['#ff6b6b', '#ffd23f', '#6bd6ff', '#9bff7a'][q.kind]; ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size); }
  ctx.globalAlpha = 1;
  ctx.restore();
}
