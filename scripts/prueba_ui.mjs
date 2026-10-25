// Prueba interactiva: bucle real, clic en sonido y en el clima, comprobación de errores y fotogramas.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('/opt/node-tools/node_modules/playwright');
const salida = process.argv[2] || '/tmp/ui.png';
const b = await chromium.launch({ args: ['--allow-file-access-from-files', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 960, height: 440 } });
const errores = [];
p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errores.push(m.text().slice(0, 300)); });
p.on('pageerror', (e) => errores.push('PAGE: ' + e.message));
await p.goto('file:///home/user/repo/docs/index.html?dpr=1');
await p.waitForFunction('window.__listo === true', null, { timeout: 120000 });
await p.waitForTimeout(3000);
await p.evaluate(() => { document.querySelector('#sonido').click(); document.querySelector('#dock button[data-id="tormenta"]').click(); });
await p.waitForTimeout(6000);
const info = await p.evaluate(() => ({ cuadros: window.__cuadros, clima: __api.clima.nombre, lluvia: __api.clima.p.lluvia.toFixed(2), mar: __api.clima.p.mar.toFixed(2), sonido: document.querySelector('#sonido').textContent, escala: __api.calidad.escala }));
console.log(JSON.stringify(info));
await p.screenshot({ path: salida, timeout: 120000 });
console.log('errores:', errores.length ? errores : 'ninguno');
await b.close();
