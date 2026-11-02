// 第 2 步：总脑结构化输出的契约测试。
// 真实模型会给什么，这里不猜；这里守的是"不管给什么，出去的一定是干净的四件套"。
import test from 'node:test';
import assert from 'node:assert/strict';
import { SYSTEM_PROMPT, buildMessages, extractJson, normalizeBrain, parseBrainText, fingerprint } from '../brain/prompt.mjs';

const SAMPLE = JSON.stringify({
  reply_suggestion: '桂皮这次要的是能开票的发票抬头，我先帮你把税号核一遍。',
  tasks: [
    { title: '核对 Rolex 发票抬头', detail: '客户要开票，先确认 ABN 与公司名', priority: 'high' },
    { title: '整理本周素材', detail: '把 3 条竖屏素材归档', priority: '明天就' },
  ],
  follow_up_questions: [
    { question: '我把刚才说的整理了一下：你是要先开票，还是先出片？', basis: '客户：先给我开票，片子晚点' },
  ],
  needs: [
    { need: '开票（invoice）能力', evidence: '客户：先给我开票，片子晚点', confidence: 0.86 },
    { need: '不存在的需求', evidence: '客户：随便聊聊', confidence: 1.7 },
    { need: '空需求', evidence: '', confidence: 'x' },
    { need: '第四条会被截断', evidence: '客户：还有吗', confidence: 0.3 },
  ],
});

test('合法 JSON：四个字段齐全，类型正确', () => {
  const b = normalizeBrain(extractJson(SAMPLE));
  assert.equal(typeof b.reply_suggestion, 'string');
  assert.ok(b.reply_suggestion.includes('发票'));
  assert.equal(b.tasks.length, 2);
  assert.deepEqual(Object.keys(b.tasks[0]).sort(), ['detail', 'priority', 'title']);
  assert.equal(b.tasks[1].priority, 'normal', '非法优先级回落 normal，不吞掉任务');
  assert.equal(b.follow_up_questions.length, 1);
  assert.equal(b.needs.length, 3, '超过 3 条截断；空需求丢弃');
  assert.equal(b.needs[1].confidence, 1, '置信度夹到 [0,1]');
  assert.equal(b.needs[0].evidence[0], '客户：先给我开票，片子晚点');
});

test('```json 代码块包裹、前后带废话，都能抠出来', () => {
  const fenced = '好的，这是结果：\n```json\n' + SAMPLE + '\n```\n以上。';
  assert.ok(normalizeBrain(extractJson(fenced)).reply_suggestion.length > 0);
  const inline = '分析如下 ' + SAMPLE + ' 完毕';
  assert.equal(normalizeBrain(extractJson(inline)).tasks.length, 2);
});

test('坏输入一律退化为空结构，绝不抛错', () => {
  for (const bad of ['', 'not json', '{"reply_suggestion": ', null, undefined, 42, '[]']) {
    const b = parseBrainText(bad);
    assert.deepEqual(b, { reply_suggestion: '', tasks: [], follow_up_questions: [], needs: [] }, `bad=${String(bad)}`);
  }
});

test('字段别名（reply / description / follow_ups / 字符串形态的追问）也认', () => {
  const b = normalizeBrain({
    reply: '收到，我看一下。',
    tasks: [{ title: '查 ABN', description: '去 ABR 查', priority: 'urgent' }],
    follow_ups: ['你说的墨尔本是哪个区？'],
    needs: [{ need: '本地上门', confidence: 0.5 }],
  });
  assert.equal(b.reply_suggestion, '收到，我看一下。');
  assert.equal(b.tasks[0].detail, '去 ABR 查');
  assert.equal(b.tasks[0].priority, 'urgent');
  assert.equal(b.follow_up_questions[0].question, '你说的墨尔本是哪个区？');
  assert.deepEqual(b.needs[0].evidence, [], '需求没给依据就留空，不编');
});

test('提示词里有三条硬纪律：中立、只用证据、禁止编造', () => {
  assert.match(SYSTEM_PROMPT, /冷静/);
  assert.match(SYSTEM_PROMPT, /证据/);
  assert.match(SYSTEM_PROMPT, /不准编造/);
  assert.match(SYSTEM_PROMPT, /直接输出 JSON/);
  assert.match(SYSTEM_PROMPT, /第一句就必须是 \{/);
  assert.match(SYSTEM_PROMPT, /reply_suggestion/);
  assert.match(SYSTEM_PROMPT, /follow_up_questions/);
  assert.match(SYSTEM_PROMPT, /needs/);
});

test('prompt 组装：带上角色、助手、意图', () => {
  const m = buildMessages({ turns: [{ role: 'user', text: '我要开票' }, { role: 'assistant', text: '好的', assistant: 'brain' }], assistants: { brain: '诸葛亮' }, intent: 'proactive', lang: 'zh' });
  assert.equal(m[0].role, 'system');
  assert.match(m[1].content, /客户：我要开票/);
  assert.match(m[1].content, /小助手\(brain\)：好的/);
  assert.match(m[1].content, /brain=诸葛亮/);
  assert.match(m[1].content, /对话停顿时的回看/);
});

test('指纹忽略标点空白：同一件事只算一次', () => {
  assert.equal(fingerprint('做一个小程序！'), fingerprint('做 一个 小程序'));
  assert.notEqual(fingerprint('做一个小程序'), fingerprint('做一个小游戏'));
});

test('模型没守 JSON：中文引号 / 伪 key: 值 也能兜住（实测 haiku 会这么回）', () => {
  const pseudo = '根据对话上下文，小助手现在应该说：\n\n{\n  reply_suggestion: 好的，我记下了：ABN 53 004 085 616。\n  follow_up_questions: [{ question: “您要什么风格？”, basis: “客户：3 条短视频” }]\n}';
  const b = parseBrainText(pseudo);
  assert.match(b.reply_suggestion, /53 004 085 616/);
  assert.equal(b.follow_up_questions[0].question, '您要什么风格？');
});

test('模型把中文塞进 \\u 转义：照样解出来', () => {
  const b = parseBrainText('{"reply_suggestion":"\\u4f60\\u597d"}');
  assert.equal(b.reply_suggestion, '你好');
});
