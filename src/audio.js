// Sonido ambiente procedural (WebAudio, sin archivos): mar, oleaje, viento, lluvia, truenos (audibles en el móvil),
// crujidos del casco y borboteo al agitar. Solo arranca tras un gesto del usuario.
import { clamp } from './util.js';

function bufferRuido(ctx, segundos, tipo) {
  const n = Math.floor(ctx.sampleRate * segundos);
  const b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  let ultimo = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (tipo === 'marron') { ultimo = (ultimo + 0.02 * w) / 1.02; d[i] = ultimo * 3.5; } else d[i] = w;
  }
  // cierre suave para que el bucle no haga clic
  const f = Math.floor(ctx.sampleRate * 0.05);
  for (let i = 0; i < f; i++) { const k = i / f; d[n - 1 - i] = d[n - 1 - i] * k + d[i] * (1 - k); }
  return b;
}

function normalizar(buf, pico = 0.9) {
  const d = buf.getChannelData(0);
  let m = 0;
  for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  if (m > 0) for (let i = 0; i < d.length; i++) d[i] *= pico / m;
  return buf;
}

// Saturación suave: genera armónicos del retumbo grave para que se oiga en altavoces que no dan graves.
function curvaSaturacion(drive) {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * drive) / Math.tanh(drive); }
  return c;
}

const buffersTrueno = new WeakMap();

// Trueno procedural. 'cerca' (0..1) sale del retraso entre relámpago y trueno: cerca suena antes, más fuerte,
// con chasquido y más brillo; lejos, más grave, suave y largo. Capas: chasquido de ruido blanco en banda media-alta,
// retumbo de ruido marrón saturado (armónicos audibles en el móvil), varios "rodamientos" que llegan con retraso
// y un fondo subgrave para auriculares o altavoces buenos.
export function sintetizarTrueno(ctx, destino, t0, cerca = 0.5) {
  let bufs = buffersTrueno.get(ctx);
  if (!bufs) {
    bufs = { marron: normalizar(bufferRuido(ctx, 7, 'marron')), blanco: normalizar(bufferRuido(ctx, 1.5, 'blanco'), 0.7) };
    buffersTrueno.set(ctx, bufs);
  }
  const dur = 3.6 + 2.6 * (1 - cerca);
  const al = (a, b) => a + Math.random() * (b - a);
  const salida = ctx.createGain(); salida.gain.value = 1;
  if (ctx.createStereoPanner) {
    const pan = ctx.createStereoPanner(); pan.pan.value = al(-0.6, 0.6);
    salida.connect(pan); pan.connect(destino);
  } else salida.connect(destino);
  const fin = t0 + dur + 0.3;

  // 1) chasquido inicial (solo si cae cerca): ruido en 1,5-5 kHz con crepitar irregular
  if (cerca > 0.25) {
    const s = ctx.createBufferSource(); s.buffer = bufs.blanco;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = al(2200, 3200); bp.Q.value = 0.6;
    const g = ctx.createGain(); const a = 0.75 * cerca;
    g.gain.setValueAtTime(0, t0);
    let t = t0;
    for (let i = 0; i < 14; i++) { t += al(0.008, 0.03); g.gain.setValueAtTime(a * al(0.25, 1) * Math.exp(-(t - t0) * 7), t); }
    g.gain.setTargetAtTime(0, t, 0.06);
    s.connect(bp); bp.connect(g); g.connect(salida);
    s.start(t0, al(0, 0.4)); s.stop(t0 + 0.9);
  }

  // 2) retumbo audible: marrón -> paso bajo que se oscurece -> saturación -> banda 120-2000 Hz
  const s = ctx.createBufferSource(); s.buffer = bufs.marron; s.playbackRate.value = al(0.85, 1.15);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.5;
  lp.frequency.setValueAtTime(900 + 1600 * cerca, t0);
  lp.frequency.exponentialRampToValueAtTime(260 + 200 * cerca, t0 + dur);
  const pre = ctx.createGain(); pre.gain.value = 2.2;
  const sat = ctx.createWaveShaper(); sat.curve = curvaSaturacion(2.5); sat.oversample = '2x';
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 120;
  const pico = ctx.createBiquadFilter(); pico.type = 'peaking'; pico.frequency.value = 420; pico.Q.value = 0.8; pico.gain.value = 5;
  const g = ctx.createGain();
  // envolvente: ataque (más lento si lejos) y varios rodamientos que se superponen
  const ataque = 0.03 + 0.25 * (1 - cerca);
  const nivel = 0.55 + 0.45 * cerca;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(nivel, t0 + ataque);
  let t = t0 + ataque;
  const rodamientos = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < rodamientos; i++) {
    const caida = (i + 1) / (rodamientos + 1);
    t += al(0.35, 0.9) * (dur / 4.5);
    g.gain.setTargetAtTime(nivel * al(0.25, 0.45) * (1 - caida * 0.5), t - 0.25, 0.12);
    g.gain.setTargetAtTime(nivel * al(0.55, 0.9) * (1 - caida * 0.6), t, 0.08);
  }
  g.gain.setTargetAtTime(0, Math.min(t + 0.2, t0 + dur - 0.6), dur * 0.16);
  s.connect(lp); lp.connect(pre); pre.connect(sat); sat.connect(hp); hp.connect(pico); pico.connect(g); g.connect(salida);
  const off = al(0, 2);
  s.start(t0, off); s.stop(fin);

  // 3) fondo subgrave (lo que da cuerpo con auriculares; el móvil apenas lo reproduce)
  const sb = ctx.createBufferSource(); sb.buffer = bufs.marron;
  const lps = ctx.createBiquadFilter(); lps.type = 'lowpass'; lps.frequency.value = 110;
  const gs = ctx.createGain();
  gs.gain.setValueAtTime(0, t0); gs.gain.linearRampToValueAtTime(0.7 * nivel, t0 + ataque + 0.1);
  gs.gain.setTargetAtTime(0, t0 + dur * 0.45, dur * 0.2);
  sb.connect(lps); lps.connect(gs); gs.connect(salida);
  sb.start(t0, (off + 3) % 6); sb.stop(fin);
  return dur;
}

