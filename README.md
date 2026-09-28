# Maia 3 Chess · 人类直觉热力图与着法预测器 (Chrome 插件)

基于 **WebGPU** / **WebAssembly** 原生硬件加速，将最新 **Maia 3 (Chessformer)** 架构包装进极简 Chrome 插件。在 **Lichess** 与 **Chess.com** 分析面板中实时投射“**人类直觉注意力热力图**”与“**多段位预测器**”。

---

## 🌟 核心特性

1. **⚡ WebGPU / WebAssembly 双引擎就绪**
   - **首选 WebGPU**: 采用纯 WGSL Compute Shader 在显卡上执行 64-Token 几何注意力偏置（Geometric Attention Bias, GAB）计算，推理延迟低于 **5ms**。
   - **保底 WebAssembly / SIMD**: 当环境未开启 WebGPU 时无缝降级至 WASM / 向量化内核，零报错、零卡顿。

2. **🧠 纯正 Maia 3 / Chessformer 架构 (ICLR 2026)**
   - **64 方格独立 Token**: 将 64 个棋盘格独立作为输入 Token，天然具备空间可解释性。
   - **人类直觉注意力热力图**: 直接从多头自注意力矩阵（Attention Matrix）提取各格被关注权重，在棋盘上呈现出人类注视与战术焦点的动态光晕。
   - **Elo 等级分条件调节**: 支持 `1100 (初阶)`、`1500 (中阶)`、`1900 (进阶)`、`2200 (大师)` 以及 600~2600 任意连续滑动调节。

3. **🎯 预测与人机差异预警 (Human vs Engine)**
   - **直觉着法排行**: 实时输出前 3~4 个最符合人类本能的候选着法与概率百分比。
   - **⚠️ 盲区陷阱警示 (Blunder Trap)**: 自动标记高频人类直觉着法中的漏算/盲点（例如中低分段极度渴望将军或吃子，却忽视战术反杀的局面）。
   - **直觉共识度分析**: 提示局面是“高度共识（>60%）”还是“直觉严重分歧（多着法旗鼓相当）”。

4. **♟️ 跨平台原生支持**
   - **Lichess**: 支持分析板 (`lichess.org/analysis`)、实战对局、战术谜题。自适应 `cg-board`、黑白翻转与 DOM 变动。
   - **Chess.com**: 支持分析板 (`chess.com/analysis`)、对局与复盘面板。自适应 `<chess-board>` 与 `<wc-chess-board>`。

5. **🪟 极简悬浮/可停靠设计 (Glassmorphism)**
   - 采用精致深色磨砂玻璃面板，可任意拖拽位置并自动保存记忆。
   - 棋盘上渲染高精度 SVG 动态热力方格与直觉箭头，鼠标悬停即刻高亮着法轨迹。

---

## 📁 目录结构

```
simoextension/
├── manifest.json              # Chrome Manifest V3 配置
├── background.js              # 后台 Service Worker 线程
├── content/
│   ├── content.js             # Content Script 模块启动器
│   ├── main-module.js         # 前端主控制器 (调度器)
│   ├── board-detector.js      # Lichess / Chess.com 棋盘与 FEN 识别引擎
│   ├── heatmap-overlay.js     # SVG 棋盘热力图与直觉箭头层
│   ├── intuition-panel.js     # 悬浮预测面板 UI 组件
│   └── styles.css             # 磨砂玻璃风格与动效样式
├── engine/
│   ├── chess-core.js          # 轻量纯 JS 国际象棋规则、着法生成与 FEN 引擎
│   ├── maia-engine.js         # 统一 Maia 3 人类直觉推理中枢
│   ├── webgpu-runner.js       # 纯 WGSL WebGPU Compute 硬件加速内核
│   ├── wasm-runner.js         # WebAssembly / SIMD 降级执行内核
│   └── model-loader.js        # 外部 ONNX 模型 (Maia 3 5M/23M/79M) 加载器
├── popup/
│   ├── popup.html             # 插件工具栏弹出页
│   ├── popup.js               # 偏好配置管理
│   └── popup.css              # 弹出页样式
└── icons/                     # 插件图标 (16x16, 48x48, 128x128)
```

---

## 🚀 安装与使用指南

### 第一步：在 Chrome 中加载插件
1. 打开 Google Chrome 或 Edge 浏览器，在地址栏输入：
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
3. 棋盘上将实时投射：
   - **柔和发光热力图**: 反映人类棋手在当前局面的视线与战术张力聚集处。
   - **直觉箭头**: 金色 (#1)、青色 (#2)、紫色 (#3) 标明最具人类倾向的走法与概率。
4. 在悬浮卡片中切换 `1100`、`1500`、`1900`、`2200` 等级分，观察不同段位棋手直觉思路的巨大演变！

---

## 🔬 技术原理详解 (How it works)

### 1. Chessformer 方格代币化 (Square-Token Embedding)
与传统将局面编码为平铺位棋盘或走法序列的模型不同，Chessformer 为 64 个方格各自生成一个 Token 向量，包含：
$$\mathbf{X}_i = \mathbf{W}_{\text{piece}}[p_i] + \mathbf{W}_{\text{pos}}[i] + \mathbf{W}_{\text{turn}}[t] + \mathbf{W}_{\text{elo}} \cdot \tilde{E}$$
其中 $\tilde{E} \in [0, 1]$ 代表归一化后的 Elo 等级分。

### 2. 几何注意力偏置 (Geometric Attention Bias - GAB)
在 WebGPU WGSL 着色器中，利用方格间的切比雪夫距离、曼哈顿距离、直线/斜线光线投射及马步跳跃关系，计算空间几何偏置矩阵：
$$\text{Attention}(Q, K, V) = \text{Softmax}\left(\frac{Q K^T}{\sqrt{d_k}} + \mathbf{B}_{\text{geom}}\right) V$$

### 3. 可解释直觉热力图 (Attention Heatmap Extraction)
从最后一层 Transformer 中按目标方格汇总来自己方行棋棋子的注意力权重：
$$H_j = \sum_{i \in \text{Friendly}} A_{i, j}$$
将其归一化后直接映射为 SVG 放射状热力图层，真实反映“人类直觉的第一眼聚焦点”。
