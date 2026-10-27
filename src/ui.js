// Interfaz en español: selector de clima, mar/viento, sensores, sonido, vibración, hora real, pantalla completa
// y rendimiento (FPS). Se oculta sola.
import { AJUSTES } from './clima.js';

const CSS = `
#ui { position: fixed; inset: 0; pointer-events: none; font: 500 14px/1.2 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: #f4ece2; -webkit-user-select: none; user-select: none; }
#ui * { box-sizing: border-box; }
.ui-vidrio { background: rgba(24, 17, 13, .58); border: 1px solid rgba(255, 238, 215, .14); backdrop-filter: blur(14px) saturate(1.2); -webkit-backdrop-filter: blur(14px) saturate(1.2); box-shadow: 0 6px 24px rgba(0,0,0,.35); }
#dock { position: absolute; left: 50%; bottom: calc(10px + env(safe-area-inset-bottom)); transform: translateX(-50%); display: flex; gap: 4px; padding: 5px; border-radius: 18px; pointer-events: auto; transition: opacity .5s, transform .5s; max-width: calc(100vw - 24px); overflow-x: auto; scrollbar-width: none; }
#dock::-webkit-scrollbar { display: none; }
#dock button { appearance: none; border: 0; background: transparent; color: inherit; font: inherit; display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 7px 11px 6px; border-radius: 13px; cursor: pointer; min-width: 62px; transition: background .2s, transform .15s; }
#dock button .ic { font-size: 21px; line-height: 1; }
#dock button .tx { font-size: 11px; letter-spacing: .02em; opacity: .85; }
#dock button:active { transform: scale(.94); }
#dock button.on { background: rgba(255, 226, 180, .20); box-shadow: inset 0 0 0 1px rgba(255, 226, 180, .35); }
#ajustes { position: absolute; top: calc(10px + env(safe-area-inset-top)); right: calc(10px + env(safe-area-inset-right)); display: flex; flex-direction: column; align-items: flex-end; gap: 8px; pointer-events: none; transition: opacity .5s; }
#barra { display: flex; gap: 8px; }
#engranaje, #sonido { pointer-events: auto; width: 42px; height: 42px; border-radius: 50%; display: grid; place-items: center; font-size: 19px; cursor: pointer; border: 0; color: inherit; }
#panel { pointer-events: auto; width: 250px; max-height: calc(100vh - 78px - env(safe-area-inset-top)); overflow-y: auto; padding: 14px 14px 10px; border-radius: 16px; display: none; flex-direction: column; gap: 11px; }
#panel.abierto { display: flex; }
#panel label { display: flex; justify-content: space-between; font-size: 12px; opacity: .9; margin-bottom: 4px; }
#panel input[type=range] { width: 100%; accent-color: #e9b872; }
#panel .fila { display: flex; gap: 6px; }
#panel .btn { flex: 1; appearance: none; border: 1px solid rgba(255,238,215,.18); background: rgba(255,238,215,.07); color: inherit; font: inherit; font-size: 12.5px; padding: 8px 6px; border-radius: 10px; cursor: pointer; }
#panel .btn:active { background: rgba(255,238,215,.18); }
#panel .btn.on { background: rgba(255,226,180,.22); border-color: rgba(255,226,180,.4); }
#panel .nota { font-size: 11px; opacity: .6; line-height: 1.35; }
#panel .firma { font-size: 11.5px; letter-spacing: .12em; text-align: center; opacity: .85; padding-bottom: 2px; border-bottom: 1px solid rgba(255,238,215,.14); }
#aviso { position: absolute; left: 50%; top: calc(14px + env(safe-area-inset-top)); transform: translateX(-50%); padding: 9px 16px; border-radius: 22px; font-size: 13px; pointer-events: none; transition: opacity 1s; white-space: nowrap; }
#girar { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); padding: 14px 20px; border-radius: 16px; font-size: 15px; text-align: center; display: none; pointer-events: none; }
#activar { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); pointer-events: auto; padding: 16px 26px; border-radius: 16px; font-size: 16px; border: 0; color: inherit; cursor: pointer; display: none; text-align: center; }
#activar small { display: block; font-size: 12px; opacity: .7; margin-top: 4px; }
.oculto { opacity: 0 !important; }
#pergamino { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%) scale(.92); width: min(82vw, 440px); padding: 26px 30px 22px; border-radius: 6px;
  background: radial-gradient(ellipse at 50% 40%, #f3e6c4 0%, #e6d2a2 70%, #cdb27a 100%); color: #3b2a16; box-shadow: 0 12px 40px rgba(0,0,0,.55), inset 0 0 40px rgba(120,80,30,.35);
  font: italic 500 clamp(17px, 2.6vw, 22px)/1.45 'Segoe Script', 'Bradley Hand', 'Snell Roundhand', 'URW Chancery L', cursive; text-align: center;
  opacity: 0; pointer-events: none; transition: opacity .6s, transform .6s; }
#pergamino.abierto { opacity: 1; transform: translate(-50%, -50%) scale(1); pointer-events: auto; }
#pergamino small { display: block; margin-top: 14px; font: 500 11px system-ui, sans-serif; letter-spacing: .08em; text-transform: uppercase; opacity: .55; font-style: normal; }
.oculto, .oculto * { pointer-events: none !important; }
`;

