# 歧路 Diverge · Chrome Web Store 上架文案 (Store Listing Copy)

> **当前配置指南**：针对 Chrome 开发者控制台商品详情页（[Dashboard Listing Edit](https://chrome.google.com/webstore/devconsole/6c7445bd-661a-43f4-adc7-c9415dddb75b/egiimjkekgiaimaagaljiclacljmdkmo/edit/listing)）。
> **核心策略**：**英语为主（Primary English），中文为辅（Secondary Chinese）**。
> **🎉 原生 i18n 已就绪**：安装包已内置 `_locales/en` 与 `_locales/zh_CN`。上传 `diverge-extension-v1.0.2.zip` 时，控制台会自动识别并填充英语为默认语言，同时自动挂载简体中文语言槽！
> 本文档提供两种填报方案：
> - **方案 A（推荐 · 国际化双语言）**：默认语言设为 **English (United States)**，另通过「+ 添加语言」增加 **简体中文 (zh-CN)**（上传带 `_locales` 的包后通常会自动激活）。
> - **方案 B（单页双语混合）**：若开发者控制台维持单一 listing 页面，直接使用「英文在上、中文在下」的中英一体排版。

---

## 快速速填卡（Quick Dashboard Copy-Paste Card）

| Dashboard 字段 | 方案 A：主要 Listing (English) | 方案 A：附加语言 (简体中文) | 方案 B：单页双语混合 (Bilingual) |
|---|---|---|---|
| **名称 / Title** (≤75字) | `Diverge: Chess AI Review & Intuition (Maia + Stockfish)` (55字) | `歧路 Diverge · 人类直觉与双引擎国际象棋复盘` (23字) | `Diverge: Chess AI Review (Maia & Stockfish) · 歧路复盘` (53字) |
| **摘要 / Summary** (≤132字) | `Post-game chess review with Maia human intuition vs Stockfish engine best moves. Move heatmaps & 100% private local analysis.` (126字) | `纯本地双引擎国际象棋赛后复盘：人类直觉 (Maia) vs 算力最优 (Stockfish)，走法热力图与分歧研判，零数据上传。` (60字) | `Chess review: Maia human intuition vs Stockfish engine moves. 纯本地双引擎国际象棋赛后复盘：人类直觉 vs 算力最优。` (126字) |
| **类别 / Category** | **Sports**（体育）或 **Productivity**（生产力工具） | 同左 | 同左 |
| **隐私政策 URL** | `https://4chess.cc/privacy` | 同左 | 同左 |

---

# 方案 A：英文主 Listing（English Primary Listing）

### 1. Title（名称，55 / 75 字符）
```text
Diverge: Chess AI Review & Intuition (Maia + Stockfish)
```

*(备选 1 - 强调赛后与热力图)*:
```text
Diverge · Post-Game Chess Review & Human Intuition Heatmaps
```

*(备选 2 - 极简高辨识度)*:
```text
Diverge: Chess AI Review with Maia & Stockfish
```

### 2. Summary / Short Description（摘要，126 / 132 字符）
```text
Post-game chess review with Maia human intuition vs Stockfish engine best moves. Move heatmaps & 100% private local analysis.
```

*(备选 - 突出平台支持，131 / 132 字符)*:
```text
Compare Maia human intuition with Stockfish precision. Post-game review, move heatmaps & blunder analysis for Lichess & Chess.com.
```

### 3. Detailed Description（详细说明）
*直接全选复制以下纯文本内容至 Description 输入框（格式已针对 Chrome 商店排版深度适配，无无效 markdown 标记）：*

```text
⚖️ FAIR PLAY FIRST · STRICT ANTI-CHEAT COMPLIANCE
Diverge strictly adheres to the Fair Play and Anti-Cheat regulations of Chess.com and Lichess.org.
• Zero Live Assistance: During live timed games, Diverge automatically engages a fail-safe lock. Engine computation completely halts (0% CPU), and all visual overlays are cleared immediately.
• Legitimate Post-Game Use Only: Diverge unlocks exclusively when games are concluded, on analysis boards (/analysis, /study), and in tactical puzzles (/puzzles).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Understand how humans think, how engines calculate, and where the gap lies.

Standard chess engines calculate like cold supercomputers, leaving you wondering: "Why did I play that move? What would another human at my rating play?" 

Diverge brings two powerhouse engines together right inside your browser:
1. Maia 3 (Chessformer Neural Network): Models real human chess intuition, predicting the most natural candidate moves and their probabilities at calibrated Elo rating levels.
2. Stockfish 19 (WebAssembly): The world's strongest open-source engine, delivering objective tactical evaluations and optimal computer moves.

Both engines run 100% locally on your machine via WebAssembly. No game data or positions are ever uploaded to any server.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ KEY FEATURES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🏹 Side-by-Side Visual Comparison
• Gold Solid Arrow: Human intuition candidate & probability (e.g., e4 64.3% at your Elo).
• Emerald Dashed Arrow: Stockfish objective best move and position score (e.g., d4 +0.35).
• Consensus Glow: Automatically highlights when human instinct matches engine perfection.
• Target Heatmap: Aggregated human probability heatmap across all legal destination squares.

🎯 Calibrated Intuition Ratings
Fine-tune Maia to mirror real human play at any skill level:
• Quick presets: 1100 (Beginner), 1500 (Intermediate), 1900 (Club), and 2200+ (Master).
• Continuous slider (600–2600) to benchmark against your exact rating bracket.

📊 Standalone Deep Review Studio (PWA)
Take your post-game analysis to a dedicated full-screen workspace:
• Win-rate & advantage momentum charts.
• Divergence breakdown: identify human blunders, subtle inaccuracies, and clever traps.
• Import via PGN string, .pgn file, or direct Lichess / Chess.com game links.
• Installable as a standalone PWA for offline post-game study.

🔒 100% Local, Private & Fast
• True Edge Computing: WebAssembly and Float32 neural network inference execute entirely in your local browser memory.
• Zero Telemetry: No board positions, FEN strings, or browsing history leave your device.
• Instant Cache: Model weights are cached securely in browser IndexedDB after the first load for offline zero-latency use.
• Clean & Respectful: No ads, no analytics, no third-party tracking.

🌐 WHERE IT WORKS
• Lichess.org: Finished game review, Analysis Board, Studies, Puzzles.
• Chess.com: Finished game review, Analysis Board, Puzzles, Classroom.
• Standalone Studio: Built-in analysis workspace or 4chess.cc.

Make post-game review a bridge to genuine chess understanding.
```

---

# 方案 A：中文附加 Listing（Chinese Secondary Listing）

> 在 Chrome 开发者控制台点击「语言」添加「中文 (简体)」时填入：

### 1. 名称（Title，23 / 75 字符）
```text
歧路 Diverge · 人类直觉与双引擎国际象棋复盘
```

### 2. 摘要（Summary，60 / 132 字符）
```text
纯本地双引擎国际象棋赛后复盘：人类直觉 (Maia) vs 算力最优 (Stockfish)，走法热力图与分歧研判，零数据上传。
```

### 3. 详细说明（Detailed Description）
```text
⚖️ 公平竞技优先 · 绝不辅助作弊
歧路 Diverge 严格遵守 Chess.com 与 Lichess.org 的公平竞技与反作弊守则。
• 实时对局绝对禁算：在正在进行的倒计时对局中，扩展毫秒级自动死锁，彻底停止引擎计算（CPU 归零），并清空所有视觉提示。
• 仅限赛后与研判：仅在比赛正式结束结算后、分析台（/analysis、/study）及残局战术题（/puzzles）中自动解锁。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

理解人类怎么想，机器怎么走，差距在哪里。

传统国际象棋引擎只会输出冰冷的算力评分，无法解释人类为何会走出看似合理的疑问手。歧路 Diverge 把「人类直觉」与「引擎最优解」并排呈现在你已结束的对局与训练页面上：
1. Maia 3（Chessformer 神经网络）：模拟真实人类棋手直觉，给出最符合某一段位人类的第一候选着法与概率。
2. Stockfish 19（WebAssembly）：顶级开源引擎，给出客观最优解与局面评分。

双引擎均在你的设备本地推理，无需上传任何棋谱。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ 核心功能亮点
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🏹 三方走法对比，一目了然
• 金色实线箭头：人类直觉候选着法及概率（如 e4 64.3%）
• 翡翠绿虚线箭头：Stockfish 客观最优解与评分（如 d4 +0.35）
• 共识高亮：当人机意见高度一致时自动合体高亮提示
• 落点热力图：所有合法着法目标方格的人类行棋概率聚合

🎯 直觉等级分自由调节
支持 1100（初学）/ 1500（进阶）/ 1900（俱乐部）/ 2200（大师）预设，亦可连续滑杆微调（600–2600），让直觉预测贴合你的真实水平。

📊 独立大屏全盘复盘工作台（PWA）
• 优势/胜率走向折线图与走法分歧列表
• 人机分歧点剖析（妙手/俗手/盲点陷阱）
• 支持粘贴 PGN、导入 .pgn 文件或 Lichess / Chess.com 对局链接，支持离线安装。

🔒 纯本地隐私安全
• 100% 浏览器本地推理，棋谱与局面数据绝不上传第三方服务器。
• 模型权重本地 IndexedDB 持久化缓存，秒开且支持断网离线复用。
• 仅使用 chrome.storage 保存本地偏好（等级分、语言、面板位置等）。
• 无广告、无埋点、无第三方追踪。

🌐 适用场景
• Lichess.org / Chess.com 已完赛对局复盘（结算后）
• 棋局分析台（/analysis）、研究室（/study）、残局练习（/puzzles）
• 独立大屏全盘分析工作台（4chess.cc）

让复盘成为理解棋局的窗口，而不是辅助作弊的工具。
```

---

# 方案 B：单页双语混合 Listing（Unified Bilingual Listing）

> 若控制台未开启多语言，直接使用一个 Listing 兼顾全球玩家（英语在前 70%，中文在后 30%）：

### 1. Title（名称，53 / 75 字符）
```text
Diverge: Chess AI Review (Maia & Stockfish) · 歧路复盘
```

### 2. Summary（摘要，126 / 132 字符）
```text
Chess review: Maia human intuition vs Stockfish engine moves. 纯本地双引擎国际象棋赛后复盘：人类直觉 vs 算力最优。
```

### 3. Detailed Description（详细说明）
*直接复制以下全文填入说明框：*

```text
⚖️ FAIR PLAY FIRST · STRICT ANTI-CHEAT COMPLIANCE
Diverge strictly adheres to the Fair Play and Anti-Cheat regulations of Chess.com and Lichess.org.
• Zero Live Assistance: During live timed games, Diverge automatically engages a fail-safe lock. Engine computation completely halts (0% CPU), and all visual overlays are cleared immediately.
• Legitimate Post-Game Use Only: Diverge unlocks exclusively when games are concluded, on analysis boards (/analysis, /study), and in tactical puzzles (/puzzles).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Understand how humans think, how engines calculate, and where the gap lies.

Standard chess engines calculate like cold supercomputers, leaving you wondering: "Why did I play that move? What would another human at my rating play?" 

Diverge brings two powerhouse engines together right inside your browser:
1. Maia 3 (Chessformer Neural Network): Models real human chess intuition, predicting the most natural candidate moves and their probabilities at calibrated Elo rating levels.
2. Stockfish 19 (WebAssembly): The world's strongest open-source engine, delivering objective tactical evaluations and optimal computer moves.

Both engines run 100% locally on your machine via WebAssembly. No game data or positions are ever uploaded to any server.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ KEY FEATURES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🏹 Side-by-Side Visual Comparison
• Gold Solid Arrow: Human intuition candidate & probability (e.g., e4 64.3% at your Elo).
• Emerald Dashed Arrow: Stockfish objective best move and position score (e.g., d4 +0.35).
• Consensus Glow: Automatically highlights when human instinct matches engine perfection.
• Target Heatmap: Aggregated human probability heatmap across all legal destination squares.

🎯 Calibrated Intuition Ratings
Fine-tune Maia to mirror real human play at any skill level:
• Quick presets: 1100 (Beginner), 1500 (Intermediate), 1900 (Club), and 2200+ (Master).
• Continuous slider (600–2600) to benchmark against your exact rating bracket.

📊 Standalone Deep Review Studio (PWA)
Take your post-game analysis to a dedicated full-screen workspace:
• Win-rate & advantage momentum charts.
• Divergence breakdown: identify human blunders, subtle inaccuracies, and clever traps.
• Import via PGN string, .pgn file, or direct Lichess / Chess.com game links.
• Installable as a standalone PWA for offline post-game study.

🔒 100% Local, Private & Fast
• True Edge Computing: WebAssembly and Float32 neural network inference execute entirely in your local browser memory.
• Zero Telemetry: No board positions, FEN strings, or browsing history leave your device.
• Instant Cache: Model weights are cached securely in browser IndexedDB after the first load for offline zero-latency use.
• Clean & Respectful: No ads, no analytics, no third-party tracking.

🌐 WHERE IT WORKS
• Lichess.org: Finished game review, Analysis Board, Studies, Puzzles.
• Chess.com: Finished game review, Analysis Board, Puzzles, Classroom.
• Standalone Studio: Built-in analysis workspace or 4chess.cc.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🇨🇳 中文说明（Chinese Summary）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【核心理念】
传统引擎只会输出冰冷的算力评分，无法解释人类为何会犯错。歧路 Diverge 将「人类直觉 (Maia 3)」与「算力最优 (Stockfish 19)」并排呈现，帮您看清差距所在。

【功能亮点】
• 🏹 三方走法对比：金色箭头（人类直觉走法与概率）+ 翡翠绿箭头（引擎最佳着法与评分）+ 共识合体高亮。
• 🎯 直觉等级分可调：1100–2200+ Elo 快速切换与微调滑杆，匹配真实对弈段位。
• 📊 独立复盘工作台：全盘胜率走势图、人机分歧点（妙手/漏着/陷阱）、支持 PGN 与对局链接导入。
• 🔒 严格公平竞技锁：对局中毫秒级死锁，停止一切计算；仅在赛后和分析台中解锁，绝不辅助作弊。
• 🛡️ 纯本地零上传：WebAssembly 本地推理，不向任何服务器传输棋谱或隐私数据。
```

---

## 附加合规申报信息（Dashboard 隐私与权限速查）

### 1. 单一用途说明（Single Purpose Description）
> *The extension provides post-game chess review and comparative analysis between human intuition (Maia) and objective engine evaluation (Stockfish) exclusively on completed games and analysis boards.*

### 2. 权限声明（Permission Justifications）
- `storage`: *Used to store user preferences locally (selected Elo rating, theme, UI position, language). No data is transmitted externally.*
- `activeTab`: *Used to read the current board state (FEN) on Lichess and Chess.com tabs when invoked by the user for post-game review.*
- `host_permissions` (`*.lichess.org/*`, `*.chess.com/*`): *Required to inject the review interface and read board notations on supported chess websites.*
- `host_permissions` (`weights.4chess.cc/*`): *Used strictly to download neural network model weights into browser IndexedDB cache for local inference.*

### 3. 用户数据披露（User Data Disclosure）
- 数据类型勾选：**Website Content（网页内容）**
- 理由填写：
  > *“The extension reads chess board positions (FEN), move notations (SAN/PGN), and public player usernames solely on Lichess.org and Chess.com to provide real-time intuition predictions, blunders detection, and post-game review. All data is processed 100% locally in the user's browser memory via WebAssembly and Float32 neural network inference. No personal data, browsing history, or game information is ever transmitted to, stored on, or shared with any developer-owned or external servers.”*
- 勾选全部 3 项合规保证（不转售、不用作广告/征信、不挪作他用）。
