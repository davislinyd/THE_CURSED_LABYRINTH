"""The weathered props: sotoba, jizo, fallen torii, broken fence, katana / spear / arrows
stuck in the ground, tattered banner, rotten mine timbers. Each is exported to scripts/blender/export/<id>.glb
(metres, origin at the base, weathering in vertex colours); `npm run assets` optimises them.

Run in Blender (5.x) with the checkout's path in REPO:
    REPO = '/path/to/THE_CURSED_LABYRINTH'; exec(open(REPO + '/scripts/blender/props.py').read())
"""
exec(open(REPO + '/scripts/blender/lib.py').read())


def rot(bm, verts, ax, deg, cent=(0, 0, 0)):
    bmesh.ops.rotate(bm, cent=cent, matrix=Matrix.Rotation(math.radians(deg), 3, ax), verts=list(verts))


def dark(c, k):
    return tuple(x * k for x in c)


def n01(co, f, seed=0):
    return noise.noise(co * f + Vector((seed * 5.3, seed * 2.1, seed * 7.7))) * 0.5 + 0.5


# ------------------------------------------------------------------ sotoba
def sotoba():
    random.seed(4)
    coll = clear('sotoba')
    bm = bmesh.new()
    # plank segments from the ground up: (width, height)
    segs = [(0.095, 0.95), (0.075, 0.05), (0.095, 0.10), (0.072, 0.05), (0.095, 0.10), (0.068, 0.05), (0.09, 0.10), (0.05, 0.04)]
    z = -0.12
    parts = []
    for w, h in segs:
        v = box(bm, (w, 0.018, h), loc=(0, 0, z + h / 2), cuts=2 if h > 0.5 else 0)
        parts += v
        z += h
    # pointed tip
    tip = box(bm, (0.05, 0.018, 0.07), loc=(0, 0, z + 0.035))
    for v in tip:
        if v.co.z > z + 0.05:
            v.co.x *= 0.05
    # lean + sway
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(7), 3, 'X'), verts=bm.verts)
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(4), 3, 'Y'), verts=bm.verts)
    jitter(bm, 0.008, 6.0, 1)
    plank = make('sotoba_plank', bm, coll, weather(C['wood_pale'], up_moss=0.0, grime=0.8, grain=0.5, seed=2))
    # mound of earth and stones
    bm = bmesh.new()
    sphere(bm, 0.2, loc=(0, 0.02, -0.03), scale=(1.2, 1.0, 0.35), seg=9, rings=5)
    for i in range(4):
        a = random.uniform(0, math.tau)
        sphere(bm, random.uniform(0.04, 0.07), loc=(math.cos(a) * 0.2, math.sin(a) * 0.17, 0.0), scale=(1, 1, 0.65), seg=6, rings=4)
    jitter(bm, 0.015, 5.0, 3)
    dirt = DIRT
    mound = make('sotoba_mound', bm, coll, weather(dirt, up_moss=0.7, grime=0.1, seed=5, moss_col=C['moss_dry']))
    return export('sotoba', [plank, mound]), [plank, mound]


# ------------------------------------------------------------------ jizo
def jizo():
    random.seed(11)
    coll = clear('jizo')
    bm = bmesh.new()
    box(bm, (0.56, 0.44, 0.14), loc=(0, 0, 0.07), cuts=1)
    box(bm, (0.38, 0.30, 0.08), loc=(0, 0, 0.18), cuts=1)
    cyl(bm, 0.17, 0.105, 0.46, loc=(0, 0, 0.45), seg=8)
    sphere(bm, 0.105, loc=(0, 0, 0.765), scale=(1, 1, 1.06), seg=9, rings=6)
    box(bm, (0.11, 0.07, 0.07), loc=(0, -0.1, 0.40))
    jitter(bm, 0.012, 5.0, 2)
    stone = make('jizo_stone', bm, coll, weather(C['stone'], up_moss=1.3, grime=0.5, grain=0.3, seed=6))
    bm = bmesh.new()
    cyl(bm, 0.128, 0.112, 0.07, loc=(0, 0, 0.655), seg=8)
    box(bm, (0.15, 0.012, 0.17), loc=(0, -0.132, 0.585), rot=(0.12, 0, 0))
    jitter(bm, 0.006, 8.0, 4)
    bib = make('jizo_bib', bm, coll, lambda co, n, i: lerp(C['cloth_red'], C['cloth'], n01(co, 9) * 0.55 + (1 - min(1.0, co.z * 1.4)) * 0.0))
    return export('jizo', [stone, bib]), [stone, bib]


