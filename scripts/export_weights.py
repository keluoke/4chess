#!/usr/bin/env python3
"""
Exports PyTorch Maia-3 checkpoint (.pt) to a high-speed zero-copy binary format
for in-browser WebGPU and WebAssembly execution in the Chrome extension.
"""

import sys
import json
import struct
from pathlib import Path
import torch

BASE_DIR = Path(__file__).resolve().parent.parent
MODELS_DIR = BASE_DIR / "models"

def export_checkpoint(ckpt_path, output_path):
    print(f"[Exporter] 📂 Loading checkpoint: {ckpt_path.name}...")
    ckpt = torch.load(str(ckpt_path), map_location="cpu")
    sd = ckpt["model_state_dict"] if isinstance(ckpt, dict) and "model_state_dict" in ckpt else ckpt
    sd = {k.replace("smolgen", "gab"): v.contiguous() for k, v in sd.items()}

    # Determine architecture
    dim_vit = sd["token_projection.weight"].shape[0]
    num_heads = 8 if dim_vit == 256 else 32
    num_blocks = 8
    print(f"[Exporter] 🧠 Detected architecture: dim_vit={dim_vit}, num_heads={num_heads}, num_blocks={num_blocks}")

    # Build tensor table
    tensor_table = {}
    current_offset = 0
    all_bytes = bytearray()

    for name in sorted(sd.keys()):
        tensor = sd[name].float()
        raw_bytes = tensor.numpy().tobytes()
        tensor_table[name] = {
            "offset": current_offset,
            "length": len(raw_bytes),
            "shape": list(tensor.shape),
            "numel": tensor.numel()
        }
        all_bytes.extend(raw_bytes)
        current_offset += len(raw_bytes)

    # Encode header
    meta = {
        "magic": "MAIA3_CHESSFORMER",
        "version": 1,
        "dim_vit": dim_vit,
        "num_heads": num_heads,
        "num_blocks": num_blocks,
        "head_hid_dim": dim_vit,
        "total_params": sum(t["numel"] for t in tensor_table.values()),
        "tensors": tensor_table
    }
    meta_json = json.dumps(meta).encode("utf-8")
    meta_len = len(meta_json)

    # File format:
    # [4 bytes: MAGIC 'M3CF']
    # [4 bytes: meta_json_len (uint32)]
    # [meta_json bytes]
    # [tensor binary payload]
    with open(output_path, "wb") as f:
        f.write(b"M3CF")
        f.write(struct.pack("<I", meta_len))
        f.write(meta_json)
        f.write(all_bytes)

    out_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"[Exporter] ✅ Exported successfully to {output_path.name} ({out_mb:.2f} MB, {meta['total_params']:,} parameters)")

if __name__ == "__main__":
    src = MODELS_DIR / "maia3-5m.pt"
    dst = MODELS_DIR / "maia3_model.bin"
    export_checkpoint(src, dst)
