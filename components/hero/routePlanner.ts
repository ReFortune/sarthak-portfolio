import { corridorX, heightAt } from "@/lib/terrain";

/* ─────────────────────────────────────────────────────────────────────────────
   HERO ROUTE PLANNER

   A small grid planner over the same height field the point cloud is built from.
   Every second or so it plans a route from the rover across a window of 1 m cells
   (31 m wide, ~110 m ahead) and the hero draws the first stretch of it.

   · Cost is distance, multiplied up on slopes (free below 5°, ×6 at the limit, and a
     steep penalty beyond it), plus a margin around steep ground (crater walls).
   · Every move goes forward (straight on, or one cell to either side), so the cheapest
     route is found exactly, row by row, by dynamic programming. The 45° corners of the
     grid path are then rounded off with two passes of corner cutting and the route is
     resampled onto the surface.
   · It looks further ahead than it draws, and a small pull towards the previous plan
     keeps successive routes from shimmering.

   Pure TypeScript (no three.js), so it can be checked on its own.
   ───────────────────────────────────────────────────────────────────────────── */

const COLS = 31; // 1 m cells across the corridor (±15 m: the valley floor, clear of the mountains)
const HALF = 15;
const DEG = Math.PI / 180;
const S0 = Math.tan(5 * DEG); // ground gentler than this costs nothing extra
const LIFT = 0.14; // the route floats just above the surface so it never sinks into the cloud
const LATERAL = 0.03; // per metre of offset from the corridor centre
export const WAYPOINT_EVERY = 15; // m
const MAX_WAYPOINTS = 6;

/** Column steps of a forward move: straight on, or one cell to either side. */
const DI = [0, 1, -1] as const;

export type PlannerOptions = {
  /** Spacing of the resampled route (m). */
  step?: number;
  /** Rows (metres) searched ahead of the rover. Looking further than the route is drawn keeps the drawn part steady between plans. */
  ahead?: number;
  /** Rows (metres) of that route that are returned and drawn. */
  show?: number;
  /** Slope limit (degrees): the cost is ×6 at this slope and rises steeply beyond it. */
  limitDeg?: number;
  /** Cost per metre of offset from the previous plan's route, so successive plans agree. */
  hysteresis?: number;
};

/** Extra cost per metre for ground of this slope (rise ÷ run): none when gentle, ×6 at the limit, steeply more beyond it. */
export function makePenalty(limitDeg: number): (s: number) => number {
  const SL = Math.tan(limitDeg * DEG);
  return (s) => {
    if (s <= S0) return 0;
    const t = (s - S0) / (SL - S0);
    return s <= SL ? 5 * t * t : 5 + (40 * (s - SL)) / SL;
  };
}

export type RoutePlan = {
  /** Route points (x, y, z) and their distance along the route from the rover (m). */
  n: number;
  pos: Float32Array;
  s: Float32Array;
  /** Waypoints every `WAYPOINT_EVERY` metres: how many, and the route vertex each sits on. */
  wayN: number;
  wayK: Int32Array;
  /** Outline of the ground steeper than the limit, ahead of the camera: line segments (ax, ay, az, bx, by, bz, strength 0–1). */
  segN: number;
  seg: Float32Array;
  /** 3-D length of the part of the route that is returned (m). */
  length: number;
  /** Steepest step between neighbouring cells along the planned path (degrees). */
  maxSlope: number;
  /** Cells in the returned stretch of the window that are steeper than the limit. */
  blocked: number;
  /** Time spent planning (ms). */
  ms: number;
};

export function createPlan(maxPts = 400, maxSeg = 900): RoutePlan {
  return {
    n: 0,
    pos: new Float32Array(maxPts * 3),
    s: new Float32Array(maxPts),
    wayN: 0,
    wayK: new Int32Array(MAX_WAYPOINTS),
    segN: 0,
    seg: new Float32Array(maxSeg * 7),
    length: 0,
    maxSlope: 0,
    blocked: 0,
    ms: 0,
  };
}

