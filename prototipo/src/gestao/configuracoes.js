/* Gestão — Configurações: "Geral" (meta do dia, avisos, dados de demonstração, minha senha), "Equipe" (quem entra
   na gestão), "Email dos clientes" (por onde sai o código de acesso: Gmail, Brevo ou outro servidor SMTP) e "Login
   com Google" (o ID do cliente do botão "Continuar com Google"). As três últimas só para administradores.
   Aqui também fica a tela "Crie a sua senha" do primeiro acesso (chamada pelo inicia() de paginas.js). */
const ICO_CFG = {
  geral: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
  equipe: '<circle cx="9" cy="8" r="3.3"/><path d="M3 19.5c.7-3.4 3.1-5.2 6-5.2s5.3 1.8 6 5.2"/><path d="M15.5 4.8a3.2 3.2 0 0 1 0 6.3M17.6 14.6c1.8.6 3 2.2 3.4 4.9"/>',
  chave: '<circle cx="8" cy="15" r="4.2"/><path d="M11 12 20 3M16.5 6.5l2.6 2.6M13.8 9.2l2 2"/>',
  email: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4 7 8 6 8-6"/>',
  google: '<circle cx="8" cy="15" r="4.2"/><path d="M11 12 20 3M16.5 6.5l2.6 2.6M13.8 9.2l2 2"/>',
  aviao: '<path d="M21 3 3 10.4l7.2 2.6L12.8 21z"/><path d="M10.2 13 21 3"/>',
  servidor: '<rect x="4" y="4" width="16" height="7" rx="1.8"/><rect x="4" y="13" width="16" height="7" rx="1.8"/><path d="M8 7.5h.01M8 16.5h.01"/>',
  ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  erro: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>'
};
const svgCfg = (k, cls) => '<svg class="ico' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + ICO_CFG[k] + '</svg>';
const PROVEDORES = {
  gmail: { nome: 'Gmail', sub: 'a conta Google da pizzaria', ico: 'email', host: 'smtp.gmail.com', porta: 465, seguranca: 'ssl', usuario: 'Gmail da pizzaria', usuarioPh: 'pizzaria@gmail.com', senha: 'Senha de app (16 letras)' },
  brevo: { nome: 'Brevo', sub: 'grátis até 300 por dia', ico: 'aviao', host: 'smtp-relay.brevo.com', porta: 587, seguranca: 'starttls', usuario: 'Login SMTP da Brevo', usuarioPh: 'ex.: 8a1b2c001@smtp-brevo.com', senha: 'Chave SMTP' },
  outro: { nome: 'Outro servidor', sub: 'o email do seu domínio', ico: 'servidor', host: '', porta: 465, seguranca: 'ssl', usuario: 'Usuário (quase sempre o email)', usuarioPh: 'contato@suapizzaria.com.br', senha: 'Senha' }
};
const AJUDA_EMAIL = {
  gmail: '<ol><li>Na conta Google da pizzaria, ligue a <b>verificação em duas etapas</b>.</li><li>Crie uma <b>senha de app</b> (dê o nome "Pizzaria") e cole aqui as 16 letras. A senha normal da conta não funciona.</li><li>O remetente é o próprio Gmail. O Gmail envia até uns 500 emails por dia.</li></ol>' +
    '<a class="btn sm" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener">Criar a senha de app ↗</a>',
  brevo: '<ol><li>Crie a conta grátis na Brevo.</li><li>Em <b>Remetentes</b>, cadastre e confirme o email que vai aparecer para o cliente.</li><li>Em <b>SMTP e API → SMTP</b>, copie o <b>login</b> e gere uma <b>chave SMTP</b>. Cole os dois aqui.</li></ol>' +
    '<a class="btn sm" href="https://app.brevo.com/" target="_blank" rel="noopener">Abrir a Brevo ↗</a>',
  outro: '<p>Use os dados de SMTP que o provedor do seu email informa: servidor, porta, segurança, usuário e senha. Quase sempre é a porta <b>465 com SSL</b> ou a <b>587 com STARTTLS</b>.</p>'
};

const ABAS_CFG = [['geral', 'Geral', 'Geral'], ['equipe', 'Equipe', 'Equipe'], ['email', 'Email dos clientes', 'Email'], ['google', 'Login com Google', 'Google']]; // nome; nome curto no celular
PAGINAS.configuracoes = async () => {
  const adm = E.usuario.admin;
  const aba = adm && ABAS_CFG.some(([id]) => id === E.param) ? E.param : 'geral';
  const abas = adm ? '<nav class="cfg-abas" aria-label="Seções das configurações">' + ABAS_CFG.map(([id, n, curto]) =>
    '<a href="#/configuracoes/' + id + '"' + (id === aba ? ' aria-current="page"' : '') + '>' + svgCfg(id) + '<span class="cfg-longo">' + n + '</span><span class="cfg-curto">' + curto + '</span>' + (id === 'email' || id === 'google' ? '<i class="cfg-ponto" id="cfgPonto-' + id + '" hidden></i>' : '') + '</a>').join('') + '</nav>' : '';
  if (aba === 'email') await cfgEmail(abas);
  else if (aba === 'google') await cfgGoogle(abas);
  else if (aba === 'equipe') await cfgEquipe(abas);
  else await cfgGeral(abas);
  const atual = $('.cfg-abas [aria-current]');
  if (atual && atual.scrollIntoView) atual.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  if (adm) { // pontinhos das abas: verde funcionando, amarelo caixa de teste, vermelho com problema, cinza desligado
    if (aba !== 'email') api('GET', '/api/ajustes/email').then(pontoEmail).catch(() => {});
    if (aba !== 'google') api('GET', '/api/ajustes/google').then(pontoGoogle).catch(() => {});
  }
};

