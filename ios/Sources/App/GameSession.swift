import SwiftUI
import AVFoundation
import CryptoKit
import UIKit
import Observation

@MainActor @Observable final class GameSession {
    var revision=0
    var screen="title"
    var introPage=0
    var preferences=Preferences()
    var error:String?
    var settingsVisible=false
    var difficultyVisible=false
    var loaded=false
    var artReady=false
    var lowPower=false
    private(set) var developerTesting=false
    #if DEBUG
    var developerVisible=false
    #endif
    @ObservationIgnored var world:GameWorld!
    @ObservationIgnored var touch=TouchState()
    @ObservationIgnored let renderer=GameRenderer()
    @ObservationIgnored let audio=GameAudio()
    @ObservationIgnored var store:SaveStore!
    @ObservationIgnored var content:Content!
    @ObservationIgnored private var accumulator:Double=0
    @ObservationIgnored private var savedRevision = -1
    @ObservationIgnored private var frame=0
    @ObservationIgnored private var lastBGM=""
    @ObservationIgnored private var metricsFrames=0
    @ObservationIgnored private var metricsTime:Double=0
    @ObservationIgnored private var frameSamples:[Double]=[]
    @ObservationIgnored private var syncSamples:[Double]=[]
    @ObservationIgnored private var observedBossPhases:Set<Int>=[]
    @ObservationIgnored private var observedBossAttacks:Set<Int>=[]
    @ObservationIgnored private var areaSamples:[String:[Double]]=[:]
    @ObservationIgnored var validation:ValidationDriver?
    @ObservationIgnored var resourceRoot:URL!
    @ObservationIgnored private var saveTask:Task<Void,Never>?
    @ObservationIgnored private var defaults=UserDefaults.standard
    @ObservationIgnored private var developerDirectory:URL!
    @ObservationIgnored private var protectedJourney:URL!
    init() {
        do {
            guard let root=Bundle.main.resourceURL?.appendingPathComponent("Generated") else {throw CocoaError(.fileNoSuchFile)}
            resourceRoot=root;content=try Content.load(root.appendingPathComponent("chapter.json"))
            let support=try FileManager.default.url(for:.applicationSupportDirectory,in:.userDomainMask,appropriateFor:nil,create:true)
            developerDirectory=support.appendingPathComponent("DeveloperJourney")
            protectedJourney=support.appendingPathComponent("Journey")
            let testing=ProcessInfo.processInfo.arguments.contains("--ui-testing")
            store=SaveStore(directory:support.appendingPathComponent(testing ? "UITestJourney":"Journey"))
            if testing {defaults=UserDefaults(suiteName:"com.davislinyd.labyrinth.uitests")!}
            if let data=defaults.data(forKey:"preferences"),let p=try? JSONDecoder().decode(Preferences.self,from:data) {preferences=p}
            world=GameWorld(content:content,save:store.load() ?? SaveState())
            renderer.resourceRoot=root;renderer.session=self;audio.root=root
            #if DEBUG
            let arguments=ProcessInfo.processInfo.arguments
            if let index=arguments.firstIndex(of:"--boss-test"),arguments.indices.contains(index+1),let difficulty=Difficulty(rawValue:arguments[index+1]) {
                startBossTest(difficulty)
                if arguments.contains("--validate") {validation=ValidationDriver(bossOpening:true)}
            } else if arguments.contains("--validate") {
                validation=ValidationDriver(loop:true);world=GameWorld(content:content);screen="game"
            }
            #endif
            loaded=true
            #if DEBUG
            reportProtectedSaveHashes()
            #endif
        } catch {self.error=error.localizedDescription}
    }
    var hasSave:Bool {store?.load() != nil}
    var effectiveQuality:GraphicsQuality {lowPower ? .performance:preferences.quality ?? .balanced}
    var zh:Bool {preferences.language=="zh"}
    var areaTitle:String {world.save.area == .boss ? world.save.difficulty.bossTitle:world.save.area.title}
    var controlRevision:Int {
        var hasher=Hasher();hasher.combine(preferences.language);hasher.combine(world.save.selectedItem)
        hasher.combine(world.save.items[world.save.selectedItem]);hasher.combine(world.prompt?.kind);hasher.combine(world.prompt?.label)
        return hasher.finalize()
    }
    var mapRevision:Int {
        var hasher=Hasher();hasher.combine(world.save.area);hasher.combine(world.save.visited.count)
        hasher.combine(Int(world.save.position.x*2));hasher.combine(Int(world.save.position.z*2));return hasher.finalize()
    }
    func text(_ key:String)->String {
        let local:[String:String]=[
            "DEVELOPER TEST":"開發者測試","DEVELOPER TEST · NO SAVE":"開發者測試・不儲存進度","BOSS PRACTICE · PROGRESS IS NOT SAVED":"直接挑戰 Boss，進度不會寫入正式存檔。","RESTART BOSS":"重設戰鬥","SWITCH FORM":"切換型態",
            "HAIYA PLAINS":"灰谷平原","ROTWOOD ROAD":"朽木古道","FALLEN WARLORD":"戰死武將","WRAITH WARLORD":"鬼化武將","PLAY":"開始旅程","CONTINUE":"繼續旅程","SETTINGS":"設定","BACK":"返回","RESUME":"繼續遊戲","NEW JOURNEY":"新的旅程","DIFFICULTY":"選擇難度","EASY":"簡單","NORMAL":"一般","HARD":"困難","ATTACK":"斬","STRONG":"重擊","GUARD":"防禦","DODGE":"閃避","ITEM":"道具","INTERACT":"調查","MAP":"地圖","PAUSE":"暫停","TALK":"交談","EXAMINE":"調查","ENTER VILLAGE":"進入村莊","LEAVE VILLAGE":"離開村莊","ENTER GROTTO":"進入洞窟","LEAVE GROTTO":"離開洞窟","OPEN CHEST":"開啟寶箱","OPEN DOOR":"開門","FACE THE GUARDIAN":"挑戰守護者","BREAK THE BOARDS":"擊破木板","STRIKE THE CRACKED BOARDS":"揮刀擊破裂開的木板","REST":"休息","HERB":"藥草","ELIXIR":"靈藥","TALISMAN":"符咒","COMPASS":"磁石","CANDLE":"幽靈燭","MAP_D1":"洞窟地圖","MIRROR":"青銅鏡","YOUR PATH IS RECORDED":"旅途已記錄","THE SPIRITS REST":"亡靈已安息","THE GUARDIAN IS AT REST":"守護者已安息","NOT ENOUGH GOLD":"金錢不足","NO ITEMS LEFT":"道具已用完","LIFE IS FULL":"生命已全滿","LIFE INCREASED":"生命上限增加","FOUND GOLD":"獲得金錢","THE REST OF THE JOURNEY LIES BEYOND CHAPTER ONE.":"前方的旅程將在後續章節展開。","CHAPTER ONE COMPLETE":"第一章完成","THE BRONZE MIRROR":"封印 I・青銅鏡","RETURN TO TITLE":"返回標題","FALLEN":"燈火未熄","TRY AGAIN":"再次出發","DEATH COST":"回到檢查點，失去一半金錢。","MUSIC":"音樂","SOUND":"音效","HAPTICS":"觸覺回饋","CAMERA":"鏡頭靈敏度","LANGUAGE":"語言","BUY":"購買","REST FOR 10 GOLD":"花費 10 金休息","SHOP":"行商","INN":"旅店","CLOSE":"關閉","SKIP":"略過","NEXT":"下一頁","JOURNEY":"旅途","SAVED":"已存檔","SEEK THE FIRST SEAL":"穿越朽木古道，尋回第一枚封印","TOUCH GUIDE":"左拇指移動・右側揮刀與閃避・按住防禦可彈開攻擊","START ANEW?":"重新開始會取代此 App 的旅程。","CANCEL":"取消","CONFIRM":"確定","LOADING":"點亮幽燈…","SAVE FAILED":"存檔失敗，請保留 App 並重試。","RETRY":"重試","CREDITS":"製作與授權","OFFLINE":"離線冒險","REDUCED EFFECTS":"節能畫質","ENRAGED":"狂怒","LAST STAND":"背水反撲","QUALITY":"畫質","PERFORMANCE":"效能","BALANCED":"平衡","HIGH":"高畫質"]
        var result=zh ? local[key] ?? content?.translations[key] ?? key : key
        let replacements=["ITEM":textControl("ITEM"),"SELECT":textControl("ITEM"),"ATTACK":textControl("ATTACK"),"ACT":textControl("INTERACT"),"CONFIRM":textControl("INTERACT")]
        for (k,v) in replacements {result=result.replacingOccurrences(of:"{\(k)}",with:v)}
        return result
    }
    private func textControl(_ key:String)->String {zh ? ["ITEM":"道具按鈕","ATTACK":"斬","INTERACT":"調查"][key] ?? key:key.lowercased()}
    func newGame(_ difficulty:Difficulty) {
        var state=SaveState();state.difficulty=difficulty
        world=GameWorld(content:content,save:state);renderer.invalidate();savedRevision = -1
        screen="intro";introPage=0;difficultyVisible=false;touch.reset();persist();revision+=1
    }
    func continueGame() {
        guard let state=store.load() else {return}
        world=GameWorld(content:content,save:state);renderer.invalidate();screen="game";touch.reset();revision+=1
    }
    func startPlaying() {screen="game";touch.reset();world.panel = .none;revision+=1}
    func closePanel() {world.panel = .none;touch.reset();revision+=1}
    func pause() {guard screen=="game" else{return};world.pause();touch.reset();audio.pause();persist();if developerTesting{writeMetrics()};revision+=1}
    func background() {pause();accumulator=0;UIApplication.shared.isIdleTimerDisabled=false;writeMetrics()}
    func title() {
        if developerTesting {
            writeMetrics();developerTesting=false
            world=GameWorld(content:content,save:store.load() ?? SaveState());renderer.invalidate()
            metricsTime=0;metricsFrames=0;frameSamples=[];areaSamples=[:];syncSamples=[];observedBossPhases=[];observedBossAttacks=[]
        }else{world.checkpointSafe();persist()}
        screen="title";touch.reset();accumulator=0;revision+=1
    }
    #if DEBUG
    func startBossTest(_ difficulty:Difficulty) {
        if developerTesting{writeMetrics()}
        developerTesting=true;developerVisible=false;difficultyVisible=false;settingsVisible=false;validation=nil
        world=GameWorld(content:content,save:DeveloperBossTest.save(difficulty:difficulty))
        renderer.invalidate();touch.reset();accumulator=0;savedRevision = -1
        metricsTime=0;metricsFrames=0;frameSamples=[];areaSamples=[:];syncSamples=[];observedBossPhases=[];observedBossAttacks=[]
        screen="game";revision+=1
    }
    #endif
    func changeSettings() {
        if let data=try? JSONEncoder().encode(preferences) {defaults.set(data,forKey:"preferences")}
        audio.setVolumes(preferences);revision+=1
    }
    func persist() {
        guard let world,let store,validation==nil,!developerTesting else {return}
        do {try store.save(world.snapshot);savedRevision=world.saveRevision}
        catch {self.error=text("SAVE FAILED")}
    }
    func step(delta:Double) {
        guard loaded,artReady else{return}
        UIApplication.shared.isIdleTimerDisabled=screen=="game" && world.playing
        lowPower=ProcessInfo.processInfo.isLowPowerModeEnabled || ProcessInfo.processInfo.thermalState.rawValue>=ProcessInfo.ThermalState.serious.rawValue
        if screen=="game" && world.playing {
            let duration=min(delta,0.1)
            accumulator+=duration
            var steps=0
            while accumulator>=1/60 && steps<4 {
                var input=validation?.input(world) ?? touch.sample()
                input.look=input.look*preferences.sensitivity
                world.update(input);accumulator-=1/60;steps+=1
                if let boss=world.boss {
                    observedBossPhases.insert(boss.phase)
                    if boss.state=="attack" {observedBossAttacks.insert(boss.attackKind)}
                }
                if world.panel != .none {touch.reset()}
            }
            if steps==4 {accumulator=0}
            metricsTime+=delta;metricsFrames+=1;frameSamples.append(delta)
            let area=world.save.area.rawValue
            areaSamples[area,default:[]].append(delta)
            if areaSamples[area,default:[]].count>3600{areaSamples[area]?.removeFirst(1800)}
            if frameSamples.count>7200 {frameSamples.removeFirst(3600)}
            if metricsFrames%600==0 {writeMetrics()}
            if world.saveRevision != savedRevision {persist()}
        } else {accumulator=0}
        let syncStart=ProcessInfo.processInfo.systemUptime
        renderer.sync(world,delta:Float(min(delta,0.05)),lowPower:effectiveQuality == .performance)
        if screen=="game" && world.playing {
            syncSamples.append((ProcessInfo.processInfo.systemUptime-syncStart)*1000)
            if syncSamples.count>3600 {syncSamples.removeFirst(1800)}
        }
        for e in world.events {audio.event(e.kind,preferences:preferences)}
        world.events.removeAll(keepingCapacity:true)
        let song=screen=="title" ? "TITLE" : world.save.completed && world.panel == .complete ? "VICTORY" : world.save.area == .boss ? "BOSS" : world.combatActive ? "BATTLE" : world.save.area == .dungeon ? "DUNGEON":"WORLD"
        if song != lastBGM {audio.play(song,preferences:preferences);lastBGM=song}
        audio.suspended=screen=="game" && world.panel != .none && world.panel != .complete
        audio.environment(tension:world.tension.level,enabled:screen=="game" && world.save.area != .village,combat:world.combatActive,preferences:preferences)
        frame+=1;if frame%3==0 {revision+=1}
        if let validation {
            let completions=validation.completions
            validation.observe(world)
            if validation.completions>completions {writeMetrics()}
            if validation.shouldRestart {world=GameWorld(content:content);renderer.invalidate();validation.restart()}
        }
    }
    func writeMetrics() {
        guard let store else{return}
        let sorted=frameSamples.sorted()
        let p95=sorted.isEmpty ? 0 : sorted[min(sorted.count-1,Int(Double(sorted.count)*0.95))]*1000
        let perArea=areaSamples.mapValues{samples->[String:Double] in let sorted=samples.sorted();return["frames":Double(samples.count),"averageFPS":Double(samples.count)/max(0.001,samples.reduce(0,+)),"p95FrameMS":sorted[min(sorted.count-1,Int(Double(sorted.count)*0.95))]*1000]}
        let rendering=renderer.ink.diagnostics
        let record:[String:Any]=["seconds":metricsTime,"frames":metricsFrames,"averageFPS":metricsTime>0 ? Double(metricsFrames)/metricsTime:0,"p95FrameMS":p95,"perArea":perArea,"woodblockShader":rendering.active,"renderPixels":[rendering.width,rendering.height],"assetFailures":renderer.assetFailures,"thermalState":ProcessInfo.processInfo.thermalState.rawValue,"lowPower":lowPower,"area":world.save.area.rawValue,"chapterComplete":world.save.completed,"validation":validation?.report ?? [:],"version":Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "?","developerTest":developerTesting,"difficulty":world.save.difficulty.rawValue,"loadedBossArt":renderer.loadedBossArt ?? ""]
        var output=record
        let syncSorted=syncSamples.sorted()
        output["rendererSyncCPUWallMeanMS"]=syncSamples.reduce(0,+)/Double(max(1,syncSamples.count))
        output["rendererSyncCPUWallP95MS"]=syncSorted.isEmpty ? 0:syncSorted[min(syncSorted.count-1,Int(Double(syncSorted.count)*0.95))]
        output["gpuTiming"]="not measured"
        output["observedBossPhases"]=observedBossPhases.sorted()
        output["observedBossAttacks"]=observedBossAttacks.sorted()
        output["tension"]=world.tension.level
        output["quality"]=effectiveQuality.rawValue
        output["requestedQuality"]=(preferences.quality ?? .balanced).rawValue
        if let boss=world.boss {output["bossPosition"]=[boss.position.x,boss.position.z];output["bossState"]=boss.state;output["bossPhase"]=boss.phase;output["bossAttackKind"]=boss.attackKind}
        let directory=developerTesting ? developerDirectory!:store.directory
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--diagnostics-console"),let data=try? JSONSerialization.data(withJSONObject:output,options:[.sortedKeys]),let json=String(data:data,encoding:.utf8) {
            print("LABYRINTH_METRICS "+json);reportProtectedSaveHashes()
        }
        #endif
        if let data=try? JSONSerialization.data(withJSONObject:output,options:[.prettyPrinted,.sortedKeys]) {
            try? FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true)
            try? data.write(to:directory.appendingPathComponent("metrics.json"),options:.atomic)
            if developerTesting{try? data.write(to:directory.appendingPathComponent("metrics-\(world.save.difficulty.rawValue).json"),options:.atomic)}
        }
    }
    #if DEBUG
    private func reportProtectedSaveHashes() {
        guard ProcessInfo.processInfo.arguments.contains("--diagnostics-console"),let directory=protectedJourney else{return}
        var hashes:[String:String]=[:]
        for name in ["journey.json","journey.backup.json"] {
            if let data=try? Data(contentsOf:directory.appendingPathComponent(name)) {hashes[name]=SHA256.hash(data:data).map{String(format:"%02x",$0)}.joined()}
        }
        if let data=try? JSONSerialization.data(withJSONObject:hashes,options:[.sortedKeys]),let json=String(data:data,encoding:.utf8) {print("LABYRINTH_SAVE_HASHES "+json)}
    }
    #endif
}

