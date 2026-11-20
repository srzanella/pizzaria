'use strict';
/*
 * Envio de email: o código de acesso dos clientes.
 *
 * Quem decide por onde sai é a gestão (Configurações → Email). A configuração fica no banco (config "email"),
 * vale para todas as instâncias sem reiniciar, e a senha fica cifrada (AES-256-GCM) com a CHAVE_SEGREDOS do
 * ambiente (sem ela, uma chave tirada do DATABASE_URL). Se a chave mudar, a senha salva deixa de abrir e a gestão
 * pede de novo. A senha nunca volta para o navegador.
 *
 * Sem configuração ativa na gestão, vale o ambiente:
 *  - SMTP_URL=smtp://usuario:senha@servidor:587 (ou smtps://…:465), ou SMTP_HOST, SMTP_PORT, SMTP_USUARIO, SMTP_SENHA
 *  - EMAIL_DE="Pizzaria Pereira <nao-responda@seudominio.com.br>"
 *  - sem nada: simulado (o código aparece só no log do servidor)
 * No docker-compose de desenvolvimento, o ambiente aponta para a caixa de teste (Mailpit, http://localhost:8025).
 */
const crypto = require('crypto');
let nodemailer = null;
const mailer = () => (nodemailer = nodemailer || require('nodemailer'));

