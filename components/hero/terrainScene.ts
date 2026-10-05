import * as THREE from "three";
import { corridorX, heightAt, normalAt, raycast, rampColor, hash2, type Hit } from "@/lib/terrain";
import { clamp, damp, lerp, smoothstep } from "@/lib/math";
import { RoutePlanner, createPlan, type RoutePlan } from "./routePlanner";
import type { PlanReadout } from "@/lib/store";

/* ─────────────────────────────────────────────────────────────────────────
   HERO TERRAIN — a LiDAR point cloud of a procedural planetary surface.

   · Four density tiers of points stream past as the rover traverses: rows that
     fall behind the camera are re-generated at the far end (CPU), so the GPU only
     ever draws ~90k static points.
   · A pushbroom scan plane sits ahead of the rover. Points behind it are "scanned"
     (dense, coloured by elevation/relief, with a hot after-glow); ahead of it only
     a sparse prior map is visible.
   · The pointer paints with light (world-space trail), a click sends a ranging ping.
   · A route planner works on the same height field: once a second it plans the way
     across the terrain ahead (avoiding steep crater walls) and the route is drawn over
     the cloud, with the steep ground it avoids outlined in orange.
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

/* ── route: a ribbon along the planned path (constant width on screen), a dark stroke under it, diamonds at the
      waypoints, and a contour around the steep ground it avoids ── */

const RIB_VERT = /* glsl */ `
  uniform vec2 uRes;
  uniform float uWidth, uGain, uTime, uReveal, uShow, uSinB, uFlow;
  uniform vec3 uHead, uN;
  attribute vec3 aPrev, aNext;
  attribute float aSide, aS;
  varying float vSide, vA, vPulse;

  vec2 toPx(vec4 c) { return c.xy / c.w * uRes * 0.5; }

  void main() {
    mat4 mvp = projectionMatrix * modelViewMatrix;
    vec4 c0 = mvp * vec4(position, 1.0);
    vec2 p0 = toPx(c0);
    vec2 d = toPx(mvp * vec4(aNext, 1.0)) - toPx(mvp * vec4(aPrev, 1.0));
    d = dot(d, d) > 1e-4 ? normalize(d) : vec2(0.0, 1.0);
    vec2 px = p0 + vec2(-d.y, d.x) * aSide * uWidth * 0.5;
    gl_Position = vec4(px / (uRes * 0.5) * c0.w, c0.z, c0.w);

    float depth = max(0.25, -(modelViewMatrix * vec4(position, 1.0)).z);
    float near = smoothstep(6.0, 13.0, depth);
    float rev = 1.0 - smoothstep(uReveal - 9.0, uReveal, aS);   // the plan sweeps out from the rover when it first appears
    float far = 1.0 - smoothstep(uShow * 0.62, uShow, aS);      // and thins out with distance
    float s = dot(position - uHead, uN) / uSinB;
    float committed = 1.0 - smoothstep(-0.2, 0.5, s);           // brighter where the ground is already scanned
    float wave = 0.5 + 0.5 * sin((aS - uTime * 9.0) * 0.8);     // a pulse streams along the route, away from the rover
    vPulse = wave * wave * wave * uFlow;
    vSide = aSide;
    vA = near * rev * far * uGain * (0.8 + 0.2 * committed) * (0.72 + 0.28 * vPulse);
  }
`;
const RIB_FRAG = /* glsl */ `
  varying float vSide, vA, vPulse;
  void main() {
    float e = abs(vSide);
    float core = smoothstep(0.32, 0.0, e);
    float body = exp(-e * e * 4.0);
    float a = vA * (1.0 * core + 0.5 * body);
    if (a < 0.004) discard;
    vec3 col = mix(vec3(0.66, 0.9, 1.0), vec3(1.0, 0.97, 0.92), clamp(vPulse * 0.9 + core * 0.35, 0.0, 1.0));
    gl_FragColor = vec4(col, a);
  }
`;
const RIB_UNDER_FRAG = /* glsl */ `
  varying float vSide, vA, vPulse;
  void main() {
    float a = vA * 0.7 * smoothstep(1.0, 0.25, abs(vSide));
    if (a < 0.004) discard;
    gl_FragColor = vec4(0.024, 0.027, 0.043, a);
  }
`;

