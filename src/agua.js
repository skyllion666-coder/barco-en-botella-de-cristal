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
const DIR0 = Math.PI;           // las olas viajan hacia -x (el barco navega hacia +x)

// Espectro del oleaje: 18 ondas con longitudes, amplitudes (forma de espectro de mar real, con pico y cola),
// direcciones y desfases aleatorios pero fijos (semilla). Como no son múltiplos entre sí, el patrón no se repite:
// salen olas grandes, medianas y pequeñas mezcladas, y cruces cuando la tormenta abre las direcciones.
const N_OLAS = 18;
const azar = (() => { let s = 20261025; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
const FREC = [], AMPR = [], DESV = [], FASE = [];
for (let i = 0; i < N_OLAS; i++) {
  const f = Math.exp(Math.log(0.62) + (Math.log(3.4) - Math.log(0.62)) * (i + 0.5 * azar()) / N_OLAS); // número de onda relativo
  FREC.push(f);
  // amplitud: pico hacia f ≈ 1 y cola que cae con la frecuencia, con un 40 % de variación al azar
  AMPR.push(Math.pow(f, -1.15) * Math.exp(-0.55 / (f * f)) * (0.6 + 0.8 * azar()));
  DESV.push((azar() * 2 - 1) * (0.35 + 0.65 * azar()));
  FASE.push(azar() * Math.PI * 2);
}
const lista = (a) => a.map((v) => v.toFixed(4)).join(', ');
// al sumar muchas ondas con desfases distintos se compensan entre sí: se recupera la altura media de antes
const GANANCIA = 1.5;

// Parámetros del mar según la intensidad m (0 = calma, 1 = tormenta).
export function parametrosMar(nivel) {
  const m = clamp(nivel, 0, 1);
  return {
    amp: 0.012 + 0.82 * Math.pow(m, 1.9),
    lambda: mix(3.4, 4.7, m),
    drag: mix(0.10, 0.95, Math.pow(m, 0.8)),
    disp: mix(0.35, 1.0, m),                          // apertura de direcciones: mar de fondo ordenado → mar cruzado
    grupo: clamp((m - 0.25) / 0.6, 0, 1),             // fuerza de las series de olas
    grande: { u: 0, v: 0, t0: -1e9, a: 0, dx: -1, dy: 0, k: 1 }, // ola grande ocasional (ver lanzarOlaGrande)
  };
}

// ------------------------------------------------------------------ oleaje (GLSL + espejo en JS idéntico)
export const GLSL_OLEAJE = /* glsl */`
  uniform float uAmp; uniform float uLambda; uniform float uDrag; uniform float uTMar; uniform float uDisp; uniform float uGrupo;
  uniform vec4 uGrande; uniform vec3 uGrandeDir; // (u0, v0, t0, amplitud) y (dirección, número de onda)
  const int N_OLAS = ${N_OLAS};
  const float FREC[${N_OLAS}] = float[](${lista(FREC)});
  const float AMPR[${N_OLAS}] = float[](${lista(AMPR)});
  const float DESV[${N_OLAS}] = float[](${lista(DESV)});
  const float FASE[${N_OLAS}] = float[](${lista(FASE)});
  float oleaje(vec2 p, float t){
    vec2 p0 = p;
    float k0 = 6.2831853 / uLambda;
    float suma = 0.0, norma = 0.0;
    for (int i = 0; i < N_OLAS; i++){
      float a = ${DIR0.toFixed(5)} + DESV[i] * uDisp;
      vec2 d = vec2(cos(a), sin(a));
      float freq = k0 * FREC[i];
      float om = sqrt(${G_ESCALA.toFixed(2)} * freq);
      float x = dot(d, p) * freq - om * t + FASE[i];
      float w = exp(sin(x) - 1.0);
      float dw = w * cos(x);
      suma += w * AMPR[i]; norma += AMPR[i];
      p -= d * dw * AMPR[i] * uDrag / freq;
    }
    float h = (suma / norma - 0.4658) * 1.9 * ${GANANCIA.toFixed(2)};
    // series: una envolvente lenta que avanza a la velocidad de grupo (la mitad de la de las olas)
    float kg = k0 * 0.21, cg = 0.5 * sqrt(${G_ESCALA.toFixed(2)} / k0);
    float s = -p0.x * 0.97 + p0.y * 0.24;
    float env = 1.0 + uGrupo * (0.62 * sin(kg * (s - cg * t) + 1.3 * sin(t * 0.071)) + 0.25 * sin(kg * 0.53 * (s - cg * t) + 2.0));
    h *= max(env, 0.3);
    // ola grande: una cresta alta y empinada que cruza la botella
    if (uGrande.w > 0.0){
      float sg = dot(p0 - uGrande.xy, uGrandeDir.xy) - sqrt(${G_ESCALA.toFixed(2)} / uGrandeDir.z) * (t - uGrande.z);
      float sig = 2.2 / uGrandeDir.z;
      h += uGrande.w * exp(-sg * sg / (2.0 * sig * sig)) * (exp(cos(uGrandeDir.z * sg) - 1.0) * 1.6 - 0.55);
    }
    return uAmp * h;
  }`;

export function oleajeJS(u, v, t, { amp, lambda, drag, disp = 0.35, grupo = 0, grande = null }) {
  const k0 = (Math.PI * 2) / lambda;
  let suma = 0, norma = 0, px = u, pz = v;
  for (let i = 0; i < N_OLAS; i++) {
    const ang = DIR0 + DESV[i] * disp;
    const dx = Math.cos(ang), dz = Math.sin(ang);
    const freq = k0 * FREC[i];
    const om = Math.sqrt(G_ESCALA * freq);
    const x = (dx * px + dz * pz) * freq - om * t + FASE[i];
    const w = Math.exp(Math.sin(x) - 1);
    const dw = w * Math.cos(x);
    suma += w * AMPR[i]; norma += AMPR[i];
    px -= dx * dw * AMPR[i] * drag / freq; pz -= dz * dw * AMPR[i] * drag / freq;
  }
  let h = (suma / norma - 0.4658) * 1.9 * GANANCIA;
  const kg = k0 * 0.21, cg = 0.5 * Math.sqrt(G_ESCALA / k0);
  const s = -u * 0.97 + v * 0.24;
  const env = 1 + grupo * (0.62 * Math.sin(kg * (s - cg * t) + 1.3 * Math.sin(t * 0.071)) + 0.25 * Math.sin(kg * 0.53 * (s - cg * t) + 2.0));
  h *= Math.max(env, 0.3);
  if (grande && grande.a > 0) {
    const sg = (u - grande.u) * grande.dx + (v - grande.v) * grande.dy - Math.sqrt(G_ESCALA / grande.k) * (t - grande.t0);
    const sig = 2.2 / grande.k;
    h += grande.a * Math.exp(-sg * sg / (2 * sig * sig)) * (Math.exp(Math.cos(grande.k * sg) - 1) * 1.6 - 0.55);
  }
  return amp * h;
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
  uniform float uEspuma; uniform float uAdv; uniform vec2 uTexelSim; uniform vec4 uCasco; uniform vec2 uEscCasco;
  uniform float uCabrilleo; uniform vec2 uVientoDir; uniform float uBiolumAlt;
  ${GLSL_OLEAJE}
  varying vec2 vUv;
  // cabrilleo: ondas pequeñas que el viento levanta sobre las olas y que corren con él
  float cabrilleo(vec2 p){
    vec2 v = uVientoDir * uTiempoMar;
    return ((texture2D(tRuido, p * 0.55 + v * 0.30).r - 0.5) * 0.6 + (texture2D(tRuido, p * 1.35 + v * 0.62 + 0.37).g - 0.5) * 0.4) * uCabrilleo;
  }
  float total(vec2 p, vec2 uv){
    return oleaje(p, uTiempoMar) + clamp(texture2D(tSim, uv).r, -0.5, 0.5) * uRiple + cabrilleo(p);
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
    // solo rompen (y hacen espuma) las crestas altas y empinadas: con el oleaje irregular, las grandes
    float crest = smoothstep(0.42, 1.05, h / max(amp, 1e-3)) * smoothstep(0.5, 1.0, length(vec2(gu, gv)) / (0.55 + 0.4 * amp));
    float rn = texture2D(tRuido, p * 0.21 + vec2(uTiempoMar * 0.05, 0.0)).g;
    emision += crest * (0.35 + 0.9 * rn) * uEspuma;
    float vel = abs(texture2D(tSim, vUv).r - texture2D(tSim, vUv).g);
    emision += smoothstep(0.010, 0.05, vel) * 0.55 * uEspuma;
    // espuma del barco: borde del casco, ola de proa y estela
    vec2 rel = p - uCasco.xy;
    // a lo largo y a lo ancho del casco, en medidas del casco procedural
    float dx = dot(rel, uCasco.zw) / uEscCasco.x, dz = (rel.x * (-uCasco.w) + rel.y * uCasco.z) / uEscCasco.y;
    float semiAncho = 0.82 * sqrt(max(0.0, 1.0 - (dx / 4.3) * (dx / 4.3)));
    float dBorde = abs(dz) - semiAncho;
    float banda = smoothstep(0.5, 0.02, dBorde) * step(-0.25, dBorde) * smoothstep(-4.4, 3.2, dx) * step(abs(dx), 4.4);
    float proa = exp(-((dx - 4.3) * (dx - 4.3) * 0.9 + dz * dz * 2.4)) * 1.1;
    float atras = max(0.0, -3.9 - dx);
    float sig = 0.45 + 0.13 * atras;
    float estela = step(-3.9, -dx) * exp(-atras * 0.20) * exp(-dz * dz / (sig * sig)) * 0.95 * smoothstep(-11.0, -4.0, dx);
    float rn2 = texture2D(tRuido, p * 0.8 + vec2(uTiempoMar * 0.04, 0.3)).r;
    emision += (banda * 0.75 + proa + estela * (0.45 + 0.9 * rn2)) * uEspuma * 0.8 + (banda * 0.35 + proa * 0.6) * 0.5 * (0.10 + 0.90 * clamp(uEspuma * 2.0, 0.0, 1.0));
    emision += (banda * 0.45 + proa * 0.7 + estela * (0.35 + 0.5 * rn2)) * uBiolumAlt; // de noche la estela brilla
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
  uniform float uAire; uniform vec3 uColAire; uniform float uNubes; uniform float uBiolum;
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
  // Aire del interior de la botella: niebla y atmósfera del clima (nubes de tormenta que se mueven, noche...).
  // Solo afecta a lo que se ve a través de la cavidad; la habitación de alrededor no cambia.
  vec3 conNiebla(vec3 c, float t0, float t1, float dEsc, vec3 rd, float t1Aire){
    float L = clamp(min(dEsc, t1) - t0, 0.0, 30.0);
    if (uNiebla > 0.0){
      float a = 1.0 - exp(-uNiebla * L);
      c = mix(c, uColNiebla * (0.35 + 0.65 * length(uOscuro) * 0.577), a);
    }
    L = clamp(min(dEsc, t1Aire) - t0, 0.0, 30.0); // la atmósfera solo cuenta el tramo de aire
    if (uAire > 0.0 && L > 0.0){
      vec3 Pm = uCam + rd * (t0 + L * 0.5);
      float h = dot(uN, Pm) - uD;
      vec2 q = vec2(dot(Pm, uE1), dot(Pm, uE2));
      float nub = texture2D(tRuido, q * 0.075 + vec2(uTiempo * 0.010, uTiempo * 0.003)).r * 0.6
                + texture2D(tRuido, q * 0.19 - vec2(uTiempo * 0.022, -uTiempo * 0.006)).g * 0.4;
      // más densa arriba (nubes) que junto al agua
      float dens = uAire * (0.5 + 0.9 * smoothstep(-0.5, 4.5, h)) * mix(1.0, 0.25 + 1.5 * nub, uNubes);
      float a = 1.0 - exp(-dens * L);
      c = mix(c, uColAire * (0.75 + 0.5 * nub * uNubes), a);
    }
    return c;
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
    if (tE < 0.0){ gl_FragColor = vec4(conNiebla(base.rgb, tIn, tOut, dEscBase, rd, tOut), 1.0); return; }

    // distancia a lo que hay en este píxel (barco, mesa...)
    float dEsc0 = dEscBase;
    if (dEsc0 < tE - 0.02){ gl_FragColor = vec4(conNiebla(base.rgb, tIn, tOut, dEscBase, rd, tOut), 1.0); return; }

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
      // espuma de mar: encaje fino de filamentos y huecos (donde se cruzan dos ruidos), semitransparente; solo la
      // espuma recién hecha se junta en islas más densas. Va pegada al agua y deriva despacio.
      vec2 pq = vec2(dot(P, uE1), dot(P, uE2));
      float a1 = texture2D(tRuido, pq * 0.95 + vec2(uTiempo * 0.020, 0.0)).g;
      float a2 = texture2D(tRuido, pq * 1.10 + vec2(0.31, 0.17 - uTiempo * 0.016)).b;
      float encaje = pow(clamp(1.0 - abs(a1 - a2) * 3.6, 0.0, 1.0), 2.5);
      float cob = clamp(al.a * (0.75 + 0.6 * rn), 0.0, 1.0);
      float islas = smoothstep(0.55, 0.85, cob) * smoothstep(0.45, 0.75, rn2);
      float fm = smoothstep(0.08, 0.5, cob) * max(encaje, islas);
      fm = clamp(fm * (0.75 + 0.35 * rn2), 0.0, 0.88);
      // la espuma: blanca algo azulada, con brillos sueltos donde las burbujas miran al sol
      float chisp = pow(max(dot(R, uSol), 0.0), 24.0) * step(0.6, texture2D(tRuido, pq * 3.1).r);
      vec3 colEsp = vec3(0.80, 0.86, 0.88) * (0.50 + 0.55 * clamp(dot(N, uSol) * 0.5 + 0.55, 0.0, 1.0)) * uOscuro + envR * 0.15 + uSolColor * chisp * 0.8;
      resultado = mix(superficie, colEsp, fm);
      // bioluminiscencia: de noche el agua agitada (espuma, estela, crestas) brilla en azul verdoso, a destellos
      float chispa = 0.55 + 0.45 * sin(uTiempo * 6.0 + rn * 40.0 + rn2 * 17.0);
      float agit = clamp(fm * 1.3 + al.a * 0.9 + length(vec2(al.g, al.b)) * 0.12, 0.0, 1.6);
      resultado += vec3(0.04, 0.70, 0.95) * agit * chispa * uBiolum * 1.5;
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
      sub += vec3(0.04, 0.60, 0.90) * clamp(burb * 1.5 + al.a * 0.5, 0.0, 1.0) * uBiolum * (0.6 + 0.4 * sin(uTiempo * 5.0 + rn * 30.0));
      // menisco: línea brillante donde el agua toca el cristal
      float menisco = exp(-prof * 22.0);
      sub += vec3(0.20, 0.28, 0.30) * menisco * uOscuro;
      resultado = sub;
    }
    gl_FragColor = vec4(conNiebla(mix(base.rgb, resultado, alfa), tIn, tOut, dEscBase, rd, mix(tOut, tE, alfa)), 1.0);
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
    uDisp: { value: 0.35 }, uGrupo: { value: 0 }, uGrande: { value: new THREE.Vector4(0, 0, -1e9, 0) }, uGrandeDir: { value: new THREE.Vector3(-1, 0, 1) },
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
    uAmp: U.uAmp, uLambda: U.uLambda, uDrag: U.uDrag, uDisp: U.uDisp, uGrupo: U.uGrupo, uGrande: U.uGrande, uGrandeDir: U.uGrandeDir,
    uCabrilleo: { value: 0 }, uVientoDir: { value: new THREE.Vector2(-1, 0) }, uBiolumAlt: { value: 0 }, uCasco: { value: new THREE.Vector4(-4, 0, 1, 0) }, uEscCasco: { value: new THREE.Vector2(1, 1) },
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
    uAire: { value: 0 }, uColAire: { value: new THREE.Color() }, uNubes: { value: 0 }, uBiolum: { value: 0 },
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

  const mar = parametrosMar(0.08);
  function configurarMar(nivel) {
    const m = clamp(nivel, 0, 1);
    const q = parametrosMar(m);
    mar.amp = q.amp; mar.lambda = q.lambda; mar.drag = q.drag; mar.disp = q.disp; mar.grupo = q.grupo;
    U.uAmp.value = mar.amp; U.uLambda.value = mar.lambda; U.uDrag.value = mar.drag; U.uDisp.value = mar.disp; U.uGrupo.value = mar.grupo;
    matAlt.uniforms.uEspuma.value = mix(0.0, 1.0, clamp((m - 0.14) / 0.72, 0, 1));
    altoMaximo();
  }
  // altura máxima de la superficie (losa del raymarch): crece con las series y con la ola grande
  function altoMaximo() { UV.uHmax.value = 0.62 * mar.amp * (1 + 0.65 * mar.grupo) + mar.amp * mar.grande.a * 1.1 + 0.35; }

  // Ola grande ocasional: con mar fuerte, cada 20-50 s una cresta mucho mayor que las demás cruza la botella.
  let proximaGrande = 20;
  function lanzarOlaGrande(tiempo, fuerza = 1) {
    const g = mar.grande, ang = DIR0 + (Math.random() - 0.5) * 0.5;
    g.dx = Math.cos(ang); g.dy = Math.sin(ang);
    g.k = (Math.PI * 2 / mar.lambda) * 0.72;
    g.u = -g.dx * (DOM_U + 5); g.v = -g.dy * (DOM_U + 5); // entra por el lado de donde vienen las olas
    g.t0 = tiempo; g.a = (1.2 + 0.5 * Math.random()) * fuerza;
  }
  function gestionarOlaGrande(dt, tiempo) {
    const g = mar.grande;
    if (g.a > 0 && Math.sqrt(G_ESCALA / g.k) * (tiempo - g.t0) > 2 * DOM_U + 12) g.a = 0; // ya ha cruzado
    if (mar.grupo > 0.35 && g.a === 0) {
      proximaGrande -= dt;
      if (proximaGrande <= 0) { lanzarOlaGrande(tiempo, mar.grupo); proximaGrande = 20 + Math.random() * 30; }
    }
    U.uGrande.value.set(g.u, g.v, g.t0, g.a);
    U.uGrandeDir.value.set(g.dx, g.dy, g.k);
    altoMaximo();
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
    gestionarOlaGrande(dt, tiempo);
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
    UV.uAire.value = opts.aire ?? 0; UV.uNubes.value = opts.nubes ?? 0;
    if (opts.colAire) UV.uColAire.value.copy(opts.colAire);
    UV.uSol.value.copy(opts.sol);
    UV.uOscuro.value.copy(opts.luz);
    UV.tRefl.value = opts.refl || null; UV.uHayRefl.value = opts.refl ? 1 : 0;
    pasada(matVol, rtDestino);
  }

  return {
    // viento con rachas: cabrilleo más alto y más rápido cuanto más sopla (dir: giro del viento en el plano)
    ponerViento: (total, dir = 0) => {
      matAlt.uniforms.uCabrilleo.value = 0.012 + 0.05 * Math.min(total, 1.5);
      matAlt.uniforms.uVientoDir.value.set(-Math.cos(dir), -Math.sin(dir)).multiplyScalar(0.6 + 1.6 * Math.min(total, 1.5));
    },
    // bioluminiscencia nocturna (0..1)
    ponerBioluminiscencia: (b) => { UV.uBiolum.value = b; matAlt.uniforms.uBiolumAlt.value = b; },
    estado: f, mar, U, lanzarOlaGrande, uCasco: matAlt.uniforms.uCasco, uEscCasco: matAlt.uniforms.uEscCasco, configurarMar, agitar, actualizarFluido, simular, sincronizarUniformes, pasadaVolumen, configurarRelleno: (v) => { f.relleno = v; },
    alturaEn: (u, v, t) => oleajeJS(u, v, t, mar),
    uVolumen: UV, rtFrente, rtFondo,
  };
}
