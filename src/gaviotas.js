// Gaviotas dentro de la botella: con buen tiempo vuelan alrededor del barco, entre los palos, alternando aleteos y
// planeos, inclinándose en los giros y dejándose llevar por el viento. Con lluvia, tormenta, nieve o de noche bajan
// a posarse en el barco (y se mecen con él) hasta que escampa. De vez en cuando graznan (si hay sonido).
import * as THREE from 'three';
import { BASE_INT_X, CORCHO_INT_X } from './bottle.js';

const al = (a, b) => a + Math.random() * (b - a);
const suave = (x) => x * x * (3 - 2 * x);

// Una gaviota de unos 0,8 de envergadura: cuerpo, cabeza, pico, cola y alas de dos tramos (brazo y mano) que se
// doblan por el codo; puntas negras. Mira hacia +X, arriba +Y, alas hacia ±Z.
function crearModelo() {
  const blanco = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.8 });
  const gris = new THREE.MeshStandardMaterial({ color: 0xa9b0b8, roughness: 0.75, side: THREE.DoubleSide });
  const negro = new THREE.MeshStandardMaterial({ color: 0x1d1d1f, roughness: 0.7, side: THREE.DoubleSide });
  const amarillo = new THREE.MeshStandardMaterial({ color: 0xe8b828, roughness: 0.6 });
  const g = new THREE.Group();
  const cuerpo = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), blanco);
  cuerpo.scale.set(0.2, 0.055, 0.06);
  const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.048, 10, 8), blanco);
  cabeza.position.set(0.19, 0.03, 0);
  const pico = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.07, 6), amarillo);
  pico.rotation.z = -Math.PI / 2; pico.position.set(0.255, 0.022, 0);
  const geoCola = new THREE.BufferGeometry();
  geoCola.setAttribute('position', new THREE.Float32BufferAttribute([-0.12, 0.01, 0, -0.27, 0.0, 0.055, -0.27, 0.0, -0.055], 3));
  geoCola.computeVertexNormals();
  const cola = new THREE.Mesh(geoCola, new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.8, side: THREE.DoubleSide }));
  g.add(cuerpo, cabeza, pico, cola);
  // ala: brazo (del hombro al codo) y mano (del codo a la punta), como láminas
  const lamina = (pts) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    geo.computeVertexNormals();
    return geo;
  };
  const alas = [];
  for (const s of [1, -1]) {
    const hombro = new THREE.Group(); hombro.position.set(0.04, 0.02, 0.04 * s);
    const brazo = new THREE.Mesh(lamina([0.06, 0, 0, -0.07, 0, 0, -0.05, 0, 0.19 * s, 0.06, 0, 0, -0.05, 0, 0.19 * s, 0.07, 0, 0.19 * s]), gris);
    const codo = new THREE.Group(); codo.position.set(0, 0, 0.19 * s);
    const mano = new THREE.Mesh(lamina([0.07, 0, 0, -0.05, 0, 0, -0.06, 0, 0.13 * s, 0.07, 0, 0, -0.06, 0, 0.13 * s, 0.0, 0, 0.13 * s]), gris);
    const punta = new THREE.Mesh(lamina([0.0, 0.001, 0.13 * s, -0.06, 0.001, 0.13 * s, -0.03, 0.001, 0.22 * s]), negro);
    codo.add(mano, punta); hombro.add(brazo, codo); g.add(hombro);
    alas.push({ hombro, codo, s });
  }
  // poner las alas: subida del brazo y de la mano (rad), y cuánto se pliegan hacia atrás (0 extendida, 1 plegada)
  g.userData.alas = (brazo, mano, plegado = 0) => {
    for (const { hombro, codo, s } of alas) {
      hombro.rotation.set(-brazo * s, plegado * 1.2 * s, 0);
      codo.rotation.set(-mano * s, plegado * 2.2 * s, 0);
      codo.scale.setScalar(1 - 0.35 * plegado);
    }
  };
  g.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  return g;
}

