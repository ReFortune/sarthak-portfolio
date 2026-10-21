import * as THREE from "three";
import { corridorX, heightAt, normalAt, raycast, hash2, rampColor, type Hit } from "@/lib/terrain";
import { clamp, damp, lerp, smoothstep } from "@/lib/math";
import { RoutePlanner, createPlan } from "@/components/hero/routePlanner";
import { BETA, DESKTOP_LAYERS, FAN_FRAG, FAN_VERT, Layer, PING_N, STAR_FRAG, STAR_VERT, TRAIL_N, scaleLayers, type LayerSpec } from "@/components/hero/terrainScene";
import type { PlanReadout } from "@/lib/store";

/* ─────────────────────────────────────────────────────────────────────────
   TRAVERSE — the hero's LiDAR world, scrubbed by scroll.

   The same procedural terrain, point shader, scan plane and route planner as the hero, seen from behind
   the rover instead of from its mast. One plan covers the whole traverse; scrolling drives the rover along it.

     A  Survey  the pushbroom line sweeps the ground: dense where it has been, sparse ahead. Waypoints appear.
     B  Plan    the route draws itself out from the rover, with the steep ground it avoids outlined.
     C  Build   the rover is scanned into existence, wheels first.
     D  Arrive  the last waypoint is reached and a ranging ping goes out.
   ───────────────────────────────────────────────────────────────────────── */

/** World z where the traverse starts: well away from the hero's opening view, so the two never show the same ground. */
const Z_START = 640;
/** Rows (m) the planner searches, and the part of the plan that is returned and drawn. */
const AHEAD = 196;
const SHOW = 176;
/** Each stage ends at one of these fractions of the route, marked by a waypoint diamond. */
const STAGE_END = [0.25, 0.5, 0.75, 1] as const;
/** The fastest the rover is scrubbed along the route (m/s), so the ground can keep up with a fast scroll. */
const MAX_SPEED = 56;
/** Points acquired per metre: 25 Hz × 541 points per scan, at the hero rover's 3.4 m/s. */
const POINTS_PER_M = (25 * 541) / 3.4;
/** The rover stops this far short of each waypoint's diamond and counts as having reached it (m). */
const ARRIVE = 4;
/** Distance (m) over which the route ribbon thins out ahead of the rover. */
const ROUTE_SHOW = 84;

export type Telemetry = {
  /** 0–3: survey, plan, build, arrive. */
  stage: number;
  /** Metres driven along the route. */
  distance: number;
  /** Surface height under the rover (m). */
  elevation: number;
  /** Steepest slope under or just ahead of the rover (degrees). */
  slope: number;
  /** Simulated points acquired so far. */
  points: number;
  /** Metres to the next waypoint, or null once the last is reached. */
  nextWaypoint: number | null;
  /** What the planner reported for the route (null until planned). */
  plan: PlanReadout | null;
};

export type TraverseOptions = {
  reduced: boolean;
  lowPower: boolean;
  /** Portrait only: where the rover should sit on screen (fraction of the height from the top), clear of the copy. Undefined on wide screens. */
  getRoverY?: () => number | undefined;
  onReady?: () => void;
  onTelemetry?: (t: Telemetry) => void;
};

export type TraverseScene = {
  setProgress(p: number): void;
  setPointer(nx: number, ny: number, active: boolean): void;
  setVisible(v: boolean): void;
  intro(): void;
  resize(): void;
  dispose(): void;
  /** Dev/testing hook: where things are, in world space and on screen (pixels). */
  debugInfo(): unknown;
};

/* ── camera poses, one per stage, relative to the rover ──
   `back`, `up` and `side` place the camera (metres); `ry` is where the rover should sit on screen, as a fraction of the
   height from the top. The pitch follows from that and the field of view, so the framing holds at every aspect ratio. */
type Pose = { back: number; up: number; side: number; ry: number };
const POSES: Pose[] = [
  { back: 13, up: 4.6, side: 0, ry: 0.66 }, // survey: low and behind, the horizon in view and the scan line ahead
  { back: 11, up: 12, side: 0, ry: 0.78 }, // plan: high, to read the route and the ground it avoids
  { back: 8.4, up: 3.7, side: 2.6, ry: 0.62 }, // build: close, a three-quarter view of the rover
  { back: 15, up: 6.2, side: 0, ry: 0.66 }, // arrive: pulled back, the last waypoint ahead
];
function poseAt(p: number, out: Pose): Pose {
  const f = clamp(p, 0, 0.9999) * 4;
  const k = Math.floor(f);
  const t = smoothstep(0.55, 1, f - k); // hold each stage's pose, then move on to the next
  const a = POSES[k];
  const b = POSES[Math.min(3, k + 1)];
  out.back = lerp(a.back, b.back, t);
  out.up = lerp(a.up, b.up, t);
  out.side = lerp(a.side, b.side, t);
  out.ry = lerp(a.ry, b.ry, t);
  return out;
}

/* ── the rover, as a LiDAR scan of itself: points sampled over its surfaces ── */
const WHEEL_R = 0.46;
const WHEEL_HW = 0.17;
const WHEELS: ReadonlyArray<readonly [number, number]> = [[1.07, 0.95], [-1.07, 0.95], [1.07, -0.95], [-1.07, -0.95]];
/** Where the scan plane starts, in rover space (the sensor head on the mast). */
const HEAD = new THREE.Vector3(0, 2.42, 0.85);
const ROVER_TOP = 2.62;

