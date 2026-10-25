// Gotas en la cara interior del cristal. Se simulan en CPU sobre la superficie (x a lo largo del eje, ángulo
// alrededor): resbalan según la gravedad con algo de adherencia, se descuelgan del "techo" y desaparecen al llegar
// al agua. En GPU se dibujan en un mapa de alturas envolvente (x, ángulo) que se desvanece poco a poco, así dejan
// estela. El vidrio deriva la normal de ese mapa para refractar y reflejar cada gota.
import * as THREE from 'three';
import { BASE_INT_X, CORCHO_INT_X, BASE_X, BOCA_X } from './bottle.js';

const MAX = 140;
export const GOTAS_X0 = BASE_X, GOTAS_X1 = BOCA_X; // rango de x que cubre el mapa (el mismo que usa el vidrio)
const RES = [1024, 512];
const al = (a, b) => a + Math.random() * (b - a);

export function crearGotas({ renderer, agua, botella }) {
  const f = agua.estado;
  const mkRT = () => new THREE.WebGLRenderTarget(RES[0], RES[1], {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    depthBuffer: false, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.RepeatWrapping,
  });
  const rt = [mkRT(), mkRT()];
  let actual = 0;
  for (const r of rt) { renderer.setRenderTarget(r); renderer.setClearColor(0x000000, 0); renderer.clear(); }
  renderer.setRenderTarget(null);

  const camara = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));

  // 1) desvanecer el mapa anterior (las estelas se secan)
  const matDesv = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: { tPrev: { value: null }, uK: { value: 0.98 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform sampler2D tPrev; uniform float uK; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tPrev, vUv).r * uK, 0.0, 0.0, 1.0); }',
  });
  const escDesv = new THREE.Scene();
  const mDesv = new THREE.Mesh(tri, matDesv); mDesv.frustumCulled = false; escDesv.add(mDesv);
  const camPant = new THREE.Camera();

  // 2) gotas: cuadrados instanciados con un casquete esférico, alargados en la dirección en que caen
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const aPos = new Float32Array(MAX * 4), aDir = new Float32Array(MAX * 2);
  const atrPos = new THREE.InstancedBufferAttribute(aPos, 4), atrDir = new THREE.InstancedBufferAttribute(aDir, 2);
  atrPos.setUsage(THREE.DynamicDrawUsage); atrDir.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('gota', atrPos); geo.setAttribute('dir', atrDir);
  geo.instanceCount = 0;
  const matGota = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false, transparent: true, side: THREE.DoubleSide, // al orientarla puede quedar del revés
    blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    uniforms: { uEsc: { value: new THREE.Vector2(1 / (GOTAS_X1 - GOTAS_X0), 1 / (Math.PI * 2)) } },
    vertexShader: /* glsl */`
      attribute vec4 gota; attribute vec2 dir; uniform vec2 uEsc; varying vec2 vQ; varying float vR;
      void main(){
        // gota.xy = (x, ángulo) en el mapa [0,1]; gota.z = radio (unidades); gota.w = radio angular por unidad (1/R)
        vec2 d = length(dir) > 1e-4 ? normalize(dir) : vec2(0.0, 1.0);
        vec2 lado = vec2(-d.y, d.x);
        float r = gota.z, alarg = 1.0 + 0.6 * clamp(length(dir) * 4.0, 0.0, 1.0);
        vec2 off = (d * position.y * alarg + lado * position.x) * r;        // en unidades sobre la superficie
        vec2 uv = gota.xy + vec2(off.x * uEsc.x, off.y * gota.w * uEsc.y);
        vQ = position.xy; vR = r;
        gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vQ; varying float vR;
      void main(){
        float q = dot(vQ, vQ);
        if (q > 1.0) discard;
        // altura del casquete en unidades de la escena (gota de ángulo de contacto bajo)
        gl_FragColor = vec4(sqrt(1.0 - q) * vR * 0.55, 0.0, 0.0, 1.0);
      }`,
  });
  const malla = new THREE.Mesh(geo, matGota); malla.frustumCulled = false;
  const escGotas = new THREE.Scene(); escGotas.add(malla);

  // ---- simulación en CPU
  const gotas = [];
  const P = new THREE.Vector3();
  let acumulado = 0;
  const posicion = (g) => { const R = botella.rIn(g.x); return P.set(g.x, R * Math.cos(g.a), R * Math.sin(g.a)); };
  const bajoAgua = (g) => f.n.dot(posicion(g)) - f.d < 0.08;

  function nacer() {
    for (let k = 0; k < 6; k++) {
      const g = { x: al(BASE_INT_X + 0.8, CORCHO_INT_X - 2.5), a: al(-Math.PI, Math.PI), r: al(0.05, 0.16), vx: 0, va: 0, vida: al(14, 30), pega: al(0.3, 0.75) };
      if (!bajoAgua(g)) { gotas.push(g); return; }
    }
  }

  function actualizar(dt, { lluvia, g }) {
    // nacen al salpicar la lluvia contra el cristal
    acumulado += lluvia * 32 * dt;
    while (acumulado >= 1 && gotas.length < MAX) { nacer(); acumulado -= 1; }
    if (gotas.length >= MAX) acumulado = 0;

    for (let i = gotas.length - 1; i >= 0; i--) {
      const d = gotas[i];
      const ca = Math.cos(d.a), sa = Math.sin(d.a);
      // componentes de la gravedad sobre la pared: a lo largo del eje, a lo largo del contorno y hacia el interior
      const gEje = g.x, gCont = -g.y * sa + g.z * ca, gDentro = -(g.y * ca + g.z * sa);
      const gTan = Math.hypot(gEje, gCont);
      // adherencia: las gotas pequeñas se quedan pegadas; las grandes resbalan
      const empuje = gTan * d.r * 9 - d.pega;
      // velocidad de una gota real sobre vidrio: despacio, a tirones, como mucho ~1 unidad/s
      const v = empuje > 0 ? Math.min(1.1, empuje * 0.55) * (0.6 + 0.4 * Math.sin(d.vida * 7 + d.x * 3)) : 0;
      d.vx += ((gTan > 1e-4 ? gEje / gTan * v : 0) - d.vx) * Math.min(1, dt * 6);
      d.va += ((gTan > 1e-4 ? gCont / gTan * v : 0) - d.va) * Math.min(1, dt * 6);
      d.x += d.vx * dt;
      d.a += d.va * dt / Math.max(botella.rIn(d.x), 0.5);
      // al resbalar crecen un poco (recogen otras gotitas) y pierden adherencia
      if (v > 0) { d.r = Math.min(0.19, d.r + dt * 0.006); d.pega = Math.max(0.2, d.pega - dt * 0.03); }
      d.vida -= dt * (lluvia > 0.05 ? 0.4 : 1);
      // en el "techo" se descuelgan; bajo el agua se funden con ella; fuera del cuerpo, se van
      const cae = gDentro < -0.55 && d.r > 0.11 && Math.random() < dt * 0.8;
      if (cae || d.vida <= 0 || bajoAgua(d) || d.x < BASE_INT_X + 0.3 || d.x > CORCHO_INT_X - 0.5) gotas.splice(i, 1);
    }
  }

  // Dibuja el mapa de este cuadro. Devuelve la textura que debe muestrear el vidrio.
  // Sin gotas durante unos segundos el mapa ya está seco: no se dibuja nada (ahorro en el móvil).
  let seco = 99;
  function dibujar(dt) {
    const n = gotas.length;
    seco = n ? 0 : seco + dt;
    if (seco > 4) return rt[actual].texture;
    for (let i = 0; i < n; i++) {
      const d = gotas[i];
      let a = d.a % (Math.PI * 2); if (a < 0) a += Math.PI * 2;
      aPos[i * 4] = (d.x - GOTAS_X0) / (GOTAS_X1 - GOTAS_X0);
      aPos[i * 4 + 1] = a / (Math.PI * 2);
      aPos[i * 4 + 2] = d.r;
      aPos[i * 4 + 3] = 1 / Math.max(botella.rIn(d.x), 0.5);
      aDir[i * 2] = d.vx; aDir[i * 2 + 1] = d.va;
    }
    geo.instanceCount = n;
    atrPos.needsUpdate = true; atrDir.needsUpdate = true;

    const prevAuto = renderer.autoClear;
    renderer.autoClear = false;
    matDesv.uniforms.tPrev.value = rt[actual].texture;
    matDesv.uniforms.uK.value = Math.exp(-dt / 0.7); // la estela se seca en menos de un segundo
    renderer.setRenderTarget(rt[1 - actual]);
    renderer.render(escDesv, camPant);
    if (n) renderer.render(escGotas, camara);
    renderer.autoClear = prevAuto;
    actual = 1 - actual;
    return rt[actual].texture;
  }

  return {
    actualizar, dibujar, get textura() { return rt[actual].texture; }, get objetivo() { return rt[actual]; }, get cantidad() { return gotas.length; },
    get activo() { return seco <= 4; }, // hay gotas o estelas que aún se ven
  };
}
