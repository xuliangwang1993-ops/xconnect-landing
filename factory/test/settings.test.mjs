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

test('/settings page served with Setting nav, no key leaks', async () => {
  const r = await call(createFactory(), '/settings');
  assert.equal(r.code, 200);
  assert.match(r.body, /账户与余额/);
  assert.match(r.body, /小助手设定/);
  assert.doesNotMatch(r.body, /service_role|SUPABASE_SERVICE/);
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
