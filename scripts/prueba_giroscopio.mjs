// Simula un móvil en horizontal (pantalla a 90°) y eventos deviceorientation; comprueba que el agua responde.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('/opt/node-tools/node_modules/playwright');
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true, screenOrientation: { angle: 90, type: 'landscapePrimary' } });
const errores = [];
p.on('pageerror', (e) => errores.push(e.message));
await p.goto('file:///home/user/repo/docs/index.html?dpr=0.5&ui=0');
await p.waitForFunction('window.__listo === true', null, { timeout: 120000 });
const medir = (beta, gamma) => p.evaluate(async ([beta, gamma]) => {
  for (let i = 0; i < 40; i++) { window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta, gamma, absolute: false })); await new Promise((r) => setTimeout(r, 120)); }
  const s = __api.sensores, n = __api.agua.estado.n;
  return { angulo: screen.orientation.angle, fuente: s.fuente, permiso: s.permiso, g: s.g.toArray().map((v) => +v.toFixed(2)), nPlano: [n.x, n.y, n.z].map((v) => +v.toFixed(2)) };
}, [beta, gamma]);
console.log('nivelado (beta 0, gamma -90):', JSON.stringify(await medir(0, -90)));
console.log('inclinado 25° (gamma -65):', JSON.stringify(await medir(0, -65)));
console.log('inclinado al otro lado (gamma -115 ~ beta 180):', JSON.stringify(await medir(0, -90 + 0)));
console.log('errores:', errores.length ? errores : 'ninguno');
await b.close();
