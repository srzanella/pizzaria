/* Cena "pro forno" — pizzaiolo articulado em SVG.
 *
 * Como funciona:
 * - Cada parte do corpo é desenhada com o pivô da articulação na origem (0,0) e o osso apontando
 *   para baixo (+y) na pose de repouso. A cada quadro o esqueleto é resolvido e cada parte recebe
 *   translate(junta) rotate(ângulo).
 * - Pernas e braços usam IK de dois ossos: os pés ficam presos onde foram plantados (não patinam)
 *   e as mãos ficam presas no cabo da pá. A pizza é "filha" da pá: acompanha tudo o que a pá faz.
 * - A linha do tempo (GSAP) só anima um objeto de pose; tudo o mais é calculado a partir dele,
 *   então dá para avançar/voltar para qualquer instante (seek) e o quadro sai sempre igual.
 * Usado por app.js (levarAoForno) e pela página de ajuste testes/pizzaiolo.html.
 */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const RAD = Math.PI / 180, DEG = 180 / Math.PI;
  const CHAO = 226;                         // linha do chão no viewBox 400×250
  const CAMERA = { y: 14, w: 262, h: 232 };   // enquadramento fechado para celular (anda de x=70 até x=138)
  const BOCA = { x0: 300, x1: 358, base: 166, cx: 329 };   // boca do forno (piso na altura da cintura)
  const BOCA_D = `M${BOCA.x0},${BOCA.base} L${BOCA.x0},136 C${BOCA.x0},120 313,110 ${BOCA.cx},110 C345,110 ${BOCA.x1},120 ${BOCA.x1},136 L${BOCA.x1},${BOCA.base} Z`;

  /* ---------- paleta ---------- */
  const C = {
    pele: '#F2C3A0', peleSombra: '#E2A684', peleContorno: '#BF7A57', peleLuz: '#FFE3CC', bochecha: '#E98E78',
    branco: '#FFFDF9', brancoSombra: '#EAE2D5', brancoContorno: '#C7BBA9', dobra: '#DED4C5',
    calca: '#3B3632', calcaSombra: '#2B2724', sapato: '#2A201B', sola: '#17110E',
    verde: '#0F4D23', verdeSombra: '#0A3A19', costura: '#3F7A52', creme: '#F1DDAE',
    tomate: '#C1121F', tomateSombra: '#930D17',
    cabelo: '#3A2318', cabeloLuz: '#5E3B29', olho: '#2A1D17', boca: '#8A3A2C',
    madeira: '#9A6534', madeiraLuz: '#C99560', aro: '#9D968C', metalBorda: '#6F675E',
    luz: '#FFB347'
  };

  /* ---------- arte das partes (pivô na origem) ---------- */
  const luz = (d, w = 2.2) => `<path class="luz" d="${d}" fill="none" stroke="${C.luz}" stroke-width="${w}" stroke-linecap="round" opacity="0"/>`;
  const ARTE = {
    sombraPe: () => `<ellipse cx="4" cy="0" rx="12" ry="2.6" fill="#2B1A0E"/>`,
    sapato: () => `
      <path d="M-6.4,1.2 C-6.6,-2.4 -4.2,-4.6 -0.6,-4.6 C2.6,-4.6 5,-3.6 7.6,-2.2 C10.8,-0.6 14,1.2 15.2,3.4 C15.8,4.6 15.2,6 13.6,6 L-5.2,6 C-6.4,6 -6.8,5 -6.6,3.6 Z" fill="${C.sapato}"/>
      <path d="M-6.7,4.4 L15.3,4.4 C15.5,5.6 14.9,6.6 13.5,6.6 L-5.3,6.6 C-6.5,6.6 -6.9,5.8 -6.7,4.4 Z" fill="${C.sola}"/>
      <path d="M1.6,-3.4 C5.6,-2.6 9.8,-0.6 12.8,1.8" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="1.2" stroke-linecap="round"/>`,
    canela: () => `
      <path d="M-5.9,-2 C-6.1,7 -5.8,16 -5.6,23.8 C-5.6,25 -4.7,25.6 -3,25.8 C-0.6,26.1 2.6,26.1 5,25.7 C6.2,25.5 6.7,24.8 6.6,23.8 C6.3,16 6.1,7 5.9,-2 Z" fill="${C.calca}"/>
      <path d="M-5.9,-2 C-6.1,7 -5.8,16 -5.6,23.8 C-5.6,25 -4.7,25.6 -3,25.8 L-2.2,25.9 C-2.6,17 -2.6,7 -2.2,-2 Z" fill="${C.calcaSombra}"/>
      <path d="M-5.5,23.4 C-2,24.3 3,24.3 6.5,23.4" fill="none" stroke="${C.calcaSombra}" stroke-width=".9"/>`,
    coxa: () => `
      <path d="M-7.3,-5 C-7.9,5 -7.3,15 -6.5,23 C-5.9,27.6 5.9,27.6 6.5,23 C7.1,15 7.7,5 7.3,-5 Z" fill="${C.calca}"/>
      <path d="M-7.3,-5 C-7.9,5 -7.3,15 -6.5,23 C-6.1,25.6 -4.3,26.7 -2.7,27 C-3.1,17 -3.5,5 -3.1,-5 Z" fill="${C.calcaSombra}"/>`,
    quadril: () => `<path d="M-12,-8 C-13,-1 -12,5 -8.6,9 C-3,11 4,11 9.4,9 C12.6,5 13.4,-1 12.4,-8 Z" fill="${C.calca}"/>`,
    tronco: () => `
      <path d="M-13.4,9.4 C-15,3 -15.8,-6 -15.4,-14 C-15,-23 -13,-30 -9,-33.8 C-6,-36.4 -2.6,-37.4 0.4,-37.6 L8.4,-37.6 C11.8,-37.2 14.6,-35.6 16.2,-32.6 C18.8,-28 21.8,-21.6 22.8,-13.6 C23.6,-6 22.2,2.4 17.4,8.8 C8.4,11 -4,10.8 -13.4,9.4 Z" fill="${C.branco}" stroke="${C.brancoContorno}" stroke-width="1.2" stroke-linejoin="round"/>
      <path d="M-13.4,9.4 C-15,3 -15.8,-6 -15.4,-14 C-15,-23 -13,-30 -9,-33.8 C-10.6,-27 -11,-18 -10.2,-9 C-9.4,-1 -7.2,5 -4.2,10.2 C-7.4,10.1 -10.6,9.8 -13.4,9.4 Z" fill="${C.brancoSombra}"/>
      <path d="M22.8,-13.6 C23.6,-6 22.2,2.4 17.4,8.8 C12.6,10 7.4,10.5 2.6,10.6 C10,6.4 16.2,-1.6 19.6,-11.6 C20.8,-12.4 21.8,-13.1 22.8,-13.6 Z" fill="${C.brancoSombra}" opacity=".75"/>
      <path d="M9,-36.8 C13.8,-30.6 17,-22 18,-13 C18.8,-5 18.2,2.6 16.6,9.2" fill="none" stroke="${C.dobra}" stroke-width="1.2" stroke-linecap="round"/>
      <g fill="#E9DFCF" stroke="#B9AC99" stroke-width=".6">
        <circle cx="3.8" cy="-29" r="1.3"/><circle cx="5.2" cy="-19.4" r="1.3"/><circle cx="5.8" cy="-9.8" r="1.3"/>
        <ellipse cx="11.6" cy="-29.4" rx=".95" ry="1.25"/><ellipse cx="13.6" cy="-19.8" rx=".95" ry="1.25"/><ellipse cx="14.2" cy="-10.2" rx=".95" ry="1.25"/>
      </g>
      <path d="M-13.8,-2 C-11.4,-0.8 -8.6,-0.6 -6.4,-1.2 M-13.2,2.6 C-11.4,3.4 -9.4,3.6 -7.6,3.2" fill="none" stroke="${C.dobra}" stroke-width=".9" stroke-linecap="round"/>
      <path d="M-2.6,-37.6 C-1.6,-41.4 10,-41.8 11.2,-37.6 L10.6,-35.4 C6.4,-34.4 0.6,-34.4 -2.2,-35.2 Z" fill="${C.branco}" stroke="${C.brancoContorno}" stroke-width="1" stroke-linejoin="round"/>
      <path d="M6.6,-35 C6.2,-31.6 6.8,-28.6 8.4,-26.6 L10.8,-28.4 C9.8,-30.4 9.4,-32.6 9.4,-34.6 Z" fill="${C.tomateSombra}"/>
      <path d="M9.2,-35 C11.2,-33.2 13.2,-31.8 15,-31.4 L14.4,-29 C12.4,-29.8 10.6,-31 9,-32.8 Z" fill="${C.tomate}"/>
      <ellipse cx="8.4" cy="-35.4" rx="2.6" ry="2.1" fill="${C.tomate}"/>
      <path d="M7,-36.4 C7.8,-37 9,-37 9.8,-36.4" fill="none" stroke="#E5434E" stroke-width=".7" stroke-linecap="round"/>
      ${luz('M16.2,-32.6 C18.8,-28 21.8,-21.6 22.8,-13.6 C23.6,-6 22.2,2.4 17.4,8.8', 2.4)}`,
    avental: () => `
      <path d="M-12.4,-0.8 C-16.6,-5.2 -21,-3 -18.8,0.4 C-17.4,2.2 -14.6,1.2 -12.4,-0.8 Z M-12.4,-0.8 C-16.4,2.4 -19.4,6.2 -16.8,7.2 C-14.6,8 -13.2,3.4 -12.4,-0.8 Z" fill="${C.verde}" stroke="${C.verdeSombra}" stroke-width=".6"/>
      <circle cx="-12.6" cy="-0.6" r="1.6" fill="${C.verdeSombra}"/>
      <path d="M-12,0.6 C-3,2 11,1.8 22.6,-0.8 C24,7.4 25,16 25.6,25.4 C15,28 -2,28 -13.2,26 C-12.9,17 -12.6,9 -12,0.6 Z" fill="${C.verde}"/>
      <path d="M-12,0.6 C-10.4,0.9 -8.8,1.2 -7.4,1.4 C-8,10 -8.4,18 -8.2,27.2 C-10,26.9 -11.6,26.5 -13.2,26 C-12.9,17 -12.6,9 -12,0.6 Z" fill="${C.verdeSombra}"/>
      <path d="M-12,-2.6 C-3,-0.8 11,-1 22.4,-4 L22.8,-0.4 C11,2 -3,2.2 -12.2,0.8 Z" fill="${C.verdeSombra}"/>
      <path d="M-12.4,23.6 C-2,25.6 14,25.6 24.6,23" fill="none" stroke="${C.costura}" stroke-width=".8" stroke-dasharray="1.6 1.4"/>
      <path d="M7,8.4 L18.4,7.4 L19,16.2 C15,17.2 10.8,17.4 7.4,17 Z" fill="none" stroke="${C.costura}" stroke-width=".9" stroke-dasharray="1.6 1.2"/>
      <path d="M10.4,9.8 L15.6,10.4 L12.8,14.8 Z" fill="${C.creme}"/>
      <circle cx="12.4" cy="11" r=".7" fill="${C.tomate}"/><circle cx="13.6" cy="12.4" r=".55" fill="${C.tomate}"/>
      ${luz('M22.6,-0.8 C24,7.4 25,16 25.6,25.4', 2)}`,
    cabeca: () => `
      <path d="M-5.6,3 L-5.8,-9 C-2,-10.6 4.4,-10.6 7.4,-9 L7.2,3 Z" fill="${C.peleSombra}"/>
      <path d="M-11.6,-31 C-15.8,-27 -16.4,-19.6 -13.8,-14.2 L-9.2,-15.4 C-10.6,-20.6 -10.2,-26.4 -8,-30.8 Z" fill="${C.cabelo}"/>
      <path d="M2.4,-42.6 C11.4,-42.6 18.6,-37.4 20.4,-29.8 C21.6,-24.8 21.8,-19.6 20.8,-15.4 C19.6,-10.2 16,-6.2 11,-4.8 C7,-3.8 2,-4.2 -2.6,-6 C-8.2,-8 -11.8,-11.8 -13.2,-17.4 C-14.6,-23.2 -14.4,-30.4 -11.8,-35.4 C-9.4,-39.8 -3.6,-42.6 2.4,-42.6 Z" fill="${C.pele}" stroke="${C.peleContorno}" stroke-width="1.1"/>
      <path d="M-13.2,-17.4 C-11.8,-11.8 -8.2,-8 -2.6,-6 C2,-4.2 7,-3.8 11,-4.8 C6.4,-5.6 1.6,-7.6 -1.8,-10.8 C-5.8,-14.4 -8.6,-20.6 -9.4,-27.6 C-11.4,-24.6 -12.6,-21 -13.2,-17.4 Z" fill="${C.peleSombra}" opacity=".75"/>
      <path d="M-9.6,-25 C-13.8,-27 -16.8,-23.4 -15.8,-19.6 C-15,-16.6 -12,-15.2 -9.8,-16.2 Z" fill="${C.pele}" stroke="${C.peleContorno}" stroke-width="1"/>
      <path d="M-11.4,-22.6 C-13.4,-22.8 -14,-20.2 -12.6,-18.6" fill="none" stroke="${C.peleContorno}" stroke-width=".9" stroke-linecap="round"/>
      <path d="M-8.6,-31.6 C-9.6,-28 -9.4,-24.6 -8.2,-22.2 L-6.4,-22.8 C-7,-25.6 -6.8,-28.8 -5.6,-31.8 Z" fill="${C.cabelo}"/>
      <ellipse cx="0.6" cy="-16.6" rx="3.8" ry="2.3" fill="${C.bochecha}" opacity=".4"/>
      <ellipse cx="17.8" cy="-17.6" rx="1.7" ry="1.5" fill="${C.bochecha}" opacity=".3"/>
      <g class="olho-n"><ellipse cx="3.8" cy="-25.8" rx="2.1" ry="2.9" fill="${C.olho}"/><circle class="brilho" cx="4.5" cy="-26.8" r=".72" fill="#fff"/></g>
      <path class="piscada" d="M1.2,-25.4 C2.8,-23.6 5,-23.6 6.6,-25.4" fill="none" stroke="${C.olho}" stroke-width="1.3" stroke-linecap="round" opacity="0"/>
      <g class="olho-f"><ellipse cx="14" cy="-26" rx="1.75" ry="2.75" fill="${C.olho}"/><circle class="brilho" cx="14.6" cy="-27" r=".58" fill="#fff"/></g>
      <g class="sobrancelhas" fill="none" stroke="${C.cabelo}" stroke-linecap="round">
        <path d="M0.2,-31.6 C2,-33.4 5.2,-33.6 7.2,-32" stroke-width="2"/>
        <path d="M11.8,-32 C13.4,-33.4 15.8,-33.2 17,-31.6" stroke-width="1.8"/>
      </g>
      <path d="M6.8,-8.8 C8.6,-7.2 11.6,-7.2 13.2,-8.9" fill="none" stroke="${C.boca}" stroke-width="1.2" stroke-linecap="round"/>
      <g class="boca-aberta"><path d="M6.4,-9.8 C7.8,-5 12.8,-5 14.2,-10 C11.6,-9.2 8.8,-9.2 6.4,-9.8 Z" fill="#7A2A20"/><ellipse cx="10.4" cy="-6.9" rx="2.2" ry="1" fill="#D9655A"/></g>
      <path d="M9,-24.6 C8.6,-21.4 7.8,-19.4 8,-17.8 C8.4,-15.4 11.4,-14.6 13.8,-15.2 C16.8,-15.8 17.8,-18.4 16.6,-20.6 C15.6,-22.4 13.2,-23 11.8,-24 Z" fill="#EDB291" stroke="${C.peleContorno}" stroke-width="1"/>
      <path d="M10.8,-16.6 C11.6,-16 12.6,-16 13.4,-16.4" fill="none" stroke="#B26A4C" stroke-width=".8" stroke-linecap="round"/>
      <ellipse cx="14.4" cy="-20" rx="1.4" ry="1" fill="${C.peleLuz}" opacity=".85"/>
      <g class="bigode-n"><path d="M11.6,-15 C8.8,-16 4.8,-15.8 2,-14 C-0.4,-12.4 -2,-13 -2.6,-15 C-3.4,-12.4 -2,-9.2 1.6,-9.4 C5,-9.6 8.8,-10.8 11.8,-11.8 Z" fill="${C.cabelo}"/><path d="M9.4,-14.6 C6.6,-14.6 4,-13.6 2.4,-12.4" fill="none" stroke="${C.cabeloLuz}" stroke-width=".9" stroke-linecap="round"/></g>
      <g class="bigode-f"><path d="M11.6,-15 C14.4,-15.8 17.6,-15.4 19.6,-14.2 C21.2,-13.2 22.2,-13.6 22.6,-15 C23,-12.8 22,-10.4 19.4,-10.4 C16.6,-10.4 14,-11.2 11.6,-11.8 Z" fill="${C.cabelo}"/><path d="M13.4,-14.4 C15.6,-14.6 17.4,-14 18.8,-13.2" fill="none" stroke="${C.cabeloLuz}" stroke-width=".8" stroke-linecap="round"/></g>
      ${luz('M20.4,-29.8 C21.6,-24.8 21.8,-19.6 20.8,-15.4 C19.6,-10.2 16,-6.2 11,-4.8', 1.8)}`,
    chapeu: () => `
      <path d="M-15.6,-9.4 C-20.6,-14 -21.6,-22.4 -17.8,-28 C-15.4,-32 -10.2,-33 -6.8,-31 C-5.6,-35.8 0.4,-38 4.8,-35.4 C8.2,-38 14.2,-36.4 15.8,-31.6 C20.8,-32 23.8,-26.4 22,-21.2 C20.8,-17 19,-12.8 17,-9.4 C9.2,-7.8 -8.6,-8 -15.6,-9.4 Z" fill="${C.branco}" stroke="${C.brancoContorno}" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M-15.6,-9.4 C-20.6,-14 -21.6,-22.4 -17.8,-28 C-17,-22.4 -14.8,-16 -10.4,-8.8 C-12.2,-8.9 -14,-9.1 -15.6,-9.4 Z" fill="${C.brancoSombra}"/>
      <path d="M-9.4,-8.8 C-10.8,-15.4 -11,-22.4 -9.6,-28.4 M-2.2,-8.2 C-2.8,-16.4 -2.6,-24.4 -1.4,-31.4 M5.2,-8.2 C5.2,-16.4 6,-24.4 7.4,-32 M12,-8.6 C13,-15.4 14,-21.4 15.4,-26.4" fill="none" stroke="${C.dobra}" stroke-width="1.1" stroke-linecap="round"/>
      <path d="M-16.4,0.4 C-10,2.8 10.4,3 17.2,0.6 L16.6,-9 C9.2,-7.6 -9.2,-7.8 -15.8,-9.6 Z" fill="${C.branco}" stroke="${C.brancoContorno}" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M-16.4,0.4 C-14.4,1.2 -12.4,1.7 -10.4,2 L-10,-8.2 C-12,-8.6 -14,-9.1 -15.8,-9.6 Z" fill="${C.brancoSombra}"/>
      ${luz('M22,-21.2 C20.8,-17 19,-12.8 17,-9.4 M17.2,0.6 L16.6,-9', 1.8)}`,
    braco: () => `
      <path d="M-6.2,-2 C-6.6,5 -5.9,10.8 -5.2,14 L5.6,14 C6.4,10 6.8,4 6.4,-2 C6.2,-7.4 3,-9.6 0,-9.6 C-3.2,-9.6 -6.2,-7.4 -6.2,-2 Z" fill="${C.branco}"/>
      <path d="M-6.2,-2 C-6.6,5 -5.9,10.8 -5.2,14 L-1.8,14 C-2.2,9 -2.4,2 -2,-6.6 C-3.4,-7 -5,-6 -6.2,-2 Z" fill="${C.brancoSombra}"/>
      <path d="M-6.2,-3 C-6.6,5 -5.9,10.8 -5.2,14 M5.6,14 C6.4,10 6.8,4 6.4,-3" fill="none" stroke="${C.brancoContorno}" stroke-width="1" stroke-linecap="round"/>
      <path d="M-6,12.8 C-2.2,11.4 3,11.4 6.4,12.8 L6.8,18.6 C2.8,20.2 -2.8,20.2 -6.4,18.6 Z" fill="${C.branco}" stroke="${C.brancoContorno}" stroke-width="1" stroke-linejoin="round"/>
      <path d="M-6,15.8 C-2.2,17 2.6,17 6.6,15.8" fill="none" stroke="${C.dobra}" stroke-width=".9" stroke-linecap="round"/>
      ${luz('M6.2,-3.6 C6.8,3 6.4,10 5.6,14', 1.6)}`,
    antebraco: () => `
      <path d="M-4.2,-2.4 C-4.6,4.4 -4,11 -3.2,15.6 C-2,17 2.2,17 3.4,15.6 C4.2,11 4.8,4.4 4.4,-2.4 Z" fill="${C.pele}" stroke="${C.peleContorno}" stroke-width=".9"/>
      <path d="M-4.2,-2.4 C-4.6,4.4 -4,11 -3.2,15.6 C-2.6,16.3 -1.8,16.6 -1,16.7 C-1.6,11 -2,4.4 -1.8,-2.4 Z" fill="${C.peleSombra}"/>
      ${luz('M4.4,-1 C4.8,4.4 4.2,11 3.4,15.6', 1.4)}`,
    mao: () => `
      <path d="M-4.6,-1.6 C-5.4,-5.4 -1.6,-6.8 1.6,-6.4 C4.6,-6 6.4,-3.8 6.2,-0.6 C6,2 6.4,4.4 4.6,5.8 C3,7 -0.2,7 -2.4,6.2 C-4.8,5.2 -5.4,2.8 -4.6,-1.6 Z" fill="${C.pele}" stroke="${C.peleContorno}" stroke-width="1"/>
      <path d="M6,-0.2 C4.6,0.4 3.2,0.2 2.2,-0.6 M6.1,2.8 C4.6,3.4 3.2,3.2 2.2,2.4 M5.2,5.4 C4,5.8 2.8,5.6 2,5" fill="none" stroke="${C.peleContorno}" stroke-width=".8" stroke-linecap="round"/>
      <path d="M-4,-1.8 C-3,-4.8 1.6,-5.6 4.2,-3.4 C4.6,-2.6 4,-1.8 3,-1.8 C0.6,-1.6 -1.8,-1 -4,-1.8 Z" fill="#F6CEB0" stroke="${C.peleContorno}" stroke-width=".8"/>
      <path d="M-2.6,-5.4 C-0.6,-6.2 2.2,-6 3.8,-5" fill="none" stroke="${C.peleLuz}" stroke-width=".8" stroke-linecap="round"/>`,
    maoJoinha: () => `<g transform="translate(-0.4 -8.6)">
      <path d="M-5,-3 C-5,-6.4 -2.6,-7.6 0.6,-7.6 C4.2,-7.6 6,-6.2 6,-3.2 L6,4 C6,6.4 4,7.4 1,7.4 C-2.4,7.4 -5,6.4 -5,4 Z" fill="${C.pele}" stroke="${C.peleContorno}" stroke-width="1"/>
      <path d="M6,-4.4 L1.8,-4.4 M6,-1.2 L1.8,-1.2 M6,2 L2,2" fill="none" stroke="${C.peleContorno}" stroke-width=".75" stroke-linecap="round"/>
      <path d="M-1.6,-7.2 C-2,-10.6 -1.4,-14.6 0.8,-15.2 C3,-15.6 3.6,-13.2 3.4,-10.6 L3.2,-7.2 Z" fill="${C.pele}" stroke="${C.peleContorno}" stroke-width="1"/>
      <ellipse cx="1.2" cy="-13.8" rx="1" ry=".8" fill="#FADFCB"/></g>`,
    maoAberta: () => `
      <path d="M-4.4,-1.6 C-4.8,-4.4 -1.8,-5.4 1.6,-5 L9.8,-4 C11.6,-3.8 11.8,-1.4 10,-1 L3.8,0 C2.6,2.4 -1.4,3.4 -3.6,2.2 C-4.8,1.4 -4.9,0.2 -4.4,-1.6 Z" fill="${C.pele}" stroke="${C.peleContorno}" stroke-width="1"/>
      <path d="M3.4,-4.2 L9.6,-3.4 M3.6,-2.6 L9.8,-2" fill="none" stroke="${C.peleContorno}" stroke-width=".6" stroke-linecap="round"/>
      <path d="M-0.8,-4.8 C0.4,-7.2 3.2,-7.8 4.8,-6.6" fill="none" stroke="${C.peleContorno}" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M-0.8,-4.8 C0.4,-7.2 3.2,-7.8 4.8,-6.6" fill="none" stroke="${C.pele}" stroke-width="1.4" stroke-linecap="round"/>`,
    pa: () => `
      <path d="M0,-1.6 L70,-1.35 L70,1.35 L0,1.6 C-1.1,1.6 -1.1,-1.6 0,-1.6 Z" fill="${C.madeira}"/>
      <path d="M1,-0.8 L69,-0.6" stroke="${C.madeiraLuz}" stroke-width=".7" stroke-linecap="round"/>
      <path d="M73.6,-2.6 C80.6,-4.8 86.6,-6.8 94.6,-7.4 C103.6,-7.8 109.6,-6.2 111,-2 C112,2 106.6,4.8 96.6,5.6 C87.6,6.2 80.6,5 73.6,2.8 Z" fill="url(#pzcMetal)" stroke="${C.metalBorda}" stroke-width=".8"/>
      <path d="M111,-2 C112,2 106.6,4.8 96.6,5.6 C87.6,6.2 80.6,5 73.6,2.8 L73.6,3.9 C80.6,6.3 87.6,7.5 96.6,6.9 C106.6,6.1 112.2,3.2 111,-2 Z" fill="#77706A"/>
      <path d="M80.6,-3.8 C88.6,-5.8 98.6,-6.4 104.6,-5.2" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.2" stroke-linecap="round"/>
      <path d="M69,-2.4 L74.4,-2.4 C75.2,-2.4 75.2,2.4 74.4,2.4 L69,2.4 Z" fill="${C.aro}" stroke="${C.metalBorda}" stroke-width=".5"/>`
  };

  /* ---------- medidas do esqueleto ---------- */
  const R = {
    tornozelo: 6.6, coxa: 23, canela: 23, alturaQuadril: 44.6,
    quadrilN: [-3.5, 0.6], quadrilF: [4.2, -0.6], cintura: [0, -3],
    ombroN: [-7.4, -33.4], ombroF: [11.6, -34.4], pescoco: [3.2, -34],
    braco: 17, antebraco: 15, mao: 4.6, chapeu: [3.4, -36.2],
    sola: [[-6.8, 6.6], [15.2, 6.6]],
    paCentro: [94, -0.8], pizzaEscala: 0.3, pizzaAmassa: 0.42
  };

  /* ---------- utilidades ---------- */
  const rot = (x, y, a) => { const c = Math.cos(a * RAD), s = Math.sin(a * RAD); return [x * c - y * s, x * s + y * c]; };
  const lerp = (a, b, t) => a + (b - a) * t;
  const f2 = (v) => (Math.round(v * 100) / 100).toString();
  function tf(el, x, y, a, sx, sy) {
    let s = 'translate(' + f2(x) + ' ' + f2(y) + ')';
    if (a) s += ' rotate(' + f2(a) + ')';
    if (sx != null && (sx !== 1 || sy !== 1)) s += ' scale(' + f2(sx) + ' ' + f2(sy) + ')';
    if (el.__transform !== s) { el.__transform = s; el.setAttribute('transform', s); }
  }
  // grava o atributo só quando o valor muda: menos invalidação de estilo e de pintura a cada quadro
  function at(e, nome, v) { const k = '__' + nome; if (e[k] !== v) { e[k] = v; e.setAttribute(nome, v); } }
  function el(tag, attrs, pai) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (pai) pai.appendChild(e);
    return e;
  }
  let seq = 0;
  function parte(pai, nome) { const g = el('g', { class: 'pz-' + nome }, pai); g.innerHTML = ARTE[nome](); return g; }
  // Cada cena ganha IDs próprios: com duas cenas na página, url(#id) apontaria para a da outra.
  function isolarIds(raiz, uid) {
    raiz.querySelectorAll('[id]').forEach((e) => { if (e.id.startsWith('pzc')) e.id = uid + e.id.slice(3); });
    raiz.querySelectorAll('*').forEach((e) => {
      for (const a of ['fill', 'stroke', 'clip-path', 'filter', 'mask']) {
        const v = e.getAttribute(a);
        if (v && v.indexOf('#pzc') >= 0) e.setAttribute(a, v.replace(/#pzc/g, '#' + uid));
      }
    });
  }

  // IK de dois ossos. dobra -1: articulação à frente (joelho); +1: articulação para baixo (cotovelo).
  function ik(ax, ay, tx, ty, l1, l2, dobra) {
    let dx = tx - ax, dy = ty - ay, d = Math.hypot(dx, dy) || 1e-4;
    const pedido = d, max = l1 + l2 - 0.02, min = Math.abs(l1 - l2) + 0.02;
    if (d > max) { dx *= max / d; dy *= max / d; d = max; } else if (d < min) { dx *= min / d; dy *= min / d; d = min; }
    const base = Math.atan2(dy, dx);
    const a1 = base + dobra * Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
    const jx = ax + Math.cos(a1) * l1, jy = ay + Math.sin(a1) * l1, ex = ax + dx, ey = ay + dy;
    return { jx, jy, ex, ey, r1: a1 * DEG - 90, r2: Math.atan2(ey - jy, ex - jx) * DEG - 90, falta: pedido - d };
  }

  /* ---------- pose ---------- */
  function poseInicial() {
    return {
      x: 118, agacha: 0, inclina: 0, cabeca: 0, chapeu: 0,
      pN: { x: 112, lift: 0, a: 0 }, pF: { x: 126, lift: 0, a: 0 },
      pa: { x: -3, y: -16, a: 3 }, gN: 9, gF: 30,
      maoN: 0, joinha: { x: 15, y: -24 },
      olhar: 0, pisca: 0, piscadela: 0, sorriso: 0.15, sobrancelha: 0, boca: 0,
      luz: 0, chama: 0, dentro: 0, cam: 70,
      pizza: { u: 0, amassa: 1, forno: 0, desliza: 0, assada: 0 }
    };
  }

  /* ---------- peças compartilhadas: gradientes, forno e pizzaiolo ---------- */
  function criarDefs(svg) {
    const defs = el('defs', {}, svg);
    defs.innerHTML = `
      <linearGradient id="pzcMetal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F3EFE8"/><stop offset="1" stop-color="#B1A99E"/></linearGradient>
      <linearGradient id="pzcCupula" x1="0" y1="0" x2=".9" y2="1"><stop offset="0" stop-color="#D7805C"/><stop offset=".55" stop-color="#BE5E3F"/><stop offset="1" stop-color="#8E3A26"/></linearGradient>
      <linearGradient id="pzcBase" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8F3F2A"/><stop offset="1" stop-color="#6E2D1D"/></linearGradient>
      <radialGradient id="pzcBrasa" cx="50%" cy="60%" r="60%"><stop offset="0" stop-color="#FFC861" stop-opacity=".95"/><stop offset=".45" stop-color="#F2802A" stop-opacity=".55"/><stop offset="1" stop-color="#E2501C" stop-opacity="0"/></radialGradient>
      <radialGradient id="pzcCalor" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#FFB24A" stop-opacity=".55"/><stop offset="1" stop-color="#FFB24A" stop-opacity="0"/></radialGradient>
      <linearGradient id="pzcInterior" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1C0D06"/><stop offset="1" stop-color="#3B1B0D"/></linearGradient>
      <radialGradient id="pzcAssa" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#FF9F3F" stop-opacity=".0"/><stop offset=".7" stop-color="#E06A1E" stop-opacity=".35"/><stop offset="1" stop-color="#A9441A" stop-opacity=".6"/></radialGradient>
      <clipPath id="pzcRecorte"><rect x="-4000" y="-4000" width="${BOCA.x0 + 4000}" height="8000"/><path d="${BOCA_D}"/></clipPath>
      <clipPath id="pzcBocaClip"><path d="${BOCA_D}"/></clipPath>`;
    return defs;
  }

  // Forno a lenha (coordenadas da cena grande). O piso interno fica na altura da cintura do pizzaiolo.
  function criarForno(pai) {
    const calorPiso = el('ellipse', { cx: 318, cy: CHAO, rx: 120, ry: 16, fill: 'url(#pzcCalor)', opacity: 0.25 }, pai);
    const forno = el('g', { class: 'pzc-forno' }, pai);
    forno.innerHTML = `
      <rect x="258" y="164" width="140" height="${CHAO - 164}" rx="4" fill="url(#pzcBase)"/>
      <path d="M266,180h22M300,180h24M336,180h22M370,180h22M276,193h22M312,193h24M348,193h22M266,206h20M300,206h24M336,206h22M372,206h20M276,219h22M312,219h24M348,219h22" stroke="#5A2416" stroke-width="1.6" opacity=".55"/>
      <path d="M262,166 L262,116 C262,74 293,48 330,48 C367,48 398,74 398,116 L398,166 Z" fill="url(#pzcCupula)"/>
      <path d="M272,102 C278,78 298,62 320,58" fill="none" stroke="#F0A27E" stroke-width="3" stroke-linecap="round" opacity=".55"/>
      <path d="M276,134h14M372,132h16M282,112h12M376,108h12M296,80h14M352,76h14M322,64h12" stroke="#9A4229" stroke-width="1.6" stroke-linecap="round" opacity=".6"/>
      <rect x="352" y="26" width="16" height="36" rx="2" fill="#7E3422"/><rect x="349" y="22" width="22" height="6" rx="2" fill="#6A2B1C"/>
      <path d="M${BOCA.x0 - 7},${BOCA.base} L${BOCA.x0 - 7},134 C${BOCA.x0 - 7},115 310,103 ${BOCA.cx},103 C348,103 ${BOCA.x1 + 7},115 ${BOCA.x1 + 7},134 L${BOCA.x1 + 7},${BOCA.base} Z" fill="#D88A5F"/>
      <path d="M296,150l-8,-1M296,134l-8,-3M302,120l-7,-6M314,110l-4,-7M329,107v-8M344,110l4,-7M356,120l7,-6M362,134l8,-3M362,150l8,-1" stroke="#9A4A30" stroke-width="1.4" stroke-linecap="round"/>
      <path d="${BOCA_D}" fill="url(#pzcInterior)"/>
      <rect x="290" y="${BOCA.base - 1}" width="78" height="5" rx="2" fill="#7B3B27"/>`;
    const interior = el('g', { 'clip-path': 'url(#pzcBocaClip)' }, pai);
    const brasa = el('ellipse', { cx: 318, cy: 152, rx: 44, ry: 34, fill: 'url(#pzcBrasa)', opacity: 0.55 }, interior);
    el('path', { d: `M${BOCA.x0},${BOCA.base} L${BOCA.x0},158 C318,155 340,155 ${BOCA.x1},158 L${BOCA.x1},${BOCA.base} Z`, fill: '#5A2E1B' }, interior);
    const lenha = el('g', {}, interior);
    lenha.innerHTML = `<rect x="303" y="157" width="20" height="4" rx="2" fill="#4A2412" transform="rotate(-8 313 159)"/><rect x="306" y="156" width="18" height="4" rx="2" fill="#5C2E17" transform="rotate(10 315 158)"/>`;
    const chamas = [
      { d: 'M-12,0 C-14,-8 -8,-12 -6,-20 C-4,-14 -2,-12 0,-22 C2,-14 6,-12 6,-27 C10,-16 14,-8 12,0 Z', cor: '#E8541C', f: 1 },
      { d: 'M-8,0 C-9,-6 -5,-9 -3,-15 C-1,-10 1,-9 2,-18 C5,-10 9,-6 8,0 Z', cor: '#F49A1F', f: 1.3 },
      { d: 'M-5,0 C-5.6,-4 -3,-6 -1.6,-10 C0,-6 2,-6 2.6,-11 C4.4,-6 5.6,-3 5,0 Z', cor: '#FFD45C', f: 1.7 }
    ].map((c) => { const g = el('g', {}, interior); el('path', { d: c.d, fill: c.cor }, g); return { g, f: c.f }; });
    const fumacas = [0, 1, 2].map((i) => el('circle', { cx: 360, cy: 20, r: 3, fill: ['#CFC6BA', '#DDD6CC', '#C4BAAD'][i], opacity: 0 }, pai));
    // chamas, brasa, calor e fumaça são procedurais: dependem só do tempo
    function render(t, chama, luz) {
      chamas.forEach((c, i) => {
        const sy = 1 + 0.1 * Math.sin(t * 13 * c.f + i) + 0.06 * Math.sin(t * 29 + i * 2) + chama * 0.55;
        const sx = 1 + 0.05 * Math.sin(t * 17 + i * 3) + chama * 0.18;
        at(c.g, 'transform', 'translate(' + (316 + i * 1.5) + ' 160) skewX(' + f2(3 * Math.sin(t * 11 + i)) + ') scale(' + f2(sx) + ' ' + f2(sy) + ')');
      });
      at(brasa, 'opacity', f2(0.5 + 0.08 * Math.sin(t * 9) + chama * 0.45));
      at(calorPiso, 'opacity', f2(0.22 + luz * 0.6));
      fumacas.forEach((c, i) => {
        const p = ((t / 2.2) + i / 3) % 1;
        at(c, 'cx', f2(360 + 5 * p * (1 + i * 0.6)));
        at(c, 'cy', f2(20 - 30 * p));
        at(c, 'r', f2(3 + 6 * p));
        at(c, 'opacity', f2(0.55 * (1 - p) * Math.min(1, p * 6)));
      });
    }
    return { interior, render };
  }

  // Pizzaiolo articulado: lê a pose de S a cada render. Camadas: tras (corpo), meio (pá ou massa e o que a
  // cena puser ali), frente (braço da frente e mãos). Sem pá, as mãos ficam abertas e vão até S.maos.
  function criarAtor(pai, S, opcoes = {}) {
    const chao = opcoes.chao || CHAO, comPa = opcoes.comPa !== false;
    const tras = el('g', { class: 'pzc-ator' }, pai), meio = el('g', {}, pai), frente = el('g', { class: 'pzc-ator-frente' }, pai);
    const sombra = el('ellipse', { rx: 26, ry: 4.2, fill: '#2B1A0E', opacity: 0.16 }, tras);
    const sombraPeN = parte(tras, 'sombraPe'), sombraPeF = parte(tras, 'sombraPe');
    const P = {};
    P.bracoF = parte(tras, 'braco'); P.antebracoF = parte(tras, 'antebraco');
    P.coxaF = parte(tras, 'coxa'); P.canelaF = parte(tras, 'canela'); P.sapatoF = parte(tras, 'sapato');
    P.coxaN = parte(tras, 'coxa'); P.canelaN = parte(tras, 'canela'); P.sapatoN = parte(tras, 'sapato');
    P.quadril = parte(tras, 'quadril');
    P.tronco = parte(tras, 'tronco');
    P.avental = parte(tras, 'avental');
    P.cabeca = parte(tras, 'cabeca');
    P.chapeu = parte(tras, 'chapeu');
    if (comPa) P.pa = parte(meio, 'pa');
    const mao = comPa ? 'mao' : 'maoAberta';
    P.maoF = parte(frente, mao);
    P.bracoN = parte(frente, 'braco'); P.antebracoN = parte(frente, 'antebraco');
    P.maoN = parte(frente, mao); P.joinha = parte(frente, 'maoJoinha');
    const cab = {
      olhoN: P.cabeca.querySelector('.olho-n'), olhoF: P.cabeca.querySelector('.olho-f'),
      piscada: P.cabeca.querySelector('.piscada'), sobr: P.cabeca.querySelector('.sobrancelhas'),
      boca: P.cabeca.querySelector('.boca-aberta'), bigN: P.cabeca.querySelector('.bigode-n'), bigF: P.cabeca.querySelector('.bigode-f')
    };
    function pe(p) {
      const ax = p.x; let ay = chao - R.tornozelo - p.lift;
      let baixo = -Infinity;
      for (const [bx, by] of R.sola) baixo = Math.max(baixo, ay + rot(bx, by, p.a)[1]);
      if (baixo > chao) ay -= baixo - chao;
      return { ax, ay, a: p.a };
    }
    function render() {
      // pés e altura da pelve (abaixa quando as pernas abrem: o "quique" do passo sai daqui)
      const pN = pe(S.pN), pF = pe(S.pF);
      let py = chao - R.tornozelo - R.alturaQuadril + S.agacha;
      const LMAX = (R.coxa + R.canela) * 0.995;
      for (const [p, q] of [[pN, R.quadrilN], [pF, R.quadrilF]]) {
        const dx = p.ax - (S.x + q[0]);
        const minY = Math.abs(dx) < LMAX ? p.ay - Math.sqrt(LMAX * LMAX - dx * dx) - q[1] : p.ay - q[1];
        if (py < minY) py = minY;
      }
      const px = S.x;
      // pernas
      const pernas = [['N', pN, R.quadrilN], ['F', pF, R.quadrilF]].map(([lado, p, q]) => {
        const hx = px + q[0], hy = py + q[1];
        const s = ik(hx, hy, p.ax, p.ay, R.coxa, R.canela, -1);
        tf(P['coxa' + lado], hx, hy, s.r1);
        tf(P['canela' + lado], s.jx, s.jy, s.r2);
        tf(P['sapato' + lado], s.ex, s.ey, p.a);
        return { lado, hx, hy, s, p };
      });
      tf(P.quadril, px, py);
      // tronco, avental, cabeça e chapéu
      const L = S.inclina;
      const wx = px + R.cintura[0], wy = py + R.cintura[1];
      const W = (x, y) => { const r = rot(x, y, L); return [wx + r[0], wy + r[1]]; };
      tf(P.tronco, wx, wy, L);
      const balanco = Math.min(0, pernas[0].s.r1, pernas[1].s.r1) * 0.42;
      tf(P.avental, wx, wy, L * 0.7 + balanco);
      const [nx, ny] = W(R.pescoco[0], R.pescoco[1]);
      const H = L + S.cabeca;
      tf(P.cabeca, nx, ny, H);
      const hc = rot(R.chapeu[0], R.chapeu[1], H);
      tf(P.chapeu, nx + hc[0], ny + hc[1], H + S.chapeu);
      // rosto
      const piscaN = Math.max(S.pisca, S.piscadela), piscaF = S.pisca;
      at(cab.olhoN, 'transform', 'translate(' + f2(S.olhar * 0.9) + ' 0) translate(3.8 -25.8) scale(1 ' + f2(Math.max(0.08, 1 - piscaN)) + ') translate(-3.8 25.8)');
      at(cab.olhoF, 'transform', 'translate(' + f2(S.olhar * 0.7) + ' 0) translate(14 -26) scale(1 ' + f2(Math.max(0.08, 1 - piscaF)) + ') translate(-14 26)');
      at(cab.piscada, 'opacity', S.piscadela > 0.6 ? '1' : '0');
      at(cab.olhoN, 'opacity', S.piscadela > 0.6 ? '0' : '1');
      at(cab.sobr, 'transform', 'translate(0 ' + f2(-1.8 * S.sobrancelha) + ')');
      at(cab.boca, 'transform', 'translate(10.2 -9.6) scale(1 ' + f2(Math.max(0.001, S.boca)) + ') translate(-10.2 9.6)');
      at(cab.bigN, 'transform', 'rotate(' + f2(9 * S.sorriso) + ' 11.6 -13.4)');
      at(cab.bigF, 'transform', 'rotate(' + f2(-9 * S.sorriso) + ' 11.6 -13.4)');
      // braços: com pá, IK até a pegada no cabo; sem pá, até S.maos. A mão da frente pode virar "joinha".
      const ombros = { N: W(R.ombroN[0], R.ombroN[1]), F: W(R.ombroF[0], R.ombroF[1]) };
      const jN = [px + S.joinha.x, py + S.joinha.y];
      let A, pax = px, pay = py, naPa = null, alvoN, alvoF;
      if (comPa) {
        A = S.pa.a; pax = px + S.pa.x; pay = py + S.pa.y;
        naPa = (d, e = 0) => { const r = rot(d, e, A); return [pax + r[0], pay + r[1]]; };
        tf(P.pa, pax, pay, A);
        // a mão desliza pelo cabo quando a pegada pedida sairia do alcance do braço (como um pizzaiolo faz)
        const alcance = (R.braco + R.antebraco + R.mao) * 0.95;
        const pegada = (o, g, min, max) => {
          const ux = Math.cos(A * RAD), uy = Math.sin(A * RAD), wx2 = o[0] - pax, wy2 = o[1] - pay;
          const proj = wx2 * ux + wy2 * uy, perp = Math.abs(wx2 * uy - wy2 * ux);
          let lo = min, hi = max;
          if (perp < alcance) { const w = Math.sqrt(alcance * alcance - perp * perp); lo = Math.max(lo, proj - w); hi = Math.min(hi, proj + w); }
          return lo <= hi ? Math.max(lo, Math.min(hi, g)) : Math.max(min, Math.min(max, proj));
        };
        const dF = pegada(ombros.F, S.gF, 14, 70);
        const dN = pegada(ombros.N, Math.min(S.gN, dF - 11), 1, dF - 11);
        const gN = naPa(dN);
        alvoF = naPa(dF);
        alvoN = [lerp(gN[0], jN[0], S.maoN), lerp(gN[1], jN[1], S.maoN)];
      } else {
        A = S.maoA || 0;
        const m = S.maos;
        alvoF = [px + m.F[0], py + m.F[1]];
        alvoN = [lerp(px + m.N[0], jN[0], S.maoN), lerp(py + m.N[1], jN[1], S.maoN)];
      }
      const bracos = [['N', ombros.N, alvoN], ['F', ombros.F, alvoF]].map(([lado, o, alvo]) => {
        const s = ik(o[0], o[1], alvo[0], alvo[1], R.braco, R.antebraco + R.mao, 1);
        tf(P['braco' + lado], o[0], o[1], s.r1);
        tf(P['antebraco' + lado], s.jx, s.jy, s.r2);
        return { lado, o, s, alvo };
      });
      tf(P.maoF, bracos[1].s.ex, bracos[1].s.ey, A);
      const joinha = S.maoN >= 0.5;
      at(P.maoN, 'display', joinha ? 'none' : 'inline');
      at(P.joinha, 'display', joinha ? 'inline' : 'none');
      if (joinha) {
        const s = bracos[0].s, dir = (s.r2 + 90) * RAD;
        tf(P.joinha, s.jx + Math.cos(dir) * R.antebraco, s.jy + Math.sin(dir) * R.antebraco, L * 0.5 - 8);
      } else tf(P.maoN, bracos[0].s.ex, bracos[0].s.ey, A);
      // sombras no chão
      at(sombra, 'cx', f2(px + 4)); at(sombra, 'cy', f2(chao + 0.6));
      at(sombra, 'rx', f2(24 + Math.abs(pN.ax - pF.ax) * 0.45));
      [[sombraPeN, pN], [sombraPeF, pF]].forEach(([g, p]) => {
        const alt = chao - R.tornozelo - p.ay;
        tf(g, p.ax, chao + 0.4, 0, Math.max(0.4, 1 - alt / 14), 1);
        at(g, 'opacity', f2(Math.max(0, 0.22 - alt * 0.02)));
      });
      return { px, py, A, pax, pay, naPa, pernas, bracos };
    }
    return { S, P, tras, meio, frente, render };
  }

  /* ---------- cena grande: pizzaiolo leva a pizza ao forno ---------- */
  function criar(svg) {
    svg.innerHTML = '';
    const uid = 'pzc' + (++seq) + '-';
    criarDefs(svg);
    el('ellipse', { cx: 200, cy: CHAO + 2, rx: 210, ry: 5, fill: 'rgba(43,30,15,.07)' }, svg);
    const forno = criarForno(svg);
    const S = poseInicial();
    const ator = criarAtor(svg, S);
    // pizza fica entre a pá e as mãos; pá e pizza são recortadas pela boca do forno só enquanto entram/saem
    const recorte = el('g', {});
    svg.insertBefore(recorte, ator.frente);
    const pizzaG = el('g', { class: 'pzc-pizza' }, recorte);
    const pizzaImg = el('image', { x: -50, y: -50, width: 100, height: 100, preserveAspectRatio: 'xMidYMid meet' }, pizzaG);
    const pizzaAssa = el('ellipse', { cx: 0, cy: 0, rx: 46, ry: 46, fill: 'url(#pzcAssa)', opacity: 0 }, pizzaG);
    const debug = el('g', { class: 'pzc-debug', display: 'none' }, svg);

    const cena = { svg, S, P: ator.P, voo: null, forno: null, tempo: 0, mostrarDebug: false };
    const clipURL = 'url(#' + uid + 'Recorte)';
    const luzes = svg.querySelectorAll('.luz');

    function render() {
      const t = cena.tempo;
      const { A, naPa, pernas, bracos, pax, pay } = ator.render();
      // pizza: voo → pá → forno
      const Z = S.pizza;
      const [bx, by] = naPa(R.paCentro[0], R.paCentro[1]);
      if (Z.forno && cena.forno) {
        const f = cena.forno;
        tf(pizzaG, f.x + Z.desliza, f.y, 0, R.pizzaEscala, R.pizzaEscala * R.pizzaAmassa);
        at(pizzaImg, 'transform', 'rotate(200)');
      } else if (Z.u >= 1 || !cena.voo) {
        tf(pizzaG, bx, by, A, R.pizzaEscala, R.pizzaEscala * R.pizzaAmassa * Z.amassa);
        at(pizzaImg, 'transform', 'rotate(200)');
      } else {
        const v = cena.voo, u = Z.u;
        const x = lerp(v.x, bx, u), y = lerp(v.y, by, u) - v.h * 4 * u * (1 - u);
        const e = 1 - Math.pow(1 - u, 2);
        const s = lerp(v.s, R.pizzaEscala, e);
        tf(pizzaG, x, y, A * u, s, s * lerp(1, R.pizzaAmassa, u * u));
        at(pizzaImg, 'transform', 'rotate(' + f2(200 * u) + ')');
      }
      at(pizzaAssa, 'opacity', f2(Z.assada));
      // recorte pela boca do forno: a pá só enquanto entra/sai; a pizza também depois de ficar lá dentro
      const recPa = S.dentro ? clipURL : null, recPz = S.dentro || Z.forno ? clipURL : null;
      if (ator.meio.getAttribute('clip-path') !== recPa) recPa ? ator.meio.setAttribute('clip-path', recPa) : ator.meio.removeAttribute('clip-path');
      if (recorte.getAttribute('clip-path') !== recPz) recPz ? recorte.setAttribute('clip-path', recPz) : recorte.removeAttribute('clip-path');
      forno.render(t, S.chama, S.luz);
      // luz do forno nas bordas: só mexe nos poucos traços .luz, e só quando muda (variável CSS forçaria recalcular o SVG todo)
      const lv = f2(S.luz * 0.42);
      if (lv !== cena.luzAtual) { cena.luzAtual = lv; luzes.forEach((e) => e.setAttribute('opacity', lv)); }
      at(svg, 'viewBox', cena.camera ? f2(S.cam) + ' ' + CAMERA.y + ' ' + CAMERA.w + ' ' + CAMERA.h : '0 0 400 250');
      cena.ultimo = { pernas, bracos };
      if (cena.mostrarDebug) desenhaDebug(pernas, bracos, [pax, pay], [bx, by]);
    }

    function desenhaDebug(pernas, bracos, pa, centro) {
      let h = '';
      const linha = (a, b, cor) => { h += `<line x1="${f2(a[0])}" y1="${f2(a[1])}" x2="${f2(b[0])}" y2="${f2(b[1])}" stroke="${cor}" stroke-width=".9"/>`; };
      const ponto = (p, cor, r = 1.6) => { h += `<circle cx="${f2(p[0])}" cy="${f2(p[1])}" r="${r}" fill="${cor}"/>`; };
      pernas.forEach(({ hx, hy, s }) => { linha([hx, hy], [s.jx, s.jy], '#00A3FF'); linha([s.jx, s.jy], [s.ex, s.ey], '#00A3FF'); ponto([hx, hy], '#00A3FF'); ponto([s.jx, s.jy], '#00A3FF'); ponto([s.ex, s.ey], s.falta > 0.4 ? '#FF0033' : '#00C853', 2); });
      bracos.forEach(({ o, s, alvo }) => { linha(o, [s.jx, s.jy], '#B000FF'); linha([s.jx, s.jy], [s.ex, s.ey], '#B000FF'); ponto(o, '#B000FF'); ponto([s.jx, s.jy], '#B000FF'); ponto(alvo, s.falta > 0.4 ? '#FF0033' : '#00C853', 2); });
      ponto(pa, '#FF8A00', 2); ponto(centro, '#FF8A00', 1.2);
      debug.innerHTML = h;
    }

    cena.render = render;
    cena.debug = (on) => { cena.mostrarDebug = !!on; debug.setAttribute('display', on ? '' : 'none'); render(); };
    cena.pizzaImg = pizzaImg;
    isolarIds(svg, uid);
    render();
    return cena;
  }

  /* ---------- forninho: o mesmo forno e dois pizzaiolos pequenos, para o montador ----------
     Um enforna e vira a pizza; o outro (espelhado, do outro lado do forno) gira a massa. Ficam em loops
     discretos e reagem às escolhas: sabor (arremesso alto), tamanho (abre a massa), borda (belisca e
     marca o aro na cor da borda), passo (pulinho) e oi (joinha e piscadela). */
  function criarForninho(svg, opcoes = {}) {
    const animar = opcoes.animar !== false && !!window.gsap;
    svg.innerHTML = '';
    const uid = 'pzc' + (++seq) + '-';
    svg.setAttribute('viewBox', '168 6 300 226');
    criarDefs(svg);
    el('ellipse', { cx: 318, cy: CHAO + 2, rx: 150, ry: 5, fill: 'rgba(43,30,15,.08)' }, svg);
    const forno = criarForno(svg);
    // pizza de exemplo assando lá dentro (vista de cima, achatada pela perspectiva)
    const pzF = el('g', { transform: 'translate(334 160) scale(1 .42)' }, forno.interior);
    pzF.innerHTML = `<g class="giro"><circle r="17" fill="#E3A85A" stroke="#B9783A" stroke-width="1.6"/><circle r="13.6" fill="#C93F20"/>
      <path d="M-11,-4 C-8,-12 6,-13 11,-5 C14,2 9,11 0,12 C-9,12 -14,4 -11,-4 Z" fill="#F1C766"/>
      <circle cx="-5" cy="-5" r="2.8" fill="#A8231B"/><circle cx="6" cy="-3" r="2.6" fill="#A8231B"/><circle cx="1" cy="6" r="2.8" fill="#A8231B"/><circle cx="-7" cy="4" r="1.4" fill="#3F8A2E"/><circle cx="8" cy="5" r="1.3" fill="#3F8A2E"/></g>`;
    const pzGiro = pzF.querySelector('.giro');
    // pizzaiolo A: em frente ao forno, com a pá
    const XA = 206, XB = 432;
    const SA = Object.assign(poseInicial(), { x: XA, inclina: 5, sorriso: 0.3, pN: { x: 222, lift: 0, a: 0 }, pF: { x: 192, lift: 0, a: 0 }, pa: { x: -4, y: -18.7, a: 1 }, gN: 9, gF: 30, virada: 0, giroTotal: 0 });
    const atorA = criarAtor(svg, SA);
    // pizzaiolo B: do outro lado, olhando para o forno (espelhado), girando a massa
    const grupoB = el('g', { transform: 'translate(' + 2 * XB + ' 0) scale(-1 1)' }, svg);
    const SB = Object.assign(poseInicial(), { x: XB, sorriso: 0.45, pN: { x: XB + 7, lift: 0, a: 0 }, pF: { x: XB - 6, lift: 0, a: 0 }, maos: { N: [13, -27], F: [27, -28] }, maoA: 0, maosY: 0, abre: 0, massa: { y: 0, giro: 0, escala: 1, aro: 0 } });
    const atorB = criarAtor(grupoB, SB, { comPa: false });
    const massaG = el('g', {}, atorB.meio);
    massaG.innerHTML = `<ellipse class="disco" rx="22" ry="6.4" fill="#F3D9A4" stroke="#D2A866" stroke-width="1.2"/>
      <ellipse class="aro" rx="20.6" ry="5.8" fill="none" stroke="#FFF7E4" stroke-width="2.8" opacity="0"/>
      <ellipse class="brilho" cx="0" cy="-1.4" rx="7" ry="1.8" fill="#FFF3D9" opacity=".8"/>`;
    const aro = massaG.querySelector('.aro'), brilho = massaG.querySelector('.brilho');
    const clipURL = 'url(#' + uid + 'Recorte)';
    isolarIds(svg, uid);

    const T = { a: null, b: null, ra: null, rb: null };
    let quadro = 0;
    function render(t) {
      atorA.render();
      if (atorA.meio.getAttribute('clip-path') !== (SA.dentro ? clipURL : null)) SA.dentro ? atorA.meio.setAttribute('clip-path', clipURL) : atorA.meio.removeAttribute('clip-path');
      at(pzGiro, 'transform', 'rotate(' + f2(SA.giroTotal + SA.virada) + ')');
      SB.maos.N = [13 - SB.abre, -27 + SB.maosY];
      SB.maos.F = [27 + SB.abre, -28 + SB.maosY];
      const iB = atorB.render();
      const M = SB.massa, giro = M.giro * RAD;
      // a massa gira no próprio plano: de lado, aparece como um brilho que corre pelo disco e uma leve oscilação
      at(massaG, 'transform', 'translate(' + f2(iB.px + 20) + ' ' + f2(iB.py - 30 + M.y) + ') rotate(' + f2(4 * Math.sin(giro * 2)) + ') scale(' + f2(M.escala) + ')');
      at(brilho, 'cx', f2(12 * Math.sin(giro)));
      at(brilho, 'opacity', f2(0.35 + 0.45 * Math.abs(Math.cos(giro))));
      at(aro, 'opacity', f2(M.aro));
      if ((quadro++ & 1) === 0) forno.render(t, 0, 0);
    }

    // arremesso da massa: antecipa, impulsiona, a massa sobe girando, as mãos esperam e amortecem a pegada
    function arremesso(tl, t0, altura, giros, agacha) {
      const M = SB.massa, voo = 0.32 + altura / 140;
      tl.set(M, { giro: 0 }, t0)
        .to(SB, { maosY: 3, agacha, duration: 0.16, ease: 'power2.out' }, t0)
        .to(M, { y: 3, duration: 0.16, ease: 'power2.out' }, t0)
        .to(SB, { maosY: -10, agacha: 0, duration: 0.13, ease: 'power3.out' }, t0 + 0.16)
        .to(M, { y: -10, duration: 0.13, ease: 'power3.out' }, t0 + 0.16)
        .to(M, { y: -10 - altura, duration: voo / 2, ease: 'power2.out' }, t0 + 0.29)
        .to(M, { y: -2, duration: voo / 2, ease: 'power2.in' }, t0 + 0.29 + voo / 2)
        .to(M, { giro: 360 * giros, duration: voo, ease: 'none' }, t0 + 0.29)
        .to(SB, { maosY: -1, duration: 0.24, ease: 'sine.inOut' }, t0 + 0.29)
        .to(SB, { maosY: 4, agacha: agacha + 1, duration: 0.09, ease: 'power2.out' }, t0 + 0.29 + voo)
        .to(M, { y: 4, duration: 0.09, ease: 'power2.out' }, t0 + 0.29 + voo)
        .to(SB, { maosY: 0, agacha: 0, duration: 0.32, ease: 'power2.inOut' }, t0 + 0.38 + voo)
        .to(M, { y: 0, duration: 0.32, ease: 'power2.inOut' }, t0 + 0.38 + voo);
      return tl;
    }
    // loops de fundo: discretos, para não roubar a atenção da lista de sabores
    function loopA() {
      const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.1, paused: true });
      tl.to(SA, { inclina: 11, agacha: 2.4, duration: 0.45, ease: 'power2.inOut' }, 0.3)
        .to(SA.pa, { x: 15, y: -19.4, duration: 0.45, ease: 'power2.inOut' }, 0.3)
        .set(SA, { dentro: 1 }, 0.4)
        .to(SA, { virada: 70, duration: 0.5, ease: 'power1.inOut' }, 0.8)
        .to(SA.pa, { a: -2, duration: 0.12, yoyo: true, repeat: 3, ease: 'sine.inOut' }, 0.8)
        .to(SA.pa, { x: -4, y: -18.7, duration: 0.42, ease: 'power2.inOut' }, 1.34)
        .to(SA, { inclina: 5, agacha: 0, duration: 0.42, ease: 'power2.inOut' }, 1.34)
        .set(SA, { dentro: 0 }, 1.72)
        .call(() => { SA.giroTotal += SA.virada; SA.virada = 0; }, null, 1.76)
        .to(SA, { pisca: 1, duration: 0.06, yoyo: true, repeat: 1 }, 2.0)
        .to(SA, { olhar: -0.9, cabeca: -5, duration: 0.3, ease: 'power2.out' }, 2.2)
        .to(SA, { olhar: 0, cabeca: 0, duration: 0.35, ease: 'power2.inOut' }, 2.9);
      return tl;
    }
    function loopB() {
      const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.7, paused: true });
      arremesso(tl, 0, 26, 1, 1.4);
      tl.to(SB, { pisca: 1, duration: 0.06, yoyo: true, repeat: 1 }, 1.3);
      return tl;
    }
    // reação: interrompe o loop daquele pizzaiolo, anima a partir da pose atual e volta ao loop na pose neutra
    function reacao(lado, montar) {
      const chave = lado === 'a' ? 'ra' : 'rb', loop = T[lado];
      if (T[chave]) T[chave].kill();
      loop.pause();
      const tl = gsap.timeline({ onComplete: () => { T[chave] = null; if (ativo) loop.restart(); } });
      montar(tl);
      T[chave] = tl;
      if (!ativo) tl.pause();
    }
    function voltaNeutroA(tl, t0) {
      return tl.call(() => { SA.giroTotal += SA.virada; SA.virada = 0; }, null, t0)
        .to(SA, { inclina: 5, agacha: 0, cabeca: 0, olhar: 0, maoN: 0, sorriso: 0.3, sobrancelha: 0, boca: 0, dentro: 0, duration: 0.35, ease: 'power2.inOut' }, t0)
        .to(SA.pa, { x: -4, y: -18.7, a: 1, duration: 0.35, ease: 'power2.inOut' }, t0);
    }
    // reações que não jogam a massa primeiro a trazem de volta às mãos (se estava no ar, ela cai)
    function massaNasMaos(tl) {
      return tl.to(SB.massa, { y: 0, duration: 0.22, ease: 'power2.in' }, 0).to(SB, { maosY: 0, duration: 0.22, ease: 'power2.inOut' }, 0);
    }
    function reagir(tipo, valor) {
      if (!animar || !T.a) return;
      if (tipo === 'sabor' || tipo === 'oi') {
        reacao('b', (tl) => {
          arremesso(tl, 0, tipo === 'sabor' ? 78 : 50, tipo === 'sabor' ? 3 : 2, 3.4);
          tl.to(SB, { sorriso: 1, sobrancelha: 1, boca: 0.8, duration: 0.15 }, 0.3).to(SB, { sobrancelha: 0, boca: 0, sorriso: 0.45, duration: 0.35 }, 1.25);
        });
        reacao('a', (tl) => {
          tl.to(SA, { maoN: 1, sorriso: 1, cabeca: -6, olhar: -0.9, duration: 0.26, ease: 'back.out(1.6)' }, 0.05)
            .to(SA, { piscadela: 1, duration: 0.08, yoyo: true, repeat: 1, repeatDelay: 0.18 }, 0.3);
          voltaNeutroA(tl, 1.05);
        });
      } else if (tipo === 'tamanho') {
        const alvo = valor === 'broto' ? 0.8 : 1;
        reacao('b', (tl) => massaNasMaos(tl)
          .to(SB, { abre: 6, duration: 0.22, ease: 'power2.out' }, 0.22).to(SB.massa, { escala: alvo * 1.14, duration: 0.22, ease: 'power2.out' }, 0.22)
          .to(SB, { abre: 0, duration: 0.4, ease: 'back.out(1.8)' }, 0.48).to(SB.massa, { escala: alvo, duration: 0.4, ease: 'back.out(1.8)' }, 0.48)
          .to(SB, { sorriso: 0.9, duration: 0.2 }, 0.3).to(SB, { sorriso: 0.45, duration: 0.3 }, 0.9));
      } else if (tipo === 'borda') {
        if (valor) aro.setAttribute('stroke', valor);
        reacao('b', (tl) => massaNasMaos(tl)
          .to(SB, { abre: -3.5, duration: 0.08, yoyo: true, repeat: 3, ease: 'sine.inOut' }, 0.22)
          .to(SB.massa, { aro: valor ? 1 : 0, duration: 0.3 }, 0.34));
      } else if (tipo === 'passo') {
        reacao('b', (tl) => massaNasMaos(tl)
          .to(SB, { agacha: 2.5, duration: 0.1, ease: 'power2.out' }, 0.22)
          .to([SB.pN, SB.pF], { lift: 5, duration: 0.16, ease: 'power2.out' }, 0.32).to(SB, { agacha: 0, duration: 0.16 }, 0.32)
          .to([SB.pN, SB.pF], { lift: 0, duration: 0.16, ease: 'power2.in' }, 0.48)
          .to(SB, { agacha: 1.5, duration: 0.08, yoyo: true, repeat: 1 }, 0.64));
      }
    }

    let ativo = false;
    const tick = () => render(gsap.ticker.time);
    function iniciar() {
      if (ativo || !animar) return;
      ativo = true;
      if (!T.a) { T.a = loopA(); T.b = loopB(); }
      [T.ra, T.rb].forEach((r) => r && r.resume());
      if (!T.ra) T.a.resume();
      if (!T.rb) T.b.resume();
      gsap.ticker.add(tick);
    }
    function parar() {
      if (!ativo) return;
      ativo = false;
      [T.a, T.b, T.ra, T.rb].forEach((r) => r && r.pause());
      gsap.ticker.remove(tick);
    }
    render(0);
    return { iniciar, parar, reagir, render, SA, SB, get ativo() { return ativo; } };
  }

  /* ---------- coreografia ---------- */
  // Um passo: o pé sai (calcanhar sobe), descreve um arco e pousa de calcanhar.
  function passo(tl, p, t0, dur, x1, alt = 7) {
    tl.to(p, { x: x1, duration: dur, ease: 'power1.inOut' }, t0)
      .to(p, { keyframes: [{ lift: alt, duration: dur * 0.45, ease: 'sine.out' }, { lift: 0, duration: dur * 0.55, ease: 'sine.in' }] }, t0)
      .to(p, { keyframes: [{ a: 18, duration: dur * 0.22, ease: 'sine.out' }, { a: -12, duration: dur * 0.58, ease: 'sine.inOut' }, { a: 0, duration: dur * 0.2, ease: 'power2.out' }] }, t0);
  }

  function linhaDoTempo(cena, opcoes) {
    const S = cena.S;
    Object.assign(S, poseInicial());
    const tl = gsap.timeline({ paused: true, onUpdate: () => { cena.tempo = tl.time(); cena.render(); } });
    const T = { pega: 0.86, puxa: 2.26 };

    // 1) pizza voa até a pá (o alvo acompanha a pá, então pousa exatamente nela)
    tl.to(S.pizza, { u: 1, duration: T.pega - 0.08, ease: 'none' }, 0.08);
    tl.to(S, { olhar: -1.2, duration: 0.3, ease: 'power2.out' }, 0.05)
      .to(S, { cabeca: -4, duration: 0.4, ease: 'power2.out' }, 0.05)
      .to(S, { olhar: 0.4, cabeca: 3, duration: 0.45, ease: 'sine.inOut' }, 0.42)
      .to(S, { pisca: 1, duration: 0.06, yoyo: true, repeat: 1 }, 0.3);
    // antecipação: abaixa, recua a pá um pouco e prepara
    tl.to(S, { agacha: 2.6, duration: 0.42, ease: 'sine.inOut' }, 0.42)
      .to(S.pa, { y: -14, x: 0, duration: 0.42, ease: 'sine.inOut' }, 0.42);
    // 2) pegada: a pá cede com o peso, o corpo amortece, o chapéu balança
    tl.fromTo(S.pa, { a: 3 }, { a: 9, duration: 0.07, ease: 'power2.out', immediateRender: false }, T.pega)
      .to(S.pa, { a: 2.5, duration: 0.55, ease: 'elastic.out(1, 0.45)' }, T.pega + 0.07)
      .to(S, { agacha: 5.4, duration: 0.09, ease: 'power2.out' }, T.pega)
      .to(S, { agacha: 0.5, duration: 0.4, ease: 'power2.inOut' }, T.pega + 0.09)
      .fromTo(S, { chapeu: 0 }, { chapeu: -7, duration: 0.08, ease: 'power2.out', immediateRender: false }, T.pega)
      .to(S, { chapeu: 0, duration: 0.7, ease: 'elastic.out(1, 0.35)' }, T.pega + 0.08)
      .fromTo(S.pizza, { amassa: 1 }, { amassa: 0.78, duration: 0.06, immediateRender: false }, T.pega)
      .to(S.pizza, { amassa: 1, duration: 0.45, ease: 'elastic.out(1, 0.4)' }, T.pega + 0.06)
      .to(S, { sobrancelha: 1, sorriso: 0.7, duration: 0.15, ease: 'power2.out' }, T.pega)
      .to(S, { sobrancelha: 0, duration: 0.4 }, T.pega + 0.5);
    // 3) caminhada: pelve anda contínua, pés alternam e ficam plantados
    tl.to(S, { cam: 138, duration: 1.15, ease: 'sine.inOut' }, 0.98);
    tl.to(S, { x: 200, duration: 1.02, ease: 'sine.inOut' }, 1.0)
      .to(S, { inclina: 5, duration: 0.5, ease: 'sine.inOut' }, 1.0)
      .to(S, { cabeca: -2, olhar: 0.8, duration: 0.4 }, 1.05);
    passo(tl, S.pN, 1.0, 0.34, 152);
    passo(tl, S.pF, 1.36, 0.34, 190);
    passo(tl, S.pN, 1.72, 0.32, 222, 6);
    // 4) enfornar: avança o quadril, estica os braços; o cabo desliza na mão da frente e a pá entra pela boca
    tl.to(S, { x: 206, duration: 0.3, ease: 'power2.out' }, 2.0)
      .to(S.pa, { x: 18, y: -18.7, a: 1, duration: 0.42, ease: 'power2.inOut' }, 1.86)
      .to(S, { gF: 22, duration: 0.42, ease: 'power2.inOut' }, 1.86)
      .to(S, { inclina: 13, agacha: 3, duration: 0.4, ease: 'power2.inOut' }, 1.88)
      .to(S, { luz: 1, duration: 0.25, ease: 'power2.out' }, 2.06)
      .to(S, { chama: 1, duration: 0.14, ease: 'power2.out' }, 2.08)
      .to(S, { chama: 0.25, duration: 0.7, ease: 'power2.inOut' }, 2.24);
    // 5) puxada rápida: a pizza fica no forno
    tl.set(S, { dentro: 1 }, 1.8).set(S, { dentro: 0 }, 2.56);
    tl.set(S.pizza, { forno: 1 }, T.puxa)
      .to(S.pizza, { desliza: 3, duration: 0.3, ease: 'power2.out' }, T.puxa)
      .to(S.pizza, { assada: 0.9, duration: 1.1, ease: 'sine.inOut' }, T.puxa + 0.1)
      .to(S.pa, { x: -4, duration: 0.17, ease: 'power3.in' }, T.puxa)
      .to(S, { gF: 30, duration: 0.17, ease: 'power3.in' }, T.puxa);
    // 6) orgulho: endireita, pá de pé ao lado, joinha e piscadela
    tl.to(S, { inclina: -2.5, agacha: 0, duration: 0.45, ease: 'power2.out' }, 2.44)
      .to(S.pa, { keyframes: [{ x: -2, y: 4, a: -45, duration: 0.24, ease: 'power2.in' }, { x: 13, y: 51, a: -76, duration: 0.3, ease: 'power2.out' }] }, 2.44)
      .to(S, { gF: 66, duration: 0.5, ease: 'power2.inOut' }, 2.44)
      .to(S, { x: 214, duration: 0.36, ease: 'sine.inOut' }, 2.44)
      .to(S, { maoN: 1, duration: 0.3, ease: 'back.out(1.6)' }, 2.62)
      .to(S, { cabeca: -7, olhar: -0.8, duration: 0.35, ease: 'power2.out' }, 2.6)
      .to(S, { sorriso: 1, boca: 1, duration: 0.2, ease: 'power2.out' }, 2.66)
      .to(S, { piscadela: 1, duration: 0.08, yoyo: true, repeat: 1, repeatDelay: 0.22 }, 2.8)
      .to(S, { chapeu: -4, duration: 0.12, yoyo: true, repeat: 1, ease: 'sine.inOut' }, 2.72)
      .to(S, { luz: 0.35, duration: 0.8 }, 2.6);
    passo(tl, S.pF, 2.44, 0.32, 210, 5);
    tl.to({}, { duration: 0.01 }, opcoes && opcoes.fim || 3.3);

    // posição em que a pizza fica no forno = centro da pá no instante da puxada
    tl.time(T.puxa - 0.0001, true);
    const r = calculaCentroPa(cena);
    cena.forno = { x: r[0], y: r[1] };
    tl.time(0, true);
    cena.tempo = 0; cena.render();
    return { tl, T };
  }

  function calculaCentroPa(cena) {
    // recalcula a pelve exatamente como o render faz
    const S = cena.S;
    cena.render();
    const t = cena.P.pa.getAttribute('transform');
    const m = /translate\(([-\d.]+) ([-\d.]+)\)(?: rotate\(([-\d.]+)\))?/.exec(t);
    const x = +m[1], y = +m[2], a = +(m[3] || 0);
    const r = rot(R.paCentro[0], R.paCentro[1], a);
    return [x + r[0], y + r[1]];
  }

  /* ---------- pizza em bitmap (barato de animar) ---------- */
  function rasterizar(svgTexto, px) {
    return new Promise((ok, erro) => {
      const url = URL.createObjectURL(new Blob([svgTexto], { type: 'image/svg+xml' }));
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = c.height = px;
        c.getContext('2d').drawImage(img, 0, 0, px, px);
        // se o canvas não puder exportar, usa o próprio SVG (mais pesado de animar, mas funciona)
        try { const d = c.toDataURL('image/png'); URL.revokeObjectURL(url); ok(d); } catch (e) { ok(url); }
      };
      img.onerror = (e) => { URL.revokeObjectURL(url); erro(e); };
      img.src = url;
    });
  }

  window.PizzaioloCena = { criar, criarForninho, linhaDoTempo, rasterizar, ARTE, R, CHAO, CAMERA, poseInicial };
})();
