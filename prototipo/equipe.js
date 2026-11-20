'use strict';
/*
 * Usuários da equipe (gestão e portal do site). Ficam no banco, nunca na página pública.
 * Senha com scrypt (lento de propósito, sal por usuário), conferida no servidor.
 *
 * O primeiro administrador ("admin") nasce na primeira subida com a tabela vazia:
 *   - com a senha de ADMIN_SENHA_INICIAL, se a variável existir (o publicar do servidor gera uma);
 *   - senão, com uma senha aleatória gravada em DADOS/senha-inicial-admin.txt.
 * Depois disso a variável não vale mais: troque a senha na gestão (Configurações → Equipe).
 *
 * Esqueceu a senha? No servidor:  docker compose exec site node equipe.js senha admin
 * (gera uma senha nova, mostra uma vez e desconecta o usuário). Também:  node equipe.js lista
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const N = 32768, R = 8, P = 1, TAM = 32;   // 32 MB e ~0,1 s por senha
const LOGIN_OK = /^[a-z0-9][a-z0-9._-]{2,39}$/;
const COMUNS = new Set(['12345678', '123456789', '1234567890', '87654321', '11111111', '00000000', '12341234', 'senha123', 'senha1234', 'password', 'password1', 'qwerty123', 'abc12345', 'pizzaria', 'pizzaria1', 'pizzaria123', 'pereira123', 'admin123', 'admin1234', 'mudar123', 'trocar123']);

const ESQUEMA = `
  CREATE TABLE IF NOT EXISTS equipe (
    id BIGSERIAL PRIMARY KEY,
    login TEXT NOT NULL UNIQUE,
    nome TEXT NOT NULL,
    admin BOOLEAN NOT NULL DEFAULT FALSE,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    senha_hash TEXT NOT NULL,
    trocar_senha BOOLEAN NOT NULL DEFAULT FALSE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    senha_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    ultimo_acesso TIMESTAMPTZ
  );
`;

// no máximo duas contas de senha ao mesmo tempo: uma enxurrada de logins não esgota a memória do servidor
let rodando = 0;
const fila = [];
async function vez(fn) {
  if (rodando >= 2) await new Promise((r) => fila.push(r));
  rodando++;
  try { return await fn(); } finally { rodando--; const p = fila.shift(); if (p) p(); }
}
const scrypt = (senha, sal, n, r, p) => vez(() => new Promise((ok, falha) =>
  crypto.scrypt(senha, sal, TAM, { N: n, r, p, maxmem: 256 * n * r }, (e, k) => (e ? falha(e) : ok(k)))));

async function geraHash(senha) {
  const sal = crypto.randomBytes(16);
  const k = await scrypt(String(senha).normalize('NFC'), sal, N, R, P);
  return ['scrypt', N, R, P, sal.toString('base64'), k.toString('base64')].join('$');
}
async function confere(hash, senha) {
  const p = String(hash || '').split('$');
  if (p.length !== 6 || p[0] !== 'scrypt') return false;
  const n = +p[1], r = +p[2], q = +p[3];
  if (!(n >= 1024 && n <= 1048576 && r >= 1 && r <= 32 && q >= 1 && q <= 16)) return false;
  const esperado = Buffer.from(p[5], 'base64');
  const k = await scrypt(String(senha).normalize('NFC'), Buffer.from(p[4], 'base64'), n, r, q);
  return k.length === esperado.length && crypto.timingSafeEqual(k, esperado);
}
// usuário que não existe também paga uma conta de senha: o tempo da resposta não entrega quem existe
let hashFalso = null;
const comparaFalso = async (senha) => { if (!hashFalso) hashFalso = await geraHash(crypto.randomBytes(9).toString('hex')); await confere(hashFalso, senha); return false; };

// senha provisória fácil de ditar: 3 grupos de 4, sem letras que se confundem (0/o, 1/l/i)
function senhaProvisoria() {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789';
  const b = crypto.randomBytes(12);
  let s = '';
  for (let i = 0; i < 12; i++) s += (i && i % 4 === 0 ? '-' : '') + a[b[i] % a.length];
  return s;
}
function problemaSenha(senha, login) {
  const s = String(senha || '');
  if (s.length < 8) return 'A senha precisa de pelo menos 8 caracteres.';
  if (s.length > 200) return 'Senha longa demais.';
  if (/^(.)\1+$/.test(s)) return 'Escolha uma senha menos óbvia.';
  if (login && s.toLowerCase().includes(String(login).toLowerCase())) return 'A senha não pode conter o usuário.';
  if (COMUNS.has(s.toLowerCase())) return 'Essa senha é muito comum. Escolha outra.';
  return null;
}
const normLogin = (s) => String(s || '').trim().toLowerCase();

function criaEquipe(ctx) {
  const { pool, um, todos, erro, json, lerCorpo, exigeSessao, exigeAdmin, txt, limite, ipDe, dirDados } = ctx;
  const publico = (u) => ({ id: String(u.id), login: u.login, nome: u.nome, admin: !!u.admin, ativo: !!u.ativo, trocarSenha: !!u.trocar_senha, criadoEm: u.criado_em, senhaEm: u.senha_em, ultimoAcesso: u.ultimo_acesso || null });

  // primeira subida: cria o admin (dentro da trava do esquema; c = conexão já travada)
  async function semeia(c) {
    if ((await c.query('SELECT COUNT(*)::int AS n FROM equipe')).rows[0].n) return;
    let senha = String(process.env.ADMIN_SENHA_INICIAL || '');
    const gerada = !senha;
    if (gerada) senha = senhaProvisoria();
    await c.query('INSERT INTO equipe (login, nome, admin, senha_hash) VALUES ($1, $2, true, $3)', ['admin', 'Administrador', await geraHash(senha)]);
    await c.query('DELETE FROM sessoes'); // sessões antigas eram dos usuários da página
    if (!gerada) { console.log('Equipe: usuário "admin" criado com a senha de ADMIN_SENHA_INICIAL.'); return; }
    const arq = path.join(dirDados, 'senha-inicial-admin.txt');
    try {
      fs.mkdirSync(dirDados, { recursive: true });
      fs.writeFileSync(arq, 'Usuário: admin\nSenha: ' + senha + '\n\nTroque na gestão (Configurações → Equipe) e apague este arquivo.\n', { mode: 0o600 });
      console.log('Equipe: usuário "admin" criado. A senha inicial está em ' + arq + ' (troque na gestão).');
    } catch (e) { console.log('Equipe: usuário "admin" criado, mas não deu para gravar a senha (' + e.message + '). Gere outra com: node equipe.js senha admin'); }
  }

  // login: devolve o usuário ou null (sempre com o mesmo custo)
  async function autentica(login, senha) {
    const l = normLogin(login);
    const u = LOGIN_OK.test(l) ? await um('SELECT * FROM equipe WHERE login = $1', [l]) : null;
    if (!u || !u.ativo) return comparaFalso(String(senha || '')).then(() => null);
    if (!(await confere(u.senha_hash, String(senha || '')))) return null;
    await pool.query('UPDATE equipe SET ultimo_acesso = now() WHERE id = $1', [u.id]);
    return u;
  }
  const trocaPendente = async (id) => { const u = /^\d{1,18}$/.test(String(id)) ? await um('SELECT trocar_senha FROM equipe WHERE id = $1', [id]) : null; return !!(u && u.trocar_senha); };

  async function outrosAdmins(id) {
    return (await um('SELECT COUNT(*)::int AS n FROM equipe WHERE admin AND ativo AND id <> $1', [id])).n;
  }
  const atualizaSessoes = (u) => pool.query('UPDATE sessoes SET nome = $2, admin = $3 WHERE usuario = $1', [String(u.id), u.nome, !!u.admin]);
  const derrubaSessoes = (id, menos) => pool.query('DELETE FROM sessoes WHERE usuario = $1 AND token <> $2', [String(id), menos || '']);

  async function rota(req, res, url) {
    const p = url.pathname, m = req.method;
    // qualquer pessoa da equipe: trocar a própria senha
    if (p === '/api/equipe/minha-senha') {
      if (m !== 'POST') throw erro(405, 'use POST');
      const s = await exigeSessao(req);
      if (!(await limite('senha:' + s.usuario, 10, 900))) throw erro(429, 'Muitas tentativas. Espere alguns minutos.');
      const b = await lerCorpo(req, 4096);
      const u = /^\d{1,18}$/.test(String(s.usuario)) ? await um('SELECT * FROM equipe WHERE id = $1 AND ativo', [s.usuario]) : null;
      if (!u) throw erro(404, 'Usuário não encontrado. Entre de novo.');
      if (!(await confere(u.senha_hash, String(b.atual || '')))) throw erro(400, 'A senha atual não confere.');
      const nova = String(b.nova || '');
      const prob = problemaSenha(nova, u.login);
      if (prob) throw erro(400, prob);
      if (nova === String(b.atual || '')) throw erro(400, 'A nova senha precisa ser diferente da atual.');
      await pool.query('UPDATE equipe SET senha_hash = $2, trocar_senha = false, senha_em = now() WHERE id = $1', [u.id, await geraHash(nova)]);
      await derrubaSessoes(u.id, s.token); // os outros aparelhos saem; este continua
      return json(res, 200, { ok: true });
    }
    const s = await exigeAdmin(req);
    if (p === '/api/equipe') {
      if (m === 'GET') return json(res, 200, { usuarios: (await todos('SELECT * FROM equipe ORDER BY ativo DESC, admin DESC, lower(nome)')).map(publico), eu: String(s.usuario) });
      if (m !== 'POST') throw erro(405, 'use GET ou POST');
      if (!(await limite('equipe:' + ipDe(req), 60, 3600))) throw erro(429, 'Muitas mudanças seguidas. Espere um pouco.');
      const b = await lerCorpo(req, 4096);
      const nome = txt(b.nome, 60), login = normLogin(b.login);
      if (!nome) throw erro(400, 'Falta o nome.');
      if (!LOGIN_OK.test(login)) throw erro(400, 'Usuário: de 3 a 40 letras minúsculas, números, ponto, hífen ou sublinhado, sem espaços.');
      if (await um('SELECT 1 FROM equipe WHERE login = $1', [login])) throw erro(409, 'Já existe alguém com o usuário "' + login + '".');
      const senha = senhaProvisoria();
      const u = await um('INSERT INTO equipe (login, nome, admin, senha_hash, trocar_senha) VALUES ($1, $2, $3, $4, true) RETURNING *', [login, nome, !!b.admin, await geraHash(senha)]);
      console.log(new Date().toISOString(), 'equipe: ' + s.nome + ' criou o usuário ' + login + (u.admin ? ' (admin)' : ''));
      return json(res, 201, { usuario: publico(u), senhaProvisoria: senha });
    }
    const mt = p.match(/^\/api\/equipe\/(\d{1,18})$/);
    if (!mt) throw erro(404, 'rota não encontrada');
    const u = await um('SELECT * FROM equipe WHERE id = $1', [mt[1]]);
    if (!u) throw erro(404, 'Usuário não encontrado.');
    const euMesmo = String(u.id) === String(s.usuario);
    if (!(await limite('equipe:' + ipDe(req), 60, 3600))) throw erro(429, 'Muitas mudanças seguidas. Espere um pouco.');
    if (m === 'DELETE') {
      if (euMesmo) throw erro(400, 'Você não pode remover o seu próprio usuário.');
      if (u.admin && u.ativo && !(await outrosAdmins(u.id))) throw erro(400, 'É preciso ficar pelo menos um administrador.');
      await pool.query('DELETE FROM equipe WHERE id = $1', [u.id]);
      await derrubaSessoes(u.id);
      console.log(new Date().toISOString(), 'equipe: ' + s.nome + ' removeu o usuário ' + u.login);
      return json(res, 200, { ok: true });
    }
    if (m !== 'PATCH') throw erro(405, 'use PATCH ou DELETE');
    const b = await lerCorpo(req, 4096);
    const nome = b.nome !== undefined ? txt(b.nome, 60) : u.nome;
    if (!nome) throw erro(400, 'Falta o nome.');
    const admin = b.admin !== undefined ? !!b.admin : u.admin;
    const ativo = b.ativo !== undefined ? !!b.ativo : u.ativo;
    if (euMesmo && (!admin || !ativo)) throw erro(400, 'Você não pode tirar o seu próprio acesso. Peça a outro administrador.');
    if (u.admin && u.ativo && (!admin || !ativo) && !(await outrosAdmins(u.id))) throw erro(400, 'É preciso ficar pelo menos um administrador.');
    let senha = null;
    if (b.novaSenha) {
      if (euMesmo) throw erro(400, 'Para a sua própria senha, use "Minha senha".');
      senha = senhaProvisoria();
    }
    const n = await um('UPDATE equipe SET nome = $2, admin = $3, ativo = $4' + (senha ? ', senha_hash = $5, trocar_senha = true, senha_em = now()' : '') + ' WHERE id = $1 RETURNING *',
      senha ? [u.id, nome, admin, ativo, await geraHash(senha)] : [u.id, nome, admin, ativo]);
    if (!ativo || senha) await derrubaSessoes(u.id); else await atualizaSessoes(n);
    if (senha || ativo !== u.ativo || admin !== u.admin) console.log(new Date().toISOString(), 'equipe: ' + s.nome + ' mudou o usuário ' + u.login + (senha ? ' (senha nova)' : '') + (ativo !== u.ativo ? (ativo ? ' (reativado)' : ' (desativado)') : '') + (admin !== u.admin ? (admin ? ' (agora admin)' : ' (sem admin)') : ''));
    return json(res, 200, Object.assign({ usuario: publico(n) }, senha ? { senhaProvisoria: senha } : {}));
  }

  return { semeia, autentica, trocaPendente, rota };
}

module.exports = criaEquipe;
Object.assign(module.exports, { ESQUEMA, geraHash, confere, problemaSenha, senhaProvisoria });

/* ---------------- linha de comando ---------------- */
if (require.main === module) {
  (async () => {
    try {
      for (const l of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
        const mm = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
        if (mm && process.env[mm[1]] === undefined) process.env[mm[1]] = mm[2].replace(/^(['"])(.*)\1$/, '$2');
      }
    } catch (e) { /* sem .env */ }
    const url = process.env.DATABASE_URL || (process.env.POSTGRES_PASSWORD ? 'postgres://pizzaria:' + encodeURIComponent(process.env.POSTGRES_PASSWORD) + '@127.0.0.1:5433/pizzaria' : '');
    const [cmd, alvo] = process.argv.slice(2);
    if (!url || !['lista', 'senha'].includes(cmd) || (cmd === 'senha' && !alvo)) {
      console.log('Uso: node equipe.js lista\n     node equipe.js senha <usuário>   (gera uma senha nova; o usuário troca ao entrar)');
      process.exit(url ? 1 : 2);
    }
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: url, max: 1 });
    try {
      if (cmd === 'lista') {
        const l = (await pool.query('SELECT login, nome, admin, ativo, ultimo_acesso FROM equipe ORDER BY id')).rows;
        for (const u of l) console.log((u.ativo ? '  ' : '✗ ') + u.login.padEnd(22) + (u.admin ? 'admin  ' : '       ') + u.nome + (u.ultimo_acesso ? '  · último acesso ' + new Date(u.ultimo_acesso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : ''));
        if (!l.length) console.log('Nenhum usuário (o servidor cria o admin na primeira subida).');
      } else {
        const senha = senhaProvisoria();
        const r = await pool.query('UPDATE equipe SET senha_hash = $2, trocar_senha = true, ativo = true, senha_em = now() WHERE login = $1 RETURNING id', [normLogin(alvo), await geraHash(senha)]);
        if (!r.rowCount) { console.log('Usuário "' + alvo + '" não existe. Veja: node equipe.js lista'); process.exitCode = 1; }
        else {
          await pool.query('DELETE FROM sessoes WHERE usuario = $1', [String(r.rows[0].id)]);
          console.log('Senha nova de "' + normLogin(alvo) + '": ' + senha + '\nEla vale uma vez: ao entrar na gestão, o sistema pede uma senha nova.');
        }
      }
    } finally { await pool.end(); }
  })().catch((e) => { console.error('Erro:', e.message); process.exit(1); });
}
