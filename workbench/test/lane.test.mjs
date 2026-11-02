// Lane routing: code cards go to the PC OpenCode worker, everything else stays
// on the default lane that the RunPod pipeline claims.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { laneFor } from '../workbench.mjs';

test('code markers route to the code lane', () => {
  assert.equal(laneFor('#code 修一下登录页'), 'code');
  assert.equal(laneFor('  [code] fix README'), 'code');
  assert.equal(laneFor('【代码】加单元测试'), 'code');
  assert.equal(laneFor('请 @opencode 看看这个 bug'), 'code');
  assert.equal(laneFor('自动标题\n#code 正文开头'), 'code');
  assert.equal(laneFor('正文里提到 #code 不算'), 'default');
});

test('everything else stays on the default lane', () => {
  assert.equal(laneFor('做一条宣传片'), 'default');
  assert.equal(laneFor('#codex 不是 code'), 'default');
  assert.equal(laneFor(''), 'default');
  assert.equal(laneFor(undefined), 'default');
});
