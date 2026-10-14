# 1.1.1 商店提交说明

使用 `npm run package` 生成的 `releases/diverge-extension-v1.1.1.zip`，直接上传 ZIP；不要上传整个源码文件夹或重新套一层目录。旧 1.0.6 的目录前缀处理存在缺陷，本次提审使用修复版。

- 根目录只有一个 manifest.json，MV3 / 1.1.1，原生 popup 与本地 Worker / WASM；包约 2 MiB。
- Maia 5M / 23M / 79M 权重仅从 CDN 加载，作为固定本地推理实现的数值数据；不包含下载执行的 JS / WASM。SF19 标准版仅在独立网页运行，扩展强制使用 Lite。
- 轻量识别资产随包：chess-cnn.wasm、chessimg2pos_weights.bin、chessimg2pos_manifest.json；大权重不入包。
- 公开隐私政策填写 https://4chess.cc/privacy/ 。数据声明必须说明局面、记谱、公开玩家标签、本地复盘缓存和 UI 设置同步；不能声称一切关闭页面即删除，也不能声称所有网络请求都不涉及公开棋局数据。
- storage：保存设置和复盘缓存；activeTab：用户主动扫描时临时读取并截取当前允许的页面；scripting：注入来源安全检查及变化观察器；offscreen：在本地 Worker 解码截图、定位与识别棋盘；Chess.com / Lichess 访问权限：读取棋盘、终局证据和公开棋谱；weights.4chess.cc：下载数值权重；4chess.cc：用户触发的网页复盘与白名单偏好连接。
- popup 与悬浮窗的 SF 选择项标为“网页版复盘引擎”，只影响网页；悬浮窗固定 SF19 Lite，底部显示实际运行状态。
- 维护者 keluoke；项目与第三方署名、LICENSE / THIRD_PARTY_NOTICES / LICENSES 随安装包分发。保留公开源码链接 https://github.com/keluoke/4chess 。
- listing、截图、单一用途、权限理由、数据处理声明与审核说明仍须在开发者后台填写；有效 ZIP 不代表自动通过审核。不要使用“秒过审”承诺。

## 可填入审核说明的英文内容

Diverge provides local chess study and post-game review using packaged Stockfish Lite WASM and a packaged JavaScript Maia inference implementation. Remote .bin files contain numeric weights and metadata only; they do not contain executable JS or WASM. The full SF19 executable is web-studio-only and is not downloaded or executed by the extension. Open a permitted analysis board, choose Maia 5M for the quickest first test and allow its initial download. Confirm candidate moves and model status. Active games automatically disable inference, arrows and heatmaps. Preferences can be synchronized with the first-party web studio in the same Chrome profile; game data is not transmitted by the preferences bridge. No account or payment is required.

Publishing instructions: https://developer.chrome.com/docs/webstore/publish/
MV3 policy: https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements
