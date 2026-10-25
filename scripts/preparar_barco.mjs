// Prepara el modelo del barco para la web a partir del original (assets/barco-original.glb, CC-BY, polygora):
//  - hornea las transformaciones y lo coloca en el marco de la app: proa hacia +X, Y arriba, flotación en y = 0;
//  - simplifica (con error acotado) solo las piezas pesadas; velas, cabos y obenques quedan intactos;
//  - subdivide las velas y calcula el atributo _EMPUJE (dirección y cantidad de hinchado con el viento);
//  - une las piezas por material (pocas llamadas de dibujo), reduce la textura a 1024 y comprime con meshopt;
//  - guarda en extras las medidas del casco que usan la flotación y la espuma.
// Uso: node scripts/preparar_barco.mjs   ->  assets/barco-web.glb
import { NodeIO, Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, weld, join, quantize, reorder, simplifyPrimitive, transformMesh, getBounds } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as unirRuta, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRADA = resolve(raiz, 'assets/barco-original.glb');
const SALIDA = resolve(raiz, 'assets/barco-web.glb');
const LINEA_AGUA = 0.03;      // altura de la flotación en el modelo original (encima de la franja oscura del fondo)
const ALTURA_FINAL = 7.0;     // altura sobre el agua en unidades de la app (luego ESCALA_BARCO = 0.8 en flotacion.js)
const TEXTURA = 1024;

await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(ENTRADA);
const root = doc.getRoot();
const escena = root.listScenes()[0];
const contar = () => root.listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((a, p) => a + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0), 0);
console.log('original:', Math.round(contar()), 'triángulos,', root.listMeshes().length, 'mallas');

// ---- 1) hornear transformaciones del mundo y colocar en el marco de la app
const bb = getBounds(escena);
const alturaOriginal = bb.max[1] - LINEA_AGUA;
const k = ALTURA_FINAL / alturaOriginal;
// rotación de +90° en Y (la proa +Z pasa a +X), escala k y flotación a y = 0  (matriz columna, estilo glTF)
const marco = [0, 0, -k, 0, 0, k, 0, 0, k, 0, 0, 0, 0, -LINEA_AGUA * k, 0, 1];
const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let i = 0; i < 4; i++) o[c * 4 + r] += a[i * 4 + r] * b[c * 4 + i]; return o; };
const usadas = new Set();
for (const nodo of root.listNodes()) {
  const malla = nodo.getMesh();
  if (!malla) continue;
  if (usadas.has(malla)) throw new Error('malla compartida entre nodos: no previsto');
  usadas.add(malla);
  transformMesh(malla, mul(marco, nodo.getWorldMatrix()));
}
// todas las mallas cuelgan directamente de la escena, sin transformaciones
for (const nodo of root.listNodes()) { nodo.setMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); }
for (const nodo of root.listNodes()) if (nodo.getMesh()) { for (const p of nodo.listParents()) if (p !== escena && p.removeChild) p.removeChild(nodo); escena.addChild(nodo); }
for (const nodo of root.listNodes()) if (!nodo.getMesh()) nodo.dispose();

// ---- 2) medidas del casco (la malla más grande de madera es el casco)
const casco = root.listMeshes().find((m) => m.getName().startsWith('Cube_Wood'));
const posCasco = casco.listPrimitives()[0].getAttribute('POSITION');
const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], v = [];
for (let i = 0; i < posCasco.getCount(); i++) { posCasco.getElement(i, v); for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], v[c]); mx[c] = Math.max(mx[c], v[c]); } }

// ---- 3) simplificar solo lo pesado (error relativo pequeño: no cambia la silueta)
for (const m of root.listMeshes()) {
  const mat = m.listPrimitives()[0].getMaterial()?.getName() || '';
  if (mat === 'Sail' || mat.startsWith('Rope')) continue;
  for (const p of m.listPrimitives()) {
    const tris = p.getIndices().getCount() / 3;
    if (tris < 1500) continue;
    simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio: 0.22, error: 0.0012, lockBorder: false });
  }
}

