#!/usr/bin/env python3
"""站 06b · 派单到 RunPod：拉全部 pod 实况 + 拉已发的单，两边对账。

上游 = 小助手在工厂里发的单（build/orders.json）
输出 = build/private/pod.json（私有 {pods[], orders[], reconcile[], probe{}}；不进 site/）
      设了 FACTORY_USER_EMAIL（或 FACTORY_USER_ID）+ SUPABASE_SERVICE_ROLE_KEY 时，同步 upsert 到 Supabase（见 tools/push_factory_data.py）

安全：RunPod key 只从环境变量 RUNPOD_KEY 读，不落盘、不进 JS 包。
没 key 也能跑：live=null + probe.error，界面照实标"未连接"。
stop/start 只在显式 --do <podId> 时才发（默认干查）。
"""
import datetime
import hashlib
import json
import os
import pathlib
import subprocess
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "build/out"
DATA = ROOT / "build/private"
DATA.mkdir(parents=True, exist_ok=True)

BASE = "https://rest.runpod.io/v1"
KEY = os.environ.get("RUNPOD_KEY", "")


def sha(p):
    return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()


def call(method, path, body=None, timeout=25):
    cmd = ["curl", "-sS", "-m", str(timeout), "-X", method,
           "-H", "Authorization: Bearer " + KEY, "-w", "\n%{http_code}"]
    if body is not None:
        cmd += ["-H", "Content-Type: application/json", "-d", json.dumps(body)]
    cmd.append(BASE + path)
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout + 10)
    out, _, code = r.stdout.rpartition("\n")
    if r.returncode != 0 or not code.isdigit() or int(code) >= 400:
        raise RuntimeError(f"{method} {path} -> HTTP {code.strip() or '?'} {out[:220]}")
    return json.loads(out) if out.strip() else None, int(code)


def slim(p):
    created = p.get("createdAt") or p.get("lastStartedAt")
    burn = None
    if created and p.get("costPerHr"):
        try:
            t = datetime.datetime.strptime(created, "%Y-%m-%d %H:%M:%S.%f %z UTC").replace(tzinfo=datetime.timezone.utc)
            burn = round((datetime.datetime.now(datetime.timezone.utc) - t).total_seconds() / 3600 * p["costPerHr"], 4)
        except Exception:
            pass
    return {
        "id": p.get("id"), "name": p.get("name"), "desiredStatus": p.get("desiredStatus"),
        "publicIp": p.get("publicIp"), "ports": p.get("ports", []),
        "portMappings": p.get("portMappings") or {},
        "gpuCount": p.get("gpuCount"), "vcpuCount": p.get("vcpuCount"),
        "memoryInGb": p.get("memoryInGb"), "containerDiskInGb": p.get("containerDiskInGb"),
        "costPerHr": p.get("costPerHr"), "burnSinceCreated": burn,
        "imageName": p.get("imageName"), "templateId": p.get("templateId"),
        "createdAt": p.get("createdAt"), "lastStartedAt": p.get("lastStartedAt"),
        "lastStatusChange": p.get("lastStatusChange"),
        "hasSshKey": bool((p.get("env") or {}).get("PUBLIC_KEY")),
        "volumeMountPath": p.get("volumeMountPath"), "volumeInGb": p.get("volumeInGb"),
    }


def load_orders():
    p = ROOT / "build/private/orders.json"
    return json.loads(p.read_text()) if p.exists() else {"orders": []}


def main():
    do = None
    if "--do" in sys.argv:  # 显式动作：stop/start <podId>
        i = sys.argv.index("--do")
        do = (sys.argv[i + 1], sys.argv[i + 2]) if len(sys.argv) > i + 2 else None

    out = {"generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
           "probe": {"key": bool(KEY), "base": BASE},
           "pods": [], "orders": load_orders()["orders"], "reconcile": [], "actions": []}
    if not KEY:
        out["probe"]["error"] = "RUNPOD_KEY not set（build/06_pod.py 只读环境变量，不落盘）"
        write(out); print("no key"); return 0

    if do:
        act, pod_id = do
        if act not in ("stop", "start", "restart"):
            print("action must be stop|start|restart"); return 64
        r, code = call("POST", f"/pods/{pod_id}/{act}")
        out["actions"].append({"action": act, "pod": pod_id, "http": code, "resp": r})
        print(f"{act} {pod_id} -> {code}")

    try:
        pods, _ = call("GET", "/pods")
        out["probe"]["ok"] = True
        out["probe"]["pods"] = len(pods)
        out["pods"] = [slim(p) for p in pods]
        try:
            bill, _ = call("GET", "/billing/pods")
            by = {}
            for b in bill:
                by.setdefault(b.get("podId"), []).append(b)
            for sp in out["pods"]:
                sp["billing"] = by.get(sp["id"], [])
                sp["billedTotal"] = round(sum(x.get("amount", 0) for x in by.get(sp["id"], [])), 4)
        except Exception as e:
            out["probe"]["billingError"] = str(e)[:160]
        for o in out["orders"]:
            live = next((p for p in out["pods"] if p["id"] == o.get("pod_id") or p["name"] == o.get("pod_name")), None)
            out["reconcile"].append({
                "order": o.get("order_id"), "pod": o.get("pod_id"), "pod_name": o.get("pod_name"),
                "owner": o.get("owner", {}).get("name", o.get("owner_id")),
                "status": "matched" if live else "pod_missing",
                "wanted": o.get("desired_status"),
                "live": live.get("desiredStatus") if live else None,
                "billable": live.get("costPerHr") if live else None,
                "burn": live.get("burnSinceCreated") if live else None,
            })
    except Exception as e:
        out["probe"]["ok"] = False
        out["probe"]["error"] = str(e)[:300]

    write(out)
    print(json.dumps({"pods": len(out["pods"]), "orders": len(out["orders"]),
                      "reconcile": out["reconcile"], "probe": out["probe"]},
                     ensure_ascii=False)[:600])
    return 0 if out["pods"] else 1


def push_to_supabase():
    """把本次 pod/订单对账结果 upsert 到该用户名下（RLS：页面只读，写只走 service role）。"""
    if not (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("FACTORY_SECRET_FILE")):
        print("（未设 SUPABASE_SERVICE_ROLE_KEY：只写本地 build/private/pod.json，不同步到页面）")
        return
    if not (os.environ.get("FACTORY_USER_EMAIL") or os.environ.get("FACTORY_USER_ID")):
        print("（未设 FACTORY_USER_EMAIL / FACTORY_USER_ID：不同步）")
        return
    r = subprocess.run([sys.executable, str(ROOT / "tools/push_factory_data.py"), "--pods", "--orders"],
                       capture_output=True, text=True)
    print((r.stdout + r.stderr).strip()[-400:])


def write(out):
    (DATA / "pod.json").write_text(json.dumps(out, ensure_ascii=False, indent=2))
    push_to_supabase()
    h = {"station": "06b_pod", "tool": "runpod-rest",
         "inputs": [{"path": "build/private/orders.json",
                     "sha256": sha(ROOT / "build/private/orders.json") if (ROOT / "build/private/orders.json").exists() else None}],
         "outputs": [{"path": "build/private/pod.json", "sha256": sha(DATA / "pod.json")}],
         "started_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
         "exit_code": 0 if out.get("pods") else 1}
    json.dump(h, open(OUT / "06b_handoff.json", "w"), indent=2, ensure_ascii=False)


if __name__ == "__main__":
    sys.exit(main())
