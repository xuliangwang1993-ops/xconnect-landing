/* X-connect Workbench — client.
 * Vanilla ES module, no build step.  All privileged calls go through /api/*;
 * the gateway key never enters this file or localStorage.
 */
import { renderDeliveryPanel, deliveryBadge, isDelivery } from './project-delivery-view.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = (p = 'x') => p + Math.random().toString(36).slice(2, 10);
const now = () => new Date().toISOString();
const clamp = (s, n) => String(s ?? '').slice(0, n);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DEFAULT_SETTINGS = {
  layout: 'auto',
  theme: 'default',
  model: '',
  quickbar: ['new-card', 'organize', 'review', 'approve', 'temp'],
  reducedMotion: false,
  customPalette: false,
  accent: '',
  sidebarCollapsed: false,
};

const QUICK_ACTIONS = {
  'new-card': { label: '新卡片', icon: 'i-card', run: () => openCardModal() },
  'organize': { label: '整理卡片', icon: 'i-spark', run: () => runCardAction('organize') },
  'review': { label: '送审', icon: 'i-check', run: () => runCardAction('review') },
  'approve': { label: '批准执行', icon: 'i-arrow-up', run: () => approveActive() },
  'temp': { label: '临时会话', icon: 'i-ghost', run: () => toggleTemp() },
  'voice': { label: '语音', icon: 'i-mic', run: () => toggleVoicePanel(true) },
  'minimap': { label: 'Minimap', icon: 'i-map', run: () => openModal('miniMapModal') },
  'settings': { label: '设置', icon: 'i-settings', run: () => openSettings('look') },
  'card-from-chat': { label: '从对话建卡', icon: 'i-spark', run: () => cardFromLastAssistant() },
};

const STATUS = {
  draft: ['草稿', 's-draft'],
  review: ['待审', 's-review'],
  reviewed: ['已审', 's-reviewed'],
  needs_changes: ['需修改', 's-needs_changes'],
  approved: ['已批准', 's-approved'],
  running: ['执行中', 's-running'],
  done: ['完成', 's-done'],
  failed: ['失败', 's-failed'],
};

const state = {
  user: null,
  balance: null,
  balanceUnit: 'point',
  balanceLabel: '点',
  provider: 'gateway',
  tier: null,
  tiers: [],
  loginTiers: [],
  models: [],
  cards: [],
  conversations: [],
  tasks: [],
  settings: { ...DEFAULT_SETTINGS },
  view: 'cards',
  activeCardId: null,
  activeConversationId: null,
  inspTab: 'content',
  filterProject: 'all',
  search: '',
  temp: null,
  tempBackup: null,
  storage: 'none',
  build: 'dev',
  voiceInfo: { available: false, speakers: [] },
  online: navigator.onLine,
  installPrompt: null,
  swReg: null,
  updateReady: false,
  introShown: false,
  voice: {
    ws: null, stream: null, ctx: null, proc: null, src: null, analyser: null,
    paused: false, active: false, startedAt: 0, at: 0, playing: 0, speaker: '',
    reconnect: false, drag: false,
  },
  confirmResolve: null,
  authError: false,
};

function activeModel() {
  const id = state.settings.model;
  return state.models.find((m) => m.id === id) || state.models.find((m) => m.id === state.defaultModel) || state.models[0] || null;
}
function activeCard() { return state.cards.find((c) => c.id === state.activeCardId) || null; }
function activeConversation() {
  if (state.temp) return state.temp;
  return state.conversations.find((c) => c.id === state.activeConversationId) || null;
}
function modelShort(m) { return m ? m.short || m.brand || 'X' : 'X'; }
function modelBrand(m) { return m ? m.brand || 'X' : 'X'; }
function modelVersion(m) { return m ? m.version || '' : ''; }
function normalizeBalance(v) {
  if (v && typeof v === 'object') return v.balance ?? v.total ?? null;
  return v;
}
function balanceText() {
  const bal = normalizeBalance(state.balance);
  if (bal == null) return '余额 —';
  if (state.balanceUnit === 'usd') return `US$${Number(bal).toFixed(2)} 可用`;
  return `${Number(bal).toLocaleString('en-AU')} 点 · ≈ A$${(Number(bal) * 0.0001).toFixed(2)}`;
}
function balanceShort() {
  const bal = normalizeBalance(state.balance);
  if (bal == null) return '—';
  if (state.balanceUnit === 'usd') return `US$${Number(bal).toFixed(2)}`;
  return Number(bal).toLocaleString('en-AU');
}
function accountLabel() {
  if (state.provider === 'subrouter') return `SubRouter · ${state.tier || '自定义'}`;
  return state.user?.email || '—';
}
function statusLabel(s) { return (STATUS[s] || [s || '草稿'])[0]; }
function statusClass(s) { return (STATUS[s] || ['', 's-draft'])[1]; }
function fmtTime(iso) {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  const d = Date.now() - t;
  if (d < 45_000) return '刚刚';
  if (d < 3_600_000) return Math.floor(d / 60_000) + ' 分钟前';
  if (d < 86_400_000) return Math.floor(d / 3_600_000) + ' 小时前';
  if (d < 7 * 86_400_000) return Math.floor(d / 86_400_000) + ' 天前';
  return new Date(t).toLocaleDateString('zh-Hans', { month: 'short', day: 'numeric' });
}
function toast(msg, bad = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('bad', Boolean(bad));
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 3200);
}
function setBanner(text, kind = '') {
  const el = $('#banner');
  if (!text) { el.hidden = true; el.innerHTML = ''; return; }
  el.className = 'banner ' + kind;
  el.innerHTML = text;
  el.hidden = false;
}
function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.hidden = false;
  const focus = el.querySelector('input, textarea, button');
  setTimeout(() => focus?.focus?.({ preventScroll: true }), 30);
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.hidden = true;
}
function closeAllModals() {
  $$('.modal').forEach((m) => { m.hidden = true; });
}
function askConfirm({ title = '确认', text = '', ok = '确认' }) {
  return new Promise((resolve) => {
    state.confirmResolve = resolve;
    $('#confirmTitle').textContent = title;
    $('#confirmText').textContent = text;
    $('#confirmOk').textContent = ok;
    openModal('confirmModal');
  });
}
function resolveConfirm(v) {
  const r = state.confirmResolve;
  state.confirmResolve = null;
  closeModal('confirmModal');
  if (r) r(v);
}

async function api(path, { method = 'GET', body, headers = {}, signal } = {}) {
  const r = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 300) }; }
  if (!r.ok) {
    const err = new Error(data?.message || data?.error || `HTTP ${r.status}`);
    err.status = r.status;
    err.data = data;
    if (r.status === 401 && state.user) {
      state.authError = true;
      showLogin('会话已过期，请重新登录。');
    }
    throw err;
  }
  return data;
}

function cacheKey() { return 'xcw_cache_v1'; }
function saveCache() {
  try {
    localStorage.setItem(cacheKey(), JSON.stringify({
      user: state.user ? { email: state.user.email, plan: state.user.plan } : null,
      balance: state.balance,
      cards: state.cards.slice(0, 100),
      conversations: state.conversations.slice(0, 40),
      settings: state.settings,
      activeCardId: state.activeCardId,
      activeConversationId: state.activeConversationId,
      build: state.build,
      at: Date.now(),
    }));
  } catch {}
}
function readCache() {
  try {
    const raw = localStorage.getItem(cacheKey());
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function clearPrivateLocal() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('xcw_')) localStorage.removeItem(k);
  } catch {}
  try { sessionStorage.removeItem('xcw_intro_seen'); } catch {}
}

function draftKey() {
  return 'xcw_draft_' + (state.temp ? 'temp' : (state.activeConversationId || 'none'));
}
function loadDraft() {
  try { return localStorage.getItem(draftKey()) || ''; } catch { return ''; }
}
function saveDraft(text) {
  try {
    if (text && text.trim()) localStorage.setItem(draftKey(), text);
    else localStorage.removeItem(draftKey());
  } catch {}
}
function clearDraft() {
  try { localStorage.removeItem(draftKey()); } catch {}
}

function resolveLayout() {
  if (state.settings.layout === 'compact') return 'compact';
  if (state.settings.layout === 'full') return 'full';
  return window.innerWidth >= 1080 ? 'full' : 'compact';
}
function applyLayout() {
  const layout = resolveLayout();
  document.body.dataset.layout = layout;
  if (layout === 'full') {
    document.body.classList.remove('sidebar-open', 'inspector-open');
    document.body.classList.toggle('sidebar-collapsed', Boolean(state.settings.sidebarCollapsed));
  } else {
    document.body.classList.remove('sidebar-collapsed');
  }
}
function applyTheme() {
  const model = activeModel();
  const theme = state.settings.theme && state.settings.theme !== 'auto' ? state.settings.theme : (model?.theme || 'default');
  document.documentElement.dataset.theme = theme;
  if (state.settings.customPalette && state.settings.accent) {
    document.documentElement.style.setProperty('--accent', state.settings.accent);
  } else {
    document.documentElement.style.removeProperty('--accent');
  }
}

async function saveSettings(patch, { quiet = false } = {}) {
  state.settings = { ...state.settings, ...patch };
  applyTheme();
  applyLayout();
  saveCache();
  try {
    await api('/api/settings', { method: 'PUT', body: patch });
  } catch (e) {
    if (!quiet) toast('设置未同步到云端，已保存在本机', true);
  }
  if (!quiet) saveCache();
}

function showLogin(msg = '') {
  closeAllModals();
  document.body.classList.remove('composer-open', 'inspector-open', 'sidebar-open');
  $('#login').hidden = false;
  $('#shell').hidden = true;
  $('#loginMsg').textContent = msg;
  $('#loginMsg').classList.toggle('bad', Boolean(msg));
  setTimeout(() => $('#keyInput')?.focus(), 50);
}

function showShell() {
  $('#login').hidden = true;
  $('#shell').hidden = false;
}

function showIntro() {
  if (state.introShown) return;
  state.introShown = true;
  // A hidden tab freezes CSS animations at frame 0; never leave a full-screen
  // overlay in that state. The intro is a visible-launch moment only.
  if (document.visibilityState === 'hidden') {
    try { sessionStorage.setItem('xcw_intro_seen', '1'); } catch {}
    return;
  }
  try { if (sessionStorage.getItem('xcw_intro_seen')) return; } catch {}
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || state.settings.reducedMotion) {
    try { sessionStorage.setItem('xcw_intro_seen', '1'); } catch {}
    return;
  }
  const el = $('#intro');
  el.hidden = false;
  el.classList.remove('out');
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => { el.hidden = true; }, 520);
    try { sessionStorage.setItem('xcw_intro_seen', '1'); } catch {}
  }, 1050);
}

async function boot() {
  bindEvents();
  applyTheme();
  applyLayout();
  try {
    const data = await api('/api/bootstrap');
    await acceptBootstrap(data);
    showShell();
    showIntro();
    renderAll();
    registerSW();
  } catch (e) {
    if (e.status === 401) {
      try {
        const h = await api('/api/health');
        renderLoginTiers(h.tiers || []);
      } catch {}
      showLogin();
      return;
    }
    const cached = readCache();
    if (cached?.user) {
      state.user = cached.user;
      state.cards = cached.cards || [];
      state.conversations = cached.conversations || [];
      state.settings = { ...DEFAULT_SETTINGS, ...(cached.settings || {}) };
      state.balance = cached.balance;
      state.build = cached.build || 'offline';
      state.activeCardId = cached.activeCardId || null;
      state.activeConversationId = cached.activeConversationId || null;
      applyTheme(); applyLayout();
      showShell();
      setBanner('<svg width="14" height="14"><use href="#i-alert"></use></svg> 离线：显示本机缓存；新发送会失败并保留草稿。', 'off');
      renderAll();
      registerSW();
      return;
    }
    showLogin('服务暂时连不上，请稍后再试。');
  }
  setupVisualViewport();
}

