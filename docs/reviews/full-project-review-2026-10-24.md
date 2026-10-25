# Diverge 整体架构、代码质量、产品成熟度与 SEO Review

审查日期：2026-10-24（Asia/Shanghai）。结论：**产品已有清楚的差异化和完整的主要功能，但仍处于需要收敛可靠性的早期产品阶段；应先解决公平竞技与核心正确性，再扩大获客。** 网站的搜索承接与安装转化明显落后于功能建设。

## 1. 基线、方法与结论边界

- 工作区 `/Volumes/AI/coding/simoextension`，HEAD `f93af82d8f1d7a24565c83ea21f49597b95a1aa9`，manifest/package 为 1.1.4。工作区原有多项未提交修改，包含本地海报/分享服务；此次保留原样。
- 实际阅读 content/engine/analysis/popup/scan/offscreen、后台通信、Cloudflare API、缓存、构建、测试、商店文案与图片。不是逐行形式化验证，也不是所有设备/平台版本全覆盖。
- 重新执行默认测试；将 10 月 15 日的缺陷复现脚本复制到本次证据目录，核对脚本后执行当前源码，未复用旧运行结果作为本次通过证明。
- 运行真实 Chrome 的导入、缓存、首次离线与空状态响应式场景；运行包内真实 Stockfish Lite WASM 的终局场景。公平竞技异常用本地 DOM 和可控引擎复现，没有在真实进行中的比赛执行分析。
- 在线访问商店公开页，并通过 curl 校验网站响应、元数据和关键源码哈希。网站专用抓取工具不能访问站点，Python 的证书链也失败；使用保持 TLS 校验的 curl 成功，不能据前两者判定网站宕机。
- 打包在临时隔离目录完成，没有覆盖已有 release ZIP。只新增审查报告和本地证据，没有修改产品源码、提交、推送或部署。
- 未登录商店后台/Search Console，没有安装转化率、关键词排名、留存、崩溃率或真实用户 Core Web Vitals 数据。下文 SEO 优先级是基于结构与观察的判断，不是流量效果承诺。

证据目录：[artifacts/review-2026-10-24](/Volumes/AI/coding/simoextension/artifacts/review-2026-10-24)。

| 维度 | 判断 | 核心原因 |
|---|---|---|
| 整体架构 | 方向合理，任务生命周期边界不够集中 | 本地计算、平台适配、引擎和视觉分离已有基础；取消、缓存与状态所有权分散 |
| 代码优雅度 | 可继续演进，但已明显累积维护成本 | 大型协调类、重复解析、全局状态、多个 epoch/布尔位、手工依赖清单 |
| 产品成熟度 | 功能较全，可靠性不足以支撑放心扩量 | 三项公平竞技阻断、导入竞态、终局误判、离线失败仍可复现 |
| 商店展示 | 文案基础较好，素材与转化路径需重做 | 已公开 1.1.4；本地截图有严重排版缺陷，扫描价值缺少对应首图 |
| 网站 SEO | 基础薄弱 | 根路径跳工作台、无有效 sitemap/robots、语言与内容入口不足 |

## 2. 必须优先处理的问题

P1 表示发布阻断；P2 表示下次稳定版应修复；P3 表示体验/维护优化。缺陷复现脚本中的断言描述“当前错误存在”，脚本成功退出不代表产品正确。

### F01 · P1：Lichess 用户名可能被识别为完赛结果

位置：[fair-play-guard.js:141](/Volumes/AI/coding/simoextension/content/fair-play-guard.js:141)。

终局检查选择 `.game__meta .status, .game__meta`，可能取得包含玩家名的父节点，再用没有边界的 `mate/won/lost/胜` 等片段匹配。没有运行时钟、认输控件与终局证据的本地观战 fixture 中，玩家名 `LostKnight` 使 guard 返回未进行中，scan-source 也允许扫描。

应仅接受当前棋局专属结果/状态节点和明确终局值，并绑定 gameId；保持正在运行的时钟/控件最高优先级。不要以增加白名单或跳过现有 guard 修复。验收须包含普通姓名、历史残留结果、无限时观战、完赛关弹窗/刷新及新局重锁。

