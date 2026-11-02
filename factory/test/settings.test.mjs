import test from 'node:test';
import assert from 'node:assert/strict';
import { createFactory } from '../factory.mjs';
import { patchAssistant } from '../settings/settings-api.mjs';

function call(h, url, method = 'GET') {
  return new Promise((resolve) => {
    const res = { code: 0, body: '', writeHead(c) { this.code = c; }, end(b) { this.body = b ? String(b) : ''; resolve(this); } };
    const req = { url, method, on(ev, fn) { if (ev === 'end') setTimeout(fn, 0); } };
    h.handle(req, res);
  });
}

test('/settings routes to /account or /assistants; account + assistants pages split', async () => {
  const st = await call(createFactory(), '/settings');
  assert.equal(st.code, 200);
  assert.match(st.body, /\/assistants/); assert.match(st.body, /\/account/);
  const acc = await call(createFactory(), '/account');
  assert.equal(acc.code, 200);
  assert.match(acc.body, /余额变动记录/); assert.match(acc.body, /充值/); assert.match(acc.body, /剩余额度/);
  assert.doesNotMatch(acc.body, /小助手设定<\/h2>/);
  const as = await call(createFactory(), '/assistants');
  assert.equal(as.code, 200);
  assert.match(as.body, /小助手设定/); assert.match(as.body, /制作你的小助手/);
  assert.doesNotMatch(as.body + acc.body, /service_role|SUPABASE_SERVICE/);
});

test('/account/api/summary: signed out vs subrouter session, ledger from snapshots', async () => {
  const off = JSON.parse((await call(createFactory(), '/account/api/summary')).body);
  assert.equal(off.signedIn, false);
  const fetchImpl = async (u) => ({ ok: true, json: async () => (/subscription/.test(u) ? { hard_limit_usd: 100 } : /usage\/token/.test(u) ? { data: { name: 't', unlimited_quota: true, model_limits_enabled: true, model_limits: { a: true } } } : { total_usage: 2500 }) });
  let saved = { sources: [{ kind: 'ledger', data: { snaps: [{ at: '2026-11-01T00:00:00Z', limit: 90, used: 20, balance: 70 }] } }] };
  const store = { supaConfigured: () => true, loadRow: async () => saved, saveRow: async (_s, _id, f) => { saved = f; } };
  const f = createFactory({ fetchImpl, store, getSession: () => ({ provider: 'subrouter', tier: '3X', key: 'k', user: { id: 'u1', email: 'e' }, ns: 'n' }) });
  const d = JSON.parse((await call(f, '/account/api/summary')).body);
  assert.equal(d.balance, 75); assert.equal(d.limit, 100); assert.equal(d.totalUsage, 25);
  assert.deepEqual(d.ledger.map((e) => [e.kind, e.amount]).sort(), [['deduction', -5], ['topup', 10]]);
  assert.equal(d.snapshots, 2); assert.deepEqual(d.token.models, ['a']);
});

test('assistants: clean error when supabase missing; PUT requires login', async () => {
  const f = createFactory({ env: {} });
  assert.equal(JSON.parse((await call(f, '/settings/api/assistants')).body).error, 'supabase_not_configured');
  assert.equal((await call(f, '/settings/api/assistants/brain', 'PUT')).code, 401);
});

test('patchAssistant only sends whitelisted fields', async () => {
  let sent;
  const fetchImpl = async (u, o) => { sent = JSON.parse(o.body); return { ok: true, json: async () => [{ id: 'brain' }] }; };
  const r = await patchAssistant({ env: { SUPABASE_URL: 'http://x', SUPABASE_SERVICE_ROLE_KEY: 'k' }, fetchImpl, id: 'brain', body: { intro: 'hi', system_prompt: 'evil', voice: 'a' }, speakerIds: new Set(['a']) });
  assert.equal(r.ok, true);
  assert.deepEqual(sent, { intro: 'hi', voice: 'a' });
});
