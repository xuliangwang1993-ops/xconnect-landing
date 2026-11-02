// 车道 C：话题切分的契约测试。
// 守的是三件事：切得可解释（每条规则各一个用例）、装得守预算、坏输入不抛错。
import test from 'node:test';
import assert from 'node:assert/strict';
import { assignTopics, selectTopics, describeTopics, MAX_TOPIC_TURNS, DEFAULT_IDLE_GAP_MS } from './topics.mjs';

const MIN = 60_000;
const T0 = Date.parse('2026-11-03T09:00:00Z');
const turn = (text, minutesAfterT0) => ({ role: 'user', text, at: new Date(T0 + minutesAfterT0 * MIN).toISOString() });

test('时间间隔超过阈值切新话题，阈值内不切', () => {
  const turns = [
    turn('发票抬头要开公司名', 0),
    turn('税号我一会儿发你', 5),
    turn('视频风格走日系清透', 6),        // 只隔 1 分钟 → 还在同一话题
    turn('上次那个片子剪完了吗', 120),    // 隔 2 小时 → 新话题
  ];
  const { topics, turnTopic } = assignTopics(turns, { now: T0 + 200 * MIN });
  assert.deepEqual(turnTopic, [0, 0, 0, 1]);
  assert.equal(topics.length, 2);
  assert.equal(topics[0].startIndex, 0);
  assert.equal(topics[0].endIndex, 2);
  assert.equal(topics[1].startIndex, 3);
  assert.equal(topics[1].reason, 'idle');
  // 刚好等于阈值不算超，不切
  const edge = assignTopics([turn('甲甲', 0), turn('乙乙', DEFAULT_IDLE_GAP_MS / MIN)], { now: T0 });
  assert.equal(edge.topics.length, 1, '恰好 30 分钟不切');
});

test('"另外 / 对了" 触发切分，且只看开头', () => {
  const turns = [
    turn('发票抬头帮我确认一下', 0),
    turn('另外还有个事，视频要竖屏', 1),
    turn('对了，报价单也发一份', 2),
    turn('刚才说的发票，中间提了一句另外的话', 3), // 不在开头，不切
  ];
  const { topics, turnTopic } = assignTopics(turns, { now: T0 + 10 * MIN });
  assert.deepEqual(turnTopic, [0, 1, 2, 2]);
  assert.equal(topics[1].reason, 'marker');
  assert.equal(topics[2].reason, 'marker');
});

test('单话题超过 40 轮强制切，且切点均匀', () => {
  const turns = Array.from({ length: 95 }, (_, i) => turn(`继续说话第${i}句`, i));
  const { topics, turnTopic } = assignTopics(turns, { now: T0 + 100 * MIN });
  assert.deepEqual(topics.map((t) => [t.startIndex, t.endIndex]), [
    [0, MAX_TOPIC_TURNS - 1], [MAX_TOPIC_TURNS, 2 * MAX_TOPIC_TURNS - 1], [2 * MAX_TOPIC_TURNS, 94],
  ]);
  assert.equal(topics[1].reason, 'len');
  assert.equal(new Set(turnTopic).size, 3);
  // 40 轮整不切（边界）
  const exact = Array.from({ length: 40 }, (_, i) => turn(`第${i}句内容`, i));
  assert.equal(assignTopics(exact, { now: T0 }).topics.length, 1);
});

test('当前话题很短时，selectTopics 会用预算把上一话题补进来', () => {
  const turns = [
    turn('发票抬头要公司名和税号', 0),
    turn('发票税率按 10% 走', 1),
    turn('发票开好发我邮箱', 2),
    turn('视频风格走日系清透', 60),
    turn('对，就这个感觉', 61),
  ];
  const { topics, turnTopic } = assignTopics(turns, { now: T0 + 70 * MIN });
  assert.deepEqual(turnTopic, [0, 0, 0, 1, 1]);

  const picked = selectTopics(topics, turnTopic, {
    activeTopicId: 'topic-2', relatedIds: ['topic-1'], budgetChars: 10_000, turns,
  });
  assert.deepEqual(picked, [0, 1, 2, 3, 4], '预算够 → 当前话题 + 上一话题全补');

  const picked2 = selectTopics(topics, turnTopic, { activeTopicId: 1, relatedIds: [0], budgetChars: 10_000, turns });
  assert.deepEqual(picked2, [0, 1, 2, 3, 4], '数字下标也认');
});

