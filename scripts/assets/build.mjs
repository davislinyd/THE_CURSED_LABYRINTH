// Downloads the third-party assets listed in sources.mjs into assets-src/ and
// builds public/assets/ (audio m4a, webp textures, reduced glb models),
// public/assets/manifest.json, public/licenses/ and CREDITS.md.
//
//   npm run assets    fetch what is missing, then build
//
// Needs ffmpeg, cwebp and unzip on PATH.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FONTS, HDRIS, INSTRUMENTS, KENNEY_PACKS, MODELS, ORIGINAL_MODELS, PERCUSSION, SFX, SOURCES, TEXTURES } from './sources.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = join(ROOT, 'assets-src');
const PUB = join(ROOT, 'public');
const OUT = join(PUB, 'assets');
const HEADERS = { 'User-Agent': 'asset-build-script' };
const GLTF = join(ROOT, 'node_modules/.bin/gltf-transform');

// ---------------------------------------------------------------- helpers

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mkdirFor = (file) => mkdirSync(dirname(file), { recursive: true });
const newer = (out, src) => existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs;

async function download(url, file, headers = {}) {
  if (existsSync(file)) return file;
  mkdirFor(file);
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { ...HEADERS, ...headers } });
    if (res.ok) {
      writeFileSync(file + '.part', Buffer.from(await res.arrayBuffer()));
      renameSync(file + '.part', file);
      return file;
    }
    if (attempt >= 4 || res.status === 404) throw new Error(`HTTP ${res.status} for ${url}`);
    await sleep(1500 * attempt);
  }
}

const getJson = async (url, file) => JSON.parse(readFileSync(await download(url, file), 'utf8'));

function exec(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [];
    let err = '';
    p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`${cmd} ${args.join(' ')}\n${err.slice(-1500)}`))));
  });
}

async function pool(items, n, fn) {
  const queue = [...items];
  await Promise.all(Array.from({ length: n }, async () => {
    while (queue.length) await fn(queue.shift());
  }));
}

// ---------------------------------------------------------------- sources

/** GitHub sample libraries, pinned to the commit seen on first download. */
const REPOS = { vsco2ce: 'sgossner/VSCO-2-CE', vcsl: 'sgossner/VCSL' };
const repoInfo = {};

async function repo(key) {
  if (repoInfo[key]) return repoInfo[key];
  const file = join(SRC, key, 'tree.json');
  if (!existsSync(file)) {
    const commit = (await getJson(`https://api.github.com/repos/${REPOS[key]}/commits/HEAD`, join(SRC, key, 'commit.json'))).sha;
    const tree = await getJson(`https://api.github.com/repos/${REPOS[key]}/git/trees/${commit}?recursive=1`, join(SRC, key, 'tree-raw.json'));
    writeFileSync(file, JSON.stringify({ commit, paths: tree.tree.filter((t) => t.type === 'blob').map((t) => t.path) }));
  }
  return (repoInfo[key] = JSON.parse(readFileSync(file, 'utf8')));
}

async function repoFile(key, path) {
  const { commit } = await repo(key);
  const url = `https://raw.githubusercontent.com/${REPOS[key]}/${commit}/${path.split('/').map(encodeURIComponent).join('/')}`;
  return download(url, join(SRC, key, path));
}

const repoUrl = (key, path) => `https://github.com/${REPOS[key]}/tree/${repoInfo[key].commit}/${path.split('/').map(encodeURIComponent).join('/')}`;

const polyhaven = (path) => getJson(`https://api.polyhaven.com/${path}`, join(SRC, 'polyhaven', 'api', `${path.replace(/\//g, '_')}.json`));
const phAuthor = (info) => Object.keys(info.authors ?? {}).join(', ');

async function kenneyPack(pack) {
  const dir = join(SRC, 'kenney', pack);
  if (existsSync(dir)) return dir;
  const page = `https://kenney.nl/assets/${pack}`;
  const res = await fetch(page, { headers: HEADERS });
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const id = Buffer.from(`assets/${pack}`).toString('hex');
  const link = await (await fetch(`https://kenney.nl/download-link/${id}`, { headers: { ...HEADERS, cookie, referer: page } })).json();
  if (!link.url) throw new Error(`no download link for kenney ${pack}: ${JSON.stringify(link)}`);
  const zip = await download(link.url, join(SRC, 'kenney', `${pack}.zip`));
  await exec('unzip', ['-q', '-o', zip, '-d', dir]);
  return dir;
}

// ---------------------------------------------------------------- audio

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const DYN = { pppp: 0, ppp: 1, pp: 2, p: 3, mp: 4, mf: 5, f: 6, ff: 7, fff: 8 };

