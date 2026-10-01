import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { clamp, lerp } from "@/lib/math";
import { LAB, OBSTACLES } from "./labData";

/* ─────────────────────────────────────────────────────────────────────────
   PUSHBROOM LAB — a physically-based toy model of a 2D LiDAR in pushbroom mode.

   · A 270° scanner (like the SICK LMS111) is mounted at height H, its scan plane
     perpendicular to the direction of travel and pitched β below horizontal.
   · Every 1/f seconds a scan is fired: one ray per Δθ across the 270° field of view,
     each intersected with the ground plane and with a few small obstacles.
   · Along-track spacing is therefore v/f; across-track spacing grows as the rays
     leave nadir:  Δx(x) = (H·Δθ / sinβ) · (1 + (x·sinβ / H)²).

   Illustrative model — not flight data.
   ───────────────────────────────────────────────────────────────────────── */

export type LabParams = {
  rate: number; // scan rate (Hz)
  inc: number; // angular increment (deg)
  speed: number; // traverse speed (m/s)
  pitch: number; // scan-plane pitch below horizontal (deg)
  height: number; // sensor height (m)
};

export type LabStats = {
  scans: number;
  points: number;
  raysPerScan: number;
  progress: number;
  done: boolean;
  hits: number[];
};

const CAP = 620_000;

const PT_VERT = /* glsl */ `
  attribute vec3 aColor;
  uniform float uSize;
  varying vec3 vC;
  void main() {
    vC = aColor;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uSize;
  }
`;
const PT_FRAG = /* glsl */ `
  uniform float uAlpha;
  varying vec3 vC;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.25, d);
    gl_FragColor = vec4(vC, a * uAlpha);
  }
`;

export type LabScene = {
  setParams(p: LabParams): void;
  restart(): void;
  setVisible(v: boolean): void;
  resize(): void;
  zoom(dir: 1 | -1): void;
  resetView(): void;
  onStats(cb: (s: LabStats) => void): void;
  dispose(): void;
};

