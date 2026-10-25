// Prepara un modelo de barco para la web:
//  - hornea las transformaciones y lo coloca en el marco de la app: proa hacia +X, Y arriba, flotación en y = 0;
//  - simplifica (con error acotado) solo las piezas pesadas, si el modelo lo necesita; velas, cabos y obenques intactos;
//  - subdivide velas y banderas y calcula sus atributos de animación:
//      _EMPUJE: dirección y cantidad de hinchado de cada vela (sigue la curvatura que ya tiene la vela);
//      _VELA:   (w, altura, tamaño): w va del borde sujeto (0) al libre (1), por donde corren las ondas de flameo;
//      _ONDEO:  dirección de ondeo de cada bandera, con longitud 0 en el asta y 1 en la punta libre;
//      _CABO:   cabos (piezas largas y finas): dirección y amplitud de vibración (0 en los extremos) y fase;
//      _SIGUE:  en los cabos enganchados a una vela, cuánto siguen su movimiento y en qué punto de ella (w);
//  - une las piezas por material (menos llamadas de dibujo), ajusta texturas y comprime con meshopt;
//  - guarda en extras la huella del casco en la flotación, la posición de los farolillos, el rumbo y el crédito.
// Uso: node scripts/preparar_barco.mjs [galeon|ottoman]   (por defecto, galeon) -> assets/barco-<modelo>.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, weld, join, quantize, reorder, simplifyPrimitive, transformMesh, getBounds } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as unirRuta, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const MODELOS = {
  // Galeón de tres palos (el que prefiere el usuario). Llega ya aligerado (84.733 caras, texturas de 256 px).
  galeon: {
    entrada: 'assets/galeon-ligero.glb', salida: 'assets/barco-galeon.glb',
    lineaAgua: 1.3,            // donde acaba el fondo rojo y empieza la madera oscura
    alturaFinal: 6.7,          // altura sobre el agua en unidades de la app (luego ESCALA_BARCO = 0.8 en flotacion.js);
                               // con esta altura el galeón, más largo, cabe tumbado con la botella de pie
    velas: ['acmat_33.003', 'acmat_26.003', 'acmat_22.003'],
    banderas: ['acmat_57', 'acmat_14.003', 'acmat_13.003'],
    asta: 'proa',              // las banderas cuelgan hacia popa desde su borde de proa
    simplificar: false, textura: null,
    rumbo: -0.30,
    credito: 'Galeón «galeone_ii» (autor y licencia por confirmar). Modificado.',
    colores: {},
  },
  // Velero mercante otomano de dos palos, de polygora (Sketchfab, CC-BY).
  ottoman: {
    entrada: 'assets/barco-original.glb', salida: 'assets/barco-ottoman.glb',
    lineaAgua: 0.03, alturaFinal: 7.0,
    velas: ['Sail'], banderas: [], asta: 'proa',
    simplificar: true, textura: 1024,
    rumbo: -0.30,
    credito: '«Ottoman Coastal Trade Tall Ship», de polygora (Sketchfab), licencia CC-BY. Modificado.',
    colores: {
      Sail: { color: [0.80, 0.76, 0.67, 1] },                                  // lona, no blanco puro
      Wood: { color: [0.84, 0.78, 0.70, 1] },                                  // pintura algo menos saturada
      Metal: { metal: 0.75, rugosidad: 0.45 },
      Material: { color: [0.72, 0.54, 0.16, 1], metal: 0.7, rugosidad: 0.38 }, // pan de oro
      'Material.002': { color: [0.72, 0.54, 0.16, 1], metal: 0.7, rugosidad: 0.38 },
    },
  },
};
const nombre = process.argv[2] || 'galeon';
const C = MODELOS[nombre];
if (!C) throw new Error('modelo desconocido: ' + nombre);

