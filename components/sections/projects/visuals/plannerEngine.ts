/**
 * Route-planning demo engine, written for this site as an illustration of grid-based path planning.
 * Pure TypeScript, no DOM: terrain, sunlight and the searches share one cost model, run on a procedural patch.
 * The terrain is synthetic and the parameters are illustrative; it is not tied to any real software or data.
 *
 *   · 5 m cells, 8-neighbour moves measured in 3-D; slope classes Safe ≤ 15° · Caution ≤ 25° · No-Go;
 *     Caution counts as 2× the distance and time; a single step steeper than the no-go limit is illegal
 *   · keep-out circles, tested conservatively (radius + half a cell diagonal)
 *   · Fastest = travel time. Safest = slope risk + hazard clearance + energy
 *   · sunlight as lighting frames with a per-cell lit bitmask; "sunlight only" waits for the light
 *   · slope-aware mode judges pitch and roll for the move instead of the slope raster
 *   · A* with a never-overestimating straight-line bound returns exactly Dijkstra's answer
 *
 * Simplified on purpose (and labelled as such on the page): procedural terrain, a patch about a kilometre across,
 * a sun that swings far faster than a real one so a short drive shows what takes hours, and no battery state.
 */
import { fbm, hash2, vnoise } from "@/lib/terrain";

/* ── world constants ──────────────────────────────────────────────────── */

/** Metres per cell. */
export const CELL = 5;
export const GW = 210;
export const GH = 140;
/** Lighting frames, their spacing, and the (exaggerated) sun motion. */
export const FRAMES = 12;
export const FRAME_S = 600;
export const SUN_ELEV = 4;
export const SUN_AZ0 = 200;
export const SUN_AZ_STEP = 6;

/** Terrain classes: the demo's illustrative slope limits. */
export const SAFE_DEG = 15;
export const NOGO_DEG = 25;
export const ROLL_SAFE = 10;
export const ROLL_NOGO = 20;
export const CAUTION_MULT = 2;

/** Safest-objective weights and the demo rover's (made-up) power figures. */
const W_S = 1;
const W_E = 0.25;
const W_C = 1.5;
const HAZ_D = 30;
const K_FLAT = 1.2;
const B_DOWN = 0.15;
const P_DRIVE = 120;
const P_STAT = 45;
const C_UP = 0.5;

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const SQRT2 = Math.SQRT2;
const TAN_NOGO = Math.tan(NOGO_DEG * RAD);

const DX = [-1, 0, 1, -1, 1, -1, 0, 1];
const DY = [-1, -1, -1, 0, 0, 1, 1, 1];

/* ── terrain ──────────────────────────────────────────────────────────── */

type Crater = { x: number; y: number; r: number; depth: number; rim: number };

/**
 * Designed craters (metres). The big one is a shallow basin: crossable, but its floor never sees the sun.
 * The smaller ones are steep-walled (depth ≈ 0.3 R) — rings the rover cannot climb.
 */
const CRATERS: Crater[] = [
  { x: 640, y: 365, r: 150, depth: 27, rim: 0.035 },
  { x: 555, y: 262, r: 44, depth: 15, rim: 0.04 },
  { x: 255, y: 465, r: 78, depth: 25, rim: 0.04 },
  { x: 885, y: 150, r: 62, depth: 20, rim: 0.04 },
  { x: 430, y: 140, r: 46, depth: 14, rim: 0.04 },
  { x: 118, y: 168, r: 40, depth: 12, rim: 0.04 },
  { x: 905, y: 565, r: 52, depth: 16, rim: 0.04 },
  { x: 770, y: 505, r: 30, depth: 9, rim: 0.04 },
];

/** Broad hills — caution-grade flanks (15–25°) that make a route worth negotiating. */
const HILLS = [
  { x: 335, y: 285, s: 52, h: 30 },
  { x: 885, y: 385, s: 44, h: 20 },
  { x: 470, y: 560, s: 60, h: 24 },
];

function craterH(c: Crater, x: number, y: number): number {
  const d = Math.hypot(x - c.x, y - c.y) / c.r;
  if (d > 3.2) return 0;
  let h = 0;
  if (d < 1) {
    const b = 1 - d * d;
    h -= c.depth * b * (0.55 + 0.45 * b);
  }
  const g = (d - 1) / 0.17;
  h += c.rim * c.r * (Math.exp(-g * g) + (d > 1 ? 0.45 * Math.exp(-(d - 1) / 0.8) : 0));
  return h;
}

