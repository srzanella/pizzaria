#!/usr/bin/env node
'use strict';
/*
 * O servidor de produção da Pizzaria Pereira, comandado do seu computador. Usa o ssh e o tar que o Windows 10/11
 * já traz. Rode dentro da pasta prototipo:
 *
 *   node servidor/servidor.js chave                      cria a chave SSH deste computador e mostra a parte pública
 *   node servidor/servidor.js instalar root@IP            prepara um servidor novo (uma vez; Ubuntu ou Debian)
 *   node servidor/servidor.js publicar [pizzaria@IP] [--dominio pizzariapereira.com.br] [--sem-www] [--apk 1.1]
 *                                                         gera o site, envia e reinicia (a primeira vez cria as senhas)
 *   node servidor/servidor.js status                      site, containers, certificado, disco e últimas cópias
 *   node servidor/servidor.js logs [site|caddy|banco|backup] [--seguir]
 *   node servidor/servidor.js copia [--agora]             baixa a cópia mais recente do banco para backups/
 *   node servidor/servidor.js senha <usuário>             senha nova para alguém da equipe (grava em CREDENCIAIS-SERVIDOR.md)
 *   node servidor/servidor.js voltar                      volta para a versão publicada antes desta
 *   node servidor/servidor.js pacote [--dominio …]        só monta o pacote em servidor/saida (para publicar à mão)
 *
 * Opções de conexão (ficam gravadas em servidor/destino.json): --porta 22  --chave caminho/da/chave
 *
 * SEGREDOS: servidor/producao.env (senha do banco, CHAVE_SEGREDOS, senha inicial do admin) e
 * CREDENCIAIS-SERVIDOR.md. Não vão para o Git nem para ninguém. Guarde uma cópia num gerenciador de senhas:
 * sem a CHAVE_SEGREDOS, a senha do email salva na gestão não abre mais.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const tls = require('tls');

const AQUI = __dirname;
const RAIZ = path.resolve(AQUI, '..');
const DESTINO = path.join(AQUI, 'destino.json');
const ENV_PROD = path.join(AQUI, 'producao.env');
const CRED = path.join(RAIZ, 'CREDENCIAIS-SERVIDOR.md');
const REMOTO = '/opt/pizzaria';
const CHAVE_PADRAO = path.join(os.homedir(), '.ssh', 'pizzaria_servidor');
const ARQUIVOS_APP = ['Dockerfile', '.dockerignore', 'package.json', 'package-lock.json', 'server.js', 'demo.js', 'contas.js', 'entregadores.js', 'email.js', 'enderecos.js', 'importa-ibge.js', 'equipe.js', 'precos.js'];

/* ---------------- argumentos ---------------- */
const COM_VALOR = new Set(['dominio', 'porta', 'chave', 'apk', 'usuario']);
const [cmd, ...resto] = process.argv.slice(2);
const op = {}, pos = [];
for (let i = 0; i < resto.length; i++) {
  const a = resto[i];
  if (a.startsWith('--')) { const n = a.slice(2); op[n] = COM_VALOR.has(n) ? resto[++i] : true; } else pos.push(a);
}

