// 车道 B：实体记忆的单元测试。全部离线、纯规则，不碰网络和模型。
// 守三件事：抽得准（有原话证据）、合得对（下周 ≠ 下周三）、挑得中（按话题相关）。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractEntities, mergeEntities, retrieveRelevant, formatForPrompt, KINDS, tokenize,
} from './entities.mjs';

const T0 = Date.parse('2026-10-01T02:00:00Z');
const turn = (role, text, minutesAfterT0 = 0) => ({
  role, text, at: new Date(T0 + minutesAfterT0 * 60_000).toISOString(),
});
const sub = (es, kind) => es.filter((e) => e.kind === kind);
const keys = (es, kind) => sub(es, kind).map((e) => e.key);

const CONVO = [
  turn('user', '你好，我是 Rolex Pty Ltd 的张总介绍来的，我们公司 ABN 53 004 085 616，年底要做招商视频。', 0),
  turn('assistant', '好的张总，先记下：Rolex Pty Ltd，ABN 53 004 085 616，年底招商视频。', 1),
  turn('user', '预算 1.2万元 左右，下周三给我看初稿，15号之前定稿。', 2),
];

test('从中文对话里抽出 org / id(ABN) / money / date', () => {
  const es = extractEntities(CONVO);

  const orgs = keys(es, 'org');
  assert.ok(orgs.includes('Rolex Pty Ltd'), `org: ${orgs.join('|')}`);
  assert.ok(!orgs.some((o) => o.includes('张总')), '称呼不能当成公司名');

  const ids = keys(es, 'id');
  assert.ok(ids.includes('ABN 53004085616'), `id: ${ids.join('|')}`);

  const money = keys(es, 'money');
  assert.ok(money.some((m) => m.includes('1.2万')), `money: ${money.join('|')}`);

  const dates = keys(es, 'date');
  assert.ok(dates.includes('下周三'), `date: ${dates.join('|')}`);
  assert.ok(dates.includes('15号'), `date: ${dates.join('|')}`);
  assert.ok(dates.includes('年底'), `date: ${dates.join('|')}`);

  // 中文有限公司也能抽
  assert.ok(keys(extractEntities([turn('user', '我们是蓝海文化有限公司，要做一条宣传片')]), 'org')
    .includes('蓝海文化有限公司'));
});

test('每条实体都带能逐字找到的原话证据和 ISO 时间', () => {
  const es = extractEntities(CONVO);
  const allText = CONVO.map((t) => t.text).join('\n');
  assert.ok(es.length > 0);
  for (const e of es) {
    assert.ok(KINDS.includes(e.kind), `kind 必须是白名单: ${e.kind}`);
    assert.equal(typeof e.key, 'string');
    assert.ok(e.key.length > 0);
    assert.equal(typeof e.evidence, 'string');
    assert.ok(allText.includes(e.evidence), `evidence 必须逐字出现在对话里: ${e.evidence}`);
    assert.ok(!Number.isNaN(Date.parse(e.at)), `at 应是 ISO: ${e.at}`);
  }
});

test('"下周"和"下周三"是两条，不会被合并', () => {
  const es = extractEntities([turn('user', '下周给你方案，但下周三一定要看到初稿')]);
  const ds = keys(es, 'date');
  assert.ok(ds.includes('下周'), `date: ${ds.join('|')}`);
  assert.ok(ds.includes('下周三'), `date: ${ds.join('|')}`);
  const merged = mergeEntities([], es);
  assert.equal(keys(merged, 'date').filter((d) => d.startsWith('下周')).length, 2,
    '合并后仍是两条独立的日期');
});

test('mergeEntities：同 kind+key 去重，value 取最新，evidence 累积最多 3 条', () => {
  const prev = [
    { kind: 'money', key: '预算 8000', value: '8000元', evidence: '预算 8000 元', at: '2026-09-01T00:00:00Z', seenCount: 1 },
    { kind: 'org', key: 'Rolex Pty Ltd', value: 'Rolex Pty Ltd', evidence: 'Rolex Pty Ltd 的开票', at: '2026-09-01T00:00:00Z', seenCount: 2 },
  ];
  const next = [
    { kind: 'money', key: '预算 8000', value: '8000元(含税)', evidence: '预算 8000 元', at: '2026-10-01T00:00:00Z' },
    { kind: 'money', kind2: null, key: '预算 12000', value: '1.2万元', evidence: '预算 1.2万元', at: '2026-10-01T00:00:00Z' },
    { kind: 'money', key: '预算 8000', value: '8000元(含税)', evidence: '再确认一次 8000 元含税', at: '2026-10-02T00:00:00Z' },
    { kind: 'money', key: '预算 8000', value: '8000元(含税)', evidence: '第四条证据', at: '2026-10-03T00:00:00Z' },
    { kind: 'money', key: '预算 8000', value: '8000元(含税)', evidence: '第五条证据', at: '2026-10-04T00:00:00Z' },
  ];
  const m = mergeEntities(prev, next);
  const m8000 = m.filter((e) => e.key === '预算 8000');
  assert.equal(m8000.length, 1, '同 key 只留一条');
  assert.equal(m8000[0].value, '8000元(含税)', 'value 取最新');
  assert.equal(m8000[0].evidence.length, 3, 'evidence 上限 3');
  assert.equal(m8000[0].evidence.filter((x) => x === '预算 8000 元').length, 1, 'evidence 去重');
  assert.equal(m8000[0].at, '2026-10-04T00:00:00Z', 'at 取最新');
  assert.ok(m8000[0].seenCount > 1, 'seenCount 累加');

  const rolex = m.find((e) => e.kind === 'org');
  // next 里没有出现 Rolex，所以它只保留库里的存量 2，不该凭空加 1
  assert.equal(rolex.seenCount, 2, 'next 未出现时保留存量，不虚增');
  assert.equal(m.filter((e) => e.key === '预算 12000').length, 1);
  assert.ok(m.length > 0);
});

