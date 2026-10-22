#!/usr/bin/env node
/**
 * Import a craft-skills run as a project_delivery card.
 *   node workbench/cards/import-run.mjs <run-dir> --sentence "..." [--push]
 * Server-side env for --push: SUPA_URL SUPA_ANON SUPA_EMAIL SUPA_PASSWORD XC_GATEWAY_USER_ID
 */
import { statSync, existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { buildCard, toCheckpointFields, PROJECT_DELIVERY } from './project-delivery.mjs';

const STATION_LABEL = {
  '00_brief': '需求解析', '01_collect': '房源采集', '02_pricing': '定价',
  '03_photos': '照片精修', '04_video': '看房视频', '05_copy': '多语描述',
  '06_guide': '入住指南', '07_site': '直订站', '08_qc': '后测', '09_support': '客服知识包',
};

const ARTIFACTS = [
  ['照片排序与图注', '03_photos/photos/order.json', 'gallery'],
  ['看房视频 9:16', '04_video/tour_9x16.mp4', 'video'],
  ['看房视频 16:9', '04_video/tour_16x9.mp4', 'video'],
  ['房源描述（中文）', '05_copy/listing_copy/zh.md', 'copy'],
  ['房源描述（English）', '05_copy/listing_copy/en.md', 'copy'],
  ['入住指南（中文）', '06_guide/guide/guide_zh.pdf', 'pdf'],
  ['入住指南（English）', '06_guide/guide/guide_en.pdf', 'pdf'],
  ['直订站', '07_site/site/index.html', 'site'],
  ['客服知识包', '09_support/kb/kb_manifest.json', 'kb'],
  ['评分卡', 'reports/scorecard.json', 'report'],
  ['后测', 'reports/qc.json', 'report'],
];

const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const nsFor = (userId) => sha256(`xc-workbench-v1|${userId}`).slice(0, 16);
const readJson = async (p, f = null) => { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return f; } };

export async function buildFromRun(runDir, sentence) {
  const scorecard = await readJson(join(runDir, 'reports/scorecard.json'));
  if (!scorecard) throw new Error(`no reports/scorecard.json in ${runDir} — run \`make run\` first`);

  const stations = [];
  for (const s of scorecard.stations) {
    const qa = await readJson(join(runDir, s.station, 'qa.json'));
    const failed = (qa?.checks || []).filter((c) => !c.ok).map((c) => c.id);
    stations.push({
      name: s.station,
      label: STATION_LABEL[s.station] || s.station,
      status: failed.length === 0 ? 'ok' : (failed.length <= 2 ? 'warn' : 'fail'),
      score: s.total,
      note: failed.length ? `未过：${failed.join(', ')}` : '',
    });
  }

  const artifacts = ARTIFACTS.filter(([, rel]) => existsSync(join(runDir, rel)))
    .map(([label, rel, kind]) => ({ label, path: rel, kind, bytes: statSync(join(runDir, rel)).size }));

  const reportPath = join(runDir, '../../docs/Airbnb上架包试生产报告.md');
  const report = await readFile(reportPath, 'utf8').catch(() => '');
  const gaps = (report.split('## 6. 弱格与缺口')[1] || '').split('##')[0]
    .split('\n').filter((l) => /^\d+\./.test(l.trim()))
    .map((l) => l.replace(/^\d+\.\s*/, '').replace(/\*\*/g, '').trim()).slice(0, 8);
  const pendingOwner = (report.split('## 8. 待房东提供')[1] || '').split('**必须确认')[0]
    .split('\n').filter((l) => /^\d+\./.test(l.trim()))
    .map((l) => l.replace(/^\d+\.\s*/, '').replace(/\*\*/g, '').trim());

  return buildCard({ runId: basename(runDir), sentence, scorecard, stations, artifacts, gaps, pendingOwner,
    retry: { command: 'make run SENTENCE="…"' } });
}

export async function push(card) {
  const { SUPA_URL, SUPA_ANON, SUPA_EMAIL, SUPA_PASSWORD, XC_GATEWAY_USER_ID } = process.env;
  const missing = Object.entries({ SUPA_URL, SUPA_ANON, SUPA_EMAIL, SUPA_PASSWORD, XC_GATEWAY_USER_ID })
    .filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) throw new Error(`missing env: ${missing.join(', ')}`);

  const login = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPA_ANON, 'content-type': 'application/json' },
    body: JSON.stringify({ email: SUPA_EMAIL, password: SUPA_PASSWORD }),
  }).then((r) => r.json());
  if (!login.access_token) throw new Error(`storage_auth_failed: ${JSON.stringify(login).slice(0, 200)}`);

  const row = {
    user_id: login.user?.id,
    project_id: `wb_${nsFor(XC_GATEWAY_USER_ID)}_${card.id}`,
    source_platform: 'xc-workbench',
    card_type: PROJECT_DELIVERY,
    ...toCheckpointFields(card),
  };
  const res = await fetch(`${SUPA_URL}/rest/v1/work_checkpoints?on_conflict=user_id,project_id`, {
    method: 'POST',
    headers: {
      apikey: SUPA_ANON, authorization: `Bearer ${login.access_token}`,
      'content-type': 'application/json', prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(row),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`storage_failed ${res.status}: ${text.slice(0, 300)}`);
  return { projectId: row.project_id };
}

async function main() {
  const args = process.argv.slice(2);
  const runDir = args.find((a) => !a.startsWith('--'));
  if (!runDir) { console.error('usage: import-run.mjs <run-dir> --sentence "..." [--push]'); process.exit(2); }
  const i = args.indexOf('--sentence');
  const sentence = i > -1 ? args[i + 1] : '给我家 Airbnb 做全套上架包';
  const card = await buildFromRun(resolve(runDir), sentence);
  const out = join(resolve(runDir), 'reports/project_delivery.card.json');
  await writeFile(out, JSON.stringify(card, null, 2) + '\n', 'utf8');
  console.log(`card → ${out} (${card.stations.length} stations, ${card.artifacts.length} artifacts)`);
  if (args.includes('--push')) console.log(`pushed ${(await push(card)).projectId}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
