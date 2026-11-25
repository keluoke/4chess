"""Pull signed-in championship jobs from 4chess and run the Qimi engine libraries."""
import argparse
import asyncio
import json
import os
from pathlib import Path
import re
import sys
import time
from urllib.error import HTTPError
from urllib.parse import urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

RATINGS = (600, 1000, 1400, 1800, 2200, 2600)
VERSION = "sf19-mpv3-maia79m-v1"

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


HTTP = build_opener(NoRedirect())

def request_job(origin, token, op, data=None):
    query = urlencode({"event": "wcc2026", "round": "xLgOJ6cb", "op": op})
    req = Request(origin + "/api/live/analysis-work?" + query,
                  data=json.dumps(data or {}).encode(), method="POST",
                  headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json", "Accept": "application/json",
                           "User-Agent": "DivergeChess Live Precompute (+https://4chess.cc)"})
    try:
        with HTTP.open(req, timeout=18) as response:
            return json.load(response) if response.status == 200 else {}
    except HTTPError as error:
        if error.code == 409:
            return {"status": "stale"}
        raise


def cp(score):
    if score["mate"] is not None:
        mate = score["mate"]
        return (10000 - min(abs(mate), 100) * 10) * (1 if mate > 0 else -1)
    return score["cp"]


class Precompute:
    def __init__(self, sf, maia, depth, budget):
        self.sf = sf
        self.maia = maia
        self.depth = depth
        self.budget = budget
        self.cache = {}

    async def search(self, initial_fen, prefix, multipv=3, searchmoves=None, depth=None):
        return await self.sf.search(initial_fen, moves=prefix, depth=depth or self.depth,
                                    multipv=multipv, searchmoves=searchmoves, timeout=self.budget / 1000 + 1)

    async def engine_lines(self, initial_fen, prefix, count):
        for target in dict.fromkeys([self.depth, 18]):
            analysis = await self.search(initial_fen, prefix, depth=target)
            engine = analysis["engineName"]
            if not re.fullmatch(r"Stockfish 19(?:\.?[0-9]+)?", engine):
                raise RuntimeError(f"SF19 is required, got {engine}")
            lines = []
            for line in analysis["allPv"]:
                if not line["pv"] or not line.get("score") or line["score"].get("bound"):
                    continue
                score = line["score"]
                lines.append({"uci": line["pv"][0], "pv": line["pv"][:12], "depth": line["depth"],
                              "cp": score["cp"], "mate": score["mate"]})
            if len(lines) >= count and lines[0]["uci"] == analysis["bestmove"] and all(line["depth"] >= 16 for line in lines[:count]):
                return engine, lines[:count]
        raise RuntimeError("Stockfish did not return enough verified multipv lines within the budget")

    async def position(self, initial_fen, prefix):
        import chess

        key = initial_fen, tuple(prefix)
        if key in self.cache:
            return self.cache[key]
        board = chess.Board(initial_fen)
        history = [board.copy(stack=False)]
        for uci in prefix:
            board.push_uci(uci)
            history.append(board.copy(stack=False))
        if not any(board.legal_moves):
            return {"terminal": True}
        engine, lines = await self.engine_lines(initial_fen, prefix, min(len(list(board.legal_moves)), 3))
        batch = [{"board": board.copy(stack=False), "history": history[-8:], "self_elo": rating, "oppo_elo": rating}
                 for rating in RATINGS]
        predictions = await asyncio.to_thread(self.maia.predict_batch, batch, 3)
        policies = {rating: result["allLegalProbs"] for rating, result in zip(RATINGS, predictions, strict=True)}
        if any(not policy for policy in policies.values()):
            raise RuntimeError("Maia did not return all six legal-move distributions")
        result = {"engine": engine, "model": "maia3-79m", "lines": lines, "policies": policies}
        self.cache[key] = result
        if len(self.cache) > 8:
            del self.cache[next(iter(self.cache))]
        return result

    async def evidence(self, initial_fen, prefix, played):
        import chess

        board = chess.Board(initial_fen)
        for uci in prefix:
            board.push_uci(uci)
        prior = await self.position(initial_fen, prefix)
        policy = prior.get("policies", {}).get(2600, {})
        choices = sorted(policy, key=policy.get, reverse=True)
        if len(choices) < 2 or played not in policy:
            return None
        best, maia = prior["lines"][0], choices[0]
        if best["uci"] == maia == played:
            return None
        depth = best["depth"]
        candidates = {line["uci"]: cp(line) for line in prior["lines"] if line["depth"] >= depth}
        for uci in dict.fromkeys([played, maia]):
            if uci in candidates:
                continue
            result = await self.search(initial_fen, prefix, multipv=1, searchmoves=[uci])
            score = result.get("score")
            if result.get("bestmove") != uci or not score or score.get("bound") or result["depth"] < depth - 1:
                return None
            candidates[uci] = cp(score)
        sign = 1 if board.turn else -1
        return {"best": best["uci"], "maia": maia, "bestCp": candidates[best["uci"]] * sign,
                "playedCp": candidates[played] * sign, "maiaCp": candidates[maia] * sign,
                "probability": policy[played], "maiaProbability": policy[maia],
                "rank": choices.index(played) + 1, "depth": depth, "elo": 2600}

    async def analyze(self, job):
        if job["version"] != VERSION:
            raise RuntimeError("Analysis recipe mismatch")
        initial_fen, moves = job["initialFen"], job["moves"]
        result = dict(await self.position(initial_fen, moves))
        if moves:
            try:
                result["evidence"] = await self.evidence(initial_fen, moves[:-1], moves[-1])
            except RuntimeError:
                # The next-move forecast remains usable without a verified badge.
                result["evidence"] = None
        return result


