import * as THREE from 'three';
import { Canalizacion } from './canalizacion.js';
import { crearCubemapEntorno } from './entorno.js';
import { crearMundo } from './mundo.js';
import { crearBotella } from './bottle.js';
import { crearVidrio } from './vidrio.js';
import { crearAgua } from './agua.js';
import { texRuido } from './texturas.js';
import { crearBarco } from './barco.js';
import { crearFlotacion } from './flotacion.js';
import { crearSensores } from './sensores.js';
import { crearClima } from './clima.js';
import { crearUI } from './ui.js';
import { crearReflejo } from './reflejo.js';
import { crearAudio } from './audio.js';

const params = new URLSearchParams(location.search);
const num = (k, d) => (params.has(k) ? parseFloat(params.get(k)) : d);
const modoCaptura = params.has('t');

const lienzo = document.getElementById('lienzo');
const canal = new Canalizacion(lienzo);
const { cubo, pmrem } = crearCubemapEntorno(canal.renderer, 512);

const botella = crearBotella();
const mundo = crearMundo({ pmrem });
const ruido = texRuido(256);
const barco = crearBarco();
mundo.escena.add(barco.grupo);

const U = {
  tEscena: { value: null }, tAtras: { value: null }, tEntorno: { value: cubo },
  uRes: { value: new THREE.Vector2(1, 1) }, uEntornoRot: { value: new THREE.Matrix3() },
  uProy: { value: new THREE.Vector2(1, 1) }, uTiempo: { value: 0 }, uLuzExt: { value: new THREE.Color(1, 1, 1) }, uDbg: { value: num('dbg', 0) },
};
const vidrio = crearVidrio(U, botella.exterior);
const agua = crearAgua({ renderer: canal.renderer, botella, texRuido: ruido, cubo, relleno: num('relleno', 0.30) });
const flotacion = crearFlotacion({ barco, agua, botella });
const reflejo = crearReflejo({ mundo, barco, renderer: canal.renderer });

const camara = new THREE.PerspectiveCamera(20, 2, 5, 220);
const OBJETIVO = new THREE.Vector3(0.9, -1.2, 0);
function ajustarCamara(aspecto) {
  camara.aspect = aspecto;
  const mitadAncho = 17.6;
  const tanV = Math.tan(THREE.MathUtils.degToRad(camara.fov / 2));
  const dist = Math.max(mitadAncho / (tanV * aspecto), 30);
  const elev = THREE.MathUtils.degToRad(9);
  camara.position.set(OBJETIVO.x, OBJETIVO.y + dist * Math.sin(elev), OBJETIVO.z + dist * Math.cos(elev));
  camara.lookAt(OBJETIVO);
  camara.updateProjectionMatrix();
  camara.updateMatrixWorld(true);
  U.uProy.value.set(camara.projectionMatrix.elements[0], camara.projectionMatrix.elements[5]);
}

// ---- calidad adaptativa: escala de resolución según el tiempo de cuadro
const dprDisp = Math.min(window.devicePixelRatio || 1, 2);
const tactil = (navigator.maxTouchPoints || 0) > 0 && dprDisp >= 1.5;
const calidad = { modo: 'auto', escala: tactil ? 0.8 : 1, ema: 16.7, mala: 0, buena: 0 };
const MODOS = ['auto', 'alta', 'media', 'baja'];
function dprActual() {
  if (params.has('dpr')) return parseFloat(params.get('dpr'));
  const base = calidad.modo === 'alta' ? 1 : calidad.modo === 'media' ? 0.75 : calidad.modo === 'baja' ? 0.55 : calidad.escala;
  return dprDisp * base;
}
function redimensionar() {
  const w = innerWidth, h = innerHeight;
  canal.redimensionar(w, h, dprActual());
  U.uRes.value.set(canal.ancho, canal.alto);
  ajustarCamara(w / h);
}
addEventListener('resize', redimensionar);
redimensionar();

const sensores = crearSensores(lienzo);
if (params.has('roll') || params.has('pitch')) sensores.inclinar(num('roll', 0), num('pitch', 0));

let audio = crearAudio();
const clima = crearClima({ mundo, agua, barco, camara, alRayo: (retraso) => audio?.trueno(retraso) });
if (params.has('clima')) clima.fijar(params.get('clima'));
if (params.has('mar')) clima.ponerMar(num('mar', 0.5));
if (params.has('viento')) clima.ponerViento(num('viento', 0.75));
if (modoCaptura) clima.saltar();

if (params.get('ui') !== '0') {
  crearUI({
    clima, sensores, audio,
    alAjustarCalidad: () => { calidad.modo = MODOS[(MODOS.indexOf(calidad.modo) + 1) % MODOS.length]; redimensionar(); },
    estadoCalidad: () => calidad.modo,
  });
}

