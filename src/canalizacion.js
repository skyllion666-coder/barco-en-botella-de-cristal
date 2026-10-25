// Canalización de render: mundo -> (agua) -> vidrio -> bloom -> mapeo tonal.
import * as THREE from 'three';

const VERT_PANTALLA = /* glsl */`
  varying vec2 vUv;
  void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FRAG_COPIA = /* glsl */`
  uniform sampler2D tColor; varying vec2 vUv;
  void main(){ gl_FragColor = vec4(texture2D(tColor, vUv).rgb, 1.0); }`;

const FRAG_BRILLO = /* glsl */`
  uniform sampler2D tColor; uniform vec2 uTexel; uniform float uUmbral; varying vec2 vUv;
  void main(){
    vec3 c = texture2D(tColor, vUv + uTexel * vec2(-0.5, -0.5)).rgb
           + texture2D(tColor, vUv + uTexel * vec2( 0.5, -0.5)).rgb
           + texture2D(tColor, vUv + uTexel * vec2(-0.5,  0.5)).rgb
           + texture2D(tColor, vUv + uTexel * vec2( 0.5,  0.5)).rgb;
    c *= 0.25;
    float l = max(c.r, max(c.g, c.b));
    float k = clamp((l - uUmbral) / max(l, 1e-4), 0.0, 1.0);
    gl_FragColor = vec4(c * k, 1.0);
  }`;

const FRAG_DESENFOQUE = /* glsl */`
  uniform sampler2D tColor; uniform vec2 uDir; varying vec2 vUv;
  void main(){
    vec3 s = texture2D(tColor, vUv).rgb * 0.2270270;
    s += texture2D(tColor, vUv + uDir * 1.3846153).rgb * 0.3162162;
    s += texture2D(tColor, vUv - uDir * 1.3846153).rgb * 0.3162162;
    s += texture2D(tColor, vUv + uDir * 3.2307692).rgb * 0.0702702;
    s += texture2D(tColor, vUv - uDir * 3.2307692).rgb * 0.0702702;
    gl_FragColor = vec4(s, 1.0);
  }`;

const FRAG_FINAL = /* glsl */`
  uniform sampler2D tColor; uniform sampler2D tBloom1; uniform sampler2D tBloom2;
  uniform float uExposicion; uniform float uBloom; uniform vec2 uRes; uniform float uTiempo; uniform vec3 uFiltro;
  varying vec2 vUv;
  vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
  vec3 srgb(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
  float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  void main(){
    vec3 c = texture2D(tColor, vUv).rgb;
    c += (texture2D(tBloom1, vUv).rgb * 0.55 + texture2D(tBloom2, vUv).rgb * 0.75) * uBloom;
    c *= uExposicion * uFiltro;
    c = aces(c);
    // viñeta suave
    vec2 q = vUv - 0.5; q.x *= uRes.x / uRes.y;
    c *= 1.0 - 0.38 * smoothstep(0.35, 1.1, length(q));
    // ligera curva de color: sombras algo frías, luces cálidas
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(c, c * vec3(0.95, 1.0, 1.06), (1.0 - l) * 0.25);
    c = srgb(c);
    // dither triangular contra bandas en degradados oscuros
    float n = hash(gl_FragCoord.xy + fract(uTiempo) * 91.7) + hash(gl_FragCoord.xy * 1.37 + 17.0 + fract(uTiempo) * 53.1) - 1.0;
    c += n / 255.0;
    gl_FragColor = vec4(c, 1.0);
  }`;

export class Canalizacion {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.autoClear = true;
    const e = this.renderer.extensions;
    const flotanteOk = e.has('EXT_color_buffer_float') || e.has('EXT_color_buffer_half_float');
    this.muestras = flotanteOk ? Math.min(4, this.renderer.capabilities.maxSamples || 0) : 0;

    this.camaraPantalla = new THREE.Camera();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.triangulo = new THREE.Mesh(geo, null);
    this.triangulo.frustumCulled = false;
    this.escenaPantalla = new THREE.Scene();
    this.escenaPantalla.add(this.triangulo);

    const mk = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERT_PANTALLA, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    this.matCopia = mk(FRAG_COPIA, { tColor: { value: null } });
    this.matBrillo = mk(FRAG_BRILLO, { tColor: { value: null }, uTexel: { value: new THREE.Vector2() }, uUmbral: { value: 1.0 } });
    this.matDesenfoque = mk(FRAG_DESENFOQUE, { tColor: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.uFinal = {
      tColor: { value: null }, tBloom1: { value: null }, tBloom2: { value: null },
      uExposicion: { value: 1.0 }, uBloom: { value: 0.8 }, uRes: { value: new THREE.Vector2(1, 1) },
      uTiempo: { value: 0 }, uFiltro: { value: new THREE.Vector3(1, 1, 1) },
    };
    this.matFinal = mk(FRAG_FINAL, this.uFinal);

    this.ancho = 0; this.alto = 0;
  }

  _rt(w, h, { msaa = false, profundidad = false, textura = false } = {}) {
    const rt = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      depthBuffer: profundidad, stencilBuffer: false, samples: msaa ? this.muestras : 0, generateMipmaps: false,
    });
    if (textura) {
      rt.depthTexture = new THREE.DepthTexture(w, h);
      rt.depthTexture.type = THREE.UnsignedIntType;
      rt.depthTexture.minFilter = rt.depthTexture.magFilter = THREE.NearestFilter;
    }
    return rt;
  }

  redimensionar(ancho, alto, dpr) {
    const r = this.renderer;
    r.setPixelRatio(1);
    r.setSize(Math.round(ancho * dpr), Math.round(alto * dpr), false);
    const w = Math.round(ancho * dpr), h = Math.round(alto * dpr);
    if (w === this.ancho && h === this.alto) return;
    this.ancho = w; this.alto = h;
    for (const k of ['rtEscena', 'rtComp', 'rtAtras', 'rtHDR', 'rtB1a', 'rtB1b', 'rtB2a', 'rtB2b', 'rtRefl']) this[k]?.dispose();
    this.rtEscena = this._rt(w, h, { msaa: true, profundidad: true, textura: true });
    this.rtComp = this._rt(w, h);
    this.rtAtras = this._rt(w, h, { profundidad: true });
    this.rtHDR = this._rt(w, h, { msaa: true });
    this.rtRefl = this._rt(Math.max(2, w >> 1), Math.max(2, h >> 1), { msaa: true, profundidad: true });
    const w1 = Math.max(2, w >> 2), h1 = Math.max(2, h >> 2), w2 = Math.max(2, w >> 3), h2 = Math.max(2, h >> 3);
    this.rtB1a = this._rt(w1, h1); this.rtB1b = this._rt(w1, h1);
    this.rtB2a = this._rt(w2, h2); this.rtB2b = this._rt(w2, h2);
    this.uFinal.uRes.value.set(w, h);
  }

  pasada(material, destino) {
    this.triangulo.material = material;
    this.renderer.setRenderTarget(destino);
    this.renderer.render(this.escenaPantalla, this.camaraPantalla);
  }

  bloom() {
    const px = (rt) => new THREE.Vector2(1 / rt.width, 1 / rt.height);
    this.matBrillo.uniforms.tColor.value = this.rtHDR.texture;
    this.matBrillo.uniforms.uTexel.value.copy(px(this.rtHDR));
    this.pasada(this.matBrillo, this.rtB1a);
    const dir = this.matDesenfoque.uniforms.uDir.value;
    this.matDesenfoque.uniforms.tColor.value = this.rtB1a.texture; dir.set(1 / this.rtB1a.width, 0);
    this.pasada(this.matDesenfoque, this.rtB1b);
    this.matDesenfoque.uniforms.tColor.value = this.rtB1b.texture; dir.set(0, 1 / this.rtB1a.height);
    this.pasada(this.matDesenfoque, this.rtB1a);
    // segundo nivel, más ancho
    this.matCopia.uniforms.tColor.value = this.rtB1a.texture;
    this.pasada(this.matCopia, this.rtB2a);
    for (let i = 0; i < 2; i++) {
      this.matDesenfoque.uniforms.tColor.value = this.rtB2a.texture; dir.set(1.6 / this.rtB2a.width, 0);
      this.pasada(this.matDesenfoque, this.rtB2b);
      this.matDesenfoque.uniforms.tColor.value = this.rtB2b.texture; dir.set(0, 1.6 / this.rtB2a.height);
      this.pasada(this.matDesenfoque, this.rtB2a);
    }
  }

  // etapas: { mundo, camara, vidrio, aguaPasada? }
  dibujar({ mundo, camara, vidrio, aguaPasada, reflejoPasada, tiempo }) {
    const r = this.renderer;
    r.setRenderTarget(this.rtEscena);
    r.clear();
    r.render(mundo, camara);

    let origen = this.rtEscena;
    if (reflejoPasada) reflejoPasada(this.rtRefl);
    if (aguaPasada) { aguaPasada(this.rtEscena, this.rtComp); origen = this.rtComp; }

    // pared trasera del vidrio
    r.setRenderTarget(this.rtAtras);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(vidrio.escenaAtras, camara);

    // composición HDR + vidrio delantero
    this.matCopia.uniforms.tColor.value = origen.texture;
    this.pasada(this.matCopia, this.rtHDR);
    r.setRenderTarget(this.rtHDR);
    r.autoClear = false;
    r.clearDepth();
    r.render(vidrio.escenaFrente, camara);
    r.autoClear = true;

    this.bloom();

    this.uFinal.tColor.value = this.rtHDR.texture;
    this.uFinal.tBloom1.value = this.rtB1a.texture;
    this.uFinal.tBloom2.value = this.rtB2a.texture;
    this.uFinal.uTiempo.value = tiempo;
    this.pasada(this.matFinal, null);
  }
}
