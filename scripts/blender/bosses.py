"""Rigid, animated iOS boss variants. Run through Blender MCP with REPO set.

Blender uses metres, Z up and +Y forward. A half-turn on the exported rig
converts glTF's -Z front to the game's +Z front. Meshes are rigid bone children,
so the native node-animation pipeline needs neither skinning nor morph targets.
"""
import bpy
import bmesh
import math
import os
import random
from mathutils import Matrix, Vector, Euler, noise

OUT = os.path.join(REPO, 'scripts/blender/export')
PREVIEW = os.path.join(REPO, 'ios/build/boss-art')
os.makedirs(OUT, exist_ok=True)
os.makedirs(PREVIEW, exist_ok=True)
CLIPS = {'idle': 180, 'move': 72, 'move_back': 72, 'strafe_left': 72, 'strafe_right': 72, 'slam': 108, 'sweep': 96, 'hurt': 24, 'stagger': 120, 'die': 150}
exec(compile(open(os.path.join(REPO,'scripts/blender/boss_motion.py')).read(), 'boss_motion.py', 'exec'))

# This dedicated file owns only its generated scenes, never props.blend.
for old_scene in list(bpy.data.scenes):
    if old_scene.get('cursed_boss_source'):
        actions=set()
        for obj in old_scene.objects:
            if obj.animation_data:
                if obj.animation_data.action:actions.add(obj.animation_data.action)
                actions.update(strip.action for track in obj.animation_data.nla_tracks for strip in track.strips)
        for obj in list(old_scene.objects):bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.scenes.remove(old_scene)
        for action in actions:bpy.data.actions.remove(action)
for collection in list(bpy.data.collections):
    if collection.users==0 and collection.name.startswith(('rotroot','Preview only')):
        bpy.data.collections.remove(collection)
scene = bpy.data.scenes.new('Boss atelier')
scene['cursed_boss_source'] = True
bpy.context.window.scene = scene
scene.unit_settings.system = 'METRIC'
scene.render.fps = 60
scene.frame_start = 0
scene.frame_end = 180


