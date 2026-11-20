/* Gestão — páginas de análise (visão geral, vendas, regiões, produtos, operação) e fechamento do dia. As configurações ficam em configuracoes.js. */
const faixaNome = (f, faixas) => { if (f === 'fora') return 'Fora da área'; const ord = faixas.slice().sort((a, b) => a.ateKm - b.ateKm); const i = ord.findIndex((x) => x.ateKm === f); return i <= 0 ? 'Até ' + f + ' km' : ord[i - 1].ateKm + ' a ' + f + ' km'; };
const horasFaixa = (R) => { const hs = R.porHora.map((h, i) => (h.qtd ? i : null)).filter((x) => x != null); const ini = Math.min(18, ...hs), fim = Math.max(23, ...hs); const l = []; for (let h = ini; h <= fim; h++) l.push(h); return l; };
async function dadosPeriodo() {
  const per = intervalo(E.periodo);
  const j = await carregaAnalise(per);
  const atual = j.pedidos.filter((p) => p.d >= per.de && p.d <= per.ate);
  const ant = j.pedidos.filter((p) => p.d >= per.ant.de && p.d <= per.ant.ate);
  return { per, j, atual, R: calcula(atual, j.faixas), A: calcula(ant, j.faixas), G: porDiaGeral(j.pedidos) };
}
const vazioPeriodo = (per) => '<div class="vazio grande">Nenhum pedido em ' + esc(per.rotulo.toLowerCase()) + '. Escolha outro período no alto da página.</div>';
function colunasHora(R, o = {}) {
  const hs = horasFaixa(R);
  return grafColunas(hs.map((h) => ({ rot: (h % 24) + 'h', v: o.tempo ? media(R.porHoraTempo[h]) || 0 : R.porHora[h].qtd, dica: (h % 24) + 'h às ' + ((h + 1) % 24) + 'h' + (o.tempo ? ' · ' + R.porHoraTempo[h].length + ' entregas' : ' · ' + brl0(R.porHora[h].valor)) })), { fmt: o.tempo ? (v) => Math.round(v) + ' min' : (v) => num(v) + ' pedido' + (v === 1 ? '' : 's'), titulo: o.tempo ? 'Tempo médio de entrega por hora' : 'Pedidos por hora' });
}
function calorSemana(R, per) {
  const hs = horasFaixa(R);
  const ord = [1, 2, 3, 4, 5, 6, 0];
  return grafCalor(ord.map((d) => ({ rot: DIAS_C[d], fechado: !aberto(somaDias('2026-01-04', d)), celulas: hs.map((h) => ({ v: R.heat[d][h].qtd, dica: DIAS_SEM[d] + ', ' + h + 'h · ' + brl0(R.heat[d][h].valor) })) })), hs.map((h) => h + 'h'), { fmt: (v) => num(v) + ' pedido' + (v === 1 ? '' : 's'), titulo: 'Pedidos por dia da semana e hora' });
}
function bairrosAgregados(R) {
  const loja = E.lojaGeo || { lat: -21.1229, lng: -47.8267 };
  return Array.from(R.porBairro, ([k, g]) => {
    const [nome, cidade] = k.split('|');
    let ang = null;
    if (g.geoN) { const lat = g.lat / g.geoN, lng = g.lng / g.geoN; const dx = (lng - loja.lng) * 111.32 * Math.cos(loja.lat * Math.PI / 180), dy = (lat - loja.lat) * 111.32; ang = Math.atan2(-dy, dx); }
    return { chave: k, nome, cidade, qtd: g.qtd, valor: g.valor, km: g.kmN ? g.km / g.kmN : null, tempo: g.tempoN ? g.tempo / g.tempoN : null, ang };
  }).sort((a, b) => b.qtd - a.qtd);
}

