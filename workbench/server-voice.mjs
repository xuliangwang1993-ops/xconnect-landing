import http from 'node:http';
import { greetingText } from './greet-tts.mjs';
import { promoAppendix } from './promo.mjs';
import { randomUUID, createPublicKey, verify as verifySignature } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import WebSocket, { WebSocketServer } from 'ws';
import { createVoiceAuthorizer } from './voice-auth.mjs';
import { createWorkbench, wbStore, wbGetSession, WB_SPEAKERS, wbGuestMiddleware, langLine } from './workbench.mjs';
import { createSlackHandler } from './integrations/slack.mjs';
import { createFactory } from '../factory/factory.mjs';
import { createTreeStore } from '../factory/tree/tree.mjs';
import { mountBrain } from '../factory/brain/index.mjs';

const PORT = process.env.PORT || 8789;
const UPSTREAM = process.env.DOUBAO_WS_URL || 'wss://openspeech.bytedance.com/api/v3/realtime/dialogue';
const RESOURCE = process.env.DOUBAO_RESOURCE_ID || 'volc.speech.dialog';
const BRIDGE_PATH = process.env.BOT_BRIDGE_PATH || 'voice-bridge-9c1e7a42-20261008';
import { PERSONA_VOICES, isPersonaVoice, resolveVoice, personaVoice } from './persona-voices.mjs';
const BRIDGE_ROOT = '/bridge/' + BRIDGE_PATH;
const tasks = [];
const sessions = new Set();

const SPEAKER_IDS = new Set(Object.values(PERSONA_VOICES));

// 五个角色各自的音色。语音只认这张表 + 环境变量，不接受客户端任意指定。
const PERSONAS = {
  voice:  { name: '小豆', role: '语音助手', voice: PERSONA_VOICES.voice },
  scribe: { name: '小记', role: '速记助手', voice: PERSONA_VOICES.scribe },
  brain:  { name: '小谋', role: '主脑助手', voice: PERSONA_VOICES.brain },
  deep:   { name: '小深', role: '深度助手', voice: PERSONA_VOICES.deep },
  admin:  { name: '小办', role: '行政助手', voice: PERSONA_VOICES.admin },
};
function withVoice(p, v) { return p && isPersonaVoice(v) ? { ...p, voice: v } : (p || (isPersonaVoice(v) ? { name: '', voice: v } : null)); }
function personaFor(id) {
  const p = PERSONAS[String(id || '')];
  return p && SPEAKER_IDS.has(p.voice) ? p : null;
}

