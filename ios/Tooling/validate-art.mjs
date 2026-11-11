import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Matrix4,Quaternion,Vector3,Box3} from 'three';
const ios=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..'),root=path.join(ios,'Resources/Generated/Art');
const chapter=JSON.parse(fs.readFileSync(path.join(ios,'Resources/Generated/chapter.json')));
let files=0,triangles=0,clips=0;
const bosses={},bossClips={idle:3,move:1.2,move_back:1.2,strafe_left:1.2,strafe_right:1.2,slam:1.8,charge:1.8,sweep:1.6,hurt:0.4,stagger:2,die:2.5};
for(const name of fs.readdirSync(root).filter(n=>n.endsWith('.json')&&!n.endsWith('-scene.json'))){
  const data=JSON.parse(fs.readFileSync(path.join(root,name))),bytes=fs.readFileSync(path.join(root,data.name+'.bin'));
  for(const g of data.geometries){
    assert.equal(g.positions.count%3,0);assert.equal(g.normals.count,g.positions.count);assert.equal(g.uv.count,g.positions.count/3*2);assert.equal(g.indices.count%3,0);
    for(const key of ['positions','normals','uv','indices']){const a=g[key];assert(a.offset>=0&&a.offset+a.count*4<=bytes.length);for(let i=0;i<a.count;i++){const value=key==='indices'?bytes.readUInt32LE(a.offset+i*4):bytes.readFloatLE(a.offset+i*4);assert(Number.isFinite(value));if(key==='indices')assert(value<g.positions.count/3);}}
  }
  for(const [i,n]of data.nodes.entries()){assert(n.parent<i);for(const draw of n.draws){assert(data.geometries[draw.geometry]);assert(data.materials[draw.material]);}}
  for(const m of data.materials)for(const key of ['map','normal','arm'])if(m[key])assert(fs.existsSync(path.join(root,m[key])));
  for(const[name,c]of Object.entries(data.animations)){
    clips++;for(const track of c.tracks){assert(data.nodes[track.node]);assert(['position','quaternion','scale'].includes(track.property));assert.equal(track.values.length,track.times.length*(track.property==='quaternion'?4:3));assert(track.values.every(Number.isFinite));assert(track.times.every((v,i)=>Number.isFinite(v)&&(i===0||v>=track.times[i-1])));}
    const timing=data.name==='hero'?chapter.timing[name]:name==='attack'?chapter.enemyAttack[data.name]:null;
    if(timing)assert(Math.abs(c.duration-timing.len/60)<0.002,`${data.name}/${name} animation no longer matches combat`);
  }
  if(['rotroot','rotroot_wraith'].includes(data.name)){
    assert(data.triangles<=220000,`${data.name}: triangle budget`);assert(data.nodes.length<=64,`${data.name}: node budget`);assert(data.materials.length<=6,`${data.name}: material budget`);
    for(const joint of ['chest','head','shoulder_left','shoulder_right','upper_left','upper_right','lower_left','lower_right','hand_left','hand_right'])assert(data.nodes.some(n=>n.name.startsWith(joint)&&!n.name.includes('surface')),`${data.name}: missing colossus joint ${joint}`);
    for(const material of data.materials.filter(m=>m.map)){
      assert(material.roughness>=.6,`${data.name}: weathered surface roughness`);
      assert(material.metallic<=.5,`${data.name}: weathered surface metallic`);
    }
    const matrices=data.nodes.map(()=>new Matrix4()),bounds=new Box3(),eyes=[];
    for(const[i,node]of data.nodes.entries()){
      matrices[i].compose(new Vector3().fromArray(node.position),new Quaternion().fromArray(node.rotation),new Vector3().fromArray(node.scale));
      if(node.parent>=0)matrices[i].premultiply(matrices[node.parent]);
      for(const draw of node.draws){
        const geometry=data.geometries[draw.geometry],glow=data.materials[draw.material].emission.some(v=>v>0);
        for(let j=0;j<geometry.positions.count;j+=3){
          const p=new Vector3(...[0,1,2].map(k=>bytes.readFloatLE(geometry.positions.offset+(j+k)*4))).applyMatrix4(matrices[i]);
          bounds.expandByPoint(p);
          let ancestor=i,head=false;while(ancestor>=0){if(data.nodes[ancestor].name.startsWith('head'))head=true;ancestor=data.nodes[ancestor].parent;}
          if(glow&&head)eyes.push(p.z);
        }
      }
    }
    // Every mapped face surface needs actual UV coverage after voxel fusion and mesh joining.
    for(const [i,node] of data.nodes.entries()) {
      let parent=i,isHead=false;while(parent>=0){if(data.nodes[parent].name.startsWith('head'))isHead=true;parent=data.nodes[parent].parent;}
      if(!isHead)continue;
      for(const draw of node.draws)if(data.materials[draw.material].map){
        const uv=data.geometries[draw.geometry].uv;let min=Infinity,max=-Infinity;
        for(let j=0;j<uv.count;j+=2){const u=bytes.readFloatLE(uv.offset+j*4);min=Math.min(min,u);max=Math.max(max,u);}
        assert(max-min>.01,`${data.name}: collapsed head UVs`);
      }
    }
    assert(bounds.max.y-bounds.min.y>=45&&bounds.max.y-bounds.min.y<=80,`${data.name}: giant scale`);
    assert(eyes.length>0&&eyes.reduce((a,b)=>a+b,0)/eyes.length>.1,`${data.name}: must face game +Z`);
    assert.deepEqual(Object.keys(data.animations).sort(),Object.keys(bossClips).sort());
    let maxJointStep=0,maxPlantedFootDrift=0;
    for(const[name,duration]of Object.entries(bossClips)){
      const clip=data.animations[name];assert(clip.tracks.length>0,`${data.name}/${name}: missing motion`);
      assert(Math.abs(clip.duration-duration)<0.002,`${data.name}/${name}: boss combat timing`);
      assert.equal(clip.loop,name==='idle'||name.startsWith('move')||name.startsWith('strafe'));
      if(clip.loop)for(const track of clip.tracks){
        const width=track.property==='quaternion'?4:3,last=track.values.length-width;
        const seam=width===4 ? new Quaternion().fromArray(track.values).normalize().angleTo(new Quaternion().fromArray(track.values,last).normalize()):new Vector3().fromArray(track.values).distanceTo(new Vector3().fromArray(track.values,last));
        assert(seam<.002,`${data.name}/${name}: loop seam at ${data.nodes[track.node].name}`);
      }
      for(const track of clip.tracks.filter(t=>t.property==='quaternion'))for(let i=1;i<track.times.length;i++){
        if(track.times[i]-track.times[i-1]>.018)continue;
        const a=new Quaternion().fromArray(track.values,(i-1)*4).normalize(),b=new Quaternion().fromArray(track.values,i*4).normalize();
        maxJointStep=Math.max(maxJointStep,a.angleTo(b));
        assert(a.angleTo(b)<.6,`${data.name}/${name}/${data.nodes[track.node].name}: abrupt joint flip`);
      }
    }
    assert(data.animations.slam.tracks.some(t=>data.nodes[t.node].name.startsWith('chest')&&t.property==='quaternion'&&t.values.some((v,i)=>i>=4&&Math.abs(v-t.values[i%4])>.01)),`${data.name}: torso must anticipate the palm impact`);
    bosses[data.name]={triangles:data.triangles,nodes:data.nodes.length,materials:data.materials.length,height:bounds.max.y-bounds.min.y,clips:Object.keys(data.animations),maxJointStep};
  }
  files++;triangles+=data.triangles;
}
assert(files>=17);assert(clips>=59);assert.equal(Object.keys(bosses).length,2);
const report={passed:true,files,triangles,clips,bosses,checks:['geometry buffer bounds','finite vertex attributes','triangle indices','material resources','hierarchy parents','animation tracks','source combat/animation timing','boss clips and budgets']};
fs.writeFileSync(path.join(ios,'build/art-validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
