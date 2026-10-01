import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { hash32 } from "@/lib/terrain";
import { lerp, smoothstep } from "@/lib/math";

/* ─────────────────────────────────────────────────────────────────────────
   MARS — a point-cloud planet with two ROUTE-M orbiters.

   · One satellite in a near-polar (~93°) orbit, one at ~45° (per the final report).
   · Orbit radius = 3389.5 km + 300 km → 1.0885 R. Period T = 2π√(a³/μ) ≈ 113.4 min.
   · The planet rotates under the (inertial) orbits at the real ratio of sol to orbital
     period; ground-track coverage accumulates. Swath and time are exaggerated for
     legibility — this is an illustration, not the mission's coverage analysis.
   ───────────────────────────────────────────────────────────────────────── */

const ORBIT_R = 1 + 300 / 3389.5;
const ORBIT_SEC = 3.4; // seconds of screen time per orbit (113.4 min in reality)
const SPIN_MULT = 2; // planet spin relative to the true sol / orbit ratio
const SWATH_DEG = 6;
const T_PLANET = ((88642 / 6806) * ORBIT_SEC) / SPIN_MULT; // seconds per planet rotation

const SATS = [
  { name: "A", incDeg: 93, raan: 0.3, phase: 0, color: new THREE.Color(0.66, 0.85, 1.0) },
  { name: "B", incDeg: 45, raan: 2.2, phase: 2.1, color: new THREE.Color(1.0, 0.55, 0.32) },
];

function noise3(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const f = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const u = f(xf), v = f(yf), w = f(zf);
  const h = (a: number, b: number, c: number) =>
    hash32((Math.imul(xi + a, 0x27d4eb2d) ^ Math.imul(yi + b, 0x165667b1) ^ Math.imul(zi + c, 0x9e3779b1) ^ seed) | 0) / 4294967296;
  return lerp(
    lerp(lerp(h(0, 0, 0), h(1, 0, 0), u), lerp(h(0, 1, 0), h(1, 1, 0), u), v),
    lerp(lerp(h(0, 0, 1), h(1, 0, 1), u), lerp(h(0, 1, 1), h(1, 1, 1), u), v),
    w
  );
}
function fbm3(x: number, y: number, z: number, seed: number, oct = 5): number {
  let a = 0.5, s = 0, n = 0, f = 1;
  for (let i = 0; i < oct; i++) { s += a * (noise3(x * f, y * f, z * f, seed + i * 31) * 2 - 1); n += a; a *= 0.5; f *= 2.1; }
  return s / n;
}

const VERT = /* glsl */ `
  attribute vec3 aColor;
  attribute float aCov;
  uniform vec3 uSun;
  uniform float uSize;
  varying vec3 vC;
  varying float vA;
  void main() {
    vec3 n = normalize((modelMatrix * vec4(position, 0.0)).xyz);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec3 toCam = normalize(cameraPosition - wp.xyz);
    float facing = dot(n, toCam);
    float lit = smoothstep(-0.14, 0.32, dot(n, uSun));
    float rim = pow(1.0 - max(facing, 0.0), 2.6);
    vC = aColor * (0.16 + 1.1 * lit) + vec3(0.95, 0.52, 0.36) * rim * 0.4 * lit;
    vA = smoothstep(-0.06, 0.14, facing) * mix(0.3, 1.0, smoothstep(0.02, 0.32, facing));
    gl_Position = projectionMatrix * viewMatrix * wp;
    gl_PointSize = uSize * (1.0 + aCov * 0.45);
  }
`;
const FRAG = /* glsl */ `
  varying vec3 vC;
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.15, d);
    if (vA < 0.01) discard;
    gl_FragColor = vec4(vC, a * vA * 0.95);
  }
`;
const SPRITE_VERT = /* glsl */ `uniform float uSize; void main(){ gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_PointSize = uSize; }`;
const SPRITE_FRAG = /* glsl */ `uniform vec3 uColor; void main(){ float d = length(gl_PointCoord-0.5)*2.0; float a = pow(smoothstep(1.0,0.0,d),2.0); gl_FragColor = vec4(uColor, a); }`;

export type MarsStats = { coverage: number; orbit: number };
export type MarsScene = { debugAdvance(seconds: number): void; resize(): void; setVisible(v: boolean): void; onStats(cb: (s: MarsStats) => void): void; dispose(): void };

