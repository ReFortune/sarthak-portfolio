import * as THREE from "three";
import { clamp, damp, smoothstep } from "@/lib/math";

/* ─────────────────────────────────────────────────────────────────────────
   TRAVERSE — a layered night-side landscape the camera walks through as you scroll.

   Painted layers (sky, three ridgelines, haze, a lander, the planned route, foreground
   boulders) sit at different depths; the camera dollies forward so parallax does the
   rest. A rover follows the planned route from waypoint to waypoint, lighting each one.
   Everything is drawn procedurally to canvas textures, so there are no image assets.
   ───────────────────────────────────────────────────────────────────────── */

export type TraverseScene = {
  setProgress: (p: number) => void;
  setPointer: (x: number, y: number) => void;
  setVisible: (v: boolean) => void;
  resize: () => void;
  dispose: () => void;
};

type Opts = { reduced: boolean; lowPower: boolean };

const Z0 = 7;
const Z1 = 1;
/** Lifts the rover's centre so its wheels meet the route line (wheel bottom sits 0.17 of the sprite below centre). */
const ROVER_LIFT = 0.17 * 0.17 - 0.003;
export const WAYPOINTS = [0.14, 0.38, 0.62, 0.86] as const;

const INK = "#06070b";
const INK2 = "#0b0d13";
const LASER = "#ff5b2e";
const ICE = "#a9d8ff";
const BONE = "#ece7db";

/** Route height (canvas fraction) at u across the path layer. The rover rides the same curve. */
const routeY = (u: number) => 0.76 - 0.045 * Math.sin(u * 7.4 + 0.6) - 0.03 * u;
const routeSlope = (u: number) => -0.045 * 7.4 * Math.cos(u * 7.4 + 0.6) - 0.03;

