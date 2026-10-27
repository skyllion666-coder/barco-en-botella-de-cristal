// Vidrio de la botella: dos pasadas.
//  1) Caras traseras -> buffer (normal xy, distancia, grosor de pared).
//  2) Caras delanteras -> refracción en espacio de pantalla con dispersión, absorción verde-azulada,
//     reflejos de entorno por la pared delantera y por la trasera (doble reflejo, como en la foto).
import * as THREE from 'three';
import { GOTAS_X0, GOTAS_X1 } from './gotas.js';

const VERT = /* glsl */`
  attribute float pared;
  varying vec3 vN; varying vec3 vP; varying vec3 vL; varying float vPared; varying vec3 vRad; varying vec3 vEje; varying vec3 vTan;
  void main(){
    vL = position; vPared = pared;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vP = mv.xyz;
    vN = normalize(normalMatrix * normal);
    vRad = normalMatrix * vec3(0.0, position.y, position.z);
    vEje = normalMatrix * vec3(1.0, 0.0, 0.0);
    vTan = normalMatrix * vec3(0.0, -position.z, position.y);
    gl_Position = projectionMatrix * mv;
  }`;

// Vidrio soplado: ondulaciones suaves e irregulares de la superficie (anillos de soplado a lo largo del eje y
// vetas a lo largo del contorno). Rompen los reflejos rectos y deforman un poco lo que se ve a través.
const GLSL_SOPLADO = /* glsl */`
  vec3 soplado(vec3 N, vec3 L, vec3 eje, vec3 tang){
    float a = atan(L.z, L.y);
    float x = L.x;
    // frecuencias no armónicas y fase que deriva con el ángulo: sin periodo visible
    float anillos = sin(x * 1.37 + sin(a * 2.0 + x * 0.41) * 1.8 + sin(x * 0.23) * 2.5) * 0.45
                  + sin(x * 3.11 + a * 1.0 + sin(x * 0.67 + a) * 1.2 + 2.1) * 0.30
                  + sin(x * 6.53 - a * 3.0 + 0.4) * 0.07;
    float vetas = sin(a * 5.0 + x * 0.9 + sin(x * 0.5) * 2.0) * 0.5 + sin(a * 11.0 - x * 1.7 + sin(x * 0.31) * 3.0 + 0.7) * 0.2;
    // el cuello y el labio, más trabajados a mano, ondulan más
    float k = mix(0.045, 0.085, smoothstep(9.0, 13.5, x));
    vec3 t = normalize(tang + vec3(1e-5));
    return normalize(N + normalize(eje) * anillos * k + t * vetas * k * 0.7);
  }`;

// Grietas en estrella (rayos que salen del impacto, anillos de tela de araña entre ellos y centro machacado)
// y agujero de borde quebrado. Coordenadas sobre la pared: (x, arco) respecto al punto de impacto.
const GLSL_GRIETAS = /* glsl */`
  float hashG(float n){ return fract(sin(n * 127.1 + 3.7) * 43758.5453); }
  vec2 coordPared(vec3 L, vec3 P){
    float da = atan(L.z, L.y) - atan(P.z, P.y);
    da = mod(da + 3.14159265, 6.2831853) - 3.14159265;
    return vec2(L.x - P.x, da * 5.0);
  }
  float grieta(vec2 q, float k, float sem){
    float r = length(q);
    if (k <= 0.001 || r > 3.6 * k) return 0.0;
    float a = atan(q.y, q.x);
    const float NR = 13.0;
    float s = (a / 6.2831853 + 0.5) * NR;
    float c = floor(s);
    float desv = (hashG(c + sem) - 0.5) * 0.45;
    float onda = 0.10 * sin(r * 5.0 + hashG(c * 3.1 + sem) * 6.28) + 0.05 * sin(r * 13.0 + c * 1.7);
    float fr = fract(s) - 0.5 - desv - onda;
    float dLin = abs(fr) * 6.2831853 * r / NR;
    float largo = k * (1.0 + 2.4 * hashG(c * 7.7 + sem));
    float ancho = 0.008 + 0.012 * (1.0 - smoothstep(0.0, largo, r));
    float m = (1.0 - smoothstep(ancho * 0.4, ancho, dLin)) * (1.0 - smoothstep(largo * 0.75, largo, r));
    for (int i = 0; i < 3; i++){
      float rk = k * (0.3 + 0.42 * float(i)) * (1.0 + 0.3 * (hashG(c * 1.3 + float(i) + sem) - 0.5));
      float hay = step(0.4, hashG(c * 5.1 + float(i) * 2.3 + sem)) * step(rk, largo);
      m = max(m, hay * (1.0 - smoothstep(0.004, 0.012, abs(r - rk * (1.0 + 0.08 * sin(a * 9.0 + sem))))));
    }
    m = max(m, (1.0 - smoothstep(0.06 * k, 0.2 * k, r)) * (0.55 + 0.45 * hashG(floor(a * 9.0) + floor(r * 40.0))));
    return m;
  }`;

