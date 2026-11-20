// Ambiente de demonstração do vídeo (banco e servidor próprios, nada do sistema de verdade).
//   node gravacao/ambiente.mjs site      → cópia das páginas em trabalho/site (aberto agora, sem "preço exemplo")
//   node gravacao/ambiente.mjs dados     → histórico de 90 dias, pedidos de hoje, equipe, entregadores, contas, rotas
// O servidor de demonstração roda com PAGINA=trabalho/site/index.html na porta 5301 (veja COMO-REFAZER.md).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const V = path.resolve(import.meta.dirname, '..');
const APP = path.resolve(V, '..', 'prototipo');
const TRAB = path.join(V, 'trabalho');
const SITE = path.join(TRAB, 'site');
const B = 'http://localhost:5301';
const MAILPIT = 'http://127.0.0.1:8035';
const BANCO = 'pp-video-banco';
const SENHA_ADMIN = 'demo-video-2026'; // só deste banco de demonstração
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const sql = (c) => execFileSync('docker', ['exec', BANCO, 'psql', '-U', 'postgres', '-d', 'pizzaria', '-tAc', c]).toString().trim();
const RE_DADOS = /(<script type="application\/json" id="pp-data">)([\s\S]*?)(<\/script>)/;

/* ---------- 1) cópia das páginas ---------- */
function copiaSite() {
  fs.mkdirSync(SITE, { recursive: true });
  for (const f of ['index.html', 'gestao.html', 'motoboy.html']) {
    let h = fs.readFileSync(path.join(APP, 'dist', f), 'utf8');
    h = h.replace(RE_DADOS, (m, a, json, z) => {
      const d = JSON.parse(json);
      if (d.config) { d.config.statusManual = 'aberto'; d.config.modoTeste = false; d.config.whatsapp = '1636154495'; } // no vídeo, o telefone fixo público da pizzaria
      for (const k of ['bordas', 'adicionais', 'massas']) (d[k] || []).forEach((x) => delete x.exemplo);
      return a + JSON.stringify(d).replace(/</g, '\\u003c') + z;
    });
    fs.writeFileSync(path.join(SITE, f), h);
  }
  if (fs.existsSync(path.join(APP, 'dist', 'entregador.apk'))) fs.copyFileSync(path.join(APP, 'dist', 'entregador.apk'), path.join(SITE, 'entregador.apk'));
  console.log('páginas de demonstração em ' + SITE);
}

/* ---------- 2) dados ---------- */
function cliente() {
  const jar = {};
  const req = async (met, url, corpo, extra = {}) => {
    const ck = Object.entries(jar).filter(([, v]) => v).map(([k, v]) => k + '=' + v).join('; ');
    const r = await fetch(B + url, { method: met, headers: Object.assign(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}, ck ? { Cookie: ck } : {}, extra), body: corpo !== undefined ? JSON.stringify(corpo) : undefined });
    for (const sc of r.headers.getSetCookie()) { const [kv] = sc.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = /Max-Age=0/.test(sc) ? '' : kv.slice(i + 1); }
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) { j = t; }
    if (r.status >= 400) throw new Error(met + ' ' + url + ' → ' + r.status + ' ' + t.slice(0, 200));
    return j;
  };
  return { req, jar };
}
async function codigoDe(email, depois) {
  for (let i = 0; i < 60; i++) {
    const j = await (await fetch(MAILPIT + '/api/v1/messages?limit=50')).json();
    const m = (j.messages || []).filter((x) => (x.To || []).some((t) => t.Address === email) && Date.parse(x.Created) >= depois).sort((a, b) => Date.parse(b.Created) - Date.parse(a.Created))[0];
    if (m) return m.Subject.match(/^(\d{6})/)[1];
    await espera(200);
  }
  throw new Error('o código não chegou para ' + email);
}
async function rotaOsrm(de, para) {
  const u = 'https://router.project-osrm.org/route/v1/driving/' + de.lng + ',' + de.lat + ';' + para.lng + ',' + para.lat + '?overview=full&geometries=geojson';
  const j = await (await fetch(u, { headers: { 'User-Agent': 'pizzaria-pereira-video-demo' } })).json();
  if (!j.routes || !j.routes[0]) throw new Error('rota não encontrada');
  return { metros: j.routes[0].distance, segundos: j.routes[0].duration, pontos: j.routes[0].geometry.coordinates.map(([lng, lat]) => ({ lat, lng })) };
}

