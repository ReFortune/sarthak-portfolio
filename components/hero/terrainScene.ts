import * as THREE from "three";
import { corridorX, heightAt, normalAt, raycast, rampColor, hash2, type Hit } from "@/lib/terrain";
import { clamp, damp, lerp, smoothstep } from "@/lib/math";

/* ─────────────────────────────────────────────────────────────────────────
   HERO TERRAIN — a LiDAR point cloud of a procedural planetary surface.

   · Four density tiers of points stream past as the rover traverses: rows that
     fall behind the camera are re-generated at the far end (CPU), so the GPU only
     ever draws ~90k static points.
   · A pushbroom scan plane sits ahead of the rover. Points behind it are "scanned"
     (dense, coloured by elevation/relief, with a hot after-glow); ahead of it only
     a sparse prior map is visible.
   · The pointer paints with light (world-space trail), a click sends a ranging ping.
   ───────────────────────────────────────────────────────────────────────── */

const BETA = 0.3; // scan-plane pitch below horizontal (rad)
const RIG = { camHeight: 6.0, headDrop: 1.45, headAhead: 2.2, pitch: -0.21, speed: 3.4 };
const TRAIL_N = 40;
const PING_N = 4;

type LayerSpec = {
  dx: number; // lateral spacing (m)
  dz: number; // along-track row spacing (m)
  zNear: number; // range relative to camera (m)
  zFar: number;
  xHalf: number; // half-width (m)
  size: number; // world-space point diameter (m)
  seed: number;
  fade: [number, number, number, number];
};

const DESKTOP_LAYERS: LayerSpec[] = [
  { dx: 0.06, dz: 0.14, zNear: 2, zFar: 21, xHalf: 11, size: 0.03, seed: 1000, fade: [2, 4.5, 18, 21] },
  { dx: 0.17, dz: 0.4, zNear: 18, zFar: 58, xHalf: 26, size: 0.085, seed: 2000, fade: [18, 23, 50, 58] },
  { dx: 0.46, dz: 1.1, zNear: 50, zFar: 140, xHalf: 62, size: 0.23, seed: 3000, fade: [50, 62, 122, 140] },
  { dx: 1.25, dz: 3.0, zNear: 120, zFar: 340, xHalf: 160, size: 0.62, seed: 4000, fade: [120, 150, 300, 340] },
];

/** Scale spacing up (fewer points) for small / low-power screens. */
function scaleLayers(specs: LayerSpec[], k: number): LayerSpec[] {
  return specs.map((s) => ({ ...s, dx: s.dx * k, dz: s.dz * k, size: s.size * Math.sqrt(k) }));
}

