// Trilha original do vídeo, sintetizada do zero (sem amostras de ninguém): piano elétrico FM, pad, baixo,
// arpejo e bateria leve, 96 BPM, em dó maior. Sai um WAV estéreo 44,1 kHz com a duração pedida.
// Uso: node gravacao/musica.mjs <segundos> <saida.wav>
import fs from 'node:fs';
const DUR = +(process.argv[2] || 200), SAIDA = process.argv[3] || 'trilha.wav';
const SR = 44100, BPM = 96, BEAT = 60 / BPM, BAR = 4 * BEAT;
const N = Math.ceil((DUR + 0.5) * SR);
const L = new Float32Array(N), R = new Float32Array(N);       // mixagem seca
const RL = new Float32Array(N), RR = new Float32Array(N);     // envio para o reverb
const TAU = Math.PI * 2;
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
let semente = 12345;
const rnd = () => { semente = (semente * 1664525 + 1013904223) >>> 0; return semente / 4294967296; };

// soma um som no tempo t (s); f(i) devolve a amostra; pan -1..1; rev = quanto vai para o reverb
function soma(t, dur, f, ganho, pan = 0, rev = 0) {
  const i0 = Math.round(t * SR), n = Math.min(Math.round(dur * SR), N - i0);
  const gl = ganho * Math.cos((pan + 1) * Math.PI / 4), gr = ganho * Math.sin((pan + 1) * Math.PI / 4);
  for (let i = 0; i < n; i++) {
    const s = f(i);
    const k = i0 + i;
    L[k] += s * gl; R[k] += s * gr;
    if (rev) { RL[k] += s * gl * rev; RR[k] += s * gr * rev; }
  }
}
const env = (i, a, d, sus, rel, dur) => { // ADSR em amostras: a, d, rel em segundos; dur = nota segurada
  const t = i / SR;
  if (t < a) return t / a;
  if (t < a + d) return 1 - (1 - sus) * (t - a) / d;
  if (t < dur) return sus;
  return Math.max(0, sus * (1 - (t - dur) / rel));
};

/* ---------- instrumentos ---------- */
function piano(t, m, dur, vel, pan) { // piano elétrico FM: portadora e moduladora 1:1, índice que cai
  const f = hz(m), total = dur + 0.9;
  soma(t, total, (i) => {
    const s = i / SR;
    const e = env(i, 0.004, 1.2, 0.25, 0.9, dur) * Math.exp(-s * 0.6);
    const ind = 1.6 * Math.exp(-s * 7) + 0.25;
    const trem = 1 + 0.06 * Math.sin(TAU * 4.8 * s);
    return Math.sin(TAU * f * s + ind * Math.sin(TAU * f * s)) * e * trem + 0.18 * Math.sin(TAU * 2 * f * s) * e * Math.exp(-s * 3);
  }, 0.11 * vel, pan, 0.35);
}
function pad(t, notas, dur, ganho) { // cordas suaves: três dentes-de-serra desafinadas por nota, filtro passa-baixa
  for (const m of notas) {
    const f = hz(m);
    let y = 0;
    const fase = [rnd(), rnd(), rnd()], des = [-0.12, 0, 0.11];
    const pan = (rnd() - 0.5) * 0.8;
    soma(t, dur + 1.6, (i) => {
      const s = i / SR;
      let x = 0;
      for (let k = 0; k < 3; k++) { const ph = (f * Math.pow(2, des[k] / 12) * s + fase[k]) % 1; x += 2 * ph - 1; }
      y += 0.045 * (x / 3 - y); // passa-baixa de um polo (~300 Hz de corte)
      return y * env(i, 0.9, 0.5, 0.85, 1.6, dur);
    }, ganho, pan, 0.6);
  }
}
function baixo(t, m, dur, vel) {
  const f = hz(m);
  soma(t, dur + 0.15, (i) => {
    const s = i / SR;
    const e = env(i, 0.006, 0.25, 0.55, 0.12, dur);
    const x = Math.sin(TAU * f * s) + 0.35 * Math.sin(TAU * 2 * f * s) * Math.exp(-s * 6);
    return Math.tanh(1.4 * x) * e;
  }, 0.2 * vel, 0, 0.02);
}
function pluck(t, m, vel, pan) { // arpejo: triângulo com decaimento rápido
  const f = hz(m);
  soma(t, 0.9, (i) => {
    const s = i / SR;
    const ph = (f * s) % 1;
    const tri = 4 * Math.abs(ph - 0.5) - 1;
    return (0.7 * tri + 0.3 * Math.sin(TAU * f * s)) * Math.exp(-s * 6.5) * Math.min(1, i / 40);
  }, 0.07 * vel, pan, 0.45);
}
function bumbo(t, vel) {
  soma(t, 0.35, (i) => { // frequência cai de 138 Hz para 48 Hz: fase = integral de f(t)
    const s = i / SR;
    return Math.sin(TAU * (48 * s + 90 * (1 - Math.exp(-s * 28)) / 28)) * Math.exp(-s * 9) * (s < 0.002 ? s / 0.002 : 1);
  }, 0.42 * vel, 0, 0);
}
function chimbal(t, vel, pan) { // ruído passa-alta, bem curto
  let ant = 0, y = 0;
  soma(t, 0.07, (i) => {
    const x = rnd() * 2 - 1;
    y = 0.6 * (y + x - ant); ant = x; // passa-alta simples
    return y * Math.exp(-(i / SR) * 70);
  }, 0.055 * vel, pan, 0.1);
}
function palma(t, vel) { // ruído com três batidas rápidas e corpo filtrado
  let y = 0;
  soma(t, 0.25, (i) => {
    const s = i / SR;
    const x = rnd() * 2 - 1;
    y += 0.35 * (x - y);
    const bat = s < 0.03 ? (Math.floor(s / 0.01) % 2 === 0 ? 1 : 0.4) : 1;
    return (x - y) * Math.exp(-s * 22) * bat;
  }, 0.09 * vel, 0.1, 0.35);
}

