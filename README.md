# 幽燈魔境 THE CURSED LABYRINTH

原創日式黑暗動作 RPG，瀏覽器直接遊玩。本分支 `ps2-remake` 把原本的 FC 版（標籤 `fc-v1`）重製成 PS2 世代的畫面與音樂：

- **2D 模式**（大地圖、村莊、章節古道）：斜角視角的砍殺動作，可用滑鼠點擊移動與攻擊。
- **3D 模式**（迷宮、Boss）：第三人稱自由移動的即時劍戟動作，有連擊、強攻擊、防禦、看準時機的反擊、閃避與鎖定；**迷你地圖可隨時開關**。

目前完成**第一章**完整試玩：序幕 → 灰谷平原 → 灰谷村 → 朽木古道 → 朽木洞窟 → 朽根老樹 → 封印 I 青銅鏡。

角色、故事、介面、樂曲皆為原創；第三方素材只用 CC0 與 OFL 授權，清單見 [CREDITS.md](CREDITS.md)。

## 執行

```sh
npm install
npm run dev        # 開發伺服器
npm run build      # 型別檢查 + 產出 dist/
npm run preview    # 預覽 dist/
npm test           # Vitest
```

`public/assets/`（貼圖、模型、樂器取樣、音效）由素材管線產生，執行遊戲前必須存在：

```sh
npm run assets     # 下載 scripts/assets/sources.mjs 列出的素材到 assets-src/，再轉檔輸出到 public/assets/
```

需要 PATH 上有 `ffmpeg`、`cwebp`、`unzip`。同時會產生 `public/assets/manifest.json`、`public/licenses/` 與 `CREDITS.md`。

## 操作

| 動作 | 鍵盤 | 滑鼠（2D） | 滑鼠（3D） | 手把（標準配置） |
| --- | --- | --- | --- | --- |
| 移動 | WASD／方向鍵 | 沒按移動鍵時，左鍵點地面 | — | 左搖桿 |
| 攻擊（連按為三段連擊） | J | 左鍵：點敵人會追擊；按著移動鍵時朝游標原地攻擊 | 左鍵 | X |
| 強攻擊 | K | 右鍵（朝游標） | 右鍵 | Y |
| 防禦（剛好擋下為「彈開」，接著攻擊會反擊） | L／Shift | — | — | RB／RT |
| 閃避 | Space | — | — | B |
| 調查／交談／開門 | E | 左鍵點目標或提示框 | 左鍵（有提示、附近沒有敵人時） | A |
| 道具 | I／R；1／2／3 直接使用 | 滾輪切換；1／2／3 使用 | 沒有鎖定時滾輪切換 | LB |
| 鎖定（迷宮） | Q | — | 中鍵；滾輪換目標 | LT／R3 |
| 視角（迷宮） | — | — | 移動滑鼠 | 右搖桿 |
| 迷你地圖開關 | Tab | — | — | Back |
| 地圖／道具頁（迷宮） | M | — | — | L3 |
| 暫停 | Enter／Esc | — | Esc 釋放游標並暫停 | Start |
| 全螢幕 | F | — | — | — |

選單、暫停、設定、對話框與商店都能用滑鼠：**左鍵**確定、**右鍵**取消；滑鼠指到哪一列，游標就跟到哪一列。3D 模式遊戲中會鎖定游標，第一下點擊只負責鎖定（瀏覽器規定），不會出招。2D 與 3D 的大地圖、村莊、古道、迷宮都有迷你地圖，戰爭迷霧隨探索揭開並存檔。

畫面內的按鍵提示會依目前使用的裝置（鍵盤或手把）自動切換。標題與暫停選單都有「操作說明」頁。

## 遊戲系統

- **劍的等級**：擊敗敵人釋放紅色魂火，靠近即自動吸收，累積後升級提高攻擊力；黃色魂火回復體力。
- **掉落物**：2D 模式的敵人與破甕會掉落金錢、藥草、符咒，地上顯示名稱，走過即撿起。
- **道具**：藥草（回復 6）、靈藥（全回復）、符咒（投擲，貫穿靈體）。
- **村莊**：交談、商店、旅店（回復並存檔）。
- **迷宮**：門、鑰匙門、可破木板、幻牆（持青銅鏡會閃爍）、黑暗區（需幽靈燭）、寶箱、石碑、地圖與磁石。
- **存檔**：旅店、神社、進出迷宮與大地圖時自動存檔，存在瀏覽器 LocalStorage（`yuto-makyo.save.v2`）。FC 版存檔（`.v1`）不相容，標題畫面會提示。
- **接關**：死亡後可接關 3 次（體力全滿、金錢減半、回到最後存檔點），用完為 GAME OVER。
- **設定**：語言（English／繁體中文）、BGM／SFX 音量、渲染解析度（自動／100%／75%／50%）、特效品質（高／低）、CRT 效果、迷你地圖。

