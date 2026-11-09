import Foundation

enum Panel: Equatable { case none, pause, map, shop, inn, message([String]), death, complete }
struct Interaction: Equatable {
    var kind:String; var x:Int; var y:Int; var label:String
}

final class GameWorld {
    let content:Content
    var save:SaveState
    private(set) var safeSave:SaveState
    private(set) var grid:Grid
    var hero:HeroCombat
    var fatigue=Fatigue()
    var enemies:[Enemy]=[]
    var projectiles:[Projectile]=[]
    var events:[GameEvent]=[]
    var panel:Panel = .none
    var prompt:Interaction?
    var toast=""
    var toastTicks=0
    var cameraYaw:Float = .pi
    var cameraPitch:Float = 0.3
    var targetID:String?
    var sceneRevision=0
    var saveRevision=0
    var combatActive=false
    private var encounter:String?
    private var wave=0
    private var projectileID=0
    private var hitStop=0
    private var slowTicks=0
    private var manualCamera=0
    private var fogTick=0
    private var areaTick=0
    private var battleSnapshot:SaveState?
    private var lastMotion=Point()

    init(content:Content,save:SaveState = SaveState()) {
        self.content=content;self.save=save;self.safeSave=save
        self.grid=Grid(area:save.area,rows:content.rows(save.area));self.hero=HeroCombat(timings:content.timing)
        loadArea()
    }
    var snapshot:SaveState { battleSnapshot ?? safeSave }
    var playing:Bool { panel == .none && save.life>0 }
    var boss:Enemy? { enemies.first{$0.kind == "rotroot" && $0.alive} }
    func event(_ kind:String,_ at:Point? = nil) { events.append(GameEvent(kind:kind,position:at ?? save.position)) }
    func say(_ text:String) { toast=text;toastTicks=180 }
    func pause() { if panel == .none { panel = .pause }; checkpointSafe() }

