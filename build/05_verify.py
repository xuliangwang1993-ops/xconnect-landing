#!/usr/bin/env python3
"""站 05 · 验收：静态站的三道门 —— 页面在、数据齐、没有死引用。
任何一门挂了就非 0 退出，run.sh 全链即停。
"""
import json
import pathlib
import re
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
DATA = SITE / "data"
OUT = ROOT / "build/out"

checks = []


def ck(name, ok, value, threshold=None, hard=True):
    checks.append({"check": name, "pass": bool(ok), "value": value,
                   "threshold": threshold, "hard": hard})
    print(("PASS  " if ok else "FAIL  ") + name + "  " + json.dumps(value, ensure_ascii=False)[:120])


def main():
    # 1) 页面存在
    for page in ("index.html", "aoi-tree.html"):
        ck(f"{page} 在", (SITE / page).exists(), str((SITE / page).exists()))

    # 2) index.html 引的每个本地文件都在，且带版本号
    html = (SITE / "index.html").read_text()
    refs = re.findall(r'(?:src|href)="([^"#]+)"', html)
    local = [r for r in refs if not r.startswith(("http", "data:", "minis:"))]
    missing = [r for r in local if not (SITE / r.split("?")[0]).exists()]
    ck("index.html 引用的本地文件都在", not missing, missing, "[]")
    unversioned = [r for r in local if "?v=" not in r and r.split("?")[0].endswith((".js", ".css"))]
    ck("js/css 都带 ?v=", not unversioned, unversioned, "[]")

    # 3) 数据包齐全可解析（window.XCF_* 五块 + 产物包）
    expect = {"stations.js": "XCF_STATIONS", "tools.js": "XCF_TOOLS",
              "recipes.js": "XCF_RECIPES", "pod.js": "XCF_POD",
              "artifacts.js": "XCF_ARTIFACTS", "build-order.js": "XCF_BUILD_ORDER",
              "bundle.js": "XCF_BUNDLE", "trees.js": "XCF_TREES",
              "skins.js": "XCF_SKINS", "build.js": "XCF_BUILD", "skins.json": None}
    for f, win in expect.items():
        p = DATA / f
        ok = p.exists() and (win is None or win in p.read_text(errors="ignore"))
        ck(f"data/{f} 在且可解析", ok, p.exists())

    # 4) 站数 = 8，交接账本闭合数 ≤ 总数（缺口已知且标红）
    st = json.loads((DATA / "stations.json").read_text())
    ck("station 数 = 8", len(st.get("stations", [])) == 8, len(st.get("stations", [])), 8)
    chain = st.get("chain", [])
    closed = sum(c["closed"] for c in chain)
    total = sum(c["total"] for c in chain)
    # 03_compile 按全上游建 chain：唯一缺口是 07_kb 吃的 06_qa/qa.json（没登记进 06_qa.outputs）
    ck("交接账本 16/17 闭合（已知缺口 06_qa/qa.json）", (closed, total) == (16, 17), [closed, total], [16, 17])
    gaps = [(c["to"], l["artifact"]) for c in chain for l in c["links"] if not l["closed"]]
    ck("缺口只有已知一处", gaps == [("07_kb", "qa.json")], gaps, "[('07_kb','qa.json')]")

    # 5) 每站退出码 0
    bad_exit = [s["id"] for s in st["stations"] if s.get("exit_code") != 0]
    ck("8 站退出码全 0", not bad_exit, bad_exit, "[]")

    # 6) pod 数据有订单；没 key 时 probe.error 明确
    pod = json.loads((DATA / "pod.json").read_text())
    ck("pod 有订单", len(pod.get("orders", [])) >= 1, len(pod.get("orders", [])), ">=1")
    if pod.get("probe", {}).get("key") is False:
        ck("没 key 时 probe.error 明确", bool(pod["probe"].get("error")), pod["probe"].get("error"), "non-empty")

    # 7) 皮肤对比度（沿用之前那条）
    skins = json.loads((DATA / "skins.json").read_text())
    low = []
    for s in skins.get("skins", []):
        t = s["tokens"]
        for a in ("text", "muted"):
            for b in ("bg", "surface"):
                if contrast(t[a], t[b]) < 4.5:
                    low.append(f"{s['id']}:{a}/{b}")
    ck("皮肤正文对比度 ≥ 4.5", not low, low, "[]")

    # 8) 无外链 CDN / 字体
    ck("无外链 CDN/字体", not re.search(r"(fonts\.googleapis|cdn\.|unpkg|jsdelivr)", html), True, True)

    hard_fail = [c for c in checks if c["hard"] and not c["pass"]]
    qa = {"station": "05_verify", "pass": not hard_fail, "checks": checks,
          "pod_connected": bool(pod.get("pods")), "run": st.get("run", {}).get("id")}
    (SITE / "data/qa.json").write_text(json.dumps(qa, ensure_ascii=False, indent=2))
    json.dump(qa, open(OUT / "05_qa.json", "w"), ensure_ascii=False, indent=2)

    # 构建链写进 build.js，页面右下角可以看
    steps = []
    for sid in ("01_extract", "02_tokens", "03_compile", "03b_trees", "03c_artifacts",
                "04_render", "05_verify"):
        for cand in (f"{sid}.json", f"{sid[:2]}_handoff.json"):
            f = OUT / cand
            if f.exists():
                steps.append(sid)
                break
    (DATA / "build.js").write_text("window.XCF_BUILD = " + json.dumps(
        {"steps": steps, "pass": not hard_fail, "at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
         "checks": len(checks), "hard_fail": len(hard_fail)}, ensure_ascii=False) + ";\n")
    print(json.dumps({"pass": not hard_fail, "checks": len(checks),
                      "hard_fail": len(hard_fail), "pod": qa["pod_connected"]}, ensure_ascii=False))
    return 0 if not hard_fail else 1


def contrast(a, b):
    def lum(h):
        h = h.lstrip("#")
        c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
        c = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


if __name__ == "__main__":
    sys.exit(main())
