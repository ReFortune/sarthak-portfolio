import * as THREE from "three";
import { smoothstep } from "@/lib/math";
import { SKY_STATIONS } from "../../layout";
import { beats, type BeatId } from "../../story";
import type { Act, ActContext, ActFrame, Label, Project } from "../types";
import { clusterFrame, type Cluster } from "./common";
import { createCrew } from "./crew";
import { createTransit } from "./transit";
import { createConstellation } from "./constellation";
import { createRings } from "./rings";
import { createLimb } from "../../kit/limb";

/* ─────────────────────────────────────────────────────────────────────────
   ACT IV — THE SKY. The camera climbs out of the ring, through a line of rings, to a point high above the plain and
   turns on the spot to three things that hang there: a bridge being built (leadership), a star being crossed by a
   planet (research), and a chart of stars (skills).
   ───────────────────────────────────────────────────────────────────────── */

const B = Object.fromEntries(beats.map((b) => [b.id, b.index])) as Record<BeatId, number>;

export function createSky(ctx: ActContext): Act {
  const { layout } = ctx;
  const make = (az: number, up: number) => ({ ...ctx, frame: clusterFrame(layout, az, up) });
  const entries: { beat: BeatId; cluster: Cluster; from: number; to: number }[] = [
    { beat: "crew", cluster: createCrew(make(SKY_STATIONS.crew.az, SKY_STATIONS.crew.up)), from: B.ascent + 0.15, to: B.transit + 0.4 },
    { beat: "transit", cluster: createTransit(make(SKY_STATIONS.transit.az, SKY_STATIONS.transit.up)), from: B.crew + 0.5, to: B.toolkit + 0.4 },
    { beat: "toolkit", cluster: createConstellation(make(SKY_STATIONS.toolkit.az, SKY_STATIONS.toolkit.up)), from: B.transit + 0.5, to: B.descent + 0.5 },
  ];
  const rings = createRings({ layout, lowPower: ctx.lowPower, pxPerUnit: ctx.pxPerUnit });

  const group = new THREE.Group();
  // the planet below: it appears as the ground falls away
  const c = layout.ring.center;
  const limb = createLimb(8500, c.x, c.y, c.z);
  group.add(limb.mesh);
  group.add(rings.group);
  for (const e of entries) group.add(e.cluster.group);

  const gains = new Map<Cluster, { a: number; gain: number }>();
  return {
    group,
    update(f: ActFrame) {
      const x = f.x;
      const aspect = f.camera.aspect;
      const fit = aspect < 0.85 ? 0.8 : 1;
      const high = smoothstep(B.nova + 0.45, B.ascent + 0.45, x) * (1 - smoothstep(B.toolkit + 0.75, B.descent + 0.6, x));
      limb.setGain(high);
      if (high > 0.003) limb.update(f.camera.position, f.t);
      const ringGain = smoothstep(B.nova + 0.45, B.nova + 0.95, x) * (1 - smoothstep(B.crew + 0.0, B.crew + 0.5, x));
      rings.group.visible = ringGain > 0.004;
      if (rings.group.visible) rings.update(f, ringGain);
      for (const e of entries) {
        const gain = smoothstep(e.from, e.from + 0.6, x) * (1 - smoothstep(e.to - 0.4, e.to, x));
        const a = 1 - smoothstep(0.35, 0.95, Math.abs(x - (B[e.beat] + 0.4)));
        gains.set(e.cluster, { a, gain });
        e.cluster.group.visible = gain > 0.004;
        if (!e.cluster.group.visible) continue;
        e.cluster.group.scale.setScalar(fit);
        e.cluster.update(f, a, gain);
      }
    },
    labels(project: Project) {
      const out: Label[] = [];
      for (const e of entries) {
        const g = gains.get(e.cluster);
        if (!g || g.gain < 0.3 || !e.cluster.labels) continue;
        out.push(...e.cluster.labels(project, g.a));
      }
      return out;
    },
    dispose() {
      limb.dispose();
      rings.dispose();
      entries.forEach((e) => e.cluster.dispose());
    },
  };
}
