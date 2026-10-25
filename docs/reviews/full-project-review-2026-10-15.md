# Diverge 全项目复核 — 2026-10-15

本次对当前工作区重新审查，并由主评审独立复跑关键问题证据。**结论：现版本不应视为全面验收通过；优先修复公平竞技相关的3项P1。** 默认测试、正常扫描和真实双引擎可用性通过，并不能覆盖本报告的异步、误判、终局和首次离线边界。

## 基线与范围

- 路径：`/Volumes/AI/coding/simoextension`；分支main；HEAD `f93af82`；package/manifest均为1.1.4。
- 覆盖：内容注入与棋盘检测、公平竞技全生命周期、扫描/offscreen/worker与来源交接、Maia/SF/缓存/整局复盘、互动棋盘/偏好/中英文/主题、Cloudflare API/PWA、manifest/桥接安全、模型资产/打包/CI/署名。
- 审查前已有AGENTS.md改动，以及未跟踪releases和商店素材目录。未覆盖、丢弃或提交这些内容。
- 本次未修改产品源码、未提交、未推送、未发布。新增本报告与本地证据，执行build产生忽略的_headers/_redirects，package生成当前ZIP。
- 分级：P1=公平竞技或关键正确性阻断；P2=应在下一次正式交付前修复的用户可见/状态/验证缺陷；P3=较低优先级。正式问题共16项：3 P1、11 P2、2 P3；另列2个站点组合待验收的条件性问题。

## 正式问题

### R01 [P1] Lichess 玩家名可能被当作完赛证据

位置：[content/fair-play-guard.js](/Volumes/AI/coding/simoextension/content/fair-play-guard.js:141)。

`.game__meta .status, .game__meta` 的 querySelector 会先返回父容器，正则又在整块文本中匹配无词边界的 `mate/won/lost/胜` 等。无限时观战页面没有运行时钟或玩家认输控件时，用户名 LostKnight 即可使实际守卫返回未进行中，scan-source 也返回 allowed:true。没有终局状态的页面因此能进入分析入口。

证据与边界：JSDOM 运行未修改的真实 guard 和 scan-source；未在真实进行中对局启动引擎。Lichess 官方模板佐证玩家名位于该父容器，旁观控件源码佐证不渲染认输/和棋按钮；真实账号当前页面仍需专项验收。 见 [fairplay-reproductions.json](/Volumes/AI/coding/simoextension/artifacts/review-2026-10-15/fairplay-reproductions.json)。

修复方向：将结论限制到当前棋局专用结果/状态节点，使用明确的终局值；父容器中的用户名和赛事信息不应作为完赛证据。

### R02 [P1] 缺少明确完赛证据的 API 对象被默认放行

位置：[content/fair-play-guard.js](/Volumes/AI/coding/simoextension/content/fair-play-guard.js:363)。

`verifyConcludedGame` 未读取 pgnHeaders.Result；对象没有顶层 pgn/result 且没有命中少数 live 状态时，最终无条件 ok:true。`{moveList:"mC0K",pgnHeaders:{Result:"*"}}` 能经过 analysis.js:731 的检查，并进入实际 TCN 解码分支，以 Result:*、autoReview:true 调用 startNewSession。

证据与边界：执行实际 smartLoadInput 方法与真实验证器，代理 JSON 和 session 接收端为本地模拟；没有证明 Chess.com 当前真实接口一定返回此种缺字段对象。该缺省放行本身违反项目 fail-safe 契约。 见 [fairplay-reproductions.json](/Volumes/AI/coding/simoextension/artifacts/review-2026-10-15/fairplay-reproductions.json)。

修复方向：无明确、合法且一致的终局结果必须拒绝；统一顶层和嵌套字段的验证，在解码/生成 PGN 后再次验证结果。

### R03 [P1] 公平竞技锁定并取消后，深度复核仍启动新搜索

位置：[engine/game-analyzer.js](/Volumes/AI/coding/simoextension/engine/game-analyzer.js:1198)。

