// Gravação do vídeo: um Chrome sem janela abre o palco (proxy em 5310), comanda as telas de verdade (site, gestão,
// app do entregador) com cursor visível, e grava cada quadro (screencast do DevTools) com o horário exato.
//   node gravacao/gravar.mjs            → grava tudo em trabalho/quadros + trabalho/linha-do-tempo.json
//   node gravacao/gravar.mjs --ensaio   → roda as cenas sem gravar (para conferir), com capturas em trabalho/ensaio
//   --ate=<cena>                        → para depois dessa cena
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const V = path.resolve(import.meta.dirname, '..');
const TRAB = path.join(V, 'trabalho');
const QUADROS = path.join(TRAB, 'quadros');
const ENSAIO = process.argv.includes('--ensaio');
const ATE = (process.argv.find((a) => a.startsWith('--ate=')) || '').slice(6);
const estado = JSON.parse(fs.readFileSync(path.join(TRAB, 'estado.json'), 'utf8'));
const roteiro = JSON.parse(fs.readFileSync(path.join(V, 'roteiro.json'), 'utf8'));
const DUR = JSON.parse(fs.readFileSync(path.join(TRAB, 'narracao', 'duracoes.json'), 'utf8')).duracoes;
const NARR_OFF = 0.35;              // a fala começa 0,35 s depois do início da cena
const PAUSA = 0.12;                 // respiro a mais entre dois trechos seguidos da fala
// a fala de cada cena vem em trechos (separados por | no roteiro); DUR[id] = duração de cada trecho
const TRECHOS = Object.fromEntries(roteiro.cenas.map((c) => [c.id, c.voz.split('|').map((s) => s.trim())]));
for (const c of roteiro.cenas) if (!Array.isArray(DUR[c.id]) || DUR[c.id].length !== TRECHOS[c.id].length) throw new Error('narração desatualizada na cena ' + c.id + ': rode node gravacao/narracao.mjs');
const PALCO = 'http://localhost:5310/palco/';
const LOJA = 'http://localhost:5310/', GEST = 'http://localhost:5310/gestao', MOTO = 'http://localhost:5310/motoboy';
const API = 'http://localhost:5301';
const SENHA_ADMIN = 'demo-video-2026';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

/* ---------------- Chrome e DevTools ---------------- */
const PORTA = 9555;
const perfil = path.join(TRAB, 'perfil-chrome');
fs.rmSync(perfil, { recursive: true, force: true });
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=' + PORTA, '--user-data-dir=' + perfil, '--window-size=1920,1080', '--hide-scrollbars', '--num-raster-threads=4', '--disable-features=UseEcoQoSForBackgroundProcess,IntensiveWakeUpThrottling', '--mute-audio',
  '--no-first-run', '--no-default-browser-check', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--force-color-profile=srgb', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
let alvo;
for (let i = 0; i < 100 && !alvo; i++) { try { alvo = (await (await fetch('http://127.0.0.1:' + PORTA + '/json/list')).json()).find((x) => x.type === 'page'); } catch (e) { await espera(150); } }
const versao = await (await fetch('http://127.0.0.1:' + PORTA + '/json/version')).json();
function conecta(url) {
  const ws = new WebSocket(url);
  let id = 0; const pend = new Map(); const ouv = [];
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.j(new Error(m.error.message)) : p.r(m.result); } else ouv.forEach((f) => f(m)); };
  const pronto = new Promise((r) => { ws.onopen = r; });
  // sessionId: comandos para as telas de outros sites (cada uma roda num processo próprio do Chrome)
  const send = (method, params = {}, sessionId) => new Promise((r, j) => { const i = ++id; pend.set(i, { r, j }); ws.send(JSON.stringify(Object.assign({ id: i, method, params }, sessionId ? { sessionId } : {}))); });
  return { pronto, send, ouv, ws };
}
const pg = conecta(alvo.webSocketDebuggerUrl), nav = conecta(versao.webSocketDebuggerUrl);
await pg.pronto; await nav.pronto;
const send = pg.send;
let gps = Object.assign({}, estado.lojaGeo);
const erros = [];
const sessoes = new Map();   // frameId da tela (= targetId) -> sessionId
const contextos = new Map(); // frameId -> { ctx, sessao }
pg.ouv.push((m) => {
  if (m.method === 'Target.attachedToTarget' && m.params.targetInfo.type === 'iframe') {
    const sid = m.params.sessionId;
    sessoes.set(m.params.targetInfo.targetId, sid);
    send('Runtime.enable', {}, sid).catch(() => {});
    send('Emulation.setGeolocationOverride', { latitude: gps.lat, longitude: gps.lng, accuracy: 8 }, sid).catch(() => {});
  }
  if (m.method === 'Target.detachedFromTarget') for (const [k, v] of sessoes) if (v === m.params.sessionId) sessoes.delete(k);
  if (m.method === 'Runtime.executionContextCreated') { const c = m.params.context; if (c.auxData && c.auxData.isDefault) contextos.set(c.auxData.frameId, { ctx: c.id, sessao: m.sessionId || null }); }
  if (m.method === 'Runtime.exceptionThrown') erros.push((m.params.exceptionDetails.exception || {}).description || m.params.exceptionDetails.text);
});
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await nav.send('Browser.grantPermissions', { origin: 'http://localhost:5310', permissions: ['geolocation'] });
// API como administradora, direto do Node (a gestão na tela só entra depois do pedido da cliente)
let cookieAdm = '';
async function apiNode(met, url, corpo) {
  if (!cookieAdm) { const r = await fetch(API + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: 'admin', senha: SENHA_ADMIN }) }); cookieAdm = (r.headers.getSetCookie()[0] || '').split(';')[0]; }
  const r = await fetch(API + url, { method: met, headers: Object.assign({ Cookie: cookieAdm }, corpo ? { 'Content-Type': 'application/json' } : {}), body: corpo ? JSON.stringify(corpo) : undefined });
  return r.json();
}

