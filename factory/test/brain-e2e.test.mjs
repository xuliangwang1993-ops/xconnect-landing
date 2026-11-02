// 端到端：一段真实感对话 → 总脑 → 追问 / 需求 → 转任务进 work_nodes。
// 模型是假的（按"只依据证据"的纪律手写结论），但 HTTP、存储、去重、派发全是真的。
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createBrain } from '../brain/brain.mjs';
import { createBrainStore } from '../brain/store.mjs';
import { createBrainApi } from '../brain/api.mjs';
import { createTreeStore } from '../tree/tree.mjs';

// —— 一段真实的客户对话（发票 / 素材 / 交期）——
const DIALOGUE = [
  { role: 'user', text: '你好，我们下周想把 3 条短视频做出来，能开票吗' },
  { role: 'assistant', text: '可以开。您有 ABN 吗？我先帮您把抬头记下来。' },
  { role: 'user', text: '有，53 004 085 616，抬头写 Rolex Pty Ltd。说实话我们更想先看样片再付尾款' },
  { role: 'assistant', text: '明白，尾款等样片确认后再付。' },
  { role: 'user', text: '对了，我们墨尔本这边下周五要发给客户，最晚能什么时候给我' },
];

// 用一句严格的"考官"提示：只允许摘录上面出现过的原话。
const BRAIN_JSON = JSON.stringify({
  reply_suggestion: '我先按 53 004 085 616 把 Rolex Pty Ltd 的抬头记下：样片您先看，尾款确认后再付，对吗？',
  tasks: [
    { title: '核对 ABN 53 004 085 616', detail: '客户给的是 Rolex Pty Ltd，先在 ABR 查名称是否一致', priority: 'high' },
  ],
  follow_up_questions: [
    { question: '我把刚才说的整理了一下：您下周五要交 3 条片，是先看样片再付尾款，对吗？', basis: '客户：我们下周想把 3 条短视频做出来' },
  ],
  needs: [
    { need: '开票（可开 ABN 发票）', evidence: '你好，我们下周想把 3 条短视频做出来，能开票吗', confidence: 0.9 },
    { need: '样片后再付尾款的分期付款', evidence: '我们更想先看样片再付尾款', confidence: 0.75 },
  ],
});

function fakeModel(calls = []) {
  return async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return { ok: true, text: async () => JSON.stringify({ choices: [{ message: { content: BRAIN_JSON } }] }) };
  };
}

function brainFixture(calls = []) {
  const store = createBrainStore({ env: {} });
  const tree = createTreeStore({ env: {} });
  const brain = createBrain({ env: { BRAIN_MODEL_API_BASE: 'https://brain.test/v1', BRAIN_MODEL_API_KEY: 'k' }, store, fetchImpl: fakeModel(calls) });
  const api = createBrainApi({ brain, store, tree, getSession: () => ({ user: { id: 'u' }, ns: 'owner' }) });
  return { store, tree, brain, api };
}

/** 直接喂给 handler 的假 req/res，避免起端口。 */
function call(api, { method = 'GET', url, body }) {
  return new Promise((resolve) => {
    const req = new http.IncomingMessage(null);
    req.method = method;
    req.url = url;
    req.headers = {};
    const res = {
      code: 0, payload: '',
      writeHead(c) { this.code = c; },
      end(b) { this.payload = b ? String(b) : ''; resolve({ code: this.code, json: this.payload ? JSON.parse(this.payload) : null }); },
    };
    const real = Object.create(req);
    Object.assign(real, { on: (ev, fn) => { if (ev === 'data' && body !== undefined) fn(Buffer.from(JSON.stringify(body))); if (ev === 'end') fn(); return real; } });
    api.handle(real, res).then((handled) => { if (!handled) resolve({ code: 0, json: null }); });
  });
}

