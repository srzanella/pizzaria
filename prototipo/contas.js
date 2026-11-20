'use strict';
/*
 * Contas dos clientes do site: entrar sem senha (código de 6 números por email, ou conta Google),
 * pedidos anteriores, endereços salvos e "pedir de novo".
 *
 * Quem é o dono da conta: o email (confirmado pelo código ou pelo Google). O celular serve para achar a conta
 * (o cliente digita o celular e o código vai para o email cadastrado) e para o atendimento.
 * Por isso a conta mostra só os pedidos feitos com ela, os pedidos feitos neste aparelho (o site guarda o link de
 * acompanhamento de cada pedido) e, se a equipe liberar na gestão, os pedidos antigos com o mesmo telefone.
 * Ligar tudo pelo telefone deixaria qualquer pessoa que soubesse o número de alguém ver o endereço e os pedidos dele.
 *
 * "Continuar com Google": liga na gestão (Configurações → Login com Google, no banco; vale na hora para todas as
 * instâncias). Sem nada salvo na gestão, vale o GOOGLE_CLIENT_ID do ambiente. CONTA_DIAS (180): quanto tempo fica conectado.
 */
const crypto = require('crypto');

module.exports = function contas(ctx) {
  const { pool, um, todos, transacao, erro, json, jsonZ, lerCorpo, cookies, ipDe, txt, chaveCliente, geoValido, linhaParaPedido, limite, seguro, exigeSessao, exigeAdmin, lerConfig, gravaConfig, email } = ctx;
  const GOOGLE_AMBIENTE = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  const ID_GOOGLE = /^\d{6,20}-[a-z0-9]{8,64}\.apps\.googleusercontent\.com$/;
  const GOOGLE_JWKS_URL = process.env.GOOGLE_JWKS_URL || 'https://www.googleapis.com/oauth2/v3/certs';
  // quem manda é a gestão (ligado ou desligado lá); sem nada salvo lá, o ambiente
  async function googleAtual() {
    const g = await lerConfig('google', null);
    if (g) return { clientId: g.ativo && g.clientId ? g.clientId : '', origem: 'gestao' };
    return { clientId: GOOGLE_AMBIENTE, origem: 'ambiente' };
  }
  const DIAS = Math.max(1, Math.min(400, +process.env.CONTA_DIAS || 180));
  const COOKIE = 'pp_conta';
  const MAX_ENDERECOS = 6;

  const hash = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
  const normEmail = (e) => String(e || '').trim().toLowerCase();
  const emailValido = (e) => e.length <= 254 && /^[^\s@"'<>()[\],;:]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,24}$/i.test(e);
  function foneOk(f) { let d = String(f || '').replace(/\D/g, ''); if (d.length >= 12 && d.startsWith('55')) d = d.slice(2); return d.length === 10 || d.length === 11 ? d : null; }
  const formataFone = (d) => (d.length === 11 ? '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7) : '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6));
  function mascara(e) { const [u, d] = String(e).split('@'); return (u.length <= 2 ? u[0] + '•••' : u.slice(0, 2) + '•'.repeat(Math.max(3, Math.min(6, u.length - 2)))) + '@' + d; }
  const visaoConta = (c) => ({ nome: c.nome, email: c.email || '', fone: c.fone || '', enderecos: c.enderecos || [], ofertas: !!c.ofertas, google: !!c.google_sub, origem: c.origem, desde: c.criado_em });

  /* ---------------- sessão (cookie pp_conta; no banco só o hash do token) ---------------- */
  async function contaDe(req) {
    const t = cookies(req)[COOKIE];
    if (!t || t.length > 100) return null;
    return um('SELECT c.*, s.expira AS sessao_expira, s.token_hash FROM sessoes_contas s JOIN contas c ON c.id = s.conta_id WHERE s.token_hash = $1 AND s.expira > now()', [hash(t)]);
  }
  async function exigeConta(req) { const c = await contaDe(req); if (!c) throw erro(401, 'Entre na sua conta de novo.'); return c; }
  const cookieConta = (req, token) => COOKIE + '=' + (token || '') + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + (token ? DIAS * 86400 : 0) + (seguro(req) ? '; Secure' : '');
  async function abreSessao(req, contaId) {
    const token = crypto.randomBytes(32).toString('base64url');
    await pool.query('INSERT INTO sessoes_contas (token_hash, conta_id, expira) VALUES ($1, $2, now() + make_interval(days => $3))', [hash(token), contaId, DIAS]);
    await pool.query('UPDATE contas SET ultimo_acesso = now() WHERE id = $1', [contaId]);
    return cookieConta(req, token);
  }

  /* ---------------- limites (no banco: valem para todas as instâncias) ---------------- */
  async function exigeLimite(chave, max, segundos, msg) { if (!(await limite(chave, max, segundos))) throw erro(429, msg); }

  /* ---------------- código por email ---------------- */
  async function enviaCodigo(req, para, dados) {
    const ult = await um('SELECT EXTRACT(EPOCH FROM (now() - criado_em))::int AS s FROM codigos WHERE email = $1 AND NOT usado ORDER BY criado_em DESC LIMIT 1', [para]);
    if (ult && ult.s < 30) throw erro(429, 'Espere ' + (30 - ult.s) + ' segundos para pedir outro código.');
    await exigeLimite('cod-ip:' + ipDe(req), 15, 3600, 'Muitos códigos pedidos a partir desta conexão. Tente de novo mais tarde.');
    await exigeLimite('cod-email:' + para, 6, 3600, 'Já mandamos vários códigos para este email. Espere um pouco e tente de novo.');
    const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const id = crypto.randomBytes(18).toString('base64url');
    await pool.query("INSERT INTO codigos (id, email, codigo_hash, dados, expira, ip) VALUES ($1, $2, $3, $4::jsonb, now() + interval '10 minutes', $5)", [id, para, hash(id + ':' + codigo), JSON.stringify(dados || {}), ipDe(req)]);
    await pool.query('UPDATE codigos SET usado = true WHERE email = $1 AND id <> $2 AND NOT usado', [para, id]); // só o último código vale
    try { await email.enviaCodigo(para, codigo, dados && dados.nome); }
    catch (e) {
      console.error('email:', e.message);
      await pool.query('DELETE FROM codigos WHERE id = $1', [id]).catch(() => {});
      throw erro(502, 'Não deu para enviar o email agora. Tente de novo em instantes.');
    }
    return { desafio: id, para: mascara(para) };
  }
  async function confereCodigo(req, b) {
    const id = String(b.desafio || ''), cod = String(b.codigo || '').replace(/\D/g, '');
    if (!/^[A-Za-z0-9_-]{20,40}$/.test(id)) throw erro(400, 'Peça um código novo.');
    if (cod.length !== 6) throw erro(400, 'Digite os 6 números do código.');
    await exigeLimite('verif-ip:' + ipDe(req), 40, 900, 'Muitas tentativas. Espere alguns minutos.');
    // a tentativa errada precisa ficar gravada: por isso devolve o erro em vez de lançar dentro da transação
    const r = await transacao(async (c) => {
      const l = (await c.query('SELECT * FROM codigos WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!l || l.usado) return { erro: [400, 'Esse código não vale mais. Peça um novo.'] };
      if (Date.parse(l.expira) < Date.now()) return { erro: [400, 'O código expirou. Peça um novo.'] };
      if (l.tentativas >= 5) return { erro: [429, 'Muitas tentativas erradas. Peça um novo código.'] };
      const a = Buffer.from(hash(id + ':' + cod)), bb = Buffer.from(l.codigo_hash);
      if (!(a.length === bb.length && crypto.timingSafeEqual(a, bb))) {
        await c.query('UPDATE codigos SET tentativas = tentativas + 1 WHERE id = $1', [id]);
        const resta = 4 - l.tentativas;
        return { erro: [400, resta > 0 ? 'Código incorreto. ' + (resta === 1 ? 'Resta 1 tentativa.' : 'Restam ' + resta + ' tentativas.') : 'Código incorreto. Peça um código novo.'] };
      }
      await c.query('UPDATE codigos SET usado = true WHERE id = $1', [id]);
      return { ok: l };
    });
    if (r.erro) throw erro(r.erro[0], r.erro[1]);
    return r.ok;
  }

  /* ---------------- Google (token de identidade do "Continuar com Google", verificado aqui) ---------------- */
  let jwks = { em: 0, ttl: 0, chaves: null };
  async function chavesGoogle(forcar) {
    if (!forcar && jwks.chaves && Date.now() - jwks.em < jwks.ttl) return jwks.chaves;
    const r = await fetch(GOOGLE_JWKS_URL, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw erro(502, 'Não deu para falar com o Google agora.');
    const j = await r.json();
    const ma = String(r.headers.get('cache-control') || '').match(/max-age=(\d+)/);
    jwks = { em: Date.now(), ttl: ma ? Math.min(+ma[1] * 1000, 86400e3) : 3600e3, chaves: Array.isArray(j.keys) ? j.keys : [] };
    return jwks.chaves;
  }
  async function verificaGoogle(credencial, aud) {
    const partes = String(credencial || '').split('.');
    if (partes.length !== 3 || credencial.length > 8000) throw erro(400, 'Credencial do Google inválida.');
    let cab, dados;
    try { cab = JSON.parse(Buffer.from(partes[0], 'base64url')); dados = JSON.parse(Buffer.from(partes[1], 'base64url')); } catch (e) { throw erro(400, 'Credencial do Google inválida.'); }
    if (cab.alg !== 'RS256' || !cab.kid) throw erro(401, 'Credencial do Google inválida.');
    let jwk = (await chavesGoogle()).find((k) => k.kid === cab.kid);
    if (!jwk) jwk = (await chavesGoogle(true)).find((k) => k.kid === cab.kid); // o Google troca as chaves de tempos em tempos
    if (!jwk) throw erro(401, 'Credencial do Google não reconhecida.');
    const assinaturaOk = crypto.verify('RSA-SHA256', Buffer.from(partes[0] + '.' + partes[1]), crypto.createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(partes[2], 'base64url'));
    const agora = Date.now() / 1000;
    if (!assinaturaOk) throw erro(401, 'Credencial do Google inválida.');
    if (dados.iss !== 'accounts.google.com' && dados.iss !== 'https://accounts.google.com') throw erro(401, 'Credencial do Google inválida.');
    if (!aud || dados.aud !== aud) throw erro(401, 'Credencial emitida para outro site.');
    if (!(+dados.exp > agora - 30)) throw erro(401, 'A credencial do Google expirou. Tente de novo.');
    if (+dados.iat > agora + 300) throw erro(401, 'Credencial do Google inválida.');
    if (!dados.sub || !dados.email || !(dados.email_verified === true || dados.email_verified === 'true')) throw erro(401, 'Esse email do Google não está confirmado.');
    return dados;
  }

  /* ---------------- contas ---------------- */
  async function criaConta(x) {
    const fd = foneOk(x.fone);
    const insere = (comFone) => um(
      'INSERT INTO contas (email, google_sub, nome, fone, fone_chave, ofertas, ofertas_em, origem) VALUES ($1, $2, $3, $4, $5, $6::boolean, CASE WHEN $6::boolean THEN now() END, $7) ' +
      'ON CONFLICT (email) DO UPDATE SET ultimo_acesso = now(), google_sub = COALESCE(contas.google_sub, excluded.google_sub), nome = CASE WHEN contas.nome = \'\' THEN excluded.nome ELSE contas.nome END RETURNING *',
      [x.email, x.google || null, txt(x.nome, 80), comFone && fd ? formataFone(fd) : '', comFone && fd ? chaveCliente('', fd) : null, !!x.ofertas, x.origem]);
    try { return await insere(true); }
    catch (e) { if (e.code === '23505' && /fone/.test(e.constraint || '')) return insere(false); throw e; } // celular já é de outra conta: cria sem
  }
  // põe o celular na conta se ninguém mais usa; devolve a conta (atualizada ou não)
  async function poeFone(conta, fone, soSeVazio) {
    const fd = foneOk(fone);
    if (!fd || (soSeVazio && conta.fone_chave)) return conta;
    const chave = chaveCliente('', fd);
    if (chave === conta.fone_chave) return conta;
    const dono = await um('SELECT id FROM contas WHERE fone_chave = $1 AND id <> $2', [chave, conta.id]);
    if (dono) return conta;
    try { return (await um('UPDATE contas SET fone = $2, fone_chave = $3, historico_chave = NULL WHERE id = $1 RETURNING *', [conta.id, formataFone(fd), chave])) || conta; }
    catch (e) { if (e.code === '23505') return conta; throw e; }
  }
  function enderecoDoPedido(p) {
    const e = p.endereco;
    if (!e || !e.rua) return null;
    const geo = geoValido(p.geo);
    return { cep: e.cep || '', rua: e.rua, numero: e.numero || '', compl: e.compl || '', bairro: e.bairro || '', cidade: e.cidade || '', ref: e.ref || '', geo, geoPrec: geo ? precisaoGeo(p.geoPrec) : null, km: p.km == null ? null : p.km, usado: p.criadoEm || new Date().toISOString() };
  }
  // quão certo é o ponto do mapa: confirmado pelo cliente > número exato (IBGE) > entre dois números > aproximado
  const RANK_GEO = { confirmado: 4, exato: 3, interpolado: 2, aproximado: 1 };
  const precisaoGeo = (v) => (RANK_GEO[v] ? v : null);
  const chaveEndereco = (e) => [e.rua, e.numero, e.compl, e.cidade].map((s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')).join('|');
  function juntaEnderecos(lista, novos) {
    const m = new Map((lista || []).map((e) => [chaveEndereco(e), e]));
    for (const n of novos) {
      if (!n) continue;
      const k = chaveEndereco(n), at = m.get(k);
      const junto = at ? Object.assign({}, at, n, { apelido: at.apelido || n.apelido || '', usado: [at.usado, n.usado].sort().pop() }) : n;
      // o ponto que o cliente confirmou no mapa (ou o exato) não é trocado por um aproximado do pedido novo
      if (at && at.geo && (RANK_GEO[at.geoPrec] || 0) > (RANK_GEO[n.geoPrec] || 0)) Object.assign(junto, { geo: at.geo, geoPrec: at.geoPrec, km: at.km });
      m.set(k, junto);
    }
    return Array.from(m.values()).sort((a, b) => (a.usado < b.usado ? 1 : -1)).slice(0, MAX_ENDERECOS);
  }
  // pedido feito com a conta: guarda o endereço e completa o celular, se faltava
  async function aposPedido(conta, pedido) {
    try {
      const novos = juntaEnderecos(conta.enderecos, [enderecoDoPedido(pedido)]);
      await pool.query('UPDATE contas SET enderecos = $2::jsonb, nome = CASE WHEN nome = \'\' THEN $3 ELSE nome END WHERE id = $1', [conta.id, JSON.stringify(novos), txt(pedido.cliente && pedido.cliente.nome, 80)]);
      await poeFone(conta, pedido.cliente && pedido.cliente.fone, true);
    } catch (e) { console.error('conta após pedido:', e.message); }
  }
  // pedidos feitos neste aparelho antes de entrar (o site guarda o token do link de acompanhamento de cada um)
  async function vincula(conta, tokens) {
    const lista = Array.from(new Set((Array.isArray(tokens) ? tokens : []).map(String).filter((t) => /^[A-Za-z0-9]{16,40}$/.test(t)))).slice(0, 60);
    if (!lista.length) return 0;
    const r = await pool.query('UPDATE pedidos SET conta_id = $1 WHERE token = ANY($2) AND conta_id IS NULL AND NOT demo RETURNING *', [conta.id, lista]);
    if (r.rowCount) {
      const atual = await um('SELECT enderecos FROM contas WHERE id = $1', [conta.id]);
      const novos = juntaEnderecos(atual ? atual.enderecos : [], r.rows.map(linhaParaPedido).sort((a, b) => (a.criadoEm < b.criadoEm ? -1 : 1)).map(enderecoDoPedido));
      await pool.query('UPDATE contas SET enderecos = $2::jsonb WHERE id = $1', [conta.id, JSON.stringify(novos)]);
    }
    return r.rowCount;
  }
  function itemHistorico(i) {
    return { qtd: i.qtd, tipo: i.tipo, nome: i.nome, detalhe: i.detalhe || '', obs: i.obs || '', valor: i.valor, sabores: i.sabores, tamanho: i.tamanho, borda: i.borda, massa: i.massa, itemId: i.itemId };
  }
  async function historico(conta) {
    const linhas = await todos('SELECT * FROM pedidos WHERE NOT demo AND (conta_id = $1 OR ($2::text IS NOT NULL AND cliente_chave = $2)) ORDER BY criado_em DESC LIMIT 40', [conta.id, conta.historico_chave || null]);
    return linhas.map(linhaParaPedido).map((p) => ({
      token: p.token, codigo: p.codigo, criadoEm: p.criadoEm, status: p.status, modo: p.modo, canal: p.canal,
      total: p.total, subtotal: p.subtotal, taxa: p.taxa, desconto: p.desconto,
      itens: (p.itens || []).map(itemHistorico), endereco: p.endereco || null, km: p.km == null ? null : p.km, geo: p.geo || null, geoPrec: p.geo ? precisaoGeo(p.geoPrec) : null,
      pagamento: { forma: (p.pagamento || {}).forma || '' }, obs: p.obs || ''
    }));
  }
  function limpaEnderecos(lista) {
    return (Array.isArray(lista) ? lista : []).slice(0, MAX_ENDERECOS).map((e) => ({
      apelido: txt(e.apelido, 30), cep: txt(e.cep, 12), rua: txt(e.rua, 150), numero: txt(e.numero, 20), compl: txt(e.compl, 100), bairro: txt(e.bairro, 100), cidade: txt(e.cidade, 80), ref: txt(e.ref, 150),
      geo: geoValido(e.geo), geoPrec: geoValido(e.geo) ? precisaoGeo(e.geoPrec) : null,
      km: Number.isFinite(+e.km) && e.km !== null ? Math.round(+e.km * 10) / 10 : null, usado: /^\d{4}-\d\d-\d\dT/.test(String(e.usado || '')) ? String(e.usado).slice(0, 30) : new Date().toISOString()
    })).filter((e) => e.rua);
  }
  async function limpeza() {
    await pool.query("DELETE FROM codigos WHERE expira < now() - interval '1 day'");
    await pool.query('DELETE FROM sessoes_contas WHERE expira < now()');
  }

  /* ---------------- rotas ---------------- */
  async function rota(req, res, url) {
    const p = url.pathname, m = req.method;

    if (m === 'GET' && p === '/api/conta/config') return json(res, 200, { google: (await googleAtual()).clientId || null });

    if (m === 'GET' && p === '/api/conta') {
      const c = await contaDe(req);
      if (!c) return json(res, 200, { conta: null });
      // sessão deslizante: renova uma vez por dia quem continua usando
      let extra;
      if (Date.parse(c.sessao_expira) - Date.now() < (DIAS - 1) * 864e5) {
        await pool.query('UPDATE sessoes_contas SET expira = now() + make_interval(days => $2) WHERE token_hash = $1', [c.token_hash, DIAS]);
        await pool.query('UPDATE contas SET ultimo_acesso = now() WHERE id = $1', [c.id]);
        extra = { 'Set-Cookie': cookieConta(req, cookies(req)[COOKIE]) };
      }
      return json(res, 200, { conta: visaoConta(c) }, extra);
    }

    // 1º passo: celular ou email. Se já tem conta, o código vai para o email dela; se não, o site pede nome e email.
    if (m === 'POST' && p === '/api/conta/entrar') {
      await exigeLimite('entrar-ip:' + ipDe(req), 40, 900, 'Muitas tentativas. Espere alguns minutos.');
      const b = await lerCorpo(req, 2048);
      const contato = String(b.contato || '').trim();
      if (contato.includes('@')) {
        const e = normEmail(contato);
        if (!emailValido(e)) throw erro(400, 'Esse email não parece certo. Confira e tente de novo.');
        const c = await um('SELECT nome, email FROM contas WHERE email = $1', [e]);
        if (!c) return json(res, 200, { novo: true, tipo: 'email', email: e });
        return json(res, 200, await enviaCodigo(req, e, { nome: c.nome }));
      }
      const fd = foneOk(contato);
      if (!fd) throw erro(400, 'Digite o celular com DDD ou o seu email.');
      const c = await um('SELECT nome, email FROM contas WHERE fone_chave = $1', [chaveCliente('', fd)]);
      if (!c) return json(res, 200, { novo: true, tipo: 'fone', fone: formataFone(fd) });
      return json(res, 200, await enviaCodigo(req, c.email, { nome: c.nome }));
    }

    // primeiro acesso: nome, email e celular; a conta só nasce quando o código do email for confirmado
    if (m === 'POST' && p === '/api/conta/cadastro') {
      const b = await lerCorpo(req, 4096);
      const nome = txt(b.nome, 80), e = normEmail(b.email), fd = foneOk(b.fone);
      if (nome.length < 2) throw erro(400, 'Como podemos te chamar?');
      if (!emailValido(e)) throw erro(400, 'Esse email não parece certo. Confira e tente de novo.');
      if (!fd) throw erro(400, 'Digite o celular com DDD.');
      const dono = await um('SELECT email FROM contas WHERE fone_chave = $1', [chaveCliente('', fd)]);
      if (dono && dono.email !== e) throw erro(409, 'Esse celular já tem cadastro com o email ' + mascara(dono.email) + '. Entre pelo celular, ou fale com a pizzaria se esse email não for seu.');
      return json(res, 200, await enviaCodigo(req, e, { nome, fone: formataFone(fd), ofertas: !!b.ofertas, cadastro: true }));
    }

    if (m === 'POST' && p === '/api/conta/verificar') {
      const b = await lerCorpo(req, 8192);
      const l = await confereCodigo(req, b);
      const d = l.dados || {};
      let c = await um('SELECT * FROM contas WHERE email = $1', [l.email]);
      if (!c) c = await criaConta({ email: l.email, nome: d.nome, fone: d.fone, ofertas: d.ofertas, origem: 'codigo' });
      else {
        if (d.fone) c = await poeFone(c, d.fone, true);
        if (d.cadastro && d.ofertas && !c.ofertas) c = (await um('UPDATE contas SET ofertas = true, ofertas_em = now() WHERE id = $1 RETURNING *', [c.id])) || c;
      }
      const cookie = await abreSessao(req, c.id);
      const ligados = await vincula(c, b.tokens);
      c = await um('SELECT * FROM contas WHERE id = $1', [c.id]);
      return json(res, 200, { conta: visaoConta(c), vinculados: ligados }, { 'Set-Cookie': cookie });
    }

    if (m === 'POST' && p === '/api/conta/google') {
      const cid = (await googleAtual()).clientId;
      if (!cid) throw erro(404, 'Entrar com Google não está configurado.');
      await exigeLimite('google-ip:' + ipDe(req), 30, 900, 'Muitas tentativas. Espere alguns minutos.');
      const b = await lerCorpo(req, 12 * 1024);
      const g = await verificaGoogle(b.credential, cid);
      const e = normEmail(g.email);
      let c = await um('SELECT * FROM contas WHERE google_sub = $1', [g.sub]);
      if (!c) c = await um("UPDATE contas SET google_sub = $1, nome = CASE WHEN nome = '' THEN $3 ELSE nome END WHERE email = $2 AND google_sub IS NULL RETURNING *", [g.sub, e, txt(g.name || g.given_name, 80)]);
      if (!c) c = await criaConta({ email: e, google: g.sub, nome: g.name || g.given_name || '', origem: 'google' });
      const cookie = await abreSessao(req, c.id);
      const ligados = await vincula(c, b.tokens);
      c = await um('SELECT * FROM contas WHERE id = $1', [c.id]);
      return json(res, 200, { conta: visaoConta(c), vinculados: ligados }, { 'Set-Cookie': cookie });
    }

    if (m === 'PATCH' && p === '/api/conta') {
      let c = await exigeConta(req);
      const b = await lerCorpo(req, 16 * 1024);
      if (b.nome !== undefined) { const n = txt(b.nome, 80); if (n.length < 2) throw erro(400, 'Como podemos te chamar?'); c = await um('UPDATE contas SET nome = $2 WHERE id = $1 RETURNING *', [c.id, n]); }
      if (b.fone !== undefined) {
        if (!String(b.fone).trim()) c = await um('UPDATE contas SET fone = \'\', fone_chave = NULL, historico_chave = NULL WHERE id = $1 RETURNING *', [c.id]);
        else {
          const fd = foneOk(b.fone);
          if (!fd) throw erro(400, 'Digite o celular com DDD.');
          const dono = await um('SELECT id FROM contas WHERE fone_chave = $1 AND id <> $2', [chaveCliente('', fd), c.id]);
          if (dono) throw erro(409, 'Esse celular já está em outra conta. Se ele é seu, fale com a pizzaria.');
          c = await poeFone(c, fd, false);
        }
      }
      if (b.ofertas !== undefined) c = await um('UPDATE contas SET ofertas = $2::boolean, ofertas_em = CASE WHEN $2::boolean THEN now() ELSE ofertas_em END WHERE id = $1 RETURNING *', [c.id, !!b.ofertas]);
      if (b.enderecos !== undefined) c = await um('UPDATE contas SET enderecos = $2::jsonb WHERE id = $1 RETURNING *', [c.id, JSON.stringify(limpaEnderecos(b.enderecos))]);
      return json(res, 200, { conta: visaoConta(c) });
    }

    if (m === 'POST' && p === '/api/conta/sair') {
      const t = cookies(req)[COOKIE];
      if (t) await pool.query('DELETE FROM sessoes_contas WHERE token_hash = $1', [hash(t)]);
      return json(res, 200, { ok: true }, { 'Set-Cookie': cookieConta(req, '') });
    }

    // LGPD: o cliente apaga a própria conta (os pedidos continuam no caixa da pizzaria, sem ligação com a conta)
    if (m === 'DELETE' && p === '/api/conta') {
      const c = await exigeConta(req);
      const b = await lerCorpo(req, 1024);
      if (b.confirmo !== true) throw erro(400, 'Confirme a exclusão.');
      await pool.query('DELETE FROM contas WHERE id = $1', [c.id]);
      return json(res, 200, { ok: true }, { 'Set-Cookie': cookieConta(req, '') });
    }

    if (m === 'GET' && p === '/api/conta/pedidos') {
      const c = await exigeConta(req);
      return jsonZ(req, res, 200, { pedidos: await historico(c) });
    }

    if (m === 'POST' && p === '/api/conta/vincular') {
      const c = await exigeConta(req);
      const b = await lerCorpo(req, 8192);
      return json(res, 200, { vinculados: await vincula(c, b.tokens) });
    }

    /* ---------- equipe: base de cadastros ---------- */
    if (m === 'GET' && p === '/api/contas') {
      await exigeSessao(req);
      const l = await todos(`SELECT c.id, c.nome, c.email, c.fone, c.fone_chave, c.origem, c.ofertas, c.criado_em, c.ultimo_acesso, (c.google_sub IS NOT NULL) AS google,
          (c.historico_chave IS NOT NULL) AS historico, jsonb_array_length(c.enderecos) AS enderecos,
          COUNT(p.id) FILTER (WHERE p.status <> 'cancelado') AS pedidos, COALESCE(SUM(p.total) FILTER (WHERE p.status <> 'cancelado'), 0) AS gasto, MAX(p.criado_em) AS ultimo_pedido
        FROM contas c LEFT JOIN pedidos p ON p.conta_id = c.id GROUP BY c.id ORDER BY c.criado_em DESC`);
      return jsonZ(req, res, 200, { contas: l.map((x) => ({ id: x.id, nome: x.nome, email: x.email, fone: x.fone, chave: x.fone_chave, origem: x.origem, google: x.google, ofertas: x.ofertas, criadoEm: x.criado_em, acesso: x.ultimo_acesso, historico: x.historico, enderecos: x.enderecos, pedidos: x.pedidos, gasto: x.gasto, ultimoPedido: x.ultimo_pedido })) });
    }
    const mt = p.match(/^\/api\/contas\/(\d+)$/);
    if (m === 'PATCH' && mt) {
      await exigeSessao(req);
      const b = await lerCorpo(req, 2048);
      let c = await um('SELECT * FROM contas WHERE id = $1', [+mt[1]]);
      if (!c) throw erro(404, 'conta não encontrada');
      // a equipe confirmou com o cliente que o celular é dele: libera os pedidos antigos com esse telefone
      if (b.historico !== undefined) {
        if (b.historico && !c.fone_chave) throw erro(400, 'A conta não tem celular.');
        c = await um('UPDATE contas SET historico_chave = $2 WHERE id = $1 RETURNING *', [c.id, b.historico ? c.fone_chave : null]);
      }
      // celular cadastrado por outra pessoa: a equipe tira o número da conta
      if (b.desvincularFone === true) c = await um("UPDATE contas SET fone = '', fone_chave = NULL, historico_chave = NULL WHERE id = $1 RETURNING *", [c.id]);
      return json(res, 200, { id: c.id, fone: c.fone, historico: !!c.historico_chave });
    }
    throw erro(404, 'rota não encontrada');
  }

  /* ---------------- gestão: Configurações → Login com Google (só administradores) ---------------- */
  // o ID do cliente é público (vai para o navegador de qualquer visitante); só o administrador troca
  async function visaoGoogle() {
    const [g, a] = await Promise.all([lerConfig('google', null), googleAtual()]);
    return {
      ligado: !!a.clientId, clientId: a.clientId, origem: a.origem, ambiente: !!GOOGLE_AMBIENTE,
      siteUrl: String(process.env.SITE_URL || '').trim(),
      config: g ? { ativo: !!g.ativo, clientId: g.clientId || '', atualizadoEm: g.atualizadoEm || null, atualizadoPor: g.atualizadoPor || '' } : null
    };
  }
  function idDoForm(v) {
    const id = String(v || '').trim().toLowerCase();
    if (!ID_GOOGLE.test(id)) throw erro(400, 'Esse não parece um ID do cliente do Google. Ele termina em .apps.googleusercontent.com (ex.: 1234567890-abc123.apps.googleusercontent.com).');
    return id;
  }
  async function rotaAjustes(req, res, url) {
    const p = url.pathname, m = req.method;
    const s = await exigeAdmin(req);
    if (p === '/api/ajustes/google' && m === 'GET') return json(res, 200, await visaoGoogle());
    if (p === '/api/ajustes/google' && m === 'PUT') {
      const b = await lerCorpo(req, 4096);
      const salvo = await lerConfig('google', null);
      if (b.ativo === false) await gravaConfig('google', { ativo: false, clientId: (salvo && salvo.clientId) || GOOGLE_AMBIENTE, atualizadoEm: new Date().toISOString(), atualizadoPor: s.nome });
      else await gravaConfig('google', { ativo: true, clientId: idDoForm(b.clientId), atualizadoEm: new Date().toISOString(), atualizadoPor: s.nome });
      return json(res, 200, await visaoGoogle());
    }
    // teste do botão na própria gestão: confere o token do Google com o ID digitado, sem entrar em conta nenhuma
    if (p === '/api/ajustes/google/teste' && m === 'POST') {
      await exigeLimite('google-teste:' + s.usuario, 30, 600, 'Muitas tentativas seguidas. Espere alguns minutos.');
      const b = await lerCorpo(req, 12 * 1024);
      const g = await verificaGoogle(b.credential, idDoForm(b.clientId));
      return json(res, 200, { ok: true, email: g.email, nome: txt(g.name || g.given_name, 80) });
    }
    throw erro(404, 'rota não encontrada');
  }
  async function descreveGoogle() {
    const a = await googleAtual();
    return a.clientId ? 'ligado (' + (a.origem === 'gestao' ? 'pela gestão' : 'pelo ambiente') + ')' : 'desligado (ligue na gestão: Configurações → Login com Google)';
  }

  return { rota, rotaAjustes, contaDe, aposPedido, limpeza, descreveGoogle };
};
