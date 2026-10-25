// Agua: campo de alturas en GPU (oleaje exp-sin + ondas que rebotan en las paredes + espuma persistente)
// y pasada de volumen por raymarch que compone superficie, refracción, absorción y casco sumergido.
import * as THREE from 'three';
import { clamp, mix } from './util.js';
import { BASE_INT_X, CORCHO_INT_X } from './bottle.js';

export const DOM_U = 16.5;      // semi-extensión del dominio en el plano (a lo largo del eje)
export const DOM_V = 6.5;       // semi-extensión transversal
const RES_ALT = [512, 192];
const RES_SIM = [256, 96];
const G_ESCALA = 6.0;           // gravedad "de maqueta" para la relación de dispersión
const N_OLAS = 8;
const DESV = [0, 0.14, -0.20, 0.38, -0.46, 0.08, 0.62, -0.68];
const DIR0 = Math.PI;           // las olas viajan hacia -x (el barco navega hacia +x)

// ------------------------------------------------------------------ oleaje (GLSL + espejo en JS)
export const GLSL_OLEAJE = /* glsl */`
  uniform float uAmp; uniform float uLambda; uniform float uDrag; uniform float uTMar;
  const int N_OLAS = ${N_OLAS};
  const float DESV[${N_OLAS}] = float[](${DESV.map((v) => v.toFixed(3)).join(', ')});
  float oleaje(vec2 p, float t){
    float k = 6.2831853 / uLambda;
    float suma = 0.0, norma = 0.0, amp = 1.0, freq = k;
    for (int i = 0; i < N_OLAS; i++){
      float a = ${DIR0.toFixed(5)} + DESV[i];
      vec2 d = vec2(cos(a), sin(a));
      float om = sqrt(${G_ESCALA.toFixed(2)} * freq);
      float x = dot(d, p) * freq - om * t + float(i) * 1.7;
      float w = exp(sin(x) - 1.0);
      float dw = w * cos(x);
      suma += w * amp; norma += amp;
      p -= d * dw * amp * uDrag / freq;
      amp *= 0.74; freq *= 1.34;
    }
    return uAmp * (suma / norma - 0.4658) * 1.9;
  }`;

export function oleajeJS(u, v, t, { amp, lambda, drag }) {
  const k = (Math.PI * 2) / lambda;
  let suma = 0, norma = 0, a = 1, freq = k, px = u, pz = v;
  for (let i = 0; i < N_OLAS; i++) {
    const ang = DIR0 + DESV[i];
    const dx = Math.cos(ang), dz = Math.sin(ang);
    const om = Math.sqrt(G_ESCALA * freq);
    const x = (dx * px + dz * pz) * freq - om * t + i * 1.7;
    const w = Math.exp(Math.sin(x) - 1);
    const dw = w * Math.cos(x);
    suma += w * a; norma += a;
    px -= dx * dw * a * drag / freq; pz -= dz * dw * a * drag / freq;
    a *= 0.74; freq *= 1.34;
  }
  return amp * (suma / norma - 0.4658) * 1.9;
}

// ------------------------------------------------------------------ shaders
const VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const GLSL_PLANO = /* glsl */`
  uniform vec3 uN; uniform vec3 uE1; uniform vec3 uE2; uniform float uD;
  uniform sampler2D tPerfil;
  const float X0 = ${BASE_INT_X.toFixed(3)}; const float X1 = ${CORCHO_INT_X.toFixed(3)};
  float rIn(float x){ return texture2D(tPerfil, vec2((x - X0) / (X1 - X0), 0.5)).r; }
  bool dentro(vec3 P, float margen){
    if (P.x < X0 + 0.02 || P.x > X1) return false;
    return length(P.yz) < rIn(P.x) - margen;
  }
  vec3 puntoPlano(vec2 uv){ return uE1 * uv.x + uE2 * uv.y + uN * uD; }
`;

