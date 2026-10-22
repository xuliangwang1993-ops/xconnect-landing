// Tests for the project_delivery card: payload whitelisting + rendering contract.
//
// These are pure functions — no Supabase, no gateway — so they run anywhere with
// `node --test test/project-delivery.test.mjs`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CARD_TYPE, normalizeCard, overallScore, explainFailure, summarize,
} from '../cards/project-delivery.mjs';

const payload = {
  sentence: '给悉尼小锅米线（Slurp Slurp Noodle）做一支 30 秒宣传短视频，配中英字幕和三个社媒尺寸',
  run_id: '20261022T101010',
  scorecard: { brief: 4.6, collect: 3.8, script: 4.2, edit: 3.6, subs: 3.4, compose: 4.4, qa: 4.4, customer: 4.0 },
  stations: [
    { name: 'brief', status: 'done', score: 4.6 },
    { name: 'collect', status: 'attention', score: 3.8, checks_failed: [] },
    { name: 'script', status: 'done', score: 4.2 },
    { name: 'edit', status: 'done', score: 3.6 },
    { name: 'subs', status: 'done', score: 3.4 },
    { name: 'compose', status: 'done', score: 4.4 },
    { name: 'qa', status: 'done', score: 4.4 },
    { name: 'customer', status: 'done', score: 4.0 },
  ],
  artifacts: [
    { name: 'promo_9x16.mp4', path: 'runs/x/05_compose/promo_9x16.mp4', bytes: 12_000_000 },
    { name: 'promo_1x1.mp4', path: 'runs/x/05_compose/promo_1x1.mp4', bytes: 8_000_000 },
    { name: 'promo_16x9.mp4', path: 'runs/x/05_compose/promo_16x9.mp4', bytes: 9_000_000 },
    { name: 'zh.srt', path: 'runs/x/05_compose/zh.srt', bytes: 900 },
    { name: 'cover_9x16.jpg', path: 'runs/x/05_compose/cover_9x16.jpg', bytes: 240_000 },
  ],
  gaps: ['客户实拍素材未到'],
  pending_customer: ['店名（中文）', '营业时间'],
};

test('normalizeCard keeps the contract fields and derives status', () => {
  const card = normalizeCard(payload);
  assert.equal(card.type, CARD_TYPE);
  assert.equal(card.runId, '20261022T101010');
  assert.equal(card.stations.length, 8);
  assert.equal(card.artifacts.length, 5);
  assert.equal(card.status, 'attention', '一站 attention → 整卡 attention');
  assert.equal(card.stations[0].label, '需求解析');
});

test('artifact kinds are inferred from the filename', () => {
  const card = normalizeCard(payload);
  const kinds = Object.fromEntries(card.artifacts.map((a) => [a.name, a.kind]));
  assert.equal(kinds['promo_9x16.mp4'], 'video');
  assert.equal(kinds['zh.srt'], 'subtitle');
  assert.equal(kinds['cover_9x16.jpg'], 'image');
});

test('scores outside 0..5 are dropped, never clamped silently', () => {
  const card = normalizeCard({ ...payload, scorecard: { a: 4.5, b: 9, c: 'x', d: -1 } });
  assert.deepEqual(Object.keys(card.scorecard), ['a']);
});

test('a failed station flips the whole card to failed and gets a plain-language plan', () => {
  const card = normalizeCard({
    ...payload,
    stations: [
      { name: 'brief', status: 'done', score: 4.6 },
      { name: 'compose', status: 'failed', checks_failed: ['S5-9:16'] },
    ],
  });
  assert.equal(card.status, 'failed');
  const plan = explainFailure(card.stations[1]);
  assert.match(plan.title, /合成导出/);
  assert.match(plan.body, /S5-9:16/);
  assert.deepEqual(plan.actions.map((a) => a.id), ['retry', 'human']);
});

test('a payload with no stations is refused, not rendered as an empty success', () => {
  const card = normalizeCard({ sentence: 'x', stations: [] });
  assert.equal(card.status, 'running');
  assert.equal(card.stations.length, 0);
  assert.equal(overallScore(card), null);
});

test('summarize counts deliverables and pending items', () => {
  const s = summarize(normalizeCard(payload));
  // one station is `attention`, so 7 of 8 count as done — the summary must say that,
  // not round up to "all done"
  assert.match(s.line, /7\/8 站完成/);
  assert.match(s.line, /5 个交付文件/);
  assert.match(s.line, /2 项待客户/);
  assert.equal(s.tone.tone, 'warn');
});

// ---- server-side whitelisting (the payload the browser may POST) ------------
import { wbStore } from '../workbench.mjs';

test('server rejects a delivery payload with no stations', () => {
  assert.equal(wbStore.normalizeDelivery({ sentence: 'x', stations: [] }), null);
  assert.equal(wbStore.normalizeDelivery(null), null);
  assert.equal(wbStore.normalizeDelivery('nope'), null);
});

test('server clamps scores, statuses and drops unknown fields', () => {
  const d = wbStore.normalizeDelivery({
    run_id: 'r1', sentence: 's',
    scorecard: { a: 4.2, b: 99, c: 'x' },
    stations: [
      { name: 'brief', status: 'done', score: 4.2 },
      { name: 'qa', status: 'exploded', score: -3, checks_failed: ['S6-01'] },
    ],
    artifacts: [{ name: 'promo_9x16.mp4', path: 'runs/r1/promo_9x16.mp4', bytes: 12 }],
    gaps: ['g'], pending_customer: ['p'],
    __proto__evil: 'x', secret: 'should not survive',
  });
  assert.equal(d.scorecard.a, 4.2);
  assert.equal(d.scorecard.b, undefined, 'out-of-range score dropped');
  assert.equal(d.stations[1].status, 'attention', 'unknown status downgraded, not trusted');
  assert.equal(d.stations[1].score, 0, 'negative score clamped to 0');
  assert.equal(d.artifacts[0].kind, 'video');
  assert.equal(d.secret, undefined);
});

test('a delivery card without artifacts is still valid (nothing shipped yet)', () => {
  const d = wbStore.normalizeDelivery({
    run_id: 'r2', stations: [{ name: 'brief', status: 'running' }],
  });
  assert.deepEqual(d.artifacts, []);
  assert.equal(d.stations[0].status, 'running');
});
