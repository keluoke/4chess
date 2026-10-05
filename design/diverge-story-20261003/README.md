# 歧路图文作品 · 2026-10-03

核心观点：把实战、直觉与计算放在一起，找到值得练的那一步。

共 8 页，顺序为：工具动机 → 三方视角 → 棋盘图例 → 教学局面 → 妙手／俗手 → 练棋流程 → 公平竞技 → 保存清单。

## 交付文件

- `index.html`：完整单文件网页，内嵌样式与矢量图形，可直接双击打开；不需服务器，不需下载字体或图片。手机按纵向阅读重新排版，正文保持可选择。
- `png/01-cover.png` 至 `png/08-save-and-start.png`：按阅读顺序命名的 1080×1440 PNG。
- `long.png`：8 页无损顺序拼接，1080×11520。
- `overview.jpg`：8 页总览，方便选图与审核。
- `publish.md`：发布标题、短正文、标签与集中来源说明。
- `content.json`：可编辑结构化内容。网页与图片全部使用这份数据。
- `styles.css`：可编辑的视觉样式。暖白纸面、墨绿、金色直觉路径、橙色重点；中文使用系统字体，标题与文字不烘焙在图形里。
- `build.py`：将内容与样式生成单文件 HTML；棋盘、箭头、热力图都是原创 SVG。
- `render.mjs`：用 Playwright 与 Chrome 渲染、导出和检查布局。
- `qa/report.json`：尺寸、溢出、正文与页脚间距、字体、375/390 像素手机宽度、双模式文本一致性检查。
- `qa/chess-example.json`：教学局面合法性及将杀校验。

## 编辑和重新导出

编辑 `content.json` 或 `styles.css` 后运行：

```sh
python3 build.py
node render.mjs
```

`render.mjs` 默认使用本机 Codex 工作区的 Playwright 与已安装 Chrome。换电脑时，通过环境变量 `PLAYWRIGHT_MODULE` 指向本地 Playwright 的 `index.mjs`，通过 `CHROME_PATH` 指向 Chrome 可执行文件。

网页导出模式是 `index.html?export=1`，每页固定 1080×1440。一般打开 `index.html` 是响应式网页模式。

## 内容与验证边界

产品功能依据项目当前源码整理，来源列在网页末尾与 `publish.md`。没有将源码检查描述为生产运行验收。教学页的自然候选是明确标注的假设，没有编造 Maia 概率或 Stockfish 评分。训练笔记与隔天重做是手动建议；没有宣称插件自动建题库或保证涨分。

浏览器截图检查覆盖全部 8 页，并核对手机纵向排版；它不是实体手机硬件测试。浏览器实际渲染使用 macOS PingFang SC / Songti SC，其他系统使用中文系统字体回退。跨系统重新导出时应再次检查行数与字体。
