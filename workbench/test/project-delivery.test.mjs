import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildProjectDeliveryCard, validateProjectDelivery, weighted } from '../project-delivery.mjs';
import { renderDeliveryPanel } from '../public/project-delivery-view.js';

function fakeRun(man, withExport = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-'));
  const rd = path.join(root, 'runs', man.run_id);
  const w = (p, o) => { fs.mkdirSync(path.dirname(path.join(rd, p)), { recursive: true }); fs.writeFileSync(path.join(rd, p), typeof o === 'string' ? o : JSON.stringify(o)); };
  w('manifest.json', man);
  w('01_ingest/qa.json', { pass: true });
  w('01_ingest/scorecard.json', { commercial: 2, handoff: 5, craft: 3, benchmark: 3 });
  w('01_ingest/facts.json', { facts: [{ field: 'phone', status: 'verified' }, { field: 'hours', status: 'conflict', note: '两个来源' }] });
  w('01_ingest/media_manifest.json', { media: [{ role: 'placeholder' }] });
  if (withExport) for (const f of ['promo_9x16.mp4', 'cover_9x16.jpg', 'zh.srt', 'work_master.mp4']) w('05_export/' + f, 'x');
  return root;
}

test('ok run → valid card with artifacts and pending list', () => {
  const root = fakeRun({ run_id: 'r1', sentence: '做一支 30 秒视频', status: 'ok' });
  const c = buildProjectDeliveryCard(root, 'r1');
  assert.deepEqual(validateProjectDelivery(c), []);
  assert.equal(c.delivery.artifacts.length, 3); // work_master 不算交付
  assert.ok(c.delivery.pending_customer.some((x) => x.startsWith('hours')));
  assert.ok(c.delivery.pending_customer.includes('官网图片书面授权'));
  assert.equal(c.status, 'review');
});

test('failed run → failed station has human explanation + retry/contact', () => {
  const root = fakeRun({ run_id: 'r2', sentence: 's', status: 'failed', failed_station: '01_ingest', failed_step: 'license-check', why: 'x' }, false);
  const c = buildProjectDeliveryCard(root, 'r2');
  const s = c.delivery.stations.find((x) => x.name === '01_ingest');
  assert.equal(s.status, 'failed');
  assert.match(s.explain, /许可/);
  assert.deepEqual(s.actions, ['retry', 'contact_human']);
  const html = renderDeliveryPanel(c, (x) => String(x));
  assert.match(html, /重试/); assert.match(html, /联系人工/);
});

test('validator rejects malformed card', () => {
  assert.ok(validateProjectDelivery({ type: 'project_delivery', delivery: { stations: 'no' } }).length > 0);
  assert.equal(weighted({ commercial: 4, handoff: 4, craft: 4, benchmark: 4 }), 4);
});
