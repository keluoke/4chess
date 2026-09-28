#!/usr/bin/env bash
# Launch Maia-3 79M Local Engine Server
cd "$(dirname "$0")"

echo "=========================================================="
echo "🚀 启动 Maia-3 79M 本地高精度人类直觉推理服务..."
echo "📂 模型文件: models/maia3-79m.pt (301 MB)"
echo "⚡ 硬件加速: Apple Silicon GPU (MPS) / CUDA / AVX"
echo "🌐 服务地址: http://127.0.0.1:8765"
echo "=========================================================="

python3 maia_server.py --model maia3-79m --port 8765
