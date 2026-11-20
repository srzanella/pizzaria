'use strict';
/*
 * Endereço → ponto no mapa pelo NÚMERO, com a base oficial de endereços do IBGE (CNEFE, Censo 2022).
 *
 * O mapa aberto (OpenStreetMap) quase não tem numeração no Brasil: para "Av. X, 7555" ele devolve um trecho
 * qualquer da avenida. O CNEFE tem a coordenada de cada endereço recenseado. Carregue o arquivo do município com
 *   node importa-ibge.js 3543402_RIBEIRAO_PRETO.zip
 * (ftp.ibge.gov.br → Cadastro_Nacional_de_Enderecos_para_Fins_Estatisticos/Censo_Demografico_2022/Arquivos_CNEFE/CSV/Municipio).
 *
 * Busca: mesma rua (pelo nome sem tipo, acentos e abreviações) perto do CEP informado; número igual → "exato";
 * entre dois números conhecidos do mesmo lado, perto um do outro → "interpolado"; número vizinho → "aproximado".
 * Sem nada seguro, devolve nada e o site usa o mapa aberto e pede para o cliente conferir o pino.
 */
const semAcento = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '');
const TIPOS = new Set(['rua', 'r', 'avenida', 'av', 'ave', 'avda', 'travessa', 'tv', 'trav', 'alameda', 'al', 'praca', 'pc', 'pca', 'pr', 'estrada', 'estr', 'est', 'rodovia', 'rod', 'via', 'viela', 'largo', 'lgo', 'passagem', 'beco', 'ladeira', 'marginal', 'acesso', 'caminho', 'servidao', 'ruela', 'vereda', 'calcadao', 'contorno', 'anel', 'viaduto', 'ponte']);
const TITULOS = {
  dr: 'doutor', dra: 'doutora', prof: 'professor', profa: 'professora', eng: 'engenheiro', enga: 'engenheira',
  cel: 'coronel', gen: 'general', gal: 'general', cap: 'capitao', ten: 'tenente', sgt: 'sargento', maj: 'major', brig: 'brigadeiro',
  alm: 'almirante', mal: 'marechal', cmte: 'comandante', dep: 'deputado', ver: 'vereador', pres: 'presidente', gov: 'governador',
  sen: 'senador', min: 'ministro', des: 'desembargador', pe: 'padre', mons: 'monsenhor', d: 'dom', sto: 'santo', sta: 'santa',
  s: 'sao', n: 'nossa', sra: 'senhora', nsa: 'nossa', arq: 'arquiteto', comend: 'comendador', cons: 'conselheiro', dom: 'dom'
};
const SO_TITULO = new Set(['doutor', 'doutora', 'professor', 'professora', 'engenheiro', 'engenheira', 'coronel', 'general', 'capitao', 'tenente', 'sargento', 'major', 'brigadeiro', 'almirante', 'marechal', 'comandante', 'deputado', 'vereador', 'presidente', 'governador', 'senador', 'ministro', 'desembargador', 'padre', 'monsenhor', 'dom', 'arquiteto', 'comendador', 'conselheiro', 'irma', 'frei', 'madre', 'cardeal', 'bispo', 'prefeito', 'juiz', 'maestro', 'pastor', 'reverendo']);
const PALAVRAS_VAZIAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

// "Av. Dr. Eduardo Andréa Matarazzo" → "doutor eduardo andrea matarazzo" (sem o tipo do logradouro)
function chaveRua(s) {
  let p = semAcento(s).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  while (p.length > 1 && TIPOS.has(p[0])) p.shift();
  p = p.map((w) => TITULOS[w] || w).filter((w) => !PALAVRAS_VAZIAS.has(w));
  return p.join(' ');
}
// a mesma chave sem os títulos ("doutor", "professor"…): o CEP e o IBGE nem sempre escrevem o título
const semTitulos = (k) => k.split(' ').filter((w) => !SO_TITULO.has(w)).join(' ');
const chaveCidade = (s) => semAcento(String(s || '').split('/')[0]).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

const ESQUEMA = `
  CREATE TABLE IF NOT EXISTS enderecos_ibge (
    municipio INT NOT NULL,
    cep TEXT NOT NULL,
    rua TEXT NOT NULL,
    rua2 TEXT NOT NULL,
    numero INT NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    n INT NOT NULL DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS enderecos_ibge_rua ON enderecos_ibge (municipio, rua);
  CREATE INDEX IF NOT EXISTS enderecos_ibge_rua2 ON enderecos_ibge (municipio, rua2);
  CREATE INDEX IF NOT EXISTS enderecos_ibge_cep ON enderecos_ibge (cep);
  CREATE TABLE IF NOT EXISTS cidades_ibge (
    codigo INT PRIMARY KEY,
    nome TEXT NOT NULL,
    uf TEXT NOT NULL DEFAULT '',
    enderecos INT NOT NULL DEFAULT 0,
    arquivo TEXT NOT NULL DEFAULT '',
    importado_em TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS cidades_ibge_nome ON cidades_ibge (nome);
`;

const rad = (g) => (g * Math.PI) / 180;
function metros(a, b) {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}
const arred = (v) => Math.round(v * 1e6) / 1e6;
const MAX_SALTO = 400;      // números entre os dois vizinhos para interpolar
const MAX_DIST = 900;       // metros entre os dois vizinhos para interpolar (mais que isso: outro trecho da rua)
const MAX_VIZINHO = 40;     // um número só, perto o bastante: "aproximado"

