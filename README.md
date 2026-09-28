# Maia 3 Chess · 人类直觉与 Stockfish 引擎双轨预测器 (Chrome 插件 - 方案 0 独立版)

基于 **WebGPU** / **WebAssembly** 原生技术，将最新 **Maia 3 (Chessformer)** 730 万参数真实神经网络与 **Stockfish** 国际象棋引擎无缝整合进纯前端 Chrome 插件。

在 **Lichess** 与 **Chess.com** 分析面板中实时对比：“**人类直觉注意力热力图**” vs “**Stockfish 客观最优解**”。

> ⚡ **方案 0 架构特性**：100% 浏览器内原生执行，零本地 Python 环境依赖，零终端命令需求，跨平台（Windows / macOS / Linux）统一即插即用体验。

---

## 🌟 核心特性

1. **🧠 内置真实 Maia 3 Chessformer 神经网络 (ICLR 2026)**
   - **完全内置**: 插件安装包内直装 `models/maia3_model.bin`（27.97 MB，7,327,236 真实神经参数）。
   - **零猜乱造**: 彻底摒弃启发式伪算法，严格基于 Chessformer 8 层 Transformer + GAB 几何注意力偏置计算。
   - **Elo 等级分动态调节**: 支持 `1100 (初阶)`、`1500 (中阶)`、`1900 (进阶)`、`2200 (大师)` 以及 600~2600 连续动态插值。

2. **🐟 内置 Stockfish WebAssembly 引擎**
   - **客观评注**: 浏览器后台 Worker 沙箱中即时计算客观局面估值与最佳着法。
   - **极速响应**: 零网络通信开销，毫秒级得出引擎最佳防线与变着。

3. **🏹 双轨箭头与热力图对比系统 (Dual Arrows & Heatmap)**
   - 🟡 **金色实线箭头 (Maia 3)**: 投射相应 Elo 分段最符合人类直觉的第一候选走法及概率（如 `e4 (64.3%)`）。
   - 🟢 **翡翠绿虚线箭头 (Stockfish)**: 标出顶级引擎的客观最优解与局面评分（如 `d4 (+0.35)`）。
   - 🎯 **青色发光共识箭头**: 当人类直觉与 Stockfish 达成高度一致时呈现共识合体。
   - 🔥 **人类焦点热力图**: 呈现棋手在当前局面下的视线与注意力聚集方格。

4. **⚠️ 人机着法差异与战术陷阱研判**
   - 自动对比 Maia 直觉第一选点与 Stockfish 最优走法。
   - 当人类直觉走法存在战术漏洞时，实时发出“⚠️ 人类直觉陷阱”预警，直击人类思维盲区。

5. **♟️ 跨平台无缝适配**
   - **Lichess**: 支持分析板 (`lichess.org/analysis`)、实战对局、战术谜题。自适应棋盘翻转与 DOM 结构。
   - **Chess.com**: 支持分析板 (`chess.com/analysis`)、对局与复盘面板。

---

## 📁 目录结构

```
simoextension/
├── manifest.json              # Chrome Manifest V3 扩展配置
├── background.js              # 后台 Service Worker 线程
├── content/
│   ├── content.js             # Content Script 模块入口
│   ├── main-module.js         # 前端主控制器 (调度中心)
│   ├── board-detector.js      # Lichess / Chess.com 棋盘状态识别器
│   ├── heatmap-overlay.js     # SVG 双轨箭头与直觉热力图层
│   ├── intuition-panel.js     # 悬浮预测面板 UI 组件
│   └── styles.css             # 磨砂玻璃质感 UI 样式表
├── engine/
│   ├── chess-core.js          # 纯 JS 国际象棋规则、走法生成与 SAN 引擎
│   ├── maia-engine.js         # 统一双引擎协调调度器
│   ├── maia-inbrowser.js      # 浏览器端纯原生 Maia-3 Chessformer 推理内核
│   ├── stockfish-inbrowser.js # 浏览器端 Stockfish WebAssembly 调度器
│   ├── stockfish-sandbox.html # 隔离沙箱 iframe 载体 (解决页面 CSP)
│   └── stockfish-sandbox.js   # 沙箱内 Stockfish Worker UCI 控制器
├── models/
│   └── maia3_model.bin        # 真实 Maia-3 5M 导出二进制模型 (27.97 MB)
├── lib/
│   └── stockfish.js           # 官方 Stockfish WebAssembly 引擎 (1.5 MB)
├── popup/
│   ├── popup.html             # 插件工具栏面板
│   ├── popup.js               # 偏好配置脚本
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

### 第二步：开启对局或分析
1. 访问任意分析页面：
   - **Lichess 分析板**: [https://lichess.org/analysis](https://lichess.org/analysis)
   - **Chess.com 分析板**: [https://www.chess.com/analysis](https://www.chess.com/analysis)
2. 页面右上角将自动弹出 **Maia 3 · 人类直觉预测器** 悬浮卡片。
3. 棋盘上将立即显示：
   - **金色箭头**: 人类直觉候选
   - **翡翠绿虚线箭头**: Stockfish 引擎最优推荐
   - **意图热力图**: 人类视线聚焦区域
4. 在悬浮面板中随意拖动 Elo 滑块，观察不同等级分棋手的直觉演变！
