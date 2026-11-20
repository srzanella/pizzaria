/* Gestão — estrutura (menu, rotas, login), operação ao vivo, lista de pedidos, clientes (CRM) e gavetas de detalhe. */
const REDUZ = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ICO = {
  aovivo: '<path d="M4 12h3l2-6 4 12 2-6h5"/>',
  pedidos: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  clientes: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.6c2 .7 3.2 2.5 3.5 5.4"/>',
  visao: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  vendas: '<path d="M3 20h18M6 16l4-5 3 3 5-7"/><path d="M15 7h3v3"/>',
  regioes: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  produtos: '<circle cx="12" cy="12" r="9"/><path d="M12 3v9l6.5 6.2M12 12 5.6 18.4"/><circle cx="9" cy="8.5" r="1"/><circle cx="15" cy="10" r="1"/><circle cx="10" cy="15" r="1"/>',
  operacao: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>',
  fechamento: '<path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h8M8 17h5"/>',
  configuracoes: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  zap: '<path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3z"/><path d="M9 8.3c.2-.4.4-.4.7-.4h.4c.2 0 .4 0 .5.4l.7 1.6c.1.2 0 .4-.1.6l-.5.6c-.1.2-.2.3 0 .6.5.9 1.3 1.6 2.2 2.1.3.1.4.1.6-.1l.6-.7c.2-.2.3-.2.6-.1l1.6.7c.3.1.4.3.4.5 0 .9-.6 1.8-1.6 1.9-1 .1-2.8-.3-4.6-2s-2.3-3.3-2.2-4.3c0-.5.3-1 .7-1.4z"/>',
  moto: '<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M9 17h5l3-7h-4M6 14l3-5h4"/>',
  loja: '<path d="M4 10v10h16V10M3 10l2-6h14l2 6zM9 20v-6h6v6"/>',
  imprimir: '<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z"/>',
  busca: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  baixar: '<path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v3h16v-3"/>'
};
const icone = (k, cls) => '<svg class="ico' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + ICO[k] + '</svg>';
const NAV = [
  ['Operação', [['aovivo', 'Ao vivo'], ['pedidos', 'Pedidos'], ['clientes', 'Clientes']]],
  ['Negócio', [['visao', 'Visão geral'], ['vendas', 'Vendas'], ['regioes', 'Regiões'], ['produtos', 'Produtos'], ['operacao', 'Operação'], ['fechamento', 'Fechamento do dia']]],
  ['', [['configuracoes', 'Configurações']]]
];
const TITULOS = { aovivo: 'Pedidos ao vivo', pedidos: 'Todos os pedidos', clientes: 'Clientes', visao: 'Visão geral', vendas: 'Vendas', regioes: 'Regiões e cidades', produtos: 'Produtos', operacao: 'Operação e tempos', fechamento: 'Fechamento do dia', configuracoes: 'Configurações' };
const COM_PERIODO = new Set(['pedidos', 'visao', 'vendas', 'regioes', 'produtos', 'operacao']);
const PAGINAS = {};
const nomeLoja = () => (D.config && D.config.nome) || 'Pizzaria';
const toast = (msg) => { const t = $('#toast'); if (!t) return; t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2800); };
function chaveCliente(nome, fone) {
  let d = String(fone || '').replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  if (d.length >= 10) return d.slice(0, 2) + d.slice(-8);
  return 'nome:' + semAcento(nome).trim().replace(/\s+/g, ' ');
}
const foneZap = (fone) => { const d = String(fone || '').replace(/\D/g, ''); return d.length >= 10 ? (d.length <= 11 ? '55' + d : d) : null; };
function baixaCSV(nome, cab, linhas) {
  const cel = (v) => { const s = String(v == null ? '' : v); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const blob = new Blob(['﻿' + [cab.join(';')].concat(linhas.map((l) => l.map(cel).join(';'))).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const dec = (v) => (Math.round((v || 0) * 100) / 100).toFixed(2).replace('.', ',');
function imprimir(html, classe) {
  let box = $('#impressao');
  if (!box) { box = document.createElement('div'); box.id = 'impressao'; document.body.appendChild(box); }
  box.className = classe || ''; box.innerHTML = html;
  document.documentElement.classList.add('imprimindo');
  const limpa = () => { document.documentElement.classList.remove('imprimindo'); window.removeEventListener('afterprint', limpa); };
  window.addEventListener('afterprint', limpa);
  setTimeout(() => { window.print(); setTimeout(limpa, 1500); }, 60);
}

/* ======================= estrutura ======================= */
function telaLogin(msg) {
  $('#raiz').innerHTML = '<main class="login"><form class="login-card" id="fLogin"><img src="' + LOGOS.v + '" alt="' + esc(nomeLoja()) + '"><h1>Gestão</h1><p>Pedidos, clientes e números do negócio.</p>' +
    '<label>Usuário<input id="lUser" autocomplete="username" required></label><label>Senha<input id="lPass" type="password" autocomplete="current-password" required></label>' +
    '<p class="erro" id="lErro" role="alert">' + esc(msg || '') + '</p><button class="btn prim grande" type="submit">Entrar</button><a class="link" href="/">Ir para o site</a></form></main>';
  $('#lUser').focus();
  $('#fLogin').addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = e.target.querySelector('button'); b.disabled = true;
    try { await api('POST', '/api/login', { login: $('#lUser').value.trim(), senha: $('#lPass').value }); location.reload(); }
    catch (er) { $('#lErro').textContent = er.status === 401 ? 'Usuário ou senha incorretos.' : er.message; b.disabled = false; }
  });
}
function montaApp() {
  $('#raiz').innerHTML = '<div class="app" id="app">' +
    '<aside class="lateral" id="lateral" aria-label="Menu"><div class="marca"><img src="' + LOGOS.h + '" alt="' + esc(nomeLoja()) + '"><span>Gestão</span></div><nav>' +
    NAV.map(([g, itens]) => '<div class="nav-grupo">' + (g ? '<span class="nav-tit">' + esc(g) + '</span>' : '') + itens.map(([id, n]) => '<a class="nav-item" href="#/' + id + '" data-rota="' + id + '">' + icone(id) + '<span>' + esc(n) + '</span>' + (id === 'aovivo' ? '<b class="nav-badge" id="badgeNovos" hidden></b>' : '') + '</a>').join('') + '</div>').join('') +
    '</nav><div class="lateral-pe"><a href="/" target="_blank" rel="noopener">Ver o site ↗</a><a href="/#portal" target="_blank" rel="noopener">Cardápio e horários ↗</a></div></aside>' +
    '<div class="principal"><header class="topo"><button type="button" class="menu-btn" id="menuBtn" aria-label="Abrir o menu" aria-expanded="false"><i></i><i></i><i></i></button><h1 id="titulo"></h1>' +
    '<div class="topo-acoes"><div id="periodoBox"></div><span class="vivo off" id="vivo" role="status"><i aria-hidden="true"></i><span>conectando…</span></span>' +
    '<a class="btn prim" href="/#balcao" id="btnNovo">+ Novo pedido</a>' +
    '<div class="usuario"><button type="button" class="usuario-btn" id="userBtn" aria-haspopup="menu" aria-expanded="false"><span class="avatar">' + esc(iniciais(E.usuario.nome)) + '</span><span class="usuario-nome">' + esc(E.usuario.nome) + '</span></button><div class="menu" id="userMenu" role="menu" hidden><button type="button" role="menuitem" data-acao="rota" data-valor="configuracoes/senha">Minha senha</button><button type="button" role="menuitem" data-acao="sair">Sair</button></div></div></div></header>' +
    '<div class="faixa-demo" id="faixaDemo" hidden></div><main class="conteudo" id="conteudo" tabindex="-1"></main></div>' +
    '<div class="veu" id="veu" hidden></div><aside class="gaveta" id="gaveta" hidden aria-label="Detalhes"></aside>' +
    '<div class="toast-zap" id="toastZap" hidden role="status"></div><div class="toast" id="toast" role="status"></div><div class="sr" id="avisoVivo" aria-live="polite"></div></div>';
  ligaDicas(document.body);
  ligaEstrutura();
  faixaDemo();
}
function faixaDemo() {
  const f = $('#faixaDemo');
  if (!f) return;
  f.hidden = !E.demo;
  f.innerHTML = '<span><b>Dados de demonstração</b> · ' + num(E.demo) + ' pedidos fictícios dos últimos 90 dias estão somados às análises.</span>' + (E.usuario.admin ? '<a class="link" href="#/configuracoes">remover em Configurações</a>' : '');
}
function ligaEstrutura() {
  const app = $('#app');
  $('#menuBtn').addEventListener('click', () => { const on = !app.classList.contains('menu-aberto'); app.classList.toggle('menu-aberto', on); $('#menuBtn').setAttribute('aria-expanded', on); });
  $('#lateral').addEventListener('click', (e) => { if (e.target.closest('a')) app.classList.remove('menu-aberto'); });
  $('#userBtn').addEventListener('click', () => { const m = $('#userMenu'); m.hidden = !m.hidden; $('#userBtn').setAttribute('aria-expanded', !m.hidden); });
  document.addEventListener('click', (e) => { if (!e.target.closest('.usuario')) { const m = $('#userMenu'); if (m) m.hidden = true; } if (!e.target.closest('.periodo')) { const p = $('.periodo-menu'); if (p) p.hidden = true; } });
  app.addEventListener('pointerdown', liberaAudio, { once: true });
  $('#veu').addEventListener('click', fechaGaveta);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (!$('#gaveta').hidden) fechaGaveta(); app.classList.remove('menu-aberto'); } });
  // ações por delegação (botões com data-acao em qualquer página, gaveta ou aviso)
  document.addEventListener('click', async (e) => {
    const alt = e.target.closest('[data-alterna]');
    if (alt) {
      const card = alt.closest('.card'); const tab = !card.classList.contains('mostra-tabela');
      card.classList.toggle('mostra-tabela', tab); $('.vista-graf', card).hidden = tab; $('.vista-tab', card).hidden = !tab;
      alt.textContent = tab ? 'ver gráfico' : 'ver em tabela'; alt.setAttribute('aria-pressed', tab); return;
    }
    const a = e.target.closest('[data-acao]');
    if (!a) return;
    const acao = a.dataset.acao;
    if (ACOES[acao]) { e.preventDefault(); ACOES[acao](a, e); }
  });
  window.addEventListener('hashchange', rota);
}
const ACOES = {
  sair: async () => { try { await api('POST', '/api/logout', {}); } catch (e) { /* já saiu */ } location.reload(); },
  'abrir-pedido': (a) => abrePedido(+a.dataset.id),
  'abrir-cliente': (a) => abreCliente(a.dataset.chave),
  'fechar-gaveta': () => fechaGaveta(),
  'fechar-toast': () => { $('#toastZap').hidden = true; },
  avancar: async (a) => { a.disabled = true; const p = await muda(+a.dataset.id, { status: a.dataset.para }); if (p) ofereceAviso(p); else a.disabled = false; },
  'nao-veio': async (a) => { if (confirm('Cancelar este pedido? Use quando a mensagem do cliente não chegou no WhatsApp.')) await muda(+a.dataset.id, { status: 'cancelado', motivo: 'mensagem não chegou no WhatsApp' }); },
  cancelar: async (a) => { const m = prompt('Motivo do cancelamento (o cliente vê):', ''); if (m !== null) { const p = await muda(+a.dataset.id, { status: 'cancelado', motivo: m }); if (p) ofereceAviso(p); } },
  zap: (a) => { const p = pedidoEmCache(+a.dataset.id); const l = p && linkZapCliente(p); if (l) window.open(l, '_blank', 'noopener'); },
  comanda: (a) => { const p = pedidoEmCache(+a.dataset.id); if (p) imprimir(htmlComanda(p), 'comanda'); },
  'copiar-link': (a) => { const p = pedidoEmCache(+a.dataset.id); if (!p) return; const l = linkAcompanhamento(p); (navigator.clipboard ? navigator.clipboard.writeText(l) : Promise.reject()).then(() => toast('Link copiado.'), () => prompt('Copie o link:', l)); },
  rota: (a) => { location.hash = '#/' + a.dataset.valor; }
};

