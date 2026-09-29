# 隐私政策 / Privacy Policy
## Maia 3 · 人类直觉热力图与预测器

> 本文件为提交 Chrome Web Store 所需的隐私政策。请将方括号占位符 `[ ]` 替换为你的实际信息后，托管到公开可访问的网址（如 GitHub Pages、个人或公司网站），并在开发者控制台填写该网址。
> 本文档未修改任何源代码。

---

# 隐私政策（简体中文）

**生效日期：** [2026-09-30]
**数据控制者 / 开发者：** [开发者或公司名称]
**联系邮箱：** [privacy@example.com]

## 1. 我们处理的数据原则

Maia 3 是一款**纯浏览器端**的国际象棋复盘扩展。我们的核心原则是：**你的棋局数据 100% 在你的设备本地处理，绝不上传至任何第三方服务器。**

## 2. 我们收集哪些数据

**我们不收集、不传输任何个人数据或棋局数据。**

具体而言：
- **棋局与局面数据（FEN / PGN / 走法）：** 仅在你的浏览器本地内存与 canvas/SVG 中用于实时分析展示，不会被网络发送、不会被存储到远程。
- **模型权重：** 扩展会从 `weights.4chess.cc` 与 `maia3-cdn.pages.dev` **下载** Maia 3 神经网络权重到你的浏览器本地缓存（IndexedDB）。这是单向资源获取，**不会**回传任何用户数据。
- **使用统计 / 分析：** 无。扩展不含任何分析、埋点、广告或第三方追踪 SDK。

## 3. 我们存储哪些数据

仅通过 Chrome 的 `chrome.storage.local` 在你本机保存**非敏感的用户偏好**：
- 直觉等级分（Elo）设置
- 界面语言
- 面板/浮窗开关与位置
- 模型权重 CDN 节点地址

这些数据仅存于你的浏览器本地配置，不会同步到我们的服务器，也不会被我们读取。

## 4. 数据共享与第三方

我们**不与任何第三方共享**用户数据。扩展运行不依赖任何会将数据外发的后端服务。模型权重 CDN 仅用于文件下载（见第 2 条）。

## 5. 儿童隐私

本扩展为通用棋类分析与学习工具，不专门针对儿童设计，也不收集任何年龄用户的个人数据。

## 6. 你的权利

由于我们不存储任何可在服务器端关联到你的个人数据，因此不存在需要导出或删除的远端档案。你随时可通过浏览器「扩展管理 → 清除数据 / 移除扩展」来抹除本地全部偏好与缓存。

## 7. 政策变更

若本政策发生变更，我们将在扩展更新说明与本页面同步更新生效日期。

## 8. 联系我们

有关隐私的任何问题，请联系：[privacy@example.com]

---

# Privacy Policy (English)

**Effective date:** [2026-09-30]
**Data controller / Developer:** [Developer or company name]
**Contact:** [privacy@example.com]

## 1. Our data principle

Maia 3 is an **in-browser** chess review extension. Our core principle: **your game data is processed 100% locally on your device and is never uploaded to any third-party server.**

## 2. What we collect

**We do not collect or transmit any personal data or game data.**

Specifically:
- **Game & position data (FEN / PGN / moves):** processed only in your browser's local memory and rendering layer for real-time analysis. Never sent over the network, never stored remotely.
- **Model weights:** the extension **downloads** Maia 3 neural-network weights from `weights.4chess.cc` and `maia3-cdn.pages.dev` into your browser's local cache (IndexedDB). This is a one-way resource fetch; **no** user data is sent back.
- **Analytics / tracking:** none. The extension contains no analytics, no埋点, no ads, and no third-party tracking SDKs.

## 3. What we store

Only non-sensitive user **preferences** are saved on your device via Chrome's `chrome.storage.local`:
- Intuition rating (Elo) setting
- Interface language
- Panel / floating-ball toggle and position
- Model weight CDN endpoint

These stay in your local browser profile; we never read or sync them to a server.

## 4. Data sharing & third parties

We **share no user data with any third party**. The extension relies on no backend that exfiltrates data. The model-weight CDN is used only for file download (see §2).

## 5. Children's privacy

This extension is a general-purpose chess analysis and learning tool. It is not directed specifically at children and collects no personal data from any user regardless of age.

## 6. Your rights

Because we store no server-side personal data tied to you, there is no remote profile to export or delete. You can erase all local preferences and cache at any time via your browser's extension settings (clear data / remove extension).

## 7. Changes

If this policy changes, we will update the effective date here and in the extension's release notes.

## 8. Contact

Questions about privacy: [privacy@example.com]
