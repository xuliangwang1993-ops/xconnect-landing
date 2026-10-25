/* 图书馆管理员导览员（静态版）：只读、双语、纯前端关键词检索 data/guide.js。不发任何网络请求，不写数据。
   移植自 factory/integrate-workbench 的 guide-widget.js：原版依赖服务端 /guide/api/ask，静态站没有，故改为本地检索。 */
(() => {
  'use strict';
  if (window.__xcGuide) return; window.__xcGuide = true;
  const G = (window.XCF_GUIDE || {}).sections || [];
  const XCI = window.XCI || { lang: () => 'zh' };
  const L = () => (XCI.lang() === 'en' ? 'en' : 'zh');
  const UI = {
    btn: { zh: '📚 导览员', en: '📚 Guide' },
    title: { zh: '📚 <b>图书馆管理员</b> · 工厂导览', en: '📚 <b>Librarian</b> · Factory guide' },
    ph: { zh: '问我：AOI 能力表是什么？设置在哪？', en: 'Ask: what is the AOI table? Where are Settings?' },
    ask: { zh: '问', en: 'Ask' }, close: { zh: '关闭', en: 'Close' },
    next: { zh: '下一步', en: 'Next' }, skip: { zh: '跳过', en: 'Skip' }, ok: { zh: '好的', en: 'Got it' },
    tour: { zh: '导览', en: 'Tour' },
    chips: { zh: ['工厂整体怎么用？', 'AOI 能力表是什么？', '设置在哪里？', 'Pod 派单怎么看？', '登录和隐私'], en: ['How do I use the factory?', 'What is the AOI table?', 'Where are Settings?', 'How does Pod dispatch work?', 'Sign-in and privacy'] },
    chipsIntro: { zh: '可以直接问我，或点这些常见问题：', en: 'Ask me anything, or tap a common question:' },
    none: { zh: '没找到完全对应的内容，先给你看总览：\n\n', en: 'I could not find an exact match, so here is the overview:\n\n' },
    guard: { zh: '我只负责讲解和带路，不能替你下单、付款、关 pod、批准或改数据，要你自己去对应页面操作哦。\n\n', en: 'I only explain and point the way — I cannot place orders, pay, close pods, approve or change data for you. Please do that yourself on the relevant page.\n\n' }
  };
  const TOUR = [
    { zh: '你好，我是工厂的图书馆管理员 📚 带你 30 秒逛一圈。', en: 'Hi, I am the factory librarian 📚 — a 30-second tour.', links: [] },
    { zh: '左栏：8 个工位、AOI 能力表（M00–M11）和配方。点工位，中栏下方看它的入/出产物和 QA。', en: 'Left column: the 8 stations, the AOI table (M00–M11) and recipes. Click a station to see its inputs/outputs and QA below the line.', links: [] },
    { zh: '中栏：产线 FLOW、Pod 派单、交接账本。右栏：小助手、皮肤、运行。订单和 Pod 只显示你自己账号的。', en: 'Centre: line FLOW, Pod dispatch, handoff ledger. Right: assistant, skins, run. Orders and Pods show only your own account.', links: [] },
    { zh: '想看完整能力树，点顶栏「AOI 视图」。设置在独立的工作台里，不在本页。', en: 'For the full capability tree, use “AOI view” in the header. Settings live in the separate Workbench, not on this page.', links: [['AOI 能力树 / AOI tree', 'aoi-tree.html'], ['工作台（预览） / Workbench', 'https://xconnect-workbench-preview.onrender.com/']] },
    { zh: '我只讲解和带路，不会替你下单、付款或改数据。有问题随时点右下角问我！', en: 'I only explain and guide — I never place orders, pay or change data. Ask me anytime from the bottom-right button!', links: [] }
  ];
  const css = `
#xcg-btn{position:fixed;right:20px;bottom:20px;z-index:2147483000;display:flex;gap:8px;align-items:center;padding:10px 16px;border-radius:999px;background:#0F172A;color:#FBBF24;border:1px solid rgba(251,191,36,.4);font:600 13px/1 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;cursor:pointer;box-shadow:0 20px 50px rgba(0,0,0,.5)}
#xcg-panel{position:fixed;right:20px;bottom:72px;z-index:2147483000;width:min(380px,calc(100vw - 40px));max-height:min(560px,calc(100vh - 110px));display:none;flex-direction:column;background:#0B1220;color:#F8FAFC;border:1px solid rgba(251,191,36,.35);border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,.55);font:13px/1.6 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;overflow:hidden}
#xcg-panel.open{display:flex}
#xcg-head{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.1)}
#xcg-head b{color:#FBBF24}#xcg-head button{background:none;border:0;color:#94A3B8;font-size:18px;cursor:pointer}
#xcg-log{flex:1;overflow:auto;padding:12px 14px;display:flex;flex-direction:column;gap:10px}
.xcg-m{white-space:pre-wrap;padding:9px 11px;border-radius:10px;background:#0F172A}.xcg-u{align-self:flex-end;background:rgba(251,191,36,.14)}
.xcg-links{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.xcg-links a,.xcg-chip{font-size:12px;padding:3px 10px;border-radius:999px;border:1px solid rgba(251,191,36,.4);color:#FBBF24;text-decoration:none;background:none;cursor:pointer;font-family:inherit}
.xcg-tour{color:#94A3B8;font-size:12px;display:flex;justify-content:space-between;align-items:center;margin-top:8px}
#xcg-form{display:flex;gap:8px;padding:10px 12px;border-top:1px solid rgba(255,255,255,.1)}
#xcg-q{flex:1;min-width:0;background:#0F172A;color:#F8FAFC;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:7px 9px;font:inherit}
#xcg-form button{background:#FBBF24;color:#16181d;border:0;border-radius:8px;padding:0 14px;font-weight:600;cursor:pointer}`;
  const st = document.createElement('style'); st.setAttribute('data-i18n-skip', ''); st.textContent = css; document.head.appendChild(st);

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
  const safeHref = (h) => (/^(https:\/\/|aoi-tree\.html|#|\/)/.test(h) ? h : '#');

  /* 检索：与服务端版同一套打分（2-gram + 关键词），zh/en 都能命中 */
  const grams = (s) => {
    const out = new Set();
    for (const w of String(s).toLowerCase().replace(/[\s.,;:!?，。；：！？、()（）"“”'’`*\-—/]+/g, ' ').split(' ').filter(Boolean)) {
      if (/^[a-z0-9]+$/.test(w)) { out.add(w); continue; }
      for (let i = 0; i < w.length - 1; i++) out.add(w.slice(i, i + 2));
      if (w.length === 1) out.add(w);
    }
    return out;
  };
  function retrieve(q, k = 2) {
    const qg = grams(q); if (!qg.size) return [];
    const ql = String(q).toLowerCase();
    return G.map((s) => {
      let score = 0;
      for (const kw of String(s.k).split(/\s+/).filter(Boolean)) { if (ql.includes(kw.toLowerCase())) score += 5; else if (grams(kw).size > 1) for (const g of grams(kw)) if (qg.has(g)) score += 1; }
      const tg = new Set([...grams(s.t.zh), ...grams(s.t.en)]), bg = new Set([...grams(s.b.zh), ...grams(s.b.en)]);
      for (const g of qg) { if (tg.has(g)) score += 2; if (bg.has(g)) score += 0.5; }
      return { s, score };
    }).filter((x) => x.score >= 2).sort((a, b) => b.score - a.score).slice(0, k).map((x) => x.s);
  }
  const WRITE = /(帮我|替我|直接|你来|please|can you|for me)[^。.]*(付款|支付|充值|下单|提交|批准|删除|执行|购买|关\s*pod|pay|order|submit|approve|delete|buy|close)|(付款|支付|下单|批准|删除|购买|pay|buy|approve|delete)[^。.]*(帮我|替我|for me)/i;

  const btn = document.createElement('button'); btn.id = 'xcg-btn'; btn.type = 'button';
  const panel = document.createElement('section'); panel.id = 'xcg-panel';
  panel.innerHTML = '<div id="xcg-head"><span data-h></span><button type="button" data-c>×</button></div><div id="xcg-log" aria-live="polite"></div><form id="xcg-form"><input id="xcg-q" maxlength="200" autocomplete="off"><button type="submit" data-a></button></form>';
  [btn, panel].forEach((e) => e.setAttribute('data-i18n-skip', ''));
  document.body.append(btn, panel);
  const log = panel.querySelector('#xcg-log');
  function labels() {
    const l = L();
    btn.innerHTML = UI.btn[l]; panel.setAttribute('aria-label', l === 'en' ? 'Factory guide' : '工厂导览员');
    panel.querySelector('[data-h]').innerHTML = UI.title[l];
    panel.querySelector('[data-c]').setAttribute('aria-label', UI.close[l]);
    panel.querySelector('#xcg-q').placeholder = UI.ph[l]; panel.querySelector('[data-a]').textContent = UI.ask[l];
  }
  labels(); document.addEventListener('xc:lang', labels);

  function say(text, links = [], extra = '') {
    const d = document.createElement('div'); d.className = 'xcg-m';
    d.innerHTML = md(text) + (links.length ? '<div class="xcg-links">' + links.map(([lb, h]) => `<a href="${esc(safeHref(h))}"${/^https:/.test(h) ? ' target="_blank" rel="noopener noreferrer"' : ''}>${esc(lb)} →</a>`).join('') + '</div>' : '') + extra;
    log.appendChild(d); log.scrollTop = log.scrollHeight; return d;
  }
  function ask(q) {
    const l = L();
    const u = document.createElement('div'); u.className = 'xcg-m xcg-u'; u.textContent = q; log.appendChild(u);
    const hits = retrieve(q);
    const top = hits.length ? hits : [G[0]];
    const links = [...new Map(top.flatMap((s) => s.l).map((x) => [x[1], x])).values()];
    say((WRITE.test(q) ? UI.guard[l] : '') + (hits.length ? '' : UI.none[l]) + top.map((s) => `【${s.t[l]}】\n${s.b[l]}`).join('\n\n'), links);
  }
  const done = () => { try { localStorage.setItem('xcGuideToured', '1'); } catch (e) {} };
  function tour(i = 0) {
    const l = L(), s = TOUR[i], last = i === TOUR.length - 1;
    const d = say(s[l], s.links.map(([lb, h]) => [lb.split(' / ')[l === 'en' ? 1 : 0], h]),
      `<div class="xcg-tour"><span>${UI.tour[l]} ${i + 1}/${TOUR.length}</span><span>${last ? '' : `<button class="xcg-chip" data-n>${UI.next[l]}</button> `}<button class="xcg-chip" data-x>${last ? UI.ok[l] : UI.skip[l]}</button></span></div>`);
    const n = d.querySelector('[data-n]'); if (n) n.addEventListener('click', (e) => { e.target.closest('.xcg-tour').remove(); tour(i + 1); });
    d.querySelector('[data-x]').addEventListener('click', (e) => { e.target.closest('.xcg-tour').remove(); done(); chips(); });
    if (last) done();
  }
  function chips() {
    const l = L(), d = say(UI.chipsIntro[l]), w = document.createElement('div'); w.className = 'xcg-links';
    UI.chips[l].forEach((q) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'xcg-chip'; b.textContent = q; b.onclick = () => ask(q); w.appendChild(b); });
    d.appendChild(w);
  }
  let started = false;
  function open() { panel.classList.add('open'); if (!started) { started = true; let t = false; try { t = !!localStorage.getItem('xcGuideToured'); } catch (e) {} t ? chips() : tour(); } }
  btn.onclick = () => (panel.classList.contains('open') ? panel.classList.remove('open') : open());
  panel.querySelector('[data-c]').onclick = () => { panel.classList.remove('open'); done(); };
  panel.querySelector('#xcg-form').onsubmit = (e) => { e.preventDefault(); const i = panel.querySelector('#xcg-q'); const q = i.value.trim(); if (q) { i.value = ''; ask(q); } };
  if (/[?&]guide=1/.test(location.search)) open();   // 不自动弹出：登录页上不打扰；?guide=1 或点按钮才开
})();
