import * as THREE from "three";
import { fbm } from "@/lib/terrain";
import { clamp } from "@/lib/math";
import { aim, createSculpture, mix3, TONE, type PointBuilder, type RGB } from "../../kit/sculpt";
import type { Exhibit, ExhibitContext } from "./common";

/* ROUTE-M — Mars, turning, and the two satellites that look at the same patch of it from either side of it: a stereo
   pair. The planet is drawn as a mapped surface (a graticule and elevation), the pair's view as two cones. */

const R = 1.7;
const CY = 3.3;
const ORBIT = 2.85;

const RAMP: RGB[] = [[0.42, 0.14, 0.08], [0.72, 0.27, 0.14], [0.95, 0.55, 0.26], [1.0, 0.82, 0.58], [0.96, 0.92, 0.86]];
const ramp = (t: number): RGB => {
  const x = clamp(t) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x));
  return mix3(RAMP[i], RAMP[i + 1], x - i);
};

function satellite(b: PointBuilder, tone: RGB) {
  b.box([0, 0, 0], [0.3, 0.24, 0.4], TONE.bone, { tone: 1.0, dens: 3 });
  for (const sx of [-1, 1]) {
    b.box([sx * 0.62, 0, 0], [0.82, 0.02, 0.3], tone, { tone: 1.0, dens: 3.2 });
  }
  b.box([0, 0, 0.26], [0.16, 0.16, 0.1], TONE.laser, { tone: 1.6, hot: 0.9, dens: 6 });
}

