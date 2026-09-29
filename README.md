# Maia 3 Chess · 人类直觉与 Stockfish 引擎双轨预测器 (Chrome 插件 · 纯前端独立版)

基于 **纯前端浏览器端推理**（JavaScript Float32 神经网络引擎 + **Stockfish 19 WebAssembly**），将最新 **Maia 3 (Chessformer)** 730 万参数真实神经网络与顶级开源国际象棋引擎无缝整合进 Chrome 插件。

在 **Lichess** 与 **Chess.com** 分析面板及独立复盘大屏中，实时三方对比：“**实战着法**” vs “**人类直觉候选 (Maia 3)**” vs “**客观最优解 (Stockfish 19)**”。

> ⚡ **纯前端独立架构特性**：
> - 100% 浏览器内原生执行，零本地 Python 环境依赖，零终端命令需求。
> - 插件随附内置 27.97 MB 真实模型权重 (`models/maia3_model.bin`)，亦支持 Cloudflare CDN 动态加速拉取。
> - 棋盘与走法数据 100% 在本地完成推理计算，绝无走法上传外部服务器。

---

## ⚖️ 严正声明：公平竞技与反作弊铁律 (Fair Play & Anti-Cheat)

> **铁律原则 (The Absolute Iron Law):**
> **无论在 Chess.com 还是 Lichess，在正在进行的实时对局中，本插件严禁提供任何引擎计算、走法建议、候选箭头或热力图服务。严禁任何形式的辅助作弊。**
> 
> *Under NO circumstances does this extension provide engine analysis, candidate moves, intuition arrows, or attention heatmaps during an active chess game.*

### 合法受限运行场景 (Permitted Environments Only)
本插件仅在以下合法场景下进行棋局研判与展示：
1. **分析台 (Analysis Board)**：`/analysis`、`/study`、`/editor`、`/practice`
2. **残局与战术题 (Puzzles & Lessons)**：`/puzzles`、`/lessons`、`/classroom`
3. **已完赛对局复盘 (Post-Game Review & Archives)**：已产生胜负和棋结算的对局历史记录。
4. **实时对局锁定保护 (Fail-Safe Lockdown)**：一旦检测到对局进行中控件（活跃时钟、投降/认输/和棋按钮），插件视觉图层即刻清空，引擎计算全面终止，面板切换为 `🛡️ 对局进行中 · 公平竞技保护中`。若无法百分之百断定对局已结束，系统默认执行安全锁定。

---

## 🌟 核心特性

1. **🧠 真实 Maia 3 Chessformer 神经网络推理 (ICLR 2026)**
   - **纯前端原生推理**: 通过 Float32 矩阵计算内核，高精度执行 Chessformer 8 层 Transformer + GAB 几何注意力偏置。
   - **真实权重 (27.97 MB)**: 内置 7,327,236 真实神经参数，摒弃任何启发式伪造。
   - **Elo 等级分动态调节**: 支持 `1100 (初阶)`、`1500 (中阶)`、`1900 (进阶)`、`2200 (大师)` 及连续动态插值。

2. **🐟 Stockfish 19 WebAssembly 引擎**
   - **多线分析 (MultiPV 3)**: 后台沙箱中即时给出客观局面估值与最佳着法，精准度量人类直觉候选的百兵损耗 ($\Delta$ centipawn loss)。
   - **隔离沙箱**: 通过 `engine/stockfish-sandbox.html` 完美避开第三方网站严格的 CSP 策略。

3. **🏹 三方对比与直觉热力图 (Three-Way Comparison & Heatmap)**
   - 🟡 **金色实线箭头 (Maia 3)**: 投射相应 Elo 分段最符合人类直觉的第一候选走法及概率（如 `e4 (64.3%)`）。
   - 🟢 **翡翠绿虚线箭头 (Stockfish)**: 标出顶级引擎的客观最优解与局面评分（如 `d4 (+0.35)`）。
   - 🎯 **共识合体**: 当人类直觉与 Stockfish 达成高度一致时呈现共识合体。
   - 🔥 **目标落点概率热力图**: 汇聚所有合法候选着法目标方格的人类行棋概率聚合（Destination Probability Aggregation）。

4. **🖥️ 独立大屏深度复盘工作台 (Analysis Studio)**
   - 一键提取整盘对局 PGN 并在独立标签页打开大屏复盘工作台 (`analysis/index.html`)。
   - 采用标准 Lichess 配色棋盘与 Cburnett 矢量棋子，支持三方着法实时对照、关键局面筛选、双盲战术演练与走法损耗榜。

---

## 📁 目录结构

```
simoextension/
├── manifest.json              # Chrome Manifest V3 扩展配置 (严格域名白名单)
├── background.js              # 后台 Service Worker 线程 (标签页管理与 PGN 请求代理)
├── analysis/                  # 独立大屏深度复盘工作台
│   ├── index.html             # 复盘工作台 HTML 界面
│   ├── analysis.js            # 复盘工作台核心逻辑与三方对比控制器
│   ├── analysis.css           # 复盘工作台 Lichess 风格样式表
│   └── board-ui.js            # 矢量棋盘渲染与箭头绘制引擎
├── content/
│   ├── content.js             # Content Script 模块入口
│   ├── main-module.js         # 前端主控制器 (调度中心、延迟加载与守卫联动)
│   ├── fair-play-guard.js     # 公平竞技与反作弊状态机守卫 (DOM 节流监听)
│   ├── board-detector.js      # Lichess / Chess.com 棋盘状态与 FEN 识别器 (含棋子符号恢复)
│   ├── heatmap-overlay.js     # SVG 双轨箭头与直觉热力图层
│   ├── intuition-panel.js     # 悬浮预测面板 UI 组件与设置抽屉
│   ├── page-bridge.js         # 主世界通信桥梁
│   └── styles.css             # 视觉交互样式表
├── engine/
│   ├── chess-core.js          # 纯 JS 国际象棋规则、走法生成与王车易位合法性引擎
│   ├── game-analyzer.js       # 全局复盘分析器、损耗排行与缓存引擎
│   ├── maia-engine.js         # 统一双引擎协调调度器 (MultiPV 3 损耗计算)
│   ├── maia-inbrowser.js      # 浏览器端纯原生 Maia-3 Float32 推理内核
│   ├── stockfish-inbrowser.js # 浏览器端 Stockfish WASM 调度器 (支持沙箱与直接 Worker)
│   ├── stockfish-sandbox.html # 隔离沙箱 iframe 载体 (解决页面 CSP)
│   └── stockfish-sandbox.js   # 沙箱内 Stockfish 状态机与队列控制器
├── models/
│   └── maia3_model.bin        # 真实 Maia-3 5M 二进制模型权重 (27.97 MB)
├── lib/
│   ├── stockfish-19.js        # Stockfish 19 Emscripten 胶水脚本
│   └── stockfish.wasm         # Stockfish 19 WebAssembly 引擎二进制文件
├── popup/
│   ├── popup.html             # 插件工具栏面板 (真实现状说明与模型选择)
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
   - **已完赛对局复盘**: 如 `/game/live/:id`（对局已正式结束且弹出结算框）
2. 页面将自动加载 **Maia 3 · 人类直觉预测器** 悬浮卡片。
3. 棋盘上将呈现：
   - **金色箭头**: 人类直觉候选
   - **翡翠绿虚线箭头**: Stockfish 引擎最优推荐
   - **落点热力图**: 人类行棋概率分布
4. 点击悬浮面板上的“**独立大屏深度复盘**”，即可跳转至独立复盘大屏，全面分析整局走法与直觉盲区。
