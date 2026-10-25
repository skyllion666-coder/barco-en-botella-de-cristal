// Regresión: girar el móvil de horizontal a vertical (con cambio de orientación de pantalla) y volver.
// En cada paso comprueba que ningún vértice del barco atraviesa el cristal, que no da saltos y que cabe sin encogerse.
// Uso: node scripts/prueba_giro.mjs [galeon|ottoman|procedural] [clima]   (sale con código 1 si falla)
// Con clima «tormenta» se lanza además una ola grande al empezar.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('/opt/node-tools/node_modules/playwright');

const b = await chromium.launch({ args: ['--allow-file-access-from-files', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 640, height: 300 }, deviceScaleFactor: 1 });
const errores = [];
p.on('pageerror', (e) => errores.push(e.message));
// t=1: modo captura, sin bucle de animación; la prueba avanza la simulación a mano.
const barco = process.argv[2] || 'galeon', clima = process.argv[3] || 'despejado';
console.log('barco:', barco, '· clima:', clima);
await p.goto(`file:///home/user/repo/docs/index.html?t=1&ui=0&dpr=0.25&barco=${barco}&clima=${clima}`);
await p.waitForFunction('window.__listo === true', null, { timeout: 180000 });

const r = await p.evaluate(() => {
  const { avanzar, barco, botella } = window.__api;
  const X0 = botella.X0, X1 = botella.X1;
  // ángulo de pantalla controlado por la prueba
  window.__ang = 90;
  Object.defineProperty(screen.orientation, 'angle', { get: () => window.__ang, configurable: true });

  // vértices del barco en su marco local (submuestreados)
  const locales = [];
  barco.grupo.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 5) locales.push([pos.getX(i), pos.getY(i), pos.getZ(i)]);
  });
  const m = barco.grupo.matrix.elements;
  // Penetración en el cristal y mayor desplazamiento de un vértice respecto al cuadro anterior
  // (capta tanto traslaciones como giros o cambios de escala bruscos).
  let anterior = null;
  function medir() {
    const ahora = new Float64Array(locales.length * 3);
    let peor = -1e9, salto = 0;
    locales.forEach(([x, y, z], i) => {
      const wx = m[0] * x + m[4] * y + m[8] * z + m[12];
      const wy = m[1] * x + m[5] * y + m[9] * z + m[13];
      const wz = m[2] * x + m[6] * y + m[10] * z + m[14];
      ahora[i * 3] = wx; ahora[i * 3 + 1] = wy; ahora[i * 3 + 2] = wz;
      if (barco.grupo.visible) peor = Math.max(peor, Math.hypot(wy, wz) - botella.rIn(wx), X0 - wx, wx - X1);
      if (anterior) salto = Math.max(salto, Math.hypot(wx - anterior[i * 3], wy - anterior[i * 3 + 1], wz - anterior[i * 3 + 2]));
    });
    anterior = ahora;
    return { pen: barco.grupo.visible ? peor : 0, salto };
  }

  const dt = 1 / 60;
  let t = 1, peorPen = -1e9, peorSalto = 0, enPeor = '', enSalto = '';
  const fases = {};
  function paso(phi, fase) {
    // móvil girado phi grados en el plano de la pantalla, de pie frente al usuario
    window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: phi, gamma: -90, absolute: false }));
    avanzar(dt, t); t += dt;
    const { pen, salto } = medir();
    const f = fases[fase] || (fases[fase] = { pen: -1e9, salto: 0, escMin: 1, apoyo: 0 });
    f.pen = Math.max(f.pen, pen); f.salto = Math.max(f.salto, salto);
    const est = window.__api.flotacion.estado;
    f.escMin = Math.min(f.escMin, est.escala); f.apoyo = Math.max(f.apoyo, Math.abs(est.apoyo), Math.abs(est.escora));
    if (pen > peorPen) { peorPen = pen; enPeor = `${fase} phi=${phi.toFixed(0)}`; }
    if (salto > peorSalto) { peorSalto = salto; enSalto = `${fase} phi=${phi.toFixed(0)}`; }
  }
  const girar = (cambio) => { window.__ang = cambio; window.dispatchEvent(new Event('orientationchange')); };

  if (window.__api.clima.nombre === 'tormenta') window.__api.agua.lanzarOlaGrande(1);
  for (let i = 0; i < 90; i++) paso(0, 'reposo');
  // horizontal -> vertical; la pantalla rota a 70° (como hace Android, con algo de retraso)
  for (let phi = 0; phi <= 90; phi += 1.5) { if (phi >= 70 && window.__ang === 90) girar(0); paso(phi, 'ida'); }
  for (let i = 0; i < 120; i++) paso(90, 'vertical');
  // y vuelta
  for (let phi = 90; phi >= 0; phi -= 1.5) { if (phi <= 20 && window.__ang === 0) girar(90); paso(phi, 'vuelta'); }
  for (let i = 0; i < 120; i++) paso(0, 'final');
  // inclinación lenta sin rotar la pantalla hasta poner la botella de pie (cuello arriba y abajo)
  for (const s of [1, -1]) {
    for (let phi = 0; phi <= 90; phi += 0.75) paso(s * phi, `de pie ${s > 0 ? '+' : '-'}`);
    for (let i = 0; i < 120; i++) paso(s * 90, `de pie ${s > 0 ? '+' : '-'}`);
    for (let phi = 90; phi >= 0; phi -= 0.75) paso(s * phi, `de pie ${s > 0 ? '+' : '-'} vuelta`);
  }
  return { peorPen, enPeor, peorSalto, enSalto, nVert: locales.length, fases };
});

const MARGEN = 0.0, ESCALA_MIN = 0.99, SALTO_MAX = 0.45; // desplazamiento máximo de un vértice por cuadro a 60 Hz (unidades de la escena)
const escMin = Math.min(...Object.values(r.fases).map((f) => f.escMin));
const ok = r.peorPen <= MARGEN && r.peorSalto <= SALTO_MAX && escMin >= ESCALA_MIN && !errores.length;
console.log(`vértices comprobados: ${r.nVert}`);
console.log(`peor penetración en el cristal: ${r.peorPen.toFixed(3)} (${r.enPeor}) — límite ${MARGEN}`);
console.log(`peor salto por cuadro: ${r.peorSalto.toFixed(3)} (${r.enSalto}) — límite ${SALTO_MAX}`);
for (const [k, v] of Object.entries(r.fases)) console.log(`  ${k.padEnd(16)} penetración ${v.pen.toFixed(3).padStart(7)}  salto ${v.salto.toFixed(3)}  escala mín ${v.escMin.toFixed(2)}  apoyo máx ${v.apoyo.toFixed(2)} rad`);
console.log(`escala mínima (el barco no debe encogerse): ${escMin.toFixed(3)} — límite ${ESCALA_MIN}`);
console.log('errores de página:', errores.length ? errores : 'ninguno');
console.log(ok ? 'PRUEBA SUPERADA' : 'PRUEBA FALLIDA');
await b.close();
process.exit(ok ? 0 : 1);