function paintTex(w: number, h: number, fn: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  fn(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* deterministic scatter so the scene is identical on every load */
const rnd = (seed: number) => {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};

function paintSky(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, INK);
  g.addColorStop(0.55, "#10141f");
  g.addColorStop(0.86, "#2a2230");
  g.addColorStop(1, "#4a2a2a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const r = rnd(11);
  for (let i = 0; i < 220; i++) {
    ctx.fillStyle = `rgba(236,231,219,${0.1 + r() * 0.55})`;
    const s = r() < 0.08 ? 3 : 2;
    ctx.fillRect(r() * w, r() * h * 0.6, s, s);
  }

  // a large pale planet, lit from the upper right, with a thin ice rim
  const px = w * 0.7, py = h * 0.4, pr = h * 0.12;
  const halo = ctx.createRadialGradient(px, py, pr * 0.9, px, py, pr * 5);
  halo.addColorStop(0, "rgba(169,216,255,0.22)");
  halo.addColorStop(1, "rgba(169,216,255,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, h);
  const body = ctx.createRadialGradient(px + pr * 0.35, py - pr * 0.35, pr * 0.1, px, py, pr);
  body.addColorStop(0, "#d9d6cc");
  body.addColorStop(0.7, "#8d8f94");
  body.addColorStop(1, "#3b4150");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(px, py, pr, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(px, py, pr, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = "rgba(20,24,34,0.28)";
  for (const [dx, dy, s] of [[-0.35, -0.1, 0.22], [0.2, 0.3, 0.16], [-0.1, 0.5, 0.12], [0.45, -0.3, 0.1]]) {
    ctx.beginPath();
    ctx.arc(px + dx * pr, py + dy * pr, s * pr, 0, Math.PI * 2);
    ctx.fill();
  }
  // terminator shadow
  const sh = ctx.createLinearGradient(px - pr, py + pr, px + pr, py - pr);
  sh.addColorStop(0, "rgba(6,7,11,0.78)");
  sh.addColorStop(0.55, "rgba(6,7,11,0)");
  ctx.fillStyle = sh;
  ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
  ctx.restore();
}

function ridge(top: string, bottom: string, base: number, amp: number, seed: number, extra?: (ctx: CanvasRenderingContext2D, w: number, h: number, yAt: (x: number) => number) => void) {
  return (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.clearRect(0, 0, w, h);
    const yAt = (x: number) =>
      h * base -
      h * amp * (Math.sin(x * 0.0042 + seed) * 0.5 + Math.sin(x * 0.011 + seed * 2.1) * 0.3 + Math.sin(x * 0.027 + seed * 3.3) * 0.2 + 0.5);
    const g = ctx.createLinearGradient(0, h * (base - amp), 0, h);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 6) ctx.lineTo(x, yAt(x));
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    // a thin ice rim-light along the crest, so each ridge reads against the one behind it
    ctx.strokeStyle = "rgba(169,216,255,0.1)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 6) (x === 0 ? ctx.moveTo(x, yAt(x)) : ctx.lineTo(x, yAt(x)));
    ctx.stroke();
    extra?.(ctx, w, h, yAt);
  };
}

function paintLander(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ridge("#10131c", INK, 0.86, 0.08, 7.7, (c, cw, ch, yAt) => {
    const cx = cw * 0.68;
    const gy = yAt(cx) + 6;
    c.fillStyle = INK;
    // legs
    c.lineWidth = 5;
    c.strokeStyle = INK;
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(cx + s * ch * 0.035, gy - ch * 0.09);
      c.lineTo(cx + s * ch * 0.1, gy);
      c.stroke();
      c.fillRect(cx + s * ch * 0.1 - 14, gy - 3, 28, 6);
    }
    // body, upper deck, mast and dish
    c.beginPath();
    c.moveTo(cx - ch * 0.06, gy - ch * 0.09);
    c.lineTo(cx - ch * 0.045, gy - ch * 0.16);
    c.lineTo(cx + ch * 0.045, gy - ch * 0.16);
    c.lineTo(cx + ch * 0.06, gy - ch * 0.09);
    c.closePath();
    c.fill();
    c.fillRect(cx - ch * 0.025, gy - ch * 0.2, ch * 0.05, ch * 0.045);
    c.fillRect(cx + ch * 0.03, gy - ch * 0.23, 4, ch * 0.075);
    c.beginPath();
    c.ellipse(cx + ch * 0.032, gy - ch * 0.235, ch * 0.03, ch * 0.012, -0.5, 0, Math.PI * 2);
    c.fill();
    // beacon
    const glow = c.createRadialGradient(cx, gy - ch * 0.19, 1, cx, gy - ch * 0.19, ch * 0.08);
    glow.addColorStop(0, "rgba(255,91,46,0.85)");
    glow.addColorStop(1, "rgba(255,91,46,0)");
    c.fillStyle = glow;
    c.fillRect(cx - ch * 0.09, gy - ch * 0.28, ch * 0.18, ch * 0.18);
    c.fillStyle = "#ffd3bf";
    c.fillRect(cx - 4, gy - ch * 0.19 - 4, 8, 8);
  })(ctx, w, h);
}

function paintHaze(seed: number) {
  return (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.clearRect(0, 0, w, h);
    const r = rnd(seed);
    for (let i = 0; i < 14; i++) {
      const x = r() * w, y = h * (0.6 + r() * 0.25), rad = h * (0.18 + r() * 0.2);
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, "rgba(150,165,195,0.13)");
      g.addColorStop(1, "rgba(150,165,195,0)");
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(2.6, 0.5);
      ctx.translate(-x, -y);
      ctx.fillStyle = g;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      ctx.restore();
    }
  };
}

/** The planned route: a dashed line in the foreground plane and the four waypoint gates. */
function paintRoute(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  // ground under the route
  const gr = ctx.createLinearGradient(0, h * 0.68, 0, h);
  gr.addColorStop(0, "rgba(13,15,22,0)");
  gr.addColorStop(0.35, "#0d0f16");
  gr.addColorStop(1, INK);
  ctx.fillStyle = gr;
  ctx.fillRect(0, h * 0.68, w, h * 0.32);

  const path = (from: number, to: number) => {
    ctx.beginPath();
    for (let i = 0; i <= 160; i++) {
      const u = from + ((to - from) * i) / 160;
      const x = u * w, y = routeY(u) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  };
  // soft glow, then the dashed centre line
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,91,46,0.14)";
  ctx.lineWidth = 14;
  path(0.03, 0.97);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,91,46,0.85)";
  ctx.lineWidth = 3;
  ctx.setLineDash([16, 14]);
  path(0.03, 0.97);
  ctx.stroke();
  ctx.setLineDash([]);

  // waypoint gates: two posts and a lintel, standing on the route
  WAYPOINTS.forEach((u, i) => {
    const x = u * w, y = routeY(u) * h;
    const big = i === WAYPOINTS.length - 1;
    const gh = h * (big ? 0.15 : 0.085), gw = h * (big ? 0.07 : 0.042);
    ctx.fillStyle = INK2;
    ctx.fillRect(x - gw - 5, y - gh, 10, gh);
    ctx.fillRect(x + gw - 5, y - gh, 10, gh);
    ctx.fillRect(x - gw - 14, y - gh - 8, gw * 2 + 28, 12);
    ctx.fillStyle = "rgba(255,91,46,0.28)";
    ctx.fillRect(x - gw - 5, y - gh, 3, gh);
    ctx.fillRect(x + gw - 5, y - gh, 3, gh);
    ctx.fillRect(x - gw - 14, y - gh - 8, gw * 2 + 28, 3);
  });
}

function paintBoulders(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  const r = rnd(5);
  ctx.fillStyle = "#04050a";
  const rock = (cx: number, base: number, rw: number, rh: number) => {
    ctx.beginPath();
    ctx.moveTo(cx - rw, base);
    const n = 7;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      ctx.lineTo(cx - rw + rw * 2 * t, base - rh * Math.sin(t * Math.PI) * (0.78 + r() * 0.3));
    }
    ctx.lineTo(cx + rw, base);
    ctx.closePath();
    ctx.fill();
  };
  for (const [cx, rw, rh] of [[0.03, 0.14, 0.32], [0.12, 0.09, 0.2], [0.2, 0.07, 0.12], [0.95, 0.15, 0.34], [0.86, 0.09, 0.2], [0.79, 0.06, 0.11]]) {
    rock(cx * w, h * 1.02, rw * h * 1.1, rh * h * 0.9);
  }
  const g = ctx.createLinearGradient(0, h * 0.88, 0, h);
  g.addColorStop(0, "rgba(4,5,10,0)");
  g.addColorStop(1, "rgba(4,5,10,1)");
  ctx.fillStyle = g;
  ctx.fillRect(0, h * 0.88, w, h * 0.12);
}

