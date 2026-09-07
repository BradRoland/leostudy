"""Original procedural Blender collectibles, with modeled role-specific equipment.
No generated images, image textures, external models or third-party character assets.
Run: blender -b --python scripts/art/render_academy_avatars.py -- /absolute/output [variant ...]
Variants: patrol k9 motor detective aviation commander guardian
"""
import bpy
import math
import sys
from pathlib import Path
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
out = Path(args[0])
out.mkdir(parents=True, exist_ok=True)
variants = args[1:] or ['patrol', 'k9', 'motor', 'detective', 'aviation', 'commander', 'guardian']


def material(name, color, metal=0, rough=.32, emission=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    if emission:
        p.inputs['Emission Color'].default_value = (*color, 1)
        p.inputs['Emission Strength'].default_value = emission
    return m


def finish(obj, name, mat):
    obj.name = name
    obj.data.materials.append(mat)
    if obj.type == 'MESH':
        for face in obj.data.polygons:
            face.use_smooth = True
    return obj


def ball(name, loc, scale, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, location=loc)
    obj = bpy.context.object
    obj.scale = scale
    return finish(obj, name, mat)


def box(name, loc, scale, mat, bevel=.05):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    mod = obj.modifiers.new('Machined edge radius', 'BEVEL')
    mod.width = bevel
    mod.segments = 4
    obj.modifiers.new('Weighted corner normals', 'WEIGHTED_NORMAL')
    return finish(obj, name, mat)


def cylinder(name, loc, radius, depth, mat, rotation=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=radius, depth=depth, location=loc)
    obj = bpy.context.object
    if rotation:
        obj.rotation_euler = rotation
    mod = obj.modifiers.new('Rounded rim', 'BEVEL')
    mod.width = min(.035, depth / 4)
    mod.segments = 3
    obj.modifiers.new('Weighted corner normals', 'WEIGHTED_NORMAL')
    return finish(obj, name, mat)


def torus(name, loc, radius, thickness, mat, rotation=(math.pi / 2, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_segments=64, minor_segments=12, location=loc,
                                   major_radius=radius, minor_radius=thickness, rotation=rotation)
    return finish(bpy.context.object, name, mat)


def mesh(name, verts, faces, mat, bevel=.025):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    finish(obj, name, mat)
    if bevel:
        mod = obj.modifiers.new('Sculpted edge highlights', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
        obj.modifiers.new('Weighted corner normals', 'WEIGHTED_NORMAL')
    return obj


def line(name, points, mat, radius=.025):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = radius
    curve.bevel_resolution = 4
    curve.use_fill_caps = True
    spline = curve.splines.new('BEZIER')
    spline.bezier_points.add(len(points) - 1)
    for point, value in zip(spline.bezier_points, points):
        point.co = value
        point.handle_left_type = 'AUTO'
        point.handle_right_type = 'AUTO'
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def text_label(name, value, loc, size, mat):
    curve = bpy.data.curves.new(name, 'FONT')
    curve.body = value
    curve.align_x = 'CENTER'
    curve.align_y = 'CENTER'
    curve.size = size
    curve.extrude = .0015
    curve.bevel_depth = .0005
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    obj.rotation_euler = (math.pi / 2, 0, 0)
    obj.data.materials.append(mat)
    return obj


def shield(name, x, y, z, size, mat):
    pts = [(-.5, .44), (0, .59), (.5, .44), (.44, -.2), (0, -.62), (-.44, -.2)]
    verts = [(x + a * size, y + b, z + c * size) for b in [-.025, .025] for a, c in pts]
    return mesh(name, verts, [tuple(range(5, -1, -1)), tuple(range(6, 12))] +
                [(i, (i + 1) % 6, (i + 1) % 6 + 6, i + 6) for i in range(6)], mat, .014)


def star(name, x, y, z, size, mat):
    pts = [(math.sin(i * math.pi / 5) * size * (1 if i % 2 == 0 else .45),
            math.cos(i * math.pi / 5) * size * (1 if i % 2 == 0 else .45)) for i in range(10)]
    return mesh(name, [(x, y - .012, z)] + [(x + a, y, z + b) for a, b in pts],
                [(0, i + 1, (i + 1) % 10 + 1) for i in range(10)], mat, .003)


def badge(name, x, y, z, size, accent=None):
    accent = accent or silver
    shield(name + ' polished shield', x, y, z, size, accent)
    shield(name + ' blue enamel', x, y - .03, z + .015 * size, size * .74, blue)
    star(name + ' service star', x, y - .065, z + .035 * size, size * .22, accent)
    if size > .22:
        text_label(name + ' engraved number', '180', (x, y - .065, z - .25 * size), size * .14, white)


def screw(name, x, y, z, accent=None):
    cylinder(name, (x, y, z), .022, .012, accent or silver, (math.pi / 2, 0, 0))
    box(name + ' slot', (x, y - .009, z), (.023, .004, .004), black, .001)


def stage(variant):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    global navy, blue, black, silver, gold, white, tan, coat, olive, orange, cyan, red, paper
    navy = material('Midnight uniform ceramic', (.022, .055, .115), .32, .29)
    blue = material('Police cobalt enamel', (.045, .22, .62), .48, .25)
    black = material('Obsidian visor and rubber', (.007, .016, .028), .42, .23)
    silver = material('Brushed platinum', (.59, .73, .83), .82, .24)
    gold = material('Champagne brass', (.75, .46, .145), .8, .25)
    white = material('Porcelain white', (.85, .9, .94), .25, .3)
    tan = material('Shepherd sable', (.43, .205, .07), .08, .5)
    coat = material('Detective camel wool', (.49, .34, .19), .05, .58)
    olive = material('Flight suit olive', (.105, .17, .105), .12, .48)
    orange = material('Rescue amber', (.92, .34, .04), .25, .31)
    cyan = material('Cool optical displays', (.12, .7, 1), .25, .2, .8)
    red = material('Emergency red', (.67, .035, .025), .25, .28)
    paper = material('Notebook ivory', (.77, .74, .63), .0, .65)
    floor = material('Studio slate', (.018, .032, .057), .05, .5)
    cylinder('Chamfered display plinth', (0, 0, .10), 1.26, .20, navy)
    cylinder('Brushed metal base rim', (0, 0, .204), 1.23, .028, gold if variant in ['commander', 'guardian'] else silver)
    cylinder('Inlaid display surface', (0, 0, .225), 1.19, .025, black)
    box('Display identification plaque', (0, -1.278, .105), (.81, .04, .105), navy, .016)
    label = {'patrol': 'POLICE CADET', 'k9': 'POLICE K9', 'motor': 'HIGHWAY PATROL', 'detective': 'DETECTIVE',
             'aviation': 'HELICOPTER PILOT', 'commander': 'WATCH COMMANDER', 'guardian': 'HONOR GUARD'}[variant]
    text_label('Engraved role identification', label, (0, -1.301, .106), .062, silver)
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.015))
    finish(bpy.context.object, 'Studio backdrop', floor)
    scene = bpy.context.scene
    scene.world = bpy.data.worlds.new('Studio environment')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.12, .17, .26, 1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = .45
    for name, loc, energy, color, size in [
        ('Large soft key', (-3, -4, 6), 750, (.84, .93, 1), 4),
        ('Warm detail fill', (4, -3, 3), 480, (1, .86, .7), 3),
        ('Cobalt rim', (2, 3, 5), 900, (.28, .5, 1), 3),
        ('Front eye light', (-.2, -5, 2), 55, (.7, .84, 1), 2),
    ]:
        data = bpy.data.lights.new(name, 'AREA')
        data.energy, data.color, data.shape, data.size = energy, color, 'DISK', size
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = loc
        obj.rotation_euler = (Vector((0, 0, 1.6)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    data = bpy.data.cameras.new('Collectible portrait camera')
    obj = bpy.data.objects.new('Collectible portrait camera', data)
    scene.collection.objects.link(obj)
    obj.location = (2.45, -8.5, 3.65)
    obj.rotation_euler = (Vector((0, -.05, 1.7)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    data.type, data.ortho_scale = 'ORTHO', 4.02
    scene.camera = obj
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 64
    scene.cycles.use_denoising = True
    scene.render.resolution_x = scene.render.resolution_y = 768
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = 'AgX'
    scene.render.filepath = str(out / f'{variant}.png')


def radio(x, y, z, size=1):
    box('Shoulder radio housing', (x, y, z), (.20 * size, .14, .32 * size), black, .025)
    line('Flexible radio antenna', [(x + .035, y, z + .16 * size), (x + .035, y, z + .43 * size)], black, .014)
    for i in range(4):
        box('Radio speaker slot', (x, y - .075, z + (.018 + i * .04) * size), (.12 * size, .012, .012), silver, .003)
    box('Radio status screen', (x, y - .08, z - .07), (.12 * size, .009, .06), blue, .007)
    ball('Radio green status LED', (x + .055, y - .086, z - .11), (.014, .008, .014), cyan)


def boots():
    for side in [-1, 1]:
        x = side * .26
        ball('Polished duty boot', (x, -.10, .40), (.255, .36, .18), black)
        box('Layered boot sole', (x, -.11, .32), (.43, .57, .055), navy, .07)
        for i in range(3):
            line('Boot lace', [(x - .095, -.32, .46 + i * .026), (x + .095, -.32, .46 + i * .026)], silver, .009)


def uniform(variant):
    accent = gold if variant == 'commander' else silver
    fabric = olive if variant == 'aviation' else coat if variant == 'detective' else navy
    ball('Tailored uniform torso', (0, 0, 1.04), (.64, .36, .66), fabric)
    for side in [-1, 1]:
        ball('Tailored sleeve', (side * .59, .015, 1.12), (.225, .265, .42), fabric)
        ball('Articulated glove', (side * .67, -.08, .79), (.19, .22, .17), black)
        for i in range(3):
            line('Glove stitched knuckle', [(side * .67 - .10 + i * .06, -.265, .76),
                                           (side * .67 - .10 + i * .06, -.27, .83)], navy, .007)
        box('Epaulette', (side * .50, -.07, 1.5), (.25, .29, .065), fabric, .023)
        ball('Epaulette button', (side * .40, -.18, 1.53), (.026, .028, .013), accent)
    boots()
    if variant == 'detective':
        # A visible shirt, tie, broad camel lapels and double-breasted buttons.
        box('Ivory shirt inset', (0, -.333, 1.27), (.35, .08, .56), paper, .04)
        mesh('Dark detective tie', [(-.055, -.398, 1.47), (.055, -.398, 1.47), (.073, -.398, 1.04),
                                    (0, -.412, .96), (-.073, -.398, 1.04)], [(0, 1, 2, 3, 4)], navy, .015)
        for side in [-1, 1]:
            mesh('Trench coat notched lapel', [(side * .06, -.435, 1.47), (side * .27, -.42, 1.63),
                 (side * .48, -.39, 1.42), (side * .33, -.455, 1.35), (side * .42, -.43, 1.27),
                 (side * .10, -.47, .94)], [(0, 1, 2, 3, 4, 5)], coat, .03)
            for z in [.93, 1.11]:
                cylinder('Trench coat button', (side * .21, -.445, z), .032, .028, black, (math.pi / 2, 0, 0))
            line('Coat welt pocket', [(side * .34, -.355, .93), (side * .48, -.30, 1.1)], tan, .018)
            box('Trench cuff strap', (side * .66, -.14, .9), (.31, .30, .075), tan, .025)
        badge('Detective belt badge', -.22, -.40, .80, .28, gold)
        box('Trench coat belt', (0, -.33, .72), (.99, .12, .10), tan, .025)
        box('Coat belt buckle', (.08, -.412, .72), (.17, .035, .13), gold, .01)
        return
    box('Uniform breast panel', (0, -.297, 1.15), (.9, .14, .72), fabric, .10)
    line('Uniform center seam', [(0, -.376, .8), (0, -.378, 1.46)], black, .012)
    if variant == 'aviation':
        for side in [-1, 1]:
            box('Flight harness strap', (side * .37, -.39, 1.16), (.105, .055, .70), black, .02)
            box('Harness adjustment buckle', (side * .37, -.432, 1.17), (.15, .025, .12), silver, .015)
        box('Flight suit orange identification', (0, -.391, 1.16), (.31, .045, .11), orange, .013)
        text_label('Pilot name strip', 'PILOT', (0, -.42, 1.17), .07, black)
        for side in [-1, 1]:
            for i in range(4):
                box('Silver aviation wing', (side * (.06 + i * .043), -.39, 1.42 - i * .014), (.052, .02, .025), silver, .007)
        shield('Pilot wing center', 0, -.41, 1.43, .11, silver)
        line('Flight suit zipper', [(.15, -.39, .85), (.15, -.392, 1.08)], silver, .006)
    else:
        for side in [-1, 1]:
            box('Breast pocket', (side * .25, -.385, 1.21), (.27, .055, .25), navy, .022)
            box('Pocket flap', (side * .25, -.424, 1.32), (.29, .035, .065), blue if variant == 'patrol' else navy, .015)
            ball('Pocket press stud', (side * .25, -.449, 1.32), (.018, .008, .018), accent)
        badge('Uniform chest badge', -.23, -.47, 1.23, .25, accent)
        text_label('Police name tape', 'POLICE', (.22, -.427, 1.40), .072, white)
        for z in [.88, 1.0, 1.12]:
            ball('Uniform front button', (0, -.39, z), (.019, .011, .019), accent)
        if variant != 'commander':
            radio(.43, -.31, 1.43, .62)
        for side in [-1, 1]:
            shield('Sleeve service patch', side * .65, -.231, 1.25, .22, blue)
            star('Sleeve patch star', side * .65, -.27, 1.27, .059, silver)
    box('Equipment belt', (0, -.31, .76), (1.02, .19, .145), black, .034)
    box('Belt buckle', (0, -.424, .76), (.19, .038, .12), accent, .025)
    for side in [-1, 1]:
        box('Utility belt pouch', (side * .40, -.36, .75), (.19, .17, .24), black, .026)
        box('Pouch flap', (side * .40, -.456, .81), (.17, .028, .085), navy, .017)
        screw('Pouch snap', side * .4, -.478, .8, accent)


def helmet_stripe(mat):
    # A fitted enamel ribbon follows the helmet, rather than an exposed tube.
    verts = []
    for i in range(17):
        y = -.51 + i * .055
        for x in [-.052, .052]:
            z = 2.24 + .73 * math.sqrt(1 - (y / .62) ** 2 - (x / .79) ** 2) + .009
            verts.append((x, y, z))
    obj = mesh('Fitted helmet enamel stripe', verts, [(i * 2, i * 2 + 1, i * 2 + 3, i * 2 + 2) for i in range(16)], mat, .002)
    mod = obj.modifiers.new('Enamel stripe thickness', 'SOLIDIFY')
    mod.thickness = .006


def head(variant):
    ball('Mechanical neck', (0, 0, 1.69), (.25, .23, .19), black)
    shell = white if variant == 'motor' else olive if variant == 'aviation' else navy
    ball('Sculpted helmet shell', (0, 0, 2.24), (.79, .62, .73), shell)
    ball('Wraparound smoked visor', (0, -.443, 2.20), (.716, .285, .39), black)
    for side in [-1, 1]:
        box('Optical display', (side * .24, -.716, 2.21), (.245, .023, .065), cyan, .026)
        for i in range(3):
            box('Optical display segment', (side * .24 + (i - 1) * .06, -.733, 2.207), (.008, .004, .038), white, .002)
        screw('Visor hinge fastener', side * .64, -.49, 2.22)
    line('Machined visor lip', [(-.6, -.55, 2.04), (0, -.703, 1.94), (.6, -.55, 2.04)], silver, .019)
    box('Chin ventilation panel', (0, -.57, 1.85), (.33, .04, .10), shell, .025)
    for i in range(5):
        box('Chin ventilation slot', ((i - 2) * .047, -.598, 1.85), (.019, .012, .038), black, .005)
    if variant in ['patrol', 'commander']:
        accent = gold if variant == 'commander' else silver
        ball('Peaked police cap crown', (0, .055, 2.80), (.84, .645, .30), navy)
        box('Cap leather band', (0, -.523, 2.68), (1.25, .115, .16), black, .037)
        ball('Cap polished visor', (0, -.66, 2.625), (.78, .42, .066), black)
        line('Cap ceremonial braid', [(-.58, -.617, 2.69), (0, -.649, 2.66), (.58, -.617, 2.69)], accent, .017)
        for side in [-1, 1]:
            screw('Cap braid side button', side * .58, -.603, 2.72, accent)
        badge('Cap badge', 0, -.633, 2.85, .29, accent)
        line('Cap crown topstitch', [(-.64, -.34, 2.97), (0, -.47, 3.043), (.64, -.34, 2.97)], blue, .009)
        if variant == 'commander':
            for side in [-1, 1]:
                for i in range(6):
                    leaf = ball('Gold visor oak leaf', (side * (.20 + .068 * i), -.93 + .018 * i, 2.654), (.042, .064, .012), gold)
                    leaf.rotation_euler.z = side * -.45
    elif variant == 'motor':
        helmet_stripe(blue)
        line('Helmet lower safety stripe', [(-.62, -.2, 1.91), (0, -.58, 1.79), (.62, -.2, 1.91)], blue, .026)
        badge('Motorcycle helmet badge', 0, -.565, 2.74, .25)
        for side in [-1, 1]:
            cylinder('Helmet chrome hinge', (side * .75, -.13, 2.16), .098, .042, silver, (0, math.pi / 2, 0))
    elif variant == 'detective':
        ball('Wide camel fedora brim', (0, 0, 2.73), (.98, .76, .085), coat)
        box('Creased fedora crown', (0, .055, 2.985), (1.26, .96, .50), coat, .19)
        box('Fedora dark grosgrain band', (0, -.432, 2.87), (1.16, .07, .115), navy, .027)
        box('Fedora ribbon folded bow', (-.57, -.33, 2.87), (.08, .20, .13), navy, .017)
    elif variant == 'aviation':
        helmet_stripe(orange)
        for side in [-1, 1]:
            cylinder('Flight headset ear seal', (side * .77, .03, 2.20), .285, .17, black, (0, math.pi / 2, 0))
            cylinder('Flight headset ear housing', (side * .87, .03, 2.20), .23, .06, olive, (0, math.pi / 2, 0))
            cylinder('Headset adjustment knob', (side * .92, -.04, 2.20), .075, .027, silver, (0, math.pi / 2, 0))
        line('Flight headset microphone boom', [(.86, -.05, 2.09), (.78, -.62, 1.96), (.32, -.8, 1.99)], silver, .024)
        box('Flight communications microphone', (.28, -.8, 1.99), (.23, .1, .12), black, .04)
        for i in range(3):
            box('Microphone grille', (.22 + .055 * i, -.857, 1.99), (.014, .005, .071), silver, .003)
        text_label('Flight helmet marking', 'AIR', (0, -.561, 2.73), .10, paper)


def detective_equipment():
    # A separate ring with an open center keeps the magnifier unmistakable at thumbnail size.
    line('Magnifying glass handle', [(-.71, -.33, .80), (-.83, -.51, 1.14)], tan, .063)
    torus('Magnifying glass brass rim', (-.91, -.54, 1.45), .275, .033, gold)
    torus('Magnifying glass inner rim', (-.91, -.548, 1.45), .235, .012, silver)
    line('Glass edge reflection', [(-1.035, -.552, 1.58), (-.985, -.558, 1.66), (-.905, -.56, 1.687)], cyan, .013)
    box('Leather evidence notebook', (.75, -.37, 1.035), (.46, .11, .64), navy, .033)
    box('Notebook paper edges', (.768, -.386, 1.035), (.405, .078, .59), paper, .011)
    box('Notebook cover front', (.75, -.442, 1.035), (.46, .022, .64), navy, .013)
    text_label('Notebook evidence title', 'CASE', (.75, -.46, 1.13), .094, gold)
    text_label('Notebook case number', '180', (.75, -.46, 1.015), .067, silver)
    for i in range(6):
        torus('Notebook spiral binding', (.545, -.44, .8 + i * .09), .028, .008, silver, (0, math.pi / 2, 0))
    line('Notebook pen', [(.94, -.471, .84), (.94, -.471, 1.28)], gold, .015)
    box('Evidence tab', (.8, -.44, 1.372), (.12, .05, .064), orange, .005)


def motorcycle():
    # A compact police motorcycle front assembly makes the highway role clear.
    cylinder('Motorcycle front tire', (0, -.82, .59), .29, .16, black, (0, math.pi / 2, 0))
    cylinder('Motorcycle wheel hub', (.09, -.82, .59), .18, .025, silver, (0, math.pi / 2, 0))
    for side in [-1, 1]:
        line('Motorcycle chrome front fork', [(side * .15, -.81, .57), (side * .22, -.66, 1.10)], silver, .032)
    ball('Motorcycle blue front fender', (0, -.83, .85), (.21, .34, .094), blue)
    box('Motorcycle front fairing', (0, -.59, 1.13), (.79, .24, .46), blue, .12)
    cylinder('Police motorcycle headlamp chrome', (0, -.756, 1.13), .18, .10, silver, (math.pi / 2, 0, 0))
    cylinder('Police motorcycle headlamp lens', (0, -.82, 1.13), .146, .014, white, (math.pi / 2, 0, 0))
    for side in [-1, 1]:
        cylinder('Emergency running light', (side * .29, -.756, 1.13), .072, .08, red if side == -1 else cyan, (math.pi / 2, 0, 0))
        line('Handlebar', [(side * .2, -.50, 1.30), (side * .61, -.35, 1.35)], silver, .029)
        box('Handlebar handgrip', (side * .60, -.35, 1.35), (.20, .09, .10), black, .035)
        line('Rear view mirror stalk', [(side * .50, -.35, 1.35), (side * .68, -.30, 1.65)], silver, .018)
        ball('Motorcycle rear view mirror', (side * .68, -.30, 1.69), (.15, .05, .098), silver)
    box('Motorcycle dark windshield', (0, -.48, 1.43), (.55, .045, .23), black, .10)
    text_label('Motorcycle POLICE marking', 'POLICE', (0, -.684, 1.37), .077, white)


def helicopter():
    # A held scale helicopter includes a cockpit, tail, both rotors and landing skids.
    x, y, z = .57, -.63, 1.08
    ball('Police helicopter fuselage', (x, y, z), (.30, .18, .195), blue)
    ball('Helicopter bubble cockpit', (x - .145, y - .065, z + .025), (.19, .143, .157), black)
    line('Helicopter cockpit frame', [(x - .24, y - .095, z - .07), (x - .22, y - .174, z + .09),
                                     (x - .06, y - .17, z + .15)], silver, .012)
    line('Helicopter tail boom', [(x + .19, y, z + .02), (x + .61, y, z + .105)], blue, .05)
    mesh('Helicopter tail fin', [(x + .51, y - .02, z + .10), (x + .62, y - .02, z + .10),
                                (x + .61, y - .02, z + .39), (x + .50, y - .02, z + .32)], [(0, 1, 2, 3)], white, .016)
    cylinder('Helicopter main rotor mast', (x, y, z + .265), .025, .20, silver)
    blade = box('Helicopter main rotor long blade', (x, y, z + .375), (1.10, .065, .025), black, .012)
    blade.rotation_euler.z = -.17
    blade = box('Helicopter cross rotor blade', (x, y, z + .378), (.055, .64, .02), black, .010)
    blade.rotation_euler.z = -.17
    ball('Helicopter rotor hub', (x, y, z + .39), (.046, .046, .026), silver)
    cylinder('Helicopter tail rotor hub', (x + .62, y - .055, z + .26), .026, .10, silver, (math.pi / 2, 0, 0))
    for angle in [0, math.pi / 2]:
        rotor = box('Helicopter tail rotor', (x + .62, y - .112, z + .26), (.235, .023, .025), black, .007)
        rotor.rotation_euler.y = angle
    for side in [-1, 1]:
        py = y + side * .145
        line('Helicopter landing skid', [(x - .31, py, z - .19), (x - .25, py, z - .27),
                                        (x + .30, py, z - .27)], silver, .017)
        for dx in [-.15, .15]:
            line('Helicopter skid strut', [(x + dx, y + side * .08, z - .11),
                                         (x + dx, py, z - .24)], silver, .014)
    text_label('Helicopter police livery', 'POLICE', (x + .10, y - .184, z + .02), .050, white)
    ball('Helicopter navigation light', (x + .30, y - .03, z + .09), (.024, .025, .025), red)


def commander_details():
    for side in [-1, 1]:
        box('Commander rank panel', (side * .64, -.26, 1.08), (.19, .035, .26), navy, .025)
        for i in range(3):
            line('Commander sleeve chevron', [(side * .64 - .064, -.286, 1.025 + i * .068),
                  (side * .64, -.286, .985 + i * .068), (side * .64 + .064, -.286, 1.025 + i * .068)], gold, .012)
        for i in range(2):
            box('Commander collar rank bar', (side * (.11 + .052 * i), -.349, 1.52), (.029, .016, .095), gold, .007)
    for row in range(2):
        for col, mat in enumerate([blue, red, gold]):
            box('Service ribbon', (.14 + col * .073, -.431, 1.22 - row * .065), (.064, .014, .045), mat, .006)
    line('Ceremonial shoulder cord', [(-.47, -.22, 1.52), (-.63, -.33, 1.25), (-.49, -.43, 1.03),
                                      (-.31, -.40, 1.23), (-.42, -.24, 1.51)], gold, .018)
    box('Command tablet chassis', (.77, -.34, .98), (.44, .07, .54), silver, .04)
    box('Command tablet screen', (.77, -.384, .985), (.376, .018, .454), black, .025)
    text_label('Command tablet heading', 'WATCH', (.77, -.40, 1.135), .057, cyan)
    for i in range(4):
        box('Command tablet report line', (.77, -.401, 1.035 - i * .065), (.25 - .035 * (i % 2), .005, .014), blue if i == 0 else silver, .003)


def robot(variant):
    uniform(variant)
    head(variant)
    if variant == 'detective':
        detective_equipment()
    elif variant == 'motor':
        motorcycle()
    elif variant == 'aviation':
        helicopter()
        radio(-.64, -.23, 1.18, .72)
    elif variant == 'commander':
        commander_details()


def k9():
    ball('German shepherd seated body', (0, .05, 1.01), (.54, .37, .67), tan)
    for side in [-1, 1]:
        ball('Shepherd hind leg', (side * .45, .13, .58), (.25, .28, .29), black)
        ball('Shepherd front leg', (side * .27, -.18, .62), (.16, .17, .35), tan)
        ball('Shepherd front paw', (side * .27, -.27, .38), (.23, .28, .14), tan)
        for toe in range(3):
            line('Individual paw toe groove', [(side * .27 - .075 + toe * .075, -.49, .35),
                                               (side * .27 - .075 + toe * .075, -.47, .43)], black, .008)
    line('Alert shepherd tail', [(.41, .25, .62), (.78, .34, .65), (.88, .16, .96)], black, .115)
    ball('Rounded shepherd tail tip', (.88, .16, .96), (.115, .115, .135), black)
    ball('Police K9 fitted harness', (0, -.02, 1.095), (.57, .385, .43), navy)
    for side in [-1, 1]:
        line('Harness reflective shoulder band', [(side * .34, -.31, 1.42), (side * .47, -.28, 1.13),
                                                 (side * .43, -.24, .85)], silver, .027)
        box('Harness adjustment buckle', (side * .39, -.358, 1.04), (.115, .042, .11), black, .019)
    box('K9 chest identity patch', (0, -.433, 1.13), (.55, .055, .25), black, .037)
    text_label('POLICE K9 woven patch', 'POLICE K9', (0, -.47, 1.14), .086, white)
    badge('K9 hanging service badge', 0, -.423, .86, .22)
    line('Harness lifting handle', [(-.20, .10, 1.43), (-.15, .13, 1.57), (.15, .13, 1.57), (.20, .10, 1.43)], black, .035)
    ball('German shepherd head', (0, .01, 2.07), (.70, .52, .66), tan)
    for side in [-1, 1]:
        # Separate ear shells avoid the previous intersecting dark crown surface.
        mesh('Upright shepherd ear', [(side * .26, -.10, 2.50), (side * .72, .015, 2.44),
              (side * .61, .09, 3.23), (side * .48, .34, 2.50)],
              [(0, 1, 2), (0, 2, 3), (1, 3, 2), (0, 3, 1)], black, .075)
        mesh('Warm inner ear shell', [(side * .355, -.111, 2.58), (side * .62, -.01, 2.57),
              (side * .585, .035, 3.04)], [(0, 1, 2)], coat, .024)
        ball('Shepherd dark face marking', (side * .29, -.42, 2.12), (.28, .125, .30), black)
        ball('Amber dog eye', (side * .29, -.539, 2.17), (.095, .037, .105), orange)
        ball('Dog pupil', (side * .29, -.571, 2.17), (.043, .020, .065), black)
        ball('Eye highlight', (side * .27, -.587, 2.205), (.022, .012, .025), white)
        brow = ball('Alert shepherd brow', (side * .29, -.456, 2.35), (.235, .09, .09), tan)
        brow.rotation_euler.y = side * -.16
        for i in range(3):
            tuft = ball('Sculpted cheek fur layer', (side * (.47 + i * .035), -.19, 2.02 - i * .105),
                        (.15, .25, .155), tan)
            tuft.rotation_euler.y = side * -.4
    ball('Shepherd bridge of nose', (0, -.42, 2.12), (.185, .19, .22), black)
    ball('Shepherd muzzle', (0, -.54, 1.96), (.32, .34, .21), tan)
    ball('Soft dark nose', (0, -.833, 2.015), (.192, .105, .12), black)
    for side in [-1, 1]:
        ball('Nose leather nostril', (side * .09, -.927, 2.02), (.028, .012, .020), navy)
        for dx, dz in [(0, 0), (.06, -.03), (-.05, -.035)]:
            ball('Muzzle whisker follicle', (side * (.15 + dx), -.79, 1.935 + dz), (.007, .008, .007), black)
    line('Dog mouth', [(-.18, -.754, 1.84), (0, -.80, 1.81), (.18, -.754, 1.84)], black, .011)
    torus('Police collar metal ring', (0, -.40, 1.55), .072, .015, silver)
    # A coiled lead on the display plinth supports the working-dog role.
    line('Coiled working lead', [(.65, -.28, .31), (.93, -.30, .30), (1.00, -.02, .30),
                               (.75, .11, .30), (.60, -.1, .30), (.84, -.17, .31)], navy, .022)


def eagle():
    ball('Eagle ceremonial body', (0, .025, 1.16), (.55, .35, .74), navy)
    for side in [-1, 1]:
        for layer in range(2):
            for i in range(6):
                x = side * (.48 + .083 * i + layer * .065)
                feather = ball('Individual layered wing plume', (x, .04 - layer * .12, 1.68 - i * .135),
                               (.13, .19, .43 - .02 * i), blue if layer == 0 else navy)
                feather.rotation_euler.y = side * .34
        for toe in range(3):
            line('Individual gold eagle talon', [(side * .23 + (toe - 1) * .095, -.08, .52),
                  (side * .23 + (toe - 1) * .095, -.32, .28),
                  (side * .23 + (toe - 1) * .095, -.40, .285)], gold, .037)
            ball('Rounded talon toe', (side * .23 + (toe - 1) * .095, -.40, .285), (.037, .052, .037), gold)
    ball('Ivory eagle head', (0, -.03, 2.20), (.635, .49, .58), white)
    for side in [-1, 1]:
        for i in range(4):
            feather = ball('Ivory neck feather', (side * (.23 + i * .075), -.20, 1.91 - i * .024),
                           (.105, .23, .245), white)
            feather.rotation_euler.y = side * -.28
        ball('Eagle dark eye socket', (side * .285, -.448, 2.25), (.17, .055, .15), black)
        ball('Eagle amber iris', (side * .28, -.498, 2.26), (.084, .020, .09), orange)
        ball('Eagle sharp pupil', (side * .28, -.516, 2.26), (.030, .009, .048), black)
        ball('Eagle eye catchlight', (side * .265, -.526, 2.285), (.015, .006, .017), white)
        brow = ball('Eagle resolute brow', (side * .28, -.458, 2.40), (.265, .073, .092), white)
        brow.rotation_euler.y = side * -.22
    mesh('Hooked golden eagle beak', [(-.20, -.44, 2.24), (.20, -.44, 2.24), (0, -.91, 2.11),
         (0, -.82, 1.925), (-.165, -.49, 2.00), (.165, -.49, 2.00)],
         [(0, 1, 2), (0, 2, 3, 4), (1, 5, 3, 2), (4, 3, 5), (0, 4, 5, 1)], gold, .05)
    for side in [-1, 1]:
        ball('Eagle beak nostril', (side * .11, -.605, 2.16), (.032, .017, .018), tan)
    badge('Honor guard ceremonial badge', 0, -.405, 1.20, .81, gold)
    text_label('Guardian badge banner', 'HONOR', (0, -.485, 1.47), .076, white)
    for side in [-1, 1]:
        line('Laurel branch stem', [(side * .30, -.42, .84), (side * .54, -.38, 1.04),
                                   (side * .57, -.30, 1.40)], gold, .012)
        for i in range(5):
            leaf = ball('Individual gold laurel leaf', (side * (.39 + .037 * i), -.425 + .016 * i, .92 + .09 * i),
                        (.05, .018, .09), gold)
            leaf.rotation_euler.y = side * .6


for variant in variants:
    stage(variant)
    if variant == 'k9':
        k9()
    elif variant == 'guardian':
        eagle()
    else:
        robot(variant)
    bpy.context.scene['collection'] = '180 Academy role collectibles, edition 3'
    bpy.context.scene['original_geometry'] = True
    bpy.context.scene['avatar_variant'] = variant
    bpy.ops.wm.save_as_mainfile(filepath=str(out / f'{variant}.blend'), compress=True)
    bpy.ops.render.render(write_still=True)
    print('AVATAR_COMPLETE', variant, flush=True)
