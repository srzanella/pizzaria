/* Gestão — entregadores: mapa ao vivo (Leaflet + OpenStreetMap), jornada, pareamento do celular, escolha do
   entregador no pedido e a distância até o cliente no quadro ao vivo. Os avisos chegam pelo mesmo /api/eventos. */
NAV[0][1].splice(1, 0, ['entregadores', 'Entregadores']);
TITULOS.entregadores = 'Entregadores ao vivo';
ICO.entregadores = ICO.moto;

const ENT = { mapa: null, marcas: new Map(), rastros: new Map(), destinos: [], loja: null, raf: new Map(), primeiro: true, app: null, enderecoApp: null, relogio: null };
E.entregadores = [];
async function carregaEntregadores() {
  const j = await api('GET', '/api/entregadores');
  E.entregadores = j.entregadores;
  ENT.app = j.app; ENT.enderecoApp = j.enderecoApp;
  return j;
}
const entregadorPorId = (id) => E.entregadores.find((x) => x.id === id);
const radG = (g) => (g * Math.PI) / 180;
function metrosEntre(a, b) { const dLat = radG(b.lat - a.lat), dLng = radG(b.lng - a.lng); const h = Math.sin(dLat / 2) ** 2 + Math.cos(radG(a.lat)) * Math.cos(radG(b.lat)) * Math.sin(dLng / 2) ** 2; return 2 * 6371000 * Math.asin(Math.sqrt(h)); }
const distTxt = (m) => (m >= 1000 ? num(m / 1000, 1) + ' km' : Math.round(m / 10) * 10 + ' m');
const segDesde = (iso) => (iso ? Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000)) : null);
const sinalTxt = (s) => (s == null ? 'sem sinal ainda' : s < 60 ? 'sinal há ' + s + ' s' : s < 3600 ? 'sinal há ' + Math.floor(s / 60) + ' min' : 'sinal há ' + Math.floor(s / 3600) + ' h');
const duracao = (iso) => { const m = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60000)); return m < 60 ? m + ' min' : Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0'); };
function estadoEnt(x) {
  if (!x.ativo) return ['off', 'Desativado'];
  if (!x.pareado) return ['sem', 'Sem celular pareado'];
  if (!x.emJornada) return ['off', 'Fora de jornada'];
  const s = x.posicao ? segDesde(x.posicao.em) : null;
  if (s == null || s > 180) return ['fraco', 'Em jornada · ' + sinalTxt(s)];
  return ['on', 'Em jornada há ' + duracao(x.jornada.inicio)];
}

/* ---------- no pedido: escolher o entregador ---------- */
function campoEntregador(p) {
  const l = E.entregadores.filter((x) => x.ativo);
  if (!l.length) return '<label class="rot">Entregador<input class="campo" data-campo="entregador" value="' + esc(p.entregador || '') + '" placeholder="Quem vai levar" maxlength="60"></label><p class="nota">Cadastre os entregadores em <a href="#/entregadores">Entregadores</a> para o cliente acompanhar a moto no mapa.</p>';
  const atual = p.entregadorId ? String(p.entregadorId) : p.entregador ? 'nome' : '';
  return '<label class="rot">Entregador<select class="campo" data-campo="entregadorId"><option value="">Ninguém ainda</option>' +
    l.map((x) => '<option value="' + x.id + '"' + (String(x.id) === atual ? ' selected' : '') + '>' + esc(x.nome) + (x.emJornada ? ' · em jornada' : x.pareado ? ' · fora de jornada' : ' · sem app') + '</option>').join('') +
    (atual === 'nome' ? '<option value="nome" selected>' + esc(p.entregador) + ' (só o nome)</option>' : '') + '</select></label>' +
    (p.entregadorId && p.status === 'saiu' ? '<p class="nota">O cliente vê a moto no mapa enquanto o pedido está na rua.</p>' : '');
}
function chipEntregador(p) {
  if (p.entregadorId) {
    const x = entregadorPorId(p.entregadorId);
    const d = x && x.posicao && p.geo ? distTxt(metrosEntre(x.posicao, p.geo)) : null;
    return '<p class="k-moto" data-moto="' + p.entregadorId + '" data-pedido="' + p.id + '">' + icone('moto') + '<span>' + esc(p.entregador || (x && x.nome) || '') + '</span>' + (p.status === 'saiu' && d ? '<b data-dist>a ' + d + ' do cliente</b>' : x && !x.emJornada ? '<i>fora de jornada</i>' : '') + '</p>';
  }
  const on = E.entregadores.filter((x) => x.ativo && x.emJornada);
  if (!on.length) return p.entregador ? '<p class="k-moto">' + icone('moto') + '<span>' + esc(p.entregador) + '</span></p>' : '';
  return '<label class="k-ent">' + icone('moto') + '<select data-ent-pedido="' + p.id + '" aria-label="Escolher o entregador do pedido ' + esc(p.codigo) + '"><option value="">Escolher entregador…</option>' + on.map((x) => '<option value="' + x.id + '">' + esc(x.nome) + '</option>').join('') + '</select></label>';
}
document.addEventListener('change', (e) => {
  const s = e.target.closest('[data-ent-pedido]');
  if (s && s.value) muda(+s.dataset.entPedido, { entregadorId: +s.value }).then((p) => { if (p) toast(p.codigo + ' com ' + p.entregador + '.'); });
});

