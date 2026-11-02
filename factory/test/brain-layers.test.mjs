// 三层记忆（话题/实体/摘要）接进强档后的契约。
// 守两件事：关着时一个字节不变；开着时记忆块真的进了提示词。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrain } from '../brain/brain.mjs';
import { createBrainStore } from '../brain/store.mjs';

const REPLY = JSON.stringify({ reply_suggestion: '收到。', tasks: [], follow_up_questions: [], needs: [] });

function setup({ layers }) {
  const sent = [];
  const store = createBrainStore({ env: {} });
  const brain = createBrain({
    env: { BRAIN_MODEL_API_BASE: 'https://b.test/v1', BRAIN_MODEL_API_KEY: 'k', BRAIN_MEMORY_LAYERS: layers },
    store,
    strongTimeoutMs: 800,
    fetchImpl: async (_u, init) => {
      sent.push(JSON.parse(init.body));
      return { ok: true, text: async () => JSON.stringify({ choices: [{ message: { content: REPLY } }] }) };
    },
  });
  return { brain, sent };
}

const LONG = Array.from({ length: 60 }, (_, i) => ({
  role: i % 2 ? 'assistant' : 'user',
  text: i === 3 ? '年底要做一个澳洲本地的招商视频，预算八万' : `第${i}轮：片头字幕交付细节，${'细节'.repeat(30)}`,
}));

test('开关关着：走原来的整段装，不加任何额外块', async () => {
  const { brain, sent } = setup({ layers: 'off' });
  await brain.askStrong({ sessionId: 'off-1', turns: LONG });
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(sent.length, 1);
  const sys = sent[0].messages[0].content;
  assert.doesNotMatch(sys, /记得的事/);
  assert.doesNotMatch(sys, /早前对话摘要/);
});

test('开关打开：实体记忆块进了 system 提示', async () => {
  const { brain, sent } = setup({ layers: 'on' });
  await brain.askStrong({ sessionId: 'on-1', turns: LONG });
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(sent.length, 1);
  const sys = sent[0].messages[0].content;
  assert.match(sys, /记得的事/, '应该带上实体记忆块');
  // 三周前那条关键事实要能通过实体或话题带回来
  const all = sys + JSON.stringify(sent[0].messages);
  assert.match(all, /招商视频/, '关键事实不能丢');
});

test('开关打开但内容太短：不硬塞记忆块', async () => {
  const { brain, sent } = setup({ layers: 'on' });
  await brain.askStrong({ sessionId: 'on-2', turns: [{ role: 'user', text: '你好' }] });
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(sent.length, 1);
  assert.doesNotMatch(sent[0].messages[0].content, /记得的事/);
});
