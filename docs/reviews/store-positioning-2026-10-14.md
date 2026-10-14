# 商店与产品文案统一 · 1.1.4

核心仍是比较机器引擎评价与人类走法预测。入口扩大到网页静态棋图、合法分析台及完赛棋局，不把产品描述为仅赛后复盘，也不承诺所有图片都能识别或允许实时对局辅助。

## 上传文案

- `chrome-web-store/listing-copy.json`：English / 简体中文标题、摘要、详细说明及单一用途来源。
- `STORE_LISTING.md`：逐字段填报版；`listing-en.txt` / `listing-zh-CN.txt`：纯文本详细说明。
- 英文标题 50 字符、摘要 111 字符；中文标题 29 字符、摘要 77 字符。名称上限 75，摘要上限 132；`npm run store:check` 检查字符限制、本地化元数据、纯文本导出和单一用途一致性。

搜索词围绕真实功能：标题的 Chess Analysis / Scanner / Human Intuition，摘要的 Stockfish / Maia / 网页棋图 / 支持平台，详细说明中的 chessboard scanner / PGN / FEN / game review / heatmap。使用正常功能段落，不堆重复关键词、不借竞品名称，也不声称排名效果。依据：[商店文案指南](https://developer.chrome.com/docs/webstore/best-listing)、[商品信息规范](https://developer.chrome.com/docs/webstore/program-policies/listing-requirements/)、[Manifest 限制](https://developer.chrome.com/docs/extensions/reference/manifest)。

## 全项目相关文件审查

| 表面 | 处理 |
|---|---|
| 商店详情、提交说明、双语元数据 | 重写核心价值、扫描与复盘入口；准确区分弹窗 SF 与工作台双引擎；同步权限、单一用途与 Website Content 声明 |
| popup | 更新首次引导、学习用途标记与工作台入口；保留语言、设置与扫描操作 |
| 网页 / PWA / 根入口 | 标题、简介、导入和空状态同时支持局面与棋局；动态 meta description 与中英文同步 |
| README / package | 重写概述和扫描能力，条件化缓存 / 离线描述，补充商店文案同步命令 |
| guide | 两种入口的新手流程、双语介绍与网页元信息同步 |
| privacy / privacy.html | 扩大用途说明到静态棋图；准确区分截图、本地推理、网页交接与网络请求；维护者为 keluoke；旧副本改跳转到当前政策，避免再漂移 |
| 英文宣传素材 | 既有 5 张素材的产品标题 / 标签更新到局面及棋局学习，保留原 Opera Game 引擎证据和全盘示例，重导出 PNG / 联系表 / ZIP |
| 源码简介 | 删除不准确的无外部服务、零延迟等概述；不修改计算或守卫逻辑 |
| 历史报告 / 10 月 3 日故事 / 旧安装包 / 旧图片目录 | 保留日期与原场景，属于历史记录或既有功能示例；当前商品详情与推荐英文素材另有明确来源 |

移除了旧公开文案里的“零数据上传”“双引擎都经 WASM”“CPU 绝对归零”“缓存秒开”“盲点陷阱”等宽泛承诺；Maia 概率继续说明为人类走法预测，非获胜概率或个人棋力认证。项目许可、第三方署名、公平竞技守卫与模型分发规则不变。

## 验证与交付

- `npm test`、`store:check`：通过。
- 原生 Chrome popup：新的中英文产品介绍正常，扫描入口可见，无横向溢出。
- 实际浏览器：指南 / 分析台标题、meta description、空状态中英文同步。
- 原生扫描、真实 WASM / SF 三分支、双语、网页交接回归：通过；新棋钟后停机 / 清空实测 22ms。
- 5 张英文 PNG：规定尺寸、RGB / 不透明、英文可见文字、锁定示例候选禁用均通过；ZIP 与 PNG 逐项一致。
- 扩展 ZIP：102 个文件与源码逐项一致，单一根 manifest，无 Maia 权重或 SF Standard 网页运行文件。

包：`releases/diverge-extension-v1.1.4.zip`，2,150,534 bytes，SHA-256 `56c7ea0fdb888d0fd56fc777b6b9ed1985f5f204549bac03b07e19a694423ea2`。

本次交付包括可粘贴的商店文案、元数据安装包和项目文件更新。未在 Chrome Web Store 后台保存或提交审核；网站与本地文件的发布不等于商店商品详情已更新。
