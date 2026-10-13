# Diverge Privacy Policy / 隐私政策
Maintainer / 维护者：keluoke · Updated / 更新：2026-10-14

## Purpose and local analysis / 用途与本地分析
Diverge, maintained by keluoke, compares Stockfish evaluation with Maia human-move probabilities on analysis boards and completed games. Live games lock analysis. No account, advertising, analytics SDK or developer-operated user database is provided.

Diverge 由 keluoke 维护，在分析台及完赛棋局中对比 Stockfish 评价与 Maia 人类走法概率。实时对局锁定分析。无需注册账号，不含广告或统计 SDK，不建立开发者运营的用户数据库。

## Page content and local storage / 页面内容与本地存储
Supported Chess.com and Lichess pages are inspected for board positions, notation, public player labels and ratings, clocks and game-over evidence. Inference runs on your device. Preferences, review results and model caches can persist in chrome.storage.local, localStorage and IndexedDB; they are not all discarded when a tab closes. Personal variations and hand-drawn marks currently remain in page-session memory.

扩展读取受支持 Chess.com、Lichess 页面的局面、记谱、公开玩家名称及等级分、时钟与终局证据。计算在设备上进行。设置、复盘结果和模型缓存可能保存在 chrome.storage.local、localStorage 和 IndexedDB 中，并非关掉标签页就全部删除。个人分支和手绘标记目前仅保存在页面会话内。

## Shared preferences and the web studio / 统一偏好与网页分析台
In the same Chrome profile, the extension and https://4chess.cc/analysis exchange only whitelisted UI preferences: engine/model edition, language, intuition rating, theme and applicable display controls. This connection does not transfer games, model bytes, engine commands or custom CDN URLs. Opening a full review separately passes the game to the web page in your browser, including through URL fragments. Fragments are not sent in ordinary HTTP requests, but the destination page can read them. This is not cross-device sync.

同一 Chrome 配置内，扩展与 https://4chess.cc/analysis 仅交换白名单 UI 偏好，包括引擎和模型档位、语言、直觉等级、主题与适用的显示开关。这个设置连接不传棋谱、模型字节、引擎指令或自定义 CDN。另行打开全盘复盘时，棋局会在浏览器内交给网页，包括通过 URL 片段传递。片段不会包含在普通 HTTP 请求中，但目标网页可以读取。此功能不是跨设备同步。

## Network connections / 网络连接
The extension fetches public games from Chess.com and Lichess. Web imports may use the open-source 4chess.cc/api/chesscom proxy, sending the numeric game ID and type to retrieve a public game. Weights come from weights.4chess.cc: Maia 5M (~28 MiB), 23M (~104 MiB), 79M FP16 (~159 MiB). Extension JS and executable WASM are packaged locally. SF19 Standard downloads executable WASM only in the separate web studio; the extension uses packaged Lite. A custom CDN receives requests if you configure it. Hosts and infrastructure providers necessarily receive normal request metadata such as IP addresses and requested paths, and may retain operational/security logs under their own policies. Our application code does not implement user analytics or a personal game database.

扩展从 Chess.com、Lichess 请求公开棋局。网页导入可能使用开源的 4chess.cc/api/chesscom 代理，发送数字棋局 ID 与类型来获取公开棋局。weights.4chess.cc 分发 Maia 5M（约 28 MiB）、23M（约 104 MiB）、79M FP16（约 159 MiB）。扩展 JS 与可执行 WASM 均本地打包。SF19 标准版仅在独立网页分析台下载可执行 WASM，扩展使用本地 Lite。设置自定义 CDN 后，该服务会收到相应请求。网站与基础设施提供者会收到 IP、请求路径等正常网络信息，并可能依据自己的政策保留运维或安全日志。应用代码不实施用户统计或个人棋局数据库。

## Limited use and deletion / 有限使用与删除
We do not sell user data or use it for advertising, credit decisions or unrelated purposes. Remove the extension to delete its extension-profile data. Separately clear site data for 4chess.cc, Chess.com and Lichess to remove applicable web/local caches; removing the extension does not remove all website storage. Clearing site data may also remove unrelated data saved by those websites. Model caches belong to each origin and may need downloading again.

不出售用户数据，不用于广告、信用评估或与复盘无关的用途。卸载扩展可移除扩展配置数据；网页缓存还需分别在浏览器中清理 4chess.cc、Chess.com、Lichess 的站点数据，卸载扩展不会清空所有网站存储。清理站点数据也可能删除这些网站保存的其他数据。模型缓存按来源分别保存，清理后可能需要重新下载。

## Contact and changes / 联系与更新
Questions and requests: https://github.com/keluoke/4chess/issues. This policy describes release 1.0.7, updated 2026-10-14. Material changes will be reflected on this page.

问题与请求请通过 https://github.com/keluoke/4chess/issues 联系。本政策对应 1.0.7，更新于 2026-10-14；重大变化将在本页更新。
