// Montagem: quadros gravados → vídeo 1080p30; cada trecho da narração no instante marcado pelo gravador; trilha original com "ducking"
// (abaixa sozinha quando a voz fala); volume final -16 LUFS; legendas .srt.
// Uso: node gravacao/montar.mjs
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const V = path.resolve(import.meta.dirname, '..');
const TRAB = path.join(V, 'trabalho'), SAIDA = path.join(V, 'saida');
const FF = fs.readdirSync(path.join(V, 'ferramentas', 'ffmpeg')).map((d) => path.join(V, 'ferramentas', 'ffmpeg', d, 'bin', 'ffmpeg.exe')).find((f) => fs.existsSync(f));
fs.mkdirSync(SAIDA, { recursive: true });
const L = JSON.parse(fs.readFileSync(path.join(TRAB, 'linha-do-tempo.json'), 'utf8'));
const roteiro = JSON.parse(fs.readFileSync(path.join(V, 'roteiro.json'), 'utf8'));
const DUR = JSON.parse(fs.readFileSync(path.join(TRAB, 'narracao', 'duracoes.json'), 'utf8')).duracoes;
function ff(args, nome) {
  const t0 = Date.now();
  const r = spawnSync(FF, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) { console.error(nome + ' falhou:\n' + r.stderr); process.exit(1); }
  console.log(nome + ' (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
  return r;
}

/* ---------- 1) vídeo a partir dos quadros (tempo variável → 30 qps) ---------- */
// sem os quadros (apagados depois da montagem), reaproveita o vídeo mudo já montado: dá para refazer só a
// narração, a trilha e as legendas sem gravar de novo
const q = L.quadros.filter((x) => fs.existsSync(path.join(TRAB, 'quadros', 'q' + String(x.n).padStart(6, '0') + '.jpg')));
const inicio = (q[0] || L.quadros[0]).t;     // o vídeo começa no primeiro quadro
// falas: quando cada trecho da narração começa, contado do início da cena (o gravador marca)
const cenas = L.cenas.map((c) => ({ id: c.id, ini: L.t0 + c.ini - inicio, fim: L.t0 + c.fim - inicio, falas: c.falas || [L.narrOff] }));
for (const c of cenas) if (c.falas.length !== DUR[c.id].length) { console.error('a gravação e a narração não batem na cena ' + c.id + ' (grave de novo depois de mudar os trechos)'); process.exit(1); }
const total = cenas[cenas.length - 1].fim;
const mudo = path.join(TRAB, 'video-mudo.mp4');
process.chdir(TRAB);
if (q.length) {
  let lista = 'ffconcat version 1.0\n';
  q.forEach((x, i) => {
    const prox = i + 1 < q.length ? q[i + 1].t - inicio : total;
    const d = Math.max(0.001, prox - (x.t - inicio));
    lista += "file 'quadros/q" + String(x.n).padStart(6, '0') + ".jpg'\nduration " + d.toFixed(4) + '\n';
  });
  lista += "file 'quadros/q" + String(q[q.length - 1].n).padStart(6, '0') + ".jpg'\n";
  fs.writeFileSync(path.join(TRAB, 'quadros.ffconcat'), lista);
  ff(['-f', 'concat', '-safe', '0', '-i', 'quadros.ffconcat', '-vf', 'fps=30,scale=1920:1080:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-tune', 'animation', '-movflags', '+faststart', mudo], 'vídeo (' + q.length + ' quadros, ' + total.toFixed(1) + ' s)');
} else if (fs.existsSync(mudo)) console.log('sem os quadros: reaproveitando o vídeo mudo já montado');
else { console.error('não há quadros nem vídeo mudo: grave de novo (node gravacao/gravar.mjs)'); process.exit(1); }

/* ---------- 2) narração no lugar ---------- */
const entradas = [], filtros = [];
let nTr = 0;
for (const c of cenas) c.falas.forEach((ini, k) => {
  entradas.push('-i', path.join(TRAB, 'narracao', c.id + '-' + k + '.wav'));
  const ms = Math.round((c.ini + ini) * 1000);
  filtros.push('[' + nTr + ':a]aresample=48000,adelay=' + ms + ':all=1[n' + nTr + ']');
  nTr++;
});
filtros.push(Array.from({ length: nTr }, (_, i) => '[n' + i + ']').join('') + 'amix=inputs=' + nTr + ':normalize=0:dropout_transition=0,apad=whole_dur=' + total.toFixed(2) +
  ',atrim=0:' + total.toFixed(2) + ',highpass=f=75,equalizer=f=220:t=q:w=1.2:g=-2.5,equalizer=f=3200:t=q:w=1.1:g=3,acompressor=threshold=-21dB:ratio=3:attack=8:release=140:makeup=3,' +
  'aecho=0.85:0.5:38|61:0.10|0.06,pan=stereo|c0=c0|c1=c0[voz]');
const voz = path.join(TRAB, 'narracao-completa.wav');
ff([...entradas, '-filter_complex', filtros.join(';'), '-map', '[voz]', '-ar', '48000', voz], 'narração');

/* ---------- 3) trilha com a duração exata ---------- */
const trilha = path.join(TRAB, 'trilha.wav');
const r = spawnSync(process.execPath, [path.join(V, 'gravacao', 'musica.mjs'), total.toFixed(2), trilha], { encoding: 'utf8' });
if (r.status !== 0) { console.error(r.stderr); process.exit(1); }
console.log(r.stdout.trim());

/* ---------- 4) mixagem: trilha abaixa quando a voz fala; -16 LUFS ---------- */
const final = path.join(SAIDA, 'pizzaria-pereira-demonstracao.mp4');
ff(['-i', mudo, '-i', voz, '-i', trilha, '-filter_complex',
  '[2:a]aresample=48000,volume=0.62[mus];[1:a]asplit=2[v1][v2];[mus][v2]sidechaincompress=threshold=0.025:ratio=7:attack=60:release=700:makeup=1[duck];' +
  '[duck][v1]amix=inputs=2:normalize=0:weights=1 1,loudnorm=I=-16:TP=-1.5:LRA=11[a]',
  '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', '-movflags', '+faststart', final], 'mixagem e vídeo final');

/* ---------- 5) legendas (.srt) ---------- */
const hms = (s) => { const ms = Math.round(s * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, ss = Math.floor(ms / 1000) % 60; return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0') + ',' + String(ms % 1000).padStart(3, '0'); };
let srt = '', n = 0;
for (const c of cenas) {
  const trechos = roteiro.cenas.find((x) => x.id === c.id).fala.split('|').map((s) => s.trim());
  trechos.forEach((fala, k) => {
    // pedaços de até ~70 caracteres, cortando em pontuação quando der
    const partes = [];
    for (const frase of fala.match(/[^.:;!?]+[.:;!?]?/g).map((s) => s.trim()).filter(Boolean)) {
      if (frase.length <= 74) { partes.push(frase); continue; }
      let atual = '';
      for (const w of frase.split(' ')) { if ((atual + ' ' + w).trim().length > 64 && atual) { partes.push(atual.trim()); atual = w; } else atual += ' ' + w; }
      if (atual.trim()) partes.push(atual.trim());
    }
    const totalCar = partes.reduce((s, p) => s + p.length, 0);
    let t = c.ini + c.falas[k];
    for (const p of partes) {
      const d = DUR[c.id][k] * p.length / totalCar;
      srt += ++n + '\n' + hms(t) + ' --> ' + hms(t + d - 0.04) + '\n' + p + '\n\n';
      t += d;
    }
  });
}
fs.writeFileSync(path.join(SAIDA, 'pizzaria-pereira-demonstracao.srt'), srt);
// capa (quadro da abertura)
ff(['-ss', (cenas[0].ini + 5).toFixed(2), '-i', final, '-frames:v', '1', '-q:v', '2', path.join(SAIDA, 'capa.jpg')], 'capa');
const tam = (fs.statSync(final).size / 1048576).toFixed(1);
console.log('pronto: ' + final + ' (' + tam + ' MB, ' + Math.floor(total / 60) + ' min ' + Math.round(total % 60) + ' s)');
