// 第 3 步：先问总脑再说话 —— 超时必须退回小助手，绝不卡住对话。
// 这里用假时钟 + 可控 fetch 把"慢一拍才回来"的模型原样复现出来。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrain } from '../brain/brain.mjs';
import { createBrainStore } from '../brain/store.mjs';

const REPLY = JSON.stringify({
  reply_suggestion: '我把刚才说的整理了一下：你要的是能开票的抬头，对吗？',
  tasks: [{ title: '核对发票抬头', detail: 'ABN + 公司名', priority: 'high' }],
  follow_up_questions: [{ question: '先开票还是先出片？', basis: '客户：先给我开票' }],
  needs: [{ need: '开票能力', evidence: '客户：先给我开票', confidence: 0.8 }],
});

/** 假时钟：setTimeout 由 tick(ms) 推进。 */
function fakeClock() {
  let t = 0;
  const timers = [];
  return {
    now: () => t,
    timers,
    setTimeout(fn, ms) {
      // 先算好触发时刻，再在回调里取当前时钟——别在调度那一刻把时间算死。
      const th = { fn: () => fn(), at: t + ms, dead: false };
      timers.push(th);
      return th;
    },
    clearTimeout(th) { if (th) th.dead = true; },
    // 同步推进：只把"到点的计时器"按顺序触发，再让微任务跑完。简单，可预测。
    async tick(ms) {
      t += ms;
      for (const th of [...timers].sort((a, b) => a.at - b.at)) {
        if (!th.dead && th.at <= t) { th.dead = true; th.fn(); }
      }
      for (let i = 0; i < 5; i++) await Promise.resolve();
    },
  };
}

function brainWith({ fetchImpl, clock, configured = true, timeoutMs }) {
  const store = createBrainStore({ env: {}, fetchImpl: async () => ({ ok: true, text: async () => '[]' }) });
  return createBrain({
    env: configured ? { BRAIN_MODEL_API_BASE: 'https://brain.example/v1', BRAIN_MODEL_API_KEY: 'k', BRAIN_TIMEOUT_MS: String(timeoutMs || 3000) } : {},
    fetchImpl,
    store,
    now: clock.now,
    clock,
  });
}

test('模型很慢：3 秒到点就退回，reply 为 null，不挂起', async () => {
  const clock = fakeClock();
  let aborted = false;
  const fetchImpl = (url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => { aborted = true; reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); });
  });
  const brain = brainWith({ fetchImpl, clock });
  const run = brain.forTurn({ sessionId: 's1', turns: [{ role: 'user', text: '我要开票' }] });
  await clock.tick(2900);
  await clock.tick(10);
  let settled = false;
  run.then(() => { settled = true; });
  assert.equal(settled, false, '2.9 秒还没到点，不许提前放弃');
  await clock.tick(300);
  const out = await run;
  assert.equal(out.ok, false);
  assert.equal(out.reply, null);
  assert.equal(out.reason, 'timeout');
  assert.ok(out.latencyMs <= 3000, `必须 ≤ 预算，实际 ${out.latencyMs}`);
  // 设计变更：迟到的结果会被缓存、给下一次同样的问题复用，所以到点不立刻掐断；
  // 但它必须在 proactive 上限内自己收尾，不许无限悬挂。
  await clock.tick(9000);
  assert.equal(aborted, true, '迟到的请求在上限内被收尾，不悬挂');
});

test('模型刚好在预算内回来：用总脑的那句', async () => {
  const clock = fakeClock();
  const fetchImpl = (url, init) => new Promise((resolve) => {
    const h = clock.setTimeout(() => resolve({ ok: true, text: async () => JSON.stringify({ choices: [{ message: { content: REPLY } }] }) }), 1200);
    init.signal.addEventListener('abort', () => { h.dead = true; });
  });
  const brain = brainWith({ fetchImpl, clock });
  const run = brain.forTurn({ sessionId: 's2', turns: [{ role: 'user', text: '先给我开票，片子晚点' }] });
  await clock.tick(1300);
  const out = await run;
  assert.equal(out.ok, true);
  assert.equal(out.reason, 'brain');
  assert.match(out.reply, /开票/);
  assert.equal(out.tasks[0].title, '核对发票抬头');
  assert.equal(out.questions[0].question, '先开票还是先出片？');
  assert.equal(out.needs[0].need, '开票能力');
  assert.ok(out.latencyMs <= 3000);
});

