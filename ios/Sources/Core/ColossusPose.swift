import Foundation

/// Presentation and melee exposure share the 60 Hz strike clock; impact poses never lag a hit.
enum ColossusPose {
    static func sample(_ tick:Int,_ knots:[(Int,Float)])->Float {
        guard tick>knots[0].0 else{return knots[0].1}
        for i in 1..<knots.count where tick<=knots[i].0 {
            let a=knots[i-1],b=knots[i],u=Float(tick-a.0)/Float(b.0-a.0),smooth=u*u*(3-2*u)
            return a.1+(b.1-a.1)*smooth
        }
        return knots.last!.1
    }
    static func height(_ enemy:Enemy)->Float {
        guard enemy.state=="attack" else{return enemy.state=="stagger" ? 0.55:0.8}
        if enemy.overhead {return sample(enemy.tick,[(0,0.8),(12,5),(32,14),(39,14),(48,0.8),(57,0.8),(78,1.2),(108,0.8)])}
        return sample(enemy.tick,[(0,0.8),(14,2.6),(32,3.2),(36,3.2),(40,0.8),(60,0.8),(96,0.8)])
    }
    static func side(_ enemy:Enemy)->Float {
        guard enemy.state=="attack",!enemy.overhead else{return 0}
        return sample(enemy.tick,[(0,0),(32,-4),(40,-4),(50,3),(60,0),(96,0)])
    }
    static func exposed(_ enemy:Enemy)->Bool {enemy.state != "attack" || enemy.tick<8 || enemy.tick>=enemy.attackEnd}
}
