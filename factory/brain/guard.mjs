// 证据守卫：模型说人话的时候，最容易冒出来的就是"它自己编的数字"。
//
// 实测（claude-haiku，2026-11-02）：客户只说"预算别超过一万块"，模型回了
// "3 条 8000 块、先付 50% 定金 4000、下周一给初稿"。价格和交期全是它自己加的。
//
// 这里不试图理解语义，只做一件硬事：凡是出现"具体金额 / 具体星期或日期"的句子，
// 必须能在对话原文里逐字找到同类数字，否则这一项不算数。宁可少给，不可编造。

// 金额：数字后面跟钱单位，或钱符号在前。故意不抓单个"万"字（"一万块以内"没问题，"3 万"要抓）。
const MONEY = /(?:¥|￥|\$)\s*\d[\d,.]*|\d[\d,.]*\s*(?:块|元|澳元|美元|万块|千块|万元)/g;
const WHEN = /(?:周[一二三四五六日天]|星期[一二三四五六日天]|明天|后天|今天|今晚|下周[一二三四五六日天]?|[0-9]{1,2}月[0-9]{1,2}[日号]?|[0-9]{1,2}[日号])/g;
const PCT = /\d+(?:\.\d+)?\s*%|百分之[一二三四五六七八九十\d]+/g;

function numbersOf(text, re) {
  const out = new Set();
  for (const m of String(text || '').matchAll(re)) out.add(m[0].replace(/\s+/g, ''));
  return out;
}

/** 这句话里有没有"对话没给过的具体承诺"。 */
export function unsupportedClaim(sentence, evidenceText) {
  const ev = String(evidenceText || '');
  for (const [re, label] of [[MONEY, '金额'], [PCT, '比例'], [WHEN, '时间']]) {
    for (const tok of numbersOf(sentence, re)) {
      if (!ev.includes(tok) && !ev.includes(tok.replace(/[,\s]/g, ''))) return { token: tok, kind: label };
    }
  }
  return null;
}

const splitSentences = (s) => String(s || '').split(/(?<=[。！？!?\n])/).map((x) => x.trim()).filter(Boolean);

/**
 * 把一段回复/追问洗成"只保留有证据的部分"。
 * @returns {{ text: string, dropped: Array<{text:string, token:string, kind:string}> }}
 */
export function scrub(text, evidenceText) {
  const dropped = [];
  const kept = [];
  for (const s of splitSentences(text)) {
    const bad = unsupportedClaim(s, evidenceText);
    if (bad) dropped.push({ text: s, ...bad });
    else kept.push(s);
  }
  return { text: kept.join(''), dropped };
}

/** 对整个总脑结论做一次守卫：回复建议、追问、任务说明都要过。 */
export function guardResult(result, evidenceText) {
  if (!result) return { result, dropped: [] };
  const out = { ...result };
  const dropped = [];
  if (out.reply_suggestion) {
    const r = scrub(out.reply_suggestion, evidenceText);
    out.reply_suggestion = r.text.trim();
    dropped.push(...r.dropped);
  }
  out.follow_up_questions = (out.follow_up_questions || []).flatMap((q) => {
    const r = scrub(q.question, evidenceText);
    if (r.dropped.length && !r.text.trim()) { dropped.push(...r.dropped.map((d) => ({ ...d, from: 'question' }))); return []; }
    return [{ ...q, question: r.text.trim() }];
  });
  out.tasks = (out.tasks || []).map((t) => {
    const r = scrub(t.detail || '', evidenceText);
    return { ...t, detail: r.text.trim() };
  });
  return { result: out, dropped };
}