二次加深循环只在循环头检查取消。等待 playedEval 时取消，await 返回 null 后继续走 1211-1212 的 Maia 目标走法复核，并在 1182 再次调用 evaluate。常规守卫的 cancel/stop 只处理当前搜索，无法阻止这段异步续体重新启动计算。

证据与边界：本地 JSDOM 由完赛结果切换为 running clock + Resign，实际未修改守卫返回 true，再调用 cancel；引擎调用记录仍有 1 次 live=true 的新 depth10 搜索。引擎为可控适配器，未在真实平台计算；证明后台搜索请求重启，未证明面板显示实时提示。 见 [engine-reproductions.json](/Volumes/AI/coding/simoextension/artifacts/review-2026-10-15/engine-reproductions.json)。

修复方向：所有 await 后和每次新搜索前检查取消、runId 与实际 guard；失效任务应立即返回，且不得影响新任务。

### R04 [P2] Maia Worker 异常后初始化永久等待

位置：[engine/maia-engine.js](/Volumes/AI/coding/simoextension/engine/maia-engine.js:107)。

onerror 仅将 worker 置空并修改 backendName，未 reject 正在等待的模型加载 Promise，也未结算 workerPending 或执行日志声称的直接推理回退。重试复用悬挂的 initPromise，UI 可以一直显示启动中。

证据与边界：实际协调器 + 故障注入 Worker；触发 onerror 后 initialize 仍 PENDING、isLoading=true、加载 resolver 仍存在。这不是对正常机器实际崩溃频率的测量。 见 [engine-reproductions.json](/Volumes/AI/coding/simoextension/artifacts/review-2026-10-15/engine-reproductions.json)。

修复方向：异常路径统一结算加载与预测任务、终止旧 worker、清理 initPromise，并完成可验证的回退或显示可重试错误。

### R05 [P2] 显式 stop 后，直接 Worker 会重新启动已排队搜索

位置：[engine/stockfish-inbrowser.js](/Volumes/AI/coding/simoextension/engine/stockfish-inbrowser.js:597)。

直接 Worker 模式 stop 不清 queuedRequest；A 计算时 B 入队触发 stop，随后用户取消，A 的 bestmove 回调仍在 192-195 执行 B。复现观察到显式停止后新增 go depth10、isSearching=true。

证据与边界：真实调度源码 + 可控 UCI Worker。主要影响 Studio/扩展页的直接 Worker；宿主页面通常用 sandbox，不能把此项泛化成所有路径。 见 [engine-reproductions.json](/Volumes/AI/coding/simoextension/artifacts/review-2026-10-15/engine-reproductions.json)。

修复方向：区分为替换搜索而 stop 与终止所有任务的 cancel；取消必须撤销队列、结算对应 Promise，迟到 bestmove 不得重启。

### R06 [P2] 合法终局被当成 Stockfish 故障，最后将死步丢失评分

位置：[engine/stockfish-inbrowser.js](/Volumes/AI/coding/simoextension/engine/stockfish-inbrowser.js:532)。

合法终局没有 bestmove；真实 SF 返回 info depth0 score mate0 / bestmove(none)，包装器却直接转 null。一步将死复盘因此抛失败率过高(1/2)；Fool’s Mate 的最后 Qh4# 为 severity unknown、accuracy null、evalAfter ?，黑方覆盖率只有50%。

证据与边界：使用当前包内真实 SF19 Lite WASM、实际包装器和 GameAnalyzer；Maia 空预测仅用于隔离本缺陷，无网络/平台。 见 [terminal-evaluation-repro.json](/Volumes/AI/coding/simoextension/artifacts/review-2026-10-15/terminal-evaluation-repro.json)。

修复方向：用规则终局或明确 terminal result 区分合法无着与引擎失败，保留将死/逼和评分，并覆盖一步将死和正常整局的末步。

### R07 [P2] 合法带注释 PGN 会被错误截断

位置：[engine/game-analyzer.js](/Volumes/AI/coding/simoextension/engine/game-analyzer.js:52)。

非嵌套正则不能正确移除递归变例，且未处理分号行注释。`1.e4 (1.d4 d5 (1...Nf6) 2.c4) e5 2.Nf3 Nc6` 会留下 c4)；带分号注释又把注释词当 SAN。复现的合法主线只回放1个半回合。