/** One scale of small craters on a jittered grid (same idea as the hero terrain). */
function scatter(x: number, y: number, cell: number, seed: number, rMin: number, rMax: number, prob: number, depthF: number): number {
  const cx = Math.floor(x / cell);
  const cy = Math.floor(y / cell);
  let h = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const ix = cx + i;
      const iy = cy + j;
      if (hash2(ix, iy, seed) > prob) continue;
      const r = rMin + (rMax - rMin) * hash2(ix, iy, seed + 3);
      const c: Crater = {
        x: (ix + hash2(ix, iy, seed + 1)) * cell,
        y: (iy + hash2(ix, iy, seed + 2)) * cell,
        r,
        depth: depthF * r,
        rim: 0.06,
      };
      h += craterH(c, x, y);
    }
  }
  return h;
}

/** Terrain height (metres) at world (x, y) — x east, y south. */
export function heightAt(x: number, y: number): number {
  const regional = fbm(x * 0.0036, y * 0.0036, 5, 4) * 9 + fbm(x * 0.012 + 9, y * 0.012 - 3, 17, 3) * 2.4;
  const grain = (vnoise(x * 0.33, y * 0.33, 31) - 0.5) * 0.3;
  let h = regional + grain;
  for (const c of CRATERS) h += craterH(c, x, y);
  for (const hl of HILLS) h += hl.h * Math.exp(-(((x - hl.x) ** 2 + (y - hl.y) ** 2) / (2 * hl.s * hl.s)));
  h += scatter(x, y, 88, 401, 6, 15, 0.55, 0.2);
  h += scatter(x, y, 37, 502, 2.4, 6, 0.6, 0.2);
  return h;
}

/* ── the world: rasters derived once ──────────────────────────────────── */

export type World = {
  w: number;
  h: number;
  /** Elevation (m), row-major (y * w + x). */
  z: Float32Array;
  /** Terrain gradient components dz/dx, dz/dy at each cell centre (dimensionless). */
  gx: Float64Array;
  gy: Float64Array;
  /** Slope in degrees. */
  slope: Float64Array;
  /** 0 safe · 1 caution · 2 no-go, from the slope raster. */
  cls: Uint8Array;
  /** Metres to the nearest no-go cell, capped at the clearance distance. */
  hazard: Float64Array;
  /** Bit k set ⇒ the cell is in sunlight during lighting frame k. */
  lit: Uint32Array;
  zMin: number;
  zMax: number;
};

/** Sun azimuth (degrees clockwise from north) during frame k. */
export const sunAzimuth = (k: number) => SUN_AZ0 + SUN_AZ_STEP * k;

