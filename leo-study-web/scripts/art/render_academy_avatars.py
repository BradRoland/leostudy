"""Original procedural Blender models. No generated images or image textures.
Run: blender -b --python scripts/art/render_academy_avatars.py -- /absolute/output [patrol|k9|motor|detective|aviation|commander|guardian]
Renders PNGs and saves an editable scene for each collectible.
"""
import bpy, math, sys
from pathlib import Path
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:]
out=Path(args[0]);out.mkdir(parents=True,exist_ok=True)
variants=args[1:] or ['patrol','k9','motor','detective','aviation','commander','guardian']

def material(name,color,metal=0,rough=.32,emission=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 if emission:p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
 return m

def finish(o,name,mat):
 o.name=name;o.data.materials.append(mat)
 if o.type=='MESH':
  for f in o.data.polygons:f.use_smooth=True
 return o

def ball(name,loc,scale,mat):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=48,ring_count=24,location=loc);o=bpy.context.object;o.scale=scale;return finish(o,name,mat)
def box(name,loc,scale,mat,bevel=.12):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 mod=o.modifiers.new('Soft machined edges','BEVEL');mod.width=bevel;mod.segments=4;o.modifiers.new('Weighted normals','WEIGHTED_NORMAL');return finish(o,name,mat)
def cylinder(name,loc,radius,depth,mat,rotation=None):
 bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=radius,depth=depth,location=loc);o=bpy.context.object
 if rotation:o.rotation_euler=rotation
 b=o.modifiers.new('Rounded rim','BEVEL');b.width=.045;b.segments=3;o.modifiers.new('Weighted normals','WEIGHTED_NORMAL');return finish(o,name,mat)
def mesh(name,verts,faces,mat,bevel=.035):
 d=bpy.data.meshes.new(name);d.from_pydata(verts,[],faces);d.update();o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);finish(o,name,mat)
 if bevel:
  b=o.modifiers.new('Edge highlights','BEVEL');b.width=bevel;b.segments=3;o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
 return o
def shield(name,x,y,z,size,mat):
 pts=[(-.5,.44),(0,.59),(.5,.44),(.44,-.2),(0,-.62),(-.44,-.2)]
 verts=[(x+a*size,y+b,z+c*size) for b in [-.035,.035] for a,c in pts]
 return mesh(name,verts,[tuple(range(5,-1,-1)),tuple(range(6,12))]+[(i,(i+1)%6,(i+1)%6+6,i+6) for i in range(6)],mat,.025)
def star(name,x,y,z,size,mat):
 pts=[(math.sin(i*math.pi/5)*size*(1 if i%2==0 else .45),math.cos(i*math.pi/5)*size*(1 if i%2==0 else .45)) for i in range(10)]
 return mesh(name,[(x,y-.055,z)]+[(x+a,y,z+b) for a,b in pts],[(0,i+1,(i+1)%10+1) for i in range(10)],mat,.008)
def line(name,points,mat,r=.04):
 cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.bevel_depth=r;cu.bevel_resolution=4;s=cu.splines.new('BEZIER');s.bezier_points.add(len(points)-1)
 for p,v in zip(s.bezier_points,points):p.co=v;p.handle_left_type='AUTO';p.handle_right_type='AUTO'
 o=bpy.data.objects.new(name,cu);bpy.context.collection.objects.link(o);o.data.materials.append(mat);return o

def stage(v):
 bpy.ops.wm.read_factory_settings(use_empty=True)
 global navy,blue,black,silver,gold,white,tan,orange,cyan
 navy=material('Midnight ceramic',(.025,.065,.14),.38);blue=material('Cobalt enamel',(.045,.23,.65),.45);black=material('Obsidian visor',(.012,.025,.05),.6,.16);silver=material('Brushed platinum',(.6,.73,.83),.8,.25);gold=material('Champagne brass',(.72,.43,.13),.75,.27);white=material('Ivory ceramic',(.84,.9,.95),.25);tan=material('Warm saddle',(.47,.22,.07),.1,.5);orange=material('Amber',(.94,.45,.05),.25);cyan=material('Signal blue',(.12,.65,1),.3,.24,1.2)
 floor=material('Studio slate',(.016,.032,.066),.12,.48)
 cylinder('Collectible plinth',(0,0,.08),1.24,.18,navy);cylinder('Blue inlay rim',(0,0,.19),1.17,.045,blue)
 bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.03));finish(bpy.context.object,'Studio backdrop',floor)
 scene=bpy.context.scene;scene.world=bpy.data.worlds.new('Studio environment');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.1,.15,.24,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.4
 for name,loc,energy,color,size in [('Key',(-3,-4,6),650,(.84,.93,1),4),('Warm fill',(4,-2,3),420,(1,.81,.59),3),('Rim',(2,3,5),1000,(.22,.48,1),3)]:
  d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.color=color;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,1.6))-o.location).to_track_quat('-Z','Y').to_euler()
 d=bpy.data.cameras.new('Portrait camera');o=bpy.data.objects.new('Portrait camera',d);scene.collection.objects.link(o);o.location=(3.1,-7.5,3.5);o.rotation_euler=(Vector((0,0,1.68))-o.location).to_track_quat('-Z','Y').to_euler();d.type='ORTHO';d.ortho_scale=4.15;scene.camera=o
 scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
 scene.render.resolution_x=768;scene.render.resolution_y=768;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX';scene.render.filepath=str(out/f'{v}.png')

