// Barco procedural: fragata/clíper de tres palos. Casco por secciones, cubierta, popa, mástiles, vergas,
// velas con costuras que se abomban con el viento, jarcia (obenques, flechastes, estays, brazas) y detalles.
// Sistema local: +X proa, +Y arriba, +Z estribor. Y=0 es la línea de flotación.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clamp, mix, smoothstep } from './util.js';
import { texCascoPintura, texCobre, texCubierta, texLona, texMadera, texPopa } from './texturas.js';

export const L = 8.4;           // eslora
export const B = 1.70;          // manga
const NS = 72;                  // estaciones del casco

const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ forma del casco
const fProa = (s) => (s <= 0.5 ? 1 : Math.pow(1 - Math.pow((s - 0.5) / 0.5, 2.15), 0.80));
const fPopa = (s) => (s >= 0.5 ? 1 : 0.46 + 0.54 * Math.pow(1 - Math.pow((0.5 - s) / 0.5, 2.6), 0.72));
const mediaManga = (s) => (B / 2) * fProa(s) * fPopa(s);
const arrufo = (s) => 0.58 + 0.30 * Math.pow(Math.max(0, (s - 0.55) / 0.45), 2.0) + 0.17 * Math.pow(Math.max(0, (0.34 - s) / 0.34), 2.0);
const borda = (s) => arrufo(s) + 0.20;                         // canto superior de la borda
const yCubierta = (s) => 0.50 + 0.35 * (arrufo(s) - 0.58);
const yQuilla = (s) => -0.50 + 0.12 * Math.pow(1 - s, 3) + 0.50 * Math.pow(s, 4.2);
const xEstacion = (s, lam) => (s - 0.5) * L + 0.34 * Math.pow(lam, 1.5) * sm(0.72, 1.0, s) - 0.20 * Math.pow(lam, 1.8) * sm(0.22, 0.0, s);

function seccion(s, lam) {
  const q = 0.50 + 0.55 * sm(0.55, 1.0, s) + 0.14 * (1 - sm(0.0, 0.35, s));
  const base = Math.pow(clamp(lam, 0, 1), q);
  const tumble = 1 - 0.06 * lam * lam + 0.12 * lam * lam * sm(0.7, 1.0, s);
  return base * tumble;
}

// Punto del casco en (estación s, altura absoluta y, lado ±1)
function puntoCasco(s, y, lado) {
  const yk = yQuilla(s), ys = arrufo(s);
  const lam = clamp((y - yk) / (ys - yk), 0, 1.2);
  const z = lado * mediaManga(s) * seccion(s, Math.min(lam, 1)) * (lam > 1 ? 1 - 0.035 * (lam - 1) / 0.2 : 1);
  return [xEstacion(s, Math.min(lam, 1)), y, z];
}

