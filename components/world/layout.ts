import * as THREE from "three";
import { corridorX, heightAt } from "@/lib/terrain";
import { RoutePlanner, createPlan, type RoutePlan } from "@/components/hero/routePlanner";
import { timeline } from "@/data/timeline";
import { routeAt } from "./kit/route";
import { type BeatId } from "./story";

/* ─────────────────────────────────────────────────────────────────────────
   LAYOUT — where everything is in the world, and the camera pose of every beat.

   One long route is planned across the terrain (several planner windows chained end to end). The rover drives its
   first part to a ring of instruments; after the ring the route carries on through a corridor of gates, the
   timeline. Everything else (the sky, the ring) is placed relative to that route.
   ───────────────────────────────────────────────────────────────────────── */

/** World z where the route starts, and how far it runs (m of ground track). */
export const Z_START = 40;
const Z_RING = 330;
const Z_TOTAL = 590;

export type Route = {
  n: number;
  pos: Float32Array;
  s: Float32Array;
  segN: number;
  seg: Float32Array;
  length: number;
  /** What the planner reported for the first window. */
  readout: { length: number; maxSlope: number; limit: number; ms: number };
};

/** Plans the route a slice at a time (so building it never freezes the page). Call `step()` until it returns true. */
export function createRouteBuilder(opts: { lowPower: boolean }) {
  const AHEAD = 170, SHOW = 150, KEEP = 130;
  const planner = new RoutePlanner({ step: opts.lowPower ? 0.8 : 0.5, ahead: AHEAD, show: SHOW });
  const plan: RoutePlan = createPlan(opts.lowPower ? 340 : 540, 4000);
  const P: number[] = [];
  const SEG: number[] = [];
  let x = corridorX(Z_START), z = Z_START, windowStart = Z_START;
  let primed = false, firstMs = 0, firstLen = 0, firstSlope = 0;
  let done = false;
  let fails = 0;
  let result: Route | null = null;

  function finish() {
    // soften the joins: a few passes of light smoothing on the lateral position (ends fixed), then lay the route on the ground again
    const n = P.length / 3;
    const xs = new Float64Array(n);
    for (let i = 0; i < n; i++) xs[i] = P[i * 3];
    for (let pass = 0; pass < 6; pass++) {
      const t = xs.slice();
      for (let i = 2; i < n - 2; i++) xs[i] = (t[i - 2] + 2 * t[i - 1] + 3 * t[i] + 2 * t[i + 1] + t[i + 2]) / 9;
    }
    const pos = new Float32Array(n * 3);
    const s = new Float32Array(n);
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const px = xs[i], pz = P[i * 3 + 2];
      pos[i * 3] = px;
      pos[i * 3 + 1] = heightAt(px, pz) + 0.14;
      pos[i * 3 + 2] = pz;
      if (i > 0) {
        const dx = px - pos[(i - 1) * 3], dy = pos[i * 3 + 1] - pos[(i - 1) * 3 + 1], dz = pz - pos[(i - 1) * 3 + 2];
        acc += Math.sqrt(dx * dx + dy * dy + dz * dz);
      }
      s[i] = acc;
    }
    result = {
      n,
      pos,
      s,
      segN: SEG.length / 7,
      seg: new Float32Array(SEG),
      length: acc,
      readout: { length: firstLen, maxSlope: firstSlope, limit: planner.limitDeg, ms: firstMs },
    };
  }

  /** The planner could not make progress: carry on straight along the corridor, so the story always has a route to follow. */
  function giveUp() {
    const zEnd = Z_START + Z_TOTAL;
    for (let zz = P.length ? z + 0.5 : Z_START; zz <= zEnd; zz += 0.5) {
      const cx = corridorX(zz);
      P.push(cx, heightAt(cx, zz), zz);
    }
    finish();
    done = true;
  }

  return {
    get done() {
      return done;
    },
    get route() {
      return result;
    },
    /** One slice of work: a few terrain rows for the planner, or one plan. True when the whole route exists. */
    step(): boolean {
      if (done) return true;
      if (!primed) {
        primed = planner.prime(z, 60);
        return false;
      }
      if (!planner.plan(x, z, plan) || plan.n < 3) {
        primed = false;
        if (++fails > 40) {
          giveUp();
          return true;
        }
        return false;
      }
      if (windowStart === Z_START && firstLen === 0) {
        firstMs = plan.ms;
        firstLen = plan.length;
        firstSlope = plan.maxSlope;
      }
      const last = windowStart + KEEP >= Z_START + Z_TOTAL;
      const zKeep = last ? Z_START + Z_TOTAL : windowStart + KEEP;
      let lastK = 0;
      const before = P.length;
      for (let k = P.length === 0 ? 0 : 1; k < plan.n; k++) {
        const pz = plan.pos[k * 3 + 2];
        if (pz > zKeep && !last) break;
        P.push(plan.pos[k * 3], plan.pos[k * 3 + 1], pz);
        lastK = k;
        if (pz >= Z_START + Z_TOTAL) break;
      }
      if (P.length === before) {
        // nothing of this window lay in the stretch it was meant to cover
        primed = false;
        if (++fails > 6) {
          giveUp();
          return true;
        }
        return false;
      }
      fails = 0;
      // the steep ground this window outlines, within its own stretch
      for (let q = 0; q < plan.segN; q++) {
        const o = q * 7;
        const za = plan.seg[o + 2], zb = plan.seg[o + 5];
        if (za >= windowStart && zb >= windowStart && za <= zKeep && zb <= zKeep) for (let c = 0; c < 7; c++) SEG.push(plan.seg[o + c]);
      }
      x = plan.pos[lastK * 3];
      z = plan.pos[lastK * 3 + 2];
      windowStart = z;
      primed = false;
      if (last || z >= Z_START + Z_TOTAL - 1) {
        finish();
        done = true;
      }
      return done;
    },
  };
}

