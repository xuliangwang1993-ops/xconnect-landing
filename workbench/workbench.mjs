// X-connect PWA workbench — server-side API.
//
// Reuses the gateway (accounts, models, chat, billing) and the existing
// Supabase project (work_checkpoints as the per-card store).  The browser never
// receives the gateway key: it lives inside an AES-GCM sealed, HttpOnly cookie.
//
// This module is deliberately dependency-free (node:crypto + fetch) so the
// Render service keeps its "one dependency" shape.

import { notifyCardComplete } from './integrations/event-to-card.mjs';
import { createLinearService } from './linear/api.mjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const BUILD = process.env.BUILD_ID || (process.env.RENDER_GIT_COMMIT || '').slice(0, 10) || 'dev';
const STARTED_AT = new Date().toISOString();
const linearMirror = createLinearService(process.env);
linearMirror.start();

const GATEWAY = (process.env.GATEWAY_BASE_URL || 'https://api.x-connect.ai').replace(/\/+$/, '');
const SUBROUTER = (process.env.SUBROUTER_BASE || 'https://subrouter.ai').replace(/\/+$/, '');
const SUB_ACCOUNT_ID = process.env.SUBROUTER_ACCOUNT_ID || '';
const SUB_ACCESS = process.env.SUBROUTER_TIER_ACCESS || '';
let SUB_KEYS = {};
try { SUB_KEYS = JSON.parse(process.env.SUBROUTER_TIER_KEYS || '{}'); } catch { SUB_KEYS = {}; }
const TIERS = Object.keys(SUB_KEYS);
// Chosen for first-token latency measured against the live gateways, not for
// the biggest model on the tier: a slow default is what makes the whole app
// feel broken.
const TIER_ASSIST = {
  '3X': 'gpt-6.1-sol',
  '2X': 'kimi-k3',
  '1X': 'deepseek-v4-pro',
  '0.5X': 'deepseek-v4-flash',
};
const TIER_DEFAULT = {
  '3X': 'gpt-5.6',
  '2X': 'kimi-k3',
  '1X': 'deepseek-v4-pro',
  '0.5X': 'deepseek-v4-flash',
};
const SUPA_URL = (process.env.SUPA_URL || '').replace(/\/+$/, '');
const SUPA_ANON = process.env.SUPA_ANON_KEY || '';
const SUPA_EMAIL = process.env.SUPA_EMAIL || '';
const SUPA_PASSWORD = process.env.SUPA_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const VOICE_TOKEN_SECRET = process.env.VOICE_TOKEN_SECRET || '';
const ASSIST_MODEL = process.env.ASSIST_MODEL || 'claude-haiku-4-5';
const AUTO_EXECUTE = process.env.AUTO_EXECUTE === '1';
const SESSION_COOKIE = 'xcw_session';
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
const USER_AGENT = 'X-Connect-Workbench/1.0 (+https://x-connect.ai)';

const SPEAKERS = [
  { id: 'zh_female_vv_jupiter_bigtts', label: 'VV · 女声', note: '默认，清晰' },
  { id: 'zh_male_xiaohe_jupiter_bigtts', label: '小何 · 男声', note: '温和' },
  { id: 'zh_male_yunzhou_jupiter_bigtts', label: '云舟 · 男声', note: '沉稳' },
  { id: 'zh_male_xiaotian_jupiter_bigtts', label: '小天 · 男声', note: '轻快' },
];
const SPEAKER_IDS = new Set(SPEAKERS.map((s) => s.id));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const nowSec = () => Math.floor(Date.now() / 1000);
const nowIso = () => new Date().toISOString();

function log(...args) {
  console.log('[workbench]', ...args);
}

function clampText(v, max) {
  const s = String(v == null ? '' : v);
  return s.length > max ? s.slice(0, max) : s;
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k) continue;
    out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cookieHeader(name, value, { maxAge = 0, secure = false } = {}) {
  const bits = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (maxAge >= 0) bits.push(`Max-Age=${maxAge}`);
  if (secure) bits.push('Secure');
  return bits.join('; ');
}

function isSecure(req) {
  return req.headers['x-forwarded-proto'] === 'https' || Boolean(req.socket && req.socket.encrypted);
}

