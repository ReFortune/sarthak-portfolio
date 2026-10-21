import * as THREE from "three";
import { heightAt } from "@/lib/terrain";
import { clamp, damp, smoothstep } from "@/lib/math";
import { createSculpture, TONE } from "../../kit/sculpt";
import { roverPoseAt } from "../../layout";
import { beats, type BeatId } from "../../story";
import type { Act, ActContext, ActFrame, Label, Project, Sortable } from "../types";
import type { Exhibit } from "./common";
import { createSparrow } from "./sparrow";
import { createMpt } from "./mpt";
import { createChiron } from "./chiron";
import { createRouteM } from "./routem";
import { createOscar } from "./oscar";
import { createNova } from "./nova";

/* ─────────────────────────────────────────────────────────────────────────
   ACT III — THE INSTRUMENTS. A ring of six exhibits around a point on the plain, one for each project. The camera
   goes round them as the story does; whichever it is on is scanned in, the rest wait as ghosts. Each is also a
   button: the pointer finds it, a click opens its dossier.
   ───────────────────────────────────────────────────────────────────────── */

const B = Object.fromEntries(beats.map((b) => [b.id, b.index])) as Record<BeatId, number>;

type Placed = { id: string; beat: BeatId; ex: Exhibit; group: THREE.Group; hover: number; active: number };

