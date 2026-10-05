/**
 * Canvas drawing for the route-planning demo: a baked hillshade, the slope-class and sunlight overlays, the
 * search wavefront, routes, keep-out zones and the rover. No React, no planning — it only paints what it is given.
 */
import { FRAMES, GH, GW, type KeepOut, type Route, type World } from "./plannerEngine";
import type { Overlay } from "./plannerScenes";

type RGB = readonly [number, number, number];
export const ICE: RGB = [169, 216, 255];
export const BONE: RGB = [236, 231, 219];
export const LASER: RGB = [255, 91, 46];
const AMBER: RGB = [240, 184, 92];

const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const clampAlpha = (a: number) => Math.min(1, Math.max(0, a));

/* ── baking ───────────────────────────────────────────────────────────── */

const SS = 3; // hillshade supersampling

/** Catmull–Rom weights for the four taps around a fractional position. */
function cr(t: number, out: Float32Array) {
  const t2 = t * t;
  const t3 = t2 * t;
  out[0] = (-t3 + 2 * t2 - t) / 2;
  out[1] = (3 * t3 - 5 * t2 + 2) / 2;
  out[2] = (-3 * t3 + 4 * t2 + t) / 2;
  out[3] = (t3 - t2) / 2;
}

function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** Hillshade from a bicubic-upsampled height field, lit from the north-west, in the site's cold dark palette. */
function bakeBase(world: World): HTMLCanvasElement {
  const { w, h, z } = world;
  const W = w * SS;
  const H = h * SS;
  const up = new Float32Array(W * H);
  const wx = new Float32Array(4);
  const wy = new Float32Array(4);
  const xi = new Int32Array(W);
  const xw = new Float32Array(W * 4);
  for (let x = 0; x < W; x++) {
    const f = (x + 0.5) / SS - 0.5;
    const i0 = Math.floor(f);
    cr(f - i0, wx);
    xi[x] = i0;
    xw.set(wx, x * 4);
  }
  for (let y = 0; y < H; y++) {
    const f = (y + 0.5) / SS - 0.5;
    const j0 = Math.floor(f);
    cr(f - j0, wy);
    for (let x = 0; x < W; x++) {
      let acc = 0;
      for (let b = 0; b < 4; b++) {
        const jj = Math.min(h - 1, Math.max(0, j0 - 1 + b));
        let row = 0;
        for (let a = 0; a < 4; a++) {
          const ii = Math.min(w - 1, Math.max(0, xi[x] - 1 + a));
          row += z[jj * w + ii] * xw[x * 4 + a];
        }
        acc += row * wy[b];
      }
      up[y * W + x] = acc;
    }
  }

  const cvs = makeCanvas(W, H);
  const ctx = cvs.getContext("2d")!;
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const step = 5 / SS; // metres per upsampled pixel
  const el = (34 * Math.PI) / 180;
  const lc = Math.cos(el) / Math.SQRT2;
  const lx = -lc;
  const ly = -lc;
  const lz = Math.sin(el);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const xm = x > 0 ? x - 1 : x;
      const xp = x < W - 1 ? x + 1 : x;
      const ym = y > 0 ? y - 1 : y;
      const yp = y < H - 1 ? y + 1 : y;
      const gx = (up[y * W + xp] - up[y * W + xm]) / ((xp - xm) * step);
      const gy = (up[yp * W + x] - up[ym * W + x]) / ((yp - ym) * step);
      const il = 1 / Math.hypot(gx, gy, 1);
      const s = Math.max(0, -gx * il * lx + -gy * il * ly + il * lz);
      const v = Math.pow(0.1 + 0.9 * s, 1.05);
      // shadows lean blue-black, highlights lean to bone
      const i = (y * W + x) * 4;
      d[i] = 9 + 128 * v;
      d[i + 1] = 12 + 132 * v;
      d[i + 2] = 21 + 138 * v;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cvs;
}

/** Slope classes at cell resolution: ice = safe, amber = caution, laser = no-go. */
function bakeClasses(world: World): HTMLCanvasElement {
  const { w, h, cls } = world;
  const cvs = makeCanvas(w, h);
  const ctx = cvs.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const c = cls[i];
    const col = c === 2 ? LASER : c === 1 ? AMBER : ICE;
    const a = c === 2 ? 0.66 : c === 1 ? 0.46 : 0.1;
    img.data[i * 4] = col[0];
    img.data[i * 4 + 1] = col[1];
    img.data[i * 4 + 2] = col[2];
    img.data[i * 4 + 3] = Math.round(a * 255);
  }
  ctx.putImageData(img, 0, 0);
  return cvs;
}

