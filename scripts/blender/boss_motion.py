"""Offline articulated boss animation, baked to ordinary node TRS tracks.

Two-bone limb solves keep boots planted and both hands on the polearm. No
runtime IK, skinning, constraints, or new native asset schema is required.
"""
import bpy
import math
from mathutils import Vector, Quaternion, Matrix


def animate_boss(rig, ghost, clips):
    pose=rig.pose.bones
    locomotion={'move':Vector((0,1,0)),'move_back':Vector((0,-1,0)),
                'strafe_left':Vector((1,0,0)),'strafe_right':Vector((-1,0,0))}
    identity=Quaternion((1,0,0,0))
    bend_history={}
    def update():bpy.context.view_layer.update()
    def axis(axis,angle):return Quaternion(Vector(axis),angle)
    def parent_delta(bone):
        return bone.parent.matrix @ bone.parent.bone.matrix_local.inverted() if bone.parent else rig.matrix_world.inverted() @ rig.matrix_world
    def world_rotation(name,rotation):
        bone=pose[name];basis=bone.bone.matrix_local.to_quaternion()
        bone.rotation_quaternion=basis.inverted() @ parent_delta(bone).to_quaternion().inverted() @ rotation @ basis
        update()
    def limb_frame(direction,normal):
        y=direction.normalized();x=y.cross(normal).normalized();z=x.cross(y).normalized()
        return Matrix((x,y,z)).transposed().to_quaternion()
    def limb(upper,lower,end,target,pole,end_rotation):
        update();a=pose[upper].matrix.translation.copy()
        first=(pose[lower].bone.head_local-pose[upper].bone.head_local).length
        second=(pose[end].bone.head_local-pose[lower].bone.head_local).length
        delta=Vector(target)-a;direction=delta.normalized()
        distance=max(abs(first-second)+.002,min(first+second-.002,delta.length))
        bend=Vector(pole)-direction*Vector(pole).dot(direction)
        if bend.length<.001:bend=direction.cross(Vector((1,0,0)))
        bend.normalize()
        if upper in bend_history:
            prior=bend_history[upper]-direction*bend_history[upper].dot(direction)
            if prior.length>.001:
                prior.normalize()
                if bend.dot(prior)<0:bend.negate()
                # Near a pole singularity, transport the previous bend plane
                # instead of rolling the elbow and wrist around a straight arm.
                turn=prior.rotation_difference(bend)
                bend=(identity.slerp(turn,min(1,.08/max(.0001,turn.angle))) @ prior).normalized()
        bend_history[upper]=bend.copy()
        along=(first*first+distance*distance-second*second)/(2*distance)
        joint=a+direction*along+bend*math.sqrt(max(0,first*first-along*along))
        tip=a+direction*distance
        rest_a=pose[lower].bone.head_local-pose[upper].bone.head_local
        rest_b=pose[end].bone.head_local-pose[lower].bone.head_local
        rest_normal=rest_a.cross(rest_b).normalized();normal=bend.cross(direction).normalized()
        world_rotation(upper,limb_frame(joint-a,normal) @ limb_frame(rest_a,rest_normal).inverted())
        world_rotation(lower,limb_frame(tip-pose[lower].matrix.translation,normal) @ limb_frame(rest_b,rest_normal).inverted())
        world_rotation(end,end_rotation)

    base={'drop':-.10,'lean':-.07,'twist':0.,'hip_yaw':0.,'chest_yaw':0.,'head':-.08,
          'right':(1.85,.36,3.05),'blade':(.15,.04,1.),'grip':0.,'forward':0.}
    def profile(frame,clip):
        knots={
            'slam':[(0,{}),(12,{'drop':-.20,'lean':.02,'right':(1.1,.25,3.6),'blade':(.08,-.2,1),'grip':.45}),
                    (32,{'drop':-.25,'lean':.10,'right':(.22,.25,5.20),'blade':(0,-.3,1),'grip':1.,'forward':-.06}),
                    (39,{'drop':-.24,'lean':.11,'right':(.22,.25,5.22),'blade':(0,-.3,1),'grip':1.,'forward':-.06}),
                    (44,{'drop':-.29,'lean':-.12,'right':(.3,.8,4.2),'blade':(0,1,.4),'grip':1.,'forward':.05}),
                    (48,{'drop':-.38,'lean':-.28,'right':(.3,.9,3.0),'blade':(0,1,-1.05),'grip':1.,'twist':.08,'forward':.12}),
                    (52,{'drop':-.43,'lean':-.32,'right':(.3,1.,2.91),'blade':(0,1,-1.1),'grip':1.,'twist':.10,'forward':.14}),
                    (57,{'drop':-.39,'lean':-.29,'right':(.3,.9,3.0),'blade':(0,1,-1.05),'grip':1.,'twist':.08,'forward':.12}),
                    (78,{'drop':-.20,'lean':-.12,'right':(1.,.8,3.3),'blade':(.3,.7,.2),'grip':.7,'twist':.06}),
                    (108,{})],
            'sweep':[(0,{}),(14,{'drop':-.17,'twist':-.22,'hip_yaw':-.08,'right':(.35,.45,3.7),'blade':(-.7,.35,.6),'grip':.7}),
                     (32,{'drop':-.20,'twist':-.50,'hip_yaw':-.15,'chest_yaw':-.10,'right':(-.3,.6,3.9),'blade':(-1,.2,.12),'grip':1.}),
                     (39,{'drop':-.21,'twist':-.52,'hip_yaw':-.16,'chest_yaw':-.10,'right':(-.3,.6,3.9),'blade':(-1,.2,.12),'grip':1.}),
                     (40,{'drop':-.21,'twist':-.50,'hip_yaw':-.15,'right':(-.25,.65,3.85),'blade':(-.95,.3,.05),'grip':1.}),
                     (50,{'drop':-.28,'twist':.12,'hip_yaw':.06,'right':(.2,1.,3.5),'blade':(.05,1,-.4),'grip':1.,'forward':.08}),
                     (60,{'drop':-.24,'twist':.65,'hip_yaw':.25,'right':(.7,.7,3.55),'blade':(1,.25,-.25),'grip':1.}),
                     (68,{'drop':-.22,'twist':.72,'hip_yaw':.27,'right':(.85,.5,3.6),'blade':(1,-.05,.1),'grip':.9}),
                     (80,{'drop':-.17,'twist':.30,'hip_yaw':.10,'right':(1.35,.45,3.3),'blade':(.7,.2,.7),'grip':.5}),
                     (96,{})],
            'hurt':[(0,{}),(5,{'lean':.10,'twist':-.08,'head':.08,'drop':-.16}),
                    (12,{'lean':-.12,'twist':.03,'head':-.12,'drop':-.13}),(24,{})],
            'stagger':[(0,{}),(20,{'drop':-.40,'lean':-.30,'head':-.25,'right':(1.,.6,2.7),'blade':(.2,.4,.8)}),
                       (72,{'drop':-.38,'lean':-.27,'head':-.22,'right':(1.,.6,2.8),'blade':(.2,.4,.8)}),(120,{})],
            'die':[(0,{}),(30,{'drop':-.40,'lean':-.20,'head':-.25,'right':(1.5,.7,2.8),'blade':(.4,.3,.8)}),
                   (80,{'drop':-1.,'lean':-.42,'head':-.35,'hip_yaw':.08,'right':(1.3,1.1,1.8),'blade':(.7,.4,.1)}),
                   (120,{'drop':-1.35,'lean':-.72,'head':-.50,'hip_yaw':.12,'chest_yaw':-.14,'right':(1.3,1.4,1.2),'blade':(.8,.35,-.2)}),
                   (150,{'drop':-1.37,'lean':-.75,'head':-.52,'hip_yaw':.12,'chest_yaw':-.14,'right':(1.3,1.4,1.15),'blade':(.8,.35,-.2)})]
        }
        if clip not in knots:return dict(base)
        keys=knots[clip]
        def slope(index,key,component):
            def value(i):
                v=(base|keys[i][1])[key]
                return v[component] if component is not None else v
            if index==0 or index==len(keys)-1:return 0.
            h0=keys[index][0]-keys[index-1][0];h1=keys[index+1][0]-keys[index][0]
            d0=(value(index)-value(index-1))/h0;d1=(value(index+1)-value(index))/h1
            if d0*d1<=0:return 0.
            w0=2*h1+h0;w1=h1+2*h0
            return (w0+w1)/(w0/d0+w1/d1)
        for index,((fa,pa),(fb,pb)) in enumerate(zip(keys,keys[1:])):
            if frame<=fb:
                u=max(0,min(1,(frame-fa)/(fb-fa)))
                a=base|pa;b=base|pb;result={}
                def interpolate(key,component=None):
                    va=a[key][component] if component is not None else a[key]
                    vb=b[key][component] if component is not None else b[key]
                    return (2*u**3-3*u*u+1)*va+(u**3-2*u*u+u)*(fb-fa)*slope(index,key,component)+(-2*u**3+3*u*u)*vb+(u**3-u*u)*(fb-fa)*slope(index+1,key,component)
                for key in base:
                    result[key]=tuple(interpolate(key,i) for i in range(3)) if isinstance(a[key],tuple) else interpolate(key)
                return result
        return base|keys[-1][1]

    rig.animation_data_create()
    for clip,end in clips.items():
        action=bpy.data.actions.new(rig.name+'_'+clip);action.use_fake_user=True
        rig.animation_data.action=action
        previous={};bend_history.clear();first_pose={}
        for frame in range(end+1):
            bpy.context.scene.frame_set(frame)
            for bone in pose:
                bone.rotation_mode='QUATERNION';bone.rotation_quaternion=identity;bone.location=(0,0,0);bone.scale=(1,1,1)
            t=frame/end;phase=t*math.tau;p=profile(frame,clip)
            lift=(.18+.055*math.sin(phase)) if ghost and (clip=='idle' or clip in locomotion) else .18 if ghost else 0
            if clip=='die':lift*=1-min(1,frame/120)
            pose['root'].location.y=lift
            sway=.035*math.sin(phase) if clip=='idle' or clip in locomotion else 0
            if clip=='idle':p['drop']+=.012*math.sin(phase);p['lean']+=.012*math.sin(phase)
            if clip in locomotion:
                p['drop']= -.17+.04*math.cos(phase*2)
                p['hip_yaw']=.035*math.sin(phase);p['twist']=-.025*math.sin(phase)
                p['right']=(1.85,.36+.06*math.sin(phase),3.08+.035*math.cos(phase*2))
            pose['hips'].location=(sway,p['drop'],-p['forward'])
            update()
            hip=axis((0,0,1),p['hip_yaw'])
            world_rotation('hips',hip)
            body=hip @ axis((1,0,0),p['lean']) @ axis((0,0,1),p['twist']*.5)
            world_rotation('body',body)
            chest=body @ axis((0,0,1),p['twist']*.5+p['chest_yaw']) @ axis((1,0,0),p['lean']*.18)
            world_rotation('chest',chest)
            head=axis((0,0,1),p['twist']*.18) @ axis((1,0,0),p['head']+(p['lean']*.5 if clip=='die' else 0))
            world_rotation('head',head)
            if ghost:pose['head'].location.y=.20
            update()
            # Grounded stance through attacks, with an explicit swing/plant cycle.
            for side in [-1,1]:
                y=.16;z=.45+lift;offset=0
                if clip in locomotion:
                    cycle=(t+(0 if side==-1 else .5))%1
                    if ghost:offset=.18*math.sin(cycle*math.tau);z+=.035*math.sin(cycle*math.tau)
                    elif cycle<.5:offset=.54-1.08*(cycle/.5)
                    else:
                        u=(cycle-.5)/.5;smooth=u*u*(3-2*u)
                        offset=-.54+1.08*smooth;z+=.23*math.sin(math.pi*u)
                foot_rotation=axis((1,0,0),-.10*math.sin(phase+(0 if side==-1 else math.pi))) if clip in locomotion else identity
                target=Vector((side*.70,y,z))+(locomotion[clip]*offset if clip in locomotion else Vector((0,0,0)))
                limb('leg'+str(side),'shin'+str(side),'foot'+str(side),target,Vector((side*.10,1,0)),foot_rotation)
            right=Vector(p['right'])+Vector((0,0,lift))
            blade=Vector(p['blade']).normalized()
            weapon_rotation=Vector((.60,.19,3.77)).rotation_difference(blade)
            limb('arm1','forearm1','hand1',right,Vector((1,-.35,.2)),weapon_rotation)
            # Use the solved wrist, so the second hand never follows an unreachable target.
            right=pose['hand1'].matrix.translation.copy()
            free_left=Vector((-1.95,.27,2.95+lift))
            if clip in locomotion:free_left.y-=.16*math.sin(phase);free_left.z+=.07*math.sin(phase)
            left=free_left.lerp(right-blade*.65+Vector((-.05,0,0)),p['grip'])
            left_rotation=identity.slerp(weapon_rotation,p['grip']) @ axis(Vector((.60,.19,3.77)).normalized(),.35*p['grip'])
            limb('arm-1','forearm-1','hand-1',left,Vector((-1,-.35,.2)),left_rotation)
            world_rotation('weapon',weapon_rotation)
            for side in [-1,1]:
                arm=pose['arm'+str(side)]
                delta=(arm.matrix @ arm.bone.matrix_local.inverted()).to_quaternion()
                world_rotation('shoulder'+str(side),chest.slerp(delta,.12))
            lag=profile(max(0,frame-5),clip)
            impact=math.exp(-max(0,frame-48)/16)*math.sin(max(0,frame-48)*.5) if clip=='slam' and frame>=48 else 0
            pose['cape'].rotation_quaternion=axis((1,0,0),.04*math.sin(phase-.5)+.5*(lag['lean']-p['lean'])+.04*impact)
            pose['banner'].rotation_quaternion=axis((0,0,1),.025*math.sin(phase-.8)+.35*(lag['twist']-p['twist'])+.025*impact)
            for bone in pose:
                if frame==0:first_pose[bone.name]=(bone.rotation_quaternion.copy(),bone.location.copy())
                elif frame==end and (clip=='idle' or clip in locomotion):bone.rotation_quaternion,bone.location=first_pose[bone.name]
                q=bone.rotation_quaternion.copy()
                if bone.name in previous and q.dot(previous[bone.name])<0:q.negate();bone.rotation_quaternion=q
                previous[bone.name]=q
                bone.keyframe_insert('rotation_quaternion',frame=frame,group=bone.name)
                bone.keyframe_insert('location',frame=frame,group=bone.name)
        track=rig.animation_data.nla_tracks.new();track.name=clip
        strip=track.strips.new(clip,0,action);strip.name=clip;strip.action_frame_start=0;strip.action_frame_end=end
        track.mute=True
    rig.animation_data.action=None
    for bone in pose:bone.rotation_quaternion=identity;bone.location=(0,0,0)
