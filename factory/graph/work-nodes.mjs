// COO-20: single data source (work_nodes) for both Tree and Graph views.
// Reads through the COO-19 tree store (same work_nodes rows /tree writes). If the store is
// empty/memory-only or errors, falls back to the bundled fixture so the page still renders.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));

export function normalize(raw) {
  const nodes = (raw.nodes || []).map((n) => ({ id: String(n.id), parent_id: n.parent_id == null ? null : String(n.parent_id), title: n.title || n.id, kind: n.kind || 'node', status: n.status || null }));
  const ids = new Set(nodes.map((n) => n.id));
  const edges = nodes.filter((n) => n.parent_id && ids.has(n.parent_id)).map((n) => ({ from: n.parent_id, to: n.id, type: 'child' }))
    .concat((raw.edges || []).filter((e) => ids.has(e.from) && ids.has(e.to)));
  return { nodes, edges };
}

export async function loadWorkNodes({ store } = {}) {
  if (store) {
    try {
      const rows = await store.list();
      if (rows.length) return { source: store.mode || 'store', ...normalize({ nodes: rows }) };
    } catch { /* fall back */ }
  }
  return { source: 'fixture', ...normalize(JSON.parse(fs.readFileSync(path.join(HERE, 'work_nodes.json'), 'utf8'))) };
}