/** Felzenszwalb squared-distance transform of a boolean raster (distance in cells to the nearest 1). */
function distanceTransform(mask: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e12;
  const out = new Float64Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = mask[i] ? 0 : INF;
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const zz = new Float64Array(n + 1);
  const pass = (len: number) => {
    let k = 0;
    v[0] = 0;
    zz[0] = -INF;
    zz[1] = INF;
    for (let q = 1; q < len; q++) {
      let s: number;
      for (;;) {
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        if (s <= zz[k] && k > 0) k--;
        else break;
      }
      k++;
      v[k] = q;
      zz[k] = s;
      zz[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (zz[k + 1] < q) k++;
      d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
    }
  };
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = out[y * w + x];
    pass(h);
    for (let y = 0; y < h; y++) out[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = out[y * w + x];
    pass(w);
    for (let x = 0; x < w; x++) out[y * w + x] = d[x];
  }
  const res = new Float32Array(w * h);
  for (let i = 0; i < res.length; i++) res[i] = Math.sqrt(out[i]);
  return res;
}

/**
 * Cast-shadow mask for one sun direction in O(cells). Marching toward the sun, `m` carries the height of the
 * highest sun ray that reaches each cell from upstream; a cell is lit when the ground is not below it.
 */
function sunMask(z: Float32Array, w: number, h: number, azDeg: number, elevDeg: number): Uint8Array {
  const dx = Math.sin(azDeg * RAD); // toward the sun, grid axes (x east, y south)
  const dy = -Math.cos(azDeg * RAD);
  const tanE = Math.tan(elevDeg * RAD);
  const lit = new Uint8Array(w * h);
  const m = new Float32Array(w * h);
  const NEG = -1e9;

  if (Math.abs(dy) >= Math.abs(dx)) {
    const step = dy < 0 ? -1 : 1; // upstream row offset
    const shift = (dx / Math.abs(dy)) * 1; // cells of x per row stepped
    const ds = CELL / Math.abs(dy);
    const rows: number[] = [];
    if (step < 0) for (let j = 0; j < h; j++) rows.push(j);
    else for (let j = h - 1; j >= 0; j--) rows.push(j);
    for (const j of rows) {
      const jj = j + step;
      for (let i = 0; i < w; i++) {
        const idx = j * w + i;
        let up = NEG;
        if (jj >= 0 && jj < h) {
          const xs = i + shift;
          if (xs >= 0 && xs <= w - 1) {
            const x0 = Math.floor(xs);
            const x1 = Math.min(w - 1, x0 + 1);
            const t = xs - x0;
            up = m[jj * w + x0] * (1 - t) + m[jj * w + x1] * t - ds * tanE;
          }
        }
        lit[idx] = up <= z[idx] + 0.02 ? 1 : 0;
        m[idx] = up > z[idx] ? up : z[idx];
      }
    }
  } else {
    const step = dx > 0 ? 1 : -1; // upstream column offset (toward larger x when the sun is east)
    const shift = (dy / Math.abs(dx)) * 1;
    const ds = CELL / Math.abs(dx);
    const cols: number[] = [];
    if (step > 0) for (let i = w - 1; i >= 0; i--) cols.push(i);
    else for (let i = 0; i < w; i++) cols.push(i);
    for (const i of cols) {
      const ii = i + step;
      for (let j = 0; j < h; j++) {
        const idx = j * w + i;
        let up = NEG;
        if (ii >= 0 && ii < w) {
          const ys = j + shift;
          if (ys >= 0 && ys <= h - 1) {
            const y0 = Math.floor(ys);
            const y1 = Math.min(h - 1, y0 + 1);
            const t = ys - y0;
            up = m[y0 * w + ii] * (1 - t) + m[y1 * w + ii] * t - ds * tanE;
          }
        }
        lit[idx] = up <= z[idx] + 0.02 ? 1 : 0;
        m[idx] = up > z[idx] ? up : z[idx];
      }
    }
  }
  return lit;
}

let cached: World | null = null;

/** Builds (once) the terrain and every raster the planner reads. ~30 ms. */
export function getWorld(): World {
  if (cached) return cached;
  const w = GW;
  const h = GH;
  const z = new Float32Array(w * h);
  let zMin = Infinity;
  let zMax = -Infinity;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const v = heightAt((i + 0.5) * CELL, (j + 0.5) * CELL);
      z[j * w + i] = v;
      if (v < zMin) zMin = v;
      if (v > zMax) zMax = v;
    }
  }
  const gx = new Float64Array(w * h);
  const gy = new Float64Array(w * h);
  const slope = new Float64Array(w * h);
  const cls = new Uint8Array(w * h);
  const nogo = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const xm = i > 0 ? i - 1 : i;
      const xp = i < w - 1 ? i + 1 : i;
      const ym = j > 0 ? j - 1 : j;
      const yp = j < h - 1 ? j + 1 : j;
      const idx = j * w + i;
      const ax = (z[j * w + xp] - z[j * w + xm]) / ((xp - xm) * CELL);
      const ay = (z[yp * w + i] - z[ym * w + i]) / ((yp - ym) * CELL);
      gx[idx] = ax;
      gy[idx] = ay;
      const s = Math.atan(Math.hypot(ax, ay)) * DEG;
      slope[idx] = s;
      const c = s > NOGO_DEG ? 2 : s > SAFE_DEG ? 1 : 0;
      cls[idx] = c;
      if (c === 2) nogo[idx] = 1;
    }
  }
  const dt = distanceTransform(nogo, w, h);
  const hazard = new Float64Array(w * h);
  for (let i = 0; i < hazard.length; i++) hazard[i] = Math.min(HAZ_D, dt[i] * CELL);

  const lit = new Uint32Array(w * h);
  for (let k = 0; k < FRAMES; k++) {
    const mask = sunMask(z, w, h, sunAzimuth(k), SUN_ELEV);
    for (let i = 0; i < lit.length; i++) if (mask[i]) lit[i] |= 1 << k;
  }
  cached = { w, h, z, gx, gy, slope, cls, hazard, lit, zMin, zMax };
  return cached;
}

/* ── planning ─────────────────────────────────────────────────────────── */

export type Objective = "fastest" | "safest";
export type Algo = "astar" | "dijkstra";
export type KeepOut = { x: number; y: number; r: number };

export type PlanParams = {
  objective: Objective;
  algo: Algo;
  /** "Drive in sunlight only": the time-aware search, which waits for light. */
  requireLight: boolean;
  /** Judge pitch and roll for each move instead of the slope raster. */
  slopeAware: boolean;
  /** Departure = the start of this lighting frame. */
  departFrame: number;
  /** Rover speed, m/s. */
  speed: number;
  keepOuts: KeepOut[];
  start: number;
  goal: number;
};