/* ======================= Visão geral ======================= */
PAGINAS.visao = async () => {
  const { per, j, atual, R, A, G } = await dadosPeriodo();
  const c = $('#conteudo');
  const dias = diasDoPeriodo(per.de, per.ate);
  // só dias de funcionamento (os dias fechados faziam a linha despencar a zero); compara dia aberto com dia aberto
  const diasG = dias.filter((d) => aberto(d) || R.porDia.get(d)), diasA = diasDoPeriodo(per.ant.de, per.ant.ate).filter((d) => aberto(d) || A.porDia.get(d));
  const serieV = diasG.map((d) => (R.porDia.get(d) || {}).valor || 0), serieQ = diasG.map((d) => (R.porDia.get(d) || {}).qtd || 0);
  const hojeNoPeriodo = per.ate === E.hoje;
  const vivos = Array.from(E.vivo.values()).filter((p) => p.status !== 'cancelado');
  const vendasHoje = vivos.reduce((s, p) => s + p.total, 0);
  let h = '';
  if (hojeNoPeriodo || per.id === 'hoje') h += '<div class="hoje compacta"><div><span>Hoje até agora</span><b>' + brl(vendasHoje) + '</b>' + (E.metaDiaria ? medidor(vendasHoje, E.metaDiaria) + '<small>' + pct(vendasHoje / E.metaDiaria) + ' da meta de ' + brl0(E.metaDiaria) + '</small>' : '<small>' + (E.usuario.admin ? '<a class="link" href="#/ajustes">definir meta do dia</a>' : '') + '</small>') + '</div><div><span>Pedidos hoje</span><b>' + vivos.length + '</b><small>' + Array.from(E.vivo.values()).filter((p) => !['concluido', 'cancelado'].includes(p.status)).length + ' em andamento</small></div><div><a class="btn sm" href="#/aovivo">' + icone('aovivo') + 'Abrir o quadro ao vivo</a></div></div>';
  if (!R.total) { c.innerHTML = h + vazioPeriodo(per); return; }
  const delta = (a, b, mm) => variacao(a, b, mm);
  h += '<div class="tiles">' +
    tile({ rotulo: 'Vendas', valor: brlTile(R.vendas), sub: exato(R.vendas), delta: delta(R.vendas, A.vendas), spark: diasG.length > 2 ? serieV : null, heroi: true, ajuda: 'Soma dos pedidos não cancelados no período, com taxa de entrega.' }) +
    tile({ rotulo: 'Pedidos', valor: num(R.pedidos), delta: delta(R.pedidos, A.pedidos), spark: diasG.length > 2 ? serieQ : null }) +
    tile({ rotulo: 'Ticket médio', valor: brl(R.ticket), delta: delta(R.ticket, A.ticket) }) +
    tile({ rotulo: 'Clientes', valor: num(R.nClientes), delta: delta(R.nClientes, A.nClientes), sub: num(R.novos) + ' novos · ' + num(R.voltaram) + ' já conheciam' }) +
    tile({ rotulo: 'Tempo de entrega', valor: minTxt(R.tempoEntrega), delta: delta(R.tempoEntrega, A.tempoEntrega, false), sub: R.noPrazo != null ? pct(R.noPrazo) + ' em até 60 min' : '', ajuda: 'Média do pedido até a entrega, só entregas concluídas.' }) +
    tile({ rotulo: 'Cancelamentos', valor: pct(R.taxaCancel, 1), delta: delta(R.taxaCancel, A.taxaCancel, false), sub: num(R.cancelados) + ' pedidos' }) + '</div>';
  // destaques escritos a partir dos números
  const dl = [];
  const porDow = [0, 1, 2, 3, 4, 5, 6].map((d) => { const ds = dias.filter((x) => dowDe(x) === d && aberto(x)); const v = ds.reduce((s, x) => s + ((R.porDia.get(x) || {}).valor || 0), 0); return { d, media: ds.length ? v / ds.length : 0 }; }).filter((x) => x.media > 0).sort((a, b) => b.media - a.media);
  if (porDow.length > 1) dl.push('<b>' + DIAS_SEM[porDow[0].d][0].toUpperCase() + DIAS_SEM[porDow[0].d].slice(1) + '</b> é o dia mais forte: ' + brl0(porDow[0].media) + ' em média, contra ' + brl0(porDow[porDow.length - 1].media) + ' de ' + DIAS_SEM[porDow[porDow.length - 1].d] + '.');
  const pico = R.porHora.reduce((a, x, i) => (x.qtd > R.porHora[a].qtd ? i : a), 0);
  dl.push('O pico é das <b>' + pico + 'h às ' + ((pico + 1) % 24) + 'h</b>, com ' + pct(R.porHora[pico].qtd / R.pedidos) + ' dos pedidos.');
  const bs = bairrosAgregados(R);
  if (bs.length) dl.push('<b>' + esc(bs[0].nome) + '</b> é o bairro que mais pede (' + num(bs[0].qtd) + ' pedidos, ' + pct(bs[0].qtd / Math.max(1, R.entregas)) + ' das entregas).');
  if (A.vendas) { const v = (R.vendas - A.vendas) / A.vendas; dl.push('As vendas ' + (v >= 0 ? 'subiram' : 'caíram') + ' <b>' + pct(Math.abs(v)) + '</b> em relação aos ' + per.n + ' dias anteriores.'); }
  const sab = Array.from(R.sabores).sort((a, b) => b[1].qtd - a[1].qtd);
  if (sab.length) dl.push('<b>' + esc(sab[0][0]) + '</b> lidera os sabores, com ' + num(sab[0][1].qtd, sab[0][1].qtd % 1 ? 1 : 0) + ' pizzas.');
  h += '<section class="card destaques"><h3>Destaques do período</h3><ul>' + dl.map((x) => '<li>' + x + '</li>').join('') + '</ul></section>';
  // vendas no tempo
  const antesDe = (d) => somaDias(d, -7 * per.semanas);
  const pontos = diasG.map((d) => { const da = antesDe(d); return { rot: dataCurta(d), dica: DIAS_SEM[dowDe(d)] + ', ' + dataCurta(d), dica2: dataCurta(da), y: (R.porDia.get(d) || {}).valor || 0, y2: (G.get(da) || {}).valor || 0 }; });
  const tabDias = tabela([{ t: 'Dia' }, { t: 'Pedidos', n: 1 }, { t: 'Vendas', n: 1 }, { t: per.semanas + ' sem. antes', n: 1 }], diasG.map((d) => ({ cel: [DIAS_C[dowDe(d)] + ' ' + dataCurta(d), num((R.porDia.get(d) || {}).qtd || 0), brl((R.porDia.get(d) || {}).valor || 0), brl((G.get(antesDe(d)) || {}).valor || 0) + ' <small>' + esc(dataCurta(antesDe(d))) + '</small>'] })), { compacta: true });
  h += '<div class="grade-2 larga-esq">' + (diasG.length > 2 ? cartao('Vendas por dia', grafLinha(pontos, { comparar: true, titulo: 'Vendas por dia', nomeAnterior: rotuloSemanas(per.semanas) }), { tabela: tabDias, sub: esc(per.rotulo) + ', só dias de funcionamento' }) : cartao('Pedidos por hora', colunasHora(R), { sub: esc(per.rotulo) })) +
    cartao('Como pedem e pagam', '<h4 class="mini-tit">Canal</h4>' + partes(ORDEM_CANAL.map((k, i) => ({ nome: NOME_CANAL[k], v: (R.porCanal.get(k) || {}).valor || 0, cor: CATEG[i], extra: num((R.porCanal.get(k) || {}).qtd || 0) + ' ped.' })), { fmt: brl0 }) +
      '<h4 class="mini-tit">Pagamento</h4>' + partes(ORDEM_PAG.map((k, i) => ({ nome: NOME_PAG[k], v: (R.porPag.get(k) || {}).valor || 0, cor: CATEG[i], extra: num((R.porPag.get(k) || {}).qtd || 0) + ' ped.' })), { fmt: brl0 }) +
      '<h4 class="mini-tit">Entrega ou retirada</h4>' + partes([{ nome: 'Entrega', v: (R.porModo.get('entrega') || {}).valor || 0, cor: CATEG[0], extra: num(R.entregas) + ' ped.' }, { nome: 'Retirada', v: (R.porModo.get('retirada') || {}).valor || 0, cor: CATEG[1], extra: num(R.retiradas) + ' ped.' }], { fmt: brl0 }), { sub: 'parte das vendas' }) + '</div>';
  h += '<div class="grade-2">' + cartao('Pedidos por hora', colunasHora(R), { sub: 'soma do período', tabela: tabela([{ t: 'Hora' }, { t: 'Pedidos', n: 1 }, { t: 'Vendas', n: 1 }], horasFaixa(R).map((x) => ({ cel: [x + 'h', num(R.porHora[x].qtd), brl(R.porHora[x].valor)] })), { compacta: true }) }) +
    cartao('Dia da semana × hora', calorSemana(R, per), { sub: 'onde estão os picos da semana' }) + '</div>';
  h += '<div class="grade-2">' + cartao('Bairros que mais pedem', ranking(bs.slice(0, 8).map((b) => ({ nome: b.nome, sub: b.cidade !== 'Ribeirão Preto' ? b.cidade : '', v: b.qtd, rotulo: num(b.qtd) + ' <small>' + brl0(b.valor) + '</small>', dica: dica(num(b.qtd) + ' pedidos', b.nome + ' · ' + brl0(b.valor) + (b.km != null ? ' · ' + num(b.km, 1) + ' km' : '')) }))), { extra: '<a class="link" href="#/regioes">ver regiões</a>' }) +
    cartao('Sabores mais pedidos', ranking(sab.slice(0, 8).map(([n, g]) => ({ nome: n, v: g.qtd, rotulo: num(g.qtd, g.qtd % 1 ? 1 : 0) + ' <small>pizzas</small>' }))), { extra: '<a class="link" href="#/produtos">ver produtos</a>', sub: 'meio a meio conta meia pizza para cada sabor' }) + '</div>';
  c.innerHTML = h;
};