证据与边界：实际解析器与规则回放；测试文本中的走法数字在复现脚本中使用标准空格，不依赖非标准格式。 见 [engine-reproductions.json](/Volumes/AI/coding/simoextension/artifacts/review-2026-10-15/engine-reproductions.json)。

修复方向：按 PGN 词法与括号深度处理变例和注释，保留真实主线，错误提示应指出无法解析的位置。

### R08 [P2] 带 Lichess Site 头的本地 PGN 被误当成网址下载

位置：[analysis/analysis.js](/Volumes/AI/coding/simoextension/analysis/analysis.js:640)。

URL 检测在识别 PGN 之前，且匹配整段输入任意位置。合法已完赛 PGN 的 `[Site "https://lichess.org/AbCd1234"]` 触发网络导出；在离线/503 时返回 false，本地完整棋谱没有载入。在线也可能取远端内容覆盖本地编辑。

证据与边界：真实 Chrome + 实际 app/smartLoadInput/PGN 解析；仅替换网络响应并禁止不相关引擎计算。观察 fetch 1次、accepted=false、moves=0。 见 [input-repros.json](/Volumes/AI/coding/simoextension/artifacts/review-2026-10-15/input-repros.json)。

修复方向：优先识别完整 FEN/PGN；URL 导入应只接受整条 URL 或明确游戏ID，不扫描 PGN 头作为导入命令。

### R09 [P2] 较早的网络导入会覆盖用户后来的选择

位置：[analysis/analysis.js](/Volumes/AI/coding/simoextension/analysis/analysis.js:645)。

smartLoadInput 的 await fetch/json 没有导入序号或取消信号。先开始远端 A，再载入本地 B，A 稍后返回仍执行 659 的 startNewSession。复现中 Latest local game 被 Older remote game 覆盖，moves从 d4/d5 变回 e4/e5。

证据与边界：真实 Chrome + 实际导入/会话源码，模拟网络延迟并停用无关引擎；该行为不依赖平台当前响应格式变化。 见 [input-repros.json](/Volumes/AI/coding/simoextension/artifacts/review-2026-10-15/input-repros.json)。

修复方向：在开始每次导入时递增 intent 序号并中止旧请求，每个异步边界后核对当前意图再更新会话。

### R10 [P2] PWA 首访后的首次离线重载完全无法初始化

位置：[analysis/sw.js](/Volumes/AI/coding/simoextension/analysis/sw.js:9)。

analysis.js 首行静态依赖 scan-authorization.js，预缓存清单却未包含它。首次加载时尚无 SW 接管，安装也不会递归补齐模块；离线重载无法加载该必需依赖，棋盘和 app 都不创建。

证据与边界：全新真实 Chrome context；首访成功，等待 SW ready+controller，断网重载后 app=false、boardSquares=0，scan-authorization.js net::ERR_FAILED。服务端采用当前 Cloudflare 配置相同的 no-store 策略，主评审独立复跑确认。 见 [pwa-offline-evidence.json](/Volumes/AI/coding/simoextension/artifacts/review-2026-10-15/pwa-offline-evidence.json)。

修复方向：缓存完整入口依赖图和 worker 入口；将首次安装后首次离线重载作为真实浏览器门禁，而非只检查 sw 文件字符串。

### R11 [P2] 进行中棋谱的缓存会阻碍完赛后立即导入

位置：[functions/api/chesscom.js](/Volumes/AI/coding/simoextension/functions/api/chesscom.js:62)。

代理对包括 isFinished:false/status:playing 的所有200响应设置 public,max-age=3600；SW 只绕过外部平台域名，自己的 /api/chesscom 落入静态 Cache-First。结束后再次导入仍读到旧 playing，继续被保护拒绝。

证据与边界：真实 Chrome + 原始 API handler 与 SW，模拟上游由 playing 切换 finished；连续3次请求仍读 playing，上游调用数=1，Cache Storage 确有API URL。没有由此提供实时辅助，问题是完赛后误锁。 见 [chesscom-cache-evidence.json](/Volumes/AI/coding/simoextension/artifacts/review-2026-10-15/chesscom-cache-evidence.json)。

