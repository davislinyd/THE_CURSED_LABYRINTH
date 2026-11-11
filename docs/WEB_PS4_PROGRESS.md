# Web PS4 畫質升級 · 進度檔

新的工作階段先讀本檔即可接續，不必重讀聊天紀錄。

- Repository：`davislinyd/THE_CURSED_LABYRINTH`　Branch：`feature/web-ps4-upgrade`（由 `main` 42f8a27 分出；2026-11-12 依使用者指示以 `--no-ff` 合併回 `main`（295532f），`main` 與本分支均已 push）
- 目標：桌面網頁版（Chrome／Edge，WebGL2）由 PS2 風格提升到接近 PS4 世代，保留水墨木版畫；不動 `ios/`、不改戰鬥數值／判定／AI／存檔格式。
- **使用者於 2026-11-11 的最新指示（優先於原任務書）**：不要著重 4K 畫質，要著重**人物的可動性與流暢度**；可參考並複用 iOS 版的 3D 建模（唯讀，複製成 Web 專用資產）。

## ⚠ 共用工作目錄：另一個工作階段同時在改 iOS

2026-11-11 工作途中，另一個工作階段在同一個 checkout 建立並切換到 `feature/ios-cinematic-combat-upgrade`（由本分支的第一個提交 3cdb464 分出），並修改 `ios/**`。因此：

- **提交前先看 `git branch --show-current`**。HEAD 不一定在 `feature/web-ps4-upgrade`。
- 不要為了提交而切換分支（會把別人的工作帶到別的分支）。本分支的後續提交都是用**暫存 index** 寫入的：`GIT_INDEX_FILE=$(mktemp) git read-tree <branch>` → `git add -- <自己的檔案>` → `git write-tree` → `git commit-tree -p <branch>` → `git update-ref`。HEAD、共用 index 與工作目錄都不動。
- 所以在 iOS 分支上 `git status` 會把本分支已提交的 Web 檔案顯示成「未提交修改」，這是預期現象，不要還原它們。
- `.ai/status.json` 目前是另一套格式且由並行的工作階段使用，本輪**沒有改寫**，待使用者決定。

## 需要保護的檔案

- `ios/**`：只讀。`ios/Tooling/export-art.mjs` 會直接執行 `src/actors/Samurai.ts` 的 `buildSamurai()`／`SAMURAI_CLIPS`、`buildIsoLevel(grid, theme, assets, kit, buildings)`、`buildLevel(dungeon, theme, assets)`，並使用它自己的 `assets` 替身（只有 `textures`／`material`／`model`）。**這些函式的既有簽章與預設行為不可變**；Web 的新細節一律走「額外的選用參數」。
- `scripts/blender/{bosses.py,boss_motion.py,bosses.blend,props.py,props.blend,lib.py}` 與 `scripts/blender/export/{rotroot,rotroot_wraith,…}.glb`：iOS 使用，不可覆寫。Web 新資產用 `web_` 前綴的新檔名。
- 工作目錄中使用者未提交的修改：`README.md`、`ios/README.md`、`ios/VALIDATION.md`、`ios/project.yml`、`ios/Resources/PrivacyInfo.xcprivacy`。提交時只 `git add` 自己的檔案，不可 `git add -A`。
- 驗證建置用 `npx vite build --outDir <scratchpad>/build-check`，不要寫入專案的 `dist/`。

## 提交紀錄（feature/web-ps4-upgrade）

| Commit | 內容 |
|---|---|
| 3cdb464 | 畫質 Profile、內部／輸出解析度分離、效能監控、Benchmark、Context Loss、墨線摺痕與 AO |
| 391b973 | 武士高模（Blender）、Boss 外觀與裂紋、燈光、材質細節、場景雜物、戰鬥特效 |
| 4597187 | 甲片拆分可動、二次運動、程序化動作層、步伐節奏、貼圖快取、骨骼貼圖釋放 |
| 1dc88a9 | 敵人動作層、GPU timer 於 Context 恢復後重新取得、本文件 |
| （本檔所在的提交） | 主角腳掌著地（`FootPlant`）、步頻依 Clip 實際步幅與實際前進距離推算 |

