import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
export function createEditorServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const parts = (url === '/' ? '/index.html' : url).slice(1).split('/');
      if (parts.some(p => !p || p === '.' || p === '..' || /[\\:\x00]/.test(p))) throw Error();
      if (!(parts.length === 1 && parts[0] === 'index.html') && !['js','css','assets'].includes(parts[0])) throw Error();
      const file = path.join(root, ...parts), data = await fs.readFile(file);
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' }); res.end(data);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
}
