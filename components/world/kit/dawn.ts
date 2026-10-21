import * as THREE from "three";

/* ─────────────────────────────────────────────────────────────────────────
   DAWN — a sun coming up on the horizon, and the glow of the sky around it. Two soft shader quads (no dots: this is
   the one thing in the world that is light rather than a scan), drawn behind everything else.
   ───────────────────────────────────────────────────────────────────────── */

const VERT = /* glsl */ `
  varying vec2 vUv;
  varying float vWorldY;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorldY = w.y;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const SUN_FRAG = /* glsl */ `
  uniform float uGain, uHorizon, uTime;
  varying vec2 vUv;
  varying float vWorldY;
  void main() {
    vec2 p = (vUv - 0.5) * 2.0 * 3.0;       // in units of the sun's radius
    float d = length(p);
    float disc = smoothstep(1.0, 0.94, d);
    float rim = smoothstep(0.55, 1.0, d);
    float halo = exp(-pow(max(d - 1.0, 0.0) * 1.15, 1.1)) * (1.0 - disc);
    halo *= smoothstep(3.0, 1.9, max(abs(p.x), abs(p.y)));
    vec3 core = mix(vec3(1.0, 0.95, 0.82), vec3(1.0, 0.62, 0.3), rim);
    vec3 col = mix(vec3(1.0, 0.4, 0.16), core, disc);
    float a = disc * 0.95 + halo * 0.42;
    float clip = smoothstep(uHorizon, uHorizon + 3.0, vWorldY);
    a *= clip * uGain * (0.96 + 0.04 * sin(uTime * 0.9));
    if (a < 0.003) discard;
    gl_FragColor = vec4(col, a);
  }
`;

const GLOW_FRAG = /* glsl */ `
  uniform float uGain, uHorizon;
  varying vec2 vUv;
  varying float vWorldY;
  void main() {
    float x = (vUv.x - 0.5) * 2.0;
    float up = max(vUv.y - 0.32, 0.0) / 0.68;
    float down = max(0.32 - vUv.y, 0.0) / 0.32;
    float band = exp(-pow(up * 2.4, 1.3)) * exp(-x * x * 1.6);
    float below = (1.0 - down) * 0.35;
    float a = (vUv.y >= 0.32 ? band : below * exp(-x * x * 1.6)) * uGain * 0.55;
    a *= smoothstep(1.0, 0.62, abs(x)) * smoothstep(1.0, 0.6, up);
    vec3 col = mix(vec3(1.0, 0.36, 0.16), vec3(1.0, 0.72, 0.42), exp(-up * 3.0));
    if (a < 0.003) discard;
    gl_FragColor = vec4(col, a);
  }
`;

export type Dawn = {
  group: THREE.Group;
  /** Brightness (0 = unseen). */
  setGain(v: number): void;
  /** 0 = below the horizon, 1 = well clear of it; `lift` carries it higher still (in sun radii). */
  setRise(v: number, lift?: number): void;
  update(t: number): void;
  dispose(): void;
};

/** `radius` is the sun's, in metres; the group is placed at the horizon point and turned to face the camera by the caller. */
export function createDawn(radius: number): Dawn {
  const group = new THREE.Group();
  const horizonY = { value: 0 };
  const gain = { value: 0 };
  const time = { value: 0 };

  const common = { transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide } as const;
  const glowMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: GLOW_FRAG, uniforms: { uGain: gain, uHorizon: horizonY }, ...common });
  const sunMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: SUN_FRAG, uniforms: { uGain: gain, uHorizon: horizonY, uTime: time }, ...common });

  const glowGeo = new THREE.PlaneGeometry(radius * 16, radius * 8);
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.position.y = radius * 8 * (0.5 - 0.32);
  glow.renderOrder = -3;
  glow.frustumCulled = false;
  const sunGeo = new THREE.PlaneGeometry(radius * 6, radius * 6);
  const sun = new THREE.Mesh(sunGeo, sunMat);
  sun.renderOrder = -2;
  sun.frustumCulled = false;
  group.add(glow, sun);
  const tmp = new THREE.Vector3();

  return {
    group,
    setGain(v) {
      gain.value = v;
      group.visible = v > 0.003;
    },
    setRise(v, lift = 0) {
      sun.position.y = -radius * 0.95 + radius * (1.5 + lift) * v;
    },
    update(t) {
      time.value = t;
      group.getWorldPosition(tmp);
      horizonY.value = tmp.y;
    },
    dispose() {
      glowGeo.dispose();
      sunGeo.dispose();
      glowMat.dispose();
      sunMat.dispose();
    },
  };
}
