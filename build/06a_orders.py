#!/usr/bin/env python3
"""站 06a · 编订单：把小助手在工厂里发的单（build/orders.json）编成页面包。
上游 = build/orders.json
输出 = build/private/build-order.json（私有；订单进 Supabase factory_orders，不进 site/）
"""
import hashlib
import json
import pathlib
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "build/private/orders.json"
OUT = ROOT / "build/out"
DATA = ROOT / "build/private"
DATA.mkdir(parents=True, exist_ok=True)


def sha(p):
    return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()


def main():
    if not SRC.exists():
        out = {"generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "orders": [], "probe": {"error": "build/private/orders.json 不存在"}}
    else:
        src = json.loads(SRC.read_text())
        out = {"generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
               "source": "build/private/orders.json", "orders": src.get("orders", [])}
    (DATA / "build-order.json").write_text(json.dumps(out, ensure_ascii=False, indent=2))
    h = {"station": "06a_orders", "tool": "python3",
         "inputs": [{"path": "build/private/orders.json", "sha256": sha(SRC)} if SRC.exists() else {"path": "build/private/orders.json", "sha256": None}],
         "outputs": [{"path": "build/private/build-order.json", "sha256": sha(DATA / "build-order.json")}],
         "count": len(out["orders"]),
         "started_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "exit_code": 0}
    json.dump(h, open(OUT / "06a_handoff.json", "w"), indent=2, ensure_ascii=False)
    print(json.dumps({"orders": len(out["orders"])}, ensure_ascii=False))


if __name__ == "__main__":
    main()