/* ---------------- utilidades ---------------- */
const passo = (t) => console.log('\n\x1b[1m==> ' + t + '\x1b[0m');
function falha(msg) { console.error('\n\x1b[31m✘ ' + msg + '\x1b[0m'); process.exit(1); }
const SSH_OK = /^[a-z_][a-z0-9_-]{0,31}@[A-Za-z0-9.-]+$/;
const DOMINIO_OK = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const LOGIN_OK = /^[a-z0-9][a-z0-9._-]{2,39}$/;
function lerDestino() { try { return JSON.parse(fs.readFileSync(DESTINO, 'utf8')); } catch (e) { return {}; } }
function gravaDestino(d) { fs.writeFileSync(DESTINO, JSON.stringify(d, null, 2) + '\n'); }
function conexao(d) {
  d = Object.assign({}, d);
  if (op.porta) d.porta = +op.porta;
  if (op.chave) d.chave = path.resolve(op.chave);
  if (!d.chave && fs.existsSync(CHAVE_PADRAO)) d.chave = CHAVE_PADRAO;
  if (!d.porta) d.porta = 22;
  return d;
}
function sshOpcoes(d) {
  const a = ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=20', '-o', 'ServerAliveInterval=20'];
  if (d.chave && fs.existsSync(d.chave)) a.push('-i', d.chave, '-o', 'IdentitiesOnly=yes');
  // opções extras do ssh, raramente necessárias (ex.: SERVIDOR_SSH_OPCOES="-o ProxyJump=usuario@bastiao")
  return a.concat(String(process.env.SERVIDOR_SSH_OPCOES || '').split(/\s+/).filter(Boolean));
}
// roda um comando no servidor; captura = devolve a saída em vez de mostrar
function ssh(d, comando, o = {}) {
  const args = sshOpcoes(d).concat(d.porta !== 22 ? ['-p', String(d.porta)] : [], o.tty ? ['-t'] : [], [d.ssh, comando]);
  const r = spawnSync('ssh', args, { stdio: o.captura ? ['ignore', 'pipe', 'pipe'] : 'inherit', encoding: 'utf8', windowsHide: true });
  if (r.error) falha('Não consegui rodar o ssh (' + r.error.message + '). No Windows ele vem com o sistema; no Linux/Mac, instale o OpenSSH.');
  if (r.status === 255 && !o.tolera) falha('Não consegui entrar em ' + d.ssh + (o.captura && r.stderr ? ': ' + r.stderr.trim().split('\n').pop() : '') + '.\nConfira o IP, se a chave pública deste computador está no servidor (node servidor/servidor.js chave) e se a porta SSH está certa.');
  if (r.status !== 0 && !o.tolera) falha('O comando no servidor falhou (código ' + r.status + ')' + (o.captura && r.stderr ? ':\n' + r.stderr.trim() : '.'));
  return r;
}
// copia de/para o servidor ("remoto:/caminho"). O arquivo local vai como nome relativo à pasta dele: alguns scp do
// Windows confundem "C:\..." com o nome de um servidor chamado "C".
function scp(d, de, para) {
  const remoto = (s) => s.startsWith('remoto:');
  const local = remoto(de) ? para : de;
  const nome = (s) => (remoto(s) ? d.ssh + ':' + s.slice(7) : path.basename(s));
  const args = sshOpcoes(d).concat(d.porta !== 22 ? ['-P', String(d.porta)] : [], ['-q', nome(de), nome(para)]);
  const r = spawnSync('scp', args, { stdio: 'inherit', windowsHide: true, cwd: path.dirname(path.resolve(local)) });
  if (r.error || r.status !== 0) falha('A cópia pelo scp falhou' + (r.error ? ' (' + r.error.message + ')' : '') + '.');
}
function roda(prog, args, o = {}) {
  const r = spawnSync(prog, args, Object.assign({ stdio: 'inherit', cwd: RAIZ, windowsHide: true }, o));
  if (r.error || r.status !== 0) falha(prog + ' ' + args.join(' ') + ' falhou' + (r.error ? ' (' + r.error.message + ')' : '') + '.');
  return r;
}
const mb = (n) => (n / 1048576).toFixed(1).replace('.', ',') + ' MB';
function destinoObrigatorio() {
  const d = conexao(lerDestino());
  if (!d.ssh) falha('Ainda não sei qual é o servidor. Publique uma vez com: node servidor/servidor.js publicar pizzaria@IP --dominio seudominio.com.br');
  return d;
}

