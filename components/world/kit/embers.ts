import * as THREE from "three";
import { hash2 } from "@/lib/terrain";

/* ─────────────────────────────────────────────────────────────────────────
   EMBERS — a drifting field of sparks that always surrounds the camera. All motion is in the shader (nothing is
   updated on the CPU): each spark rises, wanders in the wind and is wrapped into a box centred on the camera.
   Vermilion near the ground; the tint shifts to ice up in the sky.
   ───────────────────────────────────────────────────────────────────────── */

const VERT = /* glsl */ `
  uniform float uTime, uPxPerUnit, uIntensity, uTint, uSize, uRise;
  uniform vec3 uCam, uBox;
  attribute vec4 aRand;
  varying float vA;
  varying vec3 vCol;
  void main() {
    vec4 r = aRand;
    vec3 p = r.xyz * uBox;
    float spd = (0.25 + r.w * 0.9) * uRise;
    p.y += uTime * spd;
    p.x += sin(uTime * 0.37 + r.x * 40.0) * 1.6 + uTime * 0.28;
    p.z += cos(uTime * 0.29 + r.z * 40.0) * 1.3;
    vec3 rel = mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5;
    vec4 mv = viewMatrix * vec4(uCam + rel, 1.0);
    float depth = max(0.5, -mv.z);
    gl_Position = projectionMatrix * mv;

    float tw = 0.55 + 0.45 * sin(uTime * (1.3 + r.w * 3.0) + r.x * 90.0);
    float far = 1.0 - smoothstep(0.28, 0.5, length(rel) / max(uBox.x, uBox.y));
    float near = smoothstep(1.2, 4.0, depth);
    vA = uIntensity * tw * far * near * (0.35 + 0.65 * r.y);

    vec3 hot = mix(vec3(1.0, 0.33, 0.14), vec3(1.0, 0.8, 0.58), tw * 0.55);
    vec3 cold = mix(vec3(0.5, 0.78, 1.0), vec3(0.9, 0.97, 1.0), tw * 0.5);
    vCol = mix(hot, cold, uTint);
    gl_PointSize = clamp(uSize * uPxPerUnit / depth * (0.6 + r.w), 1.2, 7.0);
  }
`;

const FRAG = /* glsl */ `
  varying float vA;
  varying vec3 vCol;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d2 = dot(c, c) * 4.0;
    float a = vA * (0.7 * exp(-d2 * 3.6) + 0.3 * smoothstep(0.42, 0.0, d2));
    if (a < 0.004) discard;
    gl_FragColor = vec4(vCol, a);
  }
`;

export type Embers = {
  points: THREE.Points;
  uniforms: { uTime: THREE.IUniform<number>; uIntensity: THREE.IUniform<number>; uTint: THREE.IUniform<number>; uSize: THREE.IUniform<number>; uRise: THREE.IUniform<number>; uCam: THREE.IUniform<THREE.Vector3>; uBox: THREE.IUniform<THREE.Vector3> };
  dispose(): void;
};

export function createEmbers(opts: { count: number; box: [number, number, number]; pxPerUnit: THREE.IUniform<number> }): Embers {
  const n = opts.count;
  const a = new Float32Array(n * 4);
  const pos = new Float32Array(n * 3); // unused by the shader, but three needs a position attribute to draw
  for (let i = 0; i < n; i++) {
    a[i * 4] = hash2(i, 1, 311);
    a[i * 4 + 1] = hash2(i, 2, 311);
    a[i * 4 + 2] = hash2(i, 3, 311);
    a[i * 4 + 3] = hash2(i, 4, 311);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aRand", new THREE.BufferAttribute(a, 4));
  const uniforms = {
    uTime: { value: 0 },
    uPxPerUnit: opts.pxPerUnit,
    uIntensity: { value: 1 },
    uTint: { value: 0 },
    uSize: { value: 0.075 },
    uRise: { value: 1 },
    uCam: { value: new THREE.Vector3() },
    uBox: { value: new THREE.Vector3(...opts.box) },
  };
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 20;
  return {
    points,
    uniforms: uniforms as unknown as Embers["uniforms"],
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
