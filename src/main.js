import * as THREE from 'three';
import { Canalizacion } from './canalizacion.js';
import { crearCubemapEntorno } from './entorno.js';
import { crearMundo } from './mundo.js';
import { crearBotella } from './bottle.js';
import { crearVidrio } from './vidrio.js';
import { crearAgua } from './agua.js';
import { texRuido } from './texturas.js';
import { crearBarcoModelo } from './barcoModelo.js';
import { crearFlotacion } from './flotacion.js';
import { crearSensores } from './sensores.js';
import { crearClima } from './clima.js';
import { crearUI } from './ui.js';
import { crearReflejo } from './reflejo.js';
import { crearAudio } from './audio.js';
import { crearGotas } from './gotas.js';
import { crearViento } from './viento.js';
import { crearSalpicaduras } from './salpicaduras.js';
import { crearBotellita } from './botellita.js';
import { crearGaviotas } from './gaviotas.js';
import { crearBatalla } from './batalla.js';

const params = new URLSearchParams(location.search);
const num = (k, d) => (params.has(k) ? parseFloat(params.get(k)) : d);
const modoCaptura = params.has('t');

const lienzo = document.getElementById('lienzo');
const canal = new Canalizacion(lienzo);
const { cubo, pmrem } = crearCubemapEntorno(canal.renderer, 512);

const botella = crearBotella();
const mundo = crearMundo({ pmrem });
const ruido = texRuido(256);
// El barco (el galeón) va en un archivo aparte, docs/barcos/galeon.glb, que se descarga al abrir la app.
const URL_BARCO = 'barcos/galeon.glb';

// Versión (archivo VERSION, la pone build.mjs). Al abrir la app y al volver a ella, se mira docs/version.json sin
// caché: si hay una versión más nueva publicada, la página se recarga sola con ?v=<nueva> (una vez por versión,
// para no entrar en bucle si GitHub aún sirve la página vieja).
const VERSION = __VERSION__;
function comprobarVersion() {
  if (!/^https?:/.test(location.protocol) || window.__barcosTexto) return;
  fetch('version.json?t=' + Date.now(), { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((d) => {
    const nueva = d && +d.version;
    if (!nueva || nueva <= VERSION) return;
    try { if (sessionStorage.getItem('barco-recargado') === String(nueva)) return; sessionStorage.setItem('barco-recargado', String(nueva)); } catch (_) { /* sin almacenamiento */ }
    const u = new URL(location.href);
    u.searchParams.set('v', nueva);
    location.replace(u.toString());
  }).catch(() => { /* sin conexión: se sigue con la que hay */ });
}
comprobarVersion();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') comprobarVersion(); });
// XMLHttpRequest y no fetch: así también funciona abriendo la página como archivo local.
// En la versión para enlace de claude.ai (window.__barcosTexto) el barco va como texto base64 (.b64.txt).
const descargar = (url) => new Promise((ok, mal) => {
  const texto = !!window.__barcosTexto;
  const x = new XMLHttpRequest();
  // ?v=: cada versión pide su barco de nuevo (no el de la caché de una versión anterior)
  x.open('GET', (texto ? url + '.b64.txt' : url) + '?v=' + VERSION); x.responseType = texto ? 'text' : 'arraybuffer';
  const datos = () => (texto ? Uint8Array.from(atob(x.response.trim()), (c) => c.charCodeAt(0)) : new Uint8Array(x.response));
  x.onload = () => (x.status === 200 || (x.status === 0 && x.response) ? ok(datos()) : mal(new Error('HTTP ' + x.status)));
  x.onerror = () => mal(new Error('sin conexión'));
  x.send();
});
const aviso = document.getElementById('cargando');
// Si la descarga falla (mala cobertura), se reintenta con esperas crecientes y se avisa en pantalla.
async function cargarBarco() {
  for (let intento = 1; ; intento++) {
    try { return await crearBarcoModelo(await descargar(URL_BARCO)); } catch (e) {
      console.warn('[app] no se pudo descargar el barco:', e);
      if (aviso) { aviso.firstChild.textContent = 'Sin conexión: reintentando descargar el barco…'; aviso.style.opacity = '1'; }
      await new Promise((r) => setTimeout(r, Math.min(15, 2 * intento) * 1000));
    }
  }
}
const barco = await cargarBarco();
if (aviso) aviso.style.opacity = '0';
mundo.interior.escena.add(barco.grupo); // el barco vive dentro de la botella, con la luz del clima

const U = {
  tEscena: { value: null }, tAtras: { value: null }, tEntorno: { value: cubo },
  uRes: { value: new THREE.Vector2(1, 1) }, uEntornoRot: { value: new THREE.Matrix3() },
  uProy: { value: new THREE.Vector2(1, 1) }, uTiempo: { value: 0 }, uLuzExt: { value: new THREE.Color(1, 1, 1) }, uDbg: { value: num('dbg', 0) },
  tGotas: { value: null }, uHayGotas: { value: 0 },
  uGrietas: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 0, 0)) }, uAgujero: { value: new THREE.Vector4(0, 0, 0, 0) },
};
const vidrio = crearVidrio(U, botella.exterior);
const agua = crearAgua({ renderer: canal.renderer, botella, texRuido: ruido, cubo, relleno: num('relleno', 0.30) });
const flotacion = crearFlotacion({ barco, agua, botella });
const gotas = crearGotas({ renderer: canal.renderer, agua, botella });
const viento = crearViento();
const salpicaduras = crearSalpicaduras({ agua, botella, cubo });
const proaBarco = new THREE.Vector3();
const botellita = crearBotellita({ escena: mundo.interior.escena, agua, botella });
const gaviotas = crearGaviotas({ escena: mundo.interior.escena, agua, botella });
// un punto al azar de la borda del barco (y hacia fuera), en el marco de la botella: por ahí cae el agua
const bordaP = new THREE.Vector3(), bordaD = new THREE.Vector3();
function puntoBorda() {
  const I = barco.info || {}, lado = Math.random() < 0.5 ? -1 : 1;
  bordaP.set((Math.random() - 0.5) * 0.8 * (I.eslora ?? 8.4), I.cubierta ?? 1.2, lado * 0.5 * (I.manga ?? 1.7)).applyMatrix4(barco.grupo.matrix);
  bordaD.set(0, -0.2, lado).transformDirection(barco.grupo.matrix);
  return { p: bordaP, fuera: bordaD };
}
const reflejo = crearReflejo({ interior: mundo.interior, barco, renderer: canal.renderer });