def palette(name, ghost):
    colors = ([(.065,.085,.11),(.17,.24,.29),(.32,.43,.47),(.08,.14,.19),
               (.10,.22,.28),(.24,.39,.43),(.50,.58,.56),(.28,.40,.44),
               (.52,.62,.62),(.065,.12,.16),(.035,.06,.085),(.38,.50,.52),
               (.20,.29,.32),(.15,.23,.26),(.32,.46,.49),(.66,.70,.66)] if ghost else
              [(.055,.045,.040),(.13,.105,.075),(.26,.18,.10),(.075,.045,.040),
               (.24,.042,.032),(.35,.085,.045),(.40,.30,.17),(.12,.085,.055),
               (.48,.43,.31),(.095,.065,.045),(.025,.018,.016),(.30,.32,.30),
               (.20,.12,.07),(.11,.055,.04),(.31,.23,.12),(.62,.54,.37)])
    size = 512
    image = bpy.data.images.new(name + '_pigment', width=size, height=size)
    rng = random.Random(321)
    pixels = []
    for y in range(size):
        for x in range(size):
            cell = (y//128)*4+x//128
            base = colors[cell]
            coarse=noise.noise(Vector((x*.035,y*.035,cell*.7)))*.5+.5
            pits=noise.noise(Vector((x*.37,y*.37,cell*2.3)))*.5+.5
            scratch = .45 if (x*3+y*11)%137 < 2 else 1
            grain = (.48+coarse*.65+rng.random()*.15)*scratch
            pigment=[min(1,c*grain) for c in base]
            if pits>.76 and cell in [0,1,2,4,5,11,12]:
                rust=(.11,.15,.15) if ghost else (.24,.085,.025)
                pigment=[a*.4+b*.6 for a,b in zip(pigment,rust)]
            pixels.extend(pigment+[1])
    image.pixels.foreach_set(pixels)
    image.pack()
    material = bpy.data.materials.new(name + '_weathered')
    material.use_nodes = True
    nodes = material.node_tree.nodes
    shader = next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
    shader.inputs['Roughness'].default_value = .98
    shader.inputs['Metallic'].default_value = .03
    shader.inputs['Specular IOR Level'].default_value = .12
    tex = nodes.new('ShaderNodeTexImage');tex.image = image
    material.node_tree.links.new(tex.outputs['Color'], shader.inputs['Base Color'])
    glow = bpy.data.materials.new(name + '_soul')
    glow.use_nodes = True
    shader = next(n for n in glow.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    color = (.045,.32,.46,1) if ghost else (.85,.17,.02,1)
    shader.inputs['Base Color'].default_value = color
    shader.inputs['Emission Color'].default_value = color
    shader.inputs['Emission Strength'].default_value = .55 if ghost else .35
    shader.inputs['Roughness'].default_value = 1
    shader.inputs['Specular IOR Level'].default_value = 0
    veil = bpy.data.materials.new(name + '_veil')
    veil.use_nodes = True
    shader = next(n for n in veil.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    shader.inputs['Base Color'].default_value = (.08,.37,.48,1)
    shader.inputs['Emission Color'].default_value = (.025,.23,.34,1)
    shader.inputs['Emission Strength'].default_value = .5
    shader.inputs['Alpha'].default_value = .32
    veil.surface_render_method = 'DITHERED'
    return [material, glow, veil]


class Sculpt:
    def __init__(self, name, ghost):
        self.name, self.ghost = name, ghost
        self.collection = bpy.data.collections.new(name)
        scene.collection.children.link(self.collection)
        self.materials = palette(name, ghost)
        self.parts = {}
        self.rng = random.Random(77)

    def bm(self, bone):
        if bone not in self.parts:
            bm = bmesh.new();bm.loops.layers.uv.new('UVMap')
            self.parts[bone] = bm
        return self.parts[bone]

    def finish(self, bm, old, cell, matrix=None, material=0):
        verts = [v for v in bm.verts if v not in old]
        if matrix is not None:
            bmesh.ops.transform(bm, verts=verts, matrix=matrix)
        uv = bm.loops.layers.uv.active
        faces = {f for v in verts for f in v.link_faces}
        for face in faces:
            face.material_index = material
            # All surfaces share one small weathered pigment atlas.
            ox, oy = cell%4/4, cell//4/4
            phase = self.rng.random()*.6
            for i, loop in enumerate(face.loops):
                a = math.tau*i/len(face.loops)+phase
                loop[uv].uv = (ox+.125+math.cos(a)*.105, oy+.125+math.sin(a)*.105)

    def shape(self, bone, kind, loc, size, cell, rotation=(0,0,0), material=0):
        bm = self.bm(bone);old = set(bm.verts)
        if kind == 'box':
            bmesh.ops.create_cube(bm, size=1)
            edges=list({e for v in bm.verts if v not in old for e in v.link_edges})
            bmesh.ops.bevel(bm, geom=edges, offset=.07, segments=3, affect='EDGES')
        elif kind == 'sphere':
            bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=.5)
        else:
            bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=20,
                                 radius1=.5, radius2=.34 if kind=='taper' else 0, depth=1)
        if kind!='box':
            for v in bm.verts:
                if v not in old and cell in [0,1,4,5,11]:
                    v.co*=1+noise.noise(v.co*9+Vector((cell,3,7)))*.035
            for face in {f for v in bm.verts if v not in old for f in v.link_faces}:face.smooth=True
        matrix = Matrix.Translation(loc) @ Euler(rotation).to_matrix().to_4x4() @ Matrix.Diagonal(Vector((*size,1)))
        self.finish(bm, old, cell, matrix, material)

    def plate(self, bone, loc, size, cell, curve=.25, rotation=(0,0,0)):
        """Dented, curved armour lames with rounded, chipped outlines."""
        bm=self.bm(bone);old=set(bm.verts);width,depth,height=size
        grids=[];nx,ny=10,3
        dent=self.rng.uniform(-.025,.025)
        for back in [False,True]:
            grid=[]
            for j in range(ny+1):
                v=j/ny*2-1;row=[]
                for i in range(nx+1):
                    u=i/nx*2-1
                    rounded=1-.10*abs(v)**4
                    chip=.06 if i==nx-1 and j==0 else 0
                    x=u*width*.5*rounded
                    y= -curve*u*u + (-depth*.5 if back else depth*.5)+dent*math.sin(u*5+v*3)
                    z=v*height*.5*(1-.18*abs(u)**6)+chip
                    row.append(bm.verts.new((x,y,z)))
                grid.append(row)
            grids.append(grid)
        for k,grid in enumerate(grids):
            for j in range(ny):
                for i in range(nx):
                    vs=(grid[j][i],grid[j+1][i],grid[j+1][i+1],grid[j][i+1])
                    face=bm.faces.new(tuple(reversed(vs)) if k else vs);face.smooth=True
        a,b=grids
        border=[(0,i) for i in range(nx+1)]+[(j,nx) for j in range(1,ny+1)]+[(ny,i) for i in range(nx-1,-1,-1)]+[(j,0) for j in range(ny-1,0,-1)]
        for (j,i),(k,l) in zip(border,border[1:]+border[:1]):bm.faces.new((a[j][i],b[j][i],b[k][l],a[k][l]))
        self.finish(bm,old,cell,Matrix.Translation(loc) @ Euler(rotation).to_matrix().to_4x4())

    def tube(self, bone, points, radii, cell, material=0, sides=10):
        if len(points)>2 and max(radii)>.045:
            source=[Vector(p) for p in points];sampled=[];sample_r=[]
            for i in range(len(source)-1):
                p0,p1,p2,p3=source[max(0,i-1)],source[i],source[i+1],source[min(len(source)-1,i+2)]
                for step in range(3):
                    t=step/3
                    sampled.append(tuple(.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t)))
                    sample_r.append(radii[i]*(1-t)+radii[i+1]*t)
            points=sampled+[tuple(source[-1])];radii=sample_r+[radii[-1]]
        bm = self.bm(bone);old = set(bm.verts);rings=[]
        for i, (co, radius) in enumerate(zip(points, radii)):
            direction = Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])
            rotation = Vector((0,0,1)).rotation_difference(direction.normalized())
            rings.append([bm.verts.new(Vector(co)+rotation @ Vector((math.cos(a*math.tau/sides)*radius,math.sin(a*math.tau/sides)*radius,0))) for a in range(sides)])
        for a,b in zip(rings,rings[1:]):
            for i in range(sides):bm.faces.new((a[i],a[(i+1)%sides],b[(i+1)%sides],b[i])).smooth=True
        bm.faces.new(tuple(reversed(rings[0])));bm.faces.new(tuple(rings[-1]))
        self.finish(bm, old, cell, material=material)

    def cloth(self, bone, rows, cell, material=0):
        bm=self.bm(bone);old=set(bm.verts)
        grid=[[bm.verts.new(p) for p in row] for row in rows]
        for a,b in zip(grid,grid[1:]):
            for i in range(len(a)-1):bm.faces.new((a[i],b[i],b[i+1],a[i+1]))
        # Solid back faces avoid introducing a fourth material for cloth culling.
        for face in list({f for v in bm.verts if v not in old for f in v.link_faces}):
            bm.faces.new(tuple(reversed([bm.verts.new(v.co) for v in face.verts])))
        self.finish(bm, old, cell, material=material)