修复方向：未明确完赛的数据不得长期缓存；SW 绕过同源动态 /api/；对已完赛数据单独制定缓存策略。

### R12 [P2] 旧复盘的延迟缓存命中污染新任务运行状态

位置：[engine/game-analyzer.js](/Volumes/AI/coding/simoextension/engine/game-analyzer.js:792)。

getCachedReview await 返回后没有核对 runId。A等待缓存时被取消，B开始实际计算，A迟到缓存仍写 lastReviewResult 并把 isAnalyzing 设 false，虽然B仍在搜索。PositionAnalysis依赖此字段协调前台与整局计算，任务所有权因此失真。

证据与边界：实际 GameAnalyzer 与 chrome.storage 回调路径，可控存储延迟/引擎；before=true，旧缓存回调后=false，旧结果成为lastReviewResult。Studio上层epoch能挡部分结果展示，不能修复此状态污染。 见 [cache-race-repro.json](/Volumes/AI/coding/simoextension/artifacts/review-2026-10-15/cache-race-repro.json)。

修复方向：读取缓存后核对 runId 和取消状态；只有当前任务能修改全局运行状态、进度或 lastReviewResult。

### R13 [P2] 坏模型缓存无法通过普通重试自愈

位置：[engine/maia-inbrowser.js](/Volumes/AI/coding/simoextension/engine/maia-inbrowser.js:60)。

任意>1MB缓存先被采用；后续格式校验失败仅清initPromise，不删除该key也不重下。两次重试和新实例都重复 Invalid Maia-3 binary magic header，fetches=0。

证据与边界：实际协调器的缓存故障注入已复跑；另外用全新真实Chrome IndexedDB保存1000001字节坏数据，使用未修改ModelCache和loader，连续新实例加载仍失败且不触网。坏值为人工植入，不声称正常下载一定产生损坏。 见 [corrupt-model-indexeddb.json](/Volumes/AI/coding/simoextension/artifacts/review-2026-10-15/corrupt-model-indexeddb.json)。

修复方向：校验失败时删除当前来源缓存，受控地重新下载一次；继续失败应展示明确错误，避免永久读取同一坏值。

### R14 [P2] 发布验证仍读取旧包，浏览器门禁与当前产品脱节

位置：[scripts/test_user_entries.mjs](/Volumes/AI/coding/simoextension/scripts/test_user_entries.mjs:14)。

test_user_entries/test_preferences_sync/test_native_popup硬编码v1.0.8.zip，而当前package生成v1.1.4。原始test_review_ui在90行因旧文案Review settings失败；只切到当前ZIP的preferences测试又因新的独立设置页而点击隐藏summary超时。CI仅跑默认Node测试/build/package，漏掉这些失败的浏览器路径。

证据与边界：静态核对3个旧包引用和verify.yml；原始review_ui真实执行失败。评审只在artifacts副本更新包名/设置页导航/当前文案，验证时明确记为适配后的附加检查，不冒称原始套件全通过。 见 [preferences-current.log](/Volumes/AI/coding/simoextension/artifacts/review-2026-10-15/preferences-current.log)。

修复方向：所有验收脚本从manifest读取版本，并针对当前UI更新；把关键真实打包扩展、生命周期、首次离线和终局评分测试纳入可复现发布门禁。

### R15 [P3] 导入新棋局未停止上一局自动播放

位置：[analysis/analysis.js](/Volumes/AI/coding/simoextension/analysis/analysis.js:1039)。

startNewSession重置棋局与分析任务却不停止playTimer/isPlaying。上一局播放中导入下一局，导入时ply=0，1300ms后新局自动跳到ply1。用户的新会话意图被旧计时器继续驱动。

证据与边界：真实Chrome/实际会话与播放计时器；无引擎或网络依赖。 见 [input-repros.json](/Volumes/AI/coding/simoextension/artifacts/review-2026-10-15/input-repros.json)。

修复方向：在接受新会话时停止自动播放并恢复播放按钮。

