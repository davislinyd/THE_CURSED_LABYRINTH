# 幽燈魔境 · iPhone 原生版

Swift 6、RealityKit 非 AR、SwiftUI 與 UIKit 多點觸控。最低 iOS 26，只支援 iPhone 橫向。程式、工具依賴、轉換素材與建置產物皆位於此目錄。

## 建置

需要 Xcode（含 iOS 26 或以上 SDK）、XcodeGen、Node.js 22 以上、Python 3.14、ffmpeg。從本目錄執行：

```sh
npm ci --prefix Tooling
python3.14 -m venv .venv
.venv/bin/pip install -r Tooling/requirements.txt --cache-dir .cache/pip
zsh Tooling/build.sh
xcrun devicectl list devices
zsh Tooling/install.sh TARGET_UDID
```

簽章使用 Apple Development Team `N964GDJY6A` 與自動佈建；Bundle ID 為 `com.davislinyd.thecursedlabyrinth`。安裝腳本只操作明確指定的裝置。

`project.yml` 是版本與 Xcode 專案的來源。初始 marketing version 為 `1.0`；每次實機交付或 TestFlight 上傳前遞增 `CURRENT_PROJECT_VERSION`，不得重用已交付的 build。網頁版本不跟隨變更。實機安裝建置 `.app`；使用者要求 TestFlight 發佈時，產生 Release archive 並透過 App Store Connect 上傳，產物留在忽略的 `build/`，不製作 ZIP。

2026-11-10 首次 TestFlight 上傳為 `1.0` build `12`（App Store Connect App ID `6832804838`）。build `11` 先行上傳，build `12` 補入 `UserDefaults` 隱私 API 用途宣告及不使用非豁免加密的宣告；後續測試以 build `12` 為準。上傳成功與 Apple 處理／可供測試狀態分別記錄於 `VALIDATION.md`。

## 開發者測試（Debug）

標題頁點「開發者測試」，選擇難度即可直接進入 Boss 戰；一般／簡單為戰死武將，困難為鬼化武將。測試角色為 Lv.3，攜帶各 9 個藥草、靈藥與符咒。暫停頁可「重設戰鬥」或「切換型態」；死亡後重試仍從 Boss 場地開始。

測試進度僅存於記憶體，不寫入 `Journey` 或 `UITestJourney`；返回標題時重新載入原有旅程。診斷資料另外寫入 `DeveloperJourney/metrics-{difficulty}.json`。入口與直接跳關程式僅在 Debug 編譯，Release 不提供。命令列可使用 `--boss-test normal` 或 `--boss-test hard` 啟動相同模式；不必加 `--validate`。

最新實機開發版為 `1.0 (22)`；只安裝開發簽章 App，TestFlight 的既有 build `12` 不受影響。

## 資料與素材

`Tooling/export-data.mjs` 唯讀讀取上層原版的地圖、對話、數值、翻譯與 MML 樂譜；工具使用自己的 Node 依賴。`export-art.mjs` 在建置時執行原版程序模型與場景生成器，匯出關節階層、網格、材質和動畫軌跡；Three.js 不隨 App 執行。Swift／RealityKit 負責載入與播放原生資產。

美術管線保留原版武士的 13 組動畫、四種敵人及五種村民造型。iOS Boss 改用 Blender 製作的戰死武將；簡單／普通模式載入 `rotroot`，困難模式載入 `rotroot_wraith` 鬼化型。內部 Boss 識別碼與戰鬥時序沿用 `rotroot`。大型場景按空間與材質合併，地面道路遮罩離線烘焙，頂點色轉成三角形材質圖集以保留風化顏色。

Boss 的 iOS 專用原始檔為 `ArtSource/colossus_horror.blend`，重建腳本為同目錄的 `colossus_horror.py`（Blender CLI `--background --python ArtSource/colossus_horror.py`）。兩款 GLB 位於 `ArtSource/export/`，由 iOS 匯出器直接讀取，無須執行網頁素材建置。模型使用剛性骨架部件、十一組 NLA 動作與舊化霧面材質。胸腰、肩肘腕與膝踝分節，以離線雙節肢體解算保持攻擊時雙腳落地；前進、後退與左右側移沿用步態相位，播放速度隨移動速度累積，姿勢切換使用目前畫面交叉淡入。依外觀修正將每款預算調整為 24,000 三角面、64 個節點、3 種材質；`validate-art.mjs` 同時檢查骨架階層、十一組動作時長、朝向、巨物比例及表面粗糙度。

`prepare-assets.py` 轉換 GLB 為 USDZ、WebP 為 PNG、WOFF2 為原生字型，並用原始樂器取樣離線渲染樂譜為 ALAC CAF。原創取樣器的混音、殘響以離線版本重現，並非逐位元相同音訊。

