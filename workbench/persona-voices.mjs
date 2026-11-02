// 角色 → 豆包音色的唯一真相表（来自 feat/persona-voice-table，与 X-connect App
// builtin_assistants.dart 的 doubaoVoiceId 一致）。服务端、设置页、语音桥都读这一份。
// Supabase assistant_persona.voice 可在 /settings 改，但只接受这张表里的音色。

export const PERSONA_VOICES = Object.freeze({
  voice: 'zh_female_peiqi_uranus_bigtts', // 李黑鸭 Duck Lee
  scribe: 'id_male_han_uranus_bigtts', // 斯巴达 Sparky
  brain: 'zh_male_lanyinmianbao_uranus_bigtts', // 四毛 Forty Cents
  deep: 'zh_male_sunwukong_uranus_bigtts', // 武天 WuTian
  admin: 'en_male_father-christmas_uranus_bigtts', // 狒狒 Feifei
});

export const VOICE_LIST = Object.freeze([
  { id: PERSONA_VOICES.voice, label: '佩奇 · 李黑鸭的声音', note: 'voice' },
  { id: PERSONA_VOICES.scribe, label: 'Han · 斯巴达的声音', note: 'scribe' },
  { id: PERSONA_VOICES.brain, label: '懒音绵宝 · 四毛的声音', note: 'brain' },
  { id: PERSONA_VOICES.deep, label: '孙悟空 · 武天的声音', note: 'deep' },
  { id: PERSONA_VOICES.admin, label: 'Father Christmas · 狒狒的声音', note: 'admin' },
]);

export const PERSONA_IDS = Object.freeze(Object.keys(PERSONA_VOICES));
export function personaVoice(id) { return PERSONA_VOICES[String(id || '')] || ''; }
export function isPersonaVoice(voice) { const v = String(voice || ''); return v !== '' && Object.values(PERSONA_VOICES).includes(v); }

const cache = new Map();
/** 角色的生效音色：Supabase assistant_persona.voice（若在白名单）→ 表里默认。60s 缓存。 */
export async function resolveVoice(id, env = process.env, fetchImpl = globalThis.fetch) {
  id = String(id || '');
  const fallback = personaVoice(id);
  if (!/^[a-z0-9_-]{1,40}$/.test(id)) return fallback;
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < 60_000) return hit.v;
  const url = String(env.SUPABASE_URL || env.SUPA_URL || '').replace(/\/+$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPA_ANON_KEY || '';
  let v = fallback;
  if (url && key) {
    try {
      const r = await fetchImpl(`${url}/rest/v1/assistant_persona?id=eq.${encodeURIComponent(id)}&select=voice&limit=1`,
        { headers: { apikey: key, authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(3000) });
      const rows = r.ok ? await r.json() : [];
      if (rows[0] && isPersonaVoice(rows[0].voice)) v = rows[0].voice;
    } catch {}
  }
  cache.set(id, { at: Date.now(), v });
  return v;
}