// Rejilla paramétrica genérica -> BufferGeometry con uv y normales calculadas.
function rejilla(ni, nj, fPos, fUV, invertir = false) {
  const pos = new Float32Array((ni + 1) * (nj + 1) * 3), uv = new Float32Array((ni + 1) * (nj + 1) * 2);
  for (let i = 0; i <= ni; i++) for (let j = 0; j <= nj; j++) {
    const k = i * (nj + 1) + j;
    const p = fPos(i / ni, j / nj);
    pos[k * 3] = p[0]; pos[k * 3 + 1] = p[1]; pos[k * 3 + 2] = p[2];
    const t = fUV(i / ni, j / nj);
    uv[k * 2] = t[0]; uv[k * 2 + 1] = t[1];
  }
  const idx = [];
  for (let i = 0; i < ni; i++) for (let j = 0; j < nj; j++) {
    const a = i * (nj + 1) + j, b = a + 1, c = a + (nj + 1), d = c + 1;
    if (invertir) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function geoCascoInferior() {
  const NL = 10;
  return rejilla(NS, NL * 2, (u, v) => {
    const s = u, lado = v < 0.5 ? -1 : 1;
    const t = v < 0.5 ? 1 - v * 2 : (v - 0.5) * 2; // 1 = flotación, 0 = quilla
    const yk = yQuilla(s);
    return puntoCasco(s, yk + (0 - yk) * t, lado);
  }, (u, v) => [u * 3, v * 1.5], false);
}

function geoCascoSuperior(lado) {
  const NL = 12;
  return rejilla(NS, NL, (u, v) => {
    const s = u, y = v * borda(s);
    return puntoCasco(s, y, lado);
  }, (u, v) => [u, v], lado > 0);
}

function geoBordaInterior(lado) {
  return rejilla(NS, 6, (u, v) => {
    const s = u, y = yCubierta(s) + v * (borda(s) - yCubierta(s));
    const p = puntoCasco(s, y, lado);
    p[2] -= lado * 0.04;
    return p;
  }, (u, v) => [u * 4, v], lado < 0);
}

function geoCubierta() {
  return rejilla(NS, 10, (u, v) => {
    const s = u, y = yCubierta(s), ancho = mediaManga(s) * seccion(s, 1) - 0.035;
    const lam = 1;
    return [xEstacion(s, lam), y + 0.012 * (1 - (2 * v - 1) ** 2), (v * 2 - 1) * ancho];
  }, (u, v) => [u * 2.2, v], true);
}

function geoCapa(lado) { // regala / cubierta superior de la borda
  return rejilla(NS, 2, (u, v) => {
    const s = u, y = borda(s) + 0.005;
    const pe = puntoCasco(s, y, lado), pi = puntoCasco(s, y, lado);
    pi[2] -= lado * 0.045;
    return [mix(pe[0], pi[0], v), y, mix(pe[2], pi[2], v)];
  }, (u, v) => [u * 6, v], lado < 0);
}

function geoEspejo() {
  // Popa plana ligeramente inclinada, cierra el casco en s = 0.
  const NLv = 12;
  return rejilla(10, NLv, (u, v) => {
    const y = -0.30 + v * (borda(0) + 0.30);
    const p = puntoCasco(0.0, y, 1), q = puntoCasco(0.0, y, -1);
    return [mix(q[0], p[0], u), y, mix(q[2], p[2], u)];
  }, (u, v) => [u, v], true);
}

// ------------------------------------------------------------------ primitivas
const _y = new THREE.Vector3(0, 1, 0);
function cilindro(a, b, r0, r1, seg = 8) {
  const p0 = new THREE.Vector3(...a), p1 = new THREE.Vector3(...b);
  const dir = p1.clone().sub(p0), len = dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, false);
  const q = new THREE.Quaternion().setFromUnitVectors(_y, dir.clone().normalize());
  g.applyQuaternion(q);
  g.translate((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2);
  return g;
}
function caja(cx, cy, cz, sx, sy, sz, ry = 0) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  if (ry) g.rotateY(ry);
  g.translate(cx, cy, cz);
  return g;
}
function esfera(cx, cy, cz, r, sx = 1, sy = 1, sz = 1) {
  const g = new THREE.SphereGeometry(r, 12, 8);
  g.scale(sx, sy, sz); g.translate(cx, cy, cz);
  return g;
}
const unir = (arr) => mergeGeometries(arr.map((g) => (g.index ? g : g)), false);

// ------------------------------------------------------------------ definición de palos y vergas
const PALOS = [
  { nombre: 'mesana', x: -L * 0.272, H: 3.55, cruz: [[0.50, 0.50, 4], [0.745, 0.36, 4], [0.905, 0.25, 4]] },
  { nombre: 'mayor', x: -L * 0.006, H: 4.55, cruz: [[0.25, 0.90, 4], [0.52, 0.76, 4], [0.745, 0.57, 4], [0.905, 0.41, 4]] },
  { nombre: 'trinquete', x: L * 0.238, H: 4.15, cruz: [[0.25, 0.80, 4], [0.52, 0.68, 4], [0.745, 0.52, 4], [0.905, 0.37, 4]] },
];
const YAW_VERGA = [0.20, 0.22, 0.24, 0.26]; // braceo de las vergas (rad), diferente por nivel

function datosPalos() {
  return PALOS.map((p) => {
    const y0 = yCubierta(clamp((p.x / L) + 0.5, 0, 1));
    const niveles = p.cruz.map(([f, w], k) => ({ y: y0 + f * p.H, mitad: w, k }));
    return { ...p, y0, niveles, yCabeza: y0 + p.H, yMarSup: y0 + p.H * 0.62, yTopGall: y0 + p.H * 0.82 };
  });
}

// ------------------------------------------------------------------ velas (rejillas animadas)
function crearVelas(palos) {
  const velas = [];
  const NU = 14, NV = 12;
  // Velas cuadras: entre cada verga y la inferior
  for (const palo of palos) {
    const n = palo.niveles.length;
    palo.niveles.forEach((nv, i) => {
      const yTop = nv.y - 0.04;
      const yBot = i === 0 ? palo.y0 + (palo.nombre === 'mesana' ? 0.7 : 0.38) : palo.niveles[i - 1].y + 0.05;
      const wTop = nv.mitad * 0.94, wBot = i === 0 ? wTop * 1.10 : palo.niveles[i - 1].mitad * 0.92;
      velas.push({ tipo: 'cuadra', x: palo.x + 0.035, yTop, yBot, wTop, wBot, yaw: (i % 2 ? -1 : 1) * 0.07 + 0.12, bulto: 0.17 + 0.035 * (n - i), fase: Math.random() * 6, NU, NV });
    });
  }
  // Foque y contrafoques: triángulos entre el bauprés y el trinquete
  const tr = palos[2], my = palos[1], mz = palos[0];
  const bx = L / 2 + 1.35;
  velas.push({ tipo: 'tri', a: [bx, 0.95, 0], b: [tr.x + 0.07, tr.yCabeza - 0.18, 0], c: [tr.x + 0.35, 0.95, 0], bulto: 0.17, fase: 1, NU: 10, NV: 10, ladoZ: 1 });
  velas.push({ tipo: 'tri', a: [bx - 0.42, 0.93, 0], b: [tr.x + 0.07, tr.yTopGall, 0], c: [tr.x + 0.72, 0.90, 0], bulto: 0.15, fase: 2, NU: 10, NV: 10, ladoZ: 1 });
  velas.push({ tipo: 'tri', a: [bx + 0.45, 1.02, 0], b: [tr.x + 0.07, tr.yCabeza - 0.05, 0], c: [tr.x + 0.12, 0.98, 0], bulto: 0.13, fase: 3, NU: 10, NV: 10, ladoZ: 1 });
  // Estayvelas entre palos
  velas.push({ tipo: 'tri', a: [tr.x - 0.12, tr.y0 + 0.55, 0], b: [my.x + 0.06, my.yMarSup, 0], c: [my.x + 0.70, tr.y0 + 0.40, 0], bulto: 0.14, fase: 4, NU: 10, NV: 10, ladoZ: 1 });
  velas.push({ tipo: 'tri', a: [my.x - 0.12, my.y0 + 0.50, 0], b: [mz.x + 0.06, mz.yTopGall, 0], c: [mz.x + 0.78, my.y0 + 0.35, 0], bulto: 0.13, fase: 5, NU: 10, NV: 10, ladoZ: 1 });
  // Cangreja (spanker): cuadrilátero entre palo, pico y botavara
  velas.push({
    tipo: 'cangreja',
    p: [[mz.x - 0.05, mz.y0 + 0.30, 0], [mz.x - 0.05, mz.y0 + 2.10, 0], [mz.x - 1.30, mz.y0 + 1.75, 0.0], [mz.x - 1.45, mz.y0 + 0.36, 0.0]],
    bulto: 0.19, fase: 6, NU: 12, NV: 12,
  });
  return velas;
}

function construirMallaVelas(velas) {
  let total = 0;
  for (const v of velas) { v.base = total; total += (v.NU + 1) * (v.NV + 1); }
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  const idx = [];
  for (const v of velas) {
    for (let i = 0; i <= v.NU; i++) for (let j = 0; j <= v.NV; j++) {
      const k = v.base + i * (v.NV + 1) + j;
      uv[k * 2] = i / v.NU; uv[k * 2 + 1] = j / v.NV;
    }
    for (let i = 0; i < v.NU; i++) for (let j = 0; j < v.NV; j++) {
      const a = v.base + i * (v.NV + 1) + j, b = a + 1, c = a + (v.NV + 1), d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2.5, 0), 7);
  return g;
}

const _p = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3();
function actualizarVelas(g, velas, t, viento) {
  const pos = g.attributes.position.array, nor = g.attributes.normal.array;
  for (const v of velas) {
    const NU = v.NU, NV = v.NV;
    const rafaga = 1 + 0.10 * Math.sin(t * 1.3 + v.fase) + 0.05 * Math.sin(t * 2.9 + v.fase * 2.1);
    const bulto = v.bulto * (0.25 + 0.85 * viento) * rafaga;
    for (let i = 0; i <= NU; i++) {
      const u = i / NU;
      for (let j = 0; j <= NV; j++) {
        const w = j / NV; // 0 = pie (abajo), 1 = puño de la verga (arriba)
        let x, y, z, nx, ny, nz;
        const k = v.base + i * (NV + 1) + j;
        const s1 = Math.sin(Math.PI * u), s2 = Math.pow(Math.sin(Math.PI * Math.min(1, w * 0.97 + 0.015)), 0.85);
        const tremolo = 0.010 * Math.sin(u * 17 + w * 9 + t * 4.1 + v.fase) * (1 - 0.5 * viento) + 0.006 * Math.sin(u * 31 - w * 13 + t * 6.3);
        if (v.tipo === 'cuadra') {
          const ancho = mix(v.wBot, v.wTop, w);
          const yy = mix(v.yBot, v.yTop, w) + 0.07 * (1 - w) * Math.sin(Math.PI * u) * (v.yTop - v.yBot) / 1.3; // gratil cóncavo del pie
          const zz = (u * 2 - 1) * ancho;
          const forma = bulto * s1 * s2 * (1.0 + 0.25 * Math.cos(Math.PI * (u - 0.5) * 0.0));
          const lx = forma + tremolo;
          const cy = Math.cos(v.yaw), sy = Math.sin(v.yaw);
          x = v.x + lx * cy + zz * sy; y = yy; z = zz * cy - lx * sy;
        } else if (v.tipo === 'tri') {
          // u recorre la baja (a-c), w sube hacia el pico b
          const base = _a.set(...v.a).lerp(_b.set(...v.c), u);
          _p.set(...v.b).lerp(base, 1 - w);
          // el pico del triángulo (w=1) converge en b
          const fx = bulto * s1 * Math.pow(Math.sin(Math.PI * Math.min(1, w * 0.95 + 0.03)), 0.9) * (1 - w * 0.55);
          x = _p.x; y = _p.y; z = fx * (v.ladoZ || 1) + tremolo;
        } else {
          // cangreja: interpolación bilineal de 4 esquinas p0..p3 (palo-bajo, palo-alto, pico, puño de escota)
          const [p0, p1, p2, p3] = v.p;
          const pA = _a.set(...p0).lerp(_b.set(...p3), u);   // borde inferior
          const pB = _n.set(...p1).lerp(_p.set(...p2), u);   // borde superior
          const px = mix(pA.x, pB.x, w), py = mix(pA.y, pB.y, w);
          const fz = bulto * s1 * Math.pow(Math.sin(Math.PI * Math.min(1, w * 0.97 + 0.015)), 0.8);
          x = px; y = py; z = fz + tremolo;
        }
        pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      }
    }
    // normales por diferencias finitas en la rejilla
    for (let i = 0; i <= NU; i++) for (let j = 0; j <= NV; j++) {
      const k = v.base + i * (NV + 1) + j;
      const ia = Math.max(0, i - 1), ib = Math.min(NU, i + 1), ja = Math.max(0, j - 1), jb = Math.min(NV, j + 1);
      const ka = v.base + ia * (NV + 1) + j, kb = v.base + ib * (NV + 1) + j;
      const kc = v.base + i * (NV + 1) + ja, kd = v.base + i * (NV + 1) + jb;
      const ux = pos[kb * 3] - pos[ka * 3], uy = pos[kb * 3 + 1] - pos[ka * 3 + 1], uz = pos[kb * 3 + 2] - pos[ka * 3 + 2];
      const wx = pos[kd * 3] - pos[kc * 3], wy = pos[kd * 3 + 1] - pos[kc * 3 + 1], wz = pos[kd * 3 + 2] - pos[kc * 3 + 2];
      let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nor[k * 3] = nx / l; nor[k * 3 + 1] = ny / l; nor[k * 3 + 2] = nz / l;
    }
  }
  g.attributes.position.needsUpdate = true;
  g.attributes.normal.needsUpdate = true;
}

// ------------------------------------------------------------------ jarcia (cabos finos)
function crearJarcia(palos) {
  const lineas = [];
  const add = (a, b, r = 0.011) => lineas.push(cilindro(a, b, r, r, 4));
  const rail = (x, lado) => { const s = clamp(x / L + 0.5, 0, 1); return [x, borda(s) - 0.02, lado * (mediaManga(s) * seccion(s, 1) + 0.075)]; };

  for (const p of palos) {
    const yTop = p.yMarSup - 0.0;
    const yCofa = p.y0 + p.H * 0.34; // posición de la cofa
    for (const lado of [-1, 1]) {
      const nAmb = p.nombre === 'mayor' ? 4 : 3;
      for (let n = 0; n < nAmb; n++) {
        const xs = p.x - 0.30 + n * 0.17;
        const r = rail(xs, lado);
        const cima = [p.x - 0.02 + n * 0.012, yCofa, lado * 0.14];
        add(r, cima, 0.012);
        // flechastes entre obenques adyacentes
        if (n < nAmb - 1) {
          const xs2 = p.x - 0.30 + (n + 1) * 0.17;
          const r2 = rail(xs2, lado), cima2 = [p.x - 0.02 + (n + 1) * 0.012, yCofa, lado * 0.14];
          const pasos = 11;
          for (let k = 1; k < pasos; k++) {
            const f = k / pasos;
            const a = [mix(r[0], cima[0], f), mix(r[1], cima[1], f), mix(r[2], cima[2], f)];
            const b = [mix(r2[0], cima2[0], f), mix(r2[1], cima2[1], f), mix(r2[2], cima2[2], f)];
            add(a, b, 0.0055);
          }
        }
      }
      // obenques de juanete y sobrejuanete (de la cofa a la cabeza)
      const topOb = [p.x, p.yMarSup, lado * 0.09];
      add([p.x, yCofa, lado * 0.16], topOb, 0.009);
      add([p.x - 0.12, yCofa, lado * 0.14], [p.x, p.yTopGall, lado * 0.06], 0.008);
      // brandales (backstays) desde la cabeza hasta la banda de popa
      const rb = rail(p.x - 1.0, lado);
      add([p.x, p.yTopGall, lado * 0.05], rb, 0.009);
      add([p.x, p.yCabeza - 0.1, lado * 0.03], rail(p.x - 1.25, lado), 0.008);
    }
  }
  // estayes entre palos
  const [mz, my, tr] = palos;
  add([my.x + 0.04, my.yMarSup, 0], [mz.x, mz.yTopGall, 0], 0.010);
  add([tr.x + 0.04, tr.yMarSup, 0], [my.x, my.yTopGall, 0], 0.010);
  add([tr.x + 0.04, tr.yCabeza - 0.1, 0], [my.x + 0.03, my.yCabeza - 0.1, 0], 0.009);
  add([my.x + 0.04, my.yCabeza - 0.1, 0], [mz.x + 0.03, mz.yCabeza - 0.1, 0], 0.009);
  // estayes de foque al bauprés
  const bx = L / 2 + 1.35;
  add([tr.x + 0.05, tr.yCabeza - 0.18, 0], [bx, 0.95, 0], 0.011);
  add([tr.x + 0.05, tr.yTopGall, 0], [bx - 0.42, 0.93, 0], 0.010);
  add([tr.x + 0.05, tr.yCabeza - 0.02, 0], [bx + 0.45, 1.02, 0], 0.009);
  // brandales de bauprés
  for (const lado of [-1, 1]) {
    add([L / 2 + 0.8, 0.85, 0], [L / 2 - 0.5, 0.45, lado * 0.52], 0.010);
    add([bx - 0.2, 0.9, 0], [L / 2 - 0.3, 0.50, lado * 0.50], 0.009);
    add([L / 2 + 0.55, 0.78, 0], [L / 2 + 0.20, -0.1, lado * 0.0], 0.010);
  }
  // brazas y amantillos de las vergas
  for (const p of palos) {
    p.niveles.forEach((nv, i) => {
      for (const lado of [-1, 1]) {
        const yaw = YAW_VERGA[i % 4] * 0.5;
        const ex = p.x + Math.sin(yaw) * nv.mitad * lado, ez = lado * nv.mitad * Math.cos(yaw);
        add([ex, nv.y, ez], [p.x - 0.03, Math.min(p.yCabeza - 0.1, nv.y + 0.42), lado * 0.04], 0.0075);
        add([ex, nv.y, ez], rail(p.x - 1.1 - i * 0.12, lado), 0.0065);
      }
    });
  }
  return unir(lineas);
}

// ------------------------------------------------------------------ palos, vergas y detalles
function crearMadera(palos) {
  const partes = [];
  for (const p of palos) {
    const yC = p.y0 - 0.05;
    // mástil y masteleros con ligera conicidad
    partes.push(cilindro([p.x, yC, 0], [p.x, p.y0 + p.H * 0.40, 0], 0.075, 0.062, 10));
    partes.push(cilindro([p.x, p.y0 + p.H * 0.30, 0], [p.x, p.yMarSup + 0.10, 0], 0.052, 0.040, 8));
    partes.push(cilindro([p.x, p.yMarSup - 0.2, 0], [p.x, p.yTopGall + 0.10, 0], 0.036, 0.028, 8));
    partes.push(cilindro([p.x, p.yTopGall - 0.2, 0], [p.x, p.yCabeza + 0.12, 0], 0.024, 0.012, 6));
    // cofa y crucetas
    const yCofa = p.y0 + p.H * 0.34;
    partes.push(caja(p.x - 0.03, yCofa, 0, 0.36, 0.028, 0.34));
    partes.push(caja(p.x + 0.0, yCofa - 0.04, 0, 0.05, 0.05, 0.30));
    partes.push(caja(p.x - 0.09, p.yMarSup, 0, 0.18, 0.02, 0.16));
    // vergas con braceo
    p.niveles.forEach((nv, i) => {
      const yaw = YAW_VERGA[i % 4] * 0.5;
      const dx = Math.sin(yaw) * nv.mitad, dz = Math.cos(yaw) * nv.mitad;
      const r = 0.032 - i * 0.004;
      partes.push(cilindro([p.x - dx, nv.y, -dz], [p.x + dx, nv.y, dz], Math.max(0.012, r * 0.55), Math.max(0.012, r * 0.55), 6));
      partes.push(cilindro([p.x - dx * 0.45, nv.y, -dz * 0.45], [p.x + dx * 0.45, nv.y, dz * 0.45], Math.max(0.014, r), Math.max(0.014, r), 6));
    });
  }
  // palo mesana: botavara y pico de la cangreja
  const mz = palos[0];
  partes.push(cilindro([mz.x - 0.05, mz.y0 + 0.30, 0], [mz.x - 1.45, mz.y0 + 0.36, 0], 0.028, 0.018, 6));
  partes.push(cilindro([mz.x - 0.05, mz.y0 + 1.55, 0], [mz.x - 1.30, mz.y0 + 1.76, 0], 0.026, 0.014, 6));
  // bauprés y botalones
  partes.push(cilindro([L / 2 - 0.55, 0.55, 0], [L / 2 + 1.05, 0.93, 0], 0.062, 0.040, 10));
  partes.push(cilindro([L / 2 + 0.85, 0.89, 0], [L / 2 + 1.65, 1.08, 0], 0.036, 0.022, 8));
  partes.push(cilindro([L / 2 + 1.5, 1.04, 0], [L / 2 + 2.05, 1.17, 0], 0.022, 0.012, 6));
  // espolón y mascarón de proa
  partes.push(esfera(L / 2 + 0.18, 0.38, 0, 0.09, 1.5, 0.8, 0.5));
  // superestructura de popa: toldilla y camarote
  const yTol = yCubierta(0.14);
  partes.push(caja(-L / 2 + 0.95, yTol + 0.13, 0, 1.55, 0.26, B * 0.78));
  partes.push(caja(-L / 2 + 0.55, yTol + 0.34, 0, 0.55, 0.18, B * 0.52));
  // chimenea de claraboya, escotillas, cabrestante, rueda del timón
  partes.push(caja(-0.85, yCubierta(0.4) + 0.05, 0, 0.55, 0.10, 0.42));
  partes.push(caja(0.75, yCubierta(0.6) + 0.05, 0, 0.50, 0.10, 0.40));
  partes.push(cilindro([L / 2 - 1.05, yCubierta(0.8), 0], [L / 2 - 1.05, yCubierta(0.8) + 0.20, 0], 0.07, 0.06, 10));
  partes.push(cilindro([-L / 2 + 0.52, yTol + 0.28, 0], [-L / 2 + 0.52, yTol + 0.28, 0.0], 0.02, 0.02, 6));
  // regalas de la toldilla (barandilla)
  for (let k = 0; k < 9; k++) {
    const x = -L / 2 + 0.25 + k * 0.17;
    for (const lado of [-1, 1]) partes.push(cilindro([x, yTol + 0.26, lado * B * 0.38], [x, yTol + 0.42, lado * B * 0.38], 0.008, 0.008, 4));
  }
  for (const lado of [-1, 1]) partes.push(cilindro([-L / 2 + 0.25, yTol + 0.42, lado * B * 0.38], [-L / 2 + 1.75, yTol + 0.42, lado * B * 0.38], 0.01, 0.01, 4));
  // pescantes y botes
  for (const lado of [-1, 1]) {
    const x = -1.45, s = x / L + 0.5;
    const z = lado * (mediaManga(s) * seccion(s, 1) - 0.02);
    partes.push(cilindro([x - 0.35, yCubierta(s) + 0.15, z], [x - 0.35, yCubierta(s) + 0.52, z * 1.02], 0.012, 0.012, 5));
    partes.push(cilindro([x + 0.35, yCubierta(s) + 0.15, z], [x + 0.35, yCubierta(s) + 0.52, z * 1.02], 0.012, 0.012, 5));
    partes.push(esfera(x, yCubierta(s) + 0.40, z * 1.03, 0.16, 3.2, 0.62, 0.9));
  }
  // canales (chainplates)
  for (const p of palos) for (const lado of [-1, 1]) {
    const s = clamp(p.x / L + 0.5, 0, 1);
    const z = lado * (mediaManga(s) * seccion(s, 1) + 0.038);
    partes.push(caja(p.x, borda(s) - 0.06, z, 0.62, 0.016, 0.075));
  }
  return unir(partes);
}

function crearMetal(palos) {
  const partes = [];
  // ancla en la serviola
  partes.push(cilindro([L / 2 - 0.35, 0.62, 0.38], [L / 2 - 0.35, 0.32, 0.38], 0.014, 0.014, 5));
  partes.push(cilindro([L / 2 - 0.45, 0.33, 0.38], [L / 2 - 0.25, 0.33, 0.38], 0.012, 0.012, 5));
  // linternas de popa
  for (const lado of [-1, 1]) partes.push(esfera(-L / 2 + 0.05, borda(0) + 0.18, lado * B * 0.24, 0.045));
  // rueda del timón
  const yTol = yCubierta(0.14);
  const rueda = new THREE.TorusGeometry(0.11, 0.012, 6, 16);
  rueda.rotateY(Math.PI / 2); rueda.translate(-L / 2 + 0.85, yTol + 0.34, 0);
  partes.push(rueda);
  // faroles en cofas
  for (const p of palos) partes.push(esfera(p.x + 0.02, p.y0 + p.H * 0.34 + 0.06, 0.17, 0.018));
  return unir(partes);
}

// ------------------------------------------------------------------ ensamblaje
export function crearBarco() {
  const palos = datosPalos();
  const grupo = new THREE.Group();

  const casco = texCascoPintura();
  const cobre = texCobre();
  const cub = texCubierta();
  const lona = texLona();
  const mad = texMadera({ w: 256, h: 256, oscuro: [0.14, 0.075, 0.035], claro: [0.45, 0.28, 0.14], anillos: 0.5, semilla: 33 });
  const popa = texPopa();

  const matCascoSup = new THREE.MeshPhysicalMaterial({ map: casco.mapa, bumpMap: casco.bump, bumpScale: 2.2, roughness: 0.52, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.4 });
  const matCobre = new THREE.MeshStandardMaterial({ map: cobre.mapa, bumpMap: cobre.bump, bumpScale: 2, roughness: 0.5, metalness: 0.55 });
  const matCubierta = new THREE.MeshStandardMaterial({ map: cub.mapa, bumpMap: cub.bump, bumpScale: 2.5, roughness: 0.82 });
  const matMadera = new THREE.MeshStandardMaterial({ map: mad.mapa, bumpMap: mad.bump, bumpScale: 1.2, roughness: 0.62, metalness: 0 });
  const matInterior = new THREE.MeshStandardMaterial({ map: mad.mapa, color: 0xb89a78, roughness: 0.7 });
  const matPopa = new THREE.MeshStandardMaterial({ map: popa.mapa, emissiveMap: popa.emisivo, emissive: new THREE.Color(1, 0.75, 0.4), emissiveIntensity: 0.0, roughness: 0.5 });
  const matJarcia = new THREE.MeshStandardMaterial({ color: 0x1a120b, roughness: 0.95 });
  const matMetal = new THREE.MeshStandardMaterial({ color: 0xb08a43, roughness: 0.32, metalness: 0.95 });
  const matVela = new THREE.MeshStandardMaterial({
    map: lona.mapa, bumpMap: lona.bump, bumpScale: 1.8, roughness: 0.93, metalness: 0, side: THREE.DoubleSide,
    emissive: new THREE.Color(0.30, 0.25, 0.18), emissiveMap: lona.mapa, emissiveIntensity: 0.12, color: 0xd9d2c4,
  });

  const add = (geo, mat, nombre) => { const m = new THREE.Mesh(geo, mat); m.name = nombre; m.frustumCulled = false; grupo.add(m); return m; };

  add(geoCascoInferior(), matCobre, 'casco-inferior');
  add(unir([geoCascoSuperior(-1), geoCascoSuperior(1)]), matCascoSup, 'casco-superior');
  add(unir([geoBordaInterior(-1), geoBordaInterior(1)]), matInterior, 'borda-interior');
  add(unir([geoCapa(-1), geoCapa(1)]), matMadera, 'regala');
  add(geoCubierta(), matCubierta, 'cubierta');
  add(geoEspejo(), matPopa, 'espejo');
  add(crearMadera(palos), matMadera, 'palos');
  add(crearMetal(palos), matMetal, 'metal');
  add(crearJarcia(palos), matJarcia, 'jarcia');

  // farolillos de noche: puntos cálidos HDR que alimentan el resplandor (bloom)
  const luces = [];
  for (const lado of [-1, 1]) luces.push(esfera(-L / 2 + 0.02, borda(0) + 0.20, lado * B * 0.26, 0.06));
  for (const p of palos) { luces.push(esfera(p.x + 0.02, p.y0 + p.H * 0.34 + 0.07, 0.17, 0.045)); luces.push(esfera(p.x + 0.02, p.y0 + p.H * 0.34 + 0.07, -0.17, 0.045)); }
  luces.push(esfera(L / 2 + 0.6, 0.62, 0, 0.05));
  const matLuz = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.62, 0.28), toneMapped: false });
  const meshLuces = add(unir(luces), matLuz, 'farolillos'); meshLuces.visible = false;

  const velas = crearVelas(palos);
  const geoVelas = construirMallaVelas(velas);
  const meshVelas = add(geoVelas, matVela, 'velas');
  actualizarVelas(geoVelas, velas, 0, 0.8);

  // Dimensiones útiles para colocar el barco en la botella.
  const info = { eslora: L, manga: B, alturaMax: palos[1].yCabeza + 0.2, calado: 0.5, proa: L / 2 + 2.05, popa: -L / 2 - 0.2 };

  return {
    grupo, info, matPopa,
    actualizar(t, viento) { actualizarVelas(geoVelas, velas, t, viento); },
    farolillos(noche, t) {
      meshLuces.visible = noche > 0.05;
      matLuz.color.setRGB(1, 0.62, 0.28).multiplyScalar(7 * noche * (0.92 + 0.08 * Math.sin(t * 7.3)));
    },
  };
}