/* ── routes ───────────────────────────────────────────────────────────── */

export type PreparedRoute = {
  /** Cell-space points (x, y interleaved), cell centres. */
  pts: Float32Array;
  /** Cumulative length in cells at each point. */
  cum: Float32Array;
  total: number;
};

export function prepareRoute(world: World, cells: Int32Array): PreparedRoute {
  const n = cells.length;
  const pts = new Float32Array(n * 2);
  const cum = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pts[i * 2] = (cells[i] % world.w) + 0.5;
    pts[i * 2 + 1] = ((cells[i] / world.w) | 0) + 0.5;
    if (i > 0) cum[i] = cum[i - 1] + Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]);
  }
  return { pts, cum, total: n > 0 ? cum[n - 1] : 0 };
}

export const routeOf = (world: World, route: Route | null) => (route ? prepareRoute(world, route.cells) : null);

/* ── frame state ──────────────────────────────────────────────────────── */

export type FrameState = {
  overlay: Overlay;
  sunFrame: number;
  zones: KeepOut[];
  draft: KeepOut | null;
  ghost: PreparedRoute | null;
  ghostColor: RGB;
  route: PreparedRoute | null;
  routeColor: RGB;
  /** 0–1: how much of the route is drawn. */
  reveal: number;
  /** Search wavefront. */
  explored: { order: Int32Array; n: number; color: RGB } | null;
  exploredAlpha: number;
  rover: { x: number; y: number; waiting: boolean; trail: number } | null;
  /** Milliseconds, for pulses. */
  time: number;
};

/* ── the renderer ─────────────────────────────────────────────────────── */