const FRAG_ATRAS = /* glsl */`
  varying vec3 vN; varying vec3 vP; varying vec3 vL; varying float vPared; varying vec3 vEje; varying vec3 vTan;
  ${GLSL_SOPLADO}
  void main(){
    vec3 n = soplado(normalize(vN), vL, vEje, vTan);
    gl_FragColor = vec4(n.xy, length(vP), vPared);
  }`;

const FRAG_FRENTE = /* glsl */`
  uniform sampler2D tEscena; uniform sampler2D tAtras; uniform samplerCube tEntorno;
  uniform vec2 uRes; uniform mat3 uEntornoRot; uniform vec2 uProy;
  uniform float uTiempo; uniform vec3 uLuzExt; uniform float uDbg;
  uniform sampler2D tGotas; uniform float uHayGotas;
  uniform vec4 uGrietas[4]; uniform vec4 uAgujero;
  varying vec3 vN; varying vec3 vP; varying vec3 vL; varying float vPared; varying vec3 vRad; varying vec3 vEje; varying vec3 vTan;
  ${GLSL_SOPLADO}
  ${GLSL_GRIETAS}

  vec3 envMuestra(vec3 dView, float lod){
    vec3 dw = transpose(mat3(viewMatrix)) * dView;
    return textureLod(tEntorno, uEntornoRot * dw, lod).rgb;
  }
  float schlick(float f0, float c){ float x = 1.0 - c; float x2 = x*x; return f0 + (1.0 - f0) * x2*x2*x; }

  void main(){
    vec3 N = soplado(normalize(vN), vL, vEje, vTan);
    vec3 I = normalize(vP);

    // gotas en la cara interior: la normal sigue la pendiente del mapa de alturas (x, ángulo)
    float gota = 0.0, borde = 0.0, nucleo = 0.0;
    if (uHayGotas > 0.5){
      const float GX0 = ${GOTAS_X0.toFixed(3)}, GX1 = ${GOTAS_X1.toFixed(3)};
      float R = max(length(vL.yz), 0.3);
      vec2 uvG = vec2((vL.x - GX0) / (GX1 - GX0), fract(atan(vL.z, vL.y) / 6.2831853));
      vec2 dU = vec2(1.0 / 1024.0, 0.0), dV = vec2(0.0, 1.0 / 512.0);
      float sx = (texture2D(tGotas, uvG + dU).r - texture2D(tGotas, uvG - dU).r) / (2.0 * (GX1 - GX0) / 1024.0);
      float sa = (texture2D(tGotas, uvG + dV).r - texture2D(tGotas, uvG - dV).r) / (2.0 * R * 6.2831853 / 512.0);
      vec3 pend = normalize(vEje) * sx + normalize(vTan + vec3(1e-5)) * sa;
      N = normalize(N + pend * 0.6);
      gota = smoothstep(0.004, 0.03, texture2D(tGotas, uvG).r);
      borde = gota * smoothstep(1.0, 2.6, length(pend));
      nucleo = gota * (1.0 - smoothstep(0.3, 1.0, length(pend)));
    }

    // Anillos concéntricos del fondo grueso de la base
    float rho = length(vL.yz);
    float zonaBase = 1.0 - smoothstep(-14.5, -11.6, vL.x);
    float anillo = sin(rho * 21.0) * 0.5 + sin(rho * 47.0 + 1.3) * 0.25;
    vec3 rad = normalize(vRad);
    N = normalize(N + rad * anillo * 0.10 * zonaBase);

    vec2 suv = gl_FragCoord.xy / uRes;
    vec4 B = texture2D(tAtras, suv);
    vec3 Nb = vec3(B.xy, -sqrt(max(0.0, 1.0 - dot(B.xy, B.xy))));
    float wF = vPared, wB = B.w;

    float cosF = clamp(dot(N, -I), 0.03, 1.0);
    float cosB = clamp(dot(Nb, I), 0.03, 1.0);

    // Desplazamiento por refracción a través de ambas paredes
    vec3 T1 = refract(I, N, 1.0 / 1.5);
    vec3 T2 = refract(I, -Nb, 1.0 / 1.5);
    vec2 offF = T1.xy / max(abs(T1.z), 0.15) - I.xy / max(abs(I.z), 0.15);
    vec2 offB = T2.xy / max(abs(T2.z), 0.15) - I.xy / max(abs(I.z), 0.15);
    vec2 off = offF * wF + offB * wB * 0.55;
    float dist = length(vP);
    vec2 duv = off * uProy * 0.5 / dist * 3.4;
    float ld = length(duv); duv *= min(1.0, 0.028 / max(ld, 1e-5));

    float disp = 0.035 + 0.06 * zonaBase;
    vec3 col;
    col.r = texture2D(tEscena, suv + duv * (1.0 - disp)).r;
    col.g = texture2D(tEscena, suv + duv).g;
    col.b = texture2D(tEscena, suv + duv * (1.0 + disp)).b;

    // Absorción: el vidrio absorbe más rojo y algo de azul -> verde-azulado en los bordes
    float camino = wF / cosF + wB / cosB;
    vec3 absorcion = exp(-vec3(0.55, 0.16, 0.24) * camino * 0.16);
    col *= absorcion;
    // lente diminuta y plana: filo algo oscuro (refleja hacia dentro) y centro que concentra un poco la luz
    col *= 1.0 - 0.28 * borde;
    col += vec3(0.025, 0.028, 0.03) * nucleo * uLuzExt;

    // Reflejos
    float Ff = schlick(0.045, cosF);
    Ff = min(1.0, Ff + 0.05 * gota); // la superficie curva de la gota refleja más (destellos)
    float Fb = schlick(0.045, cosB);
    vec3 Rf = reflect(I, N);
    vec3 Rb = reflect(I, Nb);
    vec3 refF = envMuestra(Rf, 0.2) * uLuzExt;
    vec3 refB = envMuestra(Rb, 1.2) * uLuzExt;
    col = col * (1.0 - Ff) * (1.0 - Fb * 0.6) + refF * Ff + refB * Fb * (1.0 - Ff) * absorcion * absorcion * 0.9;

    // grietas: cada raja refleja la luz como un espejo diminuto (brillo plateado) y desvía lo de detrás
    float gr = 0.0;
    for (int i = 0; i < 4; i++){
      vec4 G = uGrietas[i];
      if (G.w > 0.0) gr = max(gr, grieta(coordPared(vL, G.xyz), G.w, float(i) * 17.0 + 1.0));
    }
    if (uAgujero.w > 0.0) {
      vec2 q = coordPared(vL, uAgujero.xyz);
      float a = atan(q.y, q.x);
      // borde quebrado: radio aleatorio por sectores, unidos en línea recta (aristas de cristal)
      float sct = (a / 6.2831853 + 0.5) * 11.0, c0 = floor(sct), fs = fract(sct);
      float rA = uAgujero.w * (0.7 + 0.6 * hashG(c0 + 40.0)), rB = uAgujero.w * (0.7 + 0.6 * hashG(mod(c0 + 1.0, 11.0) + 40.0));
      float rb = mix(rA, rB, fs);
      float r = length(q);
      if (r < rb) {
        col = texture2D(tEscena, suv).rgb; // por el agujero se ve el interior sin vidrio delante
        gr = 0.0;
      } else if (r < rb + 0.07) {
        // canto del cristal roto: grueso, verdoso y brillante
        float e = 1.0 - (r - rb) / 0.07;
        col = mix(col, vec3(0.30, 0.48, 0.40) * uLuzExt + envMuestra(reflect(I, N), 0.0) * 0.6 * uLuzExt, 0.85 * e);
      }
    }
    if (gr > 0.0) {
      vec3 Ng = normalize(N + vec3(sin(vL.x * 41.0), cos(vL.y * 37.0), sin(vL.z * 29.0)) * 0.6);
      vec3 brilloG = envMuestra(reflect(I, Ng), 0.0) * uLuzExt;
      col = col * (1.0 - 0.45 * gr) + (brilloG * 1.4 + vec3(0.12, 0.14, 0.14) * uLuzExt) * gr;
    }

    if (uDbg > 0.5) {
      vec3 d = vec3(0.0);
      if (uDbg < 1.5) d = texture2D(tEscena, suv).rgb;
      else if (uDbg < 2.5) d = refF;
      else if (uDbg < 3.5) d = refB;
      else if (uDbg < 4.5) d = vec3(wF, wB, camino * 0.3);
      else if (uDbg < 5.5) d = vec3(Ff, Fb, 0.0);
      else if (uDbg < 6.5) d = vec3(absorcion);
      else d = vec3(B.z * 0.02, cosB, cosF);
      col = d;
    }
    gl_FragColor = vec4(col, 1.0);
  }`;

export function crearVidrio(U, geometria) {
  const matAtras = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG_ATRAS, side: THREE.BackSide, depthWrite: true,
  });
  const matFrente = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG_FRENTE, side: THREE.FrontSide,
    uniforms: {
      tEscena: U.tEscena, tAtras: U.tAtras, tEntorno: U.tEntorno, uRes: U.uRes,
      uEntornoRot: U.uEntornoRot, uProy: U.uProy, uTiempo: U.uTiempo, uLuzExt: U.uLuzExt, uDbg: U.uDbg,
      tGotas: U.tGotas, uHayGotas: U.uHayGotas,
      uGrietas: U.uGrietas || { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) }, uAgujero: U.uAgujero || { value: new THREE.Vector4() },
    },
  });
  const atras = new THREE.Mesh(geometria, matAtras);
  const frente = new THREE.Mesh(geometria, matFrente);
  atras.frustumCulled = frente.frustumCulled = false;
  const escenaAtras = new THREE.Scene(); escenaAtras.add(atras);
  const escenaFrente = new THREE.Scene(); escenaFrente.add(frente);
  return { escenaAtras, escenaFrente, atras, frente };
}