function buildRover(density: number) {
  const pos: number[] = [], col: number[] = [], cen: number[] = [], seed: number[] = [], ys: number[] = [], hot: number[] = [], wheel: number[] = [];
  let k = 0;
  const rnd = () => hash2(k++, 5, 4242);
  const rgb: [number, number, number] = [0, 0, 0];
  const light = new THREE.Vector3(0.72, 0.3, 0.56).normalize();

  const add = (x: number, y: number, z: number, nx: number, ny: number, nz: number, tone: number, h: number, w = 0, cx = 0, cy = 0, cz = 0) => {
    const lit = clamp(nx * light.x + ny * light.y + nz * light.z, 0, 1);
    rampColor(0.52 + lit * 0.4, rgb);
    const m = tone * (0.5 + 0.8 * lit);
    // pale towards bone, so the rover reads as an object against the blue ground
    col.push(lerp(rgb[0], 0.93, 0.4) * m, lerp(rgb[1], 0.9, 0.4) * m, lerp(rgb[2], 0.84, 0.4) * m);
    pos.push(x, y, z);
    cen.push(cx, cy, cz);
    seed.push(rnd());
    ys.push(clamp(y / ROVER_TOP, 0, 1));
    hot.push(h);
    wheel.push(w);
  };

  const box = (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, tone: number, h = 0, dens = density) => {
    const faces: [number, number, number, number][] = [
      [1, 0, 0, sy * sz], [-1, 0, 0, sy * sz], [0, 1, 0, sx * sz], [0, -1, 0, sx * sz], [0, 0, 1, sx * sy], [0, 0, -1, sx * sy],
    ];
    for (const [nx, ny, nz, area] of faces) {
      const n = Math.max(2, Math.round(area * dens));
      for (let i = 0; i < n; i++) {
        const u = rnd() - 0.5, v = rnd() - 0.5;
        if (nx) add(cx + (nx * sx) / 2, cy + u * sy, cz + v * sz, nx, 0, 0, tone, h);
        else if (ny) add(cx + u * sx, cy + (ny * sy) / 2, cz + v * sz, 0, ny, 0, tone, h);
        else add(cx + u * sx, cy + v * sy, cz + (nz * sz) / 2, 0, 0, nz, tone, h);
      }
    }
  };

  // chassis, axles, bumper, solar deck
  box(0, 0.98, 0, 1.55, 0.5, 2.5, 0.9);
  box(0, WHEEL_R, 0.95, 2.1, 0.1, 0.1, 0.7);
  box(0, WHEEL_R, -0.95, 2.1, 0.1, 0.1, 0.7);
  box(0, 0.8, 1.38, 1.7, 0.12, 0.12, 0.8);
  box(0, 1.28, -0.5, 1.5, 0.05, 1.15, 0.75, 0, density * 0.8);

  // wheels: tread denser than the faces, so each reads as a ring
  for (const [wx, wz] of WHEELS) {
    const side = Math.round(2 * Math.PI * WHEEL_R * 2 * WHEEL_HW * density * 1.5);
    for (let i = 0; i < side; i++) {
      const th = rnd() * Math.PI * 2;
      add(wx + (rnd() * 2 - 1) * WHEEL_HW, WHEEL_R + Math.cos(th) * WHEEL_R, wz + Math.sin(th) * WHEEL_R, 0, Math.cos(th), Math.sin(th), 0.62, 0, 1, wx, WHEEL_R, wz);
    }
    const cap = Math.round(Math.PI * WHEEL_R * WHEEL_R * density);
    for (const sx of [-1, 1]) {
      for (let i = 0; i < cap; i++) {
        const th = rnd() * Math.PI * 2;
        const r = WHEEL_R * Math.sqrt(rnd());
        add(wx + sx * WHEEL_HW, WHEEL_R + Math.cos(th) * r, wz + Math.sin(th) * r, sx, 0, 0, r < 0.12 ? 1 : 0.8, 0, 1, wx, WHEEL_R, wz);
      }
    }
  }

  // mast and sensor head (the head glows: it is the laser)
  const mastN = Math.round(2 * Math.PI * 0.05 * 1.2 * density * 1.5);
  for (let i = 0; i < mastN; i++) {
    const th = rnd() * Math.PI * 2;
    add(Math.cos(th) * 0.05, 1.23 + rnd() * 1.2, HEAD.z + Math.sin(th) * 0.05, Math.cos(th), 0, Math.sin(th), 0.8, 0);
  }
  box(0, HEAD.y, HEAD.z - 0.1, 0.62, 0.28, 0.36, 1, 0.3, density * 1.6);
  box(0, HEAD.y, HEAD.z + 0.1, 0.34, 0.16, 0.06, 1, 1, density * 3);

  const count = pos.length / 3;
  return {
    count,
    pos: new Float32Array(pos),
    color: new Float32Array(col),
    center: new Float32Array(cen),
    seed: new Float32Array(seed),
    y: new Float32Array(ys),
    hot: new Float32Array(hot),
    wheel: new Float32Array(wheel),
  };
}