/* ======================= Vendas ======================= */
let metricaVendas = 'valor';
PAGINAS.vendas = async () => {
  const { per, j, R, A } = await dadosPeriodo();
  const c = $('#conteudo');
  if (!R.total) { c.innerHTML = vazioPeriodo(per); return; }
  const dias = diasDoPeriodo(per.de, per.ate);
  const GD = new Map(); for (const p of j.pedidos) if (p.s !== 'cancelado') soma(GD, p.d, { qtd: 1, valor: p.tot });
  const val = (g, m) => (!g ? 0 : m === 'valor' ? g.valor : m === 'qtd' ? g.qtd : g.qtd ? g.valor / g.qtd : 0);
  const fmtM = { valor: brl0, qtd: (v) => num(v) + ' pedidos', ticket: brl };
  const diasG = dias.filter((d) => aberto(d) || R.porDia.get(d));
  const antesDe = (d) => somaDias(d, -7 * per.semanas);
  const desenhaLinha = () => grafLinha(diasG.map((d) => ({ rot: dataCurta(d), dica: DIAS_SEM[dowDe(d)] + ', ' + dataCurta(d), dica2: dataCurta(antesDe(d)), y: val(R.porDia.get(d), metricaVendas), y2: val(GD.get(antesDe(d)), metricaVendas) })), { comparar: true, nomeAnterior: rotuloSemanas(per.semanas), fmt: fmtM[metricaVendas], curto: metricaVendas === 'qtd' ? (v) => num(v) : brlCurto, titulo: 'Evolução diária' });
  const porDow = [1, 2, 3, 4, 5, 6, 0].map((d) => { const ds = dias.filter((x) => dowDe(x) === d); const abertos = ds.filter(aberto); const v = ds.reduce((s, x) => s + ((R.porDia.get(x) || {}).valor || 0), 0), q = ds.reduce((s, x) => s + ((R.porDia.get(x) || {}).qtd || 0), 0); return { d, n: abertos.length, v, q, media: abertos.length ? v / abertos.length : 0 }; });
  const tabCanal = (mapa, ordem, nomes) => tabela([{ t: '' }, { t: 'Pedidos', n: 1 }, { t: 'Vendas', n: 1 }, { t: 'Ticket', n: 1 }, { t: '% das vendas', n: 1 }], ordem.filter((k) => mapa.get(k)).map((k) => { const g = mapa.get(k); return { cel: [esc(nomes[k] || k), num(g.qtd), brl(g.valor), brl(g.valor / g.qtd), pct(g.valor / R.vendas, 1)] }; }), { compacta: true });
  c.innerHTML = '<div class="tiles">' + tile({ rotulo: 'Vendas', valor: brlTile(R.vendas), sub: exato(R.vendas), delta: variacao(R.vendas, A.vendas), heroi: true }) + tile({ rotulo: 'Média por dia aberto', valor: brl(R.vendas / Math.max(1, dias.filter(aberto).length)), delta: variacao(R.vendas / Math.max(1, dias.filter(aberto).length), A.vendas / Math.max(1, diasDoPeriodo(per.ant.de, per.ant.ate).filter(aberto).length)) }) +
    tile({ rotulo: 'Descontos dados', valor: brl(R.descontos), sub: pct(R.descontos / Math.max(1, R.vendas), 1) + ' das vendas' }) + tile({ rotulo: 'Taxas de entrega', valor: brl(R.taxas), sub: 'já somadas nas vendas' }) + tile({ rotulo: 'Ticket médio', valor: brl(R.ticket), delta: variacao(R.ticket, A.ticket) }) + '</div>' +
    '<section class="card"><header class="card-topo"><div><h3>Evolução diária</h3><p>' + esc(per.rotulo) + ', só dias de funcionamento, comparado ao período anterior</p></div><div class="seg-ctrl" role="group" aria-label="Métrica">' + [['valor', 'Vendas'], ['qtd', 'Pedidos'], ['ticket', 'Ticket médio']].map(([id, n]) => '<button type="button" data-met="' + id + '" aria-pressed="' + (metricaVendas === id) + '">' + n + '</button>').join('') + '</div></header><div id="linhaVendas">' + desenhaLinha() + '</div></section>' +
    '<div class="grade-2">' + cartao('Média de vendas por dia da semana', grafColunas(porDow.map((x) => ({ rot: DIAS_C[x.d], v: x.media, dica: x.n ? DIAS_SEM[x.d] + ' · ' + x.n + ' dia' + (x.n > 1 ? 's' : '') + ' aberto' + (x.n > 1 ? 's' : '') + ' · ' + num(x.q) + ' pedidos' : DIAS_SEM[x.d] + ' · fechado' })), { fmt: brl0, curto: brlCurto, titulo: 'Média por dia da semana' }), { sub: 'só conta os dias em que a pizzaria abriu', tabela: tabela([{ t: 'Dia' }, { t: 'Dias abertos', n: 1 }, { t: 'Pedidos', n: 1 }, { t: 'Vendas', n: 1 }, { t: 'Média por dia', n: 1 }], porDow.map((x) => ({ cel: [DIAS_SEM[x.d], x.n, num(x.q), brl(x.v), brl(x.media)] })), { compacta: true }) }) +
    cartao('Pedidos por hora', colunasHora(R), { sub: 'soma do período' }) + '</div>' +
    '<div class="grade-2">' + cartao('Por canal', tabCanal(R.porCanal, ORDEM_CANAL, NOME_CANAL)) + cartao('Por forma de pagamento', tabCanal(R.porPag, ORDEM_PAG, NOME_PAG)) + '</div>' +
    cartao('Dia a dia', tabela([{ t: 'Dia' }, { t: 'Pedidos', n: 1 }, { t: 'Vendas', n: 1 }, { t: 'Ticket', n: 1 }], dias.slice().reverse().filter((d) => R.porDia.get(d)).map((d) => { const g = R.porDia.get(d); return { cel: [DIAS_C[dowDe(d)] + ' ' + dataBR(d), num(g.qtd), brl(g.valor), brl(g.valor / g.qtd)] }; }), { compacta: true }), { classe: 'rolavel' });
  c.querySelector('.seg-ctrl').addEventListener('click', (e) => { const b = e.target.closest('[data-met]'); if (!b) return; metricaVendas = b.dataset.met; $$('[data-met]', c).forEach((x) => x.setAttribute('aria-pressed', x === b)); $('#linhaVendas').innerHTML = desenhaLinha(); });
};

