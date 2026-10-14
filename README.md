# 歧路 Diverge · 人类直觉与双引擎研判 (Chrome 扩展 & 独立复盘工作台)

基于 **纯前端浏览器端推理**（JavaScript Float32 神经网络引擎 + **Stockfish 19 WebAssembly**），将 **Maia 3 (Chessformer)** 神经网络与顶级开源国际象棋引擎无缝整合，提供 Chrome 扩展与独立 PWA 复盘工作台双形态支持。

在 **Lichess** 与 **Chess.com** 分析面板及 **4chess.cc** 独立复盘大屏中，实时三方对比：“**实战着法**” vs “**人类直觉候选 (Maia 3)**” vs “**客观最优解 (Stockfish 19)**”。

> ⚡ **纯前端独立架构特性**：
> - **100% 浏览器原生执行**：零本地 Python 依赖，零后台推理服务器，零终端命令行。
> - **可选模型**：Maia-3 5M / 23M / 79M（79M 采用 FP16 存储）；插件内运行 SF19 Lite，网页版另可选 SF19 标准版。
> - **按需分发与持久缓存**：遵循轻量代码包与 Cloudflare 单文件 25MB 限制，大模型二进制文件不入 Git 仓库，由专用 CDN 首次按需流式拉取并自动持久化于浏览器客户端 `IndexedDB`，后续使用秒开且支持断网离线复用。
> - **本地推理**：棋盘与走法在浏览器中计算；模型从 CDN 下载，导入平台网址会向对应平台请求棋谱。
> - **双形态部署**：兼具浏览器扩展插件与具备 Service Worker 离线能力的独立 PWA 网页。

---

## ⚖️ 公平竞技声明与客户端防误用守卫 (Fair Play Guard)

> **铁律原则 (The Absolute Iron Law):**
> **无论在 Chess.com 还是 Lichess，在正在进行的实时对局中，本插件严禁提供任何引擎计算、走法建议、候选箭头或热力图服务。严禁任何形式的对局辅助。**
> 
> *Under NO circumstances does this extension provide engine analysis, candidate moves, intuition arrows, or attention heatmaps during an active chess game.*

### 合法受限运行场景 (Permitted Environments Only)
本插件仅在以下合法场景下进行棋局研判与展示：
1. **分析台 (Analysis Board)**：`/analysis`、`/study`、`/editor`、`/practice`
2. **残局与战术题 (Puzzles & Lessons)**：`/puzzles`、`/lessons`、`/classroom`
3. **已完赛对局复盘 (Post-Game Review & Archives)**：已产生明确终局胜负裁定（如 `1-0`, `0-1`, `1/2-1/2`）或已弹出结算控件的对局。

### 防误用客户端守卫边界说明
- 扩展内置 `FairPlayGuard` 状态机，在检测到活跃时钟（`.clock-running`）或投降/认输/和棋/放弃按钮时，立即终止引擎搜索并彻底抹除所有视觉箭头与热力图。
- 对局结束后（结算弹窗弹出、记谱表出现终局符、或出现复盘按钮），守卫自动解除锁定，恢复复盘分析。
- **边界说明**：本守卫为**客户端防误用保护机制**，旨在防止正常用户在对局中误触或误用分析功能；基于浏览器 DOM 结构的判断机制无法防御对扩展源码的恶意篡改或第三方二次分发修改。

---

## 🌟 核心特性

1. **🧠 Maia 3 Chessformer 神经网络推理 (ICLR 2026)**
   - **纯前端原生推理**: Float32 矩阵计算内核，高精度执行 Chessformer 8 层 Transformer + GAB 几何注意力偏置。
   - **历史感知与 FEN 模式**: 支持基于实战半回合走法历史的输入通道编码，无历史时自动按规范回退。
   - **Elo 等级分动态调节**: 支持 `1100 (初阶)`、`1500 (中阶)`、`1900 (进阶)`、`2200 (大师)` 连续动态调节。

2. **🐟 Stockfish 19 WebAssembly 引擎**
   - **多线分析 (MultiPV 3)**: 后台沙箱中即时给出客观局面估值与最佳着法，精准度量人类直觉候选的百兵损耗 ($\Delta$ centipawn loss)。
   - **隔离沙箱与鉴权边界**: 通过 `engine/stockfish-sandbox.html` 规避宿主 CSP，通过私有通道与单次 Token 防范宿主脚本干扰。

