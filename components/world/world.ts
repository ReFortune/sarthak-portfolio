import * as THREE from "three";
import { heightAt, raycast, hash2, type Hit } from "@/lib/terrain";
import { clamp, damp, lerp, smoothstep } from "@/lib/math";
import { STAR_FRAG, STAR_VERT } from "@/components/hero/terrainScene";
import { createTerrain } from "./kit/terrain";
import { HEAD, WHEEL_R, createRover } from "./kit/rover";
import { createRouteOverlay, routeAt, type RouteOverlay } from "./kit/route";
import { createGate, type Gate } from "./kit/gate";
import { createEmbers } from "./kit/embers";
import { createScan } from "./kit/scan";
import { createPost } from "./kit/post";
import { buildLayout, createRouteBuilder, type Layout } from "./layout";
import { createCamState, createRig, type RigContext } from "./rig";
import { beatAt, beats, type BeatId } from "./story";
import { createActs, type Act, type ActFrame, type Label, type Sortable } from "./acts";

/* ─────────────────────────────────────────────────────────────────────────
   THE WORLD — one WebGL canvas for the whole home page.

   Scroll is the only input that matters: it moves the camera along a path through a single continuous scene (the
   LiDAR ground, a rover on a planned route, gates, a ring of instruments, the sky, a corridor of year gates). The
   scene is drawn into a target and composited with bloom, chromatic aberration and a "tech displacement" that tears
   the image as you pass through a gate.
   ───────────────────────────────────────────────────────────────────────── */

export type WorldOptions = {
  reduced: boolean;
  lowPower: boolean;
  /** Portrait: where the rover should sit on screen (fraction of the height from the top). */
  getRoverY?: () => number | undefined;
  onReady?: () => void;
};

export type World = {
  /** Uncover the world (call when the preloader lifts). */
  intro(): void;
  setProgress(u: number): void;
  setPointer(nx: number, ny: number, active: boolean): void;
  setVisible(v: boolean): void;
  press(): void;
  resize(): void;
  /** Labels the DOM should draw this frame (screen pixels). */
  labels(): Label[];
  /** The exhibit under the pointer, if any. */
  hovered(): string | null;
  /** What the pointer is ranging on the ground: distance (m) and height (m), or null if nothing is hit. */
  readout(): { range: number; elev: number } | null;
  dispose(): void;
  /** Dev/testing: jump straight to a scroll position and report where things are. */
  debug: { snap(u: number): void; info(): unknown; stats(): { cpuMs: number; points: number } };
};

const B = Object.fromEntries(beats.map((b) => [b.id, b.index])) as Record<BeatId, number>;
/** The fastest the rover is driven along the route (m/s): the ground can only be generated so fast. */
const MAX_SPEED = 110;

/** Where the route is across the track at world z (it only ever moves forward in z). */
function routeXAt(route: Layout["route"], z: number) {
  const p = route.pos, n = route.n;
  if (z <= p[2]) return p[0];
  if (z >= p[(n - 1) * 3 + 2]) return p[(n - 1) * 3];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (p[mid * 3 + 2] <= z) lo = mid;
    else hi = mid;
  }
  const z0 = p[lo * 3 + 2], z1 = p[hi * 3 + 2];
  const t = z1 > z0 ? (z - z0) / (z1 - z0) : 0;
  return p[lo * 3] + (p[hi * 3] - p[lo * 3]) * t;
}