/* ---------- rotas ---------- */
function rota() {
  const [, nome, param] = (location.hash.match(/^#\/([a-z]+)(?:\/(.+))?$/) || []);
  if (nome === 'ajustes') { location.replace('#/configuracoes' + (param ? '/' + param : '')); return; } // nome antigo da página
  const r = TITULOS[nome] ? nome : 'aovivo';
  E.rota = r; E.param = param ? decodeURIComponent(param) : '';
  $$('.nav-item').forEach((a) => a.setAttribute('aria-current', a.dataset.rota === r ? 'page' : 'false'));
  $('#titulo').textContent = TITULOS[r];
  document.title = TITULOS[r] + ' · Gestão · ' + nomeLoja();
  desenhaPeriodo();
  const c = $('#conteudo');
  c.className = 'conteudo pg-' + r;
  c.innerHTML = '<p class="carregando">Carregando…</p>';
  Promise.resolve(PAGINAS[r]()).catch((e) => {
    if (e && e.status === 401) { telaLogin('Sua sessão expirou. Entre de novo.'); return; }
    c.innerHTML = '<div class="alerta">Não deu para carregar: ' + esc(e && e.message) + ' <button type="button" class="link" onclick="location.reload()">tentar de novo</button></div>';
  });
  if (E.rota === 'aovivo') { E.naoVistos = 0; atualizaTitulo(); }
}
function rerender() { if (E.rota) PAGINAS[E.rota](); }

/* ---------- seletor de período ---------- */
function desenhaPeriodo() {
  const box = $('#periodoBox');
  if (!COM_PERIODO.has(E.rota)) { box.innerHTML = ''; return; }
  const per = intervalo(E.periodo);
  box.innerHTML = '<div class="periodo"><button type="button" class="btn periodo-btn" aria-haspopup="true">' + esc(per.rotulo) + ' <small>' + esc(dataCurta(per.de)) + (per.n > 1 ? ' – ' + esc(dataCurta(per.ate)) : '') + '</small></button>' +
    '<div class="periodo-menu" hidden>' + PERIODOS.filter(([id]) => id !== 'custom').map(([id, n]) => '<button type="button" data-per="' + id + '"' + (E.periodo === id ? ' aria-current="true"' : '') + '>' + esc(n) + '</button>').join('') +
    '<div class="periodo-custom"><span>Personalizado</span><input type="date" class="campo" id="perDe" value="' + esc((E.custom && E.custom.de) || per.de) + '" max="' + E.hoje + '"><input type="date" class="campo" id="perAte" value="' + esc((E.custom && E.custom.ate) || per.ate) + '" max="' + E.hoje + '"><button type="button" class="btn sm" data-per="custom">Aplicar</button></div></div></div>';
  const b = $('.periodo-btn', box), m = $('.periodo-menu', box);
  b.addEventListener('click', () => { m.hidden = !m.hidden; });
  m.addEventListener('click', (e) => {
    const x = e.target.closest('[data-per]');
    if (!x) return;
    if (x.dataset.per === 'custom') {
      const de = $('#perDe').value, ate = $('#perAte').value;
      if (!de || !ate || de > ate) { toast('Escolha um início antes do fim.'); return; }
      if (difDias(de, ate) > 180) { toast('Período máximo de 180 dias.'); return; }
      E.custom = { de, ate }; pref.set('custom', E.custom);
    }
    E.periodo = x.dataset.per; pref.set('periodo', E.periodo);
    m.hidden = true; desenhaPeriodo(); rerender();
  });
}

/* ======================= tempo real ======================= */
let audio = null;
function liberaAudio() { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); } catch (e) { audio = null; } }
function bip() {
  if (!E.som || !audio) return;
  try {
    const t0 = audio.currentTime + 0.02;
    [[784, 0], [1047, 0.15], [1319, 0.3]].forEach(([f, d]) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + d); g.gain.exponentialRampToValueAtTime(0.3, t0 + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.26);
      o.connect(g); g.connect(audio.destination); o.start(t0 + d); o.stop(t0 + d + 0.3);
    });
  } catch (e) { /* sem áudio */ }
}
const tituloBase = () => TITULOS[E.rota] + ' · Gestão · ' + nomeLoja();
function atualizaTitulo() { document.title = E.naoVistos > 0 && document.hidden ? '(' + E.naoVistos + ') Novo pedido · ' + nomeLoja() : tituloBase(); }
document.addEventListener('visibilitychange', () => { if (!document.hidden) { E.naoVistos = 0; atualizaTitulo(); } });
async function carregaVivo() {
  const j = await api('GET', '/api/pedidos?dia=' + E.hoje);
  E.vivo = new Map(j.pedidos.map((p) => [p.id, p]));
  E.vivoCarregado = true;
  badgeNovos();
}
function conecta() {
  if (E.fonte) return;
  const f = new EventSource('/api/eventos');
  E.fonte = f;
  f.addEventListener('ola', (e) => {
    const d = JSON.parse(e.data);
    const virou = d.dia !== E.hoje;
    E.aoVivo = true; marcaVivo();
    if (virou) { E.hoje = d.dia; E.analise.clear(); }
    if (E.jaConectou || virou) carregaVivo().then(() => { if (E.rota === 'aovivo' || E.rota === 'visao') rerender(); }).catch(() => {});
    E.jaConectou = true;
  });
  f.addEventListener('novo', (e) => recebe(JSON.parse(e.data), true));
  f.addEventListener('atualizado', (e) => recebe(JSON.parse(e.data), false));
  f.addEventListener('posicao', (e) => aoPosicao(JSON.parse(e.data)));
  f.addEventListener('entregador', (e) => aoEntregador(JSON.parse(e.data)));
  f.onerror = () => { E.aoVivo = false; marcaVivo(); if (f.readyState === 2) { E.fonte = null; setTimeout(() => api('GET', '/api/eu').then((j) => (j.usuario ? conecta() : telaLogin('Sua sessão expirou. Entre de novo.'))).catch(() => setTimeout(conecta, 5000)), 3000); } };
}
function marcaVivo() { const v = $('#vivo'); if (!v) return; v.classList.toggle('off', !E.aoVivo); v.lastChild.textContent = E.aoVivo ? 'ao vivo' : 'reconectando…'; }
function recebe(p, novo) {
  if (p.dia === E.hoje) E.vivo.set(p.id, p);
  invalidaAnalises();
  if (novo) {
    E.recentes.add(p.id); bip();
    if (document.hidden) { E.naoVistos++; atualizaTitulo(); }
    if (E.notif && 'Notification' in window && Notification.permission === 'granted' && document.hidden) {
      try { new Notification('Novo pedido ' + p.codigo, { body: primeiroNome(p.cliente.nome) + ' · ' + brl(p.total) + ' · ' + (p.modo === 'entrega' ? 'entrega' : 'retirada'), tag: 'pedido-' + p.id }); } catch (e) { /* sem suporte */ }
    }
    $('#avisoVivo').textContent = 'Novo pedido ' + p.codigo + ' de ' + primeiroNome(p.cliente.nome) + ', ' + brl(p.total) + '.';
  }
  badgeNovos();
  if (E.rota === 'aovivo') desenhaQuadro();
  const g = $('#gaveta');
  if (!g.hidden && g.dataset.pedido === String(p.id)) desenhaPedido(p);
}
function badgeNovos() {
  const n = Array.from(E.vivo.values()).filter((p) => p.status === 'novo').length;
  const b = $('#badgeNovos');
  if (b) { b.hidden = !n; b.textContent = n; }
}

