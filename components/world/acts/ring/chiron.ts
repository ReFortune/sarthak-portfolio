import * as THREE from "three";
import { smoothstep } from "@/lib/math";
import { createSculpture, TONE } from "../../kit/sculpt";
import type { Exhibit, ExhibitContext } from "./common";

/* CHIRON — the hospital robot, in a stretch of corridor. It follows the line on the floor, stops at each door with its
   pills, and goes on. */

const LEN = 6.8;
const DEPTH = 2.2;
const WALL_H = 2.5;
const DOORS = [-2.3, 0.15, 2.5];
const WHEEL_R = 0.16;

export function createChiron(ctx: ExhibitContext): Exhibit {
  const S = createSculpture({ height: 3, lowPower: ctx.lowPower, pxPerUnit: ctx.pxPerUnit, size: 0.045 });

  /* the corridor: the floor, its line, the back wall and its doors */
  S.part(1, (b) => {
    b.panel([0, 0, 0], LEN, DEPTH, TONE.dim, { axis: "y", dens: 0.28, tone: 0.8 });
    b.line([-LEN / 2, 0.01, 0], [LEN / 2, 0.01, 0], 0.07, TONE.laser, { tone: 1.1, hot: 0.3 });
    b.line([-LEN / 2, 0.01, DEPTH / 2], [LEN / 2, 0.01, DEPTH / 2], 0.08, TONE.bone, { tone: 0.7 });
    b.line([-LEN / 2, 0.01, -DEPTH / 2], [LEN / 2, 0.01, -DEPTH / 2], 0.08, TONE.bone, { tone: 0.7 });
    b.panel([0, WALL_H / 2, -DEPTH / 2], LEN, WALL_H, TONE.dim, { dens: 0.2, tone: 0.8 });
    b.line([-LEN / 2, WALL_H, -DEPTH / 2], [LEN / 2, WALL_H, -DEPTH / 2], 0.07, TONE.bone, { tone: 0.9 });
    b.line([-LEN / 2, 0.9, -DEPTH / 2 + 0.01], [LEN / 2, 0.9, -DEPTH / 2 + 0.01], 0.1, TONE.bone, { tone: 0.5 });
    for (const x of DOORS) b.frame([x, 1.05, -DEPTH / 2 + 0.01], 0.95, 2.1, "z", 0.05, TONE.bone, { tone: 1.2 });
    for (const sx of [-1, 1]) b.line([sx * (LEN / 2), 0, -DEPTH / 2], [sx * (LEN / 2), WALL_H, -DEPTH / 2], 0.07, TONE.bone, { tone: 0.8 });
  });

  /* the lamp over each door: lit when the delivery is made */
  const lamps = DOORS.map((x, i) =>
    S.part(10 + i, (b) => {
      b.ring([x, 2.34, -DEPTH / 2 + 0.03], 0.08, "z", 16, TONE.laser, { tone: 1.6, hot: 1 });
      b.point(x, 2.34, -DEPTH / 2 + 0.03, TONE.laser, { tone: 2.2, hot: 1 });
    }, { size: 0.06 })
  );

  /* the robot, facing +z in its own frame (so its wheels spin like the rover's), turned to travel along the corridor */
  const bot = S.part(3, (b) => {
    b.box([0, 0.3, 0], [0.6, 0.2, 0.86], TONE.bone, { tone: 0.95, dens: 1.6 });
    for (const sx of [-1, 1]) {
      const wx = sx * 0.36;
      for (let i = 0; i < 80; i++) {
        const th = b.rnd() * Math.PI * 2;
        b.point(wx + (b.rnd() * 2 - 1) * 0.05, WHEEL_R + Math.cos(th) * WHEEL_R, 0.06 + Math.sin(th) * WHEEL_R, TONE.dim, { tone: 1.0, wheel: [wx, WHEEL_R, 0.06] });
      }
      for (let i = 0; i < 70; i++) {
        const th = b.rnd() * Math.PI * 2, r = WHEEL_R * Math.sqrt(b.rnd());
        b.point(wx + (b.rnd() < 0.5 ? -1 : 1) * 0.05, WHEEL_R + Math.cos(th) * r, 0.06 + Math.sin(th) * r, TONE.dim, { tone: 1.1, wheel: [wx, WHEEL_R, 0.06] });
      }
    }
    b.box([0, 0.92, -0.05], [0.42, 0.9, 0.5], TONE.bone, { tone: 1.0, dens: 1.4 });
    b.box([0, 1.48, -0.05], [0.16, 0.14, 0.26], TONE.bone, { tone: 1.1, dens: 2 });
    b.box([0, 1.48, 0.1], [0.1, 0.07, 0.03], TONE.laser, { tone: 1.7, hot: 1, dens: 8 });
    b.box([0, 1.0, 0.36], [0.38, 0.04, 0.46], TONE.bone, { tone: 0.9, dens: 1.5 });
    for (const [dx, dz, c] of [[-0.08, 0.22, TONE.ice], [0.06, 0.38, TONE.amber], [-0.06, 0.5, TONE.ice]] as [number, number, readonly [number, number, number]][]) {
      b.box([dx, 1.09, dz], [0.1, 0.1, 0.12], c, { tone: 1.2, dens: 2.5 });
    }
    b.box([0, 0.22, 0.52], [0.3, 0.05, 0.05], TONE.laser, { tone: 1.5, hot: 0.9, dens: 5 });
  }, { size: 0.045 });
  const botGroup = new THREE.Group();
  botGroup.rotation.y = Math.PI / 2;
  S.group.add(botGroup);
  botGroup.add(bot.points);
  S.hull(new THREE.BoxGeometry(0.62, 0.42, 0.9), 0, 0.4, 0, undefined, botGroup);
  S.hull(new THREE.BoxGeometry(0.44, 1.0, 0.52), 0, 0.95, -0.05, undefined, botGroup);

  S.hull(new THREE.BoxGeometry(LEN, 0.04, DEPTH), 0, -0.03, 0);
  S.hull(new THREE.PlaneGeometry(LEN, WALL_H), 0, WALL_H / 2, -DEPTH / 2 - 0.03);

  /* the patrol: door to door, stopping at each */
  const STOPS = [-3.0, ...DOORS, 3.0];
  const SEG = 2.6, WAIT = 1.3;
  const CYCLE = (STOPS.length - 1) * SEG + (STOPS.length - 2) * WAIT;
  const posAt = (t: number) => {
    let m = ((t % CYCLE) + CYCLE) % CYCLE;
    for (let i = 0; i < STOPS.length - 1; i++) {
      if (m < SEG) return { x: STOPS[i] + (STOPS[i + 1] - STOPS[i]) * smoothstep(0, 1, m / SEG), stop: -1 };
      m -= SEG;
      if (i < STOPS.length - 2) {
        if (m < WAIT) return { x: STOPS[i + 1], stop: i };
        m -= WAIT;
      }
    }
    return { x: STOPS[STOPS.length - 1], stop: -1 };
  };

  let lastX = STOPS[0], odo = 0, delivered = 0;
  return {
    S,
    pick: { center: [0, 1.1, 0], radius: 3.8 },
    callouts: [
      { id: "chiron-line", text: "LINE SENSOR", at: [0, 0.22, 0.6], side: "right" },
      { id: "chiron-room", text: "ROOM", at: [DOORS[1], 2.6, -DEPTH / 2], side: "left" },
    ],
    tick(t, _dt, active) {
      const p = posAt(t * 0.9);
      botGroup.position.x = p.x;
      odo += p.x - lastX;
      lastX = p.x;
      bot.spin.value = odo / WHEEL_R;
      if (p.stop >= 0) delivered = Math.max(delivered, p.stop + 1);
      if (p.x < -2.9) delivered = 0;
      lamps.forEach((l, i) => (l.mul = active > 0.05 ? (delivered > i ? 1 : 0.14) : 0));
      S.apply();
    },
  };
}
