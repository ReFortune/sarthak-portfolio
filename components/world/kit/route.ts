import * as THREE from "three";
import { clamp, lerp } from "@/lib/math";

/* ─────────────────────────────────────────────────────────────────────────
   ROUTE OVERLAY — the planner's route as a glowing ribbon (constant width on screen) with a dark stroke under it,
   diamonds at the waypoints, and an outline around the steep ground it avoids. The same look as the hero's,
   measured from the rover instead of from the camera. Shared by the traverse section and the world.
   ───────────────────────────────────────────────────────────────────────── */

export type RouteData = {
  n: number;
  /** x, y, z per vertex. */
  pos: ArrayLike<number>;
  /** Arc length (m) of each vertex along the route. */
  s: ArrayLike<number>;
  /** Steep-ground outline: line segments (ax, ay, az, bx, by, bz, strength). */
  segN: number;
  seg: ArrayLike<number>;
};

/** Position on the route at distance `s` along it. */
export function routeAt(d: { n: number; pos: ArrayLike<number>; s: ArrayLike<number> }, s: number, out: { x: number; y: number; z: number }) {
  const n = d.n;
  const S = d.s, P = d.pos;
  s = clamp(s, 0, S[n - 1]);
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (S[mid] <= s) lo = mid;
    else hi = mid;
  }
  const span = S[hi] - S[lo];
  const t = span > 1e-6 ? (s - S[lo]) / span : 0;
  out.x = lerp(P[lo * 3], P[hi * 3], t);
  out.y = lerp(P[lo * 3 + 1], P[hi * 3 + 1], t);
  out.z = lerp(P[lo * 3 + 2], P[hi * 3 + 2], t);
  return out;
}

