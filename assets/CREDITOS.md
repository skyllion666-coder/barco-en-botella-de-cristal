# Créditos de los modelos de barco

La app trae los dos barcos y se eligen en Ajustes → «Barco». El galeón es el de por defecto. Cada uno se genera con `node scripts/preparar_barco.mjs galeon|ottoman`.

## Galeón — por defecto
- **Modelo:** «Galeone II», por **gogiart** (https://sketchfab.com/agt14032013).
- **Fuente:** https://sketchfab.com/3d-models/galeone-ii-25ea58f02dab42db8abb02b15a8e35f7
- **Licencia:** CC-BY 4.0 (http://creativecommons.org/licenses/by/4.0/). Hay que citar al autor (se cita en la app, en Ajustes, y en el README).
  Los datos vienen dentro del propio archivo original (`asset.extras`).
- `galeone_ii.glb`: el original (891.289 caras, 43 MB). No va en git (`.gitignore`); hace falta para regenerar el galeón.
- `galeon-ligero.glb`: versión aligerada que hizo el usuario (84.733 caras, texturas a 256 px); solo se usa si falta el original.
- `barco-galeon.glb`: `node scripts/preparar_barco.mjs galeon` desde el original (~187.000 caras, 46 mallas, ~5,2 MB).
- Cambios: colocado en el marco de la app y centrado; simplificadas con error acotado las piezas pesadas; texturas a 1024 px como mucho;
  el rojo del casco, palos y remates pasado a marrón oscuro de madera (banderas y escudos sin tocar); velas y banderas subdivididas
  con atributos de animación (hinchado y ondeo); cabos detectados para moverlos con el viento; piezas unidas por material; meshopt.

## Ottoman (el otro barco)

- **Modelo:** «Ottoman Coastal Trade Tall Ship 3D Model», por **polygora**.
- **Fuente:** https://sketchfab.com/3d-models/ottoman-coastal-trade-tall-ship-3d-model-1bf970d4795e46f8803a23b6fe276d00
- **Licencia:** CC Attribution (CC-BY). Hay que citar al autor (se cita en la app, en Ajustes, y en el README).
- `barco-original.glb`: archivo descargado, 178.424 caras.
- `barco-ottoman.glb`: `node scripts/preparar_barco.mjs ottoman` (68.643 caras, 9 mallas, ~710 KB).

### Cambios respecto al original
- Colocado en el marco de la app (proa hacia +X, flotación en y = 0) y escalado.
- Simplificadas con error acotado solo las piezas pesadas (casco, motones, esferas de metal, tallas); velas, cabos y obenques intactos.
- Velas subdivididas y con un atributo de hinchado para animarlas con el viento.
- Piezas unidas por material, textura reducida a 1024 px y geometría comprimida (meshopt).
- Colores: lona en lugar de blanco puro, pintura del casco algo menos saturada, molduras doradas metálicas, metal con brillo.

La versión `barco-ligero.glb` que se hizo con Blender (Decimate al 20 %) no se usa: deformaba las velas y perdía cabos y obenques.
