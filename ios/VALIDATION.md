# iPhone 原生版驗證

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

以下為 build `10` 鏡頭調整與 build `9` 原生美術及戰鬥補強的歷史驗證紀錄。

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
