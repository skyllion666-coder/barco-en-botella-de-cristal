// Barco a partir de un modelo real preparado por scripts/preparar_barco.mjs: ya viene en el marco de la app
// (proa +X, Y arriba, flotación en y = 0), unido por materiales, con _EMPUJE en las velas (hinchado) y _ONDEO en
// las banderas. En extras trae la huella del casco, los farolillos, el rumbo y el crédito del autor.
// Misma interfaz que el barco procedural de barco.js.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export async function crearBarcoModelo(datos) {
  const cargador = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const buf = datos.buffer.slice(datos.byteOffset, datos.byteOffset + datos.byteLength);
  const gltf = await cargador.parseAsync(buf, '');
  const extras = gltf.scene.userData || {};
  const grupo = new THREE.Group();

  // Animación con el viento (viento.js) en el sombreador de vértices, según los atributos que traiga cada malla.
  // Velas (_EMPUJE, _VELA, _PLANO):
  //   sin viento cuelgan: sin bolsa, con pliegues verticales que se ahondan hacia el borde libre, el pujamen cae un
  //   poco y la tela se mece despacio con el barco;
  //   con poco viento (o una racha que empieza) flamean: ondas grandes que corren del borde sujeto al libre;
  //   llenas, se tensan: bolsa grande que respira con las rachas y solo tiembla la baluma.
  // Banderas (_ONDEO, _ASTA): sin viento caen junto al asta con pliegues; con viento se extienden y ondean,
  //   más deprisa y más amplio con las rachas (responden al momento, no tienen la inercia de las velas).
  // Cabos (_CABO, _SIGUE, _COLGAR): flojos hacen catenaria y se mecen; tensos se estiran y vibran con el viento;
  //   los enganchados a una vela (escotas, brazas) siguen su movimiento.
  const uViento = {
    uTiempo: { value: 0 }, uFase: { value: 0 }, uFaseB: { value: 0 },
    uLlenado: { value: 0.3 }, uViento: { value: 0.3 }, uFlojo: { value: 0 }, uForma: { value: 0.3 },
  };
  const DECL = `
    uniform float uTiempo; uniform float uFase; uniform float uFaseB; uniform float uLlenado; uniform float uViento; uniform float uFlojo; uniform float uForma;
    varying float vPliegue;
    #ifdef VELA
      attribute vec3 _empuje; attribute vec4 _vela; attribute vec3 _plano;
    #endif
    #ifdef BANDERA
      attribute vec3 _ondeo; attribute vec4 _asta;
    #endif
    #ifdef CABO
      attribute vec4 _cabo; attribute vec4 _sigue; attribute vec3 _colgar;
    #endif
    // ondas de flameo: corren por la tela del borde sujeto (w = 0) al libre (w = 1), con un armónico irregular
    float ondaVela(float w, float h){ return sin(uFase - w * 7.0 + h * 1.5) * 0.65 + sin(uFase * 1.73 - w * 13.0 + 2.1) * 0.35; }
    // lo llena y tensa que está la tela (0 colgando, 1 llena) y cuánto flamea (viento que no llega a llenarla)
    // uForma: lo llena que está la tela, con un muelle que rebota un poco al coger la racha (el «pum» de la lona)
    float llena(){ return max(uForma, 0.0); }
    float flamea(){ return smoothstep(0.03, 0.2, uViento) * (1.0 - smoothstep(0.35, 0.85, uForma)); }
    // amplitud del flameo, relativa al tamaño de la vela: el borde libre se mueve mucho más que el sujeto
    float ampFlameo(float w){ return (0.1 + 0.9 * w * w) * (0.03 * min(llena(), 1.0) * min(uViento, 1.4) + 0.08 * flamea()); }`;
  const MOV = `
    vPliegue = 0.0;
    #ifdef VELA
    {
      float f = llena(), suelta = clamp(1.0 - f, 0.0, 1.0), tam = _vela.z, w = _vela.x;
      vec3 dv = normalize(_empuje + vec3(1e-6));
      // colgando: fuera la bolsa, pliegues verticales y el borde libre cae y se mece
      transformed += _plano * suelta;
      float fasePl = _vela.w * 31.4 + sin(_vela.w * 11.0) * 1.3 + uTiempo * 0.3;
      float hondo = suelta * (0.25 + 0.75 * w) * 0.005 * tam;
      transformed += dv * (sin(fasePl) * hondo + sin(uTiempo * 0.9 + _vela.y * 1.5) * 0.012 * tam * w * suelta);
      transformed.y -= suelta * w * w * 0.006 * tam;
      // llena: más bolsa, que respira con las rachas
      transformed += _empuje * f * (0.16 + 0.07 * sin(uTiempo * 2.6 + _vela.y) * min(uViento, 1.4));
      // flameo: ondas que corren por la tela
      float ov = ondaVela(w, _vela.y);
      float av = ampFlameo(w) * tam;
      transformed += dv * ov * av;
      // los pliegues y las ondas se ven por la luz: unas partes más claras y otras más oscuras
      vPliegue = cos(fasePl) * suelta * (0.25 + 0.75 * w) * 0.25 + ov * clamp(av / tam * 14.0, 0.0, 1.0);
    }
    #endif
    #ifdef BANDERA
    {
      float fb = smoothstep(0.03, 0.55, uViento), tb = length(_ondeo), largo = _asta.w;
      // sin viento cae junto al asta (gira hacia abajo desde ella), con pliegues; se mece un poco
      float th = (1.0 - fb) * (1.3 + 0.12 * sin(uTiempo * 0.8)) + 0.18 * fb * (1.0 - fb);
      transformed += _asta.xyz * (cos(th) - 1.0) - vec3(0.0, 1.0, 0.0) * length(_asta.xyz) * sin(th);
      // ondas que corren del asta a la punta, más amplias hacia la punta
      float ob = sin(uFaseB - tb * 7.0) + 0.35 * sin(uFaseB * 1.9 - tb * 15.0 + 1.3);
      float pl = sin(tb * 9.0 + uTiempo * 0.6);
      transformed += _ondeo * largo * (ob * (0.05 + 0.11 * fb) * fb + pl * 0.08 * (1.0 - fb));
      // la punta además sube y baja (el ondeo no es solo de lado)
      transformed.y += sin(uFaseB * 0.9 - tb * 6.0) * 0.04 * largo * tb * fb;
      vPliegue = (ob * fb + pl * (1.0 - fb)) * tb;
    }
    #endif
    #ifdef CABO
    {
      float tension = clamp(llena() * 1.4, 0.0, 1.0), floja = 1.0 - tension;
      float lc = length(_colgar);
      // flojo: catenaria (cae en el medio) y se mece despacio
      transformed += _colgar * floja * 0.045;
      transformed += _cabo.xyz * sin(uTiempo * 1.1 + _cabo.w) * lc * 0.05 * floja;
      // tenso: vibra, más deprisa y más fuerte cuanto más viento
      float vv = min(uViento, 1.4);
      transformed += _cabo.xyz * sin(uTiempo * (16.0 + 10.0 * vv) + _cabo.w) * 0.018 * vv * vv * tension;
      // enganchado a una vela: la sigue (flameo, vaivén y caída del borde libre cuando cuelga)
      float ws = _sigue.w, suelta = clamp(1.0 - llena(), 0.0, 1.0);
      transformed += _sigue.xyz * (ondaVela(ws, 0.3) * ampFlameo(ws) + sin(uTiempo * 0.9 + 0.45) * 0.012 * ws * suelta);
      transformed.y -= length(_sigue.xyz) * suelta * ws * ws * 0.006;
    }
    #endif`;
  function animar(mat, tipo) {
    mat.defines = { ...(mat.defines || {}), [tipo.vela ? 'VELA' : tipo.bandera ? 'BANDERA' : 'CABO']: 1 };
    if (tipo.vela && tipo.cabo) mat.defines.CABO = 1;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uViento);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + DECL)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + MOV);
      // los pliegues de la tela se ven: unas partes reciben más luz y otras menos
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vPliegue;')
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= 1.0 + 0.22 * vPliegue;');
    };
    mat.customProgramCacheKey = () => JSON.stringify(mat.defines);
  }

  gltf.scene.updateMatrixWorld(true);
  const mallas = [];
  gltf.scene.traverse((o) => { if (o.isMesh) mallas.push(o); });
  for (const m of mallas) {
    m.matrixWorld.decompose(m.position, m.quaternion, m.scale);
    m.frustumCulled = false;
    const at = m.geometry.attributes;
    const tipo = { vela: !!at._empuje, bandera: !!at._ondeo, cabo: !!at._cabo };
    // modelos preparados antes de estos atributos: ceros
    if (tipo.vela && !at._plano) m.geometry.setAttribute('_plano', new THREE.BufferAttribute(new Float32Array(at.position.count * 3), 3));
    if (tipo.bandera && !at._asta) m.geometry.setAttribute('_asta', new THREE.BufferAttribute(new Float32Array(at.position.count * 4), 4));
    if (tipo.cabo && !at._colgar) m.geometry.setAttribute('_colgar', new THREE.BufferAttribute(new Float32Array(at.position.count * 3), 3));
    if (tipo.vela || tipo.bandera || tipo.cabo) {
      m.material = m.material.clone();
      m.material.side = THREE.DoubleSide;
      if (tipo.vela) {
        // lona: algo de translucidez a contraluz, como la vela procedural
        m.material.emissive = new THREE.Color(0.30, 0.25, 0.18);
        m.material.emissiveMap = m.material.map;
        m.material.emissiveIntensity = 0.06;
      }
      animar(m.material, tipo);
    }
    if (m.material.map) m.material.map.anisotropy = 4;
    grupo.add(m);
  }

  // farolillos de noche en popa y proa (por encima de la regala)
  const c = extras.casco || { min: [-3.3, -0.65, -0.9], max: [3.3, 1.3, 0.9] };
  const t = extras.total || { min: c.min, max: c.max };
  const posLuces = extras.farolillos || [[c.min[0] + 0.25, c.max[1] + 0.35, 0], [c.max[0] - 0.35, c.max[1] + 0.2, 0]];
  const matLuz = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.62, 0.28), toneMapped: false });
  const geoLuz = new THREE.SphereGeometry(0.07, 10, 8);
  const luces = new THREE.Group();
  for (const [x, y, z] of posLuces) { const l = new THREE.Mesh(geoLuz, matLuz); l.position.set(x, y, z); luces.add(l); }
  luces.visible = false;
  grupo.add(luces);

  const forma = { x: 0.3, vel: 0, t: 0 };
  const info = {
    eslora: c.max[0] - c.min[0], manga: c.max[2] - c.min[2], alturaMax: t.max[1], calado: -c.min[1],
    proa: t.max[0], popa: t.min[0], rumbo: extras.rumbo, cubierta: c.max[1],
  };
  return {
    grupo, info, modelo: true, credito: extras.credito || '',
    matPopa: { emissiveIntensity: 0 }, // el modelo no tiene ventanas de popa iluminables
    // viento: estado de viento.js (o un número, con el viento del clima)
    actualizar(tiempo, viento) {
      const v = typeof viento === 'number' ? { total: viento, llenado: viento, flojo: 0, fase: tiempo * 4, faseBandera: tiempo * 8 } : viento;
      // forma de la tela: muelle poco amortiguado hacia lo que pide el llenado; al entrar una racha se llena de golpe
      // y rebota un poco, al irse el viento se vacía y queda recta
      const dt = Math.min(0.05, Math.max(0, tiempo - forma.t)); forma.t = tiempo;
      const objetivo = Math.min(1.15, Math.max(0, (v.llenado - 0.05) / 0.6));
      const pasos = Math.ceil(dt / 0.01);
      for (let i = 0; i < pasos; i++) {
        const h = dt / pasos;
        forma.vel += ((objetivo - forma.x) * 90 - forma.vel * (objetivo > forma.x ? 5.5 : 9)) * h;
        forma.x += forma.vel * h;
      }
      uViento.uForma.value = forma.x;
      uViento.uTiempo.value = tiempo; uViento.uFase.value = v.fase; uViento.uFaseB.value = v.faseBandera;
      uViento.uLlenado.value = Math.min(v.llenado, 1.3); uViento.uViento.value = Math.min(v.total, 1.4); uViento.uFlojo.value = v.flojo;
    },
    farolillos(noche, tiempo) {
      luces.visible = noche > 0.05;
      matLuz.color.setRGB(1, 0.62, 0.28).multiplyScalar(7 * noche * (0.92 + 0.08 * Math.sin(tiempo * 7.3)));
    },
  };
}
