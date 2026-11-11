# Web PS4 畫質升級 · 進度檔

新的工作階段先讀本檔即可接續，不必重讀聊天紀錄。

- Repository：`davislinyd/THE_CURSED_LABYRINTH`　Branch：`feature/web-ps4-upgrade`（由 `main` 42f8a27 分出，不自動 Push）
- 目標：桌面網頁版（Chrome／Edge，WebGL2）由 PS2 風格提升到接近 PS4 世代，保留水墨木版畫；不動 `ios/`、不改戰鬥數值／判定／AI／存檔格式。

## 需要保護的檔案

- `ios/**`：只讀。`ios/Tooling/export-art.mjs` 會直接執行 `src/actors/Samurai.ts` 的 `buildSamurai()`／`SAMURAI_CLIPS`、`buildIsoLevel(grid, theme, assets, kit, buildings)`、`buildLevel(dungeon, theme, assets)`，並使用它自己的 `assets` 替身（只有 `textures`／`material`／`model`）。**這些函式的既有簽章與預設行為不可變**；Web 的新細節一律走「額外的選用參數」。
- `scripts/blender/{bosses.py,boss_motion.py,bosses.blend,props.py,props.blend,lib.py}` 與 `scripts/blender/export/{rotroot,rotroot_wraith,…}.glb`：iOS 使用，不可覆寫。Web 新資產用 `web_` 前綴的新檔名。
- 工作目錄中使用者未提交的修改：`README.md`、`ios/README.md`、`ios/VALIDATION.md`、`ios/project.yml`、`ios/Resources/PrivacyInfo.xcprivacy`。提交時只 `git add` 自己的檔案，不可 `git add -A`。
- 驗證建置用 `npx vite build --outDir <scratchpad>/build-check`，不要寫入專案的 `dist/`。

## 階段狀態

### Phase 1 — Baseline 與效能監控：完成

- `src/engine/PerfMonitor.ts`：FPS、平均／P50／P95／P99 Frame Time、CPU update／render 提交時間、GPU time（`EXT_disjoint_timer_query_webgl2`，不支援顯示 N/A）、Draw Calls、Triangles、geometry／texture／program **數量**（非 VRAM 位元組）、內部與輸出解析度、DPR、倍率、Profile。預設關閉；`F3` 或網址 `?perf` 開啟。
- `src/core/Benchmark.ts`：`?bench=plains|grotto|boss[&quality=…][&res=…][&seconds=…]`。記憶體內的新旅程、腳本化輸入、固定亂數種子、`SaveManager.readOnly`（不寫入正式存檔與設定）。結果在 `window.__bench` 與 console `[bench]`。
- A/B 量測工具（不入版控）：`.playwright-mcp/ab-page.js` + `.playwright-mcp/runs/*.js`，對 baseline worktree（port 5180）與新版（port 5173）跑同一腳本。

Baseline（main 42f8a27，MacBook Air M5，Playwright Chromium／ANGLE Metal，1920×1051，EFFECTS HIGH，倍率 100%，20 秒）：

| 場景 | FPS | Frame ms | P95 | P99 | GPU ms | Draw calls | Triangles |
|---|---|---|---|---|---|---|---|
| 灰谷平原 | 58.8 | 17.00 | 17.7 | 18.0 | 19.1 | 200 | 317,133 |
| 朽木洞窟 | 57.1 | 17.51 | 17.6 | 18.0 | 17.2 | 217 | 27,932 |
| Boss 戰 | 59.3 | 16.87 | 17.6 | 18.1 | 17.5 | 241 | 13,041 |

注意：60 Hz 垂直同步封頂，且 GPU timer 的數值在負載不滿時貼近一幀的時間（推測為 Apple GPU 降頻，未證實），所以 1080p 的 GPU ms 不能當成絕對成本。半解析度時 GPU 6.5 ms（Boss）／10 ms（平原），顯示瓶頸在片段著色（解析度），不是三角形數。要比較成本請用 4K 壓力設定（見 Phase 6）。

### Phase 2 — Rendering Quality System：完成

- `src/engine/Quality.ts`：`performance / balanced / high / ultra` 四個 Profile（輸出 DPR 上限、內部像素預算、動態解析度下限、月光／點光陰影、燈數、Bloom、SMAA、AO 取樣數、摺痕線、印刷磨損、顆粒、各向異性、材質細節、邊緣光、地表雜物密度、粒子量、環境反射）。`renderSize()` 分開邏輯解析度／CSS 尺寸／GPU 尺寸。
- `src/engine/Renderer.ts`：Canvas 以輸出解析度呈現（finish pass），場景＋墨線＋Bloom＋SMAA 走內部解析度；尺寸沒變就不重配 Render Target；`webglcontextlost/restored` 處理；`renderer.info` 改為整幀累計。Tone mapping 順序已檢查：線性 HalfFloat → Ink → Bloom → OutputPass（ACES＋sRGB）→ SMAA → Finish。
- `src/engine/DynamicResolution.ts`：AUTO 倍率（6% 一階、嚴重超時一次兩階、一分鐘內不回到剛失敗的倍率、有 GPU timer 時看餘裕）。
- `src/engine/InkPass.ts`：`CREASES`（由深度重建法線的摺痕線）、`AO_TAPS` 0/8/16（含距離截斷）。
- `src/engine/Lighting.ts`：`moonShadow` / `pointShadow` / `lanternCount`，場景以 `quality(q)` 即時套用。
- 設定：`Settings.quality`；舊的 `effects: 'low'|'high'` 自動對應到 `performance`／`high`，並持續回寫 `effects` 供舊版讀取。選單「畫面設定」四段。

## 最近一次通過的檢查

見檔尾「驗證紀錄」。
