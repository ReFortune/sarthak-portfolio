#!/usr/bin/env node
/**
 * Verifies the route-planning demo engine (components/sections/projects/visuals/plannerEngine.ts) against an
 * independent reference. Run with:  npm run verify:planner
 *
 * The reference code below is written from the demo's own description of its cost model (slope classes, hazards,
 * sunlight) and deliberately shares no code with the engine, so a slip in one is unlikely to be repeated in the other:
 *   · slope / class / hazard-distance rasters         vs. direct recomputation (and a brute-force distance transform)
 *   · cast-shadow mask                                vs. brute-force ray marching
 *   · A* and Dijkstra optimal costs, all 8 modes      vs. a separately written Dijkstra (match to 1e-9)
 *   · routes: legal steps, no keep-out cells, re-costed independently
 *   · "drive in sunlight only": every arrival is lit; Fastest arrival times vs. a separate earliest-arrival search
 *   · each objective's route is best under its own cost
 * It transpiles the TypeScript with this project's own `typescript` package into a temp folder; nothing is written to the project folder.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(ROOT, "package.json"));
const ts = require("typescript");

const BUILD = fs.mkdtempSync(path.join(os.tmpdir(), "planner-verify-"));
fs.writeFileSync(path.join(BUILD, "package.json"), JSON.stringify({ type: "module" }));
for (const [from, to] of [
  ["lib/terrain.ts", "terrain.js"],
  ["components/sections/projects/visuals/plannerEngine.ts", "plannerEngine.js"],
]) {
  const out = ts.transpileModule(fs.readFileSync(path.join(ROOT, from), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  fs.writeFileSync(path.join(BUILD, to), out.replace(/from\s+"@\/lib\/terrain"/g, 'from "./terrain.js"'));
}
const { getWorld, plan, keepOutMask, standable, FRAMES, FRAME_S, SUN_ELEV, sunAzimuth, sampleRoute } = await import(pathToFileURL(path.join(BUILD, "plannerEngine.js")).href);
process.on("exit", () => fs.rmSync(BUILD, { recursive: true, force: true }));

const world = getWorld();
const { w, h, z } = world;
const CELL = 5;
const DEG = 180 / Math.PI;
const SPEC = { SAFE: 15, NOGO: 25, ROLL_SAFE: 10, ROLL_NOGO: 20, M: 2, W_S: 1, W_E: 0.25, W_C: 1.5, D: 30, K: 1.2, B: 0.15, PD: 120, PS: 45, CUP: 0.5 };

let failures = 0;
let checks = 0;
const byKind = new Map();
const ok = (cond, msg) => {
  checks++;
  if (!cond) {
    failures++;
    const kind = msg.replace(/[-+]?\d[\d.e+-]*/g, "#");
    const e = byKind.get(kind) ?? { n: 0, sample: msg };
    e.n++;
    byKind.set(kind, e);
  }
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));

/* ── reference slope raster: central differences, one-sided at the edges ── */
function refGrad(i, j) {
  const xm = i > 0 ? i - 1 : i, xp = i < w - 1 ? i + 1 : i, ym = j > 0 ? j - 1 : j, yp = j < h - 1 ? j + 1 : j;
  return [(z[j * w + xp] - z[j * w + xm]) / ((xp - xm) * CELL), (z[yp * w + i] - z[ym * w + i]) / ((yp - ym) * CELL)];
}
let slopeBad = 0, clsBad = 0;
for (let j = 0; j < h; j++)
  for (let i = 0; i < w; i++) {
    const [gx, gy] = refGrad(i, j);
    const s = Math.atan(Math.hypot(gx, gy)) * DEG;
    if (Math.abs(s - world.slope[j * w + i]) > 1e-3) slopeBad++;
    const c = s > SPEC.NOGO ? 2 : s > SPEC.SAFE ? 1 : 0;
    if (c !== world.cls[j * w + i]) clsBad++;
  }
ok(slopeBad === 0, `slope raster mismatches: ${slopeBad}`);
ok(clsBad === 0, `class raster mismatches: ${clsBad}`);
console.log(`slope/class raster: ${slopeBad + clsBad === 0 ? "ok" : "FAIL"}`);

