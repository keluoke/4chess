# Diverge · Chrome Web Store 双语商品文案

以 listing-copy.json 为文案来源；修改后执行 node scripts/sync_store_copy.mjs --write。默认检查不会改文件。

默认语言 English，另填写简体中文商品详情。安装包包含本地化标题与摘要；详细说明仍需分别在商店后台填写。标题不超过 75 字符，摘要不超过 132 字符，以下长度自动核对。

## English

名称（71/75）：

```text
Diverge: Chess.com & Lichess Game Review, Stockfish, Maia & FEN Scanner
```

摘要（126/132）：

```text
Free Chess.com & Lichess game review with Stockfish 19 and Maia. Scan chess diagrams to FEN. Analysis locks during live games.
```

详细说明（可直接粘贴；同 listing-en.txt）：

```text
Diverge is a free, open-source chess study tool. Analysis runs locally in your browser and locks automatically during live games.
Review a finished Chess.com or Lichess game to see what Stockfish recommends and what Maia predicts a human would play.

Game review with Stockfish 19 and Maia
Open the Fischer sample and go to 17. Kf1. Black can take a rook on d1, Maia’s first choice at 1900 Elo with the 5M model. Stockfish 19 Lite prefers 17…Be6, the bishop move Fischer played. Try either line on the board. Blue arrows show the engine’s choice and amber arrows show Maia’s candidates. Maia’s percentages estimate how often a player at the selected rating would choose each move.

Free PGN analyzer and mistake practice
Import a PGN, paste a game or open a supported public game link. Follow the evaluation chart to a turning point, then filter key moves by side and move quality. Replay your mistakes from the position before your move. Try a different continuation on the board, ask for a hint or reveal the line.

Share a chess position as a PNG
From a key move in the analysis studio, open Share card to show the position and compare Stockfish’s recommendation with the played move or Maia’s first choice. Copy the image or download a landscape or portrait PNG. The card is generated on your device.

Mistake Bank and Intuition Checkup in the web studio
On 4chess.cc, save intuition traps to a local Mistake Bank and revisit them with spaced practice. Intuition Checkup looks for patterns across up to 10 recent finished Chess.com or Lichess games. You can also import a PGN with multiple games. Study profiles and reports stay in the browser. Enable optional reminders for a linked profile to see new completed games and open its checkup from the extension popup.

Image to FEN
Found a diagram in an article or a forum post? Open the extension and choose Scan page. Check the pieces and whose turn it is, then correct any square before confirming. Play a move on the recognized board, copy its FEN or open it in the studio. The scanner reads visible static diagrams. A diagram alone may leave castling and en passant rights unclear. You can edit the FEN to supply them.

On-device AI commentary
On supported Chrome installations, opt in to local AI commentary for an English game recap and notes on key moves. Chrome may need to download its model first. Standard review explanations are available without this option.

Local analysis and fair play
Diagram recognition, Stockfish analysis and Maia inference run in your browser. Screenshots stay on your device. Maia downloads the selected model on demand and caches it for reuse. Importing a public game link contacts the chess platform. During live games, Diverge disables analysis and clears candidate moves, arrows and heatmaps. Review unlocks when it detects a confirmed finish.

Diverge is an independent project. Chess.com and Lichess are supported platforms.

Guide: https://4chess.cc/guide/
Studio: https://4chess.cc/analysis/?lang=en
Privacy: https://4chess.cc/privacy/
Source and support: https://github.com/keluoke/4chess
```

## 简体中文

名称（48/75）：

```text
歧路 Diverge · Chess.com 与 Lichess 免费复盘、双引擎分析与棋图扫描
```

摘要（85/132）：

```text
免费复盘 Chess.com、Lichess 完赛棋局，并排对比 Stockfish 与 Maia 候选。支持棋图转 FEN、近期诊断和错题练习。对局进行中自动锁定分析。
```

详细说明（可直接粘贴；同 listing-zh-CN.txt）：

```text
歧路 Diverge 提供 Chess.com 和 Lichess 免费完赛复盘。用 Stockfish 查看引擎推荐，用 Maia 了解所选等级分棋手常见的走法。你也可以把网页上的静态棋图扫描成 FEN，再在分析台探索。

引擎建议与人类直觉，并排比较
结合局面评分、候选变化和走法概率，寻找两种选择的分歧。Maia 的百分比表示人类走法预测概率，不是获胜概率，也不能用来认定个人棋力。常见的走法可能存在问题，引擎推荐的走法也可能违背第一直觉。

扫描网页中的棋盘局面
在信息流、文章、论坛或学习图片里看到棋图，点击工具栏弹窗中的“扫描当前页面”即可自动识别并进入互动棋盘。识别失败或需要换一张棋盘时，可以框选重试。检查棋子、方向与行棋方，需要时直接修正局面，再确认分析。

弹窗使用 SF19 Lite 给出最多三条合法引擎分支。你可以点击或拖动棋子探索变化、绘制思考箭头、切换观看视角并复制 FEN。点击“深入探索引擎与直觉的分歧”，把当前局面或个人分支交给 4chess 网页分析工作台，进一步比较 Maia 候选。扫描读取当前可见的静态图片；单张棋图无法恢复完整对局历史，也未必能确定轮到谁走。

复盘已结束的棋局
在受支持的分析台和完赛棋局中，悬浮窗对比人类候选与引擎建议，可用走法箭头和落点概率热力图辅助理解。工作台支持导入 PGN 文件、粘贴 PGN 或 FEN，以及受支持的公开对局链接。整局复盘提供精度得分、优劣走势图、记谱与妙手／俗手等关键步；只有一个局面时不显示整局精度或棋局走势图。

近期诊断与错题练习
在 4chess.cc 的工作台，可按档案绑定公开棋手账号，诊断最近最多 10 盘完赛棋。把关键错题存进错题本，按间隔重练。你可以为档案开启新局提醒，在扩展图标看到红点后，直接从弹窗打开对应档案的诊断。

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

英文标题覆盖完赛复盘、支持的平台与识图入口。详情用 Fischer 的实战局面说明引擎与人类候选的区别，并说明分享卡片、网页错题本、直觉体检和本地 AI 点评的使用方式。

- English 与简体中文分别填写；不把两个长说明拼成同一语言页面。
- 英文截图顺序、30 秒演示与发布草稿见 [英文商店素材](english/README.md)。
- 单一用途说明、权限理由与 Website Content 数据披露使用 [SUBMISSION_CHECKLIST.md](SUBMISSION_CHECKLIST.md)。
- 隐私政策：https://4chess.cc/privacy/；指南：https://4chess.cc/guide/。
- 本地文件更新不等于后台商品详情已提交或通过审核。

依据：[Chrome 商店文案指南](https://developer.chrome.com/docs/webstore/best-listing)、[商品信息与关键词规范](https://developer.chrome.com/docs/webstore/program-policies/listing-requirements/)、[Manifest 字段限制](https://developer.chrome.com/docs/extensions/reference/manifest)。