证据：[fairplay-reproductions.json](/Volumes/AI/coding/simoextension/artifacts/review-2026-10-24/fairplay-reproductions.json)。真实平台当前 DOM 出现率未测量。

### F02 · P1：缺少终局证据的数据默认被放行

位置：[fair-play-guard.js:306](/Volumes/AI/coding/simoextension/content/fair-play-guard.js:306)、[analysis.js:731](/Volumes/AI/coding/simoextension/analysis/analysis.js:731)。

`verifyConcludedGame()` 在没有顶层 PGN/result、且未命中部分 live 状态时最终返回 `ok:true`。本次重跑 `{moveList:"mC0K",pgnHeaders:{Result:"*"}}`，真实导入方法接受了结果为 `*` 的棋谱并设置 `autoReview:true`。

应统一顶层与嵌套平台响应为明确的 GameRecord；未知/缺字段/冲突均拒绝进入对局复盘，生成 PGN 后再次核验。手工研究 FEN 是独立输入类型，不能拿它作为导入未知实时棋局的回退。此复现使用模拟 API JSON，不证明平台线上必然返回该对象形状。

### F03 · P1：取消整局复盘后仍能启动新搜索

位置：[game-analyzer.js:1198](/Volumes/AI/coding/simoextension/engine/game-analyzer.js:1198)、[game-analyzer.js:1182](/Volumes/AI/coding/simoextension/engine/game-analyzer.js:1182)。

深度复核在 await 实战走法评分后没有再次检查任务是否失效，继续调用 Maia 首选走法的定向搜索。将本地 DOM 从完赛切换成 running clock + Resign，实际 guard 上锁后调用 cancel/stop，仍记录到一次新的 depth 10 evaluate。

应在所有异步返回后、每次引擎调度前检查 runId/cancellation/授权状态；撤销整条任务链，不能只抹掉结果。此次证明搜索请求会重新发出，未证明实时面板显示建议。证据：[engine-reproductions.json](/Volumes/AI/coding/simoextension/artifacts/review-2026-10-24/engine-reproductions.json)。

### F04 · P1（仅本地开发功能）：分享服务的缺失令牌会绕过认证

位置：[share-service.mjs:209](/Volumes/AI/coding/simoextension/scripts/share-service.mjs:209)、[share-service.mjs:242](/Volumes/AI/coding/simoextension/scripts/share-service.mjs:242)。

条件 `config.LOCAL_TOKEN && tokenPassed && tokenPassed !== config.LOCAL_TOKEN` 只拒绝非空的错误令牌；未传令牌会继续。CORS 同时回显任意 Origin，并允许 Private Network 请求，与文件头“仅扩展 Origin + Bearer”说明不一致。若服务已启动且配置云端凭据，来自能访问 loopback 的非授权请求可进入生成流程；浏览器是否放行还取决于其本地网络策略。

应强制非空且匹配令牌、验证允许的扩展 Origin、每次安装生成随机秘密，校验 FEN 并限制外部请求超时。不应依赖浏览器网络策略作为认证。这是源代码确认的问题；此次没有启动服务或请求微信/CloudBase。隔离打包已验证剔除此功能与 loopback 权限，不能称为商店版本漏洞。

## 3. 核心正确性与恢复能力

