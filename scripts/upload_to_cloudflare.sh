#!/usr/bin/env bash
# ==============================================================================
# Cloudflare R2 / CDN 极速分发配置脚本
# 用于将 27.97 MB Maia-3 模型一键上传至您的 Cloudflare 免费存储桶 (R2 / Workers)
# 获得全球高速 CDN 加速与零流量费 (0 Egress Fees) 分发。
# ==============================================================================

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODEL_FILE="$DIR/models/maia3_model.bin"

echo "================================================================="
echo "🧠 Maia-3 · Cloudflare 高速 CDN 部署向导"
echo "================================================================="
echo "本地模型路径: $MODEL_FILE"

if [ ! -f "$MODEL_FILE" ]; then
  echo "❌ 找不到 $MODEL_FILE 文件！请先运行 export 脚本生成模型。"
  exit 1
fi

MODEL_SIZE=$(ls -lh "$MODEL_FILE" | awk '{print $5}')
echo "模型文件大小: $MODEL_SIZE"
echo ""

echo "-----------------------------------------------------------------"
echo "方式一：通过 Cloudflare 网页后台上传 (推荐，免命令行，2分钟搞定)"
echo "-----------------------------------------------------------------"
echo "1. 登录 Cloudflare 控制台: https://dash.cloudflare.com/"
echo "2. 点击左侧导航栏的「R2 对象存储」->「创建存储桶 (Create bucket)」"
echo "   - 存储桶名称输入: maia3-weights (或任意英文名称)"
echo "   - 位置选择「自动 (Automatic)」并点击创建"
echo "3. 进入该存储桶，点击「设置 (Settings)」选项卡:"
echo "   - 找到「公开访问 (Public access)」-> 开启「允许公开访问 (Allow Public Access)」或绑定自定义域名"
echo "   - 记下生成的公开访问 URL (例如: https://pub-xxxxxxxxxxxxxxxx.r2.dev)"
echo "4. 在设置页面的「CORS 策略 (CORS Policy)」中点击「添加 CORS 策略」，粘贴以下内容并保存:"
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
echo "5. 返回「对象 (Objects)」选项卡，点击「上传 (Upload)」，直接将以下文件拖入上传:"
echo "   $MODEL_FILE"
echo ""
echo "6. 上传完成后，您的完整 CDN 直链即为:"
echo "   https://pub-xxxxxxxxxxxxxxxx.r2.dev/maia3_model.bin"
echo "   将此 URL 填入插件悬浮面板的「⚙️ CDN / 缓存设置」中即可！"
echo ""

echo "-----------------------------------------------------------------"
echo "方式二：通过 Wrangler 命令行一键上传 (适合开发者)"
echo "-----------------------------------------------------------------"

if command -v npx >/dev/null 2>&1; then
  echo "检测到 Node.js / npx 环境已就绪。"
  echo "如果您已登录 Cloudflare，可直接运行以下命令:"
  echo ""
  echo "  # 1. 登录 Cloudflare"
  echo "  npx wrangler login"
  echo ""
  echo "  # 2. 创建 R2 存储桶 (若未创建)"
  echo "  npx wrangler r2 bucket create maia3-weights"
  echo ""
  echo "  # 3. 上传模型文件"
  echo "  npx wrangler r2 object put maia3-weights/maia3_model.bin --file=\"$MODEL_FILE\""
  echo ""
  echo "  # 4. 在控制台为 maia3-weights 开启公开访问或 Worker 代理"
  echo ""
fi

echo "================================================================="
echo "💡 提示：模型一旦从 CDN 下载完成，插件将通过 IndexedDB 永久本地缓存"
echo "   后续页面访问与刷新均为 0ms 纯本地瞬时加载，无重复流量消耗。"
echo "================================================================="
