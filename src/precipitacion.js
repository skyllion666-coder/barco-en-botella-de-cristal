// Lluvia (trazos) y nieve (copos) dentro de la cavidad de la botella. Caen en la dirección de la gravedad
// del marco de la botella, se recortan al volumen interior y desaparecen al tocar la superficie del agua.
import * as THREE from 'three';
import { BASE_INT_X, CORCHO_INT_X } from './bottle.js';
import { DOM_U, DOM_V } from './agua.js';

const VERT = /* glsl */`
  attribute vec4 semilla;
  uniform float uTiempo; uniform float uViento; uniform float uAltura; uniform float uCantidad; uniform float uVel;
  uniform float uLargo; uniform float uAncho; uniform float uAspecto; uniform float uTam;
  uniform vec3 uN; uniform vec3 uE1; uniform vec3 uE2; uniform float uD; uniform vec2 uDominio;
  uniform sampler2D tPerfil; uniform sampler2D tAltura;
  varying vec2 vQ; varying float vA; varying float vProf;
  const float X0 = ${BASE_INT_X.toFixed(3)}; const float X1 = ${CORCHO_INT_X.toFixed(3)};
  void main(){
    float visible = step(semilla.w, uCantidad);
    float a = (semilla.x * 2.0 - 1.0) * uDominio.x * 0.98;
    float b = (semilla.y * 2.0 - 1.0) * uDominio.y * 0.98;
    float fase = fract(semilla.z * 37.17);
    float vel = uVel * (0.82 + 0.36 * fract(semilla.z * 91.3));
    float c = mod(fase * uAltura - uTiempo * vel, uAltura);
    vec3 deriva = vec3(0.0);
    vec3 P;
    #ifdef NIEVE
      float s1 = sin(uTiempo * (0.55 + semilla.x * 0.7) + semilla.z * 40.0), s2 = cos(uTiempo * (0.45 + semilla.y * 0.6) + semilla.w * 30.0);
      P = uE1 * (a + s1 * 0.35 + uViento * (uAltura - c) * 0.35) + uE2 * (b + s2 * 0.3) + uN * (uD + c);
    #else
      P = uE1 * a + uE2 * b + uN * (uD + c) + uE1 * (uViento * (uAltura - c) * 0.16);
    #endif
    float h = texture2D(tAltura, vec2(a, b) / (2.0 * uDominio) + 0.5).r;
    float rIn = texture2D(tPerfil, vec2((P.x - X0) / (X1 - X0), 0.5)).r;
    bool ok = visible > 0.5 && c > h + 0.02 && P.x > X0 + 0.15 && P.x < X1 - 0.3 && length(P.yz) < rIn - 0.08;
    if (!ok){ gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vQ = vec2(0.0); vA = 0.0; vProf = 0.0; return; }
    vec4 mv = modelViewMatrix * vec4(P, 1.0);
    #ifdef NIEVE
      float tam = uTam * (0.6 + 0.8 * fract(semilla.z * 13.7));
      mv.xy += position.xy * tam;
      gl_Position = projectionMatrix * mv;
      vQ = position.xy;
      vA = smoothstep(0.0, 0.3, c - h) * 0.85;
    #else
      vec3 dir = normalize(-uN * vel + uE1 * uViento * vel * 0.16);
      vec3 pv0 = mv.xyz;
      vec3 pv1 = (modelViewMatrix * vec4(P + dir * uLargo, 1.0)).xyz;
      vec3 eje = pv1 - pv0;
      vec3 lado = cross(eje, pv0);
      lado = length(lado) > 1e-6 ? normalize(lado) : vec3(1.0, 0.0, 0.0);
      vec3 pv = mix(pv0, pv1, position.y) + lado * position.x * uAncho;
      gl_Position = projectionMatrix * vec4(pv, 1.0);
      vQ = vec2(position.x, position.y);
      vA = smoothstep(0.0, 0.12, c - h) * 0.55;
    #endif
    vProf = -mv.z;
  }`;

const FRAG = /* glsl */`
  uniform vec3 uColor; uniform float uAlfa;
  varying vec2 vQ; varying float vA;
  void main(){
    #ifdef NIEVE
      float d = length(vQ);
      float al = smoothstep(0.5, 0.15, d);
      gl_FragColor = vec4(uColor, al * vA * uAlfa);
    #else
      float al = (1.0 - abs(vQ.x) * 2.0) * (0.25 + 0.75 * vQ.y);
      gl_FragColor = vec4(uColor, al * vA * uAlfa);
    #endif
  }`;

function crearMalla(tipo, N, compartidos) {
  const geo = new THREE.InstancedBufferGeometry();
  const quad = tipo === 'nieve'
    ? [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]
    : [-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0];
  geo.setAttribute('position', new THREE.Float32BufferAttribute(quad, 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const sem = new Float32Array(N * 4);
  for (let i = 0; i < sem.length; i++) sem[i] = Math.random();
  // w define el umbral de visibilidad: con cantidad q se ven las gotas con w < q
  for (let i = 0; i < N; i++) sem[i * 4 + 3] = (i + Math.random()) / N;
  geo.setAttribute('semilla', new THREE.InstancedBufferAttribute(sem, 4));
  geo.instanceCount = N;
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
    defines: tipo === 'nieve' ? { NIEVE: 1 } : {},
    uniforms: {
      ...compartidos,
      uCantidad: { value: 0 }, uVel: { value: tipo === 'nieve' ? 1.1 : 17 }, uLargo: { value: 0.75 }, uAncho: { value: 0.022 },
      uTam: { value: 0.085 }, uColor: { value: new THREE.Color(1, 1, 1) }, uAlfa: { value: 1 },
    },
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.renderOrder = 5;
  return m;
}

export function crearPrecipitacion({ escena, agua, camara }) {
  const UA = agua.uVolumen;
  const compartidos = {
    uTiempo: { value: 0 }, uViento: { value: 0 }, uAltura: { value: 7.0 }, uAspecto: { value: 2 },
    uN: UA.uN, uE1: UA.uE1, uE2: UA.uE2, uD: UA.uD, uDominio: { value: new THREE.Vector2(DOM_U, DOM_V) },
    tPerfil: UA.tPerfil, tAltura: { value: null },
  };
  const lluvia = crearMalla('lluvia', 2600, compartidos);
  const nieve = crearMalla('nieve', 1700, compartidos);
  escena.add(lluvia, nieve);
  return {
    lluvia, nieve,
    actualizar(t, { cantLluvia, cantNieve, viento, luz, aspecto }) {
      compartidos.uTiempo.value = t;
      compartidos.uViento.value = viento * 0.9;
      compartidos.uAspecto.value = aspecto;
      compartidos.tAltura.value = UA.tAltura.value;
      lluvia.material.uniforms.uCantidad.value = cantLluvia;
      nieve.material.uniforms.uCantidad.value = cantNieve;
      lluvia.visible = cantLluvia > 0.002; nieve.visible = cantNieve > 0.002;
      const k = (c) => 0.55 + 0.75 * c;
      lluvia.material.uniforms.uColor.value.setRGB(0.78 * k(luz.r), 0.86 * k(luz.g), 1.0 * k(luz.b)).multiplyScalar(1.15);
      nieve.material.uniforms.uColor.value.setRGB(0.95 * k(luz.r), 0.97 * k(luz.g), 1.0 * k(luz.b)).multiplyScalar(1.25);
    },
  };
}
