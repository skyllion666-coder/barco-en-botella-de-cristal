// Vidrio de la botella: dos pasadas.
//  1) Caras traseras -> buffer (normal xy, distancia, grosor de pared).
//  2) Caras delanteras -> refracción en espacio de pantalla con dispersión, absorción verde-azulada,
//     reflejos de entorno por la pared delantera y por la trasera (doble reflejo, como en la foto).
import * as THREE from 'three';

const VERT = /* glsl */`
  attribute float pared;
  varying vec3 vN; varying vec3 vP; varying vec3 vL; varying float vPared; varying vec3 vRad;
  void main(){
    vL = position; vPared = pared;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vP = mv.xyz;
    vN = normalize(normalMatrix * normal);
    vRad = normalMatrix * vec3(0.0, position.y, position.z);
    gl_Position = projectionMatrix * mv;
  }`;

const FRAG_ATRAS = /* glsl */`
  varying vec3 vN; varying vec3 vP; varying float vPared;
  void main(){
    vec3 n = normalize(vN);
    gl_FragColor = vec4(n.xy, length(vP), vPared);
  }`;

const FRAG_FRENTE = /* glsl */`
  uniform sampler2D tEscena; uniform sampler2D tAtras; uniform samplerCube tEntorno;
  uniform vec2 uRes; uniform mat3 uEntornoRot; uniform vec2 uProy;
  uniform float uTiempo; uniform vec3 uLuzExt; uniform float uDbg;
  varying vec3 vN; varying vec3 vP; varying vec3 vL; varying float vPared; varying vec3 vRad;

  vec3 envMuestra(vec3 dView, float lod){
    vec3 dw = transpose(mat3(viewMatrix)) * dView;
    return textureLod(tEntorno, uEntornoRot * dw, lod).rgb;
  }
  float schlick(float f0, float c){ float x = 1.0 - c; float x2 = x*x; return f0 + (1.0 - f0) * x2*x2*x; }

  void main(){
    vec3 N = normalize(vN);
    vec3 I = normalize(vP);

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

    // Reflejos
    float Ff = schlick(0.045, cosF);
    float Fb = schlick(0.045, cosB);
    vec3 Rf = reflect(I, N);
    vec3 Rb = reflect(I, Nb);
    vec3 refF = envMuestra(Rf, 0.2) * uLuzExt;
    vec3 refB = envMuestra(Rb, 1.2) * uLuzExt;
    col = col * (1.0 - Ff) * (1.0 - Fb * 0.6) + refF * Ff + refB * Fb * (1.0 - Ff) * absorcion * absorcion * 0.9;

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
    },
  });
  const atras = new THREE.Mesh(geometria, matAtras);
  const frente = new THREE.Mesh(geometria, matFrente);
  atras.frustumCulled = frente.frustumCulled = false;
  const escenaAtras = new THREE.Scene(); escenaAtras.add(atras);
  const escenaFrente = new THREE.Scene(); escenaFrente.add(frente);
  return { escenaAtras, escenaFrente, atras, frente };
}
