# Scan 1.1.0 交付与验收

日期：2026-10-14。安装包：`releases/diverge-extension-v1.1.0.zip`。网页版入口： https://4chess.cc/analysis/ 。网页与已安装插件分别更新；解压安装包，在 chrome://extensions 重新加载扩展并刷新来源页。

## 已实现

- 原生 popup 的 Scan 主入口；支持 Chess.com / Lichess 守卫允许的分析、学习、习题和已完赛页面，优先 DOM 读取；维基百科静态学习棋图和独立静态图片页走截图识别。未知互动网站与内置浏览器页保持锁定。
- 截图预览中的手动选区与自动定位；按截图实际像素比例处理，兼容 DPR / 缩放。暂时隐藏自身浮层后捕获，并在失败时恢复。无可靠棋盘不进入分析。
- offscreen 文档 + Dedicated Vision Worker 完成本地解码和识别，确认前不启动 SF。截图不上传，不写入持久存储，识别开始或两分钟后释放。任务结果与轻量状态可在 popup 关闭后恢复。
- 展示原始模型棋子标签，保留可疑格标记；方向、行棋方、棋子面板和完整 FEN 可修正。默认无易位 / 无吃过路兵，确认时检查合法性与历史字段的一致性。规则修正不伪装成真实识别。
- SF19 Lite 真正计算最多三条合法分支，统一白方视角，支持点击 / 拖动、四种升变、按局面保存的右键思考箭头、退步、回到扫描原局面、翻转、复制 FEN。原棋子组件与棋盘 CSS 已共享。
- “在 4chess 深入分析”使用当前确认 FEN，包括个人分支；带方向与已保存 SF / Maia / Elo / 语言偏好。只传局面，不传截图。网页版单局面隐藏整局精度、走势和妙手 / 俗手统计。
- 扫描绑定来源 tab / document / nonce。来源出现实时对局、导航或关闭立即撤销；popup 与网页停止引擎、清空候选，锁定会话不能再启动新分析。后台写入检查任务身份与撤销状态，避免旧通知误锁或复活新任务。
- 中英文、浅深主题、新权限理由、指南、隐私声明、chessimg2pos MIT 与 chess.js BSD 署名和完整许可证均已纳入交付。

## 两项目同步

算法单一来源是 chesspuzzle 的平台无关 core，扩展为静态生成产物；无需远程执行代码或发布新的包注册服务。两端锁 `coreVersion=2026.10.14.1`、源树 SHA-256、构建工具版本、协议版本、产物与资产 SHA-256。算法文本原样放入模块工厂；平台适配器、Worker 生命周期与截图 API 单独维护。新增依赖不在清单时构建失败。

- 扩展 `npm run vision:check` 只检查；`npm run vision:sync` 显式重建。
- 邻项目 `node scripts/sync-vision-to-extension.cjs` 默认只检查；`--update` 才同步。旧正则转换和错误 models/manifest.json 输出已替换。
- `node scripts/test_vision_parity.mjs --source` 用同一份棋盘原始像素对照布局、原始 / 修正棋子、方向、行棋方、疑点、验证和 FEN 未知字段。
- CI 验证生成文件、模型字节与独立棋盘金样。CI 环境没有邻项目检出时检查发布锁与金样；跨项目源树对照在本地同步 / 发布前执行。
- 邻项目原有识别算法未改动，适配器依然各自运行；本次不发布新的微信小程序安装版本。已安装旧扩展不会自动获得开发目录的更新，仍需商店或本地更新。

## 当前证据

| 验收 | 结果 / 范围 |
|---|---|
| `npm test` | 公平竞技、真实 DOM 生命周期、安全、候选与白方评分、引擎版本、声音、握手、识别资产、锁与金样、Scan 准入均通过 |
| source / ESM parity | 真实棋盘像素、真实本地 WASM / 权重，布局与结构化识别结果一致 |
| 邻项目识别回归 | core / phase2 / phase3 / Qimi pieces / screenshot arrows 共 24/24 通过 |
| 原生 `test_scan_browser.mjs` | 实际扩展 action popup，DPR 2 截图 → offscreen → 真实识别 → 确认 → 真实 SF 三分支；原生拖棋与右键箭头、翻转、退步、双语；棋盘与候选可在 600px 内看到 |
| 原生 `test_scan_crop.mjs` | 同一截图两个棋盘，原生鼠标框选第二个得到正确 FEN；无棋盘页明确失败，未启动 SF |
| 原生 `test_scan_handoff.mjs` | DOM 读盘、升变到马、关闭 / 重开、当前分支网页交接、单局面 UI；来源新棋钟出现后 5–9ms 停机与清空；锁定后不能启动新会话 |
| 全盘原有交互回归 | `test_study_interactions.mjs` 与 `test_review_ui.mjs` 通过；该复盘 UI 回归的 Maia 使用固定样例，Stockfish 为真实运行 |

原生测试使用 Chrome for Testing 的 action popup 与 CDP 输入，页面是可复现的来源 fixtures；不把这些结果宣称为所有真实网站 DOM、所有棋子主题、照片或手机识别率证明。此版本保留确认 / 校正，定位质量不够时要求重新选区。本次 Scan 不自动下载或运行 Maia，也未重复声称大模型新性能测量。

原生扩展触发测试依据：https://chromedevtools.github.io/devtools-protocol/tot/Extensions/#method-triggerAction 。

## 发布校验

上线版本需核对 GitHub Verify、Cloudflare 生产部署的 commit 与普通 URL 文件 SHA-256；安装包不包含 Maia 大权重或 SF19 标准版运行文件。最终部署记录和包 SHA-256 随交付消息提供。
