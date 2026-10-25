// Gaviotas dentro de la botella. Vuelo libre: cada una elige adónde ir (a los lados del barco, rodeándolo por
// proa o popa, nunca a través de las velas) y gira con curvas suaves; al subir aletea y pierde velocidad, al bajar
// planea y acelera, y el cuerpo se inclina con la subida y en los giros. El aleteo baja el ala más deprisa de lo que
// la sube (y la recoge un poco al subirla); entre aleteos, planeos largos en «M». Con viento se cierne a ratos: casi
// quieta, cara al viento, corrigiendo con las alas. Las dos van juntas sin ir pegadas: a veces una persigue a la otra.
// Con lluvia, tormenta, nieve o de noche baja planeando a posarse en el barco (y se mece con él) hasta que escampa.
// De vez en cuando graznan (si hay sonido).
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

// pececillo plateado que la gaviota lleva atravesado en el pico
function crearPez() {
  const g = new THREE.Group();
  const plata = new THREE.MeshStandardMaterial({ color: 0xc9d3dc, roughness: 0.25, metalness: 0.6, side: THREE.DoubleSide });
  const cuerpo = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), plata);
  cuerpo.scale.set(0.012, 0.016, 0.06);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.055, 0, 0.025, -0.09, 0, -0.025, -0.09], 3));
  geo.computeVertexNormals();
  const cola = new THREE.Mesh(geo, plata);
  g.add(cuerpo, cola);
  g.position.set(0.27, 0.015, 0.0);
  g.visible = false;
  return g;
}

