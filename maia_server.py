#!/usr/bin/env python3
"""
Maia-3 Local Engine Server (Zero-Latency Local Bridge for Chrome Extension)
Runs the full Maia-3 79M (or 5M) model with Apple Silicon MPS / CUDA / CPU acceleration.
Provides a REST API on http://127.0.0.1:8765 with CORS headers for Lichess and Chess.com.
"""

import sys
import os
import json
import time
import math
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
from types import SimpleNamespace

# Add maia3_src to path
BASE_DIR = Path(__file__).resolve().parent
MAIA3_DIR = BASE_DIR / "maia3_src"
if str(MAIA3_DIR) not in sys.path:
    sys.path.insert(0, str(MAIA3_DIR))

import torch
import chess
import chess.engine
import shutil
from maia3.models import MAIA3Model
from maia3.model_registry import MODEL_SPECS
from maia3.dataset import tokenize_board
from maia3.utils import get_all_possible_moves, mirror_move

# Global state
GLOBAL_ENGINE = {
    "model": None,
    "model_name": "maia3-79m",
    "device": None,
    "device_name": "cpu",
    "all_moves": [],
    "all_moves_dict": {},
    "ready": False,
    "total_inferences": 0
}

GLOBAL_STOCKFISH = {
    "engine": None,
    "available": False,
    "path": None
}

def init_stockfish():
    sf_candidates = [
        shutil.which("stockfish"),
        "/opt/homebrew/bin/stockfish",
        "/usr/local/bin/stockfish",
        "/usr/bin/stockfish"
    ]
    sf_path = next((p for p in sf_candidates if p and Path(p).exists()), None)
    if sf_path:
        try:
            GLOBAL_STOCKFISH["engine"] = chess.engine.SimpleEngine.popen_uci(sf_path)
            GLOBAL_STOCKFISH["available"] = True
            GLOBAL_STOCKFISH["path"] = sf_path
            print(f"[Maia Server] 🐟 Stockfish 引擎已就绪: {sf_path}")
        except Exception as e:
            print(f"[Maia Server] ⚠️ Stockfish 初始化失败: {e}")
    else:
        print("[Maia Server] ℹ️ 未检测到本地 Stockfish 二进制文件，将仅使用 Maia 3。")

def load_maia_model(model_name="maia3-79m"):
    print(f"[Maia Server] 🚀 Loading {model_name}...")
    
    # 1. Device selection
    if torch.backends.mps.is_available():
        device = torch.device("mps")
        device_name = "Apple Silicon GPU (MPS)"
    elif torch.cuda.is_available():
        device = torch.device("cuda")
        device_name = f"CUDA GPU ({torch.cuda.get_device_name(0)})"
    else:
        device = torch.device("cpu")
        device_name = "CPU (Vectorized)"

    # 2. Spec lookup
    specs = [s for s in MODEL_SPECS if s.name == model_name or model_name in s.aliases]
    if not specs:
        raise ValueError(f"Unknown model name: {model_name}")
    spec = specs[0]
    cfg = SimpleNamespace(**spec.config)

    # 3. Model construction
    model = MAIA3Model(cfg).to(device)

    # 4. Checkpoint path
    candidates = [
        BASE_DIR / "models" / f"{model_name}.pt",
        BASE_DIR / "models" / f"{spec.name}.pt",
        MAIA3_DIR / f"{model_name}.pt",
        MAIA3_DIR / f"{spec.name}.pt",
    ]
    ckpt_path = next((p for p in candidates if p.exists()), None)
    if not ckpt_path:
        raise FileNotFoundError(f"Checkpoint not found in {[str(p) for p in candidates]}")

    print(f"[Maia Server] 📂 Reading checkpoint: {ckpt_path.name} ({ckpt_path.stat().st_size / (1024*1024):.1f} MB)...")
    ckpt = torch.load(str(ckpt_path), map_location="cpu")
    sd = ckpt["model_state_dict"] if isinstance(ckpt, dict) and "model_state_dict" in ckpt else ckpt
    sd = {k.replace("smolgen", "gab"): v for k, v in sd.items()}
    model.load_state_dict(sd, strict=False)
    model.eval()

    # 5. Move vocab
    all_moves = get_all_possible_moves()
    all_moves_dict = {m: i for i, m in enumerate(all_moves)}

    GLOBAL_ENGINE["model"] = model
    GLOBAL_ENGINE["model_name"] = spec.display_name
    GLOBAL_ENGINE["device"] = device
    GLOBAL_ENGINE["device_name"] = device_name
    GLOBAL_ENGINE["all_moves"] = all_moves
    GLOBAL_ENGINE["all_moves_dict"] = all_moves_dict
    GLOBAL_ENGINE["ready"] = True

    # Warmup
    print(f"[Maia Server] ⚡ Warming up {spec.display_name} on {device_name}...")
    b = chess.Board()
    toks = tokenize_board(b).unsqueeze(0).repeat(1, 1, 8).to(device)
    elo_t = torch.tensor([1500.0]).to(device)
    with torch.no_grad():
        _ = model(toks, elo_t, elo_t)
    print(f"[Maia Server] ✅ {spec.display_name} is ready for zero-latency inference!")

