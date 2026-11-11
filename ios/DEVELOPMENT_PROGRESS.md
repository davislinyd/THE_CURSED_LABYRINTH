# iOS cinematic combat 進度

- 分支：feature/ios-cinematic-combat-upgrade；起點 3cdb464。2026-11-12 提交（a2242d7）並以 --no-ff 合併回 main（295532f），main 與本分支均已 push。
- 原有網頁及 iOS 未提交變更均保留；非 iOS 初始 SHA-256 清單：build/cinematic/non-ios-before.json。
- Phase 1：iPhone 15 Pro／iOS 27.0.1／USB paired／Developer Mode enabled。正式 Journey 已唯讀複製至 build/cinematic/player-before。原始 11 組核心測試及三難度整章通過。
- Phase 2：BossRhythm 集中追擊、轉向、恢復參數；突進斬、二段連擊、65%／30% 階段。保留既有動畫命中 sample；攻擊鎖定方向。第一輪 11 組核心回歸通過。
- Phase 3：重用現有兩型態十組動畫，突進用斬落、連擊用橫掃接斬落；尚未修改 Blender 或新增專用動畫。階段粒子／音效已接入，待裝置驗證。
- Phase 4：確定性 TensionDirector、村莊安全、600–960 ticks 環境聲間隔、區域補光與距離霧；暫停不推進。尚未新增場景模型。
- Phase 5：Boss 警告 Mesh 改快取並修正警告範圍與傷害半徑不一致；降低墨線與紙紋強度。沿用現有低電量／高溫降級，未新增三檔畫質。
- 建置中：1.0 (17)。遵守原有 marketing 1.0 + 遞增 build 慣例，僅 Debug .app，不產生 archive／IPA／ZIP、不上傳。
- 下一步：完成 build 17、核心新增測試、XCTest 實機回歸、短／長程 metrics、Journey 雜湊及非 iOS 隔離比對。
- 高成本操作：完整 export-art 已啟動一次；除非美術變更或輸出失敗，不重複整套匯出。build 16 的 0 秒 metrics 是暫停狀態，不能當效能基準。

## 實機驗證進展

- build 17：15 組核心測試通過，三難度整章通過；XCTest 開發者入口／重設／普通與鬼化模型及原有操作生命週期案例通過。
- 第一章實機已完成 1 次；新增 tour UI 案例因通關 modal 自動重開期間點暫停失敗，已修正等待重開條件並重跑。不得將首次 suite 視為全通過。
- build 16 基準：61.9 秒、48.48 FPS、P95 44.98 ms、nominal；build 17 首輪約 160.8 秒、48.51 FPS、P95 45.83 ms、fair。採樣區域與 tracing 負載不同，不能推論改善百分比。
- 20.98 秒 Metal trace 已確認遊戲 PID；CPU sync inclusive 13.36%、動畫 2.99%、鏡頭避障 2.01%。GPU channel interval 摘要不是 GPU frame time，不能拿來宣稱 GPU 60 FPS。最初誤配 Runner 的 metal-17.trace 不可使用。
- 正式 Journey 主檔及備份 SHA-256 前後一致；證據 save-verification.json。非 iOS 原始檔案雜湊仍一致。
- Blender MCP 背景工具缺少 BLENDER_PATH；改用已連線 Blender 提供的 /Applications/Blender.app/Contents/MacOS/Blender 唯讀檢查共享 bosses.blend。58 objects、20 actions、沒有缺失圖片；未修改／匯出模型。
- 裝置重複測試後達 serious，不追加 15 分鐘燒機。build 18 將補上 3D scale 2 → 1.5 熱降級（UI 不降解析度）、遠處停用敵人不取樣動畫、警告材質快取；待增量建置與短測。


## 2026-11-11 晚間接續：build 20–22

