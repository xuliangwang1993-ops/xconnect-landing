#!/bin/bash
# 站 01 · 取色：从真实品牌素材里量颜色，不发明颜色。
# 工具：ImageMagick (craft-skills/skills/base/imagemagick)
set -e
cd "$(dirname "$0")/.."
OUT=build/out
mkdir -p "$OUT"

SRC=site/assets/crystal-x.jpg
SHA=$(sha256sum "$SRC" | cut -d' ' -f1)
SIZE=$(identify -format '%wx%h' "$SRC")

# 8 色量化，剔掉透明背景；输出可解析的 TSV
magick "$SRC" -resize 200x200 -fuzz 10% -transparent black -colors 8 \
  -format '%c' histogram:info:- \
  | sed -E 's/^ *([0-9]+): \(([0-9.]+),([0-9.]+),([0-9.]+),[^)]*\) (#[0-9A-Fa-f]{6}).*/\1\t\5/' \
  | awk -F'\t' 'NF==2' > "$OUT/palette.tsv"

# 材质颗粒：从水晶右下的暗部取 64x64，转灰度当 grain 贴图（可溯源到同一张图）
magick "$SRC" -crop 64x64+980+1020 +repage -colorspace Gray -auto-level \
  -resize 64x64! -quality 82 site/assets/grain.jpg

python3 - "$SRC" "$SHA" "$SIZE" <<'PY'
import json, sys, pathlib
src, sha, size = sys.argv[1:4]
rows = []
for line in pathlib.Path("build/out/palette.tsv").read_text().splitlines():
    n, hexv = line.split("\t")
    rows.append({"hex": hexv.upper(), "pixels": int(n)})
rows.sort(key=lambda r: -r["pixels"])
tot = sum(r["pixels"] for r in rows) or 1
for r in rows: r["share"] = round(r["pixels"] / tot, 4)
json.dump({"source": {"path": src, "sha256": sha, "size": size, "tool": "imagemagick",
           "cmd": "magick crystal-x.jpg -resize 200x200 -colors 8 histogram:info:-"},
           "colors": rows}, open("build/out/palette.json", "w"), indent=2, ensure_ascii=False)
print(json.dumps({"colors": len(rows), "top": rows[0]["hex"], "sha": sha[:12]}))
PY

python3 - <<'PY'
import json, hashlib, pathlib, time
def sha(p):
    return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
h = {"station": "01_extract", "tool": "imagemagick",
     "inputs": [{"path": "site/assets/crystal-x.jpg", "sha256": sha("site/assets/crystal-x.jpg")}],
     "outputs": [{"path": p, "sha256": sha(p)} for p in ["build/out/palette.json", "build/out/palette.tsv", "site/assets/grain.jpg"]],
     "started_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "exit_code": 0}
json.dump(h, open("build/out/01_handoff.json", "w"), indent=2)
PY
echo "01_extract ok"
