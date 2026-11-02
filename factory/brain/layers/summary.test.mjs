// 车道 A：滚动摘要层的单元测试。全部离线，不碰网络和模型。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldSummarize, summarize, mergeSummary, formatForPrompt, normalizeSummary,
} from './summary.mjs';

const turn = (role, text, id) => ({ role, text, ...(id !== undefined ? { id } : {}) });
// 每条成本 = 正文长度 + 8
const pad = (n) => 'x'.repeat(n);

test('shouldSummarize：远低于 0.7 倍不触发', () => {
  const turns = [turn('user', pad(20), 1), turn('assistant', pad(12), 2)]; // 28+20 = 48
  assert.equal(shouldSummarize({ turns, budgetChars: 100 }), false);  // 48 < 70
});

test('shouldSummarize：刚好等于 0.7 倍不触发，超一点就触发', () => {
  // 成本 = 正文长度 + 8；预算 1000 → 阈值 700
  const pair = (total) => {
    const a = Math.floor((total - 16) / 2);
    return [turn('user', pad(a), 1), turn('assistant', pad(total - 16 - a), 2)];
  };
  assert.equal(shouldSummarize({ turns: pair(700), budgetChars: 1000 }), false); // 刚好 0.7
  assert.equal(shouldSummarize({ turns: pair(701), budgetChars: 1000 }), true);  // 超过
  assert.equal(shouldSummarize({ turns: pair(699), budgetChars: 1000 }), false); // 没超过
  // 已有摘要时门槛略放宽（0.6）：同样 701 字符仍然触发，但 650 也触发
  assert.equal(shouldSummarize({ turns: pair(650), budgetChars: 1000, alreadySummarized: true }), true);
  assert.equal(shouldSummarize({ turns: pair(650), budgetChars: 1000 }), false);
});

test('shouldSummarize：脏输入不炸（空数组/无预算/单轮）', () => {
  assert.equal(shouldSummarize({}), false);
  assert.equal(shouldSummarize({ turns: [turn('user', pad(500))], budgetChars: 100 }), false);
  assert.equal(shouldSummarize({ turns: [turn('user', pad(500)), turn('assistant', pad(500))], budgetChars: 0 }), false);
});

test('summarize：正常 JSON 解析，coveredUpTo 取最后一条的 id', async () => {
  const seen = [];
  const callModel = async ({ system, user }) => {
    seen.push({ system, user });
    return '```json\n' + JSON.stringify({
      who: 'ABC 贸易（澳洲）', wants: ['报价单'], promised: ['24 小时内给报价'], open: ['待客户确认 ABN'],
      facts: ['客户说 ABN 12 345 678 901', '预算 4500 澳元'],
    }) + '\n```';
  };
  const turns = [turn('user', '你好，我们公司叫 ABC', 11), turn('assistant', '好的，24 小时内给报价', 12)];
  const r = await summarize({ turns, callModel });
  assert.equal(r.degraded, false);
  assert.equal(r.coveredUpTo, '12');
  assert.equal(r.summary.who, 'ABC 贸易（澳洲）');
  assert.deepEqual(r.summary.wants, ['报价单']);
  assert.deepEqual(r.summary.facts, ['客户说 ABN 12 345 678 901', '预算 4500 澳元']);
  assert.ok(r.chars > 0);
  // prompt 里要带上字段说明
  assert.match(seen[0].user, /promised/);
  assert.match(seen[0].system, /不许编造/);
});

test('summarize：没有 id 时 coveredUpTo 用数组下标', async () => {
  const r = await summarize({ turns: [turn('user', 'a'), turn('assistant', 'b')], callModel: async () => '{"wants":["x"]}' });
  assert.equal(r.coveredUpTo, 1);
});

test('summarize：模型回一段普通文字（无 JSON）→ 降级不抛错', async () => {
  const turns = [turn('user', '我们想做大洋洲市场拓展，预算五万澳元整', 1)];
  const r = await summarize({ turns, callModel: async () => '客户想拓展大洋洲市场，预算五万。' });
  assert.equal(r.degraded, true);
  assert.equal(r.summary.who, '');
  assert.deepEqual(r.summary.wants, []);
  assert.equal(r.summary.facts.length, 1);
  assert.ok(r.summary.facts[0].length <= 60);
  assert.ok(turns[0].text.startsWith(r.summary.facts[0]));
  assert.equal(r.coveredUpTo, '1');
});

test('summarize：callModel 抛错 → 降级不抛错', async () => {
  const turns = [turn('user', '第一条', 5), turn('assistant', '第二条', 6)];
  const r = await summarize({ turns, callModel: async () => { throw new Error('brain_timeout'); } });
  assert.equal(r.degraded, true);
  assert.equal(r.summary.facts.length, 2);
  assert.equal(r.coveredUpTo, '6');
});