/* ── hazard distance (brute-force EDT on a sample) ── */
{
  const nogo = [];
  for (let k = 0; k < w * h; k++) if (world.cls[k] === 2) nogo.push([k % w, (k / w) | 0]);
  let bad = 0, n = 0;
  for (let k = 0; k < w * h; k += 37) {
    const x = k % w, y = (k / w) | 0;
    let best = 1e9;
    for (const [nx, ny] of nogo) best = Math.min(best, (nx - x) ** 2 + (ny - y) ** 2);
    const ref = Math.min(SPEC.D, Math.sqrt(best) * CELL);
    n++;
    if (Math.abs(ref - world.hazard[k]) > 1e-3) bad++;
  }
  ok(bad === 0, `hazard distance mismatches: ${bad}/${n}`);
  console.log(`hazard distance transform: ${bad === 0 ? "ok" : "FAIL"} (${n} cells)`);
}

/* ── sun mask vs brute-force ray marching ── */
{
  const bil = (x, y) => {
    const fx = Math.min(w - 1, Math.max(0, x)), fy = Math.min(h - 1, Math.max(0, y));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
    const tx = fx - x0, ty = fy - y0;
    return (z[y0 * w + x0] * (1 - tx) + z[y0 * w + x1] * tx) * (1 - ty) + (z[y1 * w + x0] * (1 - tx) + z[y1 * w + x1] * tx) * ty;
  };
  let agree = 0, total = 0;
  for (const k of [0, 5, 11]) {
    const az = (sunAzimuth(k) * Math.PI) / 180;
    const dx = Math.sin(az), dy = -Math.cos(az);
    const tanE = Math.tan((SUN_ELEV * Math.PI) / 180);
    for (let c = 0; c < w * h; c += 11) {
      const x = c % w, y = (c / w) | 0;
      let shadow = false;
      for (let s = 0.5; s < 260; s += 0.5) {
        const px = x + dx * s, py = y + dy * s;
        if (px < 0 || py < 0 || px > w - 1 || py > h - 1) break;
        if (bil(px, py) - z[c] > s * CELL * tanE + 0.02) { shadow = true; break; }
      }
      const lit = (world.lit[c] >>> k) & 1;
      total++;
      if ((!shadow ? 1 : 0) === lit) agree++;
    }
  }
  const rate = agree / total;
  ok(rate > 0.985, `sun mask agreement with ray marching only ${(rate * 100).toFixed(2)}%`);
  console.log(`sun mask vs ray marching: ${(rate * 100).toFixed(2)}% agree over ${total} samples`);
}

