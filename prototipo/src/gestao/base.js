/* Gestão da Pizzaria Pereira — base: utilidades, API, estado, períodos e todos os cálculos das análises.
   (Este arquivo, graficos.js e paginas.js são juntados pelo build.js dentro de uma única função.) */
const D = JSON.parse(document.getElementById('pp-data').textContent);
const LOGOS = JSON.parse(document.getElementById('pp-logos').textContent);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v, d = 0) => (Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const brl = (v) => (Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const brl0 = (v) => 'R$ ' + num(Math.round(v || 0));
const brlCurto = (v) => (Math.abs(v) >= 1e6 ? 'R$ ' + num(v / 1e6, 1) + ' mi' : Math.abs(v) >= 1e4 ? 'R$ ' + num(v / 1e3, 1) + ' mil' : brl0(v));
const pct = (v, d = 0) => num((v || 0) * 100, d) + '%';
const minTxt = (m) => (m == null || !Number.isFinite(m) ? '—' : m < 60 ? Math.round(m) + ' min' : Math.floor(m / 60) + 'h' + String(Math.round(m % 60)).padStart(2, '0'));
const DIAS_SEM = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const DIAS_C = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const somaDias = (dia, n) => { const d = new Date(dia + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const difDias = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
const dowDe = (dia) => new Date(dia + 'T12:00:00Z').getUTCDay();
const dataBR = (dia) => { if (!dia) return ''; const [a, m, d] = dia.split('-'); return d + '/' + m + '/' + a; };
const dataCurta = (dia) => { if (!dia) return ''; const [, m, d] = dia.split('-'); return +d + ' ' + MESES[+m - 1]; };
// horário de Brasília sem horário de verão (desde 2019): UTC−3 fixo
const horaSP = (iso) => (new Date(iso).getUTCHours() + 21) % 24;
const hhmm = (iso) => { const d = new Date(Date.parse(iso) - 3 * 3600e3); return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); };
const minutosDesde = (iso) => Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60000));
const tempoRel = (m) => (m < 1 ? 'agora' : m < 60 ? 'há ' + m + ' min' : 'há ' + Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0'));
const diasRel = (n) => (n <= 0 ? 'hoje' : n === 1 ? 'ontem' : n < 30 ? 'há ' + n + ' dias' : n < 60 ? 'há 1 mês' : 'há ' + Math.floor(n / 30) + ' meses');
const primeiroNome = (n) => String(n || '').trim().split(/\s+/)[0] || 'Cliente';
const iniciais = (n) => String(n || '?').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const NOME_STATUS = { novo: 'Novo', preparo: 'Em preparo', forno: 'No forno', saiu: 'Saiu para entrega', pronto: 'Pronto p/ retirar', concluido: 'Concluído', cancelado: 'Cancelado' };
const NOME_PAG = { pix: 'Pix', credito: 'Crédito', debito: 'Débito', dinheiro: 'Dinheiro' };
const NOME_CANAL = { site: 'Site', whatsapp: 'WhatsApp', telefone: 'Telefone', balcao: 'Balcão' };
const ORDEM_CANAL = ['site', 'whatsapp', 'telefone', 'balcao'];
const ORDEM_PAG = ['pix', 'credito', 'debito', 'dinheiro'];
const SABOR = new Map((D.sabores || []).map((s) => [s.id, s]));
const nomeSabor = (id) => (SABOR.get(id) || { nome: id }).nome;
const BORDA = new Map((D.bordas || []).map((b) => [b.id, b]));

const pref = {
  get(k, d) { try { const v = localStorage.getItem('pp-gestao-' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('pp-gestao-' + k, JSON.stringify(v)); } catch (e) { /* sem storage */ } }
};
async function api(met, url, corpo) {
  const r = await fetch(url, { method: met, credentials: 'same-origin', cache: 'no-store', headers: corpo ? { 'Content-Type': 'application/json' } : {}, body: corpo ? JSON.stringify(corpo) : undefined });
  let j = null;
  try { j = await r.json(); } catch (e) { /* sem corpo */ }
  if (!r.ok) { const e = new Error((j && j.erro) || 'Falha de conexão (' + r.status + ')'); e.status = r.status; throw e; }
  return j;
}

/* ---------------- estado ---------------- */
const E = {
  usuario: null, hoje: null, demo: 0, metaDiaria: 0, lojaGeo: null,
  rota: 'aovivo', param: '',
  periodo: pref.get('periodo', '30d'), custom: pref.get('custom', null),
  analise: new Map(),          // "de|ate" → resposta da API
  clientes: null,              // lista agregada
  vivo: new Map(), vivoCarregado: false, aoVivo: false, fonte: null, recentes: new Set(), naoVistos: 0,
  som: pref.get('som', true), notif: pref.get('notif', false)
};

/* ---------------- períodos ---------------- */
const PERIODOS = [['hoje', 'Hoje'], ['ontem', 'Ontem'], ['7d', 'Últimos 7 dias'], ['30d', 'Últimos 30 dias'], ['90d', 'Últimos 90 dias'], ['mes', 'Este mês'], ['mesant', 'Mês passado'], ['custom', 'Personalizado']];
function intervalo(id) {
  const h = E.hoje;
  let de, ate, rot;
  if (id === 'hoje') { de = ate = h; rot = 'Hoje'; }
  else if (id === 'ontem') { de = ate = somaDias(h, -1); rot = 'Ontem'; }
  else if (id === '7d') { de = somaDias(h, -6); ate = h; rot = 'Últimos 7 dias'; }
  else if (id === '90d') { de = somaDias(h, -89); ate = h; rot = 'Últimos 90 dias'; }
  else if (id === 'mes') { de = h.slice(0, 8) + '01'; ate = h; rot = 'Este mês'; }
  else if (id === 'mesant') { const ini = somaDias(h.slice(0, 8) + '01', -1).slice(0, 8) + '01'; de = ini; ate = somaDias(h.slice(0, 8) + '01', -1); rot = 'Mês passado'; }
  else if (id === 'custom' && E.custom && E.custom.de && E.custom.ate) { de = E.custom.de; ate = E.custom.ate; rot = dataCurta(de) + ' a ' + dataCurta(ate); }
  else { de = somaDias(h, -29); ate = h; rot = 'Últimos 30 dias'; }
  if (ate > h) ate = h;
  if (de > ate) de = ate;
  const n = difDias(de, ate) + 1;
  const antAte = somaDias(de, -1), antDe = somaDias(de, -n);
  // comparação dia a dia: mesmo dia da semana, tantas semanas antes quantas cobrem o período
  const semanas = Math.max(1, Math.ceil(n / 7));
  const desde = [antDe, somaDias(de, -7 * semanas)].sort()[0];
  return { id, de, ate, n, rotulo: rot, ant: { de: antDe, ate: antAte }, semanas, desde };
}
async function carregaAnalise(per, forcar) {
  const chave = per.desde + '|' + per.ate;
  if (!forcar && E.analise.has(chave)) return E.analise.get(chave);
  const j = await api('GET', '/api/analise?de=' + per.desde + '&ate=' + per.ate);
  E.analise.set(chave, j);
  if (j.lojaGeo) E.lojaGeo = j.lojaGeo;
  E.metaDiaria = j.metaDiaria || 0;
  return j;
}
const invalidaAnalises = () => { for (const k of E.analise.keys()) if (k.endsWith('|' + E.hoje)) E.analise.delete(k); };

/* ---------------- cálculos ---------------- */
const tempoAte = (p, sts) => { const h = (p.h || []).find((x) => sts.includes(x[0])); return h ? h[1] : null; };
const media = (vs) => { const v = vs.filter((x) => x != null && Number.isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const mediana = (vs) => { const v = vs.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b); return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null; };
const faixaDe = (km, faixas) => { if (km == null) return null; const f = faixas.find((x) => km <= x.ateKm); return f ? f.ateKm : 'fora'; };
function soma(mapa, chave, campos) { let g = mapa.get(chave); if (!g) { g = {}; mapa.set(chave, g); } for (const k in campos) g[k] = (g[k] || 0) + campos[k]; return g; }

// vendas e pedidos por dia em todo o intervalo carregado (para comparar com semanas anteriores)
function porDiaGeral(rows) { const m = new Map(); for (const p of rows) if (p.s !== 'cancelado') soma(m, p.d, { qtd: 1, valor: p.tot }); return m; }
const rotuloSemanas = (s) => 'Mesmo dia da semana, ' + s + ' semana' + (s > 1 ? 's' : '') + ' antes';
/** Tudo que as páginas de análise mostram, numa passada só. */
function calcula(rows, faixas) {
  faixas = (faixas || []).slice().sort((a, b) => a.ateKm - b.ateKm);
  const R = {
    total: rows.length, pedidos: 0, vendas: 0, cancelados: 0, descontos: 0, taxas: 0, entregas: 0, retiradas: 0,
    clientes: new Set(), novos: 0, porDia: new Map(), porHora: Array.from({ length: 24 }, () => ({ qtd: 0, valor: 0 })),
    heat: Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ qtd: 0, valor: 0 }))),
    porCanal: new Map(), porPag: new Map(), porModo: new Map(), porCidade: new Map(), porBairro: new Map(), porFaixa: new Map(),
    sabores: new Map(), pares: new Map(), tamanhos: new Map(), bordas: new Map(), bebidas: new Map(), meias: 0, pizzas: 0, comBorda: 0, comBebida: 0,
    entregadores: new Map(), motivos: new Map(), tempos: { confirma: [], saida: [], entrega: [], rota: [], retirada: [] }, porHoraTempo: Array.from({ length: 24 }, () => []),
    porCliente: new Map()
  };
  const bebidaNomes = new Set((D.adicionais || []).filter((a) => a.tipo === 'bebida').map((a) => a.nome));
  for (const p of rows) {
    if (p.s === 'cancelado') { R.cancelados++; soma(R.motivos, p.mo || 'sem motivo', { qtd: 1, valor: p.tot }); continue; }
    R.pedidos++; R.vendas += p.tot; R.descontos += p.des || 0; R.taxas += p.tx || 0;
    R.clientes.add(p.cl); if (p.nv) R.novos++;
    soma(R.porCliente, p.cl, { qtd: 1, valor: p.tot });
    soma(R.porDia, p.d, { qtd: 1, valor: p.tot });
    const hr = horaSP(p.t);
    R.porHora[hr].qtd++; R.porHora[hr].valor += p.tot;
    const dw = dowDe(p.d);
    R.heat[dw][hr].qtd++; R.heat[dw][hr].valor += p.tot;
    soma(R.porCanal, p.ca, { qtd: 1, valor: p.tot });
    soma(R.porPag, p.pg || 'outro', { qtd: 1, valor: p.tot });
    soma(R.porModo, p.m, { qtd: 1, valor: p.tot });
    if (p.m === 'entrega') {
      R.entregas++;
      soma(R.porCidade, p.ci || 'Sem cidade', { qtd: 1, valor: p.tot });
      const kb = (p.ba || 'Sem bairro') + '|' + (p.ci || '');
      const g = soma(R.porBairro, kb, { qtd: 1, valor: p.tot, km: p.km || 0, kmN: p.km != null ? 1 : 0 });
      if (p.g) { g.lat = (g.lat || 0) + p.g[0]; g.lng = (g.lng || 0) + p.g[1]; g.geoN = (g.geoN || 0) + 1; }
      const te = tempoAte(p, ['concluido']);
      if (te != null) { g.tempo = (g.tempo || 0) + te; g.tempoN = (g.tempoN || 0) + 1; }
      const fx = faixaDe(p.km, faixas);
      if (fx != null) { const gf = soma(R.porFaixa, fx, { qtd: 1, valor: p.tot, taxa: p.tx || 0 }); if (te != null) { gf.tempo = (gf.tempo || 0) + te; gf.tempoN = (gf.tempoN || 0) + 1; } }
    } else R.retiradas++;
    // itens
    let temBebida = false;
    for (const it of p.it || []) {
      const [ehPizza, qtd, valor, tam, sabs, borda, nome] = it;
      if (ehPizza) {
        R.pizzas += qtd;
        soma(R.tamanhos, tam || 'grande', { qtd });
        const lista = sabs ? sabs.split('+') : [];
        if (lista.length > 1) { R.meias += qtd; const par = lista.map(nomeSabor).sort().join(' + '); soma(R.pares, par, { qtd }); }
        lista.forEach((s) => soma(R.sabores, nomeSabor(s), { qtd: qtd / lista.length, valor: valor / lista.length }));
        if (borda && borda !== 'sem') { R.comBorda += qtd; soma(R.bordas, (BORDA.get(borda) || { nome: borda }).nome, { qtd }); }
      } else {
        soma(R.bebidas, nome, { qtd, valor, bebida: bebidaNomes.has(nome) ? 1 : 0 });
        if (bebidaNomes.has(nome)) temBebida = true;
      }
    }
    if (temBebida) R.comBebida++;
    // tempos
    if (p.s === 'concluido') {
      const conf = tempoAte(p, ['preparo']);
      if (conf != null && p.ca === 'site') R.tempos.confirma.push(conf);
      const sai = tempoAte(p, ['saiu', 'pronto']);
      if (sai != null) R.tempos.saida.push(sai);
      const fim = tempoAte(p, ['concluido']);
      if (p.m === 'entrega' && fim != null) {
        R.tempos.entrega.push(fim);
        R.porHoraTempo[hr].push(fim);
        const saiu = tempoAte(p, ['saiu']);
        if (saiu != null) R.tempos.rota.push(fim - saiu);
        if (p.en) soma(R.entregadores, p.en, { qtd: 1, valor: p.tot, km: p.km || 0, rota: saiu != null ? fim - saiu : 0, rotaN: saiu != null ? 1 : 0, total: fim });
      } else if (fim != null) R.tempos.retirada.push(fim);
    }
  }
  R.ticket = R.pedidos ? R.vendas / R.pedidos : 0;
  R.nClientes = R.clientes.size;
  R.voltaram = Math.max(0, R.nClientes - R.novos);
  R.taxaCancel = R.total ? R.cancelados / R.total : 0;
  R.tempoEntrega = media(R.tempos.entrega);
  R.tempoMediana = mediana(R.tempos.entrega);
  R.noPrazo = R.tempos.entrega.length ? R.tempos.entrega.filter((t) => t <= 60).length / R.tempos.entrega.length : null;
  return R;
}
const diasDoPeriodo = (de, ate) => { const l = []; for (let d = de; d <= ate; d = somaDias(d, 1)) l.push(d); return l; };
function aberto(dia) { const h = (D.horarios || []).find((x) => x.dia === dowDe(dia)); return !h || h.aberto !== false; }

