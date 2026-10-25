// Salpicaduras: gotas que saltan de las crestas que rompen y de la proa cuando el barco golpea una ola, y agua
// que cae por la borda cuando una ola grande sacude el barco.
// El viento las empuja, la gravedad (la de la botella) las hace caer y desaparecen al volver al agua o al
// tocar el cristal. Solo con mar movido.
import * as THREE from 'three';
import { BASE_INT_X, CORCHO_INT_X } from './bottle.js';

const MAX = 600;
const al = (a, b) => a + Math.random() * (b - a);

export function crearSalpicaduras({ escena, agua, botella }) {
  const f = agua.estado;
  const pos = new Float32Array(MAX * 3), vida = new Float32Array(MAX), tam = new Float32Array(MAX);
  const vel = new Float32Array(MAX * 3), dur = new Float32Array(MAX);
  let n = 0;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('vida', new THREE.BufferAttribute(vida, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('tam', new THREE.BufferAttribute(tam, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(1, 1, 1) }, uEscala: { value: 400 } },
    vertexShader: /* glsl */`
      attribute float vida; attribute float tam; uniform float uEscala; varying float vV;
      void main(){
        vV = vida;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = vida > 0.0 ? tam * uEscala / -mv.z : 0.0;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; varying float vV;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.1, d) * clamp(vV * 2.5, 0.0, 1.0);
        gl_FragColor = vec4(uColor, a);
      }`,
  });
  const puntos = new THREE.Points(geo, mat);
  puntos.frustumCulled = false;
  puntos.renderOrder = 6;
  escena.add(puntos);

  const P = new THREE.Vector3(), D = new THREE.Vector3();
  const dentro = (x, y, z, m = 0.1) => x > BASE_INT_X + m && x < CORCHO_INT_X - m - 0.5 && Math.hypot(y, z) < botella.rIn(x) - m;

  function lanzar(p, base, cuantas, fuerza, viento) {
    for (let k = 0; k < cuantas && n < MAX; k++, n++) {
      pos.set([p.x + al(-0.15, 0.15), p.y + al(-0.05, 0.1), p.z + al(-0.15, 0.15)], n * 3);
      // hacia arriba, con el viento (las olas y el viento van hacia -e1) y algo de dispersión
      D.copy(f.n).multiplyScalar(al(0.8, 1.8) * fuerza).addScaledVector(f.e1, -al(0.4, 1.4) * (0.5 + viento))
        .addScaledVector(f.e2, al(-0.6, 0.6)).add(base);
      vel.set([D.x, D.y, D.z], n * 3);
      dur[n] = vida[n] = al(0.45, 1.1);
      tam[n] = al(0.045, 0.11);
    }
  }

  function actualizar(dt, t, { viento = 0.5, barco = null } = {}) {
    const amp = agua.mar.amp;
    const fuerte = Math.max(0, (amp - 0.25) / 0.6);
    if (fuerte > 0) {
      // crestas que rompen: se prueban puntos al azar de la superficie
      for (let k = 0; k < 28; k++) {
        const u = al(-15, 13), v = al(-4.5, 4.5);
        const h = agua.alturaEn(u, v, t);
        if (h < amp * 0.95) continue;
        const pend = Math.abs(agua.alturaEn(u + 0.25, v, t) - h) / 0.25;
        if (pend < 0.45 || Math.random() > fuerte * 0.7) continue;
        P.copy(f.e1).multiplyScalar(u).addScaledVector(f.e2, v).addScaledVector(f.n, f.d + h);
        if (!dentro(P.x, P.y, P.z, 0.3)) continue;
        lanzar(P, D.set(0, 0, 0), 3 + Math.floor(Math.random() * 5), 1 + fuerte, viento);
      }
      // agua que sale por la borda y cae por los costados cuando una ola grande sacude el barco
      if (barco && barco.golpe > 0.25 && barco.puntoBorda) {
        const veces = Math.floor(barco.golpe * dt * 90 + Math.random());
        for (let k = 0; k < veces; k++) {
          const { p, fuera } = barco.puntoBorda();
          if (dentro(p.x, p.y, p.z, 0.3)) lanzar(p, D.copy(fuera).multiplyScalar(al(0.3, 0.9)), 2 + Math.floor(Math.random() * 3), 0.12, 0);
        }
      }
      // proa que golpea una ola: depende de lo rápido que cabecea el barco
      if (barco && Math.abs(barco.vcab) > 0.25 && Math.random() < Math.min(1, Math.abs(barco.vcab) * dt * 18)) {
        P.copy(barco.proa);
        if (dentro(P.x, P.y, P.z, 0.3)) lanzar(P, D.set(0, 0, 0), 6 + Math.floor(Math.random() * 8), 1.2 + Math.abs(barco.vcab), viento);
      }
    }
    // mover: gravedad de la botella (hacia -n), algo de rozamiento con el aire
    const g = 5.5, roz = Math.exp(-dt * 0.8);
    for (let i = 0; i < n; i++) {
      vida[i] -= dt;
      let x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      vel[i * 3] = vel[i * 3] * roz - f.n.x * g * dt; vel[i * 3 + 1] = vel[i * 3 + 1] * roz - f.n.y * g * dt; vel[i * 3 + 2] = vel[i * 3 + 2] * roz - f.n.z * g * dt;
      x += vel[i * 3] * dt; y += vel[i * 3 + 1] * dt; z += vel[i * 3 + 2] * dt;
      const alto = f.n.x * x + f.n.y * y + f.n.z * z - f.d;
      if (vida[i] <= 0 || alto < -0.3 || !dentro(x, y, z, 0.05)) {
        // se quita cambiándola por la última
        n--;
        if (i < n) {
          pos.copyWithin(i * 3, n * 3, n * 3 + 3); vel.copyWithin(i * 3, n * 3, n * 3 + 3);
          vida[i] = vida[n]; dur[i] = dur[n]; tam[i] = tam[n];
          i--;
        }
        vida[n] = 0;
        continue;
      }
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    }
    geo.setDrawRange(0, n);
    geo.attributes.position.needsUpdate = true; geo.attributes.vida.needsUpdate = true; geo.attributes.tam.needsUpdate = true;
  }

  return {
    actualizar,
    // salpicadura suelta (p. ej. una gaviota que se tira al agua)
    salpicar: (p, cuantas = 14, fuerza = 0.9) => lanzar(p, D.set(0, 0, 0), cuantas, fuerza, 0),
    // la espuma pulverizada recoge mucha luz: clara incluso con el cielo oscuro de la tormenta
    color: (luz, biolum = 0) => mat.uniforms.uColor.value.setRGB(0.88, 0.94, 1.0).multiplyScalar(1.7 * Math.max(0.65, (luz.r + luz.g + luz.b) / 3))
      .lerp(new THREE.Color(0.1, 1.4, 1.9), biolum * 0.8), // de noche, las gotas también brillan
    escala: (altoPx) => { mat.uniforms.uEscala.value = altoPx * 7; }, // la cámara está a ~46 unidades: gotas de 3-5 px
    get cantidad() { return n; },
  };
}
