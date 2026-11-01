// COO-20 UI: Tree|Graph toggle over one work_nodes payload; keeps selected node; deeplink ?view=&node= via replaceState.
(function () {
  const VIEWS = ['tree', 'graph'];
  function parseState(search) {
    const q = new URLSearchParams(search);
    return { view: VIEWS.includes(q.get('view')) ? q.get('view') : 'tree', node: q.get('node') || null };
  }
  function stateUrl(st, loc) {
    const q = new URLSearchParams(loc.search); q.set('view', st.view);
    if (st.node) q.set('node', st.node); else q.delete('node');
    return loc.pathname + '?' + q.toString() + (loc.hash || '');
  }
  if (typeof module !== 'undefined') { module.exports = { parseState, stateUrl }; }
  if (typeof document === 'undefined') return;
  const st = parseState(location.search); let data = { nodes: [], edges: [] };
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function sync() { history.replaceState(null, '', stateUrl(st, location)); }
  function select(id) { st.node = id; sync(); render(); }
  function renderTree() {
    const kids = (pid) => data.nodes.filter((n) => n.parent_id === pid);
    const build = (pid) => { const k = kids(pid); return k.length ? '<ul>' + k.map((n) => `<li><span data-id="${esc(n.id)}" class="${n.id === st.node ? 'sel' : ''}">${esc(n.title)}</span>${build(n.id)}</li>`).join('') + '</ul>' : ''; };
    $('tree').innerHTML = build(null);
  }
  function renderGraph() {
    const svg = $('graph'), W = 720, H = 420, R = 160, n = data.nodes.length, pos = {};
    data.nodes.forEach((d, i) => { const a = 2 * Math.PI * i / Math.max(n, 1); pos[d.id] = [W / 2 + R * Math.cos(a), H / 2 + R * Math.sin(a)]; });
    svg.innerHTML = data.edges.map((e) => `<line x1="${pos[e.from][0]}" y1="${pos[e.from][1]}" x2="${pos[e.to][0]}" y2="${pos[e.to][1]}"${e.type === 'blocks' ? ' stroke-dasharray="4"' : ''}/>`).join('')
      + data.nodes.map((d) => `<g data-id="${esc(d.id)}"><circle cx="${pos[d.id][0]}" cy="${pos[d.id][1]}" r="10" class="${d.id === st.node ? 'sel' : ''}"/><text x="${pos[d.id][0] + 14}" y="${pos[d.id][1] + 4}">${esc(d.title)}</text></g>`).join('');
  }
  function render() {
    $('tree').hidden = st.view !== 'tree'; $('graph').hidden = st.view !== 'graph';
    $('btnTree').setAttribute('aria-pressed', st.view === 'tree'); $('btnGraph').setAttribute('aria-pressed', st.view === 'graph');
    $('meta').textContent = `数据源：work_nodes（${data.source || '?'}），${data.nodes.length} 节点；选中：${st.node || '无'}`;
    st.view === 'tree' ? renderTree() : renderGraph();
  }
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-view]'); if (b) { st.view = b.dataset.view; sync(); render(); return; }
    const t = ev.target.closest('[data-id]'); if (t) select(t.dataset.id);
  });
  fetch('/graph/api/nodes').then((r) => r.json()).then((d) => { data = d; if (st.node && !d.nodes.some((x) => x.id === st.node)) st.node = null; sync(); render(); });
})();
