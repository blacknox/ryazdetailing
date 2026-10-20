// e2e/host.js — production-like хост для E2E: раздаёт статику сайта и проксирует /api и /uploads на бэкенд
// с одного origin (как это делает Nginx), чтобы работали cookie-сессии и CSRF-заголовок.
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2', '.woff': 'font/woff' };

function startHost({ siteDir, port, backendPort }) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/') || url.pathname === '/health') {
      const p = http.request({ host: '127.0.0.1', port: backendPort, path: req.url, method: req.method, headers: req.headers }, (r) => {
        res.writeHead(r.statusCode, r.headers); r.pipe(res);
      });
      p.on('error', () => { res.writeHead(502); res.end('bad gateway'); });
      req.pipe(p); return;
    }
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    let file = path.join(siteDir, rel);
    if (!file.startsWith(siteDir)) { res.writeHead(403); return res.end(); }
    if (!fs.existsSync(file) && !path.extname(file) && fs.existsSync(file + '.html')) file += '.html';
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404'); }
    // Имитация боевого Nginx: gzip для текста, кеш для статики, HTML всегда перепроверяется.
    const ext = path.extname(file), type = MIME[ext] || 'application/octet-stream';
    const textual = /^(text\/|application\/(json|xml)|image\/svg)/.test(type);
    const headers = { 'Content-Type': type, 'Cache-Control': ext === '.html' || ext === '.xml' || ext === '.txt' ? 'no-cache' : 'public, max-age=2592000' };
    if (textual && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
      headers['Content-Encoding'] = 'gzip'; headers['Vary'] = 'Accept-Encoding';
      res.writeHead(200, headers); fs.createReadStream(file).pipe(zlib.createGzip({ level: 6 })).pipe(res);
    } else { res.writeHead(200, headers); fs.createReadStream(file).pipe(res); }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}
module.exports = { startHost };