export function createRenderer(canvas: HTMLCanvasElement, world: World) {
  const ctx = canvas.getContext("2d")!;
  const base = bakeBase(world);
  const classes = bakeClasses(world);

  const sunC = makeCanvas(GW, GH);
  const sunX = sunC.getContext("2d")!;
  const sunImg = sunX.createImageData(GW, GH);
  let sunFrame = -1;

  const expC = makeCanvas(GW, GH);
  const expX = expC.getContext("2d")!;
  const expImg = expX.createImageData(GW, GH);
  let expN = 0;
  let expKey: Int32Array | null = null;
  let expColor: RGB = ICE;

  const hatch = (() => {
    const p = makeCanvas(8, 8);
    const c = p.getContext("2d")!;
    c.strokeStyle = rgba(LASER, 0.55);
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(-2, 10);
    c.lineTo(10, -2);
    c.moveTo(-2, 6);
    c.lineTo(6, -2);
    c.moveTo(2, 10);
    c.lineTo(10, 2);
    c.stroke();
    return ctx.createPattern(p, "repeat")!;
  })();

  let cssW = 0;
  let cssH = 0;
  let dpr = 1;

  function resize(w: number, h: number, ratio: number) {
    cssW = w;
    cssH = h;
    dpr = ratio;
    canvas.width = Math.max(1, Math.round(w * ratio));
    canvas.height = Math.max(1, Math.round(h * ratio));
  }

  function paintSun(frame: number) {
    if (frame === sunFrame) return;
    sunFrame = frame;
    const d = sunImg.data;
    const lit = world.lit;
    for (let i = 0; i < GW * GH; i++) {
      const dark = ((lit[i] >>> frame) & 1) === 0;
      d[i * 4] = 6;
      d[i * 4 + 1] = 10;
      d[i * 4 + 2] = 30;
      d[i * 4 + 3] = dark ? 158 : 0;
    }
    sunX.putImageData(sunImg, 0, 0);
  }

  function paintExplored(s: FrameState["explored"]) {
    if (!s) {
      if (expN > 0) {
        expImg.data.fill(0);
        expX.putImageData(expImg, 0, 0);
        expN = 0;
        expKey = null;
      }
      return;
    }
    if (expKey !== s.order || expColor !== s.color || s.n < expN) {
      expImg.data.fill(0);
      expN = 0;
      expKey = s.order;
      expColor = s.color;
    }
    if (s.n === expN) return;
    const d = expImg.data;
    for (let k = expN; k < s.n; k++) {
      const c = s.order[k];
      d[c * 4] = s.color[0];
      d[c * 4 + 1] = s.color[1];
      d[c * 4 + 2] = s.color[2];
      d[c * 4 + 3] = 70;
    }
    expN = s.n;
    expX.putImageData(expImg, 0, 0);
  }

  /** Smooth the 8-neighbour staircase with quadratic curves through segment midpoints. */
  function tracePath(r: PreparedRoute, sx: number, sy: number) {
    const { pts } = r;
    const n = pts.length / 2;
    ctx.beginPath();
    if (n < 2) return;
    ctx.moveTo(pts[0] * sx, pts[1] * sy);
    for (let i = 1; i < n - 1; i++) {
      const mx = ((pts[i * 2] + pts[i * 2 + 2]) / 2) * sx;
      const my = ((pts[i * 2 + 1] + pts[i * 2 + 3]) / 2) * sy;
      ctx.quadraticCurveTo(pts[i * 2] * sx, pts[i * 2 + 1] * sy, mx, my);
    }
    ctx.lineTo(pts[n * 2 - 2] * sx, pts[n * 2 - 1] * sy);
  }

  function stroke(r: PreparedRoute, sx: number, sy: number, color: RGB, alpha: number, width: number, dash: number[], halo = true) {
    tracePath(r, sx, sy);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash(dash);
    if (halo) {
      ctx.strokeStyle = "rgba(6,7,11,0.7)";
      ctx.lineWidth = width + 2.6;
      ctx.stroke();
    }
    ctx.strokeStyle = rgba(color, alpha);
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function draw(s: FrameState) {
    if (cssW === 0) return;
    const sx = cssW / GW;
    const sy = cssH / GH;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(base, 0, 0, cssW, cssH);

    ctx.imageSmoothingEnabled = false;
    if (s.overlay === "slope") ctx.drawImage(classes, 0, 0, cssW, cssH);
    if (s.overlay === "sun") {
      paintSun(Math.min(FRAMES - 1, Math.max(0, s.sunFrame)));
      ctx.drawImage(sunC, 0, 0, cssW, cssH);
    }
    paintExplored(s.explored);
    if (s.explored) {
      ctx.globalAlpha = clampAlpha(s.exploredAlpha);
      ctx.drawImage(expC, 0, 0, cssW, cssH);
      ctx.globalAlpha = 1;
    }

    /* keep-out zones */
    const zones = s.draft ? [...s.zones, s.draft] : s.zones;
    for (const z of zones) {
      const cx = (z.x / 5) * sx;
      const cy = (z.y / 5) * sy;
      const rr = (z.r / 5) * sx;
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.fillStyle = rgba(LASER, 0.14);
      ctx.fill();
      ctx.fillStyle = hatch;
      ctx.fill();
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = rgba(LASER, 0.95);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    /* the route the other objective found — for comparison */
    if (s.ghost && s.ghost.total > 0) stroke(s.ghost, sx, sy, s.ghostColor, 0.5, 1.4, [5, 5], false);

    /* the route */
    if (s.route && s.route.total > 0 && s.reveal > 0) {
      const len = s.route.total * s.reveal * sx;
      const all = s.reveal >= 0.999;
      if (s.rover) {
        stroke(s.route, sx, sy, s.routeColor, 0.42, 2.1, all ? [] : [len, 1e6]);
        if (s.rover.trail > 0) stroke(s.route, sx, sy, s.routeColor, 1, 2.6, [s.rover.trail * sx, 1e6], false);
      } else {
        stroke(s.route, sx, sy, s.routeColor, 1, 2.6, all ? [] : [len, 1e6]);
      }
    }

    /* the rover */
    if (s.rover) {
      const rx = s.rover.x * sx;
      const ry = s.rover.y * sy;
      if (s.rover.waiting) {
        const ph = (s.time / 1100) % 1;
        ctx.beginPath();
        ctx.arc(rx, ry, 5 + ph * 15, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(LASER, 0.85 * (1 - ph));
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
      const g = ctx.createRadialGradient(rx, ry, 0, rx, ry, 13);
      g.addColorStop(0, rgba(LASER, 0.6));
      g.addColorStop(1, rgba(LASER, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(rx, ry, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(rx, ry, 4.2, 0, Math.PI * 2);
      ctx.fillStyle = "rgb(255,91,46)";
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = "rgba(6,7,11,0.9)";
      ctx.stroke();
    }
  }

  return { resize, draw, dispose() { /* canvases are garbage-collected with the renderer */ } };
}

export type Renderer = ReturnType<typeof createRenderer>;
