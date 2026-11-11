"""iOS-only volcanic colossus. Creates a new scene without altering existing Blender work."""
from pathlib import Path
import bpy, math, random, json
from mathutils import Vector, Matrix
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'ios/ArtSource/export';OUT.mkdir(parents=True,exist_ok=True)
CLIPS={'idle':180,'move':72,'move_back':72,'strafe_left':72,'strafe_right':72,'slam':108,'charge':108,'sweep':96,'hurt':24,'stagger':120,'die':150}
scene=bpy.data.scenes.new('IOS · Ashen Heaven')
bpy.context.window.scene=scene
scene.unit_settings.system='METRIC';scene.render.fps=60;scene.frame_end=180
rng=random.Random(772)

def material(name,color,metal=0,rough=.85,emission=0,texture=False):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    if emission:p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
    if texture:
        image=bpy.data.images.new(name+'_weathering',width=256,height=256);pixels=[]
        for y in range(256):
            for x in range(256):
                grain=.65+.16*math.sin(x*.11+math.sin(y*.14)*2)+.12*math.sin(y*.037+x*.024)+rng.random()*.15
                vein=.42 if abs(math.sin(x*.065+math.sin(y*.029)*3))<.035 else 1
                pixels.extend([min(1,c*grain*vein) for c in color]+[1])
        image.pixels.foreach_set(pixels);image.pack()
        t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=image
        m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color'])
    return m

stone=material('Volcanic basalt',(.21,.19,.18),.06,.9,texture=True)
bronze=material('Scorched bronze',(.39,.26,.12),.45,.66,texture=True)
ash=material('Ash ceramic',(.49,.45,.37),.04,.9,texture=True)
fire=material('Furnace soul',(1,.17,.018),.1,.7,2.8)
shadow=material('Obsidian',(.055,.064,.075),.3,.63,texture=True)
blue=material('Wraith furnace',(.12,.55,.9),.1,.7,2.5)
lava=material('Lava lake',(1,.16,.015),.0,.9,2.2)
crust=material('Cooled lava',(.055,.038,.035),.0,.95,texture=True)

class Model:
    def __init__(self,name):
        self.name=name;self.root=bpy.data.objects.new(name,None);scene.collection.objects.link(self.root)
        self.nodes={};self.parts={};self.objects=[self.root]
    def node(self,name,loc=(0,0,0),parent=None):
        o=bpy.data.objects.new(name,None);scene.collection.objects.link(o);o.parent=parent or self.root;o.location=loc
        self.nodes[name]=o;self.parts[name]=[];self.objects.append(o);return o
    def add(self,node,kind,loc,size,mat,rotation=(0,0,0),segments=24,rings=12):
        if self.name=='scene_boss':
            loc=(loc[0],-loc[1],loc[2]);rotation=(-rotation[0],rotation[1],-rotation[2])
        if kind=='sphere':bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,radius=1)
        elif kind=='cone':bpy.ops.mesh.primitive_cone_add(vertices=segments,radius1=1,radius2=1 if self.name=="scene_boss" and size[0]==12 else .75,depth=1)
        elif kind=='torus':bpy.ops.mesh.primitive_torus_add(major_segments=segments,minor_segments=8,major_radius=1,minor_radius=.035)
        else:bpy.ops.mesh.primitive_cube_add(size=1)
        o=bpy.context.object;o.name=node+'_detail';o.location=loc;o.scale=size;o.rotation_euler=rotation
        o.data.materials.append(mat)
        # Bake primitive transforms into the component's local mesh space.
        o.data.transform(o.matrix_basis);o.matrix_basis=Matrix.Identity(4);o.parent=self.nodes[node]
        for face in o.data.polygons:face.use_smooth=kind!='box'
        self.parts[node].append(o);self.objects.append(o);return o
    def join(self):
        for name,objects in self.parts.items():
            if not objects:continue
            bpy.ops.object.select_all(action='DESELECT')
            for o in objects:o.select_set(True)
            bpy.context.view_layer.objects.active=objects[0]
            bpy.ops.object.join();bpy.context.object.name=name+'_surface'
        self.objects=[self.root]+list(self.root.children_recursive)
    def export(self):
        bpy.ops.object.select_all(action='DESELECT')
        for o in self.objects:o.select_set(True)
        bpy.context.view_layer.objects.active=self.root
        bpy.ops.export_scene.gltf(filepath=str(OUT/(self.name+'.glb')),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_merge_animation='NLA_TRACK',export_frame_range=False,export_force_sampling=True,export_skins=False,export_cameras=False,export_lights=False)

