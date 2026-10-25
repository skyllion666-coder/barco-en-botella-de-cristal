// Mundo exterior a la botella: fondo desenfocado, mesa de madera, soporte de caoba y corcho. La habitación tiene
// luz fija; el clima (tormenta, noche, rayos...) vive solo en la escena interior, con sus propias luces.
import * as THREE from 'three';
import { texMadera, texCorcho } from './texturas.js';
import { CORCHO_INT_X, BOCA_X, R_CUERPO } from './bottle.js';

export const Y_MESA = -7.95;

function fondo() {
  const mat = new THREE.ShaderMaterial({
    depthWrite: false,
    uniforms: {},
    vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `
      varying vec2 vUv; varying vec3 vW;
      float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
      void main(){
        vec2 p = vW.xy / 60.0;
        vec3 base = mix(vec3(0.022,0.018,0.015), vec3(0.082,0.068,0.057), smoothstep(-0.6, 0.6, p.y));
        // resplandor de la ventana arriba a la izquierda
        float g = exp(-pow(length((p - vec2(-0.55, 0.55)) * vec2(0.8, 1.2)) * 1.5, 2.0));
        base += vec3(0.45, 0.36, 0.27) * g * 0.7;
        // habitación desenfocada (profundidad de campo): estantería con lomos de libros, marco de la ventana
        // y canto de un mueble lejano; todo a baja frecuencia, como visto muy fuera de foco
        float estante = smoothstep(0.10, 0.02, abs(p.y - 0.12)) * smoothstep(0.95, 0.15, p.x) * smoothstep(-0.95, -0.25, p.x);
        float lomos = 0.5 + 0.5 * sin(p.x * 23.0 + sin(p.x * 7.0) * 1.5) * sin(p.x * 9.0 + 1.3);
        base = mix(base, base * (0.55 + 0.35 * lomos) + vec3(0.03, 0.018, 0.01) * lomos, estante * 0.8);
        float balda = exp(-pow((p.y - 0.235) / 0.022, 2.0)) * smoothstep(0.95, 0.2, p.x) * smoothstep(-0.95, -0.3, p.x);
        base += vec3(0.06, 0.045, 0.03) * balda;
        float marco = exp(-pow((p.x + 0.18) / 0.03, 2.0)) * smoothstep(0.15, 0.4, p.y);
        base *= 1.0 - 0.35 * marco;
        float mueble = smoothstep(-0.20, -0.30, p.y) * smoothstep(0.98, 0.5, p.x);
        base = mix(base, base * 0.6, mueble);
        // luces desenfocadas (bokeh): discos de bordes suaves con el anillo algo más brillante, tamaños y tonos variados
        for (int i = 0; i < 22; i++){
          float fi = float(i);
          vec2 c = vec2(h21(vec2(fi, 1.7)) * 2.0 - 1.0, h21(vec2(fi, 8.3)) * 0.9 - 0.15);
          float r = 0.03 + 0.08 * h21(vec2(fi, 3.1)) * h21(vec2(fi, 4.4));
          float d = length(p - c);
          float disco = smoothstep(r, r * 0.7, d) * (0.75 + 0.25 * smoothstep(r * 0.4, r * 0.95, d));
          vec3 tono = mix(vec3(1.0, 0.72, 0.45), vec3(0.75, 0.82, 1.0), step(0.78, h21(vec2(fi, 9.9))));
          base += tono * disco * (0.02 + 0.055 * h21(vec2(fi, 5.5)));
        }
        gl_FragColor = vec4(base, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(260, 130), mat);
  m.position.set(0, 20, -31);
  return m;
}

function geoCorcho() {
  // Perfil (x, r): parte interior cónica, cuerpo, borde superior redondeado y cara plana.
  const pts = [
    [CORCHO_INT_X, 0.0], [CORCHO_INT_X, 1.02], [14.4, 1.09], [BOCA_X - 0.05, 1.14],
    [15.5, 1.26], [16.2, 1.28], [16.75, 1.27], [16.92, 1.22], [16.98, 1.12], [16.98, 0.0],
  ];
  const curva = new THREE.CatmullRomCurve3(pts.map(([x, r]) => new THREE.Vector3(x, r, 0)), false, 'centripetal');
  const perfil = curva.getPoints(60);
  const S = 64, pos = [], nor = [], uv = [], idx = [];
  for (let i = 0; i < perfil.length; i++) {
    const a = perfil[Math.max(0, i - 1)], b = perfil[Math.min(perfil.length - 1, i + 1)];
    const dx = b.x - a.x, dr = b.y - a.y, l = Math.hypot(dx, dr) || 1;
    for (let j = 0; j <= S; j++) {
      const phi = (j / S) * Math.PI * 2, c = Math.cos(phi), s = Math.sin(phi);
      pos.push(perfil[i].x, perfil[i].y * c, perfil[i].y * s);
      nor.push(-dr / l, (dx / l) * c, (dx / l) * s);
      uv.push(j / S * 2, (perfil[i].x - CORCHO_INT_X) / 3.2);
    }
  }
  for (let i = 0; i < perfil.length - 1; i++) {
    for (let j = 0; j < S; j++) {
      const a = i * (S + 1) + j, b = a + 1, c = a + S + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// Cuna: pieza con el hueco circular donde descansa la botella, cantos superiores redondeados y una muesca
// decorativa a cada lado, cerca del pie.
function geoCuna() {
  const half = 3.7, rad = R_CUERPO + 0.02, base = -7.25, f = 0.32;
  const y = (z) => -Math.sqrt(rad * rad - z * z);
  const s = new THREE.Shape();
  const lado = (sg) => {
    // sube por un costado con la muesca (sg = +1 derecha, -1 izquierda)
    const pts = [[half, base + 0.42], [half - 0.14, base + 0.50], [half - 0.14, base + 0.74], [half, base + 0.82], [half, y(half) - f]];
    return sg > 0 ? pts : pts.reverse();
  };
  s.moveTo(-half, base);
  s.lineTo(half, base);
  for (const [z, yy] of lado(1)) s.lineTo(z, yy);
  s.quadraticCurveTo(half, y(half), half - f, y(half - f));
  const N = 36;
  for (let i = 0; i <= N; i++) { const z = (half - f) - (2 * (half - f) * i) / N; s.lineTo(z, y(z)); }
  s.quadraticCurveTo(-half, y(half), -half, y(half) - f);
  for (const [z, yy] of lado(-1)) s.lineTo(-z, yy);
  s.lineTo(-half, base);
  const g = new THREE.ExtrudeGeometry(s, { depth: 1.05, bevelEnabled: true, bevelSize: 0.07, bevelThickness: 0.07, bevelSegments: 3, curveSegments: 8 });
  g.rotateY(Math.PI / 2);
  g.translate(-0.525, 0, 0);
  return g;
}

// Peana moldurada: zócalo recto, pequeño escalón y canto redondeado hasta la cara superior.
function geoPeana(largo) {
  const W = 2.8, H = 0.72;
  const s = new THREE.Shape();
  s.moveTo(-W, 0); s.lineTo(W, 0); s.lineTo(W, 0.2);
  s.lineTo(W - 0.12, 0.26);
  s.quadraticCurveTo(W - 0.12, H - 0.04, W - 0.52, H);
  s.lineTo(-(W - 0.52), H);
  s.quadraticCurveTo(-(W - 0.12), H - 0.04, -(W - 0.12), 0.26);
  s.lineTo(-W, 0.2); s.lineTo(-W, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: largo, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.08, bevelSegments: 3, curveSegments: 10 });
  g.rotateY(Math.PI / 2);
  g.translate(-largo / 2, 0, 0);
  return g;
}

export function crearMundo({ pmrem }) {
  const escena = new THREE.Scene();
  escena.environment = pmrem;
  escena.environmentIntensity = 1.0;

  const grupoFijo = new THREE.Group(); // todo lo que va rígidamente unido a la botella
  const fondoMesh = fondo();
  escena.add(fondoMesh);

  // ---- mesa
  const mesaTex = texMadera({ w: 1024, h: 1024, oscuro: [0.028, 0.016, 0.009], claro: [0.12, 0.07, 0.038], tablones: 6, anillos: 0.55, semilla: 8, rayas: 0.6 });
  mesaTex.mapa.repeat.set(2.4, 1); mesaTex.bump.repeat.set(2.4, 1);
  const mesa = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 60),
    new THREE.MeshPhysicalMaterial({ map: mesaTex.mapa, bumpMap: mesaTex.bump, bumpScale: 1.6, roughness: 0.42, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.35 }),
  );
  mesa.rotation.x = -Math.PI / 2;
  mesa.position.set(0, Y_MESA, 0);
  escena.add(mesa);

  // ---- sombra de contacto y reflejo cáustico sobre la mesa
  const efectoMesa = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 34),
    new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTiempo: { value: 0 }, uLuz: { value: new THREE.Color(1, 1, 1) } },
      vertexShader: `varying vec2 vP; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vP = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `
        uniform float uTiempo; uniform vec3 uLuz; varying vec2 vP;
        float sdCaja(vec2 p, vec2 c, vec2 h){ vec2 d = abs(p - c) - h; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
        void main(){
          // sombra: pie del soporte (nítida y corta) + masa de la botella (amplia y suave, cae hacia atrás-derecha)
          float s1 = exp(-max(sdCaja(vP, vec2(-3.6, 0.0), vec2(7.4, 2.8)), 0.0) * 0.9) * 0.78;
          float s2 = exp(-max(sdCaja(vP, vec2(0.8, -1.4), vec2(13.0, 3.6)), 0.0) * 0.28) * 0.42;
          float vig = smoothstep(7.0, 30.0, abs(vP.x + 1.0)) * 0.62 + smoothstep(9.0, 20.0, vP.y > 0.0 ? vP.y : 0.0) * 0.25 + smoothstep(8.0, 26.0, -vP.y) * 0.35;
          float a = clamp(max(max(s1, s2), vig), 0.0, 0.9);
          // brillo cáustico turquesa por delante, a través del vidrio y el agua
          vec2 q = (vP - vec2(-3.0, 6.4)) / vec2(11.0, 2.8);
          float g = exp(-dot(q, q) * 1.3);
          float fil = 0.55 + 0.45 * sin(vP.x * 2.3 + sin(vP.y * 1.7 + uTiempo * 0.6) * 1.7 + uTiempo * 0.5) * sin(vP.x * 1.1 - vP.y * 2.1 + uTiempo * 0.35);
          vec3 caus = vec3(0.10, 0.34, 0.36) * g * fil * uLuz * 0.55;
          gl_FragColor = vec4(caus, 0.0);
          gl_FragColor.a = a;
          gl_FragColor.rgb = mix(caus, vec3(0.0), a);
        }`,
    }),
  );
  efectoMesa.rotation.x = -Math.PI / 2;
  efectoMesa.position.set(0, Y_MESA + 0.015, 0);
  efectoMesa.renderOrder = 1;
  escena.add(efectoMesa);

  // ---- soporte de caoba
  const caoba = texMadera({ w: 512, h: 512, oscuro: [0.035, 0.008, 0.005], claro: [0.17, 0.045, 0.022], anillos: 0.9, semilla: 14 });
  const matCaoba = new THREE.MeshPhysicalMaterial({
    map: caoba.mapa, bumpMap: caoba.bump, bumpScale: 1.2, roughness: 0.34, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.22,
  });
  const base = new THREE.Mesh(geoPeana(14.8), matCaoba);
  base.position.set(-3.6, Y_MESA + 0.05, 0);
  grupoFijo.add(base);
  for (const x of [-9.6, 2.3]) {
    const c = new THREE.Mesh(geoCuna(), matCaoba);
    c.position.set(x, 0, 0);
    grupoFijo.add(c);
  }
  escena.add(grupoFijo);

  // ---- corcho
  const cork = texCorcho();
  cork.mapa.repeat.set(1, 1);
  const corcho = new THREE.Mesh(
    geoCorcho(),
    new THREE.MeshStandardMaterial({ map: cork.mapa, bumpMap: cork.bump, bumpScale: 3, roughness: 0.92, metalness: 0 }),
  );
  grupoFijo.add(corcho);

  // ---- luces directas de la habitación (el resto viene del entorno)
  const sol = new THREE.DirectionalLight(0xfff1de, 2.2);
  sol.position.set(-6, 9, 8);
  escena.add(sol);
  const relleno = new THREE.DirectionalLight(0x9db8e0, 0.35);
  relleno.position.set(8, 2, 6);
  escena.add(relleno);

  // ---- escena interior de la botella: barco, precipitación, rayos y estrellas, con luces que sigue el clima
  const escenaInt = new THREE.Scene();
  escenaInt.environment = pmrem;
  escenaInt.environmentIntensity = 1.0;
  const solInt = sol.clone(), rellenoInt = relleno.clone();
  const rayoInt = new THREE.PointLight(0xc8d8ff, 0, 0, 2);
  escenaInt.add(solInt, rellenoInt, rayoInt);

  return {
    escena, grupoFijo, luces: { sol, relleno }, fondo: fondoMesh.material, efectoMesa: efectoMesa.material,
    interior: { escena: escenaInt, luces: { sol: solInt, relleno: rellenoInt, rayo: rayoInt } },
  };
}
