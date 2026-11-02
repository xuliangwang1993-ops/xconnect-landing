#!/usr/bin/env node
/* Render static 静态服务：serve ./site（零依赖，只有 node 内置模块） */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'site');
const PORT = process.env.PORT || 10000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime',
  '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.srt': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8',
  '.webp': 'image/webp', '.gif': 'image/gif',
  '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.manifest': 'application/manifest+json',
};

function safePath(p) {
  try {
    const clean = path.normalize(decodeURIComponent(p)).replace(/^(\.\.[/\\])+/, '');
    const full = path.join(ROOT, clean);
    return full.startsWith(ROOT) ? full : null;
  } catch { return null; }
}

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

  // 目录 → index.html
  let file = safePath(urlPath);
  if (file && fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    file = path.join(file, 'index.html');
  }
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }

  const ext = path.extname(file).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  const stat = fs.statSync(file);
  const headers = {
    'Content-Type': mime,
    'Content-Length': stat.size,
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
    'Access-Control-Allow-Origin': '*',
  };

  // Range 支持（mp4 拖动）
  const range = req.headers.range;
  if (range && /^bytes=/.test(range)) {
    const m = /bytes=(\d+)-(\d*)/.exec(range);
    const start = parseInt(m[1], 10);
    const end = m[2] ? parseInt(m[2], 10) : stat.size - 1;
    if (start >= stat.size) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
      res.end();
      return;
    }
    res.writeHead(206, {
      ...headers,
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Content-Length': end - start + 1,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(file, { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, { ...headers, 'Accept-Ranges': 'bytes' });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, () => {
  console.log(`xconnect-factory site on :${PORT} -> ${ROOT}`);
});
