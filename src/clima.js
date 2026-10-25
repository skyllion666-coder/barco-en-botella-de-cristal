// Motor de clima: parámetros que se mezclan suavemente entre ajustes preestablecidos,
// precipitación, niebla, relámpagos y ciclo día/noche.
import * as THREE from 'three';
import { clamp } from './util.js';
import { crearPrecipitacion } from './precipitacion.js';

export const AJUSTES = {
  despejado: { nombre: 'Despejado', icono: '☀️', mar: 0.08, viento: 0.15, luz: 1.00, tinte: [1.00, 1.00, 1.00], niebla: 0.000, lluvia: 0, nieve: 0, noche: 0, tormenta: 0, colNiebla: [0.70, 0.75, 0.80] },
  atardecer: { nombre: 'Atardecer', icono: '🌇', mar: 0.08, viento: 0.12, luz: 0.85, tinte: [1.00, 0.60, 0.36], niebla: 0.004, lluvia: 0, nieve: 0, noche: 0, tormenta: 0, colNiebla: [0.80, 0.55, 0.40] },
  lluvia: { nombre: 'Lluvia', icono: '🌧️', mar: 0.42, viento: 0.50, luz: 0.52, tinte: [0.80, 0.88, 1.00], niebla: 0.012, lluvia: 0.75, nieve: 0, noche: 0, tormenta: 0, colNiebla: [0.45, 0.52, 0.58] },
  tormenta: { nombre: 'Tormenta', icono: '⛈️', mar: 1.00, viento: 1.00, luz: 0.30, tinte: [0.70, 0.80, 1.00], niebla: 0.018, lluvia: 1.0, nieve: 0, noche: 0, tormenta: 1, colNiebla: [0.28, 0.33, 0.40] },
  nieve: { nombre: 'Nieve', icono: '❄️', mar: 0.10, viento: 0.10, luz: 0.88, tinte: [0.86, 0.93, 1.05], niebla: 0.022, lluvia: 0, nieve: 0.9, noche: 0, tormenta: 0, colNiebla: [0.75, 0.82, 0.90] },
  niebla: { nombre: 'Niebla', icono: '🌫️', mar: 0.06, viento: 0.05, luz: 0.78, tinte: [0.95, 0.97, 1.00], niebla: 0.034, lluvia: 0, nieve: 0, noche: 0, tormenta: 0, colNiebla: [0.55, 0.57, 0.58] },
  noche: { nombre: 'Noche', icono: '🌙', mar: 0.10, viento: 0.18, luz: 0.30, tinte: [0.50, 0.66, 1.10], niebla: 0.004, lluvia: 0, nieve: 0, noche: 1, tormenta: 0, colNiebla: [0.10, 0.14, 0.22] },
};

const SOL_BASE = new THREE.Vector3(-6, 9, 8);
const REL_BASE = new THREE.Vector3(8, 2, 6);

