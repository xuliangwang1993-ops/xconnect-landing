// project_delivery card — one card per finished video project.
//
// The card is intentionally dumb: it renders a payload produced by the craft-skills
// pipeline (runs/<run_id>/07_customer/project_delivery.json) and never invents a
// number. If a station failed, the card explains it in plain language and offers
// two actions: retry the station, or hand it to a human.

export const CARD_TYPE = 'project_delivery';

const STATION_LABELS = {
  brief: '需求解析',
  collect: '素材采集',
  script: '脚本与分镜',
  edit: '剪辑与调色',
  subs: '字幕',
  compose: '合成导出',
  qa: '后测',
  customer: '客服知识包',
};

const STATUS_TEXT = {
  done: { tone: 'good', label: '完成' },
  attention: { tone: 'warn', label: '需注意' },
  failed: { tone: 'bad', label: '失败' },
  running: { tone: 'accent', label: '进行中' },
};

export function emptyCard(runId = '') {
  return {
    type: CARD_TYPE,
    runId,
    sentence: '',
    scorecard: {},
    stations: [],
    artifacts: [],
    gaps: [],
    pendingCustomer: [],
    status: 'running',
    updatedAt: new Date().toISOString(),
  };
}

/** Normalise whatever came out of the pipeline into a render-safe card. */
export function normalizeCard(input = {}) {
  const card = emptyCard(String(input.run_id || input.runId || ''));
  card.sentence = String(input.sentence || '');
  card.scorecard = sanitizeScores(input.scorecard);
  card.stations = (Array.isArray(input.stations) ? input.stations : []).map((s) => {
    const name = String(s.name || '');
    const status = ['done', 'attention', 'failed', 'running'].includes(s.status) ? s.status : 'attention';
    return {
      name,
      label: STATION_LABELS[name] || name,
      status,
      score: Number.isFinite(Number(s.score)) ? Number(s.score) : null,
      checksFailed: Array.isArray(s.checks_failed) ? s.checks_failed.slice(0, 12) : [],
    };
  });
  card.artifacts = (Array.isArray(input.artifacts) ? input.artifacts : [])
    .filter((a) => a && a.name && a.path)
    .map((a) => ({
      name: String(a.name),
      path: String(a.path),
      bytes: Number(a.bytes) || 0,
      kind: /\.(mp4|mov)$/i.test(a.name) ? 'video' : /\.(srt)$/i.test(a.name) ? 'subtitle' : 'image',
    }));
  card.gaps = Array.isArray(input.gaps) ? input.gaps.map(String) : [];
  card.pendingCustomer = Array.isArray(input.pending_customer)
    ? input.pending_customer.map(String)
    : [];
  card.status = card.stations.some((s) => s.status === 'failed')
    ? 'failed'
    : card.stations.some((s) => s.status === 'attention')
      ? 'attention'
      : card.stations.length
        ? 'done'
        : 'running';
  card.updatedAt = new Date().toISOString();
  return card;
}

function sanitizeScores(scores) {
  if (!scores || typeof scores !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(scores)) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0 && n <= 5) out[String(k)] = n;
  }
  return out;
}

export function overallScore(card) {
  const vals = Object.values(card.scorecard || {});
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

export function statusChip(status) {
  return STATUS_TEXT[status] || STATUS_TEXT.attention;
}

/**
 * Human explanation for a failed station + the two actions the card offers.
 * Deliberately concrete: it names the station, the failed check ids and what to do.
 */
export function explainFailure(station) {
  if (!station || station.status !== 'failed') return null;
  const checks = station.checksFailed.length ? station.checksFailed.join('、') : '未记录具体检查项';
  return {
    title: `${station.label || station.name} 没有通过`,
    body: `失败检查：${checks}。下游站点已停止，没有产出半成品交付物。`,
    actions: [
      { id: 'retry', label: '重试这一站', kind: 'primary' },
      { id: 'human', label: '联系人工', kind: 'ghost' },
    ],
  };
}

export function summarize(card) {
  const done = card.stations.filter((s) => s.status === 'done').length;
  const total = card.stations.length;
  return {
    line: `${done}/${total} 站完成 · ${card.artifacts.length} 个交付文件 · ${card.pendingCustomer.length} 项待客户`,
    overall: overallScore(card),
    tone: statusChip(card.status),
  };
}