轉換產物在 `Resources/Generated/`；App 圖示在 `Resources/Assets.xcassets/`。兩者均為忽略的可重建產物。美術匯出成功後才更換輸出目錄，上一份產物保留在 `build/art-backup-*`。`Resources/Generated/manifest.json` 記錄輸出 SHA-256。授權與原始 CREDITS 隨 App 離線附帶。刪除特定 CAF 後重建可更新配樂；不得執行上層 `npm run assets` 作為 iOS 建置步驟。

## 遊戲與操作

第一章包含平原、村莊、古道、洞窟與戰死武將（困難模式為鬼化武將）；取得青銅鏡後顯示第一章完成。原生版使用原版武士、一般敵人與場景資產，Boss 採獨立 Blender 模型。RealityKit 非 AR 視圖搭配原生 Metal 墨線、紙紋、色調、探索霧及受擊效果；UI 保持裝置解析度，3D framebuffer 使用較低解析度降低負載。

- 左搖桿推幅決定走跑；走路恢復疲勞，只有跑步消耗。
- 右側為普攻、重擊、防禦與閃避；按住防禦，在命中前約 8 個邏輯 tick 內可彈開，再按普攻反擊。
- 保留三段劍法、刀光、受擊停頓、反擊慢動作、敵人受擊閃光與粒子。停頓期間仍記住攻擊、重擊、閃避及道具輸入。
- 敵人保留各自的追擊與突進節奏。武將會逼近玩家，在攻擊間隔側移或退步調整距離；鬼化型追擊更快。移動受圓形場地與角色間距限制，斬落與橫掃鎖定方向；遠距離突進先預警、沿既定方向接近並在落刀前停步。65%／30% 血量進入新階段，二階段起加入橫掃接重斬的有限連擊，第二刀保留完整前搖；武器落地及失衡狀態提供反擊機會。
- 右側空白處拖曳第三人稱鏡頭；自動選敵輔助轉向。
- 道具按鈕使用當前道具，`↻` 切換；附近可互動時顯示調查按鈕。
- 暫停提供設定與返回標題；地圖頁可以選擇道具。

邏輯固定 60 Hz，渲染跟隨顯示更新。核心模型不依賴 RealityKit 或 UIKit。碰撞、視線、戰鬥時序及存檔規則在 `Sources/Core`。

## 存檔與生命週期

本 App 獨立儲存於 Application Support/Journey，不讀取網頁 LocalStorage。JSON 使用版本 1、原子寫入及上一份有效備份。探索定期保存安全狀態；戰鬥保存戰前快照，系統終止後回戰前。Boss 從入口重試。死亡不限接關次數，生命回滿、金錢減半，回最近檢查點。

切背景及音訊中斷會暫停；回到前景仍須玩家恢復。遊玩時停用自動鎖屏，暫停與背景恢復系統行為。音訊尊重靜音模式，允許其他音訊混音。

## 驗證

```sh
swift test --scratch-path build/swift
xcodebuild -project CursedLabyrinth.xcodeproj -scheme CursedLabyrinth \
  -destination 'platform=iOS,id=TARGET_UDID' -derivedDataPath build/DerivedData \
  -resultBundlePath build/UI.xcresult -allowProvisioningUpdates test
```

核心整章測試以三種難度執行。`ValidationDriver` 送出正常移動、戰鬥及互動輸入，走過村莊交易、旅店、古道、洞窟道具及 Boss；不直接設定通關旗標、傳送或修改傷害。Debug App 可用 `--validate` 啟動相同驅動器循環測試，測試過程不寫入玩家存檔。UI 測試使用 `--ui-testing` 的獨立存檔與設定，不覆蓋玩家旅程。

實機長時間測試會在 App 的 `Library/Application Support/Journey/metrics.json` 產生版本、各區域畫面更新時間、熱狀態、Metal shader 狀態、資產載入錯誤、章節里程碑與通關次數。啟動 Debug 驗證模式後，可在 Mac 收集證據：

```sh
xcrun devicectl device process launch --device TARGET_UDID --terminate-existing \
  com.davislinyd.thecursedlabyrinth -- --validate
python3 Tooling/monitor-device.py --device TARGET_UDID --build BUILD_NUMBER --seconds 1200
```

監看工具只讀取本 App 的 metrics 並在區域切換時截圖；會檢查版本、連續運行時間、通關及載入狀態。這些是 App 端觀測，不等於 Instruments GPU 分析，也不取代真人多指操作與聲音驗收。效能應以實測數值呈現，不以目標 60 fps 當作驗收結果。