const camara = new THREE.PerspectiveCamera(20, 2, 5, 220);
const OBJETIVO = new THREE.Vector3(0.9, -1.2, 0);
// Ampliar como una foto: zoom.z (1 = vista normal) y desplazamiento de la vista ampliada (unidades del mundo, a
// la derecha y arriba de la cámara). La proyección sigue centrada (el agua y el vidrio lo necesitan): se mueve la cámara.
const zoom = { z: 1, x: 0, y: 0, alto: 1, objetivo: null };
const derCam = new THREE.Vector3(), arrCam = new THREE.Vector3(), mira = new THREE.Vector3();
function ajustarCamara(aspecto) {
  camara.aspect = aspecto;
  const mitadAncho = 17.6;
  const tanV = Math.tan(THREE.MathUtils.degToRad(camara.fov / 2));
  const dist = Math.max(mitadAncho / (tanV * aspecto), 30);
  const elev = THREE.MathUtils.degToRad(9);
  zoom.alto = dist * tanV; // media altura visible a z = 1
  // sin salirse del encuadre normal
  zoom.x = THREE.MathUtils.clamp(zoom.x, -zoom.alto * aspecto * (1 - 1 / zoom.z), zoom.alto * aspecto * (1 - 1 / zoom.z));
  zoom.y = THREE.MathUtils.clamp(zoom.y, -zoom.alto * (1 - 1 / zoom.z), zoom.alto * (1 - 1 / zoom.z));
  derCam.set(1, 0, 0);
  arrCam.set(0, Math.cos(elev), -Math.sin(elev));
  camara.position.set(OBJETIVO.x, OBJETIVO.y + dist * Math.sin(elev), OBJETIVO.z + dist * Math.cos(elev))
    .addScaledVector(derCam, zoom.x).addScaledVector(arrCam, zoom.y);
  camara.lookAt(mira.copy(OBJETIVO).addScaledVector(derCam, zoom.x).addScaledVector(arrCam, zoom.y));
  camara.zoom = zoom.z;
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
  salpicaduras?.escala(canal.alto);
}
addEventListener('resize', redimensionar);
redimensionar();

