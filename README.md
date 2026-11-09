# 幽燈魔境 THE CURSED LABYRINTH

原創 FC／NES 風格日式黑暗動作 RPG，瀏覽器直接遊玩。
TypeScript + Vite + Canvas 2D + Web Audio + LocalStorage，不使用 WebGL 或大型框架；所有圖像、音樂、音效皆由程式在專案內產生。唯一的外部素材是繁體中文像素字型（見〈語言與字型〉）。

## 執行

```sh
npm install
npm run dev        # 開發伺服器，瀏覽器開啟顯示的網址
npm run build      # 型別檢查 + 產出 dist/（相對路徑，可放任何靜態主機）
npm run preview    # 預覽 dist/
npm test           # Vitest：迷宮／關卡／大地圖可達性、音樂同步、翻譯與字型涵蓋測試
```

## 操作

| 按鍵 | FC 按鈕 | 橫向關卡／戰鬥 | 3D 迷宮 | 大地圖 |
| --- | --- | --- | --- | --- |
| ← ↑ → ↓ | 十字鍵 | 左右移動 | ↑ 前進、↓ 後退、←→ 轉向 | 移動 |
| X | A | 跳躍 | 調查／開門／揮刀 | 確認 |
| Z | B | 揮刀；↑+Z 使用道具（符咒為投擲） | 使用目前道具 | 取消 |
| Enter | START | 暫停選單 | 暫停選單 | 暫停選單 |
| Shift | SELECT | 道具／地圖畫面 | 道具／地圖畫面 | 道具畫面 |
| F | — | 全螢幕切換 | | |

- 遊戲內所有提示都直接顯示鍵盤按鍵名稱（X／Z／ENTER／SHIFT），不再出現 A／B／START／SELECT。
- 標題選單與暫停選單都有「操作說明」頁；開場故事結束後也會顯示一次；畫面下方提示列同步顯示。
- 手機／平板：畫面下方「TOUCH PAD」按鈕開啟觸控按鍵，按鈕標籤與鍵盤名稱一致（Z／X／SHIFT／ENTER）。
- 視窗失焦或切換分頁時自動暫停。
- 設定：語言（ENGLISH／繁體中文）、BGM／SFX 音量、靜音、掃描線（OFF／LIGHT／MEDIUM）、精靈閃爍（FC 每行 8 個精靈限制模擬）、像素長寬比、觸控板。

## 遊戲流程

1. **序章**：從 HAIYA 村出發。村莊可對話、購物（藥草／符咒／靈藥）、住宿回復。
2. **第一章 朽木古道** → 橫向關卡 → 3D 迷宮「ROTWOOD GROTTO」→ Boss → 封印 I 銅鏡（看穿幻牆、驅散大地圖迷霧）。
3. **第二章 血霧礦坑** → 橫向關卡 → 迷宮 → Boss → 封印 II 血玉（生命上限 +4、解除血封橋）。
4. **第三章 百鬼地城** → 橫向關卡 → 迷宮（拉桿機關）→ Boss → 封印 III 骨笛。
5. **終章 冥王神殿**：三封印開啟神殿門 → 短迷宮 → 高難度橫向關卡 → 冥王（兩段變身）→ 結局與通關統計（時間、擊殺、死亡、接關、寶箱、秘密、步數、評價）。

- 迷宮內遭遇戰會切換到橫向戰鬥場景，勝利後回到迷宮原位。
- 劍的經驗值隨擊殺累積，等級提升攻擊力。
- 神社與村莊會自動存檔；標題畫面 CONTINUE 讀取。存檔在瀏覽器 LocalStorage（`yuto-makyo.save.v1`）。
- 死亡後可接關 3 次（滿血、金錢減半、回到最後檢查點）；用完需從標題讀檔。

## 技術重點

