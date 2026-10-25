// Botella: perfil de revolución (eje X, cuello hacia +X), geometrías exterior/interior,
// puntos de muestreo del volumen interior (para conservar el volumen de agua) y funciones de consulta.
import * as THREE from 'three';
import { crearSpline, clamp } from './util.js';

export const BASE_X = -14.5;        // cara exterior de la base
export const BASE_INT_X = -13.2;    // suelo interior
export const BOCA_X = 15.08;        // cara de la boca
export const CORCHO_INT_X = 13.8;   // extremo interior del corcho (cierra la cavidad)
export const R_CUERPO = 5.2;
const GROSOR_LADO = 0.42;

const suave5 = (t) => { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };

// Radio exterior en función de x para el tramo cuerpo-hombro-cuello-labio (monótono en x).
const labio = crearSpline(
  [13.0, 13.25, 13.5, 13.9, 14.4, 14.8, 15.0, 15.08],
  [1.62, 1.9, 2.1, 2.17, 2.15, 2.05, 1.85, 1.62],
);

export function radioExterior(x) {
  if (x < -13.15) return 0; // lo gestiona la ruta de la base
  if (x <= 3.5) return R_CUERPO - 0.04 * (x + 13.15) / 16.65;
  if (x <= 11.4) {
    const t = (x - 3.5) / 7.9;
    return 1.7 + (R_CUERPO - 0.04 - 1.7) * (1 - suave5(Math.pow(t, 0.92)));
  }
  if (x <= 13.0) return 1.7 - 0.08 * (x - 11.4) / 1.6;
  return labio(x);
}

function paso(a, b, d) { return Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / d)); }

function lineaPts(a, b, d = 0.06) {
  const n = paso(a, b, d), out = [];
  for (let i = 0; i <= n; i++) out.push([a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]);
  return out;
}
function arcoPts(cx, cr, rad, a0, a1, d = 0.05) {
  const n = Math.max(6, Math.ceil(Math.abs(a1 - a0) * rad / d)), out = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * i / n;
    out.push([cx + rad * Math.cos(a), cr + rad * Math.sin(a)]);
  }
  return out;
}
function funcionPts(f, x0, x1, d = 0.06) {
  const n = Math.ceil((x1 - x0) / d), out = [];
  for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n; out.push([x, f(x)]); }
  return out;
}
function unir(...tramos) {
  const out = [];
  for (const t of tramos) {
    for (let i = 0; i < t.length; i++) {
      const prev = out[out.length - 1];
      if (prev && Math.hypot(prev[0] - t[i][0], prev[1] - t[i][1]) < 1e-4) continue;
      out.push(t[i]);
    }
  }
  return out;
}

function rutaExterior() {
  const xc = BASE_X + 1.35, rc = R_CUERPO - 1.35;
  return unir(
    lineaPts([BASE_X, 0], [BASE_X, rc]),
    arcoPts(xc, rc, 1.35, Math.PI, Math.PI / 2),
    funcionPts(radioExterior, xc, 13.0),
    funcionPts(radioExterior, 13.0, BOCA_X - 0.02, 0.03),
    lineaPts([BOCA_X, 1.62], [BOCA_X, 1.12], 0.04),
  );
}

function radioInterior(x) {
  const ro = radioExterior(x);
  if (x <= 3.5) return ro - GROSOR_LADO;
  if (x <= 11.4) return ro - (GROSOR_LADO + 0.08 * ((x - 3.5) / 7.9));
  return x <= 13.0 ? Math.max(1.12, ro - 0.5) : 1.12;
}

function rutaInterior() {
  const rin = R_CUERPO - GROSOR_LADO - 0.04 * 0.5;
  const rci = 1.0, xc = BASE_INT_X + rci;
  return unir(
    lineaPts([BASE_INT_X, 0], [BASE_INT_X, rin - rci]),
    arcoPts(xc, rin - rci, rci, Math.PI, Math.PI / 2),
    funcionPts(radioInterior, xc, BOCA_X, 0.06),
  );
}

// Normales 2D del perfil. lado = +1 exterior (normal hacia fuera), -1 interior (hacia el eje).
function normalesPerfil(ruta, lado) {
  const n = ruta.length, out = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = ruta[Math.max(0, i - 1)], b = ruta[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dr = b[1] - a[1];
    const l = Math.hypot(dx, dr) || 1;
    out[i] = [lado * -dr / l, lado * dx / l];
  }
  return out;
}

