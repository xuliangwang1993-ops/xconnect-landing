import test from 'node:test';
import assert from 'node:assert/strict';
import { createFactory, stageHtml } from '../factory.mjs';
import { cardsToSnapshot } from '../aoi/aoi-snapshot.js';

function call(h, url, method = 'GET') {
  const res = { code: 0, headers: {}, body: '', writeHead(c, hd) { this.code = c; this.headers = hd; }, end(b) { this.body = b ? String(b) : ''; } };
  const handled = h.handle({ url, method }, res);
  return { handled, ...res };
}

test('stage served at / with assets rewritten to /stage/', () => {
  const f = createFactory();
  const r = call(f, '/');
  assert.equal(r.handled, true);
  assert.match(r.body, /我搭台，你唱戏/);
  assert.match(r.body, /href="\/stage\/styles\.css"/);
  assert.doesNotMatch(r.body, /href="styles\.css"/);
  assert.match(stageHtml(), /src="\/stage\/app\.js/);
});

test('stage assets whitelisted; others fall through to workbench', () => {
  const f = createFactory();
  assert.equal(call(f, '/stage/styles.css').handled, true);
  assert.equal(call(f, '/stage/../package.json').handled, false);
  assert.equal(call(f, '/stage/workbench/server-voice.mjs').handled, false);
  assert.equal(call(f, '/workbench').handled, false);
  assert.equal(call(f, '/api/cards').handled, false);
  assert.equal(call(f, '/', 'POST').handled, false);
});

test('aoi page + factory manifest', () => {
  const f = createFactory();
  assert.match(call(f, '/aoi').body, /AoI 能力看板/);
  assert.equal(call(f, '/aoi/aoi-snapshot.js').handled, true);
  assert.equal(JSON.parse(call(f, '/factory.json').body).blocks.workbench.path, '/workbench');
});

test('snapshot never emits verified and groups by project', () => {
  const s = cardsToSnapshot([
    { id: 'c_1', title: 'a', project: 'P', status: 'done' },
    { id: 'c_2', title: 'b', project: 'P', status: 'draft' },
    { id: 'c_3', title: 'c', status: 'review' },
  ]);
  assert.equal(s.mode, 'fixture');
  assert.equal(s.nodes.filter((n) => n.kind === 'goal').length, 2);
  assert.equal(s.edges.length, 3);
  assert.ok(s.nodes.every((n) => n.state !== 'verified'));
  assert.equal(s.nodes.find((n) => n.id === 'wb:c_1').state, 'unverified');
});
