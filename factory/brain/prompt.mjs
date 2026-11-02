// 总脑（诸葛亮式第三方观察者）的提示词与结构化输出解析。
//
// 约束（产品硬要求）：
//  - 冷静中立，不带情绪，只看对话里的规律；
//  - reply_suggestion 以小助手口吻说出来，不暴露“总脑”；它的作用是当嘴，不独立对话；
//  - 只依据对话证据下结论，对话里没有的不许编；
//  - 输出严格 JSON，解析失败也不抛错，退化为空结构，由调用方决定退回小助手。

export const BRAIN_SCHEMA_VERSION = 1;

export const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const MAX_EVIDENCE = 3;

export const SYSTEM_PROMPT = `你是 X-connect 的「总脑」，一位冷静的第三方观察者。你不直接对客户说话，也不带情绪；你看的是一段客户与小助手之间的真实对话记录，只从对话里找规律、找需求、想下一步。

铁律：
1. 只根据对话证据下结论。证据 = 客户或小助手原话，必须能在对话里逐字找到。
2. 不准编造：对话没提到的需求、时间、价格、人物、承诺，一个字都不许出现在输出里。信息不够就少给结论，或给低置信度。
3. 不复述对话，不猜心情。你只回答：客户要什么、该怎么回、下一步该做什么。
4. 不替小助手聊天：reply_suggestion 是一句可以直接说出口的话，用这位小助手自己的口吻，简短自然，不写「作为总脑」「我已经分析」之类的话。
5. 不确定就留空。空数组比编造更好。

第一句就必须是 {，直接输出 JSON：不要思考过程、不要 Markdown 代码块、不要在 JSON 前后写任何解释。字段：
{
  "reply_suggestion": "给小助手的下一句回复（中文，1-3 句；若对话不足以回复则空字符串）",
  "tasks": [{"title": "任务标题（动词开头，20 字内）", "detail": "要做什么、给谁做，写清楚依据", "priority": "low|normal|high|urgent"}],
  "follow_up_questions": [{"question": "主动追问客户的一句话（像是把他刚才说的整理了一下再问）", "basis": "对话里支持这个追问的原话"}],
  "needs": [{"need": "发现的需求（客户想要什么）", "evidence": "客户原话（逐字摘录，最多两句）", "confidence": 0.0-1.0}]
}
各数组最多 3 条，没有就给 []。`;

export function buildMessages({ turns = [], assistants = {}, lang = 'zh', intent = 'turn' } = {}) {
  const lines = turns.map((t) => {
    const who = t.role === 'user' ? '客户' : `小助手${t.assistant ? `(${t.assistant})` : ''}`;
    return `${who}：${String(t.text || '').slice(0, 800)}`;
  }).join('\n');
  const names = Object.entries(assistants || {}).map(([id, name]) => `${id}=${name}`).join('，');
  const head = intent === 'proactive'
    ? '这是对话停顿时的回看。请判断：有没有值得主动问一句的东西（比如把客户刚才零散说的要求整理成一句确认）。没有就返回空数组，不要为了说话而说话。'
    : '这是客户刚说完一轮、小助手还没来得及回复。请给出小助手现在该说的那句话。';
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `${head}\n界面语言：${lang}${names ? `\n在场小助手：${names}` : ''}\n\n对话记录（从早到晚）：\n${lines || '（空）'}`,
    },
  ];
}

const clampStr = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const asArray = (v) => (Array.isArray(v) ? v : []);

// 中文引号统一成 ASCII 引号：模型经常在 JSON 字符串里用 “ ” 或「」，直接 JSON.parse 会炸。
const unifyQuotes = (s) => s.replace(/[“”„‟]/g, '"').replace(/[「」]/g, '"').replace(/，(?=\s*")/g, ',');

/** 从模型输出里抠出 JSON：允许 ```json 包裹、前后带解释、中文引号、unicode 转义。 */
export function extractJson(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const body = unifyQuotes(fence ? fence[1] : raw);
  const tries = [body];
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start >= 0 && end > start) tries.push(body.slice(start, end + 1));
  for (const t of tries) {
    try { return JSON.parse(t); } catch {}
    try { return JSON.parse(t.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))); } catch {}
  }
  // 最后一层：模型把 JSON 写成了"key: 值"的伪结构（不带引号、不转义），按字段名抠。
  if (/reply_suggestion|follow_up_questions|needs|tasks/.test(body)) return salvage(body);
  return null;
}

/** 兜底：从自由文本里按字段名捞内容。宁可少，不可编。 */
function salvage(body) {
  const grab = (key, len = 400) => {
    const m = new RegExp(`${key}\\s*["']?\\s*[:：]\\s*["']?([\\s\\S]{0,${len}}?)["']?\\s*(?:,|\\n\\s*[a-z_]+\\s*[:：]|\\}|$)`, 'i').exec(body);
    return m ? m[1].trim().replace(/^["'\s]+|["'\s]+$/g, '') : '';
  };
  const reply = grab('reply_suggestion') || grab('reply');
  const question = grab('question');
  const need = grab('need');
  const evidence = grab('evidence') || grab('basis');
  return {
    reply_suggestion: reply,
    tasks: [],
    follow_up_questions: question ? [{ question, basis: evidence }] : [],
    needs: need ? [{ need, evidence: evidence ? [evidence] : [], confidence: 0.5 }] : [],
  };
}

/** 结构化输出 → 干净对象。永不抛错：坏数据只会变成空字段。 */
export function normalizeBrain(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const reply = clampStr(o.reply_suggestion ?? o.reply, 600);
  const tasks = asArray(o.tasks).map((t) => ({
    title: clampStr(t && t.title, 120),
    detail: clampStr(t && (t.detail ?? t.description), 800),
    priority: PRIORITIES.includes(t && t.priority) ? t.priority : 'normal',
  })).filter((t) => t.title).slice(0, 3);
  const followUps = asArray(o.follow_up_questions ?? o.follow_ups).map((q) => ({
    question: clampStr(typeof q === 'string' ? q : q && (q.question ?? q.text), 300),
    basis: clampStr(q && typeof q === 'object' ? q.basis : '', 400),
  })).filter((q) => q.question).slice(0, 3);
  const needs = asArray(o.needs).map((n) => {
    const c = Number(n && (n.confidence ?? 0));
    const ev = asArray(n && n.evidence);
    return {
      need: clampStr(n && n.need, 300),
      evidence: ev.length ? ev.map((e) => clampStr(e, 400)).filter(Boolean).slice(0, MAX_EVIDENCE) : [clampStr(n && n.evidence, 400)].filter(Boolean),
      confidence: Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : 0,
    };
  }).filter((n) => n.need).slice(0, 3);
  return { reply_suggestion: reply, tasks, follow_up_questions: followUps, needs };
}

export function parseBrainText(text) {
  return normalizeBrain(extractJson(text));
}

/** 需求去重指纹：忽略标点空白，取前 40 个字符做稳定键。 */
export function fingerprint(s) {
  return String(s || '').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '').slice(0, 40);
}
