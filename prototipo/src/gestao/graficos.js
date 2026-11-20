/* Gestão — gráficos em SVG/HTML feitos à mão (sem biblioteca): linha, colunas, mapa de calor, ranking, barra
   segmentada, mapa radial de bairros e cartões de número. Toda marca tem dica ao passar o mouse ou focar, e todo
   gráfico tem a vista em tabela. Cores: verde da marca para uma série; paleta categórica validada para partes. */
const COR = { v1: '#1F7A4C', v2: '#E07B24', v3: '#2F6FD0', v4: '#D4A017', v5: '#B8336A', cinza: '#B3AA9C', grade: '#ECE5D6' };
const CATEG = [COR.v1, COR.v2, COR.v3, COR.v4, COR.v5];
// rampa sequencial (um tom, claro → escuro) para o mapa de calor
const RAMPA = ['#EEF5F0', '#D2E8D9', '#ADD4B9', '#7FB993', '#539C6D', '#2E7D4F', '#175A31'];
const TEXTO_SOBRE = { [COR.v1]: '#fff', [COR.v2]: '#1E1B16', [COR.v3]: '#fff', [COR.v4]: '#1E1B16', [COR.v5]: '#fff' };

/* ---------- dica (tooltip) única, por delegação ---------- */
let dicaEl = null;
function ligaDicas(raiz) {
  dicaEl = document.createElement('div');
  dicaEl.className = 'dica'; dicaEl.setAttribute('role', 'tooltip'); dicaEl.hidden = true;
  document.body.appendChild(dicaEl);
  const mostra = (alvo, x, y) => {
    dicaEl.innerHTML = alvo.getAttribute('data-dica');
    dicaEl.hidden = false;
    const w = dicaEl.offsetWidth, h = dicaEl.offsetHeight;
    let left = x + 14, top = y - h - 12;
    if (left + w > innerWidth - 8) left = x - w - 14;
    if (top < 8) top = y + 18;
    dicaEl.style.transform = 'translate(' + Math.max(8, left) + 'px,' + top + 'px)';
  };
  raiz.addEventListener('pointermove', (e) => {
    const a = e.target.closest('[data-dica]');
    if (!a) { dicaEl.hidden = true; return; }
    mostra(a, e.clientX, e.clientY);
  });
  raiz.addEventListener('pointerleave', () => { dicaEl.hidden = true; });
  raiz.addEventListener('focusin', (e) => {
    const a = e.target.closest('[data-dica]');
    if (!a) { dicaEl.hidden = true; return; }
    const r = a.getBoundingClientRect();
    mostra(a, r.left + r.width / 2, r.top);
  });
  raiz.addEventListener('focusout', () => { dicaEl.hidden = true; });
  document.addEventListener('scroll', () => { if (dicaEl) dicaEl.hidden = true; }, true);
}
// texto da dica: escapa o conteúdo (nomes vêm dos pedidos) e de novo para caber no atributo
const dica = (forte, fraco) => esc('<b>' + esc(forte) + '</b>' + (fraco ? '<span>' + esc(fraco) + '</span>' : ''));

/* ---------- escala "redonda" para eixos ---------- */
function escalaEixo(max, passos = 4) {
  if (!(max > 0)) return { max: 1, passo: 1, ticks: [0, 1] };
  const bruto = max / passos;
  const mag = Math.pow(10, Math.floor(Math.log10(bruto)));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= bruto) || 10 * mag;
  const topo = Math.ceil(max / passo) * passo;
  const ticks = [];
  for (let v = 0; v <= topo + 1e-9; v += passo) ticks.push(Math.round(v * 1e6) / 1e6);
  return { max: topo, passo, ticks };
}

