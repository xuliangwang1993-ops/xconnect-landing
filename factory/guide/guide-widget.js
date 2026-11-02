// 图书馆管理员 floating guide. Read-only: explains and links, never writes/pays.
(() => {
  if (window.__xcGuide) return; window.__xcGuide = true;
  const C = { bg: 'var(--bg-elevated,#191d24)', bg2: 'var(--bg-stage,#13161b)', ink: 'var(--ink-light,#f3f0e8)',
    mute: 'var(--ink-muted,#9ca3af)', amber: 'var(--accent-amber-bright,#f59e0b)', amberSoft: 'var(--accent-amber-soft,rgba(245,158,11,.14))',
    border: 'var(--border-bright,rgba(245,158,11,.35))' };
  const css = `
#xcg-btn{position:fixed;right:20px;bottom:20px;z-index:2147483000;display:flex;gap:8px;align-items:center;padding:10px 16px;border-radius:999px;
 background:${C.bg};color:${C.amber};border:1px solid ${C.border};font:600 14px/1 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;cursor:pointer;box-shadow:0 20px 50px rgba(0,0,0,.45)}
#xcg-panel{position:fixed;right:20px;bottom:76px;z-index:2147483000;width:min(380px,calc(100vw - 40px));max-height:min(560px,calc(100vh - 110px));display:none;flex-direction:column;
 background:${C.bg2};color:${C.ink};border:1px solid ${C.border};border-radius:16px;box-shadow:0 20px 50px rgba(0,0,0,.45);font:14px/1.6 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;overflow:hidden}
#xcg-panel.open{display:flex}#xcg-panel.full{position:static;width:auto;max-height:none;margin:24px auto;max-width:720px;display:flex}
#xcg-head{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.1)}
#xcg-head b{color:${C.amber}}#xcg-head button{background:none;border:0;color:${C.mute};font-size:18px;cursor:pointer}
#xcg-log{flex:1;overflow:auto;padding:12px 16px;display:flex;flex-direction:column;gap:10px}
.xcg-m{white-space:pre-wrap;padding:10px 12px;border-radius:10px;background:${C.bg}}.xcg-u{align-self:flex-end;background:${C.amberSoft};color:${C.ink}}
.xcg-links{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.xcg-links a,.xcg-chip{font-size:12px;padding:3px 10px;border-radius:999px;border:1px solid ${C.border};color:${C.amber};text-decoration:none;background:none;cursor:pointer}
.xcg-tour{color:${C.mute};font-size:12px;display:flex;justify-content:space-between;align-items:center;margin-top:8px}
#xcg-form{display:flex;gap:8px;padding:10px 12px;border-top:1px solid rgba(255,255,255,.1)}
#xcg-q{flex:1;background:${C.bg};color:${C.ink};border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:8px 10px;font:inherit}
#xcg-form button{background:${C.amber};color:#16181d;border:0;border-radius:10px;padding:0 14px;font-weight:600;cursor:pointer}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const full = location.pathname.replace(/\/$/, '') === '/guide';
  const onHome = location.pathname.replace(/\/$/, '') === '' || location.pathname === '/';
  const btn = document.createElement('button'); btn.id = 'xcg-btn'; btn.type = 'button'; btn.innerHTML = onHome ? '助手' : '📚 导览员';
  const panel = document.createElement('section'); panel.id = 'xcg-panel'; panel.setAttribute('aria-label', '工厂导览员');
  panel.innerHTML = `<div id="xcg-head"><span>${onHome ? '<b>助手</b> · 一起搭 Factory OS' : '📚 <b>图书馆管理员</b> · 工厂导览'}</span><span style="display:flex;gap:6px;align-items:center"><button type="button" id="xcg-nav-call" aria-label="呼叫" style="font-size:13px;color:#ececef;border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:3px 10px"></button><button type="button" id="xcg-close" aria-label="关闭">×</button></span></div>
<div id="xcg-log"></div><form id="xcg-form"><input id="xcg-q" placeholder="问我：怎么发起委托？卡片怎么批准？" maxlength="200" autocomplete="off"><button>问</button></form>`;
  const mount = full ? (document.getElementById('guide-root') || document.body) : document.body;
  if (full) panel.classList.add('full', 'open'); else document.body.appendChild(btn);
  mount.appendChild(panel);
  const log = panel.querySelector('#xcg-log');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
  function say(text, links = [], extra = '') {
    const d = document.createElement('div'); d.className = 'xcg-m';
    d.innerHTML = md(text) + (links.length ? '<div class="xcg-links">' + links.map((l) => `<a href="${esc(l.href)}">${esc(l.label)} →</a>`).join('') + '</div>' : '') + extra;
    log.appendChild(d); log.scrollTop = log.scrollHeight; return d;
  }
  async function ask(q) {
    const u = document.createElement('div'); u.className = 'xcg-m xcg-u'; u.textContent = q; log.appendChild(u);
    try { const r = await fetch('/guide/api/ask?q=' + encodeURIComponent(q)); const d = await r.json(); say(d.text, d.links || []); }
    catch { say('导览暂时连不上，请稍后再试。'); }
  }
  function reveal(step) {
    try { window.dispatchEvent(new CustomEvent('xc:factory-reveal', { detail: { step } })); } catch {}
  }
  const TOUR = onHome ? [
    ['这里按 Linear 的结构来：先有项目（工厂线），再在项目里开 Issue。', []],
    ['画布空着就对了。第一步：创建一个项目。', []],
    ['点「Create first project」，或让我帮你打开创建框。', []],
    ['进到项目后，把工作拆成 Issue，按 idea → verified 往前推。', [{ label: 'Graph', href: '/graph' }, { label: 'AoI', href: '/aoi' }]],
    ['我只带路和讲解；创建仍由你确认。', []],
  ] : [
    ['你好，我是工厂的图书馆管理员 📚 带你 30 秒逛一圈：这里分三块，门面「搭台」、工作台「唱戏」、AoI 看板。', [{ label: '门面首页', href: '/' }]],
    ['第一步，在门面「立即委托」说出想法。只要说清三件事：场景和不可改项、谁来用、怎样算验收合格。', [{ label: '委托门面', href: '/portal#commission' }, { label: '委托指南', href: '/portal#help' }]],
    ['第二步，进工作台：把想法整理成卡片，经过独立审阅，再由你亲手批准，然后执行。', [{ label: '工作台', href: '/workbench' }]],
    ['第三步，在 AoI 看板看能力快照。只有 AoI 给出证据才算 verified。', [{ label: 'AoI 看板', href: '/aoi' }]],
    ['我只讲解和带路，不会替你下单、付款或改数据。有问题随时点右下角问我！', []],
  ];
  function tour(i = 0) {
    const [t, l] = TOUR[i];
    const last = i === TOUR.length - 1;
    if (onHome && i === 2) {
      try { window.dispatchEvent(new CustomEvent('xc:factory-new-project')); } catch {}
    }
    const d = say(t, l, `<div class="xcg-tour"><span>导览 ${i + 1}/${TOUR.length}</span><span>${last ? '' : '<button class="xcg-chip" data-n>下一步</button> '}<button class="xcg-chip" data-x>${last ? '好的' : '跳过'}</button></span></div>`);
    d.querySelector('[data-n]')?.addEventListener('click', (e) => { e.target.closest('.xcg-tour').remove(); tour(i + 1); });
    d.querySelector('[data-x]').addEventListener('click', (e) => {
      e.target.closest('.xcg-tour').remove();
      try { localStorage.setItem('xcGuideToured', '1'); } catch {}
      chips();
    });
    if (last) {
      try { localStorage.setItem('xcGuideToured', '1'); } catch {}
    }
  }
  function chips() {
    const qs = onHome ? ['怎么建第一个项目？', '项目和 Issue 什么关系？', 'AoI 证据怎么看？'] : ['工厂整体怎么用？', '怎么写好委托？', '怎么查询进展？', '卡片怎么批准？', 'AoI 看板是什么？'];
    const d = say('可以直接问我，或点这些常见问题：'); const w = document.createElement('div'); w.className = 'xcg-links';
    for (const q of qs) { const b = document.createElement('button'); b.type = 'button'; b.className = 'xcg-chip'; b.textContent = q; b.onclick = () => ask(q); w.appendChild(b); }
    d.appendChild(w);
  }
  let started = false;
  function open() { panel.classList.add('open'); if (!started) { started = true; let toured = false; try { toured = !!localStorage.getItem('xcGuideToured'); } catch {} toured ? chips() : tour(); } }
  btn.onclick = () => (panel.classList.contains('open') && !full ? panel.classList.remove('open') : open());
  panel.querySelector('#xcg-close').onclick = () => { if (full) location.href = '/'; else panel.classList.remove('open'); try { localStorage.setItem('xcGuideToured', '1'); } catch {} };
  panel.querySelector('#xcg-form').onsubmit = (e) => { e.preventDefault(); const i = panel.querySelector('#xcg-q'); const q = i.value.trim(); if (q) { i.value = ''; ask(q); } };

  // 呼叫：小助手从顶部落下，停在右下角并主动问候（工厂页无语音会话 → 只用文字；不跳页）
  const AV = { voice: ['duck', '李黑鸭'], scribe: ['sparky', '斯巴达'], brain: ['rapper', '四毛'], deep: ['wutian', '武天'], admin: ['feifei', '狒狒'] };
  const PHONE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-3px"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
  function picked() {
    let id = ''; try { id = localStorage.getItem('xcw_assistant') || ''; } catch {}
    if (!id) { const m = document.cookie.match(/(?:^|;\s*)xc_assistant=([^;]*)/); id = m ? decodeURIComponent(m[1]) : ''; }
    return AV[id] ? id : 'brain';
  }
  function callPet() {
    document.querySelectorAll('.xcg-pet,.xcg-bubble').forEach((n) => n.remove());
    const [av, name] = AV[picked()];
    const img = document.createElement('img'); img.className = 'xcg-pet'; img.alt = name; img.src = `/characters/${av}/idle.webp`;
    img.style.cssText = 'position:fixed;right:24px;bottom:72px;width:96px;height:96px;object-fit:contain;z-index:9998;cursor:pointer';
    img.onclick = () => { img.remove(); bub.remove(); };
    document.body.appendChild(img);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce && img.animate) img.animate([
      { transform: `translateY(${-innerHeight}px)`, offset: 0 }, { transform: 'translateY(0)', offset: 0.6, easing: 'ease-out' },
      { transform: 'translateY(-28px)', offset: 0.75, easing: 'ease-in' }, { transform: 'translateY(0)', offset: 0.88, easing: 'ease-out' },
      { transform: 'translateY(-8px)', offset: 0.94 }, { transform: 'translateY(0)', offset: 1 }], { duration: 900 });
    const bub = document.createElement('div'); bub.className = 'xcg-bubble';
    const tt = (k, v, fb) => (window.XC_I18N ? window.XC_I18N.t(k, v) : fb);
    const en = window.XC_I18N && window.XC_I18N.lang === 'en';
    bub.textContent = tt('call.greet', { name: en ? ({ duck: 'Duck Lee', sparky: 'Sparky', rapper: 'Forty Cents', wutian: 'WuTian', feifei: 'Feifei' }[av]) : name }, `嗨，我是${name}！`) + ' ' + tt('call.hint', {}, '');
    bub.style.cssText = `position:fixed;right:128px;bottom:140px;max-width:240px;z-index:9999;background:${C.panel || '#16181d'};color:#ececef;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:8px 12px;font:13px/1.4 system-ui,"PingFang SC",sans-serif`;
    setTimeout(() => document.body.appendChild(bub), reduce ? 0 : 700);
    setTimeout(() => bub.remove(), 7000);
  }
  { // 呼叫按钮只在导航员窗口内（打开面板后可见），不再有右下角并列入口
    const call = panel.querySelector('#xcg-nav-call');
    const T = (k, v, fb) => (window.XC_I18N ? window.XC_I18N.t(k, v) : fb);
    const lab = () => { call.innerHTML = PHONE + ' ' + T('call.label', {}, '呼叫'); call.setAttribute('aria-label', T('call.label', {}, '呼叫')); };
    lab(); window.XC_I18N?.onChange(lab); call.onclick = callPet;
  }
  let first = false; try { first = !localStorage.getItem('xcGuideToured'); } catch {}
  if (full || first || /[?&]guide=1/.test(location.search)) open();
})();