## 階段狀態

### Phase 1 — Baseline 與效能監控：完成

- `src/engine/PerfMonitor.ts`：FPS、平均／P50／P95／P99 Frame Time、CPU update／render 提交時間、GPU time（`EXT_disjoint_timer_query_webgl2`，不支援顯示 N/A）、Draw Calls、Triangles、geometry／texture／program **數量**（不是 VRAM 位元組）、內部與輸出解析度、DPR、倍率、Profile。預設關閉；`F3` 或網址 `?perf` 開啟。
- `src/core/Benchmark.ts`：`?bench=plains|grotto|boss[&quality=…][&res=…][&seconds=…]`。記憶體內的新旅程、腳本化輸入、固定亂數種子、`SaveManager.readOnly`（不寫入正式存檔與設定，已實測設定值未被覆寫）。結果在 `window.__bench` 與 console `[bench]`。Production build 也可用。
- A/B 量測工具（不入版控，在 `.playwright-mcp/`）：`ab-page.js` + `runs/*.js`，對 baseline worktree 與新版跑同一腳本。

### Phase 2 — Rendering Quality System：完成

- `src/engine/Quality.ts`：`performance / balanced / high / ultra`。`renderSize()` 分開邏輯解析度／CSS 尺寸／GPU 尺寸。
- `src/engine/Renderer.ts`：Canvas 以輸出解析度呈現（finish pass），場景＋墨線＋Bloom＋SMAA 走內部解析度（High 上限約 1080p 像素量）；尺寸沒變就不重配 Render Target；`webglcontextlost/restored`（已用 `WEBGL_lose_context` 實測：遺失時顯示提示且邏輯續跑，恢復後畫面、環境貼圖與 GPU timer 都回來）。Tone mapping 順序已檢查：線性 HalfFloat → Ink → Bloom（軟膝）→ OutputPass（ACES＋sRGB）→ SMAA → Finish。
- `src/engine/DynamicResolution.ts`：AUTO 倍率（6% 一階、嚴重超時一次兩階、一分鐘內不回到剛失敗的倍率、有 GPU timer 時看餘裕）。
- `src/engine/InkPass.ts`：`CREASES`（由深度重建法線的摺痕線，不需第二次場景繪製）、`AO_TAPS` 0/8/16（含距離截斷）。
- `src/engine/Lighting.ts`：`moonShadow` / `pointShadow` / `lanternCount` / `halos`，場景以 `quality(q)` 即時套用陰影與燈數（雜物密度要重進場景才變）。
- 設定：`Settings.quality`；舊的 `effects` 自動對應並持續回寫。選單「畫面設定」四段（效能／標準／高／最高）。

### Phase 3 — Light / Material：完成（無新增貼圖集）

- `src/engine/Shading.ts`：`patch()`（可疊加的 onBeforeCompile，program key 以補丁當下的 key 為底，避免不同著色器撞同一個 program）、`rimLight`／`rimBody`（人物邊緣光）、`surfaceDetail`（世界座標雜訊：大尺度明暗、苔蘚、濕潤）。
- 室外：月光 ×1.8、偏冷色，天空補光偏藍，燈籠暖色光暈；洞窟：遠處藍灰霧、岩壁苔與濕潤反光；Boss：兩盞點光＋一盞冷色方向光（取代原本四盞點光），半血以下光與霧轉血色。
- `Assets.material()`：同一張貼圖同一個 repeat 的複本只做一次（原本每次呼叫 clone 五張）。

### Phase 4 — Character：主角完成；Boss 外觀完成；敵人／村民僅部分