/* ---------------- .env de produção (segredos gerados aqui, nunca mostrados na tela) ---------------- */
const ALFABETO = 'abcdefghjkmnpqrstuvwxyz23456789';
function senhaLegivel(grupos) { const b = crypto.randomBytes(grupos * 4); let s = ''; for (let i = 0; i < b.length; i++) s += (i && i % 4 === 0 ? '-' : '') + ALFABETO[b[i] % ALFABETO.length]; return s; }
function lerEnvProd() {
  if (!fs.existsSync(ENV_PROD)) return null;
  const e = {};
  for (const l of fs.readFileSync(ENV_PROD, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) e[m[1]] = m[2]; }
  return e;
}
function gravaEnvProd(e) {
  const linhas = [
    '# Segredos e ajustes do servidor de produção. NÃO compartilhe, não mande para o Git.',
    '# Gerado pelo servidor.js; o publicar envia este arquivo como /opt/pizzaria/.env a cada publicação.',
    '# Se mudar POSTGRES_PASSWORD depois que o banco existe, o site não conecta mais (a senha do banco não muda sozinha).',
    '# Se perder a CHAVE_SEGREDOS, a senha do email salva na gestão precisa ser digitada de novo.',
    ''
  ];
  const ordem = ['DOMINIO', 'POSTGRES_PASSWORD', 'CHAVE_SEGREDOS', 'ADMIN_SENHA_INICIAL', 'GOOGLE_CLIENT_ID', 'BACKUP_DIAS', 'BACKUP_HORA', 'PG_POOL'];
  for (const k of ordem.concat(Object.keys(e).filter((k) => !ordem.includes(k)))) if (e[k] !== undefined) linhas.push(k + '=' + e[k]);
  fs.writeFileSync(ENV_PROD, linhas.join('\n') + '\n', { mode: 0o600 });
}
function criaEnvProd(dominio) {
  const e = { DOMINIO: dominio || '', POSTGRES_PASSWORD: crypto.randomBytes(24).toString('hex'), CHAVE_SEGREDOS: crypto.randomBytes(32).toString('hex'), ADMIN_SENHA_INICIAL: senhaLegivel(4), GOOGLE_CLIENT_ID: '', BACKUP_DIAS: '14', BACKUP_HORA: '4' };
  gravaEnvProd(e);
  console.log('Senhas do servidor criadas em servidor/producao.env.');
  return e;
}
function gravaCredenciais(e) {
  if (fs.existsSync(CRED)) return;
  fs.writeFileSync(CRED, [
    '# Servidor de produção: acessos (NÃO compartilhe; não vai para o Git)', '',
    '- Site: https://' + e.DOMINIO,
    '- Gestão: https://' + e.DOMINIO + '/gestao',
    '- Usuário: `admin`',
    '- Senha inicial: `' + e.ADMIN_SENHA_INICIAL + '`', '',
    'Depois de entrar, troque a senha (menu do seu nome → Minha senha) e crie um usuário para cada pessoa da equipe',
    '(Configurações → Equipe). A senha inicial só vale enquanto ninguém trocar.', '',
    'A senha do banco e a CHAVE_SEGREDOS ficam em `servidor/producao.env`. Guarde os dois arquivos num gerenciador de',
    'senhas. Esqueceu a senha da gestão? `node servidor/servidor.js senha admin`.', ''
  ].join('\n'), { mode: 0o600 });
  console.log('Usuário e senha da gestão em CREDENCIAIS-SERVIDOR.md (não aparecem aqui).');
}
// sem producao.env aqui, mas o servidor já tem um: traz de lá (as senhas do banco precisam ser as mesmas)
function trazEnvRemoto(d) {
  const r = ssh(d, 'test -f ' + REMOTO + '/.env && echo sim || echo nao', { captura: true, tolera: true });
  if (r.status !== 0 || !/sim/.test(r.stdout)) return null;
  scp(d, 'remoto:' + REMOTO + '/.env', ENV_PROD);
  console.log('Trouxe o .env que já estava no servidor para servidor/producao.env.');
  return lerEnvProd();
}

/* ---------------- comandos ---------------- */
function chave() {
  if (!fs.existsSync(CHAVE_PADRAO)) {
    fs.mkdirSync(path.dirname(CHAVE_PADRAO), { recursive: true });
    roda('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', 'pizzaria-servidor', '-f', CHAVE_PADRAO]);
    console.log('Chave criada em ' + CHAVE_PADRAO + ' (a parte privada nunca sai deste computador).');
  }
  console.log('\nChave PÚBLICA deste computador (cole no painel do provedor ao criar o servidor, em "SSH keys"):\n');
  console.log(fs.readFileSync(CHAVE_PADRAO + '.pub', 'utf8').trim() + '\n');
}

