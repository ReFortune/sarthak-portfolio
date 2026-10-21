import * as THREE from "three";
import { hash2 } from "@/lib/terrain";
import { clamp } from "@/lib/math";
import { ROVER_VERT, SOFT_FRAG } from "./rover";

/* ─────────────────────────────────────────────────────────────────────────
   SCULPTURES — things made of scan points, the way the rover is: points sampled over surfaces, a laser line that
   builds them, a dark body under them. A `PointBuilder` lays the points down; a `Sculpture` owns the parts, their
   shared uniforms and the hulls.
   ───────────────────────────────────────────────────────────────────────── */

export type RGB = readonly [number, number, number];
export type V3 = readonly [number, number, number];

/** The palette of the site, as point colours (above 1 blooms). */
export const TONE = {
  bone: [0.93, 0.9, 0.84],
  ice: [0.46, 0.78, 1.0],
  deep: [0.22, 0.48, 0.78],
  laser: [1.0, 0.36, 0.18],
  amber: [1.0, 0.7, 0.3],
  rust: [0.78, 0.3, 0.16],
  dim: [0.38, 0.5, 0.64],
} as const satisfies Record<string, RGB>;

const _m = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0);
/** Turn an object (its +z) toward a point, both in its parent's space. */
export function aim(o: THREE.Object3D, target: THREE.Vector3) {
  _m.lookAt(target, o.position, _up);
  o.quaternion.setFromRotationMatrix(_m);
}

export const mix3 = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

type PointOpts = {
  /** 0–1 laser-hot (it glows, and pulses). */
  hot?: number;
  /** Brightness. */
  tone?: number;
  /** Spins about its own x axis around this centre when the part's `uSpin` changes (a wheel). */
  wheel?: V3;
  /** Overrides the height the build line sweeps by (0–1), e.g. progress along a path. */
  param?: number;
};

const LIGHT = new THREE.Vector3(0.72, 0.3, 0.56).normalize();

export class PointBuilder {
  readonly pos: number[] = [];
  readonly col: number[] = [];
  readonly seed: number[] = [];
  readonly hot: number[] = [];
  readonly ctr: number[] = [];
  readonly wheel: number[] = [];
  readonly param: number[] = [];
  private k = 0;
  constructor(private salt: number, /** points per m² on a surface of "standard" density */ readonly density = 140) {}

  rnd = () => hash2(this.k++, 11, 5000 + this.salt);
  get count() {
    return this.pos.length / 3;
  }

  /** One point. `n` is the surface normal there (for lighting), if there is one. */
  point(x: number, y: number, z: number, c: RGB, o: PointOpts & { n?: V3 } = {}) {
    let m = o.tone ?? 1;
    if (o.n) m *= 0.5 + 0.8 * clamp(o.n[0] * LIGHT.x + o.n[1] * LIGHT.y + o.n[2] * LIGHT.z, 0, 1);
    this.pos.push(x, y, z);
    this.col.push(c[0] * m, c[1] * m, c[2] * m);
    this.seed.push(this.rnd());
    this.hot.push(o.hot ?? 0);
    this.ctr.push(o.wheel?.[0] ?? 0, o.wheel?.[1] ?? 0, o.wheel?.[2] ?? 0);
    this.wheel.push(o.wheel ? 1 : 0);
    this.param.push(o.param ?? -1);
  }

  /** The six faces of a box, by area. */
  box(c: V3, s: V3, col: RGB, o: PointOpts & { dens?: number; faces?: string } = {}) {
    const d = (o.dens ?? 1) * this.density;
    const faces: [number, number, number, number, string][] = [
      [1, 0, 0, s[1] * s[2], "+x"], [-1, 0, 0, s[1] * s[2], "-x"],
      [0, 1, 0, s[0] * s[2], "+y"], [0, -1, 0, s[0] * s[2], "-y"],
      [0, 0, 1, s[0] * s[1], "+z"], [0, 0, -1, s[0] * s[1], "-z"],
    ];
    for (const [nx, ny, nz, area, tag] of faces) {
      if (o.faces && !o.faces.includes(tag)) continue;
      const n = Math.max(2, Math.round(area * d));
      for (let i = 0; i < n; i++) {
        const u = this.rnd() - 0.5, v = this.rnd() - 0.5;
        if (nx) this.point(c[0] + (nx * s[0]) / 2, c[1] + u * s[1], c[2] + v * s[2], col, { ...o, n: [nx, 0, 0] });
        else if (ny) this.point(c[0] + u * s[0], c[1] + (ny * s[1]) / 2, c[2] + v * s[2], col, { ...o, n: [0, ny, 0] });
        else this.point(c[0] + u * s[0], c[1] + v * s[1], c[2] + (nz * s[2]) / 2, col, { ...o, n: [0, 0, nz] });
      }
    }
  }