3. **🏹 三方对比与直觉热力图 (Three-Way Comparison & Heatmap)**
   - 🟡 **金色实线箭头 (Maia 3)**: 投射对应 Elo 分段最符合人类直觉的第一候选走法及概率（如 `e4 (64.3%)`）。
   - 🟢 **翡翠绿虚线箭头 (Stockfish)**: 标出顶级引擎的客观最优解与局面评分（如 `d4 (+0.35)`）。
   - 🎯 **共识合体**: 当人类直觉与 Stockfish 达成高度一致时呈现共识合体。
   - 🔥 **目标落点概率热力图**: 汇聚所有合法候选着法目标方格的人类行棋概率聚合（Destination Probability Aggregation）。
   - 💡 **核心研判标签**:
     - **妙手**: 引擎最优且超越人类直觉的高阶胜着（客观最优且人类直觉概率低）。
     - **俗手**: 人类常见本能直觉走法，但客观存在明显漏着或重大损耗。

4. **🖥️ 独立大屏深度复盘工作台 (Analysis Studio & PWA)**
   - 一键提取整盘对局 PGN 并在独立标签页打开大屏复盘工作台 (`analysis/index.html` 或 `https://4chess.cc`)。
   - 支持 PWA 离线安装，具备 Service Worker 离线缓存、网络优先策略与局势走向评测折线图 (`eval-chart.js`)。

---

## 📁 目录结构

```
diverge-extension/
├── manifest.json              # Chrome Manifest V3 扩展配置 (收敛域名与资源权限)
├── background.js              # 后台 Service Worker 线程 (标签页调度与 PGN 请求代理)
├── analysis/                  # 独立大屏深度复盘工作台 (支持 PWA 离线模式)
│   ├── index.html             # 复盘工作台 HTML 界面
│   ├── analysis.js            # 复盘工作台核心逻辑与三方对比控制器
│   ├── analysis.css           # 复盘工作台样式表
│   ├── board-ui.js            # 矢量棋盘渲染与箭头绘制引擎
│   └── eval-chart.js          # 局面评估走向折线图
├── content/                   # Content Scripts (注入到宿主平台)
│   ├── content.js             # Content Script 模块入口
│   ├── main-module.js         # 前端主控制器 (调度中心、延迟加载与守卫联动)
│   ├── fair-play-guard.js     # 公平竞技与反作弊状态机守卫
│   ├── board-detector.js      # Lichess / Chess.com 棋盘状态与 FEN 识别器
│   ├── heatmap-overlay.js     # SVG 双轨箭头与直觉热力图层
│   └── intuition-panel.js     # 悬浮预测面板 UI 组件
├── engine/                    # 双引擎计算内核
│   ├── chess-core.js          # 国际象棋规则、走法生成与合法性严格校验引擎
│   ├── game-analyzer.js       # 全局复盘分析器、损耗排行与缓存隔离
│   ├── maia-engine.js         # 统一双引擎协调调度器 (带历史感知与缓存隔离)
│   ├── maia-inbrowser.js      # 浏览器端纯原生 Maia-3 Float32 推理内核
│   ├── model-cache.js         # IndexedDB 高速模型持久化存储与清理
│   ├── stockfish-inbrowser.js # 浏览器端 Stockfish WASM 调度器
│   ├── stockfish-sandbox.html # 隔离沙箱 iframe 载体
│   └── stockfish-sandbox.js   # 沙箱内 Stockfish 状态机与 Token 鉴权控制器
├── lib/
│   ├── stockfish-19.js        # Stockfish 19 Emscripten 胶水脚本 (GPLv3)
│   └── stockfish.wasm         # Stockfish 19 WebAssembly 二进制文件 (GPLv3)
├── popup/                     # 插件工具栏面板与配置
├── scripts/                   # 自动化测试、基准对照与权重转换脚本
│   ├── test_fair_play.mjs     # 公平竞技守卫自动化场景测试
│   ├── test_game_analyzer.mjs # 全局复盘分析器测试
│   ├── test_inbrowser.mjs     # 浏览器端端到端推理测试
│   ├── export_weights.py      # 模型权重转换与对齐导出脚本
│   └── verify_official_baseline.py # 官方推理对照基线测试
├── LICENSE                    # 多组件开源许可证说明
└── THIRD_PARTY_NOTICES.md     # 第三方开源声明、来源与对应源码指引
```

---

## 🚀 安装与使用指南