function instalar() {
  const alvo = pos[0];
  if (!alvo || !SSH_OK.test(alvo)) falha('Use: node servidor/servidor.js instalar root@IP-DO-SERVIDOR');
  const usuario = op.usuario || 'pizzaria';
  if (!/^[a-z_][a-z0-9_-]{0,30}$/.test(usuario)) falha('Usuário inválido: ' + usuario);
  const d = conexao(Object.assign(lerDestino(), { ssh: alvo }));
  passo('Enviando o instalador para ' + alvo);
  scp(d, path.join(AQUI, 'instalar.sh'), 'remoto:/tmp/pizzaria-instalar.sh');
  passo('Instalando (Docker, firewall, atualizações automáticas…)');
  const sudo = alvo.startsWith('root@') ? '' : 'sudo ';
  ssh(d, sudo + 'bash /tmp/pizzaria-instalar.sh ' + usuario + (op['so-chave'] ? ' --so-chave' : '') + '; s=$?; rm -f /tmp/pizzaria-instalar.sh; exit $s');
  const novo = Object.assign({}, d, { ssh: usuario + '@' + alvo.split('@')[1] });
  passo('Conferindo a entrada com o usuário ' + novo.ssh);
  const r = ssh(novo, 'docker version --format "Docker {{.Server.Version}}"', { captura: true });
  console.log(r.stdout.trim() + ' · entrou com a chave, sem senha.');
  gravaDestino(Object.assign(lerDestino(), { ssh: novo.ssh, porta: novo.porta, chave: novo.chave || null }));
  console.log('\nPronto. Agora: node servidor/servidor.js publicar --dominio seudominio.com.br');
}

