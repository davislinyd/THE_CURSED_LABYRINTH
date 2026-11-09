"""Offline GLB/USDZ, texture, font and score conversion. Source assets are read-only."""
import io, json, math, shutil, struct, subprocess, hashlib
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from fontTools.ttLib import TTFont
from pxr import Usd, UsdGeom, UsdShade, UsdUtils, Sdf, Gf, Vt, Tf

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'ios/Resources/Generated'
SOURCE = ROOT / 'public/assets'
RATE = 32000
for name in ['Models', 'Textures', 'Fonts', 'Audio', 'Licenses']:
    (OUT/name).mkdir(parents=True, exist_ok=True)

def model(path):
    dest=OUT/'Models'/f'{path.stem}.usdz'
    if dest.exists() and dest.stat().st_mtime>max(path.stat().st_mtime,Path(__file__).stat().st_mtime): return
    data=path.read_bytes(); size=struct.unpack_from('<I',data,12)[0]
    doc=json.loads(data[20:20+size]); binary=data[28+size:]
    work=ROOT/'ios/build/usd'/path.stem;work.mkdir(parents=True,exist_ok=True)
    stage=Usd.Stage.CreateNew(str(work/'model.usda'))
    root=UsdGeom.Xform.Define(stage,'/Model');stage.SetDefaultPrim(root.GetPrim())
    UsdGeom.SetStageUpAxis(stage,UsdGeom.Tokens.y);UsdGeom.SetStageMetersPerUnit(stage,1)
    def accessor(idx):
        a=doc['accessors'][idx];v=doc['bufferViews'][a['bufferView']]
        dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1',5122:'<i2',5120:'i1'}[a['componentType']]
        n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
        dt=np.dtype(dtype); off=v.get('byteOffset',0)+a.get('byteOffset',0)
        ar=np.ndarray((a['count'],n),dtype=dt,buffer=binary,offset=off,strides=(v.get('byteStride',dt.itemsize*n),dt.itemsize)).copy()
        if a.get('normalized') and dt.kind in 'iu': ar=ar.astype(np.float32)/np.iinfo(dt).max
        return ar
    mats=[]
    for i,m in enumerate(doc.get('materials',[{}])):
        material=UsdShade.Material.Define(stage,f'/Model/Materials/M{i}')
        shader=UsdShade.Shader.Define(stage,f'/Model/Materials/M{i}/Surface');shader.CreateIdAttr('UsdPreviewSurface')
        pbr=m.get('pbrMetallicRoughness',{});rgba=pbr.get('baseColorFactor',[1,1,1,1])
        shader.CreateInput('diffuseColor',Sdf.ValueTypeNames.Color3f).Set(Gf.Vec3f(*rgba[:3]))
        shader.CreateInput('roughness',Sdf.ValueTypeNames.Float).Set(pbr.get('roughnessFactor',0.85))
        shader.CreateInput('metallic',Sdf.ValueTypeNames.Float).Set(pbr.get('metallicFactor',0))
        if m.get('alphaMode')=='BLEND':shader.CreateInput('opacity',Sdf.ValueTypeNames.Float).Set(rgba[3])
        info=pbr.get('baseColorTexture')
        if info:
            texture=doc['textures'][info['index']];image_index=texture.get('extensions',{}).get('EXT_texture_webp',{}).get('source',texture.get('source'))
            image=doc['images'][image_index];v=doc['bufferViews'][image['bufferView']];off=v.get('byteOffset',0)
            png=f'texture{i}.png';Image.open(io.BytesIO(binary[off:off+v['byteLength']])).convert('RGBA').save(work/png)
            uv=UsdShade.Shader.Define(stage,f'/Model/Materials/M{i}/UV');uv.CreateIdAttr('UsdPrimvarReader_float2');uv.CreateInput('varname',Sdf.ValueTypeNames.Token).Set('st')
            tex=UsdShade.Shader.Define(stage,f'/Model/Materials/M{i}/Texture');tex.CreateIdAttr('UsdUVTexture')
            tex.CreateInput('file',Sdf.ValueTypeNames.Asset).Set(png);tex.CreateInput('sourceColorSpace',Sdf.ValueTypeNames.Token).Set('sRGB')
            tex.CreateInput('st',Sdf.ValueTypeNames.Float2).ConnectToSource(uv.ConnectableAPI(),'result')
            tex.CreateOutput('rgb',Sdf.ValueTypeNames.Float3)
            shader.GetInput('diffuseColor').ConnectToSource(tex.ConnectableAPI(),'rgb')
            if m.get('alphaMode') in ['MASK','BLEND']:
                tex.CreateOutput('a',Sdf.ValueTypeNames.Float);shader.CreateInput('opacity',Sdf.ValueTypeNames.Float).ConnectToSource(tex.ConnectableAPI(),'a')
                shader.CreateInput('opacityThreshold',Sdf.ValueTypeNames.Float).Set(m.get('alphaCutoff',0.5))
        material.CreateSurfaceOutput().ConnectToSource(shader.ConnectableAPI(),'surface');mats.append(material)
    def node(index,parent):
        n=doc['nodes'][index];label=Tf.MakeValidIdentifier(n.get('name',f'N{index}'));p=f'{parent}/{label}';xf=UsdGeom.Xform.Define(stage,p)
        if 'matrix' in n:xf.AddTransformOp().Set(Gf.Matrix4d(*n['matrix']))
        else:
            if 'translation' in n:xf.AddTranslateOp().Set(Gf.Vec3d(*n['translation']))
            if 'rotation' in n:
                q=n['rotation'];xf.AddOrientOp().Set(Gf.Quatf(q[3],Gf.Vec3f(*q[:3])))
            if 'scale' in n:xf.AddScaleOp().Set(Gf.Vec3f(*n['scale']))
        if 'mesh' in n:
            for k,primitive in enumerate(doc['meshes'][n['mesh']]['primitives']):
                if primitive.get('mode',4)!=4:raise ValueError('Non-triangle primitive')
                attrs=primitive['attributes'];points=accessor(attrs['POSITION']).astype(np.float32)
                mesh=UsdGeom.Mesh.Define(stage,f'{p}/Mesh{k}')
                mesh.CreatePointsAttr(Vt.Vec3fArray.FromNumpy(points))
                indices=accessor(primitive['indices']).flatten().astype(np.int32) if 'indices' in primitive else np.arange(len(points),dtype=np.int32)
                mesh.CreateFaceVertexCountsAttr([3]*(len(indices)//3));mesh.CreateFaceVertexIndicesAttr(Vt.IntArray.FromNumpy(indices))
                mesh.CreateSubdivisionSchemeAttr('none');mesh.CreateDoubleSidedAttr(True)
                if 'NORMAL' in attrs:
                    mesh.CreateNormalsAttr(Vt.Vec3fArray.FromNumpy(accessor(attrs['NORMAL']).astype(np.float32)));mesh.SetNormalsInterpolation('vertex')
                pv=UsdGeom.PrimvarsAPI(mesh)
                if 'TEXCOORD_0' in attrs:
                    uv=accessor(attrs['TEXCOORD_0']).astype(np.float32);uv[:,1]=1-uv[:,1]
                    pv.CreatePrimvar('st',Sdf.ValueTypeNames.TexCoord2fArray,'vertex').Set(Vt.Vec2fArray.FromNumpy(uv))
                if 'COLOR_0' in attrs:
                    colors=accessor(attrs['COLOR_0']).astype(np.float32)
                    pv.CreatePrimvar('displayColor',Sdf.ValueTypeNames.Color3fArray,'vertex').Set(Vt.Vec3fArray.FromNumpy(colors[:,:3].copy()))
                    cp=f'{p}/Mesh{k}/VertexMaterial'
                    cm=UsdShade.Material.Define(stage,cp)
                    reader=UsdShade.Shader.Define(stage,cp+'/Reader');reader.CreateIdAttr('UsdPrimvarReader_float3');reader.CreateInput('varname',Sdf.ValueTypeNames.Token).Set('displayColor')
                    shader=UsdShade.Shader.Define(stage,cp+'/Surface');shader.CreateIdAttr('UsdPreviewSurface');shader.CreateInput('diffuseColor',Sdf.ValueTypeNames.Color3f).ConnectToSource(reader.ConnectableAPI(),'result')
                    shader.CreateInput('roughness',Sdf.ValueTypeNames.Float).Set(0.9);cm.CreateSurfaceOutput().ConnectToSource(shader.ConnectableAPI(),'surface')
                    UsdShade.MaterialBindingAPI.Apply(mesh.GetPrim()).Bind(cm)
                elif mats:UsdShade.MaterialBindingAPI.Apply(mesh.GetPrim()).Bind(mats[primitive.get('material',0)])
        for child in n.get('children',[]):node(child,p)
    for index in doc['scenes'][doc.get('scene',0)]['nodes']:node(index,'/Model')
    stage.GetRootLayer().Save()
    if not UsdUtils.CreateNewUsdzPackage(str(work/'model.usda'),str(dest)):raise RuntimeError(path)
    print('USDZ',path.stem,flush=True)

for p in sorted((SOURCE/'models').glob('*.glb')):model(p)
for p in sorted((SOURCE/'tex').glob('*/diff.webp')):
    Image.open(p).convert('RGB').save(OUT/'Textures'/f'{p.parent.name}.png')
for p in (ROOT/'public/fonts').glob('*.woff2'):
    f=TTFont(p);f.flavor=None;f.save(OUT/'Fonts'/f'{p.stem}.ttf')
for p in (ROOT/'public/licenses').glob('*.txt'):shutil.copy2(p,OUT/'Licenses'/p.name)
shutil.copy2(ROOT/'CREDITS.md',OUT/'Licenses/CREDITS.md')
for p in (SOURCE/'audio/sfx').glob('*.m4a'):shutil.copy2(p,OUT/'Audio'/p.name)

# Original MML scores, rendered once with their original sample instruments.
manifest=json.loads((SOURCE/'manifest.json').read_text())['assets']
scores=json.loads((OUT/'music-scores.json').read_text())
samples={}
def decode(filename):
    if filename not in samples:
        b=subprocess.check_output(['ffmpeg','-v','error','-i',str(SOURCE/filename),'-f','f32le','-ac','1','-ar',str(RATE),'-'])
        samples[filename]=np.frombuffer(b,dtype='<f4').copy()
    return samples[filename]
def render_song(name,song):
    dest=OUT/'Audio'/f'{name}.caf'
    if dest.exists():return
    sec=60/song['def']['tempo']/24
    length=max(c['length'] for c in song['channels'])*sec
    count=int((length+4)*RATE); mix=np.zeros((count,2),dtype=np.float32)
    for track,channel in zip(song['def']['tracks'],song['channels']):
        for ev in channel['events']:
            if ev.get('vel',0)<=0:continue
            start=int(ev['tick']*sec*RATE);vel=ev['vel']/15
            sounds=[]
            if ev.get('drum'):
                entry=manifest['perc/'+ev['drum']];sounds=[decode(entry['files'][0])*vel**1.4]
            else:
                inst=ev.get('inst') or track['inst'];entry=manifest.get('inst/'+inst)
                if not entry:raise ValueError('Missing instrument '+inst)
                spec=scores['instruments'][inst]
                for note in ev['notes']:
                    sample=min(entry['samples'],key=lambda s:abs(s['n']-note)+abs(s['v']-vel)*2)
                    raw=decode(sample['f']);ratio=2**((note-sample['n'])/12)
                    duration=ev['gate']*sec;release=spec.get('ring',spec.get('release',0.4));n=int((duration+release*1.5)*RATE)
                    index=np.arange(n,dtype=np.float64)*ratio
                    if spec.get('loop') and len(raw)>RATE*1.2:
                        a=int(len(raw)*0.4);b=int(len(raw)*0.86);tail=index>=b;index[tail]=a+(index[tail]-a)%(b-a)
                    buf=np.interp(index,np.arange(len(raw)),raw,left=0,right=0).astype(np.float32)
                    time=np.arange(n)/RATE
                    env=np.minimum(1,time/0.012)*np.exp(-np.maximum(0,time-duration)*4/max(0.05,release))
                    rms=max(0.005,float(np.sqrt(np.mean(raw*raw))))
                    sounds.append(buf*env*min(5,0.08/rms)*spec.get('gain',1)*(0.18+0.82*vel**1.5))
            pan=track.get('pan',0);gain=track.get('vol',1)*0.22
            for sound in sounds:
                n=min(len(sound),count-start)
                if n<=0:continue
                mix[start:start+n,0]+=sound[:n]*(math.sqrt((1-pan)/2)*gain)
                mix[start:start+n,1]+=sound[:n]*(math.sqrt((1+pan)/2)*gain)
    dry=mix.copy()
    for delay,gain in [(0.071,0.12),(0.119,0.09),(0.181,0.06),(0.277,0.035)]:
        shift=int(delay*RATE);mix[shift:]+=dry[:-shift,::-1]*gain
    end=int(length*RATE)
    if song['def'].get('loop'):
        # Fold release tails into the loop head, preserving ringing notes at the seam.
        tail=mix[end:];mix[:len(tail)]+=tail;mix=mix[:end]
    else:mix=mix[:end+RATE*2]
    peak=max(0.01,float(np.max(np.abs(mix))));mix=np.tanh(mix*min(1.6,0.9/peak))
    proc=subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(RATE),'-ac','2','-i','-','-c:a','alac',str(dest)],input=mix.astype('<f4').tobytes(),check=True)
    print('BGM',name,round(length,1),'s',flush=True)
