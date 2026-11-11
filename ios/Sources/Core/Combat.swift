import Foundation

enum Action: String, Hashable, Sendable { case attack, strong, guardAction, dodge, item, interact, cycle }
struct InputFrame: Sendable {
    var move = Point()
    var look = Point()
    var pressed: Set<Action> = []
    var held: Set<Action> = []
}

struct Fatigue: Sendable {
    var value: Float = 0
    var exhausted = false
    mutating func tick(running: Bool, rate: Float) {
        value = clamp(value + (running && !exhausted ? rate / 480 : -1 / 300),0,1)
        if value >= 1 { exhausted = true }
        if value < 0.35 { exhausted = false }
    }
}

struct HeroCombat: Sendable {
    var state = "idle"
    var tick = 0
    var swing = 0
    var counter = 0
    var queued: String?
    var age = 0
    let timings: [String:Timing]
    var timing: Timing? { timings[state] }
    var active: Bool { guard let r = timing?.active else { return false }; return tick >= r[0] && tick < r[1] }
    var invulnerable: Bool { guard let r = timing?.iframes else { return false }; return tick >= r[0] && tick < r[1] }
    var canMove: Bool { ["idle","run","guard"].contains(state) }
    var power: Float { timing?.power ?? 1 }
    var lunge: Float {
        guard let a=timing?.lunge, Float(tick)>=a[0], Float(tick)<a[1] else {return 0}
        return a[2]
    }
    mutating func enter(_ name:String) { state=name; tick=0; if timings[name]?.active != nil { swing += 1 } }
    @discardableResult mutating func buffer(_ input:InputFrame)->Bool {
        guard state != "die" else{return false}
        for(action,name)in [(Action.attack,"attack"),(.strong,"strong"),(.dodge,"dodge"),(.item,"use")] where input.pressed.contains(action){queued=name;age=0;return true}
        return false
    }
    mutating func update(_ input:InputFrame) {
        tick += 1; counter = max(0,counter-1)
        if state == "die" { return }
        if !buffer(input),queued != nil { age += 1; if age > 20 { queued=nil } }
        var cancel = timing?.cancel ?? timing?.len ?? 0
        if queued == "dodge", let a=timing?.active { cancel=a[1] }
        if state == "dodge" && (queued == "attack" || queued == "strong") { cancel=18 }
        if let q=queued, tick>=cancel {
            if q == "attack" {
                if counter>0 { enter("counter"); counter=0 }
                else { enter(state == "atk1" ? "atk2" : state == "atk2" ? "atk3" : "atk1") }
            } else { enter(q) }
            queued=nil; return
        }
        if timing == nil || tick >= timing!.len {
            let next = input.held.contains(.guardAction) ? "guard" : input.move.length>0.1 ? "run" : "idle"
            if next != state {
                let recoveringGuard=state == "guardHit" && next == "guard"
                enter(next); if recoveringGuard { tick=9 }
            }
        }
    }
    mutating func hit(front:Bool,parryable:Bool=true) -> String {
        if invulnerable || state == "die" { return "ignored" }
        if front && (state == "guard" || state == "guardHit") {
            if parryable && state == "guard" && tick<=8 { counter=36; return "parried" }
            enter("guardHit"); return "guarded"
        }
        enter("hurt"); return "hit"
    }
}

struct Enemy: Sendable, Identifiable {
    var id:String
    var kind:String
    var position:Point
    var yaw:Float = 0
    var hp:Float
    var maxHP:Float
    var state = "idle"
    var tick = 0
    var cooldown = 45
    var lastSwing = -1
    var aim = Point()
    var velocity = Point()
    var attackKind = 0
    var phase = 1
    var attackSequence = 0
    var comboRemaining = false
    var overhead:Bool { attackKind == 0 || attackKind == 2 }
    var attackClip:String { attackKind == 2 ? "charge":overhead ? "slam":"sweep" }
    var attackReach:Float { overhead ? 6:5.5 }
    var attackArc:Float { overhead ? 0.45:2.6 }
    var dealt = false
    var attackStart=30
    var attackEnd=40
    var attackDuration=60
    var warning:Bool { state == "attack" && tick<attackStart }
    var alive:Bool { hp>0 }
}
struct Projectile: Sendable, Identifiable {
    var id:Int; var position:Point; var velocity:Point; var life:Int; var friendly:Bool; var hit:Set<String> = []
}
struct GameEvent: Sendable {
    var kind:String
    var position:Point
}

/// Touch identities retain their assigned role until cancellation or release.
struct TouchState: Sendable {
    var move = Point()
    var look = Point()
    var buttons: [Int:Action] = [:]
    var latched: Set<Action> = []
    mutating func down(_ id:Int, action:Action) { buttons[id]=action; latched.insert(action) }
    mutating func up(_ id:Int) { buttons.removeValue(forKey:id) }
    mutating func reset() { move=Point();look=Point();buttons.removeAll();latched.removeAll() }
    mutating func sample() -> InputFrame {
        let result=InputFrame(move:move,look:look,pressed:latched,held:Set(buttons.values))
        latched.removeAll();look=Point();return result
    }
}
