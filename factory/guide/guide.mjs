// 图书馆管理员 guide: deterministic retrieval over docs/factory-guide.md,
// optional grounded LLM via OpenAI-compatible endpoint (env only). Read-only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const GUIDE_FILE = path.resolve(HERE, '../../docs/factory-guide.md');

export function parseGuide(md = fs.readFileSync(GUIDE_FILE, 'utf8')) {
  const sections = [];
  for (const chunk of md.split(/^## /m).slice(1)) {
    const lines = chunk.split('\n');
    const title = lines[0].trim();
    let keywords = [], links = [];
    const body = [];
    for (const l of lines.slice(1)) {
      if (l.startsWith('关键词:')) keywords = l.slice(4).trim().split(/\s+/).filter(Boolean);
      else if (l.startsWith('链接:')) links = l.slice(3).split(';').map((s) => s.trim()).filter(Boolean)
        .map((s) => { const i = s.indexOf('='); return { label: s.slice(0, i).trim(), href: s.slice(i + 1).trim() }; });
      else body.push(l);
    }
    sections.push({ id: 's' + sections.length, title, keywords, links, body: body.join('\n').trim() });
  }
  return sections;
}

const grams = (s) => {
  const t = String(s).toLowerCase().replace(/[\s\p{P}]+/gu, ' ');
  const out = new Set();
  for (const w of t.split(' ').filter(Boolean)) {
    if (/^[a-z0-9.\-]+$/.test(w)) { out.add(w); continue; }
    for (let i = 0; i < w.length - 1; i++) out.add(w.slice(i, i + 2));
    if (w.length === 1) out.add(w);
  }
  return out;
};

export function retrieve(q, sections, k = 2) {
  const qg = grams(q);
  if (!qg.size) return [];
  return sections.map((s) => {
    let score = 0;
    for (const kw of s.keywords) { const kl = kw.toLowerCase(); if (String(q).toLowerCase().includes(kl)) score += 5; else for (const g of grams(kw)) if (qg.has(g)) score += 2; }
    const tg = grams(s.title), bg = grams(s.body);
    for (const g of qg) { if (tg.has(g)) score += 2; if (bg.has(g)) score += 0.5; }
    return { s, score };
  }).filter((x) => x.score >= 2).sort((a, b) => b.score - a.score).slice(0, k).map((x) => x.s);
}

const WRITE_INTENT = /(帮我|替我|直接)?(付款|支付|充值|下单|提交|批准|删除|执行|购买)/;

export async function answer(q, { env = process.env, fetchImpl = globalThis.fetch, sections = parseGuide() } = {}) {
  const query = String(q || '').slice(0, 500).trim();
  const hits = retrieve(query, sections);
  const guard = WRITE_INTENT.test(query) && /(帮我|替我|直接|你来)/.test(query);
  const top = hits.length ? hits : [sections[0]];
  const links = [...new Map(top.flatMap((s) => s.links).map((l) => [l.href, l])).values()];
  let text = (guard ? '我只负责讲解和带路，不能替你下单、付款、批准或改数据，要你自己去对应页面操作哦。\n\n' : '') +
    (hits.length ? '' : '没找到完全对应的内容，先给你看总览：\n\n') + top.map((s) => `【${s.title}】\n${s.body}`).join('\n\n');
  let source = 'guide';
  if (env.GUIDE_MODEL_API_BASE && env.GUIDE_MODEL_API_KEY && query) {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), Number(env.GUIDE_MODEL_TIMEOUT_MS) || 12000);
    try {
      const r = await fetchImpl(env.GUIDE_MODEL_API_BASE.replace(/\/+$/, '') + '/chat/completions', {
        method: 'POST', signal: ctrl.signal,
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.GUIDE_MODEL_API_KEY },
        body: JSON.stringify({ model: env.GUIDE_MODEL || 'claude-haiku-4-5', max_tokens: 500, temperature: 0.2, messages: [
          { role: 'system', content: '你是 X-connect 工厂的图书馆管理员式导览员，用亲切简洁的中文回答。只能依据下面的导览资料回答，资料里没有的就说不知道。你只讲解和带路，绝不执行写操作、下单或付款。\n\n' + top.map((s) => `## ${s.title}\n${s.body}`).join('\n\n') },
          { role: 'user', content: query }] }),
      });
      const d = await r.json();
      const c = d?.choices?.[0]?.message?.content;
      if (r.ok && c) { text = String(c); source = 'model'; }
    } catch {} finally { clearTimeout(t); }
  }
  return { source, text, sections: top.map((s) => s.title), links };
}