const sensores = crearSensores(lienzo);
if (params.has('roll') || params.has('pitch')) sensores.inclinar(num('roll', 0), num('pitch', 0));

let audio = crearAudio();
// Batalla: el galeón dispara al cristal (botón «Fuego» o tecla F). Al romperse, cámara lenta y la vista se acerca.
const batalla = crearBatalla({ interior: mundo.interior.escena, exterior: mundo.escena, mundoEscena: mundo.escena, cubo, barco, agua, botella, salpicaduras, flotacion, audio, U });
const aPantalla = new THREE.Vector3();
batalla.alRomper = (T) => {
  if (modoCaptura) return;
  aPantalla.copy(T).project(camara);
  zoom.objetivo = { z: 1.6, x: (aPantalla.x + 1) / 2 * innerWidth, y: (1 - aPantalla.y) / 2 * innerHeight };
};
batalla.alRebobinar = () => { if (zoom.z > 1) zoom.objetivo = { z: 1, x: innerWidth / 2, y: innerHeight / 2 }; };
addEventListener('keydown', (e) => { if (e.key === 'f' || e.key === 'F') batalla.andanada(); });
// Vibración con los truenos cercanos (Android; iPhone no la permite desde la web). Llega a la vez que el trueno.
const opciones = { vibrar: true };
function vibrarTrueno(retraso) {
  const cerca = Math.max(0, Math.min(1, 1 - (retraso - 0.15) / 2));
  if (!opciones.vibrar || cerca < 0.35 || !navigator.vibrate) return;
  const f = 0.5 + 0.5 * cerca;
  setTimeout(() => { try { navigator.vibrate([Math.round(70 * f), 50, Math.round(160 * f), 90, Math.round(60 * f)]); } catch (_) { /* sin permiso */ } }, retraso * 1000);
}
const clima = crearClima({ mundo, agua, barco, botella, camara, alRayo: (retraso) => { audio?.trueno(retraso); vibrarTrueno(retraso); } });
if (params.has('clima')) clima.fijar(params.get('clima'));
if (params.has('hora')) clima.fijarHora(num('hora', 12));
if (params.has('mar')) clima.ponerMar(num('mar', 0.5));
if (params.has('viento')) clima.ponerViento(num('viento', 0.75));
clima.conectarViento(viento);
if (modoCaptura) clima.saltar();
// ?ola=1: en la captura, una ola grande cruzando el centro de la botella

let ui = null;