const FRAG_SIM = /* glsl */`
  uniform sampler2D tSim; uniform vec2 uTexel; uniform vec2 uDominio; uniform float uC2; uniform float uAmort;
  uniform float uSlosh; uniform vec4 uGotas[8]; uniform float uTiempoSim;
  ${GLSL_PLANO}
  varying vec2 vUv;
  vec2 aPlano(vec2 uv){ return (uv - 0.5) * 2.0 * uDominio; }
  void main(){
    vec2 p = aPlano(vUv);
    vec3 P = puntoPlano(p);
    bool ok = dentro(P, 0.05);
    vec4 c = texture2D(tSim, vUv);
    if (!ok){ gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
    float h = c.r, hp = c.g;
    vec2 e = uTexel;
    vec2 pd = aPlano(vUv + vec2(e.x, 0.0)) - p;
    float hr = dentro(puntoPlano(p + vec2(pd.x, 0.0)), 0.05) ? texture2D(tSim, vUv + vec2(e.x, 0.0)).r : h;
    float hl = dentro(puntoPlano(p - vec2(pd.x, 0.0)), 0.05) ? texture2D(tSim, vUv - vec2(e.x, 0.0)).r : h;
    float hu = dentro(puntoPlano(p + vec2(0.0, pd.x)), 0.05) ? texture2D(tSim, vUv + vec2(0.0, e.y)).r : h;
    float hd = dentro(puntoPlano(p - vec2(0.0, pd.x)), 0.05) ? texture2D(tSim, vUv - vec2(0.0, e.y)).r : h;
    float lap = hr + hl + hu + hd - 4.0 * h;
    float hn = 2.0 * h - hp + uC2 * lap;
    hn = h + (hn - h) * uAmort;
    // chapoteo: el agua se amontona en el extremo cuesta abajo y baja en el opuesto
    bool derecha = !dentro(puntoPlano(p + vec2(pd.x * 3.0, 0.0)), 0.05);
    bool izquierda = !dentro(puntoPlano(p - vec2(pd.x * 3.0, 0.0)), 0.05);
    if (derecha) hn += uSlosh;
    if (izquierda) hn -= uSlosh;
    for (int i = 0; i < 8; i++){
      vec4 g = uGotas[i];
      if (g.z != 0.0){
        float d2 = dot(p - g.xy, p - g.xy);
        hn += g.z * exp(-d2 / (g.w * g.w));
      }
    }
    gl_FragColor = vec4(clamp(hn, -0.6, 0.6), h, 0.0, 1.0);
  }`;

const FRAG_ALTURA = /* glsl */`
  uniform sampler2D tSim; uniform sampler2D tPrev; uniform sampler2D tRuido;
  uniform vec2 uDominio; uniform float uTiempoMar; uniform float uDt; uniform float uRiple;
  uniform float uEspuma; uniform float uAdv; uniform vec2 uTexelSim; uniform vec4 uCasco;
  ${GLSL_OLEAJE}
  varying vec2 vUv;
  float total(vec2 p, vec2 uv){
    return oleaje(p, uTiempoMar) + clamp(texture2D(tSim, uv).r, -0.5, 0.5) * uRiple;
  }
  void main(){
    vec2 p = (vUv - 0.5) * 2.0 * uDominio;
    float e = 0.045;
    vec2 ex = vec2(e, 0.0), ez = vec2(0.0, e);
    vec2 sx = vec2(e / (2.0 * uDominio.x), 0.0), sz = vec2(0.0, e / (2.0 * uDominio.y));
    float h  = total(p, vUv);
    float hx = total(p + ex, vUv + sx);
    float hz = total(p + ez, vUv + sz);
    float gu = (hx - h) / e, gv = (hz - h) / e;
    // espuma: cresta alta y empinada + energía de chapoteo; se arrastra con la ola
    vec2 uvPrev = vUv + vec2(uAdv * uDt / (2.0 * uDominio.x), 0.0);
    float prev = texture2D(tPrev, uvPrev).a;
    float emision = 0.0;
    float amp = uAmp;
    float crest = smoothstep(0.32, 0.78, h / max(amp, 1e-3) + 0.15) * smoothstep(0.55, 1.05, length(vec2(gu, gv)) / (0.55 + 0.4 * amp));
    float rn = texture2D(tRuido, p * 0.21 + vec2(uTiempoMar * 0.05, 0.0)).g;
    emision += crest * (0.35 + 0.9 * rn) * uEspuma;
    float vel = abs(texture2D(tSim, vUv).r - texture2D(tSim, vUv).g);
    emision += smoothstep(0.010, 0.05, vel) * 0.55 * uEspuma;
    // espuma del barco: borde del casco, ola de proa y estela
    vec2 rel = p - uCasco.xy;
    float dx = dot(rel, uCasco.zw), dz = rel.x * (-uCasco.w) + rel.y * uCasco.z;
    float semiAncho = 0.82 * sqrt(max(0.0, 1.0 - (dx / 4.3) * (dx / 4.3)));
    float dBorde = abs(dz) - semiAncho;
    float banda = smoothstep(0.5, 0.02, dBorde) * step(-0.25, dBorde) * smoothstep(-4.4, 3.2, dx) * step(abs(dx), 4.4);
    float proa = exp(-((dx - 4.3) * (dx - 4.3) * 0.9 + dz * dz * 2.4)) * 1.1;
    float atras = max(0.0, -3.9 - dx);
    float sig = 0.45 + 0.13 * atras;
    float estela = step(-3.9, -dx) * exp(-atras * 0.20) * exp(-dz * dz / (sig * sig)) * 0.95 * smoothstep(-11.0, -4.0, dx);
    float rn2 = texture2D(tRuido, p * 0.8 + vec2(uTiempoMar * 0.04, 0.3)).r;
    emision += (banda * 0.75 + proa + estela * (0.45 + 0.9 * rn2)) * uEspuma * 0.8 + (banda * 0.35 + proa * 0.6) * 0.5 * (0.10 + 0.90 * clamp(uEspuma * 2.0, 0.0, 1.0));
    float foam = max(prev * exp(-uDt / 1.3), clamp(emision, 0.0, 1.0));
    gl_FragColor = vec4(h, gu, gv, foam);
  }`;

