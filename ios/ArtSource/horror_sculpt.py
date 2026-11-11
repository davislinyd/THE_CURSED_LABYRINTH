"""Baked sculpt operations for the iOS colossus; no runtime subdivision or displacement."""
import bpy,math
from mathutils import Vector

def tube(model,node,points,radii,material,sides=20,axial=False):
    vertices=[];faces=[]
    for i,p in enumerate(points):
        p=Vector(p);a=Vector(points[max(0,i-1)]);b=Vector(points[min(len(points)-1,i+1)])
        axis=Vector((0,0,1)) if axial else (b-a).normalized();reference=Vector((0,1,0)) if abs(axis.y)<.9 else Vector((1,0,0))
        x=axis.cross(reference).normalized();y=axis.cross(x).normalized()
        for j in range(sides):
            angle=j*math.tau/sides;radius=radii[i]*(1+.035*math.sin(angle*7+i*.8))
            vertices.append(p+radius*(math.cos(angle)*x+math.sin(angle)*y))
    for i in range(len(points)-1):
        for j in range(sides):
            a=i*sides+j;b=i*sides+(j+1)%sides;c=b+sides;d=a+sides;faces.append((a,b,c,d))
    faces.extend([tuple(reversed(range(sides))),tuple((len(points)-1)*sides+j for j in range(sides))])
    mesh=bpy.data.meshes.new(node+'_sculpt');mesh.from_pydata(vertices,[],faces);mesh.update()
    uv=mesh.uv_layers.new()
    for poly in mesh.polygons:
        poly.use_smooth=True
        for loop in poly.loop_indices:
            idx=mesh.loops[loop].vertex_index;uv.data[loop].uv=((idx%sides)/sides,(idx//sides)/max(1,len(points)-1))
    obj=bpy.data.objects.new(node+'_sculpt',mesh);bpy.context.scene.collection.objects.link(obj);obj.parent=model.nodes[node];mesh.materials.append(material)
    model.parts[node].append(obj);model.objects.append(obj);return obj

def carve(obj,location,scale):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=20,radius=1)
    cutter=bpy.context.object;cutter.location=location;cutter.scale=scale
    # Cutter coordinates are in the same local component space as the baked skin.
    cutter.parent=obj.parent
    bpy.context.view_layer.update();bpy.context.view_layer.objects.active=obj
    modifier=obj.modifiers.new('Carved eye or mouth cavity','BOOLEAN');modifier.operation='DIFFERENCE';modifier.solver='EXACT';modifier.object=cutter
    bpy.ops.object.modifier_apply(modifier=modifier.name);bpy.data.objects.remove(cutter,do_unlink=True)

def skin(model,node,material,voxel,image,cavity=None):
    objects=[o for o in model.parts[node] if o.data.materials and o.data.materials[0]==material]
    if not objects:return
    remaining=[o for o in model.parts[node] if o not in objects]
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();obj=bpy.context.object
    model.parts[node]=remaining+[obj]
    remesh=obj.modifiers.new('Fuse anatomical masses','REMESH');remesh.mode='VOXEL';remesh.voxel_size=voxel;remesh.use_smooth_shade=True
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    smooth=obj.modifiers.new('Relax sculpt surface','SMOOTH');smooth.factor=.5;smooth.iterations=3;bpy.ops.object.modifier_apply(modifier=smooth.name)
    # Match primitive layer names so joining cannot select an empty, older render UV set.
    while obj.data.uv_layers:obj.data.uv_layers.remove(obj.data.uv_layers[0])
    uv=obj.data.uv_layers.new(name='UVMap');uv.active_render=True
    for loop in obj.data.loops:
        p=obj.data.vertices[loop.vertex_index].co
        uv.data[loop.index].uv=(p.x*.12+.5,p.z*.12+.5) if node=='head' else (p.x*.25+.5,p.y*.25+.5)
    sub=obj.modifiers.new('Near-camera sculpt density','SUBSURF');sub.levels=1;bpy.ops.object.modifier_apply(modifier=sub.name)
    texture=bpy.data.textures.new(node+'_skin_relief',type='IMAGE');texture.image=image
    displacement=obj.modifiers.new('Baked hide fissures','DISPLACE');displacement.texture=texture;displacement.texture_coords='UV';displacement.strength=.075 if node=='head' else .04;displacement.mid_level=.5
    bpy.ops.object.modifier_apply(modifier=displacement.name)
    obj.data.materials.clear();obj.data.materials.append(material)
    if cavity:obj.data.materials.append(cavity)
    obj.data.update()
    for poly in obj.data.polygons:
        poly.use_smooth=True;poly.material_index=0
        if cavity:
            p=poly.center
            socket=abs(abs(p.x)-2.1)<1.45 and abs(p.z-1.55)<1.1 and p.y>-2.0
            mouth=abs(p.x)<2.8 and -6.5<p.z<-.7 and p.y>-2.1
            if socket or mouth:poly.material_index=1

def torso(model,node,material):
    points=[(-12,5,3.4),(-8,5.6,3.7),(-4,7.1,4),(0,9.5,4.2),(4,12.8,4.6),(7,11.5,4.5),(10,5.8,3.3)]
    vertices=[];faces=[];sides=64;rows=36
    for row in range(rows):
        z=-12+22*row/(rows-1)
        for a,b in zip(points,points[1:]):
            if a[0]<=z<=b[0]:
                t=(z-a[0])/(b[0]-a[0]);rx=a[1]+(b[1]-a[1])*t;ry=a[2]+(b[2]-a[2])*t;break
        for j in range(sides):
            angle=j*math.tau/sides;wave=1+.015*math.sin(angle*13+z*.7)+.012*math.sin(z*5+angle*3)
            vertices.append((rx*math.cos(angle)*wave,ry*math.sin(angle)*wave,z))
    for row in range(rows-1):
        for j in range(sides):a=row*sides+j;b=row*sides+(j+1)%sides;faces.append((a,b,b+sides,a+sides))
    mesh=bpy.data.meshes.new('Emaciated torso');mesh.from_pydata(vertices,[],faces);mesh.update();uv=mesh.uv_layers.new()
    for poly in mesh.polygons:
        poly.use_smooth=True
        for loop in poly.loop_indices:
            i=mesh.loops[loop].vertex_index;uv.data[loop].uv=((i%sides)/sides,(i//sides)/(rows-1))
    obj=bpy.data.objects.new('Emaciated torso',mesh);bpy.context.scene.collection.objects.link(obj);obj.parent=model.nodes[node];mesh.materials.append(material);model.parts[node].append(obj);model.objects.append(obj)