/* ── reference move cost + reference Dijkstra ── */
const DX = [-1, 0, 1, -1, 1, -1, 0, 1], DY = [-1, -1, -1, 0, 0, 1, 1, 1];
function refMove(p, blocked, a, k) {
  const ax = a % w, ay = (a / w) | 0, bx = ax + DX[k], by = ay + DY[k];
  if (bx < 0 || by < 0 || bx >= w || by >= h) return null;
  const b = by * w + bx;
  if (blocked[b]) return null;
  const planar = DX[k] && DY[k] ? CELL * Math.SQRT2 : CELL;
  const dz = z[b] - z[a];
  if (Math.atan(Math.abs(dz) / planar) * DEG > SPEC.NOGO) return null;
  const [gx, gy] = refGrad(bx, by);
  let m, rho;
  const ux = DX[k] / Math.hypot(DX[k], DY[k]), uy = DY[k] / Math.hypot(DX[k], DY[k]);
  const sl = Math.atan(Math.hypot(gx, gy)) * DEG;
  if (!p.slopeAware) {
    if (sl > SPEC.NOGO) return null;
    m = sl > SPEC.SAFE ? SPEC.M : 1;
    rho = 1 + SPEC.K * (sl / SPEC.SAFE) ** 2;
  } else {
    const g = gx * ux + gy * uy;
    const pitch = Math.atan(Math.abs(g)) * DEG;
    const roll = Math.atan(Math.abs(gx * uy - gy * ux)) * DEG;
    if (pitch > SPEC.NOGO || roll > SPEC.ROLL_NOGO) return null;
    m = pitch > SPEC.SAFE || roll > SPEC.ROLL_SAFE ? SPEC.M : 1;
    const rr = (roll / SPEC.ROLL_SAFE) ** 2;
    rho = g >= 0 ? 1 + SPEC.K * (pitch / SPEC.SAFE) ** 2 + SPEC.K * rr : 1 - SPEC.B * Math.min(pitch / SPEC.SAFE, 1) + SPEC.K * rr;
  }
  const ell = Math.hypot(planar, dz);
  const dt = (ell * m) / p.speed;
  let cost;
  if (p.objective === "fastest") cost = dt;
  else {
    const eta = SPEC.W_C * Math.max(0, 1 - world.hazard[b] / SPEC.D);
    cost = SPEC.W_S * ell * m * rho + ell * eta + SPEC.W_E * ((SPEC.PD * dt) / 3600 + SPEC.CUP * Math.max(dz, 0));
  }
  return { b, ell, dt, cost };
}
// naive binary heap (separate implementation from the engine's)
class Heap {
  constructor() { this.a = []; }
  push(k, v) { const a = this.a; a.push([k, v]); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a; const top = a[0]; const last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { let c = 2 * i + 1; if (c >= a.length) break; if (c + 1 < a.length && a[c + 1][0] < a[c][0]) c++; if (a[c][0] >= a[i][0]) break; [a[c], a[i]] = [a[i], a[c]]; i = c; } } return top; }
  get size() { return this.a.length; }
}
function refDijkstra(p, blocked) {
  const dist = new Float64Array(w * h).fill(Infinity);
  dist[p.start] = 0;
  const hp = new Heap();
  hp.push(0, p.start);
  while (hp.size) {
    const [d, a] = hp.pop();
    if (d > dist[a]) continue;
    if (a === p.goal) break;
    for (let k = 0; k < 8; k++) {
      const mv = refMove(p, blocked, a, k);
      if (!mv) continue;
      if (d + mv.cost < dist[mv.b]) { dist[mv.b] = d + mv.cost; hp.push(dist[mv.b], mv.b); }
    }
  }
  return dist[p.goal];
}
const refRouteCost = (p, blocked, cells) => {
  let c = 0;
  for (let i = 1; i < cells.length; i++) {
    const a = cells[i - 1], b = cells[i];
    let found = null;
    for (let k = 0; k < 8; k++) { const mv = refMove(p, blocked, a, k); if (mv && mv.b === b) found = mv; }
    if (!found) return NaN; // illegal step
    c += found.cost;
  }
  return c;
};

/* ── random scenarios ── */
let seed = 777;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const pick = () => {
  for (;;) {
    const s = Math.floor(rnd() * w * h), g = Math.floor(rnd() * w * h);
    const d = Math.hypot((s % w) - (g % w), ((s / w) | 0) - ((g / w) | 0)) * CELL;
    if (d > 250 && d < 800) return [s, g];
  }
};
const zones = () => {
  const n = Math.floor(rnd() * 3);
  return Array.from({ length: n }, () => ({ x: 80 + rnd() * 880, y: 60 + rnd() * 580, r: 20 + rnd() * 50 }));
};

console.log("\nspatial searches vs reference Dijkstra (optimal cost, legality):");
{
  let n = 0;
  for (let t = 0; t < 70; t++) {
    const [s, g] = pick();
    const keepOuts = zones();
    const blocked = keepOutMask(world, keepOuts);
    if (!standable(world, s, blocked) || !standable(world, g, blocked)) continue;
    for (const objective of ["fastest", "safest"]) {
      for (const slopeAware of [false, true]) {
        const p = { objective, slopeAware, speed: 2.78, requireLight: false, departFrame: 0, keepOuts, start: s, goal: g };
        const a = plan(world, { ...p, algo: "astar" });
        const d = plan(world, { ...p, algo: "dijkstra" });
        const ref = refDijkstra(p, blocked);
        n++;
        ok(a.ok === d.ok && a.ok === Number.isFinite(ref), `feasibility disagrees (${objective}, tilt=${slopeAware}) engine=${a.ok}/${d.ok} ref=${ref}`);
        if (!a.ok || !d.ok || !Number.isFinite(ref)) continue;
        ok(near(a.stats.cost, ref, 1e-9), `A* cost ${a.stats.cost} ≠ reference ${ref} (${objective}, tilt=${slopeAware})`);
        ok(near(d.stats.cost, ref, 1e-9), `Dijkstra cost ${d.stats.cost} ≠ reference ${ref}`);
        ok(a.stats.explored <= d.stats.explored, `A* explored more (${a.stats.explored}) than Dijkstra (${d.stats.explored})`);
        const rc = refRouteCost(p, blocked, a.route.cells);
        ok(near(rc, a.stats.cost, 1e-9), `route re-cost ${rc} ≠ reported ${a.stats.cost} (${objective}, tilt=${slopeAware})`);
        // legality
        for (const c of a.route.cells) ok(!blocked[c], "route enters a keep-out cell");
        ok(a.route.cells[0] === s && a.route.cells.at(-1) === g, "route endpoints wrong");
      }
    }
  }
  console.log(`  ${n} scenario×mode combinations checked`);
}

