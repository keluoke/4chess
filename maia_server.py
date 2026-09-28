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
    server_address = ("127.0.0.1", port)
    httpd = HTTPServer(server_address, MaiaRequestHandler)
    print(f"\n=======================================================")
    print(f"🔥 Maia-3 Engine Server running on http://127.0.0.1:{port}")
    print(f"⚡ Active Model: {GLOBAL_ENGINE['model_name']}")
    print(f"🎮 Hardware:     {GLOBAL_ENGINE['device_name']}")
    print(f"🌐 Chrome Extension auto-connect enabled with CORS!")
    print(f"=======================================================\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[Maia Server] Shutting down...")
        httpd.server_close()

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Maia-3 Local Engine Server")
    parser.add_argument("--port", type=int, default=8765, help="Port to listen on (default 8765)")
    parser.add_argument("--model", type=str, default="maia3-79m", choices=["maia3-79m", "maia3-23m", "maia3-5m"], help="Model to load")
    args = parser.parse_args()
    run_server(port=args.port, model_name=args.model)
