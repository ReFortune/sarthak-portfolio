import * as THREE from "three";
import { fbm, hash2 } from "@/lib/terrain";
import { smoothstep } from "@/lib/math";
import { FLUX, TRANSIT_FRAMES } from "@/data/transitCurve";
import { research } from "@/data/research";
import { createSculpture, TONE, type RGB, type V3 } from "../../kit/sculpt";
import { beats } from "../../story";
import type { Cluster, ClusterContext } from "./common";

/* RESEARCH — HAT-P-18 b crosses its star. The planet is a dark disc sliding over a granulated sun, and below it the
   light curve is drawn from the real frames as the transit goes: the dip, the flat bottom, the way back up. */

const BEAT = beats.findIndex((b) => b.id === "transit");

const RS = 14;
const K = Math.sqrt(research.paper.depthPercent / 100);
const RP = RS * K;
const CONTACT = research.paper.contacts;
const BOARD_W = 58;
const BOARD_H = 12;
const BOARD_Y = -RS * 2.15;
const B_IMPACT = -0.18;

/** The planet's position across the star for a frame: the paper's four contacts, joined by straight lines. */
function planetX(F: number) {
  const o = 1 + K, i = 1 - K;
  const pts: [number, number][] = [[0, -o - (CONTACT.ingressStart / (CONTACT.ingressEnd - CONTACT.ingressStart)) * (o - i)], [CONTACT.ingressStart, -o], [CONTACT.ingressEnd, -i], [CONTACT.egressStart, i], [CONTACT.egressEnd, o], [TRANSIT_FRAMES, o + 0.3]];
  for (let k = 1; k < pts.length; k++) {
    if (F <= pts[k][0]) {
      const t = (F - pts[k - 1][0]) / (pts[k][0] - pts[k - 1][0]);
      return (pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * t) * RS;
    }
  }
  return pts[pts.length - 1][1] * RS;
}

function smoothed(win: number) {
  const out: number[] = [];
  for (let i = 0; i < FLUX.length; i++) {
    let s = 0, n = 0;
    for (let k = -win; k <= win; k++) {
      const j = i + k;
      if (j >= 0 && j < FLUX.length) { s += FLUX[j]; n++; }
    }
    out.push(s / n);
  }
  return out;
}

