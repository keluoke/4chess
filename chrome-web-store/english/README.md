# Diverge 1.2.1 英文商店素材

在 Chrome Web Store 后台选择 English。[1.2.1 扩展包](../../releases/diverge-extension-v1.2.1.zip)提供本地化标题和摘要。详情使用 [listing-en.txt](../listing-en.txt)。

| 顺序 | 英文截图 | 展示内容 |
| --- | --- | --- |
| 1 | [Stockfish 19 vs. Maia Human Intuition](1-studio.png) | Byrne–Fischer，17.Kf1 后的三栏工作台、候选着法、走势与复盘统计 |
| 2 | [Share a divergence card](5-share-card.png) | 歌剧院对局 7.Qb3，蓝箭头标出 Stockfish 的 Qb3，琥珀箭头标出 Maia 的 Bg5。弹窗提供两种画幅、复制和下载 |
| 3 | [Scan a chess diagram to playable FEN](2-image-to-fen.png) | 同一张静态棋图、英文纠错弹窗、确认后走出 1.e4 |
| 4 | [Compare engine and human moves](3-floating-panel.png) | 已完赛示例的双引擎箭头、Maia 候选与 Stockfish 首选 |
| 5 | [Locked during live games](4-fair-play.png) | 活跃时钟触发公平竞技锁，棋盘无建议，面板显示禁用状态 |

五张图均为 1280 × 800 RGB PNG。工作台截图来自内置 Fischer 样局。分享卡截图取自 1.2.1 工作台，使用仓库留存的[歌剧院对局分析结果](../english-20261012/source/engine-evidence.json)。悬浮窗两图取自实际扩展在受控 Chess.com 页面结构上的渲染，棋盘与面板分别取景。

## 英文视频

[30 秒无配音 MP4](diverge-demo-en.mp4) 可上传至 YouTube。视频可观看后，在 English 的 Localized promo video 字段填入观看链接。[Chrome 商店后台说明](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)

**YouTube title**

Diverge for Chrome | Review a chess game and scan a diagram to FEN

**YouTube description**

Watch Stockfish and Maia disagree in Byrne–Fischer, then retry a mistake from the game. Scan a diagram, check a piece and play a move. The final example shows how Diverge locks during live games.

[Get Diverge on the Chrome Web Store](https://chromewebstore.google.com/detail/egiimjkekgiaimaagaljiclacljmdkmo) · [Try the Fischer sample](https://4chess.cc/analysis/?lang=en)

## 英文社区草稿

适合在英文商品页更新上线后，发布到允许作者介绍自制工具的社区或主题帖。第一批反馈可先邀请五位实际使用过的棋友，自由选择是否评价、星级和措辞。[Chrome 商店评分与评价政策](https://developer.chrome.com/docs/webstore/program-policies/spam-and-abuse)

### Reddit

**I built a chess review tool to compare Stockfish with the move a human might play**

After 17. Kf1 in Byrne–Fischer, would you take the rook on d1? Maia’s first choice at 1900 Elo is the capture. Stockfish prefers 17…Be6, the bishop move Fischer actually played.

I built Diverge so you can try both ideas on the board. The free Chrome extension also turns diagrams from articles into playable positions. If you try it with one of your own games, I’d love to hear which position you chose and whether the comparison helped.

[Chrome extension](https://chromewebstore.google.com/detail/egiimjkekgiaimaagaljiclacljmdkmo) · [Fischer sample in the web studio](https://4chess.cc/analysis/?lang=en)

### Lichess community

**A way to retry a mistake from your own finished game**

I make Diverge, a free, open-source chess study tool. After a Lichess game, open the finished game in the review studio, pick a mistake and try the position again with the candidates hidden. Then compare your idea with Stockfish’s line and Maia’s prediction for the rating you choose. The extension locks during live games.

I’m interested in how this works with real games. Which move did you want to retry, and could you find it easily?

[Chrome extension](https://chromewebstore.google.com/detail/egiimjkekgiaimaagaljiclacljmdkmo) · [Open-source project](https://github.com/keluoke/4chess)

### 使用后的评价邀请

If you’ve tried Diverge on a game or a diagram, would you share an honest review? It helps other players to know what worked for you and what could be better. [Write a Chrome Web Store review](https://chromewebstore.google.com/detail/egiimjkekgiaimaagaljiclacljmdkmo/reviews)
