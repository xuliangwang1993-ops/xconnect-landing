// lounge.js — 小助手前台休息室
// 登录后、进入工厂前的一层：Material 观感的目录 + 全实时动画。
// 动画由 canvas + FLIP 负责，未依赖外部运行时；留了 Rive 挂载点（#loungeRive）。

import {
  t, personaName, personaDesc, personaIntro,
  buildPicker, detect, setLang, onLangChange, getLang,
} from './lounge-i18n.js';

const LS_KEY = 'xcw_assistant';
const ASSET = (typeof window !== 'undefined' && window.__XC_ASSET_BASE) || '';

const FALLBACK = [
  { id: 'voice', avatar: 'duck', intro: '我是李黑鸭。少废话，说事。', name: '李黑鸭', nameEn: 'Duck Lee', role: '通用助手', model: 'doubao-tts', voice: 'zh_female_vv_jupiter_bigtts', desc: '嘴上不饶人，活儿一件不落。' },
  { id: 'scribe', avatar: 'sparky', intro: '我是斯巴达。阵型我来摆，你只管往前。', name: '斯巴达', nameEn: 'Sparky', role: '通用助手', model: 'whisper', voice: '', desc: '三千勇士的口气，一个人也敢冲。' },
  { id: 'brain', avatar: 'rapper', intro: '我是四毛。四毛钱的活儿，给你办成四块。', name: '四毛', nameEn: 'Forty Cents', role: '通用助手', model: 'deepseek-v4.1-flash', voice: '', desc: '押韵不押韵另说，节奏先跟上。' },
  { id: 'deep', avatar: 'wutian', intro: '我是武天。想清楚再说，说了就做。', name: '武天', nameEn: 'WuTian', role: '通用助手', model: 'kimi-k3', voice: '', desc: '慢热，但一旦开口就是结论。' },
  { id: 'admin', avatar: 'feifei', intro: '我是狒狒。先干起来，边干边修。', name: '狒狒', nameEn: 'Feifei', role: '通用助手', model: 'qwen3.8-flash', voice: '', desc: '灵光多，手脚快，偶尔跑偏。' },
];

const HUES = { voice: 22, scribe: 190, brain: 264, deep: 320, admin: 148 };

let root = null;
let personas = [];
let current = null;
let raf = 0;
let particles = [];
let canvas, ctx, dpr = 1;
let resolvePick = null;
let phase = 'list'; // list | detail | waking
let customSlots = []; // 「我的小助手」：/api/custom-assistants（与 Settings 同一份存储）
const BUILD_URL = (typeof window !== 'undefined' && window.__XC_BUILD_URL) || 'https://xconnect-factory.onrender.com/settings#build';

const reduceMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}

function hueOf(id) {
  return HUES[id] ?? 264;
}

function glow(id, alpha = 0.55) {
  const h = hueOf(id);
  return `radial-gradient(circle at 30% 30%, hsl(${h} 92% 62% / ${alpha}), hsl(${h + 28} 80% 40% / ${alpha * 0.55}) 45%, transparent 70%)`;
}

function orb(id, size = 44) {
  const o = el('div', 'lounge-orb');
  o.dataset.id = id;
  o.style.width = o.style.height = size + 'px';
  o.style.setProperty('--h', hueOf(id));
  o.innerHTML = `<u></u><i></i><b></b>`;
  return o;
}

/* ---------------- canvas 背景 ---------------- */

function sizeCanvas() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(innerWidth * dpr);
  canvas.height = Math.floor(innerHeight * dpr);
  canvas.style.width = innerWidth + 'px';
  canvas.style.height = innerHeight + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const n = Math.min(70, Math.round((innerWidth * innerHeight) / 26000));
  particles = Array.from({ length: n }, () => ({
    x: Math.random() * innerWidth,
    y: Math.random() * innerHeight,
    r: 0.6 + Math.random() * 1.8,
    vx: (Math.random() - 0.5) * 0.16,
    vy: -0.05 - Math.random() * 0.22,
    a: 0.15 + Math.random() * 0.5,
  }));
}

