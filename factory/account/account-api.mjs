// /account/api/summary — account info, balance, quota breakdown and a ledger
// built only from real sources:
//   * SubRouter: /v1/dashboard/billing/subscription (limit), /usage (total spend),
//     /api/usage/token (token name, model limits, quota flags).
//   * X-connect gateway: /v1/me/balance.
//   * Our own balance snapshots (work_checkpoints row "__ledger__"): every time the
//     account page or bootstrap reads the balance we store {at, limit, used}; a
//     limit increase is shown as a top-up and a used increase as a deduction.
// Nothing is fabricated: unknown data comes back as null / empty arrays.
export const TOPUP = {
  subrouter: { url: 'https://subrouter.ai/console/topup', console: 'https://subrouter.ai/console/log', name: 'SubRouter' },
  gateway: { url: 'https://api.x-connect.ai/', console: 'https://api.x-connect.ai/', name: 'X-connect Gateway' },
};
const MAX_SNAPS = 300;

async function getJson(fetchImpl, url, key) {
  try {
    const r = await fetchImpl(url, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

export function ledgerFromSnaps(snaps) {
  const out = [];
  for (let i = 1; i < snaps.length; i++) {
    const a = snaps[i - 1], b = snaps[i];
    if (b.limit != null && a.limit != null && b.limit - a.limit > 0.0001)
      out.push({ at: b.at, kind: 'topup', amount: +(b.limit - a.limit).toFixed(4), balanceAfter: b.balance });
    if (b.used != null && a.used != null && b.used - a.used > 0.0001)
      out.push({ at: b.at, kind: 'deduction', amount: -(+(b.used - a.used).toFixed(4)), balanceAfter: b.balance });
  }
  return out.reverse();
}

export async function accountSummary({ session, fetchImpl = globalThis.fetch, env = process.env, store = null }) {
  if (!session) return { ok: false, signedIn: false };
  const provider = session.provider || 'gateway';
  const out = {
    ok: true, signedIn: true, provider, tier: session.tier || null,
    user: { id: session.user?.id ?? null, email: session.user?.email ?? null, name: session.user?.name || session.user?.username || null, plan: session.user?.plan || session.tier || null },
    balance: null, unit: provider === 'subrouter' ? 'usd' : 'point', label: provider === 'subrouter' ? 'US$' : '点',
    limit: null, totalUsage: null, token: null, categories: [], ledger: [], snapshots: 0,
    topup: TOPUP[provider] || TOPUP.gateway, sources: [], notes: [],
  };
  if (session.guest || session.user?.guest) {
    // Guests run on the platform's shared tier key: never expose that account's balance.
    return { ...out, guest: true, notes: ['guest_session'], categories: [], topup: out.topup };
  }
  if (provider === 'subrouter') {
    const base = String(env.SUBROUTER_BASE || 'https://subrouter.ai').replace(/\/+$/, '');
    const [sub, use, tok] = await Promise.all([
      getJson(fetchImpl, base + '/v1/dashboard/billing/subscription', session.key),
      getJson(fetchImpl, base + '/v1/dashboard/billing/usage', session.key),
      getJson(fetchImpl, base + '/api/usage/token', session.key),
    ]);
    if (sub) { out.limit = Number(sub.hard_limit_usd ?? sub.soft_limit_usd ?? 0); out.sources.push('subrouter:subscription'); }
    if (use) { out.totalUsage = +(Number(use.total_usage ?? 0) / 100).toFixed(4); out.sources.push('subrouter:usage'); }
    if (out.limit != null && out.totalUsage != null) out.balance = +Math.max(0, out.limit - out.totalUsage).toFixed(2);
    const t = tok && tok.data;
    if (t) {
      out.sources.push('subrouter:token');
      const models = Object.keys(t.model_limits || {}).filter((m) => t.model_limits[m]);
      out.token = { name: t.name || null, unlimited: Boolean(t.unlimited_quota), granted: t.total_granted ?? null, used: t.total_used ?? null, available: t.total_available ?? null, expiresAt: t.expires_at || 0, models: t.model_limits_enabled ? models : [] };
    }
    out.categories.push({ id: 'llm', zh: 'LLM 对话（SubRouter ' + (session.tier || '') + ' 档）', en: 'LLM chat (SubRouter ' + (session.tier || '') + ')', billing: 'platform',
      remaining: out.token?.unlimited ? (out.balance) : (out.token?.available ?? out.balance), used: out.totalUsage, unit: 'usd', models: out.token?.models || [] });
    out.notes.push('per_request_log_unavailable');
  } else {
    const gw = String(env.GATEWAY_BASE_URL || 'https://api.x-connect.ai').replace(/\/+$/, '');
    const b = await getJson(fetchImpl, gw + '/v1/me/balance', session.key);
    if (b) { out.balance = b.data?.balance ?? b.user?.balance ?? null; out.totalUsage = b.data?.total_usage ?? null; out.sources.push('gateway:balance'); }
    out.categories.push({ id: 'llm', zh: 'LLM 对话（X-connect 网关）', en: 'LLM chat (X-connect gateway)', billing: 'platform', remaining: out.balance, used: out.totalUsage, unit: 'point', models: [] });
  }
  // Our own snapshot ledger.
  if (store && store.supaConfigured && store.supaConfigured()) {
    try {
      const row = await store.loadRow(session, '__ledger__');
      const src = (row && Array.isArray(row.sources) ? row.sources : []).find((s) => s && s.kind === 'ledger');
      let snaps = (src && Array.isArray(src.data?.snaps)) ? src.data.snaps : [];
      const last = snaps[snaps.length - 1];
      if (out.balance != null && (!last || last.limit !== out.limit || last.used !== out.totalUsage || last.balance !== out.balance)) {
        snaps = snaps.concat([{ at: new Date().toISOString(), limit: out.limit, used: out.totalUsage, balance: out.balance }]).slice(-MAX_SNAPS);
        await store.saveRow(session, '__ledger__', { goal: 'account-ledger', progress: '', constraints: '', decisions: '', todos: [], sources: [{ kind: 'ledger', data: { snaps } }] });
      }
      out.snapshots = snaps.length; out.firstSnapshot = snaps[0]?.at || null;
      out.ledger = ledgerFromSnaps(snaps);
      out.sources.push('xconnect:snapshots');
    } catch { out.notes.push('ledger_store_error'); }
  } else out.notes.push('ledger_store_unconfigured');
  return out;
}
