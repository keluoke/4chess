# Maia 3 Chess · 人类直觉与 Stockfish 引擎双轨预测器 (Chrome 插件 - 方案 0 独立版)

基于 **WebGPU** / **WebAssembly** 原生技术，将最新 **Maia 3 (Chessformer)** 730 万参数真实神经网络与 **Stockfish** 国际象棋引擎无缝整合进纯前端 Chrome 插件。

在 **Lichess** 与 **Chess.com** 分析面板中实时对比：“**人类直觉注意力热力图**” vs “**Stockfish 客观最优解**”。

> ⚡ **方案 0 架构特性**：100% 浏览器内原生执行，零本地 Python 环境依赖，零终端命令需求，跨平台（Windows / macOS / Linux）统一即插即用体验。

---

## ⚖️ 严正声明：公平竞技与反作弊铁律 (Fair Play & Anti-Cheat)

> **铁律原则 (The Absolute Iron Law):**
> **无论在 Chess.com 还是 Lichess，在正在进行的实时下棋对局中，本插件严禁提供任何引擎计算、走法建议、候选箭头或热力图服务。严禁任何形式的辅助作弊。**
> 
> *Under NO circumstances does this extension provide engine analysis, candidate moves, intuition arrows, or attention heatmaps during an active chess game.*

### 合法受限运行场景 (Permitted Environments Only)
本插件仅在以下合法场景下进行棋局研判与展示：
1. **分析台 (Analysis Board)**：`/analysis`、`/study`、`/editor`、`/practice`
2. **残局与战术题 (Puzzles & Lessons)**：`/puzzles`、`/lessons`、`/classroom`
3. **已完赛对局复盘 (Post-Game Review & Archives)**：已产生胜负和棋结算的对局历史记录。
4. **实时对局锁定保护 (Fail-Safe Lockdown)**：对局进行中时，插件视觉图层即刻清空，引擎计算全面终止，面板切换为 `🛡️ 对局进行中 · 公平竞技保护中`。若无法百分之百断定对局已结束，系统默认执行安全锁定。

---

## 🌟 核心特性

1. **🧠 内置真实 Maia 3 Chessformer 神经网络 (ICLR 2026)**
   - **完全内置**: 插件安装包内直装 `models/maia3_model.bin`（27.97 MB，7,327,236 真实神经参数）。
   - **零猜乱造**: 彻底摒弃启发式伪算法，严格基于 Chessformer 8 层 Transformer + GAB 几何注意力偏置计算。
   - **Elo 等级分动态调节**: 支持 `1100 (初阶)`、`1500 (中阶)`、`1900 (进阶)`、`2200 (大师)` 以及 600~2600 连续动态插值。

2. **🐟 内置 Stockfish 19 Lite WebAssembly 引擎**
   - **客观评注**: 浏览器后台 Worker 沙箱中即时计算客观局面估值与最佳着法。
   - **极速响应**: 零网络通信开销，毫秒级得出引擎最佳防线与变着。

3. **🏹 双轨箭头与候选着法目标热力图 (Dual Arrows & Heatmap)**
   - 🟡 **金色实线箭头 (Maia 3)**: 投射相应 Elo 分段最符合人类直觉的第一候选走法及概率（如 `e4 (64.3%)`）。
   - 🟢 **翡翠绿虚线箭头 (Stockfish)**: 标出顶级引擎的客观最优解与局面评分（如 `d4 (+0.35)`）。
   - 🎯 **青色发光共识箭头**: 当人类直觉与 Stockfish 达成高度一致时呈现共识合体。
   - 🔥 **目标落点概率热力图**: 汇聚所有合法候选着法目标方格的人类行棋概率聚合（Destination Probability Aggregation）。

4. **⚠️ 人机着法分歧与直觉盲区预警 (Intuition Traps)**
   - 自动对比 Maia 直觉第一选点与 Stockfish 最优走法。
   - 当人类直觉高概率选择走法存在明显损耗（Blunder/Mistake）时，标出“💡 人类直觉陷阱”预警，直击人类思维盲区。