test('上游 500：立刻退回，不重试、不抛错', async () => {
  const clock = fakeClock();
  const brain = brainWith({ fetchImpl: async () => ({ ok: false, status: 500, text: async () => 'boom' }), clock });
  const out = await brain.forTurn({ sessionId: 's3', turns: [{ role: 'user', text: 'hi' }] });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'upstream_error');
});

test('连续两次超时熔断：第三次不等模型，直接 circuit_open', async () => {
  const clock = fakeClock();
  const brain = brainWith({ fetchImpl: () => new Promise(() => {}), clock });
  for (const s of ['a', 'b']) {
    const run = brain.forTurn({ sessionId: s, turns: [{ role: 'user', text: 'x' }] });
    await clock.tick(3100);
    assert.equal((await run).reason, 'timeout');
  }
  const t0 = clock.now();
  const out = await brain.forTurn({ sessionId: 'c', turns: [{ role: 'user', text: 'x' }] });
  assert.equal(out.reason, 'circuit_open');
  assert.equal(clock.now() - t0, 0, '熔断期间零等待');
  assert.equal(out.reply, null);
});

test('没配密钥：不访问网络，直接 not_configured，对话照常', async () => {
  const clock = fakeClock();
  let called = 0;
  const brain = brainWith({ fetchImpl: async () => { called += 1; }, clock, configured: false });
  const out = await brain.forTurn({ sessionId: 's4', turns: [{ role: 'user', text: 'hi' }] });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'not_configured');
  assert.equal(called, 0);
});

test('模型回了非 JSON：算失败，退回小助手（而不是念一段乱码）', async () => {
  const clock = fakeClock();
  const brain = brainWith({
    fetchImpl: async () => ({ ok: true, text: async () => JSON.stringify({ choices: [{ message: { content: '好的，我来帮你看看。' } }] }) }),
    clock,
  });
  const out = await brain.forTurn({ sessionId: 's5', turns: [{ role: 'user', text: 'hi' }] });
  assert.equal(out.ok, false);
  assert.equal(out.reply, null, '非 JSON 不拿来当回复');
});

test('每秒都记账：used=brain / fallback 都落一条', async () => {
  const clock = fakeClock();
  const store = createBrainStore({ env: {} });
  const brain = createBrain({ env: { BRAIN_MODEL_API_BASE: 'https://x/v1', BRAIN_MODEL_API_KEY: 'k' }, store, now: clock.now, fetchImpl: () => new Promise(() => {}) });
  const run = brain.forTurn({ sessionId: 's6', turns: [{ role: 'user', text: 'hi' }] });
  await clock.tick(3100);
  await run;
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(brain.stats.fallbacks, 1);
});

test('主动模式：间隔不够就不打扰；同一问题 10 分钟内不重复问', async () => {
  const clock = fakeClock();
  let n = 0;
  const fetchImpl = async () => {
    n += 1;
    const content = n === 1
      ? JSON.stringify({ follow_up_questions: [{ question: '你刚说的墨尔本，是北区还是东南区？', basis: '客户：我在墨尔本' }] })
      : JSON.stringify({ follow_up_questions: [{ question: '你刚说的墨尔本，是北区还是东南区？', basis: '客户：我在墨尔本' }] });
    return { ok: true, text: async () => JSON.stringify({ choices: [{ message: { content } }] }) };
  };
  const brain = brainWith({ fetchImpl, clock });
  const turns = [{ role: 'user', text: '我在墨尔本' }];
  const first = await brain.proactiveTick({ sessionId: 'p1', turns });
  assert.match(first.question, /墨尔本/);
  const tooSoon = await brain.proactiveTick({ sessionId: 'p1', turns });
  assert.equal(tooSoon.reason, 'too_soon', '2 分钟内不重复打扰');
  await clock.tick(121_000);
  const again = await brain.proactiveTick({ sessionId: 'p1', turns });
  assert.equal(again.question, null, '同一件事不重复问');
  assert.equal(n, 1, '结论进缓存后，同一段对话不再重复请求（省钱也省时）');
});
