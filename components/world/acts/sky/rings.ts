import * as THREE from "three";
import { smoothstep } from "@/lib/math";
import { createSculpture, TONE } from "../../kit/sculpt";
import type { Layout } from "../../layout";
import type { ActFrame } from "../types";

/* THE ASCENT — a line of rings the camera climbs through on its way up, each flaring as it passes. They stand on the
   camera's own path, so they are the sense of speed. */

export function createRings(opts: { layout: Layout; lowPower: boolean; pxPerUnit: THREE.IUniform<number> }) {
  const { layout } = opts;
  const first = layout.keys.nova.pose, mid = layout.keys.ascent.pose, last = layout.keys.crew.pose;
  const pts = [first, mid, last].map((p) => (p.type === "world" ? p.pos.clone() : new THREE.Vector3()));
  const lens = [pts[0].distanceTo(pts[1]), pts[1].distanceTo(pts[2])];
  const total = lens[0] + lens[1];
  const at = (s: number, out: THREE.Vector3) => {
    const d = s * total;
    if (d < lens[0]) return out.lerpVectors(pts[0], pts[1], d / lens[0]);
    return out.lerpVectors(pts[1], pts[2], (d - lens[0]) / lens[1]);
  };

  const S = createSculpture({ height: 1, lowPower: opts.lowPower, pxPerUnit: opts.pxPerUnit, size: 0.12 });
  const COUNT = 10;
  const R = 16;
  const group = S.group;
  const rings: { s: number; part: ReturnType<typeof S.part> }[] = [];
  const v = new THREE.Vector3(), w = new THREE.Vector3(), dir = new THREE.Vector3();
  for (let i = 0; i < COUNT; i++) {
    const s = 0.08 + (0.86 * i) / (COUNT - 1);
    at(s, v);
    at(Math.min(1, s + 0.01), w);
    dir.subVectors(w, v).normalize();
    const part = S.part(i + 1, (b) => {
      const n = opts.lowPower ? 150 : 260;
      const warm = i % 3 === 2;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        b.point(Math.cos(a) * R, Math.sin(a) * R, 0, warm ? TONE.laser : TONE.ice, { tone: 1.6, hot: warm ? 0.45 : 0.12, param: k / n });
        if (k % 2 === 0) b.point(Math.cos(a) * R * 0.62, Math.sin(a) * R * 0.62, 0, TONE.dim, { tone: 0.9, param: k / n });
      }
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        b.line([Math.cos(a) * R * 0.62, Math.sin(a) * R * 0.62, 0], [Math.cos(a) * (R + 2.6), Math.sin(a) * (R + 2.6), 0], 0.6, TONE.bone, { tone: 0.9, param: 0.5 });
      }
    }, { size: 0.55 });
    part.points.position.copy(v);
    part.points.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    part.built.value = 1;
    rings.push({ s, part });
  }

  // progress of a point along the polyline, by nearest approach
  const along = (p: THREE.Vector3) => {
    let best = 0, bestD = Infinity;
    for (let k = 0; k < 2; k++) {
      const a = pts[k], b = pts[k + 1];
      w.subVectors(b, a);
      const t = Math.min(1, Math.max(0, v.subVectors(p, a).dot(w) / w.lengthSq()));
      const d = v.copy(a).addScaledVector(w, t).distanceToSquared(p);
      if (d < bestD) { bestD = d; best = k === 0 ? (t * lens[0]) / total : (lens[0] + t * lens[1]) / total; }
    }
    return best;
  };

  return {
    group,
    update(f: ActFrame, gain: number) {
      S.setGain(gain);
      S.uniforms.uTime.value = f.t;
      const sc = along(f.cam.pos);
      for (const r of rings) {
        const d = (sc - r.s) / 0.05;
        const flare = Math.exp(-d * d);
        r.part.mul = 0.35 + 1.5 * flare;
        r.part.built.value = 0.45 + 0.55 * smoothstep(-0.08, 0.02, sc - r.s + 0.12);
      }
      S.apply();
    },
    dispose() {
      S.dispose();
    },
  };
}