// ---- bucle
const gEf = new THREE.Vector3(), tmpM4 = new THREE.Matrix4();
const impulsos = [];
const solMundo = new THREE.Vector3(-0.62, 0.5, 0.6).normalize(), sol = new THREE.Vector3();
const entornoRot = new THREE.Matrix3();
let ultimo = null, tTotal = 0;

function avanzar(dt, t) {
  sensores.actualizar(dt);
  // gravedad aparente = gravedad real - aceleración del dispositivo (fuerza de inercia sobre el agua)
  gEf.copy(sensores.g).multiplyScalar(9.81).addScaledVector(sensores.acel, -0.9);
  if (gEf.lengthSq() < 1) gEf.copy(sensores.g);
  gEf.normalize();
  agua.actualizarFluido(dt, gEf);
  agua.agitar(sensores.sacudida);
  agua.sincronizarUniformes();

  // salpicaduras de lluvia y sacudidas
  const nGotas = clima.p.lluvia * 38 * dt;
  const acum = nGotas + (Math.random() < nGotas % 1 ? 1 : 0);
  for (let i = 0; i < Math.floor(acum) && impulsos.length < 8; i++) impulsos.push([(Math.random() * 20 - 12), (Math.random() * 2 - 1) * 5, 0.05 + Math.random() * 0.06, 0.15]);
  if (sensores.sacudida > 0.2 && impulsos.length < 7) impulsos.push([(Math.random() * 2 - 1) * 12, (Math.random() * 2 - 1) * 4, (Math.random() - 0.5) * 0.35 * sensores.sacudida, 0.5]);
  agua.simular(dt, t, impulsos);

  clima.actualizar(dt, t, sensores.g, camara.aspect);
  audio.actualizar(clima.p, sensores.sacudida, dt);
  flotacion.actualizar(dt, t, clima.p.viento);
  barco.actualizar(t, clima.p.viento);
}

function dibujar(t) {
  tmpM4.makeRotationFromQuaternion(clima.qEnv);
  entornoRot.setFromMatrix4(tmpM4);
  U.uEntornoRot.value.copy(entornoRot);
  U.uLuzExt.value.copy(clima.luzFinal);
  sol.copy(solMundo).applyQuaternion(clima.qInv);
  U.tEscena.value = canal.rtComp.texture;
  U.tAtras.value = canal.rtAtras.texture;
  U.uTiempo.value = t;
  canal.dibujar({
    mundo: mundo.escena, camara, vidrio, tiempo: t,
    reflejoPasada: (rt) => reflejo.renderizar(camara, rt, agua.estado),
    aguaPasada: (rtEscena, rtComp) => agua.pasadaVolumen(camara, rtEscena, rtComp, {
      entornoRot, luz: clima.luzFinal, sol, niebla: clima.p.niebla, colNiebla: clima.p.colNiebla, refl: canal.rtRefl.texture,
    }),
  });
  window.__cuadros = (window.__cuadros || 0) + 1;
}

function adaptarCalidad(dtMs) {
  if (calidad.modo !== 'auto') return;
  calidad.ema += (dtMs - calidad.ema) * 0.05;
  if (calidad.ema > 24) { calidad.mala += dtMs; calidad.buena = 0; } else if (calidad.ema < 15) { calidad.buena += dtMs; calidad.mala = 0; } else { calidad.mala = calidad.buena = 0; }
  if (calidad.mala > 1500 && calidad.escala > 0.5) { calidad.escala = Math.max(0.5, calidad.escala - 0.1); calidad.mala = 0; redimensionar(); }
  else if (calidad.buena > 6000 && calidad.escala < 1) { calidad.escala = Math.min(1, calidad.escala + 0.1); calidad.buena = 0; redimensionar(); }
}

function cuadro(ahora) {
  const dtMs = ultimo === null ? 16.7 : ahora - ultimo;
  const dt = Math.min(0.05, dtMs / 1000);
  ultimo = ahora; tTotal += dt;
  adaptarCalidad(Math.min(dtMs, 100));
  avanzar(dt, tTotal);
  dibujar(tTotal);
}

// Con ?t=… se avanza la simulación sin dibujar y se renderiza un solo cuadro (capturas reproducibles).
if (modoCaptura) {
  const T = num('t', 1), pasos = Math.max(1, Math.round(T * 30));
  for (let i = 0; i <= pasos; i++) avanzar(1 / 30, i / 30);
  dibujar(T);
  window.__listo = true;
} else {
  const bucle = (ahora) => { cuadro(ahora); requestAnimationFrame(bucle); };
  requestAnimationFrame(bucle);
  window.__listo = true;
}
window.__api = { clima, sensores, agua, calidad, redibujar: () => dibujar(tTotal), camara, canal, avanzar, flotacion, barco, botella };