def build(name, ghost):
    s=Sculpt(name,ghost)
    # Coordinates are the upright rest pose, before rigid attachment to the rig.
    for side in [-1,1]:
        x=side*.70
        s.shape('foot'+str(side),'sphere',(x,.16,.35),(.91,1.48,.66),0)
        s.shape('foot'+str(side),'box',(x,.16,.10),(.86,1.37,.16),9)
        s.shape('leg'+str(side),'taper',(x,-.02,2.05),(.76,.80,1.18),9)
        s.shape('shin'+str(side),'taper',(x,-.05,.99),(.75,.83,1.12),1)
        for z in [.65,.99,1.32]:
            s.plate('shin'+str(side),(x,.40,z),(.75,.15,.25),4,curve=.18)
        s.shape('shin'+str(side),'sphere',(x,.36,1.51),(.79,.43,.65),2)
    s.shape('hips','taper',(0,0,2.45),(1.8,1.12,1.4),9)
    s.shape('body','taper',(0,0,3.42),(2.10,1.32,1.40),0)
    s.shape('chest','sphere',(0,0,4.48),(2.30,1.38,1.40),0)
    s.shape('body','sphere',(0,.55,3.71),(2.12,.45,1.08),1)
    s.shape('chest','sphere',(0,.55,4.52),(1.85,.45,1.0),1)
    # Lamellar breastplate with a split central crest and beaten brass rims.
    for i,z in enumerate([3.40,3.72,4.04,4.36,4.68]):
        bone='body' if z<4.2 else 'chest'
        s.plate(bone,(0,.79,z),(2.02-i*.11,.15,.26),4 if i%2 else 1,curve=.30)
        s.plate(bone,(0,.875,z+.09),(1.98-i*.11,.035,.035),6,curve=.30)
    s.shape('body','box',(0,.875,3.75),(.12,.06,.72),6,rotation=(0,.12,0))
    s.shape('chest','box',(0,.875,4.50),(.12,.06,.63),6,rotation=(0,.12,0))
    s.shape('hips','taper',(0,.04,2.95),(2.30,1.40,.32),6)
    for side in [-1,1]:
        for j in range(3):
            s.plate('hips',(side*(.62+j*.06),.61,2.60-j*.34),(.99,.16,.41),4,curve=.20,
                    rotation=(.08,side*.10,side*.04))
            s.plate('hips',(side*(.62+j*.06),.715,2.74-j*.34),(.94,.04,.045),6,curve=.20)
        bone='arm'+str(side);shoulder='shoulder'+str(side)
        s.shape(shoulder,'sphere',(side*1.43,0,4.63),(1.05,1.00,.94),4)
        for j in range(4):
            s.plate(shoulder,(side*(1.51+j*.10),.29,4.98-j*.22),(1.28,.25,.32),4,curve=.38,rotation=(0,side*.10,side*.08))
            s.plate(shoulder,(side*(1.51+j*.10),.45,5.06-j*.22),(1.23,.04,.045),6,curve=.38)
        s.shape(bone,'taper',(side*1.65,.0,4.12),(.68,.69,1.08),9,rotation=(0,side*.13,0))
        forearm='forearm'+str(side);hand='hand'+str(side)
        s.shape(forearm,'sphere',(side*1.84,.09,3.60),(.65,.69,.64),1)
        s.shape(forearm,'taper',(side*1.92,.12,3.26),(.79,.76,.96),1)
        s.shape(hand,'sphere',(side*2.03,.20,2.75),(.69,.67,.78),8)
        for j in range(4):
            s.tube(hand,[(side*(1.8+j*.14),.41,2.76),(side*(1.81+j*.15),.58,2.42),(side*(1.84+j*.15),.28,2.48),(side*(1.83+j*.14),.16,2.64)],[.095,.075,.06,.025],8)
        s.tube(hand,[(side*1.80,.23,2.87),(side*1.62,.42,2.71),(side*1.64,.59,2.58)],[.11,.095,.045],8)
    # Corpse mask, visor and shattered kabuto.
    s.shape('head','sphere',(0,.10,5.64),(1.15,1.04,1.38),8)
    s.shape('head','sphere',(0,-.12,6.03),(1.61,1.32,1.02),0)
    for i in range(3):
        s.shape('head','taper',(0,-.13,5.68-i*.19),(1.79+i*.14,1.42,.20),4)
    s.plate('head',(0,.69,5.90),(1.45,.20,.19),0,curve=.27,rotation=(-.12,0,0))
    s.shape('head','sphere',(0,.64,5.37),(.95,.42,.55),1)
    s.shape('head','taper',(0,.74,5.66),(.20,.25,.42),6,rotation=(.2,0,0))
    for side in [-1,1]:
        s.shape('head','box',(side*.31,.665,5.74),(.38,.055,.10),10,rotation=(0,side*.05,side*.10))
        s.shape('head','box',(side*.31,.704,5.75),(.25,.035,.035),0,material=1)
        s.tube('head',[(side*.33,.76,5.26),(side*.44,.86,5.56),(side*.40,.92,5.72)],[.10,.075,.006],15)
        horn_tip=7.68 if ghost else 7.20 if side==1 else 6.68
        s.tube('head',[(side*.55,-.02,6.18),(side*1.0,.06,6.55),(side*1.32,.08,horn_tip-.2),(side*1.08,.14,horn_tip)],[.20,.16,.085,.007 if ghost or side==1 else .10],6 if not ghost else 8)
    s.shape('head','box',(0,.63,6.18),(.23,.18,.49),6,rotation=(.18,0,0))
    # Nodachi: deliberately larger than the entire human reference.
    s.tube('weapon',[(2.03,.20,2.88),(2.03,.20,3.85)],[.12,.12],9)
    s.shape('weapon','box',(2.03,.20,2.90),(.89,.45,.13),6)
    s.tube('weapon',[(2.03,.20,2.85),(2.03,.20,1.25),(2.03,.20,.20)],[.105,.105,.07],9,sides=8)
    # Long, chipped blade above the grip: its effective extent reaches forward
    # during slam and sweep, while the familiar game hit volumes stay intact.
    s.tube('weapon',[(2.03,.20,3.88),(2.14,.24,5.4),(2.33,.34,6.3),(2.63,.39,6.65)],[.28,.25,.16,.003],11,sides=4)
    for z in [4.20,4.47,4.74]:s.shape('weapon','box',(2.13,.47,z),(.10,.02,.22),6)
    # Torn funeral cloak and high battlefield standard create a monumental back silhouette.
    cape=[]
    for j,z in enumerate([5.02,4.1,3.2,2.3,1.0]):
        cape.append([(x,-.76-.21*math.sin(i*1.8+j),z-(.3 if j==4 and i%2 else 0)) for i,x in enumerate([-1.40,-.70,0,.70,1.40])])
    s.cloth('cape',cape,3 if not ghost else 4)
    s.tube('banner',[(-.73,-.83,3.15),(-.73,-.83,8.15)],[.075,.05],9)
    s.tube('banner',[(-.76,-.83,7.90),(-2.22,-.83,7.90)],[.055,.045],6)
    banner=[]
    for j,z in enumerate([7.83,7.10,6.40,5.65]):
        banner.append([(-.78-i*.36,-.87+math.sin(i*1.7+j)*.11,z-(.32 if j==3 and i%2 else 0)) for i in range(5)])
    s.cloth('banner',banner,4)
    for j in range(3):s.shape('banner','box',(-1.48,-.73,7.46-j*.37),(.49,.035,.11),8)
    # Arrows, fractured shoulder spikes and ritual ties make the war damage legible.
    for side in [-1,1]:
        for i in range(2):
            x=side*(.55+i*.3)
            s.tube('chest',[(x,-.48,4.65),(x+side*.62,-1.45,5.65+i*.18)],[.032,.025],9,sides=5)
            s.shape('chest','box',(x+side*.56,-1.32,5.51+i*.18),(.20,.04,.30),8,rotation=(.6,side*.4,0))
        s.tube('body',[(side*.8,.8,4.4),(side*.91,.87,3.5),(side*.7,.9,3.13)],[.055,.05,.018],6)
    if ghost:
        s.shape('head','box',(0,.83,5.35),(.77,.08,.25),10)
        for i in range(6):
            s.tube('head',[(-.32+i*.13,.91,5.46),(-.29+i*.12,.93,5.30-(i%2)*.08)],[.053,.003],15,sides=5)
        # Detached armour is still the same general; the gaps expose cold soul-light.
        for side in [-1,1]:
            s.tube('body',[(side*.65,.83,4.76),(side*.41,.92,4.23),(side*.53,.93,3.86),(side*.24,.90,3.40)],[.025,.018,.021,.003],0,material=1,sides=4)
            s.tube('head',[(side*.2,.13,6.23),(side*.42,.02,6.85),(side*.17,-.07,7.31)],[.17,.14,.005],0,material=1)
            s.tube('cape',[(side*1.35,-.9,4.1),(side*2.1,-1.1,3.0),(side*1.65,-1.7,1.6),(side*2.65,-1.2,.52)],[.32,.26,.17,.005],0,material=2)
            s.tube('arm'+str(side),[(side*1.82,.1,4.5),(side*2.18,.15,5.16),(side*2.5,.2,5.71)],[.18,.12,.003],0,material=1)
        shroud=[[(x,-1.14-.17*math.cos(i+j),z) for i,x in enumerate([-1.8,-.9,0,.9,1.8])] for j,z in enumerate([5.0,3.0,.22])]
        s.cloth('cape',shroud,0,material=2)

    armature=bpy.data.armatures.new(name+'_rig')
    rig=bpy.data.objects.new(name,armature);s.collection.objects.link(rig)
    bpy.context.view_layer.objects.active=rig;rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    definitions=[('root',(0,0,0),None),('hips',(0,0,2.65),'root'),('body',(0,0,3.3),'hips'),('chest',(0,0,4.2),'body'),
                 ('head',(0,0,5.05),'chest'),('arm-1',(-1.25,0,4.7),'chest'),('arm1',(1.25,0,4.7),'chest'),
                 ('shoulder-1',(-1.25,0,4.7),'chest'),('shoulder1',(1.25,0,4.7),'chest'),
                 ('forearm-1',(-1.84,.09,3.60),'arm-1'),('forearm1',(1.84,.09,3.60),'arm1'),
                 ('hand-1',(-2.03,.20,2.88),'forearm-1'),('hand1',(2.03,.20,2.88),'forearm1'),
                 ('weapon',(2.03,.20,2.88),'hand1'),('leg-1',(-.7,0,2.65),'hips'),('leg1',(.7,0,2.65),'hips'),
                 ('shin-1',(-.7,.12,1.5),'leg-1'),('shin1',(.7,.12,1.5),'leg1'),
                 ('foot-1',(-.7,.16,.45),'shin-1'),('foot1',(.7,.16,.45),'shin1'),
                 ('cape',(0,-.75,4.9),'chest'),('banner',(-.73,-.83,4.5),'chest')]
    for bone,co,parent in definitions:
        b=armature.edit_bones.new(bone);b.head=co;b.tail=Vector(co)+Vector((0,0,.35))
        if parent:b.parent=armature.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.context.view_layer.update()
    for bone,bm in s.parts.items():
        bm.normal_update();mesh=bpy.data.meshes.new(name+'_'+bone);bm.to_mesh(mesh);bm.free()
        for mat in s.materials:mesh.materials.append(mat)
        obj=bpy.data.objects.new(name+'_'+bone,mesh);s.collection.objects.link(obj)
        obj.parent=rig;obj.parent_type='BONE';obj.parent_bone=bone
        obj.matrix_world=Matrix.Identity(4)
    animate_boss(rig,ghost,CLIPS)
    return s,rig


