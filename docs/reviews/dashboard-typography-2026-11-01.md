# 全盘复盘 Dashboard 视觉升级

参考：https://dribbble.com/shots/27173126-AI-Dashboard

保留棋盘、引擎与着法、人类直觉三栏结构。浅紫背景、白色圆角卡片、电蓝评分卡和灰蓝棋盘建立新的浅色主题，并提供对应深色主题。Inter 4.1 可变字体本地分发，中文使用系统字体；标题 24px、分区 16px、着法 14px、辅助文字 12px、局面评分 48px。

动效只用于状态转换：选中背景移动而文字保持稳定；新分支展开；每个局面首次真实评估淡入；圆环跟随实际分析进度。遵守 reduced-motion。未修改引擎评分算法、Maia 模型加载或公平竞技守卫。

## 验证

- `npm test`：通过。
- `node scripts/test_review_ui.mjs`：通过。真实浏览器及 Stockfish；Maia 使用可控测试数据，验证延迟直觉不阻塞评分、分支与原谱隔离、图表跳转、主题/聚焦、动态 reduced-motion、移动端与短屏布局。
- `npm run build && npm run package && node scripts/test_package_integrity.mjs && npm run test:browser`：最终源码重新打包后通过。ZIP 与解压目录一致，共 110 文件；首次离线重载字体可用；扩展实际加载；受控 Chess.com 页面生命周期保护测试通过。
- 人工查看浅色桌面分支、深色桌面及窄屏截图，检查字号、对比度、卡片边界与布局。未将浏览器视口模拟作为实体移动设备验收；未测量真实 Maia 23M 冷启动性能。
- Inter 来源、SHA-256 与完整 OFL 许可见 `THIRD_PARTY_NOTICES.md` 和 `LICENSES/Inter-OFL-1.1.txt`。字体约 344 KiB，无新增模型权重。

截图：`artifacts/workbench-branch-desktop.png`、`artifacts/workbench-dark-desktop.png`、`artifacts/workbench-dark-mobile-analysis.png`（本地验收产物，不入库）。
