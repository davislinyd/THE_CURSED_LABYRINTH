import RealityKit
import simd

/// A fixed, distant torso with two articulated siege arms reaching the real gameplay contact point.
@MainActor final class NativeColossus {
    private let actor:NativeActor
    private let limbs:[(Entity,Entity,Entity,Entity,Float)]
    private var elapsed:Float=0
    private var active:Float=1
    private var sequence = -1
    private var lastTick = -1
    private var lastState = ""
    private var windupOrigin=SIMD3<Float>.zero
    private var wrists:[SIMD3<Float>]=[[-8,0.8,28],[8,0.8,28]]
    init?(_ actor:NativeActor) {
        var result:[(Entity,Entity,Entity,Entity,Float)]=[]
        for (name,side) in [("left",Float(-1)),("right",Float(1))] {
            guard let shoulder=actor.joint("shoulder_"+name),let upper=actor.joint("upper_"+name),let lower=actor.joint("lower_"+name),let hand=actor.joint("hand_"+name) else{return nil}
            result.append((shoulder,upper,lower,hand,side))
        }
        self.actor=actor;limbs=result
    }
    func update(_ enemy:Enemy,delta:Float) {
        elapsed+=delta
        let reveal=clamp(elapsed/1.8,0,1),rise=reveal*reveal*(3-2*reveal)
        actor.root.position=[24,-7*(1-rise),-5];actor.root.orientation=simd_quatf(angle:0,axis:[0,1,0])
        if sequence != enemy.attackSequence || (enemy.state=="attack" && (lastState != "attack" || enemy.tick<lastTick)) {
            sequence=enemy.attackSequence;active=sequence%2==0 ? -1:1
            windupOrigin=wrists[active<0 ? 0:1]
        }
        lastTick=enemy.tick;lastState=enemy.state
        let origin=actor.root.position
        for (index,limb) in limbs.enumerated() {
            let (shoulderNode,upper,lower,hand,side)=limb
            let shoulder=shoulderNode.convert(position:.zero,to:actor.root)
            let attacking=side==active
            let lateral=ColossusPose.side(enemy)
            let right=SIMD3<Float>(cos(enemy.yaw),0,-sin(enemy.yaw))
            let forward=SIMD3<Float>(sin(enemy.yaw),0,cos(enemy.yaw))
            let contact=SIMD3<Float>(enemy.position.x,ColossusPose.height(enemy),enemy.position.z)-forward*3+right*lateral-origin
            let rest=SIMD3<Float>(side*13,4,14)
            let target=attacking ? contact:rest
            if attacking && enemy.state=="attack" {
                let u=clamp(Float(enemy.tick)/24,0,1),blend=u*u*(3-2*u)
                wrists[index]=windupOrigin+(target-windupOrigin)*blend
            }
            else {wrists[index]+=(target-wrists[index])*min(1,delta*10)}
            let wrist=wrists[index],difference=wrist-shoulder,distance=min(38.5,max(1,simd_length(difference))),axis=simd_normalize(difference)
            let pole=SIMD3<Float>(side,0,-0.15),bend=simd_normalize(pole-axis*simd_dot(pole,axis))
            let along=(19*19-20*20+distance*distance)/(2*distance),height=sqrt(max(0,19*19-along*along))
            let elbow=shoulder+axis*along+bend*height
            func segment(_ entity:Entity,_ a:SIMD3<Float>,_ b:SIMD3<Float>) {
                let direction=b-a
                entity.transform=Transform(scale:[1,simd_length(direction),1],rotation:simd_quatf(from:[0,1,0],to:simd_normalize(direction)),translation:a)
            }
            segment(upper,shoulder,elbow);segment(lower,elbow,wrist)
            hand.position=wrist
            let rotation=simd_quatf(angle:attacking ? enemy.yaw:side*0.45,axis:[0,1,0])
            let committed=attacking && enemy.state=="attack" && enemy.tick>=enemy.attackStart-4
            hand.orientation=simd_slerp(hand.orientation,rotation,committed ? 1:min(1,delta*10))
        }
    }
}
