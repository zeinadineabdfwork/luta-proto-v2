// Servidor estático mínimo (sem dependências). localhost conta como contexto seguro,
// necessário para a Gamepad API.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.map': 'application/json',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.glb': 'model/gltf-binary',
};
const root = process.cwd();
const port = Number(process.env.PORT) || 5173;
createServer(async (req, res) => {
  let p = decodeURIComponent((req.url ?? '/').split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = normalize(join(root, p));
  if (!f.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const d = await readFile(f);
    res.writeHead(200, { 'Content-Type': types[extname(f).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(d);
  } catch { res.writeHead(404).end('404'); }
}).listen(port, () => console.log(`Abra http://localhost:${port}`));
