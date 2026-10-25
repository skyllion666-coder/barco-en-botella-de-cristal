# Barco en la botella

## Idea (del usuario, 25-10-2026)
Una app que primero será una **web** y después una **aplicación de móvil**.
El móvil se usa **en horizontal**, y la pantalla se ve como una **botella de cristal tumbada con un barco de vela dentro y agua**.
La imagen de referencia está en `referencia/botella-barco.png` (botella de cristal sobre soporte de madera, tapón de corcho, barco de tres mástiles en un mar con olas).

## Comportamiento
- El agua y el barco **se mueven según cómo muevas u orientes el móvil** (giroscopio / acelerómetro).
- Opciones de **clima** dentro de la botella: lluvia, nieve y otras cosas parecidas (niebla, tormenta con rayos, sol...).
- Ideas para más adelante: sonido ambiente (olas, lluvia), día y noche, distintos barcos, distintas botellas.

## Estado
El usuario ya tiene un **HTML empezado** (25-10-2026), trabajado en una sesión en la nube. **Partir de ese HTML, no rehacerlo desde cero.** Cuando esté en el repositorio, describirlo aquí.

## Plan por fases
1. **Web prototipo** (HTML + JavaScript, three.js o canvas/WebGL). Pantalla horizontal, botella de cristal con refracción y reflejos, agua con olas que reaccionan a la inclinación, barco que cabecea.
2. Sensores: `DeviceOrientationEvent` / `DeviceMotionEvent`. En iPhone pide permiso; en Android funciona directo. Ratón o teclado como respaldo en el PC.
3. Clima: partículas de lluvia y nieve dentro de la botella, con cambio desde un menú pequeño.
4. Pulir el aspecto de cristal, luz y sonido.
5. **App Android**: empaquetar la web (Capacitor o similar) para publicar. Más adelante.

## Decisiones pendientes
- Estilo: realista (como la foto) o más dibujado.
- Tecnología final de la app (Capacitor, nativa...).
- Nombre de la app.

## Reglas
- Todo el texto de la app y la conversación, en español.
- Mantener el proyecto ligero (menos de 100 MB) para poder subirlo a sesiones en la nube.
