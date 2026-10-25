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

### Truenos audibles (25-10-2026)
- Problema (probado en móvil): no se oían. El trueno era ruido por debajo de ~200 Hz, que el altavoz del móvil no reproduce, y la lluvia lo tapaba (−3 dB respecto a la lluvia).
- Nuevo trueno (`sintetizarTrueno` en `audio.js`): chasquido si cae cerca, retumbo saturado con armónicos en 120-2000 Hz, 3-5 rodamientos, subgrave para auriculares
  y posición estéreo aleatoria. La distancia sale del retraso relámpago-trueno. Mientras retumba, el ambiente baja (la lluvia se aparta).
- Prueba: `node scripts/prueba_trueno.mjs` (con `--anterior` mide la versión vieja). Por altavoz de móvil simulado: +7,3 dB (cercano) y +6,7 dB (lejano) sobre la lluvia,
  sin contar el bajón del ambiente.

### Todo el clima dentro de la botella (25-10-2026)
- Decisión del usuario: la tormenta, la iluminación y el resto del clima ocurren solo DENTRO de la botella. La habitación (fondo, mesa, soporte, corcho) tiene luz fija.
- Escena interior propia (`mundo.interior`): barco, lluvia, nieve, rayos y estrellas, con luces que siguen al clima; se dibuja sobre la habitación compartiendo profundidad (`canalizacion.js`).
- Atmósfera interior en la pasada de volumen (`agua.js`, parámetro `aire` de cada clima): nubes que se mueven, más densas arriba; el rayo la enciende.
- Rayos visibles dentro (`cielo.js`): canal en zigzag con ramas, núcleo HDR con resplandor y luz puntual que ilumina barco y agua. Sobre la mesa, solo un leve destello.
- Noche: estrellas que titilan en el aire interior y farolillos del barco.
- Gotas en el cristal (`gotas.js`): resbalan según la inclinación, se descuelgan del techo y se funden con el agua; mapa de alturas en GPU con estela; el vidrio las refracta como lentes. Si no hay gotas, no se dibuja nada.
- Ajustes nuevos: «Hora real» (día/noche y luz dorada según la hora local, combinado con el clima; `?hora=21.5` para pruebas), «Vibración» con los truenos cercanos (Android; en iPhone no se muestra) y línea de rendimiento (FPS y resolución).
- Mejorar el barco: desde este entorno no se puede descargar de Poly Pizza, Sketchfab ni Poly Haven (bloqueados); GitHub sí. Opciones en la conversación.

### Barco real (25-10-2026)
- Modelo subido por el usuario a su repositorio: «Ottoman Coastal Trade Tall Ship», de polygora (Sketchfab, CC-BY). Créditos en Ajustes, README y `assets/CREDITOS.md`.
- `scripts/preparar_barco.mjs` genera `assets/barco-web.glb` desde el original (no desde `barco-ligero.glb`, que deformaba velas y perdía cabos):
  marco de la app, simplificación solo de piezas pesadas, velas subdivididas con hinchado (_EMPUJE), unión por material (61 → 9 mallas),
  textura a 1024, meshopt. 178.424 → 69.749 triángulos, 743 KB. Colores retocados (lona, casco menos saturado, dorados metálicos).
- `src/barcoModelo.js` lo carga (incrustado en `docs/index.html`, que pasa a 1,8 MB y a módulo ES2022) con la misma interfaz que el barco procedural.
  `?barco=procedural` usa el barco generado por código (también si el modelo fallara).
- La flotación y la espuma usan las medidas del casco del modelo (`barco.info`); rumbo de reposo casi de costado (-0,30 rad).
- Prueba de giro con el modelo: nunca toca el cristal, sin saltos, sin encogerse.

### Galeón (25-10-2026)
- El usuario prefiere el galeón «galeone_ii» (`assets/galeon-ligero.glb`): ahora es el barco de la app. **Autor y licencia por confirmar** (posible «Ship Y», Sketchfab, CC-BY): no publicar hasta saberlo.
- `preparar_barco.mjs` admite varios modelos (`galeon` por defecto, `ottoman`). Para el galeón: centrado en la huella del casco, flotación en y = 1,3 del original,
  altura 6,7 (cabe tumbado con la botella de pie), 13 velas con hinchado y 3 banderas que ondean, 148 → 42 mallas. `docs/index.html` pasa a ~3,9 MB.
- Sus texturas vienen a 256 px (se aligeraron antes de subirlo): con el `galeone_ii.glb` original (43 MB) se podrían usar texturas mejores.

### Dos barcos a elegir (25-10-2026)
- Petición del usuario: poder cambiar entre los dos barcos. Ajustes → «Barco: Galeón/Otomano» los alterna al momento (se rehacen flotación y reflejo) y se recuerda.
  Los dos van incrustados (`assets/barco-galeon.glb`, `assets/barco-ottoman.glb`): `docs/index.html` ~4,8 MB. `?barco=galeon|ottoman|procedural` fuerza uno.
- `npm run prueba:giro` prueba los dos barcos.

