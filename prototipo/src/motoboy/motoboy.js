/* App do entregador. Roda no navegador (/motoboy) e dentro do app Android (WebView).
   No Android, window.PereiraNativo é a ponte com o serviço nativo de localização: ele segue mandando a posição com
   a tela desligada e com o Waze/Maps abertos. No navegador, a posição só sai com esta tela aberta (Wake Lock). */
(function () {
  'use strict';
  const LOJA = JSON.parse(document.getElementById('pp-loja').textContent);
  const NATIVO = window.PereiraNativo || null;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const brl = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const REDUZ = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pref = { get: (k, d) => { try { const v = localStorage.getItem('pp-moto-' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem('pp-moto-' + k, JSON.stringify(v)); } catch (e) { /* sem storage */ } } };
  async function api(met, url, corpo) {
    const r = await fetch(url, { method: met, credentials: 'same-origin', cache: 'no-store', headers: corpo ? { 'Content-Type': 'application/json' } : {}, body: corpo ? JSON.stringify(corpo) : undefined });
    let j = null;
    try { j = await r.json(); } catch (e) { /* sem corpo */ }
    if (!r.ok) { const e = new Error((j && j.erro) || 'Sem conexão com a pizzaria.'); e.status = r.status; throw e; }
    return j;
  }
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 3200); }
  $('#logo').src = LOJA.logo; $('#logo').alt = LOJA.nome;

  const S = { eu: null, jornada: null, entregas: [], fonte: null, pos: null, ultimoEnvio: null, bateria: null, nativoEstado: null, conhecidas: null, relogio: null, audio: null, avisoGps: null };
  // o navegador só libera o GPS em https (ou localhost); na rede local por http, só o app Android rastreia
  const SEM_HTTPS = 'Neste endereço (sem https) o navegador não libera o GPS. No Android, use o app; no iPhone, abra o endereço https da pizzaria.';
  const rad = (g) => (g * Math.PI) / 180;
  function metros(a, b) { const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng); const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2; return 2 * 6371000 * Math.asin(Math.sqrt(h)); }
  const distTxt = (m) => (m >= 1000 ? (m / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(m / 10) * 10 + ' m');

  /* ---------- som e vibração ---------- */
  function liberaAudio() { try { S.audio = S.audio || new (window.AudioContext || window.webkitAudioContext)(); if (S.audio.state === 'suspended') S.audio.resume(); } catch (e) { S.audio = null; } }
  function bip() {
    try { if (navigator.vibrate) navigator.vibrate([250, 120, 250]); } catch (e) { /* sem vibração */ }
    if (!S.audio) return;
    const t0 = S.audio.currentTime + 0.02;
    [[880, 0], [1175, 0.16], [1568, 0.32]].forEach(([f, d]) => { const o = S.audio.createOscillator(), g = S.audio.createGain(); o.type = 'triangle'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t0 + d); g.gain.exponentialRampToValueAtTime(0.35, t0 + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.28); o.connect(g); g.connect(S.audio.destination); o.start(t0 + d); o.stop(t0 + d + 0.3); });
  }
  document.addEventListener('pointerdown', liberaAudio, { once: true });

  /* ---------- rastreamento no navegador (sem o app nativo) ---------- */
  const W = { watch: null, fila: [], timer: null, intervalo: 5, enviando: false, lock: null };
  async function bateria() { try { if (navigator.getBattery) { const b = await navigator.getBattery(); return Math.round(b.level * 100); } } catch (e) { /* sem acesso */ } return null; }
  function iniciaWeb() {
    const falta = !window.isSecureContext ? SEM_HTTPS : !navigator.geolocation ? 'Este navegador não tem GPS. No Android, use o app.' : '';
    if (falta) { if (S.avisoGps !== falta) { toast('Sem GPS neste navegador: veja o aviso na tela.'); avisoGps(falta); } return; }
    if (W.watch == null) W.watch = navigator.geolocation.watchPosition((p) => {
      const c = p.coords;
      const pt = { t: p.timestamp || Date.now(), lat: c.latitude, lng: c.longitude, precisao: c.accuracy, velocidade: c.speed, rumo: c.heading };
      W.fila.push(pt); if (W.fila.length > 600) W.fila.shift();
      S.pos = pt; S.avisoGps = null; atualizaInfo(); atualizaDistancias();
    }, (er) => { if (er.code === 1) { toast('Permita a localização para a pizzaria acompanhar a entrega.'); avisoGps('Sem permissão de localização. Libere nas configurações do navegador.'); } }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 30000 });
    clearInterval(W.timer);
    W.timer = setInterval(enviaWeb, 1000);
    pedeTelaLigada();
  }
  function paraWeb() {
    if (W.watch != null) { navigator.geolocation.clearWatch(W.watch); W.watch = null; }
    clearInterval(W.timer); W.timer = null; W.fila = []; S.avisoGps = null;
    if (W.lock) { W.lock.release().catch(() => {}); W.lock = null; }
  }
  async function enviaWeb() {
    if (W.enviando) return;
    const desde = S.ultimoEnvio ? Date.now() - S.ultimoEnvio : Infinity;
    if (desde < W.intervalo * 1000 || (!W.fila.length && desde < 30000)) return;
    W.enviando = true;
    const lote = W.fila.splice(0);
    try {
      const r = await api('POST', '/api/motoboy/posicao', { pontos: lote, bateria: (S.bateria = await bateria()), nativo: false });
      S.ultimoEnvio = Date.now();
      if (r.intervalo) W.intervalo = r.intervalo;
      if (r.jornada === false) { paraWeb(); carrega(); }
    } catch (e) { W.fila.unshift(...lote); if (e.status === 401) { paraWeb(); telaParear(); } }
    W.enviando = false;
    atualizaInfo();
  }
  async function pedeTelaLigada() {
    try { if ('wakeLock' in navigator && !W.lock && document.visibilityState === 'visible') { W.lock = await navigator.wakeLock.request('screen'); W.lock.addEventListener('release', () => { W.lock = null; }); } } catch (e) { /* sem wake lock */ }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { if (W.watch != null) pedeTelaLigada(); if (S.eu) carrega(); } });

  /* ---------- ponte com o app Android ---------- */
  window.__nativo = (ev, dados) => {
    if (ev === 'estado' && dados) { S.nativoEstado = dados; if (dados.ultimaPosicao) S.pos = dados.ultimaPosicao; if (dados.ultimoEnvio) S.ultimoEnvio = dados.ultimoEnvio; if (dados.bateria != null) S.bateria = dados.bateria; atualizaInfo(); atualizaDistancias(); }
    else if (ev === 'permissao' && dados && !dados.ok) { toast(dados.msg || 'Sem permissão de localização.'); api('POST', '/api/motoboy/jornada', { acao: 'encerrar' }).finally(carrega); }
    else if (ev === 'parou') carrega();
    else if (ev === 'retomou') carrega();
  };
  const estadoNativo = () => { try { return JSON.parse(NATIVO.estado()); } catch (e) { return null; } };
  function rastreando() { return NATIVO ? !!(estadoNativo() || {}).rastreando : W.watch != null; }
  function ligaRastreio() { if (NATIVO) { if (!(estadoNativo() || {}).rastreando) NATIVO.iniciarJornada(); } else iniciaWeb(); }
  function desligaRastreio() { if (NATIVO) NATIVO.encerrarJornada(); else paraWeb(); }

  /* ---------- telas ---------- */
  function telaParear(msg) {
    S.eu = null; paraWeb();
    if (S.fonte) { S.fonte.close(); S.fonte = null; }
    $('#quem').textContent = 'Entregador';
    $('#rede').hidden = true;
    $('#tela').innerHTML = '<section class="par"><div class="arte" aria-hidden="true">' + arteMoto() + '</div><h1>App do entregador</h1><p>Na gestão da ' + esc(LOJA.nome) + ', abra <b>Entregadores → Parear celular</b> e digite aqui o código de 6 números.</p>' +
      '<div class="cod"><input id="codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="6" aria-label="Código de 6 números"><div class="caixas" id="caixas" aria-hidden="true">' + '<span></span>'.repeat(6) + '</div></div>' +
      '<p class="erro-msg" id="erro" role="alert">' + esc(msg || '') + '</p><button type="button" class="b prim largo" id="parear">Entrar</button>' +
      (NATIVO ? '<button type="button" class="b largo" id="servidor">Trocar o endereço da pizzaria</button>' : '<p style="font-size:13px">No Android, instale o app para rastrear com a tela desligada: <a href="/motoboy/app.apk">baixar o app</a>.</p>') + '</section>';
    const inp = $('#codigo');
    const desenha = () => { const v = inp.value; $$('#caixas span').forEach((s, i) => { s.textContent = v[i] || ''; s.classList.toggle('cheio', !!v[i]); s.classList.toggle('atual', document.activeElement === inp && i === Math.min(v.length, 5) && v.length < 6); }); };
    inp.addEventListener('input', () => { inp.value = inp.value.replace(/\D/g, '').slice(0, 6); $('#erro').textContent = ''; $('#caixas').classList.remove('erro'); desenha(); if (inp.value.length === 6) parear(); });
    inp.addEventListener('focus', desenha); inp.addEventListener('blur', desenha);
    $('#parear').addEventListener('click', parear);
    if ($('#servidor')) $('#servidor').addEventListener('click', () => NATIVO.trocarServidor());
    const m = location.hash.match(/parear=(\d{6})/);
    if (m) { inp.value = m[1]; history.replaceState(null, '', location.pathname); desenha(); parear(); } else setTimeout(() => inp.focus(), 100);
  }
  function descreveAparelho() {
    const ua = navigator.userAgent;
    const m = ua.match(/Android [\d.]+;\s*([^;)]+)/);
    return (m ? m[1].replace(/Build\/.*/, '').trim() : /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : 'Navegador') + (NATIVO ? '' : ' (navegador)');
  }
  async function parear() {
    const v = $('#codigo').value;
    if (v.length !== 6) { $('#erro').textContent = 'Digite os 6 números.'; return; }
    $('#parear').disabled = true;
    try {
      const r = await api('POST', '/api/motoboy/parear', { codigo: v, aparelho: NATIVO && NATIVO.aparelho ? NATIVO.aparelho() : descreveAparelho() });
      if (NATIVO) NATIVO.guardarToken(r.token);
      toast('Pronto, ' + r.entregador.nome.split(' ')[0] + '! Celular pareado.');
      carrega();
    } catch (e) {
      $('#parear').disabled = false; $('#erro').textContent = e.message;
      const c = $('#caixas'); c.classList.add('erro');
      if (!REDUZ) c.animate([{ transform: 'translateX(-10px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(-5px)' }, { transform: 'none' }], { duration: 380 });
      $('#codigo').value = ''; $('#codigo').focus();
    }
  }
  function arteMoto() {
    return '<svg viewBox="0 0 320 150"><g class="estrada"><rect x="0" y="118" width="400" height="6" rx="3" fill="#24502F"/>' + Array.from({ length: 10 }, (_, i) => '<rect x="' + i * 40 + '" y="132" width="22" height="4" rx="2" fill="#2FBF6B" opacity=".5"/>').join('') + '</g>' +
      '<g transform="translate(160 92) scale(4.2)"><g class="moto-pula"><circle cx="-5.5" cy="5" r="2.8" fill="#F6EFE0"/><circle cx="-5.5" cy="5" r="1.1" fill="#07170D"/><circle cx="6" cy="5" r="2.8" fill="#F6EFE0"/><circle cx="6" cy="5" r="1.1" fill="#07170D"/>' +
      '<path d="M-7.5,4 C-7.5,1 -4.5,0 -1.5,0 L4,0 L6.8,-3.4 L8.3,-2.6 L6,2 L4.6,4.2 Z" fill="#F0524A"/><rect x="-10" y="-7" width="7.4" height="6.4" rx="1.2" fill="#FBF4E6" stroke="#E5B23C" stroke-width=".8"/>' +
      '<path d="M-1.4,-0.6 C-1.4,-5 0.8,-7.6 2.8,-7.6 C4.4,-7.6 5,-6 4.6,-4.4 L3.6,-0.6 Z" fill="#2FBF6B"/><path d="M4,-5.2 L7.2,-3.2" stroke="#2FBF6B" stroke-width="1.5" stroke-linecap="round"/><circle cx="3.2" cy="-9.6" r="2.7" fill="#F0524A"/></g></g></svg>';
  }
  async function carrega() {
    let j;
    try { j = await api('GET', '/api/motoboy/eu'); }
    catch (e) { marcaRede(false); if (!S.eu) $('#tela').innerHTML = '<p class="carregando">' + esc(e.message) + '<br><br><button class="b" onclick="location.reload()">Tentar de novo</button></p>'; return; }
    if (!j.entregador) { if (NATIVO) NATIVO.encerrarJornada(); if (S.eu || !$('#codigo')) telaParear(); return; }
    $('#rede').hidden = false;
    const antes = S.conhecidas;
    S.eu = j.entregador; S.jornada = j.jornada; S.entregas = j.entregas; S.loja = j.loja; W.intervalo = j.intervalo || W.intervalo;
    const ids = new Set(j.entregas.map((x) => x.id));
    if (antes) { const novas = j.entregas.filter((x) => !antes.has(x.id)); if (novas.length) { bip(); toast(novas.length === 1 ? 'Nova entrega: ' + novas[0].codigo + ' · ' + (novas[0].endereco ? novas[0].endereco.bairro : '') : novas.length + ' entregas novas'); } }
    S.conhecidas = ids;
    $('#quem').textContent = j.entregador.nome;
    // a jornada manda: aberta no servidor → rastreia; fechada → para
    if (S.jornada && !rastreando()) ligaRastreio();
    if (!S.jornada && rastreando()) desligaRastreio();
    desenha();
    conecta();
  }
  function conecta() {
    if (S.fonte) return;
    const f = new EventSource('/api/motoboy/eventos');
    S.fonte = f;
    f.addEventListener('ola', () => marcaRede(true));
    f.addEventListener('mudou', () => { clearTimeout(conecta.t); conecta.t = setTimeout(carrega, 200); });
    f.addEventListener('jornada', () => carrega());
    f.onerror = () => { marcaRede(false); if (f.readyState === 2) { S.fonte = null; setTimeout(() => { if (S.eu) carrega(); }, 4000); } };
  }
  function marcaRede(on) { const r = $('#rede'); r.classList.toggle('on', on); r.lastChild.textContent = on ? 'ao vivo' : 'sem conexão'; }

  function desenha() {
    const on = !!S.jornada;
    $('#tela').innerHTML = '<section class="jornada" id="jornadaBox">' +
      '<button type="button" class="jbtn' + (on ? ' on' : '') + '" id="jbtn" aria-label="' + (on ? 'Segure para encerrar a jornada' : 'Iniciar a jornada') + '">' +
      (on ? '<svg class="anel" viewBox="0 0 220 220" aria-hidden="true"><circle cx="110" cy="110" r="105"/></svg><span class="tempo" id="tempo">0:00</span><small>segure para encerrar</small>'
        : '<svg class="liga" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v8M6.4 6.6a8 8 0 1 0 11.2 0"/></svg><b>Iniciar<br>jornada</b>') + '</button>' +
      '<div class="jinfo" id="jinfo"></div></section>' +
      '<h2 class="sec">Entregas <span class="n">' + S.entregas.length + '</span></h2><div id="lista">' + (S.entregas.length ? S.entregas.map(htmlEntrega).join('') : '<p class="vazia">Nenhuma entrega com você agora.<br>Quando a pizzaria passar uma, ela aparece aqui com um aviso sonoro.</p>') + '</div>';
    ligaJornada();
    $$('[data-segura]').forEach(ligaEntregue);
    atualizaInfo(); atualizaDistancias();
    if (!REDUZ) $$('.ent').forEach((el, i) => el.animate([{ transform: 'translateY(16px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 360, delay: i * 60, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' }));
    clearInterval(S.relogio);
    S.relogio = setInterval(() => { atualizaTempo(); atualizaInfo(); }, 1000);
    atualizaTempo();
  }
  function atualizaTempo() {
    const t = $('#tempo');
    if (!t || !S.jornada) return;
    const s = Math.max(0, Math.floor((Date.now() - Date.parse(S.jornada.inicio)) / 1000));
    t.textContent = Math.floor(s / 3600) + ':' + String(Math.floor(s / 60) % 60).padStart(2, '0') + (s < 3600 ? ':' + String(s % 60).padStart(2, '0') : '');
  }
  // aviso fixo (fica na tela até o GPS voltar), em vez de sumir na próxima atualização
  function avisoGps(msg) { S.avisoGps = msg; atualizaInfo(); }
  function atualizaInfo() {
    const box = $('#jinfo');
    if (!box) return;
    const av = NATIVO ? '' : S.avisoGps || (!window.isSecureContext ? SEM_HTTPS : '');
    const aviso = av ? '<p class="aviso">⚠ ' + esc(av) + '</p>' : ''; // sem role=alert: esta caixa é redesenhada a cada segundo
    if (!S.jornada) { box.innerHTML = '<p>Sua localização só é enviada durante a jornada, e o cliente vê a moto só enquanto o pedido dele está com você na rua.</p>' + (NATIVO ? '' : '<span class="modo web">Navegador: rastreia só com esta tela aberta</span>' + aviso); return; }
    const p = S.pos, prec = p && p.precisao != null ? Math.round(p.precisao) : null;
    const env = S.ultimoEnvio ? Math.round((Date.now() - S.ultimoEnvio) / 1000) : null;
    const ne = NATIVO ? estadoNativo() || S.nativoEstado || {} : {};
    box.innerHTML = '<div class="linha"><span class="gps ' + (!p ? '' : prec != null && prec <= 30 ? 'ok' : 'fraco') + '"><i></i>' + (p ? 'GPS ±' + (prec != null ? prec : '?') + ' m' : av ? 'sem GPS' : 'procurando o GPS…') + '</span><span>' + (env == null ? 'ainda não enviou' : 'enviado há ' + (env < 60 ? env + ' s' : Math.floor(env / 60) + ' min')) + '</span>' + (S.bateria != null ? '<span>bateria <b>' + Math.round(S.bateria) + '%</b></span>' : '') + (S.jornada.km != null ? '<span><b>' + String(S.jornada.km).replace('.', ',') + '</b> km</span>' : '') + '</div>' +
      (NATIVO ? '<span class="modo">App Android: segue com a tela desligada' + (ne.pendentes ? ' · ' + ne.pendentes + ' posições na fila' : '') + '</span>' + (ne.otimizacaoBateria ? '<button type="button" class="aviso" id="bateriaB">⚠ Toque aqui e permita o app rodar sem economia de bateria, para o sinal não cair com a tela desligada.</button>' : '')
        : '<span class="modo web">Navegador: deixe esta tela aberta (no Android, instale o app)</span>' + aviso);
    const bb = $('#bateriaB'); if (bb) bb.onclick = () => NATIVO.pedirIsencaoBateria();
  }
  function atualizaDistancias() {
    if (!S.pos) return;
    S.entregas.forEach((x) => { const el = $('[data-dist="' + x.id + '"]'); if (el && x.geo) el.textContent = distTxt(metros(S.pos, x.geo)); });
  }
  function cobranca(x) {
    const pg = x.pagamento || {};
    if (x.pago) return '<p class="cobrar pago">✓ Já pago' + (pg.forma ? ' (' + ({ pix: 'Pix', credito: 'crédito', debito: 'débito', dinheiro: 'dinheiro' }[pg.forma] || pg.forma) + ')' : '') + '</p>';
    if (pg.forma === 'dinheiro') return '<p class="cobrar">💵 Cobrar ' + brl(x.total) + ' em dinheiro' + (pg.semTroco ? ' · sem troco' : pg.trocoPara ? ' · levar troco de ' + brl(Math.max(0, pg.trocoPara - x.total)) + ' (paga com ' + brl(pg.trocoPara) + ')' : '') + '</p>';
    if (pg.forma === 'credito' || pg.forma === 'debito') return '<p class="cobrar">💳 Cobrar ' + brl(x.total) + ' no ' + (pg.forma === 'credito' ? 'crédito' : 'débito') + ' · levar a maquininha</p>';
    if (pg.forma === 'pix') return '<p class="cobrar">Pix: conferir o pagamento de ' + brl(x.total) + ' antes de entregar</p>';
    return '<p class="cobrar">Cobrar ' + brl(x.total) + '</p>';
  }
  function linkNavegar(x) {
    const app = pref.get('nav', 'maps');
    const e = x.endereco || {};
    const texto = [[e.rua, e.numero].filter(Boolean).join(', '), e.bairro, (e.cidade || '').replace('/', ' - ')].filter(Boolean).join(', ');
    if (app === 'waze') return x.geo ? 'https://waze.com/ul?ll=' + x.geo.lat + ',' + x.geo.lng + '&navigate=yes' : 'https://waze.com/ul?q=' + encodeURIComponent(texto) + '&navigate=yes';
    return 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' + (x.geo && !texto ? x.geo.lat + ',' + x.geo.lng : encodeURIComponent(texto || (x.geo.lat + ',' + x.geo.lng)));
  }
  function htmlEntrega(x) {
    const e = x.endereco || {};
    const fone = String(x.cliente.fone || '').replace(/\D/g, '');
    const rua = x.status === 'saiu';
    return '<article class="ent' + (rua ? ' rua' : '') + '" data-ent="' + x.id + '"><header><span class="codigo">' + esc(x.codigo) + '</span><span class="st ' + esc(x.status) + '">' + (rua ? 'Na rua' : x.status === 'forno' ? 'No forno' : 'Na cozinha') + '</span><span class="dist" data-dist="' + x.id + '">' + (x.km != null ? String(x.km).replace('.', ',') + ' km da loja' : '') + '</span></header>' +
      '<h3>' + esc(x.cliente.nome.split(' ')[0] || 'Cliente') + '</h3><p class="end">' + esc([e.rua, e.numero].filter(Boolean).join(', ')) + (e.bairro ? ' — ' + esc(e.bairro) : '') + (e.compl || e.ref ? '<small>' + esc([e.compl, e.ref ? 'Ref.: ' + e.ref : ''].filter(Boolean).join(' · ')) + '</small>' : '') + '</p>' +
      cobranca(x) + (x.obs ? '<p class="obs">Obs.: ' + esc(x.obs) + '</p>' : '') + '<details class="itens"><summary>Ver os itens</summary><p>' + esc(x.itens) + '</p></details>' +
      '<div class="acoes"><a class="b" href="' + esc(linkNavegar(x)) + '" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 21 3l-8 18-2-8z"/></svg>Navegar</a>' +
      (fone ? '<a class="b" href="tel:' + fone + '" aria-label="Ligar para o cliente"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg></a><a class="b" href="https://wa.me/55' + fone.replace(/^55/, '') + '" target="_blank" rel="noopener" aria-label="WhatsApp do cliente">Zap</a>' : '<span></span><span></span>') + '</div>' +
      (rua ? '<button type="button" class="b prim largo acao-principal" data-segura="entregue" data-id="' + x.id + '"><span class="enche"></span>Segure: entreguei</button>'
        : '<button type="button" class="b prim largo acao-principal" data-acao="saiu" data-id="' + x.id + '">Peguei a pizza · saí para entrega</button>') + '</article>';
  }

  /* ---------- botões com "segure para confirmar" ---------- */
  function segura(el, ms, pronto, desenhaProgresso) {
    let t0 = 0, raf = 0;
    const vai = (t) => { const k = Math.min(1, (t - t0) / ms); desenhaProgresso(k); if (k >= 1) { fim(); try { navigator.vibrate && navigator.vibrate(60); } catch (e) { /* sem vibração */ } pronto(); } else raf = requestAnimationFrame(vai); };
    const ini = (e) => { e.preventDefault(); t0 = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(vai); };
    const fim = () => { cancelAnimationFrame(raf); desenhaProgresso(0); };
    el.addEventListener('pointerdown', ini);
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((n) => el.addEventListener(n, fim));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) ini(e); });
    el.addEventListener('keyup', (e) => { if (e.key === 'Enter' || e.key === ' ') fim(); });
  }
  function ligaJornada() {
    const b = $('#jbtn');
    if (!b) return;
    if (!S.jornada) { b.addEventListener('click', iniciaJornada); return; }
    const c = $('.anel circle', b);
    segura(b, 1300, encerraJornada, (k) => { if (c) c.style.strokeDashoffset = String(660 * (1 - k)); });
  }
  async function iniciaJornada() {
    liberaAudio();
    const b = $('#jbtn'); b.disabled = true;
    try {
      const r = await api('POST', '/api/motoboy/jornada', { acao: 'iniciar', nativo: !!NATIVO });
      S.jornada = r.jornada;
      ligaRastreio();
      if (!REDUZ) b.animate([{ transform: 'scale(1)' }, { transform: 'scale(.9)' }, { transform: 'scale(1.06)' }, { transform: 'none' }], { duration: 520, easing: 'ease-out' });
      toast(S.avisoGps && !NATIVO ? 'Jornada iniciada, mas sem GPS: veja o aviso.' : 'Jornada iniciada. Boa entrega!');
      desenha();
    } catch (e) { b.disabled = false; toast(e.message); }
  }
  async function encerraJornada() {
    try { await api('POST', '/api/motoboy/jornada', { acao: 'encerrar' }); } catch (e) { toast(e.message); return; }
    desligaRastreio();
    S.jornada = null; S.ultimoEnvio = null;
    toast('Jornada encerrada. Bom descanso!');
    desenha();
  }
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-acao]');
    if (!b) return;
    if (b.dataset.acao === 'saiu') {
      b.disabled = true;
      try {
        if (!S.jornada) { const r = await api('POST', '/api/motoboy/jornada', { acao: 'iniciar', nativo: !!NATIVO }); S.jornada = r.jornada; ligaRastreio(); }
        await api('POST', '/api/motoboy/entregas/' + b.dataset.id, { acao: 'saiu' });
        toast(S.avisoGps && !NATIVO ? 'Saída marcada, mas sem GPS o cliente não vê a moto no mapa.' : 'Boa! O cliente já vê você no mapa.');
        carrega();
      } catch (er) { b.disabled = false; toast(er.message); }
    }
  });
  function ligaEntregue(b) {
    const enche = $('.enche', b);
    segura(b, 1000, async () => {
      b.disabled = true;
      try {
        await api('POST', '/api/motoboy/entregas/' + b.dataset.id, { acao: 'entregue' });
        const card = b.closest('.ent');
        card.innerHTML = '<div class="feito"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="25"/><path d="M20 33l8 8 16-17"/></svg>Entregue! Valeu.</div>';
        setTimeout(carrega, 1400);
      } catch (er) { b.disabled = false; toast(er.message); }
    }, (k) => { if (enche) enche.style.transform = 'scaleX(' + k + ')'; });
  }

  /* ---------- menu ---------- */
  $('#menuB').addEventListener('click', () => {
    const m = $('#menu');
    if (!m.hidden) { m.hidden = true; return; }
    const nav = pref.get('nav', 'maps');
    m.innerHTML = '<button type="button" data-m="nav">Navegar com: <b>' + (nav === 'waze' ? 'Waze' : 'Google Maps') + '</b> (trocar)</button><button type="button" data-m="atualiza">Atualizar</button>' +
      (S.eu ? '<button type="button" data-m="sair">Tirar este celular do app</button>' : '') + (NATIVO ? '<button type="button" data-m="servidor">Trocar o endereço da pizzaria</button>' : '') +
      '<small>' + esc(LOJA.nome) + (NATIVO && NATIVO.versao ? ' · app ' + esc(NATIVO.versao()) : ' · navegador') + '</small>';
    m.hidden = false; $('#menuB').setAttribute('aria-expanded', 'true');
  });
  $('#menu').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-m]');
    if (!b) return;
    $('#menu').hidden = true; $('#menuB').setAttribute('aria-expanded', 'false');
    if (b.dataset.m === 'nav') { pref.set('nav', pref.get('nav', 'maps') === 'waze' ? 'maps' : 'waze'); toast('Navegação: ' + (pref.get('nav') === 'waze' ? 'Waze' : 'Google Maps')); if (S.eu) desenha(); }
    else if (b.dataset.m === 'atualiza') carrega();
    else if (b.dataset.m === 'servidor') NATIVO.trocarServidor();
    else if (b.dataset.m === 'sair') {
      if (!confirm('Tirar este celular do app? A jornada termina e vai precisar de um código novo da pizzaria.')) return;
      desligaRastreio();
      try { await api('POST', '/api/motoboy/sair', {}); } catch (er) { /* já saiu */ }
      if (NATIVO) NATIVO.guardarToken('');
      telaParear('Celular desligado do app.');
    }
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('#menu, #menuB')) $('#menu').hidden = true; });

  carrega();
})();
