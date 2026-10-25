# Barco en la botella

Web (luego app) en horizontal: botella de cristal con un velero y agua que reaccionan al movimiento del móvil, con clima y sonido.
Ver `NOTAS.md` para el estado y las decisiones.

## Uso
```
npm install
npm run build        # genera docs/index.html (un solo archivo, listo para GitHub Pages desde /docs)
```
Abre `docs/index.html` en el navegador. En el móvil hace falta HTTPS para que el navegador entregue el giroscopio.

La app trae dos barcos (galeón y otomano) que se cambian en Ajustes → «Barco». Si cambias un modelo: `node scripts/preparar_barco.mjs [galeon|ottoman]` (genera `assets/barco-<modelo>.glb`) y después `npm run build`, que los copia a `docs/barcos/`. Para la web hay que subir `docs/index.html` y la carpeta `docs/barcos/`.

## Créditos
- Barco por defecto: «Galeone II», de **gogiart** (https://sketchfab.com/3d-models/galeone-ii-25ea58f02dab42db8abb02b15a8e35f7), licencia CC-BY 4.0. Modificado (ver `assets/CREDITOS.md`).
- Barco alternativo: «Ottoman Coastal Trade Tall Ship 3D Model», de **polygora** (https://sketchfab.com/3d-models/ottoman-coastal-trade-tall-ship-3d-model-1bf970d4795e46f8803a23b6fe276d00), licencia CC-BY 4.0. Modificado (ver `assets/CREDITOS.md`).
