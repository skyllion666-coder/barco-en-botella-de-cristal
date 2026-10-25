// Captura de pantalla reproducible: node scripts/shot.mjs [salida.png] [ancho] [alto] [query]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
const { chromium } = createRequire(import.meta.url)('/opt/node-tools/node_modules/playwright');

const salida = process.argv[2] || '/tmp/captura.png';
const ancho = parseInt(process.argv[3] || '1600', 10);
const alto = parseInt(process.argv[4] || '740', 10);
const query = process.argv[5] || 't=1';
mkdirSync(dirname(resolve(salida)), { recursive: true });

const b = await chromium.launch({ args: ['--allow-file-access-from-files', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const p = await b.newPage({ viewport: { width: ancho, height: alto }, deviceScaleFactor: 1 });
let errores = 0;
p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || m.type() === 'warning' || t.startsWith('[app]')) console.log(`[${m.type()}]`, t.slice(0, 1200)); });
p.on('pageerror', (e) => { errores++; console.log('ERROR PÁGINA:', e.message.slice(0, 1200)); });
const t0 = Date.now();
await p.goto('file:///home/user/repo/docs/index.html?' + query);
await p.waitForFunction('window.__listo === true', null, { timeout: 180000 });
await p.waitForTimeout(500);
await p.screenshot({ path: salida, timeout: 120000 });
console.log(`listo en ${((Date.now() - t0) / 1000).toFixed(1)} s, errores: ${errores} -> ${salida}`);
await b.close();
