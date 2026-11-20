// Gera o APK do app do entregador (Android) num container com o Android SDK: nada instalado no computador.
// Uso: node android/gerar-apk.js [--servidor http://192.168.1.13:8090] [--versao 1.1]
//  - a primeira vez monta a imagem pizzaria-android-sdk (Dockerfile ao lado; baixa ~400 MB)
//  - a senha da assinatura fica no .env (ANDROID_ASSINATURA_SENHA) e a chave em android/assinatura/:
//    guarde as duas. Sem elas, uma versão nova do app não instala por cima da antiga nos celulares.
//  - o endereço padrão que o app abre: --servidor, ou ENDERECO_REDE do .env, ou o IP deste computador na rede.
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const RAIZ = path.resolve(__dirname, '..');
const ENV = path.join(RAIZ, '.env');
const IMAGEM = 'pizzaria-android-sdk';

let env = fs.existsSync(ENV) ? fs.readFileSync(ENV, 'utf8') : '';
const lerEnv = (k) => { const m = env.match(new RegExp('^\\s*' + k + '\\s*=\\s*(.*)$', 'm')); return m ? m[1].trim().replace(/^(['"])(.*)\1$/, '$2') : ''; };
let senha = process.env.ANDROID_ASSINATURA_SENHA || lerEnv('ANDROID_ASSINATURA_SENHA');
if (!senha) {
  senha = crypto.randomBytes(18).toString('base64url');
  fs.appendFileSync(ENV, (env && !env.endsWith('\n') ? '\n' : '') + '# senha da chave que assina o app do entregador (android/assinatura): não perca\nANDROID_ASSINATURA_SENHA=' + senha + '\n');
  env = fs.readFileSync(ENV, 'utf8');
  console.log('Senha da assinatura do app criada no .env (ANDROID_ASSINATURA_SENHA).');
}
function ipLocal() {
  const todos = [];
  for (const [nome, l] of Object.entries(os.networkInterfaces())) for (const a of l || []) if (a.family === 'IPv4' && !a.internal && !/vEthernet|WSL|Hyper-V|VirtualBox|VMware|docker|br-/i.test(nome)) todos.push(a.address);
  return todos.find((a) => a.startsWith('192.168.')) || todos.find((a) => a.startsWith('10.')) || todos[0] || '192.168.0.10';
}
const arg = (n) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : null; };
const servidor = (arg('servidor') || lerEnv('ENDERECO_REDE') || 'http://' + ipLocal() + ':8090').replace(/\/+$/, '');
if (!/^https?:\/\/[^\s/]+$/i.test(servidor)) { console.error('Endereço inválido: ' + servidor + ' (ex.: http://192.168.1.13:8090)'); process.exit(1); }
const versao = arg('versao') || '1.0';
const codigo = String(Math.floor((Date.now() - Date.UTC(2026, 0, 1)) / 60000)); // sempre maior: o Android só atualiza para um número maior

const docker = (args, op) => spawnSync('docker', args, Object.assign({ stdio: 'inherit', env: Object.assign({}, process.env, { ASSINATURA_SENHA: senha, MSYS_NO_PATHCONV: '1' }) }, op || {}));
if (spawnSync('docker', ['image', 'inspect', IMAGEM], { stdio: 'ignore' }).status !== 0) {
  console.log('Montando a imagem ' + IMAGEM + ' (só na primeira vez)…');
  if (docker(['build', '-t', IMAGEM, __dirname]).status !== 0) process.exit(1);
}
console.log('Gerando o APK (servidor padrão ' + servidor + ', versão ' + versao + ')…');
const r = docker(['run', '--rm', '-v', __dirname + ':/app', '-e', 'SERVIDOR=' + servidor, '-e', 'VERSAO_CODIGO=' + codigo, '-e', 'VERSAO_NOME=' + versao, '-e', 'ASSINATURA_SENHA', IMAGEM, 'sh', '/app/build.sh']);
if (r.status !== 0) process.exit(r.status || 1);
fs.mkdirSync(path.join(RAIZ, 'dist'), { recursive: true });
fs.copyFileSync(path.join(__dirname, 'saida', 'entregador.apk'), path.join(RAIZ, 'dist', 'entregador.apk'));
// para o servidor.js publicar avisar quando o app aponta para outro endereço
fs.writeFileSync(path.join(RAIZ, 'dist', 'entregador.json'), JSON.stringify({ servidor, versao, codigo: +codigo, em: new Date().toISOString() }) + '\n');
console.log('Pronto: dist/entregador.apk (o servidor entrega em /motoboy/app.apk; reconstrua o container para publicar).');
