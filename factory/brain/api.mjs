// 总脑 HTTP 面：/api/brain/*
//
// 鉴权：与 /api/chat 同一套会话 cookie（getSession）。没登录 → 401。
// 未配置模型密钥 → 200 + configured:false，前端据此直通小助手，不卡。
//
// 任务派发复用 factory/tree/tree.mjs 的 work_nodes store，不另造系统：
// 需求确认后 → POST /api/brain/needs/:id/convert 建 ticket 节点（stage=idea），
// 总脑每轮给的任务 → POST /api/brain/tasks 建 ticket 节点。
import { fingerprint } from './prompt.mjs';

const PRIO_NOTE = { urgent: '紧急', high: '高', normal: '普通', low: '低' };

function readJson(req, limit = 100_000) {
  return new Promise((ok, bad) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > limit) { bad(Object.assign(new Error('too big'), { status: 413 })); req.destroy(); } });
    req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { bad(Object.assign(e, { status: 400 })); } });
    req.on('error', bad);
  });
}

export function createBrainApi({ brain, store, tree, getSession = () => null }) {
  // 待送达队列：服务端算完的强档结论，等前端来取。按会话分桶，取走即删。
  const outbox = new Map(); // sessionId -> [payload]
  const json = (res, code, body) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
    return true;
  };

  brain.useDeliver?.((payload) => {
    const list = outbox.get(payload.sessionId) || [];
    list.push(payload);
    outbox.set(payload.sessionId, list.slice(-5));
  });

  const nodeForTask = (task, sessionId) => tree.upsert({
    kind: 'ticket',
    title: String(task.title || '').slice(0, 120),
    stage: 'idea',
    note: `[总脑] ${task.detail || ''}${task.priority ? ` (优先级:${PRIO_NOTE[task.priority] || task.priority})` : ''} 来源会话 ${sessionId || '-'}`.trim(),
  });

  return {
    /** 返回 true 表示已处理。 */
    async handle(req, res) {
      const u = new URL(req.url, 'http://localhost');
      const p = u.pathname;
      if (p !== '/api/brain' && !p.startsWith('/api/brain/')) return false;
      if (!getSession(req)) return json(res, 401, { error: 'login_required' });

      try {
        // ---- 第 1 步：接收每一轮对话 ----
        if (p === '/api/brain/turn' && req.method === 'POST') {
          const b = await readJson(req);
          const sessionId = String(b.sessionId || b.session_id || '').slice(0, 80);
          const text = String(b.text || '').slice(0, 4000);
          if (!sessionId || !text) return json(res, 400, { error: 'sessionId and text required' });
          const turn = await store.addTurn({ sessionId, role: b.role, text, assistantId: b.assistantId || b.assistant_id, at: b.at });
          return json(res, 201, { ok: true, turn: { id: turn.id, at: turn.at } });
        }

        // ---- 第 3 步：先问总脑再说话 ----
        if (p === '/api/brain/ask' && req.method === 'POST') {
          const b = await readJson(req);
          const sessionId = String(b.sessionId || '').slice(0, 80);
          if (!sessionId) return json(res, 400, { error: 'sessionId required' });
          const out = await brain.forTurn({ sessionId, turns: Array.isArray(b.turns) ? b.turns.slice(-24) : [], assistantId: b.assistantId, lang: b.lang || 'zh' });
          return json(res, 200, { ok: out.ok, reply: out.reply, tasks: out.tasks, questions: out.questions, needs: out.needs, reason: out.reason, latencyMs: out.latencyMs, budgetMs: out.budgetMs, model: out.model });
        }

        // ---- 智库：慢而强的总脑。立刻回 pending，结论稍后从 /api/brain/pending 取走 ----
        if (p === '/api/brain/strong' && req.method === 'POST') {
          const b = await readJson(req);
          const sessionId = String(b.sessionId || '').slice(0, 80);
          if (!sessionId) return json(res, 400, { error: 'sessionId required' });
          const out = await brain.askStrong({ sessionId, turns: Array.isArray(b.turns) ? b.turns : [], assistantId: b.assistantId, lang: b.lang || 'zh' });
          return json(res, 202, out);
        }
        if (p === '/api/brain/pending' && req.method === 'GET') {
          const sessionId = String(u.searchParams.get('sessionId') || '').slice(0, 80);
          const list = outbox.get(sessionId) || [];
          outbox.delete(sessionId);
          return json(res, 200, { items: list });
        }

        // ---- 第 4 步：主动模式 ----
        if (p === '/api/brain/proactive' && (req.method === 'POST' || req.method === 'GET')) {
          const b = req.method === 'POST' ? await readJson(req) : Object.fromEntries(u.searchParams);
          const s = await store.settings();
          if (!s.proactive) return json(res, 200, { question: null, reason: 'disabled' });
          const sessionId = String(b.sessionId || '').slice(0, 80);
          if (!sessionId) return json(res, 400, { error: 'sessionId required' });
          const out = await brain.proactiveTick({ sessionId, turns: Array.isArray(b.turns) ? b.turns.slice(-16) : [], lastLookAt: Number(b.lastLookAt) || 0 });
          return json(res, 200, out);
        }

        // ---- 第 5 步：需求 ----
        if (p === '/api/brain/needs' && req.method === 'GET') {
          const needs = await brain.needs({ status: u.searchParams.get('status') || undefined, limit: Number(u.searchParams.get('limit')) || 100 });
          return json(res, 200, { mode: store.mode, configured: brain.configured, needs });
        }
        let m = /^\/api\/brain\/needs\/([^/]+)\/convert$/.exec(p);
        if (m && req.method === 'POST') {
          const needId = decodeURIComponent(m[1]);
          const need = await store.getNeed(needId);
          if (!need) return json(res, 404, { error: 'not_found' });
          if (need.status === 'converted') return json(res, 409, { error: 'already_converted' });
          const node = await tree.upsert({
            kind: 'ticket',
            title: String(need.need).slice(0, 120),
            stage: 'idea',
            note: `[总脑·需求] ${need.need}\n依据：${(need.evidence || []).join(' / ')}\n置信度：${need.confidence}`.slice(0, 900),
          });
          const updated = await store.setNeedStatus(needId, 'converted');
          return json(res, 201, { ok: true, node, need: updated });
        }
        m = /^\/api\/brain\/needs\/([^/]+)$/.exec(p);
        if (m && req.method === 'PATCH') {
          const b = await readJson(req);
          const need = await store.setNeedStatus(decodeURIComponent(m[1]), String(b.status || ''), { confidence: b.confidence });
          return json(res, 200, { ok: true, need });
        }

        // ---- 第 6 步：任务派发（直接进 work_nodes）----
        if (p === '/api/brain/tasks' && req.method === 'POST') {
          const b = await readJson(req);
          const tasks = Array.isArray(b.tasks) ? b.tasks : [b];
          const nodes = [];
          for (const t of tasks.slice(0, 10)) {
            if (!t || !String(t.title || '').trim()) continue;
            nodes.push(await nodeForTask(t, String(b.sessionId || '').slice(0, 80)));
          }
          return json(res, 201, { ok: true, nodes });
        }

        // ---- 设置里的开关 ----
        if (p === '/api/brain/settings' && req.method === 'GET') {
          const s = await store.settings();
          return json(res, 200, { ...s, configured: brain.configured, model: brain.model, timeoutMs: brain.timeoutMs, mode: store.mode });
        }
        if (p === '/api/brain/settings' && req.method === 'PUT') {
          const b = await readJson(req);
          const s = await brain.setProactive(b.proactive !== false);
          return json(res, 200, { ok: true, ...s });
        }

        // ---- 自检：不打印任何密钥，只报告名字与是否配置 ----
        if (p === '/api/brain/health' && req.method === 'GET') {
          return json(res, 200, {
            ok: true,
            configured: brain.configured,
            store: store.mode,
            tree: tree.mode,
            model: brain.model,
            timeoutMs: brain.timeoutMs,
            strongTimeoutMs: brain.strongTimeoutMs,
            contextChars: brain.contextChars,
            memoryLayers: !!brain.memoryLayers, // 三层记忆是否开启（BRAIN_MEMORY_LAYERS=on）
            proactiveTimeoutMs: brain.proactiveTimeoutMs,
            stats: brain.stats,
            missing: brain.configured ? [] : ['BRAIN_MODEL_API_BASE', 'BRAIN_MODEL_API_KEY'],
            fpSample: fingerprint('做一个小程序'),
          });
        }
        return json(res, 404, { error: 'not_found' });
      } catch (e) {
        return json(res, e.status || 500, { error: String(e.message || e) });
      }
    },
  };
}