// ---- ampliar y reducir como una foto: pellizco con dos dedos (o rueda del ratón); ampliada, un dedo la mueve;
// doble toque amplía ahí o vuelve a la vista normal. Al reducir del todo, vuelve a su sitio.
const ZOOM_MAX = 4;
const dedos = new Map();
let pellizco = null, huboGesto = false, ultimoToque = { t: 0, x: 0, y: 0 };
// pone el zoom z manteniendo quieto el punto del mundo que estaba bajo (sx0, sy0) con z0 y pan0, ahora bajo (sx, sy)
function ponerZoom(z, sx, sy, z0 = zoom.z, sx0 = sx, sy0 = sy, x0 = zoom.x, y0 = zoom.y) {
  z = THREE.MathUtils.clamp(z, 1, ZOOM_MAX);
  const k = 2 * zoom.alto / innerHeight; // unidades del mundo por píxel a z = 1
  const mx0 = sx0 - innerWidth / 2, my0 = sy0 - innerHeight / 2, mx = sx - innerWidth / 2, my = sy - innerHeight / 2;
  zoom.z = z;
  zoom.x = x0 + k * (mx0 / z0 - mx / z);
  zoom.y = y0 + k * (-my0 / z0 + my / z);
  if (z < 1.02) { zoom.z = 1; zoom.x = 0; zoom.y = 0; }
  ajustarCamara(innerWidth / innerHeight);
  sensores.bloquearArrastre(zoom.z > 1 || dedos.size > 1);
}
lienzo.addEventListener('pointerdown', (e) => {
  dedos.set(e.pointerId, [e.clientX, e.clientY]);
  if (dedos.size === 1) huboGesto = false;
  if (dedos.size === 2) {
    const [a, b] = [...dedos.values()];
    pellizco = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], z: zoom.z, x: zoom.x, y: zoom.y };
    huboGesto = true; zoom.objetivo = null;
    sensores.bloquearArrastre(true);
  }
});
lienzo.addEventListener('pointermove', (e) => {
  if (!dedos.has(e.pointerId)) return;
  const antes = dedos.get(e.pointerId);
  dedos.set(e.pointerId, [e.clientX, e.clientY]);
  if (dedos.size >= 2 && pellizco) {
    const [a, b] = [...dedos.values()];
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    ponerZoom(pellizco.z * d / Math.max(pellizco.d, 1), m[0], m[1], pellizco.z, pellizco.m[0], pellizco.m[1], pellizco.x, pellizco.y);
  } else if (dedos.size === 1 && zoom.z > 1) {
    // ampliada: un dedo mueve la vista
    const dx = e.clientX - antes[0], dy = e.clientY - antes[1];
    if (Math.abs(dx) + Math.abs(dy) > 0) {
      const k = 2 * zoom.alto / innerHeight / zoom.z;
      zoom.x -= dx * k; zoom.y += dy * k;
      ajustarCamara(innerWidth / innerHeight);
    }
  }
});
const soltarDedo = (e) => {
  dedos.delete(e.pointerId);
  if (dedos.size < 2) pellizco = null;
  if (dedos.size === 0) sensores.bloquearArrastre(zoom.z > 1);
};
lienzo.addEventListener('pointercancel', soltarDedo);
lienzo.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoom.objetivo = null;
  ponerZoom(zoom.z * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
}, { passive: false });
// doble toque: amplía ×2,5 donde se toca, o vuelve a la vista normal (con animación)
function dobleToque(x, y) {
  zoom.objetivo = zoom.z > 1.05 ? { z: 1, x, y } : { z: 2.5, x, y };
}
function animarZoom(dt) {
  const o = zoom.objetivo;
  if (!o) return;
  const z = zoom.z + (o.z - zoom.z) * Math.min(1, dt * 9);
  ponerZoom(Math.abs(z - o.z) < 0.01 ? o.z : z, o.x, o.y);
  if (zoom.z === o.z || (o.z === 1 && zoom.z === 1)) zoom.objetivo = null;
}

// Tocar la botellita que flota: se abre su mensaje. Tocar el barco: suena su campana.
const rayoToque = new THREE.Raycaster(), ndcToque = new THREE.Vector2();
let inicioToque = null;
lienzo.addEventListener('pointerdown', (e) => { inicioToque = [e.clientX, e.clientY]; });
lienzo.addEventListener('pointerup', (e) => {
  const gesto = huboGesto;
  soltarDedo(e);
  if (gesto || dedos.size > 0) return; // fue un pellizco
  if (!inicioToque || Math.hypot(e.clientX - inicioToque[0], e.clientY - inicioToque[1]) > 12) return; // fue un arrastre
  const ahora = performance.now();
  if (ahora - ultimoToque.t < 320 && Math.hypot(e.clientX - ultimoToque.x, e.clientY - ultimoToque.y) < 40) {
    ultimoToque.t = 0; dobleToque(e.clientX, e.clientY); return;
  }
  ultimoToque = { t: ahora, x: e.clientX, y: e.clientY };
  const r = lienzo.getBoundingClientRect();
  ndcToque.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  rayoToque.setFromCamera(ndcToque, camara);
  if (botellita.tocada(rayoToque.ray)) { ui?.mostrarMensaje(botellita.leer()); return; }
  // tocar el barco: su campana (con el sonido activado)
  esferaBarco.center.set(0, (barco.info?.alturaMax ?? 6) * 0.4, 0).applyMatrix4(barco.grupo.matrix);
  esferaBarco.radius = 0.8 * 0.45 * (barco.info?.eslora ?? 8.4);
  if (rayoToque.ray.intersectsSphere(esferaBarco)) audio?.campanas(2);
});
const esferaBarco = new THREE.Sphere();