const FRAG_VOLUMEN = /* glsl */`
  uniform sampler2D tColor; uniform sampler2D tProf; uniform sampler2D tFrente; uniform sampler2D tFondo;
  uniform sampler2D tAltura; uniform sampler2D tRuido; uniform samplerCube tEntorno; uniform sampler2D tRefl;
  uniform vec3 uCam; uniform mat3 uCamMat; uniform vec2 uProy; uniform float uNear; uniform float uFar;
  uniform mat4 uViewProj; uniform vec2 uRes;
  uniform vec2 uDominio; uniform float uHmax; uniform mat3 uEntornoRot; uniform float uTiempo; uniform vec3 uLuzExt;
  uniform vec3 uSol; uniform vec3 uSolColor; uniform vec3 uSigma; uniform vec3 uDispersion; uniform float uHayRefl;
  uniform vec3 uOscuro; uniform float uAmp;
  uniform float uNiebla; uniform vec3 uColNiebla; uniform float uRayoFondo;
  ${GLSL_PLANO}
  varying vec2 vUv;

  vec4 alturaEn(vec3 P){
    vec2 q = vec2(dot(P, uE1), dot(P, uE2)) / (2.0 * uDominio) + 0.5;
    return texture2D(tAltura, q);
  }
  float distDesdeProf(float d, vec3 rdView){
    float z = 2.0 * uNear * uFar / (uFar + uNear - (d * 2.0 - 1.0) * (uFar - uNear));
    return z / max(-rdView.z, 1e-3);
  }
  vec3 rdViewDe(vec2 uv){ return normalize(vec3((uv * 2.0 - 1.0) / uProy, -1.0)); }
  vec3 conNiebla(vec3 c, float t0, float t1, float dEsc){
    if (uNiebla <= 0.0) return c;
    float L = clamp(min(dEsc, t1) - t0, 0.0, 30.0);
    float a = 1.0 - exp(-uNiebla * L);
    return mix(c, uColNiebla * (0.35 + 0.65 * length(uOscuro) * 0.577), a);
  }
  vec3 envMuestra(vec3 dir, float lod){ return textureLod(tEntorno, uEntornoRot * dir, lod).rgb * uLuzExt; }

  void main(){
    vec4 base = texture2D(tColor, vUv);
    float tIn = texture2D(tFrente, vUv).r;
    float tOut = texture2D(tFondo, vUv).r;
    if (tIn <= 0.0 || tOut <= tIn){ gl_FragColor = base; return; }
    vec3 rdViewBase = normalize(vec3((vUv * 2.0 - 1.0) / uProy, -1.0));
    float dEscBase = distDesdeProf(texture2D(tProf, vUv).r, rdViewBase);

    vec2 ndc = vUv * 2.0 - 1.0;
    vec3 rdView = normalize(vec3(ndc.x / uProy.x, ndc.y / uProy.y, -1.0));
    vec3 rd = normalize(uCamMat * rdView);
    vec3 ro = uCam;
    float k = dot(uN, rd);
    float s0 = dot(uN, ro) - uD;
    // pixel del mundo a esta distancia, para el borde suave
    float tPix = tIn * 2.0 / (uRes.y * uProy.y);

    // intervalo de la losa de oleaje
    float tsA = (-uHmax - s0) / (abs(k) < 1e-5 ? 1e-5 : k);
    float tsB = ( uHmax - s0) / (abs(k) < 1e-5 ? 1e-5 : k);
    float ts0 = min(tsA, tsB), ts1 = max(tsA, tsB);

    float tE = -1.0; bool porSuperficie = false; float alfa = 1.0;
    {
      vec3 P = ro + rd * tIn;
      float f0 = (dot(uN, P) - uD) - alturaEn(P).r;
      if (f0 < 0.0) { tE = tIn; }
      else {
        float ta = max(tIn, ts0), tb = min(tOut, ts1);
        if (tb > ta) {
          float tPrev = ta; vec3 Pp = ro + rd * ta;
          float fPrev = (dot(uN, Pp) - uD) - alturaEn(Pp).r;
          float fmin = fPrev, tmin = ta;
          for (int i = 1; i <= 22; i++){
            float t = mix(ta, tb, float(i) / 22.0);
            vec3 Pi = ro + rd * t;
            float f = (dot(uN, Pi) - uD) - alturaEn(Pi).r;
            if (f < fmin){ fmin = f; tmin = t; }
            if (fPrev > 0.0 && f <= 0.0){
              float lo = tPrev, hi = t;
              for (int j = 0; j < 6; j++){
                float m = 0.5 * (lo + hi);
                vec3 Pm = ro + rd * m;
                if ((dot(uN, Pm) - uD) - alturaEn(Pm).r > 0.0) lo = m; else hi = m;
              }
              tE = hi; porSuperficie = true; break;
            }
            tPrev = t; fPrev = f;
          }
          if (tE < 0.0){
            // sin cruce: borde suave si el rayo roza la cresta
            float eps = tPix * 1.6;
            if (fmin < eps){ tE = tmin; porSuperficie = true; alfa = clamp(1.0 - fmin / eps, 0.0, 1.0); }
          }
        }
      }
    }
    if (tE < 0.0){ gl_FragColor = vec4(conNiebla(base.rgb, tIn, tOut, dEscBase), 1.0); return; }

    // distancia a lo que hay en este píxel (barco, mesa...)
    float dEsc0 = dEscBase;
    if (dEsc0 < tE - 0.02){ gl_FragColor = vec4(conNiebla(base.rgb, tIn, tOut, dEscBase), 1.0); return; }

    vec3 P = ro + rd * tE;
    vec4 al = alturaEn(P);
    vec3 resultado;

    if (porSuperficie){
      vec3 N = normalize(uN - al.g * uE1 - al.b * uE2);
      float cosT = clamp(dot(N, -rd), 0.03, 1.0);
      float F = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
      vec3 R = reflect(rd, N);
      R -= uN * min(dot(R, uN), 0.0) * 1.0;
      R = normalize(R + uN * 0.02);
      vec3 envR = envMuestra(R, 1.5) * 0.9;
      // reflejo plano del barco
      vec4 pc = uViewProj * vec4(P, 1.0);
      vec2 uvP = pc.xy / pc.w * 0.5 + 0.5;
      if (uHayRefl > 0.5){
        vec4 rf = texture2D(tRefl, uvP + vec2(dot(N - uN, uE1), dot(N - uN, uE2)) * 0.06);
        envR = mix(envR, rf.rgb, rf.a);
      }
      // refracción: sigue el rayo dentro del agua y busca qué se ve debajo
      vec3 T = refract(rd, N, 1.0 / 1.333);
      float Lw = max(tOut - tE, 0.0);
      float Lmax = min(Lw, 3.5);
      vec3 Pe = P + T * Lmax;
      vec4 pe = uViewProj * vec4(Pe, 1.0);
      vec2 uvT = pe.xy / pe.w * 0.5 + 0.5;
      float dE = distDesdeProf(texture2D(tProf, uvT).r, rdViewDe(uvT));
      if (dE < tE - 0.02) uvT = vUv; // algo delante de la superficie: no desplazar
      vec3 Cs = texture2D(tColor, uvT).rgb;
      float dEsc = distDesdeProf(texture2D(tProf, uvT).r, rdViewDe(uvT));
      float L = clamp(min(dEsc, tOut) - tE, 0.0, 30.0);
      vec3 trans = exp(-uSigma * L);
      vec3 colorAgua = vec3(0.008, 0.20, 0.27);
      float profMedia = max(0.0, -(dot(uN, ro + rd * (tE + L * 0.5)) - uD) + 0.0);
      vec3 luzDispersa = colorAgua * (0.10 + 0.90 * exp(-profMedia * 0.42));
      vec3 sub = Cs * trans + luzDispersa * (1.0 - exp(-uSigma.g * 1.6 * L)) * uOscuro;
      // translucidez en crestas
      float altN = clamp(al.r / max(uAmp * 0.55, 0.14), 0.0, 1.0);
      float contra = pow(clamp(dot(T, uSol) * 0.5 + 0.5, 0.0, 1.0), 3.0);
      sub += vec3(0.05, 0.42, 0.36) * altN * (0.25 + contra) * 0.55 * uOscuro;
      // brillo solar
      float spec = pow(max(dot(R, uSol), 0.0), 380.0) * 14.0;
      vec3 superficie = sub * (1.0 - F) + envR * F + uSolColor * spec * F;
      // espuma
      float rn = texture2D(tRuido, vec2(dot(P, uE1), dot(P, uE2)) * 0.45 + 0.13).g;
      float rn2 = texture2D(tRuido, vec2(dot(P, uE1), dot(P, uE2)) * 1.7).b;
      float fm = clamp(al.a * (0.55 + 0.9 * rn) - 0.12 * rn2, 0.0, 1.0);
      fm = smoothstep(0.12, 0.62, fm);
      vec3 colEsp = vec3(0.80, 0.86, 0.88) * (0.50 + 0.55 * clamp(dot(N, uSol) * 0.5 + 0.55, 0.0, 1.0)) * uOscuro + envR * 0.15;
      resultado = mix(superficie, colEsp, fm);
    } else {
      // entra por la pared de cristal (por debajo de la línea de flotación)
      float prof = max(0.0, al.r - (dot(uN, P) - uD));
      float dEsc = dEsc0;
      float L = clamp(min(dEsc, tOut) - tE, 0.0, 30.0);
      vec3 trans = exp(-uSigma * L);
      vec3 colorAgua = vec3(0.008, 0.20, 0.27);
      float profMedia = max(0.0, -(dot(uN, ro + rd * (tE + L * 0.5)) - uD));
      float gradiente = exp(-(profMedia + prof) * 0.50);
      vec3 luzDispersa = colorAgua * (0.07 + 0.93 * gradiente);
      vec3 sub = base.rgb * trans + luzDispersa * (1.0 - exp(-uSigma.g * 1.6 * L)) * uOscuro;
      // cáusticas: filamentos de luz que bailan bajo la superficie
      vec2 pc = vec2(dot(P, uE1), dot(P, uE2));
      float c1 = texture2D(tRuido, pc * 0.47 + vec2(uTiempo * 0.045, uTiempo * 0.02)).g;
      float c2 = texture2D(tRuido, pc * 0.51 + vec2(-uTiempo * 0.035, uTiempo * 0.03)).b;
      float caus = pow(clamp(1.0 - abs(c1 - c2) * 3.2, 0.0, 1.0), 6.0);
      sub += vec3(0.18, 0.55, 0.55) * caus * gradiente * gradiente * 0.38 * uOscuro;
      // burbujas y espuma bajo la superficie
      float rn = texture2D(tRuido, vec2(dot(P, uE1) * 0.8 + uTiempo * 0.03, dot(P, uE2) * 0.8 + prof * 0.7)).r;
      float burb = al.a * exp(-prof * 2.4) * smoothstep(0.35, 0.75, rn);
      sub = mix(sub, vec3(0.62, 0.80, 0.84) * uOscuro, clamp(burb, 0.0, 0.85));
      // menisco: línea brillante donde el agua toca el cristal
      float menisco = exp(-prof * 22.0);
      sub += vec3(0.20, 0.28, 0.30) * menisco * uOscuro;
      resultado = sub;
    }
    gl_FragColor = vec4(conNiebla(mix(base.rgb, resultado, alfa), tIn, tOut, dEscBase), 1.0);
  }`;