/* ---------- harmonia e forma ---------- */
const ACORDES = {
  Cmaj7: { v: [60, 64, 67, 71], b: 36 }, Am7: { v: [60, 64, 67, 69], b: 33 }, Fmaj7: { v: [60, 64, 65, 69], b: 41 },
  G6: { v: [59, 62, 64, 67], b: 43 }, G: { v: [59, 62, 67, 71], b: 43 }, Em7: { v: [59, 62, 64, 67], b: 40 }, Dm7: { v: [60, 62, 65, 69], b: 38 }
};
const A = ['Cmaj7', 'Am7', 'Fmaj7', 'G6'];
const B = ['Fmaj7', 'G', 'Em7', 'Am7', 'Dm7', 'G', 'Cmaj7', 'Cmaj7'];
const compassos = Math.max(16, Math.floor((DUR - 4) / BAR));
// seções proporcionais: introdução, A, B, A, B, final
const cortes = [0.06, 0.26, 0.47, 0.64, 0.86, 1].map((p) => Math.round(p * compassos));
const secao = (c) => cortes.findIndex((x) => c < x);
for (let c = 0; c < compassos; c++) {
  const s = secao(c); // 0 intro, 1 A, 2 B, 3 A, 4 B, 5 final
  const prog = s === 2 || s === 4 ? B : A;
  const nome = prog[c % prog.length];
  const ac = ACORDES[nome];
  const t0 = c * BAR;
  const final = s === 5, intro = s === 0;
  const forca = intro ? 0.6 : final ? 0.75 : s === 4 ? 1 : 0.85;
  pad(t0, ac.v.map((m) => m - 12), BAR, intro ? 0.05 : 0.04);
  // piano: acorde no 1 e uma síncope no "e" do 2
  ac.v.forEach((m, k) => piano(t0 + k * 0.012, m, BEAT * 1.4, forca * (0.8 + 0.2 * rnd()), (k - 1.5) * 0.3));
  if (!intro) ac.v.slice(1).forEach((m, k) => piano(t0 + BEAT * 1.5 + k * 0.01, m, BEAT * 0.9, forca * 0.55, (k - 1) * 0.3));
  if (!intro) {
    baixo(t0, ac.b, BEAT * 1.6, forca);
    baixo(t0 + BEAT * 2, ac.b, BEAT * 0.9, forca * 0.85);
    baixo(t0 + BEAT * 3.5, ac.b + (c % 2 ? 7 : 12), BEAT * 0.45, forca * 0.7);
  }
  if (s === 2 || s === 4 || (final && c < compassos - 2)) {
    const notas = ac.v.map((m) => m + 12), ordem = [0, 1, 2, 3, 2, 1, 2, 3];
    ordem.forEach((k, j) => pluck(t0 + j * BEAT / 2 + (j % 2 ? 0.02 : 0), notas[k], (s === 4 ? 1 : 0.8) * (j % 2 ? 0.75 : 1), j % 2 ? 0.45 : -0.45));
  }
  const bateria = s >= 1 && !(final && c >= compassos - 3);
  if (bateria) {
    bumbo(t0, forca); bumbo(t0 + BEAT * 2, forca * 0.9);
    if (c % 4 === 3) bumbo(t0 + BEAT * 3.5, forca * 0.6);
    if (s !== 1 || c >= cortes[0] + 4) { palma(t0 + BEAT, forca); palma(t0 + BEAT * 3, forca); }
    for (let j = 0; j < 8; j++) chimbal(t0 + j * BEAT / 2 + (j % 2 ? BEAT * 0.06 : 0), (j % 2 ? 1 : 0.6) * forca, 0.25);
  }
}
// acorde final, segurado
const fimT = compassos * BAR;
pad(fimT, ACORDES.Cmaj7.v.map((m) => m - 12), 2.5, 0.045);
ACORDES.Cmaj7.v.forEach((m, k) => piano(fimT + k * 0.02, m, 2.2, 0.7, (k - 1.5) * 0.3));
baixo(fimT, 36, 2.2, 0.8);

