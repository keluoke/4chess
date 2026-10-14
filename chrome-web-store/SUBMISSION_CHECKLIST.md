# 1.1.4 商店提交说明

使用 `npm run package` 生成的 `releases/diverge-extension-v1.1.4.zip`，直接上传 ZIP；不要上传整个源码文件夹或重新套一层目录。本次同步扩展元数据、双语商品介绍和网页棋图分析的产品定位。详细说明分别使用 `listing-en.txt` 与 `listing-zh-CN.txt`；标题、摘要见 `STORE_LISTING.md`。

- 根目录只有一个 manifest.json，MV3 / 1.1.4，原生 popup 与本地 Worker / WASM；包约 2 MiB。
- Maia 5M / 23M / 79M 权重仅从 CDN 加载，作为固定本地推理实现的数值数据；不包含下载执行的 JS / WASM。SF19 标准版仅在独立网页运行，扩展强制使用 Lite。
- 轻量识别资产随包：chess-cnn.wasm、chessimg2pos_weights.bin、chessimg2pos_manifest.json；大权重不入包。
- 公开隐私政策填写 https://4chess.cc/privacy/ 。数据声明必须说明局面、记谱、公开玩家标签、本地复盘缓存和 UI 设置同步；不能声称一切关闭页面即删除，也不能声称所有网络请求都不涉及公开棋局数据。
- storage：保存设置和复盘缓存；activeTab：用户主动扫描时临时读取并截取当前允许的页面；scripting：注入来源安全检查及变化观察器；offscreen：在本地 Worker 解码截图、定位与识别棋盘；Chess.com / Lichess 访问权限：读取棋盘、终局证据和公开棋谱；weights.4chess.cc：下载数值权重；4chess.cc：用户触发的网页复盘与白名单偏好连接。
- popup 与悬浮窗的 SF 选择项标为“网页版复盘引擎”，只影响网页；悬浮窗固定 SF19 Lite，底部显示实际运行状态。
- 维护者 keluoke；项目与第三方署名、LICENSE / THIRD_PARTY_NOTICES / LICENSES 随安装包分发。保留公开源码链接 https://github.com/keluoke/4chess 。
- listing、截图、单一用途、权限理由、数据处理声明与审核说明仍须在开发者后台填写；有效 ZIP 不代表自动通过审核。不要使用“秒过审”承诺。

## 可填入审核说明的英文内容

Diverge provides local chess study and post-game review using packaged Stockfish Lite WASM and a packaged JavaScript Maia inference implementation. Remote .bin files contain numeric weights and metadata only; they do not contain executable JS or WASM. The full SF19 executable is web-studio-only and is not downloaded or executed by the extension. To test scanning, open a webpage with a visible static chess diagram and click Scan page. Confirm the position to get interactive SF19 Lite lines, then use Explore engine vs intuition to open the current FEN in the first-party studio. For platform review, open a permitted analysis board or completed game. Choose Maia 5M for a smaller first download. Confirm candidate moves and model status. Active games automatically disable inference, arrows and heatmaps. Preferences can be synchronized with the first-party web studio in the same Chrome profile; game data is not transmitted by the preferences bridge. No account or payment is required.

Publishing instructions: https://developer.chrome.com/docs/webstore/publish/
MV3 policy: https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements

## 单一用途与数据披露

单一用途（English）：

Chess study through comparison of machine engine evaluation and human move predictions, using webpage diagram scanning, analysis boards and completed-game review. Active games are excluded.

单一用途（简体中文）：

通过网页静态棋图扫描、分析台及完赛棋局复盘，对比机器引擎评价与人类走法预测，服务于国际象棋学习；排除正在进行的对局。

权限理由（English，分别填入对应字段）：

- storage: Saves preferences, local review caches and temporary scan-session state. Whitelisted UI preferences are shared with the first-party studio in the same browser profile.
- activeTab: Temporary access to inspect and capture visible static diagram images when the user explicitly clicks Scan page. No permanent all-site access.
- scripting: Injects source safety checks and observes changes on the selected source; active games and unknown interactive sources remain locked.
- offscreen: Hosts local image decoding and a packaged recognition worker. Screenshots are not uploaded.
- Chess.com / Lichess hosts: Reads permitted boards, notation and game-state evidence, and fetches user-requested public game data.
- weights.4chess.cc: Downloads numeric model weights for local inference and caching.
- 4chess.cc: User-requested game/position analysis and whitelisted UI preference synchronization.

Website Content 数据披露（English）：

Diverge reads permitted board positions, notation and game-state evidence, and temporarily captures visible static images when the user invokes Scan. Recognition and inference run locally; screenshots are not uploaded. Preferences and caches can remain on the device. Opening the first-party studio passes the selected FEN or game in the browser, and public game imports contact the chess platform or the open-source edge proxy. See the privacy policy for retention and network details. Active games lock analysis.

后台商品详情的保存 / 提交与本地文件更新是不同步骤；检查 English 与简体中文两项均使用当前文案。
