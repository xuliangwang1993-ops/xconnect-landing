import { syncLinear } from './sync.mjs';
import { openLinearStore } from './store.mjs';

function missing(code) {
  const err = new Error(code);
  err.code = code;
  err.status = 503;
  return err;
}

export function createLinearService(env = process.env, options = {}) {
  let storePromise = null;
  let timer = null;
  let syncing = null;

  function databaseUrl() {
    return String(env.DATABASE_URL || '').trim();
  }

  function store() {
    if (!databaseUrl()) throw missing('database_url_missing');
    if (!storePromise) {
      storePromise = openLinearStore(env).catch((err) => {
        storePromise = null;
        throw err;
      });
    }
    return storePromise;
  }

  async function syncNow() {
    if (!String(env.LINEAR_API_KEY || '').trim()) throw missing('linear_key_missing');
    if (syncing) return syncing;
    syncing = (async () => {
      const current = await store();
      return syncLinear(current, { env, fetchImpl: options.fetchImpl, endpoint: options.endpoint });
    })();
    try {
      return await syncing;
    } finally {
      syncing = null;
    }
  }

  async function snapshot() {
    const current = await store();
    const [issues, teams, workflowStates] = await Promise.all([
      current.list('issue'),
      current.list('team'),
      current.list('workflow_state'),
    ]);
    const syncedAt = issues[0]?.synced_at || teams[0]?.synced_at || workflowStates[0]?.synced_at || null;
    return { source: 'linear_issues', syncedAt, issues, teams, workflowStates };
  }

  function start() {
    if (!databaseUrl() || !String(env.LINEAR_API_KEY || '').trim()) return;
    const interval = Number(env.LINEAR_SYNC_INTERVAL_MS || 300_000);
    const wait = Number.isFinite(interval) && interval >= 15_000 ? interval : 300_000;
    const tick = () => {
      syncNow().catch((err) => {
        const log = options.log || console.error;
        log('[linear] sync failed: ' + (err.code || err.message || 'error'));
      });
    };
    tick();
    timer = setInterval(tick, wait);
    timer.unref?.();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { snapshot, syncNow, start, stop };
}
