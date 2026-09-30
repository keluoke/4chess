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
   - 棋盘记谱表已出现终局裁定（`1-0`、`0-1`、`1/2-1/2`）。
   - 页面已出现局后复盘控件（如 `Game Review` 按钮、`Rematch` 按钮）。
   - 处于归档或历史棋谱状态（如 `/game/live/:id` 且无正在运行的时钟与投降按钮）。

### 2. 棋局全生命周期状态机规范 (Full Game Lifecycle & State Machine)
所有 Agent 必须严格遵守以下棋局四阶段状态机，严禁偏离：

| 阶段 (Stage) | 判定依据 (Detection) | 引擎行为 (Engine Action) | 视觉层 (Visual Overlay) | 面板展示 (Panel UI) |
|---|---|---|---|---|
| **① 赛前/大厅/待命中**<br>*(Pre-Game / Lobby)* | 无活跃时钟、无认输按钮、无终局标记（空盘或新匹配中） | 保持待命，**禁止自旋初始化** | 完全清空，禁止箭头热力图 | 状态真实显示为 **`未启动`**，严禁虚假显示“检测缓存中/启动中” |
| **② 实时对局进行中**<br>*(Live Game In-Progress)* | 存在活跃倒计时时钟 (`.clock-running`) 或认输/和棋/放弃按钮 | **立即停机** (`Stockfish.stop()`)，CPU 占用归零 | **彻底抹除**，清空所有建议着法 | 切换为 **`🛡️ 对局进行中 · 公平竞技保护`**，锁定全盘分析 |
| **③ 比赛结束与结算**<br>*(Game Conclusion)* | 时钟停止，且出现结算弹窗、Move List `1-0`/`0-1`/`1/2`、或复盘/重赛按钮 | **立刻解除保护锁**，唤醒引擎就绪 | 允许显示首选着法与热力图 | **自动解锁**，恢复胜率评估与“全盘分析”按钮 |
| **④ 关弹窗与页面刷新**<br>*(Modal Dismiss / Refresh)* | 结算框关闭或页面刷新，但棋谱仍包含完赛标记且时钟未跑 | 保持就绪，正常研判局面 | 保持交互与走法建议 | **持续保持解锁状态**，严禁重新死锁！ |

### 3. 即时解锁与刷新持久性原则 (Instant Unlock & Persistence Rules)
1. **比赛结束立刻解锁**：对局结束时（时钟停止 + 出现终局结果或结算弹窗），保护锁必须**毫秒级自动打开**，绝不允许强迫用户手动跳转到分析页才能使用插件。
2. **弹窗关闭不重锁**：用户在 Chess.com 关闭结算弹窗查看终局局面是标准操作，守卫必须通过记谱表终局符（`1-0` / `0-1` / `1/2-1/2`）和复盘按钮检测终局，严禁因结算弹窗销毁而将用户重新锁死！
3. **刷新页面不重锁**：在已完赛的 `/play` 或 `/game/live/` 页面刷新后，只要当前局面属于已终局对局，守卫必须判定为已完赛并直接解锁，保障流畅复盘体验。
4. **新局无缝上锁**：一旦用户开始新比赛，新的倒计时时钟开始跳动或出现投降按钮时，Section 1 守卫必须于 150ms 内立即重新上锁。

### 4. 引擎真实状态展示与稳定性规范 (Engine State & Stability Rules)
1. **状态真实性原则**：在引擎未真正调用 `initialize()` 之前，状态必须显示为 **`未启动` (Not Started)**，严禁常态化常驻显示“检测缓存中”或“启动中”。
2. **空闲停止安全原则**：UCI 协议规定引擎仅在搜索计算中才会对 `stop` 指令返回 `bestmove`。对空闲引擎发送 `stop` 严禁触发超时重置看门狗，严禁频繁销毁健康的 WebAssembly Worker。
3. **沙箱与通信弹性**：Manifest V3 Service Worker 存在 30 秒休眠特性，扩展内部通信与沙箱握手必须具备持久化（`chrome.storage.session`）与重连恢复能力，严禁对局结束后误报“启动异常”。

### 5. 所有后续 Agent 必须遵守的准则 (Agent Code Review Rules)
- **禁止绕过守卫**：严禁修改或绕过 `FairPlayGuard.isLiveGameInProgress()` 的安全校验逻辑。
- **默认安全原则 (Fail-Safe)**：在无法 100% 确定对局是否已经结束时，假定对局仍在进行并执行锁定，绝不提供对局中辅助。
- **终局即刻解锁原则**：只要有明确证据（记谱表终局符、结算弹窗、复盘控件）证明对局已结束，必须立刻解锁，提供一流的复盘体验。
- **禁止添加任何“对局辅助/微操助手”类功能**：任何试图向正在对局的用户提供提示（走法概率、优劣走势、危险方格警示）的代码提交都将被立即否决。

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