test('summarize：模型返回空串 / 空 JSON → 降级；无 callModel 也降级', async () => {
  const turns = [turn('user', '只有一句话', 3)];
  for (const raw of ['', '   ', '{}', '{"who":"","wants":[],"promised":[],"open":[],"facts":[]}']) {
    const r = await summarize({ turns, callModel: async () => raw });
    assert.equal(r.degraded, true, `raw=${JSON.stringify(raw)}`);
    assert.deepEqual(r.summary.facts, ['只有一句话']);
  }
  const r2 = await summarize({ turns });
  assert.equal(r2.degraded, true);
  assert.deepEqual(r2.summary.facts, ['只有一句话']);
});

test('summarize：降级摘要仍与上一版合并，不会丢掉已压缩的要点', async () => {
  const prev = { who: '老客户', wants: ['续约'], promised: [], open: [], facts: [] };
  const r = await summarize({ turns: [turn('user', '随便说说', 9)], prevSummary: prev, callModel: async () => '坏了' });
  assert.equal(r.degraded, true);
  assert.equal(r.summary.who, '老客户');
  assert.deepEqual(r.summary.wants, ['续约']);
});

test('summarize：没有轮次时原样交回上一版，coveredUpTo 为 null', async () => {
  const prev = { who: 'A', wants: ['b'], promised: [], open: [], facts: [] };
  const r = await summarize({ turns: [], prevSummary: prev, callModel: async () => { throw new Error('不该被调用'); } });
  assert.equal(r.coveredUpTo, null);
  assert.equal(r.summary.who, 'A');
  assert.deepEqual(r.summary.wants, ['b']);
});

test('mergeSummary：去重，大小写与标点差异视为同一件事', () => {
  const prev = { who: 'ABC Ltd', wants: ['要报价单', '要物流方案'], promised: [], open: [], facts: ['ABN 123'] };
  const next = {
    who: 'ABC Ltd（悉尼）',
    wants: ['要 报价单。', '要发票模板'],   // 第一条与上版重复（空格+句号差异）
    promised: ['24h 内给报价'],
    open: [],
    facts: ['abn 123', '预算 4500 AUD'],      // 第一条大小写差异视为重复
  };
  const m = mergeSummary(prev, next);
  assert.deepEqual(m.wants, ['要物流方案', '要 报价单。', '要发票模板']);
  // 同一件事（仅大小写差异）只留一次，且保留最新一版的写法
  assert.deepEqual(m.facts, ['abn 123', '预算 4500 AUD']);
  assert.equal(m.who, 'ABC Ltd（悉尼）'); // who 取最新
  assert.deepEqual(m.promised, ['24h 内给报价']);
});

test('mergeSummary：每项最多 20 条，保留最新的', () => {
  const prev = { wants: Array.from({ length: 15 }, (_, i) => `旧${i}`) };
  const next = { wants: Array.from({ length: 15 }, (_, i) => `新${i}`) };
  const m = mergeSummary(prev, next);
  assert.equal(m.wants.length, 20);
  assert.equal(m.wants.at(-1), '新14');
  assert.equal(m.wants[0], '旧10'); // 最旧的被挤出去
});

test('mergeSummary：脏输入（null / 非数组）不炸', () => {
  assert.deepEqual(mergeSummary(null, null), normalizeSummary(null));
  const m = mergeSummary({ wants: '要报价' }, { open: [1, 2, { text: '待确认' }] });
  assert.deepEqual(m.wants, ['要报价']);
  assert.deepEqual(m.open, ['待确认']);
});

test('formatForPrompt：空摘要返回空字符串', () => {
  assert.equal(formatForPrompt(null), '');
  assert.equal(formatForPrompt(undefined), '');
  assert.equal(formatForPrompt({}), '');
  assert.equal(formatForPrompt({ who: '', wants: [], promised: [], open: [], facts: [] }), '');
});

test('formatForPrompt：有内容时带标题和分段', () => {
  const s = formatForPrompt({ who: 'ABC', wants: ['报价单'], promised: ['24h 给价'], open: ['确认 ABN'], facts: ['预算 4500'] });
  assert.match(s, /^【早前对话摘要（已压缩，原文仍在库里）】/);
  assert.match(s, /谁：ABC/);
  assert.match(s, /要什么：报价单/);
  assert.match(s, /已承诺：24h 给价/);
  assert.match(s, /待办：确认 ABN/);
  assert.match(s, /关键事实：预算 4500/);
});
