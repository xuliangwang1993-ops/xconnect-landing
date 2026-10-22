// Offline contract tests for the workbench HTTP surface.
//
// A local mock gateway stands in for api.x-connect.ai.  Supabase is deliberately
// NOT configured, which proves that storage failures surface as errors instead
// of a fake "saved" response.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { verifyVoiceToken } from '../voice-auth.mjs';

const SECRET = 's'.repeat(48);
const VOICE_SECRET = 'v'.repeat(48);
const DEMO_KEY = 'sk-xc-' + 'a'.repeat(48);
let mock;
let mockPort;
let child;
let port;
let cookie = '';

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

function json(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

before(async () => {
  mock = http.createServer((req, res) => {
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ')) return json(res, 401, { error: 'missing_credential' });
    if (req.url === '/v1/me/balance') {
      return json(res, 200, {
        user: { id: 'usr_test', email: 'tester@x-connect.ai', plan: 'free', status: 'active' },
        data: { total_usage: 0, balance: 12345 },
      });
    }
    if (req.url === '/v1/models') {
      return json(res, 200, {
        object: 'list',
        data: [
          { id: 'claude-haiku-4-5', route: 'test', point_to_aud: 0.0001, points_per_token: 1 },
          { id: 'gpt-6-astra', route: 'test', point_to_aud: 0.0001, points_per_token: 1 },
          { id: 'gemini-3.8-flash', route: 'test', point_to_aud: 0.0001, points_per_token: 1 },
          // Real gateways return such rows; they cannot be addressed and must
          // be filtered out instead of becoming a dead picker option.
          { id: '', route: 'test' },
        ],
      });
    }
    if (req.url === '/v1/chat/completions' && req.method === 'POST') {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write('data: {"choices":[{"delta":{"content":"OK"}}]}\n\n');
      res.write('data: [DONE]\n\n');
      return res.end();
    }
    return json(res, 404, { error: 'not_found' });
  });
  mockPort = await listen(mock);

  port = 20000 + Math.floor(Math.random() * 20000);
  child = spawn(process.execPath, [new URL('../server-voice.mjs', import.meta.url).pathname], {
    env: {
      ...process.env,
      PORT: String(port),
      SESSION_SECRET: SECRET,
      VOICE_TOKEN_SECRET: VOICE_SECRET,
      DEMO_GATEWAY_KEY: DEMO_KEY,
      GATEWAY_BASE_URL: `http://127.0.0.1:${mockPort}`,
      SUPA_URL: '',
      SUPA_ANON_KEY: '',
      SUPA_EMAIL: '',
      SUPA_PASSWORD: '',
      AUTO_EXECUTE: '0',
      BUILD_ID: 'test-build',
      DOUBAO_API_KEY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server start timeout')), 8000);
    child.stdout.on('data', (d) => {
      if (String(d).includes('listening')) { clearTimeout(timer); resolve(); }
    });
    child.stderr.on('data', (d) => process.stderr.write(d));
    child.on('exit', (c) => { clearTimeout(timer); reject(new Error('server exited ' + c)); });
  });
});

after(async () => {
  try { child?.kill('SIGTERM'); } catch {}
  try { mock?.close(); } catch {}
});

const base = () => `http://127.0.0.1:${port}`;

async function call(path, { method = 'GET', body, headers = {} } = {}) {
  const r = await fetch(base() + path, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const set = r.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const text = await r.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data, headers: r.headers, text };
}

test('static shell, manifest and service worker are served', async () => {
  const home = await call('/workbench') // 工厂：/ 是搭台首页，工作台在 /workbench;
  assert.equal(home.status, 200);
  assert.match(home.data, /X-connect Workbench/);
  assert.match(home.data, /manifest\.webmanifest/);
  const mf = await call('/manifest.webmanifest');
  assert.equal(mf.status, 200);
  assert.equal(mf.data.name, 'X-connect Workbench');
  assert.equal(mf.data.scope, '/');
  const sw = await call('/sw.js');
  assert.equal(sw.status, 200);
  assert.match(sw.data, /const BUILD = 'test-build'/);
  assert.match(sw.data, /startsWith\('\/api\/'\)/);
});

test('health and session guard', async () => {
  const h = await call('/api/health');
  assert.equal(h.status, 200);
  assert.equal(h.data.build, 'test-build');
  assert.equal(h.data.storage, 'none');
  const me = await call('/api/me');
  assert.equal(me.status, 401);
});

test('demo login sets an HttpOnly session cookie and never returns the key', async () => {
  const login = await call('/api/session', { method: 'POST', body: { demo: true } });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.email, 'tester@x-connect.ai');
  assert.equal(login.data.balance, 12345);
  assert.equal(Object.prototype.hasOwnProperty.call(login.data, 'key'), false);
  const set = login.headers.get('set-cookie') || '';
  assert.match(set, /HttpOnly/);
  assert.match(set, /SameSite=Lax/);
  assert.match(set, /xcw_session=/);
});

test('bootstrap returns models and a clear storage error (no fake cloud data)', async () => {
  const b = await call('/api/bootstrap');
  assert.equal(b.status, 200);
  // The mock offers three entries, one with an empty id. An empty id cannot be
  // addressed by a chat call, so it must not reach the picker.
  assert.equal(b.data.models.length, 3);
  assert.equal(b.data.models.every((m) => m.id), true);
  assert.deepEqual(b.data.models.map((m) => m.id), ['claude-haiku-4-5', 'gpt-6-astra', 'gemini-3.8-flash']);
  // defaultModel is only a hint: it is empty unless DEFAULT_MODEL (gateway) or
  // a tier default (SubRouter) is configured. The client then picks the first
  // usable entry rather than sending model:'' upstream.
  assert.equal(typeof b.data.defaultModel, 'string');
  assert.deepEqual(b.data.cards, []);
  assert.equal(b.data.storageError, 'cloud_storage_unavailable');
  assert.equal(b.data.storage, 'none');
});

test('chat streams from the mock gateway', async () => {
  const r = await call('/api/chat', {
    method: 'POST',
    body: { model: 'claude-haiku-4-5', messages: [{ role: 'user', content: 'hi' }], conversationId: 'cv_test', temporary: true },
  });
  assert.equal(r.status, 200);
  assert.match(r.text, /"content":"OK"/);
  assert.match(r.text, /\[DONE\]/);
});

test('voice token is scoped and verifies with the existing voice-auth module', async () => {
  const r = await call('/api/voice-token', { method: 'POST', body: {} });
  assert.equal(r.status, 200);
  assert.equal(r.data.wsPath, '/voice');
  const now = Math.floor(Date.now() / 1000);
  const v = verifyVoiceToken(VOICE_SECRET, r.data.token, now);
  assert.equal(v.ok, true);
  assert.equal(v.claims.aud, 'xc-voice');
  assert.equal(v.claims.msl, 1800);
});

test('ingest token is minted, but storage failure is reported, not faked', async () => {
  const t = await call('/api/ingest-token', { method: 'POST', body: {} });
  assert.equal(t.status, 200);
  assert.match(t.data.token, /^v1\./);
  const inbox = await call('/api/inbox', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + t.data.token },
    body: { text: '字幕测试', source: { kind: 'subtitle', batch: 'b1', index: 0 } },
  });
  assert.equal(inbox.status, 502);
  assert.equal(inbox.data.error, 'storage_unavailable');
  const cards = await call('/api/cards');
  assert.equal(cards.status, 502);
});

test('origin check rejects a cross-site login', async () => {
  const r = await call('/api/session', {
    method: 'POST',
    headers: { origin: 'https://evil.example' },
    body: { demo: true },
  });
  assert.equal(r.status, 403);
  assert.equal(r.data.error, 'bad_origin');
});

test('logout clears the cookie and the API is private again', async () => {
  const out = await call('/api/logout', { method: 'POST', body: {} });
  assert.equal(out.status, 200);
  const set = out.headers.get('set-cookie') || '';
  assert.match(set, /Max-Age=0/);
  cookie = '';
  const me = await call('/api/me');
  assert.equal(me.status, 401);
});

// Keep randomUUID imported for parity with future fixtures.
void randomUUID;
