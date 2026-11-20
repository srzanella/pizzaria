// Proxy da gravação (porta 5310): o palco e todas as telas no MESMO endereço, para as páginas ficarem dentro do
// palco e os cookies da gestão (SameSite=Strict) funcionarem.
//   /palco/...   → a página que monta a cena (gravacao/palco)
//   /logos/...   → os logos da pizzaria
//   o resto      → o servidor de demonstração (5301): site, gestão, app do entregador e API
// A gestão só entra depois que a "cliente" envia o pedido no vídeo: assim o pedido do site nunca sai com a sessão da equipe.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const PALCO = path.join(import.meta.dirname, 'palco');
const LOGOS = path.resolve(import.meta.dirname, '..', '..', 'prototipo', 'src', 'logos');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json' };
function estatico(res, base, rel) {
  const arq = path.resolve(base, rel || 'index.html');
  if (!arq.startsWith(base + path.sep) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arq)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(arq).pipe(res);
}
http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/palco' || url.startsWith('/palco/')) return estatico(res, PALCO, url.slice(7));
  if (url.startsWith('/logos/')) return estatico(res, LOGOS, url.slice(7));
  const p = http.request({ host: '127.0.0.1', port: 5301, method: req.method, path: req.url, headers: req.headers }, (r) => {
    res.writeHead(r.statusCode, r.headers);
    r.pipe(res);
  });
  p.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
  req.pipe(p);
}).listen(5310, () => console.log('proxy da gravação: http://localhost:5310/palco/'));
