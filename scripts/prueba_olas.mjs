// Mide lo irregular que es el oleaje de tormenta: registra la altura del agua en un punto durante 10 minutos
// simulados, separa cada ola (entre dos pasos por cero hacia arriba) y compara sus alturas.
// En un mar real las alturas siguen más o menos una distribución de Rayleigh: coeficiente de variación ~0,5
// y la mayor de unas cien olas es ~2 veces la media.
// Uso: node scripts/prueba_olas.mjs   (sale con código 1 si el oleaje es demasiado regular)
import { oleajeJS, parametrosMar } from '../src/agua.js';

// fórmula anterior (8 ondas casi alineadas, amplitudes en progresión fija), como referencia
function oleajeAnterior(u, v, t, { amp, lambda, drag }) {
  const DESV = [0, 0.14, -0.20, 0.38, -0.46, 0.08, 0.62, -0.68];
  const k = (Math.PI * 2) / lambda;
  let suma = 0, norma = 0, a = 1, freq = k, px = u, pz = v;
  for (let i = 0; i < 8; i++) {
    const ang = Math.PI + DESV[i], dx = Math.cos(ang), dz = Math.sin(ang), om = Math.sqrt(6 * freq);
    const x = (dx * px + dz * pz) * freq - om * t + i * 1.7, w = Math.exp(Math.sin(x) - 1), dw = w * Math.cos(x);
    suma += w * a; norma += a; px -= dx * dw * a * drag / freq; pz -= dz * dw * a * drag / freq; a *= 0.74; freq *= 1.34;
  }
  return amp * (suma / norma - 0.4658) * 1.9;
}

function medir(f, mar) {
  const dt = 0.02, alturas = [];
  let prev = f(0, 0, 0, mar), maxOla = -Infinity, minOla = Infinity, dentro = false;
  for (let t = dt; t < 600; t += dt) {
    const h = f(0, 0, t, mar);
    if (prev < 0 && h >= 0) { if (dentro) alturas.push(maxOla - minOla); dentro = true; maxOla = -Infinity; minOla = Infinity; }
    maxOla = Math.max(maxOla, h); minOla = Math.min(minOla, h); prev = h;
  }
  const media = alturas.reduce((a, b) => a + b, 0) / alturas.length;
  const cv = Math.sqrt(alturas.reduce((a, b) => a + (b - media) ** 2, 0) / alturas.length) / media;
  const orden = [...alturas].sort((a, b) => b - a);
  const tercio = orden.slice(0, Math.ceil(orden.length / 3)).reduce((a, b) => a + b, 0) / Math.ceil(orden.length / 3);
  // cuántas «series» (rachas de olas grandes): olas por encima de 1,3 × la media seguidas
  return { olas: alturas.length, media, cv, maxRel: orden[0] / media, tercioRel: tercio / media };
}

const mar = parametrosMar(1); // tormenta
const ant = medir(oleajeAnterior, mar), nue = medir(oleajeJS, mar);
const fila = (n, r) => console.log(`${n.padEnd(9)} olas ${String(r.olas).padStart(4)}  altura media ${r.media.toFixed(3)}  variación ${r.cv.toFixed(2)}  mayor/media ${r.maxRel.toFixed(2)}  tercio mayor/media ${r.tercioRel.toFixed(2)}`);
console.log('Tormenta, 10 minutos simulados en el centro de la botella:');
fila('anterior', ant); fila('nueva', nue);
const ok = nue.cv >= 0.35 && nue.maxRel >= 1.8;
console.log(ok ? 'PRUEBA SUPERADA (oleaje irregular)' : 'PRUEBA FALLIDA (oleaje demasiado regular)');
process.exit(ok ? 0 : 1);
