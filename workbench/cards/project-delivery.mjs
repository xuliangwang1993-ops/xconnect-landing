/**
 * project_delivery — card type for "one sentence → delivered package".
 * Pure functions: buildCard / validateCard / renderCard / toCheckpointFields.
 */
export const PROJECT_DELIVERY = 'project_delivery';
export const SCHEMA_VERSION = 1;

const AXES = [['commercial', '商业价值'], ['handoff', '衔接'], ['craft', '工艺'], ['benchmark', '标杆']];

export function emptyCard(overrides = {}) {
  return {
    kind: PROJECT_DELIVERY, v: SCHEMA_VERSION, id: '', title: '交付包', sentence: '',
    runId: '', createdAt: new Date().toISOString(),
    scorecard: { overall: 0, axes: {} },
    stations: [], artifacts: [], gaps: [], pendingOwner: [], retry: null,
    ...overrides,
  };
}

export function buildCard({ runId, sentence, scorecard, stations, artifacts, gaps, pendingOwner, retry, createdAt }) {
  const card = emptyCard({
    id: `pd_${runId}`,
    title: `上架包 · ${runId}`,
    sentence: sentence || '',
    runId,
    createdAt: createdAt || new Date().toISOString(),
    scorecard: {
      overall: Number(scorecard?.overall ?? 0),
      axes: Object.fromEntries(AXES.map(([k]) => [k, Number(scorecard?.axis_average?.[k] ?? 0)])),
    },
    stations: (stations || []).map((s) => ({
      name: s.name, label: s.label || s.name,
      status: ['ok', 'warn', 'fail'].includes(s.status) ? s.status : 'warn',
      score: s.score == null ? null : Number(s.score), note: s.note || '',
    })),
    artifacts: (artifacts || []).map((a) => ({ label: a.label, path: a.path, kind: a.kind || 'file', bytes: a.bytes ?? null })),
    gaps: [...(gaps || [])],
    pendingOwner: [...(pendingOwner || [])],
    retry: retry ?? null,
  });
  const problems = validateCard(card);
  if (problems.length) throw new Error(`project_delivery invalid: ${problems.join('; ')}`);
  return card;
}

export function validateCard(card) {
  const p = [];
  if (!card || card.kind !== PROJECT_DELIVERY) p.push('kind must be project_delivery');
  if (!card?.runId) p.push('runId required');
  if (!card?.sentence) p.push('sentence required');
  if (!Array.isArray(card?.stations) || card.stations.length === 0) p.push('stations required');
  for (const s of card?.stations || []) if (!['ok', 'warn', 'fail'].includes(s.status)) p.push(`station ${s.name} bad status`);
  if (!Array.isArray(card?.artifacts)) p.push('artifacts must be an array');
  if (!Array.isArray(card?.pendingOwner)) p.push('pendingOwner must be an array');
  if (!(card?.scorecard?.overall >= 0 && card?.scorecard?.overall <= 5)) p.push('overall out of range');
  return p;
}

const STATUS_TEXT = { ok: '完成', warn: '有缺口', fail: '失败' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function renderCard(card, { baseHref = '' } = {}) {
  const problems = validateCard(card);
  if (problems.length) return `<section class="pd" role="alert"><h3>这张卡片的数据不完整</h3><p>${esc(problems.join('；'))}</p></section>`;

  const axes = AXES.map(([k, label]) => {
    const v = card.scorecard.axes[k];
    return `<li><span>${label}</span><b>${Number.isFinite(v) ? v.toFixed(1) : '—'}</b></li>`;
  }).join('');

  const stations = card.stations.map((s) => `
    <li class="pd-station pd-${s.status}">
      <i aria-hidden="true"></i>
      <span class="pd-name">${esc(s.label)}</span>
      <span class="pd-score">${s.score == null ? '—' : s.score.toFixed(1)}</span>
      <span class="pd-status">${STATUS_TEXT[s.status]}</span>
      ${s.status === 'fail' ? `<button class="pd-retry" data-station="${esc(s.name)}">重试</button><a class="pd-help" href="#support">联系人工</a>` : ''}
      ${s.note ? `<p class="pd-note">${esc(s.note)}</p>` : ''}
    </li>`).join('');

  const artifacts = card.artifacts.map((a) => `
    <li class="pd-art pd-art-${esc(a.kind)}">
      <a href="${esc(baseHref + a.path)}">${esc(a.label)}</a>
      <span>${esc(a.kind)}${a.bytes ? ` · ${a.bytes < 1048576 ? Math.round(a.bytes / 1024) + ' KB' : (a.bytes / 1048576).toFixed(1) + ' MB'}` : ''}</span>
    </li>`).join('');

  return `
<section class="pd" data-kind="${PROJECT_DELIVERY}">
  <header class="pd-head">
    <p class="pd-kicker">一句话需求 → 交付包</p>
    <h2 class="pd-title">${esc(card.title)}</h2>
    <p class="pd-sentence">「${esc(card.sentence)}」</p>
    <div class="pd-score-ring" style="--p:${Math.round(card.scorecard.overall / 5 * 100)}" aria-label="总分 ${card.scorecard.overall} / 5">
      <b>${card.scorecard.overall.toFixed(2)}</b><span>/ 5</span>
    </div>
  </header>
  <ul class="pd-axes">${axes}</ul>
  <h3 class="pd-h">十个站</h3>
  <ul class="pd-stations">${stations}</ul>
  <h3 class="pd-h">交付物</h3>
  <ul class="pd-arts">${artifacts || '<li class="pd-empty">还没有产物</li>'}</ul>
  <div class="pd-cols">
    <div><h3 class="pd-h">缺口（不藏）</h3><ul class="pd-list">${card.gaps.map((g) => `<li>${esc(g)}</li>`).join('') || '<li>无</li>'}</ul></div>
    <div><h3 class="pd-h">等房东</h3><ul class="pd-list">${card.pendingOwner.map((g) => `<li>${esc(g)}</li>`).join('') || '<li>无</li>'}</ul></div>
  </div>
  ${card.retry ? `<footer class="pd-foot"><code>${esc(card.retry.command)}</code></footer>` : ''}
</section>`.trim();
}

export function toCheckpointFields(card) {
  return {
    goal: card.title,
    constraints: card.sentence,
    progress: `${card.stations.filter((s) => s.status === 'ok').length}/${card.stations.length} 站完成 · 总分 ${card.scorecard.overall}`,
    sources: [{ kind: 'workbench-card', data: card }],
  };
}