/* ---------- eventos ao vivo ---------- */
function aoPosicao(d) {
  const x = entregadorPorId(d.e);
  if (!x) return;
  x.posicao = { lat: d.lat, lng: d.lng, precisao: d.prec, velocidade: d.vel, rumo: d.rumo, em: new Date(d.t).toISOString() };
  if (d.bat != null) x.bateria = d.bat;
  // quadro ao vivo: distância até o cliente sem redesenhar o cartão
  $$('.k-moto[data-moto="' + d.e + '"]').forEach((el) => {
    const p = pedidoEmCache(+el.dataset.pedido);
    const b = el.querySelector('[data-dist]');
    if (p && p.geo && b) b.textContent = 'a ' + distTxt(metrosEntre(x.posicao, p.geo)) + ' do cliente';
  });
  if (E.rota === 'entregadores') { moveMarca(x, true); atualizaCartao(x); }
}
let recarregaEnt = null;
function aoEntregador() {
  clearTimeout(recarregaEnt);
  recarregaEnt = setTimeout(async () => {
    try { await carregaEntregadores(); } catch (e) { return; }
    if (E.rota === 'entregadores') desenhaEntregadores();
    if (E.rota === 'aovivo') desenhaQuadro();
    const g = $('#gaveta');
    if (g && !g.hidden && g.dataset.tipo === 'entregador') { const x = entregadorPorId(+g.dataset.ent); if (x && x.pareado && g.dataset.pareando === '1') desenhaPareado(x); }
  }, 250);
}

