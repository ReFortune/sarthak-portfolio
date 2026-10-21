import * as THREE from "three";
import { fbm } from "@/lib/terrain";
import { damp } from "@/lib/math";
import { aim, createSculpture, TONE, type PointBuilder, type RGB } from "../../kit/sculpt";
import type { Exhibit, ExhibitContext } from "./common";

/* OSCAR — an ocean, and a spectrometer that sweeps across it from orbit. Where its swath passes, the points light, and
   the ones over a bloom flare; a small bar chart beside the planet reads what it saw. */

const R = 1.45;
const CY = 3.2;
const ORBIT = 2.55;

function bus(b: PointBuilder) {
  b.box([0, 0, 0], [0.28, 0.28, 0.4], TONE.bone, { tone: 1.0, dens: 3 });
  for (const sx of [-1, 1]) b.box([sx * 0.58, 0, -0.02], [0.78, 0.02, 0.28], TONE.ice, { tone: 1.0, dens: 3.2 });
  b.cyl([0, 0, 0.2], 0.075, 0.42, "z", TONE.bone, { tone: 1.1, dens: 3 });
  b.cyl([0, 0, 0.6], 0.05, 0.04, "z", TONE.laser, { tone: 1.8, hot: 1, dens: 6 });
}

export function createOscar(ctx: ExhibitContext): Exhibit {
  const S = createSculpture({ height: 6, lowPower: ctx.lowPower, pxPerUnit: ctx.pxPerUnit, size: 0.05 });
  const count = Math.round(4 * Math.PI * R * R * (ctx.lowPower ? 85 : 150));

  /* the planet: ocean, land, and the blooms along the coasts */
  const nrm = new Float32Array(count * 3);
  const alg = new Float32Array(count);
  const heat = new Float32Array(count);
  let n = 0;
  const planet = S.part(1, (b) => {
    b.sphere([0, 0, 0], R, count, (nx, ny, nz) => {
      const land = fbm(nx * 2.1 + 9, nz * 2.1 - 4 + ny * 1.7, 13, 4);
      const bloom = fbm(nx * 7.5 - 2, nz * 7.5 + ny * 6.1 + 5, 29, 3);
      const coast = 1 - Math.min(1, Math.abs(land - 0.08) * 5.5);
      let res: { c: RGB; tone: number; hot?: number } | null;
      let isAlg = 0;
      if (land > 0.08) res = { c: TONE.dim, tone: 0.55 + 0.5 * (land - 0.08) };
      else if (bloom > 0.12 && coast > 0.15) {
        isAlg = 1;
        res = { c: TONE.amber, tone: 1.0 };
      } else res = { c: TONE.ice, tone: 0.7 + 0.35 * (0.5 + 0.5 * bloom) * (0.6 + 0.4 * (1 - coast)) };
      if (Math.abs(ny) > 0.94) res = { c: TONE.bone, tone: 1.0 };
      nrm[n * 3] = nx; nrm[n * 3 + 1] = ny; nrm[n * 3 + 2] = nz;
      alg[n] = isAlg;
      n++;
      return res;
    });
  });
  planet.points.position.set(0, CY, 0);
  S.hull(new THREE.SphereGeometry(R * 0.985, 32, 20), 0, CY, 0);
  const pointCount = n;

  S.part(2, (b) => {
    b.line([0, 0.02, 0], [0, CY - R - 0.05, 0], 0.05, TONE.dim, { tone: 0.8 });
    b.ring([0, 0.02, 0], 0.7, "y", 50, TONE.dim, { tone: 0.9 });
    b.ring([0, 0.02, 0], 1.15, "y", 70, TONE.bone, { tone: 0.5, dash: 18 });
  });

  /* a near-polar orbit that passes in front of the planet */
  const oa = new THREE.Vector3(0.38, 1, 0.0).normalize();
  const oc = new THREE.Vector3(0.0, 0.0, 1).normalize();
  const on = new THREE.Vector3().crossVectors(oa, oc).normalize(); // across-track
  const center = new THREE.Vector3(0, CY, 0);
  const orbitPoint = (th: number, out: THREE.Vector3) => out.copy(center).addScaledVector(oa, Math.cos(th) * ORBIT).addScaledVector(oc, Math.sin(th) * ORBIT);
  S.part(3, (b) => {
    const m = 160, v = new THREE.Vector3();
    for (let i = 0; i < m; i++) {
      if (Math.floor((i / m) * 56) % 2) continue;
      orbitPoint((i / m) * Math.PI * 2, v);
      b.point(v.x, v.y, v.z, TONE.ice, { tone: 0.8 });
    }
  });
  const sat = S.part(4, bus, { size: 0.04 });

  /* the swath: an arc across the planet under the satellite, and lines up to the instrument */
  const ARC = 14;
  const swath = S.lines(new Float32Array((ARC * 2 + 6) * 3), TONE.laser, 0.8);
  const spec = S.lines(new Float32Array(9 * 2 * 3), TONE.bone, 0.8);
  const specBase = new THREE.Vector3(2.5, 2.35, 0);
  S.part(5, (b) => {
    b.line([specBase.x - 0.4, specBase.y, 0], [specBase.x + 0.4, specBase.y, 0], 0.05, TONE.dim, { tone: 0.9 });
  });

  const sp = new THREE.Vector3(), ph = new THREE.Vector3(), vh = new THREE.Vector3();
  const pl = new THREE.Vector3(), vl = new THREE.Vector3(), nl = new THREE.Vector3();
  const arc = Array.from({ length: ARC + 1 }, () => new THREE.Vector3());
  const rotY = new THREE.Quaternion(), axisY = new THREE.Vector3(0, 1, 0);
  let level = 0;
  const bars = new Float32Array(9);

  return {
    S,
    pick: { center: [0, CY, 0], radius: 3.4 },
    callouts: [
      { id: "oscar-spec", text: "SPECTROMETER", at: [specBase.x, specBase.y + 1.5, 0], side: "right" },
      { id: "oscar-bloom", text: "ALGAL BLOOM", at: [-R * 0.9, CY - R * 0.4, R * 0.5], side: "left" },
    ],
    tick(t, dt) {
      const spin = t * 0.09;
      planet.points.rotation.y = spin;
      const th = t * 0.62;
      orbitPoint(th, sp);
      sat.points.position.copy(sp);
      aim(sat.points, center);
      // satellite basis in planet space
      ph.copy(sp).sub(center).normalize();
      vh.crossVectors(on, ph).normalize();
      rotY.setFromAxisAngle(axisY, -spin);
      pl.copy(ph).applyQuaternion(rotY);
      vl.copy(vh).applyQuaternion(rotY);
      nl.copy(on).applyQuaternion(rotY);
      // light the points the swath crosses; they cool again afterwards
      const decay = Math.exp(-dt * 0.9);
      let seen = 0, lit = 0;
      for (let i = 0; i < pointCount; i++) {
        const x = nrm[i * 3], y = nrm[i * 3 + 1], z = nrm[i * 3 + 2];
        const along = x * vl.x + y * vl.y + z * vl.z;
        let h = heat[i] * decay;
        if (Math.abs(along) < 0.06 && x * pl.x + y * pl.y + z * pl.z > 0.86 && Math.abs(x * nl.x + y * nl.y + z * nl.z) < 0.5) {
          h = Math.max(h, alg[i] ? 1 : 0.38);
          seen++;
          if (alg[i]) lit++;
        }
        heat[i] = h;
      }
      const hotArr = planet.hot.array as Float32Array;
      for (let i = 0; i < pointCount; i++) hotArr[i] = heat[i];
      planet.hot.needsUpdate = true;
      level = damp(level, seen ? lit / seen : 0, 3, dt);

      // swath arc and fan
      const sw = swath.geo.getAttribute("position") as THREE.BufferAttribute;
      for (let k = 0; k <= ARC; k++) {
        const a = -0.5 + k / ARC;
        arc[k].copy(ph).multiplyScalar(Math.cos(a)).addScaledVector(on, Math.sin(a)).normalize().multiplyScalar(R * 1.012).add(center);
      }
      for (let k = 0; k < ARC; k++) {
        sw.setXYZ(k * 2, arc[k].x, arc[k].y, arc[k].z);
        sw.setXYZ(k * 2 + 1, arc[k + 1].x, arc[k + 1].y, arc[k + 1].z);
      }
      [0, ARC >> 1, ARC].forEach((k, j) => {
        sw.setXYZ(ARC * 2 + j * 2, sp.x, sp.y, sp.z);
        sw.setXYZ(ARC * 2 + j * 2 + 1, arc[k].x, arc[k].y, arc[k].z);
      });
      sw.needsUpdate = true;

      // the readout: nine bands, taller where there is more to see
      const sg = spec.geo.getAttribute("position") as THREE.BufferAttribute;
      for (let k = 0; k < 9; k++) {
        const profile = [0.5, 0.75, 0.55, 0.3, 0.35, 0.5, 0.45, 0.95, 0.4][k];
        const target = 0.12 + (0.25 + 1.3 * level) * profile + 0.05 * Math.sin(t * 3 + k * 1.7);
        bars[k] = damp(bars[k], target, 8, dt);
        const x = specBase.x - 0.36 + k * 0.09;
        sg.setXYZ(k * 2, x, specBase.y + 0.02, 0);
        sg.setXYZ(k * 2 + 1, x, specBase.y + 0.02 + bars[k], 0);
      }
      sg.needsUpdate = true;
    },
  };
}
