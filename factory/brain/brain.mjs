// 总脑引擎：调模型 → 结构化结论 → 落库。
//
// 关键契约（来自现场教训：30 秒超时把界面卡死）：
//  - forTurn 永远在约 3 秒（BRAIN_TIMEOUT_MS）内返回，超时/失败一律 reply:null，
//    调用方据此退回小助手自己的回复；它自己绝不 throw。
//  - 连续 2 次超时/失败触发熔断（90 秒），熔断期间立刻回退，不再等模型。
//  - AbortController 保证上游请求被真打断，不留悬挂连接。

import { buildMessages, parseBrainText, fingerprint, SYSTEM_PROMPT } from './prompt.mjs';
import { guardResult } from './guard.mjs';
import { packContext, packWithLayers, DEFAULT_CONTEXT_CHARS } from './context.mjs';

// 快档：只用来"别让界面等"。慢的强模型交给强档 + 稍后送达。
const DEFAULT_TURN_TIMEOUT_MS = 3000;
const DEFAULT_PROACTIVE_TIMEOUT_MS = 9000;
// 强档（总脑主力）默认给 45 秒：它慢，但它是那个拿主意的人。
const DEFAULT_STRONG_TIMEOUT_MS = 45_000;
const DEFAULT_MIN_GAP_MS = 2 * 60_000;
const DEFAULT_ASK_COOLDOWN_MS = 10 * 60_000;
const BREAKER_BREAK_MS = 90_000;