/* ======================= Regiões ======================= */
PAGINAS.regioes = async () => {
  const { per, j, R, A } = await dadosPeriodo();
  const c = $('#conteudo');
  if (!R.entregas) { c.innerHTML = vazioPeriodo(per); return; }
  const bs = bairrosAgregados(R);
  const cidades = Array.from(R.porCidade).sort((a, b) => b[1].qtd - a[1].qtd);
  const faixas = (j.faixas || []).slice().sort((a, b) => a.ateKm - b.ateKm);
  const kmMed = media(atualKm(R));
  const semGeo = bs.filter((b) => b.ang == null).reduce((s, b) => s + b.qtd, 0);
  c.innerHTML = '<div class="tiles">' + tile({ rotulo: 'Entregas', valor: num(R.entregas), delta: variacao(R.entregas, A.entregas), sub: pct(R.entregas / Math.max(1, R.pedidos)) + ' dos pedidos', heroi: true }) +
    tile({ rotulo: 'Cidades', valor: num(cidades.length), sub: cidades.slice(0, 2).map((x) => x[0]).join(', ') }) + tile({ rotulo: 'Bairros atendidos', valor: num(bs.length) }) +
    tile({ rotulo: 'Distância média', valor: kmMed != null ? num(kmMed, 1) + ' km' : '—', sub: 'pela rota de carro' }) + tile({ rotulo: 'Taxa média', valor: brl(R.taxas / Math.max(1, R.entregas)), sub: brl(R.taxas) + ' no período' }) +
    tile({ rotulo: 'Tempo de entrega', valor: minTxt(R.tempoEntrega), delta: variacao(R.tempoEntrega, A.tempoEntrega, false) }) + '</div>' +
    '<div class="grade-2 mapa-grade">' + cartao('Mapa de pedidos', mapaBairros(bs, faixas.length ? faixas : [{ ateKm: 20 }]) + '<p class="nota">Cada círculo é um bairro: o tamanho é o número de pedidos, a direção vem do endereço e a distância é a da rota até a pizzaria (anéis das faixas de entrega).' + (semGeo ? ' ' + num(semGeo) + ' pedidos sem localização ficaram de fora do mapa.' : '') + '</p>', { sub: 'a pizzaria no centro' }) +
    cartao('Bairros', ranking(bs.slice(0, 14).map((b) => ({ nome: b.nome, sub: [b.cidade !== 'Ribeirão Preto' ? b.cidade : '', b.km != null ? num(b.km, 1) + ' km' : '', b.tempo != null ? minTxt(b.tempo) : ''].filter(Boolean).join(' · '), v: b.qtd, rotulo: num(b.qtd) + ' <small>' + brl0(b.valor) + '</small>', acao: 'rota', valorAcao: 'pedidos/' + b.nome })), { compacto: true }), { sub: 'pedidos e vendas no período · toque para ver os pedidos' }) + '</div>' +
    '<div class="grade-2">' + cartao('Por cidade', ranking(cidades.map(([n, g]) => ({ nome: n, v: g.qtd, rotulo: num(g.qtd) + ' <small>' + brl0(g.valor) + ' · ticket ' + brl0(g.valor / g.qtd) + '</small>' })))) +
    cartao('Por faixa de entrega', tabela([{ t: 'Faixa' }, { t: 'Pedidos', n: 1 }, { t: 'Vendas', n: 1 }, { t: 'Taxas', n: 1 }, { t: 'Tempo', n: 1 }], faixas.map((f) => f.ateKm).concat(R.porFaixa.has('fora') ? ['fora'] : []).map((f) => { const g = R.porFaixa.get(f) || { qtd: 0, valor: 0, taxa: 0 }; return { cel: [faixaNome(f, faixas), num(g.qtd) + ' <small>' + pct(g.qtd / R.entregas) + '</small>', brl0(g.valor), brl0(g.taxa), g.tempoN ? minTxt(g.tempo / g.tempoN) : '—'] }; }), { compacta: true }), { sub: 'conforme as faixas cadastradas no portal' }) + '</div>' +
    cartao('Todos os bairros', tabela([{ t: 'Bairro' }, { t: 'Cidade' }, { t: 'Pedidos', n: 1 }, { t: 'Vendas', n: 1 }, { t: 'Ticket', n: 1 }, { t: 'Km médio', n: 1 }, { t: 'Tempo médio', n: 1 }], bs.map((b) => ({ cel: [esc(b.nome), esc(b.cidade), num(b.qtd), brl(b.valor), brl(b.valor / b.qtd), b.km != null ? num(b.km, 1) : '—', b.tempo != null ? minTxt(b.tempo) : '—'] })), { compacta: true }), { classe: 'rolavel', extra: '<button type="button" class="link" id="csvBairros">planilha (CSV)</button>' });
  $('#csvBairros').addEventListener('click', () => baixaCSV('bairros-' + per.de + '-a-' + per.ate + '.csv', ['bairro', 'cidade', 'pedidos', 'vendas', 'ticket', 'km_medio', 'tempo_medio_min'], bs.map((b) => [b.nome, b.cidade, b.qtd, dec(b.valor), dec(b.valor / b.qtd), b.km != null ? dec(b.km) : '', b.tempo != null ? Math.round(b.tempo) : ''])));
};
function atualKm(R) { const l = []; R.porBairro.forEach((g) => { if (g.kmN) for (let i = 0; i < g.kmN; i++) l.push(g.km / g.kmN); }); return l; }