def torso(accent=None):
 if accent is None:accent=silver
 ball('Uniform torso',(0,0,.94),(.68,.39,.73),navy)
 for x in [-.63,.63]:ball('Uniform sleeve',(x,0,1.04),(.24,.29,.46),navy);ball('Glove',(x,-.07,.67),(.21,.24,.2),black)
 box('Body armor front',(0,-.32,1.12),(.91,.19,.7),navy,.12)
 for x in [-.44,.44]:box('Harness strap',(x,-.4,1.15),(.09,.07,.67),black,.03)
 shield('Chest shield',-.22,-.463,1.22,.24,accent);star('Chest star',-.22,-.507,1.23,.067,blue)
 box('Radio',(.27,-.46,1.2),(.21,.14,.32),black,.035);line('Radio antenna',[(.28,-.45,1.36),(.28,-.45,1.62)],black,.022)
 for z in [1.22,1.27,1.32]:box('Radio grille',(.27,-.54,z),(.11,.02,.012),silver,.004)
 box('Utility belt',(0,-.32,.73),(1.0,.18,.16),black,.035);box('Belt buckle',(0,-.44,.73),(.19,.07,.13),accent,.025)
 for x in [-.26,.26]:ball('Boot',(x,-.08,.36),(.28,.39,.18),black)

def robot(v):
 accent=gold if v=='commander' else silver
 torso(accent)
 ball('Neck',(0,0,1.64),(.28,.25,.22),black)
 shell=white if v=='motor' else navy
 ball('Helmet shell',(0,0,2.23),(.83,.65,.79),shell)
 ball('Wraparound visor',(0,-.465,2.2),(.735,.3,.42),black)
 for x in [-.24,.24]:box('Cyan optical display',(x,-.748,2.22),(.23,.035,.065),cyan,.027)
 line('Visor lower trim',[(-.63,-.56,2.02),(0,-.74,1.91),(.63,-.56,2.02)],accent,.025)
 if v in ['patrol','commander']:
  ball('Peaked patrol crown',(0,.015,2.79),(.84,.65,.29),navy)
  box('Cap band',(0,-.54,2.66),(1.31,.12,.15),accent,.05)
  ball('Cap brim',(0,-.65,2.63),(.79,.47,.085),black)
  shield('Cap badge',0,-.645,2.84,.28,accent);star('Cap star',0,-.695,2.86,.085,blue if v=='patrol' else gold)
  for x in [-.58,.58]:
   for z in range(1 if v=='patrol' else 3):box('Rank bar',(x,-.245,1.34+z*.075),(.2,.055,.03),accent,.012)
 elif v=='motor':
  line('Helmet cobalt stripe',[(0,.3,2.86),(0,-.03,3.02),(0,-.43,2.82)],blue,.085)
  ball('Chin guard',(0,-.27,1.83),(.62,.53,.19),white)
  shield('Helmet service badge',0,-.574,2.76,.24,silver)
 elif v=='aviation':
  for x in [-.82,.82]:
   cylinder('Headset housing',(x,0,2.19),.31,.19,black,(0,math.pi/2,0));cylinder('Headset metal cap',(x*1.09,0,2.19),.22,.06,silver,(0,math.pi/2,0))
  line('Communications boom',[(.86,-.02,2.14),(.82,-.65,1.97),(.29,-.83,1.93)],silver,.037)
  box('Microphone',(.25,-.83,1.93),(.25,.12,.13),black,.065)
  box('Helmet center stripe',(0,-.05,2.96),(.15,.62,.045),blue,.022)
 elif v=='detective':
  ball('Fedora brim',(0,0,2.73),(1.02,.76,.105),navy)
  box('Fedora crown',(0,.08,2.96),(1.28,.97,.49),navy,.21)
  box('Fedora silver band',(0,-.42,2.84),(1.13,.07,.10),silver,.035)
  # Distinct coat lapels, modeled rather than painted.
  for sign in [-1,1]:
   mesh('Detective coat lapel',[(sign*.1,-.51,1.03),(sign*.52,-.46,1.47),(sign*.18,-.5,1.52)],[(0,1,2)],silver,.035)