| 编号 | 优先级/问题 | 本次证据 | 建议与验收 |
|---|---|---|---|
| F05 | P2：Stockfish stop 后排队任务重启 | 可控 UCI Worker；显式 stop 后迟到 bestmove 又发 `go depth 10` | 区分 replace-search 与 cancel-all，取消队列并结算 Promise；测试迟到 bestmove |
| F06 | P2：合法将死被当成引擎失败 | 真实 Lite WASM 返回 `mate 0 / bestmove (none)`，包装器转 null；一步将死报失败，Fool’s Mate 末步 unknown | 结果联合类型区分 terminal/cancelled/error；将死、逼和均不要求 bestMove |
| F07 | P2：PGN 嵌套变例/分号注释解析错误 | 嵌套变例只回放 1 个半回合，注释词混入 SAN | 用 tokenizer/括号深度解析或成熟解析库；输入错误应展示行/走法位置，不能静默截断 |
| F08 | P2：完整 PGN 被误识别成下载链接 | Chrome 中带 Lichess Site 头的本地 PGN 触发 fetch，503 时拒绝载入 | 先识别完整 PGN/FEN，再对完整 URL 分支处理；保证本地棋谱可离线导入 |
| F09 | P2：旧导入覆盖新选择 | Chrome 中旧远端 A 在新本地 B 之后返回，B 被 A 覆盖 | importGeneration + AbortController；提交会话时检查最新意图 |
| F10 | P2：Maia Worker 异常导致永久等待 | 故障注入后 initialize=PENDING、isLoading=true | onerror 必须结算加载/预测 Promise、终止 Worker，并可重试或真实回退 |
| F11 | P2：损坏模型缓存无法通过重试恢复 | 三次加载均 Invalid magic，fetch=0、clear=0 | 校验失败清理对应缓存，最多重下重试一次；使用版本/校验和标识 |
| F12 | P2：旧缓存回调修改新复盘状态 | A 的缓存延迟返回，将正在计算的 B 的 isAnalyzing 改为 false | await 缓存后核对 runId；只有当前任务可修改状态和 lastReviewResult |
| F13 | P2：首次离线重载工作台不能初始化 | 新 Chrome context 首次安装 SW 后断网重载，app=false、棋格=0 | 预缓存漏了静态导入 scan-authorization.js；由构建生成完整依赖图，测试首次离线及升级 |
| F14 | P2：缓存进行中 API 响应阻碍赛后解锁 | 实际 API handler + SW + 模拟上游，完赛后仍连续返回 playing，上游只调用一次 | 未完赛响应 no-store；SW 绕过同源 /api/；只缓存明确完赛的不可变结果 |

具体位置：

- F05/F06：[stockfish-inbrowser.js:597](/Volumes/AI/coding/simoextension/engine/stockfish-inbrowser.js:597)、[stockfish-inbrowser.js:532](/Volumes/AI/coding/simoextension/engine/stockfish-inbrowser.js:532)。
- F07：[game-analyzer.js:52](/Volumes/AI/coding/simoextension/engine/game-analyzer.js:52)。
- F08/F09：[analysis.js:640](/Volumes/AI/coding/simoextension/analysis/analysis.js:640)。
- F10：[maia-engine.js:107](/Volumes/AI/coding/simoextension/engine/maia-engine.js:107)。
- F11：[maia-inbrowser.js:60](/Volumes/AI/coding/simoextension/engine/maia-inbrowser.js:60)。
- F12：[game-analyzer.js:792](/Volumes/AI/coding/simoextension/engine/game-analyzer.js:792)。
- F13：[sw.js:9](/Volumes/AI/coding/simoextension/analysis/sw.js:9)。
- F14：[chesscom.js:62](/Volumes/AI/coding/simoextension/functions/api/chesscom.js:62)、[sw.js:83](/Volumes/AI/coding/simoextension/analysis/sw.js:83)。

相应运行证据为本次目录下 `engine-reproductions.json`、`terminal-evaluation-repro.json`、`input-repros.json`、`cache-race-repro.json`、`corrupt-model-cache-repro.json`、`pwa-offline-evidence.json`、`chesscom-cache-evidence.json`。其中 Worker/缓存竞态使用可控替身；离线、导入与 API 缓存使用真实 Chrome；终局使用实际包内 WASM，不混为生产端到端验证。

## 4. 架构评价与演进建议

值得保留的设计：

- 扩展、小型识别模型与 Lite 引擎本地运行，大 Maia 权重/CDN 与 IndexedDB 分离，安装包约 2.05 MiB；没有发现 Maia 大权重随本次包入库/分发。
- 棋盘探测、覆盖层、扫描来源、offscreen 识别和工作台已有模块边界；扫描来源绑定 document/tab、变化后撤销，是正确的安全方向。
- 引擎/模型版本与偏好已有独立模块，复盘缓存键包含模型/引擎身份；识别核心有锁文件与哈希校验。
- 商店文案有单一 JSON 来源和同步校验，外部署名、许可证、隐私页已经建设，不需要推倒重写。