function el(tag, attrs = {}, hijos = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v; else if (k === 'texto') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v);
  }
  for (const h of [].concat(hijos)) e.append(h);
  return e;
}

export function crearUI({ clima, sensores, audio, alDisparar, alAjustarCalidad, estadoCalidad, opciones = {}, rendimiento, version, creditoBarco = '' }) {
  const estilo = el('style'); estilo.textContent = CSS; document.head.append(estilo);
  const raiz = el('div', { id: 'ui' });
  document.body.append(raiz);

  let manual = false;
  // --- selector de clima
  const dock = el('div', { id: 'dock', class: 'ui-vidrio' });
  const botones = {};
  for (const [id, a] of Object.entries(AJUSTES)) {
    const b = el('button', { type: 'button', 'data-id': id, onclick: () => { manual = false; clima.fijar(id); sincronizar(); recordar(); guardar(); } }, [
      el('span', { class: 'ic', texto: a.icono }), el('span', { class: 'tx', texto: a.nombre }),
    ]);
    botones[id] = b; dock.append(b);
  }
  // ¡Fuego!: andanada de tres cañones contra el cristal
  dock.append(el('button', { type: 'button', class: 'fuego', 'aria-label': 'Fuego', onclick: () => { alDisparar?.(); } }, [
    el('span', { class: 'ic', texto: '💥' }), el('span', { class: 'tx', texto: 'Fuego' }),
  ]));

  // --- panel de ajustes
  const sMar = el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: 0.5 });
  const sViento = el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: 0.75 });
  sMar.addEventListener('input', () => { manual = true; clima.ponerMar(parseFloat(sMar.value)); recordar(); guardar(); });
  sViento.addEventListener('input', () => { manual = true; clima.ponerViento(parseFloat(sViento.value)); recordar(); guardar(); });
  const bSensores = el('button', { class: 'btn', type: 'button', texto: 'Activar sensores', onclick: async () => { await sensores.activar(); sincronizar(); } });
  const bNivelar = el('button', { class: 'btn', type: 'button', texto: 'Nivelar', onclick: () => sensores.recalibrar() });
  const bSonido = el('button', { class: 'btn', type: 'button', texto: 'Sonido: no', onclick: () => { if (!audio) return; audio.alternar(); sincronizar(); guardar(); } });
  const bPantalla = el('button', { class: 'btn', type: 'button', texto: 'Pantalla completa', onclick: async () => {
    try {
      if (!document.fullscreenElement) { await document.documentElement.requestFullscreen?.(); try { await screen.orientation?.lock?.('landscape'); } catch (_) { /* no disponible */ } }
      else await document.exitFullscreen?.();
    } catch (_) { /* sin soporte */ }
  } });
  const bCalidad = el('button', { class: 'btn', type: 'button', texto: 'Calidad: auto', onclick: () => { alAjustarCalidad?.(); sincronizar(); guardar(); } });
  const bVibrar = el('button', { class: 'btn', type: 'button', texto: 'Vibración: sí', onclick: () => { opciones.vibrar = !opciones.vibrar; if (opciones.vibrar) try { navigator.vibrate?.(40); } catch (_) { /* nada */ } sincronizar(); guardar(); } });
  const bHora = el('button', { class: 'btn', type: 'button', texto: 'Hora real: no', onclick: () => { clima.horaReal = !clima.horaReal; sincronizar(); guardar(); } });
  const estadoRend = el('div', { class: 'nota', texto: '' });
  const nota = el('div', { class: 'nota', texto: 'Inclina o sacude el móvil para mover el mar. Pellizca con dos dedos para ampliar o reducir, como una foto (ampliada, un dedo la mueve; doble toque amplía o vuelve). En el ordenador, arrastra con el ratón o usa las flechas, y la rueda amplía. El sonido se activa con el altavoz.' });
  const notaSensor = el('div', { class: 'nota', texto: '' });
  notaSensor.style.display = 'none';
  const estadoSensor = el('div', { class: 'nota', texto: 'Giroscopio: sin datos' });
  const credito = el('div', { class: 'nota', texto: '' });
  const ponerCredito = (t) => { credito.textContent = t ? 'Barco: ' + t : ''; credito.style.display = t ? '' : 'none'; };
  ponerCredito(creditoBarco);
  const notaVersion = el('div', { class: 'nota', texto: version ? `Versión ${version}` : '' });
  const panel = el('div', { id: 'panel', class: 'ui-vidrio' }, [
    el('div', { class: 'firma', texto: 'Creado por SKYLLION (FRANK)' }),
    estadoRend,
    el('div', {}, [el('label', {}, [el('span', { texto: 'Mar' }), el('span', { texto: 'calma ↔ tempestad' })]), sMar]),
    el('div', {}, [el('label', {}, [el('span', { texto: 'Viento' }), el('span', { texto: 'en las velas' })]), sViento]),
    el('div', { class: 'fila' }, [bNivelar, bSensores]),
    el('div', { class: 'fila' }, [bSonido, bPantalla]),
    el('div', { class: 'fila' }, [bCalidad, bHora]),
    el('div', { class: 'fila' }, [bVibrar]),
    estadoSensor, nota, notaSensor, credito, notaVersion,
  ]);
  const engranaje = el('button', { id: 'engranaje', class: 'ui-vidrio', type: 'button', 'aria-label': 'Ajustes', texto: '⚙️', onclick: () => { panel.classList.toggle('abierto'); recordar(); } });
  const sonido = el('button', { id: 'sonido', class: 'ui-vidrio', type: 'button', 'aria-label': 'Sonido', texto: '🔇', onclick: () => { if (!audio) return; audio.alternar(); sincronizar(); recordar(); } });
  const ajustes = el('div', { id: 'ajustes' }, [el('div', { id: 'barra' }, [sonido, engranaje]), panel]);

  const aviso = el('div', { id: 'aviso', class: 'ui-vidrio', texto: 'Inclina el móvil para mover el mar' });
  const activar = el('button', { id: 'activar', class: 'ui-vidrio', type: 'button', onclick: async () => { await sensores.activar(); sincronizar(); } }, [
    'Toca para activar el movimiento', el('small', { texto: 'Se usará el giroscopio de tu móvil' }),
  ]);
  const girar = el('div', { id: 'girar', class: 'ui-vidrio', texto: '↻  Gira el móvil en horizontal' });
  // pergamino con el mensaje de la botellita (se cierra al tocarlo)
  const textoPergamino = el('div', { texto: '' });
  const pergamino = el('div', { id: 'pergamino', onclick: () => pergamino.classList.remove('abierto') }, [textoPergamino, el('small', { texto: 'Mensaje encontrado en una botella · toca para cerrar' })]);
  raiz.append(dock, ajustes, aviso, activar, girar, pergamino);
  const revisarGiro = () => { girar.style.display = innerHeight > innerWidth * 1.05 ? 'block' : 'none'; };
  addEventListener('resize', revisarGiro); revisarGiro();

  // --- autoocultado
  let temporizador = null;
  function recordar() {
    dock.classList.remove('oculto'); ajustes.classList.remove('oculto');
    clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      if (panel.classList.contains('abierto')) return recordar();
      dock.classList.add('oculto'); ajustes.classList.add('oculto');
    }, 5500);
  }
  addEventListener('pointerdown', recordar, true);
  addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') recordar(); }, true);
  addEventListener('keydown', recordar, true);
  recordar();
  setTimeout(() => { aviso.classList.add('oculto'); }, 7000);

  function sincronizar() {
    for (const [id, b] of Object.entries(botones)) b.classList.toggle('on', clima.nombre === id);
    sMar.value = clima.o.mar; sViento.value = clima.o.viento;
    activar.style.display = sensores.permiso === 'necesario' ? 'block' : 'none';
    const diag = sensores.diagnostico();
    notaSensor.textContent = diag ? diag + ' Mientras tanto, arrastra con el dedo para inclinar la botella.' : '';
    notaSensor.style.display = diag ? 'block' : 'none';
    estadoSensor.textContent = sensores.fuente === 'sensor' ? 'Giroscopio: activo' : 'Giroscopio: sin datos';
    estadoSensor.style.color = sensores.fuente === 'sensor' ? '#a8e6a1' : '#f0b9a0';
    bSensores.style.display = sensores.permiso === 'concedido' ? 'none' : '';
    bSensores.textContent = sensores.permiso === 'denegado' ? 'Permiso denegado' : 'Activar sensores';
    if (audio) { bSonido.textContent = 'Sonido: ' + (audio.activo ? 'sí' : 'no'); bSonido.classList.toggle('on', audio.activo); sonido.textContent = audio.activo ? '🔊' : '🔇'; }
    if (estadoCalidad) bCalidad.textContent = 'Calidad: ' + estadoCalidad();
    bVibrar.textContent = 'Vibración: ' + (opciones.vibrar ? 'sí' : 'no'); bVibrar.classList.toggle('on', !!opciones.vibrar);
    bVibrar.style.display = navigator.vibrate ? '' : 'none';
    bHora.textContent = 'Hora real: ' + (clima.horaReal ? 'sí' : 'no'); bHora.classList.toggle('on', clima.horaReal);
    if (rendimiento) {
      const r = rendimiento();
      estadoRend.textContent = `Rendimiento: ${r.fps || '—'} FPS · resolución ${r.resolucion} %`;
      estadoRend.style.color = !r.fps ? '' : r.fps >= 50 ? '#a8e6a1' : r.fps >= 30 ? '#f0d9a0' : '#f0b9a0';
    }
  }

  // --- persistencia sencilla
  function guardar() {
    try {
      localStorage.setItem('barco-botella-v2', JSON.stringify({ clima: clima.nombre, manual, mar: clima.o.mar, viento: clima.o.viento, vibrar: opciones.vibrar, horaReal: clima.horaReal }));
    } catch (_) { /* sin almacenamiento */ }
  }
  function restaurar() {
    try {
      const d = JSON.parse(localStorage.getItem('barco-botella-v2') || 'null');
      if (!d) return;
      if (AJUSTES[d.clima]) clima.fijar(d.clima);
      if (d.manual && typeof d.mar === 'number') { manual = true; clima.ponerMar(d.mar); }
      if (d.manual && typeof d.viento === 'number') clima.ponerViento(d.viento);
      if (typeof d.vibrar === 'boolean') opciones.vibrar = d.vibrar;
      if (typeof d.horaReal === 'boolean') clima.horaReal = d.horaReal;
    } catch (_) { /* ignorar */ }
  }
  restaurar();
  sincronizar();
  setInterval(sincronizar, 1000);
  function mostrarMensaje(texto) { textoPergamino.textContent = texto; pergamino.classList.add('abierto'); }

  return { sincronizar, recordar, ponerCredito, mostrarMensaje };
}
