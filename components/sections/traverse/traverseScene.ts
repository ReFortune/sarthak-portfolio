import * as THREE from "three";
import { corridorX, heightAt, normalAt, raycast, hash2, type Hit } from "@/lib/terrain";
import { clamp, damp, lerp, smoothstep } from "@/lib/math";
import { RoutePlanner, createPlan } from "@/components/hero/routePlanner";
import { BETA, DESKTOP_LAYERS, FAN_FRAG, FAN_VERT, Layer, PING_N, STAR_FRAG, STAR_VERT, TRAIL_N, scaleLayers, type LayerSpec } from "@/components/hero/terrainScene";
import { HEAD, WHEEL_R, createRover } from "@/components/world/kit/rover";
import { createRouteOverlay, routeAt as routeAtData, type RouteOverlay } from "@/components/world/kit/route";
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
  let overlay: RouteOverlay | null = null;

  /** Build the ribbon, the diamonds and the steep-ground outline from the finished plan. */
  function buildRoute() {
    const L = plan.s[plan.n - 1];
    overlay = createRouteOverlay(plan, STAGE_END.map((f) => f * L), { reduced: opts.reduced, pxPerUnit: U.uPxPerUnit, show: ROUTE_SHOW, arrive: ARRIVE });
    for (const o of overlay.objects) scene.add(o);
    overlay.setResolution(st.width, st.height, st.dpr);
    planInfo.length = L;
  }

  /** Position on the route at distance `s` along it. */
  const rp = { x: 0, y: 0, z: 0 };
  const routeAt = (s: number, out = rp) => routeAtData(plan, s, out);

  /* ── the rover ── */
  const roverObj = createRover({ lowPower: opts.lowPower, pxPerUnit: U.uPxPerUnit });
  const rover = roverObj.group;
  scene.add(rover);
  const roverU = roverObj.uniforms;
  const hullMat = roverObj.hullMat;

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
    overlay?.setResolution(w, h, dpr);
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
    const o = overlay;
    if (o) {
      o.shared.uTime.value = st.t;
      o.shared.uS0.value = st.s;
      o.shared.uRoverZ.value = rovPos.z;
      o.shared.uReveal.value = smoothstep(0.27, 0.46, p) * (SHOW + 14);
      o.shared.uShow.value = lerp(ROUTE_SHOW, 44, smoothstep(0.55, 0.7, p)); // close to the rover, the route is shorter: the build and arrival stages are about what is here
      o.shared.uConGain.value = smoothstep(0.3, 0.48, p) * intro;
      o.gains.con.value = intro;
      // the route and its diamonds belong to the plan; before the plan stage only the diamonds (the survey's targets) show
      o.gains.ribbon.value = intro * smoothstep(0.26, 0.3, p);
      o.gains.under.value = intro * smoothstep(0.26, 0.3, p);
      o.gains.way.value = intro;
    }
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
    const wp = overlay?.wayPos;
    if (!wp) return;
    v.set(wp[(STAGE_END.length - 1) * 3], wp[(STAGE_END.length - 1) * 3 + 2], age * 26, Math.pow(1 - age / life, 1.4));
  }

  function telemetry(): Telemetry {
    const x = rovPos.x, z = rovPos.z;
    const n0 = normalAt(x, z, st.groundY);
    const n1 = normalAt(x + Math.sin(st.heading) * 4, z + Math.cos(st.heading) * 4);
    const flat = Math.min(n0[1], n1[1]); // the steeper of the two, as the cosine of the slope
    let next: number | null = null;
    const ws = overlay?.wayS;
    for (let i = 0; ws && i < STAGE_END.length; i++) {
      if (ws[i] - st.s > ARRIVE + 1.5) { next = ws[i] - st.s; break; }
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
        waypoints: Array.from({ length: STAGE_END.length }, (_, i) => px(overlay?.wayPos[i * 3] ?? 0, overlay?.wayPos[i * 3 + 1] ?? 0, overlay?.wayPos[i * 3 + 2] ?? 0)),
        points: roverObj.count,
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
      overlay?.dispose();
      roverObj.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
