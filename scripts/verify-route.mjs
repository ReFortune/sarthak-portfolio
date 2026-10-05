#!/usr/bin/env node
/**
 * Verifies the hero's route planner (components/hero/routePlanner.ts). Run with:  npm run verify:route
 *
 * The reference below is written from the planner's own description of its cost model (slope-multiplied distance, a margin
 * around steep ground, a pull towards the corridor centre) and shares no code with it, reading heights straight from the terrain
 * function instead of the planner's cache:
 *   · the planner's grid-path cost                  vs. a plain Dijkstra over the same cells (match to 2e-5, float32 storage)
 *   · routes along 400 m of corridor: start at the rover, only advance, stay inside the window, cover the drawn distance
 *   · routes cross ground steeper than the limit only where they cannot avoid it (a few percent of plans at most)
 *   · the same inputs give the same route
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

const BUILD = fs.mkdtempSync(path.join(os.tmpdir(), "route-verify-"));
fs.writeFileSync(path.join(BUILD, "package.json"), JSON.stringify({ type: "module" }));
for (const [from, to] of [
  ["lib/terrain.ts", "terrain.js"],
  ["components/hero/routePlanner.ts", "routePlanner.js"],
]) {
  const out = ts.transpileModule(fs.readFileSync(path.join(ROOT, from), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  fs.writeFileSync(path.join(BUILD, to), out.replace(/from\s+"@\/lib\/terrain"/g, 'from "./terrain.js"'));
}
const { corridorX, heightAt } = await import(pathToFileURL(path.join(BUILD, "terrain.js")).href);
const { RoutePlanner, createPlan } = await import(pathToFileURL(path.join(BUILD, "routePlanner.js")).href);
process.on("exit", () => fs.rmSync(BUILD, { recursive: true, force: true }));

let failures = 0;
let checks = 0;
const ok = (cond, msg) => {
  checks++;
  if (!cond) {
    failures++;
    console.log("  ✗", msg);
  }
};

const DEG = Math.PI / 180;
const COLS = 31, HALF = 15;
const S0 = Math.tan(5 * DEG);

/** Dijkstra over the planner's cells (forward moves only), written independently of the planner. */
function referenceCost(x0, z0, ahead, limitDeg) {
  const SL = Math.tan(limitDeg * DEG);
  const j0 = Math.floor(z0);
  const X = (i, r) => corridorX(j0 + r) + (i - HALF);
  const hs = Array.from({ length: ahead + 1 }, (_, r) => Array.from({ length: COLS }, (_, i) => heightAt(X(i, r), j0 + r)));
  const pen = (s) => (s <= S0 ? 0 : s <= SL ? 5 * ((s - S0) / (SL - S0)) ** 2 : 5 + (40 * (s - SL)) / SL);
  const risk = (i, r) => {
    let m = 0;
    const h0 = hs[r][i];
    if (i > 0) m = Math.max(m, Math.abs(hs[r][i - 1] - h0));
    if (i < COLS - 1) m = Math.max(m, Math.abs(hs[r][i + 1] - h0));
    if (r > 0) m = Math.max(m, Math.abs(hs[r - 1][i] - h0));
    if (r < ahead) m = Math.max(m, Math.abs(hs[r + 1][i] - h0));
    return m;
  };
  const start = Math.min(COLS - 1, Math.max(0, Math.round(x0 - corridorX(j0)) + HALF));
  const dist = Array.from({ length: ahead + 1 }, () => new Float64Array(COLS).fill(Infinity));
  const done = Array.from({ length: ahead + 1 }, () => new Uint8Array(COLS));
  dist[0][start] = 0;
  for (;;) {
    let br = -1, bi = -1, bd = Infinity;
    for (let r = 0; r <= ahead; r++) for (let i = 0; i < COLS; i++) if (!done[r][i] && dist[r][i] < bd) { bd = dist[r][i]; br = r; bi = i; }
    if (br < 0) return NaN;
    done[br][bi] = 1;
    if (br === ahead) return bd;
    for (const di of [0, 1, -1]) {
      const i2 = bi + di, r2 = br + 1;
      if (i2 < 0 || i2 >= COLS) continue;
      const horiz = Math.hypot(X(i2, r2) - X(bi, br), 1);
      const dh = hs[r2][i2] - hs[br][bi];
      const len = Math.hypot(horiz, dh);
      const c = bd + len * (1 + pen(Math.abs(dh) / horiz) + 0.8 * pen(risk(i2, r2))) + 0.03 * Math.abs(i2 - HALF) * horiz;
      if (c < dist[r2][i2]) dist[r2][i2] = c;
    }
  }
}