// Sitios donde posarse en un barco (en su marco): se lanzan rayos desde arriba y se queda el primer punto de madera
// (castillos, vergas, cofas), sin contar velas, banderas ni cabos. Se calcula una vez por barco.
const cachePerchas = new WeakMap();
function perchasDe(barco) {
  if (cachePerchas.has(barco)) return cachePerchas.get(barco);
  const g = barco.grupo, I = barco.info || {};
  g.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
  const mallas = g.children.filter((o) => o.isMesh);
  const rc = new THREE.Raycaster();
  const popa = I.popa ?? -4, proa = I.proa ?? 4, alto = (I.alturaMax ?? 6) + 1;
  const lista = [];
  for (const [fx, z] of [[0.12, 0.25], [0.5, -0.35], [0.78, 0.3], [0.3, -0.3], [0.62, 0.35], [0.9, 0]]) {
    const o = new THREE.Vector3(popa + (proa - popa) * fx, alto, z).applyMatrix4(g.matrixWorld);
    const d = new THREE.Vector3(0, -1, 0).transformDirection(g.matrixWorld);
    rc.set(o, d);
    for (const h of rc.intersectObjects(mallas, false)) {
      const at = h.object.geometry.attributes, i = h.face.a;
      const tela = at._empuje || at._ondeo;
      const cabo = at._cabo && (at._cabo.getX(i) || at._cabo.getY(i) || at._cabo.getZ(i));
      if (tela || cabo) continue;
      const p = h.point.clone().applyMatrix4(inv);
      if (p.y > 0.3) lista.push([p.x, p.y + 0.06, p.z]);
      break;
    }
  }
  if (!lista.length) lista.push([0, I.cubierta ?? 1.2, 0]);
  cachePerchas.set(barco, lista);
  return lista;
}