- 模型切換後沿用現有分支與工作樹；未啟動 subagent、未重做基準／整套美術。Web 有其他來源同期變更，不能再將整體非 iOS diff 宣稱為空；本 Agent 的寫入仍全部在 ios/。
- 已建立 ArtSource/bosses.py、boss_motion.py、bosses.blend 與 export/；共享 scripts/blender 原檔 SHA-256 保持原樣。新增 charge 動作：12–42 ticks 跨步、48 ticks 落刀，兩型態仍為 22,412／23,624 triangles。驗證 17 份資產、59 組動畫，固定落腳漂移小於 0.000002 m。Blender 離線 24／48 frame 預覽已檢視，不能當實機畫面。
- export-art --boss-only 保留已驗證的場景，只更新 Boss；build.sh 在 iOS Boss 缺失或來源較新時重建。原創風聲由 prepare-atmosphere.py 生成；目前 Generated manifest 268 檔案全數驗證。
- Performance／Balanced／High 已接上設定：scale 1.5／2／2.5、陰影 0／24／30、粒子上限 30／60／90，舊 Preferences 可讀。高溫／低電量強制 Performance。火花 Mesh／材質已快取。
- 區域月光／補光、村莊暖色、階段色光、Boss 腳步／落刀聲、間歇風聲與戰鬥壓低音量、突進／連擊預警顏色已整合。完整主觀音效／觸控仍未驗收。
- 核心實測抓出階段延後造成普通難度可能跳過第三階段，已修正成即時標記、不打斷當前動作。另將突進起手距離限制 8.1 m，新增靜止目標完整前搖與命中測試。
- 18 組核心測試及三難度第一章通過（core-22.log）。三難度 Boss practice 都通關並出現三階段與突進／連擊。
- build 21 四項 iPhone XCTest 全通過：普通／困難 Boss 實際通關、整章巡迴、開發者重設雙型態、三檔畫質選擇與背景恢復；UI-21.xcresult。build 22 已安裝並用 console 確認普通／困難通關、observed phases [1,2,3]，正常含 attacks [0,1,2,3]，困難含 [1,2,3]。
- 裝置檔案傳輸卡住，重新 USB 連接後仍逾時，已停止重試；改用 Debug console 收集 metrics 與正式存檔雜湊。普通／困難測試前後 Journey 與備份均與最初 SHA-256 一致。
- build 22 冷啟動普通 12.50 s／35.60 FPS／P95 80.01 ms，困難 14.36 s／37.27 FPS／P95 82.56 ms，nominal，Balanced 1704×786，無資產錯誤。不能用舊 build 19 較高 FPS 代替；新版效能仍未達標。
- 正在執行 build 22 900 秒上限的正常輸入巡迴，遇 serious 提早停止；證據 build/soak-console-22/。結束後檢查 result.json、更新 VALIDATION 與本檔，將 App 留在正式標題而非測試旅程。
- 版本：marketing 1.0 + 遞增 build（20→21→22），只有 Debug .app，無 archive／IPA／ZIP、無提交／push／merge／商店發佈。
- 下一步優先：讀連續測試結果；若暖機後仍低 FPS，用新版 trace 確認瓶頸；真人確認 Boss 高位構圖與招式訊號。尚缺完整出場／死亡演出、專用完整連擊 clip、進階場景模型與 PS4 品質驗收。
- 不重複昂貴操作：完整 export-art 只做過最初一次；charge 後用 boss-only。舊 metal-17.trace 是錯誤 Runner target，不可當遊戲 GPU 證據。檔案 copy 已多次卡住，除非連線狀態改變，不再重試。


## 測試方案收斂（使用者要求，2026-11-11）

- 停止追加與重複完整回歸。build 22 長測已結束：907.66 秒、43.63 FPS、P95 50.07 ms，結束 thermal serious；效能驗收未通過，不能因不達標而重跑同一測試。期間正式存檔雜湊一致、資產錯誤空。
- 現有充分證據：18 組核心測試（含三難度整章）、build 21 四項實機 UI 案例全部通過、build 22 普通／困難實際通關。以上不再逐 build 重跑。
- build 23 已完成本機 build／test-bundle 編譯，尚未安裝。變更只涉及 RealityKit 重複元件寫入與室外 chunk 啟用距離；遊戲／存檔核心未改。
- 下一輪最多一次安裝、一次實機工作階段，總上限約 3 分鐘：只執行 testGraphicsProfilesResizeOnly3D；同一輪快速目視 Boss 與室外遠景／裁切，不再挑戰雙型態、通整章或燒機。必要時保存 2–3 張實機圖。尚未執行，不可宣稱通過。
- 後續規則：只有改 Core 才跑對應核心測試；改劇情／區域／存檔才跑整章；改 UI 才跑相關 UI 案例。整套回歸留到一次最終交付。長測只在主要瓶頸已修正、預期結果可改變時另行安排，無新依據不重跑。
- 同類失敗修正後只重跑受影響案例；連續三次相似失敗即停止並交接，不以加測替代開發。


## 半身恐怖巨像重製：build 24

