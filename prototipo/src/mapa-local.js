/* Conferir o local da entrega no mapa: o pino fica parado no meio e o cliente arrasta o mapa por baixo até a porta
   (no celular é bem mais fácil do que arrastar um pino pequeno). "Usar minha localização" quando o site é seguro (https).
   window.LocalPP.escolher({ inicio: {lat,lng}, loja, titulo, sub, aproximado }) → Promise<{lat,lng} | null> */
(function () {
  'use strict';
  const REDUZ = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const arred = (v) => Math.round(v * 1e5) / 1e5;
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
  const GPS = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="7.5"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3"/></svg>';
  let atual = null;

  function escolher(o) {
    if (atual) return atual;
    o = o || {};
    const inicio = o.inicio && Number.isFinite(+o.inicio.lat) ? { lat: +o.inicio.lat, lng: +o.inicio.lng } : null;
    if (!inicio) return Promise.resolve(null);
    let devolve;
    atual = new Promise((r) => { devolve = r; });
    const antes = document.activeElement;
    const veu = document.createElement('div');
    veu.className = 'lp-veu';
    const gps = window.isSecureContext && 'geolocation' in navigator;
    veu.innerHTML = '<div class="lp-caixa" role="dialog" aria-modal="true" aria-labelledby="lpTit" aria-describedby="lpDica">' +
      '<header class="lp-topo"><div><h2 id="lpTit">Onde entregar?</h2><p>' + esc(o.titulo || '') + (o.sub ? '<span> · ' + esc(o.sub) + '</span>' : '') + '</p></div>' +
      '<button type="button" class="lp-x" aria-label="Fechar sem mudar o local">×</button></header>' +
      '<div class="lp-mapa-box"><div class="lp-mapa" id="lpMapa"></div>' +
      '<div class="lp-pino" id="lpPino" aria-hidden="true"><span class="lp-pino-sobe"><svg viewBox="0 0 48 64"><path class="lp-gota" d="M24 62S4 39.4 4 24a20 20 0 0 1 40 0c0 15.4-20 38-20 38z"/><circle class="lp-miolo" cx="24" cy="24" r="8.5"/></svg></span><i class="lp-sombra"></i><i class="lp-onda"></i></div>' +
      '<p class="lp-carregando" id="lpCarr">Carregando o mapa…</p></div>' +
      '<p class="lp-dica" id="lpDica" aria-live="polite">' + (o.aproximado ? 'Não achamos o número exato. <b>Arraste o mapa</b> até o pino ficar na sua porta.' : 'O pino está na sua porta? Se não, <b>arraste o mapa</b> até ele.') + '</p>' +
      '<footer class="lp-pe">' + (gps ? '<button type="button" class="lp-gps" id="lpGps">' + GPS + '<span>Usar minha localização</span></button>' : '') +
      '<button type="button" class="btn btn-verde lp-ok" id="lpOk" disabled>Confirmar este local</button></footer></div>';
    document.body.appendChild(veu);
    document.documentElement.classList.add('lp-aberto');
    const $ = (s) => veu.querySelector(s);
    const pino = $('#lpPino'), dica = $('#lpDica'), ok = $('#lpOk');
    void veu.offsetWidth; veu.classList.add('on'); // sem requestAnimationFrame: abre mesmo com a aba em segundo plano
    let mapa = null;

    function fecha(valor) {
      if (!veu.isConnected) return;
      veu.classList.remove('on');
      document.removeEventListener('keydown', teclas, true);
      setTimeout(() => { try { if (mapa) mapa.remove(); } catch (e) { /* já saiu */ } veu.remove(); }, REDUZ ? 0 : 320);
      document.documentElement.classList.remove('lp-aberto');
      if (antes && antes.focus) try { antes.focus({ preventScroll: true }); } catch (e) { /* saiu da tela */ }
      const r = atual; atual = null; devolve(valor); return r;
    }
    function teclas(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fecha(null); return; }
      if (e.key !== 'Tab') return;
      const f = Array.from(veu.querySelectorAll('button:not([disabled]), [tabindex]:not([tabindex="-1"]), a[href]')).filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
    document.addEventListener('keydown', teclas, true);
    $('.lp-x').addEventListener('click', () => fecha(null));
    veu.addEventListener('click', (e) => { if (e.target === veu) fecha(null); });
    ok.addEventListener('click', () => { if (mapa) { const c = mapa.getCenter(); fecha({ lat: arred(c.lat), lng: arred(c.lng) }); } });
    setTimeout(() => ok.focus({ preventScroll: true }), 60);

    const cai = () => { if (REDUZ) return; pino.classList.remove('cai'); void pino.offsetWidth; pino.classList.add('cai'); };
    carregaLeaflet().then((L) => {
      if (!veu.isConnected) return;
      mapa = L.map($('#lpMapa'), { zoomControl: true, attributionControl: true, zoomSnap: 0.5, keyboard: true }).setView([inicio.lat, inicio.lng], 18);
      mapa.attributionControl.setPrefix('');
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mapa);
      if (o.loja && Number.isFinite(+o.loja.lat)) L.marker([+o.loja.lat, +o.loja.lng], { icon: L.divIcon({ className: 'lp-loja', html: '<span>🍕</span>', iconSize: [30, 30], iconAnchor: [15, 15] }), interactive: false, keyboard: false }).addTo(mapa);
      window.__lpMapa = mapa; // para os testes automáticos
      let mexeu = false;
      mapa.on('movestart', () => { pino.classList.remove('cai'); pino.classList.add('sobe'); });
      mapa.on('moveend', () => {
        pino.classList.remove('sobe'); cai();
        if (!mexeu && mapa.distance(mapa.getCenter(), L.latLng(inicio.lat, inicio.lng)) > 3) { mexeu = true; dica.innerHTML = 'Isso! Quando o pino estiver na sua porta, toque em <b>Confirmar este local</b>.'; }
      });
      $('#lpCarr').remove();
      ok.disabled = false;
      setTimeout(() => { if (mapa) { mapa.invalidateSize(); cai(); } }, REDUZ ? 0 : 340);
      const g = $('#lpGps');
      if (g) g.addEventListener('click', () => {
        g.disabled = true; g.classList.add('buscando'); dica.textContent = 'Procurando você…';
        navigator.geolocation.getCurrentPosition((p) => {
          g.disabled = false; g.classList.remove('buscando');
          mapa.flyTo([p.coords.latitude, p.coords.longitude], 18, { duration: REDUZ ? 0 : 0.9 });
          dica.innerHTML = 'Confira se o pino ficou na sua porta' + (p.coords.accuracy > 40 ? ' (o GPS errou por até ' + Math.round(p.coords.accuracy) + ' m)' : '') + ' e toque em <b>Confirmar este local</b>.';
        }, (er) => {
          g.disabled = false; g.classList.remove('buscando');
          dica.textContent = er.code === 1 ? 'Sem permissão de localização. Arraste o mapa até a sua porta.' : 'Não deu para achar você agora. Arraste o mapa até a sua porta.';
        }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
      });
    }).catch(() => { const c = $('#lpCarr'); if (c) c.textContent = 'O mapa não carregou (sem internet?). Feche e siga pelo endereço: o entregador acha pelo número.'; });
    return atual;
  }
  window.LocalPP = { escolher };
})();