test('端到端：真实对话 → 追问 + 需求落库 → 去重 → 一键转任务', async () => {
  const calls = [];
  const { api, brain, tree } = brainFixture(calls);

  // 1) 每一轮都进 brain_turns
  for (const t of DIALOGUE) {
    const r = await call(api, { method: 'POST', url: '/api/brain/turn', body: { sessionId: 'conv-1', role: t.role, text: t.text, assistantId: 'brain' } });
    assert.equal(r.code, 201);
  }

  // 2) 先问总脑：带整段对话进去，带回建议回复
  const ask = await call(api, { method: 'POST', url: '/api/brain/ask', body: { sessionId: 'conv-1', turns: DIALOGUE, assistantId: 'brain' } });
  assert.equal(ask.code, 200);
  assert.equal(ask.json.ok, true);
  assert.match(ask.json.reply, /53 004 085 616/);
  assert.equal(ask.json.tasks[0].title, '核对 ABN 53 004 085 616');
  assert.match(ask.json.questions[0].question, /整理了一下/);
  assert.equal(ask.json.needs.length, 2);
  assert.equal(calls.length, 1);
  // 模型收到的确实是完整对话 + 证据纪律
  const sent = calls[0].body.messages;
  assert.match(sent[0].content, /不准编造/);
  assert.match(sent[1].content, /Rolex Pty Ltd/);
  assert.match(sent[1].content, /下周五/);

  // 3) 需求进表，且两条
  const needs = await call(api, { method: 'GET', url: '/api/brain/needs' });
  assert.equal(needs.json.needs.length, 2);
  assert.equal(needs.json.needs[0].status, 'open');
  assert.ok(needs.json.needs.every((n) => n.evidence.length > 0), '每条需求都有原话依据');
  assert.ok(needs.json.needs[0].confidence >= needs.json.needs[1].confidence, '按置信度排序');

  // 4) 再问一次同一段对话：同一件事不重复入库
  await call(api, { method: 'POST', url: '/api/brain/ask', body: { sessionId: 'conv-1', turns: DIALOGUE } });
  const again = await call(api, { method: 'GET', url: '/api/brain/needs' });
  assert.equal(again.json.needs.length, 2, '同一需求只留一行，置信度只升不降');

  // 5) 客户确认后一键转任务：进 work_nodes（不是另一套系统）
  const target = again.json.needs.find((n) => n.need.includes('开票'));
  const conv = await call(api, { method: 'POST', url: `/api/brain/needs/${encodeURIComponent(target.id)}/convert` });
  assert.equal(conv.code, 201);
  assert.equal(conv.json.node.kind, 'ticket');
  assert.equal(conv.json.node.stage, 'idea');
  assert.match(conv.json.node.title, /开票/);
  const nodes = await tree.list();
  assert.equal(nodes.length, 1, '确实落在 work_nodes 同一个 store 里');
  const twice = await call(api, { method: 'POST', url: `/api/brain/needs/${encodeURIComponent(target.id)}/convert` });
  assert.equal(twice.code, 409, '转过的需求不再重复建任务');

  // 6) 总脑给的任务也能直接派进 work_nodes
  const tasks = await call(api, { method: 'POST', url: '/api/brain/tasks', body: { sessionId: 'conv-1', tasks: ask.json.tasks } });
  assert.equal(tasks.code, 201);
  assert.equal(tasks.json.nodes[0].title, '核对 ABN 53 004 085 616');
  assert.equal((await tree.list()).length, 2);
});

test('端到端：追问频率上限 + 同一件事不重复问', async () => {
  const { api } = brainFixture();
  const first = await call(api, { method: 'POST', url: '/api/brain/proactive', body: { sessionId: 'conv-2', turns: DIALOGUE, lastLookAt: 0 } });
  assert.match(first.json.question, /整理了一下/);
  const immediate = await call(api, { method: 'POST', url: '/api/brain/proactive', body: { sessionId: 'conv-2', turns: DIALOGUE } });
  assert.equal(immediate.json.reason, 'too_soon');
  const off = await call(api, { method: 'PUT', url: '/api/brain/settings', body: { proactive: false } });
  assert.equal(off.json.proactive, false);
  const whenOff = await call(api, { method: 'POST', url: '/api/brain/proactive', body: { sessionId: 'conv-3', turns: DIALOGUE } });
  assert.equal(whenOff.json.reason, 'disabled', '设置里关掉就不打扰');
  const on = await call(api, { method: 'PUT', url: '/api/brain/settings', body: { proactive: true } });
  assert.equal(on.json.proactive, true, '默认开；这里验证可再打开');
});

test('端到端：没登录拿不到总脑接口', async () => {
  const store = createBrainStore({ env: {} });
  const brain = createBrain({ env: {}, store });
  const api = createBrainApi({ brain, store, tree: createTreeStore({ env: {} }), getSession: () => null });
  const r = await call(api, { method: 'GET', url: '/api/brain/needs' });
  assert.equal(r.code, 401);
});

test('健康检查只说"缺什么"，不吐密钥', async () => {
  const store = createBrainStore({ env: {} });
  const brain = createBrain({ env: {}, store });
  const api = createBrainApi({ brain, store, tree: createTreeStore({ env: {} }), getSession: () => ({}) });
  const r = await call(api, { method: 'GET', url: '/api/brain/health' });
  assert.equal(r.code, 200);
  assert.equal(r.json.configured, false);
  assert.deepEqual(r.json.missing, ['BRAIN_MODEL_API_BASE', 'BRAIN_MODEL_API_KEY']);
  assert.doesNotMatch(JSON.stringify(r.json), /sk-|Bearer /);
});

test('端到端：智库（强档）——发起立刻 202，结论稍后能取走', async () => {
  const store = createBrainStore({ env: {} });
  const tree = createTreeStore({ env: {} });
  const brain = createBrain({
    env: { BRAIN_MODEL_API_BASE: 'https://brain.test/v1', BRAIN_MODEL_API_KEY: 'k' }, store,
    fetchImpl: fakeModel([]), timeoutMs: 10, strongTimeoutMs: 600,
  });
  const api = createBrainApi({ brain, store, tree, getSession: () => ({ user: { id: 'u' } }) });
  const t0 = Date.now();
  const r = await call(api, { method: 'POST', url: '/api/brain/strong', body: { sessionId: 'conv-9', turns: DIALOGUE } });
  assert.equal(r.code, 202);
  assert.ok(Date.now() - t0 < 200, '发起不能等模型');
  let items = [];
  for (let i = 0; i < 30 && !items.length; i++) {
    await new Promise((x) => setTimeout(x, 20));
    items = (await call(api, { method: 'GET', url: '/api/brain/pending?sessionId=conv-9' })).json.items;
  }
  assert.equal(items.length, 1, '结论要能从送达箱取到');
  assert.match(items[0].reply, /53 004 085 616/);
  const again = (await call(api, { method: 'GET', url: '/api/brain/pending?sessionId=conv-9' })).json.items;
  assert.equal(again.length, 0, '取走即删，不重复送达');
});
