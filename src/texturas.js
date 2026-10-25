// Texturas procedurales (canvas 2D): madera, corcho, tablazón del casco, cubierta, lona y ruido teselable.
import * as THREE from 'three';
import { crearRuido, crearAzar, clamp, mix, smoothstep } from './util.js';

const RUIDO = crearRuido(11, 256);

function lienzo(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  return { c, ctx, img: ctx.createImageData(w, h) };
}

function aTextura(c, { srgb = true, repetir = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repetir) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

const toByte = (v) => clamp(Math.round(v * 255), 0, 255);
const lin = (c) => Math.pow(clamp(c, 0, 1), 1 / 2.2); // lineal -> casi sRGB para componer a mano

function poner(img, i, r, g, b) {
  img.data[i] = toByte(r); img.data[i + 1] = toByte(g); img.data[i + 2] = toByte(b); img.data[i + 3] = 255;
}

// ------------------------------------------------------------------ madera
export function texMadera({ w = 512, h = 512, oscuro, claro, tablones = 0, anillos = 1, semilla = 3, rayas = 0 }) {
  const A = lienzo(w, h), B = lienzo(w, h);
  const azar = crearAzar(semilla);
  const off = Array.from({ length: Math.max(1, tablones) }, () => azar() * 50);
  const tono = Array.from({ length: Math.max(1, tablones) }, () => 0.82 + azar() * 0.36);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      const k = tablones ? Math.min(tablones - 1, Math.floor(v * tablones)) : 0;
      const vv = tablones ? (v * tablones) % 1 : v;
      const o = off[k];
      const warp = RUIDO.fbm(u * 4 + o, vv * 6 + o, 3) * 2.4;
      const ani = 0.5 + 0.5 * Math.sin((vv * 14 * anillos + warp) * Math.PI * 2);
      const fibra = RUIDO.fbm(u * 8 + o, vv * 220 + o * 3, 3);
      const nube = RUIDO.fbm(u * 2 + o, vv * 2 + o, 3);
      let t = 0.42 * Math.pow(ani, 1.4) + 0.38 * fibra + 0.2 * nube;
      t = clamp(t * tono[k], 0, 1);
      let junta = 0;
      if (tablones) junta = smoothstep(0.035, 0.0, vv) + smoothstep(0.965, 1.0, vv);
      // poros
      const poro = RUIDO.ruido(u * 64 + o, vv * 600 + o) > 0.86 ? 0.35 : 0;
      let cr = mix(oscuro[0], claro[0], t), cg = mix(oscuro[1], claro[1], t), cb = mix(oscuro[2], claro[2], t);
      const f = 1 - 0.55 * junta - 0.25 * poro;
      cr *= f; cg *= f; cb *= f;
      if (rayas) {
        const r = RUIDO.ruido(u * 5 + 40, v * 90 + 40);
        if (r > 0.9) { const m = (r - 0.9) * 8; cr = mix(cr, claro[0] * 1.2, m * rayas); cg = mix(cg, claro[1] * 1.2, m * rayas); cb = mix(cb, claro[2] * 1.2, m * rayas); }
      }
      const i = (y * w + x) * 4;
      poner(A.img, i, lin(cr), lin(cg), lin(cb));
      const bump = clamp(0.55 + 0.25 * (fibra - 0.5) + 0.1 * ani - 0.5 * junta - 0.25 * poro, 0, 1);
      poner(B.img, i, bump, bump, bump);
    }
  }
  A.ctx.putImageData(A.img, 0, 0); B.ctx.putImageData(B.img, 0, 0);
  return { mapa: aTextura(A.c), bump: aTextura(B.c, { srgb: false }) };
}

// ------------------------------------------------------------------ corcho
export function texCorcho({ w = 512, h = 256 } = {}) {
  const A = lienzo(w, h), B = lienzo(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      const base = RUIDO.fbm(u * 6, v * 3, 4);
      const grano = RUIDO.fbm(u * 60, v * 30, 3);
      const poro = smoothstep(0.58, 0.74, RUIDO.fbm(u * 38, v * 19, 2));
      const oscuro = smoothstep(0.7, 0.85, RUIDO.fbm(u * 90 + 10, v * 45 + 5, 2));
      let t = 0.45 + 0.5 * (base - 0.5) + 0.35 * (grano - 0.5);
      t = clamp(t, 0, 1);
      let r = mix(0.40, 0.66, t), g = mix(0.27, 0.46, t), b = mix(0.15, 0.27, t);
      const f = 1 - 0.55 * poro - 0.3 * oscuro;
      r *= f; g *= f; b *= f;
      const i = (y * w + x) * 4;
      poner(A.img, i, lin(r), lin(g), lin(b));
      const bm = clamp(0.62 + 0.3 * (grano - 0.5) - 0.55 * poro - 0.2 * oscuro, 0, 1);
      poner(B.img, i, bm, bm, bm);
    }
  }
  A.ctx.putImageData(A.img, 0, 0); B.ctx.putImageData(B.img, 0, 0);
  return { mapa: aTextura(A.c), bump: aTextura(B.c, { srgb: false }) };
}