export type RouteStats = {
  /** 3-D length, m. */
  distance: number;
  /** Trip time including waits, s. */
  time: number;
  wait: number;
  /** Steepest cell on the route (slope raster), degrees. */
  steepest: number;
  climb: number;
  descent: number;
  /** Share of the trip spent in sunlight, 0–1. */
  sunShare: number;
  /** The search's own cost for the route (time for Fastest). */
  cost: number;
  /** Unique cells expanded / labels popped / milliseconds. */
  explored: number;
  labels: number;
  ms: number;
  search: "spatial" | "time-aware";
};

export type Route = {
  /** Cell indices from start to goal. */
  cells: Int32Array;
  /** Arrival time at each cell, s after departure. */
  t: Float64Array;
  /** Waiting before the move into each cell (at the previous cell), s. */
  wait: Float64Array;
  /** 3-D distance from the start at each cell, m. */
  d: Float64Array;
};

export type PlanResult =
  | { ok: true; route: Route; stats: RouteStats; expanded: Int32Array }
  | { ok: false; reason: string; stats: Pick<RouteStats, "explored" | "labels" | "ms" | "search">; expanded: Int32Array };

class MinHeap {
  keys: Float64Array;
  vals: Int32Array;
  n = 0;
  constructor(cap = 4096) {
    this.keys = new Float64Array(cap);
    this.vals = new Int32Array(cap);
  }
  push(k: number, v: number) {
    if (this.n === this.keys.length) {
      const nk = new Float64Array(this.n * 2);
      const nv = new Int32Array(this.n * 2);
      nk.set(this.keys);
      nv.set(this.vals);
      this.keys = nk;
      this.vals = nv;
    }
    const keys = this.keys;
    const vals = this.vals;
    let i = this.n++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= k) break;
      keys[i] = keys[p];
      vals[i] = vals[p];
      i = p;
    }
    keys[i] = k;
    vals[i] = v;
  }
  pop(): number {
    const keys = this.keys;
    const vals = this.vals;
    const top = vals[0];
    const n = --this.n;
    if (n > 0) {
      const k = keys[n];
      const v = vals[n];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && keys[c + 1] < keys[c]) c++;
        if (keys[c] >= k) break;
        keys[i] = keys[c];
        vals[i] = vals[c];
        i = c;
      }
      keys[i] = k;
      vals[i] = v;
    }
    return top;
  }
}

/** Marks every cell touched by a keep-out circle. Conservative: radius + half a cell diagonal. */
export function keepOutMask(world: World, zones: KeepOut[]): Uint8Array {
  const blocked = new Uint8Array(world.w * world.h);
  const reach = CELL / SQRT2;
  for (const zn of zones) {
    const rr = zn.r + reach;
    const i0 = Math.max(0, Math.floor((zn.x - rr) / CELL));
    const i1 = Math.min(world.w - 1, Math.ceil((zn.x + rr) / CELL));
    const j0 = Math.max(0, Math.floor((zn.y - rr) / CELL));
    const j1 = Math.min(world.h - 1, Math.ceil((zn.y + rr) / CELL));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (Math.hypot((i + 0.5) * CELL - zn.x, (j + 0.5) * CELL - zn.y) <= rr) blocked[j * world.w + i] = 1;
      }
    }
  }
  return blocked;
}

/** True when the rover may stand on this cell. */
export const standable = (world: World, cell: number, blocked: Uint8Array) => !blocked[cell] && world.cls[cell] !== 2;

/** Is cell lit at absolute time `a` (s)? */
export const isLitAt = (world: World, cell: number, a: number) => {
  const k = Math.min(FRAMES - 1, Math.max(0, Math.floor(a / FRAME_S)));
  return ((world.lit[cell] >>> k) & 1) === 1;
};

/** Earliest time ≥ a at which the cell is lit (the last frame's lighting holds for ever), or Infinity. */
function nextLit(mask: number, a: number): number {
  const k = Math.min(FRAMES - 1, Math.max(0, Math.floor(a / FRAME_S)));
  if ((mask >>> k) & 1) return a;
  const rest = k + 1 >= 32 ? 0 : mask >>> (k + 1);
  if (rest === 0) return Infinity;
  const low = rest & -rest;
  const j = k + 1 + (31 - Math.clz32(low));
  return j * FRAME_S;
}

type Scratch = { b: number; ell: number; dt: number; dz: number; cost: number };

