import * as THREE from "three";
import { heightAt } from "@/lib/terrain";
import { smoothstep } from "@/lib/math";
import { HEAD } from "../../kit/rover";
import { createSculpture, TONE, type PointBuilder } from "../../kit/sculpt";
import type { Exhibit, ExhibitContext } from "./common";

/* SPARROW — the rover itself is the exhibit (the world's own, parked at the ring's gate). What this adds is what the
   project is about: one interface, three ways of seeing. Over and over, in turn, it fans out as a LiDAR, as a stereo
   pair, and as a single camera, and the ground it covers lights up. */

export type RoverPose = { x: number; y: number; z: number; heading: number };

const MODES = ["LIDAR", "STEREO", "MONOCULAR"] as const;
const PERIOD = 2.8;
const REACH = 6.8;

export function createSparrow(ctx: ExhibitContext, pose: RoverPose): Exhibit {
  const S = createSculpture({ height: 3, lowPower: ctx.lowPower, pxPerUnit: ctx.pxPerUnit, size: 0.05 });
  const sinH = Math.sin(pose.heading), cosH = Math.cos(pose.heading);
  /** Ground height under a point in rover space, relative to the rover. */
  const groundAt = (lx: number, lz: number) => heightAt(pose.x + lx * cosH + lz * sinH, pose.z - lx * sinH + lz * cosH) - pose.y;

  const head = HEAD.clone();
  head.z += 0.1;

  /* the cones, as lines */
  const ring = (cx: number, cz: number, rx: number, rz: number, n: number, out: [number, number, number][]) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const lx = cx + Math.cos(a) * rx, lz = cz + Math.sin(a) * rz;
      out.push([lx, groundAt(lx, lz) + 0.05, lz]);
    }
  };
  const toSegments = (apexes: THREE.Vector3[], sets: [number, number, number][][]) => {
    const arr: number[] = [];
    apexes.forEach((ap, k) => {
      const base = sets[k];
      base.forEach((p, i) => {
        arr.push(ap.x, ap.y, ap.z, p[0], p[1], p[2]);
        const q = base[(i + 1) % base.length];
        arr.push(p[0], p[1], p[2], q[0], q[1], q[2]);
      });
    });
    return new Float32Array(arr);
  };
  const D = REACH;

  // LiDAR: a planar fan to an arc on the ground
  const fan: [number, number, number][] = [];
  for (let i = 0; i <= 16; i++) {
    const phi = -0.95 + (1.9 * i) / 16;
    const k = 0.36, s = head.y / k;
    const lx = head.x + Math.sin(phi) * s, lz = head.z + Math.cos(phi) * s;
    fan.push([lx, groundAt(lx, lz) + 0.05, lz]);
  }
  const lidarSeg: number[] = [];
  fan.forEach((p, i) => {
    lidarSeg.push(head.x, head.y, head.z, p[0], p[1], p[2]);
    if (i < fan.length - 1) lidarSeg.push(p[0], p[1], p[2], fan[i + 1][0], fan[i + 1][1], fan[i + 1][2]);
  });
  const lidar = S.lines(new Float32Array(lidarSeg), TONE.laser, 0.7);

  // stereo: two cones from either side of the mast, whose views overlap ahead
  const eyeL = new THREE.Vector3(-0.2, head.y, head.z), eyeR = new THREE.Vector3(0.2, head.y, head.z);
  const baseL: [number, number, number][] = [], baseR: [number, number, number][] = [];
  ring(-0.35, D, 2.3, 1.9, 14, baseL);
  ring(0.35, D, 2.3, 1.9, 14, baseR);
  const stereo = S.lines(toSegments([eyeL, eyeR], [baseL, baseR]), TONE.ice, 0.6);

  // monocular: one cone
  const baseM: [number, number, number][] = [];
  ring(0, D, 2.1, 1.7, 16, baseM);
  const mono = S.lines(toSegments([head], [baseM]), TONE.bone, 0.55);

  /* the ground each one covers */
  const footprint = (salt: number, build: (b: PointBuilder) => void) => S.part(salt, build, { size: 0.04, density: 120 });
  const fLidar = footprint(1, (b) => {
    for (let i = 0; i < fan.length * 6; i++) {
      const t = (i / (fan.length * 6 - 1)) * (fan.length - 1);
      const k = Math.min(fan.length - 2, Math.floor(t)), f = t - k;
      const lx = fan[k][0] + (fan[k + 1][0] - fan[k][0]) * f, lz = fan[k][2] + (fan[k + 1][2] - fan[k][2]) * f;
      b.point(lx, groundAt(lx, lz) + 0.08, lz, TONE.laser, { tone: 1.5, hot: 0.7 });
    }
  });
  const inEllipse = (x: number, z: number, cx: number, cz: number, rx: number, rz: number) => ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2;
  const fStereo = footprint(2, (b) => {
    const n = ctx.lowPower ? 160 : 320;
    for (let i = 0; i < n; i++) {
      const lx = (b.rnd() * 2 - 1) * 2.7, lz = D - 2.2 + b.rnd() * 4.4;
      const a = inEllipse(lx, lz, -0.35, D, 2.3, 1.9), c = inEllipse(lx, lz, 0.35, D, 2.3, 1.9);
      if (a < 1 && c < 1) b.point(lx, groundAt(lx, lz) + 0.06, lz, TONE.ice, { tone: 1.3 });
      else if (a < 1 || c < 1) if (b.rnd() < 0.3) b.point(lx, groundAt(lx, lz) + 0.06, lz, TONE.deep, { tone: 1.0 });
    }
  });
  const fMono = footprint(3, (b) => {
    const n = ctx.lowPower ? 120 : 240;
    for (let i = 0; i < n; i++) {
      const lx = (b.rnd() * 2 - 1) * 2.2, lz = D - 1.8 + b.rnd() * 3.6;
      if (inEllipse(lx, lz, 0, D, 2.1, 1.7) < 1) b.point(lx, groundAt(lx, lz) + 0.06, lz, TONE.bone, { tone: 1.0 });
    }
  });

  /* the ground it stands on: a ring of dashes and four corners */
  S.part(4, (b) => {
    const r = 2.9;
    for (let i = 0; i < 120; i++) {
      if (Math.floor((i / 120) * 40) % 2) continue;
      const a = (i / 120) * Math.PI * 2;
      const lx = Math.cos(a) * r, lz = Math.sin(a) * r;
      b.point(lx, groundAt(lx, lz) + 0.06, lz, TONE.bone, { tone: 0.8 });
    }
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const lx = Math.cos(a) * r, lz = Math.sin(a) * r;
      b.line([lx, groundAt(lx, lz), lz], [lx, groundAt(lx, lz) + 0.7, lz], 0.06, TONE.laser, { tone: 1.2, hot: 0.2 });
    }
  });

  const callout = { id: "sparrow-mode", text: MODES[0] as string, at: [head.x, head.y + 0.5, head.z] as [number, number, number], side: "right" as const };
  const weights = [0, 0, 0];
  return {
    S,
    pick: { center: [0, 1.4, 0.4], radius: 2.6 },
    callouts: [callout],
    tick(t, _dt, active, _hover, gain) {
      const m = (t / PERIOD) % 3;
      let best = 0;
      for (let k = 0; k < 3; k++) {
        const d = Math.abs((((m - k + 1.5) % 3) + 3) % 3 - 1.5);
        weights[k] = 1 - smoothstep(0.32, 0.82, d);
        if (weights[k] > weights[best]) best = k;
      }
      callout.text = MODES[best];
      fLidar.mul = weights[0] * active;
      fStereo.mul = weights[1] * active;
      fMono.mul = weights[2] * active;
      lidar.mat.opacity = 0.7 * weights[0] * active * gain;
      stereo.mat.opacity = 0.6 * weights[1] * active * gain;
      mono.mat.opacity = 0.55 * weights[2] * active * gain;
      S.apply();
    },
  };
}