const u32 = (n) => Buffer.from([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const header = (t, f, s = 1, c = 1) => Buffer.from([17, (t << 4) | f, (s << 4) | c, 0]);
const gzip = (x) => gzipSync(Buffer.from(x));

function control(event, sid, body) {
  const p = gzip(typeof body === 'string' ? body : JSON.stringify(body));
  if (event === 1 || event === 2) return Buffer.concat([header(1, 4), u32(event), u32(p.length), p]);
  const id = Buffer.from(sid || '');
  return Buffer.concat([header(1, 4), u32(event), u32(id.length), id, u32(p.length), p]);
}

function audioPacket(sid, pcm) {
  const id = Buffer.from(sid);
  const p = gzip(pcm);
  return Buffer.concat([header(2, 4, 0, 1), u32(200), u32(id.length), id, u32(p.length), p]);
}

function parsePacket(input) {
  const b = Buffer.from(input);
  if (b.length < 4) return null;
  const type = b[1] >> 4;
  const flags = b[1] & 15;
  const serial = b[2] >> 4;
  const comp = b[2] & 15;
  let p = (b[0] & 15) * 4;
  let event = null;
  if (type === 15) return { type, code: b.readUInt32BE(p), payload: b.subarray(p + 8) };
  if (flags & 2) p += 4;
  if (flags & 4) { event = b.readUInt32BE(p); p += 4; }
  let sid = '';
  if (p + 4 <= b.length) {
    const n = b.readInt32BE(p);
    p += 4;
    if (n > 0 && p + n <= b.length) { sid = b.subarray(p, p + n).toString(); p += n; }
  }
  if (p + 4 > b.length) return { type, serial, event, sid, payload: Buffer.alloc(0) };
  const n = b.readUInt32BE(p);
  p += 4;
  let payload = b.subarray(p, p + n);
  if (comp === 1) try { payload = gunzipSync(payload); } catch {}
  return { type, serial, event, sid, payload };
}

function sessionConfig(speaker, persona, history, lang = '') {
  // 每个角色固定音色；客户端传什么都不作数。
  const chosen = (persona && SPEAKER_IDS.has(persona.voice) && persona.voice)
    || (SPEAKER_IDS.has(speaker) && speaker)
    || (isPersonaVoice(process.env.DOUBAO_SPEAKER) && process.env.DOUBAO_SPEAKER)
    || PERSONA_VOICES.brain;
  const baseRole = process.env.DOUBAO_SYSTEM_ROLE || '你是一个简洁、友好的中文语音助手。用户明确要求查数据、跑分析、检查项目或查看状态时派给后台电脑。改代码、写文件、删除、付款、发消息、生产部署等操作必须先确认。';
  // 之前的对话摘要接在人格后面：这是"同一个助理记得你"的实现方式。
  const ll = langLine(lang);
  const role0 = history ? baseRole + '\n\n【你和这位用户之前的对话，供参考，不要复述】\n' + history : baseRole;
  let promo = ''; try { promo = promoAppendix((persona && (persona.id || Object.keys(PERSONAS).find((k) => PERSONAS[k] === persona))) || '', lang, { voice: true }); } catch {}
  const role = [role0, ll, promo].filter(Boolean).join('\n\n');
  return {
    user: { uid: randomUUID() },
    audio: { format: 'pcm', sample_rate: 16000, channels: 1, codec: 'raw' },
    dialog: {
      bot_name: (persona && persona.name) || process.env.DOUBAO_BOT_NAME || '助手',
      system_role: role,
      speaking_style: '自然简洁',
      extra: {},
    },
    tts: {
      speaker: chosen,
      audio_config: { channel: 1, format: 'pcm_s16le', sample_rate: 24000 },
    },
    asr: { extra: { end_smooth_window_ms: Number(process.env.DOUBAO_END_SMOOTH_WINDOW_MS || 1500) } },
  };
}

function summary(t) {
  return {
    id: t.id,
    description: t.description,
    status: t.status,
    result: t.result || null,
    error: t.error || null,
    createdAt: t.createdAt,
    finishedAt: t.finishedAt || null,
    source: t.source || null,
    cardId: t.cardId || null,
    executor: t.executor || null,
    lane: t.lane || 'default',
  };
}

function sendClient(c, x) {
  if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(x));
}

function broadcast(type, t) {
  for (const s of sessions) {
    // Workbench tasks are private to the account that approved them.  Legacy
    // voice tasks have no userId and keep the old broadcast behaviour.
    if (t.userId && s.client.voiceClaims?.sub && s.client.voiceClaims.sub !== t.userId) continue;
    sendClient(s.client, { type, task: summary(t) });
  }
}

function looksLikeTask(t) {
  return /查|查询|看看|检查|跑|运行|分析|统计|对比|盯|监控|列出|查看|获取|汇总|生成报告|grok|GroK|git|TrueCite|新用户|支付/.test(t);
}
function isRisky(t) {
  return /付款|支付给|删除|清空|发消息|发送邮件|改代码|修改代码|写文件|写入|安装|提交代码|推送代码|部署生产|上线生产|推送到生产|修改线上数据/.test(t);
}
function isConfirm(t) {
  return /确认执行|我确认|确认|同意执行/.test(t);
}

function enqueue(description) {
  const t = { id: 'voice-' + randomUUID(), description, status: 'pending', createdAt: new Date().toISOString(), source: 'voice' };
  tasks.push(t);
  if (tasks.length > 200) tasks.splice(0, tasks.length - 200);
  return t;
}

function parseAsr(p, event) {
  try {
    const x = JSON.parse(p.toString());
    if (Array.isArray(x.results) && x.results[0]) {
      return { text: x.results[0].text || '', final: x.results[0].is_interim === false };
    }
    return { text: x.text || '', final: event === 150 };
  } catch {
    return { text: p.toString(), final: event === 150 };
  }
}

function acknowledge(s, text, send) { s.pendingAck = text; }

function route(s, text, send) {
  const clean = (text || '').trim();
  if (!clean) return;
  if (s.pendingRisky && isConfirm(clean)) {
    const t = enqueue(s.pendingRisky);
    s.pendingRisky = null;
    broadcast('task_queued', t);
    sendClient(s.client, { type: 'task_queued', task: summary(t) });
    acknowledge(s, '确认收到，我已派给后台处理。', send);
    return;
  }
  if (isRisky(clean)) {
    s.pendingRisky = clean;
    sendClient(s.client, { type: 'confirmation_required', message: '这项操作有风险，请说确认执行。' });
    acknowledge(s, '这项操作有风险，请说确认执行。', send);
    return;
  }
  if (looksLikeTask(clean)) {
    const t = enqueue(clean);
    broadcast('task_queued', t);
    sendClient(s.client, { type: 'task_queued', task: summary(t) });
    acknowledge(s, '收到，我把任务派给后台电脑处理，完成后把结果发回。', send);
  }
}

function auth(req, res) {
  const enc = process.env.BOT_BRIDGE_PUBLIC_KEY_B64;
  const ts = req.headers['x-bridge-timestamp'] || '';
  const sig = req.headers['x-bridge-signature'] || '';
  if (!enc || !ts || !sig || Math.abs(Date.now() - Number(ts)) > 120000) {
    res.writeHead(401); res.end(JSON.stringify({ error: 'unauthorized' })); return false;
  }
  let key;
  try {
    key = createPublicKey({ key: Buffer.from(enc, 'base64'), format: 'der', type: 'spki' });
  } catch {
    res.writeHead(503); res.end(JSON.stringify({ error: 'bridge_key_invalid' })); return false;
  }
  if (!verifySignature(null, Buffer.from(ts + '\n' + req.method + ' ' + req.url), key, Buffer.from(sig, 'base64'))) {
    res.writeHead(401); res.end(JSON.stringify({ error: 'unauthorized' })); return false;
  }
  return true;
}

function read(req) {
  return new Promise((ok, no) => {
    let b = '';
    req.on('data', (d) => { b += d; if (b.length > 65536) no(new Error('body too large')); });
    req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch (e) { no(e); } });
    req.on('error', no);
  });
}