models=[]
for ghost in [False,True]:
    m=Model('rotroot_wraith' if ghost else 'rotroot');bodymat=shadow if ghost else stone;glow=blue if ghost else fire
    chest=m.node('chest',(0,0,17));head=m.node('head',(0,-1,18),chest)
    halo=m.node('halo',(0,4,36));m.add('halo','torus',(0,0,0),(17,17,17),bronze,rotation=(math.pi/2,0,0),segments=128)
    m.add('halo','torus',(0,0,.2),(15.7,15.7,15.7),glow,rotation=(math.pi/2,0,0),segments=128)
    for j in range(24):
        a=j*math.tau/24
        m.add('halo','box',(17.8*math.sin(a),0,17.8*math.cos(a)),(.5,.6,2.5 if j%3==0 else 1.2),bronze,rotation=(0,a,0))
    # Broad, eroded torso; lower body disappears beneath the far crater rim.
    m.add('chest','sphere',(0,1,-4),(10,6,13),bodymat,segments=48,rings=24)
    m.add('chest','sphere',(0,0,4),(12.7,5.7,7.5),bodymat,segments=40,rings=20)
    for row in range(5):
        for col in range(-4,5):
            x=col*2.35;z=3.2-row*2.4
            m.add('chest','box',(x,-4.6+abs(col)*.13,z),(2.1,.55,1.9),bronze if row%2==0 else bodymat,rotation=(.06,col*.035,col*.045))
    # Glowing broken ribs and a deep furnace cavity.
    m.add('chest','sphere',(0,-5.2,4),(2.4,.35,3.1),glow,segments=32,rings=16)
    for i in [-1,1]:
        for j in range(5):m.add('chest','box',(i*(2.8+j*.18),-5.2,5-j*1.1),(3.1,.55,.48),ash,rotation=(0,i*.25,0))
    # Monumental face, cheek planes, heavy brow and a split crown.
    m.add('head','sphere',(0,0,0),(5.1,4,7),bodymat,segments=48,rings=32)
    m.add('head','sphere',(0,-2.7,-3.7),(4.5,2.1,2.1),ash,segments=32,rings=16)
    m.add('head','sphere',(0,-4.1,-.8),(1.15,1.2,2.65),ash,segments=32,rings=16)
    for side in [-1,1]:
        m.add('head','sphere',(side*2.4,-3.25,-.2),(1.85,.7,1.35),ash,rotation=(0,side*.2,0),segments=32,rings=16)
        m.add('head','sphere',(side*2.25,-3.65,1.4),(1.55,.3,.37),glow,segments=32,rings=12)
        m.add('head','box',(side*2.15,-3.7,2.15),(3.8,.65,.95),bodymat,rotation=(0,side*.12,side*.17))
        for j in range(4):m.add('head','box',(side*(3.8-j*.12),-2.9,-1.2-j*.7),(.3,.5,.5),bronze,rotation=(0,0,side*.3))
    m.add('head','box',(0,-3.85,-3),(3.1,.3,.3),shadow)
    for i in range(-3,4):m.add('head','box',(i*.4,-4.1,-2.75),(.25,.35,.55),ash)
    for i in [-2,-1,0,1,2]:
        m.add('head','cone',(i*2.0,0,7.2+(.8 if i==0 else 0)),(1.05,1.2,7 if ghost else 5.6),bronze if not ghost else bodymat,rotation=(0,i*.16,0),segments=24)
        if ghost:m.add('head','cone',(i*2.1,-.7,10.6),( .45,.5,3.7),glow,rotation=(0,i*.16,0),segments=16)
    # Root-level arm segments support native two-bone placement at the actual hit point.
    for side,label in [(-1,'left'),(1,'right')]:
        shoulder=m.node('shoulder_'+label,(side*11,0,6),chest)
        m.add('shoulder_'+label,'sphere',(0,0,0),(5,5,4),bodymat,segments=32,rings=16)
        for j in range(4):m.add('shoulder_'+label,'box',(side*j*.8,-2.4,1.6-j*.65),(6,.65,1.2),bronze,rotation=(0,side*.25,0))
        for name,radius in [('upper_',2.4),('lower_',2.0)]:
            n=name+label;m.node(n)
            m.add(n,'cone',(0,0,.5),(radius,radius,1),bodymat,segments=32)
            for t in [.12,.38,.65,.9]:m.add(n,'torus',(0,0,t),(radius*1.08,radius*1.08,1),bronze,segments=32)
            m.add(n,'box',(0,-radius,.5),(.38,.18,.72),glow)
        n='hand_'+label;m.node(n)
        m.add(n,'sphere',(0,-1.3,0),(2.5,2.0,.8),bodymat,segments=32,rings=16)
        # Five separated, curled stone fingers with raised knuckles and bronze nails.
        for finger in range(4):
            x=(finger-1.5)*1.05
            for joint in range(3):
                y=-2.6-joint*.95+(abs(finger-1.5)*.18)
                z=.1+math.sin(joint*.85)*.25
                m.add(n,'sphere',(x,y,z),(.62,.79,.63),bodymat,segments=16,rings=10)
                if joint==2:m.add(n,'sphere',(x,y-.45,z+.42),(.43,.6,.13),bronze,segments=16,rings=8)
        for joint in range(3):m.add(n,'sphere',(side*(2.0+joint*.45),-1.1-joint*.6,.1),(.7,.75,.65),bodymat,segments=16,rings=10)
        m.add(n,'torus',(0,-1.25,.82),(1.15,1.15,1.15),glow,segments=48)
        m.add(n,'sphere',(0,-1.25,.84),(.5,.5,.13),glow,segments=24,rings=12)
    m.join()
    # Ordinary transform tracks: slow mass transfer, head anticipation and follow-through.
    for clip,end in CLIPS.items():
        for obj in [chest,head,halo]:
            obj.animation_data_create();action=bpy.data.actions.new(m.name+'_'+obj.name+'_'+clip);obj.animation_data.action=action
            base=obj.location.copy()
            for f in range(0,end+1):
                t=f/end;phase=t*math.tau;impact=math.exp(-max(0,f-48)/15)*math.sin(max(0,f-48)*.35) if f>=48 else 0
                breathe=math.sin(phase)*.012
                weight=0
                if clip in ['slam','charge']:weight=math.sin(min(1,f/48)*math.pi/2)*.13*(1-max(0,(f-57)/(end-57)))
                if clip=='sweep':weight=math.sin(min(1,f/60)*math.pi)*.1
                if clip=='stagger':weight=-.10*math.sin(math.pi*t)
                if clip=='die':weight=.48*(t*t*(3-2*t))
                obj.rotation_euler=(weight+breathe if obj==chest else -.45*weight if obj==head else .03*math.sin(phase),0, .10*math.sin(math.pi*t) if clip=='sweep' and obj==chest else 0)
                obj.location=base+Vector((0,0,.12*math.sin(phase) if obj==chest else 0))
                obj.keyframe_insert('rotation_euler',frame=f);obj.keyframe_insert('location',frame=f)
            track=obj.animation_data.nla_tracks.new();track.name=clip;strip=track.strips.new(clip,0,action);strip.action_frame_start=0;strip.action_frame_end=end
            obj.animation_data.action=None
        scene.frame_set(0)
    m.export();models.append(m)

