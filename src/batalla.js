// Batalla: el galeón dispara una andanada de tres cañones contra el cristal. Fogonazo, humo, retroceso y bala;
// cada impacto raja el vidrio (grietas en estrella que se propagan) y al tercero lo rompe: saltan cristales a la
// mesa, el agua sale a chorro por el agujero (Torricelli: v = √(2gh), caudal = Cd·A·v) y baja el nivel hasta el
// borde del agujero, y se forma un charco. Fuera de la botella la física va a escala real (1 u = 1 cm, g = 981).
import * as THREE from 'three';
import { Y_MESA } from './mundo.js';

const G = 981;            // cm/s²
const CD = 0.61;          // coeficiente de descarga de un orificio de pared delgada
const R_AGUJERO = 0.62;
const al = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const suave = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

function texRadial(tam, paradas, ruido = 0) {
  const c = document.createElement('canvas'); c.width = c.height = tam;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(tam / 2, tam / 2, 0, tam / 2, tam / 2, tam / 2);
  for (const [p, col] of paradas) gr.addColorStop(p, col);
  g.fillStyle = gr; g.fillRect(0, 0, tam, tam);
  if (ruido) {
    // bocanadas: manchas sueltas para que el humo no sea un disco perfecto
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * 6.283, r = tam * al(0.18, 0.5), s = tam * al(0.05, 0.16);
      const h = g.createRadialGradient(tam / 2 + Math.cos(a) * r, tam / 2 + Math.sin(a) * r, 0, tam / 2 + Math.cos(a) * r, tam / 2 + Math.sin(a) * r, s);
      h.addColorStop(0, `rgba(0,0,0,${ruido})`); h.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = h; g.fillRect(0, 0, tam, tam);
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function crearBatalla({ interior, exterior, mundoEscena, cubo, barco, agua, botella, salpicaduras, flotacion, audio, U }) {
  const f = agua.estado;
  // ---- uniformes del vidrio: hasta 4 grietas (xyz punto, w tamaño) y el agujero (xyz, w radio)
  U.uGrietas = U.uGrietas || { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 0, 0)) };
  U.uAgujero = U.uAgujero || { value: new THREE.Vector4(0, 0, 0, 0) };
  const grietas = U.uGrietas.value;
  const objGrieta = [0, 0, 0, 0];

  // ---- fogonazo, humo y balas (dentro de la botella)
  const texHumo = texRadial(128, [[0, 'rgba(255,255,255,0.9)'], [0.45, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']], 0.5);
  const texFuego = texRadial(64, [[0, 'rgba(255,255,240,1)'], [0.25, 'rgba(255,200,90,0.9)'], [0.6, 'rgba(255,90,20,0.35)'], [1, 'rgba(255,40,0,0)']]);
  const luzFogonazo = new THREE.PointLight(0xffa860, 0, 0, 2);
  interior.add(luzFogonazo);
  const humos = [];
  for (let i = 0; i < 70; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texHumo, transparent: true, depthWrite: false, opacity: 0 }));
    s.visible = false; s.renderOrder = 5; interior.add(s);
    humos.push({ s, v: new THREE.Vector3(), vida: 0, dur: 1, tam0: 0.3, tam1: 2, op: 0.6, rot: 0 });
  }
  let iHumo = 0;
  const fuegos = [];
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texFuego, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    s.material.color.setRGB(6, 4, 2.4); s.visible = false; interior.add(s);
    fuegos.push({ s, vida: 0, d: new THREE.Vector3() });
  }
  const geoBala = new THREE.SphereGeometry(0.11, 14, 10);
  const matBala = new THREE.MeshStandardMaterial({ color: 0x1b1a19, roughness: 0.45, metalness: 0.75 });
  const balas = [];

  function humo(p, v, { tam0 = 0.25, tam1 = 1.8, dur = 2.6, op = 0.55, gris = 0.82 } = {}) {
    const h = humos[iHumo++ % humos.length];
    h.s.position.copy(p); h.v.copy(v); h.vida = 0; h.dur = dur * al(0.8, 1.2); h.tam0 = tam0; h.tam1 = tam1 * al(0.8, 1.25); h.op = op;
    h.s.material.color.setScalar(gris); h.s.material.rotation = Math.random() * 6.283; h.rot = al(-0.6, 0.6);
    h.s.visible = true;
  }

  // ---- cristales rotos, chorro y charco (fuera, sobre la mesa)
  const matCristal = new THREE.MeshPhysicalMaterial({
    color: 0xd8efe4, roughness: 0.04, metalness: 0.15, transparent: true, opacity: 0.42, side: THREE.DoubleSide,
    clearcoat: 1, envMapIntensity: 2.2, depthWrite: false,
  });
  const cristales = [];
  const NCHORRO = 2400;
  const posChorro = new Float32Array(NCHORRO * 3), tamChorro = new Float32Array(NCHORRO);
  const gotas = Array.from({ length: NCHORRO }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), vida: -1, tam: 1, rebote: false }));
  const geoChorro = new THREE.BufferGeometry();
  geoChorro.setAttribute('position', new THREE.BufferAttribute(posChorro, 3));
  geoChorro.setAttribute('tam', new THREE.BufferAttribute(tamChorro, 1));
  const matChorro = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uEsc: { value: 400 } },
    vertexShader: /* glsl */`
      attribute float tam; varying float vT;
      uniform float uEsc;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        vT = tam;
        gl_PointSize = tam > 0.0 ? uEsc * tam / -mv.z : 0.0;
      }`,
    fragmentShader: /* glsl */`
      varying float vT;
      void main(){
        vec2 q = gl_PointCoord * 2.0 - 1.0; float r = dot(q, q);
        if (r > 1.0) discard;
        // gotita como lente: borde oscuro, brillo arriba a la izquierda, centro claro
        float brillo = exp(-dot(q - vec2(-0.3, -0.45), q - vec2(-0.3, -0.45)) * 14.0);
        // agua clara: casi transparente en el centro, filo algo más oscuro y un brillo pequeño
        vec3 c = mix(vec3(0.62, 0.74, 0.78), vec3(0.10, 0.15, 0.17), smoothstep(0.45, 1.0, r)) + vec3(1.1, 1.15, 1.2) * brillo;
        gl_FragColor = vec4(c, (0.22 + 0.45 * smoothstep(0.55, 1.0, r) + 0.5 * brillo) * (1.0 - smoothstep(0.85, 1.0, r)));
      }`,
  });
  // vena de agua: tubo a lo largo de la parábola, que adelgaza al acelerar (continuidad: A·v constante)
  const matVena = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { tEnv: { value: cubo }, uT: { value: 0 } },
    vertexShader: /* glsl */`
      varying vec3 vW; varying vec3 vNw; varying vec2 vUv;
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vNw = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform samplerCube tEnv; uniform float uT;
      varying vec3 vW; varying vec3 vNw; varying vec2 vUv;
      void main(){
        vec3 I = normalize(vW - cameraPosition);
        vec3 N = normalize(vNw);
        // ondulación de la superficie del chorro (se mueve con el agua)
        N = normalize(N + 0.07 * vec3(sin(vUv.x * 47.0 - uT * 31.0 + vUv.y * 6.2832), sin(vUv.x * 23.0 - uT * 17.0), cos(vUv.x * 61.0 - uT * 37.0 + vUv.y * 12.566)));
        if (dot(N, I) > 0.0) N = -N;
        float c = clamp(dot(-I, N), 0.0, 1.0);
        float F = 0.02 + 0.98 * pow(1.0 - c, 5.0);
        vec3 refl = textureCube(tEnv, reflect(I, N)).rgb;
        vec3 col = refl * (0.35 + 1.4 * F) + vec3(0.05, 0.07, 0.08);
        float a = clamp(0.16 + 0.85 * F + 0.25 * smoothstep(0.6, 1.0, max(refl.r, max(refl.g, refl.b))), 0.0, 0.92);
        // el extremo se deshace en gotas (inestabilidad de Plateau-Rayleigh)
        a *= 1.0 - smoothstep(0.82, 1.0, vUv.x);
        gl_FragColor = vec4(col, a);
      }`,
  });
  const vena = new THREE.Mesh(new THREE.BufferGeometry(), matVena);
  vena.visible = false; vena.frustumCulled = false; vena.renderOrder = 3;
  const curvaVena = new THREE.CatmullRomCurve3(Array.from({ length: 16 }, () => new THREE.Vector3()));
  function hacerVena(H0, v0, rad0, visible) {
    vena.visible = visible;
    if (!visible) return null;
    // tiempo hasta la mesa: H0.y + v0.y·t − ½·g·t² = Y_MESA (con la gravedad aparente)
    const gy = gAparente.y * G;
    const a = 0.5 * gy, b = v0.y, c = H0.y - Y_MESA;
    const disc = b * b - 4 * a * c;
    const tMesa = disc > 0 && a !== 0 ? Math.max((-b - Math.sqrt(disc)) / (2 * a), (-b + Math.sqrt(disc)) / (2 * a)) : 0.3;
    const tFin = Math.min(tMesa, 0.6) * 0.62;  // la vena se rompe en gotas antes de llegar abajo
    const pts = curvaVena.points;
    for (let i = 0; i < pts.length; i++) {
      const t = tFin * i / (pts.length - 1);
      pts[i].copy(H0).addScaledVector(v0, t).addScaledVector(gAparente, 0.5 * G * t * t);
    }
    const geo = new THREE.TubeGeometry(curvaVena, 40, 1, 10, false);
    const pos = geo.attributes.position, vv = v0.length();
    for (let i = 0; i <= 40; i++) {
      const t = tFin * i / 40;
      const ctr = curvaVena.getPointAt(i / 40);
      const vel = Math.sqrt(vv * vv + 2 * G * Math.max(0, H0.y - ctr.y));
      const r = rad0 * Math.sqrt(vv / Math.max(vel, 1e-3));
      for (let j = 0; j <= 10; j++) {
        const k = i * 11 + j;
        pos.setXYZ(k, ctr.x + (pos.getX(k) - ctr.x) * r, ctr.y + (pos.getY(k) - ctr.y) * r, ctr.z + (pos.getZ(k) - ctr.z) * r);
      }
    }
    geo.computeVertexNormals();
    vena.geometry.dispose(); vena.geometry = geo;
    return { tFin };
  }
  const chorro = new THREE.Points(geoChorro, matChorro);
  chorro.frustumCulled = false; chorro.renderOrder = 3;
  exterior.add(chorro);
  let iGota = 0;

  // charco: disco de borde irregular que crece con el agua derramada (grosor de una lámina de agua: 0,3 cm)
  const NB = 64;
  const geoCharco = new THREE.CircleGeometry(1, NB);
  const bordeCharco = Array.from({ length: NB + 1 }, (_, i) => {
    const a = i / NB * 6.283;
    return 1 + 0.16 * Math.sin(a * 3 + 1.3) + 0.09 * Math.sin(a * 5 + 0.2) + 0.05 * Math.sin(a * 11 + 2.0);
  });
  {
    const pos = geoCharco.attributes.position;
    for (let i = 1; i < pos.count; i++) pos.setXY(i, pos.getX(i) * bordeCharco[i - 1], pos.getY(i) * bordeCharco[i - 1]);
  }
  // charco: la madera mojada se oscurece y refleja como un espejo (Fresnel del agua)
  const charco = new THREE.Mesh(geoCharco, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { tEnv: { value: cubo }, uT: { value: 0 } },
    vertexShader: /* glsl */`
      varying vec3 vW; varying vec2 vL;
      void main(){ vL = position.xy; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform samplerCube tEnv; uniform float uT;
      varying vec3 vW; varying vec2 vL;
      void main(){
        vec3 I = normalize(vW - cameraPosition);
        vec3 N = normalize(vec3(0.0, 1.0, 0.0) + 0.012 * vec3(sin(vW.x * 7.0 + uT * 3.0), 0.0, cos(vW.z * 6.0 - uT * 2.5)));
        float c = clamp(dot(-I, N), 0.0, 1.0);
        float F = 0.02 + 0.98 * pow(1.0 - c, 5.0);
        vec3 refl = textureCube(tEnv, reflect(I, N)).rgb;
        float borde = 1.0;
        gl_FragColor = vec4(refl * (0.3 + F * 1.3), (0.34 + 0.45 * F) * borde);
      }`,
  }));
  charco.rotation.x = -Math.PI / 2;
  charco.position.y = Y_MESA + 0.035;
  charco.scale.setScalar(0.001); charco.visible = false; charco.renderOrder = 2;
  exterior.add(charco);
  const ESPESOR = 0.3;
  // el chorro y los trozos de vidrio van delante del cristal: escena propia que se dibuja después del vidrio
  const encima = new THREE.Scene();
  encima.environment = mundoEscena.environment; encima.environmentIntensity = mundoEscena.environmentIntensity;
  encima.add(new THREE.HemisphereLight(0xfff2e0, 0x2a1a10, 1.2));
  const luzEncima = new THREE.DirectionalLight(0xffffff, 2.0); luzEncima.position.set(-6, 10, 8); encima.add(luzEncima);
  exterior.remove(chorro); encima.add(chorro); encima.add(vena);
  const est = {
    impactos: 0, roto: false, rellenoInicial: f.relleno, derramado: 0, centroCharco: new THREE.Vector3(), nCharco: 0,
    hueco: new THREE.Vector3(), fuera: new THREE.Vector3(), caudal: 0, vChorro: 0, tSeco: 0,
    rebobinar: -1, lenta: 1, tLenta: 9, pendientes: [], aterrizaje: new THREE.Vector3(), vAterrizaje: new THREE.Vector3(), hayAterrizaje: false,
  };

  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), ejeZ = new THREE.Vector3();

  // ---- disparo
  function puntoMira(x0) {
    // al cristal delantero, algo por debajo de la línea de flotación (así se hacía: «a la lumbre del agua»)
    const ny = Math.max(0.3, f.n.y);
    const x = clamp(x0 + al(-1.2, 1.2), -9, 2.5);
    const r = botella.rIn(x);
    const yAgua = (f.d - f.n.x * x) / ny;
    const y = clamp(yAgua - al(0.55, 1.1), -r * 0.85, r * 0.6);
    return new THREE.Vector3(x, y, Math.sqrt(Math.max(0.01, r * r - y * y)));
  }

  function disparo(i) {
    const I = barco.info || {};
    const M = barco.grupo.matrix;
    ejeZ.set(0, 0, 1).transformDirection(M);
    const lado = ejeZ.z >= 0 ? 1 : -1;
    const local = new THREE.Vector3([-0.22, 0.02, 0.24][i] * (I.eslora ?? 8.4), (I.cubierta ?? 1.2) * 0.62, lado * 0.52 * (I.manga ?? 1.7));
    const p0 = local.clone().applyMatrix4(M);
    const dir = ejeZ.clone().multiplyScalar(lado);
    const T = puntoMira(p0.x);
    balas.push({ m: null, p0, T, s: 0, vel: 11, enAgua: false, mojada: false });
    const b = balas[balas.length - 1];
    b.m = new THREE.Mesh(geoBala, matBala); b.m.position.copy(p0); interior.add(b.m);
    b.largo = p0.distanceTo(T);
    // fogonazo y humo por la porta
    const fu = fuegos.find((q) => q.vida <= 0) || fuegos[0];
    fu.vida = 0.09; fu.s.position.copy(p0).addScaledVector(dir, 0.25); fu.s.scale.setScalar(1.1); fu.s.visible = true;
    luzFogonazo.position.copy(p0).addScaledVector(dir, 0.4); luzFogonazo.intensity = 90;
    for (let k = 0; k < 9; k++) humo(tmp.copy(p0).addScaledVector(dir, 0.2), tmp2.copy(dir).multiplyScalar(al(1.5, 4.5)).add(new THREE.Vector3(al(-0.5, 0.5), al(0.2, 0.9), al(-0.5, 0.5))), { tam0: 0.2, tam1: al(1.2, 2.2), dur: al(2.2, 3.6), op: al(0.45, 0.7), gris: al(0.78, 0.92) });
    // retroceso: el barco escora hacia el lado contrario al de la andanada y se aparta un poco
    flotacion.estado.vbal += -lado * 0.35;
    flotacion.estado.vcab += al(-0.08, 0.08);
    audio?.canonazo?.(i * 0.05);
    try { navigator.vibrate?.([35, 25, 60]); } catch (_) { /* sin permiso */ }
    est.impulsos.push([p0.dot(f.e1), p0.dot(f.e2), 0.05, 0.3]);
  }

  function impacto(T) {
    est.impactos++;
    audio?.cristal?.(est.impactos >= 3 ? 1.4 : 0.7 + 0.2 * est.impactos);
    salpicaduras.salpicar(T, 18, 1.0);
    est.impulsos.push([T.dot(f.e1), T.dot(f.e2), 0.08, 0.35]);
    const i = (est.impactos - 1) % 4;
    grietas[i].set(T.x, T.y, T.z, 0.01);
    objGrieta[i] = est.impactos >= 3 ? 2.1 : 0.8 + 0.4 * est.impactos;
    if (est.impactos >= 3 && !est.roto) romper(T);
  }

  function romper(T) {
    est.roto = true;
    est.hueco.copy(T);
    est.fuera.set(0, T.y, T.z).normalize();
    U.uAgujero.value.set(T.x, T.y, T.z, R_AGUJERO);
    audio?.rotura?.();
    try { navigator.vibrate?.([80, 30, 140]); } catch (_) { /* sin permiso */ }
    // cámara lenta un momento, como en las películas
    est.tLenta = 0;
    est.alRomper?.(T);
    // cristales: trozos del tamaño del agujero que salen despedidos hacia fuera
    const t1 = new THREE.Vector3(1, 0, 0), t2 = new THREE.Vector3().crossVectors(est.fuera, t1).normalize();
    for (let k = 0; k < 26; k++) {
      const n = 3 + (Math.random() * 3 | 0), pts = [];
      const tam = al(0.08, 0.36) * (k < 4 ? 1.6 : 1);
      for (let j = 0; j < n; j++) { const a = j / n * 6.283 + al(-0.4, 0.4); pts.push(new THREE.Vector2(Math.cos(a) * tam * al(0.5, 1.2), Math.sin(a) * tam * al(0.5, 1.2))); }
      const g = new THREE.ShapeGeometry(new THREE.Shape(pts));
      const m = new THREE.Mesh(g, matCristal);
      const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * R_AGUJERO * 1.1;
      m.position.copy(T).addScaledVector(t1, Math.cos(a) * r).addScaledVector(t2, Math.sin(a) * r).addScaledVector(est.fuera, 0.45);
      m.lookAt(tmp.copy(m.position).add(est.fuera));
      const v = est.fuera.clone().multiplyScalar(al(40, 160)).addScaledVector(t1, al(-60, 60)).addScaledVector(t2, al(-40, 70));
      const w = new THREE.Vector3(al(-30, 30), al(-30, 30), al(-30, 30));
      m.renderOrder = 4;
      encima.add(m);
      cristales.push({ m, v, w, origen: m.position.clone(), qOrigen: m.quaternion.clone(), quieto: false, desde: null, qDesde: null });
    }
  }

  function andanada() {
    if (est.roto || est.rebobinar >= 0 || est.pendientes.length || balas.length) return false;
    est.pendientes.push({ t: 0, i: 0 }, { t: 0.42, i: 1 }, { t: 0.9, i: 2 });
    return true;
  }

  // ---- chorro de agua (partículas balísticas: fuera de la botella la única fuerza es la gravedad)
  function soltarGota(p, v, tam, rebote = false, vuelve = false) {
    const g = gotas[iGota++ % NCHORRO];
    g.p.copy(p); g.v.copy(v); g.vida = 0; g.tam = tam; g.rebote = rebote; g.vuelve = vuelve;
  }

  const gAparente = new THREE.Vector3(0, -1, 0);
  function actualizarGotas(dt) {
    est.hayGotas = false;
    for (let i = 0; i < NCHORRO; i++) {
      const g = gotas[i];
      if (g.vida < 0) { tamChorro[i] = 0; continue; }
      g.vida += dt;
      g.v.addScaledVector(gAparente, G * dt);
      g.p.addScaledVector(g.v, dt);
      // las que vuelven (rebobinado) desaparecen al entrar por el agujero
      if (g.vuelve && g.vida > 0.03) { const R = botella.rIn(g.p.x) + 0.45; if (g.p.y * g.p.y + g.p.z * g.p.z < R * R) { g.vida = -1; tamChorro[i] = 0; continue; } }
      if (g.p.y <= Y_MESA + 0.05 && g.v.y < 0) {
        if (!g.rebote) {
          // llega a la mesa: alimenta el charco y salpica un poco (corona de gotitas)
          est.aterrizaje.lerp(g.p, est.hayAterrizaje ? 0.05 : 1); est.vAterrizaje.lerp(g.v, est.hayAterrizaje ? 0.05 : 1); est.hayAterrizaje = true;
          if (Math.random() < 0.18) {
            const a = Math.random() * 6.283, s = al(15, 55);
            soltarGota(tmp.set(g.p.x, Y_MESA + 0.06, g.p.z), tmp2.set(Math.cos(a) * s * 0.5 + g.v.x * 0.15, s, Math.sin(a) * s * 0.5 + g.v.z * 0.1), g.tam * 0.35, true);
          }
        }
        g.vida = -1; tamChorro[i] = 0; continue;
      }
      if (g.vida > 1.5 || g.p.y < Y_MESA - 5) { g.vida = -1; tamChorro[i] = 0; continue; }
      est.hayGotas = true;
      posChorro[i * 3] = g.p.x; posChorro[i * 3 + 1] = g.p.y; posChorro[i * 3 + 2] = g.p.z;
      tamChorro[i] = g.tam;
    }
    geoChorro.attributes.position.needsUpdate = true;
    geoChorro.attributes.tam.needsUpdate = true;
  }

  // ---- bucle
  function actualizar(dtReal, { gEf, impulsos, alto }) {
    est.impulsos = impulsos;
    if (gEf) gAparente.copy(gEf);
    matChorro.uniforms.uEsc.value = alto * 1.25;
    // cámara lenta tras la rotura: 0,2× durante un momento y vuelta suave a 1×
    est.tLenta += dtReal;
    est.lenta = est.tLenta < 0.5 ? 0.18 : est.tLenta < 2.2 ? 0.18 + 0.82 * suave((est.tLenta - 0.5) / 1.7) : 1;
    const dt = dtReal * est.lenta;

    for (let k = est.pendientes.length - 1; k >= 0; k--) {
      const q = est.pendientes[k]; q.t -= dt;
      if (q.t <= 0) { est.pendientes.splice(k, 1); disparo(q.i); }
    }

    // balas: vuelo rápido con un poco de caída; al entrar en el agua salpica y frena
    for (let k = balas.length - 1; k >= 0; k--) {
      const b = balas[k];
      b.s += dt * b.vel * (b.enAgua ? 0.45 : 1) / b.largo;
      const s = Math.min(1, b.s);
      b.m.position.lerpVectors(b.p0, b.T, s); b.m.position.y += Math.sin(Math.PI * s) * 0.25;
      const bajo = b.m.position.dot(f.n) < f.d;
      if (bajo && !b.enAgua) {
        b.enAgua = true;
        salpicaduras.salpicar(b.m.position.clone(), 22, 1.1);
        impulsos.push([b.m.position.dot(f.e1), b.m.position.dot(f.e2), 0.12, 0.3]);
        audio?.chapuzon?.();
      }
      if (!b.enAgua && Math.random() < 0.7) humo(b.m.position, tmp.set(0, 0.3, 0), { tam0: 0.08, tam1: 0.45, dur: 0.9, op: 0.35, gris: 0.85 });
      if (s >= 1) { impacto(b.T); interior.remove(b.m); balas.splice(k, 1); }
    }

    // grietas: se propagan muy deprisa (el vidrio raja a ~1.500 m/s; aquí se ve crecer en décimas de segundo)
    for (let i = 0; i < 4; i++) {
      const G4 = grietas[i];
      if (est.rebobinar >= 0) continue;
      if (G4.w < objGrieta[i]) G4.w = Math.min(objGrieta[i], G4.w + dt * 9 * (objGrieta[i] - G4.w + 0.05));
    }

    // fogonazos, luz y humo
    for (const fu of fuegos) {
      if (fu.vida <= 0) continue;
      fu.vida -= dt; fu.s.scale.multiplyScalar(1 + dt * 6);
      if (fu.vida <= 0) fu.s.visible = false;
    }
    luzFogonazo.intensity *= Math.exp(-dt * 22);
    for (const h of humos) {
      if (!h.s.visible) continue;
      h.vida += dt;
      const t = h.vida / h.dur;
      if (t >= 1) { h.s.visible = false; continue; }
      h.v.multiplyScalar(Math.exp(-dt * 2.2)); h.v.y += dt * 0.25;
      h.s.position.addScaledVector(h.v, dt);
      h.s.scale.setScalar(h.tam0 + (h.tam1 - h.tam0) * (1 - Math.pow(1 - t, 2.5)));
      h.s.material.opacity = h.op * Math.min(1, t * 12) * Math.pow(1 - t, 1.6);
      h.s.material.rotation += h.rot * dt;
    }

    // fuga por el agujero (Torricelli)
    est.caudal = 0;
    if (!est.roto || est.rebobinar >= 0) vena.visible = false;
    if (est.roto && est.rebobinar < 0) {
      const H = est.hueco;
      const hCentro = (f.d - H.dot(f.n));            // profundidad del centro del agujero bajo la superficie
      const hFondo = hCentro + R_AGUJERO * 0.85;      // hasta el borde de abajo
      if (hFondo > 0.01) {
        const parte = clamp(hFondo / (2 * R_AGUJERO), 0, 1);
        const A = Math.PI * R_AGUJERO * R_AGUJERO * parte;
        const h = Math.max(0.02, hCentro + R_AGUJERO * (1 - parte) * 0.85);
        const v = Math.sqrt(2 * G * h);
        const Q = CD * A * v;                          // cm³/s
        est.caudal = Q;
        est.vChorro = v;
        const dV = Q * dt;
        f.relleno = Math.max(0.02, f.relleno - dV / botella.volumen);
        est.derramado += dV;
        // vena contracta: la sección del chorro se estrecha a ~0,78 del radio del orificio
        const t1 = tmp.set(1, 0, 0), t2 = tmp2.crossVectors(est.fuera, t1).normalize();
        const H0 = new THREE.Vector3().copy(H).addScaledVector(t2, -R_AGUJERO * (1 - parte) * 0.5).addScaledVector(est.fuera, 0.4);
        const v0 = new THREE.Vector3().copy(est.fuera).multiplyScalar(v);
        const ve = hacerVena(H0, v0, Math.sqrt(A / Math.PI) * 0.78, true);
        matVena.uniforms.uT.value += dt;
        // gotas: salen donde la vena se rompe, con la velocidad que lleva ahí
        const n = Math.min(80, Math.round(dt * 2600 * Math.sqrt(parte)));
        const tR = ve.tFin;
        const pR = new THREE.Vector3().copy(H0).addScaledVector(v0, tR).addScaledVector(gAparente, 0.5 * G * tR * tR);
        const vR = new THREE.Vector3().copy(v0).addScaledVector(gAparente, G * tR);
        for (let k = 0; k < n; k++) {
          const p = pR.clone().addScaledVector(t1, al(-0.12, 0.12)).addScaledVector(t2, al(-0.12, 0.12));
          const vel = vR.clone().multiplyScalar(al(0.96, 1.04)).addScaledVector(t1, al(-3, 3));
          p.addScaledVector(vel, Math.random() * dt);
          soltarGota(p, vel, al(0.1, 0.2) * (0.6 + 0.4 * parte));
        }
        if (Q > 4) est.tSeco = 0; else est.tSeco += dtReal;
        if (est.tSeco > 4.5) { vena.visible = false; empezarRebobinado(); }
      } else if (est.derramado > 0) {
        vena.visible = false;
        est.tSeco += dtReal;
        // ya no sale agua: al cabo de unos segundos… (sorpresa)
        if (est.tSeco > 4.5) empezarRebobinado();
      }
    }
    audio?.chorro?.(est.caudal > 0 ? clamp(est.caudal / 120, 0.15, 1) : 0);

    // charco: área = volumen / espesor
    if (est.derramado > 0.5) {
      if (est.hayAterrizaje) est.centroCharco.lerp(est.aterrizaje, est.nCharco++ < 2 ? 1 : 0.02);
      const r = Math.min(14, Math.sqrt(est.derramado / (Math.PI * ESPESOR)));
      charco.visible = true;
      charco.scale.setScalar(Math.max(0.01, r));
      charco.position.x = est.centroCharco.x; charco.position.z = Math.min(est.centroCharco.z, 6.5);
      charco.material.uniforms.uT.value += dt;
    }

    // cristales: caen, rebotan en la mesa y se quedan planos
    for (const c of cristales) {
      if (est.rebobinar >= 0) continue;
      if (c.quieto) continue;
      c.v.addScaledVector(gAparente, G * dt);
      c.m.position.addScaledVector(c.v, dt);
      c.m.rotation.x += c.w.x * dt; c.m.rotation.y += c.w.y * dt; c.m.rotation.z += c.w.z * dt;
      if (c.m.position.y < Y_MESA + 0.03) {
        c.m.position.y = Y_MESA + 0.03;
        if (Math.abs(c.v.y) < 25) {
          c.quieto = true;
          c.m.rotation.set(-Math.PI / 2, 0, Math.random() * 6.283);
          if (Math.random() < 0.5) audio?.tintineo?.(0.3);
        } else {
          c.v.y = -c.v.y * 0.3; c.v.x *= 0.5; c.v.z *= 0.5; c.w.multiplyScalar(0.4);
          if (Math.random() < 0.6) audio?.tintineo?.(0.5);
        }
      }
    }

    actualizarGotas(dt);
    if (est.rebobinar >= 0) rebobinar(dtReal);
    return est.lenta;
  }

  // ---- sorpresa: el tiempo va hacia atrás y la botella se recompone (como un vídeo al revés)
  const DUR_REB = 4.2;
  function empezarRebobinado() {
    est.rebobinar = 0;
    est.rellenoRoto = f.relleno; est.derramadoRoto = est.derramado;
    for (const c of cristales) { c.desde = c.m.position.clone(); c.qDesde = c.m.quaternion.clone(); }
    est.grietasRotas = grietas.map((g) => g.w);
    audio?.magia?.(DUR_REB);
    est.alRebobinar?.();
  }
  function rebobinar(dt) {
    est.rebobinar += dt;
    const t = clamp(est.rebobinar / DUR_REB, 0, 1);
    const e = suave(t);
    // el agua del charco vuelve por el aire al agujero: la gravedad es reversible (un lanzamiento con la
    // velocidad de llegada cambiada de signo recorre la misma parábola hacia atrás)
    if (t < 0.75 && est.hayAterrizaje) {
      const n = Math.round(dt * 1500 * (1 - t));
      for (let k = 0; k < n; k++) {
        const p = new THREE.Vector3(est.aterrizaje.x + al(-0.15, 0.15), Y_MESA + 0.06, est.aterrizaje.z + al(-0.15, 0.15));
        const v = est.vAterrizaje.clone().multiplyScalar(-al(0.985, 1.0));
        p.addScaledVector(v, Math.random() * dt);
        soltarGota(p, v, al(0.1, 0.17), true, true);
      }
    }
    f.relleno = est.rellenoRoto + (est.rellenoInicial - est.rellenoRoto) * e;
    est.derramado = est.derramadoRoto * (1 - suave(t * 1.3));
    if (est.derramado < 0.5) charco.visible = false; else charco.scale.setScalar(Math.max(0.01, Math.sqrt(est.derramado / (Math.PI * ESPESOR))));
    // cristales al revés: suben de la mesa a su sitio en el cristal
    const ec = suave(clamp((t - 0.25) / 0.6, 0, 1));
    for (const c of cristales) {
      c.m.position.lerpVectors(c.desde, c.origen, ec); c.m.position.y += Math.sin(Math.PI * ec) * 1.5;
      c.m.quaternion.slerpQuaternions(c.qDesde, c.qOrigen, ec);
    }
    U.uAgujero.value.w = R_AGUJERO * (1 - suave(clamp((t - 0.8) / 0.15, 0, 1)));
    for (let i = 0; i < 4; i++) grietas[i].w = est.grietasRotas[i] * (1 - suave(clamp((t - 0.82) / 0.18, 0, 1)));
    if (t >= 1) {
      for (const c of cristales) { encima.remove(c.m); c.m.geometry.dispose(); }
      cristales.length = 0;
      for (let i = 0; i < 4; i++) { grietas[i].w = 0; objGrieta[i] = 0; }
      U.uAgujero.value.set(0, 0, 0, 0);
      f.relleno = est.rellenoInicial;
      Object.assign(est, { impactos: 0, roto: false, derramado: 0, rebobinar: -1, tSeco: 0, nCharco: 0, hayAterrizaje: false });
      charco.visible = false;
      est.alReparar?.();
    }
  }

  return {
    andanada, actualizar, estado: est, encima,
    get hayEncima() { return cristales.length > 0 || est.caudal > 0 || est.rebobinar >= 0 || est.hayGotas; },
    get ocupada() { return est.roto || est.rebobinar >= 0 || est.pendientes.length > 0 || balas.length > 0; },
    set alRomper(fn) { est.alRomper = fn; }, set alRebobinar(fn) { est.alRebobinar = fn; }, set alReparar(fn) { est.alReparar = fn; },
    reparar: () => { if (est.roto && est.rebobinar < 0) empezarRebobinado(); },
  };
}
