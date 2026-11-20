'use strict';
/*
 * Entregadores: cadastro, pareamento do celular, jornada e posições em tempo real.
 *
 *  - A gestão cadastra o entregador e gera um código de pareamento (6 números, vale 15 minutos).
 *  - O app do entregador (Android, ou a página /motoboy no navegador) troca o código por um token próprio do aparelho.
 *  - Durante a jornada o app manda as posições (em lotes; guarda as que não saíram por falta de sinal).
 *    A posição só é registrada com a jornada aberta e fica guardada por 60 dias.
 *  - O cliente vê o entregador no mapa só enquanto o pedido dele está "saiu para entrega" com esse entregador.
 *  - Avisos ao vivo passam pelo LISTEN/NOTIFY (publicaEvento), então funcionam com várias instâncias.
 */
const crypto = require('crypto');

module.exports = function entregadores(ctx) {
  const { pool, um, todos, transacao, erro, json, jsonZ, lerCorpo, cookies, ipDe, txt, limite, seguro, exigeSessao, publicaEvento, hub, linhaParaPedido, alteraPedido, lerConfig, dadosSite, diaOperacional } = ctx;
  const COOKIE = 'pp_moto';
  const hash = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
  const rad = (g) => (g * Math.PI) / 180;
  function metros(a, b) {
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(h));
  }
  const numOuNulo = (v, max) => { const n = +v; return v === null || v === undefined || v === '' || !Number.isFinite(n) || n < 0 || n > max ? null : Math.round(n * 10) / 10; };
  const r6 = (v) => Math.round(v * 1e6) / 1e6;
  const ABERTOS = ['novo', 'preparo', 'forno', 'saiu'];

  /* ---------------- autenticação do aparelho ---------------- */
  async function entregadorDe(req) {
    const h = String(req.headers.authorization || '');
    const t = h.startsWith('Bearer ') ? h.slice(7).trim() : cookies(req)[COOKIE];
    if (!t || t.length > 100) return null;
    return um('SELECT * FROM entregadores WHERE token_hash = $1 AND ativo', [hash(t)]);
  }
  async function exigeEntregador(req) { const e = await entregadorDe(req); if (!e) throw erro(401, 'Este celular não está pareado. Peça um código novo na pizzaria.'); return e; }

  /* ---------------- visões ---------------- */
  function visaoEntregador(e) {
    return {
      id: e.id, nome: e.nome, fone: e.fone, ativo: e.ativo, pareado: !!e.token_hash, aparelho: e.aparelho, pareadoEm: e.pareado_em,
      pareando: !!(e.pareamento_expira && Date.parse(e.pareamento_expira) > Date.now()),
      emJornada: !!e.jornada_id, jornada: e.jornada_id ? { id: e.jornada_id, inicio: e.jornada_inicio || null, km: e.jornada_km == null ? null : Math.round(e.jornada_km * 10) / 10 } : null,
      posicao: e.lat != null ? { lat: e.lat, lng: e.lng, precisao: e.precisao, velocidade: e.velocidade, rumo: e.rumo, em: e.posicao_em } : null,
      bateria: e.bateria, nativo: !!e.nativo
    };
  }
  const resumoItens = (p) => (p.itens || []).map((i) => i.qtd + 'x ' + i.nome + (i.detalhe ? ' (' + i.detalhe + ')' : '')).join(' · ');
  function visaoEntrega(p) {
    const saiu = (p.historico || []).filter((h) => h.status === 'saiu').pop();
    return {
      id: p.id, codigo: p.codigo, status: p.status, criadoEm: p.criadoEm, saiuEm: saiu ? saiu.em : null, previsao: p.previsao || null,
      cliente: { nome: (p.cliente && p.cliente.nome) || '', fone: (p.cliente && p.cliente.fone) || '' },
      endereco: p.endereco, geo: p.geo || null, km: p.km == null ? null : p.km,
      total: p.total, pagamento: p.pagamento || {}, pago: !!p.pago, obs: p.obs || '', itens: resumoItens(p)
    };
  }
  // posição do entregador para o cliente: só com a jornada aberta e sinal recente
  async function motoPublica(entregadorId) {
    if (!entregadorId) return null;
    const e = await um('SELECT lat, lng, rumo, velocidade, posicao_em, jornada_id FROM entregadores WHERE id = $1', [entregadorId]);
    if (!e || !e.jornada_id || e.lat == null || !e.posicao_em || Date.now() - Date.parse(e.posicao_em) > 15 * 60e3) return null;
    return { lat: r6(e.lat), lng: r6(e.lng), rumo: e.rumo, vel: e.velocidade, t: Date.parse(e.posicao_em) };
  }
  async function entregasDe(id) {
    const l = await todos("SELECT * FROM pedidos WHERE entregador_id = $1 AND status = ANY($2) AND criado_em > now() - interval '18 hours' ORDER BY (status = 'saiu') DESC, criado_em", [id, ABERTOS]);
    return l.map(linhaParaPedido).map(visaoEntrega);
  }
  async function intervaloIdeal(id) {
    // com entrega na rua, posição a cada 4 s; sem, a cada 12 s (economiza bateria)
    const r = await um("SELECT EXISTS (SELECT 1 FROM pedidos WHERE entregador_id = $1 AND status = 'saiu') AS rota", [id]);
    return r && r.rota ? 4 : 12;
  }

  /* ---------------- jornada e posições ---------------- */
  async function mudaJornada(e, acao, nativo) {
    const mudou = await transacao(async (c) => {
      const at = (await c.query('SELECT jornada_id FROM entregadores WHERE id = $1 FOR UPDATE', [e.id])).rows[0];
      if (acao === 'iniciar') {
        if (at.jornada_id) { await c.query('UPDATE entregadores SET nativo = $2 WHERE id = $1', [e.id, !!nativo]); return false; }
        const j = (await c.query('INSERT INTO jornadas (entregador_id) VALUES ($1) RETURNING id', [e.id])).rows[0];
        await c.query('UPDATE entregadores SET jornada_id = $2, nativo = $3 WHERE id = $1', [e.id, j.id, !!nativo]);
        return true;
      }
      if (!at.jornada_id) return false;
      await c.query('UPDATE jornadas SET fim = now() WHERE id = $1 AND fim IS NULL', [at.jornada_id]);
      await c.query('UPDATE entregadores SET jornada_id = NULL WHERE id = $1', [e.id]);
      return true;
    });
    if (mudou) publicaEvento({ k: 'ent', id: e.id });
  }
  async function recebePosicoes(e, b) {
    const bat = numOuNulo(b.bateria, 100);
    if (!e.jornada_id) return { jornada: false };
    const agora = Date.now();
    const pts = (Array.isArray(b.pontos) ? b.pontos : []).slice(-400).map((x) => ({
      t: Number.isFinite(+x.t) ? Math.round(+x.t) : Date.parse(x.t), lat: +x.lat, lng: +x.lng,
      prec: numOuNulo(x.precisao, 100000), vel: numOuNulo(x.velocidade, 120), rumo: numOuNulo(x.rumo, 360)
    })).filter((x) => Number.isFinite(x.t) && x.t > agora - 12 * 3600e3 && x.t < agora + 120e3 && Number.isFinite(x.lat) && Number.isFinite(x.lng) && Math.abs(x.lat) <= 90 && Math.abs(x.lng) <= 180 && (x.lat || x.lng))
      .sort((a, c) => a.t - c.t);
    if (!pts.length) {
      if (bat != null) await pool.query('UPDATE entregadores SET bateria = $2 WHERE id = $1', [e.id, bat]);
      return { jornada: true, intervalo: await intervaloIdeal(e.id) };
    }
    // km rodados: só entre pontos com boa precisão; parado (menos de 8 m) não soma ruído de GPS
    let ant = e.lat != null && e.posicao_em && (e.precisao == null || e.precisao <= 60) ? { lat: e.lat, lng: e.lng, t: Date.parse(e.posicao_em) } : null;
    let km = 0;
    for (const q of pts) {
      if (q.prec != null && q.prec > 60) continue;
      if (ant) {
        if (q.t <= ant.t) continue;
        const d = metros(ant, q), dt = (q.t - ant.t) / 1000;
        if (d < 8) continue;
        if (d / Math.max(dt, 1) < 45) km += d / 1000; // salto impossível (> 160 km/h) não conta
      }
      ant = q;
    }
    const vals = [], ps = [];
    pts.forEach((q, k) => { const o = k * 7; ps.push('($' + (o + 1) + ', to_timestamp($' + (o + 2) + '::double precision / 1000), $' + (o + 3) + ', $' + (o + 4) + ', $' + (o + 5) + ', $' + (o + 6) + ', $' + (o + 7) + ')'); vals.push(e.jornada_id, q.t, q.lat, q.lng, q.prec, q.vel, q.rumo); });
    await pool.query('INSERT INTO posicoes (jornada_id, t, lat, lng, precisao, velocidade, rumo) VALUES ' + ps.join(','), vals);
    await pool.query('UPDATE jornadas SET km = km + $2, pontos = pontos + $3 WHERE id = $1', [e.jornada_id, km, pts.length]);
    // posição "atual": o ponto mais recente com precisão aceitável (até 150 m); um ponto ruim só vale se a última
    // posição boa tiver mais de 1 minuto (senão a moto pularia no mapa do cliente)
    const bons = pts.filter((q) => q.prec == null || q.prec <= 150);
    const velhaMs = e.posicao_em ? agora - Date.parse(e.posicao_em) : Infinity;
    const u = bons.length ? bons[bons.length - 1] : velhaMs > 60e3 ? pts[pts.length - 1] : null;
    if (u) {
      await pool.query('UPDATE entregadores SET lat = $2, lng = $3, precisao = $4, velocidade = $5, rumo = $6, posicao_em = to_timestamp($7::double precision / 1000), bateria = COALESCE($8, bateria), nativo = $9 WHERE id = $1 AND (posicao_em IS NULL OR posicao_em <= to_timestamp($7::double precision / 1000))',
        [e.id, u.lat, u.lng, u.prec, u.vel, u.rumo, u.t, bat, !!b.nativo]);
      publicaEvento({ k: 'pos', e: e.id, lat: r6(u.lat), lng: r6(u.lng), rumo: u.rumo, vel: u.vel, prec: u.prec, t: u.t, bat });
    } else if (bat != null) await pool.query('UPDATE entregadores SET bateria = $2 WHERE id = $1', [e.id, bat]);
    return { jornada: true, intervalo: await intervaloIdeal(e.id), recebidos: pts.length };
  }
  async function limpeza() {
    await pool.query("DELETE FROM posicoes WHERE t < now() - interval '60 days'");
    // jornada esquecida aberta (sem sinal há 4 horas): fecha na hora do último sinal
    const r = await todos("UPDATE jornadas j SET fim = GREATEST(j.inicio, COALESCE(e.posicao_em, j.inicio)) FROM entregadores e WHERE e.jornada_id = j.id AND j.fim IS NULL AND COALESCE(e.posicao_em, j.inicio) < now() - interval '4 hours' RETURNING e.id");
    if (r.length) {
      await pool.query('UPDATE entregadores SET jornada_id = NULL WHERE id = ANY($1)', [r.map((x) => x.id)]);
      r.forEach((x) => publicaEvento({ k: 'ent', id: x.id }));
    }
  }

  /* ---------------- rotas ---------------- */
  async function rota(req, res, url) {
    const p = url.pathname, m = req.method;
    let mt;

    /* ----- app do entregador ----- */
    if (m === 'POST' && p === '/api/motoboy/parear') {
      if (!(await limite('parear-ip:' + ipDe(req), 10, 900))) throw erro(429, 'Muitas tentativas. Espere alguns minutos.');
      const b = await lerCorpo(req, 2048);
      const cod = String(b.codigo || '').replace(/\D/g, '');
      if (cod.length !== 6) throw erro(400, 'Digite os 6 números do código.');
      const token = crypto.randomBytes(32).toString('base64url');
      const e = await um("UPDATE entregadores SET token_hash = $2, pareamento_hash = NULL, pareamento_expira = NULL, pareado_em = now(), aparelho = $3 WHERE pareamento_hash = $1 AND pareamento_expira > now() AND ativo RETURNING *",
        [hash('par:' + cod), hash(token), txt(b.aparelho, 80)]);
      if (!e) throw erro(400, 'Código errado ou vencido. Peça um novo na gestão.');
      publicaEvento({ k: 'ent', id: e.id });
      return json(res, 200, { token, entregador: { id: e.id, nome: e.nome } }, { 'Set-Cookie': COOKIE + '=' + token + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + 400 * 86400 + (seguro(req) ? '; Secure' : '') });
    }
    if (m === 'GET' && p === '/api/motoboy/eu') {
      // aparelho sem pareamento não é erro: a página mostra a tela do código
      const e = await entregadorDe(req);
      if (!e) return json(res, 200, { entregador: null });
      const j = e.jornada_id ? await um('SELECT id, inicio, km FROM jornadas WHERE id = $1', [e.jornada_id]) : null;
      const cfg = dadosSite().config || {};
      return json(res, 200, {
        entregador: { id: e.id, nome: e.nome }, jornada: j ? { id: j.id, inicio: j.inicio, km: Math.round(j.km * 10) / 10 } : null,
        entregas: await entregasDe(e.id), intervalo: await intervaloIdeal(e.id),
        loja: { nome: cfg.nome || 'Pizzaria', endereco: cfg.endereco || '', whatsapp: cfg.whatsapp || '', geo: await lerConfig('lojaGeo', null) }
      });
    }
    if (m === 'POST' && p === '/api/motoboy/jornada') {
      const e = await exigeEntregador(req);
      const b = await lerCorpo(req, 1024);
      if (b.acao !== 'iniciar' && b.acao !== 'encerrar') throw erro(400, 'ação inválida');
      await mudaJornada(e, b.acao, b.nativo);
      const at = await um('SELECT j.id, j.inicio, j.km FROM entregadores e JOIN jornadas j ON j.id = e.jornada_id WHERE e.id = $1', [e.id]);
      return json(res, 200, { jornada: at ? { id: at.id, inicio: at.inicio, km: Math.round(at.km * 10) / 10 } : null });
    }
    if (m === 'POST' && p === '/api/motoboy/posicao') {
      const e = await exigeEntregador(req);
      const b = await lerCorpo(req, 256 * 1024);
      return json(res, 200, await recebePosicoes(e, b));
    }
    mt = p.match(/^\/api\/motoboy\/entregas\/(\d+)$/);
    if (m === 'POST' && mt) {
      const e = await exigeEntregador(req);
      const b = await lerCorpo(req, 1024);
      const regras = { saiu: { de: ['preparo', 'forno'], para: 'saiu' }, entregue: { de: ['saiu'], para: 'concluido' } }[b.acao];
      if (!regras) throw erro(400, 'ação inválida');
      const salvo = await alteraPedido(+mt[1], { status: regras.para }, { nome: e.nome + ' (app)' }, (ped) => {
        if (ped.entregadorId !== e.id) throw erro(404, 'Essa entrega não está mais com você.');
        if (ped.modo !== 'entrega') throw erro(409, 'Pedido de retirada.');
        if (!regras.de.includes(ped.status)) throw erro(409, 'O pedido está "' + ped.status + '" agora. Atualize a tela.');
      });
      return json(res, 200, visaoEntrega(salvo));
    }
    if (m === 'GET' && p === '/api/motoboy/eventos') {
      const e = await exigeEntregador(req);
      hub.abreEventos(req, res);
      res.entregador = e.id; res.tokenHash = e.token_hash;
      const conj = hub.motoboys.get(e.id) || new Set();
      conj.add(res); hub.motoboys.set(e.id, conj);
      hub.evento(res, 'ola', { id: e.id });
      req.on('close', () => { conj.delete(res); if (!conj.size) hub.motoboys.delete(e.id); });
      return;
    }
    if (m === 'POST' && p === '/api/motoboy/sair') {
      const e = await entregadorDe(req);
      if (e) { await mudaJornada(e, 'encerrar'); await pool.query('UPDATE entregadores SET token_hash = NULL WHERE id = $1', [e.id]); publicaEvento({ k: 'ent', id: e.id }); }
      return json(res, 200, { ok: true }, { 'Set-Cookie': COOKIE + '=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' });
    }

    /* ----- gestão ----- */
    if (p === '/api/entregadores' && m === 'GET') {
      await exigeSessao(req);
      const l = await todos(`SELECT e.*, j.inicio AS jornada_inicio, j.km AS jornada_km,
          (SELECT COUNT(*) FROM pedidos p WHERE p.entregador_id = e.id AND p.status = 'concluido' AND p.dia = $1) AS entregas_hoje,
          (SELECT COALESCE(SUM(jj.km), 0) FROM jornadas jj WHERE jj.entregador_id = e.id AND jj.inicio > now() - interval '18 hours') AS km_hoje
        FROM entregadores e LEFT JOIN jornadas j ON j.id = e.jornada_id ORDER BY e.ativo DESC, (e.jornada_id IS NOT NULL) DESC, e.nome`, [diaOperacional()]);
      const ids = l.map((x) => x.id);
      const ents = ids.length ? (await todos("SELECT * FROM pedidos WHERE entregador_id = ANY($1) AND status = ANY($2) AND criado_em > now() - interval '18 hours' ORDER BY criado_em", [ids, ABERTOS])).map(linhaParaPedido) : [];
      return jsonZ(req, res, 200, {
        enderecoApp: String(process.env.ENDERECO_REDE || process.env.SITE_URL || '').replace(/\/+$/, '') || null,
        app: hub.apk(),
        entregadores: l.map((x) => Object.assign(visaoEntregador(x), {
          hoje: { entregas: x.entregas_hoje, km: Math.round(x.km_hoje * 10) / 10 },
          entregas: ents.filter((p) => p.entregadorId === x.id).map((p) => ({ id: p.id, codigo: p.codigo, status: p.status, nome: (p.cliente && p.cliente.nome) || '', bairro: (p.endereco && p.endereco.bairro) || '', geo: p.geo || null }))
        }))
      });
    }
    if (p === '/api/entregadores' && m === 'POST') {
      await exigeSessao(req);
      const b = await lerCorpo(req, 2048);
      const nome = txt(b.nome, 60);
      if (nome.length < 2) throw erro(400, 'Informe o nome do entregador.');
      const e = await um('INSERT INTO entregadores (nome, fone) VALUES ($1, $2) RETURNING *', [nome, txt(b.fone, 30)]);
      publicaEvento({ k: 'ent', id: e.id });
      return json(res, 201, visaoEntregador(e));
    }
    mt = p.match(/^\/api\/entregadores\/(\d+)(?:\/(parear|aparelho|encerrar|trajeto))?$/);
    if (mt) {
      await exigeSessao(req);
      const id = +mt[1], acao = mt[2] || '';
      let e = await um('SELECT * FROM entregadores WHERE id = $1', [id]);
      if (!e) throw erro(404, 'entregador não encontrado');
      if (!acao && m === 'PATCH') {
        const b = await lerCorpo(req, 2048);
        const nome = b.nome !== undefined ? txt(b.nome, 60) : e.nome;
        if (nome.length < 2) throw erro(400, 'Informe o nome do entregador.');
        const ativo = b.ativo !== undefined ? !!b.ativo : e.ativo;
        if (!ativo && e.jornada_id) await mudaJornada(e, 'encerrar');
        e = await um('UPDATE entregadores SET nome = $2, fone = $3, ativo = $4, token_hash = CASE WHEN $4 THEN token_hash END WHERE id = $1 RETURNING *', [id, nome, b.fone !== undefined ? txt(b.fone, 30) : e.fone, ativo]);
        publicaEvento({ k: 'ent', id });
        return json(res, 200, visaoEntregador(e));
      }
      if (acao === 'parear' && m === 'POST') {
        if (!e.ativo) throw erro(409, 'Reative o entregador antes de parear.');
        let cod, h;
        for (let i = 0; i < 20; i++) {
          cod = String(crypto.randomInt(0, 1000000)).padStart(6, '0'); h = hash('par:' + cod);
          if (!(await um('SELECT 1 FROM entregadores WHERE pareamento_hash = $1 AND pareamento_expira > now()', [h]))) break;
        }
        const r = await um("UPDATE entregadores SET pareamento_hash = $2, pareamento_expira = now() + interval '15 minutes' WHERE id = $1 RETURNING pareamento_expira", [id, h]);
        return json(res, 200, { codigo: cod, expira: r.pareamento_expira });
      }
      if (acao === 'aparelho' && m === 'DELETE') {
        await mudaJornada(e, 'encerrar');
        await pool.query('UPDATE entregadores SET token_hash = NULL, pareamento_hash = NULL, aparelho = \'\' WHERE id = $1', [id]);
        publicaEvento({ k: 'ent', id });
        return json(res, 200, { ok: true });
      }
      if (acao === 'encerrar' && m === 'POST') { await mudaJornada(e, 'encerrar'); return json(res, 200, { ok: true }); }
      if (acao === 'trajeto' && m === 'GET') {
        const jid = +url.searchParams.get('jornada') || e.jornada_id || ((await um('SELECT id FROM jornadas WHERE entregador_id = $1 ORDER BY inicio DESC LIMIT 1', [id])) || {}).id;
        if (!jid) return json(res, 200, { jornada: null, pontos: [] });
        const j = await um('SELECT id, inicio, fim, km FROM jornadas WHERE id = $1 AND entregador_id = $2', [jid, id]);
        if (!j) throw erro(404, 'jornada não encontrada');
        let pts = await todos('SELECT (EXTRACT(EPOCH FROM t) * 1000)::bigint AS t, lat, lng FROM posicoes WHERE jornada_id = $1 AND (precisao IS NULL OR precisao <= 80) ORDER BY t', [jid]);
        if (pts.length > 3000) { const k = Math.ceil(pts.length / 3000); pts = pts.filter((_, i) => i % k === 0 || i === pts.length - 1); }
        return jsonZ(req, res, 200, { jornada: { id: j.id, inicio: j.inicio, fim: j.fim, km: Math.round(j.km * 10) / 10 }, pontos: pts.map((x) => [r6(x.lat), r6(x.lng), x.t]) });
      }
    }
    throw erro(404, 'rota não encontrada');
  }

  return { rota, motoPublica, limpeza, entregadorDe, hashToken: hash };
};