export function crearClima({ mundo, agua, barco, camara, alRayo }) {
  const prec = crearPrecipitacion({ escena: mundo.escena, agua, camara });
  const p = {
    mar: 0.08, viento: 0.15, luz: 1, tinte: new THREE.Color(1, 1, 1), niebla: 0, colNiebla: new THREE.Color(0.7, 0.75, 0.8),
    lluvia: 0, nieve: 0, noche: 0, tormenta: 0, rayo: 0,
  };
  const o = { ...p, tinte: new THREE.Color(1, 1, 1), colNiebla: new THREE.Color(0.7, 0.75, 0.8) };
  const luzFinal = new THREE.Color(1, 1, 1);
  let nombre = 'despejado';
  let proximoRayo = 3, pulsos = [];

  function fijar(n) {
    const a = AJUSTES[n];
    if (!a) return;
    nombre = n;
    o.mar = a.mar; o.viento = a.viento; o.luz = a.luz; o.niebla = a.niebla; o.lluvia = a.lluvia; o.nieve = a.nieve; o.noche = a.noche; o.tormenta = a.tormenta;
    o.tinte.setRGB(...a.tinte); o.colNiebla.setRGB(...a.colNiebla);
  }
  fijar('despejado');
  // arranque sin transición
  Object.assign(p, { mar: o.mar, viento: o.viento, luz: o.luz, niebla: o.niebla });
  p.tinte.copy(o.tinte); p.colNiebla.copy(o.colNiebla);

  const qEnv = new THREE.Quaternion(), qInv = new THREE.Quaternion(), abajo = new THREE.Vector3(0, -1, 0);

  function actualizar(dt, t, gDir, aspecto) {
    const k = 1 - Math.exp(-dt * 1.1);
    for (const c of ['mar', 'viento', 'luz', 'niebla', 'lluvia', 'nieve', 'noche', 'tormenta']) p[c] += (o[c] - p[c]) * k;
    p.tinte.lerp(o.tinte, k); p.colNiebla.lerp(o.colNiebla, k);

    // relámpagos
    if (p.tormenta > 0.6) {
      proximoRayo -= dt;
      if (proximoRayo <= 0) {
        proximoRayo = 3.5 + Math.random() * 7;
        const t0 = t;
        pulsos = [[t0, 1.0], [t0 + 0.11, 0.55], [t0 + 0.24, 0.9]];
        alRayo?.(0.15 + Math.random() * 2.0);
      }
    }
    let f = 0;
    for (const [ti, a] of pulsos) if (t >= ti) f += a * Math.exp(-(t - ti) * 13);
    pulsos = pulsos.filter(([ti]) => t - ti < 1.0);
    p.rayo = clamp(f, 0, 1.4);

    // luz efectiva y orientación del mundo respecto a la botella
    const brillo = p.luz * (1 + 5.5 * p.rayo);
    luzFinal.copy(p.tinte).multiplyScalar(brillo);
    mundo.escena.environmentIntensity = brillo;
    qEnv.setFromUnitVectors(gDir, abajo);
    mundo.escena.environmentRotation.setFromQuaternion(qEnv);
    qInv.copy(qEnv).invert();
    mundo.luces.sol.position.copy(SOL_BASE).applyQuaternion(qInv);
    mundo.luces.relleno.position.copy(REL_BASE).applyQuaternion(qInv);
    mundo.luces.sol.intensity = 2.2 * brillo * (1 - 0.55 * p.noche);
    mundo.luces.sol.color.setRGB(1, 0.945, 0.87).lerp(p.tinte, 0.55);
    mundo.luces.relleno.intensity = 0.35 * brillo;
    mundo.luces.relleno.color.setRGB(0.62, 0.72, 0.88).lerp(p.tinte, 0.3);
    const fm = mundo.fondo.uniforms;
    fm.uBrillo.value = p.luz * (1 + 0.5 * p.rayo); fm.uNoche.value = p.noche; fm.uRayo.value = p.rayo * 0.6; fm.uTinte.value.copy(p.tinte);

    mundo.efectoMesa.uniforms.uTiempo.value = t;
    mundo.efectoMesa.uniforms.uLuz.value.copy(luzFinal);
    agua.configurarMar(p.mar);
    barco.matPopa.emissiveIntensity = 1.4 * p.noche + 0.25 * (1 - p.luz) * 0.5;
    barco.farolillos(p.noche, t);

    prec.actualizar(t, { cantLluvia: p.lluvia, cantNieve: p.nieve, viento: p.viento, luz: luzFinal, aspecto });
  }

  function saltar() {
    for (const c of ['mar', 'viento', 'luz', 'niebla', 'lluvia', 'nieve', 'noche', 'tormenta']) p[c] = o[c];
    p.tinte.copy(o.tinte); p.colNiebla.copy(o.colNiebla);
  }

  return { prec, p, o, luzFinal, qEnv, qInv, saltar, fijar, actualizar, get nombre() { return nombre; }, ponerMar: (v) => { o.mar = v; }, ponerViento: (v) => { o.viento = v; } };
}
