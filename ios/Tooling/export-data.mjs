// Read-only extraction; all generated files are confined to ios/.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../..');
const require = createRequire(path.join(here, 'package.json'));
const ts = require('typescript');
const cache = new Map();
function load(name, parent = path.join(root, 'src')) {
  if (!name.startsWith('.')) return require(name);
  const file = path.resolve(parent, name.endsWith('.ts') ? name : `${name}.ts`);
  if (!file.startsWith(root + '/src/')) throw new Error('Source outside game');
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
  vm.runInThisContext(`(function(require,module,exports){${js}\n})`, {filename:file})(n=>load(n,path.dirname(file)),module,module.exports);
  return module.exports;
}
const world = load('./data/levels/world');
const iso = load('./data/levels/iso');
const grid = load('./world/IsoMap');
const {DUNGEONS} = load('./data/levels/dungeons');
const {ZH} = load('./i18n/zh');
const {TIMING} = load('./combat/HeroMachine');
const {FOES} = load('./combat/Foe');
const {ENEMY_ATTACK} = load('./actors/Enemies');
const {ENCOUNTERS} = load('./data/encounters');
const {SONGS} = load('./audio/MusicData');
const {compileSong} = load('./audio/MusicPlayer');
const {INSTRUMENTS} = load('./audio/Sampler');
const intro = fs.readFileSync(path.join(root,'src/scenes/IntroScene.ts'),'utf8');
const pages = [...intro.slice(intro.indexOf('const PAGES'),intro.indexOf('/** Ticks')).matchAll(/'([^']+)'/g)].map(x=>x[1]);
const out = path.join(root,'ios/Resources/Generated'); fs.mkdirSync(out,{recursive:true});
const data = {schema:1, world:world.WORLD_MAP, worldRows:grid.worldRows(), village:iso.HAIYA, road:iso.ROAD_S1, dungeon:DUNGEONS.d1, town:world.TOWNS.V, spirits:world.SPIRITS.filter(s=>s.group==='w1'), encounters:ENCOUNTERS, translations:ZH, intro:pages, timing:TIMING, foes:FOES, enemyAttack:ENEMY_ATTACK};
fs.writeFileSync(path.join(out,'chapter.json'),JSON.stringify(data));
fs.writeFileSync(path.join(out,'music-scores.json'),JSON.stringify({instruments:INSTRUMENTS,songs:Object.fromEntries(Object.entries(SONGS).filter(([k])=>!['TEMPLE','ENDING'].includes(k)).map(([k,v])=>[k,compileSong(v)]))}));
console.log(`Exported chapter 1 (${data.worldRows.length} world rows, ${data.road.length} road rows)`);
