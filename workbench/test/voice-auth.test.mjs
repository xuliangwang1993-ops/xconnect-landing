import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { verifyVoiceToken, createJtiCache, createVoiceAuthorizer, extractToken } from '../voice-auth.mjs';

const SECRET = 's'.repeat(40);
// Issued by aoi-cloud src/voice-token.js signVoiceToken (interop fixture).
const GATEWAY_FIXTURE =
  'xcv1.eyJ2IjoxLCJhdWQiOiJ4Yy12b2ljZSIsInN1YiI6ImFjY18xIiwic2lkIjoic2Vzc18xIiwiZW5nIjoiZG91YmFvIiwiaWF0IjoxNzkyMDAwMDAwLCJleHAiOjE3OTIwMDAwNjAsIm1zbCI6MTgwMCwianRpIjoiZml4dHVyZS1qdGktMSJ9.2WklP1v5s7U4lHMblN07FyVwMxugpHsJi45qjwmBQB0';

function sign(claims, secret = SECRET) {
  const p = Buffer.from(JSON.stringify({ v: 1, aud: 'xc-voice', ...claims })).toString('base64url');
  return `xcv1.${p}.${createHmac('sha256', secret).update(`xcv1.${p}`).digest('base64url')}`;
}

test('verifies gateway-issued token; rejects expired / tampered / wrong secret', () => {
  const ok = verifyVoiceToken(SECRET, GATEWAY_FIXTURE, 1792000010);
  assert.equal(ok.ok, true);
  assert.equal(ok.claims.sid, 'sess_1');
  assert.equal(ok.claims.msl, 1800);
  assert.equal(verifyVoiceToken(SECRET, GATEWAY_FIXTURE, 1792000100).code, 'expired');
  assert.equal(verifyVoiceToken('t'.repeat(40), GATEWAY_FIXTURE, 1792000010).code, 'bad_signature');
  assert.equal(verifyVoiceToken(SECRET, GATEWAY_FIXTURE.slice(0, -3) + 'AAA', 1792000010).code, 'bad_signature');
  assert.equal(verifyVoiceToken(SECRET, 'nope', 1).code, 'malformed');
  assert.equal(verifyVoiceToken(SECRET, null, 1).code, 'missing');
});

test('jti single-use; token extraction from query / bearer / subprotocol; staged mode', () => {
  const c = createJtiCache();
  assert.equal(c.use('a', 100, 50), true);
  assert.equal(c.use('a', 100, 50), false);
  const u = new URL('http://x/voice?token=abc');
  assert.equal(extractToken({ headers: {} }, u), 'abc');
  assert.equal(extractToken({ headers: { authorization: 'Bearer t1' } }, new URL('http://x/voice')), 't1');
  assert.equal(extractToken({ headers: { 'sec-websocket-protocol': 'xc-voice, t2' } }, new URL('http://x/voice')), 't2');
  const now = Math.floor(Date.now() / 1000);
  const auth = createVoiceAuthorizer({ VOICE_TOKEN_SECRET: SECRET });
  const tok = sign({ sub: 'a', sid: 's', eng: 'doubao', iat: now, exp: now + 60, msl: 30, jti: randomUUID() });
  const req = { headers: {} };
  assert.equal(auth(req, new URL(`http://x/voice?token=${tok}`), now).ok, true);
  assert.equal(auth(req, new URL(`http://x/voice?token=${tok}`), now).code, 'replayed');
  assert.equal(auth(req, new URL('http://x/voice'), now).status, 401);
  assert.equal(createVoiceAuthorizer({})(req, new URL('http://x/voice'), now).status, 503); // no secret → fail closed
  assert.equal(createVoiceAuthorizer({ VOICE_AUTH_REQUIRED: '0' })(req, new URL('http://x/voice'), now).ok, true);
});

test('server: /voice upgrade without token → 401 (upstream never opened); valid token passes auth', async () => {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const env = { ...process.env, PORT: String(port), VOICE_TOKEN_SECRET: SECRET, DOUBAO_API_KEY: '' };
  const srv = spawn(process.execPath, [new URL('../server-voice.mjs', import.meta.url).pathname], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise((res, rej) => {
      srv.stdout.on('data', (d) => String(d).includes('listening') && res());
      srv.on('exit', (c) => rej(new Error('server exited ' + c)));
    });
    const status = await new Promise((res) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/voice`);
      ws.on('unexpected-response', (_req, r) => res(r.statusCode));
      ws.on('open', () => res('open'));
      ws.on('error', () => {});
    });
    assert.equal(status, 401);
    const now = Math.floor(Date.now() / 1000);
    const tok = sign({ sub: 'a', sid: 's', eng: 'doubao', iat: now, exp: now + 60, msl: 30, jti: randomUUID() });
    const first = await new Promise((res) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/voice?token=${tok}`);
      ws.on('message', (m) => res(JSON.parse(String(m))));
      ws.on('unexpected-response', (_req, r) => res({ status: r.statusCode }));
      ws.on('error', () => {});
    });
    // Passed auth; this test env has no DOUBAO key, so the server reports that and closes.
    assert.equal(first.type, 'error');
    assert.match(first.message, /DOUBAO_API_KEY/);
    // Replay of the same token is rejected.
    const replay = await new Promise((res) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/voice?token=${tok}`);
      ws.on('unexpected-response', (_req, r) => res(r.statusCode));
      ws.on('open', () => res('open'));
      ws.on('error', () => {});
    });
    assert.equal(replay, 401);
  } finally {
    srv.kill();
  }
});
