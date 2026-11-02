#!/usr/bin/env python3
"""站 02b · 皮肤包：把 02_tokens 的 skins.json 编成页面包（script 标签载入）。
输入 = site/data/skins.json   输出 = site/data/skins.js（window.XCF_SKINS）
"""
import hashlib
import json
import pathlib
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "site/data/skins.json"
OUT = ROOT / "build/out"
DATA = ROOT / "site/data"


def sha(p):
    return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()


def main():
    src = json.loads(SRC.read_text())
    (DATA / "skins.js").write_text(
        "window.XCF_SKINS = " + json.dumps(src, ensure_ascii=False) + ";\n")
    h = {"station": "02b_skins", "tool": "python3",
         "inputs": [{"path": "site/data/skins.json", "sha256": sha(SRC)}],
         "outputs": [{"path": "site/data/skins.js", "sha256": sha(DATA / "skins.js")}],
         "count": len(src.get("skins", [])),
         "started_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "exit_code": 0}
    json.dump(h, open(OUT / "02b_handoff.json", "w"), indent=2, ensure_ascii=False)
    print(json.dumps({"skins": len(src.get("skins", []))}, ensure_ascii=False))


if __name__ == "__main__":
    main()
