#if DEBUG
enum DeveloperBossTest {
    static func save(difficulty:Difficulty)->SaveState {
        var save=SaveState()
        save.difficulty=difficulty;save.area = .boss;save.position=Point(x:24,z:32);save.yaw = .pi
        save.checkpoint=Checkpoint(area:.boss,position:save.position)
        save.weaponExp=20;save.items=["herb":9,"elixir":9,"talisman":9]
        save.keyItems=["compass","candle","map_d1"]
        return save
    }
}
#endif
