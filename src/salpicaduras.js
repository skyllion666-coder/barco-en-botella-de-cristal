// Salpicaduras: gotas de agua que saltan de las crestas cuando rompen, de la proa cuando el barco golpea una ola y
// del agua que cae por la borda.
//
// Cada gota se dibuja como una pequeña lente de agua (no como un punto): refracta lo que hay detrás, invertido como
// en una gota real; refleja el entorno con Fresnel; tiene un brillo especular del sol y el borde algo más oscuro
// (ahí la luz se refleja por dentro). Las grandes se alargan en la dirección en que vuelan y tienen forma de lágrima;
// la pulverización fina es apenas un velo claro que se evapora.
// Se dibujan después del agua y antes del cristal delantero (canalizacion.js): así quedan dentro de la botella, se
// ven también delante de las olas, y lo que refractan es la escena ya compuesta (con el agua). Lo que tapa el barco
// se comprueba con la profundidad de la escena.
//
// Nacen en ráfagas en las crestas que rompen: una lámina corta a lo largo de la cresta que sale hacia delante y
// hacia arriba con la ola, de la que se desprenden pocas gotas grandes, algunas medianas y una pulverización de
// gotas pequeñas. Las ráfagas siguen a la cresta unas décimas de segundo y dejan filamentos de gotas en fila.
// Trayectorias balísticas con la gravedad de la botella y el rozamiento del aire (mucho mayor en las pequeñas, que
// se lleva el viento); al caer al agua desaparecen (las grandes dejan una onda) o al tocar el cristal.
import * as THREE from 'three';
import { BASE_INT_X, CORCHO_INT_X } from './bottle.js';

const MAX = 700;
const al = (a, b) => a + Math.random() * (b - a);

const VERT = /* glsl */`
  attribute vec3 iPos; attribute vec3 iVel; attribute vec4 iDat; // radio, opacidad, alargamiento máx., semilla
  uniform float uAltoPx;
  varying vec2 vUv; varying float vRadPx; varying float vOpa; varying vec3 vEjeX; varying vec3 vEjeY; varying float vZ; varying vec4 vClip;
  void main(){
    vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
    // dirección del vuelo en la vista: la gota se alarga a lo largo de ella (más si es grande y rápida)
    vec3 vv = (modelViewMatrix * vec4(iVel, 0.0)).xyz;
    vec2 d2 = vv.xy; float vel = length(d2);
    vec2 ex = vel > 1e-4 ? d2 / vel : vec2(1.0, 0.0);
    vec2 ey = vec2(-ex.y, ex.x);
    float largo = 1.0 + min(iDat.z, vel * 0.22 * iDat.z);
    float r = iDat.x;
    vec2 q = position.xy; // -1..1
    vec3 desp = vec3(ex * q.x * r * largo + ey * q.y * r, 0.0);
    // tamaño mínimo de ~1,2 px: las más pequeñas no desaparecen a medias, se ven como un velo
    float radPx = r * uAltoPx * projectionMatrix[1][1] * 0.5 / -mv.z;
    float k = max(1.0, 1.2 / max(radPx, 1e-3));
    mv.xyz += desp * k;
    vUv = vec2(q.x, q.y);
    vRadPx = radPx;
    vOpa = iDat.y / k; // si se agranda para verse, se aclara en proporción
    vEjeX = vec3(ex, 0.0); vEjeY = vec3(ey, 0.0);
    vZ = -mv.z;
    gl_Position = projectionMatrix * mv;
    vClip = gl_Position;
  }`;

