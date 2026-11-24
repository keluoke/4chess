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

## 验证

```sh
npm run build
node scripts/test_live_broadcast.mjs
node scripts/test_live_browser.mjs
```