export function createRouteM(ctx: ExhibitContext): Exhibit {
  const S = createSculpture({ height: 6, lowPower: ctx.lowPower, pxPerUnit: ctx.pxPerUnit, size: 0.05 });
  const count = Math.round(4 * Math.PI * R * R * (ctx.lowPower ? 85 : 150));

  /* the planet */
  const planet = S.part(1, (b) => {
    b.sphere([0, 0, 0], R, count, (nx, ny, nz) => {
      const e = 0.5 + 0.5 * fbm(nx * 2.6 + 4, nz * 2.6 - 3 + ny * 1.9, 41, 4);
      const lat = Math.asin(ny), lon = Math.atan2(nz, nx);
      const fr = (v: number) => ((v % 1) + 1) % 1;
      const g = Math.min(Math.abs(fr((lat * 12) / Math.PI) - 0.5), Math.abs(fr((lon * 12) / Math.PI) - 0.5));
      const grat = g < 0.035 ? 1.35 : 1;
      const cap = Math.abs(ny) > 0.93 ? 1 : 0;
      return { c: cap ? ramp(0.97) : ramp(0.12 + e * 0.85), tone: (0.55 + 0.65 * e) * grat * (cap ? 1.1 : 1) };
    });
  });
  planet.points.position.set(0, CY, 0);
  S.hull(new THREE.SphereGeometry(R * 0.985, 32, 20), 0, CY, 0);

  /* its stand */
  S.part(2, (b) => {
    b.line([0, 0.02, 0], [0, CY - R - 0.05, 0], 0.05, TONE.dim, { tone: 0.8 });
    b.ring([0, 0.02, 0], 0.7, "y", 50, TONE.dim, { tone: 0.9 });
    b.ring([0, 0.02, 0], 1.15, "y", 70, TONE.bone, { tone: 0.5, dash: 18 });
  });

  /* the orbit and the patch both satellites look at */
  const pd = new THREE.Vector3(0.28, 0.5, 0.82).normalize();
  const e2 = new THREE.Vector3().crossVectors(pd, new THREE.Vector3(0.3, 1, 0.1)).normalize();
  const e3 = new THREE.Vector3().crossVectors(e2, pd).normalize();
  const orbitPoint = (th: number, out: THREE.Vector3) =>
    out.set(0, CY, 0).addScaledVector(pd, Math.cos(th) * ORBIT).addScaledVector(e2, Math.sin(th) * ORBIT);
  S.part(3, (b) => {
    const n = 150, v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      if (Math.floor((i / n) * 56) % 2) continue;
      orbitPoint((i / n) * Math.PI * 2, v);
      b.point(v.x, v.y, v.z, TONE.ice, { tone: 0.8 });
    }
  });

  const patch = pd.clone().multiplyScalar(R * 1.004);
  const pcenter = new THREE.Vector3(0, CY, 0).add(patch);
  const rim = 0.46;
  S.part(4, (b) => {
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const v = pcenter.clone().addScaledVector(e2, Math.cos(a) * rim).addScaledVector(e3, Math.sin(a) * rim);
      v.sub(new THREE.Vector3(0, CY, 0)).setLength(R * 1.006).add(new THREE.Vector3(0, CY, 0));
      b.point(v.x, v.y, v.z, TONE.laser, { tone: 1.8, hot: 0.9 });
    }
    for (let i = 0; i < 90; i++) {
      const a = b.rnd() * Math.PI * 2, r = rim * Math.sqrt(b.rnd());
      const v = pcenter.clone().addScaledVector(e2, Math.cos(a) * r).addScaledVector(e3, Math.sin(a) * r);
      v.sub(new THREE.Vector3(0, CY, 0)).setLength(R * 1.006).add(new THREE.Vector3(0, CY, 0));
      b.point(v.x, v.y, v.z, TONE.laser, { tone: 1.1, hot: 0.4 });
    }
  }, { size: 0.045 });

  /* the pair */
  const satA = S.part(5, (b) => satellite(b, TONE.ice), { size: 0.04 });
  const satB = S.part(6, (b) => satellite(b, TONE.bone), { size: 0.04 });

  /* what they see: from each, lines to the rim of the patch */
  const SIDES = 10;
  const mkLines = (colour: RGB) => S.lines(new Float32Array(SIDES * 2 * 3 + 6), colour, 0.55);
  const linesA = mkLines(TONE.ice), linesB = mkLines(TONE.bone);
  const rimPts: THREE.Vector3[] = [];
  for (let i = 0; i < SIDES; i++) {
    const a = (i / SIDES) * Math.PI * 2;
    const v = pcenter.clone().addScaledVector(e2, Math.cos(a) * rim).addScaledVector(e3, Math.sin(a) * rim);
    v.sub(new THREE.Vector3(0, CY, 0)).setLength(R * 1.004).add(new THREE.Vector3(0, CY, 0));
    rimPts.push(v);
  }
  const fill = (lines: ReturnType<typeof mkLines>, from: THREE.Vector3) => {
    const p = lines.geo.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < SIDES; i++) {
      p.setXYZ(i * 2, from.x, from.y, from.z);
      p.setXYZ(i * 2 + 1, rimPts[i].x, rimPts[i].y, rimPts[i].z);
    }
    p.setXYZ(SIDES * 2, from.x, from.y, from.z);
    p.setXYZ(SIDES * 2 + 1, pcenter.x, pcenter.y, pcenter.z);
    p.needsUpdate = true;
  };

  const va = new THREE.Vector3(), vb = new THREE.Vector3(), tc = new THREE.Vector3(0, CY, 0);
  return {
    S,
    pick: { center: [0, CY, 0], radius: 3.4 },
    callouts: [
      { id: "routem-base", text: "STEREO BASELINE", at: [0, CY + ORBIT * 0.78, 0], side: "right" },
      { id: "routem-res", text: "≤ 1 M / PIXEL", at: [pcenter.x, pcenter.y - 0.6, pcenter.z], side: "left" },
    ],
    tick(t) {
      planet.points.rotation.y = t * 0.1;
      const d = 0.5 + 0.09 * Math.sin(t * 0.55);
      orbitPoint(-d, va);
      orbitPoint(d, vb);
      satA.points.position.copy(va);
      aim(satA.points, tc);
      satB.points.position.copy(vb);
      aim(satB.points, tc);
      fill(linesA, va);
      fill(linesB, vb);
    },
  };
}
