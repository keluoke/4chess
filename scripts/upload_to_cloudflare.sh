#!/usr/bin/env bash
# ==============================================================================
# Cloudflare R2 / CDN 极速分发配置脚本
# 针对专属域名 weights.4chess.cc 进行一键指引与上传
# ==============================================================================

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODEL_5M="$DIR/models/maia3_model.bin"
MODEL_23M="$DIR/models/maia3_23m.bin"
MODEL_79M_FP16="$DIR/models/maia3_79m_fp16.bin"
MODEL_79M="$DIR/models/maia3_79m.bin"

echo "================================================================="
echo "🧠 Maia-3 · Cloudflare CDN (weights.4chess.cc) 模型上传向导"
echo "================================================================="
echo "1. 5M 轻量推荐 (28MB):       $MODEL_5M"
echo "2. 23M 平衡首选 (104MB):     $MODEL_23M"
echo "3. 79M 高精 fp16 (159MB):    $MODEL_79M_FP16 (推荐，突破 300M 限制)"
echo "4. 79M 完整 fp32 (317MB):    $MODEL_79M (超过 Cloudflare 300MB 单次直传限制)"
echo ""
echo "💡 关于 Cloudflare 300MB 限制与网页端拖拽:"
echo "   Cloudflare Web 控制台和普通 HTTP PUT 单次上限为 300MB。"
echo "   因此 317MB 的 fp32 文件会被拦截；"
echo "   但 5M (28MB)、23M (104MB)、79M-fp16 (159MB) 均远低于 300MB，"
echo "   不仅可以直接在网页端拖拽上传，也可通过以下终端命令 100% 成功秒传！"
echo ""

if command -v npx >/dev/null 2>&1; then
  echo "-----------------------------------------------------------------"
  echo "终端上传命令 (请确保在插件根目录运行，替换 <bucket-name> 为您的桶名):"
  echo "-----------------------------------------------------------------"
  echo "  # 查看当前 R2 桶名"
  echo "  npx wrangler r2 bucket list"
  echo ""
  echo "  # 上传 5M 默认模型 (28MB):"
  echo "  npx wrangler r2 object put <bucket-name>/maia3_model.bin --file=\"models/maia3_model.bin\" --remote"
  echo ""
  echo "  # 上传 23M 进阶模型 (104MB):"
  echo "  npx wrangler r2 object put <bucket-name>/maia3_23m.bin --file=\"models/maia3_23m.bin\" --remote"
  echo ""
  echo "  # 上传 79M 大模型 (159MB fp16，推荐):"
  echo "  npx wrangler r2 object put <bucket-name>/maia3_79m_fp16.bin --file=\"models/maia3_79m_fp16.bin\" --remote"
  echo ""
fi

echo "-----------------------------------------------------------------"
echo "CORS 跨域配置 (如出现 403 / CORS 报错，请在 Cloudflare 存储桶设置粘贴):"
echo "-----------------------------------------------------------------"
cat << 'EOF'
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 86400
  }
]
EOF
echo ""
echo "验证访问命令:"
echo "  curl -I https://weights.4chess.cc/maia3_model.bin"
echo "  curl -I https://weights.4chess.cc/maia3_23m.bin"
echo ""

echo "================================================================="
echo "💡 提示：模型一旦从 CDN 下载完成，插件将通过 IndexedDB 永久本地缓存"
echo "   后续页面访问与刷新均为 0ms 纯本地秒开，无需二次消耗网络流量。"
echo "================================================================="