/* ======================= Produtos ======================= */
PAGINAS.produtos = async () => {
  const { per, R, A } = await dadosPeriodo();
  const c = $('#conteudo');
  if (!R.pedidos) { c.innerHTML = vazioPeriodo(per); return; }
  const sab = Array.from(R.sabores).sort((a, b) => b[1].qtd - a[1].qtd);
  const pares = Array.from(R.pares).sort((a, b) => b[1].qtd - a[1].qtd);
  const itens = Array.from(R.bebidas).sort((a, b) => b[1].qtd - a[1].qtd);
  const bordas = Array.from(R.bordas).sort((a, b) => b[1].qtd - a[1].qtd);
  const broto = (R.tamanhos.get('broto') || {}).qtd || 0, grande = (R.tamanhos.get('grande') || {}).qtd || 0;
  c.innerHTML = '<div class="tiles">' + tile({ rotulo: 'Pizzas vendidas', valor: num(R.pizzas), delta: variacao(R.pizzas, A.pizzas), heroi: true }) + tile({ rotulo: 'Pizzas por pedido', valor: num(R.pizzas / R.pedidos, 2), delta: variacao(R.pizzas / R.pedidos, A.pedidos ? A.pizzas / A.pedidos : null) }) +
    tile({ rotulo: 'Meio a meio', valor: pct(R.meias / Math.max(1, R.pizzas)), sub: 'das pizzas' }) + tile({ rotulo: 'Com borda recheada', valor: pct(R.comBorda / Math.max(1, R.pizzas)), sub: 'das pizzas' }) +
    tile({ rotulo: 'Pedidos com bebida', valor: pct(R.comBebida / R.pedidos), delta: variacao(R.comBebida / R.pedidos, A.pedidos ? A.comBebida / A.pedidos : null) }) + tile({ rotulo: 'Broto', valor: pct(broto / Math.max(1, broto + grande)), sub: num(broto) + ' brotos · ' + num(grande) + ' grandes' }) + '</div>' +
    '<div class="grade-2">' + cartao('Sabores mais pedidos', ranking(sab.slice(0, 15).map(([n, g]) => ({ nome: n, v: g.qtd, rotulo: num(g.qtd, g.qtd % 1 ? 1 : 0) + ' <small>' + brl0(g.valor) + '</small>', dica: dica(num(g.qtd, 1) + ' pizzas', n + ' · ' + brl0(g.valor) + ' em vendas (proporcional)') })), { compacto: true }), { sub: 'meio a meio conta meia pizza para cada sabor', tabela: tabela([{ t: 'Sabor' }, { t: 'Pizzas', n: 1 }, { t: 'Vendas (proporcional)', n: 1 }], sab.map(([n, g]) => ({ cel: [esc(n), num(g.qtd, 1), brl(g.valor)] })), { compacta: true }) }) +
    '<div class="pilha">' + cartao('Combinações meio a meio', ranking(pares.slice(0, 8).map(([n, g]) => ({ nome: n, v: g.qtd, rotulo: num(g.qtd) }))), { sub: 'as metades que mais saem juntas' }) +
    cartao('Tamanho e borda', '<h4 class="mini-tit">Tamanho</h4>' + partes([{ nome: 'Grande', v: grande, cor: CATEG[0] }, { nome: 'Broto', v: broto, cor: CATEG[1] }], { fmt: (v) => num(v) + ' pizzas' }) + '<h4 class="mini-tit">Bordas recheadas</h4>' + ranking(bordas.map(([n, g]) => ({ nome: n, v: g.qtd, rotulo: num(g.qtd) })), { compacto: true })) + '</div></div>' +
    cartao('Bebidas e acompanhamentos', ranking(itens.map(([n, g]) => ({ nome: n, sub: g.bebida ? 'bebida' : 'acompanhamento', v: g.qtd, rotulo: num(g.qtd) + ' <small>' + brl0(g.valor) + '</small>' })), { compacto: true }));
};