// Campana de bronce de a bordo: parciales inarmónicos de campana (hum, fundamental, tercera menor, quinta,
// nominal y superiores), cada uno con su caída, más el golpe del badajo. Devuelve cuánto dura.
export function sonarCampana(ctx, destino, t0, fuerza = 1) {
  const f0 = 523.25; // do5: una campana de barco pequeña
  const parciales = [[0.5, 0.35, 4.5], [1, 0.5, 3.2], [1.19, 0.28, 2.6], [1.5, 0.22, 2.2], [2.0, 0.42, 1.9], [2.51, 0.18, 1.3], [2.98, 0.12, 1.0], [4.07, 0.08, 0.6]];
  const salida = ctx.createGain(); salida.gain.value = 0.32 * fuerza; salida.connect(destino);
  for (const [r, a, cae] of parciales) {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.value = f0 * r * (1 + (Math.random() - 0.5) * 0.002);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(a, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + cae);
    o.connect(g); g.connect(salida); o.start(t0); o.stop(t0 + cae + 0.05);
  }
  // golpe metálico del badajo
  const n = ctx.createBufferSource(); n.buffer = bufferRuido(ctx, 0.08, 'blanco');
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3800; bp.Q.value = 1.2;
  const gn = ctx.createGain(); gn.gain.setValueAtTime(0.25, t0); gn.gain.exponentialRampToValueAtTime(0.001, t0 + 0.06);
  n.connect(bp); bp.connect(gn); gn.connect(salida); n.start(t0);
  return 4.5;
}

// Graznido de gaviota lejana: dos o tres «quiá» (subida rápida de tono y caída larga), voz áspera de diente de
// sierra pasada por dos formantes. Devuelve cuánto dura.
export function sonarGaviota(ctx, destino, t0, fuerza = 1) {
  const salida = ctx.createGain(); salida.gain.value = 0.07 * fuerza; salida.connect(destino);
  const veces = 2 + Math.floor(Math.random() * 2), f0 = 1150 + Math.random() * 250;
  let t = t0;
  for (let i = 0; i < veces; i++) {
    const d = i === veces - 1 ? 0.42 : 0.26;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0 * 0.75, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 1.35, t + 0.05);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.62, t + d);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.03);
    g.gain.setValueAtTime(0.8, t + d * 0.6); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    for (const [fr, q, a] of [[1900, 3, 1], [3300, 4, 0.5]]) {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fr; bp.Q.value = q;
      const ga = ctx.createGain(); ga.gain.value = a;
      o.connect(bp); bp.connect(ga); ga.connect(g);
    }
    g.connect(salida); o.start(t); o.stop(t + d + 0.05);
    t += d + 0.07 + Math.random() * 0.05;
  }
  return t - t0;
}

