# Barco en la botella

Web (luego app) en horizontal: botella de cristal con un velero y agua que reaccionan al movimiento del móvil, con clima y sonido.
Ver `NOTAS.md` para el estado y las decisiones.

## Uso
```
npm install
npm run build        # genera docs/index.html (un solo archivo, listo para GitHub Pages desde /docs)
```
Abre `docs/index.html` en el navegador. En el móvil hace falta HTTPS para que el navegador entregue el giroscopio.

Si cambias el modelo del barco: `node scripts/preparar_barco.mjs` (genera `assets/barco-web.glb` desde `assets/barco-original.glb`) y después `npm run build`.

## Créditos
- Barco: «Ottoman Coastal Trade Tall Ship 3D Model», de **polygora** (https://sketchfab.com/3d-models/ottoman-coastal-trade-tall-ship-3d-model-1bf970d4795e46f8803a23b6fe276d00), licencia CC-BY 4.0. Modificado (ver `assets/CREDITOS.md`).