const mod = (a: number, b: number) => ((a % b) + b) % b;
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export class RoutePlanner {
  readonly step: number;
  readonly ahead: number;
  readonly show: number;
  readonly limitDeg: number;
  readonly hysteresis: number;
  /** Plans made so far. */
  plans = 0;
  /** Cost of the last grid path (for checks). */
  lastCost = 0;

  private readonly rows: number;
  private readonly ring: number;
  private readonly SL: number;
  private readonly penalty: (s: number) => number;

  // terrain heights: a ring of rows addressed by absolute row index j (z = j metres)
  private readonly h: Float32Array;
  private readonly rowX: Float32Array;
  private readonly rowId: Int32Array;

  // the window of the current plan
  private readonly wh: Float32Array;
  private readonly rx: Float64Array;
  private readonly risk: Float32Array;
  private readonly riskPen: Float32Array;
  private readonly g: Float32Array;
  private readonly parent: Int32Array;
  private readonly path: Int32Array;
  private readonly pathX: Float64Array;

  // the previous plan's lateral offset per row, for hysteresis
  private prevU: Float32Array;
  private nextU: Float32Array;
  private prevJ0 = 0;
  private hasPrev = false;
  private readonly pu: Float32Array;

  // scratch for the smoothing passes (x, z pairs)
  private a = new Float64Array(2 * 4096);
  private b = new Float64Array(2 * 4096);

  constructor(opts: PlannerOptions = {}) {
    this.step = opts.step ?? 0.5;
    this.ahead = opts.ahead ?? 110;
    this.show = Math.min(opts.show ?? 76, this.ahead);
    this.limitDeg = opts.limitDeg ?? 25;
    this.hysteresis = opts.hysteresis ?? 0.25;
    this.SL = Math.tan(this.limitDeg * DEG);
    this.penalty = makePenalty(this.limitDeg);
    const rows = (this.rows = this.ahead + 1);
    const n = COLS * rows;
    this.ring = this.ahead + 48;
    this.h = new Float32Array(this.ring * COLS);
    this.rowX = new Float32Array(this.ring);
    this.rowId = new Int32Array(this.ring).fill(-(1 << 30));
    this.wh = new Float32Array(n);
    this.rx = new Float64Array(rows);
    this.risk = new Float32Array(n);
    this.riskPen = new Float32Array(n);
    this.g = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.path = new Int32Array(rows + 1);
    this.pathX = new Float64Array(rows + 2);
    this.prevU = new Float32Array(rows).fill(NaN);
    this.nextU = new Float32Array(rows).fill(NaN);
    this.pu = new Float32Array(rows);
  }

  /** Fill terrain rows for the window ahead of z0, a few at a time, nearest first. True once the whole window is cached. */
  prime(z0: number, maxRows: number): boolean {
    const j0 = Math.floor(z0);
    let done = 0;
    for (let r = 0; r < this.rows; r++) {
      const j = j0 + r;
      const slot = mod(j, this.ring);
      if (this.rowId[slot] === j) continue;
      if (done >= maxRows) return false;
      const cx = corridorX(j);
      this.rowX[slot] = cx;
      const base = slot * COLS;
      for (let i = 0; i < COLS; i++) this.h[base + i] = heightAt(cx + (i - HALF), j);
      this.rowId[slot] = j;
      done++;
    }
    return true;
  }

  /** Plan from world (x0, z0) forward. The window must be primed; returns false (leaving `out` untouched) if it is not. */
  plan(x0: number, z0: number, out: RoutePlan): boolean {
    const t0 = now();
    const j0 = Math.floor(z0);
    const { wh, rx, risk, riskPen, g, parent, pu, rows, ring, SL, penalty, hysteresis } = this;
    const AHEAD = this.ahead;
    const SHOW = this.show;

    /* copy the window out of the ring */
    for (let r = 0; r < rows; r++) {
      const j = j0 + r;
      const slot = mod(j, ring);
      if (this.rowId[slot] !== j) return false;
      rx[r] = this.rowX[slot];
      const base = slot * COLS;
      for (let i = 0; i < COLS; i++) wh[r * COLS + i] = this.h[base + i];
    }

    /* risk: the steepest step to a neighbouring cell. The margin it adds is what keeps routes off crater walls */
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < COLS; i++) {
        const n = r * COLS + i;
        const h0 = wh[n];
        let m = 0;
        if (i > 0) m = Math.max(m, Math.abs(wh[n - 1] - h0));
        if (i < COLS - 1) m = Math.max(m, Math.abs(wh[n + 1] - h0));
        if (r > 0) m = Math.max(m, Math.abs(wh[n - COLS] - h0));
        if (r < rows - 1) m = Math.max(m, Math.abs(wh[n + COLS] - h0));
        risk[n] = m;
        riskPen[n] = 0.8 * penalty(m);
      }
    }

    /* the previous plan's lateral offset, row by row, in this window's indexing */
    for (let r = 0; r < rows; r++) {
      const k = j0 + r - this.prevJ0;
      pu[r] = this.hasPrev && k >= 0 && k < rows ? this.prevU[k] : NaN;
    }

    /* dynamic programming: from the rover's cell, row by row, to the cheapest cell of the far row */
    const start = Math.min(COLS - 1, Math.max(0, Math.round(x0 - rx[0]) + HALF));
    g.fill(1e9);
    g[start] = 0;
    parent[start] = -1;
    for (let r = 0; r < AHEAD; r++) {
      const r2 = r + 1;
      const rxa = rx[r];
      const rxb = rx[r2];
      const p = pu[r2];
      const hasP = p === p;
      for (let i = 0; i < COLS; i++) {
        const n = r * COLS + i;
        const gn = g[n];
        if (gn >= 1e8) continue;
        const ax = rxa + (i - HALF);
        const hn = wh[n];
        for (let k = 0; k < 3; k++) {
          const i2 = i + DI[k];
          if (i2 < 0 || i2 >= COLS) continue;
          const m = r2 * COLS + i2;
          const dx = rxb + (i2 - HALF) - ax;
          const horiz = Math.sqrt(dx * dx + 1);
          const dh = wh[m] - hn;
          const len = Math.sqrt(horiz * horiz + dh * dh);
          const u2 = i2 - HALF;
          let extra = LATERAL * Math.abs(u2);
          if (hasP) extra += hysteresis * Math.abs(u2 - p);
          const c = gn + len * (1 + penalty(Math.abs(dh) / horiz) + riskPen[m]) + extra * horiz;
          if (c < g[m]) {
            g[m] = c;
            parent[m] = n;
          }
        }
      }
    }
    let goal = -1;
    let best = 1e9;
    for (let i = 0; i < COLS; i++) {
      const n = AHEAD * COLS + i;
      if (g[n] < best) {
        best = g[n];
        goal = n;
      }
    }
    if (goal < 0) return false;
    this.lastCost = best;

    /* cells → world polyline: the rover's exact position, then each cell ahead of it (up to the part that is drawn) */
    const path = this.path;
    let count = 0;
    for (let n = goal; n >= 0; n = parent[n]) path[count++] = n;
    let pa = this.a;
    let pb = this.b;
    pa[0] = x0;
    pa[1] = z0;
    let np = 1;
    this.nextU.fill(NaN);
    let gridSlope = 0; // steepest step between neighbouring cells along the drawn part of the path
    let prevN = -1;
    for (let c = count - 1; c >= 0; c--) {
      const n = path[c];
      const r = (n / COLS) | 0;
      const i = n - r * COLS;
      this.nextU[r] = i - HALF;
      if (prevN >= 0 && r <= SHOW) {
        const r0 = r - 1;
        const i0 = prevN - r0 * COLS;
        const dx = rx[r] + (i - HALF) - (rx[r0] + (i0 - HALF));
        gridSlope = Math.max(gridSlope, Math.abs(wh[n] - wh[prevN]) / Math.sqrt(dx * dx + 1));
      }
      prevN = n;
      const z = j0 + r;
      if (z < z0 + 0.3 || r > SHOW + 2) continue; // behind the rover, or beyond the drawn part (plus a little, so the end is smooth)
      pa[np * 2] = rx[r] + (i - HALF);
      pa[np * 2 + 1] = z;
      np++;
    }
    const swap = this.prevU;
    this.prevU = this.nextU;
    this.nextU = swap;
    this.prevJ0 = j0;
    this.hasPrev = true;

    /* soften the heading changes: two passes of a [1 2 3 2 1] filter over the lateral position (the rover's own cell and the far end stay put) */
    for (let pass = 0; pass < 2; pass++) {
      for (let k = 0; k < np; k++) {
        pb[k] = k < 2 || k > np - 3 ? pa[k * 2] : (pa[(k - 2) * 2] + 2 * pa[(k - 1) * 2] + 3 * pa[k * 2] + 2 * pa[(k + 1) * 2] + pa[(k + 2) * 2]) / 9;
      }
      for (let k = 0; k < np; k++) pa[k * 2] = pb[k];
    }

    /* two passes of corner cutting */
    for (let pass = 0; pass < 2 && np * 2 + 4 < pa.length / 2; pass++) {
      let nq = 1;
      pb[0] = pa[0];
      pb[1] = pa[1];
      for (let k = 0; k < np - 1; k++) {
        const x1 = pa[k * 2], z1 = pa[k * 2 + 1], x2 = pa[k * 2 + 2], z2 = pa[k * 2 + 3];
        pb[nq * 2] = 0.75 * x1 + 0.25 * x2;
        pb[nq * 2 + 1] = 0.75 * z1 + 0.25 * z2;
        nq++;
        pb[nq * 2] = 0.25 * x1 + 0.75 * x2;
        pb[nq * 2 + 1] = 0.25 * z1 + 0.75 * z2;
        nq++;
      }
      pb[nq * 2] = pa[(np - 1) * 2];
      pb[nq * 2 + 1] = pa[(np - 1) * 2 + 1];
      nq++;
      const t = pa;
      pa = pb;
      pb = t;
      np = nq;
    }

    /* resample at a fixed spacing, onto the surface */
    const maxPts = out.s.length;
    const step = this.step;
    const zEnd = z0 + SHOW;
    let n = 0;
    let want = 0; // horizontal arc length of the next sample
    let walked = 0; // horizontal arc length at the start of the current segment
    let s3 = 0;
    let prevX = 0, prevY = 0, prevZ = 0;
    for (let k = 0; k < np - 1 && n < maxPts; k++) {
      const x1 = pa[k * 2], z1 = pa[k * 2 + 1];
      const dx = pa[k * 2 + 2] - x1, dz = pa[k * 2 + 3] - z1;
      const segLen = Math.sqrt(dx * dx + dz * dz);
      if (segLen < 1e-9) continue;
      while (want <= walked + segLen && n < maxPts) {
        const t = (want - walked) / segLen;
        const x = x1 + dx * t;
        const z = z1 + dz * t;
        if (z > zEnd) break;
        const y = heightAt(x, z);
        if (n > 0) {
          const hd = Math.sqrt((x - prevX) * (x - prevX) + (z - prevZ) * (z - prevZ));
          const dy = y - prevY;
          s3 += Math.sqrt(hd * hd + dy * dy);
        }
        out.pos[n * 3] = x;
        out.pos[n * 3 + 1] = y + LIFT;
        out.pos[n * 3 + 2] = z;
        out.s[n] = s3;
        prevX = x; prevY = y; prevZ = z;
        n++;
        want += step;
      }
      walked += segLen;
    }
    out.n = n;
    out.length = s3;
    out.maxSlope = Math.atan(gridSlope) / DEG;

    /* waypoints: the first vertex at or beyond every WAYPOINT_EVERY metres */
    let w = 0;
    for (let d = WAYPOINT_EVERY, k = 1; k < n && w < MAX_WAYPOINTS; k++) {
      if (out.s[k] < d) continue;
      out.wayK[w++] = k;
      d += WAYPOINT_EVERY;
    }
    out.wayN = w;

    /* steep ground: count it, and trace its outline (marching squares over the risk map, so the line sits exactly at the limit) */
    let blocked = 0;
    for (let r = 0; r <= SHOW; r++) for (let i = 0; i < COLS; i++) if (risk[r * COLS + i] > SL) blocked++;
    out.blocked = blocked;
    // only the ground the plan is negotiating: its lateral distance to the planned path sets how strongly an outline shows
    const pathX = this.pathX;
    for (let r = 0; r <= SHOW + 1; r++) pathX[r] = this.prevU[r] === this.prevU[r] ? rx[r] + this.prevU[r] : NaN;
    let sg = 0;
    const maxSeg = out.seg.length / 7;
    const seg = out.seg;
    // a crossing of the limit on the edge between two cells: where along it, in world space
    const at = (n0: number, r0: number, i0: number, n1: number, r1: number, i1: number, o: number) => {
      const a0 = risk[n0], a1 = risk[n1];
      const t = a1 === a0 ? 0.5 : Math.min(1, Math.max(0, (SL - a0) / (a1 - a0)));
      const x0 = rx[r0] + (i0 - HALF), x1 = rx[r1] + (i1 - HALF);
      seg[o] = x0 + (x1 - x0) * t;
      seg[o + 1] = wh[n0] + (wh[n1] - wh[n0]) * t + 0.07;
      seg[o + 2] = j0 + r0 + (r1 - r0) * t;
    };
    for (let r = 4; r < SHOW && sg + 2 <= maxSeg; r++) {
      for (let i = 0; i < COLS - 1; i++) {
        const n00 = r * COLS + i, n10 = n00 + 1, n01 = n00 + COLS, n11 = n01 + 1;
        const v00 = risk[n00], v10 = risk[n10], v01 = risk[n01], v11 = risk[n11];
        const code = (v00 > SL ? 1 : 0) | (v10 > SL ? 2 : 0) | (v11 > SL ? 4 : 0) | (v01 > SL ? 8 : 0);
        if (code === 0 || code === 15) continue;
        const w = Math.min(1, (Math.max(v00, v10, v01, v11) - SL) / SL);
        // edges: 0 bottom (00–10), 1 right (10–11), 2 top (01–11), 3 left (00–01)
        const edge = (e: number, o: number) => {
          if (e === 0) at(n00, r, i, n10, r, i + 1, o);
          else if (e === 1) at(n10, r, i + 1, n11, r + 1, i + 1, o);
          else if (e === 2) at(n01, r + 1, i, n11, r + 1, i + 1, o);
          else at(n00, r, i, n01, r + 1, i, o);
        };
        let pairs: number[];
        switch (code) {
          case 1: case 14: pairs = [3, 0]; break;
          case 2: case 13: pairs = [0, 1]; break;
          case 3: case 12: pairs = [3, 1]; break;
          case 4: case 11: pairs = [1, 2]; break;
          case 6: case 9: pairs = [0, 2]; break;
          case 7: case 8: pairs = [3, 2]; break;
          case 5: pairs = (v00 + v10 + v01 + v11) / 4 > SL ? [3, 2, 0, 1] : [3, 0, 1, 2]; break;
          default: pairs = (v00 + v10 + v01 + v11) / 4 > SL ? [3, 0, 1, 2] : [0, 1, 2, 3]; // 10
        }
        for (let q = 0; q < pairs.length && sg < maxSeg; q += 2) {
          const o = sg * 7;
          edge(pairs[q], o);
          edge(pairs[q + 1], o + 3);
          const rm = (seg[o + 2] + seg[o + 5]) / 2 - j0;
          const r0 = Math.min(SHOW, Math.max(0, Math.floor(rm)));
          const px = pathX[r0] + (pathX[r0 + 1] - pathX[r0]) * (rm - r0);
          if (px !== px) continue;
          const dist = Math.abs((seg[o] + seg[o + 3]) / 2 - px);
          const near = 1 - Math.min(1, Math.max(0, (dist - 4) / 9)); // full strength within 4 m of the path, gone by 13 m
          if (near < 0.05) continue;
          seg[o + 6] = near * (0.5 + 0.5 * w);
          sg++;
        }
      }
    }
    out.segN = sg;

    this.plans++;
    out.ms = now() - t0;
    return true;
  }
}