export function crearAudio() {
  let ctx = null, maestro = null, nodos = null;
  const est = { activo: false, siguienteCrujido: 3, t: 0 };

  function fuente(buffer, tipoFiltro, frec, q = 0.7) {
    const s = ctx.createBufferSource();
    s.buffer = buffer; s.loop = true;
    s.playbackRate.value = 0.9 + Math.random() * 0.2;
    const f = ctx.createBiquadFilter(); f.type = tipoFiltro; f.frequency.value = frec; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    s.connect(f); f.connect(g);
    s.start(0, Math.random() * 3);
    return { s, f, g };
  }

  function iniciar() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    maestro = ctx.createGain(); maestro.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 4;
    const global = ctx.createBiquadFilter(); global.type = 'lowpass'; global.frequency.value = 16000;
    maestro.connect(global); global.connect(comp); comp.connect(ctx.destination);

    const marron = bufferRuido(ctx, 5, 'marron'), blanco = bufferRuido(ctx, 4, 'blanco');
    const ambiente = ctx.createGain(); ambiente.gain.value = 1;
    ambiente.connect(maestro);
    nodos = {
      global, ambiente,
      mar: fuente(marron, 'lowpass', 520),
      espuma: fuente(blanco, 'bandpass', 2400, 0.6),
      viento: fuente(marron, 'bandpass', 420, 1.1),
      lluvia: fuente(blanco, 'highpass', 2600, 0.5),
      lluviaSuave: fuente(blanco, 'lowpass', 9000, 0.5),
      borboteo: fuente(blanco, 'bandpass', 520, 3.5),
    };
    for (const k of ['mar', 'espuma', 'viento', 'lluvia', 'lluviaSuave', 'borboteo']) nodos[k].g.connect(ambiente);
    return true;
  }

  function crujido(intensidad) {
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator(); osc.type = 'sawtooth';
    const f0 = 70 + Math.random() * 90;
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.exponentialRampToValueAtTime(f0 * (0.6 + Math.random() * 0.9), t0 + 0.5);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 260 + Math.random() * 320; bp.Q.value = 5;
    const trem = ctx.createGain(); trem.gain.value = 0.5;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 17 + Math.random() * 25;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.5;
    lfo.connect(lfoG); lfoG.connect(trem.gain);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.05 * intensidad, t0 + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.55);
    osc.connect(bp); bp.connect(trem); trem.connect(g); g.connect(maestro);
    osc.start(t0); lfo.start(t0); osc.stop(t0 + 0.7); lfo.stop(t0 + 0.7);
  }

  // retraso: segundos entre el relámpago y el trueno (0,15 s = encima; 2,15 s = lejos)
  function trueno(retraso = 0.3) {
    if (!ctx || !est.activo) return;
    const t0 = ctx.currentTime + retraso;
    const cerca = clamp(1 - (retraso - 0.15) / 2, 0, 1);
    const dur = sintetizarTrueno(ctx, maestro, t0, cerca);
    // el resto del ambiente (sobre todo la lluvia) se aparta mientras retumba, para que el trueno se oiga
    const a = nodos.ambiente.gain;
    a.setTargetAtTime(0.45 + 0.2 * (1 - cerca), t0, 0.05);
    a.setTargetAtTime(1, t0 + dur * 0.55, 0.6);
  }

  const alternar = () => {
    if (!ctx && !iniciar()) return false;
    est.activo = !est.activo;
    if (ctx.state === 'suspended') ctx.resume();
    maestro.gain.cancelScheduledValues(ctx.currentTime);
    maestro.gain.linearRampToValueAtTime(est.activo ? 0.9 : 0, ctx.currentTime + 0.6);
    return est.activo;
  };

  // vientoAhora: el viento con rachas (viento.js); si no llega, el del clima
  function actualizar(p, sacudida, dt, vientoAhora = p.viento) {
    if (!ctx || !est.activo) return;
    est.t += dt;
    const t = ctx.currentTime;
    const sua = (nodo, v, tc = 0.25) => nodo.g.gain.setTargetAtTime(v, t, tc);
    const oleaje = 0.5 + 0.5 * Math.sin(est.t * 0.55) * (0.5 + 0.5 * Math.sin(est.t * 0.13));
    const mar = clamp(p.mar, 0, 1);
    sua(nodos.mar, (0.10 + 0.55 * mar) * (0.75 + 0.5 * oleaje) * 0.8);
    nodos.mar.f.frequency.setTargetAtTime(280 + 700 * mar + 300 * oleaje, t, 0.3);
    sua(nodos.espuma, (0.015 + 0.16 * mar * mar) * (0.4 + 0.9 * oleaje));
    const rafaga = 0.6 + 0.4 * Math.sin(est.t * 0.37 + 1.3) * Math.sin(est.t * 0.91);
    // el silbido sigue a las rachas: sube de volumen y de tono cuando sopla fuerte
    const vv = clamp(vientoAhora, 0, 1.5);
    sua(nodos.viento, (0.04 + 0.36 * vv) * (0.75 + 0.25 * rafaga) * (0.6 + 0.4 * mar), 0.25);
    nodos.viento.f.frequency.setTargetAtTime(240 + 480 * vv * (0.8 + 0.2 * rafaga), t, 0.3);
    sua(nodos.lluvia, 0.22 * p.lluvia * p.lluvia);
    sua(nodos.lluviaSuave, 0.16 * p.lluvia);
    sua(nodos.borboteo, clamp(sacudida, 0, 1.2) * 0.32 * (0.6 + 0.4 * Math.sin(est.t * 23)), 0.08);
    nodos.borboteo.f.frequency.setTargetAtTime(380 + 500 * Math.abs(Math.sin(est.t * 5.3)), t, 0.05);
    // niebla y nieve amortiguan el sonido
    const amort = clamp(p.niebla * 6 + p.nieve * 0.6, 0, 0.85);
    nodos.global.frequency.setTargetAtTime(16000 * (1 - amort) + 1800 * amort, t, 0.6);
    // crujidos del casco
    est.siguienteCrujido -= dt;
    if (est.siguienteCrujido <= 0) {
      est.siguienteCrujido = 3.5 + Math.random() * 6 / (0.4 + mar);
      crujido(0.4 + 0.9 * mar + sacudida);
    }
  }

  // Campanas de a bordo: 'golpes' toques, por parejas (ding-ding … ding-ding), como en las guardias de un barco.
  function campanas(golpes) {
    if (!ctx || !est.activo || golpes < 1) return;
    let t = ctx.currentTime + 0.1;
    for (let i = 0; i < golpes; i++) {
      sonarCampana(ctx, maestro, t, 0.9 + Math.random() * 0.15);
      t += i % 2 === 0 ? 0.38 : 1.05;
    }
  }

  // gaviotas: más bajas cuanto más fuerte sopla (el viento se las lleva)
  function gaviota() {
    if (!ctx || !est.activo) return;
    sonarGaviota(ctx, maestro, ctx.currentTime + 0.05, 0.7 + Math.random() * 0.5);
  }


  // ---- batalla: cañonazo, cristal que raja, rotura, tintineo de trozos, chorro y rebobinado
  function ruidoCorto(seg) {
    est.buffers = est.buffers || {};
    const k = 'r' + seg;
    if (!est.buffers[k]) est.buffers[k] = bufferRuido(ctx, seg, 'blanco');
    return est.buffers[k];
  }
  function canonazo(retraso = 0) {
    if (!ctx || !est.activo) return;
    const t0 = ctx.currentTime + retraso;
    // estampido: golpe de ruido muy corto + cuerpo grave que cae de tono + cola que retumba (dentro del cristal)
    const n = ctx.createBufferSource(); n.buffer = ruidoCorto(1.6);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(5200, t0); lp.frequency.exponentialRampToValueAtTime(260, t0 + 0.35);
    const sat = ctx.createWaveShaper(); sat.curve = curvaSaturacion(3);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(1.1, t0 + 0.004); g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.12); g.gain.exponentialRampToValueAtTime(0.0008, t0 + 1.5);
    n.connect(lp); lp.connect(sat); sat.connect(g); g.connect(maestro); n.start(t0); n.stop(t0 + 1.6);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(150, t0); o.frequency.exponentialRampToValueAtTime(42, t0 + 0.4);
    const go = ctx.createGain(); go.gain.setValueAtTime(0.0001, t0); go.gain.exponentialRampToValueAtTime(0.9, t0 + 0.01); go.gain.exponentialRampToValueAtTime(0.001, t0 + 0.6);
    o.connect(go); go.connect(maestro); o.start(t0); o.stop(t0 + 0.65);
    // eco metálico de la botella (resonancia del vidrio con el golpe)
    for (const fr of [1230, 1870, 2650]) {
      const r = ctx.createOscillator(); r.frequency.value = fr * (0.97 + Math.random() * 0.06);
      const gr = ctx.createGain(); gr.gain.setValueAtTime(0.0001, t0); gr.gain.exponentialRampToValueAtTime(0.012, t0 + 0.02); gr.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
      r.connect(gr); gr.connect(maestro); r.start(t0); r.stop(t0 + 0.95);
    }
  }
  function tintineo(fuerza = 0.5, retraso = 0) {
    if (!ctx || !est.activo) return;
    const t0 = ctx.currentTime + retraso;
    const base = 2600 + Math.random() * 3800;
    for (const m of [1, 2.32, 4.25]) {
      const o = ctx.createOscillator(); o.frequency.value = base * m;
      const g = ctx.createGain(); const d = 0.08 + Math.random() * 0.25;
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.05 * fuerza / m, t0 + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      o.connect(g); g.connect(maestro); o.start(t0); o.stop(t0 + d + 0.02);
    }
  }
  function cristal(fuerza = 1) {
    if (!ctx || !est.activo) return;
    const t0 = ctx.currentTime;
    // chasquido seco (la raja corre por el vidrio) y crujidos pequeños detrás
    const n = ctx.createBufferSource(); n.buffer = ruidoCorto(0.3);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.7 * fuerza, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.09);
    n.connect(hp); hp.connect(g); g.connect(maestro); n.start(t0); n.stop(t0 + 0.3);
    for (let i = 0; i < 6 * fuerza; i++) tintineo(0.25 * fuerza, 0.02 + Math.random() * 0.25);
  }
  function rotura() {
    if (!ctx || !est.activo) return;
    cristal(1.6);
    for (let i = 0; i < 40; i++) tintineo(0.25 + Math.random() * 0.6, Math.random() * 1.2 * Math.random());
  }
  function chapuzon() {
    if (!ctx || !est.activo) return;
    const t0 = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = ruidoCorto(0.5);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(900, t0); bp.frequency.exponentialRampToValueAtTime(300, t0 + 0.3); bp.Q.value = 1.2;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.35, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.4);
    n.connect(bp); bp.connect(g); g.connect(maestro); n.start(t0); n.stop(t0 + 0.5);
  }
  // chorro continuo: ruido filtrado cuyo volumen sigue al caudal
  function chorro(nivel) {
    if (!ctx || !est.activo) return;
    if (!est.chorro) {
      const n = ctx.createBufferSource(); n.buffer = ruidoCorto(2.0); n.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.5;
      const g = ctx.createGain(); g.gain.value = 0;
      n.connect(bp); bp.connect(g); g.connect(maestro); n.start();
      est.chorro = { g, bp };
    }
    const t = ctx.currentTime;
    est.chorro.g.gain.setTargetAtTime(0.28 * nivel, t, 0.1);
    est.chorro.bp.frequency.setTargetAtTime(700 + 1500 * nivel + 200 * Math.sin(t * 9), t, 0.05);
  }
  // rebobinado: un barrido que sube y destellos de cristal al revés
  function magia(dur = 4) {
    if (!ctx || !est.activo) return;
    const t0 = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = ruidoCorto(2.0); n.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 4;
    bp.frequency.setValueAtTime(300, t0); bp.frequency.exponentialRampToValueAtTime(5000, t0 + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.25, t0 + dur * 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.15);
    n.connect(bp); bp.connect(g); g.connect(maestro); n.start(t0); n.stop(t0 + dur + 0.2);
    for (let i = 0; i < 30; i++) tintineo(0.2 + 0.5 * (i / 30), dur * Math.sqrt(i / 30));
  }

  return { get activo() { return est.activo; }, alternar, actualizar, trueno, sintetizarTrueno, campanas, sonarCampana, gaviota, canonazo, cristal, rotura, tintineo, chapuzon, chorro, magia };
}
