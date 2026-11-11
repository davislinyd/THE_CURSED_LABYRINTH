# iPhone 原生版驗證

## 半身恐怖巨像（build 24 已實機安裝，使用者驗收通過）

- 2026-11-12 使用者將 build 24 設為驗收通過。本項為使用者判定，未另行量測 build 24 的 FPS；最近一次長測數據仍為 build 22（43.63 FPS，未達標）。

- Blender MCP 與 imagegen 完成高密度半身模型／材質，普通 164,856、鬼化 165,488 triangles，各 54 nodes／6 materials；55.8 m 高。17 資產／59 動畫驗證通過，含頭部 UV coverage，見 build/colossus/art-ready.log。
- NativeColossus／ColossusPose 對齊巨掌、掌背封印與原有命中窗口；兩項針對性核心檢查含三難度正常輸入通關通過，見 core-ready.log。Debug build 24 成功，見 build-24-ready.log。
- 初期 CoreDevice 回報 RSD 失效；2026-11-12 使用者確認啟用開發者模式後，CoreDevice 仍逾時。改用 pymobiledevice3 11.52.1，沿用既有 USB 配對直接 streaming 安裝既有簽章 .app 成功；安裝前版本 22，裝置安裝資料確認更新為 1.0 (24)。裝置為 iPhone 15 Pro／iOS 27.0.1。證據：`build/colossus/install-24-20261112-usb.log`、`installed-24-usb.json`。
- 安裝後唯讀取得正式 Journey 主檔／備份雜湊，兩檔均存在，最後修改時間為 2026-11-11 23:46:28，早於本次安裝確認（2026-11-12 00:45）。與較早 build 22 測試基準不同，本輪沒有安裝前即時快照，因此不宣稱安裝前後雜湊一致；沒有啟動遊戲、寫入／還原存檔、解除安裝或清資料。證據：`build/colossus/save-24-post-install.json`。
- 預覽 horror-final-preview.png 為 Blender 圖，不能當作實機證據。新版沒有實機圖／FPS 或真人外觀驗收；本輪僅安裝與唯讀確認，未追加遊戲、UI、整章或長測。版本沿用 1.0＋遞增 build，本輪不再遞增或重新建置；只安裝既有 Debug .app，未產生 archive／IPA／ZIP 或發佈。


## 2026-11-11 測試收斂與長測結果

- build 22 已完成 907.66 秒連續正常輸入巡迴，平均 43.63 FPS、P95 50.07 ms，結束達 serious，依熱門檻停止；效能目標未通過。正式 Journey 主檔及備份雜湊全程一致，資產錯誤空。證據：`build/soak-console-22/result.json`。
- 已有 18 組核心測試、build 21 四項實機 UI 全通過及 build 22 雙型態通關證據，不再每個 build 重跑。
- build 23 已建置但尚未安裝；只剩一次、約三分鐘上限的三檔 framebuffer 尺寸切換與戶外裁切目視驗證。其他整章、Boss 與長測暫不追加。使用者於本輪要求重新規劃測試；詳見 DEVELOPMENT_PROGRESS.md 最新節。


## 2026-11-11 iOS 戰鬥／環境增量（build 17–19）

