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
