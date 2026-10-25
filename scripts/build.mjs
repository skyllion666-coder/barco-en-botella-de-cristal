// Empaqueta src/main.js en un único docs/index.html (JS inline y minificado).
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const minify = !process.argv.includes('--sin-minificar');

const r = await build({
  entryPoints: [resolve(raiz, 'src/main.js')],
  bundle: true,
  format: 'esm',          // módulo: permite esperar a la carga del modelo del barco
  loader: { '.glb': 'binary' }, // el modelo va incrustado en la página
  minify,
  target: 'es2022',       // Safari 15+, Chrome 89+ (await en el nivel superior)
  write: false,
  legalComments: 'none',
  logLevel: 'info',
});

const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const plantilla = readFileSync(resolve(raiz, 'src/index.template.html'), 'utf8');
const html = plantilla.replace('/*__APP__*/', () => js);
mkdirSync(resolve(raiz, 'docs'), { recursive: true });
writeFileSync(resolve(raiz, 'docs/index.html'), html);
console.log(`docs/index.html: ${(html.length / 1024).toFixed(0)} KB`);

// Variante para publicar como Artifact: sin <html>/<head>/<body> (los añade la plataforma).
const idx = process.argv.indexOf('--artefacto');
if (idx > 0) {
  const salida = process.argv[idx + 1];
  const plantillaA = readFileSync(resolve(raiz, 'src/artefacto.template.html'), 'utf8');
  writeFileSync(salida, plantillaA.replace('/*__APP__*/', () => js));
  console.log(`artefacto: ${salida}`);
}
