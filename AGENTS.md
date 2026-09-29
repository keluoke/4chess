# Maia-3 Extension Agent Guidelines & Iron Laws (智能体开发铁律)

## ⚖️ IMMUTABLE IRON LAW: FAIR PLAY & ANTI-CHEAT (不可逾越的铁律：公平竞技与反作弊)

> **铁律定义 (The Absolute Iron Law):**
> **无论在 Chess.com 还是 Lichess，在正在下棋对局的过程中，本插件严禁提供任何引擎计算、直觉走法建议、候选箭头或注意力热力图服务。严禁任何形式的辅助作弊。**
> 
> *Under NO circumstances shall this extension provide engine analysis, candidate moves, intuition arrows, or attention heatmaps during an active chess game on Chess.com, Lichess, or any other chess platform.*

### 1. 严格受限的运行环境 (Permitted Environments Only)
本插件仅允许在以下合法场景下进行棋局计算与展示：
1. **分析台 (Analysis Board)**：`/analysis`、`/study`、`/editor`、`/practice`
2. **残局与战术题 (Puzzles & Lessons)**：`/puzzles`、`/lessons`、`/classroom`
3. **已完赛对局复盘 (Post-Game Review & Archives)**：
   - 对局已经产生胜负或和棋结果（如已弹出结算框 `.game-over-modal`、Termination 描述包含 `won by` / `drawn by` / `resignation` / `checkmate`）。
   - 处于归档或历史棋谱状态（如 `/game/live/:id` 且无正在运行的时钟与投降按钮）。

### 2. 实时对局保护机制 (Live Game Lockdown)
1. 一旦检测到棋盘处于实时对局进行状态（如存在活跃的时钟倒计时 `.clock-running`、认输/和棋按钮等交互控件）：
   - **立即停止引擎**：调用 `Stockfish.stop()`，禁止后台消耗 CPU 算力。
   - **立即清空视觉层**：调用 `HeatmapOverlay.clear()`，彻底抹除棋盘上的所有箭头、热力图和战术预警光圈。
   - **切换锁定展示**：面板必须切换为 `🛡️ 对局进行中 · 公平竞技保护中 (Fair Play Shield)` 状态，禁止展示任何当前局面的评分或首选着法。
2. 只有当对局正式结束（结算框挂载、时钟终止、结果确定）后，插件方可自动解除保护，恢复赛后复盘与局面研判。

### 3. 所有后续 Agent 必须遵守的准则 (Agent Code Review Rules)
- **禁止绕过守卫**：严禁修改或绕过 `FairPlayGuard.isLiveGameInProgress()` 的安全校验逻辑。
- **默认安全原则 (Fail-Safe)**：在无法 100% 确定对局是否已经结束时，必须假定对局仍在进行并执行锁定，绝不冒险提供引擎输出。
- **禁止添加任何“对局辅助/微操助手”类功能**：任何试图向正在对局的用户提供提示（包括但不限于走法概率、优劣走势、危险方格警示）的代码提交都将被立即否决。

---

## 📦 IMMUTABLE IRON LAW: MODEL ASSETS & CLOUDFLARE 25MB LIMIT (不可逾越的铁律：大模型二进制文件禁止入库与 Cloudflare 25MB 限制)

> **铁律定义 (The Absolute Iron Law):**
> **严禁将任何体积超过 25MB 的大模型二进制权重文件（如 `models/maia3_model.bin` 等）提交至 Git 仓库，严禁将其作为 Cloudflare Pages 静态资源进行部署。**
> Cloudflare Pages 平台对单文件部署有不可逾越的 25 MiB 严格体积上限（超出将直接阻断构建与自动部署）。
> **所有 Maia 模型权重必须 100% 且唯一通过外部对象存储 / 高速 CDN（如 `https://weights.4chess.cc/...`）提供按需流式分发与浏览器端持久化缓存，绝不许打包进 Git 仓库或扩展本地离线包。**

### 1. 资源分发准则 (Asset Distribution Rules)
1. **纯 CDN 加载原则**：
   - 前端与扩展代码（`maia-engine.js`、`maia-inbrowser.js`）仅允许从指定的 CDN 列表拉取模型权重（默认 `https://weights.4chess.cc/maia3_model.bin` 或用户自定义 CDN 节点），严禁配置本地相对路径打包回退（如 `models/maia3_model.bin`）。
   - 首次下载完成后，前端必须自动存入客户端浏览器 IndexedDB 缓存（`ModelCache`），实现后续使用 0ms 瞬间秒开与断网离线复用。
2. **轻量化原则**：
   - 扩展安装包（ZIP）与 Git 仓库源码应保持极简纯代码与轻量资源（仅保留 JS、CSS、HTML、图标与 1.7MB 的 Stockfish WASM），整体源码包控制在数兆字节以内。
   - `manifest.json` 的 `web_accessible_resources` 严禁声明大模型二进制文件。
3. **版本控制防线 (Git Protection)**：
   - `.gitignore` 必须永久严格屏蔽 `*.bin`、`models/*.bin`、`*.pt`、`*.onnx` 等所有大文件，严禁通过 `!models/...` 例外跟踪。
   - 任何试图将大模型二进制提交到代码仓库的行为都必须被立刻阻断。
