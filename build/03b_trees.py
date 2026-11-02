#!/usr/bin/env python3
"""站 03b · 把两棵内置树（AoI 施工包 / GitHub MCP 源码导出）编成页面可吃的数据包。
上游 = M11 bundle 抽出的注册表（build/refs/trees-builtin.json，含 toolsets 与按 _parent 归位的 leaves）
下游 = site/data/trees.js（window.XCF_TREES）"""
import hashlib, json, pathlib, time

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "build/refs/trees-builtin.json"
OUT = ROOT / "build/out"
DATA = ROOT / "site/data"
DATA.mkdir(parents=True, exist_ok=True)


def sha(p):
    return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()


snap = json.loads(SRC.read_text())

TS_KEYS = ("id", "uuid", "edge_uuid", "name", "label_zh", "summary_zh", "risk",
           "default_enabled", "optional", "remote_only", "note", "wave",
           "suggested_actions_zh", "evidence")
TL_KEYS = ("id", "uuid", "edge_uuid", "name", "label_zh", "summary_zh", "title_en",
           "risk", "default_enabled", "leaf_type", "gating", "params",
           "evidence", "evidence_excerpt", "suggested_actions_zh")
ROOT_KEYS = ("id", "tree_kind", "uuid", "name", "label_zh", "summary_zh", "risk",
             "default_enabled", "suggested_actions_zh", "evidence", "source", "stats",
             "default_toolsets")


def subset(d, keys):
    return {k: d[k] for k in keys if k in d}


out = {}
for key in ("aoi", "github"):
    t = snap[key]
    # leaves 在导出时按 _parent 归了位，这里挂回 toolset
    by_parent = {}
    for tl in t.get("leaves") or []:
        by_parent.setdefault(tl.get("_parent"), []).append(tl)
    toolsets = []
    for ts in t["toolsets"]:
        item = subset(ts, TS_KEYS)
        raw = ts.get("tools") or by_parent.get(ts.get("id"), [])
        item["tools"] = [subset(tl, TL_KEYS) for tl in raw]
        toolsets.append(item)
    assert sum(len(x["tools"]) for x in toolsets) > 0, key
    out[key] = {
        "tree_kind": t["tree_kind"],
        "root": subset(t["root"], ROOT_KEYS),
        "toolsets": toolsets,
        "evidence_excerpts": t.get("evidence_excerpts") or {},
    }

(DATA / "trees.js").write_text(
    "window.XCF_TREES = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n"
)

h = {"station": "03b_trees", "tool": "python3",
     "inputs": [{"path": "build/refs/trees-builtin.json", "sha256": sha(SRC)}],
     "outputs": [{"path": "site/data/trees.js", "sha256": sha(DATA / "trees.js")}],
     "counts": {k: {"toolsets": len(v["toolsets"]),
                    "tools": sum(len(t.get("tools") or []) for t in v["toolsets"])}
                for k, v in out.items()},
     "started_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "exit_code": 0}
json.dump(h, open(OUT / "03b_handoff.json", "w"), indent=2, ensure_ascii=False)
print(json.dumps(h["counts"], ensure_ascii=False), (DATA / "trees.js").stat().st_size, "bytes")