/* ---------------- clientes: segmentos ---------------- */
function segmentaClientes(lista, hoje) {
  const comPedido = lista.filter((c) => c.pedidos > 0);
  const gastos = comPedido.map((c) => c.gasto).sort((a, b) => a - b);
  const p90 = gastos.length ? gastos[Math.floor(gastos.length * 0.9)] : Infinity;
  for (const c of lista) {
    c.semPedir = c.ultimo ? difDias(c.ultimo, hoje) : null;
    c.desde = c.primeiro ? difDias(c.primeiro, hoje) : null;
    c.ticket = c.pedidos ? c.gasto / c.pedidos : 0;
    c.freq = c.pedidos > 1 && c.primeiro && c.ultimo ? difDias(c.primeiro, c.ultimo) / (c.pedidos - 1) : null;
    const f = c.flags = {
      vip: c.pedidos >= 3 && c.gasto >= p90,
      frequente: c.pedidos >= 4,
      novo: c.desde != null && c.desde <= 30,
      risco: c.pedidos >= 2 && c.semPedir != null && c.semPedir > 30 && c.semPedir <= 60,
      inativo: c.semPedir != null && c.semPedir > 60,
      semFone: !c.fone,
      conta: !!c.conta
    };
    c.segmento = !c.pedidos ? 'cancelou' : f.inativo ? 'inativo' : f.risco ? 'risco' : f.vip ? 'vip' : f.novo ? 'novo' : f.frequente ? 'frequente' : 'ocasional';
  }
  return lista;
}
const SEGMENTOS = {
  vip: ['VIP', 'Os 10% que mais gastam, com 3 pedidos ou mais'],
  frequente: ['Frequente', '4 pedidos ou mais'],
  novo: ['Novo', 'Primeiro pedido nos últimos 30 dias'],
  risco: ['Em risco', 'Pediu 2 vezes ou mais e sumiu há 31 a 60 dias'],
  inativo: ['Inativo', 'Sem pedir há mais de 60 dias'],
  ocasional: ['Ocasional', 'Pede de vez em quando'],
  cancelou: ['Só cancelou', 'Nenhum pedido concluído']
};