async function dados() {
  const D = JSON.parse(fs.readFileSync(path.join(SITE, 'index.html'), 'utf8').match(RE_DADOS)[2]);
  const precos = require(path.join(APP, 'precos.js'))(D);
  const adm = cliente();
  await adm.req('POST', '/api/login', { login: 'admin', senha: SENHA_ADMIN });
  const lojaGeo = (await adm.req('GET', '/api/config')).lojaGeo;
  if (!lojaGeo) throw new Error('sem lojaGeo (importe a base do IBGE antes)');

  // histórico: 90 dias de pedidos fictícios, que passam a contar como pedidos normais (sem a faixa "demonstração")
  if (!+sql('SELECT count(*) FROM pedidos')) {
    const r = await adm.req('POST', '/api/demo', {});
    sql('UPDATE pedidos SET demo = false');
    console.log('histórico: ' + r.inseridos + ' pedidos de 90 dias');
  }

  // equipe (nomes fictícios), cada um já com a própria senha
  const equipe = [['Ana Pereira', 'ana', true], ['Carlos Mendes', 'carlos', false], ['Bianca Rocha', 'bianca', false], ['Diego Ramos', 'diego', false]];
  const ja = (await adm.req('GET', '/api/equipe')).usuarios.map((u) => u.login);
  for (const [nome, login, admin] of equipe) if (!ja.includes(login)) await adm.req('POST', '/api/equipe', { nome, login, admin });
  // ninguém da demonstração entra de verdade: só marca que já criaram a senha (sem o selo "falta criar a senha")
  sql("UPDATE equipe SET trocar_senha = false");
  sql("UPDATE equipe SET nome = 'Thainá Pereira' WHERE login = 'admin'");
  sql("UPDATE equipe SET ultimo_acesso = now() - interval '25 minutes' WHERE login IN ('carlos','bianca')");
  sql("UPDATE equipe SET ultimo_acesso = now() - interval '3 days' WHERE login = 'diego'");

  // entregadores: João (o celular do vídeo) e Rafael (simulado, já na rua)
  const ents = (await adm.req('GET', '/api/entregadores')).entregadores || [];
  const acha = (n) => ents.find((e) => e.nome === n);
  const joao = acha('João Silva') || (await adm.req('POST', '/api/entregadores', { nome: 'João Silva', fone: '(16) 99700-1122' })).entregador || acha('João Silva');
  const rafael = acha('Rafael Souza') || (await adm.req('POST', '/api/entregadores', { nome: 'Rafael Souza', fone: '(16) 99700-3344' })).entregador || acha('Rafael Souza');
  const idDe = async (n) => ((await adm.req('GET', '/api/entregadores')).entregadores || []).find((e) => e.nome === n).id;
  const idJoao = joao && joao.id ? joao.id : await idDe('João Silva');
  const idRafael = rafael && rafael.id ? rafael.id : await idDe('Rafael Souza');
  const codJoao = (await adm.req('POST', '/api/entregadores/' + idJoao + '/parear')).codigo;
  const codRafael = (await adm.req('POST', '/api/entregadores/' + idRafael + '/parear')).codigo;
  const motoRafael = cliente();
  await motoRafael.req('POST', '/api/motoboy/parear', { codigo: codRafael, aparelho: 'Moto G (demonstração)' });
  await motoRafael.req('POST', '/api/motoboy/jornada', { acao: 'iniciar' });

  // contas de clientes (código por email, como no site)
  async function conta(nome, email, fone, ofertas) {
    if (+sql("SELECT count(*) FROM contas WHERE email = '" + email + "'")) return;
    const t0 = Date.now();
    const c = cliente();
    const r = await c.req('POST', '/api/conta/cadastro', { nome, email, fone, ofertas });
    await c.req('POST', '/api/conta/verificar', { desafio: r.desafio, codigo: await codigoDe(email, t0) });
  }
  await conta('Juliana Martins', 'juliana.martins@exemplo.com.br', '(16) 99123-4567', true);
  for (const [n, e, f, o] of [['Paulo Henrique Dias', 'paulo.dias@exemplo.com.br', '(16) 99234-5678', true], ['Marina Lopes', 'marina.lopes@exemplo.com.br', '(16) 99345-6789', true], ['Eduardo Nunes', 'eduardo.nunes@exemplo.com.br', '(16) 99456-7890', false]]) await conta(n, e, f, o);

  // pedidos de hoje (valores pela própria conta do servidor: nenhum aviso de conferência)
  const sab = (nome) => { const s = D.sabores.find((x) => x.nome.toLowerCase() === nome.toLowerCase()); if (!s) throw new Error('sabor ' + nome); return s.id; };
  const ad = (nome) => { const a = D.adicionais.find((x) => x.nome.toLowerCase().startsWith(nome.toLowerCase())); if (!a) throw new Error('item ' + nome); return a; };
  const pizza = (tam, sabores, borda = 'sem', qtd = 1) => ({ qtd, tipo: 'pizza', nome: 'Pizza ' + (tam === 'broto' ? 'Broto' : 'Grande'), detalhe: sabores.map((s) => (sabores.length > 1 ? '½ ' : '') + s).join(' + ') + (borda !== 'sem' ? ' · borda ' + borda : ''), sabores: sabores.map(sab), tamanho: tam, borda, massa: 'tradicional', obs: '' });
  const item = (nome, qtd = 1) => { const a = ad(nome); return { qtd, tipo: 'item', nome: a.nome, itemId: a.id }; };
  async function geoDe(rua, numero, cep) {
    const r = await (await fetch(B + '/api/geo/endereco?rua=' + encodeURIComponent(rua) + '&numero=' + numero + '&cep=' + cep + '&cidade=' + encodeURIComponent('Ribeirão Preto'))).json();
    if (!r.achou) throw new Error('endereço ' + rua + ', ' + numero);
    return { lat: r.lat, lng: r.lng, precisao: r.precisao };
  }
  const kmEntre = (a, b) => { const R = (g) => g * Math.PI / 180; const h = Math.sin(R(b.lat - a.lat) / 2) ** 2 + Math.cos(R(a.lat)) * Math.cos(R(b.lat)) * Math.sin(R(b.lng - a.lng) / 2) ** 2; return 2 * 6371 * Math.asin(Math.sqrt(h)); };
  async function pedido({ nome, fone, modo, end, itens, pag, troco }) {
    const tok = Array.from({ length: 22 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'[Math.floor(Math.random() * 56)]).join('');
    const v = { token: tok, codigo: '#' + Math.random().toString(36).slice(2, 7).toUpperCase(), modo, canal: 'site', cliente: { nome, fone }, itens: itens.map((i) => Object.assign({ valor: 0, obs: '' }, i)), promocoes: [], subtotal: 0, desconto: 0, taxa: 0, freteGratis: false, total: 0, cupom: '', km: null, geo: null, geoPrec: null };
    if (modo === 'entrega') {
      const g = await geoDe(end.rua, end.numero, end.cep);
      v.endereco = { cep: end.cep, rua: end.rua, numero: String(end.numero), compl: '', bairro: end.bairro, cidade: 'Ribeirão Preto/SP', ref: '' };
      v.geo = { lat: g.lat, lng: g.lng }; v.geoPrec = g.precisao; v.km = Math.round(kmEntre(lojaGeo, g) * 1.35 * 10) / 10;
    }
    const c = precos.confere(v, Date.now(), lojaGeo);
    Object.assign(v, c.oficial);
    const corpo = Object.assign({}, v, { pagamento: { forma: pag, trocoPara: troco || null, semTroco: false }, obs: '' });
    const r = await cliente().req('POST', '/api/pedidos', corpo);
    const p = (await adm.req('GET', '/api/pedidos')).pedidos.find((x) => x.token === tok);
    return Object.assign(p, { codigoSite: r.codigo });
  }
  const passa = async (p, ...sts) => { for (const s of sts) await adm.req('PATCH', '/api/pedidos/' + p.id, typeof s === 'string' ? { status: s } : s); };
  // gravando em outro dia: os pedidos abertos dos dias anteriores viram concluídos (não aparecem com o entregador)
  // e os das gravações antigas (Juliana e Fernanda) saem
  const DIA = "(now() AT TIME ZONE 'America/Sao_Paulo' - interval '5 hours')::date";
  sql("DELETE FROM pedidos WHERE dados->'cliente'->>'nome' IN ('Juliana Martins', 'Fernanda Costa') AND dia < " + DIA);
  sql("UPDATE pedidos SET status = 'concluido' WHERE dia < " + DIA + " AND status IN ('novo', 'preparo', 'forno', 'saiu', 'pronto')");
  const hoje = +sql("SELECT count(*) FROM pedidos WHERE dia = " + DIA);
  let rotaRafael = null;
  if (!hoje) {
    const p1 = await pedido({ nome: 'Carla Souza', fone: '(16) 99812-1001', modo: 'entrega', end: { rua: 'Rua Joaquim Graton', numero: 106, cep: '14061-070', bairro: 'Vila Mariana' }, itens: [pizza('grande', ['Calabresa Especial', 'Portuguesa']), item('Coca-Cola 2L')], pag: 'pix' });
    await passa(p1, 'preparo', 'forno', { status: 'saiu', entregador: 'Rafael Souza' }, { status: 'concluido', pago: true });
    const p2 = await pedido({ nome: 'Lucas Andrade', fone: '(16) 99812-1002', modo: 'retirada', itens: [pizza('broto', ['Chocolate']), pizza('grande', ['Frango com Requeijão'])], pag: 'credito' });
    await passa(p2, 'preparo', 'forno', 'pronto');
    const p3 = await pedido({ nome: 'Rodrigo Alves', fone: '(16) 99812-1003', modo: 'entrega', end: { rua: 'Rua Francisco Buonvicini', numero: 426, cep: '14060-380', bairro: 'Jardim Paulistano' }, itens: [pizza('grande', ['Alemanha']), item('Guaraná')], pag: 'dinheiro', troco: 100 });
    await passa(p3, 'preparo', 'forno', { status: 'saiu', entregadorId: idRafael });
    const p4 = await pedido({ nome: 'Marcos Vinícius', fone: '(16) 99812-1004', modo: 'entrega', end: { rua: 'Rua Plinio Santos', numero: 206, cep: '14060-500', bairro: 'Jardim Paiva' }, itens: [pizza('grande', ['Brasil', 'Estados Unidos'], 'cheddar'), item('Coca-Cola Zero')], pag: 'debito' });
    await passa(p4, 'preparo', 'forno', { previsaoMin: 25 });
    const p5 = await pedido({ nome: 'Patrícia Lima', fone: '(16) 99812-1005', modo: 'retirada', itens: [pizza('grande', ['Mussarela'])], pag: 'pix' });
    await passa(p5, 'preparo');
    // um pedido com o preço mexido no navegador (para a cena da conferência)
    const t = Array.from({ length: 22 }, () => 'abcdefghijkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 32)]).join('');
    await cliente().req('POST', '/api/pedidos', { token: t, codigo: '#K7Q2M', modo: 'retirada', cliente: { nome: 'Teste Desconfiado', fone: '(16) 99812-1006' }, itens: [Object.assign(pizza('grande', ['Alemanha']), { valor: 10 })], promocoes: [], subtotal: 10, desconto: 0, taxa: 0, total: 10, pagamento: { forma: 'pix' } });
    // rota do Rafael (pedido do Rodrigo)
    const p3g = (await adm.req('GET', '/api/pedidos/' + p3.id)).geo;
    rotaRafael = await rotaOsrm(lojaGeo, p3g);
    console.log('pedidos de hoje criados');
  }

  // endereço do pedido principal do vídeo e a rota da moto até lá
  const destino = await geoDe('Rua Rio Araguaia', 790, '14060-260');
  const rota = await rotaOsrm(lojaGeo, destino);
  const estado = { codJoao, idJoao, idRafael, motoRafael: motoRafael.jar.pp_moto, lojaGeo, destino, rota, rotaRafael: rotaRafael || (fs.existsSync(path.join(TRAB, 'estado.json')) ? JSON.parse(fs.readFileSync(path.join(TRAB, 'estado.json'), 'utf8')).rotaRafael : null) };
  fs.writeFileSync(path.join(TRAB, 'estado.json'), JSON.stringify(estado, null, 1));
  console.log('rota da entrega: ' + (rota.metros / 1000).toFixed(1) + ' km, ' + rota.pontos.length + ' pontos; código do João: guardado em trabalho/estado.json');
}

const cmd = process.argv[2];
if (cmd === 'site') copiaSite();
else if (cmd === 'dados') await dados();
else console.log('use: site | dados');