  /** A cylinder standing on `base` along `axis`. */
  cyl(base: V3, r: number, h: number, axis: "x" | "y" | "z", col: RGB, o: PointOpts & { dens?: number; caps?: boolean; taper?: number } = {}) {
    const d = (o.dens ?? 1) * this.density;
    const side = Math.max(6, Math.round(2 * Math.PI * r * h * d));
    const put = (a: number, t: number, rr: number, capN?: number) => {
      const ca = Math.cos(a), sa = Math.sin(a);
      const local: V3 = [ca * rr, t, sa * rr];
      const nl: V3 = capN !== undefined ? [0, capN, 0] : [ca, 0, sa];
      const map = (v: V3): V3 => (axis === "y" ? v : axis === "x" ? [v[1], v[0], v[2]] : [v[0], v[2], v[1]]);
      const p = map(local), nm = map(nl);
      this.point(base[0] + p[0], base[1] + p[1], base[2] + p[2], col, { ...o, n: nm });
    };
    for (let i = 0; i < side; i++) {
      const t = this.rnd() * h;
      const rr = r * (1 - (o.taper ?? 0) * (t / h));
      put(this.rnd() * Math.PI * 2, t, rr);
    }
    if (o.caps !== false) {
      const cap = Math.max(4, Math.round(Math.PI * r * r * d));
      for (const e of [0, 1]) {
        for (let i = 0; i < cap; i++) {
          const rr = r * Math.sqrt(this.rnd());
          put(this.rnd() * Math.PI * 2, e * h, rr * (1 - (o.taper ?? 0) * e), e ? 1 : -1);
        }
      }
    }
  }