# A separate open crater, on the same gameplay coordinates as the original arena.
a=Model('scene_boss');a.node('crater')
a.add('crater','cone',(24,24,-1.0),(12,12,2),stone,segments=96)
a.add('crater','cone',(24,24,-4),(10,10,6),crust,segments=64)
a.add('crater','sphere',(24,24,-9),(130,130,.7),lava,segments=96,rings=12)
for ring in [12.5,16,75]:a.add('crater','torus',(24,24,-4),(ring,ring,15 if ring==75 else 3),crust,segments=96)
for j in range(36):
    angle=j*math.tau/36;r=11.4
    a.add('crater','cone',(24+math.cos(angle)*r,24+math.sin(angle)*r,-1),(1.0,1.0,5+rng.random()*3),crust,rotation=(.1*math.sin(angle),.1*math.cos(angle),0),segments=12)
for j in range(12):
    angle=j*math.tau/12
    a.add('crater','box',(24+math.sin(angle)*7,24+math.cos(angle)*7,.025),(.07,6.5,.035),bronze,rotation=(0,0,-angle))
for j in range(14):
    angle=j*math.tau/14;r=65+rng.random()*30
    a.add('crater','cone',(24+math.sin(angle)*r,24+math.cos(angle)*r,-1),(12+rng.random()*12,15,25+rng.random()*35),crust,segments=12)