/* ---------- mapa ---------- */
let leafletG = null;
function carregaLeafletG() {
  if (window.L && window.L.map) return Promise.resolve(window.L);
  if (!leafletG) leafletG = new Promise((ok, falha) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(css);
    const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'; s.onload = () => ok(window.L); s.onerror = () => { leafletG = null; falha(new Error('O mapa não carregou (sem internet?).')); };
    document.head.appendChild(s);
  });
  return leafletG;
}
const iconeMoto = (x) => window.L.divIcon({ className: 'g-moto ' + estadoEnt(x)[0], html: '<i class="g-moto-pulso"></i><span class="g-moto-seta" style="transform:rotate(' + (x.posicao && x.posicao.rumo != null ? x.posicao.rumo : 0) + 'deg)"><svg viewBox="0 0 56 56"><path d="M28 1 36 12H20Z"/></svg></span><span class="g-moto-bolha">' + esc(iniciais(x.nome)) + '</span><b class="g-moto-nome">' + esc(primeiroNome(x.nome)) + '</b>', iconSize: [56, 56], iconAnchor: [28, 28] });
function moveMarca(x, animado) {
  const L = window.L;
  if (!ENT.mapa || !L || !x.posicao) return;
  let mk = ENT.marcas.get(x.id);
  const para = L.latLng(x.posicao.lat, x.posicao.lng);
  if (!mk) {
    mk = L.marker(para, { icon: iconeMoto(x), zIndexOffset: 1000, keyboard: false }).addTo(ENT.mapa);
    mk.on('click', () => abreEntregador(x.id));
    mk.bindTooltip(() => { const y = entregadorPorId(x.id) || x; return esc(y.nome) + '<br>' + esc(sinalTxt(y.posicao ? segDesde(y.posicao.em) : null)) + (y.bateria != null ? ' · bateria ' + Math.round(y.bateria) + '%' : ''); }, { direction: 'top', offset: [0, -24] });
    ENT.marcas.set(x.id, mk);
    return;
  }
  mk.setIcon(iconeMoto(x));
  const de = mk.getLatLng();
  const r = ENT.rastros.get(x.id);
  if (r && x.emJornada) r.addLatLng(para);
  cancelAnimationFrame(ENT.raf.get(x.id));
  if (!animado || REDUZ) { mk.setLatLng(para); return; }
  const t0 = performance.now(), dur = 3600;
  const passo = (t) => { const k = Math.min(1, (t - t0) / dur); mk.setLatLng([de.lat + (para.lat - de.lat) * k, de.lng + (para.lng - de.lng) * k]); if (k < 1) ENT.raf.set(x.id, requestAnimationFrame(passo)); };
  ENT.raf.set(x.id, requestAnimationFrame(passo));
}
async function montaMapa() {
  const box = $('#entMapa');
  if (!box) return;
  let L;
  try { L = await carregaLeafletG(); } catch (e) { box.innerHTML = '<p class="vazio grande">' + esc(e.message) + '</p>'; return; }
  if (!document.contains(box)) return;
  if (ENT.mapa) { try { ENT.mapa.remove(); } catch (e) { /* já saiu */ } }
  ENT.marcas.clear(); ENT.rastros.clear(); ENT.destinos = [];
  const m = L.map(box, { zoomControl: true, scrollWheelZoom: true, zoomSnap: 0.25 });
  m.attributionControl.setPrefix('');
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
  ENT.mapa = m;
  const loja = E.lojaGeo || ((D.config || {}).lojaLat ? { lat: +D.config.lojaLat, lng: +D.config.lojaLng } : null);
  if (loja) ENT.loja = L.marker([loja.lat, loja.lng], { icon: L.divIcon({ className: 'g-loja', html: '<span>P</span>', iconSize: [32, 32], iconAnchor: [16, 16] }), keyboard: false }).addTo(m).bindTooltip(esc(nomeLoja()), { direction: 'top' });
  desenhaCamadas();
  const pts = E.entregadores.filter((x) => x.posicao && x.emJornada).map((x) => [x.posicao.lat, x.posicao.lng]).concat(loja ? [[loja.lat, loja.lng]] : []);
  if (pts.length > 1) m.fitBounds(pts, { padding: [50, 50], maxZoom: 15 }); else if (pts.length) m.setView(pts[0], 14); else m.setView([-21.17, -47.81], 12);
  // trajeto da jornada de quem está na rua
  E.entregadores.filter((x) => x.emJornada).forEach(async (x) => {
    try {
      const t = await api('GET', '/api/entregadores/' + x.id + '/trajeto');
      if (ENT.mapa !== m || !t.pontos.length) return;
      const r = L.polyline(t.pontos.map((q) => [q[0], q[1]]), { color: '#2F6FD0', weight: 3, opacity: 0.55 }).addTo(m);
      ENT.rastros.set(x.id, r);
    } catch (e) { /* sem trajeto */ }
  });
}
function desenhaCamadas() {
  const L = window.L, m = ENT.mapa;
  if (!m || !L) return;
  ENT.destinos.forEach((c) => c.remove()); ENT.destinos = [];
  for (const x of E.entregadores) {
    if (x.posicao && x.emJornada) moveMarca(x, false);
    else if (ENT.marcas.has(x.id)) { ENT.marcas.get(x.id).remove(); ENT.marcas.delete(x.id); }
    for (const p of x.entregas || []) {
      if (!p.geo) continue;
      const na = p.status === 'saiu';
      ENT.destinos.push(L.marker([p.geo.lat, p.geo.lng], { icon: L.divIcon({ className: 'g-dest' + (na ? ' rua' : ''), html: '<span>' + esc(p.codigo) + '</span>', iconSize: [70, 26], iconAnchor: [35, 30] }), keyboard: false }).addTo(m).bindTooltip(esc(p.nome) + ' · ' + esc(p.bairro || '') + '<br>' + esc(x.nome) + (na ? ' · na rua' : ' · na cozinha'), { direction: 'top' }).on('click', () => abrePedido(p.id)));
      if (na && x.posicao) ENT.destinos.push(L.polyline([[x.posicao.lat, x.posicao.lng], [p.geo.lat, p.geo.lng]], { color: '#C1121F', weight: 2, opacity: 0.5, dashArray: '5 7' }).addTo(m));
    }
  }
}

