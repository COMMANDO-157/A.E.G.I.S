import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function startTestServer() {
  const root = fileURLToPath(new URL('.', import.meta.url));
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const file = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      if (!file.startsWith(resolve(root) + sep) || !types[extname(file)]) { res.writeHead(404).end(); return; }
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': types[extname(file)], 'Cache-Control': 'no-store' }).end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { url: 'http://127.0.0.1:' + server.address().port, close: () => new Promise(resolve => server.close(resolve)) };
}
