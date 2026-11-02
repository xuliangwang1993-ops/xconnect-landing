#!/bin/sh
# 整套测试的整机串行守护。
#
# 为什么需要：iSH 沙盒对"同时启动多个 Node 进程"有线程创建上限
# （node_platform.cc DelayedTaskScheduler::Start 断言 uv_thread_create 失败，
#  子进程会静默 exit 0）。完整测试会拉起多个子服务，撞上限后工作台用例假红。
# 这里用目录锁保证同一时刻只有一套测试在跑，排队而不是并发。
set -e
LOCK="${TMPDIR:-/tmp}/xc-brain-test.lock"
i=0
while ! mkdir "$LOCK" 2>/dev/null; do
  i=$((i + 1))
  [ "$i" -gt 600 ] && { echo "another test run holds $LOCK" >&2; exit 1; }
  sleep 1
done
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT INT TERM
exec node --test --test-concurrency=1 "$@"