models=[build('rotroot',False),build('rotroot_wraith',True)]
exports=[]
for sculpt,rig in models:
    for obj in bpy.context.view_layer.objects:obj.select_set(False)
    for obj in sculpt.collection.objects:obj.select_set(True)
    bpy.context.view_layer.objects.active=rig
    for track in rig.animation_data.nla_tracks:track.mute=False
    rig.rotation_euler.z=math.pi
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,sculpt.name+'.glb'),export_format='GLB',
        use_selection=True,use_active_scene=True,export_yup=True,export_apply=False,export_animations=True,
        export_animation_mode='NLA_TRACKS',export_merge_animation='NLA_TRACK',
        export_frame_range=False,export_force_sampling=True,export_skins=False,
        export_morph=False,export_cameras=False,export_lights=False,export_materials='EXPORT')
    rig.rotation_euler.z=0
    for track in rig.animation_data.nla_tracks:track.mute=True
    rig.animation_data.action=bpy.data.actions[sculpt.name+'_idle']
    rig.animation_data.action_slot=rig.animation_data.action.slots[0]
    exports.append({'name':sculpt.name,'meshes':len(sculpt.parts)})

# Preview only: the exported roots above remain centred on the arena origin.
models[0][1].location.x=-4.3;models[1][1].location.x=4.3
preview=bpy.data.collections.new('Preview only');scene.collection.children.link(preview)
def prop(name,kind,location,scale,material):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=location) if kind=='sphere' else bpy.ops.mesh.primitive_cube_add(size=1,location=location)
    o=bpy.context.object;o.name=name;o.scale=scale
    for c in list(o.users_collection):c.objects.unlink(o)
    preview.objects.link(o);o.data.materials.append(material)
    for face in o.data.polygons:face.use_smooth=kind=='sphere'
    return o