/** Builds the per-plan move evaluator: legality, 3-D length, time and the objective's cost for a → neighbour k. */
function createMover(world: World, p: PlanParams, blocked: Uint8Array) {
  const { w, h, z, gx, gy, slope, cls, hazard } = world;
  const fastest = p.objective === "fastest";
  const v = p.speed;
  const slopeAware = p.slopeAware;
  // per-cell terms that don't depend on the direction of travel
  const rhoRaster = new Float64Array(w * h);
  const eta = new Float64Array(w * h);
  if (!fastest) {
    for (let i = 0; i < rhoRaster.length; i++) {
      const r = slope[i] / SAFE_DEG;
      rhoRaster[i] = 1 + K_FLAT * r * r;
      eta[i] = W_C * Math.max(0, 1 - hazard[i] / HAZ_D);
    }
  }
  return (a: number, k: number, o: Scratch): boolean => {
    const ix = a % w;
    const iy = (a / w) | 0;
    const nx = ix + DX[k];
    const ny = iy + DY[k];
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) return false;
    const b = ny * w + nx;
    if (blocked[b]) return false;
    const diag = DX[k] !== 0 && DY[k] !== 0;
    const planar = diag ? CELL * SQRT2 : CELL;
    const dz = z[b] - z[a];
    if (Math.abs(dz) > planar * TAN_NOGO) return false; // the move itself is too steep
    let m: number;
    let rho = 1;
    if (!slopeAware) {
      const c = cls[b];
      if (c === 2) return false;
      m = c === 1 ? CAUTION_MULT : 1;
      rho = rhoRaster[b];
    } else {
      const ux = diag ? DX[k] / SQRT2 : DX[k];
      const uy = diag ? DY[k] / SQRT2 : DY[k];
      const g = gx[b] * ux + gy[b] * uy; // slope along the direction of travel
      const roll = Math.abs(gx[b] * uy - gy[b] * ux); // slope across it — what tips a rover over
      const pitchDeg = Math.atan(Math.abs(g)) * DEG;
      const rollDeg = Math.atan(roll) * DEG;
      if (pitchDeg > NOGO_DEG || rollDeg > ROLL_NOGO) return false;
      m = pitchDeg > SAFE_DEG || rollDeg > ROLL_SAFE ? CAUTION_MULT : 1;
      if (!fastest) {
        const rp = rollDeg / ROLL_SAFE;
        rho =
          g >= 0
            ? 1 + K_FLAT * (pitchDeg / SAFE_DEG) ** 2 + K_FLAT * rp * rp
            : 1 - B_DOWN * Math.min(pitchDeg / SAFE_DEG, 1) + K_FLAT * rp * rp;
      }
    }
    const ell = Math.hypot(planar, dz);
    const dt = (ell * m) / v;
    o.b = b;
    o.ell = ell;
    o.dt = dt;
    o.dz = dz;
    o.cost = fastest ? dt : W_S * ell * m * rho + ell * eta[b] + W_E * ((P_DRIVE * dt) / 3600 + C_UP * (dz > 0 ? dz : 0));
    return true;
  };
}

/** Cost per straight-line metre that no move can undercut — the A* bound. */
function kappaOf(p: PlanParams): number {
  if (p.objective === "fastest") return 1 / p.speed;
  const rhoMin = p.slopeAware ? 1 - B_DOWN : 1;
  return W_S * rhoMin + (W_E * P_DRIVE) / (3600 * p.speed);
}

const failStats = (explored: number, labels: number, ms: number, search: RouteStats["search"]) => ({ explored, labels, ms, search });

/**
 * Plans one leg. Spatial search (cell state) normally; the time-aware search (cell + clock, waiting allowed)
 * when "drive in sunlight only" is on. Both are exact for their cost model; `algo` only changes how much of
 * the map is explored.
 */
