---
name: Scene brief
slug: scene-brief
---

# The scene brief (paste this first, then one style prompt)

You are writing one renderer for **reskin**. Every renderer draws the same short scene from the same
skeleton, so the only thing that changes between them is the style.

## What you are given

- `src/rig.js`: a pure function `pose(t)` that returns every joint of one character, `story(t)` for the
  laptop screen, `particles(t)` for confetti, and `LAYOUT` for where the desk, laptop, window, clock and
  plant sit. The world is a 1000 x 1000 square, y points down, the floor is y = 800.
- `src/styles/00-skeleton.js`: the plainest renderer. Copy its shape.

## The scene (3.2 seconds, 150 bpm, one beat = 0.4 s)

| time | what happens |
|---|---|
| 0.0 - 2.0 | The character walks in from the left, one footfall on every beat, and slows to a stop. |
| 2.0 - 2.4 | They raise the near hand to the laptop keyboard. |
| 2.4 - 2.8 | They type. Three key taps on 2.4, 2.6 and 2.8. Code fills the screen. |
| 2.8 | The build passes. The screen flips to a green "SHIPPED" state, confetti goes up, they hop. |
| 2.8 - 3.2 | Fist pump. End. |

The character: hoodie, headphones around the neck, short hair, jeans, sneakers. Reinterpret that in your
style. Do not change the proportions or the timing: the joints from `pose(t)` drive everything.

## The contract

```js
import { W, H, LAYOUT, DIMS, pose, story, particles, limbs, util, rng } from '../rig.js';
export const meta = { id: '01', slug: 'pixel', name: 'Pixel Art', tag: '8-bit', accent: '#ff4fa0' };
export function render(ctx, t, w, h) { /* draw frame t on a w x w canvas */ }
```

- `render` is a pure function of `t`. No `Math.random`, no `Date`, no `performance.now`. Use `rng(seed)`.
  Calling it with the same `t` must give the same pixels, whatever was drawn before.
- The canvas is square. Draw an opaque, finished frame: background, room, character, props, effects.
- Everything is drawn in code. No images, no web fonts, no network. System font stacks only.
- Keep one frame under about 80 ms at 1000 px. Do per-pixel work at a lower resolution or with typed arrays.
- The scene must still read at a glance: walk, reach, type, the build passes, the hop.
