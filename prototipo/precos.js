'use strict';
/*
 * Confere o pedido do site com o cardápio publicado (o mesmo dist/index.html que o cliente abriu): preço de cada
 * item, promoções, taxa de entrega e total.
 *
 * A conta é a mesma do site (src/app.js: precoPizza, unidades, casar, beneficio, calcularPromos, taxaPara), copiada
 * passo a passo para dar o mesmo resultado até no último centavo. Se mudar a regra de preço ou de promoção lá, mude
 * aqui também (o teste t_precos compara as duas contas com carrinhos sorteados).
 *
 * Promoções com dia e hora: o site usa o relógio do celular do cliente (e a data em UTC); o servidor aceita o
 * desconto se ele bater com qualquer momento entre 15 min antes e 15 min depois, nas duas datas. Assim um relógio um
 * pouco errado não vira aviso, mas um desconto que não existe vira.
 *
 * Resultado: { ok, motivos[], oficial, pagaMenos }. Com motivos, a gestão mostra o aviso. Se o cliente pagaria
 * MENOS do que a conta do cardápio (pagaMenos), o pedido é gravado com os valores "oficial" (a conta do servidor) e
 * o aviso mostra os dois. Se ele paga o mesmo ou mais (promoção que o site não aplicou, preço que baixou depois do
 * site aberto), os valores seguem como o cliente viu.
 */
