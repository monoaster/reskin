# reskin

One scene, ten skins.

A character walks across a room at night, up to a laptop, types, and ships. That is 3.2 seconds, and it is
identical in every renderer here. Only the style changes: pixel art, blueprint, neon, paper cut-out, risograph,
isometric voxels, PS1 low-poly, boiling ink, ASCII, clay.

Each style is one JavaScript file that Claude wrote from the prompt sitting next to it. The prompts are the point:
read one, paste it, get a different skin.

Clone it, then open `gallery.html` (all ten, playing in step) or any file in `examples/` on its own.
No build step, no dependencies, no network.

<!-- styles:start -->
| # | Style | Prompt | Code | Run it |
|---|---|---|---|---|
| 01 | **Pixel Art** (8-bit) | [prompt](prompts/01-pixel.md) | [code](src/styles/01-pixel.js) | [open](examples/01-pixel.html) |
| 02 | **Blueprint** (cyanotype plans) | [prompt](prompts/02-blueprint.md) | [code](src/styles/02-blueprint.js) | [open](examples/02-blueprint.html) |
| 03 | **Neon Tube** (glass and gas) | [prompt](prompts/03-neon.md) | [code](src/styles/03-neon.js) | [open](examples/03-neon.html) |
| 04 | **Paper Cut-Out** (pinned puppets) | [prompt](prompts/04-paper.md) | [code](src/styles/04-paper.js) | [open](examples/04-paper.html) |
| 05 | **Risograph** (two-ink print) | [prompt](prompts/05-riso.md) | [code](src/styles/05-riso.js) | [open](examples/05-riso.html) |
| 06 | **Isometric Voxel** (isometric cubes) | [prompt](prompts/06-voxel.md) | [code](src/styles/06-voxel.js) | [open](examples/06-voxel.html) |
| 07 | **PS1 Low-Poly** (1997 console) | [prompt](prompts/07-ps1.md) | [code](src/styles/07-ps1.js) | [open](examples/07-ps1.html) |
| 08 | **Boiling Ink** (hand-inked sketch) | [prompt](prompts/08-ink.md) | [code](src/styles/08-ink.js) | [open](examples/08-ink.html) |
| 09 | **ASCII Terminal** (text only) | [prompt](prompts/09-ascii.md) | [code](src/styles/09-ascii.js) | [open](examples/09-ascii.html) |
| 10 | **Clay Stop-Motion** (on threes) | [prompt](prompts/10-clay.md) | [code](src/styles/10-clay.js) | [open](examples/10-clay.html) |
<!-- styles:end -->

## How it fits together

```
src/rig.js              one character, one scene, one timeline. Pure functions of t.
src/styles/NN-name.js   a renderer: render(ctx, t, w, h) draws frame t on a square canvas.
prompts/NN-name.md      the prompt that asks for that renderer.
prompts/00-scene-brief.md   the shared brief: what the scene is, what a renderer must do.
examples/               each renderer built into a single HTML file you can double-click.
```

The rig gives every renderer the same joints (`pose(t)`), the same laptop screen state (`story(t)`), the same
confetti (`particles(t)`) and the same room layout. Footfalls land on a 150 bpm beat, and the build passes on beat
seven, so a soundtrack can lock to any style.

## Try a prompt

```bash
node scripts/bundle-prompt.mjs 04 | pbcopy      # scene brief + rig + skeleton + the paper cut-out prompt
```

Paste it into Claude and ask for the file. Then look at it:

```bash
node scripts/preview.mjs 04-paper sheet.png     # a contact sheet of nine moments (needs Node 22+ and Chrome)
node scripts/build.mjs                          # rebuild examples/ and gallery.html
```

## Write your own

1. Copy `src/styles/00-skeleton.js` to `src/styles/11-yours.js`.
2. Write the style as a prompt in `prompts/11-yours.md`. Keep it concrete: resolution, palette, line widths, what
   the light does.
3. Ask Claude for the renderer, preview it, and run `node scripts/build.mjs`.

Rules for a renderer: it is a pure function of `t` (no `Math.random`, no clock, use `rng(seed)`), it draws an opaque
square frame, and it uses no assets, fonts or network.

## How these were made

Claude wrote the rig, the ten renderers and the prompts in one session, then looked at contact sheets of each style
and revised it until it read well. Treat the prompts as a starting point: two runs of the same prompt will not give
you the same picture, which is part of the fun.

## License

MIT, see [LICENSE](LICENSE).