export function plan(world: World, p: PlanParams): PlanResult {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const { w, h } = world;
  const blocked = keepOutMask(world, p.keepOuts);
  const timed = p.requireLight;
  const search: RouteStats["search"] = timed ? "time-aware" : "spatial";
  const fail = (reason: string, explored = 0, labels = 0, expanded = new Int32Array(0)): PlanResult => ({
    ok: false,
    reason,
    stats: failStats(explored, labels, now() - t0, search),
    expanded,
  });

  if (!standable(world, p.start, blocked)) return fail("A is on ground the rover can’t stand on. Move it to flatter ground, or out of the keep-out zone.");
  if (!standable(world, p.goal, blocked)) return fail("B is on ground the rover can’t stand on. Move it to flatter ground, or out of the keep-out zone.");
  if (p.start === p.goal) return fail("A and B are on the same spot. Move one of them.");

  const mv = createMover(world, p, blocked);
  const o: Scratch = { b: 0, ell: 0, dt: 0, dz: 0, cost: 0 };
  const gxc = p.goal % w;
  const gyc = (p.goal / w) | 0;
  const kappa = p.algo === "astar" ? kappaOf(p) : 0;
  const hOf = (c: number) => (kappa === 0 ? 0 : kappa * CELL * Math.hypot((c % w) - gxc, ((c / w) | 0) - gyc));
  const heap = new MinHeap(8192);
  const expandedList: number[] = [];
  const seen = new Uint8Array(w * h);
  let labels = 0;

  let path: number[] = [];
  let times: number[] = [];
  let waits: number[] = [];
  let cost = 0;

  if (!timed) {
    const g = new Float64Array(w * h).fill(Infinity);
    const parent = new Int32Array(w * h).fill(-1);
    const closed = new Uint8Array(w * h);
    g[p.start] = 0;
    heap.push(hOf(p.start), p.start);
    let found = false;
    while (heap.n > 0) {
      const a = heap.pop();
      if (closed[a]) continue;
      closed[a] = 1;
      labels++;
      expandedList.push(a);
      if (a === p.goal) {
        found = true;
        break;
      }
      for (let k = 0; k < 8; k++) {
        if (!mv(a, k, o)) continue;
        const b = o.b;
        if (closed[b]) continue;
        const ng = g[a] + o.cost;
        if (ng < g[b]) {
          g[b] = ng;
          parent[b] = a;
          heap.push(ng + hOf(b), b);
        }
      }
    }
    const expanded = Int32Array.from(expandedList);
    if (!found) return fail("Keep-out zones and steep ground block every way from A to B.", expandedList.length, labels, expanded);
    cost = g[p.goal];
    for (let c = p.goal; c !== -1; c = parent[c]) path.push(c);
    path.reverse();
  } else {
    // ── time-aware search: labels (cell, cost, clock). Waiting costs the Safest stationary-energy rate, or time. ──
    const dep = p.departFrame * FRAME_S;
    const fastest = p.objective === "fastest";
    const cWait = fastest ? 1 : (W_E * P_STAT) / 3600;
    let cap = 1 << 15;
    let lCell = new Int32Array(cap);
    let lG = new Float64Array(cap);
    let lT = new Float64Array(cap);
    let lPar = new Int32Array(cap);
    let lWait = new Float64Array(cap);
    let lNext = new Int32Array(cap);
    const head = new Int32Array(w * h).fill(-1);
    let nl = 0;
    const MAX_LABELS = 3_000_000;
    const newLabel = (cell: number, g: number, t: number, par: number, wait: number) => {
      if (nl === cap) {
        cap *= 2;
        const grow = <T extends Int32Array | Float64Array | Float32Array>(arr: T, ctor: { new (n: number): T }) => {
          const n = new ctor(cap);
          n.set(arr as never);
          return n;
        };
        lCell = grow(lCell, Int32Array);
        lG = grow(lG, Float64Array);
        lT = grow(lT, Float64Array);
        lPar = grow(lPar, Int32Array);
        lWait = grow(lWait, Float64Array);
        lNext = grow(lNext, Int32Array);
      }
      lCell[nl] = cell;
      lG[nl] = g;
      lT[nl] = t;
      lPar[nl] = par;
      lWait[nl] = wait;
      lNext[nl] = -1;
      return nl++;
    };

    // A kept label j dominates a candidate (cell, g, t) when it is no later (within the time tolerance) and, even
    // after waiting out any difference, no costlier (within the cost tolerance). Without the tolerances,
    // near-identical routes pile up at every cell.
    const T_TOL = 10;
    const G_TOL = fastest ? 0 : 0.6;
    const dominatedAt = (cell: number, g: number, t: number) => {
      for (let j = head[cell]; j >= 0; j = lNext[j]) {
        if (lT[j] <= t + T_TOL && lG[j] + cWait * Math.max(0, t - lT[j]) <= g + G_TOL) return true;
      }
      return false;
    };

    const first = nextLit(world.lit[p.start], dep);
    if (first === Infinity) return fail("A is never in sunlight. Turn off Sunlight only, or move A.");
    const w0 = first - dep;
    heap.push(hOf(p.start) + cWait * w0, newLabel(p.start, cWait * w0, w0, -1, 0));
    let goalLabel = -1;
    let overflow = false;
    while (heap.n > 0) {
      const L = heap.pop();
      const c = lCell[L];
      if (dominatedAt(c, lG[L], lT[L])) continue;
      lNext[L] = head[c];
      head[c] = L;
      labels++;
      if (!seen[c]) {
        seen[c] = 1;
        expandedList.push(c);
      }
      if (c === p.goal) {
        goalLabel = L;
        break;
      }
      for (let k = 0; k < 8; k++) {
        if (!mv(c, k, o)) continue;
        const b = o.b;
        let tArr = lT[L] + o.dt;
        let wait = 0;
        const al = nextLit(world.lit[b], dep + tArr);
        if (al === Infinity) continue;
        if (al > dep + tArr) {
          wait = al - (dep + tArr);
          tArr += wait;
        }
        const ng = lG[L] + o.cost + cWait * wait;
        if (dominatedAt(b, ng, tArr)) continue;
        heap.push(ng + hOf(b), newLabel(b, ng, tArr, L, wait));
        if (nl > MAX_LABELS) {
          overflow = true;
          break;
        }
      }
      if (overflow) break;
    }
    const expanded = Int32Array.from(expandedList);
    if (overflow) return fail("The search grew too large. Move A or B closer, or turn off Sunlight only.", expandedList.length, labels, expanded);
    if (goalLabel < 0) {
      const everLit = nextLit(world.lit[p.goal], dep) !== Infinity;
      if (!everLit) return fail("B is never in sunlight. Turn off Sunlight only.", expandedList.length, labels, expanded);
      const dark = plan(world, { ...p, requireLight: false });
      if (dark.ok) return fail("No sunlit way reaches B. Turn off Sunlight only.", expandedList.length, labels, expanded);
      return fail("Keep-out zones and steep ground block every way from A to B.", expandedList.length, labels, expanded);
    }
    cost = lG[goalLabel];
    const chain: number[] = [];
    for (let L = goalLabel; L !== -1; L = lPar[L]) chain.push(L);
    chain.reverse();
    path = chain.map((L) => lCell[L]);
    times = chain.map((L) => lT[L]);
    waits = chain.map((L) => lWait[L]);
    // the start may itself have waited for the light
    waits[0] = lT[chain[0]];
  }

  const expanded = Int32Array.from(expandedList);

  /* ── assemble the route: times, distances, statistics ── */
  const n = path.length;
  const cells = Int32Array.from(path);
  const d = new Float64Array(n);
  const t = new Float64Array(n);
  const wt = new Float64Array(n);
  let dist = 0;
  let clock = 0;
  let climb = 0;
  let descent = 0;
  let steepest = 0;
  let waitTotal = 0;
  let litTime = 0;
  const dep = p.departFrame * FRAME_S;
  if (timed) {
    t[0] = times[0];
    wt[0] = waits[0];
    waitTotal += waits[0];
    clock = times[0];
    // the rover may sit at A until it is lit
    litTime += litSeconds(world, cells[0], dep, dep + waits[0]);
  }
  steepest = world.slope[cells[0]];
  for (let i = 1; i < n; i++) {
    const a = cells[i - 1];
    const b = cells[i];
    const ax = a % w;
    const ay = (a / w) | 0;
    const bx = b % w;
    const by = (b / w) | 0;
    const planar = ax !== bx && ay !== by ? CELL * SQRT2 : CELL;
    const dz = world.z[b] - world.z[a];
    const ell = Math.hypot(planar, dz);
    dist += ell;
    if (dz > 0) climb += dz;
    else descent -= dz;
    if (world.slope[b] > steepest) steepest = world.slope[b];
    d[i] = dist;
    // drive time for the move (re-derived so spatial and time-aware agree)
    const drive = (ell * moveMultiplier(world, p, ax, ay, bx, by, b)) / p.speed;
    if (timed) {
      // wait at the previous cell first (until the next cell lights up), then drive
      const waited = waits[i];
      wt[i] = waited;
      waitTotal += waited;
      litTime += litSeconds(world, a, dep + times[i - 1], dep + times[i - 1] + waited);
      litTime += litSeconds(world, b, dep + times[i] - drive, dep + times[i]);
      t[i] = times[i];
      clock = times[i];
    } else {
      litTime += litSeconds(world, b, dep + clock, dep + clock + drive);
      clock += drive;
      t[i] = clock;
    }
  }
  const total = n > 1 ? t[n - 1] : 0;
  const stats: RouteStats = {
    distance: dist,
    time: total,
    wait: waitTotal,
    steepest,
    climb,
    descent,
    sunShare: total > 0 ? Math.min(1, litTime / total) : 0,
    cost,
    explored: expandedList.length,
    labels,
    ms: now() - t0,
    search,
  };
  return { ok: true, route: { cells, t, wait: wt, d }, stats, expanded };
}