### Viento, velas, cuerdas y olas de tormenta (25-10-2026)
- `viento.js`: un solo viento para todo (clima + rachas + remolino + balanceo y sacudidas del móvil). Lo usan velas, banderas, cabos,
  escora, inclinación de la lluvia, cabrilleo del agua y el silbido del sonido.
- `preparar_barco.mjs` añade `_VELA` (posición en la vela), `_CABO` (cabos detectados por componentes principales: galeón 174, otomano 40)
  y `_SIGUE` (cabos enganchados a una vela: galeón 71, otomano 26). `barcoModelo.js`: un sombreador común anima velas (llenado con inercia,
  ondas del borde sujeto al libre, gualdrapeo sin viento, pliegues con luz), banderas y cabos (vibran, cuelgan sin viento, siguen a su vela).
- Oleaje (`agua.js`): 18 ondas con espectro de mar real (amplitudes, longitudes, direcciones y desfases distintos, semilla fija),
  series de olas a la velocidad de grupo y una ola grande cada 20-50 s con mar fuerte. GLSL y `oleajeJS` idénticos (la flotación los usa).
  Espuma solo en crestas altas y empinadas; cabrilleo con el viento. `scripts/prueba_olas.mjs`: variación 0,41 → 0,71, mayor ola 3,6 × la media.
- Salpicaduras (`salpicaduras.js`) desde las crestas que rompen y desde la proa al golpear las olas.
- Gotas en el cristal: más lentas (≤ 1,1 u/s, a tirones) y estelas más cortas: antes dejaban rayas largas al moverse.
- Prueba de giro también en tormenta con ola grande (`npm run prueba:giro`): los dos barcos, sin tocar el cristal.

### Ronda 2 (25-10-2026)
- Galeón: el usuario subió el original `galeone_ii.glb`: «Galeone II», de gogiart, **CC-BY 4.0** (autor y licencia resueltos, ya se puede publicar).
  Se prepara desde el original (`assets/galeone_ii.glb`, fuera de git por pesar 43 MB): texturas hasta 1024, ~187.000 caras, y el rojo pasado
  a marrón oscuro de madera (`scripts/textura.py`, sin tocar banderas ni escudos), como pidió el usuario.
- Los barcos ya no van incrustados: `npm run build` los copia a `docs/barcos/` y la app descarga solo el que se usa (con XMLHttpRequest, que
  también funciona abriendo la página como archivo; las pruebas lanzan Chromium con `--allow-file-access-from-files`). `docs/index.html` ~0,8 MB.
- Arcoíris real (`cielo.js`): siete colores por longitud de onda, principal a ~41-42° del antisolar, secundario a ~50-54° invertido y tenue,
  cielo más claro dentro, banda de Alexander, supernumerarias. Fijo respecto a la luz y a quien mira (no sigue al agua); se mide desde un
  observador en miniatura junto al cristal con el sol bajo a su espalda, para que el arco quepa entero.
- El barco reacciona más a las olas grandes (cabecea y escora más, se desliza por la cara de la ola) y cae agua por la borda con los golpes.

### Ronda 3 (25-10-2026): velas, cabos y banderas de verdad
- El usuario no veía moverse velas ni cuerdas: los desplazamientos eran de milésimas. Ahora se calcula todo respecto al tamaño de cada pieza:
  - Velas (`_PLANO`: lo que separa cada punto del plano de sus bordes; `_VELA.w`: coordenada de lado a lado): sin viento cuelgan sin bolsa,
    con pliegues verticales que se ahondan hacia el borde libre, el pujamen cae y se mecen; con poco viento flamean (ondas grandes del borde
    sujeto al libre); llenas se tensan, la bolsa crece y respira con las rachas y solo tiembla la baluma.
  - Cabos (`_COLGAR`: caída por gravedad perpendicular al cabo, por su largo): flojos hacen catenaria y se mecen; tensos vibran más deprisa y
    más fuerte con el viento. Se separan de vergas y palos por el grosor (`radioCabo`): galeón 81 cabos, otomano 30.
  - Banderas (`_ASTA`): sin viento caen junto al asta con pliegues; con viento se extienden y ondean (también arriba y abajo), sin inercia.
- Banderas españolas (las del modelo eran de Paraguay, Egipto y otra tricolor): rojigualda con escudo sencillo en el mayor y cruz de
  Borgoña (la de la Armada de los galeones) en trinquete y mesana; 1,7 veces más grandes. Las dibuja `scripts/bandera.py`.
- `flotacion.js` cuenta con lo que se desplazan velas y banderas, a los dos lados, al vigilar el cristal.

### Versión y caché (25-10-2026)
- El usuario veía versiones viejas en GitHub Pages por la caché. Archivo `VERSION` (ahora 12): `build.mjs` lo mete en la app, en las
  descargas de los barcos (`barcos/galeon.glb?v=12`) y en `docs/version.json`. Ajustes muestra «Versión N». Al abrir la app (y al volver a
  ella) se consulta `version.json` sin caché; si hay una más nueva, la página se recarga sola con `?v=<nueva>` (una vez por versión).
  GitHub Pages tarda 1-10 min en publicar tras subir (pestaña Actions).

