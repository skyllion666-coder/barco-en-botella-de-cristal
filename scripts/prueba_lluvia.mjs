import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('/opt/node-tools/node_modules/playwright');
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1200, height: 555 } });
p.on('console', (m) => console.log(`[${m.type()}]`, m.text().slice(0, 900)));
await p.goto('file:///home/user/repo/docs/index.html?t=2&ui=0&clima=lluvia');
await p.waitForFunction('window.__listo === true', null, { timeout: 120000 });
const modo = process.argv[3] || 'ok';
await p.evaluate((modo) => {
  const mm = __api.clima.prec.lluvia.material; const m = mm.uniforms;
  m.uAncho.value = 0.02; m.uAlfa.value = 6; m.uColor.value.set(1,1,1).multiplyScalar(3);
  if (modo === 'ok') mm.vertexShader = mm.vertexShader.replace('bool ok = ', 'bool ok = true || ');
  if (modo === 'sinh') mm.vertexShader = mm.vertexShader.replace('c > h + 0.02 &&', '');
  if (modo === 'sinperfil') mm.vertexShader = mm.vertexShader.replace('&& length(P.yz) < rIn - 0.08', '');
  if (modo === 'minimo') {
    mm.vertexShader = `attribute vec4 semilla; varying vec2 vQ; varying float vA; void main(){ vec3 P = vec3(semilla.x*20.-10., semilla.y*8.-4., semilla.z*4.); vec4 mv = modelViewMatrix*vec4(P,1.); mv.xy += position.xy*0.3; gl_Position = projectionMatrix*mv; vQ = position.xy; vA = 1.0; }`;
  }
  if (modo === 'tras_P') mm.vertexShader = mm.vertexShader.replace('float h = texture2D', 'vec4 mv0 = modelViewMatrix*vec4(P,1.); gl_Position = projectionMatrix*(mv0 + vec4(position.xy*0.3,0.,0.)); vQ=position.xy; vA=1.; vProf=0.; return; float h = texture2D');
  if (modo === 'tras_dir') mm.vertexShader = mm.vertexShader.replace('vProf = -mv.z;', 'vProf = -mv.z; gl_Position = projectionMatrix*(mv + vec4(position.xy*0.3,0.,0.)); vA = 1.;').replace('bool ok = ', 'bool ok = true || ');
  if (modo === 'sinperp') mm.vertexShader = mm.vertexShader.replace('gl_Position.xy += perp * position.x * uAncho * gl_Position.w;', 'gl_Position.xy += vec2(position.x*0.02,0.)*gl_Position.w;').replace('bool ok = ', 'bool ok = true || ').replace('vA = smoothstep(0.0, 0.12, c - h) * 0.55;', 'vA = 1.0;');
  if (modo === 'perpfijo') mm.vertexShader = mm.vertexShader.replace('vec2 perp = vec2(-dd.y, dd.x) / vec2(uAspecto, 1.0);', 'vec2 perp = vec2(1.0, 0.0);').replace('bool ok = ', 'bool ok = true || ').replace('vA = smoothstep(0.0, 0.12, c - h) * 0.55;', 'vA = 1.0;');
  if (modo === 'dirfija') mm.vertexShader = mm.vertexShader.replace('vec3 dir = normalize(-uN * vel + uE1 * uViento * vel * 0.16);', 'vec3 dir = vec3(0.0,-1.0,0.0);').replace('bool ok = ', 'bool ok = true || ').replace('vA = smoothstep(0.0, 0.12, c - h) * 0.55;', 'vA = 1.0;');
  if (modo === 'largofijo') mm.vertexShader = mm.vertexShader.replace('P + dir * uLargo', 'P + vec3(0.0,-0.8,0.0)').replace('bool ok = ', 'bool ok = true || ').replace('vA = smoothstep(0.0, 0.12, c - h) * 0.55;', 'vA = 1.0;');
  if (modo === 'va1') mm.vertexShader = mm.vertexShader.replace('vA = smoothstep(0.0, 0.12, c - h) * 0.55;', 'vA = 1.0;').replace('bool ok = ', 'bool ok = true || ');
  mm.needsUpdate = true; __api.redibujar();
}, modo);
await p.screenshot({ path: process.argv[2], timeout: 120000 });
await b.close();