- 分支 `feature/ios-cinematic-combat-upgrade`，起點 `3cdb464`。保護開始時的 Web 與 iOS 未提交修改；本輪程式與文件只改 `ios/`，未 push、merge、發佈或提交。
- Boss 新增固定方向突進斬與橫掃接重斬二段組合；65%／30% 階段只在不攻擊時切換。加速追擊、有限轉向、縮短額外冷卻與失衡；保留 40／48 ticks 前搖與既有動畫命中取樣。這是重用現有動作的組合，沒有新增 Blender clip、蒙皮或模型。
- 張力系統只改表現，不動存檔／傷害／劇情。安全村莊不觸發聲音，環境聲間隔 600–960 ticks、低音量；區域與敵人／入口距離控制補光及低成本距離霧。沒有新增環境模型、巡邏或完整多層環境音樂混音。
- 警告 Mesh／材質快取，半徑與實際攻擊一致；停用遠距敵人停止動畫取樣。build 18 加入低電量／serious 熱狀態的 3D scale 2 → 1.5，UI 保留原解析度；此次新版短測為 fair，未實機觸發該降級路徑。
- build 18 實機發現近距離 Boss 上半身被裁掉，build 19 改 Boss 專用高位鏡頭及雙方中點注視。兩型態實機採樣可看見 Boss 身體、玩家及警告；高位構圖、玩家比例、所有方位遮擋與真人手感仍待驗收。洞窟／探索鏡頭未改。
- 最終核心：15 組測試通過，含三難度正常輸入完整第一章、突進方向／距離、二段前搖、階段切換、四種攻擊格擋／閃避、環境冷卻及暫停。證據 `build/cinematic/core-final.log`。
- build 17 實機完成第一章；新增 UI tour 首輪在通關自動重開後點暫停發生測試競態，修正等待新一輪 stage 0 後重跑通過。原有雙型態／重試與操作／背景案例通過。build 18 兩項短 UI 回歸通過；證據 `UI-tour-17-retry.xcresult`、`UI-18.xcresult`。未將舊版整章裝置結果冒充 build 19 全程結果。
- 裝置：USB iPhone 15 Pro／iOS 27.0.1，沿用 Bundle ID／簽章。依現有 marketing `1.0` + 遞增 build 慣例，交付 `17`、`18`、`19`；同步 project.yml、產生工程／Info.plist、README 與本紀錄，只安裝 Debug `.app`，未建立 archive、IPA、ZIP 或上傳 TestFlight。

| 採樣 | 時長 | 平均更新率 | P95 更新間隔 | 熱狀態 |
| --- | --- | --- | --- | --- |
| build 16 探索基準 | 61.9 s | 48.48 FPS | 44.98 ms | nominal |
| build 17 整章巡迴採樣 | 160.8 s | 48.51 FPS | 45.83 ms | fair |
| build 19 普通 Boss | 13.05 s | 45.97 FPS | 19.29 ms | fair |
| build 19 困難 Boss | 11.00 s | 54.56 FPS | 19.72 ms | fair |

- build 19 framebuffer 1704 × 786、Low Power false、Metal 後製啟用、兩型態載入正確、assetFailures 空。普通採樣期間有系統通知遮擋，圖 `boss-normal-19-1.png` 不作乾淨構圖證據。以上皆為短測；不能推論穩定 60 FPS 或跨版本改善百分比。
- 測試期間曾達 serious，因此沒有追加 15 分鐘燒機、每型態 2–3 分鐘壓測或新版長時間熱驗收。
- build 17：遊戲 PID 的 Metal System Trace 約 20.98 s；CPU inclusive sample weight：GameRenderer.sync 13.36%、NativeActor.animate 2.99%、cameraClearance 2.01%。GPU channel interval 摘要見 `gpu-summary.json`，是裝置通道活動、可能重疊，並非 App 每幀 GPU 時間。最初誤配 UI Runner 的 `metal-17.trace` 排除。build 19 sync CPU 壁鐘均值約 1.44／1.46 ms，P95 約 2.04／2.05 ms；不可與 inclusive 權重比較。
- Blender 唯讀 CLI 檢查共享來源：58 objects、20 actions、無缺失圖片。MCP CLI 路徑設定失敗後改用已確認的本機 Blender；未寫入共享來源。
- 原始 Journey 主檔與備份 SHA-256 一致，見 `save-verification.json`。所有測試使用 UITestJourney 或記憶體 DeveloperJourney；未解除安裝或清除容器。
- 證據均在忽略的 `build/cinematic/`：建置、安裝、xcresult、實機四區域及兩 Boss 圖、CPU/GPU trace、metrics。PS4 等級角色／場景美術、專用突進動作、三檔畫質、完整出場／死亡演出、階段逐幀裝置驗收及主觀聲音／觸控仍未完成。


## 2026-11-10 Boss 動作連續性與實機開發版（build 16）

