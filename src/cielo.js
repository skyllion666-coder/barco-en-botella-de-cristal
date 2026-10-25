// Cielo dentro de la botella: rayos visibles (canal en zigzag con ramas, núcleo HDR que alimenta el resplandor
// y luz puntual que ilumina el barco y el agua), estrellas de noche flotando en el aire interior, estrellas
// fugaces de vez en cuando y un arcoíris cuando escampa después de la lluvia.
import * as THREE from 'three';
import { BASE_INT_X, CORCHO_INT_X } from './bottle.js';

const al = (a, b) => a + Math.random() * (b - a);

export function crearCielo({ escena, agua, botella, luzRayo }) {
  const f = agua.estado;
  const dentro = (P, m) => P.x > BASE_INT_X + m && P.x < CORCHO_INT_X - m - 0.8 && Math.hypot(P.y, P.z) < botella.rIn(P.x) - m;
  const meterDentro = (P, m) => {
    P.x = THREE.MathUtils.clamp(P.x, BASE_INT_X + m + 0.05, CORCHO_INT_X - m - 0.85);
    for (let k = 0; k < 12 && !dentro(P, m); k++) { P.y *= 0.85; P.z *= 0.85; }
    return P;
  };

  // ---------------------------------------------------------------- rayo
  const matNucleo = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const matHalo = new THREE.MeshBasicMaterial({ color: 0x6080ff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const grupo = new THREE.Group();
  grupo.visible = false;
  escena.add(grupo);

  // desplazamiento del punto medio: canal quebrado entre a y b, sin salir de la cavidad
  function zigzag(a, b, nivel, desv, out) {
    if (nivel === 0) { out.push(b.clone()); return; }
    const dir = b.clone().sub(a), L = dir.length();
    const r = new THREE.Vector3(al(-1, 1), al(-1, 1), al(-1, 1));
    r.addScaledVector(dir, -r.dot(dir) / Math.max(L * L, 1e-6));
    if (r.lengthSq() > 1e-8) r.normalize().multiplyScalar(L * desv * al(0.3, 1));
    const m = meterDentro(a.clone().lerp(b, al(0.4, 0.6)).add(r), 0.25);
    zigzag(a, m, nivel - 1, desv, out);
    zigzag(m, b, nivel - 1, desv, out);
  }
  function tubo(pts, radio) {
    const camino = new THREE.CurvePath();
    for (let i = 0; i < pts.length - 1; i++) camino.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
    return new THREE.TubeGeometry(camino, (pts.length - 1) * 2, radio, 5, false);
  }
  function limpiar() {
    for (const m of grupo.children) m.geometry.dispose();
    grupo.clear();
  }

  // Un rayo nuevo: cae desde lo alto del interior hasta la superficie del agua.
  function disparar() {
    const E = new THREE.Vector3(), S = new THREE.Vector3();
    for (let intento = 0; intento < 20; intento++) {
      E.copy(f.e1).multiplyScalar(al(-8.5, 7)).addScaledVector(f.e2, al(-1.5, 1.5)).addScaledVector(f.n, f.d + 0.05);
      if (!dentro(E, 0.3)) continue;
      S.copy(E);
      while (dentro(S.clone().addScaledVector(f.n, 0.2), 0.4)) S.addScaledVector(f.n, 0.2);
      if (S.distanceTo(E) < 2) continue;
      // el origen se desplaza un poco de lado (los rayos no caen en vertical perfecta)
      const lado = S.clone().addScaledVector(f.e1, al(-1.6, 1.6)).addScaledVector(f.e2, al(-0.8, 0.8));
      if (dentro(lado, 0.4)) S.copy(lado);
      limpiar();
      const pts = [S.clone()];
      zigzag(S, E, 6, 0.2, pts);
      grupo.add(new THREE.Mesh(tubo(pts, 0.028), matNucleo), new THREE.Mesh(tubo(pts, 0.13), matHalo));
      // ramas
      const nRamas = 1 + Math.floor(Math.random() * 3);
      for (let r = 0; r < nRamas; r++) {
        const i0 = Math.floor(al(0.15, 0.6) * pts.length);
        const a = pts[i0];
        const b = meterDentro(a.clone().addScaledVector(f.n, -al(0.8, 2.2)).addScaledVector(f.e1, al(-2, 2)).addScaledVector(f.e2, al(-1, 1)), 0.3);
        const rama = [a.clone()];
        zigzag(a, b, 4, 0.25, rama);
        grupo.add(new THREE.Mesh(tubo(rama, 0.016), matNucleo), new THREE.Mesh(tubo(rama, 0.07), matHalo));
      }
      luzRayo.position.copy(S).lerp(E, 0.55);
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- estrellas (de noche, en el aire interior)
  const N_EST = 150;
  const fuente = botella.puntos, posEst = new Float32Array(N_EST * 3), faseEst = new Float32Array(N_EST);
  for (let i = 0; i < N_EST; i++) {
    const k = Math.floor(Math.random() * (fuente.length / 3));
    posEst.set([fuente[k * 3], fuente[k * 3 + 1], fuente[k * 3 + 2]], i * 3);
    faseEst[i] = Math.random();
  }
  const geoEst = new THREE.BufferGeometry();
  geoEst.setAttribute('position', new THREE.BufferAttribute(posEst, 3));
  geoEst.setAttribute('fase', new THREE.BufferAttribute(faseEst, 1));
  const UA = agua.uVolumen;
  const matEst = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uN: UA.uN, uD: UA.uD, uTiempo: { value: 0 }, uVisible: { value: 0 }, uTam: { value: 2 } },
    vertexShader: /* glsl */`
      attribute float fase;
      uniform vec3 uN; uniform float uD; uniform float uTiempo; uniform float uTam;
      varying float vBrillo;
      void main(){
        // solo por encima del agua (con margen) y lejos de la superficie
        float h = dot(uN, position) - uD;
        if (h < 1.0){ gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vBrillo = 0.0; return; }
        vBrillo = (0.45 + 0.55 * fase) * (0.6 + 0.4 * sin(uTiempo * (1.5 + fase * 2.5) + fase * 40.0)) * smoothstep(1.0, 2.0, h);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uTam * (0.7 + 0.8 * fase);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uVisible; varying float vBrillo;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vec3(0.85, 0.9, 1.0) * 2.2 * a * vBrillo * uVisible, 1.0);
      }`,
  });
  const estrellas = new THREE.Points(geoEst, matEst);
  estrellas.frustumCulled = false;
  estrellas.visible = false;
  escena.add(estrellas);

  // ---------------------------------------------------------------- estrellas fugaces
  const N_ESTELA = 22;
  const posF = new Float32Array(N_ESTELA * 3), brilloF = new Float32Array(N_ESTELA);
  for (let i = 0; i < N_ESTELA; i++) brilloF[i] = Math.pow(1 - i / N_ESTELA, 1.6);
  const geoF = new THREE.BufferGeometry();
  geoF.setAttribute('position', new THREE.BufferAttribute(posF, 3).setUsage(THREE.DynamicDrawUsage));
  geoF.setAttribute('brillo', new THREE.BufferAttribute(brilloF, 1));
  const matF = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uInt: { value: 0 }, uTam: { value: 3 } },
    vertexShader: 'attribute float brillo; uniform float uTam; varying float vB; void main(){ vB = brillo; gl_PointSize = uTam * (0.5 + 1.2 * brillo); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uInt; varying float vB; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(0.9, 0.95, 1.0) * 6.0 * smoothstep(0.5, 0.0, d) * vB * uInt, 1.0); }',
  });
  const fugaz = new THREE.Points(geoF, matF);
  fugaz.frustumCulled = false; fugaz.visible = false;
  escena.add(fugaz);
  const F = { activa: false, t0: 0, dur: 0.8, A: new THREE.Vector3(), dir: new THREE.Vector3(), largo: 4, proxima: 6 };
  function lanzarFugaz(t) {
    for (let intento = 0; intento < 15; intento++) {
      F.A.copy(f.e1).multiplyScalar(al(-9, 5)).addScaledVector(f.e2, al(-2, 1)).addScaledVector(f.n, f.d + al(2.6, 4.2));
      F.dir.copy(f.e1).multiplyScalar(Math.random() < 0.5 ? 1 : -1).addScaledVector(f.n, -al(0.15, 0.4)).addScaledVector(f.e2, al(-0.2, 0.2)).normalize();
      F.largo = al(3.5, 6.5);
      const B = F.A.clone().addScaledVector(F.dir, F.largo);
      if (dentro(F.A, 0.4) && dentro(B, 0.4)) { F.activa = true; F.t0 = t; F.dur = al(0.55, 0.95); return; }
    }
  }

  // ---------------------------------------------------------------- arcoíris
  // Como uno real: no está «en» ningún sitio. Para cada punto del aire de la botella se mira el ángulo entre la
  // línea de visión y el punto opuesto al sol (antisolar): el arco principal está a ~41-42° (violeta dentro, rojo
  // fuera), el secundario a ~50-54° con los colores al revés y más tenue; dentro del principal el cielo es más claro
  // y entre los dos más oscuro (banda de Alexander); justo dentro del violeta, bandas supernumerarias suaves.
  // Así queda fijo respecto a la luz y a quien mira, no al agua. Solo se ve en el aire, por encima del agua.
  // A escala de la botella: los ángulos se miden desde un observador en miniatura junto al cristal (con la cámara
  // real, de ~20° de campo, un arco de 42° no cabría) y el sol está bajo, a su espalda, como cuando escampa por la
  // tarde: así se ve el arco entero. Se mantiene derecho respecto a la vertical real al inclinar el móvil.
  const geoArco = new THREE.PlaneGeometry(30, 12);
  const matArco = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: { uInt: { value: 0 }, uN: UA.uN, uD: UA.uD, tPerfil: UA.tPerfil, uCam: { value: new THREE.Vector3() }, uAnti: { value: new THREE.Vector3(0, 0, -1) } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: /* glsl */`
      uniform float uInt; uniform vec3 uN; uniform float uD; uniform sampler2D tPerfil; uniform vec3 uCam; uniform vec3 uAnti;
      varying vec3 vW;
      const float X0 = ${BASE_INT_X.toFixed(3)}; const float X1 = ${CORCHO_INT_X.toFixed(3)};
      // color de una longitud de onda (nm), aproximación clásica, en lineal
      vec3 onda(float l){
        vec3 c = vec3(0.0);
        if (l < 440.0) c = vec3((440.0 - l) / 60.0, 0.0, 1.0);
        else if (l < 490.0) c = vec3(0.0, (l - 440.0) / 50.0, 1.0);
        else if (l < 510.0) c = vec3(0.0, 1.0, (510.0 - l) / 20.0);
        else if (l < 580.0) c = vec3((l - 510.0) / 70.0, 1.0, 0.0);
        else if (l < 645.0) c = vec3(1.0, (645.0 - l) / 65.0, 0.0);
        else c = vec3(1.0, 0.0, 0.0);
        float borde = l < 420.0 ? 0.3 + 0.7 * (l - 380.0) / 40.0 : l > 680.0 ? 0.3 + 0.7 * (720.0 - l) / 40.0 : 1.0;
        return pow(c * borde, vec3(2.2));
      }
      // banda de color entre dos ángulos: a = extremo violeta, b = extremo rojo
      vec3 banda(float th, float a, float b){
        float x = (th - a) / (b - a);
        if (x < -0.15 || x > 1.15) return vec3(0.0);
        float l = mix(395.0, 705.0, clamp(x, 0.0, 1.0));
        float env = smoothstep(-0.15, 0.12, x) * smoothstep(1.15, 0.88, x);
        return onda(l) * env;
      }
      void main(){
        float h = dot(uN, vW) - uD;
        float r = texture2D(tPerfil, vec2((vW.x - X0) / (X1 - X0), 0.5)).r;
        if (h < 0.05 || vW.x < X0 + 0.2 || vW.x > X1 - 0.8 || length(vW.yz) > r - 0.12) discard;
        float th = degrees(acos(clamp(dot(normalize(vW - uCam), uAnti), -1.0, 1.0)));
        vec3 col = banda(th, 40.6, 42.4) * 1.0                      // principal
                 + banda(th, 53.7, 50.3) * 0.38;                    // secundario: rojo por dentro
        // supernumerarias: bandas finas rosa y verde justo dentro del violeta
        float sup = smoothstep(38.6, 39.6, th) * smoothstep(40.7, 40.1, th);
        col += vec3(0.30, 0.55, 0.30) * sup * (0.5 + 0.5 * cos((40.6 - th) * 9.0)) * 0.25
             + vec3(0.55, 0.30, 0.45) * sup * (0.5 - 0.5 * cos((40.6 - th) * 9.0)) * 0.25;
        // cielo más claro dentro del arco principal
        col += vec3(0.85, 0.88, 0.92) * 0.07 * smoothstep(25.0, 40.5, th) * step(th, 40.8);
        // banda de Alexander: algo más oscura entre los dos arcos
        float alex = smoothstep(42.2, 43.2, th) * smoothstep(50.6, 49.6, th) * 0.10;
        float a = smoothstep(0.05, 0.9, h) * uInt;
        col = mix(col, vec3(dot(col, vec3(0.33))), 0.18); // colores suaves, como contra un cielo de verdad
        gl_FragColor = vec4(col * 0.40 * a, alex * a);
      }`,
  });
  const arco = new THREE.Mesh(geoArco, matArco);
  arco.position.set(-0.5, 0, -2.2); // un plano al fondo del aire de la botella, de cara a quien mira
  arco.frustumCulled = false; arco.visible = false;
  escena.add(arco);

  let tAhora = 0;
  function actualizar(t, { rayo, noche, cubierto, altoPx, arcoiris = 0 }) {
    tAhora = t;
    grupo.visible = rayo > 0.02 && grupo.children.length > 0;
    matNucleo.color.setRGB(0.82, 0.88, 1.0).multiplyScalar(3 + 30 * rayo);
    matHalo.color.setRGB(0.30, 0.42, 1.0).multiplyScalar(2.2 * rayo);
    luzRayo.intensity = 160 * rayo;
    const v = noche * (1 - cubierto);
    estrellas.visible = v > 0.02;
    matEst.uniforms.uVisible.value = v;
    matEst.uniforms.uTiempo.value = t;
    matEst.uniforms.uTam.value = Math.max(1.5, altoPx / 330);

    // estrellas fugaces: de noche, cada 6-16 s, una cruza el aire de la botella dejando estela
    if (v > 0.5) {
      F.proxima -= 1 / 60;
      if (!F.activa && F.proxima <= 0 && t > 1) { lanzarFugaz(t); F.proxima = al(6, 16); }
    }
    if (F.activa) {
      const s = (t - F.t0) / F.dur;
      if (s >= 1 || s < 0) { F.activa = false; fugaz.visible = false; }
      else {
        const cabeza = F.largo * s;
        for (let i = 0; i < N_ESTELA; i++) {
          const d = Math.max(0, cabeza - i * 0.11);
          posF[i * 3] = F.A.x + F.dir.x * d; posF[i * 3 + 1] = F.A.y + F.dir.y * d; posF[i * 3 + 2] = F.A.z + F.dir.z * d;
        }
        geoF.attributes.position.needsUpdate = true;
        matF.uniforms.uInt.value = Math.sin(Math.PI * s) * v;
        matF.uniforms.uTam.value = Math.max(2, altoPx / 260);
        fugaz.visible = true;
      }
    }

    // arcoíris: depende solo de la posición de quien mira y del sol (antisolar = opuesto al sol)
    arco.visible = arcoiris > 0.01;
    if (arco.visible) {
      matArco.uniforms.uInt.value = arcoiris;
      const ojo = matArco.uniforms.uCam.value.set(0.5, 0.5, 6.0); // observador en miniatura, delante de la botella
      // antisolar: hacia el fondo de la botella, a ~12° bajo el horizonte (el sol, bajo y a la espalda)
      const A = matArco.uniforms.uAnti.value, n = f.n;
      A.set(0.5, 0, -2.2).sub(ojo);
      A.addScaledVector(n, -A.dot(n)).normalize().multiplyScalar(Math.cos(0.21)).addScaledVector(n, -Math.sin(0.21));
    }
  }

  // arcoVisible(): intensidad del arcoíris que se ve ahora (para las pruebas)
  return { disparar, actualizar, lanzarFugaz: () => lanzarFugaz(tAhora), arcoVisible: () => (arco.visible ? matArco.uniforms.uInt.value : 0) };
}