/* ---------- página ---------- */
PAGINAS.entregadores = async () => {
  await carregaEntregadores();
  const c = $('#conteudo');
  c.innerHTML = '<div class="pg-w ent"><div class="tiles" id="entTiles"></div><div class="ent-grade"><section class="card ent-mapa-card"><div class="ent-mapa" id="entMapa"></div>' +
    '<p class="nota ent-leg"><span class="lg l-on"></span>em jornada <span class="lg l-fraco"></span>sem sinal há mais de 3 min <span class="lg l-dest"></span>cliente com pedido na rua · o traço azul é o caminho da jornada</p></section>' +
    '<section class="ent-lista"><div class="ent-lista-topo"><h3>Equipe de entrega</h3><button type="button" class="btn prim sm" id="entNovo">+ Cadastrar</button></div><form class="card ent-form" id="entForm" hidden><label class="rot">Nome<input class="campo" id="entNome" maxlength="60" required></label><label class="rot">Celular<input class="campo" id="entFone" maxlength="30" inputmode="tel"></label><div class="linha-form"><button class="btn prim sm" type="submit">Salvar</button><button class="btn sm" type="button" id="entCancela">Cancelar</button></div></form><div id="entCartoes"></div></section></div>' +
    '<section class="card ent-app" id="entApp"></section></div>';
  const w = c.firstElementChild;
  $('#entNovo').addEventListener('click', () => { $('#entForm').hidden = false; $('#entNome').focus(); });
  $('#entCancela').addEventListener('click', () => { $('#entForm').hidden = true; });
  $('#entForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { const x = await api('POST', '/api/entregadores', { nome: $('#entNome').value.trim(), fone: $('#entFone').value.trim() }); $('#entForm').reset(); $('#entForm').hidden = true; await carregaEntregadores(); desenhaEntregadores(); abreEntregador(x.id, true); }
    catch (er) { toast(er.message); }
  });
  w.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ent-acao]');
    if (!b) return;
    const id = +b.dataset.id, a = b.dataset.entAcao;
    if (a === 'ver') { const x = entregadorPorId(id); if (x && x.posicao && ENT.mapa) { ENT.mapa.flyTo([x.posicao.lat, x.posicao.lng], 16, { duration: REDUZ ? 0 : 0.9 }); $('#entMapa').scrollIntoView({ block: 'nearest', behavior: REDUZ ? 'auto' : 'smooth' }); } }
    else if (a === 'parear') abreEntregador(id, true);
    else if (a === 'editar') abreEntregador(id, false);
    else if (a === 'encerrar') { if (confirm('Encerrar a jornada agora? O celular para de mandar a posição.')) api('POST', '/api/entregadores/' + id + '/encerrar').then(() => toast('Jornada encerrada.')).catch((er) => toast(er.message)); }
  });
  desenhaEntregadores();
  await montaMapa();
  clearInterval(ENT.relogio);
  ENT.relogio = setInterval(() => { if (E.rota !== 'entregadores') { clearInterval(ENT.relogio); return; } E.entregadores.forEach(atualizaCartao); }, 15000);
};
function htmlCartaoEnt(x) {
  const [st, txt] = estadoEnt(x);
  const s = x.posicao ? segDesde(x.posicao.em) : null;
  return '<article class="ent-card st-' + st + '" data-card-ent="' + x.id + '"><header><span class="avatar">' + esc(iniciais(x.nome)) + '</span><div><b>' + esc(x.nome) + '</b><small>' + esc(x.fone || 'sem telefone') + '</small></div><span class="ent-st" data-st>' + esc(txt) + '</span></header>' +
    (x.emJornada ? '<p class="ent-sinal" data-sinal><span>' + esc(sinalTxt(s)) + '</span>' + (x.bateria != null ? '<span class="' + (x.bateria < 20 ? 'ruim' : '') + '">bateria ' + Math.round(x.bateria) + '%</span>' : '') + (x.posicao && x.posicao.precisao != null ? '<span>GPS ±' + Math.round(x.posicao.precisao) + ' m</span>' : '') + '<span>' + (x.nativo ? 'app Android' : 'navegador (só com a tela ligada)') + '</span></p>' : '') +
    ((x.entregas || []).length ? '<ul class="ent-entregas">' + x.entregas.map((p) => '<li><button type="button" class="link" data-acao="abrir-pedido" data-id="' + p.id + '">' + esc(p.codigo) + '</button> ' + esc(primeiroNome(p.nome)) + (p.bairro ? ' · ' + esc(p.bairro) : '') + ' <span class="st st-' + p.status + '">' + esc(NOME_STATUS[p.status]) + '</span></li>').join('') + '</ul>' : '') +
    '<p class="ent-hoje">Hoje: <b>' + num(x.hoje ? x.hoje.entregas : 0) + '</b> entrega' + ((x.hoje && x.hoje.entregas) === 1 ? '' : 's') + ' · <b>' + num(x.hoje ? x.hoje.km : 0, 1) + '</b> km rodados</p>' +
    '<footer>' + (x.posicao && x.emJornada ? '<button type="button" class="btn sm" data-ent-acao="ver" data-id="' + x.id + '">Ver no mapa</button>' : '') +
    (x.ativo && !x.pareado ? '<button type="button" class="btn prim sm" data-ent-acao="parear" data-id="' + x.id + '">Parear celular</button>' : '') +
    (x.emJornada ? '<button type="button" class="btn sm" data-ent-acao="encerrar" data-id="' + x.id + '">Encerrar jornada</button>' : '') +
    '<button type="button" class="btn sm" data-ent-acao="editar" data-id="' + x.id + '">Editar</button></footer></article>';
}
function atualizaCartao(x) {
  const el = $('[data-card-ent="' + x.id + '"]');
  if (!el) return;
  const [st, txt] = estadoEnt(x);
  el.className = 'ent-card st-' + st;
  const a = el.querySelector('[data-st]'); if (a) a.textContent = txt;
  const s = el.querySelector('[data-sinal] span'); if (s) s.textContent = sinalTxt(x.posicao ? segDesde(x.posicao.em) : null);
}
function desenhaEntregadores() {
  const box = $('#entCartoes');
  if (!box) return;
  const l = E.entregadores;
  const on = l.filter((x) => x.emJornada), rua = l.reduce((s, x) => s + (x.entregas || []).filter((p) => p.status === 'saiu').length, 0);
  $('#entTiles').innerHTML = tile({ rotulo: 'Em jornada agora', valor: num(on.length), sub: 'de ' + num(l.filter((x) => x.ativo).length) + ' entregadores ativos', heroi: true }) +
    tile({ rotulo: 'Pedidos na rua', valor: num(rua), sub: 'clientes acompanhando a moto no mapa' }) +
    tile({ rotulo: 'Entregas hoje', valor: num(l.reduce((s, x) => s + (x.hoje ? x.hoje.entregas : 0), 0)), sub: 'marcadas como entregues' }) +
    tile({ rotulo: 'Km rodados hoje', valor: num(l.reduce((s, x) => s + (x.hoje ? x.hoje.km : 0), 0), 1), sub: 'somando as jornadas do dia' });
  box.innerHTML = l.length ? l.map(htmlCartaoEnt).join('') : '<p class="vazio grande">Cadastre quem faz as entregas. Cada um instala o app no celular e, durante a jornada, aparece aqui no mapa (e o cliente acompanha a moto).</p>';
  desenhaApp();
  if (ENT.mapa) desenhaCamadas();
}
function urlApp() { const base = (ENT.enderecoApp || location.origin).replace(/\/+$/, ''); return { apk: base + '/motoboy/app.apk', web: base + '/motoboy', base }; }
function desenhaApp() {
  const box = $('#entApp');
  if (!box) return;
  const u = urlApp(), local = /^(localhost|127\.)/.test(new URL(u.base).hostname);
  box.innerHTML = '<div class="ent-app-txt"><h3>App do entregador</h3><p class="nota">Android: o app segue mandando a posição com a tela desligada e com o Waze ou o Maps abertos. iPhone: use a página no navegador (rastreia só com a tela ligada).</p>' +
    (ENT.app ? '<p><a class="btn prim" href="/motoboy/app.apk">' + icone('baixar') + 'Baixar o app (' + num(ENT.app.tamanho / 1024) + ' KB)</a> <a class="btn" href="/motoboy" target="_blank" rel="noopener">Abrir a versão web</a></p><p class="nota">Endereço para o celular: <b>' + esc(u.base) + '</b>' + (local ? ' · <span class="ruim">este endereço só funciona neste computador; abra a gestão pelo IP da rede (ex.: http://192.168.x.x:8090) ou defina ENDERECO_REDE</span>' : '') + '</p>'
      : '<p class="alerta">O instalador do app ainda não foi gerado. Rode <code>node android/gerar-apk.js</code> e reconstrua o container.</p><p><a class="btn" href="/motoboy" target="_blank" rel="noopener">Abrir a versão web</a></p>') + '</div>' +
    '<div class="ent-qr" id="entQr" aria-label="QR code para baixar o app"></div>';
  if (ENT.app) qrEm($('#entQr'), u.apk, 'Aponte a câmera do celular para baixar o app');
}
let qrP = null;
function qrEm(box, texto, legenda) {
  if (!box) return;
  if (!qrP) qrP = new Promise((ok, falha) => { if (window.qrcode) return ok(); const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js'; s.onload = ok; s.onerror = () => { qrP = null; falha(); }; document.head.appendChild(s); });
  qrP.then(() => { const q = window.qrcode(0, 'M'); q.addData(texto); q.make(); box.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }) + (legenda ? '<small>' + esc(legenda) + '</small>' : ''); }).catch(() => { box.innerHTML = '<small>' + esc(texto) + '</small>'; });
}

