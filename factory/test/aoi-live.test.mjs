import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAoiSnapshot, guardVerified, DEFAULT_AOI_API_BASE } from '../aoi/aoi-live.mjs';
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
  assert.equal(d.source, 'fixture'); assert.match(d.reason, /AOI_SESSION_COOKIE/);
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
