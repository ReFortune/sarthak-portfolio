import * as THREE from "three";
import { heightAt } from "@/lib/terrain";
import { clamp, smoothstep, ymToYear } from "@/lib/math";
import { timeline, type TimelineKind } from "@/data/timeline";
import { createSculpture, TONE, type RGB } from "../kit/sculpt";
import { createDawn } from "../kit/dawn";
import { routeFrame } from "../layout";
import { beats, type BeatId } from "../story";
import type { Act, ActContext, ActFrame, Label, Project } from "./types";

/* ─────────────────────────────────────────────────────────────────────────
   ACT V — THE PATH. Down from the sky into a corridor of year gates; the timeline is laid along the ground beside it,
   each stretch of study, work and project a line that runs from the day it began to the day it ended. At the end of the
   corridor a last gate, and the sun coming up behind it.
   ───────────────────────────────────────────────────────────────────────── */

const B = Object.fromEntries(beats.map((b) => [b.id, b.index])) as Record<BeatId, number>;

const KIND: Record<TimelineKind, { side: -1 | 1; colour: RGB; tone: number }> = {
  education: { side: -1, colour: TONE.ice, tone: 1.1 },
  work: { side: -1, colour: TONE.bone, tone: 1.2 },
  research: { side: -1, colour: [0.85, 0.95, 1], tone: 1.3 },
  project: { side: 1, colour: TONE.laser, tone: 1.3 },
  leadership: { side: 1, colour: TONE.amber, tone: 1.2 },
};

