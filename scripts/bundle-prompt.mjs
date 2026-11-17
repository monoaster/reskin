// Prints one paste-ready prompt: the scene brief, the rig, the skeleton renderer, then the style prompt.
//   node scripts/bundle-prompt.mjs 04            (or: 04-paper)
//   node scripts/bundle-prompt.mjs 04 | pbcopy   (macOS: straight to the clipboard)
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const want = process.argv[2];
if (!want) { console.error('usage: node scripts/bundle-prompt.mjs <NN | NN-slug>'); process.exit(1); }
const name = (await readdir(path.join(root, 'prompts'))).find((f) => f.startsWith(want) && f.endsWith('.md') && !f.startsWith('00'));
if (!name) { console.error(`no prompt starting with "${want}" in prompts/`); process.exit(1); }
const body = (f) => readFile(path.join(root, f), 'utf8');
const strip = (md) => md.replace(/^---\n[\s\S]*?\n---\n/, '').trim();

const out = [
  strip(await body('prompts/00-scene-brief.md')),
  '## src/rig.js\n\n```js\n' + (await body('src/rig.js')).trim() + '\n```',
  '## src/styles/00-skeleton.js\n\n```js\n' + (await body('src/styles/00-skeleton.js')).trim() + '\n```',
  '## Your style\n\n' + strip(await body(`prompts/${name}`)),
  'Write `src/styles/' + name.replace(/\.md$/, '.js') + '`. Reply with the file only.',
].join('\n\n');
console.log(out);
