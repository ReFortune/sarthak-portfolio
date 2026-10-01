/**
 * Procedural planetary terrain — deterministic, allocation-free, pure TypeScript.
 *
 * World units are metres. The same field drives the hero point cloud, the
 * scan-fan ray hits, the camera's terrain-following and the cursor range readout,
 * so everything the visitor sees is consistent.
 *
 * Noise is integer-hash value noise (lowbias32), so it is stable across engines.
 */

/* ── hashing ──────────────────────────────────────────────────────────── */

export function hash32(x: number): number {
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

/** Hash two lattice coordinates + a seed to [0, 1). */
export function hash2(ix: number, iz: number, seed: number): number {
  const h = hash32((Math.imul(ix | 0, 0x27d4eb2d) ^ hash32((Math.imul(iz | 0, 0x165667b1) + seed) | 0)) | 0);
  return h / 4294967296;
}

/* ── value noise + fBm ────────────────────────────────────────────────── */

export function vnoise(x: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
  const v = zf * zf * zf * (zf * (zf * 6 - 15) + 10);
  const a = hash2(xi, zi, seed);
  const b = hash2(xi + 1, zi, seed);
  const c = hash2(xi, zi + 1, seed);
  const d = hash2(xi + 1, zi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Fractal noise, returns roughly [-1, 1]. */
export function fbm(x: number, z: number, seed: number, octaves: number): number {
  let amp = 0.5;
  let sum = 0;
  let norm = 0;
  let fx = x;
  let fz = z;
  for (let i = 0; i < octaves; i++) {
    sum += amp * (vnoise(fx, fz, seed + i * 17) * 2 - 1);
    norm += amp;
    amp *= 0.5;
    fx = fx * 2.03 + 11.7;
    fz = fz * 2.03 - 5.3;
  }
  return sum / norm;
}

/* ── craters ──────────────────────────────────────────────────────────── */

/**
 * One scale of craters on a jittered grid. Profile = parabolic bowl + raised rim +
 * exponentially decaying ejecta blanket. Continuous at the rim.
 */
function craters(
  x: number,
  z: number,
  cell: number,
  seed: number,
  rMin: number,
  rMax: number,
  prob: number,
  depth: number,
  rim: number
): number {
  const cx = Math.floor(x / cell);
  const cz = Math.floor(z / cell);
  let h = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const ix = cx + i;
      const iz = cz + j;
      if (hash2(ix, iz, seed) > prob) continue;
      const R = rMin + (rMax - rMin) * hash2(ix, iz, seed + 3);
      const dx = x - (ix + hash2(ix, iz, seed + 1)) * cell;
      const dz = z - (iz + hash2(ix, iz, seed + 2)) * cell;
      const d2 = dx * dx + dz * dz;
      const reach = R * 2.4;
      if (d2 > reach * reach) continue;
      const d = Math.sqrt(d2) / R;
      if (d < 1) {
        const b = 1 - d * d;
        h -= depth * R * b * (0.62 + 0.38 * b);
      }
      const g = (d - 1) / 0.2;
      h += rim * R * (Math.exp(-g * g) + (d > 1 ? 0.42 * Math.exp(-(d - 1) / 0.85) : 0));
    }
  }
  return h;
}

/* ── the corridor the rover travels along ─────────────────────────────── */

/** Lateral centre of the traverse corridor at world z (gently winding). */
export function corridorX(z: number): number {
  return 7.5 * Math.sin(z / 62) + 3.2 * Math.sin(z / 27 + 1.3);
}

function smooth(a: number, b: number, v: number) {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/* ── height ───────────────────────────────────────────────────────────── */

/** Terrain height (metres) at world (x, z). */
export function heightAt(x: number, z: number): number {
  const rolling = fbm(x * 0.022, z * 0.022, 11, 4) * 3.6;
  const mid = fbm(x * 0.085 + 40, z * 0.085 - 7, 23, 3) * 0.85;
  const grain = (vnoise(x * 1.35, z * 1.35, 37) - 0.5) * 0.08;

  const c =
    craters(x, z, 74, 101, 9, 25, 0.58, 0.2, 0.05) +
    craters(x, z, 27, 202, 3, 8.6, 0.66, 0.19, 0.052) +
    craters(x, z, 9.6, 303, 0.9, 2.9, 0.72, 0.17, 0.06);

  // Mountains flank the corridor so the horizon reads as a valley opening ahead.
  const off = Math.abs(x - corridorX(z));
  const lateral = smooth(16, 58, off);
  let mountains = 0;
  if (lateral > 0) {
    const n = vnoise(x * 0.012, z * 0.012, 71);
    const ridged = 1 - Math.abs(fbm(x * 0.011 + 3, z * 0.011 - 9, 83, 3));
    mountains = lateral * (Math.pow(ridged, 2.6) * 30 + n * 9);
  }

  return rolling + mid + grain + c + mountains;
}

/** Surface normal (unit vector) via forward differences. `h0` may be supplied to save an evaluation. */
export function normalAt(x: number, z: number, h0?: number, e = 0.09): [number, number, number] {
  const h = h0 ?? heightAt(x, z);
  const hx = heightAt(x + e, z);
  const hz = heightAt(x, z + e);
  const nx = -(hx - h) / e;
  const nz = -(hz - h) / e;
  const len = Math.hypot(nx, 1, nz);
  return [nx / len, 1 / len, nz / len];
}

/* ── ray queries ──────────────────────────────────────────────────────── */

export type Hit = { t: number; x: number; y: number; z: number };

/**
 * March a ray until it drops below the terrain, then refine by bisection.
 * `t0`/`t1` bound the search so callers can seed near the expected hit and keep this cheap.
 */
export function raycast(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  t0 = 0.2, t1 = 120, out: Hit = { t: 0, x: 0, y: 0, z: 0 }
): Hit | null {
  let t = t0;
  let prevT = t0;
  let x = ox + dx * t;
  let y = oy + dy * t;
  let z = oz + dz * t;
  if (y < heightAt(x, z)) {
    out.t = t; out.x = x; out.y = y; out.z = z;
    return out;
  }
  while (t < t1) {
    prevT = t;
    t += Math.max(0.08, t * 0.035);
    x = ox + dx * t;
    y = oy + dy * t;
    z = oz + dz * t;
    if (y < heightAt(x, z)) {
      let lo = prevT;
      let hi = t;
      for (let i = 0; i < 6; i++) {
        const mid = (lo + hi) * 0.5;
        const my = oy + dy * mid;
        if (my < heightAt(ox + dx * mid, oz + dz * mid)) hi = mid;
        else lo = mid;
      }
      const tt = (lo + hi) * 0.5;
      out.t = tt;
      out.x = ox + dx * tt;
      out.y = oy + dy * tt;
      out.z = oz + dz * tt;
      return out;
    }
  }
  return null;
}

/* ── colour ramp shared by the renderer ───────────────────────────────── */

const RAMP: [number, number, number, number][] = [
  [0.0, 0.05, 0.12, 0.26],
  [0.3, 0.11, 0.36, 0.62],
  [0.55, 0.3, 0.74, 0.92],
  [0.8, 0.78, 0.95, 1.0],
  [1.0, 1.0, 0.97, 0.92],
];

/** Elevation/shade → RGB (0–1). Writes into `out` to stay allocation-free. */
export function rampColor(t: number, out: [number, number, number]) {
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  for (let i = 1; i < RAMP.length; i++) {
    if (t <= RAMP[i][0]) {
      const a = RAMP[i - 1];
      const b = RAMP[i];
      const k = (t - a[0]) / (b[0] - a[0]);
      out[0] = a[1] + (b[1] - a[1]) * k;
      out[1] = a[2] + (b[2] - a[2]) * k;
      out[2] = a[3] + (b[3] - a[3]) * k;
      return out;
    }
  }
  out[0] = 1; out[1] = 0.96; out[2] = 0.9;
  return out;
}
