# Diverge 1.1.10：全盘分析继承来源棋盘视角（2026-11-10）

## 行为

用户在 Chess.com 或 Lichess 点击“全盘分析”时，插件同步读取当前棋盘 DOM 的方向，并在异步提取棋谱前固定此值：白方朝下进入白方视角，黑方朝下进入黑方视角。用户刚翻转即点击，或提取棋谱期间再次翻转，都以点击那一刻为准。

完整 PGN、当前 FEN、网页工作台和扩展内工作台均携带方向。工作台接受 URL 的显式视角，旧式仅从扩展存储读取棋谱时也会读取棋谱附带视角；均支持 white/black 两个值。没有来源方向的普通导入继续使用原有偏好。设置中的方向选择与棋盘保持一致，进入后仍可自由翻转。

方向表示显示视角，不据此判断用户实际执黑或执白，不改变 PGN 棋手、棋谱走法、FEN 行棋方、分析结果或公平竞技规则。

## 修复链路

- `content/main-module.js`：点击后、提取前调用现有棋盘检测器同步读取方向，避免依赖防抖后才更新的局面缓存；统一附加到分析跳转数据。
- `background.js`：完整棋谱和 FEN 的网页/扩展跳转都传递经白名单验证的方向；原先只有 FEN 跳转带方向。
- `analysis/analysis.js`：在处理任意 URL 输入前应用显式方向；扩展存储棋谱回退也支持附带方向。
- 更新 PWA 缓存版本；Manifest、package 与 lockfile 同步为 1.1.10，保留此前交付的 1.1.9 ZIP。

## 验证

- `npm test`：项目回归。
- `npm run test:floating-handoff`：当前版本商店包实际加载在 Chromium 中，验证网页与扩展工作台的 FEN/完整 PGN、黑白方向覆盖旧偏好、仅扩展存储启动，以及 Chess.com/Lichess 受控页面中实际点击按钮后的方向。测试特意在点击后、PGN 提取完成前再次翻转，确认保持点击瞬间的方向。测试使用合成棋谱，不加载生产 Maia 权重。
- `npm run build`、`npm run test:browser`：站点构建、离线入口与扩展安全状态回归。
- `npm run package`、`node scripts/test_package_integrity.mjs`：商店包文件与 Load unpacked 逐字节一致，无大型模型和本地功能。
- CI 增加工作台交接浏览器测试，防止视角传递再次退化。

交付文件为 `releases/diverge-extension-v1.1.10.zip`，同名 JSON 记录最终干净 Git 提交与 SHA-256。由用户自行提交商店；未将受控页面测试当作真实网站账号验收、商店审核或生产发布结论。