test('预算不够时不会越界，且不装半截话题', () => {
  const turns = [
    ...Array.from({ length: 6 }, (_, i) => turn(`发票发票发票发票第${i}句`, i)),          // 话题1
    ...Array.from({ length: 6 }, (_, i) => turn(`视频视频视频视频第${i}句`, 60 + i)),      // 话题2
    ...Array.from({ length: 6 }, (_, i) => turn(`报价报价报价报价第${i}句`, 120 + i)),     // 话题3
  ];
  const { topics, turnTopic } = assignTopics(turns, { now: T0 + 200 * MIN });
  assert.equal(topics.length, 3);
  const avgLen = turns.reduce((s, t) => s + t.text.length, 0) / turns.length;

  for (const budget of [0, 200, 400, 800, 5000]) {
    const picked = selectTopics(topics, turnTopic, {
      activeTopicId: 'topic-3', relatedIds: ['topic-2', 'topic-1'], budgetChars: budget, turns,
    });
    // 当前话题一定全在
    assert.deepEqual(picked.filter((i) => turnTopic[i] === 2), [12, 13, 14, 15, 16, 17], `budget=${budget} 当前话题不丢`);
    // 预算内（近似：下标数 × 平均长度 ≤ budget + 当前话题长度）
    const cost = picked.reduce((s, i) => s + turns[i].text.length, 0);
    assert.ok(cost <= budget + 6 * (avgLen + 8), `budget=${budget} 未越界，实际 ${cost}`);
    // 补进来的只能是整块话题：出现的话题集合要么空要么完整
    for (const t of topics) {
      const hit = picked.filter((i) => turnTopic[i] === topics.indexOf(t)).length;
      assert.ok(hit === 0 || hit === t.endIndex - t.startIndex + 1, '不装半截话题');
    }
  }
  // 预算只够一个相关话题时，先装新的（topic-2），不装旧的（topic-1）
  const cost = (a, b) => turns.slice(a, b).reduce((s, t) => s + t.text.length + 8, 0);
  const oneTopicCost = cost(6, 12);
  const tight = oneTopicCost * 2 - 1; // 会话总预算；当前话题已吃掉一半，剩下一半差 1 字装不下相关话题
  // 差一个字装不下最新的相关话题 → 停，不乱塞（不装半截、不降级）
  assert.deepEqual(selectTopics(topics, turnTopic, { activeTopicId: 'topic-3', relatedIds: ['topic-2', 'topic-1'], budgetChars: tight, turns }),
    [12, 13, 14, 15, 16, 17], '差一点就停，不硬塞');
  // 刚好够"当前 + 一个新话题" → 只装新的（topic-2），旧的（topic-1）差 1 字进不来
  assert.deepEqual(selectTopics(topics, turnTopic, { activeTopicId: 'topic-3', relatedIds: ['topic-2', 'topic-1'], budgetChars: oneTopicCost * 2 + 1, turns }),
    [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17], '新的先装，旧的装不下就停');
  // 总预算只够当前话题本身 → 一个相关话题都不装
  assert.deepEqual(selectTopics(topics, turnTopic, { activeTopicId: 'topic-3', relatedIds: ['topic-2', 'topic-1'], budgetChars: oneTopicCost, turns }),
    [12, 13, 14, 15, 16, 17], '预算被当前话题吃满后不再塞别的');
  // 预算更紧（0）→ 只剩当前话题
  assert.deepEqual(selectTopics(topics, turnTopic, { activeTopicId: 'topic-3', relatedIds: ['topic-2'], budgetChars: 0, turns }), [12, 13, 14, 15, 16, 17]);
});

test('空输入 / 坏输入不抛错', () => {
  assert.deepEqual(assignTopics([]), { topics: [], turnTopic: [] });
  assert.deepEqual(assignTopics(), { topics: [], turnTopic: [] });
  assert.deepEqual(assignTopics(null, { now: T0 }), { topics: [], turnTopic: [] });
  assert.deepEqual(selectTopics([], [], {}), []);
  assert.deepEqual(selectTopics(null, null, {}), []);
  assert.deepEqual(selectTopics([], [], { activeTopicId: 'x', relatedIds: null, budgetChars: NaN, turns: null }), []);
  assert.equal(describeTopics([]), '');
  assert.equal(describeTopics(), '');
  // 没有时间戳、没有 text 的脏数据也要能切
  const dirty = assignTopics([{ role: 'user' }, { role: 'assistant', content: '另外换个话题' }, null], { now: T0 });
  assert.equal(dirty.turnTopic.length, 3);
  assert.equal(dirty.topics.length, 2);
});

test('label 是最高频 2-4 个中文关键词，describeTopics 产出中文概括', () => {
  const turns = [
    turn('发票抬头要开公司名，发票税号也给我', 0),
    turn('发票开好了吗，发票金额对不对', 1),
    turn('好的，视频风格下午再说', 60),
    turn('视频走日系清透，视频配乐轻一点', 61),
  ];
  const { topics } = assignTopics(turns, { now: T0 + 70 * MIN });
  assert.equal(topics.length, 2);
  const words = topics[0].label.split('、');
  assert.ok(words.length >= 2 && words.length <= 4, `关键词 2-4 个，实际：${topics[0].label}`);
  assert.ok(topics[0].label.includes('发票'), `话题1 关键词应含发票：${topics[0].label}`);
  const desc = describeTopics(topics);
  assert.match(desc, /^话题1（第1-2轮）：/);
  assert.ok(desc.includes(' / 话题2（第3-4轮）：'), desc);
});
