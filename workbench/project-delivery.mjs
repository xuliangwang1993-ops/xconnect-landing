// project_delivery card: 把 craft-skills 流水线一次 run 的结果变成一张工作台卡片。
// 纯函数 + node:fs，无新依赖。卡片仍走 work_checkpoints（sources[0].kind = 'workbench-card'）。
import fs from 'node:fs';
import path from 'node:path';

export const CARD_TYPE = 'project_delivery';
const W = { commercial: 0.35, handoff: 0.25, craft: 0.25, benchmark: 0.15 };

// 失败站的人话解释（按 manifest.failed_step）
const HUMAN = {
  'license-check': '有素材没有登记来源或许可，为了不侵权，流水线停在这里。请补上许可或换素材后重试。',
  'fact-check': '脚本里出现了没有核实的信息（例如价格、电话），为避免把错信息放进视频，流水线停了。请让店家确认后重试。',
  schema: '上一站交来的文件格式不对，下一站拒收。通常重试即可；反复失败请联系人工。',
  inputs: '上一站的产出文件缺失，可能是中途被中断。请重试。',
};

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const tryJson = (p) => { try { return readJson(p); } catch { return null; } };

export function weighted(s) {
  return Math.round(Object.keys(W).reduce((a, k) => a + (Number(s?.[k]) || 0) * W[k], 0) * 100) / 100;
}

/** 从 craft-skills 仓库根目录 + run_id 构建卡片（不写云端）。 */
export function buildProjectDeliveryCard(repoRoot, runId, { now = new Date().toISOString() } = {}) {
  const rd = path.join(repoRoot, 'runs', runId);
  const man = readJson(path.join(rd, 'manifest.json'));
  const dirs = fs.readdirSync(rd).filter((d) => /^\d\d_/.test(d)).sort();
  const stations = dirs.map((d) => {
    const qa = tryJson(path.join(rd, d, 'qa.json'));
    const sc = tryJson(path.join(rd, d, 'scorecard.json'));
    const ho = tryJson(path.join(rd, d, 'handoff.json'));
    const failed = man.failed_station === d;
    return {
      name: d,
      status: failed ? 'failed' : qa ? (qa.pass ? 'pass' : 'warn') : 'skipped',
      score: sc ? weighted(sc) : null,
      elapsed_s: ho?.elapsed_s ?? null,
      ...(failed ? { explain: HUMAN[man.failed_step] || man.why || '这一站失败了。', actions: ['retry', 'contact_human'] } : {}),
    };
  });
  const scored = stations.filter((s) => s.score != null);
  const scorecard = scored.length ? Math.round((scored.reduce((a, s) => a + s.score, 0) / scored.length) * 100) / 100 : null;
  const ex = path.join(rd, '05_export');
  const artifacts = fs.existsSync(ex)
    ? fs.readdirSync(ex).filter((f) => /^(promo_.*\.mp4|cover_.*\.jpg|(zh|en)\.srt)$/.test(f)).sort()
      .map((f) => ({ kind: f.endsWith('.mp4') ? 'video' : f.endsWith('.jpg') ? 'cover' : 'subtitle', path: `runs/${runId}/05_export/${f}` }))
    : [];
  const facts = tryJson(path.join(rd, '01_ingest', 'facts.json'))?.facts || [];
  const pending = facts.filter((f) => f.status !== 'verified').map((f) => `${f.field}（${f.status}）${f.note ? '：' + f.note : ''}`);
  const media = tryJson(path.join(rd, '01_ingest', 'media_manifest.json'));
  const placeholder = JSON.stringify(media || {}).includes('placeholder');
  if (placeholder) pending.unshift('实拍素材（见 shot_request.md）', '官网图片书面授权');
  const gapsMd = path.join(repoRoot, 'reports', 'gaps.md');
  const gaps = fs.existsSync(gapsMd)
    ? fs.readFileSync(gapsMd, 'utf8').split('\n').filter((l) => /^\| \d+ /.test(l)).map((l) => l.split('|').map((s) => s.trim())).map((c) => `${c[2]}：${c[3]}`)
    : [];
  const delivery = { sentence: man.sentence, run_id: runId, scorecard, stations, artifacts, gaps, pending_customer: pending };
  const ok = man.status === 'ok';
  return {
    id: 'pd_' + runId.replace(/[^a-zA-Z0-9]/g, '').slice(-20),
    type: CARD_TYPE,
    project: '宣传视频试生产',
    title: `交付：${man.sentence.slice(0, 60)}`,
    status: ok ? (placeholder ? 'review' : 'done') : 'failed',
    original: man.sentence,
    working: ok ? `run ${runId} 全链通过，评分 ${scorecard}/5${placeholder ? '；样片 · 未授权，不可交付' : ''}` : `停在 ${man.failed_station}：${man.why}`,
    source: { kind: 'manual', label: '流水线导入', app: 'craft-skills', batch: runId, index: null, at: now, externalAssistant: false },
    assistant: null, review: null, approval: null, result: null, messages: [],
    delivery,
    createdAt: now, updatedAt: now,
  };
}

/** 最小校验：字段齐全、类型正确。返回错误数组（空 = 通过）。 */
export function validateProjectDelivery(card) {
  const e = [];
  const d = card?.delivery;
  if (card?.type !== CARD_TYPE) e.push('type');
  if (!d || typeof d !== 'object') return [...e, 'delivery'];
  if (typeof d.sentence !== 'string' || !d.sentence) e.push('sentence');
  if (typeof d.run_id !== 'string' || !d.run_id) e.push('run_id');
  if (!(d.scorecard === null || typeof d.scorecard === 'number')) e.push('scorecard');
  if (!Array.isArray(d.stations) || d.stations.some((s) => !s.name || !s.status)) e.push('stations');
  for (const k of ['artifacts', 'gaps', 'pending_customer']) if (!Array.isArray(d[k])) e.push(k);
  return e;
}
