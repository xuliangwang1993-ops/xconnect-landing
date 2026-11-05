/* ===== AoI 树状展示 · 渲染 =====
   结构：树干 AoI → 12 主枝（施工模块 / 能力域）→ 枝头细枝（关键点 / 工具）
   3D→2D 投影沿用 M11 的关节与扇形算法，坐标、标签防重叠都对齐原式。 */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const TREES = window.XCF_TREES;
  if (!TREES) { console.error('XCF_TREES missing'); return; }
  /* i18n (site/i18n.js)：zh 是源文本；lang=en 时 tr() 才翻译，zh 下原样返回 */
  const XCI = window.XCI || { lang: () => 'zh', tr: (s) => s };
  const tr = (s) => XCI.tr(s);
  /* 品牌名固定写作 AoI：CSS 里标题/节点标签有 text-transform: uppercase，用 .aoi-name 单独还原，避免显示成 AOI */
  const brand = (h) => String(h).replace(/AoI/g, '<span class="aoi-name">AoI</span>');
  // 节点标签：英文下优先用数据里现成的 title_en（GitHub 工具），否则查字典
  const nodeLabel = (e) => (XCI.lang() === 'en' && e.title_en) ? e.title_en : tr(e.label_zh);

  const C = {
    control: '#FFD27A', trunk: '#DCEFFF', fn: '#38F4FF', tech: '#A45CFF',
    danger: '#FF5A6E', stale: '#8C95AA', recipe: '#FFF0C8',
  };
  const STATE = {
    verified:   { label: '已验证', glyph: '\u2713', suffix: '状态 已验证' },
    unverified: { label: '未验证', glyph: '\u25C7', suffix: '状态 未验证，尚无通过证据' },
    potential:  { label: '潜在',   glyph: '\u25CB', suffix: '状态 潜在，未运行验证' },
    blocked:    { label: '阻塞',   glyph: '\u2D57', suffix: '状态 阻塞' },
    stale:      { label: '已过期', glyph: '\u23F1', suffix: '状态 已过期，需要复验' },
  };
  const RISK_CN = { read: '只读', write: '写入', destructive: '破坏性' };
  const RISK_C = { read: C.fn, write: C.tech, destructive: C.danger };
  const LEAF_CN = { capability: '能力', interface: '接口', guard: '守护规则', scenario: '验收场景' };
  const LEAF_C = { capability: '#38F4FF', interface: '#A45CFF', guard: '#FF8A5B', scenario: '#7CFFB2' };

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hash = (str) => { let r = 2166136261; for (let i = 0; i < str.length; i++) { r ^= str.charCodeAt(i); r = Math.imul(r, 16777619) >>> 0; } return r >>> 0; };
  const rnd = (seed) => { let r = seed >>> 0; return () => { r = (r + 1831565813) >>> 0; let u = r; u = Math.imul(u ^ (u >>> 15), u | 1); u ^= u + Math.imul(u ^ (u >>> 7), u | 61); return ((u ^ (u >>> 14)) >>> 0) / 4294967296; }; };

  const tsState = (t) => (t.remote_only || t.optional) ? 'potential' : (t.default_enabled ? 'verified' : 'unverified');
  const tlState = (t) => (t.default_enabled ? 'verified' : (((t.gating || {}).feature_flags || []).length ? 'potential' : 'unverified'));

  const K = { jointLow: 0.3, jointHigh: 0.92, Hi: 76, qh: 1.5, span: 150, td: 17, decay: 0.72, twist: 1.35, radDecay: 0.62, rad0: 0.8 };

  const st = {
    key: 'aoi', model: null, skel: null,
    selected: null,
    layers: { control: true, function: true, technical: true },
    zoom: 1, tab: 'overview', w: 0, h: 0, stats: null,
  };

  /* ---------- 模型 ---------- */
  function buildModel(tree) {
    const nodes = [], edges = [];
    const rootId = 'service:' + tree.root.id;
    nodes.push({ id: rootId, kind: 'service', label: tr(tree.root.label_zh), state: 'unverified', layer: 'control', tree, entity: tree.root });
    tree.toolsets.forEach((ts) => {
      const tsId = ts.uuid || ts.id;
      nodes.push({ id: tsId, kind: 'toolset', label: tr(ts.label_zh), state: tsState(ts), layer: 'control', tree, entity: ts, parentId: rootId });
      edges.push({ from: rootId, to: tsId });
      (ts.tools || []).forEach((tl) => {
        const tlId = tl.uuid || tl.id || (tsId + ':' + tl.name);
        nodes.push({ id: tlId, kind: 'tool', label: nodeLabel(tl), state: tlState(tl), layer: tl.risk === 'read' ? 'function' : 'technical', tree, entity: tl, parentId: tsId });
        edges.push({ from: tsId, to: tlId });
      });
    });
    return { nodes, edges };
  }

  /* ---------- 骨架：主干关节 + 主枝 + 枝头细枝（3D） ---------- */
  function buildSkeleton(model) {
    const children = new Map(), parents = new Map();
    const stable = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
    model.nodes.forEach((n) => {
      if (!n.parentId) return;
      parents.set(n.id, n.parentId);
      if (!children.has(n.parentId)) children.set(n.parentId, []);
      children.get(n.parentId).push(n.id);
    });
    children.forEach((v) => v.sort(stable));
    const rootId = model.nodes.find((n) => n.kind === 'service').id;
    const limbs = (children.get(rootId) || []).slice();

    // 关节沿主干等距（低位 → 高位），保持左右交替
    const joints = new Map();
    limbs.forEach((id, i) => {
      const u = K.jointLow + (K.jointHigh - K.jointLow) * (limbs.length <= 1 ? 0.5 : i / (limbs.length - 1));
      const t = Math.sin(2 * Math.PI * u);
      joints.set(id, { u, pos: { x: K.twist * 0.35 * t, y: K.Hi * u, z: K.twist * t } });
    });

    const depthOf = (id) => { let d = 1, c = id; while (parents.get(c)) { c = parents.get(c); d++; if (d > 9) break; } return d; };
    const pos = new Map(), azOf = new Map();
    const elOf = (depth, jitter) => clamp(50 - 3 * (depth - 1) + jitter * 8, 30, 66) * Math.PI / 180;
    const lenOf = (depth) => K.td * Math.pow(K.decay, Math.max(0, depth - 1));

    limbs.forEach((id) => {
      const j = joints.get(id);
      const az = (rnd(hash(id + ':az'))() * 2 - 1) * 58 * Math.PI / 180;
      const el = elOf(1, rnd(hash(id + ':el'))() * 2 - 1) + (j.u - 0.6) * 12 * Math.PI / 180;
      const len = K.td * (2.6 - 1.1 * ((j.u - K.jointLow) / (K.jointHigh - K.jointLow)));
      const v = { x: Math.cos(az) * Math.cos(el), y: Math.sin(el), z: Math.sin(az) * Math.cos(el) };
      pos.set(id, { x: j.pos.x + len * v.x, y: j.pos.y + len * v.y, z: j.pos.z + len * v.z });
      azOf.set(id, az);
    });

    const walk = (pid, depth, from) => {
      (children.get(pid) || []).forEach((cid) => {
        const spread = (rnd(hash(cid + ':az'))() * 2 - 1) * 70 * Math.PI / 180;
        const base = azOf.get(pid) || 0;
        const az = base + spread;
        const el = elOf(depth, rnd(hash(cid + ':el'))() * 2 - 1);
        const len = lenOf(depth) * (1.1 + 0.6 * rnd(hash(cid + ':l'))());
        const v = { x: Math.cos(az) * Math.cos(el), y: Math.sin(el), z: Math.sin(az) * Math.cos(el) };
        pos.set(cid, { x: from.x + len * v.x, y: from.y + len * v.y, z: from.z + len * v.z });
        azOf.set(cid, az);
        walk(cid, depth + 1, pos.get(cid));
      });
    };
    limbs.forEach((id) => walk(id, 2, pos.get(id)));

    // 根（service）的投影位置：主干底，供 service→toolset 的 12 条主枝使用
    pos.set(rootId, { x: 0, y: 0, z: 0 });

    const branches = [];
    model.edges.forEach((e) => {
      const to = pos.get(e.to), from = pos.get(e.from);
      if (!to || !from) return;
      const node = model.nodes.find((n) => n.id === e.to);
      const depth = depthOf(e.to);
      branches.push({
        childId: e.to, parentId: e.from, from, to, depth,
        radius: K.rad0 * Math.pow(K.radDecay, Math.max(0, depth - 1)),
        glow: node.state === 'verified', state: node.state, layer: node.layer,
      });
    });
    return { joints, limbs, pos, branches };
  }

  /* ---------- 2D 投影 ---------- */
  function project2d(skel, w, h, zoom = 1) {
    const pad = 30;
    const m = clamp(zoom, 0.2, 4);
    const limbIdx = new Map(skel.limbs.map((id, i) => [id, i]));
    const kids = new Map();
    skel.branches.forEach((b) => { if (!kids.has(b.parentId)) kids.set(b.parentId, []); kids.get(b.parentId).push(b.childId); });
    kids.forEach((v) => v.sort((a, b) => (a < b ? -1 : 1)));

    // 关节：12 根主枝从主干等距抽出，先得到关节点的 x/y（屏幕坐标）
    const yLo = Math.round(h * 0.34), yHi = Math.round(h * 0.62);   // 关节带
    const jointY = new Map();
    const n = skel.limbs.length;
    skel.limbs.forEach((id, i) => {
      const t = n <= 1 ? 0.5 : i / (n - 1);
      jointY.set(id, yLo + (yHi - yLo) * t);
    });
    const trunkBottom = h - pad, trunkTop = Math.round(h * 0.2);

    // 分枝屏幕位置：深度 1 从关节扇出，深度 ≥2 顺着父枝生长
    const pt = new Map();
    const offOf = new Map();
    const half = Math.max(1, Math.ceil(n / 2));
    const sorted = skel.branches.slice().sort((a, b) => (a.depth - b.depth) || (a.childId < b.childId ? -1 : 1));
    sorted.forEach((br) => {
      const isRoot = br.parentId.startsWith('service:');
      if (isRoot) {
        // 主枝：从关节向左右扇开
        const jy = jointY.get(br.childId);
        const idx = limbIdx.get(br.childId) ?? 0;
        const side = idx % 2 === 0 ? -1 : 1;
        const k = Math.floor(idx / 2);
        const spread = (1 - k / Math.max(1, half - 1));  // 下密上疏
        const spanX = Math.min(w * 0.34, 300) * (0.55 + 0.45 * spread);
        const x = w / 2 + side * spanX * (0.35 + 0.65 * spread);
        const rise = Math.min(h * 0.3, 150 + idx * 12);
        pt.set(br.childId, { x, y: jy - rise });
        offOf.set(br.childId, x - w / 2);
      } else {
        const parent = pt.get(br.parentId);
        if (!parent) return;
        const sibs = kids.get(br.parentId) || [br.childId];
        const i = sibs.indexOf(br.childId);
        const spread = sibs.length <= 1 ? 0.55 : 0.25 + 0.75 * (i / Math.max(1, sibs.length - 1));
        const dir = (limbIdx.get(br.parentId) ?? 0) % 2 === 0 ? -1 : 1;
        const dx = dir * (40 + 130 * spread) * Math.pow(0.78, br.depth - 2);
        const dy = -(34 + 46 * spread) * Math.pow(0.8, br.depth - 2);
        pt.set(br.childId, { x: parent.x + dx, y: parent.y + dy });
        offOf.set(br.childId, pt.get(br.childId).x - w / 2);
      }
    });

    // 裁到画布内（留出标签边距 150）
    const marginX = 150;
    const xs = [...pt.values()].map((p) => p.x);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const rangeX = Math.max(maxX - minX, 1);
    const availW = Math.max(w - marginX * 2, 100);
    const fitX = Math.min(1, availW / rangeX);
    const shiftX = (w / 2) - ((minX + maxX) / 2) * fitX;
    const ys2 = [...pt.values()].map((p) => p.y);
    const minY = Math.min(...ys2), maxY = Math.max(...ys2);
    const rangeY = Math.max(maxY - minY, 1);
    const availH = Math.max(h - 40 - 90, 100);
    const fitY = Math.min(1, availH / rangeY);
    const shiftY = 60 - minY * fitY;
    pt.forEach((p, id) => { pt.set(id, { x: p.x * fitX + shiftX, y: p.y * fitY + shiftY }); });

    const out = skel.branches.map((br) => {
      const from = pt.get(br.parentId) || { x: w / 2, y: trunkBottom };
      const to = pt.get(br.childId) || from;
      return { ...br, from, to, width: Math.max(1, br.radius * 40) };
    }).sort((a, b) => (a.childId < b.childId ? -1 : 1));

    return {
      points: pt, branches: out,
      trunk: { x: w / 2, yBottom: trunkBottom, yTop: trunkTop, width: 26 },
      joints: skel.limbs.map((id) => ({ id, x: w / 2, y: jointY.get(id) })),
      fitX, fitY,
    };
  }

  /* ---------- 标签防重叠 ---------- */
  function assignLabels(items, trunkX, w, h, opts = {}) {
    const gap = 26, margin = 14, top = 54, bottomLimit = h - 74;
    const charW = opts.charWidth ?? 14.5, latinRatio = opts.latinRatio ?? 0.8;
    const maxWidth = opts.maxWidth ?? Math.min(240, w * 0.32);
    const list = Array.from(items.values()).sort((a, b) => (a.y - b.y) || (a.id < b.id ? -1 : 1));
    const col = { left: [], right: [] };
    list.forEach((it) => {
      let s = it.x < trunkX ? 'left' : 'right';
      if (col[s].length > col[s === 'left' ? 'right' : 'left'].length + 1) s = s === 'left' ? 'right' : 'left';
      if (s === 'left' && it.x < 150) s = 'right';
      if (s === 'right' && it.x > w - 150) s = 'left';
      col[s].push(it);
    });
    const out = new Map();
    ['left', 'right'].forEach((s) => {
      const arr = col[s], ys = [];
      arr.forEach((q, i) => {
        const base = Math.max(top, Math.min(bottomLimit, q.y - 14));
        ys.push(i === 0 ? base : Math.max(base, ys[i - 1] + gap));
      });
      const over = (ys[ys.length - 1] ?? 0) - bottomLimit;
      if (over > 0) for (let i = 0; i < ys.length; i++) ys[i] = Math.max(top + i * gap, ys[i] - over);
      arr.forEach((q, i) => {
        let tw = 0;
        for (const ch of (opts.labels[q.id] || '')) tw += ch.charCodeAt(0) > 11904 ? charW : charW * latinRatio;
        tw = Math.min(maxWidth, tw + 40);
        out.set(q.id, { side: s, y: ys[i], width: tw, x: s === 'left' ? margin + tw : w - margin - tw });
      });
    });
    return out;
  }

  /* ---------- 渲染舞台 ---------- */
  function renderStage() {
    const svg = $('#aoiTreeSvg'), layer = $('#aoiTreeNodes'), bar = $('#aoiLegendBar');
    if (!svg || !st.skel) return;
    const vis = new Set(st.model.nodes.filter((n) => st.layers[n.layer]).map((n) => n.id));
    const pr = project2d(st.skel, st.w, st.h, st.zoom);
    const service = st.model.nodes.find((n) => n.kind === 'service');
    const servicePt = { x: pr.trunk.x, y: pr.trunk.yBottom };
    const branches = pr.branches.filter((b) => vis.has(b.childId));
    const nodes = st.model.nodes.filter((n) => vis.has(n.id) && (pr.points.has(n.id) || n.kind === 'service'));

    const labelled = new Map();
    nodes.forEach((n) => {
      const p = pr.points.get(n.id) || (n.kind === 'service' ? servicePt : null);
      if (!p) return;
      const show = n.kind === 'service' || n.kind === 'toolset' || (st.selected && (st.selected === n.id || st.selected === n.parentId));
      if (show) labelled.set(n.id, { id: n.id, x: p.x, y: p.y });
    });
    const labs = assignLabels(labelled, pr.trunk.x, st.w, st.h, {
      labels: Object.fromEntries([...labelled].map(([k]) => [k, (st.model.nodes.find((n) => n.id === k) || {}).label || ''])),
      maxWidth: innerWidth <= 760 ? Math.min(170, st.w * 0.41) : Math.min(240, st.w * 0.3),
    });
    const colOf = (l) => (l === 'control' ? C.control : l === 'function' ? C.fn : C.tech);

    /* 主干与关节 */
    const trunkG = `
      <defs>
        <filter id="g-soft" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="g-hard" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="5.5" result="w"/><feGaussianBlur in="SourceGraphic" stdDeviation="1.6" result="t"/><feMerge><feMergeNode in="w"/><feMergeNode in="w"/><feMergeNode in="t"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <linearGradient id="trunk-grad" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stop-color="${C.trunk}" stop-opacity=".45"/>
          <stop offset=".4" stop-color="${C.trunk}" stop-opacity="1"/>
          <stop offset="1" stop-color="${C.trunk}" stop-opacity=".4"/>
        </linearGradient>
      </defs>
      <g filter="url(#g-soft)">
        <line x1="${pr.trunk.x}" y1="${pr.trunk.yBottom}" x2="${pr.trunk.x}" y2="${pr.trunk.yTop}" stroke="url(#trunk-grad)" stroke-width="${pr.trunk.width}" stroke-linecap="round"/>
        ${pr.joints.map((j, i) => `<ellipse cx="${j.x}" cy="${j.y}" rx="12" ry="7" fill="${C.trunk}" opacity="${0.5 + 0.12 * (i % 3)}"/>`).join('')}
      </g>`;

    /* 树冠细丝 */
    const crown = (() => {
      const r = rnd(hash('crown:' + st.key));
      const cx = pr.trunk.x, cy = pr.trunk.yTop;
      let d = '';
      for (let i = 0; i < 46; i++) {
        const ang = -Math.PI / 2 + (r() - 0.5) * 3.0;
        const len = 10 + r() * Math.min(pr.trunk.width * 3.6, 64);
        const x = cx + Math.cos(ang) * len, y = cy + Math.sin(ang) * len * 0.85;
        const mx = (cx + x) / 2 + (r() - 0.5) * 14, my = (cy + y) / 2 + (r() - 0.5) * 10;
        d += `M${cx.toFixed(1)} ${cy.toFixed(1)}Q${mx.toFixed(1)} ${my.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      return `<path d="${d}" stroke="${C.fn}" stroke-width=".5" fill="none" opacity=".38" stroke-linecap="round"/>`;
    })();

    /* 主枝与细枝 */
    const wires = branches.map((b) => {
      const p0 = b.parentId.startsWith('service:') ? servicePt : (pr.points.get(b.parentId) || servicePt);
      const p1 = pr.points.get(b.childId) || p0;
      const r = rnd(hash(b.childId));
      const mx = (p0.x + p1.x) / 2 + (r() - 0.5) * 34;
      const my = (p0.y + p1.y) / 2 + (r() - 0.5) * 26;
      const col = colOf(b.layer);
      const isLimb = b.depth === 1;
      const w0 = isLimb ? Math.max(6, b.width * 0.42) : Math.max(1, b.width * 0.16);
      const w1 = isLimb ? w0 * 0.35 : Math.max(0.5, w0 * 0.5);
      const d = `M${p0.x.toFixed(1)} ${p0.y.toFixed(1)}Q${mx.toFixed(1)} ${my.toFixed(1)} ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
      return `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w0.toFixed(2)}" stroke-linecap="round" opacity="${b.glow ? 0.34 : 0.2}" ${b.glow ? 'filter="url(#g-soft)"' : ''}/>
        <path d="${d}" fill="none" stroke="${col}" stroke-width="${w1.toFixed(2)}" stroke-linecap="round" opacity="${b.glow ? 0.95 : 0.45}"/>`;
    }).join('');

    const dots = branches.filter((b) => b.depth === 1).map((b) => {
      const p1 = pr.points.get(b.childId);
      if (!p1) return '';
      const col = colOf(b.layer);
      return `<circle cx="${p1.x.toFixed(1)}" cy="${p1.y.toFixed(1)}" r="${b.glow ? 6 : 4.5}" fill="${b.glow ? '#fff' : col}" ${b.glow ? 'filter="url(#g-hard)"' : 'opacity=".85"'}/>`;
    }).join('');

    /* 枝头细枝簇（对每个主枝末端发散） */
    const twigClusters = st.skel.limbs.map((limb) => {
      const tip = pr.points.get(limb);
      if (!tip) return '';
      const kids = (st.skel.branches.filter((b) => b.parentId === limb));
      if (!kids.length) return '';
      const col = colOf((st.model.nodes.find((n) => n.id === limb) || {}).layer || 'control');
      const r = rnd(hash('tw:' + limb));
      let d = '';
      kids.forEach((k) => {
        const target = pr.points.get(k.childId);
        if (!target) return;
        const n = 3 + Math.floor(r() * 4);
        for (let i = 0; i < n; i++) {
          const ang = Math.atan2(target.y - tip.y, target.x - tip.x) + (r() - 0.5) * 1.5;
          const len = 8 + r() * 26;
          const x = tip.x + Math.cos(ang) * len, y = tip.y + Math.sin(ang) * len;
          const mx = tip.x + Math.cos(ang) * len * 0.5 + (r() - 0.5) * 10, my = tip.y + Math.sin(ang) * len * 0.5 + (r() - 0.5) * 10;
          d += `M${tip.x.toFixed(1)} ${tip.y.toFixed(1)}Q${mx.toFixed(1)} ${my.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
        }
      });
      if (!d) return '';
      const limbNode = st.model.nodes.find((n) => n.id === limb) || {};
      const twOp = limbNode.state === 'verified' ? 0.62 : 0.3;
      let tailD = '';
      kids.forEach((k) => {
        const target = pr.points.get(k.childId);
        if (!target) return;
        for (let i = 0; i < 5; i++) {
          const ang = Math.atan2(target.y - tip.y, target.x - tip.x) + (rnd(hash('tw' + k.childId + i))() - 0.5) * 1.7;
          const len = 12 + rnd(hash('tl' + k.childId + i))() * 34;
          const x = tip.x + Math.cos(ang) * len, y = tip.y + Math.sin(ang) * len;
          tailD += `M${x.toFixed(1)} ${y.toFixed(1)}h.4`;
        }
      });
      return `<path d="${d}" stroke="${col}" stroke-width=".45" fill="none" opacity="${twOp}" stroke-linecap="round"/>` + (tailD ? `<path d="${tailD}" stroke="${col}" stroke-width="2.4" stroke-linecap="round" opacity="${twOp + 0.2}"/>` : '');
    }).join('');

    const leaders = [...labs].filter(([id]) => st.w > 900 || st.selected === id).map(([id, L]) => {
      const p = pr.points.get(id) || servicePt;
      const de = L.side === 'left' ? L.x - L.width : L.x + L.width;
      return `<polyline class="aoi-tree__leader" points="${p.x.toFixed(1)},${p.y.toFixed(1)} ${L.x.toFixed(1)},${L.y.toFixed(1)} ${de.toFixed(1)},${L.y.toFixed(1)}"/>`;
    }).join('');

    svg.setAttribute('width', st.w); svg.setAttribute('height', st.h);
    svg.setAttribute('viewBox', `0 0 ${st.w} ${st.h}`);
    svg.innerHTML = trunkG + crown + twigClusters + wires + dots + leaders;

    layer.innerHTML = nodes.map((n) => {
      const p = pr.points.get(n.id) || servicePt;
      const L = labs.get(n.id);
      const side = L ? L.side : (p.x < st.w / 2 ? 'left' : 'right');
      const sv = STATE[n.state] || STATE.unverified;
      const label = L
        ? `<span class="aoi-node__label" style="${L.side === 'left'
            ? `right:${(st.w - L.x - L.width).toFixed(0)}px`
            : `left:${L.x.toFixed(0)}px`};bottom:${(st.h - L.y - 2).toFixed(0)}px">${brand(esc(n.label))}</span>`
        : '';
      return `<button class="aoi-node ${n.state === 'verified' ? 'is-lit' : ''} ${st.selected === n.id ? 'is-selected' : ''}"
        data-id="${esc(n.id)}" data-layer="${n.layer}" data-state="${n.state}" data-side="${side}"
        style="left:${p.x.toFixed(1)}px;top:${p.y.toFixed(1)}px" role="treeitem"
        aria-label="${esc(n.label)}，${sv.suffix}" title="${esc(n.label)}">
        <span class="aoi-node__glyph" aria-hidden="true"></span>${label}</button>`;
    }).join('');
    $$('.aoi-node', layer).forEach((b) => b.addEventListener('click', () => selectNode(b.dataset.id)));

    bar.innerHTML = [
      ['控制树 · 模块', C.control], ['功能网 · 只读能力', C.fn], ['技术网 · 写入/破坏性', C.tech],
    ].map(([t, c]) => `<span class="k"><span class="sw" style="background:${c}"></span>${t}</span>`).join('') +
      `<span class="k" style="margin-left:auto">点节点看详情 · Ctrl/Cmd+K 搜索 · 拖动缩放按钮</span>`;
  }

  /* ---------- 左栏 / 详情 ---------- */
  function renderRail() {
    const t = TREES[st.key];
    $('#aoiRailList').innerHTML = t.toolsets.map((ts) => {
      const cur = st.selected === (ts.uuid || ts.id);
      return `<li><button data-id="${esc(ts.uuid || ts.id)}" class="${cur ? 'is-current' : ''}">
        <span class="code">${esc(ts.name)}</span>
        <span class="nm">${esc(tr(ts.label_zh).replace(ts.name, '').trim())}</span>
        <span class="st">${STATE[tsState(ts)].glyph} ${(ts.tools || []).length}</span></button></li>`;
    }).join('');
    $$('#aoiRailList button').forEach((b) => b.addEventListener('click', () => selectNode(b.dataset.id)));
    $('#aoiLegendSide').innerHTML = `<ul style="list-style:none;margin:0;padding:0;display:grid;gap:3px;font-size:10.5px">
      ${Object.values(STATE).map((v) => `<li style="display:flex;gap:6px"><span>${v.glyph}</span><strong style="color:var(--aoi-text)">${v.label}</strong><span>${v.suffix.replace('状态 ', '')}</span></li>`).join('')}</ul>`;
  }

  const nodeById = (id) => st.model.nodes.find((n) => n.id === id);
  function selectNode(id) { if (!nodeById(id)) return; st.selected = st.selected === id ? null : id; st.tab = 'overview'; renderStage(); renderRail(); renderDetail(); }

  function renderDetail() {
    const host = $('#aoiDetail'), t = TREES[st.key], isAoi = t.tree_kind === 'aoi';
    const n = st.selected ? nodeById(st.selected) : null;
    host.classList.toggle('has-selection', Boolean(n));
    if (!n) {
      host.innerHTML = `
        <p class="aoi-muted">未选择节点。点树上、左栏或搜索里任意节点；三处同一个 stable ID。</p>
        <div class="aoi-legend"><h4>状态图例</h4>
          <ul>${Object.values(STATE).map((v) => `<li><span class="aoi-state__glyph">${v.glyph}</span><strong>${v.label}</strong></li>`).join('')}</ul>
          <h4>亮度含义</h4><ul>
            ${(isAoi ? ['亮线：施工批次 A/B 的规范节点（尚未实现、未验证）', '较暗：施工批次 C/D 的规范节点', '最淡：可选模块（M10 旧系统兼容桥）']
              : ['亮线：MCP 服务 tools/list 列出的工具（只读清单，未调用、未验证）']).map((s) => `<li><span>${s}</span></li>`).join('')}</ul></div>`;
      return;
    }
    const ent = n.entity, sv = STATE[n.state] || STATE.unverified;
    const parent = n.parentId ? nodeById(n.parentId) : null;
    let card = '';
    if (n.kind === 'service') {
      card = `<p>${esc(tr(ent.summary_zh || ''))}</p>
        <p class="aoi-muted">源：${esc(ent.source.repo)} · ${esc(ent.source.version)}${ent.source.commit ? ' @ ' + esc(ent.source.commit.slice(0, 7)) : ''}</p>
        <p class="aoi-muted">${isAoi ? '金色主枝是 AoI 的 12 个施工模块，枝头是每个模块的关键接口、能力与守护规则。' : '主枝是按工具名分组的能力域，枝头是每个工具。'}</p>`;
    } else if (n.kind === 'toolset') {
      const tools = ent.tools || [], cnt = (k) => tools.filter((x) => x.leaf_type === k).length;
      card = `<p>${esc(tr(ent.summary_zh))}</p>
        <p class="aoi-muted">${isAoi
          ? `接口 ${cnt('interface')} · 能力 ${cnt('capability')} · 守护规则 ${cnt('guard')}${cnt('scenario') ? ` · 验收场景 ${cnt('scenario')}` : ''}${ent.note ? ' · ' + esc(tr(ent.note)) : ''}`
          : `${tools.length} 个工具 · 只读 ${tools.filter((x) => x.risk === 'read').length} · 写入 ${tools.filter((x) => x.risk === 'write').length} · 破坏性 ${tools.filter((x) => x.risk === 'destructive').length}${ent.remote_only ? ' · ' + esc(tr(ent.note || '仅远程服务提供')) : ''}`}</p>
        ${(ent.suggested_actions_zh || []).length ? `<h4>可以这样问</h4><ul class="aoi-preview-detail__list">${ent.suggested_actions_zh.slice(0, 3).map((q) => `<li>${esc(tr(q))}</li>`).join('')}</ul>` : ''}
        <h4>${isAoi ? '规范出处' : '源码出处'}</h4><ul class="aoi-preview-detail__list">${(ent.evidence || []).slice(0, 4).map((e) => `<li><code>${esc(e)}</code></li>`).join('')}</ul>
        <p class="aoi-muted" style="font-size:11px">${isAoi ? `预览说明：AoI 能力树来自施工 Prompt 包 v1（${esc(t.root.source.version)}）的规范原文，平台仍在施工；亮度只表示施工批次，不代表已实现或已验证。` : `预览说明：来自 ${esc(t.root.source.version)} 源码导出，未实际调用任何工具。`}</p>`;
    } else {
      const lt = ent.leaf_type ? LEAF_CN[ent.leaf_type] || ent.leaf_type : '';
      card = `<div class="aoi-preview-detail__row">
          <code>${parent ? esc(parent.entity.name + ' / ' + ent.name) : esc(ent.name)}</code>
          <span class="aoi-preview-chip" style="color:${isAoi ? (LEAF_C[ent.leaf_type] || C.control) : (RISK_C[ent.risk] || C.stale)}">${isAoi ? (lt ? '类型 · ' + lt : '') : '风险 · ' + (RISK_CN[ent.risk] || '')}</span>
          <span class="aoi-preview-chip" style="color:${ent.default_enabled ? '#FFD27A' : '#8C95AA'}">${isAoi ? (parent ? '施工批次 ' + (parent.entity.wave || '?') : '') : (ent.default_enabled ? '默认启用' : '默认关闭')}</span>
        </div>
        ${ent.title_en && ent.title_en !== n.label ? `<p class="aoi-muted">${esc(ent.title_en)}</p>` : ''}
        <p>${esc(tr(ent.summary_zh))}</p>
        <p class="aoi-muted">${isAoi ? (parent ? '所属模块：' + esc(parent.label) : '') : '只读清单，未调用'}</p>
        ${ent.evidence_excerpt ? `<blockquote style="margin:8px 0;padding:6px 9px;border-left:2px solid rgba(255,210,122,.7);background:rgba(255,210,122,.06);color:#d8dce6;font-size:11.5px">${esc(tr(ent.evidence_excerpt.slice(0, 260)))}</blockquote>` : ''}
        ${(ent.suggested_actions_zh || []).length ? `<h4>可以这样问</h4><ul class="aoi-preview-detail__list">${ent.suggested_actions_zh.slice(0, 3).map((q) => `<li>${esc(tr(q))}</li>`).join('')}</ul>` : ''}
        <h4>${isAoi ? '规范出处' : '源码出处'}</h4><ul class="aoi-preview-detail__list">${(ent.evidence || []).slice(0, 4).map((e) => `<li><code>${esc(e)}</code></li>`).join('')}</ul>`;
    }
    host.innerHTML = `
      <header class="aoi-detail__head">
        <h2>${brand(esc(n.label))}</h2>
        <div class="aoi-detail__meta">
          <span class="aoi-state aoi-state--${n.state}">${sv.glyph} ${sv.label}</span>
          <span class="mono">id=${esc(String(n.id).slice(0, 34))}</span>
          <span class="mono">layer=${n.layer}</span>
        </div>
        <p class="aoi-muted">${sv.suffix}${n.state === 'verified' && !isAoi ? '（只读 tools/list 清单，未调用）' : ''}。</p>
        <div class="aoi-preview-detail">${card}</div>
      </header>
      <nav class="aoi-detail__tabs" role="tablist">
        ${[['overview', '概述'], ['config', '配置'], ['run', '运行'], ['evidence', '证据'], ['recipe', '配方']]
          .map(([k, v]) => `<button role="tab" data-tab="${k}" class="${st.tab === k ? 'is-active' : ''}">${v}</button>`).join('')}
      </nav>
      <div class="aoi-detail__body" role="tabpanel">
        ${st.tab === 'overview' ? `<section class="aoi-section"><h3>目标与复验</h3><p class="aoi-muted">${isAoi ? '该节点来自施工 Prompt 包 v1 规范原文。' : '该节点来自源码导出，只读清单。'}</p><p class="aoi-muted">状态：${sv.label} · ${sv.suffix}</p></section>` : ''}
        ${st.tab === 'config' ? `<section class="aoi-section"><h3>配置链</h3><p class="aoi-muted">${parent ? '父节点：' + esc(parent.label) : '根节点'} · 证据 ${((ent.evidence) || []).length} 项</p></section>` : ''}
        ${st.tab === 'run' ? `<section class="aoi-section"><h3>最近运行</h3><p class="aoi-muted">该能力还没有运行记录：不能显示"通过"。</p></section>` : ''}
        ${st.tab === 'evidence' ? `<section class="aoi-section"><h3>证据与裁决</h3><ul class="aoi-preview-detail__list">${((ent.evidence) || []).map((e) => `<li><code>${esc(e)}</code></li>`).join('') || '<li class="aoi-muted">尚无证据条目</li>'}</ul></section>` : ''}
        ${st.tab === 'recipe' ? `<section class="aoi-section"><h3>配方与复跑</h3><p class="aoi-muted">该能力尚未蒸馏配方。</p></section>` : ''}
      </div>
      <footer class="aoi-detail__foot"><details><summary>诊断来源（文档声明 / 待验证 / 断点）</summary>
        <div class="aoi-muted" style="padding-top:6px;font-size:11px">当前为静态预览数据，无后端裁决；${isAoi ? '规范原文' : '源码出处'}见上。</div></details></footer>`;
    $$('.aoi-detail__tabs button', host).forEach((b) => b.addEventListener('click', () => { st.tab = b.dataset.tab; renderDetail(); }));
  }

  /* ---------- 搜索 ---------- */
  function openSearch() { $('#aoiSearch').classList.add('is-open'); const i = $('#aoiSearchInput'); i.value = ''; i.focus(); renderSearch(''); }
  function closeSearch() { $('#aoiSearch').classList.remove('is-open'); }
  function renderSearch(q) {
    const list = st.model.nodes.filter((n) => !q || n.label.toLowerCase().includes(q.toLowerCase()) || String(n.id).toLowerCase().includes(q.toLowerCase())).slice(0, 40);
    $('#aoiSearchList').innerHTML = list.map((n, i) => `<li data-id="${esc(n.id)}" class="${i === 0 ? 'is-active' : ''}">${esc(n.label)} <span class="aoi-muted">(${n.kind})</span></li>`).join('');
    $$('#aoiSearchList li').forEach((li) => li.addEventListener('click', () => { selectNode(li.dataset.id); closeSearch(); }));
  }

  /* ---------- 生命周期 ---------- */
  function rebuild() {
    st.model = buildModel(TREES[st.key]);
    st.skel = buildSkeleton(st.model);
    st.selected = null;
    resize(); renderStage(); renderRail();
    $('#aoiFooterStat').textContent = `静态预览 · ${st.model.nodes.length} 节点 · ${st.model.edges.length} 边 · 未调用任何工具`;
    // 调试钩子：给页面探针读取真实投影参数
    window.__TREE_DBG = { model: st.model, skel: st.skel, K, st };
  }
  document.addEventListener('xc:lang', () => {
    if (!st.model) return;
    const sel = st.selected, tab = st.tab;
    st.model = buildModel(TREES[st.key]);
    st.skel = buildSkeleton(st.model);
    st.selected = sel && nodeById(sel) ? sel : null;
    st.tab = tab;
    renderStage(); renderRail(); renderDetail();
    window.__TREE_DBG = { model: st.model, skel: st.skel, K, st };
  });
  function resize() { const r = $('#aoiStage').getBoundingClientRect(); st.w = Math.max(320, r.width); st.h = Math.max(300, r.height); }

  function boot() {
    rebuild(); renderDetail();
    $$('#aoiChannels button').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.tree === 'factory') { location.href = 'index.html?from=code'; return; }
      if (st.key === b.dataset.tree) return;
      st.key = b.dataset.tree;
      $$('#aoiChannels button').forEach((x) => x.classList.toggle('is-active', x === b));
      $('#aoiTitle').textContent = b.dataset.title;
      $('#aoiEyebrow').textContent = b.dataset.eyebrow;
      rebuild(); renderDetail();
    }));
    $('#aoiSearchBtn').addEventListener('click', openSearch);
    $('#aoiSearchInput').addEventListener('input', (e) => renderSearch(e.target.value));
    $('#aoiSearch').addEventListener('click', (e) => { if (e.target.id === 'aoiSearch') closeSearch(); });
    $('#aoiZoomIn').addEventListener('click', () => { st.zoom = clamp(st.zoom + 0.15, 0.5, 2.5); renderStage(); });
    $('#aoiZoomOut').addEventListener('click', () => { st.zoom = clamp(st.zoom - 0.15, 0.5, 2.5); renderStage(); });
    $('#aoiZoomReset').addEventListener('click', () => { st.zoom = 1; renderStage(); });
    $('#aoiReplay').addEventListener('click', () => { st.zoom = 1; renderStage(); toast('已重播树体生长'); });
    $$('#aoiLayerToggles input').forEach((cb) => cb.addEventListener('change', () => { st.layers[cb.dataset.layer] = cb.checked; renderStage(); }));
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); }
      if (e.key === 'Escape') closeSearch();
    });
    new ResizeObserver(() => { resize(); renderStage(); }).observe($('#aoiStage'));
    setTimeout(() => { resize(); renderStage(); }, 80);
  }

  let toastT;
  function toast(msg) {
    let el = $('#aoiToast');
    if (!el) { el = document.createElement('div'); el.id = 'aoiToast'; document.body.appendChild(el); }
    el.textContent = msg; el.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 2200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
