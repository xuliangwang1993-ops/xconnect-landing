// COO-19 业务进树: create/update work_nodes. Factory stages map onto the live
// DB status CHECK (active|blocked|waiting|done|abandoned); the factory stage is
// kept as a "[stage:x]" prefix in summary so evidence vs in_progress survives.
// Writes need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (RLS only allows SELECT);
// without them an in-memory store is used (demo mode).
export const STAGES = ['idea', 'in_progress', 'evidence', 'verified'];
export const KINDS = ['project', 'branch', 'ticket'];
const TO_DB = { idea: 'waiting', in_progress: 'active', evidence: 'active', verified: 'done' };
const FROM_DB = { waiting: 'idea', active: 'in_progress', blocked: 'in_progress', done: 'verified', abandoned: 'idea' };

export function stageOf(row) {
  const m = /^\[stage:(\w+)\]/.exec(row.summary || '');
  return m && STAGES.includes(m[1]) ? m[1] : FROM_DB[row.status] || 'idea';
}
export function validate(n, { partial = false } = {}) {
  const errs = [];
  if (!partial || n.kind !== undefined) if (!KINDS.includes(n.kind)) errs.push('kind must be ' + KINDS.join('|'));
  if (!partial || n.title !== undefined) if (typeof n.title !== 'string' || !n.title.trim()) errs.push('title required');
  if (n.stage !== undefined && !STAGES.includes(n.stage)) errs.push('stage must be ' + STAGES.join('|'));
  return errs;
}
export function toRow(n) {
  const r = {};
  for (const k of ['id', 'kind', 'title', 'parent_id']) if (n[k] !== undefined) r[k] = n[k];
  if (n.stage) { r.status = TO_DB[n.stage]; r.summary = `[stage:${n.stage}] ` + String(n.note || '').trim(); }
  r.updated_at = new Date().toISOString(); r.last_activity_at = r.updated_at;
  return r;
}
const view = (r) => ({ id: r.id, kind: r.kind, title: r.title, parent_id: r.parent_id ?? null, status: r.status, stage: stageOf(r), updated_at: r.updated_at });

export function createTreeStore({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const url = env.SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
  const mem = new Map();
  const live = !!(url && key);
  const h = { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json', prefer: 'return=representation,resolution=merge-duplicates' };
  async function rest(path, init) {
    const r = await fetchImpl(`${url}/rest/v1/${path}`, { ...init, headers: h });
    const t = await r.text(); if (!r.ok) throw new Error(`supabase ${r.status}: ${t.slice(0, 200)}`);
    return t ? JSON.parse(t) : [];
  }
  return {
    mode: live ? 'supabase' : 'memory',
    async list() {
      if (!live) return [...mem.values()].map(view);
      return (await rest('work_nodes?select=id,kind,title,parent_id,status,summary,updated_at&order=updated_at.desc&limit=200')).map(view);
    },
    async upsert(n) {
      const isNew = !n.id;
      const errs = validate(n, { partial: !isNew }); if (errs.length) { const e = new Error(errs.join('; ')); e.status = 400; throw e; }
      const row = toRow({ ...n, id: n.id || `fx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, stage: n.stage || (isNew ? 'idea' : undefined) });
      if (!live) { const merged = { ...(mem.get(row.id) || {}), ...row }; mem.set(row.id, merged); return view(merged); }
      const out = isNew ? await rest('work_nodes', { method: 'POST', body: JSON.stringify(row) })
        : await rest(`work_nodes?id=eq.${encodeURIComponent(row.id)}`, { method: 'PATCH', body: JSON.stringify(row) });
      if (!out[0]) { const e = new Error('not found'); e.status = 404; throw e; }
      return view(out[0]);
    },
  };
}

function readJson(req) {
  return new Promise((ok, bad) => { let b = ''; req.on('data', (c) => { b += c; if (b.length > 1e5) bad(new Error('too big')); });
    req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { bad(e); } }); req.on('error', bad); });
}
// Returns true if handled. GET/POST /tree/api/nodes, PATCH /tree/api/nodes/:id
export function handleTree(req, res, store) {
  const p = new URL(req.url, 'http://localhost').pathname;
  if (!p.startsWith('/tree/api/nodes')) return false;
  const id = decodeURIComponent(p.slice('/tree/api/nodes/'.length) || '');
  const json = (code, d) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-cache' }); res.end(JSON.stringify(d)); };
  let job;
  if (req.method === 'GET' && !id) job = store.list().then((nodes) => [200, { mode: store.mode, nodes }]);
  else if (req.method === 'POST' && !id) job = readJson(req).then((b) => store.upsert({ ...b, id: undefined })).then((n) => [201, n]);
  else if (req.method === 'PATCH' && id) job = readJson(req).then((b) => store.upsert({ ...b, id })).then((n) => [200, n]);
  else return false;
  job.then(([c, d]) => json(c, d), (e) => json(e.status || 500, { error: String(e.message || e) }));
  return true;
}
