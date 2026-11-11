"""Web HD hero: the samurai's armour as rigid parts, one mesh per joint of src/actors/Rig.ts.

Run headless (no MCP needed), from the checkout:

  /Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/blender/web_hero.py -- "$PWD" [preview-dir]

Writes scripts/blender/export/web_samurai.glb (nodes `part_<joint>`, vertices in the joint's
own space, so the game parents each node to its joint unchanged) and the editable source
scripts/blender/web_hero.blend. Material slots carry only names (lacquer, laced, gold, ...):
the game supplies the PBR materials (src/actors/SamuraiHD.ts). The modelling approach
(curved lames, tubes, rigid parts per joint) follows scripts/blender/bosses.py; nothing of
the iOS boss files is read or written.

Authoring space is the game's: x to the character's left, y up, z forward, metres.
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
REPO = globals().get('REPO') or (argv[0] if argv else os.getcwd())
PREVIEW = argv[1] if len(argv) > 1 else None
OUT = os.path.join(REPO, 'scripts/blender/export')

MATS = ['lacquer', 'laced', 'lacedDark', 'gold', 'mask', 'cloth', 'sash', 'leather', 'straw', 'steel', 'edge', 'shadow']
# preview colours only (the game replaces every material by name)
TINT = dict(lacquer=(.02, .017, .015), laced=(.30, .03, .03), lacedDark=(.035, .045, .11), gold=(.58, .38, .11),
            mask=(.25, .03, .025), cloth=(.02, .03, .07), sash=(.33, .035, .035), leather=(.07, .045, .03),
            straw=(.22, .18, .10), steel=(.6, .63, .68), edge=(.9, .92, .95), shadow=(.004, .003, .003))

# joints at rest, from HUMAN in src/actors/Rig.ts
HIP = .95
J = {'hips': (0, HIP, 0), 'spine': (0, HIP + .06, 0), 'chest': (0, HIP + .20, 0), 'neck': (0, HIP + .44, 0), 'head': (0, HIP + .54, 0), 'weapon': (0, 0, 0)}
for s, side in (('L', 1), ('R', -1)):
    J['shoulder' + s] = (side * .0855, HIP + .39, 0)
    J['arm' + s] = (side * .19, HIP + .39, 0)
    J['forearm' + s] = (side * .19, HIP + .10, 0)
    J['hand' + s] = (side * .19, HIP - .16, 0)
    J['thigh' + s] = (side * .10, HIP - .04, 0)
    J['shin' + s] = (side * .10, HIP - .48, 0)
    J['foot' + s] = (side * .10, HIP - .91, 0)


def B(p):
    """Game space -> Blender (z up, -y forward); the glTF exporter's y-up turn brings it back."""
    return Vector((p[0], -p[2], p[1]))


def rot(rx=0, ry=0, rz=0, pivot=(0, 0, 0)):
    """Rotation (radians, game axes) about a pivot."""
    p = Vector(pivot)
    return Matrix.Translation(p) @ Euler((rx, ry, rz), 'XYZ').to_matrix().to_4x4() @ Matrix.Translation(-p)


