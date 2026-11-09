import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const ios=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..'),root=path.join(ios,'Resources/Generated/Art');
const chapter=JSON.parse(fs.readFileSync(path.join(ios,'Resources/Generated/chapter.json')));
let files=0,triangles=0,clips=0;
for(const name of fs.readdirSync(root).filter(n=>n.endsWith('.json')&&!n.endsWith('-scene.json'))){
  const data=JSON.parse(fs.readFileSync(path.join(root,name))),bytes=fs.readFileSync(path.join(root,data.name+'.bin'));
  for(const g of data.geometries){
    assert.equal(g.positions.count%3,0);assert.equal(g.normals.count,g.positions.count);assert.equal(g.uv.count,g.positions.count/3*2);assert.equal(g.indices.count%3,0);
    for(const key of ['positions','normals','uv','indices']){const a=g[key];assert(a.offset>=0&&a.offset+a.count*4<=bytes.length);for(let i=0;i<a.count;i++){const value=key==='indices'?bytes.readUInt32LE(a.offset+i*4):bytes.readFloatLE(a.offset+i*4);assert(Number.isFinite(value));if(key==='indices')assert(value<g.positions.count/3);}}
  }
  for(const [i,n]of data.nodes.entries()){assert(n.parent<i);for(const draw of n.draws){assert(data.geometries[draw.geometry]);assert(data.materials[draw.material]);}}
  for(const m of data.materials)for(const key of ['map','normal','arm'])if(m[key])assert(fs.existsSync(path.join(root,m[key])));
  for(const[name,c]of Object.entries(data.animations)){
    clips++;for(const track of c.tracks){assert(data.nodes[track.node]);assert.equal(track.values.length,track.times.length*(track.property==='quaternion'?4:3));assert(track.times.every((v,i)=>i===0||v>=track.times[i-1]));}
    const timing=data.name==='hero'?chapter.timing[name]:name==='attack'?chapter.enemyAttack[data.name]:null;
    if(timing)assert(Math.abs(c.duration-timing.len/60)<0.002,`${data.name}/${name} animation no longer matches combat`);
  }
  files++;triangles+=data.triangles;
}
assert(files>=16);assert(clips>=43);
const report={passed:true,files,triangles,clips,checks:['geometry buffer bounds','finite vertex attributes','triangle indices','material resources','hierarchy parents','animation tracks','source combat/animation timing']};
fs.writeFileSync(path.join(ios,'build/art-validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
