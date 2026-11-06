# 悬浮窗 1.1.8 整改交付

日期：2026-11-06。状态：14 项整改已实现，交付检查通过；交付内容为 Git 源码、源码补丁、扩展 ZIP、可直接加载目录与验证证据。源码按用户后续要求纳入 Git 交付，商店由用户提交；本地构建与测试结果不等于线上部署或商店发布确认。

依据：[产品体验评审](/Volumes/AI/coding/simoextension/docs/reviews/floating-panel-product-ux-2026-11-06.md)。源码基线 `fc6b3768beaba2b088e0d1e13ef777b191e47995`。早先源码补丁与快照清单保留首次未提交交付的内容，可在该基线复原；后续 Git 提交以仓库为准，商店安装包在提交后重新打包，其源码提交标识与工作区状态记录在当前安装包校验文件中。

## 可用交付物

- [扩展安装 ZIP：diverge-extension-v1.1.8.zip](/Volumes/AI/coding/simoextension/releases/diverge-extension-v1.1.8.zip)
- [Chrome“加载已解压的扩展程序”目录](/Volumes/AI/coding/simoextension/releases/diverge-extension-v1.1.8)
- [源码补丁：diverge-v1.1.8-source.patch](/Volumes/AI/coding/simoextension/releases/diverge-v1.1.8-source.patch)
- [安装包 SHA-256 与逐文件校验记录](/Volumes/AI/coding/simoextension/releases/diverge-extension-v1.1.8.json)
- [源码快照清单](/Volumes/AI/coding/simoextension/releases/diverge-v1.1.8-source.json)
- [浏览器截图与验证日志](/Volumes/AI/coding/simoextension/artifacts/floating-ux-delivery)

安装时解压 ZIP，或直接在 Chrome 扩展管理页的开发者模式中加载上面的目录；更新已加载的旧目录后，刷新 Chess.com / Lichess 页面。不要同时加载两个旧/新版本。

## 整改结果

| 项目 | 已实现行为 | 验证 |
| --- | --- | --- |
| UX-01 短面板 | 高度不足 420px 切换摘要，完整显示行棋方、首选、预测选择率与引擎评分；展开详情恢复完整面板 | 中/英、浅/深、250×200 等 16 组布局；完整摘要与首条候选可读检查 |
| UX-02 收起与最小化 | 标题减号真正最小化到侧边入口；设置保留“收起内容（保留侧栏）”及隐藏；收起/隐藏/最小化关闭抽屉并清理预览 | 三种行为、设置交叉操作、键盘恢复、窗口缩小后入口可达 |
| UX-03 状态一致 | 大厅、未知、实时、允许分析/已完赛读取中分别表达；终局在没有可读 FEN 时也立即清除旧保护文字；安全页面首次加载同步解锁标记 | 打包 MV3 的 Chess.com 结束/关弹窗/刷新/新局/大厅/未知，以及 Lichess 结束解锁 |
| UX-04 加载与恢复 | 正常下载不显示重试；失败时提供 Maia / SF 独立重试和轻量模型切换；一方失败保留另一方可用结果 | 组件错误/重试状态；真实打包 Lite WASM 在 Maia 下载阻塞/失败时继续运行，Maia 重试发起新请求 |
| UX-05 数值解释 | 列名明确“选择率”“评分变化”，局面评估标白方视角；帮助解释预测、兵单位、Δ 与未知值；移除“多少真实棋手会走”的统计式表述；损失不再挂在 SF 最佳着法旁 | 双方视角、将杀分数、缺评分显示 —、无引擎比较 delta 为 null、文案与归属检查 |
| UX-06 信息层级 | 结论先于候选，等级与显示入口就近；图例按需展开；去掉重复概率/Δ；正常引擎技术状态收进详情 | 首屏候选可读、正常与精简模式截图 |
| UX-07 分歧层级 | 首选相同、评分接近、评分待确认、存在损失分别表达；细微差异不显示警告，共识不再出现黄色 Δ 0.00 | 合成 -0.05 / -1.30 / 缺值 / 共识分支；不代表模型精度验收 |
| UX-08 设置分层 | 等级、棋盘显示、Maia 模型、网页版选项、语言与位置操作按使用频率排序；模型标注轻量/均衡/更大与首次大小；状态区分保存、下载与应用 | 快捷入口、长抽屉滚动、网页专属提示、三入口偏好同步与刷新保存 |
| UX-09 候选预览 | 悬停、聚焦、Enter/空格或点击预览；再次点击/Esc 清除；更新结果保留同着法焦点；保护时禁止预览 | 真实浏览器键盘/鼠标交互，保护状态程序调用拦截 |
| UX-10 可访问性 | 开关文本可点击，滑杆/按钮具备名称；选中状态提供 aria-pressed；抽屉具备展开状态、焦点循环、Esc、关闭后返回；错误与 Toast 有通知语义 | DOM 名称、Tab/Shift+Tab、Esc、标签联动、关键文本对比度检查 |
| UX-11 工作台交接 | 提取/打开中按钮显示忙碌并防重复；检查消息与建页结果；支持 FEN、方向、等级、偏好交接；无完整棋谱回退当前局面，失败提供重试/局面/PGN 导入 | 打包 MV3 到本地承接的网页版和扩展本地工作台；完整 PGN 元数据、非法 FEN、建页失败与空白恢复 |
| UX-12 连续等级调整 | 数字即时反馈，键盘短暂静止后合并；拖动结束/失焦提交；进入保护时取消待提交操作 | 三次连续键盘输入只触发一次最终等级回调 |
| UX-13 双语状态 | 计算中、保护中、等待、错误、抽屉及选中状态按语义重绘，切语言保留研判中含义 | 中英文计算态、保护态与偏好同步 |
| UX-14 位置与图标 | 标准减号最小化；标题拖动提示；设置中恢复默认位置；拖动使用 Pointer Events；恢复入口约束在视口内 | 实际鼠标拖动位移、位置重置与窗口尺寸变化；未声称触屏设备验收 |

