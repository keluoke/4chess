# Scan 1.1.1：普通网页静态棋图修复

日期：2026-10-14。安装包：`releases/diverge-extension-v1.1.1.zip`。

1.1.0 的来源准入仅允许 Chess.com/Lichess 安全场景、维基百科及独立图片文档。Twitter/X 信息流与普通文章在识别前就被拒绝，并非已经进入模型后识别失败。

## 本次修复

- 普通网页允许扫描当前可见且已加载的静态图片，包括信息流、论坛与文章。头像等小图不进入扫描范围。支持普通 img，以及同一已加载图片对应的 CSS 背景与透明无障碍 img 组合；不把任意 CSS 或 Canvas 棋盘视作静态图片。
- 普通网页截图在本地 offscreen 遮罩，只保留符合条件的图片区域，再交给预览与识别。多图可手动框选。完整棋图应先滚动到屏幕内；无图、未加载或定位失败分别给出中英文提示。
- 绑定图片节点、地址和显示元素。来源图片替换、移除、进入直播场景，或出现互动棋盘 / 活跃棋钟后撤销分析。未知对局路径、可见 iframe / Canvas 场景保守拒绝。Chess.com/Lichess 仍走原有 FairPlayGuard，未修改或绕过守卫。
- 截图前后重新核对活跃标签与图片矩形，拒绝截错标签或页面移动后的结果。异步遮罩不能覆盖新的扫描任务。
- 无新增永久网站访问权限，无新增权重；跨项目识别核心及版本锁未改动。双语指南、隐私政策与商店说明同步更新。

## 验证

| 验证 | 实测结果 |
|---|---|
| `npm test` | 全部通过，包含图片绑定 / 撤销、未知互动来源拒绝、异步遮罩所有权及原有公平竞技 / 识别金样 |
| `test_scan_timeline.mjs` | Chrome 原生 action popup，DPR 2；X 信息流结构（CSS 背景 + 透明 img）和普通论坛 img；真实截图 / 本地 WASM 识别出完全一致的初始局面，真实 SF19 Lite 返回三分支；页面其他像素遮白；图片替换后清空分析；未知实时对局无截图 / 分析 |
| `test_scan_crop.mjs` | 同一截图中原生鼠标框选第二棋盘，FEN 正确；无棋盘不启动 SF |
| `test_scan_handoff.mjs` | DOM 来源、确认、升变、popup 重开、当前分支网页交接及单局面 UI 通过；新棋钟触发后 6ms 停机 / 清空 |
| 打包检查 | 100 个文件逐项与源码一致；单一根 manifest；无 Maia 权重、无网页版 SF Standard 运行文件；权限不含 all_urls |

来源网页为可复现 fixtures，识别与 SF 均为真实运行。用户测试的是登录后的个人信息流，没有可复现帖子链接，因此这里不声称已直接验证其实际 Twitter/X 账号信息流，也不声称所有图像主题都可识别。

原生信息流测试图：`artifacts/scan/timeline-scan-en.png`。CSS 渲染组合参考 [React Native Web Image 实现](https://github.com/necolas/react-native-web/blob/master/packages/react-native-web/src/exports/Image/index.js)，用同样结构完成原生扫描测试。

## 安装包

- 2,143,868 bytes，约 2.04 MiB。
- SHA-256：`e55ce28061a3ff8992aa04b3b99551729dbc49f589edf9676648a46c992566ec`。
- 本地加载时用新包内容替换原扩展目录，保留目录位置，再到 chrome://extensions 重新加载并刷新来源页。网站更新不会自动替换本地插件。

1.1.0 的同步与授权设计见 `docs/scan-delivery-1.1.0.md`。发布时另核对 GitHub Verify、Cloudflare 生产部署及公开指南 / 隐私页。
