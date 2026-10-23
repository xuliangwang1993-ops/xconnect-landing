/* project_delivery 卡片视图（原生 ES module，无依赖）。 */
const ST = { pass: ['good', '通过'], warn: ['warn', '有提醒'], failed: ['bad', '失败'], skipped: ['', '未跑'] };

export function isDelivery(card) { return card && card.type === 'project_delivery' && card.delivery; }

export function deliveryBadge(card, esc) {
  if (!isDelivery(card)) return '';
  const s = card.delivery.scorecard;
  return `<span class="tag">交付 · ${s == null ? '—' : esc(String(s))}/5</span>`;
}

export function renderDeliveryPanel(card, esc) {
  if (!isDelivery(card)) return '';
  const d = card.delivery;
  const st = (d.stations || []).map((s) => {
    const [cls, label] = ST[s.status] || ['', s.status];
    return `<li class="pd-station"><span class="chip ${cls}">${esc(label)}</span> <b>${esc(s.name)}</b>${s.score != null ? ` · ${esc(String(s.score))}/5` : ''}${s.elapsed_s != null ? ` · ${esc(String(s.elapsed_s))}s` : ''}
      ${s.status === 'failed' ? `<p class="pd-explain">${esc(s.explain || '这一站失败了。')}</p><div class="insp-actions"><button class="btn primary small" data-card-action="delivery-retry" type="button">重试</button><button class="btn ghost small" data-card-action="delivery-contact" type="button">联系人工</button></div>` : ''}</li>`;
  }).join('');
  const list = (arr) => (arr && arr.length ? `<ul>${arr.map((x) => `<li>${esc(typeof x === 'string' ? x : x.path)}</li>`).join('')}</ul>` : '<p>无</p>');
  return `<div class="insp-section pd">
      <div class="insp-label"><span>项目交付</span><span>run ${esc(d.run_id)}</span></div>
      <p>${esc(d.sentence)}</p>
      <p><span class="chip accent">总评 ${d.scorecard == null ? '—' : esc(String(d.scorecard))}/5</span></p>
    </div>
    <div class="insp-section"><div class="insp-label"><span>各站</span></div><ul class="pd-stations">${st}</ul></div>
    <div class="insp-section"><div class="insp-label"><span>成品</span><span>${(d.artifacts || []).length} 个</span></div>${list(d.artifacts)}</div>
    <div class="insp-section"><div class="insp-label"><span>待客户提供</span></div>${list(d.pending_customer)}</div>
    <div class="insp-section"><div class="insp-label"><span>缺口</span></div>${list(d.gaps)}</div>`;
}
