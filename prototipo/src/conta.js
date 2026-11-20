/* Conta do cliente — entrar sem senha (código de 6 números por email ou conta Google), "Minha conta" com os pedidos
   anteriores e o "pedir de novo", endereços salvos e dados. Depende do servidor (server.js + contas.js); sem ele
   (artifact, hospedagem estática) o botão de entrar nem aparece. O app.js passa o contexto em ContaPP.iniciar(). */
(function () {
  'use strict';
  let C = null;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const brl = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const anima = () => !!(C && C.anima);
  const primeiro = (n) => String(n || '').trim().split(/\s+/)[0] || '';
  const inicial = (n) => (primeiro(n)[0] || '?').toUpperCase();
  const NOME_STATUS = { novo: 'Recebido', preparo: 'Em preparo', forno: 'No forno', saiu: 'Saiu para entrega', pronto: 'Pronto para retirar', concluido: 'Concluído', cancelado: 'Cancelado' };
  async function api(met, url, corpo) {
    const r = await fetch(url, { method: met, credentials: 'same-origin', cache: 'no-store', headers: corpo ? { 'Content-Type': 'application/json' } : {}, body: corpo ? JSON.stringify(corpo) : undefined });
    let j = null;
    try { j = await r.json(); } catch (e) { /* sem corpo */ }
    if (!r.ok) { const e = new Error((j && j.erro) || 'Sem conexão agora. Tente de novo.'); e.status = r.status; throw e; }
    return j;
  }
  function mascaraFone(v) {
    const d = String(v || '').replace(/\D/g, '').slice(0, 11);
    if (!d) return '';
    if (d.length <= 2) return '(' + d;
    if (d.length <= 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
    if (d.length <= 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  }
  // pedidos feitos neste aparelho (o servidor liga à conta quando a pessoa entra)
  function tokensAparelho() {
    const t = [];
    try { (JSON.parse(localStorage.getItem('pp-pedidos') || '[]') || []).forEach((x) => x && x.token && t.push(x.token)); } catch (e) { /* sem storage */ }
    try { const u = JSON.parse(localStorage.getItem('pp-ultimoPedido') || 'null'); if (u && u.token) t.push(u.token); } catch (e) { /* sem storage */ }
    return Array.from(new Set(t)).slice(-60);
  }

  const K = { conta: null, pronta: false, servidor: false, google: null, gisPronto: false, passo: 'inicio', modo: 'fone', contato: '', novo: null, envio: null, desafio: null, para: '', reenvio: 0, timer: null, pedidos: null, pedidosEm: 0, aba: 'pedidos', foco: null, depois: null, ocupado: false };

  /* ======================= botão no topo ======================= */
  const ICO_PESSOA = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.2" r="3.8"/><path d="M4.5 20.2c1-4 4-6.2 7.5-6.2s6.5 2.2 7.5 6.2"/></svg>';
  function desenhaBotao(pop) {
    const b = $('#contaBtn');
    if (!b) return;
    b.hidden = !K.servidor;
    const c = K.conta;
    b.classList.toggle('logado', !!c);
    b.innerHTML = c ? '<span class="ct-btn-av" aria-hidden="true">' + esc(inicial(c.nome)) + '</span><span class="ct-btn-txt">' + esc(primeiro(c.nome) || 'Minha conta') + '</span>' : '<span class="ct-btn-av ico" aria-hidden="true">' + ICO_PESSOA + '</span><span class="ct-btn-txt">Entrar</span>';
    b.setAttribute('aria-label', c ? 'Minha conta: pedidos anteriores e endereços' : 'Entrar para ver seus pedidos e endereços salvos');
    if (pop && anima()) $('.ct-btn-av', b).animate([{ transform: 'scale(.2)' }, { transform: 'scale(1.18)', offset: 0.65 }, { transform: 'none' }], { duration: 520, easing: 'cubic-bezier(.2,.9,.3,1.3)' });
  }

  /* ======================= janela ======================= */
  function janela() {
    let box = $('#conta');
    if (!box) { box = document.createElement('div'); box.id = 'conta'; box.className = 'conta-veu'; box.hidden = true; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'contaTit'); document.body.appendChild(box); liga(box); }
    return box;
  }
  function abre(passo, opcoes) {
    if (!K.servidor) return;
    const box = janela();
    K.depois = (opcoes && opcoes.depois) || null;
    if (box.hidden) {
      K.foco = document.activeElement;
      box.hidden = false;
      document.documentElement.classList.add('conta-aberta');
      box.innerHTML = '<div class="ct-caixa" role="document"></div>';
      if (anima()) $('.ct-caixa', box).animate([{ transform: 'translateY(28px) scale(.97)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 460, easing: 'cubic-bezier(.2,.9,.3,1.15)' });
      box.animate && box.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220 });
    }
    vai(passo || (K.conta ? 'conta' : 'inicio'));
  }
  function fecha() {
    const box = $('#conta');
    if (!box || box.hidden) return;
    clearInterval(K.timer);
    const fim = () => { box.hidden = true; box.innerHTML = ''; document.documentElement.classList.remove('conta-aberta'); if (K.foco && K.foco.focus && document.contains(K.foco)) K.foco.focus(); };
    if (/^#(conta|entrar)$/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
    if (anima()) { const a = $('.ct-caixa', box).animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(18px) scale(.98)', opacity: 0 }], { duration: 200, easing: 'ease-in' }); a.onfinish = fim; } else fim();
  }
  function vai(passo, dir) {
    K.passo = passo;
    const cx = $('#conta .ct-caixa');
    if (!cx) return;
    clearInterval(K.timer);
    cx.className = 'ct-caixa passo-' + passo;
    cx.innerHTML = topo() + (TELAS[passo] || TELAS.inicio)();
    if (anima() && dir !== 0) Array.from(cx.children).slice(1).forEach((el, i) => el.animate([{ transform: 'translateX(' + (dir || 1) * 22 + 'px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 340, delay: i * 35, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' }));
    (APOS[passo] || (() => {}))(cx);
    const f = $('[data-foco]', cx) || $('.ct-fechar', cx);
    if (f && matchMedia('(pointer: fine)').matches) setTimeout(() => f.focus(), 60);
    else if (f && f.tagName === 'INPUT' && passo === 'codigo') setTimeout(() => f.focus(), 60);
  }
  const topo = () => '<header class="ct-topo">' + (K.passo !== 'inicio' && K.passo !== 'conta' && K.passo !== 'ok' ? '<button type="button" class="ct-voltar" data-ct="voltar" aria-label="Voltar">←</button>' : '<img src="' + C.LOGOS.h + '" alt="' + esc((C.D().config || {}).nome || 'Pizzaria') + '">') + '<button type="button" class="ct-fechar" data-ct="fechar" aria-label="Fechar">×</button></header>';

  /* ======================= telas ======================= */
  const TELAS = {
    inicio: () => '<div class="ct-arte" aria-hidden="true">' + arteEntrar() + '</div><h2 id="contaTit">Entre e peça mais rápido</h2>' +
      '<p class="ct-sub">Seus endereços ficam salvos, os pedidos anteriores à mão e o favorito sai de novo com um toque.</p>' +
      (K.google ? '<div class="ct-google" id="ctGoogle"><span class="ct-google-carregando">Carregando o Google…</span></div><div class="ct-ou"><span>ou</span></div>' : '') +
      '<form class="ct-form" id="ctFormContato" novalidate><div class="ct-modo" role="group" aria-label="Entrar com"><button type="button" data-modo="fone" aria-pressed="' + (K.modo === 'fone') + '">Celular</button><button type="button" data-modo="email" aria-pressed="' + (K.modo === 'email') + '">Email</button></div>' +
      (K.modo === 'fone' ? '<label class="campo-rot">Seu celular com DDD<input class="campo num" id="ctContato" data-foco inputmode="tel" autocomplete="tel" placeholder="(16) 99999-9999" value="' + esc(K.contato) + '"></label>'
        : '<label class="campo-rot">Seu email<input class="campo" id="ctContato" data-foco type="email" inputmode="email" autocomplete="email" placeholder="voce@email.com" value="' + esc(K.contato) + '"></label>') +
      '<p class="ct-erro" id="ctErro" role="alert"></p><button class="btn btn-verde ct-largo" type="submit">' + (K.modo === 'fone' ? 'Receber código por email' : 'Receber código') + ' <span class="seta" aria-hidden="true">→</span></button></form>' +
      '<p class="ct-nota">Sem senha: a cada acesso mandamos um código de 6 números para o seu email.</p>',
    novo: () => {
      const porFone = K.novo.tipo === 'fone';
      return '<div class="ct-arte pequena" aria-hidden="true">' + arteOla() + '</div><h2 id="contaTit">Prazer! Vamos criar sua conta</h2>' +
        '<p class="ct-sub">É rapidinho: o código de acesso vai para o seu email.</p>' +
        '<form class="ct-form" id="ctFormNovo" novalidate><label class="campo-rot">Como podemos te chamar?<input class="campo" id="ctNome" data-foco autocomplete="name" maxlength="80" value="' + esc(K.envio && K.envio.nome || '') + '"></label>' +
        (porFone ? '<label class="campo-rot">Seu email<input class="campo" id="ctEmail" type="email" inputmode="email" autocomplete="email" placeholder="voce@email.com" value="' + esc(K.envio && K.envio.email || '') + '"></label><p class="ct-fixo">Celular: <b>' + esc(K.novo.fone) + '</b></p>'
          : '<label class="campo-rot">Celular (WhatsApp) com DDD<input class="campo num" id="ctFone" inputmode="tel" autocomplete="tel" placeholder="(16) 99999-9999" value="' + esc(K.envio && K.envio.fone || '') + '"></label><p class="ct-fixo">Email: <b>' + esc(K.novo.email) + '</b></p>') +
        '<label class="ct-check"><input type="checkbox" id="ctOfertas"' + (K.envio && K.envio.ofertas ? ' checked' : '') + '><span>Quero receber promoções da pizzaria por email</span></label>' +
        '<p class="ct-erro" id="ctErro" role="alert"></p><button class="btn btn-verde ct-largo" type="submit">Enviar código <span class="seta" aria-hidden="true">→</span></button></form>' +
        '<p class="ct-nota">Usamos seus dados só para os seus pedidos e, se você deixar, para promoções. Dá para excluir a conta quando quiser.</p>';
    },
    codigo: () => '<div class="ct-arte" aria-hidden="true">' + arteEnvelope() + '</div><h2 id="contaTit">Confira seu email</h2>' +
      '<p class="ct-sub">Mandamos um código de 6 números para <b>' + esc(K.para) + '</b>.</p>' +
      '<div class="ct-cod" id="ctCod"><input id="ctCodigo" data-foco type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="6" spellcheck="false" aria-label="Código de 6 números"><div class="ct-cod-caixas" aria-hidden="true">' + '<span></span>'.repeat(6) + '</div></div>' +
      '<p class="ct-erro" id="ctErro" role="alert"></p><button class="btn btn-verde ct-largo" type="button" data-ct="confirmar">Entrar</button>' +
      '<p class="ct-nota"><button type="button" class="link-acao" data-ct="reenviar" id="ctReenviar" disabled>Reenviar o código</button> · não chegou? Olhe também o spam e as promoções.</p>',
    ok: () => '<div class="ct-ok" aria-hidden="true"><svg viewBox="0 0 120 120"><circle class="ct-ok-anel" cx="60" cy="60" r="50"/><path class="ct-ok-check" d="M37 62 52 77 84 44"/></svg><span class="ct-ok-av">' + esc(inicial(K.conta && K.conta.nome)) + '</span>' +
      Array.from({ length: 14 }, (_, i) => '<i class="ct-conf" style="--a:' + Math.round(i * 360 / 14 + (i % 2) * 9) + 'deg;--d:' + (62 + (i % 3) * 16) + 'px;--c:' + ['#C1121F', '#0F4D23', '#C8952E', '#E2632B'][i % 4] + '"></i>').join('') + '</div>' +
      '<h2 id="contaTit">Olá, ' + esc(primeiro(K.conta && K.conta.nome) || 'tudo certo') + '!</h2><p class="ct-sub">' + (K.vinculados ? 'Você entrou, e ' + (K.vinculados === 1 ? 'o pedido que fez neste aparelho já está' : 'os ' + K.vinculados + ' pedidos que fez neste aparelho já estão') + ' na sua conta.' : 'Você entrou. Seus endereços e pedidos ficam guardados aqui.') + '</p>',
    fone: () => '<div class="ct-arte pequena" aria-hidden="true">' + arteOla() + '</div><h2 id="contaTit">Qual o seu WhatsApp?</h2><p class="ct-sub">Para a pizzaria falar com você sobre o pedido. Também serve para entrar sem o Google.</p>' +
      '<form class="ct-form" id="ctFormFone" novalidate><label class="campo-rot">Celular com DDD<input class="campo num" id="ctFone" data-foco inputmode="tel" autocomplete="tel" placeholder="(16) 99999-9999"></label><p class="ct-erro" id="ctErro" role="alert"></p>' +
      '<button class="btn btn-verde ct-largo" type="submit">Salvar</button><button class="btn btn-ghost ct-largo" type="button" data-ct="depois">Depois</button></form>',
    conta: () => {
      const c = K.conta || {};
      return '<div class="ct-perfil"><span class="ct-av" aria-hidden="true">' + esc(inicial(c.nome)) + '</span><div><h2 id="contaTit">Olá, ' + esc(primeiro(c.nome) || 'cliente') + '</h2><small>' + esc(c.email) + (c.google ? ' · Google' : '') + '</small></div></div>' +
        '<div class="ct-abas" role="tablist">' + [['pedidos', 'Pedidos'], ['enderecos', 'Endereços'], ['dados', 'Meus dados']].map(([id, n]) => '<button type="button" role="tab" data-aba="' + id + '" aria-selected="' + (K.aba === id) + '">' + n + '</button>').join('') + '</div>' +
        '<div class="ct-aba" id="ctAba" role="tabpanel"></div>';
    }
  };
  const APOS = {
    inicio: (cx) => { if (K.google) poeGoogle($('#ctGoogle', cx)); },
    codigo: (cx) => { contaReenvio(); desenhaCaixas(''); },
    ok: (cx) => {
      if (anima()) {
        const av = $('.ct-ok-av', cx);
        if (av) av.animate([{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(0)', opacity: 0, offset: 0.55 }, { transform: 'scale(1.15)', opacity: 1, offset: 0.8 }, { transform: 'none', opacity: 1 }], { duration: 1150, easing: 'cubic-bezier(.2,.9,.3,1.2)', fill: 'both' });
      }
      const precisaFone = K.conta && !K.conta.fone;
      setTimeout(() => {
        if (K.passo !== 'ok') return;
        if (precisaFone) { vai('fone'); return; }
        terminaEntrada(true);
      }, anima() ? 1650 : 700);
    },
    conta: () => desenhaAba()
  };
  function terminaEntrada(voar) {
    const av = $('#conta .ct-ok-av') || $('#conta .ct-av');
    const depois = K.depois;
    if (voar) voaAvatar(av);
    fecha();
    if (C.aoEntrar) C.aoEntrar(K.conta);
    if (depois) setTimeout(depois, 60);
    else C.toast('Pronto, ' + (primeiro(K.conta && K.conta.nome) || 'você entrou') + '! Seus dados já entram no pedido.');
  }
  function voaAvatar(de) {
    const alvo = $('#contaBtn .ct-btn-av');
    if (!de || !alvo || !anima()) { desenhaBotao(true); return; }
    const a = de.getBoundingClientRect();
    desenhaBotao(false);
    const b = $('#contaBtn .ct-btn-av').getBoundingClientRect();
    if (!a.width || !b.width) { desenhaBotao(true); return; }
    const v = document.createElement('div');
    v.className = 'ct-voa'; v.textContent = de.textContent;
    Object.assign(v.style, { left: a.left + 'px', top: a.top + 'px', width: a.width + 'px', height: a.height + 'px', fontSize: Math.round(a.height * 0.46) + 'px' });
    document.body.appendChild(v);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2), s = b.width / a.width;
    const alvoEl = $('#contaBtn .ct-btn-av');
    alvoEl.style.opacity = '0';
    const an = v.animate([{ transform: 'none' }, { transform: 'translate(' + dx * 0.45 + 'px,' + (dy * 0.45 - 90) + 'px) scale(' + (1 + s) / 2 + ')', offset: 0.5 }, { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + s + ')' }], { duration: 760, easing: 'cubic-bezier(.45,0,.25,1)', fill: 'forwards' });
    an.onfinish = () => { v.remove(); alvoEl.style.opacity = ''; alvoEl.animate([{ transform: 'scale(1.35)' }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.2,.9,.3,1.4)' }); const btn = $('#contaBtn'); if (btn) btn.animate([{ boxShadow: '0 0 0 0 rgba(15,77,35,.45)' }, { boxShadow: '0 0 0 14px rgba(15,77,35,0)' }], { duration: 700 }); };
  }

  /* ---------- ilustrações ---------- */
  function arteEntrar() {
    return '<svg viewBox="0 0 220 120"><ellipse cx="110" cy="108" rx="78" ry="7" fill="#2B1A0E" opacity=".08"/>' +
      '<g class="ct-a-cel"><rect x="72" y="8" width="76" height="98" rx="14" fill="#1E1B16"/><rect x="78" y="18" width="64" height="80" rx="8" fill="#FBF4E6"/>' +
      '<g transform="translate(110 50)"><g class="ct-a-pz"><circle r="21" fill="#E3A85A" stroke="#B9783A" stroke-width="2"/><circle r="16" fill="#C93F20"/><circle cx="-6" cy="-5" r="3" fill="#F1C766"/><circle cx="6" cy="-2" r="3" fill="#F1C766"/><circle cx="-1" cy="7" r="3" fill="#F1C766"/></g></g>' +
      '<rect x="88" y="80" width="44" height="10" rx="5" fill="#0F4D23"/></g>' +
      '<g transform="translate(166 30)"><g class="ct-a-coracao"><path d="M0 6 C0 -2 10 -4 12 3 C14 -4 24 -2 24 6 C24 14 12 20 12 22 C12 20 0 14 0 6Z" fill="#C1121F"/></g></g>' +
      '<g transform="translate(22 44)"><g class="ct-a-casa"><path d="M4 18 L20 4 L36 18 V40 H4Z" fill="#F1DDAE" stroke="#B9783A" stroke-width="2.5" stroke-linejoin="round"/><rect x="15" y="26" width="10" height="14" fill="#0F4D23"/></g></g></svg>';
  }
  function arteOla() {
    return '<svg viewBox="0 0 120 70"><g class="ct-a-mao" transform="translate(60 38)"><circle r="26" fill="#F1DDAE"/><text y="10" text-anchor="middle" font-size="30">👋</text></g></svg>';
  }
  function arteEnvelope() {
    return '<svg viewBox="0 0 220 120"><ellipse cx="110" cy="110" rx="70" ry="6" fill="#2B1A0E" opacity=".08"/>' +
      '<g class="ct-a-env"><rect x="58" y="34" width="104" height="68" rx="8" fill="#F1DDAE" stroke="#B9783A" stroke-width="2.5"/>' +
      '<g class="ct-a-carta"><rect x="70" y="20" width="80" height="58" rx="6" fill="#fff" stroke="#E5D6BA" stroke-width="2"/>' + [0, 1, 2, 3, 4, 5].map((i) => '<circle cx="' + (82 + i * 11.2) + '" cy="44" r="3.6" fill="#0F4D23"/>').join('') + '<rect x="80" y="56" width="60" height="5" rx="2.5" fill="#E5D6BA"/></g>' +
      '<path d="M58 40 L110 76 L162 40 V96 a6 6 0 0 1 -6 6 H64 a6 6 0 0 1 -6 -6Z" fill="#EAD7B2" stroke="#B9783A" stroke-width="2.5" stroke-linejoin="round"/></g>' +
      '<g transform="translate(178 22)"><g class="ct-a-aviao"><path d="M0 8 L22 0 L14 20 L10 12Z" fill="#0F4D23"/><path d="M-30 18 q12 -2 24 -8" stroke="#0F4D23" stroke-width="2" stroke-dasharray="3 5" fill="none" opacity=".5"/></g></g></svg>';
  }

  /* ======================= Google ======================= */
  let gisP = null;
  function carregaGis() {
    if (window.google && window.google.accounts && window.google.accounts.id) return Promise.resolve();
    if (!gisP) gisP = new Promise((ok, falha) => { const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = ok; s.onerror = () => { gisP = null; falha(new Error('google')); }; document.head.appendChild(s); });
    return gisP;
  }
  async function poeGoogle(box) {
    if (!box) return;
    try {
      await carregaGis();
      if (!K.gisPronto) {
        google.accounts.id.initialize({ client_id: K.google, callback: aoGoogle, ux_mode: 'popup', auto_select: false, cancel_on_tap_outside: true, use_fedcm_for_prompt: true });
        K.gisPronto = true;
      }
      if (!document.contains(box)) return;
      box.innerHTML = '';
      google.accounts.id.renderButton(box, { type: 'standard', theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', logo_alignment: 'center', locale: 'pt-BR', width: Math.max(220, Math.min(380, Math.round(box.getBoundingClientRect().width || 320))) });
    } catch (e) { box.innerHTML = '<span class="ct-google-carregando">O Google não respondeu. Use o celular ou o email abaixo.</span>'; }
  }
  async function aoGoogle(resp) {
    const box = $('#conta');
    if (!box || box.hidden) abre('inicio');
    erroEm('');
    ocupa(true);
    try {
      const j = await api('POST', '/api/conta/google', { credential: resp && resp.credential, tokens: tokensAparelho() });
      entrou(j);
    } catch (e) { ocupa(false); erroEm(e.message); }
  }

  /* ======================= fluxo de entrada ======================= */
  const erroEm = (msg) => { const e = $('#ctErro'); if (e) { e.textContent = msg || ''; if (msg && anima()) e.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'none' }], { duration: 300 }); } };
  function ocupa(on) { K.ocupado = on; $$('#conta .ct-caixa button[type="submit"], #conta [data-ct="confirmar"]').forEach((b) => { b.disabled = on; b.classList.toggle('ocupado', on); }); }
  async function pedeCodigo(rota, corpo) {
    ocupa(true); erroEm('');
    try {
      const j = await api('POST', rota, corpo);
      ocupa(false);
      if (j.novo) { K.novo = j; K.envio = Object.assign({}, K.envio || {}, j.tipo === 'fone' ? { fone: j.fone } : { email: j.email }); vai('novo'); return; }
      K.desafio = j.desafio; K.para = j.para; K.ultimoEnvio = { rota, corpo }; K.reenvio = Date.now() + 30000;
      vai('codigo');
    } catch (e) { ocupa(false); erroEm(e.message); }
  }
  function contaReenvio() {
    const b = $('#ctReenviar');
    if (!b) return;
    const tic = () => { const s = Math.ceil((K.reenvio - Date.now()) / 1000); if (!document.contains(b)) { clearInterval(K.timer); return; } b.disabled = s > 0; b.textContent = s > 0 ? 'Reenviar em ' + s + ' s' : 'Reenviar o código'; if (s <= 0) clearInterval(K.timer); };
    clearInterval(K.timer); tic(); K.timer = setInterval(tic, 1000);
  }
  function desenhaCaixas(v, nova) {
    const cx = $$('#ctCod .ct-cod-caixas span');
    const foco = document.activeElement && document.activeElement.id === 'ctCodigo';
    cx.forEach((s, i) => {
      const d = v[i] || '';
      if (s.textContent !== d) { s.textContent = d; if (d && nova && anima()) s.animate([{ transform: 'scale(.4)', opacity: 0 }, { transform: 'scale(1.12)', opacity: 1, offset: 0.7 }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.9,.3,1.3)' }); }
      s.classList.toggle('cheio', !!d);
      s.classList.toggle('atual', foco && i === Math.min(v.length, 5) && v.length < 6);
    });
  }
  async function confirma() {
    const inp = $('#ctCodigo');
    const v = inp ? inp.value.replace(/\D/g, '') : '';
    if (v.length !== 6) { erroEm('Digite os 6 números do código.'); return; }
    if (K.ocupado) return;
    ocupa(true); erroEm('');
    try {
      const j = await api('POST', '/api/conta/verificar', { desafio: K.desafio, codigo: v, tokens: tokensAparelho() });
      const cx = $$('#ctCod .ct-cod-caixas span');
      cx.forEach((s, i) => { s.style.transitionDelay = i * 45 + 'ms'; s.classList.add('certo'); });
      setTimeout(() => entrou(j), anima() ? 420 : 0);
    } catch (e) {
      ocupa(false);
      erroEm(e.message);
      const caixas = $('#ctCod .ct-cod-caixas');
      if (caixas) { caixas.classList.add('erro'); if (anima()) caixas.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-10px)' }, { transform: 'translateX(9px)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(4px)' }, { transform: 'none' }], { duration: 420 }); setTimeout(() => caixas.classList.remove('erro'), 900); }
      if (inp) { inp.value = ''; desenhaCaixas(''); inp.focus(); }
    }
  }
  function entrou(j) {
    ocupa(false);
    K.conta = j.conta; K.vinculados = j.vinculados || 0; K.pedidos = null; K.contato = ''; K.envio = null; K.novo = null;
    try { navigator.vibrate && navigator.vibrate(40); } catch (e) { /* sem vibração */ }
    vai('ok', 0);
  }

  /* ======================= Minha conta ======================= */
  function desenhaAba() {
    const box = $('#ctAba');
    if (!box) return;
    $$('#conta [data-aba]').forEach((b) => b.setAttribute('aria-selected', b.dataset.aba === K.aba));
    if (K.aba === 'pedidos') abaPedidos(box);
    else if (K.aba === 'enderecos') abaEnderecos(box);
    else abaDados(box);
  }
  const dataPedido = (iso) => { const d = new Date(iso); const t = d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '').toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1) + ' · ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
  const resumo = (p) => (p.itens || []).map((i) => i.qtd + 'x ' + (i.tipo === 'pizza' ? i.nome + (i.detalhe ? ' (' + i.detalhe.split(' · ')[0] + ')' : '') : i.nome)).join(' · ');
  function pizzaDo(p) {
    const pz = (p.itens || []).find((i) => i.tipo === 'pizza' && i.sabores && i.sabores.length);
    try { if (pz && C.miniSVG) return C.miniSVG({ sabores: pz.sabores.filter((s) => C.temSabor(s)), tamanho: pz.tamanho || 'grande', borda: pz.borda || 'sem' }); } catch (e) { /* sabor que saiu do cardápio */ }
    return '<svg viewBox="-60 -60 120 120" aria-hidden="true"><circle r="56" fill="#E3A85A"/><circle r="46" fill="#C93F20"/><circle r="40" fill="#F1C766" opacity=".85"/></svg>';
  }
  async function abaPedidos(box) {
    if (!K.pedidos || Date.now() - K.pedidosEm > 30000) {
      box.innerHTML = '<p class="ct-carregando">Buscando seus pedidos…</p>';
      try { K.pedidos = (await api('GET', '/api/conta/pedidos')).pedidos; K.pedidosEm = Date.now(); }
      catch (e) { if (e.status === 401) { K.conta = null; desenhaBotao(); vai('inicio'); return; } box.innerHTML = '<p class="ct-erro">' + esc(e.message) + '</p>'; return; }
      if (K.aba !== 'pedidos' || !document.contains(box)) return;
    }
    const l = K.pedidos;
    if (!l.length) {
      box.innerHTML = '<div class="ct-vazio"><div class="ct-vazio-pz">' + pizzaDo({}) + '</div><b>Nenhum pedido ainda</b><p>Os pedidos que você fizer entrando na conta aparecem aqui, prontos para pedir de novo.</p><button type="button" class="btn btn-verde" data-ct="montar">Montar minha pizza</button></div>';
      return;
    }
    box.innerHTML = '<ul class="ct-peds">' + l.map((p, i) => {
      const andamento = !['concluido', 'cancelado'].includes(p.status);
      return '<li class="ct-ped' + (andamento ? ' andamento' : '') + '"><div class="ct-ped-pz">' + pizzaDo(p) + '</div><div class="ct-ped-info"><div class="ct-ped-l1"><b>' + esc(dataPedido(p.criadoEm)) + '</b><span class="ct-st st-' + esc(p.status) + '">' + esc(NOME_STATUS[p.status] || p.status) + '</span></div>' +
        '<p>' + esc(resumo(p)) + '</p><small>' + esc(p.codigo) + ' · ' + brl(p.total) + ' · ' + (p.modo === 'entrega' ? 'Entrega' + (p.endereco && p.endereco.bairro ? ' no ' + esc(p.endereco.bairro) : '') : 'Retirada') + '</small>' +
        '<div class="ct-ped-acoes"><button type="button" class="btn btn-verde ct-denovo" data-ct="denovo" data-i="' + i + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 0 1 13.7-5.6L20 9M20 4v5h-5M20 12a8 8 0 0 1-13.7 5.6L4 15m0 5v-5h5"/></svg>Pedir de novo</button>' +
        (andamento ? '<a class="btn btn-ghost" href="#acompanhar/' + esc(p.token) + '" data-ct="acompanhar">Acompanhar</a>' : '') + '</div></div></li>';
    }).join('') + '</ul>';
    if (anima()) $$('.ct-ped', box).forEach((el, i) => el.animate([{ transform: 'translateY(14px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 380, delay: 40 + i * 55, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' }));
  }
  function textoEndereco(e) { return [[e.rua, e.numero].filter(Boolean).join(', '), e.compl, e.bairro].filter(Boolean).join(' · '); }
  function abaEnderecos(box) {
    const l = (K.conta && K.conta.enderecos) || [];
    box.innerHTML = l.length ? '<ul class="ct-ends">' + l.map((e, i) => '<li><span class="ct-end-ico" aria-hidden="true">' + (e.apelido === 'Trabalho' ? '💼' : e.apelido === 'Casa' ? '🏠' : '📍') + '</span><div><b>' + esc(textoEndereco(e)) + '</b><small>' + esc((e.cidade || '').replace('/', ' - ')) + (e.km != null ? ' · ' + String(e.km).replace('.', ',') + ' km da pizzaria' : '') + '</small>' +
      '<div class="ct-apelidos">' + ['Casa', 'Trabalho'].map((a) => '<button type="button" class="chip" data-ct="apelido" data-i="' + i + '" data-v="' + a + '" aria-pressed="' + (e.apelido === a) + '">' + a + '</button>').join('') + '</div></div><button type="button" class="ct-tira" data-ct="tira-end" data-i="' + i + '" aria-label="Remover este endereço">×</button></li>').join('') + '</ul>' +
      '<p class="ct-nota">Os endereços entram aqui sozinhos quando você faz um pedido para entrega.</p>'
      : '<div class="ct-vazio"><b>Nenhum endereço salvo</b><p>Quando você fizer um pedido para entrega, o endereço fica guardado aqui para a próxima.</p></div>';
  }
  function abaDados(box) {
    const c = K.conta || {};
    box.innerHTML = '<form class="ct-form" id="ctFormDados" novalidate><label class="campo-rot">Nome<input class="campo" id="ctDNome" autocomplete="name" maxlength="80" value="' + esc(c.nome) + '"></label>' +
      '<label class="campo-rot">Celular (WhatsApp)<input class="campo num" id="ctDFone" inputmode="tel" autocomplete="tel" placeholder="(16) 99999-9999" value="' + esc(c.fone) + '"></label>' +
      '<label class="campo-rot">Email<input class="campo" value="' + esc(c.email) + '" disabled></label>' +
      '<label class="ct-check"><input type="checkbox" id="ctDOfertas"' + (c.ofertas ? ' checked' : '') + '><span>Quero receber promoções da pizzaria por email</span></label>' +
      '<p class="ct-erro" id="ctErro" role="alert"></p><button class="btn btn-verde ct-largo" type="submit">Salvar alterações</button></form>' +
      '<div class="ct-sair"><button type="button" class="btn btn-ghost ct-largo" data-ct="sair">Sair da conta</button><button type="button" class="link-acao perigo" data-ct="excluir">Excluir minha conta</button></div>';
  }
  async function salvaConta(campos, msg) {
    try { const j = await api('PATCH', '/api/conta', campos); K.conta = j.conta; desenhaBotao(); if (msg) C.toast(msg); return true; }
    catch (e) { if (e.status === 401) { K.conta = null; desenhaBotao(); vai('inicio'); } else { erroEm(e.message); if (!$('#ctErro')) C.toast(e.message); } return false; }
  }
  function pedirDeNovo(i, botao) {
    const p = K.pedidos && K.pedidos[i];
    if (!p) return;
    const r = C.pedirDeNovo(p);
    if (!r.n) { C.toast(r.faltou.length ? 'Os itens desse pedido não estão disponíveis agora.' : 'Não deu para repetir esse pedido.'); return; }
    // a pizza do cartão voa até o botão do pedido
    const de = botao && botao.closest('.ct-ped') && $('.ct-ped-pz svg', botao.closest('.ct-ped'));
    const ir = () => { fecha(); setTimeout(() => C.abrirPedido(r), 80); };
    if (!de || !anima()) { ir(); return; }
    const fab = $('#fab');
    const a = de.getBoundingClientRect();
    const voa = de.cloneNode(true);
    voa.classList.add('ct-voa-pz');
    Object.assign(voa.style, { left: a.left + 'px', top: a.top + 'px', width: a.width + 'px', height: a.height + 'px' });
    document.body.appendChild(voa);
    fecha();
    requestAnimationFrame(() => {
      const b = fab && fab.getBoundingClientRect();
      const bx = b && b.width ? b.left + b.width / 2 : innerWidth - 60, by = b && b.width ? b.top + b.height / 2 : innerHeight - 50;
      const dx = bx - (a.left + a.width / 2), dy = by - (a.top + a.height / 2);
      const an = voa.animate([{ transform: 'none', opacity: 1 }, { transform: 'translate(' + dx * 0.4 + 'px,' + (Math.min(dy * 0.4, 0) - 120) + 'px) rotate(200deg) scale(1.25)', offset: 0.45 }, { transform: 'translate(' + dx + 'px,' + dy + 'px) rotate(420deg) scale(.25)', opacity: 0.9 }], { duration: 820, easing: 'cubic-bezier(.45,0,.3,1)', fill: 'forwards' });
      an.onfinish = () => { voa.remove(); if (fab) fab.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.16)' }, { transform: 'scale(.96)' }, { transform: 'scale(1)' }], { duration: 480, easing: 'ease-out' }); setTimeout(() => C.abrirPedido(r), 160); };
    });
  }

  /* ======================= eventos ======================= */
  function liga(box) {
    box.addEventListener('click', async (e) => {
      if (e.target === box) { fecha(); return; }
      const b = e.target.closest('[data-ct], [data-modo], [data-aba]');
      if (!b) return;
      if (b.dataset.modo) { K.modo = b.dataset.modo; K.contato = ''; vai('inicio', 0); const i = $('#ctContato'); if (i) i.focus(); return; }
      if (b.dataset.aba) { K.aba = b.dataset.aba; desenhaAba(); return; }
      const a = b.dataset.ct;
      if (a === 'fechar') fecha();
      else if (a === 'voltar') vai(K.passo === 'codigo' && K.novo ? 'novo' : 'inicio', -1);
      else if (a === 'confirmar') confirma();
      else if (a === 'reenviar' && K.ultimoEnvio) { b.disabled = true; await pedeCodigo(K.ultimoEnvio.rota, K.ultimoEnvio.corpo); if (K.passo === 'codigo') C.toast('Mandamos um código novo.'); }
      else if (a === 'depois') terminaEntrada(true);
      else if (a === 'montar') { fecha(); C.abrirMontador(); }
      else if (a === 'denovo') pedirDeNovo(+b.dataset.i, b);
      else if (a === 'acompanhar') { fecha(); }
      else if (a === 'apelido') {
        const l = K.conta.enderecos.slice(); const e2 = Object.assign({}, l[+b.dataset.i]);
        e2.apelido = e2.apelido === b.dataset.v ? '' : b.dataset.v; l[+b.dataset.i] = e2;
        if (await salvaConta({ enderecos: l })) desenhaAba();
      } else if (a === 'tira-end') {
        const l = K.conta.enderecos.filter((_, i) => i !== +b.dataset.i);
        const li = b.closest('li');
        const segue = async () => { if (await salvaConta({ enderecos: l }, 'Endereço removido.')) desenhaAba(); };
        if (li && anima()) li.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(30px)' }], { duration: 220 }).onfinish = segue; else segue();
      } else if (a === 'sair') {
        try { await api('POST', '/api/conta/sair', {}); } catch (er) { /* já saiu */ }
        K.conta = null; K.pedidos = null; desenhaBotao(); fecha(); if (C.aoSair) C.aoSair(); C.toast('Você saiu da conta.');
      } else if (a === 'excluir') {
        if (!confirm('Excluir a sua conta? Seus endereços salvos e a lista de pedidos somem daqui. Os pedidos continuam registrados na pizzaria. Não dá para desfazer.')) return;
        try { await api('DELETE', '/api/conta', { confirmo: true }); K.conta = null; K.pedidos = null; desenhaBotao(); fecha(); C.toast('Sua conta foi excluída.'); }
        catch (er) { C.toast(er.message); }
      }
    });
    box.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      if (f.id === 'ctFormContato') {
        const v = $('#ctContato').value.trim();
        K.contato = v;
        if (K.modo === 'email' ? !/^\S+@\S+\.\S+$/.test(v) : v.replace(/\D/g, '').length < 10) { erroEm(K.modo === 'email' ? 'Digite o seu email.' : 'Digite o celular com DDD.'); return; }
        pedeCodigo('/api/conta/entrar', { contato: v });
      } else if (f.id === 'ctFormNovo') {
        const porFone = K.novo.tipo === 'fone';
        const env = { nome: $('#ctNome').value.trim(), email: porFone ? $('#ctEmail').value.trim() : K.novo.email, fone: porFone ? K.novo.fone : $('#ctFone').value.trim(), ofertas: $('#ctOfertas').checked };
        K.envio = env;
        if (env.nome.length < 2) { erroEm('Como podemos te chamar?'); return; }
        if (!/^\S+@\S+\.\S+$/.test(env.email)) { erroEm('Digite o seu email.'); return; }
        if (env.fone.replace(/\D/g, '').length < 10) { erroEm('Digite o celular com DDD.'); return; }
        pedeCodigo('/api/conta/cadastro', env);
      } else if (f.id === 'ctFormFone') {
        const v = $('#ctFone').value.trim();
        if (v.replace(/\D/g, '').length < 10) { erroEm('Digite o celular com DDD.'); return; }
        if (await salvaConta({ fone: v })) terminaEntrada(false);
      } else if (f.id === 'ctFormDados') {
        const ok = await salvaConta({ nome: $('#ctDNome').value.trim(), fone: $('#ctDFone').value.trim(), ofertas: $('#ctDOfertas').checked }, 'Dados salvos.');
        if (ok) { const t = $('#conta .ct-perfil h2'); if (t) t.textContent = 'Olá, ' + (primeiro(K.conta.nome) || 'cliente'); const av = $('#conta .ct-av'); if (av) av.textContent = inicial(K.conta.nome); }
      }
    });
    box.addEventListener('input', (e) => {
      const t = e.target;
      if (t.id === 'ctCodigo') {
        const v = t.value.replace(/\D/g, '').slice(0, 6);
        if (t.value !== v) t.value = v;
        erroEm('');
        desenhaCaixas(v, true);
        if (v.length === 6) confirma();
      } else if ((t.id === 'ctContato' && K.modo === 'fone') || t.id === 'ctFone' || t.id === 'ctDFone') {
        if (e.inputType && e.inputType.startsWith('delete')) return;
        const f = mascaraFone(t.value);
        if (f !== t.value) t.value = f;
      }
    });
    box.addEventListener('focusin', (e) => { if (e.target.id === 'ctCodigo') desenhaCaixas(e.target.value); });
    box.addEventListener('focusout', (e) => { if (e.target.id === 'ctCodigo') setTimeout(() => { const i = $('#ctCodigo'); if (i) desenhaCaixas(i.value); }, 0); });
  }
  document.addEventListener('keydown', (e) => { const b = $('#conta'); if (e.key === 'Escape' && b && !b.hidden) { e.stopImmediatePropagation(); fecha(); } }, true);

  /* ======================= API para o app.js ======================= */
  window.ContaPP = {
    async iniciar(ctx) {
      C = ctx;
      const b = $('#contaBtn');
      if (b) b.addEventListener('click', () => abre(K.conta ? 'conta' : 'inicio'));
      K.servidor = !!(window.PedidosPP && (await PedidosPP.pronto));
      if (!K.servidor) { desenhaBotao(); return; }
      // o Google só aceita o botão em https ou em localhost: num endereço http da rede, ele daria erro para o cliente
      const googleAceita = location.protocol === 'https:' || location.hostname === 'localhost';
      try { const [eu, cfg] = await Promise.all([api('GET', '/api/conta'), api('GET', '/api/conta/config')]); K.conta = eu.conta; K.google = googleAceita ? cfg.google : null; } catch (e) { K.conta = null; }
      K.pronta = true;
      desenhaBotao();
      if (K.conta && C.aoEntrar) C.aoEntrar(K.conta, true);
      const hash = () => { if (location.hash === '#conta') abre(K.conta ? 'conta' : 'inicio'); else if (location.hash === '#entrar') abre(K.conta ? 'conta' : 'inicio'); };
      hash();
      window.addEventListener('hashchange', hash);
    },
    get conta() { return K.conta; },
    get ativa() { return K.servidor; },
    entrar(depois) { abre(K.conta ? 'conta' : 'inicio', { depois }); },
    minhaConta() { abre('conta'); },
    // depois de um pedido feito logado: o histórico precisa ser buscado de novo
    pedidoFeito() { K.pedidos = null; if (K.conta) api('GET', '/api/conta').then((j) => { if (j.conta) K.conta = j.conta; }).catch(() => {}); },
    fechar: fecha
  };
})();