const ROVER_VERT = /* glsl */ `
  uniform float uPxPerUnit, uSize, uGain, uBuilt, uSpin, uTime;
  attribute vec3 aColor, aCenter;
  attribute float aSeed, aY, aHot, aWheel;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    if (aWheel > 0.5) {
      vec3 q = p - aCenter;
      float c = cos(uSpin), s = sin(uSpin);
      p = aCenter + vec3(q.x, q.y * c - q.z * s, q.y * s + q.z * c);
    }
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float depth = max(0.25, -mv.z);
    gl_Position = projectionMatrix * mv;

    // built by a laser line that sweeps up from the wheels; before it passes, only a sparse ghost shows
    float yS = uBuilt * 1.3 - 0.14;
    float done = 1.0 - smoothstep(yS - 0.02, yS + 0.02, aY);
    float band = exp(-pow((aY - yS) / 0.05, 2.0)) * step(0.002, uBuilt) * (1.0 - step(0.998, uBuilt));
    float ghost = step(aSeed, 0.34);
    float vis = max(max(done, ghost * 0.75), band);
    float hot = clamp(band + aHot * (0.72 + 0.28 * sin(uTime * 6.0)), 0.0, 1.0);

    vec3 hotCol = mix(vec3(1.0, 0.34, 0.16), vec3(1.0, 0.88, 0.74), smoothstep(0.6, 1.0, hot));
    vColor = mix(aColor * 1.4, hotCol, pow(hot, 0.85));
    vAlpha = vis * uGain;
    float size = uSize * uPxPerUnit / depth * (0.8 + 0.4 * aSeed) * (1.0 + 1.2 * hot);
    gl_PointSize = clamp(size, 1.4, 8.0);
  }
`;
const SOFT_FRAG = /* glsl */ `
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

/* ── route: a ribbon along the plan (constant width on screen) with a dark stroke under it, diamonds at the
      waypoints, and an outline around the steep ground it avoids. The same look as the hero's, measured from the rover ── */

const RIB_VERT = /* glsl */ `
  uniform vec2 uRes;
  uniform float uWidth, uGain, uTime, uReveal, uShow, uS0, uFlow;
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
    float ahead = aS - uS0;                                       // metres ahead of the rover, along the route
    float behind = smoothstep(1.0, 2.8, ahead);                   // the ribbon leaves the rover's nose; nothing is drawn behind it
    float rev = 1.0 - smoothstep(uReveal - 9.0, uReveal, ahead);  // the plan sweeps out from the rover
    float far = 1.0 - smoothstep(uShow * 0.62, uShow, ahead);     // and thins out with distance
    float near = smoothstep(2.0, 5.0, depth);
    float wave = 0.5 + 0.5 * sin((aS - uTime * 9.0) * 0.8);       // a pulse streams along the route, away from the rover
    vPulse = wave * wave * wave * uFlow;
    vSide = aSide;
    vA = behind * rev * far * near * uGain * (0.72 + 0.28 * vPulse);
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
  uniform float uPxPerUnit, uGain, uSize, uS0, uArrive;
  attribute float aS;
  varying float vA, vReached;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float depth = max(0.25, -mv.z);
    gl_Position = projectionMatrix * mv;
    vReached = 1.0 - smoothstep(uArrive + 0.5, uArrive + 3.0, aS - uS0);   // filled as the rover pulls in
    vA = uGain;
    gl_PointSize = clamp(uSize * uPxPerUnit / depth, 9.0, 30.0);
  }
`;
const WAY_FRAG = /* glsl */ `
  varying float vA, vReached;
  void main() {
    vec2 c = (gl_PointCoord - 0.5) * 2.0;
    float d = abs(c.x) + abs(c.y);                       // a diamond
    float ring = smoothstep(1.0, 0.88, d) - smoothstep(0.62, 0.5, d);
    float dot_ = smoothstep(0.26, 0.12, d);
    float fill = smoothstep(0.62, 0.5, d) * vReached;
    float a = vA * (0.95 * ring + 0.8 * dot_ + 0.5 * fill);
    if (a < 0.004) discard;
    gl_FragColor = vec4(mix(vec3(0.86, 0.97, 1.0), vec3(1.0, 0.36, 0.18), vReached), a);
  }
`;
const CON_VERT = /* glsl */ `
  uniform vec2 uRes;
  uniform float uWidth, uGain, uRoverZ, uConGain;
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

    float ahead = position.z - uRoverZ;
    float fade = smoothstep(-6.0, 4.0, ahead) * (1.0 - smoothstep(48.0, 84.0, ahead));
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

/** Layers for this view: like the hero's, but the nearest one is wider and starts closer, to carpet the ground around the rover. */
const LAYERS: LayerSpec[] = DESKTOP_LAYERS.map((l, i) =>
  i === 0 ? { ...l, dx: 0.075, dz: 0.16, zNear: 2, zFar: 26, xHalf: 14, size: 0.032, fade: [2, 4.5, 22, 26] as [number, number, number, number] } : l
);