/* ---------------- avaliar no palco e dentro de cada tela ---------------- */
async function avalia(expr, contextId, sessao) {
  const r = await send('Runtime.evaluate', Object.assign({ expression: expr, awaitPromise: true, returnByValue: true }, contextId ? { contextId } : {}), sessao || undefined);
  if (r.exceptionDetails) throw new Error(((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text) + '\n  em: ' + expr.slice(0, 160));
  return r.result.value;
}
const palco = (expr) => avalia(expr);
// a tela pelo <iframe> do palco: o DevTools diz qual quadro está dentro dele (vale também para telas de outro site,
// que o Chrome roda em processo próprio e não aparecem na árvore da página principal)
const frames = new Map();
async function idFrame(nome) {
  if (frames.has(nome)) return frames.get(nome);
  const doc = await send('DOM.getDocument', { depth: 0 });
  const q = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'iframe[name="' + nome + '"]' });
  if (!q.nodeId) throw new Error('sem a tela ' + nome);
  const d = await send('DOM.describeNode', { nodeId: q.nodeId });
  if (!d.node.frameId) throw new Error('sem a tela ' + nome);
  frames.set(nome, d.node.frameId);
  return d.node.frameId;
}
async function emF(nome, expr) {
  for (let i = 0; ; i++) {
    try { const c = contextos.get(await idFrame(nome)); if (!c) throw new Error('sem contexto'); return await avalia(expr, c.ctx, c.sessao); }
    catch (e) { if (i >= 40 || !/contexto|Cannot find context|Execution context was destroyed|sem a tela|No session|Session with given id/i.test(e.message)) throw e; await espera(200); }
  }
}
const ate = async (nome, expr, ms = 10000) => { const t0 = Date.now(); let ult = null; while (Date.now() - t0 < ms) { try { if (await emF(nome, expr)) { if (Date.now() - t0 > 1500) log('  espera longa (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s) em ' + nome + ': ' + expr.slice(0, 90)); return true; } } catch (e) { ult = e; } await espera(120); } let tela = ''; try { tela = await emF(nome, "location.href + ' | ' + document.body.innerText.replace(/\s+/g, ' ').slice(0, 300)"); } catch (e) { tela = 'sem acesso: ' + e.message; } throw new Error('não apareceu em ' + nome + ': ' + expr + '\n  tela: ' + tela + (ult ? '\n  último erro: ' + ult.message.slice(0, 200) : '')); };

/* ---------------- cursor, cliques e digitação ---------------- */
let cur = { x: 960, y: 600 };
async function cursorTipo(t) { await palco("P.cursorTipo(" + JSON.stringify(t) + ")"); }
async function mover(x, y, ms = 650) {
  // o palco anima o cursor sozinho, quadro a quadro (liso mesmo com a página ocupada); daqui vão só alguns
  // movimentos do mouse pelo mesmo caminho, para o hover das telas
  const de = Object.assign({}, cur), t0 = Date.now();
  await palco('P.cursorVai(' + x.toFixed(1) + ',' + y.toFixed(1) + ',' + ms + ')');
  for (;;) {
    const f = Math.min(1, (Date.now() - t0) / ms), e = f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2;
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: de.x + (x - de.x) * e, y: de.y + (y - de.y) * e });
    if (f >= 1) break;
    await espera(Math.max(0, Math.min(70, t0 + ms - Date.now())));
  }
  cur = { x, y };
}
async function ponto(nome, sel, opts = {}) {
  const r = await emF(nome, '(async () => { const e = document.querySelector(' + JSON.stringify(sel) + '); if (!e) return null; let b = e.getBoundingClientRect();' +
    ' if (!' + !!opts.semRolar + ' && (b.top < 60 || b.bottom > innerHeight - 70)) { e.scrollIntoView({ block: "center", behavior: "smooth" }); await new Promise((r) => setTimeout(r, 650)); b = e.getBoundingClientRect(); }' +
    ' return { x: b.left + b.width * ' + (opts.fx || 0.5) + ', y: b.top + b.height * ' + (opts.fy || 0.5) + ' }; })()');
  if (!r) throw new Error('não achei ' + sel + ' em ' + nome);
  const f = await palco("P.frame('" + nome + "')");
  return { x: f.x + r.x * f.s, y: f.y + r.y * f.s };
}
async function clicar(nome, sel, opts = {}) {
  const tc = Date.now();
  // campo em foco perde o foco antes (o site redesenha a etapa no blur e o toque se perderia)
  if (await emF(nome, "(() => { const a = document.activeElement; if (a && /INPUT|TEXTAREA/.test(a.tagName) && !a.matches(" + JSON.stringify(sel) + ")) { a.blur(); return 1; } return 0; })()")) await espera(220);
  const p = await ponto(nome, sel, opts);
  await mover(p.x, p.y, opts.ms || 430);
  await espera(opts.pausa || 120);
  // confere a posição no último instante (a tela pode ter deslizado ou redesenhado no caminho)
  const p2 = await ponto(nome, sel, Object.assign({}, opts, { semRolar: true }));
  if (opts.dbg) log('  dbg ' + sel + ': p=' + JSON.stringify(p) + ' p2=' + JSON.stringify(p2) + ' frame=' + JSON.stringify(await palco("P.frame('" + nome + "')")) + ' el=' + JSON.stringify(await emF(nome, '(() => { const e = document.querySelector(' + JSON.stringify(sel) + '); const b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height, document.querySelectorAll(' + JSON.stringify(sel) + ').length, innerHeight, scrollY]; })()')));
  if (Math.hypot(p2.x - p.x, p2.y - p.y) > 3) { await mover(p2.x, p2.y, 160); p.x = p2.x; p.y = p2.y; }
  await palco('P.clique(' + p.x + ',' + p.y + ')');
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await espera(opts.segura || 70);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await espera(opts.depois == null ? 260 : opts.depois);
  if (Date.now() - tc > 2500) log("  clique demorado (" + ((Date.now() - tc) / 1000).toFixed(1) + " s) em " + nome + ": " + sel);
}
// o primeiro elemento VISÍVEL que bate com o seletor (fora de <details> fechado), marcado para o clique
async function visivel(nome, sel) {
  const ok = await emF(nome, "(() => { document.querySelectorAll('[data-video-alvo]').forEach((x) => x.removeAttribute('data-video-alvo')); const r = Array.from(document.querySelectorAll(" + JSON.stringify(sel) + ")).find((x) => { const b = x.getBoundingClientRect(); return b.width > 0 && b.height > 0 && !x.closest('details:not([open])'); }); if (r) r.setAttribute('data-video-alvo', '1'); return !!r; })()");
  if (!ok) throw new Error("nada visível para " + sel + " em " + nome);
  return "[data-video-alvo]";
}
async function tecla(key) {
  const cod = { Escape: 27, Enter: 13, Tab: 9 }[key] || 0;
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: cod });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: cod });
}
async function digitar(texto, ms = 70) { for (const ch of texto) { await send('Input.insertText', { text: ch }); await espera(ms * (0.6 + Math.random() * 0.8)); } }
// valor de um <select> (o menu nativo não aparece na gravação): clica em cima e escolhe por código
async function escolher(nome, sel, valor) {
  await clicar(nome, sel, { depois: 250 });
  await emF(nome, '(() => { const s = document.querySelector(' + JSON.stringify(sel) + '); s.value = ' + JSON.stringify(String(valor)) + '; s.dispatchEvent(new Event("change", { bubbles: true })); s.blur(); return 1; })()');
}
async function rolar(nome, alvoSel, bloco = 'start') {
  await emF(nome, '(() => { const e = document.querySelector(' + JSON.stringify(alvoSel) + '); if (e) e.scrollIntoView({ behavior: "smooth", block: "' + bloco + '" }); return 1; })()');
}
// rolagem da página inteira em ritmo fixo, quadro a quadro (a rolagem suave do Chrome dispara rápido demais numa
// página longa, e o desenho das fotos que vão aparecendo engasga)
async function rolarJanela(nome, alvoSel, ms = 1400) {
  await emF(nome, '(() => { const e = document.querySelector(' + JSON.stringify(alvoSel) + '); if (!e) return 0;' +
    ' const de = scrollY, alvo = Math.max(0, Math.min(de + e.getBoundingClientRect().top, document.documentElement.scrollHeight - innerHeight)), t0 = performance.now();' +
    ' const passo = (t) => { const f = Math.min(1, (t - t0) / ' + ms + '), k = (1 - Math.cos(Math.PI * f)) / 2; scrollTo({ top: de + (alvo - de) * k, behavior: "instant" }); if (f < 1) requestAnimationFrame(passo); };' +
    ' requestAnimationFrame(passo); return 1; })()');
}