// Campanas de a bordo según la hora real: cada media hora, de 1 a 8 toques según la guardia de 4 horas
// (12:30 → 1, 13:00 → 2 … 16:00 → 8). Solo con el sonido activado.
let ultimaCampana = '';
function revisarCampanas() {
  const d = new Date(), m = d.getMinutes();
  if ((m !== 0 && m !== 30) || d.getSeconds() > 20) return;
  const clave = d.toDateString() + d.getHours() + ':' + m;
  if (clave === ultimaCampana) return;
  ultimaCampana = clave;
  const golpes = ((d.getHours() % 4) * 2 + (m === 30 ? 1 : 0)) || 8;
  audio?.campanas(golpes);
}
setInterval(revisarCampanas, 5000);

const rend = { fps: 0, cuadros: 0, desde: 0 }; // fotogramas por segundo medidos (se muestran en Ajustes)
if (params.get('ui') !== '0') {
  ui = crearUI({
    clima, sensores, audio, alDisparar: () => batalla.andanada(),
    alAjustarCalidad: () => { calidad.modo = MODOS[(MODOS.indexOf(calidad.modo) + 1) % MODOS.length]; redimensionar(); },
    estadoCalidad: () => calidad.modo,
    opciones, version: VERSION, creditoBarco: barco.credito, rendimiento: () => ({ fps: rend.fps, resolucion: Math.round(dprActual() / dprDisp * 100) }),
  });
}

// ---- bucle
const gEf = new THREE.Vector3(), tmpM4 = new THREE.Matrix4();
const impulsos = [];
const solMundo = new THREE.Vector3(-0.62, 0.5, 0.6).normalize(), sol = new THREE.Vector3();
const entornoRot = new THREE.Matrix3();
let ultimo = null, tTotal = 0;

function avanzar(dt, t, dtReal = dt) {
  sensores.actualizar(dtReal);
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
  batalla.actualizar(dtReal, { gEf, impulsos, alto: canal.alto });
  if (sensores.sacudida > 0.2 && impulsos.length < 7) impulsos.push([(Math.random() * 2 - 1) * 12, (Math.random() * 2 - 1) * 4, (Math.random() - 0.5) * 0.35 * sensores.sacudida, 0.5]);
  agua.simular(dt, t, impulsos);

  clima.actualizar(dt, t, sensores.g, camara.aspect, canal.alto);
  audio.actualizar(clima.p, sensores.sacudida, dt, viento.total);
  viento.actualizar(dt, { base: clima.p.viento, sacudida: sensores.sacudida, balanceo: flotacion.estado.vbal });
  agua.ponerViento(viento.total, viento.estado.dir);
  flotacion.actualizar(dt, t, viento.total);
  gotas.actualizar(dt, { lluvia: clima.p.lluvia, g: sensores.g });
  barco.actualizar(t, viento.estado);
  // salpicaduras de las crestas que rompen y de la proa al golpear las olas
  proaBarco.set((barco.info?.eslora ?? 8.4) * 0.5, 0.25, 0).applyMatrix4(barco.grupo.matrix);
  salpicaduras.actualizar(dt, t, { viento: viento.total, barco: { vcab: flotacion.estado.vcab, proa: proaBarco, golpe: flotacion.estado.golpe, puntoBorda } });
  salpicaduras.color(clima.luzFinal, clima.bioluminiscencia);
  // las gotas grandes que caen al agua dejan una onda pequeña
  while (salpicaduras.ondas.length) { const o = salpicaduras.ondas.pop(); if (impulsos.length < 8) impulsos.push(o); }
  botellita.actualizar(dt, t, { viento: viento.total, barcoU: flotacion.estado.u, barcoV: flotacion.estado.v, radioBarco: 0.8 * 0.55 * (barco.info?.eslora ?? 8.4) + 1.2 });
  gaviotas.actualizar(dt, t, {
    clima: clima.p, barco, centroU: flotacion.estado.u, centroV: flotacion.estado.v, viento: viento.total, dirViento: viento.estado.dir,
    graznar: () => audio?.gaviota(),
    alZambullir: (p, u, v) => { salpicaduras.salpicar(p); if (impulsos.length < 8) impulsos.push([u, v, 0.05, 0.2]); },
  });
  agua.ponerBioluminiscencia(clima.bioluminiscencia);
}