  /** Points over a sphere (or ellipsoid), coloured by what `fn` says about each. */
  sphere(c: V3, r: number | V3, count: number, fn: (nx: number, ny: number, nz: number, i: number) => { c: RGB; tone?: number; hot?: number } | null) {
    const rr: V3 = typeof r === "number" ? [r, r, r] : r;
    const gold = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) {
      const y = 1 - ((i + 0.5) / count) * 2;
      const rad = Math.sqrt(1 - y * y);
      const th = gold * i;
      const nx = Math.cos(th) * rad, nz = Math.sin(th) * rad;
      const res = fn(nx, y, nz, i);
      if (!res) continue;
      this.point(c[0] + nx * rr[0], c[1] + y * rr[1], c[2] + nz * rr[2], res.c, { tone: res.tone, hot: res.hot, n: [nx, y, nz] });
    }
  }

  /** A circle of points, in the plane normal to `axis`. */
  ring(c: V3, r: number, axis: "x" | "y" | "z", n: number, col: RGB, o: PointOpts & { dash?: number; from?: number; to?: number } = {}) {
    const a0 = o.from ?? 0, a1 = o.to ?? Math.PI * 2;
    for (let i = 0; i < n; i++) {
      if (o.dash && Math.floor((i / n) * o.dash * 2) % 2 === 1) continue;
      const a = a0 + ((a1 - a0) * i) / n;
      const ca = Math.cos(a) * r, sa = Math.sin(a) * r;
      if (axis === "y") this.point(c[0] + ca, c[1], c[2] + sa, col, o);
      else if (axis === "x") this.point(c[0], c[1] + ca, c[2] + sa, col, o);
      else this.point(c[0] + ca, c[1] + sa, c[2], col, o);
    }
  }

  /** A line of evenly spaced points; `param` runs 0 → 1 along it unless given. */
  line(a: V3, b: V3, spacing: number, col: RGB, o: PointOpts & { paramFrom?: number; paramTo?: number } = {}) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const n = Math.max(2, Math.round(len / spacing));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this.point(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, col, {
        ...o,
        param: o.paramFrom !== undefined ? o.paramFrom + (o.paramTo! - o.paramFrom) * t : o.param,
      });
    }
  }

  /** A flat disc in the xz plane. */
  disc(c: V3, r: number, col: RGB, o: PointOpts & { dens?: number } = {}) {
    const n = Math.max(8, Math.round(Math.PI * r * r * this.density * (o.dens ?? 1)));
    for (let i = 0; i < n; i++) {
      const rr = r * Math.sqrt(this.rnd()), a = this.rnd() * Math.PI * 2;
      this.point(c[0] + Math.cos(a) * rr, c[1], c[2] + Math.sin(a) * rr, col, { ...o, n: [0, 1, 0] });
    }
  }

  /** A flat panel facing +z (or any axis): `u` across, `v` up. */
  panel(c: V3, w: number, h: number, col: RGB, o: PointOpts & { dens?: number; axis?: "x" | "y" | "z" } = {}) {
    const n = Math.max(4, Math.round(w * h * this.density * (o.dens ?? 1)));
    const ax = o.axis ?? "z";
    for (let i = 0; i < n; i++) {
      const u = (this.rnd() - 0.5) * w, v = (this.rnd() - 0.5) * h;
      if (ax === "z") this.point(c[0] + u, c[1] + v, c[2], col, { ...o, n: [0, 0, 1] });
      else if (ax === "x") this.point(c[0], c[1] + v, c[2] + u, col, { ...o, n: [1, 0, 0] });
      else this.point(c[0] + u, c[1], c[2] + v, col, { ...o, n: [0, 1, 0] });
    }
  }

  /** The outline of a rectangle in the plane normal to `axis`. */
  frame(c: V3, w: number, h: number, axis: "x" | "y" | "z", spacing: number, col: RGB, o: PointOpts = {}) {
    const hw = w / 2, hh = h / 2;
    const at = (u: number, v: number): V3 => (axis === "z" ? [c[0] + u, c[1] + v, c[2]] : axis === "x" ? [c[0], c[1] + v, c[2] + u] : [c[0] + u, c[1], c[2] + v]);
    this.line(at(-hw, -hh), at(hw, -hh), spacing, col, o);
    this.line(at(hw, -hh), at(hw, hh), spacing, col, o);
    this.line(at(hw, hh), at(-hw, hh), spacing, col, o);
    this.line(at(-hw, hh), at(-hw, -hh), spacing, col, o);
  }

  /** Buffers for a geometry; `height` normalises the build line. */
  geometry(height: number): THREE.BufferGeometry {
    const n = this.count;
    const y = new Float32Array(n);
    for (let i = 0; i < n; i++) y[i] = this.param[i] >= 0 ? this.param[i] : clamp(this.pos[i * 3 + 1] / height, 0, 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute("aCenter", new THREE.BufferAttribute(new Float32Array(this.ctr), 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(new Float32Array(this.seed), 1));
    g.setAttribute("aY", new THREE.BufferAttribute(y, 1));
    g.setAttribute("aHot", new THREE.BufferAttribute(new Float32Array(this.hot), 1));
    g.setAttribute("aWheel", new THREE.BufferAttribute(new Float32Array(this.wheel), 1));
    return g;
  }
}

/* ── the sculpture ────────────────────────────────────────────────────── */

export type Part = {
  points: THREE.Points;
  /** This part's own build line and wheel spin. */
  built: THREE.IUniform<number>;
  spin: THREE.IUniform<number>;
  /** Scales this part's brightness on top of the sculpture's (call `apply()` after changing it). */
  mul: number;
  /** Rewritten attributes (a part whose colours or heat change each frame). */
  hot: THREE.BufferAttribute;
};

export type Sculpture = {
  group: THREE.Group;
  /** Lay points down as a new part (it has its own transform, so it can move). */
  part(salt: number, build: (b: PointBuilder) => void, o?: { density?: number; size?: number }): Part;
  /** A dark body that blocks what is behind it. */
  hull(geo: THREE.BufferGeometry, x: number, y: number, z: number, rot?: THREE.Euler | [number, number, number], parent?: THREE.Object3D): THREE.Mesh;
  /** Lines (edges), drawn like the gates' edges. */
  lines(positions: Float32Array, color: RGB, opacity?: number): { object: THREE.LineSegments; geo: THREE.BufferGeometry; mat: THREE.LineBasicMaterial };
  /** Shared by every part. */
  uniforms: { uTime: THREE.IUniform<number> };
  /** Set the build line on every part that is not driving its own. */
  setBuilt(v: number): void;
  setGain(v: number): void;
  /** Lift the size of the points (hover). */
  setBoost(v: number): void;
  /** Push every part's brightness to its uniform (after changing a part's `mul`). */
  apply(): void;
  /** Where it draws among the other solid things: hulls at `base`, lines at `base + 1`, points at `base + 2`. */
  setOrder(base: number): void;
  parts: Part[];
  dispose(): void;
};

export function createSculpture(opts: { height: number; lowPower: boolean; pxPerUnit: THREE.IUniform<number>; size?: number }): Sculpture {
  const group = new THREE.Group();
  group.rotation.order = "YXZ";
  const uTime: THREE.IUniform<number> = { value: 0 };
  const gains: THREE.IUniform<number>[] = [];
  const baseSize = opts.size ?? 0.05;
  const sizes: { u: THREE.IUniform<number>; base: number }[] = [];
  const parts: Part[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const hullMat = new THREE.MeshBasicMaterial({ color: 0x06070b, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
  mats.push(hullMat);
  const lineMats: { mat: THREE.LineBasicMaterial; base: number }[] = [];
  const hulls: THREE.Mesh[] = [];
  const lineObjs: THREE.LineSegments[] = [];
  /** Where it was told to draw (applied to anything added after, too). */
  let order: number | null = null;
  let gain = 1, boost = 0;
  const apply = () => {
    const g = gain * (1 + 0.25 * boost);
    for (let i = 0; i < gains.length; i++) gains[i].value = g * parts[i].mul;
  };

  return {
    group,
    parts,
    uniforms: { uTime },
    part(salt, build, o = {}) {
      const b = new PointBuilder(salt, (o.density ?? 140) * (opts.lowPower ? 0.6 : 1));
      build(b);
      const geo = b.geometry(opts.height);
      geos.push(geo);
      const built: THREE.IUniform<number> = { value: 0 };
      const spin: THREE.IUniform<number> = { value: 0 };
      const uGain: THREE.IUniform<number> = { value: gain * (1 + 0.25 * boost) };
      gains.push(uGain);
      const uSize: THREE.IUniform<number> = { value: o.size ?? baseSize };
      sizes.push({ u: uSize, base: o.size ?? baseSize });
      const mat = new THREE.ShaderMaterial({
        vertexShader: ROVER_VERT,
        fragmentShader: SOFT_FRAG,
        uniforms: { uPxPerUnit: opts.pxPerUnit, uSize, uGain, uBuilt: built, uSpin: spin, uTime },
        transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      mats.push(mat);
      const points = new THREE.Points(geo, mat);
      points.frustumCulled = false;
      points.renderOrder = order === null ? 14 : order + 2;
      group.add(points);
      const hotAttr = geo.getAttribute("aHot") as THREE.BufferAttribute;
      hotAttr.setUsage(THREE.DynamicDrawUsage);
      const part: Part = { points, built, spin, mul: 1, hot: hotAttr };
      parts.push(part);
      return part;
    },
    hull(geo, x, y, z, rot, parent) {
      geos.push(geo);
      const m = new THREE.Mesh(geo, hullMat);
      m.position.set(x, y, z);
      if (rot) {
        if (Array.isArray(rot)) m.rotation.set(rot[0], rot[1], rot[2]);
        else m.rotation.copy(rot);
      }
      m.renderOrder = order === null ? 13 : order;
      m.frustumCulled = false;
      hulls.push(m);
      (parent ?? group).add(m);
      return m;
    },
    lines(positions, color, opacity = 0.7) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geos.push(geo);
      const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(color[0], color[1], color[2]), transparent: true, opacity: opacity * gain, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
      mats.push(mat);
      lineMats.push({ mat, base: opacity });
      const object = new THREE.LineSegments(geo, mat);
      object.frustumCulled = false;
      object.renderOrder = order === null ? 14 : order + 1;
      lineObjs.push(object);
      group.add(object);
      return { object, geo, mat };
    },
    setBuilt(v) {
      for (const p of parts) p.built.value = v;
    },
    setGain(v) {
      gain = v;
      hullMat.opacity = 0.85 * clamp(v * 1.2, 0, 1);
      for (const l of lineMats) l.mat.opacity = l.base * v;
      group.visible = v > 0.004;
      apply();
    },
    setOrder(base) {
      order = base;
      for (const h of hulls) h.renderOrder = base;
      for (const l of lineObjs) l.renderOrder = base + 1;
      for (const p of parts) p.points.renderOrder = base + 2;
    },
    setBoost(v) {
      boost = v;
      for (const s of sizes) s.u.value = s.base * (1 + 0.35 * v);
      apply();
    },
    apply,
    dispose() {
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
    },
  };
}
