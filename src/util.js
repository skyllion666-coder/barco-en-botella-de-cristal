// Utilidades comunes: aleatorio con semilla, ruido de valor y funciones de interpolación.

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const mix = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// Generador pseudoaleatorio mulberry32 (reproducible).
export function crearAzar(semilla = 1) {
  let s = semilla >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Ruido de valor 2D periódico en x (para que las texturas encajen) con fbm.
export function crearRuido(semilla = 7, periodo = 256) {
  const azar = crearAzar(semilla);
  const N = periodo;
  const tabla = new Float32Array(N * N);
  for (let i = 0; i < tabla.length; i++) tabla[i] = azar();
  const lisa = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const v = (ix, iy) => tabla[((iy % N + N) % N) * N + ((ix % N + N) % N)];
  function ruido(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = lisa(x - ix), fy = lisa(y - iy);
    const a = v(ix, iy), b = v(ix + 1, iy), c = v(ix, iy + 1), d = v(ix + 1, iy + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  function fbm(x, y, octavas = 4, lac = 2, ganancia = 0.5) {
    let suma = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < octavas; i++) {
      suma += amp * ruido(x * f, y * f);
      norm += amp;
      amp *= ganancia;
      f *= lac;
    }
    return suma / norm;
  }
  return { ruido, fbm };
}

// Spline monótona (Fritsch-Carlson) para perfiles suaves sin rebotes.
export function crearSpline(xs, ys) {
  const n = xs.length;
  const dx = [], m = [], tg = new Array(n);
  for (let i = 0; i < n - 1; i++) {
    dx[i] = xs[i + 1] - xs[i];
    m[i] = (ys[i + 1] - ys[i]) / dx[i];
  }
  tg[0] = m[0];
  tg[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) tg[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { tg[i] = 0; tg[i + 1] = 0; continue; }
    const a = tg[i] / m[i], b = tg[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      tg[i] = t * a * m[i];
      tg[i + 1] = t * b * m[i];
    }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] > x) hi = mid; else lo = mid;
    }
    const h = dx[lo], t = (x - xs[lo]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[lo] + (t3 - 2 * t2 + t) * h * tg[lo]
      + (-2 * t3 + 3 * t2) * ys[lo + 1] + (t3 - t2) * h * tg[lo + 1];
  };
}