/* ======================= pedidos: ações comuns ======================= */
const PROXIMO = (p) => ({ novo: 'preparo', preparo: 'forno', forno: p.modo === 'entrega' ? 'saiu' : 'pronto', saiu: 'concluido', pronto: 'concluido' }[p.status] || null);
const rotuloAcao = (p, st) => ({ preparo: 'Confirmar', forno: 'Pôr no forno', saiu: 'Saiu p/ entrega', pronto: 'Pronto p/ retirar', concluido: p.modo === 'entrega' ? 'Entregue' : 'Retirado' }[st] || NOME_STATUS[st]);
const cachePedidos = new Map();
const pedidoEmCache = (id) => E.vivo.get(id) || cachePedidos.get(id);
async function muda(id, campos) {
  try {
    const p = await api('PATCH', '/api/pedidos/' + id, campos);
    cachePedidos.set(p.id, p);
    if (p.dia === E.hoje) E.vivo.set(p.id, p);
    invalidaAnalises(); badgeNovos();
    if (E.rota === 'aovivo') desenhaQuadro();
    const g = $('#gaveta');
    if (!g.hidden && g.dataset.pedido === String(p.id)) desenhaPedido(p);
    return p;
  } catch (e) { if (e.status === 401) telaLogin('Sua sessão expirou. Entre de novo.'); else toast(e.message); return null; }
}
const linkAcompanhamento = (p) => (p.origem ? p.origem.replace(/\/$/, '') + '/' : location.origin + '/') + '#acompanhar/' + p.token;
function mensagemStatus(p, st) {
  const nome = primeiroNome(p.cliente && p.cliente.nome), link = linkAcompanhamento(p);
  const prev = p.previsao ? ' Previsão: até ' + hhmm(p.previsao) + '.' : '';
  return ({
    novo: 'Oi, ' + nome + '! Recebemos seu pedido ' + p.codigo + ' 🍕 Já já confirmamos por aqui.',
    preparo: 'Oi, ' + nome + '! Seu pedido ' + p.codigo + ' foi confirmado e já está sendo preparado 🍕' + prev + '\nAcompanhe: ' + link,
    forno: nome + ', seu pedido ' + p.codigo + ' está no forno! 🔥' + prev + '\nAcompanhe: ' + link,
    saiu: nome + ', seu pedido ' + p.codigo + ' saiu para entrega! 🛵' + (p.entregador ? ' Quem leva é o ' + p.entregador + '.' : '') + prev + '\nAcompanhe: ' + link,
    pronto: nome + ', seu pedido ' + p.codigo + ' está pronto para retirada 🍕\nEstamos em ' + ((D.config || {}).endereco || 'nosso balcão') + '.',
    concluido: 'Obrigado pela preferência, ' + nome + '! Bom apetite 🍕\nSe puder, conta pra gente o que achou.',
    cancelado: nome + ', seu pedido ' + p.codigo + ' foi cancelado' + (p.motivo ? ' (' + p.motivo + ')' : '') + '. Qualquer dúvida é só chamar por aqui.'
  })[st || p.status];
}
const linkZapCliente = (p, st) => { const n = foneZap(p.cliente && p.cliente.fone); return n ? 'https://wa.me/' + n + '?text=' + encodeURIComponent(mensagemStatus(p, st)) : null; };
function ofereceAviso(p) {
  if (!p || p.status === 'novo' || !linkZapCliente(p)) return;
  const t = $('#toastZap');
  const tt = $('#toast'); if (tt) tt.classList.remove('on'); // um aviso por vez no mesmo lugar
  t.innerHTML = '<span>' + esc(p.codigo) + ': ' + esc(NOME_STATUS[p.status].toLowerCase()) + '</span><a class="btn zap sm" href="' + esc(linkZapCliente(p)) + '" target="_blank" rel="noopener">' + icone('zap') + 'Avisar ' + esc(primeiroNome(p.cliente.nome)) + '</a><button type="button" class="link claro" data-acao="fechar-toast">ok</button>';
  t.hidden = false;
  clearTimeout(ofereceAviso.t); ofereceAviso.t = setTimeout(() => { t.hidden = true; }, 9000);
}
function pagamentoTexto(p) {
  const pg = p.pagamento || {};
  let t = NOME_PAG[pg.forma] || 'A combinar';
  if (pg.forma === 'dinheiro') t += pg.semTroco ? ' · sem troco' : pg.trocoPara ? ' · troco p/ ' + brl(pg.trocoPara) + ' (levar ' + brl(Math.max(0, pg.trocoPara - p.total)) + ')' : '';
  return t;
}
const enderecoTexto = (p) => { const e = p.endereco; if (!e) return ''; return [[e.rua, e.numero].filter(Boolean).join(', '), e.compl, e.bairro, e.cidade].filter(Boolean).join(' - ') + (e.cep ? ' · CEP ' + e.cep : ''); };
const resumoItens = (p) => (p.itens || []).map((i) => i.qtd + 'x ' + i.nome + (i.detalhe ? ' — ' + i.detalhe : '')).join(' · ');
// o servidor refez a conta do pedido do site com o cardápio e algo não bateu (precos.js)
function htmlConferencia(p) {
  const c = p.conferencia;
  if (!c) return '';
  const s = c.site || {}, v = c.servidor || {};
  return '<section class="bloco conf' + (c.valeOServidor ? ' vale' : '') + '" role="note"><h4><span aria-hidden="true">⚠</span> ' + (c.valeOServidor ? 'Valor corrigido pelo cardápio' : 'Confira este pedido') + '</h4>' +
    (c.valeOServidor ? '<p>O site mostrou ao cliente <b>' + brl(s.total) + '</b>, mas pelo cardápio o pedido dá <b>' + brl(v.total) + '</b>. Aqui vale o valor do cardápio: combine com o cliente antes de confirmar.</p>' : '<p>O total bate com o cardápio, mas o sistema notou:</p>') +
    '<ul>' + (c.motivos || []).map((m) => '<li>' + esc(m) + '</li>').join('') + '</ul></section>';
}
function htmlComanda(p) {
  let h = '<div class="cmd"><b class="cmd-loja">' + esc(nomeLoja()) + '</b><div class="cmd-cod">' + esc(p.codigo) + '</div><div>' + esc(dataBR(p.dia)) + ' · ' + hhmm(p.criadoEm) + ' · ' + esc(NOME_CANAL[p.canal] || p.canal) + '</div>';
  h += '<div class="cmd-modo">' + (p.modo === 'entrega' ? 'ENTREGA' + (p.km != null ? ' · ' + num(p.km, 1) + ' km' : '') : 'RETIRADA') + '</div><hr>';
  (p.itens || []).forEach((i) => { h += '<div class="cmd-item"><b>' + i.qtd + 'x ' + esc(i.nome) + '</b>' + (i.detalhe ? '<div>' + esc(i.detalhe) + '</div>' : '') + (i.obs ? '<div>Obs.: ' + esc(i.obs) + '</div>' : '') + '</div>'; });
  h += '<hr><div class="cmd-v"><span>Subtotal</span><span>' + brl(p.subtotal) + '</span></div>' + (p.desconto ? '<div class="cmd-v"><span>Desconto</span><span>−' + brl(p.desconto) + '</span></div>' : '') + (p.modo === 'entrega' ? '<div class="cmd-v"><span>Entrega</span><span>' + (p.freteGratis ? 'grátis' : brl(p.taxa)) + '</span></div>' : '');
  h += '<div class="cmd-v cmd-total"><span>TOTAL</span><span>' + brl(p.total) + '</span></div><div>' + esc(pagamentoTexto(p)) + (p.pago ? ' · PAGO' : '') + '</div><hr>';
  h += '<div><b>' + esc(p.cliente.nome) + '</b>' + (p.cliente.fone ? ' · ' + esc(p.cliente.fone) : '') + '</div>' + (p.endereco ? '<div>' + esc(enderecoTexto(p)) + '</div>' + (p.endereco.ref ? '<div>Ref.: ' + esc(p.endereco.ref) + '</div>' : '') : '');
  if (p.obs) h += '<hr><div><b>Obs.:</b> ' + esc(p.obs) + '</div>';
  return h + '</div>';
}