/** The terrain multiplier the search used for the move into `b` (re-derived for the route's statistics). */
function moveMultiplier(world: World, p: PlanParams, ax: number, ay: number, bx: number, by: number, b: number): number {
  if (!p.slopeAware) return world.cls[b] === 1 ? CAUTION_MULT : 1;
  const dxi = bx - ax;
  const dyi = by - ay;
  const diag = dxi !== 0 && dyi !== 0;
  const ux = diag ? dxi / SQRT2 : dxi;
  const uy = diag ? dyi / SQRT2 : dyi;
  const g = world.gx[b] * ux + world.gy[b] * uy;
  const roll = Math.abs(world.gx[b] * uy - world.gy[b] * ux);
  const pitchDeg = Math.atan(Math.abs(g)) * DEG;
  const rollDeg = Math.atan(roll) * DEG;
  return pitchDeg > SAFE_DEG || rollDeg > ROLL_SAFE ? CAUTION_MULT : 1;
}

/** Seconds within [a0, a1] (absolute time) that the cell is in sunlight; the last frame's lighting holds. */
function litSeconds(world: World, cell: number, a0: number, a1: number): number {
  if (a1 <= a0) return 0;
  const mask = world.lit[cell];
  let total = 0;
  let a = Math.max(0, a0);
  while (a < a1) {
    const k = Math.min(FRAMES - 1, Math.floor(a / FRAME_S));
    const end = k >= FRAMES - 1 ? a1 : Math.min(a1, (k + 1) * FRAME_S);
    if ((mask >>> k) & 1) total += end - a;
    a = end;
  }
  return total;
}