### R16 [P3] 单次 sandbox token 可并发消费两次

位置：[background.js](/Volumes/AI/coding/simoextension/background.js:163)。

持久化token读取与删除跨异步步骤，没有原子消费或串行化。真实background handler +异步storage.session适配器同时验证同一个持久化token，两次均ok:true；顺序重放才被拒绝。

证据与边界：真实handler的VM复现，未建立网页越权利用链，也不宣称能绕过公平竞技。现有安全测试主要重写Map逻辑，没有执行该异步消费实现。 见 [sandbox-token-race-evidence.json](/Volumes/AI/coding/simoextension/artifacts/review-2026-10-15/sandbox-token-race-evidence.json)。

修复方向：串行化签发/消费操作并绑定请求上下文，使用真实handler测试并发消费。

## 条件性问题与覆盖缺口

- **C01 可见的第二个认输控件被忽略**：[content/fair-play-guard.js](/Volumes/AI/coding/simoextension/content/fair-play-guard.js:76) 只查首个匹配元素。DOM中先hidden resign、再visible resign且残留终局符时，实际guard仍解锁。fixture已复现；尚未证明当前真实Chess.com必然产生这个组合，故单独列出。应使用全部匹配控件的可见性检查，同类abort/draw/Lichess查询一并覆盖。证据：[fairplay-reproductions.json](/Volumes/AI/coding/simoextension/artifacts/review-2026-10-15/fairplay-reproductions.json)。
- **C02 初始URL FEN覆盖后续棋盘变化**：[content/board-detector.js](/Volumes/AI/coding/simoextension/content/board-detector.js:315) 在没有可回放选中历史时直接返回URL FEN。fixture里白王a1移到b1而URL不变，extractFen仍为a1。需要真实Chess.com/Lichess自定义FEN分析页导航验收后确定用户触发范围。证据同上。
- **官方baseline证据不足**：[scripts/verify_official_baseline.py](/Volumes/AI/coding/simoextension/scripts/verify_official_baseline.py:77) 定义项目自写PyTorchMaia3Runner，并没有导入固定上游模型/预处理；当前Python还遗漏JS的final transformer.norm，输出差异后也未设失败阈值。当前真实模型下载/推理成功不能提升为官方数值一致性、等级校准或人类预测效果已验证。本次未以该脚本输出宣称通过官方独立对照。

## 验证结果与正面证据

| 层次 | 结果 | 证据边界 |
|---|---|---|
| 默认npm test | 通过，含fair-play 24/24、真实DOM生命周期、缓存/安全、vision像素金样/哈希、来源锁定、worker取消 | Node/JSDOM与部分真实WASM；不是全部浏览器验收 |
| build/package | 通过 | 当前ZIP生成，无部署动作 |
| 额外Node脚本 | game_analyzer、foreground_cancel、preference_boundary、intuition_divergence、pwa_multisource、inbrowser通过 | inbrowser使用真实5M字节；PWA旧测试只检查静态结构，实际离线仍失败 |
| 互动分析台 | study_interactions通过；review_ui原始失败，单处当前文案适配副本通过 | 真实SF；Maia可控fixture，涵盖键盘/拖放/分支/升变/独立渲染/响应宽度 |
| 实际扩展action弹窗 | scan_browser、scan_crop、scan_timeline通过 | 当前ZIP，真实截图/DPR2、本地识别WASM、SF MultiPV3、编辑/撤销/翻转/双语设置、图片替换撤销；X/论坛为路由fixture |
| DOM扫描→网页交接 | scan_handoff通过，普通来源live转换stop/clear记录9ms | 当前打包扩展与fixture；不是所有真实站点150ms最坏延迟保证 |
| 布局 | floating_layout通过，light/dark×zh/en×多尺寸，截图已目视检查 | 组件fixture；未覆盖所有宿主广告/CSS组合 |
| 真实扩展Maia | 5M/23M/79M下载、包内Worker推理通过，5M目录前缀缓存复用通过 | [real-packaged-models.log](/Volumes/AI/coding/simoextension/artifacts/review-2026-10-15/real-packaged-models.log)；冷加载约8.5/25.7/35.2秒，包含当时网络环境，非性能承诺 |
| 真实网页引擎 | SF19 Lite+Maia5M；SF19 Standard+Maia79M：MultiPV3、短局整局复盘、缓存复用通过 | [real-web-standard-79m.log](/Volumes/AI/coding/simoextension/artifacts/review-2026-10-15/real-web-standard-79m.log)；本地服务+真实CDN字节，不代表手机/弱网/官方基线通过 |
| 规则独立对照 | python-chess 1.11.2，seed42，2971局面/90103合法着法，UCI/SAN零差异 | [chess-core-reference-check.json](/Volumes/AI/coding/simoextension/artifacts/review-2026-10-15/chess-core-reference-check.json)；随机抽样，不是穷尽证明 |
| 公共部署文本核对 | 10个公开文本资源中9个原始字节与本地一致；privacy差异仅Cloudflare邮箱混淆转换 | [production-source-comparison.json](/Volumes/AI/coding/simoextension/artifacts/review-2026-10-15/production-source-comparison.json)；不包含Cloudflare发布ID、后台日志和账号验收 |

