// Workbench cards -> AoI CapabilitySnapshot (fixture mode).
// Port of the read-only adapter (aoi-workbench-adapter/adapter.py).
// Never emits state "verified": a done card is at most "unverified" until AoI evidence exists.
export function cardsToSnapshot(cards, { limit = 50, workspaceId = 'workbench' } = {}) {
  const list = (Array.isArray(cards) ? cards : []).slice(0, limit);
  const nodes = [];
  const edges = [];
  const goals = new Map();
  for (const c of list) {
    if (!c || !c.id) continue;
    const p = (c.project && String(c.project).trim()) || '未分类';
    if (!goals.has(p)) {
      const gid = 'goal:' + p;
      goals.set(p, gid);
      nodes.push({ id: gid, kind: 'goal', label: p, entity_ref: null, state: 'potential', layer: 'control', evidence_refs: [] });
    }
    const nid = 'wb:' + c.id;
    const done = c.status === 'done' || c.status === 'completed';
    nodes.push({ id: nid, kind: 'function', label: c.title || '', entity_ref: null,
      state: done ? 'unverified' : 'potential', layer: 'function', evidence_refs: [],
      wb_status: c.status || 'draft' });
    edges.push({ id: 'e:' + c.id, from_id: goals.get(p), to_id: nid, relation: 'requires',
      evidence_status: 'documented', source_refs: [], evidence_refs: [] });
  }
  return { schema_version: '1.0.0', workspace_id: workspaceId, mode: 'fixture', cursor: 0, capabilities: [], nodes, edges };
}