function json(res, code, x) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(x));
}

const wb = createWorkbench({ tasks, broadcast });
const slack = createSlackHandler({ store: wbStore });
const factory = createFactory({ getSession: wbGetSession, speakers: WB_SPEAKERS, store: wbStore });
// 总脑：挂得上就挂；挂不上只记一行，绝不影响工作台本身。
let brain = null;
try {
  brain = mountBrain({ getSession: wbGetSession, tree: createTreeStore() });
  console.log('brain mounted:', JSON.stringify({ configured: brain.brain.configured, model: brain.brain.model, store: brain.store.mode, tree: brain.brain && createTreeStore().mode }));
} catch (e) {
  console.log('brain disabled:', String(e && e.message || e).slice(0, 120));
}
const CORS_ALLOWED_ORIGINS = new Set([
  'https://xconnect-web.onrender.com',
  'https://app.x-connect.ai',
  'https://x-connect.ai',
  'https://www.x-connect.ai',
  'https://workbench.x-connect.ai',
  'https://factory.x-connect.ai',
  'https://xconnect-factory-paid.onrender.com',
  'https://xconnect-app-web.pages.dev',
]);

function applyCors(req, res) {
  const origin = String(req.headers?.origin || '');
  if (!origin) return false;
  const ok = CORS_ALLOWED_ORIGINS.has(origin) || /^https:\/\/[a-z0-9-]+\.xconnect-app-web\.pages\.dev$/.test(origin);
  if (!ok) return false;
  res.setHeader('access-control-allow-origin', origin);
  res.setHeader('access-control-allow-credentials', 'true');
  res.setHeader('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type, authorization, x-requested-with');
  res.setHeader('access-control-max-age', '86400');
  res.setHeader('vary', 'origin');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }
  return false;
}

