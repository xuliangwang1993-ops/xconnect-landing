// Server-side proxy: real AoI M11 backend (aoi-m11-staging-api) -> CapabilitySnapshot.
// Config via env only (never secrets in code):
//   AOI_API_BASE        default https://aoi-m11-staging-api.onrender.com
//   AOI_SESSION_COOKIE  value of the aoi_session cookie (from POST /api/v1/session); optional
//   AOI_BOOTSTRAP_TOKEN staging bootstrap token; if set (and no static cookie) the proxy logs in
//                       via POST /api/v1/session, caches the cookie and re-logs-in once on 401
//   AOI_ORIGIN          Origin header for the login request (default = AOI_API_BASE)
//   AOI_CAPABILITY_ALLOW optional comma list of kinds/categories/layers to show (default: all non-recipe)
// Recipes (配方) are never shown in the factory board.
//   AOI_API_TIMEOUT_MS  default 8000
// Rule: a node is "verified" only if the API itself returned it verified WITH evidence_refs.
export const DEFAULT_AOI_API_BASE = 'https://aoi-m11-staging-api.onrender.com';

function cfg(env) {
  return {
    base: String(env.AOI_API_BASE || DEFAULT_AOI_API_BASE).replace(/\/+$/, ''),
    session: env.AOI_SESSION_COOKIE || '',
    bootstrap: env.AOI_BOOTSTRAP_TOKEN || '',
    origin: env.AOI_ORIGIN || '',
    allow: String(env.AOI_CAPABILITY_ALLOW || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean),
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

const loginCache = new Map(); // base -> cookie value
export function _resetAoiLoginCache() { loginCache.clear(); }

async function login(fetchImpl, c) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), c.timeout);
  try {
    const r = await fetchImpl(c.base + '/api/v1/session', { method: 'POST', signal: ctrl.signal,
      headers: { 'content-type': 'application/json', accept: 'application/json', origin: c.origin || c.base },
      body: JSON.stringify({ bootstrap_token: c.bootstrap }) });
    const sc = (r.headers && typeof r.headers.get === 'function' && r.headers.get('set-cookie')) || '';
    const m = /aoi_session=([^;]+)/.exec(sc);
    if ((r.status === 200 || r.status === 201) && m) { loginCache.set(c.base, m[1]); return m[1]; }
    throw new Error('AoI 登录失败 ' + r.status);
  } finally { clearTimeout(t); }
}

const RECIPE_RE = /recipe|配方/i;
export function isRecipe(n) {
  return [n.kind, n.category, n.layer, n.id, n.entity_ref, n.plugin_key, n.wb_status, n.label]
    .some((v) => typeof v === 'string' && RECIPE_RE.test(v));
}
// Drop recipes; if an allowlist is set keep only goal nodes + nodes whose kind/category/layer matches.
export function filterSnapshot(snap, allow = []) {
  const keep = (n) => {
    if (isRecipe(n)) return false;
    if (!allow.length || n.kind === 'goal') return true;
    return [n.kind, n.category, n.layer].some((v) => typeof v === 'string' && allow.includes(v.toLowerCase()));
  };
  const nodes = (snap.nodes || []).filter(keep);
  const ids = new Set(nodes.map((n) => n.id));
  const edges = (snap.edges || []).filter((e) => ids.has(e.from_id) && ids.has(e.to_id));
  const capabilities = (snap.capabilities || []).filter((x) => !(x && typeof x === 'object' ? isRecipe(x) : RECIPE_RE.test(String(x))));
  return { snapshot: { ...snap, nodes, edges, capabilities }, excluded: (snap.nodes || []).length - nodes.length };
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
  let session = c.session || loginCache.get(c.base) || '';
  if (!session && !c.bootstrap) return { source: 'fixture', reason: 'AoI 在线，但未配置 AOI_SESSION_COOKIE 或 AOI_BOOTSTRAP_TOKEN（读取需登录）', health, base: c.base };
  const auth = c.session ? 'cookie' : 'bootstrap-login';
  try {
    if (!session) session = await login(fetchImpl, c);
    const get = async (path) => {
      let r = await getJson(fetchImpl, c.base + path, { ...c, session });
      if (r.status === 401 && !c.session && c.bootstrap) {
        loginCache.delete(c.base); session = await login(fetchImpl, c);
        r = await getJson(fetchImpl, c.base + path, { ...c, session });
      }
      return r;
    };
    const done = (endpoint, snap) => {
      const f = filterSnapshot(snap, c.allow);
      return { source: 'aoi', endpoint, auth, health, base: c.base, excluded: f.excluded, allow: c.allow, snapshot: f.snapshot };
    };
    const tree = await get('/api/v1/capability-tree');
    if (tree.status === 200 && tree.body && Array.isArray(tree.body.nodes)) {
      return done('/api/v1/capability-tree', { ...tree.body, mode: 'live:' + (tree.body.mode || health?.mode || '?'), nodes: guardVerified(tree.body.nodes) });
    }
    const caps = await get('/api/v1/capabilities');
    const capsOk = caps.status === 200 && caps.body && Array.isArray(caps.body.nodes);
    if (capsOk && caps.body.nodes.length) {
      return done('/api/v1/capabilities', { ...caps.body, mode: 'live:' + (caps.body.mode || health?.mode || '?'), nodes: guardVerified(caps.body.nodes) });
    }
    const pl = await get('/api/v1/plugins?limit=200');
    if (pl.status === 200 && pl.body && Array.isArray(pl.body.items)) {
      return done('/api/v1/plugins', pluginsToSnapshot(pl.body.items, health));
    }
    if (capsOk) return done('/api/v1/capabilities', { ...caps.body, mode: 'live:' + (caps.body.mode || health?.mode || '?'), nodes: [] });
    return { source: 'fixture', reason: `AoI 读取失败 ${pl.status}${pl.status === 401 ? '（会话无效或过期）' : ''}`, health, base: c.base };
  } catch (e) { return { source: 'fixture', reason: 'AoI 读取出错：' + (e.name === 'AbortError' ? '超时' : e.message), health, base: c.base }; }
}
