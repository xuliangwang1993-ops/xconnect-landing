// Image generation for the assistant chat: text-to-image and image-to-image.
// Key order: the signed-in user's own key (BYOK, sealed server-side) first, then
// a server key from env. Users pay their provider directly; we only link to it.
export const IMAGE_PROVIDERS = {
  ark: {
    name: 'Doubao Seedream (Volcengine Ark)', env: 'ARK_API_KEY', i2i: true,
    links: [['Ark console · API Key', 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey'], ['Seedream docs', 'https://www.volcengine.com/docs/82379/1541523']],
  },
  openai: {
    name: 'OpenAI gpt-image-1', env: 'OPENAI_API_KEY', i2i: true,
    links: [['OpenAI API keys', 'https://platform.openai.com/api-keys'], ['Images docs', 'https://platform.openai.com/docs/guides/image-generation']],
  },
  xai: {
    name: 'xAI Grok Image', env: 'XAI_API_KEY', i2i: false,
    links: [['xAI console', 'https://console.x.ai/'], ['Image docs', 'https://docs.x.ai/docs/guides/image-generations']],
  },
};
export const IMAGE_PROVIDER_IDS = Object.keys(IMAGE_PROVIDERS);
const ORDER = ['ark', 'openai', 'xai'];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export class ImageGenError extends Error {
  constructor(code, message, status = 400, extra = {}) { super(message); this.code = code; this.status = status; this.extra = extra; }
}

export function parseDataUrl(s) {
  const m = /^data:(image\/(png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(s || ''));
  if (!m) return null;
  const buf = Buffer.from(m[3], 'base64');
  if (!buf.length || buf.length > MAX_IMAGE_BYTES) return null;
  return { mime: m[1] === 'image/jpg' ? 'image/jpeg' : m[1], buf, dataUrl: s };
}

// Resolve the provider + key. userKeys: { ark: {key}, ... } (already unsealed).
export function pickProvider({ want, needI2I, userKeys = {}, env = {} }) {
  const cands = want && IMAGE_PROVIDERS[want] ? [want] : ORDER;
  for (const src of ['user', 'server']) {
    for (const id of cands) {
      const p = IMAGE_PROVIDERS[id];
      if (needI2I && !p.i2i) continue;
      const key = src === 'user' ? userKeys[id]?.key : env[p.env];
      if (key) return { id, key, source: src, base: id === 'ark' ? (env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3') : id === 'openai' ? (env.OPENAI_BASE_URL || 'https://api.openai.com/v1') : (env.XAI_BASE_URL || 'https://api.x.ai/v1') };
    }
  }
  return null;
}

async function upstream(fetchImpl, url, init) {
  let r;
  try { r = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(120_000) }); }
  catch (e) { throw new ImageGenError('upstream_unreachable', 'Image provider unreachable: ' + (e.message || e), 502); }
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch {}
  if (!r.ok) {
    const msg = j?.error?.message || j?.message || text.slice(0, 300);
    throw new ImageGenError(r.status === 401 || r.status === 403 ? 'provider_auth' : 'provider_error', `Provider ${r.status}: ${msg}`, 502);
  }
  return j || {};
}

function collect(j) {
  return (j.data || []).map((d) => d.b64_json ? { dataUrl: `data:image/${d.b64_json.startsWith('/9j/') ? 'jpeg' : d.b64_json.startsWith('UklGR') ? 'webp' : 'png'};base64,` + d.b64_json } : d.url ? { url: d.url } : null).filter(Boolean);
}

export async function generateImage({ prompt, image, n = 1, size, provider, userKeys, env, fetchImpl = fetch }) {
  prompt = String(prompt || '').trim().slice(0, 4000);
  const src = image ? parseDataUrl(image) : null;
  if (image && !src) throw new ImageGenError('bad_image', 'Image must be a PNG/JPEG/WebP data URL under 8 MB');
  if (!prompt) throw new ImageGenError('missing_prompt', 'Prompt is required');
  n = Math.max(1, Math.min(4, Number(n) || 1));
  const p = pickProvider({ want: provider, needI2I: Boolean(src), userKeys, env });
  if (!p) {
    throw new ImageGenError('no_image_provider',
      src ? 'No image-to-image provider key. Add a Doubao Seedream (Ark) or OpenAI key in /settings, or set ARK_API_KEY / OPENAI_API_KEY on the server.'
          : 'No image provider key. Add a Doubao Seedream (Ark), OpenAI or xAI key in /settings, or set ARK_API_KEY / OPENAI_API_KEY / XAI_API_KEY on the server.',
      503, { needed: src ? ['ARK_API_KEY', 'OPENAI_API_KEY'] : ['ARK_API_KEY', 'OPENAI_API_KEY', 'XAI_API_KEY'] });
  }
  const auth = { authorization: `Bearer ${p.key}` };
  let j, model;
  if (p.id === 'ark') {
    model = env.ARK_IMAGE_MODEL || 'doubao-seedream-4-5-251128';
    const body = { model, prompt, size: size || '2K', response_format: 'b64_json', watermark: false };
    if (src) body.image = src.dataUrl;
    if (n > 1) { body.sequential_image_generation = 'auto'; body.sequential_image_generation_options = { max_images: n }; }
    j = await upstream(fetchImpl, p.base + '/images/generations', { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  } else if (p.id === 'openai') {
    model = env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
    if (src) {
      const fd = new FormData();
      fd.append('model', model); fd.append('prompt', prompt); fd.append('n', String(n)); fd.append('size', size || '1024x1024');
      fd.append('image', new Blob([src.buf], { type: src.mime }), 'input.' + src.mime.split('/')[1]);
      j = await upstream(fetchImpl, p.base + '/images/edits', { method: 'POST', headers: auth, body: fd });
    } else {
      j = await upstream(fetchImpl, p.base + '/images/generations', { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ model, prompt, n, size: size || '1024x1024' }) });
    }
  } else {
    model = env.XAI_IMAGE_MODEL || 'grok-2-image-1212';
    j = await upstream(fetchImpl, p.base + '/images/generations', { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ model, prompt, n, response_format: 'b64_json' }) });
  }
  const images = collect(j);
  if (!images.length) throw new ImageGenError('no_images', 'Provider returned no images', 502);
  return { ok: true, mode: src ? 'image-to-image' : 'text-to-image', provider: p.id, providerName: IMAGE_PROVIDERS[p.id].name, keySource: p.source, model, images };
}

// Route handler. deps: { json, fail, readJson, loadRow, saveRow, rowData, seal, unseal, nowIso, env, fetchImpl }
export async function handleImageRoutes(req, res, pathname, session, d) {
  if (pathname !== '/api/image/generate' && pathname !== '/api/image-keys' && pathname !== '/api/image/providers') return false;
  const env = d.env || process.env;
  const loadKeys = async () => d.rowData(await d.loadRow(session, '__image_keys__'), 'image-keys') || {};
  const masked = (k) => Object.fromEntries(IMAGE_PROVIDER_IDS.map((p) => [p, k[p] ? { set: true, masked: k[p].masked, updatedAt: k[p].updatedAt } : { set: false }]));
  if (pathname === '/api/image/providers' && req.method === 'GET') {
    let k = {}; try { k = await loadKeys(); } catch {}
    d.json(res, 200, { providers: IMAGE_PROVIDER_IDS.map((id) => ({ id, name: IMAGE_PROVIDERS[id].name, i2i: IMAGE_PROVIDERS[id].i2i, links: IMAGE_PROVIDERS[id].links, server: Boolean(env[IMAGE_PROVIDERS[id].env]), user: Boolean(k[id]) })) });
    return true;
  }
  if (pathname === '/api/image-keys') {
    if (req.method === 'GET') {
      try { d.json(res, 200, { keys: masked(await loadKeys()) }); } catch { d.fail(res, 502, 'storage_unavailable', '密钥暂不可读'); }
      return true;
    }
    if (req.method === 'PUT' || req.method === 'DELETE') {
      const body = await d.readJson(req, 20_000);
      const provider = String(body.provider || '');
      if (!IMAGE_PROVIDERS[provider]) { d.fail(res, 400, 'bad_provider', '不支持的服务商'); return true; }
      try {
        const k = await loadKeys();
        if (req.method === 'DELETE') delete k[provider];
        else {
          const key = String(body.key || '').trim();
          if (key.length < 8 || key.length > 400) { d.fail(res, 400, 'bad_key', '密钥格式不对'); return true; }
          k[provider] = { sealed: d.seal({ key }), masked: key.slice(0, 3) + '…' + key.slice(-4), updatedAt: d.nowIso() };
        }
        await d.saveRow(session, '__image_keys__', { goal: 'image-keys', progress: '', constraints: '', decisions: '', todos: [], sources: [{ kind: 'image-keys', data: k }] });
        d.json(res, 200, { keys: masked(k) });
      } catch { d.fail(res, 502, 'storage_unavailable', '密钥未保存'); }
      return true;
    }
    return false;
  }
  if (req.method !== 'POST') return false;
  const body = await d.readJson(req, 12 * 1024 * 1024);
  let userKeys = {};
  try { const k = await loadKeys(); for (const [id, v] of Object.entries(k)) { const u = v && d.unseal(v.sealed); if (u?.key) userKeys[id] = u; } } catch {}
  try {
    d.json(res, 200, await generateImage({ prompt: body.prompt, image: body.image, n: body.n, size: body.size, provider: body.provider, userKeys, env, fetchImpl: d.fetchImpl || fetch }));
  } catch (e) {
    if (e instanceof ImageGenError) d.json(res, e.status, { error: e.code, message: e.message, ...e.extra });
    else d.fail(res, 500, 'image_failed', String(e.message || e));
  }
  return true;
}