/* ---------- cartão de número ---------- */
function variacao(atual, ant, melhorMaior = true, rotulo = 'vs. período anterior') {
  if (ant == null || !Number.isFinite(ant) || atual == null) return '';
  if (!ant) return atual ? '<span class="delta neutro">novo ' + esc(rotulo) + '</span>' : '';
  const d = (atual - ant) / Math.abs(ant);
  if (Math.abs(d) < 0.005) return '<span class="delta neutro">= ' + esc(rotulo) + '</span>';
  const bom = d > 0 === melhorMaior;
  return '<span class="delta ' + (bom ? 'bom' : 'ruim') + '"><i aria-hidden="true">' + (d > 0 ? '▲' : '▼') + '</i>' + num(Math.abs(d) * 100, Math.abs(d) < 0.1 ? 1 : 0) + '% <small>' + esc(rotulo) + '</small></span>';
}
function sparkline(vals) {
  if (!vals || vals.length < 2) return '';
  const W = 120, H = 30, mx = Math.max(...vals, 1), mn = Math.min(...vals, 0);
  const x = (i) => (i / (vals.length - 1)) * (W - 6) + 3, y = (v) => H - 4 - ((v - mn) / (mx - mn || 1)) * (H - 8);
  const d = vals.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ');
  const u = vals.length - 1;
  return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true"><path d="' + d + '" fill="none" stroke="' + COR.cinza + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="' + x(u).toFixed(1) + '" cy="' + y(vals[u]).toFixed(1) + '" r="3.5" fill="' + COR.v1 + '" stroke="#fff" stroke-width="2"/></svg>';
}
function tile(o) {
  return '<div class="tile' + (o.heroi ? ' heroi' : '') + '"><span class="tile-rot">' + esc(o.rotulo) + (o.ajuda ? ' <i class="ajuda" tabindex="0" data-dica="' + dica(o.rotulo, o.ajuda) + '">?</i>' : '') + '</span>' +
    '<b class="tile-val">' + o.valor + '</b>' + (o.delta || '') + (o.sub ? '<span class="tile-sub">' + o.sub + '</span>' : '') + (o.spark ? sparkline(o.spark) : '') + '</div>';
}
// valores grandes nos cartões ficam compactos (R$ 54,4 mil), com o valor exato embaixo
const brlTile = (v) => (Math.abs(v) >= 1e4 ? brlCurto(v) : brl(v));
const exato = (v) => (Math.abs(v) >= 1e4 ? brl(v) + ' no total' : '');
function medidor(valor, meta) {
  const f = meta > 0 ? Math.min(1, valor / meta) : 0;
  return '<div class="medidor" role="meter" aria-valuemin="0" aria-valuemax="' + Math.round(meta) + '" aria-valuenow="' + Math.round(valor) + '" aria-label="Meta do dia"><i style="width:' + (f * 100).toFixed(1) + '%"></i></div>';
}