console.log("optimal cost, fresh planner (no pull towards a previous plan), vs. an independent Dijkstra:");
let worst = 0;
for (const z0 of [0, 37.3, 120, 480.6, 1013, 2222.2, 3999.9, -140, 7777]) {
  const x0 = corridorX(z0);
  const p = new RoutePlanner();
  p.prime(z0, 1e9);
  const out = createPlan();
  ok(p.plan(x0, z0, out), `plan at z=${z0}`);
  const ref = referenceCost(x0, z0, p.ahead, p.limitDeg);
  const err = Math.abs(p.lastCost - ref) / ref;
  worst = Math.max(worst, err);
  ok(err < 2e-5, `z=${z0}: planner ${p.lastCost.toFixed(4)} vs reference ${ref.toFixed(4)}`);
}
console.log(`  9 positions, worst relative difference ${worst.toExponential(1)}`);

console.log("\nroutes along 400 m of corridor (the rover weaves a little, as the camera does):");
{
  const p = new RoutePlanner();
  const out = createPlan();
  let z = 0, plans = 0, over = 0, bad = 0, minLen = Infinity, maxLen = 0;
  const times = [];
  while (z < 400) {
    const x = corridorX(z) + Math.sin(z * 0.05) * 2.4;
    p.prime(z, 1e9);
    if (!p.plan(x, z, out)) { ok(false, `plan failed at z=${z}`); break; }
    plans++;
    times.push(out.ms);
    minLen = Math.min(minLen, out.length);
    maxLen = Math.max(maxLen, out.length);
    if (out.maxSlope > p.limitDeg + 0.5) over++;
    if (Math.abs(out.pos[0] - x) > 1e-4 || Math.abs(out.pos[2] - z) > 1e-4) bad++; // starts at the rover
    for (let k = 0; k < out.n; k++) {
      const px = out.pos[k * 3], py = out.pos[k * 3 + 1], pz = out.pos[k * 3 + 2];
      if (!Number.isFinite(px + py + pz)) bad++;
      if (k > 0 && pz < out.pos[(k - 1) * 3 + 2] - 1e-6) bad++; // only advances
      if (Math.abs(px - corridorX(pz)) > HALF + 1) bad++; // inside the window
    }
    if (out.pos[(out.n - 1) * 3 + 2] < z + p.show - 1.5) bad++; // covers the drawn distance
    if (out.wayN < 3) bad++;
    z += 3.4;
  }
  times.sort((a, b) => a - b);
  console.log(`  ${plans} plans · length ${minLen.toFixed(1)}–${maxLen.toFixed(1)} m · median ${times[times.length >> 1].toFixed(2)} ms (first plans include JIT warm-up)`);
  ok(bad === 0, `every route starts at the rover, only advances, stays in the window and covers the drawn distance (${bad} problems)`);
  ok(over <= plans * 0.05, `routes steeper than the ${p.limitDeg}° limit only where it cannot be avoided (${over} of ${plans})`);
}

console.log("\ndeterminism:");
{
  const run = () => {
    const p = new RoutePlanner();
    const o = createPlan();
    p.prime(900, 1e9);
    p.plan(corridorX(900), 900, o);
    return Array.from(o.pos.slice(0, o.n * 3)).join(",");
  };
  ok(run() === run(), "the same input gives the same route");
}

console.log(failures ? `\n${checks} checks, ${failures} FAILURES` : `\n${checks} checks, 0 failures`);
process.exit(failures ? 1 : 0);
