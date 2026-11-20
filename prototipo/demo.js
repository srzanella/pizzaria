'use strict';
/*
 * Dados de demonstração para a gestão: pedidos fictícios dos últimos dias, marcados como demo (removíveis com um clique).
 * Usa o cardápio, os horários e as faixas de entrega reais do site; bairros de Ribeirão Preto e Jardinópolis com
 * coordenadas aproximadas. Nada aqui vai para o dia de hoje: o quadro ao vivo fica só com pedidos de verdade.
 */
const crypto = require('crypto');

// bairro, cidade, lat, lng, peso (procura relativa)
const BAIRROS = [
  ['Jardim Orestes Lopes de Camargo', 'Ribeirão Preto', -21.1229, -47.8267, 7],
  ['Quintino Facci II', 'Ribeirão Preto', -21.1180, -47.8150, 6],
  ['Valentina Figueiredo', 'Ribeirão Preto', -21.1120, -47.8300, 5],
  ['Jardim Zara', 'Ribeirão Preto', -21.1330, -47.8380, 5],
  ['Jardim Heitor Rigon', 'Ribeirão Preto', -21.1300, -47.8460, 4],
  ['Jardim Marchesi', 'Ribeirão Preto', -21.1360, -47.8060, 4],
  ['Jardim Independência', 'Ribeirão Preto', -21.1520, -47.8250, 4],
  ['Ipiranga', 'Ribeirão Preto', -21.1590, -47.8370, 5],
  ['Parque Ribeirão Preto', 'Ribeirão Preto', -21.1450, -47.8520, 3],
  ['Planalto Verde', 'Ribeirão Preto', -21.1460, -47.8700, 2],
  ['Campos Elísios', 'Ribeirão Preto', -21.1650, -47.8130, 4],
  ['Jardim Aeroporto', 'Ribeirão Preto', -21.1420, -47.7820, 2],
  ['Vila Virgínia', 'Ribeirão Preto', -21.1660, -47.8460, 3],
  ['Jardim Mosteiro', 'Ribeirão Preto', -21.1720, -47.8360, 2],
  ['Centro', 'Ribeirão Preto', -21.1775, -47.8103, 4],
  ['Vila Tibério', 'Ribeirão Preto', -21.1830, -47.8260, 3],
  ['Sumarezinho', 'Ribeirão Preto', -21.1850, -47.8350, 2],
  ['Jardim Paulista', 'Ribeirão Preto', -21.1720, -47.7950, 3],
  ['Higienópolis', 'Ribeirão Preto', -21.1860, -47.8050, 2],
  ['Jardim Sumaré', 'Ribeirão Preto', -21.1910, -47.8000, 2],
  ['Jardim Irajá', 'Ribeirão Preto', -21.2010, -47.7950, 2],
  ['Ribeirânia', 'Ribeirão Preto', -21.1960, -47.7790, 2],
  ['Lagoinha', 'Ribeirão Preto', -21.1920, -47.7640, 1],
  ['Alto da Boa Vista', 'Ribeirão Preto', -21.2010, -47.8060, 2],
  ['Jardim Califórnia', 'Ribeirão Preto', -21.2060, -47.7860, 1],
  ['Nova Aliança', 'Ribeirão Preto', -21.2130, -47.8050, 2],
  ['Jardim Botânico', 'Ribeirão Preto', -21.2160, -47.8160, 1],
  ['City Ribeirão', 'Ribeirão Preto', -21.2260, -47.7960, 1],
  ['Bonfim Paulista', 'Ribeirão Preto', -21.2630, -47.8180, 1],
  ['Centro', 'Jardinópolis', -21.0180, -47.7640, 2],
  ['Jardim Alvorada', 'Jardinópolis', -21.0250, -47.7700, 1]
];
const RUAS = ['Rua São Paulo', 'Avenida Presidente Vargas', 'Rua Tibiriçá', 'Rua Cerqueira César', 'Avenida Independência', 'Rua Garibaldi', 'Rua Lafaiete', 'Avenida Nove de Julho', 'Rua Mariana Junqueira', 'Rua Américo Brasiliense', 'Rua Duque de Caxias', 'Avenida Caramuru', 'Rua Bernardino de Campos', 'Rua Visconde de Inhaúma', 'Rua Saldanha Marinho', 'Avenida Portugal', 'Rua Itápolis', 'Rua Joaquim Nabuco', 'Rua Rui Barbosa', 'Rua Sete de Setembro'];
const NOMES = ['Ana', 'Bruno', 'Camila', 'Carlos', 'Daniela', 'Diego', 'Eduarda', 'Felipe', 'Fernanda', 'Gabriel', 'Giovana', 'Gustavo', 'Helena', 'Igor', 'Isabela', 'João', 'Juliana', 'Larissa', 'Leonardo', 'Letícia', 'Lucas', 'Luiza', 'Marcelo', 'Mariana', 'Mateus', 'Natália', 'Paulo', 'Pedro', 'Rafaela', 'Renata', 'Ricardo', 'Rodrigo', 'Sabrina', 'Thiago', 'Vanessa', 'Vinícius', 'Beatriz', 'André', 'Patrícia', 'Aline', 'Caio', 'Márcia', 'Roberta', 'Sérgio', 'Tatiane', 'Wesley', 'Yasmin', 'Otávio', 'Heloísa', 'Murilo'];
const SOBRENOMES = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Pereira', 'Ferreira', 'Costa', 'Rodrigues', 'Almeida', 'Nascimento', 'Carvalho', 'Gomes', 'Martins', 'Araújo', 'Ribeiro', 'Barbosa', 'Rocha', 'Dias', 'Moreira', 'Teixeira', 'Mendes', 'Cardoso', 'Batista', 'Freitas'];
const ENTREGADORES = [['João', 4], ['Marcos', 3], ['Felipe', 3], ['Rafa', 2]];
const EQUIPE = ['Carla', 'Júnior', 'Admin'];
const MOTIVOS = [['mensagem não chegou no WhatsApp', 40], ['cliente desistiu', 25], ['demora na entrega', 15], ['item em falta', 10], ['endereço fora da área', 10]];

