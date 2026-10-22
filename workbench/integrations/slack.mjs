// Slack app endpoints for the Workbench.
//   POST /slack/events        Events API (url_verification, app_mention, message.im)
//   POST /slack/commands      /xc slash command
//   POST /slack/interactive   buttons (xc_approve / xc_view) + message shortcut xc_file_task
//   GET  /slack/install       starts OAuth (signed state)
//   GET  /slack/oauth/callback
// Every POST is verified with X-Slack-Signature (HMAC-SHA256 over v0:ts:rawBody,
// SLACK_SIGNING_SECRET, 5-minute window) before anything else. Slack needs a 200
// within 3 s, so we ack first and do the work asynchronously.
import crypto from 'node:crypto';
import { createCardFromEvent, loadCardFor, registerNotifier } from './event-to-card.mjs';

const WINDOW_SEC = 300;

export function verifySlackSignature(secret, { timestamp, signature, rawBody }, nowSec = Math.floor(Date.now() / 1000)) {
  if (!secret) return { ok: false, code: 'not_configured' };
  const ts = Number(timestamp);
  if (!Number.isInteger(ts)) return { ok: false, code: 'missing_timestamp' };
  if (Math.abs(nowSec - ts) > WINDOW_SEC) return { ok: false, code: 'stale' };
  if (typeof signature !== 'string' || !signature.startsWith('v0=')) return { ok: false, code: 'missing_signature' };
  const expected = 'v0=' + crypto.createHmac('sha256', secret).update(`v0:${ts}:${rawBody}`).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(signature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, code: 'bad_signature' };
  return { ok: true };
}

function readRaw(req, limit = 1_000_000) {
  return new Promise((ok, no) => {
    const chunks = []; let n = 0;
    req.on('data', (d) => { n += d.length; if (n > limit) { no(new Error('too_large')); req.destroy(); } else chunks.push(d); });
    req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')));
    req.on('error', no);
  });
}

const send = (res, code, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};

const STATUS = { draft: '草稿', approved: '已批准', running: '执行中', done: '已完成', failed: '失败' };

export function cardBlocks(card, note = '') {
  return [
    { type: 'section', text: { type: 'mrkdwn', text: `${note ? note + '\n' : ''}*${card.title}*\n状态：${STATUS[card.status] || card.status}  ·  \`${card.id}\`` } },
    { type: 'actions', elements: [
      ...(card.status === 'draft' ? [{ type: 'button', style: 'primary', text: { type: 'plain_text', text: '批准' }, action_id: 'xc_approve', value: card.id }] : []),
      { type: 'button', text: { type: 'plain_text', text: '查看进度' }, action_id: 'xc_view', value: card.id },
    ] },
  ];
}

