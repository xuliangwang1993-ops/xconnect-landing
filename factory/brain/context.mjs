// 上下文打包：把"一段对话"装进模型窗口。
//
// Kimi 的价值是 100 万 token 的超长上下文，但历史一度只喂最近 24 轮、每条截 800 字，
// 等于把长上下文扔了。这里改成：
//  - 预算按字符给（缺省 600k 字符 ≈ 240k tokens，离 1M 还有很大余量）；
//  - 从最新往前装，装不下就截断最早那条，并显式标出"更早的部分已省略 N 轮"；
//  - 保留每条的完整发言（不再粗暴截 800 字），只有单条超长时才截。
// 不做摘要、不猜：省略就明说省略。

import { assignTopics, selectTopics, describeTopics } from './layers/topics.mjs';
import { extractEntities, mergeEntities, retrieveRelevant, formatForPrompt as fmtEntities } from './layers/entities.mjs';
import { formatForPrompt as fmtSummary } from './layers/summary.mjs';

export const DEFAULT_CONTEXT_CHARS = Number(process.env.BRAIN_CONTEXT_CHARS) || 600_000;
const PER_TURN_CAP = 20_000; // 单条上限：一段客户口述再长也不至于 2 万字

export function packContext(turns = [], { budgetChars = DEFAULT_CONTEXT_CHARS } = {}) {
  const list = turns.map((t) => ({
    role: t.role === 'user' ? 'user' : 'assistant',
    assistant: t.assistant || t.assistant_id || '',
    text: String(t.text ?? t.content ?? '').slice(0, PER_TURN_CAP),
  })).filter((t) => t.text);
  let used = 0;
  const kept = [];
  let dropped = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    const t = list[i];
    const cost = t.text.length + 8;
    if (used + cost > budgetChars) { dropped = i + 1; break; }
    used += cost;
    kept.push(t);
  }
  kept.reverse();
  return { turns: kept, dropped, chars: used, budgetChars, omittedNote: dropped ? `（更早的 ${dropped} 轮已省略）` : '' };
}


/**
 * 三层装配：话题切分（C）决定装哪段，实体记忆（B）补事实，摘要（A）补被省略的早期内容。
 * 默认关闭 —— 传 opts.layers = { topics, entities, summary } 才启用，
 * 保证线上行为在打开之前一个字节都不变。
 *
 * @returns {Promise<{turns, dropped, chars, budgetChars, omittedNote, extra}>}
 *   extra 是要拼进 system 提示的附加块（记忆 + 摘要），空串表示没有。
 */
export async function packWithLayers(turns = [], {
  budgetChars = DEFAULT_CONTEXT_CHARS,
  query = '',
  summary = null,
  layers = {},
} = {}) {
  const base = packContext(turns, { budgetChars });
  const extra = [];
  let out = base;

  if (layers.topics) {
    const t = assignTopics(turns).topics;
    const tt = assignTopics(turns).turnTopic;
    if (t.length > 1) {
      const idx = selectTopics(t, tt, { activeTopicId: t.length - 1, budgetChars, turns });
      // 只在切分真的省下内容时才采用，否则退回老逻辑，避免规则误切把上下文弄丢
      if (idx.length && idx.length < turns.length) {
        out = packContext(idx.map((i) => turns[i]), { budgetChars });
        out.omittedNote = `（${describeTopics(t)}）`;
      }
    }
  }
  if (layers.entities) {
    const es = mergeEntities([], extractEntities(turns));
    const q = query || turns.slice(-2).map((x) => x.text || '').join(' ');
    let picked = retrieveRelevant(es, q, { limit: 6 });
    // 检索是按字面重叠打分的：当前话题和早期事实用词不同时会是 0 条。
    // 这时候退一步，按"最近出现"带上几条 —— 记得少，好过完全失忆。
    if (!picked.length && es.length) picked = [...es].slice(-6);
    const block = fmtEntities(picked);
    if (block) extra.push(block);
  }
  if (layers.summary && summary) {
    const block = fmtSummary(summary);
    if (block) extra.push(block);
  }
  return { ...out, extra: extra.join('\n\n') };
}