test('mergeEntities：坏输入不炸、空输入返回空数组', () => {
  assert.deepEqual(mergeEntities([], []), []);
  assert.deepEqual(mergeEntities(undefined, undefined), []);
  assert.deepEqual(mergeEntities([null, 42, { kind: 'nope', key: 'x' }], [{ kind: 'org', key: '' }]), []);
});

test('retrieveRelevant：query 命中"视觉"时，年初那套视觉排在 Rolex 开票前面', () => {
  const entities = mergeEntities([], [
    { kind: 'id', key: 'Rolex 开票', value: 'Rolex Pty Ltd 开票', evidence: 'Rolex 开票先办', at: '2026-10-01T00:00:00Z' },
    { kind: 'project', key: '年初那套视觉', value: '年初那套视觉沿用', evidence: '年初那套视觉也要沿用', at: '2026-01-05T00:00:00Z' },
    { kind: 'money', key: '8000元', value: '8000元', evidence: '预算 8000 元', at: '2026-09-20T00:00:00Z' },
  ]);
  const got = retrieveRelevant(entities, '这次视觉要不要重做', { limit: 8 });
  assert.ok(got.length >= 1);
  assert.equal(got[0].key, '年初那套视觉');
  const iVisual = got.findIndex((e) => e.key === '年初那套视觉');
  const iRolex = got.findIndex((e) => e.key === 'Rolex 开票');
  assert.ok(iVisual >= 0);
  assert.ok(iRolex === -1 || iVisual < iRolex, `视觉应在开票前面: ${got.map((e) => e.key).join('|')}`);

  // limit 生效；无关词不凑数
  assert.equal(retrieveRelevant(entities, '视觉', { limit: 1 }).length, 1);
  assert.deepEqual(retrieveRelevant(entities, '完全无关的恐龙化石', {}), []);
  assert.deepEqual(retrieveRelevant([], '视觉'), []);
  assert.deepEqual(retrieveRelevant(null, '视觉'), []);

  // "最近用过"只是微调：老但相关的仍压过新但无关的
  const recent = { kind: 'date', key: '下周三', value: '下周三', evidence: '下周三', at: '2026-11-03T00:00:00Z' };
  const got2 = retrieveRelevant([recent, ...entities], '视觉', {});
  assert.equal(got2[0].key, '年初那套视觉');
});

test('tokenize：中文切 bigram + 英文单词', () => {
  const toks = tokenize('视觉 Visual 重做');
  assert.ok(toks.includes('视觉'));
  assert.ok(toks.includes('visual'));
  assert.ok(!toks.includes('the'));
  assert.deepEqual(tokenize(''), []);
});

test('formatForPrompt：空数组返回空串', () => {
  assert.equal(formatForPrompt([]), '');
  assert.equal(formatForPrompt(), '');
  assert.equal(formatForPrompt(null), '');
  assert.equal(formatForPrompt([{}, null]), '');
});

test('formatForPrompt：生成【记得的事】中文块', () => {
  const block = formatForPrompt([
    { kind: 'org', key: 'Rolex Pty Ltd', value: 'Rolex Pty Ltd' },
    { kind: 'project', key: '招商视频', value: '年底招商视频' },
    { kind: 'money', key: '1.2万元', value: '1.2万元' },
    { kind: 'date', key: '年底', value: '年底' },
    { kind: 'id', key: 'ABN 53004085616', value: 'ABN 53004085616' },
  ]);
  assert.ok(block.startsWith('【记得的事】'));
  assert.ok(block.includes('客户=Rolex Pty Ltd'));
  assert.ok(block.includes('项目=年底招商视频'));
  assert.ok(block.includes('金额=1.2万元'));
  assert.ok(block.includes('时间=年底'));
  assert.ok(block.includes('编号=ABN 53004085616'));
  assert.ok(block.includes('；'), '多条之间用分号');
});

test('extractEntities：空数组 / 脏输入不抛错', () => {
  assert.deepEqual(extractEntities([]), []);
  assert.deepEqual(extractEntities(), []);
  assert.deepEqual(extractEntities(null), []);
  assert.deepEqual(extractEntities(''), []);
  assert.deepEqual(extractEntities([{}, { text: '' }, null, 'x']), []);
  // 纯字符串也能抽
  assert.ok(keys(extractEntities('预算 500 块'), 'money').length === 1);
});

test('端到端：抽 → 合 → 按话题挑 → 渲染', () => {
  const first = extractEntities(CONVO);
  const later = extractEntities([turn('user', '对了，招商视频的视觉走日系清透，不要字太多', 60 * 24)]);
  const merged = mergeEntities(first, later);
  const picked = retrieveRelevant(merged, '招商视频的视觉风格', { limit: 8 });
  assert.ok(picked.length > 0);
  const block = formatForPrompt(picked);
  assert.ok(block.startsWith('【记得的事】'));
  assert.ok(block.includes('视觉') || block.includes('招商'));
  // 整条链路不产生重复
  const seen = new Set();
  for (const e of merged) {
    const k = `${e.kind}|${e.key}`;
    assert.ok(!seen.has(k), `重复实体: ${k}`);
    seen.add(k);
  }
});