black=bpy.data.materials.new('Reference silhouette');black.use_nodes=True
shader=next(n for n in black.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
shader.inputs['Base Color'].default_value=(.22,.20,.17,1);shader.inputs['Roughness'].default_value=1
prop('Human 1.7m torso','sphere',(0,2,1.08),(.23,.14,.35),black)
prop('Human head','sphere',(0,2,1.54),(.14,.13,.16),black)
for side in [-1,1]:
    prop('Human leg','sphere',(side*.11,2,.40),(.08,.09,.40),black)
    prop('Human arm','sphere',(side*.30,2,1.02),(.07,.075,.285),black)
ground=bpy.data.materials.new('Atelier floor');ground.use_nodes=True
shader=next(n for n in ground.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
shader.inputs['Base Color'].default_value=(.035,.030,.025,1);shader.inputs['Roughness'].default_value=1
shader.inputs['Specular IOR Level'].default_value=.1
prop('Ground','cube',(0,0,-.16),(28,26,.25),ground)
world=bpy.data.worlds.new('Moonless atelier');world.use_nodes=True
background=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
background.inputs[0].default_value=(.015,.024,.035,1)
background.inputs[1].default_value=.35;scene.world=world
for name,loc,energy,color,size in [('Key',(-7,10,13),2400,(.78,.88,1),9),('Rim',(6,-5,11),3200,(.2,.65,1),7),('Warm',(-9,-3,7),1800,(1,.4,.17),6)]:
    light=bpy.data.lights.new(name,'AREA');light.energy=energy;light.color=color;light.shape='DISK';light.size=size
    obj=bpy.data.objects.new(name,light);preview.objects.link(obj);obj.location=loc
    obj.rotation_euler=(Vector((0,0,3.6))-obj.location).to_track_quat('-Z','Y').to_euler()
camera=bpy.data.cameras.new('Boss comparison');obj=bpy.data.objects.new('Boss comparison',camera);preview.objects.link(obj)
obj.location=(14,28,10.5);obj.rotation_euler=(Vector((0,0,3.8))-obj.location).to_track_quat('-Z','Y').to_euler()
camera.type='ORTHO';camera.ortho_scale=19.5;scene.camera=obj
scene.render.engine='CYCLES';scene.cycles.samples=24
scene.render.resolution_x=1500;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
scene.frame_set(0)
for obj in bpy.context.selected_objects:obj.select_set(False)
models[0][1].select_set(True);bpy.context.view_layer.objects.active=models[0][1]
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_perspective='CAMERA'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(REPO,'scripts/blender/bosses.blend'))
result={'source':bpy.data.filepath,'exports':exports}
