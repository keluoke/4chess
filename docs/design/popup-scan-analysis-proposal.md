# Popup 扫描与互动分析植入方案

状态：1.1.0 已实施；验收与发布证据见 docs/scan-delivery-1.1.0.md。下文保留设计决策，实际范围以交付记录为准。

推荐做成本地的“扫描 → 校正 / 确认 → 互动棋盘 + SF 分支”工作流。复用棋盘识别底座、现有棋子与交互棋盘、SF19 Lite 和公平竞技守卫。参考 Chessvision 的扫描入口、选区、方向 / 行棋方调整与识别纠错流程，使用本项目自己的棋盘及引擎。

## 已有资源与实际缺口

- 本项目已有 `lib/vision/{recognizer-core,web-adapter,vision-worker,protocol,...}.js`，以及 `models/chess-cnn.wasm`（6,349 字节）、`chessimg2pos_weights.bin`（620,852 字节）和校验清单。轻量资产已随包，接入扫描不需要首次下载大识别模型。
- `chesspuzzle/services/vision/core/recognizer-core.js` 比扩展版本新：包含 quad-detector、inner-coordinates、Qimi 样式匹配、截图定位路径与走法箭头证据等依赖；扩展版本未包含其中部分模块。
- 邻项目 `scripts/sync-vision-to-extension.cjs` 仍是较旧的同步清单，且输出 `models/manifest.json`，会与本项目的新文件名及重复 manifest 防线冲突。不能直接运行旧脚本覆盖现有 ESM / WebAdapter 的路径修复；先补齐依赖、修正转换与清单文件名，再用同一批图片做回归。
- 当前 `test_vision_extension.mjs` 验证资产、模块导入和局面规则，并没有证明“当前页面截图 → 正确定位 → 正确 FEN → popup 分析”的完整体验。

## 产品流程

1. 首页增加“扫描当前页面 / Scan page”主入口，保留“全盘分析”、使用指南和 icon 设置。Scan 的下拉菜单包含“当前可见区域”和“选择区域”。不自动随页面变化不断截图。
2. 先确认源页面是允许的分析、练习、学习或已完赛场景。正在对局或不能确认安全的交互棋局页面保持保护锁。
3. 对受支持的 Chess.com / Lichess 合法分析棋盘，优先取得可验证的 DOM FEN；其他已明确允许的静态学习棋图，走截图识别。界面区分“读取棋盘”和“识别图像”，避免把 DOM 取值宣传成识别准确率。
4. 定位后直接展示棋盘预览，标出可疑格；提供方向、白 / 黑行棋和“修正棋子”入口。几何定位差、方向冲突、非法局面不启动分析。
5. 确认完整局面后启动 SF19 Lite，展示白方视角评分和最多三条紧凑分支。点击 / 拖动合法走法建立个人分支，单步回退、回到扫描原局面、翻转及重新扫描可用。升变与易位遵守已确认的局面信息。
6. “复制 FEN”和“打开网页版深入分析”放在棋盘操作区；有标准版偏好时交给网页使用。插件扫描分析仍明确显示 SF19 Lite。

单张图片只能识别棋子分布，不能可靠恢复完整棋局状态。行棋方不能默认当成已确认；易位权、吃过路兵、50 步计数等未知字段要保留“假定”状态，可在修正区修改。图像默认无易位 / 无吃过路兵并明确提示，不能因为王车在原位就自动授予易位权。SF 的结果针对用户确认的分析 FEN，而非声称恢复了完整实战历史。

## Popup 布局

约 368 × 600 的原生 popup，棋盘约 300 px；扫描成功后切到分析视图，原首页宣传与偏好区收进设置，不把棋盘追加到原长页面的底部。

```text
Diverge              重新扫描   设置
方向 / 行棋方 / 修正状态
[优劣条] [互动棋盘约 300 px]
翻转   退一步   原局面   复制 FEN
SF19 Lite · 计算中 / 深度与状态
+0.32  1. e4 c5 2. Nf3 …
+0.18  1. d4 Nf6 2. c4 …
+0.12  1. Nf3 d5 2. d4 …
打开网页版深入分析 ↗
```