async function publicar() {
  const d = conexao(lerDestino());
  if (pos[0]) { if (!SSH_OK.test(pos[0])) falha('Destino inválido: ' + pos[0] + ' (ex.: pizzaria@203.0.113.10)'); d.ssh = pos[0]; }
  if (!d.ssh) falha('Diga onde publicar: node servidor/servidor.js publicar pizzaria@IP --dominio seudominio.com.br');
  const dominioNovo = op.dominio ? String(op.dominio).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '') : null;
  if (dominioNovo && !DOMINIO_OK.test(dominioNovo)) falha('Domínio inválido: ' + op.dominio + ' (ex.: pizzariapereira.com.br, sem https://)');

  passo('Conferindo a conexão com ' + d.ssh);
  const pronto = ssh(d, 'test -d ' + REMOTO + ' && command -v docker >/dev/null && echo pronto', { captura: true, tolera: true });
  if (pronto.status === 255) ssh(d, 'true'); // mostra o motivo de não ter entrado
  if (!/pronto/.test(pronto.stdout || '')) falha('O servidor ainda não foi preparado (falta o Docker ou a pasta ' + REMOTO + '). Rode antes: node servidor/servidor.js instalar root@' + d.ssh.split('@')[1]);
  let env = lerEnvProd() || trazEnvRemoto(d) || criaEnvProd(dominioNovo);
  if (dominioNovo && env.DOMINIO !== dominioNovo) { env.DOMINIO = dominioNovo; gravaEnvProd(env); console.log('Domínio: ' + dominioNovo); }
  if (!env.DOMINIO) falha('Falta o domínio: --dominio seudominio.com.br');
  gravaCredenciais(env);
  if (op['sem-www']) d.www = false; else if (op.www) d.www = true; else if (d.www === undefined) d.www = true;
  gravaDestino({ ssh: d.ssh, porta: d.porta, chave: d.chave || null, dominio: env.DOMINIO, www: d.www });

  passo('Gerando o site');
  roda(process.execPath, ['build.js']);
  if (op.apk) {
    passo('Gerando o app do entregador para https://' + env.DOMINIO);
    roda(process.execPath, [path.join('android', 'gerar-apk.js'), '--servidor', 'https://' + env.DOMINIO, '--versao', String(op.apk === true ? '1.1' : op.apk)]);
  }
  try {
    const apk = JSON.parse(fs.readFileSync(path.join(RAIZ, 'dist', 'entregador.json'), 'utf8'));
    if (apk.servidor !== 'https://' + env.DOMINIO) console.log('\x1b[33mAtenção: o app do entregador em dist/ abre ' + apk.servidor + '. Gere de novo com --apk 1.1 para abrir https://' + env.DOMINIO + '.\x1b[0m');
  } catch (e) { if (fs.existsSync(path.join(RAIZ, 'dist', 'entregador.apk'))) console.log('\x1b[33mAtenção: não sei para qual endereço o app do entregador em dist/ foi gerado. Use --apk 1.1 para gerar com o domínio.\x1b[0m'); }

  passo('Montando o pacote');
  // base do IBGE: só na primeira vez (o servidor guarda em /opt/pizzaria/dados-ibge)
  const tem = ssh(d, 'ls ' + REMOTO + '/dados-ibge 2>/dev/null', { captura: true, tolera: true }).stdout || '';
  const { tmp, tgz } = montaPacote(env, d.www, (z) => !tem.split(/\s+/).includes(z));

  passo('Enviando');
  scp(d, tgz, 'remoto:/tmp/pizzaria-pacote.tgz');
  fs.rmSync(tmp, { recursive: true, force: true });

  passo('Trocando a versão no servidor');
  ssh(d, 'set -e; cd ' + REMOTO + '; rm -rf .novo; mkdir .novo; tar -xzf /tmp/pizzaria-pacote.tgz -C .novo; rm -f /tmp/pizzaria-pacote.tgz; sh .novo/atualiza.sh');

  passo('Conferindo de fora: https://' + env.DOMINIO);
  const ok = await confereDeFora(env.DOMINIO);
  console.log(ok ? '\n\x1b[32m✔ No ar: https://' + env.DOMINIO + '  ·  gestão: https://' + env.DOMINIO + '/gestao\x1b[0m'
    : '\n\x1b[33mO servidor subiu, mas o https ainda não respondeu daqui. Na primeira vez o certificado leva até alguns minutos;\nconfira se o DNS do domínio aponta para o IP do servidor e rode: node servidor/servidor.js status\x1b[0m');
  if (fs.existsSync(CRED)) console.log('Usuário e senha da gestão: CREDENCIAIS-SERVIDOR.md');
}
// o pacote que vai para /opt/pizzaria: app/ (código e páginas), compose, Caddyfile, backup, atualizador, .env
function montaPacote(env, www, levaZip) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pizzaria-'));
  const pac = path.join(tmp, 'pacote');
  fs.mkdirSync(path.join(pac, 'app', 'dist'), { recursive: true });
  for (const f of ARQUIVOS_APP) fs.copyFileSync(path.join(RAIZ, f), path.join(pac, 'app', f));
  for (const f of fs.readdirSync(path.join(RAIZ, 'dist'))) if (/\.(html|apk)$/.test(f)) fs.copyFileSync(path.join(RAIZ, 'dist', f), path.join(pac, 'app', 'dist', f));
  for (const f of ['docker-compose.yml', 'backup.sh', 'atualiza.sh']) fs.copyFileSync(path.join(AQUI, f), path.join(pac, f));
  fs.writeFileSync(path.join(pac, 'Caddyfile'), caddyfile(env.DOMINIO, www));
  fs.copyFileSync(ENV_PROD, path.join(pac, '.env'));
  const zips = (fs.existsSync(path.join(RAIZ, 'dados-ibge')) ? fs.readdirSync(path.join(RAIZ, 'dados-ibge')) : []).filter((f) => /\.zip$/i.test(f) && levaZip(f));
  if (zips.length) {
    fs.mkdirSync(path.join(pac, 'dados-ibge'));
    for (const z of zips) fs.copyFileSync(path.join(RAIZ, 'dados-ibge', z), path.join(pac, 'dados-ibge', z));
    console.log('Vai junto a base de endereços do IBGE: ' + zips.join(', '));
  }
  const tgz = path.join(tmp, 'pacote.tgz');
  roda('tar', ['-czf', 'pacote.tgz', '-C', 'pacote', '.'], { cwd: tmp });
  console.log('Pacote: ' + mb(fs.statSync(tgz).size));
  return { tmp, tgz };
}
// sem ssh: gera o pacote aqui (para conferir ou publicar à mão)
function pacote() {
  let env = lerEnvProd();
  const dom = op.dominio ? String(op.dominio).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '') : null;
  if (dom && !DOMINIO_OK.test(dom)) falha('Domínio inválido: ' + op.dominio);
  if (!env) { if (!dom) falha('Falta o domínio: node servidor/servidor.js pacote --dominio seudominio.com.br'); env = criaEnvProd(dom); }
  else if (dom && env.DOMINIO !== dom) { env.DOMINIO = dom; gravaEnvProd(env); }
  if (!env.DOMINIO) falha('Falta o domínio: --dominio seudominio.com.br');
  gravaCredenciais(env);
  roda(process.execPath, ['build.js']);
  const d = lerDestino();
  const { tmp, tgz } = montaPacote(env, d.www !== false, () => true);
  const saida = path.join(AQUI, 'saida');
  fs.mkdirSync(saida, { recursive: true });
  const final = path.join(saida, 'pizzaria-pacote.tgz');
  fs.copyFileSync(tgz, final);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('✔ ' + path.relative(RAIZ, final) + ' (leva o .env com as senhas: trate como segredo).\n' +
    'À mão, no servidor: mkdir -p /opt/pizzaria/.novo && tar -xzf pizzaria-pacote.tgz -C /opt/pizzaria/.novo && sh /opt/pizzaria/.novo/atualiza.sh');
}
function caddyfile(dominio, www) {
  return '# Gerado pelo servidor.js publicar. O Caddy tira e renova sozinho o certificado https (Let\'s Encrypt).\n' +
    dominio + ' {\n' +
    '\treverse_proxy site:8080\n' +
    '\theader {\n\t\tStrict-Transport-Security "max-age=31536000"\n\t\t-Server\n\t}\n' +
    '}\n' + (www ? '\nwww.' + dominio + ' {\n\tredir https://' + dominio + '{uri} permanent\n}\n' : '');
}
async function confereDeFora(dominio, tentativas = 12) {
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch('https://' + dominio + '/api/status', { signal: AbortSignal.timeout(10000) });
      if (r.ok) return true;
    } catch (e) { /* certificado ainda saindo, DNS… */ }
    await new Promise((r) => setTimeout(r, 5000));
  }
  return false;
}
function certificado(dominio) {
  return new Promise((ok) => {
    const s = tls.connect({ host: dominio, port: 443, servername: dominio, timeout: 10000 }, () => { const c = s.getPeerCertificate(); s.end(); ok({ valido: s.authorized, ate: c && c.valid_to, emissor: c && c.issuer && (c.issuer.O || c.issuer.CN), erro: s.authorizationError }); });
    s.on('error', (e) => ok({ valido: false, erro: e.message }));
    s.on('timeout', () => { s.destroy(); ok({ valido: false, erro: 'sem resposta' }); });
  });
}