# ------------------------------------------------------------------ fallen torii
def torii():
    random.seed(21)
    coll = clear('torii')
    bm = bmesh.new()
    # the pillar still standing, snapped and leaning; the lintel slid off it onto the ground
    p1 = cyl(bm, 0.21, 0.18, 2.4, loc=(-1.5, 0, 1.2), seg=8)
    for v in p1:
        if v.co.z > 2.3:
            v.co.z += random.uniform(-0.2, 0.12)
    rot(bm, p1, 'Y', -5, cent=(-1.5, 0, 0))
    # the other pillar lies on the ground
    cyl(bm, 0.21, 0.18, 3.1, loc=(1.1, 1.0, 0.2), rot=(0, math.pi / 2, -0.3), seg=8)
    # kasagi (lintel) and shimaki: one end still on the standing pillar, the other on the ground
    a = math.radians(30)
    box(bm, (4.3, 0.36, 0.30), loc=(0.3, -0.15, 1.3), rot=(0, a, 0), cuts=2)
    box(bm, (4.1, 0.30, 0.12), loc=(0.4, -0.15, 1.47), rot=(0, a, 0), cuts=2)
    # nuki (tie beam): a stub on the pillar and the broken length on the ground
    box(bm, (0.9, 0.17, 0.2), loc=(-0.95, 0, 1.75), cuts=1)
    box(bm, (2.2, 0.17, 0.2), loc=(0.7, -1.2, 0.12), rot=(0.05, 0, -0.35), cuts=2)
    jitter(bm, 0.02, 2.0, 1)

    def paint(co, n, _i):
        k = n01(co, 1.3, 2)
        c = lerp(C['vermilion'], C['wood'], max(0.0, (k - 0.45) * 2.4))
        c = lerp(c, dark(c, 0.55), n01(co, 6, 3) * 0.5)
        if co.z < 0.3 and abs(co.x + 1.5) < 0.5 and abs(co.y) < 0.5:
            c = C['wood_dark']
        c = lerp(c, C['moss'], min(1.0, max(0.0, n.z) * max(0.0, 1 - co.z / 0.7) * n01(co, 2.3, 4) * 1.6))
        return c

    o = make('torii', bm, coll, paint)
    return export('torii_fallen', [o]), [o]


# ------------------------------------------------------------------ broken fence
def fence():
    random.seed(31)
    coll = clear('fence')
    bm = bmesh.new()
    xs = [-1.4, -0.5, 0.4, 1.3]
    hs = [0.98, 0.92, 0.38, 0.95]
    for i, (x, h) in enumerate(zip(xs, hs)):
        v = box(bm, (0.1, 0.09, h + 0.12), loc=(x, 0, h / 2 - 0.06), cuts=1)
        if i == 2:
            for q in v:
                if q.co.z > h - 0.1:
                    q.co.x += random.uniform(-0.03, 0.03)
        if i == 3:
            rot(bm, v, 'Y', 11, cent=(x, 0, 0))
    box(bm, (0.9, 0.05, 0.07), loc=(-0.95, 0.07, 0.78))
    box(bm, (0.9, 0.05, 0.07), loc=(-0.95, 0.07, 0.46))
    r = box(bm, (0.9, 0.05, 0.07), loc=(-0.05, 0.07, 0.72))
    rot(bm, r, 'Y', 28, cent=(-0.5, 0.07, 0.72))
    box(bm, (0.75, 0.05, 0.07), loc=(0.15, 0.4, 0.04), rot=(0, 0, 0.5))
    box(bm, (0.09, 0.08, 0.5), loc=(0.45, 0.35, 0.05), rot=(0, 1.35, 0.3))
    jitter(bm, 0.008, 5.0, 3)
    o = make('fence', bm, coll, weather(C['wood'], up_moss=0.5, grime=0.8, grain=0.6, seed=7))
    return export('fence_broken', [o]), [o]


