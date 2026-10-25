# Créditos del modelo del barco

- **Modelo:** «Ottoman Coastal Trade Tall Ship 3D Model», por **polygora**.
- **Fuente:** https://sketchfab.com/3d-models/ottoman-coastal-trade-tall-ship-3d-model-1bf970d4795e46f8803a23b6fe276d00
- **Licencia:** CC Attribution (CC-BY). Hay que citar al autor (se cita en la app, en Ajustes, y en el README).
- `barco-original.glb`: archivo descargado, 178.424 caras.
- `barco-web.glb`: versión para la app generada con `scripts/preparar_barco.mjs` a partir del original (69.749 caras, 9 mallas, 743 KB).

## Cambios respecto al original
- Colocado en el marco de la app (proa hacia +X, flotación en y = 0) y escalado.
- Simplificadas con error acotado solo las piezas pesadas (casco, motones, esferas de metal, tallas); velas, cabos y obenques intactos.
- Velas subdivididas y con un atributo de hinchado para animarlas con el viento.
- Piezas unidas por material, textura reducida a 1024 px y geometría comprimida (meshopt).
- Colores: lona en lugar de blanco puro, pintura del casco algo menos saturada, molduras doradas metálicas, metal con brillo.

La versión `barco-ligero.glb` que se hizo con Blender (Decimate al 20 %) no se usa: deformaba las velas y perdía cabos y obenques.