/* ======================= gaveta (detalhe de pedido / perfil de cliente) ======================= */
function abreGaveta(tipo, chave) {
  const g = $('#gaveta'), v = $('#veu');
  g.dataset.tipo = tipo; g.dataset.pedido = tipo === 'pedido' ? String(chave) : ''; g.dataset.cliente = tipo === 'cliente' ? chave : '';
  g.hidden = false; v.hidden = false;
  g.innerHTML = '<p class="carregando">Carregando…</p>';
  requestAnimationFrame(() => { g.classList.add('on'); v.classList.add('on'); });
  abreGaveta.foco = document.activeElement;
}
function fechaGaveta() {
  const g = $('#gaveta'), v = $('#veu');
  g.classList.remove('on'); v.classList.remove('on');
  setTimeout(() => { if (!g.classList.contains('on')) { g.hidden = true; v.hidden = true; g.innerHTML = ''; } }, 300);
  if (abreGaveta.foco && abreGaveta.foco.focus && document.contains(abreGaveta.foco)) abreGaveta.foco.focus();
}
async function abrePedido(id) {
  abreGaveta('pedido', id);
  let p = pedidoEmCache(id);
  try { p = await api('GET', '/api/pedidos/' + id); cachePedidos.set(id, p); } catch (e) { if (!p) { $('#gaveta').innerHTML = '<div class="gav-corpo"><p class="alerta">' + esc(e.message) + '</p></div>'; return; } }
  if ($('#gaveta').dataset.pedido === String(id)) desenhaPedido(p);
}
function desenhaPedido(p) {
  const g = $('#gaveta');
  const foco = document.activeElement;
  if (foco && g.contains(foco) && /INPUT|TEXTAREA/.test(foco.tagName)) return; // não atrapalha quem digita
  cachePedidos.set(p.id, p);
  const prox = PROXIMO(p), zap = linkZapCliente(p);
  const mapa = p.endereco ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(enderecoTexto(p).replace(/ · CEP.*/, '')) : null;
  const opcoes = Object.keys(NOME_STATUS).filter((s) => !(s === 'saiu' && p.modo !== 'entrega') && !(s === 'pronto' && p.modo !== 'retirada'));
  const chave = chaveCliente(p.cliente.nome, p.cliente.fone);
  g.innerHTML = '<header class="gav-topo"><div><span class="gav-cod">' + esc(p.codigo) + '</span><span class="st st-' + p.status + '">' + esc(NOME_STATUS[p.status]) + '</span>' + (p.demo ? '<span class="st demo">demonstração</span>' : '') + '</div><button type="button" class="fechar" data-acao="fechar-gaveta" aria-label="Fechar">×</button></header>' +
    '<div class="gav-corpo"><p class="gav-sub">' + esc(dataBR(p.dia)) + ' · ' + hhmm(p.criadoEm) + ' · ' + esc(NOME_CANAL[p.canal] || p.canal) + ' · ' + (p.modo === 'entrega' ? 'Entrega' + (p.km != null ? ' (' + num(p.km, 1) + ' km)' : '') : 'Retirada no balcão') + '</p>' +
    '<div class="gav-acoes">' + (prox ? '<button type="button" class="btn prim" data-acao="avancar" data-id="' + p.id + '" data-para="' + prox + '">' + esc(rotuloAcao(p, prox)) + '</button>' : '') +
    (zap ? '<a class="btn zap" href="' + esc(zap) + '" target="_blank" rel="noopener">' + icone('zap') + 'Avisar: ' + esc(NOME_STATUS[p.status].toLowerCase()) + '</a>' : '') +
    '<button type="button" class="btn" data-acao="comanda" data-id="' + p.id + '">' + icone('imprimir') + 'Comanda</button></div>' +
    htmlConferencia(p) +
    '<section class="bloco"><h4>Cliente</h4><p><button type="button" class="link forte" data-acao="abrir-cliente" data-chave="' + esc(chave) + '">' + esc(p.cliente.nome) + '</button>' + (p.cliente.fone ? ' · <a href="https://wa.me/' + esc(foneZap(p.cliente.fone) || '') + '" target="_blank" rel="noopener">' + esc(p.cliente.fone) + '</a>' : '') + '</p>' +
    (p.endereco ? '<p>' + esc(enderecoTexto(p)) + (mapa ? ' · <a href="' + esc(mapa) + '" target="_blank" rel="noopener">mapa</a>' : '') + '</p>' + (p.endereco.ref ? '<p>Ref.: ' + esc(p.endereco.ref) + '</p>' : '') : '') + '</section>' +
    '<section class="bloco"><h4>Itens</h4><ul class="itens">' + (p.itens || []).map((i) => '<li><span><b>' + i.qtd + 'x ' + esc(i.nome) + '</b>' + (i.detalhe ? '<small>' + esc(i.detalhe) + '</small>' : '') + (i.obs ? '<small class="obs">Obs.: ' + esc(i.obs) + '</small>' : '') + '</span><span>' + brl(i.valor) + '</span></li>').join('') + '</ul>' +
    ((p.promocoes || []).length ? '<p class="promo">' + p.promocoes.map((x) => esc(x.nome) + (x.brinde ? ': ' + esc(x.brinde) + ' grátis' : x.valor ? ': −' + brl(x.valor) : '')).join(' · ') + '</p>' : '') +
    '<dl class="valores"><dt>Subtotal</dt><dd>' + brl(p.subtotal) + '</dd>' + (p.desconto ? '<dt>Desconto</dt><dd>−' + brl(p.desconto) + '</dd>' : '') + (p.modo === 'entrega' ? '<dt>Entrega</dt><dd>' + (p.freteGratis ? 'grátis' : brl(p.taxa)) + '</dd>' : '') + '<dt>Total</dt><dd><b>' + brl(p.total) + '</b></dd></dl><p>' + esc(pagamentoTexto(p)) + '</p>' + (p.obs ? '<p class="obs">Obs. do cliente: ' + esc(p.obs) + '</p>' : '') + '</section>' +
    '<section class="bloco form"><h4>Controle</h4><label class="check"><input type="checkbox" data-campo="pago"' + (p.pago ? ' checked' : '') + '> Pagamento recebido</label>' +
    '<div class="duas"><label class="rot">Status<select class="campo" data-campo="status">' + opcoes.map((s) => '<option value="' + s + '"' + (s === p.status ? ' selected' : '') + '>' + esc(NOME_STATUS[s]) + '</option>').join('') + '</select></label>' +
    '<label class="rot">Previsão<select class="campo" data-campo="previsaoMin"><option value="">' + (p.previsao ? 'até ' + hhmm(p.previsao) : 'sem previsão') + '</option>' + [15, 20, 30, 40, 50, 60, 75, 90].map((m) => '<option value="' + m + '">daqui a ' + m + ' min</option>').join('') + '<option value="0">remover</option></select></label></div>' +
    (p.modo === 'entrega' ? campoEntregador(p) : '') +
    '<label class="rot">Anotação interna<textarea class="campo" data-campo="obsInterna" maxlength="1000" placeholder="Só a equipe vê">' + esc(p.obsInterna || '') + '</textarea></label>' +
    (p.status !== 'cancelado' ? '<button type="button" class="link perigo" data-acao="cancelar" data-id="' + p.id + '">Cancelar pedido</button>' : '<p class="obs">Cancelado' + (p.motivo ? ': ' + esc(p.motivo) : '') + '</p>') + '</section>' +
    '<section class="bloco"><h4>Linha do tempo</h4><ol class="linha-tempo">' + (p.historico || []).map((h) => '<li><b>' + esc(NOME_STATUS[h.status] || h.status) + '</b><span>' + hhmm(h.em) + (h.por && h.por !== 'cliente' ? ' · ' + esc(h.por) : '') + '</span></li>').join('') + '</ol></section>' +
    '<section class="bloco"><h4>Acompanhamento do cliente</h4><p><a href="' + esc(linkAcompanhamento(p)) + '" target="_blank" rel="noopener">abrir a página do cliente</a> · <button type="button" class="link" data-acao="copiar-link" data-id="' + p.id + '">copiar link</button></p></section></div>' +
    '<datalist id="listaEntregadores">' + Array.from(new Set(Array.from(E.vivo.values()).map((x) => x.entregador).filter(Boolean))).map((n) => '<option value="' + esc(n) + '">').join('') + '</datalist>';
  g.onchange = (e) => {
    const t = e.target, campo = t.dataset.campo;
    if (!campo) return;
    const v = t.type === 'checkbox' ? t.checked : t.value;
    if (campo === 'previsaoMin' && v === '') return;
    if (campo === 'entregadorId') { if (v === 'nome') return; muda(p.id, { entregadorId: v ? +v : null }).then((np) => { if (np) { t.blur(); desenhaPedido(np); } }); return; }
    if (campo === 'status' && v === 'cancelado') { const m = prompt('Motivo do cancelamento (o cliente vê):', ''); if (m === null) { desenhaPedido(p); return; } muda(p.id, { status: 'cancelado', motivo: m }).then(ofereceAviso); return; }
    muda(p.id, { [campo]: campo === 'previsaoMin' ? +v : v }).then((np) => { if (np && campo === 'status') ofereceAviso(np); if (np) { t.blur(); desenhaPedido(np); } });
  };
}

