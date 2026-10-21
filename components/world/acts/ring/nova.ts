import * as THREE from "three";
import { hash2 } from "@/lib/terrain";
import { createSculpture, TONE } from "../../kit/sculpt";
import type { Exhibit, ExhibitContext } from "./common";

/* NOVA — a payload under a balloon, and a ruler that slides past it: the way up to 40 km. */

const PIVOT_Y = 1.55;
const RULER_X = 2.35;

export function createNova(ctx: ExhibitContext): Exhibit {
  const S = createSculpture({ height: 6.4, lowPower: ctx.lowPower, pxPerUnit: ctx.pxPerUnit, size: 0.05 });

  /* the payload: a small box with a photometer dome on top, solar tile and the sensor that watches the sky */
  S.part(1, (b) => {
    b.box([0, 1.28, 0], [0.5, 0.34, 0.42], TONE.bone, { tone: 1.0, dens: 2.4 });
    b.box([0.28, 1.28, 0], [0.04, 0.26, 0.34], TONE.ice, { tone: 1.1, dens: 3 });
    b.box([0, 1.1, 0.215], [0.14, 0.06, 0.02], TONE.laser, { tone: 1.7, hot: 1, dens: 8 });
    b.cyl([0, 1.45, 0], 0.05, 0.1, "y", TONE.bone, { tone: 1.0, dens: 3 });
    b.sphere([0, 1.5, 0], 0.09, 40, (_x, ny) => (ny > -0.1 ? { c: TONE.ice, tone: 1.3 } : null));
    b.line([0.12, 1.45, -0.1], [0.12, 1.95, -0.1], 0.04, TONE.bone, { tone: 0.9 });
    // the pad it left
    b.ring([0, 0.02, 0], 0.8, "y", 60, TONE.dim, { tone: 0.9 });
    b.ring([0, 0.02, 0], 1.3, "y", 80, TONE.bone, { tone: 0.5, dash: 22 });
    b.line([0, 0.02, 0], [0, 1.1, 0], 0.07, TONE.dim, { tone: 0.5 });
  });
  S.hull(new THREE.BoxGeometry(0.52, 0.36, 0.44), 0, 1.28, 0);

  /* the balloon and its line, hung from the payload (they sway about it); written relative to the payload's top */
  const BAL_Y = 3.1, RX = 1.0, RY = 1.28;
  const balloon = S.part(2, (b) => {
    const N = Math.round(4 * Math.PI * RX * RX * (ctx.lowPower ? 70 : 125));
    b.sphere([0, BAL_Y, 0], [RX, RY, RX], N, (nx, ny, nz) => {
      const ang = Math.atan2(nz, nx);
      const gore = Math.abs(Math.sin(ang * 6)) < 0.06 ? 1 : 0;
      return { c: gore ? TONE.bone : TONE.ice, tone: gore ? 1.35 : 0.5 + 0.12 * ny };
    });
    // the neck and the line to the payload
    b.cyl([0, BAL_Y - RY - 0.32, 0], 0.17, 0.34, "y", TONE.ice, { tone: 0.8, dens: 1.5, taper: -0.5 });
    b.line([0, 0, 0], [0, BAL_Y - RY - 0.3, 0], 0.045, TONE.bone, { tone: 0.8 });
    b.ring([0, BAL_Y + RY * 0.995, 0], 0.12, "y", 20, TONE.bone, { tone: 1.2 });
  });
  balloon.points.position.set(0, PIVOT_Y, 0);
  const hullGeo = new THREE.SphereGeometry(1, 28, 18);
  hullGeo.scale(RX * 0.98, RY * 0.98, RX * 0.98);
  S.hull(hullGeo, 0, BAL_Y, 0, undefined, balloon.points);

  /* the sky it is looking at */
  S.part(3, (b) => {
    for (let i = 0; i < (ctx.lowPower ? 40 : 90); i++) {
      const th = hash2(i, 1, 311) * Math.PI * 2, el = Math.acos(1 - hash2(i, 2, 311) * 1.2);
      const r = 3.6 + hash2(i, 3, 311) * 1.6;
      const x = Math.sin(el) * Math.cos(th) * r, y = 4 + Math.cos(el) * r * 0.9, z = -Math.abs(Math.sin(el) * Math.sin(th)) * r - 0.6;
      b.point(x, y, z, TONE.bone, { tone: 0.35 + hash2(i, 4, 311) * 0.7 });
    }
  }, { size: 0.035 });

  /* the ruler: a rail and ticks that slide down it */
  S.part(4, (b) => {
    b.line([RULER_X, 0, 0], [RULER_X, 6.1, 0], 0.07, TONE.dim, { tone: 0.8 });
    for (const [y, major] of [[0, true], [1.5, true], [3, true], [4.5, true], [6, true]] as [number, boolean][]) {
      b.line([RULER_X - (major ? 0.32 : 0.18), y, 0], [RULER_X, y, 0], 0.05, TONE.bone, { tone: 1.0 });
    }
  });
  const ticks = S.lines(new Float32Array(10 * 2 * 3), TONE.bone, 0.5);

  const tk = ticks.geo.getAttribute("position") as THREE.BufferAttribute;
  return {
    S,
    pick: { center: [0, 3.2, 0], radius: 3.4 },
    callouts: [
      { id: "nova-alt", text: "40 KM", at: [RULER_X, 6.0, 0], side: "right" },
      { id: "nova-payload", text: "< 500 G", at: [0.3, 1.2, 0.2], side: "right" },
    ],
    tick(t) {
      const sway = Math.sin(t * 0.45) * 0.035, sway2 = Math.sin(t * 0.37 + 1) * 0.02;
      balloon.points.rotation.set(sway2, 0, sway);
      const off = (t * 0.45) % 0.75;
      for (let k = 0; k < 10; k++) {
        const y = k * 0.75 - off;
        const len = 0.14;
        tk.setXYZ(k * 2, RULER_X - len, y, 0);
        tk.setXYZ(k * 2 + 1, RULER_X, y, 0);
      }
      tk.needsUpdate = true;
    },
  };
}
