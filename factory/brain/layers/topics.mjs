// 话题切分：给每一轮打 topic_id，让装配上下文能"只装相关话题"。
//
// 为什么不用模型：切话题只是"划账本"的第一步，它必须永远成功、永远在几毫秒内返回、
// 并且事后能人肉复盘"为什么这里切了"。所以只用三条能一句话讲清的规则：
//   a) 时间断点——隔了 idleGapMs 没说话，回来多半是新事（隔夜、隔周）；
//   b) 显式标记——"另外 / 对了 / 换个话题"是客户自己给的分号；
//   c) 长度保护——单个话题超过 MAX_TOPIC_TURNS 轮就强制切，否则半个月的话题
//      会变成一个吃满整个窗口的巨无霸，等于没切。
// 规则错了也只是"多装/少装几轮"，不会让这一轮崩掉：任何输入都返回合法结构。

// 单个话题上限：20 轮已经够讲清一件事，40 轮是"再长就明显串味"的止损线。
export const MAX_TOPIC_TURNS = 40;
export const DEFAULT_IDLE_GAP_MS = 30 * 60 * 1000;

// 客户口语里最像"换台"的词。只收高频短词，长句靠注释说明为什么要去掉：
// "还有"太常用（"还有多少钱"不是新话题），"然后"是连接词，所以都不收。
const TOPIC_BREAK_MARKERS = ['另外', '对了', '换个话题', '换一个话题', '换个问题', '顺便问一下', '顺便问一句', '还有个事', '还有件事', '再说一个'];

// 关键词取词：不引分词库，用"连续汉字串 + 二元组"计数。
// 只用二元组：单字噪声太大（"我/的/了"），三字以上又切不出来；二元组足够看出"发票""视频"。
const HAN_RUN = /[\u4e00-\u9fa5]{2,}/g;
const STOP_WORDS = new Set(['这个', '那个', '什么', '怎么', '可以', '我们', '你们', '他们', '一下', '一个', '现在', '时候', '就是', '不是', '没有', '还是', '然后', '因为', '所以', '如果', '但是', '已经', '可能', '需要', '应该', '知道', '觉得', '看看', '帮我', '麻烦', '谢谢', '好的', '收到', '这样', '那样', '多少', '这些', '那些', '这里', '那里', '时候']);
const MAX_KEYWORDS = 4;
const MIN_KEYWORDS = 2;

const textOf = (t) => String(t?.text ?? t?.content ?? '');
const atOf = (t, fallback) => {
  const v = t?.at ?? t?.created_at ?? t?.ts ?? t?.time;
  if (v == null) return fallback;
  if (typeof v === 'number') return Number.isFinite(v) ? v : fallback;
  const ms = Date.parse(String(v));
  return Number.isFinite(ms) ? ms : fallback;
};

// 时间只给上界：没带时间戳的轮次沿用游标，绝不当成"隔了很久"去乱切。
function spanOf(turns, now, idleGapMs) {
  let cursor = null;
  return turns.map((t) => {
    const ms = atOf(t, cursor);
    cursor = ms;
    return ms;
  }).map((ms, i) => {
    if (ms != null) return ms;
    // 整段都没有时间：按轮次倒推（每轮算 1 分钟），保证仍有可解释的时间轴。
    return now - (turns.length - i) * 60_000;
  });
}

function hasBreakMarker(text) {
  if (!text) return false;
  // 只看第一句（遇到标点即止，最多 12 字）：说话人通常一上来就报"另外…"，
  // 句中夹带的"另外"是修辞，不是换台。
  const head = String(text).trim().split(/[，,。.！!？?；;\n]/)[0].slice(0, 12);
  return TOPIC_BREAK_MARKERS.some((m) => head.includes(m));
}