export function createSlackHandler({ store, env = process.env, fetchImpl = globalThis.fetch, defer = (fn) => setImmediate(() => fn().catch((e) => console.log('slack async failed', e?.message || e))) } = {}) {
  const secret = env.SLACK_SIGNING_SECRET || '';
  const base = (env.PUBLIC_BASE_URL || 'https://xconnect-workbench-preview.onrender.com').replace(/\/+$/, '');
  const installId = (team) => `slack_install_${String(team).replace(/[^A-Za-z0-9]/g, '')}`;
  const sysSession = { key: '', user: { id: 'system', email: '' }, ns: 'system' };

  async function botToken(team) {
    if (team && store?.supaConfigured?.()) {
      try {
        const row = await store.loadRow(sysSession, installId(team));
        const sealed = row?.sources?.[0]?.data?.sealed;
        const inst = sealed && store.unseal(sealed);
        if (inst?.token) return inst.token;
      } catch {}
    }
    return env.SLACK_BOT_TOKEN || '';
  }

  async function slackApi(method, token, body) {
    const r = await fetchImpl(`https://slack.com/api/${method}`, {
      method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8', authorization: `Bearer ${token}` }, body: JSON.stringify(body),
    });
    return r.json();
  }
  const respond = (url, body) => (url && /^https:\/\/hooks\.slack\.com\//.test(url)
    ? fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    : Promise.resolve());

  async function postCard(team, channel, thread_ts, card, note) {
    const token = await botToken(team);
    if (!token || !channel) return;
    await slackApi('chat.postMessage', token, { channel, thread_ts, text: `${note} ${card.title}`, blocks: cardBlocks(card, note) });
  }

  // Completion callback: post the result back into the original thread.
  registerNotifier('slack', async ({ card, reply }) => {
    const token = await botToken(reply.team);
    if (!token) return;
    const text = card.status === 'done' ? `✅ 卡片完成：*${card.title}*\n${String(card.result || '').slice(0, 2500)}` : `⚠️ 卡片失败：*${card.title}*\n${String(card.error || '').slice(0, 500)}`;
    await slackApi('chat.postMessage', token, { channel: reply.channel, thread_ts: reply.thread_ts, text });
  });

  const fileCard = (ev) => createCardFromEvent(store, { provider: 'slack', ...ev }, env);

  async function onEvents(body) {
    const e = body.event || {};
    if (e.bot_id || e.subtype) return;
    if (e.type !== 'app_mention' && !(e.type === 'message' && e.channel_type === 'im')) return;
    const text = String(e.text || '').replace(/<@[A-Z0-9]+>/g, '').trim();
    if (!text) return;
    const thread_ts = e.thread_ts || e.ts;
    const r = await fileCard({ team: body.team_id, user: e.user, channel: e.channel, text, reply: { team: body.team_id, channel: e.channel, thread_ts } });
    if (!r.ok) {
      const token = await botToken(body.team_id);
      if (token) await slackApi('chat.postMessage', token, { channel: e.channel, thread_ts, text: '这个 Slack 账号还没绑定 Workbench 账户（SLACK_NS_MAP）。' });
      return;
    }
    await postCard(body.team_id, e.channel, thread_ts, r.card, '已建卡');
  }

  async function onCommand(p) {
    const r = await fileCard({ team: p.team_id, user: p.user_id, channel: p.channel_id, text: p.text, meta: { command: p.command }, reply: { team: p.team_id, channel: p.channel_id, thread_ts: null } });
    if (!r.ok) return respond(p.response_url, { response_type: 'ephemeral', text: '这个 Slack 账号还没绑定 Workbench 账户（SLACK_NS_MAP）。' });
    await respond(p.response_url, { response_type: 'in_channel', text: `已建卡：${r.card.title}`, blocks: cardBlocks(r.card, '已建卡') });
  }

  async function onInteractive(p) {
    const team = p.team?.id, user = p.user?.id;
    if (p.type === 'message_action' && p.callback_id === 'xc_file_task') {
      const msg = p.message || {};
      const r = await fileCard({ team, user, channel: p.channel?.id, text: msg.text, meta: { message_ts: msg.ts }, reply: { team, channel: p.channel?.id, thread_ts: msg.thread_ts || msg.ts } });
      if (!r.ok) return respond(p.response_url, { response_type: 'ephemeral', text: '这个 Slack 账号还没绑定 Workbench 账户（SLACK_NS_MAP）。' });
      return postCard(team, p.channel?.id, msg.thread_ts || msg.ts, r.card, '已转成 X-Connect 卡片');
    }
    if (p.type !== 'block_actions') return;
    const a = (p.actions || [])[0] || {};
    const hit = await loadCardFor(store, 'slack', { team, user }, a.value, env);
    if (!hit) return respond(p.response_url, { response_type: 'ephemeral', replace_original: false, text: '找不到这张卡片，或你的账号无权访问。' });
    const { session, card } = hit;
    if (a.action_id === 'xc_approve' && card.status === 'draft') {
      card.status = 'approved';
      card.approval = { by: `slack:${team}:${user}`, at: store.nowIso(), via: 'slack' };
      card.messages = [...(card.messages || []), { role: 'note', text: `Slack 用户 ${user} 批准`, at: store.nowIso() }];
      await store.saveCard(session, card);
    }
    return respond(p.response_url, { replace_original: true, text: card.title, blocks: cardBlocks(card, a.action_id === 'xc_approve' ? '已批准（执行在 Workbench 中排队）' : '当前进度') });
  }

  async function onOAuth(req, res, url) {
    const code = url.searchParams.get('code');
    const st = store.unseal(url.searchParams.get('state') || '');
    if (!code || !st || st.k !== 'slack-oauth' || Date.now() > st.exp) return send(res, 400, 'Slack 授权无效或已过期', 'text/plain; charset=utf-8');
    if (!env.SLACK_CLIENT_ID || !env.SLACK_CLIENT_SECRET) return send(res, 503, 'Slack OAuth 未配置', 'text/plain; charset=utf-8');
    const form = new URLSearchParams({ code, client_id: env.SLACK_CLIENT_ID, client_secret: env.SLACK_CLIENT_SECRET, redirect_uri: base + '/slack/oauth/callback' });
    const r = await (await fetchImpl('https://slack.com/api/oauth.v2.access', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form })).json();
    if (!r.ok || !r.access_token || !r.team?.id) return send(res, 502, 'Slack 授权失败：' + (r.error || 'unknown'), 'text/plain; charset=utf-8');
    await store.saveRow(sysSession, installId(r.team.id), {
      goal: `slack install ${r.team.name || r.team.id}`, progress: '', constraints: '', decisions: '', todos: [],
      sources: [{ kind: 'slack-install', data: { team: r.team.id, teamName: r.team.name || '', botUserId: r.bot_user_id || '', scope: r.scope || '', at: store.nowIso(), sealed: store.seal({ token: r.access_token }) } }],
    });
    return send(res, 200, `<p>已安装到 Slack 工作区 ${String(r.team.name || r.team.id).replace(/[<>&"]/g, '')}，可以关闭此页。</p>`, 'text/html; charset=utf-8');
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith('/slack/')) return false;
    if (req.method === 'GET' && url.pathname === '/slack/install') {
      if (!env.SLACK_CLIENT_ID) { send(res, 503, 'Slack OAuth 未配置', 'text/plain; charset=utf-8'); return true; }
      const state = store.seal({ k: 'slack-oauth', exp: Date.now() + 10 * 60_000, n: crypto.randomUUID() });
      const q = new URLSearchParams({ client_id: env.SLACK_CLIENT_ID, scope: 'chat:write,app_mentions:read,commands,im:history,im:write', redirect_uri: base + '/slack/oauth/callback', state });
      res.writeHead(302, { location: 'https://slack.com/oauth/v2/authorize?' + q }); res.end(); return true;
    }
    if (req.method === 'GET' && url.pathname === '/slack/oauth/callback') { await onOAuth(req, res, url); return true; }
    if (req.method !== 'POST' || !['/slack/events', '/slack/commands', '/slack/interactive'].includes(url.pathname)) { send(res, 404, { error: 'not_found' }); return true; }
    let raw;
    try { raw = await readRaw(req); } catch { send(res, 413, { error: 'too_large' }); return true; }
    const v = verifySlackSignature(secret, { timestamp: req.headers['x-slack-request-timestamp'], signature: req.headers['x-slack-signature'], rawBody: raw });
    if (!v.ok) { send(res, v.code === 'not_configured' ? 503 : 401, { error: v.code }); return true; }
    if (req.headers['x-slack-retry-num']) { send(res, 200, { ok: true }); return true; } // already handled the first delivery
    try {
      if (url.pathname === '/slack/events') {
        const body = JSON.parse(raw);
        if (body.type === 'url_verification') { send(res, 200, { challenge: body.challenge }); return true; }
        send(res, 200, { ok: true });
        if (body.type === 'event_callback') defer(() => onEvents(body));
        return true;
      }
      const params = Object.fromEntries(new URLSearchParams(raw));
      if (url.pathname === '/slack/commands') {
        if (!String(params.text || '').trim()) { send(res, 200, { response_type: 'ephemeral', text: '用法：/xc 一句成片 [idea]' }); return true; }
        send(res, 200, { response_type: 'ephemeral', text: '收到，正在建卡…' });
        defer(() => onCommand(params));
        return true;
      }
      const payload = JSON.parse(params.payload || '{}');
      send(res, 200, '');
      defer(() => onInteractive(payload));
      return true;
    } catch {
      send(res, 400, { error: 'bad_request' }); return true;
    }
  }

  return { handle };
}
