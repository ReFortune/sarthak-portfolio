import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MeshSurfaceSampler } from "three/examples/jsm/math/MeshSurfaceSampler.js";
import { hash2 } from "@/lib/terrain";
import { ROVER_VERT, SOFT_FRAG } from "./rover";

/* ─────────────────────────────────────────────────────────────────────────
   GATES — vermilion torii, drawn the way the rest of the world is: surface points, crisp edges, and a dark body
   under them so the gate blocks what is behind it. A gate is "scanned in" by a laser line that climbs it as you
   approach (the same sweep that builds the rover). Standing in a row, they are the path.
   ───────────────────────────────────────────────────────────────────────── */

export type GateKind = "major" | "year";

/** The gate's parts in its own space: x across, y up from the ground, z through. `W` is the distance between pillars. */
function parts(W: number, H: number): THREE.BufferGeometry[] {
  const gs: THREE.BufferGeometry[] = [];
  const pr = H * 0.034;
  for (const sx of [-1, 1]) {
    const g = new THREE.CylinderGeometry(pr * 0.84, pr, H * 0.92, 14, 1, false);
    g.translate(0, H * 0.46, 0);
    // a slight lean inwards, as on a real gate
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) - sx * 0.018 * p.getY(i));
    g.translate(sx * (W / 2), 0, 0);
    gs.push(g);
  }
  const nuki = new THREE.BoxGeometry(W + pr * 3.4, H * 0.045, H * 0.04);
  nuki.translate(0, H * 0.72, 0);
  gs.push(nuki);
  const shimaki = new THREE.BoxGeometry(W * 1.26, H * 0.034, H * 0.056);
  shimaki.translate(0, H * 0.925, 0);
  gs.push(shimaki);
  const strut = new THREE.BoxGeometry(H * 0.04, H * 0.2, H * 0.04);
  strut.translate(0, H * 0.82, 0);
  gs.push(strut);

  // the top beam: its ends curve up
  const hw = W * 0.7, t = H * 0.07, base = H * 0.945, steps = 18;
  const rise = (x: number) => H * 0.04 * Math.pow(Math.abs(x) / hw, 2.4);
  const shape = new THREE.Shape();
  for (let i = 0; i <= steps; i++) {
    const x = -hw + (2 * hw * i) / steps;
    if (i === 0) shape.moveTo(x, base + rise(x));
    else shape.lineTo(x, base + rise(x));
  }
  for (let i = steps; i >= 0; i--) {
    const x = -hw + (2 * hw * i) / steps;
    shape.lineTo(x, base - t + rise(x) * 0.6);
  }
  const kasagi = new THREE.ExtrudeGeometry(shape, { depth: H * 0.08, bevelEnabled: false });
  kasagi.translate(0, 0, -H * 0.04);
  gs.push(kasagi);
  return gs;
}

export type Gate = {
  id: string;
  kind: GateKind;
  width: number;
  height: number;
  group: THREE.Group;
  /** 0 → 1: how far the scan line has climbed it. */
  setBuilt(v: number): void;
  setGain(v: number): void;
  /** 0 → 1: how much of its dark body to show (it thins out as the camera passes through it). */
  setBody(v: number): void;
  update(t: number): void;
  dispose(): void;
};