- 承接 build 15 的分節骨架與步態，本次修正手肘彎曲平面在抬手轉斬擊時的快速翻轉；接近解算奇異點時限制彎曲平面的旋轉速度。改用保持單調的三次曲線，減少經過中間姿勢時不必要的急停；以 60 Hz 烘焙一般節點動畫。
- 兩型態各十組動作：待機、前進、後退、左右側移、斬落、橫掃、受擊、失衡、死亡。胸腰分節帶動肩肘腕，膝踝配合腳掌落點，披風與戰旗延遲跟隨。既有移動加速、有限轉身、步速累積播放與姿勢交叉淡入一併納入本次建置；攻擊命中及預警時序保留。
- 幾何預算檢查通過：戰死武將 22,412 三角面／47 節點／2 材質，鬼化型 23,624 三角面／55 節點／3 材質。17 份資產、57 組動畫通過；另驗證循環首尾、逐幀關節連續性與攻擊落腳。原生斬落／橫掃的最大腳掌漂移小於 0.000002 m；此為離線幾何檢查，不代表實機視覺精度。證據：`build/art-validation.json`、`build/developer-16/art-validation-final.log`。
- 原始 GLB 與原生節點動畫，每型態十組動作共 59 個取樣時間，最大世界矩陣差小於 0.000002。11 組 Swift 核心測試通過，含三種難度整章流程、追擊／側移／攻擊位置鎖定及開發者重試。Debug 建置成功。證據：`build/developer-16/native-animation-check.log`、`core-tests.log`、`build-final.log`。
- 已安裝 iPhone 15 Pro 的 `1.0 (16)`；實機 XCTest 通過開發者入口、一般型載入、重設、切換困難鬼化型與返回標題。一般／困難各取樣約 10.6／11.3 秒，正確載入 `rotroot`／`rotroot_wraith`，資產錯誤為空，Metal 後製啟用。平均更新率約 56.7／53.1 fps，P95 更新間隔約 19.4／19.0 ms；短測不代表穩定 60 fps 或長時間效能。證據：`build/developer-16/UI-final.xcresult`、`verification-final.json`。
- 正式 Journey 主存檔及備份的測試前後 SHA-256 相同。Blender 已檢視抬手、落斬及橫掃取樣；XCTest 附圖仍有方向／裁切問題，實機截圖改以 `devicectl` 擷取。真人連續操作、主觀重量感及逐幀實機觀感仍待驗收；目前為剛性部件動畫，未達到黑神話悟空／劍星的蒙皮變形與動畫製作品質。
- 版本慣例維持 marketing version `1.0` 加遞增 build，本次由實機 build 15 交付至 16；同步 `project.yml`、產生的 Xcode 專案／App Info.plist、iOS README 與本紀錄。只產生並安裝開發簽章 `.app`，未製作 Release archive、IPA、ZIP 或上傳 TestFlight；網頁素材及既有未提交變更保留。

## 2026-11-10 Boss 雙型態與舊化曲面模型（本機開發）

- 透過 Blender MCP 在獨立 `scripts/blender/bosses.blend` 建立戰死武將與鬼化型，並提供重建腳本與兩份動畫 GLB。保留原有 `props.blend`；網頁模型與場景程式未修改。
- 依使用者修正提高曲面、甲片、頭盔及手指的幾何密度，取消方塊輪廓；主要材質粗糙度 `0.98`、金屬度 `0.03`，採鏽斑、磨損與污漬圖集。戰死武將 20,632 三角面／25 節點／2 材質；鬼化型 21,844 三角面／33 節點／3 材質。含戰旗約 8.14 公尺，比例預覽使用 1.7 公尺人形。
- 簡單／普通模式選用 `rotroot`，困難模式選用 `rotroot_wraith`；中英文標題分別顯示戰死武將／鬼化武將。Boss 邏輯身分、碰撞、數值與存檔 schema 未改，未新增 D2 流程或重寫故事。
- 美術驗證通過：17 份原生模型／場景包、49 組動畫；兩款 Boss 均具有 `idle`、`slam`、`sweep`、`hurt`、`stagger`、`die`，時長沿用既有時序。另檢查巨物比例、遊戲 +Z 正面、霧面材質與每款 24,000 三角面／64 節點／3 材質預算。證據：`build/art-validation.json`。
- 離線對照原始 GLB 與原生節點動畫，各模型涵蓋六組動作、35 個取樣時間；最大世界矩陣誤差小於 `0.000001`，沒有蒙皮網格。證據：`build/boss-art/native-animation-check.json`。這不等同 RealityKit 裝置執行驗證。
- 八組核心測試通過，包含三種難度的獨立存檔外觀選擇與三種難度完整第一章流程。證據：`build/boss-art/build.log`。最終素材重建、驗證與 iOS Debug 建置成功：`build/boss-art/export-final.log`、`art-validation.log`、`prepare-final.log`、`build-final.log`。
- Blender 已檢視雙型態比例、低角度與斬落／橫掃／死亡取樣畫面，保留於 `build/boss-art/`。本機沒有可用 iOS Simulator；本輪依範圍未安裝裝置，RealityKit 實機外觀、鏡頭遮擋、材質觀感與新增幾何量的效能仍未驗收。舊 build 的 fps 不作為本輪效能證據。
- 版本慣例為 marketing version `1.0` 加遞增 build；本輪僅本機開發，維持 `1.0 (12)`。同步 Blender 來源、原始 GLB、iOS 美術匯出／驗證、難度選型、顯示名稱與本文件；沒有實機安裝、Release archive、TestFlight 上傳、IPA 或 ZIP。既有未提交文件及隱私宣告變更保留。

