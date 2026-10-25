# Barco en la botella

## Idea (del usuario, 25-10-2026)
Una app que primero será una **web** y después una **aplicación de móvil**.
El móvil se usa **en horizontal**, y la pantalla se ve como una **botella de cristal tumbada con un barco de vela dentro y agua**.
La imagen de referencia está en `referencia/botella-barco.png` (botella de cristal sobre soporte de madera, tapón de corcho, barco de tres mástiles en un mar con olas).

## Comportamiento
- El agua y el barco **se mueven según cómo muevas u orientes el móvil** (giroscopio / acelerómetro).
- Opciones de **clima** dentro de la botella: lluvia, nieve y otras cosas parecidas (niebla, tormenta con rayos, sol...).
- Ideas para más adelante: sonido ambiente (olas, lluvia), día y noche, distintos barcos, distintas botellas.

## Plan por fases
1. **Web prototipo** (HTML + JavaScript, three.js o canvas/WebGL). Pantalla horizontal, botella de cristal con refracción y reflejos, agua con olas que reaccionan a la inclinación, barco que cabecea.
2. Sensores: `DeviceOrientationEvent` / `DeviceMotionEvent`. En iPhone pide permiso; en Android funciona directo. Ratón o teclado como respaldo en el PC.
3. Clima: partículas de lluvia y nieve dentro de la botella, con cambio desde un menú pequeño.
4. Pulir el aspecto de cristal, luz y sonido.
5. **App Android**: empaquetar la web (Capacitor o similar) para publicar. Más adelante.

## Estado de la fase 1 (prototipo web)
Hecho y verificado con capturas en un renderizador por software (no hay GPU ni móvil en el entorno de desarrollo):
- Botella de vidrio con refracción en pantalla de doble pared, dispersión cromática, absorción, doble reflejo y entorno de estudio procedural.
- Agua: campo de alturas en GPU (oleaje exp-sin, ondas que rebotan en las paredes, espuma persistente que se arrastra), raymarch de volumen
  (superficie, refracción, Beer-Lambert, casco sumergido, menisco, cáusticas), nivel por volumen conservado y chapoteo con el acelerómetro.
- Barco procedural de tres palos (casco por secciones, popa de espejo, jarcia, velas animadas), flotación sobre las olas, estela, espuma de proa y reflejo plano.
- Clima: despejado, atardecer, lluvia, tormenta (relámpagos), nieve, niebla y noche. Sonido procedural (WebAudio).
- Sensores (giroscopio/acelerómetro, permiso de iOS, calibración), ratón/táctil/teclado como respaldo, menú en español, calidad adaptativa.

Mar en calma por defecto (despejado: mar 0.08, viento 0.15); solo la lluvia y la tormenta suben el oleaje. Los controles de mar y viento solo se recuerdan si el usuario los toca.
Giroscopio: la lógica está probada con eventos simulados en horizontal (`scripts/prueba_giroscopio.mjs`). En el visor de artefactos de Claude el navegador NO entrega el giroscopio (marco bloqueado);
el panel de ajustes muestra el estado y el motivo. Hay que abrir `docs/index.html` directamente por HTTPS.

Sin verificar todavía: rendimiento real en móvil, sonido a oído.

### Arreglo: el barco se salía al girar el móvil (25-10-2026)
Probado en móvil real (GitHub Pages): al pasar de horizontal a vertical el barco se salía un momento de la botella y reaparecía en otro sitio.
- Causa: la base del plano del agua (`e1`, `e2`) saltaba 90° al pasar de un umbral de inclinación, y el barco guardaba su posición en esas coordenadas, así que se teletransportaba.
  Además solo se comprobaba que cupiera en una línea, no con su forma completa, y la rotación de pantalla hacía saltar la gravedad de golpe.
- Arreglo: base del plano continua (`agua.js`), posición y rumbo del barco en 3D reproyectados cada cuadro, comprobación de ~150 puntos extremos del barco
  contra el cristal con corrección suave (se aparta, cabecea o escora como apoyándose en el vidrio y, como último recurso, se encoge un poco) (`flotacion.js`),
  y suavizado en dos etapas durante 1,2 s tras rotar la pantalla, sin contar el giro como sacudida y recalibrando cuando el móvil ya está quieto (`sensores.js`).
- Barco reducido al 80 % (`ESCALA_BARCO` en `flotacion.js`): así cabe tumbado con la botella de pie, sin encogerse ni apoyarse.
- Prueba de regresión: `node scripts/prueba_giro.mjs` (gira de horizontal a vertical con cambio de pantalla, y pone la botella de pie con el cuello arriba y abajo).
  Antes: salto de 6,9 unidades y 4,9 dentro del cristal. Después: nunca toca el cristal, salto máximo 0,37 por cuadro, escala mínima 0,97.

### Mejoras de la botella (25-10-2026)
- Reflejos: los paneles de luz del entorno tienen bordes suaves y la tira baja es una banda ancha y difusa; ya no hay líneas rectas largas de punta a punta (`entorno.js`).
- Vidrio soplado: ondulaciones irregulares de la normal (anillos a lo largo del eje y vetas en el contorno, más marcadas en el cuello), iguales en las dos paredes (`vidrio.js`).
- Forma: base más gruesa y redonda (radios 2,0 / 1,5), hombro más largo y suave (desde x = 2,8) y labio como anillo grueso de radio 2,38 (`bottle.js`).
- Fondo: habitación desenfocada (estantería, marco de ventana, mueble) y más luces bokeh con borde suave y tonos variados (`mundo.js`).
- Soporte: peana moldurada (zócalo, escalón y canto redondeado) y cunas con cantos redondeados y muesca lateral (`mundo.js`).
- Coste en móvil sin medir: el vidrio suma unos senos por píxel en sus dos pasadas y el fondo pasa de 14 a 22 luces.

## Decisiones tomadas
- Estilo: lo más realista posible (superar la foto de referencia).
- El barco es procedural porque el entorno de desarrollo no puede descargar de Poly Pizza, Sketchfab ni Poly Haven (red restringida).
  Si se permiten esos dominios se puede sustituir por un modelo .glb real y un HDRI.
- Los artefactos de Claude bloquean el giroscopio: para probar sensores hay que alojar `docs/index.html` en HTTPS (p. ej. GitHub Pages desde `/docs`).

## Decisiones pendientes
- Dónde alojar para probar con sensores (repositorio de GitHub y GitHub Pages).
- Tecnología final de la app (Capacitor, nativa...).
- Nombre de la app.

## Estructura
- `src/` código fuente (módulos ES), `scripts/build.mjs` empaqueta todo en `docs/index.html` (un solo archivo).
- `scripts/prueba_giro.mjs` prueba de regresión del barco al girar (`npm run prueba:giro`).
- `scripts/shot.mjs` captura reproducible (`node scripts/shot.mjs salida.png 1600 740 "t=4&ui=0&clima=lluvia&roll=15"`).
- Parámetros de URL: `t` (modo captura), `clima`, `mar`, `viento`, `roll`, `pitch`, `dpr`, `ui=0`, `dbg`.

## Reglas
- Todo el texto de la app y la conversación, en español.
- Mantener el proyecto ligero (menos de 100 MB) para poder subirlo a sesiones en la nube.
