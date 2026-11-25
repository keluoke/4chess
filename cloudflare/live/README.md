# 4chess.cc 赛事转播

`functions/api/live/` 提供赛事 JSON、单轮 JSON 和 PGN。`LIVE_COLLECTOR` 将所有 Lichess 请求交给同一个 Durable Object。开赛期间按需刷新 PGN，常规刷新间隔至少 12 秒。它保存最后收到的有效快照，并持久化 429 冷却时间。Pages 用各数据中心的短缓存向 Web 与棋谜提供相同数据。

## 部署

1. 在 4chess.cc 所在的 Cloudflare 账号部署回源 Worker。

   ```sh
   npx wrangler deploy --config cloudflare/live/wrangler.toml
   ```

2. 在 Pages 项目 `4chess-review` 的生产环境绑定 Durable Object 命名空间 `LiveCollector`，变量名为 `LIVE_COLLECTOR`，Worker 为 `diverge-live-collector`。配置预览环境时使用独立的预览命名空间。
3. 部署 `main` 并验证 `/live/`、`/api/live/event?id=wcc2026` 和 `/api/live/round?id=xLgOJ6cb`。开赛后用前一次响应的 ETag 验证未变化时返回 304。读取已发布的 PGN 使用 `format=pgn`。

## 赛事配置

在 `events.js` 更新赛事、固定的 Lichess 赛事 ID、赛程兜底和入口截止时间。赛事详情 API 自动刷新已知赛事的轮次列表。页面根据 `enabled` 和 `hideAfter` 隐藏入口，历史快照继续可用。

用户轮询次数与 Lichess 回源次数分别统计。Pages 和棋谜云函数各自承担下游请求量。遇到上游 429 时，至少等待 60 秒才再次回源；旧快照附带 `X-Stale: 1`，冷启动缺少快照时返回 503 和 `Retry-After`。

首步之前，空 PGN 表示等待着法。已发布的着法突然消失时，保留该轮快照。若冷启动缺少多轮已完赛比分，先请求整届 PGN，并按官方 `BroadcastURL` 回填已完赛轮次。

## 棋王战首局预计算试点

读端使用 `GET /api/live/analysis?event=wcc2026&round=xLgOJ6cb&ply=55`。省略 `ply` 读取当前官方末步。已完成的响应包含分析版本、局面身份、实际深度、Stockfish 前三候选及 Maia 79M 六档合法着法概率。待处理返回 202，未启用的轮次返回 404。Web 与小程序代理可以对 200 响应复用 ETag。Web 对照官方主线身份后使用结果，等待时仍可观赛和复制链接。

Cloudflare Worker 的 `LIVE_ANALYSIS_TOKEN` Secret 启用首局试点。由受信环境中的计算进程持有同一个凭证，通过 `POST /api/live/analysis-work?event=wcc2026&round=xLgOJ6cb&op=claim` 领取短期租约，再用 `op=publish` 回填。计算端只接收已采集的官方主线。计时和注释更新复用已有分析，棋谱更正时先核对局面身份再接受结果。任务领取优先末步，再补齐历史局面。

运行端需要棋谜分析运行环境中的 `sf_pool.py`、`maia_runner.py` 及其 Python 依赖、Stockfish 19 原生可执行文件和 Maia 79M 检查点。把凭证作为运行环境 Secret 注入。以下命令在有权安装运行任务的环境执行。

```sh
PYTHONPATH=/path/to/qimi/server/analysis python3 scripts/live_precompute.py \
  --stockfish /path/to/stockfish --checkpoint /path/to/maia3-79m.pt \
  --depth 24 --jobs 77
```

`--jobs` 为本次任务的领取上限，空闲时结束，可在已完成的对局上重复执行。省略时持续轮询，供已有的计算任务运行环境调用。单局面失败后会独立退避，其他历史局面可继续回填。赛时运行该计算进程才能持续填充结果。首局试点的只读接口与计算进程可分开验收。

计算优先尝试目标深度。预算内未取得完整的可用候选时，补跑 D18，并按响应里各候选的实际深度展示。

## 验证

```sh
npm run build
node scripts/test_live_broadcast.mjs
node scripts/test_live_analysis.mjs
node scripts/test_live_browser.mjs
```
