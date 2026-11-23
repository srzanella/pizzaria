'use strict';
/*
 * Servidor do site da Pizzaria Pereira com pedidos e gestão (Node 22+, PostgreSQL).
 *  - Entrega o site (dist/index.html) e a gestão da equipe (dist/gestao.html em /gestao).
 *  - Guarda pedidos, clientes, sessões e ajustes no PostgreSQL (DATABASE_URL).
 *  - Pronto para várias instâncias atrás de um balanceador: sessões ficam no banco, mudanças num pedido são
 *    gravadas com trava de linha, e os avisos ao vivo passam pelo próprio Postgres (LISTEN/NOTIFY), então o
 *    painel recebe o pedido mesmo que ele tenha entrado por outra instância.
 *  - Na primeira subida com o banco vazio, importa o banco antigo em SQLite (DADOS/pedidos.db), se existir.
 *  - Contas dos clientes (contas.js): entrar com código por email ou conta Google, pedidos anteriores, pedir de novo.
 *  - Entregadores (entregadores.js): pareamento do celular, jornada e posição ao vivo no mapa do cliente e da gestão.
 *  - Equipe (equipe.js): usuários e senhas da gestão no banco (scrypt), nunca na página pública.
 *  - Preços (precos.js): o total do pedido do site é refeito com o cardápio; se não bater, vale a conta do servidor
 *    e o pedido chega na gestão com um aviso.
 * Uso: node server.js     variáveis: PORT (5180), DATABASE_URL, PG_POOL (10), SITE_URL, DADOS, PAGINA,
 *      CHAVE_SEGREDOS, ENDERECO_REDE, ADMIN_SENHA_INICIAL, PROXY_CONFIAVEL e os padrões GOOGLE_CLIENT_ID,
 *      SMTP_URL, EMAIL_DE (veja .env.exemplo; email e Google se configuram na gestão: Configurações)
 *      (lê o arquivo .env ao lado deste, se existir; sem DATABASE_URL, usa o banco do docker-compose em 127.0.0.1:5433)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { Pool, Client, types } = require('pg');
const { gerarDemo } = require('./demo.js');
const criaPrecos = require('./precos.js');

// .env (só o que ainda não veio do ambiente)
try {
  for (const l of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch (e) { /* sem .env */ }

const PORTA = +process.env.PORT || 5180;
const DIR_DADOS = path.resolve(process.env.DADOS || path.join(__dirname, 'dados'));
const PAGINA = path.resolve(process.env.PAGINA || path.join(__dirname, 'dist', 'index.html'));
const PAGINA_GESTAO = path.join(path.dirname(PAGINA), 'gestao.html');
const PAGINA_MOTOBOY = path.join(path.dirname(PAGINA), 'motoboy.html');
const APK = path.join(path.dirname(PAGINA), 'entregador.apk');
const FUSO = 'America/Sao_Paulo';
const CORTE_HORAS = 5; // pedido feito até as 5h da manhã entra no fechamento do dia anterior
const SESSAO_HORAS = 14;
const STATUS = ['novo', 'preparo', 'forno', 'saiu', 'pronto', 'concluido', 'cancelado'];
const PAGAMENTOS = ['pix', 'credito', 'debito', 'dinheiro'];
const CANAIS = ['site', 'balcao', 'telefone', 'whatsapp'];
const SITE_URL = String(process.env.SITE_URL || '').replace(/\/+$/, ''); // endereço público, para os links de acompanhamento
const CANAL_EVENTOS = 'pizzaria_pedidos';
const DATABASE_URL = process.env.DATABASE_URL || (process.env.POSTGRES_PASSWORD ? 'postgres://pizzaria:' + encodeURIComponent(process.env.POSTGRES_PASSWORD) + '@127.0.0.1:5433/pizzaria' : '');
if (!DATABASE_URL) { console.error('Defina DATABASE_URL (ou POSTGRES_PASSWORD no .env) para conectar ao PostgreSQL.'); process.exit(1); }

/* ---------------- banco ---------------- */
types.setTypeParser(1082, (v) => v); // date → 'AAAA-MM-DD'
const lerDataHora = types.getTypeParser(1184);
types.setTypeParser(1184, (v) => { const d = lerDataHora(v); return d instanceof Date && !isNaN(d) ? d.toISOString() : v; }); // timestamptz → ISO
types.setTypeParser(1700, (v) => parseFloat(v)); // numeric → número
types.setTypeParser(20, (v) => parseInt(v, 10)); // bigint (ids, contagens) → número
const pool = new Pool({ connectionString: DATABASE_URL, max: +process.env.PG_POOL || 10, statement_timeout: 20000, connectionTimeoutMillis: 8000 });
pool.on('error', (e) => console.error('PostgreSQL (conexão ociosa):', e.message));
const um = async (sql, p) => (await pool.query(sql, p)).rows[0] || null;
const todos = async (sql, p) => (await pool.query(sql, p)).rows;
async function transacao(fn) {
  const c = await pool.connect();
  try { await c.query('BEGIN'); const r = await fn(c); await c.query('COMMIT'); return r; }
  catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
  finally { c.release(); }
}
const ESQUEMA = `
  CREATE TABLE IF NOT EXISTS pedidos (
    id BIGSERIAL PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    codigo TEXT NOT NULL,
    dia DATE NOT NULL,
    criado_em TIMESTAMPTZ NOT NULL,
    atualizado_em TIMESTAMPTZ NOT NULL,
    canal TEXT NOT NULL,
    status TEXT NOT NULL,
    modo TEXT NOT NULL,
    total NUMERIC(12,2) NOT NULL,
    cliente_chave TEXT NOT NULL,
    dados JSONB NOT NULL,
    demo BOOLEAN NOT NULL DEFAULT FALSE
  );
  CREATE INDEX IF NOT EXISTS pedidos_dia ON pedidos (dia);
  CREATE INDEX IF NOT EXISTS pedidos_cliente ON pedidos (cliente_chave, criado_em);
  CREATE INDEX IF NOT EXISTS pedidos_demo ON pedidos (demo) WHERE demo;
  CREATE TABLE IF NOT EXISTS sessoes (
    token TEXT PRIMARY KEY,
    usuario TEXT NOT NULL,
    nome TEXT NOT NULL,
    admin BOOLEAN NOT NULL,
    expira TIMESTAMPTZ NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessoes_expira ON sessoes (expira);
  CREATE TABLE IF NOT EXISTS clientes (
    chave TEXT PRIMARY KEY,
    notas TEXT NOT NULL DEFAULT '',
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor JSONB NOT NULL);
  CREATE TABLE IF NOT EXISTS limites (chave TEXT PRIMARY KEY, inicio TIMESTAMPTZ NOT NULL, n INT NOT NULL);

  -- contas dos clientes do site (entrar com código por email ou Google)
  CREATE TABLE IF NOT EXISTS contas (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    google_sub TEXT UNIQUE,
    nome TEXT NOT NULL DEFAULT '',
    fone TEXT NOT NULL DEFAULT '',
    fone_chave TEXT,
    enderecos JSONB NOT NULL DEFAULT '[]'::jsonb,
    ofertas BOOLEAN NOT NULL DEFAULT FALSE,
    ofertas_em TIMESTAMPTZ,
    historico_chave TEXT,
    origem TEXT NOT NULL DEFAULT 'codigo',
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    ultimo_acesso TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS contas_fone ON contas (fone_chave) WHERE fone_chave IS NOT NULL;
  CREATE TABLE IF NOT EXISTS sessoes_contas (
    token_hash TEXT PRIMARY KEY,
    conta_id BIGINT NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
    expira TIMESTAMPTZ NOT NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS sessoes_contas_conta ON sessoes_contas (conta_id);
  CREATE TABLE IF NOT EXISTS codigos (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    codigo_hash TEXT NOT NULL,
    dados JSONB NOT NULL DEFAULT '{}'::jsonb,
    tentativas INT NOT NULL DEFAULT 0,
    usado BOOLEAN NOT NULL DEFAULT FALSE,
    ip TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    expira TIMESTAMPTZ NOT NULL
  );
  CREATE INDEX IF NOT EXISTS codigos_email ON codigos (email, criado_em);

  -- entregadores, jornadas e posições (rastreamento)
  CREATE TABLE IF NOT EXISTS entregadores (
    id BIGSERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    fone TEXT NOT NULL DEFAULT '',
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    token_hash TEXT UNIQUE,
    pareamento_hash TEXT,
    pareamento_expira TIMESTAMPTZ,
    pareado_em TIMESTAMPTZ,
    aparelho TEXT NOT NULL DEFAULT '',
    jornada_id BIGINT,
    lat DOUBLE PRECISION, lng DOUBLE PRECISION, precisao REAL, velocidade REAL, rumo REAL, bateria REAL,
    posicao_em TIMESTAMPTZ,
    nativo BOOLEAN NOT NULL DEFAULT FALSE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS jornadas (
    id BIGSERIAL PRIMARY KEY,
    entregador_id BIGINT NOT NULL REFERENCES entregadores(id) ON DELETE CASCADE,
    inicio TIMESTAMPTZ NOT NULL DEFAULT now(),
    fim TIMESTAMPTZ,
    km DOUBLE PRECISION NOT NULL DEFAULT 0,
    pontos INT NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS jornadas_entregador ON jornadas (entregador_id, inicio);
  CREATE TABLE IF NOT EXISTS posicoes (
    jornada_id BIGINT NOT NULL REFERENCES jornadas(id) ON DELETE CASCADE,
    t TIMESTAMPTZ NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    precisao REAL, velocidade REAL, rumo REAL
  );
  CREATE INDEX IF NOT EXISTS posicoes_jornada ON posicoes (jornada_id, t);

  ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS conta_id BIGINT REFERENCES contas(id) ON DELETE SET NULL;
  ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS entregador_id BIGINT REFERENCES entregadores(id) ON DELETE SET NULL;
  CREATE INDEX IF NOT EXISTS pedidos_conta ON pedidos (conta_id, criado_em) WHERE conta_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS pedidos_entregador ON pedidos (entregador_id, status) WHERE entregador_id IS NOT NULL;
` + require('./enderecos.js').ESQUEMA // base de endereços do IBGE (ponto do mapa pelo número)
  + require('./equipe.js').ESQUEMA;   // usuários da equipe