export function createMars(canvas: HTMLCanvasElement, opts: { lowPower: boolean; reduced: boolean }): MarsScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
  renderer.setClearColor(0x06070b, 1);
  const dpr0 = Math.min(window.devicePixelRatio || 1, opts.lowPower ? 1.5 : 2);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0.9, 1.1, 4.3);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.rotateSpeed = 0.6;
  controls.minPolarAngle = 0.5;
  controls.maxPolarAngle = Math.PI - 0.5;
  canvas.style.touchAction = "pan-y";

  /* planet points (Fibonacci sphere, planet-fixed frame) */
  const N = opts.lowPower ? 20000 : 40000;
  const base = new Float32Array(N * 3); // unit vectors
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const colBase = new Float32Array(N * 3);
  const cov = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const y = 1 - (2 * (i + 0.5)) / N;
    const r = Math.sqrt(1 - y * y);
    const th = i * 2.399963229728653;
    const x = r * Math.cos(th), z = r * Math.sin(th);
    base[i * 3] = x; base[i * 3 + 1] = y; base[i * 3 + 2] = z;

    const e = fbm3(x * 2.4 + 3, y * 2.4, z * 2.4 - 5, 7, 5); // elevation-ish
    const dark = smoothstep(0.05, 0.3, fbm3(x * 1.3 - 9, y * 1.3 + 2, z * 1.3, 91, 3)); // maria-like dark regions
    const dust = smoothstep(-0.1, 0.4, fbm3(x * 4 + 11, y * 4, z * 4, 57, 3));
    const lat = Math.asin(y);
    const cap = smoothstep(1.17, 1.35, Math.abs(lat) + 0.1 * e); // polar caps
    const k = e * 0.5 + 0.5;
    // terracotta → ochre, darkened by maria, brightened by dust
    let cr = lerp(0.42, 0.86, k), cg = lerp(0.2, 0.5, k), cb = lerp(0.13, 0.32, k);
    cr = lerp(cr, 0.2, dark * 0.55); cg = lerp(cg, 0.13, dark * 0.55); cb = lerp(cb, 0.11, dark * 0.55);
    cr = lerp(cr, 0.95, dust * 0.22); cg = lerp(cg, 0.72, dust * 0.22); cb = lerp(cb, 0.55, dust * 0.22);
    cr = lerp(cr, 0.96, cap); cg = lerp(cg, 0.95, cap); cb = lerp(cb, 0.93, cap);
    colBase[i * 3] = cr; colBase[i * 3 + 1] = cg; colBase[i * 3 + 2] = cb;
    col[i * 3] = cr; col[i * 3 + 1] = cg; col[i * 3 + 2] = cb;
    const rad = 1 + e * 0.012;
    pos[i * 3] = x * rad; pos[i * 3 + 1] = y * rad; pos[i * 3 + 2] = z * rad;
  }
  const planetGeo = new THREE.BufferGeometry();
  planetGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const colAttr = new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage);
  const covAttr = new THREE.BufferAttribute(cov, 1).setUsage(THREE.DynamicDrawUsage);
  planetGeo.setAttribute("aColor", colAttr);
  planetGeo.setAttribute("aCov", covAttr);
  const sun = new THREE.Vector3(1, 0.32, 0.55).normalize();
  const planetMat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: { uSun: { value: sun }, uSize: { value: (opts.lowPower ? 3.0 : 2.7) * dpr0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const planet = new THREE.Points(planetGeo, planetMat);
  planet.frustumCulled = false;
  scene.add(planet);

  /* stars */
  const sp = new Float32Array(400 * 3);
  for (let i = 0; i < 400; i++) {
    const u = hash32(i * 7 + 1) / 4294967296, v = hash32(i * 13 + 5) / 4294967296;
    const th = u * Math.PI * 2, ph = Math.acos(2 * v - 1), r = 20;
    sp[i * 3] = r * Math.sin(ph) * Math.cos(th); sp[i * 3 + 1] = r * Math.cos(ph); sp[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
  const starGeo = new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(sp, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xbcd6ff, size: 1.2 * dpr0, sizeAttenuation: false, transparent: true, opacity: 0.5, depthWrite: false }));
  scene.add(stars);

  /* orbits + satellites */
  const satObjs = SATS.map((s) => {
    const inc = (s.incDeg * Math.PI) / 180;
    const rot = new THREE.Matrix4().makeRotationY(s.raan).multiply(new THREE.Matrix4().makeRotationX(inc));
    const ring: number[] = [];
    for (let k = 0; k <= 200; k++) {
      const a = (k / 200) * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(ORBIT_R).applyMatrix4(rot);
      ring.push(v.x, v.y, v.z);
    }
    const ringLine = new THREE.Line(
      new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(ring, 3)),
      new THREE.LineBasicMaterial({ color: s.color, transparent: true, opacity: 0.32 })
    );
    scene.add(ringLine);
    const dot = new THREE.Points(
      new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(3), 3)),
      new THREE.ShaderMaterial({ vertexShader: SPRITE_VERT, fragmentShader: SPRITE_FRAG, uniforms: { uSize: { value: 26 * dpr0 }, uColor: { value: s.color } }, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    dot.frustumCulled = false;
    scene.add(dot);
    return { s, rot, ringLine, dot, dir: new THREE.Vector3() };
  });

  /* state */
  let t = 0;
  let coveredN = 0;
  let holdT = 0;
  let listener: ((s: MarsStats) => void) | null = null;
  let lastEmit = 0;
  let visible = true;
  let running = false;
  let raf = 0;
  let last = 0;
  const cosSw = Math.cos((SWATH_DEG * Math.PI) / 180);
  const tmp = new THREE.Vector3();
  const ICE: [number, number, number] = [0.66, 0.88, 1.0];

  function resetCoverage() {
    cov.fill(0);
    col.set(colBase);
    coveredN = 0;
    colAttr.needsUpdate = covAttr.needsUpdate = true;
  }

  function step(dt: number) {
    t += dt;
    const th = (2 * Math.PI * t) / T_PLANET;
    planet.rotation.y = th;
    planet.updateMatrixWorld();
    let changed = false;
    satObjs.forEach((o) => {
      const nu = (2 * Math.PI * t) / ORBIT_SEC + o.s.phase;
      tmp.set(Math.cos(nu), 0, Math.sin(nu)).applyMatrix4(o.rot);
      o.dir.copy(tmp);
      const p = o.dot.geometry.getAttribute("position") as THREE.BufferAttribute;
      p.setXYZ(0, tmp.x * ORBIT_R, tmp.y * ORBIT_R, tmp.z * ORBIT_R);
      p.needsUpdate = true;
      // subpoint in the planet-fixed frame (rotate by −θ about Y)
      const c = Math.cos(-th), s = Math.sin(-th);
      const fx = tmp.x * c + tmp.z * s, fz = -tmp.x * s + tmp.z * c, fy = tmp.y;
      for (let i = 0; i < N; i++) {
        const d = base[i * 3] * fx + base[i * 3 + 1] * fy + base[i * 3 + 2] * fz;
        if (d >= cosSw && cov[i] < 1) {
          cov[i] = 1;
          coveredN++;
          changed = true;
          // tint toward ice but keep the surface relief visible through the coverage
          const luma = 0.3 * colBase[i * 3] + 0.59 * colBase[i * 3 + 1] + 0.11 * colBase[i * 3 + 2];
          const k = 0.35 + 1.25 * luma;
          col[i * 3] = ICE[0] * k;
          col[i * 3 + 1] = ICE[1] * k;
          col[i * 3 + 2] = ICE[2] * k;
        }
      }
    });
    if (changed) colAttr.needsUpdate = covAttr.needsUpdate = true;
  }

  function emit(force = false) {
    const now = performance.now();
    if (!force && now - lastEmit < 140) return;
    lastEmit = now;
    listener?.({ coverage: coveredN / N, orbit: t / ORBIT_SEC });
  }

  function frame(dt: number) {
    if (coveredN / N > 0.93) {
      holdT += dt;
      if (holdT > 2.4) { resetCoverage(); t = 0; holdT = 0; }
    }
    step(dt);
    controls.update();
    renderer.render(scene, camera);
    emit();
  }

  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    frame(dt);
  };
  const start = () => { if (running || opts.reduced) return; running = true; last = performance.now(); raf = requestAnimationFrame(tick); };
  const stop = () => { running = false; cancelAnimationFrame(raf); };

  function resize() {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    const dpr = Math.min(window.devicePixelRatio || 1, opts.lowPower ? 1.5 : 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.9 ? 44 : 32;
    camera.updateProjectionMatrix();
    planetMat.uniforms.uSize.value = (opts.lowPower ? 3.0 : 2.7) * dpr;
    if (!running) { controls.update(); renderer.render(scene, camera); }
  }

  resize();
  if (opts.reduced) {
    // settle a static, well-covered frame
    for (let i = 0; i < 900; i++) step(0.05);
    controls.update();
    renderer.render(scene, camera);
    emit(true);
  } else start();

  const onVis = () => (document.hidden ? stop() : visible && start());
  document.addEventListener("visibilitychange", onVis);
  controls.addEventListener("change", () => { if (opts.reduced) renderer.render(scene, camera); });

  return {
    debugAdvance(seconds: number) {
      const n = Math.ceil(seconds / 0.05);
      for (let i = 0; i < n; i++) { if (coveredN / N > 0.93) break; step(0.05); }
      renderer.render(scene, camera); emit(true);
    },
    resize,
    setVisible(v) { visible = v; if (v && !document.hidden) start(); else stop(); },
    onStats(cb) { listener = cb; emit(true); },
    dispose() {
      stop();
      document.removeEventListener("visibilitychange", onVis);
      controls.dispose();
      planetGeo.dispose(); planetMat.dispose(); starGeo.dispose();
      satObjs.forEach((o) => { o.ringLine.geometry.dispose(); (o.ringLine.material as THREE.Material).dispose(); o.dot.geometry.dispose(); (o.dot.material as THREE.Material).dispose(); });
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

