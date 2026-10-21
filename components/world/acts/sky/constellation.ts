import * as THREE from "three";
import { hash2 } from "@/lib/terrain";
import { clamp, smoothstep } from "@/lib/math";
import { EDGES, STARS, type Star } from "@/data/constellation";
import { skillClusters } from "@/data/skills";
import { createSculpture, TONE, type RGB, type V3 } from "../../kit/sculpt";
import { beats } from "../../story";
import type { Label } from "../types";
import type { Cluster, ClusterContext } from "./common";

/* SKILLS — the toolkit drawn as a star chart in the sky: four groups of stars, joined the way the skills lean on each
   other. The stars come on from left to right, then the lines between them. */

const BEAT = beats.findIndex((b) => b.id === "toolkit");

const W = 66;
const H = 41;
const COLOUR: Record<string, RGB> = { sim: TONE.ice, sw: TONE.bone, hw: TONE.amber, sys: TONE.laser };

const SHORT: Record<string, string> = { sim: "SIMULATION", sw: "SOFTWARE", hw: "HARDWARE", sys: "SYSTEMS" };

const place = (s: Star, z: number): V3 => [((s.x - 500) / 1000) * W, ((300 - s.y) / 600) * H, z];

export function createConstellation(ctx: ClusterContext): Cluster {
  const S = createSculpture({ height: 1, lowPower: ctx.lowPower, pxPerUnit: ctx.pxPerUnit, size: 0.5 });
  const group = new THREE.Group();
  group.position.copy(ctx.frame.pos);
  group.rotation.y = ctx.frame.rotY;
  group.add(S.group);

  const pos = new Map<string, V3>();
  STARS.forEach((s, i) => pos.set(s.id, place(s, (hash2(i, 1, 913) - 0.5) * 14)));
  const primary = (s: Star): RGB => (s.clusters.length > 1 ? TONE.bone : COLOUR[s.clusters[0]]);

  /* the stars: a hot core, a halo and a small cross */
  S.part(1, (b) => {
    STARS.forEach((s, i) => {
      const [x, y, z] = pos.get(s.id)!;
      const c = primary(s);
      const p = s.x / 1000;
      b.point(x, y, z, c, { tone: 3, hot: 0.35, param: p });
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2 + i, r = 0.7 + 0.4 * hash2(i, k, 914);
        b.point(x + Math.cos(a) * r, y + Math.sin(a) * r, z, c, { tone: 0.9, param: p });
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let k = 1; k <= 3; k++) b.point(x + dx * k * 0.7, y + dy * k * 0.7, z, c, { tone: 1.3 - k * 0.3, param: p });
    });
  }, { size: 0.55 });

  /* the dust of the field */
  S.part(2, (b) => {
    const n = ctx.lowPower ? 140 : 320;
    for (let i = 0; i < n; i++) b.point((hash2(i, 1, 915) - 0.5) * W * 1.25, (hash2(i, 2, 915) - 0.5) * H * 1.3, (hash2(i, 3, 915) - 0.5) * 24, TONE.dim, { tone: 0.3 + 0.8 * hash2(i, 4, 915), param: hash2(i, 5, 915) });
  }, { size: 0.28 });

  /* the lines between them, one set per group, drawn out in turn */
  const edgeSets = new Map<string, { id: string; a: V3; b: V3 }[]>();
  for (const [a, b] of EDGES) {
    const sa = STARS.find((s) => s.id === a)!, sb = STARS.find((s) => s.id === b)!;
    const shared = sa.clusters.find((c) => sb.clusters.includes(c)) ?? sa.clusters[0];
    if (!edgeSets.has(shared)) edgeSets.set(shared, []);
    edgeSets.get(shared)!.push({ id: `${a}|${b}`, a: pos.get(a)!, b: pos.get(b)! });
  }
  const lineSets = [...edgeSets.entries()].map(([id, list]) => {
    list.sort((p, q) => p.a[0] + p.b[0] - (q.a[0] + q.b[0]));
    const arr = new Float32Array(list.length * 6);
    list.forEach((e, i) => arr.set([...e.a, ...e.b], i * 6));
    const l = S.lines(arr, COLOUR[id], 0.7);
    l.geo.setDrawRange(0, 0);
    return { l, n: list.length };
  });

  const centroid = (cid: string): V3 => {
    const m = STARS.filter((s) => s.clusters[0] === cid);
    return [m.reduce((n, s) => n + pos.get(s.id)![0], 0) / m.length, m.reduce((n, s) => n + pos.get(s.id)![1], 0) / m.length, 0];
  };

  const v = new THREE.Vector3();
  const part = S.parts[0];
  return {
    group,
    update(f, _a, gain) {
      const local = f.x - BEAT;
      const p = smoothstep(-0.25, 0.55, local);
      const e = smoothstep(0.15, 0.85, local);
      S.setGain(gain);
      S.uniforms.uTime.value = f.t;
      part.built.value = (p + 0.16) / 1.3 + 0.002;
      S.parts[1].built.value = 1;
      for (const s of lineSets) s.l.geo.setDrawRange(0, Math.floor(s.n * clamp(e * 1.05)) * 2);
      S.apply();
    },
    labels(project, a) {
      const alpha = smoothstep(0.55, 0.92, a);
      const out: Label[] = [];
      const push = (id: string, text: string, p: V3, side: Label["side"], kind: Label["kind"], minor?: boolean, short?: string) => {
        v.set(p[0], p[1], p[2]);
        group.localToWorld(v);
        const s = project(v);
        out.push({ id, text, short, x: s.x, y: s.y, visible: s.visible, side, alpha, kind, minor });
      };
      for (const c of skillClusters) {
        const [cx, cy] = centroid(c.id);
        const off = c.id === "sim" || c.id === "sw" ? H * 0.5 + 1 : -H * 0.5 - 4;
        push(`cl-${c.id}`, c.name.toUpperCase(), [cx, off, 0], "top", "cluster", false, SHORT[c.id]);
      }
      for (const s of STARS) {
        const side = s.a === "r" ? "right" : s.a === "l" ? "left" : s.a === "t" ? "top" : "bottom";
        push(`st-${s.id}`, s.label, pos.get(s.id)!, side, "tag", true);
      }
      return out;
    },
    dispose() {
      S.dispose();
    },
  };
}
