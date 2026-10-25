// Flotación del barco: lo coloca sobre el plano del agua, lo inclina según las olas y lo mantiene dentro de la cavidad.
// La posición y el rumbo se guardan en 3D (marco de la botella) y se reproyectan cada cuadro sobre el plano del agua,
// así un giro de la base del plano no mueve el barco. Cada cuadro se comprueba la forma completa del barco contra
// el cristal; si roza, se aparta poco a poco (posición, cabeceo y escora, como si se apoyara en el vidrio) y,
// como último recurso, se encoge lo justo.
import * as THREE from 'three';
import { clamp } from './util.js';
import { BASE_INT_X, CORCHO_INT_X } from './bottle.js';

const MARGEN = 0.10;       // holgura mínima con el cristal
const VEL_MAX = 6;         // velocidad máxima de desplazamiento sobre el agua (unidades/s)
const GIRO_MAX = 1.5;      // velocidad máxima de cambio de rumbo (rad/s)
export const ESCALA_BARCO = 0.8; // tamaño del barco respecto al modelo: así cabe tumbado con la botella de pie

// Puntos extremos de la malla del barco en su marco local: el vértice más alejado en cada una de N direcciones.
function puntosExtremos(grupo, N = 160) {
  const verts = [];
  const v = new THREE.Vector3();
  grupo.children.forEach((o) => {
    if (!o.isMesh) return;
    o.updateMatrix();
    const at = o.geometry.attributes, emp = at._empuje || at._ondeo, vela = at._vela, asta = at._asta;
    const p = new THREE.Vector3(), d = new THREE.Vector3();
    for (let i = 0; i < at.position.count; i++) {
      p.fromBufferAttribute(at.position, i);
      // velas y banderas del modelo: hasta dónde llegan con el viento (ver barcoModelo.js), a un lado y a otro:
      // velas: hinchado (hasta 0,27 × _EMPUJE, con el rebote) más flameo del borde libre (hasta ~10 % del tamaño);
      // banderas: ondeo de hasta ~18 % de su largo
      if (emp) {
        d.fromBufferAttribute(emp, i);
        const l = d.length() || 1;
        const fl = vela ? 0.10 * vela.getZ(i) * (0.15 + 0.85 * vela.getX(i) ** 2) : 0.18 * l * (asta ? asta.getW(i) : 1);
        const hin = vela ? 0.27 : 0;
        v.copy(p).addScaledVector(d, hin + fl / l).applyMatrix4(o.matrix); verts.push(v.x, v.y, v.z);
        v.copy(p).addScaledVector(d, -fl / l).applyMatrix4(o.matrix); verts.push(v.x, v.y, v.z);
        continue;
      }
      v.copy(p).applyMatrix4(o.matrix); verts.push(v.x, v.y, v.z);
    }
  });
  const elegidos = new Set();
  for (let k = 0; k < N; k++) {
    // direcciones repartidas en la esfera (espiral de Fibonacci)
    const y = 1 - (2 * k + 1) / N, r = Math.sqrt(1 - y * y), a = k * 2.39996323;
    const dx = r * Math.cos(a), dy = y, dz = r * Math.sin(a);
    let mejor = -Infinity, idx = 0;
    for (let i = 0; i < verts.length; i += 3) {
      const d = verts[i] * dx + verts[i + 1] * dy + verts[i + 2] * dz;
      if (d > mejor) { mejor = d; idx = i; }
    }
    elegidos.add(idx);
  }
  return Float32Array.from([...elegidos].flatMap((i) => [verts[i], verts[i + 1], verts[i + 2]]));
}

