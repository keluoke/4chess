#!/usr/bin/env bash
# Launch Maia-3 79M Local Engine Server
cd "$(dirname "$0")"

MODEL="${1:-maia3-79m}"
if [[ "$MODEL" == "23m" ]]; then MODEL="maia3-23m"; fi
if [[ "$MODEL" == "79m" ]]; then MODEL="maia3-79m"; fi
if [[ "$MODEL" == "5m" ]]; then MODEL="maia3-5m"; fi

echo "=========================================================="
echo "🚀 启动 Maia-3 ($MODEL) 本地硬件加速推理服务..."
echo "📂 模型文件: models/${MODEL}.pt"
echo "⚡ 硬件加速: Apple Silicon GPU (MPS) / CUDA / AVX (约 8ms 极速响应)"
echo "🌐 服务地址: http://127.0.0.1:8765"
echo "💡 提示: 开启后 Chrome 插件将自动直连此服务；关闭后插件自动使用纯浏览器推理"
echo "=========================================================="

python3 maia_server.py --model "$MODEL" --port 8765
