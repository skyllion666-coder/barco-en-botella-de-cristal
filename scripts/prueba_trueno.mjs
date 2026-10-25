// Mide si el trueno se oye por el altavoz de un móvil: sintetiza sin conexión (OfflineAudioContext) el trueno
// y la lluvia de la tormenta, los pasa por un "altavoz pequeño" (paso alto a 300 Hz) y compara niveles.
// Uso: node scripts/prueba_trueno.mjs [--anterior]   (--anterior mide el trueno de la versión previa)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('/opt/node-tools/node_modules/playwright');
const anterior = process.argv.includes('--anterior');

const b = await chromium.launch({ args: ['--allow-file-access-from-files', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 400, height: 200 } });
const errores = [];
p.on('pageerror', (e) => errores.push(e.message));
await p.goto('file:///home/user/repo/docs/index.html?t=0.1&ui=0&dpr=0.25');
await p.waitForFunction('window.__listo === true', null, { timeout: 180000 });

const r = await p.evaluate(async (anterior) => {
  const SR = 44100, DUR = 7;
  const dB = (x) => 20 * Math.log10(Math.max(x, 1e-9));
  const ruido = (ctx, seg, tipo) => {
    const n = Math.floor(ctx.sampleRate * seg), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    let u = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; if (tipo === 'marron') { u = (u + 0.02 * w) / 1.02; d[i] = u * 3.5; } else d[i] = w; }
    return buf;
  };
  // trueno de la versión anterior, copiado tal cual como referencia
  const truenoAnterior = (ctx, destino, t0) => {
    const s = ctx.createBufferSource(); s.buffer = ruido(ctx, 4.5, 'marron');
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t0); lp.frequency.exponentialRampToValueAtTime(70, t0 + 3.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.95, t0 + 0.12);
    g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.9); g.gain.exponentialRampToValueAtTime(0.001, t0 + 4.2);
    s.connect(lp); lp.connect(g); g.connect(destino); s.start(t0); s.stop(t0 + 4.5);
  };
  const lluvia = (ctx, destino) => { // nodos de lluvia de audio.js con lluvia = 1
    for (const [tipo, f, q, gan] of [['highpass', 2600, 0.5, 0.22], ['lowpass', 9000, 0.5, 0.16]]) {
      const s = ctx.createBufferSource(); s.buffer = ruido(ctx, 4, 'blanco'); s.loop = true;
      const fl = ctx.createBiquadFilter(); fl.type = tipo; fl.frequency.value = f; fl.Q.value = q;
      const g = ctx.createGain(); g.gain.value = gan;
      s.connect(fl); fl.connect(g); g.connect(destino); s.start(0);
    }
  };
  async function medir(fabricar, movil) {
    const ctx = new OfflineAudioContext(2, SR * DUR, SR);
    let destino = ctx.destination;
    if (movil) { // altavoz de móvil: casi nada por debajo de ~300 Hz
      const hp1 = ctx.createBiquadFilter(); hp1.type = 'highpass'; hp1.frequency.value = 300; hp1.Q.value = 0.7;
      const hp2 = ctx.createBiquadFilter(); hp2.type = 'highpass'; hp2.frequency.value = 300; hp2.Q.value = 0.7;
      hp1.connect(hp2); hp2.connect(ctx.destination); destino = hp1;
    }
    fabricar(ctx, destino);
    const buf = await ctx.startRendering();
    const d = buf.getChannelData(0), e = buf.getChannelData(1);
    // RMS en ventanas de 0.4 s; nos quedamos con la ventana más fuerte
    const W = Math.floor(SR * 0.4);
    let mejor = 0;
    for (let i = 0; i + W < d.length; i += W / 2) {
      let s = 0; for (let j = i; j < i + W; j++) s += (d[j] * d[j] + e[j] * e[j]) / 2;
      mejor = Math.max(mejor, Math.sqrt(s / W));
    }
    return dB(mejor);
  }
  const { audio } = window.__api;
  const trueno = (cerca) => (ctx, destino) => (anterior ? truenoAnterior(ctx, destino, 0.2) : audio.sintetizarTrueno(ctx, destino, 0.2, cerca));
  const res = {};
  for (const movil of [false, true]) {
    const k = movil ? 'altavoz móvil' : 'rango completo';
    res[k] = {
      lluvia: await medir(lluvia, movil),
      'trueno cercano': await medir(trueno(1), movil),
      'trueno lejano': await medir(trueno(0), movil),
    };
  }
  return res;
}, anterior);

console.log(anterior ? 'TRUENO ANTERIOR' : 'TRUENO NUEVO', '(nivel RMS de la ventana de 0,4 s más fuerte, dBFS)');
let ok = true;
for (const [k, v] of Object.entries(r)) {
  console.log(`  ${k}:`);
  for (const [n, x] of Object.entries(v)) {
    const sobre = n === 'lluvia' ? '' : `  (${(x - v.lluvia >= 0 ? '+' : '')}${(x - v.lluvia).toFixed(1)} dB sobre la lluvia)`;
    console.log(`    ${n.padEnd(15)} ${x.toFixed(1).padStart(6)}${sobre}`);
  }
}
// Criterio: por el altavoz del móvil, el trueno cercano debe superar a la lluvia en al menos 6 dB y el lejano oírse (≥ 0 dB).
const m = r['altavoz móvil'];
ok = m['trueno cercano'] - m.lluvia >= 6 && m['trueno lejano'] - m.lluvia >= 0 && !errores.length;
console.log('errores de página:', errores.length ? errores : 'ninguno');
if (!anterior) console.log(ok ? 'PRUEBA SUPERADA' : 'PRUEBA FALLIDA');
await b.close();
process.exit(anterior || ok ? 0 : 1);