def k9():
 ball('K9 body',(0,0,.93),(.53,.37,.67),tan)
 for x in [-.32,.32]:ball('Front paw',(x,-.2,.4),(.25,.32,.19),tan)
 ball('Harness vest',(0,-.07,1.03),(.58,.39,.45),navy)
 shield('K9 harness shield',0,-.49,1.06,.39,silver);star('K9 star',0,-.54,1.08,.12,blue)
 ball('Shepherd head',(0,0,2.02),(.76,.55,.73),tan)
 ball('Dark crown',(0,.12,2.42),(.66,.47,.37),black)
 for side in [-1,1]:
  verts=[(side*.28,-.12,2.5),(side*.82,.04,2.44),(side*.63,.1,3.26),(side*.55,.35,2.5)]
  mesh('Pointed shepherd ear',verts,[(0,1,2),(0,2,3),(1,3,2),(0,3,1)],black,.09)
  mesh('Warm inner ear',[(side*.39,-.145,2.58),(side*.69,-.01,2.57),(side*.60,.025,3.08)],[(0,1,2)],tan,.025)
  ball('Dark eye mask',(side*.36,-.43,2.11),(.25,.13,.26),black)
  ball('Amber eye',(side*.35,-.548,2.13),(.094,.045,.11),orange)
  ball('Pupil',(side*.34,-.583,2.13),(.047,.02,.064),black)
  ball('Eye catchlight',(side*.32,-.601,2.17),(.023,.015,.025),white)
  ball('Cheek',(side*.32,-.35,1.87),(.35,.3,.25),tan)
 ball('Muzzle',(0,-.53,1.87),(.35,.42,.24),black)
 ball('Nose',(0,-.9,1.91),(.21,.14,.135),black)
 line('Mouth',[(0,-.90,1.80),(0,-.75,1.73)],silver,.016)

def eagle():
 ball('Guardian torso',(0,0,1.1),(.62,.4,.81),navy)
 for side in [-1,1]:
  for i in range(5):
   o=ball('Layered wing feather',(side*(.62+i*.095),.04,1.55-i*.19),(.18,.28,.52),gold if i==0 else navy);o.rotation_euler[1]=side*.3
  ball('Gold talon',(side*.25,-.14,.36),(.23,.32,.15),gold)
 ball('Ivory eagle head',(0,-.03,2.17),(.66,.54,.63),white)
 for side in [-1,1]:
  ball('Eye socket',(side*.31,-.46,2.25),(.19,.07,.16),black);ball('Golden eye',(side*.3,-.527,2.26),(.095,.025,.09),orange);ball('Pupil',(side*.30,-.55,2.26),(.036,.016,.048),black)
  o=ball('Strong brow',(side*.30,-.49,2.42),(.29,.09,.095),white);o.rotation_euler[1]=side*-.2
 mesh('Sculpted golden beak',[(-.21,-.48,2.22),(.21,-.48,2.22),(0,-1.0,2.05),(0,-.85,1.89),(-.18,-.5,1.99),(.18,-.5,1.99)],[(0,1,2),(0,2,3,4),(1,5,3,2),(4,3,5),(0,4,5,1)],gold,.065)
 shield('Guardian shield',0,-.435,1.2,.9,gold);shield('Navy enamel inset',0,-.488,1.23,.68,blue);star('Guardian star',0,-.535,1.25,.21,gold)

for v in variants:
 stage(v)
 if v=='k9':k9()
 elif v=='guardian':eagle()
 else:robot(v)
 bpy.ops.wm.save_as_mainfile(filepath=str(out/f'{v}.blend'),compress=True)
 bpy.ops.render.render(write_still=True)
 print('AVATAR_COMPLETE',v,flush=True)