export function createTraverseScene(canvas: HTMLCanvasElement, opts: TraverseOptions): TraverseScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
  renderer.setClearColor(new THREE.Color(0x06070b), 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 620);

  /* shared uniforms (the same set the hero's point shader reads) */
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

  const specs = opts.lowPower ? scaleLayers(LAYERS, 1.45) : LAYERS;
  const layers = specs.map((s) => new Layer(s, U as unknown as Record<string, THREE.IUniform>));
  layers.forEach((l) => scene.add(l.points));

  /* stars */
  const starCount = opts.lowPower ? 700 : 1500;
  const starGeo = new THREE.BufferGeometry();
  {
    const p = new Float32Array(starCount * 3);
    const sd = new Float32Array(starCount);
    for (let i = 0; i < starCount; i++) {
      const th = hash2(i, 1, 77) * Math.PI * 2;
      const el = Math.asin(0.04 + hash2(i, 2, 77) * 0.96); // upper hemisphere only
      p[i * 3] = Math.cos(th) * Math.cos(el) * 300;
      p[i * 3 + 1] = Math.sin(el) * 300;
      p[i * 3 + 2] = Math.sin(th) * Math.cos(el) * 300;
      sd[i] = hash2(i, 3, 77);
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(p, 3));
    starGeo.setAttribute("aSeed", new THREE.BufferAttribute(sd, 1));
  }
  const starU = { uTime: { value: 0 }, uPx: { value: 1 }, uGain: { value: 1 } };
  const stars = new THREE.Points(
    starGeo,
    new THREE.ShaderMaterial({ vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, uniforms: starU, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  stars.frustumCulled = false;
  stars.renderOrder = -1;
  scene.add(stars);

  /* scan fan + beams + emitter glow, from the sensor head */
  const FAN_N = opts.lowPower ? 40 : 64;
  const fanPos = new Float32Array((FAN_N + 1) * 3);
  const fanAlpha = new Float32Array(FAN_N + 1).fill(1);
  fanAlpha[0] = 0;
  const fanIdx: number[] = [];
  for (let k = 1; k < FAN_N; k++) fanIdx.push(0, k, k + 1);
  const fanGeo = new THREE.BufferGeometry();
  fanGeo.setAttribute("position", new THREE.BufferAttribute(fanPos, 3).setUsage(THREE.DynamicDrawUsage));
  fanGeo.setAttribute("aAlpha", new THREE.BufferAttribute(fanAlpha, 1));
  fanGeo.setIndex(fanIdx);
  const laser = new THREE.Color(1.0, 0.36, 0.18);
  const FAN_I = 0.16, BEAM_I = 0.38;
  const fanMat = new THREE.ShaderMaterial({
    vertexShader: FAN_VERT, fragmentShader: FAN_FRAG,
    uniforms: { uColor: { value: laser }, uIntensity: { value: FAN_I } },
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const fan = new THREE.Mesh(fanGeo, fanMat);
  fan.frustumCulled = false;
  fan.renderOrder = 1;
  scene.add(fan);

  const BEAMS = opts.lowPower ? 20 : 36;
  const beamPos = new Float32Array(BEAMS * 2 * 3);
  const beamAlpha = new Float32Array(BEAMS * 2);
  for (let i = 0; i < BEAMS; i++) beamAlpha[i * 2 + 1] = 1;
  const beamGeo = new THREE.BufferGeometry();
  beamGeo.setAttribute("position", new THREE.BufferAttribute(beamPos, 3).setUsage(THREE.DynamicDrawUsage));
  beamGeo.setAttribute("aAlpha", new THREE.BufferAttribute(beamAlpha, 1));
  const beamMat = new THREE.ShaderMaterial({
    vertexShader: FAN_VERT, fragmentShader: FAN_FRAG,
    uniforms: { uColor: { value: laser }, uIntensity: { value: BEAM_I } },
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const beams = new THREE.LineSegments(beamGeo, beamMat);
  beams.frustumCulled = false;
  beams.renderOrder = 1;
  scene.add(beams);

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
  emitter.renderOrder = 15;
  scene.add(emitter);

  /* ── the plan: one route for the whole traverse ── */
  const planner = new RoutePlanner({ step: opts.lowPower ? 0.8 : 0.5, ahead: AHEAD, show: SHOW });
  const plan = createPlan(opts.lowPower ? 340 : 540, 4000);
  const planInfo: { readout: PlanReadout | null; length: number } = { readout: null, length: 1 };
  const RU = {
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uReveal: { value: 0 },
    uShow: { value: ROUTE_SHOW },
    uS0: { value: 0 },
    uArrive: { value: ARRIVE },
    uFlow: { value: opts.reduced ? 0 : 1 },
    uConGain: { value: 0 },
    uRoverZ: { value: Z_START },
    uPxPerUnit: U.uPxPerUnit,
  };
  const routeMat = new THREE.ShaderMaterial({
    vertexShader: RIB_VERT, fragmentShader: RIB_FRAG,
    uniforms: { ...RU, uGain: { value: 0 }, uWidth: { value: 10 } },
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const underMat = new THREE.ShaderMaterial({
    vertexShader: RIB_VERT, fragmentShader: RIB_UNDER_FRAG,
    uniforms: { ...RU, uGain: { value: 0 }, uWidth: { value: 16 } },
    transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
  });
  const wayMat = new THREE.ShaderMaterial({
    vertexShader: WAY_VERT, fragmentShader: WAY_FRAG,
    uniforms: { ...RU, uGain: { value: 0 }, uSize: { value: 0.95 } },
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const conMat = new THREE.ShaderMaterial({
    vertexShader: CON_VERT, fragmentShader: CON_FRAG,
    uniforms: { ...RU, uGain: { value: 0 }, uWidth: { value: 2.4 } },
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const routeGeos: THREE.BufferGeometry[] = [];
  const wayPos = new Float32Array(STAGE_END.length * 3);
  const wayS = new Float32Array(STAGE_END.length);

  /** Build the ribbon, the diamonds and the steep-ground outline from the finished plan. */
  function buildRoute() {
    const n = plan.n;
    const rp = new Float32Array(n * 2 * 3), rPrev = new Float32Array(n * 2 * 3), rNext = new Float32Array(n * 2 * 3);
    const rSide = new Float32Array(n * 2), rS = new Float32Array(n * 2);
    const idx = new Uint16Array((n - 1) * 6);
    for (let k = 0; k < n; k++) {
      const p = k * 3, a = Math.max(0, k - 1) * 3, b = Math.min(n - 1, k + 1) * 3;
      for (let side = 0; side < 2; side++) {
        const o = (2 * k + side) * 3;
        for (let c = 0; c < 3; c++) {
          rp[o + c] = plan.pos[p + c];
          rPrev[o + c] = plan.pos[a + c];
          rNext[o + c] = plan.pos[b + c];
        }
        rSide[2 * k + side] = side === 0 ? -1 : 1;
        rS[2 * k + side] = plan.s[k];
      }
      if (k < n - 1) idx.set([2 * k, 2 * k + 1, 2 * k + 2, 2 * k + 1, 2 * k + 3, 2 * k + 2], k * 6);
    }
    const ribGeo = new THREE.BufferGeometry();
    ribGeo.setAttribute("position", new THREE.BufferAttribute(rp, 3));
    ribGeo.setAttribute("aPrev", new THREE.BufferAttribute(rPrev, 3));
    ribGeo.setAttribute("aNext", new THREE.BufferAttribute(rNext, 3));
    ribGeo.setAttribute("aSide", new THREE.BufferAttribute(rSide, 1));
    ribGeo.setAttribute("aS", new THREE.BufferAttribute(rS, 1));
    ribGeo.setIndex(new THREE.BufferAttribute(idx, 1));
    const under = new THREE.Mesh(ribGeo, underMat);
    const ribbon = new THREE.Mesh(ribGeo, routeMat);
    under.renderOrder = 10;
    ribbon.renderOrder = 11;

    // one diamond at the end of each stage
    const L = plan.s[n - 1];
    STAGE_END.forEach((f, i) => {
      const target = f * L;
      let k = 1;
      while (k < n - 1 && plan.s[k] < target) k++;
      wayPos[i * 3] = plan.pos[k * 3];
      wayPos[i * 3 + 1] = plan.pos[k * 3 + 1] + 0.55;
      wayPos[i * 3 + 2] = plan.pos[k * 3 + 2];
      wayS[i] = plan.s[k];
    });
    const wayGeo = new THREE.BufferGeometry();
    wayGeo.setAttribute("position", new THREE.BufferAttribute(wayPos, 3));
    wayGeo.setAttribute("aS", new THREE.BufferAttribute(wayS, 1));
    const waypoints = new THREE.Points(wayGeo, wayMat);
    waypoints.renderOrder = 12;

    // steep-ground outline: a short ribbon per segment (4 vertices each, both ends know the segment's direction)
    const m = plan.segN;
    const cPos = new Float32Array(m * 4 * 3), cPrev = new Float32Array(m * 4 * 3), cNext = new Float32Array(m * 4 * 3);
    const cSide = new Float32Array(m * 4), cW = new Float32Array(m * 4);
    const cIdx = new Uint32Array(m * 6);
    for (let q = 0; q < m; q++) {
      const o = q * 7;
      cSide.set([-1, 1, -1, 1], q * 4);
      cIdx.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4 + 1, q * 4 + 3, q * 4 + 2], q * 6);
      for (let v = 0; v < 4; v++) {
        const e = (q * 4 + v) * 3;
        const end = v < 2 ? 0 : 3; // vertices 0, 1 sit at the segment's start, 2, 3 at its end
        for (let c = 0; c < 3; c++) {
          cPos[e + c] = plan.seg[o + end + c];
          cPrev[e + c] = plan.seg[o + c];
          cNext[e + c] = plan.seg[o + 3 + c];
        }
        cW[q * 4 + v] = plan.seg[o + 6];
      }
    }
    const conGeo = new THREE.BufferGeometry();
    conGeo.setAttribute("position", new THREE.BufferAttribute(cPos, 3));
    conGeo.setAttribute("aPrev", new THREE.BufferAttribute(cPrev, 3));
    conGeo.setAttribute("aNext", new THREE.BufferAttribute(cNext, 3));
    conGeo.setAttribute("aSide", new THREE.BufferAttribute(cSide, 1));
    conGeo.setAttribute("aW", new THREE.BufferAttribute(cW, 1));
    conGeo.setIndex(new THREE.BufferAttribute(cIdx, 1));
    const contour = new THREE.Mesh(conGeo, conMat);
    contour.renderOrder = 9;

    for (const o of m > 0 ? [contour, under, ribbon, waypoints] : [under, ribbon, waypoints]) {
      o.frustumCulled = false;
      scene.add(o);
    }
    routeGeos.push(ribGeo, wayGeo, conGeo);
    planInfo.length = L;
  }

  /** Position and direction on the route at distance `s` along it. */
  const rp = { x: 0, y: 0, z: 0 };
  function routeAt(s: number, out = rp) {
    const n = plan.n;
    const S = plan.s, P = plan.pos;
    s = clamp(s, 0, S[n - 1]);
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (S[mid] <= s) lo = mid;
      else hi = mid;
    }
    const span = S[hi] - S[lo];
    const t = span > 1e-6 ? (s - S[lo]) / span : 0;
    out.x = lerp(P[lo * 3], P[hi * 3], t);
    out.y = lerp(P[lo * 3 + 1], P[hi * 3 + 1], t);
    out.z = lerp(P[lo * 3 + 2], P[hi * 3 + 2], t);
    return out;
  }

  /* ── the rover ── */
  const rover = new THREE.Group();
  rover.rotation.order = "YXZ";
  scene.add(rover);
  const rd = buildRover(opts.lowPower ? 150 : 250);
  const roverGeo = new THREE.BufferGeometry();
  roverGeo.setAttribute("position", new THREE.BufferAttribute(rd.pos, 3));
  roverGeo.setAttribute("aColor", new THREE.BufferAttribute(rd.color, 3));
  roverGeo.setAttribute("aCenter", new THREE.BufferAttribute(rd.center, 3));
  roverGeo.setAttribute("aSeed", new THREE.BufferAttribute(rd.seed, 1));
  roverGeo.setAttribute("aY", new THREE.BufferAttribute(rd.y, 1));
  roverGeo.setAttribute("aHot", new THREE.BufferAttribute(rd.hot, 1));
  roverGeo.setAttribute("aWheel", new THREE.BufferAttribute(rd.wheel, 1));
  const roverU = { uPxPerUnit: U.uPxPerUnit, uSize: { value: 0.05 }, uGain: { value: 1 }, uBuilt: { value: 0 }, uSpin: { value: 0 }, uTime: { value: 0 } };
  const roverMat = new THREE.ShaderMaterial({
    vertexShader: ROVER_VERT, fragmentShader: SOFT_FRAG, uniforms: roverU,
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const roverPts = new THREE.Points(roverGeo, roverMat);
  roverPts.frustumCulled = false;
  roverPts.renderOrder = 14;
  rover.add(roverPts);

  // a dark body under the points, so the rover blocks the ground behind it the way the route's dark stroke does
  const hullMat = new THREE.MeshBasicMaterial({ color: 0x06070b, transparent: true, opacity: 0.2, depthTest: false, depthWrite: false });
  const hullGeos: THREE.BufferGeometry[] = [];
  const hull = (geo: THREE.BufferGeometry, x: number, y: number, z: number, rotZ = 0) => {
    hullGeos.push(geo);
    const m = new THREE.Mesh(geo, hullMat);
    m.position.set(x, y, z);
    m.rotation.z = rotZ;
    m.renderOrder = 13;
    m.frustumCulled = false;
    rover.add(m);
  };
  hull(new THREE.BoxGeometry(1.5, 0.5, 2.44), 0, 0.98, 0);
  hull(new THREE.BoxGeometry(1.46, 0.06, 1.1), 0, 1.27, -0.5);
  hull(new THREE.BoxGeometry(0.58, 0.26, 0.5), 0, HEAD.y, HEAD.z);
  hull(new THREE.BoxGeometry(0.1, 1.2, 0.1), 0, 1.83, HEAD.z);
  for (const [wx, wz] of WHEELS) hull(new THREE.CylinderGeometry(WHEEL_R * 0.98, WHEEL_R * 0.98, WHEEL_HW * 2, 16), wx, WHEEL_R, wz, Math.PI / 2);

  /* ── state ── */
  const st = {
    t: 0,
    target: 0, // scroll progress 0–1
    s: 0, // metres along the route
    p: 0, // s / route length
    heading: 0,
    camHeading: 0,
    tiltX: 0,
    tiltZ: 0,
    spin: 0,
    pose: { back: 0, up: 0, side: 0, ry: 0 } as Pose,
    camZ: Z_START - POSES[0].back,
    ready: false,
    snapped: false,
    planned: false,
    primed: false,
    visible: true,
    introT: -1,
    introDone: false,
    introK: 0,
    width: 1,
    height: 1,
    dpr: 1,
    pointer: { x: 0, y: 0, sx: 0, sy: 0, active: false },
    fanTick: 0,
    telTick: 0,
    pingBorn: -100,
    atEnd: false,
    groundY: heightAt(corridorX(Z_START), Z_START),
    lost: false,
  };
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
    if (opts.reduced && st.ready) frame(0.016);
  }

  /* ── per-frame updates ── */
  const rovPos = new THREE.Vector3();
  const camTarget = new THREE.Vector3();
  const ra = { x: 0, y: 0, z: 0 };
  const rb = { x: 0, y: 0, z: 0 };

  function updateRover(dt: number, snap: boolean) {
    const L = planInfo.length - ARRIVE;
    const sT = st.target * L;
    if (snap || opts.reduced) st.s = sT;
    else {
      let ds = damp(st.s, sT, 5.5, dt) - st.s;
      const cap = MAX_SPEED * dt;
      ds = clamp(ds, -cap, cap);
      st.s = clamp(st.s + ds, 0, L);
      st.spin += ds / WHEEL_R;
    }
    st.p = st.s / L;

    const here = routeAt(st.s);
    const x = here.x, z = here.z;
    const gy = heightAt(x, z);
    const a = routeAt(st.s - 1.2, ra);
    const b = routeAt(st.s + 2.4, rb);
    const targetHeading = Math.atan2(b.x - a.x, b.z - a.z);
    st.heading = snap ? targetHeading : damp(st.heading, targetHeading, 4, dt);
    st.camHeading = snap ? targetHeading : damp(st.camHeading, targetHeading, 1.8, dt);

    // sit on the ground: pitch and roll from the heights around the wheels
    const fx = Math.sin(st.heading), fz = Math.cos(st.heading);
    const ax = Math.cos(st.heading), az = -Math.sin(st.heading); // rover-space +x
    const hF = heightAt(x + fx * 1.2, z + fz * 1.2), hB = heightAt(x - fx * 1.2, z - fz * 1.2);
    const hA = heightAt(x + ax * 1.1, z + az * 1.1), hC = heightAt(x - ax * 1.1, z - az * 1.1);
    const pitch = -Math.atan2(hF - hB, 2.4);
    const roll = Math.atan2(hA - hC, 2.2);
    st.tiltX = snap ? pitch : damp(st.tiltX, pitch, 6, dt);
    st.tiltZ = snap ? roll : damp(st.tiltZ, roll, 6, dt);
    st.groundY = gy;

    rover.position.set(x, gy + 0.04, z);
    rover.rotation.set(st.tiltX, st.heading, st.tiltZ);
    rover.updateMatrixWorld(true);
    rovPos.set(x, gy, z);
    roverU.uSpin.value = st.spin;
  }

  const camDir = new THREE.Vector3();
  function updateCamera(dt: number, snap: boolean) {
    const { back, up, side, ry } = poseAt(st.p, st.pose);
    const fx = Math.sin(st.camHeading), fz = Math.cos(st.camHeading);
    const ax = Math.cos(st.camHeading), az = -Math.sin(st.camHeading); // +x in rover space: the viewer's left
    const px = rovPos.x - fx * back - ax * side;
    const pz = rovPos.z - fz * back - az * side;
    const py = Math.max(rovPos.y + up, heightAt(px, pz) + 2.6);
    camera.position.set(px, py, pz);

    // aim so the rover (a metre above its wheels) lands at `ry` of the way down the screen, centred across
    const dist = Math.hypot(back, side);
    const down = Math.atan2(py - (rovPos.y + 1), dist);
    const wantY = opts.getRoverY?.() ?? ry;
    const off = Math.atan((wantY - 0.5) * 2 * Math.tan((camera.fov * Math.PI) / 360)); // angle of the rover below the view axis
    const pitch = down - off;
    const hx = rovPos.x - px, hz = rovPos.z - pz;
    const hl = Math.hypot(hx, hz) || 1;
    camDir.set((hx / hl) * Math.cos(pitch), -Math.sin(pitch), (hz / hl) * Math.cos(pitch));
    camTarget.copy(camera.position).add(camDir);
    camera.lookAt(camTarget);

    // the pointer nudges the view a little
    const p = st.pointer;
    p.sx = snap ? 0 : damp(p.sx, p.active ? p.x : 0, 4, dt);
    p.sy = snap ? 0 : damp(p.sy, p.active ? p.y : 0, 4, dt);
    camera.rotateY(-p.sx * 0.05);
    camera.rotateX(p.sy * 0.025);
    camera.updateMatrixWorld();
    st.camZ = pz;
  }

  function updateScan() {
    const head = U.uHead.value;
    head.copy(HEAD).applyMatrix4(rover.matrixWorld);
    const fwdX = Math.sin(st.heading), fwdZ = Math.cos(st.heading);
    U.uN.value.set(fwdX * Math.sin(BETA), Math.cos(BETA), fwdZ * Math.sin(BETA)).normalize();
    U.uCamZ.value = camera.position.z;
    U.uOrigin.value.copy(rovPos);
    emitter.position.copy(head);
    (emitter.material as THREE.ShaderMaterial).uniforms.uSize.value = 20 * st.dpr * (0.85 + 0.15 * Math.sin(st.t * 6)) * smoothstep(0.55, 1, st.introK);
  }

  const fanHit: Hit = { t: 0, x: 0, y: 0, z: 0 };
  function updateFan() {
    const head = U.uHead.value;
    const fwdX = Math.sin(st.heading), fwdZ = Math.cos(st.heading);
    const rx = fwdZ, rz = -fwdX;
    const ux = fwdX * Math.cos(BETA), uy = -Math.sin(BETA), uz = fwdZ * Math.cos(BETA);
    const half = 1.0; // ±57°
    fanPos[0] = head.x; fanPos[1] = head.y; fanPos[2] = head.z;
    let beamI = 0;
    const beamStep = Math.max(1, Math.floor(FAN_N / BEAMS));
    for (let k = 0; k < FAN_N; k++) {
      const phi = lerp(-half, half, k / (FAN_N - 1));
      const c = Math.cos(phi), s = Math.sin(phi);
      const dx = ux * c + rx * s, dy = uy * c, dz = uz * c + rz * s;
      const est = (head.y - st.groundY) / Math.max(0.02, -dy);
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

  /** What the stages do to the picture, as a function of how far along the traverse we are. */
  function updateStages() {
    const p = st.p;
    const intro = smoothstep(0.55, 1, st.introK);
    RU.uTime.value = st.t;
    RU.uS0.value = st.s;
    RU.uRoverZ.value = rovPos.z;
    RU.uReveal.value = smoothstep(0.27, 0.46, p) * (SHOW + 14);
    RU.uShow.value = lerp(ROUTE_SHOW, 44, smoothstep(0.55, 0.7, p)); // close to the rover, the route is shorter: the build and arrival stages are about what is here
    RU.uConGain.value = smoothstep(0.3, 0.48, p) * intro;
    conMat.uniforms.uGain.value = intro;
    // the route and its diamonds belong to the plan; before the plan stage only the diamonds (the survey's targets) show
    routeMat.uniforms.uGain.value = intro * smoothstep(0.26, 0.3, p);
    underMat.uniforms.uGain.value = intro * smoothstep(0.26, 0.3, p);
    wayMat.uniforms.uGain.value = intro;
    roverU.uBuilt.value = smoothstep(0.5, 0.68, p);
    roverU.uGain.value = intro;
    roverU.uTime.value = st.t;
    hullMat.opacity = (0.4 + 0.5 * roverU.uBuilt.value) * intro;
    const scan = 1 - 0.45 * smoothstep(0.2, 0.3, p);
    fanMat.uniforms.uIntensity.value = FAN_I * scan * intro;
    beamMat.uniforms.uIntensity.value = BEAM_I * scan * intro;
    emitter.visible = intro > 0.02;
  }

  function updatePing() {
    const arrived = st.p > 0.985;
    if (!arrived) st.atEnd = false;
    else if (!st.atEnd && st.introDone && !opts.reduced) {
      st.pingBorn = st.t;
      st.atEnd = true;
    }
    const v = U.uPing.value[0];
    const age = st.t - st.pingBorn;
    const life = 3.4;
    if (age < 0 || age > life) { v.w = 0; return; }
    v.set(wayPos[(STAGE_END.length - 1) * 3], wayPos[(STAGE_END.length - 1) * 3 + 2], age * 26, Math.pow(1 - age / life, 1.4));
  }

  function telemetry(): Telemetry {
    const x = rovPos.x, z = rovPos.z;
    const n0 = normalAt(x, z, st.groundY);
    const n1 = normalAt(x + Math.sin(st.heading) * 4, z + Math.cos(st.heading) * 4);
    const flat = Math.min(n0[1], n1[1]); // the steeper of the two, as the cosine of the slope
    let next: number | null = null;
    for (let i = 0; i < STAGE_END.length; i++) {
      if (wayS[i] - st.s > ARRIVE + 1.5) { next = wayS[i] - st.s; break; }
    }
    return {
      stage: Math.min(3, Math.floor(st.p * 4)),
      distance: st.s,
      elevation: st.groundY,
      slope: (Math.acos(clamp(flat, -1, 1)) * 180) / Math.PI,
      points: st.s * POINTS_PER_M,
      nextWaypoint: next,
      plan: planInfo.readout,
    };
  }

  /* generate rows in budgeted chunks so the main thread never stalls */
  function prefill(budgetRows: number) {
    let all = true;
    for (const l of layers) {
      l.update(st.camZ, budgetRows);
      if (l.filled < 0.999) all = false;
    }
    return all;
  }

  function frame(dt: number) {
    if (st.lost) return;
    st.t += dt;
    starU.uTime.value = st.t;

    if (!st.planned) {
      // the planner's terrain window first, in slices, then the plan itself
      if (!st.primed) st.primed = planner.prime(Z_START, opts.reduced ? 1e4 : 70);
      else if (planner.plan(corridorX(Z_START), Z_START, plan) && plan.n > 2) {
        st.planned = true;
        planInfo.readout = { length: plan.length, maxSlope: plan.maxSlope, limit: planner.limitDeg, blocked: plan.blocked, ms: plan.ms, plans: planner.plans };
        planInfo.length = plan.s[plan.n - 1];
        buildRoute();
      }
      renderer.render(scene, camera);
      return;
    }

    if (!st.snapped) {
      // start where the scroll already is, not at the beginning of the route
      updateRover(dt, true);
      updateCamera(dt, true);
      st.snapped = true;
    }

    const filled = prefill(st.ready ? 14 : st.visible ? 10 : 6); // gentler while it is being built out of sight
    if (!st.ready && filled) {
      st.ready = true;
      if (!st.visible) stop();
      opts.onReady?.();
    }
    if (!st.ready) {
      renderer.render(scene, camera);
      return;
    }

    updateRover(dt, false);
    updateCamera(dt, false);
    updateScan();

    // intro: a radial ranging pulse uncovers the world
    if (st.introT >= 0 && !st.introDone) {
      st.introT += dt;
      st.introK = clamp(st.introT / 2.6, 0, 1);
      U.uReveal.value = (1 - Math.pow(1 - st.introK, 2.4)) * 240;
      if (st.introK >= 1) { st.introDone = true; U.uReveal.value = 1e5; }
    } else if (st.introT < 0) {
      U.uReveal.value = 0;
      st.introK = 0;
    }
    updateStages();
    updatePing();

    st.fanTick++;
    if (st.fanTick % (opts.lowPower ? 3 : 2) === 0 || opts.reduced) updateFan();
    if (opts.onTelemetry && (++st.telTick % 3 === 0 || opts.reduced)) opts.onTelemetry(telemetry());
    renderer.render(scene, camera);
  }

  /* ── loop ── */
  let raf = 0;
  let last = 0;
  let running = false;
  // Adaptive quality, as in the hero: two consecutive slow windows (<≈35 fps) step the pixel ratio down by 0.5 (floor 1).
  const mon = { acc: 0, n: 0, slow: 0, skip: 0 };
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    const raw = (now - last) / 1000 || 0.016;
    const dt = Math.min(0.05, raw);
    last = now;
    frame(dt);
    if (!st.introDone || raw > 0.25) return;
    if (mon.skip > 0) { mon.skip--; return; }
    mon.acc += raw;
    if (++mon.n >= 90) {
      const avg = mon.acc / mon.n;
      mon.acc = 0; mon.n = 0;
      mon.slow = avg > 0.029 ? mon.slow + 1 : 0;
      if (mon.slow >= 2 && dprCap > 1 && st.dpr > 1) {
        dprCap = Math.max(1, dprCap - 0.5);
        mon.slow = 0;
        mon.skip = 30;
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

  const onLost = (e: Event) => { e.preventDefault(); st.lost = true; stop(); };
  const onRestored = () => { st.lost = false; if (st.visible && !document.hidden) start(); };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);
  const onVis = () => (document.hidden ? stop() : st.visible && start());
  document.addEventListener("visibilitychange", onVis);

  resize();
  if (opts.reduced) {
    // Static poster: plan, fill every row, reveal fully, draw one still frame part-way along with the route out.
    st.target = 0.6;
    let guard = 0;
    while (!st.planned && guard++ < 12) frame(0.016); // the terrain window, then the plan
    if (st.planned) {
      frame(0.016); // snap the rover and camera to the poster pose
      while (!prefill(400) && guard++ < 40) { /* keep filling */ }
      st.introT = 99; st.introDone = true; st.introK = 1; U.uReveal.value = 1e5;
      frame(0.016); // ready, and drawn
      opts.onReady?.();
    }
  } else {
    start();
  }

  return {
    setProgress(p) {
      st.target = clamp(p);
    },
    setPointer(nx, ny, active) {
      st.pointer.x = nx; st.pointer.y = ny; st.pointer.active = active;
    },
    setVisible(v) {
      st.visible = v;
      if (v && !document.hidden) start();
      else if (st.ready) stop(); // until it is ready it keeps going, so the ground is filled in before anyone sees it
    },
    intro() {
      if (st.introT < 0) st.introT = 0;
    },
    resize() {
      resize();
    },
    debugInfo() {
      const v = new THREE.Vector3();
      const px = (x: number, y: number, z: number) => {
        v.set(x, y, z).project(camera);
        return [Math.round(((v.x + 1) / 2) * st.width), Math.round(((1 - v.y) / 2) * st.height)];
      };
      const head = U.uHead.value;
      return {
        s: st.s, p: st.p, planLength: planInfo.length, ready: st.ready, introK: st.introK,
        rover: [rovPos.x, rovPos.y, rovPos.z], cam: camera.position.toArray(), heading: st.heading,
        roverPx: px(rovPos.x, rovPos.y + 1, rovPos.z), headPx: px(head.x, head.y, head.z),
        waypoints: Array.from({ length: STAGE_END.length }, (_, i) => px(wayPos[i * 3], wayPos[i * 3 + 1], wayPos[i * 3 + 2])),
        points: rd.count,
      };
    },
    dispose() {
      stop();
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      document.removeEventListener("visibilitychange", onVis);
      layers.forEach((l) => l.dispose());
      starGeo.dispose(); (stars.material as THREE.Material).dispose();
      fanGeo.dispose(); fanMat.dispose(); beamGeo.dispose(); beamMat.dispose();
      emitter.geometry.dispose(); (emitter.material as THREE.Material).dispose();
      routeGeos.forEach((g) => g.dispose());
      routeMat.dispose(); underMat.dispose(); wayMat.dispose(); conMat.dispose();
      roverGeo.dispose(); roverMat.dispose();
      hullGeos.forEach((g) => g.dispose()); hullMat.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