const FRAG = /* glsl */`
  uniform sampler2D tFondo; uniform sampler2D tProf; uniform samplerCube tEntorno; uniform mat3 uEntornoRot;
  uniform mat3 uVistaAMundo; uniform vec3 uSolVista; uniform vec3 uLuz; uniform vec3 uBiolum;
  uniform float uNear; uniform float uFar; uniform vec2 uRes;
  varying vec2 vUv; varying float vRadPx; varying float vOpa; varying vec3 vEjeX; varying vec3 vEjeY; varying float vZ; varying vec4 vClip;
  void main(){
    // forma: lágrima (la cola, hacia atrás del vuelo, se afina)
    float x = vUv.x, y = vUv.y;
    float ancho = 1.0 - 0.45 * smoothstep(0.0, 1.0, -x) * smoothstep(-0.2, -1.0, x) - 0.25 * max(0.0, -x);
    float yy = y / max(ancho, 0.2);
    float r2 = x * x + yy * yy;
    if (r2 > 1.0) discard;
    vec2 uvP = vClip.xy / vClip.w * 0.5 + 0.5;
    // tapada por el barco (u otra cosa delante): profundidad de la escena
    float d = texture2D(tProf, uvP).r;
    float zEsc = 2.0 * uNear * uFar / (uFar + uNear - (d * 2.0 - 1.0) * (uFar - uNear));
    if (zEsc < vZ - 0.05) discard;
    // normal de la superficie de la gota (vista)
    float nz = sqrt(max(1.0 - r2, 0.0));
    vec3 N = normalize(vEjeX * x + vEjeY * yy + vec3(0.0, 0.0, nz));
    float F = 0.02 + 0.98 * pow(1.0 - nz, 5.0);
    // refracción: una gota es una lente gruesa; lo de detrás se ve encogido e invertido
    vec2 off = -(vEjeX.xy * x + vEjeY.xy * yy) * vRadPx * 2.6 / uRes;
    vec3 detras = texture2D(tFondo, uvP + off).rgb;
    vec3 alrededor = texture2D(tFondo, uvP).rgb;
    // reflejo del entorno (en el marco del mundo), brillo del sol y de la luz de arriba, y su foco de luz concentrada
    vec3 Rv = reflect(vec3(0.0, 0.0, -1.0), N);
    vec3 env = textureLod(tEntorno, uEntornoRot * (uVistaAMundo * Rv), 1.0).rgb * uLuz;
    vec3 arriba = normalize(vec3(-0.35, 0.9, 0.3));
    float spec = pow(max(dot(Rv, uSolVista), 0.0), 90.0) * 5.0 + pow(max(dot(Rv, arriba), 0.0), 40.0) * 1.6;
    vec2 foco = vec2(0.3, -0.45); // la gota enfoca la luz de arriba en su parte de abajo
    float caus = exp(-dot(vec2(x, yy) - foco, vec2(x, yy) - foco) * 14.0) * 0.5;
    // borde: un filo oscuro fino (reflexión interna) y el cuerpo del agua, apenas verdoso y un poco luminoso
    float filo = smoothstep(0.78, 0.97, r2);
    vec3 c = detras * vec3(0.88, 0.97, 1.0) * (1.0 - 0.38 * filo) + vec3(0.07, 0.12, 0.13) * uLuz * (1.0 - filo) + uLuz * caus;
    c = mix(c, env * 1.3, clamp(F + 0.08, 0.0, 1.0)) + uLuz * spec + uBiolum * (0.6 + 0.4 * (1.0 - filo));
    // gotas que ocupan pocos píxeles: no se resuelve la lente; un punto de agua que recoge luz (pulverización)
    float detalle = smoothstep(1.2, 3.5, vRadPx);
    vec3 velo = alrededor * 0.85 + uLuz * 0.32 + env * 0.25 + uBiolum;
    c = mix(velo, c, detalle);
    float bordeSuave = 1.0 - smoothstep(1.0 - 2.0 / max(vRadPx * 2.0, 1.0), 1.0, r2);
    float a = vOpa * bordeSuave * mix(0.55, 1.0, detalle);
    gl_FragColor = vec4(c, a);
  }`;

