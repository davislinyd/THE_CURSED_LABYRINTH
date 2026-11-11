import Foundation

struct Point: Codable, Equatable, Sendable {
    var x: Float = 0
    var z: Float = 0
    var length: Float { sqrt(x * x + z * z) }
    var normalized: Point { length > 0.0001 ? self / length : Point() }
    static func + (a: Self, b: Self) -> Self { Point(x: a.x+b.x, z:a.z+b.z) }
    static func - (a: Self, b: Self) -> Self { Point(x: a.x-b.x, z:a.z-b.z) }
    static func * (a: Self, b: Float) -> Self { Point(x:a.x*b,z:a.z*b) }
    static func / (a: Self, b: Float) -> Self { a * (1/b) }
    func distance(_ b: Point) -> Float { (self-b).length }
}
func wrapped(_ a: Float) -> Float { atan2(sin(a), cos(a)) }
func clamp(_ v: Float, _ a: Float, _ b: Float) -> Float { min(b,max(a,v)) }

enum Area: String, Codable, CaseIterable, Sendable { case world, village, road, dungeon, boss
    var thirdPerson: Bool { self == .dungeon || self == .boss }
    var title: String { switch self {
    case .world: "HAIYA PLAINS"
    case .village: "HAIYA VILLAGE"
    case .road: "ROTWOOD ROAD"
    case .dungeon: "ROTWOOD GROTTO"
    case .boss: "FALLEN WARLORD"
    } }
}
enum Difficulty: String, Codable, CaseIterable, Sendable {
    case easy, normal, hard
    var damage: Float { self == .easy ? 0.5 : self == .hard ? 1.5 : 1 }
    var toughness: Float { self == .easy ? 0.7 : self == .hard ? 1.3 : 1 }
    var tire: Float { self == .easy ? 0.7 : self == .hard ? 1.4 : 1 }
    var bossArt: String { self == .hard ? "rotroot_wraith" : "rotroot" }
    var bossTitle: String { self == .hard ? "WRAITH WARLORD" : "FALLEN WARLORD" }
}
struct Loot: Codable, Sendable { var kind: String; var id: String?; var n: Int? }
struct Villager: Codable, Sendable { var x:Int; var y:Int; var role:String; var lines:[Int]; var look:String }
struct Building: Codable, Sendable { var kind:String; var x:Int; var y:Int; var w:Int; var h:Int }
struct Village: Codable, Sendable { var map:[String]; var buildings:[Building]; var villagers:[Villager] }
struct ShopItem: Codable, Sendable { var item:String; var n:Int; var price:Int }
struct Town: Codable, Sendable { var name:String; var inn:Int; var shop:[ShopItem]; var talk:[String] }
struct Spirit: Codable, Sendable { var x:Int; var y:Int; var group:String }
struct DungeonData: Codable, Sendable {
    var map:[String]; var chests:[String:Loot]; var hidden:[String:Loot]; var encounters:[String:String]; var tablets:[String:String]; var dark:[[Int]]
}
struct Timing: Codable, Sendable {
    var len:Int; var active:[Int]?; var cancel:Int?; var lunge:[Float]?; var iframes:[Int]?; var power:Float?
}
struct FoeSpec: Codable, Sendable {
    var hp:Float; var radius:Float; var speed:Float; var range:Float; var reach:Float; var arc:Float; var damage:Float; var sight:Float; var cooldown:Int; var souls:Int
}
struct AttackTiming:Codable,Sendable {var len:Int;var active:[Int]}
struct Content: Decodable, Sendable {
    var schema:Int; var world:[String]; var worldRows:[String]; var village:Village; var road:[String]; var dungeon:DungeonData
    var town:Town; var spirits:[Spirit]; var encounters:[String:[[String]]]; var translations:[String:String]; var intro:[String]
    var timing:[String:Timing]; var foes:[String:FoeSpec];var enemyAttack:[String:AttackTiming]
    static func load(_ url: URL) throws -> Content { try JSONDecoder().decode(Content.self,from:Data(contentsOf:url)) }
    func rows(_ area: Area) -> [String] {
        switch area {
        case .world: worldRows
        case .village: village.map
        case .road: road
        case .dungeon: dungeon.map
        case .boss: ["############", "#..........#", "#..........#", "#..........#", "#..........#", "#..........#", "#..........#", "#..........#", "#..........#", "#..........#", "#....@.....#", "############"]
        }
    }
}

enum GraphicsQuality:String,Codable,CaseIterable,Sendable {
    case performance, balanced, high
    var renderScale:Float {self == .performance ? 1.5:self == .high ? 2.5:2}
    var shadowDistance:Float {self == .performance ? 0:self == .high ? 30:24}
    var particleBudget:Int {self == .performance ? 30:self == .high ? 90:60}
}
struct Preferences: Codable, Sendable {
    // Optional decoding keeps settings written before quality profiles compatible.
    var quality:GraphicsQuality? = .balanced
    var language = Locale.preferredLanguages.first?.hasPrefix("zh") == true ? "zh" : "en"
    var music: Float = 0.65
    var sound: Float = 0.8
    var haptics = true
    var sensitivity: Float = 1
}
struct Checkpoint: Codable, Equatable, Sendable { var area: Area; var position: Point }
struct SaveState: Codable, Sendable {
    var schema = 1
    var area: Area = .world
    var position = Point(x:39,z:153)
    var yaw: Float = .pi
    var life: Float = 16
    var maxLife: Float = 16
    var gold = 30
    var weaponExp = 0
    var items = ["herb":2,"elixir":0,"talisman":5]
    var selectedItem = "herb"
    var keyItems: Set<String> = []
    var flags: Set<String> = []
    var visited: Set<String> = []
    var checkpoint = Checkpoint(area:.world,position:Point(x:39,z:153))
    var difficulty: Difficulty = .normal
    var completed = false
    var deaths = 0
    var playTicks = 0
    var level: Int { [0,8,20,36,56,80,110,150].filter { weaponExp >= $0 }.count }
    var swordDamage: Float { Float(1 + (level-1)/2) }
    var valid: Bool {
        schema == 1 && position.x.isFinite && position.z.isFinite && yaw.isFinite && life.isFinite && maxLife.isFinite
        && maxLife >= 16 && maxLife <= 100 && life >= 0 && life <= maxLife && gold >= 0 && weaponExp >= 0
        && checkpoint.position.x.isFinite && checkpoint.position.z.isFinite && items.values.allSatisfy { $0 >= 0 }
    }
}

final class SaveStore {
    let directory: URL
    init(directory: URL) { self.directory = directory }
    private var current: URL { directory.appendingPathComponent("journey.json") }
    private var backup: URL { directory.appendingPathComponent("journey.backup.json") }
    func load() -> SaveState? {
        for url in [current,backup] {
            if let data = try? Data(contentsOf:url), let save = try? JSONDecoder().decode(SaveState.self,from:data), save.valid { return save }
        }
        return nil
    }
    func save(_ value: SaveState) throws {
        guard value.valid else { throw CocoaError(.fileWriteInvalidFileName) }
        try FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true)
        let data = try JSONEncoder().encode(value)
        if let old = try? Data(contentsOf:current), let previous = try? JSONDecoder().decode(SaveState.self,from:old), previous.valid {
            try old.write(to:backup,options:.atomic)
        }
        try data.write(to:current,options:.atomic)
    }
}
