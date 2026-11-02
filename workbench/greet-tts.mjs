// Spoken greeting: POST /api/tts {kind, assistantId, lang} → audio/mpeg in the persona's
// Doubao voice. Public (the popup greets before login) but text is server-built from the
// KB only — callers cannot synthesize arbitrary text.
import { loadKb } from './promo.mjs';
import { personaVoice } from './persona-voices.mjs';

const KINDS = ['greeting', 'decline'];
const hits = new Map();
export function greetingText(kind, assistantId, lang, kb = loadKb()) {
  const en = /^en/i.test(String(lang || ''));
  const p = kb.personas[assistantId] || kb.personas.brain;
  const name = en ? p.name.en : p.name.zh;
  const src = kind === 'decline' ? kb.greeting.decline : kb.greeting.text;
  return String(en ? src.en : src.zh).replace(/\{name\}/g, name);
}

export async function synthesize(text, speaker, { env = process.env, fetchImpl = fetch } = {}) {
  const key = env.DOUBAO_API_KEY;
  if (!key) throw Object.assign(new Error('DOUBAO_API_KEY missing'), { status: 503 });
  const r = await fetchImpl(env.DOUBAO_TTS_URL || 'https://openspeech.bytedance.com/api/v3/tts/unidirectional', {
    method: 'POST',
    headers: { 'X-Api-Key': key, 'X-Api-Resource-Id': env.DOUBAO_TTS_RESOURCE_ID || 'seed-tts-2.0', 'X-Api-Request-Id': crypto.randomUUID(), 'content-type': 'application/json' },
    body: JSON.stringify({ user: { uid: 'xc-greet' }, req_params: { text, speaker, audio_params: { format: 'mp3', sample_rate: 24000 } } }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await r.text();
  const chunks = [];
  for (const line of body.split('\n')) {
    if (!line.trim()) continue;
    let j; try { j = JSON.parse(line); } catch { continue; }
    if (j.code && j.code !== 0 && j.code !== 20000000) throw Object.assign(new Error('tts_' + j.code + ': ' + (j.message || '')), { status: 502 });
    if (j.data) chunks.push(Buffer.from(j.data, 'base64'));
  }
  if (!chunks.length) throw Object.assign(new Error('tts_empty'), { status: 502 });
  return Buffer.concat(chunks);
}

const cache = new Map();
export async function handleTts(req, res, pathname, d) {
  if (pathname !== '/api/tts' || req.method !== 'POST') return false;
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0];
  const now = Date.now(); const h = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  if (h.length >= 12) { d.fail(res, 429, 'rate_limited', '太频繁'); return true; }
  h.push(now); hits.set(ip, h);
  const body = await d.readJson(req, 4000).catch(() => ({}));
  const kind = KINDS.includes(body.kind) ? body.kind : 'greeting';
  const id = String(body.assistantId || 'brain');
  const lang = /^en/i.test(String(body.lang || '')) ? 'en' : 'zh';
  const speaker = personaVoice(id) || personaVoice('brain');
  const k = [kind, id, lang, speaker].join('|');
  try {
    let audio = cache.get(k);
    if (!audio) { audio = await synthesize(greetingText(kind, id, lang), speaker, { env: d.env || process.env, fetchImpl: d.fetchImpl || fetch }); cache.set(k, audio); }
    res.writeHead(200, { 'content-type': 'audio/mpeg', 'cache-control': 'no-store', 'content-length': audio.length });
    res.end(audio);
  } catch (e) { d.fail(res, e.status || 502, 'tts_failed', String(e.message || e)); }
  return true;
}