完整的中英文指南、双引擎图例、署名与许可证全文：[4chess.cc/guide/](https://4chess.cc/guide/)。项目署名：**keluoke**；保留第三方作者署名。

### 第一步：在 Chrome 中加载插件
1. 打开 Chrome / Edge / Brave 浏览器，在地址栏输入：
   ```text
   chrome://extensions
   ```
2. 在页面右上角开启 **开发者模式 (Developer mode)**。
3. 点击左上角的 **加载已解压的扩展程序 (Load unpacked)**。
4. 执行 `npm run package`，解压 `releases/diverge-extension-v1.0.8.zip`，选择解压后的文件夹（避免将网页版独有的标准版运行代码装入插件）。
5. 看到 `歧路 Diverge · 人类直觉与双引擎研判` 图标亮起即安装成功。

### 第二步：首次加载与模型缓存
在允许分析的页面且已读取有效局面后，插件才从专用 CDN 下载所选 Maia 权重。5M / 23M / 79M 首次下载约 28 / 104 / 159 MiB；下载完成后写入 IndexedDB，各版本缓存独立。再次打开仍需读取缓存并初始化，不能保证零延迟。
对局中修改模型只保存设置，不启动下载或计算。popup 与悬浮窗中的“网页版复盘引擎”只设置网页版的 SF19 档位；切换它不会切换悬浮窗引擎。悬浮窗始终运行打包的 SF19 Lite。
更新本地插件后，在 `chrome://extensions` 重新加载扩展，再刷新棋盘标签页；更新网站不会自动更新已安装插件。

### 全盘页面的操作与设置同步
- 页面方向键回看，输入框和弹窗不接管；点击 / 拖动合法走法创建个人分支，支持升变选择与分支回看。
- 右键拖动思考箭头、右键单击标记格子；个人标记与自动引擎图层分开，按局面保留。
- 两个引擎独立返回结果；探索分支优先于整局复盘，回到主线停下后恢复未完成复盘。
- 新版插件通过仅在 `https://4chess.cc/analysis` 生效的偏好连接同步三入口。仅传递白名单中的 UI 设置，不传棋谱、模型、引擎指令或自定义 CDN 地址。未安装插件的网页独立持久保存；设置与模型缓存都不自动跨设备同步。

### 第三步：赛后复盘或分析台研判
1. 访问合法研判页面：
   - **Lichess 分析台**: [https://lichess.org/analysis](https://lichess.org/analysis)
   - **Chess.com 分析台**: [https://www.chess.com/analysis](https://www.chess.com/analysis)
   - **已完赛对局复盘**: 如 `/game/live/:id`（对局已正式结束且弹出结算框或出现终局标记）
2. 页面将自动加载 **歧路 Diverge** 悬浮卡片。
3. 棋盘上将呈现：
   - **金色箭头**: 人类直觉候选
   - **翡翠绿虚线箭头**: Stockfish 引擎最优推荐
   - **暖色落点热力图**（默认关闭）: 汇总合法候选的落点概率、按最高落点归一化；颜色深浅表示相对偏好，不是注意力、危险程度或胜率。两类箭头可分别开关。
4. 点击悬浮面板上的“**深度复盘**”，即可跳转至独立复盘大屏，全面分析整局走法与直觉盲区。

---

## 📄 开源许可证与协议说明 (Open Source Licenses)

本项目包含不同开源许可证的独立及衍生组件，随仓库完整附带所有许可证全文，详见 [LICENSE](LICENSE)、[LICENSES/](LICENSES/) 与 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)：
- **联合分发许可 (Combined Work)**：扩展与 PWA 整体分发包因包含并直接链接 Stockfish (GPL-3.0) 且衍生自 Maia-3 (AGPL-3.0)，整体受 **GNU AGPLv3 / GPLv3** 保护，向所有使用者提供完备的开源自由与对应源码保障。
- **Diverge UI & Extension Core**: 独立前端界面、DOM 桥接与样式遵循宽松的 **MIT License**。
- **Maia 3 神经网络架构与权重**: 衍生自多伦多大学与 CMU CSSLab Maia-3 项目，遵循 **GNU Affero General Public License v3.0 (AGPL-3.0)**（全文见 [LICENSES/AGPL-3.0.txt](LICENSES/AGPL-3.0.txt)）。权重转换工具及端侧推理实现全部开源。
- **Stockfish 19 WebAssembly & Stockfish.js**: 基于 Stockfish.js (Nathan Rugg / Chess.com) 与官方 Stockfish 19，遵循 **GNU General Public License v3.0 (GPLv3)**（全文见 [LICENSES/GPL-3.0.txt](LICENSES/GPL-3.0.txt)）。
- **Cburnett 棋子 SVG**：Colin M. L. Burnett，GPL-2.0-or-later；许可全文见 [LICENSES/GPL-2.0.txt](LICENSES/GPL-2.0.txt)。

