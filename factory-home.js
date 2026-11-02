// Linear-style Projects → Issues over existing /tree/api/nodes
// project = kind project; issue = kind ticket|branch under a project (or root tickets as backlog)
const NEXT = { idea: 'in_progress', in_progress: 'evidence', evidence: 'verified' };
const api = (m, u, b) =>
  fetch(u, { method: m, credentials: 'same-origin', headers: b ? { 'content-type': 'application/json' } : {}, body: b ? JSON.stringify(b) : undefined })
    .then(async (r) => {
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || d.message || `HTTP ${r.status}`);
      return d;
    });

const app = document.getElementById('app');
const modeEl = document.getElementById('mode');
const dlg = document.getElementById('dlg');
const dlgForm = document.getElementById('dlgForm');
const dlgTitle = document.getElementById('dlgTitle');
const dlgInput = document.getElementById('dlgInput');
const dlgErr = document.getElementById('dlgErr');
const dlgOk = document.getElementById('dlgOk');

let cache = { mode: '', nodes: [] };
let dlgMode = { type: 'project', parent_id: null };

function qs() { return new URLSearchParams(location.search); }
function projectId() { return qs().get('project') || ''; }
function setProject(id) {
  const u = new URL(location.href);
  if (id) u.searchParams.set('project', id); else u.searchParams.delete('project');
  history.pushState({}, '', u);
  render();
}

function projects(nodes) {
  return nodes.filter((n) => n.kind === 'project' && !n.parent_id);
}
function issuesOf(nodes, pid) {
  return nodes.filter((n) => n.parent_id === pid && (n.kind === 'ticket' || n.kind === 'branch'));
}

async function load() {
  const d = await api('GET', '/tree/api/nodes');
  cache = { mode: d.mode || '', nodes: d.nodes || [] };
  modeEl.textContent = cache.mode ? `store · ${cache.mode}` : '';
  render();
}

function pill(stage) {
  return `<span class="pill ${stage || 'idea'}">${stage || 'idea'}</span>`;
}

function emptyProjects() {
  return `<div class="empty">
    <h2>${(window.XC_I18N?window.XC_I18N.t('home.empty'):'No projects yet')}</h2>
    <p>A project is a factory line. Issues live inside it — same shape as Linear.</p>
    <div class="actions">
      <button class="primary" data-act="new-project">Create first project</button>
      <button class="ghost" data-act="ask-assistant">Ask assistant</button>
    </div>
  </div>`;
}

