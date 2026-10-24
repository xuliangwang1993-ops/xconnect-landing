#!/usr/bin/env python3
"""站 05 · 验收：这一页自己也要过门。
检查：交接闭合、皮肤对比度、工具在库、产物 schema 存在、静态引用存在。
输出 qa.json / build.js（页面里的"构建链"块读它）。
"""
import hashlib, json, pathlib, re, sys, time

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
OUT = ROOT / "build/out"
DATA = SITE / "data"
RUN = ROOT / "craft-skills/runs/v3-20261023-130640"
EXPECTED_GAP = ("07_kb", "qa.json")


def sha(p):
    return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()


def rj(p):
    return json.loads(pathlib.Path(p).read_text())


stations = rj(DATA / "stations.json")
skins = rj(DATA / "skins.json")
tools = rj(DATA / "tools.json")
checks = []


def ck(name, ok, value, threshold=None, note="", hard=True):
    checks.append({"check": name, "pass": bool(ok), "value": value, "threshold": threshold, "note": note, "hard": hard})


# 1) 交接闭合：只允许已知的那一处（06_qa/qa.json 没进 outputs）
gaps = []
for c in stations["chain"]:
    if c["closed"] != c["total"]:
        for l in c["links"]:
            if not l["from"]:
                gaps.append((c["to"], l["artifact"]))
ck("交接缺口只有已知一处", gaps == [EXPECTED_GAP], gaps, str([EXPECTED_GAP]),
   "06_qa/qa.json 由 Station 包装器写，未登记进 handoff.outputs —— 这是真缺口，界面照实显示")

# 2) 每站都有 handoff 与退出码
bad = [s["id"] for s in stations["stations"] if s["exit_code"] not in (0, None)]
ck("8 站退出码全 0", not bad, bad, "[]")
ck("站数 = 8", len(stations["stations"]) == 8, len(stations["stations"]), 8)

# 3) 皮肤对比度
low = []
for s in skins["skins"]:
    t = s["tokens"]
    def lum(h):
        h = h.lstrip("#")
        c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
        c = [x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in c]
        return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]
    for a, b in (("text", "bg"), ("text", "surface")):
        la, lb = lum(t[a]), lum(t[b])
        r = (max(la, lb) + .05) / (min(la, lb) + .05)
        if r < 4.5:
            low.append((s["id"], f"{a}/{b}", round(r, 2)))
ck("皮肤正文对比度 ≥ 4.5", not low, low, "[]")

# 4) authentic 必须有 sha256
fake = [s["id"] for s in skins["skins"] if s["authentic"] and not (s.get("source") or {}).get("sha256")]
ck("AUTHENTIC 都能溯源", not fake, fake, "[]")

# 5) 每站工具都在工具表里
names = {x["name"] for x in tools["tools"]}
missing = []
for s in stations["stations"]:
    for t in s["tools"]:
        key = t["name"].split()[0].split("+")[0]
        if key not in names:
            missing.append(key)
ck("站上工具都在 88 个工具表里", not missing, missing, "[]", "python-re / reportlab 这类流水线自写件除外")

# 6) 产物 schema 在仓库里
schemas = {p.name.replace(".schema.json", "") for p in (ROOT / "craft-skills/schemas").glob("*.schema.json")}
unknown = sorted({o["schema"] for s in stations["stations"] for o in s["outputs"]
                  if o.get("schema") and o["schema"] not in schemas})
ck("声明的 schema 都在仓库 schemas/", not unknown, unknown, "[]")

# 6.5) build.js 落盘后再盖一次版本号（04 在它之前跑）
import subprocess
subprocess.run([sys.executable, str(ROOT / "build/04_render.py")], check=True, capture_output=True)

# 7) 静态引用都存在
refs = set(re.findall(r'(?:src|href)="([^"?#]+)', (SITE / "index.html").read_text()))
missing_files = [r for r in refs if not r.startswith(("http", "minis:")) and not (SITE / r).exists()]
ck("页面引用的本地文件都在", not missing_files, missing_files, "[]")

# 8) 数据包可解析、五块齐
bundle_src = (DATA / "bundle.js").read_text()
ck("bundle.js 五块齐", all(f'"{k}":' in bundle_src for k in ("stations", "tools", "aoi", "recipes", "skins")),
   list(k for k in ("stations", "tools", "aoi", "recipes", "skins") if f'"{k}":' in bundle_src), 5)

# 9) 无外链字体/CDN（离线也能开）
html = (SITE / "index.html").read_text()
ck("无外链字体/CDN", "fonts.googleapis" not in html and "cdn." not in html, True, True)

# 10) 构建链自身闭合：01→04
chain_ok = True
steps = []
prev = None
for i, st in enumerate(["01_extract", "02_tokens", "03_compile", "04_render"]):
    f = OUT / f"{st[:2]}_handoff.json"
    if not f.exists():
        chain_ok = False
        break
    h = rj(f)
    steps.append({"id": st, "tool": h.get("tool"), "out": h["outputs"][0]["path"],
                  "sha": h["outputs"][0]["sha256"][:8], "ok": h.get("exit_code") == 0})
    prev = h
ck("构建链 01→04 四步都有交接书", chain_ok, len(steps), 4)

hard_fail = [c for c in checks if c["hard"] and not c["pass"]]
qa = {"station": "05_verify", "pass": not hard_fail,
      "checks": [{k: v for k, v in c.items() if k != "hard"} for c in checks],
      "gaps": [{"station": g[0], "artifact": g[1]} for g in gaps]}

# 构建链进页面
build = {"steps": steps, "pass": not hard_fail, "at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
         "checks": len(checks), "hard_fail": len(hard_fail)}
(DATA / "build.js").write_text("window.XCF_BUILD = " + json.dumps(build, ensure_ascii=False) + ";\n")
(SITE / "data/qa.json").write_text(json.dumps(qa, indent=2, ensure_ascii=False))
json.dump(qa, open(OUT / "05_qa.json", "w"), indent=2, ensure_ascii=False)

h = {"station": "05_verify", "tool": "python3",
     "inputs": [{"path": f"build/out/{s[:2]}_handoff.json", "sha256": sha(OUT / f"{s[:2]}_handoff.json")}
                for s in ["01_extract", "02_tokens", "03_compile", "04_render"]],
     "outputs": [{"path": "site/data/qa.json", "sha256": sha(DATA / "qa.json")},
                 {"path": "site/data/build.js", "sha256": sha(DATA / "build.js")}],
     "started_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "exit_code": 0 if not hard_fail else 1}
json.dump(h, open(OUT / "05_handoff.json", "w"), indent=2)

for c in checks:
    print(("PASS  " if c["pass"] else "FAIL  ") + c["check"] + "  " + json.dumps(c["value"], ensure_ascii=False)[:120])
print(json.dumps({"pass": not hard_fail, "checks": len(checks), "hard_fail": len(hard_fail)}, ensure_ascii=False))
sys.exit(0 if not hard_fail else 1)