function seal(obj) {
  if (!SESSION_SECRET || SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET missing');
  const key = crypto.createHash('sha256').update(SESSION_SECRET).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${b64url(iv)}.${b64url(tag)}.${b64url(body)}`;
}

function unseal(token) {
  try {
    const [v, ivb, tagb, bodyb] = String(token).split('.');
    if (v !== 'v1' || !ivb || !tagb || !bodyb) return null;
    const key = crypto.createHash('sha256').update(SESSION_SECRET).digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivb, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagb, 'base64url'));
    const plain = Buffer.concat([decipher.update(Buffer.from(bodyb, 'base64url')), decipher.final()]);
    return JSON.parse(plain.toString('utf8'));
  } catch {
    return null;
  }
}

function getSession(req) {
  const raw = parseCookies(req)[SESSION_COOKIE];
  if (!raw) return null;
  const s = unseal(raw);
  if (!s || !s.exp || s.exp < Date.now()) return null;
  if (!s.key || !s.user || !s.ns) return null;
  return s;
}

function json(res, code, body, extra = {}) {
  const text = JSON.stringify(body);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...extra,
  });
  res.end(text);
  return true;
}

function fail(res, code, error, message, extra = {}) {
  return json(res, code, { error, message }, extra);
}

async function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on('data', (c) => {
      total += c.length;
      if (total > limit) {
        reject(Object.assign(new Error('body_too_large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req, limit) {
  const buf = await readBody(req, limit);
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    throw Object.assign(new Error('invalid_json'), { status: 400 });
  }
}

function sameOrigin(req) {
  // SameSite=Lax already blocks cross-site POST cookies, but check Origin when
  // present so a misconfigured client cannot turn this into a CSRF surface.
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const o = new URL(origin);
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    return o.host === host;
  } catch {
    return false;
  }
}

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}

function rateMap() {
  const m = new Map();
  return {
    hit(key, max, windowMs) {
      const t = Date.now();
      const arr = (m.get(key) || []).filter((x) => t - x < windowMs);
      if (arr.length >= max) return false;
      arr.push(t);
      m.set(key, arr);
      return true;
    },
    clear() { m.clear(); },
  };
}

// ---------------------------------------------------------------------------
// Gateway

async function gatewayAt(base, pathname, { method = 'GET', key, body, timeout = 60_000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(base.replace(/\/+$/, '') + pathname, {
      method,
      headers: {
        ...(key ? { authorization: `Bearer ${key}` } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
        accept: 'application/json',
        'user-agent': USER_AGENT,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 500) }; }
    return { status: r.status, ok: r.ok, data, headers: r.headers };
  } finally {
    clearTimeout(timer);
  }
}

function gateway(pathname, opts = {}) { return gatewayAt(GATEWAY, pathname, opts); }

async function validateKey(key) {
  const r = await gateway('/v1/me/balance', { key, timeout: 30_000 });
  if (!r.ok || !r.data?.user?.id) return { ok: false, status: r.status, data: r.data };
  return { ok: true, user: r.data.user, balance: r.data.data?.balance ?? r.data.user.balance ?? null };
}

async function listModelsFor(session) {
  const base = session.base || (GATEWAY + '/v1');
  const r = await gatewayAt(base, '/models', { key: session.key, timeout: 30_000 });
  if (!r.ok) throw Object.assign(new Error('models_failed'), { status: 502, upstream: r.status });
  const list = Array.isArray(r.data?.data) ? r.data.data : [];
  // Entries with an empty id cannot be addressed by a chat call. Showing them
  // produces a picker option that fails (501 model_not_routed) or routes to a
  // slow default merchant, so they are dropped for every provider.
  const usable = list.filter((m) => String(m.id || '').trim());
  return usable.map(modelInfo);
}

function tierForKey(key) {
  for (const [tier, k] of Object.entries(SUB_KEYS)) if (k && k === key) return tier;
  return null;
}

async function validateSubrouter(key) {
  const r = await gatewayAt(SUBROUTER, '/v1/models', { key, timeout: 30_000 });
  if (!r.ok) return { ok: false, status: r.status, data: r.data };
  return { ok: true, models: Array.isArray(r.data?.data) ? r.data.data : [] };
}

async function subrouterBalance(session) {
  const [sub, usage] = await Promise.all([
    gatewayAt(SUBROUTER, '/v1/dashboard/billing/subscription', { key: session.key, timeout: 20_000 }),
    gatewayAt(SUBROUTER, '/v1/dashboard/billing/usage', { key: session.key, timeout: 20_000 }),
  ]);
  if (!sub.ok || !usage.ok) return { error: 'balance_unavailable' };
  const hard = Number(sub.data?.hard_limit_usd ?? sub.data?.soft_limit_usd ?? 0);
  const used = Number(usage.data?.total_usage ?? 0) / 100;
  const balance = Math.max(0, hard - used);
  return {
    balance: Number(balance.toFixed(2)),
    totalUsage: Number(used.toFixed(2)),
    unit: 'usd',
    label: 'US$',
    hardLimit: hard,
    user: session.user,
  };
}

function modelInfo(m) {
  const id = String(m.id || '');
  const low = id.toLowerCase();
  let family = 'xconnect';
  let brand = 'X';
  let theme = 'default';
  if (low.startsWith('claude')) { family = 'claude'; brand = 'C'; theme = 'claude'; }
  else if (low.startsWith('gpt') || low.startsWith('codex')) { family = 'openai'; brand = 'G'; theme = 'openai'; }
  else if (low.startsWith('gemini')) { family = 'gemini'; brand = 'Gm'; theme = 'gemini'; }
  else if (low.startsWith('deepseek')) { family = 'deepseek'; brand = 'D'; theme = 'deepseek'; }
  else if (low.startsWith('glm')) { family = 'glm'; brand = 'GLM'; theme = 'glm'; }
  else if (low.startsWith('qwen')) { family = 'qwen'; brand = 'Q'; theme = 'qwen'; }
  else if (low.startsWith('kimi')) { family = 'kimi'; brand = 'K'; theme = 'kimi'; }
  else if (low.startsWith('mimo')) { family = 'mimo'; brand = 'M'; theme = 'mimo'; }
  else if (low.startsWith('grok')) { family = 'grok'; brand = 'X'; theme = 'grok'; }
  else if (low.startsWith('hy')) { family = 'hunyuan'; brand = 'H'; theme = 'hunyuan'; }
  const noDate = id.replace(/[-_.]?20\d{6}$/, '');
  const nums = noDate.match(/\d+(?:[.-]\d+)?/g) || [];
  const version = nums.length ? nums[nums.length - 1].replace('-', '.') : '';
  const short = version ? `${brand} ${version}` : brand;
  return {
    id,
    family,
    brand,
    theme,
    version,
    short,
    full: id,
    route: m.route || null,
    pointToAud: m.point_to_aud ?? null,
    pointsPerToken: m.points_per_token ?? null,
    raw: { id, object: m.object, owned_by: m.owned_by },
  };
}

// ---------------------------------------------------------------------------
// Supabase (service account, server-only).  One row per card in
// public.work_checkpoints.  RLS still applies to this account; the server
// namespaces every row by the gateway account so two customers cannot collide.

let supaToken = '';
let supaExp = 0;
let supaUserId = '';

async function supaLogin(force = false) {
  if (!force && supaToken && Date.now() < supaExp - 60_000) return supaToken;
  if (!SUPA_URL || !SUPA_ANON || !SUPA_EMAIL || !SUPA_PASSWORD) {
    throw Object.assign(new Error('storage_not_configured'), { status: 503 });
  }
  const r = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPA_ANON, 'content-type': 'application/json', 'user-agent': USER_AGENT },
    body: JSON.stringify({ email: SUPA_EMAIL, password: SUPA_PASSWORD }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) {
    throw Object.assign(new Error('storage_auth_failed'), { status: 503, upstream: r.status });
  }
  supaToken = d.access_token;
  supaExp = Date.now() + (Number(d.expires_in) || 3600) * 1000;
  supaUserId = d.user?.id || supaUserId;
  return supaToken;
}

async function supaRequest(method, pathname, body, prefer = 'return=representation') {
  const token = await supaLogin();
  const doFetch = async (tok) => fetch(`${SUPA_URL}/rest/v1/${pathname}`, {
    method,
    headers: {
      apikey: SUPA_ANON,
      authorization: `Bearer ${tok}`,
      'content-type': 'application/json',
      prefer,
      'user-agent': USER_AGENT,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let r = await doFetch(token);
  if (r.status === 401) {
    await supaLogin(true);
    r = await doFetch(supaToken);
  }
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 500) }; }
  if (!r.ok) {
    throw Object.assign(new Error('storage_failed'), { status: 502, upstream: r.status, detail: data });
  }
  return data;
}

function nsFor(userId) {
  return sha256(`xc-workbench-v1|${userId}`).slice(0, 16);
}

function rowId(session, id) {
  return `wb_${session.ns}_${id}`;
}

async function saveRow(session, id, fields, prefer = 'resolution=merge-duplicates,return=representation') {
  await supaLogin();
  const row = {
    user_id: supaUserId || undefined,
    project_id: rowId(session, id),
    source_platform: 'xc-workbench',
    ...fields,
  };
  if (!row.user_id) delete row.user_id;
  const out = await supaRequest('POST', 'work_checkpoints?on_conflict=user_id,project_id', row, prefer);
  return Array.isArray(out) ? out[0] : out;
}

async function loadRow(session, id) {
  const pid = encodeURIComponent(rowId(session, id));
  const out = await supaRequest('GET', `work_checkpoints?project_id=eq.${pid}&select=*&limit=1`);
  return Array.isArray(out) ? out[0] || null : null;
}

async function listRows(session, idPrefix, limit = 200) {
  const pattern = encodeURIComponent(rowId(session, idPrefix) + '*');
  const out = await supaRequest('GET', `work_checkpoints?project_id=like.${pattern}&select=*&order=updated_at.desc&limit=${limit}`);
  return Array.isArray(out) ? out : [];
}

async function deleteRow(session, id) {
  const pid = encodeURIComponent(rowId(session, id));
  await supaRequest('DELETE', `work_checkpoints?project_id=eq.${pid}`, undefined, 'return=minimal');
}

function rowData(row, kind) {
  const sources = Array.isArray(row?.sources) ? row.sources : [];
  const hit = sources.find((s) => s && s.kind === kind);
  return hit && hit.data && typeof hit.data === 'object' ? hit.data : null;
}

function cardFromRow(row) {
  const card = rowData(row, 'workbench-card') || {};
  if (!card.id) card.id = String(row.project_id || '').split('_').slice(-1)[0];
  card.version = row.version;
  card.createdAt = row.created_at;
  card.updatedAt = row.updated_at;
  return card;
}

async function saveCard(session, card) {
  card.updatedAt = nowIso();
  const messages = Array.isArray(card.messages) ? card.messages.slice(-50) : [];
  const fields = {
    goal: clampText(card.title || '未命名卡片', 2000),
    constraints: clampText(card.original || '', 4000),
    decisions: clampText(JSON.stringify({
      assistant: card.assistant || null,
      review: card.review || null,
      approval: card.approval || null,
    }), 8000),
    progress: clampText(card.working || '', 4000),
    todos: messages.map((m) => ({
      role: String(m.role || 'note').slice(0, 20),
      text: clampText(m.text, 500),
      at: m.at || null,
    })),
    sources: [{ kind: 'workbench-card', data: card }],
  };
  const saved = await saveRow(session, card.id, fields);
  card.version = saved?.version ?? card.version;
  card.updatedAt = saved?.updated_at ?? card.updatedAt;
  card.createdAt = saved?.created_at ?? card.createdAt;
  return card;
}

async function saveTask(session, task) {
  try {
    await saveRow(session, `__task__${task.id}`, {
      goal: clampText(task.description || 'task', 2000),
      progress: clampText(task.result || '', 4000),
      constraints: '',
      decisions: '',
      todos: [],
      sources: [{ kind: 'workbench-task', data: task }],
    });
  } catch {}
}

async function listTasks(session) {
  const rows = await listRows(session, '__task__', 100);
  return rows.map((r) => rowData(r, 'workbench-task')).filter(Boolean);
}

// ---------------------------------------------------------------------------
// LLM helpers (gateway chat).  The browser's key is used, so billing and model
// routing stay on the account the user logged in with.

const ASSIST_PREFERENCE = [
  'deepseek-v4-flash', 'qwen3.8-flash', 'gpt-6-luna', 'glm-5.3-flash',
  'gemini-3.8-flash', 'deepseek-v4-pro', 'gpt-6-sol', 'kimi-k3', 'gpt-5.6',
];
const assistCache = new Map();

async function assistModelFor(session) {
  const key = `${session.provider || 'gateway'}:${session.tier || '-'}:${sha256(session.key).slice(0, 12)}`;
  if (assistCache.has(key)) return assistCache.get(key);
  let picked = '';
  try {
    const ids = (await listModelsFor(session)).map((m) => m.id).filter(Boolean);
    // A tier only serves its own whitelist: asking for a model the key cannot
    // reach returns 403 and the card looks "stuck", so the tier's own pick wins
    // over the global default whenever it is actually available.
    const tierPick = session.provider === 'subrouter' ? TIER_ASSIST[session.tier] : '';
    if (tierPick && ids.includes(tierPick)) picked = tierPick;
    if (!picked && ASSIST_MODEL && ids.includes(ASSIST_MODEL)) picked = ASSIST_MODEL;
    if (!picked) {
      for (const p of ASSIST_PREFERENCE) {
        if (ids.includes(p)) { picked = p; break; }
      }
    }
    if (!picked) picked = ids[0] || '';
  } catch {
    picked = ASSIST_MODEL || '';
  }
  assistCache.set(key, picked);
  return picked;
}

async function llm(session, { system, messages, maxTokens = 900, temperature = 0.2, model = '' }) {
  const chosen = model || await assistModelFor(session);
  if (!chosen) {
    throw Object.assign(new Error('assist_model_unavailable'), { status: 502 });
  }
  const body = {
    model: chosen,
    messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages],
    max_tokens: maxTokens,
    temperature,
  };
  const base = session.base || (GATEWAY + '/v1');
  const r = await gatewayAt(base, '/chat/completions', { method: 'POST', key: session.key, body, timeout: 100_000 });
  if (!r.ok) throw Object.assign(new Error('llm_failed'), { status: 502, upstream: r.status });
  const content = r.data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw Object.assign(new Error('llm_empty'), { status: 502 });
  return { content, usage: r.data?.usage || null, model: chosen };
}

function parseJsonLoose(text) {
  const s = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(s); } catch {}
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(s.slice(start, end + 1)); } catch {}
  }
  return null;
}

async function organizeCard(session, card) {
  const system = [
    'You are the X-connect workbench librarian. Turn a raw note or pasted subtitle into a work card.',
    'Return STRICT JSON only, with keys: title, summary, cleaned, checklist (array of short strings), questions (array), external_assistant (boolean).',
    'Rules: never invent facts, prices, names, dates or approvals. Keep the author\'s meaning.',
    'If there is no speaker label, add a question asking who spoke. If the text looks like another assistant\'s output, set external_assistant=true.',
    'Do not approve or execute anything. A card is a draft until the human says so.',
    'Write in the same language as the source (Chinese source -> Chinese card).',
  ].join(' ');
  const input = JSON.stringify({
    title: card.title || '',
    source: card.source || {},
    text: clampText(card.working || card.original || '', 6000),
  });
  const out = await llm(session, {
    system,
    messages: [{ role: 'user', content: input }],
    maxTokens: 900,
    temperature: 0.15,
  });
  const j = parseJsonLoose(out.content) || {};
  card.assistant = {
    summary: clampText(j.summary || out.content, 1200),
    checklist: Array.isArray(j.checklist) ? j.checklist.slice(0, 12).map((x) => clampText(x, 160)) : [],
    questions: Array.isArray(j.questions) ? j.questions.slice(0, 8).map((x) => clampText(x, 200)) : [],
    externalAssistant: Boolean(j.external_assistant),
    model: out.model,
    at: nowIso(),
  };
  if ((!card.title || card.title === '未命名卡片') && j.title) card.title = clampText(j.title, 120);
  if (j.cleaned) card.working = clampText(j.cleaned, 4000);
  card.status = 'review';
  card.organizeError = null;
  card.messages = [...(card.messages || []), {
    role: 'assistant',
    text: '已整理为草稿。请核对后送审；整理不等于授权。',
    at: nowIso(),
  }].slice(-50);
  return saveCard(session, card);
}

async function reviewCard(session, card) {
  const system = [
    'You are an independent reviewer for X-connect work cards. You did not write the card.',
    'Return STRICT JSON only: { "verdict": "pass" | "needs_changes", "notes": string, "risks": string[] }.',
    'Check: unsupported claims, missing source/speaker, ambiguous target, external assistant text presented as user intent, and risky execution.',
    'A card made from subtitles without speaker labels can pass only if the note says so. Never approve on behalf of the user.',
    'Be terse and concrete. If something is missing, say exactly what to add.',
  ].join(' ');
  const input = JSON.stringify({
    title: card.title,
    original: clampText(card.original || '', 3000),
    working: clampText(card.working || '', 3000),
    assistant: card.assistant || null,
    messages: (card.messages || []).slice(-12).map((m) => ({ role: m.role, text: m.text })),
  });
  const out = await llm(session, {
    system,
    messages: [{ role: 'user', content: input }],
    maxTokens: 700,
    temperature: 0.1,
  });
  const j = parseJsonLoose(out.content) || {};
  const verdict = j.verdict === 'pass' ? 'pass' : 'needs_changes';
  card.review = {
    verdict,
    notes: clampText(j.notes || out.content, 2000),
    risks: Array.isArray(j.risks) ? j.risks.slice(0, 8).map((x) => clampText(x, 240)) : [],
    model: out.model,
    at: nowIso(),
    reviewer: 'independent-llm',
  };
  card.status = verdict === 'pass' ? 'reviewed' : 'needs_changes';
  card.messages = [...(card.messages || []), {
    role: 'reviewer',
    text: verdict === 'pass' ? '独立审核通过。批准执行仍需要你本人点击。' : '审核有修改意见，见审核页。',
    at: nowIso(),
  }].slice(-50);
  return saveCard(session, card);
}

// ---------------------------------------------------------------------------
// Task bridge.  `tasks` and `broadcast` are owned by server-voice.mjs so the
// existing /bridge/claim and /bridge/complete endpoints keep working.

function publicTask(t) {
  return {
    id: t.id,
    description: t.description,
    status: t.status,
    result: t.result || null,
    error: t.error || null,
    createdAt: t.createdAt,
    finishedAt: t.finishedAt || null,
    source: t.source || 'workbench',
    cardId: t.cardId || null,
    executor: t.executor || null,
  };
}

async function runBuiltinTask(task, session, ctx) {
  if (!task || task._running) return;
  task._running = true;
  task.status = 'running';
  task.executor = 'builtin-llm';
  saveTask(session, task);
  ctx.broadcast('task_updated', publicTask(task));
  try {
    const row = await loadRow(session, task.cardId);
    const card = row ? cardFromRow(row) : null;
    const system = [
      'You are the X-connect execution worker for an approved work card.',
      'Produce the deliverable the card asks for, in Markdown. Be concrete and useful.',
      'Do not claim you performed external side effects (payments, emails, deployments) that you did not perform.',
      'If the card lacks information needed to execute, say exactly what is missing instead of guessing.',
      'This is an approved card, but you still must not invent prices, identities or approvals.',
    ].join(' ');
    const input = JSON.stringify({
      title: card?.title || task.description,
      working: clampText(card?.working || task.description, 6000),
      source: card?.source || null,
      assistant: card?.assistant || null,
      review: card?.review || null,
    });
    const out = await llm(session, {
      system,
      messages: [{ role: 'user', content: input }],
      maxTokens: 1600,
      temperature: 0.25,
    });
    task.status = 'done';
    task.result = clampText(out.content, 12000);
    task.finishedAt = nowIso();
    if (card) {
      card.status = 'done';
      card.result = task.result;
      card.completedAt = task.finishedAt;
      card.executor = 'builtin-llm';
      card.messages = [...(card.messages || []), {
        role: 'executor',
        text: '执行完成，结果已回卡。',
        at: task.finishedAt,
      }].slice(-50);
      await saveCard(session, card);
    }
    saveTask(session, task);
    ctx.broadcast('task_updated', publicTask(task));
  } catch (err) {
    task.status = 'failed';
    task.error = err?.message || 'execution_failed';
    task.finishedAt = nowIso();
    try {
      const row = await loadRow(session, task.cardId);
      if (row) {
        const card = cardFromRow(row);
        card.status = 'failed';
        card.error = task.error;
        await saveCard(session, card);
      }
    } catch {}
    saveTask(session, task);
    ctx.broadcast('task_updated', publicTask(task));
  } finally {
    task._running = false;
  }
}

function queueTask(card, session, ctx) {
  const t = {
    id: 'wb-' + crypto.randomUUID(),
    description: clampText(card.working || card.title || '未命名任务', 2000),
    status: 'pending',
    createdAt: nowIso(),
    source: 'workbench',
    userId: session.user.id,
    userEmail: session.user.email,
    cardId: card.id,
    executor: AUTO_EXECUTE ? 'builtin-llm' : 'bridge',
  };
  ctx.tasks.push(t);
  if (ctx.tasks.length > 200) ctx.tasks.splice(0, ctx.tasks.length - 200);
  saveTask(session, t);
  ctx.broadcast('task_queued', publicTask(t));
  if (AUTO_EXECUTE) setTimeout(() => runBuiltinTask(t, session, ctx), 900);
  return t;
}

// ---------------------------------------------------------------------------
// Voice token (same format voice-auth.mjs verifies)

function signVoiceToken(session, msl = 1800) {
  if (!VOICE_TOKEN_SECRET) return null;
  const claims = {
    v: 1,
    aud: 'xc-voice',
    sub: session.user.id,
    sid: 'wb_' + crypto.randomUUID(),
    eng: 'doubao',
    iat: nowSec(),
    exp: nowSec() + 120,
    msl,
    jti: crypto.randomUUID(),
  };
  const payload = b64url(JSON.stringify(claims));
  const sig = crypto.createHmac('sha256', VOICE_TOKEN_SECRET).update(`xcv1.${payload}`).digest('base64url');
  return `xcv1.${payload}.${sig}`;
}

// ---------------------------------------------------------------------------
// Local fallback store (only used when Supabase is not configured; the UI shows
// a clear "local preview" banner instead of pretending it is cloud data).

const LOCAL_FILE = process.env.WORKBENCH_LOCAL_STORE || '';
function localRead() {
  if (!LOCAL_FILE) return {};
  try { return JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8')); } catch { return {}; }
}
function localWrite(data) {
  if (!LOCAL_FILE) return;
  try { fs.writeFileSync(LOCAL_FILE, JSON.stringify(data)); } catch {}
}

// ---------------------------------------------------------------------------
// Ingest tokens: scoped, encrypted, expiring.  The shortcut never sees the
// gateway key; it only gets a token that the /api/inbox endpoint accepts.

function mintIngestToken(session, days = 90) {
  return seal({
    v: 1,
    scope: 'inbox',
    user: { id: session.user.id, email: session.user.email },
    key: session.key,
    ns: session.ns,
    provider: session.provider || 'gateway',
    tier: session.tier || null,
    base: session.base || null,
    exp: Date.now() + days * 86400_000,
    iat: Date.now(),
  });
}

function readIngestToken(token) {
  const t = unseal(token);
  if (!t || t.scope !== 'inbox' || !t.key || !t.user?.id) return null;
  if (!t.exp || t.exp < Date.now()) return null;
  return {
    key: t.key,
    user: t.user,
    ns: t.ns || nsFor(t.user.id),
    provider: t.provider || 'gateway',
    tier: t.tier || null,
    base: t.base || null,
  };
}

// ---------------------------------------------------------------------------
// Router

// Shared storage surface for integrations (Slack now, Linear later).
export const wbStore = { nsFor, saveCard, loadRow, cardFromRow, saveRow, seal, unseal, nowIso, supaConfigured: () => Boolean(SUPA_URL) };

export function createWorkbench({ tasks, broadcast }) {
  const ctx = { tasks, broadcast };
  const limiter = rateMap();
  const modelCache = new Map();
  const balanceCache = new Map();

  function modelCacheKey(session) {
    return `${session.provider || 'gateway'}:${session.tier || '-'}:${sha256(session.key).slice(0, 12)}`;
  }

  async function getModels(session) {
    const key = modelCacheKey(session);
    const hit = modelCache.get(key);
    if (hit && Date.now() - hit.at < 5 * 60_000) return hit.models;
    const models = await listModelsFor(session);
    modelCache.set(key, { at: Date.now(), models });
    return models;
  }

  async function getBalance(session) {
    const hit = balanceCache.get(session.user.id);
    if (hit && Date.now() - hit.at < 20_000) return hit.data;
    let data;
    if (session.provider === 'subrouter') {
      data = await subrouterBalance(session);
    } else {
      const r = await gateway('/v1/me/balance', { key: session.key, timeout: 20_000 });
      if (!r.ok) return { error: 'balance_unavailable' };
      data = {
        balance: r.data?.data?.balance ?? r.data?.user?.balance ?? null,
        totalUsage: r.data?.data?.total_usage ?? null,
        unit: 'point',
        label: '点',
        user: r.data?.user || null,
      };
    }
    if (data && !data.error) balanceCache.set(session.user.id, { at: Date.now(), data });
    return data;
  }

  async function cards(session) {
    const rows = await listRows(session, 'c_', 200);
    return rows.map(cardFromRow).filter((c) => c && c.id);
  }

  async function conversations(session) {
    const rows = await listRows(session, '__conv__', 60);
    return rows.map((r) => rowData(r, 'conversation')).filter(Boolean).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  }

  async function settings(session) {
    const row = await loadRow(session, '__settings__');
    return rowData(row, 'settings') || {};
  }

  async function saveSettings(session, patch) {
    const current = await settings(session);
    const next = { ...current, ...patch, updatedAt: nowIso() };
    await saveRow(session, '__settings__', {
      goal: 'workbench-settings',
      progress: '',
      constraints: '',
      decisions: '',
      todos: [],
      sources: [{ kind: 'settings', data: next }],
    });
    return next;
  }

  async function saveConversation(session, conv) {
    conv.updatedAt = nowIso();
    const messages = Array.isArray(conv.messages) ? conv.messages.slice(-80) : [];
    await saveRow(session, `__conv__${conv.id}`, {
      goal: clampText(conv.title || '未命名会话', 2000),
      progress: clampText(messages.filter((m) => m.role === 'user').slice(-1)[0]?.content || '', 4000),
      constraints: '',
      decisions: '',
      todos: messages.slice(-50).map((m) => ({ role: m.role, text: clampText(m.content, 500), at: m.at || null })),
      sources: [{ kind: 'conversation', data: { ...conv, messages } }],
    });
    return conv;
  }

  async function handleSession(req, res, pathname) {
    if (pathname === '/api/session' && req.method === 'POST') {
      if (!sameOrigin(req)) return fail(res, 403, 'bad_origin', '来源校验失败');
      if (!limiter.hit('login:' + clientIp(req), 20, 60_000)) return fail(res, 429, 'rate_limited', '登录尝试过于频繁');
      const body = await readJson(req, 64_000);
      const demo = Boolean(body.demo);
      const requestedTier = String(body.tier || '').trim();
      let key = '';
      let requestedTierKey = null;
      if (requestedTier) {
        if (!SUB_KEYS[requestedTier]) return fail(res, 400, 'tier_unavailable', '这个 SubRouter 档位未配置');
        if (SUB_ACCESS && String(body.access || '') !== SUB_ACCESS) {
          return fail(res, 401, 'tier_access_required', '需要档位访问码');
        }
        key = SUB_KEYS[requestedTier];
        requestedTierKey = requestedTier;
      } else {
        key = demo ? (process.env.DEMO_GATEWAY_KEY || '') : String(body.key || '').trim();
      }
      if (!key) return fail(res, 400, 'key_required', demo ? '演示账号未配置' : '请输入账号密钥');
      let session;
      if (key.startsWith('sk-xc-')) {
        if (key.length < 30) return fail(res, 400, 'key_shape', '网关密钥格式不对');
        const v = await validateKey(key);
        if (!v.ok) return fail(res, v.status === 403 ? 403 : 401, 'invalid_key', '账号密钥无效或已停用');
        session = {
          v: 1,
          key,
          provider: 'gateway',
          user: {
            id: v.user.id,
            email: v.user.email || '',
            plan: v.user.plan || '',
            status: v.user.status || '',
          },
          ns: nsFor(v.user.id),
          exp: Date.now() + SESSION_TTL_MS,
          iat: Date.now(),
        };
      } else if (key.startsWith('sk-')) {
        const tier = requestedTierKey || tierForKey(key);
        const v = await validateSubrouter(key);
        if (!v.ok) return fail(res, v.status === 403 ? 403 : 401, 'invalid_key', 'SubRouter 密钥无效或没有模型权限');
        const account = tier
          ? (SUB_ACCOUNT_ID || sha256(key).slice(0, 12))
          : sha256(key).slice(0, 12);
        const userId = 'sub_' + account;
        session = {
          v: 1,
          key,
          provider: 'subrouter',
          tier: tier || 'custom',
          base: SUBROUTER + '/v1',
          user: {
            id: userId,
            email: 'SubRouter · ' + (tier || '自定义'),
            plan: tier || 'custom',
            status: 'active',
          },
          ns: nsFor(userId),
          exp: Date.now() + SESSION_TTL_MS,
          iat: Date.now(),
        };
      } else {
        return fail(res, 400, 'key_shape', '密钥要以 sk-xc- 或 sk- 开头');
      }
      const bal = await getBalance(session);
      res.setHeader('set-cookie', cookieHeader(SESSION_COOKIE, seal(session), {
        maxAge: Math.floor(SESSION_TTL_MS / 1000),
        secure: isSecure(req),
      }));
      return json(res, 200, {
        user: session.user,
        balance: bal?.balance ?? null,
        balanceUnit: bal?.unit || 'point',
        balanceLabel: bal?.label || '点',
        provider: session.provider || 'gateway',
        tier: session.tier || null,
        tiers: TIERS,
        defaultModel: (session.provider === 'subrouter' ? TIER_DEFAULT[session.tier] : '') || process.env.DEFAULT_MODEL || '',
        build: BUILD,
        demo,
        storage: SUPA_URL ? 'supabase' : (LOCAL_FILE ? 'local' : 'none'),
      });
    }

    if (pathname === '/api/logout' && req.method === 'POST') {
      res.setHeader('set-cookie', cookieHeader(SESSION_COOKIE, '', { maxAge: 0, secure: isSecure(req) }));
      return json(res, 200, { ok: true });
    }

    const session = getSession(req);
    if (!session) return fail(res, 401, 'unauthorized', '请先登录');

    if (pathname === '/api/me' && req.method === 'GET') {
      const bal = await getBalance(session);
      return json(res, 200, {
        user: session.user,
        ...bal,
        provider: session.provider || 'gateway',
        tier: session.tier || null,
        tiers: TIERS,
        build: BUILD,
      });
    }

    if (pathname === '/api/models' && req.method === 'GET') {
      try {
        const models = await getModels(session);
        return json(res, 200, { models, defaultModel: process.env.DEFAULT_MODEL || 'claude-haiku-4-5', build: BUILD });
      } catch (e) {
        return fail(res, 502, 'models_unavailable', '模型列表暂时不可用');
      }
    }

    if (pathname === '/api/tier' && req.method === 'POST') {
      if (session.provider !== 'subrouter') return fail(res, 400, 'not_subrouter', '当前账号不是 SubRouter 档位');
      const body = await readJson(req, 8_000);
      const tier = String(body.tier || '').trim();
      if (!SUB_KEYS[tier]) return fail(res, 400, 'tier_unavailable', '这个档位未配置');
      const next = {
        ...session,
        key: SUB_KEYS[tier],
        tier,
        base: SUBROUTER + '/v1',
        user: { ...session.user, email: 'SubRouter · ' + tier, plan: tier },
      };
      next.ns = session.ns;
      try {
        const models = await getModels(next);
        const bal = await getBalance(next);
        res.setHeader('set-cookie', cookieHeader(SESSION_COOKIE, seal(next), {
          maxAge: Math.floor(SESSION_TTL_MS / 1000),
          secure: isSecure(req),
        }));
        return json(res, 200, {
          tier,
          models,
          balance: bal?.balance ?? null,
          balanceUnit: bal?.unit || 'usd',
          balanceLabel: bal?.label || 'US$',
        });
      } catch (e) {
        return fail(res, 502, 'tier_switch_failed', '切换档位失败，仍停留在原档位');
      }
    }

    if (pathname === '/api/chat' && req.method === 'POST') {
      if (!limiter.hit('chat:' + session.user.id, 40, 60_000)) return fail(res, 429, 'rate_limited', '发送太快，稍后再试');
      const body = await readJson(req, 800_000);
      const model = clampText(body.model || '', 120);
      if (!model) return fail(res, 400, 'model_required', '先选择模型');
      const raw = Array.isArray(body.messages) ? body.messages : [];
      const messages = raw
        .filter((m) => m && ['user', 'assistant', 'system'].includes(m.role) && typeof m.content === 'string')
        .slice(-40)
        .map((m) => ({ role: m.role, content: clampText(m.content, 12000) }));
      if (!messages.some((m) => m.role === 'user')) return fail(res, 400, 'message_required', '没有要发送的内容');
      const system = clampText(body.system || '', 6000);
      const temporary = Boolean(body.temporary);
      const convId = clampText(body.conversationId || '', 40);
      const upstreamMessages = [
        ...(system ? [{ role: 'system', content: system }] : []),
        ...messages,
      ];
      const ctrl = new AbortController();
      let clientGone = false;
      req.on('close', () => { clientGone = true; ctrl.abort(); });
      let up;
      try {
        up = await fetch((session.base || (GATEWAY + '/v1')).replace(/\/+$/, '') + '/chat/completions', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${session.key}`,
            'content-type': 'application/json',
            accept: 'text/event-stream',
            'user-agent': USER_AGENT,
          },
          body: JSON.stringify({ model, messages: upstreamMessages, stream: true, max_tokens: Math.min(4000, Math.max(1, Number(body.maxTokens) || 1200)) }),
          signal: ctrl.signal,
        });
      } catch (e) {
        return fail(res, 502, 'chat_unreachable', '模型网关暂时连不上，内容已留在输入区');
      }
      if (!up.ok) {
        let detail = '';
        try { detail = (await up.text()).slice(0, 300); } catch {}
        log('chat upstream', up.status, detail.slice(0, 120));
        return fail(res, 502, 'chat_failed', '模型调用失败（HTTP ' + up.status + '），内容已留在输入区');
      }
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
        'x-content-type-options': 'nosniff',
      });
      const reader = up.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let full = '';
      let usage = null;
      let streamError = null;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = dec.decode(value, { stream: true });
          res.write(chunk);
          buf += chunk;
          let idx;
          while ((idx = buf.indexOf('\n\n')) >= 0) {
            const block = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            for (const line of block.split('\n')) {
              if (!line.startsWith('data:')) continue;
              const d = line.slice(5).trim();
              if (!d || d === '[DONE]') continue;
              try {
                const j = JSON.parse(d);
                if (j.error) streamError = String(j.error.message || j.error);
                const delta = j.choices?.[0]?.delta?.content;
                if (typeof delta === 'string') full += delta;
                if (j.usage) usage = j.usage;
              } catch {}
            }
          }
        }
      } catch (e) {
        if (!clientGone) streamError = streamError || 'stream_interrupted';
      } finally {
        try { res.write('data: [DONE]\n\n'); res.end(); } catch {}
      }
      if (!temporary && convId && full) {
        try {
          const row = await loadRow(session, `__conv__${convId}`);
          const prev = row ? (rowData(row, 'conversation') || {}) : {};
          const firstUser = messages.filter((m) => m.role === 'user').slice(-1)[0];
          const title = (prev.title && prev.title !== '新会话')
            ? prev.title
            : clampText((firstUser?.content || '新会话').split('\n')[0], 60);
          const conv = {
            ...prev,
            id: convId,
            title,
            system,
            model,
            messages: [...messages, { role: 'assistant', content: full, at: nowIso() }].slice(-80),
            createdAt: prev.createdAt || nowIso(),
            updatedAt: nowIso(),
            usage,
            streamError,
          };
          await saveConversation(session, conv);
        } catch (e) {
          log('conversation save failed', e?.message || e, 'upstream=' + (e?.upstream || ''), 'detail=' + JSON.stringify(e?.detail || '').slice(0, 200));
        }
      }
      return true;
    }

    if (pathname === '/api/bootstrap' && req.method === 'GET') {
      const out = {
        user: session.user,
        build: BUILD,
        demo: process.env.DEMO_GATEWAY_KEY ? true : false,
        defaultModel: process.env.DEFAULT_MODEL || '',
        provider: session.provider || 'gateway',
        tier: session.tier || null,
        tiers: TIERS,
      };
      const [bal, modelResult, cardResult, convResult, setResult] = await Promise.allSettled([
        getBalance(session),
        getModels(session),
        cards(session),
        conversations(session),
        settings(session),
      ]);
      out.balance = bal.status === 'fulfilled' ? bal.value : null;
      out.models = modelResult.status === 'fulfilled' ? modelResult.value : [];
      out.cards = cardResult.status === 'fulfilled' ? cardResult.value : [];
      out.conversations = convResult.status === 'fulfilled' ? convResult.value : [];
      out.settings = setResult.status === 'fulfilled' ? setResult.value : {};
      if (cardResult.status === 'rejected' || convResult.status === 'rejected' || setResult.status === 'rejected') {
        out.storageError = 'cloud_storage_unavailable';
      }
      out.storage = SUPA_URL ? 'supabase' : (LOCAL_FILE ? 'local' : 'none');
      out.voice = { available: Boolean(VOICE_TOKEN_SECRET), speakers: SPEAKERS };
      return json(res, 200, out);
    }

    if (pathname === '/api/cards' && req.method === 'GET') {
      try { return json(res, 200, { cards: await cards(session) }); }
      catch { return fail(res, 502, 'storage_unavailable', '云端卡片暂不可用'); }
    }

    if (pathname === '/api/cards' && req.method === 'POST') {
      if (!limiter.hit('card:' + session.user.id, 60, 60_000)) return fail(res, 429, 'rate_limited', '操作太快，稍后再试');
      const body = await readJson(req, 200_000);
      const text = clampText(body.text || body.original || '', 20000).trim();
      if (!text) return fail(res, 400, 'text_required', '卡片内容不能为空');
      const firstLine = text.split('\n').map((s) => s.trim()).find(Boolean) || '未命名卡片';
      const sourceKind = ['manual', 'voice', 'subtitle', 'chat'].includes(body.source?.kind) ? body.source.kind : 'manual';
      const source = {
        kind: sourceKind,
        label: clampText(body.source?.label || ({ manual: '手动输入', voice: '语音转写', subtitle: '外部字幕', chat: '对话摘录' }[sourceKind]), 120),
        app: clampText(body.source?.app || '', 80) || null,
        batch: clampText(body.source?.batch || '', 80) || null,
        index: Number.isFinite(Number(body.source?.index)) ? Number(body.source.index) : null,
        at: nowIso(),
        externalAssistant: Boolean(body.source?.externalAssistant),
      };
      const id = 'c_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
      const card = {
        id,
        project: clampText(body.project || '默认项目', 60),
        title: clampText(body.title || firstLine, 120),
        status: 'draft',
        original: text,
        working: text,
        source,
        assistant: null,
        review: null,
        approval: null,
        result: null,
        messages: [],
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      try { return json(res, 201, { card: await saveCard(session, card) }); }
      catch { return fail(res, 502, 'storage_unavailable', '卡片保存失败，未提交'); }
    }

    const cardMatch = pathname.match(/^\/api\/cards\/([a-zA-Z0-9_-]+)(?:\/(organize|review|approve|voice))?$/);
    if (cardMatch) {
      const id = cardMatch[1];
      const action = cardMatch[2] || '';
      let row;
      try { row = await loadRow(session, id); }
      catch { return fail(res, 502, 'storage_unavailable', '云端卡片暂不可用'); }
      if (!row) return fail(res, 404, 'not_found', '找不到这张卡片');
      const card = cardFromRow(row);

      if (!action && req.method === 'GET') return json(res, 200, { card });

      if (!action && req.method === 'PATCH') {
        const body = await readJson(req, 200_000);
        if (body.title !== undefined) card.title = clampText(body.title, 120) || card.title;
        if (body.working !== undefined) card.working = clampText(body.working, 4000);
        if (body.project !== undefined) card.project = clampText(body.project, 60) || card.project;
        if (Array.isArray(body.messages)) card.messages = body.messages.slice(-50);
        if (body.original !== undefined && !card.original) card.original = clampText(body.original, 20000);
        card.messages = [...(card.messages || []), { role: 'user', text: '卡片内容已修改', at: nowIso() }].slice(-50);
        try { return json(res, 200, { card: await saveCard(session, card) }); }
        catch { return fail(res, 502, 'storage_unavailable', '修改未保存'); }
      }

      if (!action && req.method === 'DELETE') {
        try { await deleteRow(session, id); return json(res, 200, { ok: true }); }
        catch { return fail(res, 502, 'storage_unavailable', '删除失败'); }
      }

      if (action === 'organize' && req.method === 'POST') {
        if (!card.working || !card.working.trim()) return fail(res, 400, 'text_required', '卡片没有内容');
        try { return json(res, 200, { card: await organizeCard(session, card) }); }
        catch (e) { return fail(res, 502, 'organize_failed', '整理失败，卡片内容已保留'); }
      }

      if (action === 'review' && req.method === 'POST') {
        if (!card.working || !card.working.trim()) return fail(res, 400, 'text_required', '卡片没有内容');
        try { return json(res, 200, { card: await reviewCard(session, card) }); }
        catch { return fail(res, 502, 'review_failed', '审核服务暂不可用'); }
      }

      if (action === 'approve' && req.method === 'POST') {
        const body = await readJson(req, 32_000);
        if (card.review?.verdict !== 'pass' && !body.force) {
          return fail(res, 409, 'review_required', '独立审核尚未通过；先送审，或明确勾选强制批准');
        }
        if (card.status === 'done' || card.status === 'running') return fail(res, 409, 'already_done', '这张卡已经执行');
        card.approval = {
          by: session.user.email || session.user.id,
          at: nowIso(),
          method: body.force ? 'explicit-force' : 'explicit',
          note: clampText(body.note || '', 500),
        };
        card.status = 'approved';
        card.messages = [...(card.messages || []), { role: 'user', text: '已批准执行', at: nowIso() }].slice(-50);
        try { await saveCard(session, card); } catch { return fail(res, 502, 'storage_unavailable', '批准未保存'); }
        const task = queueTask(card, session, ctx);
        return json(res, 200, { card, task: publicTask(task) });
      }

      if (action === 'voice' && req.method === 'POST') {
        const body = await readJson(req, 64_000);
        const text = clampText(body.text || '', 4000).trim();
        if (!text) return fail(res, 400, 'text_required', '没有识别到文字');
        card.working = clampText((card.working ? card.working + '\n' : '') + text, 4000);
        card.messages = [...(card.messages || []), { role: 'voice', text, at: nowIso() }].slice(-50);
        try { return json(res, 200, { card: await saveCard(session, card) }); }
        catch { return fail(res, 502, 'storage_unavailable', '语音文字未保存'); }
      }
    }

    if (pathname === '/api/tasks' && req.method === 'GET') {
      let persisted = [];
      try { persisted = await listTasks(session); } catch {}
      const merged = new Map();
      for (const t of persisted) if (t && t.id) merged.set(t.id, t);
      for (const t of tasks) if (t && t.id) merged.set(t.id, t);
      const mine = [...merged.values()]
        .filter((t) => t.userId === session.user.id)
        .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
        .slice(-80)
        .map(publicTask);
      return json(res, 200, { tasks: mine, autoExecute: AUTO_EXECUTE });
    }

    if (pathname === '/api/conversations' && req.method === 'GET') {
      try { return json(res, 200, { conversations: await conversations(session) }); }
      catch { return fail(res, 502, 'storage_unavailable', '会话暂不可用'); }
    }

    if (pathname === '/api/conversations' && req.method === 'POST') {
      const body = await readJson(req, 200_000);
      const id = 'cv_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
      const conv = {
        id,
        title: clampText(body.title || '新会话', 120),
        system: clampText(body.system || '', 4000),
        model: clampText(body.model || '', 120),
        messages: Array.isArray(body.messages) ? body.messages.slice(-80) : [],
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      try { return json(res, 201, { conversation: await saveConversation(session, conv) }); }
      catch { return fail(res, 502, 'storage_unavailable', '会话未保存'); }
    }

    const convMatch = pathname.match(/^\/api\/conversations\/([a-zA-Z0-9_-]+)$/);
    if (convMatch) {
      const id = convMatch[1];
      let row;
      try { row = await loadRow(session, `__conv__${id}`); }
      catch { return fail(res, 502, 'storage_unavailable', '会话暂不可用'); }
      if (!row) return fail(res, 404, 'not_found', '找不到会话');
      const conv = rowData(row, 'conversation') || { id };
      if (req.method === 'GET') return json(res, 200, { conversation: conv });
      if (req.method === 'PATCH') {
        const body = await readJson(req, 300_000);
        if (body.title !== undefined) conv.title = clampText(body.title, 120) || conv.title;
        if (body.system !== undefined) conv.system = clampText(body.system, 4000);
        if (body.model !== undefined) conv.model = clampText(body.model, 120);
        if (Array.isArray(body.messages)) conv.messages = body.messages.slice(-80);
        try { return json(res, 200, { conversation: await saveConversation(session, conv) }); }
        catch { return fail(res, 502, 'storage_unavailable', '会话未保存'); }
      }
      if (req.method === 'DELETE') {
        try { await deleteRow(session, `__conv__${id}`); return json(res, 200, { ok: true }); }
        catch { return fail(res, 502, 'storage_unavailable', '会话删除失败'); }
      }
    }

    if (pathname === '/api/settings' && req.method === 'GET') {
      try { return json(res, 200, { settings: await settings(session) }); }
      catch { return fail(res, 502, 'storage_unavailable', '设置暂不可用'); }
    }
    if (pathname === '/api/settings' && req.method === 'PUT') {
      const body = await readJson(req, 200_000);
      const allowed = ['layout', 'theme', 'model', 'quickbar', 'reducedMotion', 'customPalette', 'accent', 'sidebarCollapsed'];
      const patch = {};
      for (const k of allowed) if (body[k] !== undefined) patch[k] = body[k];
      try { return json(res, 200, { settings: await saveSettings(session, patch) }); }
      catch { return fail(res, 502, 'storage_unavailable', '设置未保存'); }
    }

    if (pathname === '/api/ingest-token' && req.method === 'POST') {
      const token = mintIngestToken(session);
      return json(res, 200, {
        token,
        expiresInDays: 90,
        endpoint: '/api/inbox',
        header: 'Authorization: Bearer <token>',
        note: '仅能创建草稿卡，不能读取卡片、不能批准执行。',
      });
    }

    if (pathname === '/api/voice-token' && req.method === 'POST') {
      if (!VOICE_TOKEN_SECRET) return fail(res, 501, 'voice_not_configured', '语音令牌未配置');
      const token = signVoiceToken(session);
      return json(res, 200, {
        token,
        expiresIn: 120,
        wsPath: '/voice',
        speakers: SPEAKERS,
        note: '语音连接复用现有 /voice 桥；收起面板不会挂断。',
      });
    }

    return fail(res, 404, 'not_found', '接口不存在');
  }

  async function handleInbox(req, res) {
    if (req.method !== 'POST') return fail(res, 405, 'method_not_allowed', '只接受 POST');
    const auth = String(req.headers.authorization || '');
    const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
    const ingest = readIngestToken(token);
    if (!ingest) return fail(res, 401, 'invalid_ingest_token', '接收令牌无效或已过期');
    if (!limiter.hit('inbox:' + sha256(token).slice(0, 16), 60, 60_000)) {
      return fail(res, 429, 'rate_limited', '字幕提交太频繁');
    }
    const body = await readJson(req, 120_000);
    const text = clampText(body.text || '', 20_000).trim();
    if (text.length < 2) return fail(res, 400, 'text_required', '没有收到字幕文字');
    const source = {
      kind: 'subtitle',
      label: clampText(body.source?.label || '外部字幕', 120),
      app: clampText(body.source?.app || '', 80) || null,
      batch: clampText(body.source?.batch || '', 80) || new Date().toISOString().slice(0, 16),
      index: Number.isFinite(Number(body.source?.index)) ? Number(body.source.index) : null,
      at: nowIso(),
      externalAssistant: Boolean(body.source?.externalAssistant),
    };
    const session = {
      key: ingest.key,
      user: ingest.user,
      ns: ingest.ns,
      provider: ingest.provider || 'gateway',
      tier: ingest.tier || null,
      base: ingest.base || (GATEWAY + '/v1'),
    };
    let existing = [];
    try { existing = await cards(session); } catch { existing = []; }
    const norm = text.replace(/\s+/g, ' ').trim();
    const same = existing.find((c) => {
      if (!c?.source) return false;
      if (source.batch && c.source.batch === source.batch && source.index !== null && c.source.index === source.index) return true;
      const age = Date.now() - Date.parse(c.createdAt || 0);
      return age < 10 * 60_000 && (c.original || '').replace(/\s+/g, ' ').trim() === norm && c.source.app === source.app;
    });
    if (same) {
      return json(res, 200, { saved: true, deduped: true, organizing: false, card: same });
    }
    const id = 'c_' + sha256(`inbox|${ingest.user.id}|${source.batch}|${source.index}|${norm}`).slice(0, 16);
    const card = {
      id,
      project: clampText(body.project || '字幕收件箱', 60),
      title: clampText(body.title || norm.split(/[。！？.!?]/)[0].slice(0, 40) || '字幕草稿', 120),
      status: 'draft',
      original: text,
      working: text,
      source,
      assistant: null,
      review: null,
      approval: null,
      result: null,
      messages: [{ role: 'source', text: '由外部字幕通过受控接收接口保存', at: nowIso() }],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    try {
      await saveCard(session, card);
    } catch {
      return fail(res, 502, 'storage_unavailable', '字幕未保存，请保留原文后重试');
    }
    json(res, 202, { saved: true, deduped: false, organizing: true, card });
    // The response is already sent: organize asynchronously so the shortcut
    // returns fast.  A failure is stored on the card, never reported as ok.
    organizeCard(session, card).catch(async (err) => {
      card.organizeError = err?.message || 'organize_failed';
      card.messages = [...(card.messages || []), { role: 'system', text: '已保存，但自动整理失败；原文未丢失。', at: nowIso() }].slice(-50);
      try { await saveCard(session, card); } catch {}
    });
  }

  // Static files ------------------------------------------------------------
  function serveStatic(req, res, pathname) {
    let rel = pathname === '/' ? '/index.html' : pathname;
    if (rel === '/sw.js') {
      const sw = fs.readFileSync(path.join(PUBLIC_DIR, 'sw.js'), 'utf8').replace(/__BUILD__/g, BUILD);
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache, no-store, must-revalidate' });
      return res.end(sw);
    }
    if (rel === '/manifest.webmanifest') {
      const mf = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, 'manifest.webmanifest'), 'utf8'));
      // Identity is path-scoped so this app does not collide with the factory
      // PWA (id /factory, scope /factory/) on the same origin.
      mf.id = '/workbench';
      mf.name = 'X-Connect Workbench';
      mf.short_name = 'Workbench';
      mf.start_url = '/workbench/?source=pwa';
      mf.scope = '/workbench/';
      res.writeHead(200, { 'content-type': 'application/manifest+json; charset=utf-8', 'cache-control': 'no-cache' });
      return res.end(JSON.stringify(mf));
    }
    const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
    const full = path.join(PUBLIC_DIR, safe);
    if (!full.startsWith(PUBLIC_DIR)) return false;
    let stat;
    try { stat = fs.statSync(full); } catch { return false; }
    if (stat.isDirectory()) return false;
    const ext = path.extname(full).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const noCache = ['.html', '.css', '.js', '.webmanifest'].includes(ext);
    const headers = {
      'content-type': type,
      'cache-control': noCache ? 'no-cache, no-store, must-revalidate' : 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    };
    if (ext === '.html') {
      headers['referrer-policy'] = 'no-referrer';
      headers['permissions-policy'] = 'microphone=(self)';
    }
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(full).pipe(res);
    return true;
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    try {
      if (pathname.startsWith('/api/')) {
        if (pathname === '/api/health') {
          return json(res, 200, {
            ok: true,
            build: BUILD,
            storage: SUPA_URL ? 'supabase' : (LOCAL_FILE ? 'local' : 'none'),
            gateway: GATEWAY,
            autoExecute: AUTO_EXECUTE,
            voice: Boolean(VOICE_TOKEN_SECRET),
            subrouter: TIERS.length > 0,
            tiers: TIERS,
            tierAccessRequired: Boolean(SUB_ACCESS),
            startedAt: STARTED_AT,
          });
        }
        if (pathname === '/api/version') return json(res, 200, { build: BUILD, startedAt: STARTED_AT });
        if (pathname === '/api/inbox') { await handleInbox(req, res); return true; }
        if (pathname === '/api/linear/issues' || pathname === '/api/linear/sync') {
          const session = getSession(req);
          if (!session) return fail(res, 401, 'auth_required', '请先登录');
          if (req.method === 'POST' && !sameOrigin(req)) return fail(res, 403, 'bad_origin', '来源校验失败');
          try {
            if (pathname === '/api/linear/issues' && req.method === 'GET') {
              return json(res, 200, await linearMirror.snapshot());
            }
            if (pathname === '/api/linear/sync' && req.method === 'POST') {
              const result = await linearMirror.syncNow();
              return json(res, 200, { ok: true, source: 'linear_issues', ...result });
            }
          } catch (err) {
            const code = err.code || 'linear_error';
            const status = err.status || (code.endsWith('_missing') ? 503 : 502);
            return fail(res, status, code, 'Linear 本地镜像不可用');
          }
          return fail(res, 405, 'method_not_allowed', '只读镜像不接受这个方法');
        }
        await handleSession(req, res, pathname);
        return true;
      }
      // Reserved server routes must not fall through to the SPA shell.
      if (pathname === '/healthz' || pathname === '/voice' || pathname.startsWith('/bridge/')) return false;
      if ((req.method === 'GET' || req.method === 'HEAD') && (pathname === '/workbench' || pathname === '/workbench/index.html')) {
        const target = '/workbench/' + (url.search || '');
        res.writeHead(308, { Location: target, 'cache-control': 'no-store' });
        res.end();
        return true;
      }
      if (req.method === 'GET' || req.method === 'HEAD') {
        if (serveStatic(req, res, pathname)) return true;
        // SPA fallback for client routes, but not for a missing asset.
        if (!path.extname(pathname)) {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
          fs.createReadStream(path.join(PUBLIC_DIR, 'index.html')).pipe(res);
          return true;
        }
      }
      return false;
    } catch (err) {
      const status = err?.status || 500;
      if (!res.headersSent) {
        return fail(res, status, err?.message || 'internal_error', status >= 500 ? '服务暂时不可用' : '请求有误');
      }
      try { res.end(); } catch {}
      return true;
    }
  }

  async function onTaskComplete(task) {
    if (!task?.cardId || !task?.userId) return;
    // Find the card under the same namespace.  The task stores the user id; we
    // can rebuild the namespace without keeping the gateway key around.
    const session = { key: '', user: { id: task.userId, email: task.userEmail || '' }, ns: nsFor(task.userId) };
    try {
      const row = await loadRow(session, task.cardId);
      if (!row) return;
      const card = cardFromRow(row);
      card.status = task.status === 'done' ? 'done' : 'failed';
      card.result = task.status === 'done' ? (task.result || '') : null;
      card.error = task.status === 'failed' ? (task.result || 'execution_failed') : null;
      card.completedAt = task.finishedAt || nowIso();
      card.executor = task.executor || 'bridge';
      await saveCard(session, card);
      saveTask(session, task);
      broadcast('task_updated', publicTask(task));
      notifyCardComplete(session.ns, card).catch(() => {});
    } catch (e) {
      log('onTaskComplete failed', e?.message || e);
    }
  }

  return { handle, onTaskComplete, publicTask, BUILD, SPEAKERS };
}