## 技術

- **渲染**：Three.js 0.187（WebGL2）。畫面填滿視窗（邏輯高度 448，寬度 640～1045，支援到 21:9），內部解析度依視窗與 DPR 而定，自動模式會依幀率調整。後製依序是墨線與墨暈（`InkPass`，由深度貼圖產生）、Bloom、ACES 色調映射、SMAA，最後是「褪色木版畫」收尾：靛藍暗部與赭黃亮部、保留朱紅的低彩度、色階化、和紙纖維、套色錯位、焦邊，以及可選的斑點刮痕與 CRT。特效品質為「低」時保留墨線與和紙，關閉 Bloom、墨暈、套色錯位與斑點。介面是疊在上方的 2D canvas，面板為染舊的和紙與毛筆邊框。
- **3D 迷宮**：由迷宮格子資料生成起伏的岩壁、地面與天井；圓形對矩形碰撞；固定數量的點光源池分配給附近燈籠，避免著色器重編譯。追隨鏡頭在牆邊會拉近或升高。
- **斜角模式**：正交鏡頭；地面以遮罩貼圖混合草地與道路；山崖、杉林（Instancing）、水面、橋、墓地、彼岸花、房屋皆由格子資料生成；月光陰影跟隨主角；擋在主角前方的樹、山崖、屋頂會以抖動方式透明化。點擊移動使用 A* 尋路。
- **角色**：武士、敵人與 Boss 都是程式組裝的剛體部件骨架，動畫為關鍵影格片段；揮刀時機由純邏輯狀態機控制（60 Hz），並有測試確認動畫長度與判定時間一致。
- **原創 3D 道具**：卒塔婆、地藏、倒塌的鳥居、斷柵欄、插在地上的刀槍與箭、破旗、洞窟的腐朽木支架，都用 Blender 腳本（`scripts/blender/props.py`，需 Blender 5.x）建模，風化痕跡畫在頂點色上，匯出到 `scripts/blender/export/`（有進版控），再由 `npm run assets` 最佳化。只有修改模型時才需要開 Blender。
- **音樂**：取樣器引擎（多取樣音色、ADSR、延音循環、殘響送出、主壓縮器），以擴充後的 MML 原創作曲，樂器取樣來自 VSCO 2 CE 與 VCSL（CC0）：弦樂、銅管、長笛（以滑音與顫音模仿尺八）、豎琴、定音鼓；琴的聲部以越南古箏（Đàn tranh）取樣演奏，太鼓用大型民族鼓取樣。
- **字型**：Cinzel 與 Noto Serif TC（OFL），只擷取用到的字。新增中文字串後需重新擷取（開發用，需 `pip install fonttools brotli`）：

  ```sh
  python3 scripts/subset_fonts.py assets-src/fonts
  ```

## 測試

`npm test` 涵蓋：迷宮可解性（鑰匙、拉桿狀態窮舉）、大地圖各封印的可達範圍、斜角地圖（尺寸、起點到終點與每個敵人／甕／村民的連通、3×3 轉換、A* 不切角）、迷宮格子幾何與碰撞、主角狀態機與敵人行為、動畫片段長度、樂曲小節長度、素材清單（每個檔案存在且有授權資訊）、翻譯與字型涵蓋、密技輸入、戰爭迷霧。

## 測試用密技

遊戲中依序輸入 方向鍵 ↑↑↓↓←→←→，接著 B、A 鍵（手把為十字鍵，接著 B、A 鍵；每一鍵要在前一鍵之後約 1 秒內按下）：戰爭迷霧全部打開、體力回滿。再輸入一次，迷霧還原。只在遊戲場景有效，不會寫進存檔。

## 專案結構

```
src/
  core/         Game（流程）、GameLoop、SceneManager、InputManager、Cheat（密技）、GameState
  engine/       Renderer（後製與木版畫收尾）、InkPass（墨線）、Assets、FollowCam、IsoCam、Fonts、程序貼圖
  scenes/       Loading、Title、Intro、Iso（大地圖／村莊／古道）、Dungeon、Boss
  actors/       Rig、Animator、Samurai、Enemies、Rotroot、Villager、HeroActor
  combat/       HeroMachine（主角動作狀態機）、Foe（敵人行為）
  world/        DungeonMap、MapValidator、Grid3D、Level3D、IsoMap、IsoLevel、Props、Fx、SwordTrail、Afterimages、Drift
  audio/        AudioEngine、Sampler、MML、MusicPlayer、MusicData、Sfx
  ui/           UI、Text、Hud、MessageBox、DeathOverlay、PauseMenu、Options、Controls
  data/         levels（迷宮、大地圖、斜角地圖）、encounters、fontChars
  i18n/         t()、繁體中文翻譯表
scripts/        assets/（素材管線）、blender/（原創 3D 道具的建模腳本與匯出的 GLB）、subset_fonts.py
tests/          Vitest
```
