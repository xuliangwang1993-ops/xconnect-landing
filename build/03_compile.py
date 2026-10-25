#!/usr/bin/env python3
"""站 03 · 编数据：把 run 的 8 站交接书、工具表、配方表编成页面可吃的 JS 包。
输入 = craft-skills/runs/v3-20261023-130640/{manifest.json, 0*/handoff.json, 0*/qa.json, 0*/scorecard.json}
输出 = site/data/{stations-def,tools,recipes}.js（公开，只含静态说明）
      build/private/{stations.json,bundle.json}（私有运行结果，不进 site/，由 tools/push_factory_data.py 推到 Supabase）
"""
import hashlib
import json
import pathlib
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
RUN = ROOT / "craft-skills/runs/v3-20261023-130640"
OUT = ROOT / "build/out"
DATA = ROOT / "site/data"
PRIV = ROOT / "build/private"
DATA.mkdir(parents=True, exist_ok=True)
PRIV.mkdir(parents=True, exist_ok=True)

HAND_ZH = {"00_brief": "需求解析", "01_ingest": "素材入库", "02_script": "脚本分镜",
           "03_grade": "画面与混音", "04_subs": "字幕", "05_export": "三尺寸导出",
           "06_qa": "验收", "07_kb": "知识包"}
HAND_NOTE = {"00_brief": "把一句话拆成字段：时长、语种、尺寸、交付清单",
             "01_ingest": "抓官网、核事实、给每个素材记来源与许可",
             "02_script": "把事实写成六镜，出分镜 PDF 与菜单卡",
             "03_grade": "逐帧生成、调色、合成底乐，独立取证",
             "04_subs": "中英字幕、行宽与安全区校核",
             "05_export": "9:16 / 1:1 / 16:9 各 30.000s，封面与角标",
             "06_qa": "解码、时长、响度、安全区、追溯链",
             "07_kb": "把事实与菜单编成小助手可答的知识包"}
HAND_AOI = {"00_brief": "M07", "01_ingest": "M02", "02_script": "M07", "03_grade": "M04",
            "04_subs": "M01", "05_export": "M04", "06_qa": "M05", "07_kb": "M08"}


def sha(p):
    return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()


def rj(p):
    return json.loads(pathlib.Path(p).read_text())


def main():
    manifest = rj(RUN / "manifest.json")
    stations = []
    for sid in manifest.get("stations", []):
        d = RUN / sid
        hand = rj(d / "handoff.json") if (d / "handoff.json").exists() else {}
        outs = []
        for o in hand.get("outputs", []):
            p = RUN / o.get("path", "")
            outs.append({**o, "bytes": p.stat().st_size if p.exists() else None})
        stations.append({
            "id": sid,
            "index": sid[:2],
            "zh": HAND_ZH.get(sid, sid),
            "note": HAND_NOTE.get(sid, ""),
            "aoi": HAND_AOI.get(sid, ""),
            "tools": hand.get("tools", []),
            "inputs": [{**i, "closed": False, "from": None} for i in hand.get("inputs", [])],
            "outputs": outs,
            "elapsed_s": hand.get("elapsed_s"),
            "exit_code": hand.get("exit_code", 0),
            "started_at": hand.get("started_at"),
            "ended_at": hand.get("ended_at"),
            "qa": rj(d / "qa.json") if (d / "qa.json").exists() else {},
            "score": (rj(d / "scorecard.json").get("score") if (d / "scorecard.json").exists() else None),
            "reasons": (rj(d / "scorecard.json").get("reasons") if (d / "scorecard.json").exists() else {}),
        })

    # 交接账本：按**全上游**比对 sha256（03_grade 吃 01_ingest 的产物，
    # 只看上一站会误判成没闭合；07_kb 吃 06_qa 的 qa.json 是真缺口——没登记进 outputs）
    all_prev = {}          # sha256 -> 站 id
    for o in stations[0].get("outputs", []):
        if o.get("sha256"):
            all_prev[o["sha256"]] = stations[0]["id"]
    chain, closed_total, link_total = [], 0, 0
    for st in stations[1:]:
        links = []
        for inp in st.get("inputs", []):
            hit = all_prev.get(inp.get("sha256"))
            closed = bool(hit)
            links.append({"artifact": (inp.get("path") or "").split("/")[-1],
                          "closed": closed, "from": hit or None})
            inp["closed"] = closed
            inp["from"] = hit or None
        c = sum(1 for l in links if l["closed"])
        closed_total += c
        link_total += len(links)
        chain.append({"to": st["id"], "closed": c, "total": len(links), "links": links})
        for o in st.get("outputs", []):
            if o.get("sha256"):
                all_prev[o["sha256"]] = st["id"]

    run = {"id": manifest.get("run_id"), "sentence": manifest.get("sentence", ""),
           "status": manifest.get("status"), "exit_code": manifest.get("exit_code"),
           "elapsed_s": manifest.get("elapsed_s"), "stations": manifest.get("stations", []),
           "chain_closed": closed_total, "chain_total": link_total}
    stations_out = {"run": run, "stations": stations, "chain": chain}
    # 公开：只有工位的静态说明（无运行结果）。运行结果是私有数据，写到 build/private/
    defs = [{k: s[k] for k in ("id", "index", "zh", "note", "aoi")} | {"tools": s.get("tools", [])} for s in stations]
    (DATA / "stations-def.js").write_text(
        "window.XCF_STATIONS_DEF = " + json.dumps({"stations": defs}, ensure_ascii=False) + ";\n")
    (PRIV / "stations.json").write_text(json.dumps(stations_out, ensure_ascii=False, indent=2))

    tools_src = rj(DATA / "tools.json")
    (DATA / "tools.js").write_text("window.XCF_TOOLS = " + json.dumps(tools_src, ensure_ascii=False) + ";\n")
    rec_src = rj(DATA / "recipes.json")
    (DATA / "recipes.js").write_text("window.XCF_RECIPES = " + json.dumps(rec_src, ensure_ascii=False) + ";\n")

    aoi_src = rj(DATA / "aoi.json")
    bundle = {"stations": stations_out, "aoi": aoi_src, "tools": tools_src, "recipes": rec_src,
              "manifest": manifest}
    (PRIV / "bundle.json").write_text(json.dumps(bundle, ensure_ascii=False))   # 私有，不进 site/

    h = {"station": "03_compile", "tool": "python3",
         "inputs": [{"path": "craft-skills/runs/v3-20261023-130640/manifest.json",
                     "sha256": sha(RUN / "manifest.json")}],
         "outputs": [{"path": "site/data/stations-def.js", "sha256": sha(DATA / "stations-def.js")},
                     {"path": "build/private/stations.json", "sha256": sha(PRIV / "stations.json")}],
         "started_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "exit_code": 0}
    json.dump(h, open(OUT / "03_handoff.json", "w"), indent=2, ensure_ascii=False)
    print(json.dumps({"stations": len(stations), "chain": len(chain),
                      "闭合": f"{closed_total}/{link_total}", "run": run["id"]},
                     ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("03_compile failed:", repr(e), file=sys.stderr)
        raise