async function status() {
  const d = destinoObrigatorio();
  const dom = d.dominio;
  if (dom) {
    passo('Site: https://' + dom);
    try {
      const t0 = Date.now(); const r = await fetch('https://' + dom + '/api/status', { signal: AbortSignal.timeout(10000) }); const j = await r.json();
      console.log((r.ok && j.ok ? '✔ respondendo' : '✘ respondeu ' + r.status) + ' em ' + (Date.now() - t0) + ' ms · dia operacional ' + (j.dia || '?'));
    } catch (e) { console.log('✘ não respondeu: ' + e.message); }
    const c = await certificado(dom);
    if (c.ate) { const dias = Math.round((Date.parse(c.ate) - Date.now()) / 864e5); console.log((c.valido ? '✔' : '✘') + ' certificado ' + (c.emissor || '') + ', vale até ' + new Date(c.ate).toLocaleDateString('pt-BR') + ' (' + dias + ' dias; o Caddy renova sozinho)' + (c.valido ? '' : ' · ' + c.erro)); }
    else console.log('✘ certificado: ' + c.erro);
  }
  passo('Servidor ' + d.ssh);
  ssh(d, 'cd ' + REMOTO + ' && docker compose ps --format "table {{.Service}}\\t{{.Status}}" && echo && echo "Últimas cópias do banco:" && (ls -1t backups/*.dump 2>/dev/null | head -3 | while read f; do echo "  $(basename "$f")  $(du -h "$f" | cut -f1)"; done) && echo && df -h / | awk \'NR==2{print "Disco: " $3 " usados de " $2 " (" $5 ")"}\' && free -m | awk \'/^Mem/{print "Memória: " $3 " MB usados de " $2 " MB"}\'');
}

