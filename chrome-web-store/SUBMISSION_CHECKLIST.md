# 上架前清单与提审指南（Chrome Web Store Submission Checklist）

> 本文档为「歧路 Diverge（Diverge Chess Analysis）」扩展提交 Chrome Web Store 的标准操作流程与合规自检清单。
> 请务必严格遵循仓库铁律与 Chrome Web Store 最新开发者计划政策（含 [User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)）。

---

## 一、打包扩展（生成轻量 ZIP）

Chrome 商店仅接受 **ZIP 包**。根据项目架构铁律，**严禁将大模型二进制文件（如 `maia3_model.bin` 等）打入扩展包**；所有神经网络权重均由 CDN 流式按需加载并存入客户端 IndexedDB，扩展安装包应保持极简纯代码与轻量资源。

在仓库根目录执行以下打包命令：

```bash
cd /Volumes/AI/coding/simoextension

# 打包纯轻量运行包（仅包含运行时必须的脚本、静态资源及 1.7MB Stockfish WASM，压缩后仅约 1.3 MB）
zip -r -X ../diverge-extension-v1.0.0.zip \
  manifest.json background.js index.html favicon.svg \
  analysis content engine lib popup icons \
  -x "*.DS_Store" "*__MACOSX*"
```

> **打包安全自检：**
> - ✅ **严禁包含 `models/` 目录**：Maia-3 模型权重 100% 走 CDN（`https://weights.4chess.cc/...`）动态分发并缓存在浏览器本地，严禁塞入 28MB+ 文件，保障上传秒过审。
> - ✅ **排除无关工程目录**：已自动排除 `scripts/`（开发测试脚本）、`chrome-web-store/`（提审素材）、`functions/` 与 `cloudflare/`（云端部署配置）、`.git/`。
> - ✅ **包含完整运行资源**：`manifest.json`、`background.js`、`content/`（守卫与悬浮球）、`engine/`（核心驱动）、`lib/`（Stockfish 19 WASM）、`analysis/`（全盘分析工作台）、`icons/`（16/48/128/svg）。

---

## 二、Developer Dashboard 提审操作流程