async function acceptBootstrap(data) {
  state.user = data.user || null;
  state.balance = normalizeBalance(data.balance);
  state.balanceUnit = data.balance?.unit || data.balanceUnit || 'point';
  state.balanceLabel = data.balance?.label || data.balanceLabel || '点';
  state.provider = data.provider || 'gateway';
  state.tier = data.tier || null;
  state.tiers = Array.isArray(data.tiers) ? data.tiers : [];
  state.models = Array.isArray(data.models) ? data.models : [];
  state.defaultModel = data.defaultModel || 'claude-haiku-4-5';
  state.cards = Array.isArray(data.cards) ? data.cards : [];
  state.conversations = Array.isArray(data.conversations) ? data.conversations : [];
  state.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
  state.tasks = [];
  state.storage = data.storage || 'none';
  state.build = data.build || 'dev';
  state.voiceInfo = data.voice || { available: false, speakers: [] };
  if (!state.settings.model || !state.models.some((m) => m.id === state.settings.model)) {
    // Never fall back to an entry without an id: sending model:'' makes the
    // gateway pick a default merchant, which is what "slow and unpredictable"
    // usually turns out to be.
    const usable = state.models.filter((m) => m.id);
    const fallback = usable.find((m) => m.id === state.defaultModel) || usable[0];
    state.settings.model = fallback?.id || '';
  }
  if (!state.activeConversationId && state.conversations.length) {
    state.activeConversationId = state.conversations[0].id;
  }
  if (state.activeCardId && !state.cards.some((c) => c.id === state.activeCardId)) state.activeCardId = null;
  applyTheme();
  applyLayout();
  await refreshTasks();
  if (data.storageError) {
    setBanner('<svg width="14" height="14"><use href="#i-alert"></use></svg> 云端存储暂不可用：卡片改动可能无法保存。', 'warn');
  } else if (!state.online) {
    setBanner('<svg width="14" height="14"><use href="#i-alert"></use></svg> 离线：草稿保存在本机，未发送内容不会冒充已提交。', 'off');
  } else {
    setBanner('');
  }
  saveCache();
}

async function refreshTasks() {
  try {
    const d = await api('/api/tasks');
    state.tasks = Array.isArray(d.tasks) ? d.tasks : [];
  } catch {
    // leave the previous list
  }
}

function setupVisualViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const apply = () => {
    const panel = $('#composerPanel');
    if (!panel || panel.hidden) return;
    const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    panel.style.marginBottom = offset ? offset + 'px' : '';
  };
  vv.addEventListener('resize', apply);
  vv.addEventListener('scroll', apply);
}

// ---------------------------------------------------------------------------
// Rendering

function renderAll() {
  if (!state.user) return;
  updateModelChip();
  $('#tempBtn').setAttribute('aria-pressed', String(Boolean(state.temp)));
  renderSidebar();
  renderMain();
  renderInspector();
  renderComposerMeta();
  renderQuickbar();
  renderVoicePanel();
  applyTheme();
  applyLayout();
  saveCache();
}

function renderSidebar() {
  const cards = state.cards;
  $('#navCardsCount').textContent = String(cards.length);
  $('#navWorksCount').textContent = String(cards.filter((c) => c.status === 'done' && c.result).length);
  $('#navTasksCount').textContent = String(state.tasks.length);
  $('#sideEmail').textContent = accountLabel();
  const bal = normalizeBalance(state.balance);
  $('#sideBalance').textContent = balanceText();
  $('#sideAvatar').textContent = (state.user?.email || 'X')[0].toUpperCase();
  $('#avatarLetter').textContent = (state.user?.email || 'X')[0].toUpperCase();

  const convs = [...state.conversations].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  const list = $('#convList');
  if (!convs.length) {
    list.innerHTML = '<div class="conv-empty">还没有会话。新建一个，或直接写卡片。</div>';
  } else {
    list.innerHTML = convs.map((c) => {
      const active = !state.temp && c.id === state.activeConversationId;
      return `<div class="conv-item ${active ? 'active' : ''}" data-conv="${esc(c.id)}">
        <button class="conv-title" data-conv-open="${esc(c.id)}" title="${esc(c.title)}">${esc(c.title || '未命名会话')}</button>
        <button class="more" data-conv-menu="${esc(c.id)}" aria-label="会话菜单"><svg><use href="#i-more"></use></svg></button>
      </div>`;
    }).join('');
  }

  const projects = [...new Set(cards.map((c) => c.project || '默认项目'))].sort();
  $('#projectCount').textContent = String(projects.length);
  const plist = $('#projectList');
  plist.innerHTML = `<button class="project-pill ${state.filterProject === 'all' ? 'active' : ''}" data-project="all">全部</button>` +
    projects.map((p) => `<button class="project-pill ${state.filterProject === p ? 'active' : ''}" data-project="${esc(p)}">${esc(p)}</button>`).join('');

  $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === state.view));
}

const VIEW_META = {
  chat: ['CHAT', '对话', '会话只在这里和侧栏管理；顶栏只显示模型缩写，完整模型名在选择器里。'],
  cards: ['CARDS', '项目工作台', '项目、卡片、作品和任务状态是主体。控制按需收起，不挡内容。'],
  works: ['WORKS', '作品', '已执行完成的结果回卡；没有结果时不会显示成作品。'],
  tasks: ['TASKS', '任务', '批准后才入队。执行端可以是现有 PC bridge，也可以是预览内置执行器。'],
  linear: ['LINEAR', 'Linear 只读镜像', 'Issues、团队和工作流状态都从本地 linear_issues 读。同步由服务端写入缓存，页面不直连 Linear。'],
};

function renderMain() {
  const [eyebrow, title, lede] = VIEW_META[state.view] || VIEW_META.cards;
  $('#viewEyebrow').textContent = eyebrow;
  $('#viewTitle').textContent = title;
  $('#viewLede').textContent = lede;
  $$('.tab[data-view]').forEach((t) => t.classList.toggle('active', t.dataset.view === state.view));
  $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === state.view));
  $('#chatView').hidden = state.view !== 'chat';
  $('#cardsView').hidden = state.view !== 'cards';
  $('#worksView').hidden = state.view !== 'works';
  $('#tasksView').hidden = state.view !== 'tasks';
  $('#linearView').hidden = state.view !== 'linear';
  $('#newCardBtn').style.display = state.view === 'chat' ? 'none' : '';
  $('#storageLabel').textContent = state.storage === 'supabase' ? 'Supabase 已连接' : (state.storage === 'local' ? '本机预览存储' : '存储未配置');
  $('#buildLabel').textContent = 'build ' + state.build;
  renderStats();
  renderCards();
  renderWorks();
  renderTasks();
  renderChat();
}

function renderStats() {
  const cards = state.cards;
  const review = cards.filter((c) => c.status === 'review' || c.status === 'reviewed').length;
  const running = cards.filter((c) => c.status === 'approved' || c.status === 'running').length;
  const done = cards.filter((c) => c.status === 'done').length;
  const bal = normalizeBalance(state.balance);
  $('#stats').innerHTML = `
    <div class="stat"><b>${cards.length}</b><span>卡片</span></div>
    <div class="stat"><b>${review}</b><span>待审 / 已审</span></div>
    <div class="stat"><b>${running}</b><span>执行中</span></div>
    <div class="stat accent"><b>${done}</b><span>完成</span></div>
    <div class="stat"><b>${balanceShort()}</b><span>${state.balanceUnit === 'usd' ? 'US$ 余额' : '点数余额'}</span></div>`;
}

function filteredCards() {
  const q = state.search.trim().toLowerCase();
  return state.cards.filter((c) => {
    if (state.filterProject !== 'all' && (c.project || '默认项目') !== state.filterProject) return false;
    if (!q) return true;
    return [c.title, c.working, c.original, c.project, c.source?.label, c.source?.app, c.id]
      .filter(Boolean).join(' ').toLowerCase().includes(q);
  });
}

function sourceLabel(card) {
  const k = card.source?.kind;
  return ({ manual: '手写', voice: '语音', subtitle: '字幕', chat: '对话' }[k] || '手写');
}

function renderCards() {
  const list = filteredCards();
  const grid = $('#cardsGrid');
  const empty = $('#cardsEmpty');
  if (!state.cards.length) {
    grid.innerHTML = '';
    empty.hidden = false;
    empty.innerHTML = `<h2>先落一张卡</h2><p>粘贴一段对话、字幕或笔记。保存是第一步；整理、送审、批准执行是三件不同的事。</p><div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center"><button class="btn primary" data-open-newcard>新建卡片</button><button class="btn ghost" data-open-subtitle>字幕接入</button></div>`;
    return;
  }
  if (!list.length) {
    grid.innerHTML = '';
    empty.hidden = false;
    empty.innerHTML = `<h2>没有匹配</h2><p>换个搜索词，或切换项目。</p>`;
    return;
  }
  empty.hidden = true;
  grid.innerHTML = list.map((c) => {
    const selected = c.id === state.activeCardId;
    return `<article class="card ${selected ? 'selected' : ''}" data-card="${esc(c.id)}" data-status="${esc(c.status)}" tabindex="0" role="button" aria-label="${esc(c.title)}">
      <div class="card-top"><span class="status-dot"></span><span class="status-text">${esc(statusLabel(c.status))}</span><span class="src-badge">${esc(sourceLabel(c))}</span></div>
      <h3>${esc(c.title || '未命名卡片')}</h3>
      <div class="card-excerpt">${esc((c.working || c.original || '').slice(0, 240))}</div>
      <div class="card-foot">
        ${deliveryBadge(c, esc)}
        ${c.assistant ? '<span class="tag"><svg><use href="#i-spark"></use></svg>已整理</span>' : ''}
        ${c.review ? `<span class="tag"><svg><use href="#i-check"></use></svg>${c.review.verdict === 'pass' ? '已审' : '需改'}</span>` : ''}
        <span class="right">v${c.version || 1} · ${esc(fmtTime(c.updatedAt))}</span>
      </div>
    </article>`;
  }).join('');
}

function renderWorks() {
  const works = state.cards.filter((c) => c.status === 'done' && c.result);
  const grid = $('#worksGrid');
  const empty = $('#worksEmpty');
  if (!works.length) {
    grid.innerHTML = '';
    empty.hidden = false;
    empty.innerHTML = `<h2>还没有作品</h2><p>卡片批准并执行完成后，结果回卡，才会出现在这里。</p>`;
    return;
  }
  empty.hidden = true;
  grid.innerHTML = works.map((c) => `<article class="work" data-card="${esc(c.id)}">
    <div class="row-between"><h3>${esc(c.title)}</h3><span class="chip good">完成</span></div>
    <div class="work-meta"><span>${esc(c.project || '默认项目')}</span><span>v${c.version || 1}</span><span>${esc(fmtTime(c.completedAt || c.updatedAt))}</span><span>${esc(c.executor || 'executor')}</span></div>
    <pre>${esc((c.result || '').slice(0, 1200))}</pre>
  </article>`).join('');
}

function renderTasks() {
  const list = state.tasks;
  const el = $('#taskList');
  const empty = $('#tasksEmpty');
  if (!list.length) {
    el.innerHTML = '';
    empty.hidden = false;
    empty.innerHTML = `<h2>还没有任务</h2><p>批准执行后，任务会出现在这里。网络失败不会把任务标成完成。</p>`;
    return;
  }
  empty.hidden = true;
  el.innerHTML = list.slice().reverse().map((t) => `<article class="task" data-status="${esc(t.status)}" data-task-card="${esc(t.cardId || '')}">
    <span class="status-dot" style="color:var(--accent);background:currentColor"></span>
    <div><div class="task-desc">${esc(t.description)}</div><div class="task-meta">${esc(t.source || 'workbench')} · ${esc(t.executor || 'bridge')} · ${esc(fmtTime(t.createdAt))}</div></div>
    <span class="task-status">${esc(t.status)}</span>
  </article>`).join('');
}

