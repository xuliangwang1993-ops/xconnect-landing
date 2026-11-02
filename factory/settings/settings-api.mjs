// /settings server routes: assistant_persona read/write with the server-held
// Supabase service key. The key never leaves the server.
const FIELDS = 'id,name,role,model,voice,description,intro,avatar,sort';
const EDITABLE = ['intro', 'voice'];

export function supaCfg(env) {
  const url = String(env.SUPABASE_URL || env.SUPA_URL || '').replace(/\/+$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY || '';
  return url && key ? { url, key } : null;
}

async function supa(cfg, fetchImpl, method, q, body) {
  const r = await fetchImpl(`${cfg.url}/rest/v1/${q}`, {
    method, headers: { apikey: cfg.key, authorization: `Bearer ${cfg.key}`, 'content-type': 'application/json', prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error('supabase_' + r.status);
  return r.json();
}

export async function listAssistants({ env, fetchImpl, session }) {
  const cfg = supaCfg(env);
  if (!cfg) return { ok: false, error: 'supabase_not_configured' };
  const rows = await supa(cfg, fetchImpl, 'GET', `assistant_persona?select=${FIELDS}${session ? ',system_prompt' : ''}&order=sort`);
  let memory = {};
  if (session) {
    const ns = encodeURIComponent(session.ns);
    const mem = await supa(cfg, fetchImpl, 'GET', `assistant_memory?select=assistant_id&or=(user_id.eq.owner,user_id.eq.${ns})&limit=1000`).catch(() => []);
    for (const m of mem) memory[m.assistant_id] = (memory[m.assistant_id] || 0) + 1;
  }
  return { ok: true, signedIn: Boolean(session), editable: session ? EDITABLE : [], assistants: rows.map((r) => ({ ...r, memoryCount: session ? (memory[r.id] || 0) : null })) };
}

export async function patchAssistant({ env, fetchImpl, id, body, speakerIds }) {
  const cfg = supaCfg(env);
  if (!cfg) return { ok: false, error: 'supabase_not_configured' };
  if (!/^[a-z0-9_-]{1,40}$/.test(id)) return { ok: false, error: 'bad_id' };
  const patch = {};
  if (typeof body.intro === 'string') patch.intro = body.intro.slice(0, 600);
  if (typeof body.voice === 'string') {
    if (speakerIds && !speakerIds.has(body.voice)) return { ok: false, error: 'bad_voice' };
    patch.voice = body.voice;
  }
  if (!Object.keys(patch).length) return { ok: false, error: 'nothing_to_update' };
  const rows = await supa(cfg, fetchImpl, 'PATCH', `assistant_persona?id=eq.${encodeURIComponent(id)}&select=${FIELDS}`, patch);
  return rows.length ? { ok: true, assistant: rows[0] } : { ok: false, error: 'not_found' };
}
