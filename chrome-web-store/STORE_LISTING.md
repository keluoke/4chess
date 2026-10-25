# Diverge · Chrome Web Store 双语商品文案

以 listing-copy.json 为文案来源；修改后执行 node scripts/sync_store_copy.mjs --write。默认检查不会改文件。

默认语言 English，另填写简体中文商品详情。安装包包含本地化标题与摘要；详细说明仍需分别在商店后台填写。标题不超过 75 字符，摘要不超过 132 字符，以下长度自动核对。

## English

名称（50/75）：

```text
Diverge: Chess Analysis, Scanner & Human Intuition
```

摘要（116/132）：

```text
Scan chess diagrams and compare Stockfish analysis with Maia human moves. Study positions and review finished games.
```

详细说明（可直接粘贴；同 listing-en.txt）：

```text
Diverge is a chess analysis and chessboard scanner extension that shows where Stockfish engine recommendations and Maia human move predictions disagree. Explore positions found in webpage images, or review completed Chess.com and Lichess games.

ENGINE ANALYSIS AND HUMAN INTUITION
See which moves the engine recommends and which moves people at a selected rating are likely to choose. Compare position scores, candidate variations and move probabilities. Maia probabilities describe predicted human choices, not winning chances or a personal rating assessment.

SCAN A CHESS DIAGRAM ON A WEBPAGE
Find a position in a post, article, forum or study image? Click Scan page in the toolbar popup. A packaged local recognition model automatically finds the board and opens an interactive position. If detection fails or you want a different board, select a crop. Check the pieces, orientation and side to move; correct the board before confirming.

The popup then provides SF19 Lite analysis with up to three legal engine lines. Click or drag pieces to explore a variation, draw thought arrows, switch the viewing angle and copy the FEN. Choose Explore engine vs intuition to open the current position in the 4chess web studio and compare it with Maia candidates. The scanner reads visible static images; images cannot recover a complete game history, and the side to move may need confirmation.

REVIEW COMPLETED GAMES
On supported analysis boards and finished games, the floating panel compares human candidates with engine recommendations. Optional move arrows and a destination heatmap make the difference easier to see. Import a PGN file, paste PGN or FEN, or open a supported public game link in the studio. Full-game review adds accuracy scores, an evaluation chart, notation and key moves. A single diagram has no full-game accuracy score or game chart.

EXPLORE YOUR OWN IDEAS
Play moves on the analysis board to create variations. Navigate with the keyboard, annotate with right-drag arrows and compare concise candidate lines. Settings include English and Simplified Chinese, light and dark themes, an intuition rating, and Maia-3 5M, 23M or 79M. The popup and floating panel use SF19 Lite; SF19 Standard is a separate web-studio option. Larger models need larger initial downloads and more computation time. Saved preferences are shared with the first-party studio in the same Chrome profile.

LOCAL COMPUTATION AND FAIR PLAY
Recognition and engine inference run in your browser. Screenshots are not uploaded. Model weights download when needed and can be cached locally. Public game imports contact the chess platform, and opening the studio passes your chosen game or position in the browser. See the privacy policy for storage and network details.

For study and post-game review. Active games lock engine analysis, candidate moves, arrows and heatmaps. Unknown interactive game pages and live broadcasts stay locked. This is an independent project, with no official affiliation to the chess platforms or engine authors.

Guide and credits: https://4chess.cc/guide/
Analysis studio: https://4chess.cc/analysis/
Privacy policy: https://4chess.cc/privacy/
Open source and support: https://github.com/keluoke/4chess
Maintainer: keluoke
```

## 简体中文

名称（29/75）：

```text
歧路 Diverge · 国际象棋分析、棋图扫描与人类直觉
```

摘要（55/132）：

```text
扫描网页棋图，对比 Stockfish 好棋与 Maia 人类常见走法；探索局面、导入棋谱，复盘已结束的对局。
```

详细说明（可直接粘贴；同 listing-zh-CN.txt）：