export function createWorld(canvas: HTMLCanvasElement, opts: WorldOptions): World {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
  renderer.setClearColor(new THREE.Color(0x06070b), 1);
  renderer.autoClear = true;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 1600);
  const pxPerUnit: THREE.IUniform<number> = { value: 1000 };
  const post = createPost(renderer, { lowPower: opts.lowPower });

  const terrain = createTerrain({ lowPower: opts.lowPower, pxPerUnit });
  scene.add(terrain.group);

  const scan = createScan({ lowPower: opts.lowPower });
  scene.add(scan.group);

  const embers = createEmbers({ count: opts.lowPower ? 700 : 1500, box: [70, 44, 70], pxPerUnit });
  scene.add(embers.points);

  /* stars follow the camera, as a sky: scattered ones, and a dense band of faint ones across it */
  const scatter = opts.lowPower ? 800 : 1700;
  const bandN = opts.lowPower ? 900 : 2800;
  const starCount = scatter + bandN;
  const starGeo = new THREE.BufferGeometry();
  {
    const p = new Float32Array(starCount * 3);
    const sd = new Float32Array(starCount);
    for (let i = 0; i < scatter; i++) {
      const th = hash2(i, 1, 77) * Math.PI * 2;
      const el = Math.asin(-0.12 + hash2(i, 2, 77) * 1.1);
      p[i * 3] = Math.cos(th) * Math.cos(el) * 700;
      p[i * 3 + 1] = Math.sin(el) * 700;
      p[i * 3 + 2] = Math.sin(th) * Math.cos(el) * 700;
      sd[i] = hash2(i, 3, 77);
    }
    // the band: a great circle tilted across the sky, thick in the middle and thinning out, with clumps along it
    const tilt = 0.75, ct = Math.cos(tilt), st2 = Math.sin(tilt);
    for (let k = 0; k < bandN; k++) {
      const i = scatter + k;
      const lon = hash2(k, 1, 91) * Math.PI * 2;
      const clump = 0.5 + 0.5 * Math.sin(lon * 3 + 1.2) * Math.sin(lon * 5.3);
      const lat = (hash2(k, 2, 91) + hash2(k, 3, 91) + hash2(k, 4, 91) - 1.5) * 0.2 * (0.55 + 0.7 * clump);
      const x0 = Math.cos(lon) * Math.cos(lat), y0 = Math.sin(lat), z0 = Math.sin(lon) * Math.cos(lat);
      const x1 = x0, y1 = y0 * ct - z0 * st2, z1 = y0 * st2 + z0 * ct;
      p[i * 3] = x1 * 700;
      p[i * 3 + 1] = y1 * 700;
      p[i * 3 + 2] = z1 * 700;
      sd[i] = 0.05 + 0.4 * hash2(k, 5, 91) * (0.4 + clump);
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

  /* built once the route exists */
  const builder = createRouteBuilder({ lowPower: opts.lowPower });
  let layout: Layout | null = null;
  let rig: ReturnType<typeof createRig> | null = null;
  let overlay: RouteOverlay | null = null;
  let rover: ReturnType<typeof createRover> | null = null;
  let acts: Act[] = [];
  let sortables: Sortable[] = [];
  const gates: { gate: Gate; anchor: Layout["gates"][number]; prevSide: number; pos: THREE.Vector3 }[] = [];

  const cam = createCamState();
  const st = {
    t: 0,
    uT: 0,
    u: 0,
    introT: -1,
    intro: 0,
    ready: false,
    visible: true,
    width: 1,
    height: 1,
    dpr: 1,
    pointer: { x: 0, y: 0, sx: 0, sy: 0, active: false },
    pulse: 0,
    vel: 0,
    warp: -1,
    warpSnapped: false,
    heading: 0,
    tiltX: 0,
    tiltZ: 0,
    spin: 0,
    lastRoverS: 0,
    hard: true,
    lastFov: 0,
    lost: false,
    hover: null as string | null,
    readout: null as { range: number; elev: number } | null,
    cpuMs: 0,
    lastBeat: -1,
    boost: 0,
    uPrev: 0,
    introWanted: false,
  };
  let dprCap = opts.lowPower ? 1.5 : 2;
  const rigCtx: RigContext = { fovScale: 1, fov: 42, aspect: 1.6 };
  const frameInfo: ActFrame = {
    t: 0, dt: 0, u: 0, beat: 0, local: 0, x: 0, cam, camera, pointer: st.pointer, intro: 0,
    pulse: (v: number) => { st.pulse = Math.max(st.pulse, v); },
    ping: (x: number, z: number) => terrain.ping(x, z),
  };

  /* ── building ──────────────────────────────────────────────────────── */

  function build(l: Layout) {
    layout = l;
    // the ground is generated around the route (which wanders a little either side of the corridor)
    terrain.setCenter((z) => routeXAt(l.route, z));
    rig = createRig(l);
    const sRing = l.sRing;
    overlay = createRouteOverlay(l.route, [156, 204, 256, sRing].filter((s) => s < l.length), { reduced: opts.reduced, pxPerUnit, show: 84, arrive: 4 });
    for (const o of overlay.objects) scene.add(o);
    overlay.setResolution(st.width, st.height, st.dpr);

    rover = createRover({ lowPower: opts.lowPower, pxPerUnit });
    scene.add(rover.group);

    for (const a of l.gates) {
      const gate = createGate(a.id, a.kind, { lowPower: opts.lowPower, pxPerUnit });
      // pillars on the ground, wherever the ground is
      const across = new THREE.Vector3(a.dir.z, 0, -a.dir.x);
      const hl = heightAt(a.pos.x + across.x * gate.width * 0.5, a.pos.z + across.z * gate.width * 0.5);
      const hr = heightAt(a.pos.x - across.x * gate.width * 0.5, a.pos.z - across.z * gate.width * 0.5);
      gate.group.position.set(a.pos.x, Math.min(hl, hr) - 0.35, a.pos.z);
      gate.group.rotation.y = Math.atan2(a.dir.x, a.dir.z);
      scene.add(gate.group);
      gates.push({ gate, anchor: a, prevSide: 0, pos: a.pos.clone() });
    }

    acts = createActs({ layout: l, camera, pxPerUnit, lowPower: opts.lowPower, reduced: opts.reduced });
    for (const a of acts) scene.add(a.group);
    sortables = [{ pos: rover.group.position, setOrder: (base) => rover!.setOrder(base) }, ...acts.flatMap((a) => a.sortables?.() ?? [])];
  }

  /* ── sizing ────────────────────────────────────────────────────────── */

  function resize() {
    const w = canvas.clientWidth || canvas.parentElement?.clientWidth || 1;
    const h = canvas.clientHeight || canvas.parentElement?.clientHeight || 1;
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    st.width = w; st.height = h; st.dpr = dpr;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    post.resize();
    const aspect = w / h;
    const baseFov = aspect < 0.85 ? 62 : aspect < 1.3 ? 50 : 42;
    rigCtx.fovScale = baseFov / 42;
    rigCtx.aspect = aspect;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    starU.uPx.value = dpr * (w < 700 ? 0.9 : 1.15);
    overlay?.setResolution(w, h, dpr);
    st.lastFov = 0; // recompute pxPerUnit next frame
  }

  /* ── per-frame ─────────────────────────────────────────────────────── */

  const tmpV2 = new THREE.Vector3(), headPos = new THREE.Vector3(), mastPos = new THREE.Vector3(), fwd = new THREE.Vector3();
  const rp = { x: 0, y: 0, z: 0 }, ra = { x: 0, y: 0, z: 0 }, rb = { x: 0, y: 0, z: 0 };
  const qOff = new THREE.Quaternion(), eOff = new THREE.Euler();
  const hit: Hit = { t: 0, x: 0, y: 0, z: 0 };
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let lastStamp: { x: number; z: number } | null = null;
  const sortDist = new Map<Sortable, number>();

  /** How fast (u per second) the displayed progress may advance here, so the ground can keep up. */
  function maxDu(u: number) {
    const { index } = beatAt(u);
    const k = layout!.keys[beats[index].id];
    if (k.s0 !== undefined && k.s1 !== undefined) {
      const b = beats[index];
      const dsdu = Math.abs(k.s1 - k.s0) / (b.u1 - b.u0);
      return MAX_SPEED / Math.max(1, dsdu);
    }
    return 0.7;
  }

  function beginIntro() {
    if (st.introT >= 0) return;
    st.introT = 0;
    terrain.rescan(camera.position, 2.6);
    if (opts.reduced) {
      st.introT = 99;
      st.intro = 1;
      terrain.reveal();
    }
  }

  function startWarp() {
    st.warp = 0;
    st.warpSnapped = false;
  }

  function frame(dt: number) {
    if (st.lost) return;
    st.t += dt;
    starU.uTime.value = st.t;

    /* building: the route first (a slice at a time), then the objects, then the ground around the first camera */
    if (!layout) {
      const t0 = performance.now();
      while (performance.now() - t0 < 5 && !builder.done) builder.step();
      if (builder.done && builder.route) build(buildLayout(builder.route));
      renderer.setRenderTarget(null);
      renderer.clear();
      return;
    }
    const L = layout, R = rig!;

    /* displayed progress: follows the scroll, never faster than the ground can be made; a long way off, it cuts */
    if (opts.reduced) {
      // no travel between poses: the story cuts from one beat's pose to the next
      const b = beats[beatAt(st.uT).index];
      st.u = b.u0 + (b.u1 - b.u0) * Math.min(0.5, b.hold * 0.8);
    } else if (!st.ready || st.hard) {
      st.u = st.uT;
    } else if (st.warp >= 0) {
      st.warp += dt / 1.0;
      const k = st.warp;
      if (k < 0.38) {
        post.uniforms.uFade.value = 1 - smoothstep(0, 0.38, k);
        st.pulse = Math.max(st.pulse, smoothstep(0, 0.38, k));
      } else {
        if (!st.warpSnapped) {
          st.warpSnapped = true;
          st.u = st.uT;
          st.hard = true;
          rig!.sample(st.u, rigCtx, cam);
          terrain.rescan(cam.pos, 1.8);
        }
        post.uniforms.uFade.value = smoothstep(0.38, 0.78, k);
      }
      if (k >= 1) { st.warp = -1; post.uniforms.uFade.value = 1; }
    } else {
      const lag = st.uT - st.u;
      if (Math.abs(lag) > 0.12) startWarp();
      const cap = maxDu(st.u) * dt;
      st.u += clamp(damp(st.u, st.uT, 6, dt) - st.u, -cap, cap);
    }
    const du = (st.u - st.uPrev) / Math.max(dt, 1e-3);
    st.uPrev = st.u;
    st.vel = damp(st.vel, Math.min(1, Math.abs(du) * 6), 4, dt);

    const { index: bi, local } = beatAt(st.u);
    const x = bi + local;

    /* camera */
    rigCtx.fov = camera.fov;
    rigCtx.roverY = opts.getRoverY?.();
    R.sample(st.u, rigCtx, cam);
    st.pointer.sx = st.hard ? 0 : damp(st.pointer.sx, st.pointer.active ? st.pointer.x : 0, 4, dt);
    st.pointer.sy = st.hard ? 0 : damp(st.pointer.sy, st.pointer.active ? st.pointer.y : 0, 4, dt);
    const sway = opts.reduced ? 0 : 1;
    camera.position.set(cam.pos.x + Math.sin(st.t * 0.31) * 0.12 * sway, cam.pos.y + Math.sin(st.t * 0.23) * 0.1 * sway, cam.pos.z);
    eOff.set(st.pointer.sy * 0.025, -st.pointer.sx * 0.05, 0);
    qOff.setFromEuler(eOff);
    camera.quaternion.copy(cam.quat).multiply(qOff);
    if (Math.abs(cam.fov - st.lastFov) > 1e-3) {
      st.lastFov = cam.fov;
      camera.fov = cam.fov;
      camera.updateProjectionMatrix();
      pxPerUnit.value = (st.height * st.dpr) / (2 * Math.tan((camera.fov * Math.PI) / 360));
    }
    camera.updateMatrixWorld();

    /* the rover */
    const rv = rover!;
    routeAt(L.route, cam.roverS, rp);
    routeAt(L.route, cam.roverS - 1.2, ra);
    routeAt(L.route, cam.roverS + 2.4, rb);
    const targetHeading = Math.atan2(rb.x - ra.x, rb.z - ra.z);
    st.heading = st.hard ? targetHeading : damp(st.heading, targetHeading, 4, dt);
    const fx = Math.sin(st.heading), fz = Math.cos(st.heading);
    const ax = Math.cos(st.heading), az = -Math.sin(st.heading);
    const gy = heightAt(rp.x, rp.z);
    const pitch = -Math.atan2(heightAt(rp.x + fx * 1.2, rp.z + fz * 1.2) - heightAt(rp.x - fx * 1.2, rp.z - fz * 1.2), 2.4);
    const roll = Math.atan2(heightAt(rp.x + ax * 1.1, rp.z + az * 1.1) - heightAt(rp.x - ax * 1.1, rp.z - az * 1.1), 2.2);
    st.tiltX = st.hard ? pitch : damp(st.tiltX, pitch, 6, dt);
    st.tiltZ = st.hard ? roll : damp(st.tiltZ, roll, 6, dt);
    st.spin += st.hard ? 0 : (cam.roverS - st.lastRoverS) / WHEEL_R;
    st.lastRoverS = cam.roverS;
    rv.group.position.set(rp.x, gy + 0.04, rp.z);
    rv.group.rotation.set(st.tiltX, st.heading, st.tiltZ);
    rv.group.updateMatrixWorld(true);
    const roverDist = Math.hypot(camera.position.x - rp.x, camera.position.z - rp.z, camera.position.y - gy - 1);
    const roverVis = smoothstep(2.5, 6, roverDist);
    const built = smoothstep(B.gate2 + 0.05, B.gate2 + 0.8, x);
    rv.uniforms.uSpin.value = st.spin;
    rv.uniforms.uTime.value = st.t;
    rv.uniforms.uBuilt.value = built;
    // at the ring it is the first exhibit; after that it steps back
    const focus = 1 - 0.7 * smoothstep(B.sparrow + 0.55, B.sparrow + 1.05, x);
    rv.uniforms.uGain.value = st.intro * roverVis * focus;
    rv.hullMat.opacity = (0.4 + 0.5 * built) * st.intro * roverVis * (0.4 + 0.6 * focus);
    rv.group.visible = roverVis > 0.01;

    /* the pushbroom: first person it sits just ahead of the camera and glides onto the rover's mast as the camera drops back;
       at the ring it sweeps out ahead */
    const hand = smoothstep(B.gate1 + 0.55, B.why + 0.3, x);
    fwd.set(Math.sin(st.heading), 0, Math.cos(st.heading));
    headPos.copy(camera.position).addScaledVector(fwd, 2.2);
    headPos.y -= 1.45;
    mastPos.copy(HEAD).applyMatrix4(rv.group.matrixWorld);
    headPos.lerp(mastPos, hand);
    mastPos.copy(headPos);
    const sweep = 190 * smoothstep(B.gate2 + 0.45, B.gate2 + 1.0, x);
    const tU = terrain.U;
    tU.uHead.value.copy(headPos).addScaledVector(fwd, sweep);
    tU.uN.value.set(fwd.x * Math.sin(0.3), Math.cos(0.3), fwd.z * Math.sin(0.3)).normalize();
    tU.uCamZ.value = camera.position.z;
    scan.update(mastPos, st.heading, gy);
    const scanGain = hand * (1 - smoothstep(B.gate2 + 0.5, B.gate2 + 1.0, x)) * (1 - 0.45 * smoothstep(B.survey + 0.6, B.plan + 0.4, x)) * st.intro;
    scan.setGain(scanGain, 20 * st.dpr * (0.85 + 0.15 * Math.sin(st.t * 6)));

    /* the route: draws itself out in the plan beat, thins out as the rover pulls in to the ring */
    const o = overlay!;
    o.shared.uTime.value = st.t;
    o.shared.uS0.value = cam.roverS;
    o.shared.uRoverZ.value = rp.z;
    o.shared.uReveal.value = smoothstep(B.plan - 0.1, B.plan + 0.7, x) * 170;
    o.shared.uConGain.value = smoothstep(B.plan - 0.05, B.plan + 0.8, x) * (1 - smoothstep(B.gate2 + 0.6, B.gate2 + 1.0, x)) * st.intro;
    const routeOn = st.intro * (1 - smoothstep(B.gate2 + 0.7, B.gate2 + 1.0, x));
    o.gains.ribbon.value = routeOn * smoothstep(B.survey + 0.6, B.plan + 0.1, x);
    o.gains.under.value = o.gains.ribbon.value;
    o.gains.con.value = routeOn;
    o.gains.way.value = routeOn * smoothstep(B.why + 0.2, B.survey, x);
    o.shared.uShow.value = lerp(84, 46, smoothstep(B.plan + 0.9, B.gate2 + 0.4, x));

    /* the ground */
    const groundOn = 1 - 0.8 * smoothstep(B.nova + 0.55, B.ascent + 0.85, x) + 0.8 * smoothstep(B.toolkit + 0.7, B.descent + 0.9, x);
    terrain.setGain(clamp(groundOn, 0, 1) * smoothstep(0, 0.2, st.intro) * (st.intro > 0 ? 1 : 0));
    // reduced motion cuts from pose to pose: make the ground around each new one at once
    if (opts.reduced && bi !== st.lastBeat) {
      st.lastBeat = bi;
      st.boost = 10;
    }
    const budget = st.boost > 0 ? 90 : st.warp >= 0 ? 36 : st.ready ? 14 : 20;
    if (st.boost > 0) st.boost--;
    const filled = terrain.update(camera.position.z, budget);
    terrain.tick(dt);

    /* gates: scanned in as you come near, a pulse as you pass through */
    for (const g of gates) {
      const dx = camera.position.x - g.pos.x, dz = camera.position.z - g.pos.z, dy = camera.position.y - g.pos.y;
      const dist = Math.hypot(dx, dz, dy * 0.5);
      const near = g.anchor.kind === "major" ? 300 : 120;
      g.gate.setBuilt(smoothstep(near, near * 0.35, dist));
      g.gate.setGain(dist < 700 ? st.intro : 0);
      g.gate.setBody(smoothstep(5, 26, dist));
      g.gate.update(st.t);
      const side = dx * g.anchor.dir.x + dz * g.anchor.dir.z;
      const lateral = Math.abs(dx * g.anchor.dir.z - dz * g.anchor.dir.x);
      if (!st.hard && g.prevSide < 0 && side >= 0 && lateral < g.gate.width * 0.8 && Math.abs(dy) < g.gate.height) {
        st.pulse = Math.max(st.pulse, g.anchor.kind === "major" ? 1 : 0.5);
        terrain.ping(g.pos.x + g.anchor.dir.x * 2, g.pos.z + g.anchor.dir.z * 2);
      }
      g.prevSide = side;
    }

    /* embers and stars */
    const sky = smoothstep(B.nova + 0.5, B.ascent + 0.8, x) * (1 - smoothstep(B.toolkit + 0.7, B.descent + 0.8, x));
    embers.uniforms.uTime.value = st.t;
    embers.uniforms.uCam.value.copy(camera.position);
    embers.uniforms.uTint.value = sky * 0.85;
    embers.uniforms.uIntensity.value = st.intro * (0.9 - 0.3 * sky + st.pulse * 0.5);
    embers.uniforms.uRise.value = 1 + st.pulse * 1.5;
    stars.position.copy(camera.position);
    starU.uGain.value = st.intro * (0.9 + 0.7 * sky);

    /* pointer: light-paint the ground */
    if (st.pointer.active && !opts.reduced && terrain.U.uGain.value > 0.4 && st.introT >= 0) {
      ndc.set(st.pointer.x, st.pointer.y);
      ray.setFromCamera(ndc, camera);
      const h = raycast(ray.ray.origin.x, ray.ray.origin.y, ray.ray.origin.z, ray.ray.direction.x, ray.ray.direction.y, ray.ray.direction.z, 1.2, 160, hit);
      st.readout = h ? { range: h.t, elev: h.y } : null;
      if (h) {
        const radius = clamp(0.055 * h.t, 0.3, 3.2);
        if (lastStamp) {
          const dxh = h.x - lastStamp.x, dzh = h.z - lastStamp.z;
          const dist = Math.hypot(dxh, dzh);
          const n = Math.min(6, Math.floor(dist / (radius * 0.6)));
          for (let k = 1; k <= n; k++) terrain.stamp(lastStamp.x + (dxh * k) / (n + 1), lastStamp.z + (dzh * k) / (n + 1), radius);
        }
        terrain.stamp(h.x, h.z, radius);
        lastStamp = { x: h.x, z: h.z };
      } else lastStamp = null;
    } else {
      lastStamp = null;
      st.readout = null;
    }

    /* intro: the world is uncovered by a ranging pulse the first time it is on screen */
    if (st.introT >= 0 && st.intro < 1) {
      st.introT += dt;
      st.intro = clamp(st.introT / 2.6, 0, 1);
    }

    /* the set pieces */
    frameInfo.t = st.t; frameInfo.dt = dt; frameInfo.u = st.u; frameInfo.beat = bi; frameInfo.local = local; frameInfo.x = x; frameInfo.intro = st.intro;
    for (const a of acts) a.update(frameInfo);
    // solid things hide what is behind them: draw the far ones first
    for (const s of sortables) sortDist.set(s, camera.position.distanceToSquared(s.pos));
    sortables.sort((a, b) => sortDist.get(b)! - sortDist.get(a)!);
    sortables.forEach((s, i) => s.setOrder(30 + i * 4));

    /* post */
    st.pulse = Math.max(0, st.pulse - dt * 1.15);
    const pu = post.uniforms;
    pu.uTime.value = st.t;
    pu.uPulse.value = opts.reduced ? 0 : st.pulse;
    pu.uVel.value = opts.reduced ? 0 : st.vel;
    pu.uWarm.value = 0.85 * smoothstep(B.path - 0.2, B.gate + 0.4, x);
    if (st.warp < 0) pu.uFade.value = 1;

    if (!st.ready && filled) {
      st.ready = true;
      st.hard = true;
      opts.onReady?.();
      if (st.introWanted) beginIntro();
    } else if (st.ready) {
      st.hard = false;
    }

    post.render(() => renderer.render(scene, camera));
  }

  /* ── loop ──────────────────────────────────────────────────────────── */
  let raf = 0, last = 0, running = false;
  const mon = { acc: 0, n: 0, slow: 0, skip: 0 };
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    const raw = (now - last) / 1000 || 0.016;
    const dt = Math.min(0.05, raw);
    last = now;
    const t0 = performance.now();
    frame(dt);
    st.cpuMs += (performance.now() - t0 - st.cpuMs) * 0.05;
    if (!st.ready || st.intro < 1 || raw > 0.25) return;
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
    if (running) return;
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
  start();

  return {
    setProgress(u) {
      st.uT = clamp(u);
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
      st.introWanted = true;
      if (st.ready) beginIntro();
    },
    press() {
      if (st.introT < 0) return;
      ndc.set(st.pointer.x, st.pointer.y);
      ray.setFromCamera(ndc, camera);
      const h = raycast(ray.ray.origin.x, ray.ray.origin.y, ray.ray.origin.z, ray.ray.direction.x, ray.ray.direction.y, ray.ray.direction.z, 1.2, 160, hit);
      if (h) terrain.ping(h.x, h.z);
    },
    resize,
    labels() {
      const out: Label[] = [];
      const project = (v: THREE.Vector3) => {
        tmpV2.copy(v).project(camera);
        return { x: ((tmpV2.x + 1) / 2) * st.width, y: ((1 - tmpV2.y) / 2) * st.height, visible: tmpV2.z < 1 && Math.abs(tmpV2.x) < 1.2 && Math.abs(tmpV2.y) < 1.2 };
      };
      for (const a of acts) if (a.labels) out.push(...a.labels(project));
      return out;
    },
    readout() {
      return st.readout;
    },
    hovered() {
      if (!st.pointer.active) return null;
      for (const a of acts) {
        const h = a.hover?.(st.pointer.x, st.pointer.y);
        if (h) return h;
      }
      return null;
    },
    dispose() {
      stop();
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      document.removeEventListener("visibilitychange", onVis);
      terrain.dispose();
      scan.dispose();
      embers.dispose();
      starGeo.dispose();
      (stars.material as THREE.Material).dispose();
      overlay?.dispose();
      rover?.dispose();
      gates.forEach((g) => g.gate.dispose());
      acts.forEach((a) => a.dispose());
      post.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
    debug: {
      snap(u: number) {
        st.uT = clamp(u);
        st.u = st.uT;
        st.hard = true;
        st.warp = -1;
        post.uniforms.uFade.value = 1;
      },
      stats() {
        return { cpuMs: st.cpuMs, points: renderer.info.render.points };
      },
      info() {
        if (!layout) return { ready: false };
        return {
          ready: st.ready, u: st.u, beat: cam.beat, local: cam.local, roverS: cam.roverS, sRef: cam.sRef, intro: st.intro,
          cam: camera.position.toArray(), fov: camera.fov, ring: layout.ring.center.toArray(), routeLength: layout.length, sRing: layout.sRing,
          gates: layout.gates.map((g) => ({ id: g.id, s: Math.round(g.s), pos: g.pos.toArray().map((v) => Math.round(v)) })),
        };
      },
    },
  };
}
