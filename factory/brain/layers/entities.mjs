// 实体记忆：把对话里"稳定的东西"（公司、项目、金额、日期、单号、人物）抽出来单独存。
//
// 动机：总脑原来每轮都把整段历史塞进窗口，三周前客户说过的"年底要做招商视频"
// 一旦滑出窗口就没了。实体是天然的压缩：几十轮对话常常只剩 5-10 条事实，
// 而且可以按当前话题只挑相关的几条带进提示词。
//
// 设计取舍：
//  - 纯规则，不调模型：抽取要快、要可测、要能解释；宁可漏，不可编。
//  - value 保留原话片段，evidence 是能逐字在对话里找到的原话 —— 这一层不产生"推论"。
//  - 检索用 BM25-lite（中文 bigram + 英文词），不引向量库、不加依赖。

export const KINDS = ['person', 'org', 'project', 'money', 'date', 'id'];

// ---------- 通用小工具 ----------

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
// key 归一时去掉所有空白与常见标点；CJK 大写无意义，英文统一小写。
const keyOf = (s) => norm(s).toLowerCase().replace(/[\s，。、；：:,.!?！？"'“”‘’（）()《》【】\-—_/\\|]+/g, '');
const clip = (s, n) => (String(s ?? '').length > n ? String(s).slice(0, n) + '…' : String(s ?? ''));

// 时间：优先用轮次自带的 at，其次序号；保证 at 是 ISO 串（无法转换时给序号字符串）。
function timeOf(turn, i) {
  const raw = turn?.at ?? turn?.created_at ?? turn?.time;
  if (raw != null && raw !== '') {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
    return String(raw);
  }
  return `#${i}`;
}
const atMs = (at) => {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
};

function turnsOf(turns) {
  if (typeof turns === 'string') return [{ text: turns, role: 'user' }];
  if (!Array.isArray(turns)) return [];
  return turns
    .filter((t) => t && typeof t === 'object')
    .map((t) => ({ role: t.role === 'assistant' ? 'assistant' : (t.role === 'system' ? 'system' : 'user'), text: norm(t.text ?? t.content ?? ''), at: t.at }))
    .filter((t) => t.text);
}

// ---------- 抽取规则 ----------

// 句切分：证据尽量是一整句，读起来才像"原话"。换行也当分隔。
function splitSentences(text) {
  return String(text).split(/[\n。！？!?；;]+/).map(norm).filter(Boolean);
}

// —— org：Rolex Pty Ltd / XX有限公司 / XX Inc / XX Pty Ltd
const ORG_RE = new RegExp(
  [
    // 英文公司：品牌词 + 后缀
    String.raw`\b([A-Z][A-Za-z0-9&.\-]*(?:\s+[A-Z][A-Za-z0-9&.\-]*){0,3}\s+(?:Pty\.?\s*Ltd\.?|Ltd\.?|Inc\.?|LLC|Corp\.?|Co\.?|GmbH|Limited|Group))`,
    // 中文公司：字号 + 组织形式
    // 只捕获后缀；字号由代码从匹配位置往前取（见 rebuildCnOrg），避免"我们是"这类前缀被吞
    String.raw`(股份有限公司|有限责任公司|有限公司|集团|工作室|事务所)`,
  ].join('|'),
  'g',
);
// "XX项目"里的公司名常被误判，这些尾巴不要
const ORG_STOP = /^(?:这|那|我|你|他|她|的|和|与)/;

// —— id：ABN / ACN / 税号 / 单号 / 长数字
const ID_RES = [
  { re: /\bABN\b[\s:：]*(?:[:：]|\s)?((?:\d[\s\-]?){9,11}\d?)/gi, label: 'ABN' },
  { re: /\bACN\b[\s:：]*(?:[:：]|\s)?((?:\d[\s\-]?){9})/gi, label: 'ACN' },
  { re: /(?:税号|发票号|单号|订单号|合同号|invoice\s*(?:no\.?|number)?|order\s*(?:no\.?|#))\s*(?:[：:]|#|is)?\s*([A-Za-z0-9][A-Za-z0-9\-]{5,})/gi, label: '' },
  { re: /(?<![\d.])(\d{8,})(?![\d.])/g, label: '' }, // 连续 8 位以上纯数字（含手机号、超长单号）
];

// —— money：¥/￥/$/元/块/万/aud/刀
const MONEY_RES = [
  /[¥￥$]\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:万|w|k|K))?/g, // 前置符号
  /\d[\d,]*(?:\.\d+)?\s?(?:万元|万块|万|块钱|块钱|元|块|刀|美元|澳元|aud|AUD)/g, // 后置单位
];

// —— date：周X / 下周X / X月X日 / X号 / 明天后天 / 年底 / 具体日期
const CN_WEEK = { 一: '一', 二: '二', 三: '三', 四: '四', 五: '五', 六: '六', 日: '日', 天: '日', 七: '日' };
const DATE_RES = [
  // "下周三" / "这周五" / "礼拜一" / "周三" —— 带序号的和不带序号的会抽成不同 key
  { re: /(下下|下|这|本)?(?:周|星期|礼拜)([一二三四五六日天七])/g, kind: 'weekday' },
  // "下周" / "这周" / "本星期"（不带周几）——放在带序号规则之后，避免抢它的匹配
  { re: /(下下|下|这|本)(?:周|星期|礼拜)(?![一二三四五六日天七])/g, kind: 'peri' },
  // "3月15日" / "12 月 3 号"
  { re: /(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/g, kind: 'md' },
  // "15号"（前面不能是月份数字，否则已被上面吃掉）
  { re: /(?<![\d月])(\d{1,2})\s*号/g, kind: 'day' },
  // "明天/后天/大后天"
  { re: /(大后天|后天|明天|明早|今晚|今天|昨天)/g, kind: 'rel' },
  // "年底" / "月底" / "年后" / "下个月"
  { re: /(?:今年)?(年底|年底前|年底之前|月底|月初|年末|年内|年后|下个月|明年)/g, kind: 'peri' },
  // 2026-11-03 / 2026/11/3
  { re: /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/g, kind: 'iso' },
];

// —— project：动词 + 的 + 名词短语；"XX项目/这条/那套 + 视觉/视频/片子"
const VERB_NOUN_RE = /(?:做|拍|剪|设计|出|搞|弄|画|写|改|重做|修)(?:一个|一条|一套|一版|个|条|套|版)?的?([\u4e00-\u9fa5A-Za-z0-9]{2,12}?)(?:的)?(视频|片子|宣传片|广告片|招商片|短片|海报|logo|标志|菜单|网站|页面|片子|MV|mv|动画|封面|包装|设计)/g;
const OBJECT_NOUN_RE = /([\u4e00-\u9fa5A-Za-z0-9]{1,12}?)(?:项目|这条|那套|这套|那份|那个|这个)([\u4e00-\u9fa5A-Za-z0-9]{0,8}?)(视频|片子|视觉|形象片|宣传片|招商片|方案|设计|海报|网站|logo|标志|菜单)/g;
const PROJECT_STOP = /^(?:要|想|再|先|就|也|都|还|的|把|给|帮|请|让|去|能|可以|需要|一个|一条|一套)/;

// —— person：含 总/经理/小姐/先生/老板 的称呼
const PERSON_RES = [
  /([\u4e00-\u9fa5]{1,3})(总|经理|总监|主管|老板)(?!\w)/g,
  /([\u4e00-\u9fa5]{1,3})(先生|小姐|女士|老师|老板娘)/g,
  /我(?:们的?)?(老板|领导|同事|合伙人|财务|会计)/g,
];

function pushItem(items, has, kind, key, value, sentence, at) {
  const k = norm(key);
  if (!k) return;
  // 同一条抽取里同 kind+key 只留第一条（后出现的可能是重复引用）
  if (has.has(`${kind}\u0000${k}`)) return;
  has.add(`${kind}\u0000${k}`);
  items.push({ kind, key: k, value: clip(norm(value) || k, 120), evidence: sentence, at });
}

/**
 * 从对话轮次里抽实体。纯规则，不调模型。
 * @param {Array<{role?:string,text:string,at?:string}>|string} turns
 * @param {{known?: Array<object>}} opts known：已知实体（用于给人员/项目补关键字，当前仅用于避免同 key 重复）
 * @returns {Array<{kind:string,key:string,value:string,evidence:string,at:string}>}
 */
export function extractEntities(turns, { known = [] } = {}) {
  const list = turnsOf(turns);
  const items = [];
  const has = new Set();
  // known 里的 key 先占位：本批里同名的不再重复抽，值由 mergeEntities 决定“谁最新”
  for (const e of Array.isArray(known) ? known : []) {
    if (e && KINDS.includes(e.kind) && e.key) has.add(`${e.kind}\u0000${norm(e.key)}`);
  }

  list.forEach((turn, i) => {
    if (turn.role === 'system') return;
    const at = timeOf(turn, i);
    for (const sentence of splitSentences(turn.text)) {
      // org
      for (const m of sentence.matchAll(ORG_RE)) {
        // 英文分支在组 1 带全名；中文分支只抓后缀，字号回取。
        let name;
        if (m[1]) name = norm(m[1]);
        else if (m[2]) {
          const suffix = m[2];
          const before = sentence.slice(0, m.index);
          // 结构词之后才可能开始字号：遇到就只取其后部分
          const marker = /(?:是|叫|做|为|我们|你们|他们|客户是?|抬头写?|公司是?)([\u4e00-\u9fa5A-Za-z0-9（）()]{2,10})$/.exec(before);
          let head = marker ? marker[1] : (before.match(/[\u4e00-\u9fa5A-Za-z0-9（）()]{2,10}$/) || [''])[0];
          // 字号里出现数量词/量词就说明前面是描述而不是名字
          if (/(?:的一家|一个|这家|那家|几个)/.test(head)) head = head.split(/(?:的一家|一个|这家|那家|几个)/).pop() || '';
          name = norm(head + suffix).replace(/^(?:我们|你们|他们|客户|公司|是|叫|做|为|的)+/, '');
          if (head.length < 2) name = '';
        }
        if (!name || name.length < 3 || ORG_STOP.test(name)) continue;
        pushItem(items, has, 'org', name, name, sentence, at);
      }
      // id
      for (const { re, label } of ID_RES) {
        re.lastIndex = 0;
        for (const m of sentence.matchAll(re)) {
          const digits = norm(m[1] || m[0]).replace(/[\s\-]/g, (c, off, s) => (/^\d/.test(s[off - 1] || '') && /\d/.test(s[off + 1] || '') ? '' : ''));
          const shown = label ? `${label} ${digits}` : digits;
          pushItem(items, has, 'id', shown, shown, sentence, at);
        }
      }
      // money
      for (const re of MONEY_RES) {
        for (const m of sentence.matchAll(re)) pushItem(items, has, 'money', norm(m[0]), norm(m[0]), sentence, at);
      }
      // date
      for (const { re, kind } of DATE_RES) {
        for (const m of sentence.matchAll(re)) {
          let key;
          if (kind === 'weekday') key = `${m[1] || ''}周${CN_WEEK[m[2]] || m[2]}`;
          else if (kind === 'md') key = `${Number(m[1])}月${Number(m[2])}日`;
          else if (kind === 'day') key = `${Number(m[1])}号`;
          else if (kind === 'iperi') key = m[1];
          else if (kind === 'peri') key = norm(m[0]);
          else if (kind === 'iso') key = `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
          else key = m[0];
          pushItem(items, has, 'date', key, norm(m[0]), sentence, at);
        }
      }
      // project
      for (const m of sentence.matchAll(VERB_NOUN_RE)) {
        const phrase = norm(`${m[1]}${m[2]}`);
        if (phrase.length < 3 || PROJECT_STOP.test(m[1])) continue;
        pushItem(items, has, 'project', phrase, clip(norm(m[0]), 80), sentence, at);
      }
      for (const m of sentence.matchAll(OBJECT_NOUN_RE)) {
        const phrase = norm(`${m[1]}${m[2] || ''}${m[3]}`);
        if (phrase.length < 3 || PROJECT_STOP.test(m[1])) continue;
        pushItem(items, has, 'project', phrase, clip(norm(m[0]), 80), sentence, at);
      }
      // person
      for (const re of PERSON_RES) {
        for (const m of sentence.matchAll(re)) {
          const name = norm(m[0]);
          if (name.length < 2) continue;
          pushItem(items, has, 'person', name, name, sentence, at);
        }
      }
    }
  });

  // 稳定排序：kind 固定顺序，同类按出现顺序 —— 输出可复现，测试才好写
  const order = Object.fromEntries(KINDS.map((k, i) => [k, i]));
  return items.sort((a, b) => (order[a.kind] - order[b.kind]));
}

const MAX_EVIDENCE = 3;

/**
 * 合并两批实体：同 kind+key 保留最新的 value，evidence 累积去重（最多 3 条），
 * lastSeen/at 取较新者，seenCount 累加。
 * @returns {Array<{kind:string,key:string,value:string,evidence:string[],at:string,seenCount:number}>}
 */
export function mergeEntities(prev = [], next = []) {
  const map = new Map();
  const put = (e, from = 'next') => {
    if (!e || !KINDS.includes(e.kind) || !e.key) return;
    const k = `${e.kind}\u0000${norm(e.key)}`;
    const ev = Array.isArray(e.evidence) ? e.evidence : (e.evidence ? [e.evidence] : []);
    const cur = map.get(k);
    if (!cur) {
      map.set(k, {
        kind: e.kind,
        key: norm(e.key),
        value: norm(e.value) || norm(e.key),
        evidence: [...new Set(ev.map(norm).filter(Boolean))].slice(0, MAX_EVIDENCE),
        at: e.at ?? '',
        seenCount: from === 'prev' ? (Number(e.seenCount) || 1) : 1,
      });
      return;
    }
    // 新的一批覆盖旧值：实体是会变的（金额改了、日期顺延），记最新
    if (norm(e.value)) cur.value = norm(e.value);
    cur.evidence = [...new Set([...cur.evidence, ...ev.map(norm).filter(Boolean)])].slice(0, MAX_EVIDENCE);
    if (e.at && (!cur.at || atMs(e.at) >= atMs(cur.at))) cur.at = e.at;
    cur.seenCount += 1;
  };
  // prev 是库里已有的存量：count = 存量；next 是本轮新抽的：count = 1（同一批里重复出现则累加）
  for (const e of Array.isArray(prev) ? prev : []) put(e, 'prev');
  for (const e of Array.isArray(next) ? next : []) put(e, 'next');
  const order = Object.fromEntries(KINDS.map((k, i) => [k, i]));
  return [...map.values()].sort((a, b) => (order[a.kind] - order[b.kind]) || atMs(b.at) - atMs(a.at));
}

// ---------- 检索：BM25-lite ----------

const STOP_EN = new Set(['the', 'a', 'an', 'of', 'to', 'and', 'or', 'is', 'in', 'on', 'for', 'with', 'it', 'this', 'that']);
const STOP_ZH = new Set(['我们', '你们', '他们', '这个', '那个', '一下', '然后', '就是', '可以', '还是', '什么', '怎么']);

/** query 切词：中文 bigram + 英文单词（小写）。不引入分词器。 */
export function tokenize(text) {
  const s = norm(text).toLowerCase();
  const out = [];
  for (const w of s.match(/[a-z][a-z0-9&'-]{1,}/g) || []) {
    if (!STOP_EN.has(w) && w.length > 1) out.push(w);
  }
  for (const run of s.match(/[\u4e00-\u9fa5]+/g) || []) {
    if (run.length === 1) { out.push(run); continue; }
    for (let i = 0; i + 1 < run.length; i++) {
      const bg = run.slice(i, i + 2);
      if (!STOP_ZH.has(bg)) out.push(bg);
    }
  }
  return out;
}

const tokenSet = (text) => new Set(tokenize(text));

/**
 * 按相关性挑实体：BM25-lite（idf × 词频饱和 / 长度归一）+ 轻微"最近用过"加权。
 * 只返回命中的（score > 0），不足 limit 不凑数 —— 宁可少带，不塞无关的。
 * @returns {Array<object>}
 */
export function retrieveRelevant(entities = [], query = '', { limit = 8, now = Date.now() } = {}) {
  const list = Array.isArray(entities) ? entities.filter((e) => e && e.key) : [];
  const q = tokenize(query);
  if (!list.length) return [];
  if (!q.length) {
    // 没有 query（比如开场第一轮）：按最近使用给最近几条
    return [...list].sort((a, b) => atMs(b.at) - atMs(a.at)).slice(0, limit);
  }
  const docs = list.map((e) => tokenSet(`${e.key} ${e.value || ''}`));
  const N = docs.length;
  const df = new Map();
  for (const d of docs) for (const t of d) df.set(t, (df.get(t) || 0) + 1);
  const avgLen = docs.reduce((s, d) => s + d.size, 0) / Math.max(1, N);
  const k1 = 1.2;
  const b = 0.75;

  const qset = [...new Set(q)];
  const scored = list.map((e, i) => {
    const d = docs[i];
    let score = 0;
    for (const t of qset) {
      const tf = tokenSet(`${e.key} ${e.key} ${e.key} ${e.value || ''}`).has(t) ? (tokenSet(e.key).has(t) ? 3 : 1) : 0; // key 命中权重翻倍
      if (!tf) continue;
      const idf = Math.log(1 + (N - (df.get(t) || 0) + 0.5) / ((df.get(t) || 0) + 0.5));
      score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * d.size) / (avgLen || 1))));
    }
    if (score <= 0) return { e, score: 0 };
    // 最近用过：最多 +10%，只做微调，不能盖过相关性
    const ageDays = e.at ? Math.max(0, (now - atMs(e.at)) / 86400000) : 999;
    const fresh = 1 / (1 + ageDays / 14);
    return { e, score: score * (1 + 0.1 * fresh) };
  });

  return scored
    .filter((x) => x.score > 0)
    .sort((a, b2) => b2.score - a.score || atMs(b2.e.at) - atMs(a.e.at))
    .slice(0, Math.max(0, limit))
    .map((x) => x.e);
}

// ---------- 渲染 ----------

const LABEL = { person: '人', org: '客户', project: '项目', money: '金额', date: '时间', id: '编号' };

/**
 * 生成给总脑看的记忆块。空数组返回 ''（调用方可以直接 if (block) 拼接）。
 * @returns {string}
 */
export function formatForPrompt(items = []) {
  const list = Array.isArray(items) ? items.filter((e) => e && e.kind && (e.value || e.key)) : [];
  if (!list.length) return '';
  const parts = [];
  const seen = new Set();
  for (const e of list) {
    const label = LABEL[e.kind] || e.kind;
    const v = norm(e.value) || norm(e.key);
    const line = `${label}=${v}`;
    if (seen.has(line)) continue; // 同值不同 key（如 "8000元" 与 "¥8000"）只写一次
    seen.add(line);
    parts.push(line);
  }
  if (!parts.length) return '';
  return `【记得的事】${parts.join('；')}。\n（这些是之前对话里说过的原话摘录，可作背景参考；与本轮冲突时以本轮为准。）`;
}

export default { KINDS, extractEntities, mergeEntities, retrieveRelevant, formatForPrompt };