export function createTransit(ctx: ClusterContext): Cluster {
  const star = createSculpture({ height: 1, lowPower: ctx.lowPower, pxPerUnit: ctx.pxPerUnit, size: 0.4 });
  const front = createSculpture({ height: 1, lowPower: ctx.lowPower, pxPerUnit: ctx.pxPerUnit, size: 0.15 });
  star.setOrder(10);
  front.setOrder(60);
  const group = new THREE.Group();
  group.position.copy(ctx.frame.pos);
  group.rotation.y = ctx.frame.rotY;
  group.add(star.group, front.group);

  /* the star: its near face, darker toward the edge */
  const N = ctx.lowPower ? 9000 : 22000;
  star.part(1, (b) => {
    for (let i = 0; i < N; i++) {
      // a random point on the near face (no lattice to show through)
      const z = hash2(i, 1, 801), th = hash2(i, 2, 801) * Math.PI * 2;
      const mu = Math.sqrt(z), rr = Math.sqrt(1 - z);
      const nx = Math.cos(th) * rr, ny = Math.sin(th) * rr, nz = mu;
      const g = hash2(i, 5, 801);
      // cells of rising gas: bright lanes between darker cells, drifting over the face
      const cells = 0.5 + 0.5 * fbm(nx * 9 + 3, ny * 9 - 2, 803, 3);
      const limb = 0.28 + 0.72 * Math.pow(mu, 0.55);
      const c: RGB = [1.0, 0.46 + 0.4 * mu + 0.08 * g, 0.12 + 0.46 * mu * mu];
      b.point(nx * RS, ny * RS, nz * RS, c, { tone: limb * (0.55 + 0.95 * cells * (0.6 + 0.4 * g)), hot: 0.04 + 0.2 * cells * g });
    }
    // a faint halo
    for (let i = 0; i < 260; i++) {
      const a = hash2(i, 1, 802) * Math.PI * 2, r = RS * (1.05 + hash2(i, 2, 802) * 0.5);
      b.point(Math.cos(a) * r, Math.sin(a) * r, -0.5, TONE.amber, { tone: 0.45 * (1 - (r / RS - 1.05) / 0.5) });
    }
  }, { size: 0.3 });

  /* the planet: a dark disc in front, with a thin bright rim */
  const planetGroup = new THREE.Group();
  front.group.add(planetGroup);
  front.hull(new THREE.SphereGeometry(RP * 0.99, 24, 16), 0, 0, 0, undefined, planetGroup);
  const planet = front.part(2, (b) => {
    b.ring([0, 0, 0], RP * 1.05, "z", 90, TONE.ice, { tone: 1.2 });
    b.sphere([0, 0, 0], RP, 520, (nx, ny, nz) => (nz > 0 ? { c: TONE.dim, tone: 0.4 + 0.4 * Math.max(0, ny * 0.5 + nx * 0.3) } : null));
  }, { size: 0.12 });
  planetGroup.add(planet.points);

  /* the light curve */
  const fx = (F: number) => -BOARD_W / 2 + (F / TRANSIT_FRAMES) * BOARD_W;
  const fy = (v: number) => BOARD_Y + ((v - 0.9885) / 0.052) * BOARD_H;
  const model = smoothed(14);
  const board = star.part(3, (b) => {
    for (let F = 0; F < TRANSIT_FRAMES; F++) b.point(fx(F), fy(FLUX[F]), 0, TONE.ice, { tone: 0.9, param: F / TRANSIT_FRAMES });
    b.line([-BOARD_W / 2, fy(1), 0], [BOARD_W / 2, fy(1), 0], 0.7, TONE.dim, { tone: 0.7, param: 0.2 });
    b.line([-BOARD_W / 2, BOARD_Y - BOARD_H / 2 - 1, 0], [BOARD_W / 2, BOARD_Y - BOARD_H / 2 - 1, 0], 0.7, TONE.bone, { tone: 0.8, param: 0.2 });
    b.line([-BOARD_W / 2 - 1, BOARD_Y - BOARD_H / 2 - 1, 0], [-BOARD_W / 2 - 1, BOARD_Y + BOARD_H / 2 + 1, 0], 0.7, TONE.bone, { tone: 0.8, param: 0.2 });
    for (const F of [CONTACT.ingressStart, CONTACT.ingressEnd, CONTACT.egressStart, CONTACT.egressEnd]) {
      b.line([fx(F), BOARD_Y - BOARD_H / 2 - 1, 0], [fx(F), BOARD_Y - BOARD_H / 2 - 2.6, 0], 0.5, TONE.laser, { tone: 1.3, hot: 0.3, param: 0.2 });
    }
  }, { size: 0.3 });
  const seg = new Float32Array((TRANSIT_FRAMES - 1) * 6);
  for (let F = 0; F < TRANSIT_FRAMES - 1; F++) seg.set([fx(F), fy(model[F]), 0, fx(F + 1), fy(model[F + 1]), 0], F * 6);
  const curve = star.lines(seg, TONE.laser, 0.95);
  curve.geo.setDrawRange(0, 0);
  const marker = star.part(4, (b) => {
    b.point(0, 0, 0, TONE.laser, { tone: 3, hot: 1 });
    b.ring([0, 0, 0], 0.9, "z", 20, TONE.laser, { tone: 1.6, hot: 0.8 });
  }, { size: 0.5 });

  const v = new THREE.Vector3();
  return {
    group,
    update(f, _a, gain) {
      const local = f.x - BEAT;
      const p = smoothstep(-0.12, 0.92, local);
      const F = p * (TRANSIT_FRAMES - 1);
      star.setGain(gain);
      front.setGain(gain);
      star.uniforms.uTime.value = f.t;
      front.uniforms.uTime.value = f.t;
      for (const part of star.parts) part.built.value = 1;
      for (const part of front.parts) part.built.value = 1;
      board.built.value = (p + 0.16) / 1.3 + 0.002;
      planetGroup.position.set(planetX(F), RS * B_IMPACT, 3);
      curve.geo.setDrawRange(0, Math.floor(F) * 2);
      const k = Math.min(TRANSIT_FRAMES - 1, Math.floor(F));
      marker.points.position.set(fx(F), fy(model[k]), 0);
      marker.mul = smoothstep(0.0, 0.04, p) * (1 - smoothstep(0.985, 1, p));
      star.apply();
      front.apply();
    },
    labels(project, a) {
      const alpha = smoothstep(0.5, 0.9, a);
      const out: ReturnType<NonNullable<Cluster["labels"]>> = [];
      const push = (id: string, text: string, p: V3, side: "left" | "right") => {
        v.set(p[0], p[1], p[2]);
        group.localToWorld(v);
        const s = project(v);
        out.push({ id, text, x: s.x, y: s.y, visible: s.visible, side, alpha });
      };
      push("transit-star", `HAT-P-18 · K DWARF · ${research.paper.distanceLy} LY`, [-RS * 0.9, RS * 0.95, 0], "left");
      push("transit-flux", "FLUX", [-BOARD_W / 2 - 1, BOARD_Y + BOARD_H / 2 + 1, 0], "left");
      push("transit-depth", `−${research.paper.depthPercent} %`, [fx((CONTACT.ingressEnd + CONTACT.egressStart) / 2), fy(0.9645), 0], "right");
      push("transit-frames", `${research.numbers.frames} FRAMES · ${research.numbers.exposureSeconds} S EXPOSURES`, [BOARD_W / 2, BOARD_Y - BOARD_H / 2 - 1, 0], "right");
      return out;
    },
    dispose() {
      star.dispose();
      front.dispose();
    },
  };
}
