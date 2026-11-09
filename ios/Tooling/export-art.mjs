// The browser's procedural artwork is evaluated only by this offline build tool.
// The iPhone renders the resulting meshes/materials and samples animation tracks in Swift.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {root,require,source} from './source-loader.mjs';
const THREE=require('three');
const {createCanvas,loadImage,ImageData}=require('@napi-rs/canvas');
globalThis.document={createElement:kind=>{if(kind==='canvas')return createCanvas(1,1);throw new Error(kind);}};
globalThis.self=globalThis;
globalThis.createImageBitmap=async blob=>loadImage(Buffer.from(await blob.arrayBuffer()));
globalThis.ProgressEvent=class{constructor(type,values){Object.assign(this,{type},values);}};
const destination=path.join(root,'ios/Resources/Generated/Art'),out=path.join(root,'ios/build',`art-staging-${process.pid}`);fs.mkdirSync(out,{recursive:true});
function publish(){
  if(fs.existsSync(destination))fs.renameSync(destination,path.join(root,'ios/build',`art-backup-${Date.now()}`));
  fs.renameSync(out,destination);
}
let random=71;Math.random=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random/4294967296;};
const {GLTFLoader}=require('three/addons/loaders/GLTFLoader.js');
const textureCache=new Map(),modelCache=new Map();
async function texture(file,srgb=true){
  const id=file+srgb;if(textureCache.has(id))return textureCache.get(id);
  const image=await loadImage(path.join(root,'public/assets',file)),t=new THREE.Texture(image);
  t.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.needsUpdate=true;
  textureCache.set(id,t);return t;
}
const assets={
  async textures(id){const [map,normalMap,armMap]=await Promise.all([texture(`tex/${id}/diff.webp`),texture(`tex/${id}/nor.webp`,false),texture(`tex/${id}/arm.webp`,false)]);return{map,normalMap,armMap};},
  async material(id,repeat=1,params={}){const t=await this.textures(id);const tile=a=>{const b=a.clone();b.repeat.setScalar(repeat);return b;};return new THREE.MeshStandardMaterial({map:tile(t.map),normalMap:tile(t.normalMap),roughnessMap:tile(t.armMap),aoMap:tile(t.armMap),metalnessMap:tile(t.armMap),...params});},
  async model(id){
    if(!modelCache.has(id)){
      const bytes=fs.readFileSync(path.join(root,'public/assets/models',id+'.glb')),model=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
      model.scene.traverse(bakeVertexColor);modelCache.set(id,model);
    }
    return modelCache.get(id).scene.clone(true);
  }
};
// RealityKit's MeshDescriptor has no generic vertex-color channel. Bake the original
// interpolated vertex pigment into a tiny triangle atlas rather than losing weathering.
function bakeVertexColor(object){
  if(!object.isMesh||!object.geometry.attributes.color||Array.isArray(object.material))return;
  const g=object.geometry.index?object.geometry.toNonIndexed():object.geometry.clone(),colors=g.attributes.color;
  const triangles=g.attributes.position.count/3,tile=6,columns=Math.ceil(Math.sqrt(triangles)),canvas=createCanvas(columns*tile,Math.ceil(triangles/columns)*tile),ctx=canvas.getContext('2d'),image=ctx.createImageData(canvas.width,canvas.height),uv=new Float32Array(triangles*6);
  const encode=v=>Math.round(255*(v<=0.0031308?v*12.92:1.055*Math.pow(Math.max(0,v),1/2.4)-0.055));
  for(let t=0;t<triangles;t++){
    const x0=t%columns*tile,y0=Math.floor(t/columns)*tile;
    for(let y=0;y<tile;y++)for(let x=0;x<tile;x++){
      let a=Math.max(0,Math.min(1,(x-1)/3)),b=Math.max(0,Math.min(1,(y-1)/3));if(a+b>1){const sum=a+b;a/=sum;b/=sum;}
      const o=((y0+y)*canvas.width+x0+x)*4;
      for(let c=0;c<3;c++)image.data[o+c]=encode(colors.getComponent(t*3,c)*(1-a-b)+colors.getComponent(t*3+1,c)*a+colors.getComponent(t*3+2,c)*b);
      image.data[o+3]=255;
    }
    uv.set([(x0+1.5)/canvas.width,1-(y0+1.5)/canvas.height,(x0+4.5)/canvas.width,1-(y0+1.5)/canvas.height,(x0+1.5)/canvas.width,1-(y0+4.5)/canvas.height],t*6);
  }
  ctx.putImageData(image,0,0);g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.deleteAttribute('color');object.geometry=g;
  const material=object.material.clone();material.vertexColors=false;material.map=new THREE.CanvasTexture(canvas);material.map.colorSpace=THREE.SRGBColorSpace;object.material=material;
}
class Pack{
  constructor(name){this.name=name;this.bytes=[];this.offset=0;this.geometries=[];this.materials=[];this.nodes=[];this.images=new Map();this.geometryCache=new Map();this.materialCache=new Map();this.triangles=0;}
  array(array,type){const typed=type==='u32'?new Uint32Array(array):new Float32Array(array),b=Buffer.from(typed.buffer);const entry={offset:this.offset,count:array.length};this.bytes.push(b);this.offset+=b.length;return entry;}
  image(texture){
    if(!texture?.image)return null;
    const source=texture.image;if(this.images.has(source))return this.images.get(source);
    const canvas=createCanvas(source.width,source.height),g=canvas.getContext('2d');
    if(ArrayBuffer.isView(source.data))g.putImageData(new ImageData(new Uint8ClampedArray(source.data),source.width,source.height),0,0);else g.drawImage(source,0,0);
    const bytes=canvas.toBuffer('image/png'),id='texture-'+createHash('sha256').update(bytes).digest('hex').slice(0,20)+'.png';
    if(!fs.existsSync(path.join(out,id)))fs.writeFileSync(path.join(out,id),bytes);this.images.set(source,id);return id;
  }
  material(m){
    if(this.materialCache.has(m.uuid))return this.materialCache.get(m.uuid);
    const index=this.materials.length;this.materialCache.set(m.uuid,index);
    this.materials.push({color:m.color?.toArray()??[1,1,1],roughness:m.roughness??1,metallic:m.metalness??0,emission:m.emissive?.toArray().map(x=>x*(m.emissiveIntensity??1))??[0,0,0],unlit:!!m.isMeshBasicMaterial||!!m.isSpriteMaterial,opacity:m.opacity??1,transparent:!!m.transparent,alphaTest:m.alphaTest??0,doubleSided:m.side===THREE.DoubleSide,backSide:m.side===THREE.BackSide,map:this.image(m.map),normal:this.image(m.normalMap),arm:this.image(m.roughnessMap),uvScale:m.map?.repeat.toArray()??[1,1],uvOffset:m.map?.offset.toArray()??[0,0],flipY:m.map?.flipY??true});return index;
  }
  geometry(g,group=null){
    const key=g.uuid+JSON.stringify(group);if(this.geometryCache.has(key))return this.geometryCache.get(key);
    const read=(a,n)=>Array.from({length:a.count*n},(_,i)=>a.getComponent(Math.floor(i/n),i%n));
    const positions=read(g.attributes.position,3),normals=g.attributes.normal?read(g.attributes.normal,3):new Array(positions.length).fill(0),uv=g.attributes.uv?read(g.attributes.uv,2):new Array(positions.length/3*2).fill(0);
    let indices=g.index?Array.from(g.index.array):Array.from({length:positions.length/3},(_,i)=>i);
    if(group)indices=indices.slice(group.start,group.start+group.count);
    const id=this.geometries.length;this.geometryCache.set(key,id);this.triangles+=indices.length/3;
    this.geometries.push({positions:this.array(positions),normals:this.array(normals),uv:this.array(uv),indices:this.array(indices,'u32')});return id;
  }
  tree(object,parent=-1){
    const index=this.nodes.length;object.userData.nativeIndex=index;
    const n={name:object.name||`node${index}`,parent,position:object.position.toArray(),rotation:object.quaternion.toArray(),scale:object.scale.toArray(),draws:[],billboard:!!object.isSprite};this.nodes.push(n);
    if(object.isMesh){
      const ms=Array.isArray(object.material)?object.material:[object.material];
      if(ms.length>1){for(const group of object.geometry.groups)n.draws.push({geometry:this.geometry(object.geometry,group),material:this.material(ms[group.materialIndex])});}
      else n.draws.push({geometry:this.geometry(object.geometry),material:this.material(ms[0])});
    }else if(object.isSprite){const geo=new THREE.PlaneGeometry(1,1);n.draws.push({geometry:this.geometry(geo),material:this.material(object.material)});}
    for(const child of object.children)if(!child.isLight&&!child.isCamera)this.tree(child,index);
    return index;
  }
  write(animations={}){
    fs.writeFileSync(path.join(out,this.name+'.bin'),Buffer.concat(this.bytes));
    const data={schema:1,name:this.name,geometries:this.geometries,materials:this.materials,nodes:this.nodes,animations,triangles:this.triangles};
    fs.writeFileSync(path.join(out,this.name+'.json'),JSON.stringify(data));console.log(`${this.name}: ${this.nodes.length} nodes, ${this.geometries.length} geometries, ${Math.round(this.triangles)} triangles, ${Object.keys(animations).length} clips`);
  }
}
function clips(pack,object,animations){
  const result={};
  for(const[name,clip]of Object.entries(animations)){
    result[name]={duration:clip.duration,loop:['idle','run','move','guard'].includes(name),tracks:clip.tracks.map(track=>{
      const dot=track.name.lastIndexOf('.'),node=object.getObjectByName(track.name.slice(0,dot));if(!node)throw new Error('Unbound animation '+track.name);
      return{node:node.userData.nativeIndex,property:track.name.slice(dot+1),times:Array.from(track.times),values:Array.from(track.values)};
    })};
  }return result;
}
function procedural(pack,make,states){
  const result={};
  for(const[name,duration]of Object.entries(states)){
    const model=make();model.play(name,0);model.update(0);
    const objects=[];model.root.traverse(o=>{if(!o.isLight&&!o.isCamera)objects.push(o);});
    if(objects.length!==pack.nodes.length)throw new Error('Unstable hierarchy');
    const samples=objects.map(()=>({position:[],quaternion:[],scale:[]})),times=[];
    for(let tick=0;tick<=Math.round(duration*60);tick++){
      if(tick)model.update(1/60);times.push(tick/60);
      objects.forEach((o,i)=>{samples[i].position.push(...o.position.toArray());samples[i].quaternion.push(...o.quaternion.toArray());samples[i].scale.push(...o.scale.toArray());});
    }
    const tracks=[];
    samples.forEach((properties,node)=>{for(const[property,values]of Object.entries(properties)){
      const width=property==='quaternion'?4:3;
      if(values.some((v,i)=>i>=width&&Math.abs(v-values[i%width])>0.0001))tracks.push({node,property,times,values});
    }});
    result[name]={duration,loop:name==='idle'||name==='move',tracks};
  }return result;
}
const {buildSamurai,SAMURAI_CLIPS}=source('./actors/Samurai');
const {BUILD_ENEMY,ENEMY_CLIPS}=source('./actors/Enemies');
let pack=new Pack('hero'),hero=buildSamurai();hero.blade.name='katana_blade';pack.tree(hero.rig.root);pack.write(clips(pack,hero.rig.root,SAMURAI_CLIPS));
for(const kind of ['ghoul','hopper','wisp','crow']){
  const model=BUILD_ENEMY[kind]();model.update(0);pack=new Pack(kind);pack.tree(model.root);
  pack.write(ENEMY_CLIPS[kind]?clips(pack,model.root,ENEMY_CLIPS[kind]):procedural(pack,BUILD_ENEMY[kind],{idle:2,move:1.4,attack:kind==='crow'?1.4:1.2,hurt:0.35,stagger:1,die:1.2}));
}
const {Rotroot}=source('./actors/Rotroot'),bark=await assets.material('japanese_zelkova_bark',2,{color:0x6a5e52});
pack=new Pack('rotroot');const boss=new Rotroot(bark);boss.update(0);pack.tree(boss.root);pack.write(procedural(pack,()=>new Rotroot(bark),{idle:3,slam:1.8,sweep:1.6,hurt:0.4,stagger:2,die:2.5}));
const {VillagerModel}=source('./actors/Villager');
for(const look of ['elder','girl','smith','merchant','keeper']){const model=new VillagerModel(look);pack=new Pack('npc_'+look);pack.tree(model.root);pack.write();}
if(process.argv.includes('--actors-only')){publish();process.exit(0);}
const {loadPropKit}=source('./world/Props'),kit=await loadPropKit(assets);
const {IsoGrid,worldRows}=source('./world/IsoMap'),{HAIYA,ROAD_S1}=source('./data/levels/iso'),{buildIsoLevel}=source('./world/IsoLevel');
// Scene meshes retain the original modelling. Static instances are merged by spatial chunk/material below.
const {mergeGeometries}=require('three/addons/utils/BufferGeometryUtils.js');
const tintedMaterials=new Map();
function spatialPieces(geometry){
  geometry.computeBoundingBox();const size=new THREE.Vector3();geometry.boundingBox.getSize(size);
  if(Math.max(size.x,size.z)<24)return[geometry];
  const positions=geometry.attributes.position,indices=geometry.index?Array.from(geometry.index.array):Array.from({length:positions.count},(_,i)=>i),groups=new Map();
  for(let i=0;i<indices.length;i+=3){
    const ids=indices.slice(i,i+3),x=ids.reduce((v,j)=>v+positions.getX(j),0)/3,z=ids.reduce((v,j)=>v+positions.getZ(j),0)/3,key=`${Math.floor(x/16)},${Math.floor(z/16)}`;
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(...ids);
  }
  return [...groups.values()].map(ids=>{
    const remap=new Map(),attrs={position:[],normal:[],uv:[]},ix=[];
    for(const id of ids){
      if(!remap.has(id)){remap.set(id,remap.size);for(const[name,array]of Object.entries(attrs)){const a=geometry.attributes[name];for(let c=0;c<a.itemSize;c++)array.push(a.getComponent(id,c));}}
      ix.push(remap.get(id));
    }
    const g=new THREE.BufferGeometry();for(const[name,array]of Object.entries(attrs))g.setAttribute(name,new THREE.Float32BufferAttribute(array,name==='uv'?2:3));g.setIndex(ix);return g;
  });
}
async function staticScene(name,group,extras={}){
  group.updateMatrixWorld(true);const bins=new Map(),dynamic=[];let next=0;
  group.traverse(o=>{
    if(!o.isMesh&&!o.isSprite)return;
    let ancestor=o,role='';while(ancestor){if(ancestor.userData.nativeRole){role=ancestor.userData.nativeRole;break;}ancestor=ancestor.parent;}
    if(role){if(!dynamic.includes(ancestor))dynamic.push(ancestor);return;}
    if(o.isSprite){dynamic.push(o);return;}
    const ms=Array.isArray(o.material)?o.material:[o.material],groups=Array.isArray(o.material)?o.geometry.groups:[{start:0,count:o.geometry.index?.count??o.geometry.attributes.position.count,materialIndex:0}];
    const copies=o.isInstancedMesh?o.count:1;
    for(let i=0;i<copies;i++){
      const matrix=o.matrixWorld.clone();if(o.isInstancedMesh){const inst=new THREE.Matrix4();o.getMatrixAt(i,inst);matrix.multiply(inst);}
      const p=new THREE.Vector3().setFromMatrixPosition(matrix),chunk=`${Math.floor(p.x/16)},${Math.floor(p.z/16)}`;
      for(const g of groups){let mat=ms[g.materialIndex];if(mat.opacity<0.04)continue;
        if(o.instanceColor){
          const tint=new THREE.Color();o.getColorAt(i,tint);tint.r=Math.round(tint.r*32)/32;tint.g=Math.round(tint.g*32)/32;tint.b=Math.round(tint.b*32)/32;
          const tintKey=mat.uuid+tint.getHexString();if(!tintedMaterials.has(tintKey)){const copy=mat.clone();copy.color.multiply(tint);tintedMaterials.set(tintKey,copy);}mat=tintedMaterials.get(tintKey);
        }
        // Keep giant floor/wall meshes as authored; small scenery is spatially batched.
        let geo=o.geometry.clone();if(geo.index)geo.setIndex(Array.from(geo.index.array).slice(g.start,g.start+g.count));else geo=geo.toNonIndexed();
        if(!geo.attributes.normal)geo.computeVertexNormals();if(!geo.attributes.uv)geo.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count*2),2));
        for(const attr of Object.keys(geo.attributes))if(!['position','normal','uv','color'].includes(attr))geo.deleteAttribute(attr);
        if(geo.attributes.color)geo.deleteAttribute('color');
        geo.applyMatrix4(matrix);
        for(const piece of spatialPieces(geo)){
          piece.computeBoundingBox();const center=new THREE.Vector3();piece.boundingBox.getCenter(center);
          const localChunk=`${Math.floor(center.x/16)},${Math.floor(center.z/16)}`,key=localChunk+'|'+mat.uuid;
          if(!bins.has(key))bins.set(key,{material:mat,geometries:[],chunk:localChunk});bins.get(key).geometries.push(piece);
        }
      }
    }
  });
  const result=new THREE.Group();
  for(const{material,geometries,chunk}of bins.values()){
    const mesh=new THREE.Mesh(mergeGeometries(geometries,false),material);mesh.name=`chunk_${chunk}_${next++}${material.customProgramCacheKey?.()==='cutaway'?'_cut':''}`;result.add(mesh);
  }
  for(const o of dynamic){const copy=o.clone(true);o.matrixWorld.decompose(copy.position,copy.quaternion,copy.scale);copy.name=o.userData.nativeRole??`detail_${next++}`;result.add(copy);}
  pack=new Pack(name);pack.tree(result);pack.write();
  fs.writeFileSync(path.join(out,name+'-scene.json'),JSON.stringify(extras));
}
async function bakeGround(level,grid,theme){
  const mesh=level.group.children.find(o=>o.isMesh&&o.geometry.type==='PlaneGeometry'&&o.geometry.attributes.position.count>20);
  if(!mesh)throw new Error('Missing authored ground');
  const th={field:['sparse_grass','rocky_trail'],village:['sparse_grass','mossy_cobblestone'],forest:['forest_ground_04','rocky_trail']}[theme];
  const [base,pathTexture]=await Promise.all(th.map(id=>texture(`tex/${id}/diff.webp`)));
  function pixels(image){const c=createCanvas(image.width,image.height);c.getContext('2d').drawImage(image,0,0);return{data:c.getContext('2d').getImageData(0,0,image.width,image.height).data,w:image.width,h:image.height};}
  const a=pixels(base.image),b=pixels(pathTexture.image),W=grid.w*2,H=grid.h*2,density=12,width=Math.round(W*density),height=Math.round(H*density),canvas=createCanvas(width,height),ctx=canvas.getContext('2d'),image=ctx.createImageData(width,height);
  const at=(p,x,z,scale)=>(((Math.floor(z/scale*p.h)%p.h+p.h)%p.h)*p.w+(Math.floor(x/scale*p.w)%p.w+p.w)%p.w)*4;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const wx=x/density,wz=y/density,tx=wx/2,ty=wz/2,c=grid.ch(Math.floor(tx),Math.floor(ty));
    let road=0,shadow=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const xx=Math.floor(tx)+dx,yy=Math.floor(ty)+dy,k=grid.ch(xx,yy),weight=Math.max(0,1-Math.abs(tx-(xx+0.5)))*Math.max(0,1-Math.abs(ty-(yy+0.5)));
      if(',=GX'.includes(k)||(theme==='village'&&'HWNL'.includes(k)))road+=weight;
      if('T#+~'.includes(k))shadow+=weight;
    }
    const ia=at(a,wx,wz,4),ib=at(b,wx,wz,5.33),o=(y*width+x)*4;
    let t=Math.max(0,Math.min(1,(road+((a.data[ia+1]/255)-0.25)*0.6-0.38)/0.24));t=t*t*(3-2*t);
    for(let j=0;j<3;j++)image.data[o+j]=(a.data[ia+j]*(1-t)+b.data[ib+j]*t)*(1-shadow*0.52);
    image.data[o+3]=255;
  }
  ctx.putImageData(image,0,0);mesh.material=mesh.material.clone();mesh.material.map=new THREE.CanvasTexture(canvas);mesh.material.map.colorSpace=THREE.SRGBColorSpace;mesh.material.normalMap=null;mesh.material.roughnessMap=null;mesh.material.aoMap=null;
  const p=mesh.geometry.attributes.position,u=mesh.geometry.attributes.uv;
  for(let i=0;i<p.count;i++)u.setXY(i,p.getX(i)/W,1-p.getZ(i)/H);
}
for(const[name,rows,theme,buildings]of [['world',worldRows(),'field',[]],['village',HAIYA.map,'village',HAIYA.buildings],['road',ROAD_S1,'forest',[]]]){
  const grid=new IsoGrid(rows,true),level=await buildIsoLevel(grid,theme,assets,kit,buildings);level.update(0);
  await bakeGround(level,grid,theme);
  for(const[key,jar]of level.jars)jar.userData.nativeRole='jar_'+key;
  if(name==='village'){
    // Authored buildings stay grouped so only the occluding roof fades on iPhone.
    level.group.children.forEach(o=>{if(o.isGroup&&o.children.length>10)o.userData.nativeRole='building_'+(o.id);});
  }
  await staticScene('scene_'+name,level.group,{lanterns:level.lanterns.map(l=>({position:l.pos.toArray(),color:l.color}))});
}
const {Dungeon}=source('./world/DungeonMap'),{DUNGEONS}=source('./data/levels/dungeons'),{buildLevel}=source('./world/Level3D');
const dungeon=new Dungeon(DUNGEONS.d1,{get:()=>false}),level=await buildLevel(dungeon,'grotto',assets);
await staticScene('scene_dungeon',level.group,{lanterns:level.lanterns.map(l=>({position:l.pos.toArray(),color:l.color}))});
// Preserve the authored circular grotto arena, with its uneven enclosing rock face.
const arena=new THREE.Group(),floorMaterial=await assets.material('rocky_trail',1,{color:0x8a8478}),wallMaterial=await assets.material('rock_wall_02',1,{color:0x9a948a,side:THREE.BackSide});
const floorGeometry=new THREE.CircleGeometry(12,48).rotateX(-Math.PI/2).translate(24,0,24);
for(let i=0;i<floorGeometry.attributes.uv.count;i++)floorGeometry.attributes.uv.setXY(i,floorGeometry.attributes.uv.getX(i)*6,floorGeometry.attributes.uv.getY(i)*6);
arena.add(new THREE.Mesh(floorGeometry,floorMaterial));
const wallGeometry=new THREE.CylinderGeometry(11.8,12.2,9,64,8,true),wp=wallGeometry.attributes.position;
for(let i=0;i<wp.count;i++){const x=wp.getX(i),y=wp.getY(i),z=wp.getZ(i),a=Math.atan2(x,z),k=1+0.06*Math.sin(a*7+y)+0.04*Math.sin(a*17-y*2);wp.setXYZ(i,x*k+24,y+4.5,z*k+24);wallGeometry.attributes.uv.setXY(i,wallGeometry.attributes.uv.getX(i)*18,wallGeometry.attributes.uv.getY(i)*3);}
wallGeometry.computeVertexNormals();arena.add(new THREE.Mesh(wallGeometry,wallMaterial));
await staticScene('scene_boss',arena,{lanterns:[0,1,2,3].map(i=>({position:[24+Math.sin(i*Math.PI/2+Math.PI/4)*10,2.5,24+Math.cos(i*Math.PI/2+Math.PI/4)*10],color:0x9a6aff}))});
publish();
console.log('Original artwork exported without changing web sources.');
