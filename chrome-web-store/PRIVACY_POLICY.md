# 隐私权政策 / Privacy Policy
## 歧路 Diverge · 人类直觉与双引擎国际象棋复盘 / Diverge Chess Analysis

> **生效日期 / Effective Date：** 2026年9月30日 (September 30, 2026)  
> **数据控制者 / 开发者 (Data Controller / Developer)：** keluoke / 歧路 Diverge 团队 (Diverge Chess Team)  
> **联系邮箱 / Contact Email：** contact@4chess.cc  
> **官方网站 / Official Website：** https://4chess.cc  

---

# 隐私权政策（简体中文）

欢迎使用「歧路 Diverge」（以下简称“本扩展”或“我们”）。我们高度重视国际象棋爱好者与用户的个人数据与隐私安全。本隐私政策根据《Chrome 应用商店开发者计划政策》及《用户数据常见问题（Chrome Web Store User Data FAQ）》制定，旨在向您真实、详尽地说明本扩展在运行过程中所涉及的本地数据处理、网络代理请求及存储机制。

---

## 1. 核心数据原则：本地优先与有限使用

本扩展的核心设计哲学是**纯浏览器端本地推理（100% In-Browser Local Processing）**：
- **无自建用户数据库**：我们不设立收集用户个人资料或棋局档案的自有数据库，绝不要求您注册个人账户。
- **纯本地运算**：Stockfish 19（WebAssembly）与 Maia-3 深度神经网络的计算推理均直接在您的设备硬件（CPU/GPU 内存）中独立完成。
- **有限使用承诺**：我们承诺绝不出售、出租任何用户数据，绝不将数据用于个性化广告、再营销或信用评估。

---

## 2. 本地处理的数据披露（依照 Chrome 商店要求）

根据 Chrome 应用商店规范，即便数据仅在您的客户端设备本地处理、未传输至开发者服务器，我们亦必须如实向您披露其范围与目的：

### (1) 网页内容与棋盘局面数据 (Website Content & Chess Data)
- **处理范围**：当您在受支持的国际象棋平台（`lichess.org` 与 `chess.com`）浏览分析板、学习研究室、战术习题或已完赛对局页面时，本扩展的内容脚本会在当前页面内存中读取：
  1. 当前棋盘的 FEN 局面字符串与走法坐标；
  2. 走法历史记谱（SAN / UCI / PGN）；
  3. 双方棋手的公开对局昵称（Usernames）与公开段位等级分（Ratings）；
  4. 对局状态证据（时钟运行状态、投降/认输按钮状态、终局裁判结果）。
- **处理目的**：用于在本地驱动 Maia-3 预测走法注意力热力图、计算人类直觉走法概率、调用 Stockfish 19 进行胜率与损耗评估，并在复盘工作台顶部展示对局双方信息。同时，`FairPlayGuard` 守卫依靠时钟与终局状态检测实时比赛，并在对局中强制切断所有引擎计算以恪守反作弊守则。
- **生命周期**：以上数据仅临时存在于当前标签页的运行时内存中，随着标签页关闭或切局即刻释放，绝不留存或持久化上传。

### (2) 本地持久化偏好设置 (User Preferences via `chrome.storage.local`)
- **存储内容**：
  1. 用户选定的目标直觉等级分（Elo: 1100、1500、1900、2200）；
  2. 界面显示语言（简体中文 / English）；
  3. 棋盘视觉开关（意图热力图开关、走法建议箭头开关）；
  4. 悬浮面板收起状态与悬浮球停靠坐标。
- **隐私界限**：这些配置仅保存在您本地浏览器的扩展专有沙箱中，我们无法远程读取或同步，您可随时在浏览器中卸载扩展或清除数据进行彻底清除。

---

## 3. 网络请求与数据代理机制核对

为了保证纯静态 Web 环境下的对局导入功能与神经网络权重下载，本扩展涉及以下透明、安全的网络交互：