export function crearFlotacion({ barco, agua, botella }) {
  const f = agua.estado;
  const YAW = barco.info?.rumbo ?? -0.62; // rumbo de reposo respecto al eje de la botella
  const est = { u: -4, v: 0, cab: 0, bal: 0, vcab: 0, vbal: 0, y: 0, apoyo: 0, escora: 0, escala: 1, golpe: 0 };
  const extremos = puntosExtremos(barco.grupo);
  // medidas del casco (las del barco procedural por defecto): muestreo de olas, margen y huella de espuma
  const I = barco.info || {};
  const ESL = I.eslora ?? 8.4, MAN = I.manga ?? 1.7, PROA = I.proa ?? 6.25;
  const LX = ESL * 0.345, LZ = MAN * 0.44;
  const NE = extremos.length / 3;
  const M = new THREE.Matrix4(), Rz = new THREE.Matrix4(), Rx = new THREE.Matrix4();
  const fwd = new THREE.Vector3(), zz = new THREE.Vector3(), pos = new THREE.Vector3(), P = new THREE.Vector3();
  const p3 = new THREE.Vector3(), rumbo = new THREE.Vector3(), deseado = new THREE.Vector3(), tmp = new THREE.Vector3();
  let iniciado = false;

  function dentro(u, v, h) {
    P.copy(f.e1).multiplyScalar(u).addScaledVector(f.e2, v).addScaledVector(f.n, f.d + h);
    if (P.x < BASE_INT_X + 0.2 || P.x > CORCHO_INT_X - 0.2) return false;
    return Math.hypot(P.y, P.z) < botella.rIn(P.x) - 0.15;
  }

  // Centro de la superficie libre del agua (rejilla sobre el plano) y extremos a lo largo de e1 que pasan por él.
  const sec = { cu: 0, cv: 0, lo: 0, hi: 0, ok: false };
  function seccion() {
    let su = 0, sv = 0, n = 0;
    for (let u = -17; u <= 17; u += 0.5) for (let v = -6; v <= 6; v += 0.5) if (dentro(u, v, 0.1)) { su += u; sv += v; n++; }
    sec.ok = n > 0;
    if (!sec.ok) return sec;
    sec.cu = su / n; sec.cv = sv / n;
    let a = sec.cu, b = sec.cu;
    while (dentro(a - 0.25, sec.cv, 0.1) && a > -17) a -= 0.25;
    while (dentro(b + 0.25, sec.cv, 0.1) && b < 17) b += 0.25;
    sec.lo = a; sec.hi = b;
    return sec;
  }

  // Matriz del barco para un estado dado (en el marco de la botella).
  function componer(out, u, v, alt, c, s, cab, bal, esc) {
    fwd.copy(f.e1).multiplyScalar(c).addScaledVector(f.e2, s);
    zz.crossVectors(fwd, f.n);
    out.makeBasis(fwd, f.n, zz);
    Rz.makeRotationZ(cab); Rx.makeRotationX(bal);
    out.multiply(Rz).multiply(Rx);
    const e = esc * ESCALA_BARCO;
    out.scale(tmp.set(e, e, e));
    pos.copy(f.e1).multiplyScalar(u).addScaledVector(f.e2, v).addScaledVector(f.n, f.d + alt);
    out.setPosition(pos);
    return out;
  }

  // Cuánto atraviesa el cristal el punto extremo peor situado (> 0 = se sale).
  function exceso(m) {
    const e = m.elements;
    let peor = -Infinity;
    for (let i = 0; i < NE; i++) {
      const x = extremos[i * 3], y = extremos[i * 3 + 1], z = extremos[i * 3 + 2];
      const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
      const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
      const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
      const pen = Math.max(Math.hypot(wy, wz) - botella.rIn(wx) + MARGEN, BASE_INT_X + MARGEN - wx, wx - CORCHO_INT_X + MARGEN);
      if (pen > peor) peor = pen;
    }
    return peor;
  }

  const Mp = new THREE.Matrix4();
  const prueba = (s) => exceso(componer(Mp, s.u, s.v, est.y, s.c, s.s, est.cab + s.apoyo, est.bal + s.escora, s.esc));

  // Aparta el barco del cristal partiendo del estado actual, con cambios pequeños por cuadro (sin saltos):
  // descenso por el gradiente del exceso en posición (u, v), cabeceo de apoyo y escora. Si con eso no basta
  // en este cuadro, se encoge lo justo para no atravesar el cristal (y vuelve a crecer cuando hay sitio).
  const PARAMS = ['u', 'v', 'apoyo', 'escora'];
  function encajar(s, dt) {
    let e = prueba(s);
    // presupuesto total de cambio en este cuadro (cada iteración gasta como mucho la mitad)
    const lim = { u: 8 * dt, v: 8 * dt, apoyo: 2 * dt, escora: 2 * dt };
    const s0 = { ...s };
    for (let it = 0; it < 6 && e > 0; it++) {
      const d = {};
      let mx = 0;
      for (const k of PARAMS) {
        const h = k === 'u' || k === 'v' ? 0.04 : 0.015;
        const g = (prueba({ ...s, [k]: s[k] + h }) - e) / h;
        d[k] = -g * lim[k] * lim[k];
        mx = Math.max(mx, Math.abs(d[k]) / lim[k]);
      }
      if (mx < 1e-9) break;
      let mejor = null;
      for (const paso of [1, 0.5, 0.25]) {
        const c = { ...s };
        for (const k of PARAMS) c[k] = clamp(s[k] + d[k] / mx * paso * 0.5, s0[k] - lim[k], s0[k] + lim[k]);
        c.apoyo = clamp(c.apoyo, -1.2, 1.2); c.escora = clamp(c.escora, -0.9, 0.9);
        const ec = prueba(c);
        if (ec < e) { mejor = c; e = ec; break; }
      }
      if (!mejor) break;
      s = mejor;
    }
    if (e > 0) {
      let lo = 0, hi = s.esc;
      for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; if (prueba({ ...s, esc: m }) <= 0) lo = m; else hi = m; }
      s.esc = lo;
    }
    return s;
  }

  function actualizar(dt, t, viento) {
    // reproyectar el estado 3D sobre el plano actual
    if (!iniciado) {
      p3.copy(f.e1).multiplyScalar(est.u).addScaledVector(f.e2, est.v);
      rumbo.copy(f.e1).multiplyScalar(Math.cos(YAW)).addScaledVector(f.e2, Math.sin(YAW));
      iniciado = true;
    }
    let u = p3.dot(f.e1), v = p3.dot(f.e2);
    rumbo.addScaledVector(f.n, -rumbo.dot(f.n));
    if (rumbo.lengthSq() < 0.05) rumbo.copy(f.e1);
    rumbo.normalize();

    // posición deseada: 40% del tramo de agua (algo a la izquierda del centro, como en la foto)
    seccion();
    if (sec.ok) {
      const margen = 0.7 * PROA * ESCALA_BARCO, ancho = sec.hi - sec.lo;
      const objU = ancho > 2 * margen ? clamp(sec.lo + ancho * 0.40 + Math.sin(t * 0.21) * 0.5, sec.lo + margen, sec.hi - margen) : (sec.lo + sec.hi) / 2;
      const objV = sec.cv + Math.sin(t * 0.17 + 1.0) * 0.25;
      let du = (objU - u) * Math.min(1, dt * 2.2), dv = (objV - v) * Math.min(1, dt * 1.6);
      const paso = Math.hypot(du, dv), lim = VEL_MAX * dt;
      if (paso > lim) { du *= lim / paso; dv *= lim / paso; }
      u += du; v += dv;
    }

    // rumbo: gira con velocidad limitada hacia el de reposo (YAW respecto al eje de la botella)
    deseado.copy(f.e1).multiplyScalar(Math.cos(YAW)).addScaledVector(f.e2, Math.sin(YAW));
    const ang = Math.atan2(tmp.crossVectors(rumbo, deseado).dot(f.n), rumbo.dot(deseado));
    const giro = Math.sign(ang) * Math.min(Math.abs(ang), GIRO_MAX * dt);
    tmp.crossVectors(f.n, rumbo);
    rumbo.multiplyScalar(Math.cos(giro)).addScaledVector(tmp, Math.sin(giro)).normalize();
    const cy = rumbo.dot(f.e1), sy = rumbo.dot(f.e2);

    // olas bajo el casco
    const K = ESCALA_BARCO;
    const muestra = (lx, lz) => agua.alturaEn(u + (lx * cy + lz * sy) * K, v + (lx * sy - lz * cy) * K, t);
    const hb = muestra(LX, 0), hs = muestra(-LX, 0), hp = muestra(0, -LZ), hst = muestra(0, LZ), hc = muestra(0, 0);
    const yObj = (hb + hs + hp + hst + 2 * hc) / 6 - 0.10 * K;
    // con olas grandes y empinadas (series, ola grande) el barco cabecea y escora bastante más
    const pend = Math.max(Math.abs(hb - hs) / (2 * LX * K), Math.abs(hp - hst) / (2 * LZ * K));
    const fuerte = 1 + 0.7 * clamp((pend - 0.18) / 0.35, 0, 1);
    const cabObj = Math.atan2(hb - hs, 2 * LX * K) * 0.75 * fuerte;
    const balObj = Math.atan2(hp - hst, 2 * LZ * K) * 0.65 * fuerte - 0.075 * Math.min(viento, 1.5); // escora con el viento (y sus rachas)
    // la ola empuja: el barco se desliza un poco por su cara (y luego vuelve a su sitio)
    u -= clamp((hb - hs) / (2 * LX * K), -0.6, 0.6) * 1.3 * dt * fuerte;
    // resorte-amortiguador para dar inercia al cabeceo y al balanceo
    const w = 4.6, z = 0.55;
    est.vcab += ((cabObj - est.cab) * w * w - 2 * z * w * est.vcab) * dt; est.cab += est.vcab * dt;
    est.vbal += ((balObj - est.bal) * w * w - 2 * z * w * est.vbal) * dt; est.bal += est.vbal * dt;
    est.y += (yObj - est.y) * Math.min(1, dt * 8);
    // sacudida del casco (0..1): con ella el agua cae por la borda (salpicaduras.js)
    est.golpe = clamp(Math.max(Math.abs(est.vcab), Math.abs(est.vbal)) * 1.6 + (pend - 0.3), 0, 1);

    // apoyo, escora y escala vuelven poco a poco a reposo; después se aparta del cristal si hace falta
    const hacia = (a, b, r) => a + clamp(b - a, -r * dt, r * dt);
    const fin = encajar({
      u, v, c: cy, s: sy,
      apoyo: hacia(est.apoyo, 0, 0.5), escora: hacia(est.escora, 0, 0.5), esc: hacia(est.escala, 1, 0.5),
    }, dt);
    est.u = fin.u; est.v = fin.v; est.apoyo = fin.apoyo; est.escora = fin.escora; est.escala = fin.esc;
    p3.copy(f.e1).multiplyScalar(est.u).addScaledVector(f.e2, est.v);

    componer(M, est.u, est.v, est.y, cy, sy, est.cab + est.apoyo, est.bal + est.escora, Math.max(est.escala, 1e-3));
    agua.uCasco.value.set(est.u, est.v, cy, sy);
    const e = ESCALA_BARCO * Math.max(est.escala, 0.05);
    agua.uEscCasco.value.set(e * ESL / 8.4, e * MAN / 1.7); // la huella de espuma está hecha para el casco procedural
    barco.grupo.visible = est.escala > 0.05;
    barco.grupo.matrixAutoUpdate = false;
    barco.grupo.matrix.copy(M);
    barco.grupo.matrixWorldNeedsUpdate = true;
    return est;
  }
  return { actualizar, estado: est, exceso: () => exceso(M) };
}
