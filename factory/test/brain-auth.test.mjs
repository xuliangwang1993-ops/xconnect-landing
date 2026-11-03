// 总脑鉴权：游客会话不算登录。这是线上实测暴露的漏洞 —— 匿名也能拿到 ok:true。
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createBrain } from '../brain/brain.mjs';
import { createBrainStore } from '../brain/store.mjs';
import { createBrainApi } from '../brain/api.mjs';
import { createTreeStore } from '../tree/tree.mjs';

function call(api, { method = 'GET', url }) {
  return new Promise((resolve) => {
    const req = new http.IncomingMessage(null);
    req.method = method; req.url = url; req.headers = {};
    const res = { code: 0, writeHead(c) { this.code = c; }, end(b) { resolve({ code: this.code, json: b ? JSON.parse(b) : null }); } };
    api.handle(req, res).then((h) => { if (!h) resolve({ code: 0, json: null }); });
  });
}
const mk = (session) => {
  const store = createBrainStore({ env: {} });
  const brain = createBrain({ env: {}, store });
  return createBrainApi({ brain, store, tree: createTreeStore({ env: {} }), getSession: () => session });
};

const GUEST = { v: 1, guest: true, user: { id: 'guest_x', status: 'guest', guest: true } };
const REAL = { v: 1, user: { id: 'usr_1', email: 'a@b.c', status: 'active' } };

test('游客会话：调脑接口被拒', async () => {
  const r = await call(mk(GUEST), { url: '/api/brain/needs' });
  assert.equal(r.code, 401);
});

test('游客会话：连 ask 也调不了（不能拿游客身份刷模型）', async () => {
  const r = await call(mk(GUEST), { method: 'POST', url: '/api/brain/strong' });
  assert.equal(r.code, 401);
});

test('完全没会话：被拒', async () => {
  const r = await call(mk(null), { url: '/api/brain/needs' });
  assert.equal(r.code, 401);
});

test('health 对匿名只给最小信息，不暴露模型与存储', async () => {
  const r = await call(mk(GUEST), { url: '/api/brain/health' });
  assert.equal(r.code, 200);
  assert.equal(r.json.authed, false);
  assert.equal(r.json.model, undefined, '不该告诉匿名者用的什么模型');
  assert.equal(r.json.store, undefined, '不该暴露存储模式');
});

test('真实登录：正常通过，health 给完整信息', async () => {
  const a = mk(REAL);
  const needs = await call(a, { url: '/api/brain/needs' });
  assert.equal(needs.code, 200);
  const h = await call(a, { url: '/api/brain/health' });
  assert.equal(h.code, 200);
  assert.equal(h.json.authed, true);
  assert.ok(h.json.model, '登录用户能看到模型配置');
});
