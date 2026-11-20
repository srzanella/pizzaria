'use strict';
/*
 * Carrega no PostgreSQL a base de endereços do IBGE (CNEFE, Censo 2022) de um ou mais municípios, para o site achar o
 * ponto do mapa pelo número (veja enderecos.js).
 *
 *   node importa-ibge.js 3543402_RIBEIRAO_PRETO.zip [3551702_SERTAOZINHO.zip ...]
 *
 * Arquivos (um .zip por município, ou o .csv de dentro):
 *   https://ftp.ibge.gov.br/Cadastro_Nacional_de_Enderecos_para_Fins_Estatisticos/Censo_Demografico_2022/Arquivos_CNEFE/CSV/Municipio/
 * Usa o mesmo banco do server.js (DATABASE_URL, ou o .env com POSTGRES_PASSWORD → 127.0.0.1:5433). Rodar de novo
 * substitui os endereços daquele município. Fonte dos dados: IBGE, Cadastro Nacional de Endereços para Fins Estatísticos.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { Pool } = require('pg');
const { chaveRua, semTitulos, chaveCidade, ESQUEMA } = require('./enderecos.js');

try {
  for (const l of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch (e) { /* sem .env */ }
const DATABASE_URL = process.env.DATABASE_URL || (process.env.POSTGRES_PASSWORD ? 'postgres://pizzaria:' + encodeURIComponent(process.env.POSTGRES_PASSWORD) + '@127.0.0.1:5433/pizzaria' : '');

// .zip com um .csv dentro: lê o diretório central e descompacta o arquivo (sem programa externo)
function csvDoZip(buf) {
  let fim = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) if (buf.readUInt32LE(i) === 0x06054b50) { fim = i; break; }
  if (fim < 0) throw new Error('não parece um .zip');
  let p = buf.readUInt32LE(fim + 16);
  const total = buf.readUInt16LE(fim + 10);
  for (let k = 0; k < total; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('.zip corrompido');
    const metodo = buf.readUInt16LE(p + 10), tamComp = buf.readUInt32LE(p + 20), lNome = buf.readUInt16LE(p + 28), lExtra = buf.readUInt16LE(p + 30), lCom = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
    const nome = buf.toString('utf8', p + 46, p + 46 + lNome);
    p += 46 + lNome + lExtra + lCom;
    if (!/\.csv$/i.test(nome)) continue;
    const ini = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const dados = buf.subarray(ini, ini + tamComp);
    if (metodo === 0) return { nome, texto: dados.toString('latin1') };
    if (metodo === 8) return { nome, texto: zlib.inflateRawSync(dados).toString('latin1') };
    throw new Error('compressão ' + metodo + ' não suportada');
  }
  throw new Error('o .zip não tem um .csv');
}

function leArquivo(arq) {
  const buf = fs.readFileSync(arq);
  const r = buf.readUInt32LE(0) === 0x04034b50 ? csvDoZip(buf) : { nome: path.basename(arq), texto: buf.toString('latin1') };
  // o IBGE grava em ASCII/Latin-1; se vier em UTF-8, refaz a leitura
  if (/Ã[\u0080-¿]/.test(r.texto.slice(0, 200000))) r.texto = Buffer.from(r.texto, 'latin1').toString('utf8');
  return r;
}