# Small human-scale pilgrimage posts give the crater and distant torso a readable scale.
for x,y in [(16,29),(32,29),(18,17),(30,17)]:
    a.add('crater','box',(x,y,1.4),(.18,.18,2.8),bronze)
    a.add('crater','sphere',(x,y,2.8),(.3,.3,.4),fire,segments=12,rings=8)
a.join();a.export()

# Preview scene: one colossus at the true gameplay placement, the other kept off-camera.
models[0].root.location=(24,5,0);models[1].root.hide_render=True
for o in models[1].objects:o.hide_render=True
# Preview poses for the native arm placement are supplied by the native renderer in-game.
for m in models:
    for side,label in [(-1,'left'),(1,'right')]:
        shoulder=Vector((side*11,0,23));wrist=Vector((0,-28,1)) if side==1 else Vector((-13,-14,4))
        difference=wrist-shoulder;distance=min(38.5,difference.length);axis=difference.normalized();pole=Vector((side,.15,0));bend=(pole-axis*pole.dot(axis)).normalized()
        along=(19*19-20*20+distance*distance)/(2*distance);elbow=shoulder+axis*along+bend*math.sqrt(max(0,19*19-along*along))
        for name,start,end in [('upper_'+label,shoulder,elbow),('lower_'+label,elbow,wrist)]:
            obj=m.nodes[name];obj.location=start;obj.scale=(1,1,(end-start).length);obj.rotation_mode='QUATERNION';obj.rotation_quaternion=Vector((0,0,1)).rotation_difference(end-start)
        m.nodes['hand_'+label].location=wrist
bpy.ops.object.camera_add(location=(24,-39,4));camera=bpy.context.object;camera.name='Colossus gameplay preview';camera.rotation_euler=(Vector((24,-12,14))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=20;scene.camera=camera
bpy.ops.object.light_add(type='AREA',location=(24,-25,32));light=bpy.context.object;light.rotation_euler=(Vector((24,0,22))-light.location).to_track_quat('-Z','Y').to_euler();light.data.energy=40000;light.data.shape='DISK';light.data.size=30
world=bpy.data.worlds.new('Ash sky');world.use_nodes=True;next(n for n in world.node_tree.nodes if n.type=='BACKGROUND').inputs[0].default_value=(.08,.025,.012,1);next(n for n in world.node_tree.nodes if n.type=='BACKGROUND').inputs[1].default_value=.5;scene.world=world
scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=1280;scene.render.resolution_y=720;scene.render.resolution_percentage=100
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'ios/ArtSource/colossus.blend'))
result={'source':bpy.data.filepath,'exports':[str(OUT/(n+'.glb')) for n in ['rotroot','rotroot_wraith','scene_boss']],'scene':scene.name,'design':'Half-body furnace deity, root-level articulated siege arms, open volcanic altar'}
print(json.dumps(result))

import sys
if '--preview' in sys.argv:
    scene.render.resolution_x=960;scene.render.resolution_y=540
    scene.render.filepath=str(ROOT/'ios/build/colossus/blender-preview-final.png');bpy.ops.render.render(write_still=True)