class Kit:
    def __init__(self):
        self.parts = {}
        self.uvs = {}

    def bm(self, bone):
        if bone not in self.parts:
            bm = bmesh.new()
            bm.loops.layers.uv.new('UVMap')
            self.parts[bone] = bm
        return self.parts[bone]

    def vert(self, bone, p, M=None, uv=None):
        p = Vector(p)
        if M is not None:
            p = M @ p
        v = self.bm(bone).verts.new(B(p - Vector(J[bone])))
        if uv is not None:
            self.uvs[v] = uv
        return v

    def face(self, bone, vs, mat):
        try:
            f = self.bm(bone).faces.new(vs)
        except ValueError:
            return None
        f.material_index = MATS.index(mat)
        f.smooth = True
        return f

    def shell(self, bone, mat, c, prof, a0=0, a1=360, seg=24, sx=1, sz=1, thick=.008, M=None, tile=.25):
        """A lathe about the vertical through c: prof is [(radius, height above c)], top first. Angles are
        degrees from the front (+z) toward the left (+x). With thickness it is a closed plate."""
        closed = a1 - a0 >= 360 - 1e-6
        n = seg if closed else seg + 1

        def grid(off):
            rows = []
            for r, y in prof:
                row = []
                for k in range(n):
                    a = math.radians(a0 + (a1 - a0) * k / seg)
                    rr = max(r - off, .0004)
                    uv = (math.radians(a0 + (a1 - a0) * k / seg) * r * max(sx, sz) / tile, (c[1] + y) / tile)
                    row.append(self.vert(bone, (c[0] + math.sin(a) * rr * sx, c[1] + y, c[2] + math.cos(a) * rr * sz), M, uv))
                rows.append(row)
            return rows

        outer = grid(0)
        inner = grid(thick) if thick else None
        cols = n if closed else n - 1
        for j in range(len(prof) - 1):
            for k in range(cols):
                k2 = (k + 1) % n
                self.face(bone, (outer[j][k], outer[j + 1][k], outer[j + 1][k2], outer[j][k2]), mat)
                if inner:
                    self.face(bone, (inner[j][k], inner[j][k2], inner[j + 1][k2], inner[j + 1][k]), mat)
        if inner:
            for j in (0, len(prof) - 1):
                for k in range(cols):
                    k2 = (k + 1) % n
                    vs = (outer[j][k], outer[j][k2], inner[j][k2], inner[j][k])
                    self.face(bone, vs if j == 0 else tuple(reversed(vs)), mat)
            if not closed:
                for k in (0, n - 1):
                    for j in range(len(prof) - 1):
                        vs = (outer[j][k], inner[j][k], inner[j + 1][k], outer[j + 1][k])
                        self.face(bone, vs if k == 0 else tuple(reversed(vs)), mat)

    def lames(self, bone, mat, c, count, r0, flare, y0, drop, a0, a1, seg=12, sx=1, sz=1, grow=.0, M=None, lap=.012, belly=.012):
        """A hanging row of lames (shikoro, sode, kusazuri): each starts under the one above and bellies out."""
        for i in range(count):
            r = r0 + i * grow
            y = y0 - i * drop
            self.shell(bone, mat, c, [(r, y + lap), (r + belly + flare * .5, y - drop * .45), (r + flare, y - drop)], a0, a1, seg, sx, sz, .006, M)

    def solid(self, bone, mat, kind, c, size, r=(0, 0, 0), M=None, bevel=.004):
        """A box (bevelled) or ball of the given full size, turned by r (radians) about its centre."""
        bm = self.bm(bone)
        old = set(bm.verts)
        if kind == 'box':
            bmesh.ops.create_cube(bm, size=1)
            new = [v for v in bm.verts if v not in old]
            bmesh.ops.scale(bm, vec=Vector(size), verts=new)
            if bevel:
                edges = list({e for v in new for e in v.link_edges})
                bmesh.ops.bevel(bm, geom=edges, offset=min(bevel, min(size) * .3), segments=2, affect='EDGES')
        else:
            bmesh.ops.create_uvsphere(bm, u_segments=18, v_segments=11, radius=.5)
            new = [v for v in bm.verts if v not in old]
            bmesh.ops.scale(bm, vec=Vector(size), verts=new)
        new = [v for v in bm.verts if v not in old]
        T = Matrix.Translation(Vector(c)) @ Euler(r, 'XYZ').to_matrix().to_4x4()
        if M is not None:
            T = M @ T
        origin = Vector(J[bone])
        for v in new:
            # built in game axes, stored in Blender's
            v.co = B(T @ v.co - origin)
        for f in {f for v in new for f in v.link_faces}:
            f.material_index = MATS.index(mat)
            f.smooth = True

    def tube(self, bone, mat, pts, radii, sides=10, M=None, flat=1.0, smooth=True, tile=.25):
        """A tube through pts (Catmull-Rom when more than two); `flat` squashes its cross-section sideways."""
        src = [Vector(p) for p in pts]
        if len(src) > 2 and smooth:
            P, R = [], []
            for i in range(len(src) - 1):
                p0, p1, p2, p3 = src[max(0, i - 1)], src[i], src[i + 1], src[min(len(src) - 1, i + 2)]
                for st in range(4):
                    t = st / 4
                    P.append(.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t))
                    R.append(radii[i] * (1 - t) + radii[i + 1] * t)
            P.append(src[-1])
            R.append(radii[-1])
        else:
            P, R = src, list(radii)
        rings, run, q, last = [], 0.0, None, None
        for i, (p, r) in enumerate(zip(P, R)):
            d = (P[min(i + 1, len(P) - 1)] - P[max(0, i - 1)]).normalized()
            # carry the frame along the curve (no flips where the tube turns or runs downward)
            if q is None:
                up = Vector((0, 1, 0)) if d.y >= 0 else Vector((0, -1, 0))
                q = up.rotation_difference(d)
                if d.y < 0:
                    q = q @ Euler((math.pi, 0, 0)).to_quaternion()
            else:
                q = last.rotation_difference(d) @ q
            last = d
            if i:
                run += (P[i] - P[i - 1]).length
            ring = []
            for k in range(sides):
                a = math.tau * k / sides
                ring.append(self.vert(bone, p + q @ Vector((math.sin(a) * r * flat, 0, math.cos(a) * r)), M, (a * max(r, .01) / tile, run / tile)))
            rings.append(ring)
        for a, b in zip(rings, rings[1:]):
            for k in range(sides):
                self.face(bone, (a[k], a[(k + 1) % sides], b[(k + 1) % sides], b[k]), mat)
        self.face(bone, tuple(reversed(rings[0])), mat)
        self.face(bone, tuple(rings[-1]), mat)

    def slab(self, bone, mat, outline, z, depth, M=None):
        """A flat shape (outline in x, y) at depth z, `depth` thick: crests, horns, guards."""
        front = [self.vert(bone, (x, y, z + depth / 2), M) for x, y in outline]
        back = [self.vert(bone, (x, y, z - depth / 2), M) for x, y in outline]
        self.face(bone, front, mat)
        self.face(bone, tuple(reversed(back)), mat)
        n = len(outline)
        for i in range(n):
            self.face(bone, (front[i], back[i], back[(i + 1) % n], front[(i + 1) % n]), mat)

    def sheet(self, bone, mat, rows, M=None):
        """Cloth: a grid of points, one face thick (its material is drawn two-sided)."""
        grid = [[self.vert(bone, p, M, (p[0] / .25, p[1] / .25)) for p in row] for row in rows]
        for a, b in zip(grid, grid[1:]):
            for i in range(len(a) - 1):
                self.face(bone, (a[i], b[i], b[i + 1], a[i + 1]), mat)

    def finish(self):
        """Normals, hard edges and UVs of every part; one mesh object per joint."""
        scene = bpy.context.scene
        coll = bpy.data.collections.new('web_samurai')
        scene.collection.children.link(coll)
        mats = []
        for name in MATS:
            m = bpy.data.materials.new(name)
            m.use_nodes = True
            sh = next(n for n in m.node_tree.nodes if n.bl_idname == 'ShaderNodeBsdfPrincipled')
            sh.inputs['Base Color'].default_value = (*TINT[name], 1)
            sh.inputs['Roughness'].default_value = .25 if name in ('gold', 'steel', 'edge') else .45 if name in ('lacquer', 'mask', 'laced', 'lacedDark') else .9
            sh.inputs['Metallic'].default_value = 1 if name in ('gold', 'steel', 'edge') else 0
            mats.append(m)
        objs, tris = [], 0
        for bone, bm in self.parts.items():
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            uv = bm.loops.layers.uv.active
            for f in bm.faces:
                n = f.normal
                for loop in f.loops:
                    known = self.uvs.get(loop.vert)
                    if known is not None:
                        loop[uv].uv = known
                    else:
                        co = loop.vert.co
                        # planar, along the face's main axis (Blender axes: z is up)
                        ax = max(range(3), key=lambda i: abs(n[i]))
                        loop[uv].uv = ((co.x if ax != 0 else co.y) / .25, (co.z if ax != 2 else co.y) / .25)
            for e in bm.edges:
                if len(e.link_faces) == 2 and e.calc_face_angle(0) > math.radians(40):
                    e.smooth = False
            tris += sum(len(f.verts) - 2 for f in bm.faces)
            mesh = bpy.data.meshes.new('part_' + bone)
            bm.to_mesh(mesh)
            bm.free()
            for m in mats:
                mesh.materials.append(m)
            obj = bpy.data.objects.new('part_' + bone, mesh)
            coll.objects.link(obj)
            objs.append((bone, obj))
        return coll, objs, tris


