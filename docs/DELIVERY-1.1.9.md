# Diverge 1.1.9 商店提交包交付（2026-11-10）

## 本次更新

1. Maia 模型通过共享扩展源缓存供 Chess.com、Lichess、扩展工作台及启用插件的 4chess.cc 工作台复用，避免跨站重复下载；保留 CDN-only 分发、IndexedDB 持久化、并发下载串行化和离线复用。未安装插件的网页仍能独立工作。
2. 页面分析与全盘工作台统一箭头颜色、大小比例和首选标记。热力图整格覆盖并位于棋子下层；Stockfish 用自绘五角星，Maia 用 M，同选用 ★ M。
3. 扩展 Manifest、package.json 与 lockfile 同步升至 1.1.9，PWA 离线依赖及图例一并更新。

实现与限制：

- [共享模型缓存](reviews/shared-model-cache-2026-11-10.md)
- [棋盘视觉统一](reviews/board-visuals-2026-11-10.md)

## 本地验证

以下命令均通过：

- `npm test`
- `npm run test:model-cache`
- `npm run test:board-visuals`
- `npm run build`
- `npm run package`
- `node scripts/test_package_integrity.mjs`
- `npm run test:browser`

商店 ZIP 与对应 Load unpacked 目录的 118 个文件逐字节一致。包含新模型缓存桥接脚本及共用棋盘视觉模块；无 Maia 权重、超限模型文件、本地回环权限或本地开发功能。ZIP 位于 `releases/diverge-extension-v1.1.9.zip`，同名 JSON 记录源码提交、工作区状态、文件清单及 SHA-256；最终交付在 Git 提交后从干净源码重新生成。

浏览器验证使用受控平台 DOM 与合成模型数据，覆盖模型缓存与离线重启、黑白视角/主题/小数尺寸棋盘，以及扩展实际加载、对局保护、终局解锁、关闭结算弹窗、刷新保持解锁和新局重新锁定。没有将这些模拟结果当作真实网站 CSP/层叠兼容性、生产权重推理质量或真实账号验收结论。

## 提交状态

此文件及相关源码提交到 Git。生成的 ZIP、解压目录、截图与校验 JSON 按仓库规则保留在本地 `releases/` / `artifacts/`，不将产物或大模型加入 Git。

本次只准备并交付商店上传文件。用户自行上传和提交审核；尚未声称已通过商店审核或发布。