/* ======================= Geral ======================= */
async function cfgGeral(abas) {
  const cfg = await api('GET', '/api/config');
  E.metaDiaria = cfg.metaDiaria || 0; E.demo = cfg.demo || 0; faixaDemo();
  const adm = E.usuario.admin;
  const c = $('#conteudo');
  const notifPossivel = 'Notification' in window && window.isSecureContext;
  c.innerHTML = abas + '<div class="ajustes">' +
    '<section class="card"><h3>Meta de vendas do dia</h3><p class="nota">Aparece como uma barra de progresso no quadro ao vivo e na visão geral.</p>' + (adm ? '<form class="linha-form" id="fMeta"><label class="sel"><span>Meta (R$)</span><input type="number" class="campo" id="metaV" min="0" step="50" value="' + (E.metaDiaria || '') + '" placeholder="Ex.: 3500"></label><button class="btn prim" type="submit">Salvar</button></form>' : '<p><b>' + (E.metaDiaria ? brl(E.metaDiaria) : 'sem meta') + '</b> · só administradores mudam.</p>') + '</section>' +
    '<section class="card"><h3>Avisos de pedido novo</h3><p class="nota">Valem para este navegador.</p><div class="linha-form"><button type="button" class="btn" id="aSom" aria-pressed="' + E.som + '">' + (E.som ? 'Som ligado' : 'Som desligado') + '</button>' + (notifPossivel ? '<button type="button" class="btn" id="aNotif" aria-pressed="' + (E.notif && Notification.permission === 'granted') + '">' + (E.notif && Notification.permission === 'granted' ? 'Notificações ligadas' : 'Ativar notificações') + '</button>' : '<span class="nota">Notificações do navegador só funcionam com o site em HTTPS.</span>') + '</div></section>' +
    '<section class="card"><h3>Dados de demonstração</h3><p class="nota">Pedidos fictícios dos últimos 90 dias (até ontem), com o cardápio, os horários e as faixas de entrega reais, para conhecer os relatórios antes de ter histórico. Eles nunca entram no dia de hoje e saem todos de uma vez.</p>' +
    (adm ? '<p><b>' + (E.demo ? num(E.demo) + ' pedidos de demonstração carregados.' : 'Nenhum dado de demonstração.') + '</b></p><div class="linha-form">' + (E.demo ? '<button type="button" class="btn perigo" id="demoTira">Remover os dados de demonstração</button>' : '<button type="button" class="btn prim" id="demoPoe">Carregar dados de demonstração</button>') + '</div>' : '<p class="nota">Só administradores carregam ou removem.</p>') + '</section>' +
    '<section class="card"><h3>Cardápio, horários e entrega</h3><p class="nota">Ficam no portal do site. Depois de mudar, copie o JSON do portal para o projeto e publique de novo para valer aqui.' + (adm ? ' Quem entra na gestão fica em <a class="link forte" href="#/configuracoes/equipe">Equipe</a>.' : '') + '</p><div class="linha-form"><a class="btn" href="/#portal" target="_blank" rel="noopener">Abrir o portal do site ↗</a></div></section>' +
    htmlMinhaSenha() + '</div>';
  ligaMinhaSenha($('#fMinha'), '#minhaRes', () => { $('#fMinha').reset(); toast('Senha trocada.'); });
  if (E.param === 'senha' && $('#minhaSenha')) { $('#minhaSenha').scrollIntoView({ block: 'center' }); setTimeout(() => $('#fMinha').elements.namedItem('atual').focus(), 300); }
  const fm = $('#fMeta');
  if (fm) fm.addEventListener('submit', async (e) => { e.preventDefault(); try { const r = await api('PATCH', '/api/config', { metaDiaria: +$('#metaV').value || 0 }); E.metaDiaria = r.metaDiaria; E.analise.clear(); toast('Meta salva.'); } catch (er) { toast(er.message); } });
  $('#aSom').addEventListener('click', (e) => { E.som = !E.som; pref.set('som', E.som); liberaAudio(); if (E.som) bip(); e.target.setAttribute('aria-pressed', E.som); e.target.textContent = E.som ? 'Som ligado' : 'Som desligado'; });
  if ($('#aNotif')) $('#aNotif').addEventListener('click', async (e) => { if (E.notif && Notification.permission === 'granted') E.notif = false; else { const r = await Notification.requestPermission(); E.notif = r === 'granted'; } pref.set('notif', E.notif); e.target.setAttribute('aria-pressed', E.notif); e.target.textContent = E.notif ? 'Notificações ligadas' : 'Ativar notificações'; });
  const poe = $('#demoPoe'), tira = $('#demoTira');
  if (poe) poe.addEventListener('click', async () => { poe.disabled = true; poe.textContent = 'Gerando…'; try { const r = await api('POST', '/api/demo', {}); E.analise.clear(); E.clientes = null; toast(num(r.inseridos) + ' pedidos de demonstração carregados.'); } catch (er) { toast(er.message); } PAGINAS.configuracoes(); });
  if (tira) tira.addEventListener('click', async () => { if (!confirm('Remover todos os ' + num(E.demo) + ' pedidos de demonstração? Os pedidos de verdade continuam.')) return; tira.disabled = true; try { const r = await api('DELETE', '/api/demo'); E.analise.clear(); E.clientes = null; toast(num(r.removidos) + ' pedidos de demonstração removidos.'); } catch (er) { toast(er.message); } PAGINAS.configuracoes(); });
}

/* ======================= Email dos clientes ======================= */
const ML = { v: null, prov: 'gmail' };
const campoMail = (n) => { const f = $('#fMail'); return f ? f.elements.namedItem(n) : null; };
const nomeVia = (h) => (/(^|\.)gmail\.com$/i.test(h || '') ? 'Gmail' : /brevo\.com$/i.test(h || '') ? 'Brevo' : h || '');
const diaSP = (ms) => new Date(ms - 3 * 3600e3).toISOString().slice(0, 10);
function quando(iso) {
  if (!iso) return '';
  const t = Date.parse(iso), m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return 'agora há pouco';
  if (m < 60) return 'há ' + m + ' min';
  const d = diaSP(t);
  return (d === diaSP(Date.now()) ? 'hoje' : 'em ' + d.slice(8, 10) + '/' + d.slice(5, 7)) + ' às ' + hhmm(iso);
}
function estadoEmail(v) {
  const ef = v.efetivo, st = v.status || {};
  if (ef.erro) return 'erro';
  if (ef.tipo === 'simulado') return 'off';
  if (st.erro && st.erroEm && (!st.okEm || st.erroEm > st.okEm)) return 'erro';
  return ef.tipo === 'teste' ? 'teste' : 'ok';
}
function pontoEmail(v) {
  const p = $('#cfgPonto-email');
  if (!p) return;
  const e = estadoEmail(v);
  p.className = 'cfg-ponto ' + e; p.hidden = false;
  p.title = { ok: 'Email funcionando', teste: 'Email na caixa de teste', erro: 'Email com problema', off: 'Email desligado' }[e];
}
function arteEnvelope(est) {
  const simb = est === 'ok' ? 'M53.5 58.5l4.5 4.5 8.5-9' : est === 'erro' ? 'M60 50.5v8M60 64.6v.4' : est === 'teste' ? 'M56 50.5h8M57.6 50.6v5.2l-4 7.7h12.8l-4-7.7v-5.2' : 'M54 58h12';
  return '<svg viewBox="0 0 80 80"><rect class="env" x="5" y="17" width="54" height="40" rx="7"/><path class="aba" d="M8 21l24 19 24-19"/>' +
    '<circle class="selo" cx="60" cy="58" r="14"/><path class="simb" pathLength="1" d="' + simb + '"/></svg>';
}

