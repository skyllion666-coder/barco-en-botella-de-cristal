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

Sin verificar todavía: rendimiento real en móvil, giroscopio en un móvil real, sonido a oído.

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
- `scripts/shot.mjs` captura reproducible (`node scripts/shot.mjs salida.png 1600 740 "t=4&ui=0&clima=lluvia&roll=15"`).
- Parámetros de URL: `t` (modo captura), `clima`, `mar`, `viento`, `roll`, `pitch`, `dpr`, `ui=0`, `dbg`.

## Reglas
- Todo el texto de la app y la conversación, en español.
- Mantener el proyecto ligero (menos de 100 MB) para poder subirlo a sesiones en la nube.