/* ---------------- GPS do entregador ---------------- */
async function poeGps(p) {
  gps = p;
  const o = { latitude: p.lat, longitude: p.lng, accuracy: 8 };
  await send('Emulation.setGeolocationOverride', o);
  for (const sid of sessoes.values()) await send('Emulation.setGeolocationOverride', o, sid).catch(() => {});
}
const rad = (g) => g * Math.PI / 180;
const metros = (a, b) => { const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2; return 2 * 6371000 * Math.asin(Math.sqrt(h)); };
function aoLongo(pontos, f) { // posição numa fração f (0..1) do caminho
  const seg = []; let tot = 0;
  for (let i = 1; i < pontos.length; i++) { const d = metros(pontos[i - 1], pontos[i]); seg.push(d); tot += d; }
  let alvo = tot * Math.min(1, Math.max(0, f));
  for (let i = 0; i < seg.length; i++) { if (alvo <= seg[i]) { const k = seg[i] ? alvo / seg[i] : 0; return { lat: pontos[i].lat + (pontos[i + 1].lat - pontos[i].lat) * k, lng: pontos[i].lng + (pontos[i + 1].lng - pontos[i].lng) * k, rumo: (Math.atan2(rad(pontos[i + 1].lng - pontos[i].lng) * Math.cos(rad(pontos[i].lat)), rad(pontos[i + 1].lat - pontos[i].lat)) * 180 / Math.PI + 360) % 360 }; } alvo -= seg[i]; }
  const u = pontos[pontos.length - 1]; return { lat: u.lat, lng: u.lng, rumo: 0 };
}
async function posta(cookie, p) {
  try { await fetch(API + '/api/motoboy/posicao', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: 'pp_moto=' + cookie }, body: JSON.stringify({ pontos: [{ t: Date.now(), lat: p.lat, lng: p.lng, precisao: 8, velocidade: 9, rumo: p.rumo }], bateria: 78 }) }); } catch (e) { /* segue */ }
}
// Rafael anda devagar pela rota dele o tempo todo (para o mapa da gestão ter dois entregadores)
let rafaelF = 0.15;
const rafael = setInterval(() => { if (!estado.rotaRafael) return; rafaelF = Math.min(0.92, rafaelF + 0.0016); posta(estado.motoRafael, aoLongo(estado.rotaRafael.pontos, rafaelF)); }, 1500);

/* ---------------- gravação (screencast) ---------------- */
const quadros = [];
let gravando = false, seq = 0, t0Grav = 0;
pg.ouv.push((m) => {
  if (m.method !== 'Page.screencastFrame') return;
  send('Page.screencastFrameAck', { sessionId: m.params.sessionId }).catch(() => {});
  if (!gravando) return;
  const n = ++seq, arq = path.join(QUADROS, 'q' + String(n).padStart(6, '0') + '.jpg');
  quadros.push({ n, t: m.params.metadata.timestamp });
  fs.writeFile(arq, Buffer.from(m.params.data, 'base64'), () => {});
});
async function comecaGravar() {
  fs.rmSync(QUADROS, { recursive: true, force: true }); fs.mkdirSync(QUADROS, { recursive: true });
  if (!ENSAIO) await send('Page.startScreencast', { format: 'jpeg', quality: 86, everyNthFrame: 2 });
  gravando = !ENSAIO; t0Grav = Date.now() / 1000;
}
const agora = () => Date.now() / 1000 - t0Grav;
const linha = [];
let cenaT0 = 0;
async function aos(s) { const falta = (cenaT0 + s - agora()) * 1000; if (falta > 0) await espera(falta); }
// trecho k da fala: começa quando o anterior termina, ou mais tarde, se a cena chamar fala(k) quando a tela chega
// naquele ponto. Assim a voz acompanha o que aparece, sem correr na frente.
let CUE = [];
function fala(k) { CUE[k] = agora() - cenaT0; }
function iniTrecho(id, k) { let ini = 0, fim = NARR_OFF - PAUSA; for (let i = 0; i <= k; i++) { ini = Math.max(fim + PAUSA, CUE[i] ?? -Infinity); fim = ini + DUR[id][i]; } return ini; }
const fimTrecho = (id, k) => iniTrecho(id, k) + DUR[id][k];
const fimFala = (id) => fimTrecho(id, DUR[id].length - 1);
// instante (dentro da cena) em que a voz diz a palavra
function marca(id, palavra) {
  const p = palavra.toLowerCase();
  for (let k = 0; k < TRECHOS[id].length; k++) { const t = TRECHOS[id][k], i = t.toLowerCase().indexOf(p); if (i >= 0) return iniTrecho(id, k) + (i / t.length) * DUR[id][k]; }
  log('  aviso: "' + palavra + '" não está na fala de ' + id); return iniTrecho(id, 0);
}
async function cena(id, fn) {
  if (ATE && linha.some((l) => l.id === ATE)) return;
  cenaT0 = agora(); CUE = [];
  log('cena ' + id + ' (fala ' + DUR[id].reduce((a, b) => a + b, 0).toFixed(1) + ' s' + (DUR[id].length > 1 ? ' em ' + DUR[id].length + ' trechos' : '') + ')');
  const reg = { id, ini: cenaT0 };
  linha.push(reg);
  try { await fn(id); }
  catch (e) {
    fs.mkdirSync(path.join(TRAB, 'ensaio'), { recursive: true });
    const s = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70 }); fs.writeFileSync(path.join(TRAB, 'ensaio', 'erro-' + id + '.jpg'), Buffer.from(s.data, 'base64'));
    for (const f of ['cel', 'gest', 'moto']) { try { log('tela ' + f + ': ' + (await emF(f, "location.hash + ' | ' + ((document.querySelector('#gavCorpo') || document.body).innerText || '').replace(/\s+/g, ' ').slice(0, 400)"))); } catch (e2) { /* sem a tela */ } }
    throw e;
  }
  await aos(fimFala(id) + 0.7);
  reg.fim = agora();
  reg.falas = DUR[id].map((_, k) => +iniTrecho(id, k).toFixed(3));
  if (ENSAIO) { const s = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70 }); fs.mkdirSync(path.join(TRAB, 'ensaio'), { recursive: true }); fs.writeFileSync(path.join(TRAB, 'ensaio', id + '.jpg'), Buffer.from(s.data, 'base64')); }
}

