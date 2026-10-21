import * as THREE from "three";
import { hash2, rampColor } from "@/lib/terrain";
import { clamp, lerp } from "@/lib/math";

/* ─────────────────────────────────────────────────────────────────────────
   THE ROVER — a LiDAR scan of itself: points sampled over its surfaces, with a dark body under them so it
   blocks the ground behind it the way the route's dark stroke does. Shared by the traverse section and the world.
   ───────────────────────────────────────────────────────────────────────── */

export const WHEEL_R = 0.46;
export const WHEEL_HW = 0.17;
export const WHEELS: ReadonlyArray<readonly [number, number]> = [[1.07, 0.95], [-1.07, 0.95], [1.07, -0.95], [-1.07, -0.95]];
/** Where the scan plane starts, in rover space (the sensor head on the mast). */
export const HEAD = new THREE.Vector3(0, 2.42, 0.85);
export const ROVER_TOP = 2.62;

export function buildRover(density: number) {
  const pos: number[] = [], col: number[] = [], cen: number[] = [], seed: number[] = [], ys: number[] = [], hot: number[] = [], wheel: number[] = [];
  let k = 0;
  const rnd = () => hash2(k++, 5, 4242);
  const rgb: [number, number, number] = [0, 0, 0];
  const light = new THREE.Vector3(0.72, 0.3, 0.56).normalize();

  const add = (x: number, y: number, z: number, nx: number, ny: number, nz: number, tone: number, h: number, w = 0, cx = 0, cy = 0, cz = 0) => {
    const lit = clamp(nx * light.x + ny * light.y + nz * light.z, 0, 1);
    rampColor(0.52 + lit * 0.4, rgb);
    const m = tone * (0.5 + 0.8 * lit);
    // pale towards bone, so the rover reads as an object against the blue ground
    col.push(lerp(rgb[0], 0.93, 0.4) * m, lerp(rgb[1], 0.9, 0.4) * m, lerp(rgb[2], 0.84, 0.4) * m);
    pos.push(x, y, z);
    cen.push(cx, cy, cz);
    seed.push(rnd());
    ys.push(clamp(y / ROVER_TOP, 0, 1));
    hot.push(h);
    wheel.push(w);
  };

  const box = (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, tone: number, h = 0, dens = density) => {
    const faces: [number, number, number, number][] = [
      [1, 0, 0, sy * sz], [-1, 0, 0, sy * sz], [0, 1, 0, sx * sz], [0, -1, 0, sx * sz], [0, 0, 1, sx * sy], [0, 0, -1, sx * sy],
    ];
    for (const [nx, ny, nz, area] of faces) {
      const n = Math.max(2, Math.round(area * dens));
      for (let i = 0; i < n; i++) {
        const u = rnd() - 0.5, v = rnd() - 0.5;
        if (nx) add(cx + (nx * sx) / 2, cy + u * sy, cz + v * sz, nx, 0, 0, tone, h);
        else if (ny) add(cx + u * sx, cy + (ny * sy) / 2, cz + v * sz, 0, ny, 0, tone, h);
        else add(cx + u * sx, cy + v * sy, cz + (nz * sz) / 2, 0, 0, nz, tone, h);
      }
    }
  };

  // chassis, axles, bumper, solar deck
  box(0, 0.98, 0, 1.55, 0.5, 2.5, 0.9);
  box(0, WHEEL_R, 0.95, 2.1, 0.1, 0.1, 0.7);
  box(0, WHEEL_R, -0.95, 2.1, 0.1, 0.1, 0.7);
  box(0, 0.8, 1.38, 1.7, 0.12, 0.12, 0.8);
  box(0, 1.28, -0.5, 1.5, 0.05, 1.15, 0.75, 0, density * 0.8);

  // wheels: tread denser than the faces, so each reads as a ring
  for (const [wx, wz] of WHEELS) {
    const side = Math.round(2 * Math.PI * WHEEL_R * 2 * WHEEL_HW * density * 1.5);
    for (let i = 0; i < side; i++) {
      const th = rnd() * Math.PI * 2;
      add(wx + (rnd() * 2 - 1) * WHEEL_HW, WHEEL_R + Math.cos(th) * WHEEL_R, wz + Math.sin(th) * WHEEL_R, 0, Math.cos(th), Math.sin(th), 0.62, 0, 1, wx, WHEEL_R, wz);
    }
    const cap = Math.round(Math.PI * WHEEL_R * WHEEL_R * density);
    for (const sx of [-1, 1]) {
      for (let i = 0; i < cap; i++) {
        const th = rnd() * Math.PI * 2;
        const r = WHEEL_R * Math.sqrt(rnd());
        add(wx + sx * WHEEL_HW, WHEEL_R + Math.cos(th) * r, wz + Math.sin(th) * r, sx, 0, 0, r < 0.12 ? 1 : 0.8, 0, 1, wx, WHEEL_R, wz);
      }
    }
  }

  // mast and sensor head (the head glows: it is the laser)
  const mastN = Math.round(2 * Math.PI * 0.05 * 1.2 * density * 1.5);
  for (let i = 0; i < mastN; i++) {
    const th = rnd() * Math.PI * 2;
    add(Math.cos(th) * 0.05, 1.23 + rnd() * 1.2, HEAD.z + Math.sin(th) * 0.05, Math.cos(th), 0, Math.sin(th), 0.8, 0);
  }
  box(0, HEAD.y, HEAD.z - 0.1, 0.62, 0.28, 0.36, 1, 0.3, density * 1.6);
  box(0, HEAD.y, HEAD.z + 0.1, 0.34, 0.16, 0.06, 1, 1, density * 3);

  const count = pos.length / 3;
  return {
    count,
    pos: new Float32Array(pos),
    color: new Float32Array(col),
    center: new Float32Array(cen),
    seed: new Float32Array(seed),
    y: new Float32Array(ys),
    hot: new Float32Array(hot),
    wheel: new Float32Array(wheel),
  };
}