旧preferences测试只切换当前ZIP仍在隐藏summary处超时，记录于 [preferences-current.log](/Volumes/AI/coding/simoextension/artifacts/review-2026-10-15/preferences-current.log)。进一步仅在证据副本补充当前设置页导航，结果记录于 [preferences-current-navigation.log](/Volumes/AI/coding/simoextension/artifacts/review-2026-10-15/preferences-current-navigation.log)；不改产品和原测试。

模型与发布约束：当前Git跟踪中无Maia大权重，无>25MiB跟踪资产；models仅包含规定轻量识别资产。运行时最大跟踪文件为lib/stockfish.wasm，1787571字节。当前ZIP解压总量3662486字节/118文件；大模型依赖CDN和IndexedDB，未放入包。第三方声明中的5项本地binary/glue哈希相符。manifest长期权限限于棋类平台与第一方CDN/工作台，一般网页依赖activeTab；扫描运行路径未发现截图上传调用。以上是源码/字节核对，不等同商店政策或法律鉴定。

## 建议修复与再验收顺序

1. R01/R02/R03：终局证据、严格导入验证、取消后禁止新搜索；补充现有guard入口、所有异步续体和实际队列的回归，不能通过跳过guard来修复。
2. R04-R13：Worker异常结算、取消队列、终局评分、PGN/导入意图、PWA/API与缓存恢复。对每项复现先保留失败用例，再修复产品。
3. R14：先让验收消费当前manifest版本、当前界面和真实模块，再用它们评价交付。R15/R16与C01/C02安排专项。
4. 使用真实允许页面和完赛棋局验收；完整覆盖大厅→进行中→结算→关弹窗→刷新→再开局。计时/CPU/无箭头/无候选同时取证。任何进行中平台页面都只检查锁定、停止和清空，不能启动分析验证。

未完成的验收范围：个人账号页面、所有站点实际DOM变体、长时间MV3休眠/恢复、移动端Safari/Chrome、弱网中断与存储压力、所有动态广告供应商、真正上游Maia数值基线和预测质量。没有把这些未验收范围算成确认bug，也没有把本地通过结果替代它们。

## 证据使用

主要复现脚本、JSON、截图及日志均在 [本地评审证据目录](/Volumes/AI/coding/simoextension/artifacts/review-2026-10-15)。该目录受.gitignore忽略；如需代码库长期保存，可在修复时把针对性用例迁入scripts。主评审独立复跑了fairplay、engine、terminal、cache-race、bad-cache、sandbox-token、PWA和API-cache证据，未只依赖子评审的完成报告。

Lichess DOM结构的上游核对来源：[game/side.scala](https://github.com/lichess-org/lila/blob/master/app/views/game/side.scala)、[round/view/table.ts](https://github.com/lichess-org/lila/blob/master/ui/round/src/view/table.ts)。这些用于支持fixture的结构依据，不代表已访问真实进行中账号或穷尽站点部署版本。