await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder, 'draco3d.decoder': await draco3d.createDecoderModule(),
});
const doc = await io.read(resolve(raiz, C.entrada));
const root = doc.getRoot();
const escena = root.listScenes()[0];
const contar = () => root.listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((a, p) => a + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0), 0);
console.log(`${nombre}: ${Math.round(contar())} triángulos, ${root.listMeshes().length} mallas`);
// los materiales con nombre de vela o bandera; las mallas que los usan se tratan aparte
const esVela = (p) => C.velas.includes(p.getMaterial()?.getName());
const esBandera = (p) => C.banderas.includes(p.getMaterial()?.getName());

// ---- 1) hornear transformaciones del mundo y colocar en el marco de la app
const bb = getBounds(escena);
const k = C.alturaFinal / (bb.max[1] - C.lineaAgua);
// rotación de +90° en Y (la proa +Z pasa a +X), escala k y flotación a y = 0  (matriz columna, estilo glTF)
const marco = [0, 0, -k, 0, 0, k, 0, 0, k, 0, 0, 0, 0, -C.lineaAgua * k, 0, 1];
const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let i = 0; i < 4; i++) o[c * 4 + r] += a[i * 4 + r] * b[c * 4 + i]; return o; };
// una malla usada por varios nodos se duplica para poder hornear cada copia
for (const nodo of root.listNodes()) {
  let malla = nodo.getMesh();
  if (!malla) continue;
  if (malla.listParents().filter((p) => p.propertyType === 'Node').length > 1) { malla = malla.clone(); nodo.setMesh(malla); }
  transformMesh(malla, mul(marco, nodo.getWorldMatrix()));
}
const identidad = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
for (const nodo of root.listNodes()) nodo.setMatrix(identidad);
for (const nodo of root.listNodes()) if (nodo.getMesh()) { for (const p of nodo.listParents()) if (p !== escena && p.removeChild) p.removeChild(nodo); escena.addChild(nodo); }
for (const nodo of root.listNodes()) if (!nodo.getMesh()) nodo.dispose();
for (const a of root.listAnimations()) a.dispose();

// ---- 2) medidas: huella del casco en la flotación (y entre -0,3 y 0,4) y farolillos en popa y proa
function vertices() {
  const out = [], v = [];
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
    if (esVela(p) || esBandera(p)) continue;
    const pos = p.getAttribute('POSITION');
    for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, v); out.push([v[0], v[1], v[2]]); }
  }
  return out;
}
// centrar la huella en el origen: la flotación gira el barco sobre él y mide las olas a su alrededor
{
  const h = vertices().filter((q) => q[1] > -0.3 && q[1] < 0.4);
  const cx = (Math.min(...h.map((q) => q[0])) + Math.max(...h.map((q) => q[0]))) / 2;
  const cz = (Math.min(...h.map((q) => q[2])) + Math.max(...h.map((q) => q[2]))) / 2;
  for (const m of root.listMeshes()) transformMesh(m, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -cx, 0, -cz, 1]);
}
const verts = vertices();
const total = getBounds(escena);
const huella = verts.filter((q) => q[1] > -0.3 && q[1] < 0.4);
const mn = [0, 1, 2].map((c) => Math.min(...huella.map((q) => q[c]))), mx = [0, 1, 2].map((c) => Math.max(...huella.map((q) => q[c])));
mn[1] = Math.min(...verts.map((q) => q[1]));
const bajo = (q) => q[1] < 0.42 * total.max[1] && Math.abs(q[2]) < 0.6;
const alturaEn = (filtro) => Math.max(...verts.filter((q) => bajo(q) && filtro(q)).map((q) => q[1]));
mx[1] = alturaEn((q) => q[0] > mn[0] + 1 && q[0] < mx[0] - 1); // regala en el centro del barco
const farolillos = [
  [mn[0] + 0.3, alturaEn((q) => q[0] < mn[0] + 0.8) + 0.25, 0],
  [mx[0] - 0.4, alturaEn((q) => q[0] > mx[0] - 1.0) + 0.15, 0],
];

