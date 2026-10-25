// Entorno de estudio procedural: ventana con parteluces, softboxes, luces cálidas y puntos brillantes.
// Se renderiza a un cubemap HDR que usan el vidrio (muestreo directo) y los materiales PBR (PMREM).
import * as THREE from 'three';

function panel(ancho, alto, pos, color, intensidad, mirar = new THREE.Vector3()) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(ancho, alto),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensidad), side: THREE.DoubleSide, toneMapped: false }),
  );
  m.position.copy(pos);
  m.lookAt(mirar);
  return m;
}

function cupula() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `
      varying vec3 vD;
      void main(){
        vec3 d = normalize(vD);
        float h = d.y;
        vec3 suelo = vec3(0.020, 0.013, 0.009);
        vec3 pared = vec3(0.075, 0.058, 0.045);
        vec3 techo = vec3(0.16, 0.15, 0.15);
        vec3 c = h < 0. ? mix(pared*0.55, suelo, smoothstep(0., -0.5, h)) : mix(pared, techo, smoothstep(0.0, 0.9, h));
        // franjas verticales tenues (cortinas, estanterías) para dar textura a los reflejos
        float a = atan(d.x, d.z);
        c *= 0.75 + 0.5 * smoothstep(0.35, 0.65, sin(a * 7.0 + 1.3) * 0.5 + 0.5) * smoothstep(-0.2, 0.3, h);
        // resplandor cálido hacia atrás-derecha
        c += vec3(0.18, 0.09, 0.035) * pow(max(dot(d, normalize(vec3(0.7, 0.05, -0.7))), 0.), 6.);
        gl_FragColor = vec4(c, 1.);
      }`,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), mat);
}

export function crearEscenaEntorno() {
  const e = new THREE.Scene();
  e.add(cupula());
  const O = new THREE.Vector3();
  const R = 14;

  // Ventana grande arriba a la izquierda con 2x3 cristales y azul cielo hacia arriba.
  const centro = new THREE.Vector3(-0.62, 0.50, 0.60).normalize().multiplyScalar(R);
  const n = centro.clone().negate().normalize();
  const arriba = new THREE.Vector3(0, 1, 0);
  const der = new THREE.Vector3().crossVectors(n, arriba).normalize().negate();
  const up = new THREE.Vector3().crossVectors(der, n).normalize().negate();
  const cw = 2.5, ch = 2.3, hueco = 0.22;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 2; j++) {
      const p = centro.clone()
        .addScaledVector(der, (i - 1) * (cw + hueco))
        .addScaledVector(up, (j - 0.5) * (ch + hueco));
      const cielo = new THREE.Color().lerpColors(new THREE.Color(1.0, 0.97, 0.92), new THREE.Color(0.72, 0.86, 1.0), j === 1 ? 0.7 : 0.15);
      e.add(panel(cw, ch, p, cielo, 18, O));
    }
  }
  // Tira de luz cálida vertical a la derecha.
  e.add(panel(0.9, 9, new THREE.Vector3(R * 0.95, 0.2, R * 0.30), new THREE.Color(1.0, 0.82, 0.62), 7, O));
  // Gran difusor cenital tenue.
  e.add(panel(13, 7, new THREE.Vector3(0.5, R * 0.95, 1.5), new THREE.Color(0.92, 0.96, 1.0), 0.55, O));
  // Luz de contra cálida detrás.
  e.add(panel(3.5, 5, new THREE.Vector3(R * 0.55, 1.0, -R * 0.85), new THREE.Color(1.0, 0.72, 0.45), 6, O));
  // Tira horizontal baja delante: brillo largo en la parte inferior del cristal.
  e.add(panel(11, 0.7, new THREE.Vector3(0.5, -R * 0.42, R * 0.90), new THREE.Color(0.95, 0.97, 1.0), 3.2, O));
  // Rebote frío bajo a la izquierda (mesa azulada).
  e.add(panel(8, 1.6, new THREE.Vector3(-R * 0.7, -3.8, R * 0.55), new THREE.Color(0.45, 0.65, 0.9), 0.9, O));
  // Puntos brillantes pequeños (lámparas lejanas).
  const puntos = [[-0.2, 0.28, 0.95], [0.35, 0.45, 0.8], [-0.85, 0.18, 0.5], [0.8, 0.38, -0.45]];
  for (const [x, y, z] of puntos) {
    e.add(panel(0.45, 0.45, new THREE.Vector3(x, y, z).normalize().multiplyScalar(R * 0.98), new THREE.Color(1, 0.92, 0.8), 12, O));
  }
  return e;
}

// Renderiza el entorno a un cubemap HDR con mipmaps.
export function crearCubemapEntorno(renderer, tam = 256) {
  const rt = new THREE.WebGLCubeRenderTarget(tam, {
    type: THREE.HalfFloatType,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
  });
  const cam = new THREE.CubeCamera(0.1, 100, rt);
  const escena = crearEscenaEntorno();
  cam.update(renderer, escena);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const pm = pmrem.fromCubemap(rt.texture);
  pmrem.dispose();
  return { cubo: rt.texture, pmrem: pm.texture };
}