// pontos da rua (agrupados por número) → onde fica o número pedido
function estima(linhas, numero) {
  const por = new Map();
  for (const l of linhas) {
    const x = por.get(l.numero) || { numero: l.numero, lat: 0, lng: 0, n: 0 };
    x.lat += l.lat * l.n; x.lng += l.lng * l.n; x.n += l.n;
    por.set(l.numero, x);
  }
  const pts = Array.from(por.values()).map((x) => ({ numero: x.numero, lat: x.lat / x.n, lng: x.lng / x.n })).sort((a, b) => a.numero - b.numero);
  if (!pts.length || !(numero > 0)) return null;
  const igual = pts.find((p) => p.numero === numero);
  if (igual) return { lat: arred(igual.lat), lng: arred(igual.lng), precisao: 'exato', numero };
  const entre = (lista) => {
    let a = null, b = null;
    for (const p of lista) { if (p.numero < numero) a = p; else if (p.numero > numero) { b = p; break; } }
    if (!a || !b || b.numero - a.numero > MAX_SALTO || metros(a, b) > MAX_DIST) return null;
    const f = (numero - a.numero) / (b.numero - a.numero);
    return { lat: arred(a.lat + (b.lat - a.lat) * f), lng: arred(a.lng + (b.lng - a.lng) * f), precisao: 'interpolado', numero, entre: [a.numero, b.numero] };
  };
  // o mesmo lado da rua (mesma paridade) primeiro: em muitas ruas cada lado tem a sua sequência
  const r = entre(pts.filter((p) => p.numero % 2 === numero % 2)) || entre(pts);
  if (r) return r;
  let perto = null;
  for (const p of pts) if (!perto || Math.abs(p.numero - numero) < Math.abs(perto.numero - numero)) perto = p;
  if (perto && Math.abs(perto.numero - numero) <= MAX_VIZINHO) return { lat: arred(perto.lat), lng: arred(perto.lng), precisao: 'aproximado', numero, vizinho: perto.numero };
  return null;
}

function criaEnderecos(ctx) {
  const { um, todos, json, erro, limite, ipDe } = ctx;
  // centro do CEP: separa ruas de mesmo nome em bairros diferentes
  async function centroCep(cep) {
    const c = await um('SELECT avg(lat) AS lat, avg(lng) AS lng, min(municipio) AS municipio FROM enderecos_ibge WHERE cep = $1', [cep]);
    return c && c.lat != null ? { lat: +c.lat, lng: +c.lng, municipio: c.municipio } : null;
  }
  async function procura(q) {
    const numero = parseInt(String(q.numero || '').replace(/\D/g, ''), 10) || 0;
    const cep = String(q.cep || '').replace(/\D/g, '');
    const k = chaveRua(q.rua || ''), k2 = semTitulos(k);
    if (!numero || (!k && cep.length !== 8)) return null;
    const centro = cep.length === 8 ? await centroCep(cep) : null;
    let mun = null;
    if (q.cidade) { const c = await um('SELECT codigo FROM cidades_ibge WHERE nome = $1 ORDER BY enderecos DESC LIMIT 1', [chaveCidade(q.cidade)]); mun = c && c.codigo; }
    if (!mun && centro) mun = centro.municipio;
    if (!mun) return null;
    let linhas = k ? await todos('SELECT cep, numero, lat, lng, n FROM enderecos_ibge WHERE municipio = $1 AND rua = $2', [mun, k]) : [];
    // sem bater o nome inteiro: compara sem os títulos dos dois lados ("Av. Fulano" × "Av. Doutor Fulano")
    if (!linhas.length && k2) linhas = await todos('SELECT cep, numero, lat, lng, n FROM enderecos_ibge WHERE municipio = $1 AND rua2 = $2', [mun, k2]);
    let r = null;
    // 1º) a rua dentro do próprio CEP: ruas de mesmo nome em bairros diferentes não se misturam
    if (linhas.length && cep.length === 8) {
      const doCep = linhas.filter((l) => l.cep === cep);
      if (doCep.length) { const x = estima(doCep, numero); if (x && x.precisao !== 'aproximado') r = x; }
    }
    // 2º) a rua perto do CEP (o CEP de um lado da avenida e o número do outro, faixas de CEP por número…)
    if (!r && linhas.length) {
      if (centro) { const pertoCep = linhas.filter((l) => metros(centro, l) < 3500); if (pertoCep.length) linhas = pertoCep; }
      r = estima(linhas, numero);
    }
    if (!r && !linhas.length && cep.length === 8) { // a rua não bateu pelo nome: os endereços do próprio CEP
      r = estima(await todos('SELECT numero, lat, lng, n FROM enderecos_ibge WHERE cep = $1', [cep]), numero);
      if (r && r.precisao === 'exato') r.precisao = 'interpolado'; // o mesmo número pode ser de outra rua do CEP
    }
    return r ? Object.assign(r, { fonte: 'ibge' }) : null;
  }
  async function rota(req, res, url) {
    if (req.method !== 'GET') throw erro(405, 'use GET');
    if (!(await limite('geo:' + ipDe(req), 120, 600))) throw erro(429, 'Muitas buscas seguidas. Espere um pouco.');
    const s = url.searchParams;
    const r = await procura({ rua: (s.get('rua') || '').slice(0, 160), numero: (s.get('numero') || '').slice(0, 12), cep: (s.get('cep') || '').slice(0, 12), cidade: (s.get('cidade') || '').slice(0, 80) });
    return json(res, 200, r ? Object.assign({ achou: true }, r) : { achou: false });
  }
  return { rota, procura };
}

module.exports = criaEnderecos;
Object.assign(module.exports, { chaveRua, semTitulos, chaveCidade, ESQUEMA, estima });
