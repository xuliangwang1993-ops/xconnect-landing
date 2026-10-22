import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseGuide, retrieve, answer } from '../guide/guide.mjs';
import { createFactory, stageHtml } from '../factory.mjs';

const S = parseGuide();
const call = async (f, url) => { const res = { writeHead(c, h) { this.code = c; this.h = h; }, end(b) { this.body = b ? String(b) : ''; } };
  const r = f.handle({ url, method: 'GET' }, res); if (r && r.then) await r; return { handled: !!r, ...res }; };

test('guide parsed from docs/factory-guide.md with links', () => {
  assert.ok(S.length >= 10);
  assert.ok(S.every((s) => s.title && s.body && s.keywords.length && s.links.length));
  assert.ok(S.flatMap((s) => s.links).every((l) => /^\/(#|workbench|aoi|$)/.test(l.href)));
});

test('deterministic retrieval routes questions to the right page', () => {
  const t = (q) => retrieve(q, S)[0]?.title || '';
  assert.match(t('怎么发起新委托？'), /发起委托/);
  assert.match(t('卡片怎么批准'), /卡片/);
  assert.match(t('AoI 看板里 verified 是什么意思'), /AoI/);
  assert.match(t('怎么查询订单进展'), /进展/);
  assert.deepEqual(retrieve('怎么批准', S), retrieve('怎么批准', S));
});

test('answer works with no key; refuses writes/payments; unknown -> overview', async () => {
  const a = await answer('卡片怎么批准', { env: {} });
  assert.equal(a.source, 'guide'); assert.ok(a.links.some((l) => l.href === '/workbench'));
  const p = await answer('帮我付款下单', { env: {} });
  assert.match(p.text, /不能替你下单、付款/);
  const u = await answer('xyzzy', { env: {} });
  assert.match(u.text, /总览/);
});

test('optional model: grounded, env-only key, falls back on error', async () => {
  let req;
  const env = { GUIDE_MODEL_API_BASE: 'https://gw.example/v1/', GUIDE_MODEL_API_KEY: 'k' };
  const a = await answer('怎么写委托', { env, fetchImpl: async (u, o) => { req = { u, o }; return { ok: true, json: async () => ({ choices: [{ message: { content: '模型回答' } }] }) }; } });
  assert.equal(a.source, 'model'); assert.equal(a.text, '模型回答');
  assert.equal(req.u, 'https://gw.example/v1/chat/completions'); assert.equal(req.o.headers.authorization, 'Bearer k');
  assert.match(JSON.parse(req.o.body).messages[0].content, /三件事/);
  const b = await answer('怎么写委托', { env, fetchImpl: async () => { throw new Error('down'); } });
  assert.equal(b.source, 'guide');
});

test('factory routes: /guide page, widget, ask API, launcher injected, read-only', async () => {
  const f = createFactory({ env: {} });
  assert.match((await call(f, '/guide')).body, /guide-widget\.js/);
  assert.equal((await call(f, '/guide/guide-widget.js')).handled, true);
  assert.equal((await call(f, '/guide/../package.json')).handled, false);
  const a = JSON.parse((await call(f, '/guide/api/ask?q=' + encodeURIComponent('工作台怎么登录'))).body);
  assert.match(a.sections[0], /工作台/);
  assert.ok(JSON.parse((await call(f, '/guide/api/sections')).body).sections.length >= 10);
  assert.match(stageHtml(), /\/guide\/guide-widget\.js/);
  assert.match(fs.readFileSync(new URL('../../workbench/public/index.html', import.meta.url), 'utf8'), /\/guide\/guide-widget\.js/);
  assert.equal(f.handle({ url: '/guide/api/ask', method: 'POST' }, {}), false);
});
