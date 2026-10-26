/* X-Connect Factory · 三栏静态界面
   静态数据：site/data/{stations-def,tools,recipes,skins}.js（无任何用户/订单/Pod/运行数据）
   私有数据：登录后从 Supabase 读（factory_orders / factory_pods / factory_runs，RLS 只给本人），见 auth.js */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const DEF = (window.XCF_STATIONS_DEF || {}).stations || [];   // 工位的静态说明（名称/说明/AoI/工具），不含运行结果
  let STATIONS = DEF.slice();
  let CHAIN = [];
  let RUN = {};
  const TOOLS = window.XCF_TOOLS || {};
  const RECIPES = (window.XCF_RECIPES || {}).recipes || [];
  let POD = { pods: [], reconcile: [], probe: {} };
  let ORDERS = [];
  const SKINS = (window.XCF_SKINS || {}).skins || [];
  let BUILD = {};
  let ART = { files: [] };
  /* i18n (site/i18n.js)：zh 是源文本；lang=en 时 tr() 才翻译，zh 下原样返回 */
  const XCI = window.XCI || { lang: () => 'zh', tr: (s) => s, kw: () => [] };
  const tr = (s) => XCI.tr(s);

  /* ---------- 小工具 ---------- */
  const kb = (n) => n == null ? '—' : n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n >= 1024 ? (n / 1024).toFixed(1) + ' KB' : n + ' B';
  const short = (s, n = 10) => (s || '').length > n ? s.slice(0, n - 1) + '…' : s || '';
  const fmtDur = (sec) => sec == null ? '—' : sec < 60 ? sec.toFixed(1) + 's' : Math.floor(sec / 60) + 'm' + String(Math.round(sec % 60)).padStart(2, '0') + 's';
  const statusOf = (st) => {
    if (st.exit_code == null) return 'idle';   // 还没有运行记录
    if (st.exit_code !== 0) return 'bad';
    const qa = st.qa || {};
    if (qa.pass === false) return 'warn';
    if (qa.pass === true) return 'ok';
    return 'idle';
  };

  /* ---------- 左栏：8 工位 ---------- */
  function renderStations() {
    $('#stationList').innerHTML = STATIONS.map((s) => `
      <li><button data-id="${esc(s.id)}">
        <span class="dot" data-s="${statusOf(s)}"></span>
        <span class="idx mono">${esc(s.index)}</span>
        <span class="nm">${esc(s.zh)}<em>${esc(s.name)}</em></span>
        <span class="sec mono">${s.elapsed_s == null ? '—' : s.elapsed_s.toFixed(1) + 's'}</span>
      </button></li>`).join('');
    $$('#stationList button').forEach((b) => b.addEventListener('click', () => selectStation(b.dataset.id, 'flow')));
  }

  /* ---------- 左栏：AoI 能力表 M00–M11（公开架构信息，data/aoi-modules.js；点一行展开，亮起 = 所选工位用到） ---------- */
  const AOI_MODS = (window.XCF_AOI_MODULES || {}).modules || [];
  let aoiOpen = '';
  let aoiStation = '';
  function renderAoi() {
    const list = $('#aoiList');
    if (!list) return;
    const names = {};
    DEF.forEach((s) => { names[s.id] = `<span class="mono">${esc(s.index)}</span> <span>${esc(s.zh)}</span>`; });
    list.innerHTML = AOI_MODS.map((m) => {
      const used = (m.stations || []).includes(aoiStation);
      const open = aoiOpen === m.code;
      return `
      <li class="${used ? 'used' : ''}${open ? ' open' : ''}" data-code="${esc(m.code)}">
        <button type="button" aria-expanded="${open}">
          <span class="mc mono">${esc(m.code)}</span>
          <span class="mn">${esc(m.name)}</span>
          <span class="mw mono" title="施工批次 ${esc(m.wave)}">${esc(m.wave)}</span>
        </button>
        <div class="md"${open ? '' : ' hidden'}>
          <p>${esc(m.role)}</p>
          <p>${esc(m.summary)}</p>
          <p class="mono"><span>施工批次 ${esc(m.wave)}</span>${m.optional ? ' · <span>可选模块</span>' : ''}</p>
          <p><span>接入工位：</span> ${(m.stations || []).length ? (m.stations || []).map((id) => `<span class="stn">${names[id] || esc(id)}</span>`).join(' · ') : '<span>暂无工位接入</span>'}</p>
        </div>
      </li>`;
    }).join('');
    $$('#aoiList li > button').forEach((b) => b.addEventListener('click', () => {
      const code = b.parentElement.dataset.code;
      aoiOpen = aoiOpen === code ? '' : code;
      renderAoi();
    }));
  }

  /* ---------- 中栏：产线卡片 ---------- */
  function renderFlow() {
    $('#flow').innerHTML = STATIONS.map((s, i) => {
      const outs = (s.outputs || []).filter((o) => o.name);
      const first = outs[0];
      const feed = i ? ((CHAIN.find((c) => c.to === s.id) || {}).links || []) : [];
      return `
      <div class="st-card" data-id="${esc(s.id)}" data-s="${statusOf(s)}" tabindex="0" role="button">
        <header>
          <span class="dot" data-s="${statusOf(s)}"></span>
          <span class="idx mono">${esc(s.index)}</span>
          <span class="aoi mono">${esc(s.aoi || '')}</span>
        </header>
        <h4>${esc(s.zh)}</h4>
        <p class="sub">${esc(s.note || s.name)}</p>
        <ul class="tools">${(s.tools || []).slice(0, 3).map((t) => `<li class="mono" title="${esc(t.version || '')}">${esc(t.name)}</li>`).join('')}${(s.tools || []).length > 3 ? `<li class="more mono">+${s.tools.length - 3}</li>` : ''}</ul>
        <div class="out">
          <span class="lbl">出</span>
          <span class="mono name" title="${esc(first ? first.path : '')}">${esc(first ? short(first.name, 22) : '—')}</span>
          <span class="sz mono">${first && first.bytes != null ? kb(first.bytes) : ''}</span>
        </div>
        ${feed.length ? `<div class="feed">${feed.map((l) => `<span class="mono" title="${esc(l.artifact)}">${esc(short(l.artifact, 16))}</span>`).join('')}</div>` : ''}
      </div>
      ${i < STATIONS.length - 1 ? '<div class="arrow" aria-hidden="true">→</div>' : ''}`;
    }).join('');
    $$('#flow .st-card').forEach((c) => {
      c.addEventListener('click', () => selectStation(c.dataset.id, 'flow'));
      c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectStation(c.dataset.id, 'flow'); } });
    });
  }

  /* ---------- 选中工位 ---------- */
  function selectStation(id, tab) {
    const s = STATIONS.find((x) => x.id === id);
    if (!s) return;
    $$('#stationList button').forEach((b) => {
      const on = b.dataset.id === id;
      b.setAttribute('aria-current', String(on));
      b.classList.toggle('on', on);
    });
    $$('#flow .st-card').forEach((c) => c.classList.toggle('on', c.dataset.id === id));
    aoiStation = id; renderAoi();
    renderDetail(s);
    if (tab === 'flow') setTab('flow');
  }

  function renderDetail(s) {
    const qa = s.qa || {};
    const checks = qa.checks || [];
    const outs = (s.outputs || []).filter((o) => o.name);
    const ins = s.inputs || [];
    $('#detailName').textContent = `${s.index} · ${s.zh}`;
    $('#detailBody').innerHTML = `
      <div class="meta-row">
        <span class="chip ${statusOf(s)}">${s.exit_code == null ? 'NO RUN' : qa.pass === true ? 'QA PASS' : qa.pass === false ? 'QA HOLD' : 'EXIT ' + (s.exit_code ?? 0)}</span>
        <span class="chip mono">${esc(s.id)}</span>
        <span class="chip">AoI ${esc(s.aoi || '—')}</span>
        <span class="chip mono">${fmtDur(s.elapsed_s)}</span>
        ${s.score != null ? `<span class="chip">score ${s.score}</span>` : ''}
      </div>
      <p class="note">${esc(s.note || '')}</p>
      <div class="kv">
        <span>入 · ${ins.length}</span>
        <span class="mono">${s.inputs === undefined ? '—' : ins.length ? ins.map((i) => `${esc(short(i.path, 26))}${i.closed === false ? ' <em class="warn">未入账</em>' : ''}`).join('<br>') : '产线起点'}</span>
        <span>出 · ${outs.length}</span>
        <span class="mono">${outs.length ? outs.map((o) => `${esc(short(o.path, 30))} <i>${kb(o.bytes)}</i>${o.schema ? ' <b class="sch">' + esc(o.schema) + '</b>' : ''}`).join('<br>') : '—'}</span>
        <span>QA</span><span>${checks.length ? `${checks.filter((c) => c.pass).length}/${checks.length} 项` : '—'}</span>
        ${checks.filter((c) => !c.pass).length ? '<span>缺</span><span>' + checks.filter((c) => !c.pass).map((c) => `<em class="warn">${esc(c.check)}（实测 ${esc(String(c.value))}，门槛 ${esc(String(c.threshold))}）</em>`).join('<br>') + '</span>' : ''}
        <span>工具</span><span class="mono">${(s.tools || []).map((t) => esc(t.name)).join(' · ') || '—'}</span>
        ${s.started_at ? '<span>起止</span><span class="mono">' + esc(s.started_at.slice(11, 19)) + ' → ' + esc((s.ended_at || '').slice(11, 19)) + '</span>' : ''}
      </div>
      ${s.reasons && s.reasons.craft ? `<p class="why">记分：${esc(s.reasons.craft)}</p>` : ''}`;
  }

  /* ---------- 交接账本 ---------- */
  function renderLedger() {
    const rows = STATIONS.map((s) => {
      const chain = CHAIN.find((c) => c.to === s.id);
      if (!chain) return null;
      const bad = (chain.links || []).filter((l) => !l.closed);
      return { to: s, chain, bad };
    }).filter(Boolean);
    const total = rows.reduce((n, r) => n + r.chain.total, 0);
    const closed = rows.reduce((n, r) => n + r.chain.closed, 0);
    $('#ledgerSummary').textContent = rows.length ? `${closed}/${total} 闭合 · ${total - closed} 张未入账` : '—';
    const gaps = rows.flatMap((r) => r.bad.map((b) => [r.to.id, b.artifact]));
    const note = $('#ledgerNote');
    if (note) {
      const base = '闭合 = 上一站 outputs 里的 sha256 与本站 inputs 记的一致。';
      if (gaps.length === 1 && gaps[0][0] === '07_kb' && gaps[0][1] === 'qa.json' && closed === 16 && total === 17) {
        note.innerHTML = base + '16/17 里那张缺的是 <code>06_qa/qa.json</code>——它没被登记进 06_qa 的 outputs，却被 07_kb 当输入用了。这一条照实标黄，不补写。';
      } else if (gaps.length) {
        note.textContent = base + '未入账的链接照实标黄，不补写。';
      } else {
        note.textContent = base;
      }
    }
    $('#ledgerBody').innerHTML = rows.map((r) => `
      <tr class="${r.bad.length ? 'warn' : ''}" data-id="${esc(r.to.id)}">
        <td class="mono">${esc(r.to.index)}</td>
        <td>${esc(r.to.zh)}</td>
        <td>${esc(r.chain.links.map((l) => `${short(l.artifact, 24)}${l.closed ? ' ✓' : ' ✕'}`).join(' · '))}</td>
        <td class="mono">${r.chain.closed}/${r.chain.total}</td>
        <td class="${r.bad.length ? 'warn' : 'ok'}">${r.bad.length ? '缺 ' + r.bad.map((b) => short(b.artifact, 20)).join(', ') : '全闭合'}</td>
      </tr>`).join('');
    $$('#ledgerBody tr').forEach((tr) => tr.addEventListener('click', () => selectStation(tr.dataset.id, 'flow')));
  }

  function renderOrderRows(o, rec) {
    $('#orderRows').innerHTML = !o ? '<p class="note">还没有订单。</p>' : `
      <div class="kv">
        <span>单号</span><span class="mono">${esc(o.order_id)}</span>
        <span>配方</span><span>${esc(o.recipe)} · ${esc(short(tr(o.sentence), 44))}</span>
        <span>发起</span><span>${esc((o.owner || {}).name || '—')} · ${esc((o.owner || {}).role || '')}</span>
        <span>派到</span><span class="mono">${esc(o.pod_name)}（${esc(o.pod_id)}）</span>
        <span>关单</span><span class="mono">${esc((o.close_policy || {}).who || 'owner')} · ${esc((o.close_policy || {}).note || '')}</span>
        <span>对账</span><span class="mono ${rec && rec.status === 'matched' ? 'ok' : 'warn'}">${rec ? esc(rec.status + ' · 期望 ' + rec.wanted + ' / 实况 ' + rec.live + ' · $' + rec.billable + '/hr') : '未对账'}</span>
      </div>`;
  }

  /* ---------- Pod 派单面板 ---------- */
  function renderPod() {
    const pods = POD.pods || [];
    const probe = POD.probe || {};
    const o = ORDERS[0];
    const live = pods.find((p) => o && (p.id === o.pod_id || p.name === o.pod_name)) || pods[0];
    const rec = (POD.reconcile || [])[0];

    $('#podStatus').innerHTML = !pods.length
      ? `<span class="chip">还没有 Pod</span>`
      : pods.map((p) => `<span class="chip ${p.desiredStatus === 'RUNNING' ? 'ok' : 'warn'}">${esc(p.desiredStatus)} · ${esc(p.name)}</span>`).join('');

    $('#podRows').innerHTML = !live ? '<p class="note">还没有 Pod。在电脑上 <code>RUNPOD_KEY=… python3 build/06_pod.py</code> 拉取后会出现在这里。</p>' : `
      <div class="kv">
        <span>型号</span><span class="mono">${esc(live.gpuCount)}×GPU · ${esc(live.vcpuCount)} vCPU · ${live.memoryInGb} GB RAM · ${esc(live.containerDiskInGb)} GB 盘</span>
        <span>镜像</span><span class="mono" title="${esc(live.imageName)}">${esc(short(live.imageName, 46))}</span>
        <span>地址</span><span class="mono">${esc(live.publicIp || '无公网 IP')} · ${esc((live.ports || []).join(' '))}</span>
        <span>开单</span><span class="mono">${esc((live.lastStatusChange || '').slice(0, 44))}</span>
        <span>计费</span><span class="mono">$${live.costPerHr}/hr · RunPod 已记 $${live.billedTotal ?? (live.billing || []).reduce((n, b) => n + (b.amount || 0), 0)} · 我们估约 $${live.burnSinceCreated}</span>
        ${live.volumeInGb ? `<span>卷</span><span class="mono">${esc(live.volumeMountPath)} · ${live.volumeInGb} GB</span>` : ''}
      </div>`;

    renderOrderRows(o, rec);

    $('#podMeta').textContent = probe.generated_at || '';
    const alive = live && live.desiredStatus === 'RUNNING';
    const delivered = STATIONS.every((s) => (s.qa || {}).pass !== false);
    const btn = $('#closeBtn');
    btn.disabled = !(alive && delivered);
    $('#closeHint').textContent = !alive ? 'pod 没在跑'
      : !delivered ? '产线还有 QA 没过，先不许关单'
      : '交付条件已满足；按 close_policy 由发起人关';
  }

  /* ---------- 关单：静态站只记账，真停机走 build/06_pod.py --do stop ---------- */
  function closeOrder() {
    const btn = $('#closeBtn');
    const o = ORDERS[0];
    const pods = POD.pods || [];
    const target = o ? (pods.find((p) => p.id === o.pod_id) || pods[0]) : pods[0];
    btn.disabled = true;
    btn.textContent = '已记账 · 待关';
    $('#closeHint').innerHTML = '发起人已申请关单；静态站不碰 RunPod key，真停机在电脑上跑：<code>RUNPOD_KEY=… python3 build/06_pod.py --do stop ' + esc(target ? target.id : '<podId>') + '</code>';
  }

  /* ---------- 右栏：小助手（配方匹配） ---------- */
  function matchRecipe(text) {
    const t = (text || '').toLowerCase();
    return RECIPES.map((r) => {
      const en = XCI.lang() === 'en';
      const hits = (r.keywords || []).filter((k) => t.includes(String(k).toLowerCase()) || (en && XCI.kw(k).some((a) => t.includes(a))));
      const weight = hits.reduce((n, k) => n + (k.length >= 4 ? 2.2 : k.length >= 3 ? 1.6 : 1), 0);
      let score = hits.length ? Math.min(97, Math.round(24 + weight * 12)) : 8;
      if (r.status === 'verified' && hits.length) score = Math.min(98, score + 2);
      return { r, score, hits };
    }).sort((a, b) => b.score - a.score);
  }

  /* 配方的「实测证据」不再写死在公开文件里：用登录用户自己的 run 现算 */
  function recEvidence(r) {
    if (r.evidence) return r.evidence;
    if (RUN.id && RUN.recipe === r.id) { const n = (RUN.stations || []).length; return `runs/${RUN.id} · ${n}/${n} 站 · ${RUN.elapsed_s}s · exit ${RUN.exit_code}`; }
    return '';
  }

  function renderMatch(text) {
    const ranked = matchRecipe(text).slice(0, 3);
    $('#matchResult').innerHTML = ranked.map(({ r, score, hits }, i) => `
      <div class="m ${i === 0 ? 'top' : ''}">
        <b>${esc(r.name)}</b> <span class="mono muted">${esc(r.id)}</span> <span class="hits" style="float:right">${score}%</span>
        <div class="ev">${hits.length ? '命中 ' + hits.map(esc).join(' / ') : '没有命中词，只给出最接近的一条'}</div>
        <div class="ev">${esc(recEvidence(r))}</div>
        <div style="margin-top:7px"><span class="chip ${r.status === 'verified' ? 'ok' : 'warn'}">${r.status === 'verified' ? '已实测' : '骨架'}</span>
        <button class="btn sm" data-r="${esc(r.id)}" style="margin-left:6px">派到 pod</button></div>
      </div>`).join('');
    $$('#matchResult [data-r]').forEach((b) => b.addEventListener('click', () => previewOrder(b.dataset.r)));
  }

  function previewOrder(rid) {
    const r = RECIPES.find((x) => x.id === rid);
    const o = ORDERS[0];
    const pods = POD.pods || [];
    const pod = pods.find((p) => o && p.id === o.pod_id) || pods[0];
    $('#orderPreview').textContent = JSON.stringify({
      order_id: o ? o.order_id : 'ord-' + Date.now(),
      recipe: rid, recipe_name: r ? r.name : '',
      run_id: RUN.id,
      owner: (o && o.owner) || { name: '本页发起人', role: 'owner' },
      dispatch_to: pod ? { id: pod.id, name: pod.name, cost_per_hr: pod.costPerHr } : null,
      deliverables: (r && r.deliverables) || [],
      close_policy: (o && o.close_policy) || { on: 'delivered', who: 'owner' },
      status: 'draft',
      note: '静态站不落库；真派单在电脑上 build/06_pod.py'
    }, null, 2);
  }

  /* ---------- 新客户任务流：本地预览，不创建真实订单 ---------- */
  const orderDraft = { recipe: null, kind: 'simple', stage: 'brief' };
  const orderInput = () => $('#orderAsk');
  function orderStage(stage) {
    orderDraft.stage = stage;
    const active = { brief: 'brief', quote: 'quote', authorize: 'authorize', produce: 'produce', deliver: 'deliver' }[stage];
    $$('.orderSteps li').forEach((li) => li.classList.toggle('on', li.dataset.orderStep === active));
  }
  function orderPlanNodes() {
    const r = orderDraft.recipe;
    const deliverables = (r.deliverables || []).map(esc).join('、') || '按需求确认交付物';
    if (orderDraft.kind === 'simple') return [
      ['免费代表样品', '先验证方向和格式；样品范围以服务端确认为准。', 'PREVIEW'],
      ['完整成品 · 固定计件', deliverables + '。验收通过后才进入付款交付。', 'PIECE'],
    ];
    return [
      ['节点快照 · 先校准', '小助手拆工序，提供一个代表节点和后续预算，不直接跑完整长链。', 'SNAPSHOT'],
      ['节点生产 · 逐次预定', '每次只授权当前节点与最高预算；通过、修改或暂停后再走下一节点。', 'NODE'],
      ['总装验收 · 独立核对', '交付：' + deliverables + '。生产完成不等于验收通过。', 'VERIFY'],
    ];
  }
  function renderOrderPlan() {
    const r = orderDraft.recipe;
    if (!r) return;
    const nodes = orderPlanNodes();
    const isLong = orderDraft.kind === 'long';
    $('#orderPlan').innerHTML = `
      <h2 class="planTitle">${esc(r.name)}</h2>
      <div class="planMeta">${esc(r.id)} · ${isLong ? '节点快照 + 逐节点预定' : '先试做 + 固定计件'} · 本地规则匹配，未调模型</div>
      <ol class="planNodes">${nodes.map((n, i) => `<li><span class="planNodeState">${n[2]}</span><b>${i + 1}. ${esc(n[0])}</b><p>${esc(n[1])}</p></li>`).join('')}</ol>
      <div class="planTotal"><b>${isLong ? '逐节点报价，设置预算上限' : '完整交付前确认固定价'}</b><p class="note">价格、预计耗时与可用资源需由服务端按需求返回；本页不虚构报价。</p></div>
      <button class="btn planAction" id="orderAuthorizeBtn" type="button">${isLong ? '预定首个节点快照' : '申请免费代表样品'}</button>
      <button class="btn planAction secondary" id="orderEditBtn" type="button">返回修改需求</button>`;
    orderStage('quote');
    $('#orderAuthorizeBtn').addEventListener('click', () => {
      orderStage('authorize');
      $('#orderPlan').innerHTML = `<h2 class="planTitle">${isLong ? '节点授权待确认' : '试做申请待提交'}</h2>
        <div class="planTotal">${isLong ? '先确认节点、预算上限、可调用工具与验收条件，再启动生产。' : '先确认样品范围，再生成预览；完整成品不会自动扣费。'}</div>
        <p class="note">当前为前端流程预览：尚未创建订单、扣款或启动 Pod。接入服务端后，这一步必须绑定 order_id、节点、报价版本和明确的用户确认。</p>
        <a class="btn planAction" href="#authGate">登录以继续</a>
        <button class="btn planAction secondary" id="orderBackPlan" type="button">返回方案</button>`;
      $('#orderBackPlan').addEventListener('click', renderOrderPlan);
    });
    $('#orderEditBtn').addEventListener('click', () => { orderStage('brief'); orderInput().focus(); });
  }
  function initAssistantTools() {
    const host = $('#assistantTools'), data = window.XCF_ASSISTANT_TOOLS;
    if (!host || !data) return;
    host.innerHTML = (data.tools || []).map(t => `<div class="mcpTool"><span class="chip ok">MCP 已握手</span><b>${esc(t.name)}</b><small>${esc(t.description)}</small></div>`).join('') +
      `<p class="note">${Object.keys(data.planned_adapters || {}).length} 类写入/GPU/联网工具仍为待验收适配器，未注册为可执行工具。</p>`;
  }
  function initOrderFlow() {
    const input = orderInput();
    if (!input) return;
    $$('[data-order-example]').forEach((b) => b.addEventListener('click', () => {
      input.value = b.dataset.orderExample;
      input.focus();
    }));
    $$('input[name="taskKind"]').forEach((r) => r.addEventListener('change', () => {
      orderDraft.kind = r.value;
      if (orderDraft.recipe) renderOrderPlan();
    }));
    $('#planOrderBtn').addEventListener('click', () => {
      const text = input.value.trim();
      if (!text) { input.setCustomValidity('请先写下想做的任务'); input.reportValidity(); return; }
      input.setCustomValidity('');
      orderDraft.recipe = matchRecipe(text)[0].r;
      orderDraft.kind = $('input[name="taskKind"]:checked').value;
      renderOrderPlan();
    });
    input.addEventListener('input', () => input.setCustomValidity(''));
  }

  /* ---------- 右栏：皮肤 ---------- */
  function renderSkins() {
    $('#skinList').innerHTML = SKINS.map((sk) => {
      const t = sk.tokens || {};
      return `<div class="skin" data-id="${esc(sk.id)}">
        <div class="row"><b>${esc(sk.name)}</b><span class="chip ${sk.authentic ? 'ok' : ''}">${sk.authentic ? 'AUTHENTIC' : 'SPEC'}</span></div>
        <div class="sws">${['bg', 'surface', 'accent', 'accent2', 'ok'].map((k) => `<i style="background:${t[k] || '#333'}" title="${k} ${t[k] || ''}"></i>`).join('')}</div>
        <div class="mono muted" style="font-size:10.5px">${esc((sk.source || {}).ref || '')}${(sk.source || {}).sha256 ? ' · ' + esc(String(sk.source.sha256).slice(0, 8)) : ''}</div>
      </div>`;
    }).join('');
    $$('#skinList .skin').forEach((c) => c.addEventListener('click', () => applySkin(c.dataset.id)));
  }

  function applySkin(id) {
    const sk = SKINS.find((x) => x.id === id);
    if (!sk) return;
    const t = sk.tokens || {};
    const map = { bg: '--bg', surface: '--surface', accent: '--accent', accent2: '--accent2',
                  text: '--text', ok: '--ok', warn: '--warn', bad: '--bad' };
    let st = $('#skinVars');
    if (!st) { st = document.createElement('style'); st.id = 'skinVars'; document.head.appendChild(st); }
    st.textContent = ':root{' + Object.keys(map).filter((k) => t[k]).map((k) => `${map[k]}:${t[k]}`).join(';') + '}';
    $$('#skinList .skin').forEach((c) => c.classList.toggle('on', c.dataset.id === id));
    $('#skinProv').textContent = JSON.stringify(sk.source || {}, null, 2);
  }

  /* ---------- 右栏：运行 ---------- */
  function renderRun() {
    $('#runList').innerHTML = `
      <div class="kv">
        <span>run</span><span class="mono">${esc(RUN.id || '—')}</span>
        <span>状态</span><span class="mono ${RUN.exit_code == null ? '' : RUN.exit_code === 0 ? 'ok' : 'bad'}">${esc(RUN.status || '—')} · exit ${RUN.exit_code ?? '—'}</span>
        <span>全链</span><span class="mono">${fmtDur(RUN.elapsed_s)}</span>
        <span>配方</span><span>${esc(RUN.sentence || '—')}</span>
        <span>构建</span><span class="mono">${BUILD.pass === undefined ? '—' : BUILD.pass ? '✓ ' + (BUILD.checks ?? '—') + ' 项检查通过' : '✗ 构建失败'}</span>
        <span>产物</span><span class="mono">${ART.files && ART.files.length ? ART.files.length + ' 个文件 · 内联 ' + ART.inlined : '—'}</span>
        <span>生成</span><span class="mono">${esc(BUILD.at || '')}</span>
      </div>
      <div class="mini">${(BUILD.steps || []).map((s, i) => `${i + 1}. ${esc(s)}`).join('\n') || (RUN.id ? '（构建链未记录）' : '还没有运行记录')}</div>`;
  }

  /* ---------- Tab（中栏 / 右栏各自一组，互不干扰） ---------- */
  function setTab(tab) {
    const scope = ['flow', 'pod', 'ledger'].includes(tab) ? '.center' : '.side';
    $$(scope + ' .tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === tab));
    $$(scope + ' .tabBtn').forEach((b) => {
      const on = b.dataset.tab === tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
  }

  /* ---------- 启动 ---------- */
  const podLive = (p) => p.live_status || p.desiredStatus;
  let ask = null, askZh = '', askShown = '';
  const firstChipQ = () => { const b = document.querySelector('#askInput').closest('.tab').querySelector('.chips button[data-q]'); return b ? b.dataset.q : ''; };

  /* ---------- 私有数据：从 Supabase 读（RLS 只给本人），读不到就是空 ---------- */
  function mapPod(r) {
    return { id: r.pod_id, name: r.name, desiredStatus: r.live_status, publicIp: r.public_ip || '', ports: r.ports || [],
      gpuCount: r.gpu_count, vcpuCount: r.vcpu_count, memoryInGb: r.memory_gb, containerDiskInGb: r.container_disk_gb,
      volumeInGb: r.volume_gb, volumeMountPath: r.volume_mount_path, costPerHr: r.cost_per_hr, burnSinceCreated: r.burn_since_created,
      billedTotal: r.billed_total, billing: r.billing || [], imageName: r.image_name, lastStatusChange: r.last_status_change };
  }
  let privEnKeys = [];
  function applyPrivateI18n(rows) {
    if (privEnKeys.length) XCI.drop && XCI.drop(privEnKeys);    // 换账号 / 退出：先清掉上一位的译文
    const m = {};
    (rows || []).forEach((r) => { if (r && r.i18n_en) Object.assign(m, r.i18n_en); });
    privEnKeys = Object.keys(m);
    if (privEnKeys.length && XCI.add) XCI.add(m);
  }
  function applyPrivate(orders, pods, run) {
    applyPrivateI18n([].concat(orders || [], run ? [run] : []));
    ORDERS = (orders || []).map((r) => ({ order_id: r.order_id, run_id: r.run_id, recipe: r.recipe, sentence: r.sentence,
      deliverables: r.deliverables || [], owner: r.owner || {}, pod_id: r.pod_id, pod_name: r.pod_name, desired_status: r.desired_status,
      dispatch: r.dispatch, close_policy: r.close_policy, status: r.status, opened_at: r.opened_at }));
    const mp = (pods || []).map(mapPod).sort((a, b) => (podLive(b) === 'RUNNING') - (podLive(a) === 'RUNNING'));
    POD = { pods: mp, reconcile: (orders || []).map((r) => r.reconcile).filter(Boolean), probe: {} };
    if (run) {
      const sts = Array.isArray(run.stations) && run.stations.length ? run.stations : DEF;
      STATIONS = sts;
      CHAIN = run.chain || [];
      RUN = { id: run.run_id, recipe: run.recipe, sentence: run.sentence || '', status: run.status, exit_code: run.exit_code, elapsed_s: run.elapsed_s,
        stations: sts.map((x) => x.id), chain_closed: run.chain_closed, chain_total: run.chain_total };
      BUILD = run.build || {};
      ART = run.artifacts || { files: [] };
    } else { STATIONS = DEF.slice(); CHAIN = []; RUN = {}; BUILD = {}; ART = { files: [] }; }
  }
  const clearPrivate = () => applyPrivate([], [], null);

  function renderPrivate() {
    renderStations();
    renderFlow();
    renderLedger();
    renderPod();
    renderRun();
    const first = STATIONS.find((s) => (s.qa || {}).pass === false) || STATIONS[0];
    if (first) selectStation(first.id, 'flow');
    setTab('flow');   // 新订单流在首屏；原助手改为右侧配方诊断
    // 顶栏 pill：只数登录用户自己的 pod，且只数实况为 RUNNING 的
    const running = (POD.pods || []).filter((p) => podLive(p) === 'RUNNING').length;
    $('#podPill').textContent = `POD · ${running} RUNNING`;
    $('#runPill').textContent = `RUN · ${fmtDur(RUN.elapsed_s)}`;
    $('#mobileRunLink').hidden = document.body.dataset.auth !== 'in';
    $('#mobileRunStat').textContent = `${running} Pod · RUN ${fmtDur(RUN.elapsed_s)}`;
    $('#crumbRun').textContent = RUN.id || '—';
    $('#genAt').textContent = BUILD.at ? `生成 ${BUILD.at}` : '';
    // 小助手：默认填这位用户最近那句话；没有就用第一个示例
    const def = RUN.sentence || firstChipQ();
    askZh = def; askShown = tr(def); ask.value = askShown; renderMatch(ask.value);
    previewOrder('R01');
  }

  let loadSeq = 0;
  async function loadPrivate(session) {
    const seq = ++loadSeq;
    if (!session || !session.user) { clearPrivate(); renderPrivate(); return; }
    const c = window.XCAuth.client;
    const uid = session.user.id;
    try {
      const [o, p, r] = await Promise.all([
        c.from('factory_orders').select('*').eq('user_id', uid).order('opened_at', { ascending: false, nullsFirst: false }),
        c.from('factory_pods').select('*').eq('user_id', uid),
        c.from('factory_runs').select('*').eq('user_id', uid).order('generated_at', { ascending: false, nullsFirst: false }).limit(1),
      ]);
      if (seq !== loadSeq) return;          // 期间换了账号/退出了
      const err = o.error || p.error || r.error;
      if (err) throw err;
      applyPrivate(o.data, p.data, (r.data || [])[0] || null);
      renderPrivate();
    } catch (e) {
      if (seq !== loadSeq) return;
      console.warn('factory data load failed', e && e.message);
      clearPrivate(); renderPrivate();
      $('#genAt').textContent = '数据读取失败，请刷新或重新登录';
    }
  }

  /* ---------- 启动 ---------- */
  function boot() {
    initAssistantTools();
    initOrderFlow();
    renderSkins();
    renderAoi();
    $$('.center .tabBtn, .side .tabBtn').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
    $('#closeBtn').addEventListener('click', closeOrder);

    $('#toolCount').textContent = `${TOOLS.count ?? '—'} 个底层工具 · 本机可跑 ${TOOLS.local_count ?? '—'}`;
    $('#recipeSelect').innerHTML = RECIPES.map((r) => `<option value="${esc(r.id)}">${esc(r.id)} · ${esc(r.name)}</option>`).join('');
    $('#recipeSelect').addEventListener('change', (e) => {
      const r = RECIPES.find((x) => x.id === e.target.value);
      if (r) $('#recipeNote').textContent = recEvidence(r);
    });

    ask = $('#askInput');
    $('#matchBtn').addEventListener('click', () => renderMatch(ask.value));
    ask.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) renderMatch(ask.value); });
    $('#askInput').closest('.tab').querySelectorAll('.chips button').forEach((b) => b.addEventListener('click', () => { askZh = b.dataset.q; askShown = tr(askZh); ask.value = askShown; renderMatch(ask.value); }));
    document.addEventListener('xc:lang', () => {
      renderOrderRows(ORDERS[0], (POD.reconcile || [])[0]);   // 订单句子被 short() 截断过，要从源头重画
      if (ask.value === askShown) { askShown = tr(askZh); ask.value = askShown; }   // 用户没改过才跟着换
      renderMatch(ask.value);
    });

    // 先画一遍「空」的（无任何用户数据），登录态来了再换成本人的数据
    clearPrivate(); renderPrivate();
    document.addEventListener('xcf:session', (e) => loadPrivate(e.detail && e.detail.session));
    if (window.XCAuth && window.XCAuth.session()) loadPrivate(window.XCAuth.session());

    // 皮肤
    if (SKINS.length) applySkin(SKINS[0].id);
    $('#copyTokens').addEventListener('click', async () => {
      const sk = SKINS.find((x) => x.id === (window.__skin || SKINS[0].id)) || SKINS[0];
      try { await navigator.clipboard.writeText(JSON.stringify(sk.tokens || {}, null, 2)); $('#copyTokens').textContent = '已复制'; } catch { $('#copyTokens').textContent = '复制失败'; }
      setTimeout(() => { $('#copyTokens').textContent = '复制 CSS 变量'; }, 1600);
    });
    const grain = localStorage.getItem('xcf-grain');
    if (grain === 'on') document.body.dataset.grain = 'on';
    $('#grainBtn').setAttribute('aria-pressed', String(grain === 'on'));
    $('#grainBtn').addEventListener('click', () => {
      const on = document.body.dataset.grain !== 'on';
      document.body.dataset.grain = on ? 'on' : '';
      localStorage.setItem('xcf-grain', on ? 'on' : 'off');
      $('#grainBtn').setAttribute('aria-pressed', String(on));
    });
    const fi = $('#skinFile');
    if (fi) fi.addEventListener('change', () => { if (fi.files && fi.files[0]) extractLocal(fi.files[0]); });
  }

  /* ---------- 从自己的图取色（LOCAL） ---------- */
  function extractLocal(file) {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 72;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, 72, 72);
      const d = ctx.getImageData(0, 0, 72, 72).data;
      const pts = [];
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) pts.push([d[i], d[i + 1], d[i + 2]]);
      const pal = kmeans(pts, 5, 9).sort((a, b) => lum(a) - lum(b));
      const hex = (c) => '#' + c.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('').toUpperCase();
      const dark = pal[0], accent = pal[2] || pal[pal.length - 1], bright = pal[pal.length - 1];
      const sk = {
        id: 'local-' + Date.now(), name: file.name.replace(/\.[^.]+$/, '').slice(0, 20) || '本地', authentic: false,
        source: { ref: file.name, sha256: null, note: '浏览器端 k-means 取色，未入库，刷新不保留' },
        tokens: { bg: hex(dark), surface: hex(pal[1] || dark), accent: hex(accent), accent2: hex(bright), ok: '#81C784' }
      };
      SKINS.push(sk);
      renderSkins();
      applySkin(sk.id);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }
  function kmeans(pts, k, iters) {
    const cs = [];
    for (let i = 0; i < k; i++) cs.push(pts[Math.floor((i + 1) * pts.length / (k + 1))].slice());
    for (let t = 0; t < iters; t++) {
      const sums = Array.from({ length: k }, () => [0, 0, 0, 0]);
      pts.forEach((p) => {
        let best = 0, bd = Infinity;
        for (let i = 0; i < k; i++) { const d = (p[0] - cs[i][0]) ** 2 + (p[1] - cs[i][1]) ** 2 + (p[2] - cs[i][2]) ** 2; if (d < bd) { bd = d; best = i; } }
        const s = sums[best]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3] += 1;
      });
      sums.forEach((s, i) => { if (s[3]) cs[i] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; });
    }
    return cs;
  }
  const lum = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
