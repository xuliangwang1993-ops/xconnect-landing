// 证据守卫：模型自说自话加的价格与交期，必须被拦下。
// 样例来自 2026-11-02 实测的 claude-haiku 输出（客户只说"预算别超过一万块"）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { scrub, unsupportedClaim, guardResult } from '../brain/guard.mjs';

const DIALOGUE = [
  '你好，我们下周想赶在墨尔本客户会前做 3 条短视频，能开票吗',
  '有，53 004 085 616，抬头写 Rolex Pty Ltd。我们更想先看样片再付尾款',
  '另外我们这次预算压得比较紧，最好别超过一万块',
].join('\n');

test('模型编的金额与交期：拦下，且说明拦的是哪一段', () => {
  const hallucinated = '你好，已记下您的信息。我这边先给您报个价：3条短视频是8000块，可以分两次付款——先付50%定金4000块，剩下4000块等您满意样片后再付。这个时间安排的话，我们下周一就能给您初稿，您觉得怎么样？';
  const r = scrub(hallucinated, DIALOGUE);
  assert.ok(r.dropped.length >= 2, '价格句与交期句两句都被拦下');
  const toks = r.dropped.map((d) => d.token).join(' ');
  assert.match(toks, /8000块/, '报价被拦');
  assert.match(toks, /下周一/, '交期被拦');
  assert.doesNotMatch(r.text, /8000|4000|50%|下周一/);
  assert.match(r.text, /已记下您的信息/, '有证据的部分要留下');
});

test('对话里确实说过的数字与时间：放行', () => {
  const ok = '我记下了：抬头 Rolex Pty Ltd，ABN 53 004 085 616。预算控制在一万块以内，下周五交片，可以吗？';
  const r = scrub(`客户说${DIALOGUE.split('\n')[0]}`, DIALOGUE);
  const good = scrub('我们下周给您 3 条，先看样片再付尾款。', DIALOGUE);
  assert.equal(good.dropped.length, 0, '下周 / 3 条 / 样片 都在对话里');
  assert.ok(r.dropped.length === 0, '客户原话本身当然有证据');
  assert.ok(unsupportedClaim('定金 200 块', DIALOGUE), '没出现过的金额要被抓到');
});

test('整份结论过守卫：空掉的追问直接丢掉，不硬留一句假话', () => {
  const out = guardResult({
    reply_suggestion: '好的，报价 8000 元，下周三交片。',
    follow_up_questions: [{ question: '定金 4000 元能先付吗？', basis: '客户：先看样片' }, { question: '您要什么风格？', basis: '客户：3 条短视频' }],
    tasks: [{ title: '报价', detail: '按 8000 元准备报价单', priority: 'normal' }],
    needs: [],
  }, DIALOGUE);
  assert.equal(out.result.reply_suggestion, '');
  assert.equal(out.result.follow_up_questions.length, 1);
  assert.equal(out.result.follow_up_questions[0].question, '您要什么风格？');
  assert.equal(out.result.tasks[0].detail, '', '任务说明也得干净');
  assert.ok(out.dropped.length >= 2);
  assert.ok(!JSON.stringify(out.result).match(/8000|4000|下周三/), '结论里不许残留编造的数字');
});
