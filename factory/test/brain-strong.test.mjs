// 强档（智库）契约：慢模型不卡对话，但结论一定要送到。
// 这里模拟实测的 kimi-k3.1-pro：23.6 秒才回，远超快档 3 秒。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrain } from '../brain/brain.mjs';
import { createBrainStore } from '../brain/store.mjs';
import { packContext } from '../brain/context.mjs';

const REPLY = JSON.stringify({
  reply_suggestion: '收到，我把 ABN 和抬头记下了。3 条视频分别做什么内容？',
  tasks: [{ title: '确认视频内容', detail: '问清 3 条的主题与素材', priority: 'high' }],
  follow_up_questions: [{ question: '素材现在都有吗？', basis: '客户：下周要交' }],
  needs: [{ need: '下周前交付 3 条短视频', evidence: '我们下周想赶在客户会前做 3 条短视频', confidence: 0.9 }],
});

const okFetch = (ms) => () => new Promise((res) => setTimeout(() => res({ ok: true, text: async () => JSON.stringify({ choices: [{ message: { content: REPLY } }] }) }), ms));

function setup({ ms = 30, onDeliver } = {}) {
  const store = createBrainStore({ env: {} });
  const brain = createBrain({
    env: { BRAIN_MODEL_API_BASE: 'https://brain.test/v1', BRAIN_MODEL_API_KEY: 'k' },
    store, fetchImpl: okFetch(ms), onDeliver,
    timeoutMs: 20, strongTimeoutMs: 500, // 快档故意给窄：证明强档不靠快档
  });
  return { store, brain };
}

test('快档 3 秒级的预算挡住慢模型：对话不等', async () => {
  const { brain } = setup({ ms: 200 });
  const t0 = Date.now();
  const out = await brain.forTurn({ sessionId: 's', turns: [{ role: 'user', text: 'hi' }] });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'timeout');
  assert.ok(Date.now() - t0 < 120, `必须立刻返回，实际 ${Date.now() - t0}ms`);
});

test('强档立刻返回 pending，结论随后由 onDeliver 送达', async () => {
  const got = [];
  const { brain, store } = setup({ ms: 120, onDeliver: (p) => { got.push(p); } });
  const t0 = Date.now();
  const r = await brain.askStrong({ sessionId: 's1', turns: [{ role: 'user', text: '下周要交 3 条视频' }] });
  assert.equal(r.pending, true, '不能阻塞对话');
  assert.ok(Date.now() - t0 < 60, `发起必须立刻返回，实际 ${Date.now() - t0}ms`);
  // 让慢模型跑完
  for (let i = 0; i < 40 && !got.length; i++) await new Promise((r2) => setTimeout(r2, 20));
  assert.equal(got.length, 1, '结论必须送到');
  assert.match(got[0].reply, /ABN/);
  assert.equal(got[0].questions[0].question, '素材现在都有吗？');
  assert.equal(got[0].sessionId, 's1');
  // 需求落库
  const needs = await store.listNeeds({});
  assert.equal(needs.length, 1);
  assert.equal(brain.stats.strongHits, 1);
});

test('强档上游失败：不送达、不抛错，只记一次落空', async () => {
  const got = [];
  const store = createBrainStore({ env: {} });
  const brain = createBrain({
    env: { BRAIN_MODEL_API_BASE: 'https://brain.test/v1', BRAIN_MODEL_API_KEY: 'k' }, store,
    fetchImpl: async () => ({ ok: false, status: 502, text: async () => 'bad' }),
    strongTimeoutMs: 300, onDeliver: (p) => { got.push(p); },
  });
  await brain.askStrong({ sessionId: 's2', turns: [{ role: 'user', text: 'hi' }] });
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 20));
  assert.equal(got.length, 0);
  assert.equal(brain.stats.strongMiss, 1);
});

test('长上下文：装满预算，省略的部分要明说，不偷偷截', () => {
  const turns = Array.from({ length: 300 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `第${i}轮 ` + 'x'.repeat(400) }));
  const packed = packContext(turns, { budgetChars: 10_000 });
  assert.ok(packed.chars <= 10_000);
  assert.ok(packed.dropped > 0);
  assert.match(packed.omittedNote, /更早的 \d+ 轮已省略/);
  // 保留的是最近的那批，顺序从早到晚
  assert.match(packed.turns.at(-1).text, /第299轮/);
  assert.match(packed.turns[0].text, /第\d+轮/);
});

test('长上下文：默认预算能装下远超 24 轮的历史', () => {
  const turns = Array.from({ length: 400 }, (_, i) => ({ role: 'user', text: `第${i}轮` }));
  const packed = packContext(turns);
  assert.equal(packed.dropped, 0, '400 条短消息放得进默认窗口，不该丢');
  assert.equal(packed.turns.length, 400);
});

test('强模型真拿到整段历史，而不是最近几条', async () => {
  let sentChars = 0;
  const store = createBrainStore({ env: {} });
  const brain = createBrain({
    env: { BRAIN_MODEL_API_BASE: 'https://brain.test/v1', BRAIN_MODEL_API_KEY: 'k' }, store,
    fetchImpl: async (_u, init) => {
      const body = JSON.parse(init.body);
      sentChars = body.messages.map((m) => m.content.length).reduce((a, b) => a + b, 0);
      return { ok: true, text: async () => JSON.stringify({ choices: [{ message: { content: REPLY } }] }) };
    },
    strongTimeoutMs: 800,
  });
  const turns = Array.from({ length: 120 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `第${i}轮：` + '这件事的来龙去脉'.repeat(30) }));
  await brain.askStrong({ sessionId: 's3', turns });
  await new Promise((r) => setTimeout(r, 120));
  // 120 条 × 244 字 ≈ 2.9 万字：一条不丢，全喂进去（旧的 24 轮 × 800 字上限只有约 1.9 万）
  assert.ok(sentChars > 28_000, `强档应喂进整段历史，实际 ${sentChars} 字符`);
  assert.ok(sentChars > 120 * 200, '远超 24 轮的限制');
});
