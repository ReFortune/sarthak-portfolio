import * as THREE from "three";
import { heightAt } from "@/lib/terrain";
import { clamp, lerp, smoothstep } from "@/lib/math";
import { beatAt, beats } from "./story";
import { routeAt } from "./kit/route";
import { routeFrame, type Key, type Layout } from "./layout";

/* ─────────────────────────────────────────────────────────────────────────
   RIG — the camera as a function of scroll.

   Every beat has one key pose. Within a beat the camera holds its pose (so the copy can be read) and then eases
   to the next beat's pose; beats marked as travel (hold 0) move the whole way. Poses are either relative to the
   route (first person, or a chase view of the rover, framed by where the rover should sit on screen) or fixed in
   the world (the ring, the sky). Rotation is interpolated as a quaternion, so a pan never swings through a chord.
   ───────────────────────────────────────────────────────────────────────── */

export type CamState = {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  fov: number;
  /** Arc length of the camera's route reference (null off the route). */
  sRef: number | null;
  /** Arc length of the rover (it parks at the ring). */
  roverS: number;
  beat: number;
  local: number;
};

export function createCamState(): CamState {
  return { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 42, sRef: null, roverS: 0, beat: 0, local: 0 };
}

type Eval = { pos: THREE.Vector3; look: THREE.Vector3; fov: number; orbit: THREE.Vector3 | null };
const mkEval = (): Eval => ({ pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 42, orbit: null });

export type RigContext = {
  /** Field of view the active camera uses (the poses' own values are scaled by this over 42). */
  fovScale: number;
  /** Vertical field of view in degrees, to place the rover on screen. */
  fov: number;
  /** Width over height of the screen. */
  aspect: number;
  /** Portrait screens: where the rover should sit (fraction of the height), clear of the copy. Undefined elsewhere. */
  roverY?: number;
  /** 0–1: how far the picture has made room for the docked instrument panel (the words then sit low on the left). */
  dock: number;
};

/** With the panel docked, where the rover sits on screen (fraction of the height from the top): high, above the words. */
const DOCK_ROVER_Y = 0.4;
/** ...how much wider the view is (so the picture is smaller and clear of the words below it), and how high a fixed pose is aimed. */
const DOCK_FOV = 0.2;
const DOCK_LIFT = 0.3;

