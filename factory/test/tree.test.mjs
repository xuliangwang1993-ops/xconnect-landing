import test from 'node:test';
import assert from 'node:assert/strict';
import { createTreeStore, toRow, stageOf, validate } from '../tree/tree.mjs';
test('stage mapping fits DB CHECK and round-trips', () => {
  for (const s of ['idea', 'in_progress', 'evidence', 'verified']) {
    const r = toRow({ stage: s }); assert.ok(['active', 'blocked', 'waiting', 'done', 'abandoned'].includes(r.status)); assert.equal(stageOf(r), s);
  }
  assert.equal(stageOf({ status: 'done' }), 'verified');
  assert.ok(validate({ kind: 'bogus', title: '' }).length === 2);
});
test('memory store create, child, advance', async () => {
  const st = createTreeStore({ env: {} }); assert.equal(st.mode, 'memory');
  const p = await st.upsert({ kind: 'project', title: 'P' }); assert.equal(p.stage, 'idea');
  const c = await st.upsert({ kind: 'ticket', title: 'C', parent_id: p.id });
  const u = await st.upsert({ id: c.id, stage: 'evidence' }); assert.equal(u.stage, 'evidence'); assert.equal(u.title, 'C');
  assert.equal((await st.list()).length, 2);
  await assert.rejects(st.upsert({ kind: 'x', title: 't' }), /kind/);
});
test('supabase mode posts row via REST', async () => {
  const calls = [];
  const fetchImpl = async (u, i) => { calls.push([u, i]); return { ok: true, text: async () => JSON.stringify([{ ...JSON.parse(i.body), id: 'x1' }]) }; };
  const st = createTreeStore({ env: { SUPABASE_URL: 'https://e.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' }, fetchImpl });
  const n = await st.upsert({ kind: 'ticket', title: 'T', stage: 'verified' });
  assert.equal(n.stage, 'verified'); assert.match(calls[0][0], /rest\/v1\/work_nodes$/); assert.equal(JSON.parse(calls[0][1].body).status, 'done');
});