const PADRAO_DE = 'Pizzaria Pereira <nao-responda@pizzariapereira.com.br>';
const TEMPOS = { connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000 };
const emailValido = (e) => typeof e === 'string' && e.length <= 254 && /^[^\s@"'<>()[\],;:]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,24}$/i.test(e);
const hostValido = (h) => h.length > 0 && h.length <= 253 && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(h);
// rede interna (docker, localhost, IPs privados): o único lugar onde aceitamos mandar senha sem criptografia
const hostInterno = (h) => !h.includes('.') || /^(127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(h);
const agora = () => new Date().toISOString();
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- as mensagens ---------------- */
function cartao(ola, corpo) {
  return '<!doctype html><html lang="pt-BR"><body style="margin:0;background:#F6F2EA;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1E1B16">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px"><tr><td align="center">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:440px;width:100%;background:#fff;border-radius:22px;overflow:hidden;box-shadow:0 10px 30px -14px rgba(60,40,10,.35)">' +
    '<tr><td style="background:#0F4D23;padding:18px 24px;color:#FBF4E6;font:800 20px Georgia,serif">Pizzaria Pereira</td></tr>' +
    '<tr><td style="padding:26px 24px 8px;font-size:16px">' + ola + '</td></tr>' + corpo + '</table></td></tr></table></body></html>';
}
const digitos = (codigo, cor) => '<tr><td align="center" style="padding:14px 24px 6px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>' +
  codigo.split('').map((d) => '<td style="width:44px;height:56px;background:#FBF4E6;border-radius:12px;text-align:center;font:800 30px/56px Georgia,serif;color:' + cor + '">' + d + '</td>').join('<td style="width:8px"></td>') +
  '</tr></table></td></tr>';
function mensagemCodigo(codigo, nome) {
  const ola = nome ? 'Olá, ' + String(nome).trim().split(/\s+/)[0] + '!' : 'Olá!';
  return {
    assunto: codigo + ' é o seu código da Pizzaria Pereira',
    texto: [ola, '', 'Seu código para entrar no site da Pizzaria Pereira é: ' + codigo, '', 'Ele vale por 10 minutos. Se não foi você que pediu, é só ignorar este email.'].join('\n'),
    html: cartao(esc(ola) + '<br>Use este código para entrar no site:', digitos(codigo, '#0F4D23') +
      '<tr><td style="padding:14px 24px 26px;font-size:14px;color:#6B5E4E">Ele vale por 10 minutos. Se não foi você que pediu, é só ignorar este email: ninguém entra na sua conta sem este código.</td></tr>')
  };
}
function mensagemTeste() {
  return {
    assunto: 'Teste: o email da Pizzaria Pereira está funcionando',
    texto: 'Tudo certo! Este é um teste enviado pela gestão da Pizzaria Pereira.\n\nÉ assim que os clientes recebem o código para entrar no site (este é só um exemplo): 123456',
    html: cartao('<b>Tudo certo!</b> Este é um teste enviado pela gestão.<br>É assim que os clientes recebem o código para entrar no site:', digitos('123456', '#B9AE9C') +
      '<tr><td style="padding:14px 24px 26px;font-size:14px;color:#6B5E4E">(código de exemplo: este não serve para entrar)</td></tr>')
  };
}

/* ---------------- erros do servidor de email, em português ---------------- */
function explica(e, c) {
  c = c || {};
  const cod = String((e && e.code) || ''), rc = e && e.responseCode, bruto = String((e && (e.response || e.message)) || '');
  const servidor = (c.host || 'o servidor') + (c.porta ? ':' + c.porta : '');
  const gmail = c.provedor === 'gmail' || /gmail\.com$/i.test(c.host || '');
  if (cod === 'EDNS' || /ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(bruto)) return 'Não achei o servidor ' + (c.host || '') + '. Confira o endereço.';
  if (/ECONNREFUSED/.test(bruto)) return 'O servidor ' + servidor + ' recusou a conexão. Confira a porta.';
  if (cod === 'EAUTH' || rc === 535 || rc === 534) {
    return gmail ? 'O Gmail recusou o email ou a senha. Use uma senha de app (16 letras, criada em myaccount.google.com/apppasswords), não a senha normal da conta.'
      : 'O servidor recusou o usuário ou a senha. Confira os dois.';
  }
  if (cod === 'ENOAUTH' || rc === 530) return 'O servidor pede usuário e senha.';
  if (/wrong version number|packet length too long|ssl3_get_record|unknown protocol|EPROTO/i.test(bruto)) return 'A segurança não combina com a porta: SSL é na 465 e STARTTLS na 587.';
  if (cod === 'ETLS' || /STARTTLS/i.test(bruto)) return 'O servidor ' + servidor + ' não aceitou STARTTLS. Tente SSL na porta 465.';
  if (/certificate|self.signed|CERT_|altnames/i.test(bruto)) return 'O certificado de segurança de ' + (c.host || 'o servidor') + ' não é válido para esse endereço.';
  if (cod === 'ETIMEDOUT' || cod === 'ECONNECTION' || cod === 'ESOCKET' || /timeout|Greeting never received|closed unexpectedly/i.test(bruto)) {
    return 'O servidor ' + servidor + ' não respondeu. Confira a porta e a segurança (465 com SSL, 587 com STARTTLS) e se a rede libera essa porta.';
  }
  if ((rc === 550 || rc === 553 || rc === 554 || rc === 501 || rc === 552) && /sender|from|remetente|not owned|not allowed|not verified|domain/i.test(bruto)) {
    return 'O servidor não aceitou o remetente ' + (c.deEmail || '') + '. Use o mesmo email da conta, ou um remetente liberado no provedor.';
  }
  if (cod === 'EENVELOPE') return 'O servidor recusou o endereço: ' + bruto.replace(/\s+/g, ' ').slice(0, 160);
  return 'O servidor respondeu: ' + bruto.replace(/\s+/g, ' ').slice(0, 200);
}

module.exports = function criaEmail(ctx = {}) {
  const { pool, erro, json, lerCorpo, exigeAdmin, lerConfig, gravaConfig, limite, txt } = ctx;
  const comBanco = typeof lerConfig === 'function';

  /* ---------------- ambiente: o padrão quando a gestão não configurou nada ---------------- */
  const ambiente = (() => {
    const url = String(process.env.SMTP_URL || '').trim(), host = String(process.env.SMTP_HOST || '').trim();
    let o = null;
    try {
      if (url) {
        const u = new URL(url), ssl = u.protocol === 'smtps:';
        o = { host: u.hostname, port: +u.port || (ssl ? 465 : 587), secure: ssl, auth: u.username ? { user: decodeURIComponent(u.username), pass: decodeURIComponent(u.password) } : undefined };
      } else if (host) {
        const porta = +process.env.SMTP_PORT || 587;
        o = { host, port: porta, secure: process.env.SMTP_SEGURO === '1' || porta === 465, auth: process.env.SMTP_USUARIO ? { user: process.env.SMTP_USUARIO, pass: process.env.SMTP_SENHA || '' } : undefined };
      }
    } catch (e) { console.error('SMTP_URL inválida (' + e.message + '): os emails ficam simulados.'); o = null; }
    if (!o) return { tipo: 'simulado', via: '' };
    return { tipo: /^(correio|mailpit)$/i.test(o.host) ? 'teste' : 'smtp', via: o.host, opcoes: Object.assign({}, TEMPOS, o), de: process.env.EMAIL_DE || PADRAO_DE };
  })();

  /* ---------------- a senha do SMTP, cifrada no banco ---------------- */
  const CHAVE = crypto.createHash('sha256').update('pp-segredos:' + (ctx.segredo || process.env.CHAVE_SEGREDOS || process.env.DATABASE_URL || 'pizzaria-pereira')).digest();
  const ID_CHAVE = crypto.createHash('sha256').update(CHAVE).digest('hex').slice(0, 10);
  function cifra(texto) {
    const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', CHAVE, iv);
    const d = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
    return { v: 1, k: ID_CHAVE, iv: iv.toString('base64'), d: d.toString('base64'), t: c.getAuthTag().toString('base64') };
  }
  function decifra(o) {
    if (!o || o.v !== 1 || o.k !== ID_CHAVE) return null;
    try {
      const dc = crypto.createDecipheriv('aes-256-gcm', CHAVE, Buffer.from(o.iv, 'base64'));
      dc.setAuthTag(Buffer.from(o.t, 'base64'));
      return Buffer.concat([dc.update(Buffer.from(o.d, 'base64')), dc.final()]).toString('utf8');
    } catch (e) { return null; }
  }

  /* ---------------- por onde sai agora (lido do banco a cada envio: vale para todas as instâncias) ---------------- */
  const opcoesDe = (f, senha) => Object.assign({}, TEMPOS, {
    host: f.host, port: f.porta, secure: f.seguranca === 'ssl', requireTLS: f.seguranca === 'starttls', ignoreTLS: f.seguranca === 'nenhuma',
    auth: f.usuario ? { user: f.usuario, pass: senha } : undefined
  });
  async function atual() {
    const g = comBanco ? await lerConfig('email', null) : null;
    if (g && g.ativo) {
      const base = { origem: 'gestao', tipo: 'smtp', via: g.host, cfg: g, de: { name: g.deNome || 'Pizzaria Pereira', address: g.deEmail } };
      const senha = g.usuario ? decifra(g.senha) : '';
      if (senha == null) return Object.assign(base, { erro: 'A senha do email salva na gestão não abre mais (a CHAVE_SEGREDOS do servidor mudou?). Digite a senha de novo em Configurações → Email.' });
      return Object.assign(base, { opcoes: opcoesDe(g, senha) });
    }
    return Object.assign({ origem: 'ambiente' }, ambiente);
  }
  let cache = { chave: '', t: null };
  function transporte(op) {
    const chave = JSON.stringify(Object.assign({}, op, { auth: op.auth ? [op.auth.user, crypto.createHash('sha256').update(String(op.auth.pass)).digest('hex')] : null }));
    if (cache.chave !== chave) {
      try { if (cache.t) cache.t.close(); } catch (e) { /* já fechado */ }
      cache = { chave, t: mailer().createTransport(op) };
    }
    return cache.t;
  }
  // último envio (ok ou erro), para a gestão mostrar; junta no JSON do banco sem apagar o resto
  async function marca(patch) {
    if (pool) await pool.query("INSERT INTO config (chave, valor) VALUES ('emailStatus', $1::jsonb) ON CONFLICT (chave) DO UPDATE SET valor = config.valor || excluded.valor", [JSON.stringify(patch)]);
  }

  async function enviaCodigo(para, codigo, nome) {
    const a = await atual();
    if (a.tipo === 'simulado') { console.log('[email simulado] para ' + para + ': código ' + codigo); return; }
    if (a.erro) { marca({ erro: a.erro, erroEm: agora(), via: a.via }).catch(() => {}); throw new Error(a.erro); }
    const m = mensagemCodigo(codigo, nome);
    try {
      await transporte(a.opcoes).sendMail({ from: a.de, to: para, subject: m.assunto, text: m.texto, html: m.html });
      marca({ okEm: agora(), via: a.via }).catch(() => {});
    } catch (e) {
      marca({ erro: explica(e, a.cfg || { host: a.via }), erroEm: agora(), via: a.via }).catch(() => {});
      throw e;
    }
  }

  /* ---------------- gestão: Configurações → Email (só administradores) ---------------- */
  const deTexto = (d) => (!d ? '' : typeof d === 'string' ? d : (d.name ? d.name + ' <' + d.address + '>' : d.address));
  async function visao() {
    const [g, st, a] = await Promise.all([lerConfig('email', null), lerConfig('emailStatus', null), atual()]);
    const s = st || {};
    return {
      efetivo: { origem: a.origem, tipo: a.tipo, via: a.via || '', de: deTexto(a.de), erro: a.erro || '' },
      ambiente: { tipo: ambiente.tipo, via: ambiente.via || '' },
      config: g ? {
        ativo: !!g.ativo, provedor: g.provedor || 'outro', host: g.host, porta: g.porta, seguranca: g.seguranca, usuario: g.usuario || '',
        temSenha: !!g.senha, senhaAbre: !g.senha || decifra(g.senha) != null, deNome: g.deNome || '', deEmail: g.deEmail || '',
        atualizadoEm: g.atualizadoEm || null, atualizadoPor: g.atualizadoPor || ''
      } : null,
      status: { okEm: s.okEm || null, erro: s.erro || '', erroEm: s.erroEm || null, via: s.via || '' }
    };
  }
  // o formulário da gestão → configuração conferida; a senha salva só vale para o mesmo servidor, porta, segurança e
  // usuário (trocar o servidor e reaproveitar a senha mandaria a senha guardada para outro lugar)
  function leForm(b, salvo) {
    b = b || {};
    const provedor = ['gmail', 'brevo', 'outro'].includes(b.provedor) ? b.provedor : 'outro';
    const host = String(b.host || '').trim().toLowerCase();
    if (!hostValido(host)) throw erro(400, 'Confira o servidor SMTP (ex.: smtp.seuprovedor.com.br).');
    const porta = Math.round(+b.porta);
    if (!(porta >= 1 && porta <= 65535)) throw erro(400, 'Confira a porta (quase sempre 465 ou 587).');
    const seguranca = String(b.seguranca || '');
    if (!['ssl', 'starttls', 'nenhuma'].includes(seguranca)) throw erro(400, 'Escolha a segurança da conexão.');
    const usuario = txt(b.usuario, 254);
    let senha = typeof b.senha === 'string' ? b.senha : '';
    if (provedor === 'gmail') senha = senha.replace(/\s+/g, ''); // o Google mostra a senha de app em blocos de 4
    if (senha.length > 512) throw erro(400, 'Essa senha é longa demais.');
    if (provedor !== 'outro' && !usuario) throw erro(400, provedor === 'gmail' ? 'Digite o Gmail da pizzaria.' : 'Digite o login SMTP da Brevo.');
    if (usuario && seguranca === 'nenhuma' && !hostInterno(host)) throw erro(400, 'Sem segurança, a senha iria aberta pela internet. Use SSL ou STARTTLS.');
    const deEmail = String(provedor === 'gmail' ? usuario : b.deEmail || '').trim().toLowerCase();
    if (!emailValido(deEmail)) throw erro(400, provedor === 'gmail' ? 'Digite o Gmail completo (ex.: pizzaria@gmail.com).' : 'Confira o email do remetente.');
    const deNome = txt(b.deNome, 80).replace(/["<>\\]/g, '').trim() || 'Pizzaria Pereira';
    let real = senha;
    if (usuario && !real) {
      const mesmo = !!(salvo && salvo.senha && salvo.host === host && salvo.porta === porta && salvo.seguranca === seguranca && salvo.usuario === usuario);
      real = mesmo ? decifra(salvo.senha) : null;
      if (real == null) throw erro(400, mesmo ? 'A senha salva não abre mais. Digite a senha de novo.' : 'Digite a senha.');
    }
    return { provedor, host, porta, seguranca, usuario, senha: usuario ? real : '', deNome, deEmail };
  }
  async function comTransporteNovo(op, fn) {
    const t = mailer().createTransport(op);
    try { return await fn(t); } finally { try { t.close(); } catch (e) { /* já fechado */ } }
  }
  async function exigeTentativas(s) {
    if (!(await limite('email-ajuste:' + s.usuario, 20, 600))) throw erro(429, 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.');
  }

  async function rota(req, res, url) {
    const p = url.pathname, m = req.method;
    const s = await exigeAdmin(req);
    if (p === '/api/ajustes/email' && m === 'GET') return json(res, 200, await visao());
    if (p === '/api/ajustes/email' && m === 'PUT') {
      const b = await lerCorpo(req, 8192);
      const salvo = await lerConfig('email', null);
      if (b.ativo === false) { // volta para o padrão do servidor; os dados ficam guardados para religar
        if (salvo && salvo.ativo) await gravaConfig('email', Object.assign({}, salvo, { ativo: false, atualizadoEm: agora(), atualizadoPor: s.nome }));
        await gravaConfig('emailStatus', {});
        return json(res, 200, await visao());
      }
      await exigeTentativas(s);
      const f = leForm(b, salvo);
      // antes de salvar, confere a conexão e a senha (não manda email)
      try { await comTransporteNovo(opcoesDe(f, f.senha), (t) => t.verify()); } catch (e) { throw erro(422, explica(e, f)); }
      await gravaConfig('email', {
        ativo: true, provedor: f.provedor, host: f.host, porta: f.porta, seguranca: f.seguranca, usuario: f.usuario, senha: f.usuario ? cifra(f.senha) : null,
        deNome: f.deNome, deEmail: f.deEmail, atualizadoEm: agora(), atualizadoPor: s.nome
      });
      await gravaConfig('emailStatus', {});
      return json(res, 200, await visao());
    }
    if (p === '/api/ajustes/email/teste' && m === 'POST') {
      const b = await lerCorpo(req, 8192);
      const para = String(b.para || '').trim().toLowerCase();
      if (!emailValido(para)) throw erro(400, 'Digite um email válido para receber o teste.');
      await exigeTentativas(s);
      let envio;
      if (b.config) { const f = leForm(b.config, await lerConfig('email', null)); envio = { opcoes: opcoesDe(f, f.senha), de: { name: f.deNome, address: f.deEmail }, cfg: f, via: f.host }; }
      else {
        envio = await atual();
        if (envio.tipo === 'simulado') throw erro(409, 'O servidor está sem envio de email: configure abaixo e tente de novo.');
        if (envio.erro) throw erro(422, envio.erro);
      }
      const msg = mensagemTeste();
      try { await comTransporteNovo(envio.opcoes, (t) => t.sendMail({ from: envio.de, to: para, subject: msg.assunto, text: msg.texto, html: msg.html })); }
      catch (e) { throw erro(422, explica(e, envio.cfg || { host: envio.via })); }
      return json(res, 200, { ok: true, via: envio.via, para });
    }
    throw erro(404, 'rota não encontrada');
  }

  async function descreve() {
    const a = await atual();
    if (a.tipo === 'simulado') return 'SIMULADO (o código aparece neste log)';
    return (a.origem === 'gestao' ? 'pela gestão' : a.tipo === 'teste' ? 'para a caixa de teste' : 'pelo ambiente') + ' via SMTP (' + a.via + ')' + (a.erro ? ' COM ERRO: ' + a.erro : '');
  }

  return { enviaCodigo, rota, descreve, atual };
};