export function createRig(layout: Layout) {
  const keys: Key[] = beats.map((b) => layout.keys[b.id]);
  const lastRover = keys.reduce((n, k, i) => (k.entity === "rover" ? i : n), -1);
  const A = mkEval(), B = mkEval();
  const dirv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3();
  const ahead = { x: 0, y: 0, z: 0 };
  const frame = { pos: new THREE.Vector3(), dir: new THREE.Vector3() };
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), m = new THREE.Matrix4();

  function evalKey(key: Key, s: number | null, ctx: RigContext, out: Eval) {
    const p = key.pose;
    if (p.type === "world") {
      out.pos.copy(p.pos);
      out.look.copy(p.look);
      out.fov = (p.fov ?? 42) * ctx.fovScale * (1 + DOCK_FOV * ctx.dock);
      out.orbit = p.orbit ?? null;
      if (p.room) room(out, p.room, ctx);
      return;
    }
    routeFrame(layout.route, s ?? 0, frame.pos, frame.dir);
    const r = frame.pos, d = frame.dir;
    const side = p.side ?? 0;
    // `across` is the viewer's left when travelling along `d`; a positive `side` puts the camera on the right
    out.pos.set(r.x - d.x * p.back - d.z * side, r.y + p.up, r.z - d.z * p.back + d.x * side);
    out.fov = (p.fov ?? 42) * ctx.fovScale * (1 + DOCK_FOV * ctx.dock);
    out.orbit = null;
    if (p.ry !== undefined) {
      // aim so the rover (a metre above its wheels) lands `ry` of the way down the screen, centred across
      const dist = Math.hypot(p.back, side) || 1;
      const down = Math.atan2(out.pos.y - (r.y + 1), dist);
      const want = lerp(ctx.roverY ?? p.ry, DOCK_ROVER_Y, ctx.dock);
      const off = Math.atan((want - 0.5) * 2 * Math.tan((ctx.fov * Math.PI) / 360));
      const pitch = down - off;
      const hx = r.x - out.pos.x, hz = r.z - out.pos.z;
      const hl = Math.hypot(hx, hz) || 1;
      out.look.set(out.pos.x + (hx / hl) * Math.cos(pitch) * 10, out.pos.y - Math.sin(pitch) * 10, out.pos.z + (hz / hl) * Math.cos(pitch) * 10);
    } else {
      // look at the route a little way on (not along the tangent), so a bend in the route turns the view with it
      routeAt(layout.route, (s ?? 0) + (p.lookAhead ?? 30), ahead);
      out.look.set(ahead.x, ahead.y + (ctx.aspect < 0.85 && p.lookYTall !== undefined ? p.lookYTall : (p.lookY ?? 3)), ahead.z);
    }
  }

  /** Aim the camera so what it looks at lands off-centre, clear of the copy: to one side on a wide screen, high up on a tall one. */
  function room(out: Eval, side: "left" | "right", ctx: RigContext) {
    const tv = Math.tan((out.fov * Math.PI) / 360);
    const portrait = ctx.aspect < 0.85;
    // docked: the picture is centred in what the panel leaves, with the words below it, so there is no sideways room to make
    const fx = portrait ? 0 : (side === "left" ? 0.38 : -0.38) * (1 - ctx.dock);
    const fy = portrait ? 0.4 : lerp(0.04, DOCK_LIFT, ctx.dock);
    dirv.subVectors(out.look, out.pos);
    const len = dirv.length();
    dirv.normalize();
    dirv.applyAxisAngle(up, Math.atan(fx * tv * ctx.aspect));
    tmp.crossVectors(dirv, up).normalize();
    dirv.applyAxisAngle(tmp, -Math.atan(fy * tv));
    out.look.copy(out.pos).addScaledVector(dirv, len);
  }

  const quatOf = (e: Eval, q: THREE.Quaternion) => {
    m.lookAt(e.pos, e.look, up);
    return q.setFromRotationMatrix(m);
  };

  /** Where the camera is for scroll progress `u`. */
  function sample(u: number, ctx: RigContext, out: CamState) {
    const { index, local } = beatAt(u);
    const beat = beats[index];
    const ka = keys[index];
    const kb = keys[Math.min(keys.length - 1, index + 1)];

    // the route reference: where along the route the rover (or the camera) is during this beat
    const sCur = ka.s0 !== undefined && ka.s1 !== undefined ? lerp(ka.s0, ka.s1, local) : null;
    evalKey(ka, sCur, ctx, A);
    // a neighbour that follows the same thing is evaluated at the same moment, so a pose change keeps the rover framed
    const sNext = kb.s0 !== undefined ? (sCur !== null && kb.entity === ka.entity ? sCur : kb.s0) : null;
    evalKey(kb, sNext, ctx, B);

    let w: number;
    if (beat.hold > 0) w = smoothstep(0, 1, clamp((local - beat.hold) / (1 - beat.hold), 0, 1));
    else w = lerp(local, smoothstep(0, 1, local), 0.45);
    if (index === keys.length - 1) w = 0;

    // position: around a shared centre (the ring) or straight
    if (A.orbit && B.orbit && A.orbit.equals(B.orbit)) {
      const c = A.orbit;
      const a0 = Math.atan2(A.pos.z - c.z, A.pos.x - c.x), a1 = Math.atan2(B.pos.z - c.z, B.pos.x - c.x);
      let da = a1 - a0;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const r0 = Math.hypot(A.pos.x - c.x, A.pos.z - c.z), r1 = Math.hypot(B.pos.x - c.x, B.pos.z - c.z);
      const a = a0 + da * w, r = lerp(r0, r1, w);
      out.pos.set(c.x + Math.cos(a) * r, lerp(A.pos.y, B.pos.y, w), c.z + Math.sin(a) * r);
    } else {
      out.pos.lerpVectors(A.pos, B.pos, w);
    }
    quatOf(A, qa);
    quatOf(B, qb);
    out.quat.copy(qa).slerp(qb, w);
    out.fov = lerp(A.fov, B.fov, w);

    // stay above the ground
    if (out.pos.y < 400) out.pos.y = Math.max(out.pos.y, heightAt(out.pos.x, out.pos.z) + 2.8);

    out.sRef = sCur;
    out.roverS = index <= lastRover ? (sCur ?? 0) : layout.sRing;
    out.beat = index;
    out.local = local;
  }

  return { sample };
}
