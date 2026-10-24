/* X-Connect Factory · 单文件交互
   数据来自 data/bundle.js（window.XCF_DATA），不 fetch —— minis:// 下 fetch 会挂。 */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const D = window.XCF_DATA;
  if (!D) { console.error('XCF_DATA missing'); return; }

  const RUN = D.stations.run;
  const ST = D.stations.stations;
  const CHAIN = D.stations.chain;
  const RECIPES = D.recipes.recipes;
  const AOI = D.aoi;

  const S = {
    skins: D.skins.skins.slice(),
    skin: localStorage.getItem('xcf-skin') || 'xconnect',
    grain: localStorage.getItem('xcf-grain'),
    view: ST,
    mode: 'run',
    station: ST[0].id,
    recipe: RECIPES[0],
    playing: false,
  };
  S.view = ST;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const kb = (n) => n == null ? '—' : n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n >= 1024 ? Math.round(n / 1024) + ' KB' : n + ' B';
  const sha8 = (h) => (h || '').slice(0, 8) || '—';
  const base = (p) => String(p || '').split('/').pop();

  function shortVer(v) {
    if (!v) return '';
    const m = String(v).match(/\b(\d+\.\d+(?:\.\d+)?)\b/);
    if (m) return m[1];
    if (/降级/.test(v)) return 'fallback';
    return String(v).slice(0, 12);
  }
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 2600);
  }
  function contrast(a, b) {
    const lum = (h) => {
      h = h.replace('#', '');
      const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
        .map((x) => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
    return Math.round(((x + 0.05) / (y + 0.05)) * 10) / 10;
  }

  /* ---------------- 皮肤 ---------------- */
  const VARMAP = { bg: '--bg', bg2: '--bg2', surface: '--surface', surface2: '--surface2', surface3: '--surface3',
    accent: '--accent', accent2: '--accent2', text: '--text', muted: '--muted', dim: '--dim',
    ok: '--ok', warn: '--warn', bad: '--bad', fn: '--fn' };

  function applySkin(id, opts = {}) {
    const sk = S.skins.find((x) => x.id === id) || S.skins[0];
    // 用 <style> 整块替换，而不是逐个 setProperty：WebKit 对自定义属性改动的
    // 失效不彻底，var() 的消费方会留旧色（本站实测：换肤后边框仍是上一套）。
    const css = ':root{' + Object.keys(VARMAP).filter((k) => sk.tokens[k])
      .map((k) => `${VARMAP[k]}:${sk.tokens[k]}`).join(';') + '}';
    let st = document.getElementById('skin-vars');
    if (!st) { st = document.createElement('style'); st.id = 'skin-vars'; document.head.appendChild(st); }
    st.textContent = css;
    document.documentElement.dataset.skin = sk.id;
    $('#skinName').textContent = sk.name;
    S.skin = sk.id;
    if (!opts.silent) localStorage.setItem('xcf-skin', sk.id);
    if (S.grain === null || opts.forceGrain) setGrain(sk.grain ? 'on' : 'off', true);
    $$('.skin').forEach((el) => { const on = el.dataset.id === sk.id; el.setAttribute('aria-current', String(on)); el.classList.toggle('is-current', on); });
    renderSkinProv(sk);
  }
  function setGrain(on, silent) {
    S.grain = on;
    document.body.dataset.grain = on;
    $('#grainSwitch').setAttribute('aria-pressed', String(on === 'on'));
    if (!silent) localStorage.setItem('xcf-grain', on);
  }
  function renderSkinProv(sk) {
    const t = sk.tokens;
    const c1 = contrast(t.text, t.bg), c2 = contrast(t.text, t.surface);
    const src = sk.source || {};
    $('#skinProv').innerHTML =
      `<div><b>来源</b> ${esc(src.ref || '—')}</div>` +
      (src.sha256 ? `<div><b>sha256</b> ${esc(src.sha256.slice(0, 16))}…</div>` : '') +
      `<div><b>对比度</b> text/bg ${c1}:1 · text/surface ${c2}:1 · ${c1 >= 4.5 && c2 >= 4.5 ? 'AA ✓' : '未达 AA'}</div>` +
      (sk.measured ? `<div><b>实测色</b> ${sk.measured.map(esc).join(' ')}</div>` : '');
  }
  function renderSkins() {
    $('#skins').innerHTML = S.skins.map((sk) => {
      const t = sk.tokens;
      const c = contrast(t.text, t.bg);
      const sha = sk.source && sk.source.sha256 ? sk.source.sha256.slice(0, 8) : '';
      return `<div class="skin ${sk.id === S.skin ? 'is-current' : ''}" data-id="${esc(sk.id)}" role="button" tabindex="0" aria-current="${sk.id === S.skin}">
        <div class="s1"><b>${esc(sk.name)}</b><span class="zh">${esc(sk.zh)}</span>
          <span class="badge ${sk.authentic ? 'auth' : ''}">${esc(sk.badge)}</span></div>
        <div class="sw"><i style="background:${t.bg}"></i><i style="background:${t.surface}"></i><i style="background:${t.surface2}"></i><i style="background:${t.accent}"></i><i style="background:${t.accent2}"></i></div>
        <div class="src">${esc(sk.source ? sk.source.ref : '')}${sha ? ' · ' + sha : ''}</div>
        <div class="cx"><span>text/bg ${c}:1</span><span class="${c >= 4.5 ? '' : 'warn'}">${c >= 4.5 ? 'AA' : '低对比'}</span>${sk.authentic ? '<b>可溯源</b>' : ''}</div>
      </div>`;
    }).join('');
    $$('#skins .skin').forEach((el) => {
      const go = () => { applySkin(el.dataset.id); toast('皮肤已换：' + (S.skins.find((x) => x.id === el.dataset.id) || {}).name); };
      el.addEventListener('click', go);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  }

  /* ---------------- 左栏 ---------------- */
  function renderRail() {
    $('#runId').textContent = RUN.run_id;
    $('#runShort').textContent = RUN.run_id;
    $('#toolCount').textContent = D.tools.count;
    $('#stationList').innerHTML = ST.map((s) => {
      const bad = s.qa && s.qa.pass === false;
      const signed = s.exit_code && s.exit_code !== 0;
      return `<li><button data-id="${s.id}" aria-current="${s.id === S.station}" class="${s.id === S.station ? 'is-current' : ''}">
        <span class="st-index">${esc(s.index)}</span>
        <span class="st-name">${esc(s.zh)}<em>${esc(s.name)}</em></span>
        <span class="st-dot ${signed ? 'bad' : bad ? 'warn' : 'ok'}" title="${signed ? 'exit ' + s.exit_code : bad ? '有 1 项待补' : 'pass'}"></span>
      </button></li>`;
    }).join('');
    $$('#stationList button').forEach((b) => b.addEventListener('click', () => { selectStation(b.dataset.id); }));
  }

  function renderAOI() {
    $('#aoiList').innerHTML = AOI.modules.map((m) => `
      <li><button data-code="${m.code}" aria-current="false" title="${esc(m.role)}">
        <span class="aoi-code">${m.code}</span>
        <span class="aoi-name">${esc(m.name)}</span>
        <span class="aoi-count">${m.stations.length || ''}</span>
      </button></li>`).join('');
    $$('#aoiList button').forEach((b) => b.addEventListener('click', () => {
      const m = AOI.modules.find((x) => x.code === b.dataset.code);
      $$('#aoiList button').forEach((x) => { x.setAttribute('aria-current', String(x === b)); x.classList.toggle('is-current', x === b); });
      if (!m.stations.length) { toast(m.code + ' · ' + m.name + '：本页没有接到这一站'); return; }
      if (S.mode !== 'run') { toast('先回到已实测的 R01 才能看这一站'); return; }
      selectStation(m.stations[0]);
      toast(m.code + ' → ' + m.stations.join(' / '));
    }));
  }

  function renderRecipes() {
    $('#recipeList').innerHTML = RECIPES.map((r) => `
      <li><button data-rid="${r.id}" class="${r.id === S.recipe.id ? 'is-current' : ''}">
        <span class="rid">${r.id}</span>
        <span class="rname">${esc(r.name)}</span>
        <span class="rdot ${r.status === 'verified' ? 'ok' : ''}" title="${r.status === 'verified' ? '已实测' : '骨架'}"></span>
      </button></li>`).join('');
    $$('#recipeList button').forEach((b) => b.addEventListener('click', () => applyRecipe(b.dataset.rid)));
  }

  /* ---------------- 产线 ---------------- */
  function wireLabel(fromId, toId) {
    const c = CHAIN.find((x) => x.to === toId);
    if (!c) return 'handoff';
    const l = c.links.find((k) => k.from === fromId);
    return l ? base(l.artifact) : 'handoff';
  }
  function cardRun(s) {
    const outs = s.outputs || [];
    const first = outs[0] || {};
    const more = outs.length > 1 ? ` +${outs.length - 1}` : '';
    return `<button class="station ${s.id === S.station ? 'is-current' : ''}" data-id="${s.id}" role="listitem" aria-current="${s.id === S.station}" aria-label="${esc(s.index + ' ' + s.zh + '，产物 ' + (first.name || '无'))}">
      <div class="s-top"><span class="s-idx">${esc(s.index)}</span><span class="s-aoi">${esc(s.aoi)}</span></div>
      <h3>${esc(s.zh)}<span>${esc(s.name)}</span></h3>
      <div class="s-tools">${(s.tools || []).slice(0, 4).map((t) => `<span class="toolchip">${esc(t.name.split(' ')[0])}</span>`).join('')}${(s.tools || []).length > 4 ? `<span class="toolchip">+${s.tools.length - 4}</span>` : ''}</div>
      <div class="s-out"><span class="arrow">→</span><b>${esc(first.name || '—')}${esc(more)}</b><span class="sz">${kb(first.bytes)}</span></div>
    </button>`;
  }
  function cardPlan(p, i) {
    return `<div class="station" role="listitem" style="border-style:dashed" aria-label="构想在案 ${esc(p.tool)}">
      <div class="s-top"><span class="s-idx">${String(i + 1).padStart(2, '0')}</span><span class="s-aoi">PLAN</span></div>
      <h3>${esc(p.tool)}<span>骨架</span></h3>
      <div class="s-tools"><span class="toolchip">未实测</span></div>
      <div class="s-out"><span class="arrow">→</span><b>${esc(p.out)}</b><span class="sz">—</span></div>
    </div>`;
  }
  function renderFlow() {
    const flow = $('#flow');
    const items = S.mode === 'run' ? S.view : (S.recipe.plan || []);
    flow.innerHTML = '';
    items.forEach((it, i) => {
      if (i) {
        const label = S.mode === 'run' ? wireLabel(items[i - 1].id, it.id) : (items[i - 1].out || 'handoff');
        const w = document.createElement('div');
        w.className = 'wire'; w.dataset.i = i;
        w.innerHTML = `<i>${esc(label)}</i>`;
        flow.appendChild(w);
      }
      const wrap = document.createElement('div');
      wrap.innerHTML = S.mode === 'run' ? cardRun(it) : cardPlan(it, i);
      const card = wrap.firstElementChild;
      if (S.mode === 'run') card.addEventListener('click', () => selectStation(it.id));
      flow.appendChild(card);
    });
    $('#fitBtn').disabled = S.mode !== 'run';
  }

  function renderMeta() {
    const checks = ST.reduce((n, s) => n + (s.qa.checks || []).length, 0);
    const pass = ST.reduce((n, s) => n + (s.qa.checks || []).filter((c) => c.pass).length, 0);
    const closed = CHAIN.reduce((n, c) => n + c.closed, 0);
    const total = CHAIN.reduce((n, c) => n + c.total, 0);
    if (S.mode === 'run') {
      $('#metaRow').innerHTML = `
        <span class="meta"><b>${ST.length}</b> 站</span>
        <span class="meta"><b>${RUN.elapsed_s}s</b> 全链</span>
        <span class="meta"><b>${checks}</b> 项验收 · <span class="ok">${pass} 过</span></span>
        <span class="meta">交接 <b>${closed}/${total}</b> 闭合</span>
        <span class="meta">退出码 <b>${RUN.exit_code}</b></span>`;
    } else {
      $('#metaRow').innerHTML = `
        <span class="meta"><b>${(S.recipe.plan || []).length}</b> 个工具</span>
        <span class="meta">产线 <b>骨架</b></span>
        <span class="meta">没有 run · 不出交付</span>
        <span class="meta">依据 <b>${esc(S.recipe.evidence)}</b></span>`;
    }
    $('#recipeId').textContent = S.recipe.id;
    $('#crumbRecipe').textContent = S.recipe.id + ' · ' + S.recipe.name;
    const badge = $('#recipeStatus');
    badge.textContent = S.recipe.status === 'verified' ? 'VERIFIED' : 'SKELETON';
    badge.className = 'badge ' + (S.recipe.status === 'verified' ? 'verified' : 'skeleton');
    $('#orderLabel').textContent = S.mode === 'run' ? '订单' : '构想';
    $('#runSentence').textContent = S.mode === 'run' ? RUN.sentence
      : (S.order || (S.recipe.name + ' · ' + (S.recipe.deliverables || []).join(' / ')));
  }
  /* ---------------- 选中工位 ---------------- */
  function selectStation(id) {
    if (S.mode !== 'run') return;
    const s = ST.find((x) => x.id === id);
    if (!s) return;
    S.station = id;
    $$('#stationList button').forEach((b) => {
      const on = b.dataset.id === id;
      b.setAttribute('aria-current', String(on)); b.classList.toggle('is-current', on);
    });
    $$('#flow .station').forEach((b) => {
      const on = b.dataset.id === id;
      b.setAttribute('aria-current', String(on)); b.classList.toggle('is-current', on);
    });
    renderDetail(s);
  }

  function artRow(o, kind) {
    const isIn = kind === 'in';
    const cls = isIn ? (o.closed ? 'closed' : 'open') : '';
    const meta = isIn
      ? (o.closed ? '来自 ' + esc(o.from || '上游') : '未入账')
      : `${kb(o.bytes)} · ${esc(o.sha8 || '—')}`;
    return `<div class="art-row ${cls}" title="${esc(o.path)}">
      <span class="fn">${esc(o.name || base(o.path))}${o.schema ? `<span class="schema">${esc(o.schema)}</span>` : ''}</span>
      <span class="meta2">${meta}</span></div>`;
  }

  function renderDetail(s) {
    const q = s.qa || { checks: [] };
    const fails = (q.checks || []).filter((c) => !c.pass);
    const order = fails.concat((q.checks || []).filter((c) => c.pass));
    const checks = order.slice(0, 6).map((c) => `<div class="qacheck ${c.pass ? '' : 'fail'}">
        <span class="q">${c.pass ? '✓' : '!'}</span>
        <span>${esc(c.check)}</span>
        <span class="v" title="${esc(c.threshold ? '阈值 ' + String(c.threshold) : '')}">${esc(c.value == null ? '' : String(c.value)).slice(0, 22)}</span>
      </div>`).join('');
    const dims = s.dims && s.dims.commercial != null
      ? `<div class="cx mono" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;font-size:9.5px;color:var(--dim)">
           <span>商业 ${s.dims.commercial}</span><span>交接 ${s.dims.handoff}</span><span>工艺 ${s.dims.craft}</span><span>标杆 ${s.dims.benchmark}</span>
           <span style="color:var(--accent2)">均值 ${s.score}</span></div>`
      : '';
    $('#detailId').textContent = s.id + ' · ' + (s.elapsed_s != null ? s.elapsed_s + 's' : '—') + ' · exit ' + s.exit_code;
    $('#detail').innerHTML = `
      ${q.pass === false ? `<div class="banner"><span>!</span><span><b>这一站没过：</b>${esc(fails.map((c) => c.check).join('；'))} —— 真实 run 里保留了这个缺口，界面不替它抹平。</span></div>` : ''}
      <div class="detail-grid">
        <div class="dcol">
          <h4>${esc(s.index)} · ${esc(s.name)}</h4>
          <p class="note">${esc(s.note)}</p>
          <div class="s-tools" style="margin-bottom:8px">${(s.tools || []).map((t) => `<span class="toolchip" title="${esc(t.version)}">${esc(t.name.split(' ')[0])} ${esc(shortVer(t.version))}</span>`).join('')}</div>
          <div class="cx mono" style="font-size:9.5px;color:var(--dim);display:grid;gap:3px">
            <span>AOI · ${esc(s.aoi)} ${esc((AOI.modules.find((m) => m.code === s.aoi) || {}).name || '')}</span>
            <span>${esc(s.started_at || '')}${s.ended_at ? ' → ' + esc(s.ended_at.slice(11, 19)) : ''}</span>
          </div>
          ${dims}
        </div>
        <div class="dcol">
          <h4>入 · ${s.inputs.length}</h4>
          <div class="art">${s.inputs.length ? s.inputs.map((o) => artRow(o, 'in')).join('') : '<div class="art-row"><span class="fn" style="color:var(--dim)">— 产线起点</span></div>'}</div>
        </div>
        <div class="dcol">
          <h4>出 · ${s.outputs.length}</h4>
          <div class="art">${s.outputs.slice(0, 7).map((o) => artRow(o, 'out')).join('')}
            ${s.outputs.length > 7 ? `<div class="art-row"><span class="fn" style="color:var(--dim)">… 另 ${s.outputs.length - 7} 个</span></div>` : ''}</div>
        </div>
      </div>
      <div style="padding:10px 13px 12px;border-top:1px solid var(--line)">
        <h4 style="margin:0 0 6px;font-size:9.5px;letter-spacing:.18em;color:var(--muted);font-weight:500">验收 · ${(q.checks || []).filter((c) => c.pass).length}/${(q.checks || []).length}</h4>
        ${checks || '<div class="art-row"><span class="fn" style="color:var(--dim)">这一站没有 QA 记录</span></div>'}
        ${(q.checks || []).length > 6 ? `<div class="art-row"><span class="fn" style="color:var(--dim)">… 另 ${q.checks.length - 6} 项</span></div>` : ''}
      </div>`;
  }

  /* ---------------- 账本 ---------------- */
  function renderLedger() {
    if (S.mode !== 'run') {
      $('#ledgerSummary').textContent = '骨架 · 无交接';
      $('#ledgerBody').innerHTML = (S.recipe.plan || []).map((p) => `<tr><td>${esc(p.tool)}</td><td>—</td><td class="mono">${esc(p.out)}</td><td class="warn">未实测</td></tr>`).join('');
      return;
    }
    const closed = CHAIN.reduce((n, c) => n + c.closed, 0);
    const total = CHAIN.reduce((n, c) => n + c.total, 0);
    $('#ledgerSummary').textContent = `${closed}/${total} 闭合` + (closed < total ? ` · ${total - closed} 张未入账` : '');
    $('#ledgerBody').innerHTML = ST.map((s) => {
      const c = CHAIN.find((x) => x.to === s.id);
      const full = !c || c.closed === c.total;
      return `<tr data-id="${s.id}" class="${full ? '' : 'gap'}">
        <td>${esc(s.index)} · ${esc(s.zh)}</td>
        <td class="mono">${s.inputs.length}</td>
        <td class="mono">${s.outputs.length}</td>
        <td class="${full ? 'ok' : 'warn'}">${c ? c.closed + '/' + c.total : '— 起点'}</td>
      </tr>`;
    }).join('');
    $$('#ledgerBody tr').forEach((tr) => tr.addEventListener('click', () => { if (tr.dataset.id) selectStation(tr.dataset.id); }));
  }

  /* ---------------- 运行面板 ---------------- */
  function renderRun() {
    const checks = ST.reduce((a, s) => a.concat((s.qa.checks || []).map((c) => ({ ...c, st: s.id }))), []);
    const fails = checks.filter((c) => !c.pass);
    const closed = CHAIN.reduce((n, c) => n + c.closed, 0);
    const total = CHAIN.reduce((n, c) => n + c.total, 0);
    $('#runKv').innerHTML = `
      <dt>run</dt><dd>${esc(RUN.run_id)}</dd>
      <dt>状态</dt><dd>${esc(RUN.status)} · exit ${RUN.exit_code}</dd>
      <dt>全链</dt><dd>${RUN.elapsed_s}s</dd>
      <dt>验收</dt><dd>${checks.length - fails.length}/${checks.length} 过</dd>
      <dt>交接</dt><dd>${closed}/${total} 闭合</dd>`;
    const cover = ST.find((s) => s.id === '05_export')?.outputs.find((o) => o.name.startsWith('cover_9x16'));
    $('#deliv').innerHTML = `<img src="assets/cover_9x16.jpg" alt="成片封面 9:16 占位样片">
      <div><b>三尺寸成片 + 封面</b><span>${cover ? esc(cover.name) + ' · ' + kb(cover.bytes) : 'cover_9x16.jpg'}</span>
      <div style="margin-top:4px"><span class="badge skeleton">占位素材 · 不可交付</span></div></div>`;
    $('#qaMini').innerHTML = fails.length
      ? fails.map((c) => `<div><b>!</b> <span>${esc(c.st)} · ${esc(c.check)} · ${esc(String(c.value))} / ${esc(String(c.threshold || '—'))}</span></div>`).join('')
      : '<div><b>✓</b> 全部通过</div>';
    $('#runNote').innerHTML = S.mode === 'run' ? '' :
      '<p style="margin:0 0 10px;padding:7px 9px;border:1px solid var(--line);border-radius:6px;font-size:10px;color:var(--dim)">下面是 R01 的真实 run，只作参照；当前看的是骨架，没有数字可借。</p>';
    const B = window.XCF_BUILD;
    $('#buildChain').innerHTML = B ? B.steps.map((s) => `<div><b>${esc(s.id)}</b> <span>${esc(s.tool)} → ${esc(s.out)} · ${esc(s.sha)}</span></div>`).join('')
      + `<div><b>${B.pass ? '✓' : '!'}</b> <span>${B.checks} 项检查 · ${B.hard_fail} 硬失败 · ${esc(B.at)}</span></div>`
      : '<div><b>·</b> <span>build.js 未生成</span></div>';
    $('#extLinks').innerHTML = [
      ['AoI M11 预览', AOI.preview],
      ['X-connect Workbench', 'https://xconnect-factory.onrender.com/workbench'],
      ['门户右门（Code）', 'https://www.x-connect.ai/'],
      ['craft-skills 仓库', 'https://github.com/xuliangwang1993-ops/craft-skills'],
    ].map(([n, u]) => `<div><b>↗</b> <a href="${u}" target="_blank" rel="noreferrer">${esc(n)}</a></div>`).join('');
  }

  /* ---------------- 回放 ---------------- */
  function replay() {
    if (S.playing || S.mode !== 'run') return;
    S.playing = true;
    const btn = $('#replayBtn'); btn.textContent = '回放中…'; btn.disabled = true;
    const wires = $$('#flow .wire');
    let i = 0;
    const step = () => {
      if (i >= ST.length) {
        btn.textContent = '回放交接'; btn.disabled = false; S.playing = false;
        const closed = CHAIN.reduce((n, c) => n + c.closed, 0);
        const total = CHAIN.reduce((n, c) => n + c.total, 0);
        toast(`8 站走完 · 交接 ${closed}/${total} 闭合` + (closed < total ? ' · 1 张未入账' : ''));
        return;
      }
      selectStation(ST[i].id);
      const card = $$('#flow .station')[i];
      if (card) card.scrollIntoView({ inline: 'center', block: 'nearest' });
      wires.forEach((w) => w.classList.remove('hot'));
      if (wires[i]) { wires[i].classList.add('hot'); setTimeout(() => wires[i].classList.remove('hot'), 900); }
      i += 1;
      setTimeout(step, 460);
    };
    step();
  }

  /* ---------------- 小助手 ---------------- */
  function scoreRecipe(text, r) {
    const t = text.toLowerCase();
    const hits = [];
    r.keywords.forEach((k) => {
      if (t.includes(String(k).toLowerCase())) hits.push(k);
    });
    const hitsSorted = hits.sort((a, b) => b.length - a.length);
    const weight = hitsSorted.reduce((n, k) => n + (k.length >= 4 ? 2.2 : k.length >= 3 ? 1.6 : 1), 0);
    let score = hitsSorted.length ? Math.min(97, Math.round(24 + weight * 12)) : 8;
    if (r.status === 'verified' && hitsSorted.length) score = Math.min(98, score + 2);
    return { r, score, hits: hitsSorted };
  }
  function match(text) {
    if (!text.trim()) { toast('先说一句要做什么'); return; }
    const ranked = RECIPES.map((r) => scoreRecipe(text, r)).sort((a, b) => b.score - a.score);
    const top = ranked[0];
    $('#matches').innerHTML = ranked.slice(0, 3).map(({ r, score, hits }, i) => `
      <div class="match ${i === 0 ? 'top' : ''}">
        <h4>${esc(r.name)} <code>${r.id}</code><span class="score">${score}%</span></h4>
        <div class="bar"><i style="width:${score}%"></i></div>
        <p class="why">${hits.length ? '命中 <em>' + hits.slice(0, 6).map(esc).join(' / ') + '</em>' : '没有命中词 —— 只是最接近的一条'}</p>
        <p class="ev">${esc(r.evidence)}</p>
        <div class="act">
          <span class="badge ${r.status}">${r.status === 'verified' ? '已实测' : '骨架'}</span>
          <button class="btn ${i === 0 ? 'primary' : ''}" data-apply="${r.id}" style="margin-left:auto">${r.status === 'verified' ? '接到产线' : '看接线骨架'}</button>
        </div>
      </div>`).join('');
    $$('#matches [data-apply]').forEach((b) => b.addEventListener('click', () => applyRecipe(b.dataset.apply, $('#ask').value)));
    if (top.score < 25) toast('没把握 —— 配方表里最像的也只有 ' + top.score + '%');
  }

  function applyRecipe(id, order) {
    const r = RECIPES.find((x) => x.id === id);
    if (!r) return;
    S.recipe = r;
    S.order = r.status === 'verified' ? '' : (order || '');
    S.mode = r.status === 'verified' ? 'run' : 'plan';
    S.view = S.mode === 'run' ? ST : [];
    renderMeta(); renderFlow(); renderLedger(); renderRecipes(); renderRun();
    if (S.mode === 'run') { selectStation(ST[0].id); toast('已接到 R01 · 8 站实测产线'); }
    else {
      $('#detail').innerHTML = `<div class="banner" style="margin:12px"><span>·</span><span><b>${esc(r.name)}</b> 在仓库里只有骨架：${esc(r.evidence)}。这条线只画接线，不出交付，也不借 R01 的数字。</span></div>`;
      $('#detailId').textContent = r.id + ' · plan';
      toast('骨架已展开 · ' + (r.plan || []).length + ' 个工具');
    }
    switchTab('a');
  }

  /* ---------------- 面板切换 ---------------- */
  function switchTab(key) {
    ['a', 's', 'r'].forEach((k) => {
      $('#tab-' + k).setAttribute('aria-selected', String(k === key));
      $('#pane-' + k).classList.toggle('on', k === key);
    });
  }
  /* ---------------- 从素材取色（本地皮肤） ---------------- */
  function hex(r, g, b) { return '#' + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('').toUpperCase(); }
  function mixc(a, b, t) {
    const A = a.replace('#', ''), B = b.replace('#', '');
    const out = [0, 2, 4].map((i) => Math.round(parseInt(A.slice(i, i + 2), 16) * (1 - t) + parseInt(B.slice(i, i + 2), 16) * t));
    return hex(out[0], out[1], out[2]);
  }
  function luma(c) { const h = c.replace('#', ''); return (0.2126 * parseInt(h.slice(0, 2), 16) + 0.7152 * parseInt(h.slice(2, 4), 16) + 0.0722 * parseInt(h.slice(4, 6), 16)) / 255; }
  function sat(c) {
    const h = c.replace('#', ''); const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const l = (mx + mn) / 2;
    if (mx === mn) return 0;
    return l > .5 ? (mx - mn) / (2 - mx - mn) : (mx - mn) / (mx + mn);
  }

  function kmeans(pts, k, iters) {
    const cs = [];
    for (let i = 0; i < k; i++) cs.push(pts[Math.floor((i + 1) * pts.length / (k + 1))].slice(0, 3));
    for (let it = 0; it < iters; it++) {
      const sums = Array.from({ length: k }, () => [0, 0, 0, 0]);
      pts.forEach((p) => {
        let best = 0, bd = Infinity;
        for (let i = 0; i < k; i++) {
          const d = (p[0] - cs[i][0]) ** 2 + (p[1] - cs[i][1]) ** 2 + (p[2] - cs[i][2]) ** 2;
          if (d < bd) { bd = d; best = i; }
        }
        sums[best][0] += p[0]; sums[best][1] += p[1]; sums[best][2] += p[2]; sums[best][3] += 1;
      });
      sums.forEach((s, i) => { if (s[3]) cs[i] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; });
    }
    return cs.map((c) => hex(c[0], c[1], c[2]));
  }

  function skinFromImage(file) {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 72;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, 72, 72);
      const d = ctx.getImageData(0, 0, 72, 72).data;
      const pts = [];
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 200) continue;
        pts.push([d[i], d[i + 1], d[i + 2]]);
      }
      const pal = kmeans(pts, 5, 9).sort((a, b) => luma(a) - luma(b));
      const dark = pal[0], bright = pal[pal.length - 1];
      const accent = pal.slice().sort((a, b) => sat(b) * (1 - Math.abs(luma(b) - .55)) - sat(a) * (1 - Math.abs(luma(a) - .55)))[0];
      const surface = luma(dark) < .015 ? pal[1] : dark;
      const tokens = {
        bg: mixc(surface, '#000000', .56), bg2: mixc(surface, '#000000', .28), surface,
        surface2: mixc(surface, accent, .20), surface3: mixc(surface, accent, .34),
        accent, accent2: bright, text: '#F8FAFC',
        muted: mixc('#F8FAFC', surface, .44), dim: mixc('#F8FAFC', surface, .62),
        ok: '#81C784', warn: '#FFB74D', bad: '#FF5A6E', fn: bright,
      };
      const sk = {
        id: 'local-' + Date.now(), name: file.name.replace(/\.[^.]+$/, '').slice(0, 22), zh: '本地', provenance: 'local',
        badge: 'LOCAL', authentic: false,
        source: { kind: 'file', ref: file.name + ' · ' + (file.size / 1024).toFixed(0) + ' KB', sha256: null,
          note: '浏览器端 k-means 取色，未入库，刷新后不保留' },
        tokens, measured: pal, grain: false,
      };
      S.skins.push(sk);
      renderSkins();
      applySkin(sk.id);
      switchTab('s');
      toast('本地皮肤已上 · ' + pal.join(' '));
      URL.revokeObjectURL(url);
    };
    img.onerror = () => toast('这张图读不了');
    img.src = url;
  }

  /* ---------------- 弹出层 ---------------- */
  function anchorPop(pop, anchor) {
    const r = anchor.getBoundingClientRect();
    pop.style.top = Math.min(innerHeight - 40, r.bottom + 8) + 'px';
    pop.style.right = Math.max(12, innerWidth - r.right) + 'px';
    pop.classList.add('on');
    anchor.setAttribute('aria-expanded', 'true');
  }
  function closePops() {
    ['#aoiPop', '#skinPop'].forEach((s) => { const p = $(s); p.classList.remove('on'); });
    ['#aoiPill', '#skinBtn'].forEach((s) => $(s).setAttribute('aria-expanded', 'false'));
  }
  function aoiPop() {
    const pop = $('#aoiPop');
    const linked = AOI.modules.filter((m) => m.stations.length).length;
    pop.innerHTML = `<h4>AOI 连接</h4>
      <ul>${AOI.endpoints.map((e) => `<li><span>${esc(e)}</span><b>404</b></li>`).join('')}</ul>
      <p class="note">${esc(AOI.probe.verdict)}。模块表 12 个，本页接到 ${linked} 个；点左栏模块可跳到对应工位。</p>
      <p class="note" style="margin-top:8px"><a href="${AOI.preview}" target="_blank" rel="noreferrer">打开 AoI M11 预览 ↗</a></p>`;
  }
  function skinPop() {
    const pop = $('#skinPop');
    pop.innerHTML = `<h4>皮肤 · SKIN</h4>` + S.skins.map((sk) =>
      `<div class="skin" data-quick="${esc(sk.id)}" style="margin-bottom:6px;padding:7px 8px">
        <div class="s1"><b>${esc(sk.name)}</b><span class="badge ${sk.authentic ? 'auth' : ''}">${esc(sk.badge)}</span></div>
        <div class="sw" style="height:8px"><i style="background:${sk.tokens.surface}"></i><i style="background:${sk.tokens.accent}"></i><i style="background:${sk.tokens.accent2}"></i></div>
      </div>`).join('');
    $$('#skinPop [data-quick]').forEach((el) => el.addEventListener('click', () => {
      applySkin(el.dataset.quick); closePops(); toast('皮肤已换');
    }));
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    const params = new URLSearchParams(location.search);
    if (params.get('from') === 'code' || location.hash.includes('door=code')) {
      document.body.classList.add('from-code');
      setTimeout(() => document.body.classList.remove('from-code'), 1200);
    }

    renderSkins();
    applySkin(S.skin, { silent: true });
    renderRail(); renderAOI(); renderRecipes(); renderMeta(); renderFlow(); renderLedger(); renderRun();
    selectStation((location.hash.match(/s=([0-9a-z_]+)/) || [])[1] || ST[0].id);

    // 示例句
    const ex = [
      '给悉尼小锅米线做一支 30 秒宣传短视频，配中英字幕和三个社媒尺寸',
      '做一张门店菜单板，A3 打印，价目要能改',
      '把这份扫描合同做成可搜索的 PDF 和 Word',
    ];
    $('#examples').innerHTML = ex.map((t) => `<button type="button">${esc(t.length > 22 ? t.slice(0, 22) + '…' : t)}</button>`).join('');
    $$('#examples button').forEach((b, i) => b.addEventListener('click', () => { $('#ask').value = ex[i]; match(ex[i]); }));

    // 事件
    $('#matchBtn').addEventListener('click', () => match($('#ask').value));
    $('#ask').addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') match($('#ask').value); });
    ['a', 's', 'r'].forEach((k) => $('#tab-' + k).addEventListener('click', () => switchTab(k)));
    $('#replayBtn').addEventListener('click', replay);
    $('#fitBtn').addEventListener('click', (e) => {
      const on = e.currentTarget.getAttribute('aria-pressed') === 'true';
      e.currentTarget.setAttribute('aria-pressed', String(!on));
      e.currentTarget.textContent = on ? '全览' : '展开';
      $('#flow').dataset.mode = on ? 'full' : 'fit';
    });
    if (innerWidth <= 560) {
      $('#flow').dataset.mode = 'fit';
      $('#fitBtn').setAttribute('aria-pressed', 'true');
      $('#fitBtn').textContent = '展开';
    }
    $('#grainSwitch').addEventListener('click', () => { setGrain(S.grain === 'on' ? 'off' : 'on'); toast('颗粒 ' + (S.grain === 'on' ? '开' : '关')); });
    $('#skinFile').addEventListener('change', (e) => { if (e.target.files[0]) skinFromImage(e.target.files[0]); });
    $('#copyTokens').addEventListener('click', async () => {
      const sk = S.skins.find((x) => x.id === S.skin);
      const css = ':root{\n' + Object.keys(VARMAP).map((k) => `  ${VARMAP[k]}: ${sk.tokens[k]};`).join('\n') + '\n}';
      try { await navigator.clipboard.writeText(css); toast('当前皮肤令牌已复制'); }
      catch { toast('浏览器不给剪贴板，手动抄吧'); }
    });
    $('#assistBtn').addEventListener('click', () => {
      switchTab('a');
      $('.inspector').scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => $('#ask').focus({ preventScroll: true }), 350);
    });
    $('#aoiPill').addEventListener('click', (e) => {
      e.stopPropagation();
      if ($('#aoiPop').classList.contains('on')) { closePops(); return; }
      closePops(); aoiPop(); anchorPop($('#aoiPop'), e.currentTarget);
    });
    $('#skinBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      if ($('#skinPop').classList.contains('on')) { closePops(); return; }
      closePops(); skinPop(); anchorPop($('#skinPop'), e.currentTarget);
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.pop')) closePops();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePops(); });

    // 首屏就把默认句匹配出来，让人看到小助手在干嘛
    match($('#ask').value);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