- **畫面**：256×240 索引色緩衝，NES 調色盤，最近鄰縮放；整數倍放大、可選掃描線。淡入淡出以調色盤重映射實作。
- **精靈**：以數字字串描述像素、調色盤槽位換色、左右翻轉；主角為約 7 頭身的真人比例鎧甲武士（側面、背面、大地圖三套）。
- **橫向模式**：16px 圖塊、單向平台、崩落磚、尖刺、沼澤；AABB 軸分離碰撞；FC 式分段卷軸背景；敵人出現邊界觸發。
- **3D 迷宮**：第三人稱背後視角的格子透視渲染，含門、鎖、封印門、拉桿閘門、幻牆、黑暗區、傳送、地圖與羅盤。
- **音樂**：以 FC 四聲道（2 方波 + 三角波 + 打擊）為基底，再加上 FC 硬體沒有的厚度：方波雙振盪器合唱（微失諧）、延遲顫音、平滑包絡與餘韻、主旋律迴聲聲部、合成殘響（ConvolverNode）、立體聲定位、低通與限幅。打擊聲部為合成鼓組（大鼓、小鼓、開閉鈸、銅鈸、木魚、太鼓、締太鼓）。
- **樂曲**：MML 原創作曲（都節／弗里吉亞調式），九首各有速度、殘響量與迴聲設定；小節線 `|` 會被解析並由測試確認每小節長度正確。
- **音效**：全套程式合成。
- **固定 60 Hz 邏輯**，與顯示更新率無關。

## 語言與字型

- 設定 → 語言切換英文／繁體中文，立即生效並記在 LocalStorage；第一次啟動時依瀏覽器語言（`zh-*` 為中文）決定預設。
- 翻譯表在 `src/i18n/zh.ts`，以英文原文為鍵；`t()` 同時把 `{A}` `{B}` `{START}` `{SELECT}` 換成實際按鍵名稱。
- 中文字型：[俐方體11號（Cubic 11）](https://github.com/ACh-K/Cubic-11)，SIL Open Font License 1.1。只擷取遊戲用到的字，轉成 12×13 點陣存於 `src/data/fontZh.ts`；授權全文 `public/licenses/Cubic-11-OFL.txt` 會隨建置複製到 `dist/`。
- 新增或修改中文字串後需重新擷取字型（開發用，需 `pip install fonttools` 與字型檔）：

  ```sh
  python3 scripts/bake_zh_font.py path/to/Cubic_11.ttf
  ```

  `tests/i18n.test.ts` 會檢查：所有顯示字串都有翻譯、佔位符一致、每個字都畫得出來。

## 專案結構

```
src/
  core/         Game、GameLoop、SceneManager、InputManager、GameState
  graphics/     Display、PixelRenderer、Palette、Font、Sprite、透視渲染、圖塊繪製
  audio/        ChiptuneSynth、MML 解析、MusicSequencer、MusicData、SoundEffects
  scenes/       Title、Intro、World、Town、Card、Dungeon、Action、GameOver、Ending
  entities/     Player、Enemy
  combat/       Bosses
  world/        DungeonMap、StageMap、MapValidator
  data/         levels（迷宮／橫向關卡／大地圖）、sprites、encounters
  ui/           HUD、Window、PauseMenu、Inventory、Options、Controls
  i18n/         t()、按鍵名稱、繁體中文翻譯表
  persistence/  SaveManager
scripts/        bake_zh_font.py（中文點陣字擷取）
public/licenses 字型授權
tests/          maps / stages / world / music / i18n 測試
```

## 驗證

- `npm test`：5 個測試檔、49 項全部通過
  - 四座迷宮在每種鑰匙／拉桿狀態下皆可解、寶箱全可達；缺少封印或拉桿時確實無解。
  - 四個橫向關卡 13 列矩形、單一起點與終點、跳躍可達終點（附負面案例）。
  - 大地圖依持有封印逐步開放：無 → 第一章；銅鏡 → 第二章與神社；血玉 → 第三章與 KAGARI 村；骨笛 → 神殿。
  - 每首樂曲四聲道前奏與循環長度一致，且每個小節線都落在 96 tick 的整數倍，不會錯拍。
  - 所有顯示字串都有中文翻譯、佔位符一致、中英文每個字元都有字形；中英混排換行正確。
- `npm run build`：型別檢查與打包通過。
- 瀏覽器實機（Playwright）：標題 → 讀檔 → 大地圖 → 章節卡 → 橫向關卡；迷宮遭遇戰勝利返回；Boss 擊破取得封印回大地圖；死亡接關；村莊選單；結局統計畫面；全程無 console 錯誤。
- 中英文兩種語言逐一截圖檢查：標題、設定、操作說明、開場、HUD（大地圖／迷宮／橫向／Boss）、訊息框、道具與地圖、村莊與商店、Game Over、結局與統計，無文字溢出。
