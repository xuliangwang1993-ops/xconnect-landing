#!/usr/bin/env python3
"""把某个用户的工厂数据（订单 / Pod / 运行结果）写到 Supabase，页面登录后只读到自己的行（RLS）。

只给「主人的电脑 / pod 脚本」用：需要 service-role key。这个 key 只从环境读，绝不写进仓库、页面或日志：
    SUPABASE_SERVICE_ROLE_KEY=...            直接给 key
    FACTORY_SECRET_FILE=~/.config/xconnect/supabase_service_role   或者给一个只含 key 的文件
    SUPABASE_URL=https://elecldbgysdbymkyucwf.supabase.co          （默认就是这个）

指定写给谁（二选一）：
    --email you@example.com     用 auth admin API 按邮箱精确查 user_id（查不到就退出，不猜）
    --user-id <uuid>
    （或环境变量 FACTORY_USER_EMAIL / FACTORY_USER_ID）

写什么（默认 --all）：
    --orders   build/private/orders.json            -> factory_orders   （reconcile 取自 pod.json）
    --pods     build/private/pod.json  pods[]       -> factory_pods
    --runs     build/private/stations.json + artifacts.json + build.js -> factory_runs
    (orders/runs 行还会带上 build/private/i18n_en.json -> i18n_en 列：这位用户自己数据的英文译文)
    --all      以上三项
    --prune-pods   把该用户名下、这次 pod.json 里已经没有的 pod 行删掉
    --dry-run      只打印将写入的行数，不发请求（不需要 key 的部分仍会校验文件）

06_pod.py 的接法：06_pod.py 拉完 RunPod 实况、写完 build/private/pod.json 后，
若设置了 FACTORY_USER_EMAIL(或 FACTORY_USER_ID) 与 SUPABASE_SERVICE_ROLE_KEY，会自动调用本脚本
    python3 tools/push_factory_data.py --pods --orders
（见 06_pod.py 的 push_to_supabase）。整条链 build/run.sh 末尾会再 --all 推一次。
页面「POD · n RUNNING」按 factory_pods.live_status = 'RUNNING' 的行数算，所以每次对账都要把 live_status 推新。
"""
import argparse
import datetime
import json
import os
import pathlib
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
PRIV = ROOT / "build/private"
URL = os.environ.get("SUPABASE_URL", "https://elecldbgysdbymkyucwf.supabase.co").rstrip("/")


def key():
    k = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    f = os.environ.get("FACTORY_SECRET_FILE", "").strip()
    if not k and f:
        k = pathlib.Path(os.path.expanduser(f)).read_text().strip()
    if not k:
        sys.exit("缺 SUPABASE_SERVICE_ROLE_KEY（或 FACTORY_SECRET_FILE）")
    return k


def http(method, path, body=None, headers=None):
    k = key()
    h = {"apikey": k, "Authorization": "Bearer " + k, "Content-Type": "application/json"}
    h.update(headers or {})
    req = urllib.request.Request(URL + path, method=method, headers=h,
                                 data=None if body is None else json.dumps(body).encode())
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            return json.loads(raw) if raw.strip() else None
    except urllib.error.HTTPError as e:
        sys.exit(f"{method} {path.split('?')[0]} -> HTTP {e.code}: {e.read()[:300].decode(errors='replace')}")


def find_user_id(email):
    """按邮箱精确匹配（大小写不敏感）；分页翻 admin users，查不到就退出，不猜。"""
    want = email.strip().lower()
    page = 1
    while True:
        d = http("GET", f"/auth/v1/admin/users?page={page}&per_page=200")
        users = (d or {}).get("users", [])
        for u in users:
            if (u.get("email") or "").lower() == want:
                return u["id"]
        if len(users) < 200:
            break
        page += 1
    sys.exit(f"auth.users 里没有 {email}：不写任何数据（不猜别的账号）")


def upsert(table, rows, conflict):
    if not rows:
        return 0
    http("POST", f"/rest/v1/{table}?on_conflict={conflict}", rows,
         {"Prefer": "resolution=merge-duplicates,return=minimal"})
    return len(rows)


def rj(name):
    p = PRIV / name
    return json.loads(p.read_text()) if p.exists() else None


def ts(s):
    """'2026-10-25T13:56:43+1100' -> ISO with colon offset; 不认识的格式返回 None。"""
    if not s:
        return None
    m = re.match(r"^(.*[+-]\d\d)(\d\d)$", s)
    return (m.group(1) + ":" + m.group(2)) if m else s


def i18n_en():
    """build/private/i18n_en.json：{中文原文: English}，只翻这位用户自己数据里的句子（客户名、QA 备注等）。
    不放进公开的 site/i18n/*.js，随用户的 run/order 行一起存，页面登录后才取到。没有这个文件就不翻（页面里保留中文）。"""
    return rj("i18n_en.json") or None