export const RIB_VERT = /* glsl */ `
  uniform vec2 uRes;
  uniform float uWidth, uGain, uTime, uReveal, uShow, uS0, uFlow;
  attribute vec3 aPrev, aNext;
  attribute float aSide, aS;
  varying float vSide, vA, vPulse;

  vec2 toPx(vec4 c) { return c.xy / c.w * uRes * 0.5; }

  void main() {
    mat4 mvp = projectionMatrix * modelViewMatrix;
    vec4 c0 = mvp * vec4(position, 1.0);
    vec2 p0 = toPx(c0);
    vec2 d = toPx(mvp * vec4(aNext, 1.0)) - toPx(mvp * vec4(aPrev, 1.0));
    d = dot(d, d) > 1e-4 ? normalize(d) : vec2(0.0, 1.0);
    vec2 px = p0 + vec2(-d.y, d.x) * aSide * uWidth * 0.5;
    gl_Position = vec4(px / (uRes * 0.5) * c0.w, c0.z, c0.w);

    float depth = max(0.25, -(modelViewMatrix * vec4(position, 1.0)).z);
    float ahead = aS - uS0;                                       // metres ahead of the rover, along the route
    float behind = smoothstep(1.0, 2.8, ahead);                   // the ribbon leaves the rover's nose; nothing is drawn behind it
    float rev = 1.0 - smoothstep(uReveal - 9.0, uReveal, ahead);  // the plan sweeps out from the rover
    float far = 1.0 - smoothstep(uShow * 0.62, uShow, ahead);     // and thins out with distance
    float near = smoothstep(2.0, 5.0, depth);
    float wave = 0.5 + 0.5 * sin((aS - uTime * 9.0) * 0.8);       // a pulse streams along the route, away from the rover
    vPulse = wave * wave * wave * uFlow;
    vSide = aSide;
    vA = behind * rev * far * near * uGain * (0.72 + 0.28 * vPulse);
  }
`;
export const RIB_FRAG = /* glsl */ `
  varying float vSide, vA, vPulse;
  void main() {
    float e = abs(vSide);
    float core = smoothstep(0.32, 0.0, e);
    float body = exp(-e * e * 4.0);
    float a = vA * (1.0 * core + 0.5 * body);
    if (a < 0.004) discard;
    vec3 col = mix(vec3(0.66, 0.9, 1.0), vec3(1.0, 0.97, 0.92), clamp(vPulse * 0.9 + core * 0.35, 0.0, 1.0));
    gl_FragColor = vec4(col, a);
  }
`;
export const RIB_UNDER_FRAG = /* glsl */ `
  varying float vSide, vA, vPulse;
  void main() {
    float a = vA * 0.7 * smoothstep(1.0, 0.25, abs(vSide));
    if (a < 0.004) discard;
    gl_FragColor = vec4(0.024, 0.027, 0.043, a);
  }
`;
export const WAY_VERT = /* glsl */ `
  uniform float uPxPerUnit, uGain, uSize, uS0, uArrive;
  attribute float aS;
  varying float vA, vReached;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float depth = max(0.25, -mv.z);
    gl_Position = projectionMatrix * mv;
    vReached = 1.0 - smoothstep(uArrive + 0.5, uArrive + 3.0, aS - uS0);   // filled as the rover pulls in
    vA = uGain;
    gl_PointSize = clamp(uSize * uPxPerUnit / depth, 9.0, 30.0);
  }
`;
export const WAY_FRAG = /* glsl */ `
  varying float vA, vReached;
  void main() {
    vec2 c = (gl_PointCoord - 0.5) * 2.0;
    float d = abs(c.x) + abs(c.y);                       // a diamond
    float ring = smoothstep(1.0, 0.88, d) - smoothstep(0.62, 0.5, d);
    float dot_ = smoothstep(0.26, 0.12, d);
    float fill = smoothstep(0.62, 0.5, d) * vReached;
    float a = vA * (0.95 * ring + 0.8 * dot_ + 0.5 * fill);
    if (a < 0.004) discard;
    gl_FragColor = vec4(mix(vec3(0.86, 0.97, 1.0), vec3(1.0, 0.36, 0.18), vReached), a);
  }
`;
export const CON_VERT = /* glsl */ `
  uniform vec2 uRes;
  uniform float uWidth, uGain, uRoverZ, uConGain;
  attribute vec3 aPrev, aNext;
  attribute float aSide, aW;
  varying float vSide, vA;

  vec2 toPx(vec4 c) { return c.xy / c.w * uRes * 0.5; }

  void main() {
    mat4 mvp = projectionMatrix * modelViewMatrix;
    vec4 c0 = mvp * vec4(position, 1.0);
    vec2 d = toPx(mvp * vec4(aNext, 1.0)) - toPx(mvp * vec4(aPrev, 1.0));
    d = dot(d, d) > 1e-4 ? normalize(d) : vec2(0.0, 1.0);
    vec2 px = toPx(c0) + vec2(-d.y, d.x) * aSide * uWidth * 0.5;
    gl_Position = vec4(px / (uRes * 0.5) * c0.w, c0.z, c0.w);

    float ahead = position.z - uRoverZ;
    float fade = smoothstep(-6.0, 4.0, ahead) * (1.0 - smoothstep(48.0, 84.0, ahead));
    vSide = aSide;
    vA = fade * uConGain * uGain * (0.15 + 0.7 * aW);
  }
`;
export const CON_FRAG = /* glsl */ `
  varying float vSide, vA;
  void main() {
    float a = vA * smoothstep(1.0, 0.0, abs(vSide));
    if (a < 0.004) discard;
    gl_FragColor = vec4(1.0, 0.36, 0.18, a);
  }
`;

export type RouteOverlay = {
  /** Add these to the scene. */
  objects: THREE.Object3D[];
  /** Uniforms shared by every material: time, reveal (m), show (m), rover s0, flow, contour gain, rover z. */
  shared: {
    uRes: THREE.IUniform<THREE.Vector2>;
    uTime: THREE.IUniform<number>;
    uReveal: THREE.IUniform<number>;
    uShow: THREE.IUniform<number>;
    uS0: THREE.IUniform<number>;
    uArrive: THREE.IUniform<number>;
    uFlow: THREE.IUniform<number>;
    uConGain: THREE.IUniform<number>;
    uRoverZ: THREE.IUniform<number>;
  };
  /** Per-material gains (0–1). */
  gains: { ribbon: THREE.IUniform<number>; under: THREE.IUniform<number>; way: THREE.IUniform<number>; con: THREE.IUniform<number> };
  wayPos: Float32Array;
  wayS: Float32Array;
  setResolution(w: number, h: number, dpr: number): void;
  dispose(): void;
};

