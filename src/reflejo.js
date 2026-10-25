// Reflejo plano del barco en el agua: se dibuja el barco espejado respecto al plano del agua (solo la parte
// que queda por debajo, mediante un plano de recorte) y la pasada de volumen lo muestrea en pantalla.
import * as THREE from 'three';

export function crearReflejo({ mundo, barco, renderer }) {
  const escena = new THREE.Scene();
  escena.environment = mundo.escena.environment;
  const grupo = barco.grupo.clone();
  grupo.matrixAutoUpdate = false;
  escena.add(grupo);
  const sol = mundo.luces.sol.clone(), relleno = mundo.luces.relleno.clone();
  escena.add(sol, relleno);

  const R = new THREE.Matrix4(), plano = new THREE.Plane(), nNeg = new THREE.Vector3();

  function renderizar(camara, rt, estado) {
    escena.environmentIntensity = mundo.escena.environmentIntensity;
    escena.environmentRotation.copy(mundo.escena.environmentRotation);
    for (const [a, b] of [[sol, mundo.luces.sol], [relleno, mundo.luces.relleno]]) {
      a.position.copy(b.position); a.intensity = b.intensity; a.color.copy(b.color);
    }
    const { x, y, z } = estado.n, d = estado.d;
    // espejo respecto al plano n·x = d:  x' = x - 2 (n·x - d) n
    R.set(
      1 - 2 * x * x, -2 * x * y, -2 * x * z, 2 * d * x,
      -2 * x * y, 1 - 2 * y * y, -2 * y * z, 2 * d * y,
      -2 * x * z, -2 * y * z, 1 - 2 * z * z, 2 * d * z,
      0, 0, 0, 1,
    );
    grupo.matrix.copy(R).multiply(barco.grupo.matrix);
    grupo.matrixWorldNeedsUpdate = true;
    nNeg.copy(estado.n).negate();
    plano.set(nNeg, d); // conserva n·x <= d (la parte espejada que cae bajo la superficie)
    renderer.clippingPlanes = [plano];
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(escena, camara);
    renderer.clippingPlanes = [];
  }
  return { renderizar };
}
