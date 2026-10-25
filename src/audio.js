// Sonido ambiente procedural (WebAudio, sin archivos): mar, oleaje, viento, lluvia, truenos,
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
    nodos = {
      global,
      mar: fuente(marron, 'lowpass', 520),
      espuma: fuente(blanco, 'bandpass', 2400, 0.6),
      viento: fuente(marron, 'bandpass', 420, 1.1),
      lluvia: fuente(blanco, 'highpass', 2600, 0.5),
      lluviaSuave: fuente(blanco, 'lowpass', 9000, 0.5),
      borboteo: fuente(blanco, 'bandpass', 520, 3.5),
    };
    for (const k of ['mar', 'espuma', 'viento', 'lluvia', 'lluviaSuave', 'borboteo']) nodos[k].g.connect(maestro);
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

  function trueno(retraso = 0.3) {
    if (!ctx || !est.activo) return;
    const t0 = ctx.currentTime + retraso;
    const s = ctx.createBufferSource(); s.buffer = bufferRuido(ctx, 4.5, 'marron');
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t0); lp.frequency.exponentialRampToValueAtTime(70, t0 + 3.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.95, t0 + 0.12);
    g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.9);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 4.2);
    s.connect(lp); lp.connect(g); g.connect(maestro);
    s.start(t0); s.stop(t0 + 4.5);
  }

  const alternar = () => {
    if (!ctx && !iniciar()) return false;
    est.activo = !est.activo;
    if (ctx.state === 'suspended') ctx.resume();
    maestro.gain.cancelScheduledValues(ctx.currentTime);
    maestro.gain.linearRampToValueAtTime(est.activo ? 0.9 : 0, ctx.currentTime + 0.6);
    return est.activo;
  };

  function actualizar(p, sacudida, dt) {
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
    sua(nodos.viento, (0.04 + 0.42 * clamp(p.viento, 0, 1.2)) * rafaga * (0.6 + 0.4 * mar), 0.4);
    nodos.viento.f.frequency.setTargetAtTime(260 + 520 * p.viento * rafaga, t, 0.4);
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

  return { get activo() { return est.activo; }, alternar, actualizar, trueno };
}