def build():
    k = Kit()
    PI = math.pi

    # ---------------------------------------------------------------- head: kabuto, menpo, crest
    HC = (0, 1.60, -.005)
    k.solid('head', 'shadow', 'ball', (0, 1.572, 0), (.176, .2, .19))
    k.shell('head', 'lacquer', HC, [(.012, .121), (.034, .117), (.068, .107), (.1, .089), (.122, .061), (.132, .03), (.135, 0)], seg=32, sz=1.12, thick=.008)
    k.solid('head', 'gold', 'ball', (0, 1.722, -.005), (.034, .016, .036))
    # suji: raised ribs down the bowl, the front one gilt
    for i in range(16):
        a = math.tau * i / 16
        pts = [(HC[0] + math.sin(a) * r * 1.0, HC[1] + y + .002, HC[2] + math.cos(a) * r * 1.12) for r, y in [(.03, .117), (.068, .107), (.1, .089), (.123, .061), (.133, .03), (.136, .004)]]
        k.tube('head', 'gold' if i == 0 else 'lacquer', pts, [.0028] * 6 if i else [.004] * 6, sides=5)
    k.shell('head', 'gold', HC, [(.136, .012), (.14, .002), (.137, -.009)], seg=32, sz=1.12, thick=.004)
    # mabizashi: the peak, turned down over the eyes
    k.shell('head', 'lacquer', HC, [(.134, .008), (.156, -.006), (.176, -.026)], -62, 62, 16, sz=1.12, thick=.006)
    k.tube('head', 'gold', [(math.sin(math.radians(a)) * .177, 1.60 - .026, -.005 + math.cos(math.radians(a)) * .177 * 1.12) for a in range(-62, 63, 12)], [.0035] * 11, sides=5)
    # shikoro: four lames round the nape, flaring out
    k.lames('head', 'laced', HC, 4, .139, .03, -.004, .037, 58, 302, seg=28, sz=1.1, grow=.021)
    k.shell('head', 'gold', HC, [(.236, -.148), (.24, -.153), (.236, -.158)], 58, 302, 28, sz=1.1, thick=.004)
    for s in (1, -1):
        # fukigaeshi: the lames' ends turned back, with a gilt boss
        k.solid('head', 'laced', 'box', (s * .142, 1.578, .086), (.012, .062, .07), (0, s * .95, 0), bevel=.005)
        k.solid('head', 'gold', 'ball', (s * .151, 1.58, .098), (.012, .03, .03), (0, s * .95, 0))
    # menpo: half mask with nose, cheeks and bared teeth; the throat guard under it
    FC = (0, 1.53, 0)
    k.shell('head', 'mask', FC, [(.093, .046), (.101, .02), (.099, -.008), (.087, -.034), (.062, -.05)], -78, 78, 18, sz=1.1, thick=.006)
    k.solid('head', 'mask', 'ball', (0, 1.552, .108), (.03, .04, .04))
    for s in (1, -1):
        k.tube('head', 'mask', [(s * .012, 1.544, .112), (s * .05, 1.554, .094), (s * .084, 1.566, .05)], [.006, .007, .004], sides=6)
        k.tube('head', 'gold', [(s * .008, 1.522, .108), (s * .03, 1.516, .1), (s * .05, 1.523, .086)], [.003, .0045, .002], sides=5)
    k.solid('head', 'gold', 'box', (0, 1.51, .1), (.046, .007, .012), bevel=.002)
    k.lames('head', 'laced', (0, 1.488, 0), 2, .088, .02, .004, .03, -62, 62, seg=12, sz=1.05, grow=.016)
    for s in (1, -1):
        k.solid('head', 'steel', 'ball', (s * .034, 1.582, .086), (.02, .008, .01))
    # maedate: the lantern flame between kuwagata horns, leaning back
    lean = rot(-.2, 0, 0, (0, 1.615, .15))
    flame = [(0, 1.625), (.02, 1.648), (.031, 1.682), (.022, 1.716), (.008, 1.742), (0, 1.79), (-.008, 1.742), (-.022, 1.716), (-.031, 1.682), (-.02, 1.648)]
    k.slab('head', 'gold', flame, .158, .006, lean)
    k.solid('head', 'gold', 'ball', (0, 1.622, .156), (.04, .022, .016), M=lean)
    for s in (1, -1):
        horn = [(.01, 1.612), (.034, 1.616), (.064, 1.652), (.092, 1.71), (.108, 1.782), (.112, 1.835), (.094, 1.775), (.074, 1.715), (.046, 1.668), (.02, 1.642), (.01, 1.638)]
        k.slab('head', 'gold', [(s * x, y) for x, y in (horn if s > 0 else reversed(horn))], .152, .004, lean)

    # ---------------------------------------------------------------- neck and torso
    k.tube('neck', 'cloth', [(0, 1.36, 0), (0, 1.44, 0), (0, 1.51, 0)], [.062, .056, .054], sides=14)
    # do: the cuirass, laced in rows, wider at the chest
    k.shell('chest', 'laced', (0, 1.15, 0), [(.168, .282), (.19, .262), (.202, .2), (.198, .14), (.188, .06), (.174, -.02), (.16, -.078)], seg=32, sz=.74, thick=.01)
    k.shell('chest', 'gold', (0, 1.15, 0), [(.17, .292), (.194, .272), (.196, .258)], seg=32, sz=.74, thick=.005)
    k.shell('chest', 'gold', (0, 1.15, 0), [(.163, -.07), (.165, -.08), (.161, -.088)], seg=32, sz=.74, thick=.005)
    k.solid('chest', 'cloth', 'ball', (0, 1.385, 0), (.37, .13, .25))
    for s in (1, -1):
        # watagami straps over the shoulders, a gilt leaf hanging from each
        k.solid('chest', 'lacquer', 'box', (s * .108, 1.432, 0), (.062, .02, .21), (0, 0, -s * .12), bevel=.006)
        k.solid('chest', 'gold', 'box', (s * .108, 1.441, .1), (.066, .008, .012), (0, 0, -s * .12), bevel=.002)
        leaf = [(0, 1.405), (.026, 1.39), (.03, 1.362), (.016, 1.338), (0, 1.326), (-.016, 1.338), (-.03, 1.362), (-.026, 1.39)]
        k.slab('chest', 'gold', [(s * .118 + x, y) for x, y in leaf], .13, .005, rot(.12, s * .35, 0, (s * .118, 1.37, .13)))
    # the lantern crest on the breast
    k.solid('chest', 'gold', 'ball', (0, 1.31, .146), (.07, .07, .014))
    k.solid('chest', 'lacquer', 'ball', (0, 1.31, .15), (.046, .046, .012))
    k.slab('chest', 'gold', [(0, 1.292), (.009, 1.303), (.012, 1.316), (0, 1.334), (-.012, 1.316), (-.009, 1.303)], .157, .004)
    # agemaki: the tasselled bow on the back plate
    for s in (1, -1):
        k.tube('chest', 'sash', [(0, 1.31, -.152), (s * .05, 1.342, -.16), (s * .086, 1.312, -.16), (s * .05, 1.284, -.16), (0, 1.31, -.152)], [.008] * 5, sides=6)
        k.tube('chest', 'sash', [(s * .006, 1.305, -.154), (s * .022, 1.22, -.158), (s * .03, 1.14, -.15)], [.007, .007, .012], sides=6)
    k.solid('chest', 'sash', 'ball', (0, 1.31, -.156), (.03, .03, .02))
    # belly under the cuirass, and the sash with its knot
    k.shell('spine', 'cloth', (0, 1.01, 0), [(.158, .1), (.158, 0), (.15, -.07)], seg=24, sz=.77, thick=0)
    k.shell('spine', 'sash', (0, 1.035, 0), [(.164, .038), (.173, .022), (.174, -.022), (.164, -.038)], seg=28, sz=.78, thick=.008)
    k.solid('spine', 'sash', 'ball', (.062, 1.035, .128), (.056, .05, .04))
    k.sheet('spine', 'sash', [[(.04 + i * .022, 1.03 - j * .075, .14 + .006 * math.sin(i * 2 + j) + j * .004) for i in range(3)] for j in range(4)])

    # ---------------------------------------------------------------- hips: skirt of tassets, scabbard
    k.shell('hips', 'cloth', (0, .95, 0), [(.152, .07), (.158, 0), (.152, -.08), (.128, -.17)], seg=24, sz=.82, thick=0)
    for a in (27, -27, 80, -80, 131, -131, 180):
        k.lames('hips', 'laced', (0, .95, 0), 3, .166, .022, .04, .056, a - 21, a + 21, seg=8, sz=.86, grow=.017)
        k.shell('hips', 'gold', (0, .95, 0), [(.221, -.122), (.225, -.128), (.221, -.134)], a - 21, a + 21, 8, sz=.86, thick=.004)
    # saya: mouth at the front, tail behind, a gentle sori
    k.tube('hips', 'lacquer', [(.19, 1.066, .23), (.2, .99, .02), (.208, .9, -.23), (.214, .8, -.47)], [.021, .021, .02, .017], sides=12, flat=.72)
    k.shell('hips', 'gold', (0, 0, 0), [(.0235, .012), (.025, 0), (.0235, -.012)], seg=12, thick=.004, M=Matrix.Translation(Vector((.191, 1.058, .21))) @ Euler((1.2, 0, 0), 'XYZ').to_matrix().to_4x4())
    k.solid('hips', 'gold', 'ball', (.214, .797, -.478), (.036, .04, .05), (1.2, 0, 0))
    k.solid('hips', 'gold', 'ball', (.212, 1.012, .09), (.018, .02, .03))
    k.tube('hips', 'sash', [(.212, 1.012, .09), (.186, 1.03, .1), (.17, 1.038, .06), (.19, 1.0, .02), (.214, .99, .03)], [.005] * 5, sides=5)

    for s, side in (('L', 1), ('R', -1)):
        ax = side * .19
        # ------------------------------------------------------------ arms: sode, sleeve, kote, hand
        k.solid('arm' + s, 'cloth', 'ball', (ax, 1.345, 0), (.135, .115, .135))
        k.tube('arm' + s, 'cloth', [(ax, 1.36, 0), (ax, 1.2, 0), (ax, 1.04, 0)], [.064, .062, .052], sides=14)
        SC = (side * .152, 0, 0)
        k.lames('arm' + s, 'laced', SC, 5, .1, .012, 1.39, .05, 90 * side - 54, 90 * side + 54, seg=14, grow=.005, belly=.008)
        k.shell('arm' + s, 'gold', SC, [(.096, 1.418), (.104, 1.408), (.096, 1.396)], 90 * side - 54, 90 * side + 54, 14, thick=.005)
        k.shell('arm' + s, 'gold', SC, [(.134, 1.144), (.137, 1.138), (.134, 1.132)], 90 * side - 54, 90 * side + 54, 14, thick=.004)
        # kote: mail sleeve with splints, an elbow cop, a gilt wrist band
        k.tube('forearm' + s, 'lacedDark', [(ax, 1.07, 0), (ax, .93, 0), (ax, .8, 0)], [.054, .051, .041], sides=14)
        k.solid('forearm' + s, 'lacquer', 'ball', (ax, 1.05, -.03), (.1, .1, .086))
        k.solid('forearm' + s, 'gold', 'ball', (ax, 1.05, -.071), (.022, .022, .012))
        for a in (-48, 0, 48):
            ra = math.radians(90 * side + a)
            sx, sz = math.sin(ra), math.cos(ra)
            k.tube('forearm' + s, 'lacquer', [(ax + sx * .054, 1.0, sz * .054), (ax + sx * .052, .92, sz * .052), (ax + sx * .044, .83, sz * .044)], [.009, .01, .007], sides=6, flat=.5)
            k.tube('forearm' + s, 'gold', [(ax + sx * .06, .99, sz * .06), (ax + sx * .049, .84, sz * .049)], [.0028, .0028], sides=4)
        k.shell('forearm' + s, 'gold', (ax, .812, 0), [(.043, .013), (.047, 0), (.043, -.013)], seg=14, thick=.004)
        k.solid('hand' + s, 'leather', 'ball', (ax, .746, .006), (.064, .088, .078))
        k.solid('hand' + s, 'lacquer', 'box', (ax + side * .031, .758, .002), (.012, .072, .062), bevel=.005)
        k.solid('hand' + s, 'gold', 'box', (ax + side * .034, .79, .002), (.014, .008, .064), bevel=.002)
        for i in range(4):
            fz = -.024 + i * .017
            k.tube('hand' + s, 'leather', [(ax + side * .012, .722, fz), (ax - side * .014, .706, fz + .004), (ax - side * .026, .722, fz + .006)], [.0095, .009, .008], sides=6)
        k.tube('hand' + s, 'leather', [(ax - side * .006, .762, .034), (ax - side * .022, .742, .046), (ax - side * .03, .722, .04)], [.011, .01, .008], sides=6)

        # ------------------------------------------------------------ legs: hakama, haidate, suneate, foot
        lx = side * .1
        k.tube('thigh' + s, 'cloth', [(lx, .935, 0), (lx + side * .006, .76, .006), (lx + side * .006, .57, 0), (lx, .455, 0)], [.098, .112, .116, .084], sides=16)
        # pleats of the hakama: folds down the front and back
        for a in (-70, -35, 0, 35, 70, 110, 180, 250):
            ra = math.radians(a)
            k.tube('thigh' + s, 'cloth', [(lx + math.sin(ra) * r, y, math.cos(ra) * r) for r, y in [(.098, .91), (.114, .76), (.118, .58), (.088, .47)]], [.007, .009, .009, .005], sides=5)
        k.lames('thigh' + s, 'lacedDark', (lx + side * .004, 0, 0), 4, .124, .004, .885, .064, -62, 62, seg=12, grow=.002, belly=.006)
        k.shell('thigh' + s, 'gold', (lx + side * .004, 0, 0), [(.134, .636), (.137, .63), (.134, .624)], -62, 62, 12, thick=.004)
        k.tube('shin' + s, 'cloth', [(lx, .49, 0), (lx, .28, -.004), (lx, .07, 0)], [.07, .066, .045], sides=14)
        k.shell('shin' + s, 'lacquer', (lx, 0, 0), [(.079, .5), (.079, .43), (.073, .3), (.062, .16), (.056, .09)], -115, 115, 18, thick=.008)
        for a in (-70, -35, 0, 35, 70):
            ra = math.radians(a)
            k.tube('shin' + s, 'gold', [(lx + math.sin(ra) * r, y, math.cos(ra) * r) for r, y in [(.082, .49), (.081, .43), (.075, .3), (.064, .16), (.058, .095)]], [.0032] * 5, sides=5)
        # tateage: the standing knee plate, and the ties
        k.shell('shin' + s, 'lacquer', (lx, 0, 0), [(.07, .575), (.084, .545), (.086, .5)], -75, 75, 12, thick=.008)
        k.solid('shin' + s, 'lacquer', 'ball', (lx, .478, .052), (.094, .1, .07))
        k.solid('shin' + s, 'gold', 'ball', (lx, .478, .086), (.024, .024, .012))
        for y in (.44, .115):
            k.shell('shin' + s, 'sash', (lx, y, 0), [(.08 if y > .3 else .06, .009), (.084 if y > .3 else .064, 0), (.08 if y > .3 else .06, -.009)], seg=14, thick=.004)
        k.solid('foot' + s, 'cloth', 'ball', (lx, .05, -.018), (.082, .09, .1))
        k.solid('foot' + s, 'cloth', 'ball', (lx, .036, .05), (.088, .068, .23))
        k.solid('foot' + s, 'straw', 'box', (lx, .008, .05), (.096, .016, .256), bevel=.006)
        for z in (.04, .1):
            k.tube('foot' + s, 'straw', [(lx - .047, .016, z - .02), (lx, .074 - (z - .04) * .2, z), (lx + .047, .016, z - .02)], [.006] * 3, sides=5)
        k.tube('foot' + s, 'straw', [(lx, .072, .045), (lx, .05, .12), (lx, .018, .165)], [.006, .006, .005], sides=5)

    # ---------------------------------------------------------------- katana (in the grip's space, along +z)
    TZ = rot(PI / 2, 0, 0)  # lathes are built upright: lay them along z
    k.tube('weapon', 'leather', [(0, 0, -.2), (0, 0, -.07), (0, 0, .054)], [.017, .0165, .017], sides=10, flat=.74, smooth=False)
    # tsuka-ito: the braid's crossings as raised diamonds down both faces
    for i in range(9):
        z = -.185 + i * .027
        for sx in (1, -1):
            k.solid('weapon', 'sash', 'box', (sx * .0125, 0, z), (.004, .016, .016), (math.pi / 4 if sx > 0 else -math.pi / 4, 0, 0), bevel=.0015)
    k.solid('weapon', 'gold', 'ball', (0, 0, -.206), (.03, .04, .022))
    k.shell('weapon', 'gold', (0, 0, 0), [(.0175, .008), (.0195, 0), (.0175, -.008)], seg=12, sx=.78, thick=.004, M=Matrix.Translation(Vector((0, 0, .052))) @ TZ)
    # tsuba: a round guard with a raised rim
    k.shell('weapon', 'lacquer', (0, 0, 0), [(.0005, .004), (.04, .004), (.047, .0055), (.049, 0), (.047, -.0055), (.04, -.004), (.0005, -.004)], seg=20, thick=0, M=Matrix.Translation(Vector((0, 0, .066))) @ TZ)
    k.shell('weapon', 'gold', (0, 0, 0), [(.046, .006), (.0505, 0), (.046, -.006)], seg=20, thick=.003, M=Matrix.Translation(Vector((0, 0, .066))) @ TZ)
    k.solid('weapon', 'gold', 'box', (0, .001, .084), (.011, .034, .026), bevel=.002)
    # blade: shinogi-zukuri section, edge down (-y), curving up toward the point
    N = 20
    secs = []
    for i in range(N + 1):
        u = i / N
        z = .072 + u * .718
        lift = .05 * u * u
        h = .031 * (1 - .14 * u)
        tip = max(0.0, (u - .9) / .1)
        w = 1 - tip * .96
        # the point rises to the back of the blade
        ye = -h / 2 + tip * h * .86
        pts = [(0, lift + ye), (.0036 * w, lift + h * .1 + tip * h * .3), (.0027 * w, lift + h / 2), (0, lift + h / 2 + .0012 * w), (-.0027 * w, lift + h / 2), (-.0036 * w, lift + h * .1 + tip * h * .3)]
        secs.append([k.vert('weapon', (x, y, z)) for x, y in pts])
    for a, b in zip(secs, secs[1:]):
        for j in range(6):
            j2 = (j + 1) % 6
            k.face('weapon', (a[j], b[j], b[j2], a[j2]), 'edge' if j in (0, 5) else 'steel')
    k.face('weapon', tuple(secs[0]), 'steel')
    k.face('weapon', tuple(reversed(secs[-1])), 'steel')
    return k


