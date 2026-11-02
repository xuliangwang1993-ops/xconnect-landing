// 滚动摘要层：被上下文预算挤掉的早期轮次不真丢，压成一个结构化摘要跟着走。
//
// 为什么单独成层：总结本身要花一次模型调用，且解析可能失败；把它和打包/守卫解耦，
// 调用方（brain.mjs）只需在预算紧张时问一句"该总结了吗"，失败也只降级不抛错，
// 整个总脑不会因为一次总结失败而安静下来。
//
// 只依赖纯函数 + 注入的 callModel：这一层不碰 HTTP、不读密钥、不写库。

const TRIGGER_RATIO = 0.7;   // 阈值：未压缩历史超过预算 70% 才总结，避免每轮都烧钱
const MAX_ITEMS = 20;        // 每个数组字段上限，摘要本身也不能无限膨胀
const FACT_CHARS = 60;       // 降级时每条摘录长度：够辨认、不占窗口
const MAX_FACT_ITEMS = 12;   // 降级摘录条数上限
const WHO_CHARS = 120;
const ITEM_CHARS = 200;

const FIELD_KEYS = ['who', 'wants', 'promised', 'open', 'facts'];
const ARRAY_KEYS = ['wants', 'promised', 'open', 'facts'];

export const EMPTY_SUMMARY = Object.freeze({ who: '', wants: [], promised: [], open: [], facts: [] });

const LOOSE_SYSTEM = '你是对话摘要器。只根据给定对话做压缩，不许编造、不许推测、不许补充对话里没有的信息。';

/** 字符量：每轮按正文长度 + 一点角色开销，和 packContext 的算法保持一致。 */
function turnsChars(turns) {
  return turns.reduce((n, t) => n + String(t?.text ?? t?.content ?? '').length + 8, 0);
}

/**
 * 是否该做一次总结。
 * 只看未压缩历史的绝对字符量：一旦有摘要伴随，"未压缩"自然只剩新轮次，
 * 不需要再对已压缩部分重复计数。
 * alreadySummarized 只放宽一点门槛（有摘要说明已经在省窗口，更值得继续压），不改变"超预算即压"的上限。
 */
export function shouldSummarize({ turns = [], budgetChars = 0, alreadySummarized = false } = {}) {
  const list = Array.isArray(turns) ? turns : [];
  if (list.length < 2) return false;   // 一两轮没有可压缩的东西
  const budget = Number(budgetChars);
  if (!Number.isFinite(budget) || budget <= 0) return false;
  const chars = turnsChars(list);
  const ratio = alreadySummarized ? TRIGGER_RATIO - 0.1 : TRIGGER_RATIO;
  return chars > budget * ratio;
}

function turnId(t, i) {
  if (t && t.id !== undefined && t.id !== null && t.id !== '') return String(t.id);
  return i; // 没有库 id 就用下标：调用方至少知道"覆盖到第几条"
}

const clip = (s, n) => {
  const v = String(s ?? '').replace(/\s+/g, ' ').trim();
  return v.length > n ? v.slice(0, n) : v;
};

/** 把模型输出里的一串东西收拾成干净的字符串数组。 */
function cleanList(v) {
  const arr = Array.isArray(v) ? v : typeof v === 'string' && v.trim() ? [v] : [];
  return arr
    .map((x) => (typeof x === 'string' ? x : x && typeof x === 'object' ? (x.text ?? x.value ?? x.name ?? '') : ''))
    .map((x) => clip(x, ITEM_CHARS))
    .filter(Boolean);
}

/** 规整任意来源的摘要对象，保证调用方拿到的字段永远齐全、类型永远正确。 */
export function normalizeSummary(src) {
  const o = src && typeof src === 'object' ? src : {};
  const out = { who: clip(typeof o.who === 'string' ? o.who : '', WHO_CHARS) };
  for (const k of ARRAY_KEYS) out[k] = cleanList(o[k]);
  return out;
}

/**
 * 去重键：大小写、全半角标点、空白差异都视为同一件事。
 * 中文不区分大小写，但仍保留英文 ABN / abn 的合并。
 */
function dedupKey(s) {
  return String(s)
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '')
    .replace(/[，。！？、；：,.,!?;:'"“”‘’「」『』()（）\[\]【】·…—–\-_/\\]/g, '');
}

/** 数组去重：后出现的视为更新（保留最新），同一件事只留一条。 */
function uniqLatest(list, max = MAX_ITEMS) {
  const map = new Map();
  for (const item of list) {
    const key = dedupKey(item);
    if (!key) continue;
    map.delete(key); // 先删再插，保持"最新的排在最后"
    map.set(key, item);
  }
  const arr = [...map.values()];
  return arr.length > max ? arr.slice(arr.length - max) : arr;
}

/**
 * 合并上一版与新一版摘要。prev 为空时就是 next 的规整版。
 * who 取最新非空（客户身份一般越聊越准）。
 */
export function mergeSummary(prev, next) {
  const a = normalizeSummary(prev);
  const b = normalizeSummary(next);
  const out = { who: b.who || a.who };
  for (const k of ARRAY_KEYS) out[k] = uniqLatest([...a[k], ...b[k]]);
  return out;
}

/** 模型输出是不是"一句有用的东西都没有"。 */
function isEmpty(s) {
  const n = normalizeSummary(s);
  return !n.who && ARRAY_KEYS.every((k) => n[k].length === 0);
}

/** 从模型文本里抠 JSON：容忍 ```json 围栏、前后解释文字。 */
function extractJson(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const body = fence ? fence[1].trim() : raw;
  const tries = [body];
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start >= 0 && end > start) tries.push(body.slice(start, end + 1));
  for (const t of tries) {
    try {
      const v = JSON.parse(t);
      if (v && typeof v === 'object' && !Array.isArray(v)) return v;
    } catch {}
  }
  return null;
}