const api = http.createServer(async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.url && req.url.startsWith('/workbench/api/')) {
    req.url = req.url.slice('/workbench'.length);
  }
  if (wbGuestMiddleware(req, res)) return; // guest session + guest rate limits
  if (req.url.startsWith('/slack/') && await slack.handle(req, res)) return;
  if (brain && (await brain.handle(req, res))) return; // 总脑 /api/brain/*
  if (factory.handle(req, res)) return; // 搭台首页 / AoI 看板
  if (await wb.handle(req, res)) return;

  if (req.method === 'GET' && req.url === '/healthz') {
    return json(res, 200, { ok: true, voice: true, bridge: true, asrFinal: true, workbench: true, build: wb.BUILD });
  }

  const reqPath = String(req.url || '').split('?')[0];
  if (reqPath === BRIDGE_ROOT + '/claim' && req.method === 'POST') {
    if (!auth(req, res)) return;
    // Lanes keep workers apart: a claim without ?lane= (RunPod pipeline) only
    // sees default-lane tasks; the PC OpenCode worker claims ?lane=code.
    const want = new URL(req.url, 'http://x').searchParams.get('lane') || 'default';
    const t = tasks.find((x) => x.status === 'pending' && (x.lane || 'default') === want);
    if (!t) return json(res, 200, { task: null });
    t.status = 'running';
    t.startedAt = new Date().toISOString();
    broadcast('task_updated', t);
    return json(res, 200, { task: summary(t) });
  }

  if (req.url === BRIDGE_ROOT + '/complete' && req.method === 'POST') {
    if (!auth(req, res)) return;
    try {
      const d = await read(req);
      const t = tasks.find((x) => x.id === d.id);
      if (!t) return json(res, 404, { error: 'task_not_found' });
      t.status = d.ok === false ? 'failed' : 'done';
      t.result = String(d.result || '').slice(0, 12000);
      t.error = d.ok === false ? (d.error || 'execution_failed') : null;
      t.finishedAt = new Date().toISOString();
      broadcast('task_updated', t);
      wb.onTaskComplete(t).catch(() => {});
      return json(res, 200, { task: summary(t) });
    } catch (e) {
      return json(res, 400, { error: e.message });
    }
  }

  if (req.url === BRIDGE_ROOT + '/status' && req.method === 'GET') {
    if (!auth(req, res)) return;
    return json(res, 200, { tasks: tasks.slice(-50).map(summary) });
  }

  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
});

// Voice auth: every /voice upgrade must carry a short-lived gateway-signed
// token; checked BEFORE the Doubao upstream is opened.  msl caps the session.
const authorizeVoice = createVoiceAuthorizer(process.env);
const wss = new WebSocketServer({
  noServer: true,
  handleProtocols: (p) => (p.has('xc-voice') ? 'xc-voice' : false),
});

api.on('upgrade', (req, sock, head) => {
  let u;
  try { u = new URL(req.url, 'http://localhost'); } catch { return sock.destroy(); }
  if (u.pathname !== '/voice') return sock.destroy();
  const a = authorizeVoice(req, u);
  if (!a.ok) {
    const st = a.status || 401;
    const body = JSON.stringify({ error: 'unauthorized', code: a.code });
    console.log('voice auth denied', a.code);
    sock.write(
      'HTTP/1.1 ' + st + ' ' + (st === 503 ? 'Service Unavailable' : st === 403 ? 'Forbidden' : 'Unauthorized') +
      '\r\nContent-Type: application/json\r\nContent-Length: ' + Buffer.byteLength(body) +
      '\r\nConnection: close\r\n\r\n' + body,
    );
    return sock.destroy();
  }
  if (a.claims) console.log('voice auth ok sub=' + a.claims.sub + ' sid=' + a.claims.sid + ' msl=' + a.claims.msl);
  wss.handleUpgrade(req, sock, head, (c) => {
    c.voiceClaims = a.claims;
    c.voiceSpeaker = '';
    try { c.voiceAssistant = new URL(req.url, 'http://x').searchParams.get('assistant') || ''; } catch { c.voiceAssistant = ''; }
    // 先用真相表里该角色的音色兜底：Supabase 查询是异步的，豆包会话可能先开，
    // 以前这里是 '' → 落到 DOUBAO_SPEAKER/四毛，换人后第一句还是旧声音。
    c.voiceResolved = personaVoice(c.voiceAssistant);
    try { const q = new URL(req.url, 'http://x').searchParams; c.voiceGreet = String(q.get('greet') || '').slice(0, 80); c.voiceLang = String(q.get('lang') || '').slice(0, 12); } catch { c.voiceGreet = ''; c.voiceLang = ''; }
    resolveVoice(c.voiceAssistant).then((v) => { c.voiceResolved = v; }).catch(() => {});
    wss.emit('connection', c);
  });
});