def pod_rows(uid, pod):
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    rows = []
    for p in (pod or {}).get("pods", []):
        rows.append({
            "user_id": uid, "pod_id": p["id"], "name": p.get("name"), "live_status": p.get("desiredStatus"),
            "public_ip": p.get("publicIp") or "", "ports": p.get("ports") or [], "port_mappings": p.get("portMappings") or {},
            "gpu_count": p.get("gpuCount"), "vcpu_count": p.get("vcpuCount"), "memory_gb": p.get("memoryInGb"),
            "container_disk_gb": p.get("containerDiskInGb"), "volume_gb": p.get("volumeInGb"),
            "volume_mount_path": p.get("volumeMountPath"), "cost_per_hr": p.get("costPerHr"),
            "burn_since_created": p.get("burnSinceCreated"), "billed_total": p.get("billedTotal"),
            "billing": p.get("billing") or [], "image_name": p.get("imageName"),
            "last_status_change": p.get("lastStatusChange"),
            "observed_at": ts((pod or {}).get("generated_at")) or now, "updated_at": now,
        })
    return rows


def order_rows(uid, pod):
    src = rj("orders.json") or {"orders": []}
    rec = {r.get("order"): r for r in (pod or {}).get("reconcile", [])}
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    rows = []
    for o in src.get("orders", []):
        rows.append({
            "user_id": uid, "order_id": o["order_id"], "run_id": o.get("run_id"), "recipe": o.get("recipe"),
            "sentence": o.get("sentence"), "deliverables": o.get("deliverables") or [], "owner": o.get("owner") or {},
            "pod_id": o.get("pod_id"), "pod_name": o.get("pod_name"), "desired_status": o.get("desired_status"),
            "dispatch": o.get("dispatch"), "close_policy": o.get("close_policy"), "reconcile": rec.get(o["order_id"]),
            "status": o.get("status"), "opened_at": o.get("opened_at"), "updated_at": now,
            "i18n_en": i18n_en(),
        })
    return rows


def run_rows(uid):
    st = rj("stations.json")
    if not st:
        return []
    run = st.get("run", {})
    art = rj("artifacts.json") or {}
    files = [{k: v for k, v in f.items() if k != "dataurl"} for f in art.get("files", [])]   # 只推元数据
    artifacts = {"files": files, "inlined": art.get("inlined"), "meta_only": art.get("meta_only"),
                 "total_bytes": art.get("total_bytes")} if art else None
    build = None
    bj = PRIV / "build.js"
    if bj.exists():
        m = re.search(r"=\s*(\{.*\})\s*;?\s*$", bj.read_text(), re.S)
        build = json.loads(m.group(1)) if m else None
    orders = (rj("orders.json") or {}).get("orders", [])
    recipe = next((o.get("recipe") for o in orders if o.get("run_id") == run.get("id")), None)
    return [{
        "user_id": uid, "run_id": run.get("id"), "recipe": recipe, "sentence": run.get("sentence"),
        "status": run.get("status"), "exit_code": run.get("exit_code"), "elapsed_s": run.get("elapsed_s"),
        "chain_closed": run.get("chain_closed"), "chain_total": run.get("chain_total"),
        "stations": st.get("stations", []), "chain": st.get("chain", []), "build": build, "artifacts": artifacts,
        "generated_at": ts((art or {}).get("generated_at")) or ts((build or {}).get("at")),
        "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "i18n_en": i18n_en(),
    }]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--email", default=os.environ.get("FACTORY_USER_EMAIL"))
    ap.add_argument("--user-id", default=os.environ.get("FACTORY_USER_ID"))
    ap.add_argument("--orders", action="store_true")
    ap.add_argument("--pods", action="store_true")
    ap.add_argument("--runs", action="store_true")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--prune-pods", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    if not (a.orders or a.pods or a.runs):
        a.all = True
    if a.all:
        a.orders = a.pods = a.runs = True
    if not (a.email or a.user_id):
        sys.exit("要 --email 或 --user-id（或 FACTORY_USER_EMAIL / FACTORY_USER_ID）")
    pod = rj("pod.json")
    if a.dry_run:
        uid = a.user_id or "<dry-run-user>"
        print(json.dumps({"orders": len(order_rows(uid, pod)) if a.orders else 0, "pods": len(pod_rows(uid, pod)) if a.pods else 0,
                          "runs": len(run_rows(uid)) if a.runs else 0}))
        return
    uid = a.user_id or find_user_id(a.email)
    n = {}
    if a.pods:
        rows = pod_rows(uid, pod)
        n["pods"] = upsert("factory_pods", rows, "user_id,pod_id")
        if a.prune_pods and rows:
            keep = ",".join(urllib.parse.quote(r["pod_id"]) for r in rows)
            http("DELETE", f"/rest/v1/factory_pods?user_id=eq.{uid}&pod_id=not.in.({keep})")
    if a.runs:
        n["runs"] = upsert("factory_runs", run_rows(uid), "user_id,run_id")
    if a.orders:                      # 订单在 run 之后写，保证 run_id 对得上
        n["orders"] = upsert("factory_orders", order_rows(uid, pod), "user_id,order_id")
    print(json.dumps({"user_id": uid, **n}))


if __name__ == "__main__":
    main()