/**
 * 降级摘要：模型没给 JSON / 给了空 / 直接抛错时走这里。
 * 只做机械摘录——每条早期发言截前 60 字进 facts，不加任何推断，宁可贫瘠也不编造。
 * 这是硬要求：summarize 永远不抛错、永远不返回 null。
 */
function fallbackSummary(turns) {
  const facts = [];
  for (const t of turns) {
    const text = clip(t?.text ?? t?.content ?? '', FACT_CHARS);
    if (!text) continue;
    facts.push(text);
    if (facts.length >= MAX_FACT_ITEMS) break;
  }
  return { who: '', wants: [], promised: [], open: [], facts };
}

function buildUser(turns, prevSummary) {
  const prev = prevSummary && !isEmpty(prevSummary) ? prevSummary : null;
  const lines = turns.map((t) => {
    const who = t?.role === 'user' ? '客户' : t?.role === 'assistant' ? '小助手' : '系统';
    return `${who}：${clip(t?.text ?? t?.content ?? '', 1500)}`;
  }).filter((l) => !/：$/.test(l));
  return [
    prev ? `已有摘要（在此基础上更新，别丢要点）：\n${JSON.stringify(normalizeSummary(prev))}\n` : '',
    '待压缩的早期对话（从早到晚）：',
    lines.join('\n') || '（空）',
    '',
    '只输出一个 JSON 对象，键名用双引号：',
    '{"who": "客户是谁/公司", "wants": ["要什么"], "promised": ["小助手已承诺过什么"], "open": ["还没解决的待办"], "facts": ["关键事实，如 ABN、金额、日期等原话摘录"]}',
    '规则：只根据上述对话证据，不许编造；没有的字段给空数组。',
  ].filter(Boolean).join('\n');
}

/**
 * 压缩一段早期轮次。
 * @returns {Promise<{summary: object, coveredUpTo: string|number|null, chars: number, degraded: boolean}>}
 * coveredUpTo 是最后一条被压缩轮次的 id（无 id 时用数组下标），调用方据此裁剪历史。
 */
export async function summarize({ turns = [], callModel, prevSummary = null } = {}) {
  const list = Array.isArray(turns) ? turns : [];
  const last = list.length ? list[list.length - 1] : null;
  const coveredUpTo = list.length ? turnId(last, list.length - 1) : null;

  if (!list.length) {
    // 没有新内容：原样交回上一版，别让调用方把已有摘要清空
    const kept = isEmpty(prevSummary) ? { ...EMPTY_SUMMARY } : normalizeSummary(prevSummary);
    return { summary: mergeSummary(null, kept), coveredUpTo, chars: 0, degraded: false };
  }
  if (typeof callModel !== 'function') {
    const summary = mergeSummary(prevSummary, fallbackSummary(list));
    return { summary, coveredUpTo, chars: JSON.stringify(summary).length, degraded: true };
  }

  let parsed = null;
  let degraded = false;
  try {
    const raw = await callModel({ system: LOOSE_SYSTEM, user: buildUser(list, prevSummary) });
    parsed = extractJson(raw);
  } catch {
    parsed = null; // 超时/上游报错：和"没给 JSON"同等对待
  }
  if (!parsed || isEmpty(parsed)) {
    degraded = true;
    parsed = fallbackSummary(list);
  }
  const summary = mergeSummary(prevSummary, parsed);
  return { summary, coveredUpTo, chars: JSON.stringify(summary).length, degraded };
}

/** 给主提示词用的中文文本块；没有任何内容时返回空串（调用方可直接拼）。 */
export function formatForPrompt(summary) {
  if (!summary) return '';
  const s = normalizeSummary(summary);
  const parts = [];
  if (s.who) parts.push(`谁：${s.who}`);
  if (s.wants.length) parts.push(`要什么：${s.wants.join('；')}`);
  if (s.promised.length) parts.push(`已承诺：${s.promised.join('；')}`);
  if (s.open.length) parts.push(`待办：${s.open.join('；')}`);
  if (s.facts.length) parts.push(`关键事实：${s.facts.join('；')}`);
  if (!parts.length) return '';
  return `【早前对话摘要（已压缩，原文仍在库里）】${parts.join('；')}`;
}