/* ── playback ─────────────────────────────────────────────────────────── */

export type RoverSample = {
  /** Fractional cell coordinates. */
  x: number;
  y: number;
  /** Index of the route cell the rover has most recently reached. */
  seg: number;
  /** Standing still, waiting for the light. */
  waiting: boolean;
  /** 3-D distance driven so far, m. */
  dist: number;
};

/** Where the rover is `time` seconds after departure. */
export function sampleRoute(world: World, route: Route, time: number, out: RoverSample = { x: 0, y: 0, seg: 0, waiting: false, dist: 0 }): RoverSample {
  const { cells, t, wait, d } = route;
  const n = cells.length;
  const w = world.w;
  if (time <= 0 || n === 1) {
    out.x = (cells[0] % w) + 0.5;
    out.y = ((cells[0] / w) | 0) + 0.5;
    out.seg = 0;
    out.dist = 0;
    out.waiting = n > 0 && wait[0] > 0 && time < wait[0];
    return out;
  }
  if (time >= t[n - 1]) {
    const c = cells[n - 1];
    out.x = (c % w) + 0.5;
    out.y = ((c / w) | 0) + 0.5;
    out.seg = n - 1;
    out.dist = d[n - 1];
    out.waiting = false;
    return out;
  }
  // binary search for the move whose arrival is first ≥ time
  let lo = 1;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (t[mid] < time) lo = mid + 1;
    else hi = mid;
  }
  const i = lo;
  const a = cells[i - 1];
  const b = cells[i];
  const arrive = t[i];
  const waitI = wait[i];
  // the move into b: waits at a for `waitI`, then drives until `arrive`
  const drive = arrive - waitI - t[i - 1];
  const driveStart = t[i - 1] + waitI;
  out.seg = i - 1;
  if (time < driveStart) {
    out.x = (a % w) + 0.5;
    out.y = ((a / w) | 0) + 0.5;
    out.dist = d[i - 1];
    out.waiting = true;
    return out;
  }
  const f = drive > 1e-9 ? Math.min(1, (time - driveStart) / drive) : 1;
  out.dist = d[i - 1] + (d[i] - d[i - 1]) * f;
  out.x = (a % w) + 0.5 + ((b % w) - (a % w)) * f;
  out.y = ((a / w) | 0) + 0.5 + (((b / w) | 0) - ((a / w) | 0)) * f;
  out.waiting = false;
  return out;
}

/** Which lighting frame is showing `seconds` after the departure frame started. */
export const frameAt = (departFrame: number, seconds: number) => Math.min(FRAMES - 1, Math.max(0, Math.floor((departFrame * FRAME_S + seconds) / FRAME_S)));

/** Cell coordinates ↔ index helpers. */
export const cellIndex = (x: number, y: number) => y * GW + x;