const FRAG_DIST = /* glsl */`
  varying vec3 vP; void main(){ gl_FragColor = vec4(length(vP), 0.0, 0.0, 1.0); }`;
const VERT_DIST = /* glsl */`
  varying vec3 vP; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vP = mv.xyz; gl_Position = projectionMatrix * mv; }`;

// ------------------------------------------------------------------ módulo
export function crearAgua({ renderer, botella, texRuido, cubo, relleno = 0.30 }) {
  const gl = renderer.getContext();
  const flotante = renderer.extensions.has('EXT_color_buffer_float');
  const flotanteLineal = flotante && renderer.extensions.has('OES_texture_float_linear');
  const tipoSim = flotanteLineal ? THREE.FloatType : THREE.HalfFloatType;

  const mkRT = (w, h, type, extra = {}) => new THREE.WebGLRenderTarget(w, h, {
    type, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    depthBuffer: false, stencilBuffer: false, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, ...extra,
  });
  // el campo de simulación usa muestreo lineal solo si el tipo lo permite; si no, vecino más cercano
  const simFiltro = THREE.LinearFilter;
  const rtSim = [0, 1].map(() => mkRT(RES_SIM[0], RES_SIM[1], tipoSim, { minFilter: simFiltro, magFilter: simFiltro }));
  const rtAlt = [0, 1].map(() => mkRT(RES_ALT[0], RES_ALT[1], THREE.HalfFloatType));
  const rtFrente = mkRT(2, 2, flotante ? THREE.FloatType : THREE.HalfFloatType, { depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const rtFondo = mkRT(2, 2, flotante ? THREE.FloatType : THREE.HalfFloatType, { depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  let sim = 0, alt = 0;

  const U = {
    uN: { value: new THREE.Vector3(0, 1, 0) }, uE1: { value: new THREE.Vector3(1, 0, 0) }, uE2: { value: new THREE.Vector3(0, 0, 1) },
    uD: { value: 0 }, tPerfil: { value: botella.texPerfil },
    uAmp: { value: 0.2 }, uLambda: { value: 3.5 }, uDrag: { value: 0.5 }, uTMar: { value: 0 },
  };

  const quad = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms: { ...uniforms }, depthTest: false, depthWrite: false });
  const gotas = Array.from({ length: 8 }, () => new THREE.Vector4());
  const matSim = quad(FRAG_SIM, {
    tSim: { value: null }, uTexel: { value: new THREE.Vector2(1 / RES_SIM[0], 1 / RES_SIM[1]) }, uDominio: { value: new THREE.Vector2(DOM_U, DOM_V) },
    uC2: { value: 0.12 }, uAmort: { value: 0.9965 }, uSlosh: { value: 0 }, uGotas: { value: gotas }, uTiempoSim: { value: 0 },
    uN: U.uN, uE1: U.uE1, uE2: U.uE2, uD: U.uD, tPerfil: U.tPerfil,
  });
  const matAlt = quad(FRAG_ALTURA, {
    tSim: { value: null }, tPrev: { value: null }, tRuido: { value: texRuido }, uDominio: { value: new THREE.Vector2(DOM_U, DOM_V) },
    uTiempoMar: { value: 0 }, uDt: { value: 1 / 60 }, uRiple: { value: 1 }, uEspuma: { value: 1 }, uAdv: { value: 2 }, uTexelSim: { value: new THREE.Vector2(1 / RES_SIM[0], 1 / RES_SIM[1]) },
    uAmp: U.uAmp, uLambda: U.uLambda, uDrag: U.uDrag, uCasco: { value: new THREE.Vector4(-4, 0, 1, 0) },
  });
  const UV = {
    tColor: { value: null }, tProf: { value: null }, tFrente: { value: rtFrente.texture }, tFondo: { value: rtFondo.texture },
    tAltura: { value: null }, tRuido: { value: texRuido }, tEntorno: { value: cubo }, tRefl: { value: null },
    uCam: { value: new THREE.Vector3() }, uCamMat: { value: new THREE.Matrix3() }, uProy: { value: new THREE.Vector2(1, 1) },
    uNear: { value: 1 }, uFar: { value: 100 }, uViewProj: { value: new THREE.Matrix4() }, uRes: { value: new THREE.Vector2(1, 1) },
    uDominio: { value: new THREE.Vector2(DOM_U, DOM_V) }, uHmax: { value: 1 }, uEntornoRot: { value: new THREE.Matrix3() },
    uTiempo: { value: 0 }, uLuzExt: { value: new THREE.Color(1, 1, 1) }, uSol: { value: new THREE.Vector3(0, 1, 0) }, uSolColor: { value: new THREE.Vector3(1, 0.93, 0.8) },
    uSigma: { value: new THREE.Vector3(0.55, 0.16, 0.10) }, uDispersion: { value: new THREE.Vector3() }, uHayRefl: { value: 0 },
    uOscuro: { value: new THREE.Color(1, 1, 1) }, uAmp: U.uAmp, uNiebla: { value: 0 }, uColNiebla: { value: new THREE.Color(0.6, 0.65, 0.7) }, uRayoFondo: { value: 0 },
    uN: U.uN, uE1: U.uE1, uE2: U.uE2, uD: U.uD, tPerfil: U.tPerfil,
  };
  const matVol = quad(FRAG_VOLUMEN, UV);

  const triGeo = new THREE.BufferGeometry();
  triGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const tri = new THREE.Mesh(triGeo, matSim); tri.frustumCulled = false;
  const escenaQuad = new THREE.Scene(); escenaQuad.add(tri);
  const camQuad = new THREE.Camera();
  const pasada = (mat, rt) => { tri.material = mat; renderer.setRenderTarget(rt); renderer.render(escenaQuad, camQuad); };

  // Cáscara interior para obtener distancias de entrada y salida del volumen de la botella.
  const matDist = new THREE.ShaderMaterial({ vertexShader: VERT_DIST, fragmentShader: FRAG_DIST, side: THREE.DoubleSide });
  const meshInt = new THREE.Mesh(botella.interior, matDist); meshInt.frustumCulled = false;
  const escenaInt = new THREE.Scene(); escenaInt.add(meshInt);

  // limpieza inicial de la simulación
  for (const rt of rtSim) { renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 1); renderer.clear(); }

  // ---- estado de fluido en CPU
  const P = botella.puntos, NP = P.length / 3;
  const NB = 512, hist = new Float32Array(NB);
  const f = { n: new THREE.Vector3(0, 1, 0), nVel: new THREE.Vector3(), d: 0, e1: new THREE.Vector3(1, 0, 0), e2: new THREE.Vector3(0, 0, 1), relleno, pend: 0 };
  const tmp = new THREE.Vector3();

  function calcularPlano(dt) {
    // d tal que el volumen por debajo del plano n·x = d sea 'relleno' (cuantil de proyecciones)
    let mn = 1e9, mx = -1e9;
    const nx = f.n.x, ny = f.n.y, nz = f.n.z;
    for (let i = 0; i < NP; i++) {
      const v = P[i * 3] * nx + P[i * 3 + 1] * ny + P[i * 3 + 2] * nz;
      if (v < mn) mn = v; if (v > mx) mx = v;
    }
    hist.fill(0);
    const esc = (NB - 1) / (mx - mn + 1e-6);
    for (let i = 0; i < NP; i++) {
      const v = P[i * 3] * nx + P[i * 3 + 1] * ny + P[i * 3 + 2] * nz;
      hist[((v - mn) * esc) | 0]++;
    }
    const objetivo = f.relleno * NP;
    let acc = 0, b = 0;
    while (b < NB && acc + hist[b] < objetivo) { acc += hist[b]; b++; }
    const frac = hist[b] > 0 ? (objetivo - acc) / hist[b] : 0;
    f.d = mn + (b + frac) / esc;
    calcularBase(dt);
  }

  // Base ortonormal del plano, continua: e1 se transporta desde el cuadro anterior y gira poco a poco hacia la
  // proyección del eje X de la botella mientras ese eje está bien definido (lejos de la botella de pie).
  // Antes e1 saltaba 90° al pasar de un umbral y el barco y el oleaje se teletransportaban.
  const tmp2 = new THREE.Vector3(), tmp3 = new THREE.Vector3();
  function calcularBase(dt) {
    const e1 = tmp2.copy(f.e1).addScaledVector(f.n, -f.e1.dot(f.n));
    if (e1.lengthSq() < 1e-6) e1.set(0, 0, 1).addScaledVector(f.n, -f.n.z);
    e1.normalize();
    const eje = tmp3.set(1, 0, 0).addScaledVector(f.n, -f.n.x);
    const l = eje.length();
    // peso 1 con el eje bien definido (|n.x| < 0.89), 0 con la botella casi de pie (|n.x| > 0.99)
    const peso = clamp((l - 0.15) / 0.30, 0, 1);
    if (peso > 0) {
      eje.divideScalar(l);
      const ang = Math.atan2(tmp.crossVectors(e1, eje).dot(f.n), e1.dot(eje));
      const giro = dt === undefined ? ang : Math.sign(ang) * Math.min(Math.abs(ang), 8 * peso * dt);
      tmp.crossVectors(f.n, e1);
      e1.multiplyScalar(Math.cos(giro)).addScaledVector(tmp, Math.sin(giro)).normalize();
    }
    f.e1.copy(e1);
    f.e2.crossVectors(f.n, f.e1).normalize();
  }
  calcularPlano();

  const mar = { amp: 0.2, lambda: 3.5, drag: 0.5, t: 0 };
  function configurarMar(nivel) {
    const m = clamp(nivel, 0, 1);
    mar.amp = 0.012 + 0.82 * Math.pow(m, 1.9);
    mar.lambda = mix(3.4, 4.7, m);
    mar.drag = mix(0.10, 0.95, Math.pow(m, 0.8));
    U.uAmp.value = mar.amp; U.uLambda.value = mar.lambda; U.uDrag.value = mar.drag;
    matAlt.uniforms.uEspuma.value = mix(0.0, 1.0, clamp((m - 0.14) / 0.72, 0, 1));
    UV.uHmax.value = 0.62 * mar.amp + 0.35;
  }
  configurarMar(0.08);

  // gravedad efectiva g (en el marco de la botella). Resorte-amortiguador para el chapoteo del plano.
  function actualizarFluido(dt, gEfectiva) {
    const objetivo = tmp.copy(gEfectiva).negate().normalize();
    const w = 6.5, z = 0.16;
    const sub = Math.max(1, Math.ceil(dt / 0.01)), h = dt / sub;
    const antes = f.n.clone();
    for (let i = 0; i < sub; i++) {
      const acc = objetivo.clone().sub(f.n).multiplyScalar(w * w).addScaledVector(f.nVel, -2 * z * w);
      f.nVel.addScaledVector(acc, h);
      f.n.addScaledVector(f.nVel, h).normalize();
      f.nVel.addScaledVector(f.n, -f.nVel.dot(f.n)); // la velocidad es tangente a la esfera
    }
    calcularPlano(dt);
    // impulso de chapoteo = velocidad del plano a lo largo de e1
    f.pend += clamp(f.nVel.dot(f.e1) * 0.006, -0.05, 0.05);
    return antes;
  }

  function agitar(e) { f.pend += (Math.random() * 2 - 1) * clamp(e, 0, 1.5) * 0.03; }

  function simular(dt, tiempo, impulsos) {
    const pasos = 2, h = dt / pasos;
    UV.uTiempo.value = tiempo;
    // gotas / toques pendientes
    for (let i = 0; i < 8; i++) gotas[i].set(0, 0, 0, 0.2);
    for (let i = 0; i < Math.min(8, impulsos.length); i++) gotas[i].set(impulsos[i][0], impulsos[i][1], impulsos[i][2], impulsos[i][3] || 0.18);
    impulsos.length = 0;
    for (let s = 0; s < pasos; s++) {
      matSim.uniforms.tSim.value = rtSim[sim].texture;
      matSim.uniforms.uSlosh.value = f.pend / pasos;
      pasada(matSim, rtSim[1 - sim]);
      sim = 1 - sim;
      for (let i = 0; i < 8; i++) gotas[i].z = 0;
    }
    f.pend = 0;
    // altura final
    matAlt.uniforms.tSim.value = rtSim[sim].texture;
    matAlt.uniforms.tPrev.value = rtAlt[alt].texture;
    matAlt.uniforms.uTiempoMar.value = tiempo;
    matAlt.uniforms.uDt.value = dt;
    pasada(matAlt, rtAlt[1 - alt]);
    alt = 1 - alt;
    UV.tAltura.value = rtAlt[alt].texture;
  }

  function sincronizarUniformes() {
    U.uN.value.copy(f.n); U.uE1.value.copy(f.e1); U.uE2.value.copy(f.e2); U.uD.value = f.d;
  }

  function pasadaVolumen(camara, rtEscena, rtDestino, opts) {
    const w = rtEscena.width, h = rtEscena.height;
    if (rtFrente.width !== w || rtFrente.height !== h) { rtFrente.setSize(w, h); rtFondo.setSize(w, h); }
    // distancias de entrada (más cercana) y salida (más lejana) del interior
    renderer.setClearColor(0x000000, 0);
    matDist.depthFunc = THREE.LessEqualDepth;
    renderer.setRenderTarget(rtFrente); renderer.render(escenaInt, camara);
    matDist.depthFunc = THREE.GreaterEqualDepth;
    renderer.state.buffers.depth.setClear(0); // para quedarnos con lo más lejano
    renderer.setRenderTarget(rtFondo); renderer.render(escenaInt, camara);
    renderer.state.buffers.depth.setClear(1);

    UV.tColor.value = rtEscena.texture; UV.tProf.value = rtEscena.depthTexture;
    UV.uCam.value.copy(camara.position);
    UV.uCamMat.value.setFromMatrix4(camara.matrixWorld);
    UV.uProy.value.set(camara.projectionMatrix.elements[0], camara.projectionMatrix.elements[5]);
    UV.uNear.value = camara.near; UV.uFar.value = camara.far;
    UV.uViewProj.value.multiplyMatrices(camara.projectionMatrix, camara.matrixWorldInverse);
    UV.uRes.value.set(w, h);
    UV.uEntornoRot.value.copy(opts.entornoRot);
    UV.uLuzExt.value.copy(opts.luz);
    UV.uNiebla.value = opts.niebla ?? 0; UV.uColNiebla.value.copy(opts.colNiebla);
    UV.uSol.value.copy(opts.sol);
    UV.uOscuro.value.copy(opts.luz);
    UV.tRefl.value = opts.refl || null; UV.uHayRefl.value = opts.refl ? 1 : 0;
    pasada(matVol, rtDestino);
  }

  return {
    estado: f, mar, U, uCasco: matAlt.uniforms.uCasco, configurarMar, agitar, actualizarFluido, simular, sincronizarUniformes, pasadaVolumen, configurarRelleno: (v) => { f.relleno = v; },
    alturaEn: (u, v, t) => oleajeJS(u, v, t, mar),
    uVolumen: UV, rtFrente, rtFondo,
  };
}
