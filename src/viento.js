// Viento dentro de la botella: uno solo para todo (velas, banderas, cuerdas, escora, lluvia y sonido).
//  - base: la del clima (o el control «Viento» de Ajustes);
//  - rachas: llegan de golpe y se apagan despacio, más frecuentes y fuertes cuanto más viento hay;
//  - remolino: ruido de varias frecuencias que nunca deja el aire quieto del todo;
//  - el propio barco al balancearse y las sacudidas del móvil también mueven el aire.
// Además da lo que necesita la tela: el llenado de las velas (con inercia) y la fase de las ondas de flameo.
const al = (a, b) => a + Math.random() * (b - a);

export function crearViento() {
  const v = {
    base: 0.15, racha: 0, total: 0.15, // intensidad 0..~1.6
    llenado: 0.15,                      // lo hinchadas que están las velas (sigue al viento con inercia)
    flojo: 0,                           // 0..1: vela sin viento que gualdrapea
    fase: 0, faseBandera: 0,            // fases integradas (la velocidad cambia sin saltos)
    dir: 0,                             // pequeño giro del viento en el plano del agua (rad)
    t: 0,
  };
  let objetivo = 0, proxima = 1.2;

  function actualizar(dt, { base = 0.15, sacudida = 0, balanceo = 0 } = {}) {
    v.t += dt;
    v.base = base;
    // rachas
    proxima -= dt;
    if (proxima <= 0) {
      objetivo = al(0.12, 0.65) * (0.25 + base);
      proxima = al(1.2, 4.5) / (0.35 + base);
    }
    objetivo *= Math.exp(-dt * 0.55);
    v.racha += (objetivo - v.racha) * (1 - Math.exp(-dt * (objetivo > v.racha ? 5 : 1.1)));
    const t = v.t;
    const remolino = (Math.sin(t * 0.71) * 0.5 + Math.sin(t * 1.93 + 1.3) * 0.3 + Math.sin(t * 4.37 + 0.4) * 0.2) * 0.09 * (0.3 + base);
    v.total = Math.max(0.02, base + v.racha + remolino + 0.3 * Math.min(1, sacudida) + 0.25 * Math.min(1, Math.abs(balanceo)));
    v.dir = 0.12 * Math.sin(t * 0.13) + 0.06 * Math.sin(t * 0.41 + 2);
    // la vela se llena deprisa con la racha y se vacía más despacio
    v.llenado += (v.total - v.llenado) * (1 - Math.exp(-dt * (v.total > v.llenado ? 6 : 1.6)));
    // con muy poco viento la tela cuelga floja y aletea
    v.flojo = Math.max(0, Math.min(1, 1 - v.llenado / 0.32));
    // las ondas corren más deprisa con más viento (y algo cuando la vela está floja)
    v.fase += dt * (2.2 + 7 * Math.min(v.total, 1.4) + 2.5 * v.flojo);
    v.faseBandera += dt * (4 + 9 * Math.min(v.total, 1.4));
  }

  return { estado: v, actualizar, get total() { return v.total; } };
}
