// Servidor estático mínimo para testar o protótipo localmente (envolve a página no mesmo esqueleto do artifact).
// Também serve os logos originais e recebe versões otimizadas geradas no navegador (POST /salvar-logo/<nome>).
const http = require('http');
const fs = require('fs');
const path = require('path');
const porta = +process.env.PORT || 5174;
const logos = path.join(__dirname, 'src', 'logos');
const esqueleto = (corpo) => '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>' + corpo + '</body></html>';
http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(esqueleto(fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8')));
  } else if (req.method === 'GET' && /^\/logos\/[\w.-]+\.webp$/.test(url)) {
    res.writeHead(200, { 'Content-Type': 'image/webp' });
    res.end(fs.readFileSync(path.join(logos, path.basename(url))));
  } else if (req.method === 'POST' && /^\/salvar-logo\/[\w-]+\.webp$/.test(url)) {
    let corpo = '';
    req.on('data', (c) => { corpo += c; });
    req.on('end', () => {
      const b64 = corpo.replace(/^data:image\/webp;base64,/, '');
      fs.writeFileSync(path.join(logos, 'opt-' + path.basename(url)), Buffer.from(b64, 'base64'));
      res.writeHead(200); res.end('ok');
    });
  } else { res.writeHead(404); res.end(); }
}).listen(porta, () => console.log('http://localhost:' + porta));