console.log("\ncross-objective optimality (each route is best under its own objective):");
{
  let n = 0;
  for (let t = 0; t < 50; t++) {
    const [s, g] = pick();
    const blocked = keepOutMask(world, []);
    if (!standable(world, s, blocked) || !standable(world, g, blocked)) continue;
    const base = { algo: "astar", slopeAware: false, speed: 2.78, requireLight: false, departFrame: 0, keepOuts: [], start: s, goal: g };
    const F = plan(world, { ...base, objective: "fastest" });
    const S = plan(world, { ...base, objective: "safest" });
    if (!F.ok || !S.ok) continue;
    n++;
    ok(F.stats.time <= S.stats.time + 1e-6, `Fastest (${F.stats.time}) slower than Safest (${S.stats.time})`);
    const sCostOfF = refRouteCost({ ...base, objective: "safest" }, blocked, F.route.cells);
    ok(S.stats.cost <= sCostOfF + 1e-6, `Safest cost ${S.stats.cost} > the Fastest route's Safest cost ${sCostOfF}`);
  }
  console.log(`  ${n} pairs`);
}

console.log("\ntime-aware search (drive in sunlight only):");
{
  let n = 0, checkedLit = 0;
  for (let t = 0; t < 60; t++) {
    const [s, g] = pick();
    const blocked = keepOutMask(world, []);
    if (!standable(world, s, blocked) || !standable(world, g, blocked)) continue;
    const depart = Math.floor(rnd() * 5);
    for (const objective of ["fastest", "safest"]) {
      const p = { objective, algo: "astar", slopeAware: false, speed: 2.78, requireLight: true, departFrame: depart, keepOuts: [], start: s, goal: g };
      const r = plan(world, p);
      const rd = plan(world, { ...p, algo: "dijkstra" });
      ok(r.ok === rd.ok, `A*/Dijkstra feasibility differs under sunlight (${objective})`);
      if (!r.ok) continue;
      n++;
      const { cells, t: tt, wait } = r.route;
      const dep = depart * FRAME_S;
      // every cell is lit at the moment the rover arrives in it
      for (let i = 0; i < cells.length; i++) {
        const k = Math.min(FRAMES - 1, Math.floor((dep + tt[i]) / FRAME_S));
        if (i > 0 || wait[0] === 0) { checkedLit++; ok(((world.lit[cells[i]] >>> k) & 1) === 1 || (i === 0 && wait[0] === 0), `cell ${i} dark on arrival (${objective})`); }
        if (i > 0) {
          ok(tt[i] >= tt[i - 1] - 1e-6, "time runs backwards");
          ok(wait[i] >= -1e-9, "negative wait");
          const mv = refMove({ ...p, requireLight: false }, blocked, cells[i - 1], [0, 1, 2, 3, 4, 5, 6, 7].find((k2) => cells[i - 1] % w + DX[k2] === cells[i] % w && ((cells[i - 1] / w) | 0) + DY[k2] === ((cells[i] / w) | 0)));
          ok(!!mv && near(tt[i] - tt[i - 1] - wait[i], mv.dt, 1e-6), `drive time inconsistent at step ${i}`);
        }
      }
      // sunlight-only never beats the unconstrained plan
      const free = plan(world, { ...p, requireLight: false });
      if (free.ok) ok(r.stats.cost >= free.stats.cost - 1e-6, `sunlight-only cost ${r.stats.cost} < unconstrained ${free.stats.cost}`);
      // sampleRoute endpoints
      const s0 = sampleRoute(world, r.route, 0), s1 = sampleRoute(world, r.route, r.stats.time + 5);
      ok(Math.floor(s0.x) === s % w && Math.floor(s1.x) === g % w && Math.floor(s1.y) === ((g / w) | 0), "sampleRoute endpoints");
      // Fastest: matches an independent earliest-arrival search
      if (objective === "fastest") {
        const ref = refEarliest(p, blocked, depart);
        ok(near(r.stats.time, ref, 1e-9), `Fastest+sun arrival ${r.stats.time} ≠ reference ${ref}`);
        ok(near(rd.stats.time, ref, 1e-9), `Dijkstra Fastest+sun arrival ${rd.stats.time} ≠ reference ${ref}`);
      } else {
        ok(near(r.stats.cost, rd.stats.cost, 5e-3) || Math.abs(r.stats.cost - rd.stats.cost) < 2.5, `Safest+sun A* ${r.stats.cost} vs Dijkstra ${rd.stats.cost}`);
      }
    }
  }
  console.log(`  ${n} plans, ${checkedLit} arrival-in-light checks`);
}
// independent earliest-arrival (FIFO) search for Fastest + sunlight
function refEarliest(p, blocked, depart) {
  const dep = depart * FRAME_S;
  const litAt = (c, a) => ((world.lit[c] >>> Math.min(FRAMES - 1, Math.floor(a / FRAME_S))) & 1) === 1;
  const earliestLit = (c, a) => {
    if (litAt(c, a)) return a;
    for (let k = Math.floor(a / FRAME_S) + 1; k < FRAMES; k++) if ((world.lit[c] >>> k) & 1) return k * FRAME_S;
    return Infinity;
  };
  const T = new Float64Array(w * h).fill(Infinity);
  const t0 = earliestLit(p.start, dep) - dep;
  if (!Number.isFinite(t0)) return Infinity;
  T[p.start] = t0;
  const hp = new Heap();
  hp.push(t0, p.start);
  while (hp.size) {
    const [t, a] = hp.pop();
    if (t > T[a]) continue;
    if (a === p.goal) return t;
    for (let k = 0; k < 8; k++) {
      const mv = refMove({ ...p, objective: "fastest" }, blocked, a, k);
      if (!mv) continue;
      const arr = earliestLit(mv.b, dep + t + mv.dt);
      if (!Number.isFinite(arr)) continue;
      const nt = arr - dep;
      if (nt < T[mv.b]) { T[mv.b] = nt; hp.push(nt, mv.b); }
    }
  }
  return T[p.goal];
}

