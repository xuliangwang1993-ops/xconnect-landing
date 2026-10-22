// Server-side proxy: real AoI M11 backend (aoi-m11-staging-api) -> CapabilitySnapshot.
// Config via env only (never secrets in code):
//   AOI_API_BASE        default https://aoi-m11-staging-api.onrender.com
//   AOI_SESSION_COOKIE  value of the aoi_session cookie (from POST /api/v1/session); optional
//   AOI_API_TIMEOUT_MS  default 8000
// Rule: a node is "verified" only if the API itself returned it verified WITH evidence_refs.
export const DEFAULT_AOI_API_BASE = 'https://aoi-m11-staging-api.onrender.com';

function cfg(env) {
  return {
    base: String(env.AOI_API_BASE || DEFAULT_AOI_API_BASE).replace(/\/+$/, ''),
    session: env.AOI_SESSION_COOKIE || '',
    timeout: Number(env.AOI_API_TIMEOUT_MS) || 8000,
  };
}

async function getJson(fetchImpl, url, { session, timeout }) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const headers = { accept: 'application/json' };
    if (session) headers.cookie = 'aoi_session=' + session;
    const r = await fetchImpl(url, { headers, signal: ctrl.signal });
    let body = null; try { body = await r.json(); } catch {}
    return { status: r.status, body };
  } finally { clearTimeout(t); }
}

export function guardVerified(nodes) {
  return (nodes || []).map((n) => {
    const ev = Array.isArray(n.evidence_refs) ? n.evidence_refs : [];
    return n.state === 'verified' && ev.length === 0 ? { ...n, state: 'unverified' } : n;
  });
}

export function pluginsToSnapshot(items, health) {
  const nodes = [], edges = [];
  const gid = 'goal:AoI 插件';
  nodes.push({ id: gid, kind: 'goal', label: 'AoI 插件', entity_ref: null, state: 'potential', layer: 'control', evidence_refs: [] });
  for (const p of items || []) {
    if (!p || !p.id) continue;
    const vs = p.verification_state;
    const ev = Array.isArray(p.evidence_refs) ? p.evidence_refs : [];
    const state = vs === 'verified' && ev.length ? 'verified' : (vs === 'verified' ? 'unverified' : (vs || 'potential'));
    nodes.push({ id: 'aoi:' + p.id, kind: 'function', label: p.display_name || p.plugin_key || p.id, entity_ref: p.id,
      state, layer: 'function', evidence_refs: ev, wb_status: (p.plugin_key || '') + (p.package_version ? '@' + p.package_version : '') });
    edges.push({ id: 'e:' + p.id, from_id: gid, to_id: 'aoi:' + p.id, relation: 'requires', evidence_status: 'documented', source_refs: [], evidence_refs: [] });
  }
  return { schema_version: '1.0.0', workspace_id: 'aoi', mode: 'live:' + (health?.mode || '?'), cursor: 0, capabilities: [], nodes, edges };
}

// Returns { source: 'aoi'|'fixture', reason?, health?, snapshot? }
export async function fetchAoiSnapshot({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const c = cfg(env);
  let health;
  try {
    const h = await getJson(fetchImpl, c.base + '/api/v1/health', c);
    if (h.status !== 200) return { source: 'fixture', reason: `AoI health ${h.status}`, base: c.base };
    health = h.body;
  } catch (e) { return { source: 'fixture', reason: 'AoI 不可达：' + (e.name === 'AbortError' ? '超时' : e.message), base: c.base }; }
  if (!c.session) return { source: 'fixture', reason: 'AoI 在线，但未配置 AOI_SESSION_COOKIE（读取需登录）', health, base: c.base };
  try {
    const tree = await getJson(fetchImpl, c.base + '/api/v1/capability-tree', c);
    if (tree.status === 200 && tree.body && Array.isArray(tree.body.nodes)) {
      return { source: 'aoi', endpoint: '/api/v1/capability-tree', health, base: c.base,
        snapshot: { ...tree.body, mode: 'live:' + (tree.body.mode || health?.mode || '?'), nodes: guardVerified(tree.body.nodes) } };
    }
    const pl = await getJson(fetchImpl, c.base + '/api/v1/plugins?limit=200', c);
    if (pl.status === 200 && pl.body && Array.isArray(pl.body.items)) {
      return { source: 'aoi', endpoint: '/api/v1/plugins', health, base: c.base, snapshot: pluginsToSnapshot(pl.body.items, health) };
    }
    return { source: 'fixture', reason: `AoI 读取失败 ${pl.status}${pl.status === 401 ? '（会话无效或过期）' : ''}`, health, base: c.base };
  } catch (e) { return { source: 'fixture', reason: 'AoI 读取出错：' + (e.name === 'AbortError' ? '超时' : e.message), health, base: c.base }; }
}
