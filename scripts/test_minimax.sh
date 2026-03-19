#!/bin/bash
# ===========================================
# MiniMax API 测试脚本
# 运行前请确保 .env 文件已配置
# ===========================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "==========================================="
echo "MiniMax API 连通性测试"
echo "==========================================="

cd "$PROJECT_ROOT"

# 加载环境变量
if [ -f ".env" ]; then
    export $(grep -v '^#' .env | xargs)
else
    echo "❌ .env 文件不存在"
    exit 1
fi

# 检查必要变量
if [ -z "$MINIMAX_API_KEY" ] || [ "$MINIMAX_API_KEY" = "sk-your-minimax-key" ]; then
    echo "❌ 请在 .env 中配置 MINIMAX_API_KEY"
    exit 1
fi

if [ -z "$MINIMAX_API_BASE_URL" ]; then
    MINIMAX_API_BASE_URL="https://api.minimax.chat/v1"
fi

if [ -z "$MINIMAX_MODEL_GENERAL" ]; then
    MINIMAX_MODEL_GENERAL="minimax-m2.1"
fi

echo ""
echo "配置信息:"
echo "  API URL: $MINIMAX_API_BASE_URL"
echo "  Model: $MINIMAX_MODEL_GENERAL"
echo ""

# 测试 API 连通性
echo "[1/2] 测试 API 连通性..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${MINIMAX_API_BASE_URL}/chat/completions" \
    -H "Authorization: Bearer ${MINIMAX_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{
        \"model\": \"${MINIMAX_MODEL_GENERAL}\",
        \"messages\": [{\"role\": \"user\", \"content\": \"Say hello in 5 characters or less\"}],
        \"max_tokens\": 10
    }")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    echo "  ✅ API 连通正常 (HTTP $HTTP_CODE)"
    
    # 尝试解析响应
    if command -v python3 &> /dev/null; then
        CONTENT=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['choices'][0]['message']['content'])" 2>/dev/null || echo "无法解析")
        echo "  📝 回复: $CONTENT"
    fi
else
    echo "  ❌ API 请求失败 (HTTP $HTTP_CODE)"
    echo "  错误响应: $BODY"
    exit 1
fi

# 测试不同模型
echo ""
echo "[2/2] 测试不同模型..."
MODELS=(
    "$MINIMAX_MODEL_GENERAL"
    "${MINIMAX_MODEL_HIGHSPEED:-minimax-m2.5-highspeed}"
    "${MINIMAX_MODEL_REASONING:-minimax-reasoning}"
)

for MODEL in "${MODELS[@]}"; do
    if [ -n "$MODEL" ]; then
        RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${MINIMAX_API_BASE_URL}/chat/completions" \
            -H "Authorization: Bearer ${MINIMAX_API_KEY}" \
            -H "Content-Type: application/json" \
            -d "{
                \"model\": \"${MODEL}\",
                \"messages\": [{\"role\": \"user\", \"content\": \"Hi\"}],
                \"max_tokens\": 5
            }")
        
        HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
        if [ "$HTTP_CODE" = "200" ]; then
            echo "  ✅ $MODEL OK"
        else
            echo "  ⚠️  $MODEL failed (HTTP $HTTP_CODE)"
        fi
    fi
done

echo ""
echo "==========================================="
echo "✅ MiniMax API 测试完成!"
echo "==========================================="