保留原棋子、导航与声音 icon；评分仍是白方视角。扫描的待确认状态不显示评分 / 分支。多图时优先提供截图预览中的选区；目前识别 API 返回一个主要定位结果，若要展示全部候选棋盘，必须另做多候选定位，不能只接一个按钮就承诺自动找全。

首期扫描只启动 SF19 Lite。Maia 对比作为后续按需功能，复用已保存的型号 / Elo；不会因为 Scan 自动触发 79M 下载。设置统一说明“插件分析使用 Lite，SF 标准版偏好用于网页版”。所有状态、错误与操作中英文齐全，浅 / 深色共享现有主题。

## 技术接入

- `popup/scan-view.js`：扫描 / 校正 / 分析状态视图。
- `popup/scan-analysis.js`：复用 BoardUI、ChessBoard 和 StockfishInBrowser 的局面协调器；每次确认、走棋、撤销都更新请求编号，取消旧搜索并拒绝迟到结果。
- `background.js` / 独立 scan-controller：源 tab 与 document 身份、截图、准入判定和短期任务状态。
- 扩展 offscreen 文档 + `lib/vision/vision-worker.js`：解码、定位和分类，避免依赖 popup 持续打开，避免把长计算塞进会休眠的 service worker。
- `chrome.storage.session`：只保存 taskId、源 tab/document、待确认 FEN、方向 / 行棋方证据、校正与分支状态；原始整页截图仅临时在内存处理，任务结束释放，不默认持久保存或上传。
- 截图坐标按实际截图像素 / CSS 视口比例换算，覆盖 DPR、浏览器缩放、裁切和 iframe 的位置差异。截图时短暂隐藏本插件浮层，完成或失败都恢复。

原生 popup 点击页面后会关闭，因此框选不能只由 popup JS 维持。推荐首期在 popup 的截图预览中框选；如增加直接页面框选，由背景协调选区与 offscreen 任务，完成后重开 / 恢复结果，受支持版本不能自动重开时显示“扫描完成，请点扩展查看”。popup 关闭时停止 SF 搜索；重开前重新验证源页面，再恢复轻量状态。

现有 activeTab 可用于用户主动触发的当前可见区域截图。页面选区和准入检查需要评估增加 scripting；后台识别宿主使用 offscreen / WORKERS，增加对应权限并写明用途。没有必要为扫描加入永久全站内容脚本。首次仅支持已可检查的安全页面；内置浏览器页、无法检查的跨源交互棋局和无明确许可证据的页面提示不支持，不默认放行。

## 公平竞技绑定

`FairPlayGuard.isLiveGameInProgress()` 必须在源网页上下文检查，不能在 popup / background 中调用后把返回 false 当作源棋局安全证据。识别后的独立棋盘继续绑定源页面：比赛开始、导航切换、页面身份不匹配或守卫证据失效，立即停止 SF、清空分支与评分，锁定分析。源页面观察器把状态推送给 popup；验收必须覆盖开始新局后的 150ms 上锁要求。

静态学习图片的来源准入需要单独明确；未知网站不能只因为原守卫不认识其 hostname 就被认为安全，也不能用一个“用于学习”勾选项绕过未知棋局锁定。不改动或绕过原守卫。

## 建议交付顺序与验收

第一步对齐识别模块和移植测试；第二步接通可见区域 Scan、确认 / 纠错、本地互动棋盘与 SF 三分支；第三步补选区、恢复、失败处理和更多受控静态内容。首个可发布版本至少包含多图时能手动选区，不承诺定位所有图或对照片 / 视频都稳定。

验收分开记录：图像定位与整盘识别正确率、方向 / 行棋方、完整 FEN 假定信息、用户校正负担、真实 Scan 至首次 SF 分支耗时。使用同一批原始像素检查跨项目一致性；测试不同棋子样式 / 背景 / 标记箭头、多个棋盘、Retina / 缩放、无棋盘、方向颠倒、非法局面、popup 关闭 / 重开、源页导航、后台休眠及实时对局锁定。现有 Node 模块测试不能替代实际 chrome.action 原生 popup 验收，不以旧小程序测试数据声称优于 Chessvision。