- **主角**：`scripts/blender/web_hero.py`（Blender 5.2 CLI 無頭執行，沒有用到 MCP 呼叫）→ `scripts/blender/export/web_samurai.glb`（43,560 三角形）＋ 可編輯的 `scripts/blender/web_hero.blend`。31 個節點：`part_<關節>`（頂點已在該關節座標）與 `sub_<名稱>__<父關節>`（可擺動部件，節點位置即樞紐）。`src/actors/SamuraiHD.ts` 依材質槽名稱（lacquer／laced／gold…）套 PBR 材質，掛到原本的 `Rig`；載入失敗則退回程序模型。Clip、時序、攻擊距離都沒動。
- **可動性與流暢度（使用者指定的重點）**：
  - `src/actors/Secondary.ts`：袖、草摺七片、錣、刀鞘、腰帶垂帶、總角以阻尼彈簧擺動；草摺被下方大腿推開、袖隨手臂抬起約 45%；遊戲的「一格內起步／被推開」只取 11% 當慣性，避免甲片被甩到極限。
  - `src/actors/BodyMotion.ts`：轉向傾身、起跑前傾／煞車後仰、呼吸（越累越喘）、頭轉向注視的敵人。**每 tick `begin()` 先還原再疊加**（AnimationMixer 對數值沒變的關節不會重寫，直接後乘會累積——實測曾把頭累加到 78°）。
  - `HeroActor`：跑步 Clip 播放速度依實際地面速度調整（`CADENCE`），滑步由約 70% 降到約 25%（依 Clip 步幅估算，非實測）。
  - **腳掌著地**（`src/actors/FootPlant.ts`，2026-11-12）：
    - 啟動時把跑步 Clip 在同骨架上播一遍，量出每隻腳的承重相位（腳低且相對身體後移），以及 Clip 不滑步時的地面速度 `STRIDE.speed`（3.94 m/s）。
    - 承重中的腳固定在落地點並壓平到地面，大腿與小腿用解析雙骨 IK 去搆；骨盆快降慢升（最多 12 cm），讓膝蓋保持彎曲；腿長軟上限避免膝蓋鎖直。抬腳後腳以每秒 8 的速率追回 Clip 位置。
    - 只抵銷身體前後方向的位移：貼牆側滑時腳跟著身體走，不把腿斜拉開。
    - 權重取跑步 Clip 在混合中的比例，與其他 Clip 交叉淡入時按比例混合；權重 0 時完全不動 Clip 姿勢。`begin()` 先還原，與 `BodyMotion` 同一模式。
    - 步頻改為「實際前進距離 ÷ `STRIDE.speed`」，夾在 0.25–2 倍之間，取代舊的 `CADENCE` 常數與 `sqrt(pace)`。Clip 本身與 `SAMURAI_CLIPS` 都沒改（iOS 匯出不受影響）。
    - 量測（單元測試模擬，3／5／7.5 m/s）：
      - 承重腳單格滑移由 11–22 mm 降到 ≤ 1.2 mm。
      - 腳踝由懸空 ≥ 7.3 cm 降到 4.0–4.9 cm（站姿 4 cm），腳底水平。
      - 支撐期膝蓋 ≥ 20°。
      - 腿部單格最大轉角為 Clip 本身的 0.88–1.08 倍，單格尖峰（與前後兩格平均之差）< 0.1 rad。
      - 骨盆整體比 Clip 低約 6–8 cm，跑姿較低。
    - 遊戲內探針（`?bench=grotto` 20 秒）：
      - 前進 ≥ 1 m/s 時，承重腳單格滑移 ≤ 3.5 mm。
      - 沿牆側滑時，扣除側滑本身後 ≤ 3 mm。
      - 單格尖峰 0.044 rad，最大轉角 0.215 rad。
      - 正面頂牆不動時，腿仍以 0.25 倍擺動，腳會滑（實測約 20 mm/tick；舊版固定 1.28 倍，依 Clip 步速推算約 80 mm/tick，未實測）。
  - 骨架型敵人（亡者足輕、縛屍）也掛上同一動作層與邊緣光。
  - 逐 tick 探針（Boss 場景 674 tick）：頭頸單格最大轉角 0.17 rad，與未加動作層時相同；甲片在走跑狀態單格最大 0.07–0.16 rad。
