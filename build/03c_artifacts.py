#!/usr/bin/env python3
"""站 03c · 真产物内联：封面 / 字幕 / 报告直接 base64 进页面，点开就是真的。
输入 = runs/<id>/05_export/cover_*.jpg, 04_subs/*.srt, 06_qa/*.json 等小件
输出 = site/data/artifacts.js（window.XCF_ARTIFACTS = {files:[{path,name,bytes,sha8,mime,dataurl}]}）
大件（mp4/docx/pdf）只登记 meta，不内联。
"""
import base64
import hashlib
import json
import pathlib
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
RUN = ROOT / "craft-skills/runs/v3-20261023-130640"
OUT = ROOT / "build/out"
DATA = ROOT / "site/data"
DATA.mkdir(parents=True, exist_ok=True)

LIMIT = 512 * 1024                      # 内联上限：512 KB
SMALL = {".jpg", ".png", ".srt", ".json", ".md", ".csv", ".txt"}   # 内联白名单
BIG = {".mp4", ".pdf", ".docx"}         # 只登记 meta
MIME = {".jpg": "image/jpeg", ".png": "image/png", ".srt": "text/plain",
        ".json": "application/json", ".md": "text/plain", ".csv": "text/plain",
        ".txt": "text/plain", ".mp4": "video/mp4", ".pdf": "application/pdf",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}


def sha(p):
    return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()


def main():
    files, inlined, meta_only = [], 0, 0
    for p in sorted(RUN.rglob("*")):
        if not p.is_file():
            continue
        rel = str(p.relative_to(RUN))
        b = p.read_bytes()
        mime = MIME.get(p.suffix, "application/octet-stream")
        rec = {"path": rel, "name": p.name, "bytes": len(b),
               "sha8": sha(p)[:8], "mime": mime, "ext": p.suffix.lstrip(".")}
        if p.suffix in SMALL and len(b) <= LIMIT:
            rec["dataurl"] = "data:%s;base64,%s" % (mime, base64.b64encode(b).decode())
            inlined += 1
        else:
            rec["dataurl"] = None
            meta_only += 1
        files.append(rec)
    out = {"generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
           "run_id": RUN.name, "files": files,
           "inlined": inlined, "meta_only": meta_only,
           "total_bytes": sum(f["bytes"] for f in files)}
    (DATA / "artifacts.js").write_text(
        "window.XCF_ARTIFACTS = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
    (DATA / "artifacts.json").write_text(json.dumps(out, ensure_ascii=False, indent=2))
    h = {"station": "03c_artifacts", "tool": "python3-base64",
         "inputs": [{"path": f"craft-skills/runs/v3-20261023-130640/{f['path']}", "sha256": sha(RUN / f["path"])}
                    for f in files if f["dataurl"]][:8],
         "outputs": [{"path": "site/data/artifacts.js", "sha256": sha(DATA / "artifacts.js")}],
         "count": len(files), "inlined": inlined, "meta_only": meta_only,
         "total_bytes": out["total_bytes"],
         "started_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "exit_code": 0}
    json.dump(h, open(OUT / "03c_handoff.json", "w"), indent=2, ensure_ascii=False)
    print(json.dumps({"files": len(files), "inlined": inlined, "meta_only": meta_only,
                      "total_kb": out["total_bytes"] // 1024}, ensure_ascii=False))


if __name__ == "__main__":
    main()