/* ======================= Operação ======================= */
PAGINAS.operacao = async () => {
  const { per, R, A } = await dadosPeriodo();
  const c = $('#conteudo');
  if (!R.total) { c.innerHTML = vazioPeriodo(per); return; }
  const faixasT = [[0, 30], [30, 40], [40, 50], [50, 60], [60, 75], [75, 90], [90, Infinity]];
  const hist = faixasT.map(([a, b]) => ({ rot: b === Infinity ? '90+' : a + '–' + b, v: R.tempos.entrega.filter((t) => t >= a && t < b).length, dica: b === Infinity ? 'mais de 90 min' : 'de ' + a + ' a ' + b + ' min', cor: a >= 60 ? COR.v2 : null }));
  const ents = Array.from(R.entregadores).sort((a, b) => b[1].qtd - a[1].qtd);
  const motivos = Array.from(R.motivos).sort((a, b) => b[1].qtd - a[1].qtd);
  c.innerHTML = '<div class="tiles">' + tile({ rotulo: 'Tempo de entrega', valor: minTxt(R.tempoEntrega), delta: variacao(R.tempoEntrega, A.tempoEntrega, false), sub: 'mediana ' + minTxt(R.tempoMediana), heroi: true, ajuda: 'Do pedido feito até a entrega, só entregas concluídas.' }) +
    tile({ rotulo: 'Entregues em até 60 min', valor: R.noPrazo != null ? pct(R.noPrazo) : '—', delta: variacao(R.noPrazo, A.noPrazo) }) +
    tile({ rotulo: 'Até confirmar', valor: minTxt(media(R.tempos.confirma)), sub: 'pedidos do site, da mensagem à confirmação', delta: variacao(media(R.tempos.confirma), media(A.tempos.confirma), false) }) +
    tile({ rotulo: 'Até sair ou ficar pronto', valor: minTxt(media(R.tempos.saida)), delta: variacao(media(R.tempos.saida), media(A.tempos.saida), false) }) +
    tile({ rotulo: 'Tempo na rua', valor: minTxt(media(R.tempos.rota)), sub: 'da saída até a entrega' }) +
    tile({ rotulo: 'Cancelamentos', valor: pct(R.taxaCancel, 1), delta: variacao(R.taxaCancel, A.taxaCancel, false), sub: num(R.cancelados) + ' · ' + brl0(Array.from(R.motivos.values()).reduce((s, g) => s + g.valor, 0)) + ' perdidos' }) + '</div>' +
    '<div class="grade-2">' + cartao('Quanto tempo levam as entregas', grafColunas(hist, { fmt: (v) => num(v) + ' entregas', titulo: 'Distribuição do tempo de entrega' }) + '<p class="nota">Em laranja, as que passaram de 60 minutos.</p>', { sub: 'minutos do pedido até a entrega', tabela: tabela([{ t: 'Tempo' }, { t: 'Entregas', n: 1 }, { t: '%', n: 1 }], hist.map((x) => ({ cel: [x.rot + ' min', num(x.v), pct(x.v / Math.max(1, R.tempos.entrega.length))] })), { compacta: true }) }) +
    cartao('Tempo de entrega por horário', colunasHora(R, { tempo: true }), { sub: 'média por hora em que o pedido foi feito' }) + '</div>' +
    '<div class="grade-2">' + cartao('Entregadores', ents.length ? tabela([{ t: 'Entregador' }, { t: 'Entregas', n: 1 }, { t: 'Km méd.', n: 1 }, { t: 'Na rua', n: 1 }, { t: 'Até entregar', n: 1 }, { t: 'Valor', n: 1 }], ents.map(([n, g]) => ({ cel: [esc(n), num(g.qtd), num(g.km / g.qtd, 1), g.rotaN ? minTxt(g.rota / g.rotaN) : '—', minTxt(g.total / g.qtd), brl0(g.valor)] })), { compacta: true }) : '<p class="vazio">Registre o entregador no detalhe do pedido para ver este quadro.</p>') +
    cartao('Cancelamentos por motivo', ranking(motivos.map(([n, g]) => ({ nome: n, v: g.qtd, rotulo: num(g.qtd) + ' <small>' + brl0(g.valor) + '</small>' }))), { sub: 'o motivo é pedido ao cancelar' }) + '</div>';
};

