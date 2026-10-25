# Créditos de los modelos de barco

La app trae un solo barco, el galeón. Se genera con `node scripts/preparar_barco.mjs`.

## Galeón
- **Modelo:** «Galeone II», por **gogiart** (https://sketchfab.com/agt14032013).
- **Fuente:** https://sketchfab.com/3d-models/galeone-ii-25ea58f02dab42db8abb02b15a8e35f7
- **Licencia:** CC-BY 4.0 (http://creativecommons.org/licenses/by/4.0/). Hay que citar al autor (se cita en la app, en Ajustes, y en el README).
  Los datos vienen dentro del propio archivo original (`asset.extras`).
- `galeone_ii.glb`: el original (891.289 caras, 43 MB). No va en git (`.gitignore`); hace falta para regenerar el galeón.
- `galeon-ligero.glb`: versión aligerada que hizo el usuario (84.733 caras, texturas a 256 px); solo se usa si falta el original.
- `barco-galeon.glb`: `node scripts/preparar_barco.mjs galeon` desde el original (~189.000 caras, 46 mallas, ~5,7 MB).
- Cambios: colocado en el marco de la app y centrado; simplificadas con error acotado las piezas pesadas; texturas a 1024 px como mucho;
  el rojo del casco, palos y remates pasado a marrón oscuro de madera (escudos sin tocar); banderas sustituidas por banderas españolas
  dibujadas aquí (rojigualda y cruz de Borgoña, `scripts/bandera.py`) y agrandadas; velas y banderas subdivididas con atributos de
  animación (hinchado, colgar, ondeo); cabos detectados para moverlos con el viento; piezas unidas por material; meshopt.

El otro barco que hubo (el otomano de polygora) se quitó a petición del usuario.