- **Boss**：樹幹重塑（樹瘤、根部外擴、眉脊）、彎曲的樹冠與盤根、四條根臂改為蒙皮（關節鏈與命中判定讀取的關節完全相同）、樹皮裂縫餘燼在出招前轉亮。iOS 的武將 Boss GLB **沒有**用在 Web：Web 的判定綁在樹根關節上，換模型等於改 AI 與判定。
- 鬼火、腐鴉與村民：只加邊緣光，模型未升級。

### Phase 5 — Environment / Post FX / Combat FX：完成（LOD 僅做到分塊剔除）

- `src/world/IsoDetail.ts`：三種杉樹樹冠、草叢（不寫深度，所以墨線不會把每片草描黑）、落葉、碎石、房屋木作；全部 InstancedMesh、每 8×8 格一塊以利視錐剔除。`buildIsoLevel(…, q?)`／`buildLevel(…, q?)` 不給 `q` 時行為與原本相同（iOS 匯出器走這條路）。
- 洞窟：碎石、鐘乳石、螢光菇改為單一 InstancedMesh。
- 戰鬥：火花、彈反衝擊環、命中閃光燈（Performance 關閉）、刀軌刃緣亮邊；數量跟 Profile。

### Phase 6 — 驗證：完成（範圍見下）

## 效能數據（MacBook Air M5，Playwright Chromium 157／ANGLE Metal，1920×1052）

Baseline＝main 42f8a27、EFFECTS HIGH；After＝本分支、HIGH；皆固定倍率 100%。

| 場景 | Baseline FPS / P99 ms | After FPS / P99 ms | Draw calls（前→後） | Triangles（前→後） |
|---|---|---|---|---|
| 灰谷平原 | 58.8 / 18.0 | 60.0 / 18.6 | 200 → 249 | 317,133 → 299,229 |
| 朽木洞窟 | 57.1 / 18.0 | 59.7 / 18.6 | 217 → 253 | 27,932 → 120,721 |
| Boss 戰 | 59.3 / 18.1 | 60.0 / 18.7 | 241 → 305 | 13,041 → 88,723 |

After 另測：CPU update 約 0.35 ms、render 提交約 2.5 ms。平原各 Profile（1080p 視窗）：Performance 60 fps（內部 1296×710）、Balanced 60（1622×889）、Ultra 60（1920×1052）。

限制，請勿過度解讀：

- 60 Hz 垂直同步封頂，所以「都是 60」不代表成本相同。
- GPU timer 的數值在這台機器上常貼近或超過一幀的時間（Baseline 4K 時回報 33 ms 卻仍 60 fps），**不能當絕對成本**。
- 4K（DPR 2）壓力測試：Baseline 60／59.6／60 fps；Ultra（內部真 4K）51／44／42 fps；High（內部約 1080p、輸出 4K）60／53.5／60 fps。也就是每像素成本確實變高。後續拆解因無風扇機身熱降頻而數值漂移、沒有結論。**使用者已指示不要著重 4K，此項不再追。**
- 只在這一台 Mac 的 Chromium 測過；Windows、Edge、獨顯與內顯都沒有實測。
- 資源數量：世界→村莊→洞窟→Boss 連跑四輪，geometry／texture／program 數量逐輪相同（154/97/91、372/97/91、98/95/89、149/99/91）。

## 驗證紀錄（最近一次，2026-11-12：腳掌著地）

- `npm run typecheck`：通過。`npm test`：20 個檔案、165 個測試通過（新增 7 個 `feet on the ground`）。`npx vite build --outDir <scratchpad>/build-check`：通過。
- 瀏覽器（Playwright Chromium，dev server）：`?bench=grotto` 與 `?bench=boss` 執行中 Console 無錯誤、無警告；逐 tick 探針數據見 Phase 4。Agent 只做了程式化量測與 Boss 場景截圖（背後視角，看不出腳步細節）。2026-11-12 使用者將腳掌著地設為**驗收通過**。

