#!/usr/bin/env python3
"""站 03 · 编数据：把上一次真实运行的交接书、仓库里的工具、AOI 模块表，
编成界面要吃的 JSON。上游 = run/v3-20261023-130640；下游 = site/data/*.json"""
import json, hashlib, pathlib, re, time, datetime

ROOT = pathlib.Path(__file__).resolve().parent.parent
RUN = ROOT / "craft-skills/runs/v3-20261023-130640"
OUT = ROOT / "build/out"
DATA = ROOT / "site/data"
DATA.mkdir(parents=True, exist_ok=True)


def sha(p):
    return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()


def rj(p):
    return json.loads(pathlib.Path(p).read_text())


META = {
    "00_brief":  ("Brief", "需求解析", "M07", "把一句话拆成字段：时长、语种、尺寸、交付清单"),
    "01_ingest": ("Ingest", "素材入库", "M02", "抓官网、核事实、给每个素材记来源与许可"),
    "02_script": ("Script", "脚本分镜", "M07", "把事实写成六镜，出分镜 PDF 与菜单卡"),
    "03_grade":  ("Grade", "画面与混音", "M04", "逐帧生成、调色、合成底乐，独立取证"),
    "04_subs":   ("Subs", "字幕", "M01", "中英字幕、行宽与安全区校核"),
    "05_export": ("Export", "三尺寸导出", "M04", "9:16 / 1:1 / 16:9 各 30.000s，封面与角标"),
    "06_qa":     ("QA", "验收", "M05", "解码、时长、响度、安全区、追溯链"),
    "07_kb":     ("KB", "知识包", "M08", "把事实与菜单编成小助手可答的知识包"),
}

man = rj(RUN / "manifest.json")
stations = []
prev_outputs = {}
for sid in man["stations"]:
    d = RUN / sid
    h = rj(d / "handoff.json") if (d / "handoff.json").exists() else {}
    q = rj(d / "qa.json") if (d / "qa.json").exists() else {}
    sc = rj(d / "scorecard.json") if (d / "scorecard.json").exists() else {}
    ins = [{"path": i["path"], "sha256": i.get("sha256"), "sha8": (i.get("sha256") or "")[:8]} for i in h.get("inputs", [])]
    outs = []
    for o in h.get("outputs", []):
        fp = RUN / o["path"]
        outs.append({"path": o["path"], "name": pathlib.Path(o["path"]).name,
                     "sha256": o.get("sha256"), "sha8": (o.get("sha256") or "")[:8],
                     "schema": o.get("schema"), "bytes": fp.stat().st_size if fp.exists() else None})
    # 链路闭合：这条输入能不能在上游任何一站的输出里找到同 sha
    for i in ins:
        hit = prev_outputs.get(i["sha256"])
        i["from"] = hit
        i["closed"] = bool(hit)
    for o in outs:
        prev_outputs[o["sha256"]] = sid
    en, zh, aoi, note = META[sid]
    stations.append({
        "id": sid, "index": sid[:2], "name": en, "zh": zh, "aoi": aoi, "note": note,
        "tools": h.get("tools", []),
        "inputs": ins, "outputs": outs,
        "elapsed_s": h.get("elapsed_s"),
        "exit_code": h.get("exit_code", 0),
        "started_at": h.get("started_at"), "ended_at": h.get("ended_at"),
        "qa": {"pass": q.get("pass"), "checks": q.get("checks", [])},
        "score": (round(sum(sc[k] for k in ("commercial", "handoff", "craft", "benchmark")) / 4, 2)
                  if all(k in sc for k in ("commercial", "handoff", "craft", "benchmark")) else None),
        "dims": {k: sc.get(k) for k in ("commercial", "handoff", "craft", "benchmark")},
        "reasons": sc.get("reasons", {}),
    })

chain = []
for s in stations:
    if not s["inputs"]:
        continue
    chain.append({"to": s["id"], "closed": sum(1 for i in s["inputs"] if i.get("closed")), "total": len(s["inputs"]),
                  "links": [{"from": i.get("from"), "artifact": pathlib.Path(i["path"]).name} for i in s["inputs"]]})