// ------------------------------------------------------------------ casco
// Bandas verticales del costado pintado (v=0 línea de flotación, v=1 borda superior).
export const BANDAS_CASCO = { botamar: 0.045, franja0: 0.30, franja1: 0.64, borda: 0.9 };

export function texCascoPintura({ w = 2048, h = 512 } = {}) {
  const A = lienzo(w, h), B = lienzo(w, h);
  const azar = crearAzar(21);
  const filas = 20;
  const cortes = Array.from({ length: filas }, () => azar() * 400);
  const nPuertos = 12, u0 = 0.21, du = 0.0455;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = 1 - y / h; // y=0 arriba (borda)
      const fila = Math.floor(v * filas), vv = (v * filas) % 1;
      const corteX = ((u * 14 + cortes[fila]) % 1);
      const calafate = Math.max(smoothstep(0.06, 0.0, vv), smoothstep(0.94, 1.0, vv));
      const junta = smoothstep(0.012, 0.0, Math.min(corteX, 1 - corteX)) * (1 - calafate);
      const gastado = RUIDO.fbm(u * 24, v * 6, 4);
      const vetas = RUIDO.fbm(u * 6, v * 180, 3);
      let r, g, b;
      if (v < BANDAS_CASCO.botamar) { r = 0.30; g = 0.05; b = 0.04; }
      else if (v >= BANDAS_CASCO.franja0 && v < BANDAS_CASCO.franja1) { r = 0.80; g = 0.72; b = 0.55; }
      else if (v >= BANDAS_CASCO.borda) { r = 0.30; g = 0.15; b = 0.07; }
      else { r = 0.055; g = 0.05; b = 0.045; }
      const esMadera = v >= BANDAS_CASCO.borda;
      const k = esMadera ? 0.6 + 0.6 * vetas : 0.85 + 0.3 * (gastado - 0.5) + 0.12 * (vetas - 0.5);
      r *= k; g *= k; b *= k;
      // portas de cañón con tapa entreabierta
      const pu = (u - u0) / du, idx = Math.floor(pu), fu = pu - idx;
      let puerto = 0;
      if (idx >= 0 && idx < nPuertos && v > 0.37 && v < 0.57 && fu > 0.2 && fu < 0.78) puerto = 1;
      const marco = (idx >= 0 && idx < nPuertos && v > 0.355 && v < 0.585 && fu > 0.17 && fu < 0.81) ? 1 : 0;
      if (marco && !puerto) { r *= 0.35; g *= 0.3; b *= 0.28; }
      if (puerto) { r = 0.012; g = 0.01; b = 0.01; }
      const f = 1 - 0.5 * calafate - 0.4 * junta;
      const i = (y * w + x) * 4;
      poner(A.img, i, lin(r * f), lin(g * f), lin(b * f));
      const bm = clamp(0.6 + 0.12 * (vetas - 0.5) - 0.45 * calafate - 0.3 * junta - 0.5 * puerto, 0, 1);
      poner(B.img, i, bm, bm, bm);
    }
  }
  A.ctx.putImageData(A.img, 0, 0); B.ctx.putImageData(B.img, 0, 0);
  return { mapa: aTextura(A.c, { repetir: false }), bump: aTextura(B.c, { srgb: false, repetir: false }) };
}