function draw(t) {
  const w = innerWidth;
  const h = innerHeight;
  ctx.clearRect(0, 0, w, h);

  // 三个缓慢漂移的光斑
  const blobs = [
    { x: 0.22 + Math.sin(t / 9000) * 0.05, y: 0.3 + Math.cos(t / 11000) * 0.06, r: 0.55, hue: current ? hueOf(current) : 264 },
    { x: 0.8 + Math.cos(t / 13000) * 0.04, y: 0.7 + Math.sin(t / 9000) * 0.05, r: 0.5, hue: current ? hueOf(current) + 40 : 320 },
    { x: 0.55, y: 0.15 + Math.sin(t / 15000) * 0.04, r: 0.6, hue: current ? hueOf(current) + 80 : 190 },
  ];
  for (const b of blobs) {
    const g = ctx.createRadialGradient(b.x * w, b.y * h, 0, b.x * w, b.y * h, b.r * Math.max(w, h));
    g.addColorStop(0, `hsl(${b.hue} 90% 60% / 0.16)`);
    g.addColorStop(0.5, `hsl(${b.hue + 20} 85% 45% / 0.06)`);
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    if (p.y < -20) { p.y = h + 20; p.x = Math.random() * w; }
    if (p.x < -20) p.x = w + 20;
    if (p.x > w + 20) p.x = -20;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${current ? hueOf(current) + 30 : 210} 90% 75% / ${p.a * 0.55})`;
    ctx.fill();
  }

  raf = requestAnimationFrame(draw);
}

/* ---------------- DOM ---------------- */

function build() {
  root = el('section', 'lounge');
  root.id = 'lounge';
  root.hidden = true;
  root.innerHTML = `
    <canvas class="lounge-fx" aria-hidden="true"></canvas>
    <div class="lounge-grain" aria-hidden="true"></div>
    <header class="lounge-bar">
      <div class="lounge-brand">
        <span class="lounge-dot"></span>
        <span class="lounge-brand-text"></span>
      </div>
      <div class="lounge-bar-right">
        <button class="lounge-skip" type="button"></button>
      </div>
    </header>
    <main class="lounge-body">
      <div class="lounge-copy">
        <p class="lounge-kicker"></p>
        <h1></h1>
        <p class="lounge-sub"></p>
      </div>
      <ul class="lounge-list" role="listbox"></ul>
    </main>
    <div class="lounge-detail" hidden></div>
    <div class="lounge-flash" aria-hidden="true"></div>
  `;
  document.body.appendChild(root);

  canvas = root.querySelector('.lounge-fx');
  ctx = canvas.getContext('2d');

  // 先把语言定下来，buildPicker 才会按当前语言选中对应 option。
  // 顺序反过来的话，下拉永远停在第一项 English，和页面实际文案对不上。
  setLang(detect());

  // 语言下拉挂在「跳过」左边，和门户右上角那颗同款胶囊
  buildPicker(root.querySelector('.lounge-bar-right'), () => {
    applyLang();
  });

  root.querySelector('.lounge-skip').addEventListener('click', () => {
    if (phase !== 'list') return;
    finish('brain', true);
  });

  applyLang();
  // 用户在别处（另一个标签页 / 主页）切了语言，这里跟着变
  onLangChange(() => {
    if (phase === 'list') renderList();
  });

  addEventListener('resize', () => { sizeCanvas(); }, { passive: true });
}

/** 把静态骨架上的文案刷成当前语言；详情页开着就重绘详情。 */
function applyLang() {
  const bar = root.querySelector('.lounge-brand-text');
  if (bar) bar.textContent = t('brand');
  const skip = root.querySelector('.lounge-skip');
  if (skip) skip.textContent = t('skip');
  const kicker = root.querySelector('.lounge-kicker');
  if (kicker) kicker.textContent = t('kicker');
  const h1 = root.querySelector('.lounge-copy h1');
  if (h1) h1.textContent = t('title');
  const sub = root.querySelector('.lounge-sub');
  if (sub) sub.textContent = t('sub');
  const ul = root.querySelector('.lounge-list');
  if (ul) ul.setAttribute('aria-label', t('listLabel'));

  if (phase === 'detail' && current) {
    const keepId = current.id;
    const box = root.querySelector('.lounge-detail');
    if (box) box.innerHTML = '';
    current = null;
    openDetail(keepId);
    return;
  }
  renderList();
}

function renderList() {
  const ul = root.querySelector('.lounge-list');
  ul.innerHTML = '';
  personas.forEach((p, i) => {
    const li = el('li', 'lounge-row');
    li.dataset.id = p.id;
    li.style.setProperty('--h', hueOf(p.id));
    li.innerHTML = `
      <span class="lounge-row-orb"></span>
      <span class="lounge-row-main">
        <span class="lounge-row-name">${personaName(p)}<em>${p.nameEn && getLang() !== 'en' ? p.name : p.nameEn || t('role')}</em></span>
        <span class="lounge-row-desc">${personaDesc(p)}</span>
      </span>
      <span class="lounge-row-meta">${p.model}</span>
      <svg class="lounge-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
    `;
    const slot = li.querySelector('.lounge-row-orb');
    if (p.avatar) {
      const img = document.createElement('img');
      img.className = 'lounge-face';
      img.src = `${ASSET}/characters/${p.avatar}/thumb.webp`;
      img.alt = personaName(p);
      img.loading = 'lazy';
      slot.appendChild(img);
    } else {
      slot.appendChild(orb(p.id, 40));
    }
    li.addEventListener('pointermove', (e) => {
      if (reduceMotion()) return;
      const r = li.getBoundingClientRect();
      const dx = (e.clientX - r.left) / r.width - 0.5;
      const dy = (e.clientY - r.top) / r.height - 0.5;
      li.style.transform = `perspective(900px) rotateY(${dx * 6}deg) rotateX(${-dy * 5}deg) translateZ(6px)`;
      li.style.setProperty('--mx', `${(dx + 0.5) * 100}%`);
      li.style.setProperty('--my', `${(dy + 0.5) * 100}%`);
    });
    li.addEventListener('pointerleave', () => { li.style.transform = ''; });
    li.addEventListener('click', () => openDetail(p.id));
    ul.appendChild(li);
  });
  renderMine(ul);
}

function renderMine(ul) {
  const zh = /^zh/.test(getLang());
  const head = el('li', 'lounge-mine-head', zh ? '我的小助手' : 'My assistants');
  head.style.cssText = 'list-style:none;margin:18px 4px 6px;font-size:12px;opacity:.7;letter-spacing:.08em';
  ul.appendChild(head);
  for (let i = 0; i < 3; i++) {
    const s = customSlots[i];
    if (s && s.name) continue; // 已填的槽位在 personas 里按内置助手同样渲染
    const li = el('li', 'lounge-row lounge-row-empty');
    li.style.cssText = 'opacity:.75;border-style:dashed';
    li.innerHTML = `<a href="${BUILD_URL}" target="_blank" rel="noopener" style="display:flex;width:100%;align-items:center;gap:12px;color:inherit;text-decoration:none">
      <span class="lounge-row-orb" style="display:grid;place-items:center;font-size:22px">+</span>
      <span class="lounge-row-main"><span class="lounge-row-name">${zh ? '制作你的小助手' : 'Build your own assistant'}</span><span class="lounge-row-desc">${zh ? `槽位 ${i + 1} · 去设置导入素材` : `Slot ${i + 1} · import materials in Setting`}</span></span></a>`;
    ul.appendChild(li);
  }
}

async function loadCustom() {
  try {
    const r = await fetch('/api/custom-assistants', { credentials: 'same-origin' });
    if (!r.ok) return;
    customSlots = (await r.json()).slots || [];
  } catch { customSlots = []; }
}

const clean = (v) => String(v || '').replace(/[<>&"]/g, '');
function withCustom(list) {
  const mine = customSlots.filter((s) => s && s.name).map((s) => ({
    id: s.id, avatar: '', name: clean(s.name), nameEn: '', role: '我的小助手', model: 'custom', voice: s.voice || '', intro: clean(s.intro), desc: clean(s.intro) || '我的小助手',
  }));
  return list.filter((p) => !/^custom/.test(p.id)).concat(mine);
}

function openDetail(id) {
  const p = personas.find((x) => x.id === id);
  if (!p) return;
  current = p;
  phase = 'detail';
  const row = root.querySelector(`.lounge-row[data-id="${id}"]`);
  const from = row ? row.getBoundingClientRect() : null;

  const box = root.querySelector('.lounge-detail');
  box.hidden = false;
  box.innerHTML = `
    <div class="lounge-sheet" style="--h:${hueOf(p.id)}">
      <button class="lounge-back" type="button" aria-label="${t('back')}">←</button>
      <div class="lounge-sheet-orb"></div>
      <p class="lounge-kicker">${t('role')}</p>
      <h2>${personaName(p)}</h2>
      <p class="lounge-sheet-desc">${personaDesc(p)}</p>
      <p class="lounge-intro"><b>${t('introLabel')}</b><span class="lounge-intro-text"></span></p>
      <div class="lounge-opts">
        <button class="lounge-opt" type="button" data-act="chat">
          <span class="lounge-opt-icon">💬</span>
          <b>${t('optChatTitle')}</b>
          <small>${t('optChatSub')}</small>
        </button>
        <button class="lounge-opt" type="button" data-act="features">
          <span class="lounge-opt-icon">🛠️</span>
          <b>${t('optFeaturesTitle')}</b>
          <small>${t('optFeaturesSub')}</small>
        </button>
        <button class="lounge-opt" type="button" data-act="capability">
          <span class="lounge-opt-icon">⚡</span>
          <b>${t('optCapabilityTitle')}</b>
          <small>${t('optCapabilitySub')}</small>
        </button>
      </div>
      <div class="lounge-opt-panel" hidden></div>
      <button class="lounge-wake" type="button">${t('wake')} ${personaName(p)}<span></span></button>
    </div>`;
  const holder = box.querySelector('.lounge-sheet-orb');
  let face = null;
  if (p.avatar) {
    face = document.createElement('img');
    face.className = 'lounge-face-lg';
    face.alt = personaName(p);
    face.src = `${ASSET}/characters/${p.avatar}/still.webp`;
    holder.appendChild(face);
    // 静帧先顶上，动图就位后换
    const idle = new Image();
    idle.src = `${ASSET}/characters/${p.avatar}/idle.webp`;
    idle.onload = () => { face.src = idle.src; };
  } else {
    holder.appendChild(orb(p.id, 108));
  }
  typeIntro(box.querySelector('.lounge-intro-text'), personaIntro(p), () => {
    if (face && p.avatar) face.src = `${ASSET}/characters/${p.avatar}/idle.webp`;
  }, () => {
    if (face && p.avatar) face.src = `${ASSET}/characters/${p.avatar}/talk.webp`;
  });
  box.querySelector('.lounge-back').addEventListener('click', closeDetail);
  box.querySelector('.lounge-wake').addEventListener('click', () => finish(p.id));
  bindOpts(box, p);
}

/* ---------------- 详情页三选项 ---------------- */

function optPanels() {
  return {
    features: `
    <ul>
      <li><b>${t('featTextTitle')}</b><span>${t('featTextBody')}</span></li>
      <li><b>${t('featFilesTitle')}</b><span>${t('featFilesBody')}</span></li>
      <li><b>${t('featCodeTitle')}</b><span>${t('featCodeBody')}</span></li>
    </ul>`,
    capability: `
    <ul>
      <li><b>${t('capMemoryTitle')}</b><span>${t('capMemoryBody', { n: '<em class="lounge-mem">…</em>' })}</span></li>
      <li><b>${t('capLiveTitle')}</b><span>${t('capLiveBody')}</span></li>
      <li><b>${t('capCpuTitle')}</b><span>${t('capCpuBody')}</span></li>
      <li><b>${t('capGpuTitle')}</b><span>${t('capGpuBody')}</span></li>
    </ul>`,
  };
}

function bindOpts(box, p) {
  const panel = box.querySelector('.lounge-opt-panel');
  box.querySelectorAll('.lounge-opt').forEach((btn) => {
    btn.addEventListener('click', () => {
      const act = btn.dataset.act;
      if (act === 'chat') {
        // 专属角色页：就地开实时语音，不要 finish() 跳到 www/spark
        rememberAssistant(p.id);
        writeCookieAssistant(p.id);
        fetch('/api/settings', {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ assistantId: p.id }),
        }).catch(() => {});
        panel.dataset.act = 'chat';
        panel.innerHTML = `<p class="lounge-voice-hint">${t('capLiveBody')}</p>`;
        panel.hidden = false;
        box.querySelectorAll('.lounge-opt').forEach((b) => b.classList.toggle('on', b === btn));
        // 标记就地语音：app.js 的 boot/returnToApp 见到它就不跳 spark
        try { window.__xcInPlaceVoice = p.id; } catch {}
        window.dispatchEvent(new CustomEvent('xc:lounge-start-voice', { detail: { assistantId: p.id } }));
        return;
      }
      if (!panel.hidden && panel.dataset.act === act) {
        panel.hidden = true;
        btn.classList.remove('on');
        return;
      }
      panel.dataset.act = act;
      panel.innerHTML = optPanels()[act];
      panel.hidden = false;
      box.querySelectorAll('.lounge-opt').forEach((b) => b.classList.toggle('on', b === btn));
      if (act === 'capability') loadMemoryCount(p.id);
    });
  });
}


function typeIntro(node, text, onDone, onSpeak) {
  if (!node) return;
  if (reduceMotion()) { node.textContent = text; if (onDone) onDone(); return; }
  let i = 0;
  node.textContent = '';
  const tick = () => {
    if (!node.isConnected) return;
    node.textContent = text.slice(0, ++i);
    if (i === 1 && onSpeak) onSpeak();
    if (i < text.length) setTimeout(tick, 42);
    else if (onDone) setTimeout(onDone, 320);
  };
  setTimeout(tick, 260);
}

async function loadMemoryCount(id) {
  const elMem = root.querySelector('.lounge-mem');
  const paint = (n) => { if (elMem) elMem.textContent = String(n); };
  try {
    const r = await fetch(`/api/memories?assistantId=${encodeURIComponent(id)}&limit=1`, { credentials: 'same-origin' });
    if (!r.ok) throw new Error('n/a');
    const d = await r.json();
    paint(d.total ?? 0);
  } catch {
    paint(0);
  }
}

function closeDetail() {
  const box = root.querySelector('.lounge-detail');
  if (!box || box.hidden) return;
  box.hidden = true;
  box.innerHTML = '';
  current = null;
  phase = 'list';
}

/* ---------------- 出场 ---------------- */

function finish(id, skipped = false) {
  // 显式「唤醒/跳过」才离开：清掉就地语音标记
  try { window.__xcInPlaceVoice = null; } catch {}
  const p = personas.find((x) => x.id === id) || personas[0];
  phase = 'waking';
  const flash = root.querySelector('.lounge-flash');
  const orbEl = root.querySelector('.lounge-detail .lounge-orb') || root.querySelector(`.lounge-row[data-id="${p.id}"] .lounge-orb`);
  if (orbEl && !reduceMotion()) {
    const r = orbEl.getBoundingClientRect();
    const o = orbEl.cloneNode(true);
    o.className = 'lounge-orb lounge-orb-fly';
    o.style.cssText += `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;z-index:60`;
    document.body.appendChild(o);
    const cx = innerWidth / 2 - r.width / 2;
    const cy = innerHeight / 2 - r.height / 2;
    const scale = Math.max(innerWidth, innerHeight) / Math.max(r.width, 1) * 1.2;
    o.animate(
      [
        { transform: 'none', opacity: 1 },
        { transform: `translate(${cx - r.left}px, ${cy - r.top}px) scale(${scale})`, opacity: 0.9 },
      ],
      { duration: 520, easing: 'cubic-bezier(.5,0,.2,1)', fill: 'forwards' }
    ).onfinish = () => o.remove();
  }
  flash.classList.add('on');
  try {
    localStorage.setItem(LS_KEY, p.id);
    localStorage.setItem(LS_KEY + '_at', String(Date.now()));
  } catch {}
  // 同步到 .x-connect.ai 域 cookie，让门户 / app / 工厂立刻看到同一个助理
  writeCookieAssistant(skipped ? 'brain' : p.id);
  fetch('/api/settings', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ assistantId: skipped ? 'brain' : p.id }),
  }).catch(() => {});

  const done = () => {
    root.hidden = true;
    flash.classList.remove('on');
    cancelAnimationFrame(raf);
    phase = 'list';
    if (resolvePick) { const r = resolvePick; resolvePick = null; r(skipped ? 'brain' : p.id); }
  };
  setTimeout(done, reduceMotion() ? 60 : 560);
}

/* ---------------- 对外 ---------------- */

export function pickedAssistant() {
  try { return localStorage.getItem(LS_KEY) || cookieAssistant() || ''; } catch { return cookieAssistant(); }
}

/* 域 cookie：门户 www.x-connect.ai/select 选完会写 xc_assistant（Domain=.x-connect.ai），
   工作台、app、工厂都读得到。这是「三处同一个助理」的即时通道；
   跨设备持久化仍然靠服务端 settings.assistantId。 */
const ASSISTANT_COOKIE = 'xc_assistant';
function cookieDomain() {
  const h = location.hostname;
  return (h === 'x-connect.ai' || /\.x-connect\.ai$/.test(h)) ? '; Domain=.x-connect.ai' : '';
}
export function cookieAssistant() {
  try {
    const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + ASSISTANT_COOKIE + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  } catch { return ''; }
}
function writeCookieAssistant(id) {
  try {
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = ASSISTANT_COOKIE + '=' + encodeURIComponent(String(id)) +
      '; Path=/' + cookieDomain() + '; Max-Age=' + (60 * 60 * 24 * 365) +
      '; SameSite=Lax' + secure;
  } catch {}
}

/* 账号级助理绑定：服务端 settings.assistantId 才是真相，localStorage 只是本地缓存。
   跨域（app / 工厂）跨设备靠这条，不靠 localStorage。 */
export function rememberAssistant(id) {
  if (!id) return;
  try { localStorage.setItem(LS_KEY, String(id)); } catch {}
  writeCookieAssistant(id);
}

/* 供漫游角色取形象与名字，避免各处重复查表 */
function pool() { return personas.length ? personas : FALLBACK; }
export function avatarFor(id) {
  const p = pool().find((x) => x.id === id);
  return (p && p.avatar) || '';
}
export function nameFor(id) {
  const p = pool().find((x) => x.id === id);
  return (p && p.name) || '';
}

export async function openLounge() {
  if (!root) build();
  root.hidden = false;
  document.body.classList.add('lounge-open');
  phase = 'list';
  if (!reduceMotion()) { sizeCanvas(); cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); }
  // 先本地渲染，接口回来再替换：任何情况下首屏都有东西
  personas = FALLBACK;
  renderList();
  loadCustom().then(() => { personas = withCustom(personas); if (phase === 'list') renderList(); });
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch('/api/personas', { credentials: 'same-origin', signal: ctrl.signal });
    clearTimeout(timer);
    const d = await r.json();
    const list = (d.personas || []).map((p) => ({
      ...p,
      desc: p.description || FALLBACK.find((f) => f.id === p.id)?.desc || '',
    }));
    if (list.length) { personas = withCustom(list); renderList(); }
  } catch { /* 离线就用本地那份 */ }
  return new Promise((res) => { resolvePick = res; });
}

export function closeLounge() {
  if (root) root.hidden = true;
  document.body.classList.remove('lounge-open');
  cancelAnimationFrame(raf);
}