export function crearSalpicaduras({ agua, botella, cubo }) {
  const f = agua.estado;
  const pos = new Float32Array(MAX * 3), vel = new Float32Array(MAX * 3), dat = new Float32Array(MAX * 4);
  const vida = new Float32Array(MAX), roz = new Float32Array(MAX), opa0 = new Float32Array(MAX);
  let n = 0;

  const base = new THREE.PlaneGeometry(2, 2);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  const aPos = new THREE.InstancedBufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const aVel = new THREE.InstancedBufferAttribute(vel, 3).setUsage(THREE.DynamicDrawUsage);
  const aDat = new THREE.InstancedBufferAttribute(dat, 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iPos', aPos); geo.setAttribute('iVel', aVel); geo.setAttribute('iDat', aDat);
  geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthTest: false, depthWrite: false,
    uniforms: {
      tFondo: { value: null }, tProf: { value: null }, tEntorno: { value: cubo }, uEntornoRot: { value: new THREE.Matrix3() },
      uVistaAMundo: { value: new THREE.Matrix3() }, uSolVista: { value: new THREE.Vector3(0, 1, 0) },
      uLuz: { value: new THREE.Color(1, 1, 1) }, uBiolum: { value: new THREE.Color(0, 0, 0) },
      uNear: { value: 5 }, uFar: { value: 220 }, uRes: { value: new THREE.Vector2(1, 1) }, uAltoPx: { value: 740 },
    },
  });
  const malla = new THREE.Mesh(geo, mat);
  malla.frustumCulled = false;
  const escena = new THREE.Scene();
  escena.add(malla);

  const P = new THREE.Vector3(), D = new THREE.Vector3(), A = new THREE.Vector3(), L = new THREE.Vector3();
  const dentro = (x, y, z, m = 0.1) => x > BASE_INT_X + m && x < CORCHO_INT_X - m - 0.5 && Math.hypot(y, z) < botella.rIn(x) - m;

  // una gota: tipo 0 = pulverización fina, 1 = mediana, 2 = grande (alargada)
  function gota(p, v, tipo, opa = 1) {
    if (n >= MAX) return;
    pos.set([p.x, p.y, p.z], n * 3);
    vel.set([v.x, v.y, v.z], n * 3);
    const r = tipo === 2 ? al(0.085, 0.13) : tipo === 1 ? al(0.035, 0.065) : al(0.012, 0.03);
    dat.set([r, (tipo === 0 ? al(0.3, 0.6) : 1) * opa, tipo === 2 ? al(2.0, 3.2) : tipo === 1 ? al(0.8, 1.6) : 0.4, Math.random()], n * 4);
    opa0[n] = dat[n * 4 + 1];
    vida[n] = tipo === 0 ? al(0.35, 0.8) : al(1.5, 2.5);
    roz[n] = tipo === 2 ? 0.15 : tipo === 1 ? 0.5 : 2.2;
    n++;
  }

  // ráfagas de cresta: siguen a la cresta un momento y sueltan gotas de una lámina corta
  const rafagas = [];
  function rafaga(u, v, fuerza, dirU, dirV) {
    if (rafagas.length > 10) return;
    rafagas.push({ u, v, fuerza, dirU, dirV, t: 0, dur: al(0.25, 0.6), largo: al(0.3, 0.9), acum: 0 });
  }
  function soltar(rf, dt, tAhora, viento) {
    const h = agua.alturaEn(rf.u, rf.v, tAhora);
    // dirección de avance de la ola en el plano y su perpendicular (a lo largo de la cresta)
    const fw = A.copy(f.e1).multiplyScalar(rf.dirU).addScaledVector(f.e2, rf.dirV).normalize();
    const lado = L.crossVectors(f.n, fw).normalize();
    rf.acum += dt * 85 * rf.fuerza;
    while (rf.acum >= 1) {
      rf.acum -= 1;
      const s = al(-0.5, 0.5) * rf.largo;
      P.copy(f.e1).multiplyScalar(rf.u).addScaledVector(f.e2, rf.v).addScaledVector(f.n, f.d + h + 0.04).addScaledVector(lado, s);
      if (!dentro(P.x, P.y, P.z, 0.3)) continue;
      const x = Math.random();
      const tipo = x < 0.03 ? 2 : x < 0.2 ? 1 : 0;
      // la lámina sale hacia delante y arriba con la ola; las finas, más deprisa y más dispersas; el viento las empuja
      const sube = tipo === 2 ? al(1.4, 2.3) : tipo === 1 ? al(1.6, 2.8) : al(1.9, 3.4);
      const avance = (tipo === 0 ? al(0.6, 1.8) : al(0.9, 1.6)) * (0.7 + 0.5 * rf.fuerza);
      D.copy(f.n).multiplyScalar(sube * (0.75 + 0.35 * rf.fuerza)).addScaledVector(fw, avance)
        .addScaledVector(lado, al(-0.25, 0.25) * (tipo === 0 ? 2 : 1)).addScaledVector(f.e1, -0.4 * viento * (tipo === 0 ? 1.5 : 0.4));
      gota(P, D, tipo);
    }
    // la cresta avanza
    rf.u += rf.dirU * dt * 1.4; rf.v += rf.dirV * dt * 1.4;
    rf.t += dt;
  }

  // salpicadura suelta (proa, borda, gaviota...): pocas grandes, más medianas y finas
  function lanzar(p, empuje, cuantas, fuerza, viento) {
    for (let k = 0; k < cuantas; k++) {
      const x = Math.random(), tipo = x < 0.05 ? 2 : x < 0.3 ? 1 : 0;
      P.set(p.x + al(-0.12, 0.12), p.y + al(-0.04, 0.08), p.z + al(-0.12, 0.12));
      D.copy(f.n).multiplyScalar(al(0.7, 1.7) * fuerza).addScaledVector(f.e1, -al(0.2, 1.0) * (0.4 + viento))
        .addScaledVector(f.e2, al(-0.6, 0.6)).add(empuje);
      gota(P, D, tipo);
    }
  }

  const ondas = []; // gotas grandes que caen al agua: pequeña onda (main.js las pasa a la simulación)
  function actualizar(dt, t, { viento = 0.5, barco = null } = {}) {
    const amp = agua.mar.amp;
    const fuerte = Math.max(0, (amp - 0.25) / 0.6);
    if (fuerte > 0) {
      // crestas que rompen: unas veces por segundo (más con más mar) se busca, entre puntos al azar, la cresta más
      // alta y empinada del momento; si lo es de verdad, rompe ahí. Así salpican las olas grandes, no todo el mar.
      if (Math.random() < dt * (1.2 + 4.5 * fuerte)) {
        let mejor = null, nota = 0;
        for (let k = 0; k < 36; k++) {
          const u = al(-15, 13), v = al(-4.5, 4.5);
          const h = agua.alturaEn(u, v, t);
          if (h < amp * 0.45) continue;
          const gu = (agua.alturaEn(u + 0.2, v, t) - agua.alturaEn(u - 0.2, v, t)) / 0.4;
          const gv = (agua.alturaEn(u, v + 0.2, t) - agua.alturaEn(u, v - 0.2, t)) / 0.4;
          const pend = Math.hypot(gu, gv), x = (h / amp) * pend;
          if (pend > 0.3 && x > nota) { nota = x; mejor = [u, v, gu, gv, pend, h]; }
        }
        if (mejor) {
          const [u, v, gu, gv, pend, h] = mejor;
          // avanza hacia -e1 (como el oleaje), algo desviada hacia donde baja la ola
          const du = -1 - 0.4 * gu / pend, dv = -0.4 * gv / pend, l = Math.hypot(du, dv);
          rafaga(u, v, Math.min(1.6, 0.45 + 0.6 * fuerte + 0.5 * Math.max(0, h / amp - 0.6)), du / l, dv / l);
        }
      }
      // agua que cae por la borda cuando una ola grande sacude el barco
      if (barco && barco.golpe > 0.25 && barco.puntoBorda) {
        const veces = Math.floor(barco.golpe * dt * 45 + Math.random());
        for (let k = 0; k < veces; k++) {
          const { p, fuera } = barco.puntoBorda();
          if (dentro(p.x, p.y, p.z, 0.3)) lanzar(p, D.copy(fuera).multiplyScalar(al(0.3, 0.9)), 2, 0.12, 0);
        }
      }
      // proa que golpea una ola
      if (barco && Math.abs(barco.vcab) > 0.25 && Math.random() < Math.min(1, Math.abs(barco.vcab) * dt * 12)) {
        P.copy(barco.proa);
        if (dentro(P.x, P.y, P.z, 0.3)) lanzar(P.clone(), A.set(0, 0, 0), 5 + Math.floor(Math.random() * 6), 1.1 + Math.abs(barco.vcab), viento);
      }
    }
    for (let i = rafagas.length - 1; i >= 0; i--) {
      soltar(rafagas[i], dt, t, viento);
      if (rafagas[i].t > rafagas[i].dur) rafagas.splice(i, 1);
    }

    // mover: gravedad de la botella (hacia -n) y rozamiento del aire (que arrastra hacia el viento)
    const g = 5.5;
    for (let i = 0; i < n; i++) {
      vida[i] -= dt;
      const rz = Math.exp(-dt * roz[i]);
      const j = i * 3;
      vel[j] = vel[j] * rz - f.n.x * g * dt - f.e1.x * viento * roz[i] * 0.25 * dt;
      vel[j + 1] = vel[j + 1] * rz - f.n.y * g * dt - f.e1.y * viento * roz[i] * 0.25 * dt;
      vel[j + 2] = vel[j + 2] * rz - f.n.z * g * dt - f.e1.z * viento * roz[i] * 0.25 * dt;
      const x = pos[j] + vel[j] * dt, y = pos[j + 1] + vel[j + 1] * dt, z = pos[j + 2] + vel[j + 2] * dt;
      // la pulverización fina se evapora
      if (dat[i * 4] < 0.031) dat[i * 4 + 1] = opa0[i] * Math.min(1, vida[i] / 0.25);
      const alto = f.n.x * x + f.n.y * y + f.n.z * z - f.d;
      const bajando = vel[j] * f.n.x + vel[j + 1] * f.n.y + vel[j + 2] * f.n.z < 0;
      let fin = vida[i] <= 0 || alto < -1.5 || !dentro(x, y, z, 0.05);
      if (!fin && bajando && alto < agua.mar.amp * 1.2) {
        const u = f.e1.x * x + f.e1.y * y + f.e1.z * z, v = f.e2.x * x + f.e2.y * y + f.e2.z * z;
        if (alto < agua.alturaEn(u, v, t)) {
          fin = true;
          if (dat[i * 4] > 0.08 && ondas.length < 4) ondas.push([u, v, 0.02, 0.12]);
        }
      }
      if (fin) {
        // se quita cambiándola por la última
        n--;
        if (i < n) {
          pos.copyWithin(j, n * 3, n * 3 + 3); vel.copyWithin(j, n * 3, n * 3 + 3); dat.copyWithin(i * 4, n * 4, n * 4 + 4);
          vida[i] = vida[n]; roz[i] = roz[n]; opa0[i] = opa0[n];
          i--;
        }
        continue;
      }
      pos[j] = x; pos[j + 1] = y; pos[j + 2] = z;
    }
    geo.instanceCount = n;
    aPos.needsUpdate = true; aVel.needsUpdate = true; aDat.needsUpdate = true;
  }

  // dibujo: después del agua (tFondo = escena con agua) y antes del cristal delantero
  const m3 = new THREE.Matrix3();
  function dibujar(renderer, camara, tFondo, tProf, { entornoRot, sol, ancho, alto }) {
    if (!n) return;
    const U = mat.uniforms;
    U.tFondo.value = tFondo; U.tProf.value = tProf;
    U.uEntornoRot.value.copy(entornoRot);
    U.uVistaAMundo.value.setFromMatrix4(camara.matrixWorld);
    U.uSolVista.value.copy(sol).applyMatrix3(m3.setFromMatrix4(camara.matrixWorldInverse)).normalize();
    U.uNear.value = camara.near; U.uFar.value = camara.far;
    U.uRes.value.set(ancho, alto); U.uAltoPx.value = alto;
    renderer.render(escena, camara);
  }

  return {
    actualizar, dibujar, ondas,
    // romper(u, v): una cresta rompe ahí (para las pruebas)
    romper: (u, v, fuerza = 1.3) => rafaga(u, v, fuerza, -1, 0),
    // salpicadura suelta (p. ej. una gaviota que se tira al agua)
    salpicar: (p, cuantas = 12, fuerza = 0.9) => lanzar(p, D.set(0, 0, 0), cuantas, fuerza, 0),
    // luz del interior de la botella; de noche, con bioluminiscencia, las gotas brillan
    color: (luz, biolum = 0) => {
      mat.uniforms.uLuz.value.copy(luz);
      mat.uniforms.uBiolum.value.setRGB(0.03, 0.45, 0.6).multiplyScalar(biolum);
    },
    escala: () => {},
    get cantidad() { return n; },
  };
}