// 词频：汉字串切二元组，去掉停用词，按 (次数, 长度, 先后) 排序稳定取前 4。
// 目标 2-4 个词：出现 ≥2 次的词优先；不够 2 个时放宽到"出现 1 次但整段唯一"的词
// （短对话里"发票"这类词常常只出现一次），保证 label 不是空的也不是一整句话。
function countBigrams(texts) {
  const freq = new Map();
  const firstAt = new Map();
  for (const text of texts) {
    const runs = String(text || '').match(HAN_RUN) || [];
    for (const run of runs) {
      for (let i = 0; i + 2 <= run.length; i++) {
        const w = run.slice(i, i + 2);
        if (STOP_WORDS.has(w)) continue;
        if (!freq.has(w)) firstAt.set(w, firstAt.size);
        freq.set(w, (freq.get(w) || 0) + 1);
      }
    }
  }
  return { freq, firstAt };
}

function extractKeywords(texts) {
  const { freq, firstAt } = countBigrams(texts);
  const rank = (a, b) => b[1] - a[1] || b[0].length - a[0].length || firstAt.get(a[0]) - firstAt.get(b[0]);
  const strong = [...freq.entries()].filter(([, n]) => n >= 2).sort(rank).map(([w]) => w);
  // 高频词之间去重叠：字符集相同（"发票"/"票发"）或互为子串（"细节"/"节细"）只留排名靠前的
  // 滑窗碎片的问题：中文里相邻 bigram 往往只差一个字（发票/票抬/抬头）。
  // 只要和一个已选词有一个字相同、且词长差不多，就算同一个词，跳过。
  const overlap = (a, b) => {
    if (a.includes(b) || b.includes(a)) return true;
    let same = 0;
    for (const ch of new Set(b)) if (a.includes(ch)) same += 1;
    return same >= Math.min(2, Math.max(1, Math.floor(b.length / 2))); // 2 字词：只要共享 1 个字也算
  };
  const picked = [];
  // 长词优先：先按长度降序，再按词频
  const byLen = [...strong].sort((a, b) => b.length - a.length || freq.get(b) - freq.get(a));
  for (const w of byLen) {
    if (picked.some((x) => overlap(x, w))) continue;
    picked.push(w);
    if (picked.length >= MAX_KEYWORDS) break;
  }
  if (picked.length >= MIN_KEYWORDS) return picked;
  const weak = [...freq.entries()].filter(([, n]) => n === 1).sort(rank).map(([w]) => w);
  // 去重叠：加了"发票"就不再要"票抬"，避免 label 变成一串滑窗碎片。
  const out = [...picked];
  for (const w of weak) {
    if (out.length >= MIN_KEYWORDS) break;
    if (out.some((x) => overlap(x, w))) continue;
    out.push(w);
  }
  return out.slice(0, MAX_KEYWORDS);
}

function labelFor(texts, startIndex, endIndex) {
  const words = extractKeywords(texts);
  if (words.length >= MIN_KEYWORDS) return words.join('、');
  // 关键词不足时退化为"首轮开场白"，保证有东西可读，而不是空标签。
  const open = String(texts[0] || '').replace(/\s+/g, ' ').trim().slice(0, 16);
  if (open) return words.length ? `${words.join('、')}｜${open}` : open;
  return `第${startIndex}-${endIndex}轮`;
}

/**
 * 把一串轮次切成话题。
 * @returns {{ topics: {id:string,startIndex:number,endIndex:number,label:string}[], turnTopic: number[] }}
 *   turnTopic[i] 是第 i 轮所属话题的下标（0 起，也是话题 id 的序号）。
 */
