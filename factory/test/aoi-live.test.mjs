import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAoiSnapshot, guardVerified, DEFAULT_AOI_API_BASE, filterSnapshot, isRecipe, _resetAoiLoginCache } from '../aoi/aoi-live.mjs';
import { createFactory } from '../factory.mjs';

const mk = (routes) => async (url, opts) => {
  const path = new URL(url).pathname; const h = routes[path];
  if (!h) return { status: 404, json: async () => ({}) };
  return h(url, opts);
};
const ok = (body) => async () => ({ status: 200, json: async () => body });

test('defaults to staging URL; no session -> fixture with reason', async () => {
  let seen;
  const d = await fetchAoiSnapshot({ env: {}, fetchImpl: mk({ '/api/v1/health': async (u) => { seen = u; return { status: 200, json: async () => ({ status: 'ok', mode: 'fixture' }) }; } }) });
  assert.equal(seen, DEFAULT_AOI_API_BASE + '/api/v1/health');
  assert.equal(d.source, 'fixture'); assert.match(d.reason, /AOI_SESSION_COOKIE/); assert.match(d.reason, /AOI_BOOTSTRAP_TOKEN/);
});

test('unreachable / timeout -> fixture', async () => {
  const d = await fetchAoiSnapshot({ env: { AOI_API_BASE: 'http://x' }, fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
  assert.equal(d.source, 'fixture'); assert.match(d.reason, /不可达/);
  const t = await fetchAoiSnapshot({ env: { AOI_API_TIMEOUT_MS: '20' }, fetchImpl: (u, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' })))) });
  assert.match(t.reason, /超时/);
});

test('session -> plugins, cookie sent, verified only with evidence', async () => {
  let cookie;
  const d = await fetchAoiSnapshot({ env: { AOI_SESSION_COOKIE: 's3' }, fetchImpl: mk({
    '/api/v1/health': ok({ status: 'ok', mode: 'fixture' }),
    '/api/v1/plugins': async (u, o) => { cookie = o.headers.cookie; return { status: 200, json: async () => ({ items: [
      { id: 'p1', display_name: 'A', verification_state: 'verified' },
      { id: 'p2', display_name: 'B', verification_state: 'verified', evidence_refs: ['ev1'] },
      { id: 'p3', plugin_key: 'c' }] }) }; } }) });
  assert.equal(cookie, 'aoi_session=s3');
  assert.equal(d.source, 'aoi'); assert.equal(d.endpoint, '/api/v1/plugins');
  const st = Object.fromEntries(d.snapshot.nodes.map((n) => [n.id, n.state]));
  assert.equal(st['aoi:p1'], 'unverified'); assert.equal(st['aoi:p2'], 'verified'); assert.equal(st['aoi:p3'], 'potential');
});

test('capability-tree preferred and guarded; 401 -> fixture', async () => {
  const d = await fetchAoiSnapshot({ env: { AOI_SESSION_COOKIE: 's' }, fetchImpl: mk({
    '/api/v1/health': ok({ mode: 'fixture' }),
    '/api/v1/capability-tree': ok({ mode: 'fixture', nodes: [{ id: 'n', state: 'verified', evidence_refs: [] }], edges: [] }) }) });
  assert.equal(d.endpoint, '/api/v1/capability-tree'); assert.equal(d.snapshot.nodes[0].state, 'unverified');
  assert.deepEqual(guardVerified([{ state: 'verified', evidence_refs: ['e'] }])[0].state, 'verified');
  const u = await fetchAoiSnapshot({ env: { AOI_SESSION_COOKIE: 'bad' }, fetchImpl: mk({
    '/api/v1/health': ok({}), '/api/v1/plugins': async () => ({ status: 401, json: async () => ({}) }) }) });
  assert.equal(u.source, 'fixture'); assert.match(u.reason, /401/);
});

test('factory serves /aoi/api/snapshot via proxy', async () => {
  const f = createFactory({ env: {}, fetchImpl: async () => { throw new Error('down'); } });
  const res = { writeHead(c) { this.code = c; }, end(b) { this.body = String(b); } };
  const r = f.handle({ url: '/aoi/api/snapshot', method: 'GET' }, res);
  assert.ok(r); await r;
  assert.equal(res.code, 200); assert.equal(JSON.parse(res.body).source, 'fixture');
});

test('bootstrap login: caches cookie, re-logs-in on 401, never sends token on reads', async () => {
  _resetAoiLoginCache();
  let logins = 0, calls = 0; const cookies = [];
  const fetchImpl = mk({
    '/api/v1/health': ok({ mode: 'fixture' }),
    '/api/v1/session': async (u, o) => { logins++; assert.equal(o.method, 'POST'); assert.equal(JSON.parse(o.body).bootstrap_token, 'bt');
      return { status: 201, headers: { get: () => 'aoi_session=c' + logins + '; HttpOnly' }, json: async () => ({}) }; },
    '/api/v1/plugins': async (u, o) => { calls++; cookies.push(o.headers.cookie);
      if (calls === 2) return { status: 401, json: async () => ({}) };
      return { status: 200, json: async () => ({ items: [{ id: 'p1', display_name: 'A' }] }) }; } });
  const env = { AOI_BOOTSTRAP_TOKEN: 'bt' };
  const a = await fetchAoiSnapshot({ env, fetchImpl });
  assert.equal(a.source, 'aoi'); assert.equal(a.auth, 'bootstrap-login'); assert.equal(logins, 1);
  const b = await fetchAoiSnapshot({ env, fetchImpl });
  assert.equal(b.source, 'aoi'); assert.equal(logins, 2);
  assert.deepEqual(cookies, ['aoi_session=c1', 'aoi_session=c1', 'aoi_session=c2']);
  assert.ok(!JSON.stringify(b).includes('bt"'));
});

test('recipes are excluded; allowlist keeps only matching kinds; dangling edges dropped', async () => {
  const snap = { nodes: [
    { id: 'g', kind: 'goal' }, { id: 'f1', kind: 'function', layer: 'function' },
    { id: 'r1', kind: 'recipe' }, { id: 'p:x', kind: 'function', label: '报税配方' },
    { id: 'd1', kind: 'data', layer: 'data' }],
    edges: [{ from_id: 'g', to_id: 'f1' }, { from_id: 'g', to_id: 'r1' }, { from_id: 'g', to_id: 'd1' }] };
  const a = filterSnapshot(snap);
  assert.deepEqual(a.snapshot.nodes.map((n) => n.id), ['g', 'f1', 'd1']); assert.equal(a.excluded, 2);
  assert.equal(a.snapshot.edges.length, 2);
  const b = filterSnapshot(snap, ['function']);
  assert.deepEqual(b.snapshot.nodes.map((n) => n.id), ['g', 'f1']);
  assert.ok(isRecipe({ plugin_key: 'recipe-tax' })); assert.ok(!isRecipe({ kind: 'function', label: 'OCR' }));
  _resetAoiLoginCache();
  const d = await fetchAoiSnapshot({ env: { AOI_SESSION_COOKIE: 's' }, fetchImpl: mk({
    '/api/v1/health': ok({}), '/api/v1/plugins': ok({ items: [{ id: 'a', plugin_key: 'ocr' }, { id: 'b', plugin_key: 'recipe.visa' }] }) }) });
  assert.deepEqual(d.snapshot.nodes.filter((n) => n.kind !== 'goal').map((n) => n.id), ['aoi:a']);
});
