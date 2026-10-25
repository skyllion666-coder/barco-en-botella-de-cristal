// Flotación del barco: lo coloca sobre el plano del agua, lo inclina según las olas y limita su zona a la cavidad.
import * as THREE from 'three';
import { clamp } from './util.js';
import { BASE_INT_X, CORCHO_INT_X } from './bottle.js';

export function crearFlotacion({ barco, agua, botella }) {
  const f = agua.estado;
  const YAW = -0.62;
  const est = { u: -4, v: 0, cab: 0, bal: 0, vcab: 0, vbal: 0, y: 0, u0: -4 };
  const M = new THREE.Matrix4(), Rz = new THREE.Matrix4(), Rx = new THREE.Matrix4();
  const fwd = new THREE.Vector3(), zz = new THREE.Vector3(), pos = new THREE.Vector3(), P = new THREE.Vector3();

  function dentro(u, v, h) {
    P.copy(f.e1).multiplyScalar(u).addScaledVector(f.e2, v).addScaledVector(f.n, f.d + h);
    if (P.x < BASE_INT_X + 0.2 || P.x > CORCHO_INT_X - 0.2) return false;
    return Math.hypot(P.y, P.z) < botella.rIn(P.x) - 0.15;
  }

  // Extremos utilizables del agua a lo largo de u (a v = 0): se busca desde el centro de masa del agua.
  function rango() {
    let a = est.u, b = est.u;
    if (!dentro(a, 0, 0.1)) { // buscar un punto dentro cerca
      for (let u = -15; u <= 15; u += 0.5) if (dentro(u, 0, 0.1)) { a = b = u; break; }
    }
    while (dentro(a - 0.25, 0, 0.1) && a > -17) a -= 0.25;
    while (dentro(b + 0.25, 0, 0.1) && b < 17) b += 0.25;
    return [a, b];
  }

  function actualizar(dt, t, viento) {
    const [lo, hi] = rango();
    const margen = 4.4, ancho = hi - lo;
    // posición deseada: 40% del tramo de agua (algo a la izquierda del centro, como en la foto)
    let objetivo = ancho > 2 * margen ? clamp(lo + ancho * 0.40 + Math.sin(t * 0.21) * 0.5, lo + margen, hi - margen) : (lo + hi) / 2;
    est.u += (objetivo - est.u) * Math.min(1, dt * 2.2);
    est.v += (Math.sin(t * 0.17 + 1.0) * 0.25 - est.v) * Math.min(1, dt * 1.0);

    const cy = Math.cos(YAW), sy = Math.sin(YAW);
    const muestra = (lx, lz) => agua.alturaEn(est.u + lx * cy + lz * sy, est.v + lx * sy - lz * cy, t);
    const hb = muestra(2.9, 0), hs = muestra(-2.9, 0), hp = muestra(0, -0.75), hst = muestra(0, 0.75), hc = muestra(0, 0);
    const yObj = (hb + hs + hp + hst + 2 * hc) / 6 - 0.10;
    const cabObj = Math.atan2(hb - hs, 5.8) * 0.75;
    const balObj = Math.atan2(hp - hst, 1.5) * 0.65 - 0.05 * viento;
    // resorte-amortiguador para dar inercia al cabeceo y al balanceo
    const w = 4.6, z = 0.55;
    est.vcab += ((cabObj - est.cab) * w * w - 2 * z * w * est.vcab) * dt; est.cab += est.vcab * dt;
    est.vbal += ((balObj - est.bal) * w * w - 2 * z * w * est.vbal) * dt; est.bal += est.vbal * dt;
    est.y += (yObj - est.y) * Math.min(1, dt * 8);

    // base del barco en el marco de la botella
    fwd.copy(f.e1).multiplyScalar(cy).addScaledVector(f.e2, sy);
    zz.crossVectors(fwd, f.n);
    M.makeBasis(fwd, f.n, zz);
    Rz.makeRotationZ(est.cab); Rx.makeRotationX(est.bal);
    M.multiply(Rz).multiply(Rx);
    pos.copy(f.e1).multiplyScalar(est.u).addScaledVector(f.e2, est.v).addScaledVector(f.n, f.d + est.y);
    M.setPosition(pos);
    agua.uCasco.value.set(est.u, est.v, cy, sy);
    barco.grupo.matrixAutoUpdate = false;
    barco.grupo.matrix.copy(M);
    barco.grupo.matrixWorldNeedsUpdate = true;
    return est;
  }
  return { actualizar, estado: est };
}