@MainActor final class GameAudio {
    var root:URL!
    private var music:AVAudioPlayer?
    private var ambience:AVAudioPlayer?
    private var ambienceLevel:Float = 0
    private var players:[AVAudioPlayer]=[]
    var suspended=false {didSet {if suspended {music?.pause();ambience?.pause()} else if oldValue {music?.play();if ambienceLevel>0 {ambience?.play()}}}}
    func play(_ name:String,preferences:Preferences) {
        guard root != nil else{return}
        do {
            try AVAudioSession.sharedInstance().setCategory(.ambient,mode:.default,options:[.mixWithOthers])
            try AVAudioSession.sharedInstance().setActive(true)
            let player=try AVAudioPlayer(contentsOf:root.appendingPathComponent("Audio/\(name).caf"))
            player.numberOfLoops=name=="VICTORY" || name=="GAMEOVER" ? 0:-1;player.volume=preferences.music
            music?.stop();music=player;if !suspended {player.play()}
        } catch {print("Audio unavailable: \(name): \(error.localizedDescription)")}
    }
    func environment(tension:Float,enabled:Bool,combat:Bool,preferences:Preferences) {
        ambienceLevel=enabled ? preferences.sound*(0.04+tension*0.10)*(combat ? 0.45:1):0
        if ambience==nil,enabled {
            ambience=try? AVAudioPlayer(contentsOf:root.appendingPathComponent("Audio/FOREST.caf"))
            ambience?.numberOfLoops = -1
        }
        ambience?.volume=ambienceLevel
        if ambienceLevel>0 && !suspended {if ambience?.isPlaying==false {ambience?.play()}}
        else {ambience?.pause()}
    }
    func pause() {music?.pause();ambience?.pause()}
    func setVolumes(_ preferences:Preferences) {music?.volume=preferences.music}
    func event(_ name:String,preferences:Preferences) {
        let names=["boss_swing":"slice_2","boss_step":"break_wood","boss_phase":"soul","ambient_wood":"break_wood","ambient_step":"step_dirt_1","swing":"slice_1","strong":"slice_2","hit":"hit_1","hurt":"hit_heavy","parry":"parry","guard":"guard_1","dodge":"dodge_1","pickup":"pickup","soul":"soul","coin":"coin","heal":"bell","door":"door_open","break":"break_wood","warning":"draw","slam":"break_heavy","travel":"page","throw":"sheathe","cancel":"cancel","step_dirt":"step_dirt_1","step_grass":"step_grass_1"]
        if let file=names[name],let p=try? AVAudioPlayer(contentsOf:root.appendingPathComponent("Audio/\(file).m4a")) {
            players.removeAll{!$0.isPlaying};if players.count<12 {if name.hasPrefix("boss_"){p.enableRate=true;p.rate=0.72};p.volume=preferences.sound*(name.hasPrefix("ambient_") ? 0.16:name=="boss_step" ? 0.25:1);p.play();players.append(p)}
        }
        guard preferences.haptics else{return}
        if name=="parry" {UINotificationFeedbackGenerator().notificationOccurred(.success)}
        else if ["hurt","slam"].contains(name) {UIImpactFeedbackGenerator(style:.heavy).impactOccurred()}
        else if ["hit","pickup","door"].contains(name) {UIImpactFeedbackGenerator(style:.light).impactOccurred()}
    }
}