for name,song in scores['songs'].items():render_song(name,song)

# Locally authored app icon: lantern crest, moon and torii in the game's palette.
icons=ROOT/'ios/Resources/Assets.xcassets/AppIcon.appiconset';icons.mkdir(parents=True,exist_ok=True)
im=Image.new('RGB',(1024,1024),(14,20,30));d=ImageDraw.Draw(im)
for y in range(1024):
    d.line((0,y,1024,y),fill=(14+int(y/80),20+int(y/90),30+int(y/160)))
d.ellipse((215,120,810,715),fill=(186,168,126));d.ellipse((260,85,855,680),fill=(20,26,36))
d.polygon([(160,310),(855,290),(820,350),(200,370)],fill=(130,37,36))
d.rectangle((230,410,800,449),fill=(130,37,36));d.polygon([(270,355),(335,353),(310,860),(245,860)],fill=(112,31,32));d.polygon([(690,340),(750,335),(780,860),(715,860)],fill=(112,31,32))
d.polygon([(514,390),(580,540),(545,690),(482,690),(449,540)],fill=(220,164,81))
d.polygon([(514,445),(542,555),(515,643),(489,555)],fill=(255,226,160))
im.save(icons/'icon.png');(icons/'Contents.json').write_text(json.dumps({'images':[{'filename':'icon.png','idiom':'universal','platform':'ios','size':'1024x1024'}],'info':{'author':'xcode','version':1}}))
(icons.parent/'Contents.json').write_text('{"info":{"author":"xcode","version":1}}')
files={str(p.relative_to(OUT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in OUT.rglob('*') if p.is_file() and p.name!='manifest.json'}
(OUT/'manifest.json').write_text(json.dumps({'schema':1,'files':files},indent=2))
print('Prepared',len(files),'resources',flush=True)