function renderChat() {
  const conv = activeConversation();
  const box = $('#chatMessages');
  const empty = $('#chatEmpty');
  const title = $('#chatTitle');
  const notice = $('#tempNotice');
  if (!conv) {
    title.textContent = '新会话';
    notice.hidden = true;
    box.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  title.textContent = conv.title || '未命名会话';
  notice.hidden = !state.temp;
  const msgs = Array.isArray(conv.messages) ? conv.messages : [];
  if (!msgs.length) {
    box.innerHTML = '<div class="chat-empty-line">还没有消息。输入框在左下角，草稿会留在这里。</div>';
    return;
  }
  box.innerHTML = msgs.map((m, i) => ({ m, i })).filter(({ m }) => m.role !== 'system').map(({ m, i }) => {
    const role = m.role === 'user' ? '你' : m.role === 'assistant' ? 'X-connect' : m.role;
    const cls = ['msg', m.role, m.streaming ? 'streaming' : ''].filter(Boolean).join(' ');
    const actions = m.role === 'assistant'
      ? `<button data-msg-card="${i}">生成卡片</button><button data-copy-msg="${i}">复制</button>`
      : `<button data-copy-msg="${i}">复制</button>`;
    return `<article class="${cls}" data-mi="${i}">
      <div class="msg-head"><b>${esc(role)}</b><span>${esc(fmtTime(m.at))}</span>${m.firstTokenMs ? `<span class="msg-lat">首字 ${(m.firstTokenMs / 1000).toFixed(1)}s · ${esc(m.model || '')}</span>` : ''}</div>
      <div class="msg-body">${esc(m.content)}</div>
      <div class="msg-actions">${actions}</div>
    </article>`;
  }).join('');
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  if (nearBottom) box.scrollTop = box.scrollHeight;
}

function renderInspector() {
  const body = $('#inspBody');
  const card = activeCard();
  if (!card) {
    body.innerHTML = `<div class="insp-empty">
      <h2>选一张卡</h2>
      <p>卡片是工作的最小单位。右侧会显示原文、整理、独立审核、批准和执行结果。</p>
      <div class="minimap-insp">${state.cards.slice(0, 24).map((c) => `<button class="minimap-cell ${statusClass(c.status)}" data-mini-card="${esc(c.id)}" title="${esc(c.title)}"></button>`).join('') || '<span class="mini">还没有卡片</span>'}</div>
      <button class="btn primary" data-open-newcard type="button">新建第一张卡</button>
    </div>`;
    return;
  }
  const status = statusLabel(card.status);
  body.innerHTML = `
    <div class="insp-card-head">
      <div class="insp-meta"><span class="chip ${card.status === 'done' ? 'good' : card.status === 'failed' ? 'bad' : card.status === 'needs_changes' ? 'warn' : 'accent'}">${esc(status)}</span><span class="chip">${esc(sourceLabel(card))}</span><span>v${card.version || 1}</span><span>${esc(fmtTime(card.updatedAt))}</span></div>
      <h2>${esc(card.title || '未命名卡片')}</h2>
      <div class="insp-meta"><span>${esc(card.project || '默认项目')}</span><span>·</span><span>${esc(card.source?.label || '手动输入')}</span>${card.source?.batch ? `<span>·</span><span>批次 ${esc(card.source.batch)}</span>` : ''}</div>
    </div>
    <div class="insp-tabs">
      ${[['content', '内容'], ['assistant', '助手'], ['review', '审核'], ['execute', '执行']].map(([k, v]) => `<button class="tab ${state.inspTab === k ? 'active' : ''}" data-insp-tab="${k}" type="button">${v}</button>`).join('')}
    </div>
    <div id="inspPane">${inspPane(card)}</div>`;
}

function inspPane(card) {
  if (state.inspTab === 'content') {
    return `${renderDeliveryPanel(card, esc)}<div class="insp-section">
      <div class="insp-label"><span>当前文本</span><span>${(card.working || '').length} 字</span></div>
      <textarea id="cardWorking" spellcheck="false">${esc(card.working || '')}</textarea>
      <div class="insp-actions"><button class="btn primary small" data-card-action="save" type="button">保存修改</button><button class="btn ghost small" data-card-action="copy" type="button">复制</button></div>
    </div>
    <div class="insp-section">
      <div class="insp-label"><span>原始文字</span><span>可查 · 不被覆盖</span></div>
      <details class="original"><summary>展开原始内容（${(card.original || '').length} 字）</summary><pre>${esc(card.original || '')}</pre></details>
    </div>
    <div class="insp-section">
      <div class="insp-label"><span>来源</span></div>
      <p>${esc(card.source?.kind || 'manual')} · ${esc(card.source?.app || '本工作台')}${card.source?.at ? ' · ' + esc(fmtTime(card.source.at)) : ''}</p>
      ${card.source?.externalAssistant ? '<p class="chip warn">外部助手内容：不是执行授权</p>' : ''}
    </div>
    <div class="insp-section"><div class="insp-label"><span>删除</span></div><button class="btn danger small" data-card-action="delete" type="button">删除这张卡</button></div>`;
  }
  if (state.inspTab === 'assistant') {
    if (!card.assistant) {
      return `<div class="insp-section"><p>还没有整理。整理会把原文变成可读的草稿和清单，但不会送审，更不会批准。</p><button class="btn primary small" data-card-action="organize" type="button">整理这张卡</button></div>`;
    }
    const a = card.assistant;
    return `<div class="insp-section"><div class="insp-label"><span>整理摘要</span><span>${esc(a.model || '')}</span></div><p>${esc(a.summary)}</p></div>
      ${a.checklist?.length ? `<div class="insp-section"><div class="insp-label"><span>清单</span></div><ul>${a.checklist.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
      ${a.questions?.length ? `<div class="insp-section"><div class="insp-label"><span>需要澄清</span></div><ul>${a.questions.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
      ${a.externalAssistant ? `<div class="insp-section"><p class="chip warn">这段内容看起来像外部助手输出；它不是用户的执行授权。</p></div>` : ''}
      <div class="insp-actions"><button class="btn ghost small" data-card-action="organize" type="button">重新整理</button><button class="btn primary small" data-card-action="review" type="button">送独立审核</button></div>`;
  }
  if (state.inspTab === 'review') {
    if (!card.review) {
      return `<div class="insp-section"><p>独立审核会检查来源、说话人、歧义和风险。审核通过也不等于批准执行。</p><button class="btn primary small" data-card-action="review" type="button">送独立审核</button></div>`;
    }
    const r = card.review;
    return `<div class="insp-section"><div class="insp-label"><span>结论</span><span>${esc(r.reviewer || 'independent')}</span></div><p><span class="chip ${r.verdict === 'pass' ? 'good' : 'warn'}">${r.verdict === 'pass' ? '通过' : '需要修改'}</span></p><p>${esc(r.notes)}</p></div>
      ${r.risks?.length ? `<div class="insp-section"><div class="insp-label"><span>风险</span></div><ul>${r.risks.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
      <div class="insp-actions"><button class="btn ghost small" data-card-action="review" type="button">重新送审</button><button class="btn primary small" data-card-action="approve" type="button" ${r.verdict === 'pass' ? '' : 'data-force="1"'}>${r.verdict === 'pass' ? '批准执行' : '强制批准'}</button></div>`;
  }
  const task = state.tasks.find((t) => t.cardId === card.id);
  const finished = card.status === 'done';
  const running = card.status === 'running' || card.status === 'approved';
  const approvalAction = finished || running
    ? `<span class="chip ${finished ? 'good' : 'accent'}">${finished ? '已完成' : '执行中'}</span>`
    : card.review?.verdict === 'pass'
      ? `<button class="btn primary small" data-card-action="approve" type="button">批准执行</button>`
      : `<button class="btn ghost small" data-card-action="review" type="button">先送审</button>`;
  return `<div class="insp-section"><div class="insp-label"><span>批准</span></div>${card.approval ? `<p>${esc(card.approval.by)} · ${esc(fmtTime(card.approval.at))}<br>方式：${esc(card.approval.method)}</p>` : '<p>还没有批准。审核通过后，仍需你本人点批准。</p>'}<div class="insp-actions">${approvalAction}</div></div>
    <div class="insp-section"><div class="insp-label"><span>任务</span></div>${task ? `<p><span class="chip ${task.status === 'done' ? 'good' : task.status === 'failed' ? 'bad' : 'accent'}">${esc(task.status)}</span><br>${esc(task.executor || 'bridge')} · ${esc(fmtTime(task.createdAt))}${task.error ? '<br><span class="chip bad">' + esc(task.error) + '</span>' : ''}</p>` : finished ? '<p>结果已回卡；任务记录未保留（旧数据）。</p>' : '<p>还没有任务。批准后才会入队。</p>'}</div>
    ${card.result ? `<div class="insp-section"><div class="insp-label"><span>结果</span><button class="text-btn" data-card-action="copy-result" type="button">复制</button></div><div class="result-box"><pre>${esc(card.result)}</pre></div></div>` : ''}
    ${card.organizeError ? `<div class="insp-section"><p class="chip bad">自动整理失败：${esc(card.organizeError)}。原文仍在。</p></div>` : ''}`;
}

function renderComposerMeta() {
  const conv = activeConversation();
  $('#composerTarget').textContent = state.temp ? '临时会话 · 不写服务端' : (conv ? conv.title || '未命名会话' : '未选择会话');
  $('#composerHint').textContent = state.temp ? '临时会话：关闭即清除，不会写入服务端历史。' : '草稿自动保存在本机；收起不丢。';
  const voiceTarget = $('#voiceTarget');
  const card = activeCard();
  voiceTarget.textContent = card ? `目标卡：${card.title}` : '目标卡：未选择（语音文字会进输入区）';
}

function renderQuickbar() {
  const bar = $('#quickbar');
  const items = Array.isArray(state.settings.quickbar) ? state.settings.quickbar : DEFAULT_SETTINGS.quickbar;
  bar.innerHTML = items.filter((k) => QUICK_ACTIONS[k]).map((k) => {
    const a = QUICK_ACTIONS[k];
    return `<button class="quick" data-quick="${esc(k)}" type="button"><svg><use href="#${a.icon}"></use></svg>${esc(a.label)}</button>`;
  }).join('');
}

function renderVoicePanel() {
  const sel = $('#speakerSelect');
  const speakers = state.voiceInfo?.speakers || [];
  if (sel && !sel.options.length) {
    sel.innerHTML = speakers.map((s) => `<option value="${esc(s.id)}">${esc(s.label)} · ${esc(s.note || '')}</option>`).join('');
    const saved = localStorage.getItem('xcw_voice_speaker');
    if (saved && speakers.some((s) => s.id === saved)) sel.value = saved;
  }
  const v = state.voice;
  $('#voiceState').textContent = v.active ? (v.paused ? '已暂停' : '正在听') : '未连接';
  $('#voiceStart').hidden = v.active;
  $('#voicePause').hidden = !v.active;
  $('#voiceStop').hidden = !v.active;
  $('#voicePause').innerHTML = v.paused ? '<svg><use href="#i-play"></use></svg> 继续' : '<svg><use href="#i-pause"></use></svg> 暂停';
  $('#voiceOrb').classList.toggle('active', v.active);
  $('#voiceOrb').classList.toggle('paused', v.paused);
  if (v.active && !v.paused) $('#voiceStart').hidden = true;
  if (!v.active) $('#voiceStart').hidden = false;
  $('#voiceStart').disabled = !state.voiceInfo?.available;
  if (!state.voiceInfo?.available) {
    $('#voiceState').textContent = '语音未配置';
  }
}

function renderModelList(filter = '') {
  const q = filter.trim().toLowerCase();
  const models = state.models.filter((m) => !q || m.full.toLowerCase().includes(q) || m.short.toLowerCase().includes(q));
  const groups = new Map();
  for (const m of models) {
    if (!groups.has(m.family)) groups.set(m.family, []);
    groups.get(m.family).push(m);
  }
  const current = activeModel()?.id;
  $('#modelCount').textContent = `${models.length} / ${state.models.length}`;
  const foot = $('#modelFoot');
  if (foot) foot.textContent = state.provider === 'subrouter'
    ? `SubRouter · ${state.tier || '自定义'} · 切档不换卡`
    : '缩写只影响顶栏显示，不改真实 model_id。';
  $('#modelList').innerHTML = models.length ? [...groups.entries()].map(([family, list]) => `
    <div class="mini" style="padding:8px 9px 2px;text-transform:uppercase;letter-spacing:.14em">${esc(family)}</div>
    ${list.map((m) => `<button class="model-row ${m.id === current ? 'selected' : ''}" data-model="${esc(m.id)}" type="button">
      <span class="glyph">${esc(m.brand)}</span>
      <span class="model-name"><b>${esc(m.full)}</b><span>${esc(m.short)} · ${esc(m.route || 'route')}${m.pointToAud != null ? ' · 1 点 = A$' + m.pointToAud : ''}</span></span>
      <svg class="model-check"><use href="#i-check"></use></svg>
    </button>`).join('')}`).join('') : '<div class="conv-empty">没有匹配的模型。</div>';
}

function renderTierTabs() {
  const el = $('#modelTierTabs');
  if (!el) return;
  if (state.provider !== 'subrouter' || !state.tiers.length) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  el.hidden = false;
  el.innerHTML = state.tiers.map((t) => `<button data-tier="${esc(t)}" class="${t === state.tier ? 'active' : ''}" type="button">${esc(t)}</button>`).join('');
}

function renderLoginTiers(tiers) {
  state.loginTiers = Array.isArray(tiers) ? tiers : [];
  const wrap = $('#loginTiers');
  const el = $('#loginTierTabs');
  if (!wrap || !el) return;
  wrap.hidden = !state.loginTiers.length;
  el.innerHTML = state.loginTiers.map((t) => `<button data-login-tier="${esc(t)}" type="button">${esc(t)}</button>`).join('');
}

async function switchTier(tier) {
  if (state.provider !== 'subrouter' || tier === state.tier) return;
  try {
    const d = await api('/api/tier', { method: 'POST', body: { tier } });
    state.tier = d.tier;
    state.models = (Array.isArray(d.models) ? d.models : []).filter((m) => m.id);
    state.balance = d.balance ?? state.balance;
    state.balanceUnit = d.balanceUnit || 'usd';
    if (!state.models.some((m) => m.id === state.settings.model)) state.settings.model = state.models[0]?.id || '';
    await saveSettings({ model: state.settings.model, theme: 'auto' });
    renderTierTabs();
    renderModelList($('#modelSearch')?.value || '');
    renderAll();
    toast(`已切到 SubRouter ${tier}`);
  } catch (e) {
    toast('切换档位失败：' + e.message, true);
  }
}

// ---------------------------------------------------------------------------
// Actions

async function doLogin(key, demo = false, tier = '', access = '') {
  $('#loginMsg').textContent = tier ? `正在进入 SubRouter ${tier}…` : (demo ? '正在用演示账号验证…' : '正在验证账号…');
  $('#loginMsg').classList.remove('bad');
  try {
    const payload = tier ? { tier, access } : (demo ? { demo: true } : { key });
    const d = await api('/api/session', { method: 'POST', body: payload });
    state.user = d.user;
    state.balance = d.balance;
    state.balanceUnit = d.balanceUnit || 'point';
    state.balanceLabel = d.balanceLabel || '点';
    state.provider = d.provider || 'gateway';
    state.tier = d.tier || null;
    state.tiers = Array.isArray(d.tiers) ? d.tiers : [];
    const boot = await api('/api/bootstrap');
    await acceptBootstrap(boot);
    showShell();
    showIntro();
    renderAll();
    registerSW();
    setView('cards');
    toast(tier ? `已进入 SubRouter ${tier}` : (demo ? '已进入演示账号' : '已登录'));
  } catch (e) {
    $('#loginMsg').textContent = e.message || '登录失败';
    $('#loginMsg').classList.add('bad');
  }
}

async function newConversation({ silent = false } = {}) {
  if (state.temp) {
    const saved = await leaveTemp();
    if (saved === false) return null;
  }
  try {
    const d = await api('/api/conversations', { method: 'POST', body: { title: '新会话', system: '', model: activeModel()?.id || '' } });
    const conv = d.conversation;
    state.conversations.unshift(conv);
    state.activeConversationId = conv.id;
    setView('chat');
    renderAll();
    closeDrawers();
    focusComposer();
    if (!silent) toast('已新建会话');
    return conv;
  } catch (e) {
    toast('新建会话失败：' + e.message, true);
    return null;
  }
}

async function selectConversation(id) {
  if (state.temp) {
    const saved = await leaveTemp();
    if (saved === false) return;
  }
  state.activeConversationId = id;
  setView('chat');
  renderAll();
  closeDrawers();
}

async function renameConversation(id) {
  const conv = state.conversations.find((c) => c.id === id);
  if (!conv) return;
  const title = window.prompt('会话名称', conv.title || '未命名会话');
  if (title == null) return;
  const clean = title.trim().slice(0, 120);
  if (!clean) return;
  conv.title = clean;
  renderAll();
  try {
    await api('/api/conversations/' + id, { method: 'PATCH', body: { title: clean } });
    toast('会话已改名');
  } catch (e) {
    toast('改名未同步：' + e.message, true);
  }
}

async function deleteConversation(id) {
  const conv = state.conversations.find((c) => c.id === id);
  if (!conv) return;
  const ok = await askConfirm({ title: '删除会话', text: `删除「${conv.title}」？聊天记录会一起删除。`, ok: '删除' });
  if (!ok) return;
  try {
    await api('/api/conversations/' + id, { method: 'DELETE' });
    state.conversations = state.conversations.filter((c) => c.id !== id);
    if (state.activeConversationId === id) state.activeConversationId = state.conversations[0]?.id || null;
    renderAll();
    toast('会话已删除');
  } catch (e) {
    toast('删除失败：' + e.message, true);
  }
}

function openConvMenu(id, anchor) {
  closeConvMenu();
  const conv = state.conversations.find((c) => c.id === id);
  if (!conv) return;
  const el = document.createElement('div');
  el.className = 'popmenu';
  el.innerHTML = `<button data-cmenu="rename">重命名</button><button data-cmenu="delete" class="danger">删除</button>`;
  document.body.appendChild(el);
  const r = anchor.getBoundingClientRect();
  const h = 78;
  el.style.left = Math.max(8, Math.min(window.innerWidth - 150, r.left - 100)) + 'px';
  el.style.top = Math.min(window.innerHeight - h - 8, r.bottom + 4) + 'px';
  el.addEventListener('click', async (ev) => {
    const act = ev.target.closest('[data-cmenu]')?.dataset.cmenu;
    closeConvMenu();
    if (act === 'rename') await renameConversation(id);
    if (act === 'delete') await deleteConversation(id);
  });
  setTimeout(() => document.addEventListener('click', closeConvMenu, { once: true }), 0);
}
function closeConvMenu() { $$('.popmenu').forEach((e) => e.remove()); }

function setView(view) {
  state.view = view;
  renderMain();
  if (view === 'tasks') refreshTasks().then(() => { renderTasks(); renderSidebar(); });
  if (view === 'linear') loadLinear();
}

async function loadLinear() {
  const list = $('#linearList');
  const empty = $('#linearEmpty');
  const meta = $('#linearMeta');
  try {
    const data = await api('/api/linear/issues');
    state.linear = data;
    const issues = data.issues || [];
    $('#navLinearCount').textContent = String(issues.length);
    const when = data.syncedAt ? new Date(data.syncedAt).toLocaleString() : '还没有同步';
    meta.textContent = `${issues.length} 条 issue · ${data.teams?.length || 0} 个团队 · ${data.workflowStates?.length || 0} 个状态 · ${when}`;
    if (!issues.length) {
      list.innerHTML = '';
      empty.hidden = false;
      empty.innerHTML = '<h2>本地还没有 issue</h2><p>点「同步到本地」。服务端会把 Linear 写入 linear_issues，这个页面只读那张表。</p>';
      return;
    }
    empty.hidden = true;
    list.innerHTML = issues.map((row) => `<article class="linear-row">
      <span class="linear-id">${esc(row.identifier || row.id)}</span>
      <div>
        <div class="linear-title">${esc(row.title || '未命名')}</div>
        <div class="linear-sub">${esc(row.team_key || row.team_name || '—')} · ${esc(row.assignee_name || '未分配')}</div>
      </div>
      <span class="linear-state" style="${row.state_color ? `border-color:${esc(row.state_color)}` : ''}">${esc(row.state_name || '无状态')}</span>
    </article>`).join('');
  } catch (err) {
    list.innerHTML = '';
    empty.hidden = false;
    empty.innerHTML = `<h2>镜像不可用</h2><p>${esc(err.message || '读取 linear_issues 失败')}</p>`;
  }
}

function toggleTemp() {
  if (state.temp) return leaveTemp();
  state.tempBackup = { conversationId: state.activeConversationId };
  state.temp = {
    id: 'temp',
    title: '临时会话',
    system: '',
    model: activeModel()?.id || '',
    messages: [],
    temporary: true,
    createdAt: now(),
    updatedAt: now(),
  };
  setView('chat');
  renderAll();
  toast('临时会话：只在本机内存，关闭即清除');
}

async function leaveTemp() {
  if (!state.temp) return true;
  const temp = state.temp;
  if (temp.messages?.length) {
    const save = await askConfirm({
      title: '离开临时会话',
      text: '这段对话只在内存里。要保存为正式会话吗？取消则丢弃。',
      ok: '保存为正式会话',
    });
    if (save) {
      try {
        const d = await api('/api/conversations', {
          method: 'POST',
          body: { title: temp.title || '临时会话', system: temp.system || '', messages: temp.messages, model: temp.model },
        });
        state.conversations.unshift(d.conversation);
        state.temp = null;
        state.activeConversationId = d.conversation.id;
        setView('chat');
        renderAll();
        toast('已保存为正式会话');
        return true;
      } catch (e) {
        toast('保存失败，仍留在临时会话', true);
        return false;
      }
    }
  }
  state.temp = null;
  state.activeConversationId = state.tempBackup?.conversationId || state.conversations[0]?.id || null;
  state.tempBackup = null;
  renderAll();
  return null;
}

function focusComposer(expand = true) {
  if (expand) {
    $('#composerPill').hidden = true;
    $('#composerPanel').hidden = false;
    $('#composerPill').setAttribute('aria-expanded', 'true');
    document.body.classList.add('composer-open');
  }
  const input = $('#composerInput');
  input.value = loadDraft();
  setTimeout(() => input.focus({ preventScroll: true }), 60);
}

function toggleComposer(open) {
  const panel = $('#composerPanel');
  const pill = $('#composerPill');
  const next = open === undefined ? panel.hidden : open;
  panel.hidden = !next;
  pill.hidden = next;
  pill.setAttribute('aria-expanded', String(next));
  document.body.classList.toggle('composer-open', next);
  if (next) {
    const input = $('#composerInput');
    input.value = loadDraft();
    setTimeout(() => input.focus({ preventScroll: true }), 40);
  } else {
    saveDraft($('#composerInput').value);
  }
}

function openCardModal(prefill = '', title = '') {
  $('#cardModalTitle').textContent = prefill ? '从对话生成卡片' : '生成卡片';
  $('#cardTitleInput').value = title || '';
  $('#cardTextInput').value = prefill || '';
  openModal('cardModal');
}

async function createCard() {
  const text = $('#cardTextInput').value.trim();
  if (!text) return toast('先写点内容', true);
  const btn = $('#cardCreateBtn');
  btn.disabled = true;
  try {
    const d = await api('/api/cards', {
      method: 'POST',
      body: { title: $('#cardTitleInput').value.trim(), text, source: { kind: 'manual', label: '手动输入' } },
    });
    state.cards.unshift(d.card);
    state.activeCardId = d.card.id;
    state.inspTab = 'content';
    closeModal('cardModal');
    setView('cards');
    renderAll();
    openInspector();
    toast('已保存为草稿卡；整理 / 送审 / 批准是下一步');
  } catch (e) {
    toast('卡片未保存：' + e.message, true);
  } finally {
    btn.disabled = false;
  }
}

function cardFromLastAssistant() {
  const conv = activeConversation();
  if (!conv) return toast('先选一个会话', true);
  const last = [...(conv.messages || [])].reverse().find((m) => m.role === 'assistant' && m.content?.trim());
  if (!last) return toast('这个会话还没有助手回复', true);
  openCardModal(last.content, (last.content.split('\n')[0] || '').slice(0, 60));
}

function openInspector() {
  if (window.innerWidth < 981) document.body.classList.add('inspector-open');
}
function closeInspector() {
  document.body.classList.remove('inspector-open');
}

async function saveCardText() {
  const card = activeCard();
  if (!card) return;
  const text = $('#cardWorking')?.value ?? card.working;
  try {
    const d = await api('/api/cards/' + card.id, { method: 'PATCH', body: { working: text } });
    replaceCard(d.card);
    toast('修改已保存，卡片标识不变');
  } catch (e) {
    toast('修改未保存：' + e.message, true);
  }
}

function replaceCard(card) {
  const i = state.cards.findIndex((c) => c.id === card.id);
  if (i >= 0) state.cards[i] = card; else state.cards.unshift(card);
  saveCache();
  renderAll();
}

async function runCardAction(action) {
  const card = activeCard();
  if (!card) {
    if (action === 'organize' || action === 'review') return toast('先在卡片列表里选一张卡', true);
    return;
  }
  const actionNames = { organize: '整理', review: '送审', approve: '批准' };
  try {
    if (action === 'save') return await saveCardText();
    if (action === 'copy') return await copyText(card.working || '');
    if (action === 'delivery-retry') return toast(isDelivery(card) ? `请在流水线机器上重跑：RUN_ID=${card.delivery.run_id} make run` : '不是交付卡');
    if (action === 'delivery-contact') return toast('已记下：这张交付卡需要人工处理，请联系 X-connect 客服。');
    if (action === 'copy-result') return await copyText(card.result || '');
    if (action === 'delete') {
      const ok = await askConfirm({ title: '删除卡片', text: `删除「${card.title}」？`, ok: '删除' });
      if (!ok) return;
      await api('/api/cards/' + card.id, { method: 'DELETE' });
      state.cards = state.cards.filter((c) => c.id !== card.id);
      state.activeCardId = null;
      closeInspector();
      renderAll();
      toast('卡片已删除');
      return;
    }
    if (action === 'approve') return await approveActive();
    const btn = $(`[data-card-action="${action}"]`);
    if (btn) btn.disabled = true;
    toast(actionNames[action] + '中…');
    const d = await api(`/api/cards/${card.id}/${action}`, { method: 'POST', body: {} });
    replaceCard(d.card);
    state.inspTab = action === 'review' ? 'review' : 'assistant';
    renderInspector();
    toast(action === 'organize' ? '已整理为草稿，仍需送审和批准' : '独立审核完成，批准仍需要你点击');
  } catch (e) {
    toast(actionNames[action] + '失败：' + e.message, true);
  } finally {
    const btn = $(`[data-card-action="${action}"]`);
    if (btn) btn.disabled = false;
  }
}

async function approveActive() {
  const card = activeCard();
  if (!card) return toast('先选一张卡', true);
  if (card.status === 'done') return toast('这张卡已经完成', true);
  if (card.status === 'running' || card.status === 'approved') return toast('这张卡已经在执行队列里', true);
  const force = card.review?.verdict !== 'pass';
  const ok = await askConfirm({
    title: '批准执行',
    text: force
      ? `「${card.title}」的独立审核还没有通过。继续会强制批准并派给执行端，可能消耗额度。`
      : `批准「${card.title}」执行？会派给执行端并消耗额度。批准后仍可在任务里看到状态。`,
    ok: force ? '强制批准' : '批准执行',
  });
  if (!ok) return;
  try {
    const d = await api(`/api/cards/${card.id}/approve`, { method: 'POST', body: force ? { force: true } : {} });
    replaceCard(d.card);
    await refreshTasks();
    state.inspTab = 'execute';
    renderAll();
    toast(d.card.status === 'done' ? '执行完成，结果已回卡' : '已批准并入队');
    if (d.card.status !== 'done') pollCard(card.id);
  } catch (e) {
    toast('批准失败：' + e.message, true);
  }
}

async function pollCard(id, attempts = 12) {
  for (let i = 0; i < attempts; i++) {
    await sleep(2000);
    try {
      const d = await api('/api/cards/' + id);
      if (!d.card) return;
      replaceCard(d.card);
      await refreshTasks();
      if (d.card.status === 'done' || d.card.status === 'failed') return;
    } catch { return; }
  }
}

async function refreshCards() {
  try {
    const d = await api('/api/cards');
    state.cards = d.cards || [];
    saveCache();
    renderAll();
  } catch {}
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('已复制');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast('已复制'); } catch { toast('复制失败', true); }
    ta.remove();
  }
}

async function sendChat() {
  const input = $('#composerInput');
  const text = input.value.trim();
  if (!text) return;
  const chosenModel = activeModel()?.id || '';
  if (!chosenModel) {
    saveDraft(text);
    toggleComposer(true);
    toast('还没有可用的模型，先在顶栏选一个', true);
    return;
  }
  let conv = activeConversation();
  if (!conv) {
    if (state.temp) {
      // should not happen, but keep a safe path
      state.temp = { id: 'temp', title: '临时会话', messages: [], temporary: true, createdAt: now(), updatedAt: now() };
      state.tempBackup = { conversationId: state.activeConversationId };
      conv = state.temp;
    } else {
      conv = await newConversation({ silent: true });
      if (!conv) return;
    }
  }
  const original = text;
  const isNew = !conv.messages || !conv.messages.length;
  conv.messages = [...(conv.messages || []), { role: 'user', content: text, at: now() }];
  if (isNew || !conv.title || conv.title === '新会话') {
    conv.title = text.split('\n')[0].slice(0, 60) || '新会话';
  }
  input.value = '';
  clearDraft();
  renderChat();
  renderSidebar();
  const startedAt = performance.now();
  const placeholder = { role: 'assistant', content: '', at: now(), streaming: true, firstTokenMs: null, model: chosenModel };
  conv.messages.push(placeholder);
  renderChat();
  const bubble = $('.msg.streaming .msg-body');
  try {
    const full = await streamChat({
      model: chosenModel,
      messages: conv.messages.filter((m) => m !== placeholder).map((m) => ({ role: m.role, content: m.content })),
      conversationId: state.temp ? 'temp' : conv.id,
      system: conv.system || '',
      temporary: Boolean(state.temp),
    }, (delta) => {
      if (placeholder.firstTokenMs == null) placeholder.firstTokenMs = Math.round(performance.now() - startedAt);
      placeholder.content += delta;
      if (bubble) bubble.textContent = placeholder.content;
      const box = $('#chatMessages');
      if (box && box.scrollHeight - box.scrollTop - box.clientHeight < 160) box.scrollTop = box.scrollHeight;
    });
    placeholder.streaming = false;
    if (!placeholder.content) placeholder.content = '（空回复）';
    if (!state.temp) {
      try { await api('/api/conversations/' + conv.id, { method: 'PATCH', body: { title: conv.title, system: conv.system || '', messages: conv.messages.filter((m) => !m.streaming) } }); } catch {}
      const ix = state.conversations.findIndex((c) => c.id === conv.id);
      if (ix >= 0) state.conversations[ix] = { ...conv, messages: conv.messages.filter((m) => !m.streaming), updatedAt: now() };
    }
    renderChat();
    saveCache();
  } catch (e) {
    placeholder.streaming = false;
    if (!placeholder.content) {
      conv.messages = (conv.messages || []).filter((m) => m !== placeholder);
      const lastUser = [...conv.messages].reverse().find((m) => m.role === 'user' && m.content === original);
      if (lastUser) conv.messages = conv.messages.filter((m) => m !== lastUser);
      input.value = original;
      saveDraft(original);
      toggleComposer(true);
      toast('发送失败，原文已回到输入区', true);
    } else {
      placeholder.content += '\n\n[中断：' + (e.message || '网络错误') + ']';
      toast('回复中断，已保留已收到的部分', true);
    }
    renderChat();
    saveCache();
  }
}

async function streamChat(payload, onDelta) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let data = null;
    try { data = await res.json(); } catch {}
    const err = new Error(data?.message || data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    if (res.status === 401) showLogin('会话已过期，请重新登录。');
    throw err;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let full = '';
  let serverError = null;
  let sawData = false;
  const hint = setTimeout(() => {
    if (!sawData) toast('上游还没出第一个字；这个模型可能正在排队，可以换快一点的模型', true);
  }, 8000);
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of block.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const d = line.slice(5).trim();
        if (!d || d === '[DONE]') continue;
        try {
          const j = JSON.parse(d);
          if (j.error) serverError = String(j.error.message || j.error);
          const delta = j.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta) {
            sawData = true;
            clearTimeout(hint);
            full += delta;
            onDelta(delta);
          }
        } catch {}
      }
    }
  }
  clearTimeout(hint);
  if (serverError && !full) throw new Error(serverError);
  if (serverError) full += '\n\n[中断：' + serverError + ']';
  return full;
}

function bindSettingsAfterRender() {
  const body = $('#settingsBody');
  if (!body) return;
  body.onclick = async (ev) => {
    const seg = ev.target.closest('[data-layout-choice]');
    if (seg) {
      await saveSettings({ layout: seg.dataset.layoutChoice });
      renderSettings();
      toast('布局已保存');
      return;
    }
    const q = ev.target.closest('[data-qaction]');
    if (q) {
      const id = q.dataset.qaction;
      const list = Array.isArray(state.settings.quickbar) ? [...state.settings.quickbar] : [...DEFAULT_SETTINGS.quickbar];
      const on = list.includes(id);
      const next = on ? list.filter((x) => x !== id) : [...list, id];
      state.settings.quickbar = next;
      await saveSettings({ quickbar: next });
      renderSettings();
      renderQuickbar();
      return;
    }
    const up = ev.target.closest('[data-qmove]');
    if (up) {
      const id = up.dataset.qid;
      const dir = up.dataset.qmove;
      const list = [...state.settings.quickbar];
      const i = list.indexOf(id);
      if (i < 0) return;
      const j = dir === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      state.settings.quickbar = list;
      await saveSettings({ quickbar: list });
      renderSettings(); renderQuickbar();
      return;
    }
    if (ev.target.closest('#saveSystemPrompt')) {
      const conv = activeConversation();
      if (!conv) return toast('先选一个会话', true);
      conv.system = $('#systemPromptInput').value.slice(0, 4000);
      if (!state.temp) {
        try { await api('/api/conversations/' + conv.id, { method: 'PATCH', body: { system: conv.system } }); } catch { toast('系统提示未同步', true); }
      }
      toast('系统提示已保存到当前会话');
      return;
    }
    if (ev.target.closest('#mintIngest')) {
      await mintIngestToken();
      renderSettings();
      return;
    }
    if (ev.target.closest('#copyIngest')) {
      if (state.ingestToken) await copyText(state.ingestToken);
      else toast('先生成接收令牌', true);
      return;
    }
    if (ev.target.closest('#toggleIngest')) {
      const inp = $('#ingestTokenInput');
      if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
      return;
    }
    if (ev.target.closest('[data-copy-endpoint]')) {
      await copyText(location.origin + '/api/inbox');
      return;
    }
    if (ev.target.closest('#testIngest')) {
      await testIngest();
      return;
    }
    if (ev.target.closest('#installFromSettings')) {
      await promptInstall();
      return;
    }
    if (ev.target.closest('#clearLocal')) {
      const ok = await askConfirm({ title: '清理本机缓存', text: '清理本机缓存并退出登录？草稿也会被清掉。', ok: '清理并退出' });
      if (!ok) return;
      await logoutAndClear();
      return;
    }
    if (ev.target.closest('#logoutFromSettings')) {
      await logoutAndClear();
    }
  };
  body.oninput = async (ev) => {
    if (ev.target.id === 'accentInput') {
      state.settings.customPalette = true;
      state.settings.accent = ev.target.value;
      applyTheme();
      saveCache();
    }
  };
  body.onchange = async (ev) => {
    if (ev.target.id === 'themeSelect') {
      await saveSettings({ theme: ev.target.value });
      renderSettings();
      toast('主题已切换');
    }
    if (ev.target.id === 'accentInput') {
      await saveSettings({ accent: ev.target.value, customPalette: true }, { quiet: true });
    }
    if (ev.target.id === 'reducedMotionToggle') {
      state.settings.reducedMotion = ev.target.checked;
      await saveSettings({ reducedMotion: ev.target.checked });
      renderSettings();
    }
  };
}

function renderSettings() {
  const tab = state.settingsTab || 'look';
  $$('#settingsTabs .tab').forEach((b) => b.classList.toggle('active', b.dataset.stab === tab));
  const body = $('#settingsBody');
  if (tab === 'look') {
    const theme = state.settings.theme || 'auto';
    body.innerHTML = `<div class="settings-pane">
      <div class="field"><span>布局</span><div class="seg">
        <button data-layout-choice="auto" class="${state.settings.layout === 'auto' ? 'active' : ''}">自动</button>
        <button data-layout-choice="compact" class="${state.settings.layout === 'compact' ? 'active' : ''}">紧凑折叠</button>
        <button data-layout-choice="full" class="${state.settings.layout === 'full' ? 'active' : ''}">完整桌面</button>
      </div><p class="hint">自动：宽屏完整，手机/窄窗紧凑。手动选择会记住。完整布局在手机上会横向滚动。</p></div>
      <div class="field"><span>主题</span><select id="themeSelect">
        <option value="auto" ${theme === 'auto' ? 'selected' : ''}>跟随模型（默认 X-connect）</option>
        <option value="default" ${theme === 'default' ? 'selected' : ''}>X-connect 默认</option>
        <option value="claude" ${theme === 'claude' ? 'selected' : ''}>Claude</option>
        <option value="openai" ${theme === 'openai' ? 'selected' : ''}>OpenAI</option>
        <option value="gemini" ${theme === 'gemini' ? 'selected' : ''}>Gemini</option>
        <option value="deepseek" ${theme === 'deepseek' ? 'selected' : ''}>DeepSeek</option>
        <option value="glm" ${theme === 'glm' ? 'selected' : ''}>GLM</option>
        <option value="qwen" ${theme === 'qwen' ? 'selected' : ''}>Qwen</option>
        <option value="kimi" ${theme === 'kimi' ? 'selected' : ''}>Kimi</option>
        <option value="mimo" ${theme === 'mimo' ? 'selected' : ''}>MiMo</option>
        <option value="grok" ${theme === 'grok' ? 'selected' : ''}>Grok</option>
        <option value="hunyuan" ${theme === 'hunyuan' ? 'selected' : ''}>混元</option>
      </select></div>
      <div class="field"><span>自定义强调色（可选）</span><div class="token-box"><input id="accentInput" type="color" value="${esc(state.settings.accent || '#f59e0b')}" style="width:52px;padding:3px"><span class="hint">只在打开自定义时覆盖主题色。</span></div></div>
      <div class="row-between"><div><div class="field"><span>减少动态效果</span></div><p class="hint">关闭水晶 X 过渡和大部分动画。</p></div><label class="switch ${state.settings.reducedMotion ? 'on' : ''}"><input id="reducedMotionToggle" type="checkbox" ${state.settings.reducedMotion ? 'checked' : ''} hidden></label></div>
      <p class="hint">主题 token 会切换配色、字体和组件视觉；布局和操作不变。完整模型名在顶栏模型选择器里。</p>
    </div>`;
  } else if (tab === 'system') {
    const conv = activeConversation();
    body.innerHTML = `<div class="settings-pane">
      <div class="field"><span>当前会话</span><b>${esc(conv?.title || '未选择会话')}</b></div>
      <div class="field"><span>Conversation System Prompt</span><textarea id="systemPromptInput" rows="7" ${conv ? '' : 'disabled'} placeholder="这段提示只属于当前会话…">${esc(conv?.system || '')}</textarea></div>
      <div class="row-between"><p class="hint">顶栏不再显示完整模型名或提示词。提示词保存在会话里。</p><button class="btn primary small" id="saveSystemPrompt" type="button" ${conv ? '' : 'disabled'}>保存</button></div>
      ${state.temp ? '<p class="chip warn">临时会话：提示词只在内存里。</p>' : ''}
    </div>`;
  } else if (tab === 'quick') {
    const list = Array.isArray(state.settings.quickbar) ? state.settings.quickbar : DEFAULT_SETTINGS.quickbar;
    body.innerHTML = `<div class="settings-pane">
      <p class="hint">常用快捷栏可自定义功能和顺序；未选中的进“更多”思路，不堆满屏幕。</p>
      <div class="quick-config">${Object.entries(QUICK_ACTIONS).map(([id, a]) => {
        const on = list.includes(id);
        return `<div class="quick-config-row"><span class="q-name">${esc(a.label)}</span>
          ${on ? `<button class="icon-btn" data-qmove="up" data-qid="${esc(id)}" title="上移"><svg><use href="#i-arrow-up"></use></svg></button><button class="icon-btn" data-qmove="down" data-qid="${esc(id)}" title="下移"><svg><use href="#i-arrow-down"></use></svg></button>` : ''}
          <button class="switch ${on ? 'on' : ''}" data-qaction="${esc(id)}" aria-label="${on ? '移除' : '添加'}" type="button"></button>
        </div>`;
      }).join('')}</div>
    </div>`;
  } else if (tab === 'subtitle') {
    const token = state.ingestToken || '';
    body.innerHTML = `<div class="settings-pane">
      <div class="field"><span>受控接收令牌</span><div class="token-box"><input id="ingestTokenInput" type="password" readonly value="${esc(token)}" placeholder="点下方生成"><button class="btn ghost small" id="toggleIngest" type="button">显示</button><button class="btn ghost small" id="copyIngest" type="button">复制</button></div><p class="hint">只用于创建草稿卡；不能读卡片、不能批准执行。令牌有效期 90 天，过期后重新生成。</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary small" id="mintIngest" type="button">${token ? '重新生成令牌' : '生成接收令牌'}</button><button class="btn ghost small" id="testIngest" type="button">发送测试字幕</button></div>
      <div class="field"><span>接收地址</span><div class="token-box"><input readonly value="${esc(location.origin + '/api/inbox')}"><button class="btn ghost small" data-copy-endpoint type="button">复制</button></div></div>
      <div class="field"><span>iOS 快捷指令（手动步骤）</span><ol class="steps">
        <li>设置 → 辅助功能 → 触控 → 轻点背面 → 轻点两下 → 选择下面的快捷指令。背面触发只能由 iOS 系统设置，网页不能替你静默绑定。</li>
        <li>快捷指令 App → 新建：<code>获取剪贴板</code> → <code>获取 URL 内容</code>。</li>
        <li>URL 填上面的接收地址；方法 POST；请求头 <code>Authorization</code> = <code>Bearer 你的令牌</code>；请求体 JSON：<code>{"text":"剪贴板文本","source":{"kind":"subtitle","app":"外部 App","batch":"当前日期"}}</code>。</li>
        <li>在外部 App 里手动点「拷贝字幕」，再轻点背面。快捷指令不能替你自动点“拷贝字幕”，也不能后台定时抓新字幕。</li>
      </ol><p class="hint">网页无法读取其他 App 的音频或字幕；这里只接收你手动提交的文本。成功保存与异步整理会分开显示。</p></div>
      <p class="hint">当前存储：${esc(state.storage)} · 小助手整理会调用你登录账号的模型并计费。</p>
    </div>`;
  } else {
    body.innerHTML = `<div class="settings-pane">
      <div class="about-list">
        <div><b>X-connect Workbench</b> · build <code>${esc(state.build)}</code></div>
        <div>账号：${esc(accountLabel())} · 余额 ${esc(balanceText())}</div>
        <div>存储：${esc(state.storage)}（Supabase work_checkpoints；服务账号按账号命名空间隔离）</div>
        <div>语音：${state.voiceInfo?.available ? '现有 /voice 桥 + 豆包实时语音；收起面板不挂断' : '未配置语音令牌'}</div>
        <div>执行：${state.tasks.some((t) => t.executor === 'builtin-llm') ? '预览内置 LLM 执行器 + 现有 bridge 接口' : '现有 bridge 接口'}</div>
        <div>安装：${state.installPrompt ? '浏览器已提供安装入口' : '当前浏览器未提供安装入口；仍可正常浏览使用'}</div>
        <div>Service Worker：${state.swReg ? '已注册' : '未注册'} ${state.updateReady ? '· 有新版本等待刷新' : ''}</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary small" id="installFromSettings" type="button">安装 / 添加到主屏幕</button><button class="btn ghost small" id="clearLocal" type="button">清理本机缓存并退出</button><button class="btn ghost small" id="logoutFromSettings" type="button">退出登录</button></div>
      <div class="about-list">
        <div><b>素材与字体</b>：水晶 X 品牌资产由项目提供；Space Grotesk 采用 SIL Open Font License 1.1（见 <code>/assets/fonts/OFL.txt</code>）。界面为 X-connect 自有视觉，不暗示第三方官方背书。</div>
        <div><b>边界</b>：这是 PWA。页面内浮标不是跨 App / 跨窗口系统悬浮；iPhone 不承诺任意跨 App 悬浮。桌面置顶需要单独的原生宿主（仓库内 desktop/ 说明）。</div>
        <div><b>隐私</b>：网关密钥只在 HttpOnly 会话 Cookie 中；退出会清 Cookie、本机缓存和私有 Service Worker 缓存。API、余额、卡片不进入静态缓存。</div>
      </div>
    </div>`;
  }
  bindSettingsAfterRender();
}

function openSettings(tab = 'look') {
  state.settingsTab = tab;
  renderSettings();
  openModal('settings');
}

async function mintIngestToken() {
  try {
    const d = await api('/api/ingest-token', { method: 'POST', body: {} });
    state.ingestToken = d.token;
    toast('接收令牌已生成；只显示这一次，请自己保存');
  } catch (e) {
    toast('令牌生成失败：' + e.message, true);
  }
}

async function testIngest() {
  if (!state.ingestToken) return toast('先生成接收令牌', true);
  const text = window.prompt('测试字幕内容', '这是一段测试字幕：明天下午三点前把报价单整理成一页。');
  if (!text) return;
  try {
    const r = await fetch('/api/inbox', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + state.ingestToken },
      body: JSON.stringify({ text, source: { kind: 'subtitle', app: '测试', batch: new Date().toISOString().slice(0, 16), index: 0 } }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.message || d.error || r.status);
    toast(d.deduped ? '重复批次：已去重，没有新建卡' : '已保存草稿，整理在后台进行');
    await refreshCards();
    setView('cards');
  } catch (e) {
    toast('测试失败：' + e.message, true);
  }
}

async function logoutAndClear() {
  try { await api('/api/logout', { method: 'POST', body: {} }); } catch {}
  clearPrivateLocal();
  if ('caches' in window) {
    try { const keys = await caches.keys(); await Promise.all(keys.map((k) => caches.delete(k))); } catch {}
  }
  state.user = null;
  location.reload();
}

async function promptInstall() {
  if (state.installPrompt) {
    state.installPrompt.prompt();
    const choice = await state.installPrompt.userChoice;
    if (choice.outcome === 'accepted') toast('已请求安装');
    else toast('安装没有完成；仍可正常浏览');
    state.installPrompt = null;
  } else {
    toast('当前浏览器没有提供安装入口；iOS 用分享 → 添加到主屏幕，桌面用地址栏安装图标');
  }
}

async function selectModel(id) {
  const m = state.models.find((x) => x.id === id);
  if (!m) return;
  state.settings.model = id;
  const patch = { model: id };
  if (state.settings.theme === 'default' || state.settings.theme === 'auto') patch.theme = 'auto';
  await saveSettings(patch);
  updateModelChip();
  closeModal('modelSheet');
  renderAll();
  toast('已切换：' + m.full);
}

function updateModelChip() {
  const m = activeModel();
  $('#modelBrand').textContent = modelBrand(m);
  $('#modelVer').textContent = modelVersion(m);
  $('#modelChip').title = m?.full || '未选择模型';
}

function openMiniMap() {
  const grid = $('#miniMapGrid');
  grid.innerHTML = state.cards.map((c) => `<button class="minimap-cell ${statusClass(c.status)}" data-mini-card="${esc(c.id)}" title="${esc(c.title)}"></button>`).join('') || '<span class="mini">还没有卡片</span>';
  openModal('miniMapModal');
}

function runQuick(id) {
  const a = QUICK_ACTIONS[id];
  if (a) a.run();
}

// ---------------------------------------------------------------------------
// Voice

function setupVoiceOrb() {
  const orb = $('#voiceOrb');
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('xcw_voice_pos') || 'null'); } catch {}
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    orb.style.left = saved.x + 'px';
    orb.style.top = saved.y + 'px';
    orb.style.right = 'auto';
    orb.style.bottom = 'auto';
  }
  let drag = null;
  orb.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const r = orb.getBoundingClientRect();
    drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top, moved: false };
    orb.setPointerCapture(e.pointerId);
  });
  orb.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.sx;
    const dy = e.clientY - drag.sy;
    if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
    if (!drag.moved) return;
    const w = orb.offsetWidth;
    const h = orb.offsetHeight;
    const x = Math.max(6, Math.min(window.innerWidth - w - 6, drag.ox + dx));
    const y = Math.max(66, Math.min(window.innerHeight - h - 12, drag.oy + dy));
    orb.style.left = x + 'px';
    orb.style.top = y + 'px';
    orb.style.right = 'auto';
    orb.style.bottom = 'auto';
  });
  const finish = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const moved = drag.moved;
    drag = null;
    try { orb.releasePointerCapture(e.pointerId); } catch {}
    if (moved) {
      const r = orb.getBoundingClientRect();
      const w = orb.offsetWidth;
      const snapLeft = r.left + w / 2 < window.innerWidth / 2;
      const x = snapLeft ? Math.max(8, envSafe('left', 8)) : Math.max(8, window.innerWidth - w - Math.max(8, envSafe('right', 8)));
      const y = Math.max(66, Math.min(window.innerHeight - r.height - 12, r.top));
      orb.style.left = x + 'px';
      orb.style.top = y + 'px';
      try { localStorage.setItem('xcw_voice_pos', JSON.stringify({ x, y })); } catch {}
      positionVoicePanel();
      return;
    }
    toggleVoicePanel();
  };
  orb.addEventListener('pointerup', finish);
  orb.addEventListener('pointercancel', finish);
  orb.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleVoicePanel(); }
  });
  window.addEventListener('resize', positionVoicePanel);
}

function envSafe(side, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--safe-' + side);
  return Number.parseFloat(v) || fallback;
}

function positionVoicePanel() {
  const panel = $('#voicePanel');
  const orb = $('#voiceOrb');
  if (!panel || panel.hidden) return;
  const r = orb.getBoundingClientRect();
  const p = panel.getBoundingClientRect();
  const below = r.top < window.innerHeight / 2;
  const top = below ? r.bottom + 12 : Math.max(66, r.top - p.height - 12);
  let left = r.left + r.width / 2 - p.width / 2;
  left = Math.max(10, Math.min(window.innerWidth - p.width - 10, left));
  panel.style.left = left + 'px';
  panel.style.top = top + 'px';
  panel.style.bottom = 'auto';
}

function toggleVoicePanel(force) {
  const panel = $('#voicePanel');
  const show = force === undefined ? panel.hidden : force;
  panel.hidden = !show;
  if (show) {
    renderVoicePanel();
    positionVoicePanel();
  }
}

function pcm16ToFloat(pcm) {
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / 32768;
  return out;
}

function playPcm(bytes) {
  const v = state.voice;
  if (!v.ctx) return;
  const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
  if (!pcm.length) return;
  const buffer = v.ctx.createBuffer(1, pcm.length, 24000);
  buffer.copyToChannel(pcm16ToFloat(pcm), 0);
  const src = v.ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(v.ctx.destination);
  const at = Math.max(v.ctx.currentTime + 0.02, v.at || 0);
  src.start(at);
  v.at = at + buffer.duration;
}

async function startVoice() {
  const v = state.voice;
  if (v.active) return;
  if (!navigator.mediaDevices?.getUserMedia) return toast('这个浏览器没有麦克风接口', true);
  if (!window.isSecureContext) return toast('语音需要 HTTPS 或 localhost', true);
  const speaker = $('#speakerSelect')?.value || localStorage.getItem('xcw_voice_speaker') || '';
  try {
    const tok = await api('/api/voice-token', { method: 'POST', body: {} });
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}${tok.wsPath}?token=${encodeURIComponent(tok.token)}${speaker ? '&speaker=' + encodeURIComponent(speaker) : ''}`;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    await ctx.resume().catch(() => {});
    const src = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    const mute = ctx.createGain();
    mute.gain.value = 0;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    src.connect(proc);
    proc.connect(mute);
    mute.connect(ctx.destination);
    const ws = new WebSocket(url, 'xc-voice');
    ws.binaryType = 'arraybuffer';
    v.stream = stream; v.ctx = ctx; v.src = src; v.proc = proc; v.analyser = analyser; v.ws = ws; v.active = true; v.paused = false; v.at = 0; v.speaker = speaker;
    const meterBuf = new Uint8Array(analyser.frequencyBinCount);
    proc.onaudioprocess = (e) => {
      if (state.voice.paused || ws.readyState !== 1) return;
      const input = e.inputBuffer.getChannelData(0);
      const ratio = ctx.sampleRate / 16000;
      const out = new Int16Array(Math.floor(input.length / ratio));
      for (let i = 0; i < out.length; i++) {
        const q = i * ratio;
        const j = Math.floor(q);
        const f = q - j;
        const a = input[Math.min(j, input.length - 1)] || 0;
        const b = input[Math.min(j + 1, input.length - 1)] || 0;
        out[i] = Math.max(-1, Math.min(1, a + (b - a) * f)) * 32767;
      }
      ws.send(out.buffer);
      analyser.getByteTimeDomainData(meterBuf);
      let sum = 0;
      for (let i = 0; i < meterBuf.length; i++) { const x = (meterBuf[i] - 128) / 128; sum += x * x; }
      const rms = Math.sqrt(sum / meterBuf.length);
      const width = Math.min(100, Math.round(rms * 340));
      const m = $('#voiceMeter');
      if (m) m.style.width = width + '%';
    };
    ws.onopen = () => {
      renderVoicePanel();
      $('#voiceTranscript').textContent = '正在听。说话结束后，最终文字会追加到目标卡或输入区。';
      toast('语音已连接；收起面板不会挂断');
    };
    ws.onmessage = (e) => {
      if (typeof e.data === 'string') {
        let msg = null;
        try { msg = JSON.parse(e.data); } catch {}
        if (!msg) return;
        if (msg.type === 'asr') {
          $('#voiceState').textContent = msg.final ? '已识别' : '正在听';
          $('#voiceTranscript').textContent = msg.text || '';
          if (msg.final && msg.text) appendVoiceText(msg.text);
        } else if (msg.type === 'task_queued' || msg.type === 'task_updated') {
          refreshTasks().then(() => { renderTasks(); renderSidebar(); });
        } else if (msg.type === 'confirmation_required') {
          toast(msg.message || '需要确认', true);
        } else if (msg.type === 'error') {
          toast(msg.message || msg.code || '语音错误', true);
        }
      } else {
        playPcm(new Uint8Array(e.data));
      }
    };
    ws.onerror = () => toast('语音连接出错；请检查令牌和网络', true);
    ws.onclose = () => {
      if (v.active) {
        stopVoice(false);
        $('#voiceState').textContent = '已断开';
      }
    };
    renderVoicePanel();
  } catch (e) {
    toast('语音启动失败：' + e.message, true);
    stopVoice(false);
  }
}

async function appendVoiceText(text) {
  const card = activeCard();
  if (card) {
    try {
      const d = await api('/api/cards/' + card.id + '/voice', { method: 'POST', body: { text } });
      replaceCard(d.card);
      toast('语音文字已追加到「' + card.title + '」');
    } catch (e) {
      toast('语音文字未保存，已放入输入区', true);
      appendToComposer(text);
    }
  } else {
    appendToComposer(text);
    toast('未选目标卡，语音文字已放入输入区');
  }
}

function appendToComposer(text) {
  toggleComposer(true);
  const input = $('#composerInput');
  input.value = (input.value ? input.value + '\n' : '') + text;
  saveDraft(input.value);
  input.focus();
}

function pauseVoice() {
  const v = state.voice;
  if (!v.active) return;
  v.paused = !v.paused;
  renderVoicePanel();
  $('#voiceState').textContent = v.paused ? '已暂停（麦克风关闭）' : '正在听';
  toast(v.paused ? '已暂停收音；连接仍在' : '继续收音');
}

function stopVoice(show = true) {
  const v = state.voice;
  v.active = false; v.paused = false;
  try { v.ws?.close(); } catch {}
  try { v.proc?.disconnect(); } catch {}
  try { v.src?.disconnect(); } catch {}
  try { v.stream?.getTracks().forEach((t) => t.stop()); } catch {}
  try { v.ctx?.close(); } catch {}
  v.ws = null; v.proc = null; v.src = null; v.stream = null; v.ctx = null; v.analyser = null;
  v.at = 0;
  const meter = $('#voiceMeter'); if (meter) meter.style.width = '0%';
  renderVoicePanel();
  if (show) toast('语音已挂断');
}

// ---------------------------------------------------------------------------
// Service worker / PWA

async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/workbench/' });
    state.swReg = reg;
    if (reg.waiting) showUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate(reg.waiting || worker);
      });
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (state.reloading) return;
      state.reloading = true;
      location.reload();
    });
    // Check for updates when the app returns to the foreground, but never
    // replay the intro or reset drafts on visibility changes.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  } catch (e) {
    // PWA support is optional; the app remains usable without a SW.
    console.warn('SW registration failed', e);
  }
}