/* ---------------- preparação (antes de gravar) ---------------- */
// CEP, rota e local da loja respondem na hora, com os dados reais buscados antes (ViaCEP e OSRM públicos às vezes
// demoram vários segundos e travariam a cena); o resto segue para a internet normalmente
const STUB = '(() => { const resp = (o) => new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } }); const orig = window.fetch.bind(window);' +
  ' window.fetch = async (url, opts) => { const u = String(url && url.url ? url.url : url);' +
  ' if (u.includes("viacep.com.br/ws/14060260")) return resp({ cep: "14060-260", logradouro: "Rua Rio Araguaia", bairro: "Vila Albertina", localidade: "Ribeirão Preto", uf: "SP" });' +
  ' if (u.includes("router.project-osrm.org")) return resp({ code: "Ok", routes: [{ distance: ' + estado.rota.metros + ', duration: ' + estado.rota.segundos + ' }] });' +
  ' if (u.includes("nominatim.openstreetmap.org") && /Daniel|Esteves/i.test(decodeURIComponent(u))) return resp([{ lat: "' + estado.lojaGeo.lat + '", lon: "' + estado.lojaGeo.lng + '" }]);' +
  ' return orig(url, opts); }; })();';
await send('Page.addScriptToEvaluateOnNewDocument', { source: STUB });
// pedidos de gravações anteriores (a cliente do vídeo e a que chega ao vivo) saem do quadro de hoje
const { execFileSync } = await import('node:child_process');
execFileSync('docker', ['exec', 'pp-video-banco', 'psql', '-U', 'postgres', '-d', 'pizzaria', '-qc',
  "DELETE FROM pedidos WHERE dia = (now() AT TIME ZONE 'America/Sao_Paulo' - interval '5 hours')::date AND dados->'cliente'->>'nome' IN ('Juliana Martins', 'Fernanda Costa'); DELETE FROM limites"]); // limites: os ensaios repetidos pedem vários códigos
log('abrindo o palco');
await send('Page.navigate', { url: PALCO });
await espera(1500);
await poeGps(estado.lojaGeo);
await palco("localStorage.clear(); localStorage.setItem('pp-cliente', JSON.stringify({ nome: 'Juliana Martins', fone: '(16) 99123-4567' })); 1");
await palco('P.iniciar(' + JSON.stringify({ gest: GEST, cel: LOJA }) + ')');
await ate('gest', "location.pathname === '/gestao' && document.readyState === 'complete'", 20000);
await ate('cel', "location.pathname === '/' && document.readyState === 'complete' && !!document.querySelector('a[href=\"#montar\"]')", 20000);
// o celular do cliente: o link do WhatsApp não abre outra aba (o vídeo mostra a mensagem no palco)
const tiraZap = "document.addEventListener('click', (e) => { const a = e.target.closest && e.target.closest('a[href*=\"wa.me\"], a[href*=\"whatsapp\"]'); if (a) e.preventDefault(); }, true); 1";
await emF('cel', tiraZap);
// o mapa do "Ajustar no mapa" já fica no cache (Leaflet do cdnjs)
await emF('cel', "Promise.all(['https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'].map((u) => fetch(u, { mode: 'no-cors' }).catch(() => 0))).then(() => 1)");
// entregador: código de pareamento novo a cada gravação (vale uma vez); o celular pareia e começa a jornada
const codJoao = (await apiNode('POST', '/api/entregadores/' + estado.idJoao + '/parear')).codigo;
await palco('P.iniciar(' + JSON.stringify({ moto: MOTO + '#parear=' + codJoao }) + ')');
await ate('moto', "!!document.querySelector('#jbtn')", 20000);
await emF('moto', "document.querySelector('#jbtn').classList.contains('on') || document.querySelector('#jbtn').click(), 1");
await ate('moto', "document.querySelector('#jbtn').classList.contains('on')", 10000);
// o site do computador: carrega, fica desenhado (invisível) atrás do título e já rola a página inteira uma vez,
// para as imagens estarem prontas; assim a vitrine entra e rola sem engasgar
await palco("P.iniciar({ site: '" + LOJA + "' })");
await ate('site', "location.pathname === '/' && document.readyState === 'complete' && !!document.querySelector('a[href=\"#montar\"]')", 20000);
await palco("P.preparar('site', 'site')");
await emF('site', "(async () => { const h = document.documentElement.scrollHeight; for (let y = 0; y < h; y += 500) { scrollTo({ top: y, behavior: \"instant\" }); await new Promise((r) => setTimeout(r, 250)); } scrollTo({ top: 0, behavior: \"instant\" }); await new Promise((r) => setTimeout(r, 400)); return 1; })()");
// o Windows dá menos CPU a processos sem janela quando a máquina está em uso: os do Chrome da gravação sobem de prioridade
try {
  const ps = JSON.parse(execFileSync('powershell', ['-NoProfile', '-Command', "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | Select-Object ProcessId, ParentProcessId | ConvertTo-Json -Compress"]).toString());
  const filhos = new Map(); for (const p of ps) { if (!filhos.has(p.ParentProcessId)) filhos.set(p.ParentProcessId, []); filhos.get(p.ParentProcessId).push(p.ProcessId); }
  const meus = []; for (const fila = [chrome.pid]; fila.length;) { const p = fila.shift(); meus.push(p); fila.push(...(filhos.get(p) || [])); }
  // o servidor de demonstração, o proxy e este gravador também: com só o Chrome em prioridade alta, os relatórios
  // esperavam o servidor (que ficava com a CPU que sobrava)
  const portas = execFileSync('powershell', ['-NoProfile', '-Command', '(Get-NetTCPConnection -State Listen -LocalPort 5301,5310 -ErrorAction SilentlyContinue).OwningProcess | Sort-Object -Unique']).toString().trim().split(/\s+/).filter(Boolean).map(Number);
  let n = 0; for (const pid of [...meus, ...portas, process.pid]) try { os.setPriority(pid, os.constants.priority.PRIORITY_HIGH); n++; } catch (e) { /* processo já saiu */ }
  log('prioridade alta para ' + n + ' processos (Chrome da gravação, servidor de demonstração, proxy e gravador)');
} catch (e) { log('  aviso: não deu para subir a prioridade (' + e.message.slice(0, 80) + ')'); }
await palco("P.cortina(true)");
await espera(800);