async function cfgEmail(abas) {
  const v = await api('GET', '/api/ajustes/email');
  ML.v = v;
  const cf = v.config;
  ML.prov = cf ? cf.provedor : 'gmail';
  const P = PROVEDORES[ML.prov] || PROVEDORES.outro;
  const host = cf ? cf.host : P.host, porta = cf ? cf.porta : P.porta, seg = cf ? cf.seguranca : P.seguranca;
  $('#conteudo').innerHTML = abas + '<div class="mail">' +
    '<section class="card mail-status" id="mailStatus"></section>' +
    '<section class="card mail-form"><h3>Configurar o envio</h3>' +
    '<p class="nota">Por aqui sai o código de 6 números que o cliente usa para entrar no site. Escolha por onde enviar:</p>' +
    '<div class="mail-prov" role="radiogroup" aria-label="Por onde enviar">' + Object.keys(PROVEDORES).map((id) => '<button type="button" role="radio" data-prov="' + id + '" aria-checked="false">' + svgCfg(PROVEDORES[id].ico) + '<b>' + PROVEDORES[id].nome + '</b><small>' + PROVEDORES[id].sub + '</small></button>').join('') + '</div>' +
    '<div class="mail-ajuda" id="mailAjuda"></div>' +
    '<form class="mail-campos" id="fMail" novalidate autocomplete="off">' +
    '<label class="fld"><span id="rotUsuario"></span><input class="campo" name="usuario" inputmode="email" autocomplete="off" spellcheck="false" maxlength="254" value="' + esc(cf ? cf.usuario : '') + '"></label>' +
    '<label class="fld"><span id="rotSenha"></span><span class="senha-box"><input class="campo" name="senha" type="password" autocomplete="new-password" spellcheck="false" maxlength="512"><button type="button" class="link" id="verSenha" aria-pressed="false">mostrar</button></span><small class="fld-nota" id="notaSenha"></small></label>' +
    '<div class="fld-duplo"><label class="fld"><span>Nome que aparece para o cliente</span><input class="campo" name="deNome" maxlength="80" value="' + esc(cf ? cf.deNome : nomeLoja()) + '"></label>' +
    '<label class="fld" id="fldDe"><span>Email do remetente</span><input class="campo" name="deEmail" type="email" spellcheck="false" maxlength="254" value="' + esc(cf ? cf.deEmail : '') + '"></label></div>' +
    '<details class="mail-avancado" id="mailAvancado"><summary>Servidor, porta e segurança</summary><div class="fld-trio">' +
    '<label class="fld"><span>Servidor SMTP</span><input class="campo" name="host" spellcheck="false" maxlength="253" value="' + esc(host) + '"></label>' +
    '<label class="fld"><span>Porta</span><input class="campo" name="porta" type="number" min="1" max="65535" value="' + esc(porta) + '"></label>' +
    '<label class="fld"><span>Segurança</span><select class="campo" name="seguranca">' + [['ssl', 'SSL (porta 465)'], ['starttls', 'STARTTLS (porta 587)'], ['nenhuma', 'Nenhuma (só rede interna)']].map(([k, n]) => '<option value="' + k + '"' + (k === seg ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></label>' +
    '</div></details>' +
    '<div class="mail-teste"><label class="fld"><span>Mandar um email de teste para</span><input class="campo" name="para" type="email" spellcheck="false" placeholder="seu email" value="' + esc(cf ? cf.deEmail : '') + '"></label>' +
    '<button type="button" class="btn" id="mailTeste">' + svgCfg('aviao', 'aviao') + '<span>Enviar teste</span></button></div>' +
    '<p class="mail-res" id="mailRes" role="status" aria-live="polite"></p>' +
    '<div class="mail-acoes"><button type="submit" class="btn prim grande" id="mailSalvar">Salvar e usar</button><span class="nota">Antes de salvar, a gestão confere o servidor e a senha. A senha fica guardada cifrada e não volta para esta tela.</span></div>' +
    '</form></section></div>';
  desenhaStatus(v, false);
  ligaFormEmail();
  aplicaProvedor(ML.prov, false);
}

function desenhaStatus(v, animar) {
  const box = $('#mailStatus');
  if (!box) return;
  const ef = v.efetivo, st = v.status || {}, cf = v.config, est = estadoEmail(v);
  let via, sub;
  if (ef.erro) { via = nomeVia(ef.via); sub = esc(ef.erro); }
  else if (ef.tipo === 'simulado') { via = 'Nenhum: envio desligado'; sub = 'Os códigos aparecem só no registro do servidor. Os clientes não recebem email.'; }
  else if (ef.tipo === 'teste') { via = 'Caixa de teste deste computador'; sub = 'Só quem está neste computador vê os emails, em <a class="link forte" href="http://localhost:8025" target="_blank" rel="noopener">localhost:8025 ↗</a>. Os clientes não recebem nada.'; }
  else { via = nomeVia(ef.via) + (ef.origem === 'gestao' && cf && cf.deEmail ? ' · ' + cf.deEmail : ''); sub = 'Remetente: ' + esc(ef.de); }
  const ult = ef.tipo === 'simulado' ? ''
    : est === 'erro' && st.erro && !ef.erro ? '<p class="mail-ult erro">' + svgCfg('erro') + '<span>Último envio falhou ' + quando(st.erroEm) + ': ' + esc(st.erro) + '</span></p>'
      : st.okEm ? '<p class="mail-ult ok">' + svgCfg('ok') + '<span>Último código enviado ' + quando(st.okEm) + '.</span></p>'
        : ef.erro ? '' : '<p class="mail-ult">Nenhum código enviado por aqui ainda.</p>';
  const quem = ef.origem === 'gestao' && cf && cf.atualizadoEm ? '<p class="nota">Configurado por ' + esc(cf.atualizadoPor || 'alguém') + ' ' + quando(cf.atualizadoEm) + '.</p>' : '';
  const amb = v.ambiente.tipo;
  const volta = ef.origem === 'gestao' ? '<button type="button" class="link perigo" id="mailDesliga">' + (amb === 'teste' ? 'Voltar para a caixa de teste' : amb === 'smtp' ? 'Voltar para o email padrão do servidor' : 'Desligar o envio de email') + '</button>' : '';
  box.className = 'card mail-status ' + est;
  box.innerHTML = '<div class="mail-arte" aria-hidden="true">' + arteEnvelope(est) + '</div><div class="mail-info"><span class="mail-rot">Os códigos de acesso dos clientes saem por</span><strong class="mail-via">' + esc(via) + '</strong><p class="mail-sub">' + sub + '</p>' + ult + quem + volta + '</div>';
  if (animar && !REDUZ) { box.classList.remove('muda'); void box.offsetWidth; box.classList.add('muda'); }
  pontoEmail(v);
  const d = $('#mailDesliga');
  if (d) d.addEventListener('click', desligaEmail);
}

function aplicaProvedor(p, preset) {
  ML.prov = PROVEDORES[p] ? p : 'outro';
  const P = PROVEDORES[ML.prov], cf = ML.v.config;
  $$('.mail-prov [data-prov]').forEach((b) => { const on = b.dataset.prov === ML.prov; b.setAttribute('aria-checked', on); b.tabIndex = on ? 0 : -1; });
  const aj = $('#mailAjuda');
  aj.innerHTML = AJUDA_EMAIL[ML.prov];
  if (preset && !REDUZ) { aj.classList.remove('troca'); void aj.offsetWidth; aj.classList.add('troca'); }
  $('#rotUsuario').textContent = P.usuario; campoMail('usuario').placeholder = P.usuarioPh;
  $('#rotSenha').textContent = P.senha;
  if (preset) {
    const volta = cf && cf.provedor === ML.prov ? cf : null; // voltou para o provedor salvo: os dados salvos
    campoMail('host').value = volta ? volta.host : P.host;
    campoMail('porta').value = volta ? volta.porta : P.porta;
    campoMail('seguranca').value = volta ? volta.seguranca : P.seguranca;
  }
  const gm = ML.prov === 'gmail';
  $('#fldDe').hidden = gm;
  if (gm) campoMail('deEmail').value = campoMail('usuario').value.trim();
  $('#mailAvancado').open = ML.prov === 'outro';
  notaSenha();
}
// a senha salva só vale para o mesmo servidor, porta, segurança e usuário (o servidor confere a mesma regra)
function notaSenha() {
  const cf = ML.v && ML.v.config, s = campoMail('senha'), n = $('#notaSenha');
  if (!s || !n) return;
  const mesmo = !!(cf && cf.temSenha && cf.host === campoMail('host').value.trim().toLowerCase() && +cf.porta === +campoMail('porta').value && cf.seguranca === campoMail('seguranca').value && cf.usuario === campoMail('usuario').value.trim());
  if (mesmo && cf.senhaAbre) { s.placeholder = '•••••••• salva'; n.textContent = 'Deixe em branco para manter a senha salva.'; }
  else if (mesmo) { s.placeholder = ''; n.textContent = 'A senha salva não abre mais (a chave do servidor mudou). Digite de novo.'; }
  else { s.placeholder = ''; n.textContent = cf && cf.temSenha ? 'Mudou o servidor ou o usuário: digite a senha.' : ''; }
}
function dadosFormEmail() {
  const u = campoMail('usuario').value.trim();
  return {
    provedor: ML.prov, host: campoMail('host').value.trim(), porta: +campoMail('porta').value, seguranca: campoMail('seguranca').value,
    usuario: u, senha: campoMail('senha').value, deNome: campoMail('deNome').value.trim(), deEmail: ML.prov === 'gmail' ? u : campoMail('deEmail').value.trim()
  };
}
const resultadoEmail = (tipo, msg) => resultadoEm('#mailRes', tipo, msg);
function resultadoEm(sel, tipo, msg) {
  const r = $(sel);
  if (!r) return;
  r.className = 'mail-res' + (tipo ? ' ' + tipo : '');
  r.innerHTML = (tipo === 'ok' ? svgCfg('ok') : tipo === 'erro' ? svgCfg('erro') : tipo === 'vai' ? '<span class="mail-gira" aria-hidden="true"></span>' : '') + (msg ? '<span>' + esc(msg) + '</span>' : '');
}
function ligaFormEmail() {
  const f = $('#fMail'), prov = $('.mail-prov');
  prov.addEventListener('click', (e) => { const b = e.target.closest('[data-prov]'); if (b && b.dataset.prov !== ML.prov) aplicaProvedor(b.dataset.prov, true); });
  prov.addEventListener('keydown', (e) => {
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    const ids = Object.keys(PROVEDORES), n = ids[(ids.indexOf(ML.prov) + d + ids.length) % ids.length];
    aplicaProvedor(n, true); $('.mail-prov [data-prov="' + n + '"]').focus();
  });
  $('#verSenha').addEventListener('click', (e) => { const s = campoMail('senha'), on = s.type === 'password'; s.type = on ? 'text' : 'password'; e.target.textContent = on ? 'esconder' : 'mostrar'; e.target.setAttribute('aria-pressed', on); });
  ['host', 'porta', 'usuario'].forEach((n) => campoMail(n).addEventListener('input', notaSenha));
  campoMail('usuario').addEventListener('input', () => { if (ML.prov === 'gmail') campoMail('deEmail').value = campoMail('usuario').value.trim(); });
  campoMail('usuario').addEventListener('change', () => { const u = campoMail('usuario').value.trim(); if (!campoMail('para').value.trim() && ML.prov === 'gmail' && /@/.test(u)) campoMail('para').value = u; });
  campoMail('seguranca').addEventListener('change', () => { const pt = { ssl: 465, starttls: 587 }[campoMail('seguranca').value], at = +campoMail('porta').value; if (pt && (at === 465 || at === 587)) campoMail('porta').value = pt; notaSenha(); });
  $('#mailTeste').addEventListener('click', enviaTesteEmail);
  f.addEventListener('submit', salvaEmail);
}
async function enviaTesteEmail() {
  const b = $('#mailTeste'), para = campoMail('para').value.trim();
  if (!para) { campoMail('para').focus(); resultadoEmail('erro', 'Digite o email que vai receber o teste.'); return; }
  b.disabled = true;
  b.classList.remove('enviando'); void b.offsetWidth; b.classList.add('enviando');
  resultadoEmail('vai', 'Enviando o teste…');
  try {
    const r = await api('POST', '/api/ajustes/email/teste', { para, config: dadosFormEmail() });
    resultadoEmail('ok', 'Enviado por ' + nomeVia(r.via) + '! Confira a caixa de entrada de ' + r.para + ' (e o spam).');
  } catch (er) { resultadoEmail('erro', er.message); }
  b.disabled = false;
  setTimeout(() => b.classList.remove('enviando'), 950);
}
async function salvaEmail(e) {
  e.preventDefault();
  const b = $('#mailSalvar');
  b.disabled = true; b.textContent = 'Conferindo o servidor…';
  resultadoEmail('vai', 'Conferindo o servidor e a senha…');
  try {
    const v = await api('PUT', '/api/ajustes/email', Object.assign({ ativo: true }, dadosFormEmail()));
    ML.v = v;
    campoMail('senha').value = ''; notaSenha();
    desenhaStatus(v, true);
    resultadoEmail('ok', 'Salvo! A partir de agora os códigos saem por ' + nomeVia(v.efetivo.via) + '.');
    toast('Email salvo.');
  } catch (er) { resultadoEmail('erro', er.message); }
  b.disabled = false; b.textContent = 'Salvar e usar';
}
async function desligaEmail() {
  const amb = ML.v.ambiente.tipo;
  if (!confirm(amb === 'teste' ? 'Voltar para a caixa de teste? Os clientes deixam de receber o código por email.' : amb === 'smtp' ? 'Voltar para o email padrão do servidor?' : 'Desligar o envio? Os clientes deixam de receber o código por email.')) return;
  try {
    const v = await api('PUT', '/api/ajustes/email', { ativo: false });
    ML.v = v; desenhaStatus(v, true); resultadoEmail('', ''); notaSenha();
    toast(amb === 'teste' ? 'De volta à caixa de teste.' : 'Pronto.');
  } catch (er) { toast(er.message); }
}

/* ======================= Login com Google ======================= */
const MG = { v: null };
const ID_GOOGLE_FORMATO = /^\d{6,20}-[a-z0-9]{8,64}\.apps\.googleusercontent\.com$/;
const campoG = (n) => { const f = $('#fGoogle'); return f ? f.elements.namedItem(n) : null; };
function pontoGoogle(v) {
  const p = $('#cfgPonto-google');
  if (!p) return;
  p.className = 'cfg-ponto ' + (v.ligado ? 'ok' : 'off'); p.hidden = false;
  p.title = v.ligado ? 'Botão do Google ligado' : 'Botão do Google desligado';
}
function arteLogin(est) {
  return '<svg viewBox="0 0 80 80"><rect class="env" x="3" y="21" width="58" height="30" rx="15"/><circle class="traco" cx="18" cy="36" r="6.5"/><path class="traco" d="M30 32.5h19M30 40h12"/>' +
    '<circle class="selo" cx="60" cy="58" r="14"/><path class="simb" pathLength="1" d="' + (est === 'ok' ? 'M53.5 58.5l4.5 4.5 8.5-9' : 'M54 58h12') + '"/></svg>';
}
// endereços que o Google precisa conhecer ("Origens JavaScript autorizadas"); o Google só aceita https ou localhost
function origensGoogle(siteUrl) {
  const l = location, lista = [];
  if (l.hostname === 'localhost') lista.push('http://localhost', 'http://localhost' + (l.port ? ':' + l.port : ''));
  else if (l.protocol === 'https:') lista.push(l.origin);
  if (siteUrl) { try { lista.push(new URL(siteUrl).origin); } catch (e) { /* SITE_URL inválida */ } }
  return Array.from(new Set(lista));
}
let gisGestao = null;
function carregaGis() {
  if (window.google && window.google.accounts && window.google.accounts.id) return Promise.resolve();
  if (!gisGestao) gisGestao = new Promise((ok, falha) => { const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = ok; s.onerror = () => { gisGestao = null; falha(new Error('google')); }; document.head.appendChild(s); });
  return gisGestao;
}

async function cfgGoogle(abas) {
  const v = await api('GET', '/api/ajustes/google');
  MG.v = v;
  const origens = origensGoogle(v.siteUrl);
  const local = location.hostname === 'localhost', seguro = location.protocol === 'https:';
  const aviso = local || seguro ? '' : '<p class="g-aviso">Você abriu a gestão por <b>' + esc(location.origin) + '</b>, e o Google não aceita endereços http da rede. Para testar, abra <a class="link forte" href="http://localhost:' + esc(location.port || '80') + '/gestao#/configuracoes/google">a gestão em localhost</a> neste computador. Para os clientes, o site precisa estar em https.</p>';
  const valorId = (v.config && v.config.clientId) || v.clientId || '';
  $('#conteudo').innerHTML = abas + '<div class="mail">' +
    '<section class="card mail-status" id="gStatus"></section>' +
    '<section class="card mail-form"><h3>Ligar o "Continuar com Google"</h3>' +
    '<p class="nota">O cliente entra com a conta Google em um toque, sem esperar código. É grátis e se faz uma vez só (uns 10 minutos):</p>' +
    '<ol class="g-passos">' +
    '<li><div><b>Crie um projeto</b> no Google Cloud, com o nome da pizzaria.</div><a class="btn sm" href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener">Abrir o Google Cloud ↗</a></li>' +
    '<li><div>Na <b>tela de consentimento</b> (Google Auth Platform), preencha o nome do app, o email de suporte e escolha o público <b>Externo</b>. Depois, em <b>Público</b>, clique em <b>Publicar app</b>: enquanto ele estiver "em teste", só os emails cadastrados como testadores conseguem entrar.</div><a class="btn sm" href="https://console.cloud.google.com/apis/credentials/consent" target="_blank" rel="noopener">Abrir a tela de consentimento ↗</a></li>' +
    '<li><div>Em <b>Credenciais → Criar credenciais → ID do cliente OAuth</b>, escolha <b>Aplicativo da Web</b> e, em <b>Origens JavaScript autorizadas</b>, adicione:</div>' +
    (origens.length ? '<div class="g-origens">' + origens.map((o) => '<span class="g-origem"><span>' + esc(o) + '</span><button type="button" class="link" data-copia="' + esc(o) + '">copiar</button></span>').join('') + '</div>' : '') + aviso +
    '<div class="nota">Não precisa de "URI de redirecionamento". Quando o site estiver na internet, adicione também o endereço https dele.</div><a class="btn sm" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Abrir as credenciais ↗</a></li>' +
    '<li><div><b>Copie o ID do cliente</b> que o Google mostrar e cole abaixo.</div></li>' +
    '</ol>' +
    '<form class="mail-campos" id="fGoogle" novalidate autocomplete="off">' +
    '<label class="fld"><span>ID do cliente</span><input class="campo" name="clientId" spellcheck="false" maxlength="140" placeholder="1234567890-abc123def456.apps.googleusercontent.com" value="' + esc(valorId) + '"></label>' +
    '<div class="g-teste"><button type="button" class="btn" id="gTestar">Testar o botão aqui</button><div class="g-botao" id="gBotao"></div></div>' +
    '<p class="mail-res" id="gRes" role="status" aria-live="polite"></p>' +
    '<div class="mail-acoes"><button type="submit" class="btn prim grande" id="gSalvar">Salvar e ligar</button><span class="nota">Teste antes de ligar. Se o Google mostrar "origin_mismatch", falta cadastrar o endereço do passo 3.</span></div>' +
    '</form></section></div>';
  desenhaStatusGoogle(v, false);
  $('.g-passos').addEventListener('click', copiaOrigem);
  $('#gTestar').addEventListener('click', testaGoogle);
  $('#fGoogle').addEventListener('submit', salvaGoogle);
  campoG('clientId').addEventListener('input', () => { $('#gBotao').innerHTML = ''; resultadoEm('#gRes', '', ''); });
}
function copiaOrigem(e) {
  const b = e.target.closest('[data-copia]');
  if (!b) return;
  const t = b.dataset.copia;
  (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => { b.textContent = 'copiado ✓'; setTimeout(() => { b.textContent = 'copiar'; }, 1600); }, () => prompt('Copie o endereço:', t));
}
function desenhaStatusGoogle(v, animar) {
  const box = $('#gStatus');
  if (!box) return;
  const est = v.ligado ? 'ok' : 'off', cf = v.config;
  const sub = v.ligado ? 'ID do cliente: <span class="g-id">' + esc(v.clientId) + '</span>' : 'Os clientes entram com o código por email. Ligue o Google para entrarem com um toque.';
  const quem = v.origem === 'gestao' && cf && cf.atualizadoEm ? '<p class="nota">' + (cf.ativo ? 'Ligado' : 'Desligado') + ' por ' + esc(cf.atualizadoPor || 'alguém') + ' ' + quando(cf.atualizadoEm) + '.</p>'
    : v.ligado ? '<p class="nota">Vem do GOOGLE_CLIENT_ID do servidor; salvar aqui passa a valer o da gestão.</p>' : '';
  box.className = 'card mail-status ' + est;
  box.innerHTML = '<div class="mail-arte" aria-hidden="true">' + arteLogin(est) + '</div><div class="mail-info"><span class="mail-rot">O botão "Continuar com Google" no site está</span><strong class="mail-via">' + (v.ligado ? 'Ligado' : 'Desligado') + '</strong>' +
    '<p class="mail-sub">' + sub + '</p>' + quem + (v.ligado ? '<button type="button" class="link perigo" id="gDesliga">Desligar o botão do Google</button>' : '') + '</div>';
  if (animar && !REDUZ) { box.classList.remove('muda'); void box.offsetWidth; box.classList.add('muda'); }
  pontoGoogle(v);
  const d = $('#gDesliga');
  if (d) d.addEventListener('click', desligaGoogle);
}
function idDoCampo() {
  const id = campoG('clientId').value.trim().toLowerCase();
  if (!ID_GOOGLE_FORMATO.test(id)) { resultadoEm('#gRes', 'erro', 'Esse não parece um ID do cliente do Google. Ele termina em .apps.googleusercontent.com.'); campoG('clientId').focus(); return null; }
  return id;
}
async function testaGoogle() {
  const id = idDoCampo();
  if (!id) return;
  resultadoEm('#gRes', 'vai', 'Carregando o botão do Google…');
  try { await carregaGis(); } catch (e) { resultadoEm('#gRes', 'erro', 'Não consegui carregar o Google. Confira a internet deste computador.'); return; }
  const box = $('#gBotao');
  box.innerHTML = '';
  try {
    google.accounts.id.initialize({ client_id: id, callback: (r) => confereTesteGoogle(id, r), ux_mode: 'popup', auto_select: false, use_fedcm_for_prompt: true });
    google.accounts.id.renderButton(box, { type: 'standard', theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', logo_alignment: 'center', locale: 'pt-BR', width: 280 });
  } catch (e) { resultadoEm('#gRes', 'erro', 'O Google não aceitou esse ID: ' + e.message); return; }
  resultadoEm('#gRes', '', 'Clique no botão do Google e entre com qualquer conta. Nada fica salvo: é só para conferir.');
}
async function confereTesteGoogle(id, r) {
  resultadoEm('#gRes', 'vai', 'Conferindo com o servidor…');
  try {
    const j = await api('POST', '/api/ajustes/google/teste', { clientId: id, credential: r && r.credential });
    resultadoEm('#gRes', 'ok', 'Funcionou! O Google confirmou ' + j.email + '. Pode salvar e ligar.');
  } catch (er) { resultadoEm('#gRes', 'erro', er.message); }
}
async function salvaGoogle(e) {
  e.preventDefault();
  const id = idDoCampo();
  if (!id) return;
  const b = $('#gSalvar');
  b.disabled = true;
  try {
    const v = await api('PUT', '/api/ajustes/google', { ativo: true, clientId: id });
    MG.v = v; desenhaStatusGoogle(v, true);
    resultadoEm('#gRes', 'ok', 'Ligado! O botão "Continuar com Google" já aparece no site (em localhost e no endereço https).');
    toast('Google ligado.');
  } catch (er) { resultadoEm('#gRes', 'erro', er.message); }
  b.disabled = false;
}
async function desligaGoogle() {
  if (!confirm('Desligar o "Continuar com Google"? Os clientes continuam entrando com o código por email.')) return;
  try {
    const v = await api('PUT', '/api/ajustes/google', { ativo: false });
    MG.v = v; desenhaStatusGoogle(v, true); resultadoEm('#gRes', '', '');
    toast('Botão do Google desligado.');
  } catch (er) { toast(er.message); }
}

/* ======================= Equipe (quem entra na gestão) ======================= */
const EQ = { lista: [], eu: '', loginManual: false, destaca: null };
async function cfgEquipe(abas) {
  const j = await api('GET', '/api/equipe');
  EQ.lista = j.usuarios; EQ.eu = j.eu; EQ.loginManual = false;
  $('#conteudo').innerHTML = abas + '<div class="eq">' +
    '<section class="card eq-senha" id="eqSenha" hidden aria-live="polite"></section>' +
    '<section class="card"><div class="card-topo"><div><h3>Quem entra na gestão</h3><p id="eqResumo"></p></div></div><ul class="eq-lista" id="eqLista"></ul></section>' +
    '<section class="card"><h3>Adicionar uma pessoa</h3><p class="nota">O sistema cria uma senha provisória para você passar para a pessoa. No primeiro acesso, a própria pessoa escolhe a senha.</p>' +
    '<form class="eq-form" id="fEquipe" novalidate autocomplete="off"><div class="fld-duplo">' +
    '<label class="fld"><span>Nome</span><input class="campo" name="nome" maxlength="60" placeholder="Ex.: Maria Souza" autocomplete="off"></label>' +
    '<label class="fld"><span>Usuário (para entrar)</span><input class="campo" name="login" maxlength="40" spellcheck="false" autocapitalize="none" autocomplete="off" placeholder="maria"></label></div>' +
    '<label class="eq-admin"><input type="checkbox" name="admin"><span><b>Administrador</b><small>Também mexe em Configurações, Equipe, Entregadores e no cardápio.</small></span></label>' +
    '<p class="mail-res" id="eqRes" role="status" aria-live="polite"></p><div class="linha-form"><button type="submit" class="btn prim">Adicionar e gerar a senha</button></div></form></section>' +
    '<section class="card eq-papeis"><h3>O que cada um vê</h3><dl><dt><span class="eq-papel adm">Administrador</span></dt><dd>Tudo: pedidos, clientes, relatórios, configurações, equipe, entregadores e o cardápio do site.</dd>' +
    '<dt><span class="eq-papel">Equipe</span></dt><dd>Pedidos ao vivo, lista de pedidos, clientes e relatórios. Não muda configurações nem a equipe.</dd></dl>' +
    '<p class="nota">Cada pessoa com o seu usuário: o histórico do pedido mostra quem mudou cada status. Quando alguém sai da pizzaria, use <b>Tirar acesso</b>: a pessoa sai da gestão na hora, em todos os aparelhos.</p></section>' +
    '</div>';
  desenhaEquipe();
  $('#eqLista').addEventListener('click', acaoEquipe);
  const f = $('#fEquipe');
  f.elements.namedItem('nome').addEventListener('input', () => { if (!EQ.loginManual) f.elements.namedItem('login').value = sugereLogin(f.elements.namedItem('nome').value); resultadoEm('#eqRes', '', ''); });
  f.elements.namedItem('login').addEventListener('input', (e) => { EQ.loginManual = !!e.target.value; e.target.value = e.target.value.toLowerCase().replace(/\s+/g, ''); resultadoEm('#eqRes', '', ''); });
  f.addEventListener('submit', adicionaPessoa);
}
function sugereLogin(nome) {
  const p = semAcento(nome).replace(/[^a-z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '';
  const usados = new Set(EQ.lista.map((u) => u.login));
  const opcoes = [p[0], p.length > 1 ? p[0] + '.' + p[p.length - 1] : null, p[0] + (p.length > 1 ? p[p.length - 1][0] : '')].filter((x) => x && x.length >= 3);
  for (const o of opcoes) if (!usados.has(o)) return o.slice(0, 40);
  for (let i = 2; i < 100; i++) if (!usados.has(p[0] + i)) return (p[0] + i).slice(0, 40);
  return '';
}
function desenhaEquipe() {
  const ativos = EQ.lista.filter((u) => u.ativo);
  $('#eqResumo').textContent = num(ativos.length) + (ativos.length === 1 ? ' pessoa' : ' pessoas') + ' com acesso · ' + num(ativos.filter((u) => u.admin).length) + ' administrador' + (ativos.filter((u) => u.admin).length === 1 ? '' : 'es');
  $('#eqLista').innerHTML = EQ.lista.map((u, i) => {
    const eu = u.id === EQ.eu;
    const acesso = u.ultimoAcesso ? 'entrou ' + quando(u.ultimoAcesso) : 'ainda não entrou';
    const selo = !u.ativo ? '<span class="eq-selo off">sem acesso</span>' : u.trocarSenha ? '<span class="eq-selo pend">falta criar a senha</span>' : '';
    return '<li class="eq-item' + (u.ativo ? '' : ' off') + (EQ.destaca === u.id ? ' novo' : '') + '" data-id="' + esc(u.id) + '" style="--i:' + i + '">' +
      '<span class="avatar' + (u.admin ? ' adm' : '') + '">' + esc(iniciais(u.nome)) + '</span>' +
      '<div class="eq-quem"><b>' + esc(u.nome) + (eu ? ' <small>(você)</small>' : '') + '</b><span><span class="eq-papel' + (u.admin ? ' adm' : '') + '">' + (u.admin ? 'Administrador' : 'Equipe') + '</span> <code>' + esc(u.login) + '</code> · ' + esc(acesso) + '</span>' + selo + '</div>' +
      '<div class="eq-acoes">' + (eu ? '<a class="btn sm" href="#/configuracoes/senha">' + svgCfg('chave') + 'Minha senha</a>' :
        (u.ativo ? '<button type="button" class="btn sm" data-eq="senha">' + svgCfg('chave') + 'Senha nova</button><button type="button" class="btn sm" data-eq="admin">' + (u.admin ? 'Tirar admin' : 'Tornar admin') + '</button>' : '') +
        '<button type="button" class="btn sm' + (u.ativo ? ' perigo' : '') + '" data-eq="ativo">' + (u.ativo ? 'Tirar acesso' : 'Devolver acesso') + '</button>' +
        (u.ativo ? '' : '<button type="button" class="link perigo" data-eq="remover">Remover</button>')) + '</div></li>';
  }).join('');
  EQ.destaca = null;
}
async function recarregaEquipe(destaca) {
  const j = await api('GET', '/api/equipe');
  EQ.lista = j.usuarios; EQ.eu = j.eu; EQ.destaca = destaca || null;
  desenhaEquipe();
}
async function adicionaPessoa(e) {
  e.preventDefault();
  const f = e.target, b = f.querySelector('button[type=submit]');
  const nome = f.elements.namedItem('nome').value.trim(), login = f.elements.namedItem('login').value.trim().toLowerCase();
  if (!nome) { resultadoEm('#eqRes', 'erro', 'Falta o nome.'); f.elements.namedItem('nome').focus(); return; }
  if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(login)) { resultadoEm('#eqRes', 'erro', 'Usuário: de 3 a 40 letras minúsculas, números, ponto, hífen ou sublinhado, sem espaços.'); f.elements.namedItem('login').focus(); return; }
  b.disabled = true; resultadoEm('#eqRes', 'vai', 'Criando…');
  try {
    const r = await api('POST', '/api/equipe', { nome, login, admin: f.elements.namedItem('admin').checked });
    f.reset(); EQ.loginManual = false; resultadoEm('#eqRes', '', '');
    await recarregaEquipe(r.usuario.id);
    mostraSenhaProvisoria(r.usuario, r.senhaProvisoria, true);
  } catch (er) { resultadoEm('#eqRes', 'erro', er.message); }
  b.disabled = false;
}
function mostraSenhaProvisoria(u, senha, nova) {
  const box = $('#eqSenha');
  const endereco = location.origin + '/gestao';
  const texto = 'Gestão da ' + nomeLoja() + '\nEndereço: ' + endereco + '\nUsuário: ' + u.login + '\nSenha provisória: ' + senha + '\nNo primeiro acesso, o sistema pede para você criar a sua senha.';
  box.hidden = false;
  box.innerHTML = '<div class="eq-senha-topo"><span class="eq-chave" aria-hidden="true">' + svgCfg('chave') + '</span><div><b>' + (nova ? 'Pronto: ' + esc(u.nome) + ' já pode entrar.' : 'Senha nova de ' + esc(u.nome) + '.') + '</b>' +
    '<span>Passe estes dados para a pessoa. A senha aparece só agora e vale só para o primeiro acesso.</span></div></div>' +
    '<dl class="eq-dados"><dt>Endereço</dt><dd>' + esc(endereco) + '</dd><dt>Usuário</dt><dd><code>' + esc(u.login) + '</code></dd><dt>Senha provisória</dt><dd><code class="eq-prov">' + esc(senha) + '</code></dd></dl>' +
    '<div class="linha-form"><button type="button" class="btn prim" id="eqCopia">Copiar os dados</button><button type="button" class="link" id="eqEsconde">Já passei, esconder</button></div>';
  if (!REDUZ) { box.classList.remove('entra'); void box.offsetWidth; box.classList.add('entra'); }
  box.scrollIntoView({ block: 'nearest', behavior: REDUZ ? 'auto' : 'smooth' });
  $('#eqCopia').addEventListener('click', (e) => {
    (navigator.clipboard ? navigator.clipboard.writeText(texto) : Promise.reject()).then(() => { e.target.textContent = 'Copiado ✓'; setTimeout(() => { if (e.target.isConnected) e.target.textContent = 'Copiar os dados'; }, 1800); }, () => prompt('Copie os dados:', texto.replace(/\n/g, ' · ')));
  });
  $('#eqEsconde').addEventListener('click', () => { box.hidden = true; box.innerHTML = ''; });
}
async function acaoEquipe(e) {
  const b = e.target.closest('[data-eq]');
  if (!b) return;
  const li = b.closest('.eq-item'), u = EQ.lista.find((x) => x.id === li.dataset.id);
  if (!u) return;
  const acao = b.dataset.eq;
  let corpo = null, metodo = 'PATCH', msg = '';
  if (acao === 'senha') {
    if (!confirm('Gerar uma senha nova para ' + u.nome + '? A senha atual deixa de funcionar e a pessoa sai de todos os aparelhos.')) return;
    corpo = { novaSenha: true };
  } else if (acao === 'admin') {
    if (u.admin && !confirm('Tirar o acesso de administrador de ' + u.nome + '? A pessoa continua vendo pedidos e relatórios.')) return;
    corpo = { admin: !u.admin }; msg = u.admin ? u.nome + ' agora é da equipe.' : u.nome + ' agora tem acesso de administrador.';
  } else if (acao === 'ativo') {
    if (u.ativo && !confirm('Tirar o acesso de ' + u.nome + '? A pessoa sai da gestão na hora, em todos os aparelhos.')) return;
    corpo = { ativo: !u.ativo }; msg = u.ativo ? u.nome + ' não entra mais na gestão.' : u.nome + ' voltou a ter acesso.';
  } else if (acao === 'remover') {
    if (!confirm('Remover ' + u.nome + ' da lista? Os pedidos antigos continuam com esse nome no histórico.')) return;
    metodo = 'DELETE'; msg = u.nome + ' saiu da lista.';
  } else return;
  b.disabled = true;
  try {
    const r = await api(metodo, '/api/equipe/' + encodeURIComponent(u.id), corpo || undefined);
    await recarregaEquipe(metodo === 'DELETE' ? null : u.id);
    if (r && r.senhaProvisoria) mostraSenhaProvisoria(r.usuario, r.senhaProvisoria, false);
    else if (msg) toast(msg);
  } catch (er) { toast(er.message); b.disabled = false; }
}

/* ---------- minha senha (qualquer pessoa da equipe) e "Crie a sua senha" do primeiro acesso ---------- */
function htmlMinhaSenha() {
  return '<section class="card" id="minhaSenha"><h3>Minha senha</h3><p class="nota">Você entra como <b>' + esc(E.usuario.nome) + '</b>. Ao trocar a senha, os outros aparelhos com o seu usuário saem; este continua.</p>' +
    '<form class="eq-form" id="fMinha" novalidate><label class="fld"><span>Senha atual</span><input class="campo" type="password" name="atual" autocomplete="current-password"></label>' +
    '<div class="fld-duplo"><label class="fld"><span>Nova senha</span><input class="campo" type="password" name="nova" autocomplete="new-password"></label><label class="fld"><span>Repita a nova senha</span><input class="campo" type="password" name="repete" autocomplete="new-password"></label></div>' +
    '<p class="mail-res" id="minhaRes" role="status" aria-live="polite"></p><div class="linha-form"><button type="submit" class="btn prim">Trocar a senha</button><span class="nota">Pelo menos 8 caracteres. Uma frase curta é fácil de lembrar e difícil de adivinhar.</span></div></form></section>';
}
function ligaMinhaSenha(f, resSel, depois) {
  if (!f) return;
  f.addEventListener('input', () => resultadoEm(resSel, '', ''));
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const atual = f.elements.namedItem('atual').value, nova = f.elements.namedItem('nova').value, rep = f.elements.namedItem('repete').value;
    if (!atual) { resultadoEm(resSel, 'erro', 'Digite a senha atual.'); f.elements.namedItem('atual').focus(); return; }
    if (nova.length < 8) { resultadoEm(resSel, 'erro', 'A nova senha precisa de pelo menos 8 caracteres.'); f.elements.namedItem('nova').focus(); return; }
    if (nova !== rep) { resultadoEm(resSel, 'erro', 'As duas senhas novas não são iguais.'); f.elements.namedItem('repete').focus(); return; }
    const b = f.querySelector('button[type=submit]');
    b.disabled = true; resultadoEm(resSel, 'vai', 'Trocando…');
    try { await api('POST', '/api/equipe/minha-senha', { atual, nova }); resultadoEm(resSel, 'ok', 'Senha trocada.'); depois(); }
    catch (er) { resultadoEm(resSel, 'erro', er.status === 429 ? 'Muitas tentativas. Espere alguns minutos.' : er.message); }
    b.disabled = false;
  });
}
function telaCriaSenha(usuario) {
  $('#raiz').innerHTML = '<main class="login"><form class="login-card eq-cria" id="fMinha" novalidate><img src="' + LOGOS.v + '" alt="' + esc(nomeLoja()) + '">' +
    '<h1>Crie a sua senha</h1><p>Olá, ' + esc(primeiroNome(usuario.nome)) + '! A senha que você recebeu vale só para este primeiro acesso.</p>' +
    '<label>Senha que você recebeu<input type="password" name="atual" autocomplete="current-password"></label>' +
    '<label>Nova senha<input type="password" name="nova" autocomplete="new-password"></label>' +
    '<label>Repita a nova senha<input type="password" name="repete" autocomplete="new-password"></label>' +
    '<p class="mail-res" id="criaRes" role="status" aria-live="polite"></p><button class="btn prim grande" type="submit">Salvar e entrar</button>' +
    '<button type="button" class="link" id="criaSair">Sair</button></form></main>';
  $('#fMinha').elements.namedItem('atual').focus();
  ligaMinhaSenha($('#fMinha'), '#criaRes', () => setTimeout(() => location.reload(), 500));
  $('#criaSair').addEventListener('click', async () => { try { await api('POST', '/api/logout', {}); } catch (e) { /* já saiu */ } location.reload(); });
}