export function texCobre({ w = 512, h = 256 } = {}) {
  const A = lienzo(w, h), B = lienzo(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      const gx = (u * 14) % 1, gy = (v * 6 + 0.5 * (Math.floor(u * 14) % 2)) % 1;
      const borde = Math.max(smoothstep(0.05, 0.0, gx), smoothstep(0.05, 0.0, gy));
      const placa = RUIDO.ruido(Math.floor(u * 14) * 3.1 + 5, Math.floor(v * 6 + 0.5 * (Math.floor(u * 14) % 2)) * 2.7);
      const verdin = RUIDO.fbm(u * 10, v * 8, 4);
      let r = mix(0.60, 0.16, smoothstep(0.42, 0.78, verdin));
      let g = mix(0.27, 0.38, smoothstep(0.42, 0.78, verdin));
      let b = mix(0.15, 0.30, smoothstep(0.42, 0.78, verdin));
      const k = 0.8 + 0.4 * placa;
      r *= k * (1 - 0.5 * borde); g *= k * (1 - 0.5 * borde); b *= k * (1 - 0.5 * borde);
      const i = (y * w + x) * 4;
      poner(A.img, i, lin(r), lin(g), lin(b));
      const bm = clamp(0.6 - 0.4 * borde + 0.1 * placa, 0, 1);
      poner(B.img, i, bm, bm, bm);
    }
  }
  A.ctx.putImageData(A.img, 0, 0); B.ctx.putImageData(B.img, 0, 0);
  return { mapa: aTextura(A.c), bump: aTextura(B.c, { srgb: false }) };
}

// ------------------------------------------------------------------ cubierta
export function texCubierta({ w = 1024, h = 256 } = {}) {
  const A = lienzo(w, h), B = lienzo(w, h);
  const azar = crearAzar(5);
  const filas = 14;
  const cortes = Array.from({ length: filas }, () => azar());
  const tono = Array.from({ length: filas }, () => 0.85 + azar() * 0.3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      const fila = Math.floor(v * filas), vv = (v * filas) % 1;
      const cx = (u * 5 + cortes[fila]) % 1;
      const calafate = Math.max(smoothstep(0.1, 0.0, vv), smoothstep(0.9, 1.0, vv));
      const junta = smoothstep(0.02, 0.0, Math.min(cx, 1 - cx));
      const fibra = RUIDO.fbm(u * 10 + fila * 3, vv * 30 + fila, 3);
      const gastado = RUIDO.fbm(u * 12, v * 6, 4);
      let t = (0.5 + 0.35 * (fibra - 0.5) + 0.3 * (gastado - 0.5)) * tono[fila];
      let r = mix(0.46, 0.78, t) * 0.85, g = mix(0.34, 0.62, t) * 0.85, b = mix(0.2, 0.42, t) * 0.85;
      const f = 1 - 0.7 * calafate - 0.5 * junta;
      const i = (y * w + x) * 4;
      poner(A.img, i, lin(r * f), lin(g * f), lin(b * f));
      const bm = clamp(0.62 + 0.15 * (fibra - 0.5) - 0.5 * calafate - 0.35 * junta, 0, 1);
      poner(B.img, i, bm, bm, bm);
    }
  }
  A.ctx.putImageData(A.img, 0, 0); B.ctx.putImageData(B.img, 0, 0);
  return { mapa: aTextura(A.c), bump: aTextura(B.c, { srgb: false }) };
}

// ------------------------------------------------------------------ lona de las velas
export function texLona({ w = 512, h = 512 } = {}) {
  const A = lienzo(w, h), B = lienzo(w, h);
  const azar = crearAzar(9);
  const paños = 11;
  const tonoPaño = Array.from({ length: paños }, () => 0.94 + azar() * 0.1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      const p = Math.min(paños - 1, Math.floor(u * paños)), up = (u * paños) % 1;
      const costura = smoothstep(0.045, 0.0, up) + smoothstep(0.955, 1.0, up);
      const puntada = costura > 0.5 && (y % 6) < 3 ? 0.2 : 0;
      const trama = 0.5 + 0.5 * (((x ^ y) & 1) ? 1 : -1) * 0.12 + 0.5 * RUIDO.ruido(x * 0.7, y * 0.7) * 0.2;
      const manchas = RUIDO.fbm(u * 5 + 3, v * 5, 4);
      const sucio = smoothstep(0.55, 0.85, RUIDO.fbm(u * 3 + 9, v * 7, 3)) * 0.35;
      const borde = Math.max(smoothstep(0.02, 0.0, u), smoothstep(0.98, 1.0, u), smoothstep(0.02, 0.0, v), smoothstep(0.98, 1.0, v));
      const rizo = [0.34, 0.67].reduce((m, c) => Math.max(m, smoothstep(0.007, 0.0, Math.abs(v - c))), 0);
      const punto = [0.34, 0.67].some((c) => Math.abs(v - c) < 0.012 && (x % 28) < 5) ? 1 : 0;
      let t = tonoPaño[p] * (0.88 + 0.18 * trama) * (0.96 + 0.1 * (manchas - 0.5));
      let r = 0.86 * t, g = 0.80 * t, b = 0.66 * t;
      r *= 1 - sucio * 0.6; g *= 1 - sucio * 0.7; b *= 1 - sucio;
      const m = 1 - 0.28 * costura - 0.3 * puntada - 0.25 * rizo - 0.35 * punto;
      r *= m; g *= m; b *= m;
      r = mix(r, 0.30, borde * 0.7); g = mix(g, 0.22, borde * 0.7); b = mix(b, 0.14, borde * 0.7);
      const i = (y * w + x) * 4;
      poner(A.img, i, lin(r), lin(g), lin(b));
      const bm = clamp(0.6 + 0.12 * (trama - 0.5) - 0.4 * costura - 0.2 * rizo + 0.2 * borde, 0, 1);
      poner(B.img, i, bm, bm, bm);
    }
  }
  A.ctx.putImageData(A.img, 0, 0); B.ctx.putImageData(B.img, 0, 0);
  return { mapa: aTextura(A.c, { repetir: false }), bump: aTextura(B.c, { srgb: false, repetir: false }) };
}