def evaluate_position(fen=None, moves=None, elo=1500, top_k=5):
    t_start = time.perf_counter()
    model = GLOBAL_ENGINE["model"]
    device = GLOBAL_ENGINE["device"]
    all_moves_dict = GLOBAL_ENGINE["all_moves_dict"]

    # Reconstruct board
    if fen:
        board = chess.Board(fen)
    else:
        board = chess.Board()

    # Replay moves if provided
    if moves and isinstance(moves, list):
        for m in moves:
            try:
                board.push_uci(m)
            except Exception:
                pass

    active_turn = "w" if board.turn == chess.WHITE else "b"
    legal_moves = list(board.legal_moves)
    if not legal_moves:
        return {
            "fen": board.fen(),
            "activeTurn": active_turn,
            "moves": [],
            "heatmap": [0.0] * 64,
            "isCheck": board.is_check(),
            "isCheckmate": board.is_checkmate(),
            "isStalemate": board.is_stalemate(),
            "latencyMs": round((time.perf_counter() - t_start) * 1000, 2)
        }

    # Tokenize board (Maia automatically mirrors for Black)
    toks = tokenize_board(board).unsqueeze(0).repeat(1, 1, 8).to(device)
    self_elo = torch.tensor([float(elo)]).to(device)
    oppo_elo = torch.tensor([float(elo)]).to(device)

    with torch.no_grad():
        logits_move, val_logits, _ = model(toks, self_elo, oppo_elo)

    # Win / Draw / Loss probabilities
    val_probs = torch.softmax(val_logits[0], dim=-1).cpu().tolist()
    # Maia order: [win, draw, loss]
    win_rate = round(val_probs[0] * 100, 1)

    # Map legal moves to model vocab
    if board.turn == chess.WHITE:
        vocab_keys = [m.uci() for m in legal_moves]
    else:
        # For Black, legal moves are mirrored to White's frame of reference
        vocab_keys = [mirror_move(m.uci()) for m in legal_moves]

    valid_indices = []
    valid_legal_moves = []
    for m, key in zip(legal_moves, vocab_keys):
        if key in all_moves_dict:
            valid_indices.append(all_moves_dict[key])
            valid_legal_moves.append(m)

    if not valid_indices:
        return {
            "fen": board.fen(),
            "activeTurn": active_turn,
            "moves": [],
            "heatmap": [0.0] * 64,
            "latencyMs": round((time.perf_counter() - t_start) * 1000, 2)
        }

    sub_logits = logits_move[0, valid_indices]
    move_probs = torch.softmax(sub_logits, dim=-1).cpu().tolist()

    # Format scored moves
    scored = []
    square_weights = [0.0] * 64
    for m, prob in zip(valid_legal_moves, move_probs):
        san = board.san(m)
        from_sq = m.from_square
        to_sq = m.to_square
        p_pct = round(prob * 100, 2)
        scored.append({
            "uci": m.uci(),
            "san": san,
            "prob": p_pct,
            "from": chess.square_name(from_sq),
            "to": chess.square_name(to_sq),
            "fromSq": from_sq,
            "toSq": to_sq,
            "isCapture": board.is_capture(m),
            "isCheck": board.gives_check(m)
        })
        # Accumulate attention heatmap (target square receives attention)
        square_weights[to_sq] += prob

    scored.sort(key=lambda x: -x["prob"])

    # Normalize heatmap 0..1
    max_w = max(square_weights) if square_weights else 1.0
    if max_w > 0:
        heatmap = [round(w / max_w, 3) for w in square_weights]
    else:
        heatmap = [0.0] * 64

    GLOBAL_ENGINE["total_inferences"] += 1
    latency = round((time.perf_counter() - t_start) * 1000, 2)

    # Stockfish Analysis & Human vs Engine Comparison
    stockfish_data = None
    comparison = None
    if GLOBAL_STOCKFISH["available"] and GLOBAL_STOCKFISH["engine"]:
        try:
            sf_engine = GLOBAL_STOCKFISH["engine"]
            sf_res = sf_engine.analyse(board, chess.engine.Limit(time=0.04, depth=12))
            pv = sf_res.get("pv", [])
            sf_score_obj = sf_res.get("score")
            
            if pv:
                best_m = pv[0]
                sf_san = board.san(best_m)
                sf_uci = best_m.uci()
                
                score_pov = sf_score_obj.pov(board.turn) if sf_score_obj else None
                if score_pov and score_pov.is_mate():
                    mate_n = score_pov.mate()
                    formatted_score = f"#{mate_n}"
                    cp_val = 10000 if mate_n > 0 else -10000
                elif score_pov:
                    cp_val = score_pov.score()
                    formatted_score = f"{cp_val/100:+.2f}"
                else:
                    formatted_score = "0.00"
                    cp_val = 0

                pv_sans = []
                temp_b = board.copy()
                for m in pv[:4]:
                    try:
                        pv_sans.append(temp_b.san(m))
                        temp_b.push(m)
                    except Exception:
                        break

                stockfish_data = {
                    "available": True,
                    "bestMove": {
                        "uci": sf_uci,
                        "san": sf_san,
                        "from": chess.square_name(best_m.from_square),
                        "to": chess.square_name(best_m.to_square),
                        "fromSq": best_m.from_square,
                        "toSq": best_m.to_square
                    },
                    "score": formatted_score,
                    "scoreCp": cp_val,
                    "pv": pv_sans
                }

                if scored:
                    top_maia = scored[0]
                    agreed = (top_maia["uci"] == sf_uci)
                    if agreed:
                        comparison = {
                            "agreed": True,
                            "type": "consensus",
                            "badge": "🎯 人机高度共识",
                            "summary": f"直觉与客观一致: {top_maia['san']} 既是人类高频首选({top_maia['prob']}%)，也是引擎最优解({formatted_score})。"
                        }
                    else:
                        comparison = {
                            "agreed": False,
                            "type": "divergence",
                            "badge": "⚠️ 人类直觉与引擎分歧",
                            "summary": f"人类偏好 {top_maia['san']} ({top_maia['prob']}%)，但 Stockfish 测算最佳为 {sf_san} (评估 {formatted_score})。"
                        }
        except Exception:
            pass

    return {
        "status": "ok",
        "model": GLOBAL_ENGINE["model_name"],
        "device": GLOBAL_ENGINE["device_name"],
        "fen": board.fen(),
        "activeTurn": active_turn,
        "elo": elo,
        "winRate": win_rate,
        "valProbs": {
            "win": round(val_probs[0], 3),
            "draw": round(val_probs[1], 3),
            "loss": round(val_probs[2], 3)
        },
        "moves": scored[:top_k],
        "allLegalCount": len(legal_moves),
        "heatmap": heatmap,
        "stockfish": stockfish_data,
        "comparison": comparison,
        "latencyMs": latency
    }