```text
歧路 Diverge 是一款国际象棋分析与棋图扫描插件，核心是呈现机器引擎与人类直觉的差异：Stockfish 推荐怎样走，Maia 预测所选等级分的人类棋手更可能怎样走。你可以探索浏览网页时看到的静态棋图，也可以复盘 Chess.com、Lichess 上已结束的棋局。

引擎建议与人类直觉，并排比较
结合局面评分、候选变化和走法概率，寻找两种选择的分歧。Maia 的百分比表示人类走法预测概率，不是获胜概率，也不能用来认定个人棋力。常见的走法可能存在问题，引擎推荐的走法也可能违背第一直觉。

扫描网页中的棋盘局面
在信息流、文章、论坛或学习图片里看到棋图，点击工具栏弹窗中的“扫描当前页面”即可自动识别并进入互动棋盘。识别失败或需要换一张棋盘时，可以框选重试。检查棋子、方向与行棋方，需要时直接修正局面，再确认分析。

弹窗使用 SF19 Lite 给出最多三条合法引擎分支。你可以点击或拖动棋子探索变化、绘制思考箭头、切换观看视角并复制 FEN。点击“深入探索引擎与直觉的分歧”，把当前局面或个人分支交给 4chess 网页分析工作台，进一步比较 Maia 候选。扫描读取当前可见的静态图片；单张棋图无法恢复完整对局历史，也未必能确定轮到谁走。

复盘已结束的棋局
在受支持的分析台和完赛棋局中，悬浮窗对比人类候选与引擎建议，可用走法箭头和落点概率热力图辅助理解。工作台支持导入 PGN 文件、粘贴 PGN 或 FEN，以及受支持的公开对局链接。整局复盘提供精度得分、优劣走势图、记谱与妙手／俗手等关键步；只有一个局面时不显示整局精度或棋局走势图。

自由探索与统一设置
在分析棋盘上走棋形成个人分支，用键盘回看、右键拖动画箭头，查看简洁的候选谱。支持中英文、浅深主题、直觉等级分，以及 Maia-3 5M、23M、79M 三档模型。弹窗和悬浮窗使用 SF19 Lite；SF19 标准版是独立网页版的可选项。大模型首次下载更大、计算更慢。设置可保存，并与同一 Chrome 配置中的4chess 分析工作台同步。

本地计算与公平竞技
识别和引擎推理在浏览器中完成，截图不上传。模型按需下载并可本地缓存；导入公开对局会请求相应棋类平台，进入工作台时会在浏览器内传递所选棋谱或局面。具体存储和网络行为见隐私政策。

用于学习与赛后复盘。实时对局期间锁定引擎分析、候选走法、箭头与热力图；无法确认安全的互动棋局和实时直播保持锁定。本项目独立开发，与棋类平台或引擎原作者无官方隶属关系。

使用指南与署名：https://4chess.cc/guide/
分析工作台：https://4chess.cc/analysis/
隐私政策：https://4chess.cc/privacy/
开源与问题反馈：https://github.com/keluoke/4chess
维护者：keluoke
```

## 搜索展示与提交

标题保留品牌、Chess Analysis、Scanner、Human Intuition；摘要补充 Stockfish、Maia、网页棋图和支持的平台。详细说明将 chessboard scanner、PGN、FEN、game review、heatmap 等词放在实际功能中，避免重复关键词列表、竞品名或排名承诺。搜索展示还受使用体验、评价和留存等因素影响，文案不能保证名次。

- English 与简体中文分别填写；不把两个长说明拼成同一语言页面。
- 截图应与实际功能相符；旧版全盘复盘示例仍是其中一个场景。
- 单一用途说明、权限理由与 Website Content 数据披露使用 [SUBMISSION_CHECKLIST.md](SUBMISSION_CHECKLIST.md)。
- 隐私政策：https://4chess.cc/privacy/；指南：https://4chess.cc/guide/。
- 本地文件更新不等于后台商品详情已提交或通过审核。

依据：[Chrome 商店文案指南](https://developer.chrome.com/docs/webstore/best-listing)、[商品信息与关键词规范](https://developer.chrome.com/docs/webstore/program-policies/listing-requirements/)、[Manifest 字段限制](https://developer.chrome.com/docs/extensions/reference/manifest)。