- 使用 Blender MCP 建立新場景、半身巨像與火山祭壇，再以可重建腳本做雕塑修正。原有使用者 Scene 的 Cube／Light／Camera 未刪除。所有來源／輸出均在 ios/；舊半身版 colossus.py／colossus.blend 保留。
- 使用者追加要求逼真、恐懼與更高幾何密度。採用內建 imagegen 一次生成焦皮／骨質 albedo，已複製至 ArtSource/Textures/ashen-hide-v1.png；同目錄 prompt.txt 保存完整提示詞。沒有改用 API CLI，也沒有要求金鑰。
- 頭部深眼窩、長顎、破齒、彎曲骨冠；肋骨與瘦削軀幹；體素融合並離線細分頭與手，烘入實際表面起伏。每型態約 16.5 萬三角面（前一版約 4.4 萬）、54 nodes、6 materials；保留 11 組相容動畫，無即時細分／蒙皮架構遷移。
- 抓到體素網格合併後保留了空 UVMap 的問題，已統一 UVMap 並改用明確投影；validate-art 新增逐個頭部貼圖 draw 的 UV coverage 檢查。眼窩／咽喉使用不受光的暗腔材質，避免反射成灰色圓球。
- 核心：ColossusPose 對齊 40／48 tick 命中，前搖期間封印不可被斬，落掌後反擊；保留 rotroot、三階段、四招與既有通關／存檔。NativeColossus 固定遠方本體、雙節巨臂追隨真實接觸點，換手與連擊重設以緩入曲線過渡。掌背封印對齊邏輯目標，手掌向後偏置避免遮住近戰玩家。
- 場景：獨立 Blender scene_boss.glb，開放熔岩祭壇、火山剪影、尺度小物；沿用原有場地座標／邊界，未改 Web 場景與章節流程。Boss 專用仰視／小角度鎖定鏡頭；降低該場景墨線／紙紋以顯示材質細節。
- 本機 build 24 成功（build/colossus/build-24-ready.log）；17 資產／59 動畫驗證通過（art-ready.log），兩項針對性 Core tests 含三種難度 Boss 真實輸入通關（core-ready.log）。沒有重跑整章、完整 UI 或長測。
- 實機安裝受阻：CoreDevice Failed to allocate RSD device（0xE8000003），使用者 USB 重連後相同；Xcode 單一 Boss 短測亦在 destination Connecting 逾時。已依三次相似失敗規則停止裝置重試，沒有解除安裝、清資料、重設或重複燒機。build 24 未成功安裝，不能宣稱實機外觀或 FPS 已驗證。
- 最終 Blender 圖：build/colossus/horror-final-preview.png（不是 iPhone 截圖）。原始檔 ArtSource/colossus_horror.blend（已封裝貼圖）；重建依賴 horror_sculpt.py。App 身分、簽章、marketing 1.0 保留，build 遞增至 24；只建置 Debug .app，沒有 archive／IPA／ZIP、提交／push／發佈。
- 下一步只在裝置連線確實恢復後安裝 build 24，做一次短畫面確認；不要重複 CoreDevice RSD 失敗命令。真人確認恐怖感、材質與動作是主要待驗收項目。

## 2026-11-12 實機安裝完成

- 本輪依最新要求僅安裝既有 Debug 1.0 (24)，未重新建置、追加遊戲測試或自動啟動。App Info.plist 與封裝資源雜湊核對通過。
- 實際裝置 iPhone 15 Pro／iOS 27.0.1。CoreDevice RSD 失效，重啟使用者的 Mac CoreDeviceService 仍逾時；Xcode Device Hub 顯示 Enable Developer Mode，使用者已確認啟用，但 CoreDevice 連線仍未恢復。不得重複相同失敗命令。
- 備援成功：pymobiledevice3 11.52.1 使用既有 USB 配對直接 streaming 安裝 .app，沒有重建配對或產生 IPA。安裝前裝置版本 22，完成後安裝服務查詢確認 1.0 (24)。證據：`build/colossus/install-24-20261112-usb.log`、`installed-24-usb.json`；工具與快取均在忽略的 build/。
- 正式 Journey 主檔與備份仍存在，唯讀取得雜湊及修改時間；兩檔最後修改於 2026-11-11 23:46:28，早於本次安裝。與更早測試基準不同，沒有本輪安裝前即時快照，不能聲稱雜湊前後一致。未啟動／寫入／還原存檔、解除安裝、清資料或重設。證據：`build/colossus/save-24-post-install.json`。
- 版本慣例維持 marketing 1.0＋遞增 build；24 已備妥但先前未交付，本輪維持 24，不重新封裝、提交、push 或發佈。同步 README、VALIDATION 與本進度；本輪寫入完全位於 ios/，其他來源的 Web dirty 檔案保持原狀。
- 本次安裝要求已完成。下一步由使用者確認恐怖感、材質及動作；新版實機視覺與 FPS 尚未驗收，不自行追加測試。既有 USB 備援環境可重用，不必重新下載依賴；build/colossus/install-usb-24.py 為本次裝置／版本專用。

## 2026-11-12 build 24 驗收

- 使用者將 build 24 設為驗收通過（恐怖感、材質、動作）。本項為使用者判定，未另行量測 build 24 的 FPS；最近一次長測數據仍為 build 22（43.63 FPS，未達標）。
- 上方各段的「待驗收」為當時紀錄，build 24 部分以本段為準。iOS 分支已合併回 main（295532f）並 push；未封裝、上傳 TestFlight 或發佈。
