#!/usr/bin/env bash
# ==============================================================================
# Cloudflare R2 / CDN 极速分发配置脚本
# 针对专属域名 weights.4chess.cc 进行一键指引与上传
# ==============================================================================

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODEL_5M="$DIR/models/maia3_model.bin"
MODEL_79M="$DIR/models/maia3_79m.bin"

echo "================================================================="
echo "🧠 Maia-3 · Cloudflare CDN (weights.4chess.cc) 极速部署向导"
echo "================================================================="
echo "5M 推荐模型 (28MB):  $MODEL_5M"
echo "79M 完整模型 (317MB): $MODEL_79M"
echo ""

echo "-----------------------------------------------------------------"
echo "针对您的自定义域名: weights.4chess.cc"
echo "-----------------------------------------------------------------"
echo "插件代码中现已默认配置了该域名！"
echo "默认直链: https://weights.4chess.cc/maia3_model.bin"
echo ""
echo "如出现 403 Forbidden 提示，仅需在 Cloudflare 完成以下设置:"
echo "1. 登录 Cloudflare 控制台 -> 点击左侧「R2 对象存储」-> 找到对应存储桶。"
echo "2. 点击「设置 (Settings)」选项卡:"
echo "   - 在「自定义域 (Custom Domains)」中确保已连接 weights.4chess.cc 且状态为 Active。"
echo "   - 在「CORS 策略 (CORS Policy)」中点击添加或编辑，粘贴以下配置:"
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
echo "3. 进入「对象 (Objects)」选项卡，上传模型文件:"
echo "   - 推荐上传: $MODEL_5M (文件名必须为 maia3_model.bin)"
echo "   - 若想使用 79M 大模型，也可将 $MODEL_79M 上传至桶中"
echo ""
echo "4. 上传完成后验证:"
echo "   curl -I https://weights.4chess.cc/maia3_model.bin"
echo "   返回 HTTP/2 200 即代表配置成功！"
echo ""

if command -v npx >/dev/null 2>&1; then
  echo "-----------------------------------------------------------------"
  echo "开发者快捷命令 (Wrangler CLI):"
  echo "-----------------------------------------------------------------"
  echo "  # 查看当前 R2 桶列表"
  echo "  npx wrangler r2 bucket list"
  echo ""
  echo "  # 上传 5M 模型到指定桶 (将 <bucket-name> 替换为您的 R2 存储桶名):"
  echo "  npx wrangler r2 object put <bucket-name>/maia3_model.bin --file=\"$MODEL_5M\""
  echo ""
fi

echo "================================================================="
echo "💡 提示：模型一旦从 CDN 下载完成，插件将通过 IndexedDB 永久本地缓存"
echo "   后续页面访问与刷新均为 0ms 纯本地秒开，无需二次消耗网络流量。"
echo "================================================================="