// ---- 4) velas: subdividir y calcular el empuje del viento
function subdividir(prim) {
  const pos = prim.getAttribute('POSITION'), nor = prim.getAttribute('NORMAL'), uv = prim.getAttribute('TEXCOORD_0');
  const P = [], N = [], T = [], idx = Array.from(prim.getIndices().getArray());
  const a3 = [], a2 = [];
  for (let i = 0; i < pos.getCount(); i++) { P.push([...pos.getElement(i, a3)]); N.push([...nor.getElement(i, a3)]); T.push([...uv.getElement(i, a2)]); }
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
  pos.setArray(new Float32Array(P.flat())); nor.setArray(new Float32Array(N.flat())); uv.setArray(new Float32Array(T.flat()));
  prim.getIndices().setArray(new Uint32Array(nuevo));
  return { P, N };
}
let nVelas = 0;
for (const m of root.listMeshes()) {
  const p = m.listPrimitives()[0];
  if (p.getMaterial()?.getName() !== 'Sail') continue;
  nVelas++;
  subdividir(p); const { P, N } = subdividir(p);
  // normal media de la vela, orientada a sotavento: las velas cuadras empujan hacia proa (+X), las de cuchillo hacia +Z
  const nm = [0, 0, 0]; for (const n of N) for (let c = 0; c < 3; c++) nm[c] += n[c];
  let l = Math.hypot(...nm) || 1; const n0 = nm.map((x) => x / l);
  const s = Math.abs(n0[0]) >= Math.abs(n0[2]) ? Math.sign(n0[0]) || 1 : Math.sign(n0[2]) || 1;
  const dir = n0.map((x) => x * s);
  // ejes en el plano de la vela: el vertical proyectado y el perpendicular
  const arriba = [0, 1, 0], d = arriba[1] * dir[1];
  let eV = [arriba[0] - dir[0] * d, arriba[1] - dir[1] * d, arriba[2] - dir[2] * d]; l = Math.hypot(...eV) || 1; eV = eV.map((x) => x / l);
  const eU = [eV[1] * dir[2] - eV[2] * dir[1], eV[2] * dir[0] - eV[0] * dir[2], eV[0] * dir[1] - eV[1] * dir[0]];
  const pu = P.map((q) => q[0] * eU[0] + q[1] * eU[1] + q[2] * eU[2]), pv = P.map((q) => q[0] * eV[0] + q[1] * eV[1] + q[2] * eV[2]);
  const [u0, u1, v0, v1] = [Math.min(...pu), Math.max(...pu), Math.min(...pv), Math.max(...pv)];
  const tam = Math.max(u1 - u0, v1 - v0);
  const emp = new Float32Array(P.length * 3);
  P.forEach((_, i) => {
    const su = (pu[i] - u0) / Math.max(u1 - u0, 1e-6), sv = (pv[i] - v0) / Math.max(v1 - v0, 1e-6);
    const w = Math.sin(Math.PI * su) * Math.sin(Math.PI * sv) * tam; // más hinchado en el centro y en velas grandes
    emp.set([dir[0] * w, dir[1] * w, dir[2] * w], i * 3);
  });
  p.setAttribute('_EMPUJE', doc.createAccessor().setType('VEC3').setArray(emp).setBuffer(root.listBuffers()[0]));
}
// las demás primitivas necesitan el mismo atributo para poder unirse por material: no hace falta, las velas van juntas

// ---- 5) materiales: metal de verdad y lona algo cálida
for (const m of root.listMaterials()) {
  if (m.getName() === 'Metal') m.setMetallicFactor(0.75).setRoughnessFactor(0.45);
  if (m.getName() === 'Sail') m.setBaseColorFactor([0.80, 0.76, 0.67, 1]); // lona, no blanco puro
  // pintura del casco algo menos saturada (más de maqueta antigua que de dibujo animado)
  if (m.getName() === 'Wood') m.setBaseColorFactor([0.84, 0.78, 0.70, 1]);
  // molduras y tallas doradas: pan de oro
  if (m.getName().startsWith('Material')) m.setMetallicFactor(0.7).setRoughnessFactor(0.38).setBaseColorFactor([0.72, 0.54, 0.16, 1]);
}

// ---- 6) unir por material, limpiar, textura a 1024, cuantizar y comprimir
await doc.transform(dedup(), weld(), join({ keepNamed: false }), prune());
const dirTmp = mkdtempSync(unirRuta(tmpdir(), 'barco-'));
for (const t of root.listTextures()) {
  const ent = unirRuta(dirTmp, 'ent.jpg'), sal = unirRuta(dirTmp, 'sal.jpg');
  writeFileSync(ent, t.getImage());
  const r = spawnSync('python3', ['-I', '-c', `from PIL import Image; im=Image.open('${ent}'); im.resize((${TEXTURA},${TEXTURA}), Image.LANCZOS).save('${sal}', quality=88, optimize=True)`]);
  if (r.status !== 0) throw new Error('no se pudo reducir la textura: ' + r.stderr);
  t.setImage(readFileSync(sal)).setMimeType('image/jpeg');
}
// las posiciones quedan en coma flotante (sin transformaciones de nodo): así la app y las velas trabajan en sus unidades
await doc.transform(reorder({ encoder: MeshoptEncoder }), quantize({ pattern: /^(NORMAL|TEXCOORD_0)$/, quantizeNormal: 10 }));
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });

escena.setExtras({
  casco: { min: mn, max: mx },          // medidas del casco en unidades de la app
  total: getBounds(escena),
  credito: 'Ottoman Coastal Trade Tall Ship 3D Model, por polygora (Sketchfab), CC-BY. Modificado.',
  rumbo: -0.30,                         // rumbo de reposo respecto al eje de la botella: casi de costado
});
await io.write(SALIDA, doc);
console.log('web:', Math.round(contar()), 'triángulos,', root.listMeshes().length, 'mallas,', nVelas, 'velas,', (statSync(SALIDA).size / 1024).toFixed(0), 'KB');
console.log('casco (x, y, z):', mn.map((x) => x.toFixed(2)).join(' '), '→', mx.map((x) => x.toFixed(2)).join(' '));
console.log('total:', JSON.stringify(getBounds(escena), (k2, x) => (typeof x === 'number' ? +x.toFixed(2) : x)));
