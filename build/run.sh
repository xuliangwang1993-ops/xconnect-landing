#!/bin/bash
# 一条命令重跑整条链。上一站的产物就是下一站的输入，任何一站非 0 就停。
set -e
cd "$(dirname "$0")/.."

echo "→ 01 extract     ImageMagick 取色"
bash build/01_extract.sh
echo "→ 02 tokens      Python 组皮肤（对比度实测）"
python3 build/02_tokens.py
echo "→ 02b skins      皮肤包 → XCF_SKINS"
python3 build/02b_skins.py
echo "→ 03 compile     编 run + 工具 + AOI + 配方"
python3 build/03_compile.py
echo "→ 03b trees      编两棵内置树（AoI 施工包 / GitHub MCP）"
python3 build/03b_trees.py
echo "→ 03c artifacts  真产物 base64 内联（封面/字幕/报告）"
python3 build/03c_artifacts.py
echo "→ 06a orders     编小助手发的单（私有，build/private/）"
python3 build/06a_orders.py
echo "→ 06  pod        拉 RunPod 实况与订单对账（RUNPOD_KEY 未设则跳过）"
python3 build/06_pod.py || echo "   （pod 未连接，页面照实显示未连接）"
echo "→ 04 render      盖版本号"
python3 build/04_render.py
echo "→ 05 verify      页面 / 数据 / 引用三道门"
python3 build/05_verify.py
echo "→ push         （可选）把订单/Pod/运行结果推到 Supabase：需 SUPABASE_SERVICE_ROLE_KEY + FACTORY_USER_EMAIL"
if [ -n "$SUPABASE_SERVICE_ROLE_KEY" ] && [ -n "$FACTORY_USER_EMAIL$FACTORY_USER_ID" ]; then python3 tools/push_factory_data.py --all; fi
echo "✓ 全链通过，公开产物在 site/，私有数据在 build/private/（不进 git、不进 site/）"