/* ---------- gaveta do entregador: pareamento e edição ---------- */
async function abreEntregador(id, parear) {
  const x = entregadorPorId(id);
  if (!x) return;
  abreGaveta('entregador', id);
  const g = $('#gaveta');
  g.dataset.ent = String(id);
  g.dataset.pareando = '';
  if (parear && x.ativo) {
    let r;
    try { r = await api('POST', '/api/entregadores/' + id + '/parear'); } catch (e) { g.innerHTML = '<div class="gav-corpo"><p class="alerta">' + esc(e.message) + '</p></div>'; return; }
    if (g.dataset.ent !== String(id)) return;
    g.dataset.pareando = '1';
    const u = urlApp();
    const fim = Date.parse(r.expira);
    g.innerHTML = '<header class="gav-topo"><div><span class="gav-cod">Parear o celular de ' + esc(primeiroNome(x.nome)) + '</span></div><button type="button" class="fechar" data-acao="fechar-gaveta" aria-label="Fechar">×</button></header>' +
      '<div class="gav-corpo par"><ol class="par-passos"><li><b>Instale o app no celular dele</b><span>Aponte a câmera para o QR (Android 8 ou mais novo). Se o celular pedir, permita instalar apps desta fonte.</span><div class="ent-qr" id="parQr"></div></li>' +
      '<li><b>Abra o app e digite o código</b><div class="par-codigo" aria-label="Código de pareamento">' + r.codigo.split('').map((d, i) => '<span style="--i:' + i + '">' + d + '</span>').join('') + '</div><span class="par-vale" id="parVale"></span></li>' +
      '<li><b>Pronto</b><span>Ao iniciar a jornada, o celular manda a posição até ela terminar. O cliente vê a moto só enquanto o pedido dele está na rua.</span></li></ol>' +
      '<p class="nota">Sem Android? No navegador do celular: <b>' + esc(u.web) + '</b> (rastreia só com a tela ligada).</p><div class="par-ok" id="parOk" hidden></div></div>';
    qrEm($('#parQr'), ENT.app ? u.apk : u.web);
    const tic = () => { const v = $('#parVale'); if (!v) return clearInterval(t); const s = Math.max(0, Math.round((fim - Date.now()) / 1000)); v.textContent = s ? 'vale por mais ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') : 'venceu: feche e gere outro'; if (!s) clearInterval(t); };
    const t = setInterval(tic, 1000); tic();
    return;
  }
  g.innerHTML = '<header class="gav-topo"><div class="cli-topo"><span class="avatar lg">' + esc(iniciais(x.nome)) + '</span><div><span class="gav-cod">' + esc(x.nome) + '</span><span class="st">' + esc(estadoEnt(x)[1]) + '</span></div></div><button type="button" class="fechar" data-acao="fechar-gaveta" aria-label="Fechar">×</button></header>' +
    '<div class="gav-corpo"><form class="bloco form" id="entEdita"><h4>Cadastro</h4><label class="rot">Nome<input class="campo" name="nome" value="' + esc(x.nome) + '" maxlength="60" required></label><label class="rot">Celular<input class="campo" name="fone" value="' + esc(x.fone) + '" maxlength="30"></label>' +
    '<label class="check"><input type="checkbox" name="ativo"' + (x.ativo ? ' checked' : '') + '> Ativo (desativar encerra a jornada e tira o acesso do celular)</label><div class="linha-form"><button class="btn prim" type="submit">Salvar</button></div></form>' +
    '<section class="bloco"><h4>Celular</h4>' + (x.pareado ? '<p>Pareado' + (x.aparelho ? ': ' + esc(x.aparelho) : '') + (x.pareadoEm ? ' em ' + esc(dataBR(String(x.pareadoEm).slice(0, 10))) : '') + '.</p><div class="linha-form"><button type="button" class="btn" id="entTroca">Parear outro celular</button><button type="button" class="btn perigo" id="entDespareia">Tirar o acesso deste celular</button></div>'
      : '<p>Nenhum celular pareado.</p><button type="button" class="btn prim" id="entTroca">Parear celular</button>') + '</section></div>';
  $('#entEdita').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try { await api('PATCH', '/api/entregadores/' + id, { nome: f.nome.value.trim(), fone: f.fone.value.trim(), ativo: f.ativo.checked }); toast('Salvo.'); await carregaEntregadores(); if (E.rota === 'entregadores') desenhaEntregadores(); fechaGaveta(); } catch (er) { toast(er.message); }
  });
  $('#entTroca').addEventListener('click', () => abreEntregador(id, true));
  const dp = $('#entDespareia');
  if (dp) dp.addEventListener('click', async () => { if (!confirm('Tirar o acesso do celular de ' + x.nome + '? A jornada é encerrada e o app pede um código novo.')) return; try { await api('DELETE', '/api/entregadores/' + id + '/aparelho'); toast('Acesso retirado.'); fechaGaveta(); } catch (er) { toast(er.message); } });
}
function desenhaPareado(x) {
  const ok = $('#parOk');
  if (!ok) return;
  ok.hidden = false;
  ok.innerHTML = '<svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="23"/><path d="M15 27l7 7 15-16"/></svg><b>Celular pareado!</b><span>' + esc(x.aparelho || 'Pronto para a jornada') + '</span>';
  $$('.par-passos', $('#gaveta')).forEach((l) => l.classList.add('feito'));
  $('#gaveta').dataset.pareando = '';
}
