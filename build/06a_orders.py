#!/usr/bin/env python3
"""站 06a · 编订单：把小助手在工厂里发的单（build/orders.json）编成页面包。
上游 = build/orders.json
输出 = site/data/build-order.js（window.XCF_BUILD_ORDER = {orders:[…]}）
"""
import hashlib
import json
import pathlib
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "build/orders.json"
OUT = ROOT / "build/out"
DATA = ROOT / "site/data"


def sha(p):
    return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()


def main():
    if not SRC.exists():
        out = {"generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "orders": [], "probe": {"error": "build/orders.json 不存在"}}
    else:
        src = json.loads(SRC.read_text())
        out = {"generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
               "source": "build/orders.json", "orders": src.get("orders", [])}
    (DATA / "build-order.js").write_text(
        "window.XCF_BUILD_ORDER = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
    h = {"station": "06a_orders", "tool": "python3",
         "inputs": [{"path": "build/orders.json", "sha256": sha(SRC)} if SRC.exists() else {"path": "build/orders.json", "sha256": None}],
         "outputs": [{"path": "site/data/build-order.js", "sha256": sha(DATA / "build-order.js")}],
         "count": len(out["orders"]),
         "started_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "exit_code": 0}
    json.dump(h, open(OUT / "06a_handoff.json", "w"), indent=2, ensure_ascii=False)
    print(json.dumps({"orders": len(out["orders"])}, ensure_ascii=False))


if __name__ == "__main__":
    main()