主要架构问题不是框架选型，而是多个模块都在拥有同一任务的生命周期。`main-module`、`PositionAnalysis`、`GameAnalyzer`、Stockfish 包装器各自维护 epoch、searching、stopping、isAnalyzing；当前复现说明这些状态会互相失真。

建议按以下边界渐进拆分：

| 边界 | 应负责 | 不应负责 |
|---|---|---|
| PlatformAdapter | DOM/API 取证、gameId、棋谱规范化 | 决定 UI 或启动引擎 |
| FairPlayGuard / 状态服务 | lobby/live/concluded/unknown 与证据，统一订阅 | 推理或展示结果；不得绕过既有守卫 |
| AnalysisScheduler | 任务所有权、优先级、取消、授权 epoch、唯一引擎队列 | DOM 文案、平台选择器 |
| EngineAdapter | initialize/evaluate/cancel/dispose 与稳定结果类型 | 推测平台是否完赛 |
| StudySession / ImportService | 输入类型、解析、分支、导航、导入 generation | 直接操作 Worker |
| UI presenter | 从状态渲染、收集用户事件 | 自行推断业务状态 |
| Cache/AssetStore | 版本、完整性、失效、配额、清理和恢复 | 把缓存命中直接写入当前任务状态 |

每个异步任务携带 `{sessionId, taskId, authorizationEpoch, signal}`，每次 dispatch 和 commit 都校验所有权。暂停分析/用户换局/新局上锁分别有显式状态转换。应保留 safe study FEN、完整对局、来源绑定扫描三个输入类型，避免把来源安全条件在序列化后丢失。

四阶段状态机应真正区分大厅待命与实时对局。现在两者都可能被压缩为布尔 locked；安全上可保守锁住，但 UI 不应把大厅说成正在比赛。150ms setTimeout 加 250ms 兜底不能直接证明“150ms 内”硬性指标，需用真实事件时间戳与压力场景测量。

## 5. 代码优雅度与测试工程

`analysis.js` 2017 行、`intuition-panel.js` 1684 行、`game-analyzer.js` 1522 行。行数本身不是缺陷；问题是各自同时承接 UI、导入/平台解析、任务调度、统计、缓存等变化原因。background 与 GameAnalyzer 又重复 TCN 解码/PGN 序列化，修一处容易漏另一处。

优先建议：

1. 先抽离纯函数：PGN/TCN 解析、平台响应规范化、终局类型、评分换算，建立正常/边界契约测试，再移动 UI 代码。
2. 给消息和结果加 JSDoc + `checkJs` 或逐步 TypeScript。重点是区分 `TerminalResult`、`EvaluationResult`、`Cancelled`、`EngineError`，避免到处用 null 代表不同含义。无需为“优雅”全项目换框架。
3. 统一销毁契约，观察器、timer、事件 listener 与 Worker 的创建必须有配对释放；同一任务状态只由其 owner 修改。
4. 将部分压成一行的浏览器测试格式化；断言保留行为描述。日志中的“0ms”“保证60FPS”等绝对表述应改为可测量状态，避免注释和真实实现漂移。
5. 自动生成 SW 依赖清单与版本信息。Cloudflare build 目前主要复制 headers/redirects，并非隔离产物构建；建议 `dist/site`、`dist/extension-store`、本地开发包显式分离，网站也采用 allowlist、大小与敏感文件检查。
6. 默认 CI 的 `npm test`、build、package 是良好起点，但未包含本次浏览器异常路径。`test_user_entries.mjs:13`、`test_preferences_sync.mjs:3` 仍固定读取 v1.0.8 ZIP；可能构建了新版却测试旧版。`test_studio_e2e.mjs:8` 还有本机绝对路径。应统一由 manifest/产物清单取版本和路径，固定 Playwright 依赖与浏览器版本。
7. 将本次缺陷复现改为“期待正确行为”的正式回归测试：不能直接把当前证明缺陷存在的断言放入通过门禁。常规 PR 跑确定性单元/浏览器 fixture；发布跑当前 ZIP、真实模型、两个平台全生命周期、离线和升级验收。

