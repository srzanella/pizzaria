// Monta o protótipo num único index.html (logos embutidos, dados e script inline).
// Uso: node build.js            -> mantém a senha do admin já gerada
//      node build.js --nova-senha -> gera nova senha para o usuário admin
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const src = path.join(__dirname, 'src');
const ler = (f) => fs.readFileSync(path.join(src, f), 'utf8');
const dataURI = (f) => { const opt = path.join(src, 'logos', 'opt-' + f); return 'data:image/webp;base64,' + fs.readFileSync(fs.existsSync(opt) ? opt : path.join(src, 'logos', f)).toString('base64'); };

const credFile = path.join(__dirname, 'CREDENCIAIS-PROTOTIPO.md');
let senha;
if (!process.argv.includes('--nova-senha') && fs.existsSync(credFile)) {
  const m = fs.readFileSync(credFile, 'utf8').match(/Senha: `([^`]+)`/);
  senha = m && m[1];
}
if (!senha) {
  senha = crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, '').slice(0, 12);
  fs.writeFileSync(credFile, [
    '# Acesso ao portal do protótipo',
    '',
    'Portal: rodapé do site → "Área da equipe" (ou o link do artifact com `#portal` no final).',
    '',
    '- Usuário: `admin`',
    '- Senha: `' + senha + '`',
    '',
    'No servidor (Docker), esta é só a senha inicial do admin (ADMIN_SENHA_INICIAL do .env): troque na gestão,',
    'menu do seu nome → Minha senha. Não compartilhe este arquivo.',
    ''
  ].join('\n'));
}
const salt = crypto.randomBytes(12).toString('hex');
const hash = crypto.createHash('sha256').update(salt + senha).digest('hex');

// usuários do portal: só na versão de protótipo (artifact, login no navegador). No servidor eles ficam no banco
// (equipe.js) e a página pública não leva nenhum usuário nem hash de senha.
const dadosSrc = JSON.parse(ler('data.json'));
if (!Array.isArray(dadosSrc.usuarios) || !dadosSrc.usuarios.length) dadosSrc.usuarios = [{ id: 'u-admin', nome: 'Administrador', login: 'admin', admin: true, salt: '%%ADMIN_SALT%%', hash: '%%ADMIN_HASH%%' }];
const data = JSON.stringify(dadosSrc).replace('%%ADMIN_SALT%%', salt).replace('%%ADMIN_HASH%%', hash);
JSON.parse(data); // valida
const json = JSON.stringify(JSON.parse(data)).replace(/</g, '\\u003c');

const logos = JSON.stringify({ h: dataURI('logo-horizontal.webp'), v: dataURI('logo-vertical.webp'), selo: dataURI('logo-selo.webp') });
const troca = (s) => s;

const html = troca(ler('page.html')) +
  '\n<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>' +
  '\n<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>' +
  '\n<script type="application/json" id="pp-logos">' + logos + '</script>' +
  '\n<script type="application/json" id="pp-data">' + json + '</script>' +
  '\n<script>\n' + troca(ler('pizzaiolo.js')) + '\n</script>' +
  '\n<script>\n' + troca(ler('pedidos.js')) + '\n</script>' +
  '\n<script>\n' + troca(ler('mapa-local.js')) + '\n</script>' +
  '\n<script>\n' + troca(ler('conta.js')) + '\n</script>' +
  '\n<script>\n' + troca(ler('app.js')) + '\n</script>\n';

fs.writeFileSync(path.join(__dirname, 'index.html'), html);
console.log('index.html gerado:', (html.length / 1024).toFixed(0) + ' KB');

// Versão para servidor próprio (Docker): documento completo, com o mesmo reset que o artifact aplica, sem usuários.
const dist = path.join(__dirname, 'dist');
fs.mkdirSync(dist, { recursive: true });
const dadosServidor = JSON.parse(data);
delete dadosServidor.usuarios;
const blocoDados = '<script type="application/json" id="pp-data">' + json + '</script>';
if (!html.includes(blocoDados)) throw new Error('bloco de dados não encontrado na página');
const htmlServidor = html.replace(blocoDados, () => '<script type="application/json" id="pp-data">' + JSON.stringify(dadosServidor).replace(/</g, '\\u003c') + '</script>');
fs.writeFileSync(path.join(dist, 'index.html'),
  '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>' +
  htmlServidor + '</body></html>\n');
console.log('dist/index.html gerado');

// Gestão (/gestao no server.js): app próprio para a equipe. Leva o cardápio e a configuração, nunca os usuários.
const g = (f) => fs.readFileSync(path.join(src, 'gestao', f), 'utf8');
const dadosGestao = JSON.parse(data);
delete dadosGestao.usuarios;
const gestao = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  '<style>[hidden]{display:none!important}img{max-width:100%}</style></head><body>' + g('gestao.html') +
  '\n<script type="application/json" id="pp-logos">' + logos + '</script>' +
  '\n<script type="application/json" id="pp-data">' + JSON.stringify(dadosGestao).replace(/</g, '\\u003c') + '</script>' +
  '\n<script>\n(function () {\n\'use strict\';\n' + ['base.js', 'graficos.js', 'paginas.js', 'entregadores.js', 'configuracoes.js', 'analises.js'].map(g).join('\n') + '\n})();\n</script>\n</body></html>\n';
fs.writeFileSync(path.join(dist, 'gestao.html'), gestao);
console.log('dist/gestao.html gerado:', (gestao.length / 1024).toFixed(0) + ' KB');

// App do entregador (/motoboy no server.js; também é a tela do app Android): só o nome e o contato da pizzaria.
const mb = (f) => fs.readFileSync(path.join(src, 'motoboy', f), 'utf8');
const cfg = JSON.parse(data).config || {};
const motoboy = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#0B3A1A">' +
  '<style>[hidden]{display:none!important}</style></head><body>' + mb('motoboy.html') +
  '\n<script type="application/json" id="pp-loja">' + JSON.stringify({ nome: cfg.nome || 'Pizzaria', whatsapp: cfg.whatsapp || '', endereco: cfg.endereco || '', logo: dataURI('logo-horizontal.webp') }).replace(/</g, '\\u003c') + '</script>' +
  '\n<script>\n' + mb('motoboy.js') + '\n</script>\n</body></html>\n';
fs.writeFileSync(path.join(dist, 'motoboy.html'), motoboy);
console.log('dist/motoboy.html gerado:', (motoboy.length / 1024).toFixed(0) + ' KB');