async def run(args, token):
    from maia_runner import MaiaRunner
    from sf_pool import StockfishProcessPool

    sf = StockfishProcessPool(binary_path=args.stockfish, threads=args.threads)
    maia = MaiaRunner(checkpoint_path=args.checkpoint, max_threads=args.threads)
    service = Precompute(sf, maia, args.depth, args.budget)
    if args.fixture:
        job = json.loads(Path(args.fixture).read_text())
        print(json.dumps(await service.analyze(job)))
        return
    claimed = 0
    while args.jobs == 0 or claimed < args.jobs:
        started = time.monotonic()
        try:
            job = await asyncio.to_thread(request_job, args.origin, token, "claim")
            if job.get("status") != "claimed":
                if args.jobs and job.get("status") == "idle":
                    break
                await asyncio.sleep(8)
                continue
            claimed += 1
            try:
                result = await service.analyze(job)
                published = await asyncio.to_thread(request_job, args.origin, token, "publish",
                                                    {"lease": job["lease"], "result": result})
            except Exception as error:
                await asyncio.to_thread(request_job, args.origin, token, "publish", {"lease": job["lease"], "retry": True})
                print(f"round={job['round']} ply={job['ply']} {type(error).__name__}: {error}", file=sys.stderr, flush=True)
                continue
            if published.get("status") == "stale":
                print(f"round={job['round']} ply={job['ply']} lease superseded", flush=True)
                continue
            print(f"round={job['round']} ply={job['ply']} elapsed={time.monotonic() - started:.2f}s", flush=True)
        except Exception as error:
            if args.jobs:
                raise
            print(f"{type(error).__name__}: {error}", file=sys.stderr, flush=True)
            await asyncio.sleep(12)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin", default="https://4chess.cc")
    parser.add_argument("--stockfish", default=os.environ.get("STOCKFISH_BIN"))
    parser.add_argument("--checkpoint", default=os.environ.get("MAIA_CHECKPOINT"))
    parser.add_argument("--depth", type=int, default=24, choices=range(18, 27))
    parser.add_argument("--budget", type=int, default=12_000, help="milliseconds per Stockfish search")
    parser.add_argument("--threads", type=int, default=2)
    parser.add_argument("--jobs", type=int, default=0, help="finish after N jobs or on idle, 0 polls continuously")
    parser.add_argument("--fixture", help="read one job JSON locally and print the result")
    args = parser.parse_args()
    token = os.environ.get("LIVE_ANALYSIS_TOKEN")
    origin = urlsplit(args.origin)
    loopback = origin.hostname in {"127.0.0.1", "localhost"}
    if origin.scheme != "https" and not (origin.scheme == "http" and loopback):
        parser.error("Use HTTPS or a local test origin")
    if not args.fixture and not token:
        parser.error("LIVE_ANALYSIS_TOKEN is required")
    if not 100 <= args.budget <= 30_000 or not 1 <= args.threads <= 4 or args.jobs < 0:
        parser.error("Out of range budget, threads or job count")
    asyncio.run(run(args, token))