/* ── anchors ──────────────────────────────────────────────────────────── */

export type Anchor = {
  id: string;
  s: number;
  pos: THREE.Vector3;
  /** Unit direction of travel through it (in the ground plane). */
  dir: THREE.Vector3;
};

export type Slot = {
  id: "sparrow" | "mpt" | "chiron" | "routem" | "oscar" | "nova";
  /** Angle around the ring (radians). */
  phi: number;
  pos: THREE.Vector3;
  /** Where the camera stands to look at it: outside the ring, in line with it. */
  cam: THREE.Vector3;
};

export type YearGate = { year: number; s: number; items: string[] };

export type Pose =
  | { type: "rel"; back: number; up: number; side?: number; ry?: number; lookAhead?: number; lookY?: number; /** `lookY` on a tall screen. */ lookYTall?: number; fov?: number }
  | { type: "world"; pos: THREE.Vector3; look: THREE.Vector3; fov?: number; orbit?: THREE.Vector3; room?: "left" | "right" };

export type Key = {
  /** Route-follow beats: the arc length at the beat's start and end, and what follows it. */
  s0?: number;
  s1?: number;
  entity?: "rover" | "camera";
  pose: Pose;
};

export type Layout = {
  route: Route;
  /** Arc length where the rover parks (the ring's entrance). */
  sRing: number;
  gates: (Anchor & { kind: "major" | "year" })[];
  yearGates: YearGate[];
  ring: { center: THREE.Vector3; radius: number; forward: THREE.Vector3; right: THREE.Vector3; slots: Slot[] };
  sky: { center: THREE.Vector3 };
  finale: { sStart: number; sFinal: number; finalGate: Anchor };
  keys: Record<BeatId, Key>;
  /** Total length of the route (m). */
  length: number;
};

const tmp = { x: 0, y: 0, z: 0 };
const tmp2 = { x: 0, y: 0, z: 0 };

/** Position and (ground-plane) direction at arc length `s`. */
export function routeFrame(route: Route, s: number, pos = new THREE.Vector3(), dir = new THREE.Vector3()) {
  routeAt(route, s, tmp);
  routeAt(route, s + 1.5, tmp2);
  pos.set(tmp.x, tmp.y, tmp.z);
  dir.set(tmp2.x - tmp.x, 0, tmp2.z - tmp.z);
  if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1);
  dir.normalize();
  return { pos, dir };
}

/** Where the rover stands, and which way it faces, with its wheels at arc length `s`. */
export function roverPoseAt(route: Route, s: number) {
  const p = { x: 0, y: 0, z: 0 }, a = { x: 0, y: 0, z: 0 }, b = { x: 0, y: 0, z: 0 };
  routeAt(route, s, p);
  routeAt(route, s - 1.2, a);
  routeAt(route, s + 2.4, b);
  return { x: p.x, y: heightAt(p.x, p.z) + 0.04, z: p.z, heading: Math.atan2(b.x - a.x, b.z - a.z) };
}