const WAY_VERT = /* glsl */ `
  uniform float uPxPerUnit, uGain, uReveal, uShow, uSize;
  attribute float aS;
  varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float depth = max(0.25, -mv.z);
    gl_Position = projectionMatrix * mv;
    float rev = 1.0 - smoothstep(uReveal - 6.0, uReveal, aS);
    float far = 1.0 - smoothstep(uShow * 0.7, uShow, aS);
    vA = rev * far * uGain;
    gl_PointSize = clamp(uSize * uPxPerUnit / depth, 7.0, 26.0);
  }
`;
const WAY_FRAG = /* glsl */ `
  varying float vA;
  void main() {
    vec2 c = (gl_PointCoord - 0.5) * 2.0;
    float d = abs(c.x) + abs(c.y);                       // a diamond
    float ring = smoothstep(1.0, 0.88, d) - smoothstep(0.62, 0.5, d);
    float dot_ = smoothstep(0.26, 0.12, d);
    float a = vA * (0.95 * ring + 0.8 * dot_);
    if (a < 0.004) discard;
    gl_FragColor = vec4(0.86, 0.97, 1.0, a);
  }
`;

const CON_VERT = /* glsl */ `
  uniform vec2 uRes;
  uniform float uWidth, uGain, uCamZ, uConGain;
  attribute vec3 aPrev, aNext;
  attribute float aSide, aW;
  varying float vSide, vA;

  vec2 toPx(vec4 c) { return c.xy / c.w * uRes * 0.5; }

  void main() {
    mat4 mvp = projectionMatrix * modelViewMatrix;
    vec4 c0 = mvp * vec4(position, 1.0);
    vec2 d = toPx(mvp * vec4(aNext, 1.0)) - toPx(mvp * vec4(aPrev, 1.0));
    d = dot(d, d) > 1e-4 ? normalize(d) : vec2(0.0, 1.0);
    vec2 px = toPx(c0) + vec2(-d.y, d.x) * aSide * uWidth * 0.5;
    gl_Position = vec4(px / (uRes * 0.5) * c0.w, c0.z, c0.w);

    float rz = position.z - uCamZ;
    float fade = smoothstep(8.0, 16.0, rz) * (1.0 - smoothstep(44.0, 78.0, rz));
    vSide = aSide;
    vA = fade * uConGain * uGain * (0.15 + 0.7 * aW);
  }
`;
const CON_FRAG = /* glsl */ `
  varying float vSide, vA;
  void main() {
    float a = vA * smoothstep(1.0, 0.0, abs(vSide));
    if (a < 0.004) discard;
    gl_FragColor = vec4(1.0, 0.36, 0.18, a);
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
  onPlan?: (p: PlanReadout) => void;
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
  getPlan(): PlanReadout | null;
  getPointCount(): number;
  dispose(): void;
  /** Dev/testing hook: advance the simulation by `seconds` without rendering. */
  debugAdvance(seconds: number): void;
  debugInfo(): unknown;
  debugRoute(): unknown;
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

  /* ── route planner: the route, a dark halo under it, waypoint diamonds, and outlines of the steep ground it avoids ── */
  const planner = new RoutePlanner({
    step: opts.lowPower ? 0.8 : 0.5,
    ahead: opts.lowPower ? 96 : 110,
    show: opts.lowPower ? 70 : 76,
  });
  const plan: RoutePlan = createPlan(opts.lowPower ? 200 : 400, opts.lowPower ? 320 : 700);
  const MAXP = plan.s.length;
  const MAXS = plan.seg.length / 7;
  const MAXW = plan.wayK.length;
  const routePos = new Float32Array(MAXP * 3); // the route as shown (x, y, z per vertex)
  const routeFrom = new Float32Array(MAXP * 3);
  const routeTo = new Float32Array(MAXP * 3);
  // ribbon: two vertices per route vertex (one on each side), each knowing its neighbours so the shader can find the direction
  const ribPos = new Float32Array(MAXP * 2 * 3);
  const ribPrev = new Float32Array(MAXP * 2 * 3);
  const ribNext = new Float32Array(MAXP * 2 * 3);
  const ribSide = new Float32Array(MAXP * 2);
  const ribS = new Float32Array(MAXP * 2);
  const ribIdx = new Uint16Array((MAXP - 1) * 6);
  for (let k = 0; k < MAXP; k++) {
    ribSide[2 * k] = -1;
    ribSide[2 * k + 1] = 1;
    if (k < MAXP - 1) {
      const o = k * 6, a = 2 * k;
      ribIdx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], o);
    }
  }
  const routeGeo = new THREE.BufferGeometry();
  routeGeo.setAttribute("position", new THREE.BufferAttribute(ribPos, 3).setUsage(THREE.DynamicDrawUsage));
  routeGeo.setAttribute("aPrev", new THREE.BufferAttribute(ribPrev, 3).setUsage(THREE.DynamicDrawUsage));
  routeGeo.setAttribute("aNext", new THREE.BufferAttribute(ribNext, 3).setUsage(THREE.DynamicDrawUsage));
  routeGeo.setAttribute("aSide", new THREE.BufferAttribute(ribSide, 1));
  routeGeo.setAttribute("aS", new THREE.BufferAttribute(ribS, 1).setUsage(THREE.DynamicDrawUsage));
  routeGeo.setIndex(new THREE.BufferAttribute(ribIdx, 1));
  routeGeo.setDrawRange(0, 0);
  const RU = {
    uTime: { value: 0 },
    uReveal: { value: 0 },
    uShow: { value: planner.show },
    uFlow: { value: opts.reduced ? 0 : 1 },
    uConGain: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
  };
  const shared = { uPxPerUnit: U.uPxPerUnit, uGain: U.uGain, uSinB: U.uSinB, uHead: U.uHead, uN: U.uN, uCamZ: U.uCamZ, ...RU };
  const routeMat = new THREE.ShaderMaterial({
    vertexShader: RIB_VERT,
    fragmentShader: RIB_FRAG,
    uniforms: { ...shared, uWidth: { value: 10 } },
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const underMat = new THREE.ShaderMaterial({
    vertexShader: RIB_VERT,
    fragmentShader: RIB_UNDER_FRAG,
    uniforms: { ...shared, uWidth: { value: 16 } },
    transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
  });
  const routeMesh = new THREE.Mesh(routeGeo, routeMat);
  const routeUnder = new THREE.Mesh(routeGeo, underMat);
  routeUnder.renderOrder = 10;
  routeMesh.renderOrder = 11;

  const wayPos = new Float32Array(MAXW * 3);
  const wayS = new Float32Array(MAXW);
  const wayGeo = new THREE.BufferGeometry();
  wayGeo.setAttribute("position", new THREE.BufferAttribute(wayPos, 3).setUsage(THREE.DynamicDrawUsage));
  wayGeo.setAttribute("aS", new THREE.BufferAttribute(wayS, 1).setUsage(THREE.DynamicDrawUsage));
  wayGeo.setDrawRange(0, 0);
  const wayMat = new THREE.ShaderMaterial({
    vertexShader: WAY_VERT,
    fragmentShader: WAY_FRAG,
    uniforms: { ...shared, uSize: { value: 0.95 } },
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const wayPts = new THREE.Points(wayGeo, wayMat);
  wayPts.renderOrder = 12;

  // steep-ground contour: a short ribbon per segment (4 vertices each, both ends know the segment's direction)
  const conPos = new Float32Array(MAXS * 4 * 3);
  const conPrev = new Float32Array(MAXS * 4 * 3);
  const conNext = new Float32Array(MAXS * 4 * 3);
  const conSide = new Float32Array(MAXS * 4);
  const conW = new Float32Array(MAXS * 4);
  const conIdx = new Uint16Array(MAXS * 6);
  for (let k = 0; k < MAXS; k++) {
    const v = k * 4;
    conSide.set([-1, 1, -1, 1], v);
    conIdx.set([v, v + 1, v + 2, v + 1, v + 3, v + 2], k * 6);
  }
  const conGeo = new THREE.BufferGeometry();
  conGeo.setAttribute("position", new THREE.BufferAttribute(conPos, 3).setUsage(THREE.DynamicDrawUsage));
  conGeo.setAttribute("aPrev", new THREE.BufferAttribute(conPrev, 3).setUsage(THREE.DynamicDrawUsage));
  conGeo.setAttribute("aNext", new THREE.BufferAttribute(conNext, 3).setUsage(THREE.DynamicDrawUsage));
  conGeo.setAttribute("aSide", new THREE.BufferAttribute(conSide, 1));
  conGeo.setAttribute("aW", new THREE.BufferAttribute(conW, 1).setUsage(THREE.DynamicDrawUsage));
  conGeo.setIndex(new THREE.BufferAttribute(conIdx, 1));
  conGeo.setDrawRange(0, 0);
  const conMat = new THREE.ShaderMaterial({
    vertexShader: CON_VERT,
    fragmentShader: CON_FRAG,
    uniforms: { ...shared, uWidth: { value: 2.4 } },
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const conMesh = new THREE.Mesh(conGeo, conMat);
  conMesh.renderOrder = 9;

  for (const o of [conMesh, routeUnder, routeMesh, wayPts]) {
    o.frustumCulled = false;
    scene.add(o);
  }

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
    RU.uRes.value.set(w * dpr, h * dpr);
    routeMat.uniforms.uWidth.value = (w < 700 ? 10 : 13) * dpr;
    underMat.uniforms.uWidth.value = (w < 700 ? 15 : 19) * dpr;
    conMat.uniforms.uWidth.value = 2.4 * dpr;
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

  /* ── route planner: state + per-frame update ─────────────────────────── */
  const route = {
    ready: false, // terrain window cached
    shape: false, // a route exists
    n: 0,
    last: -99, // sim time and rover z of the last plan
    lastZ: -1e9,
    morph: 1, // 0 → 1 while the route on screen glides to the new plan
    revealT: -1, // <0 = not started; the plan sweeps out from the rover when it first appears
    reveal: 0,
    wayN: 0,
    wayK: new Int32Array(MAXW),
    readout: null as PlanReadout | null,
  };
  const REPLAN_S = opts.lowPower ? 1.4 : 1.0;
  const REPLAN_M = 4;
  const MORPH_S = 0.55;

  /** Put the route on screen: positions are `from → to` by `e`; the ribbon and the waypoints follow. */
  function writeRoute(e: number) {
    const n = route.n;
    for (let k = 0; k < n * 3; k++) routePos[k] = routeFrom[k] + (routeTo[k] - routeFrom[k]) * e;
    for (let k = 0; k < n; k++) {
      const p = k * 3;
      const a = Math.max(0, k - 1) * 3;
      const b = Math.min(n - 1, k + 1) * 3;
      for (let side = 0; side < 2; side++) {
        const o = (2 * k + side) * 3;
        ribPos[o] = routePos[p]; ribPos[o + 1] = routePos[p + 1]; ribPos[o + 2] = routePos[p + 2];
        ribPrev[o] = routePos[a]; ribPrev[o + 1] = routePos[a + 1]; ribPrev[o + 2] = routePos[a + 2];
        ribNext[o] = routePos[b]; ribNext[o + 1] = routePos[b + 1]; ribNext[o + 2] = routePos[b + 2];
      }
    }
    (routeGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (routeGeo.getAttribute("aPrev") as THREE.BufferAttribute).needsUpdate = true;
    (routeGeo.getAttribute("aNext") as THREE.BufferAttribute).needsUpdate = true;
    for (let w = 0; w < route.wayN; w++) {
      const k = route.wayK[w] * 3;
      wayPos[w * 3] = routePos[k];
      wayPos[w * 3 + 1] = routePos[k + 1] + 0.55;
      wayPos[w * 3 + 2] = routePos[k + 2];
    }
    (wayGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
  }

  /** The ribbon starts where the route comes into view, a few metres ahead of the camera. */
  function trimRoute() {
    const zMin = cam.z + 6;
    let k0 = 0;
    while (k0 < route.n - 2 && routePos[(k0 + 1) * 3 + 2] < zMin) k0++;
    routeGeo.setDrawRange(k0 * 6, Math.max(0, route.n - 1 - k0) * 6);
  }

  function replanRoute(): boolean {
    if (!planner.plan(cam.x, cam.z, plan) || plan.n < 2) return false;
    const n = plan.n;
    const had = route.shape;
    const prevN = route.n;
    // morph source: the route as it is on screen, sampled at each new vertex's z (z only ever increases along a route)
    let j = 0;
    for (let k = 0; k < n; k++) {
      const x = plan.pos[k * 3], y = plan.pos[k * 3 + 1], z = plan.pos[k * 3 + 2];
      let fx = x, fy = y;
      if (had && prevN > 1) {
        while (j + 1 < prevN && routePos[(j + 1) * 3 + 2] < z) j++;
        if (j + 1 < prevN && routePos[j * 3 + 2] <= z) {
          const za = routePos[j * 3 + 2], zb = routePos[(j + 1) * 3 + 2];
          const t = zb > za ? (z - za) / (zb - za) : 0;
          fx = routePos[j * 3] + (routePos[(j + 1) * 3] - routePos[j * 3]) * t;
          fy = routePos[j * 3 + 1] + (routePos[(j + 1) * 3 + 1] - routePos[j * 3 + 1]) * t;
        }
      }
      routeFrom[k * 3] = fx; routeFrom[k * 3 + 1] = fy; routeFrom[k * 3 + 2] = z;
      routeTo[k * 3] = x; routeTo[k * 3 + 1] = y; routeTo[k * 3 + 2] = z;
      ribS[2 * k] = ribS[2 * k + 1] = plan.s[k];
    }
    route.n = n;
    route.shape = true;
    route.morph = had ? 0 : 1;
    route.wayN = plan.wayN;
    for (let w = 0; w < plan.wayN; w++) {
      route.wayK[w] = plan.wayK[w];
      wayS[w] = plan.s[plan.wayK[w]];
    }
    wayGeo.setDrawRange(0, plan.wayN);
    (routeGeo.getAttribute("aS") as THREE.BufferAttribute).needsUpdate = true;
    (wayGeo.getAttribute("aS") as THREE.BufferAttribute).needsUpdate = true;

    for (let q = 0; q < plan.segN; q++) {
      const o = q * 7;
      for (let v = 0; v < 4; v++) {
        const e = (q * 4 + v) * 3;
        const end = v < 2 ? 0 : 3; // vertices 0, 1 sit at the segment's start, 2, 3 at its end
        conPos[e] = plan.seg[o + end]; conPos[e + 1] = plan.seg[o + end + 1]; conPos[e + 2] = plan.seg[o + end + 2];
        conPrev[e] = plan.seg[o]; conPrev[e + 1] = plan.seg[o + 1]; conPrev[e + 2] = plan.seg[o + 2];
        conNext[e] = plan.seg[o + 3]; conNext[e + 1] = plan.seg[o + 4]; conNext[e + 2] = plan.seg[o + 5];
        conW[q * 4 + v] = plan.seg[o + 6];
      }
    }
    conGeo.setDrawRange(0, plan.segN * 6);
    for (const name of ["position", "aPrev", "aNext", "aW"]) (conGeo.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;

    writeRoute(had ? 0 : 1);
    trimRoute();
    route.last = st.t;
    route.lastZ = cam.z;
    route.readout = { length: plan.length, maxSlope: plan.maxSlope, limit: planner.limitDeg, blocked: plan.blocked, ms: plan.ms, plans: planner.plans };
    opts.onPlan?.(route.readout);
    return true;
  }

  function updateRoute(dt: number) {
    RU.uTime.value = st.t;
    if (!route.ready) {
      route.ready = planner.prime(cam.z, 6);
      return;
    }
    planner.prime(cam.z, 4); // keep the window topped up as the rover advances
    if (st.introDone && (!route.shape || st.t - route.last >= REPLAN_S || cam.z - route.lastZ >= REPLAN_M)) {
      if (replanRoute() && route.revealT < 0) route.revealT = 0;
    }
    if (route.revealT >= 0 && route.reveal < 1e3) {
      route.revealT += dt;
      const k = clamp(route.revealT / 1.9, 0, 1);
      route.reveal = k >= 1 ? 1e3 : (1 - Math.pow(1 - k, 2.2)) * 120;
      RU.uReveal.value = route.reveal;
      RU.uConGain.value = smoothstep(0.1, 0.9, k);
    }
    if (route.morph < 1) {
      route.morph = Math.min(1, route.morph + dt / MORPH_S);
      writeRoute(smoothstep(0, 1, route.morph));
    }
    if (route.shape) trimRoute();
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
    updateRoute(dt);

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
    // the poster shows the planned route too (no sweep, no flowing pulse)
    planner.prime(cam.z, 1e9);
    route.ready = true;
    if (replanRoute()) {
      route.revealT = 99;
      route.reveal = 1e3;
      RU.uReveal.value = 1e3;
      RU.uConGain.value = 1;
    }
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
    getPlan: () => route.readout,
    getPointCount: () => layers.reduce((n, l) => n + l.count, 0),
    debugLayers(mask: boolean[]) {
      layers.forEach((l, i) => (l.points.visible = mask[i] !== false));
    },
    debugRoute() {
      const a: number[][] = [];
      for (let k = 0; k < Math.min(route.n, 400); k += 20) a.push([k, ribS[2 * k], routePos[k * 3], routePos[k * 3 + 1], routePos[k * 3 + 2]]);
      return { n: route.n, reveal: route.reveal, morph: route.morph, cam: { ...cam }, head: U.uHead.value.toArray(), samples: a, plan: route.readout, segN: plan.segN, wayN: route.wayN };
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
      routeGeo.dispose(); routeMat.dispose(); underMat.dispose();
      wayGeo.dispose(); wayMat.dispose();
      conGeo.dispose(); conMat.dispose();
      emitter.geometry.dispose(); (emitter.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
