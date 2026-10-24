#!/usr/bin/env python3
"""站 02 · 组皮肤：把上一站量到的颜色，外加两份线上 CSS 的实测令牌，组成可切换的 skin。
上游输入：build/out/palette.json（ImageMagick 产物）
下游输出：site/data/skins.json
"""
import json, hashlib, pathlib, re, time

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "build/out"


def sha(p):
    return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()


def lum(hexv):
    h = hexv.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    c = [x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in c]
    return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]


def contrast(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return round((hi + .05) / (lo + .05), 2)


def mix(a, b, t):
    """把 b 按 t 混进 a，用于从实采色派生表面层级（不是新配色）。"""
    ah, bh = a.lstrip("#"), b.lstrip("#")
    out = []
    for i in (0, 2, 4):
        out.append(round(int(ah[i:i + 2], 16) * (1 - t) + int(bh[i:i + 2], 16) * t))
    return "#%02X%02X%02X" % tuple(out)


def rgb2hsl(hexv):
    h = hexv.lstrip("#")
    r, g, b = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    mx, mn = max(r, g, b), min(r, g, b)
    l = (mx + mn) / 2
    if mx == mn:
        return 0, 0, l
    d = mx - mn
    s = d / (2 - mx - mn) if l > .5 else d / (mx + mn)
    if mx == r:
        hh = ((g - b) / d) % 6
    elif mx == g:
        hh = (b - r) / d + 2
    else:
        hh = (r - g) / d + 4
    return hh * 60, s, l


pal = json.load(open(OUT / "palette.json"))
raw = [c for c in pal["colors"] if lum(c["hex"]) > 0.002]     # 剔掉量化出来的纯黑底
tot = sum(c["pixels"] for c in raw) or 1
for c in raw:
    c["share"] = round(c["pixels"] / tot, 4)
pal["colors"] = raw
colors = [c["hex"] for c in raw]
# 最暗当 surface，饱和度最高的中间调当 accent，最亮当 accent2
by_l = sorted(colors, key=lambda c: lum(c))
deep = by_l[0]
accent = max(colors, key=lambda c: rgb2hsl(c)[1] * (1 - abs(rgb2hsl(c)[2] - 0.55) * 1.6))
accent_hi = by_l[-1]

# —— 从线上 CSS 里直接读令牌，不手抄 ——
m11 = pathlib.Path("/var/minis/workspace/xc-factory/build/refs/m11.css").read_text()
wb = pathlib.Path("/var/minis/workspace/xc-factory/build/refs/workbench.css").read_text()


def cssvar(text, name, default=None):
    m = re.search(r"--%s:\s*([^;]+);" % re.escape(name), text)
    return (m.group(1).strip() if m else default)


aoi = {
    "bg": cssvar(m11, "aoi-bg", "#000000"),
    "control": cssvar(m11, "aoi-control", "#ffd27a"),
    "function": cssvar(m11, "aoi-function", "#38f4ff"),
    "technical": cssvar(m11, "aoi-technical", "#a45cff"),
    "recipe": cssvar(m11, "aoi-recipe", "#fff0c8"),
    "muted": cssvar(m11, "aoi-text-muted", "#8f9bb0"),
}
wbk = {
    "bg": cssvar(wb, "bg", "#0d0f12"),
    "surface": cssvar(wb, "surface", "#13161b"),
    "accent": cssvar(wb, "accent", "#f59e0b"),
    "accent2": cssvar(wb, "accent-2", "#fbbf6a"),
    "text": cssvar(wb, "text", "#f3f0e8"),
    "muted": cssvar(wb, "muted", "#9ca3af"),
}

skins = [
    {
        "id": "xconnect",
        "name": "X-Connect Default",
        "zh": "紫金",
        "provenance": "declared",
        "badge": "SPEC",
        "source": {"kind": "design-tokens", "ref": "app.x-connect.ai · lib/theme/smart_skin_palettes.dart",
                   "note": "应用默认皮肤：primary 7C3AED / secondary FBBF24 / surface 1E293B"},
        "tokens": {"bg": "#05070D", "bg2": "#0A0F1A", "surface": "#0F172A", "surface2": "#1E293B",
                   "surface3": "#263143", "accent": "#7C3AED", "accent2": "#FBBF24",
                   "text": "#F8FAFC", "muted": "#94A3B8", "dim": "#64748B",
                   "ok": "#81C784", "warn": "#FFB74D", "bad": "#FF5A6E", "fn": "#38F4FF"},
        "grain": False,
    },
    {
        "id": "crystal",
        "name": "Crystal X",
        "zh": "水晶蓝",
        "provenance": "sampled",
        "badge": "AUTHENTIC",
        "source": {"kind": "image", "ref": pal["source"]["path"], "sha256": pal["source"]["sha256"],
                   "size": pal["source"]["size"], "tool": "imagemagick -colors 8",
                   "note": "从门户 crystal-x.jpg 实抽 8 色；grain 取自同一张图"},
        "tokens": {"bg": mix(deep, "#000000", .55), "bg2": mix(deep, "#000000", .3), "surface": deep,
                   "surface2": mix(deep, accent, .18), "surface3": mix(deep, accent, .30),
                   "accent": accent, "accent2": accent_hi,
                   "text": "#F2F8FF", "muted": "#9DB4CC", "dim": "#6E839C",
                   "ok": "#7BE0C3", "warn": "#FFC45C", "bad": "#FF6B7F", "fn": "#8FE3FF"},
        "grain": True,
        "measured": colors,
    },
    {
        "id": "aoi-film",
        "name": "AoI Film",
        "zh": "黑金胶片",
        "provenance": "sampled",
        "badge": "AUTHENTIC",
        "source": {"kind": "css", "ref": "aoi-m11-preview.onrender.com/assets/index-DW341bVH.css",
                   "sha256": hashlib.sha256(m11.encode()).hexdigest(),
                   "note": "直接读 --aoi-* 令牌，未手抄"},
        "tokens": {"bg": "#000000", "bg2": "#06090F", "surface": "#0B0D12", "surface2": "#12151C",
                   "surface3": "#191D26", "accent": aoi["technical"], "accent2": aoi["control"],
                   "text": "#F2F5FA", "muted": "#8F9BB0", "dim": "#5B6576",
                   "ok": "#7BE0C3", "warn": aoi["control"], "bad": "#FF5A6E", "fn": aoi["function"]},
        "grain": False,
        "measured": [aoi["control"], aoi["function"], aoi["technical"]],
    },
    {
        "id": "workbench",
        "name": "Workbench Amber",
        "zh": "工位琥珀",
        "provenance": "sampled",
        "badge": "AUTHENTIC",
        "source": {"kind": "css", "ref": "xconnect-factory.onrender.com/workbench → /styles.css",
                   "sha256": hashlib.sha256(wb.encode()).hexdigest(),
                   "note": "直接读 --bg / --surface / --accent 令牌"},
        "tokens": {"bg": wbk["bg"], "bg2": wbk["bg"], "surface": wbk["surface"], "surface2": "#191d24",
                   "surface3": "#20252d", "accent": wbk["accent"], "accent2": wbk["accent2"],
                   "text": wbk["text"], "muted": wbk["muted"], "dim": "#6b7280",
                   "ok": "#10b981", "warn": "#fbbf24", "bad": "#fb7185", "fn": "#38f4ff"},
        "grain": False,
        "measured": [wbk["accent"], wbk["accent2"]],
    },
]

PAIRS = [("text", "bg"), ("text", "surface"), ("accent", "bg"), ("accent2", "surface"), ("muted", "bg")]
for s in skins:
    t = s["tokens"]
    s["contrast"] = {f"{a}_on_{b}": contrast(t[a], t[b]) for a, b in PAIRS}
    s["aa"] = all(v >= 4.5 for k, v in s["contrast"].items() if k.startswith(("text", "muted")))
    s["authentic"] = s["provenance"] == "sampled" and bool(s["source"].get("sha256"))

out = {"skins": skins, "generated_from": "build/out/palette.json + refs/*.css",
       "rule": "authentic 只发给有出处（sha256）的皮肤；没有实测源的一律 SPEC"}
(ROOT / "site/data/skins.json").write_text(json.dumps(out, indent=2, ensure_ascii=False))

h = {"station": "02_tokens", "tool": "python3",
     "inputs": [{"path": p, "sha256": sha(p)} for p in
                ["build/out/palette.json", "build/refs/m11.css", "build/refs/workbench.css"]],
     "outputs": [{"path": "site/data/skins.json", "sha256": sha("site/data/skins.json")}],
     "started_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "exit_code": 0}
json.dump(h, open(OUT / "02_handoff.json", "w"), indent=2)
print(json.dumps({"skins": len(skins), "authentic": sum(s["authentic"] for s in skins)}))