const VERT = /* glsl */ `
  #define TRAIL_N ${TRAIL_N}
  #define PING_N ${PING_N}
  uniform float uCamZ, uPxPerUnit, uSparse, uReveal, uGain, uWorldSize, uLineK, uSinB;
  uniform vec3 uHead, uN, uOrigin;
  uniform vec4 uFade;
  uniform vec4 uTrail[TRAIL_N];
  uniform vec4 uPing[PING_N];
  attribute float aSeed;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec3 p = position;
    float depth = max(0.25, -(modelViewMatrix * vec4(p, 1.0)).z);

    float rz = p.z - uCamZ;
    float fade = smoothstep(uFade.x, uFade.y, rz) * (1.0 - smoothstep(uFade.z, uFade.w, rz));

    // Pushbroom plane: s < 0 means "already scanned"
    float s = dot(p - uHead, uN);
    float gd = s / uSinB;                       // ≈ metres behind (−) / ahead (+) of the line, along the ground
    float behind = 1.0 - smoothstep(-0.12, 0.2, gd);
    float line = exp(-abs(gd) * uLineK);
    float tail = behind * exp(gd * 0.5);

    float keep = mix(step(aSeed, uSparse), 1.0, behind);

    // Boot reveal: a radial LiDAR ping that uncovers the world
    float rd = distance(p, uOrigin);
    float revealed = 1.0 - smoothstep(uReveal - 2.5, uReveal, rd);
    float ring = exp(-pow((rd - uReveal) / 1.4, 2.0)) * step(0.01, uReveal) * (1.0 - step(2000.0, uReveal));

    // Light-painted pointer trail + click pings
    float heat = 0.0;
    for (int i = 0; i < TRAIL_N; i++) {
      vec4 t = uTrail[i];
      vec2 d = p.xz - t.xy;
      heat = max(heat, t.z * exp(-dot(d, d) / (t.w * t.w)));
    }
    float ping = 0.0;
    for (int i = 0; i < PING_N; i++) {
      vec4 g = uPing[i];
      float r = distance(p.xz, g.xy);
      ping = max(ping, g.w * exp(-pow((r - g.z) / 0.8, 2.0)));
    }

    float hot = clamp(line + tail * 0.26 + heat * 0.95 + ping * 0.95 + ring, 0.0, 1.0);

    vec3 base = aColor * mix(1.25, 1.9, behind);
    vec3 hotCol = mix(vec3(1.0, 0.34, 0.16), vec3(1.0, 0.88, 0.74), smoothstep(0.6, 1.0, hot));
    vColor = mix(base, hotCol, pow(hot, 0.85));

    float fog = exp(-depth * 0.0042);
    float vis = mix(0.78, 1.0, behind);
    vAlpha = fade * keep * revealed * vis * mix(fog, 1.0, hot * 0.7) * uGain;

    p.y += heat * 0.05 + ping * 0.07;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    float size = uWorldSize * uPxPerUnit / depth;
    size *= (0.72 + 0.56 * aSeed) * (1.0 + 1.5 * hot);
    gl_PointSize = clamp(size, 1.0, 10.0);
  }
`;

const FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d2 = dot(c, c) * 4.0;
    float a = 0.65 * exp(-d2 * 3.4) + 0.35 * smoothstep(0.42, 0.0, d2);
    float alpha = vAlpha * a;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(vColor, alpha);
  }
`;

const FAN_VERT = /* glsl */ `
  attribute float aAlpha;
  varying float vA;
  void main() {
    vA = aAlpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const FAN_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying float vA;
  void main() { gl_FragColor = vec4(uColor, pow(vA, 3.0) * uIntensity); }
`;

const STAR_VERT = /* glsl */ `
  uniform float uTime, uPx, uGain;
  attribute float aSeed;
  varying float vA;
  void main() {
    float tw = 0.65 + 0.35 * sin(uTime * (0.6 + aSeed * 1.6) + aSeed * 40.0);
    vA = tw * (0.25 + 0.75 * aSeed) * uGain;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = (1.3 + aSeed * 1.9) * uPx;
  }
`;
const STAR_FRAG = /* glsl */ `
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.0, d);
    gl_FragColor = vec4(0.78, 0.88, 1.0, a * vA);
  }