最新 TestFlight 上傳為 `1.0` build `12`；實機開發簽章交付為 build `10`。鏡頭調整、使用者中斷測試與 TestFlight 紀錄見末節。以下原生美術與戰鬥補強結果保留為 build `9` 的歷史紀錄。

測試日期：2026-11-10（Asia/Taipei）。本輪針對原生初版過度簡化的模型、動畫、場景及戰鬥表現進行補強。

## 交付與隔離

- iPhone 15 Pro，iOS 27.0.1；最低部署版本與 App 二進位均為 iOS 26.0，SDK 27.2。
- 獨立 iOS 版本 `1.0`，交付 build `9`。版本來源：`project.yml`，App 的版本文字讀取相同的 Info.plist 值。網頁版本不變。
- Apple Development：ITA LIN，Team `N964GDJY6A`。開發簽章及裝置安裝通過。
- 僅產生開發用 `.app`；未建立商店發佈、IPA 或 ZIP。
- 本輪程式變更限於 `ios/`；網頁程式與依賴未修改。產物、憑證與交接檔不納入版本控制。

## 已通過

| 驗證 | 結果與證據 |
| --- | --- |
| 原版美術資產轉換 | 16 份模型／場景包、43 組動畫。檢查網格緩衝區、有限數值、索引、材質檔案、階層與戰鬥／動畫長度一致性。`build/art-validation.json` |
| 轉換產物完整性 | `Resources/Generated/manifest.json` 的 265 份檔案 SHA-256 全部相符，沒有遺失或未登錄檔案。 |
| 原生核心 | 7 組測試通過，整章測試另含三種難度案例；包含戰鬥、彈開／重擊防禦、受擊停頓的閃避緩衝、多輸入狀態、碰撞、鏡頭避障、交易、死亡代價與存檔備份。`build/core-tests-final.log` |
| 完整第一章 | 三種難度均透過正常輸入走完村莊對話、商店、旅店、古道、洞窟、磁石／燭／地圖及 Boss，取得青銅鏡。無傳送、直接傷害或通關旗標覆寫。 |
| iPhone UI 回歸 | build 8 的 XCTest 通過：啟動、設定、新旅程、序幕略過、普攻／重擊／閃避點擊、暫停、地圖與背景後保持暫停。UI 測試存檔與設定獨立。`build/UI-8.xcresult` |
| 網頁回歸 | 現有 17 個測試檔、119 項測試及 TypeScript 檢查通過。`build/web-tests-final.log`、`build/web-typecheck-final.log` |

## 實機長時間驗證

依使用者要求縮短測試，於 build 8 累積 **514.0 秒（約 8 分 34 秒）** 遊玩時結束，共完成 **3 輪第一章**。未觀察到崩潰或資產載入錯誤；Metal 後製正常啟用。證據為 `build/soak-8/result.json`，狀態明確記為 `shortened_by_user`，不是 20 分鐘測試通過。