/**
 * Build the overlay from a finished route. `waypointS` are the arc lengths of the diamonds. `arrive` is how close
 * (m) the rover counts as having reached one. The ribbon thins out `show` metres ahead of the rover.
 */
export function createRouteOverlay(data: RouteData, waypointS: number[], opts: { reduced: boolean; pxPerUnit: THREE.IUniform<number>; show?: number; arrive?: number }): RouteOverlay {
  const n = data.n;
  const shared = {
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uReveal: { value: 0 },
    uShow: { value: opts.show ?? 84 },
    uS0: { value: 0 },
    uArrive: { value: opts.arrive ?? 4 },
    uFlow: { value: opts.reduced ? 0 : 1 },
    uConGain: { value: 0 },
    uRoverZ: { value: 0 },
  };
  const gain = () => ({ value: 0 });
  const gains = { ribbon: gain(), under: gain(), way: gain(), con: gain() };
  const common = { transparent: true, depthTest: false, depthWrite: false } as const;
  const routeMat = new THREE.ShaderMaterial({ vertexShader: RIB_VERT, fragmentShader: RIB_FRAG, uniforms: { ...shared, uPxPerUnit: opts.pxPerUnit, uGain: gains.ribbon, uWidth: { value: 10 } }, ...common, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const underMat = new THREE.ShaderMaterial({ vertexShader: RIB_VERT, fragmentShader: RIB_UNDER_FRAG, uniforms: { ...shared, uPxPerUnit: opts.pxPerUnit, uGain: gains.under, uWidth: { value: 16 } }, ...common, side: THREE.DoubleSide });
  const wayMat = new THREE.ShaderMaterial({ vertexShader: WAY_VERT, fragmentShader: WAY_FRAG, uniforms: { ...shared, uPxPerUnit: opts.pxPerUnit, uGain: gains.way, uSize: { value: 0.95 } }, ...common, blending: THREE.AdditiveBlending });
  const conMat = new THREE.ShaderMaterial({ vertexShader: CON_VERT, fragmentShader: CON_FRAG, uniforms: { ...shared, uPxPerUnit: opts.pxPerUnit, uGain: gains.con, uWidth: { value: 2.4 } }, ...common, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });

  const geos: THREE.BufferGeometry[] = [];
  const objects: THREE.Object3D[] = [];

  // ribbon: two vertices per route vertex (one each side), each knowing its neighbours so the shader can find the direction
  const rp = new Float32Array(n * 2 * 3), rPrev = new Float32Array(n * 2 * 3), rNext = new Float32Array(n * 2 * 3);
  const rSide = new Float32Array(n * 2), rS = new Float32Array(n * 2);
  const idx = new Uint32Array((n - 1) * 6);
  for (let k = 0; k < n; k++) {
    const p = k * 3, a = Math.max(0, k - 1) * 3, b = Math.min(n - 1, k + 1) * 3;
    for (let side = 0; side < 2; side++) {
      const o = (2 * k + side) * 3;
      for (let c = 0; c < 3; c++) {
        rp[o + c] = data.pos[p + c];
        rPrev[o + c] = data.pos[a + c];
        rNext[o + c] = data.pos[b + c];
      }
      rSide[2 * k + side] = side === 0 ? -1 : 1;
      rS[2 * k + side] = data.s[k];
    }
    if (k < n - 1) idx.set([2 * k, 2 * k + 1, 2 * k + 2, 2 * k + 1, 2 * k + 3, 2 * k + 2], k * 6);
  }
  const ribGeo = new THREE.BufferGeometry();
  ribGeo.setAttribute("position", new THREE.BufferAttribute(rp, 3));
  ribGeo.setAttribute("aPrev", new THREE.BufferAttribute(rPrev, 3));
  ribGeo.setAttribute("aNext", new THREE.BufferAttribute(rNext, 3));
  ribGeo.setAttribute("aSide", new THREE.BufferAttribute(rSide, 1));
  ribGeo.setAttribute("aS", new THREE.BufferAttribute(rS, 1));
  ribGeo.setIndex(new THREE.BufferAttribute(idx, 1));
  const under = new THREE.Mesh(ribGeo, underMat);
  const ribbon = new THREE.Mesh(ribGeo, routeMat);
  under.renderOrder = 10;
  ribbon.renderOrder = 11;
  geos.push(ribGeo);
  objects.push(under, ribbon);

  // diamonds
  const wayPos = new Float32Array(waypointS.length * 3);
  const wayS = new Float32Array(waypointS.length);
  const tmp = { x: 0, y: 0, z: 0 };
  waypointS.forEach((s, i) => {
    routeAt(data, s, tmp);
    wayPos[i * 3] = tmp.x;
    wayPos[i * 3 + 1] = tmp.y + 0.55;
    wayPos[i * 3 + 2] = tmp.z;
    wayS[i] = s;
  });
  const wayGeo = new THREE.BufferGeometry();
  wayGeo.setAttribute("position", new THREE.BufferAttribute(wayPos, 3));
  wayGeo.setAttribute("aS", new THREE.BufferAttribute(wayS, 1));
  const waypoints = new THREE.Points(wayGeo, wayMat);
  waypoints.renderOrder = 12;
  geos.push(wayGeo);
  objects.push(waypoints);

  // steep-ground outline: a short ribbon per segment (4 vertices each, both ends know the segment's direction)
  const m = data.segN;
  if (m > 0) {
    const cPos = new Float32Array(m * 4 * 3), cPrev = new Float32Array(m * 4 * 3), cNext = new Float32Array(m * 4 * 3);
    const cSide = new Float32Array(m * 4), cW = new Float32Array(m * 4);
    const cIdx = new Uint32Array(m * 6);
    for (let q = 0; q < m; q++) {
      const o = q * 7;
      cSide.set([-1, 1, -1, 1], q * 4);
      cIdx.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4 + 1, q * 4 + 3, q * 4 + 2], q * 6);
      for (let v = 0; v < 4; v++) {
        const e = (q * 4 + v) * 3;
        const end = v < 2 ? 0 : 3; // vertices 0, 1 sit at the segment's start, 2, 3 at its end
        for (let c = 0; c < 3; c++) {
          cPos[e + c] = data.seg[o + end + c];
          cPrev[e + c] = data.seg[o + c];
          cNext[e + c] = data.seg[o + 3 + c];
        }
        cW[q * 4 + v] = data.seg[o + 6];
      }
    }
    const conGeo = new THREE.BufferGeometry();
    conGeo.setAttribute("position", new THREE.BufferAttribute(cPos, 3));
    conGeo.setAttribute("aPrev", new THREE.BufferAttribute(cPrev, 3));
    conGeo.setAttribute("aNext", new THREE.BufferAttribute(cNext, 3));
    conGeo.setAttribute("aSide", new THREE.BufferAttribute(cSide, 1));
    conGeo.setAttribute("aW", new THREE.BufferAttribute(cW, 1));
    conGeo.setIndex(new THREE.BufferAttribute(cIdx, 1));
    const contour = new THREE.Mesh(conGeo, conMat);
    contour.renderOrder = 9;
    geos.push(conGeo);
    objects.push(contour);
  }
  for (const o of objects) o.frustumCulled = false;

  return {
    objects,
    shared,
    gains,
    wayPos,
    wayS,
    setResolution(w, h, dpr) {
      shared.uRes.value.set(w * dpr, h * dpr);
      routeMat.uniforms.uWidth.value = (w < 700 ? 10 : 13) * dpr;
      underMat.uniforms.uWidth.value = (w < 700 ? 15 : 19) * dpr;
      conMat.uniforms.uWidth.value = 2.4 * dpr;
    },
    dispose() {
      geos.forEach((g) => g.dispose());
      routeMat.dispose();
      underMat.dispose();
      wayMat.dispose();
      conMat.dispose();
    },
  };
}
