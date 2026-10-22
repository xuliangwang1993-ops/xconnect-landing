import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { verifySlackSignature, createSlackHandler } from '../integrations/slack.mjs';
import { resolveUserId, notifyCardComplete } from '../integrations/event-to-card.mjs';

const SECRET = 'slack-signing-secret-test';
const sign = (body, ts = Math.floor(Date.now() / 1000)) => ({ 'x-slack-request-timestamp': String(ts), 'x-slack-signature': 'v0=' + crypto.createHmac('sha256', SECRET).update(`v0:${ts}:${body}`).digest('hex') });

test('signature: valid, tampered, stale, missing secret', () => {
  const now = 1_800_000_000, body = 'a=1';
  const h = sign(body, now);
  const args = { timestamp: h['x-slack-request-timestamp'], signature: h['x-slack-signature'], rawBody: body };
  assert.equal(verifySlackSignature(SECRET, args, now).ok, true);
  assert.equal(verifySlackSignature(SECRET, { ...args, rawBody: 'a=2' }, now).code, 'bad_signature');
  assert.equal(verifySlackSignature(SECRET, args, now + 301).code, 'stale');
  assert.equal(verifySlackSignature('', args, now).code, 'not_configured');
});

test('account mapping', () => {
  const env = { SLACK_NS_MAP: JSON.stringify({ 'T1:U1': 'usr_a', 'T1:*': 'usr_team' }), SLACK_DEFAULT_USER_ID: 'usr_def' };
  assert.equal(resolveUserId('slack', { team: 'T1', user: 'U1' }, env), 'usr_a');
  assert.equal(resolveUserId('slack', { team: 'T1', user: 'U9' }, env), 'usr_team');
  assert.equal(resolveUserId('slack', { team: 'T2', user: 'U9' }, env), 'usr_def');
  assert.equal(resolveUserId('slack', { team: 'T2' }, {}), null);
});

function fakeStore() {
  const rows = new Map();
  return {
    rows,
    nsFor: (u) => 'ns_' + u,
    nowIso: () => new Date().toISOString(),
    supaConfigured: () => false,
    seal: (o) => 'sealed:' + JSON.stringify(o), unseal: (s) => { try { return JSON.parse(String(s).slice(7)); } catch { return null; } },
    saveCard: async (s, c) => { rows.set(`wb_${s.ns}_${c.id}`, c); return c; },
    loadRow: async (s, id) => rows.get(`wb_${s.ns}_${id}`) || null,
    cardFromRow: (r) => r,
    saveRow: async () => ({}),
  };
}

test('endpoints: challenge, command ack <3s + async card, bad signature, completion notify', async () => {
  const store = fakeStore();
  const calls = [];
  const fetchImpl = async (url, o) => { calls.push({ url, body: JSON.parse(o.body) }); return { json: async () => ({ ok: true }) }; };
  const pending = [];
  const env = { SLACK_SIGNING_SECRET: SECRET, SLACK_DEFAULT_USER_ID: 'usr_martin', SLACK_BOT_TOKEN: 'xoxb-test' };
  const h = createSlackHandler({ store, env, fetchImpl, defer: (fn) => pending.push(fn()) });
  const srv = http.createServer(async (req, res) => { if (!(await h.handle(req, res))) { res.writeHead(404); res.end(); } });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const post = (path, body, type, headers = sign(body)) => fetch(base + path, { method: 'POST', headers: { 'content-type': type, ...headers }, body });
  try {
    const ch = JSON.stringify({ type: 'url_verification', challenge: 'abc123' });
    const r1 = await post('/slack/events', ch, 'application/json');
    assert.equal(r1.status, 200); assert.equal((await r1.json()).challenge, 'abc123');
    assert.equal((await post('/slack/events', ch, 'application/json', { ...sign(ch), 'x-slack-signature': 'v0=00' })).status, 401);

    const form = new URLSearchParams({ command: '/xc', text: '一句成片 做一个咖啡店宣传片', team_id: 'T1', user_id: 'U1', channel_id: 'C1', response_url: 'https://hooks.slack.com/commands/T1/x' }).toString();
    const t0 = Date.now();
    const r2 = await post('/slack/commands', form, 'application/x-www-form-urlencoded');
    assert.equal(r2.status, 200); assert.ok(Date.now() - t0 < 3000);
    assert.match((await r2.json()).text, /收到/);
    await Promise.all(pending);
    const [key, card] = [...store.rows.entries()][0];
    assert.match(key, /^wb_ns_usr_martin_c_/);
    assert.equal(card.source.provider, 'slack');
    assert.equal(calls.at(-1).url, 'https://hooks.slack.com/commands/T1/x');
    assert.equal(calls.at(-1).body.blocks[1].elements[0].action_id, 'xc_approve');

    const empty = new URLSearchParams({ command: '/xc', text: '' }).toString();
    assert.match((await (await post('/slack/commands', empty, 'application/x-www-form-urlencoded')).json()).text, /用法/);

    card.status = 'done'; card.result = 'ok';
    assert.equal(await notifyCardComplete('ns_usr_martin', card), true);
    assert.equal(calls.at(-1).url, 'https://slack.com/api/chat.postMessage');
    assert.equal(calls.at(-1).body.channel, 'C1');
  } finally { srv.close(); }
});