/* ======================= Ao vivo ======================= */
const COLUNAS = [
  { id: 'novos', titulo: 'Novos', sub: 'confirme quando a mensagem chegar no WhatsApp', status: ['novo'] },
  { id: 'cozinha', titulo: 'Na cozinha', sub: 'em preparo e no forno', status: ['preparo', 'forno'] },
  { id: 'rua', titulo: 'Saiu ou pronto', sub: 'em rota ou esperando no balcão', status: ['saiu', 'pronto'] },
  { id: 'feitos', titulo: 'Concluídos', sub: 'entregues e retirados hoje', status: ['concluido'] }
];
const filtroVivo = { modo: pref.get('filtroModo', 'todos'), busca: '', cancelados: false };
PAGINAS.aovivo = async () => {
  if (!E.vivoCarregado) await carregaVivo();
  const c = $('#conteudo');
  const notifPossivel = 'Notification' in window && window.isSecureContext;
  c.innerHTML = '<div class="hoje" id="hojeFaixa"></div>' +
    '<div class="barra"><div class="seg-ctrl" role="group" aria-label="Tipo">' + [['todos', 'Todos'], ['entrega', 'Entrega'], ['retirada', 'Retirada']].map(([id, n]) => '<button type="button" data-modo="' + id + '" aria-pressed="' + (filtroVivo.modo === id) + '">' + n + '</button>').join('') + '</div>' +
    '<label class="busca">' + icone('busca') + '<input type="search" id="buscaVivo" placeholder="Buscar código, nome ou bairro" value="' + esc(filtroVivo.busca) + '"></label>' +
    '<div class="barra-dir"><button type="button" class="btn sm" id="tSom" aria-pressed="' + E.som + '">' + (E.som ? 'Som ligado' : 'Som desligado') + '</button>' +
    (notifPossivel ? '<button type="button" class="btn sm" id="tNotif" aria-pressed="' + (E.notif && Notification.permission === 'granted') + '">' + (E.notif && Notification.permission === 'granted' ? 'Notificações ligadas' : 'Ativar notificações') + '</button>' : '') + '</div></div>' +
    '<div class="kanban" id="kanban"></div>';
  c.querySelector('.seg-ctrl').addEventListener('click', (e) => { const b = e.target.closest('[data-modo]'); if (!b) return; filtroVivo.modo = b.dataset.modo; pref.set('filtroModo', filtroVivo.modo); $$('.seg-ctrl [data-modo]', c).forEach((x) => x.setAttribute('aria-pressed', x === b)); desenhaQuadro(); });
  $('#buscaVivo').addEventListener('input', (e) => { filtroVivo.busca = e.target.value; desenhaQuadro(); });
  $('#tSom').addEventListener('click', (e) => { E.som = !E.som; pref.set('som', E.som); liberaAudio(); if (E.som) bip(); e.target.setAttribute('aria-pressed', E.som); e.target.textContent = E.som ? 'Som ligado' : 'Som desligado'; });
  if ($('#tNotif')) $('#tNotif').addEventListener('click', async (e) => {
    if (E.notif && Notification.permission === 'granted') E.notif = false;
    else { const r = await Notification.requestPermission(); E.notif = r === 'granted'; if (!E.notif) toast('As notificações estão bloqueadas neste navegador.'); }
    pref.set('notif', E.notif); e.target.setAttribute('aria-pressed', E.notif); e.target.textContent = E.notif ? 'Notificações ligadas' : 'Ativar notificações';
  });
  desenhaQuadro();
  clearInterval(PAGINAS.aovivo.relogio);
  PAGINAS.aovivo.relogio = setInterval(() => { if (E.rota !== 'aovivo') { clearInterval(PAGINAS.aovivo.relogio); return; } desenhaQuadro(); }, 30000);
};
function htmlCartao(p) {
  const prox = PROXIMO(p), min = minutosDesde(p.criadoEm);
  const aberto = p.status !== 'concluido' && p.status !== 'cancelado';
  const atraso = aberto ? (min >= 50 ? ' atrasado' : min >= 35 ? ' atencao' : '') : '';
  const modo = p.modo === 'entrega' ? '<span class="chip-modo">' + icone('moto') + 'Entrega' + (p.endereco && p.endereco.bairro ? ' · ' + esc(p.endereco.bairro) : '') + (p.km != null ? ' · ' + num(p.km, 1) + ' km' : '') + '</span>' : '<span class="chip-modo">' + icone('loja') + 'Retirada</span>';
  return '<article class="k-cartao st-' + p.status + atraso + (E.recentes.has(p.id) ? ' recente' : '') + '" data-id="' + p.id + '">' +
    '<header><button type="button" class="k-cod" data-acao="abrir-pedido" data-id="' + p.id + '">' + esc(p.codigo) + '</button>' + (p.canal !== 'site' ? '<span class="tag">' + esc(NOME_CANAL[p.canal]) + '</span>' : '') + (p.status === 'forno' ? '<span class="tag forno">no forno</span>' : '') +
    (p.conferencia ? '<button type="button" class="tag conf" data-acao="abrir-pedido" data-id="' + p.id + '" title="' + esc(p.conferencia.motivos.join(' · ')) + '">⚠ ' + (p.conferencia.valeOServidor ? 'valor corrigido' : 'conferir') + '</button>' : '') +
    '<time class="k-hora">' + hhmm(p.criadoEm) + (aberto ? ' · ' + tempoRel(min) : '') + '</time></header>' +
    '<div class="k-cli"><b>' + esc(p.cliente.nome) + '</b>' + modo + '</div><p class="k-itens">' + esc(resumoItens(p)) + '</p>' + (p.obs ? '<p class="obs">Obs.: ' + esc(p.obs) + '</p>' : '') +
    (p.modo === 'entrega' && aberto && p.status !== 'novo' ? chipEntregador(p) : '') +
    '<footer><b>' + brl(p.total) + '</b><span>' + esc(NOME_PAG[(p.pagamento || {}).forma] || 'A combinar') + (p.pago ? ' · <i class="pago">pago</i>' : '') + '</span></footer>' +
    (aberto ? '<div class="k-acoes">' + (prox ? '<button type="button" class="btn prim sm" data-acao="avancar" data-id="' + p.id + '" data-para="' + prox + '">' + esc(rotuloAcao(p, prox)) + '</button>' : '') +
      (p.status === 'novo' ? '<button type="button" class="btn sm" data-acao="nao-veio" data-id="' + p.id + '" title="A mensagem do cliente não chegou no WhatsApp">Não veio</button>' : '') +
      (foneZap(p.cliente.fone) ? '<button type="button" class="btn zap sm quadrado" data-acao="zap" data-id="' + p.id + '" aria-label="Avisar ' + esc(primeiroNome(p.cliente.nome)) + ' no WhatsApp" title="Avisar no WhatsApp">' + icone('zap') + '</button>' : '') + '</div>' : '') + '</article>';
}
function desenhaQuadro() {
  const box = $('#kanban');
  if (!box) return;
  const q = semAcento(filtroVivo.busca.trim());
  const todos = Array.from(E.vivo.values()).sort((a, b) => a.id - b.id);
  const lista = todos.filter((p) => (filtroVivo.modo === 'todos' || p.modo === filtroVivo.modo) && (!q || semAcento([p.codigo, p.cliente.nome, p.endereco && p.endereco.bairro].join(' ')).includes(q)));
  // faixa "hoje"
  const validos = todos.filter((p) => p.status !== 'cancelado');
  const vendas = validos.reduce((s, p) => s + p.total, 0);
  const andamento = todos.filter((p) => !['concluido', 'cancelado'].includes(p.status));
  const atrasados = andamento.filter((p) => minutosDesde(p.criadoEm) >= 50).length;
  const hf = $('#hojeFaixa');
  if (hf) hf.innerHTML = '<div><span>Vendas de hoje</span><b>' + brl(vendas) + '</b>' + (E.metaDiaria ? medidor(vendas, E.metaDiaria) + '<small>' + pct(vendas / E.metaDiaria) + ' da meta de ' + brl0(E.metaDiaria) + '</small>' : '') + '</div>' +
    '<div><span>Pedidos</span><b>' + validos.length + '</b><small>ticket ' + brl(validos.length ? vendas / validos.length : 0) + '</small></div>' +
    '<div><span>Em andamento</span><b>' + andamento.length + '</b><small>' + andamento.filter((p) => p.modo === 'entrega').length + ' entregas · ' + andamento.filter((p) => p.modo !== 'entrega').length + ' retiradas</small></div>' +
    '<div class="' + (atrasados ? 'alerta-num' : '') + '"><span>Atrasados</span><b>' + atrasados + '</b><small>mais de 50 min desde o pedido</small></div>';
  const antes = REDUZ ? null : new Map($$('.k-cartao', box).map((c) => [c.dataset.id, c.getBoundingClientRect()]));
  let h = COLUNAS.map((c) => {
    let ps = lista.filter((p) => c.status.includes(p.status));
    if (c.id === 'feitos') ps = ps.reverse();
    return '<section class="k-col col-' + c.id + '" aria-label="' + esc(c.titulo) + '"><header><h3>' + esc(c.titulo) + ' <span class="k-n">' + ps.length + '</span></h3><small>' + esc(c.sub) + '</small></header><div class="k-cartoes">' +
      (ps.length ? ps.map(htmlCartao).join('') : '<p class="vazio">' + (c.id === 'novos' ? 'Nenhum pedido novo. Quando chegar, toca um aviso.' : 'Nada aqui.') + '</p>') + '</div></section>';
  }).join('');
  const canc = lista.filter((p) => p.status === 'cancelado');
  if (canc.length) h += '<section class="k-cancelados"><button type="button" class="link" id="verCanc" aria-expanded="' + filtroVivo.cancelados + '">' + canc.length + ' cancelado' + (canc.length > 1 ? 's' : '') + ' hoje</button>' + (filtroVivo.cancelados ? '<div class="k-cartoes grade">' + canc.map(htmlCartao).join('') + '</div>' : '') + '</section>';
  box.innerHTML = h;
  const vc = $('#verCanc'); if (vc) vc.addEventListener('click', () => { filtroVivo.cancelados = !filtroVivo.cancelados; desenhaQuadro(); });
  if (antes) $$('.k-cartao', box).forEach((c) => {
    const a = antes.get(c.dataset.id), b = c.getBoundingClientRect();
    if (!a) { if (E.recentes.has(+c.dataset.id)) c.animate([{ transform: 'translateY(-18px) scale(.94)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 520, easing: 'cubic-bezier(.2,.9,.3,1.25)' }); return; }
    const dx = a.left - b.left, dy = a.top - b.top;
    if (Math.abs(dx) + Math.abs(dy) > 2) c.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }], { duration: 460, easing: 'cubic-bezier(.2,.8,.2,1)' });
  });
}

/* ======================= Todos os pedidos ======================= */
const filtroLista = { q: '', status: '', canal: '', modo: '', pag: '', pagina: 0, ordem: 't', desc: true };
PAGINAS.pedidos = async () => {
  const per = intervalo(E.periodo);
  const j = await carregaAnalise(per);
  if (E.param) { filtroLista.q = E.param; E.param = ''; }
  const rows = j.pedidos.filter((p) => p.d >= per.de && p.d <= per.ate);
  const c = $('#conteudo');
  const sel = (id, rot, op) => '<label class="sel"><span>' + rot + '</span><select class="campo" data-f="' + id + '"><option value="">Todos</option>' + op.map(([v, n]) => '<option value="' + v + '"' + (filtroLista[id] === v ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select></label>';
  c.innerHTML = '<div class="pg-w"><div class="barra"><label class="busca">' + icone('busca') + '<input type="search" id="buscaLista" placeholder="Código, cliente, bairro ou cidade" value="' + esc(filtroLista.q) + '"></label>' +
    sel('status', 'Status', Object.entries(NOME_STATUS)) + sel('canal', 'Canal', ORDEM_CANAL.map((k) => [k, NOME_CANAL[k]])) + sel('modo', 'Tipo', [['entrega', 'Entrega'], ['retirada', 'Retirada']]) + sel('pag', 'Pagamento', ORDEM_PAG.map((k) => [k, NOME_PAG[k]])) +
    '<div class="barra-dir"><button type="button" class="btn sm" id="csvLista">' + icone('baixar') + 'Planilha (CSV)</button></div></div><div id="listaRes"></div></div>';
  const w = c.firstElementChild;
  const desenha = () => {
    const q = semAcento(filtroLista.q.trim());
    let l = rows.filter((p) => (!filtroLista.status || p.s === filtroLista.status) && (!filtroLista.canal || p.ca === filtroLista.canal) && (!filtroLista.modo || p.m === filtroLista.modo) && (!filtroLista.pag || p.pg === filtroLista.pag) && (!q || semAcento([p.c, p.nm, p.ba, p.ci].join(' ')).includes(q)));
    const k = filtroLista.ordem, dir = filtroLista.desc ? -1 : 1;
    l.sort((a, b) => (a[k] > b[k] ? dir : a[k] < b[k] ? -dir : 0));
    const validos = l.filter((p) => p.s !== 'cancelado');
    const POR = 50, pags = Math.max(1, Math.ceil(l.length / POR));
    filtroLista.pagina = Math.min(filtroLista.pagina, pags - 1);
    const pg = l.slice(filtroLista.pagina * POR, filtroLista.pagina * POR + POR);
    const th = (id, t, n) => '<th' + (n ? ' class="n"' : '') + '><button type="button" class="ordena" data-ordem="' + id + '" aria-sort="' + (filtroLista.ordem === id ? (filtroLista.desc ? 'descending' : 'ascending') : 'none') + '">' + t + (filtroLista.ordem === id ? (filtroLista.desc ? ' ↓' : ' ↑') : '') + '</button></th>';
    $('#listaRes').innerHTML = '<div class="resumo-linha"><b>' + num(l.length) + '</b> pedidos · <b>' + brl(validos.reduce((s, p) => s + p.tot, 0)) + '</b> em vendas (sem cancelados) · ticket médio ' + brl(validos.length ? validos.reduce((s, p) => s + p.tot, 0) / validos.length : 0) + ' · ' + esc(per.rotulo.toLowerCase()) + '</div>' +
      (l.length ? '<div class="tab-wrap"><table class="tab clicavel"><thead><tr>' + th('c', 'Pedido') + th('t', 'Data') + th('nm', 'Cliente') + th('ba', 'Bairro') + th('m', 'Tipo') + th('ca', 'Canal') + th('pg', 'Pagamento') + th('s', 'Status') + th('tot', 'Total', 1) + '</tr></thead><tbody>' +
      pg.map((p) => '<tr data-acao="abrir-pedido" data-id="' + p.id + '" tabindex="0" class="' + (p.s === 'cancelado' ? 'canc' : '') + '"><td><b>' + esc(p.c) + '</b>' + (p.dm ? ' <span class="tag demo">demo</span>' : '') + '</td><td>' + esc(dataCurta(p.d)) + ' · ' + hhmm(p.t) + '</td><td>' + esc(p.nm) + '</td><td>' + esc(p.ba || (p.m === 'retirada' ? '—' : '')) + (p.ci && p.ci !== 'Ribeirão Preto' ? ' <small>' + esc(p.ci) + '</small>' : '') + '</td><td>' + (p.m === 'entrega' ? 'Entrega' : 'Retirada') + '</td><td>' + esc(NOME_CANAL[p.ca] || p.ca) + '</td><td>' + esc(NOME_PAG[p.pg] || '—') + '</td><td><span class="st st-' + p.s + '">' + esc(NOME_STATUS[p.s]) + '</span></td><td class="n">' + brl(p.tot) + '</td></tr>').join('') +
      '</tbody></table></div>' + (pags > 1 ? '<div class="paginas"><button type="button" class="btn sm" data-pg="-1"' + (filtroLista.pagina ? '' : ' disabled') + '>Anterior</button><span>Página ' + (filtroLista.pagina + 1) + ' de ' + pags + '</span><button type="button" class="btn sm" data-pg="1"' + (filtroLista.pagina < pags - 1 ? '' : ' disabled') + '>Próxima</button></div>' : '') : '<p class="vazio grande">Nenhum pedido com esses filtros.</p>');
    desenha.l = l;
  };
  w.addEventListener('change', (e) => { const f = e.target.dataset.f; if (f) { filtroLista[f] = e.target.value; filtroLista.pagina = 0; desenha(); } });
  $('#buscaLista').addEventListener('input', (e) => { filtroLista.q = e.target.value; filtroLista.pagina = 0; desenha(); });
  w.addEventListener('click', (e) => {
    const o = e.target.closest('[data-ordem]'); if (o) { if (filtroLista.ordem === o.dataset.ordem) filtroLista.desc = !filtroLista.desc; else { filtroLista.ordem = o.dataset.ordem; filtroLista.desc = true; } desenha(); return; }
    const pgb = e.target.closest('[data-pg]'); if (pgb) { filtroLista.pagina += +pgb.dataset.pg; desenha(); c.scrollIntoView({ block: 'start' }); }
  });
  w.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('tr[data-acao]')) abrePedido(+e.target.dataset.id); });
  $('#csvLista').addEventListener('click', () => baixaCSV('pedidos-' + per.de + '-a-' + per.ate + '.csv', ['pedido', 'data', 'hora', 'cliente', 'bairro', 'cidade', 'km', 'tipo', 'canal', 'pagamento', 'status', 'subtotal', 'desconto', 'taxa_entrega', 'total'],
    desenha.l.map((p) => [p.c, dataBR(p.d), hhmm(p.t), p.nm, p.ba, p.ci, p.km != null ? dec(p.km) : '', p.m, NOME_CANAL[p.ca] || p.ca, NOME_PAG[p.pg] || '', NOME_STATUS[p.s], dec(p.sub), dec(p.des), dec(p.tx), dec(p.tot)])));
  desenha();
};

