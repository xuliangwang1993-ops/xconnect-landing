// Factory front router: mounts the 搭台你唱戏 stage page and the AoI board
// in front of the Workbench server. Serves a fixed whitelist only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchAoiSnapshot } from './aoi/aoi-live.mjs';
import { loadWorkNodes } from './graph/work-nodes.mjs';
import { createTreeStore, handleTree } from './tree/tree.mjs';
import { listAssistants, patchAssistant } from './settings/settings-api.mjs';
import { answer as guideAnswer, parseGuide } from './guide/guide.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const STAGE_FILES = { 'index.html': 'text/html; charset=utf-8', 'portal.html': 'text/html; charset=utf-8', 'styles.css': 'text/css; charset=utf-8',
  'app.js': 'text/javascript; charset=utf-8', 'factory-home.js': 'text/javascript; charset=utf-8', 'icon.svg': 'image/svg+xml', 'brand-x.png': 'image/png', 'brand-logo.png': 'image/png' };
const GUIDE_FILES = { 'guide-widget.js': 'text/javascript; charset=utf-8' };
export const GUIDE_TAG = '<script src="/i18n/xc-i18n.js"></script>\n<script src="/skin/xc-skin.js"></script>\n<script src="/guide/guide-widget.js" defer></script>';
const GRAPH_FILES = { 'graph-view.js': 'text/javascript; charset=utf-8' };
const AOI_FILES = { 'index.html': 'text/html; charset=utf-8', 'aoi-snapshot.js': 'text/javascript; charset=utf-8' };

export const ROUTES = {
  stage: '/', portal: '/portal', stageAssets: '/stage/', workbench: '/workbench', aoi: '/aoi', manifest: '/factory.json', guide: '/guide', graph: '/graph', settings: '/settings',
};

// Stage HTML uses relative asset paths; at "/" those would collide with the
// Workbench's own /styles.css and /app.js, so rewrite them to /stage/.
export function stageHtml() {
  const html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
  return html.replace(/(href|src)="(styles\.css|app\.js(\?[^"]*)?|factory-home\.js|icon\.svg|brand-x\.png|brand-logo\.png)"/g, '$1="/stage/$2"')
    .replace('</body>', GUIDE_TAG + '\n</body>');
}
export function portalHtml() {
  const html = fs.readFileSync(path.join(REPO, 'portal.html'), 'utf8');
  return html.replace(/(href|src)="(styles\.css|app\.js(\?[^"]*)?|icon\.svg|brand-x\.png|brand-logo\.png)"/g, '$1="/stage/$2"')
    .replace('</body>', GUIDE_TAG + '\n</body>');
}

function send(res, req, type, body) {
  res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' });
  res.end(req.method === 'HEAD' ? undefined : body);
  return true;
}