# ------------------------------------------------------------------ katana, spear, arrows
def katana():
    random.seed(41)
    coll = clear('katana')
    bm = bmesh.new()
    box(bm, (0.032, 0.007, 0.6), loc=(0, 0, 0.15))
    box(bm, (0.036, 0.02, 0.03), loc=(0, 0, 0.465))
    cyl(bm, 0.042, 0.042, 0.007, loc=(0, 0, 0.485), seg=8)
    box(bm, (0.032, 0.026, 0.2), loc=(0, 0, 0.59))
    box(bm, (0.036, 0.03, 0.02), loc=(0, 0, 0.7))
    rot(bm, bm.verts, 'X', 12)
    rot(bm, bm.verts, 'Y', 6)
    jitter(bm, 0.002, 8.0, 2)

    def paint(co, n, _i):
        if co.z < 0.45:
            r = n01(co, 7, 1) * 0.6 + max(0.0, 1 - co.z / 0.35) * 0.35
            return lerp(C['steel'], C['rust'], min(1.0, r))
        if co.z < 0.50:
            return C['iron']
        if co.z < 0.69:
            return C['indigo'] if int((co.z - 0.5) / 0.022) % 2 == 0 else dark(C['cloth'], 0.6)
        return C['iron']

    o = make('katana', bm, coll, paint)
    bm = bmesh.new()
    sphere(bm, 0.09, loc=(0, 0, -0.02), scale=(1.2, 1, 0.35), seg=7, rings=4)
    jitter(bm, 0.01, 6.0, 1)
    m = make('katana_mound', bm, coll, weather(DIRT, up_moss=0.5, grime=0.0, seed=2, moss_col=C['moss_dry']))
    return export('katana_stuck', [o, m]), [o, m]


def spear():
    random.seed(51)
    coll = clear('spear')
    bm = bmesh.new()
    cyl(bm, 0.017, 0.015, 1.7, loc=(0, 0, 0.7), seg=6)
    cyl(bm, 0.024, 0.02, 0.07, loc=(0, 0, 1.58), seg=6)
    head = box(bm, (0.04, 0.009, 0.26), loc=(0, 0, 1.76))
    for v in head:
        if v.co.z > 1.8:
            v.co.x *= 0.12
    box(bm, (0.035, 0.012, 0.17), loc=(0.03, 0, 1.45), rot=(0, 0.2, 0))
    rot(bm, bm.verts, 'Y', 14)
    rot(bm, bm.verts, 'X', -5)
    jitter(bm, 0.003, 6.0, 3)

    def paint(co, n, _i):
        if co.z > 1.55 and co.z < 1.6:
            return C['iron']
        if co.z > 1.6:
            return lerp(C['steel'], C['rust'], n01(co, 8, 2) * 0.7)
        if co.z > 1.35 and abs(co.x) > 0.02:
            return C['cloth_red']
        return lerp(C['wood'], C['wood_dark'], n01(co, 5, 1) * 0.6 + max(0.0, 1 - co.z / 0.5) * 0.3)

    o = make('spear', bm, coll, paint)
    return export('spear_stuck', [o]), [o]


def arrows():
    random.seed(61)
    coll = clear('arrows')
    bm = bmesh.new()
    spots = [(0.0, 0.0, 22, 0, 0.3), (0.16, 0.08, -28, 12, 1.0), (-0.14, 0.1, 15, -20, 2.0), (0.06, -0.15, -10, 30, 0.6), (-0.1, -0.12, 33, 8, 1.7)]
    for x, y, ax, ay, rz in spots:
        sh = cyl(bm, 0.0045, 0.0045, 0.78, loc=(0, 0, 0.27), seg=4)
        vs = list(sh)
        for a in (0.0, math.pi / 2):
            vs += box(bm, (0.034, 0.0025, 0.1), loc=(0, 0, 0.58), rot=(0, 0, a))
        rot(bm, vs, 'X', ax)
        rot(bm, vs, 'Y', ay)
        rot(bm, vs, 'Z', math.degrees(rz))
        bmesh.ops.translate(bm, vec=(x, y, 0), verts=vs)

    def paint(co, n, _i):
        r = math.hypot(co.x, co.y)
        t = co.z
        if t > 0.5 and (n.z < 0.5):
            return C['feather'] if n01(co, 30) > 0.35 else C['wood_dark']
        return lerp(C['wood_pale'], C['wood_dark'], n01(co, 12, 1) * 0.5 + max(0.0, 1 - t / 0.3) * 0.3)

    o = make('arrows', bm, coll, paint)
    return export('arrows_stuck', [o]), [o]


