#!/usr/bin/env node
// 把 craft-skills 的一次流水线 run 导入成 project_delivery 卡片。
//   node scripts/import-promo-run.mjs <craft-skills 根目录> <run_id> [--out card.json] [--push]
// 默认只生成 JSON（dry-run）。--push 才写 Supabase，地址/凭据只读环境变量：
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_ACCESS_TOKEN（已登录用户的 JWT）, WORKBENCH_NS（工作台命名空间）
import fs from 'node:fs';
import { buildProjectDeliveryCard, validateProjectDelivery } from '../project-delivery.mjs';

const [repo, runId, ...rest] = process.argv.slice(2);
if (!repo || !runId) { console.error('用法: import-promo-run.mjs <repo> <run_id> [--out f] [--push]'); process.exit(64); }
const card = buildProjectDeliveryCard(repo, runId);
const errs = validateProjectDelivery(card);
if (errs.length) { console.error('卡片校验失败:', errs.join(', ')); process.exit(2); }
const oi = rest.indexOf('--out');
const json = JSON.stringify(card, null, 2);
if (oi >= 0) fs.writeFileSync(rest[oi + 1], json + '\n'); else console.log(json);

if (rest.includes('--push')) {
  const { SUPABASE_URL: url, SUPABASE_ANON_KEY: anon, SUPABASE_ACCESS_TOKEN: tok, WORKBENCH_NS: ns } = process.env;
  if (!url || !anon || !tok || !ns) { console.error('--push 需要 SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_ACCESS_TOKEN / WORKBENCH_NS'); process.exit(78); }
  const row = {
    project_id: `wb_${ns}_${card.id}`, source_platform: 'xc-workbench',
    goal: card.title, constraints: card.original, progress: card.working, decisions: '{}', todos: [],
    sources: [{ kind: 'workbench-card', data: card }],
  };
  const r = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/work_checkpoints?on_conflict=user_id,project_id`, {
    method: 'POST',
    headers: { apikey: anon, authorization: `Bearer ${tok}`, 'content-type': 'application/json', prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(row),
  });
  if (!r.ok) { console.error('写入失败', r.status, (await r.text()).slice(0, 300)); process.exit(1); }
  console.error('已写入', row.project_id);
}
