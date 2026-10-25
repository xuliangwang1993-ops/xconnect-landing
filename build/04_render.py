#!/usr/bin/env python3
"""站 04 · 盖版本号：把 css/js/bundle 的 sha8 写进 index.html 与 aoi-tree.html 的 <link>/<script>。
上游 = site/{factory.css,factory.js,aoi-tree.css,aoi-tree.js,data/*.js}
输出 = index.html + aoi-tree.html（带 ?v=<sha8>）+ build/out/04_handoff.json
"""
import hashlib
import json
import pathlib
import re
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
OUT = ROOT / "build/out"

REFS = ["factory.css", "factory.js", "auth.js", "i18n.js", "i18n/en-common.js", "i18n/en-factory.js", "i18n/en-tree.js", "i18n/en-aoi.js", "guide.js", "data/aoi-modules.js", "data/guide.js",
        "vendor/supabase.js", "aoi-tree.css", "aoi-tree.js",
        "data/stations-def.js", "data/tools.js", "data/recipes.js",
        "data/trees.js", "data/skins.js"]


def sha(p):
    return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()


def stamp(html_path):
    html = html_path.read_text()
    stamped = {}
    for ref in REFS:
        f = SITE / ref
        if not f.exists():
            continue
        v = sha(f)[:8]
        pat = re.escape(ref) + r"\?v=[0-9a-zA-Z_-]*"
        if re.search(pat, html):
            html = re.sub(pat, f"{ref}?v={v}", html)
            stamped[ref] = v
        elif f'"{ref}"' in html:
            html = html.replace(f'"{ref}"', f'"{ref}?v={v}"')
            stamped[ref] = v
    html_path.write_text(html)
    return stamped


def main():
    out_inputs, out_outputs, stamped_all = [], [], {}
    for name in ("index.html", "aoi-tree.html"):
        p = SITE / name
        if not p.exists():
            continue
        stamped = stamp(p)
        stamped_all.update(stamped)
        out_outputs.append({"path": f"site/{name}", "sha256": sha(p)})
    for ref in stamped_all:
        f = SITE / ref
        out_inputs.append({"path": f"site/{ref}", "sha256": sha(f)})
    h = {"station": "04_render", "tool": "python3-re",
         "inputs": out_inputs, "outputs": out_outputs, "stamped": stamped_all,
         "started_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "exit_code": 0}
    json.dump(h, open(OUT / "04_handoff.json", "w"), indent=2, ensure_ascii=False)
    print(json.dumps({"stamped": len(stamped_all), "refs": sorted(stamped_all)}))


if __name__ == "__main__":
    main()