// ---- 3) simplificar solo lo pesado (error relativo pequeño: no cambia la silueta)
if (C.simplificar) {
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
    const mat = p.getMaterial()?.getName() || '';
    if (esVela(p) || esBandera(p) || mat.startsWith('Rope') || p.getIndices().getCount() / 3 < 1500) continue;
    simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio: 0.22, error: 0.0012, lockBorder: false });
  }
}

// ---- 4) velas y banderas
// subdivisión por puntos medios (cada triángulo en 4), conservando normales y coordenadas de textura
function subdividir(prim) {
  const pos = prim.getAttribute('POSITION'), nor = prim.getAttribute('NORMAL'), uv = prim.getAttribute('TEXCOORD_0');
  const P = [], N = [], T = [], idx = Array.from(prim.getIndices().getArray());
  const a3 = [], a2 = [];
  for (let i = 0; i < pos.getCount(); i++) { P.push([...pos.getElement(i, a3)]); N.push(nor ? [...nor.getElement(i, a3)] : [0, 1, 0]); T.push(uv ? [...uv.getElement(i, a2)] : [0, 0]); }
  const medio = new Map();
  const mitad = (a, b) => {
    const clave = a < b ? a + ',' + b : b + ',' + a;
    if (medio.has(clave)) return medio.get(clave);
    P.push(P[a].map((x, i) => (x + P[b][i]) / 2));
    const n = N[a].map((x, i) => x + N[b][i]); const l = Math.hypot(...n) || 1; N.push(n.map((x) => x / l));
    T.push(T[a].map((x, i) => (x + T[b][i]) / 2));
    medio.set(clave, P.length - 1);
    return P.length - 1;
  };
  const nuevo = [];
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
    const ab = mitad(a, b), bc = mitad(b, c), ca = mitad(c, a);
    nuevo.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }
  pos.setArray(new Float32Array(P.flat()));
  if (nor) nor.setArray(new Float32Array(N.flat()));
  if (uv) uv.setArray(new Float32Array(T.flat()));
  prim.getIndices().setArray(new Uint32Array(nuevo));
  return { P, N, idx: nuevo };
}
// subdivide hasta que la arista media baje de 'max' unidades (como mucho 3 veces)
function subdividirHasta(prim, max) {
  let datos = null;
  for (let n = 0; n < 3; n++) {
    const pos = prim.getAttribute('POSITION'), idx = prim.getIndices().getArray(), a = [], b = [];
    let suma = 0;
    for (let t = 0; t < idx.length; t += 3) { pos.getElement(idx[t], a); pos.getElement(idx[t + 1], b); suma += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
    if (suma / (idx.length / 3) < max) break;
    datos = subdividir(prim);
  }
  if (!datos) {
    const pos = prim.getAttribute('POSITION'), nor = prim.getAttribute('NORMAL'), P = [], N = [], v = [];
    for (let i = 0; i < pos.getCount(); i++) { P.push([...pos.getElement(i, v)]); N.push(nor ? [...nor.getElement(i, v)] : [0, 1, 0]); }
    datos = { P, N, idx: Array.from(prim.getIndices().getArray()) };
  }
  return datos;
}
// piezas conectadas (una malla puede tener varias velas): se unen vértices que comparten triángulo o posición
function componentes(P, idx) {
  const padre = P.map((_, i) => i);
  const raizDe = (i) => { while (padre[i] !== i) { padre[i] = padre[padre[i]]; i = padre[i]; } return i; };
  const unir = (a, b) => { a = raizDe(a); b = raizDe(b); if (a !== b) padre[a] = b; };
  for (let t = 0; t < idx.length; t += 3) { unir(idx[t], idx[t + 1]); unir(idx[t + 1], idx[t + 2]); }
  const porPos = new Map();
  P.forEach((q, i) => { const c = q.map((x) => Math.round(x * 1000)).join(','); if (porPos.has(c)) unir(i, porPos.get(c)); else porPos.set(c, i); });
  const grupos = new Map();
  P.forEach((_, i) => { const r = raizDe(i); if (!grupos.has(r)) grupos.set(r, []); grupos.get(r).push(i); });
  return [...grupos.values()];
}
const media = (vs) => vs.reduce((s, q) => s.map((x, c) => x + q[c]), [0, 0, 0]).map((x) => x / vs.length);
const norm = (q) => { const l = Math.hypot(...q) || 1; return q.map((x) => x / l); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// ejes en el plano de una pieza: el vertical proyectado y el perpendicular
function ejesPlano(n) {
  let eV = [0, 1, 0].map((x, c) => x - n[c] * n[1]);
  eV = Math.hypot(...eV) < 0.2 ? norm(cruz(n, [1, 0, 0])) : norm(eV);
  return [norm(cruz(eV, n)), eV];
}

let nVelas = 0, nBanderas = 0;
const muestrasVela = []; // vértices de vela (posición, dirección de hinchado, w, tamaño) para enganchar los cabos
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
  if (!esVela(p) && !esBandera(p)) continue;
  const bandera = esBandera(p);
  const { P, N, idx } = subdividirHasta(p, bandera ? 0.08 : 0.3);
  const attr = new Float32Array(P.length * 3);
  const vela = bandera ? null : new Float32Array(P.length * 4);
  for (const comp of componentes(P, idx)) {
    const pts = comp.map((i) => P[i]);
    let n = norm(media(comp.map((i) => N[i])));
    if (Math.hypot(...media(comp.map((i) => N[i]))) < 0.2) n = [0, 0, 1]; // normales opuestas (doble cara): plano por defecto
    const [eU, eV] = ejesPlano(n);
    const pu = pts.map((q) => dot(q, eU)), pv = pts.map((q) => dot(q, eV));
    const [u0, u1, v0, v1] = [Math.min(...pu), Math.max(...pu), Math.min(...pv), Math.max(...pv)];
    const su = pu.map((x) => (x - u0) / Math.max(u1 - u0, 1e-6)), sv = pv.map((x) => (x - v0) / Math.max(v1 - v0, 1e-6));
    if (bandera) {
      nBanderas++;
      // el asta está en el extremo de la bandera más hacia proa (o popa) a lo largo de su eje horizontal
      const haciaProa = eU[0] >= 0 ? 1 : -1;
      comp.forEach((i, j) => {
        let t = C.asta === 'proa' ? (haciaProa > 0 ? 1 - su[j] : su[j]) : (haciaProa > 0 ? su[j] : 1 - su[j]);
        t = Math.max(0, Math.min(1, t));
        attr.set(n.map((x) => x * t), i * 3);
      });
    } else {
      nVelas++;
      // mínimo en los bordes: así el sombreador conoce la dirección de la vela también ahí
      const peso = comp.map((_, j) => Math.max(0.03, Math.sin(Math.PI * su[j]) * Math.sin(Math.PI * sv[j])));
      // sentido del hinchado: hacia donde ya está abombada la vela (centro respecto a los bordes)
      const bordes = comp.filter((_, j) => peso[j] < 0.15).map((i) => P[i]);
      const cb = bordes.length ? media(bordes) : media(pts);
      let s = 0; comp.forEach((i, j) => { s += peso[j] * dot(P[i].map((x, c) => x - cb[c]), n); });
      if (Math.abs(s) < 1e-3 * comp.length) s = Math.abs(n[0]) >= Math.abs(n[2]) ? n[0] : n[2]; // vela plana: hacia proa o a estribor
      const dir = s < 0 ? n.map((x) => -x) : n;
      const tam = Math.max(u1 - u0, v1 - v0);
      comp.forEach((i, j) => attr.set(dir.map((x) => x * peso[j] * tam), i * 3));
      // w: de dónde a dónde corren las ondas de flameo (0 = borde sujeto, 1 = borde libre).
      // Velas de cuchillo (tela de proa a popa): del grátil (proa) a la baluma (popa). Velas cuadras: de la verga hacia abajo.
      const xs = pts.map((q) => q[0]), x0 = Math.min(...xs), x1 = Math.max(...xs);
      const cuchillo = Math.abs(dir[0]) < 0.6 && x1 - x0 > 0.35 * tam;
      comp.forEach((i, j) => {
        const w = cuchillo ? (x1 - P[i][0]) / Math.max(x1 - x0, 1e-6) : 1 - sv[j];
        vela.set([w, sv[j], tam, 0], i * 4);
        muestrasVela.push({ p: P[i], dir, w, tam });
      });
    }
  }
  const buf = root.listBuffers()[0];
  p.setAttribute(bandera ? '_ONDEO' : '_EMPUJE', doc.createAccessor().setType('VEC3').setArray(attr).setBuffer(buf));
  if (vela) p.setAttribute('_VELA', doc.createAccessor().setType('VEC4').setArray(vela).setBuffer(buf));
}

// ---- 4b) cabos: piezas largas y finas (análisis de componentes principales). Vibran con el viento, se destensan
// un poco cuando para y, si tienen un extremo en una vela, siguen su movimiento (escotas, brazas, amuras).
function ejePrincipal(pts, c) {
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const q of pts) { const d = [q[0] - c[0], q[1] - c[1], q[2] - c[2]]; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) M[a][b] += d[a] * d[b]; }
  let e = [0.577, 0.577, 0.577];
  for (let it = 0; it < 30; it++) e = norm([0, 1, 2].map((a) => M[a][0] * e[0] + M[a][1] * e[1] + M[a][2] * e[2]));
  return e;
}
// rejilla para buscar el vértice de vela más cercano
const CELDA = 0.5, rejilla = new Map();
const claveR = (q) => q.map((x) => Math.floor(x / CELDA)).join(',');
for (const s of muestrasVela) { const k2 = claveR(s.p); if (!rejilla.has(k2)) rejilla.set(k2, []); rejilla.get(k2).push(s); }
function velaCercana(q, max) {
  let mejor = null, dm = max;
  const b = q.map((x) => Math.floor(x / CELDA));
  for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) for (let e = -1; e <= 1; e++) {
    for (const s of rejilla.get([b[0] + a, b[1] + c, b[2] + e].join(',')) || []) {
      const d = Math.hypot(s.p[0] - q[0], s.p[1] - q[1], s.p[2] - q[2]);
      if (d < dm) { dm = d; mejor = s; }
    }
  }
  return mejor;
}
let nCabos = 0, nEnganchados = 0;
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
  if (esVela(p) || esBandera(p) || !p.getIndices()) continue;
  const pos = p.getAttribute('POSITION'), P = [], v = [];
  for (let i = 0; i < pos.getCount(); i++) P.push([...pos.getElement(i, v)]);
  const idx = Array.from(p.getIndices().getArray());
  const cabo = new Float32Array(P.length * 4), sigue = new Float32Array(P.length * 4);
  let hay = false;
  for (const comp of componentes(P, idx)) {
    if (comp.length < 4) continue;
    const pts = comp.map((i) => P[i]), c = media(pts), e = ejePrincipal(pts, c);
    const pr = pts.map((q) => dot(q.map((x, k2) => x - c[k2]), e));
    const t0 = Math.min(...pr), t1 = Math.max(...pr), L = t1 - t0;
    let r = 0; pts.forEach((q, j) => { const d = q.map((x, k2) => x - c[k2] - e[k2] * pr[j]); r = Math.max(r, Math.hypot(...d)); });
    if (L < 0.35 || L / Math.max(r, 1e-3) < 18) continue;
    hay = true; nCabos++;
    const lado = Math.abs(e[1]) < 0.95 ? norm(cruz(e, [0, 1, 0])) : [0, 0, 1];
    const fase = Math.random() * 6.283, amp = Math.min(1, L / 3);
    // ¿algún extremo toca una vela?
    const extremo = (tt) => c.map((x, k2) => x + e[k2] * tt);
    const sA = velaCercana(extremo(t0), 0.45), sB = velaCercana(extremo(t1), 0.45);
    const enganche = sA && sB ? (Math.hypot(...sA.p.map((x, k2) => x - extremo(t0)[k2])) < Math.hypot(...sB.p.map((x, k2) => x - extremo(t1)[k2])) ? ['A', sA] : ['B', sB]) : sA ? ['A', sA] : sB ? ['B', sB] : null;
    if (enganche) nEnganchados++;
    comp.forEach((i, j) => {
      const t = (pr[j] - t0) / L, w = Math.sin(Math.PI * t) * amp;
      cabo.set([lado[0] * w, lado[1] * w, lado[2] * w, fase], i * 4);
      if (enganche) {
        const [lad, s] = enganche, f = lad === 'B' ? t : 1 - t;
        sigue.set([s.dir[0] * s.tam * f, s.dir[1] * s.tam * f, s.dir[2] * s.tam * f, s.w], i * 4);
      }
    });
  }
  if (!hay) continue;
  const buf = root.listBuffers()[0];
  p.setAttribute('_CABO', doc.createAccessor().setType('VEC4').setArray(cabo).setBuffer(buf));
  p.setAttribute('_SIGUE', doc.createAccessor().setType('VEC4').setArray(sigue).setBuffer(buf));
}

