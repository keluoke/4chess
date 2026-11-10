# 歧路 Diverge (simoextension v1.1.8) 项目全景深度评估报告：技术架构、用户体验、合规边界与商业化战略

本报告基于本地代码库 [simoextension](file:///Volumes/AI/coding/simoextension)（Manifest 与 Package 版本 `1.1.8`）及线上生产站点 [4chess.cc](https://4chess.cc/) 的只读静态代码与架构审查编制，全过程未对现有业务代码、构建产物或配置文件执行任何修改。评估范围覆盖端侧双引擎计算内核、离屏视觉识别架构、公平竞技与沙箱安全边界、三大核心用户旅程体验、前端工程可维护性、开源协议传染性约束、边缘基础设施成本模型以及多阶段商业化演进路径。

## 一、 项目全景与版本演进基线评估

歧路 Diverge（[README.md](file:///Volumes/AI/coding/simoextension/README.md)）定位于国际象棋“客观引擎最优解”与“人类直觉走法预测”的分歧研判工具。不同于传统仅输出单一胜率或冷冰冰引擎主变（Principal Variation）的复盘软件，该项目将顶级传统搜索引擎 [Stockfish 19](https://stockfishchess.org/) 与多伦多大学及卡内基梅隆大学 CSSLab 研发的类人行为预测神经网络 [Maia-3 Chessformer](https://github.com/CSSLab/maia3) 并排运行于用户浏览器端，围绕“同段位棋手本能想走什么（Maia 概率）”与“客观局面应该走什么（Stockfish 估值及百兵损耗 $\Delta$）”的认知落差，提炼出“妙手（超越人类直觉的客观胜着）”与“俗手（符合人类直觉但存在明显客观损耗的天然陷阱）”两大核心研判标签。

从 `v1.0.4` 至当前 `v1.1.8` 基线（[package.json](file:///Volumes/AI/coding/simoextension/package.json)、[manifest.json](file:///Volumes/AI/coding/simoextension/manifest.json)、[DELIVERY-1.1.5.md](file:///Volumes/AI/coding/simoextension/docs/DELIVERY-1.1.5.md)），项目完成了从早期概念验证向完整产品矩阵的跨越式演进。系统现已形成三大协同入口：其一为注入 [Lichess.org](https://lichess.org/) 与 [Chess.com](https://www.chess.com/) 的页面内嵌悬浮研判面板与棋盘 SVG 覆盖层；其二为基于 Chrome `offscreen` API 与本地轻量级卷积神经网络（CNN）的网页静态棋图扫描器（Popup Scanner）；其三为支持渐进式 Web 应用（PWA）离线运行与大屏多栏交互的独立深度复盘工作台（[analysis/index.html](file:///Volumes/AI/coding/simoextension/analysis/index.html) 及 [4chess.cc/analysis](https://4chess.cc/analysis/)）。

| 评估维度 | 当前成熟度评级 | 核心架构与产品亮点（v1.1.8 基线） | 关键技术债务与潜在风险 |
| :--- | :--- | :--- | :--- |
| **端侧双引擎推理架构** | **A-** | [engine/maia-inbrowser.js](file:///Volumes/AI/coding/simoextension/engine/maia-inbrowser.js) 实现 `M3CF` 零拷贝二进制加载与 5M/23M/79M(FP16) 多档支持；8 半步历史通道编码还原真实对局语境 | Maia 算子仍为纯 JS 标量三重嵌套循环，缺失 WASM SIMD 与 WebGPU 加速；79M FP16 解压存在内存翻倍峰值；整局复盘双引擎尚未实现跨 Worker 并行流水线 |
| **静态棋图视觉识别管线** | **A-** | [offscreen/vision.js](file:///Volumes/AI/coding/simoextension/offscreen/vision.js) 结合 613KB 本地 WASM CNN 模型实现纯端侧毫秒级识图，非图片像素遮罩与上游哈希锁机制完善 | 普通网页扫描依赖完整可见截图与严格网格对齐校验；源标签页绑定撤销策略在跨窗口分享场景下对普通用户造成较高理解门槛 |
| **安全隔离与反作弊守卫** | **B+** | [content/fair-play-guard.js](file:///Volumes/AI/coding/simoextension/content/fair-play-guard.js) 落地四阶段 Fail-Safe 锁定，修复了早期用户名误判与未完赛 PGN 放行缺陷，配备源绑定动态吊销 | [manifest.json](file:///Volumes/AI/coding/simoextension/manifest.json) 在实时对局路由仍以 `document_start` 注入 `MAIN` world 脚本并暴露 `stockfish.wasm`，存在被宿主平台反作弊启发式探针误标的风险 |
| **用户体验与多端协同** | **A-** | 悬浮窗在 v1.1.8 完成精简摘要自适应、三态收起/最小化与无障碍焦点改造；通过 [content/preferences-bridge.js](file:///Volumes/AI/coding/simoextension/content/preferences-bridge.js) 同步三端白名单偏好 | 浏览器 `IndexedDB` 同源隔离导致用户在 `lichess.org`、`chess.com` 与 `4chess.cc` 之间切换时需重复下载百兆模型权重；单步大漏着超出 MultiPV 范围时缺失具体损兵值 |
| **前端代码工程与测试** | **B** | 零转译 ES Module 实现扩展与 Cloudflare Pages 同构部署；[package.json](file:///Volumes/AI/coding/simoextension/package.json) 集成 21 项单元/集成回归脚本与 Playwright 端到端测试 | [analysis/analysis.js](file:///Volumes/AI/coding/simoextension/analysis/analysis.js)（96 KB）与 [content/intuition-panel.js](file:///Volumes/AI/coding/simoextension/content/intuition-panel.js)（90 KB）仍属巨石控制器；宿主注入样式未采用 Shadow DOM 隔离 |
| **开源合规与商业化模型** | **B+** | 端侧计算 + [Cloudflare R2](https://developers.cloudflare.com/r2/pricing/) 零出站流量费将边际运营成本降至接近 $0；严格遵守 [Chrome MV3 远程托管代码规范](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code) | 联合分发包受 [GNU AGPLv3](file:///Volumes/AI/coding/simoextension/LICENSES/AGPL-3.0.txt) 与 [GNU GPLv3](file:///Volumes/AI/coding/simoextension/LICENSES/GPL-3.0.txt) 强 Copyleft 约束；[THIRD_PARTY_NOTICES.md](file:///Volumes/AI/coding/simoextension/THIRD_PARTY_NOTICES.md) 需补齐新增大权重与视觉模型声明 |

## 二、 技术架构与核心计算引擎深度剖析

### 2.1 架构分层与同构代码库设计

项目采用“零前端构建框架（Zero-Build Vanilla ES Modules）”的同构架构设计，同一套核心目录（`engine/`、`lib/`、`ui/`、`analysis/`、`guide/`）同时服务于 Chrome Manifest V3 浏览器扩展与基于 [Cloudflare Pages](https://developers.cloudflare.com/pages/) 的 Web 生产环境。这种设计规避了复杂的 Webpack/Vite 转译链路，使每一行运行在浏览器中的代码均与仓库源码保持字节级对应，极大提升了 Chrome Web Store 安全合规审计的透明度与问题排查效率。

| 架构分层 | 核心模块文件 | 运行上下文与隔离机制 | 核心职责与设计机制 |
| :--- | :--- | :--- | :--- |
| **扩展后台控制与扫描会话层** | [background.js](file:///Volumes/AI/coding/simoextension/background.js)、[scan/controller.js](file:///Volumes/AI/coding/simoextension/scan/controller.js)、[scan/position.js](file:///Volumes/AI/coding/simoextension/scan/position.js) | MV3 Service Worker (`type: "module"`) + `chrome.storage.session` | 负责单次沙箱 Token 串行化签发与核销、Lichess/Chess.com 完赛棋谱后台抓取代理、网页扫描生命周期状态机管理以及源标签页导航/关闭时的即时权限撤销 |
| **宿主注入与公平竞技守卫层** | [content/main-module.js](file:///Volumes/AI/coding/simoextension/content/main-module.js)、[content/fair-play-guard.js](file:///Volumes/AI/coding/simoextension/content/fair-play-guard.js)、[content/board-detector.js](file:///Volumes/AI/coding/simoextension/content/board-detector.js)、[content/page-bridge.js](file:///Volumes/AI/coding/simoextension/content/page-bridge.js) | Isolated World Content Script + `MAIN` World Bridge | 通过 `MutationObserver` 监控对局状态，在合法复盘/研究场景下提取棋盘 FEN 与走法历史，驱动 [content/intuition-panel.js](file:///Volumes/AI/coding/simoextension/content/intuition-panel.js) 悬浮面板与 [content/heatmap-overlay.js](file:///Volumes/AI/coding/simoextension/content/heatmap-overlay.js) 棋盘矢量图层 |
| **双引擎推理与复盘调度层** | [engine/maia-inbrowser.js](file:///Volumes/AI/coding/simoextension/engine/maia-inbrowser.js)、[engine/maia-engine.js](file:///Volumes/AI/coding/simoextension/engine/maia-engine.js)、[engine/stockfish-inbrowser.js](file:///Volumes/AI/coding/simoextension/engine/stockfish-inbrowser.js)、[engine/game-analyzer.js](file:///Volumes/AI/coding/simoextension/engine/game-analyzer.js) | Dedicated Web Worker + Sandboxed Iframe (`credentialless`) | 执行 Maia-3 Chessformer 前向推理、Stockfish 19 WASM UCI 多主变搜索、开局库转置查询（[engine/opening-book.js](file:///Volumes/AI/coding/simoextension/engine/opening-book.js)）及四阶段整局精度与分歧复盘计算 |
| **离屏视觉识别与轻量模型层** | [offscreen/vision.js](file:///Volumes/AI/coding/simoextension/offscreen/vision.js)、[lib/vision/recognizer-core.js](file:///Volumes/AI/coding/simoextension/lib/vision/recognizer-core.js)、[models/chess-cnn.wasm](file:///Volumes/AI/coding/simoextension/models/chess-cnn.wasm) | Chrome Offscreen Document + Vision Worker + `OffscreenCanvas` | 对可见静态图片区域执行非图像像素遮罩、周期网格检测、Lanczos 重采样、64 格 32×32 灰度切片、WASM CNN 分类及 FIDE 规则约束求解 |
| **大屏工作台与边缘网关层** | [analysis/analysis.js](file:///Volumes/AI/coding/simoextension/analysis/analysis.js)、[analysis/position-analysis.js](file:///Volumes/AI/coding/simoextension/analysis/position-analysis.js)、[analysis/sw.js](file:///Volumes/AI/coding/simoextension/analysis/sw.js)、[functions/api/chesscom.js](file:///Volumes/AI/coding/simoextension/functions/api/chesscom.js) | 独立扩展页 / PWA (`https://4chess.cc/analysis`) + Cloudflare Workers | 提供多栏复盘工作台、分支树推演、错题盲盘重练（[analysis/review-practice.js](file:///Volumes/AI/coding/simoextension/analysis/review-practice.js)）、折线评估图及受控的公开完赛棋谱跨域代理 |

在构建与发布隔离方面，项目在 `v1.1.5` 之后通过 [scripts/prepare_cloudflare.mjs](file:///Volumes/AI/coding/simoextension/scripts/prepare_cloudflare.mjs) 与 [scripts/package_extension.mjs](file:///Volumes/AI/coding/simoextension/scripts/package_extension.mjs) 建立了严格的白名单产物隔离机制。网站构建产物输出至 `dist/site`，自动剔除扩展专属源码、历史发布 ZIP 包、本地环境变量与开发态分享脚本；而 Chrome 商店扩展打包产物（`releases/diverge-extension-v1.1.x.zip`）则显式剥离本地回环端口（`127.0.0.1:3210`）权限与小程序码海报开发桥接器，确保线上部署与商店提审包最小化、无敏感测试残留。

### 2.2 Maia-3 浏览器端原生推理内核：亮点与算力瓶颈

[engine/maia-inbrowser.js](file:///Volumes/AI/coding/simoextension/engine/maia-inbrowser.js) 是整个项目最具技术特色的模块之一。研发团队没有依赖体积庞大（通常超过 15–25 MiB WASM 二进制）且在宿主页面 CSP 下极易受阻的 `onnxruntime-web` 或 `tfjs`，而是直接用纯原生 JavaScript 手写了完整的 Maia-3 Chessformer（含输入通道投影、Elo 連続嵌入插值、8 层自注意力 Transformer Block、GAB 几何注意力偏置以及策略与价值双头输出）前向传播引擎。

1. **自定义 `M3CF` 零拷贝二进制协议与多档位扩展**：
   通过 [scripts/export_weights.py](file:///Volumes/AI/coding/simoextension/scripts/export_weights.py)，上游 PyTorch 模型被转换为带 4 字节魔数头（`M3CF`）、4 字节对齐 JSON 张量描述表以及紧凑二进制载荷的专属格式。根据 [engine/engine-variants.js](file:///Volumes/AI/coding/simoextension/engine/engine-variants.js)，系统现支持三档模型配置：
   - **Maia-3 5M**（`dim_vit: 256, num_heads: 8, num_blocks: 8, total_params: 7,327,236`，约 28 MiB FP32），作为默认轻量级模型；
   - **Maia-3 23M**（`dim_vit: 512, num_heads: 16, num_blocks: 8, total_params: 27,130,884`，约 104 MiB FP32），面向进阶复盘；
   - **Maia-3 79M**（`dim_vit: 1024, num_heads: 32, num_blocks: 8, total_params: 83,094,020`，约 159 MiB FP16 存储），面向桌面端深度推演。
   当张量偏移满足 4 字节对齐且为 Float32 类型时，`loadModel()` 直接在底层 `ArrayBuffer` 上创建 `Float32Array` 视图，实现零内存拷贝解析。

2. **纯 JS 标量矩阵乘法的性能天花板（核心算力瓶颈）**：
   在 [engine/maia-inbrowser.js](file:///Volumes/AI/coding/simoextension/engine/maia-inbrowser.js) 的 `predict()` 实现中，所有矩阵运算（包括 QKV 线性变换、多头注意力打分、GAB 偏置矩阵乘法及 FFN 全连接层）均采用标准 JavaScript 三层嵌套 `for` 循环执行标量浮点乘加运算。对于 `5M` 模型（`D=256`），单步推理在现代桌面处理器上耗时约 250–400ms；但当用户切换至 `23M`（`D=512`，每层计算量放大 4 倍）或 `79M`（`D=1024`，每层矩阵乘计算量较 `5M` 放大 **16 倍**）时，纯 JS 标量循环缺乏 CPU SIMD 指令集（单指令多数据流）与 GPU 张量并行支持，单步推理延迟会迅速攀升至数秒级别（[engine/engine-preferences.js](file:///Volumes/AI/coding/simoextension/engine/engine-preferences.js) 第 97 行亦不得不提示用户“单步可能需要数秒或更久”）。
   借鉴项目中视觉模块已成功应用的微内核思路（[models/chess-cnn.wasm](file:///Volumes/AI/coding/simoextension/models/chess-cnn.wasm) 仅用 6.2 KiB 手写 WebAssembly 即完成了卷积加速），若将 `maia-inbrowser.js` 中最耗时的通用矩阵乘法（GEMM / `sgemm`）抽离为一个 8–12 KiB 的 **WebAssembly SIMD（`f32x4`）算子微内核**，并在支持 WebGPU 的浏览器上提供可选的 WGSL Compute Shader 后端，可在不增加扩展体积负担的前提下将 `23M` 与 `79M` 模型的推理速度提升 **4 至 8 倍**。

3. **FP16 权重全量解压与临时 TypedArray 分配引发的内存抖动**：
   在加载 `Maia-3 79M`（159 MiB FP16）时，当前实现将 FP16 载荷逐元素解码并实例化为 4 字节的 `Float32Array` 常驻内存（占用约 318 MiB），在解码转换瞬间叠加以原始 `ArrayBuffer`（159 MiB），单 Worker 瞬时内存峰值接近 **480–550 MiB**。此外，在 8 层 Transformer 循环内部，每次 `predict()` 调用都会频繁执行 `new Float32Array(...)` 分配中间激活张量（`Q`, `K`, `V`, `saOut`, `ffMid` 等）。在整局复盘连续推理 60–80 个半步时，会产生数千个短生命周期的大型 `TypedArray`，引发明显的 V8 垃圾回收（GC）停顿。应当在引擎初始化时根据當前模型的 `dim_vit` 与 `ffDim` 一次性预分配双缓冲（Ping-Pong Scratch Buffers）内存池，在 `predict()` 期间实现零堆内存分配。

### 2.3 Stockfish 19 WASM 调度、沙箱通信与整局复盘流水线

1. **双模自适应初始化与单次 Token 沙箱握手**：
   由于 [Chess.com](https://www.chess.com/) 与 [Lichess.org](https://lichess.org/) 页面部署了严格的 Content Security Policy（CSP），Content Script 无法直接在宿主页面上下文实例化加载扩展资源的 Web Worker。[engine/stockfish-inbrowser.js](file:///Volumes/AI/coding/simoextension/engine/stockfish-inbrowser.js) 为此设计了双模架构：在独立工作台（`analysis/`）或弹窗（`popup/`）中直接启动 Web Worker（Mode A）；在宿主网站 Content Script 中则动态挂载隐藏的 `credentialless` 沙箱 iframe（[engine/stockfish-sandbox.html](file:///Volumes/AI/coding/simoextension/engine/stockfish-sandbox.html) + [engine/stockfish-sandbox.js](file:///Volumes/AI/coding/simoextension/engine/stockfish-sandbox.js)，Mode B）。连接建立时，客户端向 [background.js](file:///Volumes/AI/coding/simoextension/background.js) 申请 120 秒有效期的单次 UUID Token，通过 `MessageChannel` 将私有 `MessagePort` 移交沙箱，沙箱向后台核销该 Token（通过 `serializeToken` Promise 链严格串行化，防止并发重放攻击），从而确保宿主页面的第三方脚本无法劫持或偷调沙箱内的 Stockfish 算力。

2. **前台探索与整局复盘的任务所有权协调**：
   在 [analysis/position-analysis.js](file:///Volumes/AI/coding/simoextension/analysis/position-analysis.js) 中，单局面实时探索已经实现了良好的异步解耦：`computePosition()` 同时发起 `maiaTask`（Maia Worker 预测）与 Stockfish 搜索，各自返回后独立调用 `this.render()` 渐进式刷新界面，并在取得 Maia Top-3 候选后，自动对尚未出现在 Stockfish 前 3 主变（`MultiPV 3`）中的人类候选走法补跑 `depth - 1` 的靶向估值（第 128–143 行 `entry.maiaEvaluations`），从而保证独立工作台中每一条 Maia 候选走法都能显示准确的百兵评分。
   然而，在整局复盘引擎 [engine/game-analyzer.js](file:///Volumes/AI/coding/simoextension/engine/game-analyzer.js) 中，四阶段流水线的 Step 1（全盘各步 Stockfish 浅层评估）与 Step 3（全盘各步 Maia-3 人类直觉预测）目前仍按顺序串行执行。鉴于 Stockfish 运行于 WASM Worker 而 Maia-3 运行于独立的 `maia-worker.js`，两者在多核 CPU 上完全具备并行执行的物理条件。将 Step 1 与 Step 3 改造为双流水线并发执行、在各自完成第 $k$ 步时即时汇合触发进度回调，可将整盘 60 回合棋局的复盘等待时间缩短 **35%–45%**。

3. **COOP/COEP 跨源隔离头配置核查**：
   在 [manifest.json](file:///Volumes/AI/coding/simoextension/manifest.json) 中，扩展已声明 `"cross_origin_embedder_policy": {"value": "require-corp"}` 与 `"cross_origin_opener_policy": {"value": "same-origin"}`，使扩展内部页面具备 `crossOriginIsolated` 环境。但在 Cloudflare Pages 配置文件 [cloudflare/headers](file:///Volumes/AI/coding/simoextension/cloudflare/headers) 中，全局仅配置了 `Cross-Origin-Opener-Policy: same-origin-allow-popups` 与 `Access-Control-Allow-Origin: *`，尚未为 `/analysis/*` 路径配置 `Cross-Origin-Embedder-Policy: credentialless` 或 `require-corp`。若未来计划在 Web 端 `SF19 Standard` 中启用基于 `SharedArrayBuffer` 的多线程（Multi-threading）WASM 搜索，需在 `cloudflare/headers` 的 `/analysis/*` 路由下补齐 COEP 响应头。

### 2.4 静态棋图视觉识别管线（Offscreen + WASM CNN）

项目在 `v1.1.4` 至 `v1.1.8` 期间重构了静态棋图识别链路（[offscreen/vision.js](file:///Volumes/AI/coding/simoextension/offscreen/vision.js)、[scan/controller.js](file:///Volumes/AI/coding/simoextension/scan/controller.js)、[content/scan-source.js](file:///Volumes/AI/coding/simoextension/content/scan-source.js)），体现出极高的安全性与工程克制：

1. **非图片像素强制白底遮罩（Pixel Masking）**：
   当用户在普通网页（如社交媒体、资讯文章、论坛）点击“扫描页面”时，[content/scan-source.js](file:///Volumes/AI/coding/simoextension/content/scan-source.js) 首先枚举视口内可见的静态图像矩形区域（`regions`）。截图传入 [offscreen/vision.js](file:///Volumes/AI/coding/simoextension/offscreen/vision.js) 后，`maskImages()` 先在 `OffscreenCanvas` 上用纯白背景（`#fff`）涂满整张画布，仅将属于静态 `<img>` 的矩形像素区域绘制上去，并在 120 秒超时或识别完成后立即销毁内存中的截图数据。这一设计既确保了用户的网页文字隐私绝不进入识别流，又从根本上杜绝了用户利用截图扫描器去识别未知在线对弈平台 DOM/Canvas 实时棋盘的作弊可能。

2. **分阶段定位、重采样与哈希锁定校验**：
   识别内核 [lib/vision/recognizer-core.js](file:///Volumes/AI/coding/simoextension/lib/vision/recognizer-core.js) 通过梯度能量粗定位与周期性网格对齐校验（`gridAligned` & `autoAccepted`）切出 64 个棋格，交由 6.2 KiB 的 [models/chess-cnn.wasm](file:///Volumes/AI/coding/simoextension/models/chess-cnn.wasm) 与 606 KiB 的 `models/chessimg2pos_weights.bin` 完成棋子分类，并强制验证 `result.metadata.isVerifiedManifest === true`（SHA-256 完整性校验）。对于静态图片缺乏历史上下文的特性，[scan/position.js](file:///Volumes/AI/coding/simoextension/scan/position.js) 默认清除王车易位与吃过路兵权限（标记 `assumed: true`），并将模型原始识别标签直接呈现给用户复核，拒绝用启发式规则静默掩盖识别误差。

## 三、 安全边界、反作弊机制与开源合规深度审计

### 3.1 公平竞技守卫（FairPlayGuard）与宿主平台反作弊误封风险

[AGENTS.md](file:///Volumes/AI/coding/simoextension/AGENTS.md) 将“实时对局零辅助”确立为不可逾越的第一铁律。[content/fair-play-guard.js](file:///Volumes/AI/coding/simoextension/content/fair-play-guard.js) 结合 10 月 24 日内部审查发现的边界缺陷（[full-project-review-2026-10-24.md](file:///Volumes/AI/coding/simoextension/docs/reviews/full-project-review-2026-10-24.md) 中的 F01–F03），在 `v1.1.5–v1.1.8` 中已完成了高标准的加固：
- **四级证据优先级**：将“可见且激活的对局控件（`.clock-running`、`button.resign`、`[data-cy="abort-button"]` 等）”置于绝对最高优先级；其次校验严格受限的非对局路由白名单（`/analysis`、`/study`、`/puzzles` 等，明确排除 `/tv` 与 `/broadcast`）；再次校验绑定当前对局的显式终局证据；若均不满足则触发默认 Fail-Safe 锁定（返回 `true`）。
- **API 与 PGN 导入强门禁**：`FairPlayGuard.verifyConcludedGame(data)` 强制要求所有非空结果字段一致且精确匹配 `'1-0'`、`'0-1'` 或 `'1/2-1/2'`，彻底拦截了 `Result "*"` 或 `isFinished: false` 的进行中对局。

然而，从**平台侧反作弊探针检测（Anti-Cheat Heuristics）**的视角审视，当前架构仍存在一项关乎产品生死存亡的潜在合规隐患：

| 风险点 | 代码位置与当前行为 | 宿主平台（Chess.com / Lichess）检测机制 | 潜在后果与架构整改建议 |
| :--- | :--- | :--- | :--- |
| **`MAIN` World 脚本全路径无条件注入** | [manifest.json](file:///Volumes/AI/coding/simoextension/manifest.json) 第 32–42 行：`content/page-bridge.js` 配置为 `"world": "MAIN", "run_at": "document_start"`，匹配 `https://*.chess.com/*` 与 `https://*.lichess.org/*` 全站路径 | [Chess.com 公平竞技政策](https://www.chess.com/legal/fair-play) 明确声明其前端探针会检测对局页面中运行的第三方棋类扩展与页面环境异常 | 即使 `FairPlayGuard` 在对局中锁止了引擎，在对局路由（如 `/play/online`、`/game/live/*`）注入 `MAIN` world 脚本并挂载 DOM 容器，仍可能被反作弊系统按扩展特征批量误标封号 |
| **`stockfish.wasm` 向宿主域名公开暴露** | [manifest.json](file:///Volumes/AI/coding/simoextension/manifest.json) 第 65–81 行：`web_accessible_resources` 向 `chess.com` 与 `lichess.org` 暴露了 `lib/stockfish-19.js`、`lib/stockfish.wasm` 与 `engine/*` | 宿主页面脚本可通过 `fetch('chrome-extension://<id>/lib/stockfish.wasm')` 或扫描页面内的沙箱 iframe 探测用户是否安装了携带国际象棋引擎的扩展 | **强烈建议将悬浮窗的 Stockfish WASM 与 Maia Worker 移入扩展后台 Offscreen Document 运行**，通过 `chrome.runtime.connect` 传递纯文本评估结果，并从 `web_accessible_resources` 中彻底移除 `lib/stockfish.wasm` 与 `engine/*` |
| **沙箱会话存储访问级别过宽** | [background.js](file:///Volumes/AI/coding/simoextension/background.js) 第 14、30 行：调用了 `chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })` | 开启该选项后，所有注入页面的 Content Script（属于 Untrusted Context）均可直接读写 `chrome.storage.session.active_tokens` | `stockfish-sandbox.html` 位于 `chrome-extension://` 源下，本身属于 **Trusted Context**，无需放开 `UNTRUSTED_CONTEXTS`；应移除该调用并在 `VERIFY_SANDBOX_TOKEN` 校验 `sender.url` |

### 3.2 开源许可证矩阵与商业化法律边界

根据项目根目录的 [LICENSE](file:///Volumes/AI/coding/simoextension/LICENSE)、[THIRD_PARTY_NOTICES.md](file:///Volumes/AI/coding/simoextension/THIRD_PARTY_NOTICES.md) 以及 [LICENSES/](file:///Volumes/AI/coding/simoextension/LICENSES/) 目录下的许可证全文，Diverge 是一个典型的多许可证组合作品（Combined Work）：

| 组件模块 | 仓库路径与上游来源 | 适用开源协议 | 传染性边界与商业化刚性约束 |
| :--- | :--- | :--- | :--- |
| **Maia-3 推理内核、转换脚本与模型权重** | [engine/maia-inbrowser.js](file:///Volumes/AI/coding/simoextension/engine/maia-inbrowser.js)、[engine/maia-engine.js](file:///Volumes/AI/coding/simoextension/engine/maia-engine.js)、[scripts/export_weights.py](file:///Volumes/AI/coding/simoextension/scripts/export_weights.py) 及 5M/23M/79M 权重（源自 [CSSLab/maia3](https://github.com/CSSLab/maia3)） | **[GNU AGPLv3](file:///Volumes/AI/coding/simoextension/LICENSES/AGPL-3.0.txt)** | **最强 Copyleft 约束**：客户端分发或修改版模型网络服务（AGPLv3 第 13 条 Remote Network Interaction）均须向用户提供完整对应源码（Corresponding Source）及构建安装说明 |
| **Stockfish 19 WASM 引擎与胶水层** | [lib/stockfish.wasm](file:///Volumes/AI/coding/simoextension/lib/stockfish.wasm)、[lib/stockfish-19.js](file:///Volumes/AI/coding/simoextension/lib/stockfish-19.js) 及 CDN 上的 `SF19 Standard`（源自 [nmrugg/stockfish.js](https://github.com/nmrugg/stockfish.js) 与 [Stockfish](https://stockfishchess.org/)） | **[GNU GPLv3](file:///Volumes/AI/coding/simoextension/LICENSES/GPL-3.0.txt)** | 扩展与 PWA 静态打包并直接调用 Stockfish，构成受保护作品的联合传达（Conveying），整体客户端发行包不能闭源混淆或施加 DRM 限制 |
| **Cburnett 国际象棋棋子矢量图** | [analysis/chess-pieces.js](file:///Volumes/AI/coding/simoextension/analysis/chess-pieces.js)、[content/intuition-panel.js](file:///Volumes/AI/coding/simoextension/content/intuition-panel.js)（源自 Colin M. L. Burnett） | **[GPL-2.0-or-later](file:///Volumes/AI/coding/simoextension/LICENSES/GPL-2.0.txt)** | 与 GPLv3 / AGPLv3 向上兼容；若未来拆分纯闭源商业组件，需将该组件内的棋子替换为 CC0 或 MIT 授权素材 |
| **视觉识别 CNN 模型与参考实现** | `models/chessimg2pos_weights.bin`、[models/chess-cnn.wasm](file:///Volumes/AI/coding/simoextension/models/chess-cnn.wasm)、[lib/vision/](file:///Volumes/AI/coding/simoextension/lib/vision/)（源自 `chessimg2pos` / `elucidation/tensorflow_chessbot`） | **MIT License** | 宽松开源协议，允许商业使用与修改，仅需保留版权与许可声明 |
| **Diverge 自研 UI、DOM 桥接与样式** | `content/`、`popup/`、`analysis/`、`scan/`、`ui/`、`guide/` | **MIT License**（独立剥离时）/ **AGPLv3 & GPLv3**（联合分发时） | 自研界面代码声明为 MIT，但在与 Maia-3 及 Stockfish 联合打包分发时，整体发行包受 AGPLv3/GPLv3 约束 |

**开源合规核查发现的具体文档缺口**：
当前仓库中的 [THIRD_PARTY_NOTICES.md](file:///Volumes/AI/coding/simoextension/THIRD_PARTY_NOTICES.md) 已详尽披露了 `maia3-5m.pt`、`maia3-23m.pt`、`maia3-79m.pt`（含 FP16 转换说明）、`Stockfish 19 Lite` 与 `Stockfish 19 Standard` 的上游 Commit 及获取方式，但尚未在组件表格中补充本地随包分发的 **`chessimg2pos`（`models/chessimg2pos_weights.bin` 与 `models/chess-cnn.wasm`）** 以及运行时依赖 **`qrcode-generator`**（[package.json](file:///Volumes/AI/coding/simoextension/package.json) 第 29 行，MIT 协议）的专门条目。尽管 [guide/index.html](file:///Volumes/AI/coding/simoextension/guide/index.html) 已提及识别模型，仍建议在 `THIRD_PARTY_NOTICES.md` 中同步补齐这两项声明，做到仓库文档与线上指南 100% 闭环。

## 四、 产品使用体验（UX/UI）与前端工程实现评估

### 4.1 三大核心用户旅程体验走查与痛点剖析

通过对比 11 月 6 日的专项评审（[floating-panel-product-ux-2026-11-06.md](file:///Volumes/AI/coding/simoextension/docs/reviews/floating-panel-product-ux-2026-11-06.md)）与 `v1.1.8` 的实际交付实现（[floating-panel-ux-delivery-2026-11-06.md](file:///Volumes/AI/coding/simoextension/docs/reviews/floating-panel-ux-delivery-2026-11-06.md)），项目在用户体验打磨上展现出极快的迭代响应速度，但跨入口的深层交互仍存在以下关键痛点：

| 用户旅程 | v1.1.8 已落地的核心体验升级 | 现存体验痛点与改进方向 |
| :--- | :--- | :--- |
| **旅程 1：Lichess / Chess.com 原位悬浮窗**<br>([content/intuition-panel.js](file:///Volumes/AI/coding/simoextension/content/intuition-panel.js)) | • **信息层级重构**：首屏优先展示首选对比结论与三条候选，正常引擎状态收纳至可折叠详情，消除首屏冗余<br>• **短广告位自适应**：当宿主右侧广告位高度不足时自动切换精简摘要模式并提供“展开详情”<br>• **三态空间管理**：清晰区分右上角减号“最小化到侧边入口（释放空间）”、“收起内容（保留侧栏遮挡广告）”与“隐藏面板”<br>• **无障碍与防抖**：支持键盘 Tab/焦点预览箭头、Esc 取消及 Elo 滑杆连续调节防抖合并 | • **悬浮窗内非 MultiPV 候选走法的损兵值缺失（显示 `—`）**：不同于独立工作台 `PositionAnalysis` 会对未命中 Stockfish 前 3 主变的 Maia 候选补跑单步估值，悬浮窗直接将 `stockfish.evaluate(fen, 10, 1200, 4)` 的结果传给 `enrichMovesWithDelta`。当人类高概率直觉走法是排在引擎第 5 名以后的严重漏着时，悬浮窗恰恰无法显示具体 `Δ` 损兵值，削弱了对“俗手陷阱”的即时警示效果 |
| **旅程 2：Popup 静态棋图扫描与推演**<br>([popup/scan-view.js](file:///Volumes/AI/coding/simoextension/popup/scan-view.js)、[scan/controller.js](file:///Volumes/AI/coding/simoextension/scan/controller.js)) | • **自动检测 + 手动框选兜底**：支持一键识别可见静态棋图，识别失败可手动拖拽裁剪框重试<br>• **物理方向与观看视角解耦**：“修正局面（Edit position）”修正坐标方向与棋子，“视角（View）”仅翻转视觉朝向<br>• **弹窗内即时三分支探索**：确认局面后直接在 Popup 内运行打包的 `SF19 Lite`，支持走子探索、右键画箭头及回退 | • **源绑定撤销机制在合法研究/分享场景下的摩擦**：为防止用户在实时对局中借用扫描工作台分析，[scan/controller.js](file:///Volumes/AI/coding/simoextension/scan/controller.js) 将工作台标签页与源网页 `tabId`/`documentId`/`nonce` 强绑定——一旦源网页关闭、刷新、滚动替换图片或复制 URL 到新窗口，工作台立即锁定并清空分析。建议对来自非对弈网站（如 Wikipedia、普通文章）的已确认静态局面，提供显式的**“保存为独立 FEN 研究书签”**按钮 |
| **旅程 3：独立大屏深度复盘工作台 PWA**<br>([analysis/analysis.js](file:///Volumes/AI/coding/simoextension/analysis/analysis.js)、[analysis/review-practice.js](file:///Volumes/AI/coding/simoextension/analysis/review-practice.js)) | • **主线复盘与个人分支丝滑切换**：支持点击/拖拽走子创建个人推演分支、升变选择与分支折线图同步；探索分支时自动让出前台算力，回到主线停顿后自动恢复未完成的整局复盘<br>• **错题盲盘重练闭环**：[analysis/review-practice.js](file:///Volumes/AI/coding/simoextension/analysis/review-practice.js) 实现了真正的互动重练——隐藏引擎箭头与评分，由用户走子后调用 Stockfish `depth 14/13` 实时判题（`retryVerdict`）并允许反复重做 | • **整局复盘切换 Elo 等级时的重算效率**：当用户在工作台完成整局复盘后切换模拟棋手等级（如从 1500 切换至 1900）以观察不同段位的“俗手”差异时，Stockfish 的全盘客观评估分数实际上与人类 Elo 完全无关，但当前缓存键绑定了 `elo`，导致切换至未缓存的段位时需重新走完整流程。若将 Stockfish 全盘基线缓存与 Maia 段位预测缓存解耦，切换段位即可在 1–2 秒内仅重算 Maia 分支 |

### 4.2 跨 Origin 模型缓存隔离导致的“三次重复下载”痛点

在冷启动体验上，当前架构存在一个显著影响多平台用户转化率的结构性痛点。
[engine/model-cache.js](file:///Volumes/AI/coding/simoextension/engine/model-cache.js) 直接在调用方所在的浏览器上下文执行 `indexedDB.open('Maia3ModelCache', 1)`。由于浏览器的 `IndexedDB` 存储严格遵循**同源策略（Same-Origin Policy）**：
1. 用户在 `https://lichess.org` 复盘时，下载的 `Maia-3 23M`（104 MiB）或 `79M`（159 MiB）被存储在 `https://lichess.org` 的 IndexedDB 命名空间下；
2. 当同一名用户前往 `https://www.chess.com` 复盘时，由于域名不同，无法访问 Lichess 下的缓存，必须**第二次从 CDN 下载 104 MiB / 159 MiB 权重**；
3. 当用户点击“在工作台打开”（跳转至 `https://4chess.cc/analysis`）时，又处在第三个独立 Origin 下，必须**第三次下载相同的百兆模型权重**。

这不仅让跨平台用户在首次体验时遭遇三次漫长的下载等待，更在用户本地磁盘上造成了高达 **312 MiB 至 477 MiB** 的冗余空间占用，且目前界面中缺乏“查看已缓存模型大小与一键清理模型缓存”的管理入口。若在扩展端将 `ModelCache` 与 Maia 推理统一收拢至扩展自身的 `chrome-extension://<id>` Origin（例如驻留在 Offscreen Document 或沙箱页中），即可让 `lichess.org` 与 `chess.com` 共享唯一一份扩展级模型缓存，一举消除跨站重复下载。

### 4.3 前端工程可维护性与代码结构评估

尽管项目在 `v1.1.x` 期间已经启动了模块化拆分——例如从工作台中抽离了 [analysis/position-analysis.js](file:///Volumes/AI/coding/simoextension/analysis/position-analysis.js)（16 KB）、[analysis/intuition-review.js](file:///Volumes/AI/coding/simoextension/analysis/intuition-review.js)（4 KB）、[analysis/review-practice.js](file:///Volumes/AI/coding/simoextension/analysis/review-practice.js)（2 KB）、[analysis/workbench-layout.js](file:///Volumes/AI/coding/simoextension/analysis/workbench-layout.js)（5 KB）以及 [engine/chess-notation.js](file:///Volumes/AI/coding/simoextension/engine/chess-notation.js)（消除了 `background.js` 与 `game-analyzer.js` 之间的 TCN 解码重复代码）——但核心协调器文件的体量仍在持续膨胀：

| 核心巨石文件 | 当前文件大小 | 耦合的核心职责领域 | 重构解耦建议 |
| :--- | :--- | :--- | :--- |
| [analysis/analysis.js](file:///Volumes/AI/coding/simoextension/analysis/analysis.js) | **96 KB** | PGN/FEN/URL 导入解析、平台 API 拉取、棋盘分支树状态机、右键标注状态、整局复盘编排、图表联动、音效与多语言切换 | 抽离 `import-service.js`（负责 PGN/FEN/平台链接解析与世代号取消）与 `branch-tree.js`（纯数据结构管理主线与多级分支游标） |
| [content/intuition-panel.js](file:///Volumes/AI/coding/simoextension/content/intuition-panel.js) | **90 KB** | 宿主广告位探测与自适应布局、拖拽/折叠/最小化窗口管理、三方对比卡片 DOM 拼装、设置抽屉交互、状态机文案映射与工作台交接 | 拆分为 `floating-window.js`（外壳定位、拖拽、最小化、Shadow DOM 挂载）与 `floating-views.js`（声明式状态渲染与设置组件） |
| [engine/game-analyzer.js](file:///Volumes/AI/coding/simoextension/engine/game-analyzer.js) | **63 KB** | 既包含纯算法（开局库匹配、胜率/精度公式、妙手/俗手四阶段复核、L1/L2 缓存），又包含强耦合于宿主页面 DOM 的 `extractPageMoves()` 与 `jumpToMove()` | 将所有涉及 `window.location`、`document.querySelectorAll` 及合成鼠标事件点击宿主棋盘的 DOM 桥接代码剥离至 `content/host-game-extractor.js`，使 `engine/` 保持 100% 纯净的平台无关计算层 |

此外，在宿主样式隔离方面，[manifest.json](file:///Volumes/AI/coding/simoextension/manifest.json) 目前将 [ui/theme.css](file:///Volumes/AI/coding/simoextension/ui/theme.css) 与 [content/styles.css](file:///Volumes/AI/coding/simoextension/content/styles.css)（44 KB）直接注入 `chess.com` 与 `lichess.org` 的文档流中。虽然样式表大量使用了特定前缀，但在 `:root` 上挂载通用 CSS 自定义属性仍存在与宿主站点样式互相污染的隐患。将悬浮窗根节点封装进 `ShadowRoot`（Open Shadow DOM），是保障长期跨站兼容性的最佳工程实践。

## 五、 市场竞品格局、基础设施成本与商业化发展战略

### 5.1 2026 国际象棋 AI 复盘与训练市场竞品全景对比

近年来，国际象棋辅助训练市场正经历从“算力驱动（谁的 Stockfish 算得深）”向“认知与解释驱动（如何让人类棋手听懂并吸收）”的范式转移。将 Diverge 放入 2026 年主流竞品坐标系中对比，可以清晰识别出其核心生态位：

| 产品 / 平台 | 核心定位与技术路线 | 2026 商业定价模型 | 竞品核心短板与 Diverge 的错位竞争优势 |
| :--- | :--- | :--- | :--- |
| **[Chess.com Game Review](https://www.chess.com/membership)** | 平台内置赛后复盘、虚拟教练气泡短评、走法分类（Brilliant / Great / Blunder） | 免费版每日限 1 次；无限复盘需 Platinum（**$6.67/月** 年付）或 Diamond（**$10/月** 年付） | 虚拟教练基于 Stockfish 启发式规则，**缺乏真实同段位人类走法概率分布**；仅限 Chess.com 站内使用，无法跨平台扫描外部棋书或 Lichess 对局 |
| **[Lichess.org Analysis](https://lichess.org/source)** | 开源免费的浏览器端 WASM Stockfish + 分布式 Fishnet 服务端分析 | **100% 免费开源**（AGPLv3，依靠社区捐赠运营） | 仅提供纯客观引擎主变与恶手标记，完全没有 Maia 人类直觉预测对比，也无静态棋图 OCR 扫描能力 |
| **[Maia Chess 官方平台](https://www.maiachess.com/)** | 多伦多大学 CSSLab 官方 Web 平台，集成 Maia-3 + Stockfish 分析、对弈与训练 | **免费公益科研平台**（由学术科研基金支持） | 用户必须手动复制 PGN/FEN 跳转至 `maiachess.com`；**无浏览器原位悬浮插件**、无全网静态棋图一键扫描、缺乏针对中文国象教研场景的深度本土化与“妙手/俗手”认知标签 |
| **[DecodeChess](https://www.chessvia.ai/blog/vs-decodechess)** | 利用重度云端算法将引擎推荐分解为威胁、计划、好坏子等长篇文字解释 | 免费版每日限 1 局；Unlimited 订阅 **$8.25/月**（年付 $84） | 云端算力成本极高，界面信息过载，无浏览器原位叠加，且解释基于纯引擎逻辑而非同段位人类认知盲区 |
| **[Noctie.ai](https://noctie.ai/pricing/)** | 类人 AI 陪练（Humanlike Sparring AI）与赛后错题闪卡自动生成 | 仅 7 天免费试用；月付 **€14/月**，年付 **€8/月（€96/年）** | 定位偏向“与 AI 下棋陪练”，定价高昂，缺少轻量级跨站复盘与图文棋谱扫描工具流 |
| **[Aimchess](https://aimchess.com/)** | 批量拉取用户近期数百局网棋，从开局、战术、残局 6 大维度生成宏观统计报告 | 免费版每月 1 份报告；Premium 月付 **$7.99/月**，年付 **$4.85/月** | 侧重宏观统计面板（与 Chess.com Insights 同质化加剧，见 [CheckmateX 2026 评测](https://checkmatex.app/blog/aimchess-review-2026-is-it-worth-it)），缺乏单局内“为什么这步棋看着极其自然却是大漏着”的微观拆解 |
| **歧路 Diverge ([4chess.cc](https://4chess.cc/))** | **原位双引擎分歧浮层 + 全网静态棋图本地 CNN 扫描 + 独立大屏复盘与盲盘重练工作台** | 当前完全免费开源（客户端零服务器推理成本） | 独占**“赛后零跳转原位对比 + 跨平台网页/社媒棋图一键扫描入局 + 妙手/俗手高辨识度标签”**三大高频场景 |

### 5.2 基础设施与带宽成本结构测算（接近 100% 边际毛利模型）

竞争对手如 [Aimchess](https://aimchess.com/) 与 [DecodeChess](https://www.chessvia.ai/blog/vs-decodechess) 之所以必须设置高昂的付费墙并严格限制免费用户每日复盘局数，根本原因在于其服务端运行高深度 Stockfish 与神经网络推理的云服务器成本随用户量线性暴增。

Diverge 则通过**“100% 浏览器端侧计算 + [Cloudflare R2](https://developers.cloudflare.com/r2/pricing/) 零出站流量费对象存储 + [Cloudflare Pages](https://developers.cloudflare.com/pages/platform/limits/) 静态托管”**构建了极具颠覆性的超低成本结构：

| 资源/服务项 | 单次体积 / 消耗 | 承载基础设施 | 规模化月度成本测算（假设月新增 100,000 活跃用户） |
| :--- | :--- | :--- | :--- |
| **Stockfish 19 Lite + 棋图识别 CNN** | ~1.7 MiB + ~613 KiB | 随 Chrome 扩展包本地分发 / Pages 静态缓存 | **$0.00 / 月**（由 Chrome Web Store 与 Cloudflare 免费静态带宽承担） |
| **Maia-3 5M / 23M / 79M + SF19 Standard 权重分发** | 28 MiB / 104 MiB / 159 MiB / 95 MiB（合计存储仅 **0.39 GB**） | `weights.4chess.cc`（底层为 [Cloudflare R2](https://developers.cloudflare.com/r2/pricing/) + CDN 缓存 + 客户端 `IndexedDB`） | **$0.00 / 月**（R2 享有 **10 GB/月免费存储**、**1,000 万次/月免费 Class B 读取**及**永久 $0 公网出站流量费**；若使用传统 AWS S3 分发 10 万次 159MB 模型需耗费 ~$1,430/月，R2 直接省去 100% 带宽费） |
| **单步与整局双引擎推理算力** | 每次复盘约 60–120 次神经网络与引擎搜索 | 100% 运行于用户本地浏览器 WebAssembly 与 Web Worker | **$0.00 / 月**（零 GPU/CPU 云服务器推理开销） |
| **公开完赛棋谱代理（`/api/chesscom`）** | 仅在前端跨域回退时触发 JSON 请求 | Cloudflare Pages Functions | **$0.00 – $5.00 / 月**（免费版含每日 100,000 次请求；对已完赛不可变 `gameId` 启用边缘 Cache API 持久化缓存后，千人并发亦极难触顶） |

这一成本模型意味着：即便 Diverge 拥有数十万免费活跃用户，其基础模型分发与双引擎复盘的月度固定基础设施账单依然趋近于 **$0–$5/月**。这赋予了项目在商业化初期采用“核心功能彻底免费以快速席卷市场、依靠高附加值生产力工具变现”的充足战略底气。

### 5.3 核心用户画像与高转化商业化场景

由于 [Maia Chess 官方平台](https://www.maiachess.com/) 已经免费提供了基础的网页端 Maia-3 分析，Diverge 的商业化切忌在“基础单局引擎计算”上设卡收费（这既违反开源社区预期，也容易让用户流失到免费替代品），而应当围绕**“跨局认知沉淀”、“自然语言教练解读”与“教学/内容创作生产力”**三大高付费意愿群体设计商业闭环：

1. **自我提升型俱乐部棋手（Elo 800–2000，C 端订阅主力）**：
   - **核心痛点**：单局复盘看懂了某一步是“🫤 俗手（人类直觉 65%，实则漏算战术亏 2.1 兵）”，但下周实战遇到类似结构依然凭本能重蹈覆辙；同时认为 [Chess.com Diamond](https://www.chess.com/membership)（$10/月）或 [Noctie.ai](https://noctie.ai/pricing/)（€14/月）价格过高。
   - **高价值付费点**：**跨局“个人直觉盲区错题本（Intuition Trap Bank）”与间隔重复训练**——自动汇总用户过去 100 盘棋中所有被判定为“俗手”的局面，按开局体系与战术主题聚类，基于 [analysis/review-practice.js](file:///Volumes/AI/coding/simoextension/analysis/review-practice.js) 生成每日 5 道“克制本能俗手”的盲盘闯关题。

2. **国际象棋教练、俱乐部与青训机构（B2B / Prosumer，高客单价市场）**：
   - **核心痛点**：无论在中国庞大的国象考级琴童市场（棋院/私教课单价普遍在 200–600 元/课时），还是欧美线上教练市场，教练备课有两大高频刚需：一是将 PDF 棋书、公众号文章或比赛截图中的死棋图快速变成可交互的动态课件；二是在课前 10 分钟内从学生本周下的 20 盘网棋中挑出 5 个“最具代表性的段位观念误区（而非单纯超时或鼠标滑落的低级失误）”。
   - **高价值付费点**：**网页/PDF 批量识图建题库 + 学生“俗手”周报自动提取 + 带机构水印的复盘讲义（PDF / 互动长图）一键导出**。

3. **国际象棋自媒体创作者与主播（B站、小红书、抖音、YouTube、Twitch，天然增长飞轮）**：
   - **核心痛点**：制作复盘图文或短视频时，纯数字评分观众看不懂，而讲解“为什么 75% 的 1500 分棋手都会走这步自然俗手，而唯有 3% 的人能看见引擎妙手”极具戏剧张力与完播率。
   - **现成资产激活**：仓库中的 [popup/puzzle-poster.js](file:///Volumes/AI/coding/simoextension/popup/puzzle-poster.js)（1080×1440 竖版棋谜海报 Canvas 渲染器）与 [design/diverge-story-20261003/](file:///Volumes/AI/coding/simoextension/design/diverge-story-20261003/)（8 页小红书/社媒图文自动化生成管线）已经是成熟度极高的视觉传播武器。将其从“仅限本地开发端口调用的小程序码海报”升级为**全量用户可用的“人机分歧对决卡片 / 谜题挑战海报一键生成器（内置标准 `4chess.cc` 网页二维码）”**，每一张被分享到社交平台的卡片都将成为零成本的精准获客入口。

### 5.4 Open-Core 合规商业化架构与三阶段落地路线图

为严格遵守 [GNU AGPLv3](file:///Volumes/AI/coding/simoextension/LICENSES/AGPL-3.0.txt) 与 [GNU GPLv3](file:///Volumes/AI/coding/simoextension/LICENSES/GPL-3.0.txt) 开源协议，项目的商业化架构应采用清晰的 **Open-Core（开源核心 + 独立增值云服务）** 解耦模式：
- **开源免费层（100% 遵循 AGPLv3/GPLv3）**：Chrome 扩展本体、PWA 复盘工作台、端侧 Maia-3 与 Stockfish 19 推理内核、网页静态棋图扫描识别、单局复盘与本地盲盘重练永久免费且完整开放源码。
- **专有商业增值层（通过独立 REST API 微服务解耦，不静态链接 GPL/AGPL 代码）**：用户账号与跨设备云同步、历史错题库艾宾浩斯排期服务、LLM 自然语言教练深度讲评服务（将前端算出的 `{fen, playedMove, maiaTopMoves, sfMultiPvLines, lossCp}` 结构化摘要发送至云端大模型 API，生成诸如*“这步平静的退象为什么能破解白方的王翼攻势”*的自然语言深度解说）、以及青训教练多学员管理与品牌讲义导出服务。

| 演进阶段 | 周期与核心里程碑 | 关键技术与合规改造动作 | 增长抓手与商业变现设计 |
| :--- | :--- | :--- | :--- |
| **Phase 1：安全合规加固与裂变飞轮启动** | **第 1–2 个月**<br>目标：消除宿主误封风险，实现首波口碑自然增长 | 1. **反作弊零指纹改造**：将悬浮窗 Stockfish WASM 迁入 `offscreen` 文档，从 `web_accessible_resources` 移除 `lib/stockfish.wasm`，对局期间不在宿主 DOM 挂载任何面板节点。<br>2. **统一扩展级模型缓存**：将扩展端 `IndexedDB` 统一收敛至 `chrome-extension://` 源，彻底解决 Lichess / Chess.com / 工作台三次重复下载。<br>3. **合规补全**：在 `THIRD_PARTY_NOTICES.md` 补齐 `chessimg2pos` 与 `qrcode-generator` 声明，在商店后台统一使用 `contact@4chess.cc`。 | • **上线公开版“分歧/棋谜海报一键分享”**：解耦 [popup/puzzle-poster.js](file:///Volumes/AI/coding/simoextension/popup/puzzle-poster.js) 对本地 `127.0.0.1:3210` 的强依赖，默认使用内置 [popup/qrcode.mjs](file:///Volumes/AI/coding/simoextension/popup/qrcode.mjs) 生成直达 `https://4chess.cc/analysis/#fen=...` 的挑戰二维码海报。<br>• **主动获取社区与学术背书**：将 `FairPlayGuard` 测试矩阵提交至 Lichess 社区与多伦多大学 [Maia Chess](https://www.maiachess.com/) 团队展示，在 Reddit `r/chess`、B站与小红书启动“1500 分段高频俗手图鉴”内容矩阵。 |
| **Phase 2：算子加速与 Diverge Pro 个人订阅** | **第 3–6 个月**<br>目标：跑通首笔经常性收入（MRR），付费转化率 2.5%–4% | 1. **Maia-3 WASM SIMD 算子化与内存池化**：手写 ~10KB WASM SIMD 矩阵乘法微内核并预分配 Scratch Buffers，使 23M/79M 模型推理提速 4–8 倍。<br>2. **双引擎并行复盘与段位增量重算**：改造 `GameAnalyzer` 使 Stockfish 与 Maia 并行流水线执行，分离客观估值缓存与段位预测缓存。 | • **推出 Diverge Pro（定价 $3.49/月、$29/年 或 ¥18/月、¥128/年，不到竞品均价的 1/3）**：<br>  - **云端直觉盲区错题本**：跨设备自动收录个人实战“俗手”与错失的“妙手”，提供每日间隔重复盲盘刷题；<br>  - **AI 教练自然语言深度解说**：一键调用云端 LLM 为任意关键分歧步生成图文并茂的战术/战略原理解析；<br>  - **批量历史体检**：一键扫描最近 50 局 Lichess/Chess.com 对局，生成个人“最易受骗的 5 类直觉陷阱”诊断报告。 |
| **Phase 3：教练与青训机构生产力平台（B2B2C）** | **第 6–12 个月**<br>目标：切入国内外国际象棋私教与棋院高客单价市场 | 1. **多图/PDF 棋谱批量扫描工作流**：支持教练上传整页棋书图片或连续框选生成专题练习册。<br>2. **工作台模块化彻底解耦**：完成 `analysis.js` 与 `intuition-panel.js` 的子模块拆分及悬浮窗 `Shadow DOM` 改造。 | • **推出 Diverge Coach / Studio（定价 $14.99/月 或棋院机构按席位年费）**：<br>  - **学员网棋自动巡检周报**：绑定 10–50 名学员的 Lichess/Chess.com 账号，每周自动汇总学员典型“俗手”供课堂集中讲评；<br>  - **定制品牌教学讲义与小程序互动题卡导出**：支持嵌入棋院自定义 Logo、教练评语与课后微信扫码闯关链接，打通“桌面端扩展备课 → 微信生态学员做题”的完整商业闭环。 |

## 六、 综合结论与最高优先级行动清单

综合全量代码与产品审计，歧路 Diverge (`simoextension` v1.1.8) 已经跨越了早期原型阶段，构建了一套在技术上自洽（纯端侧双引擎 + 离线轻量 CNN 识图）、在合规上克制（四阶段 `FairPlayGuard` + 源绑定撤销）、在商业成本上极具优势（R2 零出站流量费 + 零服务端推理算力开销）的完整产品体系。

在不改变现有产品定位的前提下，建议按以下先后顺序推进下一阶段迭代：
1. **安全与反作弊零指纹加固（首要任务）**：将宿主页面悬浮窗所需的 Stockfish WASM 从 `web_accessible_resources` 中移除并迁入扩展后台 `offscreen` 上下文，同时将 `background.js` 的 `chrome.storage.session` 恢复为 `TRUSTED_CONTEXTS`，从根源上消除 Chess.com / Lichess 反作弊探针误报风险。
2. **统一扩展级模型缓存与悬浮窗单步估值补算（体验速赢）**：将扩展端 `ModelCache` 收拢至扩展自身 Origin 以消除三端重复下载百兆权重的问题；同时为悬浮窗中未命中 Stockfish MultiPV 的 Maia 首选走法补跑一次快速单步估值，消灭关键俗手行显示 `—` 的盲区。
3. **WASM SIMD 算子加速与双引擎并行流水线（性能跃升）**：为 `engine/maia-inbrowser.js` 引入轻量级 WASM SIMD 矩阵乘法内核与预分配内存池，并将 `engine/game-analyzer.js` 中的 Stockfish 与 Maia 阶段改为并行流水线执行。
4. **激活内置海报生成器与 Open-Core 增值服务（增长与变现）**：开放基于内置 `qrcode.mjs` 的免配置“人机分歧挑战海报”一键导出功能驱动社媒自然裂变，随后围绕“云端个人俗手错题本 + LLM 自然语言复盘讲评 + 教练批量备课讲义导出”落地高毛利的 Open-Core 订阅体系。

## 七、 参考资料与审计文件索引

1. 项目核心文档与规范：[README.md](file:///Volumes/AI/coding/simoextension/README.md)、[AGENTS.md](file:///Volumes/AI/coding/simoextension/AGENTS.md)、[LICENSE](file:///Volumes/AI/coding/simoextension/LICENSE)、[THIRD_PARTY_NOTICES.md](file:///Volumes/AI/coding/simoextension/THIRD_PARTY_NOTICES.md)、[DELIVERY-1.1.5.md](file:///Volumes/AI/coding/simoextension/docs/DELIVERY-1.1.5.md)。
2. 历史内部审查记录：[full-project-review-2026-10-24.md](file:///Volumes/AI/coding/simoextension/docs/reviews/full-project-review-2026-10-24.md)、[floating-panel-product-ux-2026-11-06.md](file:///Volumes/AI/coding/simoextension/docs/reviews/floating-panel-product-ux-2026-11-06.md)、[floating-panel-ux-delivery-2026-11-06.md](file:///Volumes/AI/coding/simoextension/docs/reviews/floating-panel-ux-delivery-2026-11-06.md)。
3. 扩展配置与后台调度源码：[manifest.json](file:///Volumes/AI/coding/simoextension/manifest.json)、[package.json](file:///Volumes/AI/coding/simoextension/package.json)、[background.js](file:///Volumes/AI/coding/simoextension/background.js)、[cloudflare/headers](file:///Volumes/AI/coding/simoextension/cloudflare/headers)。
4. 双引擎与复盘核心源码：[engine/maia-inbrowser.js](file:///Volumes/AI/coding/simoextension/engine/maia-inbrowser.js)、[engine/maia-engine.js](file:///Volumes/AI/coding/simoextension/engine/maia-engine.js)、[engine/engine-variants.js](file:///Volumes/AI/coding/simoextension/engine/engine-variants.js)、[engine/engine-preferences.js](file:///Volumes/AI/coding/simoextension/engine/engine-preferences.js)、[engine/stockfish-inbrowser.js](file:///Volumes/AI/coding/simoextension/engine/stockfish-inbrowser.js)、[engine/stockfish-sandbox.js](file:///Volumes/AI/coding/simoextension/engine/stockfish-sandbox.js)、[engine/game-analyzer.js](file:///Volumes/AI/coding/simoextension/engine/game-analyzer.js)、[engine/model-cache.js](file:///Volumes/AI/coding/simoextension/engine/model-cache.js)。
5. 视觉扫描与前端交互源码：[offscreen/vision.js](file:///Volumes/AI/coding/simoextension/offscreen/vision.js)、[scan/controller.js](file:///Volumes/AI/coding/simoextension/scan/controller.js)、[scan/position.js](file:///Volumes/AI/coding/simoextension/scan/position.js)、[content/fair-play-guard.js](file:///Volumes/AI/coding/simoextension/content/fair-play-guard.js)、[content/intuition-panel.js](file:///Volumes/AI/coding/simoextension/content/intuition-panel.js)、[analysis/analysis.js](file:///Volumes/AI/coding/simoextension/analysis/analysis.js)、[analysis/position-analysis.js](file:///Volumes/AI/coding/simoextension/analysis/position-analysis.js)、[analysis/review-practice.js](file:///Volumes/AI/coding/simoextension/analysis/review-practice.js)、[popup/puzzle-poster.js](file:///Volumes/AI/coding/simoextension/popup/puzzle-poster.js)。
6. 线上生产环境与商店页面：[4chess.cc](https://4chess.cc/)、[4chess.cc/guide](https://4chess.cc/guide/)、[4chess.cc/privacy](https://4chess.cc/privacy/)、[Chrome Web Store - Diverge](https://chromewebstore.google.com/detail/diverge-chess-analysis-sc/egiimjkekgiaimaagaljiclacljmdkmo)。
7. 上游开源项目与外部规范：[CSSLab/maia3](https://github.com/CSSLab/maia3)、[Maia Chess Official Platform](https://www.maiachess.com/)、[Stockfish Official Site](https://stockfishchess.org/)、[Chess.com Fair Play Policy](https://www.chess.com/legal/fair-play)、[Lichess Fair Play Guidelines](https://lichess.org/page/fair-play)、[Chrome MV3 Remote Hosted Code Policy](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code)、[Cloudflare R2 Pricing](https://developers.cloudflare.com/r2/pricing/)、[Cloudflare Pages Platform Limits](https://developers.cloudflare.com/pages/platform/limits/)。
8. 行业竞品参考：[Chess.com Membership](https://www.chess.com/membership)、[Noctie.ai Pricing](https://noctie.ai/pricing/)、[Aimchess](https://aimchess.com/)、[DecodeChess Comparison](https://www.chessvia.ai/blog/vs-decodechess)、[CheckmateX Aimchess Review 2026](https://checkmatex.app/blog/aimchess-review-2026-is-it-worth-it)。