`;

/* ── layer: a ring buffer of rows that follow the camera ─────────────────── */

class Layer {
  readonly points: THREE.Points;
  readonly material: THREE.ShaderMaterial;
  private readonly geo = new THREE.BufferGeometry();
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly seedAttr: Float32Array;
  private readonly cols: number;
  private readonly rows: number;
  private readonly slotRow: Int32Array;
  private readonly tmp: [number, number, number] = [0, 0, 0];
  readonly count: number;

  constructor(private readonly spec: LayerSpec, shared: Record<string, THREE.IUniform>) {
    this.cols = Math.ceil((spec.xHalf * 2) / spec.dx);
    this.rows = Math.ceil((spec.zFar - spec.zNear) / spec.dz) + 2;
    this.count = this.cols * this.rows;
    this.pos = new Float32Array(this.count * 3);
    this.col = new Float32Array(this.count * 3);
    this.seedAttr = new Float32Array(this.count);
    this.slotRow = new Int32Array(this.rows).fill(-2147483648);

    const pa = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    const ca = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    const sa = new THREE.BufferAttribute(this.seedAttr, 1).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute("position", pa);
    this.geo.setAttribute("aColor", ca);
    this.geo.setAttribute("aSeed", sa);

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        ...shared,
        uWorldSize: { value: spec.size },
        uFade: { value: new THREE.Vector4(...spec.fade) },
      },
    });
    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
  }

  /** Re-generate rows that have entered the window. Returns rows generated (for budgeting). */
  update(camZ: number, maxRows: number): number {
    const { dz, zNear } = this.spec;
    const j0 = Math.floor((camZ + zNear) / dz);
    let done = 0;
    const touched: number[] = [];
    for (let k = 0; k < this.rows && done < maxRows; k++) {
      const j = j0 + k;
      const slot = ((j % this.rows) + this.rows) % this.rows;
      if (this.slotRow[slot] === j) continue;
      this.fillRow(slot, j);
      this.slotRow[slot] = j;
      touched.push(slot);
      done++;
    }
    if (done) this.flush(touched);
    return done;
  }

  debugSummary() {
    let minZ = Infinity, maxZ = -Infinity, minY = Infinity, maxY = -Infinity, nan = 0, zero = 0;
    for (let i = 0; i < this.count; i++) {
      const x = this.pos[i * 3], y = this.pos[i * 3 + 1], z = this.pos[i * 3 + 2];
      if (Number.isNaN(x + y + z)) { nan++; continue; }
      if (x === 0 && y === 0 && z === 0) { zero++; continue; }
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    return { count: this.count, cols: this.cols, rows: this.rows, filled: this.filled, minZ, maxZ, minY, maxY, nan, zero, size: this.spec.size };
  }

  get filled() {
    let n = 0;
    for (let i = 0; i < this.rows; i++) if (this.slotRow[i] !== -2147483648) n++;
    return n / this.rows;
  }

  private fillRow(slot: number, j: number) {
    const { dx, dz, seed } = this.spec;
    const { cols, pos, col, seedAttr, tmp } = this;
    const base = slot * cols;
    for (let i = 0; i < cols; i++) {
      const z = (j + hash2(i, j, seed + 1)) * dz;
      const x = corridorX(z) + (i + hash2(i, j, seed + 2) - cols / 2) * dx;
      const y = heightAt(x, z);
      const n = normalAt(x, z, y, Math.max(0.06, dx * 0.7));

      // low, raking light from the viewer's left/ahead (+x is the viewer's left) → long crater shadows
      const lit = clamp(n[0] * 0.72 + n[1] * 0.3 + n[2] * 0.56, 0, 1);
      const relief = 0.26 + 0.95 * lit;
      const elev = clamp((y + 5) / 12, 0, 1);
      rampColor(0.1 + elev * 0.62 + lit * 0.3, tmp);

      const o = (base + i) * 3;
      pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
      col[o] = tmp[0] * relief;
      col[o + 1] = tmp[1] * relief;
      col[o + 2] = tmp[2] * relief;
      seedAttr[base + i] = hash2(i, j, seed + 9);
    }
  }

  private flush(slots: number[]) {
    const pa = this.geo.getAttribute("position") as THREE.BufferAttribute;
    const ca = this.geo.getAttribute("aColor") as THREE.BufferAttribute;
    const sa = this.geo.getAttribute("aSeed") as THREE.BufferAttribute;
    pa.clearUpdateRanges(); ca.clearUpdateRanges(); sa.clearUpdateRanges();
    for (const s of slots) {
      pa.addUpdateRange(s * this.cols * 3, this.cols * 3);
      ca.addUpdateRange(s * this.cols * 3, this.cols * 3);
      sa.addUpdateRange(s * this.cols, this.cols);
    }
    pa.needsUpdate = ca.needsUpdate = sa.needsUpdate = true;
  }

  dispose() {
    this.geo.dispose();
    this.material.dispose();
  }
}

/* ── public API ──────────────────────────────────────────────────────────── */

export type TerrainOptions = {
  reduced: boolean;
  lowPower: boolean;
  onReady?: () => void;
};

export type Readout = { range: number; elev: number; bearing: number };

export type TerrainScene = {
  resize(): void;
  setPointer(nx: number, ny: number, active: boolean): void;
  ping(): void;
  setScroll(p: number): void;
  setVisible(v: boolean): void;
  intro(): void;
  getReadout(): Readout | null;
  getPointCount(): number;
  dispose(): void;
  /** Dev/testing hook: advance the simulation by `seconds` without rendering. */
  debugAdvance(seconds: number): void;
  debugInfo(): unknown;
  debugLayers(mask: boolean[]): void;
};

export function createTerrainScene(canvas: HTMLCanvasElement, opts: TerrainOptions): TerrainScene {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
  });
  const INK = new THREE.Color(0x06070b);
  renderer.setClearColor(INK, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 620);
  camera.rotation.order = "YXZ";

  /* shared uniforms */
  const U = {
    uCamZ: { value: 0 },
    uPxPerUnit: { value: 1000 },
    uSparse: { value: 0.72 },
    uReveal: { value: 0 },
    uGain: { value: 1 },
    uLineK: { value: 3.2 },
    uSinB: { value: Math.sin(BETA) },
    uHead: { value: new THREE.Vector3() },
    uN: { value: new THREE.Vector3(0, 0.14, 0.99) },
    uOrigin: { value: new THREE.Vector3() },
    uTrail: { value: Array.from({ length: TRAIL_N }, () => new THREE.Vector4(0, 0, 0, 1)) },
    uPing: { value: Array.from({ length: PING_N }, () => new THREE.Vector4(0, 0, 0, 0)) },
  };

  const specs = opts.lowPower ? scaleLayers(DESKTOP_LAYERS, 1.45) : DESKTOP_LAYERS;
  const layers = specs.map((s) => new Layer(s, U as unknown as Record<string, THREE.IUniform>));
  layers.forEach((l) => scene.add(l.points));

  /* stars */
  const starCount = opts.lowPower ? 700 : 1500;
  const starGeo = new THREE.BufferGeometry();
  {
    const p = new Float32Array(starCount * 3);
    const sd = new Float32Array(starCount);
    for (let i = 0; i < starCount; i++) {
      const u = hash2(i, 1, 77);
      const v = hash2(i, 2, 77);
      const th = u * Math.PI * 2;
      const el = Math.asin(0.04 + v * 0.96); // upper hemisphere only
      const r = 300;
      p[i * 3] = Math.cos(th) * Math.cos(el) * r;
      p[i * 3 + 1] = Math.sin(el) * r;
      p[i * 3 + 2] = Math.sin(th) * Math.cos(el) * r;
      sd[i] = hash2(i, 3, 77);
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(p, 3));
    starGeo.setAttribute("aSeed", new THREE.BufferAttribute(sd, 1));
  }
  const starU = { uTime: { value: 0 }, uPx: { value: 1 }, uGain: { value: 1 } };
  const stars = new THREE.Points(
    starGeo,
    new THREE.ShaderMaterial({
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      uniforms: starU,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  stars.frustumCulled = false;
  stars.renderOrder = -1;
  scene.add(stars);

  /* scan fan + beams + line (hits recomputed every 2nd–3rd frame) */
  const FAN_N = opts.lowPower ? 40 : 72; // rays in the fan: each is a terrain raycast (~50 µs)
  const fanPos = new Float32Array((FAN_N + 1) * 3);
  const fanAlpha = new Float32Array(FAN_N + 1);
  fanAlpha[0] = 0;
  for (let i = 1; i <= FAN_N; i++) fanAlpha[i] = 1;
  const fanIdx: number[] = [];
  for (let k = 1; k < FAN_N; k++) fanIdx.push(0, k, k + 1);
  const fanGeo = new THREE.BufferGeometry();
  fanGeo.setAttribute("position", new THREE.BufferAttribute(fanPos, 3).setUsage(THREE.DynamicDrawUsage));
  fanGeo.setAttribute("aAlpha", new THREE.BufferAttribute(fanAlpha, 1));
  fanGeo.setIndex(fanIdx);
  const laser = new THREE.Color(1.0, 0.36, 0.18);
  const fanMat = new THREE.ShaderMaterial({
    vertexShader: FAN_VERT,
    fragmentShader: FAN_FRAG,
    uniforms: { uColor: { value: laser }, uIntensity: { value: 0.16 } },
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const fan = new THREE.Mesh(fanGeo, fanMat);
  fan.frustumCulled = false;
  scene.add(fan);

  const BEAMS = opts.lowPower ? 20 : 36;
  const beamPos = new Float32Array(BEAMS * 2 * 3);
  const beamAlpha = new Float32Array(BEAMS * 2);
  for (let i = 0; i < BEAMS; i++) { beamAlpha[i * 2] = 0; beamAlpha[i * 2 + 1] = 1; }
  const beamGeo = new THREE.BufferGeometry();
  beamGeo.setAttribute("position", new THREE.BufferAttribute(beamPos, 3).setUsage(THREE.DynamicDrawUsage));
  beamGeo.setAttribute("aAlpha", new THREE.BufferAttribute(beamAlpha, 1));
  const beamMat = new THREE.ShaderMaterial({
    vertexShader: FAN_VERT, fragmentShader: FAN_FRAG,
    uniforms: { uColor: { value: laser }, uIntensity: { value: 0.38 } },
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const beams = new THREE.LineSegments(beamGeo, beamMat);
  beams.frustumCulled = false;
  scene.add(beams);

  /* emitter glow at the scan head */
  const emitter = new THREE.Points(
    new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(3), 3)),
    new THREE.ShaderMaterial({
      vertexShader: `uniform float uSize; void main(){ gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_PointSize = uSize; }`,
      fragmentShader: `void main(){ float d = length(gl_PointCoord-0.5)*2.0; float a = pow(smoothstep(1.0,0.0,d),2.2); gl_FragColor = vec4(1.0,0.5,0.3,a*0.9); }`,
      uniforms: { uSize: { value: 26 } },
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    })
  );
  emitter.frustumCulled = false;
  scene.add(emitter);

  /* ── state ─────────────────────────────────────────────────────────── */
  const st = {
    t: 0,
    camZ: 0,
    groundY: heightAt(corridorX(0), 0),
    heading: 0,
    speed: opts.reduced ? 0 : RIG.speed,
    scroll: 0,
    visible: true,
    introT: -1, // <0 = not started
    introDone: false,
    ready: false,
    width: 1,
    height: 1,
    dpr: 1,
    pointer: { x: 0, y: 0, active: false, sx: 0, sy: 0 },
    hit: null as Hit | null,
    lastHit: { x: 0, z: 0, valid: false },
    trailIdx: 0,
    trailBirth: new Float32Array(TRAIL_N).fill(-100),
    pingIdx: 0,
    pingBirth: new Float32Array(PING_N).fill(-100),
    pingPos: Array.from({ length: PING_N }, () => ({ x: 0, z: 0 })),
    nextAmbientPing: 3.2,
    readout: null as Readout | null,
    fanTick: 0,
  };

  const hitTmp: Hit = { t: 0, x: 0, y: 0, z: 0 };
  const fanHit: Hit = { t: 0, x: 0, y: 0, z: 0 };
  const cam = { x: 0, y: 0, z: 0 };

  // Pixel-ratio ceiling. The frame monitor below lowers it (never raises it) on slow devices.
  let dprCap = opts.lowPower ? 1.5 : 2;

  function resize() {
    const w = canvas.clientWidth || canvas.parentElement?.clientWidth || 1;
    const h = canvas.clientHeight || canvas.parentElement?.clientHeight || 1;
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    st.width = w; st.height = h; st.dpr = dpr;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    const aspect = w / h;
    camera.fov = aspect < 0.85 ? 62 : aspect < 1.3 ? 50 : 42;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    U.uPxPerUnit.value = (h * dpr) / (2 * Math.tan((camera.fov * Math.PI) / 360));
    starU.uPx.value = dpr * (w < 700 ? 0.9 : 1.15);
  }

  /* camera rig: follows the corridor + terrain, looks ahead, pitches up with scroll */
  function updateRig(dt: number) {
    const t = st.t;
    const scrollBoost = 1 + st.scroll * 2.2;
    st.camZ += st.speed * scrollBoost * dt;
    const z = st.camZ;

    const weave = opts.reduced ? 0 : Math.sin(t * 0.17) * 2.4;
    const cx = corridorX(z) + weave;
    st.groundY = damp(st.groundY, heightAt(cx, z), 2.2, dt);
    const lookX = corridorX(z + 14);
    const targetHeading = Math.atan2(lookX - corridorX(z), 14);
    st.heading = damp(st.heading, targetHeading, 1.6, dt);

    const pointerYaw = -st.pointer.sx * 0.05;
    const pointerPitch = st.pointer.sy * 0.025;

    const bob = opts.reduced ? 0 : Math.sin(t * 0.7) * 0.09;
    const camH = RIG.camHeight + st.scroll * 4 + bob;
    const minY = heightAt(cx, z) + 3.2;
    cam.x = cx;
    cam.y = Math.max(st.groundY + camH, minY);
    cam.z = z;
    camera.position.set(cam.x, cam.y, cam.z);

    // three's camera looks down -Z; the rover travels toward +Z, hence the π offset.
    const pitch = lerp(RIG.pitch, 0.32, smoothstep(0, 1, st.scroll)) + pointerPitch;
    camera.rotation.set(pitch, st.heading + Math.PI + pointerYaw, 0);

    /* scan head: just ahead of and below the camera */
    const fwdX = Math.sin(st.heading);
    const fwdZ = Math.cos(st.heading);
    const head = U.uHead.value;
    head.set(cam.x + fwdX * RIG.headAhead, cam.y - RIG.headDrop, cam.z + fwdZ * RIG.headAhead);

    // plane normal = up-forward (perpendicular to lateral axis + scan direction)
    U.uN.value.set(fwdX * Math.sin(BETA), Math.cos(BETA), fwdZ * Math.sin(BETA)).normalize();

    U.uCamZ.value = cam.z;
    emitter.position.copy(head);
    (emitter.material as THREE.ShaderMaterial).uniforms.uSize.value = 20 * st.dpr * (0.85 + 0.15 * Math.sin(t * 6));
    camera.updateMatrixWorld();
  }

  /* recompute the fan / beam geometry from ray hits against the terrain */
  function updateFan() {
    const head = U.uHead.value;
    const fwdX = Math.sin(st.heading);
    const fwdZ = Math.cos(st.heading);
    const rx = fwdZ, rz = -fwdX; // right vector
    const ux = fwdX * Math.cos(BETA), uy = -Math.sin(BETA), uz = fwdZ * Math.cos(BETA);
    const half = 1.0; // ±57°
    const gy = st.groundY;
    fanPos[0] = head.x; fanPos[1] = head.y; fanPos[2] = head.z;
    let beamI = 0;
    const beamStep = Math.max(1, Math.floor(FAN_N / BEAMS));
    for (let k = 0; k < FAN_N; k++) {
      const phi = lerp(-half, half, k / (FAN_N - 1));
      const c = Math.cos(phi), s = Math.sin(phi);
      const dx = ux * c + rx * s, dy = uy * c, dz = uz * c + rz * s;
      const est = (head.y - gy) / Math.max(0.02, -dy);
      const hit = raycast(head.x, head.y, head.z, dx, dy, dz, Math.max(0.5, est * 0.5), est * 1.7 + 6, fanHit);
      let hx: number, hy: number, hz: number;
      if (hit) { hx = hit.x; hy = hit.y + 0.03; hz = hit.z; }
      else { const t = Math.min(est, 60); hx = head.x + dx * t; hy = head.y + dy * t; hz = head.z + dz * t; }
      const o = (k + 1) * 3;
      fanPos[o] = hx; fanPos[o + 1] = hy; fanPos[o + 2] = hz;
      if (k % beamStep === 0 && beamI < BEAMS) {
        const b = beamI * 6;
        beamPos[b] = head.x; beamPos[b + 1] = head.y; beamPos[b + 2] = head.z;
        beamPos[b + 3] = hx; beamPos[b + 4] = hy; beamPos[b + 5] = hz;
        beamI++;
      }
    }
    (fanGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (beamGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
  }

  /* pointer → terrain hit → painted trail */
  const ndc = new THREE.Vector2();
  const ray = new THREE.Raycaster();
  function updatePointer(dt: number) {
    const p = st.pointer;
    // smooth the pointer for the parallax; raw for painting
    p.sx = damp(p.sx, p.active ? p.x : 0, 4, dt);
    p.sy = damp(p.sy, p.active ? p.y : 0, 4, dt);

    // age trail
    const life = 1.7;
    for (let i = 0; i < TRAIL_N; i++) {
      const age = st.t - st.trailBirth[i];
      const v = U.uTrail.value[i];
      v.z = age >= life ? 0 : Math.pow(1 - age / life, 1.6);
    }
    if (!p.active || opts.reduced) { st.hit = null; st.readout = null; return; }

    ndc.set(p.x, p.y);
    ray.setFromCamera(ndc, camera);
    const o = ray.ray.origin, d = ray.ray.direction;
    const hit = raycast(o.x, o.y, o.z, d.x, d.y, d.z, 1.2, 150, hitTmp);
    if (!hit) { st.hit = null; st.readout = null; st.lastHit.valid = false; return; }
    st.hit = hit;
    const head = U.uHead.value;
    const range = Math.hypot(hit.x - head.x, hit.y - head.y, hit.z - head.z);
    st.readout = { range, elev: hit.y, bearing: Math.atan2(hit.x - head.x, hit.z - head.z) };

    const radius = clamp(0.055 * hit.t, 0.3, 3.2);
    const stamp = (x: number, z: number) => {
      const i = st.trailIdx;
      st.trailIdx = (st.trailIdx + 1) % TRAIL_N;
      st.trailBirth[i] = st.t;
      U.uTrail.value[i].set(x, z, 1, radius);
    };
    if (st.lastHit.valid) {
      const dxh = hit.x - st.lastHit.x, dzh = hit.z - st.lastHit.z;
      const dist = Math.hypot(dxh, dzh);
      const n = Math.min(6, Math.floor(dist / (radius * 0.6)));
      for (let k = 1; k <= n; k++) stamp(st.lastHit.x + (dxh * k) / (n + 1), st.lastHit.z + (dzh * k) / (n + 1));
    }
    stamp(hit.x, hit.z);
    st.lastHit.x = hit.x; st.lastHit.z = hit.z; st.lastHit.valid = true;
  }

  function emitPing(x: number, z: number) {
    const i = st.pingIdx;
    st.pingIdx = (st.pingIdx + 1) % PING_N;
    st.pingBirth[i] = st.t;
    st.pingPos[i].x = x; st.pingPos[i].z = z;
  }
  function updatePings() {
    for (let i = 0; i < PING_N; i++) {
      const age = st.t - st.pingBirth[i];
      const life = 3.4;
      const v = U.uPing.value[i];
      if (age < 0 || age > life) { v.w = 0; continue; }
      v.set(st.pingPos[i].x, st.pingPos[i].z, age * 26, Math.pow(1 - age / life, 1.4));
    }
  }

  /* generate initial rows in budgeted chunks so the main thread never stalls */
  function prefill(budgetRows: number) {
    let allDone = true;
    for (const l of layers) {
      l.update(st.camZ, budgetRows);
      if (l.filled < 0.999) allDone = false;
    }
    return allDone;
  }

  function frame(dt: number) {
    st.t += dt;
    starU.uTime.value = st.t;

    const filled = prefill(st.ready ? 14 : 10);
    if (!st.ready && filled) {
      st.ready = true;
      opts.onReady?.();
    }
    if (!st.ready) { renderer.render(scene, camera); return; }

    updateRig(dt);
    U.uOrigin.value.set(cam.x, cam.y, cam.z);

    // intro: radial boot scan reveals the world
    if (st.introT >= 0 && !st.introDone) {
      st.introT += dt;
      const k = clamp(st.introT / 2.6, 0, 1);
      U.uReveal.value = (1 - Math.pow(1 - k, 2.4)) * 240;
      if (k >= 1) { st.introDone = true; U.uReveal.value = 1e5; }
    } else if (st.introT < 0) {
      U.uReveal.value = 0;
    }

    // fade the terrain out as the hero leaves the viewport (saves fill + reads as dissolve)
    U.uGain.value = 1 - smoothstep(0.65, 1, st.scroll) * 0.8;
    starU.uGain.value = 1.0 + st.scroll * 0.8;

    if (!opts.reduced && st.t > st.nextAmbientPing && st.introDone) {
      emitPing(cam.x + Math.sin(st.heading) * 2, cam.z + Math.cos(st.heading) * 2);
      st.nextAmbientPing = st.t + 7.5;
    }

    updatePointer(dt);
    updatePings();
    st.fanTick++;
    if (st.fanTick % (opts.lowPower ? 3 : 2) === 0 || opts.reduced) updateFan();
    renderer.render(scene, camera);
  }

  /* ── loop ──────────────────────────────────────────────────────────── */
  let raf = 0;
  let last = 0;
  let running = false;
  // Adaptive quality: average the real frame time over ~1.5 s windows once the intro is done;
  // two consecutive slow windows (<≈35 fps) step the pixel ratio down by 0.5 (floor 1).
  const mon = { acc: 0, n: 0, slow: 0, skip: 0 };
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    const raw = (now - last) / 1000 || 0.016;
    const dt = Math.min(0.05, raw);
    last = now;
    frame(dt);
    if (!st.introDone || raw > 0.25) return; // ignore the intro and tab-switch / GC hitches
    if (mon.skip > 0) { mon.skip--; return; }
    mon.acc += raw;
    if (++mon.n >= 90) {
      const avg = mon.acc / mon.n;
      mon.acc = 0; mon.n = 0;
      mon.slow = avg > 0.029 ? mon.slow + 1 : 0;
      if (mon.slow >= 2 && dprCap > 1 && st.dpr > 1) {
        dprCap = Math.max(1, dprCap - 0.5);
        mon.slow = 0;
        mon.skip = 30; // let the new size settle before measuring again
        resize();
      }
    }
  };
  const start = () => {
    if (running || opts.reduced) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  };
  const stop = () => {
    running = false;
    cancelAnimationFrame(raf);
  };

  resize();
  if (opts.reduced) {
    // Static poster: prime every row, reveal fully, draw one still frame.
    let guard = 0;
    while (!prefill(400) && guard++ < 8) { /* keep priming */ }
    st.ready = true;
    st.introT = 99; st.introDone = true; U.uReveal.value = 1e5;
    st.t = 4;
    U.uCamZ.value = 0;
    frame(0.016);
    frame(0.016);
    opts.onReady?.();
  } else {
    start();
  }

  const onVis = () => (document.hidden ? stop() : st.visible && start());
  document.addEventListener("visibilitychange", onVis);

  return {
    resize() {
      resize();
      if (opts.reduced) frame(0.016);
    },
    setPointer(nx, ny, active) {
      st.pointer.x = nx; st.pointer.y = ny;
      if (!active) st.lastHit.valid = false;
      st.pointer.active = active;
    },
    ping() {
      if (st.hit) emitPing(st.hit.x, st.hit.z);
      else emitPing(cam.x + Math.sin(st.heading) * 2, cam.z + Math.cos(st.heading) * 2);
    },
    setScroll(p) { st.scroll = clamp(p, 0, 1); },
    setVisible(v) {
      st.visible = v;
      if (v && !document.hidden) start(); else stop();
    },
    intro() {
      if (st.introT < 0) st.introT = 0;
    },
    getReadout: () => st.readout,
    getPointCount: () => layers.reduce((n, l) => n + l.count, 0),
    debugLayers(mask: boolean[]) {
      layers.forEach((l, i) => (l.points.visible = mask[i] !== false));
    },
    debugInfo() {
      return { camZ: st.camZ, cam: { ...cam }, heading: st.heading, pxPerUnit: U.uPxPerUnit.value, reveal: U.uReveal.value, head: U.uHead.value.toArray(), n: U.uN.value.toArray(), layers: layers.map((l) => l.debugSummary()) };
    },
    debugAdvance(seconds: number) {
      const n = Math.ceil(seconds / 0.033);
      for (let i = 0; i < n; i++) frame(0.033);
    },
    dispose() {
      stop();
      document.removeEventListener("visibilitychange", onVis);
      layers.forEach((l) => l.dispose());
      starGeo.dispose();
      (stars.material as THREE.Material).dispose();
      fanGeo.dispose(); fanMat.dispose(); beamGeo.dispose(); beamMat.dispose();
      emitter.geometry.dispose(); (emitter.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