### (1) 棋局公开导出与边缘代理请求 (Game Data & Edge Proxy)
当您在全盘分析页导入已完赛对局时：
- **Lichess 平台**：扩展直接向 Lichess 官方公开 API（`https://lichess.org/game/export/{gameId}`）发起单向只读 GET 请求，拉取公开棋谱。
- **Chess.com 平台**：由于第三方平台直接发起的跨域限制（CORS）与安全策略，扩展会请求位于 `https://4chess.cc/api/chesscom?id={gameId}` 的 Cloudflare Pages 边缘代理端点。
- **代理端点数据安全披露**：
  - 该代理端点代码开源可查（位于本仓库 `functions/api/chesscom.js`）；
  - **仅传输纯数字公开对局 ID**（8–16 位合法数字），用于向 Chess.com 官方开放 callback 接口拉取公开对局记谱；
  - **无状态代理（Stateless）**：边缘节点**绝不收集、记录、分析或存储**任何用户的身份凭证、Cookies、Session、IP 地址或浏览习惯，不设任何用户数据归档日志；
  - 数据流向为单向只读，获取公开走法后即时直传回客户端，绝无数据截留。

### (2) 神经网络模型权重下载 (Model Weights CDN)
- **请求内容**：首次运行或切换模型规格时，扩展从高速静态 CDN（`https://weights.4chess.cc/...`）下载 Maia-3 开源神经网络模型二进制权重（5M 规格约 28MB，23M 规格约 104MB）。
- **下载存储**：下载后的权重直接写入您设备本地浏览器的 IndexedDB 存储（`ModelCache`），实现后续使用瞬间秒开与离线复用。
- **无回传追踪**：此过程为标准的大文件静态 CDN 下载，不携带也不回传任何用户行为、身份或对局数据。

---

## 4. 第三方服务与数据共享

我们**不与任何第三方数据经纪商、广告商或统计分析机构共享任何数据**。
- 本扩展不包含任何第三方跟踪 SDK、广告脚本、数据埋点或行为统计分析代码（Google Analytics 等均未引入）。
- 扩展的所有网络通信仅限于上述公开棋谱获取与静态模型权重拉取。

---

## 5. 儿童隐私保护

本扩展为通用的国际象棋分析工具，不面向 13 岁以下儿童单独收集任何个人身份信息。由于本扩展不在远端服务器收集或存储任何用户数据，所有年龄段棋手均在完全相同的本地安全沙箱环境下使用。

---

## 6. 您的权利与数据清除

因为我们不在服务器端保存任何关于您的账户、身份或对局数据，所以不存在远端个人档案需要申请删除或注销：
- **清除本地数据**：您只需在 Chrome 浏览器中访问 `chrome://extensions`，点击本扩展的「详情」→「清除扩展数据」，或直接「移除扩展」，即可秒级彻底抹除本机保存的全部偏好配置与 IndexedDB 模型缓存。

---

## 7. 政策更新与联系方式

若本扩展引入重大架构调整或新增涉及用户数据的特性，我们将在更新日志与官方网站同步更新生效日期。

如果您对本隐私政策或本地数据处理有任何疑问，请随时联系开发者：
- **联系邮箱：** `contact@4chess.cc`
- **项目仓库与工单：** https://github.com/keluoke/4chess

---
---

# Privacy Policy (English)

Welcome to **Diverge (歧路)** ("the extension", "we", "us", or "our"). We deeply respect the privacy and data security of all chess players and users. This Privacy Policy is prepared in strict accordance with the **Google Chrome Web Store Developer Program Policies** and the **[Chrome Web Store User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)** to provide full transparency regarding our client-side data handling, network proxy communications, and local storage practices.

---

## 1. Core Principles: Local-First & Limited Use

The foundational architecture of Diverge is **100% In-Browser Local Processing**:
- **Zero Remote User Databases**: We do not maintain any remote databases that collect, store, or monitor your personal profile or chess match records. No account registration is ever required.
- **Client-Side Inferences**: Both Stockfish 19 (WebAssembly) and Maia-3 deep neural networks run directly inside your client device's browser memory (CPU/GPU).
- **Strict Limited Use**: We commit never to sell, license, or monetize your data, and never to use your data for advertising, remarketing, or credit/lending scoring.

---

## 2. Disclosure of Locally Processed Data (Chrome Store Requirement)

Per Chrome Web Store policy guidelines, **even when user data is processed solely on the client machine and never sent to a remote server, developers must disclose its scope, purpose, and handling**:

### (1) Webpage Content & Chess Board Data
- **Scope**: When you navigate analysis boards, studies, puzzles, or concluded match archives on supported platforms (`lichess.org` and `chess.com`), the extension's content scripts read directly from the active tab's runtime memory:
  1. Board position strings (FEN) and legal move coordinates;
  2. Notation records (SAN / UCI / PGN);
  3. Public player usernames and platform ratings;
  4. Match termination evidence (active clock countdown, resignation buttons, game-over banners).
- **Purpose**: Exclusively to drive the client-side Maia-3 attention heatmap rendering, compute human intuition probabilities, execute Stockfish 19 centipawn evaluations, and display player labels on the review studio. Furthermore, our `FairPlayGuard` uses clock and result states to guarantee complete engine lockout during live matches in accordance with fair-play rules.
- **Retention**: This information is processed strictly in temporary tab memory and is instantaneously discarded upon tab closure or position change. It is never logged or uploaded to any remote server.

### (2) Local Client Storage (`chrome.storage.local`)
- **Stored Items**:
  1. Default target intuition Elo rating (1100, 1500, 1900, 2200);
  2. Interface language preference (`zh-CN` / `en`);
  3. Visual overlay toggles (heatmap toggle, candidate arrows toggle);
  4. Floating panel minimized state and floating ball dock coordinates.
- **Privacy Boundary**: These values remain entirely within your local Chrome profile sandbox. We have zero remote access to them, and they are never synced to our servers.

---

## 3. Network Requests & Edge Proxy Audit

To enable PGN imports and neural network weight loading in a secure web environment, the extension engages in the following transparent network calls:

### (1) Public Game Imports & Edge Proxy Requests
When you import a finished match in the Full Game Analysis studio:
- **Lichess**: The extension sends a direct, unauthenticated GET request to Lichess's public API (`https://lichess.org/game/export/{gameId}`) to retrieve the public PGN.
- **Chess.com**: Due to CORS and browser-side CSP restrictions, the extension queries a dedicated Cloudflare Pages edge proxy endpoint: `https://4chess.cc/api/chesscom?id={gameId}`.
- **Edge Proxy Safety & Transparency**:
  - The proxy code is fully open-source (located in `functions/api/chesscom.js`);
  - **Only public numeric Game IDs (8–16 digits) are transmitted** to fetch public match callbacks from Chess.com;
  - **Stateless Operation**: The edge endpoint **never logs, collects, inspects, or stores** personal credentials, cookies, session identifiers, user IP addresses, or browsing history;
  - The communication is strictly one-way and read-only. Data is passed directly to the client browser without remote retention.

### (2) Neural Network Model Weights Delivery
- **Operation**: Upon initial use or model switching, the extension downloads Maia-3 open-source neural network weights (5M model ~28MB, 23M model ~104MB) from our high-speed static CDN (`https://weights.4chess.cc/...`).
- **Client Cache**: The binary weights are saved directly to your browser's local IndexedDB (`ModelCache`) for instant subsequent launches and offline review capability.
- **No Telemetry**: This is a purely static GET file transfer without telemetry, analytics, or user fingerprinting.

---

## 4. Third-Party Sharing

We **do not share, sell, or transfer any user data to third parties, data brokers, or advertising networks**.
- The extension contains zero tracking SDKs, zero advertising modules, and zero third-party telemetry libraries (such as Google Analytics).
- All network communication is restricted exclusively to public chess exports and static model delivery as detailed above.

---

## 5. Children's Privacy

Diverge is a general-purpose chess review utility and does not knowingly collect personal information from children under 13. Because our architecture handles data locally without server-side user profiles, all users operate within the identical private, local sandbox.

---

## 6. Your Rights & Data Deletion

Because no personal information or chess games are stored on our servers, there is no remote account or database record to request deletion for:
- **Wiping Local Data**: You can permanently erase all local preferences, cached boards, and IndexedDB model weights at any moment by navigating to `chrome://extensions`, clicking **Details** on Diverge, and selecting **Clear data**, or by simply uninstalling the extension.

---

## 7. Contact Us

If you have any questions or feedback regarding this Privacy Policy or our local data practices, please contact:
- **Email:** `contact@4chess.cc`
- **GitHub Repository & Issues:** https://github.com/keluoke/4chess
