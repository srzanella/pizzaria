// Narração: um WAV por trecho de fala de cada cena, a partir do roteiro.json, e a duração de cada um.
// Dois motores (o roteiro escolhe no campo "narracao"; --motor= troca na hora):
//   openai → voz neural da OpenAI (gpt-4o-mini-tts). Precisa da variável OPENAI_API_KEY. Lê o texto da legenda
//            ("fala"), ou "vozIA" se a cena tiver. O áudio fica guardado em trabalho/narracao/cache: o mesmo texto
//            com a mesma voz não é pedido de novo, e as durações não mudam entre uma montagem e outra.
//   piper  → voz offline (Piper, pt-BR "faber"). Lê o campo "voz", escrito do jeito que ela pronuncia certo.
// Uso: node gravacao/narracao.mjs [--motor=openai|piper] [--voz=cedar] [--velocidade=1.05 (piper)]
//      --refazer=conta-1,fim-0   pede de novo só esses trechos à OpenAI (quando uma leitura saiu ruim)
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const V = path.resolve(import.meta.dirname, '..');
const SAIDA = path.join(V, 'trabalho', 'narracao');
const CACHE = path.join(SAIDA, 'cache');
const FF = fs.readdirSync(path.join(V, 'ferramentas', 'ffmpeg')).map((d) => path.join(V, 'ferramentas', 'ffmpeg', d, 'bin', 'ffmpeg.exe')).find((f) => fs.existsSync(f));
const arg = (n) => (process.argv.find((a) => a.startsWith('--' + n + '=')) || '').slice(n.length + 3);
const roteiro = JSON.parse(fs.readFileSync(path.join(V, 'roteiro.json'), 'utf8'));
const cfg = Object.assign({ motor: 'piper' }, roteiro.narracao || {});
if (arg('motor')) cfg.motor = arg('motor');
if (arg('voz')) cfg.voz = arg('voz');
const ALVO_LUFS = -16.5; // volume de cada trecho (a mixagem foi acertada com esse nível)
fs.mkdirSync(CACHE, { recursive: true });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// duração de um WAV PCM pelo cabeçalho (procura o bloco "data")
function duracaoWav(arq) {
  const b = fs.readFileSync(arq);
  const canais = b.readUInt16LE(22), taxa = b.readUInt32LE(24), bits = b.readUInt16LE(34);
  let i = 12;
  while (i < b.length - 8) { const id = b.toString('ascii', i, i + 4), tam = b.readUInt32LE(i + 4); if (id === 'data') return tam / (taxa * canais * bits / 8); i += 8 + tam + (tam % 2); }
  return 0;
}
function ff(args) {
  const r = spawnSync(FF, ['-hide_banner', '-nostats', '-y', ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (r.status !== 0) throw new Error('ffmpeg falhou: ' + r.stderr.slice(-400));
  return r.stderr;
}
const lufs = (arq) => +((ff(['-i', arq, '-af', 'ebur128', '-f', 'null', '-']).match(/I:\s+(-?[\d.]+) LUFS/g) || ['I: -16.5 LUFS']).pop().match(/-?[\d.]+/)[0]);

/* ---------- OpenAI ---------- */
const CHAVE = process.env.OPENAI_API_KEY;
if (cfg.motor === 'openai' && !CHAVE) { console.error('Falta a variável OPENAI_API_KEY (a chave da API da OpenAI). Ou use --motor=piper.'); process.exit(1); }
const REFAZER = new Set(arg('refazer').split(',').filter(Boolean));
async function openai(texto, arq, nome) {
  const id = createHash('sha256').update(JSON.stringify([cfg.modelo, cfg.voz, cfg.instrucoes, texto])).digest('hex').slice(0, 24);
  const bruto = path.join(CACHE, id + '.pcm');
  if (REFAZER.has(nome) && fs.existsSync(bruto)) fs.renameSync(bruto, bruto.replace(/\.pcm$/, '.' + Date.now() + '.descartado'));
  if (!fs.existsSync(bruto)) {
    for (let tent = 1; ; tent++) {
      const r = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST', headers: { Authorization: 'Bearer ' + CHAVE, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: cfg.modelo, voice: cfg.voz, input: texto, instructions: cfg.instrucoes, response_format: 'pcm' })
      }).catch((e) => ({ ok: false, status: 0, text: async () => e.message }));
      if (r.ok) { fs.writeFileSync(bruto, Buffer.from(await r.arrayBuffer())); break; }
      const msg = (await r.text()).slice(0, 300);
      if (tent >= 4 || (r.status >= 400 && r.status < 500 && r.status !== 429)) throw new Error('a OpenAI respondeu ' + r.status + ': ' + msg);
      await espera(1500 * tent);
    }
  }
  // PCM 24 kHz → WAV: corta o silêncio do começo e do fim, iguala o volume e deixa 0,25 s de respiro no fim
  const tmp = arq + '.tmp.wav';
  ff(['-f', 's16le', '-ar', '24000', '-ac', '1', '-i', bruto, '-af', 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.04,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.04,areverse', tmp]);
  ff(['-i', tmp, '-af', 'volume=' + (ALVO_LUFS - lufs(tmp)).toFixed(2) + 'dB,apad=pad_dur=0.25', '-ar', '24000', '-c:a', 'pcm_s16le', arq]);
  fs.rmSync(tmp);
}

/* ---------- Piper ---------- */
const PIPER = path.join(V, 'ferramentas', 'piper', 'piper', 'piper.exe');
const MODELO_PIPER = path.join(V, 'ferramentas', 'voz', 'pt_BR-faber-medium.onnx');
const velocidade = +(arg('velocidade') || cfg.velocidade || 1.05);
function piper(texto, arq) {
  const r = spawnSync(PIPER, ['--model', MODELO_PIPER, '--output_file', arq, '--length_scale', String(velocidade), '--sentence_silence', '0.28'], { input: texto + '\n', encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
}

/* ---------- trechos de cada cena: <cena>-<n>.wav ---------- */
for (const f of fs.readdirSync(SAIDA)) if (f.endsWith('.wav')) fs.rmSync(path.join(SAIDA, f));
console.log('motor: ' + cfg.motor + (cfg.motor === 'openai' ? ' (' + cfg.modelo + ', voz ' + cfg.voz + ')' : ' (velocidade ' + velocidade + ')'));
const duracoes = {};
let total = 0;
for (const c of roteiro.cenas) {
  const n = c.fala.split('|').length;
  const fonte = cfg.motor === 'openai' ? (c.vozIA || c.fala) : c.voz;
  const trechos = fonte.split('|').map((s) => s.trim());
  if (trechos.length !== n || c.voz.split('|').length !== n) { console.error('cena ' + c.id + ': fala, voz (e vozIA) precisam ter o mesmo número de trechos (|)'); process.exit(1); }
  duracoes[c.id] = [];
  for (let k = 0; k < n; k++) {
    const arq = path.join(SAIDA, c.id + '-' + k + '.wav');
    try { if (cfg.motor === 'openai') await openai(trechos[k], arq, c.id + '-' + k); else piper(trechos[k], arq); }
    catch (e) { console.error('falhou na cena ' + c.id + ', trecho ' + k + ': ' + e.message); process.exit(1); }
    duracoes[c.id].push(Math.round(duracaoWav(arq) * 1000) / 1000);
  }
  const soma = duracoes[c.id].reduce((a, b) => a + b, 0);
  total += soma;
  console.log(c.id.padEnd(12) + soma.toFixed(2).padStart(6) + ' s' + (n > 1 ? '   ' + n + ' trechos: ' + duracoes[c.id].map((d) => d.toFixed(1)).join(' + ') : ''));
}
fs.writeFileSync(path.join(SAIDA, 'duracoes.json'), JSON.stringify({ motor: cfg.motor, voz: cfg.motor === 'openai' ? cfg.voz : 'faber', duracoes }, null, 1));
console.log('total de fala: ' + total.toFixed(1) + ' s');