# ------------------------------------------------------------------ banner
def banner():
    random.seed(71)
    coll = clear('banner')
    bm = bmesh.new()
    pole = cyl(bm, 0.026, 0.02, 2.6, loc=(0, 0, 1.2), seg=6)
    for v in pole:
        if v.co.z > 2.45:
            v.co.z += random.uniform(-0.04, 0.05)
    cross = box(bm, (0.62, 0.025, 0.03), loc=(0.27, 0, 2.38))
    vs = pole + cross
    rot(bm, vs, 'Y', 6)
    rot(bm, vs, 'X', -4)
    jitter(bm, 0.005, 5.0, 2)
    pol = make('pole', bm, coll, weather(C['wood'], grime=0.6, grain=0.5, seed=8))
    # the cloth: a subdivided sheet hanging from the cross-bar; ragged hem, gentle folds
    W, H, Z0 = 0.5, 1.5, 2.34
    bm = bmesh.new()
    nx, nz = 4, 12
    g = bmesh.ops.create_grid(bm, x_segments=nx, y_segments=nz, size=1.0)
    xs = [v.co.x for v in g['verts']]
    ys = [v.co.y for v in g['verts']]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    for v in g['verts']:
        u = (v.co.x - x0) / (x1 - x0)
        t = (v.co.y - y0) / (y1 - y0)  # 0 bottom, 1 top
        z = Z0 - H * (1 - t)
        if t < 0.18:
            z += random.uniform(0.0, 0.28) * (1 - t / 0.18)
        v.co = Vector((0.0 + u * W, 0.035 + 0.035 * math.sin(z * 5 + u * 3), z))
    # tear a notch from the hem
    cloth_verts = list(bm.verts)
    for v in cloth_verts:
        if 0.4 < (v.co.x / W) < 0.6 and v.co.z < Z0 - H * 0.65:
            v.co.z += 0.22
    rot(bm, bm.verts, 'Y', 6)
    rot(bm, bm.verts, 'X', -4)

    def paint(co, n, _i):
        t = (co.z - (Z0 - H)) / H
        c = lerp(C['cloth_red'], C['cloth'], max(0.0, 1 - n01(co, 4, 3) * 1.4) * 0.8)
        c = lerp(dark(C['cloth_red'], 0.4), c, min(1.0, t * 1.8))
        return c

    cl = make('cloth', bm, coll, paint, smooth=True)
    return export('banner_torn', [pol, cl]), [pol, cl]


# ------------------------------------------------------------------ rotten mine timbers
def timber():
    random.seed(81)
    coll = clear('timber')
    bm = bmesh.new()
    box(bm, (0.26, 0.24, 3.1), loc=(-0.95, 0, 1.55), cuts=2)
    p2 = box(bm, (0.26, 0.24, 2.9), loc=(0.95, 0, 1.45), cuts=2)
    rot(bm, p2, 'Y', -4, cent=(0.95, 0, 0))
    box(bm, (1.2, 0.22, 0.24), loc=(-0.45, 0, 3.0), rot=(0, 0.08, 0), cuts=1)
    box(bm, (1.0, 0.22, 0.24), loc=(0.78, 0, 2.55), rot=(0, 0.5, 0), cuts=1)
    box(bm, (0.9, 0.12, 0.06), loc=(0.2, -0.35, 0.07), rot=(0, 0, 0.5))
    box(bm, (0.7, 0.12, 0.06), loc=(-0.4, -0.5, 0.05), rot=(0, 0, -0.35))
    jitter(bm, 0.02, 3.0, 5)
    o = make('timber', bm, coll, weather(dark(C['wood'], 0.6), up_moss=1.2, grime=1.0, grain=0.9, seed=9))
    return export('timber_support', [o]), [o]


res = {}
placed = []
for fn in (sotoba, jizo, torii, fence, katana, spear, arrows, banner, timber):
    r, objs = fn()
    res[fn.__name__] = r['tris']
    placed.append((fn.__name__, objs))
# lay the props out in a row for the preview
x = -12.0
for name, objs in placed:
    for o in objs:
        o.location.x += x
    x += 5.0
result = res
