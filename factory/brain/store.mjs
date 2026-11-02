// 总脑存储：brain_turns / brain_needs / brain_replies / brain_settings。
// 配有 SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY 时走 Supabase（写操作需要
// service role，表上只给 anon SELECT）；缺任一项退化为内存，demo 仍可跑。
// 表结构见 workbench/migrations/20261102_brain.sql。

const clamp = (s, n) => String(s ?? '').slice(0, n);

export function createBrainStore({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const url = (env.SUPABASE_URL || env.SUPA_URL || '').replace(/\/+$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY || '';
  const live = !!(url && key);
  const mem = { turns: [], needs: [], replies: [], settings: new Map(), deliveries: [] };
  let seq = 0;
  const id = (p) => `${p}-${(++seq).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  const h = {
    apikey: key,
    authorization: `Bearer ${key}`,
    'content-type': 'application/json',
    prefer: 'return=representation',
  };

  async function rest(path, init = {}) {
    const r = await fetchImpl(`${url}/rest/v1/${path}`, { ...init, headers: { ...h, ...(init.headers || {}) } });
    const t = await r.text();
    if (!r.ok) throw new Error(`supabase ${r.status}: ${t.slice(0, 200)}`);
    return t ? JSON.parse(t) : [];
  }

  return {
    mode: live ? 'supabase' : 'memory',

    async addTurn(t) {
      const row = {
        session_id: clamp(t.sessionId, 80),
        role: t.role === 'assistant' ? 'assistant' : 'user',
        text: clamp(t.text, 4000),
        assistant_id: t.assistantId ? clamp(t.assistantId, 40) : null,
        at: t.at ? new Date(t.at).toISOString() : new Date().toISOString(),
      };
      if (!row.session_id || !row.text) { const e = new Error('session_id and text required'); e.status = 400; throw e; }
      if (!live) {
        const cur = { id: id('bt'), created_at: new Date().toISOString(), ...row };
        mem.turns.push(cur);
        return cur;
      }
      const out = await rest('brain_turns', { method: 'POST', body: JSON.stringify(row) });
      return out[0];
    },

    async history(sessionId, limit = 40) {
      if (!live) {
        return mem.turns.filter((t) => t.session_id === sessionId).slice(-limit)
          .map((t) => ({ role: t.role, text: t.text, assistant_id: t.assistant_id, at: t.at }));
      }
      const p = `brain_turns?session_id=eq.${encodeURIComponent(sessionId)}&select=role,text,assistant_id,at&order=at.desc&limit=${limit}`;
      return (await rest(p)).reverse();
    },

    /** 需求按 (session_id, fingerprint) 去重：已有就更置信度与证据，不重复插。 */
    async upsertNeed(n) {
      const row = {
        session_id: clamp(n.sessionId, 80),
        need: clamp(n.need, 300),
        evidence: n.evidence || [],
        confidence: Math.min(1, Math.max(0, Number(n.confidence) || 0)),
        fingerprint: clamp(n.fingerprint, 60),
        status: 'open',
      };
      if (!live) {
        const hit = mem.needs.find((x) => x.session_id === row.session_id && x.fingerprint === row.fingerprint);
        if (hit) {
          hit.confidence = Math.max(hit.confidence, row.confidence);
          hit.evidence = [...new Set([...(hit.evidence || []), ...(row.evidence || [])])].slice(0, 6);
          hit.updated_at = new Date().toISOString();
          return hit;
        }
        const cur = { id: id('bn'), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...row };
        mem.needs.push(cur);
        return cur;
      }
      const found = await rest(`brain_needs?session_id=eq.${encodeURIComponent(row.session_id)}&fingerprint=eq.${encodeURIComponent(row.fingerprint)}&select=*&limit=1`);
      if (found[0]) {
        const prev = found[0];
        const merged = {
          confidence: Math.max(Number(prev.confidence) || 0, row.confidence),
          evidence: [...new Set([...(prev.evidence || []), ...row.evidence])].slice(0, 6),
          updated_at: new Date().toISOString(),
        };
        return (await rest(`brain_needs?id=eq.${encodeURIComponent(prev.id)}`, { method: 'PATCH', body: JSON.stringify(merged) }))[0];
      }
      return (await rest('brain_needs', { method: 'POST', body: JSON.stringify(row) }))[0];
    },

    /** 客户确认 = 最硬的证据：可一并把置信度拉满。状态只升不降（不回退成 open）。 */
    async setNeedStatus(needId, status, extra = {}) {
      const allowed = ['open', 'confirmed', 'dismissed', 'converted'];
      if (!allowed.includes(status)) { const e = new Error('bad status'); e.status = 400; throw e; }
      const patch = { status, updated_at: new Date().toISOString() };
      if (extra.confidence !== undefined) patch.confidence = Math.min(1, Math.max(0, Number(extra.confidence) || 0));
      if (!live) {
        const hit = mem.needs.find((x) => x.id === needId);
        if (!hit) { const e = new Error('not found'); e.status = 404; throw e; }
        if (!(hit.status !== 'open' && status === 'open')) Object.assign(hit, patch);
        return hit;
      }
      const out = await rest(`brain_needs?id=eq.${encodeURIComponent(needId)}`, { method: 'PATCH', body: JSON.stringify(patch) });
      if (!out[0]) { const e = new Error('not found'); e.status = 404; throw e; }
      return out[0];
    },

    async getNeed(needId) {
      if (!live) return mem.needs.find((x) => x.id === needId) || null;
      const out = await rest(`brain_needs?id=eq.${encodeURIComponent(needId)}&select=*&limit=1`);
      return out[0] || null;
    },

    async listNeeds({ status, limit = 100 } = {}) {
      if (!live) {
        return mem.needs
          .filter((n) => !status || n.status === status)
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, limit);
      }
      const q = `brain_needs?select=*&order=confidence.desc,updated_at.desc&limit=${limit}` + (status ? `&status=eq.${status}` : '');
      return rest(q);
    },

    /** 强档结论的送达箱：服务端算完先落这里，前端轮询取走（跨实例也不丢）。 */
    async addDelivery(d) {
      const row = { session_id: clamp(d.sessionId, 80), kind: 'strong', payload: d.payload, created_at: new Date().toISOString() };
      if (!live) { mem.deliveries.push({ id: 'dl-' + mem.deliveries.length, taken: false, ...row }); return row; }
      try { return (await rest('brain_replies', { method: 'POST', body: JSON.stringify({ session_id: row.session_id, kind: 'strong', reply: String(d.payload?.reply || '').slice(0, 1000), latency_ms: Number(d.payload?.latencyMs) || 0, used: 'brain', reason: 'deliver' }) }))[0]; } catch { return row; }
    },

    async logReply(r) {
      const row = {
        session_id: clamp(r.sessionId, 80),
        kind: r.kind === 'proactive' ? 'proactive' : 'turn',
        reply: clamp(r.reply, 1000),
        latency_ms: Math.max(0, Math.round(Number(r.latencyMs) || 0)),
        used: r.used ? 'brain' : 'fallback',
        reason: r.reason ? clamp(r.reason, 120) : null,
      };
      if (!live) { mem.replies.push(row); return row; }
      try { return (await rest('brain_replies', { method: 'POST', body: JSON.stringify(row) }))[0]; } catch { return null; }
    },

    async settings() {
      if (!live) return { proactive: mem.settings.get('proactive') !== false };
      const out = await rest('brain_settings?select=key,value');
      const m = Object.fromEntries(out.map((r) => [r.key, r.value]));
      return { proactive: m.proactive !== false };
    },

    async setSetting(k, v) {
      if (!live) { mem.settings.set(k, v); return { key: k, value: v }; }
      const out = await rest('brain_settings', {
        method: 'POST',
        headers: { prefer: 'return=representation,resolution=merge-duplicates' },
        body: JSON.stringify({ key: k, value: v, updated_at: new Date().toISOString() }),
      });
      return out[0];
    },
  };
}