## 驗證紀錄（2026-11-11）

- `npm run typecheck`：通過。`npm test`：20 個檔案、158 個測試通過（原有 119 個全數保留）。
- `npx vite build --outDir <scratchpad>/build-check`：通過；`vite preview` 冒煙：Benchmark 可跑、效能面板預設關閉、沒有 `window.__game`、Console 無錯誤。
- 瀏覽器（Playwright Chromium）：平原／村莊／古道／洞窟／Boss 都能建置且無 Shader 錯誤；Boss 戰腳本打到勝利 → 取得青銅鏡 → 回到平原；暫停 → 設定頁可開。
- 沒做的：真人完整通關第一章、手把與滑鼠實機操作、Edge、Windows。

## 尚未完成（依使用者最新優先順序）

1. **人物可動性／流暢度的下一步**：
   - 腳掌著地已完成，2026-11-12 使用者驗收通過。
   - 主角仍是「剛性分件＋可擺動部件」，不是蒙皮；沒有手指動作。
   - 跑步 Clip 本身沒重做：它的骨盆在支撐中段最高，與物理相反，目前由 `FootPlant` 下沉骨盆補償。
   - 轉身沒有專屬動作；正面頂牆時腿仍慢速擺動、腳會滑；攻擊、翻滾等 Clip 的前衝沒有著地處理。
   - 下一步建議：Web 專用的轉身／停步 Clip，或頂牆時改播站姿，之後再考慮蒙皮。`SAMURAI_CLIPS` 與 iOS 共用，改 Clip 會影響 iOS 匯出，要另開 Web 專用 Clip。
2. 鬼火、腐鴉、村民模型未升級；足輕與縛屍仍是程序模型。
3. Boss 樹幹仍以程式生成，沒有 Blender 高模。
4. 沒有新增 PBR 貼圖集；沒有採用 GTAO／SSAO（AO 由墨線 pass 的深度暈染擔任）。
5. 描邊用的是「由深度重建的法線」，不是真正的法線 G-buffer。
6. 遠景 LOD 只有分塊剔除，沒有幾何 LOD。
7. WebGPU：未開始（依任務書，WebGL2 穩定後才評估）。

## 下一個優先執行的具體工作

1. ~~目視驗收跑姿~~：2026-11-12 使用者驗收通過。日後若要調整跑姿高度，調 `FootPlant.ts` 的 `EASY`（0.92；越大骨盆越高、膝蓋越直）。
2. ~~合併~~：2026-11-12 已依使用者指示將 `feature/web-ps4-upgrade` 與 `feature/ios-cinematic-combat-upgrade` 以 `--no-ff` 合併回 `main`（README 開發歷程的衝突已手動保留兩段）。合併後 `main` 已 push。
3. 之後再進行「尚未完成」第 1 項的其餘部分。

## Blender 注意事項

- 重建主角：`/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P scripts/blender/web_hero.py -- "$PWD" [預覽輸出目錄]`，再執行 `node_modules/.bin/gltf-transform optimize scripts/blender/export/web_samurai.glb public/assets/models/web_samurai.glb --compress false --palette false --instance false --simplify false --flatten false --join false`，並把 `public/assets/manifest.json` 的 `tris` 更新。`scripts/assets/sources.mjs`／`build.mjs` 已登錄 `web_samurai`，日後跑完整的 `npm run assets` 也會產生同樣結果（本輪沒有跑完整建置，避免重編其他素材）。
- 本輪 Blender MCP 呼叫次數：0（全部走 CLI）。預覽圖用 Cycles CPU 24 samples，約 7 秒。
- 管狀幾何要用平行傳輸的座標框（腳本內 `Kit.tube`），否則朝下的管子會扭曲。
- 建模手法參考了 iOS Boss 的 `scripts/blender/bosses.py`（分節剛性甲片、弧形甲片、管狀），但沒有讀寫任何 iOS 用的 Blender 檔或 GLB。
