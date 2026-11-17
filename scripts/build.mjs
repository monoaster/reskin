// Builds the single-file examples and the gallery. No dependencies.
//   node scripts/build.mjs
// For every src/styles/NN-name.js it writes examples/NN-name.html (open it, nothing else needed),
// and it writes gallery.html: all styles on one page, playing the same 3.2 s walk in step.
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rigSrc = await readFile(path.join(root, 'src/rig.js'), 'utf8');
const exportsOf = [...rigSrc.matchAll(/^export (?:const|function|let) (\w+)/gm)].map((m) => m[1]);
const rigBody = rigSrc.replace(/^export /gm, '');
const rigBlock = `const rig = (() => {\n${rigBody}\nreturn { ${exportsOf.join(', ')} };\n})();`;

function inlineStyle(src) {
  return src
    .replace(/^import \{([^}]*)\} from '\.\.\/rig\.js';?/gm, (_, names) => `const {${names}} = rig;`)
    .replace(/^export /gm, '');
}

const files = (await readdir(path.join(root, 'src/styles'))).filter((f) => /^\d\d-.*\.js$/.test(f)).sort();
const styles = [];
for (const f of files) {
  const src = await readFile(path.join(root, 'src/styles', f), 'utf8');
  styles.push({ file: f, slug: f.replace(/\.js$/, ''), code: inlineStyle(src) });
}

const css = `
  :root { color-scheme: dark; }
  html, body { margin: 0; height: 100%; background: #0c0e2b; color: #f1eefb; font: 15px/1.4 ui-monospace, Menlo, monospace; }
  body { display: grid; place-items: center; }
  main { width: min(92vmin, 920px); }
  canvas { display: block; width: 100%; aspect-ratio: 1; border-radius: 18px; background: #000; }
  p { margin: 10px 2px 0; display: flex; justify-content: space-between; gap: 12px; opacity: .8; }
  a { color: inherit; }`;

const player = `
const LOOP = rig.T + 0.9;                       // a short hold on the last frame before it starts again
function play(canvas, style) {
  const c = canvas.getContext('2d');
  const t0 = performance.now();
  (function frame(now) {
    const t = Math.min(Math.max(0, ((now - t0) / 1000) % LOOP), rig.T);   // the first rAF timestamp can be a hair before t0
    style.render(c, t, canvas.width, canvas.height);
    requestAnimationFrame(frame);
  })(t0);
}`;

await mkdir(path.join(root, 'examples'), { recursive: true });
for (const s of styles) {
  const html = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>reskin ${s.slug}</title>
<style>${css}</style>
<main><canvas id="c" width="1000" height="1000"></canvas>
<p><span>reskin / ${s.slug}</span><span>prompt: prompts/${s.slug}.md</span></p></main>
<script>
${rigBlock}
const style = (() => {
${s.code}
return { meta, render };
})();
${player}
play(document.getElementById('c'), style);
</script>
</html>
`;
  await writeFile(path.join(root, 'examples', `${s.slug}.html`), html);
}

const gallery = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>reskin: one scene, ten skins</title>
<style>${css}
  body { place-items: start center; }
  main { width: min(96vw, 1500px); padding: 24px 0; }
  h1 { font: 900 clamp(36px, 7vw, 88px)/1 "Arial Narrow", "Helvetica Neue", sans-serif; margin: 0 0 4px; letter-spacing: -.01em; text-transform: uppercase; }
  .lede { opacity: .75; margin: 0 0 22px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
  figure { margin: 0; } canvas { border-radius: 14px; }
  figcaption { margin-top: 6px; display: flex; justify-content: space-between; opacity: .85; }
</style>
<main>
<h1>One scene. Ten skins.</h1>
<p class="lede">The same 3.2 second walk, drawn by ten renderers. Each one is a single JavaScript file Claude wrote from the prompt next to it.</p>
<div class="grid" id="grid"></div>
</main>
<script>
${rigBlock}
const styles = [
${styles.map((s) => `(() => {\n${s.code}\nreturn { meta, render };\n})()`).join(',\n')}
];
${player.replace('function play(canvas, style) {', 'function playAll(items) {').replace("const c = canvas.getContext('2d');", '').replace("style.render(c, t, canvas.width, canvas.height);", "for (const { canvas, style, c } of items) style.render(c, t, canvas.width, canvas.height);")}
const grid = document.getElementById('grid'), items = [];
for (const style of styles) {
  const f = document.createElement('figure'), canvas = document.createElement('canvas');
  canvas.width = canvas.height = 560;
  const cap = document.createElement('figcaption');
  cap.innerHTML = '<span>' + style.meta.id + ' ' + style.meta.name + '</span><span>' + style.meta.tag + '</span>';
  f.append(canvas, cap); grid.append(f);
  items.push({ canvas, style, c: canvas.getContext('2d') });
}
playAll(items);
</script>
</html>
`;
await writeFile(path.join(root, 'gallery.html'), gallery);

// README table, built from each prompt's front matter
const rows = [];
for (const s of styles) {
  if (s.slug.startsWith('00')) continue;
  let name = s.slug, tag = '';
  try {
    const md = await readFile(path.join(root, 'prompts', `${s.slug}.md`), 'utf8');
    name = (md.match(/^name:\s*"?(.*?)"?\s*$/m) || [])[1] || name; tag = (md.match(/^tag:\s*"?(.*?)"?\s*$/m) || [])[1] || '';
  } catch {}
  rows.push(`| ${s.slug.slice(0, 2)} | **${name}** (${tag}) | [prompt](prompts/${s.slug}.md) | [code](src/styles/${s.slug}.js) | [open](examples/${s.slug}.html) |`);
}
const table = '| # | Style | Prompt | Code | Run it |\n|---|---|---|---|---|\n' + rows.join('\n');
try {
  const readme = await readFile(path.join(root, 'README.md'), 'utf8');
  await writeFile(path.join(root, 'README.md'), readme.replace(/<!-- styles:start -->[\s\S]*<!-- styles:end -->/, `<!-- styles:start -->\n${table}\n<!-- styles:end -->`));
} catch {}
console.log(`built ${styles.length} examples and gallery.html`);
