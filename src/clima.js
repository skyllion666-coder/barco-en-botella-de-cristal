// Motor de clima: parámetros que se mezclan suavemente entre ajustes preestablecidos, precipitación, niebla,
// atmósfera interior, relámpagos y día/noche. Todo el clima vive DENTRO de la botella: la habitación (fondo, mesa,
// soporte) tiene luz fija y solo recibe un leve destello de los rayos a través del cristal.
import * as THREE from 'three';
import { clamp } from './util.js';
import { crearPrecipitacion } from './precipitacion.js';
import { crearCielo } from './cielo.js';

export const AJUSTES = {
  despejado: { aire: 0.0, nombre: 'Despejado', icono: '☀️', mar: 0.08, viento: 0.15, luz: 1.00, tinte: [1.00, 1.00, 1.00], niebla: 0.000, lluvia: 0, nieve: 0, noche: 0, tormenta: 0, colNiebla: [0.70, 0.75, 0.80] },
  atardecer: { aire: 0.018, nombre: 'Atardecer', icono: '🌇', mar: 0.08, viento: 0.12, luz: 0.85, tinte: [1.00, 0.60, 0.36], niebla: 0.004, lluvia: 0, nieve: 0, noche: 0, tormenta: 0, colNiebla: [0.80, 0.55, 0.40] },
  lluvia: { aire: 0.065, nombre: 'Lluvia', icono: '🌧️', mar: 0.42, viento: 0.50, luz: 0.52, tinte: [0.80, 0.88, 1.00], niebla: 0.012, lluvia: 0.75, nieve: 0, noche: 0, tormenta: 0, colNiebla: [0.45, 0.52, 0.58] },
  tormenta: { aire: 0.13, nombre: 'Tormenta', icono: '⛈️', mar: 1.00, viento: 1.00, luz: 0.30, tinte: [0.70, 0.80, 1.00], niebla: 0.018, lluvia: 1.0, nieve: 0, noche: 0, tormenta: 1, colNiebla: [0.28, 0.33, 0.40] },
  nieve: { aire: 0.04, nombre: 'Nieve', icono: '❄️', mar: 0.10, viento: 0.10, luz: 0.88, tinte: [0.86, 0.93, 1.05], niebla: 0.022, lluvia: 0, nieve: 0.9, noche: 0, tormenta: 0, colNiebla: [0.75, 0.82, 0.90] },
  niebla: { aire: 0.0, nombre: 'Niebla', icono: '🌫️', mar: 0.06, viento: 0.05, luz: 0.78, tinte: [0.95, 0.97, 1.00], niebla: 0.034, lluvia: 0, nieve: 0, noche: 0, tormenta: 0, colNiebla: [0.55, 0.57, 0.58] },
  noche: { aire: 0.075, nombre: 'Noche', icono: '🌙', mar: 0.10, viento: 0.18, luz: 0.30, tinte: [0.50, 0.66, 1.10], niebla: 0.004, lluvia: 0, nieve: 0, noche: 1, tormenta: 0, colNiebla: [0.10, 0.14, 0.22] },
};

const SOL_BASE = new THREE.Vector3(-6, 9, 8);
const REL_BASE = new THREE.Vector3(8, 2, 6);
const CANALES = ['mar', 'viento', 'luz', 'niebla', 'lluvia', 'nieve', 'noche', 'tormenta', 'aire'];

// Día y noche según la hora local: 'noche' 0..1 (de 20 a 22 h oscurece, de 6 a 8 h amanece) y 'dorado' 0..1
// (luz cálida hacia las 7 y las 19:30).
export function factoresHora(h) {
  const s = (x) => x * x * (3 - 2 * x);
  const noche = h < 6 ? 1 : h < 8 ? 1 - s((h - 6) / 2) : h < 20 ? 0 : h < 22 ? s((h - 20) / 2) : 1;
  const dorado = Math.max(0, 1 - Math.abs(h - 19.5) / 1.4, 1 - Math.abs(h - 7.2) / 1.1);
  return { noche, dorado };
}
const TINTE_NOCHE = new THREE.Color(...AJUSTES.noche.tinte), NIEBLA_NOCHE = new THREE.Color(...AJUSTES.noche.colNiebla);
const TINTE_DORADO = new THREE.Color(...AJUSTES.atardecer.tinte), NIEBLA_DORADO = new THREE.Color(...AJUSTES.atardecer.colNiebla);

