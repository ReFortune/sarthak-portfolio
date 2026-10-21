import * as THREE from "three";
import { clamp } from "@/lib/math";
import { BETA, DESKTOP_LAYERS, Layer, PING_N, TRAIL_N, scaleLayers, type LayerSpec } from "@/components/hero/terrainScene";

/* ─────────────────────────────────────────────────────────────────────────
   TERRAIN — the hero's LiDAR ground (four density tiers of points that follow the camera), with the controls the
   world needs: an overall gain, a radial "re-scan" that uncovers it again after a cut, the pushbroom plane, and the
   hero's painted trail and ranging pings.
   ───────────────────────────────────────────────────────────────────────── */

/** The hero's layers, but the nearest is a little coarser and wider: the camera here is higher and further back. */
const LAYERS: LayerSpec[] = DESKTOP_LAYERS.map((l, i) =>
  i === 0 ? { ...l, dx: 0.1, dz: 0.2, zNear: 2, zFar: 26, xHalf: 14, size: 0.042, fade: [2, 4.5, 22, 26] as [number, number, number, number] } : l
);

export type Terrain = ReturnType<typeof createTerrain>;

export function createTerrain(opts: { lowPower: boolean; pxPerUnit: THREE.IUniform<number> }) {
  const U = {
    uCamZ: { value: 0 },
    uPxPerUnit: opts.pxPerUnit,
    uSparse: { value: 0.72 },
    uReveal: { value: 0 },
    uGain: { value: 1 },
    uLineK: { value: 3.2 },
    uSinB: { value: Math.sin(BETA) },
    uHead: { value: new THREE.Vector3() },
    uN: { value: new THREE.Vector3(0, 0.14, 0.99) },
    uOrigin: { value: new THREE.Vector3() },
    uTrail: { value: Array.from({ length: TRAIL_N }, () => new THREE.Vector4(0, 0, 0, 1)) },
    uPing: { value: Array.from({ length: PING_N }, () => new THREE.Vector4(0, 0, 0, 0)) },
  };
  const specs = opts.lowPower ? scaleLayers(LAYERS, 1.45) : LAYERS;
  const layers = specs.map((s) => new Layer(s, U as unknown as Record<string, THREE.IUniform>));
  const group = new THREE.Group();
  layers.forEach((l) => group.add(l.points));

  const st = {
    t: 0,
    revealT: -1, // <0 = idle (fully revealed once it has run)
    revealDur: 2.2,
    revealed: false,
    trailIdx: 0,
    trailBirth: new Float32Array(TRAIL_N).fill(-100),
    pingIdx: 0,
    pingBirth: new Float32Array(PING_N).fill(-100),
    pingPos: Array.from({ length: PING_N }, () => ({ x: 0, z: 0 })),
  };

  return {
    group,
    U,
    layers,
    /** Generate rows for the window around `camZ`, `budget` rows per layer at most. True once every layer is full. */
    update(camZ: number, budget: number) {
      let all = true;
      for (const l of layers) {
        l.update(camZ, budget);
        if (l.filled < 0.999) all = false;
      }
      return all;
    },
    setGain(g: number) {
      U.uGain.value = g;
      group.visible = g > 0.003;
    },
    /** Hide the ground, then let a ranging pulse from `origin` uncover it again. */
    rescan(origin: THREE.Vector3, seconds = 2.2) {
      U.uOrigin.value.copy(origin);
      st.revealT = 0;
      st.revealDur = seconds;
      st.revealed = false;
      U.uReveal.value = 0;
    },
    /** Skip the pulse: everything is there. */
    reveal() {
      st.revealT = -1;
      st.revealed = true;
      U.uReveal.value = 1e5;
    },
    get revealed() {
      return st.revealed;
    },
    /** Advance the reveal, the painted trail and the pings. */
    tick(dt: number) {
      st.t += dt;
      if (st.revealT >= 0) {
        st.revealT += dt;
        const k = clamp(st.revealT / st.revealDur, 0, 1);
        U.uReveal.value = (1 - Math.pow(1 - k, 2.4)) * 240;
        if (k >= 1) {
          st.revealT = -1;
          st.revealed = true;
          U.uReveal.value = 1e5;
        }
      }
      const life = 1.7;
      for (let i = 0; i < TRAIL_N; i++) {
        const age = st.t - st.trailBirth[i];
        U.uTrail.value[i].z = age >= life ? 0 : Math.pow(1 - age / life, 1.6);
      }
      const plife = 3.4;
      for (let i = 0; i < PING_N; i++) {
        const age = st.t - st.pingBirth[i];
        const v = U.uPing.value[i];
        if (age < 0 || age > plife) {
          v.w = 0;
          continue;
        }
        v.set(st.pingPos[i].x, st.pingPos[i].z, age * 26, Math.pow(1 - age / plife, 1.4));
      }
    },
    /** Light-paint a spot on the ground. */
    stamp(x: number, z: number, radius: number) {
      const i = st.trailIdx;
      st.trailIdx = (st.trailIdx + 1) % TRAIL_N;
      st.trailBirth[i] = st.t;
      U.uTrail.value[i].set(x, z, 1, radius);
    },
    /** A ranging ping spreading out from (x, z). */
    ping(x: number, z: number) {
      const i = st.pingIdx;
      st.pingIdx = (st.pingIdx + 1) % PING_N;
      st.pingBirth[i] = st.t;
      st.pingPos[i].x = x;
      st.pingPos[i].z = z;
    },
    dispose() {
      layers.forEach((l) => l.dispose());
    },
  };
}