export function createFinale(ctx: ActContext): Act {
  const { layout } = ctx;
  const group = new THREE.Group();
  const S = createSculpture({ height: 1, lowPower: ctx.lowPower, pxPerUnit: ctx.pxPerUnit, size: 0.07 });
  group.add(S.group);

  const sA = layout.finale.sStart;
  const GAP = layout.yearGates.length > 1 ? layout.yearGates[1].s - layout.yearGates[0].s : 17;
  const Y0 = layout.yearGates[0].year;
  const sOf = (t: number) => sA + (t - Y0) * GAP;
  const sEnd = layout.finale.sFinal + 14;
  const span = sEnd - (sA - 30);
  const prm = (s: number) => clamp((s - (sA - 30)) / span);
  const pos = new THREE.Vector3(), dir = new THREE.Vector3(), across = new THREE.Vector3();
  const ground = (s: number, off: number, lift: number) => {
    routeFrame(layout.route, s, pos, dir);
    across.set(dir.z, 0, -dir.x);
    const x = pos.x + across.x * off, z = pos.z + across.z * off;
    return [x, heightAt(x, z) + lift, z] as const;
  };

  /* the way: a dotted line down the middle of the corridor */
  S.part(1, (b) => {
    for (let s = sA - 30; s <= sEnd; s += 1.1) {
      const [x, y, z] = ground(s, 0, 0.1);
      b.point(x, y, z, TONE.laser, { tone: 1.15, hot: 0.25, param: prm(s) });
    }
  }, { size: 0.09 });

  /* the timeline, as lines beside it: each from the day it began to the day it ended */
  const rows = timeline.map((r) => {
    const t0 = ymToYear(r.start);
    const t1 = r.end ? ymToYear(r.end) + 1 / 12 : Y0 + layout.yearGates.length - 1.2;
    return { r, s0: sOf(t0), s1: Math.max(sOf(t1), sOf(t0) + 0.9), ...KIND[r.kind] };
  });
  const lanes: Record<string, number[]> = { "-1": [], "1": [] };
  const placed = rows
    .slice()
    .sort((a, b) => a.s0 - b.s0)
    .map((row) => {
      const l = lanes[String(row.side)];
      let k = l.findIndex((end) => end < row.s0 - 0.8);
      if (k < 0) { l.push(0); k = l.length - 1; }
      l[k] = row.s1;
      return { ...row, lane: k };
    });
  const rails = S.part(2, (b) => {
    for (const row of placed) {
      const off = row.side * (5.0 + row.lane * 0.75);
      for (let s = row.s0; s <= row.s1; s += 0.5) {
        const [x, y, z] = ground(s, off, 0.14);
        b.point(x, y, z, row.colour, { tone: row.tone * (0.7 + 0.3 * ((s - row.s0) / Math.max(1, row.s1 - row.s0))), hot: row.r.kind === "project" ? 0.15 : 0, param: prm(s) });
      }
      // a bright head where it began
      const [hx, hy, hz] = ground(row.s0, off, 0.3);
      b.point(hx, hy, hz, row.colour, { tone: 2.6, hot: 0.5, param: prm(row.s0) });
      b.point(hx, hy + 0.35, hz, row.colour, { tone: 1.8, param: prm(row.s0) });
    }
  }, { size: 0.085 });

  /* the sun behind the last gate */
  const fg = layout.finale.finalGate;
  const SUN_D = 430, SUN_R = 58;
  const SUN_YAW = 0.29; // radians to the right of where the camera looks (dead ahead on a tall screen, where the words are below)
  const dawn = createDawn(SUN_R);
  group.add(dawn.group);
  const sunAt = new THREE.Vector3(), look = new THREE.Vector3();

  const v = new THREE.Vector3();
  const labelRows = placed.filter((p) => p.s1 - p.s0 > GAP * 0.22 || p.r.kind === "research");
  let camS = 0;
  return {
    group,
    update(f: ActFrame) {
      const x = f.x;
      const on = smoothstep(B.toolkit + 0.8, B.descent + 0.7, x);
      group.visible = on > 0.004;
      if (!group.visible) return;
      S.setGain(on);
      S.uniforms.uTime.value = f.t;
      // the sun stays out ahead and a little to the right of wherever the camera is looking (so the words, at the left, are never over it)
      f.camera.getWorldDirection(look);
      const hl = Math.hypot(look.x, look.z) || 1;
      const tall = f.camera.aspect < 0.85;
      const yaw = tall ? 0.04 : SUN_YAW;
      const dx = look.x / hl, dz = look.z / hl, c = Math.cos(yaw), sn = Math.sin(yaw);
      sunAt.set(f.camera.position.x + (dx * c - dz * sn) * SUN_D, fg.pos.y + 9, f.camera.position.z + (dz * c + dx * sn) * SUN_D);
      dawn.group.position.copy(sunAt);
      dawn.group.rotation.y = Math.atan2(f.camera.position.x - sunAt.x, f.camera.position.z - sunAt.z);
      dawn.setGain(on * smoothstep(B.path - 0.3, B.resume + 0.3, x));
      dawn.setRise(smoothstep(B.resume + 0.1, B.gate + 0.5, x), tall ? 1.8 : 0);
      dawn.update(f.t);
      camS = f.cam.sRef ?? camS;
      // the line and the rails are drawn out ahead of the camera
      const reach = f.cam.sRef !== null ? f.cam.sRef + 46 : sA - 30 + span * smoothstep(B.descent, B.path, x);
      const p = prm(Math.max(reach, sA - 30 + span * smoothstep(B.descent + 0.2, B.path + 0.2, x)));
      for (const part of S.parts) part.built.value = (p + 0.16) / 1.3 + 0.002;
      S.apply();
    },
    labels(project: Project) {
      const out: Label[] = [];
      if (!group.visible) return out;
      const cs = camS;
      for (const g of layout.yearGates) {
        const d = g.s - cs;
        if (d < -4 || d > 62) continue;
        const gate = layout.gates.find((a) => a.id === `year-${g.year}`)!;
        v.set(gate.pos.x, gate.pos.y + 10.2, gate.pos.z);
        const s = project(v);
        out.push({
          id: `yr-${g.year}`,
          text: String(g.year),
          lines: g.items.slice(0, 4).concat(g.items.length > 4 ? [`+${g.items.length - 4} more`] : []),
          x: s.x,
          y: s.y,
          visible: s.visible,
          kind: "year",
          side: "top",
          alpha: smoothstep(62, 30, d) * smoothstep(-4, 4, d),
        });
      }
      for (const row of labelRows) {
        const d = row.s0 - cs;
        if (d < 2 || d > 34) continue;
        const [x, y, z] = ground(row.s0, row.side * (5.0 + row.lane * 0.75), 0.9);
        v.set(x, y, z);
        const s = project(v);
        out.push({ id: `tl-${row.r.id}`, text: row.r.label, x: s.x, y: s.y, visible: s.visible, side: row.side < 0 ? "left" : "right", alpha: smoothstep(34, 22, d) * smoothstep(2, 7, d), minor: true });
      }
      return out;
    },
    dispose() {
      S.dispose();
      dawn.dispose();
    },
  };
}
