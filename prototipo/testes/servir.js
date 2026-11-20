// Servidor estático mínimo para a página de ajuste do pizzaiolo (http://localhost:5175/).
// Serve a pasta prototipo/ para a página de teste usar o mesmo módulo do site (src/pizzaiolo.js).
const http = require('http');
const fs = require('fs');
const path = require('path');
const porta = +process.env.PORT || 5175;
const raiz = path.join(__dirname, '..');
const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
http.createServer((req, res) => {
  const nome = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
  if (!nome) { res.writeHead(302, { Location: '/testes/pizzaiolo.html' }); res.end(); return; }
  const arq = path.join(raiz, path.normalize(nome));
  if (!arq.startsWith(raiz) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': tipos[path.extname(arq)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(arq).pipe(res);
}).listen(porta, () => console.log('http://localhost:' + porta + '/testes/pizzaiolo.html'));