/* ======================= Fechamento do dia ======================= */
let diaFech = null;
PAGINAS.fechamento = async () => {
  diaFech = diaFech || E.hoje;
  const j = await api('GET', '/api/pedidos?dia=' + diaFech);
  j.pedidos.forEach((p) => cachePedidos.set(p.id, p));
  const ps = j.pedidos;
  const concl = ps.filter((p) => p.status === 'concluido'), abertos = ps.filter((p) => !['concluido', 'cancelado'].includes(p.status)), canc = ps.filter((p) => p.status === 'cancelado');
  const tot = (l) => l.reduce((s, p) => s + p.total, 0);
  const fat = tot(concl), pagos = tot(concl.filter((p) => p.pago));
  const porPag = ORDEM_PAG.map((k, i) => { const l = concl.filter((p) => (p.pagamento || {}).forma === k); return { k, nome: NOME_PAG[k], qtd: l.length, v: tot(l), pago: tot(l.filter((p) => p.pago)), cor: CATEG[i] }; });
  const troco = concl.filter((p) => (p.pagamento || {}).forma === 'dinheiro' && p.pagamento.trocoPara).reduce((s, p) => s + Math.max(0, p.pagamento.trocoPara - p.total), 0);
  const c = $('#conteudo');
  c.innerHTML = '<div class="barra"><label class="sel"><span>Dia</span><input type="date" class="campo" id="diaFech" value="' + diaFech + '" max="' + E.hoje + '"></label><button type="button" class="btn sm" data-dfech="0"' + (diaFech === E.hoje ? ' aria-pressed="true"' : '') + '>Hoje</button><button type="button" class="btn sm" data-dfech="-1">Ontem</button>' +
    '<div class="barra-dir"><button type="button" class="btn sm" id="impFech">' + icone('imprimir') + 'Imprimir</button><button type="button" class="btn sm prim" id="csvFech"' + (ps.length ? '' : ' disabled') + '>' + icone('baixar') + 'Planilha (CSV)</button></div></div>' +
    '<div id="fechCorpo"><h2 class="fech-tit">Fechamento de ' + esc(DIAS_SEM[dowDe(diaFech)]) + ', ' + esc(dataBR(diaFech)) + '</h2>' +
    (abertos.length ? '<div class="alerta"><b>' + abertos.length + ' pedido' + (abertos.length > 1 ? 's' : '') + ' ainda em aberto</b> (' + brl(tot(abertos)) + '). Conclua ou cancele no quadro antes de fechar o caixa: só os concluídos entram no faturamento.</div>' : '') +
    (!ps.length ? '<div class="vazio grande">Nenhum pedido em ' + esc(dataBR(diaFech)) + '.</div>' :
      '<div class="tiles">' + tile({ rotulo: 'Faturamento', valor: brlTile(fat), heroi: true, sub: exato(fat) || 'pedidos concluídos' }) + tile({ rotulo: 'Pedidos concluídos', valor: num(concl.length) }) + tile({ rotulo: 'Ticket médio', valor: brl(concl.length ? fat / concl.length : 0) }) + tile({ rotulo: 'Taxas de entrega', valor: brl(concl.reduce((s, p) => s + (p.taxa || 0), 0)) }) + tile({ rotulo: 'Recebido', valor: brl(pagos), sub: pagos < fat ? brl(fat - pagos) + ' a confirmar' : 'tudo confirmado' }) + tile({ rotulo: 'Cancelados', valor: num(canc.length), sub: brl(tot(canc)) }) + '</div>' +
      '<div class="grade-2">' + cartao('Caixa por forma de pagamento', partes(porPag.map((x) => ({ nome: x.nome, v: x.v, cor: x.cor, extra: x.qtd + ' ped.' + (x.pago < x.v ? ' · ' + brl(x.v - x.pago) + ' a confirmar' : '') })), { fmt: brl }) + (troco ? '<p class="nota">Troco levado em dinheiro: <b>' + brl(troco) + '</b>.</p>' : ''), { sub: 'só pedidos concluídos' }) +
      cartao('Pedidos por hora', grafColunas(horasDoDia(ps), { fmt: (v) => num(v) + ' pedidos', titulo: 'Pedidos por hora' })) + '</div>' +
      cartao('Todos os pedidos do dia', tabela([{ t: 'Pedido' }, { t: 'Hora' }, { t: 'Cliente' }, { t: 'Tipo' }, { t: 'Canal' }, { t: 'Pagamento' }, { t: 'Status' }, { t: 'Total', n: 1 }], ps.slice().sort((a, b) => a.id - b.id).map((p) => ({ attrs: ' data-acao="abrir-pedido" data-id="' + p.id + '" tabindex="0" class="' + (p.status === 'cancelado' ? 'canc' : '') + '"', cel: ['<b>' + esc(p.codigo) + '</b>', hhmm(p.criadoEm), esc(p.cliente.nome), p.modo === 'entrega' ? 'Entrega' : 'Retirada', esc(NOME_CANAL[p.canal]), esc(NOME_PAG[(p.pagamento || {}).forma] || '—') + (p.pago ? ' ✓' : ''), '<span class="st st-' + p.status + '">' + esc(NOME_STATUS[p.status]) + '</span>', brl(p.total)] }))), { classe: 'clicavel' })) + '</div>';
  $('#diaFech').addEventListener('change', (e) => { if (e.target.value) { diaFech = e.target.value; PAGINAS.fechamento(); } });
  $$('[data-dfech]', c).forEach((b) => b.addEventListener('click', () => { diaFech = somaDias(E.hoje, +b.dataset.dfech); PAGINAS.fechamento(); }));
  $('#impFech').addEventListener('click', () => imprimir('<div class="rel">' + $('#fechCorpo').innerHTML + '</div>', 'relatorio'));
  $('#csvFech').addEventListener('click', () => baixaCSV('fechamento-' + diaFech + '.csv', ['pedido', 'data', 'hora', 'canal', 'tipo', 'status', 'cliente', 'telefone', 'bairro', 'km', 'itens', 'subtotal', 'desconto', 'taxa_entrega', 'total', 'pagamento', 'troco_para', 'pago', 'entregador', 'obs'],
    ps.slice().sort((a, b) => a.id - b.id).map((p) => [p.codigo, dataBR(p.dia), hhmm(p.criadoEm), NOME_CANAL[p.canal] || p.canal, p.modo, NOME_STATUS[p.status], p.cliente.nome, p.cliente.fone, p.endereco ? p.endereco.bairro : '', p.km != null ? dec(p.km) : '', resumoItens(p), dec(p.subtotal), dec(p.desconto), dec(p.taxa), dec(p.total), NOME_PAG[(p.pagamento || {}).forma] || '', (p.pagamento || {}).trocoPara ? dec(p.pagamento.trocoPara) : '', p.pago ? 'sim' : 'não', p.entregador || '', p.obs || ''])));
};
function horasDoDia(ps) {
  const m = new Map();
  ps.filter((p) => p.status !== 'cancelado').forEach((p) => { const h = horaSP(p.criadoEm); const g = m.get(h) || { q: 0, v: 0 }; g.q++; g.v += p.total; m.set(h, g); });
  const hs = Array.from(m.keys()); const ini = Math.min(18, ...hs), fim = Math.max(23, ...hs);
  const l = []; for (let h = ini; h <= fim; h++) l.push({ rot: h + 'h', v: (m.get(h) || {}).q || 0, dica: h + 'h · ' + brl0((m.get(h) || {}).v || 0) });
  return l;
}

inicia();