建议发布记录包含 commit、工作区差异摘要、ZIP SHA-256、网站 build ID、模型版本/哈希、测试矩阵与已知限制。相同 version 不足以证明代码相同。

## 6. 产品成熟度与体验

核心差异化成立：**让用户比较 Stockfish 的好棋与 Maia 预测的人类常见选择**，扫描只是进入这一体验的便捷入口。不要把产品重心分散成扫描器、复盘器、模型管理器、分享工具四个平行产品。

本次实际打开工作台，1440×1000 与 390×844 均无横向溢出或 pageerror；空白状态 SF/Maia 都显示 Not started，这是积极证据，但不是整套交互与触屏验收。

仍有以下体验问题：

- 移动首屏先呈现初始棋盘和多个空统计区，主要说明和示例位于更低位置。顶部虽有 Import PGN，但新用户不易理解 FEN/图片/对局链接的区别。空状态应先给三个任务入口和一个无需下载大模型的解释示例，未载入对局时折叠空统计。
- 英文空状态仍显示“全部/妙手/俗手”，在本次 Chrome 截图可见，源于 HTML 初始文案未完整更新。应针对初次进入、错误、空状态、加载、锁定而不只正常复盘检查中英一致性。
- 首次 Maia 下载、缓存命中后的解码/加载、推理阶段需区分；IndexedDB 命中不代表实际 0ms 可推理。模型选择应显示预计下载体积/设备建议，默认 5M，较大版本留在高级设置。
- 妙手/俗手属于产品自己的启发式标记，不能让用户误以为等同平台认证或个人风格模型。解释命中规则、分析深度和覆盖率；末步 unknown 的正确性问题必须先修。
- 重试必须能够恢复：区分网络失败、缓存损坏、Worker 异常、来源已失效，不要统一显示启动异常。
- 缺少真实留存证据。先以“完成第一次有意义的人机分歧比较”为激活目标，观察首次成功分析时间、失败率、复盘完成率、7日返回率；任何新增遥测须先明确数据范围和隐私披露，不采集截图/FEN/PGN作为默认分析事件。

截图：[桌面](/Volumes/AI/coding/simoextension/artifacts/review-2026-10-24/studio-1440.png)、[手机宽度](/Volumes/AI/coding/simoextension/artifacts/review-2026-10-24/studio-390.png)。手机宽度测试不是手机真机性能/触控验证。

## 7. Chrome 商店：已上线，但应提高转化质量