function logs() {
  const d = destinoObrigatorio();
  const svc = pos[0] || 'site';
  if (!['site', 'caddy', 'banco', 'backup'].includes(svc)) falha('Serviço: site, caddy, banco ou backup.');
  ssh(d, 'cd ' + REMOTO + ' && docker compose logs --tail 200 ' + (op.seguir ? '-f ' : '') + svc, { tty: !!op.seguir });
}

function copia() {
  const d = destinoObrigatorio();
  if (op.agora) {
    passo('Fazendo uma cópia agora');
    ssh(d, 'cd ' + REMOTO + ' && docker compose exec -T backup sh -c \'f=/backups/pizzaria-$(TZ="<-03>3" date +%Y-%m-%d_%H%M)-manual.dump; pg_dump -Fc -f "$f" && pg_restore --list "$f" >/dev/null && echo "cópia ok: $(basename "$f")"\'');
  }
  const r = ssh(d, 'ls -1t ' + REMOTO + '/backups/pizzaria-*.dump 2>/dev/null | head -1', { captura: true, tolera: true });
  const remoto = (r.stdout || '').trim();
  if (!remoto || !/^\/opt\/pizzaria\/backups\/pizzaria-[\w.-]+\.dump$/.test(remoto)) falha('Ainda não há cópia no servidor (a primeira sai poucos minutos depois de publicar).');
  const pasta = path.join(RAIZ, 'backups');
  fs.mkdirSync(pasta, { recursive: true });
  const local = path.join(pasta, path.basename(remoto));
  passo('Baixando ' + path.basename(remoto));
  scp(d, 'remoto:' + remoto, local);
  console.log('✔ ' + path.relative(RAIZ, local) + ' (' + mb(fs.statSync(local).size) + '). Guarde fora deste computador também (nuvem, pen drive).');
}

function senha() {
  const d = destinoObrigatorio();
  const login = String(pos[0] || '').toLowerCase();
  if (!LOGIN_OK.test(login)) falha('Use: node servidor/servidor.js senha <usuário>   (ex.: senha admin)');
  const r = ssh(d, 'cd ' + REMOTO + ' && docker compose exec -T site node equipe.js senha ' + login, { captura: true, tolera: true });
  const m = (r.stdout || '').match(/: ([a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4})/);
  if (!m) falha(((r.stdout || '') + (r.stderr || '')).trim() || 'Não deu para gerar a senha.');
  fs.appendFileSync(CRED, '\n## Senha nova de `' + login + '` (' + new Date().toLocaleString('pt-BR') + ')\n\n`' + m[1] + '` · vale para um acesso: a gestão pede uma senha nova ao entrar.\n', { mode: 0o600 });
  console.log('✔ Senha nova de "' + login + '" gravada em CREDENCIAIS-SERVIDOR.md. A pessoa saiu de todos os aparelhos.');
}

function voltar() {
  const d = destinoObrigatorio();
  passo('Voltando para a versão anterior');
  ssh(d, 'set -e; cd ' + REMOTO + '; [ -d .anterior/app ] || { echo "Não há versão anterior guardada."; exit 3; }; rm -rf .desfeito; mkdir .desfeito; mv app .desfeito/app; for f in docker-compose.yml Caddyfile backup.sh; do [ -f "$f" ] && cp "$f" .desfeito/; done; mv .anterior/app app; for f in docker-compose.yml Caddyfile backup.sh; do [ -f ".anterior/$f" ] && cp ".anterior/$f" .; done; rm -rf .anterior; mv .desfeito .anterior; docker compose up -d --build --remove-orphans && docker compose ps --format "table {{.Service}}\\t{{.Status}}"');
  console.log('\nPronto. Para desfazer, rode "voltar" de novo (troca as duas versões).');
}

const COMANDOS = { chave, instalar, publicar, pacote, status, logs, copia, senha, voltar };
if (!COMANDOS[cmd]) {
  const linhas = fs.readFileSync(__filename, 'utf8').split(/\r?\n/);
  console.log(linhas.slice(3, linhas.indexOf(' */')).map((l) => l.replace(/^ \* ?/, '')).join('\n'));
  if (cmd) console.error('\nComando desconhecido: ' + cmd);
  process.exit(cmd ? 1 : 0);
}
Promise.resolve(COMANDOS[cmd]()).catch((e) => falha(e.stack || e.message));