// esquema e importação com trava: várias instâncias subindo juntas não brigam
async function preparaBanco() {
  const c = await pool.connect();
  try {
    await c.query('SELECT pg_advisory_lock(727001)');
    await c.query(ESQUEMA);
    await equipe.semeia(c);
    await importaSqliteAntigo(c);
  } finally {
    await c.query('SELECT pg_advisory_unlock(727001)').catch(() => {});
    c.release();
  }
}
// banco antigo (SQLite, antes do PostgreSQL): importado uma única vez, com o Postgres vazio
async function importaSqliteAntigo(c) {
  const arq = path.join(DIR_DADOS, 'pedidos.db');
  if (!fs.existsSync(arq)) return;
  if ((await c.query('SELECT COUNT(*)::int AS n FROM pedidos')).rows[0].n) return;
  let sqlite;
  try { sqlite = new (require('node:sqlite').DatabaseSync)(arq); } catch (e) { console.error('Banco antigo encontrado, mas não deu para abrir:', e.message); return; }
  const linhas = sqlite.prepare('SELECT * FROM pedidos ORDER BY criado_em, id').all();
  let clientes = [], config = [];
  try { clientes = sqlite.prepare('SELECT * FROM clientes').all(); } catch (e) { /* tabela não existia */ }
  try { config = sqlite.prepare('SELECT * FROM config').all(); } catch (e) { /* tabela não existia */ }
  await c.query('BEGIN');
  try {
    for (let i = 0; i < linhas.length; i += 400) {
      const lote = linhas.slice(i, i + 400);
      const vals = [], ps = [];
      lote.forEach((l, k) => {
        const d = JSON.parse(l.dados);
        const b = k * 12;
        ps.push('(' + Array.from({ length: 12 }, (_, j) => '$' + (b + j + 1) + (j === 10 ? '::jsonb' : '')).join(',') + ')');
        vals.push(l.token, l.codigo, l.dia, l.criado_em, l.atualizado_em, l.canal, l.status, l.modo, l.total, chaveCliente(d.cliente && d.cliente.nome, d.cliente && d.cliente.fone), JSON.stringify(d), !!l.demo);
      });
      await c.query('INSERT INTO pedidos (token, codigo, dia, criado_em, atualizado_em, canal, status, modo, total, cliente_chave, dados, demo) VALUES ' + ps.join(',') + ' ON CONFLICT (token) DO NOTHING', vals);
    }
    for (const x of clientes) await c.query('INSERT INTO clientes (chave, notas, tags, atualizado_em) VALUES ($1, $2, $3::jsonb, $4) ON CONFLICT (chave) DO NOTHING', [x.chave, x.notas || '', x.tags || '[]', x.atualizado_em || new Date().toISOString()]);
    for (const x of config) await c.query('INSERT INTO config (chave, valor) VALUES ($1, $2::jsonb) ON CONFLICT (chave) DO NOTHING', [x.chave, x.valor]);
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); sqlite.close(); throw e; }
  sqlite.close();
  const marca = '.migrado-' + new Date().toISOString().slice(0, 10);
  for (const suf of ['', '-wal', '-shm']) { try { fs.renameSync(arq + suf, arq + suf + marca); } catch (e) { /* arquivo auxiliar ausente */ } }
  console.log('Banco antigo (SQLite) importado: ' + linhas.length + ' pedidos, ' + clientes.length + ' fichas de cliente, ' + config.length + ' ajustes. Arquivo renomeado para pedidos.db' + marca);
}

const COLUNAS = ['id', 'token', 'codigo', 'dia', 'criadoEm', 'atualizadoEm', 'canal', 'status', 'modo', 'total', 'demo', 'contaId', 'entregadorId'];
function linhaParaPedido(l) {
  return Object.assign({}, l.dados, { id: l.id, token: l.token, codigo: l.codigo, dia: l.dia, criadoEm: l.criado_em, atualizadoEm: l.atualizado_em, canal: l.canal, status: l.status, modo: l.modo, total: l.total, demo: !!l.demo, contaId: l.conta_id == null ? null : l.conta_id, entregadorId: l.entregador_id == null ? null : l.entregador_id });
}
function dadosDoPedido(p) { const d = Object.assign({}, p); COLUNAS.forEach((k) => delete d[k]); return JSON.stringify(d); }

const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });
const diaOperacional = (d = new Date()) => fmtDia.format(new Date(d.getTime() - CORTE_HORAS * 3600e3));

/* ---------------- dados publicados do site (cardápio, horários, entrega, promoções) ---------------- */
// Os ajustes da loja salvos na gestão (Configurações → Pizzaria: contato e modo teste) valem por cima do que foi
// publicado: entram no dadosSite() e nas páginas na hora de enviar, sem gerar o site de novo.
const CAMPOS_LOJA = ['whatsapp', 'telefoneFixo', 'instagram', 'modoTeste'];
let ajustesLoja = { versao: 0, valores: {} };
let cacheSite = { mtime: -1, versao: -1, publicado: {}, dados: {} };
function dadosSite() {
  try {
    const st = fs.statSync(PAGINA);
    if (st.mtimeMs !== cacheSite.mtime) {
      const m = fs.readFileSync(PAGINA, 'utf8').match(/<script type="application\/json" id="pp-data">([\s\S]*?)<\/script>/);
      cacheSite = { mtime: st.mtimeMs, versao: -1, publicado: m ? JSON.parse(m[1]) : {}, dados: {} };
    }
  } catch (e) { console.error('Não consegui ler os dados da página:', e.message); }
  if (cacheSite.versao !== ajustesLoja.versao) {
    const pub = cacheSite.publicado;
    cacheSite.dados = Object.assign({}, pub, { config: Object.assign({}, pub.config, ajustesLoja.valores) });
    cacheSite.versao = ajustesLoja.versao;
  }
  return cacheSite.dados;
}
// relida a cada minuto: com mais de uma instância, a que não recebeu o PATCH também passa a valer
async function carregaAjustesLoja() {
  const v = await lerConfig('loja', {});
  if (JSON.stringify(v) !== JSON.stringify(ajustesLoja.valores)) ajustesLoja = { versao: ajustesLoja.versao + 1, valores: v };
}
// conta dos preços com o cardápio da página publicada (refeita quando a página muda)
let cachePrecos = { dados: null, p: null };
function precos() {
  const d = dadosSite();
  if (cachePrecos.dados !== d) cachePrecos = { dados: d, p: criaPrecos(d) };
  return cachePrecos.p;
}
const lerConfig = async (k, padrao) => { const l = await um('SELECT valor FROM config WHERE chave = $1', [k]); return l ? l.valor : padrao; };
const gravaConfig = (k, v) => pool.query('INSERT INTO config (chave, valor) VALUES ($1, $2::jsonb) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor', [k, JSON.stringify(v)]);
// cliente = telefone (DDD + 8 últimos dígitos, para casar números com e sem o 9 extra); sem telefone, o nome
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
function chaveCliente(nome, fone) {
  let d = String(fone || '').replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  if (d.length >= 10) return d.slice(0, 2) + d.slice(-8);
  return 'nome:' + semAcento(nome);
}
// 5 casas decimais (~1 m): o ponto da entrega é a porta do cliente (com 3 casas, o pino andava até ~80 m)
const geoValido = (g) => (g && Number.isFinite(+g.lat) && Number.isFinite(+g.lng) && Math.abs(+g.lat) <= 90 && Math.abs(+g.lng) <= 180 && (+g.lat || +g.lng) ? { lat: Math.round(+g.lat * 1e5) / 1e5, lng: Math.round(+g.lng * 1e5) / 1e5 } : null);