/* ================= cenas ================= */
await comecaGravar();
log('gravando');

await cena('abertura', async (id) => {
  await palco("P.cortina(false); P.titulo('abre')");
  await aos(marca(id, 'o site')); await palco('P.pilar(0)');
  await aos(marca(id, 'a gestão')); await palco('P.pilar(1)');
  await aos(marca(id, 'e o aplicativo')); await palco('P.pilar(2)');
});

await cena('vitrine', async (id) => {
  await palco("P.titulo(null); P.layout('site')");
  await aos(0.9); await palco("P.faixa('Site próprio, com a marca da pizzaria')");
  await cursorTipo('seta'); await mover(1200, 640, 900);
  await aos(marca(id, 'o cliente vê')); await rolarJanela('site', '#promocoes', 1300);
  await aos(marca(id, 'e todos os sabores')); await rolarJanela('site', '#cardapio', 1700);
  await aos(marca(id, 'com os ingredientes') + 0.3);
  const p = await ponto('site', '#grade button.item:nth-of-type(3)'); await mover(p.x, p.y, 700);
});

await cena('montar', async (id) => {
  await cursorTipo(null);
  await palco("P.faixa('Pizza montada na tela'); P.layout('celular'); P.lado('Monte do seu <em>jeito.</em>', ['Tamanho', 'Meio a meio', 'Borda recheada']); setTimeout(() => P.iniciar({ site: 'about:blank' }), 1500)"); // o site do computador não volta mais: descarrega (menos trabalho para o Chrome)
  await emF('cel', "scrollTo({ top: 0 }), 1");
  await aos(1.0); await cursorTipo('toque');
  await clicar('cel', '#montar a[href="#montar"], .hero a[href="#montar"], a[href="#montar"]');
  await ate('cel', "!!(document.querySelector('[data-tam=grande]') && document.querySelector('[data-tam=grande]').offsetParent)");
  await aos(marca(id, 'escolhe o tamanho'));
  await clicar('cel', '[data-tam=grande]'); await palco('P.ladoItem(0)');
  await clicar('cel', '#montAvancar', { depois: 460 });
  await aos(marca(id, 'divide meio'));
  await clicar('cel', '[data-modo=meio]'); await palco('P.ladoItem(1)');
  await aos(marca(id, 'e navega') - 0.2);
  await clicar('cel', '[data-mcat=promo]', { depois: 500 });
  fala(1); // os sabores
  await clicar('cel', '[data-sab=promo-calabresa]', { depois: 430 });
  await aos(marca(id, 'e o preço'));
  await clicar('cel', '[data-sab=promo-milho]', { depois: 480 });
  await clicar('cel', '#montAvancar', { depois: 460 });
  fala(2); // borda, observação e forno
  await aos(marca(id, 'a borda'));
  await clicar('cel', '[data-borda=catupiry]', { depois: 430 }); await palco('P.ladoItem(2)');
  await aos(marca(id, 'uma observação') - 0.3);
  await clicar('cel', '#montAvancar', { depois: 430 });
  await aos(marca(id, 'e a pizza vai') - 0.5);
  await clicar('cel', '#montAvancar', { depois: 300 });
  await ate('cel', "!!(document.querySelector('[data-mont=finalizar]') && document.querySelector('[data-mont=finalizar]').offsetParent)", 12000);
  await espera(300);
});

await cena('promocoes', async (id) => {
  await palco("P.faixa('Promoções que se aplicam sozinhas'); P.lado('Promoções <em>automáticas.</em>', ['Combos e cupons', 'Frete grátis e brindes', 'A dica do que falta'])");
  await clicar('cel', '[data-mont=finalizar]', { depois: 480 });
  await ate('cel', "!!document.querySelector('[data-dica]')");
  await palco('P.ladoItem(2)');
  await aos(marca(id, 'e o site ainda avisa'));
  await clicar('cel', '[data-dica]', { depois: 430 });
  await palco('P.ladoItem(0); setTimeout(() => P.ladoItem(1), 500)');
});

