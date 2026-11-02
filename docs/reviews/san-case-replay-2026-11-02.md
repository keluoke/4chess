# SAN 大小写导致错误棋盘还原

用户提供 dorocha–clarkyan，2026-11-02，0-1，29…Qxc1#。

## 根因和影响

`GameAnalyzer.buildPositionChain` 和 `BoardDetector.getReplayedPositionFromMoves` 在同一个 `find` 条件内同时允许精确匹配与忽略大小写匹配。第 9 回合白方 `Bxc3` 应为象从 d2 到 c3；旧代码先找到合法兵着 `bxc3`（b2c3），因此即便存在精确匹配也选错了棋子。错误局面继续传播到第 49 半回合 `25.Qd2` 才中断，显示 48 步而不是 58 步。

这是共享 SAN 还原缺陷，不依赖时钟注释、Maia 模型或屏幕尺寸。其他同时存在 `Bxa…/bxa…` 或 `Bxc…/bxc…` 的局面同样有风险；有些会截断，有些错误路径可能继续合法。无法仅凭这一用例估计历史受影响棋局数量，也不据此声称所有棋规问题都已排除。

## 修复

- 两条入口都严格区分 SAN 大小写，保留原有将军/将杀/评价符号清理和精确 UCI 支持，不再猜测大小写错误的棋子。
- 复盘 schema 10 → 11，使可能来自错误局面的旧结果和缓存键失效；入口和依赖资源更新缓存版本。
- 不修改公平竞技守卫、模型加载和评分公式。

## 验证

- 使用独立 python-chess 1.11.2 生成全部 59 个局面参考（初始局面加 58 半回合）；应用还原逐个 FEN 相同。最终 FEN：`7k/p5pp/1p2p3/3b1p2/1Q3PP1/7P/PP6/K1q5 w - - 0 30`，白方受将且无合法着法。
- 回归数据为用户棋谱的主线规范化副本；测试另外构造 Chess.com 时钟、timestamp、c_effect 注释及 URL 编解码版本，均保持同样主线。
- 回归覆盖白黑双方象/兵同目标格冲突、UCI、附加评价符号、拒绝错误棋子大小写、Chess.com 和 Lichess DOM 记谱的每一步还原、schema 10 缓存拒绝。
- `npm test`、`node scripts/test_review_ui.mjs`、构建、打包一致性及 `npm run test:browser` 均通过。
- 浏览器中使用真实 Stockfish 深度 6 完成该局 58 步评分并跳转终局，验证棋盘、末步记谱及图表；Maia 使用既有可控测试数据，本次不以该评分数值或截图声称默认深度/真实 Maia 验收。
- 本地截图：`artifacts/san-case-checkmate-20261102.png`。
