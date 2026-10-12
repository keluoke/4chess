# 全盘分析界面交付记录 · 2026-10-12

## 已实现

- 固定桌面双栏；右侧从上到下是精度与走势、局面候选、常驻记谱、妙手/俗手列表。记谱较长时独立滚动。
- 保留顶部对阵姓名、结果、语言、主题、PGN 导入、重新分析；保留原 BoardUI、SVG 棋子、回放按钮、翻转与声音图标。
- 新增齿轮入口仅显示图标，支持中文/英文 tooltip 与可访问名称。顶部原有语言与主题入口仍保留。
- 引擎显示最多三条独立 MultiPV 变化，白方视角得分在前；Maia 显示最多三个候选、对应引擎得分和原始概率。两条执行路径都保留各分支的完整 PV。
- Maia 候选与引擎候选相同时复用已计算的变化；其他 Maia 候选按需单独核验。未取得评估时显示破折号。后续变化明确标注为引擎续着。
- 优劣条与棋盘等高，随翻转交换黑白区域。分数始终是白方视角；正分写在白条，负分写在黑条，均势写在白条。未知与将杀单独处理。
- 记谱和走势图默认显示走后局面；“回看此步”和关键步条目显示走前局面。候选可点击逐步试演并返回对局。
- 精度不带百分号，保留一位小数；精度与走势从同一份完成报告同时显示。局部深搜不会改写全盘报告。
- 妙手/俗手继续使用原分类算法和列表，取消与记谱互斥的 Tab。英文俗手统一为 Intuition trap，与普通 Inaccuracy 区分。
- 集中设置直觉等级、局面搜索强度、候选箭头、直觉热力图、概率与方向。空白页面不初始化引擎，引擎状态显示未启动。
- 单局面任务在整盘分析期间让出引擎；切步、试演、换棋谱、切换等级时通过请求代次、FEN、历史、Elo 和搜索深度隔离旧结果。新棋谱不沿用旧精度或走势。
- 更新 PWA 资源清单与缓存版本，包含新增 position-analysis.js。

## 验证结果

- `npm test`：通过，包括 24 个公平竞技场景、DOM 生命周期、安全、局面分析、声音、沙箱握手与原有轻量识别集成测试。
- `node scripts/test_game_analyzer.mjs`、`node scripts/test_intuition_divergence.mjs`、`node scripts/test_pwa_multisource.mjs`：通过。分类算法未调整。
- 新增 `scripts/test_position_analysis.mjs`：白/黑得分转换、均势与未知、将杀、独立 PV、非法续着截断、易位/升变、过期结果和引擎调度验证通过。
- 新增 `scripts/test_review_ui.mjs`：浏览器回归通过，使用真实 Stockfish WASM 和确定性的 Maia 夹具，覆盖保留控件、双语、候选试演、前后局面、声音、设置、热力图、列表筛选、新棋谱隔离及 320/390/736/1024px 布局。
- 另在 Chrome 中使用真实 Stockfish 和真实 Maia：通过原 PGN 弹窗导入 8 个半回合的合法测试棋谱；模型从 weights.4chess.cc 下载并缓存至 IndexedDB；双方引擎就绪，整盘报告完成，精度为 93.3 / 78.8，三个引擎分支和三个直觉候选可见，得到一个俗手条目，无页面异常。此棋谱用于验证流程，不作为识别质量、个人风格或棋力校准证据。
- 中文浅色、英文深色均做实际渲染检查。优劣条翻转后负分符号保持不变。候选行、设置、试演、返回对局及声音开关均已在浏览器操作。
- `npm run build` 和 `git diff --check`：通过。

## 浏览器回归复现

本机命令：

```sh
PLAYWRIGHT_MODULE=/Users/yan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs node scripts/test_review_ui.mjs
```

其他机器如已安装 Playwright，可直接运行 `node scripts/test_review_ui.mjs`；脚本启动临时 HTTP 服务及 Chrome，完成后自行关闭。

## 交付范围

实现位于正式 analysis/ 页面及两条 Stockfish 通信路径。本地预览为 http://127.0.0.1:8768/analysis/ 。没有发布线上、创建 PR 或提交 Git；原先已有的 vision、模型资产和构建脚本修改均保留。公平竞技守卫、模型 CDN 分发和原棋子/棋盘组件未修改。本次浏览器验证不替代宿主网站上已安装扩展的验收。

## 后续线上缓存修复 · review3

用户发布上一版后反馈候选行竖排、出现 whiteToMove / candidateDepth 原始翻译键。检查普通线上 URL：HTML、CSS、i18n、主程序及局面模块均与上一版源文件字节一致；HTML 为 `max-age=0`，CSS 与模块为 `max-age=14400`。新 HTML 可先于浏览器里的旧样式/翻译更新，之前的 Service Worker network-first 也没有绕过 HTTP 缓存。

- HTML 的样式与脚本、主程序直接依赖、三个共享 i18n 导入统一使用 `20261012-review3` 资源版本。
- 更新 Service Worker 缓存名称与版本化预缓存路径，代码请求和预缓存显式要求 HTTP 缓存重新验证；仅清理本应用的旧缓存。
- `/analysis/*`、`/engine/*`、`/ui/*` 等可变代码资源采用 `no-cache, must-revalidate`。
- 删除行棋方、当前局面、回看此步整个工具行及其事件、样式和节点访问。记谱定位、关键步走前回看、候选试演及返回对局继续保留。
- 浏览器回归服务故意为未版本化 CSS/i18n 返回上一版文件和 4 小时缓存；新版页面绕过这些旧资源，样式与中英文翻译正常，原交互回归通过。`npm test`、构建和差异检查通过。

线上发布 `1f72e31`（Pages 部署 `1a46da03-5e6a-477e-9b69-3045655fafd7`）已成功，普通线上 URL 的七个页面资源与源文件一致；实际浏览器完成真实双引擎复盘，显示六条 grid 候选行，无原始翻译键，无工具行，刷新并由 Service Worker 接管后仍正常。

随后确认 Pages 项目的构建命令原为空，虽然源代码更新已发布，`_headers` 仍未生成，线上响应头继续为四小时缓存。已把该项目的构建命令设置为现有 `npm run build`，输出目录保留 `.`，让后续 Git 发布生成 `_headers` / `_redirects`。此记录提交触发按修复后配置重新构建。