function prng(semente) {
  let a = semente >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * @param {object} site   dados publicados do site (sabores, adicionais, bordas, horarios, entrega, config)
 * @param {object} op     { hoje: 'AAAA-MM-DD', dias: 90, lojaGeo: {lat,lng} }
 * @returns {Array<object>} pedidos prontos para gravar (com dia, criadoEm, status, histórico…)
 */
function gerarDemo(site, op) {
  const r = prng(20261106);
  const escolhe = (lista) => lista[Math.floor(r() * lista.length)];
  const pesado = (lista, peso) => { const tot = lista.reduce((s, x) => s + peso(x), 0); let v = r() * tot; for (const x of lista) { v -= peso(x); if (v <= 0) return x; } return lista[lista.length - 1]; };
  const normal = () => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const token = () => crypto.randomBytes(16).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 22).padEnd(22, 'x');
  const codigo = () => '#' + Math.floor(r() * 36 ** 5).toString(36).toUpperCase().padStart(5, '0');

  const loja = op.lojaGeo || { lat: -21.1229, lng: -47.8267 };
  const faixas = ((site.entrega || {}).faixas || [{ ateKm: 3, taxa: 5 }, { ateKm: 10, taxa: 10 }, { ateKm: 20, taxa: 10 }]).slice().sort((a, b) => a.ateKm - b.ateKm);
  const taxaPara = (km) => { const f = faixas.find((x) => km <= x.ateKm); return f ? f.taxa : null; };
  const sabores = (site.sabores || []).filter((s) => s.g || s.b);
  const pesoSabor = (s) => ({ promo: 3, classicas: 3, requeijao: 2, premium: 1.6, copa: 1.2, verduras: 0.8, times: 0.5, doces: 1 }[s.cat] || 1) * (/calabresa|mussarela|portuguesa|frango|marguerita|quatro|bacon|pereira|baiana/i.test(s.nome) ? 2.4 : 1);
  const salgados = sabores.filter((s) => s.cat !== 'doces'), doces = sabores.filter((s) => s.cat === 'doces');
  const bordas = (site.bordas || []).filter((b) => b.id !== 'sem');
  const bebidas = (site.adicionais || []).filter((a) => a.tipo === 'bebida' && a.ativo !== false);
  const acomps = (site.adicionais || []).filter((a) => a.tipo === 'acompanhamento' && a.ativo !== false);
  const horarios = site.horarios || [];
  const hm = (s) => { const [h, m] = String(s || '0:0').split(':').map(Number); return h * 60 + (m || 0); };

  const clientes = [];
  function novoCliente(semFone) {
    const b = pesado(BAIRROS, (x) => x[4]);
    const c = {
      nome: escolhe(NOMES) + ' ' + escolhe(SOBRENOMES),
      fone: semFone ? '' : '(16) 9' + String(1000 + Math.floor(r() * 9000)) + '-' + String(1000 + Math.floor(r() * 9000)),
      bairro: b[0], cidade: b[1],
      lat: b[2] + normal() * 0.0035, lng: b[3] + normal() * 0.0035,
      rua: escolhe(RUAS), numero: String(10 + Math.floor(r() * 2400)),
      fidelidade: Math.pow(r(), 2.2) * 10 + 0.2, // poucos clientes muito fiéis, muitos esporádicos
      gostos: [pesado(salgados, pesoSabor), pesado(salgados, pesoSabor)],
      pag: pesado([['pix', 45], ['credito', 25], ['debito', 15], ['dinheiro', 15]], (x) => x[1])[0]
    };
    const dx = (c.lng - loja.lng) * 111.32 * Math.cos(loja.lat * Math.PI / 180), dy = (c.lat - loja.lat) * 111.32;
    c.km = Math.min(19.6, Math.max(0.6, Math.hypot(dx, dy) * (1.2 + r() * 0.12)));
    clientes.push(c);
    return c;
  }
  function pizza(cli, tamanho) {
    const meia = r() < 0.36;
    const base = r() < 0.55 ? escolhe(cli.gostos) : pesado(salgados, pesoSabor);
    let sabs = [base];
    if (meia) sabs.push(r() < 0.12 ? pesado(doces, pesoSabor) : pesado(salgados, pesoSabor));
    sabs = sabs.filter((s) => (tamanho === 'broto' ? s.b : s.g));
    if (!sabs.length) return null;
    const borda = r() < 0.2 && bordas.length ? escolhe(bordas) : null;
    const preco = Math.max(...sabs.map((s) => (tamanho === 'broto' ? s.b : s.g))) + (borda ? borda.preco || 0 : 0);
    const nomes = sabs.map((s) => s.nome);
    return {
      qtd: 1, tipo: 'pizza', nome: 'Pizza ' + (tamanho === 'broto' ? 'Broto' : 'Grande'),
      detalhe: (nomes.length > 1 ? '½ ' + nomes[0] + ' + ½ ' + nomes[1] : nomes[0]) + (borda ? ' · borda ' + borda.nome.toLowerCase() : ''),
      obs: r() < 0.08 ? escolhe(['sem cebola', 'bem assada', 'pouco orégano', 'cortar em 12']) : '',
      valor: preco, sabores: sabs.map((s) => s.id), tamanho, borda: borda ? borda.id : 'sem'
    };
  }

  const pedidos = [];
  const fimDia = new Date(op.hoje + 'T12:00:00Z');
  const dias = op.dias || 90;
  for (let k = dias; k >= 1; k--) {
    const d = new Date(fimDia); d.setUTCDate(d.getUTCDate() - k);
    const dia = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay();
    const h = horarios.find((x) => x.dia === dow);
    if (h && h.aberto === false) continue;
    const abre = hm(h ? h.abre : '18:00'), fecha = hm(h ? h.fecha : '23:00');
    const base = { 0: 44, 1: 20, 2: 24, 3: 27, 4: 30, 5: 48, 6: 52 }[dow];
    const tendencia = 0.82 + 0.3 * (1 - k / dias);
    const n = Math.max(6, Math.round(base * tendencia * (0.85 + r() * 0.3)));
    for (let i = 0; i < n; i++) {
      // horário: pico entre 19h30 e 21h
      let min;
      do { min = Math.round(20.25 * 60 + normal() * 55); } while (min < abre + 3 || min > fecha - 8);
      const local = new Date(dia + 'T00:00:00Z'); local.setUTCMinutes(min);
      const criado = new Date(local.getTime() + 3 * 3600e3); // horário de Brasília (UTC−3) → UTC
      const canal = pesado([['site', 64], ['whatsapp', 18], ['telefone', 13], ['balcao', 5]], (x) => x[1])[0];
      const modo = canal === 'balcao' ? 'retirada' : r() < 0.2 ? 'retirada' : 'entrega';
      let cli;
      if (canal === 'balcao' && r() < 0.6) cli = novoCliente(true);
      else if (!clientes.length || r() < 0.38) cli = novoCliente(false);
      else cli = pesado(clientes.filter((c) => c.fone), (c) => c.fidelidade);
      const itens = [];
      const nPizzas = r() < 0.62 ? 1 : r() < 0.8 ? 2 : 3;
      for (let p = 0; p < nPizzas; p++) {
        const pz = pizza(cli, r() < 0.24 ? 'broto' : 'grande');
        if (!pz) continue;
        const igual = itens.find((x) => x.tipo === 'pizza' && x.detalhe === pz.detalhe && x.tamanho === pz.tamanho);
        if (igual) { igual.qtd++; igual.valor += pz.valor; } else itens.push(pz);
      }
      if (!itens.length) continue;
      if (r() < 0.55 && bebidas.length) { const b = pesado(bebidas, (x) => (/coca|guaran/i.test(x.nome) ? 3 : 1)); const q = r() < 0.15 ? 2 : 1; itens.push({ qtd: q, tipo: 'item', nome: b.nome, detalhe: '', obs: '', valor: (b.preco || 0) * q }); }
      if (r() < 0.14 && acomps.length) { const a = escolhe(acomps); itens.push({ qtd: 1, tipo: 'item', nome: a.nome, detalhe: '', obs: '', valor: a.preco || 0 }); }
      const subtotal = itens.reduce((s, x) => s + x.valor, 0);
      const desconto = r() < 0.05 ? Math.round(subtotal * 0.1) : 0;
      const km = modo === 'entrega' ? Math.round(cli.km * 10) / 10 : null;
      const taxa = modo === 'entrega' ? taxaPara(km) || 10 : 0;
      const total = Math.round((subtotal - desconto + taxa) * 100) / 100;
      const forma = r() < 0.75 ? cli.pag : pesado([['pix', 45], ['credito', 25], ['debito', 15], ['dinheiro', 15]], (x) => x[1])[0];
      // linha do tempo
      const pico = min > 19.5 * 60 && min < 21 * 60 ? r() * 12 : r() * 4;
      const historico = [{ status: 'novo', em: criado.toISOString(), por: canal === 'site' ? 'cliente' : escolhe(EQUIPE) }];
      let t = 0;
      const passo = (st, m) => { t += m; historico.push({ status: st, em: new Date(criado.getTime() + t * 60e3).toISOString(), por: escolhe(EQUIPE) }); };
      const cancela = r() < 0.035;
      let status = 'concluido', motivo = '', entregador = '';
      if (cancela) {
        motivo = pesado(MOTIVOS, (x) => x[1])[0];
        if (motivo !== 'mensagem não chegou no WhatsApp') passo('preparo', 1 + r() * 5);
        passo('cancelado', 3 + r() * 14);
        status = 'cancelado';
      } else {
        passo('preparo', canal === 'site' ? 1 + r() * 5 : 0.5);
        passo('forno', 6 + r() * 8 + pico * 0.5);
        if (modo === 'entrega') {
          passo('saiu', 8 + r() * 6 + pico * 0.5);
          entregador = pesado(ENTREGADORES, (x) => x[1])[0];
          passo('concluido', 6 + km * 1.6 + r() * 8);
        } else {
          passo('pronto', 8 + r() * 6 + pico * 0.4);
          passo('concluido', 3 + r() * 18);
        }
      }
      pedidos.push({
        token: token(), codigo: codigo(), dia, criadoEm: criado.toISOString(), atualizadoEm: historico[historico.length - 1].em,
        canal, modo, status, total,
        cliente: { nome: cli.nome, fone: cli.fone },
        endereco: modo === 'entrega' ? { cep: '', rua: cli.rua, numero: cli.numero, compl: '', bairro: cli.bairro, cidade: cli.cidade + '/SP', ref: '' } : null,
        km, geo: modo === 'entrega' ? { lat: Math.round(cli.lat * 1000) / 1000, lng: Math.round(cli.lng * 1000) / 1000 } : null,
        itens, promocoes: desconto ? [{ nome: 'Cupom de boas-vindas', valor: desconto, brinde: '', tipo: 'desconto' }] : [],
        subtotal, desconto, taxa, freteGratis: false,
        pagamento: { forma, trocoPara: forma === 'dinheiro' && r() < 0.6 ? Math.ceil(total / 50) * 50 : null, semTroco: false },
        obs: r() < 0.06 ? escolhe(['interfone quebrado, chamar no portão', 'casa de esquina', 'deixar na portaria', 'troco em moedas, por favor']) : '',
        cupom: '', historico, origem: '', pago: status === 'concluido', entregador, obsInterna: '', motivo, previsao: null, demo: true
      });
    }
  }
  return pedidos;
}

module.exports = { gerarDemo };
