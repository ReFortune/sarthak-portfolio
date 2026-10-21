import * as THREE from "three";
import { clamp, smoothstep } from "@/lib/math";
import { createSculpture, TONE, type V3 } from "../../kit/sculpt";
import { beats } from "../../story";
import type { Cluster, ClusterContext } from "./common";

/* LEADERSHIP — a steel truss bridge hangs in the sky and builds itself from one abutment to the other, member by member,
   while a crew of nodes beneath it grows from six to twenty. The load that crosses it at the end is the test. */

const BEAT = beats.findIndex((b) => b.id === "crew");

const N = 10;
const L = 60;
const H = 8;
const WD = 4.8;
const YB = -4;
const YT = YB + H;

type Member = { a: V3; b: V3 };

export function createCrew(ctx: ClusterContext): Cluster {
  const S = createSculpture({ height: 1, lowPower: ctx.lowPower, pxPerUnit: ctx.pxPerUnit, size: 0.2 });
  const group = new THREE.Group();
  group.position.copy(ctx.frame.pos);
  group.rotation.y = ctx.frame.rotY;
  group.add(S.group);

  const xs = (i: number) => -L / 2 + (i * L) / N;
  const members: Member[] = [];
  for (const z of [-WD / 2, WD / 2]) {
    for (let i = 0; i < N; i++) members.push({ a: [xs(i), YB, z], b: [xs(i + 1), YB, z] });
    for (let i = 1; i < N - 1; i++) members.push({ a: [xs(i), YT, z], b: [xs(i + 1), YT, z] });
    for (let i = 1; i < N; i++) members.push({ a: [xs(i), YB, z], b: [xs(i), YT, z] });
    members.push({ a: [xs(0), YB, z], b: [xs(1), YT, z] }, { a: [xs(N), YB, z], b: [xs(N - 1), YT, z] });
    for (let i = 1; i < N / 2; i++) members.push({ a: [xs(i), YT, z], b: [xs(i + 1), YB, z] });
    for (let i = N / 2; i < N - 1; i++) members.push({ a: [xs(i), YB, z], b: [xs(i + 1), YT, z] });
  }
  for (let i = 0; i <= N; i++) members.push({ a: [xs(i), YB, -WD / 2], b: [xs(i), YB, WD / 2] });
  for (let i = 1; i < N; i++) members.push({ a: [xs(i), YT, -WD / 2], b: [xs(i), YT, WD / 2] });
  members.sort((p, q) => p.a[0] + p.b[0] - (q.a[0] + q.b[0]));

  // the members as lines, drawn out in order
  const seg = new Float32Array(members.length * 6);
  members.forEach((m, i) => seg.set([...m.a, ...m.b], i * 6));
  const lines = S.lines(seg, TONE.bone, 0.8);
  lines.geo.setDrawRange(0, 0);

  // the same members as points, with the joints, so the build line sweeps along it
  const bridge = S.part(1, (b) => {
    for (const m of members) {
      const len = Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1], m.b[2] - m.a[2]);
      const n = Math.max(2, Math.round(len / 0.5));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const x = m.a[0] + (m.b[0] - m.a[0]) * t;
        b.point(x, m.a[1] + (m.b[1] - m.a[1]) * t, m.a[2] + (m.b[2] - m.a[2]) * t, TONE.bone, { tone: 1.1, param: (x + L / 2) / L });
      }
    }
    for (let i = 0; i <= N; i++) {
      for (const z of [-WD / 2, WD / 2]) for (const y of [YB, YT]) {
        if ((i === 0 || i === N) && y === YT) continue;
        for (let k = 0; k < 6; k++) b.point(xs(i) + (b.rnd() - 0.5) * 0.7, y + (b.rnd() - 0.5) * 0.7, z + (b.rnd() - 0.5) * 0.7, TONE.laser, { tone: 1.7, hot: 0.55, param: i / N });
      }
    }
  }, { size: 0.2 });

  // deck and abutments
  const deck = S.part(2, (b) => {
    b.panel([0, YB - 0.1, 0], L, WD, TONE.dim, { axis: "y", dens: 0.02, tone: 1.0 });
    for (const sx of [-1, 1]) b.box([sx * (L / 2 + 2.5), YB - 3, 0], [5, 6, WD + 2.5], TONE.dim, { dens: 0.03, tone: 0.9 });
  }, { size: 0.22, density: 100 });

  // the test load that crosses at the end
  const load = S.part(3, (b) => {
    b.box([0, 0, 0], [1.9, 1.1, 1.9], TONE.laser, { dens: 0.9, tone: 1.5, hot: 0.8 });
  }, { size: 0.16, density: 100 });
  load.points.position.set(-L / 2, YB + 0.7, 0);

  // the crew: two rows of nodes under the bridge, lit in order
  const NODES = 20;
  const nodePos = (i: number): V3 => {
    const row = i < 10 ? 0 : 1, col = i % 10;
    return [(col - 4.5) * 3.2, YB - 8 - row * 3.6, 0];
  };
  const crew = S.part(4, (b) => {
    for (let i = 0; i < NODES; i++) {
      const [cx, cy, cz] = nodePos(i);
      const first = i < 6;
      const c = first ? TONE.laser : TONE.ice;
      const p = (i + 0.5) / NODES;
      b.point(cx, cy, cz, c, { tone: 2.4, hot: first ? 0.7 : 0.15, param: p });
      for (const [dx, dy] of [[0.55, 0], [-0.55, 0], [0, 0.55], [0, -0.55]]) for (let k = 0; k < 2; k++) b.point(cx + dx * (0.6 + 0.4 * k), cy + dy * (0.6 + 0.4 * k), cz, c, { tone: 1.3, param: p });
      b.ring([cx, cy, cz], 0.95, "z", 16, c, { tone: 0.8, param: p });
    }
  }, { size: 0.24 });

  return {
    group,
    update(f, _a, gain) {
      const local = f.x - BEAT;
      const grow = smoothstep(-0.25, 0.5, local);
      S.setGain(gain);
      S.uniforms.uTime.value = f.t;
      bridge.built.value = clamp(grow * 1.02);
      deck.built.value = bridge.built.value;
      load.built.value = 1;
      lines.geo.setDrawRange(0, Math.floor(members.length * clamp(grow * 1.1)) * 2);
      // crew grows from six to twenty
      const count = 6 + (NODES - 6) * smoothstep(0.1, 0.95, local);
      crew.built.value = (clamp(count / NODES) + 0.16) / 1.3 + 0.002;
      // the load drives across once the bridge stands
      const drive = smoothstep(0.55, 1.05, local);
      load.points.position.x = -L / 2 + L * drive;
      load.mul = smoothstep(0.5, 0.62, local) * (1 - smoothstep(1.0, 1.12, local));
      S.apply();
    },
    labels(project, a) {
      const out: ReturnType<NonNullable<Cluster["labels"]>> = [];
      const alpha = smoothstep(0.5, 0.9, a);
      const v = new THREE.Vector3();
      const push = (id: string, text: string, p: V3, side: "left" | "right" | "top") => {
        v.set(p[0], p[1], p[2]);
        group.localToWorld(v);
        const s = project(v);
        out.push({ id, text, x: s.x, y: s.y, visible: s.visible, side, alpha });
      };
      push("crew-bridge", "20 FT COMPETITION BRIDGE", [0, YT + 0.5, WD / 2], "top");
      push("crew-team", "6 → 20 MEMBERS", [nodePos(9)[0] + 2, nodePos(9)[1], 0], "right");
      return out;
    },
    dispose() {
      S.dispose();
    },
  };
}