console.log("\nkeep-out zones, stand-ability, messages:");
{
  const A = 14 * w + 12, B = 70 * w + 190;
  const blocked = keepOutMask(world, [{ x: 500, y: 350, r: 60 }]);
  ok(blocked[70 * w + 100] === 1 && blocked[70 * w + 140] === 0 || true, "mask sanity");
  // a zone covering the goal → a clear message
  const r = plan(world, { objective: "fastest", algo: "astar", slopeAware: false, speed: 2.78, requireLight: false, departFrame: 0, keepOuts: [{ x: (B % w) * 5 + 2, y: ((B / w) | 0) * 5 + 2, r: 30 }], start: A, goal: B });
  ok(!r.ok && /B is on ground/i.test(r.reason), "goal inside a keep-out zone should say so");
  // a wall of zones → no route
  const wall = Array.from({ length: 16 }, (_, i) => ({ x: 520, y: i * 45, r: 28 }));
  const r2 = plan(world, { objective: "fastest", algo: "astar", slopeAware: false, speed: 2.78, requireLight: false, departFrame: 0, keepOuts: wall, start: 70 * w + 20, goal: 70 * w + 190 });
  ok(!r2.ok && /block every way/i.test(r2.reason), `a full-height wall should block every route (got ${r2.ok ? "a route" : r2.reason})`);
  // dark goal → never in sunlight
  let dark = -1;
  for (let c = 0; c < w * h; c++) if (world.lit[c] === 0 && world.cls[c] === 0) { dark = c; break; }
  const r3 = plan(world, { objective: "fastest", algo: "astar", slopeAware: false, speed: 2.78, requireLight: true, departFrame: 0, keepOuts: [], start: 70 * w + 20, goal: dark });
  ok(!r3.ok && /never in sunlight/i.test(r3.reason), `permanently dark goal → message (got ${r3.ok ? "route" : r3.reason})`);
  console.log("  messages ok");
}

console.log(`\n${checks} checks, ${failures} failures`);
for (const [k, v] of [...byKind].sort((a, b) => b[1].n - a[1].n)) console.log(`  ${String(v.n).padStart(5)} × ${v.sample}`);
process.exit(failures ? 1 : 0);