const cent = (v) => Math.round((+v || 0) * 100) / 100;
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const hm = (s) => { const [h, m] = String(s || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
const rad = (g) => (g * Math.PI) / 180;
function kmReta(a, b) {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
const brl = (v) => 'R$ ' + cent(v).toFixed(2).replace('.', ',');

// relógio "como o celular do cliente veria" (horário de Brasília); hoje em UTC (o que o site usa) e no fuso
const fmtMomento = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' });
const DIAS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
function momento(t, dataLocal) {
  const p = Object.fromEntries(fmtMomento.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { dia: DIAS[p.weekday], min: (+p.hour) * 60 + (+p.minute), hoje: dataLocal ? p.year + '-' + p.month + '-' + p.day : new Date(t).toISOString().slice(0, 10) };
}

function criaPrecos(D) {
  D = D || {};
  const sabores = D.sabores || [], adicionais = D.adicionais || [], bordas = D.bordas || [], massas = D.massas || [], promocoes = D.promocoes || [];
  const sabor = (id) => sabores.find((s) => s.id === id);
  const adicional = (id) => adicionais.find((a) => a.id === id);
  const borda = (id) => bordas.find((b) => b.id === id) || bordas[0] || {};
  const massa = (id) => massas.find((m) => m.id === id) || massas[0] || {};
  const precoSabor = (s, tam) => (s ? (tam === 'broto' ? s.b : s.g) : null);

  function precoPizza(p) {
    const vals = (p.sabores || []).map((id) => precoSabor(sabor(id), p.tamanho)).filter((v) => v != null);
    if (!vals.length) return 0;
    return Math.max(...vals) + (borda(p.borda).preco || 0) + (massa(p.massa).preco || 0);
  }
  // o que dá para conferir em cada linha: pizza com todos os sabores do cardápio no tamanho pedido, item que existe
  function linha(i) {
    if (i.tipo === 'pizza') {
      const ss = i.sabores || [];
      const ok = ss.length > 0 && ss.every((id) => precoSabor(sabor(id), i.tamanho) != null);
      return { conhecido: ok, preco: ok ? precoPizza(i) : null };
    }
    const a = adicional(i.itemId);
    return { conhecido: !!(a && a.preco != null), preco: a ? a.preco || 0 : null };
  }

  /* ---- promoções: cópia fiel de src/app.js ---- */
  function slotAceita(sl, u) {
    if (sl.tipo === 'pizza') {
      if (u.tipo !== 'pizza') return false;
      if (sl.tamanho && u.tamanho !== sl.tamanho) return false;
      if (sl.categorias.length || sl.sabores.length) return u.sabores.every((id) => { const s = sabor(id); return s && (sl.categorias.includes(s.cat) || sl.sabores.includes(id)); });
      return true;
    }
    return u.tipo === 'item' && (!sl.itens.length || sl.itens.includes(u.itemId));
  }
  function quandoOk(q, ctx, ag) {
    if (q.dias && q.dias.length && !q.dias.includes(ag.dia)) return false;
    if (q.horaIni && ag.min < hm(q.horaIni)) return false;
    if (q.horaFim && ag.min > hm(q.horaFim)) return false;
    if (q.dataIni && ag.hoje < q.dataIni) return false;
    if (q.dataFim && ag.hoje > q.dataFim) return false;
    if (q.canal && q.canal !== 'todos' && ctx.modo !== q.canal) return false;
    if (q.cupom && norm(ctx.cupom).toUpperCase() !== norm(q.cupom).toUpperCase()) return false;
    return true;
  }
  function casar(p, disp) {
    const usados = [];
    const livres = disp.slice().sort((a, b) => b.preco - a.preco);
    let faltam = 0;
    p.condicao.slots.forEach((sl) => {
      let pegou = 0;
      for (let i = 0; i < livres.length && pegou < sl.qtd; i++) {
        if (!usados.includes(livres[i]) && slotAceita(sl, livres[i])) { usados.push(livres[i]); pegou++; }
      }
      if (pegou < sl.qtd) faltam += sl.qtd - pegou;
    });
    return { ok: faltam === 0, usados };
  }
  function beneficio(p, usados, ctx) {
    const r = p.recompensa;
    const soma = p.condicao.tipo === 'itens' ? usados.reduce((s, u) => s + u.preco, 0) : ctx.sub;
    switch (r.tipo) {
      case 'preco_fixo': return Math.max(0, soma - r.valor);
      case 'desconto_pct': return Math.round(soma * r.valor) / 100;
      case 'desconto_valor': return Math.min(r.valor, soma);
      case 'frete_gratis': return ctx.modo === 'entrega' ? ctx.taxa || 0 : 0;
      case 'borda_gratis': return (p.condicao.tipo === 'itens' ? usados : ctx.units).reduce((s, u) => s + (u.bordaPreco || 0), 0);
      case 'brinde': return (adicional(r.itemId) || { preco: 0 }).preco;
    }
    return 0;
  }
  function calcularPromos(units, ctx, ag) {
    const sub = units.reduce((s, u) => s + u.preco, 0);
    ctx = Object.assign({ sub, units }, ctx);
    const aplic = [];
    let livres = units.slice();
    const contagem = {};
    const elegiveis = promocoes.filter((p) => p.ativa && quandoOk(p.quando, ctx, ag));
    let naoAcum = null;
    for (let guarda = 0; guarda < 30; guarda++) {
      let melhor = null;
      elegiveis.forEach((p) => {
        if ((contagem[p.id] || 0) >= (p.regras.maxPorPedido || 1)) return;
        if (!p.regras.acumula && naoAcum && naoAcum !== p.id) return;
        let usados = [];
        if (p.condicao.tipo === 'itens') { const m = casar(p, livres); if (!m.ok) return; usados = m.usados; }
        else if (sub < (p.condicao.valorMin || 0) || contagem[p.id]) return;
        const ben = beneficio(p, usados, ctx);
        if (ben <= 0) return;
        if (!melhor || ben > melhor.ben || (ben === melhor.ben && p.regras.prioridade < melhor.p.regras.prioridade)) melhor = { p, usados, ben };
      });
      if (!melhor) break;
      aplic.push({ id: melhor.p.id, nome: melhor.p.nome, tipo: melhor.p.recompensa.tipo, valor: melhor.ben, brinde: melhor.p.recompensa.tipo === 'brinde' ? melhor.p.recompensa.itemId : null });
      contagem[melhor.p.id] = (contagem[melhor.p.id] || 0) + 1;
      if (!melhor.p.regras.acumula) naoAcum = melhor.p.id;
      livres = livres.filter((u) => !melhor.usados.includes(u));
    }
    const desconto = aplic.filter((a) => !a.brinde && a.tipo !== 'frete_gratis').reduce((s, a) => s + a.valor, 0);
    const freteGratis = aplic.some((a) => a.tipo === 'frete_gratis');
    return { aplic, sub, desconto, freteGratis };
  }
  function taxaPara(km) {
    const f = ((D.entrega && D.entrega.faixas) || []).slice().sort((a, b) => a.ateKm - b.ateKm).find((x) => km <= x.ateKm);
    return f ? f.taxa : null;
  }

  // v = pedido já validado (validaPedido); agora = Date.now() do servidor; lojaGeo = onde fica a pizzaria
  function confere(v, agora, lojaGeo) {
    const motivos = [];
    const linhas = v.itens.map((i) => {
      const l = linha(i);
      const unit = l.conhecido ? l.preco : cent(i.valor / i.qtd); // item fora do cardápio: não dá para conferir o preço
      if (!l.conhecido) motivos.push((i.tipo === 'pizza' ? 'Pizza com sabor ou tamanho' : 'Item') + ' fora do cardápio: ' + (i.nome || '?') + (i.detalhe ? ' (' + i.detalhe + ')' : ''));
      return { i, unit, valor: cent(unit * i.qtd) };
    });
    const units = [];
    linhas.forEach(({ i, unit }) => { for (let k = 0; k < i.qtd; k++) units.push({ tipo: i.tipo, tamanho: i.tamanho, sabores: i.sabores || [], itemId: i.itemId, preco: unit, bordaPreco: i.tipo === 'pizza' ? borda(i.borda).preco || 0 : 0 }); });

    // taxa: pela distância informada, mas nunca menos do que a linha reta até a pizzaria
    let km = v.km, taxa = null, kmBase = v.km;
    if (v.modo === 'entrega') {
      if (v.geo && lojaGeo && Number.isFinite(+lojaGeo.lat)) {
        const reta = kmReta(lojaGeo, v.geo);
        if (km == null || km < reta * 0.9 - 0.2) { motivos.push('Distância informada (' + (km == null ? 'nenhuma' : String(km).replace('.', ',') + ' km') + ') menor que a linha reta até a pizzaria (' + reta.toFixed(1).replace('.', ',') + ' km)'); kmBase = Math.round(reta * 10) / 10; }
      }
      taxa = kmBase == null ? null : taxaPara(kmBase);
      if (kmBase != null && taxa == null) motivos.push('Endereço fora da área de entrega (' + String(kmBase).replace('.', ',') + ' km)');
      if (taxa == null) taxa = v.taxa; // sem como conferir: fica a do site
    } else taxa = 0;

    // promoções: o melhor desconto possível entre os momentos e datas aceitos
    let melhor = null;
    const brindesPossiveis = new Set(), freteGratisPossivel = [];
    for (const dt of [-15, 0, 15]) for (const dataLocal of [false, true]) {
      const r = calcularPromos(units, { modo: v.modo, taxa: v.modo === 'entrega' ? taxa : null, cupom: v.cupom }, momento(agora + dt * 60e3, dataLocal));
      r.aplic.filter((a) => a.brinde).forEach((a) => brindesPossiveis.add(norm((adicional(a.brinde) || {}).nome || a.brinde)));
      if (r.freteGratis) freteGratisPossivel.push(r);
      if (!melhor || r.desconto > melhor.desconto + 1e-9 || (dt === 0 && dataLocal && Math.abs(r.desconto - melhor.desconto) < 1e-9)) melhor = r;
    }
    const sub = cent(melhor.sub);
    if (!(v.freteGratis && freteGratisPossivel.length) && v.freteGratis) motivos.push('Frete grátis sem promoção que dê frete grátis');
    for (const p of v.promocoes || []) if (p.brinde && !brindesPossiveis.has(norm(p.brinde))) motivos.push('Brinde sem promoção válida: ' + p.brinde);
    const minimo = (D.config && D.config.pedidoMinimo) || 0;
    if (sub < minimo) motivos.push('Abaixo do pedido mínimo (' + brl(minimo) + ')');

    // o que vale: o desconto do site, se algum momento aceito chega nele; senão, o melhor do servidor
    const descontoOk = v.desconto <= cent(melhor.desconto) + 0.01;
    const freteOk = !v.freteGratis || freteGratisPossivel.length > 0;
    const usaPromoSite = descontoOk && freteOk;
    const desconto = usaPromoSite ? v.desconto : cent(melhor.desconto);
    const freteGratis = usaPromoSite ? v.freteGratis : melhor.freteGratis;
    const taxaFinal = v.modo === 'entrega' && !freteGratis ? cent(taxa) : 0;
    const total = cent(Math.max(0, sub - desconto) + taxaFinal);
    if (!descontoOk) motivos.push('Desconto do site (' + brl(v.desconto) + ') maior que o das promoções válidas (' + brl(melhor.desconto) + ')');
    linhas.forEach(({ i, valor }) => { if (i.valor < valor - 0.01) motivos.push('Preço de ' + (i.nome || 'item') + (i.detalhe ? ' (' + i.detalhe + ')' : '') + ': site ' + brl(i.valor) + ', cardápio ' + brl(valor)); });
    if (v.modo === 'entrega' && !freteGratis && v.taxa < taxaFinal - 0.01) motivos.push('Taxa de entrega: site ' + brl(v.taxa) + ', tabela ' + brl(taxaFinal));
    const pagaMenos = v.total < total - 0.01;
    if (pagaMenos && !motivos.length) motivos.push('Total do site (' + brl(v.total) + ') menor que a conta do cardápio (' + brl(total) + ')');

    const ok = !motivos.length;
    const oficial = {
      itens: v.itens.map((i, k) => Object.assign({}, i, { valor: linhas[k].valor })),
      subtotal: sub, desconto: cent(desconto), taxa: taxaFinal, freteGratis, total,
      promocoes: usaPromoSite ? v.promocoes : melhor.aplic.map((a) => ({ nome: a.nome, valor: cent(a.valor), brinde: a.brinde ? (adicional(a.brinde) || {}).nome || '' : '', tipo: a.tipo }))
    };
    return { ok, motivos: Array.from(new Set(motivos)).slice(0, 12), oficial, pagaMenos };
  }

  return { confere, precoPizza, taxaPara, calcularPromos, momento };
}

module.exports = criaPrecos;
Object.assign(module.exports, { kmReta, momento });