## 官方参考

- Chessvision 扫描、确认方向 / 行棋方与 Edit 流程：https://chessvision.ai/docs/browser-extension/tutorial/
- Chessvision 选区及嵌入棋盘限制：https://chessvision.ai/docs/browser-extension/faq/
- Chrome 当前可见区域截图：https://developer.chrome.com/docs/extensions/reference/api/tabs#method-captureVisibleTab
- Popup 失焦关闭：https://developer.chrome.com/docs/extensions/develop/ui/add-popup
- Offscreen 文档与 Workers：https://developer.chrome.com/docs/extensions/reference/api/offscreen

## 补充：两个项目的同步机制

推荐把识别核心作为单一来源发布，而不是在两套目录里分别编辑。短期以 chesspuzzle 的平台无关 core 为源，扩展版本由构建脚本生成；长期整理为可同时输出 CJS / ESM 的 `@4chess/vision-core` 包。小程序的 wx / 原生推理适配器和扩展的截图 / Worker / WebAdapter 分开维护，通过同一接口调用核心。

两个项目记录不可变的版本锁：coreVersion、sourceCommit / sourceTreeHash、构建工具版本、模型与资源 SHA-256、识别协议版本。同步命令分 check / build / verify，check 只报告差异；build 使用明确文件与依赖清单，不通过正则猜测所有 CJS 结构；verify 校验产物、资源与输出协议。扩展自己的 WebAdapter 路径、Worker 生命周期及 `chessimg2pos_manifest.json` 文件名不能被旧生成模板覆盖。

共享核心发版后同步更新两个项目的版本锁，分别跑适配器测试、浏览器 / 小程序运行测试，再跑共同的原始像素样本：定位、整盘棋子、方向、行棋方、可疑格与 FEN 假定字段。CI 拦截生成文件被直接修改、版本 / 模型 hash 不符、缺失依赖或样本回归。核心相同不等于不同推理后端数值必然逐位相同；标记误差与疑似格变化，不能只比较模块导入是否成功。

代码与模型可保证受控同步，但已安装的旧 Chrome 扩展 / 已发布的小程序不会同时自动升级。每次发布保留两端版本矩阵，不把只有一端更新标为完成；诊断信息显示实际核心与模型版本，便于追踪用户现场。

## 补充：扫描后打开 4chess 的局面

主入口使用同一个 `https://4chess.cc/analysis/`，按钮文案推荐“在 4chess 深入分析 / Analyze on 4chess”。以点击时 popup 的当前已确认 FEN 为准，包含棋子校正和用户探索的分支；初始扫描后尚未走棋时就是扫描局面。方向只是视图信息，不改变 FEN 行棋方或白方评分含义。

局面链接协议（1.1.0 已实现，扫描入口额外带 source-bound scan token）：

```text
https://4chess.cc/analysis/?sf=standard&maia=5m&lang=zh#fen=<URL编码后的当前FEN>&orientation=white&mode=position
```

SF / Maia / Elo / 语言采用已保存偏好；标准版用于网页，popup 本地扫描保持 Lite。棋局内容使用 URL 片段交接，截图不随链接传递。Scan 来源的交接另外绑定源 tab / document 与有效许可，网页不能因为换了地址就脱离原公平竞技约束。

现有网页 `smartLoadInput()` / `startNewSession({fen, autoReview:false})` 已支持手工 FEN 单局面分析，但 `loadInitialGame()` 的 URL 解析目前只有 pgn / url / 部分 text 用法，没有直接读取 fen 参数，也没有 mode=position 的完整交接状态。这一段必须在植入 Scan 时补齐，不能现在就把上述链接作为已生效功能交付。

网页接入单局面后进入“局面分析”状态，显示互动棋盘、SF / Maia 候选和个人分支；没有完整棋谱时，不生成整局精度、整局走势图或妙手 / 俗手统计。若以后同时取得合法完整 PGN，可以另提供整局复盘入口，不能从一张图片虚构整盘走法。