本次直接打开的[公开商店页](https://chromewebstore.google.com/detail/diverge-chess-analysis-sc/egiimjkekgiaimaagaljiclacljmdkmo)显示 1.1.4、约 2.06 MiB、两种语言、尚无评分。标题和摘要已覆盖 chess analysis/scanner，说明包含完赛用途与概率边界。公开用户数与搜索缓存不一致，因此不把该数字用于增长判断。没有下载并验证商店分发 CRX，也没有读取商店后台素材配置。

最具体的素材问题：本地英文 `screenshot-1-two-perspectives-1280x800.png` 的棋盘格没有正常排布，棋子垂直挤在左边并溢出画面；overview 也包含同样问题。旧 `qa/report.json` 标记 passed=true，却主要核对尺寸、文字和候选数量，不能证明视觉正确。**该首图应禁止再次上传；线上是否使用这张图仍未确认。**

证据：[本地首张英文截图](/Volumes/AI/coding/simoextension/chrome-web-store/english-20261012/images/screenshot-1-two-perspectives-1280x800.png)。

建议保持品牌识别，文案围绕一个使用结果，减少长说明对首屏的挤占：

- 英文标题候选：`Diverge: Chess Analysis & Board Scanner`。
- 中文标题候选：`歧路 Diverge：棋图扫描与双引擎复盘`。
- 英文摘要候选：`Scan chess diagrams and compare Stockfish analysis with Maia human moves. Study positions and review finished games.`
- 中文摘要候选：`扫描网页棋图，对比 Stockfish 好棋与 Maia 人类常见走法；探索局面、导入棋谱，复盘已结束的对局。`
- 不急于只为了 SEO 改名：现标题并非明显错误。先优化素材、首段与安装入口，再比较曝光到安装的转化，避免同时改所有变量。

截图叙事建议为：① 网页棋图→确认局面→可探索棋盘；② 同局面 Stockfish/Maia 分歧；③ 整局走势与关键步；④ 自由试演个人分支；⑤ 实时锁定与完赛解锁。全部使用当次发布真实 UI，原始尺寸和缩小尺寸人工检查，英中文分别验证。保留“人类走法概率不是胜率”和“仅学习/赛后使用”，但不得把尚未修复的生命周期行为当作已验收承诺。

Chrome 官方建议标题简洁、描述准确、截图反映当前功能，商店发现也受产品质量与使用表现影响，关键词堆砌不能替代体验。[官方商店指南](https://developer.chrome.com/docs/webstore/best-listing)

## 8. 网站 SEO：重点是落地页、可索引内容与安装路径

### 8.1 本次线上确认

| URL/项目 | 观察 | 影响 |
|---|---|---|
| `/` | HTTP 302 → `/analysis/` | 搜索与商店来访直接进入工具，缺少清楚的产品介绍/安装承接；302 本身不等于无法索引 |
| `/analysis/` | 200；静态 HTML 无 H1/canonical/hreflang/OG/JSON-LD | 工具可使用，但搜索主题表达与分享预览不完整；缺少单项标签并非自动降权 |
| `/guide/` | 有实质指南、title/description/H1 | 已有可复用内容基础，主题过于集中在一个长页 |
| `/robots.txt` | 200 + text/html，返回 2507 字节首页跳转 HTML | 不是有效的 robots 文件；不能据此说全站被禁止抓取 |
| `/sitemap.xml` | 200 + text/html，同一首页 HTML | 没有有效 XML 站点地图；小站并非必须有 sitemap，但应修正此错误端点 |
| 语言 | 静态 HTML 中文，JS 按偏好/参数切英文 | 没有稳定可发现的语言互链和 hreflang；不能认定英文完全不可索引 |
| 扩展安装入口 | 工作台与指南 HTML 无商店链接；Chrome 渲染后工作台同样无 | 用户被告知可以使用扩展扫描，却没有清楚的直接安装路径 |

`analysis/index.html`、guide HTML、analysis.js、sw.js、guard 和 game-analyzer 与本地逐字节相同。因此相关源码问题也存在于网站所服务的这些文件；这不等于已在生产实际触发所有故障。privacy HTML 差异来自 Cloudflare 邮箱混淆注入，未据此误报版本漂移。

HTTP 与哈希证据：[http-audit-curl.json](/Volumes/AI/coding/simoextension/artifacts/review-2026-10-24/http-audit-curl.json)。

### 8.2 建议的信息架构

| 页面 | 主要意图 | 内容与 CTA |
|---|---|---|
| `/en/`、`/zh/` | 了解 Diverge 是什么 | 差异化、真实演示、三个使用场景；安装扩展/试用工作台 |
| 对应语言 `/chess-board-scanner/` | chess board scanner、chess image to FEN | 支持的静态图片场景、校正/行棋方限制、扫描流程 |
| `/maia-vs-stockfish/` | human chess moves、Maia vs Stockfish | 概率与评分区别，精选完整局面示例，链接工作台 |
| `/pgn-analysis/` | PGN analysis、completed game review | 导入与分支探索教程、有效 PGN 示例、已知限制 |
| `/guide/` | 已安装用户的任务帮助 | 安装、开始、模型、错误恢复、快捷键分节并互链 |
| `/analysis/` | 使用工具 | 保留稳定入口与深链接，不强制跳转语言营销页 |

这些是搜索意图假设，未做搜索量或排名验证。先做一个高质量首页和一个最强场景页，不批量生成薄内容；不要提前建设并未支持的上传/PDF/实时解说落地页。

实现要点：

1. 首页提供可直接抓取的 HTML，H1 明确“棋图扫描 + 引擎与人类走法比较”；CTA 链到真实商店 ID，手机端优先试用工作台。
2. 中文/英文使用独立 URL，互相链接，self-canonical、对应 hreflang 和 x-default；不要只按浏览器语言换掉同一 URL 的内容。[Google 多语言指南](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)
3. 返回真正的 text/plain robots 与 XML sitemap；为不存在的地址返回明确 404，避免将所有路径伪装为首页。站点地图列出 canonical 内容页，不枚举任意 FEN/PGN 会话。[站点地图说明](https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview)
4. 页面独立 title/description、清晰标题层级、可抓取内链；OG/Twitter 图改善分享展示。OG 不是搜索排名保证。可加真实准确的 WebApplication/SoftwareApplication 语义数据，不伪造评分；结构化数据不保证富结果。
5. 工具壳页是否索引按其独立价值决定；私人会话与任意参数组合不应生产大量可索引页面。robots 是抓取控制，不能当作隐私或可靠的 noindex 机制。[robots 说明](https://developers.google.com/search/docs/crawling-indexing/robots/intro)
6. 营销页不启动/预下载 Maia，使用真实静态演示或用户主动播放，控制图片尺寸与字体，随后测量 LCP/INP/CLS。本次没有 Lighthouse/CrUX 数据，不给虚构性能分数。
7. 用 Search Console 验证属性、提交 sitemap、查看规范 URL 和页面索引，再跟踪品牌/非品牌展示、点击率、安装 CTA 点击与商店转化；不以 `site:` 搜索无结果直接证明未收录。

内容与标题优化应先满足具体用户任务；Google 的基础指南强调清楚、独特、可理解的页面内容与链接。[SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)

## 9. 实施顺序与验收门槛

| 阶段 | 优先交付 | 验收条件 |
|---|---|---|
| A：可靠性修复 | F01–F03；本地服务 F04；终局、取消、导入与缓存恢复 | 未知状态始终锁定；撤销后无新搜索；完赛/关弹窗/刷新可用；将死/逼和不报引擎失败 |
| B：发布工程 | 当前产物测试、回归测试、首次离线、构建隔离 | CI 测试本次生成 ZIP；模型/敏感文件不入包；发布清单可追溯；在线与离线升级通过 |
| C：转化基础 | 修复截图、增加安装入口、移动空状态、本地化 | 首图实际棋盘正常；网站两次点击内到安装/示例；中英空/错/锁状态一致 |
| D：SEO 内容 | 双语落地页、scanner 场景页、有效 sitemap/robots | HTTP/MIME/canonical/hreflang 正确；Search Console 可验证索引；获得可比较的流量基线 |
| E：持续演进 | 调度器与会话边界渐进重构、更多教程 | 缺陷率与改动影响面下降；有留存/转化证据再决定扩功能 |

不建议当前优先进行全框架迁移、增加更大模型、扩展云端能力或大量铺 SEO 文章。这些投入不能解决当前最影响信任和转化的问题。

## 10. 本次验证记录

- `npm test`：exit 0；包含公平竞技/DOM、安全、局面、引擎版本、声音、握手、Vision 真像素与哈希、扫描来源与 Worker、商店双语同步。日志 [npm-test.log](/Volumes/AI/coding/simoextension/artifacts/review-2026-10-24/npm-test.log)。通过不覆盖本次新增反例。
- 8 份针对性复现脚本均执行完成并生成本次 JSON；证明上文边界缺陷仍存在。
- Chrome 空状态响应式：1440 与 390 宽度无横向溢出/pageerror；英文漏译和首屏引导问题已视觉确认。
- 隔离打包：成功，2,150,565 bytes、118 ZIP entries；已去除本地分享文件/字符串和 loopback 权限，最大文件为约 1.7 MiB Lite WASM，小识别权重 620,852 bytes。[package-audit.json](/Volumes/AI/coding/simoextension/artifacts/review-2026-10-24/package-audit.json)
- 商店：公开 listing 可访问且为 1.1.4；未核对实际 CRX、当前上架截图、商店审核状态历史或后台转化。
- 尚需验收：真实平台登录态与多局切换、service worker 休眠恢复、150ms 上锁时延、手机真机/弱网、大模型内存与首推时延、长期使用稳定性、真实搜索与留存表现。