export function crearClima({ mundo, agua, barco, botella, camara, alRayo }) {
  const int = mundo.interior;
  const prec = crearPrecipitacion({ escena: int.escena, agua, camara });
  const cielo = crearCielo({ escena: int.escena, agua, botella, luzRayo: int.luces.rayo });
  const p = {
    mar: 0.08, viento: 0.15, luz: 1, tinte: new THREE.Color(1, 1, 1), niebla: 0, colNiebla: new THREE.Color(0.7, 0.75, 0.8),
    lluvia: 0, nieve: 0, noche: 0, tormenta: 0, aire: 0, rayo: 0,
  };
  const o = { ...p, tinte: new THREE.Color(1, 1, 1), colNiebla: new THREE.Color(0.7, 0.75, 0.8) };
  const luzFinal = new THREE.Color(1, 1, 1);   // luz del interior de la botella (agua, barco, lluvia)
  const colAire = new THREE.Color();           // color de la atmósfera interior (nubes de tormenta, noche...)
  let nombre = 'despejado';
  let proximoRayo = 3, pulsos = [];
  let rachas = null; // viento con rachas (viento.js), si se conecta
  // arcoíris: aparece cuando escampa después de llover (durante ~30 s), si hay luz y el cielo queda claro
  const arco = { ultimaLluvia: -1e9, inicio: -1e9, mostrado: true };
  // objetivo efectivo: el ajuste elegido, modificado por la hora real si está activada
  const e = { ...p, tinte: new THREE.Color(1, 1, 1), colNiebla: new THREE.Color(0.7, 0.75, 0.8) };
  const hora = { real: false, fija: null };

  function fijar(n) {
    const a = AJUSTES[n];
    if (!a) return;
    nombre = n;
    for (const c of CANALES) o[c] = a[c];
    o.tinte.setRGB(...a.tinte); o.colNiebla.setRGB(...a.colNiebla);
  }
  fijar('despejado');
  // arranque sin transición
  for (const c of CANALES) p[c] = o[c];
  p.tinte.copy(o.tinte); p.colNiebla.copy(o.colNiebla);

  const qEnv = new THREE.Quaternion(), qInv = new THREE.Quaternion(), abajo = new THREE.Vector3(0, -1, 0);

  function actualizar(dt, t, gDir, aspecto, altoPx = 740) {
    objetivoEfectivo();
    const k = 1 - Math.exp(-dt * 1.1);
    for (const c of CANALES) p[c] += (e[c] - p[c]) * k;
    p.tinte.lerp(e.tinte, k); p.colNiebla.lerp(e.colNiebla, k);

    // relámpagos: el rayo se ve dentro de la botella y el trueno llega con retraso según la distancia
    if (p.tormenta > 0.6) {
      proximoRayo -= dt;
      if (proximoRayo <= 0) {
        proximoRayo = 3.5 + Math.random() * 7;
        pulsos = [[t, 1.0], [t + 0.11, 0.55], [t + 0.24, 0.9]];
        cielo.disparar();
        alRayo?.(0.15 + Math.random() * 2.0);
      }
    }
    let f = 0;
    for (const [ti, a] of pulsos) if (t >= ti) f += a * Math.exp(-(t - ti) * 13);
    pulsos = pulsos.filter(([ti]) => t - ti < 1.0);
    p.rayo = clamp(f, 0, 1.4);

    // orientación del mundo respecto a la botella (las dos escenas comparten entorno y dirección del sol)
    qEnv.setFromUnitVectors(gDir, abajo);
    qInv.copy(qEnv).invert();
    for (const esc of [mundo.escena, int.escena]) esc.environmentRotation.setFromQuaternion(qEnv);
    for (const luces of [mundo.luces, int.luces]) {
      luces.sol.position.copy(SOL_BASE).applyQuaternion(qInv);
      luces.relleno.position.copy(REL_BASE).applyQuaternion(qInv);
    }

    // habitación: luz fija
    mundo.escena.environmentIntensity = 1;
    mundo.luces.sol.intensity = 2.2; mundo.luces.relleno.intensity = 0.35;
    mundo.efectoMesa.uniforms.uTiempo.value = t;
    mundo.efectoMesa.uniforms.uLuz.value.setScalar(1 + 0.6 * p.rayo); // leve destello del rayo sobre la mesa

    // interior de la botella: luz del clima
    const brillo = p.luz * (1 + 2.5 * p.rayo);
    luzFinal.copy(p.tinte).multiplyScalar(brillo);
    int.escena.environmentIntensity = brillo;
    int.luces.sol.intensity = 2.2 * brillo * (1 - 0.55 * p.noche);
    int.luces.sol.color.setRGB(1, 0.945, 0.87).lerp(p.tinte, 0.55);
    int.luces.relleno.intensity = 0.35 * brillo;
    int.luces.relleno.color.setRGB(0.62, 0.72, 0.88).lerp(p.tinte, 0.3);
    // oscura para que la tormenta y la noche se lean contra la habitación iluminada; el rayo la enciende
    colAire.copy(p.colNiebla).multiplyScalar((0.35 + 0.65 * p.luz) * 0.32).multiply(p.tinte);
    colAire.r += 0.30 * p.rayo; colAire.g += 0.34 * p.rayo; colAire.b += 0.45 * p.rayo;

    agua.configurarMar(p.mar);
    barco.matPopa.emissiveIntensity = 1.4 * p.noche + 0.25 * (1 - p.luz) * 0.5;
    barco.farolillos(p.noche, t);

    prec.actualizar(t, { cantLluvia: p.lluvia, cantNieve: p.nieve, viento: rachas ? Math.min(rachas.total, 1.4) : p.viento, luz: luzFinal, aspecto });
    if (p.lluvia > 0.45) { arco.ultimaLluvia = t; arco.mostrado = false; }
    // solo si escampa a cielo claro: con nieve o niebla no hay sol directo ni gotas de lluvia, no hay arcoíris
    const despejando = p.nieve < 0.05 && p.niebla < 0.008;
    if (!arco.mostrado && p.lluvia < 0.12 && t - arco.ultimaLluvia < 25 && despejando) { arco.inicio = t; arco.mostrado = true; }
    const ta = t - arco.inicio, DUR = 32;
    const arcoiris = ta < 0 || ta > DUR ? 0 : clamp(ta / 4, 0, 1) * clamp((DUR - ta) / 8, 0, 1)
      * clamp((p.luz - 0.45) / 0.35, 0, 1) * (1 - p.noche) * clamp(1 - p.lluvia * 4, 0, 1)
      * clamp(1 - p.nieve * 10, 0, 1) * clamp(1 - p.niebla * 60, 0, 1); // si llega nieve o niebla, se apaga
    cielo.actualizar(t, { rayo: p.rayo, noche: p.noche, cubierto: clamp(p.lluvia + p.nieve + p.niebla * 20, 0, 1), altoPx, arcoiris });
  }

  // fuerza un relámpago en el instante t (capturas reproducibles con ?rayo=1)
  function forzarRayo(t) { pulsos = [[t, 1.0]]; cielo.disparar(); }
  // fuerza el arcoíris (capturas con ?arcoiris=1): como si acabara de escampar
  function forzarArcoiris(t) { arco.inicio = t; arco.mostrado = true; }

  function objetivoEfectivo() {
    for (const c of CANALES) e[c] = o[c];
    e.tinte.copy(o.tinte); e.colNiebla.copy(o.colNiebla);
    if (!hora.real && hora.fija === null) return;
    const ahora = new Date();
    const h = hora.fija ?? ahora.getHours() + ahora.getMinutes() / 60;
    const { noche, dorado } = factoresHora(h);
    const n = noche * (1 - o.noche); // si ya es el ajuste «Noche», no se suma
    e.noche = Math.max(o.noche, noche);
    e.luz = o.luz * (1 - 0.68 * n) * (1 - 0.12 * dorado * (1 - noche));
    e.aire = o.aire + 0.07 * n + 0.03 * dorado * (1 - noche);
    e.tinte.lerp(TINTE_DORADO, dorado * 0.85 * (1 - o.tormenta)).lerp(TINTE_NOCHE, n);
    e.colNiebla.lerp(NIEBLA_DORADO, dorado * 0.9 * (1 - o.tormenta)).lerp(NIEBLA_NOCHE, n);
  }

  function saltar() {
    objetivoEfectivo();
    for (const c of CANALES) p[c] = e[c];
    p.tinte.copy(e.tinte); p.colNiebla.copy(e.colNiebla);
  }

  return {
    prec, cielo, p, o, luzFinal, colAire, qEnv, qInv, saltar, fijar, actualizar, forzarRayo, forzarArcoiris,
    ponerBarco: (b) => { barco = b; }, conectarViento: (v) => { rachas = v; },
    // de noche el agua agitada brilla (menos con lluvia, que la apaga)
    get bioluminiscencia() { return clamp((p.noche - 0.3) / 0.6, 0, 1) * (1 - 0.5 * p.lluvia); },
    get nombre() { return nombre; }, ponerMar: (v) => { o.mar = v; }, ponerViento: (v) => { o.viento = v; },
    // día y noche según la hora local (fija: hora concreta para pruebas, p. ej. 21.5)
    get horaReal() { return hora.real; }, set horaReal(v) { hora.real = !!v; }, fijarHora: (h) => { hora.fija = h; },
    // nubes que se mueven en la atmósfera interior (más con lluvia y tormenta)
    get nubes() { return clamp(p.lluvia * 0.9 + p.nieve * 0.4 + p.noche * 0.2, 0, 1); },
  };
}