for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
for block in (bpy.data.meshes, bpy.data.materials, bpy.data.collections):
    for item in list(block):
        block.remove(item)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'

coll, objs, tris = build().finish()
os.makedirs(OUT, exist_ok=True)
bpy.context.view_layer.update()
for _, o in objs:
    o.select_set(True)
bpy.context.view_layer.objects.active = objs[0][1]
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'web_samurai.glb'), export_format='GLB', use_selection=True, export_yup=True,
                          export_apply=False, export_animations=False, export_skins=False, export_morph=False,
                          export_cameras=False, export_lights=False, export_materials='EXPORT')

# the editable source shows the figure assembled at rest (the export above has every part at its joint's origin)
for bone, o in objs:
    o.location = B(J[bone]) if bone != 'weapon' else B((-.42, .9, .1))
    if bone == 'weapon':
        o.rotation_euler = (math.radians(-80), 0, 0)
if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    world = bpy.data.worlds.new('atelier')
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.bl_idname == 'ShaderNodeBackground')
    bg.inputs[0].default_value = (.22, .25, .32, 1)
    bg.inputs[1].default_value = 1.0
    scene.world = world
    for name, loc, energy, color in (('key', (2.5, -3, 3.2), 900, (1, .93, .82)), ('rim', (-2.5, 2.5, 2.6), 700, (.55, .7, 1))):
        light = bpy.data.lights.new(name, 'AREA')
        light.energy, light.color, light.size = energy, color, 2.5
        lo = bpy.data.objects.new(name, light)
        scene.collection.objects.link(lo)
        lo.location = loc
        lo.rotation_euler = (Vector((0, 0, 1.0)) - lo.location).to_track_quat('-Z', 'Y').to_euler()
    cam = bpy.data.cameras.new('view')
    cam.type = 'ORTHO'
    cam.ortho_scale = 2.15
    co = bpy.data.objects.new('view', cam)
    scene.collection.objects.link(co)
    scene.camera = co
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.cycles.device = 'CPU'
    scene.render.resolution_x, scene.render.resolution_y = 900, 1100
    scene.view_settings.view_transform = 'Standard'
    for name, loc in (('front', (1.6, -4, 1.5)), ('back', (-1.8, 4, 1.6))):
        co.location = loc
        co.rotation_euler = (Vector((0, 0, .95)) - co.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.join(PREVIEW, 'web_samurai_' + name + '.png')
        bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(REPO, 'scripts/blender/web_hero.blend'))
print('WEB_HERO', {'parts': len(objs), 'triangles': tris})
