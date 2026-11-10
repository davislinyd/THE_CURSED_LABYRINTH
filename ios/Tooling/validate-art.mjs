import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Matrix4,Quaternion,Vector3,Box3} from 'three';
const ios=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..'),root=path.join(ios,'Resources/Generated/Art');
const chapter=JSON.parse(fs.readFileSync(path.join(ios,'Resources/Generated/chapter.json')));
let files=0,triangles=0,clips=0;
const bosses={},bossClips={idle:3,move:1.2,move_back:1.2,strafe_left:1.2,strafe_right:1.2,slam:1.8,sweep:1.6,hurt:0.4,stagger:2,die:2.5};
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
    assert(data.triangles<=24000,`${data.name}: triangle budget`);assert(data.nodes.length<=64,`${data.name}: node budget`);assert(data.materials.length<=3,`${data.name}: material budget`);
    for(const joint of ['chest','forearm1','forearm-1','hand1','hand-1','shin1','shin-1','foot1','foot-1','shoulder1','shoulder-1'])assert(data.nodes.some(n=>n.name===joint),`${data.name}: missing articulated joint ${joint}`);
    for(const material of data.materials.filter(m=>m.map)){
      assert(material.roughness>=.95,`${data.name}: weathered surface roughness`);
      assert(material.metallic<=.05,`${data.name}: weathered surface metallic`);
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
          if(glow&&node.name.includes('head')&&p.y<6.3)eyes.push(p.z);
        }
      }
    }
    assert(bounds.max.y-bounds.min.y>=7&&bounds.max.y-bounds.min.y<=10,`${data.name}: giant scale`);
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
      if(name==='slam'||name==='sweep'){
        const planted=new Map();
        for(let frame=0;frame<=Math.round(duration*60);frame++){
          const time=frame/60,poses=data.nodes.map(n=>({position:new Vector3().fromArray(n.position),quaternion:new Quaternion().fromArray(n.rotation),scale:new Vector3().fromArray(n.scale)}));
          for(const track of clip.tracks){
            let a=0;while(a+1<track.times.length&&track.times[a+1]<=time)a++;
            const b=Math.min(a+1,track.times.length-1),weight=track.times[b]>track.times[a]?(time-track.times[a])/(track.times[b]-track.times[a]):0;
            if(track.property==='quaternion')poses[track.node].quaternion.slerpQuaternions(new Quaternion().fromArray(track.values,a*4),new Quaternion().fromArray(track.values,b*4),weight);
            else poses[track.node][track.property].lerpVectors(new Vector3().fromArray(track.values,a*3),new Vector3().fromArray(track.values,b*3),weight);
          }
          for(const[i,node]of data.nodes.entries()){
            const p=poses[i];matrices[i].compose(p.position,p.quaternion,p.scale);
            if(node.parent>=0)matrices[i].premultiply(matrices[node.parent]);
            if(node.name==='foot1'||node.name==='foot-1'){
              const foot=new Vector3().setFromMatrixPosition(matrices[i]);
              if(frame===0)planted.set(i,foot.clone());
              maxPlantedFootDrift=Math.max(maxPlantedFootDrift,foot.distanceTo(planted.get(i)));
            }
          }
        }
      }
    }
    assert(maxPlantedFootDrift<.005,`${data.name}: boots slide during planted attacks`);
    assert(data.animations.move.tracks.some(track=>data.nodes[track.node].name.startsWith('leg')&&track.property==='quaternion'&&track.values.some((v,i)=>i>=4&&Math.abs(v-track.values[i%4])>.05)),`${data.name}: moving legs`);
    bosses[data.name]={triangles:data.triangles,nodes:data.nodes.length,materials:data.materials.length,height:bounds.max.y-bounds.min.y,clips:Object.keys(data.animations),maxJointStep,maxPlantedFootDrift};
  }
  files++;triangles+=data.triangles;
}
assert(files>=17);assert(clips>=57);assert.equal(Object.keys(bosses).length,2);
const report={passed:true,files,triangles,clips,bosses,checks:['geometry buffer bounds','finite vertex attributes','triangle indices','material resources','hierarchy parents','animation tracks','source combat/animation timing','boss clips and budgets']};
fs.writeFileSync(path.join(ios,'build/art-validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