(ROOT / "site/data/stations.json").write_text(json.dumps({
    "run": {k: man.get(k) for k in ("run_id", "sentence", "status", "exit_code", "elapsed_s")},
    "stations": stations, "chain": chain,
}, indent=2, ensure_ascii=False))

# ---------- 工具：从仓库 frontmatter 读，不手写 ----------
base = ROOT / "craft-skills/skills/base"
tools = {}
for f in sorted(base.glob("*/SKILL.md")):
    txt = f.read_text(errors="ignore")
    m = re.match(r"^---\n(.*?)\n---", txt, re.S)
    fm = {}
    if m:
        key = None
        for line in m.group(1).splitlines():
            if re.match(r"^[a-z_]+:", line):
                key, _, val = line.partition(":")
                fm[key.strip()] = val.strip()
    name = fm.get("name") or f.parent.name
    tools[name] = {"name": name, "zh": fm.get("name_zh", ""), "category": fm.get("category", ""),
                   "layer": fm.get("layer", "base"), "used": []}
for s in stations:
    for t in s["tools"]:
        key = t["name"].split()[0].split("+")[0]
        if key in tools:
            tools[key]["used"].append(s["id"])
        else:
            tools[key] = {"name": t["name"], "zh": "", "category": "pipeline", "layer": "base", "used": [s["id"]]}
LOCAL = ["ffmpeg", "melt", "pyscenedetect", "opencv", "sox", "imagemagick", "pandoc",
         "python-docx", "openpyxl", "ripgrep", "jq", "postgresql"]
for k, v in tools.items():
    v["local"] = k in LOCAL
(DATA / "tools.json").write_text(json.dumps({
    "count": len(tools), "local_count": sum(1 for v in tools.values() if v["local"]),
    "tools": sorted(tools.values(), key=lambda x: (x["category"], x["name"]))}, indent=2, ensure_ascii=False))

# ---------- AOI：模块表 + 接口 ----------
MODULES = [
    ("M00", "公共底座", "契约 / 事件总线 / 存储"),
    ("M01", "指令与模型网关", "指令解析、模型路由"),
    ("M02", "插件注册与三链", "注册表、来源链"),
    ("M03", "调度·授权·预算", "排队、配额、审批"),
    ("M04", "执行与独立取证", "执行器、证据留存"),
    ("M05", "验证与裁决", "验收、仲裁"),
    ("M06", "插件医生", "体检、修复"),
    ("M07", "配方与能力", "Recipe / Capability"),
    ("M08", "三维能力界面", "能力可视化、助手面"),
    ("M09", "受控插件构建", "沙箱构建"),
    ("M10", "旧系统兼容桥", "可选"),
    ("M11", "总装与端到端验收", "Assembly / E2E"),
]
backed = {}
for s in stations:
    backed.setdefault(s["aoi"], []).append(s["id"])
(DATA / "aoi.json").write_text(json.dumps({
    "preview": "https://aoi-m11-preview.onrender.com/",
    "api_base": "https://aoi-m11-preview.onrender.com",
    "probe": {"checked_at": "2026-10-24T10:30+11:00", "health": 404, "capabilities": 404,
              "verdict": "预览站用 MSW 在前端模拟 /api/v1，后端未上线；界面用 M11 快照，不假装在线"},
    "endpoints": ["/api/v1/health", "/api/v1/session", "/api/v1/capabilities", "/api/v1/recipes",
                  "/api/v1/runs/{id}/evidence"],
    "modules": [{"code": c, "name": n, "role": r, "stations": backed.get(c, [])} for c, n, r in MODULES],
}, indent=2, ensure_ascii=False))

