# 上架前清单与提审指南（Chrome Web Store Submission Checklist）

> 本文档为「Maia 3」扩展提交 Chrome Web Store 的操作流程与自检清单。**未修改任何源代码。**
> 图形素材为 AI 生成的概念示意图，正式提交前请替换为真实产品截图（见第四节）。

---

## 一、打包扩展（生成 ZIP）

商店只接受 **ZIP 包**（非源码目录本身）。在 `simoextension/` 根目录外执行：

```bash
# 在 simoextension 的父目录执行，避免把 chrome-web-store 等无关目录打进去
cd /Volumes/AI/coding/simoextension
zip -r -X ../maia3-extension-v1.0.0.zip \
  manifest.json background.js \
  analysis content engine functions cloudflare \
  models lib popup icons scripts \
  -x "*.DS_Store" "scripts/*.mjs" "scripts/*.py" "scripts/*.sh"
```

> 注意：
> - `models/maia3_model.bin`（约 28MB）会显著增大 ZIP，但属于内置权重，建议保留以便离线可用；若改为纯 CDN 下载，可从 ZIP 移除并在 popup/面板引导首次下载。
> - `scripts/`（测试与构建脚本）非运行所需，可不打进发布包以减小体积。
> - 务必包含 `icons/`（16/48/128）、`lib/`（Stockfish WASM）、`models/`（或确保 CDN 可用）。

---

## 二、Developer Dashboard 操作流程

1. 登录 [Chrome 开发者控制台](https://chrome.google.com/webstore/devconsole/)。
2. 「新建项目」→ 上传 `maia3-extension-v1.0.0.zip`。
3. 填写「商品详情」（字段见 `STORE_LISTING.md` 第一节速填表）：
   - 名称、简介、详细说明（中英双语）
   - 类别：Sports
   - 语言：简体中文 + English
   - 上传截图与小促销图块（见第三节尺寸）
4. 填写「隐私与安全」：
   - 勾选「单一用途（Single purpose）」并粘贴 `STORE_LISTING.md` 第六节声明。
   - 逐条填写权限理由（见 `STORE_LISTING.md` 第七节表）。
   - 填写「用户数据处理」披露：**我们不在服务器端收集或传输任何用户数据**（全部本地处理）。
   - 填写隐私政策网址（托管 `PRIVACY_POLICY.md` 后的 URL）。
5. 「分布」：地区选「所有国家/地区」；可见性选 Public（或先 Unlisted 测试）。
6. 提交审核。通常审核 1–3 个工作日；棋类工具若被质疑公平竞技，会要求补充 Fair Play 说明（见第四节）。

---

## 三、图形资源规格表

| 资源 | 必需 | 尺寸 | 本仓库文件 |
|---|---|---|---|
| 图标 128×128 | 必需 | 128×128 | `icons/icon128.png`（已存在，直接用） |
| 小促销图块（Small promo tile） | 推荐（用于精选） | 440×280 | `images/small-promo-tile-440x280.png`（AI 概念图，待替换） |
| 截图（Screenshot） | 必需（≥1，≤5） | 1280×800 或 640×400 | `images/screenshot-*.png`（AI 概念图，待替换） |
| 大促销图块（Large promo tile） | 已废弃，无需 | 920×680 | 不提供 |

> 截图建议 4 张，覆盖核心卖点：
> 1. 分析板三方对比 + 热力图（主图）
> 2. 「歧路 Diverge」浮动面板 / 设置抽屉
> 3. 独立大屏全盘分析（优势折线图 + 分歧列表）
> 4. 公平竞技锁定状态（合规卖点，降低拒审风险）

---

## 四、国际象棋工具 · 拒审高风险点与应对

棋类辅助工具是商店审核重点（易与作弊工具混淆）。务必在详情与披露中强调：

- ✅ **实时对局禁用**：`content/fair-play-guard.js` 在检测到活跃时钟/投降按钮时立即锁定，清空箭头与热力图、停止引擎。
- ✅ **仅赛后/分析台/练习题** 提供分析（Lichess/Chess.com 的分析台、研究室、练习题、已完赛归档）。
- ✅ **纯本地推理**：无云端引擎、无远程走法建议。
- ✅ 在详细说明开头放置「⚖️ 公平竞技优先」段落（已写入 `STORE_LISTING.md`）。

若审核被退回要求澄清，用一句话回复：
> 「本扩展在 Lichess / Chess.com 实时对局中通过 Fair Play Guard 强制禁用一切引擎与直觉辅助，仅在对局结束后于分析/复盘场景提供本地推理的对比分析，符合反作弊守则。」

---

## 五、README 待补充（非必须，但建议）

为提升透明度，可在 `README.md` 顶部补充：
- 一个公开可访问的隐私政策链接；
- 一句 Fair Play 承诺；
- 支持语言（zh / en）。

---

## 六、提交前自检（Checklist）

- [ ] 扩展 ZIP 已生成且能在 `chrome://extensions` 以「加载已解压」正常启动
- [ ] 图标 128×128 存在且清晰
- [ ] 名称 / 简介 / 详细说明已粘贴（中英）
- [ ] 类别 = Sports
- [ ] 权限理由逐条填写
- [ ] 单一用途声明已填写
- [ ] 隐私政策已托管并填 URL
- [ ] 用户数据披露 = 不收集/不传输
- [ ] 至少 1 张真实截图（建议 4 张），已替换 AI 概念图
- [ ] 小促销图块 440×280（如需精选）
- [ ] 地区 = 全部；可见性已选
