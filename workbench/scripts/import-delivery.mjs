#!/usr/bin/env node
// Import a pipeline delivery payload as a workbench card.
//
//   node scripts/import-delivery.mjs \
//     --payload ../../craft-skills/runs/dev/07_customer/project_delivery.json \
//     --base http://127.0.0.1:8789 \
//     --key  sk-xc-...            # or WORKBENCH_KEY
//
// The script never writes to Supabase directly: it goes through the same
// POST /api/cards the UI uses, so auth, namespacing and validation stay in one
// place. Credentials come from flags or env, never from a file in the repo.

import { readFile } from 'node:fs/promises';
import { normalizeCard } from '../cards/project-delivery.mjs';

function arg(name, fallback = '') {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const payloadPath = arg('payload');
const base = arg('base', process.env.WORKBENCH_BASE || 'http://127.0.0.1:8789');
const key = arg('key', process.env.WORKBENCH_KEY || '');

if (!payloadPath) {
  console.error('usage: node scripts/import-delivery.mjs --payload <project_delivery.json> [--base URL] [--key KEY]');
  process.exit(2);
}

const raw = JSON.parse(await readFile(payloadPath, 'utf8'));
const card = normalizeCard(raw);

if (!card.stations.length) {
  console.error('payload has no stations — refusing to import a card that claims nothing');
  process.exit(1);
}

const body = {
  type: 'project_delivery',
  title: `${card.sentence.slice(0, 40)}… · ${card.runId}`,
  project: '宣传视频试生产',
  text: [
    card.sentence,
    '',
    `run: ${card.runId}`,
    `站点: ${card.stations.map((s) => `${s.label}(${s.status}${s.score == null ? '' : ' ' + s.score})`).join(' / ')}`,
    `交付: ${card.artifacts.map((a) => a.name).join(', ')}`,
    `缺口: ${card.gaps.join('; ')}`,
    `待客户: ${card.pendingCustomer.join('; ')}`,
  ].join('\n'),
  delivery: card,
  source: { kind: 'manual', label: '视频流水线' },
};

if (!key) {
  console.log('[dry-run] no --key given; card that would be posted:\n');
  console.log(JSON.stringify(body, null, 2).slice(0, 2000));
  process.exit(0);
}

const login = await fetch(`${base}/api/session`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ key }),
});
if (!login.ok) {
  console.error('login failed', login.status, await login.text());
  process.exit(1);
}
const cookie = login.headers.get('set-cookie')?.split(';')[0] || '';
const res = await fetch(`${base}/api/cards`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie },
  body: JSON.stringify(body),
});
const out = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error('card import failed', res.status, out);
  process.exit(1);
}
console.log(`imported card ${out.card?.id} (${card.stations.length} stations, ${card.artifacts.length} artifacts)`);