function geometriaRevolucion(ruta, normales, grosor, segmentos) {
  const n = ruta.length, S = segmentos;
  const pos = new Float32Array(n * (S + 1) * 3);
  const nor = new Float32Array(n * (S + 1) * 3);
  const uv = new Float32Array(n * (S + 1) * 2);
  const wall = new Float32Array(n * (S + 1));
  let acum = 0;
  const idx = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) acum += Math.hypot(ruta[i][0] - ruta[i - 1][0], ruta[i][1] - ruta[i - 1][1]);
    for (let j = 0; j <= S; j++) {
      const phi = (j / S) * Math.PI * 2, c = Math.cos(phi), s = Math.sin(phi);
      const k = i * (S + 1) + j;
      pos[k * 3] = ruta[i][0]; pos[k * 3 + 1] = ruta[i][1] * c; pos[k * 3 + 2] = ruta[i][1] * s;
      nor[k * 3] = normales[i][0]; nor[k * 3 + 1] = normales[i][1] * c; nor[k * 3 + 2] = normales[i][1] * s;
      uv[k * 2] = j / S; uv[k * 2 + 1] = acum;
      wall[k] = grosor ? grosor[i] : 0;
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < S; j++) {
      const a = i * (S + 1) + j, b = a + 1, c = a + (S + 1), d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('pared', new THREE.BufferAttribute(wall, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function halton(i, base) {
  let f = 1, r = 0;
  while (i > 0) { f /= base; r += f * (i % base); i = Math.floor(i / base); }
  return r;
}

export function crearBotella({ segmentos = 128, nPuntos = 8192 } = {}) {
  const rutaExt = rutaExterior();
  const rutaInt = rutaInterior();
  const nExt = normalesPerfil(rutaExt, +1);
  const nInt = normalesPerfil(rutaInt, -1);

  // Grosor de pared de cada vértice exterior = distancia mínima al perfil interior.
  const grosor = rutaExt.map((p) => {
    let m = 1e9;
    for (const q of rutaInt) { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < m) m = d; }
    return m;
  });

  const exterior = geometriaRevolucion(rutaExt, nExt, grosor, segmentos);
  const interior = geometriaRevolucion(rutaInt, nInt, null, Math.round(segmentos * 0.75));

  // Radio interior de la cavidad (solo hasta el corcho) como tabla para consultas.
  const X0 = BASE_INT_X, X1 = CORCHO_INT_X, NT = 512;
  const tabla = new Float32Array(NT);
  const rInRaw = (x) => {
    if (x < BASE_INT_X + 1.0) {
      const dx = x - (BASE_INT_X + 1.0), rin = R_CUERPO - GROSOR_LADO - 0.02, rc = 1.0;
      return (rin - rc) + Math.sqrt(Math.max(0, rc * rc - dx * dx));
    }
    return radioInterior(x);
  };
  for (let i = 0; i < NT; i++) tabla[i] = rInRaw(X0 + (X1 - X0) * i / (NT - 1));
  const rIn = (x) => {
    const t = clamp((x - X0) / (X1 - X0), 0, 1) * (NT - 1);
    const i = Math.min(NT - 2, Math.floor(t)), f = t - i;
    return tabla[i] * (1 - f) + tabla[i + 1] * f;
  };

  // Puntos de baja discrepancia dentro del volumen (inversión de la CDF a lo largo de x).
  const cdf = new Float64Array(NT);
  let acc = 0;
  for (let i = 0; i < NT; i++) { acc += tabla[i] * tabla[i]; cdf[i] = acc; }
  const total = acc;
  const puntos = new Float32Array(nPuntos * 3);
  for (let k = 0; k < nPuntos; k++) {
    const u = halton(k + 1, 2) * total;
    let lo = 0, hi = NT - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cdf[m] > u) hi = m; else lo = m; }
    const x = X0 + (X1 - X0) * (lo + (u - cdf[lo]) / Math.max(1e-9, cdf[hi] - cdf[lo])) / (NT - 1);
    const r = rIn(x) * Math.sqrt(halton(k + 1, 3));
    const phi = halton(k + 1, 5) * Math.PI * 2;
    puntos[k * 3] = x; puntos[k * 3 + 1] = r * Math.cos(phi); puntos[k * 3 + 2] = r * Math.sin(phi);
  }

  // Textura del perfil interior (half float, filtrable en cualquier WebGL2).
  const datos = new Uint16Array(NT);
  for (let i = 0; i < NT; i++) datos[i] = THREE.DataUtils.toHalfFloat(tabla[i]);
  const texPerfil = new THREE.DataTexture(datos, NT, 1, THREE.RedFormat, THREE.HalfFloatType);
  texPerfil.minFilter = texPerfil.magFilter = THREE.LinearFilter;
  texPerfil.wrapS = texPerfil.wrapT = THREE.ClampToEdgeWrapping;
  texPerfil.needsUpdate = true;

  const volumen = Math.PI * (cdf[NT - 1]) * (X1 - X0) / (NT - 1);
  return { exterior, interior, rIn, texPerfil, puntos, volumen, X0, X1, rutaExt, rutaInt };
}
