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

  // Animación con el viento (viento.js) en el sombreador de vértices, según los atributos que traiga cada malla:
  //  velas (_EMPUJE, _VELA): se llenan con las rachas (con inercia), ondas que corren del borde sujeto al libre,
  //    el borde libre flamea más y, sin viento, la tela floja gualdrapea; los pliegues cambian la luz;
  //  banderas (_ONDEO): ondean desde el asta, más rápido y más amplio con las rachas;
  //  cabos (_CABO, _SIGUE): vibran con el viento, se destensan cuando para y los enganchados a una vela la siguen.
  const uViento = {
    uTiempo: { value: 0 }, uFase: { value: 0 }, uFaseB: { value: 0 },
    uLlenado: { value: 0.3 }, uViento: { value: 0.3 }, uFlojo: { value: 0 },
  };
  const DECL = `
    uniform float uTiempo; uniform float uFase; uniform float uFaseB; uniform float uLlenado; uniform float uViento; uniform float uFlojo;
    varying float vPliegue;
    #ifdef VELA
      attribute vec3 _empuje; attribute vec4 _vela;
    #endif
    #ifdef BANDERA
      attribute vec3 _ondeo;
    #endif
    #ifdef CABO
      attribute vec4 _cabo; attribute vec4 _sigue;
    #endif
    // ondas de flameo: corren por la tela del borde sujeto (w = 0) al libre (w = 1), con un armónico irregular
    float ondaVela(float w, float h){ return sin(uFase - w * 8.0 + h * 1.5) * 0.65 + sin(uFase * 1.73 - w * 15.0 + 2.1) * 0.35; }
    // amplitud relativa al tamaño de la vela: el borde libre flamea mucho más; floja, gualdrapea
    float ampFlameo(float w){ return (0.15 + 0.85 * w * w) * (0.008 + 0.024 * uViento + 0.055 * uFlojo); }`;
  const MOV = `
    vPliegue = 0.0;
    #ifdef VELA
      vec3 dv = normalize(_empuje + vec3(1e-6));
      float ov = ondaVela(_vela.x, _vela.y);
      float av = ampFlameo(_vela.x) * _vela.z;
      transformed += _empuje * (0.02 + 0.10 * uLlenado * (1.0 - 0.6 * uFlojo)) + dv * ov * av;
      vPliegue = ov * clamp(av * 7.0, 0.0, 1.0);
    #endif
    #ifdef BANDERA
      float tb = length(_ondeo);
      float ob = sin(uFaseB - tb * 7.0) + 0.35 * sin(uFaseB * 1.9 - tb * 15.0 + 1.3);
      transformed += _ondeo * ob * (0.05 + 0.10 * uViento);
      vPliegue = ob * tb * 0.6;
    #endif
    #ifdef CABO
      float vib = sin(uTiempo * (9.0 + 8.0 * uViento) + _cabo.w) * (0.006 + 0.022 * uViento) + sin(uTiempo * 1.3 + _cabo.w * 2.0) * 0.012;
      transformed += _cabo.xyz * vib;
      transformed.y -= length(_cabo.xyz) * 0.05 * uFlojo;
      transformed += _sigue.xyz * ondaVela(_sigue.w, 0.3) * ampFlameo(_sigue.w);
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
      uViento.uTiempo.value = tiempo; uViento.uFase.value = v.fase; uViento.uFaseB.value = v.faseBandera;
      uViento.uLlenado.value = Math.min(v.llenado, 1.3); uViento.uViento.value = Math.min(v.total, 1.4); uViento.uFlojo.value = v.flojo;
    },
    farolillos(noche, tiempo) {
      luces.visible = noche > 0.05;
      matLuz.color.setRGB(1, 0.62, 0.28).multiplyScalar(7 * noche * (0.92 + 0.08 * Math.sin(tiempo * 7.3)));
    },
  };
}
