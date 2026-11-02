// X-connect onboarding tour: knowledge-base driven (xc-tour-kb.json), spotlight + tooltip
// anchored to real selectors, Next/Back/Skip, progress, resumable state in localStorage.
// The picked assistant introduces itself in its own tone. Public API: window.XC_TOUR.
(function () {
  if (window.XC_TOUR) return;
  const KB_URL = '/xc-tour-kb.json';
  const STORE = 'xc_tour_v1';
  const lang = () => { try { return /^en/.test(localStorage.getItem('xc_lang_v1') || '') ? 'en' : 'zh'; } catch { return 'zh'; } };
  const L = (o) => (o && typeof o === 'object' ? (o[lang()] ?? o.zh ?? '') : (o || ''));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const UI = { zh: { next: '下一步', back: '上一步', skip: '跳过', done: '完成', start: '带我入门', demo: '演示', soon: '（即将上线）', desk: '秘书台', tabs: ['整理', '报告', '提醒', '任务'], close: '关闭', go: '出发' },
               en: { next: 'Next', back: 'Back', skip: 'Skip', done: 'Done', start: 'Show me around', demo: 'Demo', soon: ' (coming soon)', desk: 'Secretary desk', tabs: ['Organize', 'Reports', 'Reminders', 'Tasks'], close: 'Close', go: 'Go' } };
  const U = (k) => UI[lang()][k];
  const load = () => { try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; } };
  const save = (s) => { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch {} };
  let KB = null, cur = null, layer = null;
  const site = () => (document.getElementById('shell') || document.getElementById('composer') ? 'workbench' : 'factory');
  function persona() {
    let id = ''; try { id = localStorage.getItem('xcw_assistant') || ''; } catch {}
    if (!id) { const m = document.cookie.match(/(?:^|;\s*)xc_assistant=([^;]*)/); id = m ? decodeURIComponent(m[1]) : ''; }
    const P = KB.personas; const k = P[id] ? id : 'brain';
    return { id: k, ...P[k], nameText: L(P[k].name) };
  }
  const capStatus = (cap) => (cap && KB.capabilities[cap] ? KB.capabilities[cap].status : 'real');
  // Self-intro: persona opener + data-driven beats; 'soon' beats get a coming-soon suffix.
  function introText() {
    const p = persona();
    const beats = KB.intro.beats.map((b) => L(b) + (capStatus(b.cap) === 'soon' ? U('soon') : '')).join(lang() === 'en' ? ' ' : '');
    return L(p.opener) + (lang() === 'en' ? ' ' : '') + beats;
  }
  const fill = (s) => String(s).replace(/\{name\}/g, persona().nameText);
  function css() {
    if (document.getElementById('xct-css')) return;
    const st = document.createElement('style'); st.id = 'xct-css';
    st.textContent = `#xct-layer{position:fixed;inset:0;z-index:2147483200;pointer-events:none}
#xct-spot{position:fixed;border-radius:10px;box-shadow:0 0 0 9999px rgba(4,6,10,.62),0 0 0 2px var(--accent,#f0b35a);transition:all .25s ease;pointer-events:none}
#xct-card{position:fixed;width:min(340px,calc(100vw - 24px));background:#12151c;color:#ececef;border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:14px;box-shadow:0 20px 50px rgba(0,0,0,.5);font:14px/1.6 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;pointer-events:auto;transition:top .25s,left .25s}
#xct-card .h{display:flex;gap:10px;align-items:center;margin-bottom:6px}#xct-card .h img{width:38px;height:38px;border-radius:50%;object-fit:cover;background:#222}
#xct-card .h b{font-size:15px}#xct-card .who{font-size:11px;color:#9aa0aa}#xct-card p{margin:0 0 10px;color:#d6d8dd}
#xct-card .f{display:flex;align-items:center;gap:6px}#xct-card .pg{flex:1;font-size:11px;color:#9aa0aa}#xct-card .bar{height:3px;background:rgba(255,255,255,.08);border-radius:3px;margin:0 0 10px;overflow:hidden}#xct-card .bar i{display:block;height:100%;background:var(--accent,#f0b35a)}
#xct-card button,.xct-btn{border:1px solid rgba(255,255,255,.16);background:transparent;color:inherit;border-radius:8px;padding:4px 10px;font:inherit;font-size:12.5px;cursor:pointer}
#xct-card button.pri,.xct-btn.pri{background:var(--accent,#f0b35a);color:#16181d;border-color:transparent;font-weight:600}
#xct-desk{position:fixed;right:20px;top:70px;z-index:2147483100;width:min(380px,calc(100vw - 24px));max-height:calc(100dvh - 100px);overflow:auto;background:#12151c;color:#ececef;border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:14px;font:13.5px/1.6 -apple-system,"PingFang SC",sans-serif;box-shadow:0 20px 50px rgba(0,0,0,.5)}
#xct-desk .tb{display:flex;gap:6px;margin:8px 0}#xct-desk .tb button.on{background:var(--accent,#f0b35a);color:#16181d}
#xct-desk .it{padding:8px 10px;border:1px solid rgba(255,255,255,.08);border-radius:10px;margin-bottom:6px}#xct-desk .k{font-size:11px;color:#9aa0aa}
.xct-demo{display:inline-block;font-size:10px;letter-spacing:.04em;color:#9aa0aa;border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:0 6px;margin-left:6px;vertical-align:2px}
#xct-launch{position:fixed;left:16px;bottom:16px;z-index:2147483000;border-radius:999px;padding:7px 12px;background:#12151c;color:#ececef;border:1px solid rgba(255,255,255,.16);font:13px -apple-system,"PingFang SC",sans-serif;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.35)}`;
    document.head.appendChild(st);
  }
  function find(sel) {
    if (!sel) return null;
    for (const s of sel.split(',')) { const el = [...document.querySelectorAll(s.trim())].find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right > 0 && r.left < innerWidth; }); if (el) return el; }
    return null;
  }
  function stop(done) {
    layer?.remove(); layer = null;
    if (cur) { const s = load(); s.active = null; if (done) { s.done = s.done || {}; s.done[cur.tour.id] = Date.now(); } save(s); }
    window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true);
    cur = null;
  }
  // steps: [{intro:true}] + tour.steps (intro step only if tour.intro)
  function stepsOf(t) { return (t.intro ? [{ intro: true }] : []).concat(t.steps); }
  function place() {
    if (!cur || !layer) return;
    const spot = layer.querySelector('#xct-spot'), card = layer.querySelector('#xct-card');
    const el = cur.el; const vw = innerWidth, vh = innerHeight;
    if (el) {
      const r = el.getBoundingClientRect(); const pad = 6;
      Object.assign(spot.style, { display: 'block', left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
      const cw = card.offsetWidth, ch = card.offsetHeight;
      let top = r.bottom + 12; if (top + ch > vh - 8) top = Math.max(8, r.top - ch - 12);
      let left = Math.min(Math.max(8, r.left), vw - cw - 8);
      card.style.top = top + 'px'; card.style.left = left + 'px';
    } else {
      Object.assign(spot.style, { left: vw / 2 + 'px', top: vh / 2 + 'px', width: '0px', height: '0px' });
      card.style.top = Math.max(8, (vh - card.offsetHeight) / 2) + 'px'; card.style.left = Math.max(8, (vw - card.offsetWidth) / 2) + 'px';
    }
  }
  async function show(i, dir = 1) {
    const steps = stepsOf(cur.tour);
    if (i < 0) i = 0;
    if (i >= steps.length) { const nx = cur.tour.next; stop(true); if (nx) offerNext(nx); return; }
    const st = steps[i];
    if (st.action === 'open-composer') { const pill = document.getElementById('composerPill'); if (pill && !pill.hidden && pill.getAttribute('aria-expanded') !== 'true') pill.click(); }
    if (st.action === 'open-secretary') openDesk();
    let el = null;
    if (st.selector) {
      for (let k = 0; k < 8 && !(el = find(st.selector)); k++) await new Promise((r) => setTimeout(r, 150));
      if (st.action === 'open-composer') el = find('#composerInput') || el;
      if (!el) return show(i + dir, dir); // selector missing → skip
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
    } else if (st.action === 'open-secretary') el = document.getElementById('xct-desk');
    cur.i = i; cur.el = el;
    const s = load(); s.active = { id: cur.tour.id, i }; save(s);
    const p = persona();
    const title = st.intro ? L(KB.intro.title) : fill(L(st.title));
    const body = st.intro ? introText() : fill(L(st.body)) + (capStatus(st.cap) === 'soon' ? U('soon') : '');
    const last = i === steps.length - 1;
    layer.querySelector('#xct-card').innerHTML = `<div class="h"><img alt="" src="/characters/${esc(p.avatar)}/still.webp"><div><div class="who">${esc(p.nameText)} · ${esc(L(cur.tour.title))}</div><b>${esc(title)}</b></div></div>
<div class="bar"><i style="width:${Math.round(((i + 1) / steps.length) * 100)}%"></i></div><p>${esc(body)}</p>
<div class="f"><span class="pg">${i + 1} / ${steps.length}</span><button data-a="skip">${esc(U('skip'))}</button>${i ? `<button data-a="back">${esc(U('back'))}</button>` : ''}<button class="pri" data-a="next">${esc(last ? U('done') : U('next'))}</button></div>`;
    layer.querySelectorAll('#xct-card [data-a]').forEach((b) => (b.onclick = () => { const a = b.dataset.a; if (a === 'skip') stop(true); else if (a === 'back') show(cur.i - 1, -1); else show(cur.i + 1, 1); }));
    requestAnimationFrame(place);
  }
  function offerNext(nx) {
    css(); const d = document.createElement('div'); d.id = 'xct-layer'; d.style.pointerEvents = 'none';
    d.innerHTML = `<div id="xct-card" style="right:16px;bottom:16px;left:auto;top:auto"><p>${esc(L(nx.label))}</p><div class="f"><span class="pg"></span><button data-x>${esc(U('close'))}</button><a class="xct-btn pri" href="${esc(nx.href)}">${esc(U('go'))}</a></div></div>`;
    d.querySelector('[data-x]').onclick = () => d.remove(); document.body.appendChild(d); setTimeout(() => d.remove(), 15000);
  }
  function start(id, i = 0) {
    if (!KB) return false;
    const t = id ? KB.tours.find((x) => x.id === id) : pick();
    if (!t) return false;
    stop(false); css();
    layer = document.createElement('div'); layer.id = 'xct-layer';
    layer.innerHTML = '<div id="xct-spot"></div><div id="xct-card" role="dialog" aria-live="polite"></div>';
    document.body.appendChild(layer);
    cur = { tour: t, i: 0, el: null };
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    show(i);
    return true;
  }
  function pick() { const s = site(); const p = location.pathname; return KB.tours.find((t) => (t.site || 'factory') === s && new RegExp(t.match).test(p)); }
  // Secretary desk demo panel (sample data, marked 演示/Demo).
  function openDesk(tab = 0) {
    css(); let d = document.getElementById('xct-desk');
    if (!d) { d = document.createElement('section'); d.id = 'xct-desk'; document.body.appendChild(d); }
    const S = KB.secretary; const keys = ['organize', 'reports', 'reminders', 'tasks'];
    const badge = (k) => (capStatus(k) === 'demo' ? `<span class="xct-demo">${esc(U('demo'))}</span>` : '');
    const k = keys[tab];
    const items = S[k].map((x, n) => k === 'organize' ? `<div class="it"><div class="k">${esc(L(x.when))}</div>${esc(L(x))}</div>`
      : k === 'reports' ? `<div class="it"><b>${esc(L(x.title))}</b><div>${esc(L(x))}</div></div>`
      : k === 'reminders' ? `<div class="it"><div class="k">⏰ ${esc(L(x.at))}</div>${esc(L(x))}</div>`
      : `<label class="it" style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-t="${n}" ${x.done ? 'checked' : ''}> <span>${esc(L(x))}</span></label>`).join('');
    d.innerHTML = `<div style="display:flex;align-items:center"><b style="flex:1">🗂 ${esc(U('desk'))} · ${esc(persona().nameText)}${badge(k)}</b><button class="xct-btn" data-close>×</button></div>
<div class="tb">${U('tabs').map((t, n) => `<button class="xct-btn ${n === tab ? 'on' : ''}" data-tab="${n}">${esc(t)}</button>`).join('')}</div>${items}`;
    d.querySelector('[data-close]').onclick = () => d.remove();
    d.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => openDesk(+b.dataset.tab)));
    d.querySelectorAll('[data-t]').forEach((c) => (c.onchange = () => { S.tasks[+c.dataset.t].done = c.checked; }));
    return d;
  }
  function launcher() {
    if (document.getElementById('xcg-panel') || document.getElementById('xct-launch')) return;
    const b = document.createElement('button'); b.id = 'xct-launch'; b.type = 'button'; b.textContent = '🎓 ' + U('start');
    b.onclick = () => start(); css(); document.body.appendChild(b);
  }
  async function init() {
    try { KB = await (await fetch(KB_URL, { credentials: 'same-origin' })).json(); } catch { return; }
    window.dispatchEvent(new CustomEvent('xc:tour-ready'));
    const s = load(); const t = pick();
    if (/[?&]tour=([\w-]+)/.test(location.search)) return setTimeout(() => start(RegExp.$1), 900);
    if (t && s.active && s.active.id === t.id) return setTimeout(() => start(t.id, s.active.i), 900);
    const lounge = () => document.body.classList.contains('lounge-open');
    // First visit: silent text greeting (no audio); the tour starts only if the user says yes.
    const auto = () => { if (cur || greetEl) return; if (lounge()) return setTimeout(auto, 1000); greet(); };
    if (t && t.trigger === 'first-visit' && !(s.done && s.done[t.id])) setTimeout(auto, 1500);
    setTimeout(launcher, 1200);
  }
  let greetEl = null, pending = false;
  function greetText() { return fill(L(KB.greeting.text)); }
  function bubble(html) {
    css(); greetEl?.remove();
    const b = document.createElement('div'); b.id = 'xct-greet'; b.setAttribute('role', 'status');
    b.style.cssText = 'position:fixed;right:20px;bottom:150px;z-index:2147483150;width:min(320px,calc(100vw - 40px));background:#12151c;color:#ececef;border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:12px 14px;font:13.5px/1.6 -apple-system,"PingFang SC",sans-serif;box-shadow:0 16px 40px rgba(0,0,0,.45)';
    b.innerHTML = html; document.body.appendChild(b); greetEl = b; return b;
  }
  // Text-only greeting bubble. Never plays audio; never posts into chat.
  function greet() {
    if (!KB || !KB.greeting) return false;
    const p = persona(); const G = KB.greeting;
    const b = bubble(`<div style="display:flex;gap:10px;align-items:flex-start"><img alt="" src="/characters/${esc(p.avatar)}/still.webp" style="width:36px;height:36px;border-radius:50%;object-fit:cover;background:#222"><div style="flex:1"><div style="font-size:11px;color:#9aa0aa">${esc(p.nameText)}</div><div data-g>${esc(greetText())}</div>
<div style="display:flex;gap:6px;margin-top:8px"><button class="xct-btn pri" data-y>${esc(L(G.yes))}</button><button class="xct-btn" data-n>${esc(L(G.no))}</button></div></div></div>`);
    b.querySelector('[data-y]').onclick = () => answer('yes');
    b.querySelector('[data-n]').onclick = () => answer('no');
    pending = true; const s = load(); s.greeted = Date.now(); save(s);
    return true;
  }
  function decline() {
    pending = false;
    const t = pick(); const s = load(); s.done = s.done || {}; if (t) s.done[t.id] = Date.now(); s.declined = Date.now(); save(s);
    const b = bubble(`<div>${esc(L(KB.greeting.decline))}</div>`);
    setTimeout(() => { if (greetEl === b) { b.remove(); greetEl = null; } }, 6000);
  }
  // User reply (button, typed text, or voice transcript). Returns true if consumed.
  function answer(text) {
    if (!pending || !KB) return false;
    const G = KB.greeting; const t = String(text || '');
    const yes = t === 'yes' || new RegExp(G.yesWords, 'i').test(t);
    const no = t === 'no' || new RegExp(G.noWords, 'i').test(t);
    if (no) { decline(); return true; }
    if (yes) { pending = false; greetEl?.remove(); greetEl = null; start(); return true; }
    pending = false; greetEl?.remove(); greetEl = null; return false; // anything else: hand back to normal chat
  }
  window.XC_TOUR = { greet, answer, greetText: () => (KB ? greetText() : ''), get pending() { return pending; }, start, stop, openDesk, introText: () => (KB ? introText() : ''), get kb() { return KB; }, get active() { return cur && { id: cur.tour.id, i: cur.i }; }, reset: () => save({}) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
