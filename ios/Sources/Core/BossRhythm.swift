import Foundation

/// Fixed 60 Hz timing. Strike windows retain the authored slam/sweep clip samples.
enum BossRhythm {
    // Thirty travel ticks integrate to 2.205 m; at the maximum tell distance a stationary target is reachable.
    static let engageRange:Float = 8.1
    static let chargeStart = 12
    static let chargePlant = 42
    static let chargeRamp = 12
    static let chargeSpeed:Float = 5.4
    static let acceleration:Float = 7.2
    static let staggerTicks = 78
    static func phase(_ ratio:Float)->Int {ratio <= 0.3 ? 3:ratio <= 0.65 ? 2:1}
    static func speed(_ difficulty:Difficulty,phase:Int)->Float {
        (difficulty == .easy ? 2.2:difficulty == .hard ? 3.2:2.7)+Float(phase-1)*0.25
    }
    static func turnRate(_ difficulty:Difficulty)->Float {difficulty == .hard ? 0.065:0.05}
    static func cooldown(_ difficulty:Difficulty,phase:Int)->Int {
        max(12,(difficulty == .easy ? 40:difficulty == .hard ? 24:32)-(phase-1)*6)
    }
    // 0: overhead, 1: sweep, 2: committed advancing overhead, 3: sweep/overhead chain.
    static func choose(distance:Float,phase:Int,sequence:Int)->Int {
        if distance>6 {return 2}
        if phase>=2 && sequence%3==2 {return 3}
        return distance<3.6 ? 1:0
    }
}