// ------------------------------------------------------------------ ruido teselable RGBA (agua, espuma, humo)
function ruidoTeselable(tam, ciclos, octavas, semilla) {
  const azar = crearAzar(semilla);
  const out = new Float32Array(tam * tam);
  let amp = 0.5, norm = 0;
  for (let o = 0; o < octavas; o++) {
    const c = ciclos << o;
    const tabla = new Float32Array(c * c);
    for (let i = 0; i < tabla.length; i++) tabla[i] = azar();
    const lisa = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    for (let y = 0; y < tam; y++) {
      const fy = (y / tam) * c, iy = Math.floor(fy), ty = lisa(fy - iy);
      for (let x = 0; x < tam; x++) {
        const fx = (x / tam) * c, ix = Math.floor(fx), tx = lisa(fx - ix);
        const a = tabla[(iy % c) * c + (ix % c)], b = tabla[(iy % c) * c + ((ix + 1) % c)];
        const cc = tabla[((iy + 1) % c) * c + (ix % c)], d = tabla[((iy + 1) % c) * c + ((ix + 1) % c)];
        out[y * tam + x] += amp * (a + (b - a) * tx + (cc - a) * ty + (a - b - cc + d) * tx * ty);
      }
    }
    norm += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

export function texRuido(tam = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = tam;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(tam, tam);
  const canales = [31, 47, 59, 73].map((s) => ruidoTeselable(tam, 4, 5, s));
  for (let i = 0; i < tam * tam; i++) for (let k = 0; k < 4; k++) img.data[i * 4 + k] = toByte(canales[k][i]);
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

// ------------------------------------------------------------------ espejo de popa con ventanales
export function texPopa({ w = 512, h = 256 } = {}) {
  const A = lienzo(w, h), E = lienzo(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = 1 - y / h;
      const gastado = RUIDO.fbm(u * 18, v * 8, 3);
      const vetas = RUIDO.fbm(u * 4, v * 140, 3);
      let r = 0.05, g = 0.045, b = 0.04, em = 0;
      if (v > 0.52 && v < 0.88) { r = 0.78; g = 0.70; b = 0.52; }
      if (v >= 0.9) { r = 0.30; g = 0.15; b = 0.07; }
      // cinco ventanales
      const k = u * 5.0, fu = k - Math.floor(k), idx = Math.floor(k);
      const ventana = idx >= 0 && idx < 5 && fu > 0.18 && fu < 0.82 && v > 0.58 && v < 0.82;
      const marco = idx >= 0 && idx < 5 && fu > 0.13 && fu < 0.87 && v > 0.55 && v < 0.85;
      const trav = Math.abs(fu - 0.5) < 0.025 || Math.abs(v - 0.70) < 0.012;
      if (marco && !ventana) { r = 0.30; g = 0.20; b = 0.08; }
      if (ventana) {
        if (trav) { r = 0.30; g = 0.20; b = 0.08; }
        else { r = 0.06; g = 0.09; b = 0.12; em = 0.55 + 0.3 * RUIDO.fbm(u * 30, v * 20, 2); }
      }
      const k2 = 0.85 + 0.3 * (gastado - 0.5) + 0.1 * (vetas - 0.5);
      const i = (y * w + x) * 4;
      poner(A.img, i, lin(r * k2), lin(g * k2), lin(b * k2));
      poner(E.img, i, em, em * 0.8, em * 0.5);
    }
  }
  A.ctx.putImageData(A.img, 0, 0); E.ctx.putImageData(E.img, 0, 0);
  return { mapa: aTextura(A.c, { repetir: false }), emisivo: aTextura(E.c, { repetir: false }) };
}