/* ---------- linha no tempo (este período × anterior) ---------- */
function grafLinha(pontos, o = {}) {
  const fmt = o.fmt || brl0, curto = o.curto || brlCurto;
  const W = 760, H = o.alt || 230, esq = 58, dir = 14, topo = 16, base = H - 30;
  const n = pontos.length;
  if (!n) return '<p class="vazio">Sem dados no período.</p>';
  const mx = Math.max(...pontos.map((p) => Math.max(p.y || 0, o.comparar ? p.y2 || 0 : 0)), 0);
  const ex = escalaEixo(mx);
  const X = (i) => esq + (n === 1 ? (W - esq - dir) / 2 : (i / (n - 1)) * (W - esq - dir));
  const Y = (v) => base - (v / ex.max) * (base - topo);
  let g = '';
  ex.ticks.forEach((t) => { g += '<line class="grade" x1="' + esq + '" x2="' + (W - dir) + '" y1="' + Y(t).toFixed(1) + '" y2="' + Y(t).toFixed(1) + '"/><text class="eixo" x="' + (esq - 8) + '" y="' + (Y(t) + 4).toFixed(1) + '" text-anchor="end">' + esc(curto(t)) + '</text>'; });
  const linha = (k) => pontos.map((p, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(p[k] || 0).toFixed(1)).join(' ');
  const area = linha('y') + ' L' + X(n - 1).toFixed(1) + ',' + base + ' L' + X(0).toFixed(1) + ',' + base + ' Z';
  const passoRot = Math.max(1, Math.ceil(n / (o.maxRotulos || 8)));
  const idx = [];
  for (let i = 0; i < n; i += passoRot) idx.push(i);
  if (n > 1) { if (n - 1 - idx[idx.length - 1] >= passoRot * 0.6) idx.push(n - 1); else idx[idx.length - 1] = n - 1; }
  const rotular = new Set(idx);
  let rx = '';
  pontos.forEach((p, i) => { if (rotular.has(i)) rx += '<text class="eixo" x="' + X(i).toFixed(1) + '" y="' + (base + 18) + '" text-anchor="' + (i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle') + '">' + esc(p.rot) + '</text>'; });
  const iMax = pontos.reduce((a, p, i) => ((p.y || 0) > (pontos[a].y || 0) ? i : a), 0);
  const larg = (W - esq - dir) / Math.max(1, n - (n === 1 ? 0 : 1));
  const alvos = pontos.map((p, i) => '<g class="alvo-x" tabindex="0" data-dica="' + dica(fmt(p.y || 0), (p.dica || p.rot) + (o.comparar ? ' · antes: ' + fmt(p.y2 || 0) + (p.dica2 ? ' (' + p.dica2 + ')' : '') : '')) + '"><rect x="' + (X(i) - larg / 2).toFixed(1) + '" y="' + topo + '" width="' + larg.toFixed(1) + '" height="' + (base - topo) + '"/><line class="cruz" x1="' + X(i).toFixed(1) + '" x2="' + X(i).toFixed(1) + '" y1="' + topo + '" y2="' + base + '"/><circle class="cruz" cx="' + X(i).toFixed(1) + '" cy="' + Y(p.y || 0).toFixed(1) + '" r="5" fill="' + COR.v1 + '" stroke="#fff" stroke-width="2"/></g>').join('');
  const leg = o.comparar ? '<div class="legenda"><span><i class="chave-linha" style="background:' + COR.v1 + '"></i>' + esc(o.nomeAtual || 'Este período') + '</span><span><i class="chave-linha tracejada"></i>' + esc(o.nomeAnterior || 'Período anterior') + '</span></div>' : '';
  return leg + '<svg class="graf" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.titulo || 'Evolução no período') + '">' + g +
    '<line class="base" x1="' + esq + '" x2="' + (W - dir) + '" y1="' + base + '" y2="' + base + '"/>' +
    (o.comparar ? '<path d="' + linha('y2') + '" fill="none" stroke="' + COR.cinza + '" stroke-width="2" stroke-dasharray="5 4" stroke-linejoin="round"/>' : '') +
    '<path d="' + area + '" fill="' + COR.v1 + '" fill-opacity=".1"/><path d="' + linha('y') + '" fill="none" stroke="' + COR.v1 + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
    (n > 1 ? '<text class="valor" x="' + X(iMax).toFixed(1) + '" y="' + (Y(pontos[iMax].y || 0) - 10).toFixed(1) + '" text-anchor="middle">' + esc(curto(pontos[iMax].y || 0)) + '</text>' : '') +
    rx + alvos + '</svg>';
}

/* ---------- colunas ---------- */
function grafColunas(dados, o = {}) {
  const fmt = o.fmt || ((v) => num(v));
  const W = o.larg || 560, H = o.alt || 200, esq = 40, dir = 8, topo = 20, base = H - 26;
  if (!dados.length) return '<p class="vazio">Sem dados.</p>';
  const ex = escalaEixo(Math.max(...dados.map((d) => d.v), 0));
  const passoX = (W - esq - dir) / dados.length;
  const bw = Math.min(24, passoX * 0.62);
  const Y = (v) => base - (v / ex.max) * (base - topo);
  let g = '';
  ex.ticks.forEach((t) => { g += '<line class="grade" x1="' + esq + '" x2="' + (W - dir) + '" y1="' + Y(t).toFixed(1) + '" y2="' + Y(t).toFixed(1) + '"/><text class="eixo" x="' + (esq - 6) + '" y="' + (Y(t) + 4).toFixed(1) + '" text-anchor="end">' + esc(o.curto ? o.curto(t) : num(t)) + '</text>'; });
  const iMax = dados.reduce((a, d, i) => (d.v > dados[a].v ? i : a), 0);
  const passoRot = Math.max(1, Math.ceil(dados.length / (o.maxRotulos || 14)));
  const cols = dados.map((d, i) => {
    const cx = esq + (i + 0.5) * passoX, h = Math.max(0, (d.v / ex.max) * (base - topo)), x = cx - bw / 2, y = base - h, r = Math.min(4, h);
    const forma = h > 0 ? '<path class="col" d="M' + x.toFixed(1) + ',' + base + ' V' + (y + r).toFixed(1) + ' Q' + x.toFixed(1) + ',' + y.toFixed(1) + ' ' + (x + r).toFixed(1) + ',' + y.toFixed(1) + ' H' + (x + bw - r).toFixed(1) + ' Q' + (x + bw).toFixed(1) + ',' + y.toFixed(1) + ' ' + (x + bw).toFixed(1) + ',' + (y + r).toFixed(1) + ' V' + base + ' Z"' + (d.cor ? ' style="fill:' + d.cor + '"' : '') + '/>' : '';
    const rot = o.semDestaque || i !== iMax || !d.v ? '' : '<text class="valor" x="' + cx.toFixed(1) + '" y="' + (y - 6).toFixed(1) + '" text-anchor="middle">' + esc(fmt(d.v)) + '</text>';
    return '<g class="alvo" tabindex="0" data-dica="' + dica(fmt(d.v), d.dica || d.rot) + '"><rect x="' + (cx - passoX / 2).toFixed(1) + '" y="' + topo + '" width="' + passoX.toFixed(1) + '" height="' + (base - topo + 22) + '" fill="transparent"/>' + forma + rot +
      (i % passoRot === 0 ? '<text class="eixo" x="' + cx.toFixed(1) + '" y="' + (base + 17) + '" text-anchor="middle">' + esc(d.rot) + '</text>' : '') + '</g>';
  }).join('');
  return '<svg class="graf" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.titulo || '') + '">' + g + '<line class="base" x1="' + esq + '" x2="' + (W - dir) + '" y1="' + base + '" y2="' + base + '"/>' + cols + '</svg>';
}

/* ---------- mapa de calor (dia da semana × hora) ---------- */
function grafCalor(linhas, colunas, o = {}) {
  const mx = Math.max(1, ...linhas.flatMap((l) => l.celulas.map((c) => c.v)));
  const passo = (v) => (v <= 0 ? -1 : Math.min(RAMPA.length - 1, Math.floor((v / mx) * (RAMPA.length - 1) + 0.5)));
  let h = '<div class="calor" style="grid-template-columns:44px repeat(' + colunas.length + ',minmax(0,1fr))" role="table" aria-label="' + esc(o.titulo || 'Mapa de calor') + '"><span></span>' + colunas.map((c) => '<span class="calor-col" role="columnheader">' + esc(c) + '</span>').join('');
  linhas.forEach((l) => {
    h += '<span class="calor-lin" role="rowheader">' + esc(l.rot) + '</span>';
    l.celulas.forEach((c) => {
      const s = passo(c.v);
      h += '<span class="calor-cel' + (s < 0 ? ' zero' : '') + (l.fechado ? ' fechado' : '') + '" role="cell" tabindex="0" style="' + (s >= 0 ? 'background:' + RAMPA[s] : '') + '" data-dica="' + dica(o.fmt ? o.fmt(c.v) : num(c.v), c.dica) + '"></span>';
    });
  });
  h += '</div><div class="calor-escala" aria-hidden="true"><span>menos</span>' + RAMPA.map((c) => '<i style="background:' + c + '"></i>').join('') + '<span>mais</span></div>';
  return h;
}

/* ---------- ranking (barras horizontais, uma cor, maior primeiro) ---------- */
function ranking(linhas, o = {}) {
  if (!linhas.length) return '<p class="vazio">Sem dados no período.</p>';
  const mx = Math.max(...linhas.map((l) => l.v), 1);
  return '<ol class="ranking' + (o.compacto ? ' compacto' : '') + '">' + linhas.map((l, i) =>
    '<li tabindex="0"' + (l.dica ? ' data-dica="' + l.dica + '"' : '') + (l.acao ? ' data-acao="' + esc(l.acao) + '" data-valor="' + esc(l.valorAcao || '') + '" class="clicavel"' : '') + '><span class="rk-pos">' + (i + 1) + '</span><span class="rk-nome">' + esc(l.nome) + (l.sub ? '<small>' + esc(l.sub) + '</small>' : '') + '</span>' +
    '<span class="rk-barra"><i style="width:' + Math.max(1.5, (l.v / mx) * 100).toFixed(1) + '%"></i></span><span class="rk-val">' + l.rotulo + '</span></li>').join('') + '</ol>';
}

/* ---------- partes de um todo: barra fina + linhas com os números ---------- */
function partes(lista, o = {}) {
  const tot = lista.reduce((s, p) => s + p.v, 0);
  if (!tot) return '<p class="vazio">Sem dados no período.</p>';
  const fmt = o.fmt || ((v) => num(v));
  return '<div class="seg" role="img" aria-label="' + esc(lista.map((p) => p.nome + ' ' + pct(p.v / tot)).join(', ')) + '">' + lista.filter((p) => p.v > 0).map((p) => '<i tabindex="0" style="flex-grow:' + p.v + ';background:' + p.cor + '" data-dica="' + dica(pct(p.v / tot), p.nome + ' · ' + fmt(p.v)) + '"></i>').join('') + '</div>' +
    '<ul class="seg-lista">' + lista.map((p) => '<li><i style="background:' + p.cor + '"></i><span>' + esc(p.nome) + '</span><b>' + pct(p.v / tot) + '</b><span class="seg-v">' + fmt(p.v) + (p.extra ? ' · ' + p.extra : '') + '</span></li>').join('') + '</ul>';
}

/* ---------- mapa radial: direção real a partir das coordenadas, distância pela rota (escala de raiz) ---------- */
function mapaBairros(bairros, faixas, o = {}) {
  const maxKm = Math.max(5, ...faixas.map((f) => f.ateKm), ...bairros.map((b) => b.km || 0));
  const R = 112, raio = (km) => R * Math.sqrt(Math.min(1, Math.max(0, km) / maxKm));
  const maxQ = Math.max(1, ...bairros.map((b) => b.qtd));
  let s = '<svg class="mapa-radial" viewBox="-130 -130 260 260" role="img" aria-label="Mapa de pedidos por bairro"><circle r="124" fill="#F6EEDD"/>';
  faixas.slice().sort((a, b) => b.ateKm - a.ateKm).forEach((f) => { s += '<circle r="' + raio(f.ateKm).toFixed(1) + '" fill="none" stroke="#D9CBB0" stroke-width="1" stroke-dasharray="3 3"/><text class="mapa-anel" x="0" y="' + (-raio(f.ateKm) + 9).toFixed(1) + '" text-anchor="middle">' + f.ateKm + ' km</text>'; });
  ['N', 'L', 'S', 'O'].forEach((c, i) => { const a = (i * Math.PI) / 2 - Math.PI / 2; s += '<text class="mapa-rosa" x="' + (Math.cos(a) * 121).toFixed(1) + '" y="' + (Math.sin(a) * 121 + 3).toFixed(1) + '" text-anchor="middle">' + c + '</text>'; });
  const comPos = bairros.filter((b) => b.ang != null).sort((a, b) => b.qtd - a.qtd);
  const pos = (b) => { const r = raio(b.km || 0); return { x: Math.cos(b.ang) * r, y: Math.sin(b.ang) * r, br: 2.5 + Math.sqrt(b.qtd / maxQ) * 13 }; };
  // rótulos sem encavalar: tenta acima, abaixo e dos lados; se não couber, o bairro fica só com a dica
  const ocup = [{ x: -10, y: -10, w: 20, h: 20 }], rotulos = [];
  comPos.slice(0, o.rotulos || 10).forEach((b) => {
    const { x, y, br } = pos(b), txt = b.nome.replace(/^Jardim /, 'Jd. '), w = txt.length * 3.55 + 4, h = 8;
    const cands = [[x - w / 2, y - br - 2 - h], [x - w / 2, y + br + 2], [x + br + 2, y - h / 2], [x - br - 2 - w, y - h / 2]];
    const livre = cands.find(([cx, cy]) => cx > -128 && cx + w < 128 && cy > -128 && cy + h < 128 && !ocup.some((q) => cx < q.x + q.w && cx + w > q.x && cy < q.y + q.h && cy + h > q.y));
    if (livre) { ocup.push({ x: livre[0], y: livre[1], w, h }); rotulos.push('<text class="mapa-rot" x="' + (livre[0] + w / 2).toFixed(1) + '" y="' + (livre[1] + h - 1.6).toFixed(1) + '" text-anchor="middle">' + esc(txt) + '</text>'); }
  });
  const bolhas = comPos.slice().reverse().map((b) => {
    const { x, y, br } = pos(b);
    return '<g class="bolha" tabindex="0" data-dica="' + dica(b.qtd + ' pedido' + (b.qtd === 1 ? '' : 's'), b.nome + (b.cidade ? ' · ' + b.cidade : '') + ' · ' + brl0(b.valor) + ' · ' + num(b.km || 0, 1) + ' km') + '"><circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + br.toFixed(1) + '" fill="' + COR.v1 + '" fill-opacity=".5" stroke="#fff" stroke-width="1.5"/></g>';
  }).join('');
  s += bolhas + '<g class="mapa-rotulos" aria-hidden="true">' + rotulos.join('') + '</g><g class="mapa-loja"><circle r="7" fill="#C1121F" stroke="#fff" stroke-width="2.5"/><circle r="2.4" fill="#fff"/></g></svg>';
  return s;
}

/* ---------- tabela simples (vista acessível de qualquer gráfico) ---------- */
function tabela(cab, linhas, o = {}) {
  return '<div class="tab-wrap"><table class="tab' + (o.compacta ? ' compacta' : '') + '"><thead><tr>' + cab.map((c) => '<th' + (c.n ? ' class="n"' : '') + '>' + esc(c.t || c) + '</th>').join('') + '</tr></thead><tbody>' +
    linhas.map((l) => '<tr' + (l.attrs || '') + '>' + l.cel.map((v, i) => '<td' + (cab[i] && cab[i].n ? ' class="n"' : '') + '>' + v + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
}
// cartão com alternância gráfico/tabela
function cartao(titulo, corpo, o = {}) {
  return '<section class="card' + (o.classe ? ' ' + o.classe : '') + '"' + (o.id ? ' id="' + o.id + '"' : '') + '><header class="card-topo"><div><h3>' + esc(titulo) + '</h3>' + (o.sub ? '<p>' + o.sub + '</p>' : '') + '</div>' +
    (o.tabela ? '<button type="button" class="link" data-alterna aria-pressed="false">ver em tabela</button>' : '') + (o.extra || '') + '</header>' +
    (o.tabela ? '<div class="vista-graf">' + corpo + '</div><div class="vista-tab" hidden>' + o.tabela + '</div>' : corpo) + '</section>';
}
