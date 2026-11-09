import SwiftUI
import RealityKit
import AVFoundation

@main struct CursedLabyrinthApp:App {
    @State private var session=GameSession()
    @Environment(\.scenePhase) private var phase
    var body:some SwiftUI.Scene {
        WindowGroup {
            GameView(session:session).preferredColorScheme(.dark).statusBarHidden()
                .onChange(of:phase) {_,value in if value != .active {session.background()}}
                .onReceive(NotificationCenter.default.publisher(for:AVAudioSession.interruptionNotification)) {notification in
                    if (notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt)==AVAudioSession.InterruptionType.began.rawValue {session.pause()}
                }
        }
    }
}

private let ink=Color(red:0.055,green:0.075,blue:0.12)
private let paper=Color(red:0.91,green:0.85,blue:0.72)
private let gold=Color(red:0.76,green:0.61,blue:0.37)
private let vermilion=Color(red:0.55,green:0.14,blue:0.13)

struct GameView:View {
    @Bindable var session:GameSession
    @State private var confirmNew=false
    @State private var credits=false
    var body:some View {
        let _=session.revision
        ZStack {
            ink.ignoresSafeArea()
            if session.loaded {
                NativeGameSurface(session:session).ignoresSafeArea().allowsHitTesting(false)
                PaperTexture().opacity(0.055).blendMode(.screen).ignoresSafeArea().allowsHitTesting(false)
                if session.artReady {switch session.screen {
                case "title":title
                case "intro":intro
                default:game
                }}
                if !session.artReady {ink.ignoresSafeArea();ProgressView(session.text("LOADING")).tint(gold)}
            } else {ProgressView(session.text("LOADING")).tint(gold)}
            if session.settingsVisible {SettingsPanel(session:session)}
            if session.difficultyVisible {difficulty}
            if credits {creditsPanel}
        }
        .foregroundStyle(paper)
        .alert(session.loaded ? session.text("SAVE FAILED") : (session.zh ? "無法載入遊戲":"Unable to load game"),isPresented:Binding(get:{session.error != nil},set:{if !$0{session.error=nil}})) {
            Button(session.text("RETRY")){session.error=nil;session.persist()}
        } message:{Text(session.error ?? "")}
        .confirmationDialog(session.text("START ANEW?"),isPresented:$confirmNew,titleVisibility:.visible) {
            Button(session.text("CONFIRM"),role:.destructive){session.difficultyVisible=true}
        }
    }
    private var title:some View {
        ZStack {
            LinearGradient(colors:[ink.opacity(0.96),ink.opacity(0.4),ink.opacity(0.8)],startPoint:.leading,endPoint:.trailing).ignoresSafeArea()
            HStack(alignment:.center,spacing:50) {
                VStack(alignment:.leading,spacing:12) {
                    Text("K A G E M A R U").font(.system(size:10,weight:.medium,design:.serif)).tracking(5).foregroundStyle(gold)
                    Text("幽燈魔境").font(.custom("NotoSerifTC-Regular",size:48)).tracking(6).shadow(color:.black,radius:5)
                    Text("THE CURSED\nLABYRINTH").font(.custom("Cinzel-Regular",size:21)).tracking(4).lineSpacing(2)
                    Rectangle().fill(gold).frame(width:54,height:1).padding(.vertical,5)
                    Text(session.zh ? "第一章・朽木的封印":"CHAPTER I · THE ROTWOOD SEAL").font(.system(size:12,design:.serif)).foregroundStyle(gold)
                }
                Spacer(minLength:0)
                VStack(spacing:12) {
                    if session.hasSave {menuButton("CONTINUE",id:"continue"){session.continueGame()}}
                    menuButton("NEW JOURNEY",id:"new-game"){if session.hasSave {confirmNew=true}else{session.difficultyVisible=true}}
                    menuButton("SETTINGS",id:"settings"){session.settingsVisible=true}
                    Button(session.text("CREDITS")){credits=true}.font(.system(size:12)).foregroundStyle(gold).padding(.top,10)
                }.frame(width:220)
            }.padding(.horizontal,44)
            VStack {Spacer();HStack {Text(session.text("OFFLINE")).tracking(2);Spacer();Text("\(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—") · \(Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "—")")}.font(.system(size:9,weight:.medium)).foregroundStyle(paper.opacity(0.45))}.padding(.horizontal,30).padding(.bottom,12)
        }
    }
    private func menuButton(_ key:String,id:String,action:@escaping()->Void)->some View {
        Button(action:action) {HStack{Text(session.text(key));Spacer();Image(systemName:"chevron.right").font(.system(size:10))}.font(.system(size:16,weight:.medium,design:.serif)).padding(.horizontal,20).frame(height:50).background(ink.opacity(0.85),in:RoundedRectangle(cornerRadius:10)).overlay(RoundedRectangle(cornerRadius:10).stroke(gold.opacity(0.6),lineWidth:0.8))}.accessibilityIdentifier(id)
    }
    private var intro:some View {
        ZStack {
            ink.opacity(0.95).ignoresSafeArea()
            VStack(spacing:22) {
                Text("序 · PROLOGUE").font(.system(size:11,design:.serif)).tracking(6).foregroundStyle(gold)
                Text(session.text(session.content.intro[min(session.introPage,session.content.intro.count-1)])).font(.system(size:22,design:.serif)).lineSpacing(12).multilineTextAlignment(.center).frame(maxWidth:620,minHeight:110)
                HStack(spacing:7){ForEach(0..<session.content.intro.count,id:\.self){i in Circle().fill(i==session.introPage ? gold:gold.opacity(0.2)).frame(width:5,height:5)}}
                HStack(spacing:50) {
                    Button(session.text("SKIP")){session.startPlaying()}.accessibilityIdentifier("intro.skip")
                    Button(session.text("NEXT")){if session.introPage+1>=session.content.intro.count {session.startPlaying()}else{session.introPage+=1}}.accessibilityIdentifier("intro.next")
                }.font(.system(size:14)).foregroundStyle(gold).padding(.top,8)
            }.padding(30)
        }
    }
    private var game:some View {
        ZStack {
            if session.world.panel == .none {TouchControls(session:session,revision:session.controlRevision).ignoresSafeArea()}
            VStack(spacing:0) {
                HStack(alignment:.top,spacing:16) {
                    VStack(alignment:.leading,spacing:5) {
                        HStack {Text("影丸").font(.system(size:14,weight:.semibold,design:.serif));Text("Lv.\(session.world.save.level)").font(.system(size:10,design:.monospaced)).foregroundStyle(gold)}
                        meter(session.world.save.life/session.world.save.maxLife,color:vermilion,height:7)
                        meter(1-session.world.fatigue.value,color:gold.opacity(0.7),height:3)
                        HStack{Text("\(Int(session.world.save.life)) / \(Int(session.world.save.maxLife))");Spacer();Text("◈ \(session.world.save.gold)")}.font(.system(size:10,design:.monospaced)).foregroundStyle(paper.opacity(0.8))
                    }.frame(width:160).padding(11).background(ink.opacity(0.72),in:RoundedRectangle(cornerRadius:10))
                    Spacer()
                    VStack(spacing:5) {
                        Text(session.text(session.world.save.area.title)).font(.system(size:16,weight:.medium,design:.serif)).tracking(2).shadow(color:.black,radius:3)
                        if let boss=session.world.boss {meter(boss.hp/boss.maxHP,color:vermilion,height:5).frame(width:200)}
                        if session.lowPower {Text(session.text("REDUCED EFFECTS")).font(.system(size:9)).foregroundStyle(gold)}
                    }.padding(.top,10)
                    Spacer()
                    Button {session.world.panel = .map;session.touch.reset();session.revision+=1} label:{Minimap(world:session.world,revision:session.mapRevision).frame(width:100,height:80).background(ink.opacity(0.8),in:RoundedRectangle(cornerRadius:8))}.accessibilityIdentifier("map")
                    Button {session.pause()} label:{Image(systemName:"pause.fill").frame(width:44,height:44).background(ink.opacity(0.8),in:Circle())}.accessibilityIdentifier("pause")
                }
                if session.world.toastTicks>0 {Text(session.text(session.world.toast)).font(.system(size:14,weight:.medium,design:.serif)).padding(.horizontal,20).padding(.vertical,8).background(ink.opacity(0.85),in:Capsule()).padding(.top,8)}
                Spacer()
            }.padding(.horizontal,16).padding(.top,8)
            panel
            #if DEBUG
            if session.validation != nil {VStack{Spacer();Text("VALIDATION · \(session.validation?.stage ?? 0)").font(.system(size:8)).accessibilityIdentifier("validation.status")}.allowsHitTesting(false)}
            #endif
        }
    }
    private func meter(_ value:Float,color:Color,height:CGFloat)->some View {
        GeometryReader{g in ZStack(alignment:.leading){Capsule().fill(.black.opacity(0.6));Capsule().fill(color).frame(width:g.size.width*CGFloat(clamp(value,0,1)))}}.frame(height:height)
    }
    @ViewBuilder private var panel:some View {
        switch session.world.panel {
        case .none:EmptyView()
        case .pause:
            Modal(title:session.text("PAUSE")) {
                VStack(spacing:12) {
                    menuButton("RESUME",id:"resume"){session.closePanel()}
                    menuButton("SETTINGS",id:"pause.settings"){session.settingsVisible=true}
                    menuButton("RETURN TO TITLE",id:"return-title"){session.title()}
                    Text(session.text("TOUCH GUIDE")).font(.system(size:11)).foregroundStyle(gold).multilineTextAlignment(.center)
                }.frame(width:330)
            }
        case .message(let lines):
            Modal(title:session.text("JOURNEY")) {
                VStack(spacing:20){ScrollView{Text(lines.map{session.text($0)}.joined(separator:"\n\n")).font(.system(size:17,design:.serif)).lineSpacing(6).frame(maxWidth:540)}.frame(maxHeight:160);Button(session.text("CLOSE")){session.closePanel()}.buttonStyle(PaperButton()).accessibilityIdentifier("dialog.close")}
            }
        case .shop:
            Modal(title:session.text("SHOP")) {
                VStack(spacing:10) {
                    ForEach(Array(session.content.town.shop.enumerated()),id:\.offset){i,item in
                        HStack{Text(session.text(item.item.uppercased()));Text("×\(item.n)").foregroundStyle(gold);Spacer();Text("◈ \(item.price)");Button(session.text("BUY")){session.world.buy(i);session.persist();session.revision+=1}.buttonStyle(PaperButton()).accessibilityIdentifier("buy.\(item.item)")}
                    }
                    Text("◈ \(session.world.save.gold)").foregroundStyle(gold)
                    Button(session.text("CLOSE")){session.closePanel()}.buttonStyle(PaperButton()).accessibilityIdentifier("shop.close")
                }.frame(width:420)
            }
        case .inn:
            Modal(title:session.text("INN")){VStack(spacing:18){Text(session.text("REST FOR 10 GOLD"));Button(session.text("REST")){session.world.rest();session.persist();session.revision+=1}.buttonStyle(PaperButton()).accessibilityIdentifier("inn.rest");Button(session.text("BACK")){session.closePanel()}}}
        case .death:
            Modal(title:session.text("FALLEN")){VStack(spacing:18){Text(session.text("DEATH COST")).foregroundStyle(gold);Button(session.text("TRY AGAIN")){session.world.respawn();session.renderer.invalidate();session.persist();session.touch.reset();session.revision+=1}.buttonStyle(PaperButton()).accessibilityIdentifier("respawn")}}
        case .complete:
            Modal(title:session.text("CHAPTER ONE COMPLETE")){VStack(spacing:16){Image(systemName:"sun.max.circle").font(.system(size:48)).foregroundStyle(gold);Text(session.text("THE BRONZE MIRROR")).font(.system(size:24,design:.serif));Button(session.text("RETURN TO TITLE")){session.title()}.buttonStyle(PaperButton()).accessibilityIdentifier("chapter.complete")}}
        case .map:
            Modal(title:session.text("MAP")){HStack(spacing:24){Minimap(world:session.world,revision:session.revision).frame(width:300,height:230);VStack(alignment:.leading,spacing:12){Text(session.text(session.world.save.area.title)).font(.system(size:18,design:.serif));ForEach(["herb","talisman","elixir"],id:\.self){id in Button{session.world.save.selectedItem=id;session.revision+=1}label:{HStack{Text(session.text(id.uppercased()));Spacer();Text("\(session.world.save.items[id,default:0])")}.foregroundStyle(session.world.save.selectedItem==id ? gold:paper)}};ForEach(session.world.save.keyItems.sorted(),id:\.self){Text(session.text($0.uppercased())).font(.system(size:12)).foregroundStyle(gold)};Button(session.text("CLOSE")){session.closePanel()}.buttonStyle(PaperButton()).accessibilityIdentifier("map.close")}.frame(width:200)}}
        }
    }
    private var difficulty:some View {
        Modal(title:session.text("DIFFICULTY")){VStack(spacing:12){ForEach(Difficulty.allCases,id:\.self){d in Button{session.newGame(d)}label:{Text(session.text(d.rawValue.uppercased())).frame(width:220)}.buttonStyle(PaperButton()).accessibilityIdentifier("difficulty.\(d.rawValue)")};Button(session.text("BACK")){session.difficultyVisible=false}}}
    }
    private var creditsPanel:some View {
        Modal(title:session.text("CREDITS")){VStack{ScrollView{Text((try? String(contentsOf:session.resourceRoot.appendingPathComponent("Licenses/CREDITS.md"),encoding:.utf8)) ?? "").font(.system(size:11)).frame(maxWidth:600,alignment:.leading)}.frame(height:210);Button(session.text("BACK")){credits=false}.buttonStyle(PaperButton())}}
    }
}

struct Modal<ContentView:View>:View {
    var title:String
    @ViewBuilder var content:()->ContentView
    var body:some View {ZStack{Color.black.opacity(0.72).ignoresSafeArea();VStack(spacing:16){Text(title).font(.system(size:23,weight:.medium,design:.serif)).tracking(3).foregroundStyle(gold);Rectangle().fill(gold.opacity(0.35)).frame(height:1);content()}.padding(24).background(ink,in:RoundedRectangle(cornerRadius:18)).overlay(RoundedRectangle(cornerRadius:18).stroke(gold.opacity(0.5),lineWidth:1)).fixedSize(horizontal:false,vertical:true).frame(maxWidth:700).padding(.horizontal,20)}}
}
struct PaperButton:ButtonStyle {
    func makeBody(configuration:Configuration)->some View {configuration.label.font(.system(size:15,weight:.medium)).padding(.horizontal,22).frame(minHeight:44).background(configuration.isPressed ? vermilion:gold.opacity(0.13),in:RoundedRectangle(cornerRadius:8)).overlay(RoundedRectangle(cornerRadius:8).stroke(gold.opacity(0.6),lineWidth:0.7))}
}
struct SettingsPanel:View {
    @Bindable var session:GameSession
    var body:some View {
        Modal(title:session.text("SETTINGS")) {
            ScrollView {
                VStack(spacing:12) {
                    Picker(session.text("LANGUAGE"),selection:$session.preferences.language){Text("繁體中文").tag("zh");Text("English").tag("en")}.pickerStyle(.segmented)
                    HStack{Text(session.text("MUSIC")).frame(width:110,alignment:.leading);Slider(value:$session.preferences.music,in:0...1)}
                    HStack{Text(session.text("SOUND")).frame(width:110,alignment:.leading);Slider(value:$session.preferences.sound,in:0...1)}
                    HStack{Text(session.text("CAMERA")).frame(width:110,alignment:.leading);Slider(value:$session.preferences.sensitivity,in:0.4...2)}
                    Toggle(session.text("HAPTICS"),isOn:$session.preferences.haptics)
                    if session.screen=="game" {Picker(session.text("DIFFICULTY"),selection:Binding(get:{session.world.save.difficulty},set:{session.world.save.difficulty=$0;session.world.checkpointSafe();session.persist()})){ForEach(Difficulty.allCases,id:\.self){Text(session.text($0.rawValue.uppercased())).tag($0)}}.pickerStyle(.segmented)}
                    Button(session.text("BACK")){session.changeSettings();session.settingsVisible=false}.buttonStyle(PaperButton()).accessibilityIdentifier("settings.close")
                }.frame(width:440).padding(2)
            }.frame(maxHeight:250).tint(gold)
            .onChange(of:session.preferences.music){_,_ in session.changeSettings()}
            .onChange(of:session.preferences.sound){_,_ in session.changeSettings()}
        }
    }
}
struct Minimap:View {
    let world:GameWorld
    let revision:Int
    var body:some View {
        Canvas {ctx,size in
            let g=world.grid,s=min((size.width-10)/CGFloat(g.width),(size.height-10)/CGFloat(g.height)),ox=(size.width-CGFloat(g.width)*s)/2,oy=(size.height-CGFloat(g.height)*s)/2
            for y in 0..<g.height {for x in 0..<g.width where world.save.visited.contains(g.key(x,y)) {
                let c=g.char(x,y),blocked=g.blocked(x,y,flags:world.save.flags)
                let color:Color=blocked ? gold.opacity(0.25):paper.opacity(0.55)
                ctx.fill(Path(CGRect(x:ox+CGFloat(x)*s,y:oy+CGFloat(y)*s,width:max(1,s-0.2),height:max(1,s-0.2))),with:.color("CV1GK".contains(c) ? gold:color))
            }}
            let p=world.save.position,x=ox+CGFloat(p.x/g.cell)*s,y=oy+CGFloat(p.z/g.cell)*s
            ctx.fill(Path(ellipseIn:CGRect(x:x-2.5,y:y-2.5,width:5,height:5)),with:.color(.red))
        }.allowsHitTesting(false)
    }
}
struct PaperTexture:View {
    var body:some View {Canvas{ctx,size in for i in 0..<900 {let x=CGFloat((i*73)%997)/997*size.width,y=CGFloat((i*193)%991)/991*size.height;ctx.fill(Path(CGRect(x:x,y:y,width:CGFloat(i%3+1),height:1)),with:.color(.white))}}}
}