/** The three places in the sky the camera stops: which way it looks (radians) and how far above its own height. */
export const SKY_STATIONS = {
  crew: { az: 0.3, up: 6 },
  transit: { az: 1.5, up: 14 },
  toolkit: { az: 2.7, up: 4 },
} as const;

const DEG = Math.PI / 180;

/** Arc length at which the route first reaches world z. */
function sAtZ(route: Route, z: number) {
  for (let i = 1; i < route.n; i++) {
    const z1 = route.pos[i * 3 + 2];
    if (z1 >= z) {
      const z0 = route.pos[(i - 1) * 3 + 2];
      const t = z1 > z0 ? (z - z0) / (z1 - z0) : 0;
      return route.s[i - 1] + (route.s[i] - route.s[i - 1]) * t;
    }
  }
  return route.s[route.n - 1];
}

export function buildLayout(route: Route): Layout {
  const at = (s: number): Anchor => {
    const f = routeFrame(route, s);
    return { id: "", s, pos: f.pos, dir: f.dir };
  };

  /* the ring: the route stops at its entrance, where the rover parks as one of its exhibits */
  const sRing = sAtZ(route, Z_RING);
  const entrance = at(sRing);
  const F = entrance.dir.clone();
  const R = new THREE.Vector3(F.z, 0, -F.x); // across
  const RING_R = 11;
  const center = entrance.pos.clone().addScaledVector(F, RING_R);
  center.y = heightAt(center.x, center.z);
  const slotAngles: Slot["id"][] = ["sparrow", "mpt", "chiron", "routem", "oscar", "nova"];
  const CAM_R = 22;
  const slots: Slot[] = slotAngles.map((id, i) => {
    const phi = (270 + i * 60) * DEG;
    const dirv = new THREE.Vector3().addScaledVector(R, Math.cos(phi)).addScaledVector(F, Math.sin(phi));
    const pos = center.clone().addScaledVector(dirv, RING_R);
    pos.y = heightAt(pos.x, pos.z);
    const cam = center.clone().addScaledVector(dirv, CAM_R);
    cam.y = heightAt(cam.x, cam.z) + 5.2;
    return { id, phi, pos, cam };
  });

  /* the gates along the way */
  const gates: Layout["gates"] = [];
  const addGate = (id: string, s: number, kind: "major" | "year") => {
    const a = at(s);
    gates.push({ ...a, id, kind });
  };
  addGate("gate-1", 118, "major");
  addGate("gate-2", sRing - 46, "major");

  /* after the ring: the corridor of year gates (the timeline), then the last gate */
  const sCorridor = sRing + 62;
  const years = [2021, 2022, 2023, 2024, 2025, 2026, 2027];
  const GAP = 17;
  const yearGates: YearGate[] = years.map((year, i) => {
    const s = sCorridor + i * GAP;
    const items = timeline.filter((r) => Number(r.start.slice(0, 4)) === year).map((r) => r.label);
    return { year, s, items };
  });
  yearGates.forEach((g) => addGate(`year-${g.year}`, g.s, "year"));
  const sFinal = sCorridor + years.length * GAP + 30;
  const L = route.s[route.n - 1];
  const sFinalClamped = Math.min(sFinal, L - 18);
  addGate("gate-final", sFinalClamped, "major");
  const finalGate = gates[gates.length - 1];

  /* the sky: high above where the corridor starts */
  const cor = at(sCorridor);
  const sky = { center: new THREE.Vector3(cor.pos.x, cor.pos.y + 300, cor.pos.z) };

  /* camera poses, beat by beat */
  // what the camera looks at on each exhibit: a point partway up it
  const LOOK_Y: Record<Slot["id"], number> = { sparrow: 2.0, mpt: 1.5, chiron: 1.2, routem: 3.0, oscar: 3.0, nova: 3.0 };
  const ringLook = (slot: Slot) => slot.pos.clone().add(new THREE.Vector3(0, LOOK_Y[slot.id], 0));
  const slotOf = (id: Slot["id"]) => slots.find((s) => s.id === id)!;
  const worldKey = (id: Slot["id"]): Key => {
    const sl = slotOf(id);
    return { pose: { type: "world", pos: sl.cam.clone(), look: ringLook(sl), fov: 42, orbit: center, room: "left" } };
  };

  // sky: three stations around a point above the corridor, each looking at a cluster 120 m away
  const skyStation = (az: number, up: number) => {
    const c = sky.center;
    const look = new THREE.Vector3(c.x + Math.cos(az) * 120, c.y + up, c.z + Math.sin(az) * 120);
    return { pos: new THREE.Vector3(c.x, c.y, c.z), look };
  };
  const stA = skyStation(SKY_STATIONS.crew.az, SKY_STATIONS.crew.up);
  const stB = skyStation(SKY_STATIONS.transit.az, SKY_STATIONS.transit.up);
  const stC = skyStation(SKY_STATIONS.toolkit.az, SKY_STATIONS.toolkit.up);

  const keys: Record<BeatId, Key> = {
    // on the ground: first person, then the camera drops back behind the rover
    threshold: { s0: 0, s1: 44, entity: "rover", pose: { type: "rel", back: 0, up: 6, lookAhead: 34, lookY: 4.2, fov: 42 } },
    gate1: { s0: 44, s1: 112, entity: "rover", pose: { type: "rel", back: 0, up: 6.2, lookAhead: 30, lookY: 5.2, fov: 42 } },
    why: { s0: 112, s1: 156, entity: "rover", pose: { type: "rel", back: 13, up: 4.6, ry: 0.66, fov: 42 } },
    survey: { s0: 156, s1: 204, entity: "rover", pose: { type: "rel", back: 13, up: 4.6, ry: 0.66, fov: 42 } },
    plan: { s0: 204, s1: 256, entity: "rover", pose: { type: "rel", back: 11, up: 12, ry: 0.78, fov: 42 } },
    gate2: { s0: 256, s1: sRing, entity: "rover", pose: { type: "rel", back: 13, up: 5.2, ry: 0.66, fov: 42 } },
    // around the ring
    sparrow: worldKey("sparrow"),
    mpt: worldKey("mpt"),
    chiron: worldKey("chiron"),
    routem: worldKey("routem"),
    oscar: worldKey("oscar"),
    nova: worldKey("nova"),
    // up into the sky
    ascent: { pose: { type: "world", pos: new THREE.Vector3(center.x, center.y + 70, center.z).addScaledVector(F, -10), look: new THREE.Vector3(center.x, center.y + 180, center.z).addScaledVector(F, 80), fov: 46 } },
    crew: { pose: { type: "world", pos: stA.pos, look: stA.look, fov: 46, room: "right" } },
    transit: { pose: { type: "world", pos: stB.pos, look: stB.look, fov: 46, room: "right" } },
    toolkit: { pose: { type: "world", pos: stC.pos, look: stC.look, fov: 46, room: "right" } },
    // back down, into the corridor
    descent: { pose: { type: "world", pos: new THREE.Vector3(cor.pos.x, cor.pos.y + 110, cor.pos.z).addScaledVector(F, -70), look: cor.pos.clone().addScaledVector(F, 40).add(new THREE.Vector3(0, 4, 0)), fov: 44 } },
    path: { s0: sCorridor - 26, s1: sCorridor + years.length * GAP - 6, entity: "camera", pose: { type: "rel", back: 0, up: 5.2, lookAhead: 34, lookY: 3.4, fov: 44 } },
    resume: { s0: sCorridor + years.length * GAP - 6, s1: sFinalClamped - 34, entity: "camera", pose: { type: "rel", back: 0, up: 4.8, lookAhead: 34, lookY: 4.4, lookYTall: 8, fov: 44 } },
    gate: { s0: sFinalClamped - 34, s1: sFinalClamped + 16, entity: "camera", pose: { type: "rel", back: 0, up: 4.6, lookAhead: 34, lookY: 6.8, lookYTall: 9, fov: 44 } },
  };
  return {
    route,
    sRing,
    gates,
    yearGates,
    ring: { center, radius: RING_R, forward: F, right: R, slots },
    sky,
    finale: { sStart: sCorridor, sFinal: sFinalClamped, finalGate },
    keys,
    length: L,
  };
}
