"""Shared helpers for building the weathered props (run inside Blender via exec; see props.py).

Conventions: metres, +Z up in Blender (exporter converts to glTF +Y up), origin at the
base centre, vertex colours carry all the weathering (no textures).
"""
import math
import random

import bpy
import bmesh
from mathutils import Matrix, Vector, noise

# REPO (the checkout's path) is defined by the script that execs this file
OUT = REPO + '/scripts/blender/export'

# faded woodblock palette, linear RGB
C = dict(
    wood=(0.17, 0.12, 0.08), wood_dark=(0.07, 0.05, 0.04), wood_pale=(0.30, 0.25, 0.18),
    moss=(0.07, 0.13, 0.04), moss_dry=(0.14, 0.15, 0.06),
    stone=(0.22, 0.21, 0.19), stone_dark=(0.09, 0.09, 0.09),
    rust=(0.22, 0.09, 0.05), iron=(0.07, 0.07, 0.08), steel=(0.30, 0.31, 0.33),
    vermilion=(0.22, 0.06, 0.04), cloth_red=(0.34, 0.07, 0.05), cloth=(0.36, 0.31, 0.24),
    indigo=(0.05, 0.07, 0.16), rope=(0.20, 0.16, 0.10), feather=(0.30, 0.27, 0.22),
)

# the game lights props dimly by moonlight and glTF vertex colours are linear, so lift the whole palette
C = {k: tuple(min(0.9, x * 1.7) for x in v) for k, v in C.items()}
DIRT = (0.17, 0.13, 0.085)


def lerp(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def mix(*pairs):
    """Weighted sum of colours: mix((c1, w1), (c2, w2))."""
    s = sum(w for _, w in pairs)
    return tuple(sum(c[i] * w for c, w in pairs) / s for i in range(3))


_MAT = None


def material():
    """One shared material: vertex colour -> base colour, rough, dielectric (rebuilt each call; UI may be localized)."""
    m = bpy.data.materials.get('weathered') or bpy.data.materials.new('weathered')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    col = nt.nodes.new('ShaderNodeVertexColor')
    col.layer_name = 'Col'
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    nt.links.new(col.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.92
    bsdf.inputs['Metallic'].default_value = 0.0
    return m


def collection(name):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(c)
    return c


def clear(name):
    """Remove the objects and meshes of a previous build of this prop."""
    c = collection(name)
    for o in list(c.objects):
        me = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if me and me.users == 0:
            bpy.data.meshes.remove(me)
    return c


def jitter(bm, amount, scale=3.0, seed=0):
    """Hand-hewn irregularity: low-frequency noise displacement."""
    for v in bm.verts:
        p = v.co * scale + Vector((seed * 7.1, seed * 3.3, seed * 5.9))
        v.co += Vector((noise.noise(p), noise.noise(p + Vector((11, 5, 3))), noise.noise(p + Vector((2, 17, 9))))) * amount


def box(bm, size, loc=(0, 0, 0), rot=(0, 0, 0), cuts=0):
    """Add a cuboid; `cuts` subdivides it so jitter can bend it."""
    mat = Matrix.Translation(loc) @ Matrix.Rotation(rot[2], 4, 'Z') @ Matrix.Rotation(rot[1], 4, 'Y') @ Matrix.Rotation(rot[0], 4, 'X')
    before = set(bm.verts)
    ret = bmesh.ops.create_cube(bm, size=1.0)
    verts = ret['verts']
    bmesh.ops.scale(bm, vec=Vector(size), verts=verts)
    bmesh.ops.transform(bm, matrix=mat, verts=verts)
    if cuts:
        edges = list({e for v in verts for e in v.link_edges})
        bmesh.ops.subdivide_edges(bm, edges=edges, cuts=cuts, use_grid_fill=True)
    return [v for v in bm.verts if v not in before]


def cyl(bm, r1, r2, h, loc=(0, 0, 0), rot=(0, 0, 0), seg=8, cap=True):
    mat = Matrix.Translation(loc) @ Matrix.Rotation(rot[2], 4, 'Z') @ Matrix.Rotation(rot[1], 4, 'Y') @ Matrix.Rotation(rot[0], 4, 'X')
    ret = bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=seg, radius1=r1, radius2=r2, depth=h)
    bmesh.ops.transform(bm, matrix=mat, verts=ret['verts'])
    return ret['verts']


def sphere(bm, r, loc=(0, 0, 0), scale=(1, 1, 1), seg=10, rings=6):
    ret = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    mat = Matrix.Translation(loc) @ Matrix.Diagonal(Vector((*scale, 1)))
    bmesh.ops.transform(bm, matrix=mat, verts=ret['verts'])
    return ret['verts']


def make(name, bm, coll, paint, loc=(0, 0, 0), smooth=False):
    """bmesh -> object in `coll`, with vertex colours from paint(world_co, normal, face_index)."""
    bm.normal_update()
    me = bpy.data.meshes.new(name)
    lay = bm.loops.layers.float_color.new('Col')
    for f in bm.faces:
        for l in f.loops:
            n = l.vert.normal if smooth or f.smooth else f.normal
            l[lay] = (*paint(l.vert.co.copy(), n.copy(), f.index), 1.0)
    bm.to_mesh(me)
    bm.free()
    me.color_attributes.active_color = me.color_attributes['Col']
    me.color_attributes.render_color_index = 0
    me.materials.append(material())
    for p in me.polygons:
        p.use_smooth = smooth
    o = bpy.data.objects.new(name, me)
    o.location = loc
    coll.objects.link(o)
    return o


def weather(base, up_moss=0.0, grime=0.5, grain=0.0, seed=0, moss_col=None):
    """Paint function: base colour, dirt creeping up from the ground, moss on upward faces, noise mottling."""
    moss_col = moss_col or C['moss']

    def f(co, n, _i):
        p = co * 4.0 + Vector((seed * 3.7, seed * 1.3, seed * 9.1))
        m = noise.noise(p) * 0.5 + 0.5
        c = lerp(base, tuple(x * 0.55 for x in base), m * 0.6)
        if grain:
            g = noise.noise(Vector((co.x * 40, co.y * 40, co.z * 6)) + p) * 0.5 + 0.5
            c = lerp(c, tuple(x * 0.6 for x in c), g * grain)
        low = max(0.0, 1.0 - co.z / 0.5)
        c = lerp(c, C['wood_dark'], min(1.0, low * grime))
        if up_moss:
            k = max(0.0, n.z) * (0.4 + 0.6 * (noise.noise(p * 1.7) * 0.5 + 0.5)) * up_moss
            c = lerp(c, moss_col, min(1.0, k))
        return c

    return f


def export(name, objs, tris_max=None):
    """Export `objs` as <OUT>/<name>.glb (selection only, +Y up, vertex colours)."""
    import os
    os.makedirs(OUT, exist_ok=True)
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    path = f'{OUT}/{name}.glb'
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                              export_vertex_color='ACTIVE', export_active_vertex_color_when_no_material=True,
                              export_materials='EXPORT', export_cameras=False, export_lights=False)
    tris = sum(len(o.data.polygons) and sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs)
    return {'file': path, 'tris': tris}