1. 登录 [Chrome 开发者控制台 (Chrome Web Store Developer Dashboard)](https://chrome.google.com/webstore/devconsole/)。
2. 点击「新建项目」→ 上传刚才生成的 `diverge-extension-v1.0.0.zip`（体积约 1.3MB，上传极快）。
3. **商品详情（Store Listing）**（文案见 `STORE_LISTING.md`）：
   - 名称：`歧路 Diverge · 人类直觉与双引擎国际象棋复盘` / `Diverge · Chess Intuition & Dual-Engine Review`
   - 简短说明与详细说明（粘贴 `STORE_LISTING.md` 中的中英双语介绍）
   - 类别：**Sports（体育）** 或 **Productivity（效率）**
   - 语言：至少添加 **简体中文 (zh-CN)** 与 **English (en)**
   - 屏幕截图与促销图块（见第三节）
4. **隐私权与数据安全（Privacy & User Data）——【重点合规项】**：
   - **单一用途（Single Purpose）**：勾选并粘贴 `STORE_LISTING.md` 第六节中的单一用途声明。
   - **权限声明（Permission Justifications）**：逐条填写 `storage`、`activeTab` 及各域名的申请理由（直接对照 `STORE_LISTING.md` 第七节表格）。
   - **用户数据处理披露（User Data Disclosures）**：
     > ⚠️ **重要合规原则**：根据 Chrome 商店政策，**即便数据 100% 仅在用户本机浏览器内部处理、不上传服务器，也必须如实勾选并披露！切勿直接勾选“未处理任何用户数据”。**
     - 在数据类别中勾选：**Website Content（网页内容）**
     - 勾选说明中填入：
       > *“The extension reads chess board positions (FEN), move notations (SAN/PGN), and public player usernames solely on Lichess.org and Chess.com to provide real-time intuition predictions, blunders detection, and post-game review. All data is processed 100% locally in the user's browser memory via WebAssembly and Float32 neural network inference. No personal data, browsing history, or game information is ever transmitted to, stored on, or shared with any developer-owned or external servers.”*
     - 勾选合规认证复选框（Certification）：
       - [x] 不将用户数据出售给第三方
       - [x] 不将用户数据用于个性化广告或借贷征信
       - [x] 不将用户数据用于与扩展核心功能无关的用途
   - **隐私权政策网址（Privacy Policy URL）**：填入公开托管的隐私政策页面地址（如 `https://4chess.cc/privacy` 或 GitHub Pages 对应 URL）。
5. **分发范围（Distribution）**：
   - 地区选择「所有国家/地区」；
   - 可见性选择 Public（公开）或先 Unlisted（不公开链接）进行自测。
6. 点击「提交以供审核」。通常审核周期为 1–3 个工作日。

---

## 三、图形素材规格要求

| 素材类型 | 必需度 | 尺寸规格 | 仓库现有参考文件 |
|---|---|---|---|
| **扩展主图标** | 必需 | 128×128 (PNG) | `icons/icon128.png`（已包含标准歧路品牌矢量转图） |
| **小促销图块 (Small promo tile)** | 推荐（用于商店搜索精选） | 440×280 (PNG) | `chrome-web-store/images/small-promo-tile-440x280.png` |
| **功能截图 (Screenshots)** | 必需（1–5张） | 1280×800 或 640×400 | `chrome-web-store/images/screenshot-*.png` |

> **建议上传 4 张真实复盘截图：**
> 1. **对局复盘工作台主界面**：展示双引擎胜率评估折线图、走法分歧列表与三方走法卡片。—— ✅ 已用真实截图合成 `screenshot-3-review-studio-1280x800.png`（2026-09-30）
> 2. **棋盘注意力热力图与走法建议**：展示棋盘上的翡翠绿箭头（引擎最佳）与金色实线箭头（人类直觉）。—— ✅ 已用真实截图合成 `screenshot-1-analysis-board-1280x800.png`（2026-09-30）
> 3. **「歧路 Diverge」轻量悬浮面板**：展示胶囊按钮、直觉等级分调节与极简双引擎状态。—— ⚠️ 仍为 AI 概念图，建议替换真实截图
> 4. **实时对局公平竞技锁定状态**：展示对局进行中的锁定界面，向审核团队直观证明防作弊机制。—— ⚠️ 仍为 AI 概念图，建议替换真实截图
>
> 小促销图块已重绘为纯文字版式：**「歧路 Diverge」+ slogan「人类直觉 × 引擎最优」**（PIL 程序绘制，440×280，文字清晰无水印）。

---

## 四、国际象棋类扩展防拒审核心说明

棋类工具在 Chrome 应用商店属于高风险审核类目（审核团队极为警惕在线辅助作弊软件）。本项目在设计之初就确立了**公平竞技铁律**，审核要点如下：

1. **实时对局绝对禁算**：
   `content/fair-play-guard.js` 具备毫秒级状态机，在检测到活跃时钟、认输按钮或投降选项时立即进入死锁状态，清空所有提示与热力图，彻底停止 Stockfish 与 Maia 计算。
2. **合法场景限定**：
   仅允许在赛后复盘（已有终局裁定）、棋局分析台（`/analysis`、`/study`）及战术习题（`/puzzles`）中启用。
3. **纯本地离线推理**：
   不存在任何可能被用于作弊的远程实时传谱与云端算力。

> **若审核团队询问或退回要求澄清公平竞技（Fair Play），请直接使用以下标准答复：**
> 
> *"Diverge (歧路) strictly adheres to the Fair Play & Anti-Cheat regulations of Chess.com and Lichess.org. The extension includes a tamper-proof FairPlayGuard module that permanently disables all engine analysis, move recommendations, and visual heatmaps during any active live game. It only unlocks for post-game retrospective analysis and on dedicated analysis boards (/analysis, /study, /puzzles). All computational inferences are executed 100% locally on the client's machine."*

---

## 五、最终提审自检清单（Checklist）

- [ ] 打包 ZIP 大小已核实（约为 1.3MB 纯轻量包，**绝无 `models/*.bin` 大文件**）
- [ ] 在 `chrome://extensions` 以开发者模式加载 ZIP 解压目录测试，功能正常且控制台无报错
- [ ] 图标 128×128 显示清晰且为歧路 Diverge 翠绿分叉标
- [ ] 商店名称、简介与详细说明已在中英双语填入
- [ ] 权限申请理由逐条如实填写
- [ ] 单一用途声明已勾选并填写
- [ ] **用户数据处理如实勾选 Website Content，并声明仅本地处理、不上传外部服务器**
- [ ] 隐私政策 URL 可公开访问且内容已去占位符并与实际数据处理一致
- [ ] 至少 1 张清晰的功能截图已上传
- [ ] 提交审核并记录提审单号
