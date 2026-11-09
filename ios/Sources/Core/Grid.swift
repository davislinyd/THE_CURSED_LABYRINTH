import Foundation

struct Grid: Sendable {
    let area:Area
    let rows:[[Character]]
    var cell:Float { area.thirdPerson ? 4 : 2 }
    var width:Int { rows.first?.count ?? 0 }
    var height:Int { rows.count }
    init(area:Area, rows:[String]) { self.area=area; self.rows=rows.map(Array.init) }
    func char(_ x:Int,_ y:Int) -> Character { y>=0 && y<height && x>=0 && x<rows[y].count ? rows[y][x] : "#" }
    func tile(_ p:Point) -> (Int,Int) { (Int(floor(p.x/cell)),Int(floor(p.z/cell))) }
    func center(_ x:Int,_ y:Int) -> Point { Point(x:(Float(x)+0.5)*cell,z:(Float(y)+0.5)*cell) }
    func key(_ x:Int,_ y:Int) -> String { "\(area.rawValue):\(x),\(y)" }
    func find(_ ch:Character) -> Point? {
        for y in rows.indices { if let x=rows[y].firstIndex(of:ch) { return center(x,y) } }; return nil
    }
    func blocked(_ x:Int,_ y:Int,flags:Set<String>) -> Bool {
        let c=char(x,y)
        if flags.contains("open:"+key(x,y)) { return false }
        if area.thirdPerson { return "#TDLBKSX".contains(c) }
        return "#T~+fHWLNJ VvS1234abc".contains(c)
    }
    func canStand(_ p:Point, radius:Float = 0.36, flags:Set<String>) -> Bool {
        let (cx,cy)=tile(p)
        for y in cy-1...cy+1 { for x in cx-1...cx+1 where blocked(x,y,flags:flags) {
            let px=clamp(p.x,Float(x)*cell,Float(x+1)*cell), pz=clamp(p.z,Float(y)*cell,Float(y+1)*cell)
            if (p-Point(x:px,z:pz)).length < radius { return false }
        } }
        return true
    }
    func move(_ p:Point,by delta:Point,radius:Float = 0.36,flags:Set<String>) -> Point {
        var out=p
        let steps=max(1,Int(ceil(delta.length/0.2)))
        for _ in 0..<steps {
            let d=delta/Float(steps)
            let px=Point(x:out.x+d.x,z:out.z)
            if canStand(px,radius:radius,flags:flags) {out=px}
            let pz=Point(x:out.x,z:out.z+d.z)
            if canStand(pz,radius:radius,flags:flags) {out=pz}
        }
        return out
    }
    func visible(_ a:Point,_ b:Point,flags:Set<String>) -> Bool {
        let n=max(1,Int(ceil(a.distance(b)/0.3)))
        for i in 1..<n {
            let (x,y)=tile(a+(b-a)*(Float(i)/Float(n)))
            if blocked(x,y,flags:flags) {return false}
        }
        return true
    }
    func cameraClearance(from origin:Point,direction:Point,maximum:Float,flags:Set<String>)->Float {
        let axis=direction.normalized
        guard axis.length>0 else{return 0}
        var distance:Float=0
        while distance+0.12<=maximum {
            let next=distance+0.12
            if !canStand(origin+axis*next,radius:0.2,flags:flags){break}
            distance=next
        }
        return distance
    }
    func path(from:Point,to:Point,flags:Set<String>) -> [Point]? {
        let (sx,sy)=tile(from), (tx,ty)=tile(to)
        guard !blocked(tx,ty,flags:flags) else {return nil}
        let start=sy*width+sx,goal=ty*width+tx
        var queue=[start],index=0,prev=[start:start]
        while index<queue.count {
            let at=queue[index];index+=1
            if at==goal {
                var out=[Point](),p=goal
                while p != start {out.append(center(p%width,p/width));p=prev[p]!}
                return out.reversed()
            }
            for (dx,dy) in [(0,-1),(1,0),(0,1),(-1,0)] {
                let x=at%width+dx,y=at/width+dy,n=y*width+x
                if x>=0 && x<width && y>=0 && y<height && prev[n]==nil && !blocked(x,y,flags:flags) {prev[n]=at;queue.append(n)}
            }
        }
        return nil
    }
}
