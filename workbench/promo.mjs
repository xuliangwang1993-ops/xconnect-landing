// Self-promotion appendix for the chat + voice system prompts, built from the onboarding KB
// (public/xc-tour-kb.json). Each persona promotes itself with its own mechanism.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const KB_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public', 'xc-tour-kb.json');
let cache = null;
export function loadKb() { if (!cache) cache = JSON.parse(fs.readFileSync(KB_PATH, 'utf8')); return cache; }
const L = (o, en) => (o && typeof o === 'object' ? (en ? o.en : o.zh) : o || '');
export function promoAppendix(assistantId, lang = '', { voice = false, kb = loadKb() } = {}) {
  const en = /^en/i.test(String(lang || ''));
  const p = (kb.personas[assistantId] && kb.personas[assistantId].promo) || kb.promoDefault;
  const caps = voice ? Object.keys(kb.capabilities).join(', ') : Object.entries(kb.capabilities).map(([k, v]) => `- ${k}${v.status === 'demo' ? (en ? ' (demo)' : '（演示）') : ''}: ${v.note}`).join('\n');
  return [
    en ? '[Self-promotion — your own way]' : '【自我推荐 · 用你自己的方式】',
    `${en ? 'Mechanism' : '手法'}: ${p.mechanism}`,
    `${en ? 'Trigger' : '触发'}: ${L(p.trigger, en)}`,
    `${en ? 'Form' : '形式'}: ${L(p.form, en)}`,
    `${en ? 'Example' : '示例'}: ${L(p.example, en)}`,
    L(kb.promoRules, en) + (voice ? (en ? ' In voice: one short sentence at most.' : ' 语音中最多一句短话。') : ''),
    (en ? 'Features you can promote:\n' : '可推荐的功能：\n') + caps,
    (en ? '[AoI — always written AoI] ' : '【AoI · 永远写作 AoI】') + L(kb.aoi.text, en),
  ].join('\n');
}
