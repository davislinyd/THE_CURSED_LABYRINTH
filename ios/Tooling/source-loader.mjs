import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
export const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'../..');
export const require=createRequire(import.meta.url);
const ts=require('typescript'),cache=new Map();
export function source(name,parent=path.join(root,'src')) {
  if(!name.startsWith('.'))return require(name);
  const file=path.resolve(parent,name.endsWith('.ts')?name:name+'.ts');
  if(!file.startsWith(root+'/src/'))throw new Error('Source outside game: '+file);
  if(cache.has(file))return cache.get(file).exports;
  const module={exports:{}};cache.set(file,module);
  const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInThisContext(`(function(require,module,exports){${js}\n})`,{filename:file})(n=>source(n,path.dirname(file)),module,module.exports);
  return module.exports;
}
