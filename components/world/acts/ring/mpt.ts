import * as THREE from "three";
import { fbm } from "@/lib/terrain";
import { clamp } from "@/lib/math";
import { createSculpture, TONE, type V3 } from "../../kit/sculpt";
import type { Exhibit, ExhibitContext } from "./common";

/* MPT — the mission-planning tool, as a table-top map. A small made-up terrain is classified by slope (safe, caution,
   no-go), a search spreads out from the start, and the route it finds is drawn across. The whole thing plays when the
   story arrives. */

const SIZE = 5;
const TOP = 1.3;
const SAFE = 0.26;
const NOGO = 0.5;

export function createMpt(ctx: ExhibitContext): Exhibit {
  const S = createSculpture({ height: 3, lowPower: ctx.lowPower, pxPerUnit: ctx.pxPerUnit, size: 0.05 });
  const N = ctx.lowPower ? 32 : 46;
  const cell = SIZE / N;
  const W = N + 1;

  /* the map */
  const hOf = (u: number, v: number) => {
    let h = 0.55 * fbm(u * 0.5 + 5.1, v * 0.5 - 2.7, 31, 3);
    h += 0.52 * Math.exp(-((u - 0.75) ** 2 + (v + 0.35) ** 2) / 0.6);
    h -= 0.4 * Math.exp(-((u + 0.95) ** 2 + (v - 0.55) ** 2) / 0.42);
    return h;
  };
  const hs = new Float32Array(W * W);
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) hs[j * W + i] = hOf(-SIZE / 2 + i * cell, -SIZE / 2 + j * cell);
  const slope = new Float32Array(W * W);
  for (let j = 0; j < W; j++) {
    for (let i = 0; i < W; i++) {
      const gx = (hs[j * W + Math.min(i + 1, N)] - hs[j * W + Math.max(i - 1, 0)]) / (2 * cell);
      const gz = (hs[Math.min(j + 1, N) * W + i] - hs[Math.max(j - 1, 0) * W + i]) / (2 * cell);
      slope[j * W + i] = Math.hypot(gx, gz);
    }
  }
  const u0 = Math.round(0.1 * N), v0 = Math.round(0.86 * N);
  const u1 = Math.round(0.9 * N), v1 = Math.round(0.14 * N);
  slope[v0 * W + u0] = Math.min(slope[v0 * W + u0], SAFE * 0.5);
  slope[v1 * W + u1] = Math.min(slope[v1 * W + u1], SAFE * 0.5);

  /* the search: Dijkstra over the grid, avoiding no-go ground */
  const dist = new Float32Array(W * W).fill(Infinity);
  const prev = new Int32Array(W * W).fill(-1);
  const rank = new Float32Array(W * W).fill(-1);
  const open: number[] = [v0 * W + u0];
  dist[v0 * W + u0] = 0;
  const done = new Uint8Array(W * W);
  let settled = 0;
  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (dist[open[k]] < dist[open[bi]]) bi = k;
    const cur = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();
    if (done[cur]) continue;
    done[cur] = 1;
    rank[cur] = settled++;
    if (cur === v1 * W + u1) break;
    const ci = cur % W, cj = (cur / W) | 0;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni > N || nj > N) continue;
        const n = nj * W + ni;
        if (done[n] || slope[n] >= NOGO) continue;
        const step = Math.hypot(di, dj) * (1 + 7 * slope[n] * slope[n]);
        if (dist[cur] + step < dist[n]) {
          dist[n] = dist[cur] + step;
          prev[n] = cur;
          open.push(n);
        }
      }
    }
  }
  const trail: V3[] = [];
  for (let c = v1 * W + u1; c >= 0 && (c === v0 * W + u0 || prev[c] >= 0); c = prev[c]) {
    const i = c % W, j = (c / W) | 0;
    trail.push([-SIZE / 2 + i * cell, hs[c] + TOP, -SIZE / 2 + j * cell]);
    if (c === v0 * W + u0) break;
  }
  trail.reverse();
  // soften the corners
  let route = trail;
  for (let pass = 0; pass < 2; pass++) {
    const next: V3[] = [route[0]];
    for (let k = 0; k < route.length - 1; k++) {
      const a = route[k], b = route[k + 1];
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25, a[2] * 0.75 + b[2] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75, a[2] * 0.25 + b[2] * 0.75]);
    }
    next.push(route[route.length - 1]);
    route = next;
  }

  /* the table */
  S.part(1, (b) => {
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const u = -SIZE / 2 + (i + 0.15 + 0.7 * b.rnd()) * cell, v = -SIZE / 2 + (j + 0.15 + 0.7 * b.rnd()) * cell;
        const si = Math.min(N, Math.round((u + SIZE / 2) / cell)), sj = Math.min(N, Math.round((v + SIZE / 2) / cell));
        const g = slope[sj * W + si];
        const y = hOf(u, v) + TOP;
        const param = (SIZE / 2 - v) / SIZE;
        if (g < SAFE) b.point(u, y, v, TONE.ice, { tone: 0.78, param });
        else if (g < NOGO) b.point(u, y, v, TONE.amber, { tone: 1.05, param });
        else b.point(u, y, v, TONE.laser, { tone: 1.05, hot: 0.2, param });
      }
    }
    b.frame([0, TOP - 0.02, 0], SIZE + 0.12, SIZE + 0.12, "y", 0.06, TONE.bone, { tone: 0.9, param: 0.1 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.line([sx * (SIZE / 2 - 0.12), 0.02, sz * (SIZE / 2 - 0.12)], [sx * (SIZE / 2 - 0.12), TOP - 0.04, sz * (SIZE / 2 - 0.12)], 0.09, TONE.dim, { tone: 0.7 });
    // start and goal pins
    const sx0 = -SIZE / 2 + u0 * cell, sz0 = -SIZE / 2 + v0 * cell, sx1 = -SIZE / 2 + u1 * cell, sz1 = -SIZE / 2 + v1 * cell;
    const y0 = hs[v0 * W + u0] + TOP, y1 = hs[v1 * W + u1] + TOP;
    b.line([sx0, y0, sz0], [sx0, y0 + 0.85, sz0], 0.05, TONE.ice, { tone: 1.3, param: 0.3 });
    b.ring([sx0, y0 + 0.9, sz0], 0.14, "y", 28, TONE.ice, { tone: 1.4, param: 0.3 });
    b.line([sx1, y1, sz1], [sx1, y1 + 1.05, sz1], 0.05, TONE.laser, { tone: 1.3, hot: 0.6, param: 0.3 });
    b.ring([sx1, y1 + 1.1, sz1], 0.18, "y", 32, TONE.laser, { tone: 1.4, hot: 0.7, param: 0.3 });
  });

  /* where the search has been, then the route */
  const search = S.part(2, (b) => {
    const total = Math.max(1, settled);
    for (let j = 0; j < W; j++) {
      for (let i = 0; i < W; i++) {
        const r = rank[j * W + i];
        if (r < 0 || (i + j) % 2) continue;
        b.point(-SIZE / 2 + i * cell, hs[j * W + i] + TOP + 0.035, -SIZE / 2 + j * cell, TONE.deep, { tone: 1.1, param: (r / total) * 0.9 });
      }
    }
  }, { size: 0.035 });
  const path = S.part(3, (b) => {
    let acc = 0;
    const len: number[] = [0];
    for (let k = 1; k < route.length; k++) {
      acc += Math.hypot(route[k][0] - route[k - 1][0], route[k][1] - route[k - 1][1], route[k][2] - route[k - 1][2]);
      len.push(acc);
    }
    for (let k = 0; k < route.length - 1; k++) {
      const a = route[k], c = route[k + 1];
      const n = Math.max(1, Math.round(Math.hypot(c[0] - a[0], c[2] - a[2]) / 0.03));
      for (let m = 0; m < n; m++) {
        const t = m / n;
        const x = a[0] + (c[0] - a[0]) * t, z = a[2] + (c[2] - a[2]) * t;
        const y = hOf(x, z) + TOP + 0.07;
        const param = (len[k] + (len[k + 1] - len[k]) * t) / acc;
        b.point(x, y, z, TONE.bone, { tone: 1.5, hot: 0.4, param });
        b.point(x + 0.018, y, z + 0.018, TONE.bone, { tone: 1.1, hot: 0.3, param });
      }
    }
  }, { size: 0.045 });

  S.hull(new THREE.BoxGeometry(SIZE + 0.2, 0.14, SIZE + 0.2), 0, TOP - 0.09, 0);

  let play = 0, was = 0;
  return {
    S,
    pick: { center: [0, TOP + 0.4, 0], radius: 3.3 },
    callouts: [
      { id: "mpt-safe", text: "SAFE", at: [-SIZE / 2 + 0.2, TOP + 0.55, SIZE / 2 - 0.5], side: "left" },
      { id: "mpt-goal", text: "GOAL", at: [-SIZE / 2 + u1 * cell, hs[v1 * W + u1] + TOP + 1.2, -SIZE / 2 + v1 * cell], side: "right" },
    ],
    tick(_t, dt, active) {
      if (active > 0.55 && was <= 0.55) play = 0;
      was = active;
      if (active > 0.3) play += dt;
      search.built.value = clamp(play / 2.4, 0, 1);
      path.built.value = clamp((play - 1.7) / 2.2, 0, 1);
      search.mul = active * 0.9;
      path.mul = active;
      S.apply();
    },
  };
}