export function crearGaviotas({ escena, agua, botella, cantidad = 3 }) {
  const f = agua.estado;
  const M = new THREE.Matrix4(), X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3();
  const P = new THREE.Vector3(), Q = new THREE.Vector3(), R = new THREE.Vector3(), Y2 = new THREE.Vector3(), Z2 = new THREE.Vector3(), N = new THREE.Vector3();
  const dentro = (p, m) => p.x > BASE_INT_X + m && p.x < CORCHO_INT_X - m && Math.hypot(p.y, p.z) < botella.rIn(p.x) - m;

  const aves = [];
  for (let i = 0; i < cantidad; i++) {
    const modelo = crearModelo();
    modelo.matrixAutoUpdate = false;
    escena.add(modelo);
    aves.push({
      modelo,
      s: al(0, 6.28), vel: al(0.22, 0.3),                      // posición en su vuelta (rad) y velocidad angular
      a: al(5.5, 8), b: al(1.3, 2.4), h: al(2.6, 4.2),          // semiejes de la vuelta y altura sobre el agua
      fase: al(0, 6.28), aleteo: 0, plan: al(1, 4),              // aleteo: 0 planea, 1 aletea; plan: segundos que le quedan
      posado: 0,                                                 // 0 volando, 1 posada (con transición)
      percha: i,                                                 // en cuál de las perchas del barco se posa
      p: new THREE.Vector3(), dir: new THREE.Vector3(1, 0, 0), alabeo: 0,
      escala: 1,                                                 // la vuelta se encoge si no cabe (botella de pie)
    });
  }

  // punto de la vuelta k de un ave en el marco de la botella, alrededor del barco y siempre dentro del cristal
  function vuelta(av, s, centroU, centroV, t, out, e = av.escala, ajustar = true) {
    const u = centroU + Math.cos(s) * av.a * e * (1 + 0.12 * Math.sin(s * 2 + av.fase));
    const v = centroV + Math.sin(s) * av.b * e;
    const h = av.h + 0.5 * Math.sin(s * 3 + av.fase) + 0.25 * Math.sin(t * 0.4 + av.fase);
    out.copy(f.e1).multiplyScalar(u).addScaledVector(f.e2, v).addScaledVector(f.n, f.d + h);
    // si se sale (la botella inclinada deja menos sitio), se acerca al centro de la vuelta y baja
    for (let k = 0; ajustar && k < 12 && !dentro(out, 0.7); k++) {
      R.copy(f.e1).multiplyScalar(centroU).addScaledVector(f.e2, centroV).addScaledVector(f.n, f.d + 2.2);
      out.lerp(R, 0.18);
    }
    return out;
  }

  let proximoGraznido = al(4, 10);
  // clima: parámetros del clima; barco: el barco actual (grupo y medidas); graznar(): sonido
  function actualizar(dt, t, { clima, barco, centroU = 0, centroV = 0, viento = 0.2, graznar } = {}) {
    const malTiempo = clima.lluvia > 0.25 || clima.tormenta > 0.1 || clima.nieve > 0.3 || clima.noche > 0.6;
    const perchas = perchasDe(barco);
    let volando = 0;
    for (const av of aves) {
      // posarse o echar a volar, con transición de 3 s (cada una a su ritmo)
      const objetivo = malTiempo ? 1 : 0;
      av.posado += Math.sign(objetivo - av.posado) * Math.min(Math.abs(objetivo - av.posado), dt / (2.5 + av.fase * 0.15));
      const k = suave(av.posado);

      // tamaño de vuelta que cabe ahora en la botella (búsqueda por bisección en 8 puntos), cambiando sin saltos
      let lo = 0.1, hi = 1;
      const cabe = (e) => { for (let j = 0; j < 16; j++) if (!dentro(vuelta(av, j * 0.3927, centroU, centroV, t, R, e, false), 0.95)) return false; return true; };
      if (cabe(1)) lo = 1; else for (let it = 0; it < 6; it++) { const m = (lo + hi) / 2; if (cabe(m)) lo = m; else hi = m; }
      av.escala += (lo - av.escala) * Math.min(1, dt * (lo < av.escala ? 5 : 1));
      // vuelo: avanza por su vuelta, más deprisa con viento de cola; aletea a ratos y planea
      av.s += dt * av.vel * (1 + 0.25 * viento * Math.sin(av.s));
      av.plan -= dt;
      if (av.plan <= 0) { av.aleteo = av.aleteo > 0.5 ? 0 : 1; av.plan = av.aleteo ? al(0.8, 2.2) : al(1.5, 4.5); }
      av.fase += dt * (av.aleteo > 0.5 ? 13 : 0);
      vuelta(av, av.s, centroU, centroV, t, P);
      vuelta(av, av.s + 0.05, centroU, centroV, t, Q);
      Q.sub(P).normalize();
      // alabeo hacia dentro del giro (cambio de dirección)
      const giro = N.crossVectors(av.dir, Q).dot(f.n);
      av.alabeo += (THREE.MathUtils.clamp(giro * 18, -0.7, 0.7) - av.alabeo) * Math.min(1, dt * 3);
      av.dir.copy(Q);

      // percha en el barco (marco de la botella)
      const pc = perchas[av.percha % perchas.length];
      const percha = Q.set(pc[0], pc[1], pc[2]).applyMatrix4(barco.grupo.matrix);
      // posición: del vuelo a la percha por un arco (baja planeando)
      R.copy(P).lerp(percha, k);
      if (k > 0 && k < 1) R.addScaledVector(f.n, Math.sin(k * Math.PI) * 0.8);
      // posada sigue al barco tal cual; en vuelo va hacia su punto sin pasar de 5 unidades/s (si la botella gira de
      // golpe y su vuelta cambia de sitio, vuela hasta ella en vez de saltar)
      if (k >= 1 || !av.iniciada) { av.p.copy(R); av.iniciada = true; } else {
        const dist = av.p.distanceTo(R), paso = dt * 5;
        av.p.lerp(R, dist > paso ? paso / dist : 1);
      }

      // orientación: adelante = dirección de vuelo (posada: la del barco); arriba = vertical; alabeo en vuelo
      X.set(1, 0, 0).transformDirection(barco.grupo.matrix).lerp(av.dir, 1 - k).normalize();
      Y.copy(f.n);
      X.addScaledVector(Y, -X.dot(Y)).normalize();
      Z.crossVectors(X, Y);
      const ca = Math.cos(av.alabeo * (1 - k)), sa = Math.sin(av.alabeo * (1 - k));
      Y2.copy(Y).multiplyScalar(ca).addScaledVector(Z, sa); Z2.copy(Z).multiplyScalar(ca).addScaledVector(Y, -sa);
      M.makeBasis(X, Y2, Z2).setPosition(av.p);
      av.modelo.matrix.copy(M);
      av.modelo.matrixWorldNeedsUpdate = true;

      // alas: aleteo (el brazo sube y baja, la mano le sigue con retraso), planeo en «M» y plegadas al posarse
      const fl = av.aleteo > 0.5 ? 1 : 0;
      const brazo = fl ? 0.6 * Math.sin(av.fase) + 0.15 : 0.32 + 0.04 * Math.sin(t * 2 + av.fase);
      const mano = fl ? 0.5 * Math.sin(av.fase - 0.7) - 0.1 : -0.42;
      const pl = suave(Math.min(1, Math.max(0, (k - 0.75) / 0.25)));
      av.modelo.userData.alas(brazo * (1 - pl) + 0.05 * pl, mano * (1 - pl) - 0.1 * pl, pl);
      if (k < 0.5) volando++;
    }
    // graznidos de vez en cuando, solo si vuelan
    proximoGraznido -= dt;
    if (proximoGraznido <= 0) {
      proximoGraznido = al(7, 18);
      if (volando > 0 && graznar) graznar();
    }
  }
  return { actualizar, aves };
}
