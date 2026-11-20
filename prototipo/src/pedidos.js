/* Pedidos — lado do cliente: registra o pedido no servidor (junto com o WhatsApp), a página "acompanhe seu pedido"
   e a etiqueta de pedido em andamento. O painel da equipe agora é o app de gestão (/gestao, src/gestao/).
   Tudo depende do servidor (server.js); sem ele (artifact, hospedagem estática), nada disto aparece. */
(function () {
  'use strict';
  let C = null; // contexto do app.js (dados do site, formatadores, animação)
  let servidor = false;
  const pronto = fetch('/api/status', { headers: { Accept: 'application/json' }, cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => (servidor = !!(j && j.ok)))
    .catch(() => (servidor = false));

  /* ---------------- utilidades ---------------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const brl = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const hhmm = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const anima = () => !!(C && C.anima);
  async function api(met, url, corpo, extra) {
    const r = await fetch(url, Object.assign({ method: met, credentials: 'same-origin', cache: 'no-store', headers: corpo ? { 'Content-Type': 'application/json' } : {}, body: corpo ? JSON.stringify(corpo) : undefined }, extra || {}));
    let j = null;
    try { j = await r.json(); } catch (e) { /* sem corpo */ }
    if (!r.ok) { const e = new Error((j && j.erro) || 'Falha de conexão (' + r.status + ')'); e.status = r.status; throw e; }
    return j;
  }
  function tokenAleatorio(n = 22) {
    const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const r = new Uint8Array(n);
    crypto.getRandomValues(r);
    return Array.from(r, (x) => a[x % a.length]).join('');
  }

  const NOME_STATUS = { novo: 'Novo', preparo: 'Em preparo', forno: 'No forno', saiu: 'Saiu para entrega', pronto: 'Pronto para retirada', concluido: 'Concluído', cancelado: 'Cancelado' };
  const tituloOriginal = document.title;

  /* ======================= ACOMPANHAMENTO DO CLIENTE ======================= */
  const A = { token: null, fonte: null, ultimo: null, cena: null, forninho: null, poll: null, aviso: false, foco: null };
  const PASSOS = {
    entrega: [['novo', 'Recebido'], ['preparo', 'Em preparo'], ['forno', 'No forno'], ['saiu', 'Saiu para entrega'], ['concluido', 'Entregue']],
    retirada: [['novo', 'Recebido'], ['preparo', 'Em preparo'], ['forno', 'No forno'], ['pronto', 'Pronto para retirar'], ['concluido', 'Retirado']]
  };
  function textosStatus(v) {
    const loja = C.D().config || {};
    const prev = v.previsao ? 'Previsão: até ' + hhmm(v.previsao) + '.' : '';
    return ({
      novo: ['Recebemos seu pedido!', 'Assim que a pizzaria confirmar sua mensagem no WhatsApp, ele vai para a cozinha.'],
      preparo: ['Seu pedido está sendo preparado', ('A equipe já está montando sua pizza. ' + prev).trim()],
      forno: ['Sua pizza está no forno!', ('Mais um pouquinho e fica pronta. ' + prev).trim()],
      saiu: ['Saiu para entrega!', ((v.entregador ? v.entregador + ' está a caminho. ' : 'Já está a caminho. ') + prev).trim()],
      pronto: ['Pronto para retirar!', 'Pode vir buscar no balcão: ' + (loja.endereco || '') + '.'],
      concluido: [v.modo === 'entrega' ? 'Entregue. Bom apetite!' : 'Retirado. Bom apetite!', 'Obrigado pela preferência' + (v.nome ? ', ' + v.nome : '') + '. Volte sempre!'],
      cancelado: ['Pedido cancelado', (v.motivo ? 'Motivo: ' + v.motivo + '. ' : '') + 'Qualquer dúvida, fale com a gente no WhatsApp.']
    })[v.status] || ['Seu pedido', ''];
  }
  const tipoCena = (st) => ({ novo: 'zap', preparo: 'cozinha', forno: 'cozinha', saiu: 'moto', pronto: 'caixa', concluido: 'fim', cancelado: 'cancelado' }[st] || 'zap');

  /* ---------- mapa ao vivo do entregador (Leaflet + OpenStreetMap, carregados só quando o pedido sai) ---------- */
  const MP = { mapa: null, moto: null, destino: null, rastro: null, reta: null, pos: null, raf: 0, ultimaT: 0, angulo: null, seguindo: true, auto: false, perto: false };
  let leafletP = null;
  function carregaLeaflet() {
    if (window.L && window.L.map) return Promise.resolve(window.L);
    if (!leafletP) leafletP = new Promise((ok, falha) => {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(css);
      const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
      s.onload = () => ok(window.L); s.onerror = () => { leafletP = null; falha(new Error('mapa')); };
      document.head.appendChild(s);
    });
    return leafletP;
  }
  const rad = (g) => (g * Math.PI) / 180;
  function metros(a, b) { const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng); const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2; return 2 * 6371000 * Math.asin(Math.sqrt(h)); }
  function rumoEntre(a, b) { const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat)); const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng)); return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360; }
  const MOTO_MINI = '<svg viewBox="-12 -13 24 22" aria-hidden="true"><g><circle cx="-5.5" cy="5" r="2.8" fill="#2A201B"/><circle cx="-5.5" cy="5" r="1.1" fill="#B9B1A6"/><circle cx="6" cy="5" r="2.8" fill="#2A201B"/><circle cx="6" cy="5" r="1.1" fill="#B9B1A6"/>' +
    '<path d="M-7.5,4 C-7.5,1 -4.5,0 -1.5,0 L4,0 L6.8,-3.4 L8.3,-2.6 L6,2 L4.6,4.2 Z" fill="#C1121F"/><rect x="-10" y="-7" width="7.4" height="6.4" rx="1.2" fill="#FBF4E6" stroke="#C8952E" stroke-width=".8"/><path d="M-8.6,-5.2 L-4.4,-4.6 L-6.7,-2 Z" fill="#E9A23B"/>' +
    '<path d="M-1.4,-0.6 C-1.4,-5 0.8,-7.6 2.8,-7.6 C4.4,-7.6 5,-6 4.6,-4.4 L3.6,-0.6 Z" fill="#0F4D23"/><path d="M4,-5.2 L7.2,-3.2" stroke="#0F4D23" stroke-width="1.5" stroke-linecap="round"/><circle cx="3.2" cy="-9.6" r="2.7" fill="#C1121F"/></g></svg>';
  function paraMapa() {
    cancelAnimationFrame(MP.raf);
    if (MP.mapa) { try { MP.mapa.remove(); } catch (e) { /* já removido */ } }
    Object.assign(MP, { mapa: null, moto: null, destino: null, rastro: null, reta: null, pos: null, raf: 0, ultimaT: 0, angulo: null, seguindo: true, auto: false, perto: false });
  }
  function girar(rumo) {
    if (rumo == null || !Number.isFinite(+rumo) || !MP.moto) return;
    const el = MP.moto.getElement();
    if (!el) return;
    // caminho mais curto: de 350° para 10° gira 20°, não 340°
    MP.angulo = MP.angulo == null ? +rumo : MP.angulo + ((((+rumo - MP.angulo) % 360) + 540) % 360) - 180;
    const seta = el.querySelector('.mp-seta');
    if (seta) seta.style.transform = 'rotate(' + MP.angulo + 'deg)';
    el.classList.toggle('oeste', ((MP.angulo % 360) + 360) % 360 > 180);
  }
  function enquadra(animado) {
    if (!MP.mapa || !MP.pos) return;
    const L = window.L;
    const pts = [[MP.pos.lat, MP.pos.lng]];
    if (MP.destino) { const d = MP.destino.getLatLng(); pts.push([d.lat, d.lng]); }
    MP.auto = true;
    const op = { padding: [44, 44], maxZoom: 16 };
    if (pts.length === 1) MP.mapa.setView(pts[0], 16, { animate: !!animado });
    else if (animado && anima()) MP.mapa.flyToBounds(L.latLngBounds(pts), Object.assign({ duration: 1.1 }, op));
    else MP.mapa.fitBounds(L.latLngBounds(pts), op);
  }
  function infoEntrega(p) {
    const box = $('#acEta');
    if (!box || !MP.pos) return;
    const dest = MP.destino && MP.destino.getLatLng();
    const velho = p && p.t && Date.now() - p.t > 90e3;
    if (!dest) { box.innerHTML = '<b>Entregador a caminho</b><span>' + (velho ? 'último sinal há ' + Math.round((Date.now() - p.t) / 60000) + ' min' : 'posição ao vivo') + '</span>'; return; }
    const d = metros(MP.pos, dest);
    const vel = p && p.vel > 2 ? Math.max(4, Math.min(16, p.vel)) : 6.9; // ~25 km/h na cidade
    const min = Math.max(1, Math.round((d * 1.3) / vel / 60));
    const perto = d < 180;
    box.classList.toggle('perto', perto);
    box.innerHTML = perto ? '<b>Chegando agora!</b><span>o entregador está na sua rua</span>' : '<b>Chega em ~' + min + ' min</b><span>a ' + (d >= 1000 ? (d / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(d / 10) * 10 + ' m') + ' de você' + (velho ? ' · sinal de ' + Math.round((Date.now() - p.t) / 60000) + ' min atrás' : '') + '</span>';
    if (perto && !MP.perto) {
      MP.perto = true;
      try { if (navigator.vibrate) navigator.vibrate([200, 80, 200]); } catch (e) { /* sem vibração */ }
      if (A.aviso && document.hidden) { try { new Notification('O entregador está chegando!', { body: 'Pedido ' + (A.ultimo ? A.ultimo.codigo : ''), tag: 'acomp-' + A.token }); } catch (e) { /* sem suporte */ } }
    }
  }
  function iniciaMapa(v) {
    const el = $('#acMapa');
    if (!el || !A.moto) return;
    carregaLeaflet().then((L) => {
      if (!document.contains(el) || A.cena !== 'mapa' || !A.moto) return;
      paraMapa();
      const m = L.map(el, { zoomControl: false, scrollWheelZoom: false, zoomSnap: 0.25, attributionControl: true });
      m.attributionControl.setPrefix('');
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
      MP.mapa = m;
      if (A.loja) L.marker([A.loja.lat, A.loja.lng], { icon: L.divIcon({ className: 'mp-loja', html: '<span>P</span>', iconSize: [30, 30], iconAnchor: [15, 15] }), interactive: false, keyboard: false }).addTo(m);
      if (v.destino) MP.destino = L.marker([v.destino.lat, v.destino.lng], { icon: L.divIcon({ className: 'mp-casa', html: '<i class="mp-casa-pulso"></i><svg viewBox="0 0 40 48" aria-hidden="true"><path d="M20 47C20 47 3 29 3 17A17 17 0 0 1 37 17C37 29 20 47 20 47Z" fill="#C1121F"/><path d="M12 19 20 12l8 7v8h-5v-5h-6v5h-5z" fill="#fff"/></svg>', iconSize: [40, 48], iconAnchor: [20, 46] }), interactive: false, keyboard: false }).addTo(m);
      MP.rastro = L.polyline([], { color: '#0F4D23', weight: 4, opacity: 0.6, lineCap: 'round', dashArray: '1 9' }).addTo(m);
      MP.reta = L.polyline([], { color: '#C1121F', weight: 2.5, opacity: 0.45, dashArray: '6 8' }).addTo(m);
      MP.pos = { lat: A.moto.lat, lng: A.moto.lng };
      MP.moto = L.marker([MP.pos.lat, MP.pos.lng], { icon: L.divIcon({ className: 'mp-moto', html: '<i class="mp-pulso"></i><span class="mp-seta"><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 1 41 13H23Z" fill="#0F4D23"/></svg></span><span class="mp-bolha">' + MOTO_MINI + '</span>', iconSize: [64, 64], iconAnchor: [32, 32] }), zIndexOffset: 1000, interactive: false, keyboard: false }).addTo(m);
      MP.rastro.addLatLng(MP.pos);
      if (MP.destino) MP.reta.setLatLngs([MP.pos, MP.destino.getLatLng()]);
      enquadra(false);
      m.on('moveend', () => { MP.auto = false; });
      m.on('dragstart', () => { MP.seguindo = false; const b = $('#acCentra'); if (b) b.hidden = false; });
      if (A.moto.rumo != null) girar(A.moto.rumo);
      infoEntrega(A.moto);
      if (anima()) el.animate([{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 500, easing: 'cubic-bezier(.2,.9,.3,1.1)' });
    }).catch(() => { A.semMapa = true; A.cena = null; if (A.ultimo) montaCena(A.ultimo); });
  }
  function moveMoto(p) {
    if (!MP.mapa || !MP.moto) return;
    const de = MP.pos || { lat: p.lat, lng: p.lng }, para = { lat: p.lat, lng: p.lng };
    const agora = performance.now();
    // desliza no tempo entre um sinal e outro: a moto anda sem parar em vez de pular
    const dur = Math.max(700, Math.min(5200, MP.ultimaT ? (agora - MP.ultimaT) * 0.95 : 1200));
    MP.ultimaT = agora;
    const d = metros(de, para);
    if (p.rumo != null && (p.vel == null || p.vel > 1.2)) girar(p.rumo); else if (d > 6) girar(rumoEntre(de, para));
    cancelAnimationFrame(MP.raf);
    const fim = () => { MP.rastro.addLatLng(para); infoEntrega(p); };
    if (!anima() || d < 0.5) { MP.pos = para; MP.moto.setLatLng(para); if (MP.destino) MP.reta.setLatLngs([para, MP.destino.getLatLng()]); fim(); }
    else {
      const t0 = performance.now();
      const passo = (t) => {
        const k = Math.min(1, (t - t0) / dur);
        const q = { lat: de.lat + (para.lat - de.lat) * k, lng: de.lng + (para.lng - de.lng) * k };
        MP.pos = q; MP.moto.setLatLng(q);
        if (MP.destino) MP.reta.setLatLngs([q, MP.destino.getLatLng()]);
        if (k < 1) MP.raf = requestAnimationFrame(passo); else fim();
      };
      MP.raf = requestAnimationFrame(passo);
    }
    infoEntrega(p);
    if (MP.seguindo && !MP.auto) { const b = MP.mapa.getBounds().pad(-0.12); if (!b.contains([para.lat, para.lng])) enquadra(true); }
  }
  function recebeMoto(p) {
    A.moto = p;
    const v = A.ultimo;
    if (!v || v.status !== 'saiu' || !v.rastreio) return;
    if (A.cena !== 'mapa' && !A.semMapa) montaCena(v);
    else moveMoto(p);
  }

  function cenaSVG(tipo, v) {
    if (tipo === 'zap') return '<svg viewBox="0 0 300 170" class="ac-zap"><rect x="104" y="14" width="92" height="148" rx="16" fill="#1E1B16"/><rect x="111" y="26" width="78" height="124" rx="8" fill="#FBF4E6"/>' +
      '<g class="ac-bolha"><rect x="120" y="44" width="56" height="30" rx="12" fill="#DCF8C6"/><circle class="ac-d1" cx="136" cy="59" r="3.4" fill="#0F4D23"/><circle class="ac-d2" cx="148" cy="59" r="3.4" fill="#0F4D23"/><circle class="ac-d3" cx="160" cy="59" r="3.4" fill="#0F4D23"/></g>' +
      '<g class="ac-pizzinha" transform="translate(150 112)"><circle r="22" fill="#E3A85A" stroke="#B9783A" stroke-width="2"/><circle r="17" fill="#C93F20"/><circle cx="-6" cy="-5" r="3.2" fill="#F1C766"/><circle cx="7" cy="-2" r="3" fill="#F1C766"/><circle cx="-1" cy="8" r="3.2" fill="#F1C766"/></g></svg>';
    if (tipo === 'cozinha') return '<svg viewBox="168 6 300 226" class="ac-cozinha"></svg>';
    if (tipo === 'moto') {
      return '<svg viewBox="0 0 320 170" class="ac-moto"><defs><clipPath id="acRua"><rect x="0" y="0" width="320" height="170" rx="18"/></clipPath></defs><g clip-path="url(#acRua)"><rect width="320" height="170" fill="#F3E6CC"/>' +
        '<g class="ac-fundo">' + [0, 1].map((k) => '<g transform="translate(' + k * 320 + ' 0)"><rect x="18" y="58" width="44" height="54" rx="4" fill="#E9D2A4"/><path d="M14 62 L40 40 L66 62Z" fill="#C1121F" opacity=".75"/><rect x="34" y="84" width="12" height="28" fill="#B9783A"/><circle cx="104" cy="88" r="18" fill="#2E7D4F" opacity=".8"/><rect x="101" y="96" width="6" height="18" fill="#7A5230"/><rect x="146" y="46" width="58" height="66" rx="4" fill="#EAD7B2"/><rect x="156" y="58" width="12" height="12" fill="#FBF4E6"/><rect x="180" y="58" width="12" height="12" fill="#FBF4E6"/><rect x="156" y="80" width="12" height="12" fill="#FBF4E6"/><rect x="180" y="80" width="12" height="12" fill="#FBF4E6"/><circle cx="246" cy="92" r="14" fill="#2E7D4F" opacity=".7"/><rect x="243" y="98" width="6" height="16" fill="#7A5230"/><rect x="272" y="66" width="40" height="46" rx="4" fill="#E9D2A4"/><path d="M268 70 L292 52 L316 70Z" fill="#0F4D23" opacity=".7"/></g>').join('') + '</g>' +
        '<rect y="112" width="320" height="58" fill="#5B514A"/><line class="ac-faixa" x1="0" x2="640" y1="142" y2="142" stroke="#FBF4E6" stroke-width="4" stroke-dasharray="22 18"/>' +
        '<g transform="translate(150 118) scale(3.4)"><g class="ac-moto-corpo"><ellipse cy="7.6" rx="9" ry="1.6" fill="#2B1A0E" opacity=".25"/><g class="ac-roda"><circle cx="-5.5" cy="5" r="2.8" fill="#2A201B"/><circle cx="-5.5" cy="5" r="1.1" fill="#B9B1A6"/></g><g class="ac-roda"><circle cx="6" cy="5" r="2.8" fill="#2A201B"/><circle cx="6" cy="5" r="1.1" fill="#B9B1A6"/></g>' +
        '<path d="M-7.5,4 C-7.5,1 -4.5,0 -1.5,0 L4,0 L6.8,-3.4 L8.3,-2.6 L6,2 L4.6,4.2 Z" fill="#C1121F"/><rect x="-10" y="-7" width="7.4" height="6.4" rx="1.2" fill="#FBF4E6" stroke="#C8952E" stroke-width=".8"/><path d="M-8.6,-5.2 L-4.4,-4.6 L-6.7,-2 Z" fill="#E9A23B"/>' +
        '<path d="M-1.4,-0.6 C-1.4,-5 0.8,-7.6 2.8,-7.6 C4.4,-7.6 5,-6 4.6,-4.4 L3.6,-0.6 Z" fill="#0F4D23"/><path d="M4,-5.2 L7.2,-3.2" stroke="#0F4D23" stroke-width="1.5" stroke-linecap="round"/><circle cx="3.2" cy="-9.6" r="2.7" fill="#C1121F"/><path d="M4.4,-10.6 A2.7,2.7 0 0 1 5.9,-9.4" stroke="#FFFDF7" stroke-width=".8" fill="none"/></g></g>' +
        '<g class="ac-vento" stroke="#FBF4E6" stroke-width="3" stroke-linecap="round" opacity=".8"><line x1="96" x2="118" y1="118" y2="118"/><line x1="86" x2="112" y1="130" y2="130"/></g></g></svg>';
    }
    if (tipo === 'caixa') return '<svg viewBox="0 0 300 170" class="ac-caixa"><g class="ac-vapor" fill="none" stroke="#B9B1A6" stroke-width="4" stroke-linecap="round"><path d="M120 70 C110 55 132 46 122 30"/><path d="M150 66 C140 50 162 42 152 24"/><path d="M180 70 C170 55 192 46 182 30"/></g>' +
      '<path d="M70 92 L230 92 L218 150 L82 150 Z" fill="#E9D2A4" stroke="#B9783A" stroke-width="3" stroke-linejoin="round"/><rect x="66" y="80" width="168" height="16" rx="4" fill="#F1DDAE" stroke="#B9783A" stroke-width="3"/><circle cx="150" cy="122" r="16" fill="#C1121F"/><text x="150" y="128" text-anchor="middle" font-size="16" font-weight="800" fill="#FBF4E6" font-family="Fraunces, Georgia, serif">P</text></svg>';
    if (tipo === 'fim') {
      const pz = (v.itens || []).find((i) => i.tipo === 'pizza' && i.sabores && i.sabores.length);
      let pizza = '';
      try { pizza = pz && C.miniSVG ? C.miniSVG({ sabores: pz.sabores, tamanho: pz.tamanho || 'grande', borda: pz.borda || 'sem' }) : ''; } catch (e) { pizza = ''; }
      return '<div class="ac-fim"><div class="ac-fim-pizza">' + (pizza || '<svg viewBox="-60 -60 120 120"><circle r="56" fill="#E3A85A"/><circle r="46" fill="#C93F20"/><circle r="40" fill="#F1C766" opacity=".85"/></svg>') + '</div>' +
        '<svg viewBox="0 0 300 170" class="ac-confete" aria-hidden="true">' + [[60, 40, '#C1121F'], [240, 50, '#0F4D23'], [90, 120, '#C8952E'], [220, 128, '#C1121F'], [40, 90, '#2E7D4F'], [262, 96, '#C8952E']].map(([x, y, c], i) => '<circle class="ac-c' + i + '" cx="' + x + '" cy="' + y + '" r="5" fill="' + c + '"/>').join('') + '</svg></div>';
    }
    return '<svg viewBox="0 0 300 170" class="ac-cancel"><path d="M70 92 L230 92 L218 150 L82 150 Z" fill="#E5E1DA" stroke="#9C948A" stroke-width="3" stroke-linejoin="round"/><rect x="66" y="80" width="168" height="16" rx="4" fill="#EEEAE4" stroke="#9C948A" stroke-width="3"/><path d="M132 106 L168 138 M168 106 L132 138" stroke="#9C948A" stroke-width="6" stroke-linecap="round"/></svg>';
  }
  function montaCena(v) {
    let tipo = tipoCena(v.status);
    // pedido na rua com entregador do app: mapa ao vivo assim que chega o primeiro sinal
    if (tipo === 'moto' && v.rastreio && A.moto && !A.semMapa) tipo = 'mapa';
    const box = $('#acomp .ac-cena');
    if (!box) return;
    if (A.cena === tipo) {
      if (tipo === 'cozinha' && A.forninho && v.status === 'forno' && A.ultimo && A.ultimo.status !== 'forno') A.forninho.reagir('sabor');
      if (tipo === 'mapa' && MP.destino && v.destino) { const d = MP.destino.getLatLng(); if (d.lat !== v.destino.lat || d.lng !== v.destino.lng) MP.destino.setLatLng([v.destino.lat, v.destino.lng]); }
      const sinal = box.querySelector('.ac-sinal');
      if (sinal) sinal.hidden = !v.rastreio;
      return;
    }
    if (A.forninho) { try { A.forninho.parar(); } catch (e) { /* já parado */ } A.forninho = null; }
    if (A.cena === 'mapa') paraMapa();
    A.cena = tipo;
    box.className = 'ac-cena cena-' + tipo + (anima() ? ' viva' : '');
    if (tipo === 'mapa') {
      box.innerHTML = '<div class="ac-mapa" id="acMapa" role="img" aria-label="Mapa com a posição do entregador e o seu endereço"></div><div class="ac-eta" id="acEta" aria-live="polite"></div><button type="button" class="ac-centra" id="acCentra" data-ac="centrar" hidden>Centralizar</button>';
      iniciaMapa(v);
      return;
    }
    box.innerHTML = cenaSVG(tipo, v) + (tipo === 'moto' ? '<span class="ac-sinal"' + (v.rastreio ? '' : ' hidden') + '><i aria-hidden="true"></i>Conectando ao GPS do entregador…</span>' : '');
    if (tipo === 'cozinha' && window.PizzaioloCena) {
      A.forninho = window.PizzaioloCena.criarForninho($('svg', box), { animar: anima() });
      if (A.forninho.iniciar) A.forninho.iniciar();
      if (anima()) setTimeout(() => A.forninho && A.forninho.reagir('oi'), 600);
    }
    if (anima()) box.animate([{ opacity: 0, transform: 'scale(.92)' }, { opacity: 1, transform: 'none' }], { duration: 480, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
  }
  function htmlPassos(v) {
    const passos = PASSOS[v.modo] || PASSOS.entrega;
    const idx = v.status === 'cancelado' ? -1 : passos.findIndex(([s]) => s === v.status);
    return '<ol class="ac-passos">' + passos.map(([s, n], i) => {
      const h = (v.historico || []).filter((x) => x.status === s).pop();
      const estado = idx < 0 ? '' : i < idx ? 'feito' : i === idx ? 'agora' : '';
      return '<li class="' + estado + '"' + (estado === 'agora' ? ' aria-current="step"' : '') + '><i aria-hidden="true"></i><span>' + esc(n) + '</span>' + (h && estado ? '<time>' + hhmm(h.em) + '</time>' : '') + '</li>';
    }).join('') + '</ol>';
  }
  function mostraAcomp(v) {
    const box = $('#acomp');
    if (!box || box.hidden) return;
    const mudou = A.ultimo && A.ultimo.status !== v.status;
    const [tit, sub] = textosStatus(v);
    const loja = C.D().config || {};
    $('.ac-cod', box).textContent = 'Pedido ' + v.codigo;
    $('.ac-tit', box).textContent = tit;
    $('.ac-sub', box).textContent = sub;
    $('.ac-passos-box', box).innerHTML = htmlPassos(v);
    $('.ac-itens', box).innerHTML = '<summary>' + (v.itens || []).reduce((s, i) => s + i.qtd, 0) + ' ite' + ((v.itens || []).reduce((s, i) => s + i.qtd, 0) === 1 ? 'm' : 'ns') + ' · ' + brl(v.total) + '</summary><ul>' + (v.itens || []).map((i) => '<li><b>' + i.qtd + 'x ' + esc(i.nome) + '</b>' + (i.detalhe ? ' <span>' + esc(i.detalhe) + '</span>' : '') + '</li>').join('') + '</ul>';
    $('.ac-falar', box).href = 'https://wa.me/55' + String(loja.whatsapp || '').replace(/\D/g, '') + '?text=' + encodeURIComponent('Olá! Sobre o meu pedido ' + v.codigo + ':');
    montaCena(v);
    if (mudou) {
      if (anima()) $('.ac-tit', box).animate([{ transform: 'translateY(10px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
      try { if (navigator.vibrate) navigator.vibrate([120, 60, 120]); } catch (e) { /* sem vibração */ }
      if (A.aviso && document.hidden) {
        try { new Notification(tit, { body: 'Pedido ' + v.codigo + ' · ' + (loja.nome || ''), tag: 'acomp-' + A.token }); } catch (e) { /* navegador sem suporte */ }
      }
    }
    document.title = tit + ' · Pedido ' + v.codigo;
    A.ultimo = v;
    const pil = $('#ppPilula');
    if (pil && pil.dataset.token === A.token) desenhaPilula(pil, v);
    const fim = v.status === 'concluido' || v.status === 'cancelado';
    if (fim && A.fonte) { A.fonte.close(); A.fonte = null; }
    const av = $('.ac-avisar', box);
    if (av) av.hidden = fim || !('Notification' in window) || !window.isSecureContext || Notification.permission === 'denied';
  }
  function conectaAcomp(token) {
    if (A.fonte) A.fonte.close();
    clearInterval(A.poll);
    if (A.ultimo && (A.ultimo.status === 'concluido' || A.ultimo.status === 'cancelado')) return;
    try {
      const f = new EventSource('/api/acompanhar/' + token + '/eventos');
      A.fonte = f;
      f.addEventListener('pedido', (e) => mostraAcomp(JSON.parse(e.data)));
      f.addEventListener('moto', (e) => recebeMoto(JSON.parse(e.data)));
      f.onerror = () => {
        if (f.readyState === 2) { A.fonte = null; A.poll = setInterval(() => api('GET', '/api/acompanhar/' + token).then(mostraAcomp).catch(() => {}), 20000); }
      };
    } catch (e) {
      A.poll = setInterval(() => api('GET', '/api/acompanhar/' + token).then(mostraAcomp).catch(() => {}), 20000);
    }
  }
  async function acompanhar(token) {
    await pronto;
    if (!servidor || !/^[A-Za-z0-9]{16,40}$/.test(token)) return false;
    let box = $('#acomp');
    if (!box) return false;
    A.token = token; A.ultimo = null; A.cena = null; A.moto = null; A.loja = null; A.semMapa = false;
    paraMapa();
    A.foco = document.activeElement;
    const loja = C.D().config || {};
    box.innerHTML = '<div class="ac-caixa" role="document"><header class="ac-topo"><img src="' + C.LOGOS.h + '" alt="' + esc(loja.nome || 'Pizzaria') + '"><button type="button" class="ac-fechar" data-ac="fechar" aria-label="Fechar e voltar ao site">×</button></header>' +
      '<p class="ac-cod">Pedido</p><h2 class="ac-tit" id="acompTit" aria-live="polite">Buscando seu pedido…</h2><p class="ac-sub"></p>' +
      '<div class="ac-cena" aria-hidden="true"></div><div class="ac-passos-box"></div>' +
      '<details class="ac-itens"></details>' +
      '<div class="ac-botoes"><a class="btn btn-verde ac-falar" href="#" target="_blank" rel="noopener">Falar com a pizzaria</a><button type="button" class="btn btn-ghost ac-avisar" data-ac="avisar" hidden>Me avise quando mudar</button></div></div>';
    box.hidden = false;
    document.documentElement.classList.add('acomp-aberto');
    if (anima()) $('.ac-caixa', box).animate([{ transform: 'translateY(24px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 480, easing: 'cubic-bezier(.2,.9,.3,1.1)' });
    setTimeout(() => { const f = $('.ac-fechar', box); if (f) f.focus(); }, 50);
    try {
      const v = await api('GET', '/api/acompanhar/' + token);
      if (A.token !== token) return true;
      A.moto = v.moto || null;
      A.loja = v.loja || (C.D().config && C.D().config.lojaLat ? { lat: +C.D().config.lojaLat, lng: +C.D().config.lojaLng } : null);
      mostraAcomp(v);
      conectaAcomp(token);
    } catch (e) {
      $('.ac-tit', box).textContent = e.status === 404 ? 'Não encontramos esse pedido' : 'Não deu para carregar agora';
      $('.ac-sub', box).textContent = e.status === 404 ? 'Confira o link que veio no WhatsApp.' : 'Tente de novo em alguns instantes.';
    }
    return true;
  }
  function fecharAcompanhamento() {
    const box = $('#acomp');
    if (!box || box.hidden) return;
    if (A.fonte) { A.fonte.close(); A.fonte = null; }
    clearInterval(A.poll);
    if (A.forninho) { try { A.forninho.parar(); } catch (e) { /* já parado */ } A.forninho = null; }
    paraMapa();
    A.token = null; A.cena = null; A.moto = null;
    box.hidden = true; box.innerHTML = '';
    document.documentElement.classList.remove('acomp-aberto');
    document.title = tituloOriginal;
    if (/^#acompanhar\//.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
    if (A.foco && A.foco.focus) A.foco.focus();
  }
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('#acomp [data-ac]');
    if (!b) { if (e.target.id === 'acomp') fecharAcompanhamento(); return; }
    if (b.dataset.ac === 'fechar') fecharAcompanhamento();
    else if (b.dataset.ac === 'centrar') { MP.seguindo = true; b.hidden = true; enquadra(true); }
    else if (b.dataset.ac === 'avisar') {
      try { const r = await Notification.requestPermission(); A.aviso = r === 'granted'; b.textContent = A.aviso ? 'Vamos te avisar por aqui' : 'Avisos bloqueados no navegador'; b.disabled = true; } catch (er) { b.hidden = true; }
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && A.token) fecharAcompanhamento(); });

  /* pílula "seu pedido" para quem volta ao site depois de pedir */
  async function pilula() {
    await pronto;
    let ult = null;
    try { ult = JSON.parse(localStorage.getItem('pp-ultimoPedido') || 'null'); } catch (e) { ult = null; }
    const velha = !ult || Date.now() - ult.em > 10 * 3600e3;
    let el = $('#ppPilula');
    if (!servidor || velha) { if (el) el.remove(); return; }
    let v;
    try { v = await api('GET', '/api/acompanhar/' + ult.token); } catch (e) { if (el) el.remove(); return; }
    const fim = v.status === 'concluido' || v.status === 'cancelado';
    const ultima = (v.historico || []).slice(-1)[0];
    if (fim && (!ultima || Date.now() - Date.parse(ultima.em) > 90 * 60e3)) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('button');
      el.type = 'button'; el.id = 'ppPilula'; el.className = 'pp-pilula';
      el.addEventListener('click', () => { location.hash = '#acompanhar/' + ult.token; });
      document.body.appendChild(el);
      if (anima()) el.animate([{ transform: 'translateY(30px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 500, delay: 800, fill: 'backwards', easing: 'cubic-bezier(.2,.9,.3,1.2)' });
    }
    el.dataset.token = ult.token;
    desenhaPilula(el, v);
  }
  function desenhaPilula(el, v) {
    el.innerHTML = '<i class="pp-pilula-ponto st-' + esc(v.status) + '" aria-hidden="true"></i><span><b>Pedido ' + esc(v.codigo) + '</b> ' + esc(NOME_STATUS[v.status].toLowerCase()) + '</span><span aria-hidden="true">→</span>';
    el.setAttribute('aria-label', 'Acompanhar o pedido ' + v.codigo + ': ' + NOME_STATUS[v.status]);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && C) pilula(); });

  /* ======================= API para o app.js ======================= */
  window.PedidosPP = {
    pronto,
    get servidor() { return servidor; },
    iniciar(ctx) { C = ctx; pilula(); },
    token: tokenAleatorio,
    registrar(dados) {
      const corpo = JSON.stringify(dados);
      const envia = () => fetch('/api/pedidos', { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: corpo });
      envia().then((r) => { if (r.status >= 500) throw new Error('servidor'); }).catch(() => setTimeout(() => envia().catch(() => {}), 4000));
      try {
        localStorage.setItem('pp-ultimoPedido', JSON.stringify({ token: dados.token, codigo: dados.codigo, em: Date.now() }));
        // todos os pedidos feitos neste aparelho: entram na conta quando o cliente entrar
        const l = JSON.parse(localStorage.getItem('pp-pedidos') || '[]').filter((x) => x && x.token !== dados.token).slice(-39);
        l.push({ token: dados.token, em: Date.now() });
        localStorage.setItem('pp-pedidos', JSON.stringify(l));
      } catch (e) { /* sem storage */ }
      setTimeout(pilula, 1500);
    },
    lancar: (dados) => api('POST', '/api/pedidos', dados),
    entrar: (login, senha) => api('POST', '/api/login', { login, senha }),
    async sessao() { try { const j = await api('GET', '/api/eu'); return j && j.usuario ? j : null; } catch (e) { return null; } },
    async sair() { try { await api('POST', '/api/logout', {}); } catch (e) { /* já saiu */ } },
    acompanhar, fecharAcompanhamento
  };
})();
