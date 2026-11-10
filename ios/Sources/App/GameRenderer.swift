import RealityKit
import UIKit
import simd

@MainActor final class GameRenderer {
    let root=Entity()
    let camera=Entity()
    let ink=InkPostprocess()
    private let scenery=Entity(),characters=Entity(),effects=Entity()
    private let moon=DirectionalLight(),fill=DirectionalLight(),heroLight=PointLight()
    private var lamps:[PointLight]=[]
    private var lampAnchors:[LampAnchor]=[]
    private var library:NativeArtLibrary!
    private var player:NativeActor!
    private var actors:[String:NativeActor]=[:]
    private var villagers:[(NativeActor,Point)]=[]
    private var chunks:[(Entity,SIMD3<Float>,Float)]=[]
    private var cutaways:[(Entity,BoundingBox)]=[]
    private var fittings:[String:Entity]=[:]
    private var shots:[Int:ModelEntity]=[:]
    private var particles:[Particle]=[]
    private var trailPoints:[(SIMD3<Float>,SIMD3<Float>,Float)]=[]
    private let trail=ModelEntity()
    private let targetRing=ModelEntity()
    private let danger=ModelEntity()
    private var revision = -1
    private var area:Area?
    private var lastHero=Point()
    private var time:Float=0
    private var cameraPosition=SIMD3<Float>.zero
    private var kick:Float=0
    private var shake:Float=0
    private var footstep:Float=0
    private var visualTick=0
    private var reduced=false
    private var fogCount = -1
    private(set) var ready=false
    private(set) var assetFailures:[String]=[]
    var loadedBossArt:String? {actors["boss:rotroot"]?.file.name}
    var resourceRoot:URL!
    weak var session:GameSession?
    private struct LampAnchor:Decodable {var position:[Float];var color:Int}
    private struct SceneInfo:Decodable {var lanterns:[LampAnchor]}
    private struct Particle {var entity:ModelEntity;var velocity:SIMD3<Float>;var remaining:Float;var total:Float}

