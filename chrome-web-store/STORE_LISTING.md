# 歧路 Diverge · 商店上架文案（Chrome Web Store Listing Copy）

> 本文档为「歧路 Diverge · 人类直觉与双引擎国际象棋复盘」Chrome 扩展的商店上架文案，**中英双语**，可直接复制粘贴到 [Chrome 开发者控制台](https://chrome.google.com/webstore/devconsole/) 的「商品详情（Store Listing）」页。
> 文案未修改任何源代码；仅为上架准备。

---

## 一、核心字段（Dashboard 速填）

| Dashboard 字段 | 填写值 |
|---|---|
| 语言（主要 listing 语言） | 简体中文（zh-CN） |
| 名称（Title） | `歧路 Diverge · 人类直觉与双引擎研判` |
| 简介（摘要 / Short description，≤ 80 字符） | 见下方「简介」 |
| 详细说明（Detailed description） | 见下方「详细说明」 |
| 类别（Category） | **Sports（体育）**；备选：Productivity / Education |
| 语言（支持的语言） | 简体中文、English |
| 地区（Distribution） | 全球（所有国家/地区） |
| 可见性（Visibility） | Public（公开）；如需先小范围测试可选 Unlisted |
| 隐私政策网址（Privacy policy） | 托管后填写，见 `PRIVACY_POLICY.md`（推荐：`https://4chess.cc/privacy`） |

---

## 二、名称（Title）

**简体中文：** `歧路 Diverge · 人类直觉与双引擎研判`  
**English：** `Diverge · Chess Intuition & Dual-Engine Review`

> 标题长度远低于 75 字符上限，且未堆砌关键词，符合商店命名规范。

---

## 三、简介 / 摘要（Short description，≤ 80 字符）

**简体中文：**
```
纯本地双引擎国际象棋复盘：人类直觉 vs 引擎最优，赛后热力图对比。
```
（35 字符）

**English：**
```
In-browser chess post-game review: human intuition vs Stockfish, with heatmaps.
```
（约 75 字符）

---

## 四、详细说明（Detailed description）

### 简体中文版

```
⚖️ 公平竞技优先 · 绝不辅助作弊

Maia 3 是一款纯浏览器端运行的双引擎国际象棋复盘扩展。它把「人类直觉」与「引擎最优解」并排呈现在你已结束的对局与训练页面上，帮助你理解：人类会怎么想，机器会怎么走，差距在哪里。

🧠 双引擎，各司其职
· Maia 3（Chessformer 神经网络）：模拟真实棋手直觉，给出最符合某一段位人类的第一候选着法与概率。
· Stockfish 19（WebAssembly）：顶级开源引擎，给出客观最优解与局面评分。
两者均在你的设备本地推理，无需上传任何棋谱。

🏹 三方对比，一目了然
· 金色实线箭头 —— 人类直觉候选着法及概率（如 e4 64.3%）
· 翡翠绿虚线箭头 —— Stockfish 客观最优解与评分（如 d4 +0.35）
· 共识合体 —— 当人机高度一致时高亮提示
· 落点热力图 —— 所有合法着法目标方格的人类行棋概率聚合

🎯 直觉等级分可调
支持 1100（初学）/ 1500（进阶）/ 1900（俱乐部）/ 2200（大师）预设，亦可连续滑杆微调（600–2600），让直觉预测贴合你的水平。

🖥️ 独立大屏全盘分析（PWA）
一键把整盘对局导入独立工作台：优势/胜率走向折线图、人机分歧时刻（妙手/俗手）、完整记谱。支持粘贴 PGN、导入 .pgn 文件、或粘贴 Lichess / Chess.com 对局链接。可离线安装。

🔒 严格公平竞技守卫（Fair Play Guard）
在 Lichess 与 Chess.com 的实时进行对局中，扩展会自动锁定：清空所有箭头与热力图，停止引擎计算，面板切换为「对局进行中 · 公平竞技保护中」。仅在对局正式结束后自动解锁。这是国际象棋反作弊守则的硬性要求。

✅ 隐私至上
· 100% 本地推理，棋谱与局面数据绝不上传第三方服务器。
· 仅使用 chrome.storage 保存你的偏好（等级分、语言、面板位置等）。
· 模型权重仅从 CDN 下载到本地，不回传任何用户数据。
· 无广告、无埋点、无第三方追踪。

🌐 适用场景
· Lichess / Chess.com 分析台、棋局研究室、练习题
· 已完赛对局复盘（结算后）
· 独立大屏全盘分析（analysis 页面或 4chess.cc）

让复盘成为理解棋局的窗口，而不是作弊的工具。
```

### English version

```
⚖️ Fair Play First · No Cheating Assistance

Maia 3 is an in-browser, dual-engine post-game review extension for chess. It places "human intuition" and the "engine's best move" side by side on your finished games and training pages — helping you see how humans think, how the machine plays, and where the gap is.

🧠 Two engines, one purpose
· Maia 3 (Chessformer neural network): models real-player intuition, suggesting the most human-like candidate move and its probability.
· Stockfish 19 (WebAssembly): the top open-source engine, giving the objective best move and evaluation.
Both run entirely on your device — no game data is ever uploaded.

🏹 Three-way comparison, at a glance
· Gold solid arrow — human intuition candidate & probability (e.g. e4 64.3%)
· Emerald dashed arrow — Stockfish best move & eval (e.g. d4 +0.35)
· Consensus highlight — flags strong human–engine agreement
· Destination heatmap — aggregated human-move probability over all legal target squares

🎯 Adjustable intuition rating
Presets 1100 (beginner) / 1500 (intermediate) / 1900 (club) / 2200 (master), plus a continuous slider (600–2600) to match your level.

🖥️ Standalone full-game analysis (PWA)
Send a whole game to a dedicated workspace: advantage/win-rate trend chart, human–engine divergence moments (brilliant / inaccuracy), and full notation. Paste a PGN, import a .pgn file, or drop a Lichess / Chess.com game URL. Installable for offline use.

🔒 Strict Fair Play Guard
During live games on Lichess and Chess.com, the extension auto-locks: all arrows and heatmaps are cleared, engine computation stops, and the panel switches to "Live Game · Fair Play Shield". It unlocks only after the game officially ends. This is a hard requirement of chess anti-cheat rules.

✅ Privacy first
· 100% local inference — game and position data never leave your device.
· Only chrome.storage is used, to remember your preferences (rating, language, panel position).
· Model weights are downloaded from a CDN to your device; no user data is sent back.
· No ads, no analytics, no third-party tracking.

🌐 Where it works
· Lichess / Chess.com analysis boards, studies, puzzles
· Finished-game review (after results are settled)
· Standalone full-game analysis (analysis page or 4chess.cc)

Make review a window into the game — not a cheating tool.
```

---

## 五、关键词 / 标签（Keywords，用于商店搜索优化）

**中文：** 国际象棋、复盘、人工智能、神经网络、Stockfish、Maia、棋局分析、直觉热力图、人类直觉、公平竞技、Lichess、Chess.com

**English：** chess, analysis, review, post-game, AI, neural network, Stockfish, Maia, intuition, heatmap, Lichess, Chess.com, fair play

---

## 六、单一用途声明（Single Purpose Policy）

本扩展具有**单一明确用途**：为国际象棋玩家提供**赛后复盘与人类直觉/引擎对比分析**。其全部功能——双引擎推理、三方对比箭头与热力图、等级分调节、独立大屏全盘分析——均直接服务于这一目的，不存在无关或隐藏功能。

---

## 七、权限理由（Permission Justifications，提交时需在控制台逐条填写）

| 权限 | 用途说明 |
|---|---|
| `storage` | 本地保存用户偏好：默认直觉等级分、界面语言、面板开关、模型 CDN 节点、面板/浮窗位置。仅存于本机，不上传。 |
| `activeTab` | 当用户点击激活 Lichess / Chess.com 标签页时，读取当前棋盘局面（FEN）并注入分析面板与覆盖层。 |
| `host_permissions: lichess.org / *.lichess.org / chess.com / *.chess.com` | 在上述域名注入内容脚本以读取棋盘与对局数据，并在本地完成分析展示。不向这些站点回传任何用户数据。 |
| `host_permissions: weights.4chess.cc / maia3-cdn.pages.dev` | 仅用于**下载** Maia 3 神经网络模型权重到本地缓存。属于资源获取，不涉及用户数据上传。 |

> 扩展不含任何远程代码执行（无 `eval`/外部脚本注入），所有推理均在本地 WASM / JS 完成，符合 MV3 安全规范。

---

## 八、用户数据处理披露速填（User Data Disclosures，控制台必填）

> ⚠️ **Chrome 商店审核核心合规要求**：根据 [Chrome 商店用户数据政策 FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)，**即使数据仅在客户端浏览器本地处理、未传输至服务器，也必须如实勾选并披露！切勿勾选“未处理任何用户数据”。**

在开发者控制台「隐私权与数据安全」→「用户数据」页面按如下填写：

| 控制台选项 | 选择与填写值 |
|---|---|
| **数据使用分类（Data Usage）** | 勾选 **Website Content（网页内容）** |
| **数据收集理由（Justification）** | *The extension reads chess board positions (FEN), move notations (SAN/PGN), and public player usernames solely on Lichess.org and Chess.com to provide real-time intuition predictions, blunders detection, and post-game review. All data is processed 100% locally in the user's browser memory via WebAssembly and Float32 neural network inference. No personal data, browsing history, or game information is ever transmitted to, stored on, or shared with any developer-owned or external servers.* |
| **数据合规认证（Certification）** | 勾选全部 3 项承诺：<br>1. 不将数据出售给第三方<br>2. 不将数据用于个性化广告或借贷征信<br>3. 不将数据用于核心功能以外的任何目的 |

---

## 九、本地化说明

商品详情建议至少提供「简体中文」与「English」两个语言版本（在控制台「语言」中添加）。文案已在上文给出双语，可分别粘贴。若仅上线中文，English 版本可留空或复用中文版摘要。