/* ---------- reverb (Freeverb) ---------- */
function reverb(entrada, espalha) {
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((d) => ({ buf: new Float32Array(d + espalha), i: 0, f: 0 }));
  const alls = [556, 441, 341, 225].map((d) => ({ buf: new Float32Array(d + espalha), i: 0 }));
  const fb = 0.86, damp = 0.25, saida = new Float32Array(entrada.length);
  for (let n = 0; n < entrada.length; n++) {
    const x = entrada[n] * 0.015;
    let s = 0;
    for (const c of combs) { const y = c.buf[c.i]; c.f = y * (1 - damp) + c.f * damp; c.buf[c.i] = x + c.f * fb; c.i = (c.i + 1) % c.buf.length; s += y; }
    for (const a of alls) { const b = a.buf[a.i]; a.buf[a.i] = s + b * 0.5; a.i = (a.i + 1) % a.buf.length; s = b - s; }
    saida[n] = s;
  }
  return saida;
}
const wl = reverb(RL, 0), wr = reverb(RR, 23);

/* ---------- mixagem, fade e limitador ---------- */
const fadeIn = 1.5 * SR, fadeOut = 6 * SR, fim = Math.min(N, Math.round((DUR + 0.5) * SR));
let pico = 0;
const out = new Float32Array(fim * 2);
for (let n = 0; n < fim; n++) {
  let g = 1;
  if (n < fadeIn) g *= n / fadeIn;
  if (n > fim - fadeOut) g *= Math.max(0, (fim - n) / fadeOut) ** 1.5;
  const l = Math.tanh((L[n] + wl[n] * 1.1) * 1.2) * g, r = Math.tanh((R[n] + wr[n] * 1.1) * 1.2) * g;
  out[2 * n] = l; out[2 * n + 1] = r;
  pico = Math.max(pico, Math.abs(l), Math.abs(r));
}
const norm = 0.89 / pico; // pico em -1 dB
const pcm = Buffer.alloc(44 + out.length * 2);
pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + out.length * 2, 4); pcm.write('WAVE', 8); pcm.write('fmt ', 12);
pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(2, 22); pcm.writeUInt32LE(SR, 24); pcm.writeUInt32LE(SR * 4, 28);
pcm.writeUInt16LE(4, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(out.length * 2, 40);
for (let k = 0; k < out.length; k++) pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(out[k] * norm * 32767))), 44 + k * 2);
fs.writeFileSync(SAIDA, pcm);
console.log('trilha: ' + (fim / SR).toFixed(1) + ' s, ' + compassos + ' compassos a ' + BPM + ' BPM, seções nos compassos ' + cortes.join(', ') + ' → ' + SAIDA);
