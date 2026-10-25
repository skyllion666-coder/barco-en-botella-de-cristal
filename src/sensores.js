// Sensores: gravedad en el marco de la botella (X derecha, Y arriba, Z hacia el espectador) a partir de
// DeviceOrientation / DeviceMotion. Respaldo con ratón/táctil y teclado en escritorio.
import * as THREE from 'three';
import { clamp } from './util.js';

const rad = THREE.MathUtils.degToRad;

export function crearSensores(lienzo) {
  const s = {
    g: new THREE.Vector3(0, -1, 0),      // dirección "abajo" suavizada, en el marco de la botella (≈ unidad)
    acel: new THREE.Vector3(),           // aceleración lineal del dispositivo (m/s²) en el marco de la botella
    sacudida: 0,                         // 0..1, energía de agitación reciente
    fuente: 'ninguna',                   // 'sensor' | 'puntero' | 'ninguna'
    permiso: 'desconocido',              // 'concedido' | 'denegado' | 'necesario' | 'noDisponible' | 'desconocido'
    calibracion: 0,                      // compensación de cabeceo (rad)
    sinSensor: false,                    // true si, tras activar, no llega ningún dato del giroscopio
    enMarco: (() => { try { return window.self !== window.top; } catch (_) { return true; } })(),  // dentro de otra página (visor)
    seguro: window.isSecureContext !== false,
  };

  const gPant = new THREE.Vector3(0, -1, 0);
  const gCruda = new THREE.Vector3(0, -1, 0);
  const aCruda = new THREE.Vector3();
  let tieneOrientacion = false, ultimoSensor = 0, calibrar = false;
  // Al rotar la pantalla el marco cambia 90° de golpe: durante TRANSICION segundos se suaviza más la gravedad,
  // no se cuenta como sacudida y la recalibración espera a que el móvil se quede quieto.
  const TRANSICION = 1.2;
  const gFiltro = new THREE.Vector3(0, -1, 0);
  let transicion = 0, calibrarTras = 0, anguloPrevio = null;
  const alRotarPantalla = () => { transicion = TRANSICION; calibrarTras = TRANSICION; };

  const anguloPantalla = () => {
    // screen.orientation.angle es el estándar; window.orientation (iOS antiguo) tiene el signo contrario.
    const a = (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : -(window.orientation || 0);
    return ((a % 360) + 360) % 360;
  };

  // vector del marco del dispositivo -> marco de pantalla
  function aPantalla(v, out) {
    switch (anguloPantalla()) {
      case 90: return out.set(-v.y, v.x, v.z);
      case 270: return out.set(v.y, -v.x, v.z);
      case 180: return out.set(-v.x, -v.y, v.z);
      default: return out.set(v.x, v.y, v.z);
    }
  }

  const dev = new THREE.Vector3();
  function alOrientar(e) {
    if (e.beta === null || e.gamma === null || e.beta === undefined) return;
    tieneOrientacion = true; s.sinSensor = false; ultimoSensor = performance.now(); s.fuente = 'sensor';
    const ang = anguloPantalla();
    if (anguloPrevio !== null && ang !== anguloPrevio) alRotarPantalla();
    anguloPrevio = ang;
    const b = rad(e.beta), g = rad(e.gamma);
    // "abajo" en el marco del dispositivo (x derecha, y arriba, z fuera de la pantalla)
    dev.set(Math.cos(b) * Math.sin(g), -Math.sin(b), -Math.cos(b) * Math.cos(g));
    aPantalla(dev, gCruda);
    if (calibrar) { fijarCalibracion(); calibrar = false; }
  }

  const acDev = new THREE.Vector3();
  function alMover(e) {
    const a = e.acceleration;
    if (a && a.x !== null && a.x !== undefined) {
      acDev.set(a.x, a.y, a.z);
      aPantalla(acDev, aCruda);
    } else if (e.accelerationIncludingGravity && tieneOrientacion) {
      // Sin 'acceleration': restar la gravedad estimada (el signo varía entre plataformas; se prueba el coherente)
      const ag = e.accelerationIncludingGravity;
      acDev.set(ag.x, ag.y, ag.z);
      const tmp = new THREE.Vector3();
      aPantalla(acDev, tmp);
      const g1 = tmp.clone().addScaledVector(gCruda, 9.81), g2 = tmp.clone().addScaledVector(gCruda, -9.81);
      aCruda.copy(g1.length() < g2.length() ? g1 : g2);
    }
  }

  function fijarCalibracion() {
    // Compensa el cabeceo con el que se sostiene el móvil: gira alrededor de X para que "abajo" quede en el plano XY.
    s.calibracion = Math.atan2(-gCruda.z, -gCruda.y);
  }

  async function activarSensores() {
    const necesitaPermiso = typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function';
    try {
      if (necesitaPermiso) {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r !== 'granted') { s.permiso = 'denegado'; return false; }
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
          try { await DeviceMotionEvent.requestPermission(); } catch (_) { /* sigue con solo orientación */ }
        }
      }
      addEventListener('deviceorientation', alOrientar, true);
      addEventListener('devicemotion', alMover, true);
      s.permiso = 'concedido';
      calibrar = true;
      setTimeout(() => { if (!tieneOrientacion) s.sinSensor = true; }, 2500);
      return true;
    } catch (_) { s.permiso = 'noDisponible'; return false; }
  }

  // Comprobación inicial: se escucha siempre (en Android funciona sin permiso); si no llega ningún dato y existe
  // requestPermission (iOS), se pide el permiso con un gesto del usuario.
  const hayAPI = typeof DeviceOrientationEvent !== 'undefined';
  if (!hayAPI) s.permiso = 'noDisponible';
  else {
    addEventListener('deviceorientation', alOrientar, true);
    addEventListener('devicemotion', alMover, true);
    setTimeout(() => {
      if (tieneOrientacion) { s.permiso = 'concedido'; calibrar = true; return; }
      if (typeof DeviceOrientationEvent.requestPermission === 'function') s.permiso = 'necesario';
      else { s.permiso = 'concedido'; s.sinSensor = true; }
    }, 1500);
  }

  // ---- respaldo en escritorio: arrastrar con el puntero inclina; teclado con flechas
  const punt = { activo: false, x: 0, y: 0, roll: 0, pitch: 0, vx: 0, vy: 0, anterior: null };
  const teclas = new Set();
  lienzo.addEventListener('pointerdown', (e) => { punt.activo = true; punt.anterior = [e.clientX, e.clientY]; lienzo.setPointerCapture?.(e.pointerId); });
  addEventListener('pointerup', () => { punt.activo = false; });
  lienzo.addEventListener('pointermove', (e) => {
    if (!punt.activo || !punt.anterior) return;
    const dx = e.clientX - punt.anterior[0], dy = e.clientY - punt.anterior[1];
    punt.anterior = [e.clientX, e.clientY];
    punt.roll = clamp(punt.roll + dx * 0.20, -80, 80);
    punt.pitch = clamp(punt.pitch + dy * 0.20, -55, 55);
    punt.vx = dx; punt.vy = dy;
    if (s.fuente !== 'sensor') s.fuente = 'puntero';
  });
  addEventListener('keydown', (e) => { teclas.add(e.key); });
  addEventListener('keyup', (e) => { teclas.delete(e.key); });
  addEventListener('orientationchange', alRotarPantalla);
  screen.orientation?.addEventListener?.('change', alRotarPantalla);

  const objetivoG = new THREE.Vector3();
  const rx = new THREE.Matrix4();
  let anteriorG = new THREE.Vector3(0, -1, 0), tPrev = performance.now();

  s.diagnostico = () => {
    if (s.fuente === 'sensor') return null;
    if (!s.seguro) return 'Para usar el giroscopio la página debe abrirse por HTTPS.';
    if (s.permiso === 'denegado') return 'Permiso de movimiento denegado. Actívalo en los ajustes del navegador y recarga.';
    if (s.sinSensor || s.permiso === 'noDisponible') {
      return s.enMarco
        ? 'Esta página está dentro de otro visor (marco) y el navegador no le entrega el giroscopio. Ábrela directamente en el navegador del móvil.'
        : 'No llegan datos del giroscopio. Revisa que el navegador tenga permiso de movimiento.';
    }
    return null;
  };
  s.recalibrar = () => { if (tieneOrientacion) fijarCalibracion(); else { punt.roll = 0; punt.pitch = 0; } };
  s.activar = activarSensores;
  s.inclinar = (roll, pitch) => { punt.roll = roll; punt.pitch = pitch; s.fuente = s.fuente === 'sensor' ? 'sensor' : 'puntero'; };

  s.actualizar = (dt) => {
    const ahora = performance.now();
    if (teclas.size) {
      const v = 70 * dt;
      if (teclas.has('ArrowLeft') || teclas.has('a')) punt.roll -= v;
      if (teclas.has('ArrowRight') || teclas.has('d')) punt.roll += v;
      if (teclas.has('ArrowUp') || teclas.has('w')) punt.pitch -= v * 0.7;
      if (teclas.has('ArrowDown') || teclas.has('s')) punt.pitch += v * 0.7;
      punt.roll = clamp(punt.roll, -85, 85); punt.pitch = clamp(punt.pitch, -55, 55);
      if (s.fuente !== 'sensor') s.fuente = 'puntero';
    } else if (!punt.activo && s.fuente === 'puntero') {
      // al soltar vuelve poco a poco a la vertical
      punt.roll *= Math.exp(-dt * 0.5); punt.pitch *= Math.exp(-dt * 0.5);
    }

    if (s.fuente === 'sensor' && ahora - ultimoSensor < 1500) {
      objetivoG.copy(gCruda);
      rx.makeRotationX(-s.calibracion);
      objetivoG.applyMatrix4(rx).normalize();
    } else {
      const r = rad(punt.roll), p = rad(punt.pitch);
      objetivoG.set(Math.sin(r) * Math.cos(p), -Math.cos(r) * Math.cos(p), Math.sin(p));
    }
    // suavizado ligero (los sensores son ruidosos); la dinámica del agua añade su propia inercia.
    // Tras rotar la pantalla, más suave para que el salto de 90° del marco no lance el agua ni el barco.
    const enTransicion = transicion > 0;
    transicion = Math.max(0, transicion - dt);
    if (calibrarTras > 0) { calibrarTras -= dt; if (calibrarTras <= 0) calibrar = true; }
    // En la transición, dos etapas encadenadas: el giro arranca y frena suave en lugar de empezar a toda velocidad.
    const k = 1 - Math.exp(-dt * (enTransicion ? 4 : 22));
    gFiltro.lerp(objetivoG, k).normalize();
    s.g.lerp(gFiltro, enTransicion ? k : 1).normalize();

    // energía de sacudida: variación angular rápida + aceleración lineal
    const dg = enTransicion ? 0 : s.g.distanceTo(anteriorG) / Math.max(dt, 1e-3);
    anteriorG.copy(s.g);
    const a = aCruda.length();
    s.acel.copy(aCruda);
    const e = clamp(dg * 0.25 + a * 0.04 + (punt.activo ? (Math.abs(punt.vx) + Math.abs(punt.vy)) * 0.02 : 0), 0, 1.5);
    s.sacudida += (e - s.sacudida) * (1 - Math.exp(-dt * (e > s.sacudida ? 12 : 1.6)));
    punt.vx *= 0.8; punt.vy *= 0.8;
    tPrev = ahora;
  };

  return s;
}
