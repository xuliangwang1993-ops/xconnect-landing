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
  const btn = document.createElement('button'); btn.id = 'xcg-btn'; btn.type = 'button'; btn.innerHTML = '📚 导览员';
  const panel = document.createElement('section'); panel.id = 'xcg-panel'; panel.setAttribute('aria-label', '工厂导览员');
  panel.innerHTML = `<div id="xcg-head"><span>📚 <b>图书馆管理员</b> · 工厂导览</span><button type="button" aria-label="关闭">×</button></div>
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
  const TOUR = [
    ['你好，我是工厂的图书馆管理员 📚 带你 30 秒逛一圈：这里分三块，门面「搭台」、工作台「唱戏」、AoI 看板。', [{ label: '门面首页', href: '/' }]],
    ['第一步，在门面「立即委托」说出想法。只要说清三件事：场景和不可改项、谁来用、怎样算验收合格。', [{ label: '立即委托', href: '/#commission' }, { label: '委托指南', href: '/#help' }]],
    ['第二步，进工作台：把想法整理成卡片，经过独立审阅，再由你亲手批准，然后执行。', [{ label: '工作台', href: '/workbench' }]],
    ['第三步，在 AoI 看板看能力快照。只有 AoI 给出证据才算 verified。', [{ label: 'AoI 看板', href: '/aoi' }]],
    ['我只讲解和带路，不会替你下单、付款或改数据。有问题随时点右下角问我！', []],
  ];
  function tour(i = 0) {
    const [t, l] = TOUR[i];
    const last = i === TOUR.length - 1;
    const d = say(t, l, `<div class="xcg-tour"><span>导览 ${i + 1}/${TOUR.length}</span><span>${last ? '' : '<button class="xcg-chip" data-n>下一步</button> '}<button class="xcg-chip" data-x>${last ? '好的' : '跳过'}</button></span></div>`);
    d.querySelector('[data-n]')?.addEventListener('click', (e) => { e.target.closest('.xcg-tour').remove(); tour(i + 1); });
    d.querySelector('[data-x]').addEventListener('click', (e) => { e.target.closest('.xcg-tour').remove(); try { localStorage.setItem('xcGuideToured', '1'); } catch {} chips(); });
    if (last) try { localStorage.setItem('xcGuideToured', '1'); } catch {}
  }
  function chips() {
    const qs = ['工厂整体怎么用？', '怎么写好委托？', '怎么查询进展？', '卡片怎么批准？', 'AoI 看板是什么？'];
    const d = say('可以直接问我，或点这些常见问题：'); const w = document.createElement('div'); w.className = 'xcg-links';
    for (const q of qs) { const b = document.createElement('button'); b.type = 'button'; b.className = 'xcg-chip'; b.textContent = q; b.onclick = () => ask(q); w.appendChild(b); }
    d.appendChild(w);
  }
  let started = false;
  function open() { panel.classList.add('open'); if (!started) { started = true; let toured = false; try { toured = !!localStorage.getItem('xcGuideToured'); } catch {} toured ? chips() : tour(); } }
  btn.onclick = () => (panel.classList.contains('open') && !full ? panel.classList.remove('open') : open());
  panel.querySelector('#xcg-head button').onclick = () => { if (full) location.href = '/'; else panel.classList.remove('open'); try { localStorage.setItem('xcGuideToured', '1'); } catch {} };
  panel.querySelector('#xcg-form').onsubmit = (e) => { e.preventDefault(); const i = panel.querySelector('#xcg-q'); const q = i.value.trim(); if (q) { i.value = ''; ask(q); } };
  let first = false; try { first = !localStorage.getItem('xcGuideToured'); } catch {}
  if (full || first || /[?&]guide=1/.test(location.search)) open();
})();