# ---------- 配方：一条已实测，三条骨架 ----------
recipes = [
    {"id": "R01", "name": "30 秒三尺寸宣传片", "en": "30s Promo, 3 aspects", "status": "verified",
     "keywords": ["宣传片", "短视频", "视频", "30秒", "30 秒", "字幕", "三个尺寸", "三尺寸", "社媒", "reels", "tiktok", "instagram", "门店", "餐厅", "米线", "推广"],
     "stations": [s["id"] for s in stations], "tools": ["jq", "ffmpeg", "opencv", "sox", "pyscenedetect", "imagemagick", "python-docx"],
     "deliverables": ["promo_9x16.mp4", "promo_1x1.mp4", "promo_16x9.mp4", "cover_*.jpg", "zh.srt", "en.srt", "storyboard.pdf"],
     "evidence": "runs/v3-20261023-130640 · 8/8 站 · 109.1s · exit 0",
     "matched_run": "v3-20261023-130640"},
    {"id": "R02", "name": "门店菜单板 / 价目卡", "en": "Menu board", "status": "skeleton",
     "keywords": ["菜单", "价目", "价目表", "海报", "门店物料", "打印", "菜单板", "designcraft"],
     "stations": ["00_brief", "02_script", "05_export"],
     "tools": ["designcraft", "figcraft", "imagemagick", "pdfcraft"],
     "deliverables": ["menu.pdf", "menu.png", "price_card.png"],
     "evidence": "仓库有 dumpling-home.json / dumpling-logo.json 命令稿，未跑完整 run", "matched_run": None,
     "plan": [{"tool": "designcraft", "out": "menu.figcraft"}, {"tool": "figcraft", "out": "menu.png"},
              {"tool": "imagemagick", "out": "print_300dpi.pdf"}, {"tool": "pdfcraft", "out": "menu_final.pdf"}]},
    {"id": "R03", "name": "扫描件 → 可搜索文档", "en": "Scan to doc", "status": "skeleton",
     "keywords": ["扫描", "ocr", "pdf", "word", "可搜索", "合同", "发票", "归档", "识别"],
     "stations": ["01_ingest", "05_export"],
     "tools": ["ocrmypdf", "pdftotext", "pandoc", "qpdf"],
     "deliverables": ["ocr.pdf", "ocr.docx", "ocr.txt"],
     "evidence": "工具在库（ocrmypdf/pandoc），本条线未跑", "matched_run": None,
     "plan": [{"tool": "ocrmypdf", "out": "ocr.pdf"}, {"tool": "pdftotext", "out": "ocr.txt"},
              {"tool": "pandoc", "out": "ocr.docx"}]},
    {"id": "R04", "name": "批量图片规整", "en": "Image batch", "status": "skeleton",
     "keywords": ["批量", "图片", "缩略图", "webp", "压缩", "水印", "图库", "素材"],
     "stations": ["01_ingest", "05_export"],
     "tools": ["libvips", "imagemagick", "jq"],
     "deliverables": ["thumbs/", "webp/", "manifest.json"],
     "evidence": "vipsthumbnail + mogrify 用法在 references，未跑完整 run", "matched_run": None,
     "plan": [{"tool": "libvips", "out": "thumbs/"}, {"tool": "imagemagick", "out": "webp/"},
              {"tool": "jq", "out": "manifest.json"}]},
]
(DATA / "recipes.json").write_text(json.dumps({"recipes": recipes}, indent=2, ensure_ascii=False))

# 真实封面搬进站点
cov = RUN / "05_export/cover_9x16.jpg"
if cov.exists():
    (ROOT / "site/assets/cover_9x16.jpg").write_bytes(cov.read_bytes())

# 打包成 <script> 可加载的 JS：minis:// 下 fetch 会挂起，script 标签不会
bundle = {n.replace(".json", ""): rj(DATA / n) for n in ["stations.json", "tools.json", "aoi.json", "recipes.json", "skins.json"]}
(DATA / "bundle.js").write_text("window.XCF_DATA = " + json.dumps(bundle, ensure_ascii=False, separators=(",", ":")) + ";\n")

h = {"station": "03_compile", "tool": "python3",
     "inputs": [{"path": p, "sha256": sha(p)} for p in
                ["craft-skills/runs/v3-20261023-130640/manifest.json",
                 "craft-skills/runs/v3-20261023-130640/06_qa/qa.json",
                 "build/refs/m11.css"]],
     "outputs": [{"path": f"site/data/{n}", "sha256": sha(f"site/data/{n}")}
                 for n in ["stations.json", "tools.json", "aoi.json", "recipes.json", "bundle.js"]],
     "started_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "exit_code": 0}
json.dump(h, open(OUT / "03_handoff.json", "w"), indent=2)
print(json.dumps({"stations": len(stations), "tools": len(tools),
                  "chain_closed": sum(1 for c in chain if c["closed"] == c["total"]), "chain_total": len(chain)}))