    func invalidate(){revision = -1;area=nil}
    func prepare() async {
        guard !ready,library==nil else{return}
        library=NativeArtLibrary(directory:resourceRoot.appendingPathComponent("Art"))
        do {
            try await library.preload(["hero","ghoul","hopper","wisp","crow","rotroot","rotroot_wraith","npc_elder","npc_girl","npc_smith","npc_merchant","npc_keeper","scene_world","scene_village","scene_road","scene_dungeon","scene_boss"])
            player=try library.instance("hero")
            root.addChild(scenery);root.addChild(characters);root.addChild(effects);root.addChild(camera)
            characters.addChild(player.root);effects.addChild(trail);effects.addChild(targetRing);effects.addChild(danger)
            moon.light.color=UIColor(red:0.67,green:0.76,blue:1,alpha:1);moon.light.intensity=3600
            moon.look(at:[0,0,0],from:[-10,20,8],relativeTo:nil)
            moon.shadow=DirectionalLightComponent.Shadow(maximumDistance:24,depthBias:1.5)
            fill.light.color=UIColor(red:0.74,green:0.70,blue:0.64,alpha:1);fill.light.intensity=1100
            fill.look(at:[0,0,0],from:[8,12,-8],relativeTo:nil)
            heroLight.light.color=UIColor(red:1,green:0.67,blue:0.35,alpha:1);heroLight.light.attenuationRadius=14
            for light in [moon as Entity,fill,heroLight]{root.addChild(light)}
            for _ in 0..<4 {let light=PointLight();light.light.attenuationRadius=8;root.addChild(light);lamps.append(light)}
            targetRing.model=ModelComponent(mesh:try ring(radius:0.7,width:0.025),materials:[glow(UIColor(red:0.85,green:0.66,blue:0.3,alpha:1))])
            targetRing.isEnabled=false;danger.isEnabled=false
            ready=true
        }catch{assetFailures.append(error.localizedDescription);session?.error=error.localizedDescription;print("Artwork load failed: \(error)")}
    }
    private func glow(_ color:UIColor,opacity:Float=1)->UnlitMaterial {
        var material=UnlitMaterial(color:color)
        if opacity<1{material.blending = .transparent(opacity:.init(floatLiteral:opacity))}
        material.faceCulling = .none;return material
    }
    private func rebuild(_ world:GameWorld) {
        let g=world.grid
        if area != g.area {
            area=g.area;scenery.children.removeAll();actors.values.forEach{$0.root.removeFromParent()};actors.removeAll();villagers.removeAll()
            shots.values.forEach{$0.removeFromParent()};shots.removeAll();particles.forEach{$0.entity.removeFromParent()};particles=[]
            chunks=[];cutaways=[];fittings=[:];trailPoints=[];fogCount = -1
            do {
                let sceneName="scene_"+g.area.rawValue
                let scene=try library.scene(sceneName)
                scenery.addChild(scene)
                let sceneNodes=scene.children.first.map{Array($0.children)} ?? []
                for node in sceneNodes {
                    let bounds=node.visualBounds(relativeTo:nil)
                    if node.name.contains("chunk_"){chunks.append((node,bounds.center,simd_length(bounds.extents)))}
                    if node.name.contains("building_") || node.name.hasSuffix("_cut"){cutaways.append((node,bounds))}
                    if node.name.contains("jar_"){let key=node.name.components(separatedBy:"jar_").last!;fittings["jar:"+key]=node}
                }
                if let data=try? Data(contentsOf:resourceRoot.appendingPathComponent("Art/\(sceneName)-scene.json")),let info=try? JSONDecoder().decode(SceneInfo.self,from:data){lampAnchors=info.lanterns}else{lampAnchors=[]}
                if g.area == .village {
                    for npc in world.content.village.villagers {let actor=try library.instance("npc_"+npc.look),p=g.center(npc.x,npc.y);actor.root.position=[p.x,0,p.z];characters.addChild(actor.root);villagers.append((actor,p))}
                }
                if g.area == .dungeon {try dungeonFittings(world)}
                if g.area.thirdPerson {
                    camera.components.remove(OrthographicCameraComponent.self)
                    camera.components.set(PerspectiveCameraComponent(near:0.08,far:95,fieldOfViewInDegrees:61))
                    cameraPosition=thirdPersonCameraPosition(world,at:world.save.position)
                }else{
                    camera.components.remove(PerspectiveCameraComponent.self)
                    var ortho=OrthographicCameraComponent();ortho.scale=7.2;camera.components.set(ortho)
                    cameraPosition=[world.save.position.x+14,19,world.save.position.z+14]
                }
            }catch{assetFailures.append(error.localizedDescription);session?.error=error.localizedDescription}
        }
        revision=world.sceneRevision
        for(key,entity)in fittings {
            if key.hasPrefix("jar:"){entity.isEnabled = !world.save.flags.contains("open:\(g.area.rawValue):"+String(key.dropFirst(4)))}
            else if key.hasPrefix("chest:"){
                if let lid=entity.findEntity(named:"treasure_chest_lid"){lid.orientation=simd_quatf(angle:world.save.flags.contains(key) ? -1.9:0,axis:[1,0,0])}
            }
            else if key.hasPrefix("open:"){entity.isEnabled = !world.save.flags.contains(key)}
        }
    }
    private func dungeonFittings(_ world:GameWorld)throws {
        let g=world.grid
        for y in 0..<g.height {for x in 0..<g.width {
            let char=g.char(x,y),p=g.center(x,y),at=SIMD3<Float>(p.x,0,p.z)
            if char=="C" {
                let source=try Entity.load(contentsOf:resourceRoot.appendingPathComponent("Models/treasure_chest.usdz"))
                let bounds=source.visualBounds(relativeTo:source),s:Float=0.9/max(0.01,bounds.extents.y)
                source.scale = .init(repeating:s);source.position=at-[bounds.center.x*s,bounds.min.y*s,bounds.center.z*s]
                scenery.addChild(source);fittings["chest:\(x),\(y)"]=source
            }else if char=="F" {
                var stone=PhysicallyBasedMaterial();stone.baseColor.tint=UIColor(white:0.55,alpha:1);stone.roughness=1.0
                if let texture=try? TextureResource.load(contentsOf:resourceRoot.appendingPathComponent("Textures/rock_wall_02.png")){stone.baseColor.texture = .init(texture)}
                let entity=ModelEntity(mesh:.generateBox(size:[4,4.5,0.25]),materials:[stone]);entity.position=at+[0,2.25,0];scenery.addChild(entity);fittings["fake:\(x),\(y)"]=entity
            }else if "DB".contains(char) {
                let wood=UIColor(red:0.26,green:0.19,blue:0.13,alpha:1)
                let entity=Entity(),axisX=g.char(x-1,y) != "#" && g.char(x+1,y) != "#"
                for i in 0..<5 {
                    let plank=ModelEntity(mesh:.generateBox(size:axisX ? [0.18,3.7,0.74]:[0.74,3.7,0.18]),materials:[SimpleMaterial(color:wood,roughness:1,isMetallic:false)])
                    plank.position=at+[axisX ? 0:Float(i-2)*0.78,1.85,axisX ? Float(i-2)*0.78:0]
                    entity.addChild(plank)
                }
                scenery.addChild(entity);fittings["open:"+g.key(x,y)]=entity
            }else if "KXT".contains(char) {
                let plaque=ModelEntity(mesh:.generateBox(size:[char=="K" ? 2.8:1.4,3.2,0.15]),materials:[SimpleMaterial(color:char=="K" ? UIColor(red:0.36,green:0.08,blue:0.075,alpha:1):.darkGray,roughness:0.9,isMetallic:false)])
                plaque.position=at+[0,1.6,2.03];scenery.addChild(plaque)
                for i:Float in [-1,1] {let bar=ModelEntity(mesh:.generateBox(size:[0.07,3.4,0.1]),materials:[SimpleMaterial(color:UIColor(red:0.64,green:0.46,blue:0.22,alpha:1),isMetallic:true)]);bar.position=plaque.position+[i*0.6,0,0.1];scenery.addChild(bar)}
            }
        }}
    }
    func sync(_ world:GameWorld,delta:Float,lowPower:Bool) {
        guard ready else{return};time+=delta;visualTick+=1
        if revision != world.sceneRevision{rebuild(world)}
        let p=world.save.position,third=world.save.area.thirdPerson
        let moved=p.distance(lastHero);lastHero=p
        let running=moved>0.08
        player.root.position=[p.x,0,p.z];player.root.orientation=simd_quatf(angle:world.save.yaw,axis:[0,1,0])
        let renderDelta:Float=world.playing || world.panel == .death || world.panel == .complete ? delta:0
        player.animate(world.hero.state,tick:world.hero.tick,delta:renderDelta,speed:running ? 1.4:1)
        footstep+=moved
        if footstep>1.8 && world.hero.state=="run"{footstep=0;world.event(third ? "step_dirt":"step_grass")}
        for enemy in world.enemies {
            let near=enemy.position.distance(p)<32
            let art=enemy.kind=="rotroot" ? world.save.difficulty.bossArt:enemy.kind
            if actors[enemy.id]==nil && near {do {let actor=try library.instance(art);characters.addChild(actor.root);actors[enemy.id]=actor}catch{assetFailures.append(art)}}
            guard let actor=actors[enemy.id]else{continue}
            actor.root.position=[enemy.position.x,0,enemy.position.z];actor.root.orientation=simd_quatf(angle:enemy.yaw,axis:[0,1,0])
            actor.root.isEnabled=near && (enemy.alive || enemy.tick<90)
            var state=enemy.kind=="rotroot" && enemy.state=="attack" ? (enemy.attackKind==0 ? "slam":"sweep"):enemy.state=="chase" ? "move":enemy.state
            let walking=enemy.kind=="rotroot" && (enemy.state=="chase" || enemy.state=="idle")
            var pivoting=false
            if walking {
                let forward=enemy.velocity.x*sin(enemy.yaw)+enemy.velocity.z*cos(enemy.yaw)
                let side=enemy.velocity.x*cos(enemy.yaw)-enemy.velocity.z*sin(enemy.yaw)
                let turn=wrapped(atan2(p.x-enemy.position.x,p.z-enemy.position.z)-enemy.yaw)
                if enemy.velocity.length<0.15 && abs(turn)>0.2 {state=turn>0 ? "strafe_right":"strafe_left";pivoting=true}
                else if abs(side)>abs(forward)*1.3 {state=side>0 ? "strafe_right":"strafe_left"}
                else if forward < -0.1 {state="move_back"}
            }
            let locomotion=state.hasPrefix("move")||state.hasPrefix("strafe")
            let pace:Float=walking && locomotion ? (pivoting ? 0.8:clamp(enemy.velocity.length/1.8,0.3,1.4)):1
            actor.animate(state,tick:enemy.tick,delta:renderDelta,speed:pace)
            if !enemy.alive {actor.root.components.set(OpacityComponent(opacity:clamp(1-Float(max(0,enemy.tick-35))/45,0,1)))}
        }
        let ids=Set(world.enemies.map(\.id));for id in Array(actors.keys)where !ids.contains(id){actors.removeValue(forKey:id)?.root.removeFromParent()}
        for(actor,position)in villagers {
            let to=p-position,d=to.length
            actor.root.orientation=simd_quatf(angle:d<6 ? atan2(to.x,to.z):sin(time*0.25)*0.3,axis:[0,1,0])
            actor.root.scale.y=1+sin(time*1.6)*0.008
        }
        for shot in world.projectiles {
            if shots[shot.id]==nil {let mesh=shot.friendly ? MeshResource.generateBox(size:[0.14,0.32,0.025]):.generateSphere(radius:0.15);let e=ModelEntity(mesh:mesh,materials:[glow(shot.friendly ? .init(red:0.95,green:0.85,blue:0.6,alpha:1):.cyan)]);shots[shot.id]=e;effects.addChild(e)}
            shots[shot.id]?.position=[shot.position.x,1.1,shot.position.z];shots[shot.id]?.orientation=simd_quatf(angle:time*12,axis:[0,1,0])
        }
        let shotIDs=Set(world.projectiles.map(\.id));for id in Array(shots.keys)where !shotIDs.contains(id){shots.removeValue(forKey:id)?.removeFromParent()}
        for event in world.events {
            switch event.kind {
            case "hit":
                if let enemy=world.enemies.min(by:{$0.position.distance(event.position)<$1.position.distance(event.position)}){actors[enemy.id]?.flash()}
                burst(event.position,color:world.hero.state=="counter" ? .systemYellow:.init(red:0.8,green:0.45,blue:0.2,alpha:1),count:lowPower ? 4:9);kick=0.08;shake=0.08
            case "parry":burst(p,color:.init(red:1,green:0.83,blue:0.4,alpha:1),count:lowPower ? 8:18);kick=0.2;shake=0.12
            case "hurt":player.flash();shake=0.2;ink.impact=0.55
            case "slam":burst(event.position,color:.init(red:0.6,green:0.46,blue:0.31,alpha:1),count:lowPower ? 8:20);shake=0.25
            case "soul":burst(event.position,color:.init(red:0.8,green:0.12,blue:0.08,alpha:1),count:5)
            default:break
            }
        }
        updateTrail(world,delta:delta)
        for i in particles.indices {
            particles[i].remaining-=delta;particles[i].velocity.y-=delta*2
            particles[i].entity.position+=particles[i].velocity*delta
            particles[i].entity.components.set(OpacityComponent(opacity:max(0,particles[i].remaining/particles[i].total)))
        }
        for particle in particles where particle.remaining<=0{particle.entity.removeFromParent()};particles.removeAll{$0.remaining<=0}
        let mark=world.enemies.first{$0.id==world.targetID && $0.alive}
        targetRing.isEnabled=mark != nil
        if let mark{targetRing.position=[mark.position.x,0.08,mark.position.z];targetRing.scale = .init(repeating:mark.kind=="rotroot" ? 2.5:1)}
        danger.isEnabled=false
        if let attack=world.enemies.first(where:{$0.kind=="rotroot" && $0.warning}){
            let radius:Float=attack.attackKind==0 ? 7:5.5,arc:Float=attack.attackKind==0 ? 0.45:2.6
            if let mesh=try? sector(radius:radius,angle:arc){danger.model=ModelComponent(mesh:mesh,materials:[glow(.init(red:0.67,green:0.15,blue:0.08,alpha:1),opacity:0.25+Float(attack.tick)/170)])}
            danger.position=[attack.position.x,0.06,attack.position.z];danger.orientation=simd_quatf(angle:attack.yaw,axis:[0,1,0]);danger.isEnabled=true
        }
        if visualTick%12==0{
            for(chunk,center,size)in chunks{chunk.isEnabled=size>60 || simd_distance(SIMD3(p.x,0,p.z),SIMD3(center.x,0,center.z))<38+size/2}
            for(entity,bounds)in cutaways{
                let h=SIMD3(p.x,1,p.z),c=cameraPosition,axis=simd_normalize(c-h),offset=bounds.center-h,t=simd_dot(offset,axis),distance=simd_length(offset-axis*t)
                entity.components.set(OpacityComponent(opacity:t>0 && t<30 && distance<max(2,bounds.extents.x*0.45) ? 0.22:1))
            }
            updateLights(p,third:third)
            for(key,entity)in fittings where key.hasPrefix("fake:"){
                let position=Point(x:entity.position.x,z:entity.position.z)
                entity.components.set(OpacityComponent(opacity:p.distance(position)<2.8 || world.save.keyItems.contains("mirror") ? 0.15:1))
            }
        }
        if fogCount != world.save.visited.count{fogCount=world.save.visited.count;ink.updateFog(world)}
        let target:SIMD3<Float>,desired:SIMD3<Float>
        if third{
            let yaw=world.cameraYaw
            desired=thirdPersonCameraPosition(world,at:p)
            target=[p.x+sin(yaw)*1.1,1.3,p.z+cos(yaw)*1.1]
        }else{desired=[p.x+14,19,p.z+14];target=[p.x,0.25,p.z]}
        cameraPosition+=(desired-cameraPosition)*min(1,delta*(third ? 12:9))
        if third {
            let offset=Point(x:cameraPosition.x-p.x,z:cameraPosition.z-p.z),clearance=world.grid.cameraClearance(from:p,direction:offset,maximum:offset.length,flags:world.save.flags)
            if clearance<offset.length-0.2 {let safe=p+offset.normalized*clearance;cameraPosition.x=safe.x;cameraPosition.z=safe.z;cameraPosition.y=max(cameraPosition.y,3.4)}
        }
        let vibration=SIMD3(sin(time*87)*shake,sin(time*113)*shake*0.65,cos(time*79)*shake)*0.25
        camera.look(at:target,from:cameraPosition+vibration,relativeTo:nil)
        heroLight.position=[p.x,2.2,p.z];heroLight.light.intensity=third ? (world.save.keyItems.contains("candle") ? 550:250):80
        moon.light.intensity=third ? 1050:3600;fill.light.intensity=third ? 430:1100
        if reduced != lowPower{reduced=lowPower;moon.shadow=lowPower ? nil:DirectionalLightComponent.Shadow(maximumDistance:24,depthBias:1.5)}
        kick*=0.8;shake=max(0,shake-delta)
        ink.update(camera:camera.transform.matrix,thirdPerson:third,reduced:lowPower,time:time)
    }
    private func thirdPersonCameraPosition(_ world:GameWorld,at p:Point)->SIMD3<Float> {
        let yaw=world.cameraYaw,offset=Point(x:-sin(yaw),z:-cos(yaw));var distance=world.grid.cameraClearance(from:p,direction:offset,maximum:4.2,flags:world.save.flags)
        while distance>0.3 {
            let behind=p+offset*(distance+0.3),outsideArena=world.save.area == .boss && behind.distance(Point(x:24,z:24))>10.5
            if !outsideArena && world.grid.visible(p,behind,flags:world.save.flags){break};distance-=0.2
        }
        let elevated:Float=distance<3 ? (3-distance)*0.35:0
        return [p.x+offset.x*distance,1.8+distance*sin(world.cameraPitch)+elevated,p.z+offset.z*distance]
    }
    private func updateLights(_ p:Point,third:Bool){
        let anchors=lampAnchors.sorted{Point(x:$0.position[0],z:$0.position[2]).distance(p)<Point(x:$1.position[0],z:$1.position[2]).distance(p)}
        for(i,light)in lamps.enumerated(){
            guard anchors.indices.contains(i)else{light.light.intensity=0;continue}
            let a=anchors[i];light.position=SIMD3(a.position[0],a.position[1],a.position[2])
            light.light.color=UIColor(red:CGFloat((a.color>>16)&255)/255,green:CGFloat((a.color>>8)&255)/255,blue:CGFloat(a.color&255)/255,alpha:1)
            let distance=simd_distance(light.position,SIMD3(p.x,1,p.z));light.light.intensity=distance<20 ? (third ? 230:130)*(0.92+sin(time*7+Float(i))*0.08):0
        }
    }
    private func burst(_ position:Point,color:UIColor,count:Int){
        let available=min(count,max(0,90-particles.count))
        for i in 0..<available{
            let angle=Float(i)*2.399+time*11,speed=Float(i%4+1)*0.6
            let entity=ModelEntity(mesh:.generateSphere(radius:i%3==0 ? 0.055:0.025),materials:[glow(color)])
            entity.position=[position.x,1+Float(i%3)*0.15,position.z];effects.addChild(entity)
            particles.append(Particle(entity:entity,velocity:[sin(angle)*speed,0.7+Float(i%3)*0.3,cos(angle)*speed],remaining:0.3+Float(i%4)*0.1,total:0.6))
        }
    }
    private func updateTrail(_ world:GameWorld,delta:Float){
        for i in trailPoints.indices{trailPoints[i].2-=delta};trailPoints.removeAll{$0.2<=0}
        if world.hero.active,let blade=player.blade{
            trailPoints.append((blade.convert(position:[0,0,-0.25],to:root),blade.convert(position:[0,0,0.35],to:root),0.14))
        }
        guard trailPoints.count>1 else{trail.isEnabled=false;return}
        var positions:[SIMD3<Float>]=[],indices:[UInt32]=[]
        for p in trailPoints{positions+=[p.0,p.1]}
        for i in 0..<trailPoints.count-1{let n=UInt32(i*2);indices += [n,n+1,n+2,n+1,n+3,n+2]}
        var d=MeshDescriptor();d.positions=MeshBuffers.Positions(positions);d.primitives = .triangles(indices)
        if let mesh=try? MeshResource.generate(from:[d]){
            let color:UIColor=world.hero.state=="counter" ? .init(red:1,green:0.75,blue:0.3,alpha:1):world.hero.state=="strong" ? .init(red:0.9,green:0.17,blue:0.08,alpha:1):.init(red:0.9,green:0.88,blue:0.8,alpha:1)
            trail.model=ModelComponent(mesh:mesh,materials:[glow(color,opacity:0.7)]);trail.isEnabled=true
        }
    }
    private func ring(radius:Float,width:Float)throws->MeshResource{
        var p:[SIMD3<Float>]=[],indices:[UInt32]=[]
        for i in 0...48{let a=Float(i)/48 * .pi*2;for r in [radius-width,radius+width]{p.append([sin(a)*r,0,cos(a)*r])}}
        for i in 0..<48{let n=UInt32(i*2);indices += [n,n+1,n+2,n+1,n+3,n+2]}
        var d=MeshDescriptor();d.positions=MeshBuffers.Positions(p);d.primitives = .triangles(indices);return try MeshResource.generate(from:[d])
    }
    private func sector(radius:Float,angle:Float)throws->MeshResource{
        var p:[SIMD3<Float>]=[[0,0,0]],indices:[UInt32]=[]
        for i in 0...32{let a = -angle+Float(i)/32*angle*2;p.append([sin(a)*radius,0,cos(a)*radius])}
        for i in 1...32{indices += [0,UInt32(i),UInt32(i+1)]}
        var d=MeshDescriptor();d.positions=MeshBuffers.Positions(p);d.primitives = .triangles(indices);return try MeshResource.generate(from:[d])
    }
}
