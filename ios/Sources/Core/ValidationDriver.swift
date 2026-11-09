import Foundation

/// Debug-only callers drive the real input/update path; no teleport, damage or inventory overrides.
final class ValidationDriver {
    private(set) var stage=0
    private(set) var ticks=0
    private(set) var completions=0
    private(set) var milestones:[String]=[]
    private var route:[Point]=[]
    private var routeTarget=Point(x:-1,z:-1)
    private var routeArea:Area?
    private var panelTicks=0
    private let loops:Bool
    private let started=Date()
    init(loop:Bool=false) {loops=loop}
    var shouldRestart:Bool {loops && completions>0 && panelTicks>120 && Date().timeIntervalSince(started)<1200}
    var report:[String:Any] { ["stage":stage,"inputTicks":ticks,"completions":completions,"milestones":milestones,"wallSeconds":Date().timeIntervalSince(started)] }
    func restart() {stage=0;route=[];routeArea=nil;panelTicks=0}
    func observe(_ world:GameWorld) {
        if world.panel == .complete {
            if panelTicks==0 {completions+=1;milestones.append("chapter-complete")}
            panelTicks+=1
        } else if world.panel == .death {world.respawn();route=[];milestones.append("respawn")}
        else if case .message = world.panel {world.panel = .none;advance("dialogue")}
        else if world.panel == .shop {world.buy(0);world.panel = .none;advance("shop")}
        else if world.panel == .inn {world.rest();world.panel = .none;advance("inn")}
    }
    private func advance(_ name:String) {stage+=1;route=[];milestones.append(name)}
    func input(_ world:GameWorld)->InputFrame {
        ticks+=1
        if world.panel != .none {return InputFrame()}
        if let enemy=world.enemies.filter({$0.alive && $0.position.distance(world.save.position)<13 && world.grid.visible(world.save.position,$0.position,flags:world.save.flags)}).min(by:{$0.position.distance(world.save.position)<$1.position.distance(world.save.position)}) {
            return fight(world,enemy)
        }
        if world.save.area == .boss {
            return world.boss.map { navigate(world,to:$0.position,interact:false) } ?? InputFrame()
        }
        var goal:Point?
        var expected=""
        switch stage {
        case 0:
            if world.save.area == .village {advance("entered-village");return input(world)}
            goal=world.grid.find("V");expected="village"
        case 1:goal=world.grid.center(12,7);expected="npc"
        case 2:goal=world.grid.center(23,9);expected="npc"
        case 3:goal=world.grid.center(6,10);expected="npc"
        case 4:
            if world.save.area == .world {advance("left-village");return input(world)}
            goal=world.grid.find("X");expected="exitVillage"
        case 5:
            if world.save.area == .road {advance("entered-road");return input(world)}
            goal=world.grid.find("1");expected="road"
        case 6:
            if world.save.area == .dungeon {advance("entered-grotto");return input(world)}
            goal=world.grid.find("G");expected="dungeon"
        case 7:
            if world.save.keyItems.contains("map_d1") {advance("map-found");return input(world)}
            goal=world.grid.center(11,11);expected="chest"
        case 8:
            if world.save.keyItems.contains("compass") {advance("compass-found");return input(world)}
            goal=world.grid.center(3,9);expected="chest"
        case 9:
            if world.save.keyItems.contains("candle") {advance("candle-found");return input(world)}
            goal=world.grid.center(1,1);expected="chest"
        default:goal=world.grid.find("K");expected="boss"
        }
        guard let goal else{return InputFrame()}
        if let prompt=world.prompt,prompt.kind==expected,world.grid.center(prompt.x,prompt.y).distance(goal)<0.2 {
            return InputFrame(pressed:[.interact])
        }
        return navigate(world,to:goal)
    }
    private func fight(_ world:GameWorld,_ enemy:Enemy)->InputFrame {
        var input=InputFrame()
        let distance=world.save.position.distance(enemy.position),boss=enemy.kind=="rotroot"
        let strike=enemy.attackStart
        let imminent=enemy.state=="attack" && enemy.tick>strike-15 && enemy.tick<=strike+5
        if imminent {
            if enemy.tick>=strike-5 {input.held.insert(.guardAction)}
            if world.hero.timing != nil && world.hero.state != "guardHit" && world.hero.state != "dodge" && enemy.tick==strike-9 {input.pressed.insert(.dodge)}
        } else if world.save.life<world.save.maxLife*0.55 && world.save.items["herb",default:0]>0 && world.hero.canMove {
            world.save.selectedItem="herb";input.pressed.insert(.item)
        } else if distance<(boss ? 3.3:2.5) {
            if ticks%9==0 && (enemy.state != "attack" || enemy.tick<8 || enemy.tick>strike+4) {input.pressed.insert(world.hero.counter>0 ? .attack:.attack)}
        } else {input=navigate(world,to:enemy.position,interact:false)}
        return input
    }
    private func navigate(_ world:GameWorld,to target:Point,interact:Bool=true)->InputFrame {
        let g=world.grid
        var planning=world.save.flags
        for y in 0..<g.height {for x in 0..<g.width where g.area == .dungeon && "DB".contains(g.char(x,y)) {planning.insert("open:"+g.key(x,y))}}
        if route.isEmpty || routeArea != g.area || routeTarget.distance(target)>g.cell || ticks%45==0 {
            routeArea=g.area;routeTarget=target
            let (tx,ty)=g.tile(target)
            let candidates=g.blocked(tx,ty,flags:planning) ? [(tx-1,ty),(tx+1,ty),(tx,ty-1),(tx,ty+1)].map{g.center($0.0,$0.1)}:[target]
            route=candidates.compactMap{g.path(from:world.save.position,to:$0,flags:planning)}.min(by:{$0.count<$1.count}) ?? []
        }
        while let first=route.first,first.distance(world.save.position)<0.45 {route.removeFirst()}
        let desired=route.first ?? target
        let direction=(desired-world.save.position).normalized
        let yaw=g.area.thirdPerson ? world.cameraYaw:-Float.pi*0.75
        var input=InputFrame(move:Point(x:-cos(yaw)*direction.x+sin(yaw)*direction.z,z:sin(yaw)*direction.x+cos(yaw)*direction.z))
        if interact,let p=world.prompt {
            if p.kind=="door" {input.pressed.insert(.interact)}
            if p.kind=="boards" && ticks%12==0 {input.pressed.insert(.attack)}
        }
        return input
    }
}