### Ronda 4 (25-10-2026, versión 13)
- Velas: sin viento quedan rectas (planas, casi sin pliegues ni caída); con viento se inflan mucho más (bolsa ~2×). La forma sigue un
  muelle poco amortiguado (`barcoModelo.js`, `uForma`): al entrar la racha la lona se llena de golpe y rebota. Llenado más rápido
  (`viento.js`), flameo de transición, respiración con las rachas y temblor de la baluma más fuertes. Cabos: tensos de golpe con la racha.
- Gaviotas: dos, con vuelo libre (rutas a los lados del barco rodeándolo por proa o popa, sin cruzar las velas), velocidad que cambia al
  subir o bajar, aleteo con bajada rápida y planeos en «M», cabeceo y alabeo, cernido cara al viento, a veces una persigue a la otra;
  toma de tierra frenando para posarse. Prueba (simulación de 150 s con giros y lluvia): nunca tocan el cristal, sin saltos.

### Un solo barco (25-10-2026, versión 14)
- El usuario se queda con el galeón: se quitan el otomano (modelo, original y selector «Barco» de Ajustes) y el barco procedural
  (`barco.js`). Si la descarga del galeón falla, la app avisa y reintenta (2, 4, 6… s). Lo de las secciones anteriores sobre el otomano
  y el cambio de barco es historia.

### Arcoíris solo con cielo claro (versión 15)
- Salía al pasar de lluvia a nieve o a niebla. Ahora solo aparece si escampa a cielo claro (nieve < 0,05 y niebla < 0,008) y se apaga si
  llegan nieve o niebla. Prueba: de lluvia a nieve 0, a niebla 0, a noche 0, a despejado 1, a atardecer 0,76.

### Sorpresas (no contárselas al usuario hasta que las vea)
- Bioluminiscencia: de noche el agua agitada, la estela, las burbujas y las salpicaduras brillan en azul verdoso.
- Estrellas fugaces de noche, cada 6-16 s, dentro de la botella.
- Arcoíris dentro de la botella al escampar tras lluvia o tormenta (~30 s, solo de día).
- Campanas de a bordo según la hora real (guardias de 4 h: cada media hora 1-8 toques por parejas), con sonido activado; tocar el barco
  hace sonar su campana.
- Botellita con mensaje flotando en el agua (`botellita.js`): la llevan las olas y el viento; al tocarla se abre un pergamino con un dicho marinero.
- Gaviotas (`gaviotas.js`): tres vuelan alrededor del barco con buen tiempo (aleteo y planeo en «M», se inclinan en los giros, graznan de
  vez en cuando con sonido); con lluvia, tormenta, nieve o de noche bajan a posarse en el barco (sitios hallados con rayos: castillos,
  vergas) y se mecen con él. Nunca tocan el cristal.
- Pesca: cada 20-45 s una gaviota se tira en picado al agua, salpica y deja ondas, y sube con un pececillo plateado en el pico que
  coletea hasta que se lo traga.

## Decisiones tomadas
- Estilo: lo más realista posible (superar la foto de referencia).
- El barco es procedural porque el entorno de desarrollo no puede descargar de Poly Pizza, Sketchfab ni Poly Haven (red restringida).
  Si se permiten esos dominios se puede sustituir por un modelo .glb real y un HDRI.
- Los artefactos de Claude bloquean el giroscopio: para probar sensores hay que alojar `docs/index.html` en HTTPS (p. ej. GitHub Pages desde `/docs`).

## Decisiones pendientes
- Dónde alojar para probar con sensores (repositorio de GitHub y GitHub Pages).
- Tecnología final de la app (Capacitor, nativa...). El usuario la deja para el final, cuando todo esté acabado.
- Nombre de la app.

## Estructura
- `src/` código fuente (módulos ES), `scripts/build.mjs` empaqueta todo en `docs/index.html` (un solo archivo).
- `scripts/prueba_giro.mjs` prueba de regresión del barco al girar (`npm run prueba:giro`).
- `scripts/shot.mjs` captura reproducible (`node scripts/shot.mjs salida.png 1600 740 "t=4&ui=0&clima=lluvia&roll=15"`).
- Parámetros de URL: `t` (modo captura), `rayo=1` (relámpago en la captura), `ola=1` (ola grande), `arcoiris=1`, `fugaz=1` (estrella fugaz), `clima`, `mar`, `viento`, `roll`, `pitch`, `dpr`, `ui=0`, `dbg`.

## Reglas
- Subir el número de `VERSION` en cada entrega al usuario (zip y enlace) y decírselo.
- Todo el texto de la app y la conversación, en español.
- Mantener el proyecto ligero (menos de 100 MB) para poder subirlo a sesiones en la nube.
- Las velas SIEMPRE se mueven con el aire (viento del clima y del movimiento del móvil), y todo el barco, velas y cuerdas debe ser lo más realista posible (petición expresa del usuario).
