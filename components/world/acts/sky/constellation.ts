import * as THREE from "three";
import { hash2 } from "@/lib/terrain";
import { clamp, damp, smoothstep } from "@/lib/math";
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

  /* the stars: a hot core, a halo and a small cross; one part for each group, so a group can be lit on its own */
  const groups = skillClusters.map((c) => c.id);
  const starParts = groups.map((cid, g) =>
    S.part(11 + g, (b) => {
      STARS.forEach((s, i) => {
        if (s.clusters[0] !== cid) return;
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
    }, { size: 0.55 })
  );

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
    return { id, l, n: list.length };
  });

  const centroid = (cid: string): V3 => {
    const m = STARS.filter((s) => s.clusters[0] === cid);
    return [m.reduce((n, s) => n + pos.get(s.id)![0], 0) / m.length, m.reduce((n, s) => n + pos.get(s.id)![1], 0) / m.length, 0];
  };

  /* what the page is pointing at: a group of skills, or one skill (which lights the groups it belongs to) */
  const lit = (focus: string | null, cid: string) => {
    if (!focus) return true;
    if (focus.startsWith("cluster:")) return focus.slice(8) === cid;
    const star = STARS.find((s) => `skill:${s.id}` === focus);
    return star ? star.clusters.includes(cid) : true;
  };
  const strong = (focus: string | null, s: Star) => (focus === null ? false : focus.startsWith("cluster:") ? s.clusters.includes(focus.slice(8)) : focus === `skill:${s.id}`);
  const mult = new Map<string, number>(groups.map((g) => [g, 1]));
  const named = new Map<string, number>(STARS.map((s) => [s.id, 0]));
  let docked = 0;
  let focus: string | null = null;

  const v = new THREE.Vector3();
  const dust = S.parts[groups.length];
  return {
    group,
    update(f, _a, gain) {
      const local = f.x - BEAT;
      const p = smoothstep(-0.25, 0.55, local);
      const e = smoothstep(0.15, 0.85, local);
      focus = f.focus && (f.focus.startsWith("cluster:") || f.focus.startsWith("skill:")) ? f.focus : null;
      docked = f.dock;
      S.setGain(gain);
      S.uniforms.uTime.value = f.t;
      dust.built.value = 1;
      groups.forEach((cid, g) => {
        // a group that is pointed at glows; the rest sit back
        const m = damp(mult.get(cid)!, focus === null ? 1 : lit(focus, cid) ? 1.7 : 0.3, 8, f.dt);
        mult.set(cid, m);
        starParts[g].built.value = (p + 0.16) / 1.3 + 0.002;
        starParts[g].mul = m;
      });
      for (const s of lineSets) {
        s.l.geo.setDrawRange(0, Math.floor(s.n * clamp(e * 1.05)) * 2);
        s.l.mat.opacity = 0.7 * gain * clamp(mult.get(s.id) ?? 1, 0, 1.5);
      }
      for (const s of STARS) {
        // with the skills listed beside it, a star carries its name only while it is pointed at
        const want = docked > 0.5 ? (strong(focus, s) ? 1 : 0) : 1;
        named.set(s.id, damp(named.get(s.id)!, want, 9, f.dt));
      }
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
      // the group names are set in full unless the chart has been drawn small enough that neighbours would run together
      const heads = skillClusters.map((c) => {
        const [cx] = centroid(c.id);
        const off = c.id === "sim" || c.id === "sw" ? H * 0.5 + 1 : -H * 0.5 - 4;
        v.set(cx, off, 0);
        group.localToWorld(v);
        return { c, off, cx, sx: project(v).x };
      });
      const gapOf = (a: string, b: string) => Math.abs(heads.find((h) => h.c.id === a)!.sx - heads.find((h) => h.c.id === b)!.sx);
      const tight = Math.min(gapOf("sim", "sw"), gapOf("hw", "sys")) < 250;
      for (const h of heads) push(`cl-${h.c.id}`, tight ? SHORT[h.c.id] : h.c.name.toUpperCase(), [h.cx, h.off, 0], "top", "cluster", false, SHORT[h.c.id]);
      for (const s of STARS) {
        const side = s.a === "r" ? "right" : s.a === "l" ? "left" : s.a === "t" ? "top" : "bottom";
        const k = named.get(s.id) ?? 1;
        if (k < 0.03) continue;
        const [x, y, z] = pos.get(s.id)!;
        v.set(x, y, z);
        group.localToWorld(v);
        const sp = project(v);
        out.push({ id: `st-${s.id}`, text: s.label, x: sp.x, y: sp.y, visible: sp.visible, side, alpha: alpha * k, kind: "tag", minor: true });
      }
      return out;
    },
    dispose() {
      S.dispose();
    },
  };
}