class MaiaRequestHandler(BaseHTTPRequestHandler):
    def _set_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")

    def do_OPTIONS(self):
        self.send_response(204)
        self._set_cors_headers()
        self.end_headers()

    def do_GET(self):
        if self.path in ("/health", "/", "/status"):
            self.send_response(200)
            self._set_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            payload = {
                "status": "ready" if GLOBAL_ENGINE["ready"] else "loading",
                "model": GLOBAL_ENGINE["model_name"],
                "device": GLOBAL_ENGINE["device_name"],
                "inferences": GLOBAL_ENGINE["total_inferences"]
            }
            self.wfile.write(json.dumps(payload).encode("utf-8"))
        else:
            self.send_response(404)
            self._set_cors_headers()
            self.end_headers()

    def do_POST(self):
        if self.path == "/predict":
            content_len = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_len).decode("utf-8")
            try:
                data = json.loads(body)
                fen = data.get("fen")
                moves = data.get("moves")
                elo = int(data.get("elo", 1500))
                top_k = int(data.get("top_k", 5))

                result = evaluate_position(fen=fen, moves=moves, elo=elo, top_k=top_k)
                self.send_response(200)
                self._set_cors_headers()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(result).encode("utf-8"))
            except Exception as e:
                self.send_response(500)
                self._set_cors_headers()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
        else:
            self.send_response(404)
            self._set_cors_headers()
            self.end_headers()

    def log_message(self, format, *args):
        # Concise logging
        pass

def run_server(port=8765, model_name="maia3-79m"):
    load_maia_model(model_name)
    init_stockfish()
    server_address = ("127.0.0.1", port)
    httpd = HTTPServer(server_address, MaiaRequestHandler)
    print(f"\n=======================================================")
    print(f"🔥 Maia-3 Engine Server running on http://127.0.0.1:{port}")
    print(f"⚡ Active Model: {GLOBAL_ENGINE['model_name']}")
    print(f"🎮 Hardware:     {GLOBAL_ENGINE['device_name']}")
    if GLOBAL_STOCKFISH["available"]:
        print(f"🐟 Stockfish:    已整合 ({GLOBAL_STOCKFISH['path']})")
    print(f"🌐 Chrome Extension auto-connect enabled with CORS!")
    print(f"=======================================================\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[Maia Server] Shutting down...")
        if GLOBAL_STOCKFISH["engine"]:
            try:
                GLOBAL_STOCKFISH["engine"].quit()
            except Exception:
                pass
        httpd.server_close()

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Maia-3 Local Engine Server")
    parser.add_argument("--port", type=int, default=8765, help="Port to listen on (default 8765)")
    parser.add_argument("--model", type=str, default="maia3-79m", choices=["maia3-79m", "maia3-5m"], help="Model to load")
    args = parser.parse_args()
    run_server(port=args.port, model_name=args.model)