    func loadArea() {
        grid=Grid(area:save.area,rows:content.rows(save.area))
        if !grid.canStand(save.position,flags:save.flags) {
            save.position=grid.find("@") ?? grid.find("P") ?? Point(x:39,z:153)
        }
        enemies=[];projectiles=[];encounter=nil;wave=0;areaTick=0;targetID=nil;combatActive=false;battleSnapshot=nil
        hero=HeroCombat(timings:content.timing);fatigue=Fatigue();cameraYaw = .pi;cameraPitch=0.3;sceneRevision+=1
        if save.area == .road {
            let kinds:[Character:String]=["g":"ghoul","h":"hopper","w":"wisp","c":"crow"]
            for y in 0..<grid.height {for x in 0..<grid.width {
                if let kind=kinds[grid.char(x,y)] {spawn(kind,id:grid.key(x,y),at:grid.center(x,y))}
            }}
        } else if save.area == .world {
            for (i,s) in content.spirits.enumerated() {
                spawn(i%2 == 0 ? "ghoul":"wisp",id:"world:spirit:\(i)",at:Point(x:Float(s.x*6+3),z:Float(s.y*6+3)))
            }
        } else if save.area == .boss {
            spawn("rotroot",id:"boss:rotroot",at:Point(x:24,z:21)); battleSnapshot=save
        }
        reveal();safeSave=save
    }
    func spawn(_ kind:String,id:String,at p:Point) {
        guard !save.flags.contains("dead:"+id) else {return}
        let hp = max(1,((kind == "rotroot" ? 40 : content.foes[kind]?.hp ?? 4)*save.difficulty.toughness).rounded())
        var enemy=Enemy(id:id,kind:kind,position:p,hp:hp,maxHP:hp)
        if let timing=content.enemyAttack[kind]{enemy.attackStart=timing.active[0];enemy.attackEnd=timing.active[1];enemy.attackDuration=timing.len}
        enemies.append(enemy)
    }
    func travel(_ area:Area,to position:Point? = nil) {
        checkpointSafe()
        save.area=area
        let next=Grid(area:area,rows:content.rows(area))
        save.position=position ?? (area == .boss ? Point(x:24,z:32):next.find("P") ?? next.find("@") ?? Point(x:39,z:153))
        save.yaw = .pi
        if area != .boss { save.checkpoint=Checkpoint(area:area,position:save.position) }
        panel = .none;loadArea();safeSave=save;saveRevision+=1;event("travel")
    }
    func checkpointSafe() {
        if battleSnapshot == nil && save.life>0 {
            safeSave=save;saveRevision+=1
        }
    }
    func respawn() {
        save.deaths+=1;save.gold/=2;save.life=save.maxLife
        save.area=save.checkpoint.area;save.position=save.checkpoint.position
        panel = .none;loadArea();safeSave=save;saveRevision+=1;event("heal")
    }
    func update(_ input:InputFrame) {
        guard playing else {return}
        save.playTicks+=1;areaTick+=1
        if toastTicks>0 {toastTicks-=1}
        if hitStop>0 {hitStop-=1;hero.buffer(input);return}
        if slowTicks>0 {slowTicks-=1;if slowTicks%2==0{return}}
        let wasCombat=combatActive
        combatActive = save.area == .boss || enemies.contains{$0.alive && $0.position.distance(save.position)<10 && grid.visible(save.position,$0.position,flags:save.flags)}
        if combatActive && !wasCombat && battleSnapshot == nil {battleSnapshot=safeSave;saveRevision+=1}
        if !combatActive && wasCombat {battleSnapshot=nil;checkpointSafe()}
        updateTarget()
        if input.look.length>0.001 {
            cameraYaw-=input.look.x;cameraPitch=clamp(cameraPitch+input.look.z,-0.15,0.7);manualCamera=180
        } else if manualCamera>0 {manualCamera-=1}
        let cam=save.area.thirdPerson ? cameraYaw : -Float.pi*0.75
        let move=Point(x:-cos(cam)*input.move.x+sin(cam)*input.move.z,z:sin(cam)*input.move.x+cos(cam)*input.move.z)
        hero.update(input)
        if hero.canMove && move.length>0.1 {save.yaw=atan2(move.x,move.z)}
        if let target=enemies.first(where:{$0.id==targetID}), (hero.state.hasPrefix("atk") || ["strong","counter","guard"].contains(hero.state)) {
            if hero.tick < (hero.timing?.active?.first ?? 1000) {save.yaw+=wrapped(atan2(target.position.x-save.position.x,target.position.z-save.position.z)-save.yaw)*0.3}
        }
        let running=input.move.length>0.78 && !fatigue.exhausted && hero.canMove && hero.state != "guard"
        fatigue.tick(running:running,rate:save.difficulty.tire)
        var delta=Point()
        if hero.canMove {
            let speed:Float = hero.state == "guard" ? 1.8 : running ? 6.3 : 4.2
            delta=move*speed/60
        }
        if hero.lunge>0 {
            if hero.state=="dodge" && hero.tick<2 && move.length>0.1 {save.yaw=atan2(move.x,move.z)}
            delta=Point(x:sin(save.yaw),z:cos(save.yaw))*hero.lunge/60
        }
        let previous=save.position
        save.position=grid.move(save.position,by:delta,flags:save.flags)
        if save.area == .boss {
            let center=Point(x:24,z:24),offset=save.position-center
            if offset.length>10.6 {save.position=center+offset.normalized*10.6}
        }
        if let boss, save.position.distance(boss.position)<1.8 {
            save.position=boss.position+(save.position-boss.position).normalized*1.8
        }
        lastMotion=save.position-previous
        if hero.tick==1 && hero.state == "dodge" {event("dodge")}
        if hero.tick==hero.timing?.active?.first {event(hero.state == "strong" ? "strong":"swing")}
        if hero.state == "use" && hero.tick==17 {useItem()}
        if input.pressed.contains(.cycle) {
            let ids=["herb","talisman","elixir"];let i=ids.firstIndex(of:save.selectedItem) ?? 0;save.selectedItem=ids[(i+1)%ids.count]
        }
        if hero.active {strike()}
        updateEnemies();updateProjectiles()
        if save.life<=0 {hero.enter("die");panel = .death;event("death");return}
        if save.area.thirdPerson && manualCamera==0 {
            if let target=enemies.first(where:{$0.id==targetID}) {
                let a=atan2(target.position.x-save.position.x,target.position.z-save.position.z)
                cameraYaw+=wrapped(a-cameraYaw)*0.018
            } else if move.length>0.2 && abs(wrapped(save.yaw-cameraYaw)) < .pi/2 {
                cameraYaw+=wrapped(save.yaw-cameraYaw)*0.015
            }
        }
        fogTick+=1;if fogTick>=15 {fogTick=0;reveal()}
        findPrompt()
        if input.pressed.contains(.interact) {interact()}
        triggerEncounters()
        if areaTick%180==0 && !combatActive {checkpointSafe()}
    }
    func reveal() {
        let (cx,cy)=grid.tile(save.position),r=save.area.thirdPerson ? 3 : 6
        for y in max(0,cy-r)...min(grid.height-1,cy+r) {for x in max(0,cx-r)...min(grid.width-1,cx+r) where (x-cx)*(x-cx)+(y-cy)*(y-cy)<=r*r {
            save.visited.insert(grid.key(x,y))
        }}
    }
    func updateTarget() {
        if let old=enemies.first(where:{$0.id==targetID}),old.alive,old.position.distance(save.position)<12,grid.visible(save.position,old.position,flags:save.flags) {return}
        targetID=enemies.filter{$0.alive && $0.position.distance(save.position)<12 && grid.visible(save.position,$0.position,flags:save.flags)}.min{
            targetScore($0)<targetScore($1)
        }?.id
    }
    private func targetScore(_ enemy:Enemy)->Float {
        let d=enemy.position-save.position
        return d.length+abs(wrapped(atan2(d.x,d.z)-save.yaw))*2
    }
    private func strike() {
        for i in enemies.indices where enemies[i].alive && enemies[i].lastSwing != hero.swing {
            let d=enemies[i].position-save.position
            let reach:Float = enemies[i].kind == "rotroot" ? 3.6 : 2.7
            let multiplier:Float=enemies[i].state=="stagger" && enemies[i].kind=="rotroot" ? 1.5:1
            if enemies[i].kind=="rotroot",d.length>=reach,enemies[i].state=="attack",enemies[i].attackKind==0,enemies[i].tick>enemies[i].attackEnd {
                let root=enemies[i].position+enemies[i].aim*4.6,offset=root-save.position
                if offset.length<2.7 && abs(wrapped(atan2(offset.x,offset.z)-save.yaw))<1.3 {
                    enemies[i].lastSwing=hero.swing;damageEnemy(i,damage:save.swordDamage*hero.power*1.5,stagger:hero.state=="counter");continue
                }
            }
            if d.length<reach && abs(wrapped(atan2(d.x,d.z)-save.yaw))<1.3 && grid.visible(save.position,enemies[i].position,flags:save.flags) {
                enemies[i].lastSwing=hero.swing
                damageEnemy(i,damage:save.swordDamage*hero.power*multiplier,stagger:hero.state == "counter")
            }
        }
        let (cx,cy)=grid.tile(save.position)
        for y in cy-1...cy+1 {for x in cx-1...cx+1 where "BJ".contains(grid.char(x,y)) && !save.flags.contains("open:"+grid.key(x,y)) {
            let d=grid.center(x,y)-save.position
            if d.length<grid.cell*0.75+1.8 && abs(wrapped(atan2(d.x,d.z)-save.yaw))<1.2 {
                save.flags.insert("open:"+grid.key(x,y));sceneRevision+=1;event("break")
                if grid.char(x,y)=="J" {save.gold+=8;say("FOUND GOLD")}
            }
        }}
    }
    private func damageEnemy(_ i:Int,damage:Float,stagger:Bool = false) {
        enemies[i].hp=max(0,enemies[i].hp-damage)
        event("hit",enemies[i].position);hitStop=hero.state=="strong" ? 5 : 2
        if !enemies[i].alive {
            enemies[i].state="die";enemies[i].tick=0
            save.flags.insert("dead:"+enemies[i].id)
            save.weaponExp+=content.foes[enemies[i].kind]?.souls ?? 15
            save.gold+=enemies[i].kind == "rotroot" ? 100 : 3
            if save.weaponExp%8<3 {save.items["herb",default:0]+=1}
            event("soul",enemies[i].position)
            if enemies[i].kind == "rotroot" {
                save.keyItems.insert("mirror");save.completed=true;save.life=save.maxLife
                save.area = .dungeon;save.position=save.checkpoint.position
                save.checkpoint=Checkpoint(area:.dungeon,position:save.position)
                battleSnapshot=nil;safeSave=save;saveRevision+=1;panel = .complete;event("victory")
            }
        } else if enemies[i].kind != "rotroot" || stagger {
            enemies[i].state=stagger ? "stagger":"hurt";enemies[i].tick=0
            if enemies[i].kind != "rotroot" {
                let d=(enemies[i].position-save.position).normalized*0.35
                enemies[i].position=grid.move(enemies[i].position,by:d,flags:save.flags)
            }
        }
    }
    private func hurt(_ damage:Float,from p:Point,enemyIndex:Int? = nil,parryable:Bool=true) {
        let d=p-save.position
        let result=hero.hit(front:abs(wrapped(atan2(d.x,d.z)-save.yaw))<1.3,parryable:parryable)
        if result == "parried" {
            event("parry");slowTicks=24
            if let i=enemyIndex {enemies[i].state="stagger";enemies[i].tick=0}
        } else if result == "guarded" {event("guard")}
        else if result == "hit" {
            save.life=max(0,save.life-max(1,(damage*save.difficulty.damage).rounded()));event("hurt")
            save.position=grid.move(save.position,by:(save.position-p).normalized*0.45,flags:save.flags)
        }
    }
    private func updateEnemies() {
        for i in enemies.indices {
            enemies[i].tick+=1
            if !enemies[i].alive {continue}
            let d=save.position-enemies[i].position,dist=d.length
            let boss=enemies[i].kind == "rotroot"
            let spec=content.foes[enemies[i].kind] ?? content.foes["ghoul"]!
            if enemies[i].state=="hurt" || enemies[i].state=="stagger" {
                if enemies[i].tick>(enemies[i].state=="stagger" ? (boss ? 120:60):21) {enemies[i].state="idle";enemies[i].tick=0}
                continue
            }
            if enemies[i].state=="attack" {
                let active=enemies[i].attackStart,t=enemies[i].tick
                if t>=active && t<enemies[i].attackEnd && !enemies[i].dealt {
                    if boss {
                        let arc=abs(wrapped(atan2(d.x,d.z)-enemies[i].yaw))
                        if dist < (enemies[i].attackKind==0 ? 6:5.5) && arc < (enemies[i].attackKind==0 ? 0.45:2.6) {
                            enemies[i].dealt=true;hurt(enemies[i].attackKind==0 ? 3:2,from:enemies[i].position,enemyIndex:i,parryable:enemies[i].attackKind==1)
                        }
                        if t==active && enemies[i].attackKind==0 {event("slam",enemies[i].position+enemies[i].aim*4)}
                    } else if dist<spec.reach+0.4 && abs(wrapped(atan2(d.x,d.z)-enemies[i].yaw))<spec.arc && grid.visible(enemies[i].position,save.position,flags:save.flags) {
                        enemies[i].dealt=true
                        hurt(spec.damage,from:enemies[i].position,enemyIndex:i)
                    }
                }
                if !boss {
                    let lock=enemies[i].kind=="crow" ? 33:enemies[i].kind=="hopper" ? 27:enemies[i].kind=="ghoul" ? active-6:active
                    if t<lock {enemies[i].yaw+=clamp(wrapped(atan2(d.x,d.z)-enemies[i].yaw),-0.06,0.06);enemies[i].aim=Point(x:sin(enemies[i].yaw),z:cos(enemies[i].yaw))}
                    if t>=lock && t<enemies[i].attackEnd {
                        let speed:Float=enemies[i].kind=="ghoul" ? 1.8:enemies[i].kind=="hopper" ? 6.5:enemies[i].kind=="wisp" ? 9:8
                        enemies[i].position=grid.move(enemies[i].position,by:enemies[i].aim*speed/60,radius:spec.radius,flags:save.flags)
                    }
                }
                if t>=enemies[i].attackDuration {enemies[i].state="idle";enemies[i].cooldown=boss ? (enemies[i].hp<enemies[i].maxHP/2 ? 50:80):spec.cooldown;enemies[i].tick=0}
                continue
            }
            enemies[i].cooldown=max(0,enemies[i].cooldown-1)
            if !boss && (dist>spec.sight || !grid.visible(enemies[i].position,save.position,flags:save.flags)) {enemies[i].state="idle";continue}
            enemies[i].yaw+=clamp(wrapped(atan2(d.x,d.z)-enemies[i].yaw),-0.08,0.08)
            let range:Float = boss ? 12 : spec.range
            if dist<range && enemies[i].cooldown==0 {
                enemies[i].state="attack";enemies[i].tick=0;enemies[i].aim=d.normalized;enemies[i].dealt=false
                if boss {
                    enemies[i].attackKind=dist<3.6 ? 1:(areaTick/60)%2
                    enemies[i].attackStart=enemies[i].attackKind==0 ? 48:40;enemies[i].attackEnd=enemies[i].attackKind==0 ? 57:60;enemies[i].attackDuration=enemies[i].attackKind==0 ? 108:96
                    enemies[i].yaw=atan2(d.x,d.z)
                }
                event("warning",enemies[i].position)
            } else if !boss {
                enemies[i].state="chase"
                var motion=Point()
                switch enemies[i].kind {
                case "hopper":if (enemies[i].tick%36)>=7 && (enemies[i].tick%36)<29 && dist>1.2 {motion=d.normalized*spec.speed*1.6/60}
                case "wisp":
                    let radial:Float=dist>5.5 ? 1:dist<3.5 ? -1:0
                    motion=(d.normalized*radial+Point(x:cos(enemies[i].yaw),z:-sin(enemies[i].yaw))*0.5)*spec.speed/60
                case "crow":
                    let tangent=Point(x:cos(enemies[i].yaw),z:-sin(enemies[i].yaw))*spec.speed
                    motion=(d.normalized*((dist-4.5)*0.8)+tangent).normalized*spec.speed/60
                default:if dist>spec.range*0.8 {motion=Point(x:sin(enemies[i].yaw),z:cos(enemies[i].yaw))*spec.speed/60}
                }
                enemies[i].position=grid.move(enemies[i].position,by:motion,radius:spec.radius,flags:save.flags)
            }
        }
    }
    private func updateProjectiles() {
        for i in projectiles.indices {
            projectiles[i].life-=1
            let p=projectiles[i].position+projectiles[i].velocity/60
            if !grid.visible(projectiles[i].position,p,flags:save.flags) {projectiles[i].life=0}
            projectiles[i].position=p
            if projectiles[i].friendly {
                for e in enemies.indices where enemies[e].alive && !projectiles[i].hit.contains(enemies[e].id) && enemies[e].position.distance(p)<(enemies[e].kind == "rotroot" ? 2 : 0.8) {
                    projectiles[i].hit.insert(enemies[e].id);damageEnemy(e,damage:5)
                }
            } else if p.distance(save.position)<0.6 {hurt(2,from:p-projectiles[i].velocity);projectiles[i].life=0}
        }
        projectiles.removeAll{$0.life<=0}
    }
    func useItem() {
        let id=save.selectedItem
        guard save.items[id,default:0]>0 else {say("NO ITEMS LEFT");return}
        if id != "talisman" && save.life>=save.maxLife {say("LIFE IS FULL");return}
        save.items[id,default:0]-=1
        if id=="talisman" {
            projectileID+=1
            projectiles.append(Projectile(id:projectileID,position:save.position,velocity:Point(x:sin(save.yaw),z:cos(save.yaw))*12,life:100,friendly:true));event("throw")
        } else {save.life=min(save.maxLife,save.life+(id=="herb" ? 6 : save.maxLife));event("heal")}
    }
    func buy(_ index:Int) {
        guard content.town.shop.indices.contains(index) else {return}
        let item=content.town.shop[index]
        guard save.gold>=item.price else {say("NOT ENOUGH GOLD");event("cancel");return}
        save.gold-=item.price;save.items[item.item,default:0]+=item.n
        checkpointSafe();event("coin")
    }
    func rest() {
        guard save.gold>=content.town.inn else {say("NOT ENOUGH GOLD");return}
        save.gold-=content.town.inn;save.life=save.maxLife;fatigue=Fatigue()
        save.checkpoint=Checkpoint(area:save.area,position:save.position);checkpointSafe();panel = .none;event("heal")
    }
    private func triggerEncounters() {
        guard save.area == .dungeon, panel == .none else {return}
        if let current=encounter {
            if !enemies.contains(where:{$0.alive}) {
                let waves=content.encounters[current] ?? []
                wave+=1
                if wave<waves.count {spawnWave(waves[wave],current)}
                else {save.flags.insert("encounter:"+current);encounter=nil;battleSnapshot=nil;combatActive=false;checkpointSafe();say("THE SPIRITS REST")}
            }
            return
        }
        let (x,y)=grid.tile(save.position),key="\(x),\(y)"
        if let group=content.dungeon.encounters[key], !save.flags.contains("encounter:"+group) {
            battleSnapshot=safeSave;encounter=group;wave=0
            spawnWave(content.encounters[group]?.first ?? [],group);combatActive=true;saveRevision+=1
        }
        if let hidden=content.dungeon.hidden[key],!save.flags.contains("hidden:"+key) {
            save.flags.insert("hidden:"+key);grant(hidden);checkpointSafe()
        }
    }
    private func spawnWave(_ kinds:[String],_ group:String) {
        for (i,kind) in kinds.enumerated() {
            let a=Float(i)*2.1
            var p=save.position+Point(x:sin(a)*3,z:cos(a)*3)
            if !grid.canStand(p,flags:save.flags) {p=save.position+Point(x:0.5,z:0.5)}
            spawn(kind,id:"\(group):\(wave):\(i)",at:p)
        }
    }
    func grant(_ loot:Loot) {
        switch loot.kind {
        case "gold":save.gold+=loot.n ?? 0
        case "item":save.items[loot.id ?? "herb",default:0]+=loot.n ?? 1
        case "keyItem":save.keyItems.insert(loot.id ?? "compass")
        case "vessel":save.maxLife+=4;save.life=save.maxLife
        default:break
        }
        say(loot.id?.uppercased() ?? (loot.kind == "vessel" ? "LIFE INCREASED" : "FOUND GOLD"));event("pickup")
    }
    func findPrompt() {
        prompt=nil
        if combatActive && save.area != .dungeon {return}
        let (cx,cy)=grid.tile(save.position)
        var best:Float=grid.cell*0.72+1.2
        for y in cy-2...cy+2 {for x in cx-2...cx+2 {
            let ch=grid.char(x,y),d=save.position.distance(grid.center(x,y))
            guard d<best else {continue}
            var kind="",label="EXAMINE"
            if save.area == .world {
                if ch=="V" {kind="village";label="ENTER VILLAGE"}
                if ch=="1" {kind="road";label="ROTWOOD ROAD"}
                if ch=="S" {kind="shrine";label="REST"}
                if "abc234v".contains(ch) {kind="later";label="EXAMINE"}
            } else if save.area == .village {
                if ch=="N" {kind="npc";label="TALK"}
                if ch=="X" {kind="exitVillage";label="LEAVE VILLAGE"}
            } else if save.area == .road {
                if ch=="G" {kind="dungeon";label="ENTER GROTTO"}
                if ch=="X" {kind="exitRoad";label="HAIYA PLAINS"}
            } else if save.area == .dungeon {
                if ch=="C" && !save.flags.contains("chest:\(x),\(y)") {kind="chest";label="OPEN CHEST"}
                if ch=="D" && !save.flags.contains("open:"+grid.key(x,y)) {kind="door";label="OPEN DOOR"}
                if ch=="B" && !save.flags.contains("open:"+grid.key(x,y)) {kind="boards";label="BREAK THE BOARDS"}
                if ch=="T" {kind="tablet"}
                if ch=="X" {kind="exitDungeon";label="LEAVE GROTTO"}
                if ch=="K" {kind="boss";label="FACE THE GUARDIAN"}
            }
            if !kind.isEmpty {best=d;prompt=Interaction(kind:kind,x:x,y:y,label:label)}
        }}
    }
    func interact() {
        guard let p=prompt else {return}
        let key="\(p.x),\(p.y)"
        switch p.kind {
        case "village":travel(.village)
        case "road":travel(.road)
        case "dungeon":save.flags.insert("road:cleared");travel(.dungeon)
        case "exitVillage":travel(.world,to:Point(x:99,z:147))
        case "exitRoad","exitDungeon":travel(.world,to:Point(x:21,z:99))
        case "door":save.flags.insert("open:"+grid.key(p.x,p.y));sceneRevision+=1;event("door");checkpointSafe()
        case "boards":say("STRIKE THE CRACKED BOARDS")
        case "chest":
            if let loot=content.dungeon.chests[key] {save.flags.insert("chest:"+key);grant(loot);sceneRevision+=1;checkpointSafe()}
        case "tablet":panel = .message([content.dungeon.tablets[key] ?? "THE WALL IS SILENT."])
        case "shrine":save.life=save.maxLife;save.checkpoint=Checkpoint(area:save.area,position:save.position);checkpointSafe();event("heal");say("YOUR PATH IS RECORDED")
        case "npc":
            if let npc=content.village.villagers.first(where:{$0.x==p.x && $0.y==p.y}) {
                if npc.role=="shop" {panel = .shop}
                else if npc.role=="inn" {panel = .inn}
                else {panel = .message(npc.lines.compactMap{content.town.talk.indices.contains($0) ? content.town.talk[$0]:nil})}
            }
        case "boss":
            if save.completed {say("THE GUARDIAN IS AT REST")}
            else {save.checkpoint=Checkpoint(area:.dungeon,position:save.position);checkpointSafe();travel(.boss)}
        default:panel = .message(["THE REST OF THE JOURNEY LIES BEYOND CHAPTER ONE."])
        }
    }
}