export const ROVER_VERT = /* glsl */ `
  uniform float uPxPerUnit, uSize, uGain, uBuilt, uSpin, uTime;
  attribute vec3 aColor, aCenter;
  attribute float aSeed, aY, aHot, aWheel;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    if (aWheel > 0.5) {
      vec3 q = p - aCenter;
      float c = cos(uSpin), s = sin(uSpin);
      p = aCenter + vec3(q.x, q.y * c - q.z * s, q.y * s + q.z * c);
    }
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float depth = max(0.25, -mv.z);
    gl_Position = projectionMatrix * mv;

    // built by a laser line that sweeps up from the wheels; before it passes, only a sparse ghost shows
    float yS = uBuilt * 1.3 - 0.14;
    float done = 1.0 - smoothstep(yS - 0.02, yS + 0.02, aY);
    float band = exp(-pow((aY - yS) / 0.05, 2.0)) * step(0.002, uBuilt) * (1.0 - step(0.998, uBuilt));
    float ghost = step(aSeed, 0.34);
    float vis = max(max(done, ghost * 0.75), band);
    float hot = clamp(band + aHot * (0.72 + 0.28 * sin(uTime * 6.0)), 0.0, 1.0);

    vec3 hotCol = mix(vec3(1.0, 0.34, 0.16), vec3(1.0, 0.88, 0.74), smoothstep(0.6, 1.0, hot));
    vColor = mix(aColor * 1.4, hotCol, pow(hot, 0.85));
    vAlpha = vis * uGain;
    float size = uSize * uPxPerUnit / depth * (0.8 + 0.4 * aSeed) * (1.0 + 1.2 * hot);
    gl_PointSize = clamp(size, 1.4, 8.0);
  }
`;

/** The soft round point the whole site uses. */
export const SOFT_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d2 = dot(c, c) * 4.0;
    float a = 0.65 * exp(-d2 * 3.4) + 0.35 * smoothstep(0.42, 0.0, d2);
    float alpha = vAlpha * a;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(vColor, alpha);
  }
`;

export type Rover = {
  group: THREE.Group;
  /** Shader uniforms: how built it is (0 ghost → 1 solid), overall gain, wheel spin (rad) and time. */
  uniforms: { uPxPerUnit: THREE.IUniform; uSize: THREE.IUniform<number>; uGain: THREE.IUniform<number>; uBuilt: THREE.IUniform<number>; uSpin: THREE.IUniform<number>; uTime: THREE.IUniform<number> };
  hullMat: THREE.MeshBasicMaterial;
  count: number;
  /** Where it draws among the other solid things: the body at `base`, the points at `base + 2`. */
  setOrder(base: number): void;
  dispose(): void;
};

/** A rover object (points + dark body). Render orders: body 13, points 14. */
export function createRover(opts: { lowPower: boolean; pxPerUnit: THREE.IUniform<number> }): Rover {
  const group = new THREE.Group();
  group.rotation.order = "YXZ";
  const rd = buildRover(opts.lowPower ? 150 : 250);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(rd.pos, 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(rd.color, 3));
  geo.setAttribute("aCenter", new THREE.BufferAttribute(rd.center, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(rd.seed, 1));
  geo.setAttribute("aY", new THREE.BufferAttribute(rd.y, 1));
  geo.setAttribute("aHot", new THREE.BufferAttribute(rd.hot, 1));
  geo.setAttribute("aWheel", new THREE.BufferAttribute(rd.wheel, 1));
  const uniforms = { uPxPerUnit: opts.pxPerUnit, uSize: { value: 0.05 }, uGain: { value: 1 }, uBuilt: { value: 0 }, uSpin: { value: 0 }, uTime: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    vertexShader: ROVER_VERT, fragmentShader: SOFT_FRAG, uniforms,
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 14;
  group.add(pts);

  const hullMat = new THREE.MeshBasicMaterial({ color: 0x06070b, transparent: true, opacity: 0.2, depthTest: false, depthWrite: false });
  const hullGeos: THREE.BufferGeometry[] = [];
  const hullMeshes: THREE.Mesh[] = [];
  const hull = (g: THREE.BufferGeometry, x: number, y: number, z: number, rotZ = 0) => {
    hullGeos.push(g);
    const m = new THREE.Mesh(g, hullMat);
    hullMeshes.push(m);
    m.position.set(x, y, z);
    m.rotation.z = rotZ;
    m.renderOrder = 13;
    m.frustumCulled = false;
    group.add(m);
  };
  hull(new THREE.BoxGeometry(1.5, 0.5, 2.44), 0, 0.98, 0);
  hull(new THREE.BoxGeometry(1.46, 0.06, 1.1), 0, 1.27, -0.5);
  hull(new THREE.BoxGeometry(0.58, 0.26, 0.5), 0, HEAD.y, HEAD.z);
  hull(new THREE.BoxGeometry(0.1, 1.2, 0.1), 0, 1.83, HEAD.z);
  for (const [wx, wz] of WHEELS) hull(new THREE.CylinderGeometry(WHEEL_R * 0.98, WHEEL_R * 0.98, WHEEL_HW * 2, 16), wx, WHEEL_R, wz, Math.PI / 2);

  return {
    group,
    uniforms,
    hullMat,
    count: rd.count,
    setOrder(base) {
      for (const m of hullMeshes) m.renderOrder = base;
      pts.renderOrder = base + 2;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      hullGeos.forEach((g) => g.dispose());
      hullMat.dispose();
    },
  };
}