export function createFactory({ env = process.env, fetchImpl = globalThis.fetch, getSession = () => null, speakers = [] } = {}) {
  const tree = createTreeStore({ env, fetchImpl });
  const speakerIds = new Set(speakers.map((s) => s.id));
  const sendJson = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); return true; };
  function handle(req, res) {
    { const sp = new URL(req.url, 'http://localhost').pathname;
      if (sp === '/settings/api/assistants' && req.method === 'GET') {
        listAssistants({ env, fetchImpl, session: getSession(req) })
          .catch((e) => ({ ok: false, error: String(e && e.message || e) }))
          .then((d) => sendJson(res, 200, { ...d, speakers }));
        return true;
      }
      const m = sp.match(/^\/settings\/api\/assistants\/([^/]+)$/);
      if (m && req.method === 'PUT') {
        if (!getSession(req)) return sendJson(res, 401, { ok: false, error: 'login_required' });
        let raw = '';
        req.on('data', (c) => { raw += c; if (raw.length > 20_000) req.destroy(); });
        req.on('end', () => {
          let body = {}; try { body = JSON.parse(raw || '{}'); } catch {}
          patchAssistant({ env, fetchImpl, id: decodeURIComponent(m[1]), body, speakerIds: speakerIds.size ? speakerIds : null })
            .catch((e) => ({ ok: false, error: String(e && e.message || e) }))
            .then((d) => sendJson(res, d.ok ? 200 : 400, d));
        });
        return true;
      }
      if ((sp === '/settings' || sp === '/settings/') && (req.method === 'GET' || req.method === 'HEAD'))
        return send(res, req, 'text/html; charset=utf-8', fs.readFileSync(path.join(HERE, 'settings/index.html'), 'utf8').replace('</body>', GUIDE_TAG + '\n</body>'));
    }
    if (handleTree(req, res, tree)) return true;
    { const tp = new URL(req.url, 'http://localhost').pathname;
      if ((tp === '/tree' || tp === '/tree/') && (req.method === 'GET' || req.method === 'HEAD'))
        return send(res, req, 'text/html; charset=utf-8', fs.readFileSync(path.join(HERE, 'tree/index.html'), 'utf8') + '\n' + GUIDE_TAG); }
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    const p = new URL(req.url, 'http://localhost').pathname;
    if (p === '/guide' || p === '/guide/') return send(res, req, 'text/html; charset=utf-8', fs.readFileSync(path.join(HERE, 'guide/index.html')));
    if (p === '/guide/api/sections') return send(res, req, 'application/json; charset=utf-8',
      JSON.stringify({ sections: parseGuide().map(({ id, title, links }) => ({ id, title, links })) }));
    if (p === '/guide/api/ask') {
      const q = new URL(req.url, 'http://localhost').searchParams.get('q') || '';
      return guideAnswer(q, { env, fetchImpl })
        .catch(() => ({ source: 'guide', text: '导览暂时出错了。', links: [] }))
        .then((d) => send(res, req, 'application/json; charset=utf-8', JSON.stringify(d)));
    }
    if (p === '/skin/xc-skin.js') return send(res, req, 'text/javascript; charset=utf-8', fs.readFileSync(path.join(HERE, 'skin/xc-skin.js')));
    if (p === '/i18n/xc-i18n.js') return send(res, req, 'text/javascript; charset=utf-8', fs.readFileSync(path.join(HERE, 'i18n/xc-i18n.js')));
    if (p.startsWith('/guide/')) {
      const name = p.slice('/guide/'.length);
      if (!Object.hasOwn(GUIDE_FILES, name)) return false;
      return send(res, req, GUIDE_FILES[name], fs.readFileSync(path.join(HERE, 'guide', name)));
    }
    if (p === '/graph' || p === '/graph/') return send(res, req, 'text/html; charset=utf-8', fs.readFileSync(path.join(HERE, 'graph/index.html'), 'utf8').replace('</body>', GUIDE_TAG + '\n</body>'));
    if (p === '/graph/api/nodes') return loadWorkNodes({ store: tree })
      .then((d) => send(res, req, 'application/json; charset=utf-8', JSON.stringify(d)));
    if (p.startsWith('/graph/')) {
      const name = p.slice('/graph/'.length);
      if (!Object.hasOwn(GRAPH_FILES, name)) return false;
      return send(res, req, GRAPH_FILES[name], fs.readFileSync(path.join(HERE, 'graph', name)));
    }
    if (p === '/aoi/api/snapshot') {
      return fetchAoiSnapshot({ env, fetchImpl })
        .catch((e) => ({ source: 'fixture', reason: String(e && e.message || e) }))
        .then((d) => send(res, req, 'application/json; charset=utf-8', JSON.stringify(d)));
    }
    if (p === '/' || p === '/index.html') return send(res, req, STAGE_FILES['index.html'], stageHtml());
    if (p === '/portal' || p === '/portal/' || p === '/portal.html') return send(res, req, STAGE_FILES['portal.html'], portalHtml());
    if (p.startsWith('/stage/')) {
      const name = p.slice('/stage/'.length);
      if (!Object.hasOwn(STAGE_FILES, name)) return false;
      if (name === 'index.html') return send(res, req, STAGE_FILES[name], stageHtml());
      if (name === 'portal.html') return send(res, req, STAGE_FILES[name], portalHtml());
      if (name === 'factory-home.js') return send(res, req, STAGE_FILES[name], fs.readFileSync(path.join(REPO, 'factory-home.js')));
      return send(res, req, STAGE_FILES[name], fs.readFileSync(path.join(REPO, name)));
    }
    if (p === '/aoi' || p === '/aoi/') return send(res, req, AOI_FILES['index.html'], fs.readFileSync(path.join(HERE, 'aoi/index.html'), 'utf8').replace('</body>', GUIDE_TAG + '\n</body>'));
    if (p.startsWith('/aoi/')) {
      const name = p.slice('/aoi/'.length);
      if (!Object.hasOwn(AOI_FILES, name)) return false;
      return send(res, req, AOI_FILES[name], fs.readFileSync(path.join(HERE, 'aoi', name)));
    }
    if (p === ROUTES.manifest) return send(res, req, 'application/json; charset=utf-8', JSON.stringify({
      name: 'X-connect 工厂', blocks: {
        stage: { path: '/', role: '搭台：对外门面 / 委托入口' },
        workbench: { path: '/workbench', role: '唱戏：卡片工作台、聊天、执行、语音' },
        aoi: { path: '/aoi', role: 'AoI 能力看板（只读：真实 AoI M11 API，不可用时回退 fixture）' },
        bridge: { path: '/bridge/*', role: 'PC 执行桥' }, voice: { path: '/voice', role: '实时语音 WebSocket' },
        slack: { path: '/slack/*', role: 'Slack 入口' },
        graph: { path: '/graph', role: 'Tree|Graph 一键切换（同一 work_nodes 数据源，?view=&node= 深链）' },
        tree: { path: '/tree', role: '业务进树：work_nodes 建/改（idea→in_progress→evidence→verified）' },
        guide: { path: '/guide', role: '图书馆管理员导览（只讲解带路，不写入不付款）' },
      } }));
    return false;
  }
  return { handle };
}