export function assignTopics(turns = [], { idleGapMs = DEFAULT_IDLE_GAP_MS, now = Date.now } = {}) {
  const list = Array.isArray(turns) ? turns : [];
  const topics = [];
  const turnTopic = [];
  if (!list.length) return { topics, turnTopic };

  const gap = Number.isFinite(Number(idleGapMs)) && Number(idleGapMs) > 0 ? Number(idleGapMs) : DEFAULT_IDLE_GAP_MS;
  const nowMs = typeof now === 'function' ? Number(now()) : Number(now);
  const times = spanOf(list, Number.isFinite(nowMs) ? nowMs : Date.now(), gap);

  let cur = -1;
  for (let i = 0; i < list.length; i++) {
    const reason = cur < 0 ? 'start'
      : times[i] - times[i - 1] > gap ? 'idle'          // a) 时间断点
      : hasBreakMarker(textOf(list[i])) ? 'marker'      // b) 显式换台
      : i - topics[cur].startIndex >= MAX_TOPIC_TURNS ? 'len' // c) 长度保护
      : '';

    if (reason) {
      cur = topics.length;
      topics.push({
        id: `topic-${cur + 1}`,
        startIndex: i,
        endIndex: i,
        label: '',
        reason,            // 便于人肉复盘"为什么切在这里"，不参与装配
        startAt: times[i] != null ? new Date(times[i]).toISOString() : null,
      });
    } else {
      topics[cur].endIndex = i;
    }
    turnTopic.push(cur);
  }

  for (const t of topics) {
    t.label = labelFor(list.slice(t.startIndex, t.endIndex + 1).map(textOf), t.startIndex + 1, t.endIndex + 1);
  }
  return { topics, turnTopic };
}

const costOf = (turns, i) => Math.max(1, textOf(turns[i]).length + 8);

/**
 * 按话题挑轮次下标，返回升序下标数组。
 * 当前话题全要；相关话题从新到旧装，装不下就停（不做"装一半"的拼接）。
 */
export function selectTopics(topics = [], turnTopic = [], { activeTopicId, relatedIds = [], budgetChars = Infinity, turns = [] } = {}) {
  const list = Array.isArray(topics) ? topics : [];
  const all = Array.isArray(turnTopic) ? turnTopic : [];
  const turnList = Array.isArray(turns) ? turns : [];
  const n = all.length;
  if (!n) return [];

  const budget = Number.isFinite(Number(budgetChars)) ? Math.max(0, Number(budgetChars)) : Infinity;
  const byId = new Map(list.map((t) => [t.id, t]));

  // activeTopicId 认三种写法：话题下标、话题 id（"topic-2"）、turnTopic 里的实际值；都不认就用最新一轮所属话题。
  let active = -1;
  if (typeof activeTopicId === 'number' && Number.isInteger(activeTopicId) && activeTopicId >= 0 && activeTopicId < list.length) {
    active = activeTopicId;
  } else if (activeTopicId != null && byId.has(activeTopicId)) {
    active = list.findIndex((t) => t.id === activeTopicId);
  } else if (typeof activeTopicId === 'number' && all.includes(activeTopicId)) {
    active = activeTopicId;
  }
  if (active < 0) active = all[n - 1];

  const take = new Set();
  let used = 0;
  for (let i = 0; i < n; i++) {
    if (all[i] !== active) continue;
    take.add(i);
    used += costOf(turnList, i); // 当前话题不受预算限制：它是"现在正说的事"，丢了等于失忆
  }

  const related = (Array.isArray(relatedIds) ? relatedIds : [])
    .map((id) => (typeof id === 'number' ? id : byId.has(id) ? list.findIndex((t) => t.id === id) : -1))
    .filter((idx) => idx >= 0 && idx !== active && list[idx])
    .sort((a, b) => list[b].endIndex - list[a].endIndex); // 新的先装

  for (const idx of related) {
    const t = list[idx];
    let add = 0;
    for (let i = t.startIndex; i <= t.endIndex; i++) if (!take.has(i)) add += costOf(turnList, i);
    if (used + add > budget) break; // 装不下就停：宁可少给，不给半截话题让他误读
    for (let i = t.startIndex; i <= t.endIndex; i++) take.add(i);
    used += add;
  }
  return [...take].sort((a, b) => a - b);
}

/** 给模型看的中文概括：话题1（第1-12轮）：开票与发票 / 话题2（第13-30轮）：视频风格 */
export function describeTopics(topics = []) {
  return (Array.isArray(topics) ? topics : [])
    .map((t, i) => `话题${i + 1}（第${t.startIndex + 1}-${t.endIndex + 1}轮）：${t.label || '未命名'}`)
    .join(' / ');
}