- 平均更新率 **47.9 fps**，P95 更新間隔 **46.2 ms**；尚未達穩定 60 fps。
- 3D framebuffer 為 **1704 × 786**，SwiftUI 介面維持裝置解析度。
- 結束時系統熱狀態為 `serious`，節能畫質條件已觸發。此結果不能作為持續高畫質或穩定 60 fps 的保證。
- build 9 僅修正標題版本文字的集中管理並遞增 build；遊戲邏輯、美術與 shader 與 build 8 相同。build 9 以建置、安裝及啟動確認交付，不重跑長時間測試。

畫面更新率取自 App 的 RealityKit 更新事件；包含場景切換、測試驅動器與 Swift／SwiftUI 工作，不等同 Metal GPU 單獨耗時，也不能以平均值代表穩定 60 fps。

已對同一 App 程序進行 30 秒 Time Profiler 採樣，保留在 `build/native8-cpu.trace`，摘要為 `build/native8-cpu-summary.json`。約 17.8% 的 CPU 採樣權重出現在 `GameRenderer.sync` 呼叫鏈，約 5.9% 出現在鏡頭碰撞搜尋；這些是可重疊的 inclusive 權重，不能直接當成 GPU 瓶頸或幀時間比例。採樣期間包含於長時間測試。

## 驗證邊界

- 已實測 iOS 27.0.1；沒有 iOS 26 Simulator runtime，未宣稱完成 iOS 26 執行驗證。
- XCTest 實測單指操作與背景暫停；同時移動、按住防禦與鏡頭輸入有核心狀態測試，真人多指手感仍需驗收。
- App 只載入封裝資源，運行不依賴網頁或開發伺服器；未切換裝置飛航模式。
- 鎖屏、來電等真實音訊中斷、完整 VoiceOver 及主觀音質尚未實測。
- 使用原版模型與動畫資產；Metal 後製、碰撞與 Boss 弱點是原生實作，未宣稱與網頁版逐像素或逐幀完全相同。

## 2026-11-10 鏡頭調整（build 10）

- 正交鏡頭 scale `10.5 → 7.2`；第三人稱距離上限 `6.2 → 4.2`、基礎高度 `2.4 → 1.8`。視野維持 `61°`，注視點及避障規則保留；進場與跟隨共用距離、高度及避障計算。
- 同一份主角模型、同一位置、朝向與 idle 第 0 秒姿勢的投影計算：正交高度約增加 **45.8%**，第三人稱開闊處約增加 **50.8%**。這是固定姿勢的幾何比較；貼牆、動畫與手動俯仰會影響實際比例。證據：`build/camera-10-projection.json`。既有 XCTest 的 app 截圖有方向／裁切異常，未用於前後像素量測。
- 既有 7 組 Swift 核心測試通過，含三種難度整章案例；iOS 建置與既有實機 UI 回歸通過。證據：`build/camera-10-core-tests.log`、`build/camera-10-build.log`、`build/camera-10-UI.xcresult`。
- iPhone 15 Pro／iOS 27.0.1 短程巡迴完成一次第一章，metrics 累積 156.4 秒、通關 1 次、資產錯誤為空、Metal 後製啟用。實機截圖留於 `build/camera-10-tour/`，已檢視平原、村莊、古道、洞窟與 Boss 構圖；Boss 戰圖為 `126.png`。區域以畫面標題辨識，metrics 區域可能落後截圖。
- 洞窟以正常輸入產生的獨立測試存檔，執行四次水平旋轉、俯仰、三方向搖桿移動、攻擊、閃避及暫停，XCTest 通過；採樣畫面未見鏡頭穿牆，主角軀幹未被左右操作鍵遮住。入口互動提示可能覆蓋腿部。證據：`build/camera-10-controls.xcresult`、`build/camera-10-manual/`。暫時驗證工具留於忽略的 build 目錄，正式測試原始碼未修改。
- **依使用者指示停止追加測試並直接交付。** Boss 地面預警專項尚未執行；逐幀切換平順度、同位置實機前後像素量測及真人手感仍未完成驗收。未追加長時間測試。
- 測試使用 `--ui-testing` 的 UITestJourney；正式 Journey 存檔前後 SHA-256 相同，證據：`build/camera-10-player-before.json` 與 `build/camera-10-player-after.json`。
- 沿用 marketing version `1.0` 與遞增 build 慣例，`project.yml` 的 build `9 → 10`，同步產生 Xcode 專案與 App Info.plist。僅建置並安裝開發簽章 `.app`；未建立 ZIP、IPA 或商店發佈，網頁版不變。