export function createBrain({
  env = process.env,
  fetchImpl = globalThis.fetch,
  store,
  now = Date.now,
  timeoutMs = Number(env.BRAIN_TIMEOUT_MS) || DEFAULT_TURN_TIMEOUT_MS,
  proactiveTimeoutMs = Number(env.BRAIN_PROACTIVE_TIMEOUT_MS) || DEFAULT_PROACTIVE_TIMEOUT_MS,
  strongTimeoutMs = Number(env.BRAIN_STRONG_TIMEOUT_MS) || DEFAULT_STRONG_TIMEOUT_MS,
  onDeliver = null, // 强档算完后的送达回调（见 useDeliver）
  contextChars = DEFAULT_CONTEXT_CHARS,
  historyLimit = Number(env.BRAIN_HISTORY_LIMIT) || 2000,
  // 三层记忆开关：关着时行为与之前完全一致。打开后话题切分/实体记忆/摘要一起生效。
  memoryLayers = String(env.BRAIN_MEMORY_LAYERS || 'off').toLowerCase() === 'on',
  model = env.BRAIN_MODEL || 'kimi-k3',
  base = env.BRAIN_MODEL_API_BASE || env.DEEPSEEK_BASE_URL || env.OPENAI_BASE_URL || '',
  apiKey = env.BRAIN_MODEL_API_KEY || env.DEEPSEEK_API_KEY || env.OPENAI_API_KEY || '',
  // 计时器可注入，测试用假时钟把"到点抖动"精确复现；生产默认就是真实毫秒。
  clock = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h) },
} = {}) {
  const root = String(base).replace(/\/+$/, '');
  const configured = !!(root && apiKey);
  const breaker = { openUntil: 0, strikes: 0 };
  const cache = new Map();   // sessionId -> { at, result, text }
  const lastAsk = new Map(); // sessionId -> { at, fp }
  const inflight = new Map(); // 同一段对话只请求一次：超时退回后结果到了，也能被下一次直接复用
  const stats = { calls: 0, timeouts: 0, errors: 0, fallbacks: 0, guarded: 0 };

  const url = () => (/\/chat\/completions$/.test(root) ? root : `${root}/chat/completions`);

  async function callModel({ turns, assistants, lang, intent, omittedNote = '', extra = '' }, ms, noFormat = false) {
    const ctrl = new AbortController();
    let late = false;
    let attempt_ = noFormat ? 1 : 0;
    // 用注入的时钟计时：测试里能精确复现"到点抖动"，生产里就是真实毫秒。
    const timer = clock.setTimeout(() => { late = true; ctrl.abort(); }, ms);
    stats.calls += 1;
    try {
      const r = await fetchImpl(url(), {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 2400, // 推理型模型（kimi-k3）会先花思考 token，给窄了正文就是空的
          messages: [
            { role: 'system', content: SYSTEM_PROMPT + '\n\n只输出一个 JSON 对象本身，键名用双引号。' + (extra ? `\n\n${extra}` : '') },
            ...buildMessages({ turns, assistants, lang, intent, omittedNote }).slice(1),
          ],
          // 上游支持就从解码层强制 JSON；不支持会返回 400，由下面降级重试兜住。
          ...(noFormat ? {} : { response_format: { type: 'json_object' } }),
        }),
      });
      const text = await r.text();
      if (!r.ok && r.status === 400 && attempt_ === 0) {
        // 上游不认 response_format：去掉它重试一次，别把一次格式协商当成失败
        attempt_ = 1;
        return callModel(args, ms, true);
      }
      if (!r.ok) throw Object.assign(new Error(`brain upstream ${r.status}`), { upstream: r.status });
      let content = '';
      try { content = JSON.parse(text)?.choices?.[0]?.message?.content || ''; } catch {}
      if (!content) throw new Error('brain empty');
      return content;
    } catch (e) {
      if (late) throw Object.assign(new Error('brain_timeout'), { timeout: true });
      throw e;
    } finally {
      clock.clearTimeout(timer);
    }
  }

  // 缓存键按"意图档位"而不是具体预算：3 秒预算算出的结论，和 9 秒预算算出的同一份，可以共用。
  // 档位：turn=3 秒内说完；proactive=停顿回看；strong=强模型，慢但够深
  const profile = (args) => (args.intent === 'proactive' ? 'proactive' : args.intent === 'strong' ? 'strong' : 'turn');
  const budgetOf = (args) => (profile(args) === 'strong' ? strongTimeoutMs : profile(args) === 'proactive' ? proactiveTimeoutMs : timeoutMs);
  const keyOf = (args) => `${profile(args)}|${fingerprint(args.turns.map((t) => t.role + ':' + t.text).join('\n'))}`;

  /**
   * 硬超时保证：无论模型多慢，forTurn 都在预算内返回；latency 按"发起→返回"记账。
   *
   * 设计取舍（实测 kimi-k3 单次要 7s，而预算是 3s）：
   *  - 到点就退回，界面不等；但那次请求不取消——它最多再跑 proactiveTimeout 就自己断了。
   *  - 结果回来（且真的解析成功）就写进 cache；下一次同样内容的调用直接命中，
   *    既不重复计费，也能让"先问总脑"在真实网速下命中率更高。
   */
  async function ask(args, budget) {
    const started = now();
    if (!configured) return { result: null, text: '', reason: 'not_configured', latencyMs: 0 };
    // 同样内容的结论已经在缓存里：直接给，不花一分钱、不花一毫秒。
    const hit = cache.get(`k:${keyOf(args)}`);
    if (hit) return { text: hit.text, result: hit.result, latencyMs: 0, cached: true, reason: 'cache' };
    if (now() < breaker.openUntil) return { result: null, text: '', reason: 'circuit_open', latencyMs: 0 };
    // 对外承诺的是预算本身：超时 = 用满了预算，不给调用方一个没意义的抖动值。
    const finish = (o) => ({ ...o, latencyMs: o.reason === 'timeout' ? budget : Math.min(budget, Math.max(0, now() - started)) });
    let timer;
    const deadline = new Promise((resolve) => {
      // 预算先记在闭包里，回调里再取时钟——调度那一刻不能把时间算死。
      timer = clock.setTimeout(() => resolve({ result: null, text: '', reason: 'timeout' }), budget);
    });
    try {
      const k = keyOf(args);
      let attempt = inflight.get(k);
      if (!attempt) {
        attempt = callModel(args, Math.max(1000, budget))
          .then((text) => {
            const result = parseBrainText(text);
            if (result.reply_suggestion || result.follow_up_questions.length || result.needs.length) cache.set(`k:${k}`, { at: now(), result, text });
            return { text, result };
          })
          .catch((e) => ({ result: null, text: '', reason: e && e.timeout ? 'timeout' : 'upstream_error' }))
          .finally(() => inflight.delete(k));
        inflight.set(k, attempt);
      }
      const out = finish(await Promise.race([attempt, deadline]));
      if (out.result && !out.result.reply_suggestion) out.reason = 'empty_reply';
      if (out.reason === 'timeout') stats.timeouts += 1;
      else if (out.reason === 'upstream_error') stats.errors += 1;
      if (out.result) breaker.strikes = 0;
      else if (++breaker.strikes >= 2) breaker.openUntil = now() + BREAKER_BREAK_MS;
      return out;
    } catch {
      return finish({ result: null, text: '', reason: 'upstream_error' });
    } finally { clock.clearTimeout(timer); }
  }

  /** 需求落库；追问与任务在这里不落，交给调用方决定（是否真问、是否真派）。 */
  async function persistNeeds(sessionId, needs) {
    const saved = [];
    const seen = new Set();
    for (const n of needs || []) {
      const fp = fingerprint(n.need);
      if (seen.has(fp)) continue; // 同一轮里模型把同一件事说两遍：只算一次
      seen.add(fp);
      try {
        saved.push(await store.upsertNeed({ sessionId, need: n.need, evidence: n.evidence, confidence: n.confidence, fingerprint: fp }));
      } catch { /* 落库失败不影响这一轮对话 */ }
    }
    return saved;
  }

  return {
    configured, mode: store.mode, model, stats,
    timeoutMs, proactiveTimeoutMs, strongTimeoutMs, contextChars, historyLimit, memoryLayers,

    /** 第 3 步：小助手回复前先问总脑。永不 throw。 */
    async forTurn({ sessionId, turns = [], assistantId, lang = 'zh' }) {
      if (!sessionId) return { ok: false, reply: null, tasks: [], questions: [], needs: [], reason: 'no_session', latencyMs: 0 };
      const packed = packContext(turns.length ? turns
        : (await store.history(sessionId, historyLimit).catch(() => [])).map((t) => ({ role: t.role, text: t.text, assistant: t.assistant_id })),
        { budgetChars: contextChars });
      const list = packed.turns;
      const out = await ask({ turns: list, assistants: assistantId ? { [assistantId]: assistantId } : {}, lang, intent: 'turn', omittedNote: packed.omittedNote }, timeoutMs);
      const latencyMs = out.latencyMs;
      const hit = out.result && out.result.reply_suggestion ? out.result : null;
      let savedNeeds = [];
      if (hit) {
        cache.set(sessionId, { at: now(), result: hit, text: out.text });
        savedNeeds = await persistNeeds(sessionId, hit.needs);
      } else stats.fallbacks += 1;
      store.logReply({ sessionId, kind: 'turn', reply: hit ? hit.reply_suggestion : '', latencyMs, used: !!hit, reason: hit ? null : out.reason }).catch(() => {});
      return {
        ok: !!hit,
        reply: hit ? hit.reply_suggestion : null,
        tasks: hit ? hit.tasks : [],
        questions: hit ? hit.follow_up_questions : [],
        needs: hit ? (savedNeeds.length ? savedNeeds.map((n) => ({ need: n.need, evidence: n.evidence, confidence: Number(n.confidence), fingerprint: n.fingerprint, status: n.status, id: n.id })) : hit.needs) : [],
        reason: hit ? 'brain' : out.reason,
        latencyMs,
        budgetMs: timeoutMs,
        model: hit ? model : null,
      };
    },

    /**
     * 智库模式：把这一轮交给强模型慢慢想（默认 45 秒）。
     * 立刻返回 { pending:true } 让界面先走；结论好了走 onDeliver，由小助手把它送到对话里。
     * 绝不阻塞对话，也绝不因为慢就丢掉结论。
     */
    async askStrong({ sessionId, turns = [], assistantId, lang = 'zh' }) {
      if (!sessionId) return { pending: false, reason: 'no_session' };
      // 强档才真正吃长上下文：整段历史装进窗口，装不下才明说省略了多少轮。
      const history = turns.length ? turns
        : (await store.history(sessionId, historyLimit).catch(() => [])).map((t) => ({ role: t.role, text: t.text, assistant: t.assistant_id }));
      // 强档才用得到长上下文：开着三层就按话题装、补记忆与摘要；关着就是原来的整段装。
      const packed = memoryLayers
        ? await packWithLayers(history, { budgetChars: contextChars, query: history.slice(-2).map((t) => t.text || '').join(' '), layers: { topics: true, entities: true } })
        : packContext(history, { budgetChars: contextChars });
      const args = { turns: packed.turns, assistants: assistantId ? { [assistantId]: assistantId } : {}, lang, intent: 'strong', omittedNote: packed.omittedNote, extra: packed.extra || '' };
      const run = ask(args, strongTimeoutMs).then(async (out) => {
        const hit = out.result && (out.result.reply_suggestion || out.result.follow_up_questions?.length);
        if (!hit) { stats.strongMiss = (stats.strongMiss || 0) + 1; return { ok: false, reason: out.reason }; }
        stats.strongHits = (stats.strongHits || 0) + 1;
        const saved = await persistNeeds(sessionId, out.result.needs);
        const payload = {
          ok: true, sessionId, model,
          reply: out.result.reply_suggestion || '',
          questions: out.result.follow_up_questions || [],
          tasks: out.result.tasks || [],
          needs: saved.length ? saved.map((n) => ({ need: n.need, evidence: n.evidence, confidence: Number(n.confidence), id: n.id })) : [],
          latencyMs: out.latencyMs,
        };
        store.logReply({ sessionId, kind: 'strong', reply: payload.reply, latencyMs: out.latencyMs, used: true }).catch(() => {});
        if (typeof onDeliver === 'function') { try { await onDeliver(payload); } catch {} }
        return payload;
      });
      inflight.set(`strong:${sessionId}:${keyOf(args)}`, run);
      return { pending: true, budgetMs: strongTimeoutMs, model };
    },

    /** 只给诊断/自检用：用指定预算问一次（不影响 forTurn 的 3 秒契约）。 */
    async askWithBudget({ turns = [], assistantId, lang = 'zh' }, budget) {
      const out = await ask({ turns, assistants: assistantId ? { [assistantId]: assistantId } : {}, lang, intent: 'turn' }, budget);
      const rawText = out.text;
      const hit = out.result && out.result.reply_suggestion ? out.result : null;
      if (out.result) await persistNeeds('verify', out.result.needs);
      return { ok: !!hit, reply: hit ? hit.reply_suggestion : null, tasks: hit ? hit.tasks : [], questions: hit ? hit.follow_up_questions : [], needs: hit ? hit.needs : [], reason: hit ? 'brain' : (out.reason || 'empty_reply'), latencyMs: out.latencyMs, cached: !!out.cached, budgetMs: budget, rawText };
    },

    /** 第 4 步：主动模式。会话最小间隔 + 同一问题冷却，任一不满足就静默。 */
    async proactiveTick({ sessionId, turns = [], lang = 'zh', minGapMs = DEFAULT_MIN_GAP_MS, cooldownMs = DEFAULT_ASK_COOLDOWN_MS, lastLookAt = 0 }) {
      if (!sessionId) return { question: null, reason: 'no_session' };
      // 只有"真的问过"才算冷却起点；外部传进来的 lastLookAt 只是提示，不能自己续命。
      const prevLook = lastAsk.get(sessionId);
      if (prevLook && now() - prevLook.at < minGapMs) return { question: null, reason: 'too_soon' };
      if (!prevLook && lastLookAt && now() - lastLookAt < minGapMs) return { question: null, reason: 'too_soon' };
      const recent = turns.length ? turns
        : (await store.history(sessionId, 12).catch(() => [])).map((t) => ({ role: t.role, text: t.text }));
      if (!recent.some((t) => t.role === 'user')) return { question: null, reason: 'no_user_turn' };
      const out = await ask({ turns: recent, lang, intent: 'proactive' }, proactiveTimeoutMs);
      if (!out.result) return { question: null, reason: out.reason };
      await persistNeeds(sessionId, out.result.needs);
      for (const q of out.result.follow_up_questions) {
        const fp = fingerprint(q.question);
        const p = lastAsk.get(sessionId);
        if (p && p.fp === fp && now() - p.at < cooldownMs) continue; // 同一件事不重复问
        lastAsk.set(sessionId, { at: now(), fp }); // 冷却从"真问了"开始算
        store.logReply({ sessionId, kind: 'proactive', reply: q.question, latencyMs: out.latencyMs, used: true }).catch(() => {});
        return { question: q.question, basis: q.basis, needs: out.result.needs, reason: 'brain', latencyMs: out.latencyMs };
      }
      return { question: null, reason: 'nothing_new' };
    },

    /** 让接口层把"送达"接到自己的队列上（引擎不关心前面是 WebSocket 还是轮询）。 */
    useDeliver(fn) { onDeliver = typeof fn === 'function' ? fn : null; },
    needs: (opts) => store.listNeeds(opts),
    settings: () => store.settings(),
    async setProactive(on) { await store.setSetting('proactive', !!on); return store.settings(); },
    cached(sessionId, maxAgeMs = 60_000) {
      const c = cache.get(sessionId);
      return c && now() - c.at < maxAgeMs ? c.result : null;
    },
    _reset() { breaker.openUntil = 0; breaker.strikes = 0; },
  };
}