## 验证结果与边界

| 层次 | 命令 / 证据 | 结果 |
| --- | --- | --- |
| 源码回归 | `npm test` | 通过，包含 24 个公平竞技场景、DOM 生命周期、安全、引擎版本、模型分发、通信、评分、SAN 与缓存/取消回归 |
| 面板布局与交互 | `npm run test:floating` | 通过，16 组布局及有意义的交互/异常/键盘/数值检查；另补首次安全状态与拖动回归 |
| 源码网站构建 | `npm run build` | 通过，31 个本地模块依赖核对；产物在 `dist/site`，未部署 |
| 扩展打包与浏览器 | `npm run test:release` | 通过，ZIP 与加载目录 111 个文件逐一一致；无本地服务、保密配置或大 Maia 权重 |
| 保护状态浏览器夹具 | release browser JSON | 两站终局解锁；Chess.com 关弹窗/刷新保持解锁、新局上锁；一次新局上锁实测约 3.4ms，保护/无 FEN 夹具权重请求为 0 |
| 打包扩展与真实 Lite | `node scripts/test_user_entries.mjs` | 通过，真实 MV3、真实 Lite WASM，Maia 下载失败后的独立结果与重试；此脚本的普通扩展页 popup 回退不作为原生弹窗证据 |
| 原生弹窗 | `node scripts/test_native_popup.mjs` | 通过，Chrome 扩展 action 的真实原生弹窗目标，经既有 CDP action helper 触发；368×600、中英文、设置滚动、面板隐藏/恢复；不是普通标签页 |
| 偏好同步 | `node scripts/test_preferences_sync.mjs` | 通过，popup/悬浮窗/本地承接的第一方网页双向同步与刷新保存，实时场景权重请求为 0 |
| 工作台交接 | `npm run test:floating-handoff` | 通过，实际服务工作线程消息与建页、网页版/本地 FEN、黑方方向、2050 非预设等级、语言、引擎/模型偏好、完赛 PGN 与错误分支 |

上述新局上锁耗时是一次浏览器夹具测量，不能外推为所有真实站点、设备或负载的延迟保证。公平竞技判定文件与大模型排除规则未修改；新预览、重试、工作台交接仍经过同一守卫，异步提取结束和重试返回后也校验状态/会话。

Maia 预测数据在组件布局与交互测试中为合成输入，未进行新的模型质量或概率校准实验。真实 Lite WASM 验证与模型质量证据分开。未进行真实登录对局、真实手机/触屏/读屏器、长期弱网性能验收；这不构成正式商店发布或线上部署确认。

## 界面证据

常规面板：结论、预测对象、候选和白方评分优先，技术状态按需展开。图中着法、概率与分数为组件夹具输入。

![常规面板](/Volumes/AI/coding/simoextension/artifacts/floating-layout/light-zh-analysis.png)

[精简模式（浅色中文）](/Volumes/AI/coding/simoextension/artifacts/floating-layout/light-zh-compact.png) · [精简模式（深色英文）](/Volumes/AI/coding/simoextension/artifacts/floating-layout/dark-en-compact.png) · [真实原生弹窗](/Volumes/AI/coding/simoextension/artifacts/floating-ux-delivery/native-popup-default.png)

## 进度检查

已按用户要求创建当前聊天每 8 小时检查，自动化 ID `automation-4`。此次整改在首次定时检查前完成；完成交付后停用该检查，避免重复运行。后续若新增整改范围，应按新请求恢复或调整检查。