## 2026-11-10 TestFlight 首次上傳（build 12）

- App Store Connect：幽燈魔境，App ID `6832804838`，主要語言為繁體中文，沿用 Bundle ID 與 Team。
- 沿用 marketing version `1.0`，依專案遞增 build 慣例由 `10 → 11 → 12`；build `11` 已上傳，build `12` 補入 `PrivacyInfo.xcprivacy`（僅 App 自身設定的 UserDefaults 用途 `CA92.1`，無追蹤或收集資料）與 `ITSAppUsesNonExemptEncryption = false`。遊戲程式未變更。
- Release archive 建置成功；build `12` 的封裝內 265 份素材 SHA-256 全部符合 manifest，隱私宣告與版本核對通過。證據：`build/testflight-archive-12.log`、`build/testflight-verification-12.json`。未追加遊玩、UI 或長時間測試。
- `xcodebuild -exportArchive` 使用 App Store Connect 自動簽署及 upload，回報 `Upload succeeded`、`EXPORT SUCCEEDED`。證據：`build/testflight-upload-12.log`。
- 已在 TestFlight 網頁確認 `1.0 (12)`，建立時間為 2026-11-10 10:22（Asia/Taipei），狀態為 **Processing**；Apple 處理完成與可供測試尚未確認，未建立測試群組或邀請測試者。
- 同步範圍：`project.yml`、產生的 Xcode 專案／App Info.plist、README 與本紀錄。依使用者本次要求產生 `.xcarchive` 並經發佈流程封裝上傳；產物保留於忽略的 `build/`，不製作 ZIP，不提交產物、憑證或交接檔。

## 2026-11-10 TestFlight 外部測試送審

- Apple 處理完成，build `12` 原狀態為 Ready to Submit。已建立必要的內部「開發者」群組（未啟用自動分發、未邀請人員）及外部「朋友測試」群組。
- 依使用者授權與提供的聯絡資料填寫 Beta App Description、回饋與審核聯絡欄位，關閉 App 登入需求，儲存測試重點並提交 build `12`；網頁確認 **Waiting for Review**。聯絡電話與 Email 不寫入版本控制文件。
- 已建立公開邀請連結：https://testflight.apple.com/join/HbuJYGDd 。Apple 網頁明示：群組有核准的 build 前，測試者無法透過連結加入。尚未確認可安裝，未寄出個別邀請。
- 送審畫面證據：`build/testflight-waiting-review-12.png`。本輪僅更新 App Store Connect 測試設定與紀錄，版本維持 `1.0 (12)`，未重新建置或封裝。


## 2026-11-10 朋友展示實機短測與錄影

- 沿用 iPhone 15 Pro 已安裝的開發版 `1.0 (10)`，以 `--ui-testing --validate` 透過正常輸入完成第一章 1 次，涵蓋村莊對話、商店、旅店、古道、洞窟三項道具與 Boss；本次不是 TestFlight build 12 的執行驗證。
- 最後取樣累積 171.3 秒遊玩，平均更新率 45.5 fps；資產錯誤為空、Metal 後製啟用、熱狀態為 nominal。未觀察到崩潰；短測不代表長時間效能或真人多指操作驗收。
- 原始實機畫面與裝置音訊錄影約 194 秒，剪為 60 秒原速精華，包含平原、村莊、古道、洞窟與 Boss。影片、剪輯區間、metrics 與驗證結果位於忽略的 `build/friend-demo-20261110/`。
- 正式 Journey 的主存檔與備份前後 SHA-256 完全相同；結束後以正常模式重新開啟 App。
- 沿用 `1.0` 加遞增 build 慣例；本次只測試既有安裝，無版本遞增、重新建置、安裝、商店上傳或 ZIP／IPA 封裝。僅新增測試紀錄與影片產物。
