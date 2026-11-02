// 上下文打包：把"一段对话"装进模型窗口。
//
// Kimi 的价值是 100 万 token 的超长上下文，但历史一度只喂最近 24 轮、每条截 800 字，
// 等于把长上下文扔了。这里改成：
//  - 预算按字符给（缺省 600k 字符 ≈ 240k tokens，离 1M 还有很大余量）；
//  - 从最新往前装，装不下就截断最早那条，并显式标出"更早的部分已省略 N 轮"；
//  - 保留每条的完整发言（不再粗暴截 800 字），只有单条超长时才截。
// 不做摘要、不猜：省略就明说省略。

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
