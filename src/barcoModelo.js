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

  // velas: se hinchan con el viento y flamean un poco (desplazamiento en el vértice a lo largo de _EMPUJE)
  const uVelas = { uTiempo: { value: 0 }, uViento: { value: 0.8 } };
  gltf.scene.updateMatrixWorld(true);
  const mallas = [];
  gltf.scene.traverse((o) => { if (o.isMesh) mallas.push(o); });
  for (const m of mallas) {
    m.matrixWorld.decompose(m.position, m.quaternion, m.scale);
    m.frustumCulled = false;
    const mat = m.material;
    if (mat.map) mat.map.anisotropy = 4;
    if (m.geometry.attributes._empuje) {
      // lona: algo de translucidez a contraluz, como la vela procedural
      mat.emissive = new THREE.Color(0.30, 0.25, 0.18);
      mat.emissiveMap = mat.map;
      mat.emissiveIntensity = 0.06;
      mat.side = THREE.DoubleSide;
      mat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, uVelas);
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nattribute vec3 _empuje; uniform float uTiempo; uniform float uViento;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            float flameo = sin(uTiempo * 2.3 + position.y * 1.3 + position.x * 0.7) * 0.5 + sin(uTiempo * 4.1 + position.y * 2.9) * 0.25;
            transformed += _empuje * (0.05 + 0.07 * uViento) * (1.0 + 0.18 * flameo * uViento);`);
      };
    } else if (m.geometry.attributes._ondeo) {
      // banderas: ondas que recorren la tela desde el asta hacia la punta, más rápidas y amplias con viento
      mat.side = THREE.DoubleSide;
      mat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, uVelas);
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nattribute vec3 _ondeo; uniform float uTiempo; uniform float uViento;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            float tb = length(_ondeo);
            float onda = sin(uTiempo * (5.0 + 5.0 * uViento) - tb * 7.0) + 0.35 * sin(uTiempo * 11.0 - tb * 15.0 + 1.3);
            transformed += _ondeo * onda * (0.05 + 0.10 * uViento);`);
      };
    }
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
    proa: t.max[0], popa: t.min[0], rumbo: extras.rumbo,
  };
  return {
    grupo, info, modelo: true, credito: extras.credito || '',
    matPopa: { emissiveIntensity: 0 }, // el modelo no tiene ventanas de popa iluminables
    actualizar(tiempo, viento) { uVelas.uTiempo.value = tiempo; uVelas.uViento.value = viento; },
    farolillos(noche, tiempo) {
      luces.visible = noche > 0.05;
      matLuz.color.setRGB(1, 0.62, 0.28).multiplyScalar(7 * noche * (0.92 + 0.08 * Math.sin(tiempo * 7.3)));
    },
  };
}