export function createRing(ctx: ActContext): Act {
  const { layout } = ctx;
  const group = new THREE.Group();
  const { center, radius, slots } = layout.ring;

  const ectx = (slot: (typeof slots)[number]) => ({ ...ctx, slot });
  const placed: Placed[] = [];

  /* the exhibits, each standing on its spot and facing out */
  for (const slot of slots) {
    let ex: Exhibit;
    const g = new THREE.Group();
    if (slot.id === "sparrow") {
      // the rover is already there: this is what surrounds it
      const pose = roverPoseAt(layout.route, layout.sRing);
      ex = createSparrow(ectx(slot), pose);
      g.position.set(pose.x, pose.y, pose.z);
      g.rotation.y = pose.heading;
    } else {
      ex = { mpt: createMpt, chiron: createChiron, routem: createRouteM, oscar: createOscar, nova: createNova }[slot.id](ectx(slot));
      const out = new THREE.Vector3().subVectors(slot.pos, center).setY(0).normalize();
      g.position.copy(slot.pos);
      g.rotation.y = Math.atan2(out.x, out.z);
    }
    g.add(ex.S.group);
    group.add(g);
    placed.push({ id: slot.id, beat: slot.id as BeatId, ex, group: g, hover: 0, active: 0 });
  }

  /* the floor: a circle on the ground, a plinth under each exhibit, a post by each */
  const floor = createSculpture({ height: 1, lowPower: ctx.lowPower, pxPerUnit: ctx.pxPerUnit, size: 0.05 });
  floor.group.position.copy(center);
  const ringPart = floor.part(1, (b) => {
    const n = ctx.lowPower ? 180 : 320;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = Math.cos(a) * radius, z = Math.sin(a) * radius;
      b.point(x, heightAt(center.x + x, center.z + z) - center.y + 0.06, z, TONE.bone, { tone: 0.8, param: i / n });
    }
    const m = ctx.lowPower ? 90 : 160;
    for (let i = 0; i < m; i++) {
      if (Math.floor((i / m) * 48) % 2) continue;
      const a = (i / m) * Math.PI * 2;
      const x = Math.cos(a) * (radius + 1.6), z = Math.sin(a) * (radius + 1.6);
      b.point(x, heightAt(center.x + x, center.z + z) - center.y + 0.06, z, TONE.dim, { tone: 0.8, param: i / m });
    }
  });
  const plinths = slots.map((slot, i) =>
    floor.part(10 + i, (b) => {
      const lx = slot.pos.x - center.x, lz = slot.pos.z - center.z;
      const r = 2.7;
      const n = ctx.lowPower ? 50 : 90;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const x = lx + Math.cos(a) * r, z = lz + Math.sin(a) * r;
        b.point(x, heightAt(center.x + x, center.z + z) - center.y + 0.06, z, TONE.laser, { tone: 1.3, hot: 0.25, param: k / n });
      }
      for (let k = 0; k < (ctx.lowPower ? 30 : 60); k++) {
        const a = b.rnd() * Math.PI * 2, rr = r * Math.sqrt(b.rnd()) * 0.96;
        const x = lx + Math.cos(a) * rr, z = lz + Math.sin(a) * rr;
        b.point(x, heightAt(center.x + x, center.z + z) - center.y + 0.05, z, TONE.ice, { tone: 0.55, param: 0.2 });
      }
    }, { size: 0.045 })
  );
  group.add(floor.group);
  floor.setOrder(8);
  placed[0].ex.S.setOrder(200);

  /* picking: the pointer's ray against each exhibit's bounding sphere */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const c3 = new THREE.Vector3(), sph = new THREE.Sphere();
  let hovered: string | null = null;
  const tmpV = new THREE.Vector3();

  let lastActive = -1;
  return {
    group,
    update(f: ActFrame) {
      const x = f.x;
      const near = smoothstep(B.gate2 + 0.2, B.gate2 + 0.9, x) * (1 - smoothstep(B.nova + 0.85, B.ascent + 0.5, x));
      group.visible = near > 0.004;
      if (!group.visible) return;
      const t = f.t, dt = f.dt;
      let best = -1, bestA = 0.55;
      placed.forEach((p, i) => {
        const centre = B[p.beat] + 0.4;
        const a = 1 - smoothstep(0.35, 0.95, Math.abs(x - centre));
        p.active = a;
        if (a > bestA) { best = i; bestA = a; }
        p.hover = damp(p.hover, hovered === p.id ? 1 : 0, 10, dt);
        const gain = near * (0.4 + 0.6 * a);
        p.ex.S.setGain(gain);
        p.ex.S.setBoost(p.hover);
        p.ex.S.setBuilt(smoothstep(0.08, 0.8, a));
        p.ex.S.uniforms.uTime.value = t;
        p.ex.tick(t, dt, a, p.hover, gain);
        plinths[i].mul = 0.25 + 0.75 * a;
      });
      if (best !== lastActive && best >= 0) {
        lastActive = best;
        const s = slots[best];
        if (f.intro > 0.99) f.ping(s.pos.x, s.pos.z);
      }
      floor.setGain(near);
      floor.uniforms.uTime.value = t;
      ringPart.built.value = smoothstep(B.gate2 + 0.3, B.gate2 + 1.3, x);
      plinths.forEach((pl, i) => (pl.built.value = clamp(placed[i].active * 1.6)));
      floor.apply();
    },
    sortables() {
      return placed
        .filter((p) => p.id !== "sparrow")
        .map<Sortable>((p) => ({ pos: p.group.position, setOrder: (base) => p.ex.S.setOrder(base) }));
    },
    hover(nx, ny) {
      hovered = null;
      if (!group.visible) return null;
      ndc.set(nx, ny);
      ray.setFromCamera(ndc, ctx.camera);
      let bestT = Infinity;
      for (const p of placed) {
        if (p.active < 0.45) continue;
        c3.set(p.ex.pick.center[0], p.ex.pick.center[1], p.ex.pick.center[2]);
        p.group.localToWorld(c3);
        sph.set(c3, p.ex.pick.radius);
        const hit = ray.ray.intersectSphere(sph, tmpV);
        if (hit) {
          const d = tmpV.distanceTo(ray.ray.origin);
          if (d < bestT) { bestT = d; hovered = p.id; }
        }
      }
      return hovered;
    },
    labels(project: Project) {
      const out: Label[] = [];
      for (const p of placed) {
        if (p.active < 0.5 || !p.ex.callouts) continue;
        for (const c of p.ex.callouts) {
          tmpV.set(c.at[0], c.at[1], c.at[2]);
          p.group.localToWorld(tmpV);
          const s = project(tmpV);
          out.push({ id: c.id, x: s.x, y: s.y, visible: s.visible, text: c.text, side: c.side, alpha: smoothstep(0.5, 0.9, p.active) });
        }
      }
      return out;
    },
    dispose() {
      placed.forEach((p) => p.ex.S.dispose());
      floor.dispose();
    },
  };
}
