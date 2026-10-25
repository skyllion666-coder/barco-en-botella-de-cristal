# Créditos de los modelos de barco

La app trae los dos barcos y se eligen en Ajustes → «Barco». El galeón es el de por defecto. Cada uno se genera con `node scripts/preparar_barco.mjs galeon|ottoman`.

## Galeón («galeone_ii») — por defecto
- `galeon-ligero.glb`: versión aligerada del archivo `galeone_ii.glb` que aportó el usuario (887.908 caras, 43 MB) → 84.733 caras, ~5 MB, texturas a 256 px.
- `barco-galeon.glb`: generado con `node scripts/preparar_barco.mjs galeon` (86.614 caras, 42 mallas, ~2,3 MB).
- **Autor y licencia: pendientes de confirmar.** Pista: en Sketchfab hay un modelo «Ship Y» etiquetado «galeone», de unas 886.000 caras y licencia CC Attribution (https://sketchfab.com/3d-models/ship-y-3583d23148654d09a0c6a8a080f9aa91). Si es ese, hay que citar a su autor. No publicar la app con este modelo hasta confirmarlo.
- Cambios: colocado en el marco de la app y centrado, velas y banderas subdivididas con atributos de animación (hinchado y ondeo), piezas unidas por material, geometría comprimida (meshopt).

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

- `galeon-1024.glb`: igual que `galeon-ligero.glb` (84.735 caras) pero con texturas hasta 1024 px (~10,6 MB). El original de 43 MB no se sube al repositorio porque su licencia está por confirmar.