await cena('entrega', async (id) => {
  await palco("P.faixa('Sugestões antes de fechar'); P.lado('Venda <em>a mais.</em>', ['Acompanhamentos', 'Bebidas'])");
  await clicar('cel', '[data-ck=avancar]', { depois: 430 });
  // acompanhamentos: a cliente aceita a batata frita; bebidas: o refrigerante do combo já está no pedido
  await ate('cel', "!!(document.querySelector('[data-ad-mais=acomp-batata]') && document.querySelector('[data-ad-mais=acomp-batata]').offsetParent)", 8000);
  await aos(marca(id, 'acompanhamentos'));
  await clicar('cel', '[data-ad-mais=acomp-batata]', { depois: 500 }); await palco('P.ladoItem(0)');
  await clicar('cel', '[data-ck=avancar]', { depois: 500 });
  await aos(marca(id, 'e bebidas')); await palco('P.ladoItem(1)');
  for (let i = 0; i < 4 && !(await emF('cel', "!!document.querySelector('[data-modo-ck]')")); i++) {
    if (await emF('cel', "(() => { const n = document.querySelector('.nao-quero:not([disabled])'); return !!(n && n.offsetParent && n.getAttribute('aria-pressed') !== 'true'); })()")) await clicar('cel', '.nao-quero', { depois: 350 });
    await aos(fimTrecho(id, 0) - 1.0);
    await clicar('cel', '[data-ck=avancar]', { depois: 460 });
  }
  await palco("P.faixa('Endereço pelo número · taxa pela distância'); P.lado('Entrega <em>sem erro.</em>', ['CEP e número', 'A porta achada no mapa', 'Taxa pela distância da rota'])");
  fala(1); // CEP e número
  await clicar('cel', '[data-modo-ck=entrega]', { depois: 400 });
  await clicar('cel', '#ckCep', { depois: 150 }); await digitar('14060260', 55);
  await ate('cel', "/Rio Araguaia/.test(document.querySelector('#gavCorpo').textContent) && !!document.querySelector('#ckNumero')", 12000);
  await palco('P.ladoItem(0)');
  await clicar('cel', '#ckNumero', { depois: 150 }); await digitar('790', 80);
  fala(2); // a porta, a rota e a taxa
  await aos(marca(id, 'calcula a distância') - 0.6);
  await clicar('cel', '[data-ck=calcular]', { depois: 300 });
  await ate('cel', "!!document.querySelector('.ck-local')", 15000);
  await palco('P.ladoItem(1); setTimeout(() => P.ladoItem(2), 700)');
  await aos(fimTrecho(id, 2) - 0.6);
  await clicar('cel', '[data-ck=mapa]', { depois: 300 });
  fala(3); // o mapa
  await ate('cel', "!!document.querySelector('.lp-veu.on') && !!window.__lpMapa && !document.querySelector('#lpOk').disabled", 20000);
  await aos(marca(id, 'arrasta o mapa') - 0.4);
  // arrasta o mapa um pouco (o pino fica parado no meio)
  const m = await ponto('cel', '#lpMapa', { fy: 0.55 });
  await mover(m.x, m.y, 400);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: m.x, y: m.y, button: 'left', clickCount: 1 });
  for (let k = 1; k <= 20; k++) { const x = m.x - k * 1.6, y = m.y - k * 1.1; await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 }); await palco('P.cursorEm(' + x + ',' + y + ')'); await espera(25); }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: m.x - 32, y: m.y - 22, button: 'left', clickCount: 1 });
  cur = { x: m.x - 32, y: m.y - 22 };
  await espera(400);
  await aos(marca(id, 'e confirma') - 0.5);
  await clicar('cel', '#lpOk', { depois: 700 });
  await rolar('cel', '.ck-local', 'center');
});

let textoZap = '';
await cena('whatsapp', async (id) => {
  await palco("P.faixa('Pedido pronto no WhatsApp'); P.lado('Pagamento <em>e envio.</em>', ['Pix, cartão ou dinheiro', 'Troco calculado', 'Mensagem pronta para a pizzaria'])");
  await clicar('cel', '[data-ck=avancar]', { depois: 430 });
  await clicar('cel', '[data-pag=dinheiro]', { depois: 400 }); await palco('P.ladoItem(0)');
  await clicar('cel', '#ckTroco', { depois: 150 }); await digitar('100', 90); await palco('P.ladoItem(1)');
  await clicar('cel', '[data-ck=avancar]', { depois: 900 });
  await aos(marca(id, 'o pedido chega') - 0.6);
  await clicar('cel', '#btnZap', { depois: 480 });
  await ate('cel', "!!document.querySelector('#msgCopia')", 8000);
  textoZap = await emF('cel', "document.querySelector('#msgCopia').value || document.querySelector('#msgCopia').textContent");
  const bonito = textoZap.replace(/https?:\/\/localhost:5310\/?/g, 'https://pizzariapereira.com.br/');
  await palco('P.ladoItem(2); P.lado(null)');
  await espera(350);
  await palco('P.zap(' + JSON.stringify(bonito) + ')');
});

await cena('conta', async (id) => {
  // o pedido da cliente já saiu: agora a gestão (escondida) entra como a dona da pizzaria
  await emF('gest', "fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: 'admin', senha: " + JSON.stringify(SENHA_ADMIN) + " }) }).then((r) => { location.reload(); return r.status; })");
  await palco("P.zap(null); P.faixa('Conta sem senha · Pedir de novo')");
  await espera(400);
  await palco("P.lado('Conta <em>sem senha.</em>', ['Código no email ou Google', 'Endereços guardados', 'Pedir de novo'])");
  const temConvite = await emF('cel', "!!document.querySelector('[data-ck=entrar]') && !!document.querySelector('[data-ck=entrar]').offsetParent");
  if (temConvite) await clicar('cel', '[data-ck=entrar]', { depois: 480 }); else await clicar('cel', '#contaBtn', { depois: 480 });
  await ate('cel', "!!(document.querySelector('#ctContato') && document.querySelector('#ctContato').offsetParent)", 8000);
  await clicar('cel', '#ctContato', { depois: 150 });
  const t0 = Date.now();
  await digitar('(16) 99123-4567', 45); // a conta acha pelo celular; o código vai para o email dela
  await clicar('cel', '#ctFormContato button[type=submit], #ctFormContato .btn', { depois: 300 });
  await palco('P.ladoItem(0)');
  // o código chega no email (caixa de testes do ambiente de demonstração)
  let codigo = null;
  for (let i = 0; i < 60 && !codigo; i++) {
    const j = await (await fetch('http://127.0.0.1:8035/api/v1/messages?limit=20')).json();
    const msg = (j.messages || []).find((x) => (x.To || []).some((t) => t.Address === 'juliana.martins@exemplo.com.br') && Date.parse(x.Created) >= t0 - 2000);
    if (msg) codigo = msg.Subject.match(/^(\d{6})/)[1]; else await espera(200);
  }
  await ate('cel', "!!(document.querySelector('#ctCodigo') && document.querySelector('#ctCodigo').offsetParent)", 8000);
  fala(1); // o código e o Google
  await espera(500);
  await clicar('cel', '#ctCodigo', { depois: 150 }); await digitar(codigo, 110);
  await espera(1300);
  await palco('P.ladoItem(1)');
  // fecha o pedido e abre "Minha conta": os pedidos e o "Pedir de novo"
  if (await emF('cel', "!!(document.querySelector('#gavFechar') && document.querySelector('#gavFechar').offsetParent)")) await clicar('cel', '#gavFechar', { depois: 650 });
  await aos(fimTrecho(id, 1) - 0.8);
  await clicar('cel', '#contaBtn', { depois: 500 });
  fala(2); // a conta e o "Pedir de novo"
  await ate('cel', "!!(document.querySelector('[data-aba=pedidos]') && document.querySelector('[data-aba=pedidos]').offsetParent)", 8000);
  await clicar('cel', '[data-aba=pedidos]', { depois: 500 });
  await palco('P.ladoItem(2)');
  await aos(marca(id, 'da próxima vez') - 0.2);
  if (await emF('cel', "!!document.querySelector('[data-ct=denovo]')")) { const p = await ponto('cel', '[data-ct=denovo]'); await mover(p.x, p.y, 700); }
});