/** Note, dynamic layer and round robin from a sample file name such as `VlnEns_Spic_F#3_v2_rr1.wav`. */
function parseSampleName(file) {
  const base = file.replace(/\.wav$/i, '');
  const n = base.match(/(?:^|_)([A-Ga-g])(#?)(-?\d)(?=_|$)/);
  if (!n) return null;
  const v = base.match(/_v(\d+)/i);
  const d = base.match(/_(pppp|ppp|pp|p|mp|mf|f|ff|fff)(?=_|$)/);
  const rr = base.match(/_rr(\d+)/i) ?? base.match(/_(\d+)$/);
  return {
    midi: 12 * (Number(n[3]) + 1) + NOTE[n[1].toUpperCase()] + (n[2] ? 1 : 0),
    layer: v ? Number(v[1]) : d ? DYN[d[1]] : 0,
    rr: rr ? Number(rr[1]) : 1,
  };
}

const TRIM_HEAD = 'silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.004';
const TRIM_TAIL = 'areverse,silenceremove=start_periods=1:start_threshold=-66dB:start_silence=0.05,areverse';

/** Which source and settings produced each audio output (output names can be reused by another source). */
const encodedFile = join(SRC, 'encoded.json');
const encoded = existsSync(encodedFile) ? JSON.parse(readFileSync(encodedFile, 'utf8')) : {};

/** Trim silence, cap the length with a short fade, encode AAC. */
async function encodeAudio(src, out, maxSeconds) {
  const stamp = `${relative(SRC, src)}|${maxSeconds}`;
  if (newer(out, src) && encoded[relative(OUT, out)] === stamp) return;
  encoded[relative(OUT, out)] = stamp;
  mkdirFor(out);
  const fade = Math.min(0.4, maxSeconds * 0.2);
  const af = `${TRIM_HEAD},${TRIM_TAIL},atrim=0:${maxSeconds},afade=t=out:st=${maxSeconds - fade}:d=${fade}`;
  // mono at 32 kHz: tracks are panned and reverberated by the game, and decoded samples stay small
  await exec('ffmpeg', ['-v', 'error', '-y', '-i', src, '-af', af, '-ac', '1', '-ar', '32000', '-c:a', 'aac', '-b:a', '80k', '-movflags', '+faststart', out]);
}

/** Fundamental frequency (YIN) of the sustained part of a sample, or null. */
async function detectPitch(src) {
  const sr = 22050;
  const raw = await exec('ffmpeg', ['-v', 'error', '-i', src, '-af', `${TRIM_HEAD},aformat=channel_layouts=mono`, '-ar', String(sr), '-t', '1.2', '-f', 'f32le', '-']);
  const all = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength >> 2);
  const start = Math.min(Math.floor(0.15 * sr), Math.floor(all.length * 0.3));
  const buf = all.subarray(start);
  const W = 2048, minLag = Math.floor(sr / 2500), maxLag = Math.min(Math.floor(sr / 28), buf.length - W - 1);
  if (maxLag <= minLag) return null;
  const c = new Float32Array(maxLag + 2);
  let sum = 0;
  c[0] = 1;
  for (let tau = 1; tau <= maxLag + 1; tau++) {
    let s = 0;
    for (let i = 0; i < W; i++) {
      const x = buf[i] - buf[i + tau];
      s += x * x;
    }
    sum += s;
    c[tau] = sum > 0 ? (s * tau) / sum : 1;
  }
  let tau = -1;
  for (let t = minLag; t <= maxLag; t++) {
    if (c[t] < 0.12) {
      while (t < maxLag && c[t + 1] < c[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) {
    let best = Infinity;
    for (let t = minLag; t <= maxLag; t++) if (c[t] < best) [best, tau] = [c[t], t];
    if (best > 0.35) return null;
  }
  const a = c[tau - 1], b = c[tau], d = c[tau + 1];
  const den = a - 2 * b + d;
  return sr / (tau + (den ? (a - d) / (2 * den) : 0));
}

const pitchCacheFile = join(SRC, 'pitch-cache.json');
const pitchCache = existsSync(pitchCacheFile) ? JSON.parse(readFileSync(pitchCacheFile, 'utf8')) : {};

async function buildInstrument(id, def, assets, report) {
  const { paths } = await repo(def.repo);
  const files = paths.filter((p) => p.startsWith(def.dir + '/') && !p.slice(def.dir.length + 1).includes('/') && def.pick.test(p));
  if (!files.length) throw new Error(`instrument ${id}: no files in ${def.dir}`);
  const samples = [];
  for (const path of files) {
    const meta = parseSampleName(path.split('/').pop());
    if (!meta) throw new Error(`instrument ${id}: cannot read the note of ${path}`);
    samples.push({ path, ...meta, src: await repoFile(def.repo, path) });
  }
  // octave numbering: vote with detected pitches
  const votes = new Map();
  let reliable = 0;
  await pool(samples, 8, async (s) => {
    const key = `${def.repo}/${s.path}`;
    if (!(key in pitchCache)) pitchCache[key] = await detectPitch(s.src);
    const hz = pitchCache[key];
    if (!hz) return;
    const diff = 69 + 12 * Math.log2(hz / 440) - s.midi;
    const k = Math.round(diff / 12);
    if (Math.abs(diff - 12 * k) < 0.6) {
      reliable++;
      votes.set(k, (votes.get(k) ?? 0) + 1);
    }
  });
  const [octave, count] = def.octave !== undefined ? [def.octave, samples.length] : ([...votes].sort((a, b) => b[1] - a[1])[0] ?? [0, 0]);
  report.push(`${id.padEnd(10)} ${String(samples.length).padStart(3)} samples, octave ${octave >= 0 ? '+' : ''}${octave} (${def.octave !== undefined ? 'set by hand' : `${count}/${samples.length} agree`}, ${reliable} pitched)`);
  if (count < Math.max(2, samples.length * 0.5)) throw new Error(`instrument ${id}: pitch detection is not conclusive, set \`octave\` by ear in sources.mjs`);
  const layers = [...new Set(samples.map((s) => s.layer))].sort((a, b) => a - b);
  const out = [];
  await pool(samples, 8, async (s) => {
    const n = s.midi + 12 * octave;
    const v = layers.indexOf(s.layer) + 1;
    const file = `audio/inst/${id}/${n}_${v}_${s.rr}.m4a`;
    await encodeAudio(s.src, join(OUT, file), def.max);
    out.push({ f: file, n, v: +(v / layers.length).toFixed(3), r: s.rr });
  });
  out.sort((a, b) => a.n - b.n || a.v - b.v || a.r - b.r);
  assets[`inst/${id}`] = { kind: 'instrument', source: def.repo, origin: repoUrl(def.repo, def.dir), files: out.map((s) => s.f), samples: out };
}

// ---------------------------------------------------------------- images and models

async function buildTexture(id, assets) {
  const files = await polyhaven(`files/${id}`);
  const info = await polyhaven(`info/${id}`);
  const maps = { diff: [files.Diffuse, 84], nor: [files.nor_gl, 90], arm: [files.arm, 84] };
  const out = [];
  for (const [name, [entry, q]] of Object.entries(maps)) {
    const src = await download(entry['1k'].jpg.url, join(SRC, 'polyhaven', 'tex', id, `${name}.jpg`));
    const file = `assets/tex/${id}/${name}.webp`;
    if (!newer(join(PUB, file), src)) {
      mkdirFor(join(PUB, file));
      await exec('cwebp', ['-quiet', '-mt', '-m', '6', '-q', String(q), src, '-o', join(PUB, file)]);
    }
    out.push(file.slice('assets/'.length));
  }
  assets[`tex/${id}`] = { kind: 'texture', source: 'polyhaven', origin: `https://polyhaven.com/a/${id}`, author: phAuthor(info), files: out };
}

/** Triangle count of a .glb (indexed or not). */
function glbTriangles(file) {
  const buf = readFileSync(file);
  const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
  let tris = 0;
  for (const mesh of json.meshes ?? []) {
    for (const p of mesh.primitives) {
      if ((p.mode ?? 4) !== 4) continue;
      tris += json.accessors[p.indices ?? p.attributes.POSITION].count / 3;
    }
  }
  return Math.round(tris);
}

// web_samurai: one node per joint of the rig (scripts/blender/web_hero.py)
const KEEP_PARTS = new Set(['treasure_chest', 'banner_torn', 'web_samurai']);

async function buildModel(id, budget, assets) {
  const files = await polyhaven(`files/${id}`);
  const info = await polyhaven(`info/${id}`);
  const g = files.gltf['1k'].gltf;
  const dir = join(SRC, 'polyhaven', 'models', id);
  const src = await download(g.url, join(dir, `${id}.gltf`));
  for (const [rel, f] of Object.entries(g.include ?? {})) await download(f.url, join(dir, rel));
  const file = `models/${id}.glb`;
  const out = join(OUT, file);
  if (!newer(out, src)) {
    mkdirFor(out);
    const ratio = budget ? Math.min(1, budget / (info.polycount || budget)) : 1;
    const simplify = ratio < 1 ? ['--simplify', 'true', '--simplify-ratio', ratio.toFixed(4), '--simplify-error', '0.02'] : ['--simplify', 'false'];
    // models with moving parts (a chest lid) keep their nodes
    const keep = KEEP_PARTS.has(id) ? ['--flatten', 'false', '--join', 'false'] : [];
    await exec(GLTF, ['optimize', src, out, '--compress', 'false', '--texture-compress', 'webp', '--texture-size', '512', '--palette', 'false', '--instance', 'false', ...keep, ...simplify]);
  }
  const tris = glbTriangles(out);
  if (budget && tris > budget * 1.6) console.warn(`  ! ${id}: ${tris} triangles (budget ${budget})`);
  assets[`model/${id}`] = { kind: 'model', source: 'polyhaven', origin: `https://polyhaven.com/a/${id}`, author: phAuthor(info), files: [file], tris };
}

/** A model exported from Blender by scripts/blender/props.py. */
async function buildOriginal(id, assets) {
  const src = join(ROOT, 'scripts/blender/export', `${id}.glb`);
  if (!existsSync(src)) throw new Error(`original model ${id}: run scripts/blender/props.py in Blender`);
  const file = `models/${id}.glb`;
  const out = join(OUT, file);
  if (!newer(out, src)) {
    mkdirFor(out);
    // vertex colours carry the weathering; the banner keeps its cloth as a separate node so it can sway
    const keep = KEEP_PARTS.has(id) ? ['--flatten', 'false', '--join', 'false'] : [];
    await exec(GLTF, ['optimize', src, out, '--compress', 'false', '--palette', 'false', '--instance', 'false', '--simplify', 'false', ...keep]);
  }
  assets[`model/${id}`] = { kind: 'model', source: 'original', origin: `scripts/blender/export/${id}.glb`, files: [file], tris: glbTriangles(out) };
}

async function buildHdri(id, assets) {
  const files = await polyhaven(`files/${id}`);
  const info = await polyhaven(`info/${id}`);
  const src = await download(files.hdri['1k'].hdr.url, join(SRC, 'polyhaven', 'hdri', `${id}.hdr`));
  const file = `hdri/${id}.hdr`;
  if (!newer(join(OUT, file), src)) {
    mkdirFor(join(OUT, file));
    writeFileSync(join(OUT, file), readFileSync(src));
  }
  assets[`hdri/${id}`] = { kind: 'hdri', source: 'polyhaven', origin: `https://polyhaven.com/a/${id}`, author: phAuthor(info), files: [file] };
}

// ---------------------------------------------------------------- output

const LICENSE_FILES = { 'CC0-1.0': 'CC0-1.0.txt' };

function writeCredits(assets) {
  const by = (kind) => Object.entries(assets).filter(([, a]) => a.kind === kind);
  const lines = [
    '# Credits',
    '',
    '幽燈魔境 THE CURSED LABYRINTH is an original work. Its code, story, characters, music',
    'compositions and interface are original. It uses the third-party assets below.',
    'CC0 assets are in the public domain and are credited here with thanks.',
    '',
    '_This file is generated by `npm run assets` from `scripts/assets/sources.mjs`._',
    '',
    '## Fonts',
    '',
  ];
  for (const [, a] of by('font')) {
    const s = SOURCES[a.source];
    lines.push(`- **${s.title}** — ${s.author}, ${s.license} (\`public/licenses/${s.licenseFile}\`) — ${s.url}`);
  }
  lines.push('', '## Textures, models and lighting — Poly Haven (CC0-1.0)', '', '| Asset | Type | Author |', '|---|---|---|');
  for (const kind of ['texture', 'model', 'hdri']) {
    for (const [key, a] of by(kind)) if (a.source === 'polyhaven') lines.push(`| [${key.split('/')[1]}](${a.origin}) | ${kind} | ${a.author} |`);
  }
  const own = by('model').filter(([, a]) => a.source === 'original').map(([key]) => key.split('/')[1]);
  lines.push('', `## ${SOURCES.original.title}`, '', `Modelled for this game in Blender (\`${SOURCES.original.url}/props.py\`, \`web_hero.py\`): ${own.join(', ')}.`);
  for (const repoKey of ['vsco2ce', 'vcsl']) {
    const s = SOURCES[repoKey];
    lines.push('', `## Instrument samples — ${s.title} (${s.license})`, '', `${s.author}, ${s.url}`, '');
    for (const [key, a] of [...by('instrument'), ...by('percussion')]) {
      if (a.source === repoKey) lines.push(`- \`${key}\` — ${decodeURIComponent(a.origin.split('/tree/')[1].replace(/^[0-9a-f]+\//, ''))}`);
    }
  }
  const k = SOURCES.kenney;
  lines.push('', `## Sound effects — ${k.title} (${k.license})`, '', `${k.author}: ${KENNEY_PACKS.map((p) => `[${p}](https://kenney.nl/assets/${p})`).join(', ')}`, '');
  writeFileSync(join(ROOT, 'CREDITS.md'), lines.join('\n') + '\n');
}

/** Remove files in public/assets that this build did not produce. */
function pruneOutputs(keep) {
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
  for (const file of walk(OUT)) {
    const rel = relative(OUT, file);
    if (rel !== 'manifest.json' && !keep.has(rel)) {
      rmSync(file);
      console.log(`  removed stale ${rel}`);
    }
  }
}

// ---------------------------------------------------------------- main

async function main() {
  const assets = {};
  const report = [];
  mkdirSync(OUT, { recursive: true });

  console.log('licenses');
  await download('https://creativecommons.org/publicdomain/zero/1.0/legalcode.txt', join(PUB, 'licenses', LICENSE_FILES['CC0-1.0']));

  console.log('kenney packs');
  const kenneyDirs = {};
  for (const p of KENNEY_PACKS) kenneyDirs[p] = await kenneyPack(p);

  console.log('instruments');
  for (const [id, def] of Object.entries(INSTRUMENTS)) {
    await buildInstrument(id, def, assets, report);
  }
  writeFileSync(pitchCacheFile, JSON.stringify(pitchCache, null, 1));

  console.log('percussion');
  await pool(Object.entries(PERCUSSION), 8, async ([name, [key, path]]) => {
    const src = await repoFile(key, path);
    const file = `audio/perc/${name}.m4a`;
    await encodeAudio(src, join(OUT, file), /gong|cym|roll/.test(name) ? 6 : 3);
    assets[`perc/${name}`] = { kind: 'percussion', source: key, origin: repoUrl(key, path), files: [file] };
  });

  console.log('sound effects');
  await pool(Object.entries(SFX), 8, async ([name, [pack, path]]) => {
    const src = join(kenneyDirs[pack], path);
    if (!existsSync(src)) throw new Error(`sfx ${name}: missing ${pack}/${path}`);
    const file = `audio/sfx/${name}.m4a`;
    await encodeAudio(src, join(OUT, file), 4);
    assets[`sfx/${name}`] = { kind: 'sfx', source: 'kenney', origin: `https://kenney.nl/assets/${pack}`, files: [file] };
  });

  console.log('textures');
  await pool(TEXTURES, 6, (id) => buildTexture(id, assets));
  console.log('models');
  for (const [id, budget] of Object.entries(MODELS)) await buildModel(id, budget, assets);
  for (const id of ORIGINAL_MODELS) await buildOriginal(id, assets);
  console.log('hdri');
  for (const id of HDRIS) await buildHdri(id, assets);

  // fonts live in public/fonts (scripts/subset_fonts.py); paths in the manifest are relative to public/assets
  for (const [id, f] of Object.entries(FONTS)) assets[`font/${id}`] = { kind: 'font', source: f.source, origin: SOURCES[f.source].url, files: [`../${f.file}`] };

  const sorted = Object.fromEntries(Object.entries(assets).sort(([a], [b]) => a.localeCompare(b)));
  const sources = Object.fromEntries(Object.entries(SOURCES).map(([k, s]) => [k, { ...s, licenseFile: s.licenseFile ?? LICENSE_FILES[s.license] }]));
  writeFileSync(encodedFile, JSON.stringify(encoded, null, 1));
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({ sources, assets: sorted }, null, 1) + '\n');
  writeCredits(sorted);
  pruneOutputs(new Set(Object.values(sorted).flatMap((a) => a.files).filter((f) => !f.startsWith('../'))));

  console.log('\n' + report.join('\n'));
  const total = (prefix) => Object.values(sorted).flatMap((a) => a.files).filter((f) => f.startsWith(prefix)).reduce((s, f) => s + statSync(join(OUT, f)).size, 0);
  for (const p of ['audio/', 'tex/', 'models/', 'hdri/']) console.log(`${p.padEnd(8)} ${(total(p) / 1048576).toFixed(1)} MB`);
}

main().catch((e) => {
  writeFileSync(pitchCacheFile, JSON.stringify(pitchCache, null, 1));
  console.error(e);
  process.exit(1);
});