export function crearGaviotas({ escena, agua, botella, cantidad = 2 }) {
  const f = agua.estado;
  const dentro = (p, m) => p.x > BASE_INT_X + m && p.x < CORCHO_INT_X - m && Math.hypot(p.y, p.z) < botella.rIn(p.x) - m;
  const aMundo = (u, v, h, out) => out.copy(f.e1).multiplyScalar(u).addScaledVector(f.e2, v).addScaledVector(f.n, f.d + h);
  const altura = (p) => p.dot(f.n) - f.d;
  const M = new THREE.Matrix4(), inv = new THREE.Matrix4(), R4 = new THREE.Matrix4();
  const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(), A = new THREE.Vector3(), B = new THREE.Vector3(), L = new THREE.Vector3();
  const lim = (v, m) => { const l = v.length(); if (l > m) v.multiplyScalar(m / l); return v; };

  const aves = [];
  for (let i = 0; i < cantidad; i++) {
    const modelo = crearModelo(), pez = crearPez();
    modelo.add(pez);
    modelo.matrixAutoUpdate = false;
    escena.add(modelo);
    aves.push({
      i, modelo, pez, p: new THREE.Vector3(), vel: new THREE.Vector3(), acc: new THREE.Vector3(),
      modo: 'vuelo',            // vuelo | cernido | pesca | aPercha | posada | despegue
      ruta: [],                 // puntos por los que pasar (el último es el destino)
      tModo: 0, siguiendo: null,
      aletea: true, tAleteo: al(1, 2), fase: al(0, 1),
      alabeo: 0, cabeceo: 0, adelante: new THREE.Vector3(1, 0, 0),
      percha: i, tPez: 0, aterriza: 0, desde: new THREE.Vector3(),
    });
  }
  let iniciado = false, proximaPesca = al(15, 30), proximoGraznido = al(4, 10);

  // ---- rutas: destinos a un lado u otro del barco; si el destino está al otro lado, antes se rodea por proa o popa
  function nuevaRuta(av, ctx) {
    const { cu, cv, barco } = ctx;
    av.ruta.length = 0; av.siguiendo = null;
    const otra = aves.find((o) => o !== av);
    // perseguir a la otra, solo si va por el mismo lado del barco
    const lado = (q) => Math.sign(L.copy(q).applyMatrix4(inv).z);
    if (otra && otra.modo === 'vuelo' && lado(otra.p) === lado(av.p) && Math.random() < 0.35) { av.siguiendo = otra; av.tModo = al(3, 6); return; }
    const D = new THREE.Vector3();
    let ok = false;
    for (let k = 0; k < 25 && !ok; k++) {
      const esc = 1 - k * 0.035;
      aMundo(cu + al(-9, 9) * esc, cv + (Math.random() < 0.5 ? -1 : 1) * al(1.9, 3.6) * esc, al(1.6, 4.2), D);
      ok = dentro(D, 1.1);
    }
    if (!ok) aMundo(cu, cv, 2.0, D);
    // ¿al otro lado del barco? (en el marco del barco: z)
    A.copy(av.p).applyMatrix4(inv); B.copy(D).applyMatrix4(inv);
    const I = barco.info || {};
    if (Math.sign(A.z) !== Math.sign(B.z) && Math.abs(A.z) < 4 && Math.abs(B.z) < 4) {
      const extremo = (A.x + B.x) / 2 > ((I.proa ?? 4) + (I.popa ?? -4)) / 2 ? (I.proa ?? 4) + 1.6 : (I.popa ?? -4) - 1.6;
      const R = new THREE.Vector3(extremo, Math.min(A.y, 3.2), 0).applyMatrix4(barco.grupo.matrix);
      if (dentro(R, 1.0)) av.ruta.push(R);
    }
    av.ruta.push(D);
    av.tModo = al(5, 9);
  }

  // ---- fuerzas de vuelo hacia un punto (llegando despacio si 'frenar'), apartándose del barco, del cristal y del agua
  function guiar(av, destino, velDeseada, dt, ctx, { frenar = false, evitarBarco = true, suelo = 1.0 } = {}) {
    const d = A.copy(destino).sub(av.p), dist = d.length();
    let vd = velDeseada;
    if (frenar) vd = Math.min(vd, dist * 1.4 + 0.15);
    // al subir se pierde velocidad; al bajar se gana
    const sube = av.vel.lengthSq() > 1e-4 ? av.vel.dot(f.n) / av.vel.length() : 0;
    vd *= 1 - 0.35 * Math.max(0, sube) + 0.45 * Math.max(0, -sube);
    const deseada = d.normalize().multiplyScalar(vd);
    av.acc.copy(deseada).sub(av.vel).multiplyScalar(1.8);
    if (evitarBarco) {
      // al acercarse al barco (con vergas), se desvía de lado antes de llegar
      const I = ctx.barco.info || {};
      L.copy(av.p).addScaledVector(av.vel, 0.6).applyMatrix4(inv);
      const dentroX = L.x > (I.popa ?? -4) - 0.8 && L.x < (I.proa ?? 4) + 0.8, fuera = Math.abs(L.z) - 2.4;
      if (dentroX && fuera < 0 && L.y < (I.alturaMax ?? 6) + 0.5) av.acc.add(B.set(0, 0, Math.sign(L.z || 1)).transformDirection(ctx.barco.grupo.matrix).multiplyScalar(-fuera * 6));
    }
    // el cristal: hacia el eje de la botella
    if (!dentro(av.p, 1.2)) av.acc.add(B.set(0, -av.p.y, -av.p.z).normalize().multiplyScalar(7)).add(B.set(-Math.sign(av.p.x) * (Math.abs(av.p.x) > 11 ? 5 : 0), 0, 0));
    // el agua
    const h = altura(av.p);
    if (h < suelo) av.acc.addScaledVector(f.n, (suelo - h) * 8);
    lim(av.acc, 6);
    av.vel.addScaledVector(av.acc, dt);
    if (evitarBarco) apartarDelBarco(av, ctx, dt);
    return dist;
  }

  // dentro de la caja del barco no se entra: se quita la velocidad hacia dentro y se empuja hacia el costado más cercano
  function apartarDelBarco(av, ctx, dt) {
    const I = ctx.barco.info || {};
    L.copy(av.p).applyMatrix4(inv);
    const dentroX = L.x > (I.popa ?? -4) - 0.3 && L.x < (I.proa ?? 4) + 0.3, fuera = Math.abs(L.z) - 2.0;
    if (!dentroX || fuera >= 0 || L.y > (I.alturaMax ?? 6) + 0.3) return;
    B.set(0, 0, Math.sign(L.z || 1)).transformDirection(ctx.barco.grupo.matrix);
    const hacia = av.vel.dot(B);
    if (hacia < 0) av.vel.addScaledVector(B, -hacia);
    av.vel.addScaledVector(B, Math.min(3, -fuera * 4) * dt * 4);
  }

  function mover(av, dt, vMin, vMax, suelo = 0.5) {
    const v = av.vel.length();
    if (v > vMax) av.vel.multiplyScalar(vMax / v);
    else if (v < vMin && v > 1e-4) av.vel.multiplyScalar(vMin / v);
    av.p.addScaledVector(av.vel, dt);
    // nunca por debajo del agua (si la botella gira, el agua sube y ella sube con ella)
    const h = altura(av.p);
    if (h < suelo) { av.p.addScaledVector(f.n, Math.min(suelo - h, dt * 8)); const b = av.vel.dot(f.n); if (b < 0) av.vel.addScaledVector(f.n, -b); }
    // nunca fuera del cristal
    for (let k = 0; k < 10 && !dentro(av.p, 0.6); k++) { B.set(av.p.x * 0.97, av.p.y * 0.9, av.p.z * 0.9); av.p.lerp(B, 0.5); }
  }

  // aleteo: decide aletear (subiendo, despacio o acelerando) o planear, con un mínimo de tiempo en cada cosa
  function decidirAleteo(av, dt, forzar = null) {
    av.tAleteo -= dt;
    const v = av.vel.length(), sube = v > 1e-3 ? av.vel.dot(f.n) / v : 0;
    const necesita = sube > 0.2 || v < 1.8 || av.acc.dot(av.vel) / Math.max(v, 1e-3) > 1.5;
    if (forzar !== null) { av.aletea = forzar; return; }
    if (av.tAleteo <= 0) {
      if (av.aletea && !necesita) { av.aletea = false; av.tAleteo = al(1.5, 4); }
      else if (!av.aletea && (necesita || Math.random() < 0.15)) { av.aletea = true; av.tAleteo = al(0.8, 2); }
      else av.tAleteo = 0.4;
    }
  }

  function actualizar(dt, t, { clima, barco, centroU = 0, centroV = 0, viento = 0.2, dirViento = 0, graznar, alZambullir } = {}) {
    if (!dt) return;
    const malTiempo = clima.lluvia > 0.25 || clima.tormenta > 0.1 || clima.nieve > 0.3 || clima.noche > 0.6;
    inv.copy(barco.grupo.matrix).invert();
    const ctx = { cu: centroU, cv: centroV, barco };
    const perchas = perchasDe(barco);
    // de dónde viene el viento: las olas y el viento van hacia -e1, así que se mira hacia +e1 (girado por dirViento)
    const barlovento = B.copy(f.e1).multiplyScalar(Math.cos(dirViento)).addScaledVector(f.e2, Math.sin(dirViento)).clone();
    if (!iniciado) {
      iniciado = true;
      for (const av of aves) {
        aMundo(centroU + (av.i ? 5 : -5), centroV + (av.i ? 2.6 : -2.6), 3, av.p);
        av.vel.copy(f.e1).multiplyScalar(av.i ? -2.4 : 2.4);
        if (malTiempo) { av.modo = 'posada'; }
        nuevaRuta(av, ctx);
      }
    }
    let volando = 0;
    for (const av of aves) {
      const pc = perchas[av.percha % perchas.length];
      const percha = X.set(pc[0], pc[1], pc[2]).applyMatrix4(barco.grupo.matrix).clone();
      if (malTiempo && av.modo !== 'posada' && av.modo !== 'aPercha') { av.modo = 'aPercha'; av.aterriza = 0; av.pez.visible = false; }
      if (!malTiempo && (av.modo === 'posada' || av.modo === 'aPercha')) {
        av.modo = 'despegue'; av.tModo = 1.2;
        av.vel.copy(f.n).multiplyScalar(1.6).addScaledVector(X.set(1, 0, 0).transformDirection(barco.grupo.matrix), 1.4);
      }
      av.tModo -= dt;
      let plegado = 0, mirar = null, aleteoRapido = 1;

      if (av.modo === 'posada') {
        av.p.copy(percha); av.vel.set(0, 0, 0);
        mirar = X.set(1, 0, 0).transformDirection(barco.grupo.matrix).multiplyScalar(av.i % 2 ? 1 : -1);
        plegado = 1;
      } else if (av.modo === 'aPercha') {
        const dist = av.p.distanceTo(percha);
        if (dist > 0.6 && av.aterriza === 0) {
          guiar(av, percha, 2.6, dt, ctx, { frenar: true, evitarBarco: dist > 3, suelo: 0.5 });
          mover(av, dt, 0.4, 3.5);
          decidirAleteo(av, dt);
        } else {
          // toma de tierra: frena con las alas arriba y aleteando, y se posa
          if (av.aterriza === 0) av.desde.copy(av.p);
          av.aterriza = Math.min(1, av.aterriza + dt / 0.7);
          const k = suave(av.aterriza);
          av.p.copy(av.desde).lerp(percha, k).addScaledVector(f.n, Math.sin(k * Math.PI) * 0.15);
          av.vel.copy(percha).sub(av.desde).multiplyScalar(1 - k);
          av.aletea = true; aleteoRapido = 1.5;
          av.cabeceo = 0.6 * (1 - k);
          if (av.aterriza >= 1) av.modo = 'posada';
        }
      } else if (av.modo === 'despegue') {
        av.aletea = true; aleteoRapido = 1.3;
        av.vel.addScaledVector(f.n, 1.5 * dt);
        mover(av, dt, 1.0, 3);
        if (av.tModo <= 0) { av.modo = 'vuelo'; nuevaRuta(av, ctx); }
      } else if (av.modo === 'cernido') {
        // casi quieta cara al viento, subiendo y bajando un poco y corrigiendo
        const objetivo = A.copy(av.ruta[0] || av.p).addScaledVector(f.n, 0.12 * Math.sin(t * 1.3 + av.i));
        av.vel.lerp(B.copy(objetivo).sub(av.p).multiplyScalar(1.5), Math.min(1, dt * 2));
        mover(av, dt, 0, 1);
        mirar = barlovento;
        av.aletea = Math.sin(t * 0.9 + av.i * 2) > 0.85; aleteoRapido = 1.2;
        if (av.tModo <= 0 || viento < 0.25) { av.modo = 'vuelo'; nuevaRuta(av, ctx); }
      } else if (av.modo === 'pesca') {
        // picado hasta el agua con las alas medio plegadas; al tocarla, salpica, coge el pez y sube aleteando
        const destino = av.ruta[0];
        const hAgua = agua.alturaEn(destino.dot(f.e1), destino.dot(f.e2), t);
        const objetivo = A.copy(destino).addScaledVector(f.n, hAgua + 0.05);
        guiar(av, objetivo, 4.8, dt, ctx, { suelo: -1 });
        mover(av, dt, 1.5, 5.2, -1);
        av.aletea = false; plegado = Math.min(0.7, 0.2 + (1.5 - Math.min(1.5, av.p.distanceTo(objetivo))) * 0.5);
        if (altura(av.p) < hAgua + 0.15 || av.tModo <= 0) {
          if (av.tModo > 0) { alZambullir?.(av.p.clone(), av.p.dot(f.e1), av.p.dot(f.e2)); av.pez.visible = true; av.tPez = al(4, 6); }
          av.modo = 'despegue'; av.tModo = 1.4;
          av.vel.multiplyScalar(0.4).addScaledVector(f.n, 2.2);
        }
      } else {
        // vuelo libre
        if (av.siguiendo) {
          const o = av.siguiendo;
          A.copy(o.p).addScaledVector(o.vel, -0.6).addScaledVector(f.n, 0.2 * Math.sin(t + av.i));
          guiar(av, A, 2.9, dt, ctx);
          if (av.tModo <= 0 || o.modo !== 'vuelo' || Math.sign(L.copy(o.p).applyMatrix4(inv).z) !== Math.sign(B.copy(av.p).applyMatrix4(inv).z)) nuevaRuta(av, ctx);
        } else {
          const dist = guiar(av, av.ruta[0], 2.5, dt, ctx);
          if (dist < 1.3) { av.ruta.shift(); if (!av.ruta.length) nuevaRuta(av, ctx); }
          if (av.tModo <= 0) nuevaRuta(av, ctx);
        }
        mover(av, dt, 1.2, 4.2);
        decidirAleteo(av, dt);
        // cernerse con viento, a ratos
        if (viento > 0.3 && Math.random() < dt * 0.06 && altura(av.p) > 2) {
          av.modo = 'cernido'; av.tModo = al(3, 6); av.ruta = [av.p.clone()];
        }
      }
      if (av.modo !== 'posada') volando++;

      // pez en el pico: coletea y al rato se lo traga
      if (av.pez.visible) {
        av.tPez -= dt;
        av.pez.rotation.set(0, Math.PI / 2 + Math.sin(t * 17) * 0.5 * Math.min(1, av.tPez / 2), 0);
        if (av.tPez <= 0) av.pez.visible = false;
      }

      // ---- orientación: adelante (vuelo o lo que mire), cabeceo con la subida y alabeo hacia dentro del giro
      const v = av.vel.length();
      if (mirar) X.copy(mirar); else if (v > 0.2) X.copy(av.vel).normalize(); else X.copy(av.adelante);
      X.addScaledVector(f.n, -X.dot(f.n));
      if (X.lengthSq() < 1e-6) X.copy(av.adelante);
      X.normalize();
      av.adelante.lerp(X, Math.min(1, dt * 6)).normalize();
      X.copy(av.adelante);
      Y.copy(f.n);
      Z.crossVectors(X, Y);
      const lateral = av.modo === 'posada' ? 0 : av.acc.dot(Z);
      av.alabeo += (THREE.MathUtils.clamp(lateral * 0.13, -0.6, 0.6) - av.alabeo) * Math.min(1, dt * 4);
      if (av.modo !== 'aPercha' || av.aterriza === 0) {
        const sube = v > 0.3 ? av.vel.dot(f.n) / v : 0;
        const objetivo = av.modo === 'cernido' ? 0.25 : av.modo === 'posada' ? 0.05 : THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(sube, -1, 1)) * 0.7, -0.45, 0.4);
        av.cabeceo += (objetivo - av.cabeceo) * Math.min(1, dt * 4);
      }
      M.makeBasis(X, Y, Z);
      M.multiply(R4.makeRotationX(av.alabeo)).multiply(R4.makeRotationZ(av.cabeceo));
      M.setPosition(av.p);
      av.modelo.matrix.copy(M);
      av.modelo.matrixWorldNeedsUpdate = true;

      // ---- alas
      let brazo, mano, pl = plegado;
      if (av.modo === 'posada') { brazo = 0.05; mano = -0.1; }
      else if (av.aletea) {
        av.fase += dt * 3.1 * aleteoRapido;
        const u = av.fase % 1;
        // bajada rápida (40 % del ciclo) y subida lenta con el ala algo recogida
        if (u < 0.4) { const k = suave(u / 0.4); brazo = 0.75 - 1.2 * k; mano = 0.5 - 1.0 * k; pl = Math.max(pl, 0.0); }
        else { const k = suave((u - 0.4) / 0.6); brazo = -0.45 + 1.2 * k; mano = -0.5 + 1.0 * k - 0.3 * Math.sin(k * Math.PI); pl = Math.max(pl, 0.3 * Math.sin(k * Math.PI)); }
      } else {
        // planeo en «M», con pequeñas correcciones (más con viento o cerniéndose)
        const c = (av.modo === 'cernido' ? 0.12 : 0.04) * (0.5 + viento);
        brazo = 0.3 + c * Math.sin(t * 5.3 + av.i); mano = -0.42 + c * Math.sin(t * 4.1 + 1 + av.i);
      }
      av.modelo.userData.alas(brazo, mano, pl);
    }

    // la pesca: de vez en cuando una gaviota en vuelo libre se tira al agua a por un pez (sorpresa)
    proximaPesca -= dt;
    if (proximaPesca <= 0) {
      proximaPesca = al(20, 45);
      const av = aves.find((a) => a.modo === 'vuelo' && !a.pez.visible);
      if (av && !malTiempo) {
        // un punto del agua delante de ella, a un lado del barco
        const D = new THREE.Vector3();
        let ok = false;
        for (let k = 0; k < 15 && !ok; k++) {
          aMundo(av.p.dot(f.e1) + av.vel.dot(f.e1) * 1.2 + al(-1, 1), centroV + Math.sign(av.p.dot(f.e2) - centroV || 1) * al(2, 3.5), 0, D);
          L.copy(D).applyMatrix4(inv);
          ok = dentro(D, 0.9) && Math.abs(L.z) > 2.2;
        }
        if (ok) { av.modo = 'pesca'; av.ruta = [D]; av.tModo = 4; av.siguiendo = null; }
      }
    }
    // graznidos de vez en cuando, solo si vuelan (y no con el pico lleno)
    proximoGraznido -= dt;
    if (proximoGraznido <= 0) {
      proximoGraznido = al(7, 18);
      if (volando > 0 && graznar && !aves.every((a) => a.pez.visible)) graznar();
    }
  }
  // pescar(): adelanta la próxima pesca (para las pruebas)
  return { actualizar, aves, pescar: () => { proximaPesca = 0; } };
}
