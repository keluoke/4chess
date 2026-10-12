# 全盘分析：引擎版本与固定棋盘

## 行为

- 设置新增 SF19 Lite / Standard、Maia-3 5M / 79M，默认继续使用 Lite + 5M。选择保存在浏览器；切换会取消旧计算并重新复盘。
- 全盘报告和当前局面缓存包含 SF / Maia 版本，导入其他版本的已有报告时重新计算。79M 校验宽度 1024、32 个头、8 个块及 83,094,020 个参数，不读取旧 5M 缓存。
- 标准版 WASM、79M FP16 权重通过 `weights.4chess.cc` 分发；Git / Pages / 扩展包仅新增约 21 KB 的标准版 JS glue。大文件以 32 MiB 分块写入 IndexedDB，事务提交后才确认完成。
- 桌面双栏固定棋盘与操作栏，右侧独立滚动。当前着法和关键步只改变容器内部的滚动位置。手机继续使用单栏布局。
- 中英文设置、原棋盘 / 棋子 / 操作图标 / 声音 / 顶部对阵和操作按钮保留。
- SF19 Standard 使用完整网络的单线程 WASM，网页版可选；MV3 插件页保留本地 Lite，并提供网页版入口。公平竞技守卫没有修改。

## 验证

- `npm test`：公平竞技、真实 DOM 状态机、候选分支、版本缓存隔离、下载中断恢复、声音、沙箱握手及识别集成。
- `scripts/test_game_analyzer.mjs`、`scripts/test_intuition_divergence.mjs`：精度 / 妙手俗手 / 报告缓存兼容性。
- `scripts/test_review_ui.mjs`：真实 Lite Stockfish、Maia 测试替身；80 半回合键盘导航和右侧滚轮下棋盘矩形保持不变，320 / 390 / 736 / 1024 px 无横向溢出；真实 IndexedDB 分块读写及单模型删除。
- `scripts/test_engine_versions_browser.mjs`：真实 CDN SF19 Standard / Maia-3 79M，前三选、完整短棋局复盘、版本保存和刷新缓存复用。该脚本会下载约 254 MiB，按需运行，不加入日常单元测试。
- 79M 开局 / Elo 1900 样本与官方 PyTorch 检查点对照：前三选均为 `e2e4 / d2d4 / c2c4`；浏览器概率 `59.83 / 27.08 / 3.72`，官方 FP32 `59.82596 / 27.08304 / 3.72083`。这是一个样本的转换 / 推理检查，不代表完整模型等价性或手机性能证明。本机 Chrome 单次约 3.5 秒。

资产来源和 SHA-256 记录在 `THIRD_PARTY_NOTICES.md`。
