import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCard, validateCard, renderCard, toCheckpointFields, PROJECT_DELIVERY } from '../cards/project-delivery.mjs';

const base = {
  runId: 'R20261022-airbnb',
  sentence: '给我家 Airbnb 做全套上架包',
  scorecard: { overall: 4.03, axis_average: { commercial: 3.9, handoff: 4.5, craft: 4.5, benchmark: 2.8 } },
  stations: [
    { name: '07_site', label: '直订站', status: 'ok', score: 4.35 },
    { name: '02_pricing', label: '定价', status: 'warn', score: 3.2, note: '未过：comps_ge_10' },
    { name: '04_video', label: '看房视频', status: 'fail', score: 2.1, note: '编码失败' },
  ],
  artifacts: [{ label: '直订站', path: '07_site/site/index.html', kind: 'site', bytes: 21504 }],
  gaps: ['无动态定价数据源'],
  pendingOwner: ['原图 10–14 张'],
};

test('buildCard keeps the contract shape', () => {
  const card = buildCard(base);
  assert.equal(card.kind, PROJECT_DELIVERY);
  assert.equal(card.v, 1);
  assert.equal(card.id, 'pd_R20261022-airbnb');
  assert.equal(card.scorecard.overall, 4.03);
  assert.equal(card.scorecard.axes.craft, 4.5);
  assert.equal(card.stations.length, 3);
  assert.equal(card.artifacts[0].kind, 'site');
});

test('validateCard rejects missing runId / bad status', () => {
  const card = buildCard(base);
  assert.deepEqual(validateCard({ ...card, runId: '' }), ['runId required']);
  const bad = { ...card, stations: [{ ...card.stations[0], status: 'done' }] };
  assert.ok(validateCard(bad).some((p) => p.includes('bad status')));
});

test('renderCard surfaces failures with retry + human handoff', () => {
  const html = renderCard(buildCard(base));
  assert.match(html, /data-kind="project_delivery"/);
  assert.match(html, /看房视频/);
  assert.match(html, /pd-retry/);
  assert.match(html, /联系人工/);
  assert.match(html, /4\.03/);
});

test('a 3-station card does not claim ten', () => {
  const html = renderCard(buildCard(base));
  assert.equal((html.match(/pd-station /g) || []).length, 3);
});

test('toCheckpointFields mirrors what workbench.mjs saves', () => {
  const f = toCheckpointFields(buildCard(base));
  assert.equal(f.goal, '上架包 · R20261022-airbnb');
  assert.ok(f.progress.includes('1/3'));
  assert.equal(f.sources[0].kind, 'workbench-card');
  assert.equal(f.sources[0].data.kind, PROJECT_DELIVERY);
});
