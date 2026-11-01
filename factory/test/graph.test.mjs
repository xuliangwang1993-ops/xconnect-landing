import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createFactory } from '../factory.mjs';
import { loadWorkNodes, normalize } from '../graph/work-nodes.mjs';
const sb = { module: { exports: {} }, URLSearchParams };
vm.runInNewContext(fs.readFileSync(new URL('../graph/graph-view.js', import.meta.url), 'utf8'), sb);
const { parseState, stateUrl } = sb.module.exports;

test('same work_nodes feed: tree parents become graph edges', async () => {
  const d = await loadWorkNodes({});
  const s = await loadWorkNodes({ store: { mode: 'supabase', list: async () => [{ id: 'p', title: 'P' }, { id: 'c', parent_id: 'p' }] } });
  assert.equal(s.source, 'supabase'); assert.deepEqual(s.edges.map((e) => e.from + '>' + e.to), ['p>c']);
  assert.equal(d.source, 'fixture');
  assert.ok(d.edges.some((e) => e.type === 'child' && e.from === 'coo-18' && e.to === 'coo-20'));
  assert.equal(normalize({ nodes: [{ id: 'a', parent_id: 'missing' }] }).edges.length, 0);
});
test('deeplink parse/serialize', () => {
  assert.deepEqual({ ...parseState('?view=graph&node=coo-20') }, { view: 'graph', node: 'coo-20' });
  assert.equal(parseState('?view=evil').view, 'tree');
  assert.equal(stateUrl({ view: 'graph', node: 'coo-20' }, { pathname: '/graph', search: '?x=1', hash: '' }), '/graph?x=1&view=graph&node=coo-20');
});
test('routes', async () => {
  const f = createFactory({ env: {} });
  const mk = () => ({ body: '', writeHead() {}, end(b) { this.body = String(b || ''); } });
  const r = mk(); assert.equal(f.handle({ url: '/graph', method: 'GET' }, r), true); assert.match(r.body, /Tree/);
  assert.equal(f.handle({ url: '/graph/../factory.mjs', method: 'GET' }, mk()), false);
  const a = mk(); await f.handle({ url: '/graph/api/nodes', method: 'GET' }, a); assert.equal(JSON.parse(a.body).nodes.length, 7);
});
