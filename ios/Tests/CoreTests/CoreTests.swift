import Testing
import Foundation
@testable import LabyrinthCore

private func content() throws -> Content {
    let root=URL(fileURLWithPath:#filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    return try Content.load(root.appendingPathComponent("Resources/Generated/chapter.json"))
}
@Test func combatTimingAndParry() throws {
    var h=HeroCombat(timings:try content().timing)
    h.update(InputFrame(pressed:[.attack]));#expect(h.state=="atk1")
    for _ in 0..<7 {h.update(InputFrame())};#expect(h.active)
    h.update(InputFrame(pressed:[.dodge]))
    for _ in 0..<6 {h.update(InputFrame())};#expect(h.state=="dodge")
    h=HeroCombat(timings:try content().timing);h.update(InputFrame(held:[.guardAction]));#expect(h.hit(front:true)=="parried")
    h.update(InputFrame(pressed:[.attack]));#expect(h.state=="counter")
    h=HeroCombat(timings:try content().timing);h.enter("guardHit")
    for _ in 0..<18 {h.update(InputFrame(held:[.guardAction]))};#expect(h.hit(front:true)=="guarded")
}
@Test func fatigueAndTouchCancellation() {
    var f=Fatigue()
    for _ in 0..<481 {f.tick(running:true,rate:1)};#expect(f.exhausted)
    for _ in 0..<210 {f.tick(running:false,rate:1)};#expect(!f.exhausted)
    var t=TouchState();t.move=Point(x:1,z:0);t.down(1,action:.guardAction);t.down(2,action:.attack)
    let input=t.sample();#expect(input.held.contains(.guardAction));#expect(input.pressed.contains(.attack));#expect(input.move.x==1)
    t.up(2);#expect(t.sample().held==[.guardAction]);t.reset();#expect(t.sample().held.isEmpty);#expect(t.move.length==0)
}
@Test func collisionAndCameraLineOfSight() {
    let g=Grid(area:.dungeon,rows:["#####","#@..#","#.###","#...#","#####"])
    #expect(g.path(from:g.center(1,1),to:g.center(3,3),flags:[]) != nil)
    #expect(!g.visible(g.center(3,1),g.center(3,3),flags:[]))
    let moved=g.move(g.center(1,1),by:Point(x:-100,z:0),flags:[])
    #expect(moved.x>=4.35)
    let origin=g.center(1,1),distance=g.cameraClearance(from:origin,direction:Point(x:-1,z:0),maximum:6,flags:[])
    #expect(distance>1.4 && distance<1.9)
    #expect(g.canStand(origin+Point(x:-distance,z:0),radius:0.2,flags:[]))
}
@Test func importedEnemyTimingsAndHeavyGuard() throws {
    let data=try content(),w=GameWorld(content:data)
    for kind in ["ghoul","hopper","wisp","crow"] {
        w.spawn(kind,id:"timing:"+kind,at:Point(x:20,z:20))
        let e=w.enemies.last!,timing=data.enemyAttack[kind]!
        #expect(e.attackStart==timing.active[0]);#expect(e.attackEnd==timing.active[1]);#expect(e.attackDuration==timing.len)
    }
    var hero=HeroCombat(timings:data.timing);hero.enter("guard")
    #expect(hero.hit(front:true,parryable:false)=="guarded");#expect(hero.counter==0)
}
@Test func saveBackupAndTransactions() throws {
    let root=URL(fileURLWithPath:#filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    let dir=root.appendingPathComponent("build/test-stores/"+UUID().uuidString)
    defer {try? FileManager.default.removeItem(at:dir)}
    let store=SaveStore(directory:dir)
    var s=SaveState();s.gold=44;try store.save(s);s.gold=88;try store.save(s)
    try Data("broken".utf8).write(to:dir.appendingPathComponent("journey.json"));#expect(store.load()?.gold==44)
    let w=GameWorld(content:try content());w.buy(0);#expect(w.save.gold==18);#expect(w.save.items["herb"]==3)
    w.buy(2);#expect(w.save.gold==18)
    w.save.life=0;w.save.gold=31;w.respawn();#expect(w.save.gold==15);#expect(w.save.life==w.save.maxLife)
    #expect(w.snapshot.gold==15)
}
@Test(arguments:Difficulty.allCases) func completeChapterThroughRealInputs(difficulty:Difficulty) throws {
    var save=SaveState();save.difficulty=difficulty
    let w=GameWorld(content:try content(),save:save),driver=ValidationDriver()
    for tick in 0..<180_000 {
        w.update(driver.input(w));driver.observe(w);w.events.removeAll()
        if w.save.completed {break}
        if tick%18_000==0 {print("Campaign tick \(tick) stage \(driver.stage) \(w.save.area) \(w.save.position) HP \(w.save.life)")}
    }
    print("Campaign result \(driver.report) position \(w.save.position) enemies \(w.enemies.filter(\.alive).count)")
    #expect(w.save.completed);#expect(w.save.keyItems.isSuperset(of:["mirror","candle","compass","map_d1"]))
    #expect(driver.milestones.contains("shop"));#expect(driver.milestones.contains("inn"))
}
@Test(arguments:Difficulty.allCases) func savedDifficultySelectsBossAppearance(difficulty:Difficulty) throws {
    let root=URL(fileURLWithPath:#filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    let dir=root.appendingPathComponent("build/test-stores/"+UUID().uuidString)
    defer {try? FileManager.default.removeItem(at:dir)}
    let store=SaveStore(directory:dir)
    var save=SaveState();save.difficulty=difficulty;save.area = .boss;save.position=Point(x:24,z:32)
    try store.save(save)
    let restored=try #require(store.load()),world=GameWorld(content:try content(),save:restored)
    let expected=difficulty == .hard ? "rotroot_wraith":"rotroot"
    #expect(world.save.difficulty.bossArt==expected)
    #expect(world.save.difficulty.bossTitle==(difficulty == .hard ? "WRAITH WARLORD":"FALLEN WARLORD"))
    #expect(world.boss?.kind=="rotroot")
    let art=try JSONSerialization.jsonObject(with:Data(contentsOf:root.appendingPathComponent("Resources/Generated/Art/"+expected+".json"))) as? [String:Any]
    #expect(art?["name"] as? String==expected)
}
@Test func hitStopRetainsDodgeInput()throws{
    let w=GameWorld(content:try content())
    w.spawn("ghoul",id:"buffer-fixture",at:w.save.position+Point(x:0,z:-1.5))
    w.update(InputFrame(pressed:[.attack]))
    for _ in 0..<12 {w.update(InputFrame());if w.events.contains(where:{$0.kind=="hit"}){break}}
    #expect(w.events.contains(where:{$0.kind=="hit"}))
    w.update(InputFrame(pressed:[.dodge]));#expect(w.hero.queued=="dodge")
    for _ in 0..<12 {w.update(InputFrame());if w.hero.state=="dodge"{break}}
    #expect(w.hero.state=="dodge")
}
#if DEBUG
@Test func bossBuildsMomentumAndTurnsBeforeAttacking()throws{
    let world=GameWorld(content:try content(),save:DeveloperBossTest.save(difficulty:.normal))
    world.update(InputFrame())
    #expect(world.enemies[0].velocity.length>0 && world.enemies[0].velocity.length<=0.121)
    world.update(InputFrame());#expect(world.enemies[0].velocity.length<=0.241)
    world.save.position=Point(x:24,z:26);world.enemies[0].position=Point(x:24,z:21)
    world.enemies[0].yaw = .pi;world.enemies[0].cooldown=0;world.enemies[0].state="idle"
    world.update(InputFrame())
    #expect(world.enemies[0].state != "attack")
    #expect(abs(wrapped(world.enemies[0].yaw-Float.pi))<=0.051)
}
@Test(arguments:Difficulty.allCases) func bossPursuesRepositionsAndHonorsAttackLock(difficulty:Difficulty)throws{
    let world=GameWorld(content:try content(),save:DeveloperBossTest.save(difficulty:difficulty))
    let initial=try #require(world.boss)
    for _ in 0..<120 {world.update(InputFrame());world.events.removeAll()}
    let pursued=try #require(world.boss)
    #expect(pursued.position.distance(world.save.position)<initial.position.distance(world.save.position)-1)
    #expect(["chase","attack"].contains(pursued.state))
    world.enemies[0].state="attack";world.enemies[0].tick=0;world.enemies[0].attackKind=0
    world.enemies[0].attackStart=48;world.enemies[0].attackEnd=57;world.enemies[0].attackDuration=108
    let locked=world.enemies[0].position
    for _ in 0..<20 {world.update(InputFrame())}
    #expect(world.enemies[0].position==locked)
    world.save.position=Point(x:24,z:28);world.enemies[0].position=Point(x:24,z:24)
    world.enemies[0].state="idle";world.enemies[0].cooldown=999
    for _ in 0..<30 {world.update(InputFrame())}
    #expect(abs(world.enemies[0].position.x-24)>0.2)
    world.save.position=Point(x:31,z:29);world.enemies[0].position=Point(x:32,z:24)
    for _ in 0..<120 {
        world.update(InputFrame())
        #expect(world.enemies[0].position.distance(Point(x:24,z:24))<=8.001)
        #expect(world.enemies[0].position.distance(world.save.position)>=1.799)
    }
}
@Test(arguments:Difficulty.allCases) func developerBossTestStartsAndRetriesAtBoss(difficulty:Difficulty)throws{
    let seed=DeveloperBossTest.save(difficulty:difficulty)
    #expect(seed.valid);#expect(seed.area == .boss);#expect(seed.difficulty==difficulty)
    #expect(!seed.completed);#expect(!seed.flags.contains("dead:boss:rotroot"))
    let world=GameWorld(content:try content(),save:seed)
    #expect(world.boss != nil);#expect(world.save.position==Point(x:24,z:32))
    world.save.life=0;world.respawn()
    #expect(world.save.area == .boss);#expect(world.boss != nil);#expect(world.save.life==world.save.maxLife)
    world.save.flags.insert("dead:boss:rotroot");world.save.completed=true
    let reset=GameWorld(content:try content(),save:DeveloperBossTest.save(difficulty:difficulty))
    #expect(reset.boss != nil);#expect(!reset.save.completed)
}
#endif

@Test func tensionIsDeterministicQuietAndSafe() {
    var a=TensionDirector(),b=TensionDirector(),events:[Int]=[]
    for tick in 0..<3600 {
        let first=a.update(area:.road,nearestEnemy:12,entranceDistance:8,combat:false)
        #expect(first==b.update(area:.road,nearestEnemy:12,entranceDistance:8,combat:false))
        if first != nil {events.append(tick)}
    }
    #expect(events.count>=3 && events.count<=5)
    for pair in zip(events,events.dropFirst()) {#expect(pair.1-pair.0>=600)}
    for _ in 0..<1200 {#expect(a.update(area:.village,nearestEnemy:0,entranceDistance:0,combat:false)==nil)}
    #expect(a.level==0)
}

#if DEBUG
@Test func bossDistancePhasesAndCommittedCombo()throws {
    let world=GameWorld(content:try content(),save:DeveloperBossTest.save(difficulty:.normal))
    world.save.position=Point(x:24,z:29);world.enemies[0].cooldown=0
    world.update(InputFrame());#expect(world.enemies[0].attackKind==2)
    let start=world.enemies[0].position,yaw=world.enemies[0].yaw
    for _ in 0..<40 {world.update(InputFrame())}
    #expect(world.enemies[0].position.distance(start)>1)
    #expect(world.enemies[0].yaw==yaw)
    #expect(world.enemies[0].attackStart==48 && world.enemies[0].attackClip=="charge")
    world.enemies[0].state="idle";world.enemies[0].hp=world.enemies[0].maxHP*0.6
    world.enemies[0].attackSequence=2;world.enemies[0].cooldown=0
    world.save.position=world.enemies[0].position+Point(x:0,z:4)
    world.update(InputFrame())
    #expect(world.enemies[0].phase==2 && world.enemies[0].attackKind==3)
    #expect(world.enemies[0].attackClip=="sweep")
    world.enemies[0].tick=71;world.enemies[0].dealt=true
    world.update(InputFrame())
    #expect(world.enemies[0].attackKind==0 && !world.enemies[0].comboRemaining)
    #expect(world.enemies[0].tick==0 && world.enemies[0].attackStart==48)
    world.enemies[0].hp=world.enemies[0].maxHP*0.25
    let tick=world.enemies[0].tick,transitionYaw=world.enemies[0].yaw
    world.update(InputFrame());#expect(world.enemies[0].phase==3)
    #expect(world.enemies[0].state=="attack" && world.enemies[0].tick==tick+1)
    #expect(world.enemies[0].yaw==transitionYaw)
}
@Test func pausedEnvironmentDoesNotAdvance()throws {
    let world=GameWorld(content:try content())
    for _ in 0..<100 {world.update(InputFrame())}
    world.pause();let level=world.tension.level,cooldown=world.tension.cooldown
    for _ in 0..<100 {world.update(InputFrame())}
    #expect(world.tension.level==level && world.tension.cooldown==cooldown)
}
#endif

#if DEBUG
@Test(arguments:[0,1,2,3]) func bossStrikeWindowAndDefenses(kind:Int)throws {
    for defense in ["guard","dodge"] {
        let world=GameWorld(content:try content(),save:DeveloperBossTest.save(difficulty:.normal))
        world.save.position=Point(x:24,z:25);world.save.yaw = .pi
        world.enemies[0].attackKind=kind;world.enemies[0].state="attack"
        world.enemies[0].attackStart=world.enemies[0].overhead ? 48:40
        world.enemies[0].attackEnd=world.enemies[0].attackStart+9
        world.enemies[0].tick=world.enemies[0].attackStart-2
        let life=world.save.life
        world.update(InputFrame());#expect(world.save.life==life)
        world.hero.enter(defense)
        if defense=="dodge" {world.hero.tick=(world.hero.timing?.iframes?.first ?? 0)}
        world.update(InputFrame(held:defense=="guard" ? [.guardAction]:[]))
        #expect(world.save.life==life)
        if defense=="guard" {#expect(world.events.contains{$0.kind==(world.enemies[0].overhead ? "guard":"parry")})}
    }
}
#endif

@Test func oldPreferencesPreserveSettingsAndDefaultQuality()throws {
    let old=Data(#"{"language":"zh","music":0.3,"sound":0.4,"haptics":false,"sensitivity":1.2}"#.utf8)
    let settings=try JSONDecoder().decode(Preferences.self,from:old)
    #expect(settings.language=="zh" && settings.music==0.3 && !settings.haptics)
    #expect((settings.quality ?? .balanced) == .balanced)
    for quality in GraphicsQuality.allCases {
        var updated=settings;updated.quality=quality
        let decoded=try JSONDecoder().decode(Preferences.self,from:JSONEncoder().encode(updated))
        #expect(decoded.quality==quality && decoded.music==settings.music)
    }
    #expect(GraphicsQuality.performance.renderScale<GraphicsQuality.balanced.renderScale)
    #expect(GraphicsQuality.high.shadowDistance>GraphicsQuality.balanced.shadowDistance)
}

#if DEBUG
@Test(arguments:Difficulty.allCases) func bossPracticeTraversesPhasesWithRealInputs(difficulty:Difficulty)throws {
    let world=GameWorld(content:try content(),save:DeveloperBossTest.save(difficulty:difficulty))
    let driver=ValidationDriver(bossOpening:true)
    var phases:Set<Int>=[],attacks:Set<Int>=[]
    for _ in 0..<18000 {
        world.update(driver.input(world));driver.observe(world)
        if let boss=world.boss {phases.insert(boss.phase);if boss.state=="attack" {attacks.insert(boss.attackKind)}}
        world.events.removeAll(keepingCapacity:true)
        if driver.completions>0 {break}
    }
    print("Boss practice",difficulty.rawValue,"phases",phases.sorted(),"attacks",attacks.sorted(),driver.report)
    #expect(world.save.completed && world.save.keyItems.contains("mirror"))
    #expect(phases==[1,2,3])
    #expect(attacks.contains(2));#expect(attacks.contains(3))
}
#endif

#if DEBUG
@Test func gapCloserReachesStationaryTargetAfterFullTell()throws {
    let world=GameWorld(content:try content(),save:DeveloperBossTest.save(difficulty:.normal))
    world.save.position=Point(x:24,z:29);world.enemies[0].cooldown=0
    let life=world.save.life
    world.update(InputFrame());#expect(world.enemies[0].attackKind==2)
    for _ in 1..<48 {world.update(InputFrame());#expect(world.save.life==life)}
    world.update(InputFrame())
    #expect(world.save.life<life)
    #expect(world.enemies[0].dealt && world.enemies[0].velocity.length==0)
}
#endif

@Test func colossusContactUsesTheRealStrikeClock() {
    for kind in 0...3 {
        var enemy=Enemy(id:"boss",kind:"rotroot",position:Point(),hp:40,maxHP:40)
        enemy.state="attack";enemy.attackKind=kind
        enemy.attackStart=enemy.overhead ? 48:40;enemy.attackEnd=enemy.overhead ? 57:60
        enemy.tick=enemy.attackStart
        #expect(abs(ColossusPose.height(enemy)-0.8)<0.001)
        #expect(!ColossusPose.exposed(enemy))
        enemy.tick=20;#expect(!ColossusPose.exposed(enemy));#expect(ColossusPose.height(enemy)>2)
        enemy.tick=enemy.attackEnd;#expect(ColossusPose.exposed(enemy));#expect(ColossusPose.side(enemy)==0)
    }
}