/* ======================= Clientes (CRM) ======================= */
const filtroCli = { q: '', seg: 'todos', ordem: 'gasto', pagina: 0 };
async function carregaClientes(forcar) {
  if (!E.clientes || forcar) { const j = await api('GET', '/api/clientes'); E.clientes = segmentaClientes(j.clientes, j.hoje || E.hoje); }
  return E.clientes;
}
PAGINAS.clientes = async () => {
  const lista = await carregaClientes(true);
  if (E.param) { const ch = E.param; E.param = ''; setTimeout(() => abreCliente(ch), 0); }
  const c = $('#conteudo');
  const ativos = lista.filter((x) => x.pedidos > 0);
  const cont = (f) => ativos.filter(f).length;
  const recorr = ativos.filter((x) => x.pedidos >= 2).length;
  const ltv = ativos.length ? ativos.reduce((s, x) => s + x.gasto, 0) / ativos.length : 0;
  const SEG_CHIPS = [['todos', 'Todos', ativos.length], ['vip', 'VIP', cont((x) => x.flags.vip)], ['frequente', 'Frequentes', cont((x) => x.flags.frequente)], ['novo', 'Novos', cont((x) => x.flags.novo)], ['risco', 'Em risco', cont((x) => x.flags.risco)], ['inativo', 'Inativos', cont((x) => x.flags.inativo)], ['conta', 'Com conta no site', cont((x) => x.flags.conta)], ['semFone', 'Sem telefone', cont((x) => x.flags.semFone)]];
  let contas = [];
  try { contas = (await api('GET', '/api/contas')).contas; } catch (e) { /* segue sem a base de cadastros */ }
  c.innerHTML = '<div class="pg-w"><div class="tiles">' +
    tile({ rotulo: 'Clientes', valor: num(ativos.length), sub: 'com pelo menos um pedido concluído', heroi: true }) +
    tile({ rotulo: 'Novos (30 dias)', valor: num(cont((x) => x.flags.novo)), sub: 'primeiro pedido no último mês' }) +
    tile({ rotulo: 'Voltaram a pedir', valor: pct(ativos.length ? recorr / ativos.length : 0), sub: num(recorr) + ' clientes com 2 pedidos ou mais', ajuda: 'Parcela dos clientes que já pediram mais de uma vez.' }) +
    tile({ rotulo: 'Valor por cliente', valor: brl(ltv), sub: 'gasto médio de cada cliente desde o primeiro pedido' }) +
    tile({ rotulo: 'Em risco', valor: num(cont((x) => x.flags.risco)), sub: 'bons clientes sumidos há 31 a 60 dias', ajuda: SEGMENTOS.risco[1] + '. Vale um contato.' }) +
    tile({ rotulo: 'Contas no site', valor: num(contas.length), sub: num(contas.filter((x) => x.ofertas).length) + ' aceitam promoções · ' + num(contas.filter((x) => !x.pedidos).length) + ' ainda sem pedido', ajuda: 'Clientes que entraram no site com o celular (código por email) ou com o Google.' }) + '</div>' +
    (contas.length ? '<details class="card contas-base"><summary><b>Base de cadastros do site</b> <span class="nota">' + num(contas.length) + ' contas · as mais recentes primeiro</span></summary><div class="barra"><div class="barra-dir"><button type="button" class="btn sm" id="csvContas">' + icone('baixar') + 'Planilha de quem aceita promoções</button></div></div>' +
      '<div class="tab-wrap"><table class="tab compacta"><thead><tr><th>Nome</th><th>Email</th><th>Celular</th><th>Entrou com</th><th>Desde</th><th class="n">Pedidos</th><th>Promoções</th></tr></thead><tbody>' +
      contas.slice(0, 60).map((x) => '<tr' + (x.chave ? ' data-acao="abrir-cliente" data-chave="' + esc(x.chave) + '" tabindex="0" class="clicavel-linha"' : '') + '><td>' + esc(x.nome || '—') + '</td><td>' + esc(x.email) + '</td><td>' + esc(x.fone || '—') + '</td><td>' + (x.google ? 'Google' : 'Código por email') + '</td><td>' + esc(dataBR(String(x.criadoEm).slice(0, 10))) + '</td><td class="n">' + x.pedidos + '</td><td>' + (x.ofertas ? 'sim' : 'não') + '</td></tr>').join('') + '</tbody></table></div></details>' : '') +
    '<div class="barra"><div class="chips" role="group" aria-label="Segmentos">' + SEG_CHIPS.map(([id, n, q]) => '<button type="button" class="chip" data-seg="' + id + '" aria-pressed="' + (filtroCli.seg === id) + '"' + (SEGMENTOS[id] ? ' title="' + esc(SEGMENTOS[id][1]) + '"' : '') + '>' + esc(n) + ' <b>' + num(q) + '</b></button>').join('') + '</div></div>' +
    '<div class="barra"><label class="busca">' + icone('busca') + '<input type="search" id="buscaCli" placeholder="Nome, telefone ou bairro" value="' + esc(filtroCli.q) + '"></label><label class="sel"><span>Ordenar por</span><select class="campo" id="ordemCli">' +
    [['gasto', 'Maior gasto'], ['pedidos', 'Mais pedidos'], ['recentes', 'Pediu por último'], ['sumidos', 'Há mais tempo sem pedir'], ['nome', 'Nome']].map(([v, n]) => '<option value="' + v + '"' + (filtroCli.ordem === v ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></label>' +
    '<div class="barra-dir"><button type="button" class="btn sm" id="csvCli">' + icone('baixar') + 'Planilha (CSV)</button></div></div><div id="cliRes"></div></div>';
  const w = c.firstElementChild;
  const desenha = () => {
    const q = semAcento(filtroCli.q.trim()), qd = filtroCli.q.replace(/\D/g, '');
    let l = (filtroCli.seg === 'todos' ? ativos : ativos.filter((x) => x.flags[filtroCli.seg])).filter((x) => !q || semAcento([x.nome, x.bairro, x.cidade, (x.tags || []).join(' ')].join(' ')).includes(q) || (qd.length >= 3 && String(x.fone).replace(/\D/g, '').includes(qd)));
    const ord = { gasto: (a, b) => b.gasto - a.gasto, pedidos: (a, b) => b.pedidos - a.pedidos || b.gasto - a.gasto, recentes: (a, b) => (a.ultimo < b.ultimo ? 1 : -1), sumidos: (a, b) => (b.semPedir || 0) - (a.semPedir || 0), nome: (a, b) => a.nome.localeCompare(b.nome, 'pt-BR') }[filtroCli.ordem];
    l = l.slice().sort(ord);
    const POR = 50, pags = Math.max(1, Math.ceil(l.length / POR));
    filtroCli.pagina = Math.min(filtroCli.pagina, pags - 1);
    const pg = l.slice(filtroCli.pagina * POR, filtroCli.pagina * POR + POR);
    $('#cliRes').innerHTML = '<div class="resumo-linha"><b>' + num(l.length) + '</b> clientes · ' + brl(l.reduce((s, x) => s + x.gasto, 0)) + ' gastos no total</div>' +
      (l.length ? '<div class="tab-wrap"><table class="tab clicavel clientes"><thead><tr><th>Cliente</th><th>Bairro</th><th class="n">Pedidos</th><th class="n">Gasto</th><th class="n">Ticket</th><th>Último pedido</th><th>Segmento</th></tr></thead><tbody>' +
      pg.map((x) => '<tr data-acao="abrir-cliente" data-chave="' + esc(x.chave) + '" tabindex="0"><td><span class="avatar sm">' + esc(iniciais(x.nome)) + '</span><span class="cli-nome"><b>' + esc(x.nome) + (x.conta ? ' <i class="tag conta" title="Tem conta no site">conta</i>' : '') + '</b><small>' + esc(x.fone || 'sem telefone') + (x.tags && x.tags.length ? ' · ' + x.tags.map((t) => '<i class="tag">' + esc(t) + '</i>').join(' ') : '') + '</small></span></td><td>' + esc(x.bairro || '—') + '</td><td class="n">' + x.pedidos + '</td><td class="n">' + brl(x.gasto) + '</td><td class="n">' + brl(x.ticket) + '</td><td>' + esc(diasRel(x.semPedir)) + '</td><td><span class="seg-chip seg-' + x.segmento + '">' + esc(SEGMENTOS[x.segmento][0]) + '</span></td></tr>').join('') +
      '</tbody></table></div>' + (pags > 1 ? '<div class="paginas"><button type="button" class="btn sm" data-pgc="-1"' + (filtroCli.pagina ? '' : ' disabled') + '>Anterior</button><span>Página ' + (filtroCli.pagina + 1) + ' de ' + pags + '</span><button type="button" class="btn sm" data-pgc="1"' + (filtroCli.pagina < pags - 1 ? '' : ' disabled') + '>Próxima</button></div>' : '') : '<p class="vazio grande">Nenhum cliente com esses filtros.</p>');
    desenha.l = l;
  };
  w.addEventListener('click', (e) => {
    const s = e.target.closest('[data-seg]'); if (s) { filtroCli.seg = s.dataset.seg; filtroCli.pagina = 0; $$('[data-seg]', w).forEach((x) => x.setAttribute('aria-pressed', x === s)); desenha(); return; }
    const pgb = e.target.closest('[data-pgc]'); if (pgb) { filtroCli.pagina += +pgb.dataset.pgc; desenha(); }
  });
  w.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('tr[data-acao]')) abreCliente(e.target.dataset.chave); });
  $('#buscaCli').addEventListener('input', (e) => { filtroCli.q = e.target.value; filtroCli.pagina = 0; desenha(); });
  $('#ordemCli').addEventListener('change', (e) => { filtroCli.ordem = e.target.value; desenha(); });
  if ($('#csvContas')) $('#csvContas').addEventListener('click', () => baixaCSV('contatos-promocoes-' + E.hoje + '.csv', ['nome', 'email', 'celular', 'conta_desde', 'pedidos'], contas.filter((x) => x.ofertas).map((x) => [x.nome, x.email, x.fone, dataBR(String(x.criadoEm).slice(0, 10)), x.pedidos])));
  $('#csvCli').addEventListener('click', () => baixaCSV('clientes-' + E.hoje + '.csv', ['nome', 'telefone', 'bairro', 'cidade', 'pedidos', 'gasto_total', 'ticket_medio', 'primeiro_pedido', 'ultimo_pedido', 'segmento', 'etiquetas', 'notas'],
    desenha.l.map((x) => [x.nome, x.fone, x.bairro, x.cidade, x.pedidos, dec(x.gasto), dec(x.ticket), dataBR(x.primeiro), dataBR(x.ultimo), SEGMENTOS[x.segmento][0], (x.tags || []).join(', '), x.notas || ''])));
  desenha();
};
async function abreCliente(chave) {
  abreGaveta('cliente', chave);
  let j;
  try { j = await api('GET', '/api/clientes/' + encodeURIComponent(chave)); } catch (e) { $('#gaveta').innerHTML = '<div class="gav-corpo"><p class="alerta">' + esc(e.message) + '</p></div>'; return; }
  if ($('#gaveta').dataset.cliente !== chave) return;
  const x = segmentaClientes([j.cliente], E.hoje)[0];
  // segmento VIP depende de todos; usa o da lista quando já carregada
  const daLista = E.clientes && E.clientes.find((y) => y.chave === chave);
  if (daLista) { x.segmento = daLista.segmento; x.flags = daLista.flags; }
  j.pedidos.forEach((p) => cachePedidos.set(p.id, p));
  const enderecos = Array.from(new Map(j.pedidos.filter((p) => p.endereco).map((p) => [enderecoTexto(p), p])).keys()).slice(0, 3);
  const zap = foneZap(x.fone);
  const g = $('#gaveta');
  g.innerHTML = '<header class="gav-topo"><div class="cli-topo"><span class="avatar lg">' + esc(iniciais(x.nome)) + '</span><div><span class="gav-cod">' + esc(x.nome) + '</span><span class="seg-chip seg-' + x.segmento + '">' + esc(SEGMENTOS[x.segmento][0]) + '</span>' + (x.demo ? ' <span class="st demo">demonstração</span>' : '') + '</div></div><button type="button" class="fechar" data-acao="fechar-gaveta" aria-label="Fechar">×</button></header>' +
    '<div class="gav-corpo"><p class="gav-sub">' + (x.fone ? esc(x.fone) + ' · ' : '') + esc([x.bairro, x.cidade].filter(Boolean).join(', ') || 'retira no balcão') + ' · cliente desde ' + esc(dataBR(x.primeiro)) + '</p>' +
    '<div class="gav-acoes">' + (zap ? '<a class="btn zap" href="https://wa.me/' + zap + '?text=' + encodeURIComponent('Oi, ' + primeiroNome(x.nome) + '! Aqui é da ' + nomeLoja() + '. ') + '" target="_blank" rel="noopener">' + icone('zap') + 'Conversar</a>' : '') +
    '<button type="button" class="btn prim" id="novoParaCli">+ Novo pedido</button></div>' +
    '<div class="mini-tiles"><div><span>Pedidos</span><b>' + x.pedidos + '</b></div><div><span>Gasto total</span><b>' + brl(x.gasto) + '</b></div><div><span>Ticket médio</span><b>' + brl(x.ticket) + '</b></div><div><span>Último pedido</span><b>' + esc(diasRel(x.semPedir)) + '</b></div><div><span>Pede a cada</span><b>' + (x.freq != null ? Math.round(x.freq) + ' dias' : '—') + '</b></div><div><span>Cancelados</span><b>' + x.cancelados + '</b></div></div>' +
    (x.sabores && x.sabores.length ? '<section class="bloco"><h4>Sabores favoritos</h4><p class="chips">' + x.sabores.map((s) => '<span class="chip estatico">' + esc(nomeSabor(s)) + '</span>').join('') + '</p></section>' : '') +
    (enderecos.length ? '<section class="bloco"><h4>Endereços usados</h4>' + enderecos.map((e) => '<p>' + esc(e) + '</p>').join('') + '</section>' : '') +
    (x.conta ? '<section class="bloco form"><h4>Conta no site</h4><p><b>' + esc(x.conta.email) + '</b> · entrou com ' + (x.conta.google ? 'o Google' : 'código por email') + ' · desde ' + esc(dataBR(String(x.conta.desde).slice(0, 10))) + ' · último acesso ' + esc(diasRel(difDias(String(x.conta.acesso).slice(0, 10), E.hoje))) + ' · promoções: ' + (x.conta.ofertas ? 'aceita' : 'não') + '</p>' +
      '<label class="check"><input type="checkbox" id="contaHist"' + (x.conta.historico ? ' checked' : '') + '> Mostrar na conta os pedidos antigos com este telefone</label><p class="nota">Ligue só depois de confirmar com o cliente que o celular é dele: a conta passa a ver endereços e itens desses pedidos.</p>' +
      '<button type="button" class="link perigo" id="contaTiraFone">Tirar este celular da conta (cadastrado por outra pessoa)</button></section>' : '') +
    '<section class="bloco form"><h4>Etiquetas e notas</h4><div class="tags-ed" id="tagsEd">' + (x.tags || []).map((t) => '<span class="tag ed">' + esc(t) + '<button type="button" aria-label="Remover ' + esc(t) + '" data-tira="' + esc(t) + '">×</button></span>').join('') + '<input class="tag-in" id="tagIn" placeholder="+ etiqueta" maxlength="24" list="sugTags"></div>' +
    '<datalist id="sugTags">' + ['VIP', 'Aniversariante', 'Reclamou', 'Prefere retirar', 'Paga no Pix', 'Pede todo fim de semana', 'Alergia'].map((t) => '<option value="' + t + '">').join('') + '</datalist>' +
    '<label class="rot">Notas<textarea class="campo" id="notasCli" maxlength="2000" placeholder="Preferências, aniversário, observações para o atendimento…">' + esc(x.notas || '') + '</textarea></label><small class="salvo" id="salvoCli"></small></section>' +
    '<section class="bloco"><h4>Pedidos (' + j.pedidos.length + ')</h4><ul class="hist-ped">' + j.pedidos.map((p) => '<li><button type="button" data-acao="abrir-pedido" data-id="' + p.id + '"><span><b>' + esc(dataBR(p.dia)) + '</b> · ' + esc(p.codigo) + '<small>' + esc(resumoItens(p)) + '</small></span><span class="dir"><b>' + brl(p.total) + '</b><span class="st st-' + p.status + '">' + esc(NOME_STATUS[p.status]) + '</span></span></button></li>').join('') + '</ul></section></div>';
  let tags = (x.tags || []).slice();
  const salva = async (campos) => {
    try { const r = await api('PATCH', '/api/clientes/' + encodeURIComponent(chave), campos); tags = r.tags; const s = $('#salvoCli'); if (s) s.textContent = 'Salvo ' + hhmm(new Date().toISOString()); if (daLista) { daLista.tags = r.tags; daLista.notas = r.notas; } }
    catch (e) { toast(e.message); }
  };
  const redesenhaTags = () => { $('#tagsEd').querySelectorAll('.tag.ed').forEach((t) => t.remove()); $('#tagIn').insertAdjacentHTML('beforebegin', tags.map((t) => '<span class="tag ed">' + esc(t) + '<button type="button" aria-label="Remover ' + esc(t) + '" data-tira="' + esc(t) + '">×</button></span>').join('')); };
  $('#tagIn').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ',') return;
    e.preventDefault();
    const v = e.target.value.trim();
    if (v && !tags.includes(v) && tags.length < 12) { tags.push(v); redesenhaTags(); salva({ tags }); }
    e.target.value = '';
  });
  $('#tagsEd').addEventListener('click', (e) => { const b = e.target.closest('[data-tira]'); if (b) { tags = tags.filter((t) => t !== b.dataset.tira); redesenhaTags(); salva({ tags }); } });
  let tNotas = null;
  $('#notasCli').addEventListener('input', (e) => { clearTimeout(tNotas); const v = e.target.value; $('#salvoCli').textContent = 'Salvando…'; tNotas = setTimeout(() => salva({ notas: v }), 700); });
  if ($('#contaHist')) $('#contaHist').addEventListener('change', async (e) => {
    try { const r = await api('PATCH', '/api/contas/' + x.conta.id, { historico: e.target.checked }); x.conta.historico = r.historico; toast(r.historico ? 'Pedidos antigos liberados na conta do cliente.' : 'A conta volta a mostrar só os pedidos feitos com ela.'); }
    catch (er) { e.target.checked = !e.target.checked; toast(er.message); }
  });
  if ($('#contaTiraFone')) $('#contaTiraFone').addEventListener('click', async () => {
    if (!confirm('Tirar o celular ' + x.fone + ' da conta ' + x.conta.email + '? A pessoa continua entrando pelo email, e o dono do número pode cadastrá-lo de novo.')) return;
    try { await api('PATCH', '/api/contas/' + x.conta.id, { desvincularFone: true }); E.clientes = null; toast('Celular retirado da conta.'); abreCliente(chave); } catch (er) { toast(er.message); }
  });
  $('#novoParaCli').addEventListener('click', () => {
    const ult = j.pedidos.find((p) => p.endereco);
    try { sessionStorage.setItem('pp-balcao-cliente', JSON.stringify({ nome: x.nome, fone: x.fone, endereco: ult ? ult.endereco : null })); } catch (e) { /* sem storage */ }
    location.href = '/#balcao';
  });
}

/* ======================= início ======================= */
async function inicia() {
  let eu;
  try { eu = await api('GET', '/api/eu'); } catch (e) { $('#raiz').innerHTML = '<main class="login"><div class="login-card"><h1>Gestão</h1><p class="erro">O servidor de pedidos não respondeu. Confira se ele está rodando e tente de novo.</p><button class="btn prim" onclick="location.reload()">Tentar de novo</button></div></main>'; return; }
  E.hoje = eu.dia; E.demo = eu.demo || 0;
  if (!eu.usuario) { telaLogin(); return; }
  E.usuario = eu.usuario;
  if (eu.usuario.trocarSenha) { telaCriaSenha(eu.usuario); return; } // primeiro acesso com a senha provisória
  try { const cfg = await api('GET', '/api/config'); E.metaDiaria = cfg.metaDiaria || 0; E.lojaGeo = cfg.lojaGeo; } catch (e) { /* segue sem */ }
  await carregaEntregadores().catch(() => {});
  montaApp();
  conecta();
  try { await carregaVivo(); } catch (e) { /* a página mostra o erro */ }
  if (!location.hash) location.replace('#/aovivo');
  rota();
}