export function createGate(id: string, kind: GateKind, opts: { lowPower: boolean; pxPerUnit: THREE.IUniform<number> }): Gate {
  const W = kind === "major" ? 11 : 5.8;
  const H = kind === "major" ? 13.5 : 7.4;
  const group = new THREE.Group();
  let gain = 0, body = 1;

  const merged = mergeGeometries(parts(W, H).map((g) => (g.index ? g.toNonIndexed() : g)), false)!;
  // keep only position + normal so every part merges cleanly
  const mesh = new THREE.Mesh(merged);

  // dark body
  const hullMat = new THREE.MeshBasicMaterial({ color: 0x06070b, transparent: true, opacity: 0.0, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  const hull = new THREE.Mesh(merged, hullMat);
  hull.renderOrder = 5;
  hull.frustumCulled = false;
  group.add(hull);

  // edges
  const edgeGeo = new THREE.EdgesGeometry(merged, 28);
  const edgeU = { uGain: { value: 0 }, uBuilt: { value: 0 }, uH: { value: H }, uTime: { value: 0 } };
  const edgeMat = new THREE.ShaderMaterial({
    uniforms: edgeU,
    vertexShader: /* glsl */ `
      uniform float uH, uBuilt, uTime;
      varying float vA;
      void main() {
        float y = position.y / uH;
        float yS = uBuilt * 1.25 - 0.1;
        float done = 1.0 - smoothstep(yS - 0.02, yS + 0.02, y);
        float band = exp(-pow((y - yS) / 0.05, 2.0)) * step(0.002, uBuilt) * (1.0 - step(0.998, uBuilt));
        vA = max(done, band * 1.4) * (0.55 + 0.45 * y);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uGain;
      varying float vA;
      void main() { gl_FragColor = vec4(1.0, 0.36, 0.18, vA * uGain * 0.85); }
    `,
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const edges = new THREE.LineSegments(edgeGeo, edgeMat);
  edges.renderOrder = 6;
  edges.frustumCulled = false;
  group.add(edges);

  // surface points
  let area = 0;
  {
    const pos = merged.attributes.position;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
      area += b.sub(a).cross(c.sub(a)).length() / 2;
    }
  }
  const density = (kind === "major" ? 44 : 58) * (opts.lowPower ? 0.55 : 1);
  const N = Math.min(16000, Math.max(800, Math.round(area * density)));
  const sampler = new MeshSurfaceSampler(mesh).build();
  const P = new Float32Array(N * 3), C = new Float32Array(N * 3), Z = new Float32Array(N * 3);
  const S = new Float32Array(N), Y = new Float32Array(N), HOT = new Float32Array(N), WH = new Float32Array(N);
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    sampler.sample(p, n);
    P[i * 3] = p.x; P[i * 3 + 1] = p.y; P[i * 3 + 2] = p.z;
    const y = p.y / H;
    const lit = Math.max(0, n.x * 0.5 + n.y * 0.35 + n.z * 0.6);
    const tone = 0.55 + 0.7 * lit;
    // vermilion, paler toward the top; a few bone-white highlights
    const pale = i % 9 === 0 ? 0.55 : 0.0;
    C[i * 3] = (1.0 - pale * 0.1) * tone;
    C[i * 3 + 1] = (0.36 + pale * 0.55 + y * 0.12) * tone;
    C[i * 3 + 2] = (0.2 + pale * 0.6) * tone;
    S[i] = hash2(i, 7, 9001);
    Y[i] = Math.min(1, Math.max(0, y));
    HOT[i] = y > 0.9 ? 0.18 : 0;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(P, 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(C, 3));
  geo.setAttribute("aCenter", new THREE.BufferAttribute(Z, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(S, 1));
  geo.setAttribute("aY", new THREE.BufferAttribute(Y, 1));
  geo.setAttribute("aHot", new THREE.BufferAttribute(HOT, 1));
  geo.setAttribute("aWheel", new THREE.BufferAttribute(WH, 1));
  const u = { uPxPerUnit: opts.pxPerUnit, uSize: { value: kind === "major" ? 0.085 : 0.06 }, uGain: { value: 0 }, uBuilt: { value: 0 }, uSpin: { value: 0 }, uTime: { value: 0 } };
  const mat = new THREE.ShaderMaterial({ vertexShader: ROVER_VERT, fragmentShader: SOFT_FRAG, uniforms: u, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(geo, mat);
  pts.renderOrder = 7;
  pts.frustumCulled = false;
  group.add(pts);

  return {
    id,
    kind,
    width: W,
    height: H,
    group,
    setBuilt(v) {
      u.uBuilt.value = v;
      edgeU.uBuilt.value = v;
      hullMat.opacity = 0.85 * Math.min(1, gain * v * 1.2) * body;
    },
    setGain(v) {
      gain = v;
      u.uGain.value = v;
      edgeU.uGain.value = v * (0.4 + 0.6 * body);
      hullMat.opacity = 0.85 * Math.min(1, v * u.uBuilt.value * 1.2) * body;
      group.visible = v > 0.003;
    },
    setBody(v) {
      body = v;
      edgeU.uGain.value = gain * (0.4 + 0.6 * body);
      hullMat.opacity = 0.85 * Math.min(1, gain * u.uBuilt.value * 1.2) * body;
    },
    update(t) {
      u.uTime.value = t;
      edgeU.uTime.value = t;
    },
    dispose() {
      merged.dispose();
      hullMat.dispose();
      edgeGeo.dispose();
      edgeMat.dispose();
      geo.dispose();
      mat.dispose();
    },
  };
}