async function importa(pool, arq) {
  const t0 = Date.now();
  const { nome, texto } = leArquivo(arq);
  const linhas = texto.split(/\r?\n/);
  const cab = linhas[0].split(';');
  const col = (n) => { const i = cab.indexOf(n); if (i < 0) throw new Error('coluna ' + n + ' não encontrada em ' + nome); return i; };
  const C = { mun: col('COD_MUNICIPIO'), uf: col('COD_UF'), cep: col('CEP'), titulo: col('NOM_TITULO_SEGLOGR'), nome: col('NOM_SEGLOGR'), num: col('NUM_ENDERECO'), lat: col('LATITUDE'), lng: col('LONGITUDE'), nivel: col('NV_GEO_COORD') };
  const grupos = new Map();
  let municipio = 0, uf = 0, lidas = 0, usadas = 0;
  for (let i = 1; i < linhas.length; i++) {
    if (!linhas[i]) continue;
    const c = linhas[i].split(';');
    lidas++;
    const numero = parseInt(c[C.num], 10), nivel = parseInt(c[C.nivel], 10), lat = parseFloat(c[C.lat]), lng = parseFloat(c[C.lng]);
    // nível 5 e 6 = coordenada da localidade ou do setor (não do endereço): não serve para achar a porta
    if (!(numero > 0) || !(nivel >= 1 && nivel <= 4) || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const rua = chaveRua([c[C.titulo], c[C.nome]].filter(Boolean).join(' '));
    if (!rua) continue;
    municipio = municipio || +c[C.mun]; uf = uf || +c[C.uf];
    const cep = String(c[C.cep] || '').replace(/\D/g, '');
    const k = cep + '|' + rua + '|' + numero;
    const g = grupos.get(k);
    if (g) { g.lat += lat; g.lng += lng; g.n++; } else grupos.set(k, { cep, rua, numero, lat, lng, n: 1 });
    usadas++;
  }
  if (!municipio) throw new Error(nome + ': nenhum endereço aproveitável');
  // nome da cidade: do nome do arquivo do IBGE ("3543402_RIBEIRAO_PRETO.csv") ou --cidade
  const cidade = chaveCidade(process.env.IMPORTA_CIDADE || nome.replace(/\.(csv|zip)$/i, '').replace(/^\d+_/, '').replace(/_/g, ' '));
  const UFS = { 11: 'RO', 12: 'AC', 13: 'AM', 14: 'RR', 15: 'PA', 16: 'AP', 17: 'TO', 21: 'MA', 22: 'PI', 23: 'CE', 24: 'RN', 25: 'PB', 26: 'PE', 27: 'AL', 28: 'SE', 29: 'BA', 31: 'MG', 32: 'ES', 33: 'RJ', 35: 'SP', 41: 'PR', 42: 'SC', 43: 'RS', 50: 'MS', 51: 'MT', 52: 'GO', 53: 'DF' };
  const lista = Array.from(grupos.values());
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('DELETE FROM enderecos_ibge WHERE municipio = $1', [municipio]);
    for (let i = 0; i < lista.length; i += 2000) {
      const lote = lista.slice(i, i + 2000), vals = [], ps = [];
      lote.forEach((x, j) => {
        const b = j * 8;
        ps.push('($' + (b + 1) + ',$' + (b + 2) + ',$' + (b + 3) + ',$' + (b + 4) + ',$' + (b + 5) + ',$' + (b + 6) + ',$' + (b + 7) + ',$' + (b + 8) + ')');
        vals.push(municipio, x.cep, x.rua, semTitulos(x.rua), x.numero, Math.round((x.lat / x.n) * 1e6) / 1e6, Math.round((x.lng / x.n) * 1e6) / 1e6, x.n);
      });
      await c.query('INSERT INTO enderecos_ibge (municipio, cep, rua, rua2, numero, lat, lng, n) VALUES ' + ps.join(','), vals);
    }
    await c.query('INSERT INTO cidades_ibge (codigo, nome, uf, enderecos, arquivo, importado_em) VALUES ($1, $2, $3, $4, $5, now()) ON CONFLICT (codigo) DO UPDATE SET nome = excluded.nome, uf = excluded.uf, enderecos = excluded.enderecos, arquivo = excluded.arquivo, importado_em = now()',
      [municipio, cidade, UFS[uf] || '', lista.length, path.basename(arq)]);
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
  console.log(path.basename(arq) + ': ' + cidade + ' (' + municipio + ') · ' + lidas.toLocaleString('pt-BR') + ' linhas, ' + usadas.toLocaleString('pt-BR') + ' com coordenada da porta → ' +
    lista.length.toLocaleString('pt-BR') + ' endereços (rua + número) em ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
}

(async () => {
  const arqs = process.argv.slice(2);
  if (!arqs.length) { console.log('uso: node importa-ibge.js 3543402_RIBEIRAO_PRETO.zip [outros.zip ...]'); process.exit(1); }
  if (!DATABASE_URL) { console.error('Defina DATABASE_URL ou POSTGRES_PASSWORD (.env).'); process.exit(1); }
  const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });
  try {
    await pool.query(ESQUEMA);
    for (const a of arqs) await importa(pool, a);
  } catch (e) { console.error('Falhou:', e.message); process.exitCode = 1; }
  finally { await pool.end(); }
})();