function showUpdate(worker) {
  state.updateReady = true;
  setBanner('<svg width="14" height="14"><use href="#i-refresh"></use></svg> 已下载新版本 <button class="btn ghost" id="reloadApp" type="button">刷新</button>', 'warn');
  $('#reloadApp')?.addEventListener('click', () => {
    try { worker?.postMessage({ type: 'SKIP_WAITING' }); } catch {}
    setTimeout(() => location.reload(), 250);
  }, { once: true });
}

// ---------------------------------------------------------------------------
// Event wiring

function bindEvents() {
  $('#loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    doLogin($('#keyInput').value.trim());
  });
  $('#demoLogin').addEventListener('click', () => doLogin('', true));
  $('#installHintBtn').addEventListener('click', () => toast('iOS：分享 → 添加到主屏幕；桌面 Chrome/Edge：地址栏安装图标。'));

  $('#sidebarToggle').addEventListener('click', () => {
    if (resolveLayout() === 'full') {
      const next = !document.body.classList.contains('sidebar-collapsed');
      document.body.classList.toggle('sidebar-collapsed', next);
      saveSettings({ sidebarCollapsed: next }, { quiet: true });
      $('#sidebarToggle').setAttribute('aria-expanded', String(!next));
      return;
    }
    document.body.classList.toggle('sidebar-open');
    $('#scrim').hidden = !document.body.classList.contains('sidebar-open');
    $('#sidebarToggle').setAttribute('aria-expanded', String(document.body.classList.contains('sidebar-open')));
  });
  $('#scrim').addEventListener('click', closeDrawers);
  $('#newChatBtn').addEventListener('click', () => newConversation());
  $('#newChatBtn2').addEventListener('click', () => newConversation());
  $('#chatEmptyNew').addEventListener('click', () => newConversation());
  $('#settingsBtn').addEventListener('click', () => openSettings('look'));
  $('#accountBtn').addEventListener('click', () => openSettings('about'));
  $('#avatarBtn').addEventListener('click', () => openSettings('about'));
  $('#installBtn').addEventListener('click', promptInstall);
  $('#logoutBtn').addEventListener('click', async () => {
    const ok = await askConfirm({ title: '退出登录', text: '退出会清理本机会话、草稿和私有缓存。', ok: '退出' });
    if (ok) await logoutAndClear();
  });

  $$('.nav-item').forEach((b) => b.addEventListener('click', () => { setView(b.dataset.view); closeDrawers(); }));
  $$('.tab[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  $('#linearSyncBtn').addEventListener('click', async () => {
    const btn = $('#linearSyncBtn');
    btn.disabled = true;
    try {
      await api('/api/linear/sync', { method: 'POST', body: {} });
      await loadLinear();
      toast('已写入本地 linear_issues');
    } catch (err) {
      toast(err.message || '同步失败');
    } finally {
      btn.disabled = false;
    }
  });
  $('#searchInput').addEventListener('input', (e) => { state.search = e.target.value; renderCards(); });

  $('#cardsGrid').addEventListener('click', (e) => {
    const el = e.target.closest('[data-card]');
    if (!el) return;
    openCard(el.dataset.card);
  });
  $('#cardsGrid').addEventListener('keydown', (e) => {
    const el = e.target.closest('[data-card]');
    if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openCard(el.dataset.card); }
  });
  $('#worksGrid').addEventListener('click', (e) => {
    const el = e.target.closest('[data-card]');
    if (el) openCard(el.dataset.card);
  });
  $('#taskList').addEventListener('click', (e) => {
    const el = e.target.closest('[data-task-card]');
    if (el?.dataset.taskCard) openCard(el.dataset.taskCard);
  });
  $('#inspBody').addEventListener('click', (e) => {
    const tab = e.target.closest('[data-insp-tab]');
    if (tab) { state.inspTab = tab.dataset.inspTab; renderInspector(); return; }
    const act = e.target.closest('[data-card-action]');
    if (act) { runCardAction(act.dataset.cardAction); return; }
    const mini = e.target.closest('[data-mini-card]');
    if (mini) { openCard(mini.dataset.miniCard); closeModal('miniMapModal'); }
  });
  $('#inspClose').addEventListener('click', closeInspector);

  $('#composerPill').addEventListener('click', () => toggleComposer(true));
  $('#composerClose').addEventListener('click', () => toggleComposer(false));
  $('#composerInput').addEventListener('input', (e) => saveDraft(e.target.value));
  $('#composerInput').addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); sendChat(); }
  });
  $('#sendBtn').addEventListener('click', sendChat);
  $('#fileInput').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^(text\/|application\/json)/.test(file.type) && !/\.(txt|md|markdown|json|csv)$/i.test(file.name)) {
      toast('预览版只读取文本附件；图片没有上传', true);
      e.target.value = '';
      return;
    }
    if (file.size > 200_000) { toast('文本附件太大（上限 200KB）', true); e.target.value = ''; return; }
    const text = await file.text();
    const input = $('#composerInput');
    input.value += (input.value ? '\n\n' : '') + `--- ${file.name} ---\n` + text;
    saveDraft(input.value);
    toggleComposer(true);
    e.target.value = '';
    toast('已读取文本附件');
  });
  $('#quickbar').addEventListener('click', (e) => {
    const q = e.target.closest('[data-quick]');
    if (q) runQuick(q.dataset.quick);
  });
  $('#newCardBtn').addEventListener('click', () => openCardModal());
  $('#miniMapBtn').addEventListener('click', openMiniMap);
  $('#miniMapGrid').addEventListener('click', (e) => {
    const el = e.target.closest('[data-mini-card]');
    if (el) { openCard(el.dataset.miniCard); closeModal('miniMapModal'); }
  });

  $('#voiceOrb').addEventListener('click', () => {}); // handled by pointerup
  $('#voiceClose').addEventListener('click', () => toggleVoicePanel(false));
  $('#voiceStart').addEventListener('click', startVoice);
  $('#voicePause').addEventListener('click', pauseVoice);
  $('#voiceStop').addEventListener('click', () => stopVoice(true));
  $('#speakerSelect').addEventListener('change', (e) => {
    localStorage.setItem('xcw_voice_speaker', e.target.value);
    if (state.voice.active) {
      stopVoice(false);
      setTimeout(startVoice, 250);
    }
  });

  $('#modelChip').addEventListener('click', () => {
    renderTierTabs();
    renderModelList('');
    $('#modelSearch').value = '';
    openModal('modelSheet');
  });
  $('#modelSearch').addEventListener('input', (e) => renderModelList(e.target.value));
  $('#modelList').addEventListener('click', (e) => {
    const el = e.target.closest('[data-model]');
    if (el) selectModel(el.dataset.model);
  });
  $('#modelTierTabs').addEventListener('click', (e) => {
    const el = e.target.closest('[data-tier]');
    if (el) switchTier(el.dataset.tier);
  });
  $('#loginTierTabs').addEventListener('click', (e) => {
    const el = e.target.closest('[data-login-tier]');
    if (!el) return;
    const access = $('#tierAccess')?.value.trim() || '';
    doLogin('', false, el.dataset.loginTier, access);
  });

  $('#tempBtn').addEventListener('click', toggleTemp);
  $('#chatRenameBtn').addEventListener('click', () => {
    const conv = activeConversation();
    if (!conv) return toast('先选一个会话', true);
    if (state.temp) {
      const t = window.prompt('临时会话名称', conv.title || '临时会话');
      if (t) { conv.title = t.trim().slice(0, 120); renderChat(); renderSidebar(); }
    } else renameConversation(conv.id);
  });
  $('#chatSystemBtn').addEventListener('click', () => openSettings('system'));
  $('#chatCardBtn').addEventListener('click', cardFromLastAssistant);
  $('#chatMessages').addEventListener('click', async (e) => {
    const cardBtn = e.target.closest('[data-msg-card]');
    if (cardBtn) {
      const conv = activeConversation();
      const m = conv?.messages?.[Number(cardBtn.dataset.msgCard)];
      if (m) openCardModal(m.content, (m.content.split('\n')[0] || '').slice(0, 60));
      return;
    }
    const copyBtn = e.target.closest('[data-copy-msg]');
    if (copyBtn) {
      const conv = activeConversation();
      const m = conv?.messages?.[Number(copyBtn.dataset.copyMsg)];
      if (m) await copyText(m.content);
    }
  });

  $('#sidebar').addEventListener('click', (e) => {
    const open = e.target.closest('[data-conv-open]');
    if (open) return selectConversation(open.dataset.convOpen);
    const menu = e.target.closest('[data-conv-menu]');
    if (menu) { e.stopPropagation(); return openConvMenu(menu.dataset.convMenu, menu); }
    const project = e.target.closest('[data-project]');
    if (project) {
      state.filterProject = project.dataset.project;
      setView('cards');
      renderAll();
      closeDrawers();
    }
  });

  $$('#settingsTabs .tab').forEach((b) => b.addEventListener('click', () => { state.settingsTab = b.dataset.stab; renderSettings(); }));
  $$('[data-close]').forEach((b) => b.addEventListener('click', () => closeModal(b.dataset.close)));
  $$('.modal').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m) m.hidden = true; }));
  $('#cardCreateBtn').addEventListener('click', createCard);
  $('#confirmOk').addEventListener('click', () => resolveConfirm(true));
  $('#confirmCancel').addEventListener('click', () => resolveConfirm(false));
  $('#confirmModal').addEventListener('click', (e) => { if (e.target === e.currentTarget) resolveConfirm(false); });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!document.getElementById('confirmModal').hidden) return resolveConfirm(false);
      closeAllModals();
      closeDrawers();
      closeConvMenu();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      $('#searchInput').focus();
    }
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-newcard]')) openCardModal();
    if (e.target.closest('[data-open-subtitle]')) openSettings('subtitle');
  });
  window.addEventListener('resize', () => { applyLayout(); positionVoicePanel(); });
  window.addEventListener('online', () => {
    state.online = true;
    $('#netDot').classList.remove('off');
    setBanner('');
    toast('已恢复在线');
  });
  window.addEventListener('offline', () => {
    state.online = false;
    $('#netDot').classList.add('off');
    setBanner('<svg width="14" height="14"><use href="#i-alert"></use></svg> 离线：草稿保存在本机，未发送内容不会冒充已提交。', 'off');
    toast('已离线；草稿仍在本机', true);
  });
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.installPrompt = e;
    $('#installBtn').hidden = false;
  });
  window.addEventListener('appinstalled', () => { toast('已安装到主屏幕'); state.installPrompt = null; });
  window.addEventListener('beforeunload', () => { try { stopVoice(false); } catch {} });
  setupVoiceOrb();
}

function openCard(id) {
  state.activeCardId = id;
  state.inspTab = state.inspTab || 'content';
  renderAll();
  openInspector();
  closeDrawers();
  if (state.view !== 'cards') setView('cards');
}

function closeDrawers() {
  document.body.classList.remove('sidebar-open');
  const scrim = $('#scrim');
  if (scrim) scrim.hidden = true;
}

// Start
boot();