實際測試結果記錄於此目錄的 `VALIDATION.md`；建置證據、截圖及 xcresult 留在忽略的 `build/`。尚未驗證的項目必須明確保留。

## 2026-11-11 戰鬥與環境增量

`BossRhythm` 集中追擊、轉身、失衡與冷卻參數；新增突進及二段攻擊組合，沿用斬落／橫掃命中時間軸，並新增 iOS 專用 charge 動作，在第 42 tick 停步、48 tick 落刀。`TensionDirector` 只控制區域補光、霧與間歇環境聲，不改任務、傷害或存檔。地面預警共用實際命中半徑並快取 Mesh。完整狀態及未完成項目見 `DEVELOPMENT_PROGRESS.md`；目前不是 PS4 畫質或穩定 60 FPS 驗收完成。

高溫（serious／critical）或低電量模式會將 3D content scale 從 2 降至 1.5，僅在狀態改變時重新配置；SwiftUI 保持原解析度。停用的遠距敵人不更新動畫，警告形狀與材質均快取。

## Build 22 的畫質、音訊與測試

設定提供 Performance／Balanced／High：3D content scale 1.5／2／2.5，陰影距離 0／24／30，粒子總數上限 30／60／90。節能或 serious 熱狀態強制使用 Performance；舊設定檔缺少 quality 欄位時沿用 Balanced，玩家 SaveState schema 不變。

`prepare-atmosphere.py` 離線產生原創風聲，間歇留白並隨張力調整音量；村莊停止、戰鬥降低音量，暫停與背景一併暫停。Boss 有依實際移動距離觸發的腳步聲、落刀聲與階段色光。

已有完整 Generated/Art 時，可用 `node Tooling/export-art.mjs --boss-only` 更新兩個 Boss，保留場景。這輪沒有重新讀取工作期間其他來源變更的 Web 場景產物。所有共享 Blender 源檔保持原樣。

Debug `--ui-testing --boss-test normal --validate` 使用既有 ValidationDriver 真實輸入挑戰（困難改 hard）；開局先觀察遠距前搖，仍是記憶體測試進度，無正式存檔寫入。metrics 記錄實際出現的階段與招式。`monitor-device.py --store UITestJourney --stop-at-serious` 可對測試巡迴讀取證據，達 serious 時提早停止並標示未達長測門檻。

Boss 階段標記在跨越血量門檻時立即更新，但不重設目前攻擊的 tick、朝向或命中窗口；下一次行動使用新階段的節奏。突進起手距離上限 8.1 m，確保 2.205 m 的固定方向位移後能打到未迴避的玩家。

檔案傳輸服務卡住時可用 `--diagnostics-console`：Debug 只輸出 metrics 與 Journey 主檔／備份的 SHA-256，不輸出存檔內容。`python3 Tooling/monitor-console.py --device TARGET_UDID --build BUILD --seconds 900 --stop-at-serious` 會以 UITestJourney 正常輸入巡迴、收集主控台證據並在 serious 提早停止。

## 半身恐怖巨像（build 24 已實機安裝，使用者驗收通過）

Boss 改為約 55.8 m 半身腐神，普通／鬼化各 164,856／165,488 triangles、54 nodes、6 materials；頭部與巨手為體素融合／離線細分雕塑，執行時不做細分。原有約 4.4 萬面版本保留於 ArtSource/colossus.py。主要來源為 colossus_horror.py、horror_sculpt.py 與 colossus_horror.blend。焦皮貼圖由內建 imagegen 產生，位於 ArtSource/Textures/ashen-hide-v1.png，完整提示詞保存在同目錄 .prompt.txt，貼圖已封裝進 Blender 與 GLB。

本體固定在火山祭壇後方，以 NativeColossus 的雙節肢體解算把巨手送到實際戰鬥接觸點；ColossusPose 共用命中時鐘，掌背封印於前搖結束後提供反擊窗口。Boss 場地改為開放熔岩火山；鏡頭改為玩家後方仰視，普通地圖與 Web 不變。

build 24 本機建置、美術與針對性 Boss 核心檢查通過。2026-11-12 已透過既有 USB 配對與 streaming 安裝至 iPhone 15 Pro（iOS 27.0.1），裝置安裝資料確認為 1.0 (24)；CoreDevice 仍逾時，因此使用忽略目錄中的 pymobiledevice3 備援流程。僅安裝、查詢版本與唯讀存檔核對，未追加遊戲測試或自動啟動。2026-11-12 使用者將 build 24 設為驗收通過；未另行量測 build 24 的 FPS，不能用舊 build 22 的效能數據代表。
