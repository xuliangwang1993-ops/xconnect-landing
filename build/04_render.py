#!/usr/bin/env python3
"""站 04 · 出页：把上游的 CSS / JS / 数据包盖版本号，保证换肤和刷新不吃缓存。
上游 = site/*.css, site/factory.js, site/data/bundle.js
下游 = site/index.html（已盖章）+ build/out/04_handoff.json
"""
import hashlib, json, pathlib, re, time

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
OUT = ROOT / "build/out"


def sha(p):
    return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()


html = (SITE / "index.html").read_text()
assets = {
    "factory.css": sha(SITE / "factory.css"),
    "factory.js": sha(SITE / "factory.js"),
    "data/bundle.js": sha(SITE / "data/bundle.js"),
}
for ref, digest in assets.items():
    v = digest[:8]
    html = re.sub(re.escape(ref) + r"\?v=[0-9a-zA-Z]+", f"{ref}?v={v}", html)

# 构建链信息也进页面（05 生成，若还没有就跳过）
if (SITE / "data/build.js").exists():
    html = re.sub(r'data/build\.js\?v=[0-9a-zA-Z]+', "data/build.js?v=" + sha(SITE / "data/build.js")[:8], html)

(SITE / "index.html").write_text(html)

h = {"station": "04_render", "tool": "python3-re",
     "inputs": [{"path": f"site/{p}", "sha256": d} for p, d in assets.items()],
     "outputs": [{"path": "site/index.html", "sha256": sha(SITE / "index.html")}],
     "stamped": {k: v[:8] for k, v in assets.items()},
     "started_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "exit_code": 0}
json.dump(h, open(OUT / "04_handoff.json", "w"), indent=2)
print(json.dumps(h["stamped"]))
