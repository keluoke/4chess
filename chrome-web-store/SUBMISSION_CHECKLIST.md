# 1.2.10 商店提交说明

上传 `npm run package` 生成的 `releases/diverge-extension-v1.2.10.zip`。本版使用与棋谜同步的识图核，复用圆角截图恢复和同一组识别样本，并包含新版近期诊断与整盘复盘分享。标题和摘要见 `STORE_LISTING.md`，截图顺序见[英文商店素材](english/README.md)。

- 根目录只有一个 manifest.json，MV3 / 1.2.10，使用原生 popup 与本地 Worker / WASM。
- Maia 5M / 23M / 79M 权重仅从 CDN 加载，作为固定本地推理实现的数值数据；不包含下载执行的 JS / WASM。SF19 标准版仅在独立网页运行，扩展强制使用 Lite。
- 轻量识别资产随包：chess-cnn.wasm、chessimg2pos_weights.bin、chessimg2pos_manifest.json；大权重不入包。
- 公开隐私政策填写 https://4chess.cc/privacy/ 。数据声明必须说明局面、记谱、公开玩家标签、本地复盘缓存和 UI 设置同步；不能声称一切关闭页面即删除，也不能声称所有网络请求都不涉及公开棋局数据。
- storage 保存设置、复盘缓存和用户启用的提醒订阅。activeTab 和 scripting 用于主动扫描及来源校验，offscreen 用于本地截图识别。alarms 每 6 小时检查已授权账号的公开完赛对局元数据。Chess.com 和 Lichess 提供棋盘、终局证据及公开棋谱，weights.4chess.cc 分发数值权重。4chess.cc 工作台负责网页复盘、共享偏好和可选提醒同步。
- popup 与悬浮窗的 SF 选择项标为“网页版复盘引擎”，只影响网页；悬浮窗固定 SF19 Lite，底部显示实际运行状态。
- 维护者 keluoke；项目与第三方署名、LICENSE / THIRD_PARTY_NOTICES / LICENSES 随安装包分发。保留公开源码链接 https://github.com/keluoke/4chess 。
- listing、截图、单一用途、权限理由、数据处理声明与审核说明仍须在开发者后台填写；有效 ZIP 不代表自动通过审核。不要使用“秒过审”承诺。

## 可填入审核说明的英文内容

Diverge provides local chess study and post-game review using packaged Stockfish Lite WASM and a packaged JavaScript Maia inference implementation. Remote .bin files contain numeric weights and metadata only; they do not contain executable JS or WASM. The full SF19 executable is web-studio-only and is not downloaded or executed by the extension. To test scanning, open a webpage with a visible static chess diagram and click Scan page. Confirm the position to get interactive SF19 Lite lines, then use Explore engine vs intuition to open the current FEN in the first-party studio. For platform review, open a permitted analysis board or completed game. Choose Maia 5M for a smaller first download. Confirm candidate moves and model status. Active games automatically disable inference, arrows and heatmaps. Preferences can be synchronized with the first-party web studio in the same Chrome profile; game data is not transmitted by the preferences bridge. No account or payment is required.

To test share cards, open a finished game in the analysis studio and run a review. Open Share card on a key move, then copy the image or download a landscape or portrait PNG. Card generation runs locally. Mistake Bank and Intuition Checkup are available in the web studio at 4chess.cc.

To test reminders, open Player checkup in the web studio, link a public Chess.com or Lichess username and enable extension reminders for the current profile. The extension checks public completed-game metadata approximately every six hours and shows a badge for new games. Open the extension popup and select Open checkup to reach the corresponding profile. Disabling reminders or unlinking the account removes the subscription after sync.

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
- alarms: Schedules optional checks for public completed-game metadata for accounts linked to an opted-in local profile.
- Chess.com / Lichess hosts: Reads permitted boards, notation and game-state evidence, and fetches user-requested public game data.
- weights.4chess.cc: Downloads numeric model weights for local inference and caching.
- 4chess.cc: User-requested analysis, whitelisted preferences and optional checkup reminder synchronization in the same browser.

Website Content 数据披露（English）：

Diverge reads permitted board positions, notation and game-state evidence, and temporarily captures visible static images when the user invokes Scan. Recognition and inference run locally; screenshots are not uploaded. Preferences and caches can remain on the device. Opening the first-party studio passes the selected FEN or game in the browser, and public game imports contact the chess platform or the open-source edge proxy. Optional checkup reminders share linked public usernames, game IDs, timestamps and checkup progress between the studio and extension in the same browser. See the privacy policy for retention and network details. Active games lock analysis.

后台商品详情的保存 / 提交与本地文件更新是不同步骤；检查 English 与简体中文两项均使用当前文案。
