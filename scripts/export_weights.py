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

def export_checkpoint(ckpt_path, output_path, fp16=False):
    dtype = "float16" if fp16 else "float32"
    print(f"[Exporter] 📂 Loading checkpoint: {ckpt_path.name} ({dtype})...")
    ckpt = torch.load(str(ckpt_path), map_location="cpu")
    sd = ckpt["model_state_dict"] if isinstance(ckpt, dict) and "model_state_dict" in ckpt else ckpt
    sd = {k.replace("smolgen", "gab"): v.contiguous() for k, v in sd.items()}

    # Determine architecture
    dim_vit = sd["token_projection.weight"].shape[0]
    num_heads = dim_vit // 32
    num_blocks = 8
    print(f"[Exporter] 🧠 Detected architecture: dim_vit={dim_vit}, num_heads={num_heads}, num_blocks={num_blocks}, dtype={dtype}")

    # Build tensor table
    tensor_table = {}
    current_offset = 0
    all_bytes = bytearray()

    for name in sorted(sd.keys()):
        tensor = sd[name].half() if fp16 else sd[name].float()
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
        "dtype": dtype,
        "dim_vit": dim_vit,
        "num_heads": num_heads,
        "num_blocks": num_blocks,
        "head_hid_dim": dim_vit,
        "total_params": sum(t["numel"] for t in tensor_table.values()),
        "tensors": tensor_table
    }
    meta_json = json.dumps(meta).encode("utf-8")
    # Ensure 4-byte alignment for float32 array payload
    pad = (4 - (len(meta_json) % 4)) % 4
    if pad > 0:
        meta_json += b" " * pad
    meta_len = len(meta_json)

    # File format:
    # [4 bytes: MAGIC 'M3CF']
    # [4 bytes: meta_json_len (uint32)]
    # [meta_json bytes (4-byte aligned)]
    # [tensor binary payload]
    with open(output_path, "wb") as f:
        f.write(b"M3CF")
        f.write(struct.pack("<I", meta_len))
        f.write(meta_json)
        f.write(all_bytes)

    out_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"[Exporter] ✅ Exported successfully to {output_path.name} ({out_mb:.2f} MB, {meta['total_params']:,} parameters)")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Export Maia-3 checkpoint to zero-copy binary")
    parser.add_argument("--model", choices=["5m", "23m", "79m", "all"], default="5m", help="Model size to export")
    parser.add_argument("--fp16", action="store_true", help="Export in float16 to reduce file size by 50%")
    args = parser.parse_args()

    if args.model in ["5m", "all"]:
        src5 = MODELS_DIR / "maia3-5m.pt"
        if src5.exists():
            export_checkpoint(src5, MODELS_DIR / "maia3_5m.bin", fp16=args.fp16)
            export_checkpoint(src5, MODELS_DIR / "maia3_model.bin", fp16=args.fp16)
    if args.model in ["23m", "all"]:
        src23 = MODELS_DIR / "maia3-23m.pt"
        if src23.exists():
            out_name = "maia3_23m_fp16.bin" if args.fp16 else "maia3_23m.bin"
            export_checkpoint(src23, MODELS_DIR / out_name, fp16=args.fp16)
    if args.model in ["79m", "all"]:
        src79 = MODELS_DIR / "maia3-79m.pt"
        if src79.exists():
            out_name = "maia3_79m_fp16.bin" if args.fp16 else "maia3_79m.bin"
            export_checkpoint(src79, MODELS_DIR / out_name, fp16=args.fp16)
