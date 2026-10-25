// Una botellita con un mensaje dentro, flotando en el agua de la botella: la llevan las olas y el viento, cabecea
// con ellas, se aparta del barco y no sale del agua. Si se toca, se lee el mensaje (ui.js lo muestra).
import * as THREE from 'three';
import { BASE_INT_X, CORCHO_INT_X } from './bottle.js';

const MENSAJES = [
  'Mar en calma nunca hizo buen marinero.',
  'A barco nuevo, capitán viejo.',
  'Quien no se arriesga no pasa la mar.',
  'Después de la tormenta siempre llega la calma.',
  'No hay viento favorable para quien no sabe adónde va.',
  'Si encuentras esta botella, el capitán te manda saludos desde el galeón.',
  'Rumbo al oeste, con viento de popa y el corazón contento.',
  'Cada ola trae algo y cada marea se lleva algo.',
];

const al = (a, b) => a + Math.random() * (b - a);

export function crearBotellita({ escena, agua, botella }) {
  const f = agua.estado;
  const grupo = new THREE.Group();
  grupo.matrixAutoUpdate = false;

  // vidrio verdoso (perfil de revolución a lo largo de X), corcho y el papel enrollado dentro
  const perfil = [[0, -0.42], [0.13, -0.42], [0.155, -0.38], [0.16, 0.05], [0.12, 0.2], [0.065, 0.28], [0.06, 0.4], [0.07, 0.42], [0.0001, 0.42]]
    .map(([r, x]) => new THREE.Vector2(r, x));
  const geoVidrio = new THREE.LatheGeometry(perfil, 24);
  geoVidrio.rotateZ(-Math.PI / 2); // eje de la botellita: +X
  const vidrio = new THREE.Mesh(geoVidrio, new THREE.MeshPhysicalMaterial({
    color: 0x9fd6b0, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.5, envMapIntensity: 2.2,
    clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false,
  }));
  const corcho = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.11, 14), new THREE.MeshStandardMaterial({ color: 0xa47a4f, roughness: 0.95 }));
  corcho.rotation.z = -Math.PI / 2; corcho.position.x = 0.44;
  const matPapel = new THREE.MeshStandardMaterial({ color: 0xe8d9b0, roughness: 0.9, emissive: 0x3a2a12, emissiveIntensity: 0.25 });
  const papel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.42, 16), matPapel);
  papel.rotation.z = -Math.PI / 2; papel.position.x = -0.1;
  const lazo = new THREE.Mesh(new THREE.TorusGeometry(0.063, 0.012, 6, 16), new THREE.MeshStandardMaterial({ color: 0x8a2a1c, roughness: 0.7 }));
  lazo.rotation.y = Math.PI / 2; lazo.position.x = -0.1;
  vidrio.renderOrder = 3;
  for (const m of [papel, lazo, corcho, vidrio]) { m.frustumCulled = false; grupo.add(m); }
  const brillo = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, opacity: 0 }));
  brillo.position.set(0.05, 0.14, 0.05);
  grupo.add(brillo);
  escena.add(grupo);

  const ESC = 1.7; // tamaño: la botellita mide ~1,4 unidades (el barco, ~8)
  const est = { u: 2.5, v: 2.4, vu: 0, vv: 0, rumbo: al(0, 6.28), alto: 0, cab: 0, bal: 0, mensaje: Math.floor(Math.random() * MENSAJES.length) };
  const P = new THREE.Vector3(), fwd = new THREE.Vector3(), lat = new THREE.Vector3(), arriba = new THREE.Vector3();
  const M = new THREE.Matrix4(), R = new THREE.Matrix4();
  const centro = new THREE.Vector3();
  const dentro = (u, v) => {
    P.copy(f.e1).multiplyScalar(u).addScaledVector(f.e2, v).addScaledVector(f.n, f.d);
    return P.x > BASE_INT_X + 1.0 && P.x < CORCHO_INT_X - 4.5 && Math.hypot(P.y, P.z) < botella.rIn(P.x) - 0.8;
  };

  function actualizar(dt, t, { viento = 0.3, barcoU = 0, barcoV = 0, radioBarco = 3.5 } = {}) {
    // olas: se desliza cuesta abajo; el viento la empuja hacia -e1; un poco de deriva al azar
    const h = agua.alturaEn(est.u, est.v, t);
    const gu = (agua.alturaEn(est.u + 0.2, est.v, t) - h) / 0.2, gv = (agua.alturaEn(est.u, est.v + 0.2, t) - h) / 0.2;
    est.vu += (-gu * 1.6 - 0.18 * viento + Math.sin(t * 0.13) * 0.05) * dt;
    est.vv += (-gv * 1.6 + Math.cos(t * 0.17) * 0.05) * dt;
    // se aparta del barco
    const du = est.u - barcoU, dv = est.v - barcoV, d = Math.hypot(du, dv);
    if (d < radioBarco) { est.vu += du / (d + 1e-3) * (radioBarco - d) * 1.5 * dt; est.vv += dv / (d + 1e-3) * (radioBarco - d) * 1.5 * dt; }
    est.vu *= Math.exp(-dt * 0.9); est.vv *= Math.exp(-dt * 0.9);
    let nu = est.u + est.vu * dt, nv = est.v + est.vv * dt;
    if (!dentro(nu, nv)) {
      // rebota en el cristal; si el agua se ha movido (botella inclinada), se acerca al centro
      est.vu *= -0.4; est.vv *= -0.4;
      nu = est.u; nv = est.v;
      for (let k = 0; k < 20 && !dentro(nu, nv); k++) { nu *= 0.9; nv *= 0.9; }
    }
    est.u = nu; est.v = nv;
    est.rumbo += (est.vu * 0.3 + Math.sin(t * 0.21) * 0.04) * dt;
    est.alto += (h - est.alto) * Math.min(1, dt * 10);
    est.cab += (Math.atan(gu) * 0.8 + Math.sin(t * 1.7) * 0.05 - est.cab) * Math.min(1, dt * 5);
    est.bal += (Math.atan(gv) * 0.8 + Math.sin(t * 2.3 + 1) * 0.06 - est.bal) * Math.min(1, dt * 5);

    // colocar: medio hundida sobre el agua, cabeceando con ella
    const c = Math.cos(est.rumbo), s = Math.sin(est.rumbo);
    fwd.copy(f.e1).multiplyScalar(c).addScaledVector(f.e2, s);
    arriba.copy(f.n);
    lat.crossVectors(fwd, arriba);
    M.makeBasis(fwd, arriba, lat);
    R.makeRotationZ(est.cab); M.multiply(R); R.makeRotationX(est.bal); M.multiply(R); M.scale(P.setScalar(ESC));
    centro.copy(f.e1).multiplyScalar(est.u).addScaledVector(f.e2, est.v).addScaledVector(f.n, f.d + est.alto + 0.06);
    M.setPosition(centro);
    grupo.matrix.copy(M);
    grupo.matrixWorldNeedsUpdate = true;
    // de vez en cuando un destello en el cristal, para que se vea que ahí hay algo
    const fase = (t % 9) / 9;
    brillo.material.opacity = fase < 0.06 ? Math.sin(fase / 0.06 * Math.PI) * 0.9 : 0;
    brillo.scale.setScalar(1 + 3 * (fase < 0.06 ? Math.sin(fase / 0.06 * Math.PI) : 0));
  }

  // ¿toca este rayo (en el marco de la botella) la botellita? (con margen, para el dedo)
  const esfera = new THREE.Sphere(new THREE.Vector3(), 1.1);
  function tocada(rayo) {
    esfera.center.copy(centro);
    return rayo.intersectsSphere(esfera);
  }
  function leer() {
    const texto = MENSAJES[est.mensaje];
    est.mensaje = (est.mensaje + 1) % MENSAJES.length;
    return texto;
  }
  return { actualizar, tocada, leer, grupo, estado: est };
}