export function createPushbroomLab(
  canvas: HTMLCanvasElement,
  labels: HTMLElement,
  opts: { lowPower: boolean; reduced: boolean }
): LabScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !opts.lowPower, alpha: false, powerPreference: "high-performance" });
  const BG = new THREE.Color(0x0b0d13);
  renderer.setClearColor(BG, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 90);
  const HOME_WIDE = { pos: new THREE.Vector3(2.4, 3.3, -4.4), target: new THREE.Vector3(0.3, 0.0, 1.95) };
  const HOME_TALL = { pos: new THREE.Vector3(0.9, 4.9, -2.3), target: new THREE.Vector3(0.0, 0.0, 2.15) };
  let HOME = HOME_WIDE;
  let userMoved = false;
  camera.position.copy(HOME.pos);

  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(HOME.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.minDistance = 1.3;
  controls.maxDistance = 9.5;
  controls.maxPolarAngle = 1.49;
  controls.rotateSpeed = 0.65;
  controls.update();
  canvas.style.touchAction = "pan-y";

  /* ── static world: ground grid + obstacles ─────────────────────────── */
  const gridPts: number[] = [];
  const z0 = -1.6, z1 = LAB.len + 0.5;
  for (let x = -LAB.halfWidth; x <= LAB.halfWidth + 1e-6; x += 0.5) gridPts.push(x, 0, z0, x, 0, z1);
  for (let z = Math.ceil(z0 * 2) / 2; z <= z1 + 1e-6; z += 0.5) gridPts.push(-LAB.halfWidth, 0, z, LAB.halfWidth, 0, z);
  const gridGeo = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(gridPts, 3));
  const grid = new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: 0xece7db, transparent: true, opacity: 0.07 }));
  scene.add(grid);
  // centre-line + lateral ticks every 1 m
  const axisPts: number[] = [0, 0.001, z0, 0, 0.001, z1];
  for (let x = -3; x <= 3; x++) axisPts.push(x, 0.001, 0, x, 0.001, -0.14);
  const axis = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(axisPts, 3)),
    new THREE.LineBasicMaterial({ color: 0xece7db, transparent: true, opacity: 0.22 })
  );
  scene.add(axis);

  const laserCol = new THREE.Color(1.0, 0.36, 0.18);
  const obstacleMeshes: THREE.Object3D[] = [];
  const labelEls: HTMLElement[] = [];
  OBSTACLES.forEach((o) => {
    const g = new THREE.BoxGeometry(o.w, o.h, o.w);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: laserCol, transparent: true, opacity: 0.22, depthWrite: false }));
    m.position.set(o.x, o.h / 2, o.z);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: laserCol }));
    e.position.copy(m.position);
    // leader line so a 3 cm rock is easy to find
    const leader = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(o.x, o.h, o.z), new THREE.Vector3(o.x, 0.3, o.z)]),
      new THREE.LineBasicMaterial({ color: laserCol, transparent: true, opacity: 0.5 })
    );
    scene.add(m, e, leader);
    obstacleMeshes.push(m, e, leader);

    const el = document.createElement("div");
    el.className = "lab-label";
    el.innerHTML = `<b>${o.label}</b><span>x ${o.x.toFixed(2)} m</span>`;
    labels.appendChild(el);
    labelEls.push(el);
  });

  /* ── rover (wireframe) ─────────────────────────────────────────────── */
  const rover = new THREE.Group();
  const wire = new THREE.LineBasicMaterial({ color: 0xece7db, transparent: true, opacity: 0.55 });
  const body = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.5, 0.12, 0.78)), wire);
  body.position.set(0, 0.17, -0.22);
  rover.add(body);
  [[-0.3, -0.5], [0.3, -0.5], [-0.3, 0.05], [0.3, 0.05]].forEach(([x, z]) => {
    const w = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(0.1, 0.1, 0.07, 14)), wire);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.1, z);
    rover.add(w);
  });
  const mastGeo = new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
  const mast = new THREE.Line(mastGeo, wire);
  const head = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.11, 0.09, 0.11)), new THREE.LineBasicMaterial({ color: laserCol }));
  rover.add(mast, head);
  scene.add(rover);

  /* ── the scan itself: fan, line, beams, emitter ────────────────────── */
  const fanGeo = new THREE.BufferGeometry();
  fanGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(9), 3).setUsage(THREE.DynamicDrawUsage));
  fanGeo.setAttribute("aA", new THREE.BufferAttribute(new Float32Array([0, 1, 1]), 1));
  const fanMat = new THREE.ShaderMaterial({
    vertexShader: `attribute float aA; varying float vA; void main(){ vA=aA; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `varying float vA; uniform vec3 uC; void main(){ gl_FragColor = vec4(uC, pow(vA,2.4)*0.13); }`,
    uniforms: { uC: { value: laserCol } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const fan = new THREE.Mesh(fanGeo, fanMat);
  fan.frustumCulled = false;
  scene.add(fan);

  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3).setUsage(THREE.DynamicDrawUsage));
  const scanLine = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xffb08a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending }));
  scanLine.frustumCulled = false;
  scene.add(scanLine);

  const BEAMS = 26;
  const beamGeo = new THREE.BufferGeometry();
  beamGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(BEAMS * 6), 3).setUsage(THREE.DynamicDrawUsage));
  const beams = new THREE.LineSegments(beamGeo, new THREE.LineBasicMaterial({ color: laserCol, transparent: true, opacity: 0.17, blending: THREE.AdditiveBlending }));
  beams.frustumCulled = false;
  scene.add(beams);

  /* ── accumulated point cloud ───────────────────────────────────────── */
  const posArr = new Float32Array(CAP * 3);
  const colArr = new Float32Array(CAP * 3);
  const ptGeo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(posArr, 3).setUsage(THREE.DynamicDrawUsage);
  const colAttr = new THREE.BufferAttribute(colArr, 3).setUsage(THREE.DynamicDrawUsage);
  ptGeo.setAttribute("position", posAttr);
  ptGeo.setAttribute("aColor", colAttr);
  ptGeo.setDrawRange(0, 0);
  const dpr0 = Math.min(window.devicePixelRatio || 1, opts.lowPower ? 1.5 : 2);
  const ptMat = new THREE.ShaderMaterial({
    vertexShader: PT_VERT, fragmentShader: PT_FRAG,
    uniforms: { uSize: { value: 1.7 * dpr0 }, uAlpha: { value: 0.42 } },
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  });
  const cloud = new THREE.Points(ptGeo, ptMat);
  cloud.frustumCulled = false;
  scene.add(cloud);

  /* ── simulation state ──────────────────────────────────────────────── */
  let params: LabParams = { rate: 50, inc: 0.25, speed: 0.5, pitch: 45, height: 0.8 };
  let count = 0;
  let simT = 0;
  let scanIdx = 0;
  let zStart = 0;
  let zEnd = 0;
  let holdT = 0;
  let done = false;
  const hits = new Array(OBSTACLES.length).fill(0);
  let rays = { n: 0, dx: new Float32Array(0), dy: new Float32Array(0), dz: new Float32Array(0), tg: new Float32Array(0) };
  let listener: ((s: LabStats) => void) | null = null;
  let lastEmit = 0;
  let flushed = 0;
  let visible = true;
  let running = false;
  let raf = 0;
  let last = 0;

  // obstacle AABBs
  const box = OBSTACLES.map((o) => ({
    x0: o.x - o.w / 2, x1: o.x + o.w / 2, y0: 0, y1: o.h, z0: o.z - o.w / 2, z1: o.z + o.w / 2,
  }));

  function buildRays() {
    const { pitch, inc, height } = params;
    const beta = (pitch * Math.PI) / 180;
    const sinB = Math.sin(beta), cosB = Math.cos(beta);
    const nAll = Math.floor(LAB.fov / inc) + 1;
    const dx = new Float32Array(nAll), dy = new Float32Array(nAll), dz = new Float32Array(nAll), tg = new Float32Array(nAll);
    let n = 0;
    for (let j = 0; j < nAll; j++) {
      const phi = ((-LAB.fov / 2 + j * inc) * Math.PI) / 180;
      const c = Math.cos(phi), s = Math.sin(phi);
      const ry = -sinB * c;
      if (ry > -1e-4) continue; // never reaches the ground
      const t = height / -ry;
      if (t > LAB.range) continue; // beyond the 20 m range gate
      if (Math.abs(s * t) > LAB.halfWidth) continue; // outside the visualised swath
      dx[n] = s; dy[n] = ry; dz[n] = cosB * c; tg[n] = t; n++;
    }
    rays = { n, dx, dy, dz, tg };
  }

  function restart() {
    flushed = 0;
    count = 0; simT = 0; scanIdx = 0; holdT = 0; done = false;
    hits.fill(0);
    ptGeo.setDrawRange(0, 0);
    const beta = (params.pitch * Math.PI) / 180;
    const lead = params.height / Math.tan(beta); // ground distance from sensor to the scan line
    zStart = -0.35 - lead;
    zEnd = LAB.len + 0.15 - lead;
    buildRays();
    if (opts.reduced) fastForward();
  }

  /** Fire one scan with the sensor at (0, H, zs). */
  function fireScan(zs: number) {
    const { height } = params;
    const { n, dx, dy, dz, tg } = rays;
    for (let i = 0; i < n && count < CAP; i++) {
      let t = tg[i];
      let hit = -1;
      const ox = 0, oy = height, oz = zs;
      const rdx = dx[i], rdy = dy[i], rdz = dz[i];
      for (let b = 0; b < box.length; b++) {
        const B = box[b];
        // quick reject in z: the plane is nearly constant in z at ground level
        let tmin = 0, tmax = t;
        // x slab
        if (Math.abs(rdx) < 1e-9) { if (ox < B.x0 || ox > B.x1) continue; }
        else { let a = (B.x0 - ox) / rdx, c = (B.x1 - ox) / rdx; if (a > c) { const s = a; a = c; c = s; } tmin = Math.max(tmin, a); tmax = Math.min(tmax, c); if (tmin > tmax) continue; }
        // y slab
        { let a = (B.y0 - oy) / rdy, c = (B.y1 - oy) / rdy; if (a > c) { const s = a; a = c; c = s; } tmin = Math.max(tmin, a); tmax = Math.min(tmax, c); if (tmin > tmax) continue; }
        // z slab
        if (Math.abs(rdz) < 1e-9) { if (oz < B.z0 || oz > B.z1) continue; }
        else { let a = (B.z0 - oz) / rdz, c = (B.z1 - oz) / rdz; if (a > c) { const s = a; a = c; c = s; } tmin = Math.max(tmin, a); tmax = Math.min(tmax, c); if (tmin > tmax) continue; }
        if (tmin > 0 && tmin < t) { t = tmin; hit = b; }
      }
      const x = rdx * t, y = oy + rdy * t, z = oz + rdz * t;
      if (z > LAB.len + 0.3 || z < -0.6) continue;
      // a few millimetres of range noise so the raster never aliases
      const jn = (Math.random() - 0.5) * 0.004;
      const k = count * 3;
      posArr[k] = x + jn; posArr[k + 1] = Math.max(0, y + jn * 0.6); posArr[k + 2] = z + jn;
      if (hit >= 0) {
        hits[hit]++;
        colArr[k] = 1.0; colArr[k + 1] = 0.5; colArr[k + 2] = 0.3;
      } else {
        const u = clamp(t / 3.4, 0, 1); // nearer = brighter ice, farther = deeper blue
        colArr[k] = lerp(0.52, 0.08, u); colArr[k + 1] = lerp(0.84, 0.4, u); colArr[k + 2] = lerp(1.0, 0.78, u);
      }
      count++;
    }
    scanIdx++;
  }

  function fastForward() {
    const dt = 1 / params.rate;
    const steps = Math.floor((zEnd - zStart) / params.speed / dt);
    for (let i = 0; i <= steps; i++) fireScan(zStart + params.speed * dt * i);
    simT = steps * dt;
    done = true;
    flushPoints(0, count);
    updateRig(zEnd);
  }

  function flushPoints(from = flushed, to = count) {
    if (to <= from) return;
    posAttr.clearUpdateRanges(); colAttr.clearUpdateRanges();
    posAttr.addUpdateRange(from * 3, (to - from) * 3);
    colAttr.addUpdateRange(from * 3, (to - from) * 3);
    posAttr.needsUpdate = colAttr.needsUpdate = true;
    ptGeo.setDrawRange(0, to);
    flushed = to;
  }

  function updateRig(zs: number) {
    const { height, pitch } = params;
    const beta = (pitch * Math.PI) / 180;
    const lead = height / Math.tan(beta);
    rover.position.set(0, 0, zs);
    const m = mastGeo.getAttribute("position") as THREE.BufferAttribute;
    m.setXYZ(0, 0, 0.2, -0.3); m.setXYZ(1, 0, height, 0); m.needsUpdate = true;
    head.position.set(0, height, 0);
    // fan apex → ground line at z = zs + lead
    const f = fanGeo.getAttribute("position") as THREE.BufferAttribute;
    const zl = zs + lead;
    f.setXYZ(0, 0, height, zs); f.setXYZ(1, -LAB.halfWidth, 0.004, zl); f.setXYZ(2, LAB.halfWidth, 0.004, zl);
    f.needsUpdate = true;
    const l = lineGeo.getAttribute("position") as THREE.BufferAttribute;
    l.setXYZ(0, -LAB.halfWidth, 0.004, zl); l.setXYZ(1, LAB.halfWidth, 0.004, zl);
    l.needsUpdate = true;
    const b = beamGeo.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < BEAMS; i++) {
      const x = lerp(-LAB.halfWidth, LAB.halfWidth, i / (BEAMS - 1));
      b.setXYZ(i * 2, 0, height, zs);
      b.setXYZ(i * 2 + 1, x, 0.004, zl);
    }
    b.needsUpdate = true;
  }

  /* ── frame ─────────────────────────────────────────────────────────── */
  const v3 = new THREE.Vector3();
  function projectLabels(w: number, h: number) {
    OBSTACLES.forEach((o, i) => {
      v3.set(o.x, o.h + 0.17, o.z).project(camera);
      const el = labelEls[i];
      const behind = v3.z > 1;
      el.style.opacity = behind ? "0" : "1";
      el.style.transform = `translate(${(v3.x * 0.5 + 0.5) * w}px, ${(-v3.y * 0.5 + 0.5) * h}px) translate(-50%, -100%)`;
    });
  }

  function emit(force = false) {
    const now = performance.now();
    if (!force && now - lastEmit < 100) return;
    lastEmit = now;
    const total = Math.max(1e-6, zEnd - zStart);
    const zs = zStart + params.speed * simT;
    listener?.({
      scans: scanIdx,
      points: count,
      raysPerScan: rays.n,
      progress: done ? 1 : clamp((zs - zStart) / total, 0, 1),
      done,
      hits: hits.slice(),
    });
  }

  function frame(dt: number) {
    if (!done) {
      const total = (zEnd - zStart) / params.speed;
      // aim for a ~12 s run so slow traverses don't drag
      const scale = Math.max(1, total / 12);
      const prev = simT;
      simT = Math.min(total, simT + dt * scale);
      const step = 1 / params.rate;
      let k = Math.floor(prev / step) + 1;
      for (; k * step <= simT; k++) fireScan(zStart + params.speed * k * step);
      flushPoints();
      updateRig(zStart + params.speed * simT);
      if (simT >= total) { done = true; holdT = 0; }
    } else {
      holdT += dt;
      if (holdT > 3.2 && !opts.reduced) restart();
    }
    controls.update();
    renderer.render(scene, camera);
    projectLabels(canvas.clientWidth, canvas.clientHeight);
    emit(done && holdT < 0.2);
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
    const tall = w / h < 1.1;
    camera.fov = tall ? 58 : 40;
    camera.updateProjectionMatrix();
    if (tall !== (HOME === HOME_TALL) && !userMoved) {
      HOME = tall ? HOME_TALL : HOME_WIDE;
      camera.position.copy(HOME.pos);
      controls.target.copy(HOME.target);
    }
    ptMat.uniforms.uSize.value = 1.7 * dpr;
    if (opts.reduced || !running) { controls.update(); renderer.render(scene, camera); projectLabels(w, h); }
  }

  resize();
  restart();
  updateRig(zStart);
  if (!opts.reduced) start();
  else { renderer.render(scene, camera); projectLabels(canvas.clientWidth, canvas.clientHeight); emit(true); }
  controls.addEventListener("start", () => { userMoved = true; });
  controls.addEventListener("change", () => { if (opts.reduced) { renderer.render(scene, camera); projectLabels(canvas.clientWidth, canvas.clientHeight); } });

  const onVis = () => (document.hidden ? stop() : visible && start());
  document.addEventListener("visibilitychange", onVis);

  return {
    setParams(p) { params = p; restart(); updateRig(zStart); emit(true); },
    restart() { restart(); emit(true); },
    setVisible(v) { visible = v; if (v && !document.hidden) start(); else stop(); },
    resize,
    zoom(dir) {
      const d = camera.position.distanceTo(controls.target);
      const nd = clamp(d * (dir > 0 ? 0.8 : 1.25), controls.minDistance, controls.maxDistance);
      camera.position.sub(controls.target).setLength(nd).add(controls.target);
      controls.update();
    },
    resetView() { camera.position.copy(HOME.pos); controls.target.copy(HOME.target); controls.update(); },
    onStats(cb) { listener = cb; emit(true); },
    dispose() {
      stop();
      document.removeEventListener("visibilitychange", onVis);
      controls.dispose();
      [gridGeo, ptGeo, fanGeo, lineGeo, beamGeo].forEach((g) => g.dispose());
      scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(m)) m.forEach((x) => x.dispose()); else m?.dispose();
        (o as THREE.Mesh).geometry?.dispose?.();
      });
      obstacleMeshes.length = 0;
      labelEls.forEach((e) => e.remove());
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