function emptyIssues(p) {
  return `<div class="empty">
    <h2>No issues in ${esc(p.title)}</h2>
    <p>Break the work into issues. Advance each one idea → verified.</p>
    <div class="actions">
      <button class="primary" data-act="new-issue">New issue</button>
    </div>
  </div>`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderProjects() {
  const list = projects(cache.nodes);
  document.getElementById('tabProjects')?.classList.add('on');
  let body;
  if (!list.length) body = emptyProjects();
  else {
    body = `<div class="toolbar">
      <input id="filter" placeholder="Filter projects" />
      <button class="primary" data-act="new-project">New project</button>
    </div>
    <div class="list" id="list">${list.map((p) => {
      const n = issuesOf(cache.nodes, p.id).length;
      return `<div class="row" data-open="${esc(p.id)}">
        <div><div class="title">${esc(p.title)}</div><div class="meta">${n} issue${n === 1 ? '' : 's'}</div></div>
        ${pill(p.stage)}
        <span class="meta">${esc((p.updated_at || '').slice(0, 10))}</span>
        <button data-issues="${esc(p.id)}" title="Issues">Issues</button>
        <button data-graph="${esc(p.id)}" title="在 AoI Graph 中查看">Graph</button>
      </div>`;
    }).join('')}</div>`;
  }
  app.innerHTML = `<h1>Projects</h1><p class="sub">Workspace → projects → issues. Each project is a factory line.</p>${body}${needsHtml()}`;
  void loadNeeds();
}

// ---- 总脑需求（对话里挖出来的）----
// 只读展示；确认 / 转任务走 /api/brain/needs/*，转任务复用 /tree 的 work_nodes。
let needsCache = null; // null=还没取；{configured, mode, needs}
function confBar(c) {
  const n = Math.round(Math.max(0, Math.min(1, Number(c) || 0)) * 100);
  return `<span class="meta" title="置信度">${n}%<span class="bar" style="display:inline-block;width:46px;height:4px;margin-left:6px;border-radius:2px;vertical-align:middle;background:rgba(255,255,255,.14)"><span style="display:block;width:${n}%;height:100%;border-radius:2px;background:currentColor"></span></span></span>`;
}
function needsHtml() {
  if (!needsCache) return `<section id="brainNeeds" style="margin-top:34px"><h2 style="font-size:15px;margin:0 0 6px">总脑需求</h2><p class="sub">正在读取…</p></section>`;
  const { configured, mode, needs } = needsCache;
  const rows = (needs || []).filter((n) => n.status !== 'dismissed').slice(0, 20);
  const head = `<section id="brainNeeds" style="margin-top:34px">
    <h2 style="font-size:15px;margin:0 0 6px">总脑需求 <span class="meta">${neutralish(configured, mode)}</span></h2>
    <p class="sub">客户还没开口问，总脑先从对话里挑出来的。每一条都带原话依据，确认后才进任务。</p>`;
  if (!rows.length) return head + `<p class="sub">还没有。对话聊得多了，这里会自己长出来。</p></section>`;
  return head + `<div class="list" id="brainNeedsList">${rows.map((n) => `<div class="row" data-need="${esc(n.id)}" style="align-items:flex-start;flex-wrap:wrap">
      <div style="flex:1;min-width:220px"><div class="title">${esc(n.need)}</div>
        <div class="meta">依据：${esc((n.evidence || []).join(' ／ ') || '—')}</div></div>
      ${confBar(n.confidence)}
      <span class="pill ${n.status === 'converted' ? 'done' : n.status === 'confirmed' ? 'verified' : 'idea'}">${esc(n.status)}</span>
      ${n.status === 'converted' ? `<span class="meta">已转任务</span>` : `
        <button data-need-act="confirm">确认</button>
        <button data-need-act="convert">转任务</button>
        <button data-need-act="dismiss">忽略</button>`}
    </div>`).join('')}</div></section>`;
}
function neutralish(configured, mode) {
  if (!configured) return '模型未接 · 只显示已有记录';
  return 'store · ' + (mode || '—');
}
async function loadNeeds() {
  try {
    const r = await fetch('/api/brain/needs?limit=50', { credentials: 'same-origin' });
    if (!r.ok) { needsCache = { configured: false, mode: '', needs: [] }; }
    else needsCache = await r.json();
  } catch { needsCache = { configured: false, mode: '', needs: [] }; }
  const box = document.getElementById('brainNeeds');
  if (box) box.outerHTML = needsHtml();
}

function renderProject(pid) {
  const p = cache.nodes.find((n) => n.id === pid && n.kind === 'project');
  if (!p) {
    app.innerHTML = `<div class="empty"><h2>${(window.XC_I18N?window.XC_I18N.t('home.notFound'):'Project not found')}</h2><div class="actions"><a class="btn" href="/">${(window.XC_I18N?window.XC_I18N.t('home.back'):'Back to projects')}</a></div></div>`;
    return;
  }
  const issues = issuesOf(cache.nodes, pid);
  const body = !issues.length ? emptyIssues(p) : `<div class="toolbar">
      <input id="filter" placeholder="Filter issues" />
      <button class="primary" data-act="new-issue">New issue</button>
    </div>
    <div class="list" id="list">${issues.map((i) => `<div class="row" data-issue="${esc(i.id)}">
        <div><div class="title">${esc(i.title)}</div><div class="meta">${esc(i.kind)}</div></div>
        ${pill(i.stage)}
        ${NEXT[i.stage] ? `<button data-advance="${esc(i.id)}" data-to="${NEXT[i.stage]}">→ ${NEXT[i.stage]}</button>` : `<span class="meta">done</span>`}
      </div>`).join('')}</div>`;
  app.innerHTML = `<div class="crumb"><a href="/">Projects</a><span>/</span><strong>${esc(p.title)}</strong></div>
    <h1>${esc(p.title)}</h1>
    <p class="sub">Issues in this project.</p>${body}`;
}

function render() {
  const pid = projectId();
  if (pid) renderProject(pid); else renderProjects();
}

function openDialog({ type, parent_id, title }) {
  dlgMode = { type, parent_id: parent_id || null };
  dlgTitle.textContent = type === 'project' ? 'New project' : 'New issue';
  dlgInput.placeholder = type === 'project' ? 'Project name' : 'Issue title';
  dlgInput.value = title || '';
  dlgErr.textContent = '';
  dlgOk.textContent = 'Create';
  dlg.showModal();
  setTimeout(() => dlgInput.focus(), 0);
}

dlgForm.addEventListener('submit', async (e) => {
  const val = e.submitter?.value || 'cancel';
  if (val !== 'ok') return;
  e.preventDefault();
  const title = dlgInput.value.trim();
  if (!title) { dlgErr.textContent = 'Name required'; return; }
  try {
    dlgOk.disabled = true;
    if (dlgMode.type === 'project') {
      const p = await api('POST', '/tree/api/nodes', { kind: 'project', title, stage: 'idea' });
      dlg.close();
      setProject(p.id);
      await load();
      setProject(p.id);
    } else {
      await api('POST', '/tree/api/nodes', {
        kind: 'ticket', title, parent_id: dlgMode.parent_id, stage: 'idea',
      });
      dlg.close();
      await load();
    }
  } catch (err) {
    dlgErr.textContent = err.message || String(err);
  } finally {
    dlgOk.disabled = false;
  }
});

app.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-act],[data-issues],[data-graph],[data-open],[data-advance],[data-need-act]');
  if (!t) return;
  if (t.dataset.needAct) {
    e.stopPropagation();
    const id = t.closest('[data-need]')?.dataset.need;
    if (!id) return;
    const act = t.dataset.needAct;
    try {
      t.disabled = true;
      if (act === 'convert') {
        const r = await api('POST', '/api/brain/needs/' + encodeURIComponent(id) + '/convert', {});
        needsCache = null; void loadNeeds();
        alert('已转成任务：' + (r.node?.title || ''));
        await load();
      } else if (act === 'confirm') {
        // 客户点头 = 最硬的证据：状态置 confirmed，置信度拉满（只升不降）。
        await api('PATCH', '/api/brain/needs/' + encodeURIComponent(id), { status: 'confirmed', confidence: 1 });
        needsCache = null; void loadNeeds();
      } else {
        await api('PATCH', '/api/brain/needs/' + encodeURIComponent(id), { status: 'dismissed' });
        needsCache = null; void loadNeeds();
      }
    } catch (err) { alert(err.message || err); }
    finally { t.disabled = false; }
    return;
  }
  if (t.dataset.graph) { location.href = '/aoi?view=graph&node=' + encodeURIComponent(t.dataset.graph); return; }
  if (t.dataset.issues) { setProject(t.dataset.issues); return; }
  if (t.dataset.open) { // project → its own Workbench page (no assistant picker)
    const p = cache.nodes.find((n) => n.id === t.dataset.open);
    location.href = '/workbench/?project=' + encodeURIComponent(t.dataset.open) + (p ? '&name=' + encodeURIComponent(p.title) : '');
    return;
  }
  if (t.dataset.act === 'new-project') { openDialog({ type: 'project' }); return; }
  if (t.dataset.act === 'new-issue') { openDialog({ type: 'issue', parent_id: projectId() }); return; }
  if (t.dataset.act === 'ask-assistant') {
    try { localStorage.removeItem('xcGuideToured'); } catch {}
    location.search = (location.search ? location.search + '&' : '?') + 'guide=1';
    return;
  }
  if (t.dataset.advance) {
    e.stopPropagation();
    try {
      await api('PATCH', '/tree/api/nodes/' + encodeURIComponent(t.dataset.advance), { stage: t.dataset.to });
      await load();
    } catch (err) { alert(err.message || err); }
  }
});

app.addEventListener('input', (e) => {
  if (e.target.id !== 'filter') return;
  const q = e.target.value.trim().toLowerCase();
  document.querySelectorAll('#list .row').forEach((row) => {
    const text = row.textContent.toLowerCase();
    row.style.display = !q || text.includes(q) ? '' : 'none';
  });
});

window.addEventListener('popstate', render);
window.addEventListener('xc:factory-new-project', () => openDialog({ type: 'project' }));

load().catch((err) => {
  app.innerHTML = `<div class="empty"><h2>${(window.XC_I18N?window.XC_I18N.t('home.loadFail'):'Couldn’t load projects')}</h2><p>${esc(err.message || err)}</p>
    <div class="actions"><button class="primary" onclick="location.reload()">Retry</button></div></div>`;
});
