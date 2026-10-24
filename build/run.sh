#!/bin/bash
# 一条命令重跑整条链。上一站的产物就是下一站的输入，任何一站非 0 就停。
set -e
cd "$(dirname "$0")/.."

echo "→ 01 extract   ImageMagick 取色"
bash build/01_extract.sh
echo "→ 02 tokens    Python 组皮肤（对比度实测）"
python3 build/02_tokens.py
echo "→ 03 compile   jq/Python 编数据（run + 工具 + AOI + 配方）"
python3 build/03_compile.py
echo "→ 04 render    盖版本号"
python3 build/04_render.py
echo "→ 05 verify    交接闭合 / 对比度 / 引用 / 构建链"
python3 build/05_verify.py
echo "✓ 全链通过，产物在 site/"
