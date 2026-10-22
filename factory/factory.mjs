// Factory front router: mounts the 搭台你唱戏 stage page and the AoI board
// in front of the Workbench server. Serves a fixed whitelist only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const STAGE_FILES = { 'index.html': 'text/html; charset=utf-8', 'styles.css': 'text/css; charset=utf-8',
  'app.js': 'text/javascript; charset=utf-8', 'icon.svg': 'image/svg+xml', 'brand-x.png': 'image/png' };
const AOI_FILES = { 'index.html': 'text/html; charset=utf-8', 'aoi-snapshot.js': 'text/javascript; charset=utf-8' };

export const ROUTES = {
  stage: '/', stageAssets: '/stage/', workbench: '/workbench', aoi: '/aoi', manifest: '/factory.json',
};

// Stage HTML uses relative asset paths; at "/" those would collide with the
// Workbench's own /styles.css and /app.js, so rewrite them to /stage/.
export function stageHtml() {
  const html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
  return html.replace(/(href|src)="(styles\.css|app\.js(\?[^"]*)?|icon\.svg|brand-x\.png)"/g, '$1="/stage/$2"');
}

function send(res, req, type, body) {
  res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' });
  res.end(req.method === 'HEAD' ? undefined : body);
  return true;
}

export function createFactory() {
  function handle(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    const p = new URL(req.url, 'http://localhost').pathname;
    if (p === '/' || p === '/index.html') return send(res, req, STAGE_FILES['index.html'], stageHtml());
    if (p.startsWith('/stage/')) {
      const name = p.slice('/stage/'.length);
      if (!Object.hasOwn(STAGE_FILES, name)) return false;
      if (name === 'index.html') return send(res, req, STAGE_FILES[name], stageHtml());
      return send(res, req, STAGE_FILES[name], fs.readFileSync(path.join(REPO, name)));
    }
    if (p === '/aoi' || p === '/aoi/') return send(res, req, AOI_FILES['index.html'], fs.readFileSync(path.join(HERE, 'aoi/index.html')));
    if (p.startsWith('/aoi/')) {
      const name = p.slice('/aoi/'.length);
      if (!Object.hasOwn(AOI_FILES, name)) return false;
      return send(res, req, AOI_FILES[name], fs.readFileSync(path.join(HERE, 'aoi', name)));
    }
    if (p === ROUTES.manifest) return send(res, req, 'application/json; charset=utf-8', JSON.stringify({
      name: 'X-connect 工厂', blocks: {
        stage: { path: '/', role: '搭台：对外门面 / 委托入口' },
        workbench: { path: '/workbench', role: '唱戏：卡片工作台、聊天、执行、语音' },
        aoi: { path: '/aoi', role: 'AoI 能力看板（fixture，只读）' },
        bridge: { path: '/bridge/*', role: 'PC 执行桥' }, voice: { path: '/voice', role: '实时语音 WebSocket' },
        slack: { path: '/slack/*', role: 'Slack 入口' },
      } }));
    return false;
  }
  return { handle };
}
