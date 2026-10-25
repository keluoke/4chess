# Diverge 1.1.5 交付说明

日期：2026-10-25。基于 10 月 24 日评审，完成公平竞技、复盘正确性、恢复能力、发布产物与网站搜索承接优化。

## 文件与安装

| 文件 | 用途 |
|---|---|
| [diverge-extension-v1.1.5.zip](/Volumes/AI/coding/simoextension/releases/diverge-extension-v1.1.5.zip) | **唯一用于上传 Chrome 商店审核的扩展 ZIP** |
| [diverge-extension-v1.1.5](/Volumes/AI/coding/simoextension/releases/diverge-extension-v1.1.5) | **常规本地测试目录**，与商店 ZIP 逐文件字节一致 |
| [diverge-extension-v1.1.5.json](/Volumes/AI/coding/simoextension/releases/diverge-extension-v1.1.5.json) | Git 基线、ZIP SHA-256、大小与逐文件哈希 |
| [diverge-local-v1.1.5](/Volumes/AI/coding/simoextension/releases/diverge-local-v1.1.5) | 可选的本地分享开发目录，包含本机服务入口，**禁止上传商店** |
| [商店素材与文案](/Volumes/AI/coding/simoextension/chrome-web-store/release-1.1.5/README.md) | 本次建议上传的截图与文案 |

在 `chrome://extensions` 开启开发者模式，选择“加载已解压的扩展程序”，选中上表的 **diverge-extension-v1.1.5** 文件夹，然后刷新原棋类网站标签页。不要加载项目根目录，也不需要先运行 clean 或手工改名。

打包只允许 Chrome 必需的 `_locales` 下划线目录；它必须保持一个下划线，不要改为 `__locales`。模型清单保持 `models/chessimg2pos_manifest.json`。Cloudflare `_headers`、`_redirects`、node_modules、AppleDouble `._*` 和临时构建目录均不进入扩展产物。清理命令也已取消重命名依赖文件的历史做法。

商店审核仍由用户上传，本次未代为提交或发布 Chrome 商店更新。

## 修复与优化

- F01/F02：终局证据不再扫描玩家名；隐藏的第一控件不会遮蔽后续活跃控件；未知、缺失或冲突的 API/PGN 结果拒绝复盘。
- F03/F05：每次深度搜索均检查任务与公平竞技状态；取消撤销排队搜索和等待初始化的请求，不破坏健康引擎初始化。实时上锁会直接终止 Maia Worker 与 Stockfish，完赛后从缓存恢复；失效 Worker 的迟到消息不能修改新任务。
- F04：本地服务强制检查扩展 Origin 与非空令牌，使用安全比较，验证 FEN，限制上游超时；分享端点仅允许本机 3210。商店/网站输出均剔除此功能。
- F06：将死、逼和是合法终局结果，不再当作引擎故障；真实 WASM 复盘的将死末步保留评分。
- F07/F08/F09：解析嵌套变例与分号注释；完整 PGN/FEN 优先于链接检测；旧网络导入不会覆盖新选择，导入新局会停止旧自动播放。
- F10/F11：Worker 异常结算等待中的任务并允许重试；坏模型缓存清理后最多重新下载一次。缓存命中显示为准备模型，不再宣称 0ms 完成加载。
- F12：旧缓存回调不能修改新任务的运行状态与结果；复盘缓存升至 schema 7，避免升级后继续展示修复前的终局评分。
- F13/F14：补齐首次离线所需依赖与 Worker，网站构建生成模块缓存覆盖；动态 `/api/` 绕过 SW，棋局接口返回 no-store。
- 完赛弹窗关闭和刷新后，记谱表终局标记继续允许复盘；新运行时钟使守卫在 MutationObserver 批次中重新上锁。
- 沙箱令牌读写串行化，同一持久化令牌的两个并发请求只能成功一次。
- TCN/PGN 序列化抽到共用模块，消除后台与工作台重复；CI 和浏览器测试从当前 manifest 取版本，测试当前 ZIP。
- 空白工作台优先展示导入、示例和安装入口；移动首屏能直接操作；修复英文空状态标签和 popup 品牌文案。
- 网站增加中英文首页和扫描、双引擎、PGN 场景说明页，提供安装 CTA、canonical、hreflang、分享预览、真实 robots/sitemap 与 404。
- 网站改为 `dist/site` 明确允许列表构建；Cloudflare 项目输出目录对应调整。源码、发布 ZIP、环境配置与本地分享服务不作为网站静态资源部署。
- 修复英文商店首图的棋盘几何排版；QA 增加 64 格布局检查。摘要突出扫描和人机走法比较，保持准确用途说明。

## 已执行的验证

- `npm test`：默认测试及本次新增的安全边界、取消、PGN、Worker 故障、坏缓存、缓存任务所有权、真实 Lite WASM 终局和令牌并发回归。
- `npm run test:release`：检查 ZIP 与用户测试目录逐文件一致、保留正确 `_locales` 名称、排除本地服务；在真实 Chromium 中加载该目录，验证输入、移动首屏、离线、API 缓存及实时→完赛→关弹窗→刷新→新局状态转换。
- 发布 fixture 中新局上锁观测低于 150ms；这个结果只代表可控 fixture，不等于所有平台/设备负载的硬实时保证。
- 包内真实 Maia 5M、23M、79M 下载、推理与缓存复用；网页版真实 SF19 Standard + Maia 5M 和 Lite + Maia 5M，合法三候选、整局复盘与缓存复用。
- 实际扫描弹窗：截图、offscreen 本地 WASM 识别、确认、真实 SF MultiPV3、走棋、回退、翻转、中英文、来源导航/图片替换撤销。
- 扫描交接：当前 FEN、升变、popup 重开、工作台位置模式、来源转为 live 后停止并清空；本次 fixture 观测为 20ms。
- 本地分享测试仅请求被拒绝或无效输入，不调用微信生成码或写入 CloudBase。
- 依赖审计已修复本次发现的 undici 漏洞；发布前再次检查。

运行日志与截图位于 [artifacts/delivery-2026-10-25](/Volumes/AI/coding/simoextension/artifacts/delivery-2026-10-25)。真实平台账号的全部 DOM 变体、手机真机/长期性能、商店审核结果和自然搜索增长仍需要实际使用数据，未标为已验收。

## 可选：本地分享

常规测试目录及商店 ZIP 没有本地分享按钮或 loopback 权限。需要本地分享时，单独加载 **diverge-local-v1.1.5**，保持另一个版本禁用以免重复注入。

服务仍从项目中的 `.env.local` 读取配置，凭据不进入 Git、网站或商店。为 `LOCAL_TOKEN` 设置随机秘密，在本地版 popup 设置页的“本地分享服务令牌”输入相同值，再运行：

```sh
node scripts/share-service.mjs
```

服务仅绑定 `127.0.0.1:3210`；它不会随网站部署自动运行。官方小程序码仍依赖原有微信配置、IP 白名单与小程序发布状态。本次没有向微信发起真实生成请求。

## 后续演进

本次采取渐进架构整理，保留现有产品入口。更大范围的 UI 类拆分、真实用户留存与搜索表现评估属于后续迭代；没有新增截图/棋谱遥测，也没有用扩大模型档位替代稳定性修复。