function dibujar(t, dt = 1 / 60) {
  U.tGotas.value = gotas.dibujar(dt);
  U.uHayGotas.value = gotas.activo ? 1 : 0;
  tmpM4.makeRotationFromQuaternion(clima.qEnv);
  entornoRot.setFromMatrix4(tmpM4);
  U.uEntornoRot.value.copy(entornoRot);
  sol.copy(solMundo).applyQuaternion(clima.qInv);
  U.tEscena.value = canal.rtComp.texture;
  U.tAtras.value = canal.rtAtras.texture;
  U.uTiempo.value = t;
  canal.dibujar({
    mundo: mundo.escena, interior: mundo.interior.escena, camara, vidrio, tiempo: t,
    reflejoPasada: (rt) => reflejo.renderizar(camara, rt, agua.estado),
    aguaPasada: (rtEscena, rtComp) => agua.pasadaVolumen(camara, rtEscena, rtComp, {
      entornoRot, luz: clima.luzFinal, sol, niebla: clima.p.niebla, colNiebla: clima.p.colNiebla, refl: canal.rtRefl.texture,
      aire: clima.p.aire, colAire: clima.colAire, nubes: clima.nubes,
    }),
    encimaVidrio: batalla.hayEncima ? batalla.encima : null,
    encimaAgua: {
      hay: () => salpicaduras.cantidad > 0,
      dibujar: (tColor, tProf) => salpicaduras.dibujar(canal.renderer, camara, tColor, tProf, { entornoRot, sol, ancho: canal.ancho, alto: canal.alto }),
    },
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
  const dtR = Math.min(0.05, dtMs / 1000);
  const dt = dtR * batalla.estado.lenta; // cámara lenta al romperse la botella
  ultimo = ahora; tTotal += dt;
  rend.cuadros++;
  if (ahora - rend.desde >= 1000) { rend.fps = Math.round(rend.cuadros * 1000 / (ahora - rend.desde)); rend.cuadros = 0; rend.desde = ahora; }
  adaptarCalidad(Math.min(dtMs, 100));
  animarZoom(dt);
  avanzar(dt, tTotal, dtR);
  dibujar(tTotal, dt);
}

// Con ?t=… se avanza la simulación sin dibujar y se renderiza un solo cuadro (capturas reproducibles).
if (modoCaptura) {
  const T = num('t', 1), pasos = Math.max(1, Math.round(T * 30));
  for (let i = 0; i <= pasos; i++) {
    if (params.has('rayo') && i === pasos) clima.forzarRayo(i / 30 - 0.02);
    if (params.has('arcoiris') && i === Math.max(0, pasos - 300)) clima.forzarArcoiris(i / 30);
    if (params.has('fugaz') && i === pasos - 10) clima.cielo.lanzarFugaz();
    if (params.has('ola') && i === Math.max(0, pasos - 255)) agua.lanzarOlaGrande(i / 30); // llega al centro al final
    if (params.has('fuego') && i === Math.max(0, pasos - Math.round(num('fuego', 2) * 30))) batalla.andanada(); // ?fuego=s: andanada s segundos antes
    avanzar(1 / 30, i / 30);
  }
  dibujar(T);
  window.__listo = true;
} else {
  const bucle = (ahora) => { cuadro(ahora); requestAnimationFrame(bucle); };
  requestAnimationFrame(bucle);
  window.__listo = true;
}
window.__api = {
  clima, sensores, agua, calidad, redibujar: (dt) => dibujar(tTotal, dt), camara, canal, avanzar, botella, audio, gotas, viento, salpicaduras, botellita, gaviotas,
  flotacion, barco, batalla,
};
