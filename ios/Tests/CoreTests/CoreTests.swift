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
    #expect(world.enemies[0].velocity.length>0 && world.enemies[0].velocity.length<=0.081)
    world.update(InputFrame());#expect(world.enemies[0].velocity.length<=0.161)
    world.save.position=Point(x:24,z:26);world.enemies[0].position=Point(x:24,z:21)
    world.enemies[0].yaw = .pi;world.enemies[0].cooldown=0;world.enemies[0].state="idle"
    world.update(InputFrame())
    #expect(world.enemies[0].state != "attack")
    #expect(abs(wrapped(world.enemies[0].yaw-Float.pi))<=0.036)
}
@Test(arguments:Difficulty.allCases) func bossPursuesRepositionsAndHonorsAttackLock(difficulty:Difficulty)throws{
    let world=GameWorld(content:try content(),save:DeveloperBossTest.save(difficulty:difficulty))
    let initial=try #require(world.boss)
    for _ in 0..<120 {world.update(InputFrame());world.events.removeAll()}
    let pursued=try #require(world.boss)
    #expect(pursued.position.distance(world.save.position)<initial.position.distance(world.save.position)-1)
    #expect(pursued.state=="chase")
    world.enemies[0].state="attack";world.enemies[0].tick=0
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