/* ---------------- utilidades HTTP ---------------- */
function erro(status, msg) { const e = new Error(msg); e.status = status; return e; }
function json(res, status, corpo, extras) {
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }, extras || {}));
  res.end(JSON.stringify(corpo));
}
// respostas grandes (análises, clientes, páginas) vão comprimidas quando o navegador aceita
function jsonZ(req, res, status, corpo) { enviaZ(req, res, status, Buffer.from(JSON.stringify(corpo)), 'application/json; charset=utf-8', { 'Cache-Control': 'no-store' }); }
function enviaZ(req, res, status, buf, tipo, extras) {
  const h = Object.assign({ 'Content-Type': tipo, 'X-Content-Type-Options': 'nosniff', Vary: 'Accept-Encoding' }, extras || {});
  if (buf.length > 2048 && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) { buf = zlib.gzipSync(buf, { level: 6 }); h['Content-Encoding'] = 'gzip'; }
  h['Content-Length'] = buf.length;
  res.writeHead(status, h);
  res.end(req.method === 'HEAD' ? undefined : buf);
}
function lerCorpo(req, max = 48 * 1024) {
  if (!/application\/json/i.test(req.headers['content-type'] || '')) return Promise.reject(erro(415, 'envie JSON'));
  return new Promise((ok, falha) => {
    let tam = 0; const partes = [];
    req.on('data', (c) => { tam += c.length; if (tam > max) { falha(erro(413, 'conteúdo grande demais')); req.destroy(); } else partes.push(c); });
    req.on('end', () => { try { ok(JSON.parse(Buffer.concat(partes).toString('utf8') || '{}')); } catch (e) { falha(erro(400, 'JSON inválido')); } });
    req.on('error', falha);
  });
}
const cookies = (req) => Object.fromEntries(String(req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
// IP de quem chamou. Os cabeçalhos X-Forwarded-* só valem quando há proxy nosso na frente (Caddy, balanceador):
// PROXY_CONFIAVEL = quantos proxies há entre a internet e este servidor (0 = nenhum, padrão). Sem isso, qualquer um
// mandaria um X-Forwarded-For inventado a cada tentativa e escaparia dos limites de login, códigos e pedidos.
const PROXIES = Math.max(0, Math.min(5, parseInt(process.env.PROXY_CONFIAVEL || '0', 10) || 0));
const limpaIp = (s) => String(s || '').trim().replace(/^::ffff:/i, '').slice(0, 64);
function ipDe(req) {
  if (PROXIES) {
    const l = String(req.headers['x-forwarded-for'] || '').split(',').map((x) => x.trim()).filter(Boolean);
    if (l.length >= PROXIES) return limpaIp(l[l.length - PROXIES]); // o que o NOSSO proxy viu (o resto da lista pode ser inventado)
  }
  return limpaIp(req.socket.remoteAddress) || '?';
}
// limite compartilhado entre instâncias (janela fixa, contada no banco)
async function limite(chave, max, segundos) {
  const r = await um(`INSERT INTO limites (chave, inicio, n) VALUES ($1, now(), 1)
    ON CONFLICT (chave) DO UPDATE SET
      n = CASE WHEN limites.inicio < now() - make_interval(secs => $2) THEN 1 ELSE limites.n + 1 END,
      inicio = CASE WHEN limites.inicio < now() - make_interval(secs => $2) THEN now() ELSE limites.inicio END
    RETURNING n`, [String(chave).slice(0, 200), segundos]);
  return r.n <= max;
}
const seguro = (req) => !!req.socket.encrypted || (PROXIES > 0 && String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https');
const hostDe = (req) => String((PROXIES > 0 && req.headers['x-forwarded-host']) || req.headers.host || '').split(',')[0].trim();
setInterval(() => {
  if (!lojaGeoPronta) garanteLojaGeo().catch((e) => console.error('local da pizzaria:', e.message));
  pool.query('DELETE FROM sessoes WHERE expira <= now()').catch(() => {});
  pool.query("DELETE FROM limites WHERE inicio < now() - interval '1 day'").catch(() => {});
  if (contasCli) contasCli.limpeza().catch((e) => console.error('limpeza contas:', e.message));
  if (frota) frota.limpeza().catch((e) => console.error('limpeza entregadores:', e.message));
}, 10 * 60e3).unref();

/* texto limpo: sem caracteres de controle (quebra de linha só onde faz sentido) */
const txt = (v, max, linhas) => String(v == null ? '' : v).replace(linhas ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const valor = (v, max = 100000) => { const n = Math.round(Number(v) * 100) / 100; return Number.isFinite(n) && n >= 0 && n <= max ? n : 0; };

async function sessaoDe(req) {
  const t = cookies(req).pp_sess;
  return t ? um('SELECT token, usuario, nome, admin FROM sessoes WHERE token = $1 AND expira > now()', [t]) : null;
}
async function exigeSessao(req) {
  const s = await sessaoDe(req);
  if (!s) throw erro(401, 'entre de novo');
  return s;
}
async function exigeAdmin(req) { const s = await exigeSessao(req); if (!s.admin) throw erro(403, 'só administradores'); return s; }

/* ---------------- pedidos ---------------- */
function validaPedido(b, interno) {
  const token = String(b.token || '');
  if (!/^[A-Za-z0-9]{16,40}$/.test(token)) throw erro(400, 'token inválido');
  const codigo = String(b.codigo || '').toUpperCase();
  if (!/^#[A-Z0-9]{3,8}$/.test(codigo)) throw erro(400, 'código inválido');
  const modo = b.modo === 'entrega' || b.modo === 'retirada' ? b.modo : null;
  if (!modo) throw erro(400, 'modo inválido');
  const itens = (Array.isArray(b.itens) ? b.itens : []).slice(0, 60).map((i) => ({
    qtd: Math.max(1, Math.min(99, Math.round(+i.qtd) || 1)),
    tipo: i.tipo === 'pizza' ? 'pizza' : 'item',
    nome: txt(i.nome, 120),
    detalhe: txt(i.detalhe, 300),
    obs: txt(i.obs, 300),
    valor: valor(i.valor),
    sabores: Array.isArray(i.sabores) ? i.sabores.slice(0, 4).map((s) => txt(s, 60)) : undefined,
    tamanho: i.tamanho ? txt(i.tamanho, 30) : undefined,
    borda: i.borda ? txt(i.borda, 40) : undefined,
    massa: i.tipo === 'pizza' && i.massa ? txt(i.massa, 40) : undefined, // para o "pedir de novo"
    itemId: i.tipo !== 'pizza' && i.itemId ? txt(i.itemId, 60) : undefined
  })).filter((i) => i.nome);
  if (!itens.length) throw erro(400, 'pedido sem itens');
  const nome = txt(b.cliente && b.cliente.nome, 80);
  const fone = txt(b.cliente && b.cliente.fone, 30);
  if (!nome) throw erro(400, 'falta o nome');
  if (!interno && fone.replace(/\D/g, '').length < 10) throw erro(400, 'telefone inválido');
  const e = b.endereco || {};
  const pg = b.pagamento || {};
  const canal = interno && CANAIS.includes(b.canal) ? b.canal : 'site';
  return {
    token, codigo, modo, canal,
    cliente: { nome, fone },
    endereco: modo === 'entrega' ? { cep: txt(e.cep, 12), rua: txt(e.rua, 150), numero: txt(e.numero, 20), compl: txt(e.compl, 100), bairro: txt(e.bairro, 100), cidade: txt(e.cidade, 80), ref: txt(e.ref, 150) } : null,
    km: modo === 'entrega' && Number.isFinite(+b.km) && b.km !== null ? Math.round(+b.km * 10) / 10 : null,
    geo: modo === 'entrega' ? geoValido(b.geo) : null,
    // quão certo é o ponto: exato/interpolado (base do IBGE), aproximado (mapa aberto) ou confirmado pelo cliente no mapa
    geoPrec: modo === 'entrega' && geoValido(b.geo) && ['exato', 'interpolado', 'aproximado', 'confirmado'].includes(b.geoPrec) ? b.geoPrec : null,
    itens,
    promocoes: (Array.isArray(b.promocoes) ? b.promocoes : []).slice(0, 10).map((p) => ({ nome: txt(p.nome, 80), valor: valor(p.valor), brinde: txt(p.brinde, 80), tipo: txt(p.tipo, 30) })),
    subtotal: valor(b.subtotal), desconto: valor(b.desconto), taxa: modo === 'entrega' ? valor(b.taxa, 1000) : 0, freteGratis: !!b.freteGratis,
    total: valor(b.total),
    pagamento: { forma: PAGAMENTOS.includes(pg.forma) ? pg.forma : '', trocoPara: pg.trocoPara ? valor(pg.trocoPara) : null, semTroco: !!pg.semTroco },
    obs: txt(b.obs, 500, true),
    cupom: txt(b.cupom, 30)
  };
}
async function criaPedido(v, por, interno, origem, contaId) {
  const agora = new Date();
  // pedido do site começa como novo (aguarda a mensagem no WhatsApp); o lançado pela equipe já entra confirmado
  const inicial = interno ? 'preparo' : 'novo';
  const historico = [{ status: 'novo', em: agora.toISOString(), por }].concat(interno ? [{ status: 'preparo', em: agora.toISOString(), por }] : []);
  const p = Object.assign({}, v, { status: inicial, historico, origem, pago: false, entregador: '', obsInterna: '', motivo: '', previsao: null });
  const l = await um('INSERT INTO pedidos (token, codigo, dia, criado_em, atualizado_em, canal, status, modo, total, cliente_chave, dados, conta_id) VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, $9, $10::jsonb, $11) ON CONFLICT (token) DO NOTHING RETURNING *',
    [v.token, v.codigo, diaOperacional(agora), agora.toISOString(), v.canal, inicial, v.modo, v.total, chaveCliente(v.cliente.nome, v.cliente.fone), dadosDoPedido(p), contaId || null]);
  if (l) return { pedido: linhaParaPedido(l), novo: true };
  return { pedido: linhaParaPedido(await um('SELECT * FROM pedidos WHERE token = $1', [v.token])), novo: false }; // o cliente tocou duas vezes: mesmo pedido
}
function visaoPublica(p) {
  return {
    codigo: p.codigo, status: p.status, modo: p.modo, criadoEm: p.criadoEm,
    historico: (p.historico || []).map((h) => ({ status: h.status, em: h.em })),
    itens: (p.itens || []).map((i) => ({ qtd: i.qtd, tipo: i.tipo, nome: i.nome, detalhe: i.detalhe, sabores: i.sabores, tamanho: i.tamanho, borda: i.borda })),
    total: p.total, nome: String((p.cliente && p.cliente.nome) || '').split(/\s+/)[0],
    previsao: p.previsao || null,
    entregador: p.status === 'saiu' ? p.entregador || '' : '',
    motivo: p.status === 'cancelado' ? p.motivo || '' : '',
    // rastreamento: só com o pedido na rua e um entregador do app; o destino é o endereço do próprio cliente
    rastreio: p.status === 'saiu' && !!p.entregadorId,
    destino: p.status === 'saiu' && p.entregadorId && p.geo ? p.geo : null
  };
}
function aplicaMudancas(p, b, s, ent) {
  const agora = new Date().toISOString();
  if (b.status !== undefined && b.status !== p.status) {
    if (!STATUS.includes(b.status)) throw erro(400, 'status inválido');
    if (b.status === 'saiu' && p.modo !== 'entrega') throw erro(400, 'pedido de retirada não sai para entrega');
    if (b.status === 'pronto' && p.modo !== 'retirada') throw erro(400, 'pedido de entrega sai para entrega');
    p.status = b.status;
    p.historico = (p.historico || []).concat({ status: b.status, em: agora, por: s.nome });
    if (b.status === 'cancelado') p.motivo = txt(b.motivo, 200);
  }
  if (b.pago !== undefined) p.pago = !!b.pago;
  // entregador do app (entregadorId) ou só o nome digitado (entregador)
  if (b.entregadorId !== undefined) {
    if (ent) { p.entregadorId = ent.id; p.entregador = ent.nome; }
    else { p.entregadorId = null; if (b.entregador === undefined) p.entregador = ''; }
  }
  if (b.entregador !== undefined) { p.entregador = txt(b.entregador, 60); if (b.entregadorId === undefined) p.entregadorId = null; }
  if (b.obsInterna !== undefined) p.obsInterna = txt(b.obsInterna, 1000, true);
  if (b.previsaoMin !== undefined) {
    const m = Math.round(+b.previsaoMin);
    p.previsao = m > 0 && m <= 240 ? new Date(Date.now() + m * 60e3).toISOString() : null;
  }
  p.atualizadoEm = agora;
}

/* ---------------- tempo real: Server-Sent Events alimentados pelo LISTEN/NOTIFY do Postgres ---------------- */
const painel = new Set();
const acompanham = new Map(); // token do pedido -> conexões do cliente
const seguemMoto = new Map(); // entregador -> conexões de clientes com pedido na rua com ele (recebem a posição)
const motoboys = new Map();   // entregador -> conexões do app dele
let conexoesPublicas = 0;
function abreEventos(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('retry: 4000\n\n');
  req.socket.setTimeout(0);
}
const evento = (res, nome, dados) => res.write('event: ' + nome + '\ndata: ' + JSON.stringify(dados) + '\n\n');
// o cliente só recebe a posição do entregador enquanto o pedido dele está "saiu para entrega" com esse entregador
function indexaMoto(r) {
  const novo = r.ped && r.ped.st === 'saiu' && r.ped.ent ? r.ped.ent : null;
  if (r.motoIdx === novo) return;
  if (r.motoIdx) { const s = seguemMoto.get(r.motoIdx); if (s) { s.delete(r); if (!s.size) seguemMoto.delete(r.motoIdx); } }
  r.motoIdx = novo;
  if (novo) { const s = seguemMoto.get(novo) || new Set(); s.add(r); seguemMoto.set(novo, s); }
}
function avisa(p, nome, moto) {
  for (const r of painel) evento(r, nome, p);
  for (const r of acompanham.get(p.token) || []) {
    r.ped = { id: p.id, ent: p.entregadorId, st: p.status };
    indexaMoto(r);
    evento(r, 'pedido', visaoPublica(p));
    if (moto && r.motoIdx) evento(r, 'moto', moto);
  }
  // app do entregador: atualiza a lista quando um pedido dele muda (ou deixa de ser dele)
  for (const [eid, conj] of motoboys) for (const r of conj) {
    r.ids = r.ids || new Set();
    if (p.entregadorId === eid || r.ids.has(p.id)) {
      evento(r, 'mudou', { id: p.id, status: p.status, meu: p.entregadorId === eid });
      if (p.entregadorId === eid) r.ids.add(p.id); else r.ids.delete(p.id);
    }
  }
}
function avisaPosicao(d) {
  const pos = { e: d.e, lat: d.lat, lng: d.lng, rumo: d.rumo, vel: d.vel, prec: d.prec, t: d.t, bat: d.bat };
  for (const r of painel) evento(r, 'posicao', pos);
  for (const r of seguemMoto.get(d.e) || []) evento(r, 'moto', { lat: d.lat, lng: d.lng, rumo: d.rumo, vel: d.vel, t: d.t });
}
function avisaEntregador(id) {
  for (const r of painel) evento(r, 'entregador', { id });
  for (const r of motoboys.get(id) || []) evento(r, 'jornada', { id });
}
// quem grava avisa o banco; todas as instâncias (esta inclusive) escutam e repassam aos navegadores conectados nelas
const publicaEvento = (obj) => pool.query('SELECT pg_notify($1, $2)', [CANAL_EVENTOS, JSON.stringify(obj)]).catch((e) => console.error('NOTIFY:', e.message));
const publica = (id, tipo) => publicaEvento({ id, tipo });
let ouvinte = null;
async function escutaEventos() {
  const c = new Client({ connectionString: DATABASE_URL });
  ouvinte = c;
  let reconectando = false;
  const reconecta = () => { if (reconectando || encerrando) return; reconectando = true; c.end().catch(() => {}); setTimeout(() => escutaEventos().catch(() => setTimeout(escutaEventos, 5000)), 2000); };
  c.on('error', (e) => { console.error('LISTEN:', e.message); reconecta(); });
  c.on('end', reconecta);
  c.on('notification', async (n) => {
    try {
      const d = JSON.parse(n.payload);
      if (d.k === 'pos') return avisaPosicao(d);
      if (d.k === 'ent') return avisaEntregador(d.id);
      const l = await um('SELECT * FROM pedidos WHERE id = $1', [d.id]);
      if (!l) return;
      const p = linhaParaPedido(l);
      const moto = p.status === 'saiu' && p.entregadorId && (acompanham.get(p.token) || []).size ? await frota.motoPublica(p.entregadorId) : null;
      avisa(p, d.tipo, moto);
    } catch (e) { console.error('evento:', e.message); }
  });
  await c.connect();
  await c.query('LISTEN ' + CANAL_EVENTOS);
}
setInterval(async () => {
  // a cada 25 s: mantém as conexões abertas e encerra as do painel cuja sessão expirou e as de aparelhos despareados
  const tokens = Array.from(painel, (r) => r.sessao);
  let validas = new Set(tokens);
  if (tokens.length) {
    try { validas = new Set((await todos('SELECT token FROM sessoes WHERE token = ANY($1) AND expira > now()', [tokens])).map((x) => x.token)); } catch (e) { /* banco fora: mantém */ }
  }
  for (const r of painel) { if (!validas.has(r.sessao)) r.end(); else r.write(': ping\n\n'); }
  for (const c of acompanham.values()) for (const r of c) r.write(': ping\n\n');
  const aparelhos = [];
  for (const c of motoboys.values()) for (const r of c) aparelhos.push(r.tokenHash);
  let pareados = new Set(aparelhos);
  if (aparelhos.length) {
    try { pareados = new Set((await todos('SELECT token_hash FROM entregadores WHERE token_hash = ANY($1) AND ativo', [aparelhos])).map((x) => x.token_hash)); } catch (e) { /* banco fora: mantém */ }
  }
  for (const c of motoboys.values()) for (const r of c) { if (!pareados.has(r.tokenHash)) r.end(); else r.write(': ping\n\n'); }
}, 25e3).unref();

// muda um pedido com a linha travada (equipe na gestão ou entregador no app) e avisa todo mundo
async function alteraPedido(id, corpo, quem, confere) {
  const quer = corpo.entregadorId;
  const ent = quer !== undefined && quer !== null && quer !== '' ? await um('SELECT id, nome FROM entregadores WHERE id = $1 AND ativo', [+quer]) : null;
  if (quer !== undefined && quer !== null && quer !== '' && !ent) throw erro(400, 'entregador não encontrado');
  const salvo = await transacao(async (c) => {
    const l = (await c.query('SELECT * FROM pedidos WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!l) throw erro(404, 'pedido não encontrado');
    const ped = linhaParaPedido(l);
    if (confere) confere(ped);
    aplicaMudancas(ped, corpo, quem, ent);
    return linhaParaPedido((await c.query('UPDATE pedidos SET status = $1, atualizado_em = $2, dados = $3::jsonb, entregador_id = $4 WHERE id = $5 RETURNING *', [ped.status, ped.atualizadoEm, dadosDoPedido(ped), ped.entregadorId || null, ped.id])).rows[0]);
  });
  publica(salvo.id, 'atualizado');
  return salvo;
}

/* ---------------- páginas (site e gestão), comprimidas uma vez por versão ---------------- */
const cachePaginas = new Map();
// aplica os ajustes da loja nos dados embutidos: pp-data (site e gestão) e pp-loja (entregador)
const jsonHtml = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
function comAjustesLoja(html) {
  const v = ajustesLoja.valores;
  if (!Object.keys(v).length) return html;
  return html
    .replace(/(<script type="application\/json" id="pp-data">)([\s\S]*?)(<\/script>)/, (t, a, j, b) => { const d = JSON.parse(j); d.config = Object.assign({}, d.config, v); return a + jsonHtml(d) + b; })
    .replace(/(<script type="application\/json" id="pp-loja">)([\s\S]*?)(<\/script>)/, (t, a, j, b) => { const d = JSON.parse(j); if (v.whatsapp) d.whatsapp = v.whatsapp; return a + jsonHtml(d) + b; });
}
function enviaPagina(req, res, arq) {
  const st = fs.statSync(arq);
  let c = cachePaginas.get(arq);
  if (!c || c.mtime !== st.mtimeMs || c.versao !== ajustesLoja.versao) {
    const buf = Buffer.from(comAjustesLoja(fs.readFileSync(arq, 'utf8')));
    c = { mtime: st.mtimeMs, versao: ajustesLoja.versao, buf, gz: zlib.gzipSync(buf, { level: 9 }) };
    cachePaginas.set(arq, c);
  }
  const gz = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  const h = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN', Vary: 'Accept-Encoding', 'Content-Length': gz ? c.gz.length : c.buf.length };
  if (gz) h['Content-Encoding'] = 'gzip';
  res.writeHead(200, h);
  res.end(req.method === 'HEAD' ? undefined : gz ? c.gz : c.buf);
}

/* ---------------- gestão: análises e clientes (agregados no próprio banco) ---------------- */
const cidadeDe = (c) => String(c || '').split('/')[0].trim();
// linha compacta: o painel calcula os gráficos no navegador, sem ida e volta a cada filtro
function linhaAnalise(l) {
  const d = l.dados;
  const t0 = Date.parse(l.criado_em);
  return {
    id: l.id, c: l.codigo, d: l.dia, t: l.criado_em, s: l.status, ca: l.canal, m: l.modo, tot: l.total,
    sub: d.subtotal || 0, des: d.desconto || 0, tx: d.taxa || 0, km: d.km == null ? null : d.km,
    ci: d.endereco ? cidadeDe(d.endereco.cidade) : '', ba: d.endereco ? d.endereco.bairro || '' : '',
    g: d.geo ? [d.geo.lat, d.geo.lng] : null, pg: (d.pagamento || {}).forma || '',
    cl: l.cliente_chave, nm: (d.cliente && d.cliente.nome) || '', nv: l.novo_cliente ? 1 : 0,
    it: (d.itens || []).map((i) => [i.tipo === 'pizza' ? 1 : 0, i.qtd, i.valor, i.tamanho || '', (i.sabores || []).join('+'), i.borda || '', i.tipo === 'pizza' ? '' : i.nome]),
    h: (d.historico || []).map((x) => [x.status, Math.round((Date.parse(x.em) - t0) / 6000) / 10]),
    en: d.entregador || '', mo: d.motivo || '', dm: l.demo ? 1 : 0
  };
}
// "cliente novo" = este é o primeiro pedido não cancelado dele (de todos os tempos)
const SQL_ANALISE = `
  SELECT p.*, (f.primeiro_id = p.id) AS novo_cliente
  FROM pedidos p
  LEFT JOIN (SELECT DISTINCT ON (cliente_chave) cliente_chave, id AS primeiro_id FROM pedidos WHERE status <> 'cancelado' ORDER BY cliente_chave, criado_em, id) f
    ON f.cliente_chave = p.cliente_chave
  WHERE p.dia BETWEEN $1 AND $2
  ORDER BY p.id`;
// ficha de cada cliente: tudo calculado em SQL (cresce com o banco, não com a memória do servidor)
const sqlClientes = (filtro) => `
  WITH base AS (
    SELECT cliente_chave, dia, criado_em, status, total, canal, modo, demo,
           dados->'cliente'->>'nome' AS nome, NULLIF(dados->'cliente'->>'fone', '') AS fone,
           NULLIF(dados->'endereco'->>'bairro', '') AS bairro, NULLIF(split_part(dados->'endereco'->>'cidade', '/', 1), '') AS cidade
    FROM pedidos ${filtro ? 'WHERE cliente_chave = $1' : ''}
  ), agg AS (
    SELECT cliente_chave AS chave,
      (array_agg(nome ORDER BY criado_em DESC))[1] AS nome,
      (array_agg(fone ORDER BY criado_em DESC) FILTER (WHERE fone IS NOT NULL))[1] AS fone,
      COUNT(*) FILTER (WHERE status <> 'cancelado') AS pedidos,
      COUNT(*) FILTER (WHERE status = 'cancelado') AS cancelados,
      COALESCE(SUM(total) FILTER (WHERE status <> 'cancelado'), 0) AS gasto,
      MIN(dia) FILTER (WHERE status <> 'cancelado') AS primeiro,
      MAX(dia) FILTER (WHERE status <> 'cancelado') AS ultimo,
      mode() WITHIN GROUP (ORDER BY bairro) FILTER (WHERE status <> 'cancelado') AS bairro,
      (array_agg(cidade ORDER BY criado_em DESC) FILTER (WHERE cidade IS NOT NULL))[1] AS cidade,
      mode() WITHIN GROUP (ORDER BY canal) FILTER (WHERE status <> 'cancelado') AS canal,
      COUNT(*) FILTER (WHERE status <> 'cancelado' AND modo = 'entrega') AS entregas,
      BOOL_AND(demo) AS demo
    FROM base GROUP BY cliente_chave
  ), sab AS (
    SELECT p.cliente_chave, s.sabor, SUM((it->>'qtd')::numeric / GREATEST(jsonb_array_length(it->'sabores'), 1)) AS q
    FROM pedidos p
    CROSS JOIN LATERAL jsonb_array_elements(p.dados->'itens') it
    CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(it->'sabores') = 'array' THEN it->'sabores' ELSE '[]'::jsonb END) s(sabor)
    WHERE p.status <> 'cancelado' AND it->>'tipo' = 'pizza' ${filtro ? 'AND p.cliente_chave = $1' : ''}
    GROUP BY p.cliente_chave, s.sabor
  ), top AS (
    SELECT cliente_chave, (array_agg(sabor ORDER BY q DESC, sabor))[1:3] AS sabores FROM sab GROUP BY cliente_chave
  )
  SELECT a.*, COALESCE(t.sabores, '{}') AS sabores, COALESCE(c.notas, '') AS notas, COALESCE(c.tags, '[]'::jsonb) AS tags,
    ct.id AS conta_id, ct.email AS conta_email, ct.origem AS conta_origem, (ct.google_sub IS NOT NULL) AS conta_google, ct.criado_em AS conta_desde,
    ct.ultimo_acesso AS conta_acesso, ct.ofertas AS conta_ofertas, (ct.historico_chave IS NOT NULL) AS conta_historico
  FROM agg a LEFT JOIN top t ON t.cliente_chave = a.chave LEFT JOIN clientes c ON c.chave = a.chave LEFT JOIN contas ct ON ct.fone_chave = a.chave`;
const fichaCliente = (l) => ({
  chave: l.chave, nome: l.nome || '', fone: l.fone || '', pedidos: l.pedidos, cancelados: l.cancelados, gasto: Math.round(l.gasto * 100) / 100, primeiro: l.primeiro, ultimo: l.ultimo, bairro: l.bairro || '', cidade: l.cidade || '', canal: l.canal || '', entregas: l.entregas, sabores: l.sabores || [], notas: l.notas, tags: l.tags, demo: !!l.demo,
  conta: l.conta_id ? { id: l.conta_id, email: l.conta_email, origem: l.conta_origem, google: !!l.conta_google, desde: l.conta_desde, acesso: l.conta_acesso, ofertas: !!l.conta_ofertas, historico: !!l.conta_historico } : null
});
const contaDemo = async () => (await um('SELECT COUNT(*) AS n FROM pedidos WHERE demo')).n;
const dataParam = (url, nome) => { const v = url.searchParams.get(nome) || ''; return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; };

/* ---------------- módulos: contas dos clientes e entregadores ---------------- */
// por onde sai o email: a gestão (Configurações → Email, no banco, senha cifrada) ou, sem ela, o ambiente (SMTP_URL)
const email = require('./email.js')({ pool, erro, json, lerCorpo, exigeAdmin, lerConfig, gravaConfig, limite, txt, segredo: process.env.CHAVE_SEGREDOS || DATABASE_URL });
function infoApk() {
  try { const st = fs.statSync(APK); return { tamanho: st.size, em: st.mtime.toISOString() }; } catch (e) { return null; }
}
const ctx = {
  pool, um, todos, transacao, erro, json, jsonZ, lerCorpo, cookies, ipDe, txt, chaveCliente, geoValido, linhaParaPedido, limite, seguro,
  exigeSessao, exigeAdmin, lerConfig, gravaConfig, dadosSite, diaOperacional, publicaEvento, alteraPedido, email,
  hub: { abreEventos, evento, motoboys, apk: infoApk }
};
const contasCli = require('./contas.js')(ctx);
const frota = require('./entregadores.js')(ctx);
const enderecos = require('./enderecos.js')(ctx);
const equipe = require('./equipe.js')(Object.assign({ dirDados: DIR_DADOS }, ctx));

// onde fica a pizzaria: pelo endereço publicado no site (config.endereco), achado na base do IBGE pelo número.
// Refeito quando o endereço muda; um ponto marcado à mão (fonte "manual") nunca é trocado.
let lojaGeoPronta = false;
async function garanteLojaGeo() {
  const endereco = String((dadosSite().config || {}).endereco || '').trim();
  const atual = await lerConfig('lojaGeo', null);
  if (atual && (atual.fonte === 'manual' || (atual.fonte === 'ibge' && atual.endereco === endereco))) { lojaGeoPronta = true; return; }
  const m = endereco.match(/^\s*([^,]+),\s*(\d+)/);
  if (!m) return;
  const partes = endereco.split(/\s+-\s+/);
  const cidade = partes.length >= 2 ? partes[partes.length - 2].split(',').pop().trim() : '';
  const r = await enderecos.procura({ rua: m[1], numero: m[2], cep: (dadosSite().config || {}).cepLoja || '', cidade });
  if (!r || !['exato', 'interpolado'].includes(r.precisao)) return; // sem a base do IBGE: fica o que houver
  await gravaConfig('lojaGeo', { lat: r.lat, lng: r.lng, fonte: 'ibge', precisao: r.precisao, endereco });
  lojaGeoPronta = true;
  console.log('Local da pizzaria pelo IBGE (' + r.precisao + '): ' + r.lat + ', ' + r.lng);
}

/* ---------------- rotas ---------------- */
async function rota(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  const m = req.method;

  if ((m === 'GET' || m === 'HEAD') && (p === '/' || p === '/index.html')) return enviaPagina(req, res, PAGINA);
  if ((m === 'GET' || m === 'HEAD') && (p === '/gestao' || p === '/gestao/')) {
    if (!fs.existsSync(PAGINA_GESTAO)) { res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('A gestão ainda não foi gerada: rode node build.js'); }
    return enviaPagina(req, res, PAGINA_GESTAO);
  }
  // app do entregador: a página (também aberta dentro do app Android) e o instalador do app
  if ((m === 'GET' || m === 'HEAD') && (p === '/motoboy' || p === '/motoboy/')) {
    if (!fs.existsSync(PAGINA_MOTOBOY)) { res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('A página do entregador ainda não foi gerada: rode node build.js'); }
    return enviaPagina(req, res, PAGINA_MOTOBOY);
  }
  if ((m === 'GET' || m === 'HEAD') && p === '/motoboy/app.apk') {
    const info = infoApk();
    if (!info) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('O app do entregador ainda não foi gerado (node android/gerar-apk.js).'); }
    res.writeHead(200, { 'Content-Type': 'application/vnd.android.package-archive', 'Content-Length': info.tamanho, 'Content-Disposition': 'attachment; filename="pizzaria-pereira-entregador.apk"', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    if (m === 'HEAD') return res.end();
    return fs.createReadStream(APK).pipe(res);
  }
  if (p === '/favicon.ico') { res.writeHead(204); return res.end(); }
  if (!p.startsWith('/api/')) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Não encontrado'); }
  if (p === '/api/conta' || p.startsWith('/api/conta/') || p === '/api/contas' || p.startsWith('/api/contas/')) return contasCli.rota(req, res, url);
  if (p.startsWith('/api/motoboy/') || p === '/api/entregadores' || p.startsWith('/api/entregadores/')) return frota.rota(req, res, url);
  if (p === '/api/ajustes/email' || p.startsWith('/api/ajustes/email/')) return email.rota(req, res, url);
  if (p === '/api/ajustes/google' || p.startsWith('/api/ajustes/google/')) return contasCli.rotaAjustes(req, res, url);
  if (p === '/api/geo/endereco') return enderecos.rota(req, res, url);
  if (p === '/api/equipe' || p.startsWith('/api/equipe/')) return equipe.rota(req, res, url);

  // saúde: responde 503 se o banco não estiver acessível (usado pelo Docker e por balanceadores)
  if (m === 'GET' && p === '/api/status') {
    try { await um('SELECT 1'); return json(res, 200, { ok: true, dia: diaOperacional() }); }
    catch (e) { return json(res, 503, { ok: false, erro: 'banco indisponível' }); }
  }

  // cliente: registra o pedido que está indo para o WhatsApp (e a equipe lança pedidos de balcão/telefone)
  if (m === 'POST' && p === '/api/pedidos') {
    const s = await sessaoDe(req);
    if (!s && !(await limite('pedido:' + ipDe(req), 30, 600))) throw erro(429, 'muitos pedidos seguidos; tente em alguns minutos');
    const corpo = await lerCorpo(req);
    const v = validaPedido(corpo, !!s);
    // onde fica a pizzaria: o servidor acha pela base do IBGE (garanteLojaGeo); o que o site manda só vale
    // enquanto não houver nenhum (antes de importar a base). Um cliente não muda o local da loja.
    let lojaGeo = await lerConfig('lojaGeo', null);
    const lg = geoValido(corpo.lojaGeo);
    if (lg && !lojaGeo) { lojaGeo = Object.assign(lg, { fonte: 'site' }); await gravaConfig('lojaGeo', lojaGeo); }
    // pedido do site: o servidor refaz a conta com o cardápio (a equipe lança com os preços que combinou)
    if (!s) {
      const c = precos().confere(v, Date.now(), lojaGeo);
      if (!c.ok) {
        v.conferencia = { motivos: c.motivos, valeOServidor: c.pagaMenos, em: new Date().toISOString(),
          site: { subtotal: v.subtotal, desconto: v.desconto, taxa: v.taxa, freteGratis: v.freteGratis, total: v.total },
          servidor: { subtotal: c.oficial.subtotal, desconto: c.oficial.desconto, taxa: c.oficial.taxa, freteGratis: c.oficial.freteGratis, total: c.oficial.total } };
        if (c.pagaMenos) Object.assign(v, c.oficial);
        console.log(new Date().toISOString(), 'pedido', v.codigo, 'conferido:', c.motivos.join(' · '), c.pagaMenos ? '→ vale ' + v.total.toFixed(2) : '');
      }
    }
    const host = hostDe(req);
    const origem = SITE_URL || (/^[A-Za-z0-9.:[\]-]{1,100}$/.test(host) ? (seguro(req) ? 'https' : 'http') + '://' + host : '');
    // cliente com conta: o pedido fica na conta (lançamento da equipe nunca vai para a conta de quem está no navegador)
    const conta = s ? null : await contasCli.contaDe(req);
    const { pedido, novo } = await criaPedido(v, s ? s.nome : 'cliente', !!s, origem, conta && conta.id);
    if (novo) {
      console.log(new Date().toISOString(), 'pedido', pedido.codigo, pedido.canal, pedido.modo, conta ? '(conta)' : '');
      publica(pedido.id, 'novo');
      if (conta) await contasCli.aposPedido(conta, pedido);
    }
    return json(res, novo ? 201 : 200, s ? pedido : { ok: true, codigo: pedido.codigo, conta: !!conta });
  }

  // acompanhamento público (pelo token longo do link; nunca devolve telefone nem endereço)
  let mt = p.match(/^\/api\/acompanhar\/([A-Za-z0-9]{16,40})(\/eventos)?$/);
  if (m === 'GET' && mt) {
    if (!(await limite('acomp:' + ipDe(req), 240, 600))) throw erro(429, 'devagar');
    const l = await um('SELECT * FROM pedidos WHERE token = $1', [mt[1]]);
    if (!l) throw erro(404, 'pedido não encontrado');
    const ped = linhaParaPedido(l);
    const moto = ped.status === 'saiu' && ped.entregadorId ? await frota.motoPublica(ped.entregadorId) : null;
    if (!mt[2]) return json(res, 200, Object.assign(visaoPublica(ped), { moto, loja: moto ? await lerConfig('lojaGeo', null) : null }));
    const conj = acompanham.get(ped.token) || new Set();
    if (conj.size >= 6 || conexoesPublicas >= 800) throw erro(429, 'conexões demais');
    abreEventos(req, res);
    conj.add(res); acompanham.set(ped.token, conj); conexoesPublicas++;
    res.ped = { id: ped.id, ent: ped.entregadorId, st: ped.status };
    indexaMoto(res);
    evento(res, 'pedido', visaoPublica(ped));
    if (moto) evento(res, 'moto', moto);
    req.on('close', () => { conj.delete(res); conexoesPublicas--; if (!conj.size) acompanham.delete(ped.token); res.ped = null; indexaMoto(res); });
    return;
  }

  // equipe
  if (m === 'POST' && p === '/api/login') {
    // 12 senhas erradas por conexão a cada 15 min, contadas no banco (vale para todas as instâncias). Só as erradas
    // contam: a equipe toda sai pelo mesmo IP da pizzaria e entra no começo do turno.
    const chaveLogin = 'login:' + ipDe(req);
    const lim = await um("SELECT n FROM limites WHERE chave = $1 AND inicio >= now() - interval '900 seconds'", [chaveLogin]);
    if (lim && lim.n >= 12) throw erro(429, 'Muitas tentativas. Espere alguns minutos.');
    const b = await lerCorpo(req, 4096);
    const u = await equipe.autentica(b.login, b.senha);
    if (!u) { await limite(chaveLogin, 12, 900); throw erro(401, 'Usuário ou senha incorretos.'); }
    const token = crypto.randomBytes(32).toString('base64url');
    await pool.query("INSERT INTO sessoes (token, usuario, nome, admin, expira) VALUES ($1, $2, $3, $4, now() + make_interval(hours => $5))", [token, String(u.id), u.nome || u.login, !!u.admin, SESSAO_HORAS]);
    return json(res, 200, { usuario: { id: String(u.id), nome: u.nome, admin: !!u.admin, trocarSenha: !!u.trocar_senha } }, { 'Set-Cookie': 'pp_sess=' + token + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + SESSAO_HORAS * 3600 + (seguro(req) ? '; Secure' : '') });
  }
  if (m === 'POST' && p === '/api/logout') {
    const t = cookies(req).pp_sess;
    if (t) await pool.query('DELETE FROM sessoes WHERE token = $1', [t]);
    return json(res, 200, { ok: true }, { 'Set-Cookie': 'pp_sess=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' + (seguro(req) ? '; Secure' : '') });
  }
  if (m === 'GET' && p === '/api/eu') {
    // sem sessão não é erro: o portal só mostra o login
    const s = await sessaoDe(req);
    return json(res, 200, { usuario: s ? { id: s.usuario, nome: s.nome, admin: !!s.admin, trocarSenha: await equipe.trocaPendente(s.usuario) } : null, dia: diaOperacional(), demo: s ? await contaDemo() : 0 });
  }
  if (m === 'GET' && p === '/api/analise') {
    await exigeSessao(req);
    const hoje = diaOperacional();
    const de = dataParam(url, 'de') || hoje, ate = dataParam(url, 'ate') || de;
    if (ate < de || (Date.parse(ate) - Date.parse(de)) / 864e5 > 400) throw erro(400, 'período inválido (máximo de 400 dias)');
    const [linhas, lojaGeo, metaDiaria] = await Promise.all([todos(SQL_ANALISE, [de, ate]), lerConfig('lojaGeo', null), lerConfig('metaDiaria', 0)]);
    return jsonZ(req, res, 200, { hoje, de, ate, lojaGeo, faixas: (dadosSite().entrega || {}).faixas || [], metaDiaria, pedidos: linhas.map(linhaAnalise) });
  }
  if (m === 'GET' && p === '/api/clientes') {
    await exigeSessao(req);
    return jsonZ(req, res, 200, { hoje: diaOperacional(), clientes: (await todos(sqlClientes(false))).map(fichaCliente) });
  }
  mt = p.match(/^\/api\/clientes\/([^/]{3,120})$/);
  if (mt && (m === 'GET' || m === 'PATCH')) {
    const chave = decodeURIComponent(mt[1]);
    if (m === 'GET') {
      await exigeSessao(req);
      const [cli, pedidos] = await Promise.all([um(sqlClientes(true), [chave]), todos('SELECT * FROM pedidos WHERE cliente_chave = $1 ORDER BY criado_em DESC LIMIT 300', [chave])]);
      if (!cli) throw erro(404, 'cliente não encontrado');
      return jsonZ(req, res, 200, { cliente: fichaCliente(cli), pedidos: pedidos.map(linhaParaPedido) });
    }
    await exigeSessao(req);
    const b = await lerCorpo(req, 8192);
    const atual = await um('SELECT notas, tags FROM clientes WHERE chave = $1', [chave]);
    const notas = b.notas !== undefined ? txt(b.notas, 2000, true) : atual ? atual.notas : '';
    const tags = Array.isArray(b.tags) ? Array.from(new Set(b.tags.map((t) => txt(t, 24)).filter(Boolean))).slice(0, 12) : atual ? atual.tags : [];
    await pool.query('INSERT INTO clientes (chave, notas, tags, atualizado_em) VALUES ($1, $2, $3::jsonb, now()) ON CONFLICT (chave) DO UPDATE SET notas = excluded.notas, tags = excluded.tags, atualizado_em = now()', [chave, notas, JSON.stringify(tags)]);
    return json(res, 200, { chave, notas, tags });
  }
  if (p === '/api/config' && (m === 'GET' || m === 'PATCH')) {
    if (m === 'PATCH') {
      await exigeAdmin(req);
      const b = await lerCorpo(req, 4096);
      if (b.metaDiaria !== undefined) await gravaConfig('metaDiaria', Math.max(0, Math.min(1e6, Math.round(+b.metaDiaria) || 0)));
    } else await exigeSessao(req);
    const [metaDiaria, lojaGeo, demo] = await Promise.all([lerConfig('metaDiaria', 0), lerConfig('lojaGeo', null), contaDemo()]);
    return json(res, 200, { metaDiaria, lojaGeo, demo });
  }
  // contato da pizzaria e modo teste/produção: por cima do publicado (data.json); valem no site na hora
  if (p === '/api/ajustes/loja' && (m === 'GET' || m === 'PATCH')) {
    if (m === 'PATCH') {
      await exigeAdmin(req);
      const b = await lerCorpo(req, 4096);
      const novo = Object.assign({}, await lerConfig('loja', {}));
      if (b.whatsapp !== undefined) {
        let n = String(b.whatsapp || '').replace(/\D/g, '');
        if (/^55\d{10,11}$/.test(n)) n = n.slice(2);
        if (!/^[1-9]{2}\d{8,9}$/.test(n)) throw erro(400, 'WhatsApp inválido: use o DDD e o número, como (17) 99230-1855');
        novo.whatsapp = n;
      }
      if (b.telefoneFixo !== undefined) novo.telefoneFixo = txt(b.telefoneFixo, 30);
      if (b.instagram !== undefined) {
        const ig = txt(b.instagram, 100).replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/\/.*$/, '');
        if (ig && !/^[A-Za-z0-9._]{1,30}$/.test(ig)) throw erro(400, 'Instagram inválido: só o nome do perfil, sem @');
        novo.instagram = ig;
      }
      if (b.modoTeste !== undefined) novo.modoTeste = b.modoTeste === true;
      for (const k of Object.keys(novo)) if (!CAMPOS_LOJA.includes(k)) delete novo[k];
      await gravaConfig('loja', novo);
      await carregaAjustesLoja();
    } else await exigeSessao(req);
    dadosSite(); // garante o publicado lido
    const pub = cacheSite.publicado.config || {};
    const publicado = {}, efetivo = {};
    for (const k of CAMPOS_LOJA) { publicado[k] = pub[k]; efetivo[k] = k in ajustesLoja.valores ? ajustesLoja.valores[k] : pub[k]; }
    return json(res, 200, { publicado, efetivo, ajustados: Object.keys(ajustesLoja.valores) });
  }
  // dados de demonstração: só administradores; nunca no dia de hoje; apagáveis de uma vez
  if (p === '/api/demo' && (m === 'POST' || m === 'DELETE')) {
    await exigeAdmin(req);
    if (m === 'DELETE') { const r = await pool.query('DELETE FROM pedidos WHERE demo'); return json(res, 200, { removidos: r.rowCount }); }
    if (await contaDemo()) throw erro(409, 'os dados de demonstração já estão carregados');
    let lojaGeo = await lerConfig('lojaGeo', null);
    if (!lojaGeo) { lojaGeo = { lat: -21.1229, lng: -47.8267 }; await gravaConfig('lojaGeo', lojaGeo); }
    const lista = gerarDemo(dadosSite(), { hoje: diaOperacional(), dias: 90, lojaGeo });
    await transacao(async (c) => {
      for (let i = 0; i < lista.length; i += 400) {
        const lote = lista.slice(i, i + 400), vals = [], ps = [];
        lote.forEach((x, k) => {
          const b = k * 11;
          ps.push('(' + Array.from({ length: 11 }, (_, j) => '$' + (b + j + 1) + (j === 10 ? '::jsonb' : '')).join(',') + ', true)');
          vals.push(x.token, x.codigo, x.dia, x.criadoEm, x.atualizadoEm, x.canal, x.status, x.modo, x.total, chaveCliente(x.cliente.nome, x.cliente.fone), dadosDoPedido(x));
        });
        await c.query('INSERT INTO pedidos (token, codigo, dia, criado_em, atualizado_em, canal, status, modo, total, cliente_chave, dados, demo) VALUES ' + ps.join(','), vals);
      }
    });
    return json(res, 201, { inseridos: lista.length });
  }
  if (m === 'GET' && p === '/api/pedidos') {
    await exigeSessao(req);
    const hoje = diaOperacional();
    const de = dataParam(url, 'de') || dataParam(url, 'dia') || hoje;
    const ate = dataParam(url, 'ate') || de;
    if (ate < de || (Date.parse(ate) - Date.parse(de)) / 864e5 > 92) throw erro(400, 'período máximo de 92 dias');
    return jsonZ(req, res, 200, { hoje, de, ate, pedidos: (await todos('SELECT * FROM pedidos WHERE dia BETWEEN $1 AND $2 ORDER BY id', [de, ate])).map(linhaParaPedido) });
  }
  if (m === 'GET' && p === '/api/eventos') {
    const s = await exigeSessao(req);
    abreEventos(req, res);
    res.sessao = s.token;
    painel.add(res);
    evento(res, 'ola', { dia: diaOperacional(), usuario: s.nome });
    req.on('close', () => painel.delete(res));
    return;
  }
  mt = p.match(/^\/api\/pedidos\/(\d+)$/);
  if (m === 'GET' && mt) {
    await exigeSessao(req);
    const l = await um('SELECT * FROM pedidos WHERE id = $1', [+mt[1]]);
    if (!l) throw erro(404, 'pedido não encontrado');
    return json(res, 200, linhaParaPedido(l));
  }
  if (m === 'PATCH' && mt) {
    const s = await exigeSessao(req);
    const corpo = await lerCorpo(req, 8192);
    // trava a linha: duas pessoas mexendo no mesmo pedido não apagam a mudança uma da outra
    return json(res, 200, await alteraPedido(+mt[1], corpo, s));
  }
  throw erro(404, 'rota não encontrada');
}

const servidor = http.createServer((req, res) => {
  rota(req, res).catch((e) => {
    const st = e.status || 500;
    if (st >= 500) console.error(e);
    if (!res.headersSent) json(res, st, { erro: st >= 500 ? 'erro interno' : e.message });
    else res.end();
  });
});
let encerrando = false;
(async () => {
  // o Postgres do docker-compose pode demorar alguns segundos para aceitar conexões
  for (let t = 1; ; t++) {
    try { await preparaBanco(); break; }
    catch (e) {
      if (t >= 30) { console.error('Não consegui preparar o banco:', e.message); process.exit(1); }
      console.error('Aguardando o PostgreSQL (' + e.message + ')…');
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  await carregaAjustesLoja().catch((e) => console.error('ajustes da loja:', e.message));
  setInterval(() => carregaAjustesLoja().catch(() => {}), 60e3).unref();
  await escutaEventos().catch((e) => { console.error('LISTEN:', e.message); setTimeout(() => escutaEventos().catch(() => {}), 5000); });
  frota.limpeza().catch(() => {});
  garanteLojaGeo().catch((e) => console.error('local da pizzaria:', e.message));
  // atrás do Caddy/balanceador: a conexão ociosa fecha aqui depois do proxy, nunca antes (evita erro 502 aleatório)
  servidor.keepAliveTimeout = 75e3; servidor.headersTimeout = 80e3;
  servidor.listen(PORTA, () => {
    console.log('Pizzaria Pereira: http://localhost:' + PORTA + '  (PostgreSQL: ' + DATABASE_URL.replace(/:[^:@/]+@/, ':****@') + ')' +
      (PROXIES ? ' · atrás de proxy (IP do cliente pelo X-Forwarded-For)' : ''));
    Promise.all([email.descreve(), contasCli.descreveGoogle()])
      .then(([d, g]) => console.log('Contas: código por email ' + d + ' (troque na gestão: Configurações → Email) · Google ' + g))
      .catch((e) => console.error('contas:', e.message));
  });
})();
function encerra() {
  encerrando = true;
  for (const r of painel) r.end();
  for (const c of acompanham.values()) for (const r of c) r.end();
  for (const c of motoboys.values()) for (const r of c) r.end();
  servidor.close(async () => { if (ouvinte) await ouvinte.end().catch(() => {}); await pool.end().catch(() => {}); process.exit(0); });
  setTimeout(() => process.exit(0), 4000).unref();
}
process.on('SIGTERM', encerra);
process.on('SIGINT', encerra);
