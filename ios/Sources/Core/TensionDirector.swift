import Foundation

/// Presentation-only, deterministic 60 Hz envelope; no random encounters or save mutations.
struct TensionDirector {
    private(set) var level:Float = 0
    private(set) var cooldown = 360
    private var sequence = 0
    mutating func update(area:Area,nearestEnemy:Float,entranceDistance:Float,combat:Bool)->String? {
        let base:Float=switch area {case .village:0;case .world:0.2;case .road:0.4;case .dungeon:0.55;case .boss:0.85}
        let target:Float=area == .village ? 0:min(1,base+max(0,1-nearestEnemy/20)*0.25+max(0,1-entranceDistance/16)*0.2+(combat ? 0.15:0))
        level += clamp(target-level,-0.002,0.002)
        cooldown=max(0,cooldown-1)
        guard cooldown==0,area != .village,!combat,level>0.15 else{return nil}
        sequence+=1;cooldown=600+(sequence%4)*120
        return sequence%2==0 ? "ambient_wood":"ambient_step"
    }
}

/// Scene exposure keeps routes readable while distinguishing refuge from hostile ground.
struct AtmosphereProfile {
    let moon:Float
    let fill:Float
    static func forArea(_ area:Area)->Self {
        switch area {
        case .village:Self(moon:2500,fill:1300)
        case .world:Self(moon:2100,fill:800)
        case .road:Self(moon:1800,fill:650)
        case .dungeon:Self(moon:1050,fill:430)
        case .boss:Self(moon:2200,fill:1100)
        }
    }
}