5. **📊 全局复盘与局面损耗榜 (Full Game Review & Drill)**
   - 一键解析整盘对局，基于平均百兵损耗 (ACPL) 与胜率摆动计算关键转折点。
   - 快速导航至失误与大漏手局面，提供“实战着法 vs 最优防线”一键演练与走法分歧剖析。

---

## 📁 目录结构

```
simoextension/
├── manifest.json              # Chrome Manifest V3 扩展配置
├── background.js              # 后台 Service Worker 线程
├── content/
│   ├── content.js             # Content Script 模块入口
│   ├── main-module.js         # 前端主控制器 (调度中心与守卫联动)
│   ├── fair-play-guard.js     # 公平竞技与反作弊状态机守卫
│   ├── board-detector.js      # Lichess / Chess.com 棋盘状态与 FEN 识别器
│   ├── heatmap-overlay.js     # SVG 双轨箭头与直觉热力图层
│   ├── intuition-panel.js     # 悬浮预测面板 UI 组件与全局复盘抽屉
│   └── styles.css             # 视觉交互样式表
├── engine/
│   ├── chess-core.js          # 纯 JS 国际象棋规则、走法生成与王车易位合法性引擎
│   ├── game-analyzer.js       # 全局复盘分析器、损耗排行与缓存引擎
│   ├── maia-engine.js         # 统一双引擎协调调度器
│   ├── maia-inbrowser.js      # 浏览器端纯原生 Maia-3 推理内核
│   ├── stockfish-inbrowser.js # 浏览器端 Stockfish WASM 调度器
│   ├── stockfish-sandbox.html # 隔离沙箱 iframe 载体 (解决页面 CSP)
│   └── stockfish-sandbox.js   # 沙箱内 Stockfish 状态机与队列控制器
├── models/
│   └── maia3_model.bin        # 真实 Maia-3 5M 导出二进制模型 (27.97 MB)
├── lib/
│   └── stockfish.js           # 官方 Stockfish WebAssembly 引擎
├── popup/
│   ├── popup.html             # 插件工具栏面板
│   ├── popup.js               # 偏好配置脚本 (Elo 同步与面板开关)
│   └── popup.css              # 弹出面板样式
└── icons/                     # 插件图标 (16, 48, 128)
```

---

## 🚀 安装与使用指南

### 第一步：在 Chrome 中加载插件
1. 打开 Chrome / Edge / Brave 浏览器，在地址栏输入：
   ```text
   chrome://extensions
   ```
2. 在页面右上角开启 **开发者模式 (Developer mode)**。
3. 点击左上角的 **加载已解压的扩展程序 (Load unpacked)**。
4. 选择本项目所在目录：
   ```text
   /Volumes/AI/coding/simoextension
   ```
5. 看到 `Maia 3 · 人类直觉热力图与预测器` 插件图标亮起即安装成功！

### 第二步：赛后复盘或分析台研判
1. 访问合法研判页面：
   - **Lichess 分析台**: [https://lichess.org/analysis](https://lichess.org/analysis)
   - **Chess.com 分析台**: [https://www.chess.com/analysis](https://www.chess.com/analysis)
   - **已完赛对局复盘**: 如 `/game/live/:id`（对局已正式结束且弹出结算）
2. 页面右上角将自动弹出 **Maia 3 · 人类直觉预测器** 悬浮卡片。
3. 棋盘上将呈现：
   - **金色箭头**: 人类直觉候选
   - **翡翠绿虚线箭头**: Stockfish 引擎最优推荐
   - **热力图**: 人类行棋目标方格概率分布
4. 在悬浮面板中可自由调节 Elo 滑块，或点击“全盘复盘”一览整盘棋的局面损耗手与直觉盲区！