function paintRover(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2, by = h * 0.66, u = w / 100;
  // headlight cone toward the direction of travel (+x)
  const cone = ctx.createLinearGradient(cx + u * 14, 0, cx + u * 48, 0);
  cone.addColorStop(0, "rgba(169,216,255,0.32)");
  cone.addColorStop(1, "rgba(169,216,255,0)");
  ctx.fillStyle = cone;
  ctx.beginPath();
  ctx.moveTo(cx + u * 14, by - u * 14);
  ctx.lineTo(cx + u * 48, by - u * 26);
  ctx.lineTo(cx + u * 48, by + u * 4);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = BONE;
  ctx.strokeStyle = BONE;
  // deck, mast and camera head
  ctx.fillRect(cx - u * 14, by - u * 18, u * 28, u * 9);
  ctx.fillRect(cx - u * 2, by - u * 34, u * 3, u * 17);
  ctx.fillRect(cx - u * 5, by - u * 39, u * 12, u * 6);
  ctx.fillStyle = LASER;
  ctx.fillRect(cx + u * 4, by - u * 37, u * 2.4, u * 2.4);
  // solar panel
  ctx.fillStyle = "#4b6a8a";
  ctx.beginPath();
  ctx.moveTo(cx - u * 12, by - u * 18);
  ctx.lineTo(cx - u * 4, by - u * 18);
  ctx.lineTo(cx - u * 8, by - u * 25);
  ctx.closePath();
  ctx.fill();
  // rocker + six wheels
  ctx.lineWidth = u * 2;
  ctx.beginPath();
  ctx.moveTo(cx - u * 13, by - u * 9);
  ctx.lineTo(cx - u * 13, by - u * 3);
  ctx.moveTo(cx + u * 13, by - u * 9);
  ctx.lineTo(cx + u * 13, by - u * 3);
  ctx.moveTo(cx - u * 13, by - u * 5);
  ctx.lineTo(cx + u * 13, by - u * 5);
  ctx.stroke();
  ctx.fillStyle = INK2;
  ctx.lineWidth = u * 1.6;
  for (const wx of [-13, 0, 13]) {
    ctx.beginPath();
    ctx.arc(cx + u * wx, by - u * 4, u * 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

type LayerDef = { z: number; y: number; paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; fade?: boolean; scaleX?: number };

export function createTraverseScene(canvas: HTMLCanvasElement, opts: Opts): TraverseScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  const maxDpr = opts.lowPower ? 1.5 : 2;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
  renderer.setClearColor(0x06070b, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
  camera.position.set(0, 0.6, Z0);

  const TW = opts.lowPower ? 1536 : 2048;
  const TH = TW / 2;

  const defs: LayerDef[] = [
    { z: -78, y: 0, paint: paintSky },
    { z: -62, y: -0.4, paint: ridge("#323a52", "#171b27", 0.62, 0.22, 1.3) },
    { z: -50, y: -0.6, paint: ridge("#1d2332", "#10131c", 0.68, 0.2, 4.1) },
    { z: -40, y: -0.4, paint: paintHaze(31) },
    { z: -34, y: -0.6, paint: ridge("#141824", INK, 0.74, 0.18, 8.2) },
    { z: -26, y: -0.4, paint: paintLander },
    { z: -19, y: -0.6, paint: paintHaze(77) },
    { z: -12, y: 3.4, paint: paintRoute, fade: true },
    { z: -1, y: -1.1, paint: paintBoulders, fade: true },
  ];

  const disposables: Array<{ dispose: () => void }> = [renderer];
  const layers: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = defs.map((d, i) => {
    const map = paintTex(TW, TH, d.paint);
    const mat = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, depthTest: false });
    const geo = new THREE.PlaneGeometry(1, 1);
    disposables.push(map, mat, geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.z = d.z;
    m.renderOrder = i;
    m.userData = d;
    scene.add(m);
    return m;
  });
  const routeLayer = layers[7];

  /* rover + waypoint lamps ride on the route layer, in its local (−0.5…0.5) space */
  const roverMap = paintTex(512, 512, paintRover);
  const roverMat = new THREE.MeshBasicMaterial({ map: roverMap, transparent: true, depthWrite: false, depthTest: false });
  const roverGeo = new THREE.PlaneGeometry(0.085, 0.17); // parent is 2:1, so this lands square
  const rover = new THREE.Mesh(roverGeo, roverMat);
  rover.renderOrder = 10;
  routeLayer.add(rover);
  disposables.push(roverMap, roverMat, roverGeo);

  const glowMap = paintTex(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.4, "rgba(255,255,255,0.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
  disposables.push(glowMap);

  const lampGeo = new THREE.PlaneGeometry(0.05, 0.1);
  const lamps = WAYPOINTS.map((u, i) => {
    const mat = new THREE.MeshBasicMaterial({ map: glowMap, color: new THREE.Color(LASER), transparent: true, opacity: 0.15, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    const m = new THREE.Mesh(lampGeo, mat);
    const big = i === WAYPOINTS.length - 1;
    m.scale.setScalar(big ? 1.5 : 1);
    m.position.set(u - 0.5, 0.5 - routeY(u) + (big ? 0.075 : 0.043), 0.001);
    m.renderOrder = 11;
    routeLayer.add(m);
    disposables.push(mat);
    return m;
  });
  disposables.push(lampGeo);

  /* drifting ice dust, with the odd hot spark */
  const N = opts.lowPower ? 160 : 320;
  const pos = new Float32Array(N * 3);
  const vel = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const r = rnd(99);
  const ice = new THREE.Color(ICE), laser = new THREE.Color(LASER);
  const spawn = (i: number, anywhere: boolean) => {
    pos[i * 3] = (r() - 0.5) * 20 + 1;
    pos[i * 3 + 1] = anywhere ? r() * 10 - 4 : -4.5;
    pos[i * 3 + 2] = Z1 + r() * (Z0 - Z1 - 3);
    vel[i * 3] = (r() - 0.5) * 0.25;
    vel[i * 3 + 1] = 0.12 + r() * 0.35;
    const c = r() < 0.14 ? laser : ice;
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  };
  for (let i = 0; i < N; i++) spawn(i, true);
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  dustGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const dustMat = new THREE.PointsMaterial({ map: glowMap, size: 0.14, vertexColors: true, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.renderOrder = 20;
  dust.frustumCulled = false;
  scene.add(dust);
  disposables.push(dustGeo, dustMat);

  /* sizing: every layer is fitted to the frame at its starting distance */
  const host = canvas.parentElement ?? canvas;
  let skyOff = 0;
  const resize = () => {
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    for (const m of layers) {
      const d = Z0 - m.userData.z;
      const vh = 2 * d * tanH, vw = vh * camera.aspect;
      const pw = Math.max(vh * 1.25 * 2, vw * 1.3) * 1.3;
      m.scale.set(pw, pw / 2, 1);
      m.position.y = m.userData.y * (d / 20);
      // on a portrait screen the planet would sit off to the side; slide the sky so it stays in frame
      if (m === layers[0]) skyOff = camera.aspect < 1 ? -0.2 * pw + 0.36 * vw : -0.2 * pw + 0.2 * vw;
    }
    dirty = true;
  };

  /* state */
  let target = 0, current = 0, tx = 0, ty = 0, cx = 0, cy = 0;
  let visible = true, dirty = true, raf = 0, last = performance.now(), time = 0, disposed = false;

  const frame = (now: number) => {
    raf = 0;
    if (disposed || !visible) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    time += dt;

    const settle = opts.reduced ? 100 : 5;
    current = damp(current, target, settle, dt);
    cx = damp(cx, tx, opts.reduced ? 100 : 4, dt);
    cy = damp(cy, ty, opts.reduced ? 100 : 4, dt);
    const moving = Math.abs(target - current) > 0.0004 || Math.abs(tx - cx) > 0.0004 || Math.abs(ty - cy) > 0.0004;

    const e = current;
    const camZ = Z0 + (Z1 - Z0) * e;
    // the camera tracks the rover along the route, keeping it right of centre on wide screens
    const u = 0.06 + (WAYPOINTS[WAYPOINTS.length - 1] - 0.06) * clamp(e);
    const dR = camZ - routeLayer.position.z;
    const viewW = 2 * dR * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
    const camX = (u - 0.5) * routeLayer.scale.x * 0.9 - (camera.aspect > 1 ? viewW * 0.14 : 0) + cx * 1.4;
    camera.position.set(camX, 0.6 - cy * 0.7 + e * 0.15, camZ);
    layers[0].position.x = camX * 0.97 + skyOff;
    camera.lookAt(camX + cx * 0.4, 0.35 + e * 0.2, camZ - 20);

    for (const m of layers) {
      if (m.userData.fade) m.material.opacity = smoothstep(1.2, 4.5, camera.position.z - m.position.z);
    }

    // rover: from the approach to the first waypoint, on to the last gate
    rover.position.set(u - 0.5, 0.5 - routeY(u) + ROVER_LIFT, 0.002);
    rover.rotation.z = Math.atan(-routeSlope(u) * 0.5);
    lamps.forEach((l, i) => {
      const lit = smoothstep(WAYPOINTS[i] - 0.02, WAYPOINTS[i] + 0.01, u);
      (l.material as THREE.MeshBasicMaterial).opacity = 0.15 + lit * (0.65 + 0.2 * Math.sin(time * 3 + i));
    });

    if (!opts.reduced) {
      for (let i = 0; i < N; i++) {
        pos[i * 3] += (vel[i * 3] + Math.sin(time + i) * 0.08) * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        if (pos[i * 3 + 1] > 6) spawn(i, false);
      }
      dustGeo.attributes.position.needsUpdate = true;
    }

    renderer.render(scene, camera);
    dirty = false;
    if (!opts.reduced || moving) raf = requestAnimationFrame(frame);
  };
  const kick = () => {
    if (!raf && !disposed && visible) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  };

  const onLost = (e: Event) => {
    e.preventDefault();
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };
  const onRestored = () => {
    dirty = true;
    kick();
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  resize();
  kick();

  return {
    setProgress(p) {
      target = clamp(p);
      dirty = true;
      kick();
    },
    setPointer(x, y) {
      tx = opts.reduced ? 0 : x;
      ty = opts.reduced ? 0 : y;
      kick();
    },
    setVisible(v) {
      visible = v;
      if (v) kick();
      else if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },
    resize,
    dispose() {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      for (const d of disposables) d.dispose();
      renderer.forceContextLoss();
    },
  };
}
