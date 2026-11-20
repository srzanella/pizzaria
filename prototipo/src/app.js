(function () {
  'use strict';

  /* ================= estado e fonte da página ================= */
  // Fonte original da página, capturada antes de qualquer render: o portal republica a página
  // a partir dela, trocando só o bloco de dados.
  const BODY_SRC = (() => { const h = document.body.innerHTML; const i = h.indexOf('<title>'); return i >= 0 ? h.slice(i) : h; })();
  const HEAD_STYLE = (document.head.querySelector('style') || {}).textContent || '';
  let D = JSON.parse(document.getElementById('pp-data').textContent);
  const LOGOS = JSON.parse(document.getElementById('pp-logos').textContent);
  document.querySelectorAll('img[data-logo]').forEach((i) => { i.src = LOGOS[i.dataset.logo]; });
  document.querySelectorAll('[data-logo-bg]').forEach((e) => { e.style.backgroundImage = 'url(' + LOGOS[e.dataset.logoBg] + ')'; });

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const brl = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const uid = () => Math.random().toString(36).slice(2, 9);
  const REDUZ = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FINO = window.matchMedia('(pointer: fine)').matches;
  const G = window.gsap || null;
  if (G && window.ScrollTrigger) G.registerPlugin(window.ScrollTrigger);
  const anima = !!G && !REDUZ;
  const MOTION = Object.freeze({
    duration: { instant: 0.12, fast: 0.22, normal: 0.38, slow: 0.62 },
    ease: { enter: 'power3.out', exit: 'power2.in', move: 'power2.inOut', settle: 'back.out(1.35)' },
    stagger: { tight: 0.035, normal: 0.065 }
  });
  const CELULAR = window.matchMedia('(max-width: 860px)');
  const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const DIAS_C = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  const store = {
    get(k, d) { try { const v = localStorage.getItem('pp-' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('pp-' + k, JSON.stringify(v)); } catch (e) { /* sem storage */ } },
    sget(k) { try { return sessionStorage.getItem('pp-' + k); } catch (e) { return null; } },
    sset(k, v) { try { v == null ? sessionStorage.removeItem('pp-' + k) : sessionStorage.setItem('pp-' + k, v); } catch (e) { /* sem storage */ } }
  };

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('on'), 2600);
  }

  /* ================= consultas ao cardápio ================= */
  const sabor = (id) => D.sabores.find((s) => s.id === id);
  const adicional = (id) => D.adicionais.find((a) => a.id === id);
  const borda = (id) => D.bordas.find((b) => b.id === id) || D.bordas[0];
  const massa = (id) => D.massas.find((m) => m.id === id) || D.massas[0];
  const cat = (id) => D.categorias.find((c) => c.id === id);
  const precoSabor = (s, tam) => (s ? (tam === 'broto' ? s.b : s.g) : null);
  const saborDisp = (s, tam) => s && s.ativo !== false && !s.esgotado && precoSabor(s, tam) != null;
  const nomeTam = (t) => (D.config.tamanhos.find((x) => x.id === t) || { nome: t }).nome;

  function precoPizza(p) {
    const vals = p.sabores.map((id) => precoSabor(sabor(id), p.tamanho)).filter((v) => v != null);
    if (!vals.length) return 0;
    return Math.max(...vals) + (borda(p.borda).preco || 0) + (massa(p.massa).preco || 0);
  }
  function precoLinha(l) {
    return l.tipo === 'pizza' ? precoPizza(l) : (adicional(l.itemId) || {}).preco || 0;
  }

  /* ================= horário ================= */
  const hm = (s) => { const [h, m] = String(s || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
  function statusAgora(now = new Date()) {
    const c = D.config;
    if (c.statusManual === 'aberto') return { aberto: true, texto: 'Aberto agora' };
    if (c.statusManual === 'fechado') return { aberto: false, texto: 'Fechado no momento' };
    const min = now.getHours() * 60 + now.getMinutes();
    const hoje = D.horarios.find((h) => h.dia === now.getDay());
    const ontem = D.horarios.find((h) => h.dia === (now.getDay() + 6) % 7);
    if (ontem && ontem.aberto && hm(ontem.fecha) < hm(ontem.abre) && min < hm(ontem.fecha)) return { aberto: true, texto: 'Aberto · fecha ' + ontem.fecha.replace(':', 'h') };
    if (hoje && hoje.aberto) {
      const a = hm(hoje.abre), f = hm(hoje.fecha);
      const dentro = f > a ? min >= a && min < f : min >= a;
      if (dentro) return { aberto: true, texto: 'Aberto · fecha ' + hoje.fecha.replace(':', 'h') };
      if (min < a) return { aberto: false, texto: 'Fechado · abre hoje ' + hoje.abre.replace(':', 'h') };
    }
    for (let i = 1; i <= 7; i++) {
      const d = (now.getDay() + i) % 7;
      const h = D.horarios.find((x) => x.dia === d);
      if (h && h.aberto) return { aberto: false, texto: 'Fechado · abre ' + (i === 1 ? 'amanhã' : DIAS[d].toLowerCase()) + ' ' + h.abre.replace(':', 'h') };
    }
    return { aberto: false, texto: 'Fechado' };
  }
  const podePedir = () => statusAgora().aberto || D.config.modoTeste;

  /* ================= desenho da pizza ================= */
  const NS = 'http://www.w3.org/2000/svg';
  function sv(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function rngDe(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    let a = h >>> 0;
    return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // Catálogo de ingredientes desenháveis. "re" liga o ingrediente ao texto do cardápio (modo automático);
  // a chave é o que o portal grava na receita visual do sabor. z = camada (menor fica embaixo).
  const ING = {
    calabresa: { nome: 'Calabresa', re: /calabresa/, f: 'calabresa', n: 14, z: 2 },
    pepperoni: { nome: 'Pepperoni', re: /pepperoni/, f: 'calabresa', n: 18, cor: '#A8231B', r: 7, z: 2 },
    apresuntado: { nome: 'Apresuntado / presunto', re: /apresuntado|presunto/, f: 'presunto', n: 10, z: 1 },
    peru: { nome: 'Peito de peru', re: /peito de peru/, f: 'presunto', n: 10, cor: '#F2BFAE', z: 1 },
    lombo: { nome: 'Lombo', re: /lombo/, f: 'lombo', n: 9, z: 1 },
    bacon: { nome: 'Bacon em tiras', re: /bacon(?! em cubo)/, f: 'bacon', n: 10, z: 3 },
    baconCubo: { nome: 'Bacon em cubos', re: /bacon em cubo/, f: 'baconCubo', n: 20, z: 3 },
    frango: { nome: 'Frango desfiado', re: /frango/, f: 'desfiado', n: 15, cor: '#E8C690', z: 2 },
    costela: { nome: 'Costela / carne seca', re: /costela|carne seca/, f: 'desfiado', n: 15, cor: '#7E4426', z: 2 },
    cupim: { nome: 'Cupim', re: /cupim/, f: 'desfiado', n: 15, cor: '#6A3820', z: 2 },
    strogonofe: { nome: 'Strogonofe', re: /strogonofe|estrogonofe/, f: 'strogonofe', n: 12, z: 2 },
    atum: { nome: 'Atum', re: /atum/, f: 'lasca', n: 14, cor: '#CDB49C', z: 2 },
    tomate: { nome: 'Tomate em rodelas', re: /tomate(?! cereja)/, f: 'tomate', n: 7, z: 4 },
    tomateCereja: { nome: 'Tomate cereja', re: /tomate cereja/, f: 'tomateCereja', n: 10, z: 5 },
    vinagrete: { nome: 'Vinagrete', re: /vinagrete/, f: 'picado', n: 52, z: 5 },
    azeitona: { nome: 'Azeitona', re: /azeitona/, f: 'azeitona', n: 10, z: 6 },
    cebola: { nome: 'Cebola', re: /cebola(?!da)/, f: 'cebola', n: 7, z: 3 },
    milho: { nome: 'Milho', re: /milho/, f: 'milho', n: 54, z: 5 },
    ervilha: { nome: 'Ervilha', re: /ervilha/, f: 'bola', n: 34, cor: '#6DA544', r: 2.8, z: 5 },
    palmito: { nome: 'Palmito', re: /palmito/, f: 'palmito', n: 8, z: 3 },
    ovo: { nome: 'Ovo', re: /\bovo\b/, f: 'ovo', n: 6, z: 4 },
    brocolis: { nome: 'Brócolis', re: /brocolis/, f: 'brocolis', n: 10, z: 4 },
    couve: { nome: 'Couve', re: /couve/, f: 'tira', n: 30, cor: '#2F6B2A', z: 5 },
    alhoPoro: { nome: 'Alho-poró', re: /alho-poro|alho poro/, f: 'anelFino', n: 16, cor: '#B9D58A', z: 5 },
    rucula: { nome: 'Rúcula', re: /rucula/, f: 'rucula', n: 12, z: 8 },
    cheiroVerde: { nome: 'Cheiro-verde', re: /cheiro-verde|cebolinha/, f: 'flocos', n: 60, cor: '#3F8A2E', z: 8 },
    champignon: { nome: 'Champignon', re: /champignon/, f: 'cogumelo', n: 9, z: 4 },
    biquinho: { nome: 'Pimenta biquinho', re: /pimenta biquinho/, f: 'biquinho', n: 11, z: 6 },
    pimenta: { nome: 'Pimenta calabresa', re: /pimenta(?! biquinho)/, f: 'flocos', n: 30, cor: '#B3121A', z: 8 },
    coalho: { nome: 'Queijo coalho', re: /queijo coalho/, f: 'coalho', n: 10, z: 5 },
    parmesao: { nome: 'Parmesão', re: /parmesao/, f: 'ralado', n: 50, cor: '#F4E6B8', z: 7 },
    gorgonzola: { nome: 'Gorgonzola', re: /gorgonzola/, f: 'gorgonzola', n: 11, z: 5 },
    doritos: { nome: 'Doritos', re: /doritos/, f: 'doritos', n: 11, z: 6 },
    batataPalha: { nome: 'Batata palha', re: /batata palha/, f: 'ralado', n: 64, cor: '#F2C14E', z: 7 },
    alhoFrito: { nome: 'Alho frito', re: /alho frito/, f: 'alhoFrito', n: 26, z: 8 },
    catupiry: { nome: 'Catupiry (bolotas)', re: /catupiry/, f: 'bolota', n: 9, cor: '#FFFBEF', z: 7 },
    creamCheese: { nome: 'Cream cheese (bolotas)', re: /cream chees/, f: 'bolota', n: 12, cor: '#FFFFFA', r: 5, z: 7 },
    requeijao: { nome: 'Requeijão (espiral)', re: /requeijao/, f: 'espiral', cor: '#FFF7E4', z: 7 },
    cheddar: { nome: 'Cheddar (espiral)', re: /cheddar/, f: 'espiral', cor: '#E8892B', z: 7 },
    barbecue: { nome: 'Barbecue (fio)', re: /barbecue/, f: 'fio', cor: '#5A1F0E', z: 7 },
    oregano: { nome: 'Orégano', re: /oregano/, f: 'flocos', n: 55, cor: '#4F6B2A', z: 9 },
    morango: { nome: 'Morango', re: /morango/, f: 'morango', n: 18, z: 5 },
    banana: { nome: 'Banana', re: /banana/, f: 'banana', n: 16, z: 3 },
    abacaxi: { nome: 'Abacaxi', re: /abacaxi/, f: 'abacaxi', n: 20, z: 4 },
    uva: { nome: 'Uva verde', re: /\buva/, f: 'uva', n: 22, z: 4 },
    cereja: { nome: 'Cereja', re: /(?<!tomate )cereja/, f: 'cereja', n: 11, z: 6 },
    kitkat: { nome: 'Kit Kat', re: /kit kat/, f: 'kitkat', n: 11, z: 6 },
    cookies: { nome: 'Cookies', re: /cookie/, f: 'cookie', n: 11, z: 6 },
    kinder: { nome: 'Kinder Bueno', re: /kinder/, f: 'kinder', n: 11, z: 6 },
    tortuguita: { nome: 'Tortuguita', re: /tortuguita/, f: 'tortuguita', n: 12, z: 6 },
    goiabada: { nome: 'Goiabada', re: /goiabada/, f: 'goiabada', n: 16, z: 4 },
    coco: { nome: 'Coco ralado', re: /coco/, f: 'ralado', n: 70, cor: '#FFFFFF', len: 4, z: 8 },
    granulado: { nome: 'Granulado', re: /granulado/, f: 'granulado', n: 90, z: 8 },
    raspas: { nome: 'Raspas de chocolate', re: /raspas/, f: 'raspa', n: 22, z: 8 },
    canela: { nome: 'Canela em pó', re: /canela/, f: 'flocos', n: 70, cor: '#8B5A2B', z: 8 },
    chocoFio: { nome: 'Fio de chocolate', re: /chocolate(?! branco)/, se: (a) => a.base !== 'choco', f: 'fio', cor: '#4A2416', z: 7 },
    brancoFio: { nome: 'Fio de chocolate branco', re: /chocolate branco/, se: (a) => a.base !== 'branco', f: 'fio', cor: '#FFF6E6', z: 7 },
    leiteCond: { nome: 'Leite condensado (fio)', re: /leite condensado/, f: 'fio', cor: '#FFF1D2', z: 7 },
    coberturaMorango: { nome: 'Cobertura de morango (fio)', re: /cobertura de morango/, f: 'fio', cor: '#D2354C', z: 7 },
    ninhoPo: { nome: 'Leite Ninho em pó', re: /ninho/, se: (a) => a.base !== 'ninho', f: 'flocos', n: 70, cor: '#FFFFFF', z: 8 }
  };
  const BASES = [['molho', 'Molho de tomate'], ['queijo', 'Sem molho (massa clara)'], ['choco', 'Creme de chocolate'], ['branco', 'Chocolate branco'], ['ninho', 'Creme de Ninho'], ['pistache', 'Creme de pistache'], ['creme', 'Creme de leite']];
  const COR_BASE = { molho: '#C23A1E', queijo: '#E8C07A', choco: '#4A2416', branco: '#F6EAD2', ninho: '#F7EEDB', pistache: '#AFC57E', creme: '#F1E1C0' };

  function analiseAuto(s) {
    const t = norm(s.nome + ' ' + (s.ing || ''));
    const doce = s.cat === 'doces' || (/chocolate|ninho|creme de leite|pistache/.test(t) && !/molho/.test(t));
    // sem ingredientes cadastrados, desenha ao menos uma mussarela
    let base = 'molho', queijo = /mussarela|queijo/.test(t) || !(s.ing || '').trim();
    if (doce) {
      queijo = /mussarela/.test(t);
      if (/pistache/.test(t)) base = 'pistache';
      else if (/ninho/.test(t)) base = 'ninho';
      else if (queijo) base = 'queijo';
      else if (/chocolate(?! branco)|brigadeiro|prestigio|kit kat|kinder|tortuguita|cookies/.test(t)) base = 'choco';
      else if (/chocolate branco/.test(t)) base = 'branco';
      else base = 'creme';
    }
    const a = { base, queijo, itens: [] };
    const q = /mais recheio/.test(t) ? 1.35 : 1;
    Object.keys(ING).forEach((k) => { const g = ING[k]; if (g.re.test(t) && (!g.se || g.se(a))) a.itens.push({ k, q }); });
    return a;
  }
  const CACHE_ANALISE = {};
  function analisar(s) {
    if (!s) return null;
    const v = s.visual;
    const chave = s.id + '|' + s.ing + '|' + s.nome + '|' + (v ? JSON.stringify(v) : '');
    if (CACHE_ANALISE[chave]) return CACHE_ANALISE[chave];
    const a = v ? { base: COR_BASE[v.base] ? v.base : 'molho', queijo: !!v.queijo, itens: (v.itens || []).filter((i) => ING[i.k]) } : analiseAuto(s);
    a.tops = a.itens.map((i) => Object.assign({ q: +i.q || 1 }, ING[i.k])).sort((x, y) => x.z - y.z);
    return (CACHE_ANALISE[chave] = a);
  }

  const f1 = (v) => (Math.round(v * 10) / 10).toString();
  // curva suave (Catmull-Rom) passando pelos pontos
  function suave(p, fechado) {
    const n = p.length, g = (i) => (fechado ? p[(i + n) % n] : p[Math.max(0, Math.min(n - 1, i))]);
    let d = 'M' + f1(p[0][0]) + ',' + f1(p[0][1]);
    for (let i = 0; i < (fechado ? n : n - 1); i++) {
      const p0 = g(i - 1), a = g(i), b = g(i + 1), p3 = g(i + 2);
      d += ' C' + f1(a[0] + (b[0] - p0[0]) / 6) + ',' + f1(a[1] + (b[1] - p0[1]) / 6) + ' ' + f1(b[0] - (p3[0] - a[0]) / 6) + ',' + f1(b[1] - (p3[1] - a[1]) / 6) + ' ' + f1(b[0]) + ',' + f1(b[1]);
    }
    return d + (fechado ? 'Z' : '');
  }
  // ondulação orgânica de um contorno: soma de senos com fase sorteada
  function ondas(rng, n) { const f = []; for (let k = 2; k < 2 + n; k++) f.push([k, rng() * 6.283, (0.6 + rng() * 0.8) / k]); return f; }
  const ondaEm = (f, th) => f.reduce((s, [k, ph, a]) => s + Math.sin(k * th + ph) * a, 0);
  // contorno irregular de raio R; lado -1/1 desenha só a metade (fechando pela linha do meio)
  function blobPath(R, amp, f, lado) {
    const pts = [], N = 44;
    if (!lado) for (let i = 0; i < N; i++) { const th = (i / N) * 6.283, r = R + amp * ondaEm(f, th); pts.push([Math.cos(th) * r, Math.sin(th) * r]); }
    else {
      const a0 = lado < 0 ? Math.PI / 2 : -Math.PI / 2;
      for (let i = 0; i <= N / 2; i++) { const th = a0 + (i / (N / 2)) * Math.PI, r = R + amp * ondaEm(f, th); pts.push([Math.cos(th) * r, Math.sin(th) * r]); }
      pts[0][0] = 0; pts[pts.length - 1][0] = 0;
    }
    return suave(pts, !lado) + (lado ? 'Z' : '');
  }
  function formaIrregular(rng, r, n, var_) {
    const pts = [];
    for (let i = 0; i < n; i++) { const th = (i / n) * 6.283, rr = r * (1 - var_ / 2 + rng() * var_); pts.push([Math.cos(th) * rr, Math.sin(th) * rr]); }
    return suave(pts, true);
  }

  function pontosNaMetade(n, rng, lado, rMax) {
    // lado: -1 esquerda, 1 direita, 0 inteira
    const pts = [];
    const off = rng();
    for (let i = 0; i < n; i++) {
      const r = rMax * Math.sqrt((i + 0.5) / n) * (0.92 + rng() * 0.08);
      let th;
      if (lado === 0) th = i * 2.39996 + off * 6.28;
      else { const fr = ((i * 0.61803 + off) % 1); th = (lado < 0 ? Math.PI / 2 : -Math.PI / 2) + fr * Math.PI; }
      let x = Math.cos(th) * r + (rng() - 0.5) * 6, y = Math.sin(th) * r + (rng() - 0.5) * 6;
      if (lado < 0 && x > -5) x = -5 - rng() * 4;
      if (lado > 0 && x < 5) x = 5 + rng() * 4;
      pts.push([x, y]);
    }
    return pts;
  }

  const TOPS_LEVES = new Set(['cebola', 'tira', 'anelFino', 'rucula', 'flocos', 'ralado', 'granulado', 'raspa', 'folha']);
  const pesoMovimento = (spec) => TOPS_LEVES.has(spec.f) ? 'leve' : 'pesado';

  function desenharTop(g, spec, rng, mini) {
    const c = spec.cor;
    switch (spec.f) {
      case 'calabresa': {
        const r = spec.r || 8.4;
        sv('ellipse', { rx: r, ry: r * 0.93, fill: c || '#B8402F', stroke: 'rgba(70,12,5,.55)', 'stroke-width': 1.3 }, g);
        sv('ellipse', { cx: -r * 0.2, cy: -r * 0.22, rx: r * 0.55, ry: r * 0.42, fill: 'rgba(255,200,170,.16)' }, g);
        if (!mini) {
          for (let k = 0; k < 6; k++) { const a = rng() * 6.28, d = rng() * r * 0.66; sv('circle', { cx: f1(Math.cos(a) * d), cy: f1(Math.sin(a) * d), r: f1(0.6 + rng() * 0.9), fill: '#F4D2C2', opacity: 0.85 }, g); }
          sv('path', { d: 'M' + f1(-r * 0.75) + ',' + f1(r * 0.42) + ' Q0,' + f1(r * 1.15) + ' ' + f1(r * 0.75) + ',' + f1(r * 0.42), fill: 'none', stroke: 'rgba(60,8,4,.4)', 'stroke-width': 1.5 }, g);
        }
        break;
      }
      case 'presunto':
        sv('path', { d: formaIrregular(rng, 9.5, 7, 0.45), fill: c || '#EFA394', stroke: 'rgba(130,45,35,.35)', 'stroke-width': 1 }, g);
        sv('path', { d: 'M-6,-1 C-2,3 3,2 7,-2', fill: 'none', stroke: 'rgba(255,255,255,.5)', 'stroke-width': 1.3 }, g);
        if (!mini) sv('path', { d: 'M-5,3 C-1,6 3,5 6,3', fill: 'none', stroke: 'rgba(150,55,40,.25)', 'stroke-width': 1.1 }, g);
        break;
      case 'lombo':
        sv('path', { d: formaIrregular(rng, 8.4, 8, 0.18), fill: '#E3A08A', stroke: '#F6DCCB', 'stroke-width': 1.8 }, g);
        sv('ellipse', { cx: -1.5, cy: -1.5, rx: 4.5, ry: 3.4, fill: 'rgba(255,225,210,.35)' }, g);
        break;
      case 'bacon':
        sv('path', { d: 'M-10,-2.8 Q-5,-5.6 0,-2.8 T10,-2.8 L10,2.8 Q5,0 0,2.8 T-10,2.8Z', fill: '#A63C28', stroke: 'rgba(70,15,5,.35)', 'stroke-width': 0.8 }, g);
        sv('path', { d: 'M-9.5,0 Q-5,-2.6 0,0 T9.5,0', fill: 'none', stroke: '#F3D0BA', 'stroke-width': 1.7 }, g);
        break;
      case 'baconCubo':
        sv('rect', { x: -2.6, y: -2.4, width: 5.2, height: 4.8, rx: 1.2, fill: '#A84430', stroke: 'rgba(70,15,5,.3)', 'stroke-width': 0.6 }, g);
        sv('rect', { x: -2.2, y: -2, width: 4.4, height: 1.5, rx: 0.7, fill: '#F0C9B0' }, g);
        break;
      case 'desfiado':
        for (let k = 0; k < (mini ? 3 : 5); k++) {
          const x = (rng() - 0.5) * 9, y = (rng() - 0.5) * 7, a = rng() * 6.28, L = 4 + rng() * 3;
          const d = 'M' + f1(x - Math.cos(a) * L) + ',' + f1(y - Math.sin(a) * L) + ' Q' + f1(x + (rng() - 0.5) * 4) + ',' + f1(y + (rng() - 0.5) * 4) + ' ' + f1(x + Math.cos(a) * L) + ',' + f1(y + Math.sin(a) * L);
          sv('path', { d, fill: 'none', stroke: 'rgba(60,30,10,.28)', 'stroke-width': 3, 'stroke-linecap': 'round' }, g);
          sv('path', { d, fill: 'none', stroke: c, 'stroke-width': 2.1, 'stroke-linecap': 'round' }, g);
        }
        break;
      case 'strogonofe':
        sv('path', { d: formaIrregular(rng, 8, 7, 0.4), fill: '#E2B78A' }, g);
        for (let k = 0; k < 3; k++) sv('rect', { x: f1((rng() - 0.5) * 8 - 2), y: f1((rng() - 0.5) * 6 - 1.6), width: 4.4, height: 3.2, rx: 1.2, fill: '#A9652F', transform: 'rotate(' + Math.round(rng() * 90) + ')' }, g);
        break;
      case 'lasca':
        for (let k = 0; k < 3; k++) sv('path', { d: formaIrregular(rng, 3, 5, 0.6), fill: c, stroke: 'rgba(120,90,70,.35)', 'stroke-width': 0.6, transform: 'translate(' + f1((rng() - 0.5) * 8) + ' ' + f1((rng() - 0.5) * 6) + ')' }, g);
        break;
      case 'tomate': {
        const r = spec.r || 9;
        sv('circle', { r, fill: '#C9221C' }, g);
        sv('circle', { r: r * 0.86, fill: '#E04634' }, g);
        for (let k = 0; k < 4; k++) {
          const a = k * 1.571 + 0.5;
          sv('ellipse', { cx: f1(Math.cos(a) * r * 0.45), cy: f1(Math.sin(a) * r * 0.45), rx: f1(r * 0.28), ry: f1(r * 0.2), fill: '#F07A5E', transform: 'rotate(' + Math.round(a * 57.3) + ' ' + f1(Math.cos(a) * r * 0.45) + ' ' + f1(Math.sin(a) * r * 0.45) + ')' }, g);
          if (!mini) sv('circle', { cx: f1(Math.cos(a) * r * 0.48), cy: f1(Math.sin(a) * r * 0.48), r: 0.9, fill: '#F7D58A' }, g);
        }
        sv('circle', { r: r * 0.16, fill: '#F3A189' }, g);
        break;
      }
      case 'tomateCereja':
        sv('circle', { r: 5.6, fill: '#C91F1A' }, g);
        sv('circle', { r: 4.3, fill: '#E9533F' }, g);
        sv('path', { d: 'M-3,0 L3,0 M0,-3 L0,3', stroke: '#F48A6E', 'stroke-width': 1.2 }, g);
        if (!mini) sv('ellipse', { cx: -2, cy: -2.4, rx: 1.4, ry: 0.8, fill: 'rgba(255,255,255,.5)' }, g);
        break;
      case 'picado': {
        const cores = ['#D23A2A', '#E85A3C', '#F2EEE2', '#4E8F35', '#D23A2A'];
        sv('rect', { x: -1.4, y: -1.2, width: 2.8, height: 2.4, rx: 0.6, fill: cores[Math.floor(rng() * cores.length)] }, g);
        break;
      }
      case 'cebola':
        sv('circle', { r: 6.8, fill: 'rgba(245,232,245,.28)', stroke: '#F3E7F4', 'stroke-width': 1.7, 'stroke-dasharray': '26 18' }, g);
        sv('circle', { r: 4.4, fill: 'none', stroke: '#E6CFEA', 'stroke-width': 1.3, 'stroke-dasharray': '14 12' }, g);
        break;
      case 'milho':
        sv('rect', { x: -1.7, y: -2.1, width: 3.4, height: 4.2, rx: 1.5, fill: '#F6C51C', stroke: 'rgba(190,130,0,.45)', 'stroke-width': 0.5 }, g);
        if (!mini) sv('ellipse', { cx: -0.5, cy: -0.8, rx: 0.7, ry: 1, fill: 'rgba(255,250,210,.6)' }, g);
        break;
      case 'bola':
        sv('circle', { r: spec.r || 5, fill: c }, g);
        sv('circle', { cx: f1(-(spec.r || 5) * 0.3), cy: f1(-(spec.r || 5) * 0.3), r: f1((spec.r || 5) * 0.32), fill: 'rgba(255,255,255,.45)' }, g);
        break;
      case 'palmito':
        sv('circle', { r: 5.6, fill: '#F6EED8', stroke: '#DCCB9C', 'stroke-width': 1.2 }, g);
        sv('circle', { r: 3.2, fill: 'none', stroke: '#E8DBB4', 'stroke-width': 1 }, g);
        sv('circle', { r: 1, fill: '#E2D2A2' }, g);
        break;
      case 'ovo':
        sv('ellipse', { rx: 7, ry: 6, fill: '#FFFDF6', stroke: '#E6DEC8', 'stroke-width': 0.8 }, g);
        sv('circle', { cx: 0.6, r: 3.4, fill: '#F2B21B' }, g);
        sv('circle', { cx: 0.2, cy: -0.4, r: 2, fill: '#F8CF52' }, g);
        break;
      case 'brocolis':
        sv('path', { d: 'M-1.2,6 L-0.8,0 L0.8,0 L1.2,6Z', fill: '#9CC46A' }, g);
        [[-3, -1, 3], [3, -1, 3], [0, -4, 3.4], [-1.5, 1, 2.6], [1.8, 1, 2.6]].forEach(([x, y, r]) => sv('circle', { cx: x, cy: y, r, fill: rng() > 0.5 ? '#3C7A2A' : '#2F6B22' }, g));
        if (!mini) for (let k = 0; k < 5; k++) sv('circle', { cx: f1((rng() - 0.5) * 7), cy: f1(-1 - rng() * 4), r: 0.7, fill: '#5E9C3C' }, g);
        break;
      case 'tira':
        sv('path', { d: 'M-4,0 Q0,' + f1((rng() - 0.5) * 4) + ' 4,0', fill: 'none', stroke: c, 'stroke-width': 1.4, 'stroke-linecap': 'round' }, g);
        break;
      case 'anelFino':
        sv('circle', { r: 3.2, fill: 'rgba(230,245,210,.35)', stroke: c, 'stroke-width': 1.2 }, g);
        sv('circle', { r: 1.6, fill: 'none', stroke: '#DDEBC4', 'stroke-width': 0.8 }, g);
        break;
      case 'rucula':
        sv('path', { d: 'M-9,0 C-7,-4 -4,-1 -2,-4 C0,-1 3,-4 5,-2 C7,-1 9,0 9,0 C6,3 3,2 1,3.6 C-2,2 -5,4 -9,0Z', fill: '#4C8B33' }, g);
        sv('path', { d: 'M-8,0 L8,0', stroke: '#7DB35A', 'stroke-width': 0.8 }, g);
        break;
      case 'flocos':
        sv('rect', { x: -0.8, y: -0.5, width: f1(1.2 + rng() * 1.2), height: 1, rx: 0.4, fill: c }, g);
        break;
      case 'cogumelo':
        sv('path', { d: 'M-6.5,0 C-6.5,-6.5 6.5,-6.5 6.5,0 L2.3,0 L2.3,5 C2.3,6.2 -2.3,6.2 -2.3,5 L-2.3,0Z', fill: '#EADDC4', stroke: '#B59B73', 'stroke-width': 1 }, g);
        if (!mini) sv('path', { d: 'M-5,-1 C-4,-4.5 4,-4.5 5,-1', fill: 'none', stroke: 'rgba(160,130,90,.5)', 'stroke-width': 0.8 }, g);
        break;
      case 'biquinho':
        sv('path', { d: 'M0,-4.5 C3.4,-3.6 3.6,1.8 0,5.5 C-3.6,1.8 -3.4,-3.6 0,-4.5Z', fill: '#D7261E' }, g);
        sv('path', { d: 'M0,-4.5 L0.6,-6.5', stroke: '#4E8F35', 'stroke-width': 1.3, 'stroke-linecap': 'round' }, g);
        if (!mini) sv('ellipse', { cx: -1.2, cy: -1, rx: 0.7, ry: 1.6, fill: 'rgba(255,255,255,.45)' }, g);
        break;
      case 'coalho':
        sv('rect', { x: -4, y: -3.4, width: 8, height: 6.8, rx: 1.4, fill: '#F5E3B3', stroke: 'rgba(160,120,50,.35)', 'stroke-width': 0.7 }, g);
        sv('path', { d: 'M-3,-1.6 L3,-1.6 M-3,1.4 L3,1.4', stroke: '#9A5F23', 'stroke-width': 1.1, opacity: 0.75 }, g);
        break;
      case 'ralado':
        sv('rect', { x: f1(-(spec.len || 5) / 2), y: -0.6, width: spec.len || 5, height: 1.2, rx: 0.6, fill: c }, g);
        break;
      case 'gorgonzola':
        sv('path', { d: formaIrregular(rng, 4, 6, 0.5), fill: '#F3ECD8' }, g);
        for (let k = 0; k < 3; k++) sv('circle', { cx: f1((rng() - 0.5) * 4), cy: f1((rng() - 0.5) * 4), r: 0.8, fill: '#5C7F86' }, g);
        break;
      case 'doritos':
        sv('path', { d: 'M0,-6.5 Q4,-1 6,5 Q0,3.6 -6,5 Q-4,-1 0,-6.5Z', fill: '#F28C28', stroke: 'rgba(130,55,0,.35)', 'stroke-width': 0.7 }, g);
        if (!mini) for (let k = 0; k < 4; k++) sv('circle', { cx: f1((rng() - 0.5) * 6), cy: f1(rng() * 5 - 1.5), r: 0.6, fill: '#C4421A' }, g);
        break;
      case 'alhoFrito':
        sv('ellipse', { rx: 2.2, ry: 1.4, fill: '#E2B05A', stroke: '#B07A2A', 'stroke-width': 0.5 }, g);
        break;
      case 'bolota': {
        const r = spec.r || 7;
        sv('path', { d: formaIrregular(rng, r, 7, 0.22), fill: c, stroke: 'rgba(150,120,80,.25)', 'stroke-width': 0.8 }, g);
        sv('path', { d: 'M' + f1(-r * 0.5) + ',' + f1(r * 0.1) + ' Q0,' + f1(-r * 0.45) + ' ' + f1(r * 0.5) + ',' + f1(r * 0.05), fill: 'none', stroke: 'rgba(170,140,100,.25)', 'stroke-width': 1 }, g);
        sv('ellipse', { cx: f1(-r * 0.3), cy: f1(-r * 0.35), rx: f1(r * 0.3), ry: f1(r * 0.18), fill: 'rgba(255,255,255,.9)' }, g);
        break;
      }
      case 'morango':
        sv('path', { d: 'M0,-6 C5,-7 8,-1 0,7 C-8,-1 -5,-7 0,-6Z', fill: '#D3202A' }, g);
        sv('path', { d: 'M0,-3.6 C3,-4.2 4.8,-0.6 0,4.4 C-4.8,-0.6 -3,-4.2 0,-3.6Z', fill: '#F4A0A4' }, g);
        sv('path', { d: 'M0,-3 L0,3', stroke: '#FBD3D3', 'stroke-width': 1 }, g);
        sv('path', { d: 'M-3.2,-6.2 L0,-4.4 L3.2,-6.2', fill: 'none', stroke: '#3F7D2C', 'stroke-width': 1.6, 'stroke-linecap': 'round' }, g);
        break;
      case 'banana':
        sv('circle', { r: 5.6, fill: '#F6E7A4', stroke: '#E2C66A', 'stroke-width': 1 }, g);
        for (let k = 0; k < 3; k++) { const a = k * 2.09; sv('circle', { cx: f1(Math.cos(a) * 1.4), cy: f1(Math.sin(a) * 1.4), r: 0.6, fill: '#B8964A' }, g); }
        break;
      case 'abacaxi':
        sv('rect', { x: -3.5, y: -3.5, width: 7, height: 7, rx: 1.2, fill: '#F7CF3D', stroke: '#D9A91C', 'stroke-width': 0.7 }, g);
        if (!mini) sv('path', { d: 'M-2.5,-1 L2.5,-1 M-2.5,1.4 L2.5,1.4', stroke: 'rgba(200,140,10,.5)', 'stroke-width': 0.6 }, g);
        break;
      case 'uva':
        sv('ellipse', { rx: 4.3, ry: 4.9, fill: '#A5C85A', stroke: '#7FA03A', 'stroke-width': 0.7 }, g);
        sv('ellipse', { cx: -1.4, cy: -1.8, rx: 1.2, ry: 1.6, fill: 'rgba(255,255,255,.45)' }, g);
        break;
      case 'cereja':
        sv('path', { d: 'M0,-3 Q2,-8 5,-9', fill: 'none', stroke: '#4E6B2A', 'stroke-width': 1, 'stroke-linecap': 'round' }, g);
        sv('circle', { r: 4.6, fill: '#B5121E' }, g);
        sv('circle', { cx: -1.5, cy: -1.5, r: 1.3, fill: 'rgba(255,255,255,.5)' }, g);
        break;
      case 'kitkat':
        sv('rect', { x: -6.5, y: -3.2, width: 13, height: 6.4, rx: 1.2, fill: '#8A4A25' }, g);
        sv('path', { d: 'M-6,0 L6,0', stroke: '#5E2F14', 'stroke-width': 1 }, g);
        sv('rect', { x: -6.5, y: 2.2, width: 13, height: 1, fill: '#E2B97A' }, g);
        break;
      case 'cookie':
        sv('path', { d: formaIrregular(rng, 6, 9, 0.18), fill: '#C98E4E', stroke: '#9E6A33', 'stroke-width': 0.7 }, g);
        for (let k = 0; k < 4; k++) sv('circle', { cx: f1((rng() - 0.5) * 7), cy: f1((rng() - 0.5) * 7), r: 1.1, fill: '#3E1E0D' }, g);
        break;
      case 'kinder':
        sv('rect', { x: -6.5, y: -3, width: 13, height: 6, rx: 2.4, fill: '#6B3A1F' }, g);
        sv('path', { d: 'M-5.5,0 Q-2.75,-2 0,0 T5.5,0', fill: 'none', stroke: '#F4ECDB', 'stroke-width': 1.6 }, g);
        break;
      case 'tortuguita':
        sv('ellipse', { rx: 6, ry: 5, fill: '#5A2E17' }, g);
        sv('ellipse', { cx: -1.4, cy: -1.4, rx: 3, ry: 2, fill: 'rgba(255,220,180,.18)' }, g);
        [[-5.5, -3], [5.5, -3], [-5.5, 3], [5.5, 3]].forEach(([x, y]) => sv('circle', { cx: x, cy: y, r: 1.4, fill: '#4A2412' }, g));
        break;
      case 'goiabada':
        sv('path', { d: formaIrregular(rng, 6, 6, 0.3), fill: '#A51E2A', stroke: '#7E1520', 'stroke-width': 0.8 }, g);
        sv('ellipse', { cx: -2, cy: -2, rx: 2, ry: 1, fill: 'rgba(255,255,255,.35)' }, g);
        break;
      case 'granulado':
        sv('rect', { x: -1.3, y: -0.6, width: 2.6, height: 1.2, rx: 0.6, fill: rng() > 0.5 ? '#7A4A2A' : '#24100A' }, g);
        break;
      case 'raspa':
        sv('path', { d: 'M-3,0 A3,2 0 1 1 1.5,2', fill: 'none', stroke: '#3E1E0D', 'stroke-width': 1.8, 'stroke-linecap': 'round' }, g);
        break;
      case 'gota':
        sv('path', { d: 'M0,-5 C3,-1 3,3 0,4.5 C-3,3 -3,-1 0,-5Z', fill: c }, g);
        break;
      case 'folha': {
        const r = spec.r || 6;
        sv('ellipse', { rx: r, ry: r * 0.5, fill: c }, g);
        break;
      }
      case 'azeitona':
        sv('ellipse', { rx: 4.6, ry: 4, fill: '#2A231F' }, g);
        sv('ellipse', { rx: 1.5, ry: 1.2, fill: '#5A4A3E' }, g);
        if (!mini) sv('ellipse', { cx: -2.2, cy: -1.8, rx: 1.2, ry: 0.7, fill: 'rgba(255,255,255,.35)' }, g);
        break;
    }
  }

  // fio escorrido em zigue-zague solto (barbecue, chocolate, leite condensado)
  function fioPath(lado, rng, rMax) {
    const xs = lado < 0 ? [-rMax + 6, -6] : lado > 0 ? [6, rMax - 6] : [-rMax + 6, rMax - 6];
    const pts = [];
    let y = -rMax + 14, i = 0;
    while (y < rMax - 8) {
      const lim = Math.sqrt(Math.max(0, rMax * rMax - y * y)) - 4;
      const x0 = Math.max(xs[0], -lim), x1 = Math.min(xs[1], lim);
      if (x1 - x0 > 8) {
        if (pts.length) pts.push([(x0 + x1) / 2 + (rng() - 0.5) * 24, y - 5 + (rng() - 0.5) * 6]);
        pts.push([(i % 2 ? x1 : x0) + (rng() - 0.5) * 8, y + (rng() - 0.5) * 7]);
      }
      y += 11 * (0.8 + rng() * 0.5); i++;
    }
    return pts.length > 1 ? suave(pts, false) : '';
  }
  // espiral de cremoso (requeijão, cheddar), cortada na metade quando meio a meio
  function espiralPath(lado, rng, rMax) {
    let d = '', dentro = false;
    const ph = rng() * 6.28, voltas = 3.4, passo = 0.09, fim = voltas * 6.283;
    for (let th = 0; th <= fim; th += passo) {
      const r = 6 + (rMax - 6) * (th / fim) + Math.sin(th * 3 + ph) * 2.2 + Math.sin(th * 7 + ph * 2) * 1.1;
      const x = Math.cos(th + ph) * r, y = Math.sin(th + ph) * r;
      const ok = !lado || (lado < 0 ? x < -3 : x > 3);
      if (ok) { d += (dentro ? ' L' : ' M') + f1(x) + ',' + f1(y); dentro = true; } else dentro = false;
    }
    return d.trim();
  }

  const TAM = 1.3; // escala das peças: pizza real é bem coberta
  let uidSvg = 0;
  // cfg: { sabores:[id|null, id|null], tamanho, borda }
  function desenharPizza(svg, cfg, opts = {}) {
    const mini = !!opts.mini;
    const id = 'pz' + (++uidSvg);
    svg.innerHTML = '';
    const escala = cfg.tamanho === 'broto' ? 0.8 : 1;
    const rP = rngDe('massa' + (cfg.sabores || []).join('+'));
    const fC = ondas(rP, 6);
    if (!mini) {
      const defs = sv('defs', {}, svg);
      const cr = sv('radialGradient', { id: id + 'c', cx: '46%', cy: '42%', r: '62%' }, defs);
      sv('stop', { offset: '0.8', 'stop-color': '#F2C985' }, cr);
      sv('stop', { offset: '0.9', 'stop-color': '#DDA059' }, cr);
      sv('stop', { offset: '1', 'stop-color': '#A86A2E' }, cr);
      const qj = sv('radialGradient', { id: id + 'q', cx: '42%', cy: '38%', r: '72%' }, defs);
      sv('stop', { offset: '0', 'stop-color': '#FCE7A6' }, qj);
      sv('stop', { offset: '0.7', 'stop-color': '#F3CD6C' }, qj);
      sv('stop', { offset: '1', 'stop-color': '#E2A946' }, qj);
      const mo = sv('radialGradient', { id: id + 'm', cx: '45%', cy: '40%', r: '70%' }, defs);
      sv('stop', { offset: '0.7', 'stop-color': '#C93F20' }, mo);
      sv('stop', { offset: '1', 'stop-color': '#A42C14' }, mo);
      const dr = sv('radialGradient', { id: id + 'd' }, defs);
      sv('stop', { offset: '0', 'stop-color': '#A9581C', 'stop-opacity': '0.6' }, dr);
      sv('stop', { offset: '0.55', 'stop-color': '#C77A2C', 'stop-opacity': '0.28' }, dr);
      sv('stop', { offset: '1', 'stop-color': '#E2A946', 'stop-opacity': '0' }, dr);
      // textura do queijo: manchas de ruído tingidas de dourado sobre a cor lisa
      const tx = sv('filter', { id: id + 't', x: '-5%', y: '-5%', width: '110%', height: '110%' }, defs);
      sv('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.055', numOctaves: '2', seed: String(Math.floor(rP() * 90)), result: 'n' }, tx);
      sv('feColorMatrix', { in: 'n', type: 'matrix', values: '0 0 0 0 0.74  0 0 0 0 0.45  0 0 0 0 0.12  1.6 0 0 0 -0.72', result: 'm' }, tx);
      sv('feComposite', { in: 'm', in2: 'SourceGraphic', operator: 'in', result: 'c' }, tx);
      const fm = sv('feMerge', {}, tx); sv('feMergeNode', { in: 'SourceGraphic' }, fm); sv('feMergeNode', { in: 'c' }, fm);
      const sh = sv('filter', { id: id + 's', x: '-10%', y: '-10%', width: '120%', height: '120%' }, defs);
      sv('feDropShadow', { dx: '0.5', dy: '1.3', stdDeviation: '0.8', 'flood-color': '#3A1A05', 'flood-opacity': '0.38' }, sh);
      const contato = sv('filter', { id: id + 'o', x: '-12%', y: '-12%', width: '124%', height: '124%' }, defs);
      sv('feGaussianBlur', { stdDeviation: '2.2' }, contato);
      const cpL = sv('clipPath', { id: id + 'L' }, defs); sv('rect', { x: -120, y: -120, width: 120, height: 240 }, cpL);
      const cpR = sv('clipPath', { id: id + 'R' }, defs); sv('rect', { x: 0, y: -120, width: 120, height: 240 }, cpR);
    }
    const corpo = sv('g', { class: 'corpo-pizza' }, svg);
    const raiz = sv('g', { class: 'raiz', transform: 'scale(' + escala + ')' }, corpo);
    if (!mini) sv('path', { class: 'sombra-contato', d: blobPath(98, 2.2, fC, 0), fill: '#3A1A05', opacity: 0.2, filter: 'url(#' + id + 'o)', transform: 'translate(0 3.5)' }, raiz);
    const cheia = sv('g', { class: 'massa' }, raiz);
    sv('path', { d: blobPath(99, 2.2, fC, 0), fill: mini ? '#D89D55' : 'url(#' + id + 'c)', stroke: '#9C6229', 'stroke-width': 1.1 }, cheia);
    if (!mini) sv('path', { class: 'luz-borda-massa', d: blobPath(96.8, 1.8, fC, 0), fill: 'none', stroke: 'rgba(255,239,199,.5)', 'stroke-width': 1.1, transform: 'translate(-0.7 -0.9)' }, cheia);
    if (!mini) {
      // bolhas e pontos tostados da borda de massa
      for (let k = 0; k < 9; k++) {
        const a = rP() * 6.283, r = 94 + rP() * 2.6 + 2.2 * ondaEm(fC, a);
        const x = f1(Math.cos(a) * r), y = f1(Math.sin(a) * r), rot = Math.round(a * 57.3 + 90);
        sv('ellipse', { cx: x, cy: y, rx: f1(3 + rP() * 3), ry: f1(1.8 + rP() * 1.3), fill: '#F6D79E', stroke: 'rgba(140,80,30,.35)', 'stroke-width': 0.7, transform: 'rotate(' + rot + ' ' + x + ' ' + y + ')' }, cheia);
        sv('circle', { cx: x, cy: y, r: f1(0.8 + rP()), fill: '#5A3214', opacity: f1(0.3 + rP() * 0.4) }, cheia);
      }
      for (let k = 0; k < 18; k++) {
        const a = rP() * 6.283, r = 90.5 + rP() * 7.5;
        const x = f1(Math.cos(a) * r), y = f1(Math.sin(a) * r);
        sv('ellipse', { cx: x, cy: y, rx: f1(1.2 + rP() * 2.4), ry: f1(0.7 + rP() * 1), fill: '#5E3213', opacity: f1(0.2 + rP() * 0.4), transform: 'rotate(' + Math.round(a * 57.3 + 90) + ' ' + x + ' ' + y + ')' }, cheia);
      }
    }
    const b = borda(cfg.borda);
    const gb = sv('g', { class: 'borda' }, raiz);
    if (b && b.cor) {
      sv('path', { class: 'borda-cor', d: blobPath(94, 1.6, fC, 0), fill: 'none', stroke: b.cor, 'stroke-width': 7 }, gb);
      sv('path', { class: 'borda-brilho', d: blobPath(94, 1.6, fC, 0), fill: 'none', stroke: 'rgba(255,255,255,.45)', 'stroke-width': 2, 'stroke-dasharray': '3 9' }, gb);
    }
    const sabs = (cfg.sabores || []).filter(Boolean);
    const meio = (cfg.sabores || []).length > 1;
    const metades = meio ? [0, 1] : [0];
    metades.forEach((mi) => {
      const s = sabor((cfg.sabores || [])[mi]);
      const lado = meio ? (mi === 0 ? -1 : 1) : 0;
      const attrs = { class: 'metade m' + mi };
      if (meio && !mini) attrs['clip-path'] = 'url(#' + id + (mi === 0 ? 'L' : 'R') + ')';
      const gm = sv('g', attrs, raiz);
      const an = analisar(s);
      const baseG = sv('g', { class: 'base' }, gm);
      if (!s) {
        sv('path', { d: blobPath(88, 1.6, fC, lado), fill: '#EBCB93' }, baseG);
        sv('path', { d: blobPath(88, 1.6, fC, lado), fill: 'none', stroke: 'rgba(156,98,41,.35)', 'stroke-width': 1.5, 'stroke-dasharray': '4 6' }, baseG);
        return;
      }
      const rs = rngDe(s.id + 'v');
      const fS = ondas(rs, 6), fQ = ondas(rs, 7);
      const corBase = !mini && an.base === 'molho' ? 'url(#' + id + 'm)' : COR_BASE[an.base];
      sv('path', { d: blobPath(88, 1.8, fS, lado), fill: corBase }, baseG);
      if (!mini) {
        sv('path', { d: blobPath(88.5, 1.8, fS, 0), fill: 'none', stroke: 'rgba(110,55,15,.3)', 'stroke-width': 2.4 }, baseG);
        const rb = rngDe(s.id + 'b');
        const pb = (n, rm) => pontosNaMetade(n, rb, lado, rm);
        if (an.base === 'molho' && !an.queijo) pb(14, 80).forEach(([x, y]) => sv('ellipse', { cx: f1(x), cy: f1(y), rx: f1(2 + rb() * 4), ry: f1(1.4 + rb() * 2), fill: 'rgba(140,25,10,.25)' }, baseG));
        if (an.base === 'choco' || an.base === 'branco') for (let k = 0; k < 4; k++) { const r = 20 + k * 15; sv('path', { d: 'M' + f1(-r * 0.8) + ',' + f1(-r * 0.3) + ' Q0,' + f1(-r * 1.05) + ' ' + f1(r * 0.75) + ',' + f1(-r * 0.4), fill: 'none', stroke: an.base === 'choco' ? 'rgba(255,255,255,.1)' : 'rgba(190,150,90,.2)', 'stroke-width': 3, 'stroke-linecap': 'round', transform: 'rotate(' + Math.round(rb() * 360) + ')' }, baseG); }
        if (an.base === 'ninho') pb(70, 82).forEach(([x, y]) => sv('circle', { cx: f1(x), cy: f1(y), r: f1(0.6 + rb() * 0.6), fill: '#FFFFFF', opacity: 0.85 }, baseG));
        if (an.base === 'pistache') pb(26, 80).forEach(([x, y]) => sv('path', { d: formaIrregular(rb, 1.6, 5, 0.6), fill: rb() > 0.3 ? '#7FA046' : '#C9B37A', transform: 'translate(' + f1(x) + ' ' + f1(y) + ')' }, baseG));
      }
      if (an.queijo) {
        const qg = sv('g', mini ? { class: 'queijo' } : { class: 'queijo', filter: 'url(#' + id + 't)' }, gm);
        sv('path', { d: blobPath(83, 4.5, fQ, lado), fill: mini ? '#F2CF72' : 'url(#' + id + 'q)' }, qg);
        const r2 = rngDe(s.id + 'q');
        if (!mini) {
          pontosNaMetade(13, r2, lado, 74).forEach(([x, y]) => sv('ellipse', { cx: f1(x), cy: f1(y), rx: f1(4 + r2() * 7), ry: f1(3 + r2() * 5), fill: 'url(#' + id + 'd)' }, qg));
          pontosNaMetade(6, r2, lado, 70).forEach(([x, y]) => sv('ellipse', { cx: f1(x), cy: f1(y), rx: f1(2 + r2() * 2.5), ry: f1(0.8 + r2()), fill: 'rgba(255,255,240,.35)' }, qg));
        } else pontosNaMetade(6, r2, lado, 70).forEach(([x, y]) => sv('circle', { cx: f1(x), cy: f1(y), r: f1(3 + r2() * 4), fill: 'rgba(205,130,35,.28)' }, qg));
      }
      const tg = sv('g', mini ? { class: 'tops' } : { class: 'tops', filter: 'url(#' + id + 's)' }, gm);
      const rng = rngDe(s.id + (meio ? 'm' + mi : ''));
      an.tops.forEach((spec) => {
        if (spec.f === 'fio' || spec.f === 'espiral') {
          const d = spec.f === 'fio' ? fioPath(lado, rng, 78) : espiralPath(lado, rng, 74);
          if (!d) return;
          const giro = !lado && spec.f === 'fio' ? 'rotate(' + Math.round(rng() * 180) + ') ' : '';
          const larg = (spec.f === 'fio' ? 3 : 5) * (mini ? 1.3 : 1);
          sv('path', { class: 'fio', d, fill: 'none', stroke: spec.cor, 'stroke-width': larg, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', transform: giro }, tg);
          if (!mini) sv('path', { class: 'fio', d, fill: 'none', stroke: 'rgba(255,255,255,.45)', 'stroke-width': larg * 0.3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', transform: giro + 'translate(-0.6 -0.8)' }, tg);
          return;
        }
        let n = (spec.n || 8) * spec.q;
        if (meio) n /= 2;
        if (mini) n *= 0.6;
        n = Math.max(1, Math.round(n));
        const pts = pontosNaMetade(n, rng, lado, 74);
        pts.forEach(([x, y]) => {
          const peso = pesoMovimento(spec);
          const giro = Math.round(rng() * 360), esc = (TAM * (0.85 + rng() * 0.3)).toFixed(2);
          const outer = sv('g', { class: 'peca', 'data-peso': peso, 'data-k': spec.nome, 'data-f': spec.f, 'data-x': f1(x), 'data-y': f1(y), 'data-r': giro, 'data-s': esc, transform: 'translate(' + f1(x) + ' ' + f1(y) + ') rotate(' + giro + ') scale(' + esc + ')' }, tg);
          if (!mini) {
            const sr = spec.r || (peso === 'leve' ? 4 : 5.5);
            // sombra sempre para baixo e à direita (mesma luz para todas), desfazendo o giro da peça
            const ca = Math.cos(-giro * Math.PI / 180), sa = Math.sin(-giro * Math.PI / 180);
            sv('ellipse', { class: 'top-sombra', 'data-peso': peso, cx: f1((1.1 * ca - 2.6 * sa) / esc), cy: f1((1.1 * sa + 2.6 * ca) / esc), rx: f1(sr * 0.82), ry: f1(Math.max(1.4, sr * 0.36)), fill: '#351707', opacity: peso === 'leve' ? 0.1 : 0.16 }, outer);
            if (peso === 'pesado') sv('circle', { class: 'impacto', r: 3.2, fill: 'none', stroke: 'rgba(126,73,18,.3)', 'stroke-width': 1.1, opacity: 0 }, outer);
          }
          const inner = sv('g', { class: 'top', 'data-peso': peso }, outer);
          desenharTop(inner, spec, rng, mini);
          // queijo derretendo por cima de parte das peças que ficam por baixo dele
          if (!mini && an.queijo && spec.z <= 2 && rng() < 0.5) {
            const a = rng() * 6.283;
            sv('path', { d: formaIrregular(rng, 2.6 + rng() * 1.6, 6, 0.4), fill: '#F5D27A', transform: 'translate(' + f1(Math.cos(a) * 6) + ' ' + f1(Math.sin(a) * 6) + ')' }, inner);
          }
        });
      });
    });
    const fat = sv('g', { class: 'fatias' }, raiz);
    const nF = (D.config.fatias || {})[cfg.tamanho] || 8;
    if (sabs.length) {
      for (let k = 0; k < nF; k++) {
        const a = (k / nF) * Math.PI * 2 + (meio ? Math.PI / 2 : 0);
        sv('line', { x1: 0, y1: 0, x2: f1(Math.cos(a) * 90), y2: f1(Math.sin(a) * 90), stroke: 'rgba(90,45,10,.24)', 'stroke-width': 1.1 }, fat);
      }
    }
    if (meio) sv('line', { class: 'linha-meio', x1: 0, y1: -89, x2: 0, y2: 89, stroke: 'rgba(120,70,20,.55)', 'stroke-width': 1.6 }, raiz);
  }

  /* ================= animação da pizza =================
     trocarPizza redesenha e anima só o que mudou em relação ao que estava no SVG:
     - a massa fica; a borda só anima se mudou; o tamanho cresce/encolhe a partir do anterior;
     - ingredientes que saem levantam e somem; os que entram caem vistos de cima: nascem maiores
       ("perto da câmera") e encolhem até pousar, com a sombra se aproximando e um leve achatamento;
     - molho/queijo só trocam se mudaram (o novo aparece por cima do antigo);
     - montagem do zero (massa vazia → sabor): molho em espiral, queijo ralado que cai e derrete,
       ingredientes em ondas (um tipo por vez, varrendo), temperos como chuva fina e o corte das fatias.
     Para não travar o toque, as peças não ganham uma tween cada: um "condutor" por grupo calcula a pose
     de todas a cada quadro e grava só os atributos que mudaram (sem medir caixas nem ler estilos). */
  const TEMPEROS = new Set(['flocos', 'ralado', 'granulado']);
  const atr = (e, n, v) => { const k = '__' + n; if (e[k] !== v) { e[k] = v; if (v == null) e.removeAttribute(n); else e.setAttribute(n, v); } };
  const limita = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);
  function prefixoPizza(svg) { const d = svg.querySelector('defs [id]'); return d ? d.id.slice(0, -1) : null; }
  // guarda os nós do desenho atual: o desenho novo limpa o SVG e eles são reaproveitados na saída (sem clonar)
  function fotografarPizza(svg) {
    const pref = prefixoPizza(svg);
    if (!pref) return null;
    return { pref, metades: $$('.metade', svg), fatias: $('.fatias', svg), borda: $('.borda', svg), linhaMeio: $('.linha-meio', svg) };
  }
  // modo: undefined = anima a diferença; 'entrada' = monta do zero sobre a massa; false = só desenha
  function trocarPizza(svg, cfg, modo) {
    const velho = svg.__cfg;
    const antes = anima && velho && modo !== false && modo !== 'entrada' ? fotografarPizza(svg) : null;
    if (svg.__tl) { svg.__tl.kill(); svg.__tl = null; }
    desenharPizza(svg, cfg);
    const novo = svg.__cfg = { sabores: (cfg.sabores || [null]).slice(), tamanho: cfg.tamanho, borda: cfg.borda };
    if (!anima || modo === false) return;
    const de = modo === 'entrada' ? { sabores: novo.sabores.map(() => null), tamanho: novo.tamanho, borda: novo.borda } : velho;
    if (de) animarTroca(svg, de, novo, antes);
  }
  function animarTroca(svg, de, para, antes) {
    const raiz = $('.raiz', svg), corpo = $('.corpo-pizza', svg), fat = $('.fatias', svg);
    const extras = [];
    const limpar = () => extras.forEach((e) => e.remove());
    const tl = G.timeline({ onComplete: () => { limpar(); svg.__tl = null; } });
    svg.__tl = tl;
    const pref = prefixoPizza(svg);
    // move um nó do desenho anterior para a camada de saída, apontando gradientes/filtros para o desenho novo
    const inserir = (no, antesDe) => {
      if (!no) return null;
      const g = sv('g', { class: 'saindo', 'aria-hidden': 'true' });
      g.appendChild(no);
      if (antes && antes.pref && pref) [no, ...no.querySelectorAll('[fill^="url"],[stroke^="url"],[filter],[mask],[clip-path]')].forEach((e) => {
        ['fill', 'stroke', 'filter'].forEach((a) => { const v = e.getAttribute(a); if (v && v.indexOf('#' + antes.pref) >= 0) e.setAttribute(a, v.replace('#' + antes.pref, '#' + pref)); });
        e.removeAttribute('mask'); e.removeAttribute('clip-path');
      });
      raiz.insertBefore(g, antesDe || null);
      extras.push(g);
      return g;
    };
    // tamanho: parte do tamanho anterior
    if (de.tamanho !== para.tamanho) {
      const k = (de.tamanho === 'broto' ? 0.8 : 1) / (para.tamanho === 'broto' ? 0.8 : 1);
      tl.fromTo(corpo, { scale: k, svgOrigin: '0 0' }, { scale: 1, svgOrigin: '0 0', duration: 0.55, ease: 'back.out(1.4)' }, 0);
    }
    // borda
    if (de.borda !== para.borda) {
      const novos = $$('.borda path', svg);
      if (novos.length) tl.fromTo(novos, { opacity: 0, scale: 1.06, svgOrigin: '0 0' }, { opacity: 1, scale: 1, svgOrigin: '0 0', duration: 0.42, stagger: 0.04, ease: 'power3.out' }, 0);
      const br = $('.borda-brilho', svg);
      if (br) tl.fromTo(br, { strokeDashoffset: 22 }, { strokeDashoffset: 0, duration: 0.6, ease: 'sine.out' }, 0.05);
      if (antes && antes.borda && antes.borda.childElementCount) tl.to(inserir(antes.borda, $('.metade', svg)), { opacity: 0, duration: 0.3, ease: 'power2.in' }, 0);
    }
    // sabores, metade por metade
    const layout = (de.sabores.length > 1) !== (para.sabores.length > 1);
    const idx = para.sabores.map((_, i) => i).filter((i) => layout || para.sabores[i] !== de.sabores[i]);
    const tinhaSabor = de.sabores.some(Boolean), temSabor = para.sabores.some(Boolean);
    if (idx.length) {
      const velhas = antes ? (layout ? antes.metades.map((m, k) => [m, k]) : idx.map((i) => [antes.metades[i], i]).filter(([m]) => m)) : [];
      const mudouBase = (i) => {
        if (layout) return true;
        const a = analisar(sabor(para.sabores[i])), b = analisar(sabor(de.sabores[i]));
        return !(a && b && a.base === b.base && a.queijo === b.queijo);
      };
      // molho/queijo antigos ficam por baixo enquanto os novos aparecem (só onde mudaram)
      velhas.forEach(([m, i]) => {
        if (!de.sabores[i] || (!layout && !mudouBase(i))) return;
        ['.base', '.queijo'].forEach((s) => { const no = m.querySelector(s); if (no) inserir(no, $('.metade', svg)); });
      });
      // ingredientes antigos levantam (a camada inteira cresce um pouco e some, como se subisse)
      let tEntra = 0;
      velhas.forEach(([m]) => {
        const tops = m.querySelector('.tops');
        if (tops && tops.childElementCount) { levantar(tl, inserir(tops, fat)); tEntra = 0.12; }
      });
      idx.forEach((i) => {
        const gm = $('.metade.m' + i, svg);
        if (!gm) return;
        const base = $('.base', gm), queijo = $('.queijo', gm);
        const vazioAntes = layout ? !tinhaSabor : !de.sabores[i];
        if (vazioAntes && para.sabores[i]) {
          // montagem do zero nesta metade
          if (base) espiralMolho(tl, svg, base, 0);
          if (queijo) chuvaQueijo(tl, gm, queijo, i, para.sabores.length > 1, 0.3);
          cairIngredientes(tl, gm, queijo ? 0.66 : 0.4);
        } else {
          if (mudouBase(i)) tl.fromTo([base, queijo].filter(Boolean), { opacity: 0 }, { opacity: 1, duration: 0.38, ease: 'power1.inOut' }, 0.04);
          cairIngredientes(tl, gm, tEntra);
        }
      });
      // linha do meio
      const lm = $('.linha-meio', svg);
      if (layout && lm) tl.fromTo(lm, { strokeDasharray: 180, strokeDashoffset: 180 }, { strokeDashoffset: 0, duration: 0.35, ease: 'power2.out' }, 0.05);
      if (layout && !lm && antes && antes.linhaMeio) tl.to(inserir(antes.linhaMeio), { opacity: 0, duration: 0.25 }, 0);
      // fatias: cortadas no fim da primeira montagem; somem se a pizza ficou sem sabor
      if (!tinhaSabor && temSabor && fat) cortarFatias(tl, fat, Math.max(0.8, tl.duration() - 0.1));
      if (tinhaSabor && !temSabor && antes && antes.fatias && antes.fatias.childElementCount) tl.to(inserir(antes.fatias), { opacity: 0, duration: 0.25 }, 0);
    }
    if (!tl.getChildren().length) { tl.kill(); limpar(); svg.__tl = null; }
  }
  function levantar(tl, g) {
    const c = { u: 0 };
    tl.to(c, { u: 1, duration: 0.24, ease: 'power2.in', onUpdate: () => { atr(g, 'transform', 'scale(' + (1 + 0.1 * c.u).toFixed(3) + ')'); atr(g, 'opacity', (1 - c.u).toFixed(3)); } }, 0);
  }
  // ingredientes em ondas, um tipo por vez (na ordem das camadas), varrendo da esquerda para a direita;
  // fios (barbecue, chocolate) são desenhados depois; temperos caem por último, como chuva fina
  function cairIngredientes(tl, gm, t0) {
    const grupos = new Map();
    $$('.peca', gm).forEach((p) => { const k = p.getAttribute('data-k'); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(p); });
    const lista = [...grupos.values()], pecas = [];
    let t = t0;
    const onda = (g, chuva) => {
      const ord = g.map((p) => {
        const x = +p.getAttribute('data-x') || 0, y = +p.getAttribute('data-y') || 0, s = +p.getAttribute('data-s') || 1.3, r = (+p.getAttribute('data-r') || 0) * Math.PI / 180;
        // a sombra começa longe e larga (peça alta) e vem até o contato; deslocamento do mundo → espaço girado da peça
        const ca = Math.cos(-r), sa = Math.sin(-r);
        return { p, x, h: Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1, sx: (7 * ca - 9 * sa) / s, sy: (7 * sa + 9 * ca) / s };
      });
      ord.sort(chuva ? (a, b) => a.h - b.h : (a, b) => a.x - b.x);
      const passo = chuva ? Math.min(0.012, 0.3 / ord.length) : Math.min(0.03, 0.26 / ord.length);
      ord.forEach((o, k) => {
        const top = o.p.querySelector('.top'), sombra = o.p.querySelector('.top-sombra'), imp = o.p.querySelector('.impacto');
        const leve = o.p.getAttribute('data-peso') === 'leve';
        pecas.push({ top, sombra, imp, t: t + k * passo, chuva, leve, ini: chuva ? 1.3 : leve ? 1.45 : 1.75, dur: chuva ? 0.22 : leve ? 0.42 : 0.32, giro: leve && !chuva ? (k % 2 ? -28 : 28) : 0, sx: o.sx, sy: o.sy, op: sombra ? sombra.getAttribute('opacity') : null });
      });
    };
    lista.filter((g) => !TEMPEROS.has(g[0].getAttribute('data-f'))).forEach((g) => { onda(g, false); t += 0.09; });
    const fios = $$('.fio', gm);
    fios.forEach((p, i) => {
      const L = p.getTotalLength ? p.getTotalLength() : 600;
      tl.fromTo(p, { strokeDasharray: L + ' ' + L, strokeDashoffset: L }, { strokeDashoffset: 0, duration: 0.7, ease: 'power2.inOut' }, t + i * 0.02);
    });
    if (fios.length) t += 0.14;
    lista.filter((g) => TEMPEROS.has(g[0].getAttribute('data-f'))).forEach((g) => { onda(g, true); t += 0.06; });
    if (!pecas.length) return;
    posicionarPecas(pecas, -1);
    // durante a queda o grupo fica sem o filtro de sombra (refazê-lo a cada quadro pesa); as sombras elípticas
    // já dão profundidade e o filtro volta quando tudo pousa
    const tg = $('.tops', gm), filtro = tg && tg.getAttribute('filter');
    if (filtro) tg.removeAttribute('filter');
    const fim = Math.max(...pecas.map((q) => q.t + q.dur)) + 0.25;
    const c = { t: t0 };
    tl.to(c, { t: fim, duration: fim - t0, ease: 'none', onUpdate: () => posicionarPecas(pecas, c.t), onComplete: () => { posicionarPecas(pecas, Infinity); if (filtro && tg.isConnected) tg.setAttribute('filter', filtro); } }, t0);
  }
  // pose de cada peça no instante t: escala caindo (aceleração), giro dos leves, sombra se aproximando, achatamento e anel no impacto
  function posicionarPecas(pecas, t) {
    for (const q of pecas) {
      const v = (t - q.t) / q.dur;
      if (v < 0) { atr(q.top, 'opacity', '0'); if (q.sombra) atr(q.sombra, 'opacity', '0'); continue; }
      if (v < 1) {
        const e = q.leve && !q.chuva ? Math.sin(v * Math.PI / 2) : v * v;
        const s = q.ini + (1 - q.ini) * e, g = q.giro * (1 - e);
        atr(q.top, 'transform', (g ? 'rotate(' + g.toFixed(1) + ') ' : '') + 'scale(' + s.toFixed(3) + ')');
        atr(q.top, 'opacity', limita((t - q.t) / 0.06).toFixed(2));
        if (q.sombra) {
          atr(q.sombra, 'transform', 'translate(' + (q.sx * (1 - e)).toFixed(2) + ' ' + (q.sy * (1 - e)).toFixed(2) + ') scale(' + (1.7 - 0.7 * e).toFixed(3) + ')');
          atr(q.sombra, 'opacity', (+(q.op || 0.15) * e).toFixed(3));
        }
        continue;
      }
      // pousou: achata um instante (só os pesados) e o anel de impacto se abre
      const d = t - q.t - q.dur;
      const pesado = !q.leve && !q.chuva;
      const sq = pesado && d < 0.1 ? 1 + 0.07 * Math.sin(limita(d / 0.1) * Math.PI) : 1;
      atr(q.top, 'transform', sq !== 1 ? 'scale(' + sq.toFixed(3) + ')' : null);
      atr(q.top, 'opacity', null);
      if (q.sombra) { atr(q.sombra, 'transform', null); atr(q.sombra, 'opacity', q.op); }
      if (q.imp && pesado) {
        const u = limita(d / 0.22);
        atr(q.imp, 'transform', u < 1 ? 'scale(' + (0.4 + 1.7 * u).toFixed(3) + ')' : null);
        atr(q.imp, 'opacity', u < 1 ? (0.32 * (1 - u)).toFixed(3) : '0');
      }
    }
  }
  // molho espalhado em espiral pela concha: máscara com uma espiral grossa que se desenha do centro para fora
  function espiralMolho(tl, svg, baseG, t0) {
    const defs = $('defs', svg);
    if (!defs) return;
    const id = 'molho' + (++uidSvg);
    const mask = sv('mask', { id, maskUnits: 'userSpaceOnUse', x: -130, y: -130, width: 260, height: 260 }, defs);
    let d = '';
    for (let k = 0; k <= 160; k++) { const u = k / 160, th = u * 3.2 * 6.283, r = 1 + 99 * u; d += (k ? ' L' : 'M') + f1(Math.cos(th) * r) + ',' + f1(Math.sin(th) * r); }
    const p = sv('path', { d, fill: 'none', stroke: '#fff', 'stroke-width': 36, 'stroke-linecap': 'butt', 'stroke-linejoin': 'round' }, mask); const centro = sv('circle', { r: 19, fill: '#fff', opacity: 0 }, mask);
    const L = p.getTotalLength();
    baseG.setAttribute('mask', 'url(#' + id + ')');
    tl.fromTo(p, { strokeDasharray: L + ' ' + L, strokeDashoffset: L }, { strokeDashoffset: 0, duration: 0.5, ease: 'power1.inOut', onComplete: () => { baseG.removeAttribute('mask'); mask.remove(); } }, t0);
    tl.to(centro, { attr: { opacity: 1 }, duration: 0.05, ease: 'none' }, t0);   // a primeira concha cobre o centro
  }
  // queijo ralado cai e derrete: fiapos caem, a camada lisa aparece por baixo e os fiapos somem
  function chuvaQueijo(tl, gm, queijoG, mi, meio, t0) {
    const lado = meio ? (mi === 0 ? -1 : 1) : 0;
    const rng = rngDe('ralado' + mi);
    const g = sv('g', { class: 'ralado' });
    gm.insertBefore(g, queijoG.nextSibling);
    const fiapos = pontosNaMetade(meio ? 22 : 40, rng, lado, 78).map(([x, y], k) => {
      const a = Math.round(rng() * 180), c = 3.2 + rng() * 2.6;
      const e = sv('path', { d: 'M' + f1(-c) + ',0 q' + f1(c) + ',' + f1(-1.4 - rng()) + ' ' + f1(c * 2) + ',0', fill: 'none', stroke: rng() > 0.5 ? '#F7DE8E' : '#F2CB68', 'stroke-width': 2.2, 'stroke-linecap': 'round', opacity: 0 }, g);
      return { e, x: f1(x), y: f1(y), a, t: rng() * 0.28 };
    });
    const c = { t: 0 };
    tl.to(c, { t: 0.5, duration: 0.5, ease: 'none', onUpdate: () => fiapos.forEach((f) => {
      const v = limita((c.t - f.t) / 0.22), s = 1.6 - 0.6 * v * v;
      atr(f.e, 'transform', 'translate(' + f.x + ' ' + f.y + ') rotate(' + f.a + ') scale(' + s.toFixed(3) + ')');
      atr(f.e, 'opacity', limita((c.t - f.t) / 0.05).toFixed(2));
    }) }, t0)
      .fromTo(queijoG, { opacity: 0 }, { opacity: 1, duration: 0.32, ease: 'power1.inOut' }, t0 + 0.26)
      .to(g, { opacity: 0, duration: 0.26, ease: 'power1.in', onComplete: () => g.remove() }, t0 + 0.38);
  }
  // corte das fatias: cada linha é "riscada" do centro para a borda, uma depois da outra
  function cortarFatias(tl, fat, t0) {
    const linhas = $$('line', fat);
    if (linhas.length) tl.fromTo(linhas, { strokeDasharray: 92, strokeDashoffset: 92 }, { strokeDashoffset: 0, duration: 0.18, ease: 'power1.out', stagger: 0.04 }, t0);
  }

  const CACHE_MINI = {};
  function miniSVG(cfg, extraClass) {
    const chave = JSON.stringify(cfg);
    if (!CACHE_MINI[chave]) {
      const s = document.createElementNS(NS, 'svg');
      s.setAttribute('viewBox', '-104 -104 208 208');
      desenharPizza(s, cfg, { mini: true });
      CACHE_MINI[chave] = s.innerHTML;
    }
    return '<svg viewBox="-104 -104 208 208" class="' + (extraClass || '') + '" aria-hidden="true">' + CACHE_MINI[chave] + '</svg>';
  }
  const CACHE_THUMB = {};
  function thumbSabor(s, cls) {
    if (s.foto) return '<img src="' + esc(s.foto) + '" alt="" loading="lazy" class="' + (cls || '') + '">';
    // miniatura como imagem: cada redesenho da lista recriava ~16 mil elementos SVG (86 sabores)
    const cfg = { sabores: [s.id], tamanho: 'grande', borda: 'sem' }, chave = JSON.stringify(cfg);
    if (!CACHE_THUMB[chave]) {
      miniSVG(cfg);
      CACHE_THUMB[chave] = URL.createObjectURL(new Blob(['<svg xmlns="http://www.w3.org/2000/svg" viewBox="-104 -104 208 208">' + CACHE_MINI[chave] + '</svg>'], { type: 'image/svg+xml' }));
    }
    return '<img src="' + CACHE_THUMB[chave] + '" alt="" decoding="async" class="' + (cls || '') + '">';
  }

  /* ================= topo, status, textos dinâmicos ================= */
  function renderStatus() {
    const st = statusAgora();
    const el = $('#status');
    el.classList.toggle('aberto', st.aberto);
    el.lastElementChild.textContent = st.texto;
    $('#avisoTeste').hidden = !(D.config.modoTeste && !st.aberto);
  }
  function renderTextos() {
    const c = D.config;
    const n = D.sabores.filter((s) => s.ativo !== false).length;
    $('#heroSub').textContent = 'São ' + n + ' sabores, meio a meio e borda recheada. Você vê como fica, e o pedido cai direto no nosso WhatsApp.';
    $('#metaTempo').textContent = 'Entrega ' + c.tempoEntrega;
    $('#faqFone').textContent = c.telefoneFixo;
    $('#rodEnd').textContent = c.endereco;
    $('#rodFone').textContent = c.telefoneFixo;
    $('#rodZap').textContent = foneFmt(c.whatsapp);
    $('#rodInsta').textContent = '@' + c.instagram;
    $('#rodInsta').href = 'https://www.instagram.com/' + encodeURIComponent(c.instagram) + '/';
    $('#rodFamilia').textContent = 'Pizzaria de família. Fundadora: ' + c.fundadora + '. CEO: ' + c.ceo + '.';
    const hoje = new Date().getDay();
    $('#rodHor').innerHTML = [1, 2, 3, 4, 5, 6, 0].map((d) => {
      const h = D.horarios.find((x) => x.dia === d);
      return '<li class="' + (d === hoje ? 'hoje' : '') + '"><span>' + DIAS[d] + '</span><span>' + (h && h.aberto ? h.abre + ' às ' + h.fecha : 'Fechado') + '</span></li>';
    }).join('');
    const nomes = D.sabores.filter((s) => s.ativo !== false && (s.novo || s.cat === 'premium' || s.cat === 'doces')).slice(0, 18).map((s) => s.nome);
    const seq = [];
    nomes.forEach((nm, i) => { seq.push('<span>' + esc(nm) + '</span>'); if (i % 5 === 4) seq.push('<span class="huum">HUUUUMMM</span>'); });
    $('#marquee').innerHTML = seq.join('') + seq.join('');
  }
  const foneFmt = (n) => { const d = String(n || '').replace(/\D/g, ''); return d.length === 11 ? '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7) : d.length === 10 ? '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6) : d; };

  /* ================= hero ================= */
  const HERO_SEQ = [
    { s: ['promo-calabresa'], r: 'Calabresa', sub: 'inteira' },
    { s: ['costela-premium', 'pereira'], r: 'Costela + Pereira', sub: 'meio a meio' },
    { s: ['portuguesa'], r: 'Portuguesa', sub: 'borda catupiry', b: 'catupiry' },
    { s: ['morango-ninho', 'pistache-chocolate'], r: 'Morango Ninho + Pistache', sub: 'doce, meio a meio' },
    { s: ['brasil'], r: 'Brasil', sub: 'Copa 2026' }
  ];
  let heroI = 0, heroTimer = null, heroVisivel = true, heroLoops = [], seloGiro = null;
  function sincronizaHeroMotion() {
    const naTela = heroVisivel && !document.hidden, rodar = naTela && !CELULAR.matches;
    heroLoops.forEach((t) => rodar ? t.resume() : t.pause());
    // o selo aparece também no celular: só depende do topo estar na tela
    if (seloGiro) { if (naTela) seloGiro.resume(); else seloGiro.pause(); }
  }
  function ajustaHeroResponsivo() {
    const box = $('#flutuantes');
    if (box) box.hidden = CELULAR.matches;
    sincronizaHeroMotion();
  }
  // vazia: só a massa (o hero começa assim e monta a primeira pizza logo depois)
  function heroMostra(i, anim, vazia) {
    const it = HERO_SEQ[i % HERO_SEQ.length];
    const sabs = it.s.filter((id) => sabor(id));
    if (!sabs.length) return;
    const cfg = vazia ? { sabores: [null], tamanho: 'grande', borda: 'sem' } : { sabores: sabs, tamanho: 'grande', borda: it.b && D.bordas.some((x) => x.id === it.b) ? it.b : 'sem' };
    trocarPizza($('#heroPizza'), cfg, anim ? undefined : false);
    $('#heroRotulo').innerHTML = '<span>' + esc(it.r) + '</span><small>' + esc(it.sub) + '</small>';
  }
  function heroCiclo() {
    clearInterval(heroTimer);
    if (!anima) return;
    heroTimer = setInterval(() => {
      if (!heroVisivel || document.hidden) return;
      heroI++; heroMostra(heroI, true);
    }, 3600);
  }
  function heroFlutuantes() {
    const box = $('#flutuantes');
    const itens = [
      { spec: { f: 'tomate', r: 9 }, x: 52, y: 14, s: 3.2 },
      { spec: { f: 'rucula' }, x: 93, y: 22, s: 3 },
      { spec: { f: 'calabresa' }, x: 96, y: 74, s: 3 },
      { spec: { f: 'azeitona' }, x: 49, y: 86, s: 3.4 },
      { spec: { f: 'cogumelo' }, x: 72, y: 94, s: 2.6 },
      { spec: { f: 'biquinho' }, x: 88, y: 50, s: 3 }
    ];
    heroLoops.forEach((t) => t.kill());
    heroLoops = [];
    box.innerHTML = '';
    const rng = rngDe('flutua');
    itens.forEach((it, i) => {
      const d = document.createElement('div');
      d.className = 'flutua';
      d.style.left = it.x + '%';
      d.style.top = it.y + '%';
      const s = document.createElementNS(NS, 'svg');
      s.setAttribute('viewBox', '-10 -10 20 20');
      s.setAttribute('width', String(Math.round(it.s * 14)));
      s.setAttribute('height', String(Math.round(it.s * 14)));
      desenharTop(sv('g', {}, s), it.spec, rng, false);
      d.appendChild(s);
      d.dataset.prof = String(0.4 + (i % 3) * 0.35);
      box.appendChild(d);
    });
    ajustaHeroResponsivo();
    if (!anima) return;
    $$('.flutua', box).forEach((d, i) => {
      G.from(d, { scale: 0, opacity: 0, rotation: -90, duration: 0.8, delay: 0.9 + i * 0.08, ease: 'back.out(2)' });
      heroLoops.push(G.to(d.firstChild, { y: '+=' + (8 + i * 2), rotation: i % 2 ? 12 : -12, duration: 2.4 + i * 0.3, yoyo: true, repeat: -1, ease: 'sine.inOut' }));
    });
    sincronizaHeroMotion();
    if (FINO) {
      const qs = $$('.flutua', box).map((d) => ({ d, x: G.quickTo(d, 'x', { duration: 0.8, ease: 'power3' }), y: G.quickTo(d, 'y', { duration: 0.8, ease: 'power3' }) }));
      const palcoQx = G.quickTo('#heroPizza', 'x', { duration: 1, ease: 'power3' });
      const palcoQy = G.quickTo('#heroPizza', 'y', { duration: 1, ease: 'power3' });
      $('.hero').addEventListener('pointermove', (e) => {
        const cx = e.clientX / window.innerWidth - 0.5, cy = e.clientY / window.innerHeight - 0.5;
        qs.forEach((q) => { const p = +q.d.dataset.prof; q.x(cx * 60 * p); q.y(cy * 50 * p); });
        palcoQx(cx * -10); palcoQy(cy * -8);
      });
    }
  }
  function heroIntro() {
    if (!anima) return;
    // tempos absolutos: o título entra logo e o botão principal já está visível por volta de 0,7 s
    const tl = G.timeline({ defaults: { ease: 'power4.out' } });
    tl.from('.selo-huum', { y: 16, opacity: 0, duration: 0.45 }, 0)
      .from('.hero h1 .w', { yPercent: 70, opacity: 0, rotate: 4, duration: 0.7, stagger: 0.045 }, 0.1)
      .from('.hero .sub', { y: 18, opacity: 0, duration: 0.5 }, 0.32)
      .from('.hero .ctas > *', { y: 18, opacity: 0, duration: 0.45, stagger: 0.07 }, 0.42)
      .fromTo('#risco', { strokeDasharray: 220, strokeDashoffset: 220 }, { strokeDashoffset: 0, duration: 0.6, ease: 'power2.inOut' }, 0.55)
      .from('.hero .meta span', { opacity: 0, duration: 0.35, stagger: 0.05 }, 0.65)
      .from('#heroPalco', { scale: 0.85, rotation: -25, opacity: 0, duration: 1.0, ease: 'expo.out' }, 0.05)
      .from('#heroRotulo', { y: 18, opacity: 0, duration: 0.45 }, 0.8);
    // o selo só gira enquanto o topo está na tela (sincronizaHeroMotion pausa fora dela)
    seloGiro = G.to('#seloGiro', { rotation: 360, duration: 80, repeat: -1, ease: 'none' });
    sincronizaHeroMotion();
    if (window.ScrollTrigger) {
      G.to('#heroPalco .tabua, #heroPizza', { yPercent: 14, rotation: 35, scale: 0.88, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.6 } });
      G.to('.hero-txt', { y: -60, opacity: 0.25, ease: 'none', scrollTrigger: { trigger: '.hero', start: '30% top', end: 'bottom top', scrub: 0.6 } });
      window.ScrollTrigger.create({ trigger: '.hero', start: 'top bottom', end: 'bottom top', onToggle: (s) => { heroVisivel = s.isActive; sincronizaHeroMotion(); } });
    }
  }

  /* ================= promoções (vitrine) ================= */
  function padraoDoSlot(slot, k) {
    if (slot.padrao && slot.padrao.length) return slot.padrao[k] || slot.padrao[0];
    if (slot.tipo === 'item') return slot.itens[0] || (D.adicionais.find((a) => a.tipo === 'bebida') || {}).id;
    if (slot.sabores.length) return slot.sabores[0];
    const s = D.sabores.find((x) => saborDisp(x, slot.tamanho || 'grande') && (!slot.categorias.length || slot.categorias.includes(x.cat)));
    return s && s.id;
  }
  function renderPromos() {
    const ativas = D.promocoes.filter((p) => p.ativa);
    const pista = $('#pista');
    if (!ativas.length) { pista.innerHTML = '<p class="dica">Nenhuma promoção ativa hoje.</p>'; return; }
    pista.innerHTML = ativas.map((p) => {
      let vis = '';
      if (p.condicao.tipo === 'itens') {
        p.condicao.slots.forEach((sl) => {
          for (let k = 0; k < sl.qtd; k++) {
            const pid = padraoDoSlot(sl, k);
            if (sl.tipo === 'pizza' && sabor(pid)) vis += miniSVG({ sabores: [pid], tamanho: sl.tamanho || 'grande', borda: 'sem' }, sl.tamanho === 'broto' ? 'broto' : '');
            else if (sl.tipo === 'item') vis += '<span class="garrafa"></span>';
          }
        });
      }
      const r = p.recompensa;
      const preco = r.tipo === 'preco_fixo' ? '<small>R$</small>' + Math.floor(r.valor) + (r.valor % 1 ? '<small>,' + String(Math.round((r.valor % 1) * 100)).padStart(2, '0') + '</small>' : '')
        : r.tipo === 'desconto_pct' ? r.valor + '<small>% off</small>'
        : r.tipo === 'desconto_valor' ? '<small>-R$</small>' + r.valor
        : r.tipo === 'frete_gratis' ? '<span style="font-size:36px">Frete grátis</span>'
        : r.tipo === 'borda_gratis' ? '<span style="font-size:36px">Borda grátis</span>'
        : '<span style="font-size:36px">Brinde</span>';
      const quando = descQuando(p.quando);
      const podeMontar = p.condicao.tipo === 'itens' && p.condicao.slots.every((sl) => padraoDoSlot(sl, 0));
      return '<article class="cupom"><div class="nome">' + esc(p.nome) + (p.exemplo ? ' <span class="tag tag-ex">exemplo</span>' : '') + '</div>' +
        '<div class="preco num">' + preco + '</div><span class="picote" aria-hidden="true"></span>' +
        '<p class="desc">' + esc(p.descricao) + (quando ? '<br><b>' + esc(quando) + '</b>' : '') + '</p>' +
        '<div class="mini-pizzas" aria-hidden="true">' + vis + '</div>' +
        (podeMontar ? '<button class="btn" type="button" data-combo="' + esc(p.id) + '">Quero esse combo <span class="seta" aria-hidden="true">→</span></button>' : '<a class="btn btn-ghost" href="#montar">Montar pedido</a>') +
        '</article>';
    }).join('');
  }
  function descQuando(q) {
    const partes = [];
    if (q.dias && q.dias.length && q.dias.length < 7) partes.push(q.dias.map((d) => DIAS_C[d]).join(', '));
    if (q.horaIni || q.horaFim) partes.push((q.horaIni || '') + '–' + (q.horaFim || ''));
    if (q.canal && q.canal !== 'todos') partes.push('só ' + q.canal);
    if (q.cupom) partes.push('cupom ' + q.cupom);
    return partes.join(' · ');
  }
  function addCombo(id) {
    const p = D.promocoes.find((x) => x.id === id);
    if (!p) return;
    p.condicao.slots.forEach((sl) => {
      for (let k = 0; k < sl.qtd; k++) {
        const pid = padraoDoSlot(sl, k);
        if (sl.tipo === 'pizza') addCarrinho({ tipo: 'pizza', tamanho: sl.tamanho || 'grande', sabores: [pid], borda: 'sem', massa: D.massas[0].id, obs: '', qtd: 1 }, true);
        else addCarrinho({ tipo: 'item', itemId: pid, qtd: 1 }, true);
      }
    });
    toast(p.nome + ' no pedido!');
    abrirGaveta(0);
  }
  // Celular: combos em carrossel com encaixe e pontinhos mostrando em qual cartão você está.
  function pistaCelular() {
    const wrap = $('#pistaWrap'), pista = $('#pista'), pontos = $('#pistaPontos');
    const cards = $$('.cupom', pista);
    wrap.style.overflowX = 'auto';
    wrap.style.scrollSnapType = 'x mandatory';
    cards.forEach((c) => { c.style.scrollSnapAlign = 'center'; });
    pontos.innerHTML = cards.length > 1 ? cards.map(() => '<i></i>').join('') : '';
    const marca = () => {
      const w = wrap.getBoundingClientRect(), meio = w.left + w.width / 2;
      let k = 0, melhor = Infinity;
      cards.forEach((c, i) => { const r = c.getBoundingClientRect(), d = Math.abs(r.left + r.width / 2 - meio); if (d < melhor) { melhor = d; k = i; } });
      $$('i', pontos).forEach((p, i) => p.classList.toggle('on', i === k));
    };
    wrap.addEventListener('scroll', marca, { passive: true });
    marca();
    return () => { wrap.removeEventListener('scroll', marca); wrap.style.overflowX = ''; pontos.innerHTML = ''; };
  }
  function promoInterativo() {
    const wrap = $('#pistaWrap'), pista = $('#pista');
    if (!anima || !window.ScrollTrigger) { wrap.style.overflowX = 'auto'; if (CELULAR.matches) pistaCelular(); return; }
    const mm = G.matchMedia();
    mm.add('(min-width: 861px)', () => {
      const dist = () => Math.max(0, pista.scrollWidth - window.innerWidth + 40);
      if (dist() < 40) return;
      const tw = G.to(pista, { x: () => -dist(), ease: 'none', scrollTrigger: { trigger: '#promocoes', start: 'top top', end: () => '+=' + dist(), pin: true, scrub: 0.8, invalidateOnRefresh: true } });
      return () => tw.kill();
    });
    mm.add('(max-width: 860px)', pistaCelular);
    if (FINO) {
      $$('.cupom', pista).forEach((c) => {
        const rx = G.quickTo(c, 'rotationX', { duration: 0.5 }), ry = G.quickTo(c, 'rotationY', { duration: 0.5 });
        G.set(c, { transformPerspective: 800 });
        c.addEventListener('pointermove', (e) => { const r = c.getBoundingClientRect(); ry(((e.clientX - r.left) / r.width - 0.5) * 10); rx(-((e.clientY - r.top) / r.height - 0.5) * 10); });
        c.addEventListener('pointerleave', () => { rx(0); ry(0); });
      });
    }
    G.from($$('.cupom', pista), { y: 50, opacity: 0, duration: 0.7, stagger: 0.1, ease: 'power3.out', scrollTrigger: { trigger: '#promocoes', start: 'top 75%', once: true } });
  }

  /* ================= montador ================= */
  const M = { tamanho: null, modo: 'inteira', sabores: [null, null], ativa: 0, massa: null, borda: 'sem', obs: '', passo: 0, cat: 'todas', busca: '', edit: null, pronto: false };
  function passosMont() {
    const p = ['tamanho', 'sabores'];
    if (D.massas.length > 1) p.push('massa');
    p.push('borda', 'obs');
    return p;
  }
  const NOME_PASSO = { tamanho: 'Tamanho', sabores: 'Sabores', massa: 'Massa', borda: 'Borda', obs: 'Observação' };
  const sabsAtuais = () => (M.modo === 'meio' ? M.sabores.slice(0, 2) : [M.sabores[0]]);
  const cfgAtual = () => ({ sabores: M.tamanho ? sabsAtuais() : [null], tamanho: M.tamanho || 'grande', borda: M.borda });
  const montValido = (passo) => {
    if (passo === 'tamanho') return !!M.tamanho;
    if (passo === 'sabores') return sabsAtuais().every(Boolean);
    return true;
  };
  function precoMont() {
    if (!M.tamanho || !sabsAtuais().some(Boolean)) return 0;
    return precoPizza({ tamanho: M.tamanho, sabores: sabsAtuais().filter(Boolean), borda: M.borda, massa: M.massa || D.massas[0].id });
  }
  function atualizaPalco(anim) {
    trocarPizza($('#montPizza'), cfgAtual(), anim === null ? false : undefined);
    const sabs = sabsAtuais().map(sabor).filter(Boolean);
    $('#montTitulo').textContent = !M.tamanho ? 'Escolha o tamanho' : sabs.length ? sabs.map((s) => s.nome).join(' + ') : 'Pizza ' + nomeTam(M.tamanho);
    const det = [];
    if (M.tamanho) det.push(nomeTam(M.tamanho));
    if (M.modo === 'meio') det.push('meio a meio');
    const b = borda(M.borda); if (b.cor) det.push('borda ' + b.nome.toLowerCase());
    if (D.massas.length > 1 && M.massa) det.push('massa ' + massa(M.massa).nome.toLowerCase());
    $('#montDet').textContent = det.join(' · ') || 'Comece pelo passo 1';
    contaPreco($('#montPreco'), precoMont());
  }
  function contaPreco(el, valor) {
    const atual = +(el.dataset.v || 0);
    el.dataset.v = valor;
    if (!anima || atual === valor) { el.textContent = brl(valor); return; }
    const o = { v: atual };
    G.to(o, { v: valor, duration: 0.5, ease: 'power2.out', onUpdate: () => { el.textContent = brl(o.v); } });
  }
  // Barra segmentada + "Passo 2 de 5 · Sabores": cabe em qualquer largura, sem rolagem lateral.
  // attr: nome do data-* dos segmentos já feitos (clicáveis para voltar).
  function htmlStepper(nomes, atual, attr) {
    const segs = nomes.map((n, i) => {
      const cls = i === atual ? 'atual' : i < atual ? 'feito' : '';
      const rot = 'Passo ' + (i + 1) + ': ' + n + (i < atual ? ' (feito)' : '');
      return i < atual ? '<button type="button" class="' + cls + '" data-' + attr + '="' + i + '" aria-label="Voltar para ' + esc(rot) + '"></button>'
        : '<span class="' + cls + '"' + (i === atual ? ' aria-current="step"' : '') + ' aria-label="' + esc(rot) + '"></span>';
    }).join('');
    const prox = atual < nomes.length - 1 ? 'Depois: ' + nomes[atual + 1] : 'Último passo';
    return '<div class="st-barras">' + segs + '</div><div class="st-info"><b>Passo ' + (atual + 1) + ' de ' + nomes.length + '</b><span class="st-nome">· ' + esc(nomes[atual]) + '</span><span class="st-prox">' + prox + '</span></div>';
  }
  function renderPassos() {
    const ps = passosMont();
    $('#passos').innerHTML = htmlStepper(ps.map((p) => NOME_PASSO[p]), M.passo, 'passo');
    const ultimo = M.passo === ps.length - 1;
    $('#montAvancar').innerHTML = ultimo ? (M.edit != null ? 'Salvar<span class="so-pc"> alteração</span>' : 'Adicionar<span class="so-pc"> ao pedido</span>') + ' <span class="seta" aria-hidden="true">+</span>' : 'Continuar <span class="seta" aria-hidden="true">→</span>';
    $('#montVoltar').hidden = M.passo === 0;
  }
  function renderEtapa(anim) {
    const ps = passosMont();
    const p = ps[M.passo];
    const box = $('#etapa');
    let h = '';
    $('#montGrid .painel').classList.toggle('concluido', M.pronto);
    renderTeaser();
    if (M.pronto) {
      const n = qtdTotal();
      box.innerHTML = '<div class="pronto"><span class="ok" aria-hidden="true">✓</span><h3>Pizza no pedido!</h3><p>Seu pedido tem ' + n + (n === 1 ? ' item' : ' itens') + ' · ' + brl(totais().total) + '. Quer mais uma ou já vamos fechar?</p><div class="botoes"><button class="btn btn-lg" type="button" data-mont="finalizar">Finalizar pedido <span class="seta" aria-hidden="true">→</span></button><button class="btn btn-ghost" type="button" data-mont="outra">+ Montar outra pizza</button></div></div>';
      box.scrollTop = 0;
      if (anima) G.from(box.firstElementChild.children, { y: 16, opacity: 0, duration: 0.4, stagger: 0.06, ease: 'power2.out' });
      return;
    }
    if (p === 'tamanho') {
      h = '<div class="etapa"><h3>Qual o tamanho?</h3><div class="opcoes duas">' + D.config.tamanhos.map((t) => {
        const precos = D.sabores.filter((s) => saborDisp(s, t.id)).map((s) => precoSabor(s, t.id));
        const desde = precos.length ? Math.min(...precos) : 0;
        return '<button type="button" class="op" data-tam="' + t.id + '" aria-pressed="' + (M.tamanho === t.id) + '"><span class="ico-tam">' + miniSVG({ sabores: ['mussarela'], tamanho: t.id, borda: 'sem' }) + '</span><span><span class="nome">' + esc(t.nome) + '</span><br><span class="sub">' + esc(t.desc) + '</span><br><span class="sub">a partir de <b style="color:var(--tomate)">' + brl(desde) + '</b></span></span></button>';
      }).join('') + '</div></div>';
    } else if (p === 'sabores') {
      const max = (D.config.maxSabores || {})[M.tamanho] || 1;
      const metades = M.modo === 'meio' ? '<div class="metades">' + [0, 1].map((i) => { const s = sabor(M.sabores[i]); return '<button type="button" class="metade" data-metade="' + i + '" aria-pressed="' + (M.ativa === i) + '"><small>Metade ' + (i + 1) + '</small><span class="' + (s ? '' : 'vazio') + '">' + (s ? esc(s.nome) : 'Escolha abaixo') + '</span></button>'; }).join('') + '</div>' : '';
      h = '<div class="etapa"><h3>Escolha o sabor</h3>' +
        (max > 1 ? '<div class="opcoes duas fixa"><button type="button" class="op" data-modo="inteira" aria-pressed="' + (M.modo === 'inteira') + '"><span class="bolinha"></span><span class="nome">Inteira</span></button><button type="button" class="op" data-modo="meio" aria-pressed="' + (M.modo === 'meio') + '"><span class="bolinha"></span><span><span class="nome">Meio a meio</span><br><span class="sub">cobra o mais caro</span></span></button></div>' : '') +
        metades +
        '<div class="filtro-sab"><label class="busca"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span class="sr">Buscar sabor</span><input id="montBusca" type="search" placeholder="Buscar: calabresa, chocolate, bacon…" value="' + esc(M.busca) + '"></label>' +
        '<div class="cats" role="group" aria-label="Categorias">' + ['todas'].concat(D.categorias.map((c) => c.id)).map((c) => '<button type="button" class="chip" data-mcat="' + c + '" aria-pressed="' + (M.cat === c) + '">' + (c === 'todas' ? 'Todas' : esc(cat(c).nome)) + '</button>').join('') + '</div></div>' +
        '<div class="lista-sabores" id="listaSabores"></div></div>';
    } else if (p === 'massa') {
      h = '<div class="etapa"><h3>Qual massa?</h3><div class="opcoes">' + D.massas.map((m) => '<button type="button" class="op" data-massa="' + esc(m.id) + '" aria-pressed="' + ((M.massa || D.massas[0].id) === m.id) + '"><span class="bolinha"></span><span><span class="nome">' + esc(m.nome) + '</span><br><span class="sub">' + esc(m.desc || '') + '</span></span><span class="preco">' + (m.preco ? '+ ' + brl(m.preco) : 'sem custo') + '</span></button>').join('') + '</div></div>';
    } else if (p === 'borda') {
      h = '<div class="etapa"><h3>E a borda?</h3><div class="opcoes">' + D.bordas.filter((b) => b.ativo !== false).map((b) => '<button type="button" class="op" data-borda="' + esc(b.id) + '" aria-pressed="' + (M.borda === b.id) + '"><span class="bolinha"></span><span class="nome">' + esc(b.nome) + (b.exemplo ? ' <span class="tag tag-ex">preço exemplo</span>' : '') + '</span><span class="preco">' + (b.preco ? '+ ' + brl(b.preco) : '') + '</span></button>').join('') + '</div></div>';
    } else if (p === 'obs') {
      const pede = sabsAtuais().map(sabor).some((s) => s && s.pedeObs);
      h = '<div class="etapa"><h3>Alguma observação?</h3><p class="ajuda">' + (pede ? '<b style="color:var(--tomate)">Este sabor precisa de observação:</b> escreva os ingredientes ou o sabor escolhido.' : 'Ex.: sem cebola, bem assada, cortar em 12. Opcional.') + '</p><label class="sr" for="montObs">Observação da pizza</label><textarea id="montObs" maxlength="240" placeholder="Escreva aqui">' + esc(M.obs) + '</textarea></div>';
    }
    box.innerHTML = h;
    if (p === 'sabores') renderListaSabores();
    renderPassos();
    if (anima && anim) G.from(box.firstElementChild, { x: anim > 0 ? 30 : -30, opacity: 0, duration: 0.35, ease: 'power2.out' });
  }
  function renderListaSabores() {
    const lista = $('#listaSabores');
    if (!lista) return;
    const q = norm(M.busca);
    const sel = sabsAtuais();
    const itens = D.sabores.filter((s) => s.ativo !== false && (M.cat === 'todas' || s.cat === M.cat) && (!q || norm(s.nome + ' ' + s.ing).includes(q)));
    if (!itens.length) { lista.innerHTML = '<p class="vazio-busca">Nenhum sabor encontrado.</p>'; return; }
    lista.innerHTML = itens.map((s) => {
      const pr = precoSabor(s, M.tamanho);
      const disp = saborDisp(s, M.tamanho);
      const motivo = s.esgotado ? '<span class="tag tag-esg">esgotado hoje</span>' : pr == null ? '<span class="tag tag-esg">só ' + (M.tamanho === 'broto' ? 'grande' : 'broto') + '</span>' : '';
      return '<button type="button" class="sab" data-sab="' + esc(s.id) + '" aria-pressed="' + sel.includes(s.id) + '"' + (disp ? '' : ' disabled') + '>' + thumbSabor(s) + '<span><span class="n">' + esc(s.nome) + (s.novo ? ' <span class="tag tag-novo">novo</span>' : '') + motivo + '</span><span class="i">' + esc(s.ing || cat(s.cat).nome) + '</span></span><span class="p">' + (pr != null ? brl(pr) : '') + '</span></button>';
    }).join('');
  }
  function irPasso(i) {
    const ps = passosMont();
    i = Math.max(0, Math.min(ps.length - 1, i));
    for (let k = 0; k < i; k++) if (!montValido(ps[k])) { i = k; break; }
    const dir = i > M.passo ? 1 : -1;
    M.passo = i;
    renderEtapa(dir);
  }
  function montAvancar() {
    const ps = passosMont();
    const p = ps[M.passo];
    if (!montValido(p)) {
      toast(p === 'tamanho' ? 'Escolha um tamanho para continuar.' : M.modo === 'meio' ? 'Escolha os dois sabores.' : 'Escolha um sabor.');
      return;
    }
    if (p === 'obs') {
      const pede = sabsAtuais().map(sabor).some((s) => s && s.pedeObs);
      M.obs = ($('#montObs') || {}).value || '';
      if (pede && !M.obs.trim()) { toast('Escreva a observação pedida pelo sabor.'); return; }
    }
    if (M.passo < ps.length - 1) { irPasso(M.passo + 1); reageForninho('passo'); return; }
    const linha = { tipo: 'pizza', tamanho: M.tamanho, sabores: sabsAtuais().slice(), borda: M.borda, massa: M.massa || D.massas[0].id, obs: M.obs.trim(), qtd: 1 };
    levarAoForno(() => concluirPizza(linha));
  }
  function concluirPizza(linha) {
    if (!montAberto()) puloFab();
    if (M.edit != null) {
      const l = CART.find((x) => x.uid === M.edit);
      if (l) Object.assign(l, linha, { qtd: l.qtd });
      salvaCarrinho(); renderFab(); toast('Pizza atualizada.');
      resetMont();
      fecharMontador(true); abrirGaveta(0);
      return;
    }
    addCarrinho(linha, true);
    M.pronto = true;
    renderEtapa(0);
  }
  /* No celular o montador abre em tela cheia (início → passos → "pizza no pedido"); no computador ele fica na página. */
  const montAberto = () => document.documentElement.classList.contains('mont-aberto');
  function abrirMontador() {
    if (!CELULAR.matches) { $('#montar').scrollIntoView({ behavior: REDUZ ? 'auto' : 'smooth' }); return; }
    if (montAberto()) return;
    document.documentElement.classList.add('mont-aberto');
    abreTela('mont');
    renderEtapa(0); atualizaPalco('all');
    setTimeout(() => $('#montFechar').focus(), 50);
  }
  // trocar: outra tela abre em seguida e herda a entrada do histórico
  function fecharMontador(trocar) {
    if (!montAberto()) return;
    document.documentElement.classList.remove('mont-aberto');
    if (!trocar) fechaTela('mont');
    renderTeaser();
  }
  function renderTeaser() {
    const ps = passosMont();
    const emAndamento = M.edit != null || M.sabores.some(Boolean);
    $('#montTeaser').innerHTML = '<div class="mt-pizza" aria-hidden="true">' + miniSVG({ sabores: emAndamento ? sabsAtuais().map((x) => x || 'mussarela') : ['mussarela'], tamanho: M.tamanho || 'grande', borda: M.borda }) + '</div>' +
      '<ol class="mt-passos" aria-label="Como funciona">' + ps.map((p, i) => '<li><b>' + (i + 1) + '</b>' + NOME_PASSO[p] + '</li>').join('') + '</ol>' +
      '<button class="btn btn-lg" type="button" data-abrir-mont>' + (emAndamento ? 'Continuar montagem' : 'Começar a montar') + ' <span class="seta" aria-hidden="true">→</span></button>' +
      '<p class="mt-nota">Você vê a pizza mudando a cada escolha.</p>';
  }
  /* Botão voltar do celular fecha a tela aberta (montador ou carrinho) em vez de sair do site. */
  let telaHist = null;
  function abreTela(nome) {
    try { if (telaHist) history.replaceState({ tela: nome }, ''); else history.pushState({ tela: nome }, ''); telaHist = nome; } catch (e) { telaHist = null; }
  }
  function fechaTela(nome) {
    if (telaHist !== nome) return;
    telaHist = null;
    try { history.back(); } catch (e) { /* sem histórico disponível */ }
  }
  window.addEventListener('popstate', () => {
    const t = telaHist; telaHist = null;
    if (t === 'mont') fecharMontador(true);
    else if (t === 'gav') fecharGaveta(true);
  });
  function resetMont() {
    Object.assign(M, { modo: 'inteira', sabores: [null, null], ativa: 0, borda: 'sem', obs: '', passo: M.tamanho ? 1 : 0, busca: '', edit: null, pronto: false });
    renderEtapa(0);
    atualizaPalco('all');
  }
  function editarLinha(uidL) {
    const l = CART.find((x) => x.uid === uidL);
    if (!l || l.tipo !== 'pizza') return;
    Object.assign(M, { tamanho: l.tamanho, modo: l.sabores.length > 1 ? 'meio' : 'inteira', sabores: [l.sabores[0], l.sabores[1] || null], ativa: 0, borda: l.borda, massa: l.massa, obs: l.obs || '', passo: 1, edit: uidL, busca: '', cat: 'todas', pronto: false });
    fecharGaveta(CELULAR.matches);
    renderEtapa(0); atualizaPalco('all');
    abrirMontador();
  }
  function escolherSabor(id) {
    const s = sabor(id);
    if (!s) return;
    reageForninho('sabor');
    if (M.modo === 'meio') {
      const i = M.ativa;
      M.sabores[i] = id;
      const outro = i === 0 ? 1 : 0;
      if (!M.sabores[outro]) M.ativa = outro;
      atualizaPalco(i);
      marcaSabores();
    } else {
      M.sabores[0] = id;
      atualizaPalco('all');
      marcaSabores();
    }
  }
  // atualiza só o estado dos botões (lista e metades), sem recriar a lista de 86 sabores
  function marcaSabores() {
    const sel = sabsAtuais();
    $$('#listaSabores [data-sab]').forEach((b) => b.setAttribute('aria-pressed', String(sel.includes(b.dataset.sab))));
    $$('#etapa [data-metade]').forEach((b) => {
      const i = +b.dataset.metade, sb = sabor(M.sabores[i]), nome = b.querySelector('span');
      b.setAttribute('aria-pressed', String(M.ativa === i));
      if (nome) { nome.textContent = sb ? sb.nome : 'Escolha abaixo'; nome.className = sb ? '' : 'vazio'; }
    });
    renderPassos();
  }
  function puloFab() {
    const fab = $('#fab');
    fab.classList.add('visivel');
    fab.classList.remove('pulo'); void fab.offsetWidth; fab.classList.add('pulo');
  }
  /* Ao adicionar ao pedido: a cena abre em "íris" a partir da pizza do montador, a pizza voa até a pá do pizzaiolo,
     ele caminha e a põe no forno; a íris fecha no botão do pedido (ou volta ao montador no celular) e só então o
     fluxo segue. O pizzaiolo articulado, o forno e a coreografia vêm de PizzaioloCena (src/pizzaiolo.js). */
  let assando = false, cenaForno = null;
  const CACHE_BITMAP = {};
  // a pizza vai para a cena como bitmap: animar uma imagem é bem mais leve que ~900 elementos com filtros
  function pizzaEmBitmap(cfg, px) {
    const chave = JSON.stringify(cfg) + '|' + px;
    if (CACHE_BITMAP[chave]) return Promise.resolve(CACHE_BITMAP[chave]);
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '-110 -110 220 220');
    s.setAttribute('width', '440'); s.setAttribute('height', '440');
    desenharPizza(s, cfg);
    const pronto = window.PizzaioloCena.rasterizar(new XMLSerializer().serializeToString(s), px);
    const prazo = new Promise((_, falha) => setTimeout(() => falha(new Error('bitmap demorou')), 1500));
    return Promise.race([pronto, prazo]).then((u) => (CACHE_BITMAP[chave] = u));
  }
  // onde a íris fecha: no botão do pedido (posição de layout, mesmo se ele ainda estiver escondido) ou na pizza do montador
  function alvoDoFimForno() {
    const fab = $('#fab');
    if (!montAberto() && fab) return [fab.offsetLeft + 30, fab.offsetTop + fab.offsetHeight / 2];
    const r = $('#montPizza').getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  }
  function levarAoForno(depois) {
    if (assando) return;
    if (!anima || !window.PizzaioloCena) { depois(); return; }
    assando = true;
    const de = $('#montPizza').getBoundingClientRect();
    const px = Math.min(1024, Math.max(256, Math.round(de.width * (window.devicePixelRatio || 1))));
    pizzaEmBitmap(cfgAtual(), px).then((url) => tocarCenaForno(url, depois), () => { assando = false; depois(); });
  }
  function tocarCenaForno(url, depois) {
    const veu = $('#assar'), svg = $('#assarCena'), orig = $('#montPizza');
    const P = window.PizzaioloCena;
    if (!cenaForno) cenaForno = P.criar(svg);
    const cena = cenaForno;
    cena.pizzaImg.setAttribute('href', url);
    const focoAntes = document.activeElement;
    const de = orig.getBoundingClientRect();
    const cx = de.left + de.width / 2, cy = de.top + de.height / 2, r0 = de.width / 2 * 0.9;
    // a íris nasce do tamanho da pizza: nenhum quadro mostra a cena inteira antes da hora
    G.set(veu, { clipPath: 'circle(' + r0 + 'px at ' + cx + 'px ' + cy + 'px)' });
    G.set(['#assarMsgA', '#assarMsgB'], { opacity: 0, y: 0 });
    $('#toast').classList.remove('on');   // um aviso aberto ficaria por cima da cena
    veu.hidden = false;
    // celular: câmera fechada que acompanha a ação; computador e tablet: cena inteira
    cena.camera = window.matchMedia('(max-width: 560px)').matches;
    Object.assign(cena.S, P.poseInicial()); cena.voo = null; cena.render();
    const r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
    const kx = vb.width / r.width, ky = vb.height / r.height;
    cena.voo = { x: vb.x + (cx - r.left) * kx, y: vb.y + (cy - r.top) * ky, s: de.width * kx / 100, h: 0 };
    cena.voo.h = 30 + Math.abs(cena.voo.x - 230) * 0.12;
    const { tl } = P.linhaDoTempo(cena, { fim: 3.45 });
    const W = window.innerWidth, H = window.innerHeight;
    const r1 = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)) + 20;
    const [fx, fy] = alvoDoFimForno();
    orig.style.visibility = 'hidden';
    veu.focus({ preventScroll: true });
    const fim = () => {
      veu.hidden = true; G.set(veu, { clearProps: 'clipPath' });
      veu.onclick = null; veu.onkeydown = null;
      orig.style.visibility = '';
      assando = false;
      depois();
      // o botão "Adicionar" deu lugar ao painel "Pizza no pedido!": o foco vai para "Finalizar pedido"
      setTimeout(() => {
        if (document.querySelector('.gaveta.aberto')) return;   // edição: a gaveta cuida do foco
        const visivel = (e) => e && e.isConnected && e.getClientRects().length > 0;
        const alvo = visivel(focoAntes) && focoAntes !== document.body ? focoAntes : $('[data-mont="finalizar"]');
        if (alvo) alvo.focus({ preventScroll: true });
      }, 0);
    };
    const m = G.timeline({ onComplete: fim });
    m.to(veu, { clipPath: 'circle(' + r1 + 'px at ' + cx + 'px ' + cy + 'px)', duration: 0.6, ease: 'power2.inOut' }, 0)
      .add(tl.tweenFromTo(0, tl.duration(), { ease: 'none' }), 0)
      .fromTo('#assarMsgA', { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: 'power3.out' }, 0.35)
      .to('#assarMsgA', { y: -14, opacity: 0, duration: 0.18, ease: 'power2.in' }, 2.18)
      .fromTo('#assarMsgB', { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: 'back.out(2)' }, 2.38)
      .to(veu, { clipPath: 'circle(0px at ' + fx + 'px ' + fy + 'px)', duration: 0.5, ease: 'power2.in' }, 3.4);
    const pular = () => m.progress(1);
    veu.onclick = pular;
    veu.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); pular(); } };
  }
  function bindMontador() {
    $('#passos').addEventListener('click', (e) => { const b = e.target.closest('[data-passo]'); if (b) irPasso(+b.dataset.passo); });
    $('#montAvancar').addEventListener('click', montAvancar);
    $('#montVoltar').addEventListener('click', () => irPasso(M.passo - 1));
    $('#montFechar').addEventListener('click', () => fecharMontador());
    $('#montTeaser').addEventListener('click', (e) => { if (e.target.closest('[data-abrir-mont]')) abrirMontador(); });
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href="#montar"]');
      if (a && CELULAR.matches) { e.preventDefault(); abrirMontador(); }
    });
    CELULAR.addEventListener('change', () => { if (!CELULAR.matches) fecharMontador(); });
    const box = $('#etapa');
    box.addEventListener('click', (e) => {
      const t = e.target.closest('button');
      if (!t || t.disabled) return;
      if (t.dataset.mont === 'outra') { resetMont(); return; }
      if (t.dataset.mont === 'finalizar') { resetMont(); fecharMontador(true); abrirGaveta(0); return; }
      if (t.dataset.tam) {
        const tinhaTamanho = !!M.tamanho;
        M.tamanho = t.dataset.tam;
        const max = (D.config.maxSabores || {})[M.tamanho] || 1;
        if (max < 2) M.modo = 'inteira';
        let tirou = false;
        M.sabores = M.sabores.map((id) => { if (id && !saborDisp(sabor(id), M.tamanho)) { tirou = true; return null; } return id; });
        if (tirou) toast('Um sabor escolhido não existe em ' + nomeTam(M.tamanho).toLowerCase() + ' e foi removido.');
        atualizaPalco(tinhaTamanho ? 'tamanho' : 'all');
        reageForninho('tamanho', M.tamanho);
        irPasso(1);
      } else if (t.dataset.modo) {
        M.modo = t.dataset.modo; M.ativa = M.sabores[0] && M.modo === 'meio' ? 1 : 0;
        renderEtapa(0); atualizaPalco('all');
      } else if (t.dataset.metade) {
        M.ativa = +t.dataset.metade; renderEtapa(0);
      } else if (t.dataset.mcat) {
        M.cat = t.dataset.mcat;
        $$('[data-mcat]', box).forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.mcat === M.cat)));
        renderListaSabores();
      } else if (t.dataset.sab) {
        escolherSabor(t.dataset.sab);
      } else if (t.dataset.massa) {
        M.massa = t.dataset.massa; renderEtapa(0); atualizaPalco(null);
      } else if (t.dataset.borda) {
        M.borda = t.dataset.borda; renderEtapa(0); atualizaPalco('borda');
        reageForninho('borda', (borda(M.borda) || {}).cor || '');
      }
    });
    box.addEventListener('input', (e) => {
      if (e.target.id === 'montBusca') { M.busca = e.target.value; renderListaSabores(); }
      if (e.target.id === 'montObs') M.obs = e.target.value;
    });
  }

  /* ================= forninho: pizzaiolos pequenos do montador =================
     Só anima enquanto está visível (no celular, com o montador aberto); cumprimenta ao aparecer
     (no máximo a cada 20 s) e reage às escolhas: sabor, tamanho, borda e avanço de passo. */
  let forninho = null, ultimoOi = 0;
  function initForninho() {
    const svg = $('#forninhoCena');
    if (!svg || !window.PizzaioloCena) return;
    forninho = window.PizzaioloCena.criarForninho(svg, { animar: anima });
    if (!anima) return;
    let visivel = false;
    const atualiza = () => {
      if (visivel && !document.hidden) {
        const novo = !forninho.ativo;
        forninho.iniciar();
        if (novo && Date.now() - ultimoOi > 20000) { ultimoOi = Date.now(); forninho.reagir('oi'); }
      } else forninho.parar();
    };
    new IntersectionObserver((es) => { visivel = es[es.length - 1].isIntersecting; atualiza(); }).observe(svg);
    document.addEventListener('visibilitychange', atualiza);
  }
  const reageForninho = (tipo, valor) => { if (forninho && forninho.ativo) forninho.reagir(tipo, valor); };

  /* ================= cardápio ================= */
  let cardCat = 'todas', cardBusca = '';
  function renderCardCats() {
    $('#cardCats').innerHTML = ['todas'].concat(D.categorias.map((c) => c.id)).map((c) => '<button type="button" class="chip" data-ccat="' + c + '" aria-pressed="' + (cardCat === c) + '">' + (c === 'todas' ? 'Todas' : esc(cat(c).nome)) + '</button>').join('');
  }
  function renderCardapio() {
    const q = norm(cardBusca);
    let h = '';
    D.categorias.forEach((c) => {
      if (cardCat !== 'todas' && cardCat !== c.id) return;
      const itens = D.sabores.filter((s) => s.cat === c.id && s.ativo !== false && (!q || norm(s.nome + ' ' + s.ing).includes(q)));
      if (!itens.length) return;
      h += '<h3 class="cat-titulo">' + esc(c.nome) + '<small>' + itens.length + ' sabores</small></h3>';
      h += itens.map((s) => '<button type="button" class="item" data-item="' + esc(s.id) + '"' + (s.esgotado ? ' disabled' : '') + '><span class="thumb">' + thumbSabor(s) + '</span><span><span class="n">' + esc(s.nome) + (s.novo ? ' <span class="tag tag-novo">novo</span>' : '') + (s.esgotado ? ' <span class="tag tag-esg">esgotado hoje</span>' : '') + '</span><span class="i">' + esc(s.ing || 'Consulte os ingredientes no WhatsApp') + '</span><span class="ps num">' + (s.b != null ? '<span>Broto <b>' + brl(s.b) + '</b></span>' : '') + (s.g != null ? '<span>Grande <b>' + brl(s.g) + '</b></span>' : '') + '</span></span></button>').join('');
    });
    $('#grade').innerHTML = h || '<p class="vazio-busca">Nenhum sabor com "' + esc(cardBusca) + '". Tente outro ingrediente.</p>';
    if (window.ScrollTrigger) window.ScrollTrigger.refresh();
  }
  function bindCardapio() {
    $('#cardCats').addEventListener('click', (e) => { const b = e.target.closest('[data-ccat]'); if (!b) return; cardCat = b.dataset.ccat; renderCardCats(); renderCardapio(); });
    $('#cardBusca').addEventListener('input', (e) => { cardBusca = e.target.value; renderCardapio(); });
    $('#grade').addEventListener('click', (e) => {
      const b = e.target.closest('[data-item]');
      if (!b || b.disabled) return;
      const s = sabor(b.dataset.item);
      if (!M.tamanho || precoSabor(s, M.tamanho) == null) M.tamanho = s.g != null ? 'grande' : 'broto';
      if (M.modo === 'meio') { M.sabores[M.ativa] = s.id; if (!M.sabores[M.ativa ? 0 : 1]) M.ativa = M.ativa ? 0 : 1; }
      else M.sabores[0] = s.id;
      M.passo = 1; M.cat = 'todas'; M.busca = ''; M.pronto = false;
      renderEtapa(0); atualizaPalco('all');
      abrirMontador();
    });
  }

  /* ================= carrinho e promoções ================= */
  let CART = store.get('carrinho', []).filter((l) => (l.tipo === 'pizza' ? l.sabores.every(sabor) : adicional(l.itemId)));
  const salvaCarrinho = () => store.set('carrinho', CART);
  function addCarrinho(l, silencioso) {
    l.uid = uid();
    if (l.tipo === 'item') {
      const ex = CART.find((x) => x.tipo === 'item' && x.itemId === l.itemId);
      if (ex) ex.qtd += l.qtd; else CART.push(l);
    } else CART.push(l);
    salvaCarrinho(); renderFab();
    if (!silencioso && !anima) toast('Adicionado ao pedido.');
  }
  const qtdItem = (id) => (CART.find((x) => x.tipo === 'item' && x.itemId === id) || { qtd: 0 }).qtd;
  function setQtdItem(id, q) {
    const ex = CART.find((x) => x.tipo === 'item' && x.itemId === id);
    if (ex) { ex.qtd = q; if (q <= 0) CART = CART.filter((x) => x !== ex); }
    else if (q > 0) CART.push({ uid: uid(), tipo: 'item', itemId: id, qtd: q });
    salvaCarrinho(); renderFab();
  }
  const subtotal = () => CART.reduce((s, l) => s + precoLinha(l) * l.qtd, 0);
  const qtdTotal = () => CART.reduce((s, l) => s + l.qtd, 0);

  function unidades() {
    const u = [];
    CART.forEach((l) => { for (let k = 0; k < l.qtd; k++) u.push({ k: l.uid + ':' + k, tipo: l.tipo, tamanho: l.tamanho, sabores: l.sabores || [], itemId: l.itemId, preco: precoLinha(l), bordaPreco: l.tipo === 'pizza' ? borda(l.borda).preco || 0 : 0 }); });
    return u;
  }
  function slotAceita(sl, u) {
    if (sl.tipo === 'pizza') {
      if (u.tipo !== 'pizza') return false;
      if (sl.tamanho && u.tamanho !== sl.tamanho) return false;
      if (sl.categorias.length || sl.sabores.length) return u.sabores.every((id) => { const s = sabor(id); return s && (sl.categorias.includes(s.cat) || sl.sabores.includes(id)); });
      return true;
    }
    return u.tipo === 'item' && (!sl.itens.length || sl.itens.includes(u.itemId));
  }
  function quandoOk(q, ctx, ignoraCanal) {
    const now = new Date();
    if (q.dias && q.dias.length && !q.dias.includes(now.getDay())) return false;
    const min = now.getHours() * 60 + now.getMinutes();
    if (q.horaIni && min < hm(q.horaIni)) return false;
    if (q.horaFim && min > hm(q.horaFim)) return false;
    const hoje = now.toISOString().slice(0, 10);
    if (q.dataIni && hoje < q.dataIni) return false;
    if (q.dataFim && hoje > q.dataFim) return false;
    if (!ignoraCanal && q.canal && q.canal !== 'todos' && ctx.modo !== q.canal) return false;
    if (q.cupom && norm(ctx.cupom).toUpperCase() !== norm(q.cupom).toUpperCase()) return false;
    return true;
  }
  function casar(p, disp) {
    const usados = [];
    const livres = disp.slice().sort((a, b) => b.preco - a.preco);
    let faltam = 0, slotFalta = null;
    p.condicao.slots.forEach((sl) => {
      let pegou = 0;
      for (let i = 0; i < livres.length && pegou < sl.qtd; i++) {
        if (!usados.includes(livres[i]) && slotAceita(sl, livres[i])) { usados.push(livres[i]); pegou++; }
      }
      if (pegou < sl.qtd) { faltam += sl.qtd - pegou; slotFalta = slotFalta || sl; }
    });
    return { ok: faltam === 0, usados, faltam, slotFalta, total: p.condicao.slots.reduce((s, sl) => s + sl.qtd, 0) };
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
  function calcularPromos(ctx) {
    const units = unidades();
    const sub = units.reduce((s, u) => s + u.preco, 0);
    ctx = Object.assign({ sub, units }, ctx);
    const aplic = [];
    let livres = units.slice();
    const contagem = {};
    const elegiveis = D.promocoes.filter((p) => p.ativa && quandoOk(p.quando, ctx));
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
    // dica da próxima recompensa
    let dica = null;
    D.promocoes.filter((p) => p.ativa && !contagem[p.id] && quandoOk(p.quando, ctx, true)).forEach((p) => {
      if (!p.regras.acumula && naoAcum) return;
      if (p.condicao.tipo === 'valor') {
        const falta = (p.condicao.valorMin || 0) - sub;
        if (falta > 0 && falta <= p.condicao.valorMin * 0.6) {
          const d = { p, pct: sub / p.condicao.valorMin, texto: 'Faltam ' + brl(falta) + ' para ' + rotuloRecompensa(p) };
          if (!dica || d.pct > dica.pct) dica = d;
        }
      } else {
        const m = casar(p, livres);
        if (!m.ok && m.faltam === 1 && m.total > 1 && m.usados.length) {
          const pid = padraoDoSlot(m.slotFalta, 0);
          const d = { p, pct: m.usados.length / m.total, texto: 'Adicione ' + descSlot(m.slotFalta) + ' e feche o ' + p.nome + (p.recompensa.tipo === 'preco_fixo' ? ' por ' + brl(p.recompensa.valor) : ''), slot: m.slotFalta, pid };
          if (!dica || d.pct > dica.pct) dica = d;
        }
      }
    });
    const desconto = aplic.filter((a) => !a.brinde && a.tipo !== 'frete_gratis').reduce((s, a) => s + a.valor, 0);
    const freteGratis = aplic.some((a) => a.tipo === 'frete_gratis');
    return { aplic, dica, sub, desconto, freteGratis };
  }
  function rotuloRecompensa(p) {
    const r = p.recompensa;
    return r.tipo === 'frete_gratis' ? 'ganhar frete grátis' : r.tipo === 'brinde' ? 'ganhar ' + ((adicional(r.itemId) || {}).nome || 'um brinde') : r.tipo === 'borda_gratis' ? 'ganhar borda grátis' : r.tipo === 'desconto_pct' ? 'ganhar ' + r.valor + '% de desconto' : 'ganhar ' + brl(r.valor) + ' de desconto';
  }
  function descSlot(sl) {
    if (sl.tipo === 'item') { const ns = sl.itens.map((i) => (adicional(i) || {}).nome).filter(Boolean); return '1 ' + (ns.length ? ns.slice(0, 2).join(' ou ') : 'bebida'); }
    const alvo = sl.sabores.length ? sl.sabores.map((i) => (sabor(i) || {}).nome).join(' ou ') : sl.categorias.length ? sl.categorias.map((c) => (cat(c) || {}).nome).join(' ou ') : 'pizza';
    return '1 ' + (sl.tamanho ? nomeTam(sl.tamanho).toLowerCase() + ' ' : '') + alvo.toLowerCase();
  }
  function renderFab() {
    const q = qtdTotal();
    $('#fab').classList.toggle('visivel', q > 0);
    $('#fabQtd').textContent = q;
    const pr = calcularPromos({ modo: CK.modo, taxa: CK.taxa, cupom: CK.cupom });
    $('#fabVal').textContent = brl(pr.sub - pr.desconto);
  }

  /* ================= checkout ================= */
  const CK = Object.assign({ passo: 0, acompNao: false, bebNao: false, modo: null, nome: '', fone: '', cep: '', rua: '', bairro: '', cidade: '', numero: '', compl: '', ref: '', km: null, taxa: null, geo: null, geoPrec: null, geoSalvo: false, fora: false, viaBairro: false, bairroSel: '', calcErro: '', calculando: false, pag: null, trocoPara: '', semTroco: false, cupom: '', obsGeral: '', enviado: null, semNumero: false, endManual: false, buscandoCep: false, cepErro: '' }, store.get('cliente', {}), { passo: 0, enviado: null, calculando: false, buscandoCep: false, cepErro: '' });
  const salvaCliente = () => store.set('cliente', { nome: CK.nome, fone: CK.fone, cep: CK.cep, rua: CK.rua, bairro: CK.bairro, cidade: CK.cidade, numero: CK.numero, compl: CK.compl, ref: CK.ref, semNumero: CK.semNumero, endManual: CK.endManual });
  function passosCK() {
    const p = ['pedido'];
    if (D.adicionais.some((a) => a.tipo === 'acompanhamento' && a.ativo !== false)) p.push('acomp');
    if (D.adicionais.some((a) => a.tipo === 'bebida' && a.ativo !== false)) p.push('bebida');
    p.push('entrega', 'pagamento', 'revisao');
    return p;
  }
  const NOME_CK = { pedido: 'Pedido', acomp: 'Acompanhamentos', bebida: 'Bebidas', entrega: 'Entrega', pagamento: 'Pagamento', revisao: 'Concluir' };
  function totais() {
    const pr = calcularPromos({ modo: CK.modo, taxa: CK.taxa, cupom: CK.cupom });
    const taxa = CK.modo === 'entrega' && !pr.freteGratis ? CK.taxa || 0 : 0;
    return Object.assign(pr, { taxa, total: Math.max(0, pr.sub - pr.desconto) + taxa });
  }
  function abrirGaveta(passo) {
    if (!CART.length) { toast('Seu pedido está vazio. Monte uma pizza primeiro.'); return; }
    CK.passo = passo || 0; CK.enviado = null;
    if (!$('#gaveta').classList.contains('aberto')) abreTela('gav');
    $('#gaveta').classList.add('aberto'); $('#veu').classList.add('aberto');
    $('#gaveta').setAttribute('aria-hidden', 'false');
    document.documentElement.style.overflow = 'hidden';
    renderGaveta();
    setTimeout(() => $('#gavFechar').focus(), 50);
  }
  function fecharGaveta(trocar) {
    if ($('#gaveta').classList.contains('aberto') && !trocar) fechaTela('gav');
    $('#gaveta').classList.remove('aberto'); $('#veu').classList.remove('aberto');
    $('#gaveta').setAttribute('aria-hidden', 'true');
    document.documentElement.style.overflow = '';
    if (CK.enviado) { CK.enviado = null; }
  }
  function validaCK(p) {
    if (p === 'pedido') {
      if (!CART.length) return 'Seu pedido está vazio.';
      if (subtotal() < (D.config.pedidoMinimo || 0)) return 'Pedido mínimo de ' + brl(D.config.pedidoMinimo) + '.';
    }
    if (p === 'acomp' && !CART.some((l) => l.tipo === 'item' && (adicional(l.itemId) || {}).tipo === 'acompanhamento') && !CK.acompNao) return 'Escolha um acompanhamento ou marque "Não quero".';
    if (p === 'bebida' && !CART.some((l) => l.tipo === 'item' && (adicional(l.itemId) || {}).tipo === 'bebida') && !CK.bebNao) return 'Escolha uma bebida ou marque "Não quero".';
    if (p === 'entrega') {
      if (!CK.modo) return 'Escolha entrega ou retirada.';
      if (!CK.nome.trim()) return 'Informe seu nome.';
      if (!BALCAO && String(CK.fone).replace(/\D/g, '').length < 10) return 'Informe um telefone com DDD.';
      if (CK.modo === 'entrega') {
        if (CK.buscandoCep) return 'Aguarde a busca do CEP.';
        if (!CK.rua.trim() || !CK.bairro.trim()) return CK.endManual ? 'Preencha a rua e o bairro.' : 'Digite o CEP ou preencha o endereço à mão.';
        if (!CK.numero.trim() && !CK.semNumero) return 'Informe o número ou marque "Sem número".';
        if (CK.fora) return 'Esse endereço está fora da nossa área de entrega. Que tal retirar no balcão?';
        if (CK.taxa == null) return 'Calcule a taxa de entrega antes de continuar.';
      }
    }
    if (p === 'pagamento') {
      if (!CK.pag) return 'Escolha a forma de pagamento.';
      if (CK.pag === 'dinheiro' && !CK.semTroco) {
        const v = parseFloat(String(CK.trocoPara).replace(',', '.'));
        if (!v) return 'Informe com quanto vai pagar, ou marque que não precisa de troco.';
        if (v < totais().total) return 'O valor em mãos precisa ser maior que o total (' + brl(totais().total) + ').';
      }
    }
    if (p === 'revisao' && !podePedir()) return 'Estamos fechados agora. ' + statusAgora().texto + '.';
    return null;
  }
  function renderGaveta(dir) {
    const ps = passosCK();
    const p = ps[CK.passo];
    $('#gavPassos').innerHTML = CK.enviado ? '' : htmlStepper(ps.map((x) => NOME_CK[x]), CK.passo, 'ckir');
    $('#gavTitulo').textContent = CK.enviado ? 'Quase lá' : NOME_CK[p] === 'Pedido' ? 'Seu pedido' : NOME_CK[p];
    const corpo = $('#gavCorpo');
    const T = totais();
    let h = '';
    if (CK.enviado) h = htmlEnviado();
    else if (p === 'pedido') h = htmlPedido(T);
    else if (p === 'acomp') h = htmlAdicionais('acompanhamento', 'acompNao', 'Que tal um acompanhamento?');
    else if (p === 'bebida') h = htmlAdicionais('bebida', 'bebNao', 'E pra beber?');
    else if (p === 'entrega') h = htmlEntrega();
    else if (p === 'pagamento') h = htmlPagamento(T);
    else if (p === 'revisao') h = htmlRevisao(T);
    corpo.innerHTML = h;
    corpo.scrollTop = 0;
    const ultimo = CK.passo === ps.length - 1;
    let rod = '';
    if (CK.enviado) {
      rod = '<div class="botoes"><button class="btn btn-ghost" type="button" data-ck="novo">Já enviei · fazer novo pedido</button></div>';
    } else {
      rod = '<div class="linha-total"><span>' + (T.desconto ? '<s style="color:var(--texto-2)">' + brl(T.sub + T.taxa) + '</s> ' : '') + 'Total' + (CK.modo === 'entrega' && CK.taxa == null ? ' sem entrega' : '') + '</span><b class="num">' + brl(T.total) + '</b></div><div class="erro-msg" id="ckErro" aria-live="polite"></div><div class="botoes">' +
        (CK.passo > 0 ? '<button class="btn btn-ghost" type="button" data-ck="voltar">Voltar</button>' : '<button class="btn btn-ghost" type="button" data-ck="fechar">Comprar mais</button>') +
        (ultimo ? (BALCAO ? '<button class="btn btn-verde" type="button" data-ck="lancar">Lançar no painel</button>' : '<a class="btn btn-verde" id="btnZap" href="' + esc(linkZap(T)) + '" target="_blank" rel="noopener"' + (validaCK('revisao') ? ' aria-disabled="true"' : '') + '>Concluir no WhatsApp</a>') : '<button class="btn" type="button" data-ck="avancar">' + (CK.passo === 0 ? 'Finalizar pedido' : 'Continuar') + ' <span class="seta" aria-hidden="true">→</span></button>') + '</div>';
    }
    $('#gavRodape').innerHTML = rod;
    if (ultimo && validaCK('revisao')) $('#ckErro').textContent = validaCK('revisao');
    if (anima && dir) G.from(corpo.children, { x: dir * 24, opacity: 0, duration: 0.3, stagger: 0.03, ease: 'power2.out' });
    if (CK.enviado && anima) {
      G.to('.caixa .tampa', { rotationX: 0, duration: 0.7, delay: 0.4, ease: 'back.out(1.4)' });
      G.from('.caixa svg', { y: -60, opacity: 0, duration: 0.5, ease: 'power2.out' });
    }
  }
  function descPizza(l) {
    const sabs = l.sabores.map((id) => (sabor(id) || {}).nome);
    const partes = [sabs.length > 1 ? '½ ' + sabs[0] + ' + ½ ' + sabs[1] : sabs[0]];
    const b = borda(l.borda); if (b.cor) partes.push('borda ' + b.nome.toLowerCase());
    if (D.massas.length > 1) partes.push('massa ' + massa(l.massa).nome.toLowerCase());
    return partes.join(' · ');
  }
  function htmlPedido(T) {
    let h = CART.map((l) => {
      if (l.tipo === 'pizza') return '<div class="linha-item">' + miniSVG({ sabores: l.sabores, tamanho: l.tamanho, borda: l.borda }) + '<div><div class="n">Pizza ' + esc(nomeTam(l.tamanho)) + '</div><div class="d">' + esc(descPizza(l)) + (l.obs ? '<br>Obs.: ' + esc(l.obs) : '') + '</div><button class="link-acao" type="button" data-editar="' + l.uid + '">Editar</button></div><div class="dir"><span class="p num">' + brl(precoLinha(l) * l.qtd) + '</span><span class="qtd-ctrl"><button type="button" data-menos="' + l.uid + '" aria-label="Diminuir">−</button><span class="num">' + l.qtd + '</span><button type="button" data-mais="' + l.uid + '" aria-label="Aumentar">+</button></span></div></div>';
      const a = adicional(l.itemId);
      return '<div class="linha-item"><span style="display:grid;place-items:center;width:56px;height:56px;border-radius:50%;background:var(--massa);font-weight:800;color:var(--verde)">' + (a.tipo === 'bebida' ? '🥤' : '🍟') + '</span><div><div class="n">' + esc(a.nome) + '</div><div class="d">' + esc(a.grupo || '') + '</div></div><div class="dir"><span class="p num">' + brl(a.preco * l.qtd) + '</span><span class="qtd-ctrl"><button type="button" data-menos="' + l.uid + '" aria-label="Diminuir">−</button><span class="num">' + l.qtd + '</span><button type="button" data-mais="' + l.uid + '" aria-label="Aumentar">+</button></span></div></div>';
    }).join('');
    T.aplic.forEach((a) => { h += '<div class="promo-aplicada">🎉 ' + esc(a.nome) + (a.brinde ? ' · ' + esc((adicional(a.brinde) || {}).nome) + ' grátis' : '') + '<b class="num">' + (a.tipo === 'frete_gratis' ? 'frete grátis' : '−' + brl(a.valor)) + '</b></div>'; });
    if (T.dica) h += '<div class="barra-promo"><p>🎁 ' + esc(T.dica.texto) + '</p><div class="trilho"><div class="enche" style="width:' + Math.round(T.dica.pct * 100) + '%"></div></div>' + (T.dica.pid ? '<button class="link-acao" type="button" data-dica="1">Adicionar agora</button>' : '') + '</div>';
    if (D.promocoes.some((p) => p.ativa && p.quando.cupom)) h += '<label class="campo-rot">Tem cupom?<input class="campo" id="ckCupom" value="' + esc(CK.cupom) + '" placeholder="Digite o código" autocomplete="off"></label>';
    h += '<button class="btn btn-ghost" type="button" data-ck="outra">+ Montar outra pizza</button>';
    return h;
  }
  function htmlAdicionais(tipo, flag, titulo) {
    const itens = D.adicionais.filter((a) => a.tipo === tipo && a.ativo !== false);
    const grupos = [...new Set(itens.map((a) => a.grupo || ''))];
    let h = '<h3 style="font-size:22px">' + titulo + '</h3><p style="color:var(--texto-2);font-size:14px;margin-top:-8px">Toque no item para adicionar, ou marque "Não quero" no fim da lista.</p>';
    grupos.forEach((g) => {
      if (g) h += '<div class="grupo-titulo">' + esc(g) + '</div>';
      h += itens.filter((a) => (a.grupo || '') === g).map((a) => {
        const q = qtdItem(a.id);
        // o cartão inteiro adiciona a primeira unidade; depois a quantidade muda pelo − / +
        return '<div class="op ad-card"' + (q ? ' aria-pressed="true"' : a.esgotado ? '' : ' data-ad-card="' + a.id + '"') + (a.esgotado ? ' style="opacity:.5;cursor:default"' : '') + '><span><span class="nome">' + esc(a.nome) + (a.exemplo ? ' <span class="tag tag-ex">exemplo</span>' : '') + (a.esgotado ? ' <span class="tag tag-esg">esgotado</span>' : '') + '</span><br><span class="sub num">' + brl(a.preco) + '</span></span>' + (q ? '<span class="qtd-ctrl ad-qtd"><button type="button" data-ad-menos="' + a.id + '" aria-label="Diminuir ' + esc(a.nome) + '">−</button><span class="num">' + q + '</span><button type="button" data-ad-mais="' + a.id + '" aria-label="Mais um ' + esc(a.nome) + '">+</button></span>'
          : '<button type="button" class="ad-add" data-ad-mais="' + a.id + '" aria-label="Adicionar ' + esc(a.nome) + '"' + (a.esgotado ? ' disabled' : '') + '>+ Adicionar</button>') + '</div>';
      }).join('');
    });
    const tem = itens.some((a) => qtdItem(a.id) > 0);
    h += '<button type="button" class="op nao-quero" data-nao="' + flag + '" aria-pressed="' + (!tem && CK[flag]) + '"' + (tem ? ' disabled' : '') + '><span class="bolinha"></span><span class="nome">Não quero, obrigado</span></button>';
    return h;
  }
  function htmlEntrega() {
    let h = '<div class="opcoes duas"><button type="button" class="op" data-modo-ck="entrega" aria-pressed="' + (CK.modo === 'entrega') + '"><span class="bolinha"></span><span><span class="nome">Entrega</span><br><span class="sub">' + esc(D.config.tempoEntrega) + '</span></span></button><button type="button" class="op" data-modo-ck="retirada" aria-pressed="' + (CK.modo === 'retirada') + '"><span class="bolinha"></span><span><span class="nome">Retirada</span><br><span class="sub">' + esc(D.config.tempoRetirada) + ' · sem taxa</span></span></button></div>';
    h += '<div class="form-grid"><label class="campo-rot">Seu nome<input class="campo" id="ckNome" value="' + esc(CK.nome) + '" autocomplete="name"></label><label class="campo-rot">WhatsApp com DDD<input class="campo num" id="ckFone" value="' + esc(CK.fone) + '" inputmode="tel" autocomplete="tel" placeholder="(16) 9 0000-0000"></label></div>';
    if (CK.modo === 'retirada') h += '<div class="info-box"><b>Retire em:</b>' + esc(D.config.endereco) + '<span>Pronto em ' + esc(D.config.tempoRetirada) + '.</span></div>';
    if (!BALCAO && window.ContaPP && ContaPP.ativa && !contaAtual()) h += '<button type="button" class="entrar-dica" data-ck="entrar"><span aria-hidden="true">👋</span><span>Já pediu antes? <b>Entre</b> e use seus endereços salvos</span></button>';
    if (CK.modo === 'entrega') {
      h += htmlEnderecosSalvos();
      // 1) CEP sozinho; ao completar, o endereço é buscado. 2) Número (ou "Sem número") e complemento.
      // Sem CEP, CEP inexistente ou CEP geral da cidade: rua e bairro digitados à mão.
      h += '<div class="cep-linha"><label class="campo-rot">CEP da entrega<input class="campo num" id="ckCep" value="' + esc(CK.cep) + '" inputmode="numeric" maxlength="9" autocomplete="postal-code" placeholder="00000-000"></label>' + (CK.buscandoCep ? '<span class="cep-status" aria-live="polite">Buscando endereço…</span>' : '') + '</div>';
      if (CK.cepErro) h += '<div class="info-box alerta">' + esc(CK.cepErro) + '</div>';
      if (CK.endManual) {
        h += '<div class="form-grid"><label class="campo-rot full">Rua<input class="campo" id="ckRua" value="' + esc(CK.rua) + '" autocomplete="address-line1" placeholder="Ex.: Rua Tibiriçá"></label>' +
          '<label class="campo-rot full">Bairro<input class="campo" id="ckBairro" value="' + esc(CK.bairro) + '"></label></div>' +
          '<button class="link-acao" type="button" data-ck="porcep">Buscar pelo CEP</button>';
      } else if (CK.rua) {
        h += '<div class="end-achado"><div><b>' + esc(CK.rua) + '</b><span>' + esc([CK.bairro, CK.cidade].filter(Boolean).join(' · ')) + '</span></div><button class="link-acao" type="button" data-ck="manual">Corrigir</button></div>';
      } else if (!CK.buscandoCep) {
        h += '<button class="link-acao" type="button" data-ck="manual">Não sei o CEP · preencher o endereço à mão</button>';
      }
      if (CK.rua || CK.endManual) {
        h += '<div class="num-linha"><label class="campo-rot">Número<input class="campo num" id="ckNumero" value="' + esc(CK.numero) + '" inputmode="numeric" autocomplete="off"' + (CK.semNumero ? ' disabled placeholder="s/n"' : '') + '></label>' +
          '<label class="check-sn"><input type="checkbox" id="ckSemNum"' + (CK.semNumero ? ' checked' : '') + '> Sem número</label></div>' +
          '<div class="form-grid"><label class="campo-rot full"><span>Complemento <small>(opcional)</small></span><input class="campo" id="ckCompl" value="' + esc(CK.compl) + '" placeholder="Apto, bloco, casa dos fundos…"></label>' +
          '<label class="campo-rot full"><span>Ponto de referência <small>(opcional)</small></span><input class="campo" id="ckRef" value="' + esc(CK.ref) + '"></label></div>';
      }
      if (CK.viaBairro) {
        h += '<div class="info-box alerta">Não conseguimos medir a distância automaticamente. Escolha a região mais próxima:</div><label class="campo-rot">Região de entrega<select class="campo" id="ckBairroSel"><option value="">Escolha…</option>' + D.entrega.bairros.map((b, i) => '<option value="' + i + '"' + (String(CK.bairroSel) === String(i) ? ' selected' : '') + '>' + esc(b.nome) + ' · ' + b.km + ' km</option>').join('') + '</select></label>';
      } else if (CK.rua || CK.endManual) h += '<button class="btn btn-verde" type="button" data-ck="calcular"' + (CK.calculando ? ' disabled' : '') + '>' + (CK.calculando ? 'Calculando distância…' : CK.taxa != null ? 'Recalcular taxa' : 'Calcular taxa de entrega') + '</button>';
      if (CK.fora) h += '<div class="info-box alerta"><b>Fora da área de entrega</b>Entregamos até ' + maxKm() + ' km' + (CK.km != null ? '; seu endereço fica a ' + CK.km.toFixed(1).replace('.', ',') + ' km' : '') + '. Você pode escolher retirada.</div>';
      else if (CK.taxa != null) h += '<div class="info-box okk"><b>Entregamos aí!</b>' + (CK.km != null ? CK.km.toFixed(1).replace('.', ',') + ' km de rota · ' : '') + 'taxa ' + brl(CK.taxa) + '</div>';
      if (CK.geo && !CK.viaBairro && (CK.taxa != null || CK.fora) && window.LocalPP) h += htmlLocalMapa();
      if (CK.calcErro) h += '<div class="info-box alerta">' + esc(CK.calcErro) + '</div>';
    }
    return h;
  }
  // onde o pino caiu: pelo número (IBGE), confirmado pelo cliente, ou aproximado (pede para conferir no mapa)
  const PINO_SVG = '<svg viewBox="0 0 24 30" aria-hidden="true"><path d="M12 29S2 17.7 2 10a10 10 0 0 1 20 0c0 7.7-10 19-10 19z"/><circle cx="12" cy="10" r="3.6" fill="#fff"/></svg>';
  const geoBom = () => ['exato', 'interpolado', 'confirmado'].includes(CK.geoPrec);
  function htmlLocalMapa() {
    const bom = geoBom();
    const txt = CK.geoPrec === 'confirmado' ? 'Local confirmado por você no mapa' : bom ? (CK.geoSalvo ? 'Local do seu endereço salvo' : 'Achamos o seu número no mapa') : 'Não achamos o número exato no mapa';
    return '<div class="ck-local ' + (bom ? 'ok' : 'aprox') + '"><span class="ck-local-ico">' + PINO_SVG + '</span><span class="ck-local-txt"><b>' + txt + '</b>' +
      (bom ? '' : '<small>Confira o pino: ele ajuda o entregador a chegar e deixa a taxa certa.</small>') + '</span>' +
      '<button type="button" class="' + (bom ? 'link-acao' : 'btn btn-verde ck-local-btn') + '" data-ck="mapa">' + (bom ? 'Ver no mapa' : 'Ajustar no mapa') + '</button></div>';
  }
  async function ajustarNoMapa() {
    if (!window.LocalPP || !CK.geo) return;
    const r = await LocalPP.escolher({ inicio: CK.geo, loja: CK.lojaGeo, titulo: [CK.rua, CK.semNumero ? 's/n' : CK.numero].filter(Boolean).join(', '), sub: [CK.bairro, (CK.cidade || '').split('/')[0]].filter(Boolean).join(' · '), aproximado: !geoBom() });
    if (!r) return;
    const mudou = Math.abs(r.lat - CK.geo.lat) > 1e-5 || Math.abs(r.lng - CK.geo.lng) > 1e-5;
    CK.geo = { lat: r.lat, lng: r.lng }; CK.geoPrec = 'confirmado'; CK.geoSalvo = false;
    if (mudou) {
      CK.calculando = true; renderGaveta();
      try { const a = CK.lojaGeo || await coordLoja(); const km = await kmRota(a, CK.geo); const tx = taxaPara(km); Object.assign(CK, { km, taxa: tx, fora: tx == null, lojaGeo: a }); }
      catch (er) { /* fica a taxa de antes */ }
      CK.calculando = false;
    }
    salvaCliente(); renderGaveta();
    toast(mudou ? 'Local da entrega ajustado' + (CK.taxa != null ? ' · taxa ' + brl(CK.taxa) : '') : 'Local da entrega confirmado');
  }
  function htmlPagamento(T) {
    const ops = [['pix', 'Pix', 'Enviamos a chave no WhatsApp'], ['credito', 'Cartão de crédito', 'Maquininha na entrega ou no balcão'], ['debito', 'Cartão de débito', 'Maquininha na entrega ou no balcão'], ['dinheiro', 'Dinheiro', 'Informe o valor para separarmos o troco']];
    let h = '<div class="opcoes">' + ops.map(([id, n, s]) => '<button type="button" class="op" data-pag="' + id + '" aria-pressed="' + (CK.pag === id) + '"><span class="bolinha"></span><span><span class="nome">' + n + '</span><br><span class="sub">' + s + '</span></span></button>').join('') + '</div>';
    if (CK.pag === 'dinheiro') {
      h += '<label class="campo-rot">Vou pagar com (R$)<input class="campo num" id="ckTroco" inputmode="decimal" value="' + esc(CK.trocoPara) + '" placeholder="Ex.: 100"' + (CK.semTroco ? ' disabled' : '') + '></label>';
      const v = parseFloat(String(CK.trocoPara).replace(',', '.'));
      if (!CK.semTroco && v >= T.total) h += '<div class="info-box okk">Levaremos <b>' + brl(v - T.total) + '</b> de troco.</div>';
      h += '<label style="display:flex;gap:10px;align-items:center;font-weight:700"><input type="checkbox" id="ckSemTroco"' + (CK.semTroco ? ' checked' : '') + ' style="width:20px;height:20px"> Não preciso de troco</label>';
    }
    return h;
  }
  function htmlRevisao(T) {
    let h = BALCAO ? '<div class="info-box"><b>Lançamento da equipe</b>Confira o resumo e toque em <b>Lançar no painel</b>: o pedido entra direto na cozinha.</div>' : '<div class="aviso-final" role="note"><span class="ico" aria-hidden="true">!</span><div><b>Seu pedido ainda não foi enviado</b>Confira o resumo e toque em <b>Concluir no WhatsApp</b>. O pedido só chega à pizzaria quando você enviar a mensagem por lá.</div></div>';
    h += '<div class="info-box"><div class="resumo-linhas">' + CART.map((l) => '<div><span>' + l.qtd + 'x ' + (l.tipo === 'pizza' ? 'Pizza ' + esc(nomeTam(l.tamanho)) + ' · ' + esc(descPizza(l)) : esc(adicional(l.itemId).nome)) + '</span><span class="num">' + brl(precoLinha(l) * l.qtd) + '</span></div>').join('') + '</div></div>';
    h += '<div class="resumo-linhas"><div><span>Subtotal</span><span class="num">' + brl(T.sub) + '</span></div>' + T.aplic.map((a) => '<div class="desc"><span>' + esc(a.nome) + '</span><span class="num">' + (a.brinde ? 'brinde' : a.tipo === 'frete_gratis' ? 'frete grátis' : '−' + brl(a.valor)) + '</span></div>').join('') + (CK.modo === 'entrega' ? '<div><span>Entrega</span><span class="num">' + (T.freteGratis ? 'grátis' : brl(T.taxa)) + '</span></div>' : '') + '<div style="font-weight:800;font-size:18px"><span>Total</span><span class="num">' + brl(T.total) + '</span></div></div>';
    h += '<label class="campo-rot">Observação geral do pedido<textarea id="ckObsGeral" maxlength="300" placeholder="Ex.: interfone quebrado, chamar no portão">' + esc(CK.obsGeral) + '</textarea></label>';
    if (!BALCAO) h += '<ol class="como-concluir"><li>Toque em <b>Concluir no WhatsApp</b></li><li>A conversa abre com o pedido escrito</li><li>Toque em <b>enviar</b> lá no WhatsApp</li></ol>';
    return h;
  }
  function htmlEnviado() {
    const it = CK.enviado;
    return '<div class="enviado"><div class="caixa" aria-hidden="true"><div class="base-cx"></div>' + miniSVG({ sabores: (CART.find((l) => l.tipo === 'pizza') || { sabores: ['mussarela'] }).sabores, tamanho: 'grande', borda: 'sem' }) + '<div class="tampa"></div></div>' +
      '<h3 style="font-size:26px">Falta só enviar no WhatsApp</h3>' +
      '<div class="aviso-final" role="note"><span class="ico" aria-hidden="true">!</span><div><b>Pedido ' + esc(it.codigo) + ' ainda não concluído</b>Abrimos o WhatsApp com o pedido escrito. Toque em <b>enviar</b> lá para a pizzaria receber e confirmar.</div></div>' +
      '<a class="btn btn-verde btn-lg" href="' + esc(linkZap(totais(), it.codigo, it.token)) + '" target="_blank" rel="noopener">Abrir o WhatsApp de novo</a>' +
      (it.token ? '<a class="btn btn-ghost" href="#acompanhar/' + esc(it.token) + '">Acompanhar meu pedido</a>' : '') +
      '<p style="font-size:14px;color:var(--texto-2)">Não abriu? Copie o pedido e mande para <b>' + esc(foneFmt(D.config.whatsapp)) + '</b>.</p><button class="btn btn-ghost" type="button" data-ck="copiar">Copiar pedido</button><textarea id="msgCopia" readonly hidden style="min-height:120px;font-size:12px">' + esc(it.msg) + '</textarea>' +
      (it.token && window.ContaPP && ContaPP.ativa ? (contaAtual() ? '<p class="conta-salvo">✓ Pedido guardado na sua conta: da próxima vez, é só tocar em <b>Pedir de novo</b>.</p>' : '<button type="button" class="conta-convite" data-ck="entrar"><b>Guarde este pedido na sua conta</b><span>Da próxima vez é só tocar em "Pedir de novo". Sem senha: entre com o celular ou o Google.</span></button>') : '') +
      '<img src="' + LOGOS.v + '" alt="Pizzaria Pereira"></div>';
  }
  const maxKm = () => Math.max(...D.entrega.faixas.map((f) => f.ateKm));
  function taxaPara(km) {
    const f = D.entrega.faixas.slice().sort((a, b) => a.ateKm - b.ateKm).find((x) => km <= x.ateKm);
    return f ? f.taxa : null;
  }
  function codigoPedido() { return '#' + Date.now().toString(36).slice(-5).toUpperCase(); }
  const linkAcompanhamento = (token) => location.origin + location.pathname + '#acompanhar/' + token;
  // o pedido como o servidor guarda (o mesmo que vai escrito na mensagem do WhatsApp)
  function pedidoParaServidor(T, codigo, token, canal) {
    const troco = parseFloat(String(CK.trocoPara).replace(',', '.'));
    return {
      token, codigo, canal: canal || 'site', modo: CK.modo,
      cliente: { nome: CK.nome.trim(), fone: CK.fone.trim() },
      endereco: CK.modo === 'entrega' ? { cep: CK.cep, rua: CK.rua, numero: CK.semNumero ? 's/n' : CK.numero, compl: CK.compl, bairro: CK.bairro, cidade: CK.cidade, ref: CK.ref } : null,
      km: CK.modo === 'entrega' ? CK.km : null,
      geo: CK.modo === 'entrega' && !CK.viaBairro && CK.geo ? { lat: CK.geo.lat, lng: CK.geo.lng } : null,
      geoPrec: CK.modo === 'entrega' && !CK.viaBairro && CK.geo ? CK.geoPrec || 'aproximado' : null,
      lojaGeo: CK.lojaGeo ? { lat: CK.lojaGeo.lat, lng: CK.lojaGeo.lng } : null,
      itens: CART.map((l) => (l.tipo === 'pizza'
        ? { qtd: l.qtd, tipo: 'pizza', nome: 'Pizza ' + nomeTam(l.tamanho), detalhe: descPizza(l), obs: l.obs || '', valor: precoLinha(l) * l.qtd, sabores: l.sabores, tamanho: l.tamanho, borda: l.borda, massa: l.massa }
        : { qtd: l.qtd, tipo: 'item', nome: (adicional(l.itemId) || {}).nome || 'Item', valor: precoLinha(l) * l.qtd, itemId: l.itemId })),
      promocoes: (T.aplic || []).map((a) => ({ nome: a.nome, valor: a.valor || 0, brinde: a.brinde ? (adicional(a.brinde) || {}).nome || '' : '', tipo: a.tipo || '' })),
      subtotal: T.sub, desconto: T.desconto || 0, taxa: CK.modo === 'entrega' ? T.taxa : 0, freteGratis: !!T.freteGratis, total: T.total,
      pagamento: { forma: CK.pag, trocoPara: CK.pag === 'dinheiro' && !CK.semTroco && troco ? troco : null, semTroco: !!CK.semTroco },
      obs: CK.obsGeral.trim(), cupom: CK.cupom || ''
    };
  }
  function mensagem(T, codigo, token) {
    const L = [];
    L.push('🍕 *NOVO PEDIDO — via site pizzariapereira.com.br*');
    L.push('_Mensagem gerada pelo sistema de pedidos do site_');
    L.push('Pedido ' + (codigo || '(gerado ao enviar)') + ' · ' + (CK.modo === 'retirada' ? 'Retirada' : 'Entrega' + (CK.km != null ? ' · ' + CK.km.toFixed(1).replace('.', ',') + ' km' : '')));
    L.push('');
    L.push('*Itens*');
    CART.forEach((l) => {
      if (l.tipo === 'pizza') {
        L.push(l.qtd + 'x Pizza ' + nomeTam(l.tamanho) + ' — ' + descPizza(l) + ' — ' + brl(precoLinha(l) * l.qtd));
        if (l.obs) L.push('   Obs.: ' + l.obs);
      } else L.push(l.qtd + 'x ' + adicional(l.itemId).nome + ' — ' + brl(precoLinha(l) * l.qtd));
    });
    if (T.aplic.length) {
      L.push('');
      L.push('*Promoções*');
      T.aplic.forEach((a) => L.push(a.nome + ': ' + (a.brinde ? (adicional(a.brinde) || {}).nome + ' grátis' : a.tipo === 'frete_gratis' ? 'frete grátis' : '−' + brl(a.valor))));
    }
    L.push('');
    L.push('Subtotal: ' + brl(T.sub));
    if (T.desconto) L.push('Desconto: −' + brl(T.desconto));
    if (CK.modo === 'entrega') L.push('Entrega: ' + (T.freteGratis ? 'grátis' : brl(T.taxa)));
    L.push('*Total: ' + brl(T.total) + '*');
    L.push('');
    const pagN = { pix: 'Pix', credito: 'Cartão de crédito', debito: 'Cartão de débito', dinheiro: 'Dinheiro' }[CK.pag] || '';
    let pag = '*Pagamento:* ' + pagN;
    if (CK.pag === 'dinheiro') {
      const v = parseFloat(String(CK.trocoPara).replace(',', '.'));
      pag += CK.semTroco ? ' — sem troco' : v ? ' — troco para ' + brl(v) + ' (levar ' + brl(v - T.total) + ')' : '';
    }
    L.push(pag);
    L.push('*Cliente:* ' + CK.nome + ' · ' + CK.fone);
    if (CK.modo === 'entrega') L.push('*Endereço:* ' + [CK.rua + ', ' + (CK.semNumero ? 's/n' : CK.numero), CK.compl, CK.bairro, CK.cidade].filter(Boolean).join(' - ') + (CK.cep ? ' · CEP ' + CK.cep : '') + (CK.ref ? ' · Ref.: ' + CK.ref : ''));
    else L.push('*Retirada no balcão*');
    if (CK.obsGeral.trim()) L.push('*Obs. do pedido:* ' + CK.obsGeral.trim());
    if (token) { L.push(''); L.push('📍 Acompanhe o pedido: ' + linkAcompanhamento(token)); }
    return L.join('\n');
  }
  // Botões de ajuda: antes do WhatsApp, um aviso leve convidando a seguir pelo site.
  const fecharAjuda = () => { $('#ajudaVeu').hidden = true; };
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-ajuda]');
    if (a) {
      e.preventDefault();
      $('#ajudaIr').href = 'https://wa.me/55' + String(D.config.whatsapp).replace(/\D/g, '') + '?text=' + encodeURIComponent('Olá! Tive um problema ao fazer o pedido pelo site e preciso de ajuda.');
      $('#ajudaVeu').hidden = false;
      setTimeout(() => $('#ajudaFicar').focus(), 30);
    } else if (e.target.id === 'ajudaVeu' || e.target.id === 'ajudaFicar') fecharAjuda();
    else if (e.target.closest('#ajudaIr')) setTimeout(fecharAjuda, 50);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#ajudaVeu').hidden) { fecharAjuda(); e.stopImmediatePropagation(); }
  }, true);
  function linkZap(T, codigo, token) {
    return 'https://wa.me/55' + String(D.config.whatsapp).replace(/\D/g, '') + '?text=' + encodeURIComponent(mensagem(T, codigo, token));
  }

  /* --- distância: ViaCEP + OpenStreetMap (Nominatim) + OSRM, todos gratuitos --- */
  async function getJSON(url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 9000);
    try {
      const r = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }
  async function buscaCEP(cep) {
    const c = String(cep).replace(/\D/g, '');
    if (c.length !== 8) throw new Error('cep');
    const j = await getJSON('https://viacep.com.br/ws/' + c + '/json/');
    if (j.erro) throw new Error('cep-inexistente');
    return j;
  }
  // Nominatim (OpenStreetMap): uma busca por vez e no máximo uma por segundo, como pede a política de uso deles.
  let ultimaBuscaGeo = 0;
  async function nominatim(params) {
    const falta = 1000 - (Date.now() - ultimaBuscaGeo);
    if (falta > 0) await new Promise((r) => setTimeout(r, falta));
    ultimaBuscaGeo = Date.now();
    const j = await getJSON('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&' + params);
    return j.length ? { lat: +j[0].lat, lng: +j[0].lon } : null;
  }
  // Endereço → coordenadas, do mais preciso ao mais genérico. O mapa aberto quase nunca conhece o bairro "dos Correios"
  // que o ViaCEP devolve, e uma busca única com rua + número + bairro voltava vazia (ex.: CEP 14075-820, Av. Eduardo
  // Andrea Matarazzo, que no mapa se chama Via Norte). Então: rua com número, rua, bairro e CEP, nessa ordem, sempre
  // dentro de uma caixa de uns 40 km em volta da pizzaria (para uma rua de mesmo nome não cair em outra cidade).
  // Para na primeira que acha; erro de rede ou do serviço interrompe na hora (sem insistir).
  // 1º) a base de endereços do IBGE no servidor: acha o ponto pelo número (enderecos.js). Sem servidor, ou sem o
  // número na base, segue pelo mapa aberto (que quase nunca sabe o número: o ponto fica "aproximado").
  async function geoServidor(e) {
    if (!e.rua || !e.numero) return null;
    try {
      const j = await getJSON('/api/geo/endereco?' + new URLSearchParams({ rua: e.rua, numero: e.numero, cep: e.cep || '', cidade: e.cidade || '' }));
      return j && j.achou ? { lat: +j.lat, lng: +j.lng, precisao: j.precisao } : null;
    } catch (er) { return null; }
  }
  async function geocodificaEndereco(e, perto) {
    const doServidor = await geoServidor(e);
    if (doServidor) return doServidor;
    const q = encodeURIComponent, cidade = e.cidade || 'Ribeirão Preto';
    const caixa = perto ? '&bounded=1&viewbox=' + [perto.lng - 0.35, perto.lat + 0.35, perto.lng + 0.35, perto.lat - 0.35].map((v) => v.toFixed(4)).join(',') : '';
    const tentativas = [];
    if (e.rua) {
      if (e.numero) tentativas.push('street=' + q(e.numero + ' ' + e.rua) + '&city=' + q(cidade));
      tentativas.push('street=' + q(e.rua) + '&city=' + q(cidade));
      tentativas.push('q=' + q(e.rua + ', ' + cidade));
    }
    if (e.bairro) tentativas.push('q=' + q(e.bairro + ', ' + cidade));
    if (e.cep) tentativas.push('postalcode=' + q(e.cep));
    if (e.livre) tentativas.push('q=' + q(e.livre));
    for (const t of tentativas) {
      const r = await nominatim(t + caixa);
      if (r) return Object.assign(r, { precisao: 'aproximado' });
    }
    throw new Error('geo');
  }
  // "Rua Daniel Esteves, 238 - Jardim Orestes Lopes de Camargo, Ribeirão Preto - SP" → rua, número, bairro, cidade, UF
  function partesEndereco(txt) {
    const m = String(txt || '').match(/^\s*([^,]+?)\s*,\s*(\d+\w?)?\s*(?:-\s*([^,]+?))?\s*,\s*([^,]+?)(?:\s*[-/]\s*([A-Za-z]{2}))?\s*$/);
    return m ? { rua: m[1], numero: m[2] || '', bairro: m[3] || '', cidade: m[4], uf: m[5] || '' } : { livre: String(txt || '') };
  }
  let lojaCoord = null;
  async function coordLoja() {
    if (D.config.lojaLat && D.config.lojaLng) return { lat: +D.config.lojaLat, lng: +D.config.lojaLng };
    if (!lojaCoord) lojaCoord = await geocodificaEndereco(partesEndereco(D.config.endereco));
    return lojaCoord;
  }
  // endereco: { rua, numero, bairro, cidade, cep }. Guarda as coordenadas da última medição (mapa da gestão).
  let ultimaRota = null;
  async function kmRota(a, b) {
    try {
      const j = await getJSON('https://router.project-osrm.org/route/v1/driving/' + a.lng + ',' + a.lat + ';' + b.lng + ',' + b.lat + '?overview=false');
      if (j.routes && j.routes[0]) return j.routes[0].distance / 1000;
    } catch (e) { /* cai para linha reta */ }
    const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h)) * 1.3;
  }
  async function distanciaKm(endereco) {
    const a = await coordLoja();
    const b = await geocodificaEndereco(endereco, a);
    ultimaRota = { loja: a, destino: b };
    return kmRota(a, b);
  }
  const podeCalcular = () => CK.modo === 'entrega' && !CK.viaBairro && !CK.calculando && CK.rua.trim() && CK.bairro.trim() && (CK.numero.trim() || CK.semNumero);
  async function buscarEnderecoCep() {
    CK.buscandoCep = true; CK.cepErro = ''; renderGaveta();
    try {
      const j = await buscaCEP(CK.cep);
      CK.cidade = j.localidade + '/' + j.uf;
      if (j.logradouro) { CK.rua = j.logradouro; CK.bairro = j.bairro || ''; CK.endManual = false; }
      else { CK.rua = ''; CK.bairro = j.bairro || ''; CK.endManual = true; CK.cepErro = 'Esse CEP é geral da cidade. Preencha a rua e o bairro.'; }
    } catch (e) {
      CK.rua = ''; CK.bairro = ''; CK.endManual = true;
      CK.cepErro = e.message === 'cep-inexistente' ? 'Não encontramos esse CEP. Preencha a rua e o bairro abaixo.' : 'Não deu para buscar o CEP agora. Preencha a rua e o bairro abaixo.';
    }
    CK.buscandoCep = false; CK.taxa = null; CK.km = null; CK.fora = false; salvaCliente(); renderGaveta();
    const alvo = CK.endManual && !CK.rua ? '#ckRua' : '#ckNumero';
    if ($(alvo)) { $(alvo).focus(); $(alvo).scrollIntoView({ block: 'center', behavior: REDUZ ? 'auto' : 'smooth' }); }
  }
  async function calcularEntrega() {
    CK.calcErro = ''; CK.calculando = true; renderGaveta();
    try {
      if (CK.cep && !CK.rua) {
        const j = await buscaCEP(CK.cep);
        CK.rua = j.logradouro || CK.rua; CK.bairro = j.bairro || CK.bairro; CK.cidade = j.localidade + '/' + j.uf;
      }
      if (!CK.rua || (!CK.numero && !CK.semNumero)) throw new Error('faltam');
      const km = await distanciaKm({ rua: CK.rua, numero: CK.numero && !CK.semNumero ? CK.numero.trim() : '', bairro: CK.bairro, cidade: CK.cidade ? CK.cidade.split('/')[0] : 'Ribeirão Preto', cep: CK.cep });
      CK.km = km; const tx = taxaPara(km); CK.taxa = tx; CK.fora = tx == null; CK.viaBairro = false;
      CK.geo = ultimaRota && ultimaRota.destino; CK.geoPrec = CK.geo ? CK.geo.precisao || 'aproximado' : null; CK.geoSalvo = false; CK.lojaGeo = ultimaRota && ultimaRota.loja;
    } catch (e) {
      if (e.message === 'faltam') CK.calcErro = 'Preencha a rua e o número (ou marque "Sem número") para calcular.';
      else if (e.message === 'cep-inexistente' || e.message === 'cep') CK.calcErro = 'CEP não encontrado. Confira os números ou preencha a rua.';
      else { CK.viaBairro = true; CK.km = null; CK.taxa = null; CK.fora = false; }
    }
    CK.calculando = false; salvaCliente(); renderGaveta();
    // ponto aproximado: mostra o "Ajustar no mapa" (fica mais abaixo na gaveta)
    if (CK.geo && !geoBom()) { const b = $(".ck-local.aprox"); if (b && b.scrollIntoView) b.scrollIntoView({ block: "nearest", behavior: REDUZ ? "auto" : "smooth" }); }
  }
  async function consultaRapida(ev) {
    ev.preventDefault();
    const out = $('#cResultado');
    out.className = 'resultado'; out.textContent = 'Consultando…';
    mapaBusca();
    try {
      const j = await buscaCEP($('#cCep').value);
      const num = $('#cNum').value.trim();
      if (!j.logradouro && !j.bairro) {
        mapaLimpa();
        out.className = 'resultado erro';
        out.textContent = 'Esse CEP é geral de ' + j.localidade + '. No pedido, informe a rua para calcular a taxa.';
        return;
      }
      const km = await distanciaKm({ rua: j.logradouro, numero: num, bairro: j.bairro, cidade: j.localidade, cep: j.cep });
      const tx = taxaPara(km);
      CK.geo = ultimaRota && ultimaRota.destino; CK.geoPrec = CK.geo ? CK.geo.precisao || 'aproximado' : null; CK.geoSalvo = false; CK.lojaGeo = ultimaRota && ultimaRota.loja;
      out.className = 'resultado ' + (tx == null ? 'erro' : 'ok');
      out.textContent = (j.logradouro || j.bairro || j.localidade) + ': ' + km.toFixed(1).replace('.', ',') + ' km · ' + (tx == null ? 'fora da área de entrega (retirada disponível)' : 'taxa ' + brl(tx));
      mapaReage(km, tx, $('#cCep').value);
      CK.cep = $('#cCep').value; CK.rua = j.logradouro || ''; CK.bairro = j.bairro || ''; CK.cidade = j.localidade + '/' + j.uf; CK.numero = num || CK.numero; CK.endManual = !j.logradouro; salvaCliente();
    } catch (e) {
      mapaLimpa();
      out.className = 'resultado erro';
      out.textContent = (e.message === 'cep' || e.message === 'cep-inexistente') ? 'CEP não encontrado. Confira os 8 números.' : 'Não deu para calcular agora. No pedido você escolhe a região e vê a taxa.';
    }
  }
  /* ---------- conta do cliente (conta.js): endereços salvos, dados no checkout e "pedir de novo" ---------- */
  const contaAtual = () => (window.ContaPP && !BALCAO ? ContaPP.conta : null);
  const mesmoEndereco = (e) => norm(e.rua) === norm(CK.rua) && norm(e.numero === 's/n' ? '' : e.numero) === norm(CK.semNumero ? '' : CK.numero) && norm(e.compl) === norm(CK.compl);
  function htmlEnderecosSalvos() {
    const c = contaAtual();
    if (!c || !(c.enderecos || []).length) return '';
    return '<div class="end-salvos"><span class="grupo-titulo">Seus endereços</span><div class="end-salvos-lista">' + c.enderecos.map((e, i) => '<button type="button" class="end-salvo" data-end-salvo="' + i + '" aria-pressed="' + mesmoEndereco(e) + '"><i aria-hidden="true">' + (e.apelido === 'Trabalho' ? '💼' : e.apelido === 'Casa' ? '🏠' : '📍') + '</i><span><b>' + esc(e.apelido || [e.rua, e.numero].filter(Boolean).join(', ')) + '</b><small>' + esc(e.apelido ? [e.rua, e.numero].filter(Boolean).join(', ') + ' · ' + e.bairro : [e.compl, e.bairro].filter(Boolean).join(' · ')) + '</small></span></button>').join('') + '</div></div>';
  }
  // endereço salvo já tem coordenadas: só refaz a rota até a pizzaria (a taxa vale a tabela de hoje)
  async function usarEnderecoSalvo(e) {
    Object.assign(CK, { cep: e.cep || '', rua: e.rua || '', numero: e.numero && e.numero !== 's/n' ? e.numero : '', semNumero: e.numero === 's/n', compl: e.compl || '', bairro: e.bairro || '', cidade: e.cidade || '', ref: e.ref || '', endManual: !e.cep, cepErro: '', calcErro: '', viaBairro: false, taxa: null, km: null, fora: false, geo: null, geoPrec: null, geoSalvo: false });
    salvaCliente();
    if (!e.geo || !e.geoPrec) { if (podeCalcular()) calcularEntrega(); else renderGaveta(); return; }
    CK.calculando = true; renderGaveta();
    try {
      const a = await coordLoja();
      const km = await kmRota(a, e.geo);
      const tx = taxaPara(km);
      Object.assign(CK, { km, taxa: tx, fora: tx == null, geo: { lat: e.geo.lat, lng: e.geo.lng }, geoPrec: e.geoPrec, geoSalvo: true, lojaGeo: a });
    } catch (er) { CK.calculando = false; calcularEntrega(); return; }
    CK.calculando = false; salvaCliente(); renderGaveta();
  }
  function contaEntrou(c, silencioso) {
    if (!c || BALCAO) return;
    if (!CK.nome.trim() && c.nome) CK.nome = c.nome;
    if (String(CK.fone).replace(/\D/g, '').length < 10 && c.fone) CK.fone = c.fone;
    salvaCliente();
    if ($('#gaveta').classList.contains('aberto') && !CK.enviado) renderGaveta();
    else if (CK.enviado && !silencioso) renderGaveta();
  }
  // refaz o carrinho com os itens de um pedido anterior (preços e disponibilidade de hoje)
  function pedirDeNovo(ped) {
    const faltou = [];
    let n = 0;
    (ped.itens || []).forEach((i) => {
      if (i.tipo === 'pizza') {
        const tam = D.config.tamanhos.some((t) => t.id === i.tamanho) ? i.tamanho : null;
        const max = tam ? (D.config.maxSabores || {})[tam] || 1 : 1;
        const sabs = (i.sabores || []).filter(Boolean).slice(0, max);
        if (!tam || !sabs.length || !sabs.every((id) => saborDisp(sabor(id), tam))) { faltou.push(i.detalhe ? i.detalhe.split(' · ')[0] : i.nome); return; }
        addCarrinho({ tipo: 'pizza', tamanho: tam, sabores: sabs, borda: D.bordas.some((b) => b.id === i.borda) ? i.borda : D.bordas[0].id, massa: D.massas.some((m) => m.id === i.massa) ? i.massa : D.massas[0].id, obs: i.obs || '', qtd: i.qtd || 1 }, true);
        n += i.qtd || 1;
      } else {
        const a = (i.itemId && adicional(i.itemId)) || D.adicionais.find((x) => norm(x.nome) === norm(i.nome));
        if (!a || a.ativo === false || a.esgotado) { faltou.push(i.nome); return; }
        addCarrinho({ tipo: 'item', itemId: a.id, qtd: i.qtd || 1 }, true);
        n += i.qtd || 1;
      }
    });
    if (n) {
      CK.modo = ped.modo === 'retirada' ? 'retirada' : 'entrega';
      if (['pix', 'credito', 'debito', 'dinheiro'].includes(ped.pagamento && ped.pagamento.forma)) CK.pag = ped.pagamento.forma;
      if (CK.pag === 'dinheiro') { CK.trocoPara = ''; CK.semTroco = false; }
      CK.acompNao = true; CK.bebNao = true; // quem repete já escolheu os extras
      if (CK.modo === 'entrega' && ped.endereco && ped.endereco.rua) {
        const e = Object.assign({}, ped.endereco, { geo: ped.geo, geoPrec: ped.geoPrec });
        if (!mesmoEndereco(e) || CK.taxa == null) usarEnderecoSalvo(e);
      }
      salvaCliente();
    }
    return { n, faltou, codigo: ped.codigo };
  }
  function abrirPedidoRepetido(r) {
    abrirGaveta(0);
    toast(r.faltou.length ? 'Pedido ' + r.codigo + ' no carrinho. Fora do cardápio hoje: ' + r.faltou.join(', ') + '.' : 'Pedido ' + r.codigo + ' de volta no carrinho. Confira e finalize!');
  }

  /* modo balcão: pedido que chegou por telefone ou direto na conversa do WhatsApp, montado pela equipe no cardápio */
  let BALCAO = null;
  function iniciaBalcao() {
    BALCAO = { em: Date.now() };
    // a gestão pode mandar o cliente já escolhido (perfil do cliente → "Novo pedido")
    let pre = null;
    try { pre = JSON.parse(sessionStorage.getItem('pp-balcao-cliente') || 'null'); sessionStorage.removeItem('pp-balcao-cliente'); } catch (e) { pre = null; }
    Object.assign(CK, { nome: '', fone: '', cep: '', rua: '', bairro: '', cidade: '', numero: '', compl: '', ref: '', km: null, taxa: null, geo: null, geoPrec: null, geoSalvo: false, fora: false, viaBairro: false, bairroSel: '', calcErro: '', semNumero: false, endManual: false, modo: null, pag: null, trocoPara: '', semTroco: false, obsGeral: '', cupom: '', passo: 0, enviado: null, acompNao: false, bebNao: false });
    $('#balcaoFaixa').hidden = false;
    document.documentElement.classList.add('balcao');
    $('#portal').hidden = true;
    document.documentElement.style.overflow = '';
    if (pre) {
      const e = pre.endereco || {};
      Object.assign(CK, { nome: pre.nome || '', fone: pre.fone || '', cep: e.cep || '', rua: e.rua || '', numero: e.numero && e.numero !== 's/n' ? e.numero : '', semNumero: e.numero === 's/n', bairro: e.bairro || '', cidade: e.cidade || '', compl: e.compl || '', ref: e.ref || '', endManual: !!(e.rua && !e.cep) });
    }
    if (CART.length) abrirGaveta(0); else abrirMontador();
    toast(pre ? 'Pedido para ' + (pre.nome || 'o cliente') + ': monte e toque em "Lançar no painel".' : 'Monte o pedido do cliente. No fim, toque em "Lançar no painel".');
  }
  function saiBalcao(voltarAoPainel) {
    BALCAO = null;
    $('#balcaoFaixa').hidden = true;
    document.documentElement.classList.remove('balcao');
    if ($('#gaveta').classList.contains('aberto')) renderGaveta();
    if (voltarAoPainel) location.href = '/gestao#/aovivo';
  }
  async function lancaBalcao(botao) {
    const err = validaCK('revisao') || validaCK('pagamento') || validaCK('entrega');
    if (err) { $('#ckErro').textContent = err; return; }
    botao.disabled = true;
    try {
      const p = await PedidosPP.lancar(pedidoParaServidor(totais(), codigoPedido(), PedidosPP.token(), $('#balcaoCanal').value));
      CART = []; salvaCarrinho(); renderFab();
      Object.assign(CK, { acompNao: false, bebNao: false, obsGeral: '', pag: null, trocoPara: '', semTroco: false, cupom: '', passo: 0 });
      fecharGaveta();
      toast('Pedido ' + p.codigo + ' lançado. Voltando para a gestão…');
      setTimeout(() => saiBalcao(true), 700);
    } catch (e) {
      botao.disabled = false;
      $('#ckErro').textContent = e.status === 401 ? 'Sua sessão expirou: entre de novo na gestão.' : 'Não deu para lançar: ' + e.message;
    }
  }
  function bindGaveta() {
    $('#fab').addEventListener('click', () => abrirGaveta(0));
    $('#veu').addEventListener('click', fecharGaveta);
    $('#gavFechar').addEventListener('click', fecharGaveta);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#gaveta').classList.contains('aberto')) fecharGaveta(); });
    const g = $('#gaveta');
    g.addEventListener('click', (e) => {
      const t = e.target.closest('button, a');
      if (!t) {
        const card = e.target.closest('[data-ad-card]');
        if (card) { setQtdItem(card.dataset.adCard, 1); renderGaveta(); }
        return;
      }
      const ps = passosCK();
      const d = t.dataset;
      if (t.id === 'btnZap') {
        const err = validaCK('revisao') || validaCK('pagamento') || validaCK('entrega');
        if (err) { e.preventDefault(); $('#ckErro').textContent = err; return; }
        const T = totais();
        const codigo = codigoPedido();
        // com o servidor de pedidos, o mesmo pedido entra no painel da equipe e a mensagem leva o link de acompanhamento
        const token = window.PedidosPP && PedidosPP.servidor ? PedidosPP.token() : null;
        t.href = linkZap(T, codigo, token);
        CK.enviado = { codigo, token, msg: mensagem(T, codigo, token) };
        if (token) { PedidosPP.registrar(pedidoParaServidor(T, codigo, token)); if (window.ContaPP) setTimeout(() => ContaPP.pedidoFeito(), 1200); }
        setTimeout(() => { renderGaveta(); }, 60);
        return;
      }
      if (d.ck === 'lancar') { lancaBalcao(t); return; }
      if (d.endSalvo !== undefined) { const c = contaAtual(); const e2 = c && c.enderecos[+d.endSalvo]; if (e2) usarEnderecoSalvo(e2); return; }
      if (d.ck === 'entrar') { if (window.ContaPP) ContaPP.entrar(); return; }
      if (d.ckir !== undefined) { if (+d.ckir < CK.passo) { CK.passo = +d.ckir; renderGaveta(-1); } return; }
      if (d.ck === 'fechar') fecharGaveta();
      else if (d.ck === 'voltar') { CK.passo--; renderGaveta(-1); }
      else if (d.ck === 'avancar') {
        const err = validaCK(ps[CK.passo]);
        if (err) { $('#ckErro').textContent = err; if (anima) G.fromTo('#ckErro', { x: -6 }, { x: 0, duration: 0.4, ease: 'elastic.out(1,.3)' }); return; }
        CK.passo++; renderGaveta(1);
      } else if (d.ck === 'outra') { fecharGaveta(CELULAR.matches); abrirMontador(); }
      else if (d.ck === 'calcular') calcularEntrega();
      else if (d.ck === 'mapa') ajustarNoMapa();
      else if (d.ck === 'manual') { CK.endManual = true; CK.cepErro = ''; renderGaveta(); $('#ckRua') && $('#ckRua').focus(); }
      else if (d.ck === 'porcep') { CK.endManual = false; CK.rua = ''; CK.bairro = ''; CK.cepErro = ''; CK.taxa = null; CK.km = null; CK.fora = false; salvaCliente(); renderGaveta(); $('#ckCep') && $('#ckCep').focus(); }
      else if (d.ck === 'copiar') {
        const ta = $('#msgCopia');
        const ok = () => toast('Mensagem copiada.');
        const manual = () => { ta.hidden = false; ta.select(); toast('Selecione o texto e copie.'); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(ok, manual);
        else manual();
      } else if (d.ck === 'novo') {
        CART = []; salvaCarrinho(); renderFab(); CK.enviado = null; CK.acompNao = false; CK.bebNao = false; CK.obsGeral = ''; CK.pag = null; CK.trocoPara = ''; fecharGaveta(CELULAR.matches);
        abrirMontador();
      } else if (d.editar) editarLinha(d.editar);
      else if (d.mais || d.menos) {
        const l = CART.find((x) => x.uid === (d.mais || d.menos));
        if (l) { l.qtd += d.mais ? 1 : -1; if (l.qtd <= 0) CART = CART.filter((x) => x !== l); }
        salvaCarrinho(); renderFab();
        if (!CART.length) { fecharGaveta(); toast('Pedido vazio.'); return; }
        renderGaveta();
      } else if (d.adMais || d.adMenos) {
        const id = d.adMais || d.adMenos;
        setQtdItem(id, qtdItem(id) + (d.adMais ? 1 : -1));
        renderGaveta();
      } else if (d.nao) { CK[d.nao] = !CK[d.nao]; renderGaveta(); }
      else if (d.dica) {
        const T = totais();
        if (T.dica && T.dica.pid) {
          const sl = T.dica.slot;
          if (sl.tipo === 'pizza') addCarrinho({ tipo: 'pizza', tamanho: sl.tamanho || 'grande', sabores: [T.dica.pid], borda: 'sem', massa: D.massas[0].id, obs: '', qtd: 1 }, true);
          else addCarrinho({ tipo: 'item', itemId: T.dica.pid, qtd: 1 }, true);
          renderGaveta();
        }
      } else if (d.modoCk) { CK.modo = d.modoCk; renderGaveta(); }
      else if (d.pag) { CK.pag = d.pag; renderGaveta(); }
    });
    const campos = { ckNome: 'nome', ckFone: 'fone', ckCep: 'cep', ckNumero: 'numero', ckRua: 'rua', ckBairro: 'bairro', ckCompl: 'compl', ckRef: 'ref', ckTroco: 'trocoPara', ckObsGeral: 'obsGeral', ckCupom: 'cupom' };
    g.addEventListener('input', (e) => {
      const k = campos[e.target.id];
      if (!k) return;
      let v = e.target.value;
      if (k === 'cep') { v = v.replace(/\D/g, '').slice(0, 8); if (v.length > 5) v = v.slice(0, 5) + '-' + v.slice(5); e.target.value = v; }
      CK[k] = v;
      if (['cep', 'numero', 'rua', 'bairro'].includes(k) && !CK.viaBairro) { CK.taxa = null; CK.km = null; CK.fora = false; CK.geo = null; CK.geoPrec = null; CK.geoSalvo = false; }
      if (k === 'cep') { CK.cepErro = ''; if (v.length === 9 && CK.modo === 'entrega') buscarEnderecoCep(); }
      salvaCliente();
      if (k === 'cupom') renderFab();
    });
    g.addEventListener('change', (e) => {
      if (e.target.id === 'ckBairroSel') {
        const b = D.entrega.bairros[+e.target.value];
        CK.bairroSel = e.target.value;
        if (b) { CK.km = b.km; const tx = taxaPara(b.km); CK.taxa = tx; CK.fora = tx == null; if (!CK.bairro) CK.bairro = b.nome; } else { CK.taxa = null; CK.km = null; }
        renderGaveta();
      } else if (e.target.id === 'ckSemTroco') { CK.semTroco = e.target.checked; renderGaveta(); }
      else if (e.target.id === 'ckTroco' || e.target.id === 'ckCupom') renderGaveta();
      else if (e.target.id === 'ckSemNum') {
        CK.semNumero = e.target.checked; if (CK.semNumero) CK.numero = '';
        CK.taxa = null; CK.km = null; CK.fora = false; salvaCliente();
        if (podeCalcular()) calcularEntrega(); else renderGaveta();
      } else if (e.target.id === 'ckNumero' && podeCalcular()) calcularEntrega();
    });
  }

  /* ================= entrega (mapa) e FAQ ================= */
  const CORES_FAIXA = ['#0F4D23', '#C8952E', '#C1121F', '#6B5E4E', '#2E7D4F'];
  function renderEntregaSec() {
    const fx = D.entrega.faixas.slice().sort((a, b) => a.ateKm - b.ateKm);
    let ant = 0;
    $('#faixasLista').innerHTML = fx.map((f, i) => { const t = '<div class="faixa-linha"><i style="background:' + CORES_FAIXA[i % 5] + '"></i><span>' + (ant ? 'de ' + ant + ' a ' : 'até ') + f.ateKm + ' km</span><b class="num">' + brl(f.taxa) + '</b></div>'; ant = f.ateKm; return t; }).join('') + '<div class="faixa-linha"><i style="background:#cbbfa8"></i><span>acima de ' + maxKm() + ' km</span><b style="color:var(--texto-2);font-size:15px">não entregamos</b></div>';
    const svg = $('#mapaSvg');
    svg.innerHTML = '';
    const mx = maxKm();
    const rng = rngDe('ruas');
    const ruas = sv('g', { opacity: 0.5 }, svg);
    sv('circle', { r: 124, fill: '#F3E6CC' }, ruas);
    for (let i = 0; i < 26; i++) {
      const a = rng() * Math.PI, d = (rng() - 0.5) * 220;
      const x = Math.cos(a), y = Math.sin(a);
      const L = Math.sqrt(Math.max(0, 124 * 124 - d * d));
      sv('line', { x1: (-y * d - x * L).toFixed(1), y1: (x * d - y * L).toFixed(1), x2: (-y * d + x * L).toFixed(1), y2: (x * d + y * L).toFixed(1), stroke: '#E1CDA6', 'stroke-width': i % 5 === 0 ? 3 : 1.2 }, ruas);
    }
    // escala pela raiz da distância: com faixas de 3, 10 e 20 km, o anel de 3 km ficava do tamanho do pino
    const raio = (km) => 112 * Math.sqrt(Math.min(1, Math.max(0, km) / mx));
    const aneis = [];
    fx.slice().reverse().forEach((f, j) => {
      const i = fx.length - 1 - j;
      const r = Math.max(22, raio(f.ateKm));
      const g = sv('g', { class: 'anel' }, svg);
      const fo = 0.07 + 0.04 * (fx.length - i);
      const c = sv('circle', { r, fill: CORES_FAIXA[i % 5], 'fill-opacity': fo, stroke: CORES_FAIXA[i % 5], 'stroke-width': 2, 'stroke-dasharray': '5 5' }, g);
      aneis[i] = { g, c, r, f, fo, cor: CORES_FAIXA[i % 5] };
    });
    // rótulos numa camada própria, acima dos anéis: o do maior no alto, por dentro; os menores em diagonal à
    // direita, logo fora da borda (antes ficavam no alto de cada anel e os de dentro cobriam o pino da pizzaria)
    const rotulos = sv('g', { class: 'rotulos-aneis' }, svg);
    const pilulas = aneis.map(({ f, cor }) => {
      const g = sv('g', {}, rotulos);
      const fundo = sv('rect', { height: 14, rx: 7, fill: '#FFFDF7', 'fill-opacity': 0.94, stroke: cor, 'stroke-opacity': 0.35 }, g);
      const t = sv('text', { 'font-size': 8, 'font-weight': 800, fill: cor, 'font-family': 'Plus Jakarta Sans, sans-serif', 'dominant-baseline': 'central' }, g);
      t.textContent = f.ateKm + ' km · ' + brl(f.taxa);
      return { fundo, t };
    });
    const camada = sv('g', { class: 'mapa-rota' }, svg); // rota e motoboy da consulta de CEP, abaixo do pino
    const pin = sv('g', { class: 'pin' }, svg);
    sv('circle', { r: 9, fill: '#C1121F', stroke: '#fff', 'stroke-width': 3 }, pin);
    sv('circle', { r: 3, fill: '#fff' }, pin);
    const lb = sv('text', { y: 24, 'text-anchor': 'middle', 'font-size': 9, 'font-weight': 800, fill: '#0F4D23', 'font-family': 'Plus Jakarta Sans, sans-serif' }, pin);
    lb.textContent = 'Pizzaria Pereira';
    // área ocupada (pino, nome e rótulos): a etiqueta do endereço consultado procura um lugar livre
    const ocupado = [];
    const larg = (t, porLetra) => (t.getComputedTextLength ? t.getComputedTextLength() : 0) || t.textContent.length * porLetra;
    const posicionaRotulos = () => {
      const wl = larg(lb, 4.9);
      ocupado.length = 0;
      ocupado.push({ x: -12, y: -12, w: 24, h: 24 }, { x: -wl / 2 - 3, y: 15, w: wl + 6, h: 13 });
      let yAnt = Infinity;
      pilulas.forEach(({ fundo, t }, i) => {
        const r = aneis[i].r, w = larg(t, 4.4) + 12;
        let x, y;
        if (i === aneis.length - 1) { x = -w / 2; y = -r + 11; }
        else {
          y = Math.min(Math.sin(-38 * Math.PI / 180) * r - 3, yAnt - 16); yAnt = y;
          const dy = y + 3;
          x = Math.min((Math.abs(dy) < r ? Math.sqrt(r * r - dy * dy) : 0) + 2, 124 - w);
        }
        fundo.setAttribute('x', f1(x)); fundo.setAttribute('y', f1(y - 7)); fundo.setAttribute('width', f1(w));
        t.setAttribute('x', f1(x + 6)); t.setAttribute('y', f1(y));
        ocupado.push({ x, y: y - 7, w, h: 14 });
      });
    };
    posicionaRotulos();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(posicionaRotulos); // a largura muda quando a fonte do site carrega
    MAPA = { svg, aneis, raio, ocupado, camada, tl: null, io: null, entrada: null };
    if (anima && window.ScrollTrigger) {
      // dispara pelo próprio mapa: no celular ele fica abaixo do formulário e a entrada tocava fora da tela
      const st = () => ({ trigger: svg, start: 'top 80%', once: true });
      MAPA.entrada = [
        G.from($$('.anel', svg), { scale: 0, opacity: 0, transformOrigin: '50% 50%', duration: 0.9, stagger: -0.15, ease: 'back.out(1.4)', scrollTrigger: st() }),
        G.from(rotulos.children, { opacity: 0, y: 6, duration: 0.4, stagger: 0.1, delay: 0.75, ease: 'power2.out', scrollTrigger: st() }),
        G.from(pin, { y: -40, opacity: 0, duration: 0.6, ease: 'bounce.out', delay: 0.6, scrollTrigger: st() })
      ];
    }
  }
  /* O mapa responde à consulta de CEP. Enquanto consulta, uma onda sai da pizzaria; com o resultado, os outros anéis
     esmaecem, um motoboy sai da pizzaria deixando o rastro, o destino cai na distância calculada e o anel da faixa
     acende (direção estável por CEP, sempre do lado esquerdo, longe dos rótulos). Fora da área, o motoboy para na
     borda do último anel e o destino aparece além dela. */
  let MAPA = null;
  function mapaLimpa() {
    if (!MAPA) return;
    if (MAPA.tl) { MAPA.tl.kill(); MAPA.tl = null; }
    if (MAPA.io) { MAPA.io.disconnect(); MAPA.io = null; }
    MAPA.camada.innerHTML = '';
    MAPA.aneis.forEach((a) => {
      a.c.setAttribute('stroke-width', 2); a.c.setAttribute('fill-opacity', a.fo);
      if (anima) G.set(a.g, { x: 0, opacity: 1 }); else a.g.style.opacity = '';
    });
  }
  function mapaBusca() {
    mapaLimpa();
    if (!MAPA || !anima) return;
    const ondas = [0, 1].map(() => sv('circle', { r: 6, fill: 'none', stroke: '#0F4D23', 'stroke-width': 2.5, opacity: 0 }, MAPA.camada));
    MAPA.tl = G.fromTo(ondas, { attr: { r: 6 }, opacity: 0.6 }, { attr: { r: 112 }, opacity: 0, duration: 1.3, ease: 'power1.out', stagger: { each: 0.65, repeat: -1 } });
  }
  // com um resultado na mão, a entrada do mapa (se ainda não tocou, no celular) vai direto ao fim: a moto é a entrada
  function mapaEntradaFeita() {
    if (!MAPA || !MAPA.entrada) return;
    MAPA.entrada.forEach((t) => { if (t.scrollTrigger) t.scrollTrigger.kill(false, true); t.progress(1); });
    MAPA.entrada = null;
  }
  function mapaReage(km, taxa, chave) {
    if (!MAPA) return;
    mapaLimpa();
    mapaEntradaFeita();
    const { svg, aneis, raio, ocupado, camada } = MAPA;
    const i = taxa != null ? aneis.findIndex((a) => km <= a.f.ateKm) : -1;
    const dentro = i >= 0;
    const cor = dentro ? aneis[i].cor : '#4A3F35';
    let h = 7; for (const ch of String(chave || km)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const ang = (dentro ? 172 + (h % 41) : 165 + (h % 31)) * Math.PI / 180; // abaixo-esquerda o pino batia no nome da pizzaria
    const rr = dentro ? Math.max(Math.min(26, aneis[i].r * 0.8), raio(km)) : aneis[aneis.length - 1].r + 10;
    const x = Math.cos(ang) * rr, y = Math.sin(ang) * rr;
    // rota: curva suave da pizzaria até o destino, amostrada para o rastro crescer junto com a moto
    const rota = sv('path', { d: 'M0,0 Q' + f1(x / 2 - y * 0.2) + ',' + f1(y / 2 + x * 0.2) + ' ' + f1(x) + ',' + f1(y), fill: 'none', stroke: cor, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-dasharray': '1 4', opacity: 0.85 }, camada);
    const L = rota.getTotalLength(), N = 48, pts = [];
    for (let k = 0; k <= N; k++) { const q = rota.getPointAtLength(L * k / N); pts.push([q.x, q.y]); }
    // até onde a moto vai: perto do destino, sem cobri-lo; fora da área, só até a borda do último anel
    let kFim = N - Math.ceil(12 / (L / N));
    if (!dentro) { const lim = aneis[aneis.length - 1].r - 6; kFim = pts.findIndex(([px, py]) => Math.hypot(px, py) >= lim); if (kFim < 0) kFim = N; }
    kFim = Math.max(1, kFim);
    const onda = sv('circle', { cx: f1(x), cy: f1(y), r: 2, fill: 'none', stroke: cor, 'stroke-width': 2, opacity: 0 }, camada);
    const destino = sv('g', { transform: 'translate(' + f1(x) + ' ' + f1(y) + ')' }, camada);
    const sombra = sv('ellipse', { cy: 1, rx: 6, ry: 2, fill: '#2B1A0E', opacity: 0.2 }, destino);
    const pino = sv('g', {}, destino);
    sv('path', { d: 'M0,0 C-5.5,-7 -8,-10.5 -8,-14 A8,8 0 1 1 8,-14 C8,-10.5 5.5,-7 0,0 Z', fill: cor, stroke: '#fff', 'stroke-width': 2 }, pino);
    sv('circle', { cy: -14, r: 3.2, fill: '#fff' }, pino);
    const txt = km.toFixed(1).replace('.', ',') + ' km · ' + (dentro ? brl(taxa) : 'fora da área');
    const etq = sv('g', {}, camada);
    const ef = sv('rect', { height: 15, rx: 7.5, fill: cor }, etq);
    const et = sv('text', { 'font-size': 8.5, 'font-weight': 800, fill: '#fff', 'font-family': 'Plus Jakarta Sans, sans-serif', 'dominant-baseline': 'central' }, etq);
    et.textContent = txt;
    const w = ((et.getComputedTextLength ? et.getComputedTextLength() : 0) || txt.length * 4.6) + 14;
    // etiqueta: oito posições ao redor do destino; fica a primeira livre (ou a que menos cobre), contando o pino e o
    // nome da pizzaria, os rótulos dos anéis, o próprio pino do destino e o lugar onde a moto para
    const [motoX, motoY] = pts[kFim];
    const obst = ocupado.concat([{ x: x - 10, y: y - 24, w: 20, h: 27 }, { x: motoX - 11, y: motoY - 13, w: 22, h: 23 }]);
    const lim = (v, a, b) => Math.max(a, Math.min(b, v));
    const cobre = (ex, ey) => obst.reduce((t, o) => t + Math.max(0, Math.min(ex + w, o.x + o.w) - Math.max(ex, o.x)) * Math.max(0, Math.min(ey + 15, o.y + o.h) - Math.max(ey, o.y)), 0);
    const opcoes = [[x - w / 2, y - 40], [x - w + 14, y - 40], [x - 14, y - 40], [x - 13 - w, y - 22], [x + 13, y - 22], [x - w / 2, y + 7], [x - w + 14, y + 7], [x - 14, y + 7]]
      .map(([a, b]) => [lim(a, -127, 127 - w), lim(b, -128, 112)]);
    let [ex, ey] = opcoes[0], menor = Infinity;
    for (const [a, b] of opcoes) { const v = cobre(a, b); if (v < menor - 0.01) { menor = v; ex = a; ey = b; } if (!v) break; }
    ef.setAttribute('x', f1(ex)); ef.setAttribute('y', f1(ey)); ef.setAttribute('width', f1(w));
    et.setAttribute('x', f1(ex + 7)); et.setAttribute('y', f1(ey + 7.5));
    // motoboy de lado: rodas, scooter vermelha, baú com uma fatia, piloto de verde e capacete vermelho
    const moto = sv('g', {}, camada);
    moto.innerHTML = '<g class="corpo-moto"><ellipse cy="7.6" rx="9" ry="1.6" fill="#2B1A0E" opacity=".18"/>' +
      '<circle cx="-5.5" cy="5" r="2.8" fill="#2A201B"/><circle cx="-5.5" cy="5" r="1.1" fill="#B9B1A6"/>' +
      '<circle cx="6" cy="5" r="2.8" fill="#2A201B"/><circle cx="6" cy="5" r="1.1" fill="#B9B1A6"/>' +
      '<path d="M-7.5,4 C-7.5,1 -4.5,0 -1.5,0 L4,0 L6.8,-3.4 L8.3,-2.6 L6,2 L4.6,4.2 Z" fill="#C1121F"/>' +
      '<rect x="-10" y="-7" width="7.4" height="6.4" rx="1.2" fill="#FBF4E6" stroke="#C8952E" stroke-width=".8"/>' +
      '<path d="M-8.6,-5.2 L-4.4,-4.6 L-6.7,-2 Z" fill="#E9A23B"/>' +
      '<path d="M-1.4,-0.6 C-1.4,-5 0.8,-7.6 2.8,-7.6 C4.4,-7.6 5,-6 4.6,-4.4 L3.6,-0.6 Z" fill="#0F4D23"/>' +
      '<path d="M4,-5.2 L7.2,-3.2" stroke="#0F4D23" stroke-width="1.5" stroke-linecap="round"/>' +
      '<circle cx="3.2" cy="-9.6" r="2.7" fill="#C1121F"/><path d="M4.4,-10.6 A2.7,2.7 0 0 1 5.9,-9.4" stroke="#FFFDF7" stroke-width=".8" fill="none"/></g>';
    const corpoMoto = moto.firstChild;
    const pose = (p, tremor) => {
      const k = p * kFim, k0 = Math.min(kFim - 1, Math.floor(k)), fr = k - k0;
      const a = pts[k0], b = pts[k0 + 1];
      const px = a[0] + (b[0] - a[0]) * fr, py = a[1] + (b[1] - a[1]) * fr;
      const th = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
      let d = 'M0,0';
      for (let j = 1; j <= k0; j++) d += ' L' + f1(pts[j][0]) + ',' + f1(pts[j][1]);
      rota.setAttribute('d', d + ' L' + f1(px) + ',' + f1(py));
      moto.setAttribute('transform', 'translate(' + f1(px) + ' ' + f1(py) + ') rotate(' + f1(th) + ')' + (Math.abs(th) > 90 ? ' scale(1 -1)' : ''));
      corpoMoto.setAttribute('transform', 'translate(0 ' + f1(-tremor) + ')');
    };
    if (!anima) {
      pose(1, 0);
      aneis.forEach((a, k) => { if (dentro && k !== i) a.g.style.opacity = 0.55; });
      if (dentro) { aneis[i].c.setAttribute('stroke-width', 3); aneis[i].c.setAttribute('fill-opacity', aneis[i].fo + 0.08); }
      return;
    }
    G.set([pino, etq, sombra], { opacity: 0 });
    pose(0, 0);
    const dur = 0.8 + 0.6 * Math.min(1, rr / 112), c = { p: 0 };
    const tl = G.timeline({ paused: true });
    if (dentro) aneis.forEach((a, k) => { if (k !== i) tl.to(a.g, { opacity: 0.55, duration: 0.4 }, 0); });
    tl.to(c, { p: 1, duration: dur, ease: 'power1.inOut', onUpdate: () => pose(c.p, Math.abs(Math.sin(c.p * 34)) * 0.9) }, 0)
      .fromTo(pino, { y: -26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.55, ease: 'bounce.out' }, dur - 0.1)
      .fromTo(sombra, { opacity: 0, scale: 0.3, transformOrigin: '50% 50%' }, { opacity: 0.2, scale: 1, duration: 0.55, ease: 'bounce.out' }, dur - 0.1)
      .fromTo(onda, { attr: { r: 2 }, opacity: 0.7 }, { attr: { r: 24 }, opacity: 0, duration: 0.8, ease: 'power2.out', immediateRender: false }, dur + 0.2)
      .fromTo(etq, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.35, ease: 'back.out(2)' }, dur + 0.15);
    if (dentro) tl.fromTo(aneis[i].c, { attr: { 'fill-opacity': aneis[i].fo + 0.3 - 0.16 * Math.min(1, aneis[i].r / 112), 'stroke-width': 5 } }, { attr: { 'fill-opacity': aneis[i].fo + 0.08, 'stroke-width': 3 }, duration: 0.9, ease: 'power2.out', immediateRender: false }, dur - 0.1);
    else tl.fromTo(aneis[aneis.length - 1].g, { x: -3 }, { x: 0, duration: 0.6, ease: 'elastic.out(1, 0.3)', immediateRender: false }, dur - 0.15);
    MAPA.tl = tl;
    // só toca com o mapa à vista (no celular ele fica abaixo do formulário): na hora, se já está; senão, ao entrar
    let primeira = true;
    const io = new IntersectionObserver((es) => {
      const agora = primeira; primeira = false;
      if (!es.some((e) => e.isIntersecting)) return;
      io.disconnect(); if (MAPA.io === io) MAPA.io = null;
      if (MAPA.tl !== tl) return;
      if (agora) tl.play(0); else G.delayedCall(0.3, () => { if (MAPA.tl === tl) tl.play(0); });
    }, { threshold: 0.35 });
    io.observe(svg);
    MAPA.io = io;
  }
  function renderFAQ() {
    const fx = D.entrega.faixas.slice().sort((a, b) => a.ateKm - b.ateKm);
    let ant = 0;
    const faixasTxt = fx.map((f) => { const t = (ant ? 'de ' + ant + ' a ' : 'até ') + f.ateKm + ' km: ' + brl(f.taxa); ant = f.ateKm; return t; }).join('; ');
    const dias = D.horarios.filter((h) => h.aberto).map((h) => DIAS[h.dia].toLowerCase() + ' das ' + h.abre + ' às ' + h.fecha).join(', ');
    const max = Math.max(...Object.values(D.config.maxSabores || { g: 1 }));
    const itens = [
      ['Como funciona o meio a meio?', 'Você escolhe até ' + max + ' sabores por pizza, nos tamanhos que permitem. O preço é o do sabor mais caro.'],
      ['Quanto custa a entrega?', 'A taxa depende da distância de rota até a pizzaria: ' + faixasTxt + '. Acima de ' + maxKm() + ' km não entregamos. Retirada no balcão não tem taxa.'],
      ['Quais formas de pagamento vocês aceitam?', 'Pix, cartão de crédito ou débito (maquininha na entrega ou no balcão) e dinheiro. Se for dinheiro, informe com quanto vai pagar para levarmos o troco certo.'],
      ['Tem pedido mínimo?', 'Sim, ' + brl(D.config.pedidoMinimo) + ' em produtos, sem contar a entrega.'],
      ['Qual o horário de funcionamento?', 'Atendemos ' + dias + '. Fora desse horário o site não envia pedidos.'],
      ['Como sei que o pedido foi recebido?', 'Ao finalizar, o WhatsApp da pizzaria abre com a mensagem pronta. É só enviar: a equipe responde confirmando o pedido e o tempo de entrega.'],
      ['Posso pedir sem cebola ou com alguma mudança?', 'Pode. Cada pizza tem um campo de observação, e no final há uma observação geral do pedido.']
    ];
    $('#acc').innerHTML = itens.map(([q, a], i) => '<div class="acc-item"><button type="button" aria-expanded="false" aria-controls="acc' + i + '" id="accb' + i + '">' + esc(q) + '<span class="mais" aria-hidden="true"></span></button><div class="acc-corpo" id="acc' + i + '" role="region" aria-labelledby="accb' + i + '"><div><p>' + esc(a) + '</p></div></div></div>').join('');
  }
  function bindFAQ() {
    $('#acc').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const item = b.parentElement;
      const abrir = !item.classList.contains('aberto');
      $$('.acc-item', $('#acc')).forEach((it) => { it.classList.remove('aberto'); it.firstElementChild.setAttribute('aria-expanded', 'false'); });
      if (abrir) { item.classList.add('aberto'); b.setAttribute('aria-expanded', 'true'); }
    });
  }

  /* ================= efeitos gerais ================= */
  // No celular, o botão flutuante do WhatsApp cobria a ponta do "Montar minha pizza" na primeira tela:
  // ele recolhe enquanto os botões do topo estão visíveis e volta ao rolar.
  function zapNaoAtrapalha() {
    const ctas = $('.hero .ctas');
    if (!ctas || !('IntersectionObserver' in window)) return;
    const raiz = document.documentElement;
    const caixa = ctas.getBoundingClientRect();
    let naTela = caixa.bottom > 0 && caixa.top < innerHeight;
    const aplica = () => raiz.classList.toggle('zap-recolhido', naTela && CELULAR.matches);
    aplica();
    new IntersectionObserver((es) => { naTela = es[es.length - 1].isIntersecting; aplica(); }).observe(ctas);
    CELULAR.addEventListener('change', aplica);
  }
  function efeitos() {
    const topo = $('#topo');
    const onScroll = () => {
      topo.classList.toggle('solido', window.scrollY > 24);
      if (!anima) { const h = document.documentElement; $('#progresso').style.transform = 'scaleX(' + (h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight)) + ')'; }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    if (!anima) return;
    G.to('#progresso', { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: 0.3 } });
    if (FINO) {
      $$('.magnetico').forEach((b) => {
        const qx = G.quickTo(b, 'x', { duration: 0.4, ease: 'power3' }), qy = G.quickTo(b, 'y', { duration: 0.4, ease: 'power3' });
        b.addEventListener('pointermove', (e) => { const r = b.getBoundingClientRect(); qx((e.clientX - r.left - r.width / 2) * 0.28); qy((e.clientY - r.top - r.height / 2) * 0.4); });
        b.addEventListener('pointerleave', () => { qx(0); qy(0); });
      });
    }
    $$('.sec-head').forEach((h) => {
      G.from(h.children, { y: 40, opacity: 0, duration: 0.8, stagger: 0.12, ease: 'power3.out', scrollTrigger: { trigger: h, start: 'top 82%', once: true } });
    });
    if (!CELULAR.matches) G.from('.painel', { y: 60, opacity: 0, duration: 0.9, ease: 'power3.out', scrollTrigger: { trigger: '#montar', start: 'top 70%', once: true } });
    if (!CELULAR.matches) G.from('#montPalco', { scale: 0.7, rotation: -60, opacity: 0, duration: 1.1, ease: 'expo.out', scrollTrigger: { trigger: '#montar', start: 'top 70%', once: true } });
    G.from('.faixa-linha', { x: -30, opacity: 0, duration: 0.5, stagger: 0.08, scrollTrigger: { trigger: '#faixasLista', start: 'top 85%', once: true } });
    G.from('.acc-item', { y: 24, opacity: 0, duration: 0.5, stagger: 0.06, scrollTrigger: { trigger: '#acc', start: 'top 85%', once: true } });
    G.from('.final h2, .final .lead, .final .btn', { y: 50, opacity: 0, duration: 0.8, stagger: 0.12, ease: 'power3.out', scrollTrigger: { trigger: '.final', start: 'top 75%', once: true } });
    G.fromTo('#seloFinal', { rotation: -40, scale: 0.8 }, { rotation: 20, scale: 1, ease: 'none', scrollTrigger: { trigger: '.final', start: 'top bottom', end: 'bottom bottom', scrub: 0.8 } });
    const marquee = G.fromTo('#marquee', { xPercent: 0 }, { xPercent: -50, duration: 40, ease: 'none', repeat: -1 });
    // a faixa só anda quando está na tela (fora dela era trabalho contínuo à toa) e para, suave, com o mouse em cima
    const mq = $('.faixa');
    let mqNaTela = true, mqMouse = false;
    const mqSincroniza = () => {
      if (!mqNaTela) { marquee.pause(); return; }
      marquee.resume();
      G.to(marquee, { timeScale: mqMouse ? 0 : 1, duration: 0.5, overwrite: true });
    };
    if ('IntersectionObserver' in window) new IntersectionObserver((es) => { mqNaTela = es[es.length - 1].isIntersecting; mqSincroniza(); }).observe(mq);
    mq.addEventListener('pointerenter', () => { mqMouse = true; mqSincroniza(); });
    mq.addEventListener('pointerleave', () => { mqMouse = false; mqSincroniza(); });
  }

  /* ================= portal da equipe ================= */
  const P = { logado: null, usuario: null, aba: 'sabores', sujo: false, filtroCat: 'todas', busca: '', publicando: false, visual: null };
  async function sha256(txt) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  async function abrirPortal() {
    $('#portal').hidden = false;
    document.documentElement.style.overflow = 'hidden';
    // com o servidor de pedidos, a sessão é dele (cookie HttpOnly); sem ele, segue o login só no navegador
    if (window.PedidosPP && (await PedidosPP.pronto)) {
      if (!P.logado) $('#portal').innerHTML = '<div class="wrap"><p class="pp-carregando">Abrindo o portal…</p></div>';
      const s = await PedidosPP.sessao();
      P.logado = s ? s.usuario.id : null;
      P.usuario = s ? s.usuario : null;
      if (s && !s.usuario.admin) { location.href = '/gestao'; return; } // equipe sem acesso ao cardápio vai direto para a gestão
      if (s && !abasVisiveis().some(([id]) => id === P.aba)) P.aba = abasVisiveis()[0][0];
      renderPortal();
      return;
    }
    const sess = store.sget('sessao');
    if (sess && (D.usuarios || []).some((u) => u.id === sess && u.admin)) P.logado = sess;
    renderPortal();
  }
  const ABAS_PEDIDOS = [['pedidos', 'Pedidos'], ['fechamento', 'Fechamento do dia']];
  function abasVisiveis() {
    const comServidor = !!(window.PedidosPP && PedidosPP.servidor);
    const admin = !P.usuario || P.usuario.admin; // sem servidor, só administrador entra
    return comServidor && !admin ? [] : ABAS; // pedidos e relatórios ficam na gestão (/gestao)
  }
  const abaDePedidos = () => P.aba === 'pedidos' || P.aba === 'fechamento';
  function sessaoExpirou() {
    P.logado = null; P.usuario = null;
    if (!$('#portal').hidden) { renderPortal(); toast('Sua sessão expirou. Entre de novo.'); }
  }
  function fecharPortal() {
    if (P.sujo) { toast('Há alterações não publicadas. Publique ou descarte antes de sair.'); return; }
    $('#portal').hidden = true;
    document.documentElement.style.overflow = '';
  }
  function marcaSujo() {
    P.sujo = true;
    const s = $('#pSujo'); if (s) s.textContent = 'Alterações não publicadas';
    rerenderSite();
  }
  function rerenderSite() {
    Object.keys(CACHE_MINI).forEach((k) => delete CACHE_MINI[k]);
    renderStatus(); renderTextos(); renderPromos(); renderCardCats(); renderCardapio(); renderEntregaSec(); renderFAQ(); renderEtapa(0); atualizaPalco(null); renderFab();
  }
  const ABAS = [['sabores', 'Sabores'], ['categorias', 'Categorias'], ['bordas', 'Bordas'], ['massas', 'Massas'], ['adicionais', 'Acompanhamentos e bebidas'], ['promocoes', 'Promoções'], ['entrega', 'Entrega'], ['horarios', 'Horários'], ['config', 'Configurações'], ['usuarios', 'Usuários']];
  function renderPortal() {
    const box = $('#portal');
    if (!P.logado) {
      box.innerHTML = '<div class="wrap"><div class="login"><img src="' + LOGOS.v + '" alt="Pizzaria Pereira"><h2 style="font-size:28px">Área da equipe</h2><p style="color:var(--texto-2);font-size:14px">Entre com seu usuário. Só funcionários com acesso de administrador editam o cardápio.</p><form id="pLogin"><label class="campo-rot">Usuário<input class="campo" id="pUser" autocomplete="username" required></label><label class="campo-rot">Senha<input class="campo" id="pPass" type="password" autocomplete="current-password" required></label><div class="erro" id="pErro"></div><button class="btn" type="submit">Entrar</button><button class="btn btn-ghost" type="button" data-p="sair-portal">Voltar ao site</button></form></div></div>';
      return;
    }
    const u = (D.usuarios || []).find((x) => x.id === P.logado);
    box.innerHTML = '<div class="p-topo"><div class="wrap"><h2>Portal Pereira</h2><span style="font-size:13px;opacity:.85">' + esc(u ? u.nome : P.usuario ? P.usuario.nome : '') + '</span><div class="sp"><span class="sujo" id="pSujo">' + (P.sujo ? 'Alterações não publicadas' : '') + '</span>' +
      (abaDePedidos() ? '' : '<button class="btn btn-ghost" type="button" data-p="descartar">Descartar</button><button class="btn" type="button" data-p="publicar"' + (P.publicando ? ' disabled' : '') + '>' + (P.publicando ? 'Publicando…' : 'Publicar alterações') + '</button>') + '<button class="btn btn-ghost" type="button" data-p="ver-site">Ver site</button>' + (window.PedidosPP && PedidosPP.servidor ? '<a class="btn" href="/gestao">Gestão de pedidos</a>' : '') + '<button class="btn btn-ghost" type="button" data-p="logout">Sair</button></div></div></div>' +
      '<div class="wrap"><div class="p-abas" role="tablist">' + abasVisiveis().map(([id, n]) => '<button type="button" role="tab" data-aba="' + id + '" aria-selected="' + (P.aba === id) + '">' + n + '</button>').join('') + '</div><div class="p-corpo" id="pCorpo">' + (abaDePedidos() ? '<div id="ppPainel"></div>' : htmlAba()) + '</div></div>';
    if (abaDePedidos()) { location.href = '/gestao'; return; }
    desenhaPreviaVisual();
  }
  // receita visual: o editor mostra o automático até a primeira mudança, que grava a receita no sabor
  function garanteVisual(i) {
    const s = D.sabores[i];
    if (!s.visual) { const a = analiseAuto(s); s.visual = { base: a.base, queijo: a.queijo, itens: a.itens.map((x) => ({ k: x.k, q: 1 })) }; }
    return s.visual;
  }
  function desenhaPreviaVisual() {
    const svg = $('#pVisPrev');
    if (svg && P.visual != null && D.sabores[P.visual]) desenharPizza(svg, { sabores: [D.sabores[P.visual].id], tamanho: 'grande', borda: 'sem' });
  }
  function htmlVisual(i) {
    const s = D.sabores[i];
    const v = s.visual || analiseAuto(s), b = 'sabores.' + i + '.visual';
    const opcoes = Object.keys(ING).sort((x, y) => ING[x].nome.localeCompare(ING[y].nome, 'pt'));
    return '<div class="p-card vis-ed"><div class="vis-prev"><svg id="pVisPrev" viewBox="-104 -104 208 208" aria-label="Prévia do desenho"></svg></div><div class="vis-campos"><h3>Desenho: ' + esc(s.nome) + ' <span class="vis-modo">' + (s.visual ? 'manual' : 'automático') + '</span></h3>' +
      '<p class="hint">' + (s.visual ? 'Este sabor usa a receita abaixo. "Voltar ao automático" faz o desenho seguir o texto de ingredientes de novo.' : 'Hoje o desenho segue o texto de ingredientes. Qualquer mudança aqui passa a valer só para o desenho, sem mudar o texto do cardápio.') + ' A quantidade aumenta ou diminui quantas peças aparecem.</p>' +
      '<div class="p-linha"><label>Base<select class="campo" data-bind="' + b + '.base">' + BASES.map(([id, n]) => '<option value="' + id + '"' + (v.base === id ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></label><label style="flex-direction:row;display:flex;gap:8px;align-items:center">Mussarela ' + sw(b + '.queijo', v.queijo) + '</label></div>' +
      v.itens.map((it, j) => '<div class="p-linha vis-item"><select class="campo" data-bind="' + b + '.itens.' + j + '.k">' + opcoes.map((k) => '<option value="' + k + '"' + (it.k === k ? ' selected' : '') + '>' + esc(ING[k].nome) + '</option>').join('') + '</select><label class="vis-qtd">Qtd.<input type="range" min="0.3" max="2" step="0.1" data-num="1" data-bind="' + b + '.itens.' + j + '.q" value="' + (it.q || 1) + '"></label><button class="p-btn perigo" type="button" data-p="vis-del" data-i="' + i + '" data-j="' + j + '">Tirar</button></div>').join('') +
      (v.itens.length ? '' : '<p class="hint">Nenhum ingrediente por cima.</p>') +
      '<div class="p-linha"><button class="p-btn add" type="button" data-p="vis-add" data-i="' + i + '">+ Ingrediente</button>' + (s.visual ? '<button class="p-btn" type="button" data-p="vis-auto" data-i="' + i + '">Voltar ao automático</button>' : '') + '<button class="p-btn" type="button" data-p="vis-fechar">Fechar</button></div></div></div>';
  }
  const sw = (path, val, extra) => '<label class="switch"><input type="checkbox" data-bind="' + path + '"' + (val ? ' checked' : '') + (extra || '') + '><span></span></label>';
  const inp = (path, val, attrs) => '<input class="campo" data-bind="' + path + '" value="' + esc(val == null ? '' : val) + '" ' + (attrs || '') + '>';
  function htmlAba() {
    const a = P.aba;
    if (a === 'sabores') {
      const q = norm(P.busca);
      const lista = D.sabores.map((s, i) => [s, i]).filter(([s]) => (P.filtroCat === 'todas' || s.cat === P.filtroCat) && (!q || norm(s.nome + ' ' + s.ing).includes(q)));
      return (P.visual != null && D.sabores[P.visual] ? htmlVisual(P.visual) : '') + '<div class="p-card"><h3>Sabores (' + D.sabores.length + ')</h3><p class="hint">Preço vazio = tamanho indisponível. "Esgotado hoje" some do pedido, mas continua no cardápio. Foto é opcional: sem foto, o site desenha a pizza pelos ingredientes. O botão "Desenho" ajusta base e ingredientes do desenho de cada sabor.</p>' +
        '<div class="p-linha"><select class="campo" id="pFiltroCat"><option value="todas">Todas as categorias</option>' + D.categorias.map((c) => '<option value="' + c.id + '"' + (P.filtroCat === c.id ? ' selected' : '') + '>' + esc(c.nome) + '</option>').join('') + '</select><input class="campo" id="pBusca" placeholder="Buscar" value="' + esc(P.busca) + '"><button class="p-btn add" type="button" data-p="add-sabor">+ Novo sabor</button></div>' +
        '<div class="tabela-wrap"><table class="p-tab"><thead><tr><th>Foto</th><th>Nome</th><th>Categoria</th><th>Ingredientes</th><th>Broto R$</th><th>Grande R$</th><th>Novo</th><th>Esgotado</th><th>Ativo</th><th></th></tr></thead><tbody>' +
        lista.map(([s, i]) => '<tr><td><label style="cursor:pointer" title="Trocar foto">' + (s.foto ? '<img class="foto-mini" src="' + esc(s.foto) + '" alt="">' : '<span class="foto-mini" style="display:block">' + miniSVG({ sabores: [s.id], tamanho: 'grande', borda: 'sem' }) + '</span>') + '<input type="file" accept="image/*" data-foto="' + i + '" hidden></label></td>' +
          '<td>' + inp('sabores.' + i + '.nome', s.nome) + '</td><td><select class="campo" data-bind="sabores.' + i + '.cat">' + D.categorias.map((c) => '<option value="' + c.id + '"' + (s.cat === c.id ? ' selected' : '') + '>' + esc(c.nome) + '</option>').join('') + '</select></td>' +
          '<td style="min-width:260px">' + inp('sabores.' + i + '.ing', s.ing) + '</td><td>' + inp('sabores.' + i + '.b', s.b, 'type="number" step="0.5" min="0" class="campo preco" data-num="1"') + '</td><td>' + inp('sabores.' + i + '.g', s.g, 'type="number" step="0.5" min="0" data-num="1"') + '</td>' +
          '<td>' + sw('sabores.' + i + '.novo', s.novo) + '</td><td>' + sw('sabores.' + i + '.esgotado', s.esgotado) + '</td><td>' + sw('sabores.' + i + '.ativo', s.ativo !== false) + '</td>' +
          '<td class="acoes"><button class="p-btn" type="button" data-p="visual" data-i="' + i + '">' + (s.visual ? 'Desenho ✎' : 'Desenho') + '</button>' + (s.foto ? '<button class="p-btn" type="button" data-p="tira-foto" data-i="' + i + '">Sem foto</button>' : '') + '<button class="p-btn perigo" type="button" data-p="del" data-col="sabores" data-i="' + i + '">Remover</button></td></tr>').join('') +
        '</tbody></table></div></div>';
    }
    if (a === 'categorias') {
      return '<div class="p-card"><h3>Categorias</h3><p class="hint">A ordem aqui é a ordem do cardápio.</p>' + D.categorias.map((c, i) => '<div class="p-linha">' + inp('categorias.' + i + '.nome', c.nome) + '<span class="hint">' + D.sabores.filter((s) => s.cat === c.id).length + ' sabores</span><button class="p-btn" type="button" data-p="mover" data-col="categorias" data-i="' + i + '" data-d="-1">↑</button><button class="p-btn" type="button" data-p="mover" data-col="categorias" data-i="' + i + '" data-d="1">↓</button><button class="p-btn perigo" type="button" data-p="del-cat" data-i="' + i + '">Remover</button></div>').join('') + '<div><button class="p-btn add" type="button" data-p="add" data-col="categorias">+ Nova categoria</button></div></div>';
    }
    if (a === 'bordas') {
      return '<div class="p-card"><h3>Bordas</h3><p class="hint">A cor pinta a borda no desenho da pizza.</p>' + D.bordas.map((b, i) => '<div class="p-linha"><label>Nome' + inp('bordas.' + i + '.nome', b.nome) + '</label><label>Preço R$' + inp('bordas.' + i + '.preco', b.preco, 'type="number" step="0.5" min="0" data-num="1" style="width:110px"') + '</label>' + (b.id === 'sem' ? '' : '<label>Cor<input type="color" class="campo" data-bind="bordas.' + i + '.cor" value="' + esc(b.cor || '#F2D27A') + '" style="width:64px;padding:4px"></label><label>Ativa ' + sw('bordas.' + i + '.ativo', b.ativo !== false) + '</label><button class="p-btn perigo" type="button" data-p="del" data-col="bordas" data-i="' + i + '">Remover</button>') + '</div>').join('') + '<div><button class="p-btn add" type="button" data-p="add" data-col="bordas">+ Nova borda</button></div></div>';
    }
    if (a === 'massas') {
      return '<div class="p-card"><h3>Massas / fermentações</h3><p class="hint">Com uma massa só, o passo "Massa" não aparece para o cliente. Cadastre duas ou mais para ele escolher.</p>' + D.massas.map((m, i) => '<div class="p-linha"><label>Nome' + inp('massas.' + i + '.nome', m.nome) + '</label><label style="flex:1">Descrição' + inp('massas.' + i + '.desc', m.desc) + '</label><label>Acréscimo R$' + inp('massas.' + i + '.preco', m.preco, 'type="number" step="0.5" min="0" data-num="1" style="width:110px"') + '</label>' + (D.massas.length > 1 ? '<button class="p-btn perigo" type="button" data-p="del" data-col="massas" data-i="' + i + '">Remover</button>' : '') + '</div>').join('') + '<div><button class="p-btn add" type="button" data-p="add" data-col="massas">+ Nova massa</button></div></div>';
    }
    if (a === 'adicionais') {
      return '<div class="p-card"><h3>Acompanhamentos e bebidas</h3><p class="hint">No checkout o cliente precisa escolher pelo menos um item de cada tipo, ou marcar "Não quero".</p><div class="tabela-wrap"><table class="p-tab"><thead><tr><th>Tipo</th><th>Grupo</th><th>Nome</th><th>Preço R$</th><th>Esgotado</th><th>Ativo</th><th></th></tr></thead><tbody>' +
        D.adicionais.map((x, i) => '<tr><td><select class="campo" data-bind="adicionais.' + i + '.tipo"><option value="acompanhamento"' + (x.tipo === 'acompanhamento' ? ' selected' : '') + '>Acompanhamento</option><option value="bebida"' + (x.tipo === 'bebida' ? ' selected' : '') + '>Bebida</option></select></td><td>' + inp('adicionais.' + i + '.grupo', x.grupo) + '</td><td>' + inp('adicionais.' + i + '.nome', x.nome) + '</td><td>' + inp('adicionais.' + i + '.preco', x.preco, 'type="number" step="0.5" min="0" data-num="1"') + '</td><td>' + sw('adicionais.' + i + '.esgotado', x.esgotado) + '</td><td>' + sw('adicionais.' + i + '.ativo', x.ativo !== false) + '</td><td class="acoes"><button class="p-btn perigo" type="button" data-p="del" data-col="adicionais" data-i="' + i + '">Remover</button></td></tr>').join('') +
        '</tbody></table></div><div><button class="p-btn add" type="button" data-p="add" data-col="adicionais">+ Novo item</button></div></div>';
    }
    if (a === 'promocoes') return htmlPromoEditor();
    if (a === 'entrega') {
      const e = D.entrega, c = D.config;
      return '<div class="p-card"><h3>Faixas de taxa</h3><p class="hint">A distância é a rota de carro até a pizzaria. Acima da última faixa o site não aceita entrega.</p>' + e.faixas.map((f, i) => '<div class="p-linha"><label>Até (km)' + inp('entrega.faixas.' + i + '.ateKm', f.ateKm, 'type="number" step="0.5" min="0" data-num="1" style="width:110px"') + '</label><label>Taxa R$' + inp('entrega.faixas.' + i + '.taxa', f.taxa, 'type="number" step="0.5" min="0" data-num="1" style="width:110px"') + '</label><button class="p-btn perigo" type="button" data-p="del" data-col="entrega.faixas" data-i="' + i + '">Remover</button></div>').join('') + '<div><button class="p-btn add" type="button" data-p="add" data-col="entrega.faixas">+ Nova faixa</button></div></div>' +
        '<div class="p-card"><h3>Endereço da pizzaria</h3><p class="hint">Ponto de partida do cálculo. Latitude e longitude são opcionais: se vazias, o site localiza pelo endereço.</p><div class="p-linha"><label style="flex:1;min-width:260px">Endereço' + inp('config.endereco', c.endereco) + '</label><label>Latitude' + inp('config.lojaLat', c.lojaLat, 'data-num="1" style="width:130px"') + '</label><label>Longitude' + inp('config.lojaLng', c.lojaLng, 'data-num="1" style="width:130px"') + '</label></div><div class="p-linha"><label>Tempo de entrega' + inp('config.tempoEntrega', c.tempoEntrega) + '</label><label>Tempo de retirada' + inp('config.tempoRetirada', c.tempoRetirada) + '</label></div></div>' +
        '<div class="p-card"><h3>Regiões de reserva</h3><p class="hint">Usadas só quando o cálculo automático falha (sem internet do serviço de mapas). O cliente escolhe a região e a taxa vem da distância cadastrada.</p>' + e.bairros.map((b, i) => '<div class="p-linha"><label style="flex:1;min-width:220px">Região / bairro' + inp('entrega.bairros.' + i + '.nome', b.nome) + '</label><label>Distância (km)' + inp('entrega.bairros.' + i + '.km', b.km, 'type="number" step="0.1" min="0" data-num="1" style="width:110px"') + '</label><button class="p-btn perigo" type="button" data-p="del" data-col="entrega.bairros" data-i="' + i + '">Remover</button></div>').join('') + '<div><button class="p-btn add" type="button" data-p="add" data-col="entrega.bairros">+ Nova região</button></div></div>';
    }
    if (a === 'horarios') {
      return '<div class="p-card"><h3>Horário de funcionamento</h3><p class="hint">Fora do horário o site mostra "Fechado" e não envia pedidos. Fechamento depois da meia-noite funciona (ex.: 18:00 às 01:00).</p><div class="p-linha"><label>Situação agora<select class="campo" data-bind="config.statusManual"><option value="auto"' + (D.config.statusManual === 'auto' ? ' selected' : '') + '>Seguir horário</option><option value="aberto"' + (D.config.statusManual === 'aberto' ? ' selected' : '') + '>Forçar aberto</option><option value="fechado"' + (D.config.statusManual === 'fechado' ? ' selected' : '') + '>Forçar fechado</option></select></label></div>' +
        [1, 2, 3, 4, 5, 6, 0].map((d) => { const i = D.horarios.findIndex((h) => h.dia === d); const h = D.horarios[i]; return '<div class="p-linha"><b style="width:90px">' + DIAS[d] + '</b>' + sw('horarios.' + i + '.aberto', h.aberto) + '<label>Abre<input type="time" class="campo" data-bind="horarios.' + i + '.abre" value="' + esc(h.abre) + '"></label><label>Fecha<input type="time" class="campo" data-bind="horarios.' + i + '.fecha" value="' + esc(h.fecha) + '"></label></div>'; }).join('') + '</div>';
    }
    if (a === 'config') {
      const c = D.config;
      return '<div class="p-card"><h3>Pedidos</h3><div class="p-linha"><label>WhatsApp que recebe os pedidos (com DDD)' + inp('config.whatsapp', c.whatsapp, 'inputmode="tel"') + '</label><label>Pedido mínimo R$' + inp('config.pedidoMinimo', c.pedidoMinimo, 'type="number" step="1" min="0" data-num="1" style="width:110px"') + '</label></div>' +
        '<div class="p-linha"><label>Sabores por pizza (broto)' + inp('config.maxSabores.broto', c.maxSabores.broto, 'type="number" min="1" max="2" data-num="1" style="width:90px"') + '</label><label>Sabores por pizza (grande)' + inp('config.maxSabores.grande', c.maxSabores.grande, 'type="number" min="1" max="2" data-num="1" style="width:90px"') + '</label><label>Fatias broto' + inp('config.fatias.broto', c.fatias.broto, 'type="number" min="2" max="16" data-num="1" style="width:90px"') + '</label><label>Fatias grande' + inp('config.fatias.grande', c.fatias.grande, 'type="number" min="2" max="16" data-num="1" style="width:90px"') + '</label></div>' +
        '<div class="p-linha"><label style="display:flex;gap:10px;align-items:center;flex-direction:row">' + sw('config.modoTeste', c.modoTeste) + ' Modo teste: aceitar pedidos fora do horário (desligue ao colocar no ar)</label></div></div>' +
        '<div class="p-card"><h3>Contato e marca</h3><div class="p-linha"><label>Telefone fixo' + inp('config.telefoneFixo', c.telefoneFixo) + '</label><label>Instagram (sem @)' + inp('config.instagram', c.instagram) + '</label><label>Fundadora' + inp('config.fundadora', c.fundadora) + '</label><label>CEO' + inp('config.ceo', c.ceo) + '</label></div>' +
        '<div class="p-linha">' + c.tamanhos.map((t, i) => '<label>Descrição ' + esc(t.nome) + inp('config.tamanhos.' + i + '.desc', t.desc) + '</label>').join('') + '</div></div>' +
        '<div class="p-card"><h3>Backup</h3><p class="hint">Copia todos os dados (cardápio, promoções, configurações) em JSON. Serve para levar ao servidor próprio.</p><div><button class="p-btn" type="button" data-p="copiar-json">Copiar JSON</button></div></div>';
    }
    if (a === 'usuarios' && !Array.isArray(D.usuarios)) return '<div class="p-card"><h3>Usuários da equipe</h3><p class="hint">No servidor, os usuários e as senhas ficam guardados no próprio servidor, fora desta página. Crie, troque a senha ou tire o acesso em <b>Gestão → Configurações → Equipe</b>.</p><div><a class="p-btn" href="/gestao#/configuracoes/equipe">Abrir a Equipe na gestão</a></div></div>'; if (a === 'usuarios') {
      return '<div class="p-card"><h3>Usuários da equipe</h3><p class="hint">Só quem tem a flag <b>Admin</b> entra no portal. As senhas ficam guardadas com hash. No protótipo, quem publica de fato as alterações precisa também ser editor deste artifact no claude.ai; no servidor próprio isso vira login completo.</p>' +
        D.usuarios.map((u, i) => '<div class="p-linha"><label>Nome' + inp('usuarios.' + i + '.nome', u.nome) + '</label><label>Usuário' + inp('usuarios.' + i + '.login', u.login, 'autocomplete="off"') + '</label><label style="flex-direction:row;display:flex;gap:8px;align-items:center">Admin ' + sw('usuarios.' + i + '.admin', u.admin, u.id === P.logado ? ' disabled' : '') + '</label><label>Nova senha<input class="campo" type="password" data-senha="' + i + '" autocomplete="new-password" placeholder="' + (u.hash ? 'manter atual' : 'definir') + '"></label><button class="p-btn" type="button" data-p="salva-senha" data-i="' + i + '">Salvar senha</button>' + (u.id === P.logado ? '' : '<button class="p-btn perigo" type="button" data-p="del" data-col="usuarios" data-i="' + i + '">Remover</button>') + '</div>').join('') +
        '<div><button class="p-btn add" type="button" data-p="add" data-col="usuarios">+ Novo usuário</button></div></div>';
    }
    return '';
  }
  function htmlPromoEditor() {
    const tipos = [['preco_fixo', 'Preço fixo (combo)'], ['desconto_pct', 'Desconto em %'], ['desconto_valor', 'Desconto em R$'], ['brinde', 'Brinde (item grátis)'], ['frete_gratis', 'Frete grátis'], ['borda_gratis', 'Borda grátis']];
    return '<div class="p-card"><h3>Promoções</h3><p class="hint">Cada promoção tem 4 partes: <b>quando vale</b>, <b>o que o pedido precisa ter</b>, <b>o que o cliente ganha</b> e <b>regras</b>. O site aplica sozinho a melhor combinação para o cliente e mostra no carrinho quanto falta para ganhar.</p><div><button class="p-btn add" type="button" data-p="add-promo">+ Nova promoção</button></div></div>' +
      D.promocoes.map((p, i) => {
        const b = 'promocoes.' + i;
        const slots = p.condicao.slots.map((sl, j) => {
          const sb = b + '.condicao.slots.' + j;
          return '<div class="slot"><div class="p-linha"><label>Qtd' + inp(sb + '.qtd', sl.qtd, 'type="number" min="1" data-num="1" style="width:70px"') + '</label><label>Tipo<select class="campo" data-bind="' + sb + '.tipo"><option value="pizza"' + (sl.tipo === 'pizza' ? ' selected' : '') + '>Pizza</option><option value="item"' + (sl.tipo === 'item' ? ' selected' : '') + '>Bebida/acompanhamento</option></select></label>' +
            (sl.tipo === 'pizza' ? '<label>Tamanho<select class="campo" data-bind="' + sb + '.tamanho"><option value="">Qualquer</option>' + D.config.tamanhos.map((t) => '<option value="' + t.id + '"' + (sl.tamanho === t.id ? ' selected' : '') + '>' + esc(t.nome) + '</option>').join('') + '</select></label>' : '') +
            '<button class="p-btn perigo" type="button" data-p="del" data-col="' + b + '.condicao.slots" data-i="' + j + '">Tirar</button></div>' +
            (sl.tipo === 'pizza'
              ? '<span class="hint" style="font-size:12px">Categorias aceitas (vazio = todas)</span><div class="multi">' + D.categorias.map((c) => '<label><input type="checkbox" data-lista="' + sb + '.categorias" value="' + c.id + '"' + (sl.categorias.includes(c.id) ? ' checked' : '') + '>' + esc(c.nome) + '</label>').join('') + '</div><span class="hint" style="font-size:12px">Ou sabores específicos</span><div class="multi">' + D.sabores.map((s) => '<label><input type="checkbox" data-lista="' + sb + '.sabores" value="' + s.id + '"' + (sl.sabores.includes(s.id) ? ' checked' : '') + '>' + esc(s.nome) + '</label>').join('') + '</div>'
              : '<span class="hint" style="font-size:12px">Itens aceitos (vazio = qualquer)</span><div class="multi">' + D.adicionais.map((x) => '<label><input type="checkbox" data-lista="' + sb + '.itens" value="' + x.id + '"' + (sl.itens.includes(x.id) ? ' checked' : '') + '>' + esc(x.nome) + '</label>').join('') + '</div>') + '</div>';
        }).join('');
        return '<div class="p-card promo-ed"><div class="p-linha"><label style="flex:1;min-width:220px">Nome' + inp(b + '.nome', p.nome) + '</label><label style="flex-direction:row;display:flex;gap:8px;align-items:center">Ativa ' + sw(b + '.ativa', p.ativa) + '</label><button class="p-btn perigo" type="button" data-p="del" data-col="promocoes" data-i="' + i + '">Remover</button></div><label class="campo-rot">Descrição para o cliente' + inp(b + '.descricao', p.descricao) + '</label>' +
          '<div class="blocos"><div class="bloco"><h4>1 · Quando vale</h4><div class="dias">' + DIAS_C.map((dn, d) => '<label><input type="checkbox" data-lista="' + b + '.quando.dias" data-numval="1" value="' + d + '"' + (p.quando.dias.includes(d) ? ' checked' : '') + '><span>' + dn + '</span></label>').join('') + '</div><span class="hint" style="font-size:12px">Nenhum dia marcado = todos os dias</span>' +
          '<div class="p-linha"><label>Das<input type="time" class="campo" data-bind="' + b + '.quando.horaIni" value="' + esc(p.quando.horaIni) + '"></label><label>Até<input type="time" class="campo" data-bind="' + b + '.quando.horaFim" value="' + esc(p.quando.horaFim) + '"></label></div>' +
          '<div class="p-linha"><label>De<input type="date" class="campo" data-bind="' + b + '.quando.dataIni" value="' + esc(p.quando.dataIni) + '"></label><label>Até<input type="date" class="campo" data-bind="' + b + '.quando.dataFim" value="' + esc(p.quando.dataFim) + '"></label></div>' +
          '<div class="p-linha"><label>Canal<select class="campo" data-bind="' + b + '.quando.canal"><option value="todos"' + (p.quando.canal === 'todos' ? ' selected' : '') + '>Entrega e retirada</option><option value="entrega"' + (p.quando.canal === 'entrega' ? ' selected' : '') + '>Só entrega</option><option value="retirada"' + (p.quando.canal === 'retirada' ? ' selected' : '') + '>Só retirada</option></select></label><label>Cupom (opcional)' + inp(b + '.quando.cupom', p.quando.cupom, 'style="width:140px"') + '</label></div></div>' +
          '<div class="bloco"><h4>2 · O pedido precisa ter</h4><select class="campo" data-bind="' + b + '.condicao.tipo"><option value="itens"' + (p.condicao.tipo === 'itens' ? ' selected' : '') + '>Itens específicos</option><option value="valor"' + (p.condicao.tipo === 'valor' ? ' selected' : '') + '>Valor mínimo</option></select>' +
          (p.condicao.tipo === 'valor' ? '<label class="campo-rot">Valor mínimo R$' + inp(b + '.condicao.valorMin', p.condicao.valorMin, 'type="number" min="0" step="1" data-num="1"') + '</label>' : slots + '<div><button class="p-btn add" type="button" data-p="add-slot" data-i="' + i + '">+ Item na condição</button></div>') + '</div>' +
          '<div class="bloco"><h4>3 · O cliente ganha</h4><select class="campo" data-bind="' + b + '.recompensa.tipo">' + tipos.map(([v, n]) => '<option value="' + v + '"' + (p.recompensa.tipo === v ? ' selected' : '') + '>' + n + '</option>').join('') + '</select>' +
          (['preco_fixo', 'desconto_pct', 'desconto_valor'].includes(p.recompensa.tipo) ? '<label class="campo-rot">' + (p.recompensa.tipo === 'desconto_pct' ? 'Percentual' : 'Valor R$') + inp(b + '.recompensa.valor', p.recompensa.valor, 'type="number" min="0" step="0.5" data-num="1"') + '</label>' : '') +
          (p.recompensa.tipo === 'brinde' ? '<label class="campo-rot">Item de brinde<select class="campo" data-bind="' + b + '.recompensa.itemId">' + D.adicionais.map((x) => '<option value="' + x.id + '"' + (p.recompensa.itemId === x.id ? ' selected' : '') + '>' + esc(x.nome) + '</option>').join('') + '</select></label>' : '') + '</div>' +
          '<div class="bloco"><h4>4 · Regras</h4><label style="display:flex;gap:8px;align-items:center">' + sw(b + '.regras.acumula', p.regras.acumula) + ' Acumula com outras promoções</label><div class="p-linha"><label>Prioridade (1 = primeiro)' + inp(b + '.regras.prioridade', p.regras.prioridade, 'type="number" min="1" data-num="1" style="width:90px"') + '</label><label>Máx. por pedido' + inp(b + '.regras.maxPorPedido', p.regras.maxPorPedido, 'type="number" min="1" data-num="1" style="width:90px"') + '</label></div></div></div></div>';
      }).join('');
  }
  function caminho(path) {
    const ks = path.split('.');
    let o = D;
    for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
    return [o, ks[ks.length - 1]];
  }
  function novoItem(col) {
    const n = Date.now().toString(36);
    if (col === 'categorias') return { id: 'cat-' + n, nome: 'Nova categoria' };
    if (col === 'bordas') return { id: 'borda-' + n, nome: 'Nova borda', preco: 0, cor: '#F2D27A' };
    if (col === 'massas') return { id: 'massa-' + n, nome: 'Nova massa', desc: '', preco: 0 };
    if (col === 'adicionais') return { id: 'item-' + n, tipo: 'bebida', grupo: 'Refrigerantes', nome: 'Novo item', preco: 0 };
    if (col === 'entrega.faixas') return { ateKm: maxKm() + 5, taxa: 0 };
    if (col === 'entrega.bairros') return { nome: 'Nova região', km: 1 };
    if (col === 'usuarios') return { id: 'u-' + n, nome: 'Funcionário', login: 'usuario' + D.usuarios.length, admin: false, salt: '', hash: '' };
    return null;
  }
  async function publicar() {
    let art = null;
    try { art = window.claude && window.claude.use ? await window.claude.use('artifact') : null; } catch (e) { art = null; }
    if (!art) { toast('Publicar só funciona no link do claude.ai, para editores. Use Configurações → Copiar JSON.'); return; }
    P.publicando = true; renderPortal();
    D.versao = (D.versao || 0) + 1;
    try {
      await art.publish(gerarDocumento());
      P.sujo = false; toast('Publicado! Todos os visitantes já veem a nova versão.');
    } catch (e) {
      const c = e && (e.code || e.message);
      toast(c === 'conflict' ? 'Outra pessoa publicou antes. A página vai recarregar com a versão dela.' : c === 'not_writer' || c === 'not_granted' ? 'Sua conta não tem permissão de edição neste artifact.' : 'Não deu para publicar: ' + c);
    }
    P.publicando = false; renderPortal();
  }
  function gerarDocumento() {
    const json = JSON.stringify(D).replace(/</g, '\\u003c');
    const body = BODY_SRC.replace(/(<script type="application\/json" id="pp-data">)[\s\S]*?(<\/script>)/, (m, a, b) => a + json + b);
    return '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>' + HEAD_STYLE + '</style></head><body>' + body + '</body></html>';
  }
  function bindPortal() {
    $('#abrirPortal').addEventListener('click', abrirPortal);
    const box = $('#portal');
    box.addEventListener('submit', async (e) => {
      if (e.target.id !== 'pLogin') return;
      e.preventDefault();
      const login = $('#pUser').value.trim().toLowerCase(), pass = $('#pPass').value;
      if (window.PedidosPP && (await PedidosPP.pronto)) {
        try {
          const r = await PedidosPP.entrar(login, pass);
          if (!r.usuario.admin) { location.href = '/gestao'; return; }
          P.logado = r.usuario.id; P.usuario = r.usuario; P.aba = ABAS[0][0];
          store.sset('sessao', r.usuario.id); renderPortal();
        } catch (er) { $('#pErro').textContent = er.status === 401 ? 'Usuário ou senha incorretos.' : er.message; }
        return;
      }
      const u = (D.usuarios || []).find((x) => x.login.toLowerCase() === login);
      let ok = false;
      try { ok = !!(u && u.hash && (await sha256(u.salt + pass)) === u.hash); } catch (er) { ok = false; }
      if (!ok) { $('#pErro').textContent = 'Usuário ou senha incorretos.'; return; }
      if (!u.admin) { $('#pErro').textContent = 'Seu usuário não tem acesso de administrador.'; return; }
      P.logado = u.id; store.sset('sessao', u.id); renderPortal();
    });
    box.addEventListener('click', async (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.aba) { P.aba = t.dataset.aba; renderPortal(); return; }
      const acao = t.dataset.p;
      if (!acao) return;
      const i = +t.dataset.i;
      if (acao === 'sair-portal') { $('#portal').hidden = true; document.documentElement.style.overflow = ''; }
      else if (acao === 'ver-site') fecharPortal();
      else if (acao === 'logout') { if (P.sujo) { toast('Publique ou descarte as alterações antes de sair.'); return; } if (window.PedidosPP) PedidosPP.sair(); P.logado = null; P.usuario = null; store.sset('sessao', null); renderPortal(); }
      else if (acao === 'descartar') { P.sujo = false; location.reload(); }
      else if (acao === 'publicar') publicar();
      else if (acao === 'copiar-json') {
        const txt = JSON.stringify(D, null, 2);
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(() => toast('JSON copiado.'), () => toast('Não foi possível copiar neste navegador.'));
      } else if (acao === 'add-sabor') {
        const cat0 = P.filtroCat !== 'todas' ? P.filtroCat : D.categorias[0].id;
        D.sabores.unshift({ id: 'sabor-' + Date.now().toString(36), nome: 'Novo sabor', cat: cat0, ing: '', g: null, b: null });
        marcaSujo(); renderPortal();
      } else if (acao === 'add') {
        const col = t.dataset.col; const [o, k] = caminho(col); o[k].push(novoItem(col)); marcaSujo(); renderPortal();
      } else if (acao === 'del') {
        const col = t.dataset.col; const [o, k] = caminho(col);
        if (t.dataset.confirma !== '1') { t.dataset.confirma = '1'; t.textContent = 'Confirmar?'; setTimeout(() => { if (t.isConnected) { t.dataset.confirma = ''; t.textContent = 'Remover'; } }, 3000); return; }
        o[k].splice(i, 1); if (col === 'sabores') P.visual = null; marcaSujo(); renderPortal();
      } else if (acao === 'del-cat') {
        const c = D.categorias[i];
        if (D.sabores.some((s) => s.cat === c.id)) { toast('Mova ou remova os sabores desta categoria primeiro.'); return; }
        D.categorias.splice(i, 1); marcaSujo(); renderPortal();
      } else if (acao === 'mover') {
        const [o, k] = caminho(t.dataset.col); const arr = o[k]; const j = i + +t.dataset.d;
        if (j < 0 || j >= arr.length) return;
        [arr[i], arr[j]] = [arr[j], arr[i]]; marcaSujo(); renderPortal();
      } else if (acao === 'visual') { P.visual = i; renderPortal(); $('#portal').scrollTo({ top: 0, behavior: 'smooth' }); }
      else if (acao === 'vis-fechar') { P.visual = null; renderPortal(); }
      else if (acao === 'vis-add') { garanteVisual(i).itens.push({ k: 'oregano', q: 1 }); marcaSujo(); renderPortal(); }
      else if (acao === 'vis-del') { garanteVisual(i).itens.splice(+t.dataset.j, 1); marcaSujo(); renderPortal(); }
      else if (acao === 'vis-auto') { delete D.sabores[i].visual; marcaSujo(); renderPortal(); }
      else if (acao === 'tira-foto') { delete D.sabores[i].foto; delete D.sabores[i].fotoId; marcaSujo(); renderPortal(); }
      else if (acao === 'add-promo') {
        D.promocoes.unshift({ id: 'promo-' + Date.now().toString(36), nome: 'Nova promoção', descricao: '', ativa: false, quando: { dias: [], horaIni: '', horaFim: '', dataIni: '', dataFim: '', canal: 'todos', cupom: '' }, condicao: { tipo: 'itens', valorMin: 0, slots: [{ qtd: 1, tipo: 'pizza', tamanho: 'grande', categorias: [], sabores: [], itens: [], padrao: [] }] }, recompensa: { tipo: 'desconto_pct', valor: 10, itemId: '' }, regras: { acumula: false, prioridade: 5, maxPorPedido: 1 } });
        marcaSujo(); renderPortal();
      } else if (acao === 'add-slot') {
        D.promocoes[i].condicao.slots.push({ qtd: 1, tipo: 'item', tamanho: '', categorias: [], sabores: [], itens: [], padrao: [] }); marcaSujo(); renderPortal();
      } else if (acao === 'salva-senha') {
        const campo = $('[data-senha="' + i + '"]', box);
        const s = campo.value;
        if (s.length < 6) { toast('A senha precisa de pelo menos 6 caracteres.'); return; }
        const salt = Array.from(crypto.getRandomValues(new Uint8Array(12))).map((b) => b.toString(16).padStart(2, '0')).join('');
        D.usuarios[i].salt = salt; D.usuarios[i].hash = await sha256(salt + s);
        campo.value = ''; marcaSujo(); toast('Senha definida. Publique para valer.');
      }
    });
    const aplica = (e, rerender) => {
      const t = e.target;
      if (t.id === 'pBusca') { P.busca = t.value; const pos = t.selectionStart; renderPortal(); const nb = $('#pBusca'); nb.focus(); nb.setSelectionRange(pos, pos); return; }
      if (t.id === 'pFiltroCat') { P.filtroCat = t.value; renderPortal(); return; }
      if (t.dataset.lista) {
        const [o, k] = caminho(t.dataset.lista);
        const v = t.dataset.numval ? +t.value : t.value;
        o[k] = t.checked ? o[k].concat([v]) : o[k].filter((x) => x !== v);
        if (o.padrao) o.padrao = [];
        marcaSujo(); return;
      }
      if (!t.dataset.bind) return;
      const mv = t.dataset.bind.match(/^sabores\.(\d+)\.visual\./);
      if (mv) garanteVisual(+mv[1]);
      const [o, k] = caminho(t.dataset.bind);
      let v = t.type === 'checkbox' ? t.checked : t.value;
      if (t.dataset.num) v = t.value === '' ? null : +t.value;
      o[k] = v;
      if (k === 'tipo' && o.padrao) o.padrao = [];
      marcaSujo();
      if (mv) { desenhaPreviaVisual(); const m = $('.vis-modo'); if (m) m.textContent = 'manual'; }
      if (rerender && t.tagName === 'SELECT') renderPortal();
    };
    box.addEventListener('change', async (e) => {
      if (e.target.dataset.foto != null) {
        const i = +e.target.dataset.foto, f = e.target.files[0];
        if (!f) return;
        let assets = null;
        try { assets = window.claude && window.claude.use ? await window.claude.use('assets') : null; } catch (er) { assets = null; }
        if (!assets) { toast('Upload de foto disponível só no link do claude.ai, para editores.'); return; }
        try {
          toast('Enviando foto…');
          const r = await assets.upload(f);
          D.sabores[i].foto = r.url; D.sabores[i].fotoId = r.id;
          marcaSujo(); renderPortal(); toast('Foto enviada. Publique para valer.');
        } catch (er) { toast('Não deu para enviar a foto: ' + (er.code || er.message)); }
        return;
      }
      if (e.target.dataset.bind && e.target.type !== 'checkbox' && e.target.tagName !== 'SELECT') return;
      aplica(e, true);
    });
    box.addEventListener('input', (e) => {
      if (e.target.type === 'checkbox' || e.target.tagName === 'SELECT') return;
      if (e.target.id === 'pBusca' || e.target.dataset.bind) aplica(e, false);
    });
  }

  /* ================= inicialização ================= */
  function init() {
    renderStatus(); setInterval(renderStatus, 60000);
    renderTextos();
    heroMostra(0, false, anima);
    heroFlutuantes();
    CELULAR.addEventListener('change', ajustaHeroResponsivo);
    document.addEventListener('visibilitychange', sincronizaHeroMotion);
    renderPromos();
    M.massa = D.massas[0].id;
    renderEtapa(0); atualizaPalco(null);
    renderCardCats(); renderCardapio();
    renderEntregaSec(); renderFAQ();
    renderFab();
    bindMontador(); bindCardapio(); bindGaveta(); bindFAQ(); bindPortal();
    initForninho();
    $('#pista').addEventListener('click', (e) => { const b = e.target.closest('[data-combo]'); if (b) addCombo(b.dataset.combo); });
    $('#consulta').addEventListener('submit', consultaRapida);
    $('#cCep').addEventListener('input', (e) => { let v = e.target.value.replace(/\D/g, '').slice(0, 8); if (v.length > 5) v = v.slice(0, 5) + '-' + v.slice(5); e.target.value = v; });
    efeitos();
    zapNaoAtrapalha();
    heroIntro();
    if (anima) { setTimeout(() => heroMostra(0, true), 350); heroCiclo(); }
    promoInterativo();
    if (location.hash === '#portal') abrirPortal();
    if (window.PedidosPP) {
      PedidosPP.iniciar({ D: () => D, LOGOS, miniSVG, anima, toast });
      const balcaoHash = async () => {
        if (location.hash !== '#balcao') return;
        history.replaceState(null, '', location.pathname + location.search);
        if (!(await PedidosPP.pronto)) return;
        if (!(await PedidosPP.sessao())) { location.href = '/gestao'; return; }
        iniciaBalcao();
      };
      balcaoHash();
      window.addEventListener('hashchange', balcaoHash);
      const acompanhaHash = () => { const m = location.hash.match(/^#acompanhar\/([A-Za-z0-9]{16,40})$/); if (m) PedidosPP.acompanhar(m[1]); else PedidosPP.fecharAcompanhamento(); };
      PedidosPP.pronto.then(acompanhaHash);
      window.addEventListener('hashchange', acompanhaHash);
      $('#balcaoSair').addEventListener('click', () => saiBalcao(true));
      if (window.ContaPP) ContaPP.iniciar({ D: () => D, LOGOS, miniSVG, anima, toast, temSabor: (id) => !!sabor(id), pedirDeNovo, abrirPedido: abrirPedidoRepetido, abrirMontador: () => { if (CELULAR.matches) abrirMontador(); else { const m = $('#montar'); if (m) m.scrollIntoView({ behavior: REDUZ ? 'auto' : 'smooth' }); } }, aoEntrar: contaEntrou, aoSair: () => { if ($('#gaveta').classList.contains('aberto')) renderGaveta(); } });
    }
    window.addEventListener('load', () => { if (window.ScrollTrigger) window.ScrollTrigger.refresh(); });
  }
  init();
})();