wss.on('connection', (client) => {
  const s = { client, sid: null, pendingRisky: null, pendingAck: null };
  sessions.add(s);
  if (client.voiceClaims?.msl) {
    const cap = setTimeout(() => {
      sendClient(client, { type: 'error', code: 'allowance_exhausted', message: '语音时长已用完' });
      client.close(4001, 'allowance_exhausted');
    }, client.voiceClaims.msl * 1000);
    client.on('close', () => clearTimeout(cap));
  }
  const key = process.env.DOUBAO_API_KEY;
  if (!key) {
    sendClient(client, { type: 'error', message: 'Render 未配置 DOUBAO_API_KEY' });
    return client.close();
  }
  const up = new WebSocket(UPSTREAM, {
    headers: { 'X-Api-Key': key, 'X-Api-Resource-Id': RESOURCE, 'X-Api-Connect-Id': randomUUID() },
  });
  const sid = randomUUID();
  s.sid = sid;
  let started = false;
  let pendingContext = null; // 客户端在音频之前发来的历史摘要
  let startSession = null;   // 拿到历史再开会话，避免错过上下文
  const send = (x) => { if (up.readyState === WebSocket.OPEN) up.send(x); };
  up.on('open', () => send(control(1, '', '{}')));
  up.on('message', (data) => {
    const p = parsePacket(data);
    if (!p) return;
    if (p.event === 150 && client.voiceGreet && !client.voiceGreeted) {
      // Proactive spoken greeting at session start / assistant switch / language switch (persona voice, KB script).
      client.voiceGreeted = true;
      let content = ''; try { content = greetingText('greeting', client.voiceAssistant || 'brain', client.voiceLang); } catch {}
      if (content) send(control(300, sid, { content }));
    }
    if (p.type === 15) {
      sendClient(client, { type: 'error', code: p.code, message: p.payload.toString() });
      return;
    }
    if (!started && p.event === 50) {
      started = true;
      const open = () => {
        send(control(100, sid, sessionConfig(client.voiceSpeaker, withVoice(personaFor(client.voiceAssistant), client.voiceResolved), pendingContext, client.voiceLang)));
      };
      // 给客户端 400ms 把历史摘要送来；等不到就直接开，不能因为前端慢就卡住会话
      if (pendingContext !== null) open();
      else {
        startSession = open;
        setTimeout(() => { if (startSession) { const f = startSession; startSession = null; f(); } }, 400);
      }
      return;
    }
    if (p.payload?.length && p.serial === 0) {
      client.send(p.payload);
      return;
    }
    if ([150, 451].includes(p.event)) {
      const x = parseAsr(p.payload, p.event);
      if (x.text) {
        const u = s.utt || 0;
        sendClient(client, { type: 'asr', text: x.text, final: !!x.final, id: sid + ':' + u });
        if (x.final) s.utt = u + 1;
        if (x.final) route(s, x.text, send);
      }
    }
    if (p.event === 459 && s.pendingAck) {
      send(control(515, sid, {}));
      send(control(500, sid, { start: true, content: s.pendingAck, end: true }));
      s.pendingAck = null;
    }
    if (p.event === 550) {
      try {
        const x = JSON.parse(p.payload.toString());
        const t = x.content || x.text || x.reply;
        if (t) sendClient(client, { type: 'text', text: t });
      } catch {}
    }
  });
  up.on('error', (e) => sendClient(client, { type: 'error', message: e.message }));
  up.on('close', () => client.close());
  client.on('message', (data) => {
    if (typeof data === 'string') {
      // 文本帧 = 控制消息（目前只有 context：本次会话要带上的历史摘要）
      try {
        const m = JSON.parse(data);
        if (m && m.type === 'context') {
          pendingContext = String(m.history || '').slice(0, 4000) || null;
          if (startSession) { const f = startSession; startSession = null; f(); }
        }
      } catch {}
      return;
    }
    send(audioPacket(sid, Buffer.from(data)));
  });
  client.on('close', () => {
    sessions.delete(s);
    send(control(102, sid, '{}'));
    send(control(2, '', '{}'));
    up.close();
  });
});

api.listen(PORT, '0.0.0.0', () => {
  console.log('x-connect workbench listening on ' + PORT + ' build=' + wb.BUILD);
});