// pedido principal (o que a cliente acabou de fazer)
const tokenCliente = await emF('cel', "JSON.parse(localStorage.getItem('pp-ultimoPedido') || '{}').token || ''");
const pedidoCliente = async () => (await apiNode('GET', '/api/pedidos')).pedidos.find((p) => p.token === tokenCliente);
const cartaoCliente = async () => { const p = await pedidoCliente(); return '.k-cartao[data-id="' + p.id + '"]'; };

await cena('aovivo', async (id) => {
  await cursorTipo(null);
  await ate('gest', "!!document.querySelector('.k-cartao')", 15000);
  await palco("P.lado(null); P.faixa('Gestão: pedidos ao vivo'); P.layout('gest')");
  await emF('gest', "location.hash = '#/aovivo', 1");
  await aos(1.3);
  // outro pedido chega na hora, pelo site
  await emF('gest', "1");
  await fetch(API + '/api/pedidos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(await pedidoNovo()) }).catch(() => {});
  await cursorTipo('seta');
  const sel = await cartaoCliente();
  await ate('gest', "!!document.querySelector('" + sel.replace(/'/g, "\\'") + " [data-acao=avancar]')", 8000);
  await aos(fimTrecho(id, 0) - 0.9);
  fala(1); // confirmar e mandar para o forno
  await aos(marca(id, 'um toque confirma') - 0.5);
  await clicar('gest', sel + ' [data-acao=avancar]', { depois: 700 });
  await ate('gest', "!!document.querySelector('" + sel.replace(/'/g, "\\'") + " [data-acao=avancar]')", 8000);
  await aos(marca(id, 'e outro manda') - 0.3);
  await clicar('gest', sel + ' [data-acao=avancar]', { depois: 480 });
  await aos(fimTrecho(id, 1) - 1.2);
  await clicar('gest', sel + ' .k-cod', { depois: 480 });
  // clique só visual: o print() de um Chrome sem janela pode travar a gravação; o palco mostra a comanda impressa
  const pc = await ponto('gest', '#gaveta [data-acao=comanda]'); await mover(pc.x, pc.y, 600); await palco('P.clique(' + pc.x + ',' + pc.y + ')');
  await palco('P.comanda(' + JSON.stringify(comandaHtml(await pedidoCliente())) + ')');
  fala(2); // a comanda
  await espera(2400); // a comanda "sai da impressora"
});

await cena('acompanha', async (id) => {
  await palco("P.comanda(null); P.faixa('O cliente acompanha em tempo real'); P.layout('dupla')");
  // na conta, a cliente toca em "Acompanhar" no pedido dela
  await espera(1200);
  await cursorTipo('toque');
  if (await emF('cel', "!!(document.querySelector('[data-ct=acompanhar]') && document.querySelector('[data-ct=acompanhar]').offsetParent)")) await clicar('cel', '[data-ct=acompanhar]', { depois: 500 });
  else await clicar('cel', '#ppPilula', { depois: 500 });
  await ate('cel', "(() => { const b = document.querySelector('#acomp'); return !!(b && !b.hidden && b.getBoundingClientRect().height > 100); })()", 8000);
  await aos(2.0);
  // a cozinha marca a previsão: o celular da cliente atualiza na hora
  await cursorTipo('seta');
  await escolher('gest', '#gaveta [data-campo=previsaoMin]', 40);
  await espera(900);
});

await cena('entregador', async (id) => {
  await palco("P.faixa('Entregador rastreado no mapa'); P.layout('trio')");
  await aos(1.4);
  await escolher('gest', '#gaveta [data-campo=entregadorId]', estado.idJoao);
  await ate('moto', "!!document.querySelector('[data-acao=saiu]')", 10000);
  await cursorTipo('toque');
  await aos(fimTrecho(id, 0) - 1.4);
  await clicar('moto', '[data-acao=saiu]', { depois: 400 });
  fala(1); // a posição em tempo real
  await cursorTipo(null);
  await emF('gest', "document.querySelector('[data-acao=fechar-gaveta]') && document.querySelector('[data-acao=fechar-gaveta]').click(); location.hash = '#/entregadores', 1");
  await palco("P.selo('⏩ trajeto acelerado')");
  // a moto anda pela rota (GPS do celular + sinal a cada meio segundo)
  const cookieJoao = ((await send('Network.getCookies', { urls: ['http://localhost:5310/'] })).cookies.find((c) => c.name === 'pp_moto') || {}).value;
  const durTrajeto = 10.5, ini = Date.now();
  while ((Date.now() - ini) / 1000 < durTrajeto) {
    const f = (Date.now() - ini) / 1000 / durTrajeto, p = aoLongo(estado.rota.pontos, 0.04 + f * 0.93);
    await poeGps(p); if (cookieJoao) posta(cookieJoao, p);
    await espera(450);
  }
  await cursorTipo('toque');
  await ate('moto', "!!document.querySelector('[data-segura=entregue]')", 8000);
  fala(2); // na porta
  await aos(marca(id, 'segurar o botão') - 0.2);
  await clicar('moto', '[data-segura=entregue]', { segura: 1300, depois: 900 });
  await palco("P.selo(null)");
});

await cena('clientes', async (id) => {
  await palco("P.faixa('Clientes e campanhas'); P.layout('gest')");
  await espera(1300); // espera a gestão crescer para a tela toda antes de clicar
  await cursorTipo('seta');
  await clicar('gest', '.nav-item[data-rota=clientes]', { depois: 1200 });
  await ate('gest', "!!document.querySelector('#conteudo tr[data-acao=abrir-cliente]')", 10000);
  await aos(marca(id, 'cada cliente') + 0.6);
  await clicar('gest', await visivel('gest', '#conteudo tr[data-acao=abrir-cliente]'), { depois: 1200, fx: 0.25 });
  await aos(marca(id, 'e a lista') - 0.3);
  await clicar('gest', '#gaveta [data-acao=fechar-gaveta]', { depois: 500 });
  // a base de quem tem conta no site e aceita promoções (com a planilha)
  await clicar('gest', 'details.contas-base summary', { depois: 600 });
});

await cena('relatorios', async (id) => {
  await palco("P.faixa('Relatórios do negócio')");
  const paginas = [['visao', 'os números'], ['vendas', 'vendas por dia'], ['regioes', 'as regiões'], ['produtos', 'os sabores'], ['operacao', 'os tempos'], ['fechamento', 'e o fechamento']];
  for (const [pagina, palavra] of paginas) {
    await aos(Math.max(0.2, marca(id, palavra) - 0.5));
    await clicar('gest', '.nav-item[data-rota=' + pagina + ']', { ms: 450, depois: 300 });
  }
});

await cena('equipe', async (id) => {
  await palco("P.faixa('Equipe e conferência de valores')");
  await clicar('gest', '.nav-item[data-rota=configuracoes]', { depois: 480 });
  await clicar('gest', '.cfg-abas a[href$="/equipe"]', { depois: 900 });
  await aos(marca(id, 'e o sistema confere') - 0.4);
  await clicar('gest', '.nav-item[data-rota=aovivo]', { depois: 900 });
  await ate('gest', "!!document.querySelector('.tag.conf')", 8000);
  await clicar('gest', '.tag.conf', { depois: 430 });
});

await cena('fim', async (id) => {
  await cursorTipo(null);
  await palco("P.faixa(null); P.layout('vazio'); P.titulo('fim')");
  await aos(fimFala(id) + 1.8);
});

/* ---------------- fim ---------------- */
gravando = false;
if (!ENSAIO) await send('Page.stopScreencast');
await espera(800);
clearInterval(rafael);
fs.writeFileSync(path.join(TRAB, 'linha-do-tempo.json'), JSON.stringify({ narrOff: NARR_OFF, cenas: linha, quadros, t0: t0Grav }, null, 1));
log('fim: ' + quadros.length + ' quadros, ' + agora().toFixed(1) + ' s' + (erros.length ? '\nerros de JavaScript:\n' + Array.from(new Set(erros)).slice(0, 10).join('\n') : ''));
try { pg.ws.close(); nav.ws.close(); } catch (e) { /* já fechou */ }
chrome.kill();
process.exit(0);

/* ---------------- auxiliares ---------------- */
async function pedidoNovo() {
  // pedido de outra cliente, com os valores certos do cardápio (o servidor confere)
  const html = fs.readFileSync(path.join(TRAB, 'site', 'index.html'), 'utf8');
  const D = JSON.parse(html.match(/<script type="application\/json" id="pp-data">([\s\S]*?)<\/script>/)[1]);
  const { createRequire } = await import('node:module');
  const precos = createRequire(import.meta.url)(path.resolve(V, '..', 'prototipo', 'precos.js'))(D);
  const tok = Array.from({ length: 22 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'[Math.floor(Math.random() * 56)]).join('');
  const v = { token: tok, codigo: '#F' + Math.random().toString(36).slice(2, 6).toUpperCase(), modo: 'retirada', canal: 'site', cliente: { nome: 'Fernanda Costa', fone: '(16) 99812-2001' }, itens: [{ qtd: 1, tipo: 'pizza', nome: 'Pizza Grande', detalhe: 'Portuguesa', sabores: ['portuguesa'], tamanho: 'grande', borda: 'sem', massa: 'tradicional', valor: 0, obs: '' }], promocoes: [], subtotal: 0, desconto: 0, taxa: 0, freteGratis: false, total: 0, cupom: '', km: null, geo: null };
  Object.assign(v, precos.confere(v, Date.now(), estado.lojaGeo).oficial);
  return Object.assign(v, { pagamento: { forma: 'pix' }, obs: '' });
}
function comandaHtml(p) {
  const brl = (v) => 'R$ ' + (Math.round((v || 0) * 100) / 100).toFixed(2).replace('.', ',');
  const hh = new Date(Date.parse(p.criadoEm) - 3 * 3600e3).toISOString().slice(11, 16);
  const e = p.endereco || {};
  return '<h4>PIZZARIA PEREIRA</h4><div class="cod">' + p.codigo + '</div><div style="text-align:center">' + hh + ' · Site · ENTREGA</div><hr>' +
    (p.itens || []).map((i) => '<div><b>' + i.qtd + 'x ' + i.nome + '</b></div>' + (i.detalhe ? '<div>' + i.detalhe + '</div>' : '')).join('') + '<hr>' +
    '<div class="lin"><span>Subtotal</span><span>' + brl(p.subtotal) + '</span></div>' + (p.desconto ? '<div class="lin"><span>Desconto</span><span>-' + brl(p.desconto) + '</span></div>' : '') +
    '<div class="lin"><span>Entrega</span><span>' + brl(p.taxa) + '</span></div><div class="lin" style="font-size:22px;font-weight:900"><span>TOTAL</span><span>' + brl(p.total) + '</span></div>' +
    '<div>Dinheiro · troco p/ R$ 100,00</div><hr><div><b>' + p.cliente.nome + '</b></div><div>' + [e.rua, e.numero].filter(Boolean).join(', ') + '</div><div>' + (e.bairro || '') + '</div>';
}