// ---- 5) materiales
for (const m of root.listMaterials()) {
  const a = C.colores[m.getName()];
  if (!a) continue;
  if (a.color) m.setBaseColorFactor(a.color);
  if (a.metal !== undefined) m.setMetallicFactor(a.metal);
  if (a.rugosidad !== undefined) m.setRoughnessFactor(a.rugosidad);
}

// ---- 6) unir por material, limpiar, texturas, cuantizar y comprimir
await doc.transform(dedup(), weld(), join({ keepNamed: false }), prune());
if (C.textura) {
  const dirTmp = mkdtempSync(unirRuta(tmpdir(), 'barco-'));
  for (const t of root.listTextures()) {
    const ent = unirRuta(dirTmp, 'ent.jpg'), sal = unirRuta(dirTmp, 'sal.jpg');
    writeFileSync(ent, t.getImage());
    const r = spawnSync('python3', ['-I', '-c', `from PIL import Image; im=Image.open('${ent}'); im.resize((${C.textura},${C.textura}), Image.LANCZOS).save('${sal}', quality=88, optimize=True)`]);
    if (r.status !== 0) throw new Error('no se pudo reducir la textura: ' + r.stderr);
    t.setImage(readFileSync(sal)).setMimeType('image/jpeg');
  }
}
for (const e of root.listExtensionsUsed()) if (e.extensionName === 'KHR_draco_mesh_compression') e.dispose();
// las posiciones quedan en coma flotante (sin transformaciones de nodo): así la app y las velas trabajan en sus unidades
await doc.transform(reorder({ encoder: MeshoptEncoder }), quantize({ pattern: /^(NORMAL|TEXCOORD_0)$/, quantizeNormal: 10 }));
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });

escena.setExtras({ modelo: nombre, casco: { min: mn, max: mx }, total: getBounds(escena), farolillos, rumbo: C.rumbo, credito: C.credito });
const salida = resolve(raiz, C.salida);
await io.write(salida, doc);
console.log(`web: ${Math.round(contar())} triángulos, ${root.listMeshes().length} mallas, ${nVelas} velas, ${nBanderas} banderas, ${nCabos} cabos (${nEnganchados} enganchados a velas), ${(statSync(salida).size / 1024).toFixed(0)} KB`);
console.log('huella del casco (x, y, z):', mn.map((x) => x.toFixed(2)).join(' '), '→', mx.map((x) => x.toFixed(2)).join(' '));
console.log('total:', JSON.stringify(getBounds(escena), (k2, x) => (typeof x === 'number' ? +x.toFixed(2) : x)));
