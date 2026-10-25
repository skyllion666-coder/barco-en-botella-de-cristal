# Barco en la botella

Creado por **SKYLLION (FRANK)**.

Web (luego app) en horizontal: botella de cristal con un velero y agua que reaccionan al movimiento del móvil, con clima y sonido.
Ver `NOTAS.md` para el estado y las decisiones.

## Uso
```
npm install
npm run build        # genera docs/index.html (un solo archivo, listo para GitHub Pages desde /docs)
```
Abre `docs/index.html` en el navegador. En el móvil hace falta HTTPS para que el navegador entregue el giroscopio.

El barco es el galeón. Si cambias el modelo: `node scripts/preparar_barco.mjs` (genera `assets/barco-galeon.glb`) y después `npm run build`, que lo copia a `docs/barcos/`. Para la web hay que subir `docs/index.html`, `docs/version.json` y la carpeta `docs/barcos/`.

## Créditos
- Barco por defecto: «Galeone II», de **gogiart** (https://sketchfab.com/3d-models/galeone-ii-25ea58f02dab42db8abb02b15a8e35f7), licencia CC-BY 4.0. Modificado (ver `assets/CREDITOS.md`).
